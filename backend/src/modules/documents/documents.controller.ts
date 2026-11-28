import type { Request, Response } from 'express';
import { HttpError } from '../../utils/http-error.js';
import { validateUuid } from '../auth/auth.validation.js';
import { serializeStaffIngestionJob } from '../ingestion-jobs/ingestion-jobs.controller.js';
import {
  deleteTenantDocument,
  getTenantDocumentDetail,
  getTenantDocumentIngestionJobs,
  getTenantDocumentProcessingStatus,
  getTenantDocuments,
  getTenantDocumentVersion,
  getTenantDocumentVersionChunks,
  getTenantDocumentVersions,
  replaceTenantDocumentVersion,
  retryTenantDocumentVersion,
  updateTenantDocumentMetadata,
  uploadTenantDocument,
} from './documents.service.js';
import type {
  DocumentChunkRecord,
  DocumentRecord,
  DocumentVersion,
  DocumentVersionSummary,
} from './documents.types.js';
import {
  validateCreateDocumentUpload,
  validateListDocumentsQuery,
  validateReplaceDocumentUpload,
  validateUpdateDocumentInput,
} from './documents.validation.js';

function requireVerifiedAuth(req: Request) {
  if (!req.auth) {
    throw new HttpError(401, 'AUTHENTICATION_REQUIRED', 'Authentication is required.');
  }

  return req.auth;
}

function requireVerifiedTenant(req: Request) {
  if (!req.tenant) {
    throw new HttpError(403, 'TENANT_ACCESS_DENIED', 'You do not have access to this business.');
  }

  return req.tenant;
}

function requireUploadPayload(req: Request) {
  if (!req.documentUpload) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Document upload payload is required.');
  }

  return req.documentUpload;
}

