# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Live updates no longer recompute every indicator over the whole series.
  `updateData` recomputes each indicator from the first changed bar, with 700
  bars of warm-up, and checks the overlap against the previous result before
  reusing it. On 20,000 bars with MA, BOLL, MACD, RSI and KDJ, one update went
  from about 39 ms to about 1.7 ms in Chromium. OBV and VWAP are running totals
  over the whole series, so they keep a full recalculation; the result is the
  same either way.
- Redrawing after an update costs less. Price labels and the fallback time
  labels reuse their `Intl` formatters instead of building one per label, and
  indicator panes no longer redraw the shared time rulers that the main pane
  already draws. With four panes, a frame after a live update went from a
  median of about 8.5 ms to about 3.2 ms in Chromium. Label text is unchanged.

### Added

- WebSocket feeds take `idleTimeoutMs`: an open socket that sends nothing for
  that long is closed and reconnected, so a connection that stays up but stops
  delivering is not mistaken for a quiet market forever. `heartbeat` sends a
  keep-alive on an interval, and its `isReply` keeps the server's replies out
  of `parseMessage`. Both are off by default.
- `updateData` takes an array of bars. The batch is applied with one indicator
  recalculation and one redraw, and the `dataChange` event carries every bar in
  `bars`. The React component applies appended bars this way.
- `addCustomPane(options)` and `removeCustomPane(id)`: a pane whose body is
  drawn by a callback, with its own optional price range. It sits in the stack
  like an indicator pane, and primitives can target it by id. A callback that
  throws is reported once and that pane is skipped until it is re-added.

## [0.1.2] - 2026-11-02

### Added

- WebSocket feeds reconnect after an unexpected close, with exponential backoff
  (1 s, doubling, capped at 30 s). The status reads `reconnecting` while waiting.
  Tune it with `reconnect`, or pass `reconnect: false` to keep the old
  behaviour of reporting `closed`. Unsubscribing or calling `destroy()` cancels a
  pending retry.

### Fixed

- Pointer placement was offset when the top time ruler was off. The plot starts
  at the toolbar in that case, but the pointer, the hit-test regions, the
  crosshair and the inline editor assumed a ruler height above it, so a point
  landed about 22px away from the pixel that was clicked. Plot-origin maths now
  uses the top ruler's real height (`topXAxisHeight`), and the bottom ruler's
  for the bottom edge.
- Magnet snapping had no distance limit, so a point far below the lowest low
  still snapped to it. Snapping now applies only within 12px of an OHLC value;
  beyond that the pointer's price is kept.

## [0.1.1] - 2026-11-03

### Security

- Imported drawings could run script in the page. The toolbar, legend and data
  tooltip interpolated overlay ids, labels and colours into HTML unescaped, so
  an overlay id containing a quote could add an event handler to the toolbar.
  All three now escape text and attributes and accept only plain CSS colours.
- Imported drawings and saved state are validated before use. Image
  annotations are kept only when their picture is a `data:image/` URL, and
  prototype keys in saved options are ignored.

### Changed

- **Breaking:** `createMockSymbolContextFeed` and `buildMockSymbolContextEvents`
  generate invented news and are no longer exported from `fscandle` or
  `fscandle/datafeed`. Import them from the new `fscandle/mock` entry.
  `mergeSymbolContextEventMarkers` stays in `fscandle/datafeed`.
- `importOverlaysJSON` skips overlays that cannot be drawn (with a console
  warning), and throws without changing the chart when the input is not a
  drawing export or none of its overlays is usable.
- The polling data feed runs one request at a time.
- `getVisibleLogicalRange()`, and the range passed to
  `subscribeVisibleLogicalRangeChange` and the visible time range events, now
  end where the right margin begins rather than at the plot's right edge, so
  `to` is slightly smaller than before. This matches what
  `setVisibleLogicalRange()` takes.
- `FusionCandlestickChartComponent` keeps one chart instance per mount. Prop
  changes update it in place instead of destroying and rebuilding it, so
  re-rendering no longer resets the viewport or repeats setup work. Live bars
  are applied with `updateData`, and `onChartReady` runs once per mount.
- New `persistenceKey` prop. Charts on the same page warn when they share a
  persistence key.
- Caller options take precedence over saved chart state.

### Removed

- The React component no longer draws demo data by default: the five
  stacked panes (`eth`, `sol`, `nvda`, `tsla`, `aapl`) that were derived from
  the input data and the default trend line. Pass `stackedPricePanes` and
  `overlays` to show them.

### Fixed

- Volume series preserves unavailable volume in series scaling, ignoring
  non-finite, missing, or negative volumes so zero/missing volume does not
  distort autoscale.
- Indicator removal now emits an `indicatorRemoved` event (`{ paneId, indicatorId }`)
  on EventBus and chart facade, allowing UI layers to sync state reliably.
