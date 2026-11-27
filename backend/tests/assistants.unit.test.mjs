import assert from 'node:assert/strict';
import { test } from 'node:test';

Object.assign(process.env, {
  PORT: '3000',
  NODE_ENV: 'test',
  CORS_ORIGIN: 'http://localhost:5173',
  AI_SERVICE_URL: 'http://127.0.0.1:8001',
  AI_SERVICE_TIMEOUT_MS: '5000',
  AI_INTERNAL_AUTH_SECRET: 'test-internal-auth-secret-at-least-32-characters',
  DATABASE_URL: 'postgresql://test:example-password@127.0.0.1:5433/onussync',
  DATABASE_CONNECTION_TIMEOUT_MS: '5000',
  DATABASE_IDLE_TIMEOUT_MS: '30000',
  DATABASE_QUERY_TIMEOUT_MS: '5000',
});

const { publicBranding } = await import('../../packages/branding/index.js');
const { branding } = await import('../dist/config/branding.js');
const { toPublicAssistantProfile } = await import('../dist/modules/assistants/assistants.service.js');
const {
  validateAllowedKnowledgeScopes,
  validateAllowedTools,
  validateCreateAssistantInput,
  validateCreateDraftVersionInput,
  validateModelSettings,
  validatePublishInput,
  validateUpdateDraftVersionInput,
} = await import('../dist/modules/assistants/assistants.validation.js');
const { HttpError } = await import('../dist/utils/http-error.js');

const sampleLocationId = '550e8400-e29b-41d4-a716-446655440000';

test('centralized branding package is shared with backend without duplicate literals', () => {
  assert.deepEqual(branding, publicBranding);
  assert.equal(branding.productName, 'OnusSync');
  assert.ok(branding.tagline.length > 0);
  assert.ok(branding.attributionText.includes(branding.productName));
});

test('assistant creation validation applies safe defaults and rejects unsafe settings or unapproved tools', () => {
  const minimal = validateCreateAssistantInput({
    displayName: '  Concierge  ',
    welcomeMessage: '  Welcome! How can I help?  ',
    systemInstructions: '  Follow business hours and approved docs only.  ',
    fallbackMessage: '  I could not verify that. Let me connect you with staff.  ',
  });
  assert.equal(minimal.locationId, null);
  assert.equal(minimal.displayName, 'Concierge');
  assert.equal(minimal.language, 'en');
  assert.equal(minimal.tone, 'professional');
  assert.deepEqual(minimal.allowedTools, []);
  assert.deepEqual(minimal.allowedKnowledgeScopes, ['public']);
  assert.equal(minimal.knowledgeLocationScope, 'business_wide');
  assert.deepEqual(minimal.knowledgeLocationIds, []);

  // Unapproved tools are rejected with UNAPPROVED_TOOL_SCOPE.
  assert.throws(
    () => validateAllowedTools(['lookup_availability', 'execute_sql']),
    (error) => error instanceof HttpError && error.code === 'UNAPPROVED_TOOL_SCOPE',
  );
  assert.throws(
    () => validateAllowedTools('lookup_availability'),
    (error) => error instanceof HttpError && error.statusCode === 400,
  );
  assert.deepEqual(
    validateAllowedTools(['lookup_availability', 'lookup_availability', 'request_human_handoff']),
    ['lookup_availability', 'request_human_handoff'],
  );

  // Unsafe model settings are rejected.
  for (const badModel of [
    { temperature: 1.5 },
    { temperature: -0.1 },
    { maxOutputTokens: 32 },
    { maxOutputTokens: 4096 },
    { maxContextMessages: 0 },
    { maxContextMessages: 50 },
    { modelName: 'arbitrary' },
  ]) {
    assert.throws(() => validateModelSettings(badModel), HttpError);
  }

  // Knowledge scope validation.
  assert.throws(() => validateAllowedKnowledgeScopes(['public', 'admin']), HttpError);
  assert.throws(
    () =>
      validateCreateAssistantInput({
        displayName: 'Invalid Scope',
        welcomeMessage: 'Hi',
        systemInstructions: 'Help',
        fallbackMessage: 'Fallback',
        knowledgeLocationScope: 'assigned_location',
      }),
    HttpError,
  );
  assert.throws(
    () =>
      validateCreateAssistantInput({
        displayName: 'Missing Selected Locations',
        welcomeMessage: 'Hi',
        systemInstructions: 'Help',
        fallbackMessage: 'Fallback',
        knowledgeLocationScope: 'selected_locations',
        knowledgeLocationIds: [],
      }),
    HttpError,
  );
  assert.throws(
    () =>
      validateCreateAssistantInput({
        displayName: 'Extra Location IDs',
        welcomeMessage: 'Hi',
        systemInstructions: 'Help',
        fallbackMessage: 'Fallback',
        knowledgeLocationScope: 'business_wide',
        knowledgeLocationIds: [sampleLocationId],
      }),
    HttpError,
  );
});

test('draft, patch, and publish input validation enforce strict payloads', () => {
  assert.deepEqual(validateCreateDraftVersionInput(undefined), {});
  assert.throws(() => validateCreateDraftVersionInput({ unknown: 1 }), HttpError);
  assert.throws(() => validateUpdateDraftVersionInput({}), HttpError);
  assert.throws(() => validatePublishInput({ force: true }), HttpError);
  assert.doesNotThrow(() => validatePublishInput(undefined));
  assert.doesNotThrow(() => validatePublishInput({}));
});

test('public assistant projection omits private systemInstructions and internal scopes', () => {
  const projection = toPublicAssistantProfile(
    {
      id: '11111111-1111-4111-8111-111111111111',
      businessId: '22222222-2222-4222-8222-222222222222',
      locationId: sampleLocationId,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: '33333333-3333-4333-8333-333333333333',
      assistantId: '11111111-1111-4111-8111-111111111111',
      businessId: '22222222-2222-4222-8222-222222222222',
      versionNumber: 2,
      status: 'published',
      displayName: 'Downtown Reception',
      description: 'Booking helper',
      welcomeMessage: 'Hello!',
      systemInstructions: 'TOP_SECRET_SYSTEM_PROMPT',
      language: 'en-US',
      tone: 'friendly',
      fallbackMessage: 'Fallback',
      modelSettings: { temperature: 0.2, maxOutputTokens: 512, maxContextMessages: 10 },
      allowedTools: ['lookup_availability'],
      allowedKnowledgeScopes: ['public', 'staff_only'],
      knowledgeLocationScope: 'assigned_location',
      knowledgeLocationIds: [],
      createdByUserId: null,
      publishedByUserId: null,
      publishedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  );

  const serialized = JSON.stringify(projection);
  assert.ok(!serialized.includes('TOP_SECRET_SYSTEM_PROMPT'));
  assert.ok(!('systemInstructions' in projection));
  assert.ok(!('modelSettings' in projection));
  assert.ok(!('allowedTools' in projection));
  assert.ok(!('allowedKnowledgeScopes' in projection));
  assert.equal(projection.displayName, 'Downtown Reception');
  assert.equal(projection.versionNumber, 2);
});

