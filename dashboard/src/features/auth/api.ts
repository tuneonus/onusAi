import { apiRequest } from '../../services/api/client';
import type { AuthContextPayload, LoginInput } from './types';

export function loginStaff(input: LoginInput): Promise<AuthContextPayload> {
  return apiRequest<AuthContextPayload>('/auth/login', {
    method: 'POST',
    body: {
      email: input.email,
      password: input.password,
    },
    skipUnauthorizedHandler: true,
  });
}

export function fetchCurrentSession(signal?: AbortSignal): Promise<AuthContextPayload> {
  return apiRequest<AuthContextPayload>('/auth/me', {
    signal,
    skipUnauthorizedHandler: true,
  });
}

export function logoutStaff(): Promise<{ status: string }> {
  return apiRequest<{ status: string }>('/auth/logout', {
    method: 'POST',
    skipUnauthorizedHandler: true,
  });
}

