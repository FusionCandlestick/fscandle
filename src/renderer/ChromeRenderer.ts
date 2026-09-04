import type { KLineData } from '../types';
import type { ChartOptions } from '../types/options';
import type { CoordinateTransformer } from '../engine/CoordinateTransformer';
import { getAxisRailColors } from './colors';

type AxisSide = 'left' | 'right';

export interface ExtremesParams {
  data: KLineData[];
  transformer: CoordinateTransformer;
  /** Pixel width used to pick the visible index range and label side. */
  chartWidth: number;
  formatPrice: (price: number) => string;
}

export interface PriceAxisBackgroundParams {
  width: number;
  height: number;
  /** Column position from the chart edge; odd columns get the stripe tint. */
  axisIndex: number;
  side: AxisSide;
}

export interface TimeAxisBackgroundParams {
  width: number;
  height: number;
  position: 'top' | 'bottom';
  leftAxisWidth: number;
  rightAxisWidth: number;
  stackedCount?: number;
}

/**
 * Draws the chart's non-data "chrome": watermark, crosshair, high/low extreme
 * callouts, and the axis rail backgrounds.
 *
 * Everything here is a pure function of its arguments plus the current
 * options — no chart state is read, which is what makes these testable and
 * reusable across panes.
 */
export class ChromeRenderer {
  private _getOptions: () => ChartOptions;

  constructor(getOptions: () => ChartOptions) {
    this._getOptions = getOptions;
  }

  public drawWatermark(ctx: CanvasRenderingContext2D, width: number, height: number) {
    const watermark = this._getOptions().watermark;
    if (!watermark?.visible || !watermark.text) return;

    ctx.save();
    ctx.font = `bold ${watermark.fontSize}px ${watermark.fontFamily}`;
    ctx.fillStyle = watermark.color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(watermark.text, width / 2, height / 2);
    ctx.restore();
  }

  public drawCrosshair(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    pos: { x: number; y: number },
  ) {
    const { color, width: lineWidth, style } = this._getOptions().crosshair;

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    if (style === 'dashed') ctx.setLineDash([4, 4]);

    ctx.beginPath();
    ctx.moveTo(pos.x, 0);
    ctx.lineTo(pos.x, height);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, pos.y);
    ctx.lineTo(width, pos.y);
    ctx.stroke();

