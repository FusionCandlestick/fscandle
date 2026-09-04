import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { DataStore } from '../../src/store/DataStore';
import type { KLineData } from '../../src/types';

const bar = (timestamp: number): KLineData => ({
  timestamp,
  open: 1,
  high: 2,
  low: 0.5,
  close: 1.5,
  volume: 1,
});

describe('data ordering on setData', () => {
  it('keeps chronological input as it is', () => {
    const store = new DataStore();
    store.setData([bar(1), bar(2), bar(3)]);
    assert.deepEqual(store.getData().map(b => b.timestamp), [1, 2, 3]);
  });

  it('sorts input that arrives out of order', () => {
    const store = new DataStore();
    store.setData([bar(3), bar(1), bar(2)]);
    assert.deepEqual(store.getData().map(b => b.timestamp), [1, 2, 3]);
  });

  it('accepts duplicate timestamps without reordering around them', () => {
    // Equal timestamps are not "out of order", so the fast path must accept
    // them -- a feed that repeats a bar should not trigger a full sort.
    const store = new DataStore();
    store.setData([bar(1), bar(1), bar(2)]);
    assert.deepEqual(store.getData().map(b => b.timestamp), [1, 1, 2]);
  });

  it('does not alias the callers array', () => {
    const store = new DataStore();
    const input = [bar(1), bar(2)];
    store.setData(input);
    input.push(bar(3));
    assert.equal(store.getData().length, 2);
  });

  it('handles empty input', () => {
    const store = new DataStore();
    store.setData([]);
    assert.deepEqual(store.getData(), []);
  });
});
