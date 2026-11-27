import { Pool } from 'pg';
import { env } from '../../config/env.js';
import { HttpError } from '../../utils/http-error.js';

// One pool per process. Connections are opened lazily and reused by callers.
export const postgresPool = new Pool({
  connectionString: env.databaseUrl,
  max: 10,
  connectionTimeoutMillis: env.databaseConnectionTimeoutMs,
  idleTimeoutMillis: env.databaseIdleTimeoutMs,
  query_timeout: env.databaseQueryTimeoutMs,
  statement_timeout: env.databaseQueryTimeoutMs,
});

// Idle clients can fail outside a request. Handle the event without logging secrets.
postgresPool.on('error', () => {
  console.error('PostgreSQL idle connection failed.');
});

export async function checkDatabaseReadiness(): Promise<void> {
  try {
    // pool.query automatically releases the client, including on query failure.
    await postgresPool.query('SELECT 1');
  } catch {
    throw new HttpError(503, 'DATABASE_UNAVAILABLE', 'Database is unavailable.');
  }
}

let closing: Promise<void> | undefined;

export function closeDatabasePool(): Promise<void> {
  closing ??= postgresPool.end();
  return closing;
}
