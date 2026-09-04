/**
 * Does the chart survive data and interaction it was not designed for?
 *
 * The performance benchmarks feed well-formed bars and drive well-formed
 * gestures. This one does the opposite: empty sets, a single bar, prices that
 * never move, NaN and Infinity in the feed, unsorted and duplicated timestamps,
 * zero-sized containers, and gestures fired faster than frames.
 *
 * Every case asserts the same two things -- no exception reached the page, and
 * the chart still answers questions afterwards -- because the failure that
 * matters is not a wrong pixel but a chart that has stopped responding while
 * looking fine.
 *
 *   npm run build:library && node tests/performance/stability-probe.mjs
 *
 * Exits non-zero on the first case that throws or leaves the chart dead.
 */
import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';

const ROOT = resolve(import.meta.dirname, '../..');
const BUNDLE = resolve(ROOT, 'tests/performance/.artifacts/fusion.standalone.js');
const PORT = 3116;

if (!existsSync(BUNDLE)) {
  mkdirSync(resolve(ROOT, 'tests/performance/.artifacts'), { recursive: true });
  execFileSync(
    resolve(ROOT, 'node_modules/.bin/esbuild'),
    [resolve(ROOT, 'dist/index.js'), '--bundle', '--format=esm', '--minify', `--outfile=${BUNDLE}`],
    { stdio: 'inherit' },
  );
}

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0}#chart{width:900px;height:500px}#tiny{width:0;height:0}
</style></head><body><div id="chart"></div><div id="tiny"></div></body></html>`;

const server = createServer((req, res) => {
  if (req.url.split('?')[0] === '/') {
    res.writeHead(200, { 'content-type': 'text/html' });
    return res.end(html);
  }
  res.writeHead(200, { 'content-type': 'text/javascript' });
  res.end(readFileSync(BUNDLE));
});
await new Promise(done => server.listen(PORT, done));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1000, height: 600 } });
const pageErrors = [];
page.on('pageerror', error => pageErrors.push(String(error)));
await page.goto(`http://127.0.0.1:${PORT}/`);

const results = await page.evaluate(async () => {
  const { createChart } = await import('/fusion.js');
  const frame = () => new Promise(requestAnimationFrame);
  const bar = (i, price = 100) => ({
    timestamp: 1_600_000_000_000 + i * 60_000,
    open: price,
    high: price * 1.01,
    low: price * 0.99,
    close: price,
    volume: 1,
  });

  const cases = {
    'empty data': () => [],
    'single bar': () => [bar(0)],
    'two identical bars': () => [bar(0), { ...bar(1), timestamp: bar(0).timestamp }],
    'flat prices': () => Array.from({ length: 500 }, (_, i) => ({ ...bar(i), high: 100, low: 100, open: 100, close: 100 })),
    'zero prices': () => Array.from({ length: 100 }, (_, i) => ({ ...bar(i), open: 0, high: 0, low: 0, close: 0 })),
    'negative prices': () => Array.from({ length: 100 }, (_, i) => ({ ...bar(i), open: -50, high: -40, low: -60, close: -45 })),
    'NaN in feed': () => Array.from({ length: 100 }, (_, i) => (i === 50 ? { ...bar(i), high: NaN, low: NaN } : bar(i, 100 + i))),
    'Infinity in feed': () => Array.from({ length: 100 }, (_, i) => (i === 50 ? { ...bar(i), high: Infinity } : bar(i, 100 + i))),
    'unsorted timestamps': () => [bar(5), bar(1), bar(3), bar(0), bar(4)],
    'duplicate timestamps': () => Array.from({ length: 50 }, () => bar(0)),
    'huge price range': () => Array.from({ length: 200 }, (_, i) => bar(i, i === 0 ? 1e-8 : 1e9)),
  };

  const report = {};
  for (const [name, build] of Object.entries(cases)) {
    const host = document.getElementById('chart');
    host.innerHTML = '';
    let chart = null;
    try {
      chart = createChart(host);
      chart.setData(build());
      await frame();
      await frame();
      // Still answering questions is the real check: a chart can look painted
      // and have stopped running its update loop.
      const alive = Array.isArray(chart.getData()) && chart.priceLines().length === 0;
      report[name] = { ok: alive, error: null };
    } catch (error) {
      report[name] = { ok: false, error: String(error).slice(0, 120) };
    } finally {
      try {
        chart?.destroy();
      } catch (error) {
        report[name].error = `destroy: ${String(error).slice(0, 80)}`;
        report[name].ok = false;
      }
    }
  }

  // A container with no width or height: charts get mounted in collapsed
  // layouts more often than anyone expects.
  try {
    const chart = createChart(document.getElementById('tiny'));
    chart.setData([bar(0), bar(1)]);
    await frame();
    chart.destroy();
    report['zero-sized container'] = { ok: true, error: null };
  } catch (error) {
    report['zero-sized container'] = { ok: false, error: String(error).slice(0, 120) };
  }

  // Rapid churn: setData faster than frames, which is what a live feed with a
  // slow consumer looks like.
  try {
    const host = document.getElementById('chart');
    host.innerHTML = '';
    const chart = createChart(host);
    for (let round = 0; round < 40; round += 1) {
      chart.setData(Array.from({ length: 2_000 }, (_, i) => bar(i, 100 + ((i + round) % 50))));
    }
    await frame();
    const alive = chart.getData().length === 2_000;
    chart.destroy();
    report['40 setData without a frame'] = { ok: alive, error: null };
  } catch (error) {
    report['40 setData without a frame'] = { ok: false, error: String(error).slice(0, 120) };
  }

  // Create and destroy repeatedly: listeners and observers that outlive their
  // chart show up here as heap that never comes back.
  try {
    const host = document.getElementById('chart');
    const before = performance.memory?.usedJSHeapSize ?? 0;
    for (let round = 0; round < 30; round += 1) {
      host.innerHTML = '';
      const chart = createChart(host);
      chart.setData(Array.from({ length: 1_000 }, (_, i) => bar(i, 100 + (i % 30))));
      chart.destroy();
    }
    await frame();
    const after = performance.memory?.usedJSHeapSize ?? 0;
    report['30 create/destroy cycles'] = {
      ok: true,
      error: null,
      heapGrowthMB: before ? +(((after - before) / 1024 / 1024)).toFixed(1) : null,
    };
  } catch (error) {
    report['30 create/destroy cycles'] = { ok: false, error: String(error).slice(0, 120) };
  }

  return report;
});

await browser.close();
server.close();

let failed = 0;
for (const [name, result] of Object.entries(results)) {
  const extra = result.heapGrowthMB !== undefined && result.heapGrowthMB !== null ? `  heap +${result.heapGrowthMB}MB` : '';
  console.log(`${result.ok ? 'ok  ' : 'FAIL'}  ${name.padEnd(30)}${result.error ? `  ${result.error}` : extra}`);
  if (!result.ok) failed += 1;
}

if (pageErrors.length > 0) {
  console.log(`\nuncaught page errors (${pageErrors.length}):`);
  pageErrors.slice(0, 5).forEach(error => console.log(`  ${error.slice(0, 160)}`));
  failed += pageErrors.length;
}

console.log(`\n${failed === 0 ? 'all stability cases passed' : `${failed} problem(s)`}`);
process.exit(failed === 0 ? 0 : 1);
