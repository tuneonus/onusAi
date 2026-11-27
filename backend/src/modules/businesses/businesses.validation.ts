import { HttpError } from '../../utils/http-error.js';
import {
  DAYS_OF_WEEK,
  type CreateBusinessInput,
  type CreateLocationInput,
  type DayOfWeek,
  type DayOpeningHours,
  type LocationAddress,
  type UpdateBusinessInput,
  type UpdateLocationInput,
  type WeeklyOpeningHours,
} from './businesses.types.js';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+$/;
const PHONE_CHARS_PATTERN = /^[+0-9()\s.-]+$/;
const COUNTRY_CODE_PATTERN = /^[A-Z]{2}$/;
const TIME_24H_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const IANA_TIMEZONE_PATTERN =
  /^(?:UTC|(?:Africa|America|Antarctica|Arctic|Asia|Atlantic|Australia|Europe|Indian|Pacific|Etc)\/[A-Za-z0-9_+-]+(?:\/[A-Za-z0-9_+-]+)*)$/;

const BUSINESS_FIELDS = new Set([
  'name',
  'description',
  'contactEmail',
  'contactPhone',
  'websiteUrl',
  'timezone',
  'openingHours',
  'retentionDays',
]);

const LOCATION_FIELDS = new Set([
  'name',
  'timezone',
  'address',
  'contactEmail',
  'contactPhone',
  'openingHours',
]);

const ADDRESS_FIELDS = new Set([
  'line1',
  'line2',
  'city',
  'stateRegion',
  'postalCode',
  'countryCode',
]);

const DAY_HOURS_FIELDS = new Set(['closed', 'open', 'close']);

function assertPlainObject(value: unknown, message: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new HttpError(400, 'VALIDATION_ERROR', message);
  }

  return value as Record<string, unknown>;
}

function assertAllowedKeys(
  record: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  message: string,
): string[] {
  const keys = Object.keys(record);

  if (keys.some((key) => !allowed.has(key))) {
    throw new HttpError(400, 'VALIDATION_ERROR', message);
  }

  return keys;
}

function validateRequiredString(
  value: unknown,
  fieldName: string,
  minLength: number,
  maxLength: number,
): string {
  if (typeof value !== 'string') {
    throw new HttpError(400, 'VALIDATION_ERROR', `${fieldName} must be a string.`);
  }

  const trimmed = value.trim();

  if (trimmed.length < minLength || trimmed.length > maxLength) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      `${fieldName} must be between ${minLength} and ${maxLength} characters.`,
    );
  }

  return trimmed;
}

function validateNullableField<T>(
  value: unknown,
  validator: (presentValue: unknown) => T,
): T | null {
  if (value === undefined || value === null) {
    return null;
  }

  return validator(value);
}

function validateEmailValue(value: unknown, fieldName: string): string {
  if (typeof value !== 'string') {
    throw new HttpError(400, 'VALIDATION_ERROR', `${fieldName} must be a string.`);
  }

  const normalized = value.trim().toLowerCase();

  if (normalized.length < 3 || normalized.length > 254 || !EMAIL_PATTERN.test(normalized)) {
    throw new HttpError(400, 'VALIDATION_ERROR', `${fieldName} must be a valid email address.`);
  }

  return normalized;
}

function validatePhoneValue(value: unknown, fieldName: string): string {
  const trimmed = validateRequiredString(value, fieldName, 3, 40);
  const digitCount = (trimmed.match(/\d/g) ?? []).length;

  if (!PHONE_CHARS_PATTERN.test(trimmed) || digitCount < 3) {
    throw new HttpError(400, 'VALIDATION_ERROR', `${fieldName} must be a valid phone number.`);
  }

  return trimmed;
}

