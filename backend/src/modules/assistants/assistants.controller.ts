import type { Request, Response } from 'express';
import { HttpError } from '../../utils/http-error.js';
import { validateUuid } from '../auth/auth.validation.js';
import {
  createTenantAssistant,
  createTenantAssistantDraftVersion,
  getTenantAssistantDetail,
  getTenantAssistants,
  getTenantAssistantVersion,
  getTenantAssistantVersions,
  listApprovedTools,
  publishTenantAssistantVersion,
  updateTenantAssistantDraftVersion,
} from './assistants.service.js';
import type { Assistant, AssistantVersion } from './assistants.types.js';
import {
  validateCreateAssistantInput,
  validateCreateDraftVersionInput,
  validatePublishInput,
  validateUpdateDraftVersionInput,
} from './assistants.validation.js';

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

function serializeAssistant(assistant: Assistant) {
  return {
    id: assistant.id,
    businessId: assistant.businessId,
    locationId: assistant.locationId,
    scope: assistant.locationId ? 'location' : 'business',
    createdAt: assistant.createdAt.toISOString(),
    updatedAt: assistant.updatedAt.toISOString(),
  };
}

function serializeAssistantVersion(version: AssistantVersion) {
  return {
    id: version.id,
    assistantId: version.assistantId,
    businessId: version.businessId,
    versionNumber: version.versionNumber,
    status: version.status,
    displayName: version.displayName,
    description: version.description,
    welcomeMessage: version.welcomeMessage,
    systemInstructions: version.systemInstructions,
    language: version.language,
    tone: version.tone,
    fallbackMessage: version.fallbackMessage,
    modelSettings: version.modelSettings,
    allowedTools: version.allowedTools,
    allowedKnowledgeScopes: version.allowedKnowledgeScopes,
    knowledgeLocationScope: version.knowledgeLocationScope,
    knowledgeLocationIds: version.knowledgeLocationIds,
    createdByUserId: version.createdByUserId,
    publishedByUserId: version.publishedByUserId,
    publishedAt: version.publishedAt ? version.publishedAt.toISOString() : null,
    createdAt: version.createdAt.toISOString(),
    updatedAt: version.updatedAt.toISOString(),
  };
}

export function handleListApprovedTools(_req: Request, res: Response): void {
  res.set('Cache-Control', 'no-store');
  res.status(200).json({ tools: listApprovedTools() });
}

export async function handleListAssistants(req: Request, res: Response): Promise<void> {
  res.set('Cache-Control', 'no-store');
  const tenant = requireVerifiedTenant(req);
  const assistants = await getTenantAssistants(tenant);

  res.status(200).json({
    businessId: tenant.businessId,
    assistants: assistants.map((entry) => ({
      ...serializeAssistant(entry.assistant),
      publishedVersion: entry.publishedVersion
        ? serializeAssistantVersion(entry.publishedVersion)
        : null,
      draftVersion: entry.draftVersion ? serializeAssistantVersion(entry.draftVersion) : null,
    })),
  });
}

export async function handleCreateAssistant(req: Request, res: Response): Promise<void> {
  res.set('Cache-Control', 'no-store');
  const auth = requireVerifiedAuth(req);
  const tenant = requireVerifiedTenant(req);
  const input = validateCreateAssistantInput(req.body);
  const created = await createTenantAssistant(tenant, auth, input);

  res.status(201).json({
    businessId: tenant.businessId,
    assistant: serializeAssistant(created.assistant),
    version: serializeAssistantVersion(created.version),
  });
}

export async function handleGetAssistant(req: Request, res: Response): Promise<void> {
  res.set('Cache-Control', 'no-store');
  const tenant = requireVerifiedTenant(req);
  const assistantId = validateUuid(req.params.assistantId, 'assistantId');
  const detail = await getTenantAssistantDetail(tenant, assistantId);

  res.status(200).json({
    businessId: tenant.businessId,
    assistant: serializeAssistant(detail.assistant),
    publishedVersion: detail.publishedVersion
      ? serializeAssistantVersion(detail.publishedVersion)
      : null,
    draftVersion: detail.draftVersion ? serializeAssistantVersion(detail.draftVersion) : null,
  });
}

export async function handleListAssistantVersions(req: Request, res: Response): Promise<void> {
  res.set('Cache-Control', 'no-store');
  const tenant = requireVerifiedTenant(req);
  const assistantId = validateUuid(req.params.assistantId, 'assistantId');
  const versions = await getTenantAssistantVersions(tenant, assistantId);

  res.status(200).json({
    businessId: tenant.businessId,
    assistantId,
    versions: versions.map(serializeAssistantVersion),
  });
}

export async function handleGetAssistantVersion(req: Request, res: Response): Promise<void> {
  res.set('Cache-Control', 'no-store');
  const tenant = requireVerifiedTenant(req);
  const assistantId = validateUuid(req.params.assistantId, 'assistantId');
  const versionId = validateUuid(req.params.versionId, 'versionId');
  const version = await getTenantAssistantVersion(tenant, assistantId, versionId);

  res.status(200).json({
    businessId: tenant.businessId,
    assistantId,
    version: serializeAssistantVersion(version),
  });
}

export async function handleCreateAssistantDraftVersion(req: Request, res: Response): Promise<void> {
  res.set('Cache-Control', 'no-store');
  const auth = requireVerifiedAuth(req);
  const tenant = requireVerifiedTenant(req);
  const assistantId = validateUuid(req.params.assistantId, 'assistantId');
  const overrides = validateCreateDraftVersionInput(req.body);
  const version = await createTenantAssistantDraftVersion(tenant, auth, assistantId, overrides);

  res.status(201).json({
    businessId: tenant.businessId,
    assistantId,
    version: serializeAssistantVersion(version),
  });
}

export async function handleUpdateAssistantDraftVersion(req: Request, res: Response): Promise<void> {
  res.set('Cache-Control', 'no-store');
  const tenant = requireVerifiedTenant(req);
  const assistantId = validateUuid(req.params.assistantId, 'assistantId');
  const versionId = validateUuid(req.params.versionId, 'versionId');
  const overrides = validateUpdateDraftVersionInput(req.body);
  const version = await updateTenantAssistantDraftVersion(tenant, assistantId, versionId, overrides);

  res.status(200).json({
    businessId: tenant.businessId,
    assistantId,
    version: serializeAssistantVersion(version),
  });
}

export async function handlePublishAssistantVersion(req: Request, res: Response): Promise<void> {
  res.set('Cache-Control', 'no-store');
  const auth = requireVerifiedAuth(req);
  const tenant = requireVerifiedTenant(req);
  const assistantId = validateUuid(req.params.assistantId, 'assistantId');
  const versionId = validateUuid(req.params.versionId, 'versionId');
  validatePublishInput(req.body);
  const version = await publishTenantAssistantVersion(tenant, auth, assistantId, versionId);

  res.status(200).json({
    businessId: tenant.businessId,
    assistantId,
    version: serializeAssistantVersion(version),
  });
}

