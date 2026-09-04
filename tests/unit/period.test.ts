import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  formatPeriod,
  inferPeriod,
  parsePeriod,
  periodToMilliseconds,
  periodToTickLevel,
} from '../../src/model/period';

describe('parsePeriod', () => {
  it('parses single-letter suffixes', () => {
    assert.deepEqual(parsePeriod('15m'), { type: 'minute', span: 15 });
    assert.deepEqual(parsePeriod('4H'), { type: 'hour', span: 4 });
    assert.deepEqual(parsePeriod('1D'), { type: 'day', span: 1 });
    assert.deepEqual(parsePeriod('2W'), { type: 'week', span: 2 });
    assert.deepEqual(parsePeriod('30s'), { type: 'second', span: 30 });
  });

  it('distinguishes lowercase m (minutes) from uppercase M (months)', () => {
    assert.deepEqual(parsePeriod('3m'), { type: 'minute', span: 3 });
    assert.deepEqual(parsePeriod('3M'), { type: 'month', span: 3 });
  });

  it('treats a bare number as minutes', () => {
    assert.deepEqual(parsePeriod('15'), { type: 'minute', span: 15 });
  });

  it('accepts word suffixes case-insensitively', () => {
    assert.deepEqual(parsePeriod('15min'), { type: 'minute', span: 15 });
    assert.deepEqual(parsePeriod('2hour'), { type: 'hour', span: 2 });
    assert.deepEqual(parsePeriod('1Month'), { type: 'month', span: 1 });
  });

  it('tolerates surrounding whitespace and an inner space', () => {
    assert.deepEqual(parsePeriod('  15 m '), { type: 'minute', span: 15 });
  });

  it('rejects malformed input', () => {
    assert.equal(parsePeriod(''), null);
    assert.equal(parsePeriod('abc'), null);
    assert.equal(parsePeriod('0m'), null);
    assert.equal(parsePeriod('-5m'), null);
    assert.equal(parsePeriod('15q'), null);
  });
});

describe('formatPeriod', () => {
  it('round-trips through parsePeriod', () => {
    for (const value of ['15m', '4H', '1D', '2W', '3M', '1Y', '30s']) {
      assert.equal(formatPeriod(parsePeriod(value)!), value);
    }
  });
});

describe('periodToMilliseconds', () => {
  it('multiplies the unit by the span', () => {
    assert.equal(periodToMilliseconds({ type: 'minute', span: 15 }), 900_000);
    assert.equal(periodToMilliseconds({ type: 'hour', span: 4 }), 14_400_000);
    assert.equal(periodToMilliseconds({ type: 'day', span: 1 }), 86_400_000);
  });

  it('treats a span below 1 as 1', () => {
    assert.equal(periodToMilliseconds({ type: 'minute', span: 0 }), 60_000);
  });
});

describe('inferPeriod', () => {
  it('snaps a measured interval to the nearest common timeframe', () => {
    assert.deepEqual(inferPeriod(900_000), { type: 'minute', span: 15 });
    assert.deepEqual(inferPeriod(86_400_000), { type: 'day', span: 1 });
    assert.deepEqual(inferPeriod(3_600_000), { type: 'hour', span: 1 });
  });

  it('snaps a slightly-off interval rather than reporting an odd span', () => {
    // 61 seconds of jitter should still read as a 1-minute chart.
    assert.deepEqual(inferPeriod(61_000), { type: 'minute', span: 1 });
  });

  it('falls back to 1 minute for nonsense input', () => {
    assert.deepEqual(inferPeriod(0), { type: 'minute', span: 1 });
    assert.deepEqual(inferPeriod(-1), { type: 'minute', span: 1 });
    assert.deepEqual(inferPeriod(Number.NaN), { type: 'minute', span: 1 });
  });
});

describe('periodToTickLevel', () => {
  it('maps intraday periods to minute ticks and daily+ to coarser ticks', () => {
    assert.equal(periodToTickLevel({ type: 'second', span: 1 }), 'second');
    assert.equal(periodToTickLevel({ type: 'minute', span: 5 }), 'minute');
    assert.equal(periodToTickLevel({ type: 'hour', span: 1 }), 'minute');
    assert.equal(periodToTickLevel({ type: 'day', span: 1 }), 'day');
    assert.equal(periodToTickLevel({ type: 'week', span: 1 }), 'day');
    assert.equal(periodToTickLevel({ type: 'month', span: 1 }), 'month');
    assert.equal(periodToTickLevel({ type: 'year', span: 1 }), 'year');
  });
});
