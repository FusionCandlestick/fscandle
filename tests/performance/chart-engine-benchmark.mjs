import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';

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

console.log(JSON.stringify({
  checks: [
    { label: ingest.label, elapsedMs: Number(ingest.elapsed.toFixed(2)) },
    { label: sortedUpdates.label, elapsedMs: Number(sortedUpdates.elapsed.toFixed(2)), bars: sortedUpdates.result },
    { label: rangeScan.label, elapsedMs: Number(rangeScan.elapsed.toFixed(2)), range: rangeScan.result },
  ],
}, null, 2));
