import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { parse } from 'dotenv';

// Keep module loading independent of any developer-specific .env values.
process.env.PORT = '3000';
process.env.NODE_ENV = 'test';
process.env.CORS_ORIGIN = 'http://localhost:5173';
process.env.AI_SERVICE_URL = 'http://127.0.0.1:8001';
process.env.AI_SERVICE_TIMEOUT_MS = '5000';
const { validateEnv } = await import('../dist/config/env.js');

test('unspecified settings receive safe development defaults', () => {
  assert.deepEqual(validateEnv({}), {
    port: 3000, nodeEnv: 'development', corsOrigins: ['http://localhost:5173'],
    aiServiceUrl: 'http://127.0.0.1:8001', aiServiceTimeoutMs: 5000,
  });
});

test('valid environment values and multiple origins are parsed', () => {
  const result = validateEnv({
    PORT: '4100', NODE_ENV: 'production',
    CORS_ORIGIN: 'https://dashboard.example.com/, http://localhost:5173',
    AI_SERVICE_URL: 'https://ai.example.com:8443/', AI_SERVICE_TIMEOUT_MS: '2500',
  });
  assert.deepEqual(result, {
    port: 4100, nodeEnv: 'production',
    corsOrigins: ['https://dashboard.example.com', 'http://localhost:5173'],
    aiServiceUrl: 'https://ai.example.com:8443', aiServiceTimeoutMs: 2500,
  });
});

test('invalid ports and runtime modes fail validation', () => {
  for (const PORT of ['', '0', '-1', '65536', '3.5', '3000abc', '1e3', '   ']) {
    assert.throws(() => validateEnv({ PORT }), /PORT must be an integer between 1 and 65535/);
  }
  assert.throws(() => validateEnv({ NODE_ENV: 'staging' }), /NODE_ENV must be development, test, or production/);
});

test('wildcards, opaque origins, credentials, and URL paths cannot enter the allowlist', () => {
  for (const CORS_ORIGIN of [
    '', '*', 'null', 'not-a-url', 'ftp://example.com', 'https://user:password@example.com',
    'https://example.com/path', 'https://example.com?token=value', 'https://example.com#fragment',
    'https://example.com,',
  ]) {
    assert.throws(() => validateEnv({ CORS_ORIGIN }), /CORS_ORIGIN must contain HTTP\(S\) origins/);
  }
});

test('the trackable example contains valid non-secret configuration', () => {
  const example = parse(readFileSync(new URL('../.env.example', import.meta.url)));
  assert.deepEqual(Object.keys(example).sort(), [
    'AI_SERVICE_TIMEOUT_MS', 'AI_SERVICE_URL', 'CORS_ORIGIN', 'NODE_ENV', 'PORT',
  ]);
  assert.equal(validateEnv(example).port, 3000);
});

test('invalid AI service URLs are rejected without echoing their values', () => {
  for (const AI_SERVICE_URL of [
    '', 'not-a-url', 'file:///private', 'ftp://example.com',
    'http://user:private-value@example.com', 'http://example.com/api/v1',
    'http://example.com?token=private-value', 'http://example.com#private-value',
  ]) {
    assert.throws(() => validateEnv({ AI_SERVICE_URL }), (error) => {
      assert.match(error.message, /AI_SERVICE_URL must be an HTTP\(S\) origin/);
      assert.ok(!error.message.includes('private-value'));
      return true;
    });
  }
});

test('AI request timeouts must be bounded positive integer milliseconds', () => {
  for (const AI_SERVICE_TIMEOUT_MS of ['', '0', '-1', '1.5', '1e3', '5000ms', ' ', '60001']) {
    assert.throws(
      () => validateEnv({ AI_SERVICE_TIMEOUT_MS }),
      /AI_SERVICE_TIMEOUT_MS must be an integer between 1 and 60000/,
    );
  }
  for (const AI_SERVICE_TIMEOUT_MS of ['1', '60000']) {
    assert.equal(validateEnv({ AI_SERVICE_TIMEOUT_MS }).aiServiceTimeoutMs, Number(AI_SERVICE_TIMEOUT_MS));
  }
});
