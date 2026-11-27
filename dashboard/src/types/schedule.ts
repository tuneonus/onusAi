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

