/**
 * Vertical geometry of the pane stack, and the weights it is derived from.
 *
 * Panes divide the chart's vertical space by weight, with a fixed-height
 * divider between each adjacent pair. Two questions follow from that: where each
 * pane sits, and what a divider drag does to the weights. Both were written
 * inline — the layout pass computed `weight / total * availableHeight` while the
 * drag handler converted pixels to weight against a *different* height, one that
 * had never had the dividers subtracted from it. A drag therefore moved the
 * divider slightly less than the cursor, by the fraction the dividers take up.
 *
 * The model owns the weights and answers both questions from the same numbers,
 * so the two cannot disagree again. It knows nothing about DOM elements or
 * canvases: `PaneManager` still owns the pane objects and their containers, and
 * asks this model where to put them.
 */

/**
 * Smallest share of the vertical space a pane may hold. Below this a pane is too
 * short to render anything readable, so resizes stop here rather than letting a
 * pane vanish.
 */
export const MIN_PANE_WEIGHT = 0.1;

/** Vertical box of one pane, in the coordinate space `boxes` was given. */
export interface PaneBox {
  top: number;
  height: number;
}

/** Share a newly added pane takes before the stack is renormalized. */
const DEFAULT_NEW_PANE_WEIGHT = 0.3;

/** The parts of the pane stack a caller can configure, via `panes` in the options. */
export interface PaneLayoutGeometry {
  dividerHeight: number;
  minWeight: number;
  newPaneWeight: number;
}

export class PaneLayoutModel {
  private _weights: number[] = [1];
  private _dividerHeight: number;
  /**
   * Weight floor and new-pane share.
   *
   * Both were constants here. They are geometry a host application has a
   * legitimate reason to set — a four-pane workspace needs a floor below 0.1 to
   * be usable at all — so they are settable, and clamped to a range in which the
   * arithmetic below still terminates: a floor at or above `1 / count` cannot be
   * satisfied by every pane at once.
   */
  private _minWeight: number = MIN_PANE_WEIGHT;
  private _newPaneWeight: number = DEFAULT_NEW_PANE_WEIGHT;

  constructor(dividerHeight: number, geometry: Partial<PaneLayoutGeometry> = {}) {
    this._dividerHeight = Math.max(0, dividerHeight);
    this.setGeometry(geometry);
  }

  public get dividerHeight(): number {
    return this._dividerHeight;
  }

  /** Smallest share a pane may hold, as `resizePair` and `normalize` enforce it. */
  public get minWeight(): number {
    return this._minWeight;
  }

  /**
   * Apply configured geometry. Weights already held are renormalized against the
   * new floor, so lowering it does not leave the stack in a state the floor
   * forbids.
   */
  public setGeometry(geometry: Partial<PaneLayoutGeometry>): void {
    if (geometry.dividerHeight !== undefined && Number.isFinite(geometry.dividerHeight)) {
      this._dividerHeight = Math.max(0, geometry.dividerHeight);
    }
    if (geometry.minWeight !== undefined && Number.isFinite(geometry.minWeight)) {
      // Above 0.5 two panes could not both clear the floor.
      this._minWeight = Math.min(0.5, Math.max(0, geometry.minWeight));
    }
    if (geometry.newPaneWeight !== undefined && Number.isFinite(geometry.newPaneWeight)) {
      this._newPaneWeight = Math.min(0.9, Math.max(0.05, geometry.newPaneWeight));
    }
    this.normalize(this._weights.length);
  }

  public get count(): number {
    return this._weights.length;
  }

  /**
   * Current weights.
   *
   * Returns a copy on purpose. Handing out the internal array made every caller
   * an alias of model state: in-place edits silently worked until the array was
   * replaced, and then stopped.
   */
  public weights(): number[] {
    return [...this._weights];
  }

  public setWeights(weights: number[]): void {
    this._weights = weights.length > 0 ? [...weights] : [1];
    this.normalize(this._weights.length);
  }

  /**
   * Weight for a pane being added: it takes `newPaneWeight` and the panes
   * already present are rescaled to make room, which `normalize` does.
   *
   * The shares were 0.3 for the second pane and 0.25 for every later one. One
   * configurable share replaces both — the two constants encoded no rule beyond
   * "a bit smaller", and after normalization the difference is under three
   * percentage points of pane height.
   */
  public appendPane(): void {
    if (this._weights.length === 0) {
      this._weights = [1];
      return;
    }
    if (this._weights.length === 1) {
      this._weights = [1 - this._newPaneWeight, this._newPaneWeight];
      return;
    }
    this._weights.push(this._newPaneWeight);
  }

