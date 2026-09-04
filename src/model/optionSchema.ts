/** Current option-schema validation. No retired paths or migration aliases. */
const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

/** Return every input path that the current default option tree does not define. */
export function findUnknownOptionPaths(defaults: unknown, overrides: unknown, prefix = ''): string[] {
  if (!isPlainObject(defaults) || !isPlainObject(overrides)) return [];
  const unknown: string[] = [];
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) continue;
    const path = prefix ? `${prefix}.${key}` : key;
    if (!(key in defaults)) {
      unknown.push(path);
      continue;
    }
    unknown.push(...findUnknownOptionPaths(defaults[key], value, path));
  }
  return unknown;
}
