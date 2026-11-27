const FALLBACK_TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Toronto',
  'Europe/London',
  'Europe/Berlin',
  'Europe/Paris',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Australia/Sydney',
] as const;

function getSupportedTimezones(): string[] {
  try {
    const supportedValuesOf = (
      Intl as unknown as { supportedValuesOf?: (key: string) => string[] }
    ).supportedValuesOf;

    if (typeof supportedValuesOf === 'function') {
      const zones = supportedValuesOf('timeZone');
      return zones.includes('UTC') ? zones : ['UTC', ...zones];
    }
  } catch {
    // Fall back to curated IANA list.
  }

  return [...FALLBACK_TIMEZONES];
}

export const ALL_TIMEZONES = getSupportedTimezones();

export function filterTimezones(
  query: string,
  zones: readonly string[] = ALL_TIMEZONES,
  limit = 40,
): { matches: string[]; totalMatches: number } {
  const normalized = query.trim().toLowerCase().replace(/\s+/g, '_');

  if (!normalized) {
    return {
      matches: zones.slice(0, limit),
      totalMatches: zones.length,
    };
  }

  const prefixMatches: string[] = [];
  const cityPrefixMatches: string[] = [];
  const substringMatches: string[] = [];

  for (const zone of zones) {
    const lower = zone.toLowerCase();
    const citySegment = lower.split('/').pop() ?? lower;

    if (lower.startsWith(normalized)) {
      prefixMatches.push(zone);
    } else if (citySegment.startsWith(normalized)) {
      cityPrefixMatches.push(zone);
    } else if (lower.includes(normalized)) {
      substringMatches.push(zone);
    }
  }

  const combined = [...prefixMatches, ...cityPrefixMatches, ...substringMatches];

  return {
    matches: combined.slice(0, limit),
    totalMatches: combined.length,
  };
}

