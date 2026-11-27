import type { TenantContext } from '../../types/express.js';
import { HttpError } from '../../utils/http-error.js';
import { listUserMemberships, type UserMembershipSummary } from '../auth/auth.repository.js';
import {
  archiveLocationForTenant,
  createBusinessWithOwner,
  createLocationForTenant,
  findBusinessProfileById,
  findLocationForTenant,
  listLocationsForTenant,
  listMembersForTenant,
  updateBusinessProfile,
  updateLocationForTenant,
} from './businesses.repository.js';
import type {
  BusinessLocation,
  BusinessMemberSummary,
  BusinessProfile,
  CreateBusinessInput,
  CreateLocationInput,
  UpdateBusinessInput,
  UpdateLocationInput,
} from './businesses.types.js';

export async function getBusinessesForUser(userId: string): Promise<UserMembershipSummary[]> {
  return listUserMemberships(userId);
}

export async function createBusinessProfileForUser(
  userId: string,
  input: CreateBusinessInput,
) {
  return createBusinessWithOwner(userId, input);
}

export async function getTenantBusinessProfile(tenant: TenantContext): Promise<BusinessProfile> {
  const business = await findBusinessProfileById(tenant.businessId);

  if (!business) {
    throw new HttpError(403, 'TENANT_ACCESS_DENIED', 'You do not have access to this business.');
  }

  return business;
}

export async function updateTenantBusinessProfile(
  tenant: TenantContext,
  input: UpdateBusinessInput,
): Promise<BusinessProfile> {
  const updated = await updateBusinessProfile(tenant.businessId, input);

  if (!updated) {
    throw new HttpError(403, 'TENANT_ACCESS_DENIED', 'You do not have access to this business.');
  }

  return updated;
}

export async function getTenantLocations(
  tenant: TenantContext,
  includeArchived = false,
): Promise<BusinessLocation[]> {
  return listLocationsForTenant(tenant.businessId, includeArchived);
}

export async function getTenantLocationById(
  tenant: TenantContext,
  locationId: string,
): Promise<BusinessLocation> {
  const location = await findLocationForTenant(tenant.businessId, locationId);

  if (!location) {
    throw new HttpError(404, 'LOCATION_NOT_FOUND', 'Business location not found.');
  }

  return location;
}

export async function createTenantLocation(
  tenant: TenantContext,
  input: CreateLocationInput,
): Promise<BusinessLocation> {
  return createLocationForTenant(tenant.businessId, input);
}

export async function updateTenantLocation(
  tenant: TenantContext,
  locationId: string,
  input: UpdateLocationInput,
): Promise<BusinessLocation> {
  const result = await updateLocationForTenant(tenant.businessId, locationId, input);

  if (result.status === 'not_found') {
    throw new HttpError(404, 'LOCATION_NOT_FOUND', 'Business location not found.');
  }

  if (result.status === 'archived') {
    throw new HttpError(409, 'LOCATION_ARCHIVED', 'Archived locations cannot be modified.');
  }

  return result.location;
}

export async function archiveTenantLocation(
  tenant: TenantContext,
  locationId: string,
): Promise<BusinessLocation> {
  const result = await archiveLocationForTenant(tenant.businessId, locationId);

  if (result.status === 'not_found') {
    throw new HttpError(404, 'LOCATION_NOT_FOUND', 'Business location not found.');
  }

  if (result.status === 'already_archived') {
    throw new HttpError(409, 'LOCATION_ALREADY_ARCHIVED', 'Business location is already archived.');
  }

  return result.location;
}

export async function getTenantMembers(tenant: TenantContext): Promise<BusinessMemberSummary[]> {
  return listMembersForTenant(tenant.businessId);
}
