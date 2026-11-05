import type { KLineData } from '../types';
import type { IndicatorResultRow, IndicatorTemplate } from './Indicator';

/**
 * Channel and trend indicators: Donchian, Keltner, SuperTrend and Ichimoku.
 *
 * Each returns one row per input bar, with NaN where the indicator has no value
 * yet, as the other built-in templates do. Rolling extremes use a monotonic
 * deque, so every calculation is linear in the number of bars.
 */

/** Highest value of `values` over each trailing window of `period`, NaN until the window fills. */
export function rollingMax(values: number[], period: number): number[] {
  return rollingExtreme(values, period, (a, b) => a >= b);
}

/** Lowest value of `values` over each trailing window of `period`, NaN until the window fills. */
export function rollingMin(values: number[], period: number): number[] {
  return rollingExtreme(values, period, (a, b) => a <= b);
}

function rollingExtreme(values: number[], period: number, keeps: (candidate: number, existing: number) => boolean): number[] {
  const out = new Array<number>(values.length).fill(NaN);
  const window: number[] = []; // indices, their values monotonic from front to back
  for (let i = 0; i < values.length; i += 1) {
    while (window.length > 0 && keeps(values[i], values[window[window.length - 1]])) window.pop();
    window.push(i);
    if (window[0] <= i - period) window.shift();
    if (i >= period - 1) out[i] = values[window[0]];
  }
  return out;
}

/** True range of each bar; the first bar has no previous close, so it is its own range. */
export function trueRange(data: KLineData[]): number[] {
  return data.map((bar, i) => {
    if (i === 0) return bar.high - bar.low;
    const previousClose = data[i - 1].close;
    return Math.max(bar.high - bar.low, Math.abs(bar.high - previousClose), Math.abs(bar.low - previousClose));
  });
}

/** Wilder's average true range: a simple mean of the first `period` ranges, then smoothed. */
export function wilderAtr(data: KLineData[], period: number): number[] {
  const ranges = trueRange(data);
  const out = new Array<number>(data.length).fill(NaN);
  if (period <= 0 || data.length < period) return out;
  let sum = 0;
  for (let i = 0; i < period; i += 1) sum += ranges[i];
  out[period - 1] = sum / period;
  for (let i = period; i < data.length; i += 1) {
    out[i] = (out[i - 1] * (period - 1) + ranges[i]) / period;
  }
  return out;
}

/** Exponential moving average seeded with the simple mean of the first `period` values. */
export function ema(values: number[], period: number): number[] {
  const out = new Array<number>(values.length).fill(NaN);
  if (period <= 0 || values.length < period) return out;
  const k = 2 / (period + 1);
  let sum = 0;
  for (let i = 0; i < period; i += 1) sum += values[i];
  out[period - 1] = sum / period;
  for (let i = period; i < values.length; i += 1) {
    out[i] = values[i] * k + out[i - 1] * (1 - k);
  }
  return out;
}

