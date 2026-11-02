import { expect, test, type Page } from '@playwright/test';

import { BASE_TIME, makeBars, MINUTE, openPage, type OpenedPage } from './harness';

/** Open the page and build a chart with a main series and `bars` loaded. */
async function chartPage(page: Page, options: Record<string, unknown> = {}, bars = makeBars(120)): Promise<OpenedPage> {
  const opened = await openPage(page, 'fscandle.js');
  await page.evaluate(([data, chartOptions]) => {
    const chart = window.fscandle.createChart(document.getElementById('chart') as HTMLDivElement, {
      persistence: { enabled: false },
      ...chartOptions,
    });
    chart.addCandlestickSeries();
    chart.setData(data);
    window.chart = chart;
  }, [bars, options] as const);
  return opened;
}

/** A two-point line overlay, ready for createOverlay. */
const lineAt = (value: number) => ({
  type: 'line',
  points: [{ timestamp: BASE_TIME + 10 * MINUTE, value }, { timestamp: BASE_TIME + 40 * MINUTE, value: value + 2 }],
  color: '#e879f9',
  lineWidth: 2,
});

let opened: OpenedPage;
test.afterEach(() => {
  expect(opened.errors, 'no uncaught errors in the page').toEqual([]);
});

test.describe('data', () => {
  test('setData sorts bars and getData returns them', async ({ page }) => {
    const bars = makeBars(5);
    opened = await chartPage(page, {}, [bars[3], bars[0], bars[4], bars[1], bars[2]]);
    const timestamps = await page.evaluate(() => window.chart.getData().map(bar => bar.timestamp));
    expect(timestamps).toEqual(bars.map(bar => bar.timestamp));
  });

  test('updateData appends a newer bar and replaces one with the same timestamp', async ({ page }) => {
    opened = await chartPage(page, {}, makeBars(10));
    const result = await page.evaluate(([base, minute]) => {
      const chart = window.chart;
      chart.updateData({ timestamp: base + 10 * minute, open: 1, high: 2, low: 0.5, close: 1.5, volume: 1 });
      chart.updateData({ timestamp: base + 10 * minute, open: 1, high: 3, low: 0.5, close: 2.5, volume: 2 });
      const data = chart.getData();
      return { count: data.length, lastClose: data[data.length - 1].close };
    }, [BASE_TIME, MINUTE] as const);
    expect(result).toEqual({ count: 11, lastClose: 2.5 });
  });
});

test.describe('overlays', () => {
  test('ids stay unique when overlays are created in the same millisecond (regression)', async ({ page }) => {
    opened = await chartPage(page);
    const result = await page.evaluate(line => {
      const chart = window.chart;
      const realNow = Date.now;
      Date.now = () => 1_800_000_000_000;
      try {
        const a = chart.createOverlay(line);
        const b = chart.createOverlay(line);
        chart.removeOverlay(a.id);
        const c = chart.createOverlay(line);
        chart.removeOverlay(c.id);
        return { distinct: b.id !== c.id, remaining: chart.getOverlays().map(o => o.id), b: b.id };
      } finally {
        Date.now = realNow;
      }
    }, lineAt(104));
    expect(result.distinct).toBe(true);
    expect(result.remaining).toEqual([result.b]);
  });

  test('updateOverlay changes the stored overlay, and change events report each step', async ({ page }) => {
    opened = await chartPage(page);
    const result = await page.evaluate(line => {
      const chart = window.chart;
      const reasons: string[] = [];
      const unsubscribe = chart.subscribeOverlayChange(event => reasons.push(event.reason));
      const overlay = chart.createOverlay(line);
      chart.updateOverlay(overlay.id, { color: '#00ff00' });
      const color = chart.getOverlays().find(o => o.id === overlay.id)?.color;
      chart.removeOverlay(overlay.id);
      unsubscribe();
      return { color, reasons };
    }, lineAt(104));
    expect(result.color).toBe('#00ff00');
    expect(result.reasons).toEqual(['created', 'updated', 'removed']);
  });

  test('undo and redo keep overlay callbacks (regression)', async ({ page }) => {
    opened = await chartPage(page);
    const result = await page.evaluate(line => {
      const chart = window.chart;
      chart.createOverlay({ ...line, id: 'kept', onClick: () => {} });
      chart.createOverlay({ ...line, id: 'later' });
      chart.undo();
      const afterUndo = chart.getOverlays();
      chart.redo();
      const afterRedo = chart.getOverlays();
      return {
        undoIds: afterUndo.map(o => o.id),
        undoCallback: typeof afterUndo.find(o => o.id === 'kept')?.onClick,
        redoIds: afterRedo.map(o => o.id),
        redoCallback: typeof afterRedo.find(o => o.id === 'kept')?.onClick,
      };
    }, lineAt(104));
    expect(result).toEqual({
      undoIds: ['kept'],
      undoCallback: 'function',
      redoIds: ['kept', 'later'],
      redoCallback: 'function',
    });
  });
});

