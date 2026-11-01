/**
 * Canvas drawing for price lines, the last-price line, and series markers.
 *
 * Each function takes what it draws from as arguments, so the chart decides
 * what is visible and these only paint it.
 */

import type { CoordinateTransformer } from './CoordinateTransformer';
import type { PaneAxisSide } from './PaneManager';
import type { Bounding, KLineData } from '../types';
import { placeMarkers, type PriceLineOptions, type SeriesMarker } from '../model/seriesDecorations';
import { visibleIndexRange } from '../model/visibleRange';

/** Horizontal lines across the plot, one per caller-owned price line. */
export function renderPriceLines(
  ctx: CanvasRenderingContext2D,
  width: number,
  transformer: CoordinateTransformer,
  lines: PriceLineOptions[],
): void {
  if (lines.length === 0) return;

  ctx.save();
  for (const line of lines) {
    const y = transformer.priceToY(line.price);
    if (!Number.isFinite(y)) continue;
    ctx.strokeStyle = line.color;
    ctx.lineWidth = line.lineWidth;
    ctx.setLineDash(line.lineStyle === 'dashed' ? [6, 4] : line.lineStyle === 'dotted' ? [1, 3] : []);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.restore();
}

/** Dashed line at the latest close, coloured up or down against that bar's open. */
export function renderLastPriceLine(
  ctx: CanvasRenderingContext2D,
  width: number,
  transformer: CoordinateTransformer,
  data: KLineData[],
): void {
  if (data.length === 0) return;
  const last = data[data.length - 1];
  const y = transformer.priceToY(last.close);
  if (!Number.isFinite(y)) return;

  ctx.save();
  ctx.strokeStyle = last.close >= last.open ? '#26a69a' : '#ef5350';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(0, y);
  ctx.lineTo(width, y);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

/** Anything that can paint a label on a price axis column. */
export interface AxisLabelRenderer {
  renderLabel(
    ctx: CanvasRenderingContext2D,
    coordinate: number,
    text: string,
    bounding: Bounding,
    side: 'top' | 'bottom' | 'left' | 'right',
    bgColor?: string,
  ): void;
}

/** Price-axis labels for price lines that ask for one, inside one axis column. */
export function renderPriceLineLabels(
  ctx: CanvasRenderingContext2D,
  bounds: Bounding,
  side: PaneAxisSide,
  transformer: CoordinateTransformer,
  lines: PriceLineOptions[],
  axis: AxisLabelRenderer,
  formatPrice: (price: number) => string,
): void {
  for (const line of lines) {
    if (!line.axisLabelVisible) continue;
    const y = transformer.priceToY(line.price);
    if (!Number.isFinite(y) || y < 0 || y > bounds.height) continue;
    axis.renderLabel(ctx, y, line.title || formatPrice(line.price), bounds, side, line.color);
  }
}

/**
 * Per-bar glyphs. Placement drops anything outside the visible slice before
 * drawing, so markers that are off screen cost nothing.
 */
export function renderSeriesMarkers(
  ctx: CanvasRenderingContext2D,
  data: KLineData[],
  transformer: CoordinateTransformer,
  markers: SeriesMarker[],
  fontFamily: string,
): void {
  if (markers.length === 0 || data.length === 0) return;

  const visible = visibleIndexRange(x => transformer.xToIndex(x), transformer.getWidth(), data.length);
  const placed = placeMarkers(
    markers,
    data,
    visible,
    index => transformer.indexToX(index),
    price => transformer.priceToY(price),
  );
  if (placed.length === 0) return;

  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `400 10px ${fontFamily}`;
  for (const { marker, x, y } of placed) {
    ctx.fillStyle = marker.color;
    ctx.strokeStyle = marker.color;
    const size = marker.size;

    if (marker.shape === 'square') {
      ctx.fillRect(x - size / 2, y - size / 2, size, size);
    } else if (marker.shape === 'arrowUp' || marker.shape === 'arrowDown') {
      const direction = marker.shape === 'arrowUp' ? -1 : 1;
      ctx.beginPath();
      ctx.moveTo(x, y + direction * size);
      ctx.lineTo(x - size * 0.7, y - direction * size * 0.4);
      ctx.lineTo(x + size * 0.7, y - direction * size * 0.4);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.arc(x, y, size / 2, 0, Math.PI * 2);
      ctx.fill();
    }

    if (marker.text) {
      const offset = marker.position === 'belowBar' ? size + 20 : -(size + 20);
      ctx.fillText(marker.text, x, y + offset);
    }
  }
  ctx.restore();
}
