import { apiRequest, ApiClientError } from '../../services/api/client.ts';
import type { UserMembershipSummary } from '../auth/types';
import { TONES, type Assistant, type AssistantConfig, type AssistantVersion, type ApprovedTool } from './types.ts';
const object = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every(x => typeof x === 'string');
export function isVersion(v: unknown, businessId: string, assistantId?: string): v is AssistantVersion {
  if (!object(v) || !object(v.modelSettings)) return false;
  return v.businessId === businessId && typeof v.id === 'string' && typeof v.assistantId === 'string' && (!assistantId || v.assistantId === assistantId)
    && Number.isInteger(v.versionNumber) && Number(v.versionNumber) > 0 && ['draft','published','superseded'].includes(String(v.status))
    && ['displayName','systemInstructions','welcomeMessage','fallbackMessage','language','createdAt','updatedAt'].every(key => typeof v[key] === 'string')
    && (v.description === null || typeof v.description === 'string') && TONES.includes(v.tone as typeof TONES[number])
    && ['temperature','maxOutputTokens','maxContextMessages'].every(key => typeof (v.modelSettings as Record<string, unknown>)[key] === 'number')
    && Number.isFinite(v.modelSettings.temperature) && Number(v.modelSettings.temperature) >= 0 && Number(v.modelSettings.temperature) <= 1
    && Number.isInteger(v.modelSettings.maxOutputTokens) && Number(v.modelSettings.maxOutputTokens) >= 64 && Number(v.modelSettings.maxOutputTokens) <= 2048
    && Number.isInteger(v.modelSettings.maxContextMessages) && Number(v.modelSettings.maxContextMessages) >= 1 && Number(v.modelSettings.maxContextMessages) <= 20
    && strings(v.allowedTools) && strings(v.allowedKnowledgeScopes) && v.allowedKnowledgeScopes.every(x => ['public','staff_only'].includes(x))
    && strings(v.knowledgeLocationIds) && ['business_wide','assigned_location','selected_locations'].includes(String(v.knowledgeLocationScope))
    && (v.publishedAt === null || typeof v.publishedAt === 'string');
}
function invalid(): never { throw new ApiClientError({ status: 502, code: 'INVALID_ASSISTANT_RESPONSE', message: 'The assistant response could not be verified.' }); }
export async function assistantRequest(membership: UserMembershipSummary, signal: AbortSignal, action: 'list' | 'tools' | 'versions' | 'create' | 'draft' | 'update' | 'publish', assistantId?: string, versionId?: string, body?: unknown) {
  signal.throwIfAborted();
  const write = ['create','draft','update','publish'].includes(action);
  if (!membership.businessId || (write && membership.role !== 'owner')) throw new ApiClientError({ status: 403, code: 'INSUFFICIENT_PERMISSIONS', message: 'Only owners can configure assistants.' });
  const base = `/businesses/${encodeURIComponent(membership.businessId)}/assistants`;
  const target = assistantId ? `${base}/${encodeURIComponent(assistantId)}/versions` : base;
  const path = action === 'tools' ? `${base}/tools` : action === 'update' || action === 'publish' ? `${target}/${encodeURIComponent(versionId ?? '')}${action === 'publish' ? '/publish' : ''}` : action === 'draft' || action === 'versions' ? target : base;
  const result = await apiRequest<unknown>(path, { signal, method: action === 'update' ? 'PATCH' : write ? 'POST' : 'GET', body: write ? body ?? {} : undefined });
  signal.throwIfAborted();
  if (!object(result)) invalid();
  if (action === 'tools') {
    if (!Array.isArray(result.tools) || !result.tools.every(t => object(t) && typeof t.id === 'string' && typeof t.description === 'string' && t.defaultAllowed === false)) invalid();
    return result as unknown as { tools: ApprovedTool[] };
  }
  if (result.businessId !== membership.businessId) invalid();
  if (action === 'list') {
    if (!Array.isArray(result.assistants) || !result.assistants.every(a => object(a) && typeof a.id === 'string' && a.businessId === membership.businessId && (a.locationId === null || typeof a.locationId === 'string') && a.scope === (a.locationId ? 'location' : 'business') && [a.draftVersion,a.publishedVersion].every(v => v === null || isVersion(v,membership.businessId,String(a.id))))) invalid();
    return result as unknown as { assistants: Assistant[] };
  }
  if (action === 'versions') {
    if (result.assistantId !== assistantId || !Array.isArray(result.versions) || !result.versions.every(v => isVersion(v,membership.businessId,assistantId))) invalid();
    return result as unknown as { versions: AssistantVersion[] };
  }
  if (!isVersion(result.version, membership.businessId, assistantId)) invalid();
  return result as unknown as { version: AssistantVersion };
}
export type { AssistantConfig };
