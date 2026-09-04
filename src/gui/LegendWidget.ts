import type { KLineData } from '../types';
import type { ChartGuiHost } from './types';

/**
 * The per-pane legend: OHLCV for the hovered bar, indicator readouts, and the
 * visibility / settings / remove controls on each row.
 *
 * This was 193 lines inside `FusionCandlestickChart`, the third-largest method
 * in the class, and every line of it was HTML string building or event wiring —
 * no chart logic at all. It lives here for the same reason the toolbar, tooltip,
 * and series style menu do: GUI builds DOM and reaches the chart only through
 * `LegendHost`, so the coupling is a reviewable interface rather than direct
 * access to engine internals.
 *
 * The widget re-renders only when the markup actually changes, which matters
 * because it runs on every crosshair move.
 */

export type LegendSeriesKind = 'main' | 'stacked';

/** One price series row: the main series, or a stacked overlay series. */
export interface LegendSeriesEntry {
  kind: LegendSeriesKind;
  id: string;
  label: string;
  bar: KLineData;
  /** Colors for the up/down legs; the main series uses the shared defaults. */
  upColor: string;
  downColor: string;
  hidden: boolean;
}

/** One indicator readout: its name and the figure values at the hovered bar. */
export interface LegendIndicatorEntry {
  id: string;
  name: string;
  values: Array<{ key: string; text: string }>;
}

export interface LegendPaneContent {
  paneId: string;
  element: HTMLDivElement;
  series: LegendSeriesEntry[];
  indicators: LegendIndicatorEntry[];
}

export interface LegendHost extends ChartGuiHost {
  /** Rows to draw, one group per pane that has a legend element. */
  getLegendContent(): LegendPaneContent[];

  toggleSeriesVisibility(id: string): void;
  openSeriesStyleMenu(anchor: HTMLElement, kind: LegendSeriesKind, id: string): void;
  closeSeriesStyleMenu(): void;
  removeSeries(kind: LegendSeriesKind, id: string): void;
  removeIndicator(paneId: string, indicatorId: string): void;
}

const ICON = {
  eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle>',
  eyeOff:
    '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line>',
  gear:
    '<circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path>',
  close: '<line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line>',
} as const;

const INDICATOR_COLORS = ['#2962FF', '#FF9800', '#F44336', '#4CAF50', '#9C27B0'];

function svg(paths: string): string {
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" ' +
    `stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`
  );
}

export class LegendWidget {
  private _host: LegendHost;

  constructor(host: LegendHost) {
    this._host = host;
  }

  /** Rebuild every pane's legend, skipping the DOM write when nothing changed. */
  public render(): void {
    for (const pane of this._host.getLegendContent()) {
      const html = this._paneHtml(pane);
      if (pane.element.innerHTML === html) continue;
      pane.element.innerHTML = html;
      this._bind(pane.element, pane.paneId);
    }
  }

  private _paneHtml(pane: LegendPaneContent): string {
    return pane.series.map(entry => this._seriesRow(entry)).join('')
      + pane.indicators.map((entry, index) => this._indicatorRow(pane.paneId, entry, index)).join('');
  }

  private _seriesRow(entry: LegendSeriesEntry): string {
    const { layout, localization } = this._host.getOptions();
    const fontSize = layout.fontSize;
    const bar = entry.bar;
    const closeColor = bar.close >= bar.open ? entry.upColor : entry.downColor;
    const volume = entry.kind === 'main'
      ? `<span>V:${(bar.volume || 0).toLocaleString(localization.locale)}</span>`
      : '';

    const content =
      `<span style="color:${entry.kind === 'stacked' ? closeColor : 'inherit'}; opacity:${entry.kind === 'stacked' ? 0.8 : 0.6}; font-size:${fontSize - 1}px;">${entry.label}</span>
      <span>O:${this._price(bar.open)}</span>
      <span>H:<span style="color:${entry.upColor}">${this._price(bar.high)}</span></span>
      <span>L:<span style="color:${entry.downColor}">${this._price(bar.low)}</span></span>
      <span>C:<span style="color:${closeColor}">${this._price(bar.close)}</span></span>
      ${volume}`;

    return this._row(content, this._controls(entry), entry.hidden);
  }

  private _indicatorRow(paneId: string, entry: LegendIndicatorEntry, index: number): string {
    const { layout } = this._host.getOptions();
    const color = INDICATOR_COLORS[index % INDICATOR_COLORS.length];
    const values = entry.values
      .map(value => `<span style="color:${layout.textColor}">${value.key}:</span> <span style="color:${color}">${value.text}</span> `)
      .join('');

    return `<div style="pointer-events:none; font-size: ${layout.fontSize}px; font-weight: bold; color: ${color}; display: inline-flex; align-items: center; justify-content: space-between; gap: 12px; padding: 3px 8px; border-radius: 6px; background: rgba(128,128,128,0.06); border: 1px solid rgba(128,128,128,0.12); margin-bottom: 4px; max-width: fit-content; transition: background 0.2s;">
      <span style="pointer-events: none; display: inline-flex; align-items: center; gap: 6px;">
        <span>${entry.name}</span>
        <span>${values}</span>
      </span>
      ${this._button('fscandle-legend-del-ind', ICON.close, this._host.t('legend.removeIndicator'), {
        pane: paneId,
        id: entry.id,
      }, 0.6)}
    </div>`;
  }

