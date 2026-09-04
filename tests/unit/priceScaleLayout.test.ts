import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  MAX_STACKED_SCALES_PER_SIDE,
  assignPriceScaleColumns,
  countColumnsPerSide,
} from '../../src/model/priceScaleLayout';

const main = { id: 'main', isPrimary: true, hidden: false };
const overlay = (id: string, hidden = false) => ({ id, isPrimary: false, hidden });

const sides = (scales: Parameters<typeof assignPriceScaleColumns>[0]) =>
  assignPriceScaleColumns(scales).map(placement => `${placement.id}:${placement.side}${placement.axisIndex}`);

describe('assigning price scales to gutters', () => {
  it('puts the main scale on the right, in the column nearest the plot', () => {
    assert.deepEqual(sides([main]), ['main:right0']);
  });

  it('keeps two overlays on the right rather than splitting for no gain', () => {
    // A lone axis on each side costs the plot both gutters and gains nothing.
    assert.deepEqual(sides([main, overlay('a'), overlay('b')]), [
      'main:right0',
      'a:right1',
      'b:right2',
    ]);
  });

  it('moves the third overlay and beyond to the left gutter', () => {
    assert.deepEqual(sides([main, overlay('a'), overlay('b'), overlay('c'), overlay('d')]), [
      'main:right0',
      'a:right1',
      'b:right2',
      'c:left0',
      'd:left1',
    ]);
  });

  it('splits on the count of visible overlays, not of all of them', () => {
    // Three overlays exist but one is hidden, so the split must not trigger:
    // hiding a scale should not shove a sibling across the chart.
    assert.deepEqual(sides([main, overlay('a'), overlay('b'), overlay('c', true)]), [
      'main:right0',
      'a:right1',
      'b:right2',
      'c:right0',
    ]);
  });

  it('gives a hidden scale no column of its own', () => {
    // The placement exists so callers can index by id, but an invisible axis
    // must not push the plot inward or renumber its visible siblings.
    const placements = assignPriceScaleColumns([main, overlay('hidden', true), overlay('b')]);
    assert.equal(placements[1].axisIndex, 0);
    assert.equal(placements[2].axisIndex, 1);
  });

  it('numbers each gutter independently', () => {
    const placements = assignPriceScaleColumns([
      main,
      overlay('a'),
      overlay('b'),
      overlay('c'),
      overlay('d'),
    ]);
    const left = placements.filter(placement => placement.side === 'left').map(p => p.axisIndex);
    const right = placements.filter(placement => placement.side === 'right').map(p => p.axisIndex);
    assert.deepEqual(left, [0, 1]);
    assert.deepEqual(right, [0, 1, 2]);
  });

  it('handles a chart with no main series', () => {
    // The overlay path must not assume the primary scale exists: a chart can be
    // built from custom series alone.
    assert.deepEqual(sides([overlay('a'), overlay('b')]), ['a:right0', 'b:right1']);
  });

  it('is a pure function of its input', () => {
    const input = [main, overlay('a')];
    const before = JSON.stringify(input);
    assignPriceScaleColumns(input);
    assert.equal(JSON.stringify(input), before);
  });

  it('gives the same answer when called twice', () => {
    // The old version wrote its answer into the scale registry as it went, so
    // calling it twice in one layout pass re-derived and re-wrote the state.
    const input = [main, overlay('a'), overlay('b'), overlay('c')];
    assert.deepEqual(assignPriceScaleColumns(input), assignPriceScaleColumns(input));
  });

  it('splits exactly one past the per-side maximum', () => {
    const atMax = Array.from({ length: MAX_STACKED_SCALES_PER_SIDE }, (_, i) => overlay(`o${i}`));
    assert.ok(assignPriceScaleColumns([main, ...atMax]).every(p => p.side === 'right'));

    const overMax = [...atMax, overlay('one-more')];
    assert.equal(assignPriceScaleColumns([main, ...overMax]).at(-1)?.side, 'left');
  });
});

describe('counting gutter columns', () => {
  it('counts each side separately', () => {
    const placements = assignPriceScaleColumns([main, overlay('a'), overlay('b'), overlay('c')]);
    assert.deepEqual(countColumnsPerSide(placements), { left: 1, right: 3 });
  });

  it('ignores scales the caller reports as hidden', () => {
    const placements = assignPriceScaleColumns([main, overlay('a')]);
    assert.deepEqual(countColumnsPerSide(placements, new Set(['a'])), { left: 0, right: 1 });
  });
});
