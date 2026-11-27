import type { Request, Response } from 'express';
import { env } from '../../config/env.js';
import { parseCookies } from '../../utils/cookies.js';
import { HttpError } from '../../utils/http-error.js';
import {
  buildCsrfCookieOptions,
  buildSessionCookieOptions,
  clearAuthCookies,
  CSRF_COOKIE_NAME,
  SESSION_COOKIE_NAME,
} from './auth.constants.js';
import { getCurrentAuthContext, loginStaff, logoutStaff } from './auth.service.js';
import { validateLoginInput } from './auth.validation.js';

export async function handleLogin(req: Request, res: Response): Promise<void> {
  res.set('Cache-Control', 'no-store');
  const { email, password } = validateLoginInput(req.body);
  const result = await loginStaff({
    email,
    password,
    clientIp: req.ip ?? 'unknown',
  });

  res.cookie(SESSION_COOKIE_NAME, result.sessionToken, buildSessionCookieOptions(env.authSessionTtlMs));
  res.cookie(CSRF_COOKIE_NAME, result.csrfToken, buildCsrfCookieOptions(env.authSessionTtlMs));

  res.status(200).json({
    user: result.user,
    memberships: result.memberships,
    session: {
      expiresAt: result.expiresAt.toISOString(),
      csrfToken: result.csrfToken,
    },
  });
}

export async function handleLogout(req: Request, res: Response): Promise<void> {
  res.set('Cache-Control', 'no-store');

  if (!req.auth) {
    throw new HttpError(401, 'AUTHENTICATION_REQUIRED', 'Authentication is required.');
  }

  await logoutStaff(req.auth.session.id);
  clearAuthCookies(res);
  res.status(200).json({ status: 'ok' });
}

export async function handleGetMe(req: Request, res: Response): Promise<void> {
  res.set('Cache-Control', 'no-store');

  if (!req.auth) {
    throw new HttpError(401, 'AUTHENTICATION_REQUIRED', 'Authentication is required.');
  }

  const cookies = parseCookies(req.headers.cookie);
  const payload = await getCurrentAuthContext(req.auth, cookies[CSRF_COOKIE_NAME]);
  res.status(200).json(payload);
}

