import assert from 'node:assert/strict';
import { test } from 'node:test';

Object.assign(process.env, {
  PORT: '3000',
  NODE_ENV: 'test',
  CORS_ORIGIN: 'http://localhost:5173',
  AI_SERVICE_URL: 'http://127.0.0.1:8001',
  AI_SERVICE_TIMEOUT_MS: '5000',
  AI_INTERNAL_AUTH_SECRET: 'test-internal-auth-secret-at-least-32-characters',
  DATABASE_URL: 'postgresql://test:example-password@127.0.0.1:5433/onusai',
  DATABASE_CONNECTION_TIMEOUT_MS: '5000',
  DATABASE_IDLE_TIMEOUT_MS: '30000',
  DATABASE_QUERY_TIMEOUT_MS: '5000',
});

const {
  validateCreateConversationInput,
  validateCreateMessageInput,
  validateCreateTurnInput,
  validateListConversationsQuery,
  validateListMessagesQuery,
  validateUpdateConversationStatusInput,
} = await import('../dist/modules/conversations/conversations.validation.js');
const { HttpError } = await import('../dist/utils/http-error.js');

const sampleAssistantId = '11111111-1111-4111-8111-111111111111';
const sampleLocationId = '22222222-2222-4222-8222-222222222222';

test('conversation creation validation restricts channel to playground and checks idempotency keys', () => {
  const valid = validateCreateConversationInput(
    { assistantId: sampleAssistantId, locationId: sampleLocationId },
    'req-key-1',
  );
  assert.deepEqual(valid, {
    assistantId: sampleAssistantId,
    locationId: sampleLocationId,
    channel: 'playground',
    status: 'active',
    idempotencyKey: 'req-key-1',
  });

  // Clients cannot create visitor conversations via staff endpoints.
  assert.throws(
    () => validateCreateConversationInput({ assistantId: sampleAssistantId, channel: 'visitor' }, undefined),
    (error) => error instanceof HttpError && error.statusCode === 403 && error.code === 'FORBIDDEN_CONVERSATION_CHANNEL',
  );

  // Mismatched header vs body idempotency keys are rejected.
  assert.throws(
    () =>
      validateCreateConversationInput(
        { assistantId: sampleAssistantId, idempotencyKey: 'body-key' },
        'header-key',
      ),
    HttpError,
  );
});

test('message validation rejects assistant/system role impersonation and unsafe metadata', () => {
  const userMsg = validateCreateMessageInput(
    { role: 'user', content: '  What are your opening hours?  ', metadata: { source: 'playground', turn: 1 } },
    'msg-1',
  );
  assert.equal(userMsg.role, 'user');
  assert.equal(userMsg.content, 'What are your opening hours?');
  assert.deepEqual(userMsg.metadata, { source: 'playground', turn: 1 });
  assert.equal(userMsg.idempotencyKey, 'msg-1');

  for (const forbiddenRole of ['assistant', 'system']) {
    assert.throws(
      () => validateCreateMessageInput({ role: forbiddenRole, content: 'Spoofed reply' }, undefined),
      (error) => error instanceof HttpError && error.statusCode === 403 && error.code === 'FORBIDDEN_MESSAGE_ROLE',
    );
  }

  for (const invalid of [
    { role: 'admin', content: 'Hello' },
    { role: 'user', content: '   ' },
    { role: 'user', content: 'Hello', metadata: ['bad'] },
    { role: 'user', content: 'Hello', metadata: { nested: { bad: true } } },
    { role: 'user', content: 'Hello', metadata: { big: 'x'.repeat(4200) } },
  ]) {
    assert.throws(() => validateCreateMessageInput(invalid, undefined), HttpError);
  }
});

test('conversation status and pagination queries validate bounds strictly', () => {
  assert.deepEqual(validateUpdateConversationStatusInput({ status: 'pending_human' }), {
    status: 'pending_human',
  });
  assert.throws(() => validateUpdateConversationStatusInput({ status: 'archived' }), HttpError);

  assert.deepEqual(validateListConversationsQuery({}), { limit: 20, offset: 0 });
  assert.deepEqual(
    validateListConversationsQuery({ limit: '10', offset: '5', channel: 'playground', status: 'active' }),
    { limit: 10, offset: 5, channel: 'playground', status: 'active' },
  );
  assert.throws(() => validateListConversationsQuery({ limit: '101' }), HttpError);

  assert.deepEqual(validateListMessagesQuery({ afterSequence: '3', limit: '25' }), {
    limit: 25,
    offset: 0,
    afterSequence: 3,
  });
  assert.throws(() => validateListMessagesQuery({ offset: '-1' }), HttpError);
});

test('turn validation enforces user content bounds and blocks role spoofing', () => {
  assert.deepEqual(
    validateCreateTurnInput({ content: '  What are your Friday hours?  ' }, 'turn-1'),
    { content: 'What are your Friday hours?', idempotencyKey: 'turn-1' },
  );

  for (const role of ['assistant', 'system', 'user', 'operator']) {
    assert.throws(
      () => validateCreateTurnInput({ role, content: 'Hello' }, undefined),
      (error) => error instanceof HttpError && error.statusCode === 403 && error.code === 'FORBIDDEN_MESSAGE_ROLE',
    );
  }

  for (const invalid of [
    null,
    { content: '   ' },
    { content: 'x'.repeat(4001) },
    { content: 'Hello', extra: true },
  ]) {
    assert.throws(() => validateCreateTurnInput(invalid, undefined), HttpError);
  }
});

