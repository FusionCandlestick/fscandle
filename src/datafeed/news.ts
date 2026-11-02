import type { KLineData } from '../types';
import type { SymbolContextEvent, SymbolContextEventCategory } from './types';

/** Event categories, in display order. */
export const SYMBOL_CONTEXT_CATEGORIES: readonly SymbolContextEventCategory[] = ['earnings', 'macro', 'filing', 'research', 'note'];

export const SYMBOL_CONTEXT_CATEGORY_OPTIONS = ['all', ...SYMBOL_CONTEXT_CATEGORIES] as const;

export type SymbolContextCategoryOption = typeof SYMBOL_CONTEXT_CATEGORY_OPTIONS[number];

/**
 * Put events from any symbol-context feed onto the candles they belong to, as
 * the per-bar `marker` the candlestick series draws. One marker per bar: the
 * first event for a timestamp wins.
 */
export function mergeSymbolContextEventMarkers(candles: KLineData[], events: SymbolContextEvent[]): KLineData[] {
  if (candles.length === 0 || events.length === 0) {
    return candles;
  }

  const markersByTimestamp = new Map<number, SymbolContextEvent>();
  events.forEach((event) => {
    if (!markersByTimestamp.has(event.timestamp)) {
      markersByTimestamp.set(event.timestamp, event);
    }
  });

  return candles.map((candle) => {
    const event = markersByTimestamp.get(candle.timestamp);
    if (!event) {
      return candle;
    }

    const markerText = event.category === 'earnings'
      ? 'E'
      : event.category === 'macro'
        ? 'M'
        : event.category === 'filing'
          ? 'F'
          : event.category === 'research'
            ? 'R'
            : 'N';

    return {
      ...candle,
      marker: {
        text: markerText,
        color: event.visual.accent,
        position: event.priceReaction.direction === 'down' ? 'top' : 'bottom',
      },
    };
  });
}
