import { Router } from 'express';
import { requireAuth, requireCsrf } from '../../middlewares/auth.js';
import { requireTenantMembership } from '../../middlewares/tenant.js';
import { assistantsRouter } from '../assistants/assistants.routes.js';
import { conversationsRouter } from '../conversations/conversations.routes.js';
import {
  handleArchiveBusinessLocation,
  handleCreateBusiness,
  handleCreateBusinessLocation,
  handleGetBusiness,
  handleGetBusinessLocation,
  handleListBusinessLocations,
  handleListBusinessMembers,
  handleListUserBusinesses,
  handleUpdateBusiness,
  handleUpdateBusinessLocation,
} from './businesses.controller.js';

export const businessesRouter = Router();

businessesRouter.use(requireAuth);
businessesRouter.use(requireCsrf);

businessesRouter.get('/', handleListUserBusinesses);
businessesRouter.post('/', handleCreateBusiness);

businessesRouter.get('/:businessId', requireTenantMembership(['owner', 'operator']), handleGetBusiness);
businessesRouter.patch('/:businessId', requireTenantMembership(['owner']), handleUpdateBusiness);

businessesRouter.get(
  '/:businessId/locations',
  requireTenantMembership(['owner', 'operator']),
  handleListBusinessLocations,
);
businessesRouter.post(
  '/:businessId/locations',
  requireTenantMembership(['owner']),
  handleCreateBusinessLocation,
);
businessesRouter.get(
  '/:businessId/locations/:locationId',
  requireTenantMembership(['owner', 'operator']),
  handleGetBusinessLocation,
);
businessesRouter.patch(
  '/:businessId/locations/:locationId',
  requireTenantMembership(['owner']),
  handleUpdateBusinessLocation,
);
businessesRouter.delete(
  '/:businessId/locations/:locationId',
  requireTenantMembership(['owner']),
  handleArchiveBusinessLocation,
);

businessesRouter.get(
  '/:businessId/members',
  requireTenantMembership(['owner']),
  handleListBusinessMembers,
);

businessesRouter.use('/:businessId/assistants', assistantsRouter);
businessesRouter.use('/:businessId/conversations', conversationsRouter);
