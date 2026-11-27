import type { AuthContext, TenantContext } from '../../types/express.js';
import { HttpError } from '../../utils/http-error.js';
import {
  createAssistantWithDraft,
  createDraftVersionForTenant,
  findAssistantDetailForTenant,
  findAssistantVersionForTenant,
  listAssistantsForTenant,
  listAssistantVersionsForTenant,
  publishVersionForTenant,
  updateDraftVersionForTenant,
} from './assistants.repository.js';
import {
  APPROVED_TOOL_REGISTRY,
  type ApprovedToolDefinition,
  type Assistant,
  type AssistantVersion,
  type AssistantWithVersions,
  type CreateAssistantInput,
  type DraftVersionOverrides,
  type PublicAssistantProfile,
} from './assistants.types.js';

export function listApprovedTools(): readonly ApprovedToolDefinition[] {
  return APPROVED_TOOL_REGISTRY;
}

export function toPublicAssistantProfile(
  assistant: Assistant,
  version: AssistantVersion,
): PublicAssistantProfile {
  return {
    assistantId: assistant.id,
    businessId: assistant.businessId,
    locationId: assistant.locationId,
    versionNumber: version.versionNumber,
    displayName: version.displayName,
    description: version.description,
    welcomeMessage: version.welcomeMessage,
    language: version.language,
    tone: version.tone,
  };
}

export async function getTenantAssistants(
  tenant: TenantContext,
): Promise<AssistantWithVersions[]> {
  return listAssistantsForTenant(tenant.businessId);
}

export async function createTenantAssistant(
  tenant: TenantContext,
  auth: AuthContext,
  input: CreateAssistantInput,
): Promise<{ assistant: Assistant; version: AssistantVersion }> {
  return createAssistantWithDraft(tenant.businessId, auth.user.id, input);
}

export async function getTenantAssistantDetail(
  tenant: TenantContext,
  assistantId: string,
): Promise<AssistantWithVersions> {
  const detail = await findAssistantDetailForTenant(tenant.businessId, assistantId);

  if (!detail) {
    throw new HttpError(404, 'ASSISTANT_NOT_FOUND', 'Assistant not found.');
  }

  return detail;
}

export async function getTenantAssistantVersions(
  tenant: TenantContext,
  assistantId: string,
): Promise<AssistantVersion[]> {
  const versions = await listAssistantVersionsForTenant(tenant.businessId, assistantId);

  if (!versions) {
    throw new HttpError(404, 'ASSISTANT_NOT_FOUND', 'Assistant not found.');
  }

  return versions;
}

export async function getTenantAssistantVersion(
  tenant: TenantContext,
  assistantId: string,
  versionId: string,
): Promise<AssistantVersion> {
  const version = await findAssistantVersionForTenant(tenant.businessId, assistantId, versionId);

  if (!version) {
    throw new HttpError(404, 'ASSISTANT_VERSION_NOT_FOUND', 'Assistant version not found.');
  }

  return version;
}

export async function createTenantAssistantDraftVersion(
  tenant: TenantContext,
  auth: AuthContext,
  assistantId: string,
  overrides: DraftVersionOverrides,
): Promise<AssistantVersion> {
  return createDraftVersionForTenant(tenant.businessId, assistantId, auth.user.id, overrides);
}

export async function updateTenantAssistantDraftVersion(
  tenant: TenantContext,
  assistantId: string,
  versionId: string,
  overrides: DraftVersionOverrides,
): Promise<AssistantVersion> {
  return updateDraftVersionForTenant(tenant.businessId, assistantId, versionId, overrides);
}

export async function publishTenantAssistantVersion(
  tenant: TenantContext,
  auth: AuthContext,
  assistantId: string,
  versionId: string,
): Promise<AssistantVersion> {
  return publishVersionForTenant(tenant.businessId, assistantId, versionId, auth.user.id);
}

