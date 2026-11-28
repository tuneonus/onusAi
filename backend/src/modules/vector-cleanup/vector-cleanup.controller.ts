import type { Request, Response } from 'express';
import { validateUuid } from '../auth/auth.validation.js';
import { validateLeaseJobInput } from '../ingestion-jobs/ingestion-jobs.validation.js';
import {
  completeVectorCleanupJob,
  failVectorCleanupJob,
  leaseNextVectorCleanupJob,
} from './vector-cleanup.repository.js';
import type { VectorCleanupJobRecord } from './vector-cleanup.types.js';
import {
  validateCompleteCleanupJobInput,
  validateFailCleanupJobInput,
} from './vector-cleanup.validation.js';

function serializeCleanupJob(job: VectorCleanupJobRecord) {
  return {
    id: job.id,
    businessId: job.businessId,
    documentId: job.documentId,
    documentVersionId: job.documentVersionId,
    qdrantCollection: job.qdrantCollection,
    jobType: job.jobType,
    payload: job.payload,
    status: job.status,
    attemptCount: job.attemptCount,
    maxAttempts: job.maxAttempts,
    leaseToken: job.leaseToken,
    lastError: job.lastError,
  };
}

export async function handleLeaseCleanupJob(req: Request, res: Response): Promise<void> {
  res.set('Cache-Control', 'no-store');
  const input = validateLeaseJobInput(req.body);
  const job = await leaseNextVectorCleanupJob(input.workerId, input.leaseDurationSeconds);
  res.status(200).json({ job: job ? serializeCleanupJob(job) : null });
}

export async function handleCompleteCleanupJob(req: Request, res: Response): Promise<void> {
  res.set('Cache-Control', 'no-store');
  const jobId = validateUuid(req.params.jobId, 'jobId');
  const input = validateCompleteCleanupJobInput(req.body);
  const job = await completeVectorCleanupJob(jobId, input);
  res.status(200).json({ job: serializeCleanupJob(job) });
}

export async function handleFailCleanupJob(req: Request, res: Response): Promise<void> {
  res.set('Cache-Control', 'no-store');
  const jobId = validateUuid(req.params.jobId, 'jobId');
  const input = validateFailCleanupJobInput(req.body);
  const job = await failVectorCleanupJob(jobId, input);
  res.status(200).json({ job: serializeCleanupJob(job) });
}

