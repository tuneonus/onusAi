import type { DocumentMimeType, DocumentSourceType, DocumentVisibility } from '../documents/documents.types.js';

export const INGESTION_JOB_STATUSES = [
  'queued',
  'leased',
  'completed',
  'failed',
  'cancelled',
] as const;
export type IngestionJobStatus = (typeof INGESTION_JOB_STATUSES)[number];

export interface IngestionJobRecord {
  id: string;
  businessId: string;
  documentId: string;
  documentVersionId: string;
  status: IngestionJobStatus;
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

export interface LeasedDocumentPayload {
  versionNumber: number;
  visibility: DocumentVisibility;
  locationId: string | null;
  sourceFilename: string;
  mimeType: DocumentMimeType;
  sourceType: DocumentSourceType;
  byteSize: number;
  charCount: number;
  contentSha256: string;
  contentText: string;
  existingChunkVersion?: string | null;
  existingNormalizedCharCount?: number | null;
  existingNormalizedSha256?: string | null;
  existingChunks?: DocumentChunkInput[] | null;
}

export interface LeasedIngestionJob {
  job: IngestionJobRecord;
  document: LeasedDocumentPayload;
}

export interface LeaseJobInput {
  workerId: string;
  leaseDurationSeconds: number;
}

export interface DocumentChunkInput {
  chunkId: string;
  chunkIndex: number;
  headingPath: string[];
  charStart: number;
  charEnd: number;
  charCount: number;
  contentSha256: string;
  chunkText: string;
}

export interface ChunkingPayloadInput {
  chunkVersion: string;
  chunkMaxChars: number;
  chunkOverlapChars: number;
  normalizedCharCount: number;
  normalizedSha256: string;
  chunks: DocumentChunkInput[];
}

export interface IndexingPayloadInput {
  embeddingModel: string;
  embeddingModelVersion: string;
  embeddingDimensions: number;
  qdrantCollection: string;
  indexedChunkCount: number;
}

export interface CompleteJobInput {
  leaseToken: string;
  businessId: string;
  documentVersionId: string;
  chunking: ChunkingPayloadInput;
  indexing?: IndexingPayloadInput;
}

export interface FailJobInput {
  leaseToken: string;
  businessId: string;
  documentVersionId: string;
  errorMessage: string;
  retryable: boolean;
  retryDelaySeconds: number;
}

