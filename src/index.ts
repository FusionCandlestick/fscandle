import { FusionCandlestickChart } from './FusionCandlestickChart';

export {
  FusionCandlestickChart,
  InvalidationLevel,
} from './FusionCandlestickChart';
export type {
  DrawingLayer,
  PaneApi,
  PriceScaleApi,
  SeriesApi,
  SeriesTarget,
  TimeScaleApi,
} from './FusionCandlestickChart';

export { FusionCandlestickChartComponent } from './components/charts/FusionCandlestickChartComponent';
export type { FusionCandlestickChartProps, StackedPricePaneInput } from './components/charts/FusionCandlestickChartComponent';

export { ChartSyncGroup } from './engine/ChartSyncGroup';
export { CoordinateTransformer } from './engine/CoordinateTransformer';
export type { PriceScaleMode } from './engine/CoordinateTransformer';
export { SeriesRegistry } from './engine/SeriesRegistry';
export type { BuiltInSeriesType, SeriesType } from './engine/SeriesRegistry';
export { BaseSeries } from './engine/BaseSeries';
export { CandlestickSeries } from './engine/CandlestickSeries';
export { HollowCandlestickSeries } from './engine/HollowCandlestickSeries';
export { HeikinAshiSeries } from './engine/HeikinAshiSeries';
export { BarSeries } from './engine/BarSeries';
export type { BarSeriesOptions } from './engine/BarSeries';
export { AreaSeries } from './engine/AreaSeries';
export type { AreaSeriesOptions } from './engine/AreaSeries';
export { LineSeries } from './engine/LineSeries';
export type { LineStyleOptions } from './engine/LineSeries';
export { StepLineSeries } from './engine/StepLineSeries';
export type { StepLineStyleOptions, StepLinePosition } from './engine/StepLineSeries';
export { CustomSeries } from './engine/CustomSeries';
export type { CustomSeriesDefinition, CustomSeriesRenderParams } from './engine/CustomSeries';
export { BaselineSeries } from './engine/BaselineSeries';
export type { BaselineSeriesOptions } from './engine/BaselineSeries';
export { VolumeSeries } from './engine/VolumeSeries';
export type { VolumeSeriesOptions } from './engine/VolumeSeries';

export { EventBus } from './engine/EventBus';
export type {
  ChartEventMap,
  ChartEventName,
  ChartEventHandler,
  ChartMouseEventParams,
  ChartSizeParams,
  DataChangeParams,
  LogicalRange,
  TimeRange,
  OverlayChangeParams,
  OverlayChangeReason,
} from './engine/EventBus';

export { PrimitiveManager } from './engine/PrimitiveManager';
export type {
  ChartPrimitive,
  PrimitiveAxisRenderParams,
  PrimitiveAxisRenderer,
  PrimitiveContext,
  PrimitiveHitTestCursor,
  PrimitiveHitTestResult,
  PrimitiveLayer,
  PrimitivePaneArea,
  PrimitivePaneRenderParams,
  PrimitivePaneRenderer,
  PrimitivePaneView,
  PrimitivePriceAxisView,
  PrimitiveTimeAxisPosition,
  PrimitiveTimeAxisRenderParams,
  PrimitiveTimeAxisRenderer,
  PrimitiveTimeAxisView,
} from './engine/Primitive';
export type {
  PanePointerTarget,
  PointerTargetArea,
  PrimitivePointerEventContext,
  PrimitivePointerPhase,
} from './engine/PointerEvents';

export { OverlayManager } from './engine/OverlayManager';
export type {
  Overlay,
  OverlayPoint,
  OverlayTemplate,
  OverlayFigureParams,
  OverlayDrawStep,
} from './engine/OverlayManager';
export {
  PriceLineRegistry,
  SeriesMarkerRegistry,
  placeMarkers,
  indexOfTimestamp,
  DEFAULT_PRICE_LINE,
  DEFAULT_MARKER,
  type PriceLineInput,
  type PriceLineOptions,
  type SeriesMarker,
  type SeriesMarkerInput,
  type MarkerPosition,
  type MarkerShape,
} from './model/seriesDecorations';
export { applyFigureStyleOverride, drawFigure, drawFigures, isPointInFigure, isPointInAnyFigure } from './engine/OverlayFigure';
export type {
  FigureStyleOverride,
  OverlayFigure,
  FigurePoint,
  FigureStyles,
  TextFigureStyles,
} from './engine/OverlayFigure';
export { OverlayPrimitive } from './engine/OverlayPrimitive';

export {
  Indicator,
  DEFAULT_INDICATOR_TEMPLATES,
  MATemplate,
  EMATemplate,
  BOLLTemplate,
  MACDTemplate,
  RSITemplate,
  KDJTemplate,
  WRTemplate,
  VOLMATemplate,
  ATRTemplate,
  ADXTemplate,
  ROCTemplate,
  CCITemplate,
  OBVTemplate,
  VWAPTemplate,
  StochasticRSITemplate,
  PSARTemplate,
} from './plugins/Indicator';
export type { IndicatorRenderParams, IndicatorTemplate } from './plugins/Indicator';
export { IndicatorManager } from './plugins/IndicatorManager';
export type { CreateIndicatorOptions } from './plugins/IndicatorManager';
export { AnchoredTextPrimitive } from './plugins/primitives/AnchoredTextPrimitive';
export type { AnchoredTextPrimitiveOptions } from './plugins/primitives/AnchoredTextPrimitive';

export {
  TimeFormatter,
  SESSION_PRESETS,
  defineSession,
  getSessionPreset,
  isWithinSession,
  nextSessionOpen,
  parseTimeOfDay,
  getSessionMinutesForWeekday,
  parsePeriod,
  formatPeriod,
  inferPeriod,
  periodToMilliseconds,
  periodToTickLevel,
  getZonedParts,
  getZonedMinuteOfDay,
  getTimeZoneOffsetMinutes,
  isNewDay,
  isNewMonth,
  isNewYear,
  resolvePeriodOption,
  resolveSessionOption,
} from './model';
export type {
  Period,
  PeriodType,
  TimeTickLevel,
  TradingSession,
  SessionSegment,
  ZonedParts,
  TimeFormatterConfig,
  AxisTickContext,
} from './model';

export {
  I18n,
  registerLocale,
  resolveLocale,
  getRegisteredLocales,
  FALLBACK_LOCALE,
  enUS,
} from './i18n';
export type { TranslationKey, TranslationDict, PartialTranslationDict } from './i18n';

export { DataStore } from './store/DataStore';
export type {
  Bounding,
  Figure,
  FigureStyleMap,
  IndicatorFigure,
  KLineData,
  Point,
  VisibleRange,
} from './types';
export type {
  CandlestickStyleOptions,
  ChartOptions,
  DeepPartial,
  LocalizationOptions,
  TimeScaleOptions,
} from './types/options';

export * from './datafeed';

export function createChart(
  container: HTMLDivElement,
  options: import('./types/options').DeepPartial<import('./types/options').ChartOptions> = {},
) {
  return new FusionCandlestickChart(container, options);
}
