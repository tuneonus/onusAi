import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { test } from 'node:test';
import { Pool } from 'pg';

const databaseUrl = process.env.TEST_DATABASE_URL;

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

const sampleHours = {
  monday: { closed: false, open: '09:00', close: '18:00' },
  tuesday: { closed: false, open: '09:00', close: '18:00' },
  wednesday: { closed: false, open: '09:00', close: '18:00' },
  thursday: { closed: false, open: '09:00', close: '18:00' },
  friday: { closed: false, open: '18:00', close: '02:00' },
  saturday: { closed: false, open: '10:00', close: '16:00' },
  sunday: { closed: true },
};

test('live business profile and location CRUD, validation, CSRF, RBAC, and tenant isolation', {
  skip: !databaseUrl,
  timeout: 45_000,
}, async (t) => {
  const schema = `onusai_biz_test_${randomUUID().replaceAll('-', '')}`;
  const observer = new Pool({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 2000,
    query_timeout: 5000,
    statement_timeout: 5000,
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
    PORT: '3000',
    NODE_ENV: 'test',
    CORS_ORIGIN: 'http://localhost:5173',
    AI_SERVICE_URL: 'http://127.0.0.1:8001',
    AI_SERVICE_TIMEOUT_MS: '5000',
    DATABASE_URL: scopedUrl.href,
    DATABASE_CONNECTION_TIMEOUT_MS: '2000',
    DATABASE_IDLE_TIMEOUT_MS: '1000',
    DATABASE_QUERY_TIMEOUT_MS: '5000',
    AUTH_SESSION_TTL_MS: '60000',
    AUTH_LOGIN_MAX_ATTEMPTS: '5',
    AUTH_LOGIN_WINDOW_MS: '60000',
    AUTH_LOGIN_LOCKOUT_MS: '60000',
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
  t.after(() => new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  const ownerAlphaPassword = `Alpha-Owner-${randomUUID()}`;
  const operatorAlphaPassword = `Alpha-Op-${randomUUID()}`;
  const ownerBetaPassword = `Beta-Owner-${randomUUID()}`;

  const alphaBusinessId = (
    await postgresPool.query("INSERT INTO businesses (name) VALUES ('Alpha Wellness') RETURNING id")
  ).rows[0].id;
  const betaBusinessId = (
    await postgresPool.query("INSERT INTO businesses (name) VALUES ('Beta Bistro') RETURNING id")
  ).rows[0].id;
  const betaLocationId = (
    await postgresPool.query(
      "INSERT INTO business_locations (business_id, name, timezone) VALUES ($1, 'Beta Patio', 'Europe/London') RETURNING id",
      [betaBusinessId],
    )
  ).rows[0].id;

  async function createStaffUser(email, displayName, password, businessId, role) {
    const userId = (
      await postgresPool.query(
        'INSERT INTO users (email, display_name) VALUES ($1, $2) RETURNING id',
        [email, displayName],
      )
    ).rows[0].id;
    await postgresPool.query(
      'INSERT INTO user_credentials (user_id, password_hash) VALUES ($1, $2)',
      [userId, await hashPassword(password)],
    );
    await postgresPool.query(
      'INSERT INTO business_members (business_id, user_id, role) VALUES ($1, $2, $3)',
      [businessId, userId, role],
    );
    return userId;
  }

  await createStaffUser('alpha-owner@example.test', 'Alpha Owner', ownerAlphaPassword, alphaBusinessId, 'owner');
  await createStaffUser('alpha-op@example.test', 'Alpha Operator', operatorAlphaPassword, alphaBusinessId, 'operator');
  await createStaffUser('beta-owner@example.test', 'Beta Owner', ownerBetaPassword, betaBusinessId, 'owner');

  async function loginAs(email, password) {
    const res = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    assert.equal(res.status, 200);
    const cookies = extractCookies(res);
    const body = await res.json();
    return {
      cookie: `onusai_session=${cookies.onusai_session}; onusai_csrf=${cookies.onusai_csrf}`,
      csrf: body.session.csrfToken,
    };
  }

  const alphaOwner = await loginAs('alpha-owner@example.test', ownerAlphaPassword);
  const alphaOperator = await loginAs('alpha-op@example.test', operatorAlphaPassword);
  const betaOwner = await loginAs('beta-owner@example.test', ownerBetaPassword);

  await t.test('unauthenticated and CSRF-missing mutations are rejected', async () => {
    const unauthPost = await fetch(`${baseUrl}/api/v1/businesses`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Unauth Biz' }),
    });
    assert.equal(unauthPost.status, 401);

    const noCsrfPatch = await fetch(`${baseUrl}/api/v1/businesses/${alphaBusinessId}`, {
      method: 'PATCH',
      headers: { cookie: alphaOwner.cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ description: 'Updated' }),
    });
    assert.equal(noCsrfPatch.status, 403);
    assert.equal((await noCsrfPatch.json()).error.code, 'CSRF_TOKEN_INVALID');

    const badCsrfLoc = await fetch(`${baseUrl}/api/v1/businesses/${alphaBusinessId}/locations`, {
      method: 'POST',
      headers: {
        cookie: alphaOwner.cookie,
        'x-csrf-token': 'forged',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ name: 'Main', timezone: 'UTC' }),
    });
    assert.equal(badCsrfLoc.status, 403);
    assert.equal((await badCsrfLoc.json()).error.code, 'CSRF_TOKEN_INVALID');
  });

  await t.test('POST /businesses creates a business profile and owner membership transactionally', async () => {
    const createRes = await fetch(`${baseUrl}/api/v1/businesses`, {
      method: 'POST',
      headers: {
        cookie: alphaOperator.cookie,
        'x-csrf-token': alphaOperator.csrf,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        name: '  Gamma Care  ',
        description: '  24-hour urgent clinic  ',
        contactEmail: 'Care@Gamma.Test',
        contactPhone: '+1-555-010-9999',
        websiteUrl: 'https://gamma.test',
        timezone: 'America/New_York',
        openingHours: sampleHours,
      }),
    });
    assert.equal(createRes.status, 201);
    assert.equal(createRes.headers.get('cache-control'), 'no-store');
    const created = await createRes.json();
    assert.equal(created.business.name, 'Gamma Care');
    assert.equal(created.business.contactEmail, 'care@gamma.test');
    assert.equal(created.business.timezone, 'America/New_York');
    assert.deepEqual(created.business.openingHours, sampleHours);
    assert.equal(created.membership.role, 'owner');

    // Creator can immediately read and update the newly created business.
    const getRes = await fetch(`${baseUrl}/api/v1/businesses/${created.business.id}`, {
      headers: { cookie: alphaOperator.cookie },
    });
    assert.equal(getRes.status, 200);
    assert.equal((await getRes.json()).business.name, 'Gamma Care');

    // Other tenants are isolated from the newly created business.
    const crossRead = await fetch(`${baseUrl}/api/v1/businesses/${created.business.id}`, {
      headers: { cookie: betaOwner.cookie },
    });
    assert.equal(crossRead.status, 403);
    assert.equal((await crossRead.json()).error.code, 'TENANT_ACCESS_DENIED');
  });

  await t.test('PATCH /businesses/:businessId enforces owner RBAC, tenant isolation, and profile validation', async () => {
    // Operator cannot update Alpha profile.
    const opPatch = await fetch(`${baseUrl}/api/v1/businesses/${alphaBusinessId}`, {
      method: 'PATCH',
      headers: {
        cookie: alphaOperator.cookie,
        'x-csrf-token': alphaOperator.csrf,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ description: 'Operator edit attempt' }),
    });
    assert.equal(opPatch.status, 403);
    assert.equal((await opPatch.json()).error.code, 'INSUFFICIENT_PERMISSIONS');

    // Cross-tenant owner cannot update Alpha profile.
    const crossPatch = await fetch(`${baseUrl}/api/v1/businesses/${alphaBusinessId}`, {
      method: 'PATCH',
      headers: {
        cookie: betaOwner.cookie,
        'x-csrf-token': betaOwner.csrf,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ description: 'Cross tenant edit' }),
    });
    assert.equal(crossPatch.status, 403);
    assert.equal((await crossPatch.json()).error.code, 'TENANT_ACCESS_DENIED');

    // Invalid updates return 400.
    for (const invalidBody of [
      {},
      { name: null },
      { timezone: 'EST' },
      { openingHours: { ...sampleHours, friday: { closed: false, open: '20:00', close: '11:00' } } },
      { extraField: 'nope' },
    ]) {
      const badRes = await fetch(`${baseUrl}/api/v1/businesses/${alphaBusinessId}`, {
        method: 'PATCH',
        headers: {
          cookie: alphaOwner.cookie,
          'x-csrf-token': alphaOwner.csrf,
          'content-type': 'application/json',
        },
        body: JSON.stringify(invalidBody),
      });
      assert.equal(badRes.status, 400);
      assert.equal((await badRes.json()).error.code, 'VALIDATION_ERROR');
    }

    // Owner updates profile fields, then performs a partial update clearing description.
    const firstPatch = await fetch(`${baseUrl}/api/v1/businesses/${alphaBusinessId}`, {
      method: 'PATCH',
      headers: {
        cookie: alphaOwner.cookie,
        'x-csrf-token': alphaOwner.csrf,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Alpha Wellness Center',
        description: 'Holistic studio',
        contactEmail: 'Info@Alpha.Test',
        contactPhone: '+91 80 1234 5678',
        websiteUrl: 'https://alpha.test',
        timezone: 'Asia/Kolkata',
        openingHours: sampleHours,
      }),
    });
    assert.equal(firstPatch.status, 200);
    const firstBody = await firstPatch.json();
    assert.equal(firstBody.business.name, 'Alpha Wellness Center');
    assert.equal(firstBody.business.timezone, 'Asia/Kolkata');

    const secondPatch = await fetch(`${baseUrl}/api/v1/businesses/${alphaBusinessId}`, {
      method: 'PATCH',
      headers: {
        cookie: alphaOwner.cookie,
        'x-csrf-token': alphaOwner.csrf,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ description: null }),
    });
    assert.equal(secondPatch.status, 200);
    const secondBody = await secondPatch.json();
    assert.equal(secondBody.business.description, null);
    assert.equal(secondBody.business.contactEmail, 'info@alpha.test');
    assert.equal(secondBody.business.timezone, 'Asia/Kolkata');

    // Operator can read updated profile.
    const opGet = await fetch(`${baseUrl}/api/v1/businesses/${alphaBusinessId}`, {
      headers: { cookie: alphaOperator.cookie },
    });
    assert.equal(opGet.status, 200);
    assert.equal((await opGet.json()).business.name, 'Alpha Wellness Center');
  });

  await t.test('location CRUD enforces validation, RBAC, tenant isolation, and soft-archival', async () => {
    // Owner creates a location with address, contact info, timezone, and opening hours.
    const createRes = await fetch(`${baseUrl}/api/v1/businesses/${alphaBusinessId}/locations`, {
      method: 'POST',
      headers: {
        cookie: alphaOwner.cookie,
        'x-csrf-token': alphaOwner.csrf,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        name: '  Indiranagar Clinic  ',
        timezone: 'Asia/Kolkata',
        address: {
          line1: '100 Feet Road',
          line2: 'Floor 2',
          city: 'Bengaluru',
          stateRegion: 'KA',
          postalCode: '560038',
          countryCode: 'in',
        },
        contactEmail: 'Indiranagar@Alpha.Test',
        contactPhone: '+91 80 9999 0000',
        openingHours: sampleHours,
      }),
    });
    assert.equal(createRes.status, 201);
    const created = (await createRes.json()).location;
    assert.equal(created.name, 'Indiranagar Clinic');
    assert.equal(created.address.countryCode, 'IN');
    assert.equal(created.contactEmail, 'indiranagar@alpha.test');
    assert.equal(created.archivedAt, null);

    // Duplicate case-insensitive active name is rejected with 409.
    const duplicateRes = await fetch(`${baseUrl}/api/v1/businesses/${alphaBusinessId}/locations`, {
      method: 'POST',
      headers: {
        cookie: alphaOwner.cookie,
        'x-csrf-token': alphaOwner.csrf,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ name: 'INDIRANAGAR CLINIC', timezone: 'Asia/Kolkata' }),
    });
    assert.equal(duplicateRes.status, 409);
    assert.equal((await duplicateRes.json()).error.code, 'LOCATION_NAME_CONFLICT');

    // Operator cannot create, update, or archive locations.
    for (const [method, path, body] of [
      ['POST', `/api/v1/businesses/${alphaBusinessId}/locations`, { name: 'Op Loc', timezone: 'UTC' }],
      ['PATCH', `/api/v1/businesses/${alphaBusinessId}/locations/${created.id}`, { name: 'Renamed' }],
      ['DELETE', `/api/v1/businesses/${alphaBusinessId}/locations/${created.id}`, undefined],
    ]) {
      const denied = await fetch(`${baseUrl}${path}`, {
        method,
        headers: {
          cookie: alphaOperator.cookie,
          'x-csrf-token': alphaOperator.csrf,
          ...(body ? { 'content-type': 'application/json' } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      assert.equal(denied.status, 403);
      assert.equal((await denied.json()).error.code, 'INSUFFICIENT_PERMISSIONS');
    }

    // Operator can read own location; foreign locationId inside own tenant returns 404 (not leaked).
    const opGet = await fetch(`${baseUrl}/api/v1/businesses/${alphaBusinessId}/locations/${created.id}`, {
      headers: { cookie: alphaOperator.cookie },
    });
    assert.equal(opGet.status, 200);
    assert.equal((await opGet.json()).location.id, created.id);

    for (const [method, body] of [
      ['GET', undefined],
      ['PATCH', { name: 'Hijack' }],
      ['DELETE', undefined],
    ]) {
      const foreignLoc = await fetch(
        `${baseUrl}/api/v1/businesses/${alphaBusinessId}/locations/${betaLocationId}`,
        {
          method,
          headers: {
            cookie: alphaOwner.cookie,
            'x-csrf-token': alphaOwner.csrf,
            ...(body ? { 'content-type': 'application/json' } : {}),
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
        },
      );
      assert.equal(foreignLoc.status, 404);
      assert.equal((await foreignLoc.json()).error.code, 'LOCATION_NOT_FOUND');
    }

    // Cross-tenant access to Alpha's location URL is denied at tenant boundary.
    const crossList = await fetch(`${baseUrl}/api/v1/businesses/${alphaBusinessId}/locations`, {
      headers: { cookie: betaOwner.cookie },
    });
    assert.equal(crossList.status, 403);
    assert.equal((await crossList.json()).error.code, 'TENANT_ACCESS_DENIED');

    // Update location partially and clear address.
    const patchRes = await fetch(
      `${baseUrl}/api/v1/businesses/${alphaBusinessId}/locations/${created.id}`,
      {
        method: 'PATCH',
        headers: {
          cookie: alphaOwner.cookie,
          'x-csrf-token': alphaOwner.csrf,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Indiranagar Flagship',
          address: null,
        }),
      },
    );
    assert.equal(patchRes.status, 200);
    const patchedLoc = (await patchRes.json()).location;
    assert.equal(patchedLoc.name, 'Indiranagar Flagship');
    assert.equal(patchedLoc.address, null);
    assert.equal(patchedLoc.timezone, 'Asia/Kolkata');

    // Archive location via DELETE.
    const archiveRes = await fetch(
      `${baseUrl}/api/v1/businesses/${alphaBusinessId}/locations/${created.id}`,
      {
        method: 'DELETE',
        headers: {
          cookie: alphaOwner.cookie,
          'x-csrf-token': alphaOwner.csrf,
        },
      },
    );
    assert.equal(archiveRes.status, 200);
    const archivedLoc = (await archiveRes.json()).location;
    assert.ok(typeof archivedLoc.archivedAt === 'string');

    // Default list excludes archived; includeArchived=true includes it; invalid query fails 400.
    const activeList = await (
      await fetch(`${baseUrl}/api/v1/businesses/${alphaBusinessId}/locations`, {
        headers: { cookie: alphaOperator.cookie },
      })
    ).json();
    assert.equal(activeList.locations.length, 0);

    const allList = await (
      await fetch(`${baseUrl}/api/v1/businesses/${alphaBusinessId}/locations?includeArchived=true`, {
        headers: { cookie: alphaOperator.cookie },
      })
    ).json();
    assert.equal(allList.locations.length, 1);
    assert.equal(allList.locations[0].id, created.id);

    const badQuery = await fetch(
      `${baseUrl}/api/v1/businesses/${alphaBusinessId}/locations?includeArchived=maybe`,
      { headers: { cookie: alphaOperator.cookie } },
    );
    assert.equal(badQuery.status, 400);

    // Modifying or re-archiving an archived location returns 409.
    const editArchived = await fetch(
      `${baseUrl}/api/v1/businesses/${alphaBusinessId}/locations/${created.id}`,
      {
        method: 'PATCH',
        headers: {
          cookie: alphaOwner.cookie,
          'x-csrf-token': alphaOwner.csrf,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ name: 'Revive' }),
      },
    );
    assert.equal(editArchived.status, 409);
    assert.equal((await editArchived.json()).error.code, 'LOCATION_ARCHIVED');

    const reArchive = await fetch(
      `${baseUrl}/api/v1/businesses/${alphaBusinessId}/locations/${created.id}`,
      {
        method: 'DELETE',
        headers: {
          cookie: alphaOwner.cookie,
          'x-csrf-token': alphaOwner.csrf,
        },
      },
    );
    assert.equal(reArchive.status, 409);
    assert.equal((await reArchive.json()).error.code, 'LOCATION_ALREADY_ARCHIVED');

    // Reusing the archived location name succeeds for a new active location.
    const reuseName = await fetch(`${baseUrl}/api/v1/businesses/${alphaBusinessId}/locations`, {
      method: 'POST',
      headers: {
        cookie: alphaOwner.cookie,
        'x-csrf-token': alphaOwner.csrf,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ name: 'Indiranagar Flagship', timezone: 'Asia/Kolkata' }),
    });
    assert.equal(reuseName.status, 201);

    // Verify PostgreSQL durability directly.
    const persisted = await postgresPool.query(
      'SELECT name, timezone, archived_at FROM business_locations WHERE business_id = $1 ORDER BY created_at ASC',
      [alphaBusinessId],
    );
    assert.equal(persisted.rows.length, 2);
    assert.ok(persisted.rows[0].archived_at instanceof Date);
    assert.equal(persisted.rows[1].archived_at, null);
  });
});

