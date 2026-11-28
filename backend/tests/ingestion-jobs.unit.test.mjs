import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { test } from 'node:test';

const secret = 'test-internal-auth-secret-at-least-32-characters';
process.env.PORT = '3000';
process.env.NODE_ENV = 'test';
process.env.CORS_ORIGIN = 'http://localhost:5173';
process.env.AI_SERVICE_URL = 'http://127.0.0.1:8001';
process.env.AI_SERVICE_TIMEOUT_MS = '5000';
process.env.AI_INTERNAL_AUTH_SECRET = secret;
process.env.AI_INTERNAL_AUTH_ISSUER = 'onussync-backend';
process.env.AI_INTERNAL_AUTH_AUDIENCE = 'onussync-ai-backend';
process.env.DATABASE_URL = 'postgresql://test:example-password@127.0.0.1:5433/onussync';

const { signInternalServiceToken, verifyInternalWorkerToken } = await import(
  '../dist/integrations/ai/ai-auth.js'
);
const {
  validateCompleteJobInput,
  validateFailJobInput,
  validateLeaseJobInput,
} = await import('../dist/modules/ingestion-jobs/ingestion-jobs.validation.js');

test('verifyInternalWorkerToken accepts valid Python worker token and rejects forged, expired, or wrong-scope tokens', () => {
  const now = 1_700_000_000;
  const validToken = signInternalServiceToken({
    secret,
    issuer: 'onussync-ai-backend',
    audience: 'onussync-backend',
    subject: 'service:ai-worker',
    ttlSeconds: 60,
    scope: 'ingestion:worker',
    nowSeconds: now,
  });

  const verified = verifyInternalWorkerToken(validToken, 'ingestion:worker', now + 10);
  assert.equal(verified.subject, 'service:ai-worker');
  assert.equal(verified.scopes.has('ingestion:worker'), true);

  // Expired
  assert.throws(
    () => verifyInternalWorkerToken(validToken, 'ingestion:worker', now + 60),
    (err) => err.statusCode === 401 && err.code === 'INTERNAL_AUTH_REQUIRED',
  );

  // Wrong subject (e.g. Node backend token replayed against worker endpoint)
  const wrongSub = signInternalServiceToken({
    secret,
    issuer: 'onussync-ai-backend',
    audience: 'onussync-backend',
    subject: 'service:backend',
    ttlSeconds: 60,
    scope: 'ingestion:worker',
    nowSeconds: now,
  });
  assert.throws(
    () => verifyInternalWorkerToken(wrongSub, 'ingestion:worker', now + 5),
    (err) => err.statusCode === 401,
  );

  // Wrong scope -> 403
  const wrongScope = signInternalServiceToken({
    secret,
    issuer: 'onussync-ai-backend',
    audience: 'onussync-backend',
    subject: 'service:ai-worker',
    ttlSeconds: 60,
    scope: 'ai:respond',
    nowSeconds: now,
  });
  assert.throws(
    () => verifyInternalWorkerToken(wrongScope, 'ingestion:worker', now + 5),
    (err) => err.statusCode === 403 && err.code === 'INTERNAL_AUTH_FORBIDDEN',
  );

  // Tampered signature
  const [h, p] = validToken.split('.');
  assert.throws(
    () => verifyInternalWorkerToken(`${h}.${p}.tampered`, 'ingestion:worker', now + 5),
    (err) => err.statusCode === 401,
  );
});

test('ingestion job validation enforces strict payloads and bounds', () => {
  assert.deepEqual(validateLeaseJobInput({ workerId: '  worker-1  ' }), {
    workerId: 'worker-1',
    leaseDurationSeconds: 60,
  });

  assert.throws(
    () => validateLeaseJobInput({ workerId: '', leaseDurationSeconds: 60 }),
    (err) => err.statusCode === 400,
  );

  assert.throws(
    () => validateLeaseJobInput({ workerId: 'worker-1', leaseDurationSeconds: 999 }),
    (err) => err.statusCode === 400,
  );

  const ids = {
    leaseToken: randomUUID(),
    businessId: randomUUID(),
    documentVersionId: randomUUID(),
  };
  const chunkText = 'Normalized chunk text';
  const chunkSha = createHash('sha256').update(chunkText, 'utf8').digest('hex');
  const validComplete = {
    ...ids,
    chunking: {
      chunkVersion: 'chunk-v1',
      chunkMaxChars: 800,
      chunkOverlapChars: 120,
      normalizedCharCount: chunkText.length,
      normalizedSha256: chunkSha,
      chunks: [
        {
          chunkId: randomUUID(),
          chunkIndex: 0,
          headingPath: ['Guide'],
          charStart: 0,
          charEnd: chunkText.length,
          charCount: chunkText.length,
          contentSha256: chunkSha,
          chunkText,
        },
      ],
    },
  };
  assert.deepEqual(validateCompleteJobInput(validComplete), validComplete);

  const validCompleteWithIndexing = {
    ...validComplete,
    indexing: {
      embeddingModel: 'gemini-embedding-001',
      embeddingModelVersion: 'embed-v1',
      embeddingDimensions: 768,
      qdrantCollection: 'onussync_chunks__embed-v1__d768',
      indexedChunkCount: 1,
    },
  };
  assert.deepEqual(validateCompleteJobInput(validCompleteWithIndexing), validCompleteWithIndexing);

  assert.throws(
    () =>
      validateCompleteJobInput({
        ...validCompleteWithIndexing,
        indexing: { ...validCompleteWithIndexing.indexing, indexedChunkCount: 2 },
      }),
    (err) => err.statusCode === 400,
  );
  assert.throws(
    () =>
      validateCompleteJobInput({
        ...validCompleteWithIndexing,
        indexing: { ...validCompleteWithIndexing.indexing, embeddingDimensions: 64 },
      }),
    (err) => err.statusCode === 400,
  );

  // Missing chunking or tampered SHA-256 rejected
  assert.throws(
    () => validateCompleteJobInput(ids),
    (err) => err.statusCode === 400,
  );
  assert.throws(
    () => validateCompleteJobInput({
      ...validComplete,
      chunking: {
        ...validComplete.chunking,
        chunks: [{ ...validComplete.chunking.chunks[0], contentSha256: '0'.repeat(64) }],
      },
    }),
    (err) => err.statusCode === 400,
  );

  assert.deepEqual(
    validateFailJobInput({ ...ids, errorMessage: '  Network timeout  ' }),
    {
      ...ids,
      errorMessage: 'Network timeout',
      retryable: true,
      retryDelaySeconds: 0,
    },
  );

  assert.throws(
    () => validateFailJobInput({ ...ids, errorMessage: '   ' }),
    (err) => err.statusCode === 400,
  );
});

