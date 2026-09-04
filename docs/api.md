# FusionCandlestick API

This document is the code-aligned public API surface for the current release candidate.

## Core Chart

```ts
import { createChart, FusionCandlestickChart } from 'fscandle';

const chart = createChart(container, options);
chart.setData(klineData);
chart.updateData(nextBar);
chart.destroy();
```

The segmented facades below are the current public architecture.

The package also exposes focused entry points:

```ts
import { FusionCandlestickChartComponent } from 'fscandle/react';
import { bindMarketDataFeed, createPollingDataFeed } from 'fscandle/datafeed';
```

## Time Scale

```ts
const timeScale = chart.timeScale();
timeScale.logicalToCoordinate(120);
timeScale.coordinateToLogical(320);
timeScale.timestampToCoordinate(Date.now());
timeScale.coordinateToTimestamp(320);
timeScale.getVisibleLogicalRange();
timeScale.setVisibleLogicalRange({ from: 100, to: 180 });
const unsubscribe = timeScale.subscribeVisibleLogicalRangeChange(range => {
  // Sync external panels such as depth, order book, or volume profile.
});
timeScale.scrollToLatest();
```

`subscribeVisibleLogicalRangeChange` invokes the callback immediately with the current range and again when scroll, zoom, data-follow, or explicit range changes move the visible logical window.

## Price Scale

```ts
const priceScale = chart.priceScale();
priceScale.getMode();
priceScale.setMode('log');
priceScale.getInvertScale();
priceScale.setInvertScale(true);
priceScale.priceToCoordinate(45000);
priceScale.coordinateToPrice(180);
```

Supported modes are `normal` and `log`.

## Series

```ts
const series = chart.series();
series.getData();
series.setData(klineData);
series.updateData(nextBar);
series.setChartStyle('hollow');
series.removeAt(0);
```

Supported main chart styles are `candle`, `hollow`, `line`, `baseline`, `area`, `ha`, and `bar`.

```ts
chart.setChartStyle('baseline');
chart.addLineSeries({ color: '#2962FF', lineWidth: 2 });
chart.addBaselineSeries({
  topLineColor: '#26a69a',
  bottomLineColor: '#ef5350',
  lineWidth: 2,
});
```

Third-party series can be registered through the public registry:

```ts
import { BaseSeries, SeriesRegistry } from 'fscandle';

class CustomSeries extends BaseSeries {
  render(ctx, transformer) {
    // draw custom data
  }

  updateOptions(options) {
    this._options = { ...this._options, ...options };
  }
}

SeriesRegistry.register('custom', CustomSeries);
```

## React Component

```tsx
import { FusionCandlestickChartComponent } from 'fscandle/react';

<FusionCandlestickChartComponent
  data={data}
  options={{ toolbar: { visible: false } }}
  onChartReady={chart => {
    chart.timeScale().subscribeVisibleLogicalRangeChange(range => {
      console.log(range);
    });
  }}
/>;
```

## Panes

```ts
const panes = chart.pane();
panes.ids();
panes.weights();
panes.setWeights([3, 1]);
panes.getBounding('main');
```

Stacked price panes remain available through `addStackedPricePane`, `setStackedPaneData`, `setStackedPricePaneStyle`, and `removeStackedPricePane`. The main price scale plus five stacked price series gives one-chart comparison for up to six symbols; stacked scales are capped at three columns per side.

How the stack divides its space, and what the strip between two panes looks like, is configured under `panes`:

```ts
chart.applyOptions({
  panes: {
    dividerHeight: 6,                       // also the drag target's height
    dividerColor: 'rgba(128,128,128,0.1)',
    dividerHoverColor: 'rgba(128,128,128,0.45)',
    resizable: true,                        // false pins the current weights
    minWeight: 0.1,                         // floor on a pane's share
    newPaneWeight: 0.3,                     // share a newly added pane takes
  },
});
```

Dragging a divider moves it to the cursor and redistributes weight between the two panes either side, stopping at `minWeight` rather than collapsing one.

The built-in data tooltip follows the Lightweight Charts pattern of an HTML tooltip updated from crosshair state. It is controlled by `options.tooltip.visible` and shows OHLCV plus stacked comparison values.

## Primitives

Primitives are the sole extension API for reusable drawing tools, annotations, custom pane visuals, and axis decorations. The chart owns lifecycle and scheduling, while each primitive exposes pane views, optional price/time axis views, hit testing, and pointer handlers.

