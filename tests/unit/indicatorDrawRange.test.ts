import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { CoordinateTransformer } from '../../src/engine/CoordinateTransformer';
import { Indicator, type IndicatorTemplate } from '../../src/plugins/Indicator';
import type { KLineData } from '../../src/types';

const BAR_COUNT = 5000;
const WIDTH = 600;
const BAR_SPACING = 10;

const lineTemplate: IndicatorTemplate = {
  name: 'Ramp',
  shortName: 'RAMP',
  calcParams: [],
  figures: [{ key: 'value', type: 'line' }],
  calc: dataList => dataList.map((_, i) => ({ value: i })),
};

const barTemplate: IndicatorTemplate = { ...lineTemplate, figures: [{ key: 'value', type: 'bar' }] };
const circleTemplate: IndicatorTemplate = { ...lineTemplate, figures: [{ key: 'value', type: 'circle' }] };

const dataList: KLineData[] = Array.from({ length: BAR_COUNT }, (_, i) => ({
  timestamp: i * 60000,
  open: 1,
  high: 2,
  low: 0,
  close: 1,
  volume: 1,
}));

/** Counts the drawing calls a figure makes, and nothing else. */
const recordingContext = () => {
  const calls = { point: 0, path: 0 };
  const noop = () => {};
  const ctx = {
    beginPath: () => { calls.path += 1; },
    moveTo: () => { calls.point += 1; },
    lineTo: () => { calls.point += 1; },
    fillRect: () => { calls.point += 1; },
    arc: () => { calls.point += 1; },
    stroke: noop,
    fill: noop,
    lineWidth: 0,
    strokeStyle: '',
    fillStyle: '',
  };
  return { calls, ctx: ctx as unknown as CanvasRenderingContext2D };
};

const viewport = () => {
  const transformer = new CoordinateTransformer();
  transformer.setDimensions(WIDTH, 200);
  transformer.setBarSpacing(BAR_SPACING);
  transformer.setRange(0, BAR_COUNT);
  // Park the viewport in the middle of the dataset.
  transformer.setOffset(2500);
  return transformer;
};

const indicatorFor = (template: IndicatorTemplate) => {
  const indicator = new Indicator('id', template);
  indicator.calc(dataList);
  return indicator;
};

describe('indicator drawing is clipped to the visible range', () => {
  const cases: Array<[string, IndicatorTemplate]> = [
    ['line', lineTemplate],
    ['bar', barTemplate],
    ['circle', circleTemplate],
  ];

  cases.forEach(([label, template]) => {
    it(`draws only the visible bars for a ${label} figure`, () => {
      const { calls, ctx } = recordingContext();
      const transformer = viewport();
      indicatorFor(template).draw({
        ctx,
        transformer,
        bounding: { width: WIDTH, height: 200, left: 0, top: 0 },
        dataList,
        result: indicatorFor(template).result,
      });

      // A viewport of 600px at 10px per bar shows ~60 bars, plus the padding
      // the series renderers use. Anything near BAR_COUNT means the loop is
      // still walking the whole dataset.
      const visibleBars = WIDTH / BAR_SPACING;
      assert.ok(calls.point > 0, 'nothing was drawn');
      assert.ok(
        calls.point <= visibleBars + 12,
        `${label} figure drew ${calls.point} points for ~${visibleBars} visible bars`,
      );
    });
  });

  it('still covers the bars just outside the viewport, so lines enter from the edge', () => {
    const transformer = viewport();
    const drawn: number[] = [];
    const { ctx } = recordingContext();
    const recordingTransformer = Object.create(transformer) as CoordinateTransformer;
    recordingTransformer.indexToX = (index: number) => {
      drawn.push(index);
      return transformer.indexToX(index);
    };

    const indicator = indicatorFor(lineTemplate);
    indicator.draw({
      ctx,
      transformer: recordingTransformer,
      bounding: { width: WIDTH, height: 200, left: 0, top: 0 },
      dataList,
      result: indicator.result,
    });

    const firstVisible = Math.floor(transformer.xToIndex(0));
    const lastVisible = Math.ceil(transformer.xToIndex(WIDTH));
    assert.ok(drawn[0] <= firstVisible, `first drawn index ${drawn[0]} is inside the viewport edge`);
    assert.ok(drawn[drawn.length - 1] >= lastVisible, 'last drawn index stops before the viewport edge');
  });

  it('draws at most the clamped edge bar when the viewport is past the data', () => {
    const { calls, ctx } = recordingContext();
    const transformer = viewport();
    transformer.setOffset(BAR_COUNT * 10);
    const indicator = indicatorFor(lineTemplate);
    indicator.draw({
      ctx,
      transformer,
      bounding: { width: WIDTH, height: 200, left: 0, top: 0 },
      dataList,
      result: indicator.result,
    });
    // `visibleIndexRange` clamps to the data, so this is the same single edge
    // bar every series renderer draws in that position -- not 5000 of them.
    assert.ok(calls.point <= 1, `drew ${calls.point} points past the data`);
  });
});

describe('indicator extent over an index range', () => {
  it('reads only the requested rows', () => {
    const indicator = indicatorFor(lineTemplate);
    assert.deepEqual(indicator.extent(10, 20), { min: 10, max: 20 });
  });

  it('clamps a range that runs past either end', () => {
    const indicator = indicatorFor(lineTemplate);
    assert.deepEqual(indicator.extent(-50, 3), { min: 0, max: 3 });
    assert.deepEqual(indicator.extent(BAR_COUNT - 2, BAR_COUNT + 500), {
      min: BAR_COUNT - 2,
      max: BAR_COUNT - 1,
    });
  });

  it('returns null when the range holds nothing finite', () => {
    const warmingUp = new Indicator('id', {
      ...lineTemplate,
      calc: dataList => dataList.map(() => ({ value: NaN })),
    });
    warmingUp.calc(dataList);
    assert.equal(warmingUp.extent(0, 100), null);

    const indicator = indicatorFor(lineTemplate);
    assert.equal(indicator.extent(BAR_COUNT + 10, BAR_COUNT + 20), null);
  });

  it('ignores keys the template does not draw', () => {
    const withExtras = new Indicator('id', {
      ...lineTemplate,
      calc: dataList => dataList.map((_, i) => ({ value: i, scratch: i * 1000 })),
    });
    withExtras.calc(dataList);
    assert.deepEqual(withExtras.extent(0, 5), { min: 0, max: 5 });
  });
});
