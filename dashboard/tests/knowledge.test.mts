import assert from 'node:assert/strict';
import test from 'node:test';
import { KnowledgeApi } from '../src/features/knowledge/api.ts';
import type { DocumentListItem } from '../src/features/knowledge/types.ts';
import {
  computeKnowledgeOverview,
  filterDocumentsByQuery,
  validateDocumentTitle,
  validateKnowledgeFile,
} from '../src/features/knowledge/validation.ts';
import { setCsrfToken } from '../src/services/api/client.ts';

const OWNER = {
  membershipId: 'mem-1',
  businessId: 'biz-alpha',
  businessName: 'Alpha Co',
  role: 'owner' as const,
};

const OPERATOR = {
  membershipId: 'mem-2',
  businessId: 'biz-alpha',
  businessName: 'Alpha Co',
  role: 'operator' as const,
};

function makeListItem(overrides: Partial<DocumentListItem> = {}): DocumentListItem {
  return {
    id: 'doc-1',
    businessId: 'biz-alpha',
    locationId: null,
    title: 'Clinic FAQ',
    visibility: 'public',
    status: 'processing',
    currentVersionNumber: 1,
    activeVersionId: null,
    createdByUserId: 'user-1',
    deletedAt: null,
    deletedByUserId: null,
    createdAt: '2026-11-28T10:00:00.000Z',
    updatedAt: '2026-11-28T10:00:00.000Z',
    latestVersion: {
      id: 'ver-1',
      documentId: 'doc-1',
      businessId: 'biz-alpha',
      versionNumber: 1,
      status: 'processing',
      sourceFilename: 'clinic-faq.md',
      mimeType: 'text/markdown',
      sourceType: 'markdown',
      encoding: 'utf-8',
      byteSize: 120,
      charCount: 120,
      contentSha256: 'a'.repeat(64),
      chunkVersion: 'chunk-v1',
      chunkCount: 2,
      normalizedCharCount: 118,
      normalizedSha256: 'b'.repeat(64),
      failureReason: null,
      indexedAt: null,
      createdByUserId: 'user-1',
      createdAt: '2026-11-28T10:00:00.000Z',
      updatedAt: '2026-11-28T10:00:00.000Z',
    },
    ...overrides,
  };
}

test('validateKnowledgeFile enforces TXT/Markdown extensions and size bounds', () => {
  assert.equal(validateKnowledgeFile({ name: 'faq.md', size: 128 }), null);
  assert.equal(validateKnowledgeFile({ name: 'notes.TXT', size: 128 }), null);
  assert.equal(validateKnowledgeFile({ name: 'guide.markdown', size: 128 }), null);

  assert.match(validateKnowledgeFile(null) ?? '', /Select a .txt/);
  assert.match(validateKnowledgeFile({ name: 'manual.pdf', size: 128 }) ?? '', /Only plain text/);
  assert.match(validateKnowledgeFile({ name: 'empty.txt', size: 0 }) ?? '', /empty/);
  assert.match(validateKnowledgeFile({ name: 'huge.md', size: 262_145 }) ?? '', /256 KiB/);
  assert.match(validateDocumentTitle('', true) ?? '', /required/);
  assert.equal(validateDocumentTitle('', false), null);
});

test('filterDocumentsByQuery and computeKnowledgeOverview summarize and filter accurately', () => {
  const items = [
    makeListItem({ id: 'doc-1', title: 'Public FAQ', visibility: 'public', status: 'processing', locationId: null }),
    makeListItem({
      id: 'doc-2',
      title: 'Staff SOP',
      visibility: 'staff_only',
      status: 'failed',
      locationId: 'loc-1',
      latestVersion: {
        ...makeListItem().latestVersion!,
        id: 'ver-2',
        documentId: 'doc-2',
        sourceFilename: 'sop.txt',
        chunkCount: 0,
      },
    }),
    makeListItem({ id: 'doc-3', title: 'Old Doc', status: 'deleted' }),
  ];

  assert.deepEqual(computeKnowledgeOverview(items), {
    totalActive: 2,
    publicCount: 1,
    staffOnlyCount: 1,
    processingOrUploadedCount: 1,
    failedCount: 1,
    deletedCount: 1,
    totalChunks: 2,
  });

  assert.equal(filterDocumentsByQuery(items, 'sop.txt', '').length, 1);
  assert.equal(filterDocumentsByQuery(items, '', 'business_wide').length, 2);
  assert.equal(filterDocumentsByQuery(items, '', 'loc-1').length, 1);
});

