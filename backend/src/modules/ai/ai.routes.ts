import { Router } from 'express';
import { getAiHealth } from '../../integrations/ai/ai-client.js';

export const aiRouter = Router();

aiRouter.get('/health', async (req, res) => {
  const health = await getAiHealth(req.requestId);
  res.set('Cache-Control', 'no-store');
  res.status(200).json(health);
});
