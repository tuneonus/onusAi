import { createHash } from 'node:crypto';
import { HttpError } from '../../utils/http-error.js';
import { validateUuid } from '../auth/auth.validation.js';
import type {
  ChunkingPayloadInput,
  CompleteJobInput,
  DocumentChunkInput,
  FailJobInput,
  LeaseJobInput,
} from './ingestion-jobs.types.js';

const LEASE_FIELDS = new Set(['workerId', 'leaseDurationSeconds']);
const COMPLETE_FIELDS = new Set(['leaseToken', 'businessId', 'documentVersionId', 'chunking']);
const CHUNKING_FIELDS = new Set([
  'chunkVersion',
  'chunkMaxChars',
  'chunkOverlapChars',
  'normalizedCharCount',
  'normalizedSha256',
  'chunks',
]);
const CHUNK_FIELDS = new Set([
  'chunkId',
  'chunkIndex',
  'headingPath',
  'charStart',
  'charEnd',
  'charCount',
  'contentSha256',
  'chunkText',
]);
const CHUNK_VERSION_PATTERN = /^[A-Za-z0-9._-]+$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const FAIL_FIELDS = new Set([
  'leaseToken',
  'businessId',
  'documentVersionId',
  'errorMessage',
  'retryable',
  'retryDelaySeconds',
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

export function validateLeaseJobInput(body: unknown): LeaseJobInput {
  const record = assertPlainObject(body, 'Request body must be a JSON object.');
  assertAllowedFields(record, LEASE_FIELDS);

  if (typeof record.workerId !== 'string') {
    throw new HttpError(400, 'VALIDATION_ERROR', 'workerId must be a string.');
  }

  const workerId = record.workerId.trim();
  if (workerId.length < 1 || workerId.length > 120) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'workerId must be between 1 and 120 characters.');
  }

  const leaseDurationSeconds = record.leaseDurationSeconds ?? 60;
  if (
    typeof leaseDurationSeconds !== 'number' ||
    !Number.isInteger(leaseDurationSeconds) ||
    leaseDurationSeconds < 1 ||
    leaseDurationSeconds > 300
  ) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'leaseDurationSeconds must be an integer between 1 and 300.',
    );
  }

  return { workerId, leaseDurationSeconds };
}

function validateChunkItem(raw: unknown, expectedIndex: number): DocumentChunkInput {
  const record = assertPlainObject(raw, 'Each chunk must be a JSON object.');
  assertAllowedFields(record, CHUNK_FIELDS);

  const chunkId = validateUuid(record.chunkId, 'chunkId');
  const chunkIndex = record.chunkIndex;

  if (typeof chunkIndex !== 'number' || !Number.isInteger(chunkIndex) || chunkIndex !== expectedIndex) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'chunkIndex values must be sequential starting at 0.');
  }

  if (!Array.isArray(record.headingPath) || record.headingPath.length > 10) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'headingPath must be an array of at most 10 strings.');
  }

  const headingPath = record.headingPath.map((item) => {
    if (typeof item !== 'string' || item.trim().length < 1 || item.trim().length > 200) {
      throw new HttpError(400, 'VALIDATION_ERROR', 'Each headingPath entry must be 1 to 200 characters.');
    }
    return item.trim();
  });

  const { charStart, charEnd, charCount, contentSha256, chunkText } = record;

  if (
    typeof charStart !== 'number' ||
    !Number.isInteger(charStart) ||
    charStart < 0 ||
    typeof charEnd !== 'number' ||
    !Number.isInteger(charEnd) ||
    charEnd <= charStart ||
    typeof charCount !== 'number' ||
    !Number.isInteger(charCount) ||
    charCount !== charEnd - charStart
  ) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Chunk character offsets are invalid.');
  }

  if (typeof chunkText !== 'string' || chunkText.length !== charCount || chunkText.trim().length === 0) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'chunkText must match charCount and not be blank.');
  }

  if (Buffer.byteLength(chunkText, 'utf8') > 65_536) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'chunkText exceeds maximum chunk byte size.');
  }

  if (typeof contentSha256 !== 'string' || !SHA256_PATTERN.test(contentSha256)) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'contentSha256 must be a lowercase SHA-256 hex digest.');
  }

  const actualSha = createHash('sha256').update(chunkText, 'utf8').digest('hex');
  if (actualSha !== contentSha256) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Chunk contentSha256 does not match chunkText.');
  }

  return {
    chunkId,
    chunkIndex,
    headingPath,
    charStart,
    charEnd,
    charCount,
    contentSha256,
    chunkText,
  };
}

