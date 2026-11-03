import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { isUsableRange, visibleOhlcRange } from '../../src/engine/customPane';
import { makeBar } from '../support/fixtures';

describe('isUsableRange', () => {
  it('accepts finite ranges with max above min', () => {
    assert.equal(isUsableRange({ min: 0, max: 1 }), true);
  });

  it('rejects empty, inverted and non-finite ranges', () => {
    for (const range of [null, undefined, { min: 1, max: 1 }, { min: 2, max: 1 }, { min: Number.NaN, max: 1 }, { min: 0, max: Number.POSITIVE_INFINITY }]) {
      assert.equal(isUsableRange(range as never), false, JSON.stringify(range));
    }
  });
});

describe('visibleOhlcRange', () => {
  const data = [
    makeBar(0, 100),
    makeBar(1, 120),
    makeBar(2, 90),
  ];

  it('spans the high and low of the bars on screen only', () => {
    const range = visibleOhlcRange(data, { from: 0, to: 1 });
    assert.deepEqual(range, {
      min: Math.min(data[0].low, data[1].low),
      max: Math.max(data[0].high, data[1].high),
    });
  });

  it('ignores bars outside the requested range', () => {
    const range = visibleOhlcRange(data, { from: 2, to: 2 });
    assert.deepEqual(range, { min: data[2].low, max: data[2].high });
  });

  it('returns null when no bar is on screen', () => {
    assert.equal(visibleOhlcRange(data, { from: 10, to: 12 }), null);
    assert.equal(visibleOhlcRange([], { from: 0, to: 0 }), null);
  });

  it('widens a flat range so the pane still has a scale', () => {
    const flat = [{ ...makeBar(0, 100), high: 100, low: 100 }];
    const range = visibleOhlcRange(flat, { from: 0, to: 0 });
    assert.ok(range);
    assert.ok(range.max > range.min);
  });
});
