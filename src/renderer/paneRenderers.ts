import type { Axis } from '../engine/Axis';
import type { BaseSeries } from '../engine/BaseSeries';
import type { CoordinateTransformer } from '../engine/CoordinateTransformer';
import { renderLastPriceLine, renderPriceLineLabels, renderPriceLines, renderSeriesMarkers } from '../engine/decorationRenderer';
import type { PaneAxisSide } from '../engine/PaneManager';
import type { PrimitiveLayer, PrimitiveTimeAxisPosition } from '../engine/Primitive';
import type { PaneFrame } from '../model/renderFrame';
import type { PriceLineOptions, SeriesMarker } from '../model/seriesDecorations';
import type { TradingSession } from '../model/session';
import type { DataStore } from '../store/DataStore';
import type { Bounding, KLineData } from '../types';
import type { ChartOptions } from '../types/options';
import { renderSeriesValueTags } from './axisTags';
import type { ChromeRenderer } from './ChromeRenderer';
import { renderIndicatorCrosshair } from './indicatorCrosshair';
import { renderMainPaneCrosshair } from './mainPaneCrosshair';
import { renderSeriesBeacons } from './seriesBeacons';
import { renderSessionSeparators } from './sessionSeparators';

/**
 * Drawing one pane for one frame.
 *
 * The chart decides what a frame needs (which panes, at which level) and sets
 * each pane's scale; these functions only draw, from what they are given. The
 * chart reaches them through a host, the same shape the GUI widgets use, so
 * what drawing depends on is written down in one place.
 */

/** The canvases one pane draws into: its plot layers and the two price gutters. */
export interface PaneContexts {
  chart: CanvasRenderingContext2D;
  grid: CanvasRenderingContext2D;
  overlay: CanvasRenderingContext2D;
  leftAxisGrid: CanvasRenderingContext2D;
  leftAxisOverlay: CanvasRenderingContext2D;
  rightAxisGrid: CanvasRenderingContext2D;
  rightAxisOverlay: CanvasRenderingContext2D;
}

/** Which parts of a pane this frame redraws, from the invalidation levels. */
export interface PaneRedraw {
  /** The shared time rulers (the frame's level, not the pane's). */
  rulers: boolean;
  /** Grid, axes, series and indicators. */
  body: boolean;
  /** The overlay layer: drawings and primitive overlays. */
  cursor: boolean;
}

/** A price scale ready to draw: its series and data, where its column is, and its transformer. */
export interface DrawnPriceScale {
  id: string;
  series: BaseSeries;
  data: KLineData[];
  side: PaneAxisSide;
  axisIndex: number;
  isPrimary: boolean;
  transformer: CoordinateTransformer;
}

/** What drawing any pane needs from the chart. */
export interface PaneDrawHost {
  options: Readonly<ChartOptions>;
  chrome: ChromeRenderer;
  yAxis: Axis;
  xAxis: Axis;
  geometry: {
    toolbarHeight: number;
    topXAxisHeight: number;
    bottomXAxisHeight: number;
    xAxisHeight: number;
    leftYAxisWidth: number;
  };
  /** A time ruler's canvas context for a layer, whether or not the ruler is shown. */
  rulerContext(position: 'top' | 'bottom', layer: 'grid' | 'overlay'): CanvasRenderingContext2D;
  drawPaneViews(ctx: CanvasRenderingContext2D, paneId: string, layer: PrimitiveLayer, bounding: Bounding, viewport: Bounding, transformer: CoordinateTransformer): void;
  drawPriceAxisViews(ctx: CanvasRenderingContext2D, paneId: string, side: PaneAxisSide, axisIndex: number, bounding: Bounding, transformer: CoordinateTransformer): void;
  drawPriceColumn(ctx: CanvasRenderingContext2D, side: PaneAxisSide, axisIndex: number, height: number, transformer: CoordinateTransformer): void;
  withAxisColumn(ctx: CanvasRenderingContext2D, side: PaneAxisSide, axisIndex: number, height: number, draw: (bounds: Bounding) => void): void;
  renderIndicators(paneId: string, params: { ctx: CanvasRenderingContext2D; transformer: CoordinateTransformer; bounding: Bounding; dataList: KLineData[] }): void;
  formatPrice(price: number): string;
  formatCrosshairTime(timestamp: number): string;
}

