import type { PoolClient } from 'pg';
import { postgresPool } from '../../integrations/database/postgres.js';
import type { BusinessRole, TenantContext } from '../../types/express.js';
import { HttpError } from '../../utils/http-error.js';
import type {
  BusinessLocation,
  BusinessMemberSummary,
  BusinessProfile,
  CreateBusinessInput,
  CreateLocationInput,
  LocationAddress,
  UpdateBusinessInput,
  UpdateLocationInput,
  WeeklyOpeningHours,
} from './businesses.types.js';

interface BusinessRow {
  id: string;
  name: string;
  description: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  website_url: string | null;
  timezone: string | null;
  opening_hours: WeeklyOpeningHours | null;
  retention_days: number | null;
  created_at: Date;
  updated_at: Date;
}

interface BusinessLocationRow {
  id: string;
  business_id: string;
  name: string;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state_region: string | null;
  postal_code: string | null;
  country_code: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  timezone: string | null;
  opening_hours: WeeklyOpeningHours | null;
  archived_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

const BUSINESS_SELECT_COLUMNS = `
  id, name, description, contact_email, contact_phone,
  website_url, timezone, opening_hours, retention_days, created_at, updated_at
`;

const LOCATION_SELECT_COLUMNS = `
  id, business_id, name,
  address_line1, address_line2, city, state_region, postal_code, country_code,
  contact_email, contact_phone, timezone, opening_hours,
  archived_at, created_at, updated_at
`;

function mapBusinessRow(row: BusinessRow): BusinessProfile {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    contactEmail: row.contact_email,
    contactPhone: row.contact_phone,
    websiteUrl: row.website_url,
    timezone: row.timezone,
    openingHours: row.opening_hours,
    retentionDays: row.retention_days,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapAddressRow(row: BusinessLocationRow): LocationAddress | null {
  if (!row.address_line1 || !row.city || !row.country_code) {
    return null;
  }

  return {
    line1: row.address_line1,
    line2: row.address_line2,
    city: row.city,
    stateRegion: row.state_region,
    postalCode: row.postal_code,
    countryCode: row.country_code,
  };
}

function mapLocationRow(row: BusinessLocationRow): BusinessLocation {
  return {
    id: row.id,
    businessId: row.business_id,
    name: row.name,
    address: mapAddressRow(row),
    contactEmail: row.contact_email,
    contactPhone: row.contact_phone,
    timezone: row.timezone,
    openingHours: row.opening_hours,
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function serializeOpeningHours(openingHours: WeeklyOpeningHours | null): string | null {
  return openingHours ? JSON.stringify(openingHours) : null;
}

function isPgUniqueViolation(error: unknown, constraintName: string): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }

  const pgError = error as { code?: unknown; constraint?: unknown };
  return pgError.code === '23505' && pgError.constraint === constraintName;
}

export async function findVerifiedBusinessMembership(
  businessId: string,
  userId: string,
): Promise<TenantContext | null> {
  const result = await postgresPool.query<{
    membership_id: string;
    business_id: string;
    business_name: string;
    role: BusinessRole;
  }>(
    `SELECT bm.id AS membership_id, bm.business_id, b.name AS business_name, bm.role
     FROM business_members bm
     INNER JOIN businesses b ON b.id = bm.business_id
     WHERE bm.business_id = $1 AND bm.user_id = $2
     LIMIT 1`,
    [businessId, userId],
  );

  const row = result.rows[0];

  if (!row) {
    return null;
  }

  return {
    membershipId: row.membership_id,
    businessId: row.business_id,
    businessName: row.business_name,
    role: row.role,
  };
}

export async function findBusinessProfileById(businessId: string): Promise<BusinessProfile | null> {
  const result = await postgresPool.query<BusinessRow>(
    `SELECT ${BUSINESS_SELECT_COLUMNS}
     FROM businesses
     WHERE id = $1
     LIMIT 1`,
    [businessId],
  );

  const row = result.rows[0];
  return row ? mapBusinessRow(row) : null;
}

export async function createBusinessWithOwner(
  userId: string,
  input: CreateBusinessInput,
): Promise<{ business: BusinessProfile; membershipId: string; role: BusinessRole }> {
  let client: PoolClient;

  try {
    client = await postgresPool.connect();
  } catch {
    throw new HttpError(503, 'DATABASE_UNAVAILABLE', 'Database is unavailable.');
  }

  let failed = true;

  try {
    await client.query('BEGIN');

    const businessResult = await client.query<BusinessRow>(
      `INSERT INTO businesses (
         name, description, contact_email, contact_phone,
         website_url, timezone, opening_hours, retention_days
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)
       RETURNING ${BUSINESS_SELECT_COLUMNS}`,
      [
        input.name,
        input.description,
        input.contactEmail,
        input.contactPhone,
        input.websiteUrl,
        input.timezone,
        serializeOpeningHours(input.openingHours),
        input.retentionDays,
      ],
    );

    const businessRow = businessResult.rows[0];

    if (!businessRow) {
      throw new Error('Failed to insert business.');
    }

    const memberResult = await client.query<{ id: string; role: BusinessRole }>(
      `INSERT INTO business_members (business_id, user_id, role)
       VALUES ($1, $2, 'owner')
       RETURNING id, role`,
      [businessRow.id, userId],
    );

    const memberRow = memberResult.rows[0];

    if (!memberRow) {
      throw new Error('Failed to insert business owner membership.');
    }

    await client.query('COMMIT');
    failed = false;

    return {
      business: mapBusinessRow(businessRow),
      membershipId: memberRow.id,
      role: memberRow.role,
    };
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // Discard this client below.
    }

    throw error;
  } finally {
    client.release(failed);
  }
}

export async function updateBusinessProfile(
  businessId: string,
  input: UpdateBusinessInput,
): Promise<BusinessProfile | null> {
  const assignments: string[] = [];
  const values: unknown[] = [businessId];

  const pushAssignment = (columnSql: string, value: unknown): void => {
    values.push(value);
    assignments.push(`${columnSql} = $${values.length}`);
  };

  if (input.name !== undefined) {
    pushAssignment('name', input.name);
  }
  if (input.description !== undefined) {
    pushAssignment('description', input.description);
  }
  if (input.contactEmail !== undefined) {
    pushAssignment('contact_email', input.contactEmail);
  }
  if (input.contactPhone !== undefined) {
    pushAssignment('contact_phone', input.contactPhone);
  }
  if (input.websiteUrl !== undefined) {
    pushAssignment('website_url', input.websiteUrl);
  }
  if (input.timezone !== undefined) {
    pushAssignment('timezone', input.timezone);
  }
  if (input.openingHours !== undefined) {
    values.push(serializeOpeningHours(input.openingHours));
    assignments.push(`opening_hours = $${values.length}::jsonb`);
  }
  if (input.retentionDays !== undefined) {
    pushAssignment('retention_days', input.retentionDays);
  }

  if (assignments.length === 0) {
    return findBusinessProfileById(businessId);
  }

  const result = await postgresPool.query<BusinessRow>(
    `UPDATE businesses
     SET ${assignments.join(', ')}
     WHERE id = $1
     RETURNING ${BUSINESS_SELECT_COLUMNS}`,
    values,
  );

  const row = result.rows[0];
  return row ? mapBusinessRow(row) : null;
}

export async function listLocationsForTenant(
  businessId: string,
  includeArchived = false,
): Promise<BusinessLocation[]> {
  const archiveFilter = includeArchived ? '' : 'AND archived_at IS NULL';
  const result = await postgresPool.query<BusinessLocationRow>(
    `SELECT ${LOCATION_SELECT_COLUMNS}
     FROM business_locations
     WHERE business_id = $1 ${archiveFilter}
     ORDER BY created_at ASC, id ASC`,
    [businessId],
  );

  return result.rows.map(mapLocationRow);
}

export async function findLocationForTenant(
  businessId: string,
  locationId: string,
): Promise<BusinessLocation | null> {
  const result = await postgresPool.query<BusinessLocationRow>(
    `SELECT ${LOCATION_SELECT_COLUMNS}
     FROM business_locations
     WHERE business_id = $1 AND id = $2
     LIMIT 1`,
    [businessId, locationId],
  );

  const row = result.rows[0];
  return row ? mapLocationRow(row) : null;
}

export async function createLocationForTenant(
  businessId: string,
  input: CreateLocationInput,
): Promise<BusinessLocation> {
  try {
    const result = await postgresPool.query<BusinessLocationRow>(
      `INSERT INTO business_locations (
         business_id, name,
         address_line1, address_line2, city, state_region, postal_code, country_code,
         contact_email, contact_phone, timezone, opening_hours
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb)
       RETURNING ${LOCATION_SELECT_COLUMNS}`,
      [
        businessId,
        input.name,
        input.address?.line1 ?? null,
        input.address?.line2 ?? null,
        input.address?.city ?? null,
        input.address?.stateRegion ?? null,
        input.address?.postalCode ?? null,
        input.address?.countryCode ?? null,
        input.contactEmail,
        input.contactPhone,
        input.timezone,
        serializeOpeningHours(input.openingHours),
      ],
    );

    const row = result.rows[0];

    if (!row) {
      throw new Error('Failed to insert business location.');
    }

    return mapLocationRow(row);
  } catch (error) {
    if (isPgUniqueViolation(error, 'business_locations_business_name_unique')) {
      throw new HttpError(
        409,
        'LOCATION_NAME_CONFLICT',
        'An active location with this name already exists for this business.',
      );
    }

    throw error;
  }
}

export async function updateLocationForTenant(
  businessId: string,
  locationId: string,
  input: UpdateLocationInput,
): Promise<{ status: 'updated'; location: BusinessLocation } | { status: 'not_found' } | { status: 'archived' }> {
  const assignments: string[] = [];
  const values: unknown[] = [businessId, locationId];

  const pushAssignment = (columnSql: string, value: unknown): void => {
    values.push(value);
    assignments.push(`${columnSql} = $${values.length}`);
  };

  if (input.name !== undefined) {
    pushAssignment('name', input.name);
  }
  if (input.timezone !== undefined) {
    pushAssignment('timezone', input.timezone);
  }
  if (input.address !== undefined) {
    pushAssignment('address_line1', input.address?.line1 ?? null);
    pushAssignment('address_line2', input.address?.line2 ?? null);
    pushAssignment('city', input.address?.city ?? null);
    pushAssignment('state_region', input.address?.stateRegion ?? null);
    pushAssignment('postal_code', input.address?.postalCode ?? null);
    pushAssignment('country_code', input.address?.countryCode ?? null);
  }
  if (input.contactEmail !== undefined) {
    pushAssignment('contact_email', input.contactEmail);
  }
  if (input.contactPhone !== undefined) {
    pushAssignment('contact_phone', input.contactPhone);
  }
  if (input.openingHours !== undefined) {
    values.push(serializeOpeningHours(input.openingHours));
    assignments.push(`opening_hours = $${values.length}::jsonb`);
  }

  try {
    const result = await postgresPool.query<BusinessLocationRow>(
      `UPDATE business_locations
       SET ${assignments.join(', ')}
       WHERE business_id = $1 AND id = $2 AND archived_at IS NULL
       RETURNING ${LOCATION_SELECT_COLUMNS}`,
      values,
    );

    const updated = result.rows[0];

    if (updated) {
      return { status: 'updated', location: mapLocationRow(updated) };
    }
  } catch (error) {
    if (isPgUniqueViolation(error, 'business_locations_business_name_unique')) {
      throw new HttpError(
        409,
        'LOCATION_NAME_CONFLICT',
        'An active location with this name already exists for this business.',
      );
    }

    throw error;
  }

  const existing = await findLocationForTenant(businessId, locationId);
  return existing ? { status: 'archived' } : { status: 'not_found' };
}

export async function archiveLocationForTenant(
  businessId: string,
  locationId: string,
): Promise<{ status: 'archived'; location: BusinessLocation } | { status: 'not_found' } | { status: 'already_archived' }> {
  const result = await postgresPool.query<BusinessLocationRow>(
    `UPDATE business_locations
     SET archived_at = CURRENT_TIMESTAMP
     WHERE business_id = $1 AND id = $2 AND archived_at IS NULL
     RETURNING ${LOCATION_SELECT_COLUMNS}`,
    [businessId, locationId],
  );

  const archived = result.rows[0];

  if (archived) {
    return { status: 'archived', location: mapLocationRow(archived) };
  }

  const existing = await findLocationForTenant(businessId, locationId);
  return existing ? { status: 'already_archived' } : { status: 'not_found' };
}

export async function listMembersForTenant(businessId: string): Promise<BusinessMemberSummary[]> {
  const result = await postgresPool.query<{
    membership_id: string;
    user_id: string;
    email: string;
    display_name: string;
    role: BusinessRole;
    created_at: Date;
  }>(
    `SELECT
       bm.id AS membership_id,
       u.id AS user_id,
       u.email,
       u.display_name,
       bm.role,
       bm.created_at
     FROM business_members bm
     INNER JOIN users u ON u.id = bm.user_id
     WHERE bm.business_id = $1
     ORDER BY bm.created_at ASC, bm.id ASC`,
    [businessId],
  );

  return result.rows.map((row) => ({
    membershipId: row.membership_id,
    userId: row.user_id,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
    createdAt: row.created_at,
  }));
}
