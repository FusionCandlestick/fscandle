/**
 * Structural validation for overlays that arrive as data: imported drawing
 * files and restored persisted state.
 *
 * Both are untrusted. An overlay missing its points used to throw on every
 * frame, and because the chart saves its state back, it threw again on every
 * later load. Anything that would not render is rejected here instead.
 */

import type { Overlay, OverlayPoint } from '../engine/overlayTypes';

const DEFAULT_COLOR = '#2962FF';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

function sanitizePoint(raw: unknown): OverlayPoint | null {
  if (!isRecord(raw) || !isFiniteNumber(raw.timestamp) || !isFiniteNumber(raw.value)) return null;
  return { timestamp: raw.timestamp, value: raw.value };
}

const DROPPED_KEYS: ReadonlySet<string> = new Set(['_imageCache', '__proto__', 'constructor', 'prototype']);

/** Optional fields and the check each must pass to be kept. */
const OPTIONAL_FIELDS: Record<string, (value: unknown) => boolean> = {
  text: value => typeof value === 'string',
  groupId: value => typeof value === 'string',
  backgroundColor: value => typeof value === 'string',
  locked: value => typeof value === 'boolean',
  visible: value => typeof value === 'boolean',
  zLevel: isFiniteNumber,
  opacity: isFiniteNumber,
  backgroundOpacity: isFiniteNumber,
  currentStep: isFiniteNumber,
  line: isRecord,
  channel: isRecord,
  annotation: isRecord,
  wave: isRecord,
  // Image annotations the chart creates store their picture as a data URL.
  // Anything else would make the chart fetch an arbitrary address on load.
  imageUrl: value => typeof value === 'string' && /^data:image\//i.test(value),
};

/**
 * The overlay, cleaned, or null when it cannot be drawn.
 *
 * Required: a non-empty string `id` and `type`, and at least one point with a
 * finite `timestamp` and `value`. A missing colour or line width gets a default.
 * Unknown types are kept, because their template may be registered later, and
 * so are fields the chart does not know. Known optional fields of the wrong
 * type are dropped. Functions and the image cache never come from data.
 */
export function sanitizeOverlay(raw: unknown): Overlay | null {
  if (!isRecord(raw)) return null;
  if (typeof raw.id !== 'string' || raw.id === '') return null;
  if (typeof raw.type !== 'string' || raw.type === '') return null;
  if (!Array.isArray(raw.points) || raw.points.length === 0) return null;

  const points = raw.points.map(sanitizePoint);
  if (points.some(point => point === null)) return null;

  // Plain fields pass through, so custom templates keep their own data. Only
  // functions, the image cache and prototype keys are never taken from data.
  const overlay: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === 'function' || DROPPED_KEYS.has(key)) continue;
    overlay[key] = value;
  }
  overlay.id = raw.id;
  overlay.type = raw.type;
  overlay.points = points;
  overlay.color = typeof raw.color === 'string' ? raw.color : DEFAULT_COLOR;
  overlay.lineWidth = isFiniteNumber(raw.lineWidth) && raw.lineWidth > 0 ? raw.lineWidth : 1;
  for (const [key, isValid] of Object.entries(OPTIONAL_FIELDS)) {
    if (key in overlay && !isValid(overlay[key])) delete overlay[key];
  }
  return overlay as unknown as Overlay;
}

export interface SanitizedOverlays {
  overlays: Overlay[];
  /** How many entries were dropped because they could not be drawn. */
  rejected: number;
}

/** Every overlay that can be drawn, and a count of the ones that could not. */
export function sanitizeOverlays(raw: unknown): SanitizedOverlays {
  if (!Array.isArray(raw)) return { overlays: [], rejected: 0 };
  const overlays: Overlay[] = [];
  let rejected = 0;
  for (const item of raw) {
    const overlay = sanitizeOverlay(item);
    if (overlay) overlays.push(overlay);
    else rejected += 1;
  }
  return { overlays, rejected };
}
