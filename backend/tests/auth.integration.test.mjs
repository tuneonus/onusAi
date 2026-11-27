import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';

const databaseUrl = process.env.TEST_DATABASE_URL;
const backendDirectory = fileURLToPath(new URL('../', import.meta.url));

function extractCookies(response) {
  const cookies = {};
  for (const header of response.headers.getSetCookie()) {
    const [pair] = header.split(';');
    const separator = pair.indexOf('=');
    if (separator > 0) {
      cookies[pair.slice(0, separator)] = pair.slice(separator + 1);
    }
  }
  return cookies;
}

function runSeedCli(t, envOverrides) {
  const child = spawn(process.execPath, [join(backendDirectory, 'dist/seed-staff.js')], {
    cwd: backendDirectory,
    env: {
      ...process.env, PORT: '3000', NODE_ENV: 'test', CORS_ORIGIN: 'http://localhost:5173',
      AI_SERVICE_URL: 'http://127.0.0.1:8001', AI_SERVICE_TIMEOUT_MS: '5000',
      DATABASE_CONNECTION_TIMEOUT_MS: '2000', DATABASE_IDLE_TIMEOUT_MS: '1000',
      DATABASE_QUERY_TIMEOUT_MS: '5000',
      ...envOverrides,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk; });
  child.stderr.on('data', (chunk) => { output += chunk; });
  const exited = once(child, 'exit');
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    await exited;
  });
  return { exited, output: () => output };
}

