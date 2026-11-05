import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  DonchianTemplate,
  ema,
  IchimokuTemplate,
  KeltnerTemplate,
  rollingMax,
  rollingMin,
  SuperTrendTemplate,
  wilderAtr,
} from '../../src/plugins/trendIndicators';
import type { KLineData } from '../../src/types';

const MINUTE = 60_000;

function series(count: number): KLineData[] {
  const bars: KLineData[] = [];
  let price = 100;
  for (let i = 0; i < count; i += 1) {
    const open = price;
    price = Math.max(1, price + Math.sin(i / 7) * 1.3 + Math.cos(i / 3) * 0.5);
    bars.push({ timestamp: i * MINUTE, open, high: Math.max(open, price) + 0.2 + (i % 5) * 0.1, low: Math.min(open, price) - 0.2 - (i % 3) * 0.1, close: price, volume: 100 });
  }
  return bars;
}

const close = (a: number, b: number) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b));

describe('rollingMax / rollingMin', () => {
  it('match a brute-force window scan', () => {
    const values = series(300).map(bar => bar.close);
    for (const period of [1, 2, 9, 52]) {
      const max = rollingMax(values, period);
      const min = rollingMin(values, period);
      for (let i = 0; i < values.length; i += 1) {
        if (i < period - 1) {
          assert.ok(Number.isNaN(max[i]) && Number.isNaN(min[i]), `NaN before the window fills (${period}, ${i})`);
          continue;
        }
        const window = values.slice(i - period + 1, i + 1);
        assert.equal(max[i], Math.max(...window), `max ${period} at ${i}`);
        assert.equal(min[i], Math.min(...window), `min ${period} at ${i}`);
      }
    }
  });
});

describe('ema and wilderAtr', () => {
  it('seed with the simple mean of the first period and then smooth', () => {
    const values = [1, 2, 3, 4, 5, 6];
    const out = ema(values, 3);
    assert.ok(Number.isNaN(out[0]) && Number.isNaN(out[1]));
    assert.equal(out[2], 2);
    assert.ok(close(out[3], 4 * 0.5 + 2 * 0.5));
  });

  it('wilderAtr averages the first ranges, then smooths with (period - 1) / period', () => {
    const data = series(40);
    const atr = wilderAtr(data, 14);
    const range = (i: number) => (i === 0 ? data[0].high - data[0].low : Math.max(data[i].high - data[i].low, Math.abs(data[i].high - data[i - 1].close), Math.abs(data[i].low - data[i - 1].close)));
    let mean = 0;
    for (let i = 0; i < 14; i += 1) mean += range(i) / 14;
    assert.ok(close(atr[13], mean));
    assert.ok(close(atr[14], (mean * 13 + range(14)) / 14));
  });
});

describe('Donchian channels', () => {
  it('track the highest high and lowest low of the window, and their midpoint', () => {
    const data = series(120);
    const rows = DonchianTemplate.calc(data, [20]);
    assert.equal(rows.length, data.length);
    const i = 80;
    const window = data.slice(i - 19, i + 1);
    const upper = Math.max(...window.map(bar => bar.high));
    const lower = Math.min(...window.map(bar => bar.low));
    assert.equal(rows[i].upper, upper);
    assert.equal(rows[i].lower, lower);
    assert.equal(rows[i].middle, (upper + lower) / 2);
    assert.ok(Number.isNaN(rows[18].upper as number), 'no value before the window fills');
  });
});

describe('Keltner channels', () => {
  it('sit multiplier ATRs either side of the EMA', () => {
    const data = series(120);
    const rows = KeltnerTemplate.calc(data, [20, 10, 2]);
    const mid = ema(data.map(bar => bar.close), 20);
    const atr = wilderAtr(data, 10);
    for (const i of [19, 60, 119]) {
      assert.ok(close(rows[i].middle as number, mid[i]));
      assert.ok(close(rows[i].upper as number, mid[i] + 2 * atr[i]));
      assert.ok(close(rows[i].lower as number, mid[i] - 2 * atr[i]));
    }
  });
});

describe('SuperTrend', () => {
  /** Rises steadily for `rise` bars, then falls hard. */
  function riseThenFall(rise: number, fall: number): KLineData[] {
    const bars: KLineData[] = [];
    let price = 100;
    for (let i = 0; i < rise + fall; i += 1) {
      const open = price;
      price += i < rise ? 1 : -6;
      bars.push({ timestamp: i * MINUTE, open, high: Math.max(open, price) + 0.5, low: Math.min(open, price) - 0.5, close: price, volume: 1 });
    }
    return bars;
  }

  it('shows only the up line in a steady rise, with a lower band that never drops', () => {
    const rows = SuperTrendTemplate.calc(riseThenFall(60, 0), [10, 3]);
    let previous = -Infinity;
    for (let i = 9; i < rows.length; i += 1) {
      assert.ok(Number.isFinite(rows[i].up as number), `up at ${i}`);
      assert.ok(Number.isNaN(rows[i].down as number), `no down at ${i}`);
      assert.ok((rows[i].up as number) >= previous, `the band only tightens (${i})`);
      previous = rows[i].up as number;
    }
  });

  it('flips to the down line after a sharp fall', () => {
    const data = riseThenFall(60, 12);
    const rows = SuperTrendTemplate.calc(data, [10, 3]);
    const last = rows[rows.length - 1];
    assert.ok(Number.isNaN(last.up as number));
    assert.ok(Number.isFinite(last.down as number));
    assert.ok((last.down as number) > data[data.length - 1].close, 'the down line sits above price');
  });

  it('has no value before the ATR is available', () => {
    const rows = SuperTrendTemplate.calc(series(30), [10, 3]);
    for (let i = 0; i < 9; i += 1) {
      assert.ok(Number.isNaN(rows[i].up as number) && Number.isNaN(rows[i].down as number));
    }
  });
});

describe('Ichimoku', () => {
  it('computes each line from its definition', () => {
    const data = series(200);
    const rows = IchimokuTemplate.calc(data, [9, 26, 52]);
    const mid = (from: number, to: number) => {
      const window = data.slice(from, to + 1);
      return (Math.max(...window.map(bar => bar.high)) + Math.min(...window.map(bar => bar.low))) / 2;
    };
    const i = 150;
    assert.ok(close(rows[i].tenkan as number, mid(i - 8, i)));
    assert.ok(close(rows[i].kijun as number, mid(i - 25, i)));
    const source = i - 26;
    assert.ok(close(rows[i].senkouA as number, (mid(source - 8, source) + mid(source - 25, source)) / 2), 'senkou A is shifted forward');
    assert.ok(close(rows[i].senkouB as number, mid(source - 51, source)), 'senkou B is shifted forward');
    assert.equal(rows[i].chikou, data[i + 26].close, 'chikou is the close 26 bars later');
  });

  it('leaves chikou empty on the last 26 bars and senkou empty on the first', () => {
    const data = series(200);
    const rows = IchimokuTemplate.calc(data, [9, 26, 52]);
    for (let i = data.length - 26; i < data.length; i += 1) assert.ok(Number.isNaN(rows[i].chikou as number));
    for (let i = 0; i < 26; i += 1) assert.ok(Number.isNaN(rows[i].senkouA as number));
  });
});
