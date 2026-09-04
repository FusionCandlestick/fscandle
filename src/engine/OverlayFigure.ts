/**
 * Declarative figure descriptors for overlays.
 *
 * An overlay template can either draw imperatively (`render`) or return a list
 * of figures (`createFigures`). Figures are the extensible path: they are plain
 * data, so they can be hit-tested, serialized, restyled, and z-ordered without
 * the engine having to understand the template's drawing code.
 */

import { UI_FONT_FAMILY } from '../model/fontFamily';

export interface FigurePoint {
  x: number;
  y: number;
}

export interface FigureStyles {
  /** `stroke` draws the outline, `fill` fills, `stroke_fill` does both. */
  style?: 'stroke' | 'fill' | 'stroke_fill';
  color?: string;
  lineWidth?: number;
  /** Dash pattern in pixels; empty array means solid. */
  dashedValue?: number[];
  /** Fill color when `style` includes filling. Defaults to `color`. */
  fillColor?: string;
  opacity?: number;
}

export interface TextFigureStyles extends FigureStyles {
  size?: number;
  family?: string;
  weight?: string | number;
  align?: CanvasTextAlign;
  baseline?: CanvasTextBaseline;
  /** Padded background box behind the text. */
  backgroundColor?: string;
  paddingLeft?: number;
  paddingRight?: number;
  paddingTop?: number;
  paddingBottom?: number;
  borderRadius?: number;
}

export type OverlayFigure =
  | { type: 'line'; attrs: { coordinates: FigurePoint[] }; styles?: FigureStyles }
  | { type: 'polygon'; attrs: { coordinates: FigurePoint[] }; styles?: FigureStyles }
  | { type: 'rect'; attrs: { x: number; y: number; width: number; height: number }; styles?: FigureStyles }
  | { type: 'circle'; attrs: { x: number; y: number; r: number }; styles?: FigureStyles }
  | {
      type: 'arc';
      attrs: { x: number; y: number; r: number; startAngle: number; endAngle: number };
      styles?: FigureStyles;
    }
  | { type: 'text'; attrs: { x: number; y: number; text: string }; styles?: TextFigureStyles };

const DEFAULT_STYLES: Required<Pick<FigureStyles, 'style' | 'color' | 'lineWidth' | 'opacity'>> = {
  style: 'stroke',
  color: '#2962FF',
  lineWidth: 1,
  opacity: 1,
};

function applyCommon(ctx: CanvasRenderingContext2D, styles: FigureStyles | undefined) {
  const resolved = { ...DEFAULT_STYLES, ...styles };
  ctx.globalAlpha = resolved.opacity;
  ctx.strokeStyle = resolved.color;
  ctx.fillStyle = styles?.fillColor ?? resolved.color;
  ctx.lineWidth = resolved.lineWidth;
  ctx.setLineDash(styles?.dashedValue ?? []);
  return resolved.style;
}

function strokeAndFill(ctx: CanvasRenderingContext2D, style: FigureStyles['style']) {
  if (style === 'fill' || style === 'stroke_fill') ctx.fill();
  if (style === 'stroke' || style === 'stroke_fill') ctx.stroke();
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.max(0, Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2));
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

/** Draw one figure. Canvas state is saved and restored around the call. */
export function drawFigure(ctx: CanvasRenderingContext2D, figure: OverlayFigure) {
  ctx.save();
  try {
    switch (figure.type) {
      case 'line': {
        const style = applyCommon(ctx, figure.styles);
        const points = figure.attrs.coordinates;
        if (points.length < 2) break;
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
        // A polyline is never filled, whatever the style says.
        if (style === 'fill') ctx.stroke();
        else strokeAndFill(ctx, style === 'stroke_fill' ? 'stroke' : style);
        break;
      }
      case 'polygon': {
        const style = applyCommon(ctx, figure.styles);
        const points = figure.attrs.coordinates;
        if (points.length < 3) break;
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
        ctx.closePath();
        strokeAndFill(ctx, style);
        break;
      }
      case 'rect': {
        const style = applyCommon(ctx, figure.styles);
        const { x, y, width, height } = figure.attrs;
        ctx.beginPath();
        ctx.rect(x, y, width, height);
        strokeAndFill(ctx, style);
        break;
      }
      case 'circle': {
        const style = applyCommon(ctx, figure.styles);
        const { x, y, r } = figure.attrs;
        ctx.beginPath();
        ctx.arc(x, y, Math.max(0, r), 0, Math.PI * 2);
        strokeAndFill(ctx, style);
        break;
      }
      case 'arc': {
        const style = applyCommon(ctx, figure.styles);
        const { x, y, r, startAngle, endAngle } = figure.attrs;
        ctx.beginPath();
        ctx.arc(x, y, Math.max(0, r), startAngle, endAngle);
        // Arcs stroke only; filling one produces a wedge nobody asked for.
        if (style !== 'fill') ctx.stroke();
        break;
      }
      case 'text': {
        const styles = figure.styles ?? {};
        applyCommon(ctx, styles);
        const size = styles.size ?? 12;
        const family = styles.family ?? UI_FONT_FAMILY;
        const weight = styles.weight ?? 'normal';
        ctx.font = `${weight} ${size}px ${family}`;
        ctx.textAlign = styles.align ?? 'left';
        ctx.textBaseline = styles.baseline ?? 'alphabetic';

        const { x, y, text } = figure.attrs;

        if (styles.backgroundColor) {
          const paddingLeft = styles.paddingLeft ?? 4;
          const paddingRight = styles.paddingRight ?? 4;
          const paddingTop = styles.paddingTop ?? 2;
          const paddingBottom = styles.paddingBottom ?? 2;
          const textWidth = ctx.measureText(text).width;
          const boxWidth = textWidth + paddingLeft + paddingRight;
          const boxHeight = size + paddingTop + paddingBottom;

          const boxX =
            ctx.textAlign === 'center'
              ? x - boxWidth / 2
              : ctx.textAlign === 'right' || ctx.textAlign === 'end'
                ? x - boxWidth
                : x - paddingLeft;
          const boxY =
            ctx.textBaseline === 'middle'
              ? y - boxHeight / 2
              : ctx.textBaseline === 'bottom'
                ? y - boxHeight
                : y - paddingTop;

          ctx.fillStyle = styles.backgroundColor;
          drawRoundedRect(ctx, boxX, boxY, boxWidth, boxHeight, styles.borderRadius ?? 2);
          ctx.fill();
        }

        ctx.fillStyle = styles.color ?? DEFAULT_STYLES.color;
        ctx.fillText(text, x, y);
        break;
      }
    }
  } finally {
    ctx.restore();
  }
}

