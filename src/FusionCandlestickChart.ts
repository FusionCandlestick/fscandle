import { KLineData, Bounding } from './types';
import { Pane } from './engine/Pane';
import { CoordinateTransformer, PriceScaleMode } from './engine/CoordinateTransformer';
import { DataStore } from './store/DataStore';
import { PERSISTED_STATE_VERSION, parsePersistedState } from './store/persistence';
import { PriceScaleModel } from './model/PriceScaleModel';
import { StackedPriceScales } from './engine/StackedPriceScales';
import { PaneTransformers } from './engine/PaneTransformers';
import { AxisLayoutModel } from './model/AxisLayoutModel';
import { CreateIndicatorOptions, IndicatorManager } from './plugins/IndicatorManager';
import { 
    Indicator, EMATemplate, BOLLTemplate, RSITemplate,
    KDJTemplate, WRTemplate, VOLMATemplate, IndicatorTemplate
} from './plugins/Indicator';
import { BaseSeries } from './engine/BaseSeries';
import { CandlestickSeries } from './engine/CandlestickSeries';
import { AreaSeries } from './engine/AreaSeries';
import { BarSeries } from './engine/BarSeries';
import { LineSeries } from './engine/LineSeries';
import { StepLineSeries, StepLineStyleOptions } from './engine/StepLineSeries';
import { BaselineSeries } from './engine/BaselineSeries';
import { VolumeSeries, VolumeSeriesOptions } from './engine/VolumeSeries';
import { HollowCandlestickSeries } from './engine/HollowCandlestickSeries';
import { HeikinAshiSeries } from './engine/HeikinAshiSeries';
import { OverlayManager, Overlay, OverlayPoint, OverlayTemplate } from './engine/OverlayManager';
import { OverlayPrimitive } from './engine/OverlayPrimitive';
import { Axis } from './engine/Axis';
import { cloneOptionTree, mergeOptionTree } from './model/optionTree';
import { findUnknownOptionPaths } from './model/optionSchema';
import { assignPriceScaleColumns } from './model/priceScaleLayout';
import { priceFormatOptions } from './model/priceFormat';
import { PriceExtentCache } from './model/priceExtent';
import { visibleIndexRange } from './model/visibleRange';
import {
  PriceLineRegistry,
  SeriesMarkerRegistry,
  placeMarkers,
  type PriceLineInput,
  type PriceLineOptions,
  type SeriesMarker,
  type SeriesMarkerInput,
} from './model/seriesDecorations';
import type { FigureStyleOverride } from './engine/OverlayFigure';
import type { ChartSurfaceLayout } from './model/pointerRegions';
import { CandlestickStyleOptions, ChartOptions, defaultOptions, DeepPartial } from './types/options';
import { ChartSyncGroup } from './engine/ChartSyncGroup';
import { EventController } from './engine/EventController';
import { PaneManager } from './engine/PaneManager';
import { InvalidationState } from './model/invalidation';
import { buildChartFrame, type ChartFrame, type PaneFrame } from './model/renderFrame';
import { findSessionBoundaries } from './model/sessionSeparators';
import { InteractionController, type InteractionHost } from './engine/InteractionController';
import { ChartStore } from './store/ChartStore';
import { PrimitiveManager } from './engine/PrimitiveManager';
import type { ChartPrimitive, PrimitivePaneArea, PrimitiveLayer, PrimitiveTimeAxisPosition } from './engine/Primitive';
import { SeriesRegistry, SeriesType } from './engine/SeriesRegistry';
import type { CustomSeriesDefinition } from './engine/CustomSeries';
import { GridPrimitive } from './engine/GridPrimitive';
import { PrimitivePointerEventContext, PrimitivePointerPhase, PointerTargetArea } from './engine/PointerEvents';
import {
  Period,
  TradingSession,
  TimeFormatter,
  inferPeriod,
  resolvePeriodOption,
  resolveSessionOption,
} from './model';
import { I18n } from './i18n';
import type { TranslationKey } from './i18n';
import type { ToolbarWidget } from './gui/ToolbarWidget';
import type { DataTooltipWidget } from './gui/DataTooltipWidget';
import type { SeriesStyleMenu } from './gui/SeriesStyleMenu';
import type { SeriesStyleMenuHost } from './gui/SeriesStyleMenu';
import type { DataTooltipHost } from './gui/DataTooltipWidget';
import type { ToolbarHost, ToolbarContentItem } from './gui/types';
import type { LegendWidget } from './gui/LegendWidget';
import type {
  LegendHost,
  LegendIndicatorEntry,
  LegendPaneContent,
  LegendSeriesEntry,
  LegendSeriesKind,
} from './gui/LegendWidget';
import {
  clampPriceScaleState,
  getMinimumBarSpacing,
  getPaddedPriceRange,
} from './model/priceScaleMath';
import { ChromeRenderer } from './renderer/ChromeRenderer';
import { getAxisRailColors, isLightColor } from './renderer/colors';
import { EventBus } from './engine/EventBus';
import type {
  ChartEventHandler,
  ChartEventName,
  ChartMouseEventParams,
  ChartSizeParams,
  DataChangeParams,
  LogicalRange,
  OverlayChangeParams,
  OverlayChangeReason,
  TimeRange,
} from './engine/EventBus';

type PaneAxisSide = 'left' | 'right';

/**
 * The canvases one pane draws into: its plot layers and the two price gutters.
 * Gathered once per pane per frame instead of seven `getContext` calls and a
 * seven-way null check inline in the render pass.
 */
interface PaneContexts {
  chart: CanvasRenderingContext2D;
  grid: CanvasRenderingContext2D;
  overlay: CanvasRenderingContext2D;
  leftAxisGrid: CanvasRenderingContext2D;
  leftAxisOverlay: CanvasRenderingContext2D;
  rightAxisGrid: CanvasRenderingContext2D;
  rightAxisOverlay: CanvasRenderingContext2D;
}
type ConfigurablePriceSeriesStyle = 'candle' | 'bar' | 'area' | 'line' | 'step' | 'baseline' | 'hollow' | 'ha';

/** A price scale resolved against a plot size, ready to be drawn. */
type PriceScaleFrame = PriceScaleDescriptor & ReturnType<FusionCandlestickChart['_createPriceScaleTransformer']>;

interface StackedPaneConfig {
  id?: string;
  data: KLineData[];
  side?: PaneAxisSide;
  style?: ConfigurablePriceSeriesStyle;
  weight?: number;
  options?: Record<string, unknown>;
}

interface PriceScaleDescriptor {
  id: string;
  series: BaseSeries;
  data: KLineData[];
  side: PaneAxisSide;
  axisIndex: number;
  yScale: number;
  yOffset: number;
  isPrimary: boolean;
}

interface SeriesColorOptions {
  upColor?: string;
  downColor?: string;
  borderUpColor?: string;
  borderDownColor?: string;
  lineColor?: string;
  topColor?: string;
}

export interface TimeScaleApi {
  logicalToCoordinate: (logicalIndex: number) => number;
  coordinateToLogical: (x: number) => number;
  timestampToCoordinate: (timestamp: number) => number;
  coordinateToTimestamp: (x: number) => number | null;
  getVisibleLogicalRange: () => { from: number; to: number };
  setVisibleLogicalRange: (range: { from: number; to: number }) => void;
  subscribeVisibleLogicalRangeChange: (callback: (range: { from: number; to: number }) => void) => () => void;
  scrollToLatest: () => void;
}

export interface PriceScaleApi {
  getMode: () => PriceScaleMode;
  setMode: (mode: PriceScaleMode) => void;
  getInvertScale: () => boolean;
  setInvertScale: (inverted: boolean) => void;
  priceToCoordinate: (price: number) => number;
  coordinateToPrice: (coordinate: number) => number;
}

/**
 * Which series an option call is aimed at: the main price series, or a stacked
 * price scale by id.
 */
export type SeriesTarget = 'main' | string;

export interface SeriesApi {
  getData: () => KLineData[];
  setData: (data: KLineData[]) => void;
  updateData: (data: KLineData) => void;
  setChartStyle: (type: ConfigurablePriceSeriesStyle) => void;
  removeAt: (index: number) => void;
  /**
   * Current style options of one series.
   *
   * Returns a copy, and `null` when the target does not exist -- an id for a
   * scale that has been removed is a question, not an error.
   */
  options: (target?: SeriesTarget) => Record<string, unknown> | null;
  /**
   * Apply style options to one series.
   *
   * Per-series styling was reachable only from the built-in style menu, through
   * the GUI host contract; integration code had to change chart-wide options
   * and hope. Returns whether the target was found.
   */
  applyOptions: (target: SeriesTarget, options: Record<string, unknown>) => boolean;
}

export interface PaneApi {
  ids: () => string[];
  weights: () => number[];
  setWeights: (weights: number[]) => void;
  getBounding: (paneId: string) => Bounding | null;
}

export interface DrawingDefaults {
  color: string;
  lineWidth: number;
}

export interface DrawingLayer {
  id: string;
  name: string;
  overlays: Overlay[];
  createdAt: number;
  updatedAt: number;
}

const CONFIGURABLE_PRICE_SERIES_STYLES: ReadonlySet<ConfigurablePriceSeriesStyle> = new Set([
  'candle',
  'bar',
  'area',
  'line',
  'step',
  'baseline',
  'hollow',
  'ha',
]);

/**
 * Apply a partial option tree onto the current one.
 *
 * Shape-driven rather than schema-driven: this used to spell out every nested
 * group by hand, which meant a new option family was shallow-merged -- setting
 * one of its fields deleted its siblings -- until someone remembered to add a
 * branch here. See `mergeOptionTree`.
 */
function mergeChartOptions(base: ChartOptions, overrides: DeepPartial<ChartOptions> = {}): ChartOptions {
  return mergeOptionTree(base, overrides);
}

/**
 * Rendering invalidation levels to optimize performance.
 */
export enum InvalidationLevel {
  None = 0,
  Cursor = 1,   // Only crosshair/tooltips
  Overlay = 2,  // Drawings + crosshair
  Light = 3,    // All canvases redraw but no re-scale
  Full = 4,     // Full recalculation and redraw
}

/**
 * FusionCandlestickChart: A synthesized, high-performance financial charting engine.
 * Combines the layered rendering of TradingView with a primitive-based extension model.
 */
export class FusionCandlestickChart {
  private _container: HTMLDivElement;
  /**
   * Panes, read from their owner. `PaneManager` caches the list, so this is a
   * field read rather than an allocation on each render pass.
   */
  private get _panes(): Pane[] {
    return this._paneManager.panes();
  }

  private _paneManager: PaneManager;
  private _options: ChartOptions;
  private _dataStore: DataStore = new DataStore();
  private _chartStore: ChartStore = new ChartStore();
  private _primitiveManager: PrimitiveManager;
  private _indicatorManager: IndicatorManager = new IndicatorManager();
  private _coordinateTransformer: CoordinateTransformer = new CoordinateTransformer();
  /**
   * The transformer each pane draws and hit-tests through.
   *
   * Sub-panes used to share `_coordinateTransformer` with the main pane, which
   * meant the shared instance carried the last-rendered pane's price range for
   * the rest of the frame — see PaneTransformers.
   */
  private _paneTransformers: PaneTransformers = new PaneTransformers(
    this._coordinateTransformer,
    transformer => {
      transformer.attachPriceScale(this._priceScale);
      transformer.setRightMarginRatio(this._rightMarginRatio);
    },
  );
  /** The pane a hit test was last prepared for; overlay lookups read it. */
  private _hitTestTransformer: CoordinateTransformer | null = null;
  private _overlayManager: OverlayManager = new OverlayManager();
  private _series: BaseSeries[] = [];
  /**
   * Overlay price scales stacked beside the main one.
   *
   * This was five maps keyed by the same pane id — series, data, axis
   * placement, viewport, rendered transformer — so adding or removing a scale
   * meant touching all five and the transformer map had already drifted out of
   * step. One registry of one entity replaces them.
   */
  private _stackedScales = new StackedPriceScales();
  private _hiddenSeriesIds: Set<string> = new Set();
  private _mainSeries: BaseSeries | null = null;
  // Assigned via _recreateAxes() in the constructor.
  private _xAxis!: Axis;
  private _yAxis!: Axis;

  // Time semantics
  private _period: Period | null = null;
  private _session: TradingSession | null = null;
  private _timeFormatter: TimeFormatter = new TimeFormatter({ locale: 'en-US' });
  private _i18n: I18n = new I18n();
  private _chrome: ChromeRenderer = new ChromeRenderer(() => this._options);
  
  /**
   * Gestures, as their own layer.
   *
   * Pan, scale, pinch, divider resize, overlay drag and click detection were
   * ~500 lines of pointer handling in this class, sharing its fields with the
   * render pass. They now live in `InteractionController` and reach the chart
   * through an explicit host, which is what makes them testable without a
   * canvas.
   */
  private _interaction!: InteractionController;
  private _offset: number = 20; // Default offset to show right margin
  private _barSpacing: number = 10;
  private _rightMarginRatio: number = 0.05;
  private _crosshairPos: { x: number, y: number } | null = null;
  private _hoveredData: KLineData | null = null;
  /** Index `_hoveredData` was set from. A hint, not a guarantee: verified by
   * identity against the current data before use, since the data can change
   * under a stale hover. */
  private _hoveredIndex: number | null = null;
  private _selectedOverlay: Overlay | null = null;
  private _lastRenderedDataRef: KLineData[] | null = null;
  
  // Drawing State
  private _activeDrawingType: string | null = null;
  private _isCreatingOverlay: boolean = false;
  private _drawingOverlay: Overlay | null = null;
  private _drawingFixedPointCount: number = 0;
  private _drawingDefaults: DrawingDefaults = { color: '#2962FF', lineWidth: 2 };
  private _drawingLayers: DrawingLayer[] = [{
    id: 'layer_default',
    name: 'Layer 1',
    overlays: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }];
  private _activeDrawingLayerId: string = 'layer_default';
  private _magnetMode: boolean = true;

  /**
   * Owner of the main price scale's mode, inversion, and vertical viewport.
   *
   * These were four fields here, mirrored into `_coordinateTransformer` after
   * every mutation. The model owns the values and their bounds; this class
   * still decides when to repaint and still clamps the viewport against pane
   * geometry, which the model has no business knowing about. The `_yScale` and
   * `_yOffset` accessors below keep the existing call sites reading naturally
   * while the state itself lives in one place.
   */
  private _priceScale = new PriceScaleModel();
  /** Global price extent of the current dataset, recomputed only when it changes. */
  private _priceExtent = new PriceExtentCache();
  /** Caller-owned horizontal lines with price-axis labels. */
  private _priceLines = new PriceLineRegistry();
  /** Caller-owned per-bar glyphs, addressed by timestamp. */
  private _seriesMarkers = new SeriesMarkerRegistry();
  private _isDestroyed: boolean = false;

  /** Vertical zoom. Reads and writes go through `_priceScale`, which clamps. */
  private get _yScale(): number {
    return this._priceScale.scale;
  }

  private set _yScale(scale: number) {
    this._priceScale.scale = scale;
  }

  /** Vertical pan in pixels; the pane clamp still runs in `_normalizeMainPaneViewport`. */
  private get _yOffset(): number {
    return this._priceScale.offset;
  }

  private set _yOffset(offset: number) {
    this._priceScale.offset = offset;
  }

  private _updateRequestId: number | null = null;
  /**
   * What has to be redrawn, per pane.
   *
   * A single chart-wide level meant adding an indicator to the RSI pane
   * repainted the price pane, its stacked scales and both time rulers.
   */
  private _invalidation = new InvalidationState(InvalidationLevel.None, InvalidationLevel.Full);
  
  // Resizing State
  /**
   * Pane weights, read from their owner.
   *
   * This was a second copy of `PaneManager`'s array, kept in step by
   * re-assigning it after anything that might have replaced it. Because
   * `weights()` handed out the internal array, the copy was really an alias,
   * and the divider drag mutated manager state through it — until `setWeights`
   * swapped the array and the alias went stale. Reads come from the manager
   * now; writes go through `setWeights` / `resizePair`.
   */
  private get _paneWeights(): number[] {
    return this._paneManager.weights();
  }
  /** Pane dividers, read from their owner. */
  private get _dividers(): HTMLDivElement[] {
    return this._paneManager.dividers();
  }

  /**
   * Owner of the price-axis gutter geometry: column width, column counts, and
   * the arithmetic that reads them back (plot width, axis hit testing, column
   * bounds). Column counts stay the chart's decision — they depend on which
   * price scales are visible — but the geometry derived from them lives here.
   */
  private _axisLayout = new AxisLayoutModel(55, 3);

  /** Width of one axis column. Kept as an accessor for the existing call sites. */
  private get _yAxisWidth(): number {
    return this._axisLayout.columnWidth;
  }
  /** Column cap, owned by the axis layout so it cannot drift from the geometry. */
  private get _maxYAxisColumnsPerSide(): number {
    return this._axisLayout.maxColumnsPerSide;
  }
  private _maxOverlayPriceScales = 5;
  private _xAxisHeight = 22;
  private get _topXHeight(): number {
    if (this._options.timeScale.visible === false) return 0;
    const position = (this._options.timeScale as { position?: 'top' | 'bottom' | 'both' }).position;
    return (position === 'top' || position === 'both') ? this._xAxisHeight : 0;
  }
  private get _bottomXHeight(): number {
    if (this._options.timeScale.visible === false) return 0;
    const position = (this._options.timeScale as { position?: 'top' | 'bottom' | 'both' }).position;
    return position === 'top' ? 0 : this._xAxisHeight;
  }
  private _topXAxisCanvases: Map<string, HTMLCanvasElement> = new Map();
  private _bottomXAxisCanvases: Map<string, HTMLCanvasElement> = new Map();
  private get _leftYAxisWidth(): number {
    return this._axisLayout.leftWidth;
  }

  private get _rightYAxisWidth(): number {
    return this._axisLayout.rightWidth;
  }
  private _toolbarHeight: number = 0;

  // DOM Elements
  private _toolbar: ToolbarWidget | null = null;
  /** The gesture surface, owned by the interaction layer that listens on it. */
  private get _eventLayer(): HTMLDivElement | null {
    return this._interaction?.element() ?? null;
  }
  private _updateRequested: boolean = false;
  /** Pane a vertical gesture applies to; the interaction layer decides it. */
  private get _activePricePaneId(): string {
    return this._interaction?.activePricePaneId() ?? 'main';
  }
  private get _activeYAxisPaneId(): string | null {
    return this._interaction?.activeYAxisPaneId() ?? null;
  }
  /** Per-pane legend elements, read from their owner. */
  private get _legendDOMs(): Map<string, HTMLDivElement> {
    return this._paneManager.legends();
  }

  private _seriesStyleMenu: SeriesStyleMenu | null = null;
  /** Null when `gui.legend` is off; the widget is only built if it is on. */
  private _legendWidget: LegendWidget | null = null;
  private _dataTooltip: DataTooltipWidget | null = null;
  
  // Sync
  private _syncGroup: ChartSyncGroup | null = null;
  private _remoteCrosshairPos: { x: number, y: number } | null = null;

  // History for Undo/Redo
  private _history: string[] = [];
  private _redoStack: string[] = [];
  private _maxHistory: number = 50;

  // Resize detection
  private _resizeObserver: ResizeObserver | null = null;
  private _eventController: EventController = new EventController();
  private _unsubscribeDataStore: (() => void) | null = null;
  private _visibleLogicalRangeSubscribers: Set<(range: { from: number; to: number }) => void> = new Set();
  private _lastVisibleLogicalRange: { from: number; to: number } | null = null;
  private _events: EventBus = new EventBus();
  private _lastEmittedSize: { width: number; height: number } | null = null;

  private _syncChartStore() {
    this._chartStore.replace({
      viewport: {
        offset: this._offset,
        barSpacing: this._barSpacing,
        yScale: this._yScale,
        yOffset: this._yOffset,
      },
      interaction: {
        crosshairPos: this._crosshairPos,
        hoveredData: this._hoveredData,
        activeDrawingType: this._activeDrawingType,
        magnetMode: this._magnetMode,
        activePricePaneId: this._activePricePaneId,
        activeYAxisPaneId: this._activeYAxisPaneId,
      },
      paneWeights: this._paneWeights,
    });
  }

  /**
   * Initialize a new FusionCandlestickChart instance.
   * @param container The DOM element to house the chart.
   * @param options Partial chart configuration.
   */
  constructor(container: HTMLDivElement, options: DeepPartial<ChartOptions> = {}) {
    this._container = container;
    // Attached once. Every transformer this chart builds shares this model, so
    // mode and inversion are read rather than pushed after each change.
    this._coordinateTransformer.attachPriceScale(this._priceScale);
    this._options = mergeChartOptions(defaultOptions, options);
    this._rightMarginRatio = this._resolveRightMarginRatio(this._options.timeScale.rightMargin);
    // Chart-wide, so every pane's transformer hears about it, not just the main one.
    this._paneTransformers.forEach(transformer => transformer.setRightMarginRatio(this._rightMarginRatio));
    this._xAxisHeight = this._options.timeScale.visible === false ? 0 : 22;
    // Resolve the locale before any DOM is built — the toolbar is constructed
    // further down and reads translated labels at creation time.
    this._i18n.setLocale(this._options.localization.locale);

    this._container.style.position = 'relative';
    this._container.style.backgroundColor = this._options.layout.background.color;
    this._container.style.userSelect = 'none';
    this._container.style.touchAction = 'none';
    this._container.style.overflow = 'hidden';
    this._paneManager = new PaneManager(this._container, this._options.panes);
    this._interaction = new InteractionController(this._createInteractionHost(), this._eventController);
    this._paneManager.onDividerPointerDown((index, event) =>
      this._interaction.beginDividerDrag(index, event.clientY),
    );
    this._indicatorManager.setStyles(this._options.indicators);

    this._primitiveManager = new PrimitiveManager(this, {
      chart: this,
      timeScale: this.timeScale(),
      priceScale: this.priceScale(),
      series: this.series(),
      pane: this.pane(),
      requestUpdate: level => this.update(level),
      coordinateToLogical: x => this.coordinateToLogical(x),
      logicalToCoordinate: logicalIndex => this.logicalToCoordinate(logicalIndex),
      coordinateToTimestamp: x => this.coordinateToTimestamp(x),
      timestampToCoordinate: timestamp => this.timestampToCoordinate(timestamp),
    });
    this._primitiveManager.attach(new OverlayPrimitive(this._overlayManager, this._dataStore, () => this._selectedOverlay));
    this._primitiveManager.attach(new GridPrimitive());
    
    void this._mountToolbar();

    this._refreshTimeSemantics();
    this._recreateAxes();

    this.addPane('main');
    this._handleResize = this._layout.bind(this);

    void this._mountGuiWidgets();
    this._unsubscribeDataStore = this._dataStore.subscribe(() => this.update());
    
    // Load persisted state
    this.loadState();
    
    this._layout();
    
    // Set initial offset for right margin
    this._coordinateTransformer.setOffset(this._offset);
    
    this._eventController.on(window, 'resize', this._handleResize);
    this._resizeObserver = new ResizeObserver(() => this._layout());
    this._resizeObserver.observe(this._container);
    this._interaction.mount();
  }

  private _applyYTransform() {
    // Mode and inversion are read from the attached price scale, so only the
    // vertical viewport — which is per-scale — has to be pushed.
    this._coordinateTransformer.setYScale(this._yScale);
    this._coordinateTransformer.setYOffset(this._yOffset);
  }

  private _getMainPaneConstraints(data: KLineData[]) {
    if (data.length === 0) return null;

    // Cached against the data array: this is read once per price scale per
    // frame, and rebuilding it each time was the single most expensive thing a
    // pan did. See PriceExtentCache.
    const extent = this._priceExtent.extentOf(data);
    if (!extent) return null;

    const { min: globalMin, max: globalMax } = extent;
    const fallbackRange = Math.max(Math.abs(globalMax), Math.abs(globalMin), 1) * 0.01;
    const hardMin = 0;
    const hardMax = globalMax * 2;
    const hardSpan = Math.max(hardMax - hardMin, fallbackRange);
    const maxVisibleRange = hardSpan;

    return { globalMin, globalMax, hardMin, hardMax, maxVisibleRange };
  }

  /**
   * The data indices visible across `width` pixels of `transformer`, clamped
   * to the data. Shared by every "scan the visible bars" pass, so the
   * index-from-pixel clamp is written once.
   */
  private _visibleIndexRange(transformer: CoordinateTransformer, width: number, dataLength: number): { leftIdx: number; rightIdx: number } {
    return {
      leftIdx: Math.max(0, Math.floor(transformer.xToIndex(0))),
      rightIdx: Math.min(dataLength - 1, Math.ceil(transformer.xToIndex(width))),
    };
  }

