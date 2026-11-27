import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { once } from 'node:events';
import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createServer as createNetServer } from 'node:net';
import { after, before, beforeEach, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const TEST_INTERNAL_AUTH_SECRET = 'test-internal-auth-secret-at-least-32-characters';
const CROSS_LANGUAGE_FIXTURE_TOKEN =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' +
  'eyJpc3MiOiJvbnVzc3luYy1iYWNrZW5kIiwiYXVkIjoib251c3N5bmMtYWktYmFja2VuZCIsInN1YiI6InNlcnZpY2U6YmFja2VuZCIsImlhdCI6MTcwMDAwMDAwMCwiZXhwIjoxNzAwMDAwMDYwLCJqdGkiOiJmaXh0dXJlLXRva2VuLWlkLTEiLCJzY29wZSI6ImFpOmhlYWx0aCJ9.' +
  '-obfmPUdE3I0V9w_tTFG1VkmSzsIpX9V6mLAbOsEpbU';

const aiBackendDirectory = fileURLToPath(new URL('../../ai-backend', import.meta.url));
const aiBackendPython = fileURLToPath(new URL('../../ai-backend/.venv/bin/python', import.meta.url));
const backendDirectory = fileURLToPath(new URL('..', import.meta.url));
const contractFixture = JSON.parse(
  readFileSync(new URL('../../packages/ai-contract/respond-v1.fixture.json', import.meta.url), 'utf8'),
);

let upstreamServer;
let backendServer;
let backendUrl;
let upstreamUrl;
let getAiHealth;
let requestAiResponse;
let signInternalServiceToken;
let createInternalServiceToken;
let validateAiRespondRequest;
let validateAiRespondResponse;
let buildDelegationClaims;
let HttpError;
let reply;
let receivedRequests;

async function closeServer(server) {
  if (!server?.listening) return;
  await new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
    server.closeAllConnections();
  });
}

function decodeAndVerifyHs256Jwt(authorizationHeader, secret) {
  assert.ok(typeof authorizationHeader === 'string' && authorizationHeader.startsWith('Bearer '));
  const token = authorizationHeader.slice('Bearer '.length);
  const parts = token.split('.');
  assert.equal(parts.length, 3);
  const [headerB64, payloadB64, signatureB64] = parts;

  const expectedSignature = createHmac('sha256', secret)
    .update(`${headerB64}.${payloadB64}`, 'ascii')
    .digest();
  const actualSignature = Buffer.from(signatureB64, 'base64url');
  assert.equal(actualSignature.length, expectedSignature.length);
  assert.equal(timingSafeEqual(actualSignature, expectedSignature), true);

  return {
    header: JSON.parse(Buffer.from(headerB64, 'base64url').toString('utf8')),
    payload: JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')),
  };
}

function buildRespondInput(overrides = {}) {
  return {
    requestId: contractFixture.request.requestId,
    idempotencyKey: contractFixture.request.idempotencyKey,
    scope: structuredClone(contractFixture.request.scope),
    assistant: structuredClone(contractFixture.request.assistant),
    conversation: structuredClone(contractFixture.request.conversation),
    ...overrides,
  };
}

