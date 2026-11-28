import type { NextFunction, Request, Response } from 'express';
import { env } from '../../config/env.js';
import { HttpError } from '../../utils/http-error.js';
import type { RawDocumentUploadInput } from './documents.types.js';
import { parseJsonDocumentUploadBody } from './documents.validation.js';

const MULTIPART_FORM_OVERHEAD_BYTES = 32_768;

declare global {
  namespace Express {
    interface Request {
      documentUpload?: RawDocumentUploadInput;
    }
  }
}

async function readBoundedBody(req: Request, maxBytes: number): Promise<Buffer> {
  const contentLengthHeader = req.headers['content-length'];

  if (contentLengthHeader !== undefined) {
    const declaredLength = Number(contentLengthHeader);

    if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
      throw new HttpError(
        413,
        'PAYLOAD_TOO_LARGE',
        `Upload exceeds the maximum allowed size of ${env.documentMaxBytes} bytes.`,
      );
    }
  }

  const chunks: Buffer[] = [];
  let totalBytes = 0;

  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buf.byteLength;

    if (totalBytes > maxBytes) {
      throw new HttpError(
        413,
        'PAYLOAD_TOO_LARGE',
        `Upload exceeds the maximum allowed size of ${env.documentMaxBytes} bytes.`,
      );
    }

    chunks.push(buf);
  }

  return Buffer.concat(chunks, totalBytes);
}

export async function parseDocumentUploadRequest(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  if (req.is('application/json')) {
    req.documentUpload = parseJsonDocumentUploadBody(req.body);
    next();
    return;
  }

  const contentType = req.headers['content-type'];

  if (!contentType || !req.is('multipart/form-data')) {
    next(
      new HttpError(
        415,
        'UNSUPPORTED_MEDIA_TYPE',
        'Content-Type must be multipart/form-data or application/json.',
      ),
    );
    return;
  }

  const rawBody = await readBoundedBody(req, env.documentMaxBytes + MULTIPART_FORM_OVERHEAD_BYTES);
  let formData: FormData;

  try {
    formData = await new Response(new Uint8Array(rawBody), {
      headers: { 'content-type': contentType },
    }).formData();
  } catch {
    next(new HttpError(400, 'VALIDATION_ERROR', 'Malformed multipart/form-data upload payload.'));
    return;
  }

  const fileEntry = formData.get('file');

  if (!(fileEntry instanceof File)) {
    next(new HttpError(400, 'VALIDATION_ERROR', 'A file field is required in multipart/form-data.'));
    return;
  }

  const bytes = new Uint8Array(await fileEntry.arrayBuffer());
  const titleEntry = formData.get('title');
  const visibilityEntry = formData.get('visibility');
  const locationIdEntry = formData.get('locationId');

  req.documentUpload = {
    filename: fileEntry.name,
    mimeType: fileEntry.type || null,
    bytes,
    title: typeof titleEntry === 'string' ? titleEntry : undefined,
    visibility: typeof visibilityEntry === 'string' ? visibilityEntry : undefined,
    locationId: typeof locationIdEntry === 'string' ? locationIdEntry : undefined,
  };
  next();
}

