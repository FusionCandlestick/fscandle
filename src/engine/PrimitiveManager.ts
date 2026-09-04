import type {
  FusionCandlestickChart,
  InvalidationLevel,
} from '../FusionCandlestickChart';
import {
  ChartPrimitive,
  PrimitiveContext,
  PrimitiveDrawPaneRequest,
  PrimitiveDrawPriceAxisRequest,
  PrimitiveDrawTimeAxisRequest,
  PrimitiveHitTestResult,
  PrimitivePaneView,
  PrimitivePriceAxisView,
  PrimitiveTimeAxisView,
  primitivePointerPhaseToMethod,
} from './Primitive';
import type { PrimitivePointerEventContext, PrimitivePointerPhase } from './PointerEvents';

type ViewWithPrimitive<T> = {
  primitive: ChartPrimitive;
  view: T;
};

export class PrimitiveManager {
  private _chart: FusionCandlestickChart;
  private _primitives: Map<string, ChartPrimitive> = new Map();
  private _context: PrimitiveContext;

  constructor(chart: FusionCandlestickChart, context: PrimitiveContext) {
    this._chart = chart;
    this._context = context;
  }

  public attach(primitive: ChartPrimitive) {
    if (this._primitives.has(primitive.id)) {
      this.detach(primitive.id);
    }
    this._primitives.set(primitive.id, primitive);
    primitive.attached?.(this._context);
  }

  public detach(id: string) {
    const primitive = this._primitives.get(id);
    if (!primitive) return;
    primitive.detached?.();
    this._primitives.delete(id);
  }

  public get(id: string): ChartPrimitive | null {
    return this._primitives.get(id) ?? null;
  }

  public list(): ChartPrimitive[] {
    return [...this._primitives.values()];
  }

  public updateAll(level: InvalidationLevel) {
    this._primitives.forEach(primitive => primitive.update?.(level));
  }

  public drawPaneViews(request: PrimitiveDrawPaneRequest) {
    this._collectPaneViews()
      .filter(({ view }) =>
        (view.paneId ?? request.paneId) === request.paneId &&
        (view.layer ?? 'overlay') === request.layer &&
        (view.area ?? 'chart') === request.area,
      )
      .forEach(({ view }) => {
        view.renderer().draw(request.ctx, {
          chart: this._chart,
          paneId: request.paneId,
          layer: request.layer,
          area: request.area,
          bounding: request.bounding,
          viewport: request.viewport,
          transformer: request.transformer,
          timeScale: this._context.timeScale,
          priceScale: this._context.priceScale,
          series: this._context.series,
        });
      });
  }

  public drawPriceAxisViews(request: PrimitiveDrawPriceAxisRequest) {
    this._collectPriceAxisViews()
      .filter(({ view }) =>
        (view.paneId ?? request.paneId) === request.paneId &&
        (view.side ?? request.side) === request.side &&
        (view.axisIndex ?? request.axisIndex) === request.axisIndex,
      )
      .forEach(({ view }) => {
        view.renderer().draw(request.ctx, {
          chart: this._chart,
          paneId: request.paneId,
          side: request.side,
          axisIndex: request.axisIndex,
          bounding: request.bounding,
          transformer: request.transformer,
          priceScale: this._context.priceScale,
        });
      });
  }

  public drawTimeAxisViews(request: PrimitiveDrawTimeAxisRequest) {
    this._collectTimeAxisViews()
      .filter(({ view }) => (view.position ?? request.position) === request.position)
      .forEach(({ view }) => {
        view.renderer().draw(request.ctx, {
          chart: this._chart,
          position: request.position,
          bounding: request.bounding,
          transformer: request.transformer,
          timeScale: this._context.timeScale,
        });
      });
  }

  public hitTest(context: PrimitivePointerEventContext): PrimitiveHitTestResult | null {
    const hits: PrimitiveHitTestResult[] = [];
    this._primitives.forEach(primitive => {
      const hit = primitive.hitTest?.(context);
      if (hit) {
        hits.push({
          id: primitive.id,
          ...hit,
        });
      }
    });
    hits.sort((a, b) => (b.zOrder ?? 0) - (a.zOrder ?? 0));
    return hits[0] ?? null;
  }

  public dispatchPointer(phase: PrimitivePointerPhase, context: PrimitivePointerEventContext): boolean {
    const method = primitivePointerPhaseToMethod[phase];
    const hit = this.hitTest(context);
    let handled = false;
    this._primitives.forEach(primitive => {
      const handler = primitive[method];
      if (handler?.(context, hit?.id === primitive.id ? hit : null) === true) {
        handled = true;
      }
    });
    return handled;
  }

  public dispose() {
    this._primitives.forEach(primitive => primitive.detached?.());
    this._primitives.clear();
  }

  private _collectPaneViews(): Array<ViewWithPrimitive<PrimitivePaneView>> {
    return this._sortViews(this._flatMapViews(primitive => primitive.paneViews?.() ?? []));
  }

  private _collectPriceAxisViews(): Array<ViewWithPrimitive<PrimitivePriceAxisView>> {
    return this._sortViews(this._flatMapViews(primitive => primitive.priceAxisViews?.() ?? []));
  }

  private _collectTimeAxisViews(): Array<ViewWithPrimitive<PrimitiveTimeAxisView>> {
    return this._sortViews(this._flatMapViews(primitive => primitive.timeAxisViews?.() ?? []));
  }

  private _flatMapViews<T extends { zOrder?: number }>(getViews: (primitive: ChartPrimitive) => T[]): Array<ViewWithPrimitive<T>> {
    const views: Array<ViewWithPrimitive<T>> = [];
    this._primitives.forEach(primitive => {
      getViews(primitive).forEach(view => views.push({ primitive, view }));
    });
    return views;
  }

  private _sortViews<T extends { zOrder?: number }>(views: Array<ViewWithPrimitive<T>>) {
    return views.sort((a, b) => (a.view.zOrder ?? 0) - (b.view.zOrder ?? 0));
  }
}
