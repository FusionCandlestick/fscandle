import type { TranslationKey } from '../i18n';
import type { ChartGuiHost } from './types';

export type SeriesMenuKind = 'main' | 'stacked';

export interface SeriesStyleMenuHost extends ChartGuiHost {
  /** Current style key of the target series, or null if it has no style menu. */
  getSeriesStyle(kind: SeriesMenuKind, id: string): string | null;
  setSeriesStyle(kind: SeriesMenuKind, id: string, style: string): void;
  /** Recolor a stacked series. Only offered for `stacked` targets. */
  setSeriesColor(kind: SeriesMenuKind, id: string, color: string): void;
}

const STYLE_ITEMS: Array<{ value: string; key: TranslationKey }> = [
  { value: 'candle', key: 'series.candle' },
  { value: 'hollow', key: 'series.hollow' },
  { value: 'ha', key: 'series.ha' },
  { value: 'bar', key: 'series.bar' },
  { value: 'line', key: 'series.line' },
  { value: 'step', key: 'series.step' },
  { value: 'baseline', key: 'series.baseline' },
  { value: 'area', key: 'series.area' },
];

const SWATCHES = ['#38bdf8', '#f59e0b', '#a78bfa', '#10b981', '#fb7185', '#3b82f6', '#ef4444'];

/**
 * The popover opened from a legend entry for switching series style (and, for
 * stacked panes, color). Only one is ever open; opening it on the same anchor
 * toggles it closed.
 */
export class SeriesStyleMenu {
  private _host: SeriesStyleMenuHost;
  private _element: HTMLDivElement | null = null;

  constructor(host: SeriesStyleMenuHost) {
    this._host = host;
  }

  public get isOpen(): boolean {
    return this._element !== null;
  }

  public close() {
    this._element?.remove();
    this._element = null;
  }

  public destroy() {
    this.close();
  }

  public toggle(anchor: HTMLElement, kind: SeriesMenuKind, id: string) {
    const currentStyle = this._host.getSeriesStyle(kind, id);
    if (!currentStyle) return;

    // Same anchor twice = close.
    if (this._element?.dataset.kind === kind && this._element?.dataset.id === id) {
      this.close();
      return;
    }
    this.close();

    const options = this._host.getOptions();
    const menu = document.createElement('div');
    menu.dataset.kind = kind;
    menu.dataset.id = id;
    menu.style.position = 'absolute';
    menu.style.display = 'flex';
    menu.style.flexDirection = 'column';
    menu.style.gap = '4px';
    menu.style.padding = '8px';
    menu.style.minWidth = '132px';
    menu.style.borderRadius = '8px';
    menu.style.border = '1px solid rgba(128,128,128,0.28)';
    menu.style.background = options.layout.background.color;
    menu.style.boxShadow = '0 10px 30px rgba(0,0,0,0.28)';
    menu.style.zIndex = '3200';
    menu.style.pointerEvents = 'auto';

    menu.appendChild(this._buildSectionTitle(this._host.t('menu.seriesStyle'), 10, 0));

    STYLE_ITEMS.forEach(item => {
      const isCurrent = item.value === currentStyle;
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = this._host.t(item.key);
      button.style.display = 'flex';
      button.style.alignItems = 'center';
      button.style.justifyContent = 'space-between';
      button.style.width = '100%';
      button.style.padding = '6px 8px';
      button.style.border = '1px solid rgba(128,128,128,0.2)';
      button.style.borderRadius = '6px';
      button.style.background = isCurrent ? 'rgba(41,98,255,0.16)' : 'rgba(128,128,128,0.08)';
      button.style.color = isCurrent ? '#2962FF' : options.layout.textColor;
      button.style.cursor = 'pointer';
      button.style.fontSize = '10px';
      button.addEventListener('pointerdown', event => event.stopPropagation());
      button.addEventListener('click', event => {
        event.stopPropagation();
        this._host.setSeriesStyle(kind, id, item.value);
        this.close();
      });
      menu.appendChild(button);
    });

    if (kind === 'stacked') {
      menu.appendChild(this._buildSectionTitle(this._host.t('menu.color'), 9, 6));

      const swatches = document.createElement('div');
      swatches.style.display = 'flex';
      swatches.style.gap = '4px';
      swatches.style.marginTop = '2px';
      swatches.style.flexWrap = 'wrap';

      SWATCHES.forEach(color => {
        const button = document.createElement('button');
        button.type = 'button';
        button.style.width = '14px';
        button.style.height = '14px';
        button.style.borderRadius = '50%';
        button.style.border = '1px solid rgba(128,128,128,0.2)';
        button.style.background = color;
        button.style.cursor = 'pointer';
        button.style.padding = '0';
        button.addEventListener('pointerdown', event => event.stopPropagation());
        button.addEventListener('click', event => {
          event.stopPropagation();
          this._host.setSeriesColor(kind, id, color);
          this.close();
        });
        swatches.appendChild(button);
      });
      menu.appendChild(swatches);
    }

    this._host.container.appendChild(menu);
    this._position(menu, anchor);
    this._element = menu;
  }

  private _buildSectionTitle(text: string, fontSize: number, marginTop: number) {
    const title = document.createElement('div');
    title.textContent = text;
    title.style.fontSize = `${fontSize}px`;
    title.style.fontWeight = '600';
    title.style.letterSpacing = '0.03em';
    title.style.textTransform = 'uppercase';
    title.style.color = this._host.getOptions().layout.textColor;
    title.style.opacity = '0.65';
    if (marginTop) title.style.marginTop = `${marginTop}px`;
    return title;
  }

  /** Place below the anchor, clamped so the menu stays inside the chart. */
  private _position(menu: HTMLDivElement, anchor: HTMLElement) {
    const container = this._host.container;
    const anchorRect = anchor.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();

    const maxLeft = Math.max(8, container.clientWidth - menuRect.width - 8);
    const maxTop = Math.max(8, container.clientHeight - menuRect.height - 8);

    menu.style.left = `${Math.max(8, Math.min(maxLeft, anchorRect.left - containerRect.left))}px`;
    menu.style.top = `${Math.max(8, Math.min(maxTop, anchorRect.bottom - containerRect.top + 6))}px`;
  }
}
