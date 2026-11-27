import {
  APPROVED_TOOL_IDS,
  ASSISTANT_TONES,
  KNOWLEDGE_LOCATION_SCOPES,
  KNOWLEDGE_SCOPES,
  MODEL_SETTINGS_LIMITS,
  type ApprovedToolId,
  type AssistantModelSettings,
  type AssistantTone,
  type KnowledgeLocationScope,
  type KnowledgeScope,
} from '../../modules/assistants/assistants.types.js';
import { validateUuid } from '../../modules/auth/auth.validation.js';
import {
  CONVERSATION_CHANNELS,
  MESSAGE_ROLES,
  type ConversationChannel,
  type MessageRole,
} from '../../modules/conversations/conversations.types.js';
import { HttpError } from '../../utils/http-error.js';

export const AI_CONTRACT_VERSION = '1.0' as const;
export const AI_ACTOR_TYPES = ['staff', 'visitor'] as const;
export type AiActorType = (typeof AI_ACTOR_TYPES)[number];

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{8,64}$/;
const MAX_IDEMPOTENCY_KEY_LENGTH = 128;
const MAX_MESSAGES_COUNT = 20;
const MAX_KNOWLEDGE_LOCATIONS = 50;

export interface AiDelegationClaims {
  businessId: string;
  locationId: string | null;
  assistantId: string;
  assistantVersionId: string;
  conversationId: string;
  channel: ConversationChannel;
  actorType: AiActorType;
  actorId: string;
  allowedTools: ApprovedToolId[];
  allowedKnowledgeScopes: KnowledgeScope[];
  knowledgeLocationScope: KnowledgeLocationScope;
  knowledgeLocationIds: string[];
}

export interface AiRequestAssistantConfig {
  displayName: string;
  systemInstructions: string;
  fallbackMessage: string;
  language: string;
  tone: AssistantTone;
  modelSettings: AssistantModelSettings;
  allowedTools: ApprovedToolId[];
  allowedKnowledgeScopes: KnowledgeScope[];
  knowledgeLocationScope: KnowledgeLocationScope;
  knowledgeLocationIds: string[];
}

export interface AiConversationMessageItem {
  role: MessageRole;
  content: string;
  sequenceNumber: number;
}

export interface AiRespondRequest {
  contractVersion: typeof AI_CONTRACT_VERSION;
  requestId: string;
  idempotencyKey: string | null;
  deadlineAtMs: number;
  scope: {
    businessId: string;
    locationId: string | null;
    assistantId: string;
    assistantVersionId: string;
    conversationId: string;
    channel: ConversationChannel;
    actorType: AiActorType;
    actorId: string;
  };
  assistant: AiRequestAssistantConfig;
  conversation: {
    messages: AiConversationMessageItem[];
    userMessage: string;
  };
}

export interface AiCitation {
  sourceId: string;
  chunkId: string;
  title: string;
}

export interface AiToolProposal {
  toolName: ApprovedToolId;
  argumentsJson: string;
}

export interface AiUsageMetadata {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  latencyMs: number;
}

export interface AiRespondResponse {
  contractVersion: typeof AI_CONTRACT_VERSION;
  requestId: string;
  mode: 'mock' | 'gemini';
  model: string;
  promptVersion: string;
  grounded: boolean;
  status: 'completed' | 'abstained';
  answer: string;
  citations: AiCitation[];
  toolProposals: AiToolProposal[];
  usage: AiUsageMetadata;
}

function asStrictRecord(value: unknown, expectedKeys: readonly string[], label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new HttpError(400, 'AI_CONTRACT_VALIDATION_ERROR', `${label} must be an object.`);
  }

  const allowed = new Set(expectedKeys);
  const record = value as Record<string, unknown>;

  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) {
      throw new HttpError(400, 'AI_CONTRACT_VALIDATION_ERROR', `${label} contains unsupported fields.`);
    }
  }

  return record;
}

function boundedString(value: unknown, label: string, min: number, max: number): string {
  if (typeof value !== 'string') {
    throw new HttpError(400, 'AI_CONTRACT_VALIDATION_ERROR', `${label} must be a string.`);
  }

  const trimmed = value.trim();
  if (trimmed.length < min || trimmed.length > max) {
    throw new HttpError(400, 'AI_CONTRACT_VALIDATION_ERROR', `${label} must be between ${min} and ${max} characters.`);
  }

  return trimmed;
}

