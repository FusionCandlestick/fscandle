import { expect, test, type Page } from '@playwright/test';

import { makeBars, openPage, type OpenedPage } from './harness';

/**
 * A pointer click places a drawing point at the price and time the chart draws
 * at that pixel. Measured from the plot's real origin, which depends on the
 * toolbar and on whether each ruler is shown: a point placed at a pixel must be
 * the value the scale reports for that pixel.
 */

const PLAYGROUND_OPTIONS = {
  persistence: { enabled: false },
  toolbar: { visible: false },
  layout: { background: { color: '#0b1020' }, textColor: '#94a3b8' },
  timeScale: { period: '1d', rightMargin: 0.05, sessionSeparator: { visible: false, color: 'rgba(255,255,255,0.1)', style: 'dashed' } },
  axis: { lastPriceLineVisible: false },
  crosshair: { color: '#758696' },
  watermark: { visible: true, text: 'SPY', color: 'rgba(255,255,255,0.05)' },
  panes: { dividerHeight: 1, dividerColor: '#000000', dividerHoverColor: '#000000', resizable: true },
};

const CONFIGS: Array<[string, Record<string, unknown>]> = [
  ['default', { persistence: { enabled: false } }],
  ['playground', PLAYGROUND_OPTIONS],
  ['toolbar hidden, top ruler on', { persistence: { enabled: false }, toolbar: { visible: false }, timeScale: { position: 'both' } }],
];

async function build(page: Page, options: Record<string, unknown>, magnet: boolean) {
  await page.evaluate(([data, chartOptions, snap]) => {
    const chart = window.fscandle.createChart(document.getElementById('chart') as HTMLDivElement, chartOptions as never);
    chart.addCandlestickSeries();
    chart.setData(data as never);
    chart.setMagnetMode(snap);
    window.chart = chart;
  }, [makeBars(200), options, magnet] as const);
  // The toolbar mounts asynchronously and changes the plot's origin, so wait for it.
  await page.waitForTimeout(400);
}

/** The plot's origin, relative to the chart box, as the chart lays it out now. */
async function plotOrigin(page: Page) {
  return page.evaluate(() => {
    const pane = window.chart.getPaneBounding('main');
    if (!pane) throw new Error('no main pane');
    return { left: pane.left, top: pane.top };
  });
}

/** Click at a pixel, relative to the chart box, and return the point it stored. */
async function clickAt(page: Page, box: { x: number; y: number }, at: { x: number; y: number }) {
  await page.evaluate(() => window.chart.setDrawingMode('line'));
  await page.mouse.click(box.x + at.x, box.y + at.y);
  await page.mouse.click(box.x + at.x + 60, box.y + at.y - 2);
  await page.waitForTimeout(150);
  return page.evaluate(() => window.chart.getOverlays().at(-1)?.points ?? []);
}

let opened: OpenedPage;
test.afterEach(() => {
  expect(opened.errors).toEqual([]);
});

for (const [name, options] of CONFIGS) {
  test(`${name}: a click stores the price and time the chart draws at that pixel`, async ({ page }) => {
    opened = await openPage(page, 'fscandle.js');
    await build(page, options, false);
    const box = await page.locator('#chart').boundingBox();
    if (!box) throw new Error('no chart box');
    const origin = await plotOrigin(page);

    // Two pixels well inside the plot.
    const a = { x: origin.left + 200, y: origin.top + 120 };
    const points = await clickAt(page, box, a);
    expect(points.length).toBe(2);

    // The scale's own reading of the same pixel. The scales take plot
    // coordinates, so the pixel is measured from the plot's origin.
    const expected = await page.evaluate(([x, y]) => ({
      price: window.chart.priceScale().coordinateToPrice(y),
      timestamp: window.chart.timeScale().coordinateToTimestamp(x),
    }), [a.x - origin.left, a.y - origin.top] as const);
    expect(points[0].value).toBeCloseTo(expected.price, 2);
    expect(expected.timestamp, 'the pixel is inside the data').not.toBeNull();
    expect(Math.abs(points[0].timestamp - (expected.timestamp as number))).toBeLessThan(60_000);
  });
}

test('magnet: a point more than the snap radius from every value keeps the pointer price', async ({ page }) => {
  opened = await openPage(page, 'fscandle.js');
  await build(page, PLAYGROUND_OPTIONS, true);
  const box = await page.locator('#chart').boundingBox();
  if (!box) throw new Error('no chart box');
  const origin = await plotOrigin(page);

  // Plot coordinates throughout; the click adds the origin. Price falls as y grows.
  const priceAt = (plotY: number) => page.evaluate(yy => window.chart.priceScale().coordinateToPrice(yy), plotY);
  const lowest = await page.evaluate(() => Math.min(...window.chart.getData().map(bar => bar.low)));
  const slope = Math.abs((await priceAt(101)) - (await priceAt(100)));
  // Snap radius is 12px. Look for a pixel more than 14px below the lowest low.
  let plotY = 0;
  while ((await priceAt(plotY)) > lowest - 14 * slope && plotY < 470) plotY += 1;
  const pointer = await priceAt(plotY);
  expect(pointer, 'precondition: the pixel is more than 14px below every low').toBeLessThan(lowest - 14 * slope);

  const a = { x: origin.left + 300, y: origin.top + plotY };
  const points = await clickAt(page, box, a);
  expect(points.length).toBe(2);
  expect(points[0].value).toBeCloseTo(pointer, 2);
});
