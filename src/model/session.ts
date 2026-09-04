import { getZonedParts, getZonedMinuteOfDay } from './timezone';

/**
 * Trading session model. Lets the chart tell "the market was closed" apart
 * from "data is missing", which is what drives gap compression on the time
 * axis and session-aware extrapolation past the last bar.
 */

export interface SessionSegment {
  /** Inclusive start, minutes past midnight in the session timezone. */
  startMinute: number;
  /** Exclusive end, minutes past midnight. May exceed 1440 for overnight segments. */
  endMinute: number;
}

export interface TradingSession {
  id: string;
  name: string;
  /** IANA timezone the segments are expressed in, e.g. `America/New_York`. */
  timeZone: string;
  /** Weekdays the session trades. 0=Sunday .. 6=Saturday. */
  days: number[];
  segments: SessionSegment[];
}

/** `"09:30"` → 570. Returns null for malformed input. */
export function parseTimeOfDay(value: string): number | null {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hour = Number.parseInt(match[1], 10);
  const minute = Number.parseInt(match[2], 10);
  if (hour < 0 || hour > 24 || minute < 0 || minute > 59) return null;
  return hour * 60 + minute;
}

/** Build a session from human-readable `"HH:MM"` ranges. */
export function defineSession(config: {
  id: string;
  name: string;
  timeZone: string;
  days: number[];
  segments: Array<{ start: string; end: string }>;
}): TradingSession {
  const segments: SessionSegment[] = [];
  for (const segment of config.segments) {
    const startMinute = parseTimeOfDay(segment.start);
    const endMinute = parseTimeOfDay(segment.end);
    if (startMinute === null || endMinute === null) {
      throw new Error(`Invalid session segment ${segment.start}-${segment.end} in "${config.id}"`);
    }
    // An end at or before the start means the segment wraps past midnight.
    segments.push({
      startMinute,
      endMinute: endMinute <= startMinute ? endMinute + 1440 : endMinute,
    });
  }
  return { ...config, segments };
}

export const SESSION_PRESETS: Record<string, TradingSession> = {
  'crypto-24x7': defineSession({
    id: 'crypto-24x7',
    name: 'Crypto (24/7)',
    timeZone: 'UTC',
    days: [0, 1, 2, 3, 4, 5, 6],
    segments: [{ start: '00:00', end: '24:00' }],
  }),
  'us-equity': defineSession({
    id: 'us-equity',
    name: 'US Equities (Regular)',
    timeZone: 'America/New_York',
    days: [1, 2, 3, 4, 5],
    segments: [{ start: '09:30', end: '16:00' }],
  }),
  'us-equity-extended': defineSession({
    id: 'us-equity-extended',
    name: 'US Equities (Pre + Post)',
    timeZone: 'America/New_York',
    days: [1, 2, 3, 4, 5],
    segments: [{ start: '04:00', end: '20:00' }],
  }),
  'cn-a-share': defineSession({
    id: 'cn-a-share',
    name: 'China A-Share',
    timeZone: 'Asia/Shanghai',
    days: [1, 2, 3, 4, 5],
    segments: [
      { start: '09:30', end: '11:30' },
      { start: '13:00', end: '15:00' },
    ],
  }),
  'hk-equity': defineSession({
    id: 'hk-equity',
    name: 'Hong Kong Equities',
    timeZone: 'Asia/Hong_Kong',
    days: [1, 2, 3, 4, 5],
    segments: [
      { start: '09:30', end: '12:00' },
      { start: '13:00', end: '16:00' },
    ],
  }),
  'cn-futures-night': defineSession({
    id: 'cn-futures-night',
    name: 'China Futures (night + day)',
    timeZone: 'Asia/Shanghai',
    days: [1, 2, 3, 4, 5],
    // The night session opens at 21:00 and runs past midnight into the *next*
    // trading day, which is what `tradingDayOf` below has to account for: a bar
    // at 22:30 on Monday belongs to Tuesday's trading day, and the 02:30-09:00
    // break inside that day is not a day boundary.
    segments: [
      { start: '21:00', end: '02:30' },
      { start: '09:00', end: '11:30' },
      { start: '13:30', end: '15:00' },
    ],
  }),
  forex: defineSession({
    id: 'forex',
    name: 'Forex (Sun 17:00 – Fri 17:00 ET)',
    timeZone: 'America/New_York',
    days: [0, 1, 2, 3, 4, 5],
    // Sunday opens at 17:00 and each weekday runs through to the next close.
    segments: [{ start: '17:00', end: '17:00' }],
  }),
};

