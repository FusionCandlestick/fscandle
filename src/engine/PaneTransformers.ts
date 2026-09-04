/**
 * One coordinate transformer per pane.
 *
 * Every pane used to render through the chart's single shared transformer. The
 * main pane set its price range while drawing, then each indicator pane set
 * *its* range on the very same instance — and panes render main-first, so once
 * a frame was over the shared transformer held whatever the last sub-pane had
 * scaled to (RSI's 0-100, MACD's ±0.4). Everything that reads a transformer
 * between frames — placing a drawing point, the crosshair `price`, the public
 * `coordinateToPrice` — therefore answered in the wrong pane's price space as
 * soon as any indicator pane existed.
 *
 * Giving each pane its own instance is what makes "the transformer for pane X"
 * a question with a stable answer, rather than one whose answer depends on
 * which pane happened to be drawn last.
 *
 * The main pane keeps using the chart's own transformer: it is the one the
 * viewport (offset, bar spacing) is driven through, and the public time-scale
 * API is defined against it.
 */

import { CoordinateTransformer } from './CoordinateTransformer';

const MAIN_PANE_ID = 'main';

export class PaneTransformers {
  private _byPaneId: Map<string, CoordinateTransformer> = new Map();

  /**
   * @param _main       The main pane's transformer, owned by the chart.
   * @param _configure  Applied once to every sub-pane transformer created here,
   *                    so chart-wide settings (price-scale model, right margin)
   *                    cannot be forgotten for a pane added later.
   */
  constructor(
    private readonly _main: CoordinateTransformer,
    private readonly _configure: (transformer: CoordinateTransformer) => void = () => {},
  ) {}

  public main(): CoordinateTransformer {
    return this._main;
  }

  /** The transformer for a pane, created on first use for a sub-pane. */
  public for(paneId: string): CoordinateTransformer {
    if (paneId === MAIN_PANE_ID) return this._main;

    const existing = this._byPaneId.get(paneId);
    if (existing) return existing;

    const transformer = new CoordinateTransformer();
    this._configure(transformer);
    this._byPaneId.set(paneId, transformer);
    return transformer;
  }

  /** The transformer for a pane if one exists, without creating one. */
  public find(paneId: string): CoordinateTransformer | null {
    if (paneId === MAIN_PANE_ID) return this._main;
    return this._byPaneId.get(paneId) ?? null;
  }

  public has(paneId: string): boolean {
    return paneId === MAIN_PANE_ID || this._byPaneId.has(paneId);
  }

  /** Forget panes that no longer exist, so a removed indicator pane's scale dies with it. */
  public retain(paneIds: Iterable<string>): void {
    const keep = new Set(paneIds);
    for (const paneId of [...this._byPaneId.keys()]) {
      if (!keep.has(paneId)) this._byPaneId.delete(paneId);
    }
  }

  /** Apply a chart-wide setting to every transformer, main included. */
  public forEach(visit: (transformer: CoordinateTransformer) => void): void {
    visit(this._main);
    this._byPaneId.forEach(transformer => visit(transformer));
  }
}
