import type { KLineData } from '../types';
import { formatToolbarLabel, pickSeriesColor } from './displayLabels';
import type { LegendIndicatorEntry, LegendPaneContent, LegendSeriesEntry } from './LegendWidget';
import type { ToolbarContentItem } from './types';

/**
 * What the legend and the toolbar's content list show, built from a snapshot
 * of the chart's state. Plain functions of their input, so the rules (which
 * rows appear, in what order, with which colours) can be tested without a
 * chart or a DOM.
 */

/** The colour fields a price series may carry, read for legend and list colours. */
export interface SeriesColorOptions {
  upColor?: string;
  downColor?: string;
  borderUpColor?: string;
  borderDownColor?: string;
  lineColor?: string;
  topColor?: string;
}

export interface LegendContentInput {
  /** The bar the main series row shows: the hovered bar, or the last one. */
  bar: KLineData;
  /** Its index, used to read stacked series and indicators at the same bar. */
  index: number;
  /** Panes in stack order, with their legend element when they have one. */
  panes: Array<{ id: string; element: HTMLDivElement | undefined }>;
  /** Label of the main series, or null when there is none. */
  mainSeriesLabel: string | null;
  stacked: Array<{ id: string; options: SeriesColorOptions; data: KLineData[] | undefined }>;
  hidden: ReadonlySet<string>;
  indicatorValuesAt: (paneId: string, index: number) => Array<{
    id: string;
    name: string;
    figures: Array<{ key: string }>;
    data: Record<string, unknown> | undefined;
  }>;
  formatValue: (value: number) => string;
  /** Text for an indicator value that is not available at this bar. */
  notAvailable: string;
}

/** One group per pane that has a legend element: its series rows and indicator readouts. */
export function buildLegendContent(input: LegendContentInput): LegendPaneContent[] {
  const content: LegendPaneContent[] = [];
  for (const pane of input.panes) {
    const element = pane.element;
    if (!element) continue;

    const series: LegendSeriesEntry[] = [];
    if (pane.id === 'main') {
      if (input.mainSeriesLabel !== null) {
        series.push({
          kind: 'main',
          id: 'main',
          label: input.mainSeriesLabel,
          bar: input.bar,
          upColor: '#26a69a',
          downColor: '#ef5350',
          hidden: input.hidden.has('main'),
        });
      }
      for (const stacked of input.stacked) {
        const bar = stacked.data?.[input.index];
        if (!bar) continue;
        series.push({
          kind: 'stacked',
          id: stacked.id,
          label: formatToolbarLabel(stacked.id),
          bar,
          upColor: pickSeriesColor(stacked.options.borderUpColor, stacked.options.upColor),
          downColor: pickSeriesColor(stacked.options.borderDownColor, stacked.options.downColor),
          hidden: input.hidden.has(stacked.id),
        });
      }
    }

    const indicators: LegendIndicatorEntry[] = input.indicatorValuesAt(pane.id, input.index).map(indicator => ({
      id: indicator.id,
      name: indicator.name,
      values: indicator.figures.map(figure => {
        const value = indicator.data?.[figure.key];
        return {
          key: figure.key,
          text: typeof value === 'number' && !Number.isNaN(value) ? input.formatValue(value) : input.notAvailable,
        };
      }),
    }));

    content.push({ paneId: pane.id, element, series, indicators });
  }
  return content;
}

export interface ToolbarContentInput {
  /** Every series in order, with its label and whether it is the main one. */
  series: Array<{ label: string; isMain: boolean }>;
  stacked: Array<{ id: string; options: SeriesColorOptions }>;
  indicators: Array<{ id: string; paneId: string; label: string }>;
  overlays: Array<{ id: string; label: string; color?: string }>;
  /** Colour for entries with no colour of their own. */
  textColor: string;
}

/** The toolbar's list of what is on the chart: series, stacked series, indicators, then drawings. */
export function buildToolbarContentItems(input: ToolbarContentInput): ToolbarContentItem[] {
  const items: ToolbarContentItem[] = [];
  input.series.forEach((series, index) => {
    items.push({ kind: 'series', id: String(index), label: series.label, color: series.isMain ? '#2962FF' : input.textColor });
  });
  for (const { id, options } of input.stacked) {
    const color = [options.borderUpColor, options.lineColor, options.topColor].find(value => typeof value === 'string');
    items.push({ kind: 'stacked', id, label: formatToolbarLabel(id), color: color ?? input.textColor });
  }
  for (const indicator of input.indicators) {
    items.push({ kind: 'indicator', id: indicator.id, paneId: indicator.paneId, label: indicator.label, color: '#FF9800' });
  }
  for (const overlay of input.overlays) {
    items.push({ kind: 'overlay', id: overlay.id, label: overlay.label, color: overlay.color || input.textColor });
  }
  return items;
}