- One malformed overlay (for example, one without points) threw on every frame,
  and because state is saved back, on every later load as well. Such overlays
  are now dropped on load and import, and an overlay whose template throws is
  skipped until it changes instead of stopping the frame.
- Undo and redo dropped overlay callbacks, so after one undo, overlays lost
  `onClick`, `onPressedMoving` and the rest, and React trading lines stopped
  reporting drags.
- Overlays created in the same millisecond could share an id, and removing one
  removed both. Ids for overlays, drawing layers, stacked panes and indicators
  are now unique.
- The polling feed delivered bars from a request that finished after the caller
  unsubscribed, and then reported `streaming` after `closed`. `destroy()` now
  stops in-flight requests too. The WebSocket feed ignores messages that arrive
  after unsubscribe.
- Passing `getVisibleLogicalRange()` back to `setVisibleLogicalRange()` widened
  the range by the right margin (about 5%) on every round trip, so code syncing
  panels through the two drifted out. The pair now round-trips exactly.
- Overlays passed in `overlays` were duplicated each time the chart was rebuilt;
  they are now reconciled by `id`.
- `FusionCandlestickChartComponent` trading lines (`tradingLines`) were never
  drawn or draggable: they used an overlay type (`price_line`) that no template
  registered. They are now a dedicated `trading_line` overlay: a full-width
  horizontal line with a price tag (`label` is shown), draggable through
  `onTradingLineDrag` unless `draggable: false`, which locks it.
- Trading lines are restored after the chart is rebuilt, and removing a line
  from `tradingLines` now removes it from the chart.

### Added

- Retained shared canonical bar adapter vectors fixture for comprehensive
  data ingestion testing across projects.
- Browser tests for the public chart API and the React component
  (`npm run test:browser`), with a regression test for each fix above.
- API documentation for price lines, markers, undo/redo, drawing import and
  export, `setTheme`, data feeds, and the visible-range semantics.

## [0.1.0] - 2026-09-04

First public release, published to npm as `fscandle`. The API is not yet stable
and may change in any 0.x release.

### Added

- Custom HTML5 Canvas K-line renderer — candle, hollow, Heikin Ashi, bar, area,
  line, step line, baseline, and volume — drawn in one Canvas pass with no
  per-bar DOM nodes.
- 16 built-in indicators: MA, EMA, BOLL, MACD, RSI, KDJ, WR, VOLMA, ATR, ADX,
  ROC, CCI, OBV, VWAP, STOCHRSI, PSAR.
- Multiple panes with per-pane redraws, multi-column price axes, synced charts,
  and overlay drawing tools with magnet snapping.
- `ChartPrimitive` as the single extension API — pane views, optional
  price/time axis views, hit testing, and pointer handlers, with the chart
  owning lifecycle and scheduling.
- Declarative custom series via `defineSeriesType` and custom overlays via
  figure descriptors.
- Explicit `Period` / `TradingSession` model with timezone-aware axis
  labelling, session-aware gap compression, and `tradingDayOf` for
  midnight-crossing sessions (`cn-futures-night` preset included).
- Bundled en-US, zh-CN, zh-TW locale dictionaries with a runtime registration
  API for any other language.
- Typed event subscriptions: click, double click, context menu, crosshair
  move, visible range, size, overlay change, data change.
- Multi-touch pinch-to-zoom and two-finger pan; gestures isolated in their own
  `InteractionController` layer.
- `persistence` (`enabled`, `key`) and `interaction` (`pan`, `zoom`) options,
  plus configurable `panes` and `indicators` styling that were previously
  hard-coded.
- Generic static, replay, polling, and WebSocket datafeed helpers.
- Three entry points — `.` (framework-neutral), `./react`, `./datafeed` —
  built with tsup to ESM + CJS + type declarations. `react` / `react-dom` are
  optional peer dependencies needed only by `./react`.
- Test surface: 459 unit tests, source-contract and built-artifact smoke
  tests, a Chromium frame-timing / heap-growth benchmark that fails the build
  on regression, and a stability probe.

### License

FusionCandlestick Non-Commercial Source License 1.0 — source-available, not
OSI open-source. Non-commercial use only; commercial use needs a separate
written licence from the Licensor. `docs/THIRD_PARTY_NOTICES.md` records the
one bundled dependency (`technicalindicators`, MIT).

### Known limitations

Pane orchestration still sits in the chart facade, custom *pane* views are not
yet pluggable, visual regression is a single baseline rather than a matrix, and
the indicator catalog is narrower than KLineCharts'. See the "Known Gaps"
section of [README.md](README.md).

[0.1.2]: https://github.com/FusionCandlestick/fscandle/releases/tag/v0.1.2
[0.1.1]: https://github.com/FusionCandlestick/fscandle/releases/tag/v0.1.1
[0.1.0]: https://github.com/FusionCandlestick/fscandle/releases/tag/v0.1.0
