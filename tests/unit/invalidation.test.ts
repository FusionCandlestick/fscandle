import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { InvalidationState } from '../../src/model/invalidation';

const NONE = 0;
const CURSOR = 1;
const LIGHT = 3;
const FULL = 4;

describe('raising invalidation levels', () => {
  it('starts at whatever the chart asks for, so the first frame is complete', () => {
    assert.equal(new InvalidationState(NONE, FULL).levelFor('main'), FULL);
  });

  it('raises but never lowers', () => {
    const state = new InvalidationState(NONE);
    state.raise(FULL);
    state.raise(CURSOR);
    assert.equal(state.levelFor('main'), FULL);
  });

  it('applies an unscoped request to every pane', () => {
    const state = new InvalidationState(NONE);
    state.raise(LIGHT);
    assert.equal(state.levelFor('main'), LIGHT);
    assert.equal(state.levelFor('rsi'), LIGHT);
  });

  it('keeps a pane-scoped request off the other panes', () => {
    // The point of the whole thing: adding an indicator to the RSI pane must
    // not repaint the price pane and its stacked scales.
    const state = new InvalidationState(NONE);
    state.raise(FULL, 'rsi');
    assert.equal(state.levelFor('rsi'), FULL);
    assert.equal(state.levelFor('main'), NONE);
  });

  it('never lets a pane fall below the chart-wide floor', () => {
    const state = new InvalidationState(NONE);
    state.raise(LIGHT);
    state.raise(CURSOR, 'rsi');
    assert.equal(state.levelFor('rsi'), LIGHT);
  });

  it('reports the highest pending level for the shared chrome', () => {
    const state = new InvalidationState(NONE);
    state.raise(CURSOR);
    state.raise(FULL, 'rsi');
    assert.equal(state.maxLevel(), FULL);
  });
});

describe('clearing after a frame', () => {
  it('drops both the global and the per-pane levels', () => {
    const state = new InvalidationState(NONE, FULL);
    state.raise(FULL, 'rsi');
    state.clear();
    assert.equal(state.isDirty(), false);
    assert.equal(state.levelFor('rsi'), NONE);
    assert.equal(state.levelFor('main'), NONE);
  });

  it('forgets a pane that no longer exists', () => {
    // Otherwise a level outlives its pane and is handed to whatever reuses the id.
    const state = new InvalidationState(NONE);
    state.raise(FULL, 'rsi');
    state.forgetPane('rsi');
    assert.equal(state.levelFor('rsi'), NONE);
    assert.equal(state.maxLevel(), NONE);
  });
});