  public removePane(index: number): void {
    if (index < 0 || index >= this._weights.length) return;
    this._weights.splice(index, 1);
    if (this._weights.length === 0) this._weights = [1];
  }

  /**
   * Pad, truncate, and rescale the weights to `paneCount` panes summing to 1.
   *
   * Every weight is floored at the minimum *before* the sum is taken, so a
   * degenerate input (zeros, negatives, NaN dropped in by a restored workspace)
   * cannot produce a pane of zero height. The floor applies to the input, not
   * to the result: rescaling can still leave a share just under the minimum,
   * and with enough panes it must. Keeping every *share* above the minimum is
   * `resizePair`'s job, which is where a user can actually drive one to zero.
   */
  public normalize(paneCount: number): void {
    const count = Math.max(1, Math.floor(paneCount));
    while (this._weights.length < count) this._weights.push(this._newPaneWeight);
    if (this._weights.length > count) this._weights = this._weights.slice(0, count);

    const floored = this._weights.map(weight =>
      Number.isFinite(weight) ? Math.max(this._minWeight, weight) : this._minWeight,
    );
    const total = floored.reduce((sum, weight) => sum + weight, 0);
    if (total <= 0) {
      this._weights = Array.from({ length: count }, () => 1 / count);
      return;
    }
    this._weights = floored.map(weight => weight / total);
  }

  /**
   * Move weight between two adjacent panes, as a divider drag does.
   *
   * Returns false and changes nothing when the move would push either pane below
   * the minimum, so a drag past the limit stops rather than collapsing a pane.
   */
  public resizePair(index: number, delta: number): boolean {
    const first = this._weights[index];
    const second = this._weights[index + 1];
    if (first === undefined || second === undefined) return false;
    if (first + delta <= this._minWeight || second - delta <= this._minWeight) return false;
    this._weights[index] = first + delta;
    this._weights[index + 1] = second - delta;
    return true;
  }

  /** Height the panes actually share, once the dividers have taken theirs. */
  public availableHeight(chartAreaHeight: number, paneCount = this._weights.length): number {
    const dividers = Math.max(0, paneCount - 1) * this._dividerHeight;
    return Math.max(0, chartAreaHeight - dividers);
  }

  /**
   * Vertical box of each pane, stacked from `firstTop` downward with a divider
   * between adjacent panes.
   *
   * Weights are read as shares of their own sum rather than assumed normalized:
   * the layout pass runs on resize, and a caller that has not normalized since
   * its last edit still gets proportional panes instead of a stack that
   * overflows or leaves a gap.
   */
  public boxes(chartAreaHeight: number, firstTop: number, paneCount = this._weights.length): PaneBox[] {
    const count = Math.max(0, Math.min(Math.floor(paneCount), this._weights.length));
    if (count === 0) return [];

    const weights = this._weights.slice(0, count);
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    const available = this.availableHeight(chartAreaHeight, count);
    if (total <= 0) {
      const height = available / count;
      return weights.map((_, index) => ({ top: firstTop + index * (height + this._dividerHeight), height }));
    }

    const boxes: PaneBox[] = [];
    let top = firstTop;
    for (const weight of weights) {
      const height = (weight / total) * available;
      boxes.push({ top, height });
      top += height + this._dividerHeight;
    }
    return boxes;
  }

  /** Top edge of the divider below pane `index`, or null when there is none. */
  public dividerTop(index: number, chartAreaHeight: number, firstTop: number, paneCount = this._weights.length): number | null {
    const boxes = this.boxes(chartAreaHeight, firstTop, paneCount);
    const box = boxes[index];
    if (!box || index >= boxes.length - 1) return null;
    return box.top + box.height;
  }

  /**
   * Weight change a divider drag of `pixels` should produce.
   *
   * Measured against the same height `boxes` distributes, which is the point of
   * having it here: a drag now moves the divider to the cursor rather than to
   * the cursor scaled by the fraction the dividers occupy.
   */
  public pixelsToWeight(pixels: number, chartAreaHeight: number, paneCount = this._weights.length): number {
    const available = this.availableHeight(chartAreaHeight, paneCount);
    if (available <= 0) return 0;
    const total = this._weights.slice(0, paneCount).reduce((sum, weight) => sum + weight, 0);
    return (pixels * total) / available;
  }
}
