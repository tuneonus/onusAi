import type { DayOfWeek } from '../../types/schedule.ts';
import {
  validateOpeningHoursValue,
  validateOptionalEmail,
  validateOptionalPhone,
  validateTimezoneValue,
} from '../../validation/common.ts';
import type {
  BusinessLocation,
  CreateLocationPayload,
  LocationAddress,
  LocationAddressFormValues,
  LocationFilterMode,
  LocationFormValues,
  UpdateLocationPayload,
} from './types.ts';

const COUNTRY_CODE_PATTERN = /^[A-Z]{2}$/;

export interface LocationAddressErrors {
  line1?: string;
  line2?: string;
  city?: string;
  stateRegion?: string;
  postalCode?: string;
  countryCode?: string;
}

export interface LocationFormErrors {
  name?: string;
  timezone?: string;
  contactEmail?: string;
  contactPhone?: string;
  address?: LocationAddressErrors;
  openingHours?: string;
  dayErrors?: Partial<Record<DayOfWeek, string>>;
}

export function createEmptyAddressFormValues(): LocationAddressFormValues {
  return {
    line1: '',
    line2: '',
    city: '',
    stateRegion: '',
    postalCode: '',
    countryCode: '',
  };
}

export function createEmptyLocationFormValues(defaultTimezone = ''): LocationFormValues {
  return {
    name: '',
    timezone: defaultTimezone,
    contactEmail: '',
    contactPhone: '',
    includeAddress: false,
    address: createEmptyAddressFormValues(),
    openingHours: null,
  };
}

export function locationToFormValues(
  location: BusinessLocation,
  fallbackTimezone = '',
): LocationFormValues {
  return {
    name: location.name,
    timezone: location.timezone ?? fallbackTimezone,
    contactEmail: location.contactEmail ?? '',
    contactPhone: location.contactPhone ?? '',
    includeAddress: Boolean(location.address),
    address: location.address
      ? {
          line1: location.address.line1,
          line2: location.address.line2 ?? '',
          city: location.address.city,
          stateRegion: location.address.stateRegion ?? '',
          postalCode: location.address.postalCode ?? '',
          countryCode: location.address.countryCode,
        }
      : createEmptyAddressFormValues(),
    openingHours: location.openingHours,
  };
}

function validateAddressForm(values: LocationAddressFormValues): {
  address: LocationAddress;
  errors: LocationAddressErrors;
} {
  const errors: LocationAddressErrors = {};

  const line1 = values.line1.trim();
  if (line1.length < 1 || line1.length > 200) {
    errors.line1 = 'Street address line 1 is required (1–200 characters).';
  }

  const line2Raw = values.line2.trim();
  if (line2Raw.length > 200) {
    errors.line2 = 'Address line 2 must be at most 200 characters.';
  }

  const city = values.city.trim();
  if (city.length < 1 || city.length > 100) {
    errors.city = 'City is required (1–100 characters).';
  }

  const stateRaw = values.stateRegion.trim();
  if (stateRaw.length > 100) {
    errors.stateRegion = 'State or region must be at most 100 characters.';
  }

  const postalRaw = values.postalCode.trim();
  if (postalRaw.length > 32) {
    errors.postalCode = 'Postal code must be at most 32 characters.';
  }

  const countryCode = values.countryCode.trim().toUpperCase();
  if (!COUNTRY_CODE_PATTERN.test(countryCode)) {
    errors.countryCode = 'Use a 2-letter ISO country code (e.g. US, GB, IN).';
  }

  return {
    address: {
      line1,
      line2: line2Raw.length > 0 ? line2Raw : null,
      city,
      stateRegion: stateRaw.length > 0 ? stateRaw : null,
      postalCode: postalRaw.length > 0 ? postalRaw : null,
      countryCode,
    },
    errors,
  };
}

export function validateLocationForm(values: LocationFormValues): {
  valid: boolean;
  payload: CreateLocationPayload;
  errors: LocationFormErrors;
} {
  const errors: LocationFormErrors = {};

  const name = values.name.trim();
  if (name.length < 1 || name.length > 160) {
    errors.name = 'Location name must be between 1 and 160 characters.';
  }

  const timezone = values.timezone.trim();
  const timezoneError = validateTimezoneValue(timezone, true);
  if (timezoneError) {
    errors.timezone = timezoneError;
  }

  const emailResult = validateOptionalEmail(values.contactEmail, 'contact email');
  if (emailResult.error) {
    errors.contactEmail = emailResult.error;
  }

  const phoneResult = validateOptionalPhone(values.contactPhone, 'phone');
  if (phoneResult.error) {
    errors.contactPhone = phoneResult.error;
  }

  let address: LocationAddress | null = null;
  if (values.includeAddress) {
    const addressResult = validateAddressForm(values.address);
    if (Object.keys(addressResult.errors).length > 0) {
      errors.address = addressResult.errors;
    } else {
      address = addressResult.address;
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
      timezone,
      address,
      contactEmail: emailResult.normalized,
      contactPhone: phoneResult.normalized,
      openingHours: values.openingHours,
    },
    errors,
  };
}

export function buildLocationPatchPayload(
  original: BusinessLocation,
  next: CreateLocationPayload,
): UpdateLocationPayload {
  const patch: UpdateLocationPayload = {};

  if (next.name !== original.name) {
    patch.name = next.name;
  }
  if (next.timezone !== original.timezone) {
    patch.timezone = next.timezone;
  }
  if (JSON.stringify(next.address) !== JSON.stringify(original.address)) {
    patch.address = next.address;
  }
  if (next.contactEmail !== original.contactEmail) {
    patch.contactEmail = next.contactEmail;
  }
  if (next.contactPhone !== original.contactPhone) {
    patch.contactPhone = next.contactPhone;
  }
  if (JSON.stringify(next.openingHours) !== JSON.stringify(original.openingHours)) {
    patch.openingHours = next.openingHours;
  }

  return patch;
}

export function filterLocationsByMode(
  locations: readonly BusinessLocation[],
  mode: LocationFilterMode,
): BusinessLocation[] {
  if (mode === 'active') {
    return locations.filter((location) => location.archivedAt === null);
  }

  if (mode === 'archived') {
    return locations.filter((location) => location.archivedAt !== null);
  }

  return [...locations];
}

export function formatLocationAddress(address: LocationAddress | null): string | null {
  if (!address) {
    return null;
  }

  const lines = [address.line1];
  if (address.line2) {
    lines.push(address.line2);
  }

  const locality = [address.city, address.stateRegion, address.postalCode]
    .filter(Boolean)
    .join(', ');

  if (locality) {
    lines.push(locality);
  }

  lines.push(address.countryCode);
  return lines.join(' · ');
}

