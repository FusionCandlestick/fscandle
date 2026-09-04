import { KLineData, Bounding, IndicatorFigure } from '../types';
import { CoordinateTransformer } from '../engine/CoordinateTransformer';
import { visibleIndexRange, type IndexRange } from '../model/visibleRange';
import { defaultOptions, type IndicatorOptions } from '../types/options';
import {
  ADX,
  ATR,
  BollingerBands,
  CCI,
  EMA,
  MACD,
  OBV,
  PSAR,
  ROC,
  RSI,
  SMA,
  StochasticRSI,
  VWAP,
} from 'technicalindicators';

export type IndicatorResultRow = Record<string, number | null | undefined>;

export interface IndicatorRenderParams {
  ctx: CanvasRenderingContext2D;
  transformer: CoordinateTransformer;
  bounding: Bounding;
  dataList: KLineData[];
  result: IndicatorResultRow[];
  /**
   * Drawing style, from the chart's `indicators` options. Optional so a caller
   * driving an `Indicator` directly still gets the built-in look.
   */
  styles?: IndicatorOptions;
}

/** The look an indicator falls back to when no options were passed down. */
const BUILT_IN_INDICATOR_STYLES: IndicatorOptions = defaultOptions.indicators;

export interface IndicatorTemplate {
  name: string;
  shortName: string;
  calcParams: number[];
  figures: IndicatorFigure[];
  calc: (dataList: KLineData[], params: number[]) => IndicatorResultRow[];
}

export class Indicator {
  public id: string;
  public template: IndicatorTemplate;
  public result: IndicatorResultRow[] = [];

  constructor(id: string, template: IndicatorTemplate) {
    this.id = id;
    this.template = template;
  }

  /**
   * The indices worth drawing for this transformer.
   *
   * Series have culled to the viewport since `visibleIndexRange` existed;
   * indicators walked all 200,000 rows per figure per frame and let the canvas
   * throw the rest away. The same padding is used, for the same reason: the
   * bar just off screen still paints pixels on screen.
   */
  private _drawRange(transformer: CoordinateTransformer, result: IndicatorResultRow[]): IndexRange {
    return visibleIndexRange(x => transformer.xToIndex(x), transformer.getWidth(), result.length);
  }

  /**
   * The min and max of this indicator's figure values across an index range,
   * inclusive of both ends.
   *
   * Only the keys the template draws are read. The pane's y-scale used to call
   * `Object.values(row)` on every row of every indicator on every frame, which
   * allocated one throwaway array per bar to look at the same handful of
   * fields. Returns null when the range holds nothing finite.
   */
  public extent(startIndex: number, endIndex: number): { min: number; max: number } | null {
    let min = Infinity;
    let max = -Infinity;

    const from = Math.max(0, startIndex);
    const to = Math.min(this.result.length - 1, endIndex);

    for (let i = from; i <= to; i += 1) {
      const row = this.result[i];
      if (!row) continue;
      for (const figure of this.template.figures) {
        const value = row[figure.key];
        if (typeof value !== 'number' || !Number.isFinite(value)) continue;
        if (value < min) min = value;
        if (value > max) max = value;
      }
    }

    return min === Infinity ? null : { min, max };
  }

  public calc(dataList: KLineData[]) {
    this.result = this.template.calc(dataList, this.template.calcParams);
    return this.result;
  }

  public draw(params: IndicatorRenderParams) {
    const { ctx, transformer, result } = params;
    const styles = params.styles ?? BUILT_IN_INDICATOR_STYLES;
    this.template.figures.forEach(figure => {
      if (figure.type === 'line') {
        this._drawLine(ctx, transformer, result, figure, styles);
      } else if (figure.type === 'bar') {
        this._drawBar(ctx, transformer, result, figure, styles);
      } else if (figure.type === 'circle') {
        this._drawCircle(ctx, transformer, result, figure, styles);
      }
    });
  }

  /** Colour for a figure: its own if the template names one, else by position. */
  private _figureColor(figure: IndicatorFigure, styles: IndicatorOptions): string {
    const palette = styles.palette.length > 0 ? styles.palette : BUILT_IN_INDICATOR_STYLES.palette;
    const index = this.template.figures.indexOf(figure);
    return palette[index % palette.length];
  }

