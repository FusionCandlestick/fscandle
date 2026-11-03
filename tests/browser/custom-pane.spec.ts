import { expect, test, type Page } from '@playwright/test';

import { makeBars, openPage, type OpenedPage } from './harness';

/**
 * A custom pane joins the stack and is drawn by its own callback, with the
 * range it asked for. Removing it stops the drawing, and a callback that throws
 * is reported once without stopping the chart.
 */

interface Probe {
  paneId: string;
  width: number;
  height: number;
  y0: number;
  y1: number;
  from: number;
  to: number;
}

let opened: OpenedPage;
test.afterEach(() => {
  expect(opened.errors).toEqual([]);
});

async function build(page: Page, persistenceKey?: string) {
  await page.evaluate(([data, key]) => {
    const chart = window.fscandle.createChart(document.getElementById('chart') as HTMLDivElement, {
      persistence: key ? { enabled: true, key } : { enabled: false },
    } as never);
    chart.addCandlestickSeries();
    chart.setData(data as never);
    window.chart = chart;
  }, [makeBars(200), persistenceKey ?? null] as const);
  // The chart draws on the next frame, after the series is in place.
  await page.waitForTimeout(300);
}

test('a custom pane joins the stack and is drawn with its own range', async ({ page }) => {
  opened = await openPage(page, 'fscandle.js');
  await build(page);

  await page.evaluate(() => {
    const w = window as unknown as { probes: unknown[] };
    w.probes = [];
    window.chart.addCustomPane({
      id: 'probe',
      range: () => ({ min: 0, max: 1 }),
      draw: (_ctx, params) => {
        w.probes.push({
          paneId: params.paneId,
          width: params.width,
          height: params.height,
          y0: params.transformer.priceToY(0),
          y1: params.transformer.priceToY(1),
          from: params.visibleRange.from,
          to: params.visibleRange.to,
        });
      },
    });
  });

  const readProbes = () => page.evaluate(() => (window as unknown as { probes: Probe[] }).probes);
  await expect.poll(async () => (await readProbes()).length).toBeGreaterThan(0);
  const probe = (await readProbes()).at(-1)!;

  expect(await page.evaluate(() => window.chart.pane().ids())).toContain('probe');
  expect(probe.paneId).toBe('probe');
  expect(probe.width).toBeGreaterThan(0);
  expect(probe.height).toBeGreaterThan(0);
  // Price 1 is above price 0, so it sits higher on the screen (a smaller y).
  expect(probe.y1).toBeLessThan(probe.y0);
  expect(probe.from).toBeGreaterThanOrEqual(0);
  expect(probe.to).toBeGreaterThanOrEqual(probe.from);
});

test('removing a custom pane takes it out of the stack and stops its drawing', async ({ page }) => {
  opened = await openPage(page, 'fscandle.js');
  await build(page);

  await page.evaluate(() => {
    const w = window as unknown as { probes: unknown[] };
    w.probes = [];
    window.chart.addCustomPane({ id: 'probe', draw: () => { w.probes.push(1); } });
  });
  const count = () => page.evaluate(() => (window as unknown as { probes: unknown[] }).probes.length);
  await expect.poll(count).toBeGreaterThan(0);

  expect(await page.evaluate(() => window.chart.removeCustomPane('probe'))).toBe(true);
  expect(await page.evaluate(() => window.chart.pane().ids())).not.toContain('probe');

  const before = await count();
  await page.evaluate(() => window.chart.update());
  await page.waitForTimeout(150);
  expect(await count()).toBe(before);

  expect(await page.evaluate(() => window.chart.removeCustomPane('probe'))).toBe(false);
});

test('a draw callback that throws is reported once and the rest of the chart keeps drawing', async ({ page }) => {
  opened = await openPage(page, 'fscandle.js');
  await build(page);

  await page.evaluate(() => {
    const w = window as unknown as { throws: number; goodDraws: number };
    w.throws = 0;
    w.goodDraws = 0;
    window.chart.addCustomPane({
      id: 'bad',
      draw: () => {
        w.throws += 1;
        throw new Error('boom');
      },
    });
    window.chart.addCustomPane({ id: 'good', draw: () => { w.goodDraws += 1; } });
  });

  await expect.poll(() => page.evaluate(() => (window as unknown as { goodDraws: number }).goodDraws)).toBeGreaterThan(0);
  for (let i = 0; i < 3; i++) await page.evaluate(() => window.chart.update());
  await page.waitForTimeout(150);

  expect(await page.evaluate(() => (window as unknown as { throws: number }).throws)).toBe(1);
  await expect.poll(() => opened.warnings.filter(text => text.includes('custom pane "bad"')).length).toBe(1);
  expect(await page.evaluate(() => window.chart.pane().ids())).toEqual(expect.arrayContaining(['bad', 'good']));
});

test('the main pane and an id already in use are rejected', async ({ page }) => {
  opened = await openPage(page, 'fscandle.js');
  await build(page);

  const outcomes = await page.evaluate(() => {
    const attempt = (options: { id?: string }) => {
      try {
        window.chart.addCustomPane({ draw: () => {}, ...options });
        return 'added';
      } catch {
        return 'threw';
      }
    };
    return {
      main: attempt({ id: 'main' }),
      first: attempt({ id: 'dup' }),
      second: attempt({ id: 'dup' }),
    };
  });
  expect(outcomes).toEqual({ main: 'threw', first: 'added', second: 'threw' });
});

test('a chart that loads a saved state with a custom pane keeps its pane weights in step with its panes', async ({ page }) => {
  opened = await openPage(page, 'fscandle.js');
  await build(page, 'custom-pane-weights');

  await page.evaluate(() => {
    window.chart.addCustomPane({ id: 'probe', draw: () => {} });
    window.chart.saveState();
  });

  const loaded = await page.evaluate(() => {
    const host = document.createElement('div');
    host.style.width = '900px';
    host.style.height = '500px';
    document.body.appendChild(host);
    const second = window.fscandle.createChart(host, { persistence: { enabled: true, key: 'custom-pane-weights' } } as never);
    second.addCandlestickSeries();
    second.setData(window.chart.getData() as never);
    return { ids: second.pane().ids(), weights: second.pane().weights() };
  });
  expect(loaded.weights.length).toBe(loaded.ids.length);
});
