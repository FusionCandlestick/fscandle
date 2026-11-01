/**
 * Pixel drawing and hit geometry for the built-in overlay shapes.
 *
 * Pure functions of a canvas context and plain coordinates, so templates and
 * hit tests share one implementation of each shape.
 */

import type { CoordinateDataSource, CoordinateTransformer } from './CoordinateTransformer';
import type { Overlay } from './overlayTypes';
import { UI_FONT_FAMILY } from '../model/fontFamily';

/** Gap kept between a label and the edge it is pinned to, in pixels. */
export const LABEL_SAFE_GAP = 20;

export function isPointNearLine(px: number, py: number, x1: number, y1: number, x2: number, y2: number, threshold: number): boolean {
  const l2 = Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2);
  if (l2 === 0) return Math.sqrt(Math.pow(px - x1, 2) + Math.pow(py - y1, 2)) < threshold;
  // For extended lines (trend/infinite/ray), allow hit test beyond the segment endpoints
  const t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
  const tClamped = Math.max(0, Math.min(1, t));
  const dist = Math.sqrt(Math.pow(px - (x1 + tClamped * (x2 - x1)), 2) + Math.pow(py - (y1 + tClamped * (y2 - y1)), 2));
  return dist < threshold;
}

export function getCoordinates(overlay: Overlay, transformer: CoordinateTransformer, dataStore: CoordinateDataSource) {
  return {
    x1: transformer.timestampToXUnbounded(overlay.points[0].timestamp, dataStore),
    y1: transformer.priceToY(overlay.points[0].value),
    x2: overlay.points.length > 1 ? transformer.timestampToXUnbounded(overlay.points[1].timestamp, dataStore) : 0,
    y2: overlay.points.length > 1 ? transformer.priceToY(overlay.points[1].value) : 0
  };
}

export function fillWaveTriangles(
  ctx: CanvasRenderingContext2D,
  points: { x: number; y: number }[],
  kind: NonNullable<Overlay['wave']>['kind'],
  color: string,
) {
  const triangles = getWaveFillTriangles(points, kind);
  triangles.forEach((triangle, index) => {
    ctx.save();
    ctx.globalAlpha = [0.14, 0.1, 0.07][index] ?? 0.07;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(triangle[0].x, triangle[0].y);
    ctx.lineTo(triangle[1].x, triangle[1].y);
    ctx.lineTo(triangle[2].x, triangle[2].y);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  });
}

export function isPointInWaveFill(
  x: number,
  y: number,
  points: { x: number; y: number }[],
  kind: NonNullable<Overlay['wave']>['kind'],
): boolean {
  return getWaveFillTriangles(points, kind).some(triangle => isPointInPolygon(x, y, triangle));
}

export function getWaveFillTriangles(
  points: { x: number; y: number }[],
  kind: NonNullable<Overlay['wave']>['kind'],
): { x: number; y: number }[][] {
  if (kind !== 'abcd' && kind !== 'abcde') {
    return [];
  }
  const triangles: { x: number; y: number }[][] = [];
  for (let start = 0; start <= points.length - 3; start++) {
    triangles.push([points[start], points[start + 1], points[start + 2]]);
  }
  return triangles;
}

export function isPointInPolygon(x: number, y: number, points: { x: number; y: number }[]): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const current = points[i];
    const previous = points[j];
    if (
      (current.y > y) !== (previous.y > y) &&
      x < ((previous.x - current.x) * (y - current.y)) / (previous.y - current.y) + current.x
    ) {
      inside = !inside;
    }
  }
  return inside;
}

export function drawLinePath(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  width: number,
  height: number,
  extendStart: boolean,
  extendEnd: boolean,
) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (Math.abs(dx) < 0.001 && (extendStart || extendEnd)) {
    ctx.beginPath();
    ctx.moveTo(x1, extendStart ? 0 : y1);
    ctx.lineTo(x1, extendEnd ? height : y2);
    return;
  }
  if (Math.abs(dx) < 0.001) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    return;
  }
  const slope = dy / dx;
  const startX = extendStart ? 0 : x1;
  const endX = extendEnd ? width : x2;
  ctx.beginPath();
  ctx.moveTo(startX, y1 + slope * (startX - x1));
  ctx.lineTo(endX, y1 + slope * (endX - x1));
}

