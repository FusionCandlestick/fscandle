import { expect, test, type Page } from '@playwright/test';

import { makeBars, openPage, type OpenedPage } from './harness';

/**
 * Pointer interactions driven by real mouse events, not by calling the
 * controller directly: dividers, overlay handles and bodies, wheel zoom on each
 * axis, and the crosshair and click events the chart reports.
 */

let opened: OpenedPage;
test.afterEach(() => {
  expect(opened.errors).toEqual([]);
});

interface Geometry {
  box: { x: number; y: number };
  origin: { left: number; top: number };
}

async function geometry(page: Page): Promise<Geometry> {
  const box = await page.locator('#chart').boundingBox();
  if (!box) throw new Error('no chart box');
  const origin = await page.evaluate(() => {
    const pane = window.chart.getPaneBounding('main');
    if (!pane) throw new Error('no main pane');
    return { left: pane.left, top: pane.top };
  });
  return { box: { x: box.x, y: box.y }, origin };
}

/** The screen point of a bar's time and a price, from the chart's own scales. */
async function screenPoint(page: Page, g: Geometry, timestamp: number, price: number) {
  const plot = await page.evaluate(([ts, p]) => ({
    x: window.chart.timestampToCoordinate(ts),
    y: window.chart.priceScale().priceToCoordinate(p),
  }), [timestamp, price] as const);
  return { x: g.box.x + g.origin.left + plot.x, y: g.box.y + g.origin.top + plot.y };
}

async function buildChart(page: Page, options: Record<string, unknown> = {}) {
  await page.evaluate(([data, extra]) => {
    const chart = window.fscandle.createChart(document.getElementById('chart') as HTMLDivElement, { persistence: { enabled: false }, ...extra } as never);
    chart.addCandlestickSeries();
    chart.setData(data as never);
    window.chart = chart;
  }, [makeBars(200), options] as const);
  await page.waitForTimeout(400);
}

async function addLine(page: Page) {
  await page.evaluate(() => {
    const bars = window.chart.getData();
    window.chart.createOverlay({
      id: 'probe-line',
      type: 'line',
      points: [
        { timestamp: bars[150].timestamp, value: bars[150].close },
        { timestamp: bars[180].timestamp, value: bars[180].close },
      ],
      color: '#2962FF',
      lineWidth: 2,
    } as never);
  });
  await page.waitForTimeout(100);
}

async function plotXOf(page: Page, timestamp: number) {
  return page.evaluate(ts => window.chart.timestampToCoordinate(ts), timestamp);
}

async function linePoints(page: Page) {
  return page.evaluate(() => window.chart.getOverlays().find(o => o.id === 'probe-line')!.points.map(p => ({ ...p })));
}

