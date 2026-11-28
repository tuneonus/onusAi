import type { Request, Response } from 'express';
import { requestAiRetrieve } from '../../integrations/ai/ai-client.js';
import { HttpError } from '../../utils/http-error.js';
import { validateUuid } from '../auth/auth.validation.js';
import { getBusinessKnowledgeEpoch } from '../vector-cleanup/vector-cleanup.repository.js';
import {
  resolveStaffSearchScope,
  validateRetrievalCandidates,
} from './retrieval.repository.js';
import {
  validateKnowledgeSearchInput,
  validateRetrievalCandidatesInput,
} from './retrieval.validation.js';

export async function handleValidateRetrievalCandidates(
  req: Request,
  res: Response,
): Promise<void> {
  res.set('Cache-Control', 'no-store');
  const input = validateRetrievalCandidatesInput(req.body);
  const results = await validateRetrievalCandidates(input);
  res.status(200).json({ results });
}

export async function handleStaffKnowledgeSearch(
  req: Request,
  res: Response,
): Promise<void> {
  if (!req.tenant) {
    throw new HttpError(403, 'TENANT_ACCESS_DENIED', 'You do not have access to this business.');
  }

  res.set('Cache-Control', 'no-store');
  const input = validateKnowledgeSearchInput(req.body);
  const scope = await resolveStaffSearchScope(req.tenant.businessId, input);

  const response = await requestAiRetrieve({
    businessId: scope.businessId,
    allowedKnowledgeScopes: scope.allowedVisibilities,
    locationIds: scope.allowedLocationIds,
    includeBusinessWide: scope.includeBusinessWide,
    query: input.query,
    topK: input.topK,
    scoreThreshold: input.scoreThreshold,
    requestId: req.requestId,
  });

  res.status(200).json(response);
}

export async function handleGetKnowledgeCacheEpoch(
  req: Request,
  res: Response,
): Promise<void> {
  const businessId = req.tenant
    ? req.tenant.businessId
    : validateUuid(req.params.businessId, 'businessId');
  res.set('Cache-Control', 'no-store');
  const epoch = await getBusinessKnowledgeEpoch(businessId);
  res.status(200).json({
    businessId: epoch.businessId,
    knowledgeEpoch: epoch.knowledgeEpoch,
    lastInvalidatedAt: epoch.lastInvalidatedAt
      ? epoch.lastInvalidatedAt.toISOString()
      : null,
    lastReason: epoch.lastReason,
  });
}