  private _getVisibleMainPaneRange(realWidth: number, data: KLineData[], transformer: CoordinateTransformer = this._coordinateTransformer) {
    let min = Infinity;
    let max = -Infinity;
    const { leftIdx, rightIdx } = this._visibleIndexRange(transformer, realWidth, data.length);

    for (let i = leftIdx; i <= rightIdx; i++) {
      if (data[i]) {
        min = Math.min(min, data[i].low);
        max = Math.max(max, data[i].high);
      }
    }

    for (const s of this._series) {
      if (s === this._mainSeries) continue;
      const sData = s.getData();
      if (sData.length === 0) continue;
      const range = this._visibleIndexRange(transformer, realWidth, sData.length);
      for (let i = range.leftIdx; i <= range.rightIdx; i++) {
        const item = sData[i];
        if (item) {
          min = Math.min(min, item.low ?? item.close);
          max = Math.max(max, item.high ?? item.close);
        }
      }
    }

    if (!Number.isFinite(min) || !Number.isFinite(max)) {
      const constraints = this._getMainPaneConstraints(data);
      if (constraints) return { min: constraints.globalMin, max: constraints.globalMax };
      return { min: 0, max: 100 };
    }

    return { min, max };
  }

  private _clampMainPaneTransform(baseMin: number, baseMax: number, height: number, constraints: { hardMin: number; hardMax: number; maxVisibleRange: number }) {
    const state = { yScale: this._yScale, yOffset: this._yOffset };
    const changed = clampPriceScaleState(baseMin, baseMax, height, constraints, state);
    this._yScale = state.yScale;
    this._yOffset = state.yOffset;
    return changed;
  }

  private _getVisiblePriceBounds(transformer: CoordinateTransformer, height: number) {
    const topPrice = transformer.yToPrice(0);
    const bottomPrice = transformer.yToPrice(height);
    return {
      min: Math.min(topPrice, bottomPrice),
      max: Math.max(topPrice, bottomPrice),
    };
  }

  private _normalizePaneWeights() {
    this._paneManager.normalizeWeights();

  }

  /**
   * Every price scale resolved against a plot size: its transformer, its
   * visible range, and the vertical viewport that fell out of clamping.
   *
   * This is the "what to draw" half of a render pass, and it touches no canvas.
   * Keeping it separate is what lets the same answer be committed once and then
   * drawn -- and lets anything else that needs a transformer ask for the frame
   * rather than build a private one, which is what the axis hit test used to do.
   */
  private _buildPriceScaleFrames(realWidth: number, realHeight: number): PriceScaleFrame[] {
    return this._getPriceScaleDescriptors().map(descriptor => ({
      ...descriptor,
      ...this._createPriceScaleTransformer(descriptor, realWidth, realHeight),
    }));
  }

  /**
   * Write back what building the frame derived: the clamped viewport of each
   * scale, and the transformer the next hit test will read.
   *
   * Scales with no data are committed too. They still own a viewport, and
   * dropping their state on an empty tick would make a scale forget its zoom
   * whenever its series briefly has nothing to show.
   */
  private _commitPriceScaleFrames(frames: PriceScaleFrame[]): void {
    for (const frame of frames) {
      if (frame.isPrimary) {
        this._yScale = frame.yScale;
        this._yOffset = frame.yOffset;
      } else {
        this._getStackedPaneState(frame.id).setViewport({
          yScale: frame.yScale,
          yOffset: frame.yOffset,
        });
      }
      const stacked = this._stackedScales.get(frame.id);
      if (stacked) stacked.transformer = frame.transformer;
    }
  }

  private _createPriceScaleTransformer(descriptor: PriceScaleDescriptor, realWidth: number, realHeight: number) {
    const transformer = new CoordinateTransformer();
    // The right margin is chart-wide and has to be copied onto every scale's
    // transformer. Without this each price scale kept the class default of 0.2,
    // so a chart configured with `timeScale.rightMargin: 0` reported one x from
    // `logicalToCoordinate` (this chart's transformer, margin honoured) and drew
    // its series at another (the scale's, margin 0.2) -- a line asked to fill
    // its container stopped at 80% of it.
    transformer.setRightMarginRatio(this._rightMarginRatio);
    transformer.setDimensions(realWidth, realHeight);
    transformer.setBarSpacing(this._barSpacing);
    transformer.setOffset(this._offset);
    // Mode and inversion are chart-wide: attach the same model rather than
    // copying its values, so a transformer created after a mode change cannot
    // be born stale.
    transformer.attachPriceScale(this._priceScale);

    const visibleRange = this._getVisibleMainPaneRange(realWidth, descriptor.data, transformer);
    const paddedRange = getPaddedPriceRange(visibleRange.min, visibleRange.max);
    const nextState = { yScale: descriptor.yScale, yOffset: descriptor.yOffset };
    const constraints = this._getMainPaneConstraints(descriptor.data);

    if (constraints) {
      clampPriceScaleState(paddedRange.min, paddedRange.max, realHeight, constraints, nextState);
    }

    transformer.setRange(paddedRange.min, paddedRange.max);
    transformer.setYScale(nextState.yScale);
    transformer.setYOffset(nextState.yOffset);

    return {
      transformer,
      visibleRange,
      yScale: nextState.yScale,
      yOffset: nextState.yOffset,
    };
  }

  private _normalizeMainPaneViewport() {
    const data = this._dataStore.getData();
    const mainPane = this._panes.find(pane => pane.getId() === 'main');
    const constraints = this._getMainPaneConstraints(data);

    if (!mainPane || !constraints) {
      this._applyYTransform();
      return false;
    }

    const bounding = mainPane.getBounding();
    const realWidth = bounding.width - this._rightYAxisWidth - this._leftYAxisWidth;
    const realHeight = bounding.height;
    if (realWidth <= 0 || realHeight <= 0) {
      this._applyYTransform();
      return false;
    }

    const visibleRange = this._getVisibleMainPaneRange(realWidth, data);
    const paddedRange = getPaddedPriceRange(visibleRange.min, visibleRange.max);
    const changed = this._clampMainPaneTransform(paddedRange.min, paddedRange.max, realHeight, constraints);

    this._applyYTransform();
    return changed;
  }

  private _getPaneAtY(containerY: number): Pane | null {
    return this._panes.find(pane => {
      const { top, height } = pane.getBounding();
      return containerY >= top && containerY <= top + height;
    }) || null;
  }

  private _getPaneChartWidth() {
    return Math.max(0, this._container.clientWidth - this._leftYAxisWidth - this._rightYAxisWidth);
  }

  /**
   * Every price scale, with the gutter and column it is drawn in.
   *
   * The placement rule itself lives in `assignPriceScaleColumns` -- pure, and
   * unit-tested without a DOM. This method's job is to state the inputs
   * (which scales exist, which are hidden) and to write the answer back to the
   * registry once, rather than as a side effect of every caller that happens
   * to need a descriptor.
   */
  private _getPriceScaleDescriptors(): PriceScaleDescriptor[] {
    const candidates: Array<{
      id: string;
      series: BaseSeries;
      data: KLineData[];
      isPrimary: boolean;
      yScale: number;
      yOffset: number;
    }> = [];

    if (this._mainSeries) {
      candidates.push({
        id: 'main',
        series: this._mainSeries,
        data: this._dataStore.getData(),
        isPrimary: true,
        yScale: this._yScale,
        yOffset: this._yOffset,
      });
    }

    this._stackedScales.forEach(scale => {
      candidates.push({
        id: scale.id,
        series: scale.series,
        data: scale.data,
        isPrimary: false,
        yScale: scale.viewport.scale,
        yOffset: scale.viewport.offset,
      });
    });

    const placements = assignPriceScaleColumns(
      candidates.map(candidate => ({
        id: candidate.id,
        isPrimary: candidate.isPrimary,
        hidden: this._hiddenSeriesIds.has(candidate.id),
      })),
    );

    return candidates.map((candidate, index) => {
      const { side, axisIndex } = placements[index];
      if (!candidate.isPrimary) {
        const scale = this._stackedScales.get(candidate.id);
        if (scale) {
          scale.side = side;
          scale.axisIndex = axisIndex;
        }
      }
      return { ...candidate, side, axisIndex };
    });
  }

  private _getYAxisColumnCount(side: PaneAxisSide) {
    if (this._options.axis.visible === false) return 0;
    if (this._options.axis.dual) return 1;
    const descriptors = this._getPriceScaleDescriptors().filter(d => !this._hiddenSeriesIds.has(d.id));
    const primaryColumns = descriptors.some(d => d.isPrimary && d.side === side) ? 1 : 0;
    const overlayColumns = descriptors.filter(d => !d.isPrimary && d.side === side).length;
    const priceScaleColumns = primaryColumns + overlayColumns;
    const indicatorColumns = this._panes.some(pane => pane.getId() !== 'main' && pane.getYAxisSide() === side) ? 1 : 0;
    return Math.min(this._maxYAxisColumnsPerSide, Math.max(priceScaleColumns, indicatorColumns));
  }

  private _getAxisColumnBounds(side: PaneAxisSide, axisIndex: number, height: number): Bounding {
    return this._axisLayout.columnBounds(side, axisIndex, height);
  }

  private _getAxisAreaName(side: PaneAxisSide): 'leftYAxis' | 'rightYAxis' {
    return side === 'left' ? 'leftYAxis' : 'rightYAxis';
  }

  private _withAxisColumn(
    ctx: CanvasRenderingContext2D,
    side: PaneAxisSide,
    axisIndex: number,
    height: number,
    draw: (bounding: Bounding) => void
  ) {
    const bounding = this._getAxisColumnBounds(side, axisIndex, height);
    ctx.save();
    ctx.translate(bounding.left, 0);
    draw({ ...bounding, left: 0 });
    ctx.restore();
  }

  /**
   * The chart surface as the pointer handlers see it: gutters, rulers, toolbar.
   *
   * Read from the live container, so it reflects the current size rather than
   * the size at construction.
   */
  private _surfaceLayout(rect?: DOMRect): ChartSurfaceLayout {
    const width = rect?.width ?? this._container.clientWidth;
    const height = rect?.height ?? this._container.clientHeight;
    return {
      width,
      height,
      toolbarHeight: this._toolbarHeight,
      xAxisHeight: this._xAxisHeight,
      leftGutter: this._leftYAxisWidth,
      rightGutter: this._rightYAxisWidth,
    };
  }

  private _hitTestMainPanePriceScale(x: number): string | null {
    const descriptors = this._getPriceScaleDescriptors();

    const hit = this._axisLayout.hitTest(x, this._container.clientWidth);
    if (!hit) return null;

    return descriptors.find(
      descriptor => descriptor.side === hit.side && descriptor.axisIndex === hit.axisIndex,
    )?.id || null;
  }

  private _getInterpolatedSeriesPriceAtLogicalIndex(data: KLineData[], logicalIndex: number): number | null {
    if (data.length === 0) return null;

    const clampedIndex = Math.max(0, Math.min(data.length - 1, logicalIndex));
    const leftIndex = Math.floor(clampedIndex);
    const rightIndex = Math.min(data.length - 1, Math.ceil(clampedIndex));
    const leftPrice = data[leftIndex]?.close;
    const rightPrice = data[rightIndex]?.close;

    if (!Number.isFinite(leftPrice) || !Number.isFinite(rightPrice)) {
      return null;
    }

    if (leftIndex === rightIndex) {
      return leftPrice;
    }

    const interpolation = clampedIndex - leftIndex;
    return leftPrice + (rightPrice - leftPrice) * interpolation;
  }

  private _findMainPaneSeriesDragTarget(chartX: number, localY: number, thresholdPx: number = 12): string | null {
    const mainPane = this._panes.find(pane => pane.getId() === 'main');
    if (!mainPane) return null;

    const bounding = mainPane.getBounding();
    const realWidth = bounding.width - this._leftYAxisWidth - this._rightYAxisWidth;
    const realHeight = bounding.height;
    if (chartX < 0 || chartX > realWidth || localY < 0 || localY > realHeight) return null;

    let closestHitId: string | null = null;
    let closestHitDistance = Number.POSITIVE_INFINITY;

    this._getPriceScaleDescriptors().forEach(descriptor => {
      if (descriptor.isPrimary || descriptor.data.length === 0) return;

      const transformer = this._stackedScales.get(descriptor.id)?.transformer
        ?? this._createPriceScaleTransformer(descriptor, realWidth, realHeight).transformer;
      const logicalIndex = transformer.xToIndex(chartX);
      const priceAtPointer = this._getInterpolatedSeriesPriceAtLogicalIndex(descriptor.data, logicalIndex);
      if (priceAtPointer === null) return;

      const seriesY = transformer.priceToY(priceAtPointer);
      const lineWidth = (descriptor.series.getOptions() as Partial<{ lineWidth: number }>).lineWidth ?? 2;
      const hitDistance = Math.abs(localY - seriesY);
      const hitThreshold = Math.max(thresholdPx, lineWidth * 2 + 4);

      if (hitDistance > hitThreshold) return;
      if (hitDistance < closestHitDistance) {
        closestHitId = descriptor.id;
        closestHitDistance = hitDistance;
      }
    });

    return closestHitId;
  }

  private _refreshYAxisWidths() {
    this._axisLayout.setColumns(this._getYAxisColumnCount('left'), this._getYAxisColumnCount('right'));
  }

  /**
   * A stacked scale's viewport, or a throwaway one for an unknown id.
   *
   * Callers used to create-on-read here, which quietly registered viewports for
   * ids that were never real scales. The registry is now the only thing that
   * creates a scale.
   */
  private _getStackedPaneState(paneId: string): PriceScaleModel {
    return this._stackedScales.get(paneId)?.viewport ?? new PriceScaleModel();
  }

  /**
   * The price-scale viewport for any pane, main or stacked.
   *
   * The main pane's viewport has always been a `PriceScaleModel` too — it is
   * just held in its own field rather than in the stacked registry. Routing both
   * through one lookup is what lets callers stop asking "is this the main pane?"
   * before they can read a scale, which was the same three-line branch repeated
   * at every call site.
   */
  private _priceScaleFor(paneId: string): PriceScaleModel {
    return paneId === 'main' ? this._priceScale : this._getStackedPaneState(paneId);
  }

  private _applyYTransformForPane(
    paneId: string,
    transformer: CoordinateTransformer = this._paneTransformers.for(paneId),
  ) {
    const state = this._priceScaleFor(paneId);
    transformer.setYScale(state.scale);
    transformer.setYOffset(state.offset);
  }

  private _setPaneYOffset(paneId: string, nextOffset: number) {
    this._priceScaleFor(paneId).offset = nextOffset;
  }

  /**
   * Pan one pane vertically and renormalize it, whichever pane it is.
   *
   * Both drag paths — pointer move and the touch handler — carried their own
   * copy of this main/stacked branch, so a change to panning had to be made
   * twice. Unknown ids are ignored rather than silently panning the main pane.
   */
  private _panPaneVertically(paneId: string, deltaY: number): void {
    if (paneId === 'main') {
      this._yOffset += deltaY;
      this._normalizeMainPaneViewport();
      return;
    }
    if (!this._stackedScales.has(paneId)) return;
    this._priceScaleFor(paneId).offset += deltaY;
    this._normalizeStackedPriceScaleViewport(paneId);
  }

  private _normalizeStackedPriceScaleViewport(scaleId: string) {
    if (!this._stackedScales.has(scaleId)) return false;

    const descriptor = this._getPriceScaleDescriptors().find(item => item.id === scaleId);
    const mainPane = this._panes.find(pane => pane.getId() === 'main');
    if (!descriptor || !mainPane) return false;

    const bounding = mainPane.getBounding();
    const realWidth = bounding.width - this._leftYAxisWidth - this._rightYAxisWidth;
    const realHeight = bounding.height;
    if (realWidth <= 0 || realHeight <= 0) return false;

    const built = this._createPriceScaleTransformer(descriptor, realWidth, realHeight);
    // setViewport reports whether anything moved, so the comparison no longer
    // has to be written out alongside the assignment.
    return this._getStackedPaneState(scaleId).setViewport({ yScale: built.yScale, yOffset: built.yOffset });
  }

  private _getPanePriceData(paneId: string): KLineData[] {
    if (paneId === 'main') return this._dataStore.getData();
    return this._stackedScales.get(paneId)?.data ?? [];
  }

  private _clampHorizontalScale() {
    const clampedBarSpacing = Math.max(getMinimumBarSpacing(this._dataStore.getData().length, this._getPaneChartWidth()), Math.min(100, this._barSpacing));
    if (clampedBarSpacing === this._barSpacing) return false;

    this._barSpacing = clampedBarSpacing;
    this._coordinateTransformer.setBarSpacing(this._barSpacing);
    return true;
  }

  private _enforceHorizontalViewportBounds() {
    const spacingChanged = this._clampHorizontalScale();
    const offsetChanged = this._clampHorizontalViewport();
    return spacingChanged || offsetChanged;
  }

  private _getPaneLocalY(chartY: number, paneTop: number) {
    return chartY - (paneTop - (this._toolbarHeight + this._xAxisHeight));
  }

  private _getRequiredDrawingPointCount(type: string | null) {
    if (!type) return 0;
    const drawing = this._parseDrawingMode(type);
    if (drawing.family === 'annotation') return 1;
    if (drawing.family === 'channel') return 3;
    if (drawing.family === 'wave') {
      if (drawing.variant === 'five') return 6;
      if (drawing.variant === 'abcde') return 5;
      return 4;
    }
    if (
      drawing.family === 'line' &&
      ['horizontal', 'vertical', 'horizontal-ray', 'vertical-ray', 'price'].includes(drawing.variant)
    ) return 1;
    // Registered templates (including third-party ones) declare their own
    // point count via `totalStep`; the built-in families above keep their
    // variant-specific counts.
    if (drawing.family !== 'line' && this._overlayManager.getTemplate(drawing.family)) {
      return this._overlayManager.getTotalStep(drawing.family);
    }
    return 2;
  }

  /**
   * Run a template's per-step `onPlace` hook. Returns false when the step
   * rejected the point, in which case the caller must not advance.
   */
  private _runDrawStep(overlay: Overlay, point: OverlayPoint, stepIndex: number): boolean {
    const step = this._overlayManager.getDrawStep(overlay.type, stepIndex);
    if (!step?.onPlace) return true;
    return step.onPlace(overlay, point, stepIndex) !== false;
  }

  /** Hint text for the drawing step currently awaiting a click, if any. */
  public getCurrentDrawStepHint(): string | null {
    if (!this._isCreatingOverlay || !this._drawingOverlay) return null;
    return this._overlayManager.getDrawStep(this._drawingOverlay.type, this._drawingFixedPointCount)?.hint ?? null;
  }

  private _parseDrawingMode(type: string) {
    const [family, variant = 'default'] = type.split(':');
    return { family, variant };
  }

  private _createDrawingOverlay(type: string, points: OverlayPoint[]): Overlay {
    const { family, variant } = this._parseDrawingMode(type);
    const drawingColor = this._drawingDefaults.color;
    const drawingLineWidth = this._drawingDefaults.lineWidth;
    if (family === 'line') {
      const direction = variant.includes('horizontal') || variant === 'price'
        ? 'horizontal'
        : variant.includes('vertical')
          ? 'vertical'
          : 'free';
      return {
        id: 'overlay_' + Date.now(),
        type: 'line',
        points,
        color: drawingColor,
        lineWidth: drawingLineWidth,
        line: {
          direction,
          extendStart: variant === 'trend' || variant === 'infinite' || variant === 'horizontal' || variant === 'vertical' || variant === 'price',
          extendEnd: variant === 'trend' || variant === 'infinite' || variant === 'ray' || variant === 'horizontal' || variant === 'vertical' || variant === 'horizontal-ray' || variant === 'vertical-ray' || variant === 'price',
          showPriceLabel: variant === 'price',
        },
      };
    }
    if (family === 'channel') {
      return {
        id: 'overlay_' + Date.now(),
        type: 'channel',
        points,
        color: drawingColor,
        lineWidth: drawingLineWidth,
        channel: { mode: variant === 'price' ? 'price' : 'parallel' },
      };
    }
    if (family === 'annotation') {
      return {
        id: 'overlay_' + Date.now(),
        type: 'annotation',
        points,
        color: drawingColor,
        lineWidth: drawingLineWidth,
        annotation: {
          kind: variant === 'default' || variant.startsWith('event-')
            ? (variant.startsWith('event-') ? 'tag' : 'text')
            : variant as 'text' | 'arrow' | 'image' | 'tag',
          placement: variant === 'tag' || variant.startsWith('event-') ? 'bottom' : 'floating',
        },
      };
    }
    if (family === 'wave') {
      return {
        id: 'overlay_' + Date.now(),
        type: 'wave',
        points,
        color: drawingColor,
        lineWidth: drawingLineWidth,
        wave: { kind: variant === 'default' ? 'three' : variant as 'three' | 'five' | 'abcd' | 'abcde' },
      };
    }
    return {
      id: 'overlay_' + Date.now(),
      type,
      points,
      color: drawingColor,
      lineWidth: drawingLineWidth,
    };
  }

  private _getPointFromResolvedDrawingPoint(point: { time: number; price: number }) {
    return { timestamp: point.time, value: point.price };
  }

  private _getPrimarySnapData(index: number) {
    const data = this._dataStore.getData();
    if (data.length === 0) return null;

    const clampedIndex = Math.max(0, Math.min(data.length - 1, index));
    return this._mainSeries?.getSnapData(clampedIndex) || data[clampedIndex] || null;
  }

  private _resolveDrawingPoint(chartX: number, chartY: number, paneId: string = 'main') {
    // The pane's own transformer, so a point placed in an indicator pane is
    // read against that pane's price range rather than the main pane's.
    const transformer = this._paneTransformers.for(paneId);
    this._applyYTransformForPane(paneId, transformer);
    const data = this._dataStore.getData();
    const price = transformer.yToPrice(chartY);

    if (data.length === 0) {
      return { index: 0, time: Date.now(), price };
    }

    // Allow X to go beyond chart width into the future region
    const clampedX = Math.max(0, chartX);
    const rawIndex = transformer.xToIndex(clampedX);
    const roundedIndex = Math.round(rawIndex);
    const coordinateTimestamp = this._dataStore.logicalIndexToTimestamp(rawIndex);

    // --- Future region: beyond last bar ---
    if (roundedIndex >= data.length) {
      return { index: roundedIndex, time: coordinateTimestamp ?? data[data.length - 1].timestamp, price };
    }

    // --- Within data range ---
    const index = Math.max(0, Math.min(data.length - 1, roundedIndex));
    const snapData = this._getPrimarySnapData(index) || data[index];
    if (!snapData) {
      return { index, time: Date.now(), price };
    }

    // Non-magnet: use free price placement
    if (!this._magnetMode) {
      return { index, time: coordinateTimestamp ?? snapData.timestamp, price };
    }

    // Magnet: snap to nearest OHLC value
    const barSpacing = Math.max(transformer.getBarSpacing(), 1);
    const neighborRadius = Math.max(1, Math.ceil(18 / barSpacing));
    let bestMatch = {
      index,
      time: snapData.timestamp,
      price,
      distanceSq: Number.POSITIVE_INFINITY,
    };

    for (let candidateIndex = Math.max(0, index - neighborRadius); candidateIndex <= Math.min(data.length - 1, index + neighborRadius); candidateIndex++) {
      const candidateData = this._getPrimarySnapData(candidateIndex) || data[candidateIndex];
      if (!candidateData) continue;

      const candidateX = transformer.indexToX(candidateIndex);
      const ohlcValues = [candidateData.open, candidateData.high, candidateData.low, candidateData.close];

      ohlcValues.forEach(candidatePrice => {
        const candidateY = transformer.priceToY(candidatePrice);
        const dx = candidateX - clampedX;
        const dy = candidateY - chartY;
        const distanceSq = dx * dx + dy * dy;
        if (distanceSq < bestMatch.distanceSq) {
          bestMatch = {
            index: candidateIndex,
            time: candidateData.timestamp,
            price: candidatePrice,
            distanceSq,
          };
        }
      });
    }

    return { index: bestMatch.index, time: bestMatch.time, price: bestMatch.price };
  }


  private _getSeriesStyle(series: BaseSeries | null): ConfigurablePriceSeriesStyle | null {
    if (!series) return null;
    if (series instanceof CandlestickSeries) return 'candle';
    if (series instanceof HollowCandlestickSeries) return 'hollow';
    if (series instanceof HeikinAshiSeries) return 'ha';
    if (series instanceof BarSeries) return 'bar';
    if (series instanceof AreaSeries) return 'area';
    if (series instanceof BaselineSeries) return 'baseline';
    if (series instanceof StepLineSeries) return 'step';
    if (series instanceof LineSeries) return 'line';
    return null;
  }

  private _createSeriesByStyle(style: SeriesType, options: Record<string, unknown> = {}) {
    return SeriesRegistry.createSeries(style, options);
  }

  private _getVisibleRangeForData(realWidth: number, data: KLineData[]) {
    let min = Infinity;
    let max = -Infinity;
    const { leftIdx, rightIdx } = this._visibleIndexRange(this._coordinateTransformer, realWidth, data.length);

    for (let i = leftIdx; i <= rightIdx; i++) {
      const item = data[i];
      if (!item) continue;
      min = Math.min(min, item.low, item.open, item.close, item.high);
      max = Math.max(max, item.low, item.open, item.close, item.high);
    }

    if (!Number.isFinite(min) || !Number.isFinite(max)) {
      return { min: 0, max: 100 };
    }

    return { min, max };
  }

  private _getVisibleRangeForStackedPane(paneId: string, realWidth: number) {
    const data = this._getPanePriceData(paneId);
    if (data.length === 0) return { min: 0, max: 100 };
    return this._getVisibleRangeForData(realWidth, data);
  }

