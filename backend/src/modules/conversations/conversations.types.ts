export const CONVERSATION_CHANNELS = ['playground', 'visitor'] as const;
export type ConversationChannel = (typeof CONVERSATION_CHANNELS)[number];

export const CONVERSATION_STATUSES = [
  'active',
  'pending_human',
  'human_active',
  'closed',
] as const;
export type ConversationStatus = (typeof CONVERSATION_STATUSES)[number];

export const MESSAGE_ROLES = ['user', 'assistant', 'operator', 'system'] as const;
export type MessageRole = (typeof MESSAGE_ROLES)[number];

export type StaffSubmittableMessageRole = 'user' | 'operator';

export type MessageMetadataValue = string | number | boolean | null;
export type MessageMetadata = Record<string, MessageMetadataValue>;

export interface Conversation {
  id: string;
  businessId: string;
  locationId: string | null;
  assistantId: string;
  assistantVersionId: string;
  channel: ConversationChannel;
  status: ConversationStatus;
  createdByUserId: string | null;
  messageCount: number;
  lastMessageAt: Date | null;
  retainUntil: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface ConversationMessage {
  id: string;
  businessId: string;
  conversationId: string;
  sequenceNumber: number;
  role: MessageRole;
  authorUserId: string | null;
  content: string;
  metadata: MessageMetadata;
  createdAt: Date;
}

export interface CreateConversationInput {
  assistantId: string;
  locationId: string | null;
  channel: 'playground';
  status: ConversationStatus;
  idempotencyKey: string | null;
}

export interface UpdateConversationStatusInput {
  status: ConversationStatus;
}

export interface CreateMessageInput {
  role: StaffSubmittableMessageRole;
  content: string;
  metadata: MessageMetadata;
  idempotencyKey: string | null;
}

export interface ListConversationsFilter {
  channel?: ConversationChannel;
  status?: ConversationStatus;
  assistantId?: string;
  locationId?: string;
  limit: number;
  offset: number;
}

export interface ListMessagesQuery {
  limit: number;
  offset: number;
  afterSequence?: number;
}

export interface PaginationMeta {
  limit: number;
  offset: number;
  total: number;
  hasMore: boolean;
}

