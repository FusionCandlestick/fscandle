import type { ChartOptions, DeepPartial } from '../types/options';
import type { PriceScaleMode } from '../engine/CoordinateTransformer';
import type { TranslationKey } from '../i18n';

/**
 * The surface GUI widgets are allowed to touch on the chart.
 *
 * Widgets live in `src/gui/` and build DOM; they must not reach into engine
 * internals. Everything they need goes through this contract, which makes the
 * chart↔GUI coupling explicit and reviewable instead of implicit in a 4k-line
 * class.
 */
export interface ChartGuiHost {
  /** Root element the chart owns. Widgets append their own nodes to it. */
  readonly container: HTMLDivElement;

  getOptions(): Readonly<ChartOptions>;
  applyOptions(options: DeepPartial<ChartOptions>): void;

  /** Translate a UI string in the chart's active locale. */
  t(key: TranslationKey, params?: Record<string, string | number>): string;

  /** Surface/border colors that match the axis rails, for chrome consistency. */
  getAxisRailColors(): { surface: string; stripe: string; border: string };

  /** Format a price the way the axis does, so widgets never invent precision. */
  formatPrice(value: number): string;

  requestUpdate(): void;
}

export interface ToolbarContentItem {
  kind: 'series' | 'stacked' | 'indicator' | 'overlay';
  id: string;
  label: string;
  color: string;
  paneId?: string;
}

/** Everything the toolbar widget drives on the chart. */
export interface ToolbarHost extends ChartGuiHost {
  setChartStyle(type: string): void;
  isConfigurablePriceSeriesStyle(value: string): boolean;

  setDrawingMode(type: string | null): void;
  clearOverlays(): void;

  addEMASeries(period?: number): void;
  addBOLLSeries(period?: number, stdDev?: number): void;
  addMACDSeries(): void;
  addRSISeries(period?: number): void;
  addKDJSeries(): void;
  addWRSeries(): void;
  addVOLMASeries(): void;

  undo(): void;
  redo(): void;

  getMagnetMode(): boolean;
  setMagnetMode(on: boolean): void;

  getPriceScaleMode(): PriceScaleMode;
  setPriceScaleMode(mode: PriceScaleMode): void;

  getInvertScale(): boolean;
  setInvertScale(inverted: boolean): void;

  exportOverlaysJSON(): void;
  importOverlaysJSON(json: string): void;

  takeScreenshot(): Promise<string>;
  toggleFullScreen(): void;

  /** Chips shown on the left of the toolbar. */
  getToolbarContentItems(): ToolbarContentItem[];
  /** Invoked when a chip's remove button is clicked. */
  removeToolbarContentItem(kind: string, id: string, paneId: string | null): void;
}
