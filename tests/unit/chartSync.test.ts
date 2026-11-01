import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { planDataSync, stableSignature } from '../../src/model/chartSync';
import type { KLineData } from '../../src/types';

function bar(timestamp: number, close = timestamp): KLineData {
  return { timestamp, open: close, high: close, low: close, close, volume: 1 };
}

function series(count: number): KLineData[] {
  return Array.from({ length: count }, (_, i) => bar(i * 60_000));
}

describe('planDataSync', () => {
  it('sets when there is no previous data', () => {
    const next = series(3);
    assert.deepEqual(planDataSync(null, next), { kind: 'set', data: next });
  });

  it('sets when the previous data was empty', () => {
    const next = series(2);
    assert.deepEqual(planDataSync([], next), { kind: 'set', data: next });
  });

  it('does nothing for the same array', () => {
    const data = series(3);
    assert.deepEqual(planDataSync(data, data), { kind: 'none' });
  });

  it('does nothing when only identical bars are present again', () => {
    const data = series(3);
    assert.deepEqual(planDataSync(data, [...data]), { kind: 'none' });
  });

  it('upserts the new bar when one bar is appended to a live feed', () => {
    const prev = series(3);
    const appended = bar(3 * 60_000);
    const next = [...prev, appended];
    assert.deepEqual(planDataSync(prev, next), { kind: 'upsert', bars: [prev[2], appended] });
  });

  it('upserts the last bar when it changes in place with the same timestamp', () => {
    const prev = series(3);
    const revised = bar(prev[2].timestamp, 999);
    const next = [prev[0], prev[1], revised];
    assert.deepEqual(planDataSync(prev, next), { kind: 'upsert', bars: [revised] });
  });

  it('sets when an earlier bar is replaced by a new object', () => {
    const prev = series(3);
    const next = [bar(0), prev[1], prev[2]];
    assert.equal(planDataSync(prev, next).kind, 'set');
  });

  it('sets when the history is shorter', () => {
    const prev = series(3);
    assert.equal(planDataSync(prev, prev.slice(0, 2)).kind, 'set');
  });

  it('sets when the last timestamp moves', () => {
    const prev = series(3);
    const next = [...prev.slice(0, 2), bar(prev[2].timestamp + 1)];
    assert.equal(planDataSync(prev, next).kind, 'set');
  });

  it('sets when the series is cleared', () => {
    assert.deepEqual(planDataSync(series(3), []), { kind: 'set', data: [] });
  });
});

describe('stableSignature', () => {
  it('is equal for structurally equal values', () => {
    assert.equal(stableSignature({ a: 1, b: [2] }), stableSignature({ a: 1, b: [2] }));
  });

  it('differs when a value changes', () => {
    assert.notEqual(stableSignature({ a: 1 }), stableSignature({ a: 2 }));
  });

  it('is always different for values that cannot be serialised', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    assert.notEqual(stableSignature(circular), stableSignature(circular));
  });
});
