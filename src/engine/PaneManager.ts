import { MIN_PANE_WEIGHT, PaneLayoutModel } from '../model/PaneLayoutModel';
import type { PaneOptions } from '../types/options';
import { Pane } from './Pane';

export type PaneAxisSide = 'left' | 'right';

interface PaneEntry {
  pane: Pane;
  legend: HTMLDivElement;
}

/** Where a divider sits, in container coordinates. */
export interface DividerPlacement {
  left: number;
  width: number;
  top: number;
}

export { MIN_PANE_WEIGHT };

export class PaneManager {
  private _container: HTMLDivElement;
  private _entries: PaneEntry[] = [];
  /**
   * Appearance and behaviour of the divider strips, from the chart's `panes`
   * options. The manager owns the divider elements, so it is what applies them.
   */
  private _paneOptions: PaneOptions | null = null;
  /** Told which divider a press landed on, so the interaction layer can drag it. */
  private _onDividerPointerDown: ((index: number, event: PointerEvent) => void) | null = null;
  /**
   * Vertical geometry and the weights it comes from. The manager owns the pane
   * objects and their DOM; where those panes sit is arithmetic, and lives in a
   * model that can be tested without a document.
   */
  private _layout: PaneLayoutModel;
  private _dividers: HTMLDivElement[] = [];
  private _legendDOMs: Map<string, HTMLDivElement> = new Map();
  /**
   * Cached pane list, rebuilt when the set of panes changes.
   *
   * `panes()` is read on every layout and render pass, so it must not allocate
   * a fresh array each call. The cache is dropped in `addPane`, `removePane`,
   * and `dispose` — the only places the set can change.
   */
  private _paneCache: Pane[] | null = null;

  constructor(container: HTMLDivElement, paneOptions?: PaneOptions) {
    this._container = container;
    this._layout = new PaneLayoutModel(paneOptions?.dividerHeight ?? 4, paneOptions);
    if (paneOptions) this._paneOptions = paneOptions;
  }

  /**
   * Apply the `panes` options: layout geometry to the model, appearance to the
   * divider elements that already exist.
   */
  public applyOptions(paneOptions: PaneOptions): void {
    this._paneOptions = paneOptions;
    this._layout.setGeometry(paneOptions);
    this._dividers.forEach(divider => this._styleDivider(divider));
  }

  public onDividerPointerDown(handler: (index: number, event: PointerEvent) => void): void {
    this._onDividerPointerDown = handler;
  }

  /**
   * The divider element for `index`, created and placed if it does not exist.
   *
   * Building it here rather than in the chart's layout pass is what lets the
   * press that starts a resize be wired up at all: the element and its listener
   * are created together, so a divider can never exist without one.
   */
  public ensureDivider(index: number, placement: DividerPlacement): HTMLDivElement {
    let divider = this._dividers[index];
    if (!divider) {
      divider = document.createElement('div');
      divider.className = 'chart-divider';
      divider.style.position = 'absolute';
      // Above the event layer, so the press lands on the divider rather than
      // being read as a pan of the pane behind it.
      divider.style.zIndex = '2600';
      divider.addEventListener('pointerdown', event => {
        if (this._paneOptions && !this._paneOptions.resizable) return;
        event.preventDefault();
        event.stopPropagation();
        this._onDividerPointerDown?.(this._dividers.indexOf(divider!), event);
      });
      divider.addEventListener('pointerenter', () => {
        divider!.style.backgroundColor = this._paneOptions?.dividerHoverColor ?? 'rgba(128, 128, 128, 0.45)';
      });
      divider.addEventListener('pointerleave', () => {
        divider!.style.backgroundColor = this._paneOptions?.dividerColor ?? 'rgba(128, 128, 128, 0.1)';
      });
      this._container.appendChild(divider);
      this._dividers[index] = divider;
    }
    divider.style.left = `${placement.left}px`;
    divider.style.width = `${placement.width}px`;
    divider.style.top = `${placement.top}px`;
    this._styleDivider(divider);
    return divider;
  }

  private _styleDivider(divider: HTMLDivElement): void {
    divider.style.height = `${this._layout.dividerHeight}px`;
    divider.style.backgroundColor = this._paneOptions?.dividerColor ?? 'rgba(128, 128, 128, 0.1)';
    divider.style.cursor = this._paneOptions?.resizable === false ? 'default' : 'ns-resize';
  }

  /** The pane stack's vertical geometry, for callers that need to place things. */
  public layout(): PaneLayoutModel {
    return this._layout;
  }

  public addPane(id: string, side: PaneAxisSide = 'right') {
    const pane = new Pane(id, this._container);
    pane.setYAxisSide(side);

    const legend = document.createElement('div');
    legend.className = 'fscandle-legend';
    legend.style.position = 'absolute';
    legend.style.top = '8px';
    legend.style.left = '10px';
    legend.style.zIndex = '3100';
    legend.style.display = 'flex';
    legend.style.flexDirection = 'column';
    // Let drawing gestures pass through legend text; individual controls opt
    // back in with `pointer-events: auto`.
    legend.style.pointerEvents = 'none';
    pane.getContainer().appendChild(legend);

    this._entries.push({ pane, legend });
    this._legendDOMs.set(id, legend);
    this._paneCache = null;

    if (this._entries.length > this._layout.count) this._layout.appendPane();

    return pane;
  }

  public removePane(id: string) {
    const paneIndex = this._entries.findIndex(entry => entry.pane.getId() === id);
    if (paneIndex <= 0) return false;

    this._entries[paneIndex].pane.getContainer().remove();
    this._entries.splice(paneIndex, 1);
    this._legendDOMs.delete(id);
    this._paneCache = null;

    this._layout.removePane(paneIndex);

    this.clearDividers();
    return true;
  }

  public panes(): Pane[] {
    if (!this._paneCache) this._paneCache = this._entries.map(entry => entry.pane);
    return this._paneCache;
  }

  public getLegend(id: string) {
    return this._legendDOMs.get(id) || null;
  }

  public legends() {
    return this._legendDOMs;
  }

  /** Current pane weights, as a copy: the model owns them. */
  public weights(): number[] {
    return this._layout.weights();
  }

  /** Move weight between two adjacent panes, as a divider drag does. */
  public resizePair(index: number, delta: number): boolean {
    return this._layout.resizePair(index, delta);
  }

  public setWeights(weights: number[]) {
    this._layout.setWeights(weights);
    this.normalizeWeights();
  }

  public normalizeWeights() {
    this._layout.normalize(this._entries.length);
  }

  public getDivider(index: number) {
    return this._dividers[index] || null;
  }

  public dividers() {
    return this._dividers;
  }

  public clearDividers() {
    this._dividers.forEach(divider => divider.remove());
    this._dividers = [];
  }

  public dispose() {
    this.clearDividers();
    this._entries.forEach(entry => entry.pane.getContainer().remove());
    this._entries = [];
    this._paneCache = null;
    this._legendDOMs.clear();
    this._layout.setWeights([1]);
  }
}
