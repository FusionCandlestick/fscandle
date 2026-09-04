/**
 * The overlay price scales stacked beside the main one, as entities.
 *
 * Each stacked scale used to be spread across five maps on the chart, all keyed
 * by the same pane id: its series, its data, its axis placement, its vertical
 * viewport, and its last rendered transformer. Adding a scale meant remembering
 * to write to all five, and removing one meant remembering to delete from all
 * five — the transformer map was already asymmetric, written only during render
 * and cleared only on removal, which is precisely the kind of drift that
 * arrangement invites.
 *
 * One registry of one entity type replaces them. Lifecycle is `add` and
 * `remove`; nothing else has to know how many fields a scale happens to have.
 *
 * This owns bookkeeping only. Deciding how a scale is laid out or drawn stays
 * with the chart, which is why the transformer is stored here but built there.
 */

import type { KLineData } from '../types';
import type { BaseSeries } from './BaseSeries';
import type { CoordinateTransformer } from './CoordinateTransformer';
import type { PaneAxisSide } from './PaneManager';
import { PriceScaleModel } from '../model/PriceScaleModel';

export interface StackedPriceScaleInit {
  id: string;
  series: BaseSeries;
  data: KLineData[];
  side: PaneAxisSide;
  axisIndex: number;
}

export class StackedPriceScale {
  public readonly id: string;
  public series: BaseSeries;
  public data: KLineData[];
  public side: PaneAxisSide;
  public axisIndex: number;
  /** Vertical zoom and pan, independent of the main scale and of siblings. */
  public readonly viewport = new PriceScaleModel();
  /** Transformer from the last render pass; absent until the scale is drawn. */
  public transformer: CoordinateTransformer | null = null;

  constructor(init: StackedPriceScaleInit) {
    this.id = init.id;
    this.series = init.series;
    this.data = init.data;
    this.side = init.side;
    this.axisIndex = init.axisIndex;
  }
}

export class StackedPriceScales {
  private _scales: Map<string, StackedPriceScale> = new Map();

  public get size(): number {
    return this._scales.size;
  }

  public has(id: string): boolean {
    return this._scales.has(id);
  }

  public get(id: string): StackedPriceScale | null {
    return this._scales.get(id) ?? null;
  }

  public add(init: StackedPriceScaleInit): StackedPriceScale {
    const scale = new StackedPriceScale(init);
    this._scales.set(scale.id, scale);
    return scale;
  }

  /** Remove a scale and everything belonging to it. Returns false if unknown. */
  public remove(id: string): boolean {
    return this._scales.delete(id);
  }

  public forEach(visit: (scale: StackedPriceScale) => void): void {
    this._scales.forEach(scale => visit(scale));
  }

  public all(): StackedPriceScale[] {
    return [...this._scales.values()];
  }

  /** How many scales sit on one side, which decides the next axis column. */
  public countOnSide(side: PaneAxisSide): number {
    return this.all().filter(scale => scale.side === side).length;
  }

  /** Drop every rendered transformer, before a fresh layout pass rebuilds them. */
  public clearTransformers(): void {
    this._scales.forEach(scale => {
      scale.transformer = null;
    });
  }
}