const positive = (value: number | undefined, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;

/** Donchian channel: the highest high and lowest low over `period` bars, and their midpoint. */
export const DonchianTemplate: IndicatorTemplate = {
  name: 'Donchian Channels',
  shortName: 'DC',
  calcParams: [20],
  figures: [
    { key: 'upper', type: 'line', title: 'Upper' },
    { key: 'middle', type: 'line', title: 'Middle' },
    { key: 'lower', type: 'line', title: 'Lower' },
  ],
  calc: (dataList, params) => {
    const period = Math.round(positive(params[0], 20));
    const upper = rollingMax(dataList.map(bar => bar.high), period);
    const lower = rollingMin(dataList.map(bar => bar.low), period);
    return dataList.map((_, i): IndicatorResultRow => ({
      upper: upper[i],
      middle: (upper[i] + lower[i]) / 2,
      lower: lower[i],
    }));
  },
};

/** Keltner channel: an EMA of the close, with bands `multiplier` ATRs above and below. */
export const KeltnerTemplate: IndicatorTemplate = {
  name: 'Keltner Channels',
  shortName: 'KC',
  calcParams: [20, 10, 2],
  figures: [
    { key: 'upper', type: 'line', title: 'Upper' },
    { key: 'middle', type: 'line', title: 'Middle' },
    { key: 'lower', type: 'line', title: 'Lower' },
  ],
  calc: (dataList, params) => {
    const emaPeriod = Math.round(positive(params[0], 20));
    const atrPeriod = Math.round(positive(params[1], 10));
    const multiplier = positive(params[2], 2);
    const middle = ema(dataList.map(bar => bar.close), emaPeriod);
    const atr = wilderAtr(dataList, atrPeriod);
    return dataList.map((_, i): IndicatorResultRow => ({
      upper: middle[i] + multiplier * atr[i],
      middle: middle[i],
      lower: middle[i] - multiplier * atr[i],
    }));
  },
};

/**
 * SuperTrend: ATR bands around the bar midpoint that only tighten while the
 * trend holds, and a direction that flips when the close crosses the active
 * band. The line is split into `up` and `down`, each NaN while the other trend
 * is in force, so the two draw in different colours.
 */
export const SuperTrendTemplate: IndicatorTemplate = {
  name: 'SuperTrend',
  shortName: 'SUPERTREND',
  calcParams: [10, 3],
  figures: [
    { key: 'up', type: 'line', title: 'Up' },
    { key: 'down', type: 'line', title: 'Down' },
  ],
  calc: (dataList, params) => {
    const period = Math.round(positive(params[0], 10));
    const multiplier = positive(params[1], 3);
    const atr = wilderAtr(dataList, period);
    const result: IndicatorResultRow[] = [];
    let finalUpper = NaN;
    let finalLower = NaN;
    let uptrend = true;
    for (let i = 0; i < dataList.length; i += 1) {
      const bar = dataList[i];
      if (!Number.isFinite(atr[i])) {
        result.push({ up: NaN, down: NaN });
        continue;
      }
      const mid = (bar.high + bar.low) / 2;
      const basicUpper = mid + multiplier * atr[i];
      const basicLower = mid - multiplier * atr[i];
      const previousClose = i > 0 ? dataList[i - 1].close : bar.close;
      const first = !Number.isFinite(finalUpper);
      finalUpper = first || basicUpper < finalUpper || previousClose > finalUpper ? basicUpper : finalUpper;
      finalLower = first || basicLower > finalLower || previousClose < finalLower ? basicLower : finalLower;
      if (first) {
        uptrend = bar.close >= mid;
      } else if (uptrend && bar.close < finalLower) {
        uptrend = false;
      } else if (!uptrend && bar.close > finalUpper) {
        uptrend = true;
      }
      result.push(uptrend ? { up: finalLower, down: NaN } : { up: NaN, down: finalUpper });
    }
    return result;
  },
};

/**
 * Ichimoku Kinko Hyo. Tenkan and Kijun are the midpoints of the high-low range
 * over their periods. Senkou A (their average) and Senkou B (the midpoint over
 * the longest period) are plotted `displacement` bars ahead, so the value on a
 * bar was computed `displacement` bars earlier; ahead of the last bar there are
 * no rows to hold them. Chikou is the close plotted `displacement` bars back,
 * so the last `displacement` rows have none.
 */
export const IchimokuTemplate: IndicatorTemplate = {
  name: 'Ichimoku Cloud',
  shortName: 'ICHIMOKU',
  calcParams: [9, 26, 52],
  figures: [
    { key: 'tenkan', type: 'line', title: 'Tenkan' },
    { key: 'kijun', type: 'line', title: 'Kijun' },
    { key: 'senkouA', type: 'line', title: 'Senkou A' },
    { key: 'senkouB', type: 'line', title: 'Senkou B' },
    { key: 'chikou', type: 'line', title: 'Chikou' },
  ],
  calc: (dataList, params) => {
    const conversion = Math.round(positive(params[0], 9));
    const base = Math.round(positive(params[1], 26));
    const span = Math.round(positive(params[2], 52));
    const displacement = base;
    const highs = dataList.map(bar => bar.high);
    const lows = dataList.map(bar => bar.low);
    const midpoint = (period: number) => {
      const hi = rollingMax(highs, period);
      const lo = rollingMin(lows, period);
      return hi.map((h, i) => (h + lo[i]) / 2);
    };
    const tenkan = midpoint(conversion);
    const kijun = midpoint(base);
    const spanB = midpoint(span);
    return dataList.map((_, i): IndicatorResultRow => {
      const source = i - displacement;
      const ahead = i + displacement;
      return {
        tenkan: tenkan[i],
        kijun: kijun[i],
        senkouA: source >= 0 ? (tenkan[source] + kijun[source]) / 2 : NaN,
        senkouB: source >= 0 ? spanB[source] : NaN,
        chikou: ahead < dataList.length ? dataList[ahead].close : NaN,
      };
    });
  },
};
