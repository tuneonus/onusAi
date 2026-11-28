import { createHash } from 'node:crypto';
import { env } from '../../config/env.js';
import { HttpError } from '../../utils/http-error.js';
import { validateUuid } from '../auth/auth.validation.js';
import {
  DOCUMENT_STATUSES,
  DOCUMENT_VISIBILITIES,
  type CreateDocumentInput,
  type DocumentMimeType,
  type DocumentSourceType,
  type DocumentStatus,
  type DocumentVisibility,
  type ListDocumentsFilter,
  type RawDocumentUploadInput,
  type ReplaceDocumentVersionInput,
  type UpdateDocumentInput,
  type ValidatedDocumentContent,
} from './documents.types.js';

const UPDATE_DOCUMENT_FIELDS = new Set(['title', 'visibility', 'locationId']);
const JSON_UPLOAD_FIELDS = new Set(['filename', 'mimeType', 'content', 'title', 'visibility', 'locationId']);
const DISALLOWED_CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

const EXTENSION_TYPE_MAP: Record<string, { sourceType: DocumentSourceType; mimeType: DocumentMimeType; allowedMimes: ReadonlySet<string> }> = {
  '.txt': {
    sourceType: 'txt',
    mimeType: 'text/plain',
    allowedMimes: new Set(['', 'text/plain', 'application/octet-stream']),
  },
  '.md': {
    sourceType: 'markdown',
    mimeType: 'text/markdown',
    allowedMimes: new Set(['', 'text/markdown', 'text/x-markdown', 'text/plain', 'application/octet-stream']),
  },
  '.markdown': {
    sourceType: 'markdown',
    mimeType: 'text/markdown',
    allowedMimes: new Set(['', 'text/markdown', 'text/x-markdown', 'text/plain', 'application/octet-stream']),
  },
};

function assertPlainObject(value: unknown, message: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new HttpError(400, 'VALIDATION_ERROR', message);
  }

  return value as Record<string, unknown>;
}

function validateTitle(value: unknown): string {
  if (typeof value !== 'string') {
    throw new HttpError(400, 'VALIDATION_ERROR', 'title must be a string.');
  }

  const trimmed = value.trim();

  if (trimmed.length < 1 || trimmed.length > 200) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'title must be between 1 and 200 characters.');
  }

  return trimmed;
}

function validateVisibility(value: unknown): DocumentVisibility {
  if (value === undefined || value === null || value === '') {
    return 'public';
  }

  if (typeof value !== 'string' || !DOCUMENT_VISIBILITIES.includes(value as DocumentVisibility)) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      `visibility must be one of: ${DOCUMENT_VISIBILITIES.join(', ')}.`,
    );
  }

  return value as DocumentVisibility;
}

function validateLocationId(value: unknown): string | null {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  return validateUuid(value, 'locationId');
}

function sanitizeFilename(rawFilename: unknown): { filename: string; extension: string } {
  if (typeof rawFilename !== 'string') {
    throw new HttpError(400, 'VALIDATION_ERROR', 'filename is required.');
  }

  const trimmed = rawFilename.trim();

  if (
    trimmed.length < 1 ||
    trimmed.length > 255 ||
    trimmed.includes('/') ||
    trimmed.includes('\\') ||
    trimmed.includes('..') ||
    DISALLOWED_CONTROL_CHARS.test(trimmed)
  ) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'filename is invalid.');
  }

  const dotIndex = trimmed.lastIndexOf('.');

  if (dotIndex <= 0) {
    throw new HttpError(
      400,
      'UNSUPPORTED_DOCUMENT_TYPE',
      'Only .txt, .md, and .markdown files are supported.',
    );
  }

  const extension = trimmed.slice(dotIndex).toLowerCase();

  if (!(extension in EXTENSION_TYPE_MAP)) {
    throw new HttpError(
      400,
      'UNSUPPORTED_DOCUMENT_TYPE',
      'Only .txt, .md, and .markdown files are supported.',
    );
  }

  return { filename: trimmed, extension };
}

function normalizeMimeType(rawMime: string | null | undefined): string {
  if (!rawMime) {
    return '';
  }

  return (rawMime.split(';', 1)[0] ?? '').trim().toLowerCase();
}

function deriveTitleFromFilename(filename: string, extension: string): string {
  const base = filename.slice(0, filename.length - extension.length).trim();
  const candidate = base.length > 0 ? base : filename;
  return candidate.slice(0, 200);
}

export function validateDocumentBytes(
  rawFilename: unknown,
  rawMimeType: string | null | undefined,
  bytes: Uint8Array,
  maxBytes: number = env.documentMaxBytes,
): ValidatedDocumentContent {
  const { filename, extension } = sanitizeFilename(rawFilename);
  const typeConfig = EXTENSION_TYPE_MAP[extension];

  if (!typeConfig) {
    throw new HttpError(
      400,
      'UNSUPPORTED_DOCUMENT_TYPE',
      'Only .txt, .md, and .markdown files are supported.',
    );
  }

  const normalizedMime = normalizeMimeType(rawMimeType);

  if (!typeConfig.allowedMimes.has(normalizedMime)) {
    throw new HttpError(
      400,
      'UNSUPPORTED_DOCUMENT_TYPE',
      'Document MIME type is not supported for this file extension.',
    );
  }

  if (bytes.byteLength === 0) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Document content must not be empty.');
  }

  if (bytes.byteLength > maxBytes) {
    throw new HttpError(
      413,
      'PAYLOAD_TOO_LARGE',
      `Document exceeds the maximum allowed size of ${maxBytes} bytes.`,
    );
  }

  let decoded: string;

  try {
    decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new HttpError(400, 'INVALID_DOCUMENT_ENCODING', 'Document must be valid UTF-8 text.');
  }

  // Strip optional UTF-8 BOM, then normalize line endings for consistent hashing/storage.
  const withoutBom = decoded.startsWith('\uFEFF') ? decoded.slice(1) : decoded;

  if (DISALLOWED_CONTROL_CHARS.test(withoutBom)) {
    throw new HttpError(
      400,
      'INVALID_DOCUMENT_CONTENT',
      'Document contains unsupported binary or control characters.',
    );
  }

  const normalizedText = withoutBom.replaceAll('\r\n', '\n').replaceAll('\r', '\n');

  if (normalizedText.trim().length === 0) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Document content must not be blank.');
  }

  const contentSha256 = createHash('sha256').update(normalizedText, 'utf8').digest('hex');

  return {
    sourceFilename: filename,
    mimeType: typeConfig.mimeType,
    sourceType: typeConfig.sourceType,
    encoding: 'utf-8',
    byteSize: bytes.byteLength,
    charCount: normalizedText.length,
    contentSha256,
    contentText: normalizedText,
  };
}

