export const DOCUMENT_VISIBILITIES = ['public', 'staff_only'] as const;
export type DocumentVisibility = (typeof DOCUMENT_VISIBILITIES)[number];

export const DOCUMENT_STATUSES = [
  'uploaded',
  'processing',
  'ready',
  'failed',
  'deleted',
] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

export const DOCUMENT_VERSION_STATUSES = [
  'uploaded',
  'processing',
  'ready',
  'failed',
  'superseded',
  'deleted',
] as const;
export type DocumentVersionStatus = (typeof DOCUMENT_VERSION_STATUSES)[number];

export const DOCUMENT_SOURCE_TYPES = ['txt', 'markdown'] as const;
export type DocumentSourceType = (typeof DOCUMENT_SOURCE_TYPES)[number];

export const DOCUMENT_MIME_TYPES = ['text/plain', 'text/markdown'] as const;
export type DocumentMimeType = (typeof DOCUMENT_MIME_TYPES)[number];

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
  deletedAt: Date | null;
  deletedByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface DocumentVersionSummary {
  id: string;
  documentId: string;
  businessId: string;
  versionNumber: number;
  status: DocumentVersionStatus;
  sourceFilename: string;
  mimeType: DocumentMimeType;
  sourceType: DocumentSourceType;
  encoding: 'utf-8';
  byteSize: number;
  charCount: number;
  contentSha256: string;
  chunkVersion: string | null;
  chunkCount: number;
  normalizedCharCount: number | null;
  normalizedSha256: string | null;
  failureReason: string | null;
  indexedAt: Date | null;
  createdByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface DocumentVersion extends DocumentVersionSummary {
  contentText: string;
}

export interface DocumentWithLatestVersion {
  document: DocumentRecord;
  latestVersion: DocumentVersionSummary | null;
}

export interface DocumentDetail {
  document: DocumentRecord;
  versions: DocumentVersionSummary[];
}

export interface RawDocumentUploadInput {
  filename: string;
  mimeType: string | null;
  bytes: Uint8Array;
  title?: unknown;
  visibility?: unknown;
  locationId?: unknown;
}

export interface ValidatedDocumentContent {
  sourceFilename: string;
  mimeType: DocumentMimeType;
  sourceType: DocumentSourceType;
  encoding: 'utf-8';
  byteSize: number;
  charCount: number;
  contentSha256: string;
  contentText: string;
}

export interface CreateDocumentInput extends ValidatedDocumentContent {
  title: string;
  visibility: DocumentVisibility;
  locationId: string | null;
}

export interface ReplaceDocumentVersionInput extends ValidatedDocumentContent {}

export interface UpdateDocumentInput {
  title?: string;
  visibility?: DocumentVisibility;
  locationId?: string | null;
}

export interface ListDocumentsFilter {
  visibility?: DocumentVisibility | undefined;
  status?: DocumentStatus | undefined;
  locationId?: string | undefined;
  includeDeleted: boolean;
}

export interface DocumentChunkRecord {
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
  createdAt: Date;
}
