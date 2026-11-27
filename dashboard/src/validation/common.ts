import {
  DAYS_OF_WEEK,
  type DayOfWeek,
  type DayOpeningHours,
  type WeeklyOpeningHours,
} from '../types/schedule.ts';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+$/;
const PHONE_CHARS_PATTERN = /^[+0-9()\s.-]+$/;
const TIME_24H_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const IANA_TIMEZONE_PATTERN =
  /^(?:UTC|(?:Africa|America|Antarctica|Arctic|Asia|Atlantic|Australia|Europe|Indian|Pacific|Etc)\/[A-Za-z0-9_+-]+(?:\/[A-Za-z0-9_+-]+)*)$/;

export const DAY_LABELS: Record<DayOfWeek, string> = {
  monday: 'Monday',
  tuesday: 'Tuesday',
  wednesday: 'Wednesday',
  thursday: 'Thursday',
  friday: 'Friday',
  saturday: 'Saturday',
  sunday: 'Sunday',
};

export function validateOptionalEmail(raw: string, label = 'Contact email'): {
  normalized: string | null;
  error?: string;
} {
  const normalized = raw.trim().toLowerCase();

  if (normalized.length === 0) {
    return { normalized: null };
  }

  if (normalized.length < 3 || normalized.length > 254 || !EMAIL_PATTERN.test(normalized)) {
    return { normalized: null, error: `Enter a valid ${label.toLowerCase()} address.` };
  }

  return { normalized };
}

export function validateOptionalPhone(raw: string, label = 'Contact phone'): {
  normalized: string | null;
  error?: string;
} {
  const trimmed = raw.trim();

  if (trimmed.length === 0) {
    return { normalized: null };
  }

  const digitCount = (trimmed.match(/\d/g) ?? []).length;

  if (
    trimmed.length < 3 ||
    trimmed.length > 40 ||
    !PHONE_CHARS_PATTERN.test(trimmed) ||
    digitCount < 3
  ) {
    return {
      normalized: null,
      error: `Enter a valid ${label.toLowerCase()} number (3–40 characters).`,
    };
  }

  return { normalized: trimmed };
}

export function validateTimezoneValue(raw: string, required = false): string | null {
  const trimmed = raw.trim();

  if (trimmed.length === 0) {
    return required ? 'Timezone is required (e.g. America/New_York or UTC).' : null;
  }

  if (trimmed.length > 100 || !IANA_TIMEZONE_PATTERN.test(trimmed)) {
    return 'Enter a valid IANA timezone (e.g. America/New_York or UTC).';
  }

  try {
    new Intl.DateTimeFormat('en-US', { timeZone: trimmed });
    return null;
  } catch {
    return 'Enter a valid IANA timezone (e.g. America/New_York or UTC).';
  }
}

export function buildDefaultOpeningHours(): WeeklyOpeningHours {
  return {
    monday: { closed: false, open: '09:00', close: '17:00' },
    tuesday: { closed: false, open: '09:00', close: '17:00' },
    wednesday: { closed: false, open: '09:00', close: '17:00' },
    thursday: { closed: false, open: '09:00', close: '17:00' },
    friday: { closed: false, open: '09:00', close: '17:00' },
    saturday: { closed: true },
    sunday: { closed: true },
  };
}

function parseTimeMinutes(value: string): number | null {
  if (!TIME_24H_PATTERN.test(value)) {
    return null;
  }

  const [hoursText, minutesText] = value.split(':');
  return Number(hoursText) * 60 + Number(minutesText);
}

export function isOvernightShift(day: DayOpeningHours): boolean {
  if (day.closed) {
    return false;
  }

  const openMinutes = parseTimeMinutes(day.open);
  const closeMinutes = parseTimeMinutes(day.close);
  return openMinutes !== null && closeMinutes !== null && closeMinutes < openMinutes;
}

export function validateOpeningHoursValue(hours: WeeklyOpeningHours): {
  summaryError?: string;
  dayErrors: Partial<Record<DayOfWeek, string>>;
} {
  const dayErrors: Partial<Record<DayOfWeek, string>> = {};
  const parsed = new Map<
    DayOfWeek,
    { closed: boolean; openMinutes: number; closeMinutes: number; isOvernight: boolean }
  >();

  for (const day of DAYS_OF_WEEK) {
    const entry = hours[day];

    if (entry.closed) {
      parsed.set(day, { closed: true, openMinutes: 0, closeMinutes: 0, isOvernight: false });
      continue;
    }

    const openMinutes = parseTimeMinutes(entry.open);
    const closeMinutes = parseTimeMinutes(entry.close);

    if (openMinutes === null || closeMinutes === null) {
      dayErrors[day] = 'Use 24-hour HH:MM format (00:00 to 23:59).';
      continue;
    }

    if (openMinutes === closeMinutes) {
      dayErrors[day] = 'Open and close times must be different.';
      continue;
    }

    parsed.set(day, {
      closed: false,
      openMinutes,
      closeMinutes,
      isOvernight: closeMinutes < openMinutes,
    });
  }

  if (Object.keys(dayErrors).length > 0) {
    return {
      summaryError: 'Fix invalid opening hours entries below.',
      dayErrors,
    };
  }

  for (let index = 0; index < DAYS_OF_WEEK.length; index += 1) {
    const day = DAYS_OF_WEEK[index];
    const nextDay = DAYS_OF_WEEK[(index + 1) % DAYS_OF_WEEK.length];
    const current = parsed.get(day);
    const next = parsed.get(nextDay);

    if (
      current &&
      next &&
      current.isOvernight &&
      !next.closed &&
      next.openMinutes < current.closeMinutes
    ) {
      const message = `Overnight hours for ${DAY_LABELS[day]} overlap with ${DAY_LABELS[nextDay]} opening time.`;
      dayErrors[nextDay] = message;
      return {
        summaryError: message,
        dayErrors,
      };
    }
  }

  return { dayErrors };
}

