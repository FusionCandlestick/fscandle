/**
 * Which part of the chart a pointer is over, as geometry alone.
 *
 * The pointer handlers decide what a gesture *means* -- scale the time axis,
 * drag a scale, start a drawing, pan. What they first have to know is where the
 * pointer landed, and that question was answered inline, in each handler, from
 * five layout numbers at once:
 *
 *     const topXBottom = this._toolbarHeight + this._xAxisHeight;
 *     const bottomXTop = rect.height - this._xAxisHeight;
 *     const isWithinChartAreaX = x >= this._leftYAxisWidth && x <= rect.width - this._rightYAxisWidth;
 *
 * Three handlers carried their own copy of that arithmetic, which is three
 * chances for the rulers to disagree about where they are. It is also the part
 * a test can reach without a canvas, a pointer, or a chart.
 *
 * The regions are exclusive and cover the whole surface, so a caller can switch
 * on the result instead of falling through a chain of ifs.
 */

type PointerRegionKind =
  | 'toolbar'
  | 'time-axis-top'
  | 'time-axis-bottom'
  | 'price-axis'
  | 'plot';

export interface ChartSurfaceLayout {
  width: number;
  height: number;
  toolbarHeight: number;
  /** Height of one time-axis ruler; there is one at the top and one at the bottom. */
  xAxisHeight: number;
  leftGutter: number;
  rightGutter: number;
}

export interface PointerRegion {
  kind: PointerRegionKind;
  /** Set for `price-axis`: which gutter the pointer is over. */
  side?: 'left' | 'right';
}

/**
 * Resolve a container-relative point to its region.
 *
 * Order matters and mirrors what the handlers do: the toolbar wins over
 * everything, then the two time rulers (which only span the plot's width, not
 * the gutters), then the price gutters, and the plot takes the rest. A point
 * over a gutter *beside* a ruler therefore reads as `price-axis`, which is what
 * makes the corner behave like the axis it is next to rather than like the
 * ruler it is level with.
 */
export function resolvePointerRegion(
  x: number,
  y: number,
  layout: ChartSurfaceLayout,
): PointerRegion {
  if (y <= layout.toolbarHeight) return { kind: 'toolbar' };

  const withinPlotWidth = x >= layout.leftGutter && x <= layout.width - layout.rightGutter;
  const topRulerBottom = layout.toolbarHeight + layout.xAxisHeight;
  const bottomRulerTop = layout.height - layout.xAxisHeight;

  if (withinPlotWidth && y < topRulerBottom) return { kind: 'time-axis-top' };
  if (withinPlotWidth && y > bottomRulerTop) return { kind: 'time-axis-bottom' };

  if (x < layout.leftGutter) return { kind: 'price-axis', side: 'left' };
  if (x > layout.width - layout.rightGutter) return { kind: 'price-axis', side: 'right' };

  return { kind: 'plot' };
}

/** Whether a point falls between the gutters, over the plotting area's width. */
export function isWithinPlotWidth(x: number, layout: ChartSurfaceLayout): boolean {
  return x >= layout.leftGutter && x <= layout.width - layout.rightGutter;
}
