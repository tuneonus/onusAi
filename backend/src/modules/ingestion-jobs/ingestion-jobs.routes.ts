import { Router } from 'express';
import { requireInternalWorkerAuth } from '../../middlewares/internal-auth.js';
import {
  handleCompleteIngestionJob,
  handleFailIngestionJob,
  handleLeaseIngestionJob,
} from './ingestion-jobs.controller.js';

export const internalIngestionJobsRouter = Router();

internalIngestionJobsRouter.use(requireInternalWorkerAuth('ingestion:worker'));

internalIngestionJobsRouter.post('/lease', handleLeaseIngestionJob);
internalIngestionJobsRouter.post('/:jobId/complete', handleCompleteIngestionJob);
internalIngestionJobsRouter.post('/:jobId/fail', handleFailIngestionJob);

