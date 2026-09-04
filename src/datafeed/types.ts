import { KLineData } from '../types';

export type KLineInterval =
  | '1m'
  | '3m'
  | '5m'
  | '15m'
  | '30m'
  | '1h'
  | '2h'
  | '4h'
  | '1d'
  | '1w'
  | string;

export interface MarketDataRequest {
  symbol: string;
  interval: KLineInterval;
  from?: number;
  to?: number;
  limit?: number;
}

export interface MarketDataSubscription extends MarketDataRequest {
  onUpdate: (bar: KLineData) => void;
  onError?: (error: Error) => void;
  onStatusChange?: (status: MarketDataStatus) => void;
}

export type MarketDataStatus = 'idle' | 'loading' | 'streaming' | 'reconnecting' | 'closed' | 'error';

export interface MarketDataFeed {
  getHistory(request: MarketDataRequest): Promise<KLineData[]>;
  subscribe?(subscription: MarketDataSubscription): () => void;
  destroy?(): void;
}

export type SymbolContextEventCategory = 'earnings' | 'macro' | 'filing' | 'research' | 'note';
export type SymbolContextEventSentiment = 'positive' | 'neutral' | 'negative';
export type SymbolContextEventImportance = 'high' | 'medium' | 'low';

export interface SymbolContextEvent {
  id: string;
  symbol: string;
  timestamp: number;
  logicalIndex?: number;
  title: string;
  summary: string;
  note: string;
  category: SymbolContextEventCategory;
  source: string;
  importance: SymbolContextEventImportance;
  sentiment: SymbolContextEventSentiment;
  relatedSymbols: string[];
  visual: {
    eyebrow: string;
    caption: string;
    accent: string;
  };
  priceReaction: {
    percent: number;
    direction: 'up' | 'down' | 'flat';
  };
}

export interface SymbolContextFeedRequest {
  symbol: string;
  interval?: KLineInterval;
  watchlist?: string[];
  limit?: number;
  from?: number;
  to?: number;
  candles?: KLineData[];
}

export interface SymbolContextFeed {
  getEvents(request: SymbolContextFeedRequest): Promise<SymbolContextEvent[]>;
}

export type RawKLineTuple =
  | [string | number, string | number, string | number, string | number, string | number]
  | [string | number, string | number, string | number, string | number, string | number, string | number];

export type RawKLineInput =
  | KLineData
  | {
      time?: string | number | Date;
      timestamp?: string | number | Date;
      open: string | number;
      high: string | number;
      low: string | number;
      close: string | number;
      volume?: string | number;
      turnover?: string | number;
    }
  | RawKLineTuple;
