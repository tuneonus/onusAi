import type { Request, Response } from 'express';
import { validateUuid } from '../auth/auth.validation.js';
import {
  completeIngestionJob,
  failIngestionJob,
  leaseNextIngestionJob,
} from './ingestion-jobs.repository.js';
import type { IngestionJobRecord } from './ingestion-jobs.types.js';
import {
  validateCompleteJobInput,
  validateFailJobInput,
  validateLeaseJobInput,
} from './ingestion-jobs.validation.js';

export function serializeIngestionJob(job: IngestionJobRecord) {
  return {
    id: job.id,
    businessId: job.businessId,
    documentId: job.documentId,
    documentVersionId: job.documentVersionId,
    status: job.status,
    attemptCount: job.attemptCount,
    maxAttempts: job.maxAttempts,
    nextAttemptAt: job.nextAttemptAt.toISOString(),
    leaseToken: job.leaseToken,
    leasedBy: job.leasedBy,
    leasedAt: job.leasedAt ? job.leasedAt.toISOString() : null,
    leaseExpiresAt: job.leaseExpiresAt ? job.leaseExpiresAt.toISOString() : null,
    lastError: job.lastError,
    completedAt: job.completedAt ? job.completedAt.toISOString() : null,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
  };
}

export function serializeStaffIngestionJob(job: IngestionJobRecord) {
  return {
    id: job.id,
    businessId: job.businessId,
    documentId: job.documentId,
    documentVersionId: job.documentVersionId,
    status: job.status,
    attemptCount: job.attemptCount,
    maxAttempts: job.maxAttempts,
    nextAttemptAt: job.nextAttemptAt.toISOString(),
    leasedBy: job.leasedBy,
    leasedAt: job.leasedAt ? job.leasedAt.toISOString() : null,
    leaseExpiresAt: job.leaseExpiresAt ? job.leaseExpiresAt.toISOString() : null,
    lastError: job.lastError,
    completedAt: job.completedAt ? job.completedAt.toISOString() : null,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
  };
}

export async function handleLeaseIngestionJob(req: Request, res: Response): Promise<void> {
  res.set('Cache-Control', 'no-store');
  const input = validateLeaseJobInput(req.body);
  const leased = await leaseNextIngestionJob(input.workerId, input.leaseDurationSeconds);

  if (!leased) {
    res.status(200).json({ job: null });
    return;
  }

  res.status(200).json({
    job: serializeIngestionJob(leased.job),
    document: leased.document,
  });
}

export async function handleCompleteIngestionJob(req: Request, res: Response): Promise<void> {
  res.set('Cache-Control', 'no-store');
  const jobId = validateUuid(req.params.jobId, 'jobId');
  const input = validateCompleteJobInput(req.body);
  const job = await completeIngestionJob(jobId, input);

  res.status(200).json({ job: serializeIngestionJob(job) });
}

export async function handleFailIngestionJob(req: Request, res: Response): Promise<void> {
  res.set('Cache-Control', 'no-store');
  const jobId = validateUuid(req.params.jobId, 'jobId');
  const input = validateFailJobInput(req.body);
  const job = await failIngestionJob(jobId, input);

  res.status(200).json({ job: serializeIngestionJob(job) });
}

