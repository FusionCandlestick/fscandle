import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  SESSION_PRESETS,
  defineSession,
  getSessionMinutesForWeekday,
  getSessionPreset,
  isWithinSession,
  nextSessionOpen,
  parseTimeOfDay,
} from '../../src/model/session';

describe('parseTimeOfDay', () => {
  it('converts HH:MM to minutes past midnight', () => {
    assert.equal(parseTimeOfDay('00:00'), 0);
    assert.equal(parseTimeOfDay('09:30'), 570);
    assert.equal(parseTimeOfDay('16:00'), 960);
    assert.equal(parseTimeOfDay('24:00'), 1440);
  });

  it('rejects malformed values', () => {
    assert.equal(parseTimeOfDay('9:3'), null);
    assert.equal(parseTimeOfDay('25:00'), null);
    assert.equal(parseTimeOfDay('09:60'), null);
    assert.equal(parseTimeOfDay('abc'), null);
  });
});

describe('defineSession', () => {
  it('wraps a segment past midnight when the end is not after the start', () => {
    const session = defineSession({
      id: 'overnight',
      name: 'Overnight',
      timeZone: 'UTC',
      days: [1],
      segments: [{ start: '17:00', end: '03:00' }],
    });
    assert.equal(session.segments[0].startMinute, 1020);
    assert.equal(session.segments[0].endMinute, 180 + 1440);
  });

  it('throws on an invalid segment rather than silently dropping it', () => {
    assert.throws(() =>
      defineSession({
        id: 'bad',
        name: 'Bad',
        timeZone: 'UTC',
        days: [1],
        segments: [{ start: 'nope', end: '16:00' }],
      }),
    );
  });
});

describe('isWithinSession', () => {
  const usEquity = SESSION_PRESETS['us-equity'];

  it('accepts a weekday inside regular US market hours', () => {
    // 2026-03-04 is a Wednesday. 14:30 UTC == 09:30 New York (pre-DST).
    assert.equal(isWithinSession(Date.UTC(2026, 2, 4, 14, 30), usEquity), true);
    assert.equal(isWithinSession(Date.UTC(2026, 2, 4, 18, 0), usEquity), true);
  });

  it('rejects before the open and at or after the close', () => {
    assert.equal(isWithinSession(Date.UTC(2026, 2, 4, 14, 0), usEquity), false);
    // 21:00 UTC == 16:00 New York, which is the exclusive end.
    assert.equal(isWithinSession(Date.UTC(2026, 2, 4, 21, 0), usEquity), false);
  });

  it('rejects weekends', () => {
    // 2026-03-07 is a Saturday.
    assert.equal(isWithinSession(Date.UTC(2026, 2, 7, 15, 0), usEquity), false);
    // 2026-03-08 is a Sunday.
    assert.equal(isWithinSession(Date.UTC(2026, 2, 8, 15, 0), usEquity), false);
  });

  it('handles the A-share lunch break', () => {
    const cn = SESSION_PRESETS['cn-a-share'];
    // Shanghai is UTC+8. 02:00 UTC == 10:00 local (morning session).
    assert.equal(isWithinSession(Date.UTC(2026, 2, 4, 2, 0), cn), true);
    // 04:00 UTC == 12:00 local, inside the 11:30-13:00 break.
    assert.equal(isWithinSession(Date.UTC(2026, 2, 4, 4, 0), cn), false);
    // 06:00 UTC == 14:00 local (afternoon session).
    assert.equal(isWithinSession(Date.UTC(2026, 2, 4, 6, 0), cn), true);
  });

  it('treats crypto as always open', () => {
    const crypto = SESSION_PRESETS['crypto-24x7'];
    assert.equal(isWithinSession(Date.UTC(2026, 2, 7, 3, 17), crypto), true);
    assert.equal(isWithinSession(Date.UTC(2026, 2, 8, 23, 59), crypto), true);
  });

  it('handles an overnight segment that spans midnight', () => {
    const overnight = defineSession({
      id: 'overnight',
      name: 'Overnight',
      timeZone: 'UTC',
      days: [3], // Wednesday
      segments: [{ start: '22:00', end: '04:00' }],
    });
    // Wednesday 23:00 — inside, started today.
    assert.equal(isWithinSession(Date.UTC(2026, 2, 4, 23, 0), overnight), true);
    // Thursday 02:00 — inside, carried over from Wednesday.
    assert.equal(isWithinSession(Date.UTC(2026, 2, 5, 2, 0), overnight), true);
    // Thursday 06:00 — past the carry-over end.
    assert.equal(isWithinSession(Date.UTC(2026, 2, 5, 6, 0), overnight), false);
    // Wednesday 12:00 — before the open.
    assert.equal(isWithinSession(Date.UTC(2026, 2, 4, 12, 0), overnight), false);
  });
});

describe('getSessionMinutesForWeekday', () => {
  it('sums the segments on a trading day', () => {
    assert.equal(getSessionMinutesForWeekday(SESSION_PRESETS['us-equity'], 3), 390);
    // A-share: 2h morning + 2h afternoon.
    assert.equal(getSessionMinutesForWeekday(SESSION_PRESETS['cn-a-share'], 3), 240);
  });

  it('returns zero on a non-trading day', () => {
    assert.equal(getSessionMinutesForWeekday(SESSION_PRESETS['us-equity'], 6), 0);
  });
});

describe('nextSessionOpen', () => {
  it('finds the next open from inside a closed period', () => {
    const usEquity = SESSION_PRESETS['us-equity'];
    // Wednesday 02:00 UTC == Tuesday 21:00 New York, market closed.
    const next = nextSessionOpen(Date.UTC(2026, 2, 4, 2, 0), usEquity);
    assert.notEqual(next, null);
    assert.equal(isWithinSession(next!, usEquity), true);
    // The next open is Wednesday 09:30 New York == 14:30 UTC.
    assert.equal(next, Date.UTC(2026, 2, 4, 14, 30));
  });

  it('returns the following minute when already open', () => {
    const crypto = SESSION_PRESETS['crypto-24x7'];
    const from = Date.UTC(2026, 2, 4, 12, 0);
    assert.equal(nextSessionOpen(from, crypto), from + 60_000);
  });
});

describe('getSessionPreset', () => {
  it('resolves known ids and returns null otherwise', () => {
    assert.equal(getSessionPreset('us-equity')?.id, 'us-equity');
    assert.equal(getSessionPreset('nope'), null);
  });
});
