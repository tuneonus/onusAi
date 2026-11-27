import { apiRequest, ApiClientError, type ApiRequestOptions } from '../../services/api/client.ts';
import type { UserMembershipSummary } from '../auth/types';
import { STATUSES, type Conversation, type Message, type Pagination, type Turn } from './types.ts';
const record = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
export function isConversation(v: unknown, businessId: string): v is Conversation {
  return record(v) && v.businessId === businessId && ['id', 'assistantId', 'assistantVersionId', 'createdAt', 'updatedAt'].every(k => typeof v[k] === 'string')
    && (v.locationId === null || typeof v.locationId === 'string') && ['playground', 'visitor'].includes(String(v.channel))
    && STATUSES.includes(v.status as typeof STATUSES[number]) && Number.isInteger(v.messageCount);
}
export function isMessage(v: unknown, businessId: string, conversationId: string): v is Message {
  return record(v) && v.businessId === businessId && v.conversationId === conversationId && typeof v.id === 'string'
    && typeof v.content === 'string' && typeof v.createdAt === 'string' && Number.isInteger(v.sequenceNumber) && Number(v.sequenceNumber) > 0
    && ['user', 'assistant', 'operator', 'system'].includes(String(v.role)) && record(v.metadata)
    && Object.values(v.metadata).every(x => x === null || ['string', 'number', 'boolean'].includes(typeof x));
}
function pagination(v: unknown): v is Pagination {
  return record(v) && ['limit', 'offset', 'total'].every(k => Number.isInteger(v[k]) && Number(v[k]) >= 0) && typeof v.hasMore === 'boolean';
}
export class ConversationApi {
  private membership: UserMembershipSummary;
  private signal: AbortSignal;
  constructor(membership: UserMembershipSummary, signal: AbortSignal) { this.membership = membership; this.signal = signal; }
  private async request(path: string, options: ApiRequestOptions = {}) {
    this.signal.throwIfAborted();
    if (!this.membership.businessId || !['owner', 'operator'].includes(this.membership.role)) throw new Error('No authorized workspace.');
    const response = await apiRequest<unknown>(`/businesses/${encodeURIComponent(this.membership.businessId)}/conversations${path}`, { ...options, signal: this.signal });
    this.signal.throwIfAborted();
    if (!record(response) || response.businessId !== this.membership.businessId) this.invalid();
    return response;
  }
  private invalid(): never { throw new ApiClientError({ status: 502, code: 'INVALID_CONVERSATION_RESPONSE', message: 'The conversation response could not be verified.' }); }
  async list(offset = 0) {
    const r = await this.request(`?limit=20&offset=${offset}`);
    if (!Array.isArray(r.conversations) || !r.conversations.every(v => isConversation(v, this.membership.businessId)) || !pagination(r.pagination)) this.invalid();
    return r as unknown as { conversations: Conversation[]; pagination: Pagination };
  }
  async conversation(id: string) {
    const r = await this.request(`/${encodeURIComponent(id)}`);
    if (!isConversation(r.conversation, this.membership.businessId) || r.conversation.id !== id) this.invalid();
    return r.conversation;
  }
  async create(assistantId: string, locationId: string | null, key: string) {
    const r = await this.request('', { method: 'POST', headers: { 'Idempotency-Key': key }, body: { assistantId, locationId, channel: 'playground' } });
    if (!isConversation(r.conversation, this.membership.businessId)) this.invalid();
    return r.conversation;
  }
  async messages(id: string): Promise<Message[]> {
    const messages: Message[] = []; let offset = 0;
    for (;;) {
      const r = await this.request(`/${encodeURIComponent(id)}/messages?limit=100&offset=${offset}`);
      if (r.conversationId !== id || !Array.isArray(r.messages) || !r.messages.every(v => isMessage(v, this.membership.businessId, id)) || !pagination(r.pagination)) this.invalid();
      messages.push(...r.messages);
      if (!r.pagination.hasMore) return messages.sort((a, b) => a.sequenceNumber - b.sequenceNumber);
      if (!r.messages.length) this.invalid();
      offset += r.messages.length;
    }
  }
  async turn(id: string, content: string, key: string): Promise<Turn> {
    const r = await this.request(`/${encodeURIComponent(id)}/turns`, { method: 'POST', headers: { 'Idempotency-Key': key }, body: { content } });
    if (r.conversationId !== id || typeof r.assistantVersionId !== 'string' || !isMessage(r.userMessage, this.membership.businessId, id)
      || !isMessage(r.assistantMessage, this.membership.businessId, id) || r.userMessage.role !== 'user' || r.assistantMessage.role !== 'assistant'
      || !record(r.ai) || !['mode', 'model', 'promptVersion', 'status', 'requestId'].every(k => typeof (r.ai as Record<string, unknown>)[k] === 'string')
      || typeof r.ai.grounded !== 'boolean' || !record(r.ai.usage) || !['inputTokens', 'outputTokens', 'totalTokens', 'latencyMs'].every(k => typeof ((r.ai as Record<string, unknown>).usage as Record<string, unknown>)[k] === 'number')) this.invalid();
    return r as unknown as Turn;
  }
  async status(id: string, status: Conversation['status']) {
    const r = await this.request(`/${encodeURIComponent(id)}`, { method: 'PATCH', body: { status } });
    if (!isConversation(r.conversation, this.membership.businessId) || r.conversation.id !== id) this.invalid();
    return r.conversation;
  }
  async remove(id: string, purge: boolean) {
    if (this.membership.role !== 'owner') throw new ApiClientError({ status: 403, code: 'INSUFFICIENT_PERMISSIONS', message: 'Only owners can delete conversations.' });
    const r = await this.request(`/${encodeURIComponent(id)}${purge ? '/purge' : ''}`, { method: purge ? 'POST' : 'DELETE', body: purge ? {} : undefined });
    if (r[purge ? 'purgedConversationId' : 'deletedConversationId'] !== id) this.invalid();
  }
}
