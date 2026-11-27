import type { BusinessRole } from '../../types/express.js';

export const DAYS_OF_WEEK = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const;

export type DayOfWeek = (typeof DAYS_OF_WEEK)[number];

export type DayOpeningHours =
  | { closed: true }
  | { closed: false; open: string; close: string };

export type WeeklyOpeningHours = Record<DayOfWeek, DayOpeningHours>;

export interface LocationAddress {
  line1: string;
  line2: string | null;
  city: string;
  stateRegion: string | null;
  postalCode: string | null;
  countryCode: string;
}

export interface BusinessProfile {
  id: string;
  name: string;
  description: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  websiteUrl: string | null;
  timezone: string | null;
  openingHours: WeeklyOpeningHours | null;
  retentionDays: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateBusinessInput {
  name: string;
  description: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  websiteUrl: string | null;
  timezone: string | null;
  openingHours: WeeklyOpeningHours | null;
  retentionDays: number | null;
}

export interface UpdateBusinessInput {
  name?: string;
  description?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  websiteUrl?: string | null;
  timezone?: string | null;
  openingHours?: WeeklyOpeningHours | null;
  retentionDays?: number | null;
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
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateLocationInput {
  name: string;
  timezone: string;
  address: LocationAddress | null;
  contactEmail: string | null;
  contactPhone: string | null;
  openingHours: WeeklyOpeningHours | null;
}

export interface UpdateLocationInput {
  name?: string;
  timezone?: string;
  address?: LocationAddress | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  openingHours?: WeeklyOpeningHours | null;
}

export interface BusinessMemberSummary {
  membershipId: string;
  userId: string;
  email: string;
  displayName: string;
  role: BusinessRole;
  createdAt: Date;
}

