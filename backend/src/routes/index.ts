import { Router } from 'express';
import { aiRouter } from '../modules/ai/ai.routes.js';
import { authRouter } from '../modules/auth/auth.routes.js';
import { brandingRouter } from '../modules/branding/branding.routes.js';
import { businessesRouter } from '../modules/businesses/businesses.routes.js';
import { healthRouter } from '../modules/health/health.routes.js';
import { internalIngestionJobsRouter } from '../modules/ingestion-jobs/ingestion-jobs.routes.js';
import { internalRetrievalRouter } from '../modules/retrieval/retrieval.routes.js';
import { internalVectorCleanupRouter } from '../modules/vector-cleanup/vector-cleanup.routes.js';

export const apiRouter = Router();

apiRouter.use('/health', healthRouter);
apiRouter.use('/branding', brandingRouter);
apiRouter.use('/ai', aiRouter);
apiRouter.use('/auth', authRouter);
apiRouter.use('/businesses', businessesRouter);
apiRouter.use('/internal/ingestion-jobs', internalIngestionJobsRouter);
apiRouter.use('/internal/retrieval', internalRetrievalRouter);
apiRouter.use('/internal/vector-cleanup-jobs', internalVectorCleanupRouter);
