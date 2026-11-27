import { HttpError } from '../../utils/http-error.js';
import { validateUuid } from '../auth/auth.validation.js';
import {
  CONVERSATION_CHANNELS,
  CONVERSATION_STATUSES,
  MESSAGE_ROLES,
  type ConversationChannel,
  type ConversationStatus,
  type CreateConversationInput,
  type CreateMessageInput,
  type CreateTurnInput,
  type ListConversationsFilter,
  type ListMessagesQuery,
  type MessageMetadata,
  type MessageMetadataValue,
  type StaffSubmittableMessageRole,
  type UpdateConversationStatusInput,
} from './conversations.types.js';

const CREATE_CONVERSATION_FIELDS = new Set([
  'assistantId',
  'locationId',
  'channel',
  'status',
  'idempotencyKey',
]);

const UPDATE_CONVERSATION_FIELDS = new Set(['status']);

const CREATE_MESSAGE_FIELDS = new Set(['role', 'content', 'metadata', 'idempotencyKey']);
const CREATE_TURN_FIELDS = new Set(['content', 'idempotencyKey']);
const MAX_TURN_CONTENT_LENGTH = 4000;

const STAFF_SUBMITTABLE_ROLES = new Set<string>(['user', 'operator']);
const MAX_METADATA_KEYS = 16;
const MAX_METADATA_BYTES = 4096;
const MAX_CONTENT_LENGTH = 10_000;
const MAX_IDEMPOTENCY_KEY_LENGTH = 128;

function assertPlainObject(value: unknown, message: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new HttpError(400, 'VALIDATION_ERROR', message);
  }

  return value as Record<string, unknown>;
}

function assertAllowedKeys(
  record: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  message: string,
): void {
  if (Object.keys(record).some((key) => !allowed.has(key))) {
    throw new HttpError(400, 'VALIDATION_ERROR', message);
  }
}

function resolveIdempotencyKey(
  bodyValue: unknown,
  headerValue: string | undefined,
): string | null {
  let bodyKey: string | null = null;
  let headerKey: string | null = null;

  if (bodyValue !== undefined && bodyValue !== null) {
    if (typeof bodyValue !== 'string') {
      throw new HttpError(400, 'VALIDATION_ERROR', 'idempotencyKey must be a string.');
    }

    const trimmed = bodyValue.trim();

    if (trimmed.length < 1 || trimmed.length > MAX_IDEMPOTENCY_KEY_LENGTH) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        `idempotencyKey must be between 1 and ${MAX_IDEMPOTENCY_KEY_LENGTH} characters.`,
      );
    }

    bodyKey = trimmed;
  }

  if (headerValue !== undefined) {
    const trimmed = headerValue.trim();

    if (trimmed.length < 1 || trimmed.length > MAX_IDEMPOTENCY_KEY_LENGTH) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        `Idempotency-Key header must be between 1 and ${MAX_IDEMPOTENCY_KEY_LENGTH} characters.`,
      );
    }

    headerKey = trimmed;
  }

  if (bodyKey !== null && headerKey !== null && bodyKey !== headerKey) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'Idempotency-Key header and body idempotencyKey must match when both are provided.',
    );
  }

  return headerKey ?? bodyKey;
}

function validateConversationStatus(value: unknown): ConversationStatus {
  if (typeof value !== 'string' || !CONVERSATION_STATUSES.includes(value as ConversationStatus)) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      `status must be one of: ${CONVERSATION_STATUSES.join(', ')}.`,
    );
  }

  return value as ConversationStatus;
}

function validateMessageMetadata(value: unknown): MessageMetadata {
  if (value === undefined) {
    return {};
  }

  const record = assertPlainObject(value, 'metadata must be a JSON object.');
  const entries = Object.entries(record);

  if (entries.length > MAX_METADATA_KEYS) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      `metadata cannot contain more than ${MAX_METADATA_KEYS} keys.`,
    );
  }

  const normalized: MessageMetadata = {};

  for (const [key, entryValue] of entries) {
    if (key.trim().length === 0 || key.length > 64) {
      throw new HttpError(400, 'VALIDATION_ERROR', 'metadata keys must be 1 to 64 characters.');
    }

    if (
      entryValue !== null &&
      typeof entryValue !== 'string' &&
      typeof entryValue !== 'boolean' &&
      (typeof entryValue !== 'number' || !Number.isFinite(entryValue))
    ) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        'metadata values must be finite numbers, booleans, strings, or null.',
      );
    }

    normalized[key] = entryValue as MessageMetadataValue;
  }

  if (Buffer.byteLength(JSON.stringify(normalized), 'utf8') > MAX_METADATA_BYTES) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      `metadata exceeds the ${MAX_METADATA_BYTES}-byte size limit.`,
    );
  }

  return normalized;
}

function parseNonNegativeIntQuery(
  raw: unknown,
  fieldName: string,
  defaultValue: number,
  min: number,
  max: number,
): number {
  if (raw === undefined) {
    return defaultValue;
  }

  if (typeof raw !== 'string' || !/^\d+$/.test(raw)) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      `${fieldName} must be an integer between ${min} and ${max}.`,
    );
  }

  const parsed = Number(raw);

  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      `${fieldName} must be an integer between ${min} and ${max}.`,
    );
  }

  return parsed;
}

