import { KLineData } from '../types';
import { MarketDataFeed, MarketDataRequest, MarketDataSubscription, RawKLineInput } from './types';
import { normalizeKLineData, normalizeKLineDataList } from './normalizers';

function isTupleBar(value: unknown): value is Extract<RawKLineInput, unknown[]> {
  return Array.isArray(value) && value.length >= 5 && !Array.isArray(value[0]) && typeof value[1] !== 'object';
}

export interface StaticDataFeedOptions {
  data: RawKLineInput[];
}

export function createStaticDataFeed(options: StaticDataFeedOptions): MarketDataFeed {
  const data = normalizeKLineDataList(options.data);
  return {
    async getHistory(request: MarketDataRequest) {
      const from = request.from ?? Number.NEGATIVE_INFINITY;
      const to = request.to ?? Number.POSITIVE_INFINITY;
      const filtered = data.filter(item => item.timestamp >= from && item.timestamp <= to);
      return typeof request.limit === 'number' ? filtered.slice(-request.limit) : filtered;
    },
  };
}

export interface ReplayDataFeedOptions {
  data: RawKLineInput[];
  intervalMs?: number;
  loop?: boolean;
}

export function createReplayDataFeed(options: ReplayDataFeedOptions): MarketDataFeed {
  const data = normalizeKLineDataList(options.data);
  const intervalMs = options.intervalMs ?? 1000;
  const timers = new Set<number>();

  return {
    async getHistory(request: MarketDataRequest) {
      return typeof request.limit === 'number' ? data.slice(0, request.limit) : data;
    },

    subscribe(subscription: MarketDataSubscription) {
      subscription.onStatusChange?.('streaming');
      let index = 0;
      const timer = window.setInterval(() => {
        if (data.length === 0) return;
        subscription.onUpdate(data[index]);
        index += 1;
        if (index >= data.length) {
          if (options.loop) {
            index = 0;
          } else {
            window.clearInterval(timer);
            timers.delete(timer);
            subscription.onStatusChange?.('closed');
          }
        }
      }, intervalMs);
      timers.add(timer);

      return () => {
        window.clearInterval(timer);
        timers.delete(timer);
        subscription.onStatusChange?.('closed');
      };
    },

    destroy() {
      timers.forEach(timer => window.clearInterval(timer));
      timers.clear();
    },
  };
}

export interface PollingDataFeedOptions {
  endpoint: string | ((request: MarketDataRequest) => string);
  mapResponse?: (payload: unknown) => RawKLineInput[];
  fetchInit?: RequestInit;
  pollIntervalMs?: number;
}

export function createPollingDataFeed(options: PollingDataFeedOptions): MarketDataFeed {
  const timers = new Set<number>();
  const endpointFor = (request: MarketDataRequest) =>
    typeof options.endpoint === 'function' ? options.endpoint(request) : options.endpoint;

  const load = async (request: MarketDataRequest): Promise<KLineData[]> => {
    const response = await fetch(endpointFor(request), options.fetchInit);
    if (!response.ok) {
      throw new Error(`Market data request failed with ${response.status}`);
    }
    const payload = await response.json();
    const raw = options.mapResponse ? options.mapResponse(payload) : payload;
    if (!Array.isArray(raw)) {
      throw new Error('Market data response must be an array or mapped to an array');
    }
    return normalizeKLineDataList(raw as RawKLineInput[]);
  };

  return {
    getHistory: load,

    subscribe(subscription: MarketDataSubscription) {
      let lastTimestamp = 0;
      let isDisposed = false;
      const run = async () => {
        try {
          subscription.onStatusChange?.('loading');
          const data = await load(subscription);
          data.forEach(bar => {
            if (bar.timestamp >= lastTimestamp) {
              subscription.onUpdate(bar);
              lastTimestamp = bar.timestamp;
            }
          });
          subscription.onStatusChange?.('streaming');
        } catch (error) {
          subscription.onStatusChange?.('error');
          subscription.onError?.(error instanceof Error ? error : new Error(String(error)));
        }
      };

      void run();
      const timer = window.setInterval(() => {
        if (!isDisposed) void run();
      }, options.pollIntervalMs ?? 10_000);
      timers.add(timer);

      return () => {
        isDisposed = true;
        window.clearInterval(timer);
        timers.delete(timer);
        subscription.onStatusChange?.('closed');
      };
    },

    destroy() {
      timers.forEach(timer => window.clearInterval(timer));
      timers.clear();
    },
  };
}

export interface WebSocketDataFeedOptions {
  url: string | ((request: MarketDataRequest) => string);
  subscribeMessage?: (request: MarketDataRequest) => unknown;
  parseMessage: (payload: unknown) => RawKLineInput | RawKLineInput[] | null;
}

export function createWebSocketDataFeed(options: WebSocketDataFeedOptions): MarketDataFeed {
  const sockets = new Set<WebSocket>();

  return {
    async getHistory() {
      return [];
    },

    subscribe(subscription: MarketDataSubscription) {
      const url = typeof options.url === 'function' ? options.url(subscription) : options.url;
      const socket = new WebSocket(url);
      sockets.add(socket);

      socket.addEventListener('open', () => {
        subscription.onStatusChange?.('streaming');
        const message = options.subscribeMessage?.(subscription);
        if (message !== undefined) socket.send(JSON.stringify(message));
      });

      socket.addEventListener('message', event => {
        try {
          const payload = JSON.parse(event.data);
          const parsed = options.parseMessage(payload);
          const bars: RawKLineInput[] = parsed === null
            ? []
            : isTupleBar(parsed)
              ? [parsed]
              : Array.isArray(parsed)
                ? parsed
                : [parsed];
          bars.map(bar => normalizeKLineData(bar)).forEach(subscription.onUpdate);
        } catch (error) {
          subscription.onStatusChange?.('error');
          subscription.onError?.(error instanceof Error ? error : new Error(String(error)));
        }
      });

      socket.addEventListener('close', () => {
        sockets.delete(socket);
        subscription.onStatusChange?.('closed');
      });
      socket.addEventListener('error', () => {
        subscription.onStatusChange?.('error');
        subscription.onError?.(new Error('Market data websocket error'));
      });

      return () => {
        socket.close();
        sockets.delete(socket);
        subscription.onStatusChange?.('closed');
      };
    },

    destroy() {
      sockets.forEach(socket => socket.close());
      sockets.clear();
    },
  };
}
