import type { Request, Response } from 'express';
import { HttpError } from '../../utils/http-error.js';
import {
  getBusinessesForUser,
  getTenantLocations,
  getTenantMembers,
  getTenantOverview,
} from './businesses.service.js';

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

export async function handleListUserBusinesses(req: Request, res: Response): Promise<void> {
  res.set('Cache-Control', 'no-store');
  const auth = requireVerifiedAuth(req);
  const businesses = await getBusinessesForUser(auth.user.id);
  res.status(200).json({ businesses });
}

export function handleGetBusiness(req: Request, res: Response): void {
  res.set('Cache-Control', 'no-store');
  const tenant = requireVerifiedTenant(req);
  res.status(200).json(getTenantOverview(tenant));
}

export async function handleListBusinessLocations(req: Request, res: Response): Promise<void> {
  res.set('Cache-Control', 'no-store');
  const tenant = requireVerifiedTenant(req);
  const locations = await getTenantLocations(tenant);
  res.status(200).json({
    businessId: tenant.businessId,
    locations: locations.map((location) => ({
      id: location.id,
      businessId: location.businessId,
      name: location.name,
      createdAt: location.createdAt.toISOString(),
    })),
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