test('KnowledgeApi blocks operator writes without network requests and sends FormData + CSRF for owners', async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    fetchCalls += 1;
    const url = String(input);

    if (url.endsWith('/documents') && init?.method === 'POST') {
      assert.ok(init.body instanceof FormData);
      const headers = new Headers(init.headers);
      assert.equal(headers.get('X-CSRF-Token'), 'csrf-secret');
      assert.equal(headers.has('Content-Type'), false);

      return new Response(
        JSON.stringify({
          businessId: 'biz-alpha',
          document: makeListItem(),
          version: { ...makeListItem().latestVersion!, contentText: '# FAQ' },
        }),
        { status: 201, headers: { 'Content-Type': 'application/json' } },
      );
    }

    return new Response(
      JSON.stringify({
        businessId: 'biz-other',
        documents: [],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }) as typeof fetch;

  try {
    const controller = new AbortController();
    const opApi = new KnowledgeApi(OPERATOR, controller.signal);

    await assert.rejects(
      () => opApi.upload({
        file: new File(['hello'], 'hello.txt', { type: 'text/plain' }),
        visibility: 'public',
        locationId: null,
      }),
      /Only business owners/,
    );
    await assert.rejects(() => opApi.softDelete('doc-1'), /Only business owners/);
    assert.equal(fetchCalls, 0);

    setCsrfToken('csrf-secret');
    const ownerApi = new KnowledgeApi(OWNER, controller.signal);
    const uploaded = await ownerApi.upload({
      file: new File(['# FAQ'], 'faq.md', { type: 'text/markdown' }),
      visibility: 'public',
      locationId: null,
    });
    assert.equal(uploaded.document.id, 'doc-1');
    assert.equal(uploaded.version.contentText, '# FAQ');

    // Cross-tenant response rejected
    await assert.rejects(() => ownerApi.list(), /could not be verified/);
  } finally {
    setCsrfToken(null);
    globalThis.fetch = originalFetch;
  }
});

test('KnowledgeApi.search sends scoped semantic search request and validates response', async () => {
  const originalFetch = globalThis.fetch;
  let capturedUrl = '';
  let capturedBody = '';
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    capturedUrl = String(input);
    capturedBody = String(init?.body ?? '');
    return new Response(
      JSON.stringify({
        requestId: 'req-12345678',
        embeddingModel: 'gemini-embedding-001',
        embeddingModelVersion: 'embed-v1',
        embeddingDimensions: 768,
        qdrantCollection: 'onussync_chunks__embed-v1__d768',
        candidateCount: 1,
        results: [
          {
            chunkId: 'c1',
            documentId: 'd1',
            documentVersionId: 'v1',
            chunkIndex: 0,
            score: 0.72,
            chunkText: 'Check-in is 14:00.',
            title: 'hotel',
            sourceFilename: 'hotel.txt',
            sourceType: 'txt',
            mimeType: 'text/plain',
            versionNumber: 1,
            visibility: 'public',
            locationId: null,
            chunkVersion: 'chunk-v1',
            headingPath: [],
            charStart: 0,
            charEnd: 18,
            citation: {
              documentId: 'd1',
              documentVersionId: 'v1',
              chunkId: 'c1',
              title: 'hotel',
              sourceFilename: 'hotel.txt',
              versionNumber: 1,
              headingPath: [],
            },
          },
        ],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }) as typeof fetch;

  try {
    const searchMembership = {
      businessId: 'biz-1',
      businessName: 'Test Co',
      role: 'owner' as const,
    };
    const api = new KnowledgeApi(searchMembership, new AbortController().signal);
    const res = await api.search({ query: 'check-in time', topK: 5, scoreThreshold: 0.35 });
    assert.equal(capturedUrl, '/api/v1/businesses/biz-1/knowledge/search');
    assert.deepEqual(JSON.parse(capturedBody), {
      query: 'check-in time',
      topK: 5,
      scoreThreshold: 0.35,
    });
    assert.equal(res.results.length, 1);
    assert.equal(res.results[0]!.citation.sourceFilename, 'hotel.txt');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