function validatePositiveInt(value: unknown, label: string, min = 1, max = Number.MAX_SAFE_INTEGER): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    throw new HttpError(400, 'AI_CONTRACT_VALIDATION_ERROR', `${label} must be an integer between ${min} and ${max}.`);
  }
  return value;
}

function validateNonNegativeInt(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new Error(`Invalid ${label}.`);
  }
  return value;
}

function validateEnum<T extends string>(value: unknown, allowed: readonly T[], label: string): T {
  if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) {
    throw new HttpError(400, 'AI_CONTRACT_VALIDATION_ERROR', `Invalid ${label}.`);
  }
  return value as T;
}

function validatePolicyFields(
  allowedToolsValue: unknown,
  allowedKnowledgeScopesValue: unknown,
  knowledgeLocationScopeValue: unknown,
  knowledgeLocationIdsValue: unknown,
  channel: ConversationChannel,
): Pick<
  AiDelegationClaims,
  'allowedTools' | 'allowedKnowledgeScopes' | 'knowledgeLocationScope' | 'knowledgeLocationIds'
> {
  if (!Array.isArray(allowedToolsValue) || allowedToolsValue.length > 10) {
    throw new HttpError(400, 'AI_CONTRACT_VALIDATION_ERROR', 'allowedTools must be an array.');
  }

  const allowedTools: ApprovedToolId[] = [];
  for (const item of allowedToolsValue) {
    if (typeof item !== 'string' || !APPROVED_TOOL_IDS.has(item)) {
      throw new HttpError(400, 'AI_CONTRACT_VALIDATION_ERROR', 'allowedTools contains an unapproved tool.');
    }
    if (!allowedTools.includes(item as ApprovedToolId)) {
      allowedTools.push(item as ApprovedToolId);
    }
  }

  if (!Array.isArray(allowedKnowledgeScopesValue) || allowedKnowledgeScopesValue.length < 1 || allowedKnowledgeScopesValue.length > 2) {
    throw new HttpError(400, 'AI_CONTRACT_VALIDATION_ERROR', 'allowedKnowledgeScopes must be a non-empty array.');
  }

  const allowedKnowledgeScopes: KnowledgeScope[] = [];
  for (const item of allowedKnowledgeScopesValue) {
    const scope = validateEnum(item, KNOWLEDGE_SCOPES, 'knowledgeScope');
    if (channel === 'visitor' && scope === 'staff_only') {
      throw new HttpError(403, 'FORBIDDEN_KNOWLEDGE_SCOPE', 'Visitor channel cannot access staff-only knowledge.');
    }
    if (!allowedKnowledgeScopes.includes(scope)) {
      allowedKnowledgeScopes.push(scope);
    }
  }

  const knowledgeLocationScope = validateEnum(
    knowledgeLocationScopeValue,
    KNOWLEDGE_LOCATION_SCOPES,
    'knowledgeLocationScope',
  );

  if (!Array.isArray(knowledgeLocationIdsValue) || knowledgeLocationIdsValue.length > MAX_KNOWLEDGE_LOCATIONS) {
    throw new HttpError(400, 'AI_CONTRACT_VALIDATION_ERROR', 'knowledgeLocationIds must be an array.');
  }

  const knowledgeLocationIds: string[] = [];
  for (const item of knowledgeLocationIdsValue) {
    const id = validateUuid(item, 'knowledgeLocationId');
    if (!knowledgeLocationIds.includes(id)) {
      knowledgeLocationIds.push(id);
    }
  }

  return {
    allowedTools,
    allowedKnowledgeScopes,
    knowledgeLocationScope,
    knowledgeLocationIds,
  };
}

