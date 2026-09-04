/**
 * Head-to-head browser benchmark against the two reference engines.
 *
 * `tests/performance/browser-frame-benchmark.mjs` measures this engine against
 * its own thresholds, which answers "did we regress" and not "are we faster
 * than the alternatives". This one loads klinecharts, lightweight-charts, and
 * fscandle into the same page shape, feeds them the same bars, drives
 * the same scripted gestures, and reports the same numbers for each.
 *
 * What it measures, and why those three:
 *
 * - **load**: milliseconds from `createChart` to the frame after the data is in.
 *   This is what a user waits for when a symbol opens.
 * - **pan**: frame intervals while dragging horizontally. The interaction a
 *   trader spends the most time in, and the one that exposes a renderer that
 *   redraws everything on every move.
 * - **crosshair**: frame intervals while moving the pointer without dragging.
 *   Separated from pan deliberately: an engine with graded invalidation should
 *   be much cheaper here, and one that always does a full redraw should not be.
 *
 * Frame intervals come from `requestAnimationFrame` timestamps during the
 * gesture, so they include whatever the engine did on the main thread. The
 * headline is the 95th percentile, not the mean: a chart that is smooth on
 * average and stutters every tenth frame reads as broken, and the mean hides it.
 *
 * Run:  node tests/performance/reference-comparison.mjs [--bars 50000] [--out <file>]
 *
 * The reference engines are not dependencies of this project. Install them into
 * a scratch directory first and point at it:
 *
 *   mkdir -p /tmp/klbench && cd /tmp/klbench && npm init -y
 *   npm i klinecharts@10.0.0-beta3 lightweight-charts@5.1.0
 *   node tests/performance/reference-comparison.mjs --refs /tmp/klbench/node_modules
 */
import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import { chromium } from '@playwright/test';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? fallback : args[index + 1];
};

const BARS = Number(flag('bars', 50_000));
const REFS = resolve(flag('refs', '/tmp/klbench/node_modules'));
const ROOT = resolve(import.meta.dirname, '..');
const PORT = 3111;

// Every engine is served as a self-contained bundle, which is what makes the
// comparison fair: lightweight-charts publishes a standalone build with its
// dependencies inlined, and this engine is bundled to match rather than being
// served as the chunked build that expects a package manager to resolve
// `technicalindicators`.
const FUSION_BUNDLE = resolve(ROOT, 'tests/performance/.artifacts/fusion.standalone.js');

const FILES = {
  '/fusion.js': FUSION_BUNDLE,
  '/klinecharts.js': resolve(REFS, 'klinecharts/dist/index.esm.js'),
  '/lightweight-charts.js': resolve(REFS, 'lightweight-charts/dist/lightweight-charts.standalone.production.mjs'),
};

if (!existsSync(FUSION_BUNDLE)) {
  const { mkdirSync } = await import('node:fs');
  const { execFileSync } = await import('node:child_process');
  mkdirSync(resolve(ROOT, 'tests/performance/.artifacts'), { recursive: true });
  execFileSync(
    resolve(ROOT, 'node_modules/.bin/esbuild'),
    [resolve(ROOT, 'dist/index.js'), '--bundle', '--format=esm', '--minify', `--outfile=${FUSION_BUNDLE}`],
    { stdio: 'inherit' },
  );
}

for (const [route, file] of Object.entries(FILES)) {
  if (!existsSync(file)) {
    console.error(`missing ${file}\n  ${route} cannot be served.`);
    if (route === '/fusion/index.js') console.error('  run `npm run build:library` first.');
    else console.error('  install the reference engines and pass --refs <node_modules>.');
    process.exit(1);
  }
}

const MIME = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.html': 'text/html', '.css': 'text/css' };

const page$ = `
<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;height:100%;background:#0d1117}
  #chart{width:1200px;height:600px}
</style></head><body><div id="chart"></div></body></html>`;

// Chunked builds import siblings by relative path, so anything under dist/ has
// to be reachable, not just the entry.
const server = createServer((req, res) => {
  const url = req.url.split('?')[0];
  // The page is served over http rather than set as content: an about:blank
  // document has no base URL, so the engines' module imports cannot resolve.
  if (url === '/') {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(page$);
    return;
  }
  const file = FILES[url];
  if (!file || !existsSync(file)) {
    res.writeHead(404).end('not found');
    return;
  }
  res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
  res.end(readFileSync(file));
});


/**
 * One engine's adapter: build a chart in `el` with `bars`, and report when the
 * data is on screen. Each returns the same shape so the driver stays engine
 * agnostic.
 */
