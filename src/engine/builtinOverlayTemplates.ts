/**
 * The overlay templates the chart ships with: lines, channels, annotations,
 * waves, rectangles, Fibonacci retracements and measures.
 */

import type { KLineData } from '../types';
import type { OverlayTemplate } from './overlayTypes';
import { UI_FONT_FAMILY } from '../model/fontFamily';
import {
  bandHitFigures,
  channelHitFigures,
  labelHitFigures,
  lineHitFigures,
  rectangleHitFigures,
  waveHitFigures,
} from './overlayHitFigures';
import {
  LABEL_SAFE_GAP,
  drawHandles,
  drawLinePath,
  drawPriceTag,
  drawUnifiedAnnotationWithLeader,
  fillChannel,
  fillWaveTriangles,
  getCoordinates,
  roundRect,
} from './overlayDrawing';

export function createBuiltinOverlayTemplates(): OverlayTemplate[] {
  const templates: OverlayTemplate[] = [];
  // ── unified line ───────────────────────────────────────────────────────
  templates.push({
    type: 'line',
    createHitFigures: lineHitFigures,
    render: (ctx, overlay, transformer, dataStore) => {
      const line = overlay.line ?? {};
      const direction = line.direction ?? 'free';
      const extendStart = line.extendStart ?? false;
      const extendEnd = line.extendEnd ?? false;
      const showPriceLabel = line.showPriceLabel ?? false;
      const width = transformer.getWidth();
      const height = transformer.getHeight();
      const p1 = overlay.points[0];
      const p2 = overlay.points[1] ?? overlay.points[0];
      const x1 = transformer.timestampToXUnbounded(p1.timestamp, dataStore);
      const y1 = transformer.priceToY(p1.value);
      const rawX2 = transformer.timestampToXUnbounded(p2.timestamp, dataStore);
      const rawY2 = transformer.priceToY(p2.value);
      const x2 = direction === 'vertical' ? x1 : rawX2;
      const y2 = direction === 'horizontal' ? y1 : rawY2;

      ctx.save();
      if (showPriceLabel) ctx.setLineDash([5, 4]);
      drawLinePath(ctx, x1, y1, x2, y2, width, height, extendStart, extendEnd);
      ctx.stroke();
      if (showPriceLabel) {
        ctx.setLineDash([]);
        drawPriceTag(ctx, width, height, y1, p1.value.toFixed(2), overlay.color);
      }
      ctx.restore();

      if (overlay.points.length > 1 && !showPriceLabel) {
        drawHandles(ctx, [x1, y1], [x2, y2]);
      } else {
        drawHandles(ctx, [x1, y1]);
      }
    }
  });

  // ── unified channel ────────────────────────────────────────────────────
  templates.push({
    type: 'channel',
    createHitFigures: channelHitFigures,
    render: (ctx, overlay, transformer, dataStore) => {
      if (overlay.points.length < 2) return;
      const mode = overlay.channel?.mode ?? 'parallel';
      const { x1, y1, x2, y2 } = getCoordinates(overlay, transformer, dataStore);
      const width = transformer.getWidth();
      let x3 = x1;
      let y3 = y1;
      if (overlay.points.length >= 3) {
        x3 = transformer.timestampToXUnbounded(overlay.points[2].timestamp, dataStore);
        y3 = transformer.priceToY(overlay.points[2].value);
      }
      if (mode === 'price') {
        const slope = Math.abs(x2 - x1) < 0.001 ? 0 : (y2 - y1) / (x2 - x1);
        const baseLeft = y1 - slope * x1;
        const baseRight = y1 + slope * (width - x1);
        const lineDx = x2 - x1;
        const lineDy = y2 - y1;
        const lineLength = Math.hypot(lineDx, lineDy) || 1;
        const normalX = -lineDy / lineLength;
        const normalY = lineDx / lineLength;
        const normalDistance = (x3 - x1) * normalX + (y3 - y1) * normalY;
        const shiftX = normalX * normalDistance;
        const shiftY = normalY * normalDistance;
        const translatedLeft = baseLeft + shiftY - slope * shiftX;
        const translatedRight = baseRight + shiftY - slope * shiftX;
        ctx.beginPath(); ctx.moveTo(0, baseLeft); ctx.lineTo(width, baseRight); ctx.stroke();
        if (overlay.points.length >= 3) {
          ctx.beginPath();
          ctx.moveTo(0, translatedLeft);
          ctx.lineTo(width, translatedRight);
          ctx.stroke();
          fillChannel(ctx, 0, baseLeft, width, baseRight, width, translatedRight, 0, translatedLeft);
          ctx.setLineDash([5, 5]);
          ctx.beginPath(); ctx.moveTo(0, (baseLeft + translatedLeft) / 2); ctx.lineTo(width, (baseRight + translatedRight) / 2); ctx.stroke();
          ctx.setLineDash([]);
        }
        drawHandles(ctx, [x1, y1], [x2, y2], ...(overlay.points.length >= 3 ? [[x3, y3] as [number, number]] : []));
        return;
      }

      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      if (overlay.points.length >= 3) {
        const lineDx = x2 - x1;
        const lineDy = y2 - y1;
        const lineLength = Math.hypot(lineDx, lineDy) || 1;
        const normalX = -lineDy / lineLength;
        const normalY = lineDx / lineLength;
        const normalDistance = (x3 - x1) * normalX + (y3 - y1) * normalY;
        const ox = normalX * normalDistance;
        const oy = normalY * normalDistance;
        const x4 = x2 + ox;
        const y4 = y2 + oy;
        ctx.beginPath();
        ctx.moveTo(x1 + ox, y1 + oy);
        ctx.lineTo(x4, y4);
        ctx.stroke();
        fillChannel(ctx, x1, y1, x2, y2, x4, y4, x1 + ox, y1 + oy);
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(x1 + ox / 2, y1 + oy / 2);
        ctx.lineTo(x2 + ox / 2, y2 + oy / 2);
        ctx.stroke();
        ctx.setLineDash([]);
        drawHandles(ctx, [x1, y1], [x2, y2], [x3, y3]);
      } else {
        drawHandles(ctx, [x1, y1], [x2, y2]);
      }
    }
  });

  // ── unified annotation ─────────────────────────────────────────────────
  templates.push({
    type: 'annotation',
    createHitFigures: labelHitFigures,
    render: (ctx, overlay, transformer, dataStore, isSelected) => {
      const x = transformer.timestampToXUnbounded(overlay.points[0].timestamp, dataStore);
      const y = transformer.priceToY(overlay.points[0].value);
      if (overlay.annotation?.placement === 'bottom') {
        const width = transformer.getWidth();
        const height = transformer.getHeight();
        const markerY = height - 8;
        ctx.save();
        ctx.strokeStyle = overlay.color;
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 4]);
        ctx.beginPath();
        ctx.moveTo(x, Math.min(height, y + 5));
        ctx.lineTo(x, markerY - 5);
        ctx.stroke();
        ctx.setLineDash([]);
        // Default is just the axis marker + leader; the label pops on click,
        // sitting right above the marker so it stays on the time axis.
        if (isSelected) {
          ctx.fillStyle = 'rgba(2, 6, 23, 0.58)';
          ctx.fillRect(0, 0, width, height);
          const labelOffset = overlay.annotation.kind === 'image' ? 70 : 48;
          drawUnifiedAnnotationWithLeader(ctx, overlay, x, markerY, x, markerY - labelOffset);
        }
        ctx.fillStyle = overlay.color;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(x, markerY, isSelected ? 4 : 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
        return;
      }
      if (overlay.points.length >= 2) {
        const p2 = overlay.points[1];
        const x2 = transformer.timestampToXUnbounded(p2.timestamp, dataStore);
        const y2 = transformer.priceToY(p2.value);
        drawUnifiedAnnotationWithLeader(ctx, overlay, x, y, x2, y2);
        drawHandles(ctx, [x, y]);
      } else {
        const kind = overlay.annotation?.kind ?? 'text';
        const defaultOffset = kind === 'arrow' ? 44 : kind === 'image' ? -58 : -44;
        drawUnifiedAnnotationWithLeader(ctx, overlay, x, y, x, y + defaultOffset);
        drawHandles(ctx, [x, y]);
      }
    }
  });

  // ── Elliott / harmonic wave patterns ─────────────────────────────────
  templates.push({
    type: 'wave',
    createHitFigures: waveHitFigures,
    render: (ctx, overlay, transformer, dataStore) => {
      const kind = overlay.wave?.kind ?? 'three';
      const points = overlay.points.map(point => ({
        x: transformer.timestampToXUnbounded(point.timestamp, dataStore),
        y: transformer.priceToY(point.value),
      }));
      if (points.length < 2) return;

      ctx.save();
      ctx.lineWidth = overlay.lineWidth;
      ctx.strokeStyle = overlay.color;
      ctx.fillStyle = overlay.color;

      fillWaveTriangles(ctx, points, kind, overlay.color);

      ctx.beginPath();
      points.forEach((point, index) => {
        if (index === 0) ctx.moveTo(point.x, point.y);
        else ctx.lineTo(point.x, point.y);
      });

      if (kind === 'abcde' && points.length >= 5) {
        ctx.closePath();
        ctx.globalAlpha = 0.04;
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      ctx.stroke();

      const labels = kind === 'five'
        ? ['0', '1', '2', '3', '4', '5']
        : kind === 'three'
          ? ['0', '1', '2', '3']
          : ['A', 'B', 'C', 'D', 'E'];
      ctx.font = `600 10px ${UI_FONT_FAMILY}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      points.forEach((point, index) => {
        const label = labels[index] ?? String(index + 1);
        const neighbourY = index === 0
          ? points[1]?.y ?? point.y
          : index === points.length - 1
            ? points[index - 1]?.y ?? point.y
            : ((points[index - 1]?.y ?? point.y) + (points[index + 1]?.y ?? point.y)) / 2;
        const yOffset = point.y <= neighbourY
          ? -(9 + LABEL_SAFE_GAP)
          : 9 + LABEL_SAFE_GAP;
        ctx.fillStyle = overlay.color;
        roundRect(ctx, point.x - 10, point.y + yOffset - 9, 20, 18, 4);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.fillText(label, point.x, point.y + yOffset);
      });
      ctx.restore();
      drawHandles(ctx, ...points.map(point => [point.x, point.y] as [number, number]));
    },
  });


  // ── rectangle ───────────────────────────────────────────────────────────
  templates.push({
    type: 'rectangle',
    createHitFigures: rectangleHitFigures,
    render: (ctx, overlay, transformer, dataStore) => {
      const { x1, y1, x2, y2 } = getCoordinates(overlay, transformer, dataStore);
      // A rectangle is a zone: it needs enough fill to read as filled area,
      // not just an outline that looks like every other line tool.
      ctx.globalAlpha = 0.16;
      ctx.fillRect(x1, y1, x2 - x1, y2 - y1);
      ctx.globalAlpha = 1.0;
      ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
      drawHandles(ctx, [x1, y1], [x2, y2]);
    }
  });

  // ── fibonacci ───────────────────────────────────────────────────────────
  templates.push({
    type: 'fibonacci',
    createHitFigures: bandHitFigures,
    render: (ctx, overlay, transformer, dataStore) => {
      if (overlay.points.length < 2) return;
      const { x1, y1, x2, y2 } = getCoordinates(overlay, transformer, dataStore);
      const levels = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
      const diffY = y2 - y1;
      const diffVal = overlay.points[1].value - overlay.points[0].value;
      const fibColors = ['#F44336','#FF9800','#FFC107','#4CAF50','#2196F3','#9C27B0','#F44336'];

      // A label is skipped when it would collide with the last one, so a
      // tight retracement stays readable.
      let lastLabelY = -Infinity;
      levels.forEach((level, i) => {
        const ly = y1 + diffY * level;
        const lval = overlay.points[0].value + diffVal * level;
        ctx.save();
        ctx.strokeStyle = fibColors[i % fibColors.length];
        ctx.globalAlpha = 0.8;
        ctx.setLineDash([3, 4]);
        ctx.beginPath();
        ctx.moveTo(x1, ly);
        ctx.lineTo(x2, ly);
        ctx.stroke();
        ctx.setLineDash([]);
        if (Math.abs(ly - lastLabelY) >= 12) {
          ctx.globalAlpha = 1;
          ctx.fillStyle = fibColors[i % fibColors.length];
          ctx.font = `400 10px ${UI_FONT_FAMILY}`;
          ctx.textBaseline = 'middle';
          ctx.fillText(`${lval.toFixed(2)} (${(level * 100).toFixed(1)}%)`, Math.min(x1, x2) + 4, ly);
          ctx.textBaseline = 'alphabetic';
          lastLabelY = ly;
        }
        ctx.restore();
      });
      drawHandles(ctx, [x1, y1], [x2, y2]);
    }
  });


  // ── measure ─────────────────────────────────────────────────────────────
  templates.push({
    type: 'measure',
    createHitFigures: rectangleHitFigures,
    render: (ctx, overlay, transformer, dataStore) => {
      if (overlay.points.length < 2) return;
      const { x1, y1, x2, y2 } = getCoordinates(overlay, transformer, dataStore);
      const p1 = overlay.points[0]; const p2 = overlay.points[1];
      const priceDiff = p2.value - p1.value;
      const pricePct = (priceDiff / Math.abs(p1.value)) * 100;
      const data = dataStore.getData();
      const idx1 = data.findIndex((d: KLineData) => d.timestamp === p1.timestamp);
      const idx2 = data.findIndex((d: KLineData) => d.timestamp === p2.timestamp);
      const barCount = Math.abs(idx2 - idx1);
      const color = overlay.color || '#2962FF';
      ctx.save();
      ctx.globalAlpha = 0.1;
      ctx.fillStyle = color;
      ctx.fillRect(x1, y1, x2 - x1, y2 - y1);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = color;
      ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
      const sign = priceDiff >= 0 ? '+' : '';
      const text = `${sign}${priceDiff.toFixed(2)} (${sign}${pricePct.toFixed(2)}%)  ·  ${barCount} bars`;
      ctx.font = `600 10px ${UI_FONT_FAMILY}`;
      const tw = ctx.measureText(text).width;
      const bx = (x1 + x2) / 2;
      const belowBox = Math.max(y1, y2) + 18;
      const by = belowBox + 12 < transformer.getHeight() ? belowBox : Math.min(y1, y2) - 8;
      ctx.fillStyle = color;
      ctx.fillRect(bx - tw / 2 - 6, by - 11, tw + 12, 16);
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.fillText(text, bx, by);
      ctx.textAlign = 'left';
      ctx.restore();
      drawHandles(ctx, [x1, y1], [x2, y2]);
    }
  });



  return templates;
}
