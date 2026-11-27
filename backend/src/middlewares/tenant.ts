import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { validateUuid } from '../modules/auth/auth.validation.js';
import { findVerifiedBusinessMembership } from '../modules/businesses/businesses.repository.js';
import type { BusinessRole } from '../types/express.js';
import { HttpError } from '../utils/http-error.js';

export function requireTenantMembership(allowedRoles?: readonly BusinessRole[]): RequestHandler {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    if (!req.auth) {
      next(new HttpError(401, 'AUTHENTICATION_REQUIRED', 'Authentication is required.'));
      return;
    }

    const businessId = validateUuid(req.params.businessId, 'businessId');
    const membership = await findVerifiedBusinessMembership(businessId, req.auth.user.id);

    if (!membership) {
      next(new HttpError(403, 'TENANT_ACCESS_DENIED', 'You do not have access to this business.'));
      return;
    }

    if (allowedRoles && !allowedRoles.includes(membership.role)) {
      next(new HttpError(403, 'INSUFFICIENT_PERMISSIONS', 'You do not have permission to perform this action.'));
      return;
    }

    req.tenant = membership;
    next();
  };
}

