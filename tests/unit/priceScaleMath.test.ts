import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  MAX_BAR_SPACING,
  clampBarSpacing,
  clampPriceScaleState,
  getMinimumBarSpacing,
  getPaddedPriceRange,
  getViewportPriceBounds,
  getYOffsetForViewportCenter,
} from '../../src/model/priceScaleMath';

describe('getPaddedPriceRange', () => {
  it('pads a normal range by 5% on each side', () => {
    const { min, max } = getPaddedPriceRange(100, 200);
    assert.equal(min, 95);
    assert.equal(max, 205);
  });

  it('still produces a non-zero span for a flat series', () => {
    const { min, max } = getPaddedPriceRange(50, 50);
    assert.ok(max > min, 'a flat series must still get a drawable range');
  });

  it('handles a range spanning zero', () => {
    const { min, max } = getPaddedPriceRange(-10, 10);
    assert.equal(min, -11);
    assert.equal(max, 11);
  });
});

describe('getViewportPriceBounds', () => {
  it('centers on the base range at scale 1, including the 5% padding bands', () => {
    const bounds = getViewportPriceBounds(100, 200, 500, 1, 0);
    // The base range occupies the middle 90% of the pane.
    assert.ok(Math.abs(bounds.center - 150) < 1e-6, `center ${bounds.center}`);
    assert.ok(Math.abs(bounds.range - 100 / 0.9) < 1e-6, `range ${bounds.range}`);
    assert.ok(Math.abs(bounds.min - (150 - 50 / 0.9)) < 1e-6, `min ${bounds.min}`);
    assert.ok(Math.abs(bounds.max - (150 + 50 / 0.9)) < 1e-6, `max ${bounds.max}`);
  });

  it('narrows the visible range as scale increases', () => {
    const wide = getViewportPriceBounds(100, 200, 500, 1, 0);
    const zoomed = getViewportPriceBounds(100, 200, 500, 2, 0);
    assert.ok(zoomed.range < wide.range);
    // Zooming about the center leaves the center where it was.
    assert.ok(Math.abs(zoomed.center - wide.center) < 1e-6);
  });

  it('shifts the center when offset is applied', () => {
    const centered = getViewportPriceBounds(100, 200, 500, 1, 0);
    const shifted = getViewportPriceBounds(100, 200, 500, 1, 50);
    // A positive offset pushes content down the screen, so the viewport ends
    // up looking at higher prices.
    assert.ok(shifted.center > centered.center, 'a positive offset should reveal higher prices');
    assert.ok(Math.abs(shifted.range - centered.range) < 1e-6, 'panning must not rescale');
  });

  it('does not divide by zero on a degenerate height or scale', () => {
    assert.ok(Number.isFinite(getViewportPriceBounds(100, 200, 0, 1, 0).range));
    assert.ok(Number.isFinite(getViewportPriceBounds(100, 200, 500, 0, 0).range));
    assert.ok(Number.isFinite(getViewportPriceBounds(100, 100, 500, 1, 0).range));
  });
});

describe('getYOffsetForViewportCenter', () => {
  it('inverts getViewportPriceBounds', () => {
    const height = 500;
    for (const scale of [0.5, 1, 2.5]) {
      for (const targetCenter of [120, 150, 190]) {
        const offset = getYOffsetForViewportCenter(100, 200, height, scale, targetCenter);
        const bounds = getViewportPriceBounds(100, 200, height, scale, offset);
        assert.ok(
          Math.abs(bounds.center - targetCenter) < 1e-6,
          `scale=${scale} target=${targetCenter} got=${bounds.center}`,
        );
      }
    }
  });

  it('returns zero offset when the target is already the base center', () => {
    assert.ok(Math.abs(getYOffsetForViewportCenter(100, 200, 500, 1, 150)) < 1e-9);
  });
});

describe('clampPriceScaleState', () => {
  const constraints = { hardMin: 0, hardMax: 1000, maxVisibleRange: 500 };

  it('reports no change when the state is already legal', () => {
    const state = { yScale: 1, yOffset: 0 };
    const changed = clampPriceScaleState(400, 600, 500, constraints, state);
    assert.equal(changed, false);
    assert.equal(state.yScale, 1);
  });

  it('raises the scale when the view would exceed maxVisibleRange', () => {
    // At scale 0.01 the viewport would span far more than 500.
    const state = { yScale: 0.01, yOffset: 0 };
    clampPriceScaleState(400, 600, 500, constraints, state);
    const bounds = getViewportPriceBounds(400, 600, 500, state.yScale, state.yOffset);
    assert.ok(
      bounds.range <= constraints.maxVisibleRange + 1e-6,
      `range ${bounds.range} should be capped at ${constraints.maxVisibleRange}`,
    );
  });

  it('pulls the viewport back inside the hard price band', () => {
    // A large offset would push the view far below hardMin.
    const state = { yScale: 1, yOffset: 5000 };
    const changed = clampPriceScaleState(400, 600, 500, constraints, state);
    assert.equal(changed, true);

    const bounds = getViewportPriceBounds(400, 600, 500, state.yScale, state.yOffset);
    assert.ok(bounds.min >= constraints.hardMin - 1e-6, `min ${bounds.min} below hardMin`);
    assert.ok(bounds.max <= constraints.hardMax + 1e-6, `max ${bounds.max} above hardMax`);
  });

  it('centers on the band when the viewport is wider than the band itself', () => {
    const narrowBand = { hardMin: 100, hardMax: 120, maxVisibleRange: 10_000 };
    const state = { yScale: 0.05, yOffset: 400 };
    clampPriceScaleState(0, 1000, 500, narrowBand, state);

    const bounds = getViewportPriceBounds(0, 1000, 500, state.yScale, state.yOffset);
    assert.ok(Math.abs(bounds.center - 110) < 1e-6, `expected band center, got ${bounds.center}`);
  });

  it('is idempotent — clamping an already-clamped state changes nothing', () => {
    const state = { yScale: 0.001, yOffset: 9999 };
    clampPriceScaleState(400, 600, 500, constraints, state);
    const first = { ...state };
    const changedAgain = clampPriceScaleState(400, 600, 500, constraints, state);
    assert.equal(changedAgain, false);
    assert.deepEqual(state, first);
  });
});

describe('bar spacing', () => {
  it('never goes below 3px', () => {
    assert.equal(getMinimumBarSpacing(0, 800), 3);
    assert.equal(getMinimumBarSpacing(10, 0), 3);
    assert.equal(getMinimumBarSpacing(1_000_000, 800), 3);
  });

  it('keeps the dataset from shrinking past 60% of the chart width', () => {
    // 100 bars in 1000px: 60% of 1000 / 100 = 6px.
    assert.equal(getMinimumBarSpacing(100, 1000), 6);
  });

  it('clamps into the legal zoom range', () => {
    assert.equal(clampBarSpacing(1, 100, 1000), 6);
    assert.equal(clampBarSpacing(500, 100, 1000), MAX_BAR_SPACING);
    assert.equal(clampBarSpacing(20, 100, 1000), 20);
  });
});
