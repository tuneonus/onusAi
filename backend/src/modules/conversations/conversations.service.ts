import { requestAiResponse } from '../../integrations/ai/ai-client.js';
import type { AuthContext, TenantContext } from '../../types/express.js';
import { HttpError } from '../../utils/http-error.js';
import { findAssistantVersionForTenant } from '../assistants/assistants.repository.js';
import {
  appendConversationMessage,
  createPlaygroundConversation,
  findActiveConversationForTenant,
  findRecentTurnContextMessages,
  findTurnByIdempotencyKey,
  listConversationsForTenant,
  listMessagesForConversation,
  persistConversationTurn,
  purgeConversationForTenant,
  softDeleteConversationForTenant,
  updateConversationStatusForTenant,
} from './conversations.repository.js';
import type {
  Conversation,
  ConversationMessage,
  ConversationStatus,
  ConversationTurnResult,
  CreateConversationInput,
  CreateMessageInput,
  CreateTurnInput,
  ListConversationsFilter,
  ListMessagesQuery,
  MessageMetadata,
  PaginationMeta,
} from './conversations.types.js';

function aiSummaryFromMetadata(metadata: MessageMetadata): ConversationTurnResult['ai'] {
  const intField = (key: string): number => {
    const val = metadata[key];
    return typeof val === 'number' && Number.isInteger(val) && val >= 0 ? val : 0;
  };
  const strField = (key: string, fallback: string): string => {
    const val = metadata[key];
    return typeof val === 'string' && val ? val : fallback;
  };

  return {
    mode: strField('mode', 'mock'),
    model: strField('model', 'mock'),
    promptVersion: strField('promptVersion', 'respond-v1'),
    grounded: metadata.grounded === true,
    status: strField('aiStatus', 'completed'),
    requestId: strField('requestId', ''),
    usage: {
      inputTokens: intField('inputTokens'),
      outputTokens: intField('outputTokens'),
      totalTokens: intField('totalTokens'),
      latencyMs: intField('latencyMs'),
    },
  };
}

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

export async function executeStaffConversationTurn(
  tenant: TenantContext,
  auth: AuthContext,
  conversationId: string,
  input: CreateTurnInput,
  requestId?: string,
): Promise<ConversationTurnResult> {
  const conversation = await findActiveConversationForTenant(tenant.businessId, conversationId);

  if (!conversation) {
    throw new HttpError(404, 'CONVERSATION_NOT_FOUND', 'Conversation not found.');
  }

  if (conversation.channel !== 'playground') {
    throw new HttpError(
      403,
      'FORBIDDEN_CONVERSATION_CHANNEL',
      'Staff turn endpoint supports playground conversations only.',
    );
  }

  if (conversation.status !== 'active') {
    throw new HttpError(
      409,
      'CONVERSATION_NOT_ACTIVE',
      'AI replies are disabled unless the conversation status is active.',
    );
  }

  if (input.idempotencyKey !== null) {
    const existingTurn = await findTurnByIdempotencyKey(
      tenant.businessId,
      conversation.id,
      input.idempotencyKey,
      input.content,
    );

    if (existingTurn) {
      return {
        conversationId: conversation.id,
        assistantVersionId: conversation.assistantVersionId,
        userMessage: existingTurn.userMessage,
        assistantMessage: existingTurn.assistantMessage,
        ai: aiSummaryFromMetadata(existingTurn.assistantMessage.metadata),
        created: false,
      };
    }
  }

  const assistantVersion = await findAssistantVersionForTenant(
    tenant.businessId,
    conversation.assistantId,
    conversation.assistantVersionId,
  );

  if (!assistantVersion) {
    throw new HttpError(404, 'ASSISTANT_VERSION_NOT_FOUND', 'Bound assistant version not found.');
  }

  const contextMessages = await findRecentTurnContextMessages(
    tenant.businessId,
    conversation.id,
    assistantVersion.modelSettings.maxContextMessages,
  );

  const aiResponse = await requestAiResponse({
    ...(requestId ? { requestId } : {}),
    idempotencyKey: input.idempotencyKey,
    scope: {
      businessId: tenant.businessId,
      locationId: conversation.locationId,
      assistantId: conversation.assistantId,
      assistantVersionId: conversation.assistantVersionId,
      conversationId: conversation.id,
      channel: conversation.channel,
      actorType: 'staff',
      actorId: auth.user.id,
    },
    assistant: {
      displayName: assistantVersion.displayName,
      systemInstructions: assistantVersion.systemInstructions,
      fallbackMessage: assistantVersion.fallbackMessage,
      language: assistantVersion.language,
      tone: assistantVersion.tone,
      modelSettings: assistantVersion.modelSettings,
      allowedTools: assistantVersion.allowedTools,
      allowedKnowledgeScopes: assistantVersion.allowedKnowledgeScopes,
      knowledgeLocationScope: assistantVersion.knowledgeLocationScope,
      knowledgeLocationIds: assistantVersion.knowledgeLocationIds,
    },
    conversation: {
      messages: contextMessages.map((msg) => ({
        role: msg.role,
        content: msg.content,
        sequenceNumber: msg.sequenceNumber,
      })),
      userMessage: input.content,
    },
  });

  const assistantMetadata: MessageMetadata = {
    mode: aiResponse.mode,
    model: aiResponse.model,
    promptVersion: aiResponse.promptVersion,
    grounded: aiResponse.grounded,
    aiStatus: aiResponse.status,
    requestId: aiResponse.requestId,
    inputTokens: aiResponse.usage.inputTokens,
    outputTokens: aiResponse.usage.outputTokens,
    totalTokens: aiResponse.usage.totalTokens,
    latencyMs: aiResponse.usage.latencyMs,
    citationsJson: aiResponse.citations.length > 0 ? JSON.stringify(aiResponse.citations) : null,
  };

  const persisted = await persistConversationTurn({
    businessId: tenant.businessId,
    conversationId: conversation.id,
    authorUserId: auth.user.id,
    userContent: input.content,
    assistantContent: aiResponse.answer,
    assistantMetadata,
    idempotencyKey: input.idempotencyKey,
  });

  return {
    conversationId: conversation.id,
    assistantVersionId: conversation.assistantVersionId,
    userMessage: persisted.userMessage,
    assistantMessage: persisted.assistantMessage,
    ai: aiSummaryFromMetadata(persisted.assistantMessage.metadata),
    created: persisted.created,
  };
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