function validateChunkingPayload(raw: unknown): ChunkingPayloadInput {
  const record = assertPlainObject(raw, 'chunking must be a JSON object.');
  assertAllowedFields(record, CHUNKING_FIELDS);

  if (
    typeof record.chunkVersion !== 'string' ||
    record.chunkVersion.length < 1 ||
    record.chunkVersion.length > 64 ||
    !CHUNK_VERSION_PATTERN.test(record.chunkVersion)
  ) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'chunkVersion is invalid.');
  }

  const { chunkMaxChars, chunkOverlapChars, normalizedCharCount, normalizedSha256, chunks } = record;

  if (
    typeof chunkMaxChars !== 'number' ||
    !Number.isInteger(chunkMaxChars) ||
    chunkMaxChars < 100 ||
    chunkMaxChars > 4000
  ) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'chunkMaxChars must be an integer between 100 and 4000.');
  }

  if (
    typeof chunkOverlapChars !== 'number' ||
    !Number.isInteger(chunkOverlapChars) ||
    chunkOverlapChars < 0 ||
    chunkOverlapChars >= chunkMaxChars
  ) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'chunkOverlapChars must be >= 0 and < chunkMaxChars.');
  }

  if (
    typeof normalizedCharCount !== 'number' ||
    !Number.isInteger(normalizedCharCount) ||
    normalizedCharCount < 1
  ) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'normalizedCharCount must be a positive integer.');
  }

  if (typeof normalizedSha256 !== 'string' || !SHA256_PATTERN.test(normalizedSha256)) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'normalizedSha256 must be a SHA-256 hex digest.');
  }

  if (!Array.isArray(chunks) || chunks.length < 1 || chunks.length > 5000) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'chunks must be a non-empty array of at most 5000 items.');
  }

  const validatedChunks = chunks.map((item, idx) => validateChunkItem(item, idx));

  return {
    chunkVersion: record.chunkVersion,
    chunkMaxChars,
    chunkOverlapChars,
    normalizedCharCount,
    normalizedSha256,
    chunks: validatedChunks,
  };
}

export function validateCompleteJobInput(body: unknown): CompleteJobInput {
  const record = assertPlainObject(body, 'Request body must be a JSON object.');
  assertAllowedFields(record, COMPLETE_FIELDS);

  return {
    leaseToken: validateUuid(record.leaseToken, 'leaseToken'),
    businessId: validateUuid(record.businessId, 'businessId'),
    documentVersionId: validateUuid(record.documentVersionId, 'documentVersionId'),
    chunking: validateChunkingPayload(record.chunking),
  };
}

export function validateFailJobInput(body: unknown): FailJobInput {
  const record = assertPlainObject(body, 'Request body must be a JSON object.');
  assertAllowedFields(record, FAIL_FIELDS);

  if (typeof record.errorMessage !== 'string') {
    throw new HttpError(400, 'VALIDATION_ERROR', 'errorMessage must be a string.');
  }

  const errorMessage = record.errorMessage.trim().slice(0, 500);
  if (errorMessage.length < 1) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'errorMessage must not be empty.');
  }

  const retryable = record.retryable ?? true;
  if (typeof retryable !== 'boolean') {
    throw new HttpError(400, 'VALIDATION_ERROR', 'retryable must be a boolean.');
  }

  const retryDelaySeconds = record.retryDelaySeconds ?? 0;
  if (
    typeof retryDelaySeconds !== 'number' ||
    !Number.isInteger(retryDelaySeconds) ||
    retryDelaySeconds < 0 ||
    retryDelaySeconds > 3600
  ) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'retryDelaySeconds must be an integer between 0 and 3600.',
    );
  }

  return {
    leaseToken: validateUuid(record.leaseToken, 'leaseToken'),
    businessId: validateUuid(record.businessId, 'businessId'),
    documentVersionId: validateUuid(record.documentVersionId, 'documentVersionId'),
    errorMessage,
    retryable,
    retryDelaySeconds,
  };
}

