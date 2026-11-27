import type { PoolClient } from 'pg';
import { env } from '../../config/env.js';
import { postgresPool } from '../../integrations/database/postgres.js';
import { HttpError } from '../../utils/http-error.js';
import type {
  Conversation,
  ConversationChannel,
  ConversationMessage,
  ConversationStatus,
  CreateConversationInput,
  ListConversationsFilter,
  ListMessagesQuery,
  MessageMetadata,
  MessageRole,
  PaginationMeta,
} from './conversations.types.js';

interface ConversationRow {
  id: string;
  business_id: string;
  location_id: string | null;
  assistant_id: string;
  assistant_version_id: string;
  channel: ConversationChannel;
  status: ConversationStatus;
  created_by_user_id: string | null;
  idempotency_key: string | null;
  message_count: number;
  last_message_at: Date | null;
  retain_until: Date;
  created_at: Date;
  updated_at: Date;
}

interface ConversationMessageRow {
  id: string;
  business_id: string;
  conversation_id: string;
  sequence_number: number;
  role: MessageRole;
  author_user_id: string | null;
  content: string;
  metadata: MessageMetadata;
  idempotency_key: string | null;
  created_at: Date;
}

const CONVERSATION_COLUMNS = `
  id, business_id, location_id, assistant_id, assistant_version_id,
  channel, status, created_by_user_id, idempotency_key,
  message_count, last_message_at, retain_until, created_at, updated_at
`;

const MESSAGE_COLUMNS = `
  id, business_id, conversation_id, sequence_number, role,
  author_user_id, content, metadata, idempotency_key, created_at
`;

function mapConversationRow(row: ConversationRow): Conversation {
  return {
    id: row.id,
    businessId: row.business_id,
    locationId: row.location_id,
    assistantId: row.assistant_id,
    assistantVersionId: row.assistant_version_id,
    channel: row.channel,
    status: row.status,
    createdByUserId: row.created_by_user_id,
    messageCount: row.message_count,
    lastMessageAt: row.last_message_at,
    retainUntil: row.retain_until,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapMessageRow(row: ConversationMessageRow): ConversationMessage {
  return {
    id: row.id,
    businessId: row.business_id,
    conversationId: row.conversation_id,
    sequenceNumber: row.sequence_number,
    role: row.role,
    authorUserId: row.author_user_id,
    content: row.content,
    metadata: row.metadata,
    createdAt: row.created_at,
  };
}

function isPgUniqueViolation(error: unknown, constraintName: string): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }

  const pgError = error as { code?: unknown; constraint?: unknown };
  return pgError.code === '23505' && pgError.constraint === constraintName;
}

async function runInTransaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
  let client: PoolClient;

  try {
    client = await postgresPool.connect();
  } catch {
    throw new HttpError(503, 'DATABASE_UNAVAILABLE', 'Database is unavailable.');
  }

  let failed = true;

  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    failed = false;
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // Discard broken client below.
    }

    throw error;
  } finally {
    client.release(failed);
  }
}

