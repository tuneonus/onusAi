import type { Request, Response } from 'express';
import { HttpError } from '../../utils/http-error.js';
import { validateUuid } from '../auth/auth.validation.js';
import {
  createStaffConversation,
  deleteTenantConversation,
  executeStaffConversationTurn,
  getTenantConversationById,
  getTenantConversationMessages,
  getTenantConversations,
  postStaffConversationMessage,
  purgeTenantConversation,
  updateTenantConversationStatus,
} from './conversations.service.js';
import type { Conversation, ConversationMessage } from './conversations.types.js';
import {
  validateCreateConversationInput,
  validateCreateMessageInput,
  validateCreateTurnInput,
  validateListConversationsQuery,
  validateListMessagesQuery,
  validateUpdateConversationStatusInput,
} from './conversations.validation.js';

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

function serializeConversation(conversation: Conversation) {
  return {
    id: conversation.id,
    businessId: conversation.businessId,
    locationId: conversation.locationId,
    assistantId: conversation.assistantId,
    assistantVersionId: conversation.assistantVersionId,
    channel: conversation.channel,
    status: conversation.status,
    createdByUserId: conversation.createdByUserId,
    messageCount: conversation.messageCount,
    lastMessageAt: conversation.lastMessageAt ? conversation.lastMessageAt.toISOString() : null,
    retainUntil: conversation.retainUntil.toISOString(),
    createdAt: conversation.createdAt.toISOString(),
    updatedAt: conversation.updatedAt.toISOString(),
  };
}

function serializeMessage(message: ConversationMessage) {
  return {
    id: message.id,
    businessId: message.businessId,
    conversationId: message.conversationId,
    sequenceNumber: message.sequenceNumber,
    role: message.role,
    authorUserId: message.authorUserId,
    content: message.content,
    metadata: message.metadata,
    createdAt: message.createdAt.toISOString(),
  };
}

export async function handleListConversations(req: Request, res: Response): Promise<void> {
  res.set('Cache-Control', 'no-store');
  const tenant = requireVerifiedTenant(req);
  const filter = validateListConversationsQuery(req.query as Record<string, unknown>);
  const result = await getTenantConversations(tenant, filter);

  res.status(200).json({
    businessId: tenant.businessId,
    conversations: result.conversations.map(serializeConversation),
    pagination: result.pagination,
  });
}

export async function handleCreateConversation(req: Request, res: Response): Promise<void> {
  res.set('Cache-Control', 'no-store');
  const auth = requireVerifiedAuth(req);
  const tenant = requireVerifiedTenant(req);
  const input = validateCreateConversationInput(req.body, req.header('idempotency-key'));
  const result = await createStaffConversation(tenant, auth, input);

  res.status(result.created ? 201 : 200).json({
    businessId: tenant.businessId,
    conversation: serializeConversation(result.conversation),
    idempotentReplay: !result.created,
  });
}

export async function handleGetConversation(req: Request, res: Response): Promise<void> {
  res.set('Cache-Control', 'no-store');
  const tenant = requireVerifiedTenant(req);
  const conversationId = validateUuid(req.params.conversationId, 'conversationId');
  const conversation = await getTenantConversationById(tenant, conversationId);

  res.status(200).json({
    businessId: tenant.businessId,
    conversation: serializeConversation(conversation),
  });
}

export async function handleUpdateConversationStatus(req: Request, res: Response): Promise<void> {
  res.set('Cache-Control', 'no-store');
  const tenant = requireVerifiedTenant(req);
  const conversationId = validateUuid(req.params.conversationId, 'conversationId');
  const { status } = validateUpdateConversationStatusInput(req.body);
  const conversation = await updateTenantConversationStatus(tenant, conversationId, status);

  res.status(200).json({
    businessId: tenant.businessId,
    conversation: serializeConversation(conversation),
  });
}

export async function handleListConversationMessages(req: Request, res: Response): Promise<void> {
  res.set('Cache-Control', 'no-store');
  const tenant = requireVerifiedTenant(req);
  const conversationId = validateUuid(req.params.conversationId, 'conversationId');
  const query = validateListMessagesQuery(req.query as Record<string, unknown>);
  const result = await getTenantConversationMessages(tenant, conversationId, query);

  res.status(200).json({
    businessId: tenant.businessId,
    conversationId,
    messages: result.messages.map(serializeMessage),
    pagination: result.pagination,
  });
}

export async function handlePostConversationMessage(req: Request, res: Response): Promise<void> {
  res.set('Cache-Control', 'no-store');
  const auth = requireVerifiedAuth(req);
  const tenant = requireVerifiedTenant(req);
  const conversationId = validateUuid(req.params.conversationId, 'conversationId');
  const input = validateCreateMessageInput(req.body, req.header('idempotency-key'));
  const result = await postStaffConversationMessage(tenant, auth, conversationId, input);

  res.status(result.created ? 201 : 200).json({
    businessId: tenant.businessId,
    conversationId,
    message: serializeMessage(result.message),
    idempotentReplay: !result.created,
  });
}

export async function handleCreateConversationTurn(req: Request, res: Response): Promise<void> {
  res.set('Cache-Control', 'no-store');
  const auth = requireVerifiedAuth(req);
  const tenant = requireVerifiedTenant(req);
  const conversationId = validateUuid(req.params.conversationId, 'conversationId');
  const input = validateCreateTurnInput(req.body, req.header('idempotency-key'));
  const result = await executeStaffConversationTurn(
    tenant,
    auth,
    conversationId,
    input,
    req.requestId,
  );

  res.status(result.created ? 201 : 200).json({
    businessId: tenant.businessId,
    conversationId: result.conversationId,
    assistantVersionId: result.assistantVersionId,
    userMessage: serializeMessage(result.userMessage),
    assistantMessage: serializeMessage(result.assistantMessage),
    ai: result.ai,
    idempotentReplay: !result.created,
  });
}

export async function handleDeleteConversation(req: Request, res: Response): Promise<void> {
  res.set('Cache-Control', 'no-store');
  const auth = requireVerifiedAuth(req);
  const tenant = requireVerifiedTenant(req);
  const conversationId = validateUuid(req.params.conversationId, 'conversationId');
  const deleted = await deleteTenantConversation(tenant, auth, conversationId);

  res.status(200).json({
    businessId: tenant.businessId,
    deletedConversationId: deleted.id,
    deletedAt: deleted.deletedAt.toISOString(),
  });
}

export async function handlePurgeConversation(req: Request, res: Response): Promise<void> {
  res.set('Cache-Control', 'no-store');
  const tenant = requireVerifiedTenant(req);
  const conversationId = validateUuid(req.params.conversationId, 'conversationId');
  await purgeTenantConversation(tenant, conversationId);

  res.status(200).json({
    businessId: tenant.businessId,
    purgedConversationId: conversationId,
  });
}

