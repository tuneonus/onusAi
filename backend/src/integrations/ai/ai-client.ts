import { env } from '../../config/env.js';
import { HttpError } from '../../utils/http-error.js';

export interface AiHealthResponse {
  status: 'ok';
}

export async function getAiHealth(): Promise<AiHealthResponse> {
  const timeoutSignal = AbortSignal.timeout(env.aiServiceTimeoutMs);
  let response: Response | undefined;

  try {
    response = await fetch(`${env.aiServiceUrl}/api/v1/health`, {
      method: 'GET',
      headers: { accept: 'application/json' },
      signal: timeoutSignal,
      // A health check must not follow redirects to another destination.
      redirect: 'manual',
    });

    const contentType = response.headers.get('content-type')
      ?.split(';')[0]?.trim().toLowerCase();

    if (response.status !== 200 || contentType !== 'application/json') {
      await response.body?.cancel();
      throw new Error('Invalid AI health response.');
    }

    // External JSON remains untrusted even when the endpoint returns HTTP 200.
    const body: unknown = await response.json();

    if (
      typeof body !== 'object' || body === null || Array.isArray(body) ||
      !('status' in body) || body.status !== 'ok'
    ) {
      throw new Error('Invalid AI health response.');
    }

    // Return only the agreed contract; do not forward arbitrary upstream fields.
    return { status: 'ok' };
  } catch {
    if (timeoutSignal.aborted) {
      throw new HttpError(504, 'AI_SERVICE_TIMEOUT', 'AI service request timed out.');
    }

    if (response) {
      throw new HttpError(502, 'AI_SERVICE_INVALID_RESPONSE', 'AI service returned an invalid response.');
    }

    throw new HttpError(503, 'AI_SERVICE_UNAVAILABLE', 'AI service is unavailable.');
  }
}
