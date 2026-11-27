import { MigrationError, runMigrations } from './integrations/database/migrations.js';
import { closeDatabasePool } from './integrations/database/postgres.js';

try {
  const applied = await runMigrations();

  for (const filename of applied) {
    console.info(`Applied migration: ${filename}`);
  }

  console.info(applied.length ? `Applied ${applied.length} migration(s).` : 'Database migrations are up to date.');
} catch (error) {
  // Only messages constructed by the runner are safe to print, never driver errors.
  console.error(error instanceof MigrationError ? error.message : 'Database migrations failed.');
  process.exitCode = 1;
} finally {
  try {
    await closeDatabasePool();
  } catch {
    console.error('PostgreSQL pool shutdown failed.');
    process.exitCode = 1;
  }
}
