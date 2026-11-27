export const STATUSES = ['active', 'pending_human', 'human_active', 'closed'] as const;
export type ConversationStatus = typeof STATUSES[number];
export interface Conversation {
  id: string; businessId: string; assistantId: string; assistantVersionId: string;
  locationId: string | null; channel: 'playground' | 'visitor'; status: ConversationStatus;
  messageCount: number; createdAt: string; updatedAt: string;
}
export interface Message {
  id: string; businessId: string; conversationId: string; sequenceNumber: number;
  role: 'user' | 'assistant' | 'operator' | 'system'; content: string; createdAt: string;
  metadata: Record<string, string | number | boolean | null>;
}
export interface Pagination { limit: number; offset: number; total: number; hasMore: boolean }
export interface Turn {
  businessId: string; conversationId: string; assistantVersionId: string;
  userMessage: Message; assistantMessage: Message; idempotentReplay: boolean;
  ai: {
    mode: string; model: string; promptVersion: string; grounded: boolean; status: string; requestId: string;
    usage: { inputTokens: number; outputTokens: number; totalTokens: number; latencyMs: number }
  };
}
