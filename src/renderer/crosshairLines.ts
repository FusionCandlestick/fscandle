/**
 * The crosshair's extension lines, drawn on an axis or ruler canvas to carry the
 * crosshair's position across the chart edge.
 */

export interface CrosshairLineStyle {
  color: string;
  style: 'solid' | 'dashed';
}

export interface CanvasPoint {
  x: number;
  y: number;
}

/** One straight crosshair segment, in the style the crosshair is configured with. */
export function strokeCrosshairSegment(
  ctx: CanvasRenderingContext2D,
  style: CrosshairLineStyle,
  from: CanvasPoint,
  to: CanvasPoint,
): void {
  ctx.save();
  ctx.strokeStyle = style.color;
  ctx.lineWidth = 1;
  if (style.style === 'dashed') ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}
