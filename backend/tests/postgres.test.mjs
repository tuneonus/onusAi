import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { after, before, test } from 'node:test';

let databaseServer;
let backendServer;
let backendUrl;
let postgresPool;
let checkDatabaseReadiness;
let closeDatabasePool;
const sockets = new Set();

before(async () => {
  // Accept TCP but never complete PostgreSQL authentication: a real connect timeout.
  databaseServer = createServer((socket) => {
    sockets.add(socket);
    socket.on('error', () => {});
    socket.on('close', () => sockets.delete(socket));
    socket.resume();
  }).listen(0, '127.0.0.1');
  await once(databaseServer, 'listening');

  Object.assign(process.env, {
    PORT: '3000', NODE_ENV: 'test', CORS_ORIGIN: 'http://localhost:5173',
    AI_SERVICE_URL: 'http://127.0.0.1:8001', AI_SERVICE_TIMEOUT_MS: '5000',
    AI_INTERNAL_AUTH_SECRET: 'test-internal-auth-secret-at-least-32-characters',
    DATABASE_URL: `postgresql://test:example-password@127.0.0.1:${databaseServer.address().port}/onusai`,
    DATABASE_CONNECTION_TIMEOUT_MS: '150', DATABASE_IDLE_TIMEOUT_MS: '100',
    DATABASE_QUERY_TIMEOUT_MS: '150',
  });

  ({ postgresPool, checkDatabaseReadiness, closeDatabasePool } = await import('../dist/integrations/database/postgres.js'));
  const { app } = await import('../dist/app.js');
  backendServer = app.listen(0, '127.0.0.1');
  await once(backendServer, 'listening');
  backendUrl = `http://127.0.0.1:${backendServer.address().port}`;
});

after(async () => {
  await new Promise((resolve) => backendServer?.close(resolve));
  await closeDatabasePool?.();
  for (const socket of sockets) socket.destroy();
  await new Promise((resolve) => databaseServer?.close(resolve));
});

async function assertUnavailable() {
  const response = await fetch(`${backendUrl}/api/v1/health/ready`);
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), {
    error: { code: 'DATABASE_UNAVAILABLE', message: 'Database is unavailable.' },
  });
}

test('importing the app creates no database connections', () => {
  assert.equal(postgresPool.totalCount, 0);
  assert.equal(sockets.size, 0);
});

test('readiness uses a read-only query and returns a non-cacheable success', async (t) => {
  const query = t.mock.method(postgresPool, 'query', async () => ({ rows: [{ '?column?': 1 }] }));
  const response = await fetch(`${backendUrl}/api/v1/health/ready`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), { status: 'ok', database: 'ready' });
  assert.deepEqual(query.mock.calls[0].arguments, ['SELECT 1']);
});

test('readiness errors and logs cannot expose arbitrary driver details', async (t) => {
  t.mock.method(postgresPool, 'query', async () => {
    const error = new Error('postgresql://private-user:private-password@private-host/private-database');
    error.code = 'private-code';
    error.detail = 'private-detail';
    throw error;
  });
  const logs = t.mock.method(console, 'error', () => {});
  await assertUnavailable();
  await assert.rejects(checkDatabaseReadiness(), (error) => {
    assert.equal(error.statusCode, 503);
    assert.equal(error.code, 'DATABASE_UNAVAILABLE');
    assert.equal(error.message, 'Database is unavailable.');
    assert.equal(error.cause, undefined);
    return true;
  });
  assert.ok(!JSON.stringify(logs.mock.calls).includes('private-'));
});

test('idle connection errors are handled without crashing or logging driver data', (t) => {
  const logs = t.mock.method(console, 'error', () => {});
  assert.doesNotThrow(() => postgresPool.emit('error', new Error('private-password')));
  assert.deepEqual(logs.mock.calls[0].arguments, ['PostgreSQL idle connection failed.']);
});

test('a stalled database handshake times out safely and liveness stays available', { timeout: 3000 }, async (t) => {
  t.mock.method(console, 'error', () => {});
  await assertUnavailable();
  assert.equal(postgresPool.totalCount, 0);
  assert.equal(postgresPool.waitingCount, 0);

  const response = await fetch(`${backendUrl}/api/v1/health`);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).status, 'ok');
});

test('a refused database connection produces the same safe 503 response', { timeout: 3000 }, async (t) => {
  t.mock.method(console, 'error', () => {});
  for (const socket of sockets) socket.destroy();
  await new Promise((resolve) => databaseServer.close(resolve));
  await assertUnavailable();
});

test('pool shutdown is idempotent and readiness is unavailable afterward', async (t) => {
  t.mock.method(console, 'error', () => {});
  const closing = closeDatabasePool();
  assert.equal(closeDatabasePool(), closing);
  await closing;
  assert.equal(postgresPool.totalCount, 0);
  await assertUnavailable();
});
