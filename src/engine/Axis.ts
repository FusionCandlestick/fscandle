import { Bounding } from '../types';
import { CoordinateTransformer } from './CoordinateTransformer';
import { ChartOptions } from '../types/options';
import { DataStore } from '../store/DataStore';
import { TimeFormatter } from '../model/timeFormat';
import { priceFormatOptions } from '../model/priceFormat';

export class Axis {
  private _type: 'x' | 'y';
  private _options: ChartOptions;
  private _timeFormatter: TimeFormatter | null;

  constructor(type: 'x' | 'y', options: ChartOptions, timeFormatter: TimeFormatter | null = null) {
    this._type = type;
    this._options = options;
    this._timeFormatter = timeFormatter;
  }

  public setTimeFormatter(formatter: TimeFormatter | null) {
    this._timeFormatter = formatter;
  }

  public render(ctx: CanvasRenderingContext2D, transformer: CoordinateTransformer, bounding: Bounding, side: 'top' | 'bottom' | 'left' | 'right', dataStore?: DataStore) {
    const { textColor, fontSize, fontFamily } = this._options.layout;
    ctx.font = `600 ${fontSize}px ${fontFamily}`;
    ctx.fillStyle = this._getAxisTextColor(textColor);
    
    // Set alignment based on side
    if (side === 'right' || side === 'left') {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      this._renderYAxis(ctx, transformer, bounding, side);
    } else {
      if (!dataStore) return;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      this._renderXAxis(ctx, transformer, bounding, side, dataStore);
    }
  }

  private _getAxisTextColor(textColor: string) {
    const normalized = textColor.trim().toLowerCase();
    if (
      normalized === '#f1f5f9' ||
      normalized === '#e2e8f0' ||
      normalized === '#d1d4dc' ||
      normalized.includes('241, 245, 249') ||
      normalized.includes('226, 232, 240')
    ) {
      return '#f8fafc';
    }

    return textColor;
  }

