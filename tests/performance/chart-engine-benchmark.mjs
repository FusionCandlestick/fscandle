import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { build } from 'esbuild';

const makeBars = count => {
  const bars = [];
  let price = 50_000;
  let timestamp = Date.UTC(2026, 0, 1);
  for (let i = 0; i < count; i++) {
    const wave = Math.sin(i / 17) * 120;
    const drift = i * 0.35;
    const open = price;
    const close = price + wave * 0.04 + drift * 0.001;
    const high = Math.max(open, close) + 80 + (i % 11);
    const low = Math.min(open, close) - 80 - (i % 7);
    bars.push({ timestamp, open, high, low, close, volume: 1000 + (i % 100) * 10 });
    price = close;
    timestamp += 60_000;
  }
  return bars;
};

const lowerBound = (items, timestamp) => {
  let low = 0;
  let high = items.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (items[mid].timestamp < timestamp) low = mid + 1;
    else high = mid;
  }
  return low;
};

const upsertSorted = (items, bar) => {
  const index = lowerBound(items, bar.timestamp);
  if (items[index]?.timestamp === bar.timestamp) {
    items[index] = bar;
  } else {
    items.splice(index, 0, bar);
  }
};

const benchmark = (label, fn, maxMs) => {
  const start = performance.now();
  const result = fn();
  const elapsed = performance.now() - start;
  assert.ok(elapsed <= maxMs, `${label} exceeded ${maxMs}ms: ${elapsed.toFixed(2)}ms`);
  return { label, elapsed, result };
};

const base = makeBars(100_000);
const ingest = benchmark('100k deterministic bar generation', () => makeBars(100_000), 1000);
const sortedUpdates = benchmark('10k sorted upserts', () => {
  const copy = base.slice();
  for (let i = 0; i < 10_000; i++) {
    const bar = {
      ...copy[(i * 13) % copy.length],
      close: copy[(i * 13) % copy.length].close + 1,
    };
    upsertSorted(copy, bar);
  }
  return copy.length;
}, 1000);
const rangeScan = benchmark('visible range min/max scan', () => {
  let min = Infinity;
  let max = -Infinity;
  for (let i = 45_000; i < 47_000; i++) {
    min = Math.min(min, base[i].low);
    max = Math.max(max, base[i].high);
  }
  return { min, max };
}, 100);

/**
 * Live updates with indicators attached: the per-update cost of keeping five
 * indicators current on 20,000 bars, through the same DataStore and Indicator
 * code the chart runs. Recomputing every indicator over the whole series on
 * each update took about 39 ms per update in Chromium; the incremental path
 * takes a small fraction of that. Two limits guard it: an absolute ceiling
 * per update, and a ratio against a full recalculation measured on the same
 * machine, which stays meaningful on a slow CI runner.
 */
const engine = await (async () => {
  const result = await build({
    stdin: {
      contents: "export { DataStore } from './src/store/DataStore'; export { Indicator, DEFAULT_INDICATOR_TEMPLATES } from './src/plugins/Indicator';",
      resolveDir: process.cwd(),
      loader: 'ts',
    },
    bundle: true,
    format: 'esm',
    platform: 'node',
    write: false,
    logLevel: 'silent',
  });
  const code = result.outputFiles[0].text;
  return import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
})();

const LIVE_BARS = 20_000;
const LIVE_UPDATES = 200;
const LIVE_INDICATORS = ['MA', 'BOLL', 'MACD', 'RSI', 'KDJ'];
const MAX_MS_PER_UPDATE = 8;
const MIN_SPEEDUP = 5;

const liveSetup = () => {
  const store = new engine.DataStore();
  store.setData(makeBars(LIVE_BARS));
  const indicators = LIVE_INDICATORS.map(name => {
    const template = engine.DEFAULT_INDICATOR_TEMPLATES.find(item => item.shortName === name);
    const indicator = new engine.Indicator(name, template);
    indicator.calc(store.getData());
    return indicator;
  });
  return { store, indicators };
};

// One update in four appends a bar; the rest move the last bar's close, as a tick does.
const liveTick = (store, i) => {
  const data = store.getData();
  const last = data[data.length - 1];
  const bar = i % 4 === 3
    ? { ...last, timestamp: last.timestamp + 60_000, open: last.close }
    : { ...last, close: last.close + 1, high: Math.max(last.high, last.close + 1) };
  return store.addData(bar);
};

const timeUpdates = useTail => {
  const { store, indicators } = liveSetup();
  const start = performance.now();
  for (let i = 0; i < LIVE_UPDATES; i++) {
    const changedFrom = liveTick(store, i);
    for (const indicator of indicators) {
      if (useTail) indicator.calcFrom(store.getData(), changedFrom);
      else indicator.calc(store.getData());
    }
  }
  return (performance.now() - start) / LIVE_UPDATES;
};

const fullMsPerUpdate = timeUpdates(false);
const liveMsPerUpdate = timeUpdates(true);
const liveSpeedup = fullMsPerUpdate / liveMsPerUpdate;
assert.ok(
  liveMsPerUpdate <= MAX_MS_PER_UPDATE,
  `live update with ${LIVE_INDICATORS.length} indicators on ${LIVE_BARS} bars took ${liveMsPerUpdate.toFixed(3)}ms, limit ${MAX_MS_PER_UPDATE}ms`,
);
assert.ok(
  liveSpeedup >= MIN_SPEEDUP,
  `incremental indicator update is only ${liveSpeedup.toFixed(1)}x faster than a full recalculation, expected at least ${MIN_SPEEDUP}x`,
);

console.log(JSON.stringify({
  checks: [
    {
      label: `live update, ${LIVE_INDICATORS.length} indicators on ${LIVE_BARS} bars`,
      msPerUpdate: Number(liveMsPerUpdate.toFixed(3)),
      fullRecalcMsPerUpdate: Number(fullMsPerUpdate.toFixed(3)),
      speedup: Number(liveSpeedup.toFixed(1)),
    },
    { label: ingest.label, elapsedMs: Number(ingest.elapsed.toFixed(2)) },
    { label: sortedUpdates.label, elapsedMs: Number(sortedUpdates.elapsed.toFixed(2)), bars: sortedUpdates.result },
    { label: rangeScan.label, elapsedMs: Number(rangeScan.elapsed.toFixed(2)), range: rangeScan.result },
  ],
}, null, 2));
