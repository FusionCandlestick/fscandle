import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  getTimeZoneOffsetMinutes,
  getZonedMinuteOfDay,
  getZonedParts,
  isNewDay,
  isNewMonth,
  isNewYear,
} from '../../src/model/timezone';

describe('getZonedParts', () => {
  it('decomposes a UTC instant in the requested timezone', () => {
    // 2026-03-04T14:30:00Z
    const timestamp = Date.UTC(2026, 2, 4, 14, 30, 0);

    const utc = getZonedParts(timestamp, 'UTC');
    assert.deepEqual(
      { year: utc.year, month: utc.month, day: utc.day, hour: utc.hour, minute: utc.minute },
      { year: 2026, month: 3, day: 4, hour: 14, minute: 30 },
    );

    // New York is UTC-5 in early March (before US DST starts).
    const ny = getZonedParts(timestamp, 'America/New_York');
    assert.equal(ny.hour, 9);
    assert.equal(ny.day, 4);

    // Shanghai is UTC+8 year-round, pushing this instant to 22:30 same day.
    const shanghai = getZonedParts(timestamp, 'Asia/Shanghai');
    assert.equal(shanghai.hour, 22);
    assert.equal(shanghai.day, 4);
  });

  it('reports midnight as hour 0, not 24', () => {
    const midnight = Date.UTC(2026, 5, 1, 0, 0, 0);
    assert.equal(getZonedParts(midnight, 'UTC').hour, 0);
  });

  it('reports weekday with Sunday as 0', () => {
    // 2026-03-01 is a Sunday.
    assert.equal(getZonedParts(Date.UTC(2026, 2, 1, 12), 'UTC').weekday, 0);
    // 2026-03-04 is a Wednesday.
    assert.equal(getZonedParts(Date.UTC(2026, 2, 4, 12), 'UTC').weekday, 3);
  });
});

describe('calendar boundary detection', () => {
  it('uses the target timezone, not the runtime local zone', () => {
    // Mar 4 23:00 UTC -> Mar 5 07:00 Shanghai, Mar 4 18:00 New York.
    // Mar 5 01:00 UTC -> Mar 5 09:00 Shanghai, Mar 4 20:00 New York.
    // So the pair crosses a day boundary in UTC only. A check written against
    // local `Date` getters would report whatever the runtime's zone happens
    // to be, which is the bug this function exists to avoid.
    const beforeMidnightUtc = Date.UTC(2026, 2, 4, 23, 0);
    const afterMidnightUtc = Date.UTC(2026, 2, 5, 1, 0);

    assert.equal(isNewDay(beforeMidnightUtc, afterMidnightUtc, 'UTC'), true);
    assert.equal(isNewDay(beforeMidnightUtc, afterMidnightUtc, 'Asia/Shanghai'), false);
    assert.equal(isNewDay(beforeMidnightUtc, afterMidnightUtc, 'America/New_York'), false);

    // Mirror image: Mar 4 03:00 and 05:00 UTC are one UTC day and one
    // Shanghai day, but straddle midnight in New York (Mar 3 22:00 -> Mar 4 00:00).
    const early = Date.UTC(2026, 2, 4, 3, 0);
    const late = Date.UTC(2026, 2, 4, 5, 0);
    assert.equal(isNewDay(early, late, 'UTC'), false);
    assert.equal(isNewDay(early, late, 'Asia/Shanghai'), false);
    assert.equal(isNewDay(early, late, 'America/New_York'), true);
  });

  it('detects month boundaries in the target timezone', () => {
    const endOfMarch = Date.UTC(2026, 2, 31, 23, 0);
    const startOfApril = Date.UTC(2026, 3, 1, 1, 0);
    assert.equal(isNewMonth(endOfMarch, startOfApril, 'UTC'), true);
    // Still 19:00 on March 31 in New York.
    assert.equal(isNewMonth(endOfMarch, startOfApril, 'America/New_York'), false);
  });

  it('detects year boundaries in the target timezone', () => {
    const newYearsEve = Date.UTC(2025, 11, 31, 23, 30);
    const newYearsDay = Date.UTC(2026, 0, 1, 0, 30);
    assert.equal(isNewYear(newYearsEve, newYearsDay, 'UTC'), true);
    // Tokyo (UTC+9) already crossed into 2026 before both instants.
    assert.equal(isNewYear(newYearsEve, newYearsDay, 'Asia/Tokyo'), false);
  });
});

describe('getZonedMinuteOfDay', () => {
  it('returns minutes past local midnight', () => {
    const timestamp = Date.UTC(2026, 2, 4, 14, 30);
    assert.equal(getZonedMinuteOfDay(timestamp, 'UTC'), 14 * 60 + 30);
    // 09:30 in New York during standard time.
    assert.equal(getZonedMinuteOfDay(timestamp, 'America/New_York'), 9 * 60 + 30);
  });
});

describe('getTimeZoneOffsetMinutes', () => {
  it('reports fixed offsets', () => {
    const timestamp = Date.UTC(2026, 2, 4, 12);
    assert.equal(getTimeZoneOffsetMinutes(timestamp, 'UTC'), 0);
    assert.equal(getTimeZoneOffsetMinutes(timestamp, 'Asia/Shanghai'), 480);
  });

  it('follows DST transitions', () => {
    // US DST 2026 starts March 8. Before it New York is -300, after it -240.
    const beforeDst = Date.UTC(2026, 2, 4, 12);
    const afterDst = Date.UTC(2026, 2, 12, 12);
    assert.equal(getTimeZoneOffsetMinutes(beforeDst, 'America/New_York'), -300);
    assert.equal(getTimeZoneOffsetMinutes(afterDst, 'America/New_York'), -240);
  });
});
