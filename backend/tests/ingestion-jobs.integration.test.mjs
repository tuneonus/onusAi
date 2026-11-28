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
    const separator = pair.indexOf('=');
    if (separator > 0) {
      cookies[pair.slice(0, separator)] = pair.slice(separator + 1);
    }
  }
  return cookies;
}

test('live durable ingestion jobs: auto-enqueue, concurrency, lease expiry, retries, duplicates, and internal auth', {
  skip: !databaseUrl,
  timeout: 45_000,
}, async (t) => {
  const schema = `onussync_jobs_test_${randomUUID().replaceAll('-', '')}`;
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

  const applied = await runMigrations();
  assert.equal(applied.length, 20);

  function buildChunkingPayload(text) {
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
          headingPath: ['Knowledge'],
          charStart: 0,
          charEnd: text.length,
          charCount: text.length,
          contentSha256: sha,
          chunkText: text,
        },
      ],
    };
  }

  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  const ownerPw = `Owner-${randomUUID()}`;
  const businessId = (
    await postgresPool.query(`INSERT INTO businesses (name) VALUES ('Ingestion Test Co') RETURNING id`)
  ).rows[0].id;
  const otherBusinessId = (
    await postgresPool.query(`INSERT INTO businesses (name) VALUES ('Other Tenant Co') RETURNING id`)
  ).rows[0].id;
  const userId = (
    await postgresPool.query(
      `INSERT INTO users (email, display_name) VALUES ('ingest-owner@example.com', 'Owner') RETURNING id`,
    )
  ).rows[0].id;
  await postgresPool.query(
    `INSERT INTO user_credentials (user_id, password_hash) VALUES ($1, $2)`,
    [userId, await hashPassword(ownerPw)],
  );
  await postgresPool.query(
    `INSERT INTO business_members (business_id, user_id, role) VALUES ($1, $2, 'owner')`,
    [businessId, userId],
  );

  const loginRes = await fetch(`${baseUrl}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'ingest-owner@example.com', password: ownerPw }),
  });
  assert.equal(loginRes.status, 200);
  const cookies = extractCookies(loginRes);
  const ownerAuth = {
    cookieHeader: `onussync_session=${cookies.onussync_session}; onussync_csrf=${cookies.onussync_csrf}`,
    csrfToken: cookies.onussync_csrf,
  };

  function mintWorkerToken(scope = 'ingestion:worker') {
    return signInternalServiceToken({
      secret: internalSecret,
      issuer: 'onussync-ai-backend',
      audience: 'onussync-backend',
      subject: 'service:ai-worker',
      ttlSeconds: 60,
      scope,
    });
  }

  await t.test('rejects unauthenticated, forged, and wrong-scope internal worker requests', async () => {
    const unauth = await fetch(`${baseUrl}/api/v1/internal/ingestion-jobs/lease`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workerId: 'w-1' }),
    });
    assert.equal(unauth.status, 401);

    const forged = await fetch(`${baseUrl}/api/v1/internal/ingestion-jobs/lease`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer invalid.jwt.token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ workerId: 'w-1' }),
    });
    assert.equal(forged.status, 401);

    const wrongScope = await fetch(`${baseUrl}/api/v1/internal/ingestion-jobs/lease`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${mintWorkerToken('ai:respond')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ workerId: 'w-1' }),
    });
    assert.equal(wrongScope.status, 403);
  });

  await t.test('auto-enqueues job, prevents duplicate active jobs, handles concurrent leases, and does not mark document ready on completion', async () => {
    const uploadRes = await fetch(`${baseUrl}/api/v1/businesses/${businessId}/documents`, {
      method: 'POST',
      headers: {
        Cookie: ownerAuth.cookieHeader,
        'X-CSRF-Token': ownerAuth.csrfToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ filename: 'kb.md', content: '# Knowledge\nDurable job check.' }),
    });
    assert.equal(uploadRes.status, 201);
    const { document, version } = await uploadRes.json();

    // Unique index prevents duplicate active jobs for the same version
    await assert.rejects(
      () => postgresPool.query(
        `INSERT INTO document_ingestion_jobs (business_id, document_id, document_version_id, status)
         VALUES ($1, $2, $3, 'queued')`,
        [businessId, document.id, version.id],
      ),
      (error) => error.code === '23505',
    );

    // Concurrent lease race: two workers poll simultaneously -> only one gets the job
    const [leaseA, leaseB] = await Promise.all([
      fetch(`${baseUrl}/api/v1/internal/ingestion-jobs/lease`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${mintWorkerToken()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ workerId: 'worker-a', leaseDurationSeconds: 60 }),
      }),
      fetch(`${baseUrl}/api/v1/internal/ingestion-jobs/lease`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${mintWorkerToken()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ workerId: 'worker-b', leaseDurationSeconds: 60 }),
      }),
    ]);

    assert.equal(leaseA.status, 200);
    assert.equal(leaseB.status, 200);
    const bodyA = await leaseA.json();
    const bodyB = await leaseB.json();
    const leased = bodyA.job ? bodyA : bodyB;
    const idle = bodyA.job ? bodyB : bodyA;

    assert.ok(leased.job);
    assert.equal(idle.job, null);
    assert.equal(leased.job.status, 'leased');
    assert.equal(leased.job.attemptCount, 1);
    assert.equal(leased.document.contentText, '# Knowledge\nDurable job check.');

    // Tenant scope mismatch on complete is rejected with 403
    const mismatchRes = await fetch(
      `${baseUrl}/api/v1/internal/ingestion-jobs/${leased.job.id}/complete`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${mintWorkerToken()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          leaseToken: leased.job.leaseToken,
          businessId: otherBusinessId,
          documentVersionId: version.id,
          chunking: buildChunkingPayload(leased.document.contentText),
        }),
      },
    );
    assert.equal(mismatchRes.status, 403);

    // Complete job -> job becomes completed, but document_version is NOT marked 'ready' or indexed!
    const completeRes = await fetch(
      `${baseUrl}/api/v1/internal/ingestion-jobs/${leased.job.id}/complete`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${mintWorkerToken()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          leaseToken: leased.job.leaseToken,
          businessId,
          documentVersionId: version.id,
          chunking: buildChunkingPayload(leased.document.contentText),
        }),
      },
    );
    assert.equal(completeRes.status, 200);
    const completedBody = await completeRes.json();
    assert.equal(completedBody.job.status, 'completed');
    assert.ok(completedBody.job.completedAt);

    // Verify document & version were NOT prematurely marked ready/indexed
    const docDetailRes = await fetch(
      `${baseUrl}/api/v1/businesses/${businessId}/documents/${document.id}`,
      { headers: { Cookie: ownerAuth.cookieHeader } },
    );
    const docDetail = await docDetailRes.json();
    assert.equal(docDetail.document.activeVersionId, null);
    assert.notEqual(docDetail.document.status, 'ready');
    assert.equal(docDetail.versions[0].status, 'processing');
    assert.equal(docDetail.versions[0].indexedAt, null);
    assert.equal(docDetail.versions[0].chunkVersion, 'chunk-v1');
    assert.equal(docDetail.versions[0].chunkCount, 1);

    // Staff can inspect processing status and stored chunks (leaseToken omitted)
    const statusRes = await fetch(
      `${baseUrl}/api/v1/businesses/${businessId}/documents/${document.id}/status`,
      { headers: { Cookie: ownerAuth.cookieHeader } },
    );
    assert.equal(statusRes.status, 200);
    const statusBody = await statusRes.json();
    assert.equal(statusBody.latestVersion.chunkCount, 1);
    assert.equal(statusBody.latestJob.status, 'completed');
    assert.equal('leaseToken' in statusBody.latestJob, false);

    const chunksRes = await fetch(
      `${baseUrl}/api/v1/businesses/${businessId}/documents/${document.id}/versions/${version.id}/chunks`,
      { headers: { Cookie: ownerAuth.cookieHeader } },
    );
    assert.equal(chunksRes.status, 200);
    const chunksBody = await chunksRes.json();
    assert.equal(chunksBody.chunks.length, 1);
    assert.equal(chunksBody.chunks[0].chunkText, '# Knowledge\nDurable job check.');
    assert.deepEqual(chunksBody.chunks[0].headingPath, ['Knowledge']);
    assert.equal(chunksBody.chunks[0].visibility, 'public');

    // Updating visibility syncs stored chunk visibility metadata
    const patchVis = await fetch(
      `${baseUrl}/api/v1/businesses/${businessId}/documents/${document.id}`,
      {
        method: 'PATCH',
        headers: {
          Cookie: ownerAuth.cookieHeader,
          'X-CSRF-Token': ownerAuth.csrfToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ visibility: 'staff_only' }),
      },
    );
    assert.equal(patchVis.status, 200);
    const chunksAfterPatch = await (
      await fetch(
        `${baseUrl}/api/v1/businesses/${businessId}/documents/${document.id}/versions/${version.id}/chunks`,
        { headers: { Cookie: ownerAuth.cookieHeader } },
      )
    ).json();
    assert.equal(chunksAfterPatch.chunks[0].visibility, 'staff_only');

    // Replacement upload after chunking (no active 'leased' job) supersedes 'processing' v1 -> v2 'uploaded'
    const v2ReplaceRes = await fetch(
      `${baseUrl}/api/v1/businesses/${businessId}/documents/${document.id}/versions`,
      {
        method: 'POST',
        headers: {
          Cookie: ownerAuth.cookieHeader,
          'X-CSRF-Token': ownerAuth.csrfToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ filename: 'kb-v2.md', content: '# Knowledge v2\nUpdated.' }),
      },
    );
    assert.equal(v2ReplaceRes.status, 201);
    const v2ReplaceBody = await v2ReplaceRes.json();
    assert.equal(v2ReplaceBody.version.versionNumber, 2);
    assert.equal(v2ReplaceBody.version.status, 'uploaded');

    // Staff can inspect jobs (leaseToken is omitted from staff view)
    const jobsRes = await fetch(
      `${baseUrl}/api/v1/businesses/${businessId}/documents/${document.id}/jobs`,
      { headers: { Cookie: ownerAuth.cookieHeader } },
    );
    assert.equal(jobsRes.status, 200);
    const jobsBody = await jobsRes.json();
    assert.equal(jobsBody.jobs.length, 1);
    assert.equal(jobsBody.jobs[0].status, 'completed');
    assert.equal('leaseToken' in jobsBody.jobs[0], false);
  });

  await t.test('recovers expired leases, enforces max retry attempts, and supports staff retry', async () => {
    const uploadRes = await fetch(`${baseUrl}/api/v1/businesses/${businessId}/documents`, {
      method: 'POST',
      headers: {
        Cookie: ownerAuth.cookieHeader,
        'X-CSRF-Token': ownerAuth.csrfToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ filename: 'retry.txt', content: 'Retry lifecycle test.' }),
    });
    assert.equal(uploadRes.status, 201);
    const { document, version } = await uploadRes.json();

    // Attempt 1: lease, then simulate lease expiry
    const lease1Res = await fetch(`${baseUrl}/api/v1/internal/ingestion-jobs/lease`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${mintWorkerToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ workerId: 'worker-1', leaseDurationSeconds: 30 }),
    });
    const lease1 = await lease1Res.json();
    assert.equal(lease1.job.attemptCount, 1);

    await postgresPool.query(
      `UPDATE document_ingestion_jobs SET lease_expires_at = CURRENT_TIMESTAMP - interval '5 seconds' WHERE id = $1`,
      [lease1.job.id],
    );

    // Stale worker with expired leaseToken cannot complete
    const staleComplete = await fetch(
      `${baseUrl}/api/v1/internal/ingestion-jobs/${lease1.job.id}/complete`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${mintWorkerToken()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          leaseToken: lease1.job.leaseToken,
          businessId,
          documentVersionId: version.id,
          chunking: buildChunkingPayload('Retry lifecycle test.'),
        }),
      },
    );
    assert.equal(staleComplete.status, 409);

    // Attempt 2: worker-2 reclaims expired lease
    const lease2Res = await fetch(`${baseUrl}/api/v1/internal/ingestion-jobs/lease`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${mintWorkerToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ workerId: 'worker-2', leaseDurationSeconds: 60 }),
    });
    const lease2 = await lease2Res.json();
    assert.equal(lease2.job.id, lease1.job.id);
    assert.equal(lease2.job.attemptCount, 2);
    assert.notEqual(lease2.job.leaseToken, lease1.job.leaseToken);

    // Fail attempt 2 (retryable=true) -> re-queued because attemptCount (2) < maxAttempts (3)
    const fail2Res = await fetch(
      `${baseUrl}/api/v1/internal/ingestion-jobs/${lease2.job.id}/fail`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${mintWorkerToken()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          leaseToken: lease2.job.leaseToken,
          businessId,
          documentVersionId: version.id,
          errorMessage: 'Transient worker error',
          retryable: true,
        }),
      },
    );
    assert.equal(fail2Res.status, 200);
    const fail2Body = await fail2Res.json();
    assert.equal(fail2Body.job.status, 'queued');

    // Attempt 3: lease and fail -> exhausted maxAttempts (3) -> job & version & doc become 'failed'
    const lease3Res = await fetch(`${baseUrl}/api/v1/internal/ingestion-jobs/lease`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${mintWorkerToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ workerId: 'worker-3', leaseDurationSeconds: 60 }),
    });
    const lease3 = await lease3Res.json();
    assert.equal(lease3.job.attemptCount, 3);

    const fail3Res = await fetch(
      `${baseUrl}/api/v1/internal/ingestion-jobs/${lease3.job.id}/fail`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${mintWorkerToken()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          leaseToken: lease3.job.leaseToken,
          businessId,
          documentVersionId: version.id,
          errorMessage: 'Final failure',
          retryable: true,
        }),
      },
    );
    assert.equal(fail3Res.status, 200);
    assert.equal((await fail3Res.json()).job.status, 'failed');

    const docAfterFail = await (
      await fetch(`${baseUrl}/api/v1/businesses/${businessId}/documents/${document.id}`, {
        headers: { Cookie: ownerAuth.cookieHeader },
      })
    ).json();
    assert.equal(docAfterFail.document.status, 'failed');
    assert.equal(docAfterFail.versions[0].status, 'failed');
    assert.equal(docAfterFail.versions[0].failureReason, 'Final failure');

    // Staff retries failed version -> version returns to 'uploaded' and a new 'queued' job is created
    const staffRetryRes = await fetch(
      `${baseUrl}/api/v1/businesses/${businessId}/documents/${document.id}/versions/${version.id}/retry`,
      {
        method: 'POST',
        headers: { Cookie: ownerAuth.cookieHeader, 'X-CSRF-Token': ownerAuth.csrfToken },
      },
    );
    assert.equal(staffRetryRes.status, 200);
    assert.equal((await staffRetryRes.json()).version.status, 'uploaded');

    const jobsAfterRetry = await (
      await fetch(`${baseUrl}/api/v1/businesses/${businessId}/documents/${document.id}/jobs`, {
        headers: { Cookie: ownerAuth.cookieHeader },
      })
    ).json();
    assert.equal(jobsAfterRetry.jobs.length, 2);
    assert.equal(jobsAfterRetry.jobs[0].status, 'queued');
  });
});

