/**
 * Pure planning helpers for keeping a long-lived chart in step with React props.
 *
 * The React wrapper keeps one chart instance per mount and applies prop changes
 * incrementally. These helpers decide *what* to apply; the wrapper does the
 * applying. Keeping them free of DOM and chart state makes them unit-testable.
 */

import type { KLineData } from '../types';

export type DataSyncPlan =
  | { kind: 'none' }
  | { kind: 'set'; data: KLineData[] }
  | { kind: 'upsert'; bars: KLineData[] };

/**
 * How to move a chart from the bars it currently shows to `next`.
 *
 * `upsert` is possible when every bar except the last is the same object as
 * before and the last bar still has its timestamp. That is the live-feed shape:
 * the last bar may change and new bars are appended. Anything else, including a
 * history that was re-fetched into new objects, is a full `set`.
 */
export function planDataSync(
  prev: readonly KLineData[] | null,
  next: readonly KLineData[],
): DataSyncPlan {
  if (!prev || prev.length === 0 || next.length === 0) {
    return { kind: 'set', data: next as KLineData[] };
  }

  const n = prev.length;
  if (next.length < n) return { kind: 'set', data: next as KLineData[] };
  if (next[n - 1].timestamp !== prev[n - 1].timestamp) {
    return { kind: 'set', data: next as KLineData[] };
  }
  for (let i = 0; i < n - 1; i++) {
    if (next[i] !== prev[i]) return { kind: 'set', data: next as KLineData[] };
  }

  if (next.length === n && next[n - 1] === prev[n - 1]) return { kind: 'none' };
  return { kind: 'upsert', bars: next.slice(n - 1) as KLineData[] };
}

let uniqueCounter = 0;

/**
 * A comparable string for a plain value, used to detect prop changes that
 * React's reference equality would miss or over-report. Values that cannot be
 * serialised get a fresh string each time, so they always count as changed.
 */
export function stableSignature(value: unknown): string {
  try {
    const json = JSON.stringify(value);
    return json === undefined ? 'undefined' : json;
  } catch {
    uniqueCounter += 1;
    return `\u0000unserialisable:${uniqueCounter}`;
  }
}