function validateWebsiteUrlValue(value: unknown): string {
  const trimmed = validateRequiredString(value, 'websiteUrl', 1, 500);

  if (/\s/.test(trimmed)) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'websiteUrl must be a valid HTTP(S) URL.');
  }

  let parsed: URL;

  try {
    parsed = new URL(trimmed);
  } catch {
    throw new HttpError(400, 'VALIDATION_ERROR', 'websiteUrl must be a valid HTTP(S) URL.');
  }

  if ((parsed.protocol !== 'http:' && parsed.protocol !== 'https:') || parsed.username || parsed.password) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'websiteUrl must be an HTTP(S) URL without credentials.');
  }

  return trimmed;
}

export function validateTimezone(value: unknown, fieldName = 'timezone'): string {
  const trimmed = validateRequiredString(value, fieldName, 1, 100);

  if (!IANA_TIMEZONE_PATTERN.test(trimmed)) {
    throw new HttpError(400, 'VALIDATION_ERROR', `${fieldName} must be a valid IANA timezone.`);
  }

  try {
    new Intl.DateTimeFormat('en-US', { timeZone: trimmed });
  } catch {
    throw new HttpError(400, 'VALIDATION_ERROR', `${fieldName} must be a valid IANA timezone.`);
  }

  return trimmed;
}

function parseTimeMinutes(value: unknown, fieldName: string): { formatted: string; minutes: number } {
  if (typeof value !== 'string' || !TIME_24H_PATTERN.test(value)) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      `${fieldName} must use 24-hour HH:MM format (00:00 to 23:59).`,
    );
  }

  const [hoursText, minutesText] = value.split(':');
  const minutes = Number(hoursText) * 60 + Number(minutesText);
  return { formatted: value, minutes };
}

function validateDayOpeningHours(
  value: unknown,
  day: DayOfWeek,
): { schedule: DayOpeningHours; openMinutes: number; closeMinutes: number; isOvernight: boolean } {
  const record = assertPlainObject(value, `openingHours.${day} must be a JSON object.`);
  assertAllowedKeys(record, DAY_HOURS_FIELDS, `openingHours.${day} contains unsupported fields.`);

  if (typeof record.closed !== 'boolean') {
    throw new HttpError(400, 'VALIDATION_ERROR', `openingHours.${day}.closed must be a boolean.`);
  }

  if (record.closed) {
    if (record.open !== undefined || record.close !== undefined) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        `openingHours.${day} must not include open or close times when closed is true.`,
      );
    }

    return {
      schedule: { closed: true },
      openMinutes: 0,
      closeMinutes: 0,
      isOvernight: false,
    };
  }

  const open = parseTimeMinutes(record.open, `openingHours.${day}.open`);
  const close = parseTimeMinutes(record.close, `openingHours.${day}.close`);

  if (open.minutes === close.minutes) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      `openingHours.${day} open and close times must be different.`,
    );
  }

  return {
    schedule: { closed: false, open: open.formatted, close: close.formatted },
    openMinutes: open.minutes,
    closeMinutes: close.minutes,
    isOvernight: close.minutes < open.minutes,
  };
}

export function validateOpeningHours(value: unknown): WeeklyOpeningHours {
  const record = assertPlainObject(value, 'openingHours must be a JSON object.');
  const allowedDays = new Set<string>(DAYS_OF_WEEK);
  assertAllowedKeys(record, allowedDays, 'openingHours contains unsupported day keys.');

  const parsedDays = new Map<
    DayOfWeek,
    { schedule: DayOpeningHours; openMinutes: number; closeMinutes: number; isOvernight: boolean }
  >();

  for (const day of DAYS_OF_WEEK) {
    if (record[day] === undefined) {
      throw new HttpError(400, 'VALIDATION_ERROR', `openingHours must include ${day}.`);
    }

    parsedDays.set(day, validateDayOpeningHours(record[day], day));
  }

  for (let index = 0; index < DAYS_OF_WEEK.length; index += 1) {
    const day = DAYS_OF_WEEK[index]!;
    const nextDay = DAYS_OF_WEEK[(index + 1) % DAYS_OF_WEEK.length]!;
    const current = parsedDays.get(day)!;
    const next = parsedDays.get(nextDay)!;

    if (current.isOvernight && !next.schedule.closed && next.openMinutes < current.closeMinutes) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        `Overnight openingHours for ${day} overlap with ${nextDay} opening time.`,
      );
    }
  }

  return {
    monday: parsedDays.get('monday')!.schedule,
    tuesday: parsedDays.get('tuesday')!.schedule,
    wednesday: parsedDays.get('wednesday')!.schedule,
    thursday: parsedDays.get('thursday')!.schedule,
    friday: parsedDays.get('friday')!.schedule,
    saturday: parsedDays.get('saturday')!.schedule,
    sunday: parsedDays.get('sunday')!.schedule,
  };
}

