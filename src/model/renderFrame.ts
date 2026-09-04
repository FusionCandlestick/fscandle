/**
 * The frame a render pass draws: pane geometry, resolved once, as data.
 *
 * The render pass used to derive its geometry inline, per pane, as it drew.
 * Two copies of `bounding.width - leftGutter - rightGutter`, two copies of the
 * pane-local crosshair conversion, and the "is this the bottom pane?" test
 * written as `pane === this._panes[this._panes.length - 1]` in three places. All
 * of it read straight off chart fields while drawing, which is why the renderer
 * could not be looked at, or tested, without a canvas and a laid-out DOM.
 *
 * `buildChartFrame` answers those questions once, from numbers, before anything
 * is drawn. The renderer then walks `panes` and draws what each entry says --
 * a model the view reads, rather than a view that computes as it paints.
 *
 * It deliberately knows nothing about canvases, contexts or series. What a pane
 * *contains* is still the chart's business; where it is, how big its plot is,
 * whether the crosshair falls inside it and how much of it needs redrawing are
 * this module's.
 */

/** Box of a pane in container coordinates, as `Pane.getBounding` reports it. */
interface PaneBounding {
  top: number;
  left: number;
  width: number;
  height: number;
}

/**
 * What a pane holds, which decides how it is drawn: the price pane carries the
 * main series and its stacked scales, an indicator pane carries indicators and
 * scales itself to their values.
 */
type PaneFrameKind = 'price' | 'indicator';

interface PaneFrameInput {
  id: string;
  kind: PaneFrameKind;
  bounding: PaneBounding;
  axisSide: 'left' | 'right';
}

export interface ChartFrameInput {
  /** Container size, in CSS pixels. */
  width: number;
  height: number;
  toolbarHeight: number;
  xAxisHeight: number;
  leftGutter: number;
  rightGutter: number;
  panes: PaneFrameInput[];
  /**
   * Crosshair position in chart-plot coordinates: x from the left gutter, y
   * from below the top time ruler. Null when the pointer is not over the chart.
   */
  crosshair: { x: number; y: number } | null;
  /** Redraw level for the whole chart, and any pane that needs more than that. */
  level: number;
  levelByPane?: ReadonlyMap<string, number>;
}

export interface PaneFrame {
  id: string;
  kind: PaneFrameKind;
  index: number;
  /** The bottom pane owns the time-axis labels, which only one pane may draw. */
  isLast: boolean;
  bounding: PaneBounding;
  /** Plot area, with the price gutters taken off. */
  plotWidth: number;
  plotHeight: number;
  axisSide: 'left' | 'right';
  /**
   * Crosshair in pane-local coordinates, or null when it is over another pane.
   * Resolving it here is what keeps a pane from drawing a crosshair line that
   * belongs to its neighbour.
   */
  crosshair: { x: number; y: number } | null;
  /** How much of this pane has to be redrawn. */
  level: number;
}

export interface ChartFrame {
  width: number;
  height: number;
  /** Top-left of the plot area, which pane-local coordinates are measured from. */
  plotOrigin: { left: number; top: number };
  panes: PaneFrame[];
  /** Highest level any pane needs; what the shared chrome is drawn at. */
  level: number;
}

/**
 * Resolve one frame's geometry.
 *
 * Pure, and total: a zero-sized container, a pane taller than the chart or an
 * empty pane list all produce a frame the renderer can walk without a guard of
 * its own. Plot dimensions are floored at zero rather than allowed to go
 * negative, which is what a container narrower than its own gutters produces —
 * and what `clearRect` silently ignores while every later coordinate comes out
 * mirrored.
 */
export function buildChartFrame(input: ChartFrameInput): ChartFrame {
  const plotOrigin = {
    left: input.leftGutter,
    top: input.toolbarHeight + input.xAxisHeight,
  };

  const panes = input.panes.map((pane, index) => {
    const plotWidth = Math.max(0, pane.bounding.width - input.leftGutter - input.rightGutter);
    const plotHeight = Math.max(0, pane.bounding.height);
    const paneLevel = Math.max(input.level, input.levelByPane?.get(pane.id) ?? 0);

    return {
      id: pane.id,
      kind: pane.kind,
      index,
      isLast: index === input.panes.length - 1,
      bounding: pane.bounding,
      plotWidth,
      plotHeight,
      axisSide: pane.axisSide,
      crosshair: paneLocalCrosshair(input.crosshair, pane.bounding, plotOrigin.top, plotHeight),
      level: paneLevel,
    } satisfies PaneFrame;
  });

  return {
    width: input.width,
    height: input.height,
    plotOrigin,
    panes,
    level: panes.reduce((highest, pane) => Math.max(highest, pane.level), input.level),
  };
}

/**
 * The crosshair in one pane's coordinates, or null when it is not in it.
 *
 * The x coordinate is already plot-relative and shared by every pane -- the
 * vertical line spans the stack. Only y has to be re-based, against the pane's
 * offset from the top of the plot area.
 */
function paneLocalCrosshair(
  crosshair: { x: number; y: number } | null,
  bounding: PaneBounding,
  plotTop: number,
  plotHeight: number,
): { x: number; y: number } | null {
  if (!crosshair) return null;
  const localY = crosshair.y - (bounding.top - plotTop);
  if (localY < 0 || localY > plotHeight) return null;
  return { x: crosshair.x, y: localY };
}
