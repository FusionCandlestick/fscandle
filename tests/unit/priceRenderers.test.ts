import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { BaseSeries } from '../../src/engine/BaseSeries';
import type { CoordinateTransformer } from '../../src/engine/CoordinateTransformer';
import type { AxisLabelRenderer } from '../../src/engine/decorationRenderer';
import { renderSeriesValueTags, renderValueTag } from '../../src/renderer/axisTags';
import { strokeCrosshairSegment } from '../../src/renderer/crosshairLines';
import { renderMainPaneCrosshair } from '../../src/renderer/mainPaneCrosshair';
import type { MainPaneCrosshairInput } from '../../src/renderer/mainPaneCrosshair';
import { renderSeriesBeacons } from '../../src/renderer/seriesBeacons';
import { renderSessionSeparators } from '../../src/renderer/sessionSeparators';
import type { KLineData } from '../../src/types';
import { makeBars, makeTransformer, MINUTE } from '../support/fixtures';

/** One recorded canvas call, with the state that was in force when it ran. */
interface Recorded {
  name: string;
  args: unknown[];
  strokeStyle: unknown;
  fillStyle: unknown;
  dash: number[];
}

interface RecordingCanvas {
  ctx: CanvasRenderingContext2D;
  calls: Recorded[];
  /** The calls that draw something, in order. */
  drawn(): Recorded[];
}

/**
 * A canvas stub that records every method call, with the stroke style and dash
 * pattern current at the time. Property writes are kept so reads see them.
 */
function recordingCanvas(): RecordingCanvas {
  const calls: Recorded[] = [];
  const props: Record<string, unknown> = { strokeStyle: '', lineWidth: 0, fillStyle: '', font: '' };
  let dash: number[] = [];
  const ctx = new Proxy({} as Record<string, unknown>, {
    get(_, name: string) {
      if (name in props) return props[name];
      if (name === 'setLineDash') return (value: number[]) => { dash = [...value]; };
      return (...args: unknown[]) => {
        calls.push({ name, args, strokeStyle: props.strokeStyle, fillStyle: props.fillStyle, dash: [...dash] });
      };
    },
    set(_, name: string, value: unknown) {
      props[name] = value;
      return true;
    },
  });
  const drawn = () => calls.filter(call => ['stroke', 'fill', 'fillRect', 'fillText'].includes(call.name));
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls, drawn };
}

const bar = (close: number, timestamp = 0): KLineData => ({
  timestamp,
  open: close,
  high: close + 1,
  low: close - 1,
  close,
  volume: 1,
});

/** A series stand-in with just the two methods the renderers read. */
function fakeSeries(data: KLineData[], color?: string): BaseSeries {
  return {
    getData: () => data,
    getOptions: () => (color === undefined ? {} : { color }),
  } as unknown as BaseSeries;
}

describe('strokeCrosshairSegment', () => {
  it('strokes one segment in the crosshair colour, then restores the state it found', () => {
    const { ctx, calls } = recordingCanvas();
    strokeCrosshairSegment(ctx, { color: '#abc', style: 'solid' }, { x: 1, y: 2 }, { x: 3, y: 4 });
    assert.deepEqual(calls.map(call => call.name), ['save', 'beginPath', 'moveTo', 'lineTo', 'stroke', 'restore']);
    assert.deepEqual(calls[2].args, [1, 2]);
    assert.deepEqual(calls[3].args, [3, 4]);
    assert.equal(calls[4].strokeStyle, '#abc');
  });

  it('dashes only when the style asks for it', () => {
    const solid = recordingCanvas();
    strokeCrosshairSegment(solid.ctx, { color: '#abc', style: 'solid' }, { x: 0, y: 0 }, { x: 1, y: 1 });
    assert.equal(solid.calls.some(call => call.name === 'setLineDash' && call.args[0] !== undefined), false);

    const dashed = recordingCanvas();
    strokeCrosshairSegment(dashed.ctx, { color: '#abc', style: 'dashed' }, { x: 0, y: 0 }, { x: 1, y: 1 });
    assert.equal(dashed.drawn()[0].dash.length, 2, 'the stroke runs with the dash pattern set');
  });
});

