import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';

process.env.PORT = '3000';
process.env.NODE_ENV = 'test';
process.env.CORS_ORIGIN = 'http://localhost:5173';
process.env.AI_SERVICE_URL = 'http://127.0.0.1:8001';
process.env.AI_SERVICE_TIMEOUT_MS = '5000';
process.env.AI_INTERNAL_AUTH_SECRET = 'test-internal-auth-secret-at-least-32-characters';
process.env.DATABASE_URL = 'postgresql://test:example-password@127.0.0.1:5433/onussync';
process.env.DOCUMENT_MAX_BYTES = '1024';

const {
  parseJsonDocumentUploadBody,
  validateCreateDocumentUpload,
  validateDocumentBytes,
  validateListDocumentsQuery,
  validateUpdateDocumentInput,
} = await import('../dist/modules/documents/documents.validation.js');

test('validates UTF-8 TXT and Markdown uploads, strips BOM, normalizes line endings, and hashes content', () => {
  const rawContent = '\uFEFF# Welcome\r\nHours: 9am–5pm\rMon–Fri';
  const bytes = Buffer.from(rawContent, 'utf8');
  const expectedText = '# Welcome\nHours: 9am–5pm\nMon–Fri';
  const expectedHash = createHash('sha256').update(expectedText, 'utf8').digest('hex');

  const validated = validateCreateDocumentUpload({
    filename: 'faq.md',
    mimeType: 'text/markdown; charset=utf-8',
    bytes,
  });

  assert.equal(validated.title, 'faq');
  assert.equal(validated.visibility, 'public');
  assert.equal(validated.locationId, null);
  assert.equal(validated.sourceFilename, 'faq.md');
  assert.equal(validated.mimeType, 'text/markdown');
  assert.equal(validated.sourceType, 'markdown');
  assert.equal(validated.encoding, 'utf-8');
  assert.equal(validated.byteSize, bytes.byteLength);
  assert.equal(validated.charCount, expectedText.length);
  assert.equal(validated.contentSha256, expectedHash);
  assert.equal(validated.contentText, expectedText);

  const txtValidated = validateCreateDocumentUpload({
    filename: 'POLICY.TXT',
    mimeType: 'text/plain',
    bytes: Buffer.from('Plain text policy', 'utf8'),
    title: '  Return Policy  ',
    visibility: 'staff_only',
  });

  assert.equal(txtValidated.title, 'Return Policy');
  assert.equal(txtValidated.visibility, 'staff_only');
  assert.equal(txtValidated.sourceType, 'txt');
  assert.equal(txtValidated.mimeType, 'text/plain');
});

test('rejects empty, oversized, unsupported type, and path-traversal uploads', () => {
  assert.throws(
    () => validateDocumentBytes('empty.txt', 'text/plain', Buffer.alloc(0), 1024),
    (error) => error.statusCode === 400 && error.code === 'VALIDATION_ERROR',
  );

  assert.throws(
    () => validateDocumentBytes('big.txt', 'text/plain', Buffer.alloc(1025, 0x61), 1024),
    (error) => error.statusCode === 413 && error.code === 'PAYLOAD_TOO_LARGE',
  );

  for (const filename of ['manual.pdf', 'page.html', 'script.js', 'README', '../escape.txt', 'dir/file.md']) {
    assert.throws(
      () => validateDocumentBytes(filename, 'text/plain', Buffer.from('hello', 'utf8'), 1024),
      (error) => error.statusCode === 400,
    );
  }

  for (const mimeType of ['application/pdf', 'text/html', 'application/json', 'image/png']) {
    assert.throws(
      () => validateDocumentBytes('notes.txt', mimeType, Buffer.from('hello', 'utf8'), 1024),
      (error) => error.statusCode === 400 && error.code === 'UNSUPPORTED_DOCUMENT_TYPE',
    );
  }
});

test('rejects invalid UTF-8 encoding, binary control bytes, and blank text', () => {
  // Invalid UTF-8 byte sequence and truncated multi-byte sequence
  for (const invalidBytes of [
    Uint8Array.from([0xff, 0xfe, 0x41, 0x00]),
    Uint8Array.from([0xe2, 0x82]),
    Uint8Array.from([0xc3, 0x28]),
  ]) {
    assert.throws(
      () => validateDocumentBytes('bad.txt', 'text/plain', invalidBytes, 1024),
      (error) => error.statusCode === 400 && error.code === 'INVALID_DOCUMENT_ENCODING',
    );
  }

  // NUL byte or ASCII bell control character
  assert.throws(
    () => validateDocumentBytes('nul.txt', 'text/plain', Buffer.from('abc\u0000def', 'utf8'), 1024),
    (error) => error.statusCode === 400 && error.code === 'INVALID_DOCUMENT_CONTENT',
  );

  assert.throws(
    () => validateDocumentBytes('blank.md', 'text/markdown', Buffer.from('  \n\t\r\n  ', 'utf8'), 1024),
    (error) => error.statusCode === 400 && error.code === 'VALIDATION_ERROR',
  );
});

test('validates JSON upload body, metadata updates, and list query filters strictly', () => {
  const parsed = parseJsonDocumentUploadBody({
    filename: 'guide.markdown',
    content: '# Guide\nStep 1',
    visibility: 'staff_only',
  });
  assert.equal(parsed.filename, 'guide.markdown');
  assert.equal(parsed.visibility, 'staff_only');

  assert.throws(
    () => parseJsonDocumentUploadBody({ filename: 'a.txt', content: 'hi', extra: true }),
    (error) => error.statusCode === 400 && error.code === 'VALIDATION_ERROR',
  );

  const update = validateUpdateDocumentInput({ title: '  Updated  ', visibility: 'public', locationId: null });
  assert.deepEqual(update, { title: 'Updated', visibility: 'public', locationId: null });

  assert.throws(
    () => validateUpdateDocumentInput({}),
    (error) => error.statusCode === 400 && error.code === 'VALIDATION_ERROR',
  );

  const filter = validateListDocumentsQuery({ visibility: 'public', status: 'uploaded', includeDeleted: 'true' });
  assert.deepEqual(filter, {
    visibility: 'public',
    status: 'uploaded',
    locationId: undefined,
    includeDeleted: true,
  });

  assert.throws(
    () => validateListDocumentsQuery({ includeDeleted: 'yes' }),
    (error) => error.statusCode === 400 && error.code === 'VALIDATION_ERROR',
  );
});

