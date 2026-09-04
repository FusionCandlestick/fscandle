import { BaseSeries } from './BaseSeries';
import { CoordinateTransformer } from './CoordinateTransformer';

export interface AreaSeriesOptions {
  lineColor: string;
  lineWidth: number;
  topColor: string;
  bottomColor: string;
}

export class AreaSeries extends BaseSeries<AreaSeriesOptions> {
  constructor(options: Partial<AreaSeriesOptions> = {}) {
    super({
      lineColor: '#2962FF',
      lineWidth: 2,
      topColor: 'rgba(41, 98, 255, 0.3)',
      bottomColor: 'rgba(41, 98, 255, 0)',
      ...options
    } as AreaSeriesOptions);
  }

  public updateOptions(options: Partial<AreaSeriesOptions>): void {
    this._options = { ...this._options, ...options };
  }

  public render(ctx: CanvasRenderingContext2D, transformer: CoordinateTransformer): void {
    const data = this._data;
    if (data.length === 0) return;

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const height = transformer.getHeight();

    // 1. Draw Area Gradient
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, this._options.topColor);
    gradient.addColorStop(1, this._options.bottomColor);

    ctx.beginPath();
    let firstX = 0;
    data.forEach((d, i) => {
      const x = transformer.indexToX(i);
      const y = transformer.priceToY(d.close);
      if (i === 0) {
        ctx.moveTo(x, y);
        firstX = x;
      } else {
        ctx.lineTo(x, y);
      }
    });

    const lastX = transformer.indexToX(data.length - 1);
    ctx.lineTo(lastX, height);
    ctx.lineTo(firstX, height);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    // 2. Draw Main Line
    ctx.beginPath();
    data.forEach((d, i) => {
      const x = transformer.indexToX(i);
      const y = transformer.priceToY(d.close);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = this._options.lineColor;
    ctx.lineWidth = this._options.lineWidth;
    ctx.stroke();

    ctx.restore();
  }
}