function crosshairStyle(options: Readonly<ChartOptions>) {
  return { visible: options.crosshair.visible, color: options.crosshair.color, style: options.crosshair.style };
}

export interface IndicatorPaneDrawInput {
  paneFrame: PaneFrame;
  redraw: PaneRedraw;
  contexts: PaneContexts;
  data: KLineData[];
  /** This pane's transformer, with its range already set. */
  transformer: CoordinateTransformer;
  /** Draws a custom pane's body; a no-op for an indicator pane. */
  drawCustomBody(ctx: CanvasRenderingContext2D): void;
}

/** An indicator or custom pane: its axis, indicators or custom body, primitives and crosshair. */
export function drawIndicatorPane(input: IndicatorPaneDrawInput, host: PaneDrawHost): void {
  const { paneFrame, redraw, contexts, data, transformer } = input;
  const { id: paneId, bounding, plotWidth: realWidth, plotHeight: realHeight, axisSide: paneSide } = paneFrame;
  const { chart: ctx, grid: gridCtx, overlay: overlayCtx } = contexts;
  const axisGridCtx = paneSide === 'left' ? contexts.leftAxisGrid : contexts.rightAxisGrid;
  const axisOverlayCtx = paneSide === 'left' ? contexts.leftAxisOverlay : contexts.rightAxisOverlay;
  const viewport = { ...bounding, width: realWidth };

  if (redraw.body) {
    // Grid rendering is handled by GridPrimitive.
    host.drawPaneViews(gridCtx, paneId, 'grid', bounding, viewport, transformer);

    if (host.options.axis.visible !== false) {
      host.drawPriceColumn(axisGridCtx, paneSide, 0, realHeight, transformer);
    }

    host.renderIndicators(paneId, { ctx, transformer, bounding: viewport, dataList: data });
    input.drawCustomBody(ctx);
    host.drawPaneViews(ctx, paneId, 'main', bounding, viewport, transformer);
  }

  if (redraw.cursor) {
    host.drawPaneViews(overlayCtx, paneId, 'overlay', bounding, viewport, transformer);
  }

  // Whether the crosshair is in this pane, and where, is the frame's answer.
  const crosshair = paneFrame.crosshair;
  if (crosshair) {
    const { geometry } = host;
    renderIndicatorCrosshair({
      overlay: overlayCtx,
      axisOverlay: axisOverlayCtx,
      side: paneSide,
      isLast: paneFrame.isLast,
      transformer,
      crosshair,
      realWidth,
      realHeight,
      xAxisHeight: geometry.xAxisHeight,
      leftYAxisWidth: geometry.leftYAxisWidth,
      style: crosshairStyle(host.options),
      data,
      topRuler: geometry.topXAxisHeight > 0 ? host.rulerContext('top', 'overlay') : null,
      bottomRuler: geometry.bottomXAxisHeight > 0 ? host.rulerContext('bottom', 'overlay') : null,
      chrome: host.chrome,
      yAxis: host.yAxis,
      xAxis: host.xAxis,
      withAxisColumn: (ctx, side, axisIndex, height, draw) => host.withAxisColumn(ctx, side, axisIndex, height, draw),
      formatPrice: price => host.formatPrice(price),
      formatTime: timestamp => host.formatCrosshairTime(timestamp),
    });
  }

  host.withAxisColumn(axisOverlayCtx, paneSide, 0, realHeight, axisBounds => {
    host.drawPriceAxisViews(axisOverlayCtx, paneId, paneSide, 0, axisBounds, transformer);
  });
}

