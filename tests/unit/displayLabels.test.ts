import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { AreaSeries } from '../../src/engine/AreaSeries';
import { CandlestickSeries } from '../../src/engine/CandlestickSeries';
import { VolumeSeries } from '../../src/engine/VolumeSeries';
import {
  formatToolbarLabel,
  indicatorDisplayLabel,
  overlayDisplayLabel,
  pickSeriesColor,
  seriesDisplayLabel,
} from '../../src/gui/displayLabels';
import type { Translate } from '../../src/gui/displayLabels';
import type { TranslationKey } from '../../src/i18n';
import type { Indicator } from '../../src/plugins/Indicator';
import type { BaseSeries } from '../../src/engine/BaseSeries';

/** A translator that knows only the keys listed; anything else echoes the key back. */
function translatorWith(dict: Record<string, string>): Translate {
  return (key: TranslationKey) => dict[key] ?? key;
}

describe('formatToolbarLabel', () => {
  it('reads short all-letter identifiers as acronyms', () => {
    assert.equal(formatToolbarLabel('ema'), 'EMA');
    assert.equal(formatToolbarLabel('macd'), 'MACD');
  });

  it('title-cases longer identifiers and turns underscores into spaces', () => {
    assert.equal(formatToolbarLabel('value_area'), 'Value Area');
    assert.equal(formatToolbarLabel('fibonacci_retracement'), 'Fibonacci Retracement');
  });

  it('keeps digits and trims surrounding whitespace', () => {
    assert.equal(formatToolbarLabel('  stacked_2 '), 'Stacked 2');
  });
});

describe('seriesDisplayLabel', () => {
  it('uses the translation for a known series class', () => {
    const t = translatorWith({ 'series.candle': 'Candles' });
    assert.equal(seriesDisplayLabel(new CandlestickSeries() as BaseSeries, t), 'Candles');
  });

  it('distinguishes subclasses that share a base class', () => {
    const t = translatorWith({ 'series.area': 'Area', 'series.volume': 'Volume' });
    assert.equal(seriesDisplayLabel(new AreaSeries({}) as BaseSeries, t), 'Area');
    assert.equal(seriesDisplayLabel(new VolumeSeries({}) as BaseSeries, t), 'Volume');
  });

  it('falls back to the class name, without its Series suffix, for unknown series', () => {
    class CustomSeries {}
    class CustomPlotSeries {}
    const t = translatorWith({});
    assert.equal(seriesDisplayLabel(new CustomSeries() as unknown as BaseSeries, t), 'Custom');
    assert.equal(seriesDisplayLabel(new CustomPlotSeries() as unknown as BaseSeries, t), 'CustomPlot');
  });
});

describe('indicatorDisplayLabel', () => {
  const indicator = (shortName: string, calcParams: Array<number | string>) =>
    ({ template: { shortName, calcParams } }) as unknown as Pick<Indicator, 'template'>;

  it('appends the numeric parameters, joined by slashes', () => {
    assert.equal(indicatorDisplayLabel(indicator('MA', [5, 20])), 'MA 5/20');
  });

  it('ignores non-numeric parameters', () => {
    assert.equal(indicatorDisplayLabel(indicator('MACD', [12, 'close', 26])), 'MACD 12/26');
  });

  it('shows just the short name when there are no numeric parameters', () => {
    assert.equal(indicatorDisplayLabel(indicator('VWAP', [])), 'VWAP');
  });
});

describe('overlayDisplayLabel', () => {
  it('uses the translation when there is one', () => {
    const t = translatorWith({ 'overlay.fibonacci': 'Fibonacci' });
    assert.equal(overlayDisplayLabel('fibonacci', t), 'Fibonacci');
  });

  it('formats the identifier when the translator has no entry for it', () => {
    assert.equal(overlayDisplayLabel('value_area', translatorWith({})), 'Value Area');
  });
});

describe('pickSeriesColor', () => {
  it('returns the first string candidate', () => {
    assert.equal(pickSeriesColor(undefined, 7, '#ff0000', '#00ff00'), '#ff0000');
  });

  it('falls back to white when no candidate is a string', () => {
    assert.equal(pickSeriesColor(undefined, null, 3), '#ffffff');
  });
});
