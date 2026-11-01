/**
 * Human-readable labels for series, indicators and overlays, used by the
 * toolbar and legend. Pure: the translator is passed in.
 */

import { AreaSeries } from '../engine/AreaSeries';
import { BarSeries } from '../engine/BarSeries';
import type { BaseSeries } from '../engine/BaseSeries';
import { BaselineSeries } from '../engine/BaselineSeries';
import { CandlestickSeries } from '../engine/CandlestickSeries';
import { HeikinAshiSeries } from '../engine/HeikinAshiSeries';
import { HollowCandlestickSeries } from '../engine/HollowCandlestickSeries';
import { LineSeries } from '../engine/LineSeries';
import { StepLineSeries } from '../engine/StepLineSeries';
import { VolumeSeries } from '../engine/VolumeSeries';
import type { TranslationKey } from '../i18n';
import type { Indicator } from '../plugins/Indicator';

/** The subset of the i18n object the labels need. */
export type Translate = (key: TranslationKey) => string;

/**
 * Turn an identifier such as `value_area` or `ema` into display text. Short
 * all-letter names read as acronyms (`EMA`); anything else is title-cased.
 */
export function formatToolbarLabel(value: string): string {
  const normalized = value.replace(/_/g, ' ').trim();
  if (/^[a-z]{1,5}$/i.test(normalized)) {
    return normalized.toUpperCase();
  }
  return normalized.replace(/\b\w/g, char => char.toUpperCase());
}

/** Label for a series, from its concrete class. Unknown classes fall back to their name. */
export function seriesDisplayLabel(series: BaseSeries, t: Translate): string {
  if (series instanceof CandlestickSeries) return t('series.candle');
  if (series instanceof HollowCandlestickSeries) return t('series.hollowCandles');
  if (series instanceof HeikinAshiSeries) return t('series.ha');
  if (series instanceof BarSeries) return t('series.bar');
  if (series instanceof AreaSeries) return t('series.area');
  if (series instanceof BaselineSeries) return t('series.baseline');
  if (series instanceof StepLineSeries) return t('series.step');
  if (series instanceof LineSeries) return t('series.line');
  if (series instanceof VolumeSeries) return t('series.volume');
  return formatToolbarLabel(series.constructor.name.replace(/Series$/, ''));
}

/** Short name plus its numeric parameters, such as `MA 5/20`. */
export function indicatorDisplayLabel(indicator: Pick<Indicator, 'template'>): string {
  const numericParams = indicator.template.calcParams.filter(param => typeof param === 'number');
  if (numericParams.length === 0) return indicator.template.shortName;
  return `${indicator.template.shortName} ${numericParams.join('/')}`;
}

/**
 * Translated name for an overlay type. Falls back to the formatted identifier
 * when no translation exists.
 */
export function overlayDisplayLabel(type: string, t: Translate): string {
  const key = `overlay.${type}` as TranslationKey;
  const translated = t(key);
  return translated === key ? formatToolbarLabel(type) : translated;
}

/** The first candidate that is a string, for reading a colour from options that may omit it. */
export function pickSeriesColor(...candidates: Array<unknown>): string {
  for (const candidate of candidates) {
    if (typeof candidate === 'string') return candidate;
  }
  return '#ffffff';
}
