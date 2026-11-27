import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import type { PoolClient } from 'pg';
import { postgresPool } from './postgres.js';

// Both src/ and dist/ have the same depth relative to backend/database/.
const databaseDirectory = new URL('../../../database/', import.meta.url);
const defaultMigrationDirectory = new URL('migrations/', databaseDirectory);

interface Migration {
  version: number;
  filename: string;
  checksum: string;
  sql: string;
}

interface AppliedMigration {
  version: number;
  filename: string;
  checksum: string;
}

export class MigrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MigrationError';
  }
}

export async function loadMigrationFiles(directory: URL = defaultMigrationDirectory): Promise<Migration[]> {
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    const migrations: Migration[] = [];
    const versions = new Set<number>();

    for (const entry of entries) {
      const match = /^(\d{4})_[a-z][a-z0-9_]*\.sql$/.exec(entry.name);
      const version = Number(match?.[1]);

      if (!entry.isFile() || !match || version < 1 || versions.has(version)) {
        throw new MigrationError('Migration files must have unique positive versions and names such as 0001_create_users.sql.');
      }

      const contents = await readFile(new URL(entry.name, directory));
      const sql = contents.toString('utf8');

      if (!sql.trim()) {
        throw new MigrationError('Migration files must not be empty.');
      }

      versions.add(version);
      migrations.push({
        version, filename: entry.name, sql,
        checksum: createHash('sha256').update(contents).digest('hex'),
      });
    }

    return migrations.sort((first, second) => first.version - second.version);
  } catch (error) {
    if (error instanceof MigrationError) throw error;
    throw new MigrationError('Unable to read SQL migration files.');
  }
}

export async function runMigrations(directory: URL = defaultMigrationDirectory): Promise<string[]> {
  const migrations = await loadMigrationFiles(directory);
  let client: PoolClient;
  let trackingSql: string;

  try {
    trackingSql = await readFile(new URL('schema_migrations.sql', databaseDirectory), 'utf8');
    client = await postgresPool.connect();
  } catch {
    throw new MigrationError('Unable to prepare database migrations. Check database availability and SQL files.');
  }

  let failed = true;

  try {
    await client.query('BEGIN ISOLATION LEVEL READ COMMITTED');
    // Lock before creating/reading history. Released automatically on commit or rollback.
    // The current schema permits isolated test runs without changing the production schema.
    await client.query('SELECT pg_advisory_xact_lock(hashtext(current_database()), hashtext(current_schema()))');
    await client.query(trackingSql);

    const applied = await client.query<AppliedMigration>(
      'SELECT version, filename, checksum FROM schema_migrations ORDER BY version',
    );

    for (const [index, record] of applied.rows.entries()) {
      const migration = migrations[index];

      if (
        !migration || migration.version !== record.version ||
        migration.filename !== record.filename || migration.checksum !== record.checksum
      ) {
        throw new MigrationError('Migration history differs from local files. Restore applied files and append new versions.');
      }
    }

    const pending = migrations.slice(applied.rows.length);

    for (const migration of pending) {
      await client.query(migration.sql);
      await client.query(
        'INSERT INTO schema_migrations (version, filename, checksum) VALUES ($1, $2, $3)',
        [migration.version, migration.filename, migration.checksum],
      );
    }

    await client.query('COMMIT');
    failed = false;
    return pending.map((migration) => migration.filename);
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // Discard this client below; a broken connection must not return to the pool.
    }

    if (error instanceof MigrationError) throw error;
    throw new MigrationError('Database migrations failed. Check database availability and pending SQL files.');
  } finally {
    client.release(failed);
  }
}
