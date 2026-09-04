/**
 * Price lines and per-bar markers: the two things a series can carry that are
 * not part of its data.
 *
 * Both were the last functional gaps against Lightweight Charts, and both were
 * approximable with the drawing-overlay system without being the same contract.
 * An overlay belongs to the chart: it is placed at a price, it is selectable and
 * draggable, it survives in the persisted drawing layers, and it carries no axis
 * label. A price line belongs to a *series*: it is a value the caller owns (an
 * entry price, a stop, a liquidation level), it is not user-editable, and its
 * point is the label on the price axis. Making one out of the other means either
 * a decoration users can accidentally drag away, or a drawing that cannot say
 * what it is worth.
 *
 * The registries and the geometry live here, pure, so what gets drawn where can
 * be tested without a canvas. Painting stays in the chart.
 */

import type { KLineData } from '../types';

type LineStyle = 'solid' | 'dashed' | 'dotted';

export interface PriceLineOptions {
  /** Stable identity; generated when the caller does not supply one. */
  id: string;
  price: number;
  color: string;
  lineWidth: number;
  lineStyle: LineStyle;
  /** Shown on the price axis. Falls back to the formatted price. */
  title: string;
  axisLabelVisible: boolean;
}

export type PriceLineInput = Partial<Omit<PriceLineOptions, 'price'>> & { price: number };

export const DEFAULT_PRICE_LINE: Omit<PriceLineOptions, 'id' | 'price'> = {
  color: '#2962FF',
  lineWidth: 1,
  lineStyle: 'dashed',
  title: '',
  axisLabelVisible: true,
};

/**
 * Where a marker sits relative to its bar.
 *
 * `inBar` is the middle of the high-low range, which is inside a candle but
 * beside a line: a line series is drawn at the close, so a dot meant to sit
 * *on* the line has to be placed there. That is `onPoint`.
 */
export type MarkerPosition = 'aboveBar' | 'belowBar' | 'inBar' | 'onPoint';
export type MarkerShape = 'circle' | 'square' | 'arrowUp' | 'arrowDown';

export interface SeriesMarker {
  id: string;
  /** Bar the marker belongs to, matched by timestamp. */
  timestamp: number;
  position: MarkerPosition;
  shape: MarkerShape;
  color: string;
  size: number;
  text: string;
}

export type SeriesMarkerInput = Partial<Omit<SeriesMarker, 'timestamp'>> & { timestamp: number };

export const DEFAULT_MARKER: Omit<SeriesMarker, 'id' | 'timestamp'> = {
  position: 'aboveBar',
  shape: 'circle',
  color: '#2962FF',
  size: 6,
  text: '',
};

let sequence = 0;
const nextId = (prefix: string) => `${prefix}_${(sequence += 1)}`;

/**
 * Ordered collection keyed by id.
 *
 * Insertion order is draw order, and it survives updates: restyling a price line
 * must not bring it to the front, or a caller who recolours a line on every tick
 * gets a z-order that flickers.
 */
class Registry<T extends { id: string }> {
  protected _items = new Map<string, T>();

  public all(): T[] {
    return [...this._items.values()];
  }

  public get(id: string): T | undefined {
    return this._items.get(id);
  }

  public remove(id: string): boolean {
    return this._items.delete(id);
  }

  public clear(): void {
    this._items.clear();
  }

  public get size(): number {
    return this._items.size;
  }
}

export class PriceLineRegistry extends Registry<PriceLineOptions> {
  public add(input: PriceLineInput): PriceLineOptions {
    const line: PriceLineOptions = {
      ...DEFAULT_PRICE_LINE,
      ...input,
      id: input.id ?? nextId('priceline'),
    };
    this._items.set(line.id, line);
    return line;
  }

  /** Patch an existing line, keeping its draw order. Returns null if unknown. */
  public update(id: string, patch: Partial<PriceLineInput>): PriceLineOptions | null {
    const current = this._items.get(id);
    if (!current) return null;
    const next = { ...current, ...patch, id };
    this._items.set(id, next);
    return next;
  }
}

export class SeriesMarkerRegistry extends Registry<SeriesMarker> {
  /** Replace the whole set, which is how a caller syncs markers to a signal list. */
  public setAll(inputs: SeriesMarkerInput[]): SeriesMarker[] {
    this._items.clear();
    return inputs.map(input => {
      const marker: SeriesMarker = { ...DEFAULT_MARKER, ...input, id: input.id ?? nextId('marker') };
      this._items.set(marker.id, marker);
      return marker;
    });
  }
}

export interface PlacedMarker {
  marker: SeriesMarker;
  x: number;
  y: number;
}

/**
 * Where each marker lands, given the bars on screen.
 *
 * Markers are addressed by timestamp rather than by index, because an index
 * moves when history is prepended and a caller holding signal timestamps should
 * not have to re-map them. Markers whose bar is not in the visible slice are
 * dropped here rather than drawn off-screen: at 50,000 bars and a few hundred
 * markers, that is the difference between an allocation-free frame and one that
 * walks the whole list twice.
 */
export function placeMarkers(
  markers: readonly SeriesMarker[],
  data: readonly KLineData[],
  visible: { start: number; end: number },
  indexToX: (index: number) => number,
  priceToY: (price: number) => number,
  gap = 8,
): PlacedMarker[] {
  if (markers.length === 0 || data.length === 0) return [];

  const placed: PlacedMarker[] = [];
  for (const marker of markers) {
    const index = indexOfTimestamp(data, marker.timestamp);
    if (index < visible.start || index > visible.end) continue;

    const bar = data[index];
    const y =
      marker.position === 'aboveBar'
        ? priceToY(bar.high) - gap
        : marker.position === 'belowBar'
          ? priceToY(bar.low) + gap
          : marker.position === 'onPoint'
            ? priceToY(bar.close)
            : priceToY((bar.high + bar.low) / 2);

    placed.push({ marker, x: indexToX(index), y });
  }
  return placed;
}

/**
 * Index of the bar carrying `timestamp`, or -1.
 *
 * Binary search: data is sorted by timestamp, and a linear scan per marker would
 * make a hundred markers a hundred passes over the dataset on every frame.
 */
export function indexOfTimestamp(data: readonly KLineData[], timestamp: number): number {
  let low = 0;
  let high = data.length - 1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    const value = data[middle].timestamp;
    if (value === timestamp) return middle;
    if (value < timestamp) low = middle + 1;
    else high = middle - 1;
  }
  return -1;
}
