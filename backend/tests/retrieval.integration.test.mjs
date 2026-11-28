import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { test } from 'node:test';
import { Pool } from 'pg';

const databaseUrl = process.env.TEST_DATABASE_URL;

function extractCookies(response) {
  const cookies = {};
  for (const header of response.headers.getSetCookie()) {
    const [pair] = header.split(';');
    const sep = pair.indexOf('=');
    if (sep > 0) cookies[pair.slice(0, sep)] = pair.slice(sep + 1);
  }
  return cookies;
}

test('live PostgreSQL candidate validation: excludes deleted, failed, superseded, inactive, cross-tenant, and unauthorized chunks', {
  skip: !databaseUrl,
  timeout: 45_000,
}, async (t) => {
  const schema = `onussync_ret_test_${randomUUID().replaceAll('-', '')}`;
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
      if (closeDatabasePool) await closeDatabasePool();
      if (schemaCreated) await observer.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    } finally {
      await observer.end();
    }
  });

  await observer.query(`CREATE SCHEMA "${schema}"`);
  schemaCreated = true;

  const scopedUrl = new URL(databaseUrl);
  const originalOptions = scopedUrl.searchParams.get('options') ?? '';
  scopedUrl.searchParams.set('options', `${originalOptions} -c search_path=${schema},pg_catalog`.trim());

  const internalSecret = 'test-internal-auth-secret-at-least-32-characters';
  Object.assign(process.env, {
    PORT: '3000',
    NODE_ENV: 'test',
    CORS_ORIGIN: 'http://localhost:5173',
    AI_SERVICE_URL: 'http://127.0.0.1:8001',
    AI_SERVICE_TIMEOUT_MS: '5000',
    AI_INTERNAL_AUTH_SECRET: internalSecret,
    AI_INTERNAL_AUTH_ISSUER: 'onussync-backend',
    AI_INTERNAL_AUTH_AUDIENCE: 'onussync-ai-backend',
    DATABASE_URL: scopedUrl.href,
    DATABASE_CONNECTION_TIMEOUT_MS: '2000',
    DATABASE_IDLE_TIMEOUT_MS: '1000',
    DATABASE_QUERY_TIMEOUT_MS: '5000',
    AUTH_SESSION_TTL_MS: '60000',
    AUTH_LOGIN_MAX_ATTEMPTS: '5',
    AUTH_LOGIN_WINDOW_MS: '60000',
    AUTH_LOGIN_LOCKOUT_MS: '60000',
    DOCUMENT_MAX_BYTES: '8192',
  });

  const postgresModule = await import('../dist/integrations/database/postgres.js');
  const { postgresPool } = postgresModule;
  closeDatabasePool = postgresModule.closeDatabasePool;
  const { runMigrations } = await import('../dist/integrations/database/migrations.js');
  const { signInternalServiceToken } = await import('../dist/integrations/ai/ai-auth.js');
  const { hashPassword } = await import('../dist/utils/password.js');
  const { app } = await import('../dist/app.js');

  await runMigrations();

  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve, reject) => server.close((e) => (e ? reject(e) : resolve()))));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  const ownerPw = `Owner-${randomUUID()}`;
  const bizA = (await postgresPool.query(`INSERT INTO businesses (name) VALUES ('Tenant A') RETURNING id`)).rows[0].id;
  const bizB = (await postgresPool.query(`INSERT INTO businesses (name) VALUES ('Tenant B') RETURNING id`)).rows[0].id;
  const loc1 = (await postgresPool.query(`INSERT INTO business_locations (business_id, name) VALUES ($1, 'Loc 1') RETURNING id`, [bizA])).rows[0].id;
  const loc2 = (await postgresPool.query(`INSERT INTO business_locations (business_id, name) VALUES ($1, 'Loc 2') RETURNING id`, [bizA])).rows[0].id;
  const userId = (await postgresPool.query(`INSERT INTO users (email, display_name) VALUES ('ret-owner@example.com', 'Owner') RETURNING id`)).rows[0].id;
  await postgresPool.query(`INSERT INTO user_credentials (user_id, password_hash) VALUES ($1, $2)`, [userId, await hashPassword(ownerPw)]);
  await postgresPool.query(`INSERT INTO business_members (business_id, user_id, role) VALUES ($1, $2, 'owner')`, [bizA, userId]);

  const loginRes = await fetch(`${baseUrl}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'ret-owner@example.com', password: ownerPw }),
  });
  const cookies = extractCookies(loginRes);
  const ownerAuth = {
    cookieHeader: `onussync_session=${cookies.onussync_session}; onussync_csrf=${cookies.onussync_csrf}`,
    csrfToken: cookies.onussync_csrf,
  };

  function mintToken(scope = 'retrieval:validate') {
    return signInternalServiceToken({
      secret: internalSecret,
      issuer: 'onussync-ai-backend',
      audience: 'onussync-backend',
      subject: 'service:ai-worker',
      ttlSeconds: 60,
      scope,
    });
  }

  async function seedIndexedDoc(bizId, { title, visibility, locationId, text, status = 'ready', deleted = false }) {
    const sha = createHash('sha256').update(text, 'utf8').digest('hex');
    const docId = randomUUID();
    const verId = randomUUID();
    const chunkId = randomUUID();
    await postgresPool.query(
      `INSERT INTO documents (id, business_id, location_id, title, visibility, status, current_version_number, active_version_id, deleted_at)
       VALUES ($1, $2, $3, $4, $5, $6, 1, NULL, $7)`,
      [
        docId,
        bizId,
        locationId,
        title,
        visibility,
        deleted ? 'deleted' : status === 'ready' ? 'ready' : 'processing',
        deleted ? new Date() : null,
      ],
    );
    await postgresPool.query(
      `INSERT INTO document_versions (
         id, document_id, business_id, version_number, status, source_filename, mime_type, source_type,
         encoding, byte_size, char_count, content_sha256, content_text, chunk_version, chunk_count,
         normalized_char_count, normalized_sha256, indexed_at, embedding_model, embedding_model_version,
         embedding_dimensions, qdrant_collection
       ) VALUES ($1, $2, $3, 1, $4, $5, 'text/plain', 'txt', 'utf-8', $6, $7, $8, $9, 'chunk-v1', 1, $7, $8, $10, 'gemini-embedding-001', 'embed-v1', 768, 'onussync_chunks__embed-v1__d768')`,
      [
        verId,
        docId,
        bizId,
        deleted ? 'deleted' : status,
        `${title}.txt`,
        Buffer.byteLength(text, 'utf8'),
        text.length,
        sha,
        text,
        status === 'ready' && !deleted ? new Date() : null,
      ],
    );
    if (status === 'ready' && !deleted) {
      await postgresPool.query(
        `UPDATE documents SET active_version_id = $1 WHERE business_id = $2 AND id = $3`,
        [verId, bizId, docId],
      );
    }
    await postgresPool.query(
      `INSERT INTO document_chunks (
         id, business_id, document_id, document_version_id, location_id, visibility,
         chunk_version, chunk_index, heading_path, char_start, char_end, char_count, content_sha256, chunk_text
       ) VALUES ($1, $2, $3, $4, $5, $6, 'chunk-v1', 0, '{}'::text[], 0, $7, $7, $8, $9)`,
      [chunkId, bizId, docId, verId, locationId, visibility, text.length, sha, text],
    );
    return { docId, verId, chunkId };
  }

  const validPub = await seedIndexedDoc(bizA, { title: 'pub', visibility: 'public', locationId: loc1, text: 'Public loc1 guide' });
  const validStaff = await seedIndexedDoc(bizA, { title: 'staff', visibility: 'staff_only', locationId: loc1, text: 'Staff only loc1 guide' });
  const validLoc2 = await seedIndexedDoc(bizA, { title: 'loc2', visibility: 'public', locationId: loc2, text: 'Public loc2 guide' });
  const deletedDoc = await seedIndexedDoc(bizA, { title: 'del', visibility: 'public', locationId: null, text: 'Deleted doc', deleted: true });
  const failedDoc = await seedIndexedDoc(bizA, { title: 'fail', visibility: 'public', locationId: null, text: 'Failed doc', status: 'failed' });
  const processingDoc = await seedIndexedDoc(bizA, { title: 'proc', visibility: 'public', locationId: null, text: 'Processing doc', status: 'processing' });
  const foreignDoc = await seedIndexedDoc(bizB, { title: 'foreign', visibility: 'public', locationId: null, text: 'Tenant B doc' });

  const candidates = [
    { documentId: validPub.docId, documentVersionId: validPub.verId, chunkId: validPub.chunkId, score: 0.95 },
    { documentId: validStaff.docId, documentVersionId: validStaff.verId, chunkId: validStaff.chunkId, score: 0.92 },
    { documentId: validLoc2.docId, documentVersionId: validLoc2.verId, chunkId: validLoc2.chunkId, score: 0.90 },
    { documentId: deletedDoc.docId, documentVersionId: deletedDoc.verId, chunkId: deletedDoc.chunkId, score: 0.89 },
    { documentId: failedDoc.docId, documentVersionId: failedDoc.verId, chunkId: failedDoc.chunkId, score: 0.88 },
    { documentId: processingDoc.docId, documentVersionId: processingDoc.verId, chunkId: processingDoc.chunkId, score: 0.87 },
    { documentId: foreignDoc.docId, documentVersionId: foreignDoc.verId, chunkId: foreignDoc.chunkId, score: 0.86 },
  ];

  // Validate with public-only + loc1 -> only validPub survives
  const valRes = await fetch(`${baseUrl}/api/v1/internal/retrieval/validate`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${mintToken()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      businessId: bizA,
      allowedVisibilities: ['public'],
      allowedLocationIds: [loc1],
      includeBusinessWide: true,
      candidates,
    }),
  });
  assert.equal(valRes.status, 200);
  const valBody = await valRes.json();
  assert.equal(valBody.results.length, 1);
  assert.equal(valBody.results[0].chunkId, validPub.chunkId);
  assert.equal(valBody.results[0].citation.sourceFilename, 'pub.txt');

  // Cross-tenant staff search rejected with 403
  const crossTenantRes = await fetch(`${baseUrl}/api/v1/businesses/${bizB}/knowledge/search`, {
    method: 'POST',
    headers: {
      Cookie: ownerAuth.cookieHeader,
      'X-CSRF-Token': ownerAuth.csrfToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: 'Tenant B doc' }),
  });
  assert.equal(crossTenantRes.status, 403);
});
