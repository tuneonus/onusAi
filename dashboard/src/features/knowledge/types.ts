export type DocumentVisibility = 'public' | 'staff_only';
export type DocumentStatus = 'uploaded' | 'processing' | 'ready' | 'failed' | 'deleted';
export type DocumentVersionStatus =
  | 'uploaded'
  | 'processing'
  | 'ready'
  | 'failed'
  | 'superseded'
  | 'deleted';
export type IngestionJobStatus = 'queued' | 'leased' | 'completed' | 'failed' | 'cancelled';

export interface DocumentRecord {
  id: string;
  businessId: string;
  locationId: string | null;
  title: string;
  visibility: DocumentVisibility;
  status: DocumentStatus;
  currentVersionNumber: number;
  activeVersionId: string | null;
  createdByUserId: string | null;
  deletedAt: string | null;
  deletedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentVersionSummary {
  id: string;
  documentId: string;
  businessId: string;
  versionNumber: number;
  status: DocumentVersionStatus;
  sourceFilename: string;
  mimeType: 'text/plain' | 'text/markdown';
  sourceType: 'txt' | 'markdown';
  encoding: 'utf-8';
  byteSize: number;
  charCount: number;
  contentSha256: string;
  chunkVersion: string | null;
  chunkCount: number;
  normalizedCharCount: number | null;
  normalizedSha256: string | null;
  embeddingModel?: string | null;
  embeddingModelVersion?: string | null;
  embeddingDimensions?: number | null;
  qdrantCollection?: string | null;
  failureReason: string | null;
  indexedAt: string | null;
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentVersion extends DocumentVersionSummary {
  contentText: string;
}

export interface DocumentListItem extends DocumentRecord {
  latestVersion: DocumentVersionSummary | null;
}

export interface DocumentDetail {
  document: DocumentRecord;
  versions: DocumentVersionSummary[];
}

export interface DocumentIngestionJob {
  id: string;
  businessId: string;
  documentId: string;
  documentVersionId: string;
  status: IngestionJobStatus;
  attemptCount: number;
  maxAttempts: number;
  nextAttemptAt: string;
  leasedBy: string | null;
  leasedAt: string | null;
  leaseExpiresAt: string | null;
  lastError: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentChunk {
  id: string;
  businessId: string;
  documentId: string;
  documentVersionId: string;
  locationId: string | null;
  visibility: DocumentVisibility;
  chunkVersion: string;
  chunkIndex: number;
  headingPath: string[];
  charStart: number;
  charEnd: number;
  charCount: number;
  contentSha256: string;
  chunkText: string;
  createdAt: string;
}

export interface DocumentProcessingStatus {
  document: DocumentRecord;
  latestVersion: DocumentVersionSummary | null;
  latestJob: DocumentIngestionJob | null;
}

export interface DocumentListFilter {
  visibility?: DocumentVisibility;
  status?: DocumentStatus;
  locationId?: string;
  includeDeleted?: boolean;
}

export interface KnowledgeOverviewMetrics {
  totalActive: number;
  publicCount: number;
  staffOnlyCount: number;
  processingOrUploadedCount: number;
  failedCount: number;
  deletedCount: number;
  totalChunks: number;
}

export interface KnowledgeSearchCitation {
  documentId: string;
  documentVersionId: string;
  chunkId: string;
  title: string;
  sourceFilename: string;
  versionNumber: number;
  headingPath: string[];
}

export interface KnowledgeSearchResult {
  chunkId: string;
  documentId: string;
  documentVersionId: string;
  chunkIndex: number;
  score: number;
  chunkText: string;
  title: string;
  sourceFilename: string;
  sourceType: 'txt' | 'markdown';
  mimeType: 'text/plain' | 'text/markdown';
  versionNumber: number;
  visibility: DocumentVisibility;
  locationId: string | null;
  chunkVersion: string;
  headingPath: string[];
  charStart: number;
  charEnd: number;
  citation: KnowledgeSearchCitation;
}

export interface KnowledgeSearchResponse {
  requestId: string;
  embeddingModel: string;
  embeddingModelVersion: string;
  embeddingDimensions: number;
  qdrantCollection: string;
  candidateCount: number;
  results: KnowledgeSearchResult[];
}

