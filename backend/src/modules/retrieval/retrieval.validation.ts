import { HttpError } from '../../utils/http-error.js';
import { validateUuid } from '../auth/auth.validation.js';
import {
  DOCUMENT_VISIBILITIES,
  type DocumentVisibility,
} from '../documents/documents.types.js';
import type {
  KnowledgeSearchInput,
  RetrievalCandidateInput,
  ValidateRetrievalCandidatesInput,
} from './retrieval.types.js';

const VALIDATE_FIELDS = new Set([
  'businessId',
  'allowedVisibilities',
  'allowedLocationIds',
  'includeBusinessWide',
  'candidates',
]);
const CANDIDATE_FIELDS = new Set([
  'documentId',
  'documentVersionId',
  'chunkId',
  'score',
]);
const SEARCH_FIELDS = new Set([
  'query',
  'topK',
  'scoreThreshold',
  'locationId',
  'assistantId',
]);

function assertPlainObject(value: unknown, message: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new HttpError(400, 'VALIDATION_ERROR', message);
  }
  return value as Record<string, unknown>;
}

function assertAllowedFields(record: Record<string, unknown>, allowed: ReadonlySet<string>): void {
  if (Object.keys(record).some((key) => !allowed.has(key))) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Request body contains unsupported fields.');
  }
}

export function validateRetrievalCandidatesInput(
  body: unknown,
): ValidateRetrievalCandidatesInput {
  const record = assertPlainObject(body, 'Request body must be a JSON object.');
  assertAllowedFields(record, VALIDATE_FIELDS);

  const businessId = validateUuid(record.businessId, 'businessId');

  if (!Array.isArray(record.allowedVisibilities) || record.allowedVisibilities.length < 1 || record.allowedVisibilities.length > 2) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'allowedVisibilities must contain 1 or 2 visibilities.');
  }
  const allowedVisibilities = Array.from(
    new Set(
      record.allowedVisibilities.map((item) => {
        if (typeof item !== 'string' || !DOCUMENT_VISIBILITIES.includes(item as DocumentVisibility)) {
          throw new HttpError(400, 'VALIDATION_ERROR', 'allowedVisibilities contains an invalid value.');
        }
        return item as DocumentVisibility;
      }),
    ),
  );

  let allowedLocationIds: string[] | null = null;
  if (record.allowedLocationIds !== undefined && record.allowedLocationIds !== null) {
    if (!Array.isArray(record.allowedLocationIds) || record.allowedLocationIds.length > 50) {
      throw new HttpError(400, 'VALIDATION_ERROR', 'allowedLocationIds must be an array of at most 50 UUIDs.');
    }
    allowedLocationIds = Array.from(
      new Set(record.allowedLocationIds.map((id) => validateUuid(id, 'allowedLocationIds'))),
    );
  }

  const includeBusinessWide = record.includeBusinessWide ?? true;
  if (typeof includeBusinessWide !== 'boolean') {
    throw new HttpError(400, 'VALIDATION_ERROR', 'includeBusinessWide must be a boolean.');
  }

  if (!Array.isArray(record.candidates) || record.candidates.length > 50) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'candidates must be an array of at most 50 items.');
  }

  const candidates: RetrievalCandidateInput[] = record.candidates.map((item) => {
    const candidate = assertPlainObject(item, 'Each candidate must be a JSON object.');
    assertAllowedFields(candidate, CANDIDATE_FIELDS);
    if (
      typeof candidate.score !== 'number' ||
      !Number.isFinite(candidate.score) ||
      candidate.score < -1 ||
      candidate.score > 1.0001
    ) {
      throw new HttpError(400, 'VALIDATION_ERROR', 'Candidate score must be a finite number.');
    }
    return {
      documentId: validateUuid(candidate.documentId, 'documentId'),
      documentVersionId: validateUuid(candidate.documentVersionId, 'documentVersionId'),
      chunkId: validateUuid(candidate.chunkId, 'chunkId'),
      score: candidate.score,
    };
  });

  return {
    businessId,
    allowedVisibilities,
    allowedLocationIds,
    includeBusinessWide,
    candidates,
  };
}

export function validateKnowledgeSearchInput(body: unknown): KnowledgeSearchInput {
  const record = assertPlainObject(body, 'Request body must be a JSON object.');
  assertAllowedFields(record, SEARCH_FIELDS);

  if (typeof record.query !== 'string') {
    throw new HttpError(400, 'VALIDATION_ERROR', 'query must be a string.');
  }
  const query = record.query.trim();
  if (query.length < 1 || query.length > 2000) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'query must be between 1 and 2000 characters.');
  }

  const result: KnowledgeSearchInput = { query };

  if (record.topK !== undefined) {
    if (
      typeof record.topK !== 'number' ||
      !Number.isInteger(record.topK) ||
      record.topK < 1 ||
      record.topK > 20
    ) {
      throw new HttpError(400, 'VALIDATION_ERROR', 'topK must be an integer between 1 and 20.');
    }
    result.topK = record.topK;
  }

  if (record.scoreThreshold !== undefined) {
    if (
      typeof record.scoreThreshold !== 'number' ||
      !Number.isFinite(record.scoreThreshold) ||
      record.scoreThreshold < 0 ||
      record.scoreThreshold > 1
    ) {
      throw new HttpError(400, 'VALIDATION_ERROR', 'scoreThreshold must be a number between 0 and 1.');
    }
    result.scoreThreshold = record.scoreThreshold;
  }

  if (record.locationId !== undefined) {
    result.locationId =
      record.locationId === null ? null : validateUuid(record.locationId, 'locationId');
  }

  if (record.assistantId !== undefined) {
    result.assistantId = validateUuid(record.assistantId, 'assistantId');
  }

  return result;
}

