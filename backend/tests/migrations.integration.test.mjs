import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { cp, mkdtemp, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Pool } from 'pg';

const databaseUrl = process.env.TEST_DATABASE_URL;
const backendDirectory = fileURLToPath(new URL('../', import.meta.url));
const sourceMigrations = new URL('../database/migrations/', import.meta.url);

async function migrationFixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'onusai-migration-live-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await cp(sourceMigrations, directory, { recursive: true });
  return pathToFileURL(`${directory}/`);
}

function startCli(t, connectionUrl) {
  const child = spawn(process.execPath, [join(backendDirectory, 'dist/migrate.js')], {
    // Exercise file resolution outside backend/ as well as the compiled entrypoint.
    cwd: tmpdir(),
    env: {
      ...process.env, PORT: '3000', NODE_ENV: 'test', CORS_ORIGIN: 'http://localhost:5173',
      AI_SERVICE_URL: 'http://127.0.0.1:8001', AI_SERVICE_TIMEOUT_MS: '5000',
      DATABASE_URL: connectionUrl, DATABASE_CONNECTION_TIMEOUT_MS: '2000',
      DATABASE_IDLE_TIMEOUT_MS: '1000', DATABASE_QUERY_TIMEOUT_MS: '5000',
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
  return { child, exited, output: () => output };
}

async function expectConstraint(client, sql, parameters, code) {
  await client.query('SAVEPOINT expected_constraint_failure');
  try {
    await assert.rejects(client.query(sql, parameters), (error) => error.code === code);
  } finally {
    await client.query('ROLLBACK TO SAVEPOINT expected_constraint_failure');
    await client.query('RELEASE SAVEPOINT expected_constraint_failure');
  }
}

async function seed(client) {
  const users = await client.query(`
    INSERT INTO users (email, display_name)
    VALUES ('shared@example.test', 'Shared User'), ('other@example.test', 'Other User') RETURNING *
  `);
  // Businesses may legitimately share a display name.
  const businesses = await client.query("INSERT INTO businesses (name) VALUES ('Example Business'), ('Example Business') RETURNING *");
  const [firstUser, secondUser] = users.rows;
  const [firstBusiness, secondBusiness] = businesses.rows;
  const members = await client.query(`
    INSERT INTO business_members (business_id, user_id, role)
    VALUES ($1, $2, 'owner'), ($3, $2, 'operator'), ($3, $4, 'owner') RETURNING *
  `, [firstBusiness.id, firstUser.id, secondBusiness.id, secondUser.id]);
  const locations = await client.query(`
    INSERT INTO business_locations (business_id, name)
    VALUES ($1, 'Main'), ($2, 'Main') RETURNING *
  `, [firstBusiness.id, secondBusiness.id]);
  return { users: users.rows, businesses: businesses.rows, members: members.rows, locations: locations.rows };
}

test('live migrations and core tenant schema', { skip: !databaseUrl, timeout: 45_000 }, async (t) => {
  // Every test object is contained in a new schema; existing tables/data are untouched.
  const schema = `onusai_migration_test_${randomUUID().replaceAll('-', '')}`;
  const observer = new Pool({
    connectionString: databaseUrl, connectionTimeoutMillis: 2000,
    query_timeout: 5000, statement_timeout: 5000,
  });
  let closeDatabasePool;
  let schemaCreated = false;
  t.after(async () => {
    try {
      if (closeDatabasePool) {
        await closeDatabasePool();
      }
      if (schemaCreated) {
        // The name is generated above and cannot contain arbitrary SQL or target existing schemas.
        await observer.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      }
    } finally {
      await observer.end();
    }
  });
  await observer.query(`CREATE SCHEMA "${schema}"`);
  schemaCreated = true;

  const scopedUrl = new URL(databaseUrl);
  const originalOptions = scopedUrl.searchParams.get('options') ?? '';
  scopedUrl.searchParams.set('options', `${originalOptions} -c search_path=${schema},pg_catalog`.trim());
  Object.assign(process.env, {
    PORT: '3000', NODE_ENV: 'test', CORS_ORIGIN: 'http://localhost:5173',
    AI_SERVICE_URL: 'http://127.0.0.1:8001', AI_SERVICE_TIMEOUT_MS: '5000',
    DATABASE_URL: scopedUrl.href, DATABASE_CONNECTION_TIMEOUT_MS: '2000',
    DATABASE_IDLE_TIMEOUT_MS: '1000', DATABASE_QUERY_TIMEOUT_MS: '5000',
  });
  const postgresModule = await import('../dist/integrations/database/postgres.js');
  const { postgresPool } = postgresModule;
  closeDatabasePool = postgresModule.closeDatabasePool;
  const { runMigrations } = await import('../dist/integrations/database/migrations.js');

  async function inTransaction(check) {
    const client = await postgresPool.connect();
    try {
      await client.query('BEGIN');
      await check(client, await seed(client));
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  }

  await t.test('a failed first batch rolls back DDL, triggers, and migration history', async (subtest) => {
    const directory = await migrationFixture(subtest);
    await writeFile(new URL('0009_fail.sql', directory), 'CREATE TABLE bootstrap_probe (id integer); SELECT nonexistent_private_function();');
    await assert.rejects(runMigrations(directory), /Database migrations failed/);
    const result = await postgresPool.query(`
      SELECT count(*)::integer AS count FROM pg_class
      WHERE relnamespace = $1::regnamespace
    `, [schema]);
    assert.equal(result.rows[0].count, 0);
    const functions = await postgresPool.query('SELECT count(*)::integer AS count FROM pg_proc WHERE pronamespace = $1::regnamespace', [schema]);
    assert.equal(functions.rows[0].count, 0);
  });

  await t.test('two CLI processes serialize before bootstrap and apply each migration exactly once', async (subtest) => {
    const lock = await observer.connect();
    try {
      await lock.query('BEGIN');
      await lock.query('SELECT pg_advisory_xact_lock(hashtext(current_database()), hashtext($1::text))', [schema]);
      const applicationName = `onusai-migration-race-${randomUUID()}`;
      const url = new URL(scopedUrl);
      url.searchParams.set('application_name', applicationName);
      const first = startCli(subtest, url.href);
      const second = startCli(subtest, url.href);

      let waiting = 0;
      const deadline = Date.now() + 3500;
      while (waiting < 2 && Date.now() < deadline) {
        const result = await observer.query(`
          SELECT count(*)::integer AS count FROM pg_stat_activity
          WHERE application_name = $1 AND wait_event = 'advisory'
        `, [applicationName]);
        waiting = result.rows[0].count;
        if (waiting < 2) await new Promise((resolve) => setTimeout(resolve, 20));
      }
      assert.equal(waiting, 2, 'Both processes must wait for the advisory lock before changing history.');
      const before = await observer.query('SELECT count(*)::integer AS count FROM pg_class WHERE relnamespace = $1::regnamespace', [schema]);
      assert.equal(before.rows[0].count, 0);
      await lock.query('COMMIT');
      const exits = await Promise.all([first.exited, second.exited]);
      for (const [code, signal] of exits) {
        assert.equal(code, 0);
        assert.equal(signal, null);
      }
      const combined = first.output() + second.output();
      assert.equal(combined.match(/Applied migration:/g)?.length, 8);
      assert.match(combined, /Database migrations are up to date/);
      assert.ok(!combined.includes(scopedUrl.href));
      if (scopedUrl.password) assert.ok(!combined.includes(scopedUrl.password));
    } finally {
      await lock.query('ROLLBACK');
      lock.release();
    }
    const versions = await postgresPool.query('SELECT version FROM schema_migrations ORDER BY version');
    assert.deepEqual(versions.rows.map((row) => row.version), [1, 2, 3, 4, 5, 6, 7, 8]);
  });

  await t.test('repeated execution preserves history and reports no pending migrations', async () => {
    const before = await postgresPool.query('SELECT * FROM schema_migrations ORDER BY version');
    assert.deepEqual(await runMigrations(), []);
    const after = await postgresPool.query('SELECT * FROM schema_migrations ORDER BY version');
    assert.deepEqual(after.rows, before.rows);
    assert.ok(after.rows.every((row) => /^[a-f0-9]{64}$/.test(row.checksum) && row.applied_at instanceof Date));
  });

  await t.test('expected tables, indexes, and tracking constraints exist', async () => {
    const indexes = await postgresPool.query(`
      SELECT tablename, indexname FROM pg_indexes
      WHERE schemaname = $1
      ORDER BY tablename, indexname
    `, [schema]);
    assert.deepEqual(indexes.rows, [
      { tablename: 'auth_login_attempts', indexname: 'auth_login_attempts_locked_until_idx' },
      { tablename: 'auth_login_attempts', indexname: 'auth_login_attempts_pkey' },
      { tablename: 'business_locations', indexname: 'business_locations_business_id_unique' },
      { tablename: 'business_locations', indexname: 'business_locations_business_name_unique' },
      { tablename: 'business_locations', indexname: 'business_locations_pkey' },
      { tablename: 'business_members', indexname: 'business_members_business_id_unique' },
      { tablename: 'business_members', indexname: 'business_members_business_user_unique' },
      { tablename: 'business_members', indexname: 'business_members_pkey' },
      { tablename: 'business_members', indexname: 'business_members_user_id_idx' },
      { tablename: 'businesses', indexname: 'businesses_pkey' },
      { tablename: 'schema_migrations', indexname: 'schema_migrations_filename_key' },
      { tablename: 'schema_migrations', indexname: 'schema_migrations_pkey' },
      { tablename: 'staff_sessions', indexname: 'staff_sessions_active_expires_at_idx' },
      { tablename: 'staff_sessions', indexname: 'staff_sessions_pkey' },
      { tablename: 'staff_sessions', indexname: 'staff_sessions_token_hash_key' },
      { tablename: 'staff_sessions', indexname: 'staff_sessions_user_id_idx' },
      { tablename: 'user_credentials', indexname: 'user_credentials_pkey' },
      { tablename: 'users', indexname: 'users_email_unique' },
      { tablename: 'users', indexname: 'users_pkey' },
    ]);

    await inTransaction(async (client) => {
      await expectConstraint(client, "INSERT INTO schema_migrations (version, filename, checksum) VALUES (0, '0000_zero.sql', $1)", ['a'.repeat(64)], '23514');
      await expectConstraint(client, "INSERT INTO schema_migrations (version, filename, checksum) VALUES (99, '0099_bad.sql', 'not-sha256')", [], '23514');
      await expectConstraint(client, "INSERT INTO schema_migrations (version, filename, checksum) VALUES (99, '0001_create_users.sql', $1)", ['a'.repeat(64)], '23505');
    });
  });

  await t.test('UUID defaults and timestamp defaults exist for every core entity', async () => {
    await inTransaction(async (_client, data) => {
      const ids = new Set();
      for (const entity of Object.values(data).flat()) {
        assert.match(entity.id, /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
        assert.ok(!ids.has(entity.id));
        ids.add(entity.id);
        assert.ok(entity.created_at instanceof Date);
        assert.ok(entity.updated_at instanceof Date);
      }
    });
  });

  await t.test('identity uniqueness, required fields, UUID types, and names are constrained', async () => {
    await inTransaction(async (client) => {
      await expectConstraint(client, "INSERT INTO users (email, display_name) VALUES ('SHARED@EXAMPLE.TEST', 'Duplicate')", [], '23505');
      for (const email of ['not-an-email', 'a@@example.test', ' spaced@example.test', 'with space@example.test', '', 'a'.repeat(250) + '@example.test']) {
        await expectConstraint(client, 'INSERT INTO users (email, display_name) VALUES ($1, $2)', [email, 'User'], '23514');
      }
      await expectConstraint(client, "INSERT INTO users (display_name) VALUES ('Missing Email')", [], '23502');
      for (const displayName of ['', '   ', ' padded ']) {
        await expectConstraint(client, 'INSERT INTO users (email, display_name) VALUES ($1, $2)', ['new@example.test', displayName], '23514');
      }
      await expectConstraint(client, "INSERT INTO businesses (id, name) VALUES ('invalid-uuid', 'Business')", [], '22P02');
      for (const name of ['', ' ', '\t', ' padded ', 'a'.repeat(161)]) {
        await expectConstraint(client, 'INSERT INTO businesses (name) VALUES ($1)', [name], '23514');
      }
      await expectConstraint(client, 'INSERT INTO businesses DEFAULT VALUES', [], '23502');
    });
  });

  await t.test('one global user can hold different roles in multiple businesses', async () => {
    await inTransaction(async (client, data) => {
      const result = await client.query('SELECT business_id, role FROM business_members WHERE user_id = $1', [data.users[0].id]);
      assert.equal(result.rows.length, 2);
      assert.equal(result.rows.find((row) => row.business_id === data.businesses[0].id).role, 'owner');
      assert.equal(result.rows.find((row) => row.business_id === data.businesses[1].id).role, 'operator');
      await expectConstraint(client, 'INSERT INTO business_members (business_id, user_id) VALUES ($1, $2)', [data.businesses[0].id, data.users[0].id], '23505');
      await expectConstraint(client, 'INSERT INTO business_members (business_id, user_id, role) VALUES ($1, $2, $3)', [data.businesses[0].id, data.users[1].id, 'admin'], '23514');
      await expectConstraint(client, 'INSERT INTO business_members (business_id, user_id, role) VALUES ($1, $2, NULL)', [data.businesses[0].id, data.users[1].id], '23502');
      const member = await client.query('INSERT INTO business_members (business_id, user_id) VALUES ($1, $2) RETURNING role', [data.businesses[0].id, data.users[1].id]);
      assert.equal(member.rows[0].role, 'operator');
    });
  });

  await t.test('orphan memberships/locations and missing tenant keys are rejected', async () => {
    await inTransaction(async (client, data) => {
      await expectConstraint(client, 'INSERT INTO business_members (business_id, user_id) VALUES ($1, $2)', [randomUUID(), data.users[0].id], '23503');
      await expectConstraint(client, 'INSERT INTO business_members (business_id, user_id) VALUES ($1, $2)', [data.businesses[0].id, randomUUID()], '23503');
      await expectConstraint(client, 'INSERT INTO business_members (user_id) VALUES ($1)', [data.users[0].id], '23502');
      await expectConstraint(client, "INSERT INTO business_locations (business_id, name) VALUES ($1, 'Other')", [randomUUID()], '23503');
      await expectConstraint(client, "INSERT INTO business_locations (name) VALUES ('No Tenant')", [], '23502');
      await expectConstraint(client, "INSERT INTO business_locations (business_id, name) VALUES ($1, '')", [data.businesses[0].id], '23514');
      await expectConstraint(client, "INSERT INTO business_locations (business_id, name) VALUES ($1, 'MAIN')", [data.businesses[0].id], '23505');
    });
  });

  await t.test('tenant-scoped queries and composite foreign keys reject cross-business links', async () => {
    await inTransaction(async (client, data) => {
      const firstBusiness = data.businesses[0].id;
      const secondLocation = data.locations[1].id;
      const hidden = await client.query('SELECT id FROM business_locations WHERE business_id = $1 AND id = $2', [firstBusiness, secondLocation]);
      assert.equal(hidden.rows.length, 0);
      const members = await client.query('SELECT user_id FROM business_members WHERE business_id = $1', [firstBusiness]);
      assert.deepEqual(members.rows, [{ user_id: data.users[0].id }]);

      // Test the published composite reference contract inside this rolled-back transaction without adding a product feature.
      await client.query(`
        CREATE TABLE tenant_link_probe (
          business_id uuid NOT NULL,
          member_id uuid NOT NULL,
          location_id uuid NOT NULL,
          FOREIGN KEY (business_id, member_id) REFERENCES business_members (business_id, id),
          FOREIGN KEY (business_id, location_id) REFERENCES business_locations (business_id, id)
        )
      `);
      const insert = 'INSERT INTO tenant_link_probe VALUES ($1, $2, $3)';
      await client.query(insert, [firstBusiness, data.members[0].id, data.locations[0].id]);
      await expectConstraint(client, insert, [firstBusiness, data.members[0].id, secondLocation], '23503');
      await expectConstraint(client, insert, [firstBusiness, data.members[1].id, data.locations[0].id], '23503');
    });
  });

  await t.test('updates advance updated_at and preserve created_at on all core tables', async () => {
    await inTransaction(async (client, data) => {
      await client.query('SELECT pg_sleep(0.02)');
      for (const [table, entity] of [
        ['users', data.users[0]], ['businesses', data.businesses[0]],
        ['business_members', data.members[0]], ['business_locations', data.locations[0]],
      ]) {
        // Table identifiers come only from the fixed list above, never external input.
        const result = await client.query(`UPDATE ${table} SET updated_at = '2000-01-01' WHERE id = $1 RETURNING *`, [entity.id]);
        assert.deepEqual(result.rows[0].created_at, entity.created_at);
        assert.ok(result.rows[0].updated_at > entity.updated_at);
      }
    });
  });

  await t.test('business deletion cascades only its own data; global member users are protected', async () => {
    await inTransaction(async (client, data) => {
      await expectConstraint(client, 'DELETE FROM users WHERE id = $1', [data.users[0].id], '23503');
      await client.query('DELETE FROM businesses WHERE id = $1', [data.businesses[0].id]);
      const members = await client.query('SELECT business_id FROM business_members');
      assert.equal(members.rows.length, 2);
      assert.ok(members.rows.every((row) => row.business_id === data.businesses[1].id));
      const locations = await client.query('SELECT business_id FROM business_locations');
      assert.deepEqual(locations.rows, [{ business_id: data.businesses[1].id }]);
      const users = await client.query('SELECT count(*)::integer AS count FROM users');
      assert.equal(users.rows[0].count, 2);
    });
  });

  await t.test('edited, renamed, removed, and older inserted migrations cannot change history', async (subtest) => {
    for (const change of ['edit', 'rename', 'remove', 'older']) {
      const directory = await migrationFixture(subtest);
      const first = new URL('0001_create_users.sql', directory);
      if (change === 'edit') await writeFile(first, 'SELECT 1;');
      if (change === 'rename') await rename(first, new URL('0001_renamed.sql', directory));
      if (change === 'remove') await rm(first);
      if (change === 'older') {
        await rename(first, new URL('0009_create_users.sql', directory));
        await writeFile(first, 'SELECT 1;');
      }
      await assert.rejects(runMigrations(directory), /Migration history differs from local files/);
      const history = await postgresPool.query('SELECT count(*)::integer AS count FROM schema_migrations');
      assert.equal(history.rows[0].count, 8);
    }
  });

  await t.test('CLI database connection failures exit nonzero without credentials or raw errors', async (subtest) => {
    const url = new URL(scopedUrl);
    url.password = `intentionally-invalid-${randomUUID()}`;
    const cli = startCli(subtest, url.href);
    const [code, signal] = await cli.exited;
    assert.equal(code, 1);
    assert.equal(signal, null);
    assert.match(cli.output(), /Unable to prepare database migrations/);
    assert.ok(!cli.output().includes(url.href));
    assert.ok(!cli.output().includes(url.password));
    assert.ok(!cli.output().includes('password authentication failed'));
  });

  await t.test('a later failed batch preserves prior history and supports correction and retry', async (subtest) => {
    const directory = await migrationFixture(subtest);
    await writeFile(new URL('0009_pending.sql', directory), 'CREATE TABLE pending_probe (id integer); INSERT INTO pending_probe VALUES (42);');
    const failingFile = new URL('0010_failure.sql', directory);
    await writeFile(failingFile, 'CREATE TABLE partial_probe (id integer); SELECT nonexistent_private_function();');
    await assert.rejects(runMigrations(directory), /Database migrations failed/);
    const rolledBack = await postgresPool.query("SELECT to_regclass('pending_probe') AS pending, to_regclass('partial_probe') AS partial");
    assert.deepEqual(rolledBack.rows, [{ pending: null, partial: null }]);
    const history = await postgresPool.query('SELECT version FROM schema_migrations ORDER BY version');
    assert.deepEqual(history.rows.map((row) => row.version), [1, 2, 3, 4, 5, 6, 7, 8]);

    await writeFile(failingFile, 'CREATE TABLE corrected_probe (id integer);');
    assert.deepEqual(await runMigrations(directory), ['0009_pending.sql', '0010_failure.sql']);
    assert.deepEqual(await runMigrations(directory), []);
    const inserted = await postgresPool.query('SELECT id FROM pending_probe');
    assert.deepEqual(inserted.rows, [{ id: 42 }]);
  });
});
