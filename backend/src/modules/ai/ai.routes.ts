import { Router } from 'express';
import { getAiHealth } from '../../integrations/ai/ai-client.js';

export const aiRouter = Router();

aiRouter.get('/health', async (_req, res) => {
  const health = await getAiHealth();
  res.status(200).json(health);
});
