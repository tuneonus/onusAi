import { env } from '../../config/env.js';
import { normalizeRequestId } from '../../middlewares/request-id.js';
import { HttpError } from '../../utils/http-error.js';
import { createInternalServiceToken } from './ai-auth.js';
import {
  AI_CONTRACT_VERSION,
  buildDelegationClaims,
  validateAiRespondRequest,
  validateAiRespondResponse,
  type AiRespondRequest,
  type AiRespondResponse,
} from './ai-contract.js';

export interface AiHealthResponse {
  status: 'ok';
}

export type AiRespondInput = Omit<AiRespondRequest, 'contractVersion' | 'deadlineAtMs' | 'requestId'> & {
  requestId?: string;
};

export interface AiRespondCallOptions {
  timeoutMs?: number;
}

function resolveBoundedTimeoutMs(requestedTimeoutMs?: number): number {
  if (requestedTimeoutMs === undefined) {
    return env.aiServiceTimeoutMs;
  }

  if (!Number.isInteger(requestedTimeoutMs) || requestedTimeoutMs < 1) {
    throw new HttpError(400, 'AI_CONTRACT_VALIDATION_ERROR', 'timeoutMs must be a positive integer.');
  }

  return Math.min(requestedTimeoutMs, env.aiServiceTimeoutMs);
}

async function fetchAiJson(
  path: string,
  options: {
    method: 'GET' | 'POST';
    token: string;
    requestId?: string;
    timeoutMs: number;
    body?: string;
    extraHeaders?: Record<string, string>;
  },
): Promise<unknown> {
  const timeoutSignal = AbortSignal.timeout(options.timeoutMs);
  let response: Response | undefined;
  let failureKind: 'auth' | 'delegation' | 'timeout' | 'rate_limit' | undefined;

  try {
    const headers: Record<string, string> = {
      accept: 'application/json',
      authorization: `Bearer ${options.token}`,
      ...options.extraHeaders,
    };

    if (options.requestId) {
      headers['x-request-id'] = options.requestId;
    }

    if (options.body !== undefined) {
      headers['content-type'] = 'application/json';
    }

    const requestInit: RequestInit = {
      method: options.method,
      headers,
      signal: timeoutSignal,
      // Internal service calls must never follow redirects to another destination.
      redirect: 'manual',
    };

    if (options.body !== undefined) {
      requestInit.body = options.body;
    }

    response = await fetch(`${env.aiServiceUrl}${path}`, requestInit);

    if (response.status === 401) {
      failureKind = 'auth';
      await response.body?.cancel();
      console.error('AI service rejected internal authentication.', {
        statusCode: response.status,
        requestId: options.requestId,
      });
      throw new Error('AI service authentication failed.');
    }

    if (response.status === 403) {
      failureKind = 'delegation';
      await response.body?.cancel();
      console.error('AI service rejected scoped authorization.', {
        statusCode: response.status,
        requestId: options.requestId,
      });
      throw new Error('AI service rejected request authorization.');
    }

    if (response.status === 429) {
      failureKind = 'rate_limit';
      await response.body?.cancel();
      throw new Error('AI provider rate limit exceeded.');
    }

    if (response.status === 504) {
      failureKind = 'timeout';
      await response.body?.cancel();
      throw new Error('AI service deadline exceeded.');
    }

    const contentType = response.headers.get('content-type')
      ?.split(';')[0]?.trim().toLowerCase();

    if (response.status !== 200 || contentType !== 'application/json') {
      await response.body?.cancel();
      throw new Error('Invalid AI service response.');
    }

    return (await response.json()) as unknown;
  } catch (error) {
    if (error instanceof HttpError) {
      throw error;
    }

    if (timeoutSignal.aborted || failureKind === 'timeout') {
      throw new HttpError(504, 'AI_SERVICE_TIMEOUT', 'AI service request timed out.');
    }

    if (failureKind === 'rate_limit') {
      throw new HttpError(429, 'AI_RATE_LIMITED', 'AI provider rate limit exceeded. Please try again later.');
    }

    if (failureKind === 'auth') {
      throw new HttpError(502, 'AI_SERVICE_AUTH_FAILED', 'AI service authentication failed.');
    }

    if (failureKind === 'delegation') {
      throw new HttpError(502, 'AI_SERVICE_DELEGATION_REJECTED', 'AI service rejected request authorization.');
    }

    if (response) {
      throw new HttpError(502, 'AI_SERVICE_INVALID_RESPONSE', 'AI service returned an invalid response.');
    }

    throw new HttpError(503, 'AI_SERVICE_UNAVAILABLE', 'AI service is unavailable.');
  }
}

export async function getAiHealth(requestId?: string): Promise<AiHealthResponse> {
  const correlationId = requestId ? normalizeRequestId(requestId) : undefined;
  const body = await fetchAiJson('/api/v1/internal/health', {
    method: 'GET',
    token: createInternalServiceToken('ai:health'),
    timeoutMs: env.aiServiceTimeoutMs,
    ...(correlationId ? { requestId: correlationId } : {}),
  });

  if (
    typeof body !== 'object' || body === null || Array.isArray(body) ||
    !('status' in body) || body.status !== 'ok'
  ) {
    throw new HttpError(502, 'AI_SERVICE_INVALID_RESPONSE', 'AI service returned an invalid response.');
  }

  // Return only the agreed contract; do not forward arbitrary upstream fields.
  return { status: 'ok' };
}

export async function requestAiResponse(
  input: AiRespondInput,
  options?: AiRespondCallOptions,
): Promise<AiRespondResponse> {
  const timeoutMs = resolveBoundedTimeoutMs(options?.timeoutMs);
  const requestId = normalizeRequestId(input.requestId);
  const deadlineAtMs = Date.now() + timeoutMs;

  const validatedRequest = validateAiRespondRequest({
    ...input,
    contractVersion: AI_CONTRACT_VERSION,
    requestId,
    deadlineAtMs,
  });

  const delegation = buildDelegationClaims(validatedRequest);
  const token = createInternalServiceToken('ai:respond', {
    delegation,
    maxTtlSeconds: Math.max(1, Math.ceil(timeoutMs / 1000)),
  });

  const rawBody = await fetchAiJson('/api/v1/internal/respond', {
    method: 'POST',
    token,
    requestId,
    timeoutMs,
    body: JSON.stringify(validatedRequest),
    extraHeaders: {
      'x-request-deadline-ms': String(deadlineAtMs),
    },
  });

  try {
    return validateAiRespondResponse(rawBody, requestId);
  } catch {
    throw new HttpError(502, 'AI_SERVICE_INVALID_RESPONSE', 'AI service returned an invalid response.');
  }
}
