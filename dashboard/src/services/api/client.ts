import { appEnv } from '../../config/env.ts';
import type { ApiErrorBody } from '../../types/api.ts';
import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME, readCookie } from '../../utils/cookies.ts';

const SAFE_HTTP_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

let memoryCsrfToken: string | null = null;
let unauthorizedHandler: (() => void) | null = null;

export function setCsrfToken(token: string | null): void {
  memoryCsrfToken = token;
}

export function getCsrfToken(): string | null {
  return memoryCsrfToken ?? readCookie(CSRF_COOKIE_NAME);
}

export function setUnauthorizedHandler(handler: (() => void) | null): void {
  unauthorizedHandler = handler;
}

export class ApiClientError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId: string | null;
  readonly retryAfterSeconds: number | null;

  constructor(params: {
    status: number;
    code: string;
    message: string;
    requestId?: string | null;
    retryAfterSeconds?: number | null;
  }) {
    super(params.message);
    this.name = 'ApiClientError';
    this.status = params.status;
    this.code = params.code;
    this.requestId = params.requestId ?? null;
    this.retryAfterSeconds = params.retryAfterSeconds ?? null;
  }
}

export interface ApiRequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  skipUnauthorizedHandler?: boolean;
}

function buildApiUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${appEnv.apiBaseUrl}/api/v1${normalizedPath}`;
}

function parseRetryAfter(value: string | null): number | null {
  if (!value) {
    return null;
  }

  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
}

function isApiErrorBody(value: unknown): value is ApiErrorBody {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;

  if (typeof record.error !== 'object' || record.error === null) {
    return false;
  }

  const error = record.error as Record<string, unknown>;
  return typeof error.code === 'string' && typeof error.message === 'string';
}

export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const method = (options.method ?? 'GET').toUpperCase();
  const headers = new Headers(options.headers);
  headers.set('Accept', 'application/json');

  if (options.body !== undefined) {
    headers.set('Content-Type', 'application/json');
  }

  if (!SAFE_HTTP_METHODS.has(method)) {
    const csrfToken = getCsrfToken();

    if (csrfToken) {
      headers.set(CSRF_HEADER_NAME, csrfToken);
    }
  }

  let response: Response;

  try {
    response = await fetch(buildApiUrl(path), {
      method,
      headers,
      credentials: 'include',
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: options.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error;
    }

    throw new ApiClientError({
      status: 0,
      code: 'NETWORK_ERROR',
      message: 'Unable to reach the backend API service.',
    });
  }

  const requestId = response.headers.get('X-Request-Id');
  const retryAfterSeconds = parseRetryAfter(response.headers.get('Retry-After'));
  const contentType = response.headers.get('Content-Type') ?? '';
  const isJson = contentType.includes('application/json');

  let parsedBody: unknown = null;

  if (isJson) {
    try {
      parsedBody = await response.json();
    } catch {
      parsedBody = null;
    }
  }

  if (!response.ok) {
    if (response.status === 401 && !options.skipUnauthorizedHandler) {
      setCsrfToken(null);
      unauthorizedHandler?.();
    }

    if (isApiErrorBody(parsedBody)) {
      throw new ApiClientError({
        status: response.status,
        code: parsedBody.error.code,
        message: parsedBody.error.message,
        requestId,
        retryAfterSeconds,
      });
    }

    throw new ApiClientError({
      status: response.status,
      code: 'HTTP_ERROR',
      message: `Request failed with HTTP status ${response.status}.`,
      requestId,
      retryAfterSeconds,
    });
  }

  return parsedBody as T;
}
