import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { DataStore } from '../../src/store/DataStore';
import type { KLineData } from '../../src/types';

const HOUR = 3600000;

const bar = (timestamp: number, close = 1.5): KLineData => ({
  timestamp,
  open: 1,
  high: 2,
  low: 0.5,
  close,
  volume: 1,
});

/** What a full rebuild would have produced, for comparison. */
const rebuiltFrom = (bars: KLineData[]) => {
  const store = new DataStore();
  store.setData(bars.map(item => ({ ...item })));
  return store;
};

const assertMatchesRebuild = (store: DataStore) => {
  const reference = rebuiltFrom(store.getData());
  assert.deepEqual(store.getData(), reference.getData());
  assert.equal(store.getDetectedInterval(), reference.getDetectedInterval());
  assert.equal(store.getRegularInterval(), reference.getRegularInterval());
  store.getData().forEach((item, index) => {
    assert.equal(store.timestampToIndex(item.timestamp), index);
    assert.equal(store.timestampToLogicalIndex(item.timestamp), index);
  });
};

describe('live ticks through addData', () => {
  it('updates the last bar in place without disturbing the time scale', () => {
    const store = new DataStore();
    store.setData([bar(HOUR), bar(2 * HOUR), bar(3 * HOUR)]);

    store.addData(bar(3 * HOUR, 9.75));

    assert.deepEqual(store.getData().map(item => item.timestamp), [HOUR, 2 * HOUR, 3 * HOUR]);
    assert.equal(store.getData()[2].close, 9.75);
    assertMatchesRebuild(store);
  });

  it('updates a bar in the middle in place', () => {
    const store = new DataStore();
    store.setData([bar(HOUR), bar(2 * HOUR), bar(3 * HOUR)]);

    store.addData(bar(2 * HOUR, 4.25));

    assert.equal(store.getData()[1].close, 4.25);
    assertMatchesRebuild(store);
  });

  it('appends a newer bar and extends the time scale by exactly that bar', () => {
    const store = new DataStore();
    store.setData([bar(HOUR), bar(2 * HOUR), bar(3 * HOUR)]);

    store.addData(bar(4 * HOUR));

    assert.deepEqual(
      store.getData().map(item => item.timestamp),
      [HOUR, 2 * HOUR, 3 * HOUR, 4 * HOUR],
    );
    assert.equal(store.timestampToIndex(4 * HOUR), 3);
    assert.equal(store.timestampToLogicalIndex(4 * HOUR), 3);
    assertMatchesRebuild(store);
  });

  it('appends into an empty store', () => {
    const store = new DataStore();
    store.addData(bar(HOUR));

    assert.deepEqual(store.getData().map(item => item.timestamp), [HOUR]);
    assert.equal(store.timestampToIndex(HOUR), 0);
    assertMatchesRebuild(store);
  });

  it('keeps the detected interval right when appends change it', () => {
    // Appending a shorter interval than any seen so far has to move both the
    // median and the shortest, which the incremental path derives from the
    // interval list it maintains rather than re-deriving from the bars.
    const store = new DataStore();
    store.setData([bar(0), bar(4 * HOUR), bar(8 * HOUR), bar(12 * HOUR)]);
    assert.equal(store.getDetectedInterval(), 4 * HOUR);

    store.addData(bar(13 * HOUR));
    store.addData(bar(14 * HOUR));
    store.addData(bar(15 * HOUR));

    assertMatchesRebuild(store);
    assert.equal(store.getRegularInterval(), HOUR);
  });

  it('still sorts and rebuilds for a bar that lands before the last one', () => {
    const store = new DataStore();
    store.setData([bar(HOUR), bar(3 * HOUR)]);

    store.addData(bar(2 * HOUR));

    assert.deepEqual(store.getData().map(item => item.timestamp), [HOUR, 2 * HOUR, 3 * HOUR]);
    assert.equal(store.timestampToIndex(3 * HOUR), 2);
    assertMatchesRebuild(store);
  });

  it('matches a full rebuild after a long run of mixed ticks', () => {
    const incremental = new DataStore();
    const seed = Array.from({ length: 50 }, (_, i) => bar(i * HOUR));
    incremental.setData(seed);

    for (let i = 50; i < 200; i += 1) {
      incremental.addData(bar(i * HOUR));
      // Every appended bar then ticks a few times before the next one opens.
      incremental.addData(bar(i * HOUR, 2 + i));
      incremental.addData(bar(i * HOUR, 3 + i));
    }
    // One late correction, which is the path that still rebuilds.
    incremental.addData(bar(120 * HOUR, 42));

    assert.equal(incremental.getData().length, 200);
    assertMatchesRebuild(incremental);
    assert.equal(incremental.getData()[120].close, 42);
  });

  it('notifies subscribers on every accepted bar', () => {
    const store = new DataStore();
    store.setData([bar(HOUR)]);

    let notifications = 0;
    store.subscribe(() => { notifications += 1; });

    store.addData(bar(HOUR, 2));
    store.addData(bar(2 * HOUR));
    store.addData(bar(1.5 * HOUR));

    assert.equal(notifications, 3);
  });
});
