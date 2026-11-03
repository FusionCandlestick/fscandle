import type { KLineData } from '../types';
import type { CoordinateTransformer } from './CoordinateTransformer';

/** Logical bar indices on screen, inclusive. */
export interface CustomPaneVisibleRange {
  from: number;
  to: number;
}

export interface CustomPaneDrawParams {
  /** The id the pane was registered under. */
  paneId: string;
  /** Plot width in pixels, excluding the price axis columns. */
  width: number;
  /** Plot height in pixels. */
  height: number;
  /**
   * Converts between bar index, time, price and pixels for this pane, with the
   * pane's current range applied. Read it; changing it changes the chart.
   */
  transformer: CoordinateTransformer;
  /** The main series' bars. */
  data: KLineData[];
  /** The bars currently on screen. */
  visibleRange: CustomPaneVisibleRange;
}

export interface CustomPaneOptions {
  /** Pane id. Generated when omitted; `main` is reserved. */
  id?: string;
  /**
   * The price range the pane shows, for the bars on screen. Return null to use
   * the visible high and low. Only finite ranges with `max > min` are used.
   */
  range?: (visibleRange: CustomPaneVisibleRange, data: KLineData[]) => { min: number; max: number } | null;
  /** Draws the pane body on its own canvas. The context is saved and restored around the call. */
  draw: (ctx: CanvasRenderingContext2D, params: CustomPaneDrawParams) => void;
}

export function isUsableRange(range: { min: number; max: number } | null | undefined): range is { min: number; max: number } {
  return !!range && Number.isFinite(range.min) && Number.isFinite(range.max) && range.max > range.min;
}

/**
 * The high and low of the bars on screen, widened slightly when they are equal
 * (one bar with no range), so the pane still has a scale. Null when no bar is on
 * screen.
 */
export function visibleOhlcRange(data: KLineData[], visibleRange: CustomPaneVisibleRange): { min: number; max: number } | null {
  const from = Math.max(0, Math.ceil(visibleRange.from));
  const to = Math.min(data.length - 1, Math.floor(visibleRange.to));
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (let index = from; index <= to; index++) {
    const bar = data[index];
    if (!bar) continue;
    if (Number.isFinite(bar.low)) min = Math.min(min, bar.low);
    if (Number.isFinite(bar.high)) max = Math.max(max, bar.high);
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
  if (max - min < 1e-9) {
    const pad = Math.max(Math.abs(max), 1) * 0.005;
    return { min: min - pad, max: max + pad };
  }
  return { min, max };
}
