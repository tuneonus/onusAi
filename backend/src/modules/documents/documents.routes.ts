import { Router } from 'express';
import { requireTenantMembership } from '../../middlewares/tenant.js';
import {
  handleCreateDocument,
  handleDeleteDocument,
  handleGetDocument,
  handleGetDocumentProcessingStatus,
  handleGetDocumentVersion,
  handleListDocumentIngestionJobs,
  handleListDocuments,
  handleListDocumentVersionChunks,
  handleListDocumentVersions,
  handleReplaceDocumentVersion,
  handleRetryDocumentVersion,
  handleUpdateDocument,
} from './documents.controller.js';
import { parseDocumentUploadRequest } from './documents.upload.js';

export const documentsRouter = Router({ mergeParams: true });

documentsRouter.get('/', requireTenantMembership(['owner', 'operator']), handleListDocuments);
documentsRouter.post(
  '/',
  requireTenantMembership(['owner']),
  parseDocumentUploadRequest,
  handleCreateDocument,
);

documentsRouter.get('/:documentId', requireTenantMembership(['owner', 'operator']), handleGetDocument);
documentsRouter.patch('/:documentId', requireTenantMembership(['owner']), handleUpdateDocument);
documentsRouter.delete('/:documentId', requireTenantMembership(['owner']), handleDeleteDocument);

documentsRouter.get(
  '/:documentId/status',
  requireTenantMembership(['owner', 'operator']),
  handleGetDocumentProcessingStatus,
);
documentsRouter.get(
  '/:documentId/jobs',
  requireTenantMembership(['owner', 'operator']),
  handleListDocumentIngestionJobs,
);
documentsRouter.get(
  '/:documentId/versions',
  requireTenantMembership(['owner', 'operator']),
  handleListDocumentVersions,
);
documentsRouter.post(
  '/:documentId/versions',
  requireTenantMembership(['owner']),
  parseDocumentUploadRequest,
  handleReplaceDocumentVersion,
);
documentsRouter.get(
  '/:documentId/versions/:versionId',
  requireTenantMembership(['owner', 'operator']),
  handleGetDocumentVersion,
);
documentsRouter.get(
  '/:documentId/versions/:versionId/chunks',
  requireTenantMembership(['owner', 'operator']),
  handleListDocumentVersionChunks,
);
documentsRouter.post(
  '/:documentId/versions/:versionId/retry',
  requireTenantMembership(['owner']),
  handleRetryDocumentVersion,
);

