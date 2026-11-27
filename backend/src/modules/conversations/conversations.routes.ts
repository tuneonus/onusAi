import { Router } from 'express';
import { requireTenantMembership } from '../../middlewares/tenant.js';
import {
  handleCreateConversation,
  handleCreateConversationTurn,
  handleDeleteConversation,
  handleGetConversation,
  handleListConversationMessages,
  handleListConversations,
  handlePostConversationMessage,
  handlePurgeConversation,
  handleUpdateConversationStatus,
} from './conversations.controller.js';

export const conversationsRouter = Router({ mergeParams: true });

conversationsRouter.get(
  '/',
  requireTenantMembership(['owner', 'operator']),
  handleListConversations,
);
conversationsRouter.post(
  '/',
  requireTenantMembership(['owner', 'operator']),
  handleCreateConversation,
);
conversationsRouter.get(
  '/:conversationId',
  requireTenantMembership(['owner', 'operator']),
  handleGetConversation,
);
conversationsRouter.patch(
  '/:conversationId',
  requireTenantMembership(['owner', 'operator']),
  handleUpdateConversationStatus,
);
conversationsRouter.delete(
  '/:conversationId',
  requireTenantMembership(['owner']),
  handleDeleteConversation,
);
conversationsRouter.post(
  '/:conversationId/purge',
  requireTenantMembership(['owner']),
  handlePurgeConversation,
);
conversationsRouter.get(
  '/:conversationId/messages',
  requireTenantMembership(['owner', 'operator']),
  handleListConversationMessages,
);
conversationsRouter.post(
  '/:conversationId/messages',
  requireTenantMembership(['owner', 'operator']),
  handlePostConversationMessage,
);
conversationsRouter.post(
  '/:conversationId/turns',
  requireTenantMembership(['owner', 'operator']),
  handleCreateConversationTurn,
);

