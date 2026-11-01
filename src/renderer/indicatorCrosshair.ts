/**
 * The crosshair on an indicator pane: the cross, its value on the pane's price
 * column, and the extension lines into whichever time rulers exist.
 */

import type { CoordinateTransformer } from '../engine/CoordinateTransformer';
import type { AxisLabelRenderer } from '../engine/decorationRenderer';
import type { PaneAxisSide } from '../engine/PaneManager';
import type { Axis } from '../engine/Axis';
import type { Bounding, KLineData } from '../types';
import type { ChromeRenderer } from './ChromeRenderer';
import { strokeCrosshairSegment, type CrosshairLineStyle } from './crosshairLines';

export interface IndicatorCrosshairInput {
  /** The pane's own overlay canvas, where the cross is drawn. */
  overlay: CanvasRenderingContext2D;
  /** The price column on this pane's side, where the value is labelled. */
  axisOverlay: CanvasRenderingContext2D;
  side: PaneAxisSide;
  /** Only the bottom indicator pane carries the time label. */
  isLast: boolean;
  transformer: CoordinateTransformer;
  crosshair: { x: number; y: number };
  realWidth: number;
  realHeight: number;
  xAxisHeight: number;
  leftYAxisWidth: number;
  style: CrosshairLineStyle & { visible: boolean };
  data: KLineData[];
  /** The rulers, when they are present. A ruler that is absent is not drawn on. */
  topRuler: CanvasRenderingContext2D | null;
  bottomRuler: CanvasRenderingContext2D | null;
  chrome: Pick<ChromeRenderer, 'drawCrosshair'>;
  yAxis: AxisLabelRenderer;
  xAxis: Pick<Axis, 'renderLabel'>;
  withAxisColumn: (
    ctx: CanvasRenderingContext2D,
    side: PaneAxisSide,
    axisIndex: number,
    height: number,
    draw: (bounds: Bounding) => void,
  ) => void;
  formatPrice: (price: number) => string;
  formatTime: (timestamp: number) => string;
}

export function renderIndicatorCrosshair(input: IndicatorCrosshairInput): void {
  const { crosshair, style } = input;
  if (!style.visible) return;

  input.chrome.drawCrosshair(input.overlay, input.realWidth, input.realHeight, crosshair);
  const line: CrosshairLineStyle = { color: style.color, style: style.style };

  // Extend the horizontal line into the price column.
  input.withAxisColumn(input.axisOverlay, input.side, 0, input.realHeight, axisBounds => {
    strokeCrosshairSegment(input.axisOverlay, line, { x: 0, y: crosshair.y }, { x: axisBounds.width, y: crosshair.y });
    input.yAxis.renderLabel(
      input.axisOverlay,
      crosshair.y,
      input.formatPrice(input.transformer.yToPrice(crosshair.y)),
      axisBounds,
      input.side,
    );
  });

  if (!input.isLast) return;
  const index = Math.round(input.transformer.xToIndex(crosshair.x));
  const item = input.data[index];
  if (!item) return;

  const timeText = input.formatTime(item.timestamp);
  const rulerX = crosshair.x + input.leftYAxisWidth;
  const rulerBounds = { width: input.realWidth, height: input.xAxisHeight, left: input.leftYAxisWidth, top: 0 };

  if (input.bottomRuler) {
    strokeCrosshairSegment(input.bottomRuler, line, { x: rulerX, y: 0 }, { x: rulerX, y: input.xAxisHeight });
    input.xAxis.renderLabel(input.bottomRuler, crosshair.x, timeText, rulerBounds, 'bottom');
  }
  if (input.topRuler) {
    strokeCrosshairSegment(input.topRuler, line, { x: rulerX, y: 0 }, { x: rulerX, y: input.xAxisHeight });
    input.xAxis.renderLabel(input.topRuler, crosshair.x, timeText, rulerBounds, 'top');
  }
}
