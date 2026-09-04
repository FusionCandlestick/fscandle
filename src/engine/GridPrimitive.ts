import type { ChartPrimitive, PrimitiveContext, PrimitivePaneRenderParams } from './Primitive';
import { CoordinateTransformer } from './CoordinateTransformer';
import { GridOptions } from '../types/options';

/** Built-in grid implemented on the sole extension architecture: primitives. */
export class GridPrimitive implements ChartPrimitive {
  public readonly id = 'builtin:grid';
  private _context!: PrimitiveContext;

  public attached(context: PrimitiveContext) {
    this._context = context;
  }

  public paneViews() {
    return [{
      layer: 'grid' as const,
      zOrder: -1000,
      renderer: () => ({
        draw: (ctx: CanvasRenderingContext2D, params: PrimitivePaneRenderParams) => {
          const options = params.chart.getOptions().grid;
          this._renderGrid(ctx, params.viewport.width, params.viewport.height, params.transformer, options);
        },
      }),
    }];
  }

  private _renderGrid(ctx: CanvasRenderingContext2D, width: number, height: number, transformer: CoordinateTransformer, options: GridOptions) {
    const { vertLines, horzLines } = options;
    ctx.lineWidth = 1;

    // --- Horizontal lines ---
    const horzYs: number[] = [];
    if (horzLines.visible) {
      const { min, max } = this._context.chart.getVisiblePriceBoundsForTransformer(transformer, height);
      const range = max - min;
      if (range > 0) {
        const roughStep = range / 6;
        const exponent = Math.floor(Math.log10(Math.max(roughStep, 1e-10)));
        const fraction = roughStep / Math.pow(10, exponent);
        let niceFraction: number;
        if (fraction < 1.5) niceFraction = 1;
        else if (fraction < 3) niceFraction = 2;
        else if (fraction < 7) niceFraction = 5;
        else niceFraction = 10;
        const step = niceFraction * Math.pow(10, exponent);
        const startPrice = Math.ceil(min / step) * step;
        for (let price = startPrice; price <= max; price += step) {
          const y = transformer.priceToY(price);
          if (y >= 0 && y <= height) horzYs.push(y);
        }
      }

      horzYs.forEach((y, idx) => {
        ctx.globalAlpha = idx % 2 === 0 ? 0.9 : 0.55;
        ctx.strokeStyle = horzLines.color;
        if (horzLines.style === 'dashed') ctx.setLineDash([4, 4]);
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
        ctx.setLineDash([]);
      });
      ctx.globalAlpha = 1;
    }

    // --- Vertical lines ---
    if (vertLines.visible) {
      const data = this._context.series.getData();
      if (data.length > 0) {
        const leftIdx = Math.max(0, Math.floor(transformer.xToIndex(0)));
        const rightIdx = Math.min(data.length - 1, Math.ceil(transformer.xToIndex(width)));
        const count = rightIdx - leftIdx;
        const step = Math.max(1, Math.floor(count / 8));
        
        ctx.strokeStyle = vertLines.color;
        if (vertLines.style === 'dashed') ctx.setLineDash([4, 4]);
        for (let i = leftIdx; i <= rightIdx; i += step) {
          const x = transformer.indexToX(i);
          ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
        }
        ctx.setLineDash([]);
      }
    }
  }
}

