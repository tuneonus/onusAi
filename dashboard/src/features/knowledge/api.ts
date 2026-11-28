import { apiRequest, ApiClientError } from '../../services/api/client.ts';
import type { UserMembershipSummary } from '../auth/types';
import type {
  DocumentChunk,
  DocumentDetail,
  DocumentIngestionJob,
  DocumentListFilter,
  DocumentListItem,
  DocumentProcessingStatus,
  DocumentRecord,
  DocumentVersion,
  DocumentVersionSummary,
  DocumentVisibility,
} from './types.ts';

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function invalidResponse(): never {
  throw new ApiClientError({
    status: 502,
    code: 'INVALID_KNOWLEDGE_RESPONSE',
    message: 'The knowledge base response could not be verified.',
  });
}

function isDocumentRecord(value: unknown, businessId: string): value is DocumentRecord {
  return (
    isObject(value) &&
    value.businessId === businessId &&
    typeof value.id === 'string' &&
    typeof value.title === 'string' &&
    (value.locationId === null || typeof value.locationId === 'string') &&
    (value.visibility === 'public' || value.visibility === 'staff_only') &&
    ['uploaded', 'processing', 'ready', 'failed', 'deleted'].includes(String(value.status)) &&
    typeof value.currentVersionNumber === 'number'
  );
}

function isVersionSummary(
  value: unknown,
  businessId: string,
  documentId?: string,
): value is DocumentVersionSummary {
  return (
    isObject(value) &&
    value.businessId === businessId &&
    typeof value.id === 'string' &&
    typeof value.documentId === 'string' &&
    (!documentId || value.documentId === documentId) &&
    typeof value.versionNumber === 'number' &&
    typeof value.sourceFilename === 'string' &&
    typeof value.chunkCount === 'number'
  );
}

function isIngestionJob(
  value: unknown,
  businessId: string,
  documentId: string,
): value is DocumentIngestionJob {
  return (
    isObject(value) &&
    value.businessId === businessId &&
    value.documentId === documentId &&
    typeof value.id === 'string' &&
    typeof value.documentVersionId === 'string' &&
    ['queued', 'leased', 'completed', 'failed', 'cancelled'].includes(String(value.status)) &&
    typeof value.attemptCount === 'number' &&
    typeof value.maxAttempts === 'number'
  );
}

function isChunkRecord(
  value: unknown,
  businessId: string,
  documentId: string,
  versionId: string,
): value is DocumentChunk {
  return (
    isObject(value) &&
    value.businessId === businessId &&
    value.documentId === documentId &&
    value.documentVersionId === versionId &&
    typeof value.id === 'string' &&
    typeof value.chunkIndex === 'number' &&
    Array.isArray(value.headingPath) &&
    typeof value.chunkText === 'string'
  );
}

export class KnowledgeApi {
  private readonly membership: UserMembershipSummary;
  private readonly signal: AbortSignal;

  constructor(membership: UserMembershipSummary, signal: AbortSignal) {
    this.membership = membership;
    this.signal = signal;
  }

  private get basePath(): string {
    if (!this.membership.businessId) {
      throw new ApiClientError({
        status: 400,
        code: 'NO_ACTIVE_WORKSPACE',
        message: 'Select a business workspace first.',
      });
    }

    return `/businesses/${encodeURIComponent(this.membership.businessId)}/documents`;
  }

  private assertOwner(actionMessage: string): void {
    this.signal.throwIfAborted();
    if (!this.membership.businessId || this.membership.role !== 'owner') {
      throw new ApiClientError({
        status: 403,
        code: 'INSUFFICIENT_PERMISSIONS',
        message: actionMessage,
      });
    }
  }

  private assertTenantResponse(result: unknown): Record<string, unknown> {
    this.signal.throwIfAborted();
    if (!isObject(result) || result.businessId !== this.membership.businessId) {
      invalidResponse();
    }
    return result;
  }

