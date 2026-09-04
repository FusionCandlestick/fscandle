import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  MAX_PRICE_SCALE,
  MIN_PRICE_SCALE,
  PriceScaleModel,
} from '../../src/model/PriceScaleModel';

describe('PriceScaleModel defaults', () => {
  it('starts linear, upright, and unzoomed', () => {
    const scale = new PriceScaleModel();
    assert.equal(scale.mode, 'normal');
    assert.equal(scale.inverted, false);
    assert.equal(scale.scale, 1);
    assert.equal(scale.offset, 0);
  });
});

describe('scale bounds', () => {
  it('clamps to the usable zoom range', () => {
    const scale = new PriceScaleModel();
    scale.scale = 1000;
    assert.equal(scale.scale, MAX_PRICE_SCALE);
    scale.scale = 0;
    assert.equal(scale.scale, MIN_PRICE_SCALE);
    scale.scale = -5;
    assert.equal(scale.scale, MIN_PRICE_SCALE);
  });

  it('accepts values inside the range unchanged', () => {
    const scale = new PriceScaleModel();
    scale.scale = 2.5;
    assert.equal(scale.scale, 2.5);
  });

  it('falls back to the identity scale rather than propagating NaN', () => {
    const scale = new PriceScaleModel();
    scale.scale = 3;
    scale.scale = Number.NaN;
    assert.equal(scale.scale, 1);
    scale.scale = Number.POSITIVE_INFINITY;
    assert.equal(scale.scale, 1);
  });

  it('ignores a non-finite offset', () => {
    const scale = new PriceScaleModel();
    scale.offset = 42;
    scale.offset = Number.NaN;
    assert.equal(scale.offset, 0);
  });

  it('leaves the offset unbounded, since the pane clamp lives in the chart', () => {
    const scale = new PriceScaleModel();
    scale.offset = -100_000;
    assert.equal(scale.offset, -100_000);
  });
});

describe('zoomBy', () => {
  it('multiplies the current scale', () => {
    const scale = new PriceScaleModel();
    scale.zoomBy(2);
    assert.equal(scale.scale, 2);
    scale.zoomBy(0.5);
    assert.equal(scale.scale, 1);
  });

  it('reports whether the zoom actually moved', () => {
    const scale = new PriceScaleModel();
    assert.equal(scale.zoomBy(1.05), true);

    scale.scale = MAX_PRICE_SCALE;
    assert.equal(scale.zoomBy(1.05), false, 'pinned at the upper bound');
    assert.equal(scale.scale, MAX_PRICE_SCALE);

    scale.scale = MIN_PRICE_SCALE;
    assert.equal(scale.zoomBy(0.95), false, 'pinned at the lower bound');
    assert.equal(scale.scale, MIN_PRICE_SCALE);
  });

  it('still reports movement when a zoom lands exactly on a bound', () => {
    const scale = new PriceScaleModel();
    scale.scale = MAX_PRICE_SCALE / 2;
    assert.equal(scale.zoomBy(4), true);
    assert.equal(scale.scale, MAX_PRICE_SCALE);
  });
});

describe('viewport', () => {
  it('round-trips through the persisted shape', () => {
    const scale = new PriceScaleModel();
    scale.setViewport({ yScale: 2, yOffset: -30 });
    assert.deepEqual(scale.viewport, { yScale: 2, yOffset: -30 });
  });

  it('applies partial payloads, so a sync may carry either field', () => {
    const scale = new PriceScaleModel();
    scale.setViewport({ yScale: 3, yOffset: 10 });
    scale.setViewport({ yOffset: 25 });
    assert.deepEqual(scale.viewport, { yScale: 3, yOffset: 25 });
  });

  it('clamps an out-of-range viewport on the way in', () => {
    const scale = new PriceScaleModel();
    scale.setViewport({ yScale: 999 });
    assert.equal(scale.scale, MAX_PRICE_SCALE);
  });

  it('reports whether applying a viewport changed anything', () => {
    const scale = new PriceScaleModel();
    assert.equal(scale.setViewport({ yScale: 2 }), true);
    assert.equal(scale.setViewport({ yScale: 2 }), false);
    assert.equal(scale.setViewport({}), false);
  });

  it('resets the viewport without disturbing mode or inversion', () => {
    const scale = new PriceScaleModel();
    scale.mode = 'log';
    scale.inverted = true;
    scale.setViewport({ yScale: 4, yOffset: 60 });

    scale.resetViewport();

    assert.deepEqual(scale.viewport, { yScale: 1, yOffset: 0 });
    assert.equal(scale.mode, 'log');
    assert.equal(scale.inverted, true);
  });
});
