import assert from 'node:assert/strict';
import { once } from 'node:events';
import { after, before, test } from 'node:test';
import express from 'express';

process.env.NODE_ENV = 'production';
process.env.PORT = '3000';
process.env.CORS_ORIGIN = 'https://dashboard.example.com,https://demo.example.com';
process.env.AI_SERVICE_URL = 'http://127.0.0.1:8001';
process.env.AI_SERVICE_TIMEOUT_MS = '5000';
process.env.AI_INTERNAL_AUTH_SECRET = 'test-internal-auth-secret-at-least-32-characters';
process.env.DATABASE_URL = 'postgresql://test:example-password@127.0.0.1:5433/onusai';
process.env.DATABASE_CONNECTION_TIMEOUT_MS = '5000';
process.env.DATABASE_IDLE_TIMEOUT_MS = '30000';
process.env.DATABASE_QUERY_TIMEOUT_MS = '5000';

const { app } = await import('../dist/app.js');
const { errorHandler } = await import('../dist/middlewares/error-handler.js');
const { HttpError } = await import('../dist/utils/http-error.js');

let server;
let baseUrl;

before(async () => {
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => new Promise((resolve, reject) => {
  server.close((error) => error ? reject(error) : resolve());
}));

test('health and public branding endpoints return centralized product branding without advertising Express', async () => {
  const { publicBranding } = await import('../../packages/branding/index.js');

  const response = await fetch(`${baseUrl}/api/v1/health`);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.status, 'ok');
  assert.equal(body.service, publicBranding.productName);
  assert.ok(Number.isFinite(Date.parse(body.timestamp)));
  assert.equal(response.headers.get('x-powered-by'), null);

  const brandingResponse = await fetch(`${baseUrl}/api/v1/branding`);
  assert.equal(brandingResponse.status, 200);
  assert.deepEqual(await brandingResponse.json(), publicBranding);
});

test('unknown root and API routes return the same JSON 404 contract', async () => {
  for (const path of ['/missing', '/api/v1/missing']) {
    const response = await fetch(`${baseUrl}${path}`);
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), {
      error: { code: 'NOT_FOUND', message: 'Route not found.' },
    });
  }
});

test('X-Request-Id middleware preserves valid correlation IDs and replaces invalid ones', async () => {
  const propagated = await fetch(`${baseUrl}/api/v1/health`, {
    headers: { 'x-request-id': 'req-trace-1234' },
  });
  assert.equal(propagated.status, 200);
  assert.equal(propagated.headers.get('x-request-id'), 'req-trace-1234');
  await propagated.arrayBuffer();

  const generated = await fetch(`${baseUrl}/api/v1/health`, {
    headers: { 'x-request-id': 'bad id!' },
  });
  assert.equal(generated.status, 200);
  const generatedId = generated.headers.get('x-request-id');
  assert.match(generatedId, /^[0-9a-f-]{36}$/);
  assert.notEqual(generatedId, 'bad id!');
  await generated.arrayBuffer();
});

test('configured origins receive CORS headers; other origins receive JSON 403', async () => {
  for (const origin of ['https://dashboard.example.com', 'https://demo.example.com']) {
    const response = await fetch(`${baseUrl}/api/v1/health`, { headers: { origin } });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('access-control-allow-origin'), origin);
    assert.equal(response.headers.get('access-control-allow-credentials'), 'true');
    assert.match(response.headers.get('vary'), /Origin/);
    await response.arrayBuffer();
  }

  const denied = await fetch(`${baseUrl}/api/v1/health`, {
    headers: { origin: 'https://untrusted.example.com' },
  });
  assert.equal(denied.status, 403);
  assert.equal(denied.headers.get('access-control-allow-origin'), null);
  assert.equal(denied.headers.get('access-control-allow-credentials'), null);
  assert.equal((await denied.json()).error.code, 'CORS_ORIGIN_DENIED');
});

test('preflight responds without requiring a business route', async () => {
  const response = await fetch(`${baseUrl}/api/v1/health`, {
    method: 'OPTIONS',
    headers: {
      origin: 'https://dashboard.example.com',
      'access-control-request-method': 'GET',
      'access-control-request-headers': 'content-type',
    },
  });
  assert.equal(response.status, 204);
  assert.equal(response.headers.get('access-control-allow-origin'), 'https://dashboard.example.com');
  assert.match(response.headers.get('access-control-allow-headers'), /content-type/i);
});

test('valid JSON reaches routing; malformed JSON is rejected without reflecting its contents', async () => {
  const valid = await fetch(`${baseUrl}/api/v1/missing`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"value":1}',
  });
  assert.equal(valid.status, 404);
  await valid.arrayBuffer();

  const invalid = await fetch(`${baseUrl}/api/v1/missing`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"private-value":',
  });
  assert.equal(invalid.status, 400);
  const body = await invalid.json();
  assert.equal(body.error.code, 'INVALID_JSON');
  assert.ok(!JSON.stringify(body).includes('private-value'));
});

test('oversized JSON and unsupported encodings use safe client errors', async () => {
  const oversized = await fetch(`${baseUrl}/api/v1/missing`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ value: 'x'.repeat(110_000) }),
  });
  assert.equal(oversized.status, 413);
  assert.equal((await oversized.json()).error.code, 'PAYLOAD_TOO_LARGE');

  const unsupported = await fetch(`${baseUrl}/api/v1/missing`, {
    method: 'POST', headers: { 'content-type': 'application/json; charset=iso-8859-1' }, body: '{}',
  });
  assert.equal(unsupported.status, 415);
  assert.equal((await unsupported.json()).error.code, 'UNSUPPORTED_ENCODING');
});

test('global middleware handles sync and async failures without leaking internal details', async (t) => {
  t.mock.method(console, 'error', () => {});

  // A test-only app exercises the actual handler without adding product endpoints.
  const failingApp = express();
  failingApp.get('/sync', () => { throw new Error('private internal details'); });
  failingApp.get('/async', async () => { throw new Error('private internal details'); });
  failingApp.get('/expected', () => { throw new HttpError(400, 'BAD_INPUT', 'Check your input.'); });
  failingApp.use(errorHandler);

  const failingServer = failingApp.listen(0, '127.0.0.1');
  await once(failingServer, 'listening');
  t.after(() => new Promise((resolve, reject) => {
    failingServer.close((error) => error ? reject(error) : resolve());
  }));
  const url = `http://127.0.0.1:${failingServer.address().port}`;

  for (const path of ['/sync', '/async']) {
    const response = await fetch(`${url}${path}`);
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), {
      error: { code: 'INTERNAL_SERVER_ERROR', message: 'An unexpected error occurred.' },
    });
  }

  const expected = await fetch(`${url}/expected`);
  assert.equal(expected.status, 400);
  assert.deepEqual(await expected.json(), { error: { code: 'BAD_INPUT', message: 'Check your input.' } });
});
