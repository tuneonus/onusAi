import { Router } from 'express';
import { branding } from '../../config/branding.js';
import { checkDatabaseReadiness } from '../../integrations/database/postgres.js';

export const healthRouter = Router();

healthRouter.get('/', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    service: branding.productName,
    timestamp: new Date().toISOString(),
  });
});

healthRouter.get('/ready', async (_req, res) => {
  res.set('Cache-Control', 'no-store');
  await checkDatabaseReadiness();
  res.status(200).json({ status: 'ok', database: 'ready' });
});
