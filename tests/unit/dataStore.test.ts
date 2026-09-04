import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { DataStore } from '../../src/store/DataStore';
import { SESSION_PRESETS } from '../../src/model/session';
import type { KLineData } from '../../src/types';

const MINUTE = 60_000;

function bar(timestamp: number, close = 100): KLineData {
  return { timestamp, open: close, high: close + 1, low: close - 1, close, volume: 10 };
}

/** `count` bars spaced `step` apart starting at `start`. */
function series(start: number, count: number, step: number): KLineData[] {
  return Array.from({ length: count }, (_, i) => bar(start + i * step, 100 + i));
}

describe('setData', () => {
  it('sorts by timestamp', () => {
    const store = new DataStore();
    store.setData([bar(300), bar(100), bar(200)]);
    assert.deepEqual(
      store.getData().map(item => item.timestamp),
      [100, 200, 300],
    );
  });

  it('notifies subscribers and supports unsubscribe', () => {
    const store = new DataStore();
    let calls = 0;
    const unsubscribe = store.subscribe(() => {
      calls += 1;
    });

    store.setData([bar(100)]);
    assert.equal(calls, 1);

    unsubscribe();
    store.setData([bar(200)]);
    assert.equal(calls, 1, 'unsubscribed callback must not fire again');
  });
});

describe('addData', () => {
  it('replaces a bar with a matching timestamp', () => {
    const store = new DataStore();
    store.setData([bar(100, 10), bar(200, 20)]);
    store.addData(bar(200, 99));
    assert.equal(store.getData().length, 2);
    assert.equal(store.getData()[1].close, 99);
  });

  it('inserts an out-of-order bar in the right place', () => {
    const store = new DataStore();
    store.setData([bar(100), bar(300)]);
    store.addData(bar(200));
    assert.deepEqual(
      store.getData().map(item => item.timestamp),
      [100, 200, 300],
    );
  });
});

describe('timestampToLogicalIndex', () => {
  it('returns integer indexes for exact bars', () => {
    const store = new DataStore();
    store.setData(series(0, 5, MINUTE));
    assert.equal(store.timestampToLogicalIndex(0), 0);
    assert.equal(store.timestampToLogicalIndex(2 * MINUTE), 2);
    assert.equal(store.timestampToLogicalIndex(4 * MINUTE), 4);
  });

  it('interpolates between bars', () => {
    const store = new DataStore();
    store.setData(series(0, 5, MINUTE));
    assert.ok(Math.abs(store.timestampToLogicalIndex(MINUTE * 1.5) - 1.5) < 1e-9);
  });

  it('extrapolates past the last bar using the regular interval', () => {
    const store = new DataStore();
    store.setData(series(0, 5, MINUTE));
    assert.ok(Math.abs(store.timestampToLogicalIndex(6 * MINUTE) - 6) < 1e-9);
  });

  it('extrapolates before the first bar', () => {
    const store = new DataStore();
    store.setData(series(10 * MINUTE, 5, MINUTE));
    assert.ok(Math.abs(store.timestampToLogicalIndex(8 * MINUTE) - -2) < 1e-9);
  });

  it('returns 0 for an empty store', () => {
    assert.equal(new DataStore().timestampToLogicalIndex(12345), 0);
  });
});

describe('logicalIndexToTimestamp', () => {
  it('inverts timestampToLogicalIndex', () => {
    const store = new DataStore();
    store.setData(series(0, 10, MINUTE));
    for (const index of [0, 3, 7.5, 9]) {
      const timestamp = store.logicalIndexToTimestamp(index)!;
      assert.ok(
        Math.abs(store.timestampToLogicalIndex(timestamp) - index) < 1e-6,
        `index ${index} did not round-trip`,
      );
    }
  });

  it('returns null for an empty store', () => {
    assert.equal(new DataStore().logicalIndexToTimestamp(0), null);
  });
});

