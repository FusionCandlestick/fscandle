import { BaseSeries } from './BaseSeries';
import { CandlestickStyleOptions, DeepPartial } from '../types/options';
import { CoordinateTransformer } from './CoordinateTransformer';
import { KLineData } from '../types';

const defaultHAOptions: CandlestickStyleOptions = {
  upColor: '#26a69a',
  downColor: '#ef5350',
  wickVisible: true,
  borderVisible: true,
  borderColor: '#378658',
  borderUpColor: '#26a69a',
  borderDownColor: '#ef5350',
  wickColor: '#737375',
  wickUpColor: '#26a69a',
  wickDownColor: '#ef5350',
};

export class HeikinAshiSeries extends BaseSeries<CandlestickStyleOptions> {
  private _haData: KLineData[] = [];

  constructor(options: DeepPartial<CandlestickStyleOptions> = {}) {
    super({ ...defaultHAOptions, ...options } as CandlestickStyleOptions);
  }

  public updateOptions(options: DeepPartial<CandlestickStyleOptions>) {
    this._options = { ...this._options, ...options } as CandlestickStyleOptions;
  }

  public setData(data: KLineData[]) {
    this._data = data;
    this._haData = this._calculateHA(data);
  }

  public getSnapData(index: number): KLineData | null {
    if (index < 0 || index >= this._haData.length) return null;
    return this._haData[index];
  }

  private _calculateHA(data: KLineData[]): KLineData[] {
    const ha: KLineData[] = [];
    let prevHA: KLineData | null = null;

    data.forEach((d) => {
      const haClose = (d.open + d.high + d.low + d.close) / 4;
      const haOpen = prevHA ? (prevHA.open + prevHA.close) / 2 : (d.open + d.close) / 2;
      const haHigh = Math.max(d.high, haOpen, haClose);
      const haLow = Math.min(d.low, haOpen, haClose);

      const haItem = {
        ...d,
        open: haOpen,
        high: haHigh,
        low: haLow,
        close: haClose
      };
      ha.push(haItem);
      prevHA = haItem;
    });

    return ha;
  }

  public render(ctx: CanvasRenderingContext2D, transformer: CoordinateTransformer) {
    const { upColor, downColor, wickVisible, borderVisible } = this._options;
    const barSpacing = transformer.getBarSpacing();
    const candleWidth = Math.max(1, barSpacing * 0.8);

    this._haData.forEach((d, i) => {
      const x = transformer.indexToX(i);
      const openY = transformer.priceToY(d.open);
      const closeY = transformer.priceToY(d.close);
      const highY = transformer.priceToY(d.high);
      const lowY = transformer.priceToY(d.low);
      
      const isUp = d.close >= d.open;
      const bodyColor = isUp ? upColor : downColor;
      const borderColor = isUp ? (this._options.borderUpColor || upColor) : (this._options.borderDownColor || downColor);
      const wickColor = isUp ? (this._options.wickUpColor || upColor) : (this._options.wickDownColor || downColor);
      
      const bodyHeight = Math.max(0.5, Math.abs(closeY - openY));
      const bodyY = Math.min(openY, closeY);

      // 1. Wick
      if (wickVisible) {
        ctx.strokeStyle = wickColor;
        ctx.beginPath();
        ctx.moveTo(x, highY);
        ctx.lineTo(x, bodyY);
        ctx.moveTo(x, bodyY + bodyHeight);
        ctx.lineTo(x, lowY);
        ctx.stroke();
      }
      
      // 2. Body
      ctx.fillStyle = bodyColor;
      ctx.fillRect(x - candleWidth / 2, bodyY, candleWidth, bodyHeight);

      if (borderVisible) {
        ctx.strokeStyle = borderColor;
        ctx.strokeRect(x - candleWidth / 2, bodyY, candleWidth, bodyHeight);
      }
    });
  }
}
