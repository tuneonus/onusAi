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

test('live vector cleanup, replacement/delete concurrency, delayed worker guard, and cache epoch invalidation', {
  skip: !databaseUrl,
  timeout: 45_000,
}, async (t) => {
  const schema = `onussync_cln_test_${randomUUID().replaceAll('-', '')}`;
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
  const bizId = (await postgresPool.query(`INSERT INTO businesses (name) VALUES ('Lifecycle Co') RETURNING id`)).rows[0].id;
  const locId = (await postgresPool.query(`INSERT INTO business_locations (business_id, name) VALUES ($1, 'Main') RETURNING id`, [bizId])).rows[0].id;
  const userId = (await postgresPool.query(`INSERT INTO users (email, display_name) VALUES ('life-owner@example.com', 'Owner') RETURNING id`)).rows[0].id;
  await postgresPool.query(`INSERT INTO user_credentials (user_id, password_hash) VALUES ($1, $2)`, [userId, await hashPassword(ownerPw)]);
  await postgresPool.query(`INSERT INTO business_members (business_id, user_id, role) VALUES ($1, $2, 'owner')`, [bizId, userId]);

  const loginRes = await fetch(`${baseUrl}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'life-owner@example.com', password: ownerPw }),
  });
  const cookies = extractCookies(loginRes);
  const ownerAuth = {
    cookieHeader: `onussync_session=${cookies.onussync_session}; onussync_csrf=${cookies.onussync_csrf}`,
    csrfToken: cookies.onussync_csrf,
  };

  function mintToken(scope = 'ingestion:worker') {
    return signInternalServiceToken({
      secret: internalSecret,
      issuer: 'onussync-ai-backend',
      audience: 'onussync-backend',
      subject: 'service:ai-worker',
      ttlSeconds: 60,
      scope,
    });
  }

  function buildChunking(text) {
    const sha = createHash('sha256').update(text, 'utf8').digest('hex');
    return {
      chunkVersion: 'chunk-v1',
      chunkMaxChars: 800,
      chunkOverlapChars: 120,
      normalizedCharCount: text.length,
      normalizedSha256: sha,
      chunks: [
        {
          chunkId: randomUUID(),
          chunkIndex: 0,
          headingPath: [],
          charStart: 0,
          charEnd: text.length,
          charCount: text.length,
          contentSha256: sha,
          chunkText: text,
        },
      ],
    };
  }

  async function getEpoch() {
    const res = await fetch(`${baseUrl}/api/v1/businesses/${bizId}/knowledge/cache-epoch`, {
      headers: { Cookie: ownerAuth.cookieHeader },
    });
    assert.equal(res.status, 200);
    return (await res.json()).knowledgeEpoch;
  }

  assert.equal(await getEpoch(), 1);

  // 1. Upload v1 and complete indexing -> epoch bumps to 2
  const up1 = await (
    await fetch(`${baseUrl}/api/v1/businesses/${bizId}/documents`, {
      method: 'POST',
      headers: {
        Cookie: ownerAuth.cookieHeader,
        'X-CSRF-Token': ownerAuth.csrfToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ filename: 'policy.txt', content: 'Policy v1' }),
    })
  ).json();

  const lease1 = await (
    await fetch(`${baseUrl}/api/v1/internal/ingestion-jobs/lease`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${mintToken()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ workerId: 'w1', leaseDurationSeconds: 60 }),
    })
  ).json();
  const c1 = buildChunking(lease1.document.contentText);
  await fetch(`${baseUrl}/api/v1/internal/ingestion-jobs/${lease1.job.id}/complete`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${mintToken()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      leaseToken: lease1.job.leaseToken,
      businessId: bizId,
      documentVersionId: up1.version.id,
      chunking: c1,
      indexing: {
        embeddingModel: 'gemini-embedding-001',
        embeddingModelVersion: 'embed-v1',
        embeddingDimensions: 768,
        qdrantCollection: 'onussync_chunks__embed-v1__d768',
        indexedChunkCount: 1,
      },
    }),
  });
  assert.equal(await getEpoch(), 2);

  // 2. Upload v2, fail v2 -> v1 remains active & ready, epoch still 2
  const up2 = await (
    await fetch(`${baseUrl}/api/v1/businesses/${bizId}/documents/${up1.document.id}/versions`, {
      method: 'POST',
      headers: {
        Cookie: ownerAuth.cookieHeader,
        'X-CSRF-Token': ownerAuth.csrfToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ filename: 'policy-v2.txt', content: 'Policy v2' }),
    })
  ).json();
  const lease2 = await (
    await fetch(`${baseUrl}/api/v1/internal/ingestion-jobs/lease`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${mintToken()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ workerId: 'w1', leaseDurationSeconds: 60 }),
    })
  ).json();
  await fetch(`${baseUrl}/api/v1/internal/ingestion-jobs/${lease2.job.id}/fail`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${mintToken()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      leaseToken: lease2.job.leaseToken,
      businessId: bizId,
      documentVersionId: up2.version.id,
      errorMessage: 'Qdrant timeout',
      retryable: false,
    }),
  });
  const afterFailDetail = await (
    await fetch(`${baseUrl}/api/v1/businesses/${bizId}/documents/${up1.document.id}`, {
      headers: { Cookie: ownerAuth.cookieHeader },
    })
  ).json();
  assert.equal(afterFailDetail.document.status, 'ready');
  assert.equal(afterFailDetail.document.activeVersionId, up1.version.id);
  assert.equal(await getEpoch(), 2);

  // 3. Retry v2 & succeed -> v2 active, v1 superseded, delete_version cleanup enqueued, epoch=3
  await fetch(`${baseUrl}/api/v1/businesses/${bizId}/documents/${up1.document.id}/versions/${up2.version.id}/retry`, {
    method: 'POST',
    headers: { Cookie: ownerAuth.cookieHeader, 'X-CSRF-Token': ownerAuth.csrfToken },
  });
  const lease2Retry = await (
    await fetch(`${baseUrl}/api/v1/internal/ingestion-jobs/lease`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${mintToken()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ workerId: 'w1', leaseDurationSeconds: 60 }),
    })
  ).json();
  const c2 = buildChunking(lease2Retry.document.contentText);
  await fetch(`${baseUrl}/api/v1/internal/ingestion-jobs/${lease2Retry.job.id}/complete`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${mintToken()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      leaseToken: lease2Retry.job.leaseToken,
      businessId: bizId,
      documentVersionId: up2.version.id,
      chunking: c2,
      indexing: {
        embeddingModel: 'gemini-embedding-001',
        embeddingModelVersion: 'embed-v1',
        embeddingDimensions: 768,
        qdrantCollection: 'onussync_chunks__embed-v1__d768',
        indexedChunkCount: 1,
      },
    }),
  });
  assert.equal(await getEpoch(), 3);

  // Lease & complete delete_version cleanup job
  const cln1 = await (
    await fetch(`${baseUrl}/api/v1/internal/vector-cleanup-jobs/lease`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${mintToken()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ workerId: 'cln-1', leaseDurationSeconds: 60 }),
    })
  ).json();
  assert.equal(cln1.job.jobType, 'delete_version');
  assert.equal(cln1.job.documentVersionId, up1.version.id);
  await fetch(`${baseUrl}/api/v1/internal/vector-cleanup-jobs/${cln1.job.id}/complete`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${mintToken()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ leaseToken: cln1.job.leaseToken, businessId: bizId, documentId: up1.document.id }),
  });

  // 4. PATCH visibility & location -> enqueues sync_metadata, bumps epoch=4
  await fetch(`${baseUrl}/api/v1/businesses/${bizId}/documents/${up1.document.id}`, {
    method: 'PATCH',
    headers: {
      Cookie: ownerAuth.cookieHeader,
      'X-CSRF-Token': ownerAuth.csrfToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ visibility: 'staff_only', locationId: locId }),
  });
  assert.equal(await getEpoch(), 4);

  const clnSync = await (
    await fetch(`${baseUrl}/api/v1/internal/vector-cleanup-jobs/lease`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${mintToken()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ workerId: 'cln-1', leaseDurationSeconds: 60 }),
    })
  ).json();
  assert.equal(clnSync.job.jobType, 'sync_metadata');
  assert.deepEqual(clnSync.job.payload, { visibility: 'staff_only', locationId: locId });
  await fetch(`${baseUrl}/api/v1/internal/vector-cleanup-jobs/${clnSync.job.id}/complete`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${mintToken()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ leaseToken: clnSync.job.leaseToken, businessId: bizId, documentId: up1.document.id }),
  });

  // 5. Upload v3, lease v3, then delete document concurrently -> delayed worker rejected, delete_document enqueued, epoch=5
  const up3 = await (
    await fetch(`${baseUrl}/api/v1/businesses/${bizId}/documents/${up1.document.id}/versions`, {
      method: 'POST',
      headers: {
        Cookie: ownerAuth.cookieHeader,
        'X-CSRF-Token': ownerAuth.csrfToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ filename: 'policy-v3.txt', content: 'Policy v3' }),
    })
  ).json();
  const lease3 = await (
    await fetch(`${baseUrl}/api/v1/internal/ingestion-jobs/lease`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${mintToken()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ workerId: 'w-delayed', leaseDurationSeconds: 60 }),
    })
  ).json();

  await fetch(`${baseUrl}/api/v1/businesses/${bizId}/documents/${up1.document.id}`, {
    method: 'DELETE',
    headers: { Cookie: ownerAuth.cookieHeader, 'X-CSRF-Token': ownerAuth.csrfToken },
  });
  assert.equal(await getEpoch(), 5);

  const delayedComplete = await fetch(`${baseUrl}/api/v1/internal/ingestion-jobs/${lease3.job.id}/complete`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${mintToken()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      leaseToken: lease3.job.leaseToken,
      businessId: bizId,
      documentVersionId: up3.version.id,
      chunking: buildChunking(lease3.document.contentText),
      indexing: {
        embeddingModel: 'gemini-embedding-001',
        embeddingModelVersion: 'embed-v1',
        embeddingDimensions: 768,
        qdrantCollection: 'onussync_chunks__embed-v1__d768',
        indexedChunkCount: 1,
      },
    }),
  });
  assert.equal(delayedComplete.status, 409);

  // Cleanup job fail + retry
  const clnDel1 = await (
    await fetch(`${baseUrl}/api/v1/internal/vector-cleanup-jobs/lease`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${mintToken()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ workerId: 'cln-1', leaseDurationSeconds: 60 }),
    })
  ).json();
  assert.equal(clnDel1.job.jobType, 'delete_document');
  const failCln = await (
    await fetch(`${baseUrl}/api/v1/internal/vector-cleanup-jobs/${clnDel1.job.id}/fail`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${mintToken()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        leaseToken: clnDel1.job.leaseToken,
        businessId: bizId,
        documentId: up1.document.id,
        errorMessage: 'Qdrant transient 503',
        retryable: true,
        retryDelaySeconds: 0,
      }),
    })
  ).json();
  assert.equal(failCln.job.status, 'queued');

  const clnDel2 = await (
    await fetch(`${baseUrl}/api/v1/internal/vector-cleanup-jobs/lease`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${mintToken()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ workerId: 'cln-2', leaseDurationSeconds: 60 }),
    })
  ).json();
  assert.equal(clnDel2.job.attemptCount, 2);
  await fetch(`${baseUrl}/api/v1/internal/vector-cleanup-jobs/${clnDel2.job.id}/complete`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${mintToken()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ leaseToken: clnDel2.job.leaseToken, businessId: bizId, documentId: up1.document.id }),
  });

  // Authoritative validation excludes deleted document immediately
  const valRes = await (
    await fetch(`${baseUrl}/api/v1/internal/retrieval/validate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${mintToken('retrieval:validate')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        businessId: bizId,
        allowedVisibilities: ['public', 'staff_only'],
        allowedLocationIds: null,
        includeBusinessWide: true,
        candidates: [{ documentId: up1.document.id, documentVersionId: up2.version.id, chunkId: c2.chunks[0].chunkId, score: 0.99 }],
      }),
    })
  ).json();
  assert.equal(valRes.results.length, 0);
});

