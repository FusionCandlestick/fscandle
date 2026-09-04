import type { PriceScaleMode } from '../engine/CoordinateTransformer';
import type { ToolbarHost } from './types';

const ICON = {
  series:
    '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="opacity: 0.7;"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>',
  undo: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7v6h6"></path><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"></path></svg>',
  redo: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 7v6h-6"></path><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13"></path></svg>',
  export:
    '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
  import:
    '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>',
  snapshot:
    '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>',
  fullscreen:
    '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>',
  invert:
    '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="3" x2="12" y2="21"/><polyline points="8 7 12 3 16 7"/><polyline points="8 17 12 21 16 17"/></svg>',
  watermark:
    '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20M2 12h20"/><circle cx="12" cy="12" r="10"/><path d="M12 8l4 4-4 4"/></svg>',
  close:
    '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>',
} as const;

const DRAWING_TOOLS: Array<{ label: string; mode: string | null }> = [
  { label: '+ Tools', mode: null },
  { label: 'Line: Segment', mode: 'line:segment' },
  { label: 'Line: Trend', mode: 'line:trend' },
  { label: 'Line: Ray', mode: 'line:ray' },
  { label: 'Line: Infinite', mode: 'line:infinite' },
  { label: 'Line: Horizontal', mode: 'line:horizontal' },
  { label: 'Line: Vertical', mode: 'line:vertical' },
  { label: 'Line: Price', mode: 'line:price' },
  { label: 'Channel: Parallel', mode: 'channel:parallel' },
  { label: 'Channel: Price', mode: 'channel:price' },
  { label: 'Rectangle', mode: 'rectangle' },
  { label: 'Fibonacci', mode: 'fibonacci' },
  { label: 'Measure', mode: 'measure' },
  { label: 'Annotation: Text', mode: 'annotation:text' },
  { label: 'Annotation: Arrow', mode: 'annotation:arrow' },
  { label: 'Annotation: Tag', mode: 'annotation:tag' },
  { label: 'Annotation: Image', mode: 'annotation:image' },
];

const TOOLBAR_HEIGHT = 40;

/**
 * The chart's top toolbar. Owns its own DOM subtree and talks to the chart
 * exclusively through `ToolbarHost`.
 */
export class ToolbarWidget {
  private _host: ToolbarHost;
  private _root: HTMLDivElement | null = null;
  private _contentContainer: HTMLDivElement | null = null;
  private _importFileInput: HTMLInputElement | null = null;
  /** Re-run after state changes so toggle buttons reflect the current values. */
  private _iconRefreshers: Array<() => void> = [];

  constructor(host: ToolbarHost) {
    this._host = host;
  }

  public get height(): number {
    return this._root ? TOOLBAR_HEIGHT : 0;
  }

  public get element(): HTMLDivElement | null {
    return this._root;
  }

  public mount() {
    if (this._root) return;
    this._build();
  }

  public destroy() {
    this._root?.remove();
    this._importFileInput?.remove();
    this._root = null;
    this._contentContainer = null;
    this._importFileInput = null;
    this._iconRefreshers = [];
  }

  /** Re-apply theme colors after an options change, without rebuilding. */
  public applyTheme() {
    if (!this._root) return;
    const colors = this._host.getAxisRailColors();
    this._root.style.backgroundColor = colors.surface;
    this._root.style.borderBottom = `1px solid ${colors.border}`;
    this._iconRefreshers.forEach(refresh => refresh());
  }

  private _textColor() {
    return this._host.getOptions().layout.textColor;
  }

  private _selectStyle() {
    return `
      background: transparent;
      border: 1px solid rgba(128,128,128,0.2);
      color: ${this._textColor()};
      font-size: 10px;
      font-weight: 500;
      cursor: pointer;
      outline: none;
      padding: 4px 10px;
      border-radius: 6px;
      transition: all 0.2s;
    `;
  }

  private _buttonStyle() {
    return `
        background: transparent;
        border: 1px solid rgba(128,128,128,0.2);
        color: ${this._textColor()};
        padding: 4px 8px;
        border-radius: 6px;
        cursor: pointer;
        display: flex;
        align-items: center;
        transition: all 0.2s;
    `;
  }