  private _drawLine(ctx: CanvasRenderingContext2D, transformer: CoordinateTransformer, result: IndicatorResultRow[], figure: IndicatorFigure, styles: IndicatorOptions) {
    ctx.beginPath();
    ctx.lineWidth = styles.lineWidth;
    ctx.strokeStyle = this._figureColor(figure, styles);

    let started = false;
    const { start, end } = this._drawRange(transformer, result);
    for (let i = start; i <= end; i++) {
      const val = result[i][figure.key];
      if (val === undefined || val === null || isNaN(val)) {
        started = false;
        continue;
      }

      const x = transformer.indexToX(i);
      const y = transformer.priceToY(val);

      if (!started) {
        ctx.moveTo(x, y);
        started = true;
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();
  }

  private _drawBar(ctx: CanvasRenderingContext2D, transformer: CoordinateTransformer, result: IndicatorResultRow[], figure: IndicatorFigure, styles: IndicatorOptions) {
    const barSpacing = transformer.getBarSpacing();
    const barWidth = barSpacing * 0.5;
    const baseValue = figure.baseValue ?? 0;
    const baseY = transformer.priceToY(baseValue);

    const { start, end } = this._drawRange(transformer, result);
    for (let i = start; i <= end; i++) {
      const val = result[i][figure.key];
      if (val === undefined || val === null || isNaN(val)) continue;

      const x = transformer.indexToX(i);
      const y = transformer.priceToY(val);
      
      const isUp = val >= baseValue;
      ctx.fillStyle = isUp ? styles.barUpColor : styles.barDownColor;
      ctx.fillRect(x - barWidth / 2, y, barWidth, baseY - y);
    }
  }

  private _drawCircle(ctx: CanvasRenderingContext2D, transformer: CoordinateTransformer, result: IndicatorResultRow[], figure: IndicatorFigure, styles: IndicatorOptions) {
    // Set explicitly: this used to inherit whatever fill the previous figure
    // left on the context, so a circle figure after a histogram was drawn in
    // the histogram's last bar colour.
    ctx.fillStyle = this._figureColor(figure, styles);
    const { start, end } = this._drawRange(transformer, result);
    for (let i = start; i <= end; i++) {
      const val = result[i][figure.key];
      if (val === undefined || val === null || isNaN(val)) continue;
      const x = transformer.indexToX(i);
      const y = transformer.priceToY(val);
      ctx.beginPath();
      ctx.arc(x, y, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

const emptyFigureValue = (figures: IndicatorFigure[]) => {
  return figures.reduce((acc, figure) => {
    acc[figure.key] = NaN;
    return acc;
  }, {} as Record<string, number>);
};

const padIndicatorResult = <T>(
  dataLength: number,
  values: T[],
  mapper: (value: T) => Record<string, number>,
  emptyValue: Record<string, number>
) => {
  const diff = Math.max(0, dataLength - values.length);
  const result: IndicatorResultRow[] = [];
  for (let i = 0; i < diff; i++) result.push({ ...emptyValue });
  values.forEach(value => result.push(mapper(value)));
  return result;
};

const getOhlcv = (dataList: KLineData[]) => ({
  high: dataList.map(d => d.high),
  low: dataList.map(d => d.low),
  close: dataList.map(d => d.close),
  volume: dataList.map(d => d.volume ?? 0),
});

/**
 * High/low of the `period`-bar window ending at `endIndex` (inclusive).
 *
 * A scan rather than `Math.min(...window.map(...))`: `period` is a user
 * parameter, so the spread's ~120,000-argument ceiling is reachable by
 * configuration, and each call also built two throwaway arrays per bar.
 * Shared by KDJ and Williams %R, which both need this window.
 */
const windowHighLow = (dataList: KLineData[], endIndex: number, period: number) => {
  let low = Number.POSITIVE_INFINITY;
  let high = Number.NEGATIVE_INFINITY;
  for (let j = endIndex - period + 1; j <= endIndex; j += 1) {
    const candidate = dataList[j];
    if (candidate.low < low) low = candidate.low;
    if (candidate.high > high) high = candidate.high;
  }
  return { high, low };
};

// Example: Moving Average Template
export const MATemplate: IndicatorTemplate = {
  name: 'Moving Average',
  shortName: 'MA',
  calcParams: [5],
  figures: [{ key: 'ma', type: 'line' }],
  calc: (dataList, params) => {
    const period = params[0] || 5;
    const values = dataList.map(d => d.close);
    const smaVals = SMA.calculate({ period, values });

    const diff = dataList.length - smaVals.length;
    const result: IndicatorResultRow[] = [];
    for(let i=0; i<diff; i++) result.push({ ma: NaN });
    for(let i=0; i<smaVals.length; i++) result.push({ ma: smaVals[i] });
    return result;
  }
};

// Example: EMA Template
export const EMATemplate: IndicatorTemplate = {
  name: 'Exponential Moving Average',
  shortName: 'EMA',
  calcParams: [20],
  figures: [{ key: 'ema', type: 'line' }],
  calc: (dataList, params) => {
    const period = params[0] || 20;
    const values = dataList.map(d => d.close);
    const emaVals = EMA.calculate({ period, values });
    
    const diff = dataList.length - emaVals.length;
    const result: IndicatorResultRow[] = [];
    for(let i=0; i<diff; i++) result.push({ ema: NaN });
    for(let i=0; i<emaVals.length; i++) result.push({ ema: emaVals[i] });
    return result;
  }
};

// Example: Bollinger Bands Template
export const BOLLTemplate: IndicatorTemplate = {
  name: 'Bollinger Bands',
  shortName: 'BOLL',
  calcParams: [20, 2],
  figures: [
    { key: 'mid', type: 'line' },
    { key: 'up', type: 'line' },
    { key: 'dn', type: 'line' }
  ],
  calc: (dataList, params) => {
    const period = params[0] || 20;
    const stdDev = params[1] || 2;
    const values = dataList.map(d => d.close);
    const bollVals = BollingerBands.calculate({ period, stdDev, values });
    
    const diff = dataList.length - bollVals.length;
    const result: IndicatorResultRow[] = [];
    for(let i=0; i<diff; i++) result.push({ mid: NaN, up: NaN, dn: NaN });
    for(let i=0; i<bollVals.length; i++) {
       const b = bollVals[i];
       result.push({ mid: b.middle, up: b.upper, dn: b.lower });
    }
    return result;
  }
};

// Example: MACD Template
export const MACDTemplate: IndicatorTemplate = {
  name: 'MACD',
  shortName: 'MACD',
  calcParams: [12, 26, 9],
  figures: [
    { key: 'dif', type: 'line' },
    { key: 'dea', type: 'line' },
    { key: 'macd', type: 'bar', baseValue: 0 }
  ],
  calc: (dataList, params) => {
    const fastPeriod = params[0] || 12;
    const slowPeriod = params[1] || 26;
    const signalPeriod = params[2] || 9;
    const values = dataList.map(d => d.close);
    
    const macdVals = MACD.calculate({ 
        values, 
        fastPeriod, 
        slowPeriod, 
        signalPeriod, 
        SimpleMAOscillator: false, 
        SimpleMASignal: false 
    });
    
    const diff = dataList.length - macdVals.length;
    const result: IndicatorResultRow[] = [];
    for(let i=0; i<diff; i++) result.push({ dif: NaN, dea: NaN, macd: NaN });
    for(let i=0; i<macdVals.length; i++) {
       const m = macdVals[i];
       result.push({ dif: m.MACD, dea: m.signal, macd: m.histogram });
    }
    return result;
  }
};

// Example: RSI Template
export const RSITemplate: IndicatorTemplate = {
  name: 'Relative Strength Index',
  shortName: 'RSI',
  calcParams: [14],
  figures: [{ key: 'rsi', type: 'line' }],
  calc: (dataList, params) => {
    const period = params[0] || 14;
    const values = dataList.map(d => d.close);
    const rsiVals = RSI.calculate({ period, values });
    
    const diff = dataList.length - rsiVals.length;
    const result: IndicatorResultRow[] = [];
    for(let i=0; i<diff; i++) result.push({ rsi: NaN });
    for(let i=0; i<rsiVals.length; i++) result.push({ rsi: rsiVals[i] });
    return result;
  }
};

// KDJ Template
export const KDJTemplate: IndicatorTemplate = {
  name: 'KDJ',
  shortName: 'KDJ',
  calcParams: [9, 3, 3],
  figures: [
    { key: 'k', type: 'line' },
    { key: 'd', type: 'line' },
    { key: 'j', type: 'line' }
  ],
  calc: (dataList, params) => {
    const period = params[0] || 9;
    const kPeriod = params[1] || 3;
    const dPeriod = params[2] || 3;
    
    // Manual calculation of KDJ (Simplified)
    const result: IndicatorResultRow[] = [];
    let k = 50;
    let d = 50;
    
    for (let i = 0; i < dataList.length; i++) {
        if (i < period - 1) {
            result.push({ k: NaN, d: NaN, j: NaN });
            continue;
        }
        
        const { high, low } = windowHighLow(dataList, i, period);
        const rsv = high === low ? 0 : ((dataList[i].close - low) / (high - low)) * 100;
        
        k = ((kPeriod - 1) * k + rsv) / kPeriod;
        d = ((dPeriod - 1) * d + k) / dPeriod;
        const j = 3 * k - 2 * d;
        
        result.push({ k, d, j });
    }
    return result;
  }
};

// Williams %R Template
export const WRTemplate: IndicatorTemplate = {
  name: 'Williams %R',
  shortName: 'WR',
  calcParams: [14],
  figures: [{ key: 'wr', type: 'line' }],
  calc: (dataList, params) => {
    const period = params[0] || 14;
    const result: IndicatorResultRow[] = [];
    
    for (let i = 0; i < dataList.length; i++) {
        if (i < period - 1) {
            result.push({ wr: NaN });
            continue;
        }
        const { high, low } = windowHighLow(dataList, i, period);
        const wr = high === low ? 0 : ((high - dataList[i].close) / (high - low)) * -100;
        result.push({ wr });
    }
    return result;
  }
};

// Volume MA Template
export const VOLMATemplate: IndicatorTemplate = {
  name: 'Volume MA',
  shortName: 'VOLMA',
  calcParams: [5, 10],
  figures: [
    { key: 'ma5', type: 'line' },
    { key: 'ma10', type: 'line' }
  ],
  calc: (dataList, params) => {
    const p1 = params[0] || 5;
    const p2 = params[1] || 10;
    const volumes = dataList.map(d => d.volume ?? 0);
    
    const ma5 = SMA.calculate({ period: p1, values: volumes });
    const ma10 = SMA.calculate({ period: p2, values: volumes });
    
    const result: IndicatorResultRow[] = [];
    for (let i = 0; i < dataList.length; i++) {
        const v5 = i >= p1 - 1 ? ma5[i - p1 + 1] : NaN;
        const v10 = i >= p2 - 1 ? ma10[i - p2 + 1] : NaN;
        result.push({ ma5: v5, ma10: v10 });
    }
    return result;
  }
};

export const ATRTemplate: IndicatorTemplate = {
  name: 'Average True Range',
  shortName: 'ATR',
  calcParams: [14],
  figures: [{ key: 'atr', type: 'line' }],
  calc: (dataList, params) => {
    const period = params[0] || 14;
    const { high, low, close } = getOhlcv(dataList);
    const values = ATR.calculate({ high, low, close, period });
    return padIndicatorResult(dataList.length, values, value => ({ atr: value }), { atr: NaN });
  }
};

export const ADXTemplate: IndicatorTemplate = {
  name: 'Average Directional Index',
  shortName: 'ADX',
  calcParams: [14],
  figures: [
    { key: 'adx', type: 'line' },
    { key: 'pdi', type: 'line' },
    { key: 'mdi', type: 'line' }
  ],
  calc: (dataList, params) => {
    const period = params[0] || 14;
    const { high, low, close } = getOhlcv(dataList);
    const values = ADX.calculate({ high, low, close, period });
    return padIndicatorResult(dataList.length, values, value => ({
      adx: value.adx,
      pdi: value.pdi,
      mdi: value.mdi
    }), emptyFigureValue(ADXTemplate.figures));
  }
};

export const ROCTemplate: IndicatorTemplate = {
  name: 'Rate of Change',
  shortName: 'ROC',
  calcParams: [12],
  figures: [{ key: 'roc', type: 'line' }],
  calc: (dataList, params) => {
    const period = params[0] || 12;
    const values = ROC.calculate({ period, values: dataList.map(d => d.close) });
    return padIndicatorResult(dataList.length, values, value => ({ roc: value }), { roc: NaN });
  }
};

export const CCITemplate: IndicatorTemplate = {
  name: 'Commodity Channel Index',
  shortName: 'CCI',
  calcParams: [20],
  figures: [{ key: 'cci', type: 'line' }],
  calc: (dataList, params) => {
    const period = params[0] || 20;
    const { high, low, close } = getOhlcv(dataList);
    const values = CCI.calculate({ high, low, close, period });
    return padIndicatorResult(dataList.length, values, value => ({ cci: value }), { cci: NaN });
  }
};

export const OBVTemplate: IndicatorTemplate = {
  name: 'On Balance Volume',
  shortName: 'OBV',
  calcParams: [],
  figures: [{ key: 'obv', type: 'line' }],
  calc: dataList => {
    const { close, volume } = getOhlcv(dataList);
    const values = OBV.calculate({ close, volume });
    return padIndicatorResult(dataList.length, values, value => ({ obv: value }), { obv: NaN });
  }
};

export const VWAPTemplate: IndicatorTemplate = {
  name: 'Volume Weighted Average Price',
  shortName: 'VWAP',
  calcParams: [],
  figures: [{ key: 'vwap', type: 'line' }],
  calc: dataList => {
    const { high, low, close, volume } = getOhlcv(dataList);
    const values = VWAP.calculate({ high, low, close, volume });
    return padIndicatorResult(dataList.length, values, value => ({ vwap: value }), { vwap: NaN });
  }
};

export const StochasticRSITemplate: IndicatorTemplate = {
  name: 'Stochastic RSI',
  shortName: 'STOCHRSI',
  calcParams: [14, 14, 3, 3],
  figures: [
    { key: 'stochRSI', type: 'line' },
    { key: 'k', type: 'line' },
    { key: 'd', type: 'line' }
  ],
  calc: (dataList, params) => {
    const rsiPeriod = params[0] || 14;
    const stochasticPeriod = params[1] || 14;
    const kPeriod = params[2] || 3;
    const dPeriod = params[3] || 3;
    const values = StochasticRSI.calculate({
      values: dataList.map(d => d.close),
      rsiPeriod,
      stochasticPeriod,
      kPeriod,
      dPeriod,
    });
    return padIndicatorResult(dataList.length, values, value => ({
      stochRSI: value.stochRSI,
      k: value.k,
      d: value.d
    }), emptyFigureValue(StochasticRSITemplate.figures));
  }
};

export const PSARTemplate: IndicatorTemplate = {
  name: 'Parabolic SAR',
  shortName: 'PSAR',
  calcParams: [0.02, 0.2],
  figures: [{ key: 'psar', type: 'circle' }],
  calc: (dataList, params) => {
    const step = params[0] || 0.02;
    const max = params[1] || 0.2;
    const { high, low } = getOhlcv(dataList);
    const values = PSAR.calculate({ high, low, step, max });
    return padIndicatorResult(dataList.length, values, value => ({ psar: value }), { psar: NaN });
  }
};

export const DEFAULT_INDICATOR_TEMPLATES: IndicatorTemplate[] = [
  MATemplate,
  EMATemplate,
  BOLLTemplate,
  MACDTemplate,
  RSITemplate,
  KDJTemplate,
  WRTemplate,
  VOLMATemplate,
  ATRTemplate,
  ADXTemplate,
  ROCTemplate,
  CCITemplate,
  OBVTemplate,
  VWAPTemplate,
  StochasticRSITemplate,
  PSARTemplate,
];