test.describe('importing drawings', () => {
  test('a drawing export round-trips through importOverlaysJSON', async ({ page }) => {
    opened = await chartPage(page);
    const ids = await page.evaluate(line => {
      const chart = window.chart;
      chart.createOverlay({ ...line, id: 'one' });
      chart.createOverlay({ ...line, id: 'two' });
      const exported = JSON.stringify({ drawingLayers: chart.getDrawingLayers(), activeDrawingLayerId: chart.getActiveDrawingLayerId() });
      chart.clearOverlays();
      chart.importOverlaysJSON(exported);
      return chart.getOverlays().map(o => o.id);
    }, lineAt(104));
    expect(ids).toEqual(['one', 'two']);
  });

  test('an imported id cannot inject a handler into the toolbar (regression)', async ({ page }) => {
    opened = await chartPage(page);
    await page.evaluate(line => {
      (window as unknown as { pwned?: number }).pwned = 0;
      window.chart.importOverlaysJSON(JSON.stringify({
        overlays: [{ ...line, id: 'x" onmouseover="window.pwned=1" data-z="', type: '<img src=x onerror="window.pwned=2">' }],
      }));
    }, lineAt(104));
    const chip = page.locator('.fscandle-toolbar-remove[data-kind="overlay"]');
    await expect(chip).toHaveCount(1);
    expect(await chip.getAttribute('onmouseover')).toBeNull();
    await chip.hover();
    expect(await page.evaluate(() => (window as unknown as { pwned?: number }).pwned)).toBe(0);
    expect(await page.locator('img[src="x"], img[src="X"]').count()).toBe(0);
  });

  test('overlays that cannot be drawn are skipped, and invalid input changes nothing (regression)', async ({ page }) => {
    opened = await chartPage(page);
    const result = await page.evaluate(line => {
      const chart = window.chart;
      chart.createOverlay({ ...line, id: 'existing' });
      chart.importOverlaysJSON(JSON.stringify({ overlays: [{ ...line, id: 'good' }, { id: 'no-points', type: 'line' }] }));
      const afterPartial = chart.getOverlays().map(o => o.id);
      const thrown: string[] = [];
      for (const input of ['null', '42', '{"overlays":[{"id":"x"}]}', '{"something":"else"}']) {
        try {
          chart.importOverlaysJSON(input);
        } catch (error) {
          thrown.push(input);
        }
      }
      return { afterPartial, afterInvalid: chart.getOverlays().map(o => o.id), thrown: thrown.length };
    }, lineAt(104));
    expect(result.afterPartial).toEqual(['good']);
    expect(result.afterInvalid).toEqual(['good']);
    expect(result.thrown).toBe(4);
    expect(opened.warnings.some(text => text.includes('Skipped 1 imported drawing'))).toBe(true);
  });

  test('a malformed overlay in saved state no longer breaks loading (regression)', async ({ page }) => {
    opened = await openPage(page, 'fscandle.js');
    const result = await page.evaluate(([bars, line]) => {
      localStorage.setItem('broken-state', JSON.stringify({
        version: 4,
        options: {},
        drawingLayers: [{ id: 'l', name: 'L', createdAt: 1, updatedAt: 1, overlays: [{ id: 'bad', type: 'line' }, { ...line, id: 'fine' }] }],
        activeDrawingLayerId: 'l',
      }));
      const chart = window.fscandle.createChart(document.getElementById('chart') as HTMLDivElement, {
        persistence: { enabled: true, key: 'broken-state' },
      });
      chart.addCandlestickSeries();
      chart.setData(bars);
      window.chart = chart;
      return chart.getOverlays().map(o => o.id);
    }, [makeBars(60), lineAt(104)] as const);
    await page.evaluate(() => new Promise(requestAnimationFrame));
    expect(result).toEqual(['fine']);
  });
});

