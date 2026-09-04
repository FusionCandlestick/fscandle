import type { Period } from '../model/period';
import type { TradingSession } from '../model/session';
import { UI_FONT_FAMILY } from '../model/fontFamily';

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends (infer U)[]
    ? DeepPartial<U>[]
    : T[P] extends object
    ? DeepPartial<T[P]>
    : T[P];
};

interface LayoutOptions {
  background: {
    type: 'solid';
    color: string;
  };
  textColor: string;
  fontSize: number;
  fontFamily: string;
}

interface GridLineOptions {
  visible: boolean;
  color: string;
  style: 'solid' | 'dashed';
}

export interface GridOptions {
  vertLines: GridLineOptions;
  horzLines: GridLineOptions;
}

interface AxisOptions {
  /** Whether the price-axis gutter and labels are rendered. */
  visible?: boolean;
  /** Whether dual left-and-right price axes are rendered simultaneously. */
  dual?: boolean;
  backgroundColor?: string;
  alternateBackgroundColor?: string;
  borderColor?: string;
  showExtremes?: boolean;
  /** Draw the dashed horizontal rule at the latest close. */
  lastPriceLineVisible?: boolean;
}

interface CrosshairOptions {
  visible: boolean;
  color: string;
  width: number;
  style: 'solid' | 'dashed';
}

interface TooltipOptions {
  visible: boolean;
  position: 'top-left' | 'top-right';
  showOHLC: boolean;
  showVolume: boolean;
}

// Series Specific Options
export interface CandlestickStyleOptions {
  upColor: string;
  downColor: string;
  wickVisible: boolean;
  borderVisible: boolean;
  borderColor: string;
  borderUpColor: string;
  borderDownColor: string;
  wickColor: string;
  wickUpColor: string;
  wickDownColor: string;
}

interface WatermarkOptions {
  visible: boolean;
  color: string;
  text: string;
  fontSize: number;
  fontFamily: string;
}

export interface LocalizationOptions {
  locale: string;
  timeZone?: string;
  priceFormatter?: (price: number) => string;
  leftPriceFormatter?: (price: number, seriesIndex?: number) => string;
  rightPriceFormatter?: (price: number, seriesIndex?: number) => string;
  timeFormatter?: (timestamp: number, context: 'axis' | 'crosshair') => string;
}

/**
 * Which built-in GUI widgets the chart builds.
 *
 * Each is loaded on demand, so turning one off removes its code from what the
 * page downloads rather than merely hiding it. That is the point: the tooltip,
 * style menu and legend are 519 lines that neither reference engine ships, and
 * an integration with its own chrome should not pay for ours.
 */
interface GuiOptions {
  /** Follow-the-crosshair OHLC readout. */
  tooltip: boolean;
  /** Right-click menu for changing a series' style. */
  styleMenu: boolean;
  /** Per-pane series and indicator legend. */
  legend: boolean;
}

interface ToolbarOptions {
  visible: boolean;
}

export interface TimeScaleOptions {
  /** Whether the top and bottom time rulers are rendered. */
  visible?: boolean;
  /** Fraction of the plot reserved after the last bar. */
  rightMargin?: number;
  /**
   * Marks where the calendar day changes, in the chart's timezone. Intraday
   * data spanning several sessions otherwise reads as one continuous run.
   */
  sessionSeparator?: SessionSeparatorOptions;
  /**
   * Bar interval. Accepts a period string (`'15m'`, `'1D'`, `'3M'`) or a
   * `Period` object. When omitted the interval is inferred from the data,
   * which is fine for display but cannot distinguish a missing bar from a
   * closed market.
   */
  period?: string | Period;
  /**
   * Trading session. Accepts a `SESSION_PRESETS` key (`'us-equity'`,
   * `'cn-a-share'`, `'crypto-24x7'`, …) or a `TradingSession` object.
   * Drives gap detection and session-aware extrapolation.
   */
  session?: string | TradingSession;
}

/**
 * The pane stack: how panes divide the vertical space, and what the strip
 * between two of them looks like and does.
 *
 * These were constants spread across three files — the divider's height in
 * `PaneManager`'s constructor default, its colour inline in the layout pass,
 * the weight floor in `PaneLayoutModel`, the weight a new pane takes in
 * `appendPane`. An integration that wanted a thicker grab strip or a visible
 * divider had no way to ask for one.
 */
export interface PaneOptions {
  /** Height of the strip between two panes, in CSS pixels. Also its grab area. */
  dividerHeight: number;
  dividerColor: string;
  /** Divider colour while the pointer is over it or dragging it. */
  dividerHoverColor: string;
  /** Whether a divider drag resizes the panes either side of it. */
  resizable: boolean;
  /** Smallest share of the vertical space a pane may hold. */
  minWeight: number;
  /** Share a newly added pane takes; the panes already present are rescaled. */
  newPaneWeight: number;
}

/**
 * How indicators are drawn, for the panes and the overlays that hold them.
 *
 * `Indicator.draw` hard-coded its line width, its five-colour series palette
 * and its histogram colours, so an indicator could not be made to match a
 * host application's palette without forking the class. The fallback range is
 * what an indicator pane shows before its indicator has produced a finite
 * value — 0..100 was written inline and is right for RSI and wrong for
 * everything else.
 */
