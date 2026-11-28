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

test('live document upload, metadata, bounded text storage, versioning, lifecycle, and tenant isolation', {
  skip: !databaseUrl,
  timeout: 45_000,
}, async (t) => {
  const schema = `onussync_doc_test_${randomUUID().replaceAll('-', '')}`;
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
    AI_INTERNAL_AUTH_SECRET: 'test-internal-auth-secret-at-least-32-characters',
    DATABASE_URL: scopedUrl.href,
    DATABASE_CONNECTION_TIMEOUT_MS: '2000',
    DATABASE_IDLE_TIMEOUT_MS: '1000',
    DATABASE_QUERY_TIMEOUT_MS: '5000',
    AUTH_SESSION_TTL_MS: '60000',
    AUTH_LOGIN_MAX_ATTEMPTS: '5',
    AUTH_LOGIN_WINDOW_MS: '60000',
    AUTH_LOGIN_LOCKOUT_MS: '60000',
    DOCUMENT_MAX_BYTES: '4096',
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

  const alphaOwnerPw = `Alpha-Owner-${randomUUID()}`;
  const alphaOpPw = `Alpha-Op-${randomUUID()}`;
  const betaOwnerPw = `Beta-Owner-${randomUUID()}`;

  const alphaBusinessId = (
    await postgresPool.query(`INSERT INTO businesses (name) VALUES ('Alpha Docs Co') RETURNING id`)
  ).rows[0].id;
  const betaBusinessId = (
    await postgresPool.query(`INSERT INTO businesses (name) VALUES ('Beta Docs Co') RETURNING id`)
  ).rows[0].id;

  const alphaActiveLocId = (
    await postgresPool.query(
      `INSERT INTO business_locations (business_id, name, timezone) VALUES ($1, 'Alpha Main', 'UTC') RETURNING id`,
      [alphaBusinessId],
    )
  ).rows[0].id;
  const alphaArchivedLocId = (
    await postgresPool.query(
      `INSERT INTO business_locations (business_id, name, timezone, archived_at)
       VALUES ($1, 'Alpha Old', 'UTC', CURRENT_TIMESTAMP) RETURNING id`,
      [alphaBusinessId],
    )
  ).rows[0].id;
  const betaLocId = (
    await postgresPool.query(
      `INSERT INTO business_locations (business_id, name, timezone) VALUES ($1, 'Beta Main', 'UTC') RETURNING id`,
      [betaBusinessId],
    )
  ).rows[0].id;

  async function seedUser(email, displayName, password, businessId, role) {
    const userId = (
      await postgresPool.query(
        `INSERT INTO users (email, display_name) VALUES ($1, $2) RETURNING id`,
        [email, displayName],
      )
    ).rows[0].id;
    await postgresPool.query(
      `INSERT INTO user_credentials (user_id, password_hash) VALUES ($1, $2)`,
      [userId, await hashPassword(password)],
    );
    await postgresPool.query(
      `INSERT INTO business_members (business_id, user_id, role) VALUES ($1, $2, $3)`,
      [businessId, userId, role],
    );
    return userId;
  }

  await seedUser('alpha-owner@example.com', 'Alpha Owner', alphaOwnerPw, alphaBusinessId, 'owner');
  await seedUser('alpha-op@example.com', 'Alpha Operator', alphaOpPw, alphaBusinessId, 'operator');
  await seedUser('beta-owner@example.com', 'Beta Owner', betaOwnerPw, betaBusinessId, 'owner');

  async function login(email, password) {
    const response = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    assert.equal(response.status, 200);
    const cookies = extractCookies(response);
    return {
      cookieHeader: `onussync_session=${cookies.onussync_session}; onussync_csrf=${cookies.onussync_csrf}`,
      csrfToken: cookies.onussync_csrf,
    };
  }

  const alphaOwner = await login('alpha-owner@example.com', alphaOwnerPw);
  const alphaOperator = await login('alpha-op@example.com', alphaOpPw);
  const betaOwner = await login('beta-owner@example.com', betaOwnerPw);

  await t.test('uploads Markdown and TXT via multipart and JSON without marking indexed prematurely', async () => {
    const form = new FormData();
    form.append('file', new File(['# Clinic FAQ\r\nOpen Mon-Fri 9am-5pm.'], 'clinic-faq.md', { type: 'text/markdown' }));
    form.append('title', 'Clinic FAQ');
    form.append('visibility', 'public');
    form.append('locationId', alphaActiveLocId);

    const mdRes = await fetch(`${baseUrl}/api/v1/businesses/${alphaBusinessId}/documents`, {
      method: 'POST',
      headers: {
        Cookie: alphaOwner.cookieHeader,
        'X-CSRF-Token': alphaOwner.csrfToken,
      },
      body: form,
    });
    assert.equal(mdRes.status, 201);
    const mdBody = await mdRes.json();
    assert.equal(mdBody.document.status, 'uploaded');
    assert.equal(mdBody.document.activeVersionId, null);
    assert.equal(mdBody.document.currentVersionNumber, 1);
    assert.equal(mdBody.document.visibility, 'public');
    assert.equal(mdBody.document.locationId, alphaActiveLocId);
    assert.equal(mdBody.version.status, 'uploaded');
    assert.equal(mdBody.version.indexedAt, null);
    assert.equal(mdBody.version.sourceType, 'markdown');
    assert.equal(mdBody.version.mimeType, 'text/markdown');
    assert.equal(mdBody.version.contentText, '# Clinic FAQ\nOpen Mon-Fri 9am-5pm.');

    const txtRes = await fetch(`${baseUrl}/api/v1/businesses/${alphaBusinessId}/documents`, {
      method: 'POST',
      headers: {
        Cookie: alphaOwner.cookieHeader,
        'X-CSRF-Token': alphaOwner.csrfToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        filename: 'internal-sop.txt',
        content: 'Staff escalation procedure.',
        visibility: 'staff_only',
      }),
    });
    assert.equal(txtRes.status, 201);
    const txtBody = await txtRes.json();
    assert.equal(txtBody.document.status, 'uploaded');
    assert.equal(txtBody.document.visibility, 'staff_only');
    assert.equal(txtBody.version.sourceType, 'txt');
    assert.equal(txtBody.version.indexedAt, null);
  });

  await t.test('rejects oversized, invalid UTF-8, unsupported type, archived location, and foreign location uploads', async () => {
    const tooLargeForm = new FormData();
    tooLargeForm.append('file', new File([Buffer.alloc(4097, 0x61)], 'huge.txt', { type: 'text/plain' }));
    const largeRes = await fetch(`${baseUrl}/api/v1/businesses/${alphaBusinessId}/documents`, {
      method: 'POST',
      headers: { Cookie: alphaOwner.cookieHeader, 'X-CSRF-Token': alphaOwner.csrfToken },
      body: tooLargeForm,
    });
    assert.equal(largeRes.status, 413);

    const badUtf8Form = new FormData();
    badUtf8Form.append('file', new File([Uint8Array.from([0xff, 0xfe, 0x41])], 'bad.txt', { type: 'text/plain' }));
    const utf8Res = await fetch(`${baseUrl}/api/v1/businesses/${alphaBusinessId}/documents`, {
      method: 'POST',
      headers: { Cookie: alphaOwner.cookieHeader, 'X-CSRF-Token': alphaOwner.csrfToken },
      body: badUtf8Form,
    });
    assert.equal(utf8Res.status, 400);
    assert.equal((await utf8Res.json()).error.code, 'INVALID_DOCUMENT_ENCODING');

    const pdfForm = new FormData();
    pdfForm.append('file', new File(['%PDF-1.7'], 'doc.pdf', { type: 'application/pdf' }));
    const pdfRes = await fetch(`${baseUrl}/api/v1/businesses/${alphaBusinessId}/documents`, {
      method: 'POST',
      headers: { Cookie: alphaOwner.cookieHeader, 'X-CSRF-Token': alphaOwner.csrfToken },
      body: pdfForm,
    });
    assert.equal(pdfRes.status, 400);
    assert.equal((await pdfRes.json()).error.code, 'UNSUPPORTED_DOCUMENT_TYPE');

    const archivedLocRes = await fetch(`${baseUrl}/api/v1/businesses/${alphaBusinessId}/documents`, {
      method: 'POST',
      headers: {
        Cookie: alphaOwner.cookieHeader,
        'X-CSRF-Token': alphaOwner.csrfToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        filename: 'loc.txt',
        content: 'Location test',
        locationId: alphaArchivedLocId,
      }),
    });
    assert.equal(archivedLocRes.status, 409);

    const foreignLocRes = await fetch(`${baseUrl}/api/v1/businesses/${alphaBusinessId}/documents`, {
      method: 'POST',
      headers: {
        Cookie: alphaOwner.cookieHeader,
        'X-CSRF-Token': alphaOwner.csrfToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        filename: 'foreign.txt',
        content: 'Foreign location test',
        locationId: betaLocId,
      }),
    });
    assert.equal(foreignLocRes.status, 404);
  });

  await t.test('supports versioning, ready-version preservation on replacement, retry, metadata update, and soft deletion', async () => {
    const createRes = await fetch(`${baseUrl}/api/v1/businesses/${alphaBusinessId}/documents`, {
      method: 'POST',
      headers: {
        Cookie: alphaOwner.cookieHeader,
        'X-CSRF-Token': alphaOwner.csrfToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ filename: 'handbook.md', title: 'Handbook v1', content: 'Version 1 text' }),
    });
    assert.equal(createRes.status, 201);
    const { document, version: v1 } = await createRes.json();

    // Replace unindexed v1 -> v1 becomes superseded, v2 is uploaded
    const v2Res = await fetch(`${baseUrl}/api/v1/businesses/${alphaBusinessId}/documents/${document.id}/versions`, {
      method: 'POST',
      headers: {
        Cookie: alphaOwner.cookieHeader,
        'X-CSRF-Token': alphaOwner.csrfToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ filename: 'handbook.md', content: 'Version 2 text' }),
    });
    assert.equal(v2Res.status, 201);
    const v2Body = await v2Res.json();
    assert.equal(v2Body.document.currentVersionNumber, 2);
    assert.equal(v2Body.document.status, 'uploaded');
    assert.equal(v2Body.version.versionNumber, 2);

    const v1Check = await fetch(
      `${baseUrl}/api/v1/businesses/${alphaBusinessId}/documents/${document.id}/versions/${v1.id}`,
      { headers: { Cookie: alphaOperator.cookieHeader } },
    );
    assert.equal(v1Check.status, 200);
    assert.equal((await v1Check.json()).version.status, 'superseded');

    // Simulate v2 processing -> indexed ('ready') in PostgreSQL, then upload v3 -> v2 must stay 'ready' and active!
    await postgresPool.query(
      `UPDATE document_versions SET status = 'processing' WHERE id = $1`,
      [v2Body.version.id],
    );
    await postgresPool.query(
      `UPDATE document_versions SET status = 'ready', indexed_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [v2Body.version.id],
    );
    await postgresPool.query(
      `UPDATE documents SET status = 'ready', active_version_id = $2 WHERE id = $1`,
      [document.id, v2Body.version.id],
    );

    const v3Res = await fetch(`${baseUrl}/api/v1/businesses/${alphaBusinessId}/documents/${document.id}/versions`, {
      method: 'POST',
      headers: {
        Cookie: alphaOwner.cookieHeader,
        'X-CSRF-Token': alphaOwner.csrfToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ filename: 'handbook.md', content: 'Version 3 text' }),
    });
    assert.equal(v3Res.status, 201);
    const v3Body = await v3Res.json();
    assert.equal(v3Body.document.status, 'ready');
    assert.equal(v3Body.document.activeVersionId, v2Body.version.id);
    assert.equal(v3Body.version.status, 'uploaded');
    assert.equal(v3Body.version.indexedAt, null);

    // Simulate v3 failing, then retry via API
    await postgresPool.query(
      `UPDATE document_versions SET status = 'failed', failure_reason = 'Simulated failure' WHERE id = $1`,
      [v3Body.version.id],
    );
    const retryRes = await fetch(
      `${baseUrl}/api/v1/businesses/${alphaBusinessId}/documents/${document.id}/versions/${v3Body.version.id}/retry`,
      {
        method: 'POST',
        headers: { Cookie: alphaOwner.cookieHeader, 'X-CSRF-Token': alphaOwner.csrfToken },
      },
    );
    assert.equal(retryRes.status, 200);
    const retryBody = await retryRes.json();
    assert.equal(retryBody.version.status, 'uploaded');
    assert.equal(retryBody.version.failureReason, null);

    // Update metadata
    const patchRes = await fetch(`${baseUrl}/api/v1/businesses/${alphaBusinessId}/documents/${document.id}`, {
      method: 'PATCH',
      headers: {
        Cookie: alphaOwner.cookieHeader,
        'X-CSRF-Token': alphaOwner.csrfToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ title: 'Updated Handbook', visibility: 'staff_only' }),
    });
    assert.equal(patchRes.status, 200);
    const patchBody = await patchRes.json();
    assert.equal(patchBody.document.title, 'Updated Handbook');
    assert.equal(patchBody.document.visibility, 'staff_only');

    // SQL trigger guards: cannot mark uploaded version indexed_at != NULL, cannot mutate content_text
    await assert.rejects(
      () => postgresPool.query(
        `UPDATE document_versions SET indexed_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [v3Body.version.id],
      ),
      (error) => error.code === '23514',
    );
    await assert.rejects(
      () => postgresPool.query(
        `UPDATE document_versions SET content_text = 'tampered' WHERE id = $1`,
        [v3Body.version.id],
      ),
      (error) => error.code === '23514',
    );

    // Soft-delete document and verify deleted state + exclusion from default list
    const deleteRes = await fetch(`${baseUrl}/api/v1/businesses/${alphaBusinessId}/documents/${document.id}`, {
      method: 'DELETE',
      headers: { Cookie: alphaOwner.cookieHeader, 'X-CSRF-Token': alphaOwner.csrfToken },
    });
    assert.equal(deleteRes.status, 200);
    const deleteBody = await deleteRes.json();
    assert.equal(deleteBody.document.status, 'deleted');
    assert.equal(deleteBody.document.activeVersionId, null);

    const listDefault = await fetch(`${baseUrl}/api/v1/businesses/${alphaBusinessId}/documents`, {
      headers: { Cookie: alphaOperator.cookieHeader },
    });
    assert.equal(listDefault.status, 200);
    const listDefaultBody = await listDefault.json();
    assert.equal(listDefaultBody.documents.some((entry) => entry.id === document.id), false);

    const listWithDeleted = await fetch(
      `${baseUrl}/api/v1/businesses/${alphaBusinessId}/documents?includeDeleted=true`,
      { headers: { Cookie: alphaOperator.cookieHeader } },
    );
    assert.equal(listWithDeleted.status, 200);
    const listWithDeletedBody = await listWithDeleted.json();
    assert.equal(listWithDeletedBody.documents.some((entry) => entry.id === document.id), true);
  });

  await t.test('enforces authentication, CSRF, owner/operator RBAC, and two-tenant isolation', async () => {
    const unauthRes = await fetch(`${baseUrl}/api/v1/businesses/${alphaBusinessId}/documents`);
    assert.equal(unauthRes.status, 401);

    const noCsrfRes = await fetch(`${baseUrl}/api/v1/businesses/${alphaBusinessId}/documents`, {
      method: 'POST',
      headers: { Cookie: alphaOwner.cookieHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: 'no-csrf.txt', content: 'blocked' }),
    });
    assert.equal(noCsrfRes.status, 403);

    // Operator can read but cannot upload
    const opListRes = await fetch(`${baseUrl}/api/v1/businesses/${alphaBusinessId}/documents`, {
      headers: { Cookie: alphaOperator.cookieHeader },
    });
    assert.equal(opListRes.status, 200);
    const alphaDocs = (await opListRes.json()).documents;
    assert.ok(alphaDocs.length > 0);
    const alphaDocId = alphaDocs[0].id;

    const opUploadRes = await fetch(`${baseUrl}/api/v1/businesses/${alphaBusinessId}/documents`, {
      method: 'POST',
      headers: {
        Cookie: alphaOperator.cookieHeader,
        'X-CSRF-Token': alphaOperator.csrfToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ filename: 'op.txt', content: 'denied' }),
    });
    assert.equal(opUploadRes.status, 403);

    // Beta owner cannot access Alpha business or Alpha document ID
    const crossListRes = await fetch(`${baseUrl}/api/v1/businesses/${alphaBusinessId}/documents`, {
      headers: { Cookie: betaOwner.cookieHeader },
    });
    assert.equal(crossListRes.status, 403);

    const crossIdRes = await fetch(`${baseUrl}/api/v1/businesses/${betaBusinessId}/documents/${alphaDocId}`, {
      headers: { Cookie: betaOwner.cookieHeader },
    });
    assert.equal(crossIdRes.status, 404);
  });
});

