import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  PriceLineRegistry,
  SeriesMarkerRegistry,
  indexOfTimestamp,
  placeMarkers,
} from '../../src/model/seriesDecorations';
import type { KLineData } from '../../src/types';

const bars: KLineData[] = Array.from({ length: 10 }, (_, i) => ({
  timestamp: 1_000 + i * 100,
  open: 10,
  high: 20 + i,
  low: 5 - i * 0.1,
  close: 15,
  volume: 1,
}));

describe('price lines', () => {
  it('fills defaults around the price the caller gave', () => {
    const line = new PriceLineRegistry().add({ price: 42 });
    assert.equal(line.price, 42);
    assert.equal(line.axisLabelVisible, true);
    assert.ok(line.id.length > 0);
  });

  it('honours a caller-supplied id, so a re-add replaces rather than duplicates', () => {
    const registry = new PriceLineRegistry();
    registry.add({ id: 'stop', price: 10 });
    registry.add({ id: 'stop', price: 12 });
    assert.equal(registry.size, 1);
    assert.equal(registry.get('stop')?.price, 12);
  });

  it('keeps draw order across an update', () => {
    // A caller that recolours a line every tick must not see it jump in front
    // of its neighbours.
    const registry = new PriceLineRegistry();
    registry.add({ id: 'a', price: 1 });
    registry.add({ id: 'b', price: 2 });
    registry.update('a', { color: '#f00' });
    assert.deepEqual(registry.all().map(line => line.id), ['a', 'b']);
  });

  it('reports an unknown id instead of creating one', () => {
    assert.equal(new PriceLineRegistry().update('ghost', { price: 1 }), null);
  });

  it('removes and clears', () => {
    const registry = new PriceLineRegistry();
    registry.add({ id: 'a', price: 1 });
    assert.equal(registry.remove('a'), true);
    assert.equal(registry.remove('a'), false);
  });
});

describe('markers', () => {
  it('replaces the whole set, which is how a signal list syncs', () => {
    const registry = new SeriesMarkerRegistry();
    registry.setAll([{ timestamp: 1_000 }, { timestamp: 1_100 }]);
    registry.setAll([{ timestamp: 1_200 }]);
    assert.equal(registry.size, 1);
    assert.equal(registry.all()[0].timestamp, 1_200);
  });

  it('fills defaults for shape, colour and position', () => {
    const [marker] = new SeriesMarkerRegistry().setAll([{ timestamp: 1_000 }]);
    assert.equal(marker.shape, 'circle');
    assert.equal(marker.position, 'aboveBar');
  });
});

describe('placing markers', () => {
  const indexToX = (index: number) => index * 10;
  const priceToY = (price: number) => 500 - price;
  const place = (markers: Parameters<typeof placeMarkers>[0], visible = { start: 0, end: 9 }) =>
    placeMarkers(markers, bars, visible, indexToX, priceToY);

  it('finds a bar by timestamp rather than by index', () => {
    // Index-addressed markers break when history is prepended; timestamps do not.
    const [placed] = place([{ id: 'm', timestamp: 1_300, position: 'aboveBar', shape: 'circle', color: '#000', size: 6, text: '' }]);
    assert.equal(placed.x, 30);
  });

  it('drops markers whose bar is off screen', () => {
    const marker = { id: 'm', timestamp: 1_000, position: 'aboveBar' as const, shape: 'circle' as const, color: '#000', size: 6, text: '' };
    assert.equal(place([marker], { start: 5, end: 9 }).length, 0);
  });

  it('drops a marker whose timestamp matches no bar', () => {
    const marker = { id: 'm', timestamp: 999_999, position: 'aboveBar' as const, shape: 'circle' as const, color: '#000', size: 6, text: '' };
    assert.equal(place([marker]).length, 0);
  });

  it('sits above the high, below the low, or between them', () => {
    const at = (position: 'aboveBar' | 'belowBar' | 'inBar') =>
      place([{ id: 'm', timestamp: 1_000, position, shape: 'circle', color: '#000', size: 6, text: '' }])[0].y;
    assert.ok(at('aboveBar') < priceToY(bars[0].high) + 1);
    assert.ok(at('belowBar') > priceToY(bars[0].low) - 1);
    assert.equal(at('inBar'), priceToY((bars[0].high + bars[0].low) / 2));
  });

  it('costs nothing when there are no markers or no data', () => {
    assert.deepEqual(placeMarkers([], bars, { start: 0, end: 9 }, indexToX, priceToY), []);
    assert.deepEqual(place([{ id: 'm', timestamp: 1_000, position: 'aboveBar', shape: 'circle', color: '#000', size: 6, text: '' }], { start: 0, end: -1 }), []);
  });
});

describe('finding a bar by timestamp', () => {
  it('locates every bar', () => {
    bars.forEach((bar, index) => assert.equal(indexOfTimestamp(bars, bar.timestamp), index));
  });

  it('reports -1 for a timestamp between bars, not the nearest one', () => {
    // A marker on a bar that does not exist is a caller error worth surfacing,
    // not something to silently snap.
    assert.equal(indexOfTimestamp(bars, 1_050), -1);
  });

  it('handles the empty set', () => {
    assert.equal(indexOfTimestamp([], 1), -1);
  });
});

describe('placing a marker on the line', () => {
  const indexToX = (index: number) => index * 10;
  const priceToY = (price: number) => 500 - price * 10;
  const place = (position: 'aboveBar' | 'belowBar' | 'inBar' | 'onPoint') =>
    placeMarkers(
      [{ id: 'm', timestamp: bars[3].timestamp, position, shape: 'circle', color: '#000', size: 6, text: '' }],
      bars,
      { start: 0, end: 9 },
      indexToX,
      priceToY,
    )[0];

  it('puts an onPoint marker at the close, which is where a line series draws', () => {
    // The reason this position exists: a sparkline's dot has to sit *on* the
    // line. `inBar` is the middle of the high-low range, which on a line series
    // is beside it, not on it.
    assert.equal(place('onPoint').y, priceToY(bars[3].close));
  });

  it('still puts inBar at the middle of the bar, not on the line', () => {
    assert.equal(place('inBar').y, priceToY((bars[3].high + bars[3].low) / 2));
    assert.notEqual(place('inBar').y, place('onPoint').y);
  });

  it('leaves aboveBar and belowBar offset from the extremes', () => {
    assert.ok(place('aboveBar').y < priceToY(bars[3].high));
    assert.ok(place('belowBar').y > priceToY(bars[3].low));
  });
});