const ADAPTERS = {
  'fscandle': async (el, bars) => {
    const { createChart } = await import('/fusion.js');
    const chart = createChart(el);
    chart.setData(bars);
    return { dispose: () => chart.destroy?.() };
  },
  klinecharts: async (el, bars) => {
    // Its ESM build reads `process.env.NODE_ENV`, which no browser defines.
    window.process ??= { env: { NODE_ENV: 'production' } };
    const kline = await import('/klinecharts.js');
    const chart = kline.init(el);
    chart.setSymbol({ ticker: 'BENCH', pricePrecision: 2, volumePrecision: 0 });
    chart.setPeriod({ span: 1, type: 'minute' });
    chart.setDataLoader({ getBars: ({ callback }) => callback(bars, false) });
    return { dispose: () => kline.dispose(el) };
  },
  'lightweight-charts': async (el, bars) => {
    const lwc = await import('/lightweight-charts.js');
    const chart = lwc.createChart(el, { width: 1200, height: 600 });
    const series = chart.addSeries(lwc.CandlestickSeries, {});
    series.setData(
      bars.map(bar => ({
        time: Math.floor(bar.timestamp / 1000),
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
      })),
    );
    return { dispose: () => chart.remove() };
  },
};

/**
 * Main-thread cost, from the browser rather than from the page.
 *
 * Frame intervals turned out to measure the display's refresh cadence: at 20k
 * bars every engine finished well inside a frame, so all three reported ~8.3ms
 * and the number said nothing about them. `Performance.getMetrics` reports the
 * task and script time the main thread actually spent, which is the quantity
 * that runs out first when a chart is asked to do too much.
 */
const sampleCost = async cdp => {
  const { metrics } = await cdp.send('Performance.getMetrics');
  const value = name => metrics.find(metric => metric.name === name)?.value ?? 0;
  return { task: value('TaskDuration'), script: value('ScriptDuration'), layout: value('LayoutDuration') };
};

/**
 * Heap actually retained, not heap allocated since the last collection.
 *
 * Reading `usedJSHeapSize` straight after the gesture phases reported ~50MB for
 * this engine against KLineCharts' ~28MB, and a sampling profile showed why:
 * most of it was garbage from the interaction that had not been collected, plus
 * the 20MB of bars the harness itself created. Forcing a collection first makes
 * the number mean what the column header says.
 *
 * The adapters are not equivalent on this axis either, and the number should be
 * read knowing it: KLineCharts takes the bars through a callback, this engine
 * copies the array (references, ~1.6MB at 200k), and Lightweight Charts needs a
 * differently-shaped array so its adapter maps a second set of 200,000 objects.
 * That mapping is the consumer's cost with that library, not an artifact.
 */
const retainedHeapMB = async (cdp, page) => {
  await cdp.send('HeapProfiler.enable');
  await cdp.send('HeapProfiler.collectGarbage');
  return page.evaluate(() =>
    performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1024 / 1024) : null,
  );
};

const costBetween = (before, after) => ({
  taskMs: +((after.task - before.task) * 1000).toFixed(1),
  scriptMs: +((after.script - before.script) * 1000).toFixed(1),
});

/**
 * Gestures are driven with Playwright's mouse, not with `dispatchEvent`.
 *
 * Synthetic events are not trusted events, and an engine that uses pointer
 * capture or listens on its own overlay layer can ignore them entirely -- which
 * it did: klinecharts and lightweight-charts both reported ~0.1ms of scripting
 * for a 60-step pan, because nothing had happened. A benchmark where the
 * competitor silently no-ops is worse than no benchmark.
 *
 * `pixelSignature` is the check that keeps it honest: if the canvases are
 * identical before and after a gesture, the phase is reported as "no effect"
 * rather than as a very fast one.
 */
const pixelSignature = page =>
  page.evaluate(() => {
    const canvases = [...document.querySelectorAll('#chart canvas')];
    if (canvases.length === 0) return 'none';
    return canvases
      .map(canvas => {
        const context = canvas.getContext('2d');
        if (!context || canvas.width === 0) return 'x';
        // A coarse sample: enough to notice a redraw, cheap enough not to
        // distort the phase it is measuring (it runs outside the timed window).
        const { data } = context.getImageData(0, 0, Math.min(canvas.width, 400), Math.min(canvas.height, 200));
        let hash = 0;
        for (let i = 0; i < data.length; i += 97) hash = (hash * 31 + data[i]) | 0;
        return String(hash);
      })
      .join('|');
  });

const createChart = (page, engine) =>
  page.evaluate(async engine => {
    const el = document.getElementById('chart');
    const started = performance.now();
    window.__handle = await window.__adapters[engine](el, window.__bars);
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
    return { wallMs: +(performance.now() - started).toFixed(1) };
  }, engine);

