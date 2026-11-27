import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

Object.assign(process.env, {
  PORT: '3000', NODE_ENV: 'test', CORS_ORIGIN: 'http://localhost:5173',
  AI_SERVICE_URL: 'http://127.0.0.1:8001', AI_SERVICE_TIMEOUT_MS: '5000',
  DATABASE_URL: 'postgresql://test:example-password@127.0.0.1:5433/onusai',
  DATABASE_CONNECTION_TIMEOUT_MS: '5000', DATABASE_IDLE_TIMEOUT_MS: '30000',
  DATABASE_QUERY_TIMEOUT_MS: '5000',
});

const { hashPassword, verifyDummyPassword, verifyPassword } = await import('../dist/utils/password.js');
const { generateOpaqueToken, hashToken, safeTokenMatchesHash } = await import('../dist/utils/tokens.js');
const { parseCookies } = await import('../dist/utils/cookies.js');
const { validateLoginInput, validateUuid } = await import('../dist/modules/auth/auth.validation.js');
const { buildCsrfCookieOptions, buildSessionCookieOptions } = await import('../dist/modules/auth/auth.constants.js');
const { requireAuth, requireCsrf } = await import('../dist/middlewares/auth.js');
const { HttpError } = await import('../dist/utils/http-error.js');

test('scrypt password hashing uses random salts and constant-time verification', async () => {
  const password = 'correct-horse-battery-staple!';
  const firstHash = await hashPassword(password);
  const secondHash = await hashPassword(password);

  assert.notEqual(firstHash, secondHash);
  assert.match(firstHash, /^scrypt\$N=16384,r=8,p=1\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$/);
  assert.equal(await verifyPassword(password, firstHash), true);
  assert.equal(await verifyPassword(password, secondHash), true);
  assert.equal(await verifyPassword('wrong-password', firstHash), false);
  assert.equal(await verifyPassword('', firstHash), false);
  assert.ok(!firstHash.includes(password));
});

test('scrypt verification rejects malformed hashes and unsafe parameters', async () => {
  for (const invalidHash of [
    '',
    'plaintext-password',
    'scrypt$N=4096,r=8,p=1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    'scrypt$N=16385,r=8,p=1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    'scrypt$N=16384,r=8,p=1$short$short',
  ]) {
    assert.equal(await verifyPassword('any-password', invalidHash), false);
  }
  await assert.rejects(hashPassword(''), /Password must not be empty/);
  await verifyDummyPassword('any-password');
});

test('opaque tokens and SHA-256 hashes compare in constant time', () => {
  const token = generateOpaqueToken();
  const secondToken = generateOpaqueToken();
  assert.notEqual(token, secondToken);
  assert.ok(token.length >= 43);

  const digest = hashToken(token);
  assert.match(digest, /^[0-9a-f]{64}$/);
  assert.equal(safeTokenMatchesHash(token, digest), true);
  assert.equal(safeTokenMatchesHash(secondToken, digest), false);
  assert.equal(safeTokenMatchesHash('', digest), false);
  assert.equal(safeTokenMatchesHash(token, 'not-a-hex-digest'), false);
});

test('cookie parser handles multiple cookies, equals signs, encoded values, and malformed escapes', () => {
  assert.deepEqual(parseCookies(undefined), {});
  assert.deepEqual(parseCookies(''), {});
  assert.deepEqual(
    parseCookies('onusai_session=abc%3D123; onusai_csrf=xyz==; broken=%ZZ; =ignored'),
    { onusai_session: 'abc=123', onusai_csrf: 'xyz==', broken: '%ZZ' },
  );
});

test('login validation normalizes email, preserves password spaces, and rejects extra fields', () => {
  assert.deepEqual(
    validateLoginInput({ email: '  Alice@Example.Test ', password: ' secret with spaces ' }),
    { email: 'alice@example.test', password: ' secret with spaces ' },
  );

  for (const body of [
    null,
    [],
    'string',
    { email: 'alice@example.test' },
    { email: 'alice@example.test', password: 'secret', role: 'owner' },
    { email: 'invalid-email', password: 'secret' },
    { email: 'alice@example.test', password: '' },
    { email: 'alice@example.test', password: 'x'.repeat(129) },
  ]) {
    assert.throws(() => validateLoginInput(body), HttpError);
  }

  assert.equal(validateUuid('550E8400-E29B-41D4-A716-446655440000', 'businessId'), '550e8400-e29b-41d4-a716-446655440000');
  assert.throws(() => validateUuid('not-a-uuid', 'businessId'), HttpError);
});

test('cookie builders disable Secure outside production and require Secure in production', () => {
  assert.equal(buildSessionCookieOptions(1000).httpOnly, true);
  assert.equal(buildSessionCookieOptions(1000).sameSite, 'lax');
  assert.equal(buildSessionCookieOptions(1000).path, '/api/v1');
  assert.equal(buildSessionCookieOptions(1000).secure, false);
  assert.equal(buildCsrfCookieOptions(1000).httpOnly, false);
  assert.equal(buildCsrfCookieOptions(1000).secure, false);

  const backendDirectory = fileURLToPath(new URL('../', import.meta.url));
  const result = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      "import { buildSessionCookieOptions, buildCsrfCookieOptions } from './dist/modules/auth/auth.constants.js'; console.log(JSON.stringify({ sessionSecure: buildSessionCookieOptions(1000).secure, csrfSecure: buildCsrfCookieOptions(1000).secure }));",
    ],
    {
      cwd: backendDirectory,
      env: { ...process.env, NODE_ENV: 'production' },
      encoding: 'utf8',
    },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout.trim()), { sessionSecure: true, csrfSecure: true });
});

test('requireAuth and requireCsrf enforce session cookies and CSRF tokens', async () => {
  const headers = new Map();
  let nextError;
  await requireAuth(
    { headers: {} },
    { set(name, value) { headers.set(name, value); } },
    (error) => { nextError = error; },
  );
  assert.equal(nextError.statusCode, 401);
  assert.equal(nextError.code, 'AUTHENTICATION_REQUIRED');
  assert.equal(headers.get('Cache-Control'), 'no-store');

  const csrfToken = generateOpaqueToken();
  const csrfTokenHash = hashToken(csrfToken);
  const authReq = {
    method: 'POST',
    auth: { user: { id: 'u1', email: 'a@b.test', displayName: 'A' }, session: { id: 's1', csrfTokenHash, expiresAt: new Date() } },
    header(name) { return name === 'x-csrf-token' ? csrfToken : undefined; },
  };
  let passed = false;
  requireCsrf(authReq, {}, (error) => { passed = error === undefined; });
  assert.equal(passed, true);

  let csrfError;
  requireCsrf(
    { ...authReq, header: () => 'wrong-csrf-token' },
    {},
    (error) => { csrfError = error; },
  );
  assert.equal(csrfError.statusCode, 403);
  assert.equal(csrfError.code, 'CSRF_TOKEN_INVALID');

  let safePassed = false;
  requireCsrf({ ...authReq, method: 'GET', header: () => undefined }, {}, (error) => { safePassed = error === undefined; });
  assert.equal(safePassed, true);
});

