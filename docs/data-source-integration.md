# Data Source Integration

FusionCandlestick now separates chart rendering from market-data orchestration.

The adapters in `src/datafeed/` are provider-neutral. They do not include exchange-specific signing, symbol translation, throttling, or retry policy beyond the basic browser APIs.

## Core Flow

1. Normalize exchange or broker rows into `KLineData`.
2. Load history with a `MarketDataFeed`.
3. Apply incremental bars with `chart.updateData(bar)`.

```ts
import { bindMarketDataFeed, createPollingDataFeed } from 'fscandle/datafeed';

const feed = createPollingDataFeed({
  endpoint: ({ symbol, interval, limit }) =>
    `/api/kline?symbol=${symbol}&interval=${interval}&limit=${limit ?? 500}`,
  mapResponse: payload => payload.data,
  pollIntervalMs: 5000,
});

const unsubscribe = await bindMarketDataFeed({
  chart,
  feed,
  symbol: 'BTC/USDT',
  interval: '1h',
  limit: 500,
  onStatusChange: status => console.log(status),
  onError: error => console.error(error),
});
```

Call `unsubscribe()` when the chart or symbol is disposed.

## Supported Feed Types

- `createStaticDataFeed`: deterministic history for examples, fixtures, and docs.
- `createReplayDataFeed`: plays historical bars as live updates for local demos.
- `createPollingDataFeed`: fetches REST history and repeated updates.
- `createWebSocketDataFeed`: streams bars from exchange sockets.

## Chart Update Semantics

`chart.updateData(bar)` follows the same convention as mature chart APIs:

- if `bar.timestamp` already exists, that candle is replaced
- if `bar.timestamp` is new, it is inserted in timestamp order
- indicators are recalculated after the update
- the chart follows the latest bar only when the user was already at the latest edge

Use `chart.setData(history)` for full snapshots and `chart.updateData(bar)` for ticks or candle-close updates.

## Raw Row Shapes

The normalizer accepts native `KLineData`, object rows, and tuple rows:

```ts
normalizeKLineData({
  time: '2026-01-01T00:00:00.000Z',
  open: '67000',
  high: '67200',
  low: '66850',
  close: '67120',
  volume: '120.5',
});

normalizeKLineData([1767225600000, '67000', '67200', '66850', '67120', '120.5']);
```

Numeric timestamps below `10_000_000_000` are treated as seconds; larger values are treated as milliseconds.

## Known Gaps

- No packaged Binance, Coinbase, Polygon, Alpaca, or broker-specific adapters yet.
- No built-in reconnect backoff strategy for websocket feeds.
- No server-side proxy route is included; production apps should keep exchange secrets out of the browser.
- No schema validation dependency is bundled; adapter callbacks should validate provider payloads before returning rows.
