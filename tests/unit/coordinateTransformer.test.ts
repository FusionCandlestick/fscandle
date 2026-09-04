import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { CoordinateTransformer } from '../../src/engine/CoordinateTransformer';

function makeTransformer(width = 1000, height = 500) {
  const transformer = new CoordinateTransformer();
  transformer.setDimensions(width, height);
  transformer.setRange(100, 200);
  transformer.setBarSpacing(10);
  transformer.setOffset(0);
  return transformer;
}

describe('price <-> y', () => {
  it('round-trips in normal mode', () => {
    const transformer = makeTransformer();
    for (const price of [100, 125, 150, 175, 200]) {
      const y = transformer.priceToY(price);
      assert.ok(
        Math.abs(transformer.yToPrice(y) - price) < 1e-6,
        `price ${price} did not round-trip (y=${y})`,
      );
    }
  });

  it('maps higher prices to smaller y (screen coordinates grow downward)', () => {
    const transformer = makeTransformer();
    assert.ok(transformer.priceToY(200) < transformer.priceToY(100));
  });

  it('round-trips in log mode', () => {
    const transformer = makeTransformer();
    transformer.setPriceScaleMode('log');
    for (const price of [100, 125, 150, 200]) {
      const y = transformer.priceToY(price);
      assert.ok(
        Math.abs(transformer.yToPrice(y) - price) < 1e-4,
        `log price ${price} did not round-trip (y=${y})`,
      );
    }
  });

  it('compresses the high end in log mode relative to normal mode', () => {
    const normal = makeTransformer();
    const log = makeTransformer();
    log.setPriceScaleMode('log');

    // Distance covered by the top half of the range vs the bottom half.
    const normalTop = Math.abs(normal.priceToY(200) - normal.priceToY(150));
    const normalBottom = Math.abs(normal.priceToY(150) - normal.priceToY(100));
    const logTop = Math.abs(log.priceToY(200) - log.priceToY(150));
    const logBottom = Math.abs(log.priceToY(150) - log.priceToY(100));

    assert.ok(Math.abs(normalTop - normalBottom) < 1e-6, 'normal mode should be symmetric');
    assert.ok(logTop < logBottom, 'log mode should compress the high end');
  });

  it('flips the axis when inverted', () => {
    const transformer = makeTransformer();
    const before = transformer.priceToY(200);
    transformer.setInvertScale(true);
    const after = transformer.priceToY(200);
    assert.ok(after > before, 'inverting should move the high price toward the bottom');
    assert.ok(Math.abs(transformer.yToPrice(after) - 200) < 1e-6, 'inverted mode must round-trip');
  });

  it('returns the vertical center for a zero-width range', () => {
    const transformer = new CoordinateTransformer();
    transformer.setDimensions(1000, 500);
    // setRange widens a zero span by an epsilon, so ask for the exact center.
    transformer.setRange(150, 150);
    const y = transformer.priceToY(150);
    assert.ok(Math.abs(y - 250) < 1e-3, `expected mid-height, got ${y}`);
  });
});

describe('index <-> x', () => {
  it('round-trips', () => {
    const transformer = makeTransformer();
    for (const index of [0, 1, 17, 100.5]) {
      const x = transformer.indexToX(index);
      assert.ok(
        Math.abs(transformer.xToIndex(x) - index) < 1e-9,
        `index ${index} did not round-trip (x=${x})`,
      );
    }
  });

  it('advances by exactly one bar spacing per index', () => {
    const transformer = makeTransformer();
    const spacing = transformer.getBarSpacing();
    assert.ok(Math.abs(transformer.indexToX(11) - transformer.indexToX(10) - spacing) < 1e-9);
  });

  it('shifts left as the offset grows', () => {
    const transformer = makeTransformer();
    const before = transformer.indexToX(50);
    transformer.setOffset(10);
    assert.ok(transformer.indexToX(50) < before);
  });

  it('clamps bar spacing into the supported range', () => {
    const transformer = makeTransformer();
    transformer.setBarSpacing(0.001);
    assert.equal(transformer.getBarSpacing(), 1);
    transformer.setBarSpacing(9999);
    assert.equal(transformer.getBarSpacing(), 100);
  });

  it('setOffsetToLatest points at the last bar', () => {
    const transformer = makeTransformer();
    transformer.setOffsetToLatest(250);
    assert.equal(transformer.getOffset(), 249);
  });

  it('ignores setOffsetToLatest for an empty dataset', () => {
    const transformer = makeTransformer();
    transformer.setOffset(7);
    transformer.setOffsetToLatest(0);
    assert.equal(transformer.getOffset(), 7);
  });
});

describe('setRange', () => {
  it('normalizes an inverted min/max', () => {
    const transformer = makeTransformer();
    transformer.setRange(200, 100);
    const range = transformer.getRange();
    assert.ok(range.min < range.max);
  });

  it('falls back to a zero range for non-finite input', () => {
    const transformer = makeTransformer();
    transformer.setRange(Number.NaN, 100);
    assert.deepEqual(transformer.getRange(), { min: 0, max: 0 });
  });
});