/** What drawing the main price pane needs beyond any pane. */
export interface PricePaneDrawHost extends PaneDrawHost {
  dataStore: DataStore;
  /** The chart's shared transformer, which the extremes are measured against. */
  mainTransformer: CoordinateTransformer;
  series: readonly BaseSeries[];
  mainSeries: BaseSeries | null;
  hidden: ReadonlySet<string>;
  priceLines: PriceLineOptions[];
  markers: SeriesMarker[];
  session: TradingSession | null;
  crosshair: { x: number; y: number } | null;
  secondarySeries(): BaseSeries[];
  drawTimeAxisViews(ctx: CanvasRenderingContext2D, position: PrimitiveTimeAxisPosition, bounding: Bounding, transformer: CoordinateTransformer): void;
  renderDualAxisTags(contexts: PaneContexts, primaryScale: { transformer: CoordinateTransformer }, data: KLineData[], height: number): void;
  renderLastPriceTag(ctx: CanvasRenderingContext2D, bounding: Bounding, scaleId: string, side: PaneAxisSide, transformer: CoordinateTransformer): void;
}

export interface PricePaneDrawInput {
  paneFrame: PaneFrame;
  /** Width of the whole chart, for the extremes' label placement. */
  frameWidth: number;
  redraw: PaneRedraw;
  contexts: PaneContexts;
  data: KLineData[];
  /** Scales with data, in column order. */
  priceScales: readonly DrawnPriceScale[];
  primaryScale: DrawnPriceScale;
}

/**
 * The main price pane: time rulers, watermark and session separators, price
 * columns, every series, decorations, primitives, indicators drawn on price,
 * the crosshair, and the axis tags.
 */
