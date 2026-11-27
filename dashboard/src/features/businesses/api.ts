import { apiRequest } from '../../services/api/client';
import type { UserMembershipSummary } from '../auth/types';
import type {
  BusinessProfileResponse,
  CreateBusinessPayload,
  UpdateBusinessPayload,
} from './types';

export function listUserBusinesses(
  signal?: AbortSignal,
): Promise<{ businesses: UserMembershipSummary[] }> {
  return apiRequest<{ businesses: UserMembershipSummary[] }>('/businesses', { signal });
}

export function createBusiness(payload: CreateBusinessPayload): Promise<BusinessProfileResponse> {
  return apiRequest<BusinessProfileResponse>('/businesses', {
    method: 'POST',
    body: payload,
  });
}

export function getBusinessProfile(
  businessId: string,
  signal?: AbortSignal,
): Promise<BusinessProfileResponse> {
  return apiRequest<BusinessProfileResponse>(`/businesses/${businessId}`, { signal });
}

export function updateBusinessProfile(
  businessId: string,
  payload: UpdateBusinessPayload,
): Promise<BusinessProfileResponse> {
  return apiRequest<BusinessProfileResponse>(`/businesses/${businessId}`, {
    method: 'PATCH',
    body: payload,
  });
}