describe('renderValueTag', () => {
  const bounds = { width: 60, height: 300, left: 0, top: 0 };
  const axis = (labels: unknown[]): AxisLabelRenderer => ({
    renderLabel: (_ctx, _y, text, _bounds, side, color) => labels.push([text, side, color]),
  });

  it('draws the tag when the price is on the axis', () => {
    const labels: unknown[] = [];
    const drawn = renderValueTag(recordingCanvas().ctx, axis(labels), bounds, makeTransformer(), 150, () => 'close', '#0f0', 'right');
    assert.equal(drawn, true);
    assert.deepEqual(labels, [['close', 'right', '#0f0']]);
  });

  it('builds no text and draws nothing when the price is off the axis', () => {
    const labels: unknown[] = [];
    let built = false;
    const drawn = renderValueTag(recordingCanvas().ctx, axis(labels), bounds, makeTransformer(), 500, () => { built = true; return 'x'; }, '#0f0', 'right');
    assert.equal(drawn, false);
    assert.equal(built, false, 'the text is only built for a tag that will be drawn');
    assert.equal(labels.length, 0);
  });
});

describe('renderSeriesValueTags', () => {
  it('tags the latest close of each series, numbering them by position', () => {
    const labels: Array<[string, string | undefined]> = [];
    const axis: AxisLabelRenderer = {
      renderLabel: (_ctx, _y, text, _bounds, _side, color) => labels.push([text, color]),
    };
    renderSeriesValueTags(
      recordingCanvas().ctx,
      axis,
      { width: 60, height: 300, left: 0, top: 0 },
      makeTransformer(),
      [fakeSeries([bar(150)], '#f00'), fakeSeries([bar(160)])],
      { side: 'right', fallbackColor: '#2962ff', text: (close, index) => `${index}:${close}` },
    );
    assert.deepEqual(labels, [['0:150', '#f00'], ['1:160', '#2962ff']]);
  });

  it('skips a series with no data', () => {
    const labels: unknown[] = [];
    const axis: AxisLabelRenderer = { renderLabel: (...args) => labels.push(args[2]) };
    renderSeriesValueTags(recordingCanvas().ctx, axis, { width: 60, height: 300, left: 0, top: 0 }, makeTransformer(), [fakeSeries([])], {
      side: 'left',
      fallbackColor: '#2962ff',
      text: String,
    });
    assert.equal(labels.length, 0);
  });
});

describe('renderSeriesBeacons', () => {
  it('draws one dot per series with data on screen, in the series colour', () => {
    const { ctx, drawn } = recordingCanvas();
    renderSeriesBeacons(ctx, [fakeSeries(makeBars(10), '#123'), fakeSeries([])], makeTransformer({ min: 90, max: 130 }), 1000, 500);
    const fills = drawn().filter(call => call.name === 'fill');
    assert.equal(fills.length, 1);
    assert.equal(fills[0].fillStyle, '#123');
  });

  it('draws nothing for a series whose last point is off the pane', () => {
    const { ctx, drawn } = recordingCanvas();
    renderSeriesBeacons(ctx, [fakeSeries([bar(10_000)])], makeTransformer({ min: 90, max: 130 }), 1000, 500);
    assert.equal(drawn().length, 0);
  });
});

describe('renderSessionSeparators', () => {
  const transformer: CoordinateTransformer = makeTransformer({ min: 90, max: 130 });
  const data = makeBars(20, { step: MINUTE });

  it('draws nothing when the separator is not visible', () => {
    const { ctx, calls } = recordingCanvas();
    renderSessionSeparators(ctx, undefined, null, data, 1000, 500, transformer);
    renderSessionSeparators(ctx, { visible: false, color: '#fff', style: 'solid' }, null, data, 1000, 500, transformer);
    assert.equal(calls.length, 0);
  });
});

