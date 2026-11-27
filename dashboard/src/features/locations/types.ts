import type { WeeklyOpeningHours } from '../../types/schedule.ts';

export interface LocationAddress {
  line1: string;
  line2: string | null;
  city: string;
  stateRegion: string | null;
  postalCode: string | null;
  countryCode: string;
}

export interface BusinessLocation {
  id: string;
  businessId: string;
  name: string;
  address: LocationAddress | null;
  contactEmail: string | null;
  contactPhone: string | null;
  timezone: string | null;
  openingHours: WeeklyOpeningHours | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateLocationPayload {
  name: string;
  timezone: string;
  address: LocationAddress | null;
  contactEmail: string | null;
  contactPhone: string | null;
  openingHours: WeeklyOpeningHours | null;
}

export type UpdateLocationPayload = Partial<CreateLocationPayload>;

export interface LocationAddressFormValues {
  line1: string;
  line2: string;
  city: string;
  stateRegion: string;
  postalCode: string;
  countryCode: string;
}

export interface LocationFormValues {
  name: string;
  timezone: string;
  contactEmail: string;
  contactPhone: string;
  includeAddress: boolean;
  address: LocationAddressFormValues;
  openingHours: WeeklyOpeningHours | null;
}

export type LocationFilterMode = 'active' | 'archived' | 'all';

