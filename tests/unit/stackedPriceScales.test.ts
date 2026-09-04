import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { StackedPriceScales } from '../../src/engine/StackedPriceScales';
import type { BaseSeries } from '../../src/engine/BaseSeries';
import type { KLineData } from '../../src/types';

/**
 * The stacked price scales, as one registry of one entity type.
 *
 * Each scale used to be spread across five maps on the chart keyed by the same
 * pane id — series, data, axis placement, viewport, last transformer — so
 * adding one meant writing to five places and removing one meant deleting from
 * five. The registry replaced that, but nothing tested it: the chart needs a
 * DOM to construct, so no unit test reaches this code, and the e2e suite only
 * covers it indirectly through gestures.
 *
 * These tests pin the lifecycle guarantee the registry exists to provide —
 * that a scale is created and destroyed whole — plus the axis-column count and
 * the transformer reset that a layout pass depends on.
 */

const SERIES = {} as BaseSeries;
const DATA: KLineData[] = [];

function scales(): StackedPriceScales {
  return new StackedPriceScales();
}

function addScale(registry: StackedPriceScales, id: string, side: 'left' | 'right' = 'right', axisIndex = 0) {
  return registry.add({ id, series: SERIES, data: DATA, side, axisIndex });
}

describe('a new registry', () => {
  it('holds nothing and reports no scale for an unknown id', () => {
    const registry = scales();
    assert.equal(registry.size, 0);
    assert.equal(registry.has('rsi'), false);
    assert.equal(registry.get('rsi'), null);
  });
});

describe('adding a scale', () => {
  it('creates it whole, with its own viewport and no transformer yet', () => {
    const registry = scales();
    const scale = addScale(registry, 'rsi', 'left', 2);

    assert.equal(registry.size, 1);
    assert.equal(registry.has('rsi'), true);
    assert.equal(registry.get('rsi'), scale);
    assert.equal(scale.side, 'left');
    assert.equal(scale.axisIndex, 2);
    // The viewport is the same model type the main pane uses, which is what
    // lets callers read any pane's scale through one lookup.
    assert.equal(scale.viewport.scale, 1);
    assert.equal(scale.viewport.offset, 0);
    assert.equal(scale.transformer, null);
  });

  it('gives each scale an independent viewport', () => {
    const registry = scales();
    const rsi = addScale(registry, 'rsi');
    const macd = addScale(registry, 'macd');

    rsi.viewport.offset = 40;

    assert.equal(macd.viewport.offset, 0, 'panning one indicator must not move another');
  });

  it('replaces a scale registered under an id already in use', () => {
    const registry = scales();
    const first = addScale(registry, 'rsi');
    const second = addScale(registry, 'rsi');

    assert.equal(registry.size, 1);
    assert.notEqual(registry.get('rsi'), first);
    assert.equal(registry.get('rsi'), second);
  });
});

describe('removing a scale', () => {
  it('destroys it whole and reports whether anything was there', () => {
    const registry = scales();
    addScale(registry, 'rsi');

    assert.equal(registry.remove('rsi'), true);
    assert.equal(registry.size, 0);
    assert.equal(registry.get('rsi'), null);
    // The old five-map arrangement could leave one map populated; a single
    // delete cannot.
    assert.equal(registry.remove('rsi'), false, 'removing twice is not an error');
  });

  it('leaves its siblings alone', () => {
    const registry = scales();
    addScale(registry, 'rsi');
    addScale(registry, 'macd');

    registry.remove('rsi');

    assert.deepEqual(registry.all().map(scale => scale.id), ['macd']);
  });
});

describe('axis columns', () => {
  it('counts the scales on each side, which decides the next column', () => {
    const registry = scales();
    addScale(registry, 'rsi', 'right');
    addScale(registry, 'macd', 'right');
    addScale(registry, 'volume', 'left');

    assert.equal(registry.countOnSide('right'), 2);
    assert.equal(registry.countOnSide('left'), 1);
  });

  it('drops to zero on a side once its scales are gone', () => {
    const registry = scales();
    addScale(registry, 'rsi', 'left');
    registry.remove('rsi');

    assert.equal(registry.countOnSide('left'), 0);
  });
});

describe('transformers', () => {
  it('are cleared for every scale before a fresh layout pass', () => {
    const registry = scales();
    const rsi = addScale(registry, 'rsi');
    const macd = addScale(registry, 'macd');
    // Stand-ins: the registry stores transformers, the chart builds them.
    rsi.transformer = {} as never;
    macd.transformer = {} as never;

    registry.clearTransformers();

    assert.equal(rsi.transformer, null);
    assert.equal(macd.transformer, null);
  });

  it('survive being cleared when there is nothing to clear', () => {
    const registry = scales();
    registry.clearTransformers();
    assert.equal(registry.size, 0);
  });
});

describe('iteration', () => {
  it('visits every scale', () => {
    const registry = scales();
    addScale(registry, 'rsi');
    addScale(registry, 'macd');

    const seen: string[] = [];
    registry.forEach(scale => seen.push(scale.id));

    assert.deepEqual(seen.sort(), ['macd', 'rsi']);
  });
});
