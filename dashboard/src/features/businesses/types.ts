import type { WeeklyOpeningHours } from '../../types/schedule.ts';
import type { BusinessRole } from '../auth/types';

export {
  DAYS_OF_WEEK,
  type DayOfWeek,
  type DayOpeningHours,
  type WeeklyOpeningHours,
} from '../../types/schedule.ts';

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
  createdAt: string;
  updatedAt: string;
}

export interface BusinessProfileResponse {
  business: BusinessProfile;
  membership: {
    id: string;
    role: BusinessRole;
  };
}

export interface CreateBusinessPayload {
  name: string;
  description: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  websiteUrl: string | null;
  timezone: string | null;
  openingHours: WeeklyOpeningHours | null;
  retentionDays: number | null;
}

export type UpdateBusinessPayload = Partial<CreateBusinessPayload>;

export interface BusinessFormValues {
  name: string;
  description: string;
  contactEmail: string;
  contactPhone: string;
  websiteUrl: string;
  timezone: string;
  retentionDays: string;
  openingHours: WeeklyOpeningHours | null;
}
