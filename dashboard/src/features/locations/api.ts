import { apiRequest } from '../../services/api/client.ts';
import type {
  BusinessLocation,
  CreateLocationPayload,
  UpdateLocationPayload,
} from './types';

export function listBusinessLocations(
  businessId: string,
  includeArchived: boolean,
  signal?: AbortSignal,
): Promise<{ businessId: string; locations: BusinessLocation[] }> {
  const query = includeArchived ? '?includeArchived=true' : '?includeArchived=false';
  return apiRequest<{ businessId: string; locations: BusinessLocation[] }>(
    `/businesses/${businessId}/locations${query}`,
    { signal },
  );
}

export function getBusinessLocation(
  businessId: string,
  locationId: string,
  signal?: AbortSignal,
): Promise<{ businessId: string; location: BusinessLocation }> {
  return apiRequest<{ businessId: string; location: BusinessLocation }>(
    `/businesses/${businessId}/locations/${locationId}`,
    { signal },
  );
}

export function createBusinessLocation(
  businessId: string,
  payload: CreateLocationPayload,
): Promise<{ businessId: string; location: BusinessLocation }> {
  return apiRequest<{ businessId: string; location: BusinessLocation }>(
    `/businesses/${businessId}/locations`,
    {
      method: 'POST',
      body: payload,
    },
  );
}

export function updateBusinessLocation(
  businessId: string,
  locationId: string,
  payload: UpdateLocationPayload,
): Promise<{ businessId: string; location: BusinessLocation }> {
  return apiRequest<{ businessId: string; location: BusinessLocation }>(
    `/businesses/${businessId}/locations/${locationId}`,
    {
      method: 'PATCH',
      body: payload,
    },
  );
}

export function archiveBusinessLocation(
  businessId: string,
  locationId: string,
): Promise<{ businessId: string; location: BusinessLocation }> {
  return apiRequest<{ businessId: string; location: BusinessLocation }>(
    `/businesses/${businessId}/locations/${locationId}`,
    {
      method: 'DELETE',
    },
  );
}
