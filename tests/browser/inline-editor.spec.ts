import { expect, test, type Page } from '@playwright/test';

import { makeBars, openPage, type OpenedPage } from './harness';

/** The inline text editor takes focus on the next frame, if it is still there. */

let opened: OpenedPage;
test.afterEach(() => {
  expect(opened.errors).toEqual([]);
});

async function chartWithOverlay(page: Page) {
  await page.evaluate(data => {
    const chart = window.fscandle.createChart(document.getElementById('chart') as HTMLDivElement, { persistence: { enabled: false } } as never);
    chart.addCandlestickSeries();
    chart.setData(data as never);
    const bars = data as Array<{ timestamp: number; close: number }>;
    chart.createOverlay({
      id: 'label',
      type: 'line',
      points: [
        { timestamp: bars[50].timestamp, value: bars[50].close },
        { timestamp: bars[80].timestamp, value: bars[80].close },
      ],
      color: '#2962FF',
      lineWidth: 1,
    } as never);
    window.chart = chart;
  }, makeBars(200));
}

test('the editor takes focus on the next frame', async ({ page }) => {
  opened = await openPage(page, 'fscandle.js');
  await chartWithOverlay(page);
  const focused = await page.evaluate(async () => {
    const overlay = window.chart.getOverlays().find(item => item.id === 'label')!;
    window.chart.startEditingOverlayText(overlay);
    await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
    return document.activeElement?.classList.contains('fusion-overlay-inline-editor') ?? false;
  });
  expect(focused).toBe(true);
});

test('destroying the chart before that frame leaves nothing focused and throws nothing', async ({ page }) => {
  opened = await openPage(page, 'fscandle.js');
  await chartWithOverlay(page);
  const result = await page.evaluate(async () => {
    const overlay = window.chart.getOverlays().find(item => item.id === 'label')!;
    window.chart.startEditingOverlayText(overlay);
    window.chart.destroy();
    await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
    return {
      editors: document.querySelectorAll('.fusion-overlay-inline-editor').length,
      activeIsBody: document.activeElement === document.body,
    };
  });
  expect(result).toEqual({ editors: 0, activeIsBody: true });
});
