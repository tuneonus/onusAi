import { Router } from 'express';
import { requireInternalWorkerAuth } from '../../middlewares/internal-auth.js';
import { requireTenantMembership } from '../../middlewares/tenant.js';
import {
  handleGetKnowledgeCacheEpoch,
  handleStaffKnowledgeSearch,
  handleValidateRetrievalCandidates,
} from './retrieval.controller.js';

export const internalRetrievalRouter = Router();
internalRetrievalRouter.use(requireInternalWorkerAuth('retrieval:validate'));
internalRetrievalRouter.post('/validate', handleValidateRetrievalCandidates);
internalRetrievalRouter.get('/cache-epoch/:businessId', handleGetKnowledgeCacheEpoch);

export const knowledgeSearchRouter = Router({ mergeParams: true });
knowledgeSearchRouter.post(
  '/search',
  requireTenantMembership(['owner', 'operator']),
  handleStaffKnowledgeSearch,
);
knowledgeSearchRouter.get(
  '/cache-epoch',
  requireTenantMembership(['owner', 'operator']),
  handleGetKnowledgeCacheEpoch,
);

