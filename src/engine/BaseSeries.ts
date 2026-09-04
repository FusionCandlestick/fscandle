import { KLineData } from '../types';
import { CoordinateTransformer } from '../engine/CoordinateTransformer';
import { DeepPartial } from '../types/options';
import { visibleIndexRange, type IndexRange } from '../model/visibleRange';
import { computePriceExtent } from '../model/priceExtent';

export abstract class BaseSeries<T extends object = object> {
  protected _data: KLineData[] = [];
  protected _options: T;

  constructor(options: T) {
    this._options = options;
  }

  public setData(data: KLineData[]) {
    this._data = data;
  }

  public getData(): KLineData[] {
    return this._data;
  }

  public getOptions(): Readonly<T> {
    return this._options;
  }

  /**
   * The slice of `_data` worth drawing for this transformer.
   *
   * Renderers used to walk the whole array and let the canvas clip the rest,
   * which is most of a pan's cost once a chart holds more bars than a screen.
   */
  protected visibleRange(transformer: CoordinateTransformer, data: KLineData[] = this._data): IndexRange {
    return visibleIndexRange(x => transformer.xToIndex(x), transformer.getWidth(), data.length);
  }

  public abstract render(ctx: CanvasRenderingContext2D, transformer: CoordinateTransformer): void;
  public abstract updateOptions(options: DeepPartial<T>): void;

  public getSnapData(index: number): KLineData | null {
    if (index < 0 || index >= this._data.length) return null;
    return this._data[index];
  }
  
  public autoscale(): { min: number, max: number } | null {
    // A scan, not `Math.max(...prices)`: the spread form threw RangeError at
    // 200,000 bars, which is a chart that fails to open rather than one that
    // opens slowly. See computePriceExtent.
    return computePriceExtent(this._data);
  }
}
