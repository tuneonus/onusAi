import { Router } from 'express';
import { requireInternalWorkerAuth } from '../../middlewares/internal-auth.js';
import {
  handleCompleteCleanupJob,
  handleFailCleanupJob,
  handleLeaseCleanupJob,
} from './vector-cleanup.controller.js';

export const internalVectorCleanupRouter = Router();
internalVectorCleanupRouter.use(requireInternalWorkerAuth('ingestion:worker'));
internalVectorCleanupRouter.post('/lease', handleLeaseCleanupJob);
internalVectorCleanupRouter.post('/:jobId/complete', handleCompleteCleanupJob);
internalVectorCleanupRouter.post('/:jobId/fail', handleFailCleanupJob);

