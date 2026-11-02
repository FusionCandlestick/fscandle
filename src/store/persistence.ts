/**
 * Current persisted-state contract. Older payloads are intentionally rejected:
 * this major architecture reset does not carry compatibility code forward.
 */

import type { PriceScaleMode } from '../engine/CoordinateTransformer';
import type { Overlay } from '../engine/OverlayManager';
import { sanitizeOverlays } from '../model/overlayValidation';

export const PERSISTED_STATE_VERSION = 4;

/** A drawing layer as stored: complete, with its overlays. */
export interface StoredDrawingLayer {
  id: string;
  name: string;
  overlays: Overlay[];
  createdAt: number;
  updatedAt: number;
}

export interface PersistedChartState {
  version: number;
  options?: Record<string, unknown>;
  drawingLayers?: StoredDrawingLayer[];
  activeDrawingLayerId?: string;
  paneWeights?: number[];
  viewport?: { offset?: number; barSpacing?: number; yScale?: number; yOffset?: number };
  priceScaleMode?: PriceScaleMode;
  invertScale?: boolean;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
/** Parse only the current contract. Any prior or future version is rejected. */
export function parsePersistedState(raw: string | null): PersistedChartState | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed) || parsed.version !== PERSISTED_STATE_VERSION) return null;
    return parsed as unknown as PersistedChartState;
  } catch {
    return null;
  }
}

/**
 * Coerce stored drawing layers into complete ones. Layers without an
 * `overlays` array are dropped; missing ids, names and timestamps are filled in.
 * Each overlay is validated, and ones that could not be drawn are dropped and
 * counted through `onRejected`. `now` is the fallback timestamp, passed in so
 * the result is deterministic.
 */
export function normalizeDrawingLayers(
  layers: Array<Partial<StoredDrawingLayer>>,
  now: number = Date.now(),
  onRejected?: (count: number) => void,
): StoredDrawingLayer[] {
  let rejected = 0;
  const normalized = layers
    .filter(layer => Array.isArray(layer.overlays))
    .map((layer, index) => {
      const { overlays, rejected: dropped } = sanitizeOverlays(layer.overlays);
      rejected += dropped;
      return {
        id: typeof layer.id === 'string' && layer.id ? layer.id : `layer_${now}_${index}`,
        name: typeof layer.name === 'string' && layer.name ? layer.name : `Layer ${index + 1}`,
        overlays,
        createdAt: typeof layer.createdAt === 'number' ? layer.createdAt : now,
        updatedAt: typeof layer.updatedAt === 'number' ? layer.updatedAt : now,
      };
    });
  if (rejected > 0) onRejected?.(rejected);
  return normalized;
}
