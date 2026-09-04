/**
 * Which slice of the data is actually on screen.
 *
 * Every series renderer iterated the whole array and let the canvas clip
 * whatever fell outside: at 50,000 bars with roughly 150 visible, that is 300
 * times the coordinate arithmetic the frame needed, on every frame of every pan.
 * The measured cost was a 60-step drag spending 310ms of script time against
 * 53ms for KLineCharts.
 *
 * The transformer already knows the mapping, so the range is two `xToIndex`
 * calls and a clamp. It lives here, and not in each series, because nine
 * renderers needed the same three lines and the padding has to agree between
 * them -- a series that culls one bar tighter than its neighbour shows a gap at
 * the edge of the viewport while its neighbour does not.
 */

export interface IndexRange {
  /** First index to draw, inclusive. */
  start: number;
  /** Last index to draw, inclusive. */
  end: number;
}

/**
 * Indices visible in a viewport of `width`, padded by `padding` bars.
 *
 * The padding is not cosmetic. A candle is drawn centred on its index and a
 * line segment reaches back to the previous point, so the bar just outside the
 * viewport still paints pixels inside it. Two bars of slack covers both without
 * anyone having to reason about wick widths.
 *
 * Returns an empty range (`start > end`) when nothing is visible, which is what
 * a caller loops zero times over.
 */
export function visibleIndexRange(
  xToIndex: (x: number) => number,
  width: number,
  dataLength: number,
  padding = 2,
): IndexRange {
  if (dataLength === 0) return { start: 0, end: -1 };

  const first = Math.floor(xToIndex(0)) - padding;
  const last = Math.ceil(xToIndex(width)) + padding;

  return {
    start: Math.max(0, Math.min(first, dataLength - 1)),
    end: Math.min(dataLength - 1, Math.max(last, 0)),
  };
}
