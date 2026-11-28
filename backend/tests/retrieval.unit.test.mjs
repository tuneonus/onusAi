import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';

process.env.PORT = '3000';
process.env.NODE_ENV = 'test';
process.env.CORS_ORIGIN = 'http://localhost:5173';
process.env.AI_SERVICE_URL = 'http://127.0.0.1:8001';
process.env.AI_SERVICE_TIMEOUT_MS = '5000';
process.env.AI_INTERNAL_AUTH_SECRET = 'test-internal-auth-secret-at-least-32-characters';
process.env.DATABASE_URL = 'postgresql://test:example-password@127.0.0.1:5433/onussync';

const {
  validateKnowledgeSearchInput,
  validateRetrievalCandidatesInput,
} = await import('../dist/modules/retrieval/retrieval.validation.js');

test('validateKnowledgeSearchInput validates query, bounds, and rejects unknown fields', () => {
  assert.deepEqual(validateKnowledgeSearchInput({ query: '  Check-in policy  ', topK: 3, scoreThreshold: 0.5 }), {
    query: 'Check-in policy',
    topK: 3,
    scoreThreshold: 0.5,
  });

  assert.throws(
    () => validateKnowledgeSearchInput({ query: '   ' }),
    (err) => err.statusCode === 400,
  );
  assert.throws(
    () => validateKnowledgeSearchInput({ query: 'ok', topK: 25 }),
    (err) => err.statusCode === 400,
  );
  assert.throws(
    () => validateKnowledgeSearchInput({ query: 'ok', scoreThreshold: 1.5 }),
    (err) => err.statusCode === 400,
  );
  assert.throws(
    () => validateKnowledgeSearchInput({ query: 'ok', businessId: randomUUID() }),
    (err) => err.statusCode === 400,
  );
});

test('validateRetrievalCandidatesInput enforces strict candidate structure', () => {
  const biz = randomUUID();
  const doc = randomUUID();
  const ver = randomUUID();
  const chunk = randomUUID();

  const valid = validateRetrievalCandidatesInput({
    businessId: biz,
    allowedVisibilities: ['public'],
    allowedLocationIds: null,
    includeBusinessWide: true,
    candidates: [{ documentId: doc, documentVersionId: ver, chunkId: chunk, score: 0.88 }],
  });
  assert.equal(valid.candidates.length, 1);

  assert.throws(
    () =>
      validateRetrievalCandidatesInput({
        businessId: biz,
        allowedVisibilities: ['invalid'],
        candidates: [],
      }),
    (err) => err.statusCode === 400,
  );
});

