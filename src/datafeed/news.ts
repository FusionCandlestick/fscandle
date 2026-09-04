import type { KLineData } from '../types';
import type {
  SymbolContextEvent,
  SymbolContextEventCategory,
  SymbolContextFeed,
  SymbolContextFeedRequest,
} from './types';

const CATEGORY_ACCENTS: Record<SymbolContextEventCategory, string> = {
  earnings: '#f97316',
  macro: '#0ea5e9',
  filing: '#8b5cf6',
  research: '#22c55e',
  note: '#f59e0b',
};

const CATEGORY_EYEBROWS: Record<SymbolContextEventCategory, string> = {
  earnings: 'Earnings read-through',
  macro: 'Macro catalyst',
  filing: 'Regulatory filing',
  research: 'Sell-side note',
  note: 'Desk note',
};

const CATEGORY_SOURCES: Record<SymbolContextEventCategory, string> = {
  earnings: 'Fusion Wire',
  macro: 'Macro Desk',
  filing: 'SEC Stream',
  research: 'Street Consensus',
  note: 'Trader Notes',
};

const CATEGORY_SEQUENCE: SymbolContextEventCategory[] = ['earnings', 'macro', 'filing', 'research', 'note'];
const EVENT_FRACTIONS = [0.14, 0.24, 0.37, 0.51, 0.63, 0.76, 0.88];

const symbolSeed = (symbol: string) =>
  symbol.split('').reduce((seed, char) => seed + char.charCodeAt(0), 0);

const describeReaction = (percent: number) => {
  if (percent > 0.18) {
    return {
      sentiment: 'positive' as const,
      direction: 'up' as const,
      verb: 'buyers defended the move',
    };
  }

  if (percent < -0.18) {
    return {
      sentiment: 'negative' as const,
      direction: 'down' as const,
      verb: 'sellers pressed the breakdown',
    };
  }

  return {
    sentiment: 'neutral' as const,
    direction: 'flat' as const,
    verb: 'the tape stayed balanced',
  };
};

const pickImportance = (index: number) => {
  if (index === 0 || index === 3) {
    return 'high' as const;
  }
  if (index % 2 === 0) {
    return 'medium' as const;
  }
  return 'low' as const;
};

const buildTitle = (symbol: string, category: SymbolContextEventCategory, relatedSymbol: string | null, percent: number) => {
  const magnitude = Math.abs(percent).toFixed(1);
  switch (category) {
    case 'earnings':
      return `${symbol} reprices after earnings read-through${relatedSymbol ? ` from ${relatedSymbol}` : ''}`;
    case 'macro':
      return `${symbol} reacts as macro tape shifts ${magnitude}% around the open`;
    case 'filing':
      return `${symbol} filing flow resets near-term positioning`;
    case 'research':
      return `${symbol} gets a fresh desk framework${relatedSymbol ? ` with ${relatedSymbol}` : ''}`;
    case 'note':
      return `${symbol} note-worthy level forms around the latest impulse`;
    default:
      return `${symbol} event update`;
  }
};

const buildSummary = (symbol: string, category: SymbolContextEventCategory, relatedSymbol: string | null, reactionVerb: string) => {
  switch (category) {
    case 'earnings':
      return relatedSymbol
        ? `${relatedSymbol} reset expectations and ${reactionVerb} in ${symbol} as correlation desks repriced the group.`
        : `${reactionVerb} in ${symbol} as the market digested the latest earnings tone and forward guidance.`;
    case 'macro':
      return `${reactionVerb} while rates, index futures, and liquidity cues moved together around ${symbol}.`;
    case 'filing':
      return `${reactionVerb} after filing language shifted the near-term narrative for ${symbol}.`;
    case 'research':
      return relatedSymbol
        ? `${reactionVerb} after a research desk framed ${symbol} versus ${relatedSymbol} on the same trade idea.`
        : `${reactionVerb} after a research desk refreshed the core setup and risk markers.`;
    case 'note':
      return `${reactionVerb} near a level worth preserving as a reusable chart note for ${symbol}.`;
    default:
      return `${reactionVerb} around ${symbol}.`;
  }
};

export const SYMBOL_CONTEXT_CATEGORY_OPTIONS = ['all', ...CATEGORY_SEQUENCE] as const;

export type SymbolContextCategoryOption = typeof SYMBOL_CONTEXT_CATEGORY_OPTIONS[number];

export function buildMockSymbolContextEvents(request: SymbolContextFeedRequest): SymbolContextEvent[] {
  const candles = request.candles ?? [];
  if (candles.length === 0) {
    return [];
  }

  const symbol = request.symbol.trim().toUpperCase();
  const normalizedWatchlist = [...new Set((request.watchlist ?? []).map((item) => item.trim().toUpperCase()).filter(Boolean))]
    .filter((item) => item !== symbol);
  const seed = symbolSeed(symbol);

  const events = EVENT_FRACTIONS.map((fraction, index) => {
    const category = CATEGORY_SEQUENCE[(seed + index) % CATEGORY_SEQUENCE.length];
    const candleIndex = Math.max(1, Math.min(candles.length - 1, Math.round((candles.length - 1) * fraction)));
    const candle = candles[candleIndex];
    const previous = candles[Math.max(0, candleIndex - 2)] ?? candle;
    const rawPercent = previous.close === 0 ? 0 : ((candle.close - previous.close) / previous.close) * 100;
    const relatedSymbol = normalizedWatchlist.length > 0
      ? normalizedWatchlist[(seed + index * 7) % normalizedWatchlist.length]
      : null;
    const reaction = describeReaction(rawPercent);
    const importance = pickImportance(index);

    return {
      id: `${symbol}-${category}-${candle.timestamp}`,
      symbol,
      timestamp: candle.timestamp,
      logicalIndex: candleIndex,
      title: buildTitle(symbol, category, relatedSymbol, rawPercent),
      summary: buildSummary(symbol, category, relatedSymbol, reaction.verb),
      note: `${CATEGORY_EYEBROWS[category]}: preserve this candle as a note anchor and watch whether follow-through holds above the event impulse.`,
      category,
      source: CATEGORY_SOURCES[category],
      importance,
      sentiment: reaction.sentiment,
      relatedSymbols: relatedSymbol ? [relatedSymbol] : [],
      visual: {
        eyebrow: CATEGORY_EYEBROWS[category],
        caption: `${symbol} · ${importance.toUpperCase()} context`,
        accent: CATEGORY_ACCENTS[category],
      },
      priceReaction: {
        percent: Number(rawPercent.toFixed(2)),
        direction: reaction.direction,
      },
    } satisfies SymbolContextEvent;
  })
    .filter((event) => (request.from ? event.timestamp >= request.from : true))
    .filter((event) => (request.to ? event.timestamp <= request.to : true))
    .sort((left, right) => right.timestamp - left.timestamp);

  return events.slice(0, request.limit ?? events.length);
}

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

export function createMockSymbolContextFeed(): SymbolContextFeed {
  return {
    async getEvents(request) {
      return buildMockSymbolContextEvents(request);
    },
  };
}