import { Period, parsePeriod } from './period';
import { TradingSession, getSessionPreset } from './session';

export * from './period';
export * from './session';
export * from './timezone';
export * from './timeFormat';

/** Normalize the `timeScale.period` option into a `Period`, or null if unset/invalid. */
export function resolvePeriodOption(value: string | Period | undefined): Period | null {
  if (value === undefined) return null;
  if (typeof value === 'string') return parsePeriod(value);
  if (typeof value.span === 'number' && value.span >= 1) return value;
  return null;
}

/** Normalize the `timeScale.session` option into a `TradingSession`, or null if unset/unknown. */
export function resolveSessionOption(
  value: string | TradingSession | undefined,
): TradingSession | null {
  if (value === undefined) return null;
  if (typeof value === 'string') return getSessionPreset(value);
  return value;
}
