/**
 * How a price label is written. Shared by the axis ticks and every crosshair /
 * tooltip / extreme / price-line readout, so they never disagree.
 *
 * - 6+ integer digits (`>= 100000`), or any price `>= 1000` whose tick step is
 *   a whole number: no fractional part, so a round axis reads cleanly
 *   (80,000 / 90,000 / 100,000, not 90,000.00 next to 100,000).
 * - Below `0.01`: scientific notation to 4 significant figures (e.g. `1.234E-5`),
 *   so a micro-cap value stays legible instead of collapsing to `0.00`.
 * - Otherwise: at least 2 fraction digits, or the tick step's own precision if
 *   it is finer.
 *
 * Returns options for `Number.prototype.toLocaleString`.
 */
export function priceFormatOptions(price: number, step?: number): Intl.NumberFormatOptions {
  const abs = Math.abs(price);
  const stepPrecision = step === undefined || !Number.isFinite(step) ? 0 : fractionDigitsOf(step);

  if (abs >= 100_000 || (stepPrecision === 0 && abs >= 1_000)) {
    return { minimumFractionDigits: 0, maximumFractionDigits: 0 };
  }

  if (abs > 0 && abs < 0.01) {
    return { notation: 'scientific', maximumSignificantDigits: 4 };
  }

  const digits = Math.max(2, stepPrecision);
  return { minimumFractionDigits: digits, maximumFractionDigits: digits };
}

/** Digits after the decimal point of a plain or `1e-7`-style number literal. */
function fractionDigitsOf(n: number): number {
  const s = n.toString();
  const dot = s.indexOf('.');
  if (dot !== -1) return s.length - dot - 1;
  const exp = s.indexOf('e-');
  if (exp !== -1) return Number(s.slice(exp + 2)) || 0;
  return 0;
}
