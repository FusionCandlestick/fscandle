import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { MIN_PANE_WEIGHT, PaneManager } from '../../src/engine/PaneManager';

/**
 * Weight ownership in `PaneManager`.
 *
 * `weights()` used to return the internal array, so callers that held onto it
 * were aliasing manager state: their in-place edits worked by accident, and
 * went stale the moment `setWeights` replaced the array. These tests pin the
 * copy-out contract and the resize bounds that replaced that arrangement.
 *
 * Weights are normalized against the pane count, so the manager needs real
 * panes to behave realistically. `Pane` only ever calls `createElement`,
 * `appendChild`, and sets `style`, so a few lines of stub stand in for the DOM
 * this runner does not have — cheaper and more honest than testing the manager
 * in a state it never reaches in the app (zero panes).
 */
const stubElement = (): Record<string, unknown> => {
  const element: Record<string, unknown> = {
    style: {},
    children: [] as unknown[],
    appendChild(child: unknown) {
      (element.children as unknown[]).push(child);
      return child;
    },
    remove() {},
    setAttribute() {},
  };
  return element;
};

if (typeof (globalThis as { document?: unknown }).document === 'undefined') {
  (globalThis as { document?: unknown }).document = { createElement: () => stubElement() };
}

/** A manager holding `count` panes, which is what makes weights meaningful. */
const manager = (count = 2) => {
  const panes = new PaneManager(stubElement() as unknown as HTMLDivElement);
  for (let index = 0; index < count; index += 1) panes.addPane(`pane_${index}`);
  return panes;
};

describe('weights()', () => {
  it('hands out a copy, not the internal array', () => {
    const panes = manager();
    panes.setWeights([0.6, 0.4]);

    const taken = panes.weights();
    taken[0] = 99;

    assert.notEqual(panes.weights()[0], 99, 'mutating the result must not reach the manager');
  });

  it('reflects later changes rather than a snapshot the caller kept', () => {
    const panes = manager();
    panes.setWeights([0.5, 0.5]);
    const stale = panes.weights();

    panes.setWeights([0.8, 0.2]);

    assert.equal(stale[0], 0.5, 'the old copy is unchanged');
    assert.notEqual(panes.weights()[0], stale[0], 'a fresh read sees the new value');
  });
});

describe('setWeights', () => {
  it('normalizes to a total of one', () => {
    const panes = manager();
    panes.setWeights([3, 1]);
    const total = panes.weights().reduce((sum, weight) => sum + weight, 0);
    assert.ok(Math.abs(total - 1) < 1e-9, `expected weights to sum to 1, got ${total}`);
  });

  it('falls back to a full-height default when given nothing', () => {
    const panes = manager(1);
    panes.setWeights([]);
    assert.deepEqual(panes.weights(), [1]);
  });
});

describe('resizePair', () => {
  it('moves weight from one pane to its neighbour', () => {
    const panes = manager();
    panes.setWeights([0.5, 0.5]);

    assert.equal(panes.resizePair(0, 0.1), true);

    const [first, second] = panes.weights();
    assert.ok(Math.abs(first - 0.6) < 1e-9);
    assert.ok(Math.abs(second - 0.4) < 1e-9);
  });

  it('conserves total weight', () => {
    const panes3 = manager(3);
    panes3.setWeights([0.5, 0.3, 0.2]);
    panes3.resizePair(1, 0.05);
    const total = panes3.weights().reduce((sum, weight) => sum + weight, 0);
    assert.ok(Math.abs(total - 1) < 1e-9);
  });

  it('refuses a move that would collapse either pane', () => {
    const panes = manager();
    panes.setWeights([0.5, 0.5]);
    const before = panes.weights();

    assert.equal(panes.resizePair(0, 0.5 - MIN_PANE_WEIGHT), false, 'would empty the second pane');
    assert.equal(panes.resizePair(0, -(0.5 - MIN_PANE_WEIGHT)), false, 'would empty the first pane');
    assert.deepEqual(panes.weights(), before, 'a refused resize changes nothing');
  });

  it('refuses an index with no neighbour', () => {
    const panes = manager();
    panes.setWeights([0.5, 0.5]);
    assert.equal(panes.resizePair(1, 0.1), false, 'last pane has nothing below it');
    assert.equal(panes.resizePair(7, 0.1), false, 'out of range');
    assert.equal(panes.resizePair(-1, 0.1), false, 'negative index');
  });
});