export interface IndicatorOptions {
  lineWidth: number;
  /** Series colours, used in order and wrapped when an indicator has more figures. */
  palette: string[];
  barUpColor: string;
  barDownColor: string;
  fallbackRange: { min: number; max: number };
}

/**
 * Whether this chart reads and writes its own persisted state, and under what
 * key.
 *
 * State lived under one origin-wide key, so every chart on a page shared it.
 * A workspace chart saving `watermark.visible: true`, `grid.visible: true` and
 * `axis.visible: true` therefore handed those to every *other* chart on the
 * origin — including sparklines that had explicitly asked for none of them, in
 * code, at construction. Persisted state also won over the constructor's
 * options, so a chart could not be reliably configured from code at all.
 *
 * A decorative chart wants `enabled: false`. Two charts that both want to
 * remember something want different `key`s.
 */
/**
 * Which gestures change what the chart is showing.
 *
 * A chart embedded as a readout — an index card's sparkline, a thumbnail in a
 * table — wants the crosshair to follow the pointer while the line itself stays
 * exactly where it was put. Before this the only way to stop a stray drag from
 * scrolling such a chart was `pointer-events: none` on its container, which
 * takes the crosshair away with it.
 */
interface InteractionOptions {
  /** Dragging the plot, and two-finger panning, move the viewport. */
  pan: boolean;
  /** Wheel, pinch and price/time axis drags change the scale. */
  zoom: boolean;
}

/** A dashed rule where one trading day ends and the next begins. */
interface SessionSeparatorOptions {
  visible: boolean;
  color: string;
  style: 'solid' | 'dashed';
}

interface PersistenceOptions {
  /** Read and write `localStorage` at all. */
  enabled: boolean;
  /** Storage key. Charts that share one share their state, by design. */
  key: string;
}

export interface ChartOptions {
  layout: LayoutOptions;
  grid: GridOptions;
  axis: AxisOptions;
  crosshair: CrosshairOptions;
  tooltip: TooltipOptions;
  watermark: WatermarkOptions;
  localization: LocalizationOptions;
  toolbar: ToolbarOptions;
  gui: GuiOptions;
  panes: PaneOptions;
  indicators: IndicatorOptions;
  persistence: PersistenceOptions;
  interaction: InteractionOptions;
  timeScale: TimeScaleOptions;
}

export const defaultOptions: ChartOptions = {
  layout: {
    background: { type: 'solid', color: '#131722' },
    textColor: '#d1d4dc',
    fontSize: 10,
    fontFamily: UI_FONT_FAMILY,
  },
  grid: {
    vertLines: { visible: true, color: '#2b2b2b', style: 'dashed' },
    horzLines: { visible: true, color: '#2b2b2b', style: 'dashed' },
  },
  axis: {
    visible: true,
    backgroundColor: 'rgba(10, 16, 32, 0.92)',
    alternateBackgroundColor: 'rgba(148, 163, 184, 0.06)',
    borderColor: 'rgba(148, 163, 184, 0.32)',
    showExtremes: true,
    lastPriceLineVisible: true,
  },
  crosshair: {
    visible: true,
    color: '#758696',
    width: 1,
    style: 'dashed',
  },
  tooltip: {
    visible: true,
    position: 'top-left',
    showOHLC: true,
    showVolume: true,
  },
  watermark: {
    visible: true,
    color: 'rgba(255, 255, 255, 0.08)',
    text: 'FusionCandlestick',
    fontSize: 48,
    fontFamily: UI_FONT_FAMILY,
  },
  // Optional options are declared here with an explicit `undefined` rather than
  // left out. The defaults *are* the schema — `findUnknownOptionPaths` tests
  // `key in defaults` — so a key the default tree never mentions is reported as
  // unknown even when the chart reads it. `timeScale.period`, `timeScale.session`,
  // `localization.timeZone` and both formatters were all in that state: setting
  // any of them worked and warned "unknown option ignored" at the same time.
  localization: {
    locale: 'en-US',
    timeZone: undefined,
    priceFormatter: undefined,
    timeFormatter: undefined,
  },
  toolbar: {
    visible: true,
  },
  gui: {
    tooltip: true,
    styleMenu: true,
    legend: true,
  },
  panes: {
    dividerHeight: 4,
    dividerColor: 'rgba(128, 128, 128, 0.1)',
    dividerHoverColor: 'rgba(128, 128, 128, 0.45)',
    resizable: true,
    minWeight: 0.1,
    newPaneWeight: 0.3,
  },
  indicators: {
    lineWidth: 1,
    palette: ['#2962FF', '#FF9800', '#F44336', '#4CAF50', '#9C27B0'],
    barUpColor: 'rgba(38, 166, 154, 0.5)',
    barDownColor: 'rgba(239, 83, 80, 0.5)',
    fallbackRange: { min: 0, max: 100 },
  },
  persistence: {
    enabled: true,
    key: 'fscandle_chart_state_v4',
  },
  interaction: {
    pan: true,
    zoom: true,
  },
  timeScale: {
    visible: true,
    rightMargin: 0.05,
    sessionSeparator: {
      // Off by default: it is a deliberate mark, not chrome every chart wants.
      visible: false,
      color: 'rgba(148, 163, 184, 0.45)',
      style: 'dashed',
    },
    period: undefined,
    session: undefined,
  },
};
