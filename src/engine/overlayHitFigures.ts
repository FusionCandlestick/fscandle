/**
 * Hit-test geometry for the built-in overlay templates, as figure descriptors.
 *
 * Rendering and hit testing used to be written twice: a template drew itself
 * imperatively in `render`, and `OverlayManager.findOverlayAt` carried a parallel
 * `if (overlay.type === ...)` chain describing the same shapes a second time.
 * The two drifted — a template could be restyled or re-anchored without its hit
 * test following — and every new built-in overlay meant editing the chain.
 *
 * Each built-in template now declares `createHitFigures`, so the generic
 * `isPointInAnyFigure` path handles first-party and third-party overlays alike.
 * These figures carry geometry only: styling is irrelevant to a hit test.
 *
 * Extended and axis-anchored lines have no finite endpoints, so they are emitted
 * as segments clipped to the viewport — exactly the region a pointer can reach.
 */

import type { OverlayFigure } from './OverlayFigure';
import type { OverlayFigureParams } from './OverlayManager';

/** Half-extent of the clickable box around a label-like overlay, in pixels. */
const LABEL_HALF_WIDTH = 60;
const LABEL_HALF_HEIGHT = 40;

const line = (coordinates: { x: number; y: number }[]): OverlayFigure => ({
  type: 'line',
  attrs: { coordinates },
});

const polygon = (coordinates: { x: number; y: number }[]): OverlayFigure => ({
  type: 'polygon',
  attrs: { coordinates },
  styles: { style: 'fill' },
});

const boxAround = (x: number, y: number): OverlayFigure => ({
  type: 'rect',
  attrs: {
    x: x - LABEL_HALF_WIDTH,
    y: y - LABEL_HALF_HEIGHT,
    width: LABEL_HALF_WIDTH * 2,
    height: LABEL_HALF_HEIGHT * 2,
  },
  styles: { style: 'fill' },
});

const rectBetween = (x1: number, y1: number, x2: number, y2: number): OverlayFigure => ({
  type: 'rect',
  attrs: {
    x: Math.min(x1, x2),
    y: Math.min(y1, y2),
    width: Math.abs(x2 - x1),
    height: Math.abs(y2 - y1),
  },
  styles: { style: 'fill' },
});

/**
 * A line through (x1,y1)-(x2,y2) clipped to the viewport.
 *
 * `extendStart` / `extendEnd` project past the respective endpoint, which is how
 * rays and infinite lines differ from a plain segment.
 */
function projectedLine(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  width: number,
  height: number,
  extendStart: boolean,
  extendEnd: boolean,
): OverlayFigure {
  const dx = x2 - x1;
  const dy = y2 - y1;

  if (Math.abs(dx) < 0.001) {
    // Vertical: project along y instead, or the slope below divides by ~zero.
    return line([
      { x: x1, y: extendStart ? (dy >= 0 ? 0 : height) : y1 },
      { x: x2, y: extendEnd ? (dy >= 0 ? height : 0) : y2 },
    ]);
  }

  const slope = dy / dx;
  const at = (x: number) => y1 + slope * (x - x1);
  const forward = dx > 0;
  const startX = extendStart ? (forward ? 0 : width) : x1;
  const endX = extendEnd ? (forward ? width : 0) : x2;
  return line([
    { x: startX, y: extendStart ? at(startX) : y1 },
    { x: endX, y: extendEnd ? at(endX) : y2 },
  ]);
}

const first = (params: OverlayFigureParams) => params.coordinates[0];
const second = (params: OverlayFigureParams) => params.coordinates[1] ?? params.coordinates[0];

/** The grouped `line` template: direction and extension come from `overlay.line`. */
export function lineHitFigures(params: OverlayFigureParams): OverlayFigure[] {
  const { width, height } = params;
  const options = params.overlay.line ?? {};
  const direction = options.direction ?? 'free';
  const start = first(params);
  const end = second(params);
  if (!start) return [];

  const x2 = direction === 'vertical' ? start.x : end.x;
  const y2 = direction === 'horizontal' ? start.y : end.y;
  return [
    projectedLine(
      start.x,
      start.y,
      x2,
      y2,
      width,
      height,
      options.extendStart ?? false,
      options.extendEnd ?? false,
    ),
  ];
}

/** The grouped `channel` template: a base line plus its offset partner. */
export function channelHitFigures(params: OverlayFigureParams): OverlayFigure[] {
  const [p1, p2, p3] = params.coordinates;
  if (!p1 || !p2) return [];
  const figures = [line([p1, p2])];
  if (p3) {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const length = Math.hypot(dx, dy) || 1;
    const normalX = -dy / length;
    const normalY = dx / length;
    const normalDistance = (p3.x - p1.x) * normalX + (p3.y - p1.y) * normalY;
    const offsetX = normalX * normalDistance;
    const offsetY = normalY * normalDistance;
    const translatedStart = { x: p1.x + offsetX, y: p1.y + offsetY };
    const p4 = { x: p2.x + offsetX, y: p2.y + offsetY };
    figures.push(line([translatedStart, p4]));
    figures.push(polygon([p1, p2, p4, translatedStart]));
  }
  return figures;
}

/** Label-like overlays: a padded box around each point and leader line. */
export function labelHitFigures(params: OverlayFigureParams): OverlayFigure[] {
  const points = params.coordinates;
  if (points.length === 0) return [];
  const figures: OverlayFigure[] = [];
  points.forEach(pt => {
    figures.push(boxAround(pt.x, pt.y));
  });
  if (points.length >= 2) {
    figures.push(line([points[0], points[1]]));
  }
  return figures;
}

/** Wave patterns: the connecting legs plus the filled regions between them. */
export function waveHitFigures(params: OverlayFigureParams): OverlayFigure[] {
  const points = params.coordinates;
  if (points.length < 2) return [];
  const figures: OverlayFigure[] = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    figures.push(line([points[index], points[index + 1]]));
  }
  // Successive triples are filled in the renderer, so they are clickable too.
  for (let index = 0; index + 2 < points.length; index += 1) {
    figures.push(polygon([points[index], points[index + 1], points[index + 2]]));
  }
  return figures;
}

/** Filled area between the two corner points, plus its outline. */
export function rectangleHitFigures(params: OverlayFigureParams): OverlayFigure[] {
  const start = first(params);
  const end = second(params);
  if (!start || !end) return [];
  return [rectBetween(start.x, start.y, end.x, end.y), line([start, end])];
}

/** Fibonacci and channel variants: the base line, and the level band it spans. */
export function bandHitFigures(params: OverlayFigureParams): OverlayFigure[] {
  const start = first(params);
  const end = second(params);
  if (!start || !end) return [];
  return [line([{ x: 0, y: start.y }, { x: params.width, y: start.y }]),
          line([{ x: 0, y: end.y }, { x: params.width, y: end.y }]),
          line([start, end])];
}
