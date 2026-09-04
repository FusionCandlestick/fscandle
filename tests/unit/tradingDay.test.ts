import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { SESSION_PRESETS, tradingDayOf } from '../../src/model/session';

const cnFutures = SESSION_PRESETS['cn-futures-night'];
const usEquity = SESSION_PRESETS['us-equity'];

/** A Shanghai wall-clock time as an instant (CST is UTC+8, no DST). */
const shanghai = (day: number, hour: number, minute = 0) =>
  Date.UTC(2026, 7, day, hour - 8, minute);
/** A New York wall-clock time in August (EDT, UTC-4). */
const newYork = (day: number, hour: number, minute = 0) =>
  Date.UTC(2026, 7, day, hour + 4, minute);

describe('which trading day a bar belongs to', () => {
  it('puts the night session on the day it leads into', () => {
    // 2026-08-10 is a Monday. Its 21:00 night session trades for Tuesday.
    assert.equal(tradingDayOf(shanghai(10, 21, 30), cnFutures), '2026-08-11');
    assert.equal(tradingDayOf(shanghai(10, 23, 0), cnFutures), '2026-08-11');
  });

  it('keeps the after-midnight tail on the same trading day as the evening', () => {
    assert.equal(tradingDayOf(shanghai(11, 1, 0), cnFutures), '2026-08-11');
    assert.equal(tradingDayOf(shanghai(11, 2, 0), cnFutures), '2026-08-11');
  });

  it('puts the morning and afternoon of that date on the same day', () => {
    assert.equal(tradingDayOf(shanghai(11, 9, 30), cnFutures), '2026-08-11');
    assert.equal(tradingDayOf(shanghai(11, 14, 0), cnFutures), '2026-08-11');
  });

  it('so a night session and the next morning are one day, not two', () => {
    // The whole point: 22:30 Monday and 09:30 Tuesday are the same trading day,
    // while 14:00 Tuesday and 21:30 Tuesday are different ones.
    assert.equal(tradingDayOf(shanghai(10, 22, 30), cnFutures), tradingDayOf(shanghai(11, 9, 30), cnFutures));
    assert.notEqual(tradingDayOf(shanghai(11, 14, 0), cnFutures), tradingDayOf(shanghai(11, 21, 30), cnFutures));
  });

  it('has no answer outside trading hours', () => {
    assert.equal(tradingDayOf(shanghai(11, 3, 30), cnFutures), null); // after the night close
    assert.equal(tradingDayOf(shanghai(11, 12, 0), cnFutures), null); // lunch
    assert.equal(tradingDayOf(shanghai(11, 19, 0), cnFutures), null); // before the night open
  });

  it('is the calendar day for a session that does not cross midnight', () => {
    assert.equal(tradingDayOf(newYork(11, 10, 0), usEquity), '2026-08-11');
    assert.equal(tradingDayOf(newYork(11, 15, 59), usEquity), '2026-08-11');
    assert.equal(tradingDayOf(newYork(11, 20, 0), usEquity), null);
  });
});
