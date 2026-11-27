import { Router } from 'express';
import { aiRouter } from '../modules/ai/ai.routes.js';
import { healthRouter } from '../modules/health/health.routes.js';

export const apiRouter = Router();

apiRouter.use('/health', healthRouter);
apiRouter.use('/ai', aiRouter);
