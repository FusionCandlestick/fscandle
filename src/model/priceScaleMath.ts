/**
 * Pure price-scale geometry.
 *
 * These functions decide what price range a pane shows given its base range,
 * pixel height, zoom, and pan offset — and how far the user is allowed to zoom
 * or pan before the view is clamped. They deliberately take plain numbers so
 * the rules are testable without a canvas, a DOM, or a chart instance.
 *
 * The vertical layout they assume matches `CoordinateTransformer`: the base
 * range maps linearly to the middle `1 - 2 * VERTICAL_PADDING_RATIO` of the
 * pane, with `VERTICAL_PADDING_RATIO` reserved at each end. That constant is
 * exported and consumed by `CoordinateTransformer` so the two cannot drift.
 */

export interface PriceScaleState {
  yScale: number;
  yOffset: number;
}

export interface PriceScaleConstraints {
  /** Lowest price the viewport may ever reach. */
  hardMin: number;
  /** Highest price the viewport may ever reach. */
  hardMax: number;
  /** Widest price span the viewport may show (i.e. the zoom-out limit). */
  maxVisibleRange: number;
}

export interface ViewportPriceBounds {
  min: number;
  max: number;
  range: number;
  center: number;
}

/** Fraction of the pane height reserved as padding at each end. */
export const VERTICAL_PADDING_RATIO = 0.05;
const MIN_SCALE = 1e-6;
const MIN_RANGE = 1e-6;

/** Widen a bare min/max by 5% so bars never touch the pane edges. */
export function getPaddedPriceRange(min: number, max: number): { min: number; max: number } {
  // Guard the degenerate flat-series case, where max - min is 0.
  const rawRange = Math.max(max - min, Math.max(Math.abs(max), Math.abs(min), 1) * 0.01);
  const padding = rawRange * VERTICAL_PADDING_RATIO;
  return { min: min - padding, max: max + padding };
}

/**
 * The price range actually visible after zoom (`scale`) and pan (`offset`)
 * are applied to a base range.
 */
export function getViewportPriceBounds(
  baseMin: number,
  baseMax: number,
  height: number,
  scale: number,
  offset: number,
): ViewportPriceBounds {
  const safeHeight = Math.max(height, 1);
  const safeScale = Math.max(scale, MIN_SCALE);
  const baseRange = Math.max(baseMax - baseMin, MIN_RANGE);
  const padding = safeHeight * VERTICAL_PADDING_RATIO;
  const usableHeight = Math.max(safeHeight - padding * 2, MIN_RANGE);
  const center = safeHeight / 2;

  const yToPrice = (y: number) => {
    const unscaledY = (y - offset - center) / safeScale + center;
    return (1 - (unscaledY - padding) / usableHeight) * baseRange + baseMin;
  };

  const topPrice = yToPrice(0);
  const bottomPrice = yToPrice(safeHeight);

  return {
    min: Math.min(topPrice, bottomPrice),
    max: Math.max(topPrice, bottomPrice),
    range: Math.abs(topPrice - bottomPrice),
    center: (topPrice + bottomPrice) / 2,
  };
}

/**
 * Inverse of {@link getViewportPriceBounds}: the pixel offset needed to put
 * `targetCenter` at the middle of the viewport.
 */
export function getYOffsetForViewportCenter(
  baseMin: number,
  baseMax: number,
  height: number,
  scale: number,
  targetCenter: number,
): number {
  const safeScale = Math.max(scale, MIN_SCALE);
  const baseRange = Math.max(baseMax - baseMin, MIN_RANGE);
  const usableHeight = Math.max(height * (1 - VERTICAL_PADDING_RATIO * 2), MIN_RANGE);
  const baseCenter = (baseMin + baseMax) / 2;

  return ((targetCenter - baseCenter) * safeScale * usableHeight) / baseRange;
}

/**
 * Clamp a zoom/pan state into the allowed envelope, mutating `state` in place.
 * Returns whether anything actually changed, so callers can skip a redraw.
 */
export function clampPriceScaleState(
  baseMin: number,
  baseMax: number,
  height: number,
  constraints: PriceScaleConstraints,
  state: PriceScaleState,
): boolean {
  const previousScale = state.yScale;
  const previousOffset = state.yOffset;

  // At scale 1 the viewport spans exactly the base range, so the zoom-out
  // limit converts directly into a minimum scale.
  const unitViewport = getViewportPriceBounds(baseMin, baseMax, height, 1, 0);
  const minScale = Math.max(0.01, unitViewport.range / constraints.maxVisibleRange);
  const maxScale = Math.max(10, minScale);

  state.yScale = Math.min(maxScale, Math.max(minScale, state.yScale));

  const viewport = getViewportPriceBounds(baseMin, baseMax, height, state.yScale, state.yOffset);
  const halfRange = viewport.range / 2;
  const minCenter = constraints.hardMin + halfRange;
  const maxCenter = constraints.hardMax - halfRange;

  // When the viewport is wider than the allowed band there is no valid center
  // to clamp to, so sit in the middle of the band instead.
  const clampedCenter =
    minCenter <= maxCenter
      ? Math.min(maxCenter, Math.max(minCenter, viewport.center))
      : (constraints.hardMin + constraints.hardMax) / 2;

  state.yOffset = getYOffsetForViewportCenter(
    baseMin,
    baseMax,
    height,
    state.yScale,
    clampedCenter,
  );

  return previousScale !== state.yScale || previousOffset !== state.yOffset;
}

/**
 * Smallest bar spacing that still leaves the series readable: never below
 * 3px, and never so small that the whole dataset shrinks past 60% of the
 * chart width.
 */
export function getMinimumBarSpacing(dataCount: number, chartWidth: number): number {
  if (dataCount <= 0 || chartWidth <= 0) return 3;
  return Math.max(3, (chartWidth * 0.6) / dataCount);
}

export const MAX_BAR_SPACING = 100;

/** Clamp bar spacing into the legal zoom range. */
export function clampBarSpacing(
  barSpacing: number,
  dataCount: number,
  chartWidth: number,
): number {
  return Math.max(
    getMinimumBarSpacing(dataCount, chartWidth),
    Math.min(MAX_BAR_SPACING, barSpacing),
  );
}
