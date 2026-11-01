/**
 * Trading lines (entry, stop, limit, position levels) as a chart overlay.
 *
 * A trading line is a full-width horizontal overlay anchored by one price. It is
 * registered as its own template because the built-in `line` template cannot
 * express it cleanly: a horizontal line needs two distinct timestamps to avoid
 * collapsing into a vertical one, and a second handle would move only its time,
 * never its price. A single-anchor template keeps the price as the only state
 * and makes the whole line draggable as a body.
 *
 * Pure data and figure builders; the React wrapper owns the chart lifecycle.
 */

import type { Overlay, OverlayFigureParams, OverlayTemplate } from '../engine/OverlayManager';
import type { OverlayFigure } from '../engine/OverlayFigure';

export const TRADING_LINE_OVERLAY_TYPE = 'trading_line';
export const TRADING_LINE_ID_PREFIX = 'trading-line-';

const DEFAULT_LINE_WIDTH = 2;
const LABEL_FONT_SIZE = 10;
const LABEL_INSET = 6;
const LABEL_TEXT_COLOR = '#ffffff';

export interface TradingLineSpec {
  id: string;
  type: 'limit' | 'stop' | 'position' | 'entry';
  price: number;
  label?: string;
  color?: string;
  draggable?: boolean;
}

/** Chart-side overlay id for a caller-supplied trading line id. */
export function tradingLineOverlayId(id: string): string {
  return `${TRADING_LINE_ID_PREFIX}${id}`;
}

export function isTradingLineOverlayId(overlayId: string): boolean {
  return overlayId.startsWith(TRADING_LINE_ID_PREFIX);
}

export function defaultTradingLineColor(type: TradingLineSpec['type']): string {
  return type === 'position' ? '#10b981' : '#f59e0b';
}

/**
 * Overlay fields that describe a trading line. Callbacks are not included: they
 * close over the caller's latest handler and are attached by the caller.
 */
export function buildTradingLineFields(
  spec: TradingLineSpec,
  anchorTimestamp: number,
): Omit<Overlay, 'id'> {
  return {
    type: TRADING_LINE_OVERLAY_TYPE,
    points: [{ timestamp: anchorTimestamp, value: spec.price }],
    color: spec.color ?? defaultTradingLineColor(spec.type),
    lineWidth: DEFAULT_LINE_WIDTH,
    text: spec.label ?? '',
    locked: spec.draggable === false,
  };
}

/**
 * Figures for one trading line: a horizontal rule across the pane and a price
 * tag at the right edge. Hit testing uses the same figures, so grabbing the rule
 * drags the line and nothing else.
 */
export function tradingLineFigures(params: OverlayFigureParams): OverlayFigure[] {
  const { overlay, coordinates, width } = params;
  const anchor = coordinates[0];
  const point = overlay.points[0];
  if (!anchor || !point) return [];

  const price = point.value.toFixed(2);
  const text = overlay.text ? `${overlay.text}  ${price}` : price;

  return [
    {
      type: 'line',
      attrs: { coordinates: [{ x: 0, y: anchor.y }, { x: width, y: anchor.y }] },
      styles: {
        color: overlay.color,
        lineWidth: overlay.lineWidth,
        dashedValue: overlay.locked ? [] : [5, 4],
      },
    },
    {
      type: 'text',
      attrs: { x: width - LABEL_INSET, y: anchor.y - 3, text },
      styles: {
        color: LABEL_TEXT_COLOR,
        backgroundColor: overlay.color,
        size: LABEL_FONT_SIZE,
        align: 'right',
        baseline: 'bottom',
      },
    },
  ];
}

export const tradingLineTemplate: OverlayTemplate = {
  type: TRADING_LINE_OVERLAY_TYPE,
  totalStep: 1,
  needDefaultPointFigure: false,
  createFigures: tradingLineFigures,
};
