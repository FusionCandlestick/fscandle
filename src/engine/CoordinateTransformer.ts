import { KLineData } from '../types';
// Value import; PriceScaleModel imports PriceScaleMode back as a type only, so
// the cycle is erased at runtime.
import { PriceScaleModel } from '../model/PriceScaleModel';
import { VERTICAL_PADDING_RATIO } from '../model/priceScaleMath';

/**
 * Price scale mode — inspired by LWC PriceScaleMode and KC YAxis.type.
 *
 * - `normal`  : Linear price mapping (default)
 * - `log`     : Logarithmic price mapping (compressed high-end, expanded low-end)
 */
export type PriceScaleMode = 'normal' | 'log';

/**
 * Log formula constants — taken from lightweight-charts price-scale-conversions.ts.
 * logicalOffset keeps values positive; coordOffset prevents log(0).
 */
const LOG_OFFSET = 4;
const LOG_PRECISION_DIGITS = 12;

export interface CoordinateDataSource {
  getData(): KLineData[];
  timestampToLogicalIndex(timestamp: number): number;
  timestampToIndex(timestamp: number): number;
  logicalIndexToTimestamp(logicalIndex: number): number | null;
}

function getMagnitude(value: number): number {
  if (!Number.isFinite(value) || value === 0) return 1;
  return Math.pow(10, Math.floor(Math.log10(Math.abs(value))));
}

function getPrecisionEpsilon(value: number): number {
  return getMagnitude(value) * Math.pow(10, -LOG_PRECISION_DIGITS);
}

function getNormalizationScale(...values: number[]): number {
  const finiteValues = values.filter(value => Number.isFinite(value));
  const maxAbs = Math.max(1, ...finiteValues.map(value => Math.abs(value)));
  return Math.pow(10, -Math.floor(Math.log10(maxAbs)));
}

function getLogOffset(price: number): number {
  return Math.max(Number.MIN_VALUE, getPrecisionEpsilon(price));
}

function toLog(price: number): number {
  const m = Math.abs(price);
  if (m < 1e-15) return 0;
  const res = Math.log10(m + getLogOffset(price)) + LOG_OFFSET;
  return price < 0 ? -res : res;
}

function fromLog(logical: number): number {
  const m = Math.abs(logical);
  if (m < 1e-15) return 0;
  const raw = Math.pow(10, m - LOG_OFFSET);
  const res = Math.max(0, raw - getLogOffset(raw));
  return logical < 0 ? -res : res;
}

interface LogicalRangeState {
  normalizedMin: number;
  normalizedMax: number;
  normalizedPrice: number;
  scale: number;
}

export class CoordinateTransformer {
  private _width: number = 0;
  private _height: number = 0;
  private _barSpacing: number = 10;
  private _offset: number = 0; // Number of bars offset from index 0
  private _minPrice: number = 0;
  private _maxPrice: number = 0;
  private _yScale: number = 1.0;
  private _yOffset: number = 0;

  private _rightMargin: number = 0;

  /**
   * Display settings this transformer reads rather than is told about.
   *
   * Mode and inversion apply to every price scale on a chart at once, so the
   * chart used to push them into each transformer after every change — one
   * call per stacked scale, and a silent inconsistency whenever a new
   * transformer was created between the change and the next push. Attaching the
   * chart's model instead makes those reads, so a transformer cannot be stale.
   *
   * The default is a private model, which keeps a standalone transformer (and
   * every unit test that builds one) working with its own settings.
   *
   * The vertical viewport is deliberately NOT read from here: each stacked
   * price scale has its own zoom and pan, so `_yScale` and `_yOffset` stay
   * local to the transformer.
   */
  private _priceScale: PriceScaleModel = new PriceScaleModel();
  private _rightMarginRatio = 0.2;

  public setDimensions(width: number, height: number) {
    this._width = width;
    this._height = height;
    this._rightMargin = width * this._rightMarginRatio;
  }

  public setRightMarginRatio(ratio: number) {
    this._rightMarginRatio = Math.max(0, Math.min(1, ratio));
    this._rightMargin = this._width * this._rightMarginRatio;
  }

  public setRange(minPrice: number, maxPrice: number) {
    if (!Number.isFinite(minPrice) || !Number.isFinite(maxPrice)) {
      this._minPrice = 0;
      this._maxPrice = 0;
      return;
    }

    const nextMin = Math.min(minPrice, maxPrice);
    const nextMax = Math.max(minPrice, maxPrice);
    const epsilon = getPrecisionEpsilon(Math.max(Math.abs(nextMin), Math.abs(nextMax), 1));

    if (Math.abs(nextMax - nextMin) <= epsilon) {
      this._minPrice = nextMin - epsilon;
      this._maxPrice = nextMax + epsilon;
      return;
    }

    this._minPrice = nextMin;
    this._maxPrice = nextMax;
  }

  public setYScale(scale: number) {
    this._yScale = scale;
  }

  public setYOffset(offset: number) {
    this._yOffset = offset;
  }

  public getYScale(): number {
    return this._yScale;
  }

  public getYOffset(): number {
    return this._yOffset;
  }

  public getWidth(): number {
    return this._width;
  }

  public getHeight(): number {
    return this._height;
  }

  public getBarSpacing(): number {
    return this._barSpacing;
  }

  public getRange(): { min: number; max: number } {
    return { min: this._minPrice, max: this._maxPrice };
  }

  public setRightMargin(margin: number) {
    this._rightMargin = margin;
  }