const settle = page => page.evaluate(() => new Promise(requestAnimationFrame));

const pan = async page => {
  await page.mouse.move(900, 300);
  await page.mouse.down();
  for (let i = 1; i <= 60; i += 1) {
    await page.mouse.move(900 - i * 8, 300);
    await settle(page);
  }
  await page.mouse.up();
};

const crosshair = async page => {
  for (let i = 0; i < 60; i += 1) {
    await page.mouse.move(300 + i * 8, 200 + (i % 20));
    await settle(page);
  }
};

const seedData = (page, barCount) =>
  page.evaluate(count => {
    // Deterministic bars: the same series for every engine, so a difference in
    // the numbers is a difference in the engines.
    const bars = [];
    let price = 100;
    let seed = 42;
    const random = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    for (let i = 0; i < count; i += 1) {
      const open = price;
      const close = open * (1 + (random() - 0.5) * 0.02);
      bars.push({
        timestamp: 1_600_000_000_000 + i * 60_000,
        open,
        high: Math.max(open, close) * 1.002,
        low: Math.min(open, close) * 0.998,
        close,
        volume: Math.round(random() * 1000),
      });
      price = close;
    }
    document.getElementById('chart').innerHTML = '';
    window.__bars = bars;
  }, barCount);

const run = async () => {
  await new Promise(done => server.listen(PORT, done));
  const browser = await chromium.launch({ args: ['--enable-precise-memory-info'] });
  const results = {};

  try {
    for (const engine of Object.keys(ADAPTERS)) {
      const page = await browser.newPage({ viewport: { width: 1400, height: 800 } });
      const errors = [];
      page.on('pageerror', error => errors.push(String(error)));
      await page.goto(`http://127.0.0.1:${PORT}/`);
      await page.addScriptTag({
        type: 'module',
        content: `window.__adapters = { ${Object.entries(ADAPTERS)
          .map(([name, fn]) => `${JSON.stringify(name)}: ${fn.toString()}`)
          .join(', ')} };
          window.__ready = true;`,
      });
      await page.waitForFunction(() => window.__ready === true);

      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Performance.enable');

      try {
        await seedData(page, BARS);

        const beforeLoad = await sampleCost(cdp);
        const load = await createChart(page, engine);
        const afterLoad = await sampleCost(cdp);

        const beforePan = await pixelSignature(page);
        const panStart = await sampleCost(cdp);
        await pan(page);
        const panEnd = await sampleCost(cdp);
        const afterPan = await pixelSignature(page);

        const crosshairStart = await sampleCost(cdp);
        await crosshair(page);
        const crosshairEnd = await sampleCost(cdp);
        const afterCrosshair = await pixelSignature(page);

        results[engine] = {
          load: { ...costBetween(beforeLoad, afterLoad), ...load },
          pan: { ...costBetween(panStart, panEnd), responded: afterPan !== beforePan },
          crosshair: { ...costBetween(crosshairStart, crosshairEnd), responded: afterCrosshair !== afterPan },
          heapMB: await retainedHeapMB(cdp, page),
        };
      } catch (error) {
        results[engine] = { error: String(error).slice(0, 200) };
      }
      if (errors.length) results[engine].pageErrors = errors.slice(0, 2);
      await page.close();
    }
  } finally {
    await browser.close();
    server.close();
  }

  const row = (name, r) =>
    r.error
      ? `${name.padEnd(22)} FAILED  ${r.error}`
      : `${name.padEnd(22)} ${String(r.load.wallMs).padStart(8)} ${String(r.load.scriptMs).padStart(10)} ${String(r.pan.responded ? r.pan.scriptMs : 'no effect').padStart(9)} ${String(r.crosshair.responded ? r.crosshair.scriptMs : 'no effect').padStart(11)} ${String(r.heapMB ?? '-').padStart(7)}`;

  console.log(`\n${BARS.toLocaleString()} bars, 1200x600, Chromium\n`);
  console.log(`${'engine'.padEnd(22)} ${'load ms'.padStart(8)} ${'load js'.padStart(10)} ${'pan js'.padStart(9)} ${'crosshair js'.padStart(11)} ${'heap MB'.padStart(7)}`);
  console.log('-'.repeat(72));
  for (const [name, result] of Object.entries(results)) console.log(row(name, result));
  console.log('\nload ms = wall clock to first painted frame; *js = main-thread script time during the phase (60 events each)\n');

  const out = flag('out');
  if (out) {
    const { writeFileSync } = await import('node:fs');
    writeFileSync(out, JSON.stringify({ bars: BARS, results }, null, 2));
    console.log(`wrote ${out}`);
  }
};

run().catch(error => {
  console.error(error);
  server.close();
  process.exit(1);
});
