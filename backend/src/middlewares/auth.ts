import type { NextFunction, Request, Response } from 'express';
import {
  clearAuthCookies,
  CSRF_HEADER_NAME,
  SESSION_COOKIE_NAME,
} from '../modules/auth/auth.constants.js';
import { authenticateSessionToken } from '../modules/auth/auth.service.js';
import { parseCookies } from '../utils/cookies.js';
import { HttpError } from '../utils/http-error.js';
import { safeTokenMatchesHash } from '../utils/tokens.js';

const SAFE_HTTP_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const cookies = parseCookies(req.headers.cookie);
  const sessionToken = cookies[SESSION_COOKIE_NAME];

  if (!sessionToken) {
    res.set('Cache-Control', 'no-store');
    next(new HttpError(401, 'AUTHENTICATION_REQUIRED', 'Authentication is required.'));
    return;
  }

  const auth = await authenticateSessionToken(sessionToken);

  if (!auth) {
    clearAuthCookies(res);
    res.set('Cache-Control', 'no-store');
    next(new HttpError(401, 'AUTHENTICATION_REQUIRED', 'Authentication is required.'));
    return;
  }

  req.auth = auth;
  next();
}

export function requireCsrf(req: Request, _res: Response, next: NextFunction): void {
  if (SAFE_HTTP_METHODS.has(req.method.toUpperCase())) {
    next();
    return;
  }

  if (!req.auth) {
    next(new HttpError(401, 'AUTHENTICATION_REQUIRED', 'Authentication is required.'));
    return;
  }

  const csrfToken = req.header(CSRF_HEADER_NAME);

  if (!csrfToken || !safeTokenMatchesHash(csrfToken, req.auth.session.csrfTokenHash)) {
    next(new HttpError(403, 'CSRF_TOKEN_INVALID', 'Invalid or missing CSRF token.'));
    return;
  }

  next();
}