  async list(filter: DocumentListFilter = {}): Promise<DocumentListItem[]> {
    this.signal.throwIfAborted();
    const params = new URLSearchParams();
    if (filter.visibility) params.set('visibility', filter.visibility);
    if (filter.status) params.set('status', filter.status);
    if (filter.locationId) params.set('locationId', filter.locationId);
    if (filter.includeDeleted) params.set('includeDeleted', 'true');

    const query = params.toString();
    const raw = await apiRequest<unknown>(`${this.basePath}${query ? `?${query}` : ''}`, {
      signal: this.signal,
    });
    const data = this.assertTenantResponse(raw);

    if (
      !Array.isArray(data.documents) ||
      !data.documents.every(
        (item) =>
          isDocumentRecord(item, this.membership.businessId) &&
          ((item as unknown as Record<string, unknown>).latestVersion === null ||
            isVersionSummary(
              (item as unknown as Record<string, unknown>).latestVersion,
              this.membership.businessId,
              item.id,
            )),
      )
    ) {
      invalidResponse();
    }

    return data.documents as DocumentListItem[];
  }

  async upload(input: {
    file: File;
    title?: string;
    visibility: DocumentVisibility;
    locationId: string | null;
  }): Promise<{ document: DocumentRecord; version: DocumentVersion }> {
    this.assertOwner('Only business owners can upload knowledge documents.');

    const formData = new FormData();
    formData.append('file', input.file);
    if (input.title && input.title.trim()) {
      formData.append('title', input.title.trim());
    }
    formData.append('visibility', input.visibility);
    if (input.locationId) {
      formData.append('locationId', input.locationId);
    }

    const raw = await apiRequest<unknown>(this.basePath, {
      method: 'POST',
      body: formData,
      signal: this.signal,
    });
    const data = this.assertTenantResponse(raw);

    if (
      !isDocumentRecord(data.document, this.membership.businessId) ||
      !isVersionSummary(data.version, this.membership.businessId, data.document.id) ||
      typeof (data.version as unknown as Record<string, unknown>).contentText !== 'string'
    ) {
      invalidResponse();
    }

    return {
      document: data.document,
      version: data.version as DocumentVersion,
    };
  }

  async getDetail(documentId: string): Promise<DocumentDetail> {
    this.signal.throwIfAborted();
    const raw = await apiRequest<unknown>(`${this.basePath}/${encodeURIComponent(documentId)}`, {
      signal: this.signal,
    });
    const data = this.assertTenantResponse(raw);

    if (
      !isDocumentRecord(data.document, this.membership.businessId) ||
      !Array.isArray(data.versions) ||
      !data.versions.every((v) => isVersionSummary(v, this.membership.businessId, documentId))
    ) {
      invalidResponse();
    }

    return {
      document: data.document,
      versions: data.versions,
    };
  }

  async updateMetadata(
    documentId: string,
    patch: { title?: string; visibility?: DocumentVisibility; locationId?: string | null },
  ): Promise<DocumentRecord> {
    this.assertOwner('Only business owners can edit document metadata.');
    const raw = await apiRequest<unknown>(`${this.basePath}/${encodeURIComponent(documentId)}`, {
      method: 'PATCH',
      body: patch,
      signal: this.signal,
    });
    const data = this.assertTenantResponse(raw);

    if (!isDocumentRecord(data.document, this.membership.businessId)) {
      invalidResponse();
    }

    return data.document;
  }

  async replaceVersion(
    documentId: string,
    file: File,
  ): Promise<{ document: DocumentRecord; version: DocumentVersion }> {
    this.assertOwner('Only business owners can upload replacement document versions.');
    const formData = new FormData();
    formData.append('file', file);

    const raw = await apiRequest<unknown>(
      `${this.basePath}/${encodeURIComponent(documentId)}/versions`,
      {
        method: 'POST',
        body: formData,
        signal: this.signal,
      },
    );
    const data = this.assertTenantResponse(raw);

    if (
      !isDocumentRecord(data.document, this.membership.businessId) ||
      !isVersionSummary(data.version, this.membership.businessId, documentId) ||
      typeof (data.version as unknown as Record<string, unknown>).contentText !== 'string'
    ) {
      invalidResponse();
    }

    return {
      document: data.document,
      version: data.version as DocumentVersion,
    };
  }