export function validateAiDelegationClaims(value: unknown): AiDelegationClaims {
  const record = asStrictRecord(
    value,
    [
      'businessId',
      'locationId',
      'assistantId',
      'assistantVersionId',
      'conversationId',
      'channel',
      'actorType',
      'actorId',
      'allowedTools',
      'allowedKnowledgeScopes',
      'knowledgeLocationScope',
      'knowledgeLocationIds',
    ],
    'delegation',
  );

  const channel = validateEnum(record.channel, CONVERSATION_CHANNELS, 'channel');
  const actorType = validateEnum(record.actorType, AI_ACTOR_TYPES, 'actorType');

  if (channel === 'visitor' && actorType !== 'visitor') {
    throw new HttpError(403, 'FORBIDDEN_DELEGATION_CONTEXT', 'Visitor channel requires visitor actorType.');
  }

  const policy = validatePolicyFields(
    record.allowedTools,
    record.allowedKnowledgeScopes,
    record.knowledgeLocationScope,
    record.knowledgeLocationIds,
    channel,
  );

  return {
    businessId: validateUuid(record.businessId, 'businessId'),
    locationId: record.locationId === null ? null : validateUuid(record.locationId, 'locationId'),
    assistantId: validateUuid(record.assistantId, 'assistantId'),
    assistantVersionId: validateUuid(record.assistantVersionId, 'assistantVersionId'),
    conversationId: validateUuid(record.conversationId, 'conversationId'),
    channel,
    actorType,
    actorId: validateUuid(record.actorId, 'actorId'),
    ...policy,
  };
}

