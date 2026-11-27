import { postgresPool } from '../../integrations/database/postgres.js';
import type { BusinessRole, TenantContext } from '../../types/express.js';

export interface BusinessLocationSummary {
  id: string;
  businessId: string;
  name: string;
  createdAt: Date;
}

export interface BusinessMemberSummary {
  membershipId: string;
  userId: string;
  email: string;
  displayName: string;
  role: BusinessRole;
  createdAt: Date;
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

export async function listLocationsForTenant(businessId: string): Promise<BusinessLocationSummary[]> {
  const result = await postgresPool.query<{
    id: string;
    business_id: string;
    name: string;
    created_at: Date;
  }>(
    `SELECT id, business_id, name, created_at
     FROM business_locations
     WHERE business_id = $1
     ORDER BY created_at ASC, id ASC`,
    [businessId],
  );

  return result.rows.map((row) => ({
    id: row.id,
    businessId: row.business_id,
    name: row.name,
    createdAt: row.created_at,
  }));
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

