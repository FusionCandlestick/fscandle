/**
 * The dot at the leading tip of each series, drawn on the main pane so the
 * newest value of every series is marked where it sits.
 */

import type { CoordinateTransformer } from '../engine/CoordinateTransformer';
import type { BaseSeries } from '../engine/BaseSeries';
import { seriesTagColor } from './axisTags';

const BEACON_RADIUS = 4;
const BEACON_OUTLINE = '#ffffff';

export function renderSeriesBeacons(
  ctx: CanvasRenderingContext2D,
  series: readonly BaseSeries[],
  transformer: CoordinateTransformer,
  width: number,
  height: number,
): void {
  for (const item of series) {
    const data = item.getData();
    if (data.length === 0) continue;
    const lastIndex = data.length - 1;
    const last = data[lastIndex];
    const x = transformer.indexToX(lastIndex);
    const y = transformer.priceToY(last.close);
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > width || y < 0 || y > height) continue;
    ctx.save();
    ctx.fillStyle = seriesTagColor(item, '#2962ff');
    ctx.beginPath();
    ctx.arc(x, y, BEACON_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = BEACON_OUTLINE;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }
}