    ctx.setLineDash([]);
    ctx.restore();
  }

  /** Label the highest high and lowest low currently on screen. */
  public drawExtremes(ctx: CanvasRenderingContext2D, params: ExtremesParams) {
    const { data, transformer, chartWidth, formatPrice } = params;
    if (data.length === 0) return;

    const leftIndex = Math.max(0, Math.floor(transformer.xToIndex(0)));
    const rightIndex = Math.min(data.length - 1, Math.ceil(transformer.xToIndex(chartWidth)));
    let highest = -Infinity;
    let lowest = Infinity;
    let highIndex = -1;
    let lowIndex = -1;

    for (let i = leftIndex; i <= rightIndex; i += 1) {
      const bar = data[i];
      if (!bar) continue;
      if (bar.high > highest) {
        highest = bar.high;
        highIndex = i;
      }
      if (bar.low < lowest) {
        lowest = bar.low;
        lowIndex = i;
      }
    }

    if (highIndex !== -1) {
      this._drawExtremeCallout(
        ctx,
        highIndex,
        highest,
        formatPrice(highest),
        'up',
        transformer,
        chartWidth,
      );
    }
    if (lowIndex !== -1 && lowIndex !== highIndex) {
      this._drawExtremeCallout(
        ctx,
        lowIndex,
        lowest,
        formatPrice(lowest),
        'down',
        transformer,
        chartWidth,
      );
    }
  }

  private _drawExtremeCallout(
    ctx: CanvasRenderingContext2D,
    index: number,
    price: number,
    text: string,
    direction: 'up' | 'down',
    transformer: CoordinateTransformer,
    chartWidth: number,
  ) {
    const x = transformer.indexToX(index);
    const y = transformer.priceToY(price);

    ctx.save();
    ctx.font = `400 10px ${this._getOptions().layout.fontFamily}`;
    const textWidth = ctx.measureText(text).width;
    const padding = 10;
    const isLeft = x > chartWidth / 2;
    const textX = isLeft ? x - textWidth - padding : x + padding;

    ctx.strokeStyle = this._getOptions().layout.textColor;
    ctx.fillStyle = this._getOptions().layout.textColor;
    ctx.lineWidth = 1;

    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(isLeft ? x - 5 : x + 5, direction === 'up' ? y - 5 : y + 5);
    ctx.lineTo(textX + (isLeft ? textWidth : 0), direction === 'up' ? y - 5 : y + 5);
    ctx.stroke();

    ctx.textAlign = isLeft ? 'right' : 'left';
    ctx.textBaseline = direction === 'up' ? 'bottom' : 'top';
    ctx.fillText(text, textX, direction === 'up' ? y - 5 : y + 10);
    ctx.restore();
  }

  /**
   * Opaque rail behind a price-axis column, so tick labels never sink into the
   * chart body. Assumes the context is already translated to the column.
   */
  public drawPriceAxisBackground(ctx: CanvasRenderingContext2D, params: PriceAxisBackgroundParams) {
    const colors = getAxisRailColors(this._getOptions());
    const { width, height, axisIndex, side } = params;

    ctx.fillStyle = colors.surface;
    ctx.fillRect(0, 0, width, height);

    // Alternating tint keeps stacked price scales visually separable.
    if (axisIndex % 2 === 1) {
      ctx.fillStyle = colors.stripe;
      ctx.fillRect(0, 0, width, height);
    }

    ctx.strokeStyle = colors.border;
    ctx.lineWidth = 1;
    ctx.beginPath();
    if (side === 'right') {
      ctx.moveTo(0, 0);
      ctx.lineTo(0, height);
    } else {
      ctx.moveTo(width, 0);
      ctx.lineTo(width, height);
    }
    ctx.stroke();
  }

  public drawTimeAxisBackground(ctx: CanvasRenderingContext2D, params: TimeAxisBackgroundParams) {
    const colors = getAxisRailColors(this._getOptions());
    const { width, height, position, leftAxisWidth, rightAxisWidth, stackedCount } = params;

    ctx.fillStyle = colors.surface;
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = colors.border;
    ctx.lineWidth = 1;
    ctx.beginPath();

    // The chart-facing edge, offset by half a pixel to stay crisp.
    if (position === 'top') {
      ctx.moveTo(0, height - 0.5);
      ctx.lineTo(width, height - 0.5);
    } else {
      ctx.moveTo(0, 0.5);
      ctx.lineTo(width, 0.5);
    }

    // Vertical dividers where the price-axis gutters begin.
    if (leftAxisWidth > 0) {
      ctx.moveTo(leftAxisWidth, 0);
      ctx.lineTo(leftAxisWidth, height);
    }
    if (rightAxisWidth > 0) {
      ctx.moveTo(width - rightAxisWidth, 0);
      ctx.lineTo(width - rightAxisWidth, height);
    }

    ctx.stroke();

    // Bottom-right axis intersection corner square: place P1 indicator badge
    if (position === 'bottom' && rightAxisWidth > 0 && stackedCount && stackedCount > 0) {
      const cornerX = width - rightAxisWidth;
      const badgeW = 28;
      const badgeH = 16;
      const bx = cornerX + (rightAxisWidth - badgeW) / 2;
      const by = (height - badgeH) / 2;
      ctx.save();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      const r = 3;
      ctx.moveTo(bx + r, by);
      ctx.lineTo(bx + badgeW - r, by);
      ctx.quadraticCurveTo(bx + badgeW, by, bx + badgeW, by + r);
      ctx.lineTo(bx + badgeW, by + badgeH - r);
      ctx.quadraticCurveTo(bx + badgeW, by + badgeH, bx + badgeW - r, by + badgeH);
      ctx.lineTo(bx + r, by + badgeH);
      ctx.quadraticCurveTo(bx, by + badgeH, bx, by + badgeH - r);
      ctx.lineTo(bx, by + r);
      ctx.quadraticCurveTo(bx, by, bx + r, by);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.font = `600 10px ${this._getOptions().layout.fontFamily}`;
      ctx.fillStyle = '#f8fafc';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`P${stackedCount}`, bx + badgeW / 2, by + badgeH / 2);
      ctx.restore();
    }
  }
}
