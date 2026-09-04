import type { KLineData } from '../types';
import type { Overlay } from './OverlayManager';

/**
 * Parameters delivered with pointer-driven chart events. Mirrors the shape
 * Lightweight Charts uses for `MouseEventParams`, extended with the pane and
 * overlay the pointer was actually over.
 */
export interface ChartMouseEventParams {
  /** Timestamp under the pointer, or null when it is past the data edge. */
  time: number | null;
  /** Fractional bar index under the pointer. */
  logical: number;
  /** Pointer position in chart-content pixel space. */
  point: { x: number; y: number };
  /** Price under the pointer in the pane it is over. */
  price: number | null;
  /** Bar under the pointer, if any. */
  bar: KLineData | null;
  /** Pane the pointer is over. */
  paneId: string;
  /** Overlay under the pointer, if any. */
  overlay: Overlay | null;
  /** The underlying DOM event, when the emit was triggered by one. */
  sourceEvent: PointerEvent | null;
}

export interface LogicalRange {
  from: number;
  to: number;
}

export interface TimeRange {
  from: number | null;
  to: number | null;
}

export interface ChartSizeParams {
  width: number;
  height: number;
}

export type OverlayChangeReason = 'created' | 'updated' | 'removed' | 'selected' | 'deselected';

export interface OverlayChangeParams {
  reason: OverlayChangeReason;
  overlay: Overlay | null;
}

export interface DataChangeParams {
  reason: 'set' | 'update';
  /** Bar count after the change. */
  count: number;
  /** The bar that was appended or replaced, for `update`. */
  bar: KLineData | null;
}

/** All chart-level events, keyed by name. */
export interface ChartEventMap {
  click: ChartMouseEventParams;
  dblClick: ChartMouseEventParams;
  contextMenu: ChartMouseEventParams;
  crosshairMove: ChartMouseEventParams;
  visibleLogicalRangeChange: LogicalRange;
  visibleTimeRangeChange: TimeRange;
  sizeChange: ChartSizeParams;
  overlayChange: OverlayChangeParams;
  dataChange: DataChangeParams;
}

export type ChartEventName = keyof ChartEventMap;
export type ChartEventHandler<K extends ChartEventName> = (params: ChartEventMap[K]) => void;

/**
 * Minimal typed event bus. Handlers are copied before dispatch so a handler
 * that unsubscribes itself (a common pattern) cannot corrupt the iteration.
 */
export class EventBus {
  private _handlers: Map<ChartEventName, Set<(params: never) => void>> = new Map();

  /** Subscribe. Returns an unsubscribe function. */
  public on<K extends ChartEventName>(event: K, handler: ChartEventHandler<K>): () => void {
    let set = this._handlers.get(event);
    if (!set) {
      set = new Set();
      this._handlers.set(event, set);
    }
    set.add(handler as (params: never) => void);
    return () => this.off(event, handler);
  }

  public off<K extends ChartEventName>(event: K, handler: ChartEventHandler<K>) {
    this._handlers.get(event)?.delete(handler as (params: never) => void);
  }

  /** Subscribe for a single dispatch. */
  public once<K extends ChartEventName>(event: K, handler: ChartEventHandler<K>): () => void {
    const unsubscribe = this.on(event, params => {
      unsubscribe();
      handler(params);
    });
    return unsubscribe;
  }

  public emit<K extends ChartEventName>(event: K, params: ChartEventMap[K]) {
    const set = this._handlers.get(event);
    if (!set || set.size === 0) return;
    for (const handler of Array.from(set)) {
      try {
        (handler as ChartEventHandler<K>)(params);
      } catch (error) {
        // One bad subscriber must not stop the others or break a render pass.
        console.error(`[FusionCandlestick] "${event}" event handler threw:`, error);
      }
    }
  }

  public hasSubscribers(event: ChartEventName): boolean {
    return (this._handlers.get(event)?.size ?? 0) > 0;
  }

  public clear() {
    this._handlers.clear();
  }
}