```ts
import { AnchoredTextPrimitive } from 'fscandle';

const note = new AnchoredTextPrimitive({
  timestamp: data[data.length - 10].timestamp,
  price: data[data.length - 10].close,
  text: 'Breakout',
});

chart.attachPrimitive(note);
note.applyOptions({ text: 'Confirmed breakout' });
chart.detachPrimitive(note.id);
```

Custom primitives implement `ChartPrimitive`:

```ts
chart.attachPrimitive({
  id: 'external-range-marker',
  attached(context) {
    this.context = context;
  },
  paneViews() {
    return [{
      paneId: 'main',
      layer: 'overlay',
      renderer: () => ({
        draw(ctx, params) {
          const x = params.timeScale.timestampToCoordinate(timestamp);
          const y = params.transformer.priceToY(price);
          ctx.fillRect(x - 3, y - 3, 6, 6);
        },
      }),
    }];
  },
  hitTest(context) {
    if (context.target !== 'chart') return null;
    return null;
  },
});
```

The core primitive hooks are `attached`, `detached`, `update`, `paneViews`, `priceAxisViews`, `timeAxisViews`, `hitTest`, `onPointerDown`, `onPointerMove`, and `onPointerUp`. The `attached` context includes `requestUpdate`, facade APIs, and coordinate conversion helpers.

The built-in overlay engine is now mounted through an internal `OverlayPrimitive`, so first-party drawings and third-party primitives share the same pane-view render scheduler. Use overlays when you want persisted drawing-tool templates; use primitives when you want packageable external rendering or interaction components.

## Indicators

Built-in templates are registered by short name and full name:

`MA`, `EMA`, `BOLL`, `MACD`, `RSI`, `KDJ`, `WR`, `VOLMA`, `ATR`, `ADX`, `ROC`, `CCI`, `OBV`, `VWAP`, `STOCHRSI`, `PSAR`.

```ts
chart.createIndicator('ATR', { newPane: true, calcParams: [14] });
chart.createIndicator('VWAP', { paneId: 'main' });
chart.registerIndicatorTemplate(customTemplate);
chart.getRegisteredIndicatorTemplates();
```

How they are drawn is chart-wide, under `indicators`:

```ts
chart.applyOptions({
  indicators: {
    lineWidth: 1,
    palette: ['#2962FF', '#FF9800', '#F44336', '#4CAF50', '#9C27B0'],
    barUpColor: 'rgba(38,166,154,0.5)',
    barDownColor: 'rgba(239,83,80,0.5)',
    fallbackRange: { min: 0, max: 100 },
  },
});
```

`palette` is used in figure order and wraps for an indicator with more figures than colours. `fallbackRange` is what an indicator pane scales to before its indicator has produced a finite value — 0..100 suits RSI and not much else.

Adding or removing an indicator repaints only the pane it belongs to. `chart.update(level, paneId)` takes the same narrowing for a caller driving redraws directly; omitting `paneId` invalidates every pane, which is the default.

## Overlays

Overlay templates can be queried and extended:

```ts
chart.getRegisteredOverlayTypes();
chart.registerOverlayTemplate({
  type: 'custom_overlay',
  render(ctx, overlay, transformer, dataStore) {
    // draw custom overlay
  },
});
```

Default drawing style can be configured before a user starts a new drawing:

```ts
chart.setDrawingDefaults({ color: '#10B981', lineWidth: 3 });
chart.getDrawingDefaults();
chart.setDrawingMode('line:segment');
```

Overlay instances support lifecycle callbacks:

```ts
chart.createOverlay({
  type: 'line',
  points,
  color: '#2962FF',
  lineWidth: 2,
  line: {
    direction: 'free',
    extendStart: false,
    extendEnd: false,
    showPriceLabel: false,
  },
  onDrawStart: overlay => {},
  onDrawing: overlay => {},
  onDrawEnd: overlay => {},
  onClick: overlay => {},
  onSelected: overlay => {},
  onDeselected: overlay => {},
  onPressedMoveStart: overlay => {},
  onPressedMoving: overlay => {},
  onPressedMoveEnd: overlay => {},
  onRemoved: overlay => {},
});
```

