/**
 * Owner of a price scale's state: mode, inversion, and the vertical viewport.
 *
 * This state used to live twice — once as fields on `FusionCandlestickChart`
 * and once inside `CoordinateTransformer` — with the facade pushing its copy
 * into the transformer after every mutation. Two copies of the same value is
 * the ownership problem in miniature: a mutation that forgets to push leaves
 * the axis and the rendered prices disagreeing, and nothing fails loudly.
 *
 * The model is pure: no DOM, no canvas, no knowledge of panes or layout. It
 * owns the *values* and their invariants; deciding what to repaint stays with
 * the chart. That split is what makes it testable without a browser.
 *
 * Vertical layout clamping (keeping the visible price band inside the pane)
 * still belongs to the chart, because it depends on pane geometry this model
 * deliberately knows nothing about.
 */

import type { PriceScaleMode } from '../engine/CoordinateTransformer';

/**
 * Zoom bounds for the vertical scale.
 *
 * Below the minimum the price band collapses to a line; above the maximum the
 * band is so tall that candle bodies degenerate into slivers. Both ends are
 * unusable rather than merely ugly, so the clamp lives with the value.
 */
export const MIN_PRICE_SCALE = 0.01;
export const MAX_PRICE_SCALE = 10;

/** The vertical viewport as persisted and as synced between linked charts. */
export interface PriceScaleViewport {
  yScale: number;
  yOffset: number;
}

const clampScale = (value: number): number => {
  // A non-finite scale would poison every subsequent coordinate conversion, so
  // it is rejected in favour of the identity scale rather than propagated.
  if (!Number.isFinite(value)) return 1;
  return Math.max(MIN_PRICE_SCALE, Math.min(MAX_PRICE_SCALE, value));
};

const clampOffset = (value: number): number => (Number.isFinite(value) ? value : 0);

export class PriceScaleModel {
  private _mode: PriceScaleMode = 'normal';
  private _inverted = false;
  private _scale = 1;
  private _offset = 0;

  /** `'log'` renders equal ratios as equal distances; `'normal'` is linear. */
  public get mode(): PriceScaleMode {
    return this._mode;
  }

  public set mode(mode: PriceScaleMode) {
    this._mode = mode;
  }

  /** When true the axis runs high-to-low, so rising prices move down. */
  public get inverted(): boolean {
    return this._inverted;
  }

  public set inverted(inverted: boolean) {
    this._inverted = inverted;
  }

  /** Vertical zoom factor, always within [MIN_PRICE_SCALE, MAX_PRICE_SCALE]. */
  public get scale(): number {
    return this._scale;
  }

  public set scale(scale: number) {
    this._scale = clampScale(scale);
  }

  /** Vertical pan, in pixels. Unbounded here; the chart clamps it to its panes. */
  public get offset(): number {
    return this._offset;
  }

  public set offset(offset: number) {
    this._offset = clampOffset(offset);
  }

  /**
   * Multiply the zoom, returning whether it actually moved.
   *
   * The chart uses the return value to skip a repaint and a sync broadcast when
   * a zoom gesture is already pinned at a bound — without it, holding a pinch at
   * the limit would spam linked charts with no-op updates.
   */
  public zoomBy(factor: number): boolean {
    const previous = this._scale;
    this.scale = this._scale * factor;
    return this._scale !== previous;
  }

  public get viewport(): PriceScaleViewport {
    return { yScale: this._scale, yOffset: this._offset };
  }

  /** Apply a viewport, ignoring absent fields so partial sync payloads work. */
  public setViewport(viewport: Partial<PriceScaleViewport>): boolean {
    const previousScale = this._scale;
    const previousOffset = this._offset;
    if (viewport.yScale !== undefined) this.scale = viewport.yScale;
    if (viewport.yOffset !== undefined) this.offset = viewport.yOffset;
    return this._scale !== previousScale || this._offset !== previousOffset;
  }

  /** Back to the identity viewport, leaving mode and inversion alone. */
  public resetViewport(): void {
    this._scale = 1;
    this._offset = 0;
  }
}
