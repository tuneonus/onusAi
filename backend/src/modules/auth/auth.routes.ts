import { Router } from 'express';
import { requireAuth, requireCsrf } from '../../middlewares/auth.js';
import { handleGetMe, handleLogin, handleLogout } from './auth.controller.js';

export const authRouter = Router();

authRouter.post('/login', handleLogin);
authRouter.post('/logout', requireAuth, requireCsrf, handleLogout);
authRouter.get('/me', requireAuth, handleGetMe);

