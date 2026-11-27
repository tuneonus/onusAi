import { Router } from 'express';
import { branding } from '../../config/branding.js';

export const healthRouter = Router();

healthRouter.get('/', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    service: branding.productName,
    timestamp: new Date().toISOString(),
  });
});