export function validateAiRespondRequest(value: unknown): AiRespondRequest {
  const record = asStrictRecord(
    value,
    ['contractVersion', 'requestId', 'idempotencyKey', 'deadlineAtMs', 'scope', 'assistant', 'conversation'],
    'request',
  );

  if (record.contractVersion !== AI_CONTRACT_VERSION) {
    throw new HttpError(400, 'AI_CONTRACT_VALIDATION_ERROR', 'Unsupported contractVersion.');
  }

  if (typeof record.requestId !== 'string' || !REQUEST_ID_PATTERN.test(record.requestId.trim())) {
    throw new HttpError(400, 'AI_CONTRACT_VALIDATION_ERROR', 'Invalid requestId.');
  }
  const requestId = record.requestId.trim();

  let idempotencyKey: string | null = null;
  if (record.idempotencyKey !== null && record.idempotencyKey !== undefined) {
    idempotencyKey = boundedString(record.idempotencyKey, 'idempotencyKey', 1, MAX_IDEMPOTENCY_KEY_LENGTH);
  }

  const deadlineAtMs = validatePositiveInt(record.deadlineAtMs, 'deadlineAtMs', 1);

  const scopeRecord = asStrictRecord(
    record.scope,
    ['businessId', 'locationId', 'assistantId', 'assistantVersionId', 'conversationId', 'channel', 'actorType', 'actorId'],
    'scope',
  );
  const channel = validateEnum(scopeRecord.channel, CONVERSATION_CHANNELS, 'channel');
  const actorType = validateEnum(scopeRecord.actorType, AI_ACTOR_TYPES, 'actorType');

  if (channel === 'visitor' && actorType !== 'visitor') {
    throw new HttpError(403, 'FORBIDDEN_DELEGATION_CONTEXT', 'Visitor channel requires visitor actorType.');
  }

  const scope = {
    businessId: validateUuid(scopeRecord.businessId, 'businessId'),
    locationId: scopeRecord.locationId === null ? null : validateUuid(scopeRecord.locationId, 'locationId'),
    assistantId: validateUuid(scopeRecord.assistantId, 'assistantId'),
    assistantVersionId: validateUuid(scopeRecord.assistantVersionId, 'assistantVersionId'),
    conversationId: validateUuid(scopeRecord.conversationId, 'conversationId'),
    channel,
    actorType,
    actorId: validateUuid(scopeRecord.actorId, 'actorId'),
  };

  const assistantRecord = asStrictRecord(
    record.assistant,
    [
      'displayName',
      'systemInstructions',
      'fallbackMessage',
      'language',
      'tone',
      'modelSettings',
      'allowedTools',
      'allowedKnowledgeScopes',
      'knowledgeLocationScope',
      'knowledgeLocationIds',
    ],
    'assistant',
  );

  const modelSettingsRecord = asStrictRecord(
    assistantRecord.modelSettings,
    ['temperature', 'maxOutputTokens', 'maxContextMessages'],
    'modelSettings',
  );
  if (
    typeof modelSettingsRecord.temperature !== 'number' ||
    !Number.isFinite(modelSettingsRecord.temperature) ||
    modelSettingsRecord.temperature < MODEL_SETTINGS_LIMITS.temperatureMin ||
    modelSettingsRecord.temperature > MODEL_SETTINGS_LIMITS.temperatureMax
  ) {
    throw new HttpError(400, 'AI_CONTRACT_VALIDATION_ERROR', 'Invalid model temperature.');
  }

  const maxOutputTokens = validatePositiveInt(
    modelSettingsRecord.maxOutputTokens,
    'maxOutputTokens',
    MODEL_SETTINGS_LIMITS.maxOutputTokensMin,
    MODEL_SETTINGS_LIMITS.maxOutputTokensMax,
  );
  const maxContextMessages = validatePositiveInt(
    modelSettingsRecord.maxContextMessages,
    'maxContextMessages',
    MODEL_SETTINGS_LIMITS.maxContextMessagesMin,
    MODEL_SETTINGS_LIMITS.maxContextMessagesMax,
  );

  const policy = validatePolicyFields(
    assistantRecord.allowedTools,
    assistantRecord.allowedKnowledgeScopes,
    assistantRecord.knowledgeLocationScope,
    assistantRecord.knowledgeLocationIds,
    scope.channel,
  );

  const assistant: AiRequestAssistantConfig = {
    displayName: boundedString(assistantRecord.displayName, 'displayName', 1, 120),
    systemInstructions: boundedString(assistantRecord.systemInstructions, 'systemInstructions', 1, 8000),
    fallbackMessage: boundedString(assistantRecord.fallbackMessage, 'fallbackMessage', 1, 1000),
    language: boundedString(assistantRecord.language, 'language', 2, 16),
    tone: validateEnum(assistantRecord.tone, ASSISTANT_TONES, 'tone'),
    modelSettings: {
      temperature: modelSettingsRecord.temperature,
      maxOutputTokens,
      maxContextMessages,
    },
    ...policy,
  };

  const conversationRecord = asStrictRecord(record.conversation, ['messages', 'userMessage'], 'conversation');
  if (!Array.isArray(conversationRecord.messages) || conversationRecord.messages.length > MAX_MESSAGES_COUNT) {
    throw new HttpError(400, 'AI_CONTRACT_VALIDATION_ERROR', 'conversation.messages exceeds allowed bounds.');
  }
  if (conversationRecord.messages.length > assistant.modelSettings.maxContextMessages) {
    throw new HttpError(
      400,
      'AI_CONTRACT_VALIDATION_ERROR',
      'conversation.messages exceeds assistant maxContextMessages.',
    );
  }

  const messages: AiConversationMessageItem[] = conversationRecord.messages.map((item) => {
    const msg = asStrictRecord(item, ['role', 'content', 'sequenceNumber'], 'message');
    return {
      role: validateEnum(msg.role, MESSAGE_ROLES, 'message.role'),
      content: boundedString(msg.content, 'message.content', 1, 8000),
      sequenceNumber: validatePositiveInt(msg.sequenceNumber, 'message.sequenceNumber', 1),
    };
  });

  const userMessage = boundedString(conversationRecord.userMessage, 'userMessage', 1, 4000);

  return {
    contractVersion: AI_CONTRACT_VERSION,
    requestId,
    idempotencyKey,
    deadlineAtMs,
    scope,
    assistant,
    conversation: { messages, userMessage },
  };
}

export function buildDelegationClaims(request: AiRespondRequest): AiDelegationClaims {
  return {
    businessId: request.scope.businessId,
    locationId: request.scope.locationId,
    assistantId: request.scope.assistantId,
    assistantVersionId: request.scope.assistantVersionId,
    conversationId: request.scope.conversationId,
    channel: request.scope.channel,
    actorType: request.scope.actorType,
    actorId: request.scope.actorId,
    allowedTools: [...request.assistant.allowedTools],
    allowedKnowledgeScopes: [...request.assistant.allowedKnowledgeScopes],
    knowledgeLocationScope: request.assistant.knowledgeLocationScope,
    knowledgeLocationIds: [...request.assistant.knowledgeLocationIds],
  };
}

