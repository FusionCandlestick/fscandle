import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { Page } from '@playwright/test';

import type { FusionCandlestickChart } from '../../src/FusionCandlestickChart';
import type { KLineData } from '../../src/types';

/** Where global-setup writes the bundles. */
export const ARTIFACTS = path.resolve('tests/browser/.artifacts');

/**
 * A fake origin, served from disk by route(). A page loaded from about:blank or
 * file:// has no usable localStorage, and persistence is part of what is tested.
 */
const ORIGIN = 'http://fscandle.test';

declare global {
  interface Window {
    fscandle: typeof import('../../src/index');
    chart: FusionCandlestickChart;
  }
}

export interface OpenedPage {
  /** Uncaught errors thrown in the page. Tests expect this to stay empty. */
  errors: string[];
  /** Console warnings, for the cases where warning is the expected behaviour. */
  warnings: string[];
}

export async function openPage(
  page: Page,
  bundle: 'fscandle.js' | 'react.js',
  body = '<div id="chart" style="width:900px;height:500px"></div>',
): Promise<OpenedPage> {
  const opened: OpenedPage = { errors: [], warnings: [] };
  page.on('pageerror', error => opened.errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'warning') opened.warnings.push(message.text());
  });
  await page.route(`${ORIGIN}/**`, route => {
    const { pathname } = new URL(route.request().url());
    if (pathname === '/') {
      return route.fulfill({
        contentType: 'text/html',
        body: `<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0">${body}<script src="/${bundle}"></script></body></html>`,
      });
    }
    return route.fulfill({ contentType: 'text/javascript', body: readFileSync(path.join(ARTIFACTS, path.basename(pathname))) });
  });
  await page.goto(`${ORIGIN}/`);
  return opened;
}

export const BASE_TIME = 1_700_000_000_000;
export const MINUTE = 60_000;

/** `count` one-minute bars on a gentle wave around 100. */
export function makeBars(count: number): KLineData[] {
  return Array.from({ length: count }, (_, i) => {
    const open = 100 + Math.sin(i / 8) * 6;
    const close = open + Math.sin(i / 3);
    return {
      timestamp: BASE_TIME + i * MINUTE,
      open,
      close,
      high: Math.max(open, close) + 1,
      low: Math.min(open, close) - 1,
      volume: 100 + i,
    };
  });
}