  private _controls(entry: LegendSeriesEntry): string {
    const data = { kind: entry.kind, id: entry.id };
    return `<span style="display:inline-flex; align-items:center; gap:4px; margin-left:8px;">
      ${this._button('fscandle-legend-series-visibility', entry.hidden ? ICON.eyeOff : ICON.eye,
        `${entry.hidden ? 'Show' : 'Hide'} ${entry.label}`, data)}
      ${this._button('fscandle-legend-series-settings', ICON.gear,
        this._host.t('legend.adjust', { label: entry.label }), data)}
      ${this._button('fscandle-legend-series-remove', ICON.close,
        this._host.t('legend.close', { label: entry.label }), data)}
    </span>`;
  }

  private _button(
    className: string,
    icon: string,
    title: string,
    data: Record<string, string>,
    opacity = 0.65,
  ): string {
    const attrs = Object.entries(data).map(([key, value]) => `data-${key}="${value}"`).join(' ');
    const style = `pointer-events:auto; cursor:pointer; background:transparent; border:none; font-size:10px; color:${this._host.getOptions().layout.textColor}; opacity:${opacity}; padding:2px; display:flex; align-items:center; justify-content:center; transition:opacity 0.2s;`;
    return `<button class="${className}" ${attrs} style="${style}"
      onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='${opacity}'"
      title="${title}">${svg(icon)}</button>`;
  }

  private _row(content: string, controls: string, hidden: boolean): string {
    const { layout } = this._host.getOptions();
    return `<div style="pointer-events:none; display:inline-flex; align-items:center; justify-content:space-between; gap:12px; padding:3px 8px; border-radius:6px; background:rgba(128,128,128,0.06); border:1px solid rgba(128,128,128,0.12); margin-bottom:4px; max-width:fit-content; opacity:${hidden ? '0.45' : '1'}; transition:all 0.2s; white-space:nowrap;">
      <span style="display:inline-flex; align-items:center; flex-wrap:wrap; gap:6px; min-width:0; pointer-events:none; color:${layout.textColor}; font-size:${layout.fontSize}px; font-weight:bold;">${content}</span>
      ${controls}
    </div>`;
  }

  private _price(value: number): string {
    return this._host.formatPrice(value);
  }

  private _bind(element: HTMLDivElement, paneId: string): void {
    // Every control stops propagation: the legend sits over the chart surface,
    // so without it a click would also start a pan or a drawing.
    this._each(element, '.fscandle-legend-del-ind', (button, target) => {
      button.addEventListener('mousedown', event => event.stopPropagation());
      button.addEventListener('click', event => {
        event.stopPropagation();
        const indicatorId = target(event).getAttribute('data-id');
        const pane = target(event).getAttribute('data-pane') ?? paneId;
        if (indicatorId) this._host.removeIndicator(pane, indicatorId);
      });
    });

    this._each(element, '.fscandle-legend-series-visibility', (button, target) => {
      button.addEventListener('pointerdown', event => event.stopPropagation());
      button.addEventListener('click', event => {
        event.stopPropagation();
        const id = target(event).getAttribute('data-id');
        if (id) this._host.toggleSeriesVisibility(id);
      });
    });

    this._each(element, '.fscandle-legend-series-settings', (button, target) => {
      button.addEventListener('pointerdown', event => event.stopPropagation());
      button.addEventListener('click', event => {
        event.stopPropagation();
        const anchor = target(event);
        const kind = anchor.getAttribute('data-kind');
        const id = anchor.getAttribute('data-id');
        if ((kind === 'main' || kind === 'stacked') && id) {
          this._host.openSeriesStyleMenu(anchor, kind, id);
        }
      });
    });

    this._each(element, '.fscandle-legend-series-remove', (button, target) => {
      button.addEventListener('pointerdown', event => event.stopPropagation());
      button.addEventListener('click', event => {
        event.stopPropagation();
        this._host.closeSeriesStyleMenu();
        const anchor = target(event);
        const kind = anchor.getAttribute('data-kind');
        const id = anchor.getAttribute('data-id');
        if ((kind === 'main' || kind === 'stacked') && id) {
          this._host.removeSeries(kind, id);
        }
      });
    });
  }

  private _each(
    element: HTMLDivElement,
    selector: string,
    bind: (button: Element, target: (event: Event) => HTMLElement) => void,
  ): void {
    element.querySelectorAll(selector).forEach(button => {
      bind(button, event => event.currentTarget as HTMLElement);
    });
  }
}