export function validateLocationAddress(value: unknown): LocationAddress {
  const record = assertPlainObject(value, 'address must be a JSON object.');
  assertAllowedKeys(record, ADDRESS_FIELDS, 'address contains unsupported fields.');

  const line1 = validateRequiredString(record.line1, 'address.line1', 1, 200);
  const line2 = validateNullableField(record.line2, (entry) =>
    validateRequiredString(entry, 'address.line2', 1, 200),
  );
  const city = validateRequiredString(record.city, 'address.city', 1, 100);
  const stateRegion = validateNullableField(record.stateRegion, (entry) =>
    validateRequiredString(entry, 'address.stateRegion', 1, 100),
  );
  const postalCode = validateNullableField(record.postalCode, (entry) =>
    validateRequiredString(entry, 'address.postalCode', 1, 32),
  );

  if (typeof record.countryCode !== 'string') {
    throw new HttpError(400, 'VALIDATION_ERROR', 'address.countryCode must be a 2-letter ISO code.');
  }

  const countryCode = record.countryCode.trim().toUpperCase();

  if (!COUNTRY_CODE_PATTERN.test(countryCode)) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'address.countryCode must be a 2-letter ISO code.');
  }

  return {
    line1,
    line2,
    city,
    stateRegion,
    postalCode,
    countryCode,
  };
}

function validateRetentionDaysValue(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 3650) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'retentionDays must be an integer between 1 and 3650.');
  }

  return value;
}

export function validateCreateBusinessInput(body: unknown): CreateBusinessInput {
  const record = assertPlainObject(body, 'Request body must be a JSON object.');
  assertAllowedKeys(record, BUSINESS_FIELDS, 'Request body contains unsupported fields.');

  return {
    name: validateRequiredString(record.name, 'name', 1, 160),
    description: validateNullableField(record.description, (entry) =>
      validateRequiredString(entry, 'description', 1, 2000),
    ),
    contactEmail: validateNullableField(record.contactEmail, (entry) =>
      validateEmailValue(entry, 'contactEmail'),
    ),
    contactPhone: validateNullableField(record.contactPhone, (entry) =>
      validatePhoneValue(entry, 'contactPhone'),
    ),
    websiteUrl: validateNullableField(record.websiteUrl, validateWebsiteUrlValue),
    timezone: validateNullableField(record.timezone, (entry) => validateTimezone(entry, 'timezone')),
    openingHours: validateNullableField(record.openingHours, validateOpeningHours),
    retentionDays: validateNullableField(record.retentionDays, validateRetentionDaysValue),
  };
}

