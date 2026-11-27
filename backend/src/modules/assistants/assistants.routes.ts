import { Router } from 'express';
import { requireTenantMembership } from '../../middlewares/tenant.js';
import {
  handleCreateAssistant,
  handleCreateAssistantDraftVersion,
  handleGetAssistant,
  handleGetAssistantVersion,
  handleListApprovedTools,
  handleListAssistants,
  handleListAssistantVersions,
  handlePublishAssistantVersion,
  handleUpdateAssistantDraftVersion,
} from './assistants.controller.js';

export const assistantsRouter = Router({ mergeParams: true });

assistantsRouter.get('/tools', requireTenantMembership(['owner', 'operator']), handleListApprovedTools);

assistantsRouter.get('/', requireTenantMembership(['owner', 'operator']), handleListAssistants);
assistantsRouter.post('/', requireTenantMembership(['owner']), handleCreateAssistant);

assistantsRouter.get('/:assistantId', requireTenantMembership(['owner', 'operator']), handleGetAssistant);

assistantsRouter.get(
  '/:assistantId/versions',
  requireTenantMembership(['owner', 'operator']),
  handleListAssistantVersions,
);
assistantsRouter.post(
  '/:assistantId/versions',
  requireTenantMembership(['owner']),
  handleCreateAssistantDraftVersion,
);
assistantsRouter.get(
  '/:assistantId/versions/:versionId',
  requireTenantMembership(['owner', 'operator']),
  handleGetAssistantVersion,
);
assistantsRouter.patch(
  '/:assistantId/versions/:versionId',
  requireTenantMembership(['owner']),
  handleUpdateAssistantDraftVersion,
);
assistantsRouter.post(
  '/:assistantId/versions/:versionId/publish',
  requireTenantMembership(['owner']),
  handlePublishAssistantVersion,
);

