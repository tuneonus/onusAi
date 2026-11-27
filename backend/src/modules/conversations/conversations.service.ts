import type { AuthContext, TenantContext } from '../../types/express.js';
import { HttpError } from '../../utils/http-error.js';
import {
  appendConversationMessage,
  createPlaygroundConversation,
  findActiveConversationForTenant,
  listConversationsForTenant,
  listMessagesForConversation,
  purgeConversationForTenant,
  softDeleteConversationForTenant,
  updateConversationStatusForTenant,
} from './conversations.repository.js';
import type {
  Conversation,
  ConversationMessage,
  ConversationStatus,
  CreateConversationInput,
  CreateMessageInput,
  ListConversationsFilter,
  ListMessagesQuery,
  PaginationMeta,
} from './conversations.types.js';

export async function createStaffConversation(
  tenant: TenantContext,
  auth: AuthContext,
  input: CreateConversationInput,
): Promise<{ conversation: Conversation; created: boolean }> {
  return createPlaygroundConversation(tenant.businessId, auth.user.id, input);
}

export async function getTenantConversations(
  tenant: TenantContext,
  filter: ListConversationsFilter,
): Promise<{ conversations: Conversation[]; pagination: PaginationMeta }> {
  return listConversationsForTenant(tenant.businessId, filter);
}

export async function getTenantConversationById(
  tenant: TenantContext,
  conversationId: string,
): Promise<Conversation> {
  const conversation = await findActiveConversationForTenant(tenant.businessId, conversationId);

  if (!conversation) {
    throw new HttpError(404, 'CONVERSATION_NOT_FOUND', 'Conversation not found.');
  }

  return conversation;
}

export async function updateTenantConversationStatus(
  tenant: TenantContext,
  conversationId: string,
  status: ConversationStatus,
): Promise<Conversation> {
  const updated = await updateConversationStatusForTenant(tenant.businessId, conversationId, status);

  if (!updated) {
    throw new HttpError(404, 'CONVERSATION_NOT_FOUND', 'Conversation not found.');
  }

  return updated;
}

export async function getTenantConversationMessages(
  tenant: TenantContext,
  conversationId: string,
  query: ListMessagesQuery,
): Promise<{ messages: ConversationMessage[]; pagination: PaginationMeta }> {
  const result = await listMessagesForConversation(tenant.businessId, conversationId, query);

  if (!result) {
    throw new HttpError(404, 'CONVERSATION_NOT_FOUND', 'Conversation not found.');
  }

  return result;
}

export async function postStaffConversationMessage(
  tenant: TenantContext,
  auth: AuthContext,
  conversationId: string,
  input: CreateMessageInput,
): Promise<{ message: ConversationMessage; created: boolean }> {
  return appendConversationMessage({
    businessId: tenant.businessId,
    conversationId,
    role: input.role,
    authorUserId: auth.user.id,
    content: input.content,
    metadata: input.metadata,
    idempotencyKey: input.idempotencyKey,
  });
}

export async function deleteTenantConversation(
  tenant: TenantContext,
  auth: AuthContext,
  conversationId: string,
): Promise<{ id: string; deletedAt: Date }> {
  const deleted = await softDeleteConversationForTenant(
    tenant.businessId,
    conversationId,
    auth.user.id,
  );

  if (!deleted) {
    throw new HttpError(404, 'CONVERSATION_NOT_FOUND', 'Conversation not found.');
  }

  return deleted;
}

export async function purgeTenantConversation(
  tenant: TenantContext,
  conversationId: string,
): Promise<void> {
  const purged = await purgeConversationForTenant(tenant.businessId, conversationId);

  if (!purged) {
    throw new HttpError(404, 'CONVERSATION_NOT_FOUND', 'Conversation not found.');
  }
}

