/**
 * Canonical type-system primitives for everything the engine draws on the
 * Canvas.
 *
 * The stack is #1 "System Classic": no web font, resolves to the platform UI
 * face (San Francisco / Segoe UI / Roboto). It is byte-for-byte the string the
 * host chrome uses (`fscandle-web` `globals.css` `--font-sans`), so a price on
 * the axis and the same price in a toolbar render in one typeface.
 *
 * Sizes are the integer scale (10 / 12 / 16 / 24 / 32 / 48); the engine only
 * ever needs the small end. Weights are 400 / 500 / 600 / 800 — no 700.
 */

export const UI_FONT_FAMILY =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
