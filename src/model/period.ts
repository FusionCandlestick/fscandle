/**
 * Period model — an explicit description of the bar interval, replacing the
 * implicit "median milliseconds between bars" heuristic when the caller knows
 * what timeframe the data actually is.
 */

export type PeriodType =
  | 'second'
  | 'minute'
  | 'hour'
  | 'day'
  | 'week'
  | 'month'
  | 'year';

export interface Period {
  type: PeriodType;
  /** How many units of `type` one bar covers. Must be >= 1. */
  span: number;
}

const MS: Record<PeriodType, number> = {
  second: 1000,
  minute: 60_000,
  hour: 3_600_000,
  day: 86_400_000,
  week: 604_800_000,
  // Calendar periods are approximate in milliseconds; use `addPeriod` for
  // anything that must respect real calendar boundaries.
  month: 2_629_800_000,
  year: 31_557_600_000,
};

const SUFFIX: Record<PeriodType, string> = {
  second: 's',
  minute: 'm',
  hour: 'H',
  day: 'D',
  week: 'W',
  month: 'M',
  year: 'Y',
};

const SUFFIX_TO_TYPE: Record<string, PeriodType> = {
  s: 'second',
  m: 'minute',
  h: 'hour',
  H: 'hour',
  d: 'day',
  D: 'day',
  w: 'week',
  W: 'week',
  M: 'month',
  y: 'year',
  Y: 'year',
};

/** Approximate duration of one bar in milliseconds. */
export function periodToMilliseconds(period: Period): number {
  return MS[period.type] * Math.max(1, period.span);
}

/**
 * Parse a period string such as `15m`, `4H`, `1D`, `3M`.
 *
 * Case matters only where it disambiguates: lowercase `m` is minutes and
 * uppercase `M` is months, matching the convention used by most exchanges.
 * A bare number is treated as minutes (`"15"` === `"15m"`).
 */
export function parsePeriod(value: string): Period | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;

  const match = trimmed.match(/^(\d+)\s*([a-zA-Z]*)$/);
  if (!match) return null;

  const span = Number.parseInt(match[1], 10);
  if (!Number.isFinite(span) || span < 1) return null;

  const rawSuffix = match[2];
  if (rawSuffix.length === 0) return { type: 'minute', span };

  // Multi-letter forms like "min", "hour", "day" resolve by prefix, but "M"
  // and "m" must stay distinguishable, so single letters go through the
  // case-sensitive table first.
  if (rawSuffix.length === 1) {
    const type = SUFFIX_TO_TYPE[rawSuffix];
    return type ? { type, span } : null;
  }

  const lower = rawSuffix.toLowerCase();
  const byWord: Array<[string, PeriodType]> = [
    ['sec', 'second'],
    ['min', 'minute'],
    ['hour', 'hour'],
    ['hr', 'hour'],
    ['day', 'day'],
    ['week', 'week'],
    ['month', 'month'],
    ['year', 'year'],
  ];
  const found = byWord.find(([prefix]) => lower.startsWith(prefix));
  return found ? { type: found[1], span } : null;
}

/** Render a period back to its canonical string form, e.g. `{minute,15}` → `15m`. */
export function formatPeriod(period: Period): string {
  return `${Math.max(1, period.span)}${SUFFIX[period.type]}`;
}

/**
 * Best-effort inference of a period from a measured bar interval. Used when
 * the caller has not declared one. Snaps to the nearest common timeframe
 * rather than reporting an odd span like `73m`.
 */
export function inferPeriod(intervalMs: number): Period {
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
    return { type: 'minute', span: 1 };
  }

  const candidates: Period[] = [
    { type: 'second', span: 1 },
    { type: 'second', span: 5 },
    { type: 'second', span: 15 },
    { type: 'second', span: 30 },
    { type: 'minute', span: 1 },
    { type: 'minute', span: 3 },
    { type: 'minute', span: 5 },
    { type: 'minute', span: 15 },
    { type: 'minute', span: 30 },
    { type: 'hour', span: 1 },
    { type: 'hour', span: 2 },
    { type: 'hour', span: 4 },
    { type: 'hour', span: 6 },
    { type: 'hour', span: 12 },
    { type: 'day', span: 1 },
    { type: 'week', span: 1 },
    { type: 'month', span: 1 },
    { type: 'month', span: 3 },
    { type: 'year', span: 1 },
  ];

  let best = candidates[0];
  let bestError = Infinity;
  for (const candidate of candidates) {
    // Compare on a log scale so a 1-day guess isn't dominated by the absolute
    // size of the year candidate.
    const error = Math.abs(Math.log(periodToMilliseconds(candidate) / intervalMs));
    if (error < bestError) {
      bestError = error;
      best = candidate;
    }
  }
  return best;
}

/**
 * The tick granularity an axis should label at, given the period and how much
 * time one pixel-group spans.
 */
export type TimeTickLevel = 'year' | 'month' | 'day' | 'hour' | 'minute' | 'second';

export function periodToTickLevel(period: Period): TimeTickLevel {
  switch (period.type) {
    case 'second':
      return 'second';
    case 'minute':
    case 'hour':
      return 'minute';
    case 'day':
    case 'week':
      return 'day';
    case 'month':
      return 'month';
    case 'year':
      return 'year';
  }
}
