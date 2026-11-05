# FusionCandlestick

`fscandle` is a free-form HTML5 Canvas K-line (candlestick) chart engine with a
custom renderer, framework-neutral and React entry points, and datafeed helpers.
It builds its own charting surface rather than wrapping an existing library;
KLineCharts and Lightweight Charts are used only as reference baselines for
architecture, interaction design, and release quality.

The marketing site and interactive playground live in a separate repository,
[**fscandle-web**](https://github.com/FusionCandlestick/fscandle-web)
(→ `fusioncandlestick.dev`).

> **0.x — the API is not stable.** Any 0.x release may change it. Pin an exact
> version. A git dependency also works (`"fscandle":
> "github:FusionCandlestick/fscandle#<sha>"`); a `prepare` script builds `dist/`
> on install, so build output is not committed.

## Install

```bash
npm i fscandle
```

```ts
import { createChart, SeriesRegistry, type ChartPrimitive } from 'fscandle';
import { FusionCandlestickChartComponent } from 'fscandle/react';
import { bindMarketDataFeed } from 'fscandle/datafeed';
```

`react` and `react-dom` (>=18) are optional peer dependencies, needed only for
the `fscandle/react` entry. That entry ships the `"use client"` directive, so it
can be imported directly from a Next.js App Router server component.

## Quick start

```ts
import { createChart } from 'fscandle';

const chart = createChart(document.getElementById('chart')!, {
  timeScale: { period: '1d' },
});
chart.setData(bars);           // KLineData[]
chart.updateData(nextBar);     // incremental
// ...
chart.destroy();
```

`createChart(container, options)` is the framework-neutral entry;
`FusionCandlestickChartComponent` is the React wrapper; primitives are the
extension API for reusable drawing tools, annotations, custom pane visuals, and
axis decorations. See [`docs/api.md`](docs/api.md).

## Core capabilities

- Custom Canvas K-line renderer: candle, hollow, Heikin Ashi, bar, area, line, step line, baseline, and volume modes
- Multiple panes, multi-column price axes, synced charts, and overlay drawing tools
- Built-in indicators: MA, EMA, BOLL, MACD, RSI, KDJ, WR, VOLMA, ATR, ADX, ROC, CCI, OBV, VWAP, STOCHRSI, PSAR, DC (Donchian), KC (Keltner), SUPERTREND, ICHIMOKU
- Crosshair axis labels, screenshot export, magnet snapping, local state persistence
- `timeScale()`, `priceScale()`, `series()`, `pane()` facade APIs
- Declarative custom series via `defineSeriesType`; custom overlays via figure descriptors
- Explicit `Period` / `TradingSession` model with timezone-aware axis labelling and session-aware gap compression
- Bundled `en-US`, `zh-CN`, `zh-TW` locale dictionaries with fallback resolution; register more at runtime
- Typed event subscriptions: click, double click, context menu, crosshair move, visible range, size, overlay change, data change
- Multi-touch pinch-to-zoom and two-finger pan
- Overlay template registration with draw/select/click/drag/remove lifecycle callbacks
- `ChartPrimitive` pane/axis views plus centralized pointer interactions
- Generic static, replay, polling, and WebSocket datafeed helpers

## Architecture snapshot

GUI, renderer, and model concerns are separated; pane and scale ownership still
sit in the facade:

- `src/model/` — period, trading session, timezone math, time formatting, price-scale geometry (pure, no DOM)
- `src/renderer/` — chrome rendering (watermark, extremes, axis rails) and colour math; the main-pane and indicator-pane crosshairs (`mainPaneCrosshair.ts`, `indicatorCrosshair.ts`), price-axis value tags (`axisTags.ts`), series beacons, and session separators, each drawn from explicit inputs
- `src/gui/` — toolbar, data tooltip, series style menu, each reaching the chart only through an explicit host interface; `displayLabels.ts` holds the pure label formatting
- `src/i18n/` — translation runtime plus locale dictionaries
- `src/store/DataStore.ts` — sorted OHLC data, logical-index conversion, subscriptions; `persistence.ts` — the persisted-state contract
- `src/engine/` — series, panes, overlays, primitives, pointer handling, event bus
  - overlays are split across `OverlayManager.ts` (state, hit testing, rendering), `overlayTypes.ts` (public shapes), `overlayDrawing.ts` (canvas and geometry helpers), and `builtinOverlayTemplates.ts` (the shipped templates)
  - `decorationRenderer.ts` — price lines, the last-price line, and series markers
- `src/model/PriceScaleModel.ts` — the main price scale's mode, inversion, vertical viewport, and zoom bounds
- `src/FusionCandlestickChart.ts` — public chart facade; pane and indicator orchestration still live here

## Build and test

```bash
npm run build:library   # emits dist/ (ESM + CJS + .d.ts) via tsup
npm run typecheck        # tsc over src and tests (type checking only, no output)
npm run test             # typecheck + unit + source smoke + perf smoke
npm run test:unit        # transpile with esbuild, then Node's test runner (about 2 seconds)
npm run test:browser     # chart API and React component in Chromium (Playwright, about 12 seconds)
npm run release:check    # lint, typecheck, all tests, audit, bundle build, artifact smoke
```

The unit-test build is transpile-only (`scripts/build-tests.mjs`), so it is fast;
type errors in tests are caught by `npm run typecheck`. Shared fixtures live in
`tests/support/fixtures.ts`.

The browser tests (`tests/browser/`) cover the public chart API and the React
component in a real canvas, including a regression test for each fixed bug.

The stability probe and the browser tests launch Playwright's bundled Chromium.
Where that is not installed, point them at another binary:

```bash
FSCANDLE_CHROMIUM=/path/to/chromium npm run test:browser
```

Unit tests cover period parsing, timezone boundaries, trading sessions, time
formatting, price-scale geometry, coordinate transforms, the data store, overlay
metadata and hit testing, the series registry, the event bus, i18n, the
persisted-state contract, built-in overlay hit geometry, the price-scale model,
and pane weight ownership.

Browser interaction, gesture, and screenshot regression tests run against the
site in [fscandle-web](https://github.com/FusionCandlestick/fscandle-web).

## Repository layout

- `src/` — the chart engine and its entry points (`index`, `react`, `datafeed`)
- `docs/` — API reference, data-source integration, release process, third-party notices
- `tests/` — unit, source-contract, and performance checks
- `.github/` — CI, issue/PR templates, code ownership

## Known gaps

- `src/FusionCandlestickChart.ts` still owns pane orchestration and price-scale state; drawing a pane has moved to `src/renderer/paneRenderers.ts`, and the text editor, screenshot, drawing modes and legend/toolbar content to their own modules
- Custom panes are drawn by a callback and are not saved with the chart state (see `addCustomPane` in the API reference)
- Indicator catalog is narrower than KLineCharts — deferred in favour of the registry

## License

FusionCandlestick Non-Commercial Source License 1.0 — source-available, **not**
an OSI open-source license. Non-commercial use only; commercial use requires a
separate written license from the Licensor. See [`LICENSE`](LICENSE) and
[`docs/THIRD_PARTY_NOTICES.md`](docs/THIRD_PARTY_NOTICES.md).
