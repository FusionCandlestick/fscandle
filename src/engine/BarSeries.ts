import { BaseSeries } from './BaseSeries';
import { CoordinateTransformer } from './CoordinateTransformer';

export interface BarSeriesOptions {
  upColor: string;
  downColor: string;
  lineWidth: number;
}

export class BarSeries extends BaseSeries<BarSeriesOptions> {
  constructor(options: Partial<BarSeriesOptions> = {}) {
    super({
      upColor: '#26a69a',
      downColor: '#ef5350',
      lineWidth: 2,
      ...options
    } as BarSeriesOptions);
  }

  public updateOptions(options: Partial<BarSeriesOptions>): void {
    this._options = { ...this._options, ...options };
  }

  public render(ctx: CanvasRenderingContext2D, transformer: CoordinateTransformer): void {
    const data = this._data;
    if (data.length === 0) return;

    const barSpacing = transformer.getBarSpacing();
    const tickLength = barSpacing * 0.4;

    data.forEach((d, i) => {
      const x = transformer.indexToX(i);
      const isUp = d.close >= d.open;
      ctx.strokeStyle = isUp ? this._options.upColor : this._options.downColor;
      ctx.lineWidth = this._options.lineWidth;

      const yHigh = transformer.priceToY(d.high);
      const yLow = transformer.priceToY(d.low);
      const yOpen = transformer.priceToY(d.open);
      const yClose = transformer.priceToY(d.close);

      // 1. High-Low Line
      ctx.beginPath();
      ctx.moveTo(x, yHigh);
      ctx.lineTo(x, yLow);
      ctx.stroke();

      // 2. Open Tick (Left)
      ctx.beginPath();
      ctx.moveTo(x - tickLength, yOpen);
      ctx.lineTo(x, yOpen);
      ctx.stroke();

      // 3. Close Tick (Right)
      ctx.beginPath();
      ctx.moveTo(x, yClose);
      ctx.lineTo(x + tickLength, yClose);
      ctx.stroke();
    });
  }
}
