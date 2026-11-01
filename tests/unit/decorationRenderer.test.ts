import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  renderLastPriceLine,
  renderPriceLineLabels,
  renderPriceLines,
  renderSeriesMarkers,
} from '../../src/engine/decorationRenderer';
import type { AxisLabelRenderer } from '../../src/engine/decorationRenderer';
import { DEFAULT_MARKER, DEFAULT_PRICE_LINE } from '../../src/model/seriesDecorations';
import type { PriceLineOptions, SeriesMarker } from '../../src/model/seriesDecorations';
import { MINUTE, makeBars, makeTransformer } from '../support/fixtures';

/**
 * A canvas stub that records what was stroked, filled and labelled, and the
 * colour in force at the time. Enough to assert what a renderer drew.
 */
function spyContext() {
  const strokes: Array<{ strokeStyle: string; dash: number[] }> = [];
  const texts: string[] = [];
  let strokeStyle = '';
  let dash: number[] = [];
  const ctx = {
    save() {},
    restore() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    closePath() {},
    arc() {},
    fill() {},
    fillRect() {},
    stroke() { strokes.push({ strokeStyle, dash: [...dash] }); },
    setLineDash(value: number[]) { dash = value; },
    fillText(text: string) { texts.push(text); },
    set strokeStyle(value: string) { strokeStyle = value; },
    get strokeStyle() { return strokeStyle; },
    fillStyle: '',
    lineWidth: 0,
    font: '',
    textAlign: '',
    textBaseline: '',
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, strokes, texts };
}

const line = (overrides: Partial<PriceLineOptions> = {}): PriceLineOptions => ({
  id: 'l',
  price: 150,
  ...DEFAULT_PRICE_LINE,
  ...overrides,
});

describe('renderPriceLines', () => {
  it('draws one stroke per line, in the line colour and dash style', () => {
    const { ctx, strokes } = spyContext();
    renderPriceLines(ctx, 400, makeTransformer(), [
      line({ id: 'a', color: '#f00', lineStyle: 'dashed' }),
      line({ id: 'b', color: '#0f0', lineStyle: 'dotted', price: 120 }),
    ]);
    assert.deepEqual(strokes, [
      { strokeStyle: '#f00', dash: [6, 4] },
      { strokeStyle: '#0f0', dash: [1, 3] },
    ]);
  });

  it('skips a line whose price cannot be placed', () => {
    const { ctx, strokes } = spyContext();
    renderPriceLines(ctx, 400, makeTransformer(), [line({ price: Number.NaN })]);
    assert.equal(strokes.length, 0);
  });

  it('draws nothing for an empty list', () => {
    const { ctx, strokes } = spyContext();
    renderPriceLines(ctx, 400, makeTransformer(), []);
    assert.equal(strokes.length, 0);
  });
});

describe('renderLastPriceLine', () => {
  it('is green when the last bar closed up and red when it closed down', () => {
    const transformer = makeTransformer();
    const up = spyContext();
    renderLastPriceLine(up.ctx, 400, transformer, [{ timestamp: 0, open: 100, high: 110, low: 99, close: 105, volume: 1 }]);
    assert.equal(up.strokes[0].strokeStyle, '#26a69a');

    const down = spyContext();
    renderLastPriceLine(down.ctx, 400, transformer, [{ timestamp: 0, open: 105, high: 110, low: 99, close: 100, volume: 1 }]);
    assert.equal(down.strokes[0].strokeStyle, '#ef5350');
  });

  it('draws nothing without data', () => {
    const { ctx, strokes } = spyContext();
    renderLastPriceLine(ctx, 400, makeTransformer(), []);
    assert.equal(strokes.length, 0);
  });
});

describe('renderPriceLineLabels', () => {
  const bounds = { width: 60, height: 300, left: 0, top: 0 };

  function recordingAxis() {
    const labels: Array<{ text: string; color?: string }> = [];
    const axis: AxisLabelRenderer = {
      renderLabel: (_ctx, _y, text, _bounding, _side, bgColor) => labels.push({ text, color: bgColor }),
    };
    return { axis, labels };
  }

  it('labels only lines that ask for an axis label, using the title when set', () => {
    const { axis, labels } = recordingAxis();
    renderPriceLineLabels(
      spyContext().ctx, bounds, 'right', makeTransformer(), [
        line({ id: 'titled', title: 'TP', color: '#0f0' }),
        line({ id: 'silent', axisLabelVisible: false }),
        line({ id: 'untitled', price: 180, title: '' }),
      ],
      axis,
      price => `P${price}`,
    );
    assert.deepEqual(labels, [
      { text: 'TP', color: '#0f0' },
      { text: 'P180', color: DEFAULT_PRICE_LINE.color },
    ]);
  });

  it('skips labels that fall outside the axis column', () => {
    const { axis, labels } = recordingAxis();
    renderPriceLineLabels(
      spyContext().ctx, bounds, 'right', makeTransformer({ min: 100, max: 200 }),
      [line({ price: 500, title: 'far above' })],
      axis,
      String,
    );
    assert.equal(labels.length, 0);
  });
});

describe('renderSeriesMarkers', () => {
  const marker = (overrides: Partial<SeriesMarker> = {}): SeriesMarker => ({
    ...DEFAULT_MARKER,
    id: 'm',
    timestamp: 5 * MINUTE,
    color: '#abc',
    text: 'B',
    ...overrides,
  });

  it('draws the marker text for markers on screen', () => {
    const { ctx, texts } = spyContext();
    const data = makeBars(20);
    renderSeriesMarkers(ctx, data, makeTransformer({ min: 90, max: 130, offset: 0 }), [marker()], 'sans-serif');
    assert.deepEqual(texts, ['B']);
  });

  it('draws nothing when there are no markers or no data', () => {
    const { ctx, texts } = spyContext();
    renderSeriesMarkers(ctx, makeBars(5), makeTransformer(), [], 'sans-serif');
    renderSeriesMarkers(ctx, [], makeTransformer(), [marker()], 'sans-serif');
    assert.equal(texts.length, 0);
  });
});
