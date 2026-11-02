/**
 * Safe interpolation into the HTML the GUI widgets build as strings.
 *
 * Labels, ids and colours can come from drawings a user imported or from
 * persisted state, so none of them may be written into markup unescaped.
 */

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Escape a value for use as element text or inside a quoted attribute. */
export function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, char => HTML_ESCAPES[char]);
}

// A hex colour, a CSS colour function with numeric arguments, or a bare keyword.
// Nothing else is accepted, so a colour can never close its declaration or attribute.
const SAFE_COLOR = /^(#[0-9a-f]{3,8}|(rgb|rgba|hsl|hsla)\(\s*[-0-9.%,\s/]+\)|[a-z]+)$/i;

/** `value` if it is a plain CSS colour, otherwise `fallback`. */
export function safeCssColor(value: unknown, fallback: string): string {
  return typeof value === 'string' && SAFE_COLOR.test(value.trim()) ? value.trim() : fallback;
}
