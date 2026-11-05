import { expect, test } from '@playwright/test';

import { makeBars, openPage, type OpenedPage } from './harness';

/** The channel and trend indicators can be created on a live chart and keep up with updates. */

let opened: OpenedPage;
test.afterEach(() => {
  expect(opened.errors).toEqual([]);
});

for (const [name, newPane] of [['DC', false], ['KC', false], ['SUPERTREND', false], ['ICHIMOKU', false]] as const) {
  test(`${name} is drawn and follows live updates`, async ({ page }) => {
    opened = await openPage(page, 'fscandle.js');
    const result = await page.evaluate(async ([data, indicatorName, separate]) => {
      const chart = window.fscandle.createChart(document.getElementById('chart') as HTMLDivElement, { persistence: { enabled: false } } as never);
      chart.addCandlestickSeries();
      chart.setData(data as never);
      const indicator = chart.createIndicator(indicatorName, { newPane: separate });
      const bars = data as Array<{ timestamp: number; open: number; high: number; low: number; close: number; volume: number }>;
      const last = bars[bars.length - 1];
      chart.updateData({ ...last, timestamp: last.timestamp + 60_000, close: last.close + 1, high: last.high + 1 } as never);
      await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
      const row = indicator.result[indicator.result.length - 30];
      return {
        rows: indicator.result.length,
        bars: chart.getData().length,
        finiteKeys: Object.entries(row).filter(([, value]) => typeof value === 'number' && Number.isFinite(value)).map(([key]) => key),
      };
    }, [makeBars(400), name, newPane] as const);
    expect(result.rows).toBe(result.bars);
    expect(result.finiteKeys.length).toBeGreaterThan(0);
  });
}