export async function createPlaygroundConversation(
  businessId: string,
  userId: string,
  input: CreateConversationInput,
): Promise<{ conversation: Conversation; created: boolean }> {
  try {
    return await runInTransaction(async (client) => {
      if (input.idempotencyKey !== null) {
        const existingResult = await client.query<ConversationRow>(
          `SELECT ${CONVERSATION_COLUMNS}
           FROM conversations
           WHERE business_id = $1 AND idempotency_key = $2 AND deleted_at IS NULL
           LIMIT 1`,
          [businessId, input.idempotencyKey],
        );

        const existing = existingResult.rows[0];

        if (existing) {
          if (
            existing.assistant_id !== input.assistantId ||
            (input.locationId !== null && existing.location_id !== input.locationId)
          ) {
            throw new HttpError(
              409,
              'IDEMPOTENCY_KEY_CONFLICT',
              'Idempotency key was already used for a different conversation payload.',
            );
          }

          return { conversation: mapConversationRow(existing), created: false };
        }
      }

      const businessResult = await client.query<{ retention_days: number | null }>(
        `SELECT retention_days FROM businesses WHERE id = $1 LIMIT 1`,
        [businessId],
      );

      if (!businessResult.rows[0]) {
        throw new HttpError(403, 'TENANT_ACCESS_DENIED', 'You do not have access to this business.');
      }

      const retentionDays = businessResult.rows[0].retention_days ?? env.conversationRetentionDays;

      const assistantResult = await client.query<{ id: string; location_id: string | null }>(
        `SELECT id, location_id
         FROM assistants
         WHERE business_id = $1 AND id = $2
         LIMIT 1`,
        [businessId, input.assistantId],
      );

      const assistant = assistantResult.rows[0];

      if (!assistant) {
        throw new HttpError(404, 'ASSISTANT_NOT_FOUND', 'Assistant not found.');
      }

      const publishedVersionResult = await client.query<{ id: string }>(
        `SELECT id
         FROM assistant_versions
         WHERE business_id = $1 AND assistant_id = $2 AND status = 'published'
         LIMIT 1`,
        [businessId, input.assistantId],
      );

      const publishedVersion = publishedVersionResult.rows[0];

      if (!publishedVersion) {
        throw new HttpError(
          409,
          'ASSISTANT_NOT_PUBLISHED',
          'Assistant must have a published version before starting a conversation.',
        );
      }

      let resolvedLocationId: string | null = assistant.location_id;

      if (assistant.location_id !== null) {
        if (input.locationId !== null && input.locationId !== assistant.location_id) {
          throw new HttpError(
            400,
            'VALIDATION_ERROR',
            'locationId does not match the location-scoped assistant.',
          );
        }
      } else {
        resolvedLocationId = input.locationId;
      }

      if (resolvedLocationId !== null) {
        const locationResult = await client.query<{ archived_at: Date | null }>(
          `SELECT archived_at
           FROM business_locations
           WHERE business_id = $1 AND id = $2
           LIMIT 1`,
          [businessId, resolvedLocationId],
        );

        const locationRow = locationResult.rows[0];

        if (!locationRow) {
          throw new HttpError(404, 'LOCATION_NOT_FOUND', 'Business location not found.');
        }

        if (locationRow.archived_at !== null) {
          throw new HttpError(
            409,
            'LOCATION_ARCHIVED',
            'Cannot create a conversation for an archived business location.',
          );
        }
      }

      const inserted = await client.query<ConversationRow>(
        `INSERT INTO conversations (
           business_id, location_id, assistant_id, assistant_version_id,
           channel, status, created_by_user_id, idempotency_key, retain_until
         )
         VALUES (
           $1, $2, $3, $4,
           $5, $6, $7, $8,
           CURRENT_TIMESTAMP + ($9 * interval '1 day')
         )
         RETURNING ${CONVERSATION_COLUMNS}`,
        [
          businessId,
          resolvedLocationId,
          input.assistantId,
          publishedVersion.id,
          input.channel,
          input.status,
          userId,
          input.idempotencyKey,
          retentionDays,
        ],
      );

      const row = inserted.rows[0];

      if (!row) {
        throw new Error('Failed to create conversation.');
      }

      return { conversation: mapConversationRow(row), created: true };
    });
  } catch (error) {
    if (isPgUniqueViolation(error, 'conversations_idempotency_unique')) {
      throw new HttpError(
        409,
        'IDEMPOTENCY_KEY_CONFLICT',
        'Concurrent request with the same idempotency key is already in progress or completed.',
      );
    }

    throw error;
  }
}