  private _createButton(html: string, title: string, onClick: () => void) {
    const button = document.createElement('button');
    button.type = 'button';
    button.style.cssText = this._buttonStyle();
    button.innerHTML = html;
    button.title = title;
    button.onclick = onClick;
    return button;
  }

  /**
   * A button whose icon/color reflects some chart state. The refresher is
   * registered so `applyTheme` and post-click updates keep it in sync.
   */
  private _createToggleButton(
    title: string,
    isActive: () => boolean,
    renderIcon: (active: boolean) => string,
    onClick: () => void,
  ) {
    const button = document.createElement('button');
    button.type = 'button';
    button.style.cssText = this._buttonStyle();
    button.title = title;

    const refresh = () => {
      const active = isActive();
      button.innerHTML = renderIcon(active);
      button.style.color = active ? '#2962FF' : this._textColor();
      button.style.borderColor = active ? '#2962FF' : 'rgba(128,128,128,0.2)';
    };
    refresh();
    this._iconRefreshers.push(refresh);

    button.onclick = () => {
      onClick();
      refresh();
    };
    return button;
  }

  private _build() {
    const options = this._host.getOptions();
    const colors = this._host.getAxisRailColors();

    const root = document.createElement('div');
    root.style.position = 'absolute';
    root.style.top = '0';
    root.style.left = '0';
    root.style.right = '0';
    root.style.height = `${TOOLBAR_HEIGHT}px`;
    root.style.display = 'flex';
    root.style.alignItems = 'center';
    root.style.justifyContent = 'space-between';
    root.style.padding = '0 16px';
    root.style.gap = '12px';
    root.style.backgroundColor = colors.surface;
    root.style.borderBottom = `1px solid ${colors.border}`;
    root.style.zIndex = '3000';
    this._host.container.appendChild(root);
    this._root = root;

    const content = document.createElement('div');
    content.style.display = 'flex';
    content.style.alignItems = 'center';
    content.style.gap = '8px';
    content.style.flex = '1';
    content.style.minWidth = '0';
    content.style.overflowX = 'auto';
    content.style.overflowY = 'hidden';
    content.style.paddingBottom = '2px';
    content.style.setProperty('scrollbar-width', 'thin');
    this._contentContainer = content;

    const controls = document.createElement('div');
    controls.style.display = 'flex';
    controls.style.alignItems = 'center';
    controls.style.gap = '12px';
    controls.style.flexShrink = '0';

    root.appendChild(content);
    root.appendChild(controls);

    controls.appendChild(this._buildSeriesTypeControl());
    controls.appendChild(this._buildMagnetButton());
    controls.appendChild(this._buildScaleModeSelect());
    controls.appendChild(this._buildInvertButton());
    controls.appendChild(this._buildDrawingSelect());
    controls.appendChild(this._buildIndicatorSelect());
    controls.appendChild(
      this._createButton(ICON.undo, this._host.t('toolbar.undo'), () => this._host.undo()),
    );
    controls.appendChild(
      this._createButton(ICON.redo, this._host.t('toolbar.redo'), () => this._host.redo()),
    );
    controls.appendChild(
      this._createButton(ICON.export, this._host.t('toolbar.exportDrawings'), () =>
        this._host.exportOverlaysJSON(),
      ),
    );
    controls.appendChild(this._buildImportButton());
    controls.appendChild(this._buildBackgroundPicker());
    controls.appendChild(this._buildWatermarkButton());
    controls.appendChild(
      this._createButton(ICON.snapshot, this._host.t('toolbar.screenshot'), () => {
        void this._downloadScreenshot();
      }),
    );
    controls.appendChild(
      this._createButton(ICON.fullscreen, this._host.t('toolbar.fullscreen'), () =>
        this._host.toggleFullScreen(),
      ),
    );

    void options;
    this.updateContentList();
  }

  private async _downloadScreenshot() {
    const url = await this._host.takeScreenshot();
    const link = document.createElement('a');
    link.href = url;
    link.download = `chart-${Date.now()}.png`;
    link.click();
  }

