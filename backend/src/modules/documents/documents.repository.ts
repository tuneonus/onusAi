import type { PoolClient } from 'pg';
import { postgresPool } from '../../integrations/database/postgres.js';
import { HttpError } from '../../utils/http-error.js';
import {
  cancelActiveIngestionJobsForDocument,
  cancelActiveIngestionJobsForUnindexedVersions,
  enqueueIngestionJob,
} from '../ingestion-jobs/ingestion-jobs.repository.js';
import type {
  CreateDocumentInput,
  DocumentChunkRecord,
  DocumentDetail,
  DocumentMimeType,
  DocumentRecord,
  DocumentSourceType,
  DocumentStatus,
  DocumentVersion,
  DocumentVersionStatus,
  DocumentVersionSummary,
  DocumentVisibility,
  DocumentWithLatestVersion,
  ListDocumentsFilter,
  ReplaceDocumentVersionInput,
  UpdateDocumentInput,
} from './documents.types.js';

interface DocumentRow {
  id: string;
  business_id: string;
  location_id: string | null;
  title: string;
  visibility: DocumentVisibility;
  status: DocumentStatus;
  current_version_number: number;
  active_version_id: string | null;
  created_by_user_id: string | null;
  deleted_at: Date | null;
  deleted_by_user_id: string | null;
  created_at: Date;
  updated_at: Date;
}

interface DocumentVersionSummaryRow {
  id: string;
  document_id: string;
  business_id: string;
  version_number: number;
  status: DocumentVersionStatus;
  source_filename: string;
  mime_type: DocumentMimeType;
  source_type: DocumentSourceType;
  encoding: 'utf-8';
  byte_size: number;
  char_count: number;
  content_sha256: string;
  chunk_version: string | null;
  chunk_count: number;
  normalized_char_count: number | null;
  normalized_sha256: string | null;
  failure_reason: string | null;
  indexed_at: Date | null;
  created_by_user_id: string | null;
  created_at: Date;
  updated_at: Date;
}

interface DocumentVersionRow extends DocumentVersionSummaryRow {
  content_text: string;
}

const DOCUMENT_COLUMNS = `
  id, business_id, location_id, title, visibility, status,
  current_version_number, active_version_id, created_by_user_id,
  deleted_at, deleted_by_user_id, created_at, updated_at
`;

const VERSION_SUMMARY_COLUMNS = `
  id, document_id, business_id, version_number, status,
  source_filename, mime_type, source_type, encoding,
  byte_size, char_count, content_sha256, chunk_version,
  chunk_count, normalized_char_count, normalized_sha256,
  failure_reason, indexed_at, created_by_user_id, created_at, updated_at
`;

const VERSION_FULL_COLUMNS = `${VERSION_SUMMARY_COLUMNS}, content_text`;

