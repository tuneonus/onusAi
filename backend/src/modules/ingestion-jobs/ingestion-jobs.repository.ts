import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { postgresPool } from '../../integrations/database/postgres.js';
import { HttpError } from '../../utils/http-error.js';
import type { DocumentMimeType, DocumentSourceType, DocumentVisibility } from '../documents/documents.types.js';
import type {
  CompleteJobInput,
  FailJobInput,
  IngestionJobRecord,
  IngestionJobStatus,
  LeasedIngestionJob,
} from './ingestion-jobs.types.js';

interface IngestionJobRow {
  id: string;
  business_id: string;
  document_id: string;
  document_version_id: string;
  status: IngestionJobStatus;
  attempt_count: number;
  max_attempts: number;
  next_attempt_at: Date;
  lease_token: string | null;
  leased_by: string | null;
  leased_at: Date | null;
  lease_expires_at: Date | null;
  last_error: string | null;
  completed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

interface LeasedPayloadRow extends IngestionJobRow {
  version_number: number;
  visibility: DocumentVisibility;
  location_id: string | null;
  source_filename: string;
  mime_type: DocumentMimeType;
  source_type: DocumentSourceType;
  byte_size: number;
  char_count: number;
  content_sha256: string;
  content_text: string;
}

const JOB_COLUMNS = `
  id, business_id, document_id, document_version_id, status,
  attempt_count, max_attempts, next_attempt_at, lease_token,
  leased_by, leased_at, lease_expires_at, last_error,
  completed_at, created_at, updated_at
`;

function mapJobRow(row: IngestionJobRow): IngestionJobRecord {
  return {
    id: row.id,
    businessId: row.business_id,
    documentId: row.document_id,
    documentVersionId: row.document_version_id,
    status: row.status,
    attemptCount: row.attempt_count,
    maxAttempts: row.max_attempts,
    nextAttemptAt: row.next_attempt_at,
    leaseToken: row.lease_token,
    leasedBy: row.leased_by,
    leasedAt: row.leased_at,
    leaseExpiresAt: row.lease_expires_at,
    lastError: row.last_error,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
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

export async function enqueueIngestionJob(
  client: PoolClient,
  businessId: string,
  documentId: string,
  documentVersionId: string,
  maxAttempts: number = 3,
): Promise<IngestionJobRecord> {
  const existingActive = await client.query<IngestionJobRow>(
    `SELECT ${JOB_COLUMNS}
     FROM document_ingestion_jobs
     WHERE business_id = $1
       AND document_version_id = $2
       AND status IN ('queued', 'leased')
     LIMIT 1`,
    [businessId, documentVersionId],
  );

  if (existingActive.rows[0]) {
    return mapJobRow(existingActive.rows[0]);
  }

  const inserted = await client.query<IngestionJobRow>(
    `INSERT INTO document_ingestion_jobs (
       business_id, document_id, document_version_id, status, attempt_count, max_attempts
     )
     VALUES ($1, $2, $3, 'queued', 0, $4)
     RETURNING ${JOB_COLUMNS}`,
    [businessId, documentId, documentVersionId, maxAttempts],
  );

  return mapJobRow(inserted.rows[0]!);
}

export async function cancelActiveIngestionJobsForDocument(
  client: PoolClient,
  businessId: string,
  documentId: string,
): Promise<void> {
  await client.query(
    `UPDATE document_ingestion_jobs
     SET status = 'cancelled',
         lease_token = NULL,
         lease_expires_at = NULL
     WHERE business_id = $1
       AND document_id = $2
       AND status IN ('queued', 'leased')`,
    [businessId, documentId],
  );
}

export async function cancelActiveIngestionJobsForUnindexedVersions(
  client: PoolClient,
  businessId: string,
  documentId: string,
): Promise<void> {
  await client.query(
    `UPDATE document_ingestion_jobs j
     SET status = 'cancelled',
         lease_token = NULL,
         lease_expires_at = NULL
     FROM document_versions dv
     WHERE j.business_id = $1
       AND j.document_id = $2
       AND j.status IN ('queued', 'leased')
       AND dv.business_id = j.business_id
       AND dv.id = j.document_version_id
       AND dv.status IN ('uploaded', 'failed', 'superseded')`,
    [businessId, documentId],
  );
}

async function expireExhaustedLeases(client: PoolClient): Promise<void> {
  const exhausted = await client.query<{
    id: string;
    business_id: string;
    document_id: string;
    document_version_id: string;
  }>(
    `UPDATE document_ingestion_jobs
     SET status = 'failed',
         lease_token = NULL,
         lease_expires_at = NULL,
         last_error = 'Ingestion job lease expired after maximum attempts.'
     WHERE id IN (
       SELECT id
       FROM document_ingestion_jobs
       WHERE status = 'leased'
         AND lease_expires_at <= CURRENT_TIMESTAMP
         AND attempt_count >= max_attempts
       FOR UPDATE SKIP LOCKED
     )
     RETURNING id, business_id, document_id, document_version_id`,
  );

  for (const row of exhausted.rows) {
    await client.query(
      `UPDATE document_versions
       SET status = 'failed',
           failure_reason = 'Ingestion job lease expired after maximum attempts.',
           indexed_at = NULL
       WHERE business_id = $1
         AND id = $2
         AND status IN ('uploaded', 'processing')`,
      [row.business_id, row.document_version_id],
    );

    await client.query(
      `UPDATE documents
       SET status = 'failed'
       WHERE business_id = $1
         AND id = $2
         AND active_version_id IS NULL
         AND deleted_at IS NULL`,
      [row.business_id, row.document_id],
    );
  }
}

export async function leaseNextIngestionJob(
  workerId: string,
  leaseDurationSeconds: number,
): Promise<LeasedIngestionJob | null> {
  return runInTransaction(async (client) => {
    await expireExhaustedLeases(client);

    const candidate = await client.query<{ id: string }>(
      `SELECT j.id
       FROM document_ingestion_jobs j
       JOIN documents d
         ON d.business_id = j.business_id AND d.id = j.document_id
       JOIN document_versions dv
         ON dv.business_id = j.business_id AND dv.id = j.document_version_id
       WHERE d.deleted_at IS NULL
         AND dv.status IN ('uploaded', 'processing')
         AND (
           (j.status = 'queued' AND j.next_attempt_at <= CURRENT_TIMESTAMP)
           OR (
             j.status = 'leased'
             AND j.lease_expires_at <= CURRENT_TIMESTAMP
             AND j.attempt_count < j.max_attempts
           )
         )
       ORDER BY j.next_attempt_at ASC, j.created_at ASC
       LIMIT 1
       FOR UPDATE OF j SKIP LOCKED`,
    );

    const selected = candidate.rows[0];
    if (!selected) {
      return null;
    }

    const leaseToken = randomUUID();
    const leasedJobResult = await client.query<IngestionJobRow>(
      `UPDATE document_ingestion_jobs
       SET status = 'leased',
           attempt_count = attempt_count + 1,
           lease_token = $2,
           leased_by = $3,
           leased_at = CURRENT_TIMESTAMP,
           lease_expires_at = CURRENT_TIMESTAMP + make_interval(secs => $4)
       WHERE id = $1
       RETURNING ${JOB_COLUMNS}`,
      [selected.id, leaseToken, workerId, leaseDurationSeconds],
    );

    const jobRow = leasedJobResult.rows[0]!;

    await client.query(
      `UPDATE document_versions
       SET status = 'processing'
       WHERE business_id = $1
         AND id = $2
         AND status = 'uploaded'`,
      [jobRow.business_id, jobRow.document_version_id],
    );

    await client.query(
      `UPDATE documents
       SET status = 'processing'
       WHERE business_id = $1
         AND id = $2
         AND active_version_id IS NULL
         AND deleted_at IS NULL`,
      [jobRow.business_id, jobRow.document_id],
    );

    const payloadResult = await client.query<LeasedPayloadRow>(
      `SELECT
         j.id, j.business_id, j.document_id, j.document_version_id, j.status,
         j.attempt_count, j.max_attempts, j.next_attempt_at, j.lease_token,
         j.leased_by, j.leased_at, j.lease_expires_at, j.last_error,
         j.completed_at, j.created_at, j.updated_at,
         dv.version_number, d.visibility, d.location_id,
         dv.source_filename, dv.mime_type, dv.source_type,
         dv.byte_size, dv.char_count, dv.content_sha256, dv.content_text
       FROM document_ingestion_jobs j
       JOIN documents d
         ON d.business_id = j.business_id AND d.id = j.document_id
       JOIN document_versions dv
         ON dv.business_id = j.business_id AND dv.id = j.document_version_id
       WHERE j.id = $1`,
      [jobRow.id],
    );

    const row = payloadResult.rows[0]!;

    return {
      job: mapJobRow(row),
      document: {
        versionNumber: row.version_number,
        visibility: row.visibility,
        locationId: row.location_id,
        sourceFilename: row.source_filename,
        mimeType: row.mime_type,
        sourceType: row.source_type,
        byteSize: row.byte_size,
        charCount: row.char_count,
        contentSha256: row.content_sha256,
        contentText: row.content_text,
      },
    };
  });
}

async function lockVerifiedLeasedJob(
  client: PoolClient,
  jobId: string,
  businessId: string,
  documentVersionId: string,
  leaseToken: string,
): Promise<IngestionJobRow> {
  const result = await client.query<IngestionJobRow>(
    `SELECT ${JOB_COLUMNS}
     FROM document_ingestion_jobs
     WHERE id = $1
     FOR UPDATE`,
    [jobId],
  );

  const row = result.rows[0];
  if (!row) {
    throw new HttpError(404, 'INGESTION_JOB_NOT_FOUND', 'Ingestion job was not found.');
  }

  if (row.business_id !== businessId || row.document_version_id !== documentVersionId) {
    throw new HttpError(403, 'TENANT_SCOPE_MISMATCH', 'Ingestion job does not match tenant or version scope.');
  }

  if (row.status !== 'leased' || row.lease_token !== leaseToken) {
    throw new HttpError(409, 'JOB_LEASE_LOST', 'Ingestion job lease is no longer active for this worker.');
  }

  if (!row.lease_expires_at || row.lease_expires_at.getTime() <= Date.now()) {
    throw new HttpError(409, 'JOB_LEASE_EXPIRED', 'Ingestion job lease has expired.');
  }

  return row;
}

export async function completeIngestionJob(
  jobId: string,
  input: CompleteJobInput,
): Promise<IngestionJobRecord> {
  return runInTransaction(async (client) => {
    const job = await lockVerifiedLeasedJob(
      client,
      jobId,
      input.businessId,
      input.documentVersionId,
      input.leaseToken,
    );

    const docMetaResult = await client.query<{
      location_id: string | null;
      visibility: DocumentVisibility;
      deleted_at: Date | null;
    }>(
      `SELECT location_id, visibility, deleted_at
       FROM documents
       WHERE business_id = $1 AND id = $2
       LIMIT 1`,
      [job.business_id, job.document_id],
    );

    const docMeta = docMetaResult.rows[0];
    if (!docMeta || docMeta.deleted_at !== null) {
      throw new HttpError(409, 'DOCUMENT_DELETED', 'Cannot store chunks for a deleted document.');
    }

    // Replace any prior chunks for this version so retries/reprocessing are idempotent.
    await client.query(
      `DELETE FROM document_chunks
       WHERE business_id = $1 AND document_version_id = $2`,
      [job.business_id, job.document_version_id],
    );

    const { chunking } = input;
    for (const chunk of chunking.chunks) {
      await client.query(
        `INSERT INTO document_chunks (
           id, business_id, document_id, document_version_id,
           location_id, visibility, chunk_version, chunk_index,
           heading_path, char_start, char_end, char_count,
           content_sha256, chunk_text
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        [
          chunk.chunkId,
          job.business_id,
          job.document_id,
          job.document_version_id,
          docMeta.location_id,
          docMeta.visibility,
          chunking.chunkVersion,
          chunk.chunkIndex,
          chunk.headingPath,
          chunk.charStart,
          chunk.charEnd,
          chunk.charCount,
          chunk.contentSha256,
          chunk.chunkText,
        ],
      );
    }

    await client.query(
      `UPDATE document_versions
       SET chunk_version = $3,
           chunk_count = $4,
           normalized_char_count = $5,
           normalized_sha256 = $6
       WHERE business_id = $1 AND id = $2`,
      [
        job.business_id,
        job.document_version_id,
        chunking.chunkVersion,
        chunking.chunks.length,
        chunking.normalizedCharCount,
        chunking.normalizedSha256,
      ],
    );

    // Note: Completing a 05.03 chunking job does NOT mark document_versions as 'ready'
    // or set indexed_at; actual vector indexing occurs in Phase 06.
    const updated = await client.query<IngestionJobRow>(
      `UPDATE document_ingestion_jobs
       SET status = 'completed',
           lease_token = NULL,
           lease_expires_at = NULL,
           last_error = NULL,
           completed_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING ${JOB_COLUMNS}`,
      [jobId],
    );

    return mapJobRow(updated.rows[0]!);
  });
}

export async function failIngestionJob(
  jobId: string,
  input: FailJobInput,
): Promise<IngestionJobRecord> {
  return runInTransaction(async (client) => {
    const job = await lockVerifiedLeasedJob(
      client,
      jobId,
      input.businessId,
      input.documentVersionId,
      input.leaseToken,
    );

    const canRetry = input.retryable && job.attempt_count < job.max_attempts;

    if (canRetry) {
      const requeued = await client.query<IngestionJobRow>(
        `UPDATE document_ingestion_jobs
         SET status = 'queued',
             lease_token = NULL,
             lease_expires_at = NULL,
             last_error = $2,
             next_attempt_at = CURRENT_TIMESTAMP + make_interval(secs => $3)
         WHERE id = $1
         RETURNING ${JOB_COLUMNS}`,
        [jobId, input.errorMessage, input.retryDelaySeconds],
      );

      return mapJobRow(requeued.rows[0]!);
    }

    const failedJob = await client.query<IngestionJobRow>(
      `UPDATE document_ingestion_jobs
       SET status = 'failed',
           lease_token = NULL,
           lease_expires_at = NULL,
           last_error = $2
       WHERE id = $1
       RETURNING ${JOB_COLUMNS}`,
      [jobId, input.errorMessage],
    );

    await client.query(
      `UPDATE document_versions
       SET status = 'failed',
           failure_reason = $3,
           indexed_at = NULL
       WHERE business_id = $1
         AND id = $2
         AND status IN ('uploaded', 'processing')`,
      [job.business_id, job.document_version_id, input.errorMessage],
    );

    await client.query(
      `UPDATE documents
       SET status = 'failed'
       WHERE business_id = $1
         AND id = $2
         AND active_version_id IS NULL
         AND deleted_at IS NULL`,
      [job.business_id, job.document_id],
    );

    return mapJobRow(failedJob.rows[0]!);
  });
}

export async function listDocumentIngestionJobs(
  businessId: string,
  documentId: string,
): Promise<IngestionJobRecord[]> {
  const docExists = await postgresPool.query<{ id: string }>(
    `SELECT id
     FROM documents
     WHERE business_id = $1 AND id = $2
     LIMIT 1`,
    [businessId, documentId],
  );

  if (docExists.rows.length === 0) {
    throw new HttpError(404, 'DOCUMENT_NOT_FOUND', 'Document was not found.');
  }

  const result = await postgresPool.query<IngestionJobRow>(
    `SELECT ${JOB_COLUMNS}
     FROM document_ingestion_jobs
     WHERE business_id = $1 AND document_id = $2
     ORDER BY created_at DESC, id DESC`,
    [businessId, documentId],
  );

  return result.rows.map(mapJobRow);
}

