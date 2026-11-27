import type {
  AiHealthStatus,
  ApiHealthStatus,
  DatabaseReadinessStatus,
  PublicBranding,
} from '../../types/api';
import { apiRequest } from './client';

export function getBranding(signal?: AbortSignal): Promise<PublicBranding> {
  return apiRequest<PublicBranding>('/branding', { signal });
}

export function getApiHealth(signal?: AbortSignal): Promise<ApiHealthStatus> {
  return apiRequest<ApiHealthStatus>('/health', { signal });
}

export function getReadinessHealth(signal?: AbortSignal): Promise<DatabaseReadinessStatus> {
  return apiRequest<DatabaseReadinessStatus>('/health/ready', { signal });
}

export function getAiHealth(signal?: AbortSignal): Promise<AiHealthStatus> {
  return apiRequest<AiHealthStatus>('/ai/health', { signal });
}

