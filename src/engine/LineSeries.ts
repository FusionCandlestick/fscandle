import { BaseSeries } from './BaseSeries';
import { DeepPartial } from '../types/options';
import { CoordinateTransformer } from './CoordinateTransformer';

export interface LineStyleOptions {
  color: string;
  lineWidth: number;
}

const defaultLineOptions: LineStyleOptions = {
  color: '#2196f3',
  lineWidth: 2,
};

export class LineSeries extends BaseSeries<LineStyleOptions> {
  constructor(options: DeepPartial<LineStyleOptions> = {}) {
    super({ ...defaultLineOptions, ...options } as LineStyleOptions);
  }

  public updateOptions(options: DeepPartial<LineStyleOptions>) {
    this._options = { ...this._options, ...options } as LineStyleOptions;
  }

  public render(ctx: CanvasRenderingContext2D, transformer: CoordinateTransformer) {
    if (this._data.length === 0) return;
    
    const { color, lineWidth } = this._options;

    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.lineJoin = 'round';

    let started = false;
    this._data.forEach((d, i) => {
      const x = transformer.indexToX(i);
      const y = transformer.priceToY(d.close);

      if (!started) {
        ctx.moveTo(x, y);
        started = true;
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.stroke();
  }
}
