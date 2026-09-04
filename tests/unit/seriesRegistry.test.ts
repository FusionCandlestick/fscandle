import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { SeriesRegistry } from '../../src/engine/SeriesRegistry';
import { CustomSeries } from '../../src/engine/CustomSeries';
import { StepLineSeries } from '../../src/engine/StepLineSeries';
import { CoordinateTransformer } from '../../src/engine/CoordinateTransformer';
import type { KLineData } from '../../src/types';

function makeTransformer() {
  const transformer = new CoordinateTransformer();
  transformer.setDimensions(1000, 500);
  transformer.setRange(90, 210);
  transformer.setBarSpacing(10);
  transformer.setOffset(0);
  return transformer;
}

function bars(closes: number[]): KLineData[] {
  return closes.map((close, i) => ({
    timestamp: i * 60_000,
    open: close,
    high: close + 5,
    low: close - 5,
    close,
    volume: 1,
  }));
}

describe('built-in registrations', () => {
  it('registers every documented built-in type', () => {
    for (const type of ['candle', 'bar', 'area', 'line', 'step', 'baseline', 'hollow', 'ha']) {
      assert.equal(SeriesRegistry.has(type), true, `missing built-in "${type}"`);
    }
  });

  it('creates a step series for the "step" type', () => {
    assert.ok(SeriesRegistry.createSeries('step', {}) instanceof StepLineSeries);
  });

  it('throws for an unknown type', () => {
    assert.throws(() => SeriesRegistry.createSeries('does-not-exist', {}), /Unknown series type/);
  });
});

describe('defineSeries', () => {
  it('registers a custom type usable through createSeries', () => {
    SeriesRegistry.defineSeries<{ color: string; multiplier: number }>({
      type: 'test-renko',
      defaultOptions: { color: '#fff', multiplier: 2 },
      renderer: () => {},
    });

    assert.equal(SeriesRegistry.has('test-renko'), true);
    const series = SeriesRegistry.createSeries('test-renko', {});
    assert.ok(series instanceof CustomSeries);
    assert.deepEqual(series.getOptions(), { color: '#fff', multiplier: 2 });

    SeriesRegistry.unregister('test-renko');
    assert.equal(SeriesRegistry.has('test-renko'), false);
  });

  it('merges instance options over the defaults', () => {
    SeriesRegistry.defineSeries<{ color: string; multiplier: number }>({
      type: 'test-merge',
      defaultOptions: { color: '#fff', multiplier: 2 },
      renderer: () => {},
    });

    const series = SeriesRegistry.createSeries('test-merge', { multiplier: 9 });
    assert.deepEqual(series.getOptions(), { color: '#fff', multiplier: 9 });
    SeriesRegistry.unregister('test-merge');
  });

  it('rejects a definition with no type', () => {
    assert.throws(
      () =>
        SeriesRegistry.defineSeries({
          type: '',
          defaultOptions: {},
          renderer: () => {},
        }),
      /non-empty "type"/,
    );
  });
});

describe('CustomSeries', () => {
  it('uses priceValues for autoscale when supplied', () => {
    const series = new CustomSeries<{ pad: number }>({
      type: 'test-autoscale',
      defaultOptions: { pad: 10 },
      renderer: () => {},
      priceValues: (bar, options) => [bar.close - options.pad, bar.close + options.pad],
    });
    series.setData(bars([100, 110, 120]));

    assert.deepEqual(series.autoscale(), { min: 90, max: 130 });
  });

  it('falls back to high/low without priceValues', () => {
    const series = new CustomSeries({
      type: 'test-default-autoscale',
      defaultOptions: {},
      renderer: () => {},
    });
    series.setData(bars([100, 110, 120]));
    assert.deepEqual(series.autoscale(), { min: 95, max: 125 });
  });

  it('returns null autoscale for empty data', () => {
    const series = new CustomSeries({
      type: 'test-empty',
      defaultOptions: {},
      renderer: () => {},
    });
    assert.equal(series.autoscale(), null);
  });

  it('honours a custom snap function', () => {
    const series = new CustomSeries({
      type: 'test-snap',
      defaultOptions: {},
      renderer: () => {},
      // Always snap to the first bar, so the override is unambiguous.
      snap: data => data[0] ?? null,
    });
    series.setData(bars([100, 110, 120]));
    assert.equal(series.getSnapData(2)?.close, 100);
  });

  it('exposes the definition type', () => {
    const series = new CustomSeries({
      type: 'test-type',
      defaultOptions: {},
      renderer: () => {},
    });
    assert.equal(series.type, 'test-type');
  });
});

describe('StepLineSeries.buildStepPath', () => {
  const transformer = makeTransformer();

  it('returns nothing for empty data', () => {
    const series = new StepLineSeries();
    assert.deepEqual(series.buildStepPath(transformer), []);
  });

  it('holds the previous value until the next bar in "after" mode', () => {
    const series = new StepLineSeries({ stepPosition: 'after' });
    series.setData(bars([100, 200]));
    const path = series.buildStepPath(transformer);

    const y100 = transformer.priceToY(100);
    const y200 = transformer.priceToY(200);
    const x0 = transformer.indexToX(0);
    const x1 = transformer.indexToX(1);

    assert.deepEqual(path, [
      { x: x0, y: y100 },
      { x: x1, y: y100 },
      { x: x1, y: y200 },
    ]);
  });

  it('rises at the previous bar in "before" mode', () => {
    const series = new StepLineSeries({ stepPosition: 'before' });
    series.setData(bars([100, 200]));
    const path = series.buildStepPath(transformer);

    const y100 = transformer.priceToY(100);
    const y200 = transformer.priceToY(200);
    const x0 = transformer.indexToX(0);
    const x1 = transformer.indexToX(1);

    assert.deepEqual(path, [
      { x: x0, y: y100 },
      { x: x0, y: y200 },
      { x: x1, y: y200 },
    ]);
  });

  it('splits the gap in "middle" mode', () => {
    const series = new StepLineSeries({ stepPosition: 'middle' });
    series.setData(bars([100, 200]));
    const path = series.buildStepPath(transformer);

    const x0 = transformer.indexToX(0);
    const x1 = transformer.indexToX(1);
    const midX = (x0 + x1) / 2;

    assert.equal(path.length, 4);
    assert.equal(path[1].x, midX);
    assert.equal(path[2].x, midX);
    assert.equal(path[3].x, x1);
  });

  it('autoscales on closes only, not highs and lows', () => {
    const series = new StepLineSeries();
    series.setData(bars([100, 110, 120]));
    assert.deepEqual(series.autoscale(), { min: 100, max: 120 });
  });
});
