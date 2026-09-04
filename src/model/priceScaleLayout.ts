/**
 * Which gutter each price scale is drawn in, and in which column.
 *
 * The rule is small but it was written inside a method that also collected the
 * scales, read the chart's hidden-series set, and *wrote the answer back* into
 * the scale registry. That method is called from five places -- the render
 * pass, the axis-width calculation, the legend, axis hit-testing, and the
 * vertical-drag handler -- so a single layout pass re-derived the placement
 * several times and re-wrote the same fields each time. A query that mutates is
 * a query nobody can call twice with confidence.
 *
 * Here it is a function of its inputs and nothing else: no DOM, no registry, no
 * chart. The caller applies the result once.
 */

type PriceScaleSide = 'left' | 'right';

export interface PriceScaleLayoutInput {
  id: string;
  /** The main price scale. There is at most one, and it always sits right. */
  isPrimary: boolean;
  hidden: boolean;
}

export interface PriceScalePlacement {
  id: string;
  side: PriceScaleSide;
  /** Column index within its own gutter, counted outward from the plot. */
  axisIndex: number;
}

/**
 * Overlay scales beyond this many stay on the right; the rest move left.
 *
 * Two overlay axes on one side still leave the plot most of the width. The
 * third is where a single gutter starts to eat the chart, so that is where the
 * split begins -- and it only begins then: with two overlays, moving one left
 * would put a lone axis on each side for no gain.
 */
export const MAX_STACKED_SCALES_PER_SIDE = 2;

/**
 * Assign a gutter and a column to every scale, in input order.
 *
 * Hidden scales keep a placement so callers can index by id without checking
 * for absence, but they claim no column: an invisible axis must not push the
 * plot in, and un-hiding one must not renumber the columns of scales that were
 * already there.
 */
export function assignPriceScaleColumns(
  scales: readonly PriceScaleLayoutInput[],
): PriceScalePlacement[] {
  const visibleOverlayIds = scales
    .filter(scale => !scale.hidden && !scale.isPrimary)
    .map(scale => scale.id);
  const splitAcrossSides = visibleOverlayIds.length > MAX_STACKED_SCALES_PER_SIDE;

  let rightColumns = 0;
  let leftColumns = 0;

  return scales.map(scale => {
    if (scale.hidden) return { id: scale.id, side: 'right' as const, axisIndex: 0 };

    const overlayIndex = visibleOverlayIds.indexOf(scale.id);
    const side: PriceScaleSide =
      !scale.isPrimary && splitAcrossSides && overlayIndex >= MAX_STACKED_SCALES_PER_SIDE
        ? 'left'
        : 'right';

    return {
      id: scale.id,
      side,
      axisIndex: side === 'right' ? rightColumns++ : leftColumns++,
    };
  });
}

/** How many columns each gutter needs, given a set of placements. */
export function countColumnsPerSide(
  placements: readonly PriceScalePlacement[],
  hiddenIds: ReadonlySet<string> = new Set(),
): { left: number; right: number } {
  let left = 0;
  let right = 0;
  for (const placement of placements) {
    if (hiddenIds.has(placement.id)) continue;
    if (placement.side === 'left') left += 1;
    else right += 1;
  }
  return { left, right };
}
