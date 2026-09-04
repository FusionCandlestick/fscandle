/**
 * Current persisted-state contract. Older payloads are intentionally rejected:
 * this major architecture reset does not carry compatibility code forward.
 */

import type { PriceScaleMode } from '../engine/CoordinateTransformer';

export const PERSISTED_STATE_VERSION = 4;

interface PersistedDrawingLayer {
  id: string;
  name: string;
  overlays: unknown[];
  createdAt: number;
  updatedAt: number;
}

export interface PersistedChartState {
  version: number;
  options?: Record<string, unknown>;
  drawingLayers?: PersistedDrawingLayer[];
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