  private _buildSeriesTypeControl() {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display: flex; align-items: center; gap: 6px;';
    wrap.innerHTML = ICON.series;

    const select = document.createElement('select');
    select.style.cssText = this._selectStyle();
    select.onmouseover = () => (select.style.backgroundColor = 'rgba(128,128,128,0.05)');
    select.onmouseout = () => (select.style.backgroundColor = 'transparent');

    (
      [
        ['candle', 'series.candle'],
        ['bar', 'series.bar'],
        ['area', 'series.area'],
        ['line', 'series.line'],
        ['step', 'series.step'],
        ['baseline', 'series.baseline'],
        ['hollow', 'series.hollow'],
        ['ha', 'series.ha'],
      ] as const
    ).forEach(([value, key]) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = this._host.t(key);
      select.appendChild(option);
    });

    select.addEventListener('change', event => {
      const value = event.currentTarget instanceof HTMLSelectElement ? event.currentTarget.value : '';
      if (this._host.isConfigurablePriceSeriesStyle(value)) {
        this._host.setChartStyle(value);
      }
    });

    wrap.appendChild(select);
    return wrap;
  }

  private _buildDrawingSelect() {
    const select = document.createElement('select');
    select.style.cssText = this._selectStyle();

    [...DRAWING_TOOLS, { label: 'Clear', mode: 'clear' }].forEach(tool => {
      const option = document.createElement('option');
      option.value = tool.label;
      option.textContent = tool.label;
      select.appendChild(option);
    });

    select.addEventListener('change', event => {
      const target = event.target as HTMLSelectElement;
      if (target.value === 'Clear') {
        this._host.clearOverlays();
      } else {
        const tool = DRAWING_TOOLS.find(item => item.label === target.value);
        if (tool?.mode) this._host.setDrawingMode(tool.mode);
      }
      target.value = '+ Tools';
    });

    return select;
  }

  private _buildIndicatorSelect() {
    const select = document.createElement('select');
    select.style.cssText = this._selectStyle();
    select.onmouseover = () => (select.style.backgroundColor = 'rgba(128,128,128,0.05)');
    select.onmouseout = () => (select.style.backgroundColor = 'transparent');

    const actions: Record<string, () => void> = {
      EMA: () => this._host.addEMASeries(20),
      BOLL: () => this._host.addBOLLSeries(),
      MACD: () => this._host.addMACDSeries(),
      RSI: () => this._host.addRSISeries(),
      KDJ: () => this._host.addKDJSeries(),
      WR: () => this._host.addWRSeries(),
      VOLMA: () => this._host.addVOLMASeries(),
    };

    ['+ Indicators', ...Object.keys(actions)].forEach(label => {
      const option = document.createElement('option');
      option.value = label;
      option.textContent = label;
      select.appendChild(option);
    });

    select.addEventListener('change', event => {
      const target = event.target as HTMLSelectElement;
      actions[target.value]?.();
      target.value = '+ Indicators';
    });

    return select;
  }

  private _buildMagnetButton() {
    return this._createToggleButton(
      this._host.t('toolbar.magnet'),
      () => this._host.getMagnetMode(),
      active =>
        `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="${active ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 7l-5 5-5-5"></path><path d="M17 12l-5 5-5-5"></path></svg>`,
      () => this._host.setMagnetMode(!this._host.getMagnetMode()),
    );
  }

  private _buildInvertButton() {
    return this._createToggleButton(
      this._host.t('toolbar.invertAxis'),
      () => this._host.getInvertScale(),
      () => ICON.invert,
      () => this._host.setInvertScale(!this._host.getInvertScale()),
    );
  }

  private _buildWatermarkButton() {
    return this._createToggleButton(
      this._host.t('toolbar.watermark'),
      () => this._host.getOptions().watermark.visible,
      () => ICON.watermark,
      () =>
        this._host.applyOptions({
          watermark: { visible: !this._host.getOptions().watermark.visible },
        }),
    );
  }

  private _buildScaleModeSelect() {
    const select = document.createElement('select');
    select.title = this._host.t('toolbar.priceScaleMode');
    select.style.cssText = `
      background: rgba(128,128,128,0.08);
      color: ${this._textColor()};
      border: 1px solid rgba(128,128,128,0.2);
      border-radius: 6px;
      padding: 3px 4px 3px 6px;
      font-size: 10px;
      font-family: inherit;
      cursor: pointer;
      outline: none;
      text-align: center;
      min-width: 46px;
    `;

    const options = this._host.getOptions();
    (
      [
        ['normal', 'toolbar.scaleLinear'],
        ['log', 'toolbar.scaleLog'],
      ] as const
    ).forEach(([value, key]) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = this._host.t(key);
      option.style.background = options.layout.background.color;
      option.style.color = options.layout.textColor;
      select.appendChild(option);
    });

    select.value = this._host.getPriceScaleMode();
    select.addEventListener('change', () => {
      this._host.setPriceScaleMode(select.value as PriceScaleMode);
    });
    return select;
  }

  private _buildImportButton() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.style.display = 'none';
    input.addEventListener('change', event => {
      const file = (event.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = loadEvent => {
        try {
          this._host.importOverlaysJSON(loadEvent.target?.result as string);
        } catch {
          console.warn('[FusionCandlestick] Invalid drawings JSON');
        }
      };
      reader.readAsText(file);
      (event.target as HTMLInputElement).value = '';
    });
    this._host.container.appendChild(input);
    this._importFileInput = input;

    return this._createButton(ICON.import, this._host.t('toolbar.importDrawings'), () =>
      input.click(),
    );
  }

  private _buildBackgroundPicker() {
    const wrap = document.createElement('div');
    wrap.style.cssText =
      'display: flex; align-items: center; justify-content: center; width: 28px; height: 28px; border: 1px solid rgba(128,128,128,0.2); border-radius: 6px; overflow: hidden; cursor: pointer;';

    const picker = document.createElement('input');
    picker.type = 'color';
    picker.value = this._host.getOptions().layout.background.color;
    picker.style.cssText =
      'width: 40px; height: 40px; padding: 0; border: none; background: transparent; cursor: pointer;';
    picker.title = this._host.t('toolbar.backgroundColor');
    picker.onchange = event => {
      this._host.applyOptions({
        layout: { background: { color: (event.target as HTMLInputElement).value } },
      });
    };

    wrap.appendChild(picker);
    return wrap;
  }

  /** Rebuild the chips showing which series/indicators/overlays are active. */
  public updateContentList() {
    if (!this._contentContainer) return;

    const items = this._host.getToolbarContentItems();
    const textColor = this._textColor();

    const html =
      items.length === 0
        ? `<span style="color: ${textColor}; font-size: 10px; opacity: 0.65; white-space: nowrap;">${this._host.t('toolbar.noVisibleContent')}</span>`
        : items
            .map(item => {
              const paneAttr = item.paneId ? ` data-pane="${item.paneId}"` : '';
              return `<div style="display: inline-flex; align-items: center; gap: 6px; height: 24px; padding: 0 8px; border-radius: 999px; border: 1px solid rgba(128,128,128,0.22); background: rgba(128,128,128,0.08); color: ${item.color}; font-size: 10px; white-space: nowrap;">
            <span style="pointer-events: none; max-width: 140px; overflow: hidden; text-overflow: ellipsis;">${item.label}</span>
            <button class="fscandle-toolbar-remove" data-kind="${item.kind}" data-id="${item.id}"${paneAttr}
              style="display: inline-flex; align-items: center; justify-content: center; width: 16px; height: 16px; padding: 0; border: none; background: transparent; color: ${item.color}; cursor: pointer; opacity: 0.75;">
              ${ICON.close}
            </button>
          </div>`;
            })
            .join('');

    if (this._contentContainer.innerHTML === html) return;
    this._contentContainer.innerHTML = html;

    this._contentContainer
      .querySelectorAll('.fscandle-toolbar-remove')
      .forEach(button => {
        button.addEventListener('pointerdown', event => event.stopPropagation());
        button.addEventListener('click', event => {
          event.stopPropagation();
          const target = event.currentTarget as HTMLElement;
          const kind = target.getAttribute('data-kind');
          const id = target.getAttribute('data-id');
          if (kind && id) {
            this._host.removeToolbarContentItem(kind, id, target.getAttribute('data-pane'));
          }
        });
      });
  }
}
