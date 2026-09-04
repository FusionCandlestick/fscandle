import { BaseSeries } from './BaseSeries';
import { DeepPartial } from '../types/options';
import { CoordinateTransformer } from './CoordinateTransformer';

export type StepLinePosition = 'before' | 'middle' | 'after';

export interface StepLineStyleOptions {
  color: string;
  lineWidth: number;
  /**
   * Where the vertical riser sits relative to the two bars it connects.
   * `after` holds the previous value until the next bar (default, matches
   * Lightweight Charts' step line), `before` jumps at the previous bar, and
   * `middle` splits the gap.
   */
  stepPosition: StepLinePosition;
  /** Optional fill under the step path. */
  areaColor: string | null;
}

const defaultStepLineOptions: StepLineStyleOptions = {
  color: '#2196f3',
  lineWidth: 2,
  stepPosition: 'after',
  areaColor: null,
};

export class StepLineSeries extends BaseSeries<StepLineStyleOptions> {
  constructor(options: DeepPartial<StepLineStyleOptions> = {}) {
    super({ ...defaultStepLineOptions, ...options } as StepLineStyleOptions);
  }

  public updateOptions(options: DeepPartial<StepLineStyleOptions>) {
    this._options = { ...this._options, ...options } as StepLineStyleOptions;
  }

  /**
   * Build the step path points. Exposed for tests and for primitives that want
   * to reuse the same geometry without re-rendering.
   */
  public buildStepPath(transformer: CoordinateTransformer): Array<{ x: number; y: number }> {
    const points: Array<{ x: number; y: number }> = [];
    if (this._data.length === 0) return points;

    const { stepPosition } = this._options;

    for (let i = 0; i < this._data.length; i++) {
      const x = transformer.indexToX(i);
      const y = transformer.priceToY(this._data[i].close);

      if (i === 0) {
        points.push({ x, y });
        continue;
      }

      const prev = points[points.length - 1];

      if (stepPosition === 'after') {
        // hold previous value across the gap, then rise at this bar
        points.push({ x, y: prev.y });
      } else if (stepPosition === 'before') {
        // rise at the previous bar, then hold to this bar
        points.push({ x: prev.x, y });
      } else {
        const midX = (prev.x + x) / 2;
        points.push({ x: midX, y: prev.y });
        points.push({ x: midX, y });
      }

      points.push({ x, y });
    }

    return points;
  }

  public render(ctx: CanvasRenderingContext2D, transformer: CoordinateTransformer) {
    const points = this.buildStepPath(transformer);
    if (points.length === 0) return;

    const { color, lineWidth, areaColor } = this._options;

    if (areaColor) {
      const height = transformer.getHeight();
      ctx.beginPath();
      ctx.moveTo(points[0].x, height);
      points.forEach(p => ctx.lineTo(p.x, p.y));
      ctx.lineTo(points[points.length - 1].x, height);
      ctx.closePath();
      ctx.fillStyle = areaColor;
      ctx.fill();
    }

    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.lineJoin = 'miter';
    points.forEach((p, i) => {
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.stroke();
  }

  public autoscale() {
    // A scan, not `Math.min(...closes)`: the spread throws past ~120,000
    // arguments, so this was a chart that refused to open at 200,000 bars.
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    for (const bar of this._data) {
      if (!Number.isFinite(bar.close)) continue;
      if (bar.close < min) min = bar.close;
      if (bar.close > max) max = bar.close;
    }
    return min === Number.POSITIVE_INFINITY ? null : { min, max };
  }
}