export function drawPricePane(input: PricePaneDrawInput, host: PricePaneDrawHost): void {
  const { paneFrame, redraw, contexts, data, priceScales, primaryScale } = input;
  const { id: paneId, bounding, plotWidth: realWidth, plotHeight: realHeight } = paneFrame;
  const { chart: ctx, grid: gridCtx, overlay: overlayCtx } = contexts;
  const { options, geometry } = host;
  const viewport = { ...bounding, width: realWidth };
  const rulerBounds = { width: realWidth, height: geometry.xAxisHeight, left: geometry.leftYAxisWidth, top: 0 };

  // The rulers are shared, so they follow the frame's level, not this pane's.
  if (options.timeScale.visible !== false && redraw.rulers) {
    if (geometry.topXAxisHeight > 0) {
      host.xAxis.render(host.rulerContext('top', 'grid'), primaryScale.transformer, rulerBounds, 'top', host.dataStore);
    }
    if (geometry.bottomXAxisHeight > 0) {
      host.xAxis.render(host.rulerContext('bottom', 'grid'), primaryScale.transformer, rulerBounds, 'bottom', host.dataStore);
    }
  }

  if (redraw.body) {
    host.chrome.drawWatermark(gridCtx, realWidth, realHeight);
    renderSessionSeparators(gridCtx, options.timeScale.sessionSeparator, host.session, data, realWidth, realHeight, primaryScale.transformer);
    // Grid rendering is handled by GridPrimitive.
    host.drawPaneViews(gridCtx, paneId, 'grid', bounding, viewport, primaryScale.transformer);

    if (options.axis.visible !== false) {
      if (options.axis.dual) {
        // Left: e.g. percentage; right: e.g. price.
        host.drawPriceColumn(contexts.leftAxisGrid, 'left', 0, realHeight, primaryScale.transformer);
        host.drawPriceColumn(contexts.rightAxisGrid, 'right', 0, realHeight, primaryScale.transformer);
      } else {
        priceScales.forEach(scale => {
          if (host.hidden.has(scale.id)) return;
          const axisGridCtx = scale.side === 'left' ? contexts.leftAxisGrid : contexts.rightAxisGrid;
          host.drawPriceColumn(axisGridCtx, scale.side, scale.axisIndex, realHeight, scale.transformer);
        });
      }
    }

    priceScales.forEach(scale => {
      if (host.hidden.has(scale.id)) return;
      scale.series.render(ctx, scale.transformer);
    });

    host.series
      .filter(series => series !== host.mainSeries)
      .forEach(series => series.render(ctx, primaryScale.transformer));

    renderSeriesBeacons(ctx, host.series, primaryScale.transformer, realWidth, realHeight);

    if (options.axis.lastPriceLineVisible !== false) {
      renderLastPriceLine(ctx, realWidth, primaryScale.transformer, data);
    }
    renderPriceLines(ctx, realWidth, primaryScale.transformer, host.priceLines);
    renderSeriesMarkers(ctx, data, primaryScale.transformer, host.markers, options.layout.fontFamily);
    if (options.axis.showExtremes !== false) {
      host.chrome.drawExtremes(ctx, {
        data,
        transformer: host.mainTransformer,
        chartWidth: input.frameWidth,
        formatPrice: price => host.formatPrice(price),
      });
    }
    host.drawPaneViews(ctx, paneId, 'main', bounding, viewport, primaryScale.transformer);

    host.renderIndicators(paneId, { ctx, transformer: primaryScale.transformer, bounding: viewport, dataList: data });
  }

  if (redraw.cursor) {
    host.drawPaneViews(overlayCtx, paneId, 'overlay', bounding, viewport, primaryScale.transformer);
    if (geometry.topXAxisHeight > 0) {
      host.drawTimeAxisViews(host.rulerContext('top', 'overlay'), 'top', rulerBounds, primaryScale.transformer);
    }
    if (geometry.bottomXAxisHeight > 0) {
      host.drawTimeAxisViews(host.rulerContext('bottom', 'overlay'), 'bottom', rulerBounds, primaryScale.transformer);
    }
  }

  renderMainPaneCrosshair({
    canvases: {
      overlay: overlayCtx,
      leftAxisOverlay: contexts.leftAxisOverlay,
      rightAxisOverlay: contexts.rightAxisOverlay,
      topXOverlay: host.rulerContext('top', 'overlay'),
      bottomXOverlay: () => host.rulerContext('bottom', 'overlay'),
    },
    scales: priceScales,
    primaryTransformer: primaryScale.transformer,
    pane: { bounding, width: realWidth, height: realHeight, isBottom: paneFrame.isLast },
    geometry: { toolbarHeight: geometry.toolbarHeight, topXAxisHeight: geometry.topXAxisHeight, xAxisHeight: geometry.xAxisHeight, leftYAxisWidth: geometry.leftYAxisWidth },
    crosshair: host.crosshair,
    style: crosshairStyle(options),
    isHidden: id => host.hidden.has(id),
    data,
    chrome: host.chrome,
    yAxis: host.yAxis,
    xAxis: host.xAxis,
    withAxisColumn: (ctx, side, axisIndex, height, draw) => host.withAxisColumn(ctx, side, axisIndex, height, draw),
    formatPrice: price => host.formatPrice(price),
    formatTime: timestamp => host.formatCrosshairTime(timestamp),
  });

  if (options.axis.visible !== false) {
    if (options.axis.dual) {
      host.renderDualAxisTags(contexts, primaryScale, data, realHeight);
    } else {
      priceScales.forEach(scale => {
        if (host.hidden.has(scale.id)) return;
        const axisOverlayCtx = scale.side === 'left' ? contexts.leftAxisOverlay : contexts.rightAxisOverlay;
        host.withAxisColumn(axisOverlayCtx, scale.side, scale.axisIndex, realHeight, axisBounds => {
          host.renderLastPriceTag(axisOverlayCtx, axisBounds, scale.id, scale.side, scale.transformer);
          if (scale.isPrimary) {
            renderPriceLineLabels(axisOverlayCtx, axisBounds, scale.side, scale.transformer, host.priceLines, host.yAxis, price => host.formatPrice(price));
            renderSeriesValueTags(axisOverlayCtx, host.yAxis, axisBounds, scale.transformer, host.secondarySeries(), {
              side: scale.side,
              fallbackColor: '#2962ff',
              text: close => host.formatPrice(close),
            });
          }
          host.drawPriceAxisViews(axisOverlayCtx, paneId, scale.side, scale.axisIndex, axisBounds, scale.transformer);
        });
      });
    }
  }
}
