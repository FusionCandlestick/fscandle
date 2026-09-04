# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[0.1.0]: https://github.com/FusionCandlestick/fscandle/releases/tag/v0.1.0
