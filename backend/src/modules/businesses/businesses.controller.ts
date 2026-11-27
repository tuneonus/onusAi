import type { Request, Response } from 'express';
import { HttpError } from '../../utils/http-error.js';
import { validateUuid } from '../auth/auth.validation.js';
import {
  archiveTenantLocation,
  createBusinessProfileForUser,
  createTenantLocation,
  getBusinessesForUser,
  getTenantBusinessProfile,
  getTenantLocationById,
  getTenantLocations,
  getTenantMembers,
  updateTenantBusinessProfile,
  updateTenantLocation,
} from './businesses.service.js';
import type { BusinessLocation, BusinessProfile } from './businesses.types.js';
import {
  validateCreateBusinessInput,
  validateCreateLocationInput,
  validateIncludeArchivedQuery,
  validateUpdateBusinessInput,
  validateUpdateLocationInput,
} from './businesses.validation.js';

function requireVerifiedAuth(req: Request) {
  if (!req.auth) {
    throw new HttpError(401, 'AUTHENTICATION_REQUIRED', 'Authentication is required.');
  }

  return req.auth;
}

function requireVerifiedTenant(req: Request) {
  if (!req.tenant) {
    throw new HttpError(403, 'TENANT_ACCESS_DENIED', 'You do not have access to this business.');
  }

  return req.tenant;
}

function serializeBusinessProfile(business: BusinessProfile) {
  return {
    id: business.id,
    name: business.name,
    description: business.description,
    contactEmail: business.contactEmail,
    contactPhone: business.contactPhone,
    websiteUrl: business.websiteUrl,
    timezone: business.timezone,
    openingHours: business.openingHours,
    retentionDays: business.retentionDays,
    createdAt: business.createdAt.toISOString(),
    updatedAt: business.updatedAt.toISOString(),
  };
}

function serializeBusinessLocation(location: BusinessLocation) {
  return {
    id: location.id,
    businessId: location.businessId,
    name: location.name,
    address: location.address,
    contactEmail: location.contactEmail,
    contactPhone: location.contactPhone,
    timezone: location.timezone,
    openingHours: location.openingHours,
    archivedAt: location.archivedAt ? location.archivedAt.toISOString() : null,
    createdAt: location.createdAt.toISOString(),
    updatedAt: location.updatedAt.toISOString(),
  };
}

export async function handleListUserBusinesses(req: Request, res: Response): Promise<void> {
  res.set('Cache-Control', 'no-store');
  const auth = requireVerifiedAuth(req);
  const businesses = await getBusinessesForUser(auth.user.id);
  res.status(200).json({ businesses });
}

export async function handleCreateBusiness(req: Request, res: Response): Promise<void> {
  res.set('Cache-Control', 'no-store');
  const auth = requireVerifiedAuth(req);
  const input = validateCreateBusinessInput(req.body);
  const created = await createBusinessProfileForUser(auth.user.id, input);

  res.status(201).json({
    business: serializeBusinessProfile(created.business),
    membership: {
      id: created.membershipId,
      role: created.role,
    },
  });
}

export async function handleGetBusiness(req: Request, res: Response): Promise<void> {
  res.set('Cache-Control', 'no-store');
  const tenant = requireVerifiedTenant(req);
  const business = await getTenantBusinessProfile(tenant);

  res.status(200).json({
    business: serializeBusinessProfile(business),
    membership: {
      id: tenant.membershipId,
      role: tenant.role,
    },
  });
}

export async function handleUpdateBusiness(req: Request, res: Response): Promise<void> {
  res.set('Cache-Control', 'no-store');
  const tenant = requireVerifiedTenant(req);
  const input = validateUpdateBusinessInput(req.body);
  const updated = await updateTenantBusinessProfile(tenant, input);

  res.status(200).json({
    business: serializeBusinessProfile(updated),
    membership: {
      id: tenant.membershipId,
      role: tenant.role,
    },
  });
}

export async function handleListBusinessLocations(req: Request, res: Response): Promise<void> {
  res.set('Cache-Control', 'no-store');
  const tenant = requireVerifiedTenant(req);
  const includeArchived = validateIncludeArchivedQuery(req.query.includeArchived);
  const locations = await getTenantLocations(tenant, includeArchived);

  res.status(200).json({
    businessId: tenant.businessId,
    locations: locations.map(serializeBusinessLocation),
  });
}

export async function handleGetBusinessLocation(req: Request, res: Response): Promise<void> {
  res.set('Cache-Control', 'no-store');
  const tenant = requireVerifiedTenant(req);
  const locationId = validateUuid(req.params.locationId, 'locationId');
  const location = await getTenantLocationById(tenant, locationId);

  res.status(200).json({
    businessId: tenant.businessId,
    location: serializeBusinessLocation(location),
  });
}

export async function handleCreateBusinessLocation(req: Request, res: Response): Promise<void> {
  res.set('Cache-Control', 'no-store');
  const tenant = requireVerifiedTenant(req);
  const input = validateCreateLocationInput(req.body);
  const location = await createTenantLocation(tenant, input);

  res.status(201).json({
    businessId: tenant.businessId,
    location: serializeBusinessLocation(location),
  });
}

export async function handleUpdateBusinessLocation(req: Request, res: Response): Promise<void> {
  res.set('Cache-Control', 'no-store');
  const tenant = requireVerifiedTenant(req);
  const locationId = validateUuid(req.params.locationId, 'locationId');
  const input = validateUpdateLocationInput(req.body);
  const location = await updateTenantLocation(tenant, locationId, input);

  res.status(200).json({
    businessId: tenant.businessId,
    location: serializeBusinessLocation(location),
  });
}

export async function handleArchiveBusinessLocation(req: Request, res: Response): Promise<void> {
  res.set('Cache-Control', 'no-store');
  const tenant = requireVerifiedTenant(req);
  const locationId = validateUuid(req.params.locationId, 'locationId');
  const location = await archiveTenantLocation(tenant, locationId);

  res.status(200).json({
    businessId: tenant.businessId,
    location: serializeBusinessLocation(location),
  });
}

export async function handleListBusinessMembers(req: Request, res: Response): Promise<void> {
  res.set('Cache-Control', 'no-store');
  const tenant = requireVerifiedTenant(req);
  const members = await getTenantMembers(tenant);
  res.status(200).json({
    businessId: tenant.businessId,
    members: members.map((member) => ({
      membershipId: member.membershipId,
      userId: member.userId,
      email: member.email,
      displayName: member.displayName,
      role: member.role,
      createdAt: member.createdAt.toISOString(),
    })),
  });
}
