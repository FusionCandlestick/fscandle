import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { CoordinateTransformer } from '../../src/engine/CoordinateTransformer';
import { PriceScaleModel } from '../../src/model/PriceScaleModel';

/**
 * Transformers read chart-wide display settings instead of being told about them.
 *
 * Mode and inversion apply to every price scale at once, so the chart used to
 * push them into each transformer after every change. That left two failure
 * modes these tests close: a transformer created *between* a change and the
 * next push was born stale, and a newly added stacked scale silently rendered
 * in a different mode from its neighbours.
 */

describe('an unattached transformer', () => {
  it('keeps its own settings, so standalone use still works', () => {
    const transformer = new CoordinateTransformer();
    assert.equal(transformer.getPriceScaleMode(), 'normal');
    transformer.setPriceScaleMode('log');
    assert.equal(transformer.getPriceScaleMode(), 'log');
    transformer.setInvertScale(true);
    assert.equal(transformer.getInvertScale(), true);
  });

  it('does not share settings with another unattached transformer', () => {
    const first = new CoordinateTransformer();
    const second = new CoordinateTransformer();
    first.setPriceScaleMode('log');
    assert.equal(second.getPriceScaleMode(), 'normal');
  });
});

describe('attached transformers', () => {
  it('see a change made through the model', () => {
    const scale = new PriceScaleModel();
    const transformer = new CoordinateTransformer();
    transformer.attachPriceScale(scale);

    scale.mode = 'log';
    assert.equal(transformer.getPriceScaleMode(), 'log');

    scale.inverted = true;
    assert.equal(transformer.getInvertScale(), true);
  });

  it('see a change made through any one of them', () => {
    const scale = new PriceScaleModel();
    const main = new CoordinateTransformer();
    const stacked = new CoordinateTransformer();
    main.attachPriceScale(scale);
    stacked.attachPriceScale(scale);

    main.setPriceScaleMode('log');

    assert.equal(stacked.getPriceScaleMode(), 'log');
    assert.equal(scale.mode, 'log');
  });

  it('are not born stale when created after a change', () => {
    const scale = new PriceScaleModel();
    scale.mode = 'log';
    scale.inverted = true;

    // A stacked scale added later attaches the same model and is correct
    // immediately — the case the old push-after-change arrangement missed.
    const late = new CoordinateTransformer();
    late.attachPriceScale(scale);

    assert.equal(late.getPriceScaleMode(), 'log');
    assert.equal(late.getInvertScale(), true);
  });

  it('keep their own vertical viewport, which is per-scale', () => {
    const scale = new PriceScaleModel();
    const main = new CoordinateTransformer();
    const stacked = new CoordinateTransformer();
    main.attachPriceScale(scale);
    stacked.attachPriceScale(scale);

    main.setDimensions(800, 400);
    stacked.setDimensions(800, 400);
    main.setRange(100, 200);
    stacked.setRange(100, 200);
    main.setYScale(2);
    stacked.setYScale(1);

    // Sharing display settings must not have merged the zoom: a stacked scale
    // zooms independently of the main one. The probe price is off-centre on
    // purpose — the midpoint of the range is a fixed point of vertical zoom, so
    // it would compare equal at any scale.
    assert.notEqual(main.priceToY(190), stacked.priceToY(190));
  });
});

describe('log mode reaches the coordinate math', () => {
  it('changes price-to-pixel mapping when set through the model', () => {
    const scale = new PriceScaleModel();
    const transformer = new CoordinateTransformer();
    transformer.attachPriceScale(scale);
    transformer.setDimensions(800, 400);
    transformer.setRange(100, 1000);

    const linear = transformer.priceToY(316.23);
    scale.mode = 'log';
    const logarithmic = transformer.priceToY(316.23);

    // 316.23 is the geometric midpoint of 100..1000, so log mode places it near
    // the vertical centre while linear mode places it well below.
    assert.notEqual(linear, logarithmic);
    assert.ok(Math.abs(logarithmic - 200) < Math.abs(linear - 200));
  });

  it('flips the axis when inversion is set through the model', () => {
    const scale = new PriceScaleModel();
    const transformer = new CoordinateTransformer();
    transformer.attachPriceScale(scale);
    transformer.setDimensions(800, 400);
    transformer.setRange(100, 200);

    const upright = transformer.priceToY(190);
    scale.inverted = true;
    const flipped = transformer.priceToY(190);

    assert.ok(upright < 200, 'a high price sits near the top when upright');
    assert.ok(flipped > 200, 'and near the bottom when inverted');
  });
});
