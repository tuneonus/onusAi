import type { DayOfWeek } from '../../types/schedule.ts';
import {
  validateOpeningHoursValue,
  validateOptionalEmail,
  validateOptionalPhone,
  validateTimezoneValue,
} from '../../validation/common.ts';
import type {
  BusinessFormValues,
  BusinessProfile,
  CreateBusinessPayload,
  UpdateBusinessPayload,
} from './types.ts';

export {
  DAY_LABELS,
  buildDefaultOpeningHours,
  isOvernightShift,
  validateOpeningHoursValue,
  validateTimezoneValue,
} from '../../validation/common.ts';

export interface BusinessFormErrors {
  name?: string;
  description?: string;
  contactEmail?: string;
  contactPhone?: string;
  websiteUrl?: string;
  timezone?: string;
  retentionDays?: string;
  openingHours?: string;
  dayErrors?: Partial<Record<DayOfWeek, string>>;
}

export function businessProfileToFormValues(business: BusinessProfile): BusinessFormValues {
  return {
    name: business.name,
    description: business.description ?? '',
    contactEmail: business.contactEmail ?? '',
    contactPhone: business.contactPhone ?? '',
    websiteUrl: business.websiteUrl ?? '',
    timezone: business.timezone ?? '',
    retentionDays: business.retentionDays !== null ? String(business.retentionDays) : '',
    openingHours: business.openingHours,
  };
}

export function createEmptyBusinessFormValues(): BusinessFormValues {
  return {
    name: '',
    description: '',
    contactEmail: '',
    contactPhone: '',
    websiteUrl: '',
    timezone: '',
    retentionDays: '',
    openingHours: null,
  };
}

export function validateBusinessForm(values: BusinessFormValues): {
  valid: boolean;
  payload: CreateBusinessPayload;
  errors: BusinessFormErrors;
} {
  const errors: BusinessFormErrors = {};

  const name = values.name.trim();
  if (name.length < 1 || name.length > 160) {
    errors.name = 'Business name must be between 1 and 160 characters.';
  }

  const descriptionRaw = values.description.trim();
  if (descriptionRaw.length > 2000) {
    errors.description = 'Description must be at most 2000 characters.';
  }

  const emailResult = validateOptionalEmail(values.contactEmail, 'contact email');
  if (emailResult.error) {
    errors.contactEmail = emailResult.error;
  }

  const phoneResult = validateOptionalPhone(values.contactPhone, 'phone');
  if (phoneResult.error) {
    errors.contactPhone = phoneResult.error;
  }

  const websiteRaw = values.websiteUrl.trim();
  if (websiteRaw.length > 0) {
    if (websiteRaw.length > 500 || /\s/.test(websiteRaw)) {
      errors.websiteUrl = 'Website URL must be a valid HTTP(S) URL up to 500 characters.';
    } else {
      try {
        const parsed = new URL(websiteRaw);
        if (
          (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') ||
          parsed.username ||
          parsed.password
        ) {
          errors.websiteUrl = 'Website URL must use HTTP(S) without credentials.';
        }
      } catch {
        errors.websiteUrl = 'Enter a valid HTTP(S) URL (including https://).';
      }
    }
  }

  const timezoneRaw = values.timezone.trim();
  const timezoneError = validateTimezoneValue(timezoneRaw, false);
  if (timezoneError) {
    errors.timezone = timezoneError;
  }

  const retentionRaw = values.retentionDays.trim();
  let retentionDays: number | null = null;
  if (retentionRaw.length > 0) {
    if (!/^\d+$/.test(retentionRaw)) {
      errors.retentionDays = 'Retention days must be a whole number between 1 and 3650.';
    } else {
      const parsed = Number(retentionRaw);
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > 3650) {
        errors.retentionDays = 'Retention days must be between 1 and 3650.';
      } else {
        retentionDays = parsed;
      }
    }
  }

  if (values.openingHours) {
    const hoursValidation = validateOpeningHoursValue(values.openingHours);
    if (hoursValidation.summaryError) {
      errors.openingHours = hoursValidation.summaryError;
      errors.dayErrors = hoursValidation.dayErrors;
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    payload: {
      name,
      description: descriptionRaw.length > 0 ? descriptionRaw : null,
      contactEmail: emailResult.normalized,
      contactPhone: phoneResult.normalized,
      websiteUrl: websiteRaw.length > 0 ? websiteRaw : null,
      timezone: timezoneRaw.length > 0 ? timezoneRaw : null,
      openingHours: values.openingHours,
      retentionDays,
    },
    errors,
  };
}

export function buildBusinessPatchPayload(
  original: BusinessProfile,
  next: CreateBusinessPayload,
): UpdateBusinessPayload {
  const patch: UpdateBusinessPayload = {};

  if (next.name !== original.name) {
    patch.name = next.name;
  }
  if (next.description !== original.description) {
    patch.description = next.description;
  }
  if (next.contactEmail !== original.contactEmail) {
    patch.contactEmail = next.contactEmail;
  }
  if (next.contactPhone !== original.contactPhone) {
    patch.contactPhone = next.contactPhone;
  }
  if (next.websiteUrl !== original.websiteUrl) {
    patch.websiteUrl = next.websiteUrl;
  }
  if (next.timezone !== original.timezone) {
    patch.timezone = next.timezone;
  }
  if (next.retentionDays !== original.retentionDays) {
    patch.retentionDays = next.retentionDays;
  }
  if (JSON.stringify(next.openingHours) !== JSON.stringify(original.openingHours)) {
    patch.openingHours = next.openingHours;
  }

  return patch;
}
