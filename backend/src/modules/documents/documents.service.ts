import type { AuthContext, TenantContext } from '../../types/express.js';
import { listDocumentIngestionJobs } from '../ingestion-jobs/ingestion-jobs.repository.js';
import type { IngestionJobRecord } from '../ingestion-jobs/ingestion-jobs.types.js';
import {
  addDocumentVersion,
  createDocumentWithVersion,
  getDocumentDetail,
  getDocumentVersion,
  listDocuments,
  listDocumentVersions,
  listDocumentVersionChunks,
  retryDocumentVersion,
  softDeleteDocument,
  updateDocumentMetadata,
} from './documents.repository.js';
import type {
  CreateDocumentInput,
  DocumentChunkRecord,
  DocumentDetail,
  DocumentRecord,
  DocumentVersion,
  DocumentVersionSummary,
  DocumentWithLatestVersion,
  ListDocumentsFilter,
  ReplaceDocumentVersionInput,
  UpdateDocumentInput,
} from './documents.types.js';

export async function uploadTenantDocument(
  tenant: TenantContext,
  auth: AuthContext,
  input: CreateDocumentInput,
): Promise<{ document: DocumentRecord; version: DocumentVersion }> {
  return createDocumentWithVersion(tenant.businessId, auth.user.id, input);
}

export async function replaceTenantDocumentVersion(
  tenant: TenantContext,
  auth: AuthContext,
  documentId: string,
  input: ReplaceDocumentVersionInput,
): Promise<{ document: DocumentRecord; version: DocumentVersion }> {
  return addDocumentVersion(tenant.businessId, documentId, auth.user.id, input);
}

export async function getTenantDocuments(
  tenant: TenantContext,
  filter: ListDocumentsFilter,
): Promise<DocumentWithLatestVersion[]> {
  return listDocuments(tenant.businessId, filter);
}

export async function getTenantDocumentDetail(
  tenant: TenantContext,
  documentId: string,
): Promise<DocumentDetail> {
  return getDocumentDetail(tenant.businessId, documentId);
}

export async function getTenantDocumentVersions(
  tenant: TenantContext,
  documentId: string,
): Promise<DocumentVersionSummary[]> {
  return listDocumentVersions(tenant.businessId, documentId);
}

export async function getTenantDocumentVersion(
  tenant: TenantContext,
  documentId: string,
  versionId: string,
): Promise<DocumentVersion> {
  return getDocumentVersion(tenant.businessId, documentId, versionId);
}

export async function updateTenantDocumentMetadata(
  tenant: TenantContext,
  documentId: string,
  input: UpdateDocumentInput,
): Promise<DocumentRecord> {
  return updateDocumentMetadata(tenant.businessId, documentId, input);
}

export async function retryTenantDocumentVersion(
  tenant: TenantContext,
  documentId: string,
  versionId: string,
): Promise<{ document: DocumentRecord; version: DocumentVersionSummary }> {
  return retryDocumentVersion(tenant.businessId, documentId, versionId);
}

export async function deleteTenantDocument(
  tenant: TenantContext,
  auth: AuthContext,
  documentId: string,
): Promise<DocumentRecord> {
  return softDeleteDocument(tenant.businessId, documentId, auth.user.id);
}

export async function getTenantDocumentIngestionJobs(
  tenant: TenantContext,
  documentId: string,
): Promise<IngestionJobRecord[]> {
  return listDocumentIngestionJobs(tenant.businessId, documentId);
}

export async function getTenantDocumentVersionChunks(
  tenant: TenantContext,
  documentId: string,
  versionId: string,
): Promise<DocumentChunkRecord[]> {
  return listDocumentVersionChunks(tenant.businessId, documentId, versionId);
}

export async function getTenantDocumentProcessingStatus(
  tenant: TenantContext,
  documentId: string,
): Promise<{
  document: DocumentRecord;
  latestVersion: DocumentVersionSummary | null;
  latestJob: IngestionJobRecord | null;
}> {
  const [detail, jobs] = await Promise.all([
    getDocumentDetail(tenant.businessId, documentId),
    listDocumentIngestionJobs(tenant.businessId, documentId),
  ]);

  return {
    document: detail.document,
    latestVersion: detail.versions[0] ?? null,
    latestJob: jobs[0] ?? null,
  };
}
