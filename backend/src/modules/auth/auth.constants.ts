import type { CookieOptions, Response } from 'express';
import { env } from '../../config/env.js';

export const SESSION_COOKIE_NAME = 'onusai_session';
export const CSRF_COOKIE_NAME = 'onusai_csrf';
export const CSRF_HEADER_NAME = 'x-csrf-token';

function isSecureCookie(): boolean {
  return env.nodeEnv === 'production';
}

export function buildSessionCookieOptions(maxAgeMs: number): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: isSecureCookie(),
    path: '/api/v1',
    maxAge: maxAgeMs,
  };
}

export function buildCsrfCookieOptions(maxAgeMs: number): CookieOptions {
  return {
    httpOnly: false,
    sameSite: 'lax',
    secure: isSecureCookie(),
    path: '/',
    maxAge: maxAgeMs,
  };
}

export function clearAuthCookies(res: Response): void {
  res.clearCookie(SESSION_COOKIE_NAME, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isSecureCookie(),
    path: '/api/v1',
  });
  res.clearCookie(CSRF_COOKIE_NAME, {
    httpOnly: false,
    sameSite: 'lax',
    secure: isSecureCookie(),
    path: '/',
  });
}

