import type {
  DocumentMimeType,
  DocumentSourceType,
  DocumentVisibility,
} from '../documents/documents.types.js';

export interface RetrievalCandidateInput {
  documentId: string;
  documentVersionId: string;
  chunkId: string;
  score: number;
}

export interface ValidateRetrievalCandidatesInput {
  businessId: string;
  allowedVisibilities: DocumentVisibility[];
  allowedLocationIds: string[] | null;
  includeBusinessWide: boolean;
  candidates: RetrievalCandidateInput[];
}

export interface RetrievalCitation {
  documentId: string;
  documentVersionId: string;
  chunkId: string;
  title: string;
  sourceFilename: string;
  versionNumber: number;
  headingPath: string[];
}

export interface ValidatedRetrievalResult {
  chunkId: string;
  documentId: string;
  documentVersionId: string;
  chunkIndex: number;
  score: number;
  chunkText: string;
  title: string;
  sourceFilename: string;
  sourceType: DocumentSourceType;
  mimeType: DocumentMimeType;
  versionNumber: number;
  visibility: DocumentVisibility;
  locationId: string | null;
  chunkVersion: string;
  headingPath: string[];
  charStart: number;
  charEnd: number;
  citation: RetrievalCitation;
}

export interface KnowledgeSearchInput {
  query: string;
  topK?: number;
  scoreThreshold?: number;
  locationId?: string | null;
  assistantId?: string;
}

export interface ResolvedSearchScope {
  businessId: string;
  allowedVisibilities: DocumentVisibility[];
  allowedLocationIds: string[] | null;
  includeBusinessWide: boolean;
}

