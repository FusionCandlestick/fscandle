import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { indicatorPaneRange } from '../../src/model/indicatorRange';

const FALLBACK = { min: 0, max: 100 };

describe('indicatorPaneRange', () => {
  it('spans every finite extent', () => {
    assert.deepEqual(
      indicatorPaneRange([{ min: 10, max: 20 }, { min: -5, max: 12 }], FALLBACK),
      { min: -5, max: 20 },
    );
  });

  it('ignores indicators with no extent on screen', () => {
    assert.deepEqual(indicatorPaneRange([null, { min: 3, max: 4 }, undefined], FALLBACK), { min: 3, max: 4 });
  });

  it('uses the fallback when nothing is on screen', () => {
    assert.deepEqual(indicatorPaneRange([], { min: -1, max: 1 }), { min: -1, max: 1 });
    assert.deepEqual(indicatorPaneRange([null], { min: -1, max: 1 }), { min: -1, max: 1 });
  });

  it('returns a copy of the fallback, not the object itself', () => {
    const fallback = { min: 0, max: 1 };
    const range = indicatorPaneRange([], fallback);
    assert.notEqual(range, fallback);
  });
});
