import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { verifyInternalWorkerToken, type VerifiedWorkerTokenContext } from '../integrations/ai/ai-auth.js';
import { HttpError } from '../utils/http-error.js';

declare global {
  namespace Express {
    interface Request {
      internalWorker?: VerifiedWorkerTokenContext;
    }
  }
}

export function requireInternalWorkerAuth(requiredScope: string): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      res.set('WWW-Authenticate', 'Bearer');
      next(new HttpError(401, 'INTERNAL_AUTH_REQUIRED', 'Internal service authorization is required.'));
      return;
    }

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0]?.toLowerCase() !== 'bearer' || !parts[1]) {
      res.set('WWW-Authenticate', 'Bearer');
      next(new HttpError(401, 'INTERNAL_AUTH_REQUIRED', 'Authorization header must use Bearer token.'));
      return;
    }

    try {
      req.internalWorker = verifyInternalWorkerToken(parts[1], requiredScope);
      next();
    } catch (error) {
      if (error instanceof HttpError && error.statusCode === 401) {
        res.set('WWW-Authenticate', 'Bearer');
      }
      next(error);
    }
  };
}

