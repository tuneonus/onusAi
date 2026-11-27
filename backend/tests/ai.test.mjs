import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { after, before, beforeEach, test } from 'node:test';

let upstreamServer;
let backendServer;
let backendUrl;
let upstreamUrl;
let getAiHealth;
let reply;
let receivedRequests;

async function closeServer(server) {
  if (!server?.listening) return;
  await new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
    server.closeAllConnections();
  });
}

before(async () => {
  upstreamServer = createServer((request, response) => {
    receivedRequests.push({
      method: request.method, path: request.url, accept: request.headers.accept,
    });

    if (reply.mode === 'disconnect') {
      request.socket.destroy();
      return;
    }
    if (reply.mode === 'stall-headers') return;

    response.writeHead(reply.statusCode, {
      'content-type': reply.contentType, ...reply.headers,
    });
    if (reply.mode === 'stall-body') {
      response.write('{"status":');
      return;
    }
    response.end(reply.body);
  }).listen(0, '127.0.0.1');
  await once(upstreamServer, 'listening');
  upstreamUrl = `http://127.0.0.1:${upstreamServer.address().port}`;

  Object.assign(process.env, {
    PORT: '3000', NODE_ENV: 'test', CORS_ORIGIN: 'http://localhost:5173',
    AI_SERVICE_URL: upstreamUrl, AI_SERVICE_TIMEOUT_MS: '200',
    DATABASE_URL: 'postgresql://test:example-password@127.0.0.1:5433/onusai',
    DATABASE_CONNECTION_TIMEOUT_MS: '5000', DATABASE_IDLE_TIMEOUT_MS: '30000',
    DATABASE_QUERY_TIMEOUT_MS: '5000',
  });
  const { app } = await import('../dist/app.js');
  ({ getAiHealth } = await import('../dist/integrations/ai/ai-client.js'));

  backendServer = app.listen(0, '127.0.0.1');
  await once(backendServer, 'listening');
  backendUrl = `http://127.0.0.1:${backendServer.address().port}`;
});

beforeEach(() => {
  reply = { statusCode: 200, contentType: 'application/json', body: '{"status":"ok"}' };
  receivedRequests = [];
});

after(async () => {
  await closeServer(backendServer);
  await closeServer(upstreamServer);
});

async function assertAiError(statusCode, code, message) {
  const response = await fetch(`${backendUrl}/api/v1/ai/health`);
  assert.equal(response.status, statusCode);
  assert.deepEqual(await response.json(), { error: { code, message } });
}

test('Node AI health route requests the existing FastAPI health contract', async () => {
  const response = await fetch(`${backendUrl}/api/v1/ai/health`);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 'ok' });
  assert.deepEqual(receivedRequests, [{
    method: 'GET', path: '/api/v1/health', accept: 'application/json',
  }]);
});

test('the AI client can also be called independently of the route', async () => {
  assert.deepEqual(await getAiHealth(), { status: 'ok' });
});

test('successful responses expose only the agreed health fields', async () => {
  reply.contentType = 'application/json; charset=utf-8';
  reply.body = '{"status":"ok","internal":"private-value"}';
  const response = await fetch(`${backendUrl}/api/v1/ai/health`);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 'ok' });
});

test('upstream error statuses and empty responses produce safe 502 errors', async (t) => {
  const errorLog = t.mock.method(console, 'error', () => {});
  reply.body = '{"detail":"private-value"}';

  for (const statusCode of [204, 401, 404, 500, 503]) {
    reply.statusCode = statusCode;
    await assertAiError(502, 'AI_SERVICE_INVALID_RESPONSE', 'AI service returned an invalid response.');
  }
  assert.equal(receivedRequests.length, 5);
  assert.ok(!JSON.stringify(errorLog.mock.calls).includes('private-value'));
});

test('malformed JSON and unexpected health schemas produce safe 502 errors', async (t) => {
  t.mock.method(console, 'error', () => {});

  for (const body of [
    'private-value{', 'null', '[]', '"ok"', '{}', '{"status":true}', '{"status":"unhealthy"}',
  ]) {
    reply.body = body;
    await assertAiError(502, 'AI_SERVICE_INVALID_RESPONSE', 'AI service returned an invalid response.');
  }
});

test('non-JSON content types are rejected even if the body looks valid', async (t) => {
  t.mock.method(console, 'error', () => {});
  reply.contentType = 'text/html';

  await assertAiError(502, 'AI_SERVICE_INVALID_RESPONSE', 'AI service returned an invalid response.');
});

test('upstream redirects are rejected without making another request', async (t) => {
  t.mock.method(console, 'error', () => {});
  reply.statusCode = 302;
  reply.headers = { location: `${upstreamUrl}/private-value` };

  await assertAiError(502, 'AI_SERVICE_INVALID_RESPONSE', 'AI service returned an invalid response.');
  assert.equal(receivedRequests.length, 1);
});

test('a connection closed before response headers produces a safe 503 error', async (t) => {
  t.mock.method(console, 'error', () => {});
  reply.mode = 'disconnect';

  await assertAiError(503, 'AI_SERVICE_UNAVAILABLE', 'AI service is unavailable.');
});

for (const mode of ['stall-headers', 'stall-body']) {
  test(`the configured timeout covers ${mode}`, { timeout: 3000 }, async (t) => {
    t.mock.method(console, 'error', () => {});
    reply.mode = mode;

    await assertAiError(504, 'AI_SERVICE_TIMEOUT', 'AI service request timed out.');
  });
}

// Last: shut down the fixture to exercise an actual refused connection.
test('FastAPI unavailability does not prevent Node liveness checks', async (t) => {
  t.mock.method(console, 'error', () => {});
  await closeServer(upstreamServer);

  await assertAiError(503, 'AI_SERVICE_UNAVAILABLE', 'AI service is unavailable.');
  const response = await fetch(`${backendUrl}/api/v1/health`);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).status, 'ok');
});
