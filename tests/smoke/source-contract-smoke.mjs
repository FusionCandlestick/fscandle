import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const read = path => readFileSync(resolve(root, path), 'utf8');

const chart = read('src/FusionCandlestickChart.ts');
const overlays = read('src/engine/OverlayManager.ts');
const indicators = read('src/plugins/Indicator.ts');
const transformer = read('src/engine/CoordinateTransformer.ts');
const publicIndex = read('src/index.ts');
const packageJson = read('package.json');
const packageManifest = JSON.parse(packageJson);

[
  'public timeScale(): TimeScaleApi',
  'public priceScale(): PriceScaleApi',
  'public series(): SeriesApi',
  'public pane(): PaneApi',
  'public attachPrimitive(primitive: ChartPrimitive)',
  'public detachPrimitive(id: string)',
  'public getPrimitive(id: string)',
  'public getPrimitives(): ChartPrimitive\\[\\]',
  'subscribeVisibleLogicalRangeChange',
].forEach(contract => assert.match(chart, new RegExp(contract.replace(/[()]/g, '\\$&'))));

[
  'createChart',
  'FusionCandlestickChartComponent',
  'SeriesRegistry',
  'ChartPrimitive',
  'DrawingLayer',
  'PrimitiveManager',
  'AnchoredTextPrimitive',
  'OverlayPrimitive',
  'OverlayTemplate',
  'IndicatorTemplate',
  "export * from './datafeed'",
].forEach(contract => assert.match(publicIndex, new RegExp(contract.replace(/[()*.]/g, '\\$&'))));

[
  '"exports"',
  '"main": "./dist/index.cjs"',
  '"module": "./dist/index.js"',
  '"types": "./dist/index.d.ts"',
  '"files"',
  '"dist"',
  '"./react"',
  '"./datafeed"',
].forEach(contract => assert.match(packageJson, new RegExp(contract.replace(/[().]/g, '\\$&'))));

assert.equal(packageManifest.dependencies?.klinecharts, undefined);
assert.equal(packageManifest.dependencies?.['lightweight-charts'], undefined);

[
  '_drawingFixedPointCount',
  '_getRequiredDrawingPointCount',
].forEach(contract => assert.match(chart, new RegExp(contract)));

[
  'onDrawStart',
  'onDrawing',
  'onDrawEnd',
  'onRemoved',
  'onClick',
  'onSelected',
  'onDeselected',
  'onPressedMoveStart',
  'onPressedMoving',
  'onPressedMoveEnd',
].forEach(callback => {
  assert.match(overlays, new RegExp(callback));
  assert.match(chart, new RegExp(callback));
});

[
  "type: 'line'",
  "type: 'channel'",
  "type: 'annotation'",
].forEach(template => assert.match(overlays, new RegExp(template.replace(/[()]/g, '\\$&'))));

[
  'paneViews',
  'priceAxisViews',
  'timeAxisViews',
  'hitTest',
  'requestUpdate',
].forEach(contract => {
  assert.match(read('src/engine/Primitive.ts'), new RegExp(contract));
  assert.match(read('docs/api.md'), new RegExp(contract));
});

assert.match(read('src/engine/OverlayPrimitive.ts'), /OverlayPrimitive/);
assert.match(read('src/FusionCandlestickChart.ts'), /new OverlayPrimitive/);
assert.match(read('src/plugins/primitives/AnchoredTextPrimitive.ts'), /class AnchoredTextPrimitive/);

[
  'getNormalizationScale',
  'getLogOffset',
  'public getRange\\(\\)',
].forEach(contract => assert.match(transformer, new RegExp(contract)));

[
  'ATRTemplate',
  'ADXTemplate',
  'ROCTemplate',
  'CCITemplate',
  'OBVTemplate',
  'VWAPTemplate',
  'StochasticRSITemplate',
  'PSARTemplate',
].forEach(template => assert.match(indicators, new RegExp(template)));

[
  '_regularInterval',
  '_isTimeGap',
  'getRegularInterval',
].forEach(contract => assert.match(read('src/store/DataStore.ts'), new RegExp(contract)));

// Coordinate-space contracts inside the chart. These are call-site facts, not
// API surface: the functions involved are private and need a DOM to run, so a
// source assertion is what can guard them.
//
// 1. A pointer event's `price` must be read in the pane's own vertical space.
//    `_buildMouseEventParams` used to pass plot-relative `chartY` straight into
//    `yToPrice`, so the reported price was off by the pane's top offset for
//    every pane but the first.
assert.match(chart, /price: transformer \? transformer\.yToPrice\(localY\) : null/);
assert.match(chart, /const localY = paneTop === undefined \? y : this\._getPaneLocalY\(y, paneTop\)/);

// 2. Sub-panes must draw through their own transformer. Sharing the chart's
//    one left it holding the last-rendered indicator's range (RSI's 0-100) for
//    everything that read it afterwards.
assert.match(chart, /const transformer = this\._paneTransformers\.for\(paneId\)/);
assert.doesNotMatch(
  chart.slice(chart.indexOf('private _renderIndicatorPane'), chart.indexOf('private _renderIndicatorPane') + 6000),
  /this\._coordinateTransformer/,
);

// 3. The redraw latch must be released before any early return, or a chart that
//    becomes visible without a resize never schedules another frame.
const internalUpdate = chart.slice(chart.indexOf('private _internalUpdate()'));
assert.ok(
  internalUpdate.indexOf('this._updateRequested = false;') < internalUpdate.indexOf('return;'),
  '_internalUpdate must reset _updateRequested before its first early return',
);

// These belong to the API reference. They used to be asserted against the gap
// checklist, which meant a status document had to keep mentioning every feature
// forever -- and it broke the moment that document was trimmed to what is still
// open. `docs/api.md` is where a reader looks for them.
[
  'timeScale()',
  'priceScale()',
  'series()',
  'pane()',
  'primitive',
  'ATR',
  'ADX',
].forEach(term => assert.match(read('docs/api.md'), new RegExp(term.replace(/[()]/g, '\\$&'))));

// The claim the deleted release checklist used to carry, asserted against the
// thing itself rather than against a document saying it exists.
assert.ok(existsSync(resolve(root, '.github/workflows/ci.yml')), 'CI workflow must exist');

console.log('source contract smoke checks passed');
