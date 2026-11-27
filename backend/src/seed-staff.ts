import type { PoolClient } from 'pg';
import { env } from './config/env.js';
import { closeDatabasePool, postgresPool } from './integrations/database/postgres.js';
import type { BusinessRole } from './types/express.js';
import { hashPassword } from './utils/password.js';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MIN_SEED_PASSWORD_LENGTH = 12;
const MAX_SEED_PASSWORD_LENGTH = 128;

class SeedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SeedError';
  }
}

interface StaffSeedInput {
  email: string;
  displayName: string;
  password: string;
  businessId: string | null;
  businessName: string | null;
  role: BusinessRole;
  locationName: string | null;
}

function readSeedInput(values: NodeJS.ProcessEnv): StaffSeedInput {
  const email = (values.SEED_STAFF_EMAIL ?? '').trim().toLowerCase();

  if (email.length < 3 || email.length > 254 || !EMAIL_PATTERN.test(email)) {
    throw new SeedError('SEED_STAFF_EMAIL must be a valid email address.');
  }

  const displayName = (values.SEED_STAFF_DISPLAY_NAME ?? '').trim();

  if (displayName.length < 1 || displayName.length > 120) {
    throw new SeedError('SEED_STAFF_DISPLAY_NAME must be between 1 and 120 characters.');
  }

  const password = values.SEED_STAFF_PASSWORD ?? '';

  if (password.length < MIN_SEED_PASSWORD_LENGTH || password.length > MAX_SEED_PASSWORD_LENGTH) {
    throw new SeedError(`SEED_STAFF_PASSWORD must be between ${MIN_SEED_PASSWORD_LENGTH} and ${MAX_SEED_PASSWORD_LENGTH} characters.`);
  }

  const rawBusinessId = values.SEED_BUSINESS_ID?.trim();
  let businessId: string | null = null;

  if (rawBusinessId) {
    if (!UUID_PATTERN.test(rawBusinessId)) {
      throw new SeedError('SEED_BUSINESS_ID must be a valid UUID.');
    }

    businessId = rawBusinessId.toLowerCase();
  }

  const rawBusinessName = values.SEED_BUSINESS_NAME?.trim() ?? '';
  const businessName = rawBusinessName.length > 0 ? rawBusinessName : null;

  if (businessName && businessName.length > 160) {
    throw new SeedError('SEED_BUSINESS_NAME must be at most 160 characters.');
  }

  const rawRole = (values.SEED_STAFF_ROLE ?? 'owner').trim().toLowerCase();

  if (rawRole !== 'owner' && rawRole !== 'operator') {
    throw new SeedError('SEED_STAFF_ROLE must be owner or operator.');
  }

  const rawLocationName = values.SEED_LOCATION_NAME?.trim() ?? '';
  const locationName = rawLocationName.length > 0 ? rawLocationName : null;

  if (locationName && locationName.length > 160) {
    throw new SeedError('SEED_LOCATION_NAME must be at most 160 characters.');
  }

  if (locationName && !businessId && !businessName) {
    throw new SeedError('SEED_LOCATION_NAME requires SEED_BUSINESS_ID or SEED_BUSINESS_NAME.');
  }

  return { email, displayName, password, businessId, businessName, role: rawRole, locationName };
}

async function seedStaffAccount(input: StaffSeedInput): Promise<void> {
  const passwordHash = await hashPassword(input.password);
  let client: PoolClient;

  try {
    client = await postgresPool.connect();
  } catch {
    throw new SeedError('Unable to connect to PostgreSQL.');
  }

  let failed = true;

  try {
    await client.query('BEGIN');

    const userResult = await client.query<{ id: string; email: string }>(
      `INSERT INTO users (email, display_name)
       VALUES ($1, $2)
       ON CONFLICT (lower(email)) DO UPDATE SET display_name = EXCLUDED.display_name
       RETURNING id, email`,
      [input.email, input.displayName],
    );
    const user = userResult.rows[0];

    if (!user) {
      throw new SeedError('Unable to upsert staff user.');
    }

    await client.query(
      `INSERT INTO user_credentials (user_id, password_hash)
       VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE SET
         password_hash = EXCLUDED.password_hash,
         password_updated_at = CURRENT_TIMESTAMP`,
      [user.id, passwordHash],
    );

    let resolvedBusinessId = input.businessId;

    if (resolvedBusinessId) {
      const existing = await client.query<{ id: string }>('SELECT id FROM businesses WHERE id = $1', [resolvedBusinessId]);

      if (!existing.rows[0]) {
        throw new SeedError('Target SEED_BUSINESS_ID does not exist.');
      }
    } else if (input.businessName) {
      const businessResult = await client.query<{ id: string }>(
        'INSERT INTO businesses (name) VALUES ($1) RETURNING id',
        [input.businessName],
      );
      resolvedBusinessId = businessResult.rows[0]?.id ?? null;
    }

    if (resolvedBusinessId) {
      await client.query(
        `INSERT INTO business_members (business_id, user_id, role)
         VALUES ($1, $2, $3)
         ON CONFLICT (business_id, user_id) DO UPDATE SET role = EXCLUDED.role`,
        [resolvedBusinessId, user.id, input.role],
      );

      if (input.locationName) {
        await client.query(
          `INSERT INTO business_locations (business_id, name)
           VALUES ($1, $2)
           ON CONFLICT (business_id, lower(name)) WHERE archived_at IS NULL DO NOTHING`,
          [resolvedBusinessId, input.locationName],
        );
      }
    }

    await client.query('COMMIT');
    failed = false;

    console.info(
      resolvedBusinessId
        ? `Provisioned staff user ${user.id} (${user.email}) for business ${resolvedBusinessId} as ${input.role}.`
        : `Provisioned staff user ${user.id} (${user.email}).`,
    );
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // Client will be discarded below.
    }

    if (error instanceof SeedError) {
      throw error;
    }

    throw new SeedError('Staff provisioning failed.');
  } finally {
    client.release(failed);
  }
}

try {
  if (env.nodeEnv === 'production') {
    throw new SeedError('Development staff provisioning cannot run when NODE_ENV=production.');
  }

  const input = readSeedInput(process.env);
  await seedStaffAccount(input);
} catch (error) {
  console.error(error instanceof SeedError ? error.message : 'Staff provisioning failed.');
  process.exitCode = 1;
} finally {
  try {
    await closeDatabasePool();
  } catch {
    console.error('PostgreSQL pool shutdown failed.');
    process.exitCode = 1;
  }
}