/** Whether `timestamp` falls inside the session's trading hours. */
export function isWithinSession(timestamp: number, session: TradingSession): boolean {
  const parts = getZonedParts(timestamp, session.timeZone);
  const minuteOfDay = getZonedMinuteOfDay(timestamp, session.timeZone);

  for (const segment of session.segments) {
    if (segment.endMinute <= 1440) {
      if (
        session.days.includes(parts.weekday) &&
        minuteOfDay >= segment.startMinute &&
        minuteOfDay < segment.endMinute
      ) {
        return true;
      }
      continue;
    }

    // Overnight segment: the tail belongs to the previous calendar day, so
    // check both "started today" and "started yesterday and ran over".
    const startedToday =
      session.days.includes(parts.weekday) && minuteOfDay >= segment.startMinute;
    const previousWeekday = (parts.weekday + 6) % 7;
    const startedYesterday =
      session.days.includes(previousWeekday) && minuteOfDay < segment.endMinute - 1440;

    if (startedToday || startedYesterday) return true;
  }

  return false;
}

/**
 * Total minutes the session trades on a given weekday. Used to size the
 * time axis when compressing non-trading gaps.
 */
export function getSessionMinutesForWeekday(session: TradingSession, weekday: number): number {
  if (!session.days.includes(weekday)) return 0;
  return session.segments.reduce(
    (total, segment) => total + (segment.endMinute - segment.startMinute),
    0,
  );
}

/**
 * Advance to the next instant the session is open, scanning minute-by-minute
 * from the next minute boundary. Bounded to two weeks so a misconfigured
 * session can never spin forever.
 */
export function nextSessionOpen(timestamp: number, session: TradingSession): number | null {
  const step = 60_000;
  const limit = 14 * 24 * 60; // minutes in two weeks
  let cursor = Math.floor(timestamp / step) * step + step;

  for (let i = 0; i < limit; i++) {
    if (isWithinSession(cursor, session)) return cursor;
    cursor += step;
  }
  return null;
}

/**
 * The trading day a timestamp belongs to, as `YYYY-MM-DD` in session time.
 *
 * Not the calendar day. A market with a night session opens the day *before*
 * the day it trades for: a Chinese futures bar at 22:30 Monday belongs to
 * Tuesday's session, and so does the 01:00 bar after midnight. Anything that
 * ruled off where the calendar day changed would cut that day in half at
 * midnight and again at the 02:30-09:00 break, and would miss the real boundary
 * at 21:00 entirely.
 *
 * Returns null outside trading hours, where the question has no answer.
 */
export function tradingDayOf(timestamp: number, session: TradingSession): string | null {
  if (!isWithinSession(timestamp, session)) return null;

  const parts = getZonedParts(timestamp, session.timeZone);
  const minuteOfDay = getZonedMinuteOfDay(timestamp, session.timeZone);

  // A bar inside an overnight segment that has already started belongs to the
  // next day; one in the tail after midnight belongs to the day it started in
  // -- which is the day it is already stamped with, so only the first case
  // moves the answer forward.
  let dayShift = 0;
  for (const segment of session.segments) {
    if (segment.endMinute <= 1440) continue;
    if (minuteOfDay >= segment.startMinute) {
      dayShift = 1;
      break;
    }
  }

  const day = new Date(Date.UTC(parts.year, parts.month - 1, parts.day) + dayShift * 86_400_000);
  return day.toISOString().slice(0, 10);
}

export function getSessionPreset(id: string): TradingSession | null {
  return SESSION_PRESETS[id] ?? null;
}
