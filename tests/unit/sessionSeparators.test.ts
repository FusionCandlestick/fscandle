import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { findSessionBoundaries } from '../../src/model/sessionSeparators';
import { SESSION_PRESETS } from '../../src/model/session';

const HOUR = 3_600_000;
const DAY = 86_400_000;
/** Two trading days of hourly bars, 09:00-16:00, with the overnight gap between. */
const twoDays = [
  ...Array.from({ length: 8 }, (_, i) => Date.UTC(2026, 7, 10, 9 + i)),
  ...Array.from({ length: 8 }, (_, i) => Date.UTC(2026, 7, 11, 9 + i)),
];

describe('finding where the trading day changes', () => {
  it('marks the first bar after the overnight gap', () => {
    assert.deepEqual(findSessionBoundaries({ timestamps: twoDays, from: 0, to: twoDays.length - 1 }), [8]);
  });

  it('gives the same answer wherever the reader is', () => {
    // The bug this replaced: a US session is two calendar days in Auckland, so
    // a day-change rule ruled off a two-day card three times there and twice in
    // New York. A gap is the same number in every timezone.
    const boundaries = findSessionBoundaries({ timestamps: twoDays, from: 0, to: twoDays.length - 1 });
    assert.equal(boundaries.length, 1);
  });

  it('never marks index 0, which would draw a rule down the left edge', () => {
    assert.deepEqual(findSessionBoundaries({ timestamps: twoDays.slice(8), from: 0, to: 7 }), []);
  });

  it('returns nothing for a single session', () => {
    assert.deepEqual(findSessionBoundaries({ timestamps: twoDays.slice(0, 8), from: 0, to: 7 }), []);
  });

  it('only reports boundaries inside the range it was asked about', () => {
    const threeDays = [...twoDays, ...Array.from({ length: 8 }, (_, i) => Date.UTC(2026, 7, 12, 9 + i))];
    assert.deepEqual(findSessionBoundaries({ timestamps: threeDays, from: 0, to: 23 }), [8, 16]);
    assert.deepEqual(findSessionBoundaries({ timestamps: threeDays, from: 9, to: 23 }), [16]);
  });

  it('leaves daily data alone, where every weekend would otherwise rule off', () => {
    // Mon-Fri for three weeks: the weekend gap is 3x the interval, which on an
    // intraday chart would be a break and on a daily one is just the week.
    const daily: number[] = [];
    for (let week = 0; week < 3; week += 1) {
      for (let day = 0; day < 5; day += 1) daily.push(Date.UTC(2026, 7, 3) + week * 7 * DAY + day * DAY);
    }
    assert.deepEqual(findSessionBoundaries({ timestamps: daily, from: 0, to: daily.length - 1 }), []);
  });

  it('ignores a gap that is merely a slow bar', () => {
    const oneMissing = [...Array.from({ length: 6 }, (_, i) => Date.UTC(2026, 7, 10, 9) + i * HOUR)];
    oneMissing[3] += HOUR * 0.4;
    assert.deepEqual(findSessionBoundaries({ timestamps: oneMissing, from: 0, to: 5 }), []);
  });

  it('survives too little data and non-finite timestamps', () => {
    assert.deepEqual(findSessionBoundaries({ timestamps: [], from: 0, to: 0 }), []);
    assert.deepEqual(findSessionBoundaries({ timestamps: [1], from: 0, to: 0 }), []);
    assert.deepEqual(findSessionBoundaries({ timestamps: [Number.NaN, 1, 2], from: 0, to: 2 }), []);
  });
});

describe('markets with a night session', () => {
  const cnFutures = SESSION_PRESETS['cn-futures-night'];
  const shanghai = (day: number, hour: number, minute = 0) => Date.UTC(2026, 7, day, hour - 8, minute);

  /**
   * One trading day of Chinese futures, in bars: the night session opens 21:00
   * on the previous calendar day and runs to 02:30, then the day session runs
   * 09:00-11:30 and 13:30-15:00. Two such days back to back.
   */
  const twoFuturesDays = [
    shanghai(10, 21), shanghai(10, 22), shanghai(10, 23), shanghai(11, 1), shanghai(11, 2),
    shanghai(11, 9), shanghai(11, 10), shanghai(11, 11), shanghai(11, 14),
    shanghai(11, 21), shanghai(11, 22), shanghai(11, 23), shanghai(12, 1), shanghai(12, 2),
    shanghai(12, 9), shanghai(12, 10), shanghai(12, 11), shanghai(12, 14),
  ];

  it('rules off once per trading day, at the night open', () => {
    // Index 9 is the 21:00 bar that opens the *next* trading day. The 02:30 to
    // 09:00 break inside a day (index 5, and 14) is not a boundary.
    assert.deepEqual(
      findSessionBoundaries({ timestamps: twoFuturesDays, from: 0, to: twoFuturesDays.length - 1, session: cnFutures }),
      [9],
    );
  });

  it('is what the gap heuristic cannot do on its own', () => {
    // Without the session, the 02:30-09:00 break looks exactly like the one
    // that ends the day, so the same data is cut three times instead of once.
    const withoutSession = findSessionBoundaries({
      timestamps: twoFuturesDays, from: 0, to: twoFuturesDays.length - 1,
    });
    assert.ok(withoutSession.length > 1, `expected the gap rule to over-split, got ${withoutSession.length}`);
  });

  it('still rules off once a day for a session that does not cross midnight', () => {
    const usEquity = SESSION_PRESETS['us-equity'];
    const newYork = (day: number, hour: number) => Date.UTC(2026, 7, day, hour + 4);
    const twoDaysUS = [
      ...Array.from({ length: 6 }, (_, i) => newYork(10, 10 + i)),
      ...Array.from({ length: 6 }, (_, i) => newYork(11, 10 + i)),
    ];
    assert.deepEqual(
      findSessionBoundaries({ timestamps: twoDaysUS, from: 0, to: twoDaysUS.length - 1, session: usEquity }),
      [6],
    );
  });
});
