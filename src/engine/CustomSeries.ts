import { KLineData } from '../types';
import { BaseSeries } from './BaseSeries';
import { CoordinateTransformer } from './CoordinateTransformer';
import { DeepPartial } from '../types/options';

/**
 * Everything a custom series renderer receives. Deliberately narrow: the
 * renderer gets pixel geometry plus the resolved options, and nothing that
 * would let it mutate chart state behind the engine's back.
 */
export interface CustomSeriesRenderParams<TOptions extends object = object> {
  ctx: CanvasRenderingContext2D;
  transformer: CoordinateTransformer;
  data: KLineData[];
  options: Readonly<TOptions>;
  barSpacing: number;
  /** Pixel width available to the pane. */
  width: number;
  /** Pixel height available to the pane. */
  height: number;
  /** Index range currently on screen, clamped to the data bounds. */
  visibleRange: { from: number; to: number };
  /** Convenience helpers so renderers don't need transformer internals. */
  indexToX: (index: number) => number;
  priceToY: (price: number) => number;
}

/**
 * A custom series definition. Register with `SeriesRegistry.defineSeries` (or
 * `chart.defineSeriesType`) and then use the `type` string anywhere a built-in
 * series type is accepted.
 */
export interface CustomSeriesDefinition<TOptions extends object = object> {
  /** Unique series type key, e.g. `'renko'`. */
  type: string;
  /** Fully-populated defaults; instance options are shallow-merged over these. */
  defaultOptions: TOptions;
  /** Draw one frame. */
  renderer: (params: CustomSeriesRenderParams<TOptions>) => void;
  /**
   * Price values this bar occupies, used for autoscaling. Defaults to
   * high/low, matching the built-in series.
   */
  priceValues?: (bar: KLineData, options: Readonly<TOptions>) => number[];
  /** Override crosshair/tooltip snapping. Defaults to the bar at `index`. */
  snap?: (data: KLineData[], index: number) => KLineData | null;
}

/**
 * Adapts a `CustomSeriesDefinition` to the internal `BaseSeries` contract.
 * External code never subclasses `BaseSeries` directly — it supplies a
 * definition and the engine owns the lifecycle.
 */
export class CustomSeries<TOptions extends object = object> extends BaseSeries<TOptions> {
  private readonly _definition: CustomSeriesDefinition<TOptions>;

  constructor(definition: CustomSeriesDefinition<TOptions>, options: DeepPartial<TOptions> = {}) {
    super({ ...definition.defaultOptions, ...options } as TOptions);
    this._definition = definition;
  }

  public get type(): string {
    return this._definition.type;
  }

  public updateOptions(options: DeepPartial<TOptions>) {
    this._options = { ...this._options, ...options } as TOptions;
  }

  public render(ctx: CanvasRenderingContext2D, transformer: CoordinateTransformer) {
    if (this._data.length === 0) return;

    const width = transformer.getWidth();
    const height = transformer.getHeight();
    const from = Math.max(0, Math.floor(transformer.xToIndex(0)));
    const to = Math.min(this._data.length - 1, Math.ceil(transformer.xToIndex(width)));

    ctx.save();
    try {
      this._definition.renderer({
        ctx,
        transformer,
        data: this._data,
        options: this._options,
        barSpacing: transformer.getBarSpacing(),
        width,
        height,
        visibleRange: { from, to },
        indexToX: index => transformer.indexToX(index),
        priceToY: price => transformer.priceToY(price),
      });
    } finally {
      ctx.restore();
    }
  }

  public getSnapData(index: number): KLineData | null {
    if (this._definition.snap) {
      return this._definition.snap(this._data, index);
    }
    return super.getSnapData(index);
  }

  public autoscale(): { min: number; max: number } | null {
    if (this._data.length === 0) return null;

    const priceValues = this._definition.priceValues;
    if (!priceValues) return super.autoscale();

    let min = Infinity;
    let max = -Infinity;
    for (const bar of this._data) {
      for (const value of priceValues(bar, this._options)) {
        if (!Number.isFinite(value)) continue;
        if (value < min) min = value;
        if (value > max) max = value;
      }
    }

    if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
    return { min, max };
  }
}
