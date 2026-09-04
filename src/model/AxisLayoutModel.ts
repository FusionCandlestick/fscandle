/**
 * Horizontal geometry of the price-axis gutters, and the arithmetic that reads
 * it back.
 *
 * The chart stacks price axes into fixed-width columns on either side of the
 * plot: one per visible price scale, plus one for indicator panes on that side.
 * Everything else — how wide the plot is, whether a pointer is over the plot or
 * over an axis, and which axis column it is over — is arithmetic on those two
 * gutter widths.
 *
 * That arithmetic used to be written inline wherever it was needed: the same
 * `containerX - leftWidth` conversion in several places, and expressions like
 * `Math.floor((leftWidth - x - 1) / columnWidth)` sitting in a hit-test branch
 * where nothing could test them. Off-by-one errors in an axis hit test are
 * exactly the kind of thing that survives review and shows up as "clicking the
 * left axis sometimes grabs the wrong scale".
 *
 * The model owns the widths and answers the questions. It knows nothing about
 * canvases, panes, or price scales — column *counts* are decided by the chart,
 * since they depend on which scales are visible.
 */

import type { Bounding } from '../types';

export type AxisSide = 'left' | 'right';

export class AxisLayoutModel {
  private _columnWidth: number;
  private _maxColumnsPerSide: number;
  private _leftColumns = 0;
  private _rightColumns = 1;

  constructor(columnWidth: number, maxColumnsPerSide: number) {
    this._columnWidth = columnWidth;
    this._maxColumnsPerSide = maxColumnsPerSide;
  }

  /** Width of a single axis column, in pixels. */
  public get columnWidth(): number {
    return this._columnWidth;
  }

  public set columnWidth(width: number) {
    this._columnWidth = Math.max(0, width);
  }

  public get maxColumnsPerSide(): number {
    return this._maxColumnsPerSide;
  }

  /**
   * Set how many axis columns each side shows.
   *
   * Counts are clamped to the per-side maximum here rather than at every call
   * site, so a chart with more visible scales than columns degrades to the
   * cap instead of pushing the plot off screen.
   */
  public setColumns(left: number, right: number): void {
    this._leftColumns = this._clampColumns(left);
    this._rightColumns = this._clampColumns(right);
  }

  public get leftColumns(): number {
    return this._leftColumns;
  }

  public get rightColumns(): number {
    return this._rightColumns;
  }

  public get leftWidth(): number {
    return this._leftColumns * this._columnWidth;
  }

  public get rightWidth(): number {
    return this._rightColumns * this._columnWidth;
  }

  public widthFor(side: AxisSide): number {
    return side === 'left' ? this.leftWidth : this.rightWidth;
  }

  /** Plot width inside a container, never negative however narrow it gets. */
  public chartWidth(containerWidth: number): number {
    return Math.max(0, containerWidth - this.leftWidth - this.rightWidth);
  }

  /** Container-relative x to plot-relative x. May fall outside the plot. */
  public toChartX(containerX: number): number {
    return containerX - this.leftWidth;
  }

  /** Whether a container-relative x is over the plot rather than a gutter. */
  public isWithinChart(containerX: number, containerWidth: number): boolean {
    return containerX >= this.leftWidth && containerX <= containerWidth - this.rightWidth;
  }

  /**
   * Which axis column a container-relative x is over, or null for the plot.
   *
   * Columns are numbered outward from the plot on both sides, so index 0 is
   * always the column nearest the chart. On the left that means counting back
   * from the gutter's inner edge, which is where the `- 1` comes from: the
   * pixel at `leftWidth` itself belongs to the plot, not to column 0.
   */
  public hitTest(containerX: number, containerWidth: number): { side: AxisSide; axisIndex: number } | null {
    if (this._columnWidth <= 0) return null;

    if (containerX < this.leftWidth) {
      return { side: 'left', axisIndex: Math.floor((this.leftWidth - containerX - 1) / this._columnWidth) };
    }

    const rightEdge = containerWidth - this.rightWidth;
    if (containerX > rightEdge) {
      return { side: 'right', axisIndex: Math.floor((containerX - rightEdge) / this._columnWidth) };
    }

    return null;
  }

  /**
   * Pixel bounds of one axis column, relative to its own gutter.
   *
   * Left columns are laid out right-to-left so that index 0 sits against the
   * plot, mirroring the right side.
   */
  public columnBounds(side: AxisSide, axisIndex: number, height: number): Bounding {
    const totalWidth = this.widthFor(side);
    const left = side === 'left'
      ? totalWidth - (axisIndex + 1) * this._columnWidth
      : axisIndex * this._columnWidth;

    return { width: this._columnWidth, height, left, top: 0 };
  }

  private _clampColumns(count: number): number {
    if (!Number.isFinite(count)) return 0;
    return Math.min(this._maxColumnsPerSide, Math.max(0, Math.floor(count)));
  }
}
