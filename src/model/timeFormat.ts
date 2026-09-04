import { Period, TimeTickLevel, periodToTickLevel } from './period';
import { isNewDay, isNewMonth, isNewYear } from './timezone';

/**
 * Timezone-aware axis time formatting.
 *
 * The rule the axis follows (same one KLineCharts and TradingView use): a tick
 * shows the *coarsest* unit that changed since the previous tick. Within one
 * day you see `14:30`; the first tick of a new day shows `Mar 4`; the first
 * tick of a new year shows `2026`. All boundary checks run in the configured
 * timezone.
 */

export interface TimeFormatterConfig {
  locale: string;
  timeZone?: string;
  period?: Period;
}

export interface AxisTickContext {
  /** Timestamp of the tick before this one, or null for the first tick. */
  previousTimestamp: number | null;
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function getFormatter(
  locale: string,
  timeZone: string | undefined,
  options: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat {
  const key = `${locale}|${timeZone ?? ''}|${JSON.stringify(options)}`;
  let formatter = formatterCache.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, { ...options, timeZone });
    formatterCache.set(key, formatter);
  }
  return formatter;
}

const LEVEL_OPTIONS: Record<TimeTickLevel, Intl.DateTimeFormatOptions> = {
  year: { year: 'numeric' },
  month: { month: 'short' },
  day: { month: 'short', day: 'numeric' },
  hour: { hour: '2-digit', minute: '2-digit', hour12: false },
  minute: { hour: '2-digit', minute: '2-digit', hour12: false },
  second: { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false },
};

export class TimeFormatter {
  private _locale: string;
  private _timeZone: string | undefined;
  private _period: Period;

  constructor(config: TimeFormatterConfig) {
    this._locale = config.locale;
    this._timeZone = config.timeZone;
    this._period = config.period ?? { type: 'minute', span: 1 };
  }

  public setConfig(config: Partial<TimeFormatterConfig>) {
    if (config.locale !== undefined) this._locale = config.locale;
    if ('timeZone' in config) this._timeZone = config.timeZone;
    if (config.period !== undefined) this._period = config.period;
  }

  public getTimeZone(): string | undefined {
    return this._timeZone;
  }

  /** Format at an explicit granularity. */
  public format(timestamp: number, level: TimeTickLevel): string {
    return getFormatter(this._locale, this._timeZone, LEVEL_OPTIONS[level]).format(
      new Date(timestamp),
    );
  }

  /**
   * Pick the granularity for an axis tick by comparing it against the previous
   * tick in the configured timezone, then format at that level.
   */
  public formatAxisTick(timestamp: number, context: AxisTickContext = { previousTimestamp: null }): string {
    return this.format(timestamp, this.resolveTickLevel(timestamp, context));
  }

  public resolveTickLevel(timestamp: number, context: AxisTickContext): TimeTickLevel {
    const baseLevel = periodToTickLevel(this._period);
    const previous = context.previousTimestamp;

    // First tick: label it at the period's own granularity.
    if (previous === null) {
      return baseLevel === 'minute' || baseLevel === 'second' ? 'day' : baseLevel;
    }

    if (isNewYear(previous, timestamp, this._timeZone)) return 'year';

    // Intraday periods only escalate as far as 'day'; daily-and-coarser
    // periods escalate to 'month' so the axis doesn't repeat the year.
    if (isNewMonth(previous, timestamp, this._timeZone)) {
      return baseLevel === 'day' || baseLevel === 'month' || baseLevel === 'year' ? 'month' : 'day';
    }

    if (isNewDay(previous, timestamp, this._timeZone)) return 'day';

    return baseLevel;
  }

  /** Crosshair labels always show the full date and time. */
  public formatCrosshair(timestamp: number): string {
    const options: Intl.DateTimeFormatOptions =
      this._period.type === 'day' || this._period.type === 'week'
        ? { year: 'numeric', month: 'short', day: 'numeric' }
        : this._period.type === 'month' || this._period.type === 'year'
          ? { year: 'numeric', month: 'short' }
          : {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
              hour12: false,
            };

    return getFormatter(this._locale, this._timeZone, options).format(new Date(timestamp));
  }
}