describe('renderMainPaneCrosshair', () => {
  const data = makeBars(20);
  const transformer = makeTransformer({ min: 90, max: 130 });

  function input(overrides: Partial<MainPaneCrosshairInput> = {}): { input: MainPaneCrosshairInput; labels: string[]; times: string[] } {
    const overlay = recordingCanvas();
    const leftAxisOverlay = recordingCanvas();
    const rightAxisOverlay = recordingCanvas();
    const topXOverlay = recordingCanvas();
    const bottomXOverlay = recordingCanvas();
    const labels: string[] = [];
    const times: string[] = [];
    const base: MainPaneCrosshairInput = {
      canvases: {
        overlay: overlay.ctx,
        leftAxisOverlay: leftAxisOverlay.ctx,
        rightAxisOverlay: rightAxisOverlay.ctx,
        topXOverlay: topXOverlay.ctx,
        bottomXOverlay: () => bottomXOverlay.ctx,
      },
      scales: [{ id: 'main', side: 'right', axisIndex: 0, transformer }],
      primaryTransformer: transformer,
      pane: { bounding: { width: 1000, height: 500, left: 0, top: 100 }, width: 1000, height: 500, isBottom: true },
      geometry: { toolbarHeight: 0, topXAxisHeight: 22, xAxisHeight: 22, leftYAxisWidth: 0 },
      // Bar 10, and a y that the pane's top offset turns into local y 72.
      crosshair: { x: transformer.indexToX(10), y: 150 },
      style: { visible: true, color: '#758696', style: 'dashed' },
      isHidden: () => false,
      data,
      chrome: { drawCrosshair: () => {} },
      yAxis: { renderLabel: (_ctx, _y, text) => labels.push(text) },
      xAxis: { renderLabel: (_ctx, _x, text) => times.push(text) },
      withAxisColumn: (_ctx, _side, _index, _height, draw) => draw({ width: 60, height: 500, left: 0, top: 0 }),
      formatPrice: price => price.toFixed(1),
      formatTime: timestamp => `t${timestamp}`,
      ...overrides,
    };
    return { input: base, labels, times };
  }

  it('draws nothing when the crosshair is hidden or absent', () => {
    const hidden = input({ style: { visible: false, color: '#fff', style: 'solid' } });
    renderMainPaneCrosshair(hidden.input);
    const absent = input({ crosshair: null });
    renderMainPaneCrosshair(absent.input);
    assert.equal(hidden.labels.length + absent.labels.length, 0);
  });

  it('labels the price on the axis at the crosshair', () => {
    const { input: base, labels } = input();
    renderMainPaneCrosshair(base);
    assert.equal(labels.length, 1);
    // The pane starts 78px down (its top less the toolbar and ruler), so local y is 150 - 78.
    assert.equal(labels[0], transformer.yToPrice(150 - (100 - 22)).toFixed(1));
  });

  it('labels the time on both rulers when the pane is the bottom one', () => {
    const { input: base, times } = input();
    renderMainPaneCrosshair(base);
    assert.equal(times.length, 2, 'one label on the bottom ruler, one on the top');
  });

  it('draws no time label on either ruler when the pane is not the bottom one', () => {
    const { input: base, times } = input({ pane: { bounding: { width: 1000, height: 500, left: 0, top: 100 }, width: 1000, height: 500, isBottom: false } });
    renderMainPaneCrosshair(base);
    assert.equal(times.length, 0, 'the time labels belong to the bottom pane');
  });

  it('does not draw when the crosshair falls outside the pane vertically', () => {
    const { input: base, labels } = input({ crosshair: { x: 200, y: 10_000 } });
    renderMainPaneCrosshair(base);
    assert.equal(labels.length, 0);
  });
});