export function validateAiRespondResponse(value: unknown, expectedRequestId: string): AiRespondResponse {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('AI response must be an object.');
  }

  const record = value as Record<string, unknown>;
  const allowedKeys = new Set([
    'contractVersion',
    'requestId',
    'mode',
    'model',
    'promptVersion',
    'grounded',
    'status',
    'answer',
    'citations',
    'toolProposals',
    'usage',
  ]);

  for (const key of Object.keys(record)) {
    if (!allowedKeys.has(key)) {
      throw new Error('AI response contains unexpected fields.');
    }
  }

  if (record.contractVersion !== AI_CONTRACT_VERSION) {
    throw new Error('Unexpected AI response contractVersion.');
  }

  if (record.requestId !== expectedRequestId) {
    throw new Error('AI response requestId mismatch.');
  }

  if (record.mode !== 'mock' && record.mode !== 'gemini') {
    throw new Error('Unexpected AI response mode.');
  }

  if (typeof record.model !== 'string' || record.model.trim().length < 1 || record.model.length > 100) {
    throw new Error('Invalid AI response model.');
  }

  if (
    typeof record.promptVersion !== 'string' ||
    record.promptVersion.trim().length < 1 ||
    record.promptVersion.length > 32
  ) {
    throw new Error('Invalid AI response promptVersion.');
  }

  if (typeof record.grounded !== 'boolean') {
    throw new Error('AI response grounded must be a boolean.');
  }

  if (record.status !== 'completed' && record.status !== 'abstained') {
    throw new Error('Invalid AI response status.');
  }

  if (typeof record.answer !== 'string' || record.answer.trim().length < 1 || record.answer.length > 8000) {
    throw new Error('Invalid AI response answer.');
  }

  if (!Array.isArray(record.citations) || record.citations.length > 20) {
    throw new Error('Invalid AI response citations.');
  }

  const citations: AiCitation[] = record.citations.map((item) => {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      throw new Error('Invalid citation.');
    }
    const c = item as Record<string, unknown>;
    if (
      Object.keys(c).some((k) => k !== 'sourceId' && k !== 'chunkId' && k !== 'title') ||
      typeof c.sourceId !== 'string' || !c.sourceId ||
      typeof c.chunkId !== 'string' || !c.chunkId ||
      typeof c.title !== 'string' || !c.title
    ) {
      throw new Error('Invalid citation shape.');
    }
    return { sourceId: c.sourceId, chunkId: c.chunkId, title: c.title };
  });

  if (!Array.isArray(record.toolProposals) || record.toolProposals.length > 5) {
    throw new Error('Invalid AI response toolProposals.');
  }

  const toolProposals: AiToolProposal[] = record.toolProposals.map((item) => {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      throw new Error('Invalid toolProposal.');
    }
    const p = item as Record<string, unknown>;
    if (
      Object.keys(p).some((k) => k !== 'toolName' && k !== 'argumentsJson') ||
      typeof p.toolName !== 'string' || !APPROVED_TOOL_IDS.has(p.toolName) ||
      typeof p.argumentsJson !== 'string'
    ) {
      throw new Error('Invalid toolProposal shape.');
    }
    return { toolName: p.toolName as ApprovedToolId, argumentsJson: p.argumentsJson };
  });

  if (typeof record.usage !== 'object' || record.usage === null || Array.isArray(record.usage)) {
    throw new Error('Invalid AI response usage.');
  }
  const usageRecord = record.usage as Record<string, unknown>;
  if (Object.keys(usageRecord).some((k) => k !== 'inputTokens' && k !== 'outputTokens' && k !== 'totalTokens' && k !== 'latencyMs')) {
    throw new Error('Invalid AI usage keys.');
  }

  return {
    contractVersion: AI_CONTRACT_VERSION,
    requestId: expectedRequestId,
    mode: record.mode,
    model: record.model.trim(),
    promptVersion: record.promptVersion.trim(),
    grounded: record.grounded,
    status: record.status,
    answer: record.answer,
    citations,
    toolProposals,
    usage: {
      inputTokens: validateNonNegativeInt(usageRecord.inputTokens, 'inputTokens'),
      outputTokens: validateNonNegativeInt(usageRecord.outputTokens, 'outputTokens'),
      totalTokens: validateNonNegativeInt(usageRecord.totalTokens, 'totalTokens'),
      latencyMs: validateNonNegativeInt(usageRecord.latencyMs, 'latencyMs'),
    },
  };
}

