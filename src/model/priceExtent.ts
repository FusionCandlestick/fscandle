/**
 * The highest and lowest price in a dataset, without rebuilding it to find out.
 *
 * `_getMainPaneConstraints` computed this per price scale per frame, like so:
 *
 *     const prices = data.flatMap(item => [item.high, item.low]).filter(Number.isFinite);
 *     const globalMax = Math.max(...prices);
 *
 * At 50,000 bars that is a 100,000-element array built and thrown away, then a
 * second one from the filter, then a spread of 100,000 arguments -- per frame,
 * per scale. A CPU profile of a 60-step pan put this single function at 55% of
 * all non-idle samples, which is what made panning cost 310ms against
 * KLineCharts' 48ms.
 *
 * The spread was also a latent crash: argument lists run out somewhere around
 * 120,000 entries, so a chart with 60,000 bars was one zoom away from a
 * RangeError rather than a slow frame.
 *
 * The extent depends only on the data, so it is computed in one allocation-free
 * pass and cached against the array it came from. Appending bars -- the common
 * case for a live chart -- folds the new tail into the cached extent instead of
 * rescanning.
 */

import type { KLineData } from '../types';

export interface PriceExtent {
  min: number;
  max: number;
}

/** Scan `data[from..to]` for its price extent, ignoring non-finite values. */
export function computePriceExtent(data: KLineData[], from = 0, to = data.length - 1): PriceExtent | null {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;

  for (let i = Math.max(0, from); i <= Math.min(to, data.length - 1); i += 1) {
    const { high, low } = data[i];
    if (Number.isFinite(high) && high > max) max = high;
    if (Number.isFinite(low) && low < min) min = low;
    // A bar can carry a finite high and a non-finite low, so both are tested
    // rather than assuming one implies the other.
    if (Number.isFinite(high) && high < min) min = high;
    if (Number.isFinite(low) && low > max) max = low;
  }

  return min === Number.POSITIVE_INFINITY || max === Number.NEGATIVE_INFINITY ? null : { min, max };
}

/**
 * Remembers the extent of the array it was last asked about.
 *
 * Keyed on the array's identity, so replacing the data -- which is what
 * `setData` does -- invalidates by construction. A grown array is treated as an
 * append and only its tail is scanned; anything else is a full rescan, because
 * a shrunk or edited array can move the extent in either direction and there is
 * no cheap way to know.
 */
export class PriceExtentCache {
  private _data: KLineData[] | null = null;
  private _length = 0;
  private _extent: PriceExtent | null = null;

  public extentOf(data: KLineData[]): PriceExtent | null {
    if (data.length === 0) {
      this._data = data;
      this._length = 0;
      this._extent = null;
      return null;
    }

    if (this._data === data && this._length === data.length) return this._extent;

    if (this._data === data && data.length > this._length && this._extent) {
      const tail = computePriceExtent(data, this._length, data.length - 1);
      if (tail) {
        this._extent = {
          min: Math.min(this._extent.min, tail.min),
          max: Math.max(this._extent.max, tail.max),
        };
      }
    } else {
      this._extent = computePriceExtent(data);
    }

    this._data = data;
    this._length = data.length;
    return this._extent;
  }

  /** Forget the cached extent; the next read rescans. */
  public invalidate(): void {
    this._data = null;
    this._length = 0;
    this._extent = null;
  }
}
