import type { KLineData } from '../types';
import type { CoordinateTransformer } from './CoordinateTransformer';

/** A pointer this close, in pixels, to an OHLC value snaps to it. */
export const MAGNET_SNAP_PX = 12;

export interface MagnetSnap {
  index: number;
  time: number;
  price: number;
}

export type MagnetTransformer = Pick<CoordinateTransformer, 'getBarSpacing' | 'indexToX' | 'priceToY'>;

/**
 * The OHLC value nearest the pointer among the bars around `index`, if one lies
 * within `MAGNET_SNAP_PX`. Returns null otherwise, so the caller keeps the
 * pointer's own price.
 *
 * The search used to start from an infinite distance, so the nearest value
 * always won however far it was: a click in empty space was pulled to a bar
 * many units away.
 */
export function findMagnetSnap(
  transformer: MagnetTransformer,
  pointer: { x: number; y: number },
  index: number,
  barAt: (index: number) => KLineData | null | undefined,
  count: number,
): MagnetSnap | null {
  const barSpacing = Math.max(transformer.getBarSpacing(), 1);
  const neighborRadius = Math.max(1, Math.ceil(MAGNET_SNAP_PX / barSpacing));
  let best: (MagnetSnap & { distanceSq: number }) | null = null;

  for (let candidateIndex = Math.max(0, index - neighborRadius); candidateIndex <= Math.min(count - 1, index + neighborRadius); candidateIndex++) {
    const candidate = barAt(candidateIndex);
    if (!candidate) continue;

    const candidateX = transformer.indexToX(candidateIndex);
    const ohlcValues = [candidate.open, candidate.high, candidate.low, candidate.close];

    for (const candidatePrice of ohlcValues) {
      const dx = candidateX - pointer.x;
      const dy = transformer.priceToY(candidatePrice) - pointer.y;
      const distanceSq = dx * dx + dy * dy;
      if (!best || distanceSq < best.distanceSq) {
        best = { index: candidateIndex, time: candidate.timestamp, price: candidatePrice, distanceSq };
      }
    }
  }

  if (!best || best.distanceSq > MAGNET_SNAP_PX * MAGNET_SNAP_PX) return null;
  return { index: best.index, time: best.time, price: best.price };
}
