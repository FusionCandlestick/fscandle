import { BaseSeries } from './BaseSeries';
import { CoordinateTransformer } from './CoordinateTransformer';

export interface BaselineSeriesOptions {
  baseValue?: number;
  topLineColor: string;
  bottomLineColor: string;
  topFillColor: string;
  bottomFillColor: string;
  lineWidth: number;
}

export class BaselineSeries extends BaseSeries<BaselineSeriesOptions> {
  constructor(options: Partial<BaselineSeriesOptions> = {}) {
    super({
      topLineColor: '#089981',
      bottomLineColor: '#f23645',
      topFillColor: 'rgba(8, 153, 129, 0.35)',
      bottomFillColor: 'rgba(242, 54, 69, 0.35)',
      lineWidth: 2.5,
      ...options,
    } as BaselineSeriesOptions);
  }

  public updateOptions(options: Partial<BaselineSeriesOptions>): void {
    this._options = { ...this._options, ...options };
  }

  public render(ctx: CanvasRenderingContext2D, transformer: CoordinateTransformer): void {
    const len = this._data.length;
    if (len === 0) return;

    let baseValue = this._options.baseValue;
    if (baseValue === undefined) {
      baseValue = this._data[0].open ?? this._data[0].close;
    }

    const baseY = transformer.priceToY(baseValue);
    const firstX = transformer.indexToX(0);
    const lastX = transformer.indexToX(len - 1);
    const minX = Math.min(firstX, lastX) - 20;
    const maxX = Math.max(firstX, lastX) + 20;
    const chartWidth = Math.max(10, maxX - minX);

    // Build the continuous line path
    const buildPricePath = () => {
      const path = new Path2D();
      path.moveTo(transformer.indexToX(0), transformer.priceToY(this._data[0].close));
      for (let i = 1; i < len; i++) {
        path.lineTo(transformer.indexToX(i), transformer.priceToY(this._data[i].close));
      }
      return path;
    };

    // Build the area polygon anchored at baseY
    const buildAreaPath = () => {
      const path = new Path2D();
      path.moveTo(transformer.indexToX(0), baseY);
      for (let i = 0; i < len; i++) {
        path.lineTo(transformer.indexToX(i), transformer.priceToY(this._data[i].close));
      }
      path.lineTo(transformer.indexToX(len - 1), baseY);
      path.closePath();
      return path;
    };

    const pricePath = buildPricePath();
    const areaPath = buildAreaPath();

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // --- 1. TOP HALF (Above baseline: y <= baseY in Canvas space) ---
    ctx.save();
    ctx.beginPath();
    ctx.rect(minX, 0, chartWidth, Math.max(0, baseY));
    ctx.clip();

    const topGrad = ctx.createLinearGradient(0, 0, 0, baseY);
    topGrad.addColorStop(0, this._options.topFillColor);
    topGrad.addColorStop(1, 'rgba(8, 153, 129, 0.02)');
    ctx.fillStyle = topGrad;
    ctx.fill(areaPath);

    ctx.strokeStyle = this._options.topLineColor;
    ctx.lineWidth = this._options.lineWidth;
    ctx.stroke(pricePath);
    ctx.restore();

    // --- 2. BOTTOM HALF (Below baseline: y > baseY in Canvas space) ---
    const bottomClipHeight = 10000;
    ctx.save();
    ctx.beginPath();
    ctx.rect(minX, baseY, chartWidth, bottomClipHeight);
    ctx.clip();

    const botGrad = ctx.createLinearGradient(0, baseY, 0, baseY + 300);
    botGrad.addColorStop(0, 'rgba(242, 54, 69, 0.02)');
    botGrad.addColorStop(1, this._options.bottomFillColor);
    ctx.fillStyle = botGrad;
    ctx.fill(areaPath);

    ctx.strokeStyle = this._options.bottomLineColor;
    ctx.lineWidth = this._options.lineWidth;
    ctx.stroke(pricePath);
    ctx.restore();

    // --- 3. BASELINE DASHED REFERENCE LINE ---
    ctx.save();
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.65)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(minX, baseY);
    ctx.lineTo(maxX, baseY);
    ctx.stroke();
    ctx.restore();

    ctx.restore();
  }
}
