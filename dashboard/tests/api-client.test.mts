import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ApiClientError,
  apiRequest,
  setCsrfToken,
  setUnauthorizedHandler,
} from '../src/services/api/client.ts';

test('apiRequest attaches credentials, CSRF header on mutations, and handles 401/429', async () => {
  const originalFetch = globalThis.fetch;
  const recorded: Array<{ url: string; method: string; csrf: string | null; credentials?: RequestCredentials }> = [];

  try {
    setCsrfToken('csrf-secret-123');
    let unauthorizedCalls = 0;
    setUnauthorizedHandler(() => {
      unauthorizedCalls += 1;
    });

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      recorded.push({
        url: String(input),
        method: init?.method ?? 'GET',
        csrf: headers.get('X-CSRF-Token'),
        credentials: init?.credentials,
      });

      if (String(input).endsWith('/businesses')) {
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (String(input).endsWith('/auth/login')) {
        return new Response(
          JSON.stringify({ error: { code: 'TOO_MANY_LOGIN_ATTEMPTS', message: 'Locked' } }),
          {
            status: 429,
            headers: {
              'Content-Type': 'application/json',
              'Retry-After': '45',
              'X-Request-Id': 'req-429',
            },
          },
        );
      }

      return new Response(
        JSON.stringify({ error: { code: 'AUTHENTICATION_REQUIRED', message: 'Expired' } }),
        {
          status: 401,
          headers: { 'Content-Type': 'application/json', 'X-Request-Id': 'req-401' },
        },
      );
    }) as typeof fetch;

    const getRes = await apiRequest<{ ok: boolean }>('/businesses');
    assert.equal(getRes.ok, true);
    assert.equal(recorded[0].csrf, null);
    assert.equal(recorded[0].credentials, 'include');

    await apiRequest<{ ok: boolean }>('/businesses', { method: 'POST', body: { name: 'Acme' } });
    assert.equal(recorded[1].csrf, 'csrf-secret-123');

    await assert.rejects(
      () => apiRequest('/auth/login', { method: 'POST', body: {}, skipUnauthorizedHandler: true }),
      (error: unknown) =>
        error instanceof ApiClientError &&
        error.status === 429 &&
        error.retryAfterSeconds === 45 &&
        error.requestId === 'req-429',
    );
    assert.equal(unauthorizedCalls, 0);

    await assert.rejects(
      () => apiRequest('/businesses/123', { method: 'PATCH', body: { name: 'Updated' } }),
      (error: unknown) =>
        error instanceof ApiClientError &&
        error.status === 401 &&
        error.code === 'AUTHENTICATION_REQUIRED',
    );
    assert.equal(unauthorizedCalls, 1);
  } finally {
    setCsrfToken(null);
    setUnauthorizedHandler(null);
    globalThis.fetch = originalFetch;
  }
});

