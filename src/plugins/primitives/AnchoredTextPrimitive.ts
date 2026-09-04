import type {
  ChartPrimitive,
  PrimitiveContext,
  PrimitiveHitTestResult,
  PrimitivePaneRenderer,
  PrimitivePriceAxisView,
} from '../../engine/Primitive';
import type { PrimitivePointerEventContext } from '../../engine/PointerEvents';
import { UI_FONT_FAMILY } from '../../model/fontFamily';

export interface AnchoredTextPrimitiveOptions {
  id?: string;
  timestamp: number;
  price: number;
  text: string;
  paneId?: string;
  color?: string;
  backgroundColor?: string;
  borderColor?: string;
  font?: string;
  padding?: number;
  axisLabelVisible?: boolean;
}

export class AnchoredTextPrimitive implements ChartPrimitive {
  public id: string;
  private _context: PrimitiveContext | null = null;
  private _options: Required<Omit<AnchoredTextPrimitiveOptions, 'id' | 'paneId'>> & { paneId: string };
  private _lastBounds: { x: number; y: number; width: number; height: number } | null = null;

  constructor(options: AnchoredTextPrimitiveOptions) {
    this.id = options.id ?? `anchored-text-${Date.now()}`;
    this._options = {
      timestamp: options.timestamp,
      price: options.price,
      text: options.text,
      paneId: options.paneId ?? 'main',
      color: options.color ?? '#ffffff',
      backgroundColor: options.backgroundColor ?? '#2563eb',
      borderColor: options.borderColor ?? '#93c5fd',
      font: options.font ?? `400 12px ${UI_FONT_FAMILY}`,
      padding: options.padding ?? 6,
      axisLabelVisible: options.axisLabelVisible ?? true,
    };
  }

  public attached(context: PrimitiveContext) {
    this._context = context;
  }

  public detached() {
    this._context = null;
    this._lastBounds = null;
  }

  public applyOptions(options: Partial<AnchoredTextPrimitiveOptions>) {
    this._options = {
      ...this._options,
      ...options,
      paneId: options.paneId ?? this._options.paneId,
    };
    this._context?.requestUpdate();
  }

  public paneViews() {
    return [{
      paneId: this._options.paneId,
      layer: 'overlay' as const,
      renderer: (): PrimitivePaneRenderer => ({
        draw: (ctx, params) => {
          const x = params.timeScale.timestampToCoordinate(this._options.timestamp);
          const y = params.transformer.priceToY(this._options.price);
          ctx.save();
          ctx.font = this._options.font;
          const padding = this._options.padding;
          const width = Math.max(32, ctx.measureText(this._options.text).width + padding * 2);
          const height = 22;
          const left = Math.max(2, Math.min(params.viewport.width - width - 2, x - width / 2));
          const top = Math.max(2, Math.min(params.viewport.height - height - 2, y - height - 10));
          this._lastBounds = { x: left, y: top, width, height };
          ctx.fillStyle = this._options.backgroundColor;
          this._roundRect(ctx, left, top, width, height, 5);
          ctx.fill();
          ctx.strokeStyle = this._options.borderColor;
          ctx.stroke();
          ctx.fillStyle = this._options.color;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(this._options.text, left + width / 2, top + height / 2);
          ctx.restore();
        },
      }),
    }];
  }

  public priceAxisViews(): PrimitivePriceAxisView[] {
    if (!this._options.axisLabelVisible) return [];
    return [{
      paneId: this._options.paneId,
      renderer: () => ({
        draw: (ctx, params) => {
          const y = params.transformer.priceToY(this._options.price);
          if (y < -12 || y > params.bounding.height + 12) return;
          const text = this._options.price.toFixed(2);
          ctx.save();
          ctx.font = `600 10px ${UI_FONT_FAMILY}`;
          ctx.fillStyle = this._options.backgroundColor;
          ctx.fillRect(0, Math.max(0, Math.min(params.bounding.height - 18, y - 9)), params.bounding.width, 18);
          ctx.fillStyle = this._options.color;
          ctx.textAlign = params.side === 'left' ? 'left' : 'right';
          ctx.textBaseline = 'middle';
          ctx.fillText(text, params.side === 'left' ? 4 : params.bounding.width - 4, Math.max(9, Math.min(params.bounding.height - 9, y)));
          ctx.restore();
        },
      }),
    }];
  }

  public hitTest(context: PrimitivePointerEventContext): PrimitiveHitTestResult | null {
    if (context.target !== 'chart' || context.pane?.id !== this._options.paneId || !this._lastBounds) return null;
    const x = context.chartX;
    const y = context.pane.localY;
    const bounds = this._lastBounds;
    const isHit = x >= bounds.x && x <= bounds.x + bounds.width && y >= bounds.y && y <= bounds.y + bounds.height;
    if (!isHit) return null;
    return {
      id: this.id,
      cursor: 'pointer',
      metadata: { type: 'anchored-text', text: this._options.text },
      zOrder: 10,
    };
  }

  public onPointerMove(context: PrimitivePointerEventContext, hit: PrimitiveHitTestResult | null) {
    if (!hit) return;
    context.setCursor(hit.cursor ?? 'pointer');
  }

  private _roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + width, y, x + width, y + height, radius);
    ctx.arcTo(x + width, y + height, x, y + height, radius);
    ctx.arcTo(x, y + height, x, y, radius);
    ctx.arcTo(x, y, x + width, y, radius);
    ctx.closePath();
  }
}
