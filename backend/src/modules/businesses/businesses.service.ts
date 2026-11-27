import type { TenantContext } from '../../types/express.js';
import { listUserMemberships, type UserMembershipSummary } from '../auth/auth.repository.js';
import {
  listLocationsForTenant,
  listMembersForTenant,
  type BusinessLocationSummary,
  type BusinessMemberSummary,
} from './businesses.repository.js';

export async function getBusinessesForUser(userId: string): Promise<UserMembershipSummary[]> {
  return listUserMemberships(userId);
}

export function getTenantOverview(tenant: TenantContext) {
  return {
    business: {
      id: tenant.businessId,
      name: tenant.businessName,
    },
    membership: {
      id: tenant.membershipId,
      role: tenant.role,
    },
  };
}

export async function getTenantLocations(tenant: TenantContext): Promise<BusinessLocationSummary[]> {
  return listLocationsForTenant(tenant.businessId);
}

export async function getTenantMembers(tenant: TenantContext): Promise<BusinessMemberSummary[]> {
  return listMembersForTenant(tenant.businessId);
}

