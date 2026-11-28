import { postgresPool } from '../../integrations/database/postgres.js';
import { HttpError } from '../../utils/http-error.js';
import type {
  DocumentMimeType,
  DocumentSourceType,
  DocumentVisibility,
} from '../documents/documents.types.js';
import type {
  KnowledgeSearchInput,
  ResolvedSearchScope,
  ValidateRetrievalCandidatesInput,
  ValidatedRetrievalResult,
} from './retrieval.types.js';

interface ValidatedChunkRow {
  chunk_id: string;
  document_id: string;
  document_version_id: string;
  chunk_index: number;
  chunk_text: string;
  title: string;
  source_filename: string;
  source_type: DocumentSourceType;
  mime_type: DocumentMimeType;
  version_number: number;
  visibility: DocumentVisibility;
  location_id: string | null;
  chunk_version: string;
  heading_path: string[];
  char_start: number;
  char_end: number;
}

export async function validateRetrievalCandidates(
  input: ValidateRetrievalCandidatesInput,
): Promise<ValidatedRetrievalResult[]> {
  if (input.candidates.length === 0) {
    return [];
  }

  const chunkIds = Array.from(new Set(input.candidates.map((item) => item.chunkId)));
  const conditions = [
    'd.business_id = $1',
    'd.deleted_at IS NULL',
    "d.status = 'ready'",
    'd.active_version_id = dv.id',
    "dv.status = 'ready'",
    'dv.indexed_at IS NOT NULL',
    'd.visibility = ANY($2::text[])',
    'c.id = ANY($3::uuid[])',
  ];
  const params: unknown[] = [input.businessId, input.allowedVisibilities, chunkIds];

  if (input.allowedLocationIds !== null) {
    if (input.allowedLocationIds.length === 0) {
      if (input.includeBusinessWide) {
        conditions.push('d.location_id IS NULL');
      } else {
        return [];
      }
    } else {
      params.push(input.allowedLocationIds);
      const locParam = `$${params.length}::uuid[]`;
      if (input.includeBusinessWide) {
        conditions.push(`(d.location_id = ANY(${locParam}) OR d.location_id IS NULL)`);
      } else {
        conditions.push(`d.location_id = ANY(${locParam})`);
      }
    }
  } else if (!input.includeBusinessWide) {
    conditions.push('d.location_id IS NOT NULL');
  }

  const result = await postgresPool.query<ValidatedChunkRow>(
    `SELECT
       c.id AS chunk_id,
       d.id AS document_id,
       dv.id AS document_version_id,
       c.chunk_index,
       c.chunk_text,
       d.title,
       dv.source_filename,
       dv.source_type,
       dv.mime_type,
       dv.version_number,
       d.visibility,
       d.location_id,
       c.chunk_version,
       c.heading_path,
       c.char_start,
       c.char_end
     FROM document_chunks c
     JOIN document_versions dv
       ON dv.business_id = c.business_id
      AND dv.id = c.document_version_id
     JOIN documents d
       ON d.business_id = dv.business_id
      AND d.id = dv.document_id
     WHERE ${conditions.join(' AND ')}`,
    params,
  );

  const byChunkId = new Map<string, ValidatedChunkRow>();
  for (const row of result.rows) {
    byChunkId.set(row.chunk_id, row);
  }

  const validated: ValidatedRetrievalResult[] = [];
  const seenChunks = new Set<string>();

  for (const candidate of input.candidates) {
    if (seenChunks.has(candidate.chunkId)) {
      continue;
    }
    const row = byChunkId.get(candidate.chunkId);
    if (!row) {
      continue;
    }
    // Reject mismatched (document_id, document_version_id, chunk_id) tuples from vector payloads.
    if (
      row.document_id !== candidate.documentId ||
      row.document_version_id !== candidate.documentVersionId
    ) {
      continue;
    }
    seenChunks.add(candidate.chunkId);
    validated.push({
      chunkId: row.chunk_id,
      documentId: row.document_id,
      documentVersionId: row.document_version_id,
      chunkIndex: row.chunk_index,
      score: candidate.score,
      chunkText: row.chunk_text,
      title: row.title,
      sourceFilename: row.source_filename,
      sourceType: row.source_type,
      mimeType: row.mime_type,
      versionNumber: row.version_number,
      visibility: row.visibility,
      locationId: row.location_id,
      chunkVersion: row.chunk_version,
      headingPath: row.heading_path,
      charStart: row.char_start,
      charEnd: row.char_end,
      citation: {
        documentId: row.document_id,
        documentVersionId: row.document_version_id,
        chunkId: row.chunk_id,
        title: row.title,
        sourceFilename: row.source_filename,
        versionNumber: row.version_number,
        headingPath: row.heading_path,
      },
    });
  }

  return validated;
}