before(async () => {
  upstreamServer = createServer((request, response) => {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => {
      const rawBody = Buffer.concat(chunks).toString('utf8');
      receivedRequests.push({
        method: request.method,
        path: request.url,
        accept: request.headers.accept,
        authorization: request.headers.authorization,
        requestId: request.headers['x-request-id'],
        deadlineHeader: request.headers['x-request-deadline-ms'],
        body: rawBody ? JSON.parse(rawBody) : undefined,
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
      response.end(typeof reply.body === 'function' ? reply.body(rawBody) : reply.body);
    });
  }).listen(0, '127.0.0.1');
  await once(upstreamServer, 'listening');
  upstreamUrl = `http://127.0.0.1:${upstreamServer.address().port}`;

  Object.assign(process.env, {
    PORT: '3000', NODE_ENV: 'test', CORS_ORIGIN: 'http://localhost:5173',
    AI_SERVICE_URL: upstreamUrl, AI_SERVICE_TIMEOUT_MS: '200',
    AI_INTERNAL_AUTH_SECRET: TEST_INTERNAL_AUTH_SECRET,
    AI_INTERNAL_AUTH_TOKEN_TTL_SECONDS: '60',
    AI_INTERNAL_AUTH_ISSUER: 'onussync-backend',
    AI_INTERNAL_AUTH_AUDIENCE: 'onussync-ai-backend',
    DATABASE_URL: 'postgresql://test:example-password@127.0.0.1:5433/onussync',
    DATABASE_CONNECTION_TIMEOUT_MS: '5000', DATABASE_IDLE_TIMEOUT_MS: '30000',
    DATABASE_QUERY_TIMEOUT_MS: '5000',
  });
  const { app } = await import('../dist/app.js');
  ({ getAiHealth, requestAiResponse } = await import('../dist/integrations/ai/ai-client.js'));
  ({ signInternalServiceToken, createInternalServiceToken } = await import('../dist/integrations/ai/ai-auth.js'));
  ({
    validateAiRespondRequest,
    validateAiRespondResponse,
    buildDelegationClaims,
  } = await import('../dist/integrations/ai/ai-contract.js'));
  ({ HttpError } = await import('../dist/utils/http-error.js'));

  backendServer = app.listen(0, '127.0.0.1');
  await once(backendServer, 'listening');
  backendUrl = `http://127.0.0.1:${backendServer.address().port}`;
});

beforeEach(() => {
  reply = { statusCode: 200, contentType: 'application/json', body: '{"status":"ok","subject":"service:backend"}' };
  receivedRequests = [];
});

after(async () => {
  await closeServer(backendServer);
  await closeServer(upstreamServer);
});

async function assertAiError(statusCode, code, message, headers = {}) {
  const response = await fetch(`${backendUrl}/api/v1/ai/health`, { headers });
  assert.equal(response.status, statusCode);
  assert.deepEqual(await response.json(), { error: { code, message } });
  return response;
}

test('Node AI health route propagates X-Request-Id and sends a signed HS256 service token', async () => {
  const response = await fetch(`${backendUrl}/api/v1/ai/health`, {
    headers: { 'x-request-id': 'req-health-0001' },
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('x-request-id'), 'req-health-0001');
  assert.deepEqual(await response.json(), { status: 'ok' });
  assert.equal(receivedRequests.length, 1);

  const captured = receivedRequests[0];
  assert.equal(captured.method, 'GET');
  assert.equal(captured.path, '/api/v1/internal/health');
  assert.equal(captured.accept, 'application/json');
  assert.equal(captured.requestId, 'req-health-0001');

  const decoded = decodeAndVerifyHs256Jwt(captured.authorization, TEST_INTERNAL_AUTH_SECRET);
  assert.deepEqual(decoded.header, { alg: 'HS256', typ: 'JWT' });
  assert.equal(decoded.payload.iss, 'onussync-backend');
  assert.equal(decoded.payload.aud, 'onussync-ai-backend');
  assert.equal(decoded.payload.sub, 'service:backend');
  assert.equal(decoded.payload.scope, 'ai:health');
  assert.equal(decoded.payload.exp - decoded.payload.iat, 60);
  assert.ok(typeof decoded.payload.jti === 'string' && decoded.payload.jti.length >= 16);
});

test('internal service token signer produces deterministic cross-language fixture and rejects invalid inputs', () => {
  const deterministicToken = signInternalServiceToken({
    secret: TEST_INTERNAL_AUTH_SECRET,
    issuer: 'onussync-backend',
    audience: 'onussync-ai-backend',
    ttlSeconds: 60,
    scope: 'ai:health',
    nowSeconds: 1_700_000_000,
    jti: 'fixture-token-id-1',
  });

  assert.equal(deterministicToken, CROSS_LANGUAGE_FIXTURE_TOKEN);

  const runtimeToken = createInternalServiceToken('ai:chat');
  const runtimeVerified = decodeAndVerifyHs256Jwt(`Bearer ${runtimeToken}`, TEST_INTERNAL_AUTH_SECRET);
  assert.equal(runtimeVerified.payload.scope, 'ai:chat');

  assert.throws(
    () => signInternalServiceToken({
      secret: 'too-short',
      issuer: 'onussync-backend',
      audience: 'onussync-ai-backend',
      ttlSeconds: 60,
      scope: 'ai:health',
    }),
    /at least 32 characters/,
  );
  assert.throws(
    () => signInternalServiceToken({
      secret: TEST_INTERNAL_AUTH_SECRET,
      issuer: 'onussync-backend',
      audience: 'onussync-ai-backend',
      ttlSeconds: 0,
      scope: 'ai:health',
    }),
    /positive integer/,
  );
  assert.throws(
    () => signInternalServiceToken({
      secret: TEST_INTERNAL_AUTH_SECRET,
      issuer: 'onussync-backend',
      audience: 'onussync-ai-backend',
      ttlSeconds: 60,
      scope: '   ',
    }),
    /non-empty/,
  );
});

test('shared AI contract fixture validates in Node.js and rejects schema drift', () => {
  const validatedReq = validateAiRespondRequest(contractFixture.request);
  assert.equal(validatedReq.requestId, 'req-fixture-0001');
  const delegation = buildDelegationClaims(validatedReq);
  assert.equal(delegation.businessId, contractFixture.request.scope.businessId);
  assert.deepEqual(delegation.allowedKnowledgeScopes, ['public', 'staff_only']);

  const validatedRes = validateAiRespondResponse(contractFixture.response, 'req-fixture-0001');
  assert.equal(validatedRes.mode, 'mock');
  assert.equal(validatedRes.model, 'mock');
  assert.equal(validatedRes.promptVersion, 'respond-v1');
  assert.equal(validatedRes.grounded, false);

  const geminiRes = validateAiRespondResponse(
    { ...contractFixture.response, mode: 'gemini', model: 'gemini-2.5-flash-lite' },
    'req-fixture-0001',
  );
  assert.equal(geminiRes.mode, 'gemini');
  assert.equal(geminiRes.model, 'gemini-2.5-flash-lite');

  // Visitor channel cannot carry staff_only knowledge or staff actorType.
  const badVisitorReq = structuredClone(contractFixture.request);
  badVisitorReq.scope.channel = 'visitor';
  badVisitorReq.scope.actorType = 'visitor';
  assert.throws(() => validateAiRespondRequest(badVisitorReq), (err) => err instanceof HttpError && err.statusCode === 403);

  const mismatchedActorReq = structuredClone(contractFixture.request);
  mismatchedActorReq.scope.channel = 'visitor';
  assert.throws(() => validateAiRespondRequest(mismatchedActorReq), (err) => err instanceof HttpError && err.statusCode === 403);

  // Schema drift (extra field) and context limit violations are rejected.
  assert.throws(() => validateAiRespondRequest({ ...contractFixture.request, extra: true }), HttpError);
  assert.throws(
    () => validateAiRespondResponse({ ...contractFixture.response, extra: true }, 'req-fixture-0001'),
    /unexpected fields/,
  );
  assert.throws(
    () => validateAiRespondResponse(contractFixture.response, 'req-other-0002'),
    /requestId mismatch/,
  );
});

test('requestAiResponse sends scoped delegation, correlation ID, and deadline, and handles failures safely', async (t) => {
  t.mock.method(console, 'error', () => {});
  reply.body = JSON.stringify(contractFixture.response);

  const beforeCallMs = Date.now();
  const result = await requestAiResponse(buildRespondInput(), { timeoutMs: 150 });
  assert.equal(result.mode, 'mock');
  assert.equal(result.grounded, false);
  assert.equal(receivedRequests.length, 1);

  const captured = receivedRequests[0];
  assert.equal(captured.method, 'POST');
  assert.equal(captured.path, '/api/v1/internal/respond');
  assert.equal(captured.requestId, 'req-fixture-0001');
  assert.equal(captured.body.deadlineAtMs, Number(captured.deadlineHeader));
  assert.ok(captured.body.deadlineAtMs >= beforeCallMs + 100 && captured.body.deadlineAtMs <= Date.now() + 200);

  const jwt = decodeAndVerifyHs256Jwt(captured.authorization, TEST_INTERNAL_AUTH_SECRET);
  assert.equal(jwt.payload.scope, 'ai:respond');
  assert.equal(jwt.payload.exp - jwt.payload.iat, 1);
  assert.deepEqual(jwt.payload.delegation, buildDelegationClaims(validateAiRespondRequest(contractFixture.request)));

  // Upstream 403 -> AI_SERVICE_DELEGATION_REJECTED
  reply.statusCode = 403;
  reply.body = '{"detail":"Request context does not match signed delegation."}';
  await assert.rejects(
    requestAiResponse(buildRespondInput()),
    (err) => err instanceof HttpError && err.statusCode === 502 && err.code === 'AI_SERVICE_DELEGATION_REJECTED',
  );

  // Upstream 504 -> AI_SERVICE_TIMEOUT
  reply.statusCode = 504;
  reply.body = '{"detail":"AI request deadline exceeded."}';
  await assert.rejects(
    requestAiResponse(buildRespondInput()),
    (err) => err instanceof HttpError && err.statusCode === 504 && err.code === 'AI_SERVICE_TIMEOUT',
  );

  // Upstream 429 -> AI_RATE_LIMITED
  reply.statusCode = 429;
  reply.body = '{"detail":"AI provider rate limit exceeded."}';
  await assert.rejects(
    requestAiResponse(buildRespondInput()),
    (err) => err instanceof HttpError && err.statusCode === 429 && err.code === 'AI_RATE_LIMITED',
  );

  // Upstream schema drift -> AI_SERVICE_INVALID_RESPONSE
  reply.statusCode = 200;
  reply.body = JSON.stringify({ ...contractFixture.response, requestId: 'wrong-request-id' });
  await assert.rejects(
    requestAiResponse(buildRespondInput()),
    (err) => err instanceof HttpError && err.statusCode === 502 && err.code === 'AI_SERVICE_INVALID_RESPONSE',
  );

  // Invalid caller timeoutMs -> 400
  await assert.rejects(
    requestAiResponse(buildRespondInput(), { timeoutMs: 0 }),
    (err) => err instanceof HttpError && err.statusCode === 400,
  );
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

test('upstream 401 and 403 rejections produce safe 502 errors without leaking secrets or tokens', async (t) => {
  const errorLog = t.mock.method(console, 'error', () => {});
  reply.body = '{"detail":"private-upstream-token-or-secret"}';

  reply.statusCode = 401;
  await assertAiError(502, 'AI_SERVICE_AUTH_FAILED', 'AI service authentication failed.');

  reply.statusCode = 403;
  await assertAiError(502, 'AI_SERVICE_DELEGATION_REJECTED', 'AI service rejected request authorization.');

  const serializedLogs = JSON.stringify(errorLog.mock.calls);
  assert.ok(!serializedLogs.includes('private-upstream-token-or-secret'));
  assert.ok(!serializedLogs.includes(TEST_INTERNAL_AUTH_SECRET));
  assert.ok(!serializedLogs.includes('Bearer '));
});

test('upstream error statuses and empty responses produce safe 502 errors', async (t) => {
  const errorLog = t.mock.method(console, 'error', () => {});
  reply.body = '{"detail":"private-value"}';

  for (const statusCode of [204, 404, 500, 503]) {
    reply.statusCode = statusCode;
    await assertAiError(502, 'AI_SERVICE_INVALID_RESPONSE', 'AI service returned an invalid response.');
  }
  assert.equal(receivedRequests.length, 4);
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

async function reserveEphemeralPort() {
  const probe = createNetServer().listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const { port } = probe.address();
  await new Promise((resolve) => probe.close(resolve));
  return port;
}

test('live Node.js to FastAPI internal auth, respond contract, forged delegation, and correlation IDs', {
  skip: !existsSync(aiBackendPython),
  timeout: 15_000,
}, async (t) => {
  const aiPort = await reserveEphemeralPort();
  const nodePort = await reserveEphemeralPort();
  const mismatchedNodePort = await reserveEphemeralPort();
  const sharedSecret = 'live-cross-service-shared-secret-32-chars-min';

  const aiChild = spawn(
    aiBackendPython,
    ['-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', String(aiPort)],
    {
      cwd: aiBackendDirectory,
      env: {
        ...process.env,
        AI_INTERNAL_AUTH_SECRET: sharedSecret,
        AI_GENERATION_MODE: 'mock',
        AI_LOG_LEVEL: 'WARNING',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  let aiLogs = '';
  aiChild.stdout.on('data', (chunk) => { aiLogs += chunk; });
  aiChild.stderr.on('data', (chunk) => { aiLogs += chunk; });
  t.after(async () => {
    if (aiChild.exitCode === null && aiChild.signalCode === null) {
      aiChild.kill('SIGTERM');
      await once(aiChild, 'exit');
    }
  });

  const aiDeadline = Date.now() + 8000;
  let aiReady = false;
  while (Date.now() < aiDeadline) {
    assert.equal(aiChild.exitCode, null, `FastAPI exited early: ${aiLogs}`);
    try {
      const probe = await fetch(`http://127.0.0.1:${aiPort}/api/v1/health`);
      if (probe.status === 200) {
        await probe.arrayBuffer();
        aiReady = true;
        break;
      }
    } catch {
      // Wait for Uvicorn socket startup.
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.ok(aiReady, `FastAPI did not become ready: ${aiLogs}`);

  // Direct unauthenticated access to /api/v1/internal/health must be rejected.
  const unauthenticated = await fetch(`http://127.0.0.1:${aiPort}/api/v1/internal/health`);
  assert.equal(unauthenticated.status, 401);
  assert.equal(unauthenticated.headers.get('www-authenticate'), 'Bearer');
  await unauthenticated.arrayBuffer();

  async function spawnNodeBackend(port, secret) {
    const child = spawn(process.execPath, ['dist/server.js'], {
      cwd: backendDirectory,
      env: {
        ...process.env,
        PORT: String(port),
        NODE_ENV: 'test',
        CORS_ORIGIN: 'http://localhost:5173',
        AI_SERVICE_URL: `http://127.0.0.1:${aiPort}`,
        AI_SERVICE_TIMEOUT_MS: '3000',
        AI_INTERNAL_AUTH_SECRET: secret,
        DATABASE_URL: 'postgresql://test:example-password@127.0.0.1:5433/onussync',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', (chunk) => { output += chunk; });
    t.after(async () => {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGTERM');
        await once(child, 'exit');
      }
    });
    const deadline = Date.now() + 5000;
    while (!output.includes('business API listening')) {
      assert.ok(Date.now() < deadline, `Node server timed out: ${output}`);
      assert.equal(child.exitCode, null, `Node exited early: ${output}`);
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    return child;
  }

  await spawnNodeBackend(nodePort, sharedSecret);
  const okResponse = await fetch(`http://127.0.0.1:${nodePort}/api/v1/ai/health`, {
    headers: { 'x-request-id': 'req-live-e2e-01' },
  });
  assert.equal(okResponse.status, 200);
  assert.equal(okResponse.headers.get('x-request-id'), 'req-live-e2e-01');
  assert.deepEqual(await okResponse.json(), { status: 'ok' });

  await spawnNodeBackend(mismatchedNodePort, 'mismatched-secret-at-least-32-characters-long');
  const badResponse = await fetch(`http://127.0.0.1:${mismatchedNodePort}/api/v1/ai/health`);
  assert.equal(badResponse.status, 502);
  assert.deepEqual(await badResponse.json(), {
    error: { code: 'AI_SERVICE_AUTH_FAILED', message: 'AI service authentication failed.' },
  });

  // Exercise real Node.js -> FastAPI POST /api/v1/internal/respond contract and forged delegation rejection.
  const liveClientProcess = spawn(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `
      import assert from 'node:assert/strict';
      const { requestAiResponse, getAiHealth } = await import('./dist/integrations/ai/ai-client.js');
      const { signInternalServiceToken } = await import('./dist/integrations/ai/ai-auth.js');
      const fixture = ${JSON.stringify(contractFixture.request)};
      const health = await getAiHealth('req-live-health-1');
      assert.deepEqual(health, { status: 'ok' });

      const respondInput = {
        requestId: 'req-live-respond-1',
        idempotencyKey: fixture.idempotencyKey,
        scope: fixture.scope,
        assistant: fixture.assistant,
        conversation: fixture.conversation,
      };
      const aiReply = await requestAiResponse(respondInput, { timeoutMs: 2500 });
      assert.equal(aiReply.contractVersion, '1.0');
      assert.equal(aiReply.requestId, 'req-live-respond-1');
      assert.equal(aiReply.mode, 'mock');
      assert.equal(aiReply.grounded, false);
      assert.equal(aiReply.status, 'completed');
      assert.ok(aiReply.answer.includes('Alpha Concierge'));

      // Forged delegation: token signed for businessId 1111..., body claims 9999...
      const forgedToken = signInternalServiceToken({
        secret: process.env.AI_INTERNAL_AUTH_SECRET,
        issuer: 'onussync-backend',
        audience: 'onussync-ai-backend',
        ttlSeconds: 60,
        scope: 'ai:respond',
        delegation: {
          ...fixture.scope,
          allowedTools: fixture.assistant.allowedTools,
          allowedKnowledgeScopes: fixture.assistant.allowedKnowledgeScopes,
          knowledgeLocationScope: fixture.assistant.knowledgeLocationScope,
          knowledgeLocationIds: fixture.assistant.knowledgeLocationIds,
        },
      });
      const forgedBody = {
        ...fixture,
        requestId: 'req-forged-0001',
        deadlineAtMs: Date.now() + 2500,
        scope: { ...fixture.scope, businessId: '99999999-9999-4999-8999-999999999999' },
      };
      const forgedRes = await fetch(process.env.AI_SERVICE_URL + '/api/v1/internal/respond', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer ' + forgedToken,
          'x-request-id': 'req-forged-0001',
        },
        body: JSON.stringify(forgedBody),
      });
      assert.equal(forgedRes.status, 403);
      assert.equal(forgedRes.headers.get('x-request-id'), 'req-forged-0001');
      console.log('LIVE_CROSS_LANGUAGE_RESPOND_OK');
      `,
    ],
    {
      cwd: backendDirectory,
      env: {
        ...process.env,
        PORT: '3000',
        NODE_ENV: 'test',
        CORS_ORIGIN: 'http://localhost:5173',
        AI_SERVICE_URL: `http://127.0.0.1:${aiPort}`,
        AI_SERVICE_TIMEOUT_MS: '3000',
        AI_INTERNAL_AUTH_SECRET: sharedSecret,
        DATABASE_URL: 'postgresql://test:example-password@127.0.0.1:5433/onussync',
      },
      encoding: 'utf8',
    },
  );
  let liveOut = '';
  liveClientProcess.stdout.on('data', (c) => { liveOut += c; });
  liveClientProcess.stderr.on('data', (c) => { liveOut += c; });
  const [liveCode] = await once(liveClientProcess, 'exit');
  assert.equal(liveCode, 0, liveOut);
  assert.match(liveOut, /LIVE_CROSS_LANGUAGE_RESPOND_OK/);
});