  private _getPaneLocalX(containerX: number) {
    return containerX - this._leftYAxisWidth;
  }

  private _isConfigurablePriceSeriesStyle(value: string): value is ConfigurablePriceSeriesStyle {
    return CONFIGURABLE_PRICE_SERIES_STYLES.has(value as ConfigurablePriceSeriesStyle);
  }

  private _createPrimitivePointerEventContext(event: PointerEvent): PrimitivePointerEventContext {
    const rect = this._container.getBoundingClientRect();
    const containerX = event.clientX - rect.left;
    const containerY = event.clientY - rect.top;
    const topXBottom = this._toolbarHeight + this._xAxisHeight;
    const bottomXTop = rect.height - this._xAxisHeight;
    const chartX = this._getPaneLocalX(containerX);
    const chartY = containerY - topXBottom;
    const isWithinChartAreaX = containerX >= this._leftYAxisWidth && containerX <= rect.width - this._rightYAxisWidth;
    const pane = this._getPaneAtY(containerY);
    const paneBounding = pane?.getBounding() ?? null;
    const paneTarget = pane && paneBounding
      ? {
          id: pane.getId(),
          bounding: paneBounding,
          localY: this._getPaneLocalY(chartY, paneBounding.top),
          axisSide: pane.getYAxisSide(),
        }
      : null;

    let target: PointerTargetArea = 'outside';
    if (paneTarget && isWithinChartAreaX) {
      target = 'chart';
    } else if (isWithinChartAreaX && containerY >= this._toolbarHeight && containerY <= topXBottom) {
      target = 'top-x-axis';
    } else if (isWithinChartAreaX && containerY >= bottomXTop) {
      target = 'bottom-x-axis';
    } else if (paneTarget && containerX < this._leftYAxisWidth) {
      target = 'left-y-axis';
    } else if (paneTarget && containerX > rect.width - this._rightYAxisWidth) {
      target = 'right-y-axis';
    }

    const transformer = paneTarget ? this.getPaneTransformer(paneTarget.id) : null;
    const logicalIndex = isWithinChartAreaX ? this._coordinateTransformer.xToIndex(chartX) : null;
    const timestamp = transformer && logicalIndex !== null ? transformer.xToTimestamp(chartX, this._dataStore) : null;
    const price = transformer && paneTarget ? transformer.yToPrice(paneTarget.localY) : null;

    return {
      chart: this,
      event,
      containerX,
      containerY,
      chartX,
      chartY,
      target,
      pane: paneTarget,
      transformer,
      logicalIndex,
      timestamp,
      price,
      preventDefault: () => event.preventDefault(),
      requestPointerCapture: () => this._eventLayer?.setPointerCapture(event.pointerId),
      releasePointerCapture: () => this._eventLayer?.releasePointerCapture(event.pointerId),
      setCursor: cursor => {
        if (this._eventLayer) {
          this._eventLayer.style.cursor = cursor;
        } else {
          this._container.style.cursor = cursor;
        }
      },
    };
  }

  private _dispatchPrimitivePointer(phase: PrimitivePointerPhase, event: PointerEvent): boolean {
    const context = this._createPrimitivePointerEventContext(event);
    return this._primitiveManager.dispatchPointer(phase, context);
  }

  private _emitOverlayEvent(overlay: Overlay | null, eventName: keyof Pick<
    Overlay,
    | 'onDrawStart'
    | 'onDrawing'
    | 'onDrawEnd'
    | 'onRemoved'
    | 'onClick'
    | 'onSelected'
    | 'onDeselected'
    | 'onPressedMoveStart'
    | 'onPressedMoving'
    | 'onPressedMoveEnd'
  >) {
    const handler = overlay?.[eventName];
    if (!handler) return;

    try {
      handler(overlay);
    } catch (error) {
      console.warn(`Overlay ${eventName} callback failed`, error);
    }
  }

  private _setSelectedOverlay(overlay: Overlay | null) {
    if (this._selectedOverlay === overlay) return;
    const previous = this._selectedOverlay;
    this._emitOverlayEvent(previous, 'onDeselected');
    if (previous) this._emitOverlayChange('deselected', previous);
    this._selectedOverlay = overlay;
    // Bring a bottom-placed annotation to the front on selection — but only when
    // it is not already there, so repeated selection does not ratchet zLevel up
    // without bound, and route it through the manager so the change is notified
    // and persisted like any other override.
    if (overlay?.annotation?.placement === 'bottom') {
      const topZ = this._overlayManager
        .getOverlays()
        .reduce((max, item) => Math.max(max, item.zLevel ?? 0), 0);
      if ((overlay.zLevel ?? 0) < topZ) {
        this._overlayManager.setZLevel(overlay.id, topZ + 1);
      }
    }
    this._emitOverlayEvent(this._selectedOverlay, 'onSelected');
    if (overlay) this._emitOverlayChange('selected', overlay);
  }

  private _rangesEqual(left: { from: number; to: number } | null, right: { from: number; to: number }) {
    if (!left) return false;
    return Math.abs(left.from - right.from) < 1e-6 && Math.abs(left.to - right.to) < 1e-6;
  }

  private _notifyVisibleLogicalRangeChange(force = false) {
    const hasBusSubscribers =
      this._events.hasSubscribers('visibleLogicalRangeChange') ||
      this._events.hasSubscribers('visibleTimeRangeChange');
    if (this._visibleLogicalRangeSubscribers.size === 0 && !hasBusSubscribers) return;
    const range = this.getVisibleLogicalRange();
    if (!force && this._rangesEqual(this._lastVisibleLogicalRange, range)) return;

    this._lastVisibleLogicalRange = { ...range };
    this._events.emit('visibleLogicalRangeChange', { ...range });
    this._notifyVisibleTimeRangeChange(range);
    this._visibleLogicalRangeSubscribers.forEach(callback => {
      try {
        callback({ ...range });
      } catch (error) {
        console.warn('timeScale visible logical range callback failed', error);
      }
    });
  }

  private _getDefaultPaneWeight() {
    return 1;
  }

  public addStackedPricePane(config: StackedPaneConfig) {
    if (this._stackedScales.size >= this._maxOverlayPriceScales) return null;

    const side = config.side || (this._stackedScales.size % 2 === 0 ? 'left' : 'right');
    const sideAxisCount = (side === 'right' ? 1 : 0)
      + this._stackedScales.countOnSide(side);
    if (sideAxisCount >= this._maxYAxisColumnsPerSide) return null;

    const paneId = config.id || `stacked_${Date.now()}_${this._stackedScales.size}`;
    const series = this._createSeriesByStyle(config.style || 'candle', config.options);
    series.setData(config.data);

    this._stackedScales.add({ id: paneId, series, data: config.data, side, axisIndex: sideAxisCount });

    this._layout();
    this.update();
    return paneId;
  }

  public setStackedPricePaneStyle(paneId: string, style: ConfigurablePriceSeriesStyle) {
    const scale = this._stackedScales.get(paneId);
    if (!scale) return;
    const series = scale.series;
    const data = scale.data;

    const currentStyle = this._getSeriesStyle(series);
    if (currentStyle === style) return;

    const nextSeries = this._createSeriesByStyle(style, { ...series.getOptions() });
    nextSeries.setData(data);
    scale.series = nextSeries;
    this.update();
  }

  public removeStackedPricePane(paneId: string) {
    if (!this._stackedScales.has(paneId)) return;

    this._seriesStyleMenu?.close();

    this._stackedScales.remove(paneId);

    this._interaction.forgetPane(paneId);
    this._invalidation.forgetPane(paneId);

    this._reindexStackedPriceAxes();
    this._refreshYAxisWidths();
    this._layout();
  }

  public setStackedPaneData(paneId: string, data: KLineData[]) {
    const scale = this._stackedScales.get(paneId);
    if (scale) scale.data = data;
    const series = scale?.series;
    if (series) {
      series.setData(data);
    }
    this.update();
  }

  /** Whether a two-finger gesture is currently in progress. */
  public isPinching(): boolean {
    return this._interaction.isPinching();
  }

  /**
   * What the interaction layer is allowed to ask of this chart.
   *
   * An object of closures rather than the chart itself, which is the shape the
   * GUI widgets already use: the surface is written down in one place and the
   * chart's own members stay private.
   */
  private _createInteractionHost(): InteractionHost {
    return {
      container: () => this._container,
      containerRect: () => this._container.getBoundingClientRect(),
      surfaceLayout: rect => this._surfaceLayout(rect),
      insets: () => ({
        toolbarHeight: this._toolbarHeight,
        xAxisHeight: this._xAxisHeight,
        left: this._leftYAxisWidth,
        right: this._rightYAxisWidth,
      }),
      panes: () => this._panes,
      paneAt: containerY => this._getPaneAtY(containerY),
      paneStackHeight: () =>
        this._container.clientHeight - this._toolbarHeight - this._xAxisHeight * 2,

      transformer: () => this._coordinateTransformer,
      barSpacing: () => this._barSpacing,
      panHorizontallyBy: deltaPixels => {
        this._offset -= deltaPixels / this._barSpacing;
        this._coordinateTransformer.setOffset(this._offset);
        this._clampHorizontalViewport();
      },
      panPaneVertically: (paneId, deltaY) => this._panPaneVertically(paneId, deltaY),
      zoom: (factor, centerX, anchorIndex) => this._zoom(factor, centerX, anchorIndex),
      zoomY: (factor, paneId) => this._zoomY(factor, paneId),
      resizePanes: (index, weightDelta) => this._paneManager.resizePair(index, weightDelta),
      pixelsToPaneWeight: (pixels, paneStackHeight) =>
        this._paneManager.layout().pixelsToWeight(pixels, paneStackHeight, this._panes.length),
      panesResizable: () => this._options.panes.resizable,
      panEnabled: () => this._options.interaction.pan,
      zoomEnabled: () => this._options.interaction.zoom,
      syncViewport: () => {
        this._syncGroup?.sync(this, {
          offset: this._offset,
          barSpacing: this._barSpacing,
          yScale: this._yScale,
          yOffset: this._yOffset,
        });
      },
      syncCrosshair: () => {
        this._syncGroup?.sync(this, { crosshairPos: this._crosshairPos });
      },

      hitTestMainPanePriceScale: containerX => this._hitTestMainPanePriceScale(containerX),
      findMainPaneSeriesDragTarget: (chartX, localY) =>
        this._findMainPaneSeriesDragTarget(chartX, localY),
      preparePaneTransformer: pane => this._preparePaneTransformer(pane),
      // Both read the transformer `preparePaneTransformer` last pointed at a
      // pane, so a hit test in a sub-pane uses that pane's price range.
      findOverlayHandleAt: (chartX, localY) =>
        this._overlayManager.findHandleAt(chartX, localY, this._hitTestTransformer ?? this._coordinateTransformer, this._dataStore, 12),
      findOverlayAt: (chartX, localY) =>
        this._overlayManager.findOverlayAt(chartX, localY, this._hitTestTransformer ?? this._coordinateTransformer, this._dataStore),

      activeDrawingType: () => this._activeDrawingType,
      isCreatingOverlay: () => this._isCreatingOverlay,
      inProgressDrawing: () => this._drawingOverlay,
      drawingPointerDown: (chartX, chartY, paneId) => this._drawingPointerDown(chartX, chartY, paneId),
      drawingPointerMove: (chartX, chartY) => this._drawingPointerMove(chartX, chartY),
      cancelInProgressDrawing: () => this._cancelInProgressDrawing(),
      setDrawingMode: type => this.setDrawingMode(type),
      moveOverlayHandle: (overlay, pointIndex, chartX, chartY, paneTop) =>
        this._moveOverlayHandle(overlay, pointIndex, chartX, chartY, paneTop),
      moveOverlayBody: (overlay, startPoints, chartDx, startY, currentY) =>
        this._moveOverlayBody(overlay, startPoints, chartDx, startY, currentY),
      selectedOverlay: () => this._selectedOverlay,
      selectOverlay: overlay => this._setSelectedOverlay(overlay),
      removeOverlay: overlayId => this.removeOverlay(overlayId),
      emitOverlayEvent: (overlay, name) => this._emitOverlayEvent(overlay, name),

      setCrosshairPosition: position => {
        this._crosshairPos = position;
      },
      setHoveredIndex: index => {
        const data = this._dataStore.getData();
        this._hoveredIndex = index;
        this._hoveredData = index === null ? null : data[index] || null;
      },
      hasSubscribers: name => this._events.hasSubscribers(name),
      emitPointerEvent: (name, chartX, chartY, event) => {
        this._events.emit(name, this._buildMouseEventParams(chartX, chartY, event));
      },
      emitCrosshairLeave: paneId => {
        this._events.emit('crosshairMove', {
          time: null,
          logical: NaN,
          point: { x: NaN, y: NaN },
          price: null,
          bar: null,
          paneId,
          overlay: null,
          sourceEvent: null,
        });
      },
      dispatchPrimitivePointer: (phase, event) => this._dispatchPrimitivePointer(phase, event),
      closeSeriesStyleMenu: () => this._seriesStyleMenu?.close(),
      editOverlayText: overlay => this.startEditingOverlayText(overlay),
      update: level => this.update(level as unknown as InvalidationLevel),
      relayout: () => this._layout(),
      saveState: () => this.saveState(),
    };
  }

  /**
   * Open a hidden file picker for an image, enforce the 300 KB annotation-image
   * cap, and hand the caller the decoded `<img>` plus its data URL. Shared by
   * the image-annotation replace flow and the image drawing tool. No-ops when
   * there is no DOM.
   */
  private _pickImageForAnnotation(
    onDecoded: (dataUrl: string, img: HTMLImageElement) => void,
  ): void {
    if (typeof document === 'undefined') return;

    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.style.display = 'none';

    fileInput.onchange = () => {
      const file = fileInput.files?.[0];
      if (!file) {
        fileInput.remove();
        return;
      }

      const MAX_BYTES = 300 * 1024;
      if (file.size > MAX_BYTES) {
        alert(
          `Image is ${(file.size / 1024).toFixed(1)} KB, over the 300 KB limit. ` +
            'Choose an image of 300 KB or less.',
        );
        fileInput.remove();
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        const img = new Image();
        img.onload = () => onDecoded(dataUrl, img);
        img.src = dataUrl;
        fileInput.remove();
      };
      reader.readAsDataURL(file);
    };

    document.body.appendChild(fileInput);
    fileInput.click();
  }