export async function resolveStaffSearchScope(
  businessId: string,
  input: KnowledgeSearchInput,
): Promise<ResolvedSearchScope> {
  let allowedVisibilities: DocumentVisibility[] = ['public', 'staff_only'];
  let allowedLocationIds: string[] | null = null;
  let includeBusinessWide = true;

  if (input.assistantId !== undefined) {
    const assistantRes = await postgresPool.query<{
      assistant_version_id: string;
      location_id: string | null;
      knowledge_visibility: 'public_only' | 'public_and_staff';
      knowledge_location_scope: 'business_wide' | 'assigned_location' | 'selected_locations';
    }>(
      `SELECT
         av.id AS assistant_version_id,
         a.location_id,
         av.knowledge_visibility,
         av.knowledge_location_scope
       FROM assistants a
       JOIN assistant_versions av
         ON av.business_id = a.business_id
        AND av.id = a.published_version_id
       WHERE a.business_id = $1
         AND a.id = $2
         AND a.archived_at IS NULL
         AND av.status = 'published'
       LIMIT 1`,
      [businessId, input.assistantId],
    );

    const assistant = assistantRes.rows[0];
    if (!assistant) {
      throw new HttpError(404, 'ASSISTANT_NOT_FOUND', 'Published assistant was not found.');
    }

    allowedVisibilities =
      assistant.knowledge_visibility === 'public_only'
        ? ['public']
        : ['public', 'staff_only'];

    if (assistant.knowledge_location_scope === 'assigned_location') {
      allowedLocationIds = assistant.location_id ? [assistant.location_id] : [];
      includeBusinessWide = true;
    } else if (assistant.knowledge_location_scope === 'selected_locations') {
      const locsRes = await postgresPool.query<{ location_id: string }>(
        `SELECT location_id
         FROM assistant_version_knowledge_locations
         WHERE business_id = $1 AND assistant_version_id = $2`,
        [businessId, assistant.assistant_version_id],
      );
      allowedLocationIds = locsRes.rows.map((r) => r.location_id);
      includeBusinessWide = true;
    }
  }

  if (input.locationId !== undefined) {
    if (input.locationId === null) {
      allowedLocationIds = [];
      includeBusinessWide = true;
    } else {
      const locRes = await postgresPool.query<{ id: string }>(
        `SELECT id
         FROM business_locations
         WHERE business_id = $1 AND id = $2 AND archived_at IS NULL
         LIMIT 1`,
        [businessId, input.locationId],
      );
      if (locRes.rows.length === 0) {
        throw new HttpError(404, 'LOCATION_NOT_FOUND', 'Business location was not found.');
      }

      if (allowedLocationIds !== null && !allowedLocationIds.includes(input.locationId)) {
        allowedLocationIds = [];
      } else {
        allowedLocationIds = [input.locationId];
      }
      includeBusinessWide = false;
    }
  }

  return {
    businessId,
    allowedVisibilities,
    allowedLocationIds,
    includeBusinessWide,
  };
}