test('dragging an overlay handle moves only that anchor point', async ({ page }) => {
  opened = await openPage(page, 'fscandle.js');
  await buildChart(page);
  await addLine(page);
  const before = await linePoints(page);
  const g = await geometry(page);
  expect(await plotXOf(page, before[1].timestamp)).toBeGreaterThan(0);
  const handle = await screenPoint(page, g, before[1].timestamp, before[1].value);

  await page.mouse.move(handle.x, handle.y);
  await page.mouse.down();
  await page.mouse.move(handle.x - 40, handle.y - 25, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(100);

  const after = await linePoints(page);
  expect(after[0]).toEqual(before[0]);
  expect(after[1].timestamp).toBeLessThan(before[1].timestamp);
  expect(after[1].value).toBeGreaterThan(before[1].value);
});

test('dragging the body of a line moves every anchor point by the same amount', async ({ page }) => {
  opened = await openPage(page, 'fscandle.js');
  await buildChart(page);
  await addLine(page);
  const before = await linePoints(page);
  const g = await geometry(page);
  const a = await screenPoint(page, g, before[0].timestamp, before[0].value);
  const b = await screenPoint(page, g, before[1].timestamp, before[1].value);
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };

  await page.mouse.move(mid.x, mid.y);
  await page.mouse.down();
  await page.mouse.move(mid.x + 30, mid.y, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(100);

  const after = await linePoints(page);
  const shift = after.map((p, i) => p.timestamp - before[i].timestamp);
  expect(shift[0]).toBeGreaterThan(0);
  expect(shift[1]).toBe(shift[0]);
  expect(after[0].value).toBeCloseTo(before[0].value, 6);
});

test('dragging the divider between two panes resizes them and keeps the plot whole', async ({ page }) => {
  opened = await openPage(page, 'fscandle.js');
  await buildChart(page);
  await page.evaluate(() => window.chart.createIndicator('RSI', { newPane: true }));
  await page.waitForTimeout(200);
  const g = await geometry(page);
  const main = await page.evaluate(() => window.chart.getPaneBounding('main')!);
  const rsi = await page.evaluate(() => window.chart.getPaneBounding(window.chart.pane().ids()[1])!);
  const dividerY = g.box.y + main.top + main.height + (rsi.top - (main.top + main.height)) / 2;
  const x = g.box.x + g.origin.left + 200;

  await page.mouse.move(x, dividerY);
  await page.mouse.down();
  await page.mouse.move(x, dividerY - 60, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(150);

  const after = await page.evaluate(() => ({
    main: window.chart.getPaneBounding('main')!,
    rsi: window.chart.getPaneBounding(window.chart.pane().ids()[1])!,
  }));
  expect(after.main.height).toBeLessThan(main.height - 30);
  expect(after.rsi.height).toBeGreaterThan(rsi.height + 30);
  const total = after.main.height + after.rsi.height;
  expect(total).toBeCloseTo(main.height + rsi.height, 0);
});

test('the wheel over the time ruler zooms the time axis, and the wheel over the price axis zooms the price scale', async ({ page }) => {
  opened = await openPage(page, 'fscandle.js');
  await buildChart(page);
  const g = await geometry(page);
  const plotCenter = { x: g.box.x + g.origin.left + 300, y: g.box.y + g.origin.top + 200 };
  const height = await page.locator('#chart').evaluate(el => el.clientHeight);
  // The bottom time ruler is the strip along the chart's bottom edge.
  const timeRuler = { x: plotCenter.x, y: g.box.y + height - 8 };
  const width = await page.locator('#chart').evaluate(el => el.clientWidth);
  const priceAxis = { x: g.box.x + width - 6, y: plotCenter.y };

  const span = () => page.evaluate(() => {
    const r = window.chart.getVisibleLogicalRange();
    return r.to - r.from;
  });
  const priceSpan = () => page.evaluate(() => {
    const scale = window.chart.priceScale();
    return Math.abs(scale.coordinateToPrice(20) - scale.coordinateToPrice(400));
  });

  const timeBefore = await span();
  await page.mouse.move(timeRuler.x, timeRuler.y);
  await page.mouse.wheel(0, 240);
  await page.waitForTimeout(150);
  const timeZoomedOut = await span();
  expect(timeZoomedOut).toBeGreaterThan(timeBefore);

  const priceBefore = await priceSpan();
  await page.mouse.move(priceAxis.x, priceAxis.y);
  await page.mouse.wheel(0, 240);
  await page.waitForTimeout(150);
  expect(await priceSpan()).toBeGreaterThan(priceBefore);
});

test('the chart reports a crosshair move while the pointer is over it, and a null position when it leaves', async ({ page }) => {
  opened = await openPage(page, 'fscandle.js');
  await buildChart(page);
  await page.evaluate(() => {
    const w = window as unknown as { moves: Array<{ time: number | null; price: number | null }> };
    w.moves = [];
    window.chart.subscribeCrosshairMove(params => w.moves.push({ time: params.time, price: params.price }));
  });
  const g = await geometry(page);
  await page.mouse.move(g.box.x + g.origin.left + 250, g.box.y + g.origin.top + 150, { steps: 4 });
  await page.waitForTimeout(100);
  await page.mouse.move(g.box.x - 60, g.box.y - 60, { steps: 4 });
  await page.waitForTimeout(100);

  const moves = await page.evaluate(() => (window as unknown as { moves: Array<{ time: number | null; price: number | null }> }).moves);
  const over = moves.find(m => m.time !== null);
  expect(over?.price).not.toBeNull();
  expect(moves.at(-1)).toEqual({ time: null, price: null });
});

test('a click reports once, and a quick second click reports a double click', async ({ page }) => {
  opened = await openPage(page, 'fscandle.js');
  await buildChart(page);
  await page.evaluate(() => {
    const w = window as unknown as { clicks: number; doubles: number };
    w.clicks = 0;
    w.doubles = 0;
    window.chart.subscribeClick(() => { w.clicks += 1; });
    window.chart.subscribeDblClick(() => { w.doubles += 1; });
  });
  const g = await geometry(page);
  const at = { x: g.box.x + g.origin.left + 260, y: g.box.y + g.origin.top + 180 };

  await page.mouse.click(at.x, at.y);
  await page.waitForTimeout(50);
  expect(await page.evaluate(() => (window as unknown as { clicks: number }).clicks)).toBe(1);
  expect(await page.evaluate(() => (window as unknown as { doubles: number }).doubles)).toBe(0);

  // The double click window is 300 ms; the second click lands well inside it.
  await page.mouse.click(at.x, at.y, { delay: 30 });
  await page.waitForTimeout(150);
  expect(await page.evaluate(() => (window as unknown as { doubles: number }).doubles)).toBe(1);
});
