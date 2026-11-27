import { Router } from 'express';
import { branding } from '../../config/branding.js';

export const brandingRouter = Router();

brandingRouter.get('/', (_req, res) => {
  res.set('Cache-Control', 'public, max-age=300');
  res.status(200).json(branding);
});

