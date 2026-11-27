import type { PoolClient } from 'pg';
import { postgresPool } from '../../integrations/database/postgres.js';
import { HttpError } from '../../utils/http-error.js';
import type {
  ApprovedToolId,
  Assistant,
  AssistantModelSettings,
  AssistantTone,
  AssistantVersion,
  AssistantVersionStatus,
  AssistantWithVersions,
  CreateAssistantInput,
  DraftVersionOverrides,
  KnowledgeLocationScope,
  KnowledgeScope,
} from './assistants.types.js';
import { mergeVersionConfig } from './assistants.validation.js';

interface AssistantRow {
  id: string;
  business_id: string;
  location_id: string | null;
  created_at: Date;
  updated_at: Date;
}

interface AssistantVersionRow {
  id: string;
  assistant_id: string;
  business_id: string;
  version_number: number;
  status: AssistantVersionStatus;
  display_name: string;
  description: string | null;
  welcome_message: string;
  system_instructions: string;
  language: string;
  tone: AssistantTone;
  fallback_message: string;
  model_settings: AssistantModelSettings;
  allowed_tools: ApprovedToolId[];
  allowed_knowledge_scopes: KnowledgeScope[];
  knowledge_location_scope: KnowledgeLocationScope;
  knowledge_location_ids: string[] | null;
  created_by_user_id: string | null;
  published_by_user_id: string | null;
  published_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

const VERSION_SELECT_WITH_LOCATIONS = `
  SELECT
    av.id,
    av.assistant_id,
    av.business_id,
    av.version_number,
    av.status,
    av.display_name,
    av.description,
    av.welcome_message,
    av.system_instructions,
    av.language,
    av.tone,
    av.fallback_message,
    av.model_settings,
    av.allowed_tools,
    av.allowed_knowledge_scopes,
    av.knowledge_location_scope,
    COALESCE(
      (
        SELECT array_agg(kl.location_id ORDER BY kl.location_id)
        FROM assistant_version_knowledge_locations kl
        WHERE kl.business_id = av.business_id AND kl.assistant_version_id = av.id
      ),
      '{}'::uuid[]
    ) AS knowledge_location_ids,
    av.created_by_user_id,
    av.published_by_user_id,
    av.published_at,
    av.created_at,
    av.updated_at
  FROM assistant_versions av
`;

function mapAssistantRow(row: AssistantRow): Assistant {
  return {
    id: row.id,
    businessId: row.business_id,
    locationId: row.location_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapVersionRow(row: AssistantVersionRow): AssistantVersion {
  return {
    id: row.id,
    assistantId: row.assistant_id,
    businessId: row.business_id,
    versionNumber: row.version_number,
    status: row.status,
    displayName: row.display_name,
    description: row.description,
    welcomeMessage: row.welcome_message,
    systemInstructions: row.system_instructions,
    language: row.language,
    tone: row.tone,
    fallbackMessage: row.fallback_message,
    modelSettings: row.model_settings,
    allowedTools: row.allowed_tools,
    allowedKnowledgeScopes: row.allowed_knowledge_scopes,
    knowledgeLocationScope: row.knowledge_location_scope,
    knowledgeLocationIds: row.knowledge_location_ids ?? [],
    createdByUserId: row.created_by_user_id,
    publishedByUserId: row.published_by_user_id,
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function isPgUniqueViolation(error: unknown, constraints: readonly string[]): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }

  const pgError = error as { code?: unknown; constraint?: unknown };
  return (
    pgError.code === '23505' &&
    typeof pgError.constraint === 'string' &&
    constraints.includes(pgError.constraint)
  );
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

async function assertLocationActiveForBusiness(
  client: PoolClient,
  businessId: string,
  locationId: string,
): Promise<void> {
  const result = await client.query<{ archived_at: Date | null }>(
    `SELECT archived_at
     FROM business_locations
     WHERE business_id = $1 AND id = $2
     LIMIT 1`,
    [businessId, locationId],
  );

  const row = result.rows[0];

  if (!row) {
    throw new HttpError(404, 'LOCATION_NOT_FOUND', 'Business location not found.');
  }

  if (row.archived_at !== null) {
    throw new HttpError(409, 'LOCATION_ARCHIVED', 'Cannot target an archived business location.');
  }
}

async function assertKnowledgeLocationsActiveForBusiness(
  client: PoolClient,
  businessId: string,
  locationIds: readonly string[],
): Promise<void> {
  if (locationIds.length === 0) {
    return;
  }

  const result = await client.query<{ id: string }>(
    `SELECT id
     FROM business_locations
     WHERE business_id = $1
       AND id = ANY($2::uuid[])
       AND archived_at IS NULL`,
    [businessId, locationIds],
  );

  if (result.rows.length !== locationIds.length) {
    throw new HttpError(
      400,
      'INVALID_LOCATION_REFERENCE',
      'All knowledgeLocationIds must reference active locations belonging to this business.',
    );
  }
}

async function replaceKnowledgeLocations(
  client: PoolClient,
  businessId: string,
  versionId: string,
  locationIds: readonly string[],
): Promise<void> {
  await client.query(
    `DELETE FROM assistant_version_knowledge_locations
     WHERE business_id = $1 AND assistant_version_id = $2`,
    [businessId, versionId],
  );

  if (locationIds.length === 0) {
    return;
  }

  await client.query(
    `INSERT INTO assistant_version_knowledge_locations (business_id, assistant_version_id, location_id)
     SELECT $1, $2, unnest($3::uuid[])`,
    [businessId, versionId, locationIds],
  );
}

async function loadVersionById(
  queryable: Pick<PoolClient, 'query'>,
  businessId: string,
  assistantId: string,
  versionId: string,
): Promise<AssistantVersion | null> {
  const result = await queryable.query<AssistantVersionRow>(
    `${VERSION_SELECT_WITH_LOCATIONS}
     WHERE av.business_id = $1 AND av.assistant_id = $2 AND av.id = $3
     LIMIT 1`,
    [businessId, assistantId, versionId],
  );

  const row = result.rows[0];
  return row ? mapVersionRow(row) : null;
}

export async function createAssistantWithDraft(
  businessId: string,
  userId: string,
  input: CreateAssistantInput,
): Promise<{ assistant: Assistant; version: AssistantVersion }> {
  try {
    return await runInTransaction(async (client) => {
      if (input.locationId !== null) {
        await assertLocationActiveForBusiness(client, businessId, input.locationId);
      }

      await assertKnowledgeLocationsActiveForBusiness(
        client,
        businessId,
        input.knowledgeLocationIds,
      );

      const assistantResult = await client.query<AssistantRow>(
        `INSERT INTO assistants (business_id, location_id)
         VALUES ($1, $2)
         RETURNING id, business_id, location_id, created_at, updated_at`,
        [businessId, input.locationId],
      );

      const assistantRow = assistantResult.rows[0];

      if (!assistantRow) {
        throw new Error('Failed to create assistant.');
      }

      const versionResult = await client.query<{ id: string }>(
        `INSERT INTO assistant_versions (
           assistant_id, business_id, version_number, status,
           display_name, description, welcome_message, system_instructions,
           language, tone, fallback_message, model_settings,
           allowed_tools, allowed_knowledge_scopes, knowledge_location_scope,
           created_by_user_id
         )
         VALUES (
           $1, $2, 1, 'draft',
           $3, $4, $5, $6,
           $7, $8, $9, $10::jsonb,
           $11::text[], $12::text[], $13,
           $14
         )
         RETURNING id`,
        [
          assistantRow.id,
          businessId,
          input.displayName,
          input.description,
          input.welcomeMessage,
          input.systemInstructions,
          input.language,
          input.tone,
          input.fallbackMessage,
          JSON.stringify(input.modelSettings),
          input.allowedTools,
          input.allowedKnowledgeScopes,
          input.knowledgeLocationScope,
          userId,
        ],
      );

      const versionId = versionResult.rows[0]?.id;

      if (!versionId) {
        throw new Error('Failed to create initial assistant version.');
      }

      await replaceKnowledgeLocations(client, businessId, versionId, input.knowledgeLocationIds);

      const version = await loadVersionById(client, businessId, assistantRow.id, versionId);

      if (!version) {
        throw new Error('Failed to reload created assistant version.');
      }

      return {
        assistant: mapAssistantRow(assistantRow),
        version,
      };
    });
  } catch (error) {
    if (
      isPgUniqueViolation(error, [
        'assistants_business_default_unique',
        'assistants_business_location_unique',
      ])
    ) {
      throw new HttpError(
        409,
        'ASSISTANT_ALREADY_EXISTS',
        'An assistant already exists for this scope.',
      );
    }

    throw error;
  }
}

export async function listAssistantsForTenant(
  businessId: string,
): Promise<AssistantWithVersions[]> {
  const assistantResult = await postgresPool.query<AssistantRow>(
    `SELECT id, business_id, location_id, created_at, updated_at
     FROM assistants
     WHERE business_id = $1
     ORDER BY location_id NULLS FIRST, created_at ASC, id ASC`,
    [businessId],
  );

  if (assistantResult.rows.length === 0) {
    return [];
  }

  const versionResult = await postgresPool.query<AssistantVersionRow>(
    `${VERSION_SELECT_WITH_LOCATIONS}
     WHERE av.business_id = $1 AND av.status IN ('draft', 'published')`,
    [businessId],
  );

  const byAssistant = new Map<
    string,
    { publishedVersion: AssistantVersion | null; draftVersion: AssistantVersion | null }
  >();

  for (const row of versionResult.rows) {
    const version = mapVersionRow(row);
    const entry = byAssistant.get(version.assistantId) ?? {
      publishedVersion: null,
      draftVersion: null,
    };

    if (version.status === 'published') {
      entry.publishedVersion = version;
    } else if (version.status === 'draft') {
      entry.draftVersion = version;
    }

    byAssistant.set(version.assistantId, entry);
  }

  return assistantResult.rows.map((row) => {
    const versions = byAssistant.get(row.id) ?? {
      publishedVersion: null,
      draftVersion: null,
    };

    return {
      assistant: mapAssistantRow(row),
      publishedVersion: versions.publishedVersion,
      draftVersion: versions.draftVersion,
    };
  });
}

export async function findAssistantDetailForTenant(
  businessId: string,
  assistantId: string,
): Promise<AssistantWithVersions | null> {
  const assistantResult = await postgresPool.query<AssistantRow>(
    `SELECT id, business_id, location_id, created_at, updated_at
     FROM assistants
     WHERE business_id = $1 AND id = $2
     LIMIT 1`,
    [businessId, assistantId],
  );

  const assistantRow = assistantResult.rows[0];

  if (!assistantRow) {
    return null;
  }

  const versionResult = await postgresPool.query<AssistantVersionRow>(
    `${VERSION_SELECT_WITH_LOCATIONS}
     WHERE av.business_id = $1
       AND av.assistant_id = $2
       AND av.status IN ('draft', 'published')`,
    [businessId, assistantId],
  );

  let publishedVersion: AssistantVersion | null = null;
  let draftVersion: AssistantVersion | null = null;

  for (const row of versionResult.rows) {
    const mapped = mapVersionRow(row);

    if (mapped.status === 'published') {
      publishedVersion = mapped;
    } else if (mapped.status === 'draft') {
      draftVersion = mapped;
    }
  }

  return {
    assistant: mapAssistantRow(assistantRow),
    publishedVersion,
    draftVersion,
  };
}

export async function listAssistantVersionsForTenant(
  businessId: string,
  assistantId: string,
): Promise<AssistantVersion[] | null> {
  const assistantCheck = await postgresPool.query<{ id: string }>(
    `SELECT id FROM assistants WHERE business_id = $1 AND id = $2 LIMIT 1`,
    [businessId, assistantId],
  );

  if (!assistantCheck.rows[0]) {
    return null;
  }

  const result = await postgresPool.query<AssistantVersionRow>(
    `${VERSION_SELECT_WITH_LOCATIONS}
     WHERE av.business_id = $1 AND av.assistant_id = $2
     ORDER BY av.version_number DESC`,
    [businessId, assistantId],
  );

  return result.rows.map(mapVersionRow);
}

export async function findAssistantVersionForTenant(
  businessId: string,
  assistantId: string,
  versionId: string,
): Promise<AssistantVersion | null> {
  return loadVersionById(postgresPool, businessId, assistantId, versionId);
}

export async function createDraftVersionForTenant(
  businessId: string,
  assistantId: string,
  userId: string,
  overrides: DraftVersionOverrides,
): Promise<AssistantVersion> {
  try {
    return await runInTransaction(async (client) => {
      const assistantResult = await client.query<{ id: string; location_id: string | null }>(
        `SELECT id, location_id
         FROM assistants
         WHERE business_id = $1 AND id = $2
         FOR UPDATE`,
        [businessId, assistantId],
      );

      const assistant = assistantResult.rows[0];

      if (!assistant) {
        throw new HttpError(404, 'ASSISTANT_NOT_FOUND', 'Assistant not found.');
      }

      const latestResult = await client.query<AssistantVersionRow>(
        `${VERSION_SELECT_WITH_LOCATIONS}
         WHERE av.business_id = $1 AND av.assistant_id = $2
         ORDER BY av.version_number DESC
         LIMIT 1`,
        [businessId, assistantId],
      );

      const latestRow = latestResult.rows[0];

      if (!latestRow) {
        throw new Error('Assistant has no base version.');
      }

      if (latestRow.status === 'draft') {
        throw new HttpError(
          409,
          'DRAFT_ALREADY_EXISTS',
          'A draft version already exists for this assistant.',
        );
      }

      const baseVersion = mapVersionRow(latestRow);
      const merged = mergeVersionConfig(baseVersion, overrides, assistant.location_id);

      await assertKnowledgeLocationsActiveForBusiness(
        client,
        businessId,
        merged.knowledgeLocationIds,
      );

      const inserted = await client.query<{ id: string }>(
        `INSERT INTO assistant_versions (
           assistant_id, business_id, version_number, status,
           display_name, description, welcome_message, system_instructions,
           language, tone, fallback_message, model_settings,
           allowed_tools, allowed_knowledge_scopes, knowledge_location_scope,
           created_by_user_id
         )
         VALUES (
           $1, $2, $3, 'draft',
           $4, $5, $6, $7,
           $8, $9, $10, $11::jsonb,
           $12::text[], $13::text[], $14,
           $15
         )
         RETURNING id`,
        [
          assistantId,
          businessId,
          baseVersion.versionNumber + 1,
          merged.displayName,
          merged.description,
          merged.welcomeMessage,
          merged.systemInstructions,
          merged.language,
          merged.tone,
          merged.fallbackMessage,
          JSON.stringify(merged.modelSettings),
          merged.allowedTools,
          merged.allowedKnowledgeScopes,
          merged.knowledgeLocationScope,
          userId,
        ],
      );

      const newVersionId = inserted.rows[0]?.id;

      if (!newVersionId) {
        throw new Error('Failed to insert draft version.');
      }

      await replaceKnowledgeLocations(
        client,
        businessId,
        newVersionId,
        merged.knowledgeLocationIds,
      );

      const loaded = await loadVersionById(client, businessId, assistantId, newVersionId);

      if (!loaded) {
        throw new Error('Failed to reload created draft version.');
      }

      return loaded;
    });
  } catch (error) {
    if (isPgUniqueViolation(error, ['assistant_versions_one_draft_idx'])) {
      throw new HttpError(
        409,
        'DRAFT_ALREADY_EXISTS',
        'A draft version already exists for this assistant.',
      );
    }

    throw error;
  }
}

export async function updateDraftVersionForTenant(
  businessId: string,
  assistantId: string,
  versionId: string,
  overrides: DraftVersionOverrides,
): Promise<AssistantVersion> {
  return runInTransaction(async (client) => {
    const assistantResult = await client.query<{ id: string; location_id: string | null }>(
      `SELECT id, location_id
       FROM assistants
       WHERE business_id = $1 AND id = $2
       FOR UPDATE`,
      [businessId, assistantId],
    );

    const assistant = assistantResult.rows[0];

    if (!assistant) {
      throw new HttpError(404, 'ASSISTANT_NOT_FOUND', 'Assistant not found.');
    }

    const versionLock = await client.query<{ id: string; status: AssistantVersionStatus }>(
      `SELECT id, status
       FROM assistant_versions
       WHERE business_id = $1 AND assistant_id = $2 AND id = $3
       FOR UPDATE`,
      [businessId, assistantId, versionId],
    );

    const lockedRow = versionLock.rows[0];

    if (!lockedRow) {
      throw new HttpError(404, 'ASSISTANT_VERSION_NOT_FOUND', 'Assistant version not found.');
    }

    if (lockedRow.status !== 'draft') {
      throw new HttpError(
        409,
        'VERSION_IMMUTABLE',
        'Published and superseded assistant versions cannot be modified.',
      );
    }

    const currentVersion = await loadVersionById(client, businessId, assistantId, versionId);

    if (!currentVersion) {
      throw new HttpError(404, 'ASSISTANT_VERSION_NOT_FOUND', 'Assistant version not found.');
    }

    const merged = mergeVersionConfig(currentVersion, overrides, assistant.location_id);

    await assertKnowledgeLocationsActiveForBusiness(
      client,
      businessId,
      merged.knowledgeLocationIds,
    );

    await client.query(
      `UPDATE assistant_versions
       SET
         display_name = $4,
         description = $5,
         welcome_message = $6,
         system_instructions = $7,
         language = $8,
         tone = $9,
         fallback_message = $10,
         model_settings = $11::jsonb,
         allowed_tools = $12::text[],
         allowed_knowledge_scopes = $13::text[],
         knowledge_location_scope = $14
       WHERE business_id = $1 AND assistant_id = $2 AND id = $3 AND status = 'draft'`,
      [
        businessId,
        assistantId,
        versionId,
        merged.displayName,
        merged.description,
        merged.welcomeMessage,
        merged.systemInstructions,
        merged.language,
        merged.tone,
        merged.fallbackMessage,
        JSON.stringify(merged.modelSettings),
        merged.allowedTools,
        merged.allowedKnowledgeScopes,
        merged.knowledgeLocationScope,
      ],
    );

    await replaceKnowledgeLocations(client, businessId, versionId, merged.knowledgeLocationIds);

    const updated = await loadVersionById(client, businessId, assistantId, versionId);

    if (!updated) {
      throw new Error('Failed to reload updated assistant version.');
    }

    return updated;
  });
}

export async function publishVersionForTenant(
  businessId: string,
  assistantId: string,
  versionId: string,
  userId: string,
): Promise<AssistantVersion> {
  return runInTransaction(async (client) => {
    const assistantResult = await client.query<{ id: string; location_id: string | null }>(
      `SELECT id, location_id
       FROM assistants
       WHERE business_id = $1 AND id = $2
       FOR UPDATE`,
      [businessId, assistantId],
    );

    const assistant = assistantResult.rows[0];

    if (!assistant) {
      throw new HttpError(404, 'ASSISTANT_NOT_FOUND', 'Assistant not found.');
    }

    const versionLock = await client.query<{ id: string; status: AssistantVersionStatus }>(
      `SELECT id, status
       FROM assistant_versions
       WHERE business_id = $1 AND assistant_id = $2 AND id = $3
       FOR UPDATE`,
      [businessId, assistantId, versionId],
    );

    const target = versionLock.rows[0];

    if (!target) {
      throw new HttpError(404, 'ASSISTANT_VERSION_NOT_FOUND', 'Assistant version not found.');
    }

    if (target.status !== 'draft') {
      throw new HttpError(
        409,
        'VERSION_NOT_DRAFT',
        'Only a draft assistant version can be published.',
      );
    }

    const currentVersion = await loadVersionById(client, businessId, assistantId, versionId);

    if (!currentVersion) {
      throw new HttpError(404, 'ASSISTANT_VERSION_NOT_FOUND', 'Assistant version not found.');
    }

    if (assistant.location_id !== null) {
      await assertLocationActiveForBusiness(client, businessId, assistant.location_id);
    }

    await assertKnowledgeLocationsActiveForBusiness(
      client,
      businessId,
      currentVersion.knowledgeLocationIds,
    );

    await client.query(
      `UPDATE assistant_versions
       SET status = 'superseded'
       WHERE business_id = $1 AND assistant_id = $2 AND status = 'published'`,
      [businessId, assistantId],
    );

    await client.query(
      `UPDATE assistant_versions
       SET
         status = 'published',
         published_at = CURRENT_TIMESTAMP,
         published_by_user_id = $4
       WHERE business_id = $1 AND assistant_id = $2 AND id = $3 AND status = 'draft'`,
      [businessId, assistantId, versionId, userId],
    );

    const published = await loadVersionById(client, businessId, assistantId, versionId);

    if (!published) {
      throw new Error('Failed to reload published assistant version.');
    }

    return published;
  });
}

