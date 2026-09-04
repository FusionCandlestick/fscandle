import type { KLineData } from '../types';
import type { ChartGuiHost } from './types';

export interface DataTooltipState {
  /** Crosshair position in chart-content pixel space, or null when off-chart. */
  crosshairPos: { x: number; y: number } | null;
  hoveredData: KLineData | null;
  /** Extra rows contributed by stacked price panes, already formatted. */
  extraRows: Array<[string, string]>;
  /** Pixel width of the left price-axis gutter, used to offset the tooltip. */
  leftAxisWidth: number;
}

export interface DataTooltipHost extends ChartGuiHost {
  // `formatPrice` now comes from ChartGuiHost: the legend needed it too, which
  // is what made it a shared concern rather than this widget's own.
  formatTime(timestamp: number): string;
  isLightBackground(): boolean;
}

/**
 * The floating OHLCV readout that follows the crosshair. Owns one absolutely
 * positioned div and nothing else.
 */
export class DataTooltipWidget {
  private _host: DataTooltipHost;
  private _element: HTMLDivElement | null = null;

  constructor(host: DataTooltipHost) {
    this._host = host;
  }

  public mount() {
    if (this._element) return;
    const options = this._host.getOptions();

    const tooltip = document.createElement('div');
    tooltip.style.position = 'absolute';
    tooltip.style.display = 'none';
    tooltip.style.pointerEvents = 'none';
    tooltip.style.zIndex = '2600';
    tooltip.style.maxWidth = '260px';
    tooltip.style.padding = '8px 10px';
    tooltip.style.borderRadius = '6px';
    tooltip.style.border = '1px solid rgba(128,128,128,0.28)';
    tooltip.style.boxShadow = '0 10px 30px rgba(0,0,0,0.24)';
    tooltip.style.font = `${options.layout.fontSize}px ${options.layout.fontFamily}`;

    this._host.container.appendChild(tooltip);
    this._element = tooltip;
  }

  public destroy() {
    this._element?.remove();
    this._element = null;
  }

  public hide() {
    if (this._element) this._element.style.display = 'none';
  }

  public update(state: DataTooltipState) {
    const element = this._element;
    if (!element) return;

    const options = this._host.getOptions();
    if (!options.tooltip.visible || !state.crosshairPos || !state.hoveredData) {
      element.style.display = 'none';
      return;
    }

    const bar = state.hoveredData;
    // `showOHLC` and `showVolume` have been in `TooltipOptions` since the first
    // release and were read by nothing: every tooltip listed all five rows. A
    // line series has one value per bar -- open, high, low and close are the
    // same number -- so a sparkline's readout was four copies of itself and a
    // volume of zero.
    const rows: Array<[string, string]> = [
      ...(options.tooltip.showOHLC
        ? ([
            [this._host.t('tooltip.open'), this._host.formatPrice(bar.open)],
            [this._host.t('tooltip.high'), this._host.formatPrice(bar.high)],
            [this._host.t('tooltip.low'), this._host.formatPrice(bar.low)],
            [this._host.t('tooltip.close'), this._host.formatPrice(bar.close)],
          ] as Array<[string, string]>)
        : ([[this._host.t('tooltip.close'), this._host.formatPrice(bar.close)]] as Array<[string, string]>)),
      ...(options.tooltip.showVolume
        ? ([[
            this._host.t('tooltip.volume'),
            (bar.volume || 0).toLocaleString(options.localization.locale),
          ]] as Array<[string, string]>)
        : []),
      ...state.extraRows,
    ];

    const isLight = this._host.isLightBackground();
    element.style.background = isLight ? 'rgba(255,255,255,0.96)' : 'rgba(15,23,42,0.96)';
    element.style.color = isLight ? '#0b1324' : '#f8fafc';
    element.innerHTML = `
      <div style="font-weight:700; margin-bottom:6px;">${this._host.formatTime(bar.timestamp)}</div>
      <div style="display:grid; grid-template-columns:repeat(2, auto); gap:3px 12px;">
        ${rows
          .map(
            ([label, value]) => `
          <span style="opacity:0.68;">${label}</span>
          <span style="text-align:right; font-variant-numeric:tabular-nums;">${value}</span>
        `,
          )
          .join('')}
      </div>
    `;

    // Measure after the content is in place, then clamp inside the container.
    const container = this._host.container;
    const left = Math.min(
      container.clientWidth - element.offsetWidth - 8,
      state.leftAxisWidth + state.crosshairPos.x + 14,
    );
    const top = Math.min(
      container.clientHeight - element.offsetHeight - 8,
      state.crosshairPos.y + 14,
    );
    element.style.left = `${Math.max(8, left)}px`;
    element.style.top = `${Math.max(8, top)}px`;
    element.style.display = 'block';
  }
}
