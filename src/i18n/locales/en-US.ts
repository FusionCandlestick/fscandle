/**
 * English is the source of truth for the translation key set. Every other
 * locale is a `Partial` of this shape, so adding a key here surfaces as a
 * missing-translation fallback rather than a type error in nine files.
 */
export const enUS = {
  // Series names
  'series.candle': 'Candles',
  'series.hollow': 'Hollow',
  'series.hollowCandles': 'Hollow Candles',
  'series.ha': 'Heikin Ashi',
  'series.bar': 'Bar',
  'series.line': 'Line',
  'series.step': 'Step Line',
  'series.baseline': 'Baseline',
  'series.area': 'Area',
  'series.volume': 'Volume',

  // Legend / series menu
  'menu.seriesStyle': 'Series Style',
  'menu.color': 'Color',
  'legend.removeIndicator': 'Remove Indicator',
  'legend.adjust': 'Adjust {label}',
  'legend.close': 'Close {label}',
  'legend.toggleVisibility': 'Toggle visibility',

  // Toolbar
  'toolbar.undo': 'Undo',
  'toolbar.redo': 'Redo',
  'toolbar.magnet': 'Magnet Mode (Snap to OHLC)',
  'toolbar.priceScaleMode': 'Price Scale Mode',
  'toolbar.scaleLinear': 'Lin',
  'toolbar.scaleLog': 'Log',
  'toolbar.invertAxis': 'Invert Price Axis',
  'toolbar.exportDrawings': 'Export drawings as JSON',
  'toolbar.importDrawings': 'Import drawings from JSON',
  'toolbar.screenshot': 'Take Screenshot',
  'toolbar.fullscreen': 'Toggle Fullscreen',
  'toolbar.backgroundColor': 'Chart Background Color',
  'toolbar.watermark': 'Toggle Watermark',
  'toolbar.noVisibleContent': 'No visible content',

  // Overlay / drawing tool names
  'overlay.line': 'Line',
  'overlay.segment': 'Segment',
  'overlay.ray': 'Ray',
  'overlay.channel': 'Channel',
  'overlay.rectangle': 'Rectangle',
  'overlay.fibonacci': 'Fibonacci',
  'overlay.measure': 'Measure',
  'overlay.annotation': 'Annotation',
  'overlay.wave': 'Wave',
  'overlay.locked': 'Locked',
  'overlay.hidden': 'Hidden',

  // Tooltip / values
  'value.notAvailable': 'n/a',
  'tooltip.open': 'O',
  'tooltip.high': 'H',
  'tooltip.low': 'L',
  'tooltip.close': 'C',
  'tooltip.volume': 'Vol',
} as const;

export type TranslationKey = keyof typeof enUS;
export type TranslationDict = Record<TranslationKey, string>;
export type PartialTranslationDict = Partial<TranslationDict>;
