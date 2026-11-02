import { expect, test, type Page } from '@playwright/test';

import { makeBars, openPage, type OpenedPage } from './harness';

const BARS = makeBars(300);
const NO_PERSISTENCE = { persistence: { enabled: false } };

async function mount(page: Page, props: Record<string, unknown>): Promise<OpenedPage> {
  const opened = await openPage(page, 'react.js', '<div id="root"></div><div id="second"></div>');
  await page.evaluate(initial => window.renderChart(initial), props);
  await page.waitForFunction(() => window.reactEvents.ready > 0);
  await page.evaluate(() => new Promise(requestAnimationFrame));
  return opened;
}

let opened: OpenedPage;
test.afterEach(() => {
  expect(opened.errors, 'no uncaught errors in the page').toEqual([]);
});

test('re-rendering with equal options keeps the same chart', async ({ page }) => {
  opened = await mount(page, { data: BARS, options: NO_PERSISTENCE });
  for (let i = 0; i < 3; i++) {
    // A new object with the same content, as an inline prop would be.
    await page.evaluate(() => window.renderChart({ options: { persistence: { enabled: false } } }));
  }
  await page.evaluate(() => new Promise(requestAnimationFrame));
  expect(await page.evaluate(() => window.reactEvents.ready)).toBe(1);
});

test('a live bar is appended without rebuilding the chart', async ({ page }) => {
  opened = await mount(page, { data: BARS.slice(0, 299), options: NO_PERSISTENCE });
  await page.evaluate(bars => window.renderChart({ data: bars }), BARS);
  await expect.poll(() => page.evaluate(() => window.reactChart?.getData().length)).toBe(300);
  expect(await page.evaluate(() => window.reactEvents.ready)).toBe(1);
});

test('the overlays prop is reconciled by id, without duplicates', async ({ page }) => {
  const overlay = {
    id: 'o1',
    type: 'line',
    points: [{ timestamp: BARS[100].timestamp, value: 104 }, { timestamp: BARS[150].timestamp, value: 104 }],
    color: '#ff0',
    lineWidth: 2,
  };
  opened = await mount(page, { data: BARS, options: NO_PERSISTENCE, overlays: [overlay] });
  await page.evaluate(next => window.renderChart({ overlays: [next] }), { ...overlay, color: '#0ff' });
  // React applies the new props in an effect, after this call returns.
  await expect
    .poll(() => page.evaluate(() => window.reactChart?.getOverlays().map(o => [o.id, o.color])))
    .toEqual([['o1', '#0ff']]);
});

/** Drag the trading line at `price` up by 30 pixels. */
async function dragLineUp(page: Page, price: number) {
  const y = await page.evaluate(p => {
    const canvas = document.querySelector('canvas') as HTMLCanvasElement;
    return canvas.getBoundingClientRect().top + (window.reactChart?.priceScale().priceToCoordinate(p) ?? 0);
  }, price);
  const x = await page.evaluate(() => (document.querySelector('canvas') as HTMLCanvasElement).getBoundingClientRect().left + 450);
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= 6; i++) await page.mouse.move(x, y - i * 5);
  await page.mouse.up();
}

test.describe('trading lines', () => {
  const lines = [
    { id: 'entry', type: 'entry', price: 104, label: 'Entry' },
    { id: 'stop', type: 'stop', price: 98, label: 'SL', draggable: false },
  ];

  test('are drawn as overlays and report drags; a locked line does not move', async ({ page }) => {
    opened = await mount(page, { data: BARS, options: NO_PERSISTENCE, tradingLines: lines });
    const ids = await page.evaluate(() => window.reactChart?.getOverlays().map(o => o.id));
    expect(ids).toEqual(['trading-line-entry', 'trading-line-stop']);

    await dragLineUp(page, 104);
    const afterEntry = await page.evaluate(() => window.reactEvents.drags.map(([id]) => id));
    expect(afterEntry.length).toBeGreaterThan(0);
    expect(new Set(afterEntry)).toEqual(new Set(['entry']));

    const before = afterEntry.length;
    await dragLineUp(page, 98);
    expect(await page.evaluate(() => window.reactEvents.drags.length)).toBe(before);
  });

  test('still report drags after an unrelated drawing is undone (regression)', async ({ page }) => {
    opened = await mount(page, { data: BARS, options: NO_PERSISTENCE, tradingLines: lines });
    await page.evaluate(bars => {
      const chart = window.reactChart!;
      chart.createOverlay({
        type: 'line',
        points: [{ timestamp: bars[10].timestamp, value: 100 }, { timestamp: bars[60].timestamp, value: 103 }],
        color: '#fff',
        lineWidth: 1,
      });
      chart.undo();
    }, BARS);
    await page.evaluate(() => new Promise(requestAnimationFrame));
    await dragLineUp(page, 104);
    expect(await page.evaluate(() => window.reactEvents.drags.length)).toBeGreaterThan(0);
  });
});

test('two charts sharing a persistence key log a warning', async ({ page }) => {
  opened = await mount(page, { data: BARS, persistenceKey: 'shared-key' });
  await page.evaluate(bars => window.renderChart({ data: bars.slice(0, 50), persistenceKey: 'shared-key' }, 'second'), BARS);
  await expect.poll(() => opened.warnings.some(text => text.includes('share the persistence key "shared-key"'))).toBe(true);
});
