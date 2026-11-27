import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';

Object.assign(process.env, {
  PORT: '3000', NODE_ENV: 'test', CORS_ORIGIN: 'http://localhost:5173',
  AI_SERVICE_URL: 'http://127.0.0.1:8001', AI_SERVICE_TIMEOUT_MS: '5000',
  AI_INTERNAL_AUTH_SECRET: 'test-internal-auth-secret-at-least-32-characters',
  DATABASE_URL: 'postgresql://test:example-password@127.0.0.1:5433/onussync',
  DATABASE_CONNECTION_TIMEOUT_MS: '5000', DATABASE_IDLE_TIMEOUT_MS: '30000',
  DATABASE_QUERY_TIMEOUT_MS: '5000',
});

const { loadMigrationFiles, MigrationError, runMigrations } = await import('../dist/integrations/database/migrations.js');
const { postgresPool, closeDatabasePool } = await import('../dist/integrations/database/postgres.js');

async function fixture(t, files) {
  const directory = await mkdtemp(join(tmpdir(), 'onussync-migration-unit-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  for (const [filename, contents] of Object.entries(files)) {
    await writeFile(join(directory, filename), contents);
  }
  return pathToFileURL(`${directory}/`);
}

function mockClient(t, applied = [], failQuery = () => false) {
  const queries = [];
  const releases = [];
  const client = {
    async query(text, parameters) {
      queries.push({ text, parameters });
      if (failQuery(text)) throw new Error('private-driver-message private-password');
      return { rows: text.startsWith('SELECT version,') ? applied : [] };
    },
    release(discard) { releases.push(discard); },
  };
  const connect = t.mock.method(postgresPool, 'connect', async () => client);
  return { queries, releases, connect };
}

test('migration files sort by version and checksum the exact SQL bytes', async (t) => {
  const sql = '-- UTF-8 migration\nSELECT 1;\n';
  const directory = await fixture(t, { '0002_second.sql': 'SELECT 2;', '0001_first.sql': sql });
  const migrations = await loadMigrationFiles(directory);
  assert.deepEqual(migrations.map((migration) => migration.version), [1, 2]);
  assert.equal(migrations[0].sql, sql);
  assert.equal(migrations[0].checksum, createHash('sha256').update(sql).digest('hex'));
});

test('invalid, duplicate, empty, or non-file migrations are rejected before connecting', async (t) => {
  const connect = t.mock.method(postgresPool, 'connect', () => { throw new Error('Must not connect.'); });
  for (const files of [
    { 'migration.sql': 'SELECT 1;' },
    { '0000_zero.sql': 'SELECT 1;' },
    { '0001_first.sql': 'SELECT 1;', '0001_duplicate.sql': 'SELECT 2;' },
    { '0001_empty.sql': ' \n\t' },
  ]) {
    const directory = await fixture(t, files);
    await assert.rejects(runMigrations(directory), MigrationError);
  }
  const directory = await fixture(t, {});
  await mkdir(new URL('0001_directory.sql', directory));
  await assert.rejects(runMigrations(directory), MigrationError);
  assert.equal(connect.mock.callCount(), 0);
});

test('unreadable migration paths produce a fixed safe error', async (t) => {
  const directory = await fixture(t, {});
  await assert.rejects(loadMigrationFiles(new URL('private-password/', directory)), (error) => {
    assert.equal(error.message, 'Unable to read SQL migration files.');
    assert.equal(error.cause, undefined);
    return true;
  });
});

test('one checked-out client owns the transaction, SQL, history writes, and release', async (t) => {
  const directory = await fixture(t, { '0001_first.sql': 'SELECT 42;' });
  const client = mockClient(t);
  assert.deepEqual(await runMigrations(directory), ['0001_first.sql']);
  assert.equal(client.connect.mock.callCount(), 1);
  assert.equal(client.queries[0].text, 'BEGIN ISOLATION LEVEL READ COMMITTED');
  assert.match(client.queries[1].text, /pg_advisory_xact_lock/);
  const sqlIndex = client.queries.findIndex((query) => query.text === 'SELECT 42;');
  const recordIndex = client.queries.findIndex((query) => query.text.startsWith('INSERT INTO schema_migrations'));
  assert.ok(sqlIndex > 1 && recordIndex > sqlIndex);
  assert.deepEqual(client.queries[recordIndex].parameters, [
    1, '0001_first.sql', createHash('sha256').update('SELECT 42;').digest('hex'),
  ]);
  assert.equal(client.queries.at(-1).text, 'COMMIT');
  assert.deepEqual(client.releases, [false]);
});

test('already applied migrations are not executed again', async (t) => {
  const directory = await fixture(t, { '0001_first.sql': 'SELECT 42;' });
  const [applied] = await loadMigrationFiles(directory);
  const client = mockClient(t, [applied]);
  assert.deepEqual(await runMigrations(directory), []);
  assert.ok(!client.queries.some((query) => query.text === applied.sql));
  assert.ok(!client.queries.some((query) => query.text.startsWith('INSERT INTO schema_migrations')));
  assert.equal(client.queries.at(-1).text, 'COMMIT');
});

test('modified, renamed, missing, or out-of-order applied history fails before pending SQL', async (t) => {
  for (const record of [
    { version: 1, filename: '0001_first.sql', checksum: '0'.repeat(64) },
    { version: 1, filename: '0001_renamed.sql', checksum: createHash('sha256').update('SELECT 42;').digest('hex') },
    { version: 2, filename: '0002_missing.sql', checksum: '0'.repeat(64) },
  ]) {
    await t.test(record.filename + record.version, async (subtest) => {
      const directory = await fixture(subtest, { '0001_first.sql': 'SELECT 42;' });
      const client = mockClient(subtest, [record]);
      await assert.rejects(runMigrations(directory), /Migration history differs from local files/);
      assert.ok(!client.queries.some((query) => query.text === 'SELECT 42;'));
      assert.equal(client.queries.at(-1).text, 'ROLLBACK');
      assert.deepEqual(client.releases, [true]);
    });
  }
});

for (const failure of ['BEGIN', 'pg_advisory_xact_lock', 'CREATE TABLE IF NOT EXISTS', 'SELECT 42;', 'INSERT INTO schema_migrations', 'COMMIT']) {
  test(`failure at ${failure} rolls back, discards the client, and hides driver details`, async (t) => {
    const directory = await fixture(t, { '0001_first.sql': 'SELECT 42;' });
    const client = mockClient(t, [], (query) => query.includes(failure));
    await assert.rejects(runMigrations(directory), (error) => {
      assert.ok(error instanceof MigrationError);
      assert.equal(error.message, 'Database migrations failed. Check database availability and pending SQL files.');
      assert.equal(error.cause, undefined);
      return true;
    });
    assert.equal(client.queries.at(-1).text, 'ROLLBACK');
    assert.deepEqual(client.releases, [true]);
  });
}

test('a failed rollback still discards the client and returns a safe error', async (t) => {
  const directory = await fixture(t, { '0001_first.sql': 'SELECT 42;' });
  const client = mockClient(t, [], (query) => query === 'SELECT 42;' || query === 'ROLLBACK');
  await assert.rejects(runMigrations(directory), MigrationError);
  assert.deepEqual(client.releases, [true]);
});

test('connection failures are sanitized without a leaked cause', async (t) => {
  const directory = await fixture(t, {});
  t.mock.method(postgresPool, 'connect', async () => { throw new Error('private-password'); });
  await assert.rejects(runMigrations(directory), (error) => {
    assert.equal(error.message, 'Unable to prepare database migrations. Check database availability and SQL files.');
    assert.equal(error.cause, undefined);
    return true;
  });
});

test('migration unit tests leave the real pool unused and close it', async () => {
  assert.equal(postgresPool.totalCount, 0);
  await closeDatabasePool();
});