Drawing storage is intentionally consolidated. Line presets such as segment, trend, ray, infinite, horizontal, vertical, and price line all create `type: 'line'` overlays with different `line` options. Channel presets create `type: 'channel'` overlays. Text, arrow, tag, and image notes create `type: 'annotation'` overlays. Elliott three-wave/five-wave, ABCD, and ABCDE pattern tools create `type: 'wave'` overlays with `wave.kind`. ABCD and ABCDE also render filled three-point regions for each adjacent A-B-C, B-C-D, and C-D-E triangle. Two-point tools complete on the second click; channel tools complete on the third click; pattern tools complete when their final labeled point is confirmed.

Drawing layers group overlays into switchable saved sets. `clearActiveDrawingLayer()` acts as the eraser for the current layer only; it does not remove drawings saved in other layers. Use `createDrawingLayer(name)`, `setActiveDrawingLayer(id)`, `deleteDrawingLayer(id)`, `getDrawingLayers()`, and `getActiveDrawingLayerId()` to build external layer panels. Exported drawing JSON now includes `drawingLayers` and `activeDrawingLayerId` while still carrying the active `overlays` array for older integrations.

## Custom Series

Register a series type from a declarative definition — no `BaseSeries` subclassing, no engine internals.

```ts
chart.defineSeriesType<{ upColor: string; downColor: string }>({
  type: 'renko',
  defaultOptions: { upColor: '#26a69a', downColor: '#ef5350' },
  renderer: ({ ctx, data, options, visibleRange, indexToX, priceToY, barSpacing }) => {
    for (let i = visibleRange.from; i <= visibleRange.to; i++) {
      const bar = data[i];
      const x = indexToX(i);
      ctx.fillStyle = bar.close >= bar.open ? options.upColor : options.downColor;
      ctx.fillRect(x - barSpacing / 2, priceToY(Math.max(bar.open, bar.close)),
                   barSpacing, Math.abs(priceToY(bar.open) - priceToY(bar.close)));
    }
  },
  // Optional: drives autoscale. Defaults to high/low.
  priceValues: bar => [bar.open, bar.close],
  // Optional: overrides crosshair/tooltip snapping. Defaults to the bar at `index`.
  snap: (data, index) => data[index] ?? null,
});

// The type now works anywhere a built-in style is accepted.
chart.setChartStyle('renko');
chart.addCustomSeries('renko', { upColor: '#00e676' });
```

Built-in series types: `candle`, `hollow`, `ha`, `bar`, `line`, `step`, `baseline`, `area`.

`StepLineSeries` accepts `stepPosition: 'before' | 'middle' | 'after'` (default `after`, matching Lightweight Charts) and an optional `areaColor` fill.

## Period And Trading Sessions

Declaring the bar interval makes axis tick granularity deterministic instead of inferred from bar spacing. Declaring the trading session lets the chart tell a closed market apart from missing data.

```ts
const chart = createChart(container, {
  timeScale: {
    period: '15m',          // or { type: 'minute', span: 15 }
    session: 'us-equity',   // or a TradingSession object
  },
});

chart.setPeriod('1D');
chart.setSession('cn-a-share');
chart.getEffectivePeriod();  // declared period, or one inferred from the data
```

Period strings follow exchange convention: lowercase `m` is minutes, uppercase `M` is months. A bare number is minutes (`'15'` === `'15m'`).

Session presets: `us-equity`, `us-equity-extended`, `cn-a-share`, `hk-equity`, `forex`, `crypto-24x7`. Build your own with `defineSession`:

```ts
import { defineSession } from 'fscandle';

const custom = defineSession({
  id: 'my-market',
  name: 'My Market',
  timeZone: 'Europe/London',
  days: [1, 2, 3, 4, 5],           // 0 = Sunday
  segments: [{ start: '08:00', end: '16:30' }],
});
```

A segment whose end is at or before its start wraps past midnight. A span between two bars containing no session minutes is treated as a market closure and compressed on the time axis, so an overnight or weekend break does not leave a hole.

Axis ticks show the coarsest unit that changed since the previous tick — `14:30` within a day, `Mar 4` on a new day, `2026` on a new year — with every boundary check evaluated in the configured timezone rather than the viewer's local zone.

## Events

Every subscription returns an unsubscribe function.

