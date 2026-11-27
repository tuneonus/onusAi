import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export const REQUEST_ID_HEADER = 'x-request-id';
const VALID_REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{8,64}$/;

export function normalizeRequestId(value: unknown): string {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (VALID_REQUEST_ID_PATTERN.test(trimmed)) {
      return trimmed;
    }
  }

  return randomUUID();
}

/**
 * Attach a validated correlation ID to each request and echo it via X-Request-Id.
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const requestId = normalizeRequestId(req.header(REQUEST_ID_HEADER));
  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);
  next();
}

