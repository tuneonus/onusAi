import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { request } from 'node:http';
import { createServer } from 'node:net';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const backendDirectory = fileURLToPath(new URL('../', import.meta.url));

function serverEnvironment(port) {
  return {
    ...process.env, PORT: String(port), NODE_ENV: 'production', CORS_ORIGIN: 'http://localhost:5173',
    AI_SERVICE_URL: 'http://127.0.0.1:8001', AI_SERVICE_TIMEOUT_MS: '5000',
    AI_INTERNAL_AUTH_SECRET: 'test-internal-auth-secret-at-least-32-characters',
    DATABASE_URL: 'postgresql://test:example-password@127.0.0.1:5433/onusai',
    DATABASE_CONNECTION_TIMEOUT_MS: '5000', DATABASE_IDLE_TIMEOUT_MS: '30000',
    DATABASE_QUERY_TIMEOUT_MS: '5000',
  };
}

async function startServer(t) {
  const reservation = createServer().listen(0, '127.0.0.1');
  await once(reservation, 'listening');
  const port = reservation.address().port;
  await new Promise((resolve) => reservation.close(resolve));

  const child = spawn(process.execPath, ['dist/server.js'], {
    cwd: backendDirectory, env: serverEnvironment(port), stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk; });
  child.stderr.on('data', (chunk) => { output += chunk; });
  const exited = once(child, 'exit');
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGKILL');
    }
    await exited;
  });

  async function waitForOutput(text) {
    const deadline = Date.now() + 5_000;
    while (!output.includes(text)) {
      assert.ok(Date.now() < deadline, `Timed out waiting for ${text}: ${output}`);
      assert.equal(child.exitCode, null, output);
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  await waitForOutput('business API listening');
  return { child, port, exited, waitForOutput, output: () => output };
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  test(`production server starts, serves health, and exits cleanly on ${signal}`, { timeout: 10_000 }, async (t) => {
    const server = await startServer(t);
    const response = await fetch(`http://127.0.0.1:${server.port}/api/v1/health`);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).status, 'ok');
    server.child.kill(signal);
    const [code, exitSignal] = await server.exited;
    assert.equal(code, 0, server.output());
    assert.equal(exitSignal, null);
    assert.match(server.output(), /HTTP server stopped/);
    assert.match(server.output(), /PostgreSQL pool closed/);
  });
}

async function beginPartialRequest(t, server) {
  const body = '{"value":true}';
  const req = request({
    hostname: '127.0.0.1', port: server.port, method: 'POST', path: '/api/v1/missing',
    headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) },
  });
  // Forced shutdown is expected to reset this socket; consume the error.
  req.on('error', () => {});
  t.after(() => req.destroy());
  req.write(body.slice(0, 5));
  await once(req, 'socket');

  // A second completed request confirms the server is handling connections.
  const health = await fetch(`http://127.0.0.1:${server.port}/api/v1/health`);
  assert.equal(health.status, 200);
  await health.arrayBuffer();
  return { req, remainingBody: body.slice(5) };
}

test('shutdown drains an in-flight request and tolerates repeated signals', { timeout: 10_000 }, async (t) => {
  const server = await startServer(t);
  const { req, remainingBody } = await beginPartialRequest(t, server);
  server.child.kill('SIGTERM');
  await server.waitForOutput('Received SIGTERM');
  assert.equal(server.child.exitCode, null);
  server.child.kill('SIGINT');

  const responseReceived = once(req, 'response');
  req.end(remainingBody);
  const [response] = await responseReceived;
  assert.equal(response.statusCode, 404);
  response.resume();
  await once(response, 'end');
  const [code] = await server.exited;
  assert.equal(code, 0, server.output());
});

test('invalid database settings prevent startup without exposing credentials', () => {
  for (const [name, value] of [
    ['DATABASE_URL', 'https://user:private-value@example.com/database'],
    ['DATABASE_URL', ''],
    ['DATABASE_CONNECTION_TIMEOUT_MS', '0'],
    ['DATABASE_IDLE_TIMEOUT_MS', '0'],
    ['DATABASE_QUERY_TIMEOUT_MS', '0'],
  ]) {
    const result = spawnSync(process.execPath, ['dist/server.js'], {
      cwd: backendDirectory,
      env: { ...serverEnvironment(3000), [name]: value },
      encoding: 'utf8', timeout: 5_000,
    });
    assert.equal(result.status, 1);
    assert.ok(result.stderr.includes(`${name} must be`));
    assert.ok(!result.stderr.includes('private-value'));
    assert.ok(!result.stdout.includes('business API listening'));
  }
});

test('shutdown force-closes a stuck request after the deadline', { timeout: 15_000 }, async (t) => {
  const server = await startServer(t);
  await beginPartialRequest(t, server);
  server.child.kill('SIGTERM');
  const [code, exitSignal] = await server.exited;
  assert.equal(code, 1, server.output());
  assert.equal(exitSignal, null);
  assert.match(server.output(), /Shutdown timed out/);
});

test('an occupied port fails startup with a nonzero exit code', { timeout: 10_000 }, async (t) => {
  const occupied = createServer().listen(0, '127.0.0.1');
  await once(occupied, 'listening');
  t.after(() => new Promise((resolve) => occupied.close(resolve)));
  const result = spawnSync(process.execPath, ['dist/server.js'], {
    cwd: backendDirectory, env: serverEnvironment(occupied.address().port), encoding: 'utf8', timeout: 5_000,
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /EADDRINUSE/);
  assert.ok(!result.stdout.includes('business API listening'));
});

test('invalid configuration prevents the production server from listening', () => {
  const result = spawnSync(process.execPath, ['dist/server.js'], {
    cwd: backendDirectory, env: serverEnvironment('invalid'), encoding: 'utf8', timeout: 5_000,
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /PORT must be an integer/);
  assert.ok(!result.stdout.includes('business API listening'));
});

test('invalid AI connection settings prevent startup without exposing their values', () => {
  for (const [name, value] of [
    ['AI_SERVICE_URL', 'http://user:private-value@example.com'],
    ['AI_SERVICE_TIMEOUT_MS', '0'],
    ['AI_INTERNAL_AUTH_SECRET', 'short-private-value'],
    ['AI_INTERNAL_AUTH_TOKEN_TTL_SECONDS', '0'],
  ]) {
    const result = spawnSync(process.execPath, ['dist/server.js'], {
      cwd: backendDirectory,
      env: { ...serverEnvironment(3000), [name]: value },
      encoding: 'utf8', timeout: 5_000,
    });
    assert.equal(result.status, 1);
    assert.ok(result.stderr.includes(`${name} must be`));
    assert.ok(!result.stderr.includes('private-value'));
    assert.ok(!result.stdout.includes('business API listening'));
  }
});
