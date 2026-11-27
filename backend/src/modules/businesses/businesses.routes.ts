import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.js';
import { requireTenantMembership } from '../../middlewares/tenant.js';
import {
  handleGetBusiness,
  handleListBusinessLocations,
  handleListBusinessMembers,
  handleListUserBusinesses,
} from './businesses.controller.js';

export const businessesRouter = Router();

businessesRouter.use(requireAuth);

businessesRouter.get('/', handleListUserBusinesses);
businessesRouter.get('/:businessId', requireTenantMembership(['owner', 'operator']), handleGetBusiness);
businessesRouter.get('/:businessId/locations', requireTenantMembership(['owner', 'operator']), handleListBusinessLocations);
businessesRouter.get('/:businessId/members', requireTenantMembership(['owner']), handleListBusinessMembers);

