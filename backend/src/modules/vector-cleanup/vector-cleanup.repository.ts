import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { postgresPool } from '../../integrations/database/postgres.js';
import { HttpError } from '../../utils/http-error.js';
import type {
  CompleteCleanupJobInput,
  EnqueueVectorCleanupJobInput,
  FailCleanupJobInput,
  KnowledgeCacheEpochRecord,
  VectorCleanupJobRecord,
  VectorCleanupJobStatus,
  VectorCleanupJobType,
} from './vector-cleanup.types.js';

interface VectorCleanupJobRow {
  id: string;
  business_id: string;
  document_id: string;
  document_version_id: string | null;
  qdrant_collection: string | null;
  job_type: VectorCleanupJobType;
  payload_json: Record<string, unknown>;
  status: VectorCleanupJobStatus;
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

const CLEANUP_COLUMNS = `
  id, business_id, document_id, document_version_id, qdrant_collection,
  job_type, payload_json, status, attempt_count, max_attempts,
  next_attempt_at, lease_token, leased_by, leased_at, lease_expires_at,
  last_error, completed_at, created_at, updated_at
`;

function mapCleanupRow(row: VectorCleanupJobRow): VectorCleanupJobRecord {
  return {
    id: row.id,
    businessId: row.business_id,
    documentId: row.document_id,
    documentVersionId: row.document_version_id,
    qdrantCollection: row.qdrant_collection,
    jobType: row.job_type,
    payload: row.payload_json ?? {},
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

export async function enqueueVectorCleanupJob(
  client: PoolClient,
  input: EnqueueVectorCleanupJobInput,
): Promise<VectorCleanupJobRecord> {
  const inserted = await client.query<VectorCleanupJobRow>(
    `INSERT INTO vector_cleanup_jobs (
       business_id, document_id, document_version_id, qdrant_collection,
       job_type, payload_json, status, attempt_count, max_attempts
     )
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, 'queued', 0, $7)
     RETURNING ${CLEANUP_COLUMNS}`,
    [
      input.businessId,
      input.documentId,
      input.documentVersionId ?? null,
      input.qdrantCollection ?? null,
      input.jobType,
      JSON.stringify(input.payload ?? {}),
      input.maxAttempts ?? 5,
    ],
  );
  return mapCleanupRow(inserted.rows[0]!);
}

export async function bumpKnowledgeEpoch(
  client: PoolClient,
  businessId: string,
  reason: string,
): Promise<KnowledgeCacheEpochRecord> {
  const res = await client.query<{
    business_id: string;
    knowledge_epoch: string;
    last_invalidated_at: Date;
    last_reason: string;
  }>(
    `INSERT INTO business_knowledge_versions (
       business_id, knowledge_epoch, last_invalidated_at, last_reason
     )
     VALUES ($1, 2, CURRENT_TIMESTAMP, $2)
     ON CONFLICT (business_id) DO UPDATE
       SET knowledge_epoch = business_knowledge_versions.knowledge_epoch + 1,
           last_invalidated_at = CURRENT_TIMESTAMP,
           last_reason = EXCLUDED.last_reason
     RETURNING business_id, knowledge_epoch, last_invalidated_at, last_reason`,
    [businessId, reason],
  );
  const row = res.rows[0]!;
  return {
    businessId: row.business_id,
    knowledgeEpoch: Number(row.knowledge_epoch),
    lastInvalidatedAt: row.last_invalidated_at,
    lastReason: row.last_reason,
  };
}

export async function getBusinessKnowledgeEpoch(
  businessId: string,
): Promise<KnowledgeCacheEpochRecord> {
  const res = await postgresPool.query<{
    business_id: string;
    knowledge_epoch: string;
    last_invalidated_at: Date;
    last_reason: string;
  }>(
    `SELECT business_id, knowledge_epoch, last_invalidated_at, last_reason
     FROM business_knowledge_versions
     WHERE business_id = $1
     LIMIT 1`,
    [businessId],
  );
  const row = res.rows[0];
  if (!row) {
    return {
      businessId,
      knowledgeEpoch: 1,
      lastInvalidatedAt: null,
      lastReason: 'initialized',
    };
  }
  return {
    businessId: row.business_id,
    knowledgeEpoch: Number(row.knowledge_epoch),
    lastInvalidatedAt: row.last_invalidated_at,
    lastReason: row.last_reason,
  };
}

export async function leaseNextVectorCleanupJob(
  workerId: string,
  leaseDurationSeconds: number,
): Promise<VectorCleanupJobRecord | null> {
  return runInTransaction(async (client) => {
    await client.query(
      `UPDATE vector_cleanup_jobs
       SET status = 'failed',
           lease_token = NULL,
           lease_expires_at = NULL,
           last_error = 'Cleanup job lease expired after maximum attempts.'
       WHERE id IN (
         SELECT id
         FROM vector_cleanup_jobs
         WHERE status = 'leased'
           AND lease_expires_at <= CURRENT_TIMESTAMP
           AND attempt_count >= max_attempts
         FOR UPDATE SKIP LOCKED
       )`,
    );

    const candidate = await client.query<{ id: string }>(
      `SELECT id
       FROM vector_cleanup_jobs
       WHERE (
         (status = 'queued' AND next_attempt_at <= CURRENT_TIMESTAMP)
         OR (
           status = 'leased'
           AND lease_expires_at <= CURRENT_TIMESTAMP
           AND attempt_count < max_attempts
         )
       )
       ORDER BY next_attempt_at ASC, created_at ASC
       LIMIT 1
       FOR UPDATE SKIP LOCKED`,
    );

    const selected = candidate.rows[0];
    if (!selected) {
      return null;
    }

    const leaseToken = randomUUID();
    const leased = await client.query<VectorCleanupJobRow>(
      `UPDATE vector_cleanup_jobs
       SET status = 'leased',
           attempt_count = attempt_count + 1,
           lease_token = $2,
           leased_by = $3,
           leased_at = CURRENT_TIMESTAMP,
           lease_expires_at = CURRENT_TIMESTAMP + make_interval(secs => $4)
       WHERE id = $1
       RETURNING ${CLEANUP_COLUMNS}`,
      [selected.id, leaseToken, workerId, leaseDurationSeconds],
    );

    return mapCleanupRow(leased.rows[0]!);
  });
}

async function lockVerifiedCleanupJob(
  client: PoolClient,
  jobId: string,
  businessId: string,
  documentId: string,
  leaseToken: string,
): Promise<VectorCleanupJobRow> {
  const result = await client.query<VectorCleanupJobRow>(
    `SELECT ${CLEANUP_COLUMNS}
     FROM vector_cleanup_jobs
     WHERE id = $1
     FOR UPDATE`,
    [jobId],
  );
  const row = result.rows[0];
  if (!row) {
    throw new HttpError(404, 'CLEANUP_JOB_NOT_FOUND', 'Vector cleanup job was not found.');
  }
  if (row.business_id !== businessId || row.document_id !== documentId) {
    throw new HttpError(403, 'TENANT_SCOPE_MISMATCH', 'Cleanup job does not match tenant or document scope.');
  }
  if (row.status !== 'leased' || row.lease_token !== leaseToken) {
    throw new HttpError(409, 'JOB_LEASE_LOST', 'Cleanup job lease is no longer active for this worker.');
  }
  if (!row.lease_expires_at || row.lease_expires_at.getTime() <= Date.now()) {
    throw new HttpError(409, 'JOB_LEASE_EXPIRED', 'Cleanup job lease has expired.');
  }
  return row;
}

export async function completeVectorCleanupJob(
  jobId: string,
  input: CompleteCleanupJobInput,
): Promise<VectorCleanupJobRecord> {
  return runInTransaction(async (client) => {
    await lockVerifiedCleanupJob(
      client,
      jobId,
      input.businessId,
      input.documentId,
      input.leaseToken,
    );
    const updated = await client.query<VectorCleanupJobRow>(
      `UPDATE vector_cleanup_jobs
       SET status = 'completed',
           lease_token = NULL,
           lease_expires_at = NULL,
           last_error = NULL,
           completed_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING ${CLEANUP_COLUMNS}`,
      [jobId],
    );
    return mapCleanupRow(updated.rows[0]!);
  });
}

export async function failVectorCleanupJob(
  jobId: string,
  input: FailCleanupJobInput,
): Promise<VectorCleanupJobRecord> {
  return runInTransaction(async (client) => {
    const job = await lockVerifiedCleanupJob(
      client,
      jobId,
      input.businessId,
      input.documentId,
      input.leaseToken,
    );
    const canRetry = input.retryable && job.attempt_count < job.max_attempts;
    if (canRetry) {
      const requeued = await client.query<VectorCleanupJobRow>(
        `UPDATE vector_cleanup_jobs
         SET status = 'queued',
             lease_token = NULL,
             lease_expires_at = NULL,
             last_error = $2,
             next_attempt_at = CURRENT_TIMESTAMP + make_interval(secs => $3)
         WHERE id = $1
         RETURNING ${CLEANUP_COLUMNS}`,
        [jobId, input.errorMessage, input.retryDelaySeconds],
      );
      return mapCleanupRow(requeued.rows[0]!);
    }

    const failed = await client.query<VectorCleanupJobRow>(
      `UPDATE vector_cleanup_jobs
       SET status = 'failed',
           lease_token = NULL,
           lease_expires_at = NULL,
           last_error = $2
       WHERE id = $1
       RETURNING ${CLEANUP_COLUMNS}`,
      [jobId, input.errorMessage],
    );
    return mapCleanupRow(failed.rows[0]!);
  });
}