export function validateCreateConversationInput(
  body: unknown,
  idempotencyHeader: string | undefined,
): CreateConversationInput {
  const record = assertPlainObject(body, 'Request body must be a JSON object.');
  assertAllowedKeys(record, CREATE_CONVERSATION_FIELDS, 'Request body contains unsupported fields.');

  const assistantId = validateUuid(record.assistantId, 'assistantId');
  const locationId =
    record.locationId === undefined || record.locationId === null
      ? null
      : validateUuid(record.locationId, 'locationId');

  if (record.channel !== undefined) {
    if (record.channel === 'visitor') {
      throw new HttpError(
        403,
        'FORBIDDEN_CONVERSATION_CHANNEL',
        'Staff endpoints may only create playground conversations.',
      );
    }

    if (record.channel !== 'playground') {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        `channel must be one of: ${CONVERSATION_CHANNELS.join(', ')}.`,
      );
    }
  }

  const status =
    record.status === undefined ? 'active' : validateConversationStatus(record.status);

  return {
    assistantId,
    locationId,
    channel: 'playground',
    status,
    idempotencyKey: resolveIdempotencyKey(record.idempotencyKey, idempotencyHeader),
  };
}

export function validateUpdateConversationStatusInput(
  body: unknown,
): UpdateConversationStatusInput {
  const record = assertPlainObject(body, 'Request body must be a JSON object.');
  assertAllowedKeys(record, UPDATE_CONVERSATION_FIELDS, 'Request body contains unsupported fields.');

  if (!('status' in record)) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'status is required.');
  }

  return {
    status: validateConversationStatus(record.status),
  };
}

export function validateCreateMessageInput(
  body: unknown,
  idempotencyHeader: string | undefined,
): CreateMessageInput {
  const record = assertPlainObject(body, 'Request body must be a JSON object.');
  assertAllowedKeys(record, CREATE_MESSAGE_FIELDS, 'Request body contains unsupported fields.');

  if (typeof record.role !== 'string' || !MESSAGE_ROLES.includes(record.role as never)) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'role must be user or operator.');
  }

  if (!STAFF_SUBMITTABLE_ROLES.has(record.role)) {
    throw new HttpError(
      403,
      'FORBIDDEN_MESSAGE_ROLE',
      'Clients cannot impersonate assistant or system message roles.',
    );
  }

  if (typeof record.content !== 'string') {
    throw new HttpError(400, 'VALIDATION_ERROR', 'content must be a string.');
  }

  const content = record.content.trim();

  if (content.length < 1 || content.length > MAX_CONTENT_LENGTH) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      `content must be between 1 and ${MAX_CONTENT_LENGTH} characters.`,
    );
  }

  return {
    role: record.role as StaffSubmittableMessageRole,
    content,
    metadata: validateMessageMetadata(record.metadata),
    idempotencyKey: resolveIdempotencyKey(record.idempotencyKey, idempotencyHeader),
  };
}

export function validateCreateTurnInput(
  body: unknown,
  idempotencyHeader: string | undefined,
): CreateTurnInput {
  const record = assertPlainObject(body, 'Request body must be a JSON object.');

  if ('role' in record) {
    throw new HttpError(
      403,
      'FORBIDDEN_MESSAGE_ROLE',
      'Clients cannot specify message roles or create assistant messages directly.',
    );
  }

  assertAllowedKeys(record, CREATE_TURN_FIELDS, 'Request body contains unsupported fields.');

  if (typeof record.content !== 'string') {
    throw new HttpError(400, 'VALIDATION_ERROR', 'content must be a string.');
  }

  const content = record.content.trim();

  if (content.length < 1 || content.length > MAX_TURN_CONTENT_LENGTH) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      `content must be between 1 and ${MAX_TURN_CONTENT_LENGTH} characters.`,
    );
  }

  return {
    content,
    idempotencyKey: resolveIdempotencyKey(record.idempotencyKey, idempotencyHeader),
  };
}

export function validateListConversationsQuery(query: Record<string, unknown>): ListConversationsFilter {
  const filter: ListConversationsFilter = {
    limit: parseNonNegativeIntQuery(query.limit, 'limit', 20, 1, 100),
    offset: parseNonNegativeIntQuery(query.offset, 'offset', 0, 0, 100_000),
  };

  if (query.channel !== undefined) {
    if (
      typeof query.channel !== 'string' ||
      !CONVERSATION_CHANNELS.includes(query.channel as ConversationChannel)
    ) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        `channel must be one of: ${CONVERSATION_CHANNELS.join(', ')}.`,
      );
    }

    filter.channel = query.channel as ConversationChannel;
  }

  if (query.status !== undefined) {
    filter.status = validateConversationStatus(query.status);
  }

  if (query.assistantId !== undefined) {
    filter.assistantId = validateUuid(query.assistantId, 'assistantId');
  }

  if (query.locationId !== undefined) {
    filter.locationId = validateUuid(query.locationId, 'locationId');
  }

  return filter;
}

export function validateListMessagesQuery(query: Record<string, unknown>): ListMessagesQuery {
  const parsed: ListMessagesQuery = {
    limit: parseNonNegativeIntQuery(query.limit, 'limit', 50, 1, 100),
    offset: parseNonNegativeIntQuery(query.offset, 'offset', 0, 0, 100_000),
  };

  if (query.afterSequence !== undefined) {
    parsed.afterSequence = parseNonNegativeIntQuery(
      query.afterSequence,
      'afterSequence',
      0,
      0,
      2_000_000_000,
    );
  }

  return parsed;
}