  private _drawAxisText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number) {
    ctx.fillText(text, x, y);
  }

  private _renderXAxis(ctx: CanvasRenderingContext2D, transformer: CoordinateTransformer, bounding: Bounding, side: 'top' | 'bottom', dataStore: DataStore) {
    const data = dataStore.getData();
    if (data.length === 0) return;

    const barSpacing = transformer.getBarSpacing();
    const minTickWidth = 80;
    const step = Math.max(1, Math.ceil(minTickWidth / barSpacing));

    const leftIndex = Math.max(0, Math.floor(transformer.xToIndex(0)));
    const rightIndex = Math.min(data.length - 1, Math.ceil(transformer.xToIndex(bounding.width)));

    const y = bounding.height / 2;

    // Ticks escalate to a coarser unit when they cross a day/month/year
    // boundary, so each one needs to know which tick preceded it.
    let previousTickTimestamp: number | null = null;

    for (let i = leftIndex; i <= rightIndex; i++) {
      if (i % step === 0) {
        const x = transformer.indexToX(i);
        const timestamp = data[i].timestamp;
        const label = this._formatXLabel(timestamp, barSpacing, previousTickTimestamp);
        this._drawAxisText(ctx, label, x, y);
        previousTickTimestamp = timestamp;
      }
    }
  }

  private _formatXLabel(timestamp: number, spacing: number, previousTimestamp: number | null): string {
    const formatter = this._options.localization.timeFormatter;
    if (formatter) return formatter(timestamp, 'axis');

    if (this._timeFormatter) {
      return this._timeFormatter.formatAxisTick(timestamp, { previousTimestamp });
    }

    // No declared period: fall back to picking granularity from bar spacing.
    const date = new Date(timestamp);
    const locale = this._options.localization.locale;
    const timeZone = this._options.localization.timeZone;
    if (spacing > 20) {
      return new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', hour12: false, timeZone }).format(date);
    }
    if (spacing > 1) {
      return new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', timeZone }).format(date);
    }
    return new Intl.DateTimeFormat(locale, { month: 'short', timeZone }).format(date);
  }

  private _getVisiblePriceBounds(transformer: CoordinateTransformer, height: number) {
    const topPrice = transformer.yToPrice(0);
    const bottomPrice = transformer.yToPrice(height);
    return {
      min: Math.min(topPrice, bottomPrice),
      max: Math.max(topPrice, bottomPrice),
    };
  }

  private _renderYAxis(ctx: CanvasRenderingContext2D, transformer: CoordinateTransformer, bounding: Bounding, side: 'left' | 'right' = 'right') {
    const { min, max } = this._getVisiblePriceBounds(transformer, bounding.height);
    const range = max - min;
    if (range <= 0) return;

    const targetTickCount = 6;
    const roughStep = range / targetTickCount;
    const step = this._getNiceStep(roughStep);
    
    const startPrice = Math.ceil(min / step) * step;
    
    const x = bounding.width / 2;

    for (let price = startPrice; price <= max; price += step) {
      const y = transformer.priceToY(price);
      if (y >= 0 && y <= bounding.height) {
        this._drawAxisText(ctx, this._formatPrice(price, step, side), x, y);
      }
    }
  }

  private _formatPrice(price: number, step: number, side: 'left' | 'right' = 'right'): string {
    const loc = this._options.localization as {
      priceFormatter?: (price: number) => string;
      leftPriceFormatter?: (price: number) => string;
      rightPriceFormatter?: (price: number) => string;
      locale?: string;
    };
    if (side === 'left' && loc.leftPriceFormatter) return loc.leftPriceFormatter(price);
    if (side === 'right' && loc.rightPriceFormatter) return loc.rightPriceFormatter(price);
    if (loc.priceFormatter) return loc.priceFormatter(price);

    return price.toLocaleString(loc.locale, priceFormatOptions(price, step));
  }

  private _getNiceStep(roughStep: number): number {
    const exponent = Math.floor(Math.log10(roughStep));
    const fraction = roughStep / Math.pow(10, exponent);
    let niceFraction;

    if (fraction < 1.5) niceFraction = 1;
    else if (fraction < 3) niceFraction = 2;
    else if (fraction < 7) niceFraction = 5;
    else niceFraction = 10;

    return niceFraction * Math.pow(10, exponent);
  }

  /**
   * Render a crosshair coordinate label on an axis.
   * Uses MATCHING font size (not bold), higher transparency for a subtle, non-jarring look.
   * @param bgColor Optional background color. Defaults to subtle semi-transparent blue.
   */
  public renderLabel(ctx: CanvasRenderingContext2D, coordinate: number, text: string, bounding: Bounding, side: 'top' | 'bottom' | 'left' | 'right', bgColor?: string) {
    const { fontSize, fontFamily } = this._options.layout;
    const padding = 4;
    // Use the SAME font size as axis ticks — NOT bold — for visual consistency
    ctx.font = `${fontSize}px ${fontFamily}`;
    const textWidth = ctx.measureText(text).width;
    const height = fontSize + padding * 2;
    const width = textWidth + padding * 2;
    const labelBgColor = bgColor || this._getDefaultLabelBackgroundColor();
    const labelTextColor = this._getReadableTextColor(labelBgColor);

    ctx.fillStyle = labelBgColor;
    
    if (this._type === 'x') {
      const leftBoundary = bounding.left || 0;
      const rightBoundary = leftBoundary + bounding.width;
      const x = Math.max(leftBoundary + width / 2, Math.min(rightBoundary - width / 2, coordinate + leftBoundary));
      const y = (bounding.height - height) / 2;
      
      this._drawRoundedRect(ctx, x - width / 2, y, width, height, 2);
      
      ctx.fillStyle = labelTextColor;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(text, x, y + height / 2);
    } else {
      const y = Math.max(height / 2, Math.min(bounding.height - height / 2, coordinate));
      const rulerWidth = bounding.width;
      const x = (rulerWidth - width) / 2;
      
      this._drawRoundedRect(ctx, x, y - height / 2, width, height, 2);
      
      ctx.fillStyle = labelTextColor;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(text, rulerWidth / 2, y);
    }
  }

  private _getDefaultLabelBackgroundColor(): string {
    const axisTextColor = this._getAxisTextColor(this._options.layout.textColor);
    return this._isLightColor(axisTextColor)
      ? '#f8fafc'
      : '#0f172a';
  }

  private _getReadableTextColor(backgroundColor: string): string {
    return this._isLightColor(backgroundColor) ? '#0b1324' : '#f8fafc';
  }

  private _isLightColor(color: string): boolean {
    const normalized = color.trim().toLowerCase();
    const hex = normalized.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (hex) {
      const raw = hex[1].length === 3
        ? hex[1].split('').map(value => value + value).join('')
        : hex[1];
      const r = Number.parseInt(raw.slice(0, 2), 16);
      const g = Number.parseInt(raw.slice(2, 4), 16);
      const b = Number.parseInt(raw.slice(4, 6), 16);
      return (r * 299 + g * 587 + b * 114) / 1000 > 150;
    }

    const rgb = normalized.match(/rgba?\(([^)]+)\)/);
    if (rgb) {
      const [r, g, b] = rgb[1].split(',').slice(0, 3).map(value => Number.parseFloat(value.trim()));
      if ([r, g, b].every(value => Number.isFinite(value))) {
        return (r * 299 + g * 587 + b * 114) / 1000 > 150;
      }
    }

    return false;
  }

  private _drawRoundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
    ctx.fill();
  }
}
