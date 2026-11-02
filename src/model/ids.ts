/**
 * Ids for objects the chart creates: overlays, drawing layers, stacked panes,
 * indicators.
 *
 * These used to be `Date.now()`-based, sometimes with an array length added.
 * Two overlays created in the same millisecond could share an id, and
 * removing one then removed both. A per-session counter makes ids unique
 * within a page; the random part keeps them apart from ids saved by another
 * tab or an earlier session.
 */

let sequence = 0;

function randomPart(): string {
  // randomUUID exists only in secure contexts; fall back elsewhere.
  const crypto = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (typeof crypto?.randomUUID === 'function') return crypto.randomUUID().slice(0, 8);
  return Math.random().toString(36).slice(2, 10).padEnd(8, '0');
}

/** A new id of the form `<prefix>_<time><counter>_<random>`. */
export function createId(prefix: string): string {
  sequence += 1;
  return `${prefix}_${Date.now().toString(36)}${sequence.toString(36)}_${randomPart()}`;
}
