/**
 * The vertical range an indicator pane scales to.
 *
 * It covers the bars on screen, so zooming into a quiet stretch is not flattened
 * by a spike from years earlier. When no indicator has a finite value there yet,
 * the configured fallback applies.
 */

export interface PriceRange {
  min: number;
  max: number;
}

/** The combined range of the indicators' extents, or `fallback` when none is finite. */
export function indicatorPaneRange(
  extents: ReadonlyArray<PriceRange | null | undefined>,
  fallback: PriceRange,
): PriceRange {
  let min = Infinity;
  let max = -Infinity;
  for (const extent of extents) {
    if (!extent) continue;
    min = Math.min(min, extent.min);
    max = Math.max(max, extent.max);
  }
  if (min === Infinity) return { min: fallback.min, max: fallback.max };
  return { min, max };
}