test.describe('price lines and markers', () => {
  test('price lines can be created, updated, removed and cleared', async ({ page }) => {
    opened = await chartPage(page);
    const result = await page.evaluate(() => {
      const chart = window.chart;
      const tp = chart.createPriceLine({ price: 106, title: 'TP' });
      chart.createPriceLine({ id: 'sl', price: 96, title: 'SL' });
      chart.updatePriceLine(tp.id, { price: 107 });
      const updated = chart.priceLines().find(line => line.id === tp.id)?.price;
      chart.removePriceLine('sl');
      const afterRemove = chart.priceLines().length;
      chart.clearPriceLines();
      return { updated, afterRemove, afterClear: chart.priceLines().length };
    });
    expect(result).toEqual({ updated: 107, afterRemove: 1, afterClear: 0 });
  });

  test('markers are stored by timestamp and can be cleared', async ({ page }) => {
    opened = await chartPage(page);
    const result = await page.evaluate(([base, minute]) => {
      const chart = window.chart;
      chart.setMarkers([{ timestamp: base + 100 * minute, text: 'B' }, { timestamp: base + 110 * minute, text: 'S' }]);
      const stored = chart.markers().map(m => m.text);
      chart.clearMarkers();
      return { stored, afterClear: chart.markers().length };
    }, [BASE_TIME, MINUTE] as const);
    expect(result).toEqual({ stored: ['B', 'S'], afterClear: 0 });
  });
});

test.describe('options and scales', () => {
  test('getOptions returns a copy that cannot change the chart', async ({ page }) => {
    opened = await chartPage(page);
    const visible = await page.evaluate(() => {
      const chart = window.chart;
      (chart.getOptions() as { crosshair: { visible: boolean } }).crosshair.visible = false;
      return chart.getOptions().crosshair.visible;
    });
    expect(visible).toBe(true);
  });

  test('applyOptions merges into the current options', async ({ page }) => {
    opened = await chartPage(page);
    const options = await page.evaluate(() => {
      const chart = window.chart;
      chart.applyOptions({ crosshair: { color: '#123456' } });
      const current = chart.getOptions();
      return { color: current.crosshair.color, visible: current.crosshair.visible };
    });
    expect(options).toEqual({ color: '#123456', visible: true });
  });

  test('the price scale converts prices to pixels and back', async ({ page }) => {
    opened = await chartPage(page);
    await page.evaluate(() => new Promise(requestAnimationFrame));
    const price = await page.evaluate(() => {
      const scale = window.chart.priceScale();
      return scale.coordinateToPrice(scale.priceToCoordinate(103.5));
    });
    expect(price).toBeCloseTo(103.5, 6);
  });

  test('the visible logical range can be set, read back, and observed', async ({ page }) => {
    opened = await chartPage(page);
    const result = await page.evaluate(() => {
      const timeScale = window.chart.timeScale();
      const seen: Array<{ from: number; to: number }> = [];
      const unsubscribe = timeScale.subscribeVisibleLogicalRangeChange(range => seen.push(range));
      timeScale.setVisibleLogicalRange({ from: 40, to: 80 });
      const range = timeScale.getVisibleLogicalRange();
      unsubscribe();
      return { range, notified: seen.length > 0 };
    });
    expect(result.range?.from).toBeCloseTo(40, 0);
    // The setter puts `to` where the right margin starts; the getter reads the
    // plot's full right edge. So the range read back ends a little past 80,
    // and a get-then-set round trip widens it by the margin each time.
    expect(result.range?.to).toBeGreaterThan(80);
    expect(result.range?.to).toBeLessThan(80 + 0.1 * 40);
    expect(result.notified).toBe(true);
  });
});

test.describe('lifecycle', () => {
  test('destroy empties the container, and later calls do not throw', async ({ page }) => {
    opened = await chartPage(page);
    const childCount = await page.evaluate(() => {
      const chart = window.chart;
      chart.destroy();
      chart.update();
      chart.applyOptions({ crosshair: { visible: false } });
      return document.getElementById('chart')?.childElementCount;
    });
    await page.evaluate(() => new Promise(requestAnimationFrame));
    expect(childCount).toBe(0);
  });
});
