import type {
  FusionCandlestickChart,
  InvalidationLevel,
  PaneApi,
  PriceScaleApi,
  SeriesApi,
  TimeScaleApi,
} from '../FusionCandlestickChart';
import type { Bounding } from '../types';
import type { CoordinateTransformer } from './CoordinateTransformer';
import type { PrimitivePointerEventContext } from './PointerEvents';

export type PrimitiveLayer = 'grid' | 'main' | 'overlay';
export type PrimitivePaneArea = 'chart' | 'leftYAxis' | 'rightYAxis';
export type PrimitiveTimeAxisPosition = 'top' | 'bottom';
export type PrimitiveHitTestCursor = 'default' | 'crosshair' | 'pointer' | 'move' | 'grab' | 'grabbing' | 'ew-resize' | 'ns-resize';

export interface PrimitivePaneRenderParams {
  chart: FusionCandlestickChart;
  paneId: string;
  layer: PrimitiveLayer;
  area: PrimitivePaneArea;
  bounding: Bounding;
  viewport: Bounding;
  transformer: CoordinateTransformer;
  timeScale: TimeScaleApi;
  priceScale: PriceScaleApi;
  series: SeriesApi;
}

export interface PrimitiveAxisRenderParams {
  chart: FusionCandlestickChart;
  paneId: string;
  side: 'left' | 'right';
  axisIndex: number;
  bounding: Bounding;
  transformer: CoordinateTransformer;
  priceScale: PriceScaleApi;
}

export interface PrimitiveTimeAxisRenderParams {
  chart: FusionCandlestickChart;
  position: PrimitiveTimeAxisPosition;
  bounding: Bounding;
  transformer: CoordinateTransformer;
  timeScale: TimeScaleApi;
}

export interface PrimitivePaneRenderer {
  draw: (ctx: CanvasRenderingContext2D, params: PrimitivePaneRenderParams) => void;
}

export interface PrimitiveAxisRenderer {
  draw: (ctx: CanvasRenderingContext2D, params: PrimitiveAxisRenderParams) => void;
}

export interface PrimitiveTimeAxisRenderer {
  draw: (ctx: CanvasRenderingContext2D, params: PrimitiveTimeAxisRenderParams) => void;
}

export interface PrimitivePaneView {
  paneId?: string;
  layer?: PrimitiveLayer;
  area?: PrimitivePaneArea;
  zOrder?: number;
  renderer: () => PrimitivePaneRenderer;
}

export interface PrimitivePriceAxisView {
  paneId?: string;
  side?: 'left' | 'right';
  axisIndex?: number;
  zOrder?: number;
  renderer: () => PrimitiveAxisRenderer;
}

export interface PrimitiveTimeAxisView {
  position?: PrimitiveTimeAxisPosition;
  zOrder?: number;
  renderer: () => PrimitiveTimeAxisRenderer;
}

export interface PrimitiveHitTestResult {
  id?: string;
  cursor?: PrimitiveHitTestCursor;
  externalId?: string;
  zOrder?: number;
  metadata?: Record<string, unknown>;
}

export interface PrimitiveContext {
  chart: FusionCandlestickChart;
  timeScale: TimeScaleApi;
  priceScale: PriceScaleApi;
  series: SeriesApi;
  pane: PaneApi;
  requestUpdate: (level?: InvalidationLevel) => void;
  coordinateToLogical: (x: number) => number;
  logicalToCoordinate: (logicalIndex: number) => number;
  coordinateToTimestamp: (x: number) => number | null;
  timestampToCoordinate: (timestamp: number) => number;
}

export interface ChartPrimitive {
  id: string;
  attached?: (context: PrimitiveContext) => void;
  detached?: () => void;
  update?: (level: InvalidationLevel) => void;
  paneViews?: () => PrimitivePaneView[];
  priceAxisViews?: () => PrimitivePriceAxisView[];
  timeAxisViews?: () => PrimitiveTimeAxisView[];
  hitTest?: (context: PrimitivePointerEventContext) => PrimitiveHitTestResult | null;
  onPointerDown?: (context: PrimitivePointerEventContext, hit: PrimitiveHitTestResult | null) => boolean | void;
  onPointerMove?: (context: PrimitivePointerEventContext, hit: PrimitiveHitTestResult | null) => boolean | void;
  onPointerUp?: (context: PrimitivePointerEventContext, hit: PrimitiveHitTestResult | null) => boolean | void;
}

export interface PrimitiveDrawPaneRequest {
  ctx: CanvasRenderingContext2D;
  paneId: string;
  layer: PrimitiveLayer;
  area: PrimitivePaneArea;
  bounding: Bounding;
  viewport: Bounding;
  transformer: CoordinateTransformer;
}

export interface PrimitiveDrawPriceAxisRequest {
  ctx: CanvasRenderingContext2D;
  paneId: string;
  side: 'left' | 'right';
  axisIndex: number;
  bounding: Bounding;
  transformer: CoordinateTransformer;
}

export interface PrimitiveDrawTimeAxisRequest {
  ctx: CanvasRenderingContext2D;
  position: PrimitiveTimeAxisPosition;
  bounding: Bounding;
  transformer: CoordinateTransformer;
}

export const primitivePointerPhaseToMethod: Record<
  import('./PointerEvents').PrimitivePointerPhase,
  'onPointerDown' | 'onPointerMove' | 'onPointerUp'
> = {
  pointerDown: 'onPointerDown',
  pointerMove: 'onPointerMove',
  pointerUp: 'onPointerUp',
};