```ts
const unsubscribe = chart.subscribeCrosshairMove(params => {
  // params: { time, logical, point, price, bar, paneId, overlay, sourceEvent }
});
unsubscribe();

chart.subscribeClick(params => {});
chart.subscribeDblClick(params => {});
chart.subscribeContextMenu(params => {});
chart.subscribeVisibleTimeRangeChange(({ from, to }) => {});
chart.subscribeSizeChange(({ width, height }) => {});
chart.subscribeOverlayChange(({ reason, overlay }) => {});  // created | updated | removed | selected | deselected
chart.subscribeDataChange(({ reason, count, bar }) => {});   // set | update

// Generic typed access to the same bus.
chart.subscribe('click', params => {});
```

`click` fires only when the pointer barely moved between down and up, and never after a pan, axis scale, divider drag, or overlay drag. `crosshairMove` also fires when the pointer leaves the chart, with `time`, `price`, `bar`, and `overlay` all null so subscribers can clear their readouts.

## Overlay Metadata

```ts
chart.setOverlayLocked(id, true);   // renders, but cannot be selected, dragged, or deleted
chart.setOverlayVisible(id, false); // skipped by rendering and hit testing
chart.setOverlayZLevel(id, 10);     // higher draws on top; ties break on insertion order

chart.getOverlaysByGroup('fib-set');
chart.updateOverlayGroup('fib-set', { color: '#ff0' });
chart.removeOverlayGroup('fib-set');
```

Overlays also carry `extendData` for arbitrary caller-owned data, preserved across save/load.

## Overlay Figure Descriptors

Templates may render imperatively (`render`) or declaratively (`createFigures`). Declarative figures are drawn *and* hit-tested by the engine, so a custom template needs no hit-test code.

```ts
chart.registerOverlayTemplate({
  type: 'span',
  totalStep: 2,
  needDefaultPointFigure: true,
  defaultOverlay: { zLevel: 5 },
  drawSteps: [
    { hint: 'Pick the start' },
    {
      hint: 'Pick the end',
      // Return false to reject the point and stay on this step.
      onPlace: (overlay, point) => point.timestamp !== overlay.points[0].timestamp,
    },
  ],
  createFigures: ({ coordinates, height, overlay }) => [
    {
      type: 'rect',
      attrs: {
        x: coordinates[0].x,
        y: 0,
        width: coordinates[1].x - coordinates[0].x,
        height,
      },
      styles: { style: 'stroke_fill', color: overlay.color, fillColor: 'rgba(41,98,255,0.12)' },
    },
  ],
  // Optional: contribute figures to the price or time axis.
  createPriceAxisFigures: ({ coordinates }) => [],
  createTimeAxisFigures: ({ coordinates }) => [],
});
```

Figure types: `line`, `polygon`, `rect`, `circle`, `arc`, `text`. Styles accept `style` (`stroke` | `fill` | `stroke_fill`), `color`, `fillColor`, `lineWidth`, `dashedValue`, and `opacity`; `text` adds size, family, weight, alignment, and a padded background box.

`chart.getCurrentDrawStepHint()` returns the hint for the step awaiting a click, for wiring into external status bars.

## Localization

```ts
import { registerLocale } from 'fscandle';

const chart = createChart(container, { localization: { locale: 'zh-CN' } });
chart.setLocale('zh-TW');   // switches language and rebuilds the toolbar
chart.getLocale();
chart.t('toolbar.undo');

registerLocale('pt-BR', { 'toolbar.undo': 'Desfazer' });
```

Bundled: `en-US`, `zh-CN`, `zh-TW`. Register any other language at runtime with `registerLocale`. Resolution tries the exact tag, then the bare language, then any registered tag of the same language, then English; `zh-HK` and `zh-MO` route to `zh-TW`. Missing keys fall back to English, then to the key itself.

`localization.priceFormatter` and `localization.timeFormatter` still override formatting entirely when supplied.

## Touch

Two-finger gestures are handled natively: pinch to zoom the time axis, pinch vertically to zoom the price axis, and drag the gesture midpoint to pan. `chart.isPinching()` reports whether a gesture is in progress. `pointercancel` is handled, so an interrupted touch cannot strand the chart in pinch mode.

## Data Feeds

The data feed layer in `src/datafeed` provides typed market-data integration primitives for polling, WebSocket style updates, mock feeds, and fan-out into chart series.

## Release Verification

Run the full local gate before release:

```bash
npm run release:check
```