function mapDocumentRow(row: DocumentRow): DocumentRecord {
  return {
    id: row.id,
    businessId: row.business_id,
    locationId: row.location_id,
    title: row.title,
    visibility: row.visibility,
    status: row.status,
    currentVersionNumber: row.current_version_number,
    activeVersionId: row.active_version_id,
    createdByUserId: row.created_by_user_id,
    deletedAt: row.deleted_at,
    deletedByUserId: row.deleted_by_user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapVersionSummaryRow(row: DocumentVersionSummaryRow): DocumentVersionSummary {
  return {
    id: row.id,
    documentId: row.document_id,
    businessId: row.business_id,
    versionNumber: row.version_number,
    status: row.status,
    sourceFilename: row.source_filename,
    mimeType: row.mime_type,
    sourceType: row.source_type,
    encoding: row.encoding,
    byteSize: row.byte_size,
    charCount: row.char_count,
    contentSha256: row.content_sha256,
    chunkVersion: row.chunk_version,
    chunkCount: row.chunk_count,
    normalizedCharCount: row.normalized_char_count,
    normalizedSha256: row.normalized_sha256,
    failureReason: row.failure_reason,
    indexedAt: row.indexed_at,
    createdByUserId: row.created_by_user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapVersionRow(row: DocumentVersionRow): DocumentVersion {
  return {
    ...mapVersionSummaryRow(row),
    contentText: row.content_text,
  };
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
    throw new HttpError(404, 'LOCATION_NOT_FOUND', 'Business location was not found.');
  }

  if (row.archived_at !== null) {
    throw new HttpError(409, 'LOCATION_ARCHIVED', 'Archived locations cannot be assigned to documents.');
  }
}

export async function createDocumentWithVersion(
  businessId: string,
  createdByUserId: string,
  input: CreateDocumentInput,
): Promise<{ document: DocumentRecord; version: DocumentVersion }> {
  return runInTransaction(async (client) => {
    if (input.locationId !== null) {
      await assertLocationActiveForBusiness(client, businessId, input.locationId);
    }

    const docResult = await client.query<DocumentRow>(
      `INSERT INTO documents (
         business_id, location_id, title, visibility, status,
         current_version_number, active_version_id, created_by_user_id
       )
       VALUES ($1, $2, $3, $4, 'uploaded', 1, NULL, $5)
       RETURNING ${DOCUMENT_COLUMNS}`,
      [businessId, input.locationId, input.title, input.visibility, createdByUserId],
    );

    const document = mapDocumentRow(docResult.rows[0]!);

    const versionResult = await client.query<DocumentVersionRow>(
      `INSERT INTO document_versions (
         document_id, business_id, version_number, status,
         source_filename, mime_type, source_type, encoding,
         byte_size, char_count, content_sha256, content_text,
         indexed_at, created_by_user_id
       )
       VALUES ($1, $2, 1, 'uploaded', $3, $4, $5, $6, $7, $8, $9, $10, NULL, $11)
       RETURNING ${VERSION_FULL_COLUMNS}`,
      [
        document.id,
        businessId,
        input.sourceFilename,
        input.mimeType,
        input.sourceType,
        input.encoding,
        input.byteSize,
        input.charCount,
        input.contentSha256,
        input.contentText,
        createdByUserId,
      ],
    );

    const version = mapVersionRow(versionResult.rows[0]!);
    await enqueueIngestionJob(client, businessId, document.id, version.id);

    return {
      document,
      version,
    };
  });
}

export async function addDocumentVersion(
  businessId: string,
  documentId: string,
  createdByUserId: string,
  input: ReplaceDocumentVersionInput,
): Promise<{ document: DocumentRecord; version: DocumentVersion }> {
  return runInTransaction(async (client) => {
    const docResult = await client.query<DocumentRow>(
      `SELECT ${DOCUMENT_COLUMNS}
       FROM documents
       WHERE business_id = $1 AND id = $2
       FOR UPDATE`,
      [businessId, documentId],
    );

    const existingDoc = docResult.rows[0];

    if (!existingDoc || existingDoc.status === 'deleted') {
      throw new HttpError(404, 'DOCUMENT_NOT_FOUND', 'Document was not found.');
    }

    const leasedResult = await client.query<{ id: string }>(
      `SELECT id
       FROM document_ingestion_jobs
       WHERE business_id = $1 AND document_id = $2 AND status = 'leased'
       LIMIT 1`,
      [businessId, documentId],
    );

    if (leasedResult.rows.length > 0) {
      throw new HttpError(
        409,
        'DOCUMENT_PROCESSING_IN_PROGRESS',
        'Cannot upload a new version while another version is currently leased by a worker.',
      );
    }

    // Supersede any unindexed pending/processing/failed version; keep any 'ready' version active until indexing succeeds.
    await client.query(
      `UPDATE document_versions
       SET status = 'superseded'
       WHERE business_id = $1
         AND document_id = $2
         AND status IN ('uploaded', 'processing', 'failed')`,
      [businessId, documentId],
    );

    await cancelActiveIngestionJobsForUnindexedVersions(client, businessId, documentId);

    const nextVersionNumber = existingDoc.current_version_number + 1;
    const nextDocStatus: DocumentStatus = existingDoc.active_version_id ? 'ready' : 'uploaded';

    const updatedDocResult = await client.query<DocumentRow>(
      `UPDATE documents
       SET current_version_number = $3,
           status = $4
       WHERE business_id = $1 AND id = $2
       RETURNING ${DOCUMENT_COLUMNS}`,
      [businessId, documentId, nextVersionNumber, nextDocStatus],
    );

    const versionResult = await client.query<DocumentVersionRow>(
      `INSERT INTO document_versions (
         document_id, business_id, version_number, status,
         source_filename, mime_type, source_type, encoding,
         byte_size, char_count, content_sha256, content_text,
         indexed_at, created_by_user_id
       )
       VALUES ($1, $2, $3, 'uploaded', $4, $5, $6, $7, $8, $9, $10, $11, NULL, $12)
       RETURNING ${VERSION_FULL_COLUMNS}`,
      [
        documentId,
        businessId,
        nextVersionNumber,
        input.sourceFilename,
        input.mimeType,
        input.sourceType,
        input.encoding,
        input.byteSize,
        input.charCount,
        input.contentSha256,
        input.contentText,
        createdByUserId,
      ],
    );

    const version = mapVersionRow(versionResult.rows[0]!);
    await enqueueIngestionJob(client, businessId, documentId, version.id);

    return {
      document: mapDocumentRow(updatedDocResult.rows[0]!),
      version,
    };
  });
}

export async function listDocuments(
  businessId: string,
  filter: ListDocumentsFilter,
): Promise<DocumentWithLatestVersion[]> {
  const conditions = ['d.business_id = $1'];
  const params: unknown[] = [businessId];

  if (!filter.includeDeleted) {
    conditions.push('d.deleted_at IS NULL');
  }

  if (filter.visibility !== undefined) {
    params.push(filter.visibility);
    conditions.push(`d.visibility = $${params.length}`);
  }

  if (filter.status !== undefined) {
    params.push(filter.status);
    conditions.push(`d.status = $${params.length}`);
  }

  if (filter.locationId !== undefined) {
    params.push(filter.locationId);
    conditions.push(`d.location_id = $${params.length}`);
  }

  const docsResult = await postgresPool.query<DocumentRow>(
    `SELECT ${DOCUMENT_COLUMNS}
     FROM documents d
     WHERE ${conditions.join(' AND ')}
     ORDER BY d.updated_at DESC, d.id DESC`,
    params,
  );

  if (docsResult.rows.length === 0) {
    return [];
  }

  const documentIds = docsResult.rows.map((row) => row.id);
  const versionsResult = await postgresPool.query<DocumentVersionSummaryRow>(
    `SELECT DISTINCT ON (dv.document_id)
       ${VERSION_SUMMARY_COLUMNS}
     FROM document_versions dv
     WHERE dv.business_id = $1 AND dv.document_id = ANY($2::uuid[])
     ORDER BY dv.document_id, dv.version_number DESC`,
    [businessId, documentIds],
  );

  const latestByDocumentId = new Map<string, DocumentVersionSummary>();

  for (const row of versionsResult.rows) {
    latestByDocumentId.set(row.document_id, mapVersionSummaryRow(row));
  }

  return docsResult.rows.map((row) => ({
    document: mapDocumentRow(row),
    latestVersion: latestByDocumentId.get(row.id) ?? null,
  }));
}

export async function getDocumentDetail(
  businessId: string,
  documentId: string,
): Promise<DocumentDetail> {
  const docResult = await postgresPool.query<DocumentRow>(
    `SELECT ${DOCUMENT_COLUMNS}
     FROM documents
     WHERE business_id = $1 AND id = $2
     LIMIT 1`,
    [businessId, documentId],
  );

  const row = docResult.rows[0];

  if (!row) {
    throw new HttpError(404, 'DOCUMENT_NOT_FOUND', 'Document was not found.');
  }

  const versionsResult = await postgresPool.query<DocumentVersionSummaryRow>(
    `SELECT ${VERSION_SUMMARY_COLUMNS}
     FROM document_versions
     WHERE business_id = $1 AND document_id = $2
     ORDER BY version_number DESC`,
    [businessId, documentId],
  );

  return {
    document: mapDocumentRow(row),
    versions: versionsResult.rows.map(mapVersionSummaryRow),
  };
}

export async function listDocumentVersions(
  businessId: string,
  documentId: string,
): Promise<DocumentVersionSummary[]> {
  const detail = await getDocumentDetail(businessId, documentId);
  return detail.versions;
}

export async function getDocumentVersion(
  businessId: string,
  documentId: string,
  versionId: string,
): Promise<DocumentVersion> {
  const result = await postgresPool.query<DocumentVersionRow>(
    `SELECT ${VERSION_FULL_COLUMNS}
     FROM document_versions
     WHERE business_id = $1 AND document_id = $2 AND id = $3
     LIMIT 1`,
    [businessId, documentId, versionId],
  );

  const row = result.rows[0];

  if (!row) {
    throw new HttpError(404, 'DOCUMENT_VERSION_NOT_FOUND', 'Document version was not found.');
  }

  return mapVersionRow(row);
}

export async function updateDocumentMetadata(
  businessId: string,
  documentId: string,
  input: UpdateDocumentInput,
): Promise<DocumentRecord> {
  return runInTransaction(async (client) => {
    const docResult = await client.query<DocumentRow>(
      `SELECT ${DOCUMENT_COLUMNS}
       FROM documents
       WHERE business_id = $1 AND id = $2
       FOR UPDATE`,
      [businessId, documentId],
    );

    const existing = docResult.rows[0];

    if (!existing || existing.status === 'deleted') {
      throw new HttpError(404, 'DOCUMENT_NOT_FOUND', 'Document was not found.');
    }

    const nextLocationId =
      input.locationId !== undefined ? input.locationId : existing.location_id;

    if (input.locationId !== undefined && input.locationId !== null) {
      await assertLocationActiveForBusiness(client, businessId, input.locationId);
    }

    const updated = await client.query<DocumentRow>(
      `UPDATE documents
       SET title = $3,
           visibility = $4,
           location_id = $5
       WHERE business_id = $1 AND id = $2
       RETURNING ${DOCUMENT_COLUMNS}`,
      [
        businessId,
        documentId,
        input.title ?? existing.title,
        input.visibility ?? existing.visibility,
        nextLocationId,
      ],
    );

    const updatedDoc = mapDocumentRow(updated.rows[0]!);

    if (input.visibility !== undefined || input.locationId !== undefined) {
      await client.query(
        `UPDATE document_chunks
         SET visibility = $3,
             location_id = $4
         WHERE business_id = $1 AND document_id = $2`,
        [businessId, documentId, updatedDoc.visibility, updatedDoc.locationId],
      );
    }

    return updatedDoc;
  });
}

export async function retryDocumentVersion(
  businessId: string,
  documentId: string,
  versionId: string,
): Promise<{ document: DocumentRecord; version: DocumentVersionSummary }> {
  return runInTransaction(async (client) => {
    const docResult = await client.query<DocumentRow>(
      `SELECT ${DOCUMENT_COLUMNS}
       FROM documents
       WHERE business_id = $1 AND id = $2
       FOR UPDATE`,
      [businessId, documentId],
    );

    const existingDoc = docResult.rows[0];

    if (!existingDoc || existingDoc.status === 'deleted') {
      throw new HttpError(404, 'DOCUMENT_NOT_FOUND', 'Document was not found.');
    }

    const versionResult = await client.query<DocumentVersionSummaryRow>(
      `SELECT ${VERSION_SUMMARY_COLUMNS}
       FROM document_versions
       WHERE business_id = $1 AND document_id = $2 AND id = $3
       FOR UPDATE`,
      [businessId, documentId, versionId],
    );

    const existingVersion = versionResult.rows[0];

    if (!existingVersion) {
      throw new HttpError(404, 'DOCUMENT_VERSION_NOT_FOUND', 'Document version was not found.');
    }

    if (existingVersion.status !== 'failed') {
      throw new HttpError(
        409,
        'INVALID_DOCUMENT_STATE',
        'Only failed document versions can be retried.',
      );
    }

    const pendingCheck = await client.query<{ id: string }>(
      `SELECT id
       FROM document_versions
       WHERE business_id = $1
         AND document_id = $2
         AND id <> $3
         AND status IN ('uploaded', 'processing')
       LIMIT 1`,
      [businessId, documentId, versionId],
    );

    if (pendingCheck.rows.length > 0) {
      throw new HttpError(
        409,
        'INVALID_DOCUMENT_STATE',
        'Another document version is already pending or processing.',
      );
    }

    const updatedVersion = await client.query<DocumentVersionSummaryRow>(
      `UPDATE document_versions
       SET status = 'uploaded',
           failure_reason = NULL,
           indexed_at = NULL
       WHERE business_id = $1 AND document_id = $2 AND id = $3
       RETURNING ${VERSION_SUMMARY_COLUMNS}`,
      [businessId, documentId, versionId],
    );

    const nextDocStatus: DocumentStatus = existingDoc.active_version_id ? 'ready' : 'uploaded';
    const updatedDoc = await client.query<DocumentRow>(
      `UPDATE documents
       SET status = $3
       WHERE business_id = $1 AND id = $2
       RETURNING ${DOCUMENT_COLUMNS}`,
      [businessId, documentId, nextDocStatus],
    );

    await enqueueIngestionJob(client, businessId, documentId, versionId);

    return {
      document: mapDocumentRow(updatedDoc.rows[0]!),
      version: mapVersionSummaryRow(updatedVersion.rows[0]!),
    };
  });
}

export async function softDeleteDocument(
  businessId: string,
  documentId: string,
  deletedByUserId: string,
): Promise<DocumentRecord> {
  return runInTransaction(async (client) => {
    const docResult = await client.query<DocumentRow>(
      `SELECT ${DOCUMENT_COLUMNS}
       FROM documents
       WHERE business_id = $1 AND id = $2
       FOR UPDATE`,
      [businessId, documentId],
    );

    const existingDoc = docResult.rows[0];

    if (!existingDoc || existingDoc.status === 'deleted') {
      throw new HttpError(404, 'DOCUMENT_NOT_FOUND', 'Document was not found.');
    }

    const updatedDoc = await client.query<DocumentRow>(
      `UPDATE documents
       SET status = 'deleted',
           active_version_id = NULL,
           deleted_at = CURRENT_TIMESTAMP,
           deleted_by_user_id = $3
       WHERE business_id = $1 AND id = $2
       RETURNING ${DOCUMENT_COLUMNS}`,
      [businessId, documentId, deletedByUserId],
    );

    await client.query(
      `UPDATE document_versions
       SET status = 'deleted'
       WHERE business_id = $1 AND document_id = $2 AND status <> 'deleted'`,
      [businessId, documentId],
    );

    await cancelActiveIngestionJobsForDocument(client, businessId, documentId);

    return mapDocumentRow(updatedDoc.rows[0]!);
  });
}

interface DocumentChunkRow {
  id: string;
  business_id: string;
  document_id: string;
  document_version_id: string;
  location_id: string | null;
  visibility: DocumentVisibility;
  chunk_version: string;
  chunk_index: number;
  heading_path: string[];
  char_start: number;
  char_end: number;
  char_count: number;
  content_sha256: string;
  chunk_text: string;
  created_at: Date;
}

function mapChunkRow(row: DocumentChunkRow): DocumentChunkRecord {
  return {
    id: row.id,
    businessId: row.business_id,
    documentId: row.document_id,
    documentVersionId: row.document_version_id,
    locationId: row.location_id,
    visibility: row.visibility,
    chunkVersion: row.chunk_version,
    chunkIndex: row.chunk_index,
    headingPath: row.heading_path,
    charStart: row.char_start,
    charEnd: row.char_end,
    charCount: row.char_count,
    contentSha256: row.content_sha256,
    chunkText: row.chunk_text,
    createdAt: row.created_at,
  };
}

export async function listDocumentVersionChunks(
  businessId: string,
  documentId: string,
  versionId: string,
): Promise<DocumentChunkRecord[]> {
  const versionCheck = await postgresPool.query<{ id: string }>(
    `SELECT id
     FROM document_versions
     WHERE business_id = $1 AND document_id = $2 AND id = $3
     LIMIT 1`,
    [businessId, documentId, versionId],
  );

  if (versionCheck.rows.length === 0) {
    throw new HttpError(404, 'DOCUMENT_VERSION_NOT_FOUND', 'Document version was not found.');
  }

  const result = await postgresPool.query<DocumentChunkRow>(
    `SELECT
       id, business_id, document_id, document_version_id,
       location_id, visibility, chunk_version, chunk_index,
       heading_path, char_start, char_end, char_count,
       content_sha256, chunk_text, created_at
     FROM document_chunks
     WHERE business_id = $1 AND document_id = $2 AND document_version_id = $3
     ORDER BY chunk_index ASC`,
    [businessId, documentId, versionId],
  );

  return result.rows.map(mapChunkRow);
}
