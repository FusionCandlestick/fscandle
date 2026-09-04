/**
 * Merging and copying option trees, without a hand-written mirror of the schema.
 *
 * `mergeChartOptions` used to spell out every nested group by hand — `layout`,
 * `layout.background`, `grid`, `grid.vertLines`, and so on. That is a second
 * copy of the schema, kept in sync by memory: an option family added to
 * `ChartOptions` without a matching branch here is *shallow* merged, so setting
 * one field of it silently deletes its siblings. Nothing fails; the chart just
 * loses settings the caller never mentioned.
 *
 * These two functions work off the shape of the values instead. Plain objects
 * are merged (or copied) recursively; everything else is a leaf and is replaced
 * (or shared) whole.
 *
 * "Everything else" deliberately includes:
 *
 * - **functions** — `priceFormatter` and `timeFormatter` are options whose value
 *   is a callback, and a callback is never merged or cloned, only carried;
 * - **class instances and arrays** — merging a `Date`, a `Map`, or an array
 *   field-by-field produces something that is neither the old value nor the new
 *   one;
 * - **`ATOMIC_OPTION_KEYS`** — options typed as `string | object`, where the
 *   two forms are alternatives rather than layers. `timeScale.period` is
 *   `'15m'` or a `Period`; deep-merging a `Period` over a previous `Period`
 *   would mix two intervals into a third that was never asked for, and merging
 *   over a string would produce an object with the string's own keys attached.
 */

/**
 * Options replaced wholesale rather than merged, because a partial one is not a
 * meaningful value. Keyed by field name: these names are unique in the tree.
 */
const ATOMIC_OPTION_KEYS: ReadonlySet<string> = new Set(['period', 'session']);

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

/**
 * Deep-merge `overrides` onto `base`, returning a new tree.
 *
 * `undefined` in the overrides means "not mentioned" and leaves the base value
 * alone, which is what `DeepPartial` produces for an omitted field. An explicit
 * `null` is a value and replaces.
 */
export function mergeOptionTree<T>(base: T, overrides: unknown): T {
  if (overrides === undefined) return base;
  if (!isPlainObject(base) || !isPlainObject(overrides)) return overrides as T;

  const merged: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) continue;
    const current = merged[key];
    merged[key] =
      ATOMIC_OPTION_KEYS.has(key) || !isPlainObject(current) || !isPlainObject(value)
        ? value
        : mergeOptionTree(current, value);
  }
  return merged as T;
}

/**
 * Deep-copy an option tree, sharing leaves.
 *
 * Used to hand options out of the chart. Returning the live object under a
 * `Readonly<T>` was not protection: `Readonly` is shallow, so
 * `chart.getOptions().grid.vertLines.visible = false` type-checked, mutated the
 * chart's own state, and skipped every invalidation that a real option change
 * goes through — leaving the chart drawing from settings its render pass had
 * already read.
 *
 * Functions and class instances are shared rather than copied: a formatter is
 * carried, not duplicated. `structuredClone` is not usable here for exactly
 * that reason — it throws on a function-valued option.
 */
export function cloneOptionTree<T>(value: T): T {
  if (Array.isArray(value)) return value.map(item => cloneOptionTree(item)) as unknown as T;
  if (!isPlainObject(value)) return value;

  const copy: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    copy[key] = ATOMIC_OPTION_KEYS.has(key) ? item : cloneOptionTree(item);
  }
  return copy as T;
}