export function drawFigures(ctx: CanvasRenderingContext2D, figures: OverlayFigure[]) {
  for (const figure of figures) drawFigure(ctx, figure);
}

/** Distance from a point to a segment; the shared primitive for figure hit tests. */
function distanceToSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(px - x1, py - y1);
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lengthSquared));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function isPointInPolygon(px: number, py: number, points: FigurePoint[]): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const intersects =
      points[i].y > py !== points[j].y > py &&
      px <
        ((points[j].x - points[i].x) * (py - points[i].y)) / (points[j].y - points[i].y) +
          points[i].x;
    if (intersects) inside = !inside;
  }
  return inside;
}

/**
 * Generic hit test against a figure. Lets the engine hit-test template-declared
 * shapes without the template supplying its own hit-test code.
 */
export function isPointInFigure(
  x: number,
  y: number,
  figure: OverlayFigure,
  threshold = 8,
): boolean {
  switch (figure.type) {
    case 'line': {
      const points = figure.attrs.coordinates;
      for (let i = 0; i < points.length - 1; i++) {
        if (distanceToSegment(x, y, points[i].x, points[i].y, points[i + 1].x, points[i + 1].y) <= threshold) {
          return true;
        }
      }
      return false;
    }
    case 'polygon': {
      const points = figure.attrs.coordinates;
      if (figure.styles?.style === 'fill' || figure.styles?.style === 'stroke_fill') {
        if (isPointInPolygon(x, y, points)) return true;
      }
      for (let i = 0; i < points.length; i++) {
        const next = points[(i + 1) % points.length];
        if (distanceToSegment(x, y, points[i].x, points[i].y, next.x, next.y) <= threshold) return true;
      }
      return false;
    }
    case 'rect': {
      const { x: rx, y: ry, width, height } = figure.attrs;
      const left = Math.min(rx, rx + width) - threshold;
      const right = Math.max(rx, rx + width) + threshold;
      const top = Math.min(ry, ry + height) - threshold;
      const bottom = Math.max(ry, ry + height) + threshold;
      return x >= left && x <= right && y >= top && y <= bottom;
    }
    case 'circle':
    case 'arc': {
      const { x: cx, y: cy, r } = figure.attrs;
      const distance = Math.hypot(x - cx, y - cy);
      if (figure.type === 'circle' && (figure.styles?.style === 'fill' || figure.styles?.style === 'stroke_fill')) {
        return distance <= r + threshold;
      }
      return Math.abs(distance - r) <= threshold;
    }
    case 'text': {
      // Approximate: text metrics need a context, so use a generous box.
      const size = figure.styles?.size ?? 12;
      const width = figure.attrs.text.length * size * 0.6;
      return (
        x >= figure.attrs.x - threshold &&
        x <= figure.attrs.x + width + threshold &&
        y >= figure.attrs.y - size - threshold &&
        y <= figure.attrs.y + threshold
      );
    }
  }
}

export function isPointInAnyFigure(
  x: number,
  y: number,
  figures: OverlayFigure[],
  threshold = 8,
): boolean {
  return figures.some(figure => isPointInFigure(x, y, figure, threshold));
}

/**
 * A consumer's restyling of the figures a template produced.
 *
 * Either fixed styles, or a function of the figure and its index so one
 * override can treat a shape's outline and its handles differently. Returning
 * nothing leaves that figure exactly as the template drew it.
 */
export type FigureStyleOverride =
  | Partial<TextFigureStyles>
  | ((figure: OverlayFigure, index: number) => Partial<TextFigureStyles> | undefined);

/**
 * Merge an override onto a set of figures, template styles first.
 *
 * Built-in overlay templates hardcode their figure styles, so restyling one
 * meant forking the template. The override is applied at draw time and merged
 * over what the template chose, which keeps a partial override partial: set
 * only `color` and the template's dash pattern and line width survive.
 */
export function applyFigureStyleOverride(
  figures: OverlayFigure[],
  override: FigureStyleOverride | undefined,
): OverlayFigure[] {
  if (!override) return figures;
  return figures.map((figure, index) => {
    const patch = typeof override === 'function' ? override(figure, index) : override;
    if (!patch) return figure;
    return { ...figure, styles: { ...(figure.styles ?? {}), ...patch } } as OverlayFigure;
  });
}