  public startEditingOverlayText(overlay: Overlay) {
    if (typeof document === 'undefined') return;

    if (overlay.annotation?.kind === 'image') {
      // Replace the annotation's image through the shared picker (300 KB cap).
      this._pickImageForAnnotation((dataUrl, img) => {
        overlay.imageUrl = dataUrl;
        overlay._imageCache = img;
        this.update(InvalidationLevel.Overlay);
        this.saveState();
      });
      return;
    }

    // Remove any existing active inline editor
    const existing = this._container.querySelector('.fusion-overlay-inline-editor');
    if (existing) existing.remove();

    const transformer = this._coordinateTransformer;
    const dataStore = this._dataStore;
    const isTag = overlay.annotation?.kind === 'tag';
    const isArrow = overlay.annotation?.kind === 'arrow';

    let targetX = 0;
    let targetY = 0;

    if (overlay.points.length >= 2) {
      targetX = transformer.timestampToXUnbounded(overlay.points[1].timestamp, dataStore);
      targetY = transformer.priceToY(overlay.points[1].value);
    } else if (overlay.points.length >= 1) {
      targetX = transformer.timestampToXUnbounded(overlay.points[0].timestamp, dataStore);
      targetY = transformer.priceToY(overlay.points[0].value) + (isTag ? -28 : isArrow ? 24 : 0);
    }

    const screenLeft = targetX + this._leftYAxisWidth;
    const screenTop = targetY + (this._toolbarHeight + this._xAxisHeight);

    const input = document.createElement('input');
    input.className = 'fusion-overlay-inline-editor';
    input.type = 'text';
    input.value = overlay.text || (isTag && overlay.points[0] ? overlay.points[0].value.toFixed(2) : isArrow ? 'Signal' : 'Text');

    Object.assign(input.style, {
      position: 'absolute',
      left: `${screenLeft}px`,
      top: `${screenTop}px`,
      transform: 'translate(-50%, -50%)',
      zIndex: '99999',
      background: overlay.color || '#2962ff',
      color: '#ffffff',
      font: `600 12px ${this._options.layout.fontFamily}`,
      padding: '4px 10px',
      border: '2px solid rgba(255, 255, 255, 0.95)',
      borderRadius: '4px',
      outline: 'none',
      boxShadow: '0 4px 16px rgba(0, 0, 0, 0.5)',
      textAlign: 'center',
      minWidth: '60px',
      maxWidth: '240px',
      cursor: 'text',
      pointerEvents: 'auto',
    });

    input.addEventListener('pointerdown', (e: PointerEvent) => {
      e.stopPropagation();
    });

    input.addEventListener('click', (e: MouseEvent) => {
      e.stopPropagation();
    });

    input.addEventListener('dblclick', (e: MouseEvent) => {
      e.stopPropagation();
    });

    let isCommitted = false;
    const commit = () => {
      if (isCommitted) return;
      isCommitted = true;
      const nextText = input.value.trim();
      if (nextText !== '') {
        overlay.text = nextText;
      }
      if (input.parentNode) {
        input.remove();
      }
      this.update(InvalidationLevel.Overlay);
      this.saveState();
    };

    const cancel = () => {
      if (isCommitted) return;
      isCommitted = true;
      if (input.parentNode) {
        input.remove();
      }
    };

    input.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        commit();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cancel();
      }
    });

    input.addEventListener('blur', commit);
    this._container.appendChild(input);
    requestAnimationFrame(() => {
      input.focus();
      input.select();
    });
  }

  // ── Drawing tools ────────────────────────────────────────────────────────
  //
  // Triggered by a press, but overlay-model work: creating an overlay from a
  // template, running its draw steps, completing it. The interaction layer
  // decides that a press means "draw" and passes the coordinates here.

  /** Place the next point of a drawing, creating the overlay on the first one. */
  private _drawingPointerDown(chartX: number, chartY: number, paneId: string) {
    if (!this._activeDrawingType) return;

    // Prepare the pane the point is being placed in, not always the first one:
    // the resolved price is read through that pane's transformer.
    this._preparePaneTransformer(this._panes.find(pane => pane.getId() === paneId) ?? this._panes[0]);
    const snappedPoint = this._resolveDrawingPoint(chartX, chartY, paneId);

    const activeDrawing = this._parseDrawingMode(this._activeDrawingType);
    const requiredPointCount = this._getRequiredDrawingPointCount(this._activeDrawingType);
    const drawingPoint = this._getPointFromResolvedDrawingPoint(snappedPoint);

    // ── Single-click placement tools ───────────────────────────────────
    if (requiredPointCount === 1 && activeDrawing.family !== 'annotation') {
      const overlay = this._createDrawingOverlay(this._activeDrawingType, [drawingPoint]);
      this.createOverlay(overlay);
      this._setSelectedOverlay(overlay);
      this.setDrawingMode(null);
      this.update(InvalidationLevel.Overlay);
      return;
    }

    // ── Annotation tools: initialize metadata safely ──────────────────
    if (activeDrawing.family === 'annotation') {
      const transformer = this._coordinateTransformer;
      const ohlcSnap = this._snapToNearestCandleOHLC(chartX, chartY);
      const candlePrice = ohlcSnap.price;

      if (activeDrawing.variant === 'image') {
        const imgPrice = transformer.yToPrice(transformer.priceToY(candlePrice) - 58);
        const point0 = { timestamp: ohlcSnap.timestamp, value: candlePrice };
        const point1 = { timestamp: ohlcSnap.timestamp, value: imgPrice };

        const drawingType = this._activeDrawingType;
        this._pickImageForAnnotation((dataUrl, img) => {
          const overlayInput = this._createDrawingOverlay(drawingType, [point0, point1]);
          overlayInput.imageUrl = dataUrl;
          overlayInput._imageCache = img;
          const overlay = this.createOverlay(overlayInput);
          this._setSelectedOverlay(overlay);
          this.setDrawingMode(null);
          this.update(InvalidationLevel.Overlay);
        });
        return;
      } else if (activeDrawing.variant === 'tag') {
        const tagPrice = transformer.yToPrice(transformer.priceToY(candlePrice) - 44);
        const point0 = { timestamp: ohlcSnap.timestamp, value: candlePrice };
        const point1 = { timestamp: ohlcSnap.timestamp, value: tagPrice };
        const overlayInput = this._createDrawingOverlay(this._activeDrawingType, [point0, point1]);
        overlayInput.text = candlePrice.toFixed(2);
        const overlay = this.createOverlay(overlayInput);
        this._setSelectedOverlay(overlay);
        this.setDrawingMode(null);
        this.update(InvalidationLevel.Overlay);
        return;
      } else if (activeDrawing.variant.startsWith('event-')) {
        const eventType = activeDrawing.variant.replace('event-', '');
        const eventConfigs: Record<string, { label: string; color: string; bg: string }> = {
          earnings: { label: 'E · Earnings EPS Beat', color: '#38bdf8', bg: '#0284c7' },
          macro: { label: 'M · FOMC Rate Decision', color: '#f43f5e', bg: '#e11d48' },
          filing: { label: 'F · 10-Q Filing SEC', color: '#a855f7', bg: '#9333ea' },
          research: { label: 'R · Rating Overweight', color: '#10b981', bg: '#059669' },
          news: { label: 'N · Breaking News', color: '#f59e0b', bg: '#d97706' },
        };
        const cfg = eventConfigs[eventType] ?? { label: 'E · Event Marker', color: '#38bdf8', bg: '#0284c7' };
        const notePrice = transformer.yToPrice(transformer.priceToY(candlePrice) - 48);
        const point0 = { timestamp: ohlcSnap.timestamp, value: candlePrice };
        const point1 = { timestamp: ohlcSnap.timestamp, value: notePrice };
        const overlayInput = this._createDrawingOverlay(this._activeDrawingType, [point0, point1]);
        overlayInput.text = cfg.label;
        overlayInput.color = cfg.color;
        overlayInput.backgroundColor = cfg.bg;
        overlayInput.backgroundOpacity = 0.92;
        const overlay = this.createOverlay(overlayInput);
        this._setSelectedOverlay(overlay);
        this.setDrawingMode(null);
        this.update(InvalidationLevel.Overlay);
        return;
      } else if (activeDrawing.variant === 'arrow') {
        const notePrice = transformer.yToPrice(transformer.priceToY(candlePrice) + 44);
        const point0 = { timestamp: ohlcSnap.timestamp, value: candlePrice };
        const point1 = { timestamp: ohlcSnap.timestamp, value: notePrice };
        const overlayInput = this._createDrawingOverlay(this._activeDrawingType, [point0, point1]);
        overlayInput.text = 'Signal';
        const overlay = this.createOverlay(overlayInput);
        this._setSelectedOverlay(overlay);
        this.setDrawingMode(null);
        this.update(InvalidationLevel.Overlay);
        return;
      } else {
        const notePrice = transformer.yToPrice(transformer.priceToY(candlePrice) - 44);
        const point0 = { timestamp: ohlcSnap.timestamp, value: candlePrice };
        const point1 = { timestamp: ohlcSnap.timestamp, value: notePrice };
        const overlayInput = this._createDrawingOverlay(this._activeDrawingType, [point0, point1]);
        overlayInput.text = 'Note';
        const overlay = this.createOverlay(overlayInput);
        this._setSelectedOverlay(overlay);
        this.setDrawingMode(null);
        this.update(InvalidationLevel.Overlay);
        return;
      }
    }

    // ── Standard two/three-point drawing tools ────────────────────────
    if (!this._isCreatingOverlay) {
      this._drawingOverlay = this._createDrawingOverlay(this._activeDrawingType, [drawingPoint, drawingPoint]);
      if (!this._runDrawStep(this._drawingOverlay, drawingPoint, 0)) {
        this._drawingOverlay = null;
        return;
      }
      this.createOverlay(this._drawingOverlay, false);
      this._emitOverlayEvent(this._drawingOverlay, 'onDrawStart');
      this._isCreatingOverlay = true;
      this._drawingFixedPointCount = 1;
      this._drawingOverlay.currentStep = 1;
      this.update(InvalidationLevel.Overlay);
    } else {
      if (!this._drawingOverlay) return;

      // A step may reject the point (e.g. a channel refusing a width of
      // zero); when it does, stay on the current step.
      if (!this._runDrawStep(this._drawingOverlay, drawingPoint, this._drawingFixedPointCount)) {
        this.update(InvalidationLevel.Overlay);
        return;
      }

      if (this._drawingFixedPointCount < this._drawingOverlay.points.length) {
        this._drawingOverlay.points[this._drawingFixedPointCount] = drawingPoint;
      } else {
        this._drawingOverlay.points.push(drawingPoint);
      }
      this._drawingFixedPointCount += 1;
      this._drawingOverlay.currentStep = this._drawingFixedPointCount;

      if (this._drawingFixedPointCount >= requiredPointCount) {
        const completedOverlay = this._drawingOverlay;
        this._drawingOverlay.points = this._drawingOverlay.points.slice(0, requiredPointCount);
        this._emitOverlayEvent(this._drawingOverlay, 'onDrawEnd');
        this._isCreatingOverlay = false;
        this._drawingFixedPointCount = 0;
        this._drawingOverlay = null;
        this._setSelectedOverlay(completedOverlay);
        this.setDrawingMode(null);
        // The provisional overlay suppressed its `created` change; now that the
        // last point is down and the shape is real, surface it.
        this._emitOverlayChange('created', completedOverlay);
        this.saveState();
        this.update(InvalidationLevel.Overlay);
      } else if (this._drawingOverlay.points.length === this._drawingFixedPointCount) {
        this._drawingOverlay.points.push(drawingPoint);
        this.update(InvalidationLevel.Overlay);
      }
    }
    this.update(InvalidationLevel.Overlay);
  }

  private _snapToNearestCandleOHLC(chartX: number, chartY: number): { timestamp: number; price: number } {
    const transformer = this._coordinateTransformer;
    const data = this._dataStore.getData();
    if (data.length === 0) return { timestamp: Date.now(), price: transformer.yToPrice(chartY) };

    const rawIndex = transformer.xToIndex(Math.max(0, chartX));
    const clampedIndex = Math.max(0, Math.min(data.length - 1, Math.round(rawIndex)));
    const candle = data[clampedIndex];
    if (!candle) return { timestamp: Date.now(), price: transformer.yToPrice(chartY) };

    const ohlcValues = [candle.open, candle.high, candle.low, candle.close];
    let bestPrice = candle.close;
    let minDiff = Infinity;

    for (const p of ohlcValues) {
      const cy = transformer.priceToY(p);
      const diff = Math.abs(cy - chartY);
      if (diff < minDiff) {
        minDiff = diff;
        bestPrice = p;
      }
    }

    return { timestamp: candle.timestamp, price: bestPrice };
  }

  /** Track the provisional point of a drawing in progress against the pointer. */
  private _drawingPointerMove(chartX: number, chartY: number) {
    if (!this._drawingOverlay) return;
    const pane = this._panes[0];
    this._preparePaneTransformer(pane);
    const localY = this._getPaneLocalY(chartY, pane ? pane.getBounding().top : this._toolbarHeight + this._xAxisHeight);
    const snappedPoint = this._resolveDrawingPoint(chartX, localY, pane?.getId() || 'main');

    const previewIndex = Math.max(this._drawingFixedPointCount, this._drawingOverlay.points.length - 1);
    this._drawingOverlay.points[previewIndex] = this._getPointFromResolvedDrawingPoint(snappedPoint);
    this._emitOverlayEvent(this._drawingOverlay, 'onDrawing');
    this.update(InvalidationLevel.Overlay);
  }

  /** Move one anchor point of an overlay to the pointer, magnet snapping included. */
  private _moveOverlayHandle(overlay: Overlay, pointIndex: number, chartX: number, chartY: number, paneTop: number) {
    this._preparePaneTransformer(this._panes[0]);
    const localY = this._getPaneLocalY(chartY, paneTop);
    if (pointIndex === 1 && overlay.annotation) {
      // Free floating label box: directly convert coordinates to continuous space without OHLC snapping
      const transformer = this._coordinateTransformer;
      const rawIndex = transformer.xToIndex(chartX);
      const freeTime = this._dataStore.logicalIndexToTimestamp(rawIndex) ?? (overlay.points[1]?.timestamp || Date.now());
      const freePrice = transformer.yToPrice(localY);
      overlay.points[1] = { timestamp: freeTime, value: freePrice };
    } else if ((overlay.annotation?.kind === 'tag' || overlay.annotation?.kind === 'arrow') && pointIndex === 0) {
      const ohlcSnap = this._snapToNearestCandleOHLC(chartX, localY);
      overlay.points[0] = { timestamp: ohlcSnap.timestamp, value: ohlcSnap.price };
      if (overlay.annotation?.kind === 'tag') {
        overlay.text = ohlcSnap.price.toFixed(2);
      }
    } else {
      const snappedPoint = this._resolveDrawingPoint(chartX, localY, this._panes[0].getId());
      overlay.points[pointIndex] = { timestamp: snappedPoint.time, value: snappedPoint.price };
    }
    this._emitOverlayEvent(overlay, 'onPressedMoving');
  }

  /**
   * Translate every anchor point of an overlay by a pointer delta.
   *
   * Deliberately not magnetized: snapping each point of a body drag to the
   * nearest bar makes the whole shape stutter, so the raw pixel-to-price delta
   * is used here and the magnet applies to single-handle drags only.
   */
  private _moveOverlayBody(
    overlay: Overlay,
    startPoints: Array<{ timestamp: number; value: number }>,
    chartDx: number,
    startY: number,
    currentY: number,
  ) {
    const transformer = this._preparePaneTransformer(this._panes[0]);
    const data = this._dataStore.getData();
    const priceDelta = transformer.yToPrice(currentY) - transformer.yToPrice(startY);
    const indexDelta = chartDx / this._barSpacing;

    const barInterval = data.length > 1
      ? (data[data.length - 1].timestamp - data[0].timestamp) / (data.length - 1)
      : 3600000;
    const timeDelta = indexDelta * barInterval;

    overlay.points = startPoints.map(point => ({
      timestamp: point.timestamp + timeDelta,
      value: point.value + priceDelta,
    }));
    this._emitOverlayEvent(overlay, 'onPressedMoving');
  }

  private _handleResize: () => void;

  public destroy() {
    this._events.clear();
    this._visibleLogicalRangeSubscribers.clear();
    this._toolbar?.destroy();
    this._toolbar = null;
    this._dataTooltip?.destroy();
    this._dataTooltip = null;
    this._seriesStyleMenu?.destroy();
    this._seriesStyleMenu = null;
    this._isDestroyed = true;
    if (this._updateRequestId !== null) {
      cancelAnimationFrame(this._updateRequestId);
      this._updateRequestId = null;
    }
    this._eventController.dispose();
    this._primitiveManager.dispose();
    if (this._unsubscribeDataStore) {
      this._unsubscribeDataStore();
      this._unsubscribeDataStore = null;
    }
    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
      this._resizeObserver = null;
    }
    if (this._syncGroup) {
      this._syncGroup.removeChart(this);
      this._syncGroup = null;
    }
    this._visibleLogicalRangeSubscribers.clear();
    // dispose() already drops the manager's panes, and the facade no longer
    // keeps its own copy to clear.
    this._paneManager.dispose();
    this._container.innerHTML = '';
  }

  /**
   * Set the primary chart style (Candle, Bar, Area).
   * Automatically replaces the existing main series.
   */
  public setChartStyle(type: ConfigurablePriceSeriesStyle) {
    const currentStyle = this._getSeriesStyle(this._mainSeries);
    if (currentStyle === type) return;

    const previousOptions = this._mainSeries ? { ...this._mainSeries.getOptions() } : {};

    // Remove existing main series from tracking
    if (this._mainSeries) {
      this._series = this._series.filter(s => s !== this._mainSeries);
    }

    this._mainSeries = this._createSeriesByStyle(type, previousOptions);

    if (this._mainSeries) {
      this._series.unshift(this._mainSeries);
      this._mainSeries.setData(this._dataStore.getData());
    }
    this.update();
  }

  /**
   * Report option paths that do not belong to the current schema.
   *
   * A merge accepts any key. One the schema has no place for is merged in and
   * then ignored, so `crosshair.colour` costs the caller a setting and one
   * letter of spelling, with nothing to read anywhere. The defaults are the
   * schema: a path missing from them is a path the chart has no code for.
   */
  private _resolveOptionInput(options: DeepPartial<ChartOptions>): DeepPartial<ChartOptions> {
    const unknown = findUnknownOptionPaths(defaultOptions, options);
    if (unknown.length > 0) {
      console.warn(
        `[fscandle] unknown option${unknown.length > 1 ? 's' : ''} ignored: ${unknown.join(', ')}`,
      );
    }
    return options;
  }

  private _resolveRightMarginRatio(value: number | undefined): number {
    return Number.isFinite(value) ? Math.max(0, Math.min(1, value as number)) : 0.2;
  }

  public applyOptions(options: DeepPartial<ChartOptions>) {
    this._options = mergeChartOptions(this._options, this._resolveOptionInput(options));
    this._rightMarginRatio = this._resolveRightMarginRatio(this._options.timeScale.rightMargin);
    this._coordinateTransformer.setRightMarginRatio(this._rightMarginRatio);
    this._xAxisHeight = this._options.timeScale.visible === false ? 0 : 22;

    this._container.style.backgroundColor = this._options.layout.background.color;
    this._toolbar?.applyTheme();
    this._refreshTimeSemantics();
    this._recreateAxes();
    this._applyStructuralOptions();
    this.saveState();
    // Pane geometry is part of the options now, and a changed divider height or
    // weight floor moves every pane. Re-laying out is what makes that visible;
    // `update` alone would redraw the panes where they already were.
    this._layout();
    this.update();
  }

  /**
   * Push the option families whose owner is not this class down to their owner.
   *
   * `panes` and `indicators` are the two that configure another object rather
   * than being read at draw time from `this._options`, so they have to be
   * applied at every point options change: construction, `applyOptions`, and a
   * restore from persisted state.
   */
  private _applyStructuralOptions() {
    this._paneManager.applyOptions(this._options.panes);
    this._indicatorManager.setStyles(this._options.indicators);
  }

  /**
   * Re-resolve period, session, and locale from the current options and push
   * them into the formatter and data store. Called whenever options change.
   */
  private _refreshTimeSemantics() {
    this._i18n.setLocale(this._options.localization.locale);
    this._period = resolvePeriodOption(this._options.timeScale.period);
    this._session = resolveSessionOption(this._options.timeScale.session);
    this._timeFormatter.setConfig({
      locale: this._options.localization.locale,
      // An explicit session timezone stands in for a missing localization one:
      // exchange hours are what the axis is actually labelling.
      timeZone: this._options.localization.timeZone ?? this._session?.timeZone,
      period: this._period ?? undefined,
    });
    this._dataStore.setPeriod(this._period);
    this._dataStore.setSession(this._session);
  }

  private _recreateAxes() {
    // Without a declared period the axis keeps its bar-spacing heuristic,
    // since inferred granularity would flip labels around under zoom.
    this._xAxis = new Axis('x', this._options, this._period ? this._timeFormatter : null);
    this._yAxis = new Axis('y', this._options);
  }

  public setTheme(theme: 'dark' | 'light') {
    const isDark = theme === 'dark';
    this.applyOptions({
      layout: { 
        background: { color: isDark ? '#131722' : '#ffffff' },
        textColor: isDark ? '#d1d4dc' : '#131722'
      },
      grid: {
        vertLines: { color: isDark ? '#2b2b2b' : '#f0f3fa' },
        horzLines: { color: isDark ? '#2b2b2b' : '#f0f3fa' }
      },
      crosshair: { color: isDark ? '#758696' : '#2962FF' }
    });
  }

  /** Registers a newly-added series and promotes it to main series if none is set yet. */
  private _registerSeries<T extends BaseSeries>(series: T): T {
    this._series.push(series);
    if (!this._mainSeries) this._mainSeries = series;
    return series;
  }

  public addCandlestickSeries(options: Partial<CandlestickStyleOptions> = {}): CandlestickSeries {
    return this._registerSeries(new CandlestickSeries(options));
  }

  public addBarSeries(options: Partial<{ upColor: string; downColor: string; lineWidth: number }> = {}) {
    return this._registerSeries(new BarSeries(options));
  }

  public addAreaSeries(options: Partial<{ lineColor: string; lineWidth: number; topColor: string; bottomColor: string }> = {}) {
    return this._registerSeries(new AreaSeries(options));
  }

  public addLineSeries(options: Partial<{ color: string; lineWidth: number }> = {}) {
    return this._registerSeries(new LineSeries(options));
  }

  public addStepLineSeries(options: DeepPartial<StepLineStyleOptions> = {}) {
    return this._registerSeries(new StepLineSeries(options));
  }

  public addBaselineSeries(options: Partial<Record<string, unknown>> = {}) {
    return this._registerSeries(new BaselineSeries(options));
  }

  /**
   * Register a custom series type from a declarative definition. Once defined,
   * the `type` string works anywhere a built-in style is accepted, including
   * `setChartStyle` and `addStackedPricePane`.
   */
  public defineSeriesType<TOptions extends object>(definition: CustomSeriesDefinition<TOptions>) {
    SeriesRegistry.defineSeries(definition);
  }

  /**
   * Add an instance of a previously-defined custom series to the main pane.
   */
  public addCustomSeries(type: string, options: Record<string, unknown> = {}): BaseSeries {
    if (!SeriesRegistry.has(type)) {
      throw new Error(`Series type "${type}" is not registered. Call defineSeriesType first.`);
    }
    return this._registerSeries(SeriesRegistry.createSeries(type, options));
  }

  public addVolumeSeries(options: Partial<VolumeSeriesOptions> = {}): VolumeSeries {
    const series = new VolumeSeries(options);
    this._series.push(series);
    return series;
  }

  public addMACDSeries(options: CreateIndicatorOptions = {}): void {
    // Find or add a second pane for MACD if it doesn't exist
    let pane = this._panes[1];
    if (!pane) {
      pane = this.addPane('indicator');
    }
    this._indicatorManager.createIndicator(pane.getId(), 'MACD', {
      id: options.id ?? 'macd',
      calcParams: options.calcParams,
    });
    this._indicatorManager.calcAll(this._dataStore.getData());
    this.update();
  }

  public addEMASeries(period: number = 20) {
    const emaIndicator = new Indicator(`ema_${period}`, {
        ...EMATemplate,
        calcParams: [period]
    });
    this._indicatorManager.addIndicator(this._panes[0].getId(), emaIndicator);
    this._indicatorManager.calcAll(this._dataStore.getData());
    this.update();
  }

  public addBOLLSeries(period: number = 20, stdDev: number = 2) {
    const bollIndicator = new Indicator(`boll_${period}`, {
        ...BOLLTemplate,
        calcParams: [period, stdDev]
    });
    this._indicatorManager.addIndicator(this._panes[0].getId(), bollIndicator);
    this._indicatorManager.calcAll(this._dataStore.getData());
    this.update();
  }

  public addRSISeries(period: number = 14) {
    const rsiIndicator = new Indicator(`rsi_${period}`, RSITemplate);
    let pane = this._panes[1];
    if (!pane) pane = this.addPane('indicator');
    this._indicatorManager.addIndicator(pane.getId(), rsiIndicator);
    this._indicatorManager.calcAll(this._dataStore.getData());
    this.update();
  }

  public addIndicator(paneId: string, indicator: Indicator) {
    this._indicatorManager.addIndicator(paneId, indicator);
    this.saveState();
    // Only the pane that gained the indicator has changed.
    this.update(InvalidationLevel.Full, paneId);
  }

  public registerIndicatorTemplate(template: IndicatorTemplate) {
    this._indicatorManager.registerTemplate(template);
  }

  public getRegisteredIndicatorTemplates(): IndicatorTemplate[] {
    return this._indicatorManager.getRegisteredTemplates();
  }

  public createIndicator(
    name: string,
    options: { paneId?: string; id?: string; calcParams?: number[]; newPane?: boolean } = {}
  ): Indicator {
    let pane = options.paneId ? this._panes.find(item => item.getId() === options.paneId) : undefined;
    const createdPane = !pane && !!options.newPane;
    if (!pane) {
      pane = options.newPane ? this.addPane('indicator') : this._panes[0];
    }
    if (!pane) {
      throw new Error('No pane is available for indicator creation');
    }

    const indicator = this._indicatorManager.createIndicator(pane.getId(), name, {
      id: options.id,
      calcParams: options.calcParams,
    });
    this._indicatorManager.calcAll(this._dataStore.getData());
    this.saveState();
    // A new pane changes the whole stack's geometry; an indicator added to an
    // existing one changes only that pane.
    if (createdPane) this.update();
    else this.update(InvalidationLevel.Full, pane.getId());
    return indicator;
  }

  public removeIndicator(paneId: string, indicatorId: string) {
    this._indicatorManager.removeIndicator(paneId, indicatorId);
    if (paneId !== 'main' && this._indicatorManager.getIndicators(paneId).length === 0) {
      // Removing the pane re-lays out the stack, which every pane has to follow.
      this._removePane(paneId);
      this.saveState();
      this.update();
      return;
    }
    this.saveState();
    this.update(InvalidationLevel.Full, paneId);
  }

  public addKDJSeries() {
    const kdj = new Indicator(`kdj_${Date.now()}`, KDJTemplate);
    let pane = this._panes[1];
    if (!pane) pane = this.addPane('indicator');
    this.addIndicator(pane.getId(), kdj);
  }

  public addWRSeries() {
    const wr = new Indicator(`wr_${Date.now()}`, WRTemplate);
    let pane = this._panes[1];
    if (!pane) pane = this.addPane('indicator');
    this.addIndicator(pane.getId(), wr);
  }

  public addVOLMASeries() {
    const volma = new Indicator(`volma_${Date.now()}`, VOLMATemplate);
    this.addIndicator(this._panes[0].getId(), volma);
  }

  public setDrawingMode(type: string | null) {
    const shouldCancelProgress = this._isCreatingOverlay && this._drawingOverlay && type !== this._activeDrawingType;
    if (shouldCancelProgress && this._drawingOverlay) {
      this._overlayManager.removeOverlay(this._drawingOverlay.id);
      this._emitOverlayEvent(this._drawingOverlay, 'onRemoved');
    }
    this._activeDrawingType = type;
    // B9 fix: set cursor on _eventLayer (which intercepts events) not _container
    if (this._eventLayer) {
      this._eventLayer.style.cursor = type ? 'crosshair' : 'crosshair';
      // Drawing is a modal gesture: chart overlays such as legends must not
      // consume placement taps on compact viewports.
      this._eventLayer.style.zIndex = type ? '3301' : '2500';
    }
    this._container.style.cursor = type ? 'crosshair' : 'default';
    if (!type) {
        this._isCreatingOverlay = false;
        this._drawingOverlay = null;
        this._drawingFixedPointCount = 0;
    }
    if (shouldCancelProgress) {
      this.update(InvalidationLevel.Overlay);
    }
  }

  public setDrawingDefaults(defaults: Partial<DrawingDefaults>) {
    const nextLineWidth = defaults.lineWidth ?? this._drawingDefaults.lineWidth;
    this._drawingDefaults = {
      color: defaults.color ?? this._drawingDefaults.color,
      lineWidth: Math.max(1, Math.min(8, nextLineWidth)),
    };
  }

  public getDrawingDefaults(): DrawingDefaults {
    return { ...this._drawingDefaults };
  }

  public setMagnetMode(on: boolean) {
    this._magnetMode = on;
    this.update();
  }

  // ── Price Scale Mode API ─────────────────────────────────────────

  /** Set the Y-axis price scale mode: 'normal' (linear) or 'log' (logarithmic). */
  public setPriceScaleMode(mode: PriceScaleMode) {
    // Every transformer reads this model, so there is nothing to propagate.
    this._priceScale.mode = mode;
    this.update();
  }

  public getPriceScaleMode(): PriceScaleMode {
    return this._priceScale.mode;
  }

  /** Invert the Y-axis (high prices at bottom, low prices at top) */
  public setInvertScale(inverted: boolean) {
    this._priceScale.inverted = inverted;
    this.update();
  }

  public getInvertScale(): boolean {
    return this._priceScale.inverted;
  }

  /**
   * The chart's current options, as a copy.
   *
   * `Readonly<T>` is shallow, so returning the live object let
   * `getOptions().grid.vertLines.visible = false` type-check, mutate chart
   * state, and skip every invalidation a real option change runs through.
   * Callers that want to change something go through `applyOptions`.
   */
  public getOptions(): Readonly<ChartOptions> {
    return cloneOptionTree(this._options);
  }

  public getCrosshairPosition(paneId?: string): { x: number; y: number } | null {
    const crosshair = this._crosshairPos ?? this._remoteCrosshairPos;
    if (!crosshair) return null;
    if (!paneId) return { ...crosshair };

    const pane = this._panes.find(item => item.getId() === paneId);
    const firstPane = this._panes[0];
    if (!pane || !firstPane) return null;
    const bounding = pane.getBounding();
    const plotTop = firstPane.getBounding().top;
    const localY = crosshair.y - (bounding.top - plotTop);
    if (localY < 0 || localY > bounding.height) return null;
    return { x: crosshair.x, y: localY };
  }

  public getPaneBounding(paneId: string): Bounding | null {
    return this._panes.find(pane => pane.getId() === paneId)?.getBounding() ?? null;
  }

  /**
   * The transformer a pane's coordinates should be read through.
   *
   * A stacked price scale is addressed by its own id and answers with the
   * transformer its last render built. Otherwise this is a pane id, and every
   * pane — main or indicator — owns a transformer whose range is that pane's,
   * so this no longer falls back to whichever range the shared instance was
   * left holding.
   */
  public getPaneTransformer(paneId: string): CoordinateTransformer {
    return this._stackedScales.get(paneId)?.transformer ?? this._paneTransformers.for(paneId);
  }

  public getVisiblePriceBoundsForTransformer(transformer: CoordinateTransformer, height: number = transformer.getHeight()) {
    return this._getVisiblePriceBounds(transformer, height);
  }

  public timeScale(): TimeScaleApi {
    return {
      logicalToCoordinate: logicalIndex => this.logicalToCoordinate(logicalIndex),
      coordinateToLogical: x => this.coordinateToLogical(x),
      timestampToCoordinate: timestamp => this.timestampToCoordinate(timestamp),
      coordinateToTimestamp: x => this.coordinateToTimestamp(x),
      getVisibleLogicalRange: () => this.getVisibleLogicalRange(),
      setVisibleLogicalRange: range => this.setVisibleLogicalRange(range),
      subscribeVisibleLogicalRangeChange: callback => {
        this._visibleLogicalRangeSubscribers.add(callback);
        callback(this.getVisibleLogicalRange());
        return () => {
          this._visibleLogicalRangeSubscribers.delete(callback);
        };
      },
      scrollToLatest: () => {
        this._coordinateTransformer.setOffsetToLatest(this._dataStore.getData().length);
        this._offset = this._coordinateTransformer.getOffset();
        this._enforceHorizontalViewportBounds();
        this.update(InvalidationLevel.Full);
      },
    };
  }

  public priceScale(): PriceScaleApi {
    return {
      getMode: () => this.getPriceScaleMode(),
      setMode: mode => this.setPriceScaleMode(mode),
      getInvertScale: () => this.getInvertScale(),
      setInvertScale: inverted => this.setInvertScale(inverted),
      priceToCoordinate: price => this._coordinateTransformer.priceToY(price),
      coordinateToPrice: coordinate => this._coordinateTransformer.yToPrice(coordinate),
    };
  }

  public series(): SeriesApi {
    return {
      getData: () => this.getData(),
      setData: data => this.setData(data),
      updateData: data => this.updateData(data),
      setChartStyle: type => this.setChartStyle(type),
      removeAt: index => this.removeSeriesAt(index),
      options: (target = 'main') => {
        const series = this._seriesForTarget(target);
        return series ? cloneOptionTree(series.getOptions() as Record<string, unknown>) : null;
      },
      applyOptions: (target, options) => {
        const series = this._seriesForTarget(target);
        if (!series) return false;
        series.updateOptions(options as never);
        this.saveState();
        this.update(InvalidationLevel.Full);
        return true;
      },
    };
  }

  /** The series behind a `SeriesTarget`, or null when there is none. */
  private _seriesForTarget(target: SeriesTarget): BaseSeries | null {
    if (target === 'main') return this._mainSeries;
    return this._stackedScales.get(target)?.series ?? null;
  }

  public pane(): PaneApi {
    return {
      ids: () => this._panes.map(pane => pane.getId()),
      weights: () => [...this._paneWeights],
      setWeights: weights => {
        this._paneManager.setWeights(weights);
        this._normalizePaneWeights();
        this._layout();
        this.saveState();
        this.update(InvalidationLevel.Full);
      },
      getBounding: paneId => this.getPaneBounding(paneId),
    };
  }

  /**
   * Restyle the figures of one overlay type, without forking its template.
   *
   * `chart.setOverlayStyles('horizontalLine', { color: '#f00', dashedValue: [4, 4] })`
   * recolours every horizontal line; a function form receives each figure and
   * its index, so a template's outline and its handles can be styled apart.
   * Pass `undefined` to restore the template's own styling.
   */
  public setOverlayStyles(type: string, styles: FigureStyleOverride | undefined) {
    this._overlayManager.setStyleOverride(type, styles);
    this.update(InvalidationLevel.Overlay);
  }

  /** The style override registered for an overlay type, if any. */
  public getOverlayStyles(type: string): FigureStyleOverride | undefined {
    return this._overlayManager.getStyleOverride(type);
  }

  /**
   * Add a horizontal line at a price, with a label on the price axis.
   *
   * Distinct from a drawing overlay on purpose: this belongs to the caller, not
   * to the user. It cannot be selected or dragged away, it is not persisted with
   * the drawing layers, and the axis label is the point of it -- an entry, a
   * stop, a liquidation level is worth showing as a number on the scale.
   */
  public createPriceLine(input: PriceLineInput): PriceLineOptions {
    const line = this._priceLines.add(input);
    // Full, not Overlay: these are drawn on the chart layer with the series, and
    // the overlay layer alone repainting leaves them invisible until something
    // else forces a redraw.
    this.update(InvalidationLevel.Full);
    return line;
  }

  /** Patch a price line in place, keeping its draw order. */
  public updatePriceLine(id: string, patch: Partial<PriceLineInput>): PriceLineOptions | null {
    const line = this._priceLines.update(id, patch);
    if (line) this.update(InvalidationLevel.Full);
    return line;
  }

  public removePriceLine(id: string): boolean {
    const removed = this._priceLines.remove(id);
    if (removed) this.update(InvalidationLevel.Full);
    return removed;
  }

  public priceLines(): PriceLineOptions[] {
    return this._priceLines.all();
  }

  public clearPriceLines(): void {
    this._priceLines.clear();
    this.update(InvalidationLevel.Full);
  }

  /**
   * Replace the per-bar markers.
   *
   * Markers are addressed by bar timestamp rather than by index: an index moves
   * when history is prepended, and a caller holding signal timestamps should not
   * have to re-map them every time older data arrives.
   */
  public setMarkers(markers: SeriesMarkerInput[]): SeriesMarker[] {
    const placed = this._seriesMarkers.setAll(markers);
    this.update(InvalidationLevel.Full);
    return placed;
  }

  public markers(): SeriesMarker[] {
    return this._seriesMarkers.all();
  }

  public clearMarkers(): void {
    this._seriesMarkers.clear();
    this.update(InvalidationLevel.Full);
  }

  /**
   * Caller-owned horizontal lines across the plot.
   *
   * Their axis labels are drawn with the axis columns rather than here, so a
   * label lands in the gutter of the scale it belongs to and is clipped by it.
   */
  private _renderPriceLines(
    ctx: CanvasRenderingContext2D,
    width: number,
    transformer: CoordinateTransformer,
  ): void {
    const lines = this._priceLines.all();
    if (lines.length === 0) return;

    ctx.save();
    for (const line of lines) {
      const y = transformer.priceToY(line.price);
      if (!Number.isFinite(y)) continue;
      ctx.strokeStyle = line.color;
      ctx.lineWidth = line.lineWidth;
      ctx.setLineDash(line.lineStyle === 'dashed' ? [6, 4] : line.lineStyle === 'dotted' ? [1, 3] : []);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.restore();
  }

  /** Render last price horizontal extension line across the entire plot. */
  private _renderLastPriceLine(
    ctx: CanvasRenderingContext2D,
    width: number,
    transformer: CoordinateTransformer,
    data: KLineData[],
  ): void {
    if (data.length === 0) return;
    const last = data[data.length - 1];
    const y = transformer.priceToY(last.close);
    if (!Number.isFinite(y)) return;

    ctx.save();
    const color = last.close >= last.open ? '#26a69a' : '#ef5350';
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  /** Price-axis labels for the caller's price lines, inside one axis column. */
  private _renderPriceLineLabels(
    ctx: CanvasRenderingContext2D,
    bounds: Bounding,
    side: PaneAxisSide,
    transformer: CoordinateTransformer,
  ): void {
    for (const line of this._priceLines.all()) {
      if (!line.axisLabelVisible) continue;
      const y = transformer.priceToY(line.price);
      if (!Number.isFinite(y) || y < 0 || y > bounds.height) continue;
      this._yAxis.renderLabel(ctx, y, line.title || this._formatPriceValue(line.price), bounds, side, line.color);
    }
  }

  /**
   * Per-bar glyphs.
   *
   * Placement is `placeMarkers`, which drops anything outside the visible slice
   * before any drawing happens: a few hundred markers on a 50,000-bar chart
   * should cost a frame nothing when none of them are on screen.
   */
  private _renderSeriesMarkers(
    ctx: CanvasRenderingContext2D,
    data: KLineData[],
    transformer: CoordinateTransformer,
  ): void {
    const markers = this._seriesMarkers.all();
    if (markers.length === 0 || data.length === 0) return;

    const visible = visibleIndexRange(x => transformer.xToIndex(x), transformer.getWidth(), data.length);
    const placed = placeMarkers(
      markers,
      data,
      visible,
      index => transformer.indexToX(index),
      price => transformer.priceToY(price),
    );
    if (placed.length === 0) return;

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `400 10px ${this._options.layout.fontFamily}`;
    for (const { marker, x, y } of placed) {
      ctx.fillStyle = marker.color;
      ctx.strokeStyle = marker.color;
      const size = marker.size;

      if (marker.shape === 'square') {
        ctx.fillRect(x - size / 2, y - size / 2, size, size);
      } else if (marker.shape === 'arrowUp' || marker.shape === 'arrowDown') {
        const direction = marker.shape === 'arrowUp' ? -1 : 1;
        ctx.beginPath();
        ctx.moveTo(x, y + direction * size);
        ctx.lineTo(x - size * 0.7, y - direction * size * 0.4);
        ctx.lineTo(x + size * 0.7, y - direction * size * 0.4);
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.arc(x, y, size / 2, 0, Math.PI * 2);
        ctx.fill();
      }

      if (marker.text) {
        const offset = marker.position === 'belowBar' ? size + 20 : -(size + 20);
        ctx.fillText(marker.text, x, y + offset);
      }
    }
    ctx.restore();
  }

  /**
   * Build the toolbar, loading its code only if it is going to be shown.
   *
   * `ToolbarWidget` is the largest thing in `src/gui/` at 508 lines, and it is
   * the part of this package neither reference engine ships: Lightweight Charts
   * has no toolbar at all. A static import puts it in every consumer's bundle
   * whether or not they set `toolbar.visible`, which is most of the size gap
   * against them. Imported dynamically, a chart configured without a toolbar
   * never fetches the chunk.
   *
   * Mounting is therefore asynchronous, which is why the height is applied and
   * the layout re-run inside the promise rather than by the caller.
   */
  private async _mountToolbar(): Promise<void> {
    if (!this._options.toolbar.visible || this._isDestroyed) return;
    const { ToolbarWidget } = await import('./gui/ToolbarWidget');
    if (this._isDestroyed || !this._options.toolbar.visible) return;
    this._toolbar = new ToolbarWidget(this._createToolbarHost());
    this._toolbar.mount();
    this._toolbarHeight = this._toolbar.height;
    this._layout();
  }

  /**
   * Build the optional GUI widgets, loading each only if it is enabled.
   *
   * Same reasoning as the toolbar: the tooltip, style menu and legend are 519
   * lines that neither reference engine ships, and a static import makes every
   * consumer download them. Each is behind an `options.gui` flag and a dynamic
   * import, so switching one off removes its code from the page rather than
   * hiding it.
   *
   * Every await is followed by a destroyed check: a chart can be torn down
   * while its widgets are still loading, and mounting into a dead chart leaves
   * DOM nobody owns.
   */
  private async _mountGuiWidgets(): Promise<void> {
    const gui = this._options.gui;

    if (gui.tooltip) {
      const { DataTooltipWidget } = await import('./gui/DataTooltipWidget');
      if (this._isDestroyed) return;
      this._dataTooltip = new DataTooltipWidget(this._createDataTooltipHost());
      this._dataTooltip.mount();
    }

    if (gui.styleMenu) {
      const { SeriesStyleMenu } = await import('./gui/SeriesStyleMenu');
      if (this._isDestroyed) return;
      this._seriesStyleMenu = new SeriesStyleMenu(this._createSeriesStyleMenuHost());
    }

    if (gui.legend) {
      const { LegendWidget } = await import('./gui/LegendWidget');
      if (this._isDestroyed) return;
      this._legendWidget = new LegendWidget(this._createLegendHost());
      this.update(InvalidationLevel.Light);
    }
  }

  public attachPrimitive(primitive: ChartPrimitive) {
    this._primitiveManager.attach(primitive);
    this.update(InvalidationLevel.Full);
  }

  public detachPrimitive(id: string) {
    this._primitiveManager.detach(id);
    this.update(InvalidationLevel.Full);
  }

  public getPrimitive(id: string): ChartPrimitive | null {
    return this._primitiveManager.get(id);
  }

  public getPrimitives(): ChartPrimitive[] {
    return this._primitiveManager.list();
  }

  // ── Event subscriptions ──────────────────────────────────────────

  /**
   * Generic typed subscription. Returns an unsubscribe function.
   * Prefer the named helpers below for the common events.
   */
  public subscribe<K extends ChartEventName>(event: K, handler: ChartEventHandler<K>): () => void {
    return this._events.on(event, handler);
  }

  public unsubscribe<K extends ChartEventName>(event: K, handler: ChartEventHandler<K>) {
    this._events.off(event, handler);
  }

  /** Fires on a click that was not a drag, pan, or drawing interaction. */
  public subscribeClick(handler: (params: ChartMouseEventParams) => void): () => void {
    return this._events.on('click', handler);
  }

  public subscribeDblClick(handler: (params: ChartMouseEventParams) => void): () => void {
    return this._events.on('dblClick', handler);
  }

  public subscribeContextMenu(handler: (params: ChartMouseEventParams) => void): () => void {
    return this._events.on('contextMenu', handler);
  }

  /** Fires whenever the crosshair moves, including when it leaves the chart. */
  public subscribeCrosshairMove(handler: (params: ChartMouseEventParams) => void): () => void {
    return this._events.on('crosshairMove', handler);
  }

  /** Fires when the visible timestamp range changes (pan, zoom, data change). */
  public subscribeVisibleTimeRangeChange(handler: (range: TimeRange) => void): () => void {
    return this._events.on('visibleTimeRangeChange', handler);
  }

  /** Fires when the chart's pixel dimensions change. */
  public subscribeSizeChange(handler: (size: ChartSizeParams) => void): () => void {
    return this._events.on('sizeChange', handler);
  }

  /** Fires on overlay create / update / remove / select / deselect. */
  public subscribeOverlayChange(handler: (params: OverlayChangeParams) => void): () => void {
    return this._events.on('overlayChange', handler);
  }

  /** Fires when the main series data is replaced or a bar is appended. */
  public subscribeDataChange(handler: (params: DataChangeParams) => void): () => void {
    return this._events.on('dataChange', handler);
  }

  /**
   * Build the parameter payload for a pointer event. `x`/`y` are in
   * chart-content pixel space (the same space overlays are drawn in).
   */
  /** Client coordinates → chart-content pixel space (the overlay drawing space). */
  private _toChartContentPoint(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this._container.getBoundingClientRect();
    return {
      x: clientX - rect.left - this._leftYAxisWidth,
      y: clientY - rect.top - (this._toolbarHeight + this._xAxisHeight),
    };
  }

  private _buildMouseEventParams(
    x: number,
    y: number,
    sourceEvent: PointerEvent | null = null,
  ): ChartMouseEventParams {
    const paneId = this._activePricePaneId;
    const transformer = this.getPaneTransformer(paneId);
    const logical = this.coordinateToLogical(x);
    // `y` is measured from the top of the plot, but a transformer maps within
    // its own pane. Every other call site converts first; this one did not, so
    // `price` was off by the pane's top offset for any pane but the first.
    const paneTop = this._panes.find(pane => pane.getId() === paneId)?.getBounding().top;
    const localY = paneTop === undefined ? y : this._getPaneLocalY(y, paneTop);

    return {
      time: this.coordinateToTimestamp(x),
      logical,
      point: { x, y },
      price: transformer ? transformer.yToPrice(localY) : null,
      bar: this._hoveredData,
      paneId,
      overlay: this._overlayManager.findOverlayAt(x, localY, transformer, this._dataStore),
      sourceEvent,
    };
  }

  private _emitOverlayChange(reason: OverlayChangeReason, overlay: Overlay | null) {
    if (!this._events.hasSubscribers('overlayChange')) return;
    this._events.emit('overlayChange', { reason, overlay });
  }

  private _notifyVisibleTimeRangeChange(range: LogicalRange) {
    if (!this._events.hasSubscribers('visibleTimeRangeChange')) return;
    this._events.emit('visibleTimeRangeChange', {
      from: this._dataStore.logicalIndexToTimestamp(range.from),
      to: this._dataStore.logicalIndexToTimestamp(range.to),
    });
  }

  // ── Localization ─────────────────────────────────────────────────

  /** Translate a UI key using the chart's active locale. */
  public t(key: TranslationKey, params?: Record<string, string | number>): string {
    return this._i18n.t(key, params);
  }

  public getLocale(): string {
    return this._i18n.getLocale();
  }

  /**
   * Switch UI language. Rebuilds the toolbar so already-rendered labels pick
   * up the new dictionary.
   */
  public setLocale(locale: string) {
    this._options = mergeChartOptions(this._options, { localization: { locale } });
    this._i18n.setLocale(locale);
    this._timeFormatter.setConfig({ locale: this._options.localization.locale });
    if (this._toolbar) {
      // Labels are baked into the DOM at build time, so a language switch
      // means rebuilding the toolbar rather than patching it.
      this._toolbar.destroy();
      this._toolbar = null;
      void this._mountToolbar();
    }
    this._layout();
    this.update();
  }

  /** The "nice" price-grid step for the current viewport, used to keep every
   *  off-axis readout (crosshair, extremes, price lines) at the same precision
   *  as the axis ticks. */
  private _viewportPriceStep(): number {
    const transformer = this._coordinateTransformer;
    const bounding = this._container.getBoundingClientRect();
    const topPrice = transformer.yToPrice(0);
    const bottomPrice = transformer.yToPrice(bounding.height || 500);
    const range = Math.abs(topPrice - bottomPrice);
    if (range <= 0) return 1;

    const roughStep = range / 6;
    const exponent = Math.floor(Math.log10(roughStep));
    const fraction = roughStep / Math.pow(10, exponent);
    let niceFraction;
    if (fraction < 1.5) niceFraction = 1;
    else if (fraction < 3) niceFraction = 2;
    else if (fraction < 7) niceFraction = 5;
    else niceFraction = 10;
    return niceFraction * Math.pow(10, exponent);
  }

  private _formatPriceValue(price: number): string {
    const formatter = this._options.localization.priceFormatter;
    if (formatter) return formatter(price);
    return price.toLocaleString(
      this._options.localization.locale,
      priceFormatOptions(price, this._viewportPriceStep()),
    );
  }

  private _formatTimeValue(timestamp: number, context: 'axis' | 'crosshair' = 'crosshair'): string {
    const formatter = this._options.localization.timeFormatter;
    if (formatter) return formatter(timestamp, context);
    if (this._period) {
      return context === 'axis'
        ? this._timeFormatter.formatAxisTick(timestamp)
        : this._timeFormatter.formatCrosshair(timestamp);
    }
    return new Intl.DateTimeFormat(this._options.localization.locale, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: this._options.localization.timeZone,
    }).format(new Date(timestamp));
  }

  // ── Period / Session API ─────────────────────────────────────────

  /**
   * Declare the bar interval. Accepts `'15m'`, `'4H'`, `'1D'`, `'3M'` or a
   * `Period` object. Declaring it makes axis tick granularity deterministic
   * instead of inferred from bar spacing.
   */
  public setPeriod(period: string | Period | null) {
    this._options = mergeChartOptions(this._options, {
      timeScale: { period: period ?? undefined },
    });
    this._refreshTimeSemantics();
    this._xAxis.setTimeFormatter(this._period ? this._timeFormatter : null);
    this.update();
  }

  public getPeriod(): Period | null {
    return this._period;
  }

  /**
   * The period actually in effect: the declared one, or an inference from the
   * measured bar interval when nothing was declared.
   */
  public getEffectivePeriod(): Period {
    return this._period ?? inferPeriod(this._dataStore.getRegularInterval());
  }

  /**
   * Declare the trading session. Accepts a `SESSION_PRESETS` key
   * (`'us-equity'`, `'cn-a-share'`, `'crypto-24x7'`, …) or a `TradingSession`.
   * Lets the time axis tell a closed market apart from missing data.
   */
  public setSession(session: string | TradingSession | null) {
    this._options = mergeChartOptions(this._options, {
      timeScale: { session: session ?? undefined },
    });
    this._refreshTimeSemantics();
    this.update();
  }

  public getSession(): TradingSession | null {
    return this._session;
  }

  public removeSeriesAt(index: number) {
    const series = this._series[index];
    if (!series) return;

    this._seriesStyleMenu?.close();

    this._series.splice(index, 1);
    if (series === this._mainSeries) {
      this._mainSeries = null;
    }
    this.update();
  }

  public clearOverlays() {
    this.clearActiveDrawingLayer();
  }

  public clearActiveDrawingLayer() {
    if (this._overlayManager.getOverlays().length === 0) return;
    this._saveHistory();
    this._overlayManager.getOverlays().forEach(overlay => {
      this._emitOverlayEvent(overlay, 'onRemoved');
    });
    this._overlayManager.clear();
    this._setSelectedOverlay(null);
    this.saveState();
    this.update();
  }

  public getDrawingLayers(): DrawingLayer[] {
    this._commitActiveDrawingLayer();
    return this._drawingLayers.map(layer => ({
      ...layer,
      overlays: layer.overlays.map(overlay => ({ ...overlay })),
    }));
  }

  public getActiveDrawingLayerId(): string {
    return this._activeDrawingLayerId;
  }

  public createDrawingLayer(name?: string): DrawingLayer {
    this._cancelInProgressDrawing();
    this._commitActiveDrawingLayer();
    const now = Date.now();
    const layer: DrawingLayer = {
      id: `layer_${now}_${this._drawingLayers.length}`,
      name: name || `Layer ${this._drawingLayers.length + 1}`,
      overlays: [],
      createdAt: now,
      updatedAt: now,
    };
    this._drawingLayers.push(layer);
    this._activeDrawingLayerId = layer.id;
    this._overlayManager.setOverlays([]);
    this._setSelectedOverlay(null);
    this._history = [];
    this._redoStack = [];
    this.saveState();
    this.update(InvalidationLevel.Overlay);
    return { ...layer, overlays: [] };
  }

  public setActiveDrawingLayer(layerId: string) {
    if (layerId === this._activeDrawingLayerId) return;
    const targetLayer = this._drawingLayers.find(layer => layer.id === layerId);
    if (!targetLayer) return;
    this._cancelInProgressDrawing();
    this._commitActiveDrawingLayer();
    this._activeDrawingLayerId = layerId;
    this._overlayManager.setOverlays(targetLayer.overlays.map(overlay => ({ ...overlay })));
    this._setSelectedOverlay(null);
    this._history = [];
    this._redoStack = [];
    this.saveState();
    this.update(InvalidationLevel.Overlay);
  }

  public renameDrawingLayer(layerId: string, name: string) {
    const layer = this._drawingLayers.find(item => item.id === layerId);
    if (!layer) return;
    const normalizedName = name.trim();
    if (!normalizedName) return;
    layer.name = normalizedName;
    layer.updatedAt = Date.now();
    this.saveState();
  }

  public deleteDrawingLayer(layerId: string) {
    if (this._drawingLayers.length <= 1) return;
    if (this._activeDrawingLayerId === layerId) {
      this._cancelInProgressDrawing();
    }
    this._commitActiveDrawingLayer();
    const layerIndex = this._drawingLayers.findIndex(layer => layer.id === layerId);
    if (layerIndex < 0) return;
    const layer = this._drawingLayers[layerIndex];
    layer.overlays.forEach(overlay => this._emitOverlayEvent(overlay, 'onRemoved'));
    this._drawingLayers.splice(layerIndex, 1);

    if (this._activeDrawingLayerId === layerId) {
      const nextLayer = this._drawingLayers[Math.max(0, layerIndex - 1)] ?? this._drawingLayers[0];
      this._activeDrawingLayerId = nextLayer.id;
      this._overlayManager.setOverlays(nextLayer.overlays.map(overlay => ({ ...overlay })));
      this._setSelectedOverlay(null);
      this._history = [];
      this._redoStack = [];
      this.update(InvalidationLevel.Overlay);
    }
    this.saveState();
  }

  public createOverlay(overlay: Overlay | (Omit<Overlay, 'id'> & { id?: string }), emitLifecycle = true): Overlay {
    // Template defaults fill gaps only — anything the caller set wins.
    const templateDefaults = this._overlayManager.getDefaultOverlayFields(overlay.type);
    const withDefaults = { ...templateDefaults, ...overlay };
    const normalizedOverlay: Overlay = withDefaults.id
      ? withDefaults as Overlay
      : { ...withDefaults, id: `overlay_${Date.now()}_${this._overlayManager.getOverlays().length}` };
    this._saveHistory();
    if (emitLifecycle) this._emitOverlayEvent(normalizedOverlay, 'onDrawStart');
    this._overlayManager.addOverlay(normalizedOverlay);
    if (emitLifecycle) this._emitOverlayEvent(normalizedOverlay, 'onDrawEnd');
    // A provisional overlay placed by the first point of a multi-point tool is
    // added with `emitLifecycle = false`; it is not a finished overlay, so it
    // must not surface as a `created` change. The completion path emits that.
    if (emitLifecycle) this._emitOverlayChange('created', normalizedOverlay);
    this.saveState();
    this.update();
    return normalizedOverlay;
  }

  public registerOverlayTemplate(template: OverlayTemplate) {
    this._overlayManager.registerTemplate(template);
  }

  public getRegisteredOverlayTypes(): string[] {
    return this._overlayManager.getRegisteredTypes();
  }

  public removeOverlay(overlayId: string) {
    const overlay = this._overlayManager.getOverlayById(overlayId);
    if (!overlay) return;
    // Locking is what makes an overlay safe from stray Delete presses, so it
    // has to hold here and not only in hit testing.
    if (overlay.locked) return;

    this._saveHistory();
    this._overlayManager.removeOverlay(overlayId);
    this._emitOverlayEvent(overlay, 'onRemoved');
    this._emitOverlayChange('removed', overlay);
    this._interaction.forgetOverlay(overlayId);
    if (this._selectedOverlay?.id === overlayId) {
      this._setSelectedOverlay(null);
    }
    this.saveState();
    this.update();
  }

  public getOverlays(): Overlay[] {
    return this._overlayManager.getOverlays();
  }

  public updateOverlay(overlayId: string, update: Partial<Omit<Overlay, 'id'>>) {
    // Must go through the manager: getOverlays() hands back sanitized copies,
    // so assigning to one of those would silently discard the update.
    if (!this._overlayManager.getOverlayById(overlayId)) return;
    this._saveHistory();
    const updated = this._overlayManager.override(overlayId, update);
    this._emitOverlayChange('updated', updated);
    this.saveState();
    this.update();
  }

  // ── Overlay metadata ─────────────────────────────────────────────

  /** Lock an overlay so it renders but cannot be selected, moved, or deleted. */
  public setOverlayLocked(overlayId: string, locked: boolean) {
    if (!this._overlayManager.setLocked(overlayId, locked)) return;
    if (locked && this._selectedOverlay?.id === overlayId) {
      this._setSelectedOverlay(null);
    }
    this.saveState();
    this.update(InvalidationLevel.Overlay);
  }

  /** Show or hide an overlay without removing it. */
  public setOverlayVisible(overlayId: string, visible: boolean) {
    if (!this._overlayManager.setVisible(overlayId, visible)) return;
    if (!visible && this._selectedOverlay?.id === overlayId) {
      this._setSelectedOverlay(null);
    }
    this.saveState();
    this.update(InvalidationLevel.Overlay);
  }

  /** Set paint order within the overlay layer. Higher values draw on top. */
  public setOverlayZLevel(overlayId: string, zLevel: number) {
    if (!this._overlayManager.setZLevel(overlayId, zLevel)) return;
    this.saveState();
    this.update(InvalidationLevel.Overlay);
  }

  public getOverlaysByGroup(groupId: string): Overlay[] {
    return this._overlayManager.getOverlaysByGroup(groupId);
  }

  /** Apply one update to every overlay sharing a `groupId`. */
  public updateOverlayGroup(groupId: string, update: Partial<Omit<Overlay, 'id'>>) {
    this._saveHistory();
    const changed = this._overlayManager.overrideGroup(groupId, update);
    if (changed === 0) return;
    this.saveState();
    this.update(InvalidationLevel.Overlay);
  }

  public removeOverlayGroup(groupId: string) {
    const targets = this._overlayManager.getOverlaysByGroup(groupId);
    if (targets.length === 0) return;
    this._saveHistory();
    targets.forEach(overlay => this._emitOverlayEvent(overlay, 'onRemoved'));
    this._overlayManager.removeGroup(groupId);
    if (this._selectedOverlay && targets.some(item => item.id === this._selectedOverlay?.id)) {
      this._setSelectedOverlay(null);
    }
    this.saveState();
    this.update(InvalidationLevel.Overlay);
  }

  public undo() {
    if (this._history.length === 0) return;
    this._redoStack.push(JSON.stringify(this._overlayManager.getOverlays()));
    const prevState = this._history.pop();
    if (prevState) {
      this._overlayManager.setOverlays(JSON.parse(prevState));
      this.saveState();
      this.update();
    }
  }

  public redo() {
    if (this._redoStack.length === 0) return;
    this._history.push(JSON.stringify(this._overlayManager.getOverlays()));
    const nextState = this._redoStack.pop();
    if (nextState) {
      this._overlayManager.setOverlays(JSON.parse(nextState));
      this.saveState();
      this.update();
    }
  }

  private _saveHistory() {
    this._history.push(JSON.stringify(this._overlayManager.getOverlays()));
    if (this._history.length > this._maxHistory) this._history.shift();
    this._redoStack = []; // Clear redo stack on new action
  }

  private _commitActiveDrawingLayer() {
    const layer = this._drawingLayers.find(item => item.id === this._activeDrawingLayerId);
    if (!layer) return;
    layer.overlays = this._overlayManager.getOverlays();
    layer.updatedAt = Date.now();
  }

  private _cancelInProgressDrawing() {
    if (this._isCreatingOverlay && this._drawingOverlay) {
      this._overlayManager.removeOverlay(this._drawingOverlay.id);
      this._emitOverlayEvent(this._drawingOverlay, 'onRemoved');
    }
    this._isCreatingOverlay = false;
    this._drawingOverlay = null;
    this._drawingFixedPointCount = 0;
  }

  private _normalizeDrawingLayers(layers: Partial<DrawingLayer>[]): DrawingLayer[] {
    const now = Date.now();
    return layers
      .filter(layer => Array.isArray(layer.overlays))
      .map((layer, index) => ({
        id: typeof layer.id === 'string' && layer.id ? layer.id : `layer_${now}_${index}`,
        name: typeof layer.name === 'string' && layer.name ? layer.name : `Layer ${index + 1}`,
        overlays: layer.overlays as Overlay[],
        createdAt: typeof layer.createdAt === 'number' ? layer.createdAt : now,
        updatedAt: typeof layer.updatedAt === 'number' ? layer.updatedAt : now,
      }));
  }

  public saveState() {
    if (!this._options.persistence.enabled) return;
    try {
      this._commitActiveDrawingLayer();
      this._syncChartStore();
      const chartState = this._chartStore.getState();
      const state = {
        version: PERSISTED_STATE_VERSION,
        options: this._options,
        drawingLayers: this._drawingLayers,
        activeDrawingLayerId: this._activeDrawingLayerId,
        paneWeights: chartState.paneWeights,
        viewport: chartState.viewport,
        priceScaleMode: this._priceScale.mode,
        invertScale: this._priceScale.inverted,
      };
      localStorage.setItem(this._options.persistence.key, JSON.stringify(state));
    } catch (e) {
      console.warn('Failed to save state to localStorage', e);
    }
  }

  public loadState() {
    if (!this._options.persistence.enabled) return;
    try {
      // Only the current schema is accepted. Older state is intentionally reset.
      const state = parsePersistedState(localStorage.getItem(this._options.persistence.key));
      if (state) {
        if (state.options) {
            // Exclude layout appearance (background color, textColor) from saved state —
            // those are controlled by the external theme system and must not be overwritten.
            const { layout: _ignoredLayout, ...otherOptions } = state.options;
            void _ignoredLayout;
            this._options = mergeChartOptions(this._options, otherOptions as DeepPartial<ChartOptions>);
            this._refreshTimeSemantics();
            this._recreateAxes();
            this._applyStructuralOptions();
        }
        if (Array.isArray(state.drawingLayers)) {
            const layers = this._normalizeDrawingLayers(state.drawingLayers as Partial<DrawingLayer>[]);
            if (layers.length > 0) {
              this._drawingLayers = layers;
              this._activeDrawingLayerId = layers.some(layer => layer.id === state.activeDrawingLayerId)
                ? (state.activeDrawingLayerId as string)
                : layers[0].id;
              const activeLayer = layers.find(layer => layer.id === this._activeDrawingLayerId) ?? layers[0];
              this._overlayManager.setOverlays(activeLayer.overlays.map(overlay => ({ ...overlay })));
            }
        }
        if (state.paneWeights) {
            this._paneManager.setWeights(state.paneWeights);

        }
        if (state.viewport) {
            this._offset = state.viewport.offset ?? this._offset;
            this._barSpacing = state.viewport.barSpacing ?? this._barSpacing;
            this._yScale = state.viewport.yScale ?? this._yScale;
            this._yOffset = state.viewport.yOffset ?? this._yOffset;
            this._coordinateTransformer.setOffset(this._offset);
            this._coordinateTransformer.setBarSpacing(this._barSpacing);
            this._applyYTransform();
        }
        if (state.priceScaleMode) {
            this._priceScale.mode = state.priceScaleMode;
        }
        if (state.invertScale !== undefined) {
            this._priceScale.inverted = state.invertScale;
        }
        this._normalizePaneWeights();
      }
    } catch (e) {
      console.warn('Failed to load state from localStorage', e);
    }
  }

  public setSyncGroup(group: ChartSyncGroup | null) {
    if (this._syncGroup && this._syncGroup !== group) {
      this._syncGroup.removeChart(this);
    }
    this._syncGroup = group;
    if (group) group.addChart(this);
  }

  public syncState(state: { offset?: number; barSpacing?: number; yScale?: number; yOffset?: number }) {
    let shouldNormalizeY = false;

    if (state.offset !== undefined) {
      this._offset = state.offset;
      this._coordinateTransformer.setOffset(state.offset);
    }
    if (state.barSpacing !== undefined) {
      this._barSpacing = state.barSpacing;
      this._coordinateTransformer.setBarSpacing(state.barSpacing);
    }
    if (state.yScale !== undefined) {
      this._yScale = state.yScale;
      shouldNormalizeY = true;
    }
    if (state.yOffset !== undefined) {
      this._yOffset = state.yOffset;
      shouldNormalizeY = true;
    }
    if (shouldNormalizeY) {
      this._normalizeMainPaneViewport();
    }
    this._enforceHorizontalViewportBounds();
    this.update();
  }

  public syncCrosshair(pos: { x: number, y: number } | null) {
    this._remoteCrosshairPos = pos;
    this.update();
  }

  /**
   * Point the pane's own transformer at that pane's geometry, ready for a hit
   * test. The price range is not touched: it belongs to the pane's last render
   * and is exactly what the hit test has to agree with.
   */
  private _preparePaneTransformer(pane: Pane): CoordinateTransformer {
      const bounding = pane.getBounding();
      const realWidth = bounding.width - this._leftYAxisWidth - this._rightYAxisWidth;
      const realHeight = bounding.height;
      const transformer = this._paneTransformers.for(pane.getId());
      transformer.setDimensions(realWidth, realHeight);

      // Sync state for hit testing
      this._applyYTransformForPane(pane.getId(), transformer);
      transformer.setBarSpacing(this._barSpacing);
      transformer.setOffset(this._offset);
      this._hitTestTransformer = transformer;
      return transformer;
  }

  private _clampHorizontalViewport() {
    const data = this._dataStore.getData();
    const chartWidth = this._getPaneChartWidth();
    if (data.length === 0 || chartWidth <= 0) return false;

    const rightMargin = chartWidth * this._rightMarginRatio;
    const minOffset = -Math.max(1, (rightMargin - this._barSpacing / 2) / this._barSpacing);
    const maxOffset = (data.length - 1) + Math.max(1, (chartWidth - rightMargin - this._barSpacing / 2) / this._barSpacing);
    const clampedOffset = Math.min(maxOffset, Math.max(minOffset, this._offset));

    if (clampedOffset === this._offset) return false;

    this._offset = clampedOffset;
    this._coordinateTransformer.setOffset(this._offset);
    return true;
  }

  private _zoom(factor: number, centerX?: number, anchorIndex?: number) {
    const chartWidth = this._getPaneChartWidth();
    const mouseX = centerX !== undefined
      ? Math.max(0, Math.min(chartWidth, centerX))
      : chartWidth / 2;
    // Use pre-captured anchor index if provided; otherwise compute from transformer.
    // xToIndex(x) = (x - (width - rightMargin) + barSpacing/2) / barSpacing + offset
    // The usable plot width excludes the configured right margin.
    const mouseIndex = anchorIndex !== undefined
      ? anchorIndex
      : this._coordinateTransformer.xToIndex(mouseX);
    
    const newSpacing = Math.max(getMinimumBarSpacing(this._dataStore.getData().length, this._getPaneChartWidth()), Math.min(100, this._barSpacing * factor));
    if (newSpacing === this._barSpacing) return;
    
    this._barSpacing = newSpacing;
    this._coordinateTransformer.setBarSpacing(this._barSpacing);
    
    // Correct formula derived from CoordinateTransformer.xToIndex:
    // newOffset = mouseIndex - (mouseX - chartWidth*0.8 + newBarSpacing/2) / newBarSpacing
    this._offset = mouseIndex - (mouseX - chartWidth * (1 - this._rightMarginRatio) + this._barSpacing / 2) / this._barSpacing;
    this._coordinateTransformer.setOffset(this._offset);
    this._enforceHorizontalViewportBounds();
    
    if (this._syncGroup) {
      this._syncGroup.sync(this, { offset: this._offset, barSpacing: this._barSpacing });
    }
    this.update();
  }

  private _zoomY(factor: number, paneId: string = 'main') {
    // The model owns the zoom bounds for every pane, so the clamping is not
    // rewritten per call site. What follows the zoom does differ: only the main
    // pane renormalizes its viewport and drives linked charts.
    const scale = this._priceScaleFor(paneId);
    const previousOffset = scale.offset;
    // A zoom already pinned at a bound reports no change, so a held gesture
    // cannot spam linked charts with no-op syncs.
    const scaleChanged = scale.zoomBy(factor);

    if (paneId !== 'main') {
      this.update();
      return;
    }

    this._normalizeMainPaneViewport();
    if (!scaleChanged && this._yOffset === previousOffset) return;

    if (this._syncGroup) {
      this._syncGroup.sync(this, { yScale: this._yScale, yOffset: this._yOffset });
    }
    this.update();
  }

  public setData(data: KLineData[]) {
    this._dataStore.setData(data);
    this._indicatorManager.calcAll(data);
    this._autoScale(true);
    
    // Auto-position to latest
    this._coordinateTransformer.setOffsetToLatest(data.length);
    this._offset = this._coordinateTransformer.getOffset();
    this._enforceHorizontalViewportBounds();
    
    this.update();
    this._events.emit('dataChange', { reason: 'set', count: data.length, bar: null });
  }

  public updateData(data: KLineData) {
    const currentData = this._dataStore.getData();
    const previousLastIndex = currentData.length - 1;
    const shouldFollowLatest = currentData.length === 0 || this._offset >= previousLastIndex - 0.5;

    this._dataStore.addData(data);
    const nextData = this._dataStore.getData();
    this._indicatorManager.calcAll(nextData);
    this._autoScale(false);

    if (shouldFollowLatest) {
      this._coordinateTransformer.setOffsetToLatest(nextData.length);
      this._offset = this._coordinateTransformer.getOffset();
    }

    this._enforceHorizontalViewportBounds();
    this.update(InvalidationLevel.Full);
    this._events.emit('dataChange', { reason: 'update', count: nextData.length, bar: data });
  }

  public getData(): KLineData[] {
    return this._dataStore.getData();
  }

  public timestampToCoordinate(timestamp: number): number {
    return this._coordinateTransformer.timestampToXUnbounded(timestamp, this._dataStore);
  }

  public coordinateToTimestamp(x: number): number | null {
    return this._coordinateTransformer.xToTimestamp(x, this._dataStore);
  }

  public logicalToCoordinate(logicalIndex: number): number {
    return this._coordinateTransformer.indexToX(logicalIndex);
  }

  public coordinateToLogical(x: number): number {
    return this._coordinateTransformer.xToIndex(x);
  }

  public getVisibleLogicalRange(): { from: number; to: number } {
    const mainPane = this._panes.find(pane => pane.getId() === 'main');
    const width = mainPane
      ? mainPane.getBounding().width - this._rightYAxisWidth - this._leftYAxisWidth
      : this._container.clientWidth - this._rightYAxisWidth - this._leftYAxisWidth;
    return {
      from: this._coordinateTransformer.xToIndex(0),
      to: this._coordinateTransformer.xToIndex(Math.max(width, 0)),
    };
  }

  /**
   * Put `range.from` at the left edge of the plot and `range.to` at the right.
   *
   * `_offset` is the logical index sitting half a bar in from the right edge --
   * that is what `CoordinateTransformer.indexToX` measures from. The previous
   * implementation subtracted a whole viewport's worth of bars from it, so the
   * requested range landed one screen to the left: asking for bars 0..25 of a
   * 26-bar series showed -24..1, with bar 0 pinned to the *right* edge and
   * everything before it empty. A sparkline asked to fill its card therefore
   * drew a short line in the right-hand third of it.
   *
   * Solving `indexToX(from) = 0` and `indexToX(to) = plotWidth - rightMargin`
   * together gives the two lines below, and nothing else.
   */
  public setVisibleLogicalRange(range: { from: number; to: number }) {
    const span = Math.max(range.to - range.from, 1);
    const mainPane = this._panes.find(pane => pane.getId() === 'main');
    const width = mainPane
      ? mainPane.getBounding().width - this._rightYAxisWidth - this._leftYAxisWidth
      : this._container.clientWidth - this._rightYAxisWidth - this._leftYAxisWidth;
    const realWidth = Math.max(width, 1);
    const rightMargin = realWidth * this._rightMarginRatio;

    this._barSpacing = Math.max(1, Math.min(100, Math.max(realWidth - rightMargin, 1) / span));
    this._coordinateTransformer.setBarSpacing(this._barSpacing);
    this._offset = range.to - 0.5;
    this._coordinateTransformer.setOffset(this._offset);
    this._enforceHorizontalViewportBounds();
    this.update(InvalidationLevel.Full);
  }

  public async takeScreenshot(): Promise<string> {
    const dpr = window.devicePixelRatio || 1;
    const finalCanvas = document.createElement('canvas');
    const width = this._container.clientWidth;
    const height = this._container.clientHeight;
    finalCanvas.width = width * dpr;
    finalCanvas.height = height * dpr;
    const ctx = finalCanvas.getContext('2d');
    if (!ctx) return '';

    // `drawImage` throws on a zero-sized source (an inactive Y-axis rail keeps a
    // 0-width canvas), so every blit goes through this guard.
    const blit = (source: HTMLCanvasElement | null | undefined, x: number, y: number) => {
      if (source && source.width > 0 && source.height > 0) ctx.drawImage(source, x, y);
    };

    // Draw background
    ctx.fillStyle = this._options.layout.background.color;
    ctx.fillRect(0, 0, finalCanvas.width, finalCanvas.height);

    // Render all panes
    for (const pane of this._panes) {
      const paneBounding = pane.getBounding();
      const top = paneBounding.top * dpr;
      
      const layers: Array<'grid' | 'main' | 'overlay'> = ['grid', 'main', 'overlay'];
      for (const layer of layers) {
        // Chart Area
        const chartCanvas = pane.getCanvas(layer, 'chart');
        if (chartCanvas) {
          const left = Number.parseFloat(chartCanvas.style.left || '0') * dpr;
          blit(chartCanvas, left, top);
        }
        // Y Axes
        (['leftYAxis', 'rightYAxis'] as const).forEach(area => {
          const axisCanvas = pane.getCanvas(layer, area);
          if (axisCanvas) {
            const left = Number.parseFloat(axisCanvas.style.left || '0') * dpr;
            blit(axisCanvas, left, top);
          }
        });
      }
    }

    // Render X-Axis Rulers
    const drawX = (canvases: Map<string, HTMLCanvasElement>, topOffset: number) => {
      ['grid', 'overlay'].forEach(layer => {
        const canvas = canvases.get(layer);
        if (canvas) {
          const left = Number.parseFloat(canvas.style.left || '0') * dpr;
          blit(canvas, left, topOffset * dpr);
        }
      });
    };
    
    if (this._topXHeight > 0) drawX(this._topXAxisCanvases, this._toolbarHeight);
    if (this._bottomXHeight > 0) drawX(this._bottomXAxisCanvases, height - this._bottomXHeight);

    return finalCanvas.toDataURL('image/png');
  }

  public toggleFullScreen() {
    if (!document.fullscreenElement) {
      this._container.requestFullscreen().catch(err => {
        console.warn('Fullscreen request failed', err);
      });
    } else {
      document.exitFullscreen();
    }
  }

  private _autoScale(force = false) {
    const data = this._dataStore.getData();
    if (data.length === 0) return;
    // Cached scan rather than `Math.max(...prices)`: the spread form is a
    // RangeError past ~120,000 arguments, and this runs on every setData.
    const extent = this._priceExtent.extentOf(data);
    if (!extent) return;
    const { min, max } = extent;

    const paddedRange = getPaddedPriceRange(min, max);
    if (!force) {
      const currentRange = this._coordinateTransformer.getRange();
      // Keep the current scale only while it preserves the full 5% safety band.
      // New highs/lows that consume that band trigger an automatic refit.
      if (currentRange.max > currentRange.min) {
        if (paddedRange.min >= currentRange.min && paddedRange.max <= currentRange.max) {
          return;
        }
      }
    }

    this._coordinateTransformer.setRange(paddedRange.min, paddedRange.max);
  }

  private _layout() {
    const { clientWidth, clientHeight } = this._container;
    if (clientWidth === 0 || clientHeight === 0) return;
    this._refreshYAxisWidths();
    this._normalizePaneWeights();
    
    const topXHeight = this._topXHeight;
    const bottomXHeight = this._bottomXHeight;
    const leftYWidth = this._leftYAxisWidth;
    const rightYWidth = this._rightYAxisWidth;

    const chartAreaHeight = clientHeight - this._toolbarHeight - topXHeight - bottomXHeight;
    const chartAreaWidth = clientWidth - leftYWidth - rightYWidth;
    
    this._coordinateTransformer.setDimensions(chartAreaWidth, chartAreaHeight);
    this._enforceHorizontalViewportBounds();
    
    // Where each pane sits is the layout model's arithmetic, not the view's.
    const paneLayout = this._paneManager.layout();
    const boxes = paneLayout.boxes(chartAreaHeight, this._toolbarHeight + topXHeight, this._panes.length);

    this._panes.forEach((pane, idx) => {
      const box = boxes[idx];
      if (!box) return;
      pane.resize({ width: clientWidth, height: box.height, left: 0, top: box.top }, leftYWidth, rightYWidth);

      // Keep legend inside chart area (not over y-axis)
      const legendDiv = this._legendDOMs.get(pane.getId());
      if (legendDiv) legendDiv.style.left = `${leftYWidth + 8}px`;

      // The divider element, its appearance and the press that starts a resize
      // all belong to the manager that owns it.
      if (idx < this._panes.length - 1) {
        this._paneManager.ensureDivider(idx, {
          left: leftYWidth,
          width: chartAreaWidth,
          top: box.top + box.height,
        });
      }
    });

    // Resize X-Axis Rulers (Top & Bottom)
    this._setupXAxisRuler('top', clientWidth, topXHeight, chartAreaWidth, this._toolbarHeight);
    this._setupXAxisRuler('bottom', clientWidth, bottomXHeight, chartAreaWidth, clientHeight - bottomXHeight);

    if (this._eventLayer) {
        this._eventLayer.style.left = '0';
      this._eventLayer.style.top = `${this._toolbarHeight}px`;
      this._eventLayer.style.height = `calc(100% - ${this._toolbarHeight}px)`;
        this._eventLayer.style.width = '100%';
    }
    this._emitSizeChangeIfNeeded(clientWidth, clientHeight);
    // Paint inline rather than scheduling. Resizing a canvas clears it, so
    // deferring the repaint to the next animation frame leaves one blank frame
    // on screen -- a flash on load and on every resize, measured as a fully
    // empty canvas between two identical painted ones.
    this._invalidation.raise(InvalidationLevel.Full);
    this._internalUpdate();
  }

  /** Emit `sizeChange` only on an actual change — _layout runs on every frame-ish event. */
  private _emitSizeChangeIfNeeded(width: number, height: number) {
    if (this._lastEmittedSize?.width === width && this._lastEmittedSize?.height === height) return;
    this._lastEmittedSize = { width, height };
    this._events.emit('sizeChange', { width, height });
  }

  private _setupXAxisRuler(position: 'top' | 'bottom', fullWidth: number, height: number, chartWidth: number, top: number) {
    const dpr = window.devicePixelRatio || 1;
    const canvasMap = position === 'top' ? this._topXAxisCanvases : this._bottomXAxisCanvases;
    
    ['grid', 'main', 'overlay'].forEach(layer => {
        let canvas = canvasMap.get(layer);
        if (!canvas) {
            canvas = document.createElement('canvas');
            canvas.style.position = 'absolute';
            canvas.style.zIndex = layer === 'overlay' ? '2100' : '0';
            this._container.appendChild(canvas);
            canvasMap.set(layer, canvas);
        }
        if (height <= 0) {
          canvas.style.display = 'none';
          canvas.style.height = '0px';
          canvas.height = 0;
          return;
        }
        canvas.style.display = 'block';
        canvas.style.left = '0px';
        canvas.style.top = `${top}px`;
        canvas.style.width = `${fullWidth}px`;
        canvas.style.height = `${height}px`;
        canvas.width = fullWidth * dpr;
        canvas.height = height * dpr;
        const ctx = canvas.getContext('2d');
        if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    });
  }


  /**
   * Request a redraw.
   *
   * `paneId` narrows the request to one pane: an indicator added to a stacked
   * pane does not need the price pane, its overlays or its stacked scales
   * repainted. A request without one raises the level for every pane, which is
   * the safe default and what every existing caller gets.
   */
  public update(level: InvalidationLevel = InvalidationLevel.Full, paneId?: string) {
    if (this._isDestroyed) return;
    this._invalidation.raise(level, paneId);
    if (level >= InvalidationLevel.Light) {
      this._notifyVisibleLogicalRangeChange();
    }
    if (this._updateRequested) return;

    this._syncChartStore();
    this._updateRequested = true;
    this._updateRequestId = requestAnimationFrame(() => {
      this._updateRequestId = null;
      const pending = this._invalidation.maxLevel();
      this._primitiveManager.updateAll(pending);
      this._internalUpdate();
    });
  }

  private _drawPrimitivePaneViews(
    ctx: CanvasRenderingContext2D,
    paneId: string,
    layer: PrimitiveLayer,
    area: PrimitivePaneArea,
    bounding: Bounding,
    viewport: Bounding,
    transformer: CoordinateTransformer,
  ) {
    this._primitiveManager.drawPaneViews({
      ctx,
      paneId,
      layer,
      area,
      bounding,
      viewport,
      transformer,
    });
  }

  private _drawPrimitivePriceAxisViews(
    ctx: CanvasRenderingContext2D,
    paneId: string,
    side: 'left' | 'right',
    axisIndex: number,
    bounding: Bounding,
    transformer: CoordinateTransformer,
  ) {
    this._primitiveManager.drawPriceAxisViews({
      ctx,
      paneId,
      side,
      axisIndex,
      bounding,
      transformer,
    });
  }

  private _drawPrimitiveTimeAxisViews(
    ctx: CanvasRenderingContext2D,
    position: PrimitiveTimeAxisPosition,
    bounding: Bounding,
    transformer: CoordinateTransformer,
  ) {
    this._primitiveManager.drawTimeAxisViews({
      ctx,
      position,
      bounding,
      transformer,
    });
  }

  /**
   * The crosshair, and everything it draws outside the plot.
   *
   * Roughly a third of the main pane's render pass was this: the crosshair
   * itself, its horizontal extension into every visible price gutter with a
   * price label, and its vertical extension into both time rulers with a time
   * label. It reads a lot of the pass's locals, which is why it is a parameter
   * object rather than a method reaching back into fields -- the inputs are now
   * written down instead of inherited from the enclosing scope.
   */
  private _renderMainPaneCrosshair(params: {
    overlayCtx: CanvasRenderingContext2D;
    leftAxisOverlayCtx: CanvasRenderingContext2D;
    rightAxisOverlayCtx: CanvasRenderingContext2D;
    priceScales: PriceScaleFrame[];
    primaryScale: PriceScaleFrame;
    bounding: Bounding;
    realWidth: number;
    realHeight: number;
    data: KLineData[];
    /** Whether this pane is the bottom one, which owns the lower time ruler. */
    isBottomPane: boolean;
  }): void {
    const {
      overlayCtx,
      leftAxisOverlayCtx,
      rightAxisOverlayCtx,
      priceScales,
      primaryScale,
      bounding,
      realWidth,
      realHeight,
      data,
      isBottomPane,
    } = params;

    const crosshairPos = this._crosshairPos || this._remoteCrosshairPos;
    if (this._options.crosshair.visible && crosshairPos) {
      const localX = crosshairPos.x;
      const localY = crosshairPos.y - (bounding.top - (this._toolbarHeight + this._xAxisHeight));

      if (localY >= 0 && localY <= realHeight) {
        this._chrome.drawCrosshair(overlayCtx, realWidth, realHeight, { x: localX, y: localY });

        const crossColor = this._options.crosshair.color;
        const crossStyle = this._options.crosshair.style;

        priceScales.forEach(scale => {
          if (this._hiddenSeriesIds.has(scale.id)) return;
          const axisOverlayCtx = scale.side === 'left' ? leftAxisOverlayCtx : rightAxisOverlayCtx;
          // Draw horizontal crosshair extension line into y-axis
          this._withAxisColumn(axisOverlayCtx, scale.side, scale.axisIndex, realHeight, axisBounds => {
            axisOverlayCtx.save();
            axisOverlayCtx.strokeStyle = crossColor;
            axisOverlayCtx.lineWidth = 1;
            if (crossStyle === 'dashed') axisOverlayCtx.setLineDash([3, 3]);
            axisOverlayCtx.beginPath();
            axisOverlayCtx.moveTo(0, localY); axisOverlayCtx.lineTo(axisBounds.width, localY);
            axisOverlayCtx.stroke();
            axisOverlayCtx.setLineDash([]);
            axisOverlayCtx.restore();
            // Price label on top of the line
            this._yAxis.renderLabel(
              axisOverlayCtx,
              localY,
              this._formatPriceValue(scale.transformer.yToPrice(localY)),
              axisBounds,
              scale.side,
            );
          });
        });

        // Draw vertical crosshair extension into top x-axis
        const topXOverlayCtx = this._topXAxisCanvases.get('overlay')!.getContext('2d')!;
        topXOverlayCtx.save();
        topXOverlayCtx.strokeStyle = crossColor;
        topXOverlayCtx.lineWidth = 1;
        if (crossStyle === 'dashed') topXOverlayCtx.setLineDash([3, 3]);
        topXOverlayCtx.beginPath();
        topXOverlayCtx.moveTo(localX + this._leftYAxisWidth, 0); topXOverlayCtx.lineTo(localX + this._leftYAxisWidth, this._xAxisHeight);
        topXOverlayCtx.stroke();
        topXOverlayCtx.setLineDash([]);
        topXOverlayCtx.restore();

        if (isBottomPane) {
          const index = Math.round(primaryScale.transformer.xToIndex(localX));
          const item = data[index];
          if (item) {
            const timeText = this._formatTimeValue(item.timestamp, 'crosshair');
            // Bottom x-axis: draw extension line + label
            const bottomOverlayCtx = this._bottomXAxisCanvases.get('overlay')!.getContext('2d')!;
            bottomOverlayCtx.save();
            bottomOverlayCtx.strokeStyle = crossColor;
            bottomOverlayCtx.lineWidth = 1;
            if (crossStyle === 'dashed') bottomOverlayCtx.setLineDash([3, 3]);
            bottomOverlayCtx.beginPath();
            bottomOverlayCtx.moveTo(localX + this._leftYAxisWidth, 0); bottomOverlayCtx.lineTo(localX + this._leftYAxisWidth, this._xAxisHeight);
            bottomOverlayCtx.stroke();
            bottomOverlayCtx.setLineDash([]);
            bottomOverlayCtx.restore();
            this._xAxis.renderLabel(bottomOverlayCtx, localX, timeText, { width: realWidth, height: this._xAxisHeight, left: this._leftYAxisWidth, top: 0 }, 'bottom');
            // Also render on top x-axis
            this._xAxis.renderLabel(topXOverlayCtx, localX, timeText, { width: realWidth, height: this._xAxisHeight, left: this._leftYAxisWidth, top: 0 }, 'top');
          }
        }
      }
    }
  }

  /** The canvases of one pane, in the set the render pass needs. */
  private _paneContexts(pane: Pane): PaneContexts | null {
    const chart = pane.getContext('main', 'chart');
    const grid = pane.getContext('grid', 'chart');
    const overlay = pane.getContext('overlay', 'chart');
    const leftAxisGrid = pane.getContext('grid', 'leftYAxis');
    const leftAxisOverlay = pane.getContext('overlay', 'leftYAxis');
    const rightAxisGrid = pane.getContext('grid', 'rightYAxis');
    const rightAxisOverlay = pane.getContext('overlay', 'rightYAxis');
    if (!chart || !grid || !overlay || !leftAxisGrid || !leftAxisOverlay || !rightAxisGrid || !rightAxisOverlay) {
      return null;
    }
    return { chart, grid, overlay, leftAxisGrid, leftAxisOverlay, rightAxisGrid, rightAxisOverlay };
  }

  /**
   * The geometry of the frame about to be drawn, resolved before anything is.
   *
   * Pane boxes, plot rectangles, which pane is last and where the crosshair
   * falls are answered once, by a pure model, instead of being recomputed
   * inline in each branch of the render pass.
   */
  private _buildRenderFrame(): ChartFrame {
    return buildChartFrame({
      width: this._container.clientWidth,
      height: this._container.clientHeight,
      toolbarHeight: this._toolbarHeight,
      xAxisHeight: this._xAxisHeight,
      leftGutter: this._leftYAxisWidth,
      rightGutter: this._rightYAxisWidth,
      panes: this._panes.map(pane => ({
        id: pane.getId(),
        kind: pane.getId() === 'main' ? ('price' as const) : ('indicator' as const),
        bounding: pane.getBounding(),
        axisSide: pane.getYAxisSide(),
      })),
      crosshair: this._crosshairPos ?? this._remoteCrosshairPos,
      level: this._invalidation.globalLevel(),
      levelByPane: this._invalidation.byPane(),
    });
  }

  private _internalUpdate() {
    // Released first, before anything below can return early. The flag is what
    // `update()` checks to decide whether a frame is already scheduled, so a
    // pass that bailed out with it still set — a container that had not been
    // laid out yet, a chart in a hidden tab — latched it true forever and no
    // later `update()` ever scheduled another frame. The chart only came back
    // if a ResizeObserver happened to fire.
    this._updateRequested = false;
    if (this._isDestroyed) return;
    // `_layout` returns early for a container with no width or height, so the
    // time-axis canvases it creates do not exist yet. The render pass asserts
    // they do (`get('grid')!`), which turned a chart mounted in a collapsed
    // layout -- a hidden tab, an accordion, a flex child that has not settled --
    // into an uncaught TypeError on the next frame. Nothing can be drawn into a
    // zero-sized surface anyway; the next resize runs a real pass.
    if (!this._topXAxisCanvases.has('grid') || !this._bottomXAxisCanvases.has('grid')) return;
    if (this._container.clientWidth === 0 || this._container.clientHeight === 0) return;

    const frame = this._buildRenderFrame();
    this._invalidation.clear();

    const data = this._dataStore.getData();
    if (data.length === 0) return;
    // Only push data to main series when the data reference has actually changed.
    if (this._lastRenderedDataRef !== data) {
      this._mainSeries?.setData(data);
      this._lastRenderedDataRef = data;
    }
    this._stackedScales.clearTransformers();
    // A pane that no longer exists must not keep a transformer answering for it.
    this._paneTransformers.retain(this._panes.map(pane => pane.getId()));

    this._renderTimeAxisChrome(frame);

    this._panes.forEach(pane => {
      const paneFrame = frame.panes[this._panes.indexOf(pane)];
      const contexts = this._paneContexts(pane);
      if (!paneFrame || !contexts) return;

      this._clearPaneCanvases(contexts, paneFrame);
      if (paneFrame.kind === 'price') {
        this._renderPricePane(paneFrame, frame, contexts, data);
      } else {
        this._renderIndicatorPane(paneFrame, frame, contexts, data);
      }
    });

    if (this._options.tooltip.visible) {
      this._updateLegends();
    }
    this._toolbar?.updateContentList();
  }

  /**
   * The two time rulers, which every pane shares.
   *
   * Cleared and redrawn at the frame's level rather than any one pane's: they
   * are one surface, so a pane redrawing at a lower level than its neighbour
   * must not be what decides whether the tick labels survive.
   */
  private _renderTimeAxisChrome(frame: ChartFrame) {
    // Cursor updates must preserve the grid layer, because tick labels are only
    // redrawn on light and full invalidations.
    const clearRuler = (map: Map<string, HTMLCanvasElement>, clearGrid: boolean) => {
      const overlayCanvas = map.get('overlay')!;
      const overlay = overlayCanvas.getContext('2d')!;
      overlay.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
      if (clearGrid) {
        const gridCanvas = map.get('grid')!;
        const grid = gridCanvas.getContext('2d')!;
        grid.clearRect(0, 0, gridCanvas.width, gridCanvas.height);
      }
    };
    const redrawChrome = frame.level >= InvalidationLevel.Light;
    clearRuler(this._topXAxisCanvases, redrawChrome);
    clearRuler(this._bottomXAxisCanvases, redrawChrome);

    if (!redrawChrome) return;
    // Backgrounds go down before any pane writes its labels over them.
    const topBg = this._topXAxisCanvases.get('grid')?.getContext('2d');
    const bottomBg = this._bottomXAxisCanvases.get('grid')?.getContext('2d');
    if (topBg && this._topXHeight > 0) this._drawTimeAxisBackground(topBg, frame.width, 'top');
    if (bottomBg && this._bottomXHeight > 0) this._drawTimeAxisBackground(bottomBg, frame.width, 'bottom');
  }

  /** Clear what this pane owns, at the level this pane was invalidated at. */
  private _clearPaneCanvases(contexts: PaneContexts, paneFrame: PaneFrame) {
    const { plotWidth, plotHeight } = paneFrame;

    if (paneFrame.level >= InvalidationLevel.Light) {
      contexts.chart.clearRect(0, 0, plotWidth, plotHeight);
      contexts.grid.clearRect(0, 0, plotWidth, plotHeight);
      contexts.leftAxisGrid.clearRect(0, 0, this._leftYAxisWidth, plotHeight);
      contexts.rightAxisGrid.clearRect(0, 0, this._rightYAxisWidth, plotHeight);
    }

    contexts.overlay.clearRect(0, 0, plotWidth, plotHeight);
    contexts.leftAxisOverlay.clearRect(0, 0, this._leftYAxisWidth, plotHeight);
    contexts.rightAxisOverlay.clearRect(0, 0, this._rightYAxisWidth, plotHeight);
  }

  /** The main pane: the price series, its stacked scales, overlays and crosshair. */
  private _renderPricePane(
    paneFrame: PaneFrame,
    frame: ChartFrame,
    contexts: PaneContexts,
    data: KLineData[],
  ) {
    const { id: paneId, bounding, plotWidth: realWidth, plotHeight: realHeight, level } = paneFrame;
    const { chart: ctx, grid: gridCtx, overlay: overlayCtx } = contexts;

    // Compute the price scales, commit what they derived, then draw them. These
    // used to be one chained expression, so a render pass was also the only
    // thing that could tell a scale what its viewport had become.
    const builtScales = this._buildPriceScaleFrames(realWidth, realHeight);
    this._commitPriceScaleFrames(builtScales);
    const priceScales = builtScales.filter(scale => scale.data.length > 0);

    const primaryScale = priceScales.find(scale => scale.isPrimary) || priceScales[0];
    if (!primaryScale) return;

    this._coordinateTransformer.setDimensions(realWidth, realHeight);
    this._coordinateTransformer.setBarSpacing(this._barSpacing);
    this._coordinateTransformer.setOffset(this._offset);
    const primaryRange = primaryScale.transformer.getRange();
    this._coordinateTransformer.setRange(primaryRange.min, primaryRange.max);
    this._applyYTransform();

    // The rulers are shared, so they follow the frame's level, not this pane's.
    if (this._options.timeScale.visible !== false && frame.level >= InvalidationLevel.Light) {
      const rulerBounds = { width: realWidth, height: this._xAxisHeight, left: this._leftYAxisWidth, top: 0 };
      if (this._topXHeight > 0) {
        const topXCtx = this._topXAxisCanvases.get('grid')!.getContext('2d')!;
        this._xAxis.render(topXCtx, primaryScale.transformer, rulerBounds, 'top', this._dataStore);
      }
      if (this._bottomXHeight > 0) {
        const bottomXCtx = this._bottomXAxisCanvases.get('grid')!.getContext('2d')!;
        this._xAxis.render(bottomXCtx, primaryScale.transformer, rulerBounds, 'bottom', this._dataStore);
      }
    }

    if (level >= InvalidationLevel.Light) {
      this._chrome.drawWatermark(gridCtx, realWidth, realHeight);
      this._renderSessionSeparators(gridCtx, data, realWidth, realHeight, primaryScale.transformer);
      // Grid rendering is handled by GridPrimitive.
      this._drawPrimitivePaneViews(gridCtx, paneId, 'grid', 'chart', bounding, { ...bounding, width: realWidth }, primaryScale.transformer);

      if (this._options.axis.visible !== false) {
        if (this._options.axis.dual) {
          // Draw left Y-axis (e.g. Percentage)
          const leftGridCtx = contexts.leftAxisGrid;
          this._renderAxisBg(leftGridCtx, 'left', 0, realHeight);
          this._withAxisColumn(leftGridCtx, 'left', 0, realHeight, axisBounds => {
            this._yAxis.render(leftGridCtx, primaryScale.transformer, axisBounds, 'left');
          });

          // Draw right Y-axis (e.g. Dollar Price)
          const rightGridCtx = contexts.rightAxisGrid;
          this._renderAxisBg(rightGridCtx, 'right', 0, realHeight);
          this._withAxisColumn(rightGridCtx, 'right', 0, realHeight, axisBounds => {
            this._yAxis.render(rightGridCtx, primaryScale.transformer, axisBounds, 'right');
          });
        } else {
          priceScales.forEach(scale => {
            if (this._hiddenSeriesIds.has(scale.id)) return;
            const axisGridCtx = scale.side === 'left' ? contexts.leftAxisGrid : contexts.rightAxisGrid;
            this._renderAxisBg(axisGridCtx, scale.side, scale.axisIndex, realHeight);
            this._withAxisColumn(axisGridCtx, scale.side, scale.axisIndex, realHeight, axisBounds => {
              this._yAxis.render(axisGridCtx, scale.transformer, axisBounds, scale.side);
            });
          });
        }
      }

      priceScales.forEach(scale => {
        if (this._hiddenSeriesIds.has(scale.id)) return;
        scale.series.render(ctx, scale.transformer);
      });

      this._series
        .filter(series => series !== this._mainSeries)
        .forEach(series => series.render(ctx, primaryScale.transformer));

      // Draw beacon dot at current leading tip of each series
      this._series.forEach(series => {
        const sData = series.getData();
        if (sData.length === 0) return;
        const lastIdx = sData.length - 1;
        const last = sData[lastIdx];
        const x = primaryScale.transformer.indexToX(lastIdx);
        const y = primaryScale.transformer.priceToY(last.close);
        if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > realWidth || y < 0 || y > realHeight) return;
        const color = (series.getOptions() as { color?: string }).color || '#2962ff';
        ctx.save();
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.restore();
      });

      if (this._options.axis.lastPriceLineVisible !== false) {
        this._renderLastPriceLine(ctx, realWidth, primaryScale.transformer, data);
      }
      this._renderPriceLines(ctx, realWidth, primaryScale.transformer);
      this._renderSeriesMarkers(ctx, data, primaryScale.transformer);
      if (this._options.axis.showExtremes !== false) {
        this._chrome.drawExtremes(ctx, {
          data,
          transformer: this._coordinateTransformer,
          chartWidth: frame.width,
          formatPrice: price => this._formatPriceValue(price),
        });
      }
      this._drawPrimitivePaneViews(ctx, paneId, 'main', 'chart', bounding, { ...bounding, width: realWidth }, primaryScale.transformer);

      this._indicatorManager.render(paneId, {
        ctx,
        transformer: primaryScale.transformer,
        bounding: { ...bounding, width: realWidth },
        dataList: data,
      });
    }

    if (level >= InvalidationLevel.Cursor) {
      this._drawPrimitivePaneViews(overlayCtx, paneId, 'overlay', 'chart', bounding, { ...bounding, width: realWidth }, primaryScale.transformer);
      const rulerBounds = { width: realWidth, height: this._xAxisHeight, left: this._leftYAxisWidth, top: 0 };
      if (this._topXHeight > 0) {
        this._drawPrimitiveTimeAxisViews(
          this._topXAxisCanvases.get('overlay')!.getContext('2d')!,
          'top',
          rulerBounds,
          primaryScale.transformer,
        );
      }
      if (this._bottomXHeight > 0) {
        this._drawPrimitiveTimeAxisViews(
          this._bottomXAxisCanvases.get('overlay')!.getContext('2d')!,
          'bottom',
          rulerBounds,
          primaryScale.transformer,
        );
      }
    }

    this._renderMainPaneCrosshair({
      overlayCtx,
      leftAxisOverlayCtx: contexts.leftAxisOverlay,
      rightAxisOverlayCtx: contexts.rightAxisOverlay,
      priceScales,
      primaryScale,
      bounding,
      realWidth,
      realHeight,
      data,
      isBottomPane: paneFrame.isLast,
    });

    if (this._options.axis.visible !== false) {
      if (this._options.axis.dual) {
        // Left axis overlay: live percentage labels for all series
        const leftOverlayCtx = contexts.leftAxisOverlay;
        this._withAxisColumn(leftOverlayCtx, 'left', 0, realHeight, axisBounds => {
          this._renderPriceLineLabels(leftOverlayCtx, axisBounds, 'left', primaryScale.transformer);
          // Render live tag for main series
          const mainData = this._dataStore.getData();
          if (mainData.length > 0) {
            const last = mainData[mainData.length - 1];
            const y = primaryScale.transformer.priceToY(last.close);
            if (Number.isFinite(y) && y >= 0 && y <= axisBounds.height) {
              const mainColor = (this._mainSeries?.getOptions() as { color?: string })?.color || '#f59e0b';
              const label = this._options.localization.leftPriceFormatter
                ? this._options.localization.leftPriceFormatter(last.close)
                : this._formatPriceValue(last.close);
              this._yAxis.renderLabel(leftOverlayCtx, y, label, axisBounds, 'left', mainColor);
            }
          }
          // Render live tags for secondary series
          this._series
            .filter(s => s !== this._mainSeries)
            .forEach(s => {
              const sData = s.getData();
              if (sData.length === 0) return;
              const last = sData[sData.length - 1];
              const y = primaryScale.transformer.priceToY(last.close);
              if (!Number.isFinite(y) || y < 0 || y > axisBounds.height) return;
              const color = (s.getOptions() as { color?: string }).color || '#2962ff';
              const label = this._options.localization.leftPriceFormatter
                ? this._options.localization.leftPriceFormatter(last.close)
                : this._formatPriceValue(last.close);
              this._yAxis.renderLabel(leftOverlayCtx, y, label, axisBounds, 'left', color);
            });
        });

        // Right axis overlay: live dollar price labels for all assets (BTC, SPY, QQQ)
        const rightOverlayCtx = contexts.rightAxisOverlay;
        this._withAxisColumn(rightOverlayCtx, 'right', 0, realHeight, axisBounds => {
          const mainData = this._dataStore.getData();
          if (mainData.length > 0) {
            const last = mainData[mainData.length - 1];
            const y = primaryScale.transformer.priceToY(last.close);
            if (Number.isFinite(y) && y >= 0 && y <= axisBounds.height) {
              const mainColor = (this._mainSeries?.getOptions() as { color?: string })?.color || '#f59e0b';
              const label = this._options.localization.rightPriceFormatter
                ? this._options.localization.rightPriceFormatter(last.close, 0)
                : this._formatPriceValue(last.close);
              this._yAxis.renderLabel(rightOverlayCtx, y, label, axisBounds, 'right', mainColor);
            }
          }
          // Render live actual price tags for secondary series
          this._series
            .filter(s => s !== this._mainSeries)
            .forEach((s, idx) => {
              const sData = s.getData();
              if (sData.length === 0) return;
              const last = sData[sData.length - 1];
              const y = primaryScale.transformer.priceToY(last.close);
              if (!Number.isFinite(y) || y < 0 || y > axisBounds.height) return;
              const color = (s.getOptions() as { color?: string }).color || '#2962ff';
              const label = this._options.localization.rightPriceFormatter
                ? this._options.localization.rightPriceFormatter(last.close, idx + 1)
                : this._formatPriceValue(last.close);
              this._yAxis.renderLabel(rightOverlayCtx, y, label, axisBounds, 'right', color);
            });
        });
      } else {
        priceScales.forEach(scale => {
          if (this._hiddenSeriesIds.has(scale.id)) return;
          const axisOverlayCtx = scale.side === 'left' ? contexts.leftAxisOverlay : contexts.rightAxisOverlay;
          this._withAxisColumn(axisOverlayCtx, scale.side, scale.axisIndex, realHeight, axisBounds => {
            this._renderLastPriceTag(axisOverlayCtx, axisBounds, scale.id, scale.side, scale.transformer);
            if (scale.isPrimary) {
              this._renderPriceLineLabels(axisOverlayCtx, axisBounds, scale.side, scale.transformer);
              // Render live price tags for all secondary series on main pane
              this._series
                .filter(s => s !== this._mainSeries)
                .forEach(s => {
                  const sData = s.getData();
                  if (sData.length === 0) return;
                  const last = sData[sData.length - 1];
                  const y = scale.transformer.priceToY(last.close);
                  if (!Number.isFinite(y) || y < 0 || y > axisBounds.height) return;
                  const color = (s.getOptions() as { color?: string }).color || '#2962ff';
                  this._yAxis.renderLabel(axisOverlayCtx, y, this._formatPriceValue(last.close), axisBounds, scale.side, color);
                });
            }
            this._drawPrimitivePriceAxisViews(axisOverlayCtx, paneId, scale.side, scale.axisIndex, axisBounds, scale.transformer);
          });
        });
      }
    }
  }

  /** A stacked pane: indicators, scaled to their own values. */
  private _renderIndicatorPane(
    paneFrame: PaneFrame,
    frame: ChartFrame,
    contexts: PaneContexts,
    data: KLineData[],
  ) {
    const { id: paneId, bounding, plotWidth: realWidth, plotHeight: realHeight, level, axisSide: paneSide } = paneFrame;
    const { chart: ctx, grid: gridCtx, overlay: overlayCtx } = contexts;
    const axisGridCtx = paneSide === 'left' ? contexts.leftAxisGrid : contexts.rightAxisGrid;
    const axisOverlayCtx = paneSide === 'left' ? contexts.leftAxisOverlay : contexts.rightAxisOverlay;

    // This pane's own transformer. It used to be the chart's shared one, which
    // left the shared instance holding an indicator's range (RSI's 0-100, say)
    // for every consumer that read it after the frame.
    //
    // Geometry first, because the visible index range is read from it: the
    // y-scale covers the bars actually on screen, the way the main pane's
    // already does. Scaling to every row meant zooming into a quiet stretch
    // stayed squeezed flat by one spike from years earlier.
    const transformer = this._paneTransformers.for(paneId);
    transformer.setDimensions(realWidth, realHeight);
    transformer.setBarSpacing(this._barSpacing);
    transformer.setOffset(this._offset);

    const { leftIdx, rightIdx } = this._visibleIndexRange(transformer, realWidth, data.length);
    let min = Infinity;
    let max = -Infinity;
    this._indicatorManager.getIndicators(paneId).forEach(indicator => {
      const extent = indicator.extent(leftIdx, rightIdx);
      if (!extent) return;
      min = Math.min(min, extent.min);
      max = Math.max(max, extent.max);
    });

    if (min === Infinity) {
      // Nothing finite to scale to yet — an indicator still warming up, a pane
      // whose indicator was just removed, or a viewport past the data.
      min = this._options.indicators.fallbackRange.min;
      max = this._options.indicators.fallbackRange.max;
    }

    const paddedRange = getPaddedPriceRange(min, max);
    transformer.setRange(paddedRange.min, paddedRange.max);

    const state = this._getStackedPaneState(paneId);
    transformer.setYScale(state.scale);
    transformer.setYOffset(state.offset);

    if (this._options.timeScale.visible !== false && frame.level >= InvalidationLevel.Light) {
      const rulerBounds = { width: realWidth, height: this._xAxisHeight, left: 0, top: 0 };
      if (this._topXHeight > 0) {
        const topXCtx = this._topXAxisCanvases.get('grid')!.getContext('2d')!;
        this._xAxis.render(topXCtx, transformer, rulerBounds, 'top', this._dataStore);
      }
      if (this._bottomXHeight > 0) {
        const bottomXCtx = this._bottomXAxisCanvases.get('grid')!.getContext('2d')!;
        this._xAxis.render(bottomXCtx, transformer, rulerBounds, 'bottom', this._dataStore);
      }
    }

    if (level >= InvalidationLevel.Light) {
      // Grid rendering is handled by GridPrimitive.
      this._drawPrimitivePaneViews(gridCtx, paneId, 'grid', 'chart', bounding, { ...bounding, width: realWidth }, transformer);

      if (this._options.axis.visible !== false) {
        this._renderAxisBg(axisGridCtx, paneSide, 0, realHeight);
        this._withAxisColumn(axisGridCtx, paneSide, 0, realHeight, axisBounds => {
          this._yAxis.render(axisGridCtx, transformer, axisBounds, paneSide);
        });
      }

      this._indicatorManager.render(paneId, {
        ctx,
        transformer: transformer,
        bounding: { ...bounding, width: realWidth },
        dataList: data,
      });
      this._drawPrimitivePaneViews(ctx, paneId, 'main', 'chart', bounding, { ...bounding, width: realWidth }, transformer);
    }

    if (level >= InvalidationLevel.Cursor) {
      this._drawPrimitivePaneViews(overlayCtx, paneId, 'overlay', 'chart', bounding, { ...bounding, width: realWidth }, transformer);
    }

    // Whether the crosshair is in this pane, and where, is the frame's answer:
    // the conversion used to be written out here against the pane's offset from
    // the plot origin.
    const crosshair = paneFrame.crosshair;
    if (this._options.crosshair.visible && crosshair) {
      this._chrome.drawCrosshair(overlayCtx, realWidth, realHeight, crosshair);

      const crossColor = this._options.crosshair.color;
      const crossStyle = this._options.crosshair.style;

      // Extend the crosshair into the price gutter.
      this._withAxisColumn(axisOverlayCtx, paneSide, 0, realHeight, axisBounds => {
        axisOverlayCtx.save();
        axisOverlayCtx.strokeStyle = crossColor;
        axisOverlayCtx.lineWidth = 1;
        if (crossStyle === 'dashed') axisOverlayCtx.setLineDash([3, 3]);
        axisOverlayCtx.beginPath();
        axisOverlayCtx.moveTo(0, crosshair.y); axisOverlayCtx.lineTo(axisBounds.width, crosshair.y);
        axisOverlayCtx.stroke();
        axisOverlayCtx.setLineDash([]);
        axisOverlayCtx.restore();
        this._yAxis.renderLabel(axisOverlayCtx, crosshair.y, this._formatPriceValue(transformer.yToPrice(crosshair.y)), axisBounds, paneSide);
      });

      if (paneFrame.isLast) {
        const index = Math.round(transformer.xToIndex(crosshair.x));
        const item = data[index];
        if (item) {
          const timeText = this._formatTimeValue(item.timestamp, 'crosshair');
          const rulerBounds = { width: realWidth, height: this._xAxisHeight, left: this._leftYAxisWidth, top: 0 };
          if (this._bottomXHeight > 0) {
            const bottomOverlayCtx = this._bottomXAxisCanvases.get('overlay')!.getContext('2d')!;
            bottomOverlayCtx.save();
            bottomOverlayCtx.strokeStyle = crossColor;
            bottomOverlayCtx.lineWidth = 1;
            if (crossStyle === 'dashed') bottomOverlayCtx.setLineDash([3, 3]);
            bottomOverlayCtx.beginPath();
            bottomOverlayCtx.moveTo(crosshair.x + this._leftYAxisWidth, 0); bottomOverlayCtx.lineTo(crosshair.x + this._leftYAxisWidth, this._xAxisHeight);
            bottomOverlayCtx.stroke();
            bottomOverlayCtx.setLineDash([]);
            bottomOverlayCtx.restore();
            this._xAxis.renderLabel(bottomOverlayCtx, crosshair.x, timeText, rulerBounds, 'bottom');
          }
          if (this._topXHeight > 0) {
            const topXOverlayCtx = this._topXAxisCanvases.get('overlay')!.getContext('2d')!;
            topXOverlayCtx.save();
            topXOverlayCtx.strokeStyle = crossColor;
            topXOverlayCtx.lineWidth = 1;
            if (crossStyle === 'dashed') topXOverlayCtx.setLineDash([3, 3]);
            topXOverlayCtx.beginPath();
            topXOverlayCtx.moveTo(crosshair.x + this._leftYAxisWidth, 0); topXOverlayCtx.lineTo(crosshair.x + this._leftYAxisWidth, this._xAxisHeight);
            topXOverlayCtx.stroke();
            topXOverlayCtx.setLineDash([]);
            topXOverlayCtx.restore();
            this._xAxis.renderLabel(topXOverlayCtx, crosshair.x, timeText, rulerBounds, 'top');
          }
        }
      }
    }

    this._withAxisColumn(axisOverlayCtx, paneSide, 0, realHeight, axisBounds => {
      this._drawPrimitivePriceAxisViews(axisOverlayCtx, paneId, paneSide, 0, axisBounds, transformer);
    });
  }


  /**
   * A rule where the trading day changes, so a multi-session sparkline does not
   * read as one continuous run. Which bars start a day is `findSessionBoundaries`'
   * business; this only turns indices into lines.
   */
  private _renderSessionSeparators(
    ctx: CanvasRenderingContext2D,
    data: KLineData[],
    realWidth: number,
    realHeight: number,
    transformer: CoordinateTransformer,
  ) {
    const separator = this._options.timeScale.sessionSeparator;
    if (!separator?.visible || data.length < 2) return;

    const visible = visibleIndexRange(x => transformer.xToIndex(x), realWidth, data.length);
    const boundaries = findSessionBoundaries({
      timestamps: data.map(bar => bar.timestamp),
      from: visible.start,
      to: visible.end,
      session: this._session,
    });
    if (boundaries.length === 0) return;

    ctx.save();
    ctx.strokeStyle = separator.color;
    ctx.lineWidth = 1;
    if (separator.style === 'dashed') ctx.setLineDash([4, 4]);
    for (const index of boundaries) {
      // Half a bar to the left of the opening bar: the break belongs between
      // the two sessions, not on top of the first bar of the new one.
      const x = Math.round(transformer.indexToX(index) - transformer.getBarSpacing() / 2) + 0.5;
      if (x < 0 || x > realWidth) continue;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, realHeight);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.restore();
  }

  private _renderWatermark(ctx: CanvasRenderingContext2D, width: number, height: number) {
    const watermark = this._options.watermark;
    if (!watermark?.visible || !watermark.text) return;
    ctx.save();
    ctx.font = `bold ${watermark.fontSize}px ${watermark.fontFamily}`;
    ctx.fillStyle = watermark.color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(watermark.text, width / 2, height / 2);
    ctx.restore();
  }

  private _renderExtremes(ctx: CanvasRenderingContext2D) {
    const data = this._dataStore.getData();
    if (data.length === 0) return;
    const { leftIdx: leftIndex, rightIdx: rightIndex } = this._visibleIndexRange(this._coordinateTransformer, this._container.clientWidth, data.length);
    let highest = -Infinity, lowest = Infinity, highIndex = -1, lowIndex = -1;
    for (let index = leftIndex; index <= rightIndex; index += 1) {
      if (data[index].high > highest) { highest = data[index].high; highIndex = index; }
      if (data[index].low < lowest) { lowest = data[index].low; lowIndex = index; }
    }
    if (highIndex !== -1) this._drawExtremeLabel(ctx, this._coordinateTransformer.indexToX(highIndex), this._coordinateTransformer.priceToY(highest), this._formatPriceValue(highest), 'up');
    if (lowIndex !== -1) this._drawExtremeLabel(ctx, this._coordinateTransformer.indexToX(lowIndex), this._coordinateTransformer.priceToY(lowest), this._formatPriceValue(lowest), 'down');
  }

  private _drawExtremeLabel(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, direction: 'up' | 'down') {
    ctx.font = `400 10px ${this._options.layout.fontFamily}`;
    ctx.fillStyle = this._options.layout.textColor;
    const rightHalf = x > this._container.clientWidth / 2;
    ctx.textAlign = rightHalf ? 'right' : 'left';
    const textX = rightHalf ? x - 10 : x + 10;
    ctx.beginPath();
    ctx.strokeStyle = this._options.layout.textColor;
    ctx.setLineDash([2, 2]);
    ctx.lineWidth = 0.5;
    ctx.moveTo(x, y); ctx.lineTo(textX, y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillText(text, textX, direction === 'up' ? y - 20 : y + 24);
  }

  private _renderCrosshair(ctx: CanvasRenderingContext2D, width: number, height: number, pos: { x: number, y: number }) {
    const { color, width: lineWidth, style } = this._options.crosshair;
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    if (style === 'dashed') ctx.setLineDash([4, 4]);
    const { x, y } = pos;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
    ctx.fillStyle = color;
    ctx.setLineDash([]);
    ctx.beginPath(); ctx.arc(x, y, 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.setLineDash([]);
  }

  /** Fill a y-axis column canvas with a tinted background and an inner border line. */
  private _renderAxisBg(
    ctx: CanvasRenderingContext2D,
    side: PaneAxisSide,
    axisIndex: number,
    height: number,
  ) {
    this._withAxisColumn(ctx, side, axisIndex, height, bounds => {
      this._chrome.drawPriceAxisBackground(ctx, {
        width: bounds.width,
        height: bounds.height,
        axisIndex,
        side,
      });
    });
  }

  private _drawTimeAxisBackground(
    ctx: CanvasRenderingContext2D,
    width: number,
    position: 'top' | 'bottom',
  ) {
    this._chrome.drawTimeAxisBackground(ctx, {
      width,
      height: this._xAxisHeight,
      position,
      leftAxisWidth: this._leftYAxisWidth,
      rightAxisWidth: this._rightYAxisWidth,
      stackedCount: this._stackedScales.size,
    });
  }

  private _renderLastPriceTag(ctx: CanvasRenderingContext2D, bounding: Bounding, paneId: string = 'main', side: PaneAxisSide = 'right', transformer: CoordinateTransformer = this._coordinateTransformer) {
    const data = this._getPanePriceData(paneId);
    if (data.length === 0) return;
    const last = data[data.length - 1];
    const y = transformer.priceToY(last.close);
    
    const mainColor = (this._mainSeries?.getOptions() as { color?: string })?.color;
    const bgColor = mainColor || (last.close >= last.open ? 'rgba(38, 166, 154, 0.85)' : 'rgba(239, 83, 80, 0.85)');
    this._yAxis.renderLabel(ctx, y, this._formatPriceValue(last.close), bounding, side, bgColor);
    ctx.restore();
  }

  private _renderCrosshairLabels(ctx: CanvasRenderingContext2D, bounding: Bounding, pos: { x: number, y: number }, isBottomPane: boolean) {
    const { x, y } = pos;
    const price = this._coordinateTransformer.yToPrice(y);
    this._yAxis.renderLabel(ctx, y, this._formatPriceValue(price), bounding, 'right');
    
    if (isBottomPane) {
        const timestamp = this._coordinateTransformer.xToTimestamp(x, this._dataStore);
        const timeText = timestamp ? this._formatTimeValue(timestamp, 'crosshair') : '';
        this._xAxis.renderLabel(ctx, x, timeText, bounding, 'bottom');
    }
  }

  private _updateLegends() {
    this._updateDataTooltipWidget();
    this._legendWidget?.render();
  }

  /**
   * The rows each pane's legend should show, as data.
   *
   * Building the markup is `LegendWidget`'s job; deciding what is on the chart
   * is this class's. The split is what keeps 190 lines of HTML out of here.
   */
  private _getLegendContent(): LegendPaneContent[] {
    const allData = this._dataStore.getData();
    const hovered = this._hoveredData || allData[allData.length - 1];
    if (!hovered) return [];
    const index = this._hoveredData ? this._resolveHoveredIndex(allData) : allData.length - 1;

    const content: LegendPaneContent[] = [];
    this._panes.forEach(pane => {
      const element = this._legendDOMs.get(pane.getId());
      if (!element) return;

      const series: LegendSeriesEntry[] = [];
      if (pane.getId() === 'main') {
        if (this._mainSeries) {
          series.push({
            kind: 'main',
            id: 'main',
            label: this._getSeriesDisplayLabel(this._mainSeries),
            bar: hovered,
            upColor: '#26a69a',
            downColor: '#ef5350',
            hidden: this._hiddenSeriesIds.has('main'),
          });
        }
        this._stackedScales.forEach(({ id, series: stackedSeries, data: stackedData }) => {
          const bar = stackedData?.[index];
          if (!bar) return;
          const options = stackedSeries.getOptions() as SeriesColorOptions;
          series.push({
            kind: 'stacked',
            id,
            label: this._formatToolbarLabel(id),
            bar,
            upColor: _seriesColor(options.borderUpColor, options.upColor),
            downColor: _seriesColor(options.borderDownColor, options.downColor),
            hidden: this._hiddenSeriesIds.has(id),
          });
        });
      }

      const indicators: LegendIndicatorEntry[] = this._indicatorManager
        .getValuesAt(pane.getId(), index)
        .map(indicator => ({
          id: indicator.id,
          name: indicator.name,
          values: indicator.figures.map(figure => {
            const value = indicator.data?.[figure.key];
            return {
              key: figure.key,
              text: typeof value === 'number' && !Number.isNaN(value)
                ? this._formatPriceValue(value)
                : this._i18n.t('value.notAvailable'),
            };
          }),
        }));

      content.push({ paneId: pane.getId(), element, series, indicators });
    });
    return content;
  }

  private _toggleSeriesVisibility(id: string): void {
    if (this._hiddenSeriesIds.has(id)) {
      this._hiddenSeriesIds.delete(id);
    } else {
      this._hiddenSeriesIds.add(id);
    }
    this._refreshYAxisWidths();
    this._layout();
    this.update();
  }

  private _removeLegendSeries(kind: LegendSeriesKind, id: string): void {
    if (kind === 'main') {
      const mainIndex = this._mainSeries ? this._series.indexOf(this._mainSeries) : -1;
      if (mainIndex !== -1) this.removeSeriesAt(mainIndex);
      return;
    }
    this.removeStackedPricePane(id);
  }


  private addPane(id: string, side: PaneAxisSide = 'right'): Pane {
    const pane = this._paneManager.addPane(id, side);

    
    this._refreshYAxisWidths();
    this._layout();
    return pane;
  }

  private _reindexStackedPriceAxes() {
    const nextAxisIndex: Record<PaneAxisSide, number> = { left: 0, right: 1 };
    this._stackedScales.forEach(scale => {
      scale.axisIndex = nextAxisIndex[scale.side];
      nextAxisIndex[scale.side] += 1;
    });
  }

  private _removePane(paneId: string) {
    const paneIndex = this._panes.findIndex(pane => pane.getId() === paneId);
    if (paneIndex <= 0) return;

    this._paneManager.removePane(paneId);


    this._interaction.forgetPane(paneId);
    this._invalidation.forgetPane(paneId);

    this._normalizePaneWeights();
    this._refreshYAxisWidths();
    this._layout();
  }

  /**
   * The narrow contract the toolbar widget is allowed to drive. Keeping it as
   * an explicit object (rather than passing `this`) is what stops GUI code
   * from reaching into engine internals.
   */
  private _createToolbarHost(): ToolbarHost {
    return {
      container: this._container,
      getOptions: () => this._options,
      applyOptions: options => this.applyOptions(options),
      t: (key, params) => this._i18n.t(key, params),
      getAxisRailColors: () => getAxisRailColors(this._options),
      formatPrice: price => this._formatPriceValue(price),
      requestUpdate: () => this.update(),

      setChartStyle: type => {
        if (this._isConfigurablePriceSeriesStyle(type)) this.setChartStyle(type);
      },
      isConfigurablePriceSeriesStyle: value => this._isConfigurablePriceSeriesStyle(value),

      setDrawingMode: type => this.setDrawingMode(type),
      clearOverlays: () => this.clearOverlays(),

      addEMASeries: period => this.addEMASeries(period),
      addBOLLSeries: (period, stdDev) => this.addBOLLSeries(period, stdDev),
      addMACDSeries: () => this.addMACDSeries(),
      addRSISeries: period => this.addRSISeries(period),
      addKDJSeries: () => this.addKDJSeries(),
      addWRSeries: () => this.addWRSeries(),
      addVOLMASeries: () => this.addVOLMASeries(),

      undo: () => this.undo(),
      redo: () => this.redo(),

      getMagnetMode: () => this._magnetMode,
      setMagnetMode: on => this.setMagnetMode(on),

      getPriceScaleMode: () => this.getPriceScaleMode(),
      setPriceScaleMode: mode => this.setPriceScaleMode(mode),

      getInvertScale: () => this.getInvertScale(),
      setInvertScale: inverted => this.setInvertScale(inverted),

      exportOverlaysJSON: () => this.exportOverlaysJSON(),
      importOverlaysJSON: json => this.importOverlaysJSON(json),

      takeScreenshot: () => this.takeScreenshot(),
      toggleFullScreen: () => this.toggleFullScreen(),

      getToolbarContentItems: () => this._getToolbarContentItems(),
      removeToolbarContentItem: (kind, id, paneId) => {
        if (kind === 'series') {
          const index = Number(id);
          if (!Number.isNaN(index)) this.removeSeriesAt(index);
          return;
        }
        if (kind === 'stacked') {
          this.removeStackedPricePane(id);
          return;
        }
        if (kind === 'indicator' && paneId) {
          this.removeIndicator(paneId, id);
          return;
        }
        if (kind === 'overlay') this.removeOverlay(id);
      },
    };
  }

  private _createLegendHost(): LegendHost {
    return {
      container: this._container,
      getOptions: () => this._options,
      applyOptions: options => this.applyOptions(options),
      t: (key, params) => this._i18n.t(key, params),
      getAxisRailColors: () => getAxisRailColors(this._options),
      formatPrice: price => this._formatPriceValue(price),
      requestUpdate: () => this.update(),

      getLegendContent: () => this._getLegendContent(),
      toggleSeriesVisibility: id => this._toggleSeriesVisibility(id),
      openSeriesStyleMenu: (anchor, kind, id) => this._seriesStyleMenu?.toggle(anchor, kind, id),
      closeSeriesStyleMenu: () => this._seriesStyleMenu?.close(),
      removeSeries: (kind, id) => this._removeLegendSeries(kind, id),
      removeIndicator: (paneId, indicatorId) => this.removeIndicator(paneId, indicatorId),
    };
  }

  private _createSeriesStyleMenuHost(): SeriesStyleMenuHost {
    return {
      container: this._container,
      getOptions: () => this._options,
      applyOptions: options => this.applyOptions(options),
      t: (key, params) => this._i18n.t(key, params),
      getAxisRailColors: () => getAxisRailColors(this._options),
      formatPrice: price => this._formatPriceValue(price),
      requestUpdate: () => this.update(),

      getSeriesStyle: (kind, id) =>
        this._getSeriesStyle(kind === 'main' ? this._mainSeries : this._stackedScales.get(id)?.series ?? null),

      setSeriesStyle: (kind, id, style) => {
        if (!this._isConfigurablePriceSeriesStyle(style)) return;
        if (kind === 'main') this.setChartStyle(style);
        else this.setStackedPricePaneStyle(id, style);
      },

      setSeriesColor: (kind, id, color) => {
        const series = kind === 'main' ? this._mainSeries : this._stackedScales.get(id)?.series;
        if (!series) return;
        // Series types name their primary color differently; set them all and
        // let each series ignore the keys it doesn't have.
        series.updateOptions({
          color,
          upColor: color,
          borderUpColor: color,
          wickUpColor: color,
        });
        this.update();
      },
    };
  }

  private _createDataTooltipHost(): DataTooltipHost {
    return {
      container: this._container,
      getOptions: () => this._options,
      applyOptions: options => this.applyOptions(options),
      t: (key, params) => this._i18n.t(key, params),
      getAxisRailColors: () => getAxisRailColors(this._options),
      formatPrice: price => this._formatPriceValue(price),
      requestUpdate: () => this.update(),
      formatTime: timestamp => this._formatTimeValue(timestamp, 'crosshair'),
      isLightBackground: () => isLightColor(this._options.layout.background.color),
    };
  }

  /**
   * The hovered bar's index in `allData`, without a full `indexOf` scan on
   * every hover frame. `_hoveredIndex` is set alongside `_hoveredData` and is
   * right in the overwhelming common case; it is only confirmed by identity,
   * and re-derived by scanning when the data has changed under a stale hover
   * (e.g. a live update replaced the bar object at that index).
   */
  private _resolveHoveredIndex(allData: KLineData[]): number {
    const cached = this._hoveredIndex;
    if (cached !== null && allData[cached] === this._hoveredData) return cached;
    return allData.indexOf(this._hoveredData as KLineData);
  }

  private _updateDataTooltipWidget() {
    if (!this._dataTooltip) return;

    const index = this._hoveredData ? this._resolveHoveredIndex(this._dataStore.getData()) : -1;
    // A hovered bar that is no longer in the store means the data changed
    // under the cursor; hide rather than show a stale readout.
    if (this._hoveredData && index < 0) {
      this._dataTooltip?.hide();
      return;
    }

    const extraRows: Array<[string, string]> = [];
    this._stackedScales.forEach(({ id, data: seriesData }) => {
      const item = seriesData[index];
      if (item) extraRows.push([this._formatToolbarLabel(id), this._formatPriceValue(item.close)]);
    });

    this._dataTooltip?.update({
      crosshairPos: this._crosshairPos,
      hoveredData: this._hoveredData,
      extraRows,
      leftAxisWidth: this._leftYAxisWidth,
    });
  }

  /** Whether crosshair drawing snaps to the nearest OHLC value. */
  public getMagnetMode(): boolean {
    return this._magnetMode;
  }

  /**
   * Translated name for an overlay type, falling back to title-casing the raw
   * type so custom overlay templates still get a readable label.
   */
  private _getOverlayDisplayLabel(type: string) {
    const key = `overlay.${type}` as TranslationKey;
    const translated = this._i18n.t(key);
    return translated === key ? this._formatToolbarLabel(type) : translated;
  }

  private _formatToolbarLabel(value: string) {
    const normalized = value.replace(/_/g, ' ').trim();
    if (/^[a-z]{1,5}$/i.test(normalized)) {
      return normalized.toUpperCase();
    }
    return normalized.replace(/\b\w/g, char => char.toUpperCase());
  }

  private _getSeriesDisplayLabel(series: BaseSeries) {
    if (series instanceof CandlestickSeries) return this._i18n.t('series.candle');
    if (series instanceof HollowCandlestickSeries) return this._i18n.t('series.hollowCandles');
    if (series instanceof HeikinAshiSeries) return this._i18n.t('series.ha');
    if (series instanceof BarSeries) return this._i18n.t('series.bar');
    if (series instanceof AreaSeries) return this._i18n.t('series.area');
    if (series instanceof BaselineSeries) return this._i18n.t('series.baseline');
    if (series instanceof StepLineSeries) return this._i18n.t('series.step');
    if (series instanceof LineSeries) return this._i18n.t('series.line');
    if (series instanceof VolumeSeries) return this._i18n.t('series.volume');
    return this._formatToolbarLabel(series.constructor.name.replace(/Series$/, ''));
  }

  private _getIndicatorDisplayLabel(indicator: Indicator) {
    const numericParams = indicator.template.calcParams.filter(param => typeof param === 'number');
    if (numericParams.length === 0) return indicator.template.shortName;
    return `${indicator.template.shortName} ${numericParams.join('/')}`;
  }

  private _getToolbarContentItems(): ToolbarContentItem[] {
    const items: ToolbarContentItem[] = [];

    this._series.forEach((series, index) => {
      items.push({
        kind: 'series',
        id: String(index),
        label: this._getSeriesDisplayLabel(series),
        color: series === this._mainSeries ? '#2962FF' : this._options.layout.textColor,
      });
    });

    this._stackedScales.forEach(({ id, series }) => {
      const seriesOptions = series.getOptions() as SeriesColorOptions;
      items.push({
        kind: 'stacked',
        id,
        label: this._formatToolbarLabel(id),
        color: typeof seriesOptions.borderUpColor === 'string'
          ? seriesOptions.borderUpColor
          : typeof seriesOptions.lineColor === 'string'
            ? seriesOptions.lineColor
            : typeof seriesOptions.topColor === 'string'
              ? seriesOptions.topColor
              : this._options.layout.textColor,
      });
    });

    this._panes.forEach(pane => {
      this._indicatorManager.getIndicators(pane.getId()).forEach(indicator => {
        items.push({
          kind: 'indicator',
          id: indicator.id,
          paneId: pane.getId(),
          label: this._getIndicatorDisplayLabel(indicator),
          color: '#FF9800',
        });
      });
    });

    this._overlayManager.getOverlays().forEach(overlay => {
      items.push({
        kind: 'overlay',
        id: overlay.id,
        label: this._getOverlayDisplayLabel(overlay.type),
        color: overlay.color || this._options.layout.textColor,
      });
    });

    return items;
  }

  /** Export all current overlays (drawings) as a downloadable JSON file */
  public exportOverlaysJSON() {
    this._commitActiveDrawingLayer();
    const overlays = this._overlayManager.getOverlays();
    const json = JSON.stringify({
      version: 2,
      overlays,
      activeDrawingLayerId: this._activeDrawingLayerId,
      drawingLayers: this._drawingLayers,
    }, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fscandle-drawings-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /** Import overlays from a JSON string (as exported by exportOverlaysJSON) */
  public importOverlaysJSON(json: string) {
    const parsed = JSON.parse(json);
    this._saveHistory();
    if (Array.isArray(parsed.drawingLayers)) {
      const layers = this._normalizeDrawingLayers(parsed.drawingLayers);
      if (layers.length === 0) throw new Error('Invalid format');
      this._drawingLayers = layers;
      this._activeDrawingLayerId = layers.some(layer => layer.id === parsed.activeDrawingLayerId)
        ? parsed.activeDrawingLayerId
        : layers[0].id;
      const activeLayer = layers.find(layer => layer.id === this._activeDrawingLayerId) ?? layers[0];
      this._overlayManager.setOverlays(activeLayer.overlays.map(overlay => ({ ...overlay })));
    } else {
      const overlays = (parsed.overlays || parsed) as Overlay[];
      if (!Array.isArray(overlays)) throw new Error('Invalid format');
      this._overlayManager.setOverlays(overlays);
      this._commitActiveDrawingLayer();
    }
    this._setSelectedOverlay(null);
    this.saveState();
    this.update();
  }

}


/** First defined color wins; series types name their up/down colors differently. */
function _seriesColor(...candidates: Array<unknown>): string {
  for (const candidate of candidates) {
    if (typeof candidate === 'string') return candidate;
  }
  return '#ffffff';
}