function serializeDocument(doc: DocumentRecord) {
  return {
    id: doc.id,
    businessId: doc.businessId,
    locationId: doc.locationId,
    title: doc.title,
    visibility: doc.visibility,
    status: doc.status,
    currentVersionNumber: doc.currentVersionNumber,
    activeVersionId: doc.activeVersionId,
    createdByUserId: doc.createdByUserId,
    deletedAt: doc.deletedAt ? doc.deletedAt.toISOString() : null,
    deletedByUserId: doc.deletedByUserId,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

function serializeVersionSummary(version: DocumentVersionSummary) {
  return {
    id: version.id,
    documentId: version.documentId,
    businessId: version.businessId,
    versionNumber: version.versionNumber,
    status: version.status,
    sourceFilename: version.sourceFilename,
    mimeType: version.mimeType,
    sourceType: version.sourceType,
    encoding: version.encoding,
    byteSize: version.byteSize,
    charCount: version.charCount,
    contentSha256: version.contentSha256,
    chunkVersion: version.chunkVersion,
    chunkCount: version.chunkCount,
    normalizedCharCount: version.normalizedCharCount,
    normalizedSha256: version.normalizedSha256,
    embeddingModel: version.embeddingModel,
    embeddingModelVersion: version.embeddingModelVersion,
    embeddingDimensions: version.embeddingDimensions,
    qdrantCollection: version.qdrantCollection,
    failureReason: version.failureReason,
    indexedAt: version.indexedAt ? version.indexedAt.toISOString() : null,
    createdByUserId: version.createdByUserId,
    createdAt: version.createdAt.toISOString(),
    updatedAt: version.updatedAt.toISOString(),
  };
}

function serializeVersion(version: DocumentVersion) {
  return {
    ...serializeVersionSummary(version),
    contentText: version.contentText,
  };
}

export async function handleListDocuments(req: Request, res: Response): Promise<void> {
  res.set('Cache-Control', 'no-store');
  const tenant = requireVerifiedTenant(req);
  const filter = validateListDocumentsQuery(req.query as Record<string, unknown>);
  const items = await getTenantDocuments(tenant, filter);

  res.status(200).json({
    businessId: tenant.businessId,
    documents: items.map((item) => ({
      ...serializeDocument(item.document),
      latestVersion: item.latestVersion ? serializeVersionSummary(item.latestVersion) : null,
    })),
  });
}

export async function handleCreateDocument(req: Request, res: Response): Promise<void> {
  res.set('Cache-Control', 'no-store');
  const auth = requireVerifiedAuth(req);
  const tenant = requireVerifiedTenant(req);
  const input = validateCreateDocumentUpload(requireUploadPayload(req));
  const created = await uploadTenantDocument(tenant, auth, input);

  res.status(201).json({
    businessId: tenant.businessId,
    document: serializeDocument(created.document),
    version: serializeVersion(created.version),
  });
}

export async function handleGetDocument(req: Request, res: Response): Promise<void> {
  res.set('Cache-Control', 'no-store');
  const tenant = requireVerifiedTenant(req);
  const documentId = validateUuid(req.params.documentId, 'documentId');
  const detail = await getTenantDocumentDetail(tenant, documentId);

  res.status(200).json({
    businessId: tenant.businessId,
    document: serializeDocument(detail.document),
    versions: detail.versions.map(serializeVersionSummary),
  });
}

export async function handleUpdateDocument(req: Request, res: Response): Promise<void> {
  res.set('Cache-Control', 'no-store');
  const tenant = requireVerifiedTenant(req);
  const documentId = validateUuid(req.params.documentId, 'documentId');
  const input = validateUpdateDocumentInput(req.body);
  const updated = await updateTenantDocumentMetadata(tenant, documentId, input);

  res.status(200).json({
    businessId: tenant.businessId,
    document: serializeDocument(updated),
  });
}

export async function handleDeleteDocument(req: Request, res: Response): Promise<void> {
  res.set('Cache-Control', 'no-store');
  const auth = requireVerifiedAuth(req);
  const tenant = requireVerifiedTenant(req);
  const documentId = validateUuid(req.params.documentId, 'documentId');
  const deleted = await deleteTenantDocument(tenant, auth, documentId);

  res.status(200).json({
    businessId: tenant.businessId,
    document: serializeDocument(deleted),
  });
}

export async function handleListDocumentVersions(req: Request, res: Response): Promise<void> {
  res.set('Cache-Control', 'no-store');
  const tenant = requireVerifiedTenant(req);
  const documentId = validateUuid(req.params.documentId, 'documentId');
  const versions = await getTenantDocumentVersions(tenant, documentId);

  res.status(200).json({
    businessId: tenant.businessId,
    documentId,
    versions: versions.map(serializeVersionSummary),
  });
}

export async function handleReplaceDocumentVersion(req: Request, res: Response): Promise<void> {
  res.set('Cache-Control', 'no-store');
  const auth = requireVerifiedAuth(req);
  const tenant = requireVerifiedTenant(req);
  const documentId = validateUuid(req.params.documentId, 'documentId');
  const input = validateReplaceDocumentUpload(requireUploadPayload(req));
  const created = await replaceTenantDocumentVersion(tenant, auth, documentId, input);

  res.status(201).json({
    businessId: tenant.businessId,
    document: serializeDocument(created.document),
    version: serializeVersion(created.version),
  });
}

export async function handleGetDocumentVersion(req: Request, res: Response): Promise<void> {
  res.set('Cache-Control', 'no-store');
  const tenant = requireVerifiedTenant(req);
  const documentId = validateUuid(req.params.documentId, 'documentId');
  const versionId = validateUuid(req.params.versionId, 'versionId');
  const version = await getTenantDocumentVersion(tenant, documentId, versionId);

  res.status(200).json({
    businessId: tenant.businessId,
    version: serializeVersion(version),
  });
}

export async function handleRetryDocumentVersion(req: Request, res: Response): Promise<void> {
  res.set('Cache-Control', 'no-store');
  const tenant = requireVerifiedTenant(req);
  const documentId = validateUuid(req.params.documentId, 'documentId');
  const versionId = validateUuid(req.params.versionId, 'versionId');
  const result = await retryTenantDocumentVersion(tenant, documentId, versionId);

  res.status(200).json({
    businessId: tenant.businessId,
    document: serializeDocument(result.document),
    version: serializeVersionSummary(result.version),
  });
}

export async function handleListDocumentIngestionJobs(req: Request, res: Response): Promise<void> {
  res.set('Cache-Control', 'no-store');
  const tenant = requireVerifiedTenant(req);
  const documentId = validateUuid(req.params.documentId, 'documentId');
  const jobs = await getTenantDocumentIngestionJobs(tenant, documentId);

  res.status(200).json({
    businessId: tenant.businessId,
    documentId,
    jobs: jobs.map(serializeStaffIngestionJob),
  });
}

function serializeDocumentChunk(chunk: DocumentChunkRecord) {
  return {
    id: chunk.id,
    businessId: chunk.businessId,
    documentId: chunk.documentId,
    documentVersionId: chunk.documentVersionId,
    locationId: chunk.locationId,
    visibility: chunk.visibility,
    chunkVersion: chunk.chunkVersion,
    chunkIndex: chunk.chunkIndex,
    headingPath: chunk.headingPath,
    charStart: chunk.charStart,
    charEnd: chunk.charEnd,
    charCount: chunk.charCount,
    contentSha256: chunk.contentSha256,
    chunkText: chunk.chunkText,
    createdAt: chunk.createdAt.toISOString(),
  };
}

export async function handleGetDocumentProcessingStatus(req: Request, res: Response): Promise<void> {
  res.set('Cache-Control', 'no-store');
  const tenant = requireVerifiedTenant(req);
  const documentId = validateUuid(req.params.documentId, 'documentId');
  const status = await getTenantDocumentProcessingStatus(tenant, documentId);

  res.status(200).json({
    businessId: tenant.businessId,
    document: serializeDocument(status.document),
    latestVersion: status.latestVersion ? serializeVersionSummary(status.latestVersion) : null,
    latestJob: status.latestJob ? serializeStaffIngestionJob(status.latestJob) : null,
  });
}

export async function handleListDocumentVersionChunks(req: Request, res: Response): Promise<void> {
  res.set('Cache-Control', 'no-store');
  const tenant = requireVerifiedTenant(req);
  const documentId = validateUuid(req.params.documentId, 'documentId');
  const versionId = validateUuid(req.params.versionId, 'versionId');
  const chunks = await getTenantDocumentVersionChunks(tenant, documentId, versionId);

  res.status(200).json({
    businessId: tenant.businessId,
    documentId,
    versionId,
    chunks: chunks.map(serializeDocumentChunk),
  });
}