  async getVersion(documentId: string, versionId: string): Promise<DocumentVersion> {
    this.signal.throwIfAborted();
    const raw = await apiRequest<unknown>(
      `${this.basePath}/${encodeURIComponent(documentId)}/versions/${encodeURIComponent(versionId)}`,
      { signal: this.signal },
    );
    const data = this.assertTenantResponse(raw);

    if (
      !isVersionSummary(data.version, this.membership.businessId, documentId) ||
      typeof (data.version as unknown as Record<string, unknown>).contentText !== 'string'
    ) {
      invalidResponse();
    }

    return data.version as DocumentVersion;
  }

  async getStatus(documentId: string): Promise<DocumentProcessingStatus> {
    this.signal.throwIfAborted();
    const raw = await apiRequest<unknown>(
      `${this.basePath}/${encodeURIComponent(documentId)}/status`,
      { signal: this.signal },
    );
    const data = this.assertTenantResponse(raw);

    if (
      !isDocumentRecord(data.document, this.membership.businessId) ||
      (data.latestVersion !== null &&
        !isVersionSummary(data.latestVersion, this.membership.businessId, documentId)) ||
      (data.latestJob !== null &&
        !isIngestionJob(data.latestJob, this.membership.businessId, documentId))
    ) {
      invalidResponse();
    }

    return {
      document: data.document,
      latestVersion: data.latestVersion,
      latestJob: data.latestJob,
    };
  }

  async listJobs(documentId: string): Promise<DocumentIngestionJob[]> {
    this.signal.throwIfAborted();
    const raw = await apiRequest<unknown>(
      `${this.basePath}/${encodeURIComponent(documentId)}/jobs`,
      { signal: this.signal },
    );
    const data = this.assertTenantResponse(raw);

    if (
      !Array.isArray(data.jobs) ||
      !data.jobs.every((job) => isIngestionJob(job, this.membership.businessId, documentId))
    ) {
      invalidResponse();
    }

    return data.jobs;
  }

  async listChunks(documentId: string, versionId: string): Promise<DocumentChunk[]> {
    this.signal.throwIfAborted();
    const raw = await apiRequest<unknown>(
      `${this.basePath}/${encodeURIComponent(documentId)}/versions/${encodeURIComponent(versionId)}/chunks`,
      { signal: this.signal },
    );
    const data = this.assertTenantResponse(raw);

    if (
      !Array.isArray(data.chunks) ||
      !data.chunks.every((chunk) =>
        isChunkRecord(chunk, this.membership.businessId, documentId, versionId),
      )
    ) {
      invalidResponse();
    }

    return data.chunks;
  }

  async retryVersion(
    documentId: string,
    versionId: string,
  ): Promise<{ document: DocumentRecord; version: DocumentVersionSummary }> {
    this.assertOwner('Only business owners can retry failed document ingestion.');
    const raw = await apiRequest<unknown>(
      `${this.basePath}/${encodeURIComponent(documentId)}/versions/${encodeURIComponent(versionId)}/retry`,
      { method: 'POST', body: {}, signal: this.signal },
    );
    const data = this.assertTenantResponse(raw);

    if (
      !isDocumentRecord(data.document, this.membership.businessId) ||
      !isVersionSummary(data.version, this.membership.businessId, documentId)
    ) {
      invalidResponse();
    }

    return {
      document: data.document,
      version: data.version,
    };
  }

  async softDelete(documentId: string): Promise<DocumentRecord> {
    this.assertOwner('Only business owners can delete knowledge documents.');
    const raw = await apiRequest<unknown>(`${this.basePath}/${encodeURIComponent(documentId)}`, {
      method: 'DELETE',
      signal: this.signal,
    });
    const data = this.assertTenantResponse(raw);

    if (!isDocumentRecord(data.document, this.membership.businessId)) {
      invalidResponse();
    }

    return data.document;
  }
}
