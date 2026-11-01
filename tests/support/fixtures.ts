/**
 * Shared test fixtures: bar series, coordinate transformers, and a canvas stub.
 *
 * Each factory returns fresh objects, so tests can mutate what they receive
 * without affecting one another.
 */

import { CoordinateTransformer } from '../../src/engine/CoordinateTransformer';
import { DataStore } from '../../src/store/DataStore';
import type { KLineData } from '../../src/types';

export const MINUTE = 60_000;

export interface BarOverrides extends Partial<KLineData> {}

/** One OHLCV bar. Unset fields follow from `close`: open = close, high/low ±1. */
export function makeBar(timestamp: number, close = 100, overrides: BarOverrides = {}): KLineData {
  return {
    timestamp,
    open: close,
    high: close + 1,
    low: close - 1,
    close,
    volume: 10,
    ...overrides,
  };
}

export interface SeriesOptions {
  start?: number;
  step?: number;
  price?: number;
}

/** `count` bars, `step` ms apart from `start`. The close rises by one per bar unless `price` is given. */
export function makeBars(count: number, { start = 0, step = MINUTE, price }: SeriesOptions = {}): KLineData[] {
  return Array.from({ length: count }, (_, i) =>
    makeBar(start + i * step, price ?? 100 + i),
  );
}

/** Bars whose close is taken from `closes`, one per entry, `MINUTE` apart. */
export function makeBarsFromCloses(closes: number[]): KLineData[] {
  return closes.map((close, i) => ({
    timestamp: i * MINUTE,
    open: close,
    high: close + 5,
    low: close - 5,
    close,
    volume: 1,
  }));
}

export interface TransformerOptions {
  width?: number;
  height?: number;
  min?: number;
  max?: number;
  barSpacing?: number;
  offset?: number;
}

export function makeTransformer({
  width = 1000,
  height = 500,
  min = 100,
  max = 200,
  barSpacing = 10,
  offset = 0,
}: TransformerOptions = {}): CoordinateTransformer {
  const transformer = new CoordinateTransformer();
  transformer.setDimensions(width, height);
  transformer.setRange(min, max);
  transformer.setBarSpacing(barSpacing);
  transformer.setOffset(offset);
  return transformer;
}

/** A store holding 20 flat bars plus a transformer whose price range spans them. */
export function makeChartContext(width = 1000, height = 500) {
  const store = new DataStore();
  store.setData(
    Array.from({ length: 20 }, (_, i) => ({
      timestamp: i * MINUTE,
      open: 100,
      high: 110,
      low: 90,
      close: 100,
      volume: 1,
    })),
  );
  const transformer = makeTransformer({ width, height, min: 90, max: 110 });
  return { store, transformer };
}

/**
 * A canvas context that counts drawing calls and ignores styling. Use it when a
 * test cares how often something draws, not what it looks like.
 */
export function recordingContext() {
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
    save: noop,
    restore: noop,
    clip: noop,
    rect: noop,
    closePath: noop,
    setLineDash: noop,
    fillText: noop,
    strokeText: noop,
    measureText: () => ({ width: 0 }),
    lineWidth: 0,
    strokeStyle: '',
    fillStyle: '',
    font: '',
    textAlign: 'start',
    textBaseline: 'alphabetic',
  };
  return { calls, ctx: ctx as unknown as CanvasRenderingContext2D };
}