export function validateCreateDocumentUpload(
  input: RawDocumentUploadInput,
  maxBytes: number = env.documentMaxBytes,
): CreateDocumentInput {
  const content = validateDocumentBytes(input.filename, input.mimeType, input.bytes, maxBytes);
  const extension = content.sourceFilename.slice(content.sourceFilename.lastIndexOf('.')).toLowerCase();
  const title =
    input.title === undefined || input.title === null || input.title === ''
      ? deriveTitleFromFilename(content.sourceFilename, extension)
      : validateTitle(input.title);
  const visibility = validateVisibility(input.visibility);
  const locationId = validateLocationId(input.locationId);

  return {
    ...content,
    title,
    visibility,
    locationId,
  };
}

export function validateReplaceDocumentUpload(
  input: RawDocumentUploadInput,
  maxBytes: number = env.documentMaxBytes,
): ReplaceDocumentVersionInput {
  return validateDocumentBytes(input.filename, input.mimeType, input.bytes, maxBytes);
}

export function parseJsonDocumentUploadBody(body: unknown): RawDocumentUploadInput {
  const record = assertPlainObject(body, 'Request body must be a JSON object.');

  if (Object.keys(record).some((key) => !JSON_UPLOAD_FIELDS.has(key))) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Request body contains unsupported fields.');
  }

  if (typeof record.filename !== 'string') {
    throw new HttpError(400, 'VALIDATION_ERROR', 'filename must be a string.');
  }

  if (typeof record.content !== 'string') {
    throw new HttpError(400, 'VALIDATION_ERROR', 'content must be a string.');
  }

  if (record.mimeType !== undefined && record.mimeType !== null && typeof record.mimeType !== 'string') {
    throw new HttpError(400, 'VALIDATION_ERROR', 'mimeType must be a string.');
  }

  return {
    filename: record.filename,
    mimeType: typeof record.mimeType === 'string' ? record.mimeType : null,
    bytes: Buffer.from(record.content, 'utf8'),
    title: record.title,
    visibility: record.visibility,
    locationId: record.locationId,
  };
}

export function validateUpdateDocumentInput(body: unknown): UpdateDocumentInput {
  const record = assertPlainObject(body, 'Request body must be a JSON object.');
  const keys = Object.keys(record);

  if (keys.length === 0) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'At least one field must be provided for update.');
  }

  if (keys.some((key) => !UPDATE_DOCUMENT_FIELDS.has(key))) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Request body contains unsupported fields.');
  }

  const update: UpdateDocumentInput = {};

  if ('title' in record) {
    update.title = validateTitle(record.title);
  }

  if ('visibility' in record) {
    if (typeof record.visibility !== 'string' || !DOCUMENT_VISIBILITIES.includes(record.visibility as DocumentVisibility)) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        `visibility must be one of: ${DOCUMENT_VISIBILITIES.join(', ')}.`,
      );
    }

    update.visibility = record.visibility as DocumentVisibility;
  }

  if ('locationId' in record) {
    update.locationId = record.locationId === null ? null : validateUuid(record.locationId, 'locationId');
  }

  return update;
}

export function validateListDocumentsQuery(query: Record<string, unknown>): ListDocumentsFilter {
  let visibility: DocumentVisibility | undefined;

  if (query.visibility !== undefined) {
    if (typeof query.visibility !== 'string' || !DOCUMENT_VISIBILITIES.includes(query.visibility as DocumentVisibility)) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        `visibility must be one of: ${DOCUMENT_VISIBILITIES.join(', ')}.`,
      );
    }
    visibility = query.visibility as DocumentVisibility;
  }

  let status: DocumentStatus | undefined;

  if (query.status !== undefined) {
    if (typeof query.status !== 'string' || !DOCUMENT_STATUSES.includes(query.status as DocumentStatus)) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        `status must be one of: ${DOCUMENT_STATUSES.join(', ')}.`,
      );
    }
    status = query.status as DocumentStatus;
  }

  let locationId: string | undefined;

  if (query.locationId !== undefined) {
    locationId = validateUuid(query.locationId, 'locationId');
  }

  let includeDeleted = false;

  if (query.includeDeleted !== undefined) {
    if (query.includeDeleted === 'true') {
      includeDeleted = true;
    } else if (query.includeDeleted === 'false') {
      includeDeleted = false;
    } else {
      throw new HttpError(400, 'VALIDATION_ERROR', 'includeDeleted must be true or false.');
    }
  }

  return { visibility, status, locationId, includeDeleted };
}