export function validateUpdateBusinessInput(body: unknown): UpdateBusinessInput {
  const record = assertPlainObject(body, 'Request body must be a JSON object.');
  const keys = assertAllowedKeys(record, BUSINESS_FIELDS, 'Request body contains unsupported fields.');

  if (keys.length === 0) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'At least one business profile field must be provided.');
  }

  const update: UpdateBusinessInput = {};

  if ('name' in record) {
    if (record.name === null) {
      throw new HttpError(400, 'VALIDATION_ERROR', 'name cannot be null.');
    }

    update.name = validateRequiredString(record.name, 'name', 1, 160);
  }

  if ('description' in record) {
    update.description = validateNullableField(record.description, (entry) =>
      validateRequiredString(entry, 'description', 1, 2000),
    );
  }

  if ('contactEmail' in record) {
    update.contactEmail = validateNullableField(record.contactEmail, (entry) =>
      validateEmailValue(entry, 'contactEmail'),
    );
  }

  if ('contactPhone' in record) {
    update.contactPhone = validateNullableField(record.contactPhone, (entry) =>
      validatePhoneValue(entry, 'contactPhone'),
    );
  }

  if ('websiteUrl' in record) {
    update.websiteUrl = validateNullableField(record.websiteUrl, validateWebsiteUrlValue);
  }

  if ('timezone' in record) {
    update.timezone = validateNullableField(record.timezone, (entry) =>
      validateTimezone(entry, 'timezone'),
    );
  }

  if ('openingHours' in record) {
    update.openingHours = validateNullableField(record.openingHours, validateOpeningHours);
  }

  if ('retentionDays' in record) {
    update.retentionDays = validateNullableField(record.retentionDays, validateRetentionDaysValue);
  }

  return update;
}

export function validateCreateLocationInput(body: unknown): CreateLocationInput {
  const record = assertPlainObject(body, 'Request body must be a JSON object.');
  assertAllowedKeys(record, LOCATION_FIELDS, 'Request body contains unsupported fields.');

  return {
    name: validateRequiredString(record.name, 'name', 1, 160),
    timezone: validateTimezone(record.timezone, 'timezone'),
    address: validateNullableField(record.address, validateLocationAddress),
    contactEmail: validateNullableField(record.contactEmail, (entry) =>
      validateEmailValue(entry, 'contactEmail'),
    ),
    contactPhone: validateNullableField(record.contactPhone, (entry) =>
      validatePhoneValue(entry, 'contactPhone'),
    ),
    openingHours: validateNullableField(record.openingHours, validateOpeningHours),
  };
}

export function validateUpdateLocationInput(body: unknown): UpdateLocationInput {
  const record = assertPlainObject(body, 'Request body must be a JSON object.');
  const keys = assertAllowedKeys(record, LOCATION_FIELDS, 'Request body contains unsupported fields.');

  if (keys.length === 0) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'At least one location field must be provided.');
  }

  const update: UpdateLocationInput = {};

  if ('name' in record) {
    if (record.name === null) {
      throw new HttpError(400, 'VALIDATION_ERROR', 'name cannot be null.');
    }

    update.name = validateRequiredString(record.name, 'name', 1, 160);
  }

  if ('timezone' in record) {
    if (record.timezone === null) {
      throw new HttpError(400, 'VALIDATION_ERROR', 'timezone cannot be null.');
    }

    update.timezone = validateTimezone(record.timezone, 'timezone');
  }

  if ('address' in record) {
    update.address = validateNullableField(record.address, validateLocationAddress);
  }

  if ('contactEmail' in record) {
    update.contactEmail = validateNullableField(record.contactEmail, (entry) =>
      validateEmailValue(entry, 'contactEmail'),
    );
  }

  if ('contactPhone' in record) {
    update.contactPhone = validateNullableField(record.contactPhone, (entry) =>
      validatePhoneValue(entry, 'contactPhone'),
    );
  }

  if ('openingHours' in record) {
    update.openingHours = validateNullableField(record.openingHours, validateOpeningHours);
  }

  return update;
}

export function validateIncludeArchivedQuery(value: unknown): boolean {
  if (value === undefined) {
    return false;
  }

  if (value === 'true') {
    return true;
  }

  if (value === 'false') {
    return false;
  }

  throw new HttpError(400, 'VALIDATION_ERROR', 'includeArchived must be true or false.');
}

