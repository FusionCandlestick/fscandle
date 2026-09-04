import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { TimeFormatter } from '../../src/model/timeFormat';

describe('resolveTickLevel', () => {
  const intraday = new TimeFormatter({
    locale: 'en-US',
    timeZone: 'UTC',
    period: { type: 'minute', span: 15 },
  });

  it('labels the first tick at day granularity for intraday periods', () => {
    const level = intraday.resolveTickLevel(Date.UTC(2026, 2, 4, 10, 0), {
      previousTimestamp: null,
    });
    assert.equal(level, 'day');
  });

  it('stays at minute granularity within one day', () => {
    const level = intraday.resolveTickLevel(Date.UTC(2026, 2, 4, 11, 0), {
      previousTimestamp: Date.UTC(2026, 2, 4, 10, 0),
    });
    assert.equal(level, 'minute');
  });

  it('escalates to day across a day boundary', () => {
    const level = intraday.resolveTickLevel(Date.UTC(2026, 2, 5, 1, 0), {
      previousTimestamp: Date.UTC(2026, 2, 4, 23, 0),
    });
    assert.equal(level, 'day');
  });

  it('escalates to year across a year boundary', () => {
    const level = intraday.resolveTickLevel(Date.UTC(2026, 0, 1, 1, 0), {
      previousTimestamp: Date.UTC(2025, 11, 31, 23, 0),
    });
    assert.equal(level, 'year');
  });

  it('escalates a daily period to month across a month boundary', () => {
    const daily = new TimeFormatter({
      locale: 'en-US',
      timeZone: 'UTC',
      period: { type: 'day', span: 1 },
    });
    const level = daily.resolveTickLevel(Date.UTC(2026, 3, 1), {
      previousTimestamp: Date.UTC(2026, 2, 31),
    });
    assert.equal(level, 'month');
  });

  it('keeps an intraday period at day across a month boundary', () => {
    // A 15m chart crossing into a new month should still read "Apr 1", not
    // jump straight to a month-level label.
    const level = intraday.resolveTickLevel(Date.UTC(2026, 3, 1, 1, 0), {
      previousTimestamp: Date.UTC(2026, 2, 31, 23, 0),
    });
    assert.equal(level, 'day');
  });

  it('evaluates boundaries in the configured timezone', () => {
    const newYork = new TimeFormatter({
      locale: 'en-US',
      timeZone: 'America/New_York',
      period: { type: 'minute', span: 15 },
    });
    // Crosses midnight UTC but not midnight in New York.
    const level = newYork.resolveTickLevel(Date.UTC(2026, 2, 5, 1, 0), {
      previousTimestamp: Date.UTC(2026, 2, 4, 23, 0),
    });
    assert.equal(level, 'minute');
  });
});

describe('format', () => {
  const formatter = new TimeFormatter({
    locale: 'en-US',
    timeZone: 'UTC',
    period: { type: 'minute', span: 15 },
  });

  it('renders each level distinctly', () => {
    const timestamp = Date.UTC(2026, 2, 4, 14, 30);
    assert.equal(formatter.format(timestamp, 'year'), '2026');
    assert.match(formatter.format(timestamp, 'month'), /Mar/);
    assert.match(formatter.format(timestamp, 'day'), /Mar\s*4/);
    assert.equal(formatter.format(timestamp, 'minute'), '14:30');
    assert.equal(formatter.format(timestamp, 'second'), '14:30:00');
  });

  it('renders in the configured timezone', () => {
    const timestamp = Date.UTC(2026, 2, 4, 14, 30);
    const newYork = new TimeFormatter({
      locale: 'en-US',
      timeZone: 'America/New_York',
      period: { type: 'minute', span: 15 },
    });
    assert.equal(newYork.format(timestamp, 'minute'), '09:30');
  });
});

describe('formatCrosshair', () => {
  it('includes the time for intraday periods', () => {
    const formatter = new TimeFormatter({
      locale: 'en-US',
      timeZone: 'UTC',
      period: { type: 'minute', span: 15 },
    });
    assert.match(formatter.formatCrosshair(Date.UTC(2026, 2, 4, 14, 30)), /14:30/);
  });

  it('omits the time for daily periods', () => {
    const formatter = new TimeFormatter({
      locale: 'en-US',
      timeZone: 'UTC',
      period: { type: 'day', span: 1 },
    });
    const text = formatter.formatCrosshair(Date.UTC(2026, 2, 4, 14, 30));
    assert.doesNotMatch(text, /14:30/);
    assert.match(text, /2026/);
  });

  it('shows only year and month for monthly periods', () => {
    const formatter = new TimeFormatter({
      locale: 'en-US',
      timeZone: 'UTC',
      period: { type: 'month', span: 1 },
    });
    const text = formatter.formatCrosshair(Date.UTC(2026, 2, 4));
    assert.match(text, /Mar/);
    assert.match(text, /2026/);
    assert.doesNotMatch(text, /\b4\b/);
  });
});

describe('setConfig', () => {
  it('applies a new timezone and period', () => {
    const formatter = new TimeFormatter({ locale: 'en-US', timeZone: 'UTC' });
    const timestamp = Date.UTC(2026, 2, 4, 14, 30);
    assert.equal(formatter.format(timestamp, 'minute'), '14:30');

    formatter.setConfig({ timeZone: 'Asia/Shanghai' });
    assert.equal(formatter.getTimeZone(), 'Asia/Shanghai');
    assert.equal(formatter.format(timestamp, 'minute'), '22:30');
  });

  it('can clear the timezone back to the runtime default', () => {
    const formatter = new TimeFormatter({ locale: 'en-US', timeZone: 'UTC' });
    formatter.setConfig({ timeZone: undefined });
    assert.equal(formatter.getTimeZone(), undefined);
  });
});
