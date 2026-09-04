/**
 * Timezone-aware calendar helpers.
 *
 * The axis needs to know whether two adjacent ticks fall on different days,
 * months, or years *in the chart's configured timezone*. Doing that with
 * `Date.getDate()` silently uses the viewer's local zone and produces wrong
 * day boundaries for anyone not sitting in the exchange's timezone — the bug
 * this module exists to prevent.
 */

export interface ZonedParts {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  hour: number; // 0-23
  minute: number;
  second: number;
  weekday: number; // 0=Sunday .. 6=Saturday
}

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

const partsFormatterCache = new Map<string, Intl.DateTimeFormat>();

function getPartsFormatter(timeZone: string | undefined): Intl.DateTimeFormat {
  const key = timeZone ?? '__local__';
  let formatter = partsFormatterCache.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      weekday: 'short',
    });
    partsFormatterCache.set(key, formatter);
  }
  return formatter;
}

/**
 * Decompose a timestamp into calendar fields as observed in `timeZone`.
 * Falls back to the runtime's local zone when `timeZone` is undefined.
 */
export function getZonedParts(timestamp: number, timeZone?: string): ZonedParts {
  const parts = getPartsFormatter(timeZone).formatToParts(new Date(timestamp));
  const lookup: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== 'literal') lookup[part.type] = part.value;
  }

  // `hour: '2-digit'` with hour12:false yields "24" at midnight in some ICU
  // versions; normalize it back to 0 so day-boundary checks stay correct.
  const hour = Number.parseInt(lookup.hour ?? '0', 10) % 24;

  return {
    year: Number.parseInt(lookup.year ?? '1970', 10),
    month: Number.parseInt(lookup.month ?? '1', 10),
    day: Number.parseInt(lookup.day ?? '1', 10),
    hour,
    minute: Number.parseInt(lookup.minute ?? '0', 10),
    second: Number.parseInt(lookup.second ?? '0', 10),
    weekday: WEEKDAY_INDEX[lookup.weekday ?? 'Thu'] ?? 4,
  };
}

/** True when the two timestamps fall on different calendar days in `timeZone`. */
export function isNewDay(previous: number, current: number, timeZone?: string): boolean {
  const a = getZonedParts(previous, timeZone);
  const b = getZonedParts(current, timeZone);
  return a.year !== b.year || a.month !== b.month || a.day !== b.day;
}

/** True when the two timestamps fall in different calendar months in `timeZone`. */
export function isNewMonth(previous: number, current: number, timeZone?: string): boolean {
  const a = getZonedParts(previous, timeZone);
  const b = getZonedParts(current, timeZone);
  return a.year !== b.year || a.month !== b.month;
}

/** True when the two timestamps fall in different calendar years in `timeZone`. */
export function isNewYear(previous: number, current: number, timeZone?: string): boolean {
  return getZonedParts(previous, timeZone).year !== getZonedParts(current, timeZone).year;
}

/** Minutes past midnight in `timeZone`. Used for session-window checks. */
export function getZonedMinuteOfDay(timestamp: number, timeZone?: string): number {
  const parts = getZonedParts(timestamp, timeZone);
  return parts.hour * 60 + parts.minute;
}

/**
 * Offset in minutes between `timeZone` and UTC at the given instant
 * (positive east of UTC). Computed from the zoned parts so it stays correct
 * across DST transitions.
 */
export function getTimeZoneOffsetMinutes(timestamp: number, timeZone?: string): number {
  const parts = getZonedParts(timestamp, timeZone);
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  // Drop sub-second noise from the original timestamp before differencing.
  return Math.round((asUtc - Math.floor(timestamp / 1000) * 1000) / 60000);
}
