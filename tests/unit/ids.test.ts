import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createId } from '../../src/model/ids';

describe('createId', () => {
  it('keeps the prefix', () => {
    assert.match(createId('overlay'), /^overlay_[0-9a-z]+_[0-9a-z]{8}$/);
  });

  it('never repeats within one millisecond', () => {
    const realNow = Date.now;
    Date.now = () => 1_700_000_000_000; // every call lands in the same millisecond
    try {
      const ids = Array.from({ length: 5000 }, () => createId('overlay'));
      assert.equal(new Set(ids).size, ids.length);
    } finally {
      Date.now = realNow;
    }
  });

  it('works without crypto.randomUUID, as in an insecure context', () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
    Object.defineProperty(globalThis, 'crypto', { value: {}, configurable: true });
    try {
      const ids = Array.from({ length: 100 }, () => createId('layer'));
      assert.equal(new Set(ids).size, ids.length);
      assert.match(ids[0], /^layer_[0-9a-z]+_[0-9a-z]{8}$/);
    } finally {
      if (descriptor) Object.defineProperty(globalThis, 'crypto', descriptor);
    }
  });
});