export async function listConversationsForTenant(
  businessId: string,
  filter: ListConversationsFilter,
): Promise<{ conversations: Conversation[]; pagination: PaginationMeta }> {
  const conditions = ['business_id = $1', 'deleted_at IS NULL'];
  const params: unknown[] = [businessId];

  if (filter.channel !== undefined) {
    params.push(filter.channel);
    conditions.push(`channel = $${params.length}`);
  }
  if (filter.status !== undefined) {
    params.push(filter.status);
    conditions.push(`status = $${params.length}`);
  }
  if (filter.assistantId !== undefined) {
    params.push(filter.assistantId);
    conditions.push(`assistant_id = $${params.length}`);
  }
  if (filter.locationId !== undefined) {
    params.push(filter.locationId);
    conditions.push(`location_id = $${params.length}`);
  }

  const whereClause = conditions.join(' AND ');

  const countResult = await postgresPool.query<{ total: number }>(
    `SELECT count(*)::integer AS total
     FROM conversations
     WHERE ${whereClause}`,
    params,
  );
  const total = countResult.rows[0]?.total ?? 0;

  const listParams = [...params, filter.limit, filter.offset];
  const rowsResult = await postgresPool.query<ConversationRow>(
    `SELECT ${CONVERSATION_COLUMNS}
     FROM conversations
     WHERE ${whereClause}
     ORDER BY COALESCE(last_message_at, created_at) DESC, id DESC
     LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
    listParams,
  );

  const conversations = rowsResult.rows.map(mapConversationRow);

  return {
    conversations,
    pagination: {
      limit: filter.limit,
      offset: filter.offset,
      total,
      hasMore: filter.offset + conversations.length < total,
    },
  };
}

export async function findActiveConversationForTenant(
  businessId: string,
  conversationId: string,
): Promise<Conversation | null> {
  const result = await postgresPool.query<ConversationRow>(
    `SELECT ${CONVERSATION_COLUMNS}
     FROM conversations
     WHERE business_id = $1 AND id = $2 AND deleted_at IS NULL
     LIMIT 1`,
    [businessId, conversationId],
  );

  const row = result.rows[0];
  return row ? mapConversationRow(row) : null;
}

export async function updateConversationStatusForTenant(
  businessId: string,
  conversationId: string,
  status: ConversationStatus,
): Promise<Conversation | null> {
  const result = await postgresPool.query<ConversationRow>(
    `UPDATE conversations
     SET status = $3
     WHERE business_id = $1 AND id = $2 AND deleted_at IS NULL
     RETURNING ${CONVERSATION_COLUMNS}`,
    [businessId, conversationId, status],
  );

  const row = result.rows[0];
  return row ? mapConversationRow(row) : null;
}

export async function appendConversationMessage(params: {
  businessId: string;
  conversationId: string;
  role: MessageRole;
  authorUserId: string | null;
  content: string;
  metadata: MessageMetadata;
  idempotencyKey: string | null;
}): Promise<{ message: ConversationMessage; created: boolean }> {
  try {
    return await runInTransaction(async (client) => {
      const convLock = await client.query<{ id: string; message_count: number }>(
        `SELECT id, message_count
         FROM conversations
         WHERE business_id = $1 AND id = $2 AND deleted_at IS NULL
         FOR UPDATE`,
        [params.businessId, params.conversationId],
      );

      if (!convLock.rows[0]) {
        throw new HttpError(404, 'CONVERSATION_NOT_FOUND', 'Conversation not found.');
      }

      if (params.idempotencyKey !== null) {
        const existingResult = await client.query<ConversationMessageRow>(
          `SELECT ${MESSAGE_COLUMNS}
           FROM conversation_messages
           WHERE business_id = $1 AND conversation_id = $2 AND idempotency_key = $3
           LIMIT 1`,
          [params.businessId, params.conversationId, params.idempotencyKey],
        );

        const existing = existingResult.rows[0];

        if (existing) {
          if (existing.role !== params.role || existing.content !== params.content) {
            throw new HttpError(
              409,
              'IDEMPOTENCY_KEY_CONFLICT',
              'Idempotency key was already used with a different message payload.',
            );
          }

          return { message: mapMessageRow(existing), created: false };
        }
      }

      const maxSeqResult = await client.query<{ next_seq: number }>(
        `SELECT COALESCE(MAX(sequence_number), 0) + 1 AS next_seq
         FROM conversation_messages
         WHERE business_id = $1 AND conversation_id = $2`,
        [params.businessId, params.conversationId],
      );
      const nextSequence = maxSeqResult.rows[0]?.next_seq ?? 1;

      const inserted = await client.query<ConversationMessageRow>(
        `INSERT INTO conversation_messages (
           business_id, conversation_id, sequence_number, role,
           author_user_id, content, metadata, idempotency_key
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)
         RETURNING ${MESSAGE_COLUMNS}`,
        [
          params.businessId,
          params.conversationId,
          nextSequence,
          params.role,
          params.authorUserId,
          params.content,
          JSON.stringify(params.metadata),
          params.idempotencyKey,
        ],
      );

      const messageRow = inserted.rows[0];

      if (!messageRow) {
        throw new Error('Failed to insert conversation message.');
      }

      await client.query(
        `UPDATE conversations
         SET
           message_count = message_count + 1,
           last_message_at = $3
         WHERE business_id = $1 AND id = $2`,
        [params.businessId, params.conversationId, messageRow.created_at],
      );

      return { message: mapMessageRow(messageRow), created: true };
    });
  } catch (error) {
    if (isPgUniqueViolation(error, 'conversation_messages_idempotency_unique')) {
      throw new HttpError(
        409,
        'IDEMPOTENCY_KEY_CONFLICT',
        'Concurrent request with the same idempotency key is already in progress or completed.',
      );
    }

    throw error;
  }
}

export async function listMessagesForConversation(
  businessId: string,
  conversationId: string,
  query: ListMessagesQuery,
): Promise<{ messages: ConversationMessage[]; pagination: PaginationMeta } | null> {
  const convResult = await postgresPool.query<{ id: string }>(
    `SELECT id
     FROM conversations
     WHERE business_id = $1 AND id = $2 AND deleted_at IS NULL
     LIMIT 1`,
    [businessId, conversationId],
  );

  if (!convResult.rows[0]) {
    return null;
  }

  const conditions = ['business_id = $1', 'conversation_id = $2'];
  const params: unknown[] = [businessId, conversationId];

  if (query.afterSequence !== undefined) {
    params.push(query.afterSequence);
    conditions.push(`sequence_number > $${params.length}`);
  }

  const whereClause = conditions.join(' AND ');

  const countResult = await postgresPool.query<{ total: number }>(
    `SELECT count(*)::integer AS total
     FROM conversation_messages
     WHERE ${whereClause}`,
    params,
  );
  const total = countResult.rows[0]?.total ?? 0;

  const listParams = [...params, query.limit, query.offset];
  const rowsResult = await postgresPool.query<ConversationMessageRow>(
    `SELECT ${MESSAGE_COLUMNS}
     FROM conversation_messages
     WHERE ${whereClause}
     ORDER BY sequence_number ASC
     LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
    listParams,
  );

  const messages = rowsResult.rows.map(mapMessageRow);

  return {
    messages,
    pagination: {
      limit: query.limit,
      offset: query.offset,
      total,
      hasMore: query.offset + messages.length < total,
    },
  };
}

export async function softDeleteConversationForTenant(
  businessId: string,
  conversationId: string,
  deletedByUserId: string,
): Promise<{ id: string; deletedAt: Date } | null> {
  const result = await postgresPool.query<{ id: string; deleted_at: Date }>(
    `UPDATE conversations
     SET
       deleted_at = CURRENT_TIMESTAMP,
       deleted_by_user_id = $3
     WHERE business_id = $1 AND id = $2 AND deleted_at IS NULL
     RETURNING id, deleted_at`,
    [businessId, conversationId, deletedByUserId],
  );

  const row = result.rows[0];
  return row ? { id: row.id, deletedAt: row.deleted_at } : null;
}

export async function purgeConversationForTenant(
  businessId: string,
  conversationId: string,
): Promise<boolean> {
  const result = await postgresPool.query<{ id: string }>(
    `DELETE FROM conversations
     WHERE business_id = $1 AND id = $2
     RETURNING id`,
    [businessId, conversationId],
  );

  return Boolean(result.rows[0]);
}

