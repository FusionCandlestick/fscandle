/**
 * Vertical marks where one trading session ends and the next begins.
 */

import type { CoordinateTransformer } from '../engine/CoordinateTransformer';
import type { TradingSession } from '../model/session';
import { findSessionBoundaries } from '../model/sessionSeparators';
import { visibleIndexRange } from '../model/visibleRange';
import type { KLineData } from '../types';
import type { ChartOptions } from '../types/options';

type SessionSeparator = NonNullable<ChartOptions['timeScale']['sessionSeparator']>;

export function renderSessionSeparators(
  ctx: CanvasRenderingContext2D,
  separator: SessionSeparator | undefined,
  session: TradingSession | null,
  data: KLineData[],
  width: number,
  height: number,
  transformer: CoordinateTransformer,
): void {
  if (!separator?.visible || data.length < 2) return;

  const visible = visibleIndexRange(x => transformer.xToIndex(x), width, data.length);
  const boundaries = findSessionBoundaries({
    timestamps: data.map(bar => bar.timestamp),
    from: visible.start,
    to: visible.end,
    session,
  });
  if (boundaries.length === 0) return;

  ctx.save();
  ctx.strokeStyle = separator.color;
  ctx.lineWidth = 1;
  if (separator.style === 'dashed') ctx.setLineDash([4, 4]);
  for (const index of boundaries) {
    // Half a bar to the left of the opening bar: the break belongs between the
    // two sessions, not on top of the first bar of the new one.
    const x = Math.round(transformer.indexToX(index) - transformer.getBarSpacing() / 2) + 0.5;
    if (x < 0 || x > width) continue;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.restore();
}
