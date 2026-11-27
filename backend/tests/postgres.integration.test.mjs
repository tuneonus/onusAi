import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';

const databaseUrl = process.env.TEST_DATABASE_URL;
const backendDirectory = fileURLToPath(new URL('../', import.meta.url));

// Opt in explicitly; regular tests never require or modify a developer database.
test('live PostgreSQL: queries, reuse, timeouts, idle eviction, and recovery', {
  skip: !databaseUrl, timeout: 15_000,
}, async (t) => {
  Object.assign(process.env, {
    PORT: '3000', NODE_ENV: 'test', CORS_ORIGIN: 'http://localhost:5173',
    AI_SERVICE_URL: 'http://127.0.0.1:8001', AI_SERVICE_TIMEOUT_MS: '5000',
    AI_INTERNAL_AUTH_SECRET: 'test-internal-auth-secret-at-least-32-characters',
    DATABASE_URL: databaseUrl, DATABASE_CONNECTION_TIMEOUT_MS: '1000',
    DATABASE_IDLE_TIMEOUT_MS: '1000', DATABASE_QUERY_TIMEOUT_MS: '500',
  });
  const { postgresPool, closeDatabasePool } = await import('../dist/integrations/database/postgres.js');
  const { app } = await import('../dist/app.js');
  t.after(() => closeDatabasePool());

  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const readinessUrl = `http://127.0.0.1:${server.address().port}/api/v1/health/ready`;

  const response = await fetch(readinessUrl);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 'ok', database: 'ready' });

  const first = await postgresPool.query('SELECT pg_backend_pid() AS pid, $1::integer AS value', [42]);
  const second = await postgresPool.query('SELECT pg_backend_pid() AS pid');
  assert.equal(first.rows[0].value, 42);
  assert.equal(first.rows[0].pid, second.rows[0].pid, 'Sequential queries should reuse a connection.');
  assert.equal(postgresPool.totalCount, 1);
  assert.equal(postgresPool.idleCount, 1);

  // Read-only sleep exceeds both the server statement limit and client query limit.
  await assert.rejects(postgresPool.query('SELECT pg_sleep(2)'));
  assert.equal(postgresPool.totalCount, 0, 'A failed query must discard its connection.');
  const recovered = await fetch(readinessUrl);
  assert.equal(recovered.status, 200);
  await recovered.arrayBuffer();

  const deadline = Date.now() + 3000;
  while (postgresPool.totalCount > 0 && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.equal(postgresPool.totalCount, 0, 'Idle connections should be evicted.');
  assert.equal(postgresPool.waitingCount, 0);
});

async function startServer(t, url) {
  const reservation = createServer().listen(0, '127.0.0.1');
  await once(reservation, 'listening');
  const port = reservation.address().port;
  await new Promise((resolve) => reservation.close(resolve));

  const child = spawn(process.execPath, ['dist/server.js'], {
    cwd: backendDirectory,
    env: {
      ...process.env, PORT: String(port), NODE_ENV: 'test', CORS_ORIGIN: 'http://localhost:5173',
      AI_SERVICE_URL: 'http://127.0.0.1:8001', AI_SERVICE_TIMEOUT_MS: '5000',
      AI_INTERNAL_AUTH_SECRET: 'test-internal-auth-secret-at-least-32-characters',
      DATABASE_URL: url, DATABASE_CONNECTION_TIMEOUT_MS: '1000',
      DATABASE_IDLE_TIMEOUT_MS: '30000', DATABASE_QUERY_TIMEOUT_MS: '1000',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk; });
  child.stderr.on('data', (chunk) => { output += chunk; });
  const exited = once(child, 'exit');
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    await exited;
  });
  const deadline = Date.now() + 5000;
  while (!output.includes('business API listening')) {
    assert.ok(Date.now() < deadline, 'Verification server did not start.');
    assert.equal(child.exitCode, null, 'Verification server exited early.');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return { child, exited, output: () => output, baseUrl: `http://127.0.0.1:${port}` };
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  test(`live PostgreSQL: ${signal} closes an established production-server connection`, {
    skip: !databaseUrl, timeout: 10_000,
  }, async (t) => {
    const url = new URL(databaseUrl);
    const applicationName = `onusai-shutdown-test-${process.pid}-${signal}`;
    url.searchParams.set('application_name', applicationName);
    const observer = new Pool({
      connectionString: databaseUrl, connectionTimeoutMillis: 1000,
      query_timeout: 1000, statement_timeout: 1000,
    });
    t.after(() => observer.end());
    const server = await startServer(t, url.href);
    const response = await fetch(`${server.baseUrl}/api/v1/health/ready`);
    assert.equal(response.status, 200);
    await response.arrayBuffer();

    async function connectionCount() {
      const result = await observer.query(
        'SELECT count(*)::integer AS count FROM pg_stat_activity WHERE application_name = $1',
        [applicationName],
      );
      return result.rows[0].count;
    }
    assert.equal(await connectionCount(), 1);
    server.child.kill(signal);
    const [code, exitSignal] = await server.exited;
    assert.equal(code, 0);
    assert.equal(exitSignal, null);
    assert.match(server.output(), /HTTP server stopped\.[\s\S]*PostgreSQL pool closed\./);
    const deadline = Date.now() + 1000;
    while (await connectionCount() > 0 && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    assert.equal(await connectionCount(), 0);
    if (url.password) assert.ok(!server.output().includes(url.password));
    assert.ok(!server.output().includes(url.href));
  });
}

test('live PostgreSQL: authentication failure stays private and liveness survives', {
  skip: !databaseUrl, timeout: 10_000,
}, async (t) => {
  const url = new URL(databaseUrl);
  url.password = `intentionally-invalid-password-${process.pid}`;
  const server = await startServer(t, url.href);
  const response = await fetch(`${server.baseUrl}/api/v1/health/ready`);
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    error: { code: 'DATABASE_UNAVAILABLE', message: 'Database is unavailable.' },
  });
  const liveness = await fetch(`${server.baseUrl}/api/v1/health`);
  assert.equal(liveness.status, 200);
  await liveness.arrayBuffer();
  server.child.kill('SIGTERM');
  const [code] = await server.exited;
  assert.equal(code, 0);
  assert.ok(!server.output().includes(url.password));
  assert.ok(!server.output().includes(url.href));
});
