/**
 * Where one trading session ends and the next begins.
 *
 * Intraday data spanning several sessions is drawn as one continuous run: the
 * jump from Monday's close to Tuesday's open is one bar wide, exactly like the
 * step between two consecutive minutes. A reader cannot see where the day
 * ended, so a two-day sparkline looks like one long session.
 *
 * A break is **a gap in the timestamps**, not a calendar day change. The first
 * implementation here used the day change, and it was wrong twice over: a US
 * session runs 09:30-16:00 New York, which is two calendar days in most of the
 * world, so a two-day card drew three sessions for a reader in Auckland; and a
 * chart with no timezone configured got the runtime's, which is not a property
 * of the market at all. The gap is the same number everywhere.
 *
 * Daily and slower series are excluded rather than special-cased: every weekend
 * is a 3x gap, so gap detection would rule off every Monday on a daily chart,
 * which is not a session break — it is just the week.
 *
 * Pure, and index-based: the renderer turns indices into x coordinates.
 */

import { tradingDayOf, type TradingSession } from './session';

/** Bar intervals at or above this are daily data, which has no sessions to split. */
const ONE_DAY_MS = 86_400_000;

/** A gap this many times the typical interval is a break rather than a slow bar. */
const DEFAULT_BREAK_FACTOR = 1.5;

export interface SessionBoundaryInput {
  /** Bar timestamps, ascending. */
  timestamps: readonly number[];
  /** First and last bar index to consider, inclusive. */
  from: number;
  to: number;
  /** Multiple of the typical interval that counts as a break. */
  breakFactor?: number;
  /**
   * The market's hours, when they are known.
   *
   * With a session the answer is exact: each bar is attributed to a trading day
   * and a boundary is where that day changes. Without one it is inferred from
   * the gaps, which is right for a market whose day is one continuous block and
   * wrong for one with a night session — there the evening open and the next
   * morning belong to the *same* trading day, and the break between them looks
   * exactly like the break that ends the day.
   */
  session?: TradingSession | null;
}

/**
 * Indices whose bar opens a new session, so a separator belongs *before* them.
 *
 * Index 0 is never a boundary: there is nothing on its left to separate it
 * from, and a rule down the chart's left edge reads as a border.
 */
export function findSessionBoundaries(input: SessionBoundaryInput): number[] {
  const { timestamps } = input;
  if (timestamps.length < 3) return [];
  if (input.session) return boundariesFromSession(timestamps, input.from, input.to, input.session);

  const interval = typicalInterval(timestamps);
  if (interval === null || interval >= ONE_DAY_MS) return [];

  const threshold = interval * Math.max(1, input.breakFactor ?? DEFAULT_BREAK_FACTOR);
  const start = Math.max(1, Math.floor(input.from));
  const end = Math.min(timestamps.length - 1, Math.floor(input.to));

  const boundaries: number[] = [];
  for (let index = start; index <= end; index += 1) {
    const gap = timestamps[index] - timestamps[index - 1];
    if (Number.isFinite(gap) && gap > threshold) boundaries.push(index);
  }
  return boundaries;
}

/**
 * Boundaries where the trading day changes, for a market whose hours are known.
 *
 * Bars outside trading hours keep the last day seen rather than resetting it,
 * so a stray print in the lunch break or after the close does not manufacture a
 * boundary on either side of itself.
 */
function boundariesFromSession(
  timestamps: readonly number[],
  from: number,
  to: number,
  session: TradingSession,
): number[] {
  const start = Math.max(1, Math.floor(from));
  const end = Math.min(timestamps.length - 1, Math.floor(to));
  if (end < start) return [];

  const boundaries: number[] = [];
  let previousDay = lastKnownDayBefore(timestamps, start, session);
  for (let index = start; index <= end; index += 1) {
    const day = tradingDayOf(timestamps[index], session);
    if (day === null) continue;
    if (previousDay !== null && day !== previousDay) boundaries.push(index);
    previousDay = day;
  }
  return boundaries;
}

/** The trading day of the newest bar at or before `index`, scanning backwards. */
function lastKnownDayBefore(
  timestamps: readonly number[],
  index: number,
  session: TradingSession,
): string | null {
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    const day = tradingDayOf(timestamps[cursor], session);
    if (day !== null) return day;
  }
  return null;
}

/**
 * Median gap between consecutive bars.
 *
 * The median rather than the mean: session breaks are exactly the outliers this
 * function is used to find, and a handful of 17-hour gaps drags a mean far
 * enough that the breaks stop looking unusual.
 */
function typicalInterval(timestamps: readonly number[]): number | null {
  const gaps: number[] = [];
  for (let index = 1; index < timestamps.length; index += 1) {
    const gap = timestamps[index] - timestamps[index - 1];
    if (Number.isFinite(gap) && gap > 0) gaps.push(gap);
  }
  if (gaps.length === 0) return null;
  gaps.sort((a, b) => a - b);
  return gaps[Math.floor(gaps.length / 2)];
}
