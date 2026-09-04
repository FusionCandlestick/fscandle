import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { PriceExtentCache, computePriceExtent } from '../../src/model/priceExtent';
import type { KLineData } from '../../src/types';

const bar = (high: number, low: number, i = 0): KLineData => ({
  timestamp: 1_600_000_000_000 + i * 60_000,
  open: low,
  high,
  low,
  close: high,
  volume: 1,
});

describe('computing a price extent', () => {
  it('finds the highest high and the lowest low', () => {
    assert.deepEqual(computePriceExtent([bar(10, 5), bar(20, 8), bar(15, 3)]), { min: 3, max: 20 });
  });

  it('returns null for no data', () => {
    assert.equal(computePriceExtent([]), null);
  });

  it('ignores non-finite values instead of poisoning the range', () => {
    // One NaN used to make the whole extent NaN, which reads as a blank chart.
    assert.deepEqual(computePriceExtent([bar(10, 5), bar(NaN, Infinity), bar(12, 4)]), { min: 4, max: 12 });
  });

  it('returns null when nothing is finite', () => {
    assert.equal(computePriceExtent([bar(NaN, NaN)]), null);
  });

  it('handles a bar whose high and low are inverted', () => {
    // Feeds do produce these. Trusting `high >= low` would report a range that
    // excludes the bar's own values.
    assert.deepEqual(computePriceExtent([bar(5, 10)]), { min: 5, max: 10 });
  });

  it('scans a sub-range when asked', () => {
    const data = [bar(100, 90), bar(10, 5), bar(20, 8)];
    assert.deepEqual(computePriceExtent(data, 1, 2), { min: 5, max: 20 });
  });

  it('survives an array larger than the argument-list limit', () => {
    // The old implementation spread every price into Math.max, which throws
    // somewhere past ~120,000 arguments -- a crash, not a slow frame.
    const data = Array.from({ length: 200_000 }, (_, i) => bar(100 + (i % 7), 50 - (i % 5), i));
    assert.deepEqual(computePriceExtent(data), { min: 46, max: 106 });
  });
});

describe('caching the extent', () => {
  it('returns the same answer as a direct scan', () => {
    const data = [bar(10, 5), bar(20, 8)];
    assert.deepEqual(new PriceExtentCache().extentOf(data), computePriceExtent(data));
  });

  it('recomputes when the array is replaced', () => {
    const cache = new PriceExtentCache();
    cache.extentOf([bar(10, 5)]);
    assert.deepEqual(cache.extentOf([bar(30, 20)]), { min: 20, max: 30 });
  });

  it('folds an appended bar into the cached extent', () => {
    const cache = new PriceExtentCache();
    const data = [bar(10, 5)];
    cache.extentOf(data);
    data.push(bar(50, 1, 1));
    assert.deepEqual(cache.extentOf(data), { min: 1, max: 50 });
  });

  it('rescans when the array shrinks, because the extent can move either way', () => {
    const cache = new PriceExtentCache();
    const data = [bar(10, 5), bar(100, 1, 1)];
    cache.extentOf(data);
    data.pop();
    assert.deepEqual(cache.extentOf(data), { min: 5, max: 10 });
  });

  it('reports null for an emptied array', () => {
    const cache = new PriceExtentCache();
    cache.extentOf([bar(10, 5)]);
    assert.equal(cache.extentOf([]), null);
  });

  it('rescans after an explicit invalidation', () => {
    const cache = new PriceExtentCache();
    const data = [bar(10, 5)];
    cache.extentOf(data);
    data[0] = bar(99, 2);
    cache.invalidate();
    assert.deepEqual(cache.extentOf(data), { min: 2, max: 99 });
  });
});