test('live authentication, sessions, CSRF, RBAC, and tenant isolation', {
  skip: !databaseUrl, timeout: 45_000,
}, async (t) => {
  const schema = `onusai_auth_test_${randomUUID().replaceAll('-', '')}`;
  const observer = new Pool({
    connectionString: databaseUrl, connectionTimeoutMillis: 2000,
    query_timeout: 5000, statement_timeout: 5000,
  });
  let closeDatabasePool;
  let schemaCreated = false;
  t.after(async () => {
    try {
      if (closeDatabasePool) {
        await closeDatabasePool();
      }
      if (schemaCreated) {
        await observer.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      }
    } finally {
      await observer.end();
    }
  });
  await observer.query(`CREATE SCHEMA "${schema}"`);
  schemaCreated = true;

  const scopedUrl = new URL(databaseUrl);
  const originalOptions = scopedUrl.searchParams.get('options') ?? '';
  scopedUrl.searchParams.set('options', `${originalOptions} -c search_path=${schema},pg_catalog`.trim());

  Object.assign(process.env, {
    PORT: '3000', NODE_ENV: 'test', CORS_ORIGIN: 'http://localhost:5173',
    AI_SERVICE_URL: 'http://127.0.0.1:8001', AI_SERVICE_TIMEOUT_MS: '5000',
    DATABASE_URL: scopedUrl.href, DATABASE_CONNECTION_TIMEOUT_MS: '2000',
    DATABASE_IDLE_TIMEOUT_MS: '1000', DATABASE_QUERY_TIMEOUT_MS: '5000',
    AUTH_SESSION_TTL_MS: '60000', AUTH_LOGIN_MAX_ATTEMPTS: '3',
    AUTH_LOGIN_WINDOW_MS: '60000', AUTH_LOGIN_LOCKOUT_MS: '60000',
  });

  const postgresModule = await import('../dist/integrations/database/postgres.js');
  const { postgresPool } = postgresModule;
  closeDatabasePool = postgresModule.closeDatabasePool;
  const { runMigrations } = await import('../dist/integrations/database/migrations.js');
  const { hashPassword } = await import('../dist/utils/password.js');
  const { app } = await import('../dist/app.js');

  await runMigrations();

  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  // Seed two isolated businesses, staff users, and locations; also keep a legacy user without credentials.
  const alicePassword = `Alice-Secret-${randomUUID()}`;
  const bobPassword = `Bob-Secret-${randomUUID()}`;
  const carolPassword = `Carol-Secret-${randomUUID()}`;

  const seedAlice = runSeedCli(t, {
    DATABASE_URL: scopedUrl.href,
    SEED_STAFF_EMAIL: 'Alice@Example.Test',
    SEED_STAFF_DISPLAY_NAME: 'Alice Owner',
    SEED_STAFF_PASSWORD: alicePassword,
    SEED_BUSINESS_NAME: 'Alpha Dental',
    SEED_STAFF_ROLE: 'owner',
    SEED_LOCATION_NAME: 'Alpha Downtown',
  });
  const [seedCode, seedSignal] = await seedAlice.exited;
  assert.equal(seedCode, 0, seedAlice.output());
  assert.equal(seedSignal, null);
  assert.ok(!seedAlice.output().includes(alicePassword));
  assert.ok(!seedAlice.output().includes(scopedUrl.href));

  const alphaBusinessId = (await postgresPool.query("SELECT id FROM businesses WHERE name = 'Alpha Dental'")).rows[0].id;
  const betaBusinessId = (await postgresPool.query("INSERT INTO businesses (name) VALUES ('Beta Studio') RETURNING id")).rows[0].id;
  await postgresPool.query("INSERT INTO business_locations (business_id, name) VALUES ($1, 'Beta North')", [betaBusinessId]);

  const aliceId = (await postgresPool.query("SELECT id FROM users WHERE lower(email) = 'alice@example.test'")).rows[0].id;
  await postgresPool.query("INSERT INTO business_members (business_id, user_id, role) VALUES ($1, $2, 'operator')", [betaBusinessId, aliceId]);

  const bobId = (await postgresPool.query("INSERT INTO users (email, display_name) VALUES ('bob@example.test', 'Bob Operator') RETURNING id")).rows[0].id;
  await postgresPool.query('INSERT INTO user_credentials (user_id, password_hash) VALUES ($1, $2)', [bobId, await hashPassword(bobPassword)]);
  await postgresPool.query("INSERT INTO business_members (business_id, user_id, role) VALUES ($1, $2, 'operator')", [alphaBusinessId, bobId]);

  const carolId = (await postgresPool.query("INSERT INTO users (email, display_name) VALUES ('carol@example.test', 'Carol Owner') RETURNING id")).rows[0].id;
  await postgresPool.query('INSERT INTO user_credentials (user_id, password_hash) VALUES ($1, $2)', [carolId, await hashPassword(carolPassword)]);
  await postgresPool.query("INSERT INTO business_members (business_id, user_id, role) VALUES ($1, $2, 'owner')", [betaBusinessId, carolId]);

  // Preserve an existing user created without credentials (must not be able to log in).
  await postgresPool.query("INSERT INTO users (email, display_name) VALUES ('legacy@example.test', 'Legacy User')");

  await t.test('seed CLI rejects production mode and weak passwords without exposing secrets', async (subtest) => {
    const prodRun = runSeedCli(subtest, {
      NODE_ENV: 'production',
      DATABASE_URL: scopedUrl.href,
      SEED_STAFF_EMAIL: 'prod@example.test',
      SEED_STAFF_DISPLAY_NAME: 'Prod',
      SEED_STAFF_PASSWORD: alicePassword,
    });
    const [prodCode] = await prodRun.exited;
    assert.equal(prodCode, 1);
    assert.match(prodRun.output(), /disabled|cannot run when NODE_ENV=production/i);
    assert.ok(!prodRun.output().includes(alicePassword));

    const weakPassword = 'too-short';
    const weakRun = runSeedCli(subtest, {
      DATABASE_URL: scopedUrl.href,
      SEED_STAFF_EMAIL: 'weak@example.test',
      SEED_STAFF_DISPLAY_NAME: 'Weak',
      SEED_STAFF_PASSWORD: weakPassword,
    });
    const [weakCode] = await weakRun.exited;
    assert.equal(weakCode, 1);
    assert.match(weakRun.output(), /SEED_STAFF_PASSWORD must be between 12 and 128/);
    assert.ok(!weakRun.output().includes(weakPassword));
  });

  await t.test('login issues HttpOnly session cookies, stores only hashes in PostgreSQL, and supports /me and logout', async () => {
    const loginRes = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: '  ALICE@EXAMPLE.TEST ', password: alicePassword }),
    });
    assert.equal(loginRes.status, 200);
    assert.equal(loginRes.headers.get('cache-control'), 'no-store');

    const setCookies = loginRes.headers.getSetCookie();
    const sessionHeader = setCookies.find((header) => header.startsWith('onusai_session='));
    const csrfHeader = setCookies.find((header) => header.startsWith('onusai_csrf='));
    assert.ok(sessionHeader && sessionHeader.includes('HttpOnly') && sessionHeader.includes('SameSite=Lax') && sessionHeader.includes('Path=/api/v1'));
    assert.ok(csrfHeader && !csrfHeader.includes('HttpOnly') && csrfHeader.includes('SameSite=Lax'));

    const cookies = extractCookies(loginRes);
    const loginBody = await loginRes.json();
    assert.equal(loginBody.user.email, 'alice@example.test');
    assert.equal(loginBody.memberships.length, 2);
    assert.equal(loginBody.session.csrfToken, cookies.onusai_csrf);
    assert.ok(!JSON.stringify(loginBody).includes(alicePassword));
    assert.ok(!JSON.stringify(loginBody).includes(cookies.onusai_session));

    // Database must hold only hashes, never plaintext passwords or raw session/CSRF tokens.
    const storedCredential = await postgresPool.query('SELECT password_hash FROM user_credentials WHERE user_id = $1', [aliceId]);
    assert.match(storedCredential.rows[0].password_hash, /^scrypt\$/);
    assert.ok(!storedCredential.rows[0].password_hash.includes(alicePassword));

    const storedSession = await postgresPool.query('SELECT token_hash, csrf_token_hash, revoked_at FROM staff_sessions WHERE user_id = $1', [aliceId]);
    assert.equal(storedSession.rows.length, 1);
    assert.match(storedSession.rows[0].token_hash, /^[0-9a-f]{64}$/);
    assert.match(storedSession.rows[0].csrf_token_hash, /^[0-9a-f]{64}$/);
    assert.notEqual(storedSession.rows[0].token_hash, cookies.onusai_session);
    assert.notEqual(storedSession.rows[0].csrf_token_hash, cookies.onusai_csrf);
    assert.equal(storedSession.rows[0].revoked_at, null);

    // /me verifies active session and echoes CSRF token when matching cookie is sent.
    const meRes = await fetch(`${baseUrl}/api/v1/auth/me`, {
      headers: { cookie: `onusai_session=${cookies.onusai_session}; onusai_csrf=${cookies.onusai_csrf}` },
    });
    assert.equal(meRes.status, 200);
    assert.equal(meRes.headers.get('cache-control'), 'no-store');
    const meBody = await meRes.json();
    assert.equal(meBody.user.id, aliceId);
    assert.equal(meBody.session.csrfToken, cookies.onusai_csrf);

    // Logout without or with wrong CSRF token must be rejected without revoking the session.
    const missingCsrfLogout = await fetch(`${baseUrl}/api/v1/auth/logout`, {
      method: 'POST',
      headers: { cookie: `onusai_session=${cookies.onusai_session}` },
    });
    assert.equal(missingCsrfLogout.status, 403);
    assert.equal((await missingCsrfLogout.json()).error.code, 'CSRF_TOKEN_INVALID');

    const badCsrfLogout = await fetch(`${baseUrl}/api/v1/auth/logout`, {
      method: 'POST',
      headers: {
        cookie: `onusai_session=${cookies.onusai_session}`,
        'x-csrf-token': 'forged-csrf-token',
      },
    });
    assert.equal(badCsrfLogout.status, 403);
    assert.equal((await badCsrfLogout.json()).error.code, 'CSRF_TOKEN_INVALID');

    // Valid logout revokes the session in PostgreSQL and clears cookies.
    const logoutRes = await fetch(`${baseUrl}/api/v1/auth/logout`, {
      method: 'POST',
      headers: {
        cookie: `onusai_session=${cookies.onusai_session}`,
        'x-csrf-token': loginBody.session.csrfToken,
      },
    });
    assert.equal(logoutRes.status, 200);
    assert.ok(logoutRes.headers.getSetCookie().some((header) => header.startsWith('onusai_session=;')));

    const revokedRow = await postgresPool.query('SELECT revoked_at FROM staff_sessions WHERE user_id = $1', [aliceId]);
    assert.ok(revokedRow.rows[0].revoked_at instanceof Date);

    // Reusing the revoked session cookie must fail with 401 and clear the cookie.
    const afterLogoutMe = await fetch(`${baseUrl}/api/v1/auth/me`, {
      headers: { cookie: `onusai_session=${cookies.onusai_session}` },
    });
    assert.equal(afterLogoutMe.status, 401);
    assert.equal((await afterLogoutMe.json()).error.code, 'AUTHENTICATION_REQUIRED');
    assert.ok(afterLogoutMe.headers.getSetCookie().some((header) => header.startsWith('onusai_session=;')));
  });

  await t.test('expired and forged sessions are rejected', async () => {
    const loginRes = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'bob@example.test', password: bobPassword }),
    });
    const bobCookies = extractCookies(loginRes);
    await loginRes.arrayBuffer();

    // Expire Bob's session in PostgreSQL while preserving the expires_at > created_at check constraint.
    await postgresPool.query(
      "UPDATE staff_sessions SET created_at = CURRENT_TIMESTAMP - interval '10 minutes', expires_at = CURRENT_TIMESTAMP - interval '1 second' WHERE user_id = $1",
      [bobId],
    );

    const expiredRes = await fetch(`${baseUrl}/api/v1/auth/me`, {
      headers: { cookie: `onusai_session=${bobCookies.onusai_session}` },
    });
    assert.equal(expiredRes.status, 401);
    assert.equal((await expiredRes.json()).error.code, 'AUTHENTICATION_REQUIRED');

    const forgedRes = await fetch(`${baseUrl}/api/v1/businesses`, {
      headers: { cookie: 'onusai_session=completely-forged-token' },
    });
    assert.equal(forgedRes.status, 401);
    assert.equal((await forgedRes.json()).error.code, 'AUTHENTICATION_REQUIRED');
  });

  await t.test('invalid credentials use generic errors and trigger brute-force lockouts', async () => {
    for (const payload of [
      { email: 'bob@example.test', password: 'wrong-password' },
      { email: 'unknown@example.test', password: 'wrong-password' },
      { email: 'legacy@example.test', password: 'any-password-123' },
    ]) {
      const res = await fetch(`${baseUrl}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      assert.equal(res.status, 401);
      assert.deepEqual(await res.json(), {
        error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password.' },
      });
    }

    // Two more failures on bob@example.test reach AUTH_LOGIN_MAX_ATTEMPTS = 3 and lock out.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const res = await fetch(`${baseUrl}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'bob@example.test', password: 'wrong-password' }),
      });
      assert.equal(res.status, 401);
      await res.arrayBuffer();
    }

    const lockedOut = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'bob@example.test', password: bobPassword }),
    });
    assert.equal(lockedOut.status, 429);
    assert.ok(Number(lockedOut.headers.get('retry-after')) >= 1);
    assert.equal((await lockedOut.json()).error.code, 'TOO_MANY_LOGIN_ATTEMPTS');

    // Clear lockouts for subsequent RBAC tests using bob.
    await postgresPool.query('DELETE FROM auth_login_attempts');
  });

  await t.test('owner/operator permissions and two-tenant isolation reject cross-tenant and forged claims', async () => {
    async function loginAs(email, password) {
      const res = await fetch(`${baseUrl}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      assert.equal(res.status, 200);
      const cookies = extractCookies(res);
      await res.arrayBuffer();
      return `onusai_session=${cookies.onusai_session}; onusai_csrf=${cookies.onusai_csrf}`;
    }

    const aliceCookie = await loginAs('alice@example.test', alicePassword);
    const bobCookie = await loginAs('bob@example.test', bobPassword);
    const carolCookie = await loginAs('carol@example.test', carolPassword);

    // Bob only sees Alpha Dental in his business list.
    const bobBusinesses = await (await fetch(`${baseUrl}/api/v1/businesses`, {
      headers: { cookie: bobCookie },
    })).json();
    assert.deepEqual(bobBusinesses.businesses.map((b) => b.businessId), [alphaBusinessId]);

    // Bob (operator in Alpha) can read Alpha overview & locations, but not Alpha members (owner-only).
    const bobAlpha = await fetch(`${baseUrl}/api/v1/businesses/${alphaBusinessId}`, {
      headers: { cookie: bobCookie },
    });
    assert.equal(bobAlpha.status, 200);
    assert.equal((await bobAlpha.json()).membership.role, 'operator');

    const bobAlphaLocations = await fetch(`${baseUrl}/api/v1/businesses/${alphaBusinessId}/locations`, {
      headers: { cookie: bobCookie },
    });
    assert.equal(bobAlphaLocations.status, 200);
    assert.deepEqual((await bobAlphaLocations.json()).locations.map((l) => l.name), ['Alpha Downtown']);

    const bobAlphaMembers = await fetch(`${baseUrl}/api/v1/businesses/${alphaBusinessId}/members`, {
      headers: { cookie: bobCookie, 'x-role': 'owner' },
    });
    assert.equal(bobAlphaMembers.status, 403);
    assert.equal((await bobAlphaMembers.json()).error.code, 'INSUFFICIENT_PERMISSIONS');

    // Bob cannot access Beta Studio even with forged headers or query parameters.
    for (const url of [
      `${baseUrl}/api/v1/businesses/${betaBusinessId}`,
      `${baseUrl}/api/v1/businesses/${betaBusinessId}/locations?businessId=${alphaBusinessId}`,
      `${baseUrl}/api/v1/businesses/${betaBusinessId}/members`,
    ]) {
      const denied = await fetch(url, {
        headers: {
          cookie: bobCookie,
          'x-business-id': alphaBusinessId,
          'x-role': 'owner',
        },
      });
      assert.equal(denied.status, 403);
      assert.equal((await denied.json()).error.code, 'TENANT_ACCESS_DENIED');
    }

    // Alice is owner in Alpha (can read members) and operator in Beta (cannot read Beta members).
    const aliceAlphaMembers = await fetch(`${baseUrl}/api/v1/businesses/${alphaBusinessId}/members`, {
      headers: { cookie: aliceCookie },
    });
    assert.equal(aliceAlphaMembers.status, 200);
    assert.equal((await aliceAlphaMembers.json()).members.length, 2);

    const aliceBetaLocations = await fetch(`${baseUrl}/api/v1/businesses/${betaBusinessId}/locations`, {
      headers: { cookie: aliceCookie },
    });
    assert.equal(aliceBetaLocations.status, 200);
    assert.deepEqual((await aliceBetaLocations.json()).locations.map((l) => l.name), ['Beta North']);

    const aliceBetaMembers = await fetch(`${baseUrl}/api/v1/businesses/${betaBusinessId}/members`, {
      headers: { cookie: aliceCookie },
    });
    assert.equal(aliceBetaMembers.status, 403);
    assert.equal((await aliceBetaMembers.json()).error.code, 'INSUFFICIENT_PERMISSIONS');

    // Carol (owner in Beta) can read Beta members, but cannot access Alpha.
    const carolBetaMembers = await fetch(`${baseUrl}/api/v1/businesses/${betaBusinessId}/members`, {
      headers: { cookie: carolCookie },
    });
    assert.equal(carolBetaMembers.status, 200);
    assert.equal((await carolBetaMembers.json()).members.length, 2);

    const carolAlpha = await fetch(`${baseUrl}/api/v1/businesses/${alphaBusinessId}`, {
      headers: { cookie: carolCookie },
    });
    assert.equal(carolAlpha.status, 403);
    assert.equal((await carolAlpha.json()).error.code, 'TENANT_ACCESS_DENIED');

    // Non-existent UUID and invalid UUID checks.
    const unknownBusiness = await fetch(`${baseUrl}/api/v1/businesses/${randomUUID()}`, {
      headers: { cookie: carolCookie },
    });
    assert.equal(unknownBusiness.status, 403);
    assert.equal((await unknownBusiness.json()).error.code, 'TENANT_ACCESS_DENIED');

    const invalidUuid = await fetch(`${baseUrl}/api/v1/businesses/not-a-uuid`, {
      headers: { cookie: carolCookie },
    });
    assert.equal(invalidUuid.status, 400);
    assert.equal((await invalidUuid.json()).error.code, 'VALIDATION_ERROR');
  });
});