  // ── Price Scale Mode API ─────────────────────────────────────────
  /**
   * Share a price scale's display settings with this transformer.
   *
   * Every transformer on a chart attaches the same model, so a mode or
   * inversion change is seen by all of them without being pushed to each.
   */
  public attachPriceScale(priceScale: PriceScaleModel) {
    this._priceScale = priceScale;
  }

  public setPriceScaleMode(mode: PriceScaleMode) {
    this._priceScale.mode = mode;
  }

  public getPriceScaleMode(): PriceScaleMode {
    return this._priceScale.mode;
  }

  public setInvertScale(inverted: boolean) {
    this._priceScale.inverted = inverted;
  }

  public getInvertScale(): boolean {
    return this._priceScale.inverted;
  }

  // ── Internal: map price to logical value ─────────────────────────
  private _priceToLogical(price: number): number {
    if (this._priceScale.mode === 'log') {
      return toLog(price);
    }
    return price;
  }

  private _logicalToPrice(logical: number): number {
    if (this._priceScale.mode === 'log') {
      return fromLog(logical);
    }
    return logical;
  }

  private _getLogicalRangeState(price: number): LogicalRangeState {
    const logicalMin = this._priceToLogical(this._minPrice);
    const logicalMax = this._priceToLogical(this._maxPrice);
    const logicalPrice = this._priceToLogical(price);
    const scale = getNormalizationScale(logicalMin, logicalMax, logicalPrice);

    return {
      normalizedMin: logicalMin * scale,
      normalizedMax: logicalMax * scale,
      normalizedPrice: logicalPrice * scale,
      scale,
    };
  }

  private _getVerticalLayout() {
    // Same constant the price-scale clamp math uses, so the range the clamp
    // thinks is visible is the range actually rendered.
    const basePadding = VERTICAL_PADDING_RATIO * this._height;
    const usableHeight = Math.max(this._height - 2 * basePadding, 1);
    return { basePadding, usableHeight };
  }

  // --- Price to Y (Inspired by TV's PriceScale) ---
  public priceToY(price: number): number {
    const { normalizedMin, normalizedMax, normalizedPrice } = this._getLogicalRangeState(price);
    const range = normalizedMax - normalizedMin;
    if (Math.abs(range) <= Number.EPSILON) return this._height / 2;

    const { basePadding, usableHeight } = this._getVerticalLayout();

    let y = (1 - (normalizedPrice - normalizedMin) / range) * usableHeight + basePadding;

    // Invert: flip around center
    if (this._priceScale.inverted) {
      y = this._height - y;
    }

    // Apply Y scaling and offset
    const center = this._height / 2;
    y = (y - center) * this._yScale + center + this._yOffset;
    
    return y;
  }

  public yToPrice(y: number): number {
    const center = this._height / 2;
    const safeYScale = Math.abs(this._yScale) > Number.EPSILON ? this._yScale : 1;
    const unscaledY = (y - this._yOffset - center) / safeYScale + center;

    let effectiveY = unscaledY;
    // Undo inversion
    if (this._priceScale.inverted) {
      effectiveY = this._height - effectiveY;
    }

    const { basePadding, usableHeight } = this._getVerticalLayout();
    const logicalMin = this._priceToLogical(this._minPrice);
    const logicalMax = this._priceToLogical(this._maxPrice);
    const scale = getNormalizationScale(logicalMin, logicalMax);
    const normalizedMin = logicalMin * scale;
    const normalizedMax = logicalMax * scale;
    const normalizedRange = normalizedMax - normalizedMin;
    const normalizedLogicalValue = (1 - (effectiveY - basePadding) / usableHeight) * normalizedRange + normalizedMin;
    const logicalValue = normalizedLogicalValue / scale;
    return this._logicalToPrice(logicalValue);
  }

  public setOffset(offset: number) {
    this._offset = offset;
  }

  public getOffset(): number {
    return this._offset;
  }

  public setOffsetToLatest(dataCount: number) {
    if (dataCount <= 0) return;
    this._offset = dataCount - 1;
  }

  // --- Index to X (Inspired by TV's TimeScale) ---
  public indexToX(index: number): number {
    // Current Bar X = (Index - Offset) * BarSpacing + (Width - RightMargin) - HalfBar
    return (index - this._offset) * this._barSpacing + (this._width - this._rightMargin) - this._barSpacing / 2;
  }

  public xToIndex(x: number): number {
    return (x - (this._width - this._rightMargin) + this._barSpacing / 2) / this._barSpacing + this._offset;
  }

  public setBarSpacing(spacing: number) {
    this._barSpacing = Math.max(1, Math.min(100, spacing));
  }

  public timestampToX(timestamp: number, dataStore: CoordinateDataSource): number {
    const index = dataStore.timestampToLogicalIndex(timestamp);
    return this.indexToX(index);
  }

  /**
   * Converts a timestamp to an X coordinate, allowing extrapolation beyond
   * the last data point into the future (unbounded). Used for drawing tools
   * like trend lines and extended lines that should extend past the last bar.
   *
   * Inspired by TradingView's TimeScale and klinecharts' coordinate model:
   * the bar interval is detected from the data and used for linear extrapolation.
   */
  public timestampToXUnbounded(timestamp: number, dataStore: CoordinateDataSource): number {
    return this.indexToX(dataStore.timestampToLogicalIndex(timestamp));
  }

  public xToTimestamp(x: number, dataStore: CoordinateDataSource): number | null {
    const logicalIndex = this.xToIndex(x);
    const timestamp = dataStore.logicalIndexToTimestamp(logicalIndex);
    if (timestamp !== null) return timestamp;

    const data = dataStore.getData();
    const index = Math.round(logicalIndex);
    return data[index]?.timestamp ?? null;
  }
}
