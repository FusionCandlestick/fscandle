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
  const disposers = new Set<() => void>();
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
      let inFlight = false;
      const run = async () => {
        // One request at a time: a slow response must not be overtaken by the
        // next poll, and polls must not pile up behind it.
        if (isDisposed || inFlight) return;
        inFlight = true;
        try {
          subscription.onStatusChange?.('loading');
          const data = await load(subscription);
          // The caller may have unsubscribed while the request was in flight.
          // Delivering then would push bars into a chart that let go of this feed.
          if (isDisposed) return;
          data.forEach(bar => {
            if (bar.timestamp >= lastTimestamp) {
              subscription.onUpdate(bar);
              lastTimestamp = bar.timestamp;
            }
          });
          subscription.onStatusChange?.('streaming');
        } catch (error) {
          if (isDisposed) return;
          subscription.onStatusChange?.('error');
          subscription.onError?.(error instanceof Error ? error : new Error(String(error)));
        } finally {
          inFlight = false;
        }
      };

      void run();
      const timer = window.setInterval(() => void run(), options.pollIntervalMs ?? 10_000);

      const dispose = () => {
        if (isDisposed) return;
        isDisposed = true;
        window.clearInterval(timer);
        disposers.delete(dispose);
        subscription.onStatusChange?.('closed');
      };
      disposers.add(dispose);
      return dispose;
    },

    destroy() {
      [...disposers].forEach(dispose => dispose());
    },
  };
}

export interface WebSocketReconnectOptions {
  /** Delay before the first retry, in milliseconds. Default 1000. */
  initialDelayMs?: number;
  /** Upper bound for the delay between retries. Default 30000. */
  maxDelayMs?: number;
  /** Retries before giving up and reporting `closed`. Default: no limit. */
  maxAttempts?: number;
}

export interface WebSocketDataFeedOptions {
  url: string | ((request: MarketDataRequest) => string);
  subscribeMessage?: (request: MarketDataRequest) => unknown;
  parseMessage: (payload: unknown) => RawKLineInput | RawKLineInput[] | null;
  /**
   * Reconnect after an unexpected close, with exponential backoff. The status
   * reads `reconnecting` while waiting. Pass `false` to report `closed` instead.
   */
  reconnect?: false | WebSocketReconnectOptions;
}

export function createWebSocketDataFeed(options: WebSocketDataFeedOptions): MarketDataFeed {
  const reconnect = options.reconnect === false
    ? null
    : { initialDelayMs: 1000, maxDelayMs: 30_000, maxAttempts: Number.POSITIVE_INFINITY, ...options.reconnect };
  /** Stops every live subscription, without reporting its status. */
  const halts = new Set<() => void>();

  return {
    async getHistory() {
      return [];
    },

    subscribe(subscription: MarketDataSubscription) {
      let socket: WebSocket | null = null;
      let retryTimer: ReturnType<typeof setTimeout> | null = null;
      let attempts = 0;
      let stopped = false;

      const stop = () => {
        stopped = true;
        halts.delete(halt);
        if (retryTimer !== null) clearTimeout(retryTimer);
        retryTimer = null;
        // Clear the reference first, so the close event this causes is ignored.
        const current = socket;
        socket = null;
        current?.close();
      };

      const halt = () => {
        if (!stopped) stop();
      };

      const scheduleRetry = () => {
        if (!reconnect || attempts >= reconnect.maxAttempts) {
          if (reconnect) {
            subscription.onError?.(new Error(`Market data websocket gave up after ${attempts} reconnect attempts`));
          }
          stop();
          subscription.onStatusChange?.('closed');
          return;
        }
        const delay = Math.min(reconnect.maxDelayMs, reconnect.initialDelayMs * 2 ** attempts);
        attempts += 1;
        subscription.onStatusChange?.('reconnecting');
        retryTimer = setTimeout(() => {
          retryTimer = null;
          if (!stopped) connect();
        }, delay);
      };

      const connect = () => {
        const url = typeof options.url === 'function' ? options.url(subscription) : options.url;
        const ws = new WebSocket(url);
        socket = ws;

        ws.addEventListener('open', () => {
          if (stopped || socket !== ws) return;
          attempts = 0;
          subscription.onStatusChange?.('streaming');
          const message = options.subscribeMessage?.(subscription);
          if (message !== undefined) ws.send(JSON.stringify(message));
        });

        ws.addEventListener('message', event => {
          // Messages can still arrive between close() and the socket closing.
          if (stopped || socket !== ws) return;
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

        ws.addEventListener('close', () => {
          // A close we asked for leaves socket already cleared.
          if (stopped || socket !== ws) return;
          socket = null;
          scheduleRetry();
        });

        ws.addEventListener('error', () => {
          if (stopped || socket !== ws) return;
          subscription.onStatusChange?.('error');
          subscription.onError?.(new Error('Market data websocket error'));
        });
      };

      const dispose = () => {
        if (stopped) return;
        stop();
        subscription.onStatusChange?.('closed');
      };

      halts.add(halt);
      connect();
      return dispose;
    },

    destroy() {
      [...halts].forEach(halt => halt());
      halts.clear();
    },
  };
}
