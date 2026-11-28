import { HttpError } from '../../utils/http-error.js';
import { validateUuid } from '../auth/auth.validation.js';
import type {
  CompleteCleanupJobInput,
  FailCleanupJobInput,
} from './vector-cleanup.types.js';

const COMPLETE_FIELDS = new Set(['leaseToken', 'businessId', 'documentId']);
const FAIL_FIELDS = new Set([
  'leaseToken',
  'businessId',
  'documentId',
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

export function validateCompleteCleanupJobInput(body: unknown): CompleteCleanupJobInput {
  const record = assertPlainObject(body, 'Request body must be a JSON object.');
  assertAllowedFields(record, COMPLETE_FIELDS);

  return {
    leaseToken: validateUuid(record.leaseToken, 'leaseToken'),
    businessId: validateUuid(record.businessId, 'businessId'),
    documentId: validateUuid(record.documentId, 'documentId'),
  };
}

export function validateFailCleanupJobInput(body: unknown): FailCleanupJobInput {
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
    documentId: validateUuid(record.documentId, 'documentId'),
    errorMessage,
    retryable,
    retryDelaySeconds,
  };
}