describe('interval detection', () => {
  it('infers the regular interval from the data', () => {
    const store = new DataStore();
    store.setData(series(0, 10, 5 * MINUTE));
    assert.equal(store.getRegularInterval(), 5 * MINUTE);
  });

  it('lets a declared period override the inferred interval', () => {
    const store = new DataStore();
    // Data that looks like 5m, declared as 15m.
    store.setData(series(0, 10, 5 * MINUTE));
    store.setPeriod({ type: 'minute', span: 15 });
    assert.equal(store.getRegularInterval(), 15 * MINUTE);
    assert.equal(store.getDetectedInterval(), 15 * MINUTE);
  });

  it('reverts to inference when the period is cleared', () => {
    const store = new DataStore();
    store.setData(series(0, 10, 5 * MINUTE));
    store.setPeriod({ type: 'minute', span: 15 });
    store.setPeriod(null);
    assert.equal(store.getRegularInterval(), 5 * MINUTE);
  });

  it('defaults to one hour with fewer than two bars', () => {
    const store = new DataStore();
    store.setData([bar(0)]);
    assert.equal(store.getRegularInterval(), 3_600_000);
  });
});

describe('session-aware gap handling', () => {
  // Early March 2026 is before US DST, so New York is UTC-5.
  // These pairs are both 2 minutes apart on a 1-minute chart, i.e. below the
  // generic "3x the bar interval" gap threshold. The only thing that can
  // separate them is whether the market was open, which is exactly what
  // declaring a session buys.
  const afterCloseA = Date.UTC(2026, 2, 4, 21, 0); // Wed 16:00 ET (closed)
  const afterCloseB = Date.UTC(2026, 2, 4, 21, 2); // Wed 16:02 ET (closed)
  const duringOpenA = Date.UTC(2026, 2, 4, 20, 0); // Wed 15:00 ET (open)
  const duringOpenB = Date.UTC(2026, 2, 4, 20, 2); // Wed 15:02 ET (open)

  function midpointIndex(bars: KLineData[], withSession: boolean) {
    const store = new DataStore();
    if (withSession) store.setSession(SESSION_PRESETS['us-equity']);
    store.setPeriod({ type: 'minute', span: 1 });
    store.setData(bars);
    return store.timestampToLogicalIndex((bars[0].timestamp + bars[1].timestamp) / 2);
  }

  it('compresses a closure even when it is below the generic gap threshold', () => {
    const index = midpointIndex([bar(afterCloseA), bar(afterCloseB)], true);
    // Compressed: the midpoint collapses onto a neighbouring bar instead of
    // occupying axis space proportional to the elapsed time. The snap lands
    // just inside the neighbour rather than exactly on it.
    const distanceToNearestBar = Math.min(index, Math.abs(1 - index));
    assert.ok(
      distanceToNearestBar < 1e-3,
      `expected the closure to be compressed onto a bar, got logical index ${index}`,
    );
  });

  it('interpolates normally across the same span while the market is open', () => {
    const index = midpointIndex([bar(duringOpenA), bar(duringOpenB)], true);
    assert.ok(
      Math.abs(index - 0.5) < 1e-6,
      `expected proportional spacing during session hours, got ${index}`,
    );
  });

  it('cannot tell the two spans apart without a session', () => {
    // Both spans interpolate identically when no session is declared — this
    // is the behaviour the session option exists to improve on.
    const closed = midpointIndex([bar(afterCloseA), bar(afterCloseB)], false);
    const open = midpointIndex([bar(duringOpenA), bar(duringOpenB)], false);
    assert.ok(Math.abs(closed - 0.5) < 1e-6, `closed span: ${closed}`);
    assert.ok(Math.abs(open - 0.5) < 1e-6, `open span: ${open}`);
  });

  it('keeps an overnight break adjacent on the axis', () => {
    const store = new DataStore();
    store.setSession(SESSION_PRESETS['us-equity']);
    store.setPeriod({ type: 'minute', span: 30 });

    // Wed 15:30 ET (last bar of the day) to Thu 09:30 ET (first of the next).
    const wedClose = Date.UTC(2026, 2, 4, 20, 30);
    const thuOpen = Date.UTC(2026, 2, 5, 14, 30);
    store.setData([bar(wedClose), bar(thuOpen)]);

    // 18 hours of closure must not translate into 36 bars of empty axis.
    const midnight = Date.UTC(2026, 2, 5, 5, 0);
    const index = store.timestampToLogicalIndex(midnight);
    assert.ok(index >= 0 && index <= 1, `overnight span leaked onto the axis: ${index}`);
  });
});

describe('getVisibleData', () => {
  it('slices and clamps to the data bounds', () => {
    const store = new DataStore();
    store.setData(series(0, 5, MINUTE));
    assert.equal(store.getVisibleData(1, 3).length, 2);
    assert.equal(store.getVisibleData(-10, 100).length, 5);
    assert.equal(store.getVisibleData(3, 1).length, 0);
  });
});