export function drawPriceTag(ctx: CanvasRenderingContext2D, width: number, height: number, y: number, text: string, color: string) {
  ctx.font = `600 10px ${UI_FONT_FAMILY}`;
  const labelWidth = Math.max(48, ctx.measureText(text).width + 12);
  const labelX = Math.max(0, width - labelWidth - 4);
  const labelY = Math.max(2, Math.min(height - 18, y - 9));
  ctx.fillStyle = color;
  roundRect(ctx, labelX, labelY, labelWidth, 18, 4);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, labelX + labelWidth / 2, labelY + 9);
}

export function fillChannel(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, x4: number, y4: number) {
  ctx.save();
  ctx.globalAlpha = 0.08;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.lineTo(x3, y3);
  ctx.lineTo(x4, y4);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

export function drawUnifiedAnnotationWithLeader(
  ctx: CanvasRenderingContext2D,
  overlay: Overlay,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
) {
  const kind = overlay.annotation?.kind ?? 'text';
  ctx.save();

  let boxWidth = 50;
  let boxHeight = 24;
  let imgW = 0;
  let imgH = 0;
  let imgElement: HTMLImageElement | null = null;
  let text = '';

  if (kind === 'image') {
    const url = overlay.imageUrl || '';
    if (url) {
      if (!overlay._imageCache) {
        const img = new Image();
        img.src = url;
        img.onload = () => {
          overlay._imageCache = img;
        };
        overlay._imageCache = img;
      }
      imgElement = overlay._imageCache;
    }
    if (imgElement && imgElement.complete && imgElement.naturalWidth > 0) {
      const scale = Math.min(96 / imgElement.naturalWidth, 64 / imgElement.naturalHeight, 1);
      imgW = imgElement.naturalWidth * scale;
      imgH = imgElement.naturalHeight * scale;
      boxWidth = imgW + 10;
      boxHeight = imgH + 10;
    } else {
      boxWidth = 72;
      boxHeight = 44;
    }
  } else {
    text =
      overlay.text ||
      (kind === 'tag' && overlay.points[0]
        ? `$${Math.abs(overlay.points[0].value) >= 1000 ? Math.round(overlay.points[0].value).toLocaleString('en-US') : overlay.points[0].value.toFixed(2)}`
        : kind === 'arrow'
          ? 'Signal'
          : 'Note');
    ctx.font = `600 12px ${UI_FONT_FAMILY}`;
    const textW = ctx.measureText(text).width;
    boxWidth = Math.max(48, textW + 18);
    boxHeight = 24;
  }

  const halfW = boxWidth / 2;
  const halfH = boxHeight / 2;

  // Keep the label body clear of its anchor even when a caller supplies a
  // second point that is too close. Preserve its chosen direction and push
  // the box outward until its nearest edge has a consistent visual gap.
  let centerDx = x2 - x1;
  let centerDy = y2 - y1;
  let centerDistance = Math.hypot(centerDx, centerDy);
  if (centerDistance < 0.01) {
    centerDx = 0;
    centerDy = -1;
    centerDistance = 1;
  }
  const unitX = centerDx / centerDistance;
  const unitY = centerDy / centerDistance;
  const edgeDistance = Math.min(
    Math.abs(unitX) > 0.0001 ? halfW / Math.abs(unitX) : Infinity,
    Math.abs(unitY) > 0.0001 ? halfH / Math.abs(unitY) : Infinity,
  );
  const minimumCenterDistance = edgeDistance + LABEL_SAFE_GAP;
  if (centerDistance < minimumCenterDistance) {
    x2 = x1 + unitX * minimumCenterDistance;
    y2 = y1 + unitY * minimumCenterDistance;
  }

  // Calculate edge contact point on the badge box so dashed leader line stops cleanly at the outer perimeter
  const dx = x1 - x2;
  const dy = y1 - y2;
  let edgeX = x2;
  let edgeY = y2;

  if (Math.abs(dx) > 1e-4 || Math.abs(dy) > 1e-4) {
    const scaleX = Math.abs(dx) > 1e-4 ? halfW / Math.abs(dx) : Infinity;
    const scaleY = Math.abs(dy) > 1e-4 ? halfH / Math.abs(dy) : Infinity;
    const t = Math.min(scaleX, scaleY);
    edgeX = x2 + dx * t;
    edgeY = y2 + dy * t;
  }

  // 1. Dashed leader line strictly from anchor (x1, y1) to box edge (edgeX, edgeY)
  ctx.strokeStyle = overlay.color || '#2962ff';
  ctx.lineWidth = overlay.lineWidth || 1.5;
  ctx.setLineDash([4, 3]);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(edgeX, edgeY);
  ctx.stroke();
  ctx.setLineDash([]);

  // 2. A single compact anchor dot on the marked price point.
  ctx.fillStyle = overlay.color || '#2962ff';
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(x1, y1, 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // 4. Floating Badge / Tag Box with configurable background color & opacity
  const bx = x2 - halfW;
  const by = y2 - halfH;
  const bgColor = overlay.backgroundColor || overlay.color || '#2962ff';
  const bgOpacity = overlay.backgroundOpacity ?? overlay.opacity ?? 0.92;

  ctx.save();
  ctx.globalAlpha = bgOpacity;
  ctx.fillStyle = bgColor;
  roundRect(ctx, bx, by, boxWidth, boxHeight, 4);
  ctx.fill();
  ctx.restore();

  // Box border outline
  ctx.strokeStyle = overlay.color || '#2962ff';
  ctx.lineWidth = 1.2;
  roundRect(ctx, bx, by, boxWidth, boxHeight, 4);
  ctx.stroke();

  // 5. Content inside box
  if (kind === 'image') {
    if (imgElement && imgElement.complete && imgElement.naturalWidth > 0) {
      ctx.drawImage(imgElement, x2 - imgW / 2, y2 - imgH / 2, imgW, imgH);
    } else {
      ctx.fillStyle = '#ffffff';
      ctx.font = `400 10px ${UI_FONT_FAMILY}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(overlay.imageUrl ? 'Loading...' : 'No image', x2, y2);
    }
  } else {
    ctx.fillStyle = '#ffffff';
    ctx.font = `600 12px ${UI_FONT_FAMILY}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x2, y2);
  }

  ctx.restore();
}

export function isPointNearUnifiedLine(px: number, py: number, overlay: Overlay, transformer: CoordinateTransformer, dataStore: CoordinateDataSource, threshold: number) {
  const line = overlay.line ?? {};
  const width = transformer.getWidth();
  const height = transformer.getHeight();
  const p1 = overlay.points[0];
  const p2 = overlay.points[1] ?? overlay.points[0];
  const x1 = transformer.timestampToXUnbounded(p1.timestamp, dataStore);
  const y1 = transformer.priceToY(p1.value);
  const rawX2 = transformer.timestampToXUnbounded(p2.timestamp, dataStore);
  const rawY2 = transformer.priceToY(p2.value);
  const x2 = line.direction === 'vertical' ? x1 : rawX2;
  const y2 = line.direction === 'horizontal' ? y1 : rawY2;
  if (line.showPriceLabel || line.direction === 'horizontal') {
    const startX = line.extendStart ? 0 : x1;
    const endX = line.extendEnd ? width : x2;
    return Math.abs(py - y1) < threshold && px >= Math.min(startX, endX) - threshold && px <= Math.max(startX, endX) + threshold;
  }
  if (line.direction === 'vertical') {
    const startY = line.extendStart ? 0 : y1;
    const endY = line.extendEnd ? height : y2;
    return Math.abs(px - x1) < threshold && py >= Math.min(startY, endY) - threshold && py <= Math.max(startY, endY) + threshold;
  }
  const startX = line.extendStart ? 0 : x1;
  const endX = line.extendEnd ? width : x2;
  if (Math.abs(x2 - x1) < 0.001) return Math.abs(px - x1) < threshold;
  const slope = (y2 - y1) / (x2 - x1);
  const startY = y1 + slope * (startX - x1);
  const endY = y1 + slope * (endX - x1);
  return isPointNearLine(px, py, startX, startY, endX, endY, threshold);
}

export function drawHandles(ctx: CanvasRenderingContext2D, ...points: [number, number][]) {
  ctx.save();
  points.forEach(([x, y]) => {
    // Outer ring: semi-transparent white fill with blue stroke
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.strokeStyle = '#2962FF';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2); // reduced from 6 → 4px
    ctx.fill();
    ctx.stroke();
    // Inner dot
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = '#2962FF';
    ctx.beginPath();
    ctx.arc(x, y, 1.5, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;
  ctx.restore();
}

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
