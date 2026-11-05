import { expect, test } from '@playwright/test';

import { makeBars, openPage, type OpenedPage } from './harness';

let opened: OpenedPage;
test.afterEach(() => {
  expect(opened.errors).toEqual([]);
});

test('takeScreenshot returns a PNG of the whole chart, with the candles in it', async ({ page }) => {
  opened = await openPage(page, 'fscandle.js');
  const result = await page.evaluate(async data => {
    const chart = window.fscandle.createChart(document.getElementById('chart') as HTMLDivElement, { persistence: { enabled: false } } as never);
    chart.addCandlestickSeries();
    chart.setData(data as never);
    chart.createIndicator('RSI', { newPane: true });
    await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
    const url = await chart.takeScreenshot();
    const img = new Image();
    await new Promise(resolve => { img.onload = resolve; img.src = url; });
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    const pixels = ctx.getImageData(0, 0, img.width, img.height).data;
    const background = [pixels[0], pixels[1], pixels[2]].join();
    let differing = 0;
    for (let i = 0; i < pixels.length; i += 4) if ([pixels[i], pixels[i + 1], pixels[i + 2]].join() !== background) differing += 1;
    const box = document.getElementById('chart')!;
    return { prefix: url.slice(0, 22), width: img.width, height: img.height, cssWidth: box.clientWidth, cssHeight: box.clientHeight, dpr: window.devicePixelRatio, drawnShare: differing / (pixels.length / 4) };
  }, makeBars(200));
  expect(result.prefix).toBe('data:image/png;base64,');
  expect(result.width).toBe(Math.round(result.cssWidth * result.dpr));
  expect(result.height).toBe(Math.round(result.cssHeight * result.dpr));
  expect(result.drawnShare).toBeGreaterThan(0.02);
});
