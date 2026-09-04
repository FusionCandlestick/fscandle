import { BaseSeries } from './BaseSeries';
import { CandlestickSeries } from './CandlestickSeries';
import { BarSeries } from './BarSeries';
import { AreaSeries } from './AreaSeries';
import { LineSeries } from './LineSeries';
import { StepLineSeries } from './StepLineSeries';
import { HollowCandlestickSeries } from './HollowCandlestickSeries';
import { HeikinAshiSeries } from './HeikinAshiSeries';
import { BaselineSeries } from './BaselineSeries';
import { CustomSeries, CustomSeriesDefinition } from './CustomSeries';
import { DeepPartial } from '../types/options';

export type BuiltInSeriesType =
  | 'candle'
  | 'bar'
  | 'area'
  | 'line'
  | 'step'
  | 'baseline'
  | 'hollow'
  | 'ha';
export type SeriesType = BuiltInSeriesType | (string & {});

type SeriesConstructor = new (options?: Record<string, unknown>) => BaseSeries;
type SeriesFactory = (options: Record<string, unknown>) => BaseSeries;

export class SeriesRegistry {
  private static _factories: Map<SeriesType, SeriesFactory> = new Map();
  private static _definitions: Map<SeriesType, CustomSeriesDefinition<never>> = new Map();

  static {
    // Register built-in series
    this.register('candle', CandlestickSeries);
    this.register('bar', BarSeries);
    this.register('area', AreaSeries);
    this.register('line', LineSeries);
    this.register('step', StepLineSeries);
    this.register('baseline', BaselineSeries);
    this.register('hollow', HollowCandlestickSeries);
    this.register('ha', HeikinAshiSeries);
  }

  /** Register a series implemented as a `BaseSeries` subclass. */
  public static register(type: SeriesType, seriesClass: SeriesConstructor) {
    this._factories.set(type, options => new seriesClass(options));
  }

  /**
   * Register a series from a declarative definition. This is the supported
   * extension point for third-party series — no `BaseSeries` subclassing and
   * no engine internals required.
   */
  public static defineSeries<TOptions extends object>(definition: CustomSeriesDefinition<TOptions>) {
    if (!definition.type) {
      throw new Error('CustomSeriesDefinition requires a non-empty "type"');
    }
    this._definitions.set(definition.type, definition as unknown as CustomSeriesDefinition<never>);
    this._factories.set(
      definition.type,
      options => new CustomSeries(definition, options as DeepPartial<TOptions>),
    );
  }

  /** Remove a registered series type. Returns whether anything was removed. */
  public static unregister(type: SeriesType): boolean {
    this._definitions.delete(type);
    return this._factories.delete(type);
  }

  public static has(type: SeriesType): boolean {
    return this._factories.has(type);
  }

  public static getDefinition(type: SeriesType): CustomSeriesDefinition<never> | null {
    return this._definitions.get(type) ?? null;
  }

  public static createSeries(type: SeriesType, options: Record<string, unknown>): BaseSeries {
    const factory = this._factories.get(type);
    if (!factory) {
      throw new Error(`Unknown series type: ${type}`);
    }
    return factory(options);
  }

  public static getRegisteredTypes(): string[] {
    return Array.from(this._factories.keys());
  }
}
