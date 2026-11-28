export const VECTOR_CLEANUP_JOB_TYPES = [
  'delete_document',
  'delete_version',
  'sync_metadata',
] as const;
export type VectorCleanupJobType = (typeof VECTOR_CLEANUP_JOB_TYPES)[number];

export const VECTOR_CLEANUP_JOB_STATUSES = [
  'queued',
  'leased',
  'completed',
  'failed',
] as const;
export type VectorCleanupJobStatus = (typeof VECTOR_CLEANUP_JOB_STATUSES)[number];

export interface VectorCleanupJobRecord {
  id: string;
  businessId: string;
  documentId: string;
  documentVersionId: string | null;
  qdrantCollection: string | null;
  jobType: VectorCleanupJobType;
  payload: Record<string, unknown>;
  status: VectorCleanupJobStatus;
  attemptCount: number;
  maxAttempts: number;
  nextAttemptAt: Date;
  leaseToken: string | null;
  leasedBy: string | null;
  leasedAt: Date | null;
  leaseExpiresAt: Date | null;
  lastError: string | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface EnqueueVectorCleanupJobInput {
  businessId: string;
  documentId: string;
  documentVersionId?: string | null;
  qdrantCollection?: string | null;
  jobType: VectorCleanupJobType;
  payload?: Record<string, unknown>;
  maxAttempts?: number;
}

export interface CompleteCleanupJobInput {
  leaseToken: string;
  businessId: string;
  documentId: string;
}

export interface FailCleanupJobInput {
  leaseToken: string;
  businessId: string;
  documentId: string;
  errorMessage: string;
  retryable: boolean;
  retryDelaySeconds: number;
}

export interface KnowledgeCacheEpochRecord {
  businessId: string;
  knowledgeEpoch: number;
  lastInvalidatedAt: Date | null;
  lastReason: string;
}

