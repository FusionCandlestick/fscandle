/**
 * Value tags on a price axis: the latest close of a series, drawn in the
 * series' colour, with the text supplied by the caller.
 */

import type { CoordinateTransformer } from '../engine/CoordinateTransformer';
import type { AxisLabelRenderer } from '../engine/decorationRenderer';
import type { BaseSeries } from '../engine/BaseSeries';
import type { Bounding } from '../types';

export type TagSide = 'left' | 'right';

/**
 * A tag at one price. The text is only built once the tag is known to be on the
 * axis, so an off-screen series costs nothing. Returns whether it was drawn.
 */
export function renderValueTag(
  ctx: CanvasRenderingContext2D,
  axis: AxisLabelRenderer,
  bounds: Bounding,
  transformer: CoordinateTransformer,
  price: number,
  text: () => string,
  color: string,
  side: TagSide,
): boolean {
  const y = transformer.priceToY(price);
  if (!Number.isFinite(y) || y < 0 || y > bounds.height) return false;
  axis.renderLabel(ctx, y, text(), bounds, side, color);
  return true;
}

/** The colour a series asks for, or the fallback when it does not set one. */
export function seriesTagColor(series: BaseSeries, fallback: string): string {
  return (series.getOptions() as { color?: string }).color || fallback;
}

/**
 * A tag at the latest close of each series, in list order. `text` receives the
 * index within the list, for formatters that number their series.
 */
export function renderSeriesValueTags(
  ctx: CanvasRenderingContext2D,
  axis: AxisLabelRenderer,
  bounds: Bounding,
  transformer: CoordinateTransformer,
  series: readonly BaseSeries[],
  options: { side: TagSide; fallbackColor: string; text: (close: number, index: number) => string },
): void {
  series.forEach((item, index) => {
    const data = item.getData();
    if (data.length === 0) return;
    const last = data[data.length - 1];
    renderValueTag(
      ctx,
      axis,
      bounds,
      transformer,
      last.close,
      () => options.text(last.close, index),
      seriesTagColor(item, options.fallbackColor),
      options.side,
    );
  });
}
