/**
 * The crosshair on the main price pane: the cross itself, its labels on each
 * price axis, and the extension lines into the time rulers.
 */

import type { CoordinateTransformer } from '../engine/CoordinateTransformer';
import type { AxisLabelRenderer } from '../engine/decorationRenderer';
import type { PaneAxisSide } from '../engine/PaneManager';
import type { Axis } from '../engine/Axis';
import type { Bounding, KLineData } from '../types';
import type { ChromeRenderer } from './ChromeRenderer';
import { strokeCrosshairSegment, type CrosshairLineStyle } from './crosshairLines';

export interface CrosshairScale {
  id: string;
  side: PaneAxisSide;
  axisIndex: number;
  transformer: CoordinateTransformer;
}

export interface MainPaneCrosshairInput {
  canvases: {
    overlay: CanvasRenderingContext2D;
    leftAxisOverlay: CanvasRenderingContext2D;
    rightAxisOverlay: CanvasRenderingContext2D;
    topXOverlay: CanvasRenderingContext2D;
    /** Looked up lazily: the bottom ruler is only drawn on the bottom pane. */
    bottomXOverlay: () => CanvasRenderingContext2D;
  };
  scales: readonly CrosshairScale[];
  primaryTransformer: CoordinateTransformer;
  pane: { bounding: Bounding; width: number; height: number; isBottom: boolean };
  /** `topXAxisHeight` is the top ruler actually drawn (0 when off); `xAxisHeight` is one ruler's height. */
  geometry: { toolbarHeight: number; topXAxisHeight: number; xAxisHeight: number; leftYAxisWidth: number };
  /** Where the crosshair is, in chart coordinates, or null when it is not shown. */
  crosshair: { x: number; y: number } | null;
  style: CrosshairLineStyle & { visible: boolean };
  isHidden: (scaleId: string) => boolean;
  data: KLineData[];
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

export function renderMainPaneCrosshair(input: MainPaneCrosshairInput): void {
  const { canvases, pane, geometry, style, crosshair } = input;
  if (!style.visible || !crosshair) return;

  const localX = crosshair.x;
  const localY = crosshair.y - (pane.bounding.top - (geometry.toolbarHeight + geometry.topXAxisHeight));
  if (localY < 0 || localY > pane.height) return;

  input.chrome.drawCrosshair(canvases.overlay, pane.width, pane.height, { x: localX, y: localY });

  const line: CrosshairLineStyle = { color: style.color, style: style.style };
  const rulerBounds = { width: pane.width, height: geometry.xAxisHeight, left: geometry.leftYAxisWidth, top: 0 };
  const rulerX = localX + geometry.leftYAxisWidth;

  // Extend the horizontal line into each price column, labelled with its price.
  input.scales.forEach(scale => {
    if (input.isHidden(scale.id)) return;
    const axisOverlay = scale.side === 'left' ? canvases.leftAxisOverlay : canvases.rightAxisOverlay;
    input.withAxisColumn(axisOverlay, scale.side, scale.axisIndex, pane.height, axisBounds => {
      strokeCrosshairSegment(axisOverlay, line, { x: 0, y: localY }, { x: axisBounds.width, y: localY });
      input.yAxis.renderLabel(
        axisOverlay,
        localY,
        input.formatPrice(scale.transformer.yToPrice(localY)),
        axisBounds,
        scale.side,
      );
    });
  });

  // The top ruler always carries the vertical line; the time label is only on the bottom pane.
  strokeCrosshairSegment(canvases.topXOverlay, line, { x: rulerX, y: 0 }, { x: rulerX, y: geometry.xAxisHeight });

  if (pane.isBottom) {
    const index = Math.round(input.primaryTransformer.xToIndex(localX));
    const item = input.data[index];
    if (item) {
      const timeText = input.formatTime(item.timestamp);
      const bottomOverlay = canvases.bottomXOverlay();
      strokeCrosshairSegment(bottomOverlay, line, { x: rulerX, y: 0 }, { x: rulerX, y: geometry.xAxisHeight });
      input.xAxis.renderLabel(bottomOverlay, localX, timeText, rulerBounds, 'bottom');
      input.xAxis.renderLabel(canvases.topXOverlay, localX, timeText, rulerBounds, 'top');
    }
  }
}
