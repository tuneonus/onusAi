import type { NextFunction, Request, Response } from 'express';
import type { ApiErrorResponse } from '../types/api.js';
import { HttpError } from '../utils/http-error.js';

export function errorHandler(
  error: unknown,
  req: Request,
  res: Response<ApiErrorResponse>,
  next: NextFunction,
): void {
  if (res.headersSent) {
    next(error);
    return;
  }

  let statusCode = 500;
  let code = 'INTERNAL_SERVER_ERROR';
  let message = 'An unexpected error occurred.';

  if (error instanceof HttpError) {
    ({ statusCode, code, message } = error);

    if (error.headers) {
      for (const [name, value] of Object.entries(error.headers)) {
        res.setHeader(name, value);
      }
    }
  } else if (typeof error === 'object' && error !== null && 'type' in error) {
    // Parser messages can include request content; return fixed safe messages.
    switch (error.type) {
      case 'entity.parse.failed':
        statusCode = 400;
        code = 'INVALID_JSON';
        message = 'Request body must contain valid JSON.';
        break;
      case 'entity.too.large':
        statusCode = 413;
        code = 'PAYLOAD_TOO_LARGE';
        message = 'JSON request body exceeds the 100kb limit.';
        break;
      case 'charset.unsupported':
      case 'encoding.unsupported':
        statusCode = 415;
        code = 'UNSUPPORTED_ENCODING';
        message = 'Request body encoding is not supported.';
        break;
      case 'request.aborted':
      case 'request.size.invalid':
        statusCode = 400;
        code = 'INVALID_REQUEST_BODY';
        message = 'Request body is incomplete or invalid.';
        break;
    }
  }

  if (statusCode >= 500) {
    // Do not log arbitrary error messages, request bodies, or credentials.
    console.error('Unhandled request error.', {
      name: error instanceof Error ? error.name : 'UnknownError',
      requestId: req.requestId,
    });
  }

  res.status(statusCode).json({ error: { code, message } });
}
