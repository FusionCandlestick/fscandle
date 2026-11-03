import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { findMagnetSnap, MAGNET_SNAP_PX } from '../../src/engine/magnetSnap';
import type { MagnetTransformer } from '../../src/engine/magnetSnap';
import type { KLineData } from '../../src/types';

/** Bars 10px apart horizontally; price 1000 sits at y=0 and each unit is 1px lower. */
function transformerWith(barSpacing: number): MagnetTransformer {
  return {
    getBarSpacing: () => barSpacing,
    indexToX: (index: number) => index * barSpacing,
    priceToY: (price: number) => 1000 - price,
  };
}

const bar = (index: number, open: number, high: number, low: number, close: number): KLineData => ({
  timestamp: index * 60_000,
  open,
  high,
  low,
  close,
  volume: 1,
});

const bars = [
  bar(0, 100, 105, 95, 101),
  bar(1, 101, 110, 99, 108),
  bar(2, 108, 109, 100, 102),
];
const barAt = (index: number) => bars[index];

describe('findMagnetSnap', () => {
  it('snaps to the OHLC value nearest the pointer', () => {
    // Bar 1's high (110) sits at y = 890 and x = 10. Its close (108) is 2px away,
    // so the pointer must be on the high itself to snap to it.
    const snap = findMagnetSnap(transformerWith(10), { x: 10, y: 890 }, 1, barAt, bars.length);
    assert.deepEqual(snap, { index: 1, time: 60_000, price: 110 });
  });

  it('considers the bars next to the nearest one', () => {
    // Bar 2's low (100) is nearer than anything on bar 1 for this pointer.
    const snap = findMagnetSnap(transformerWith(10), { x: 19, y: 899 }, 1, barAt, bars.length);
    assert.equal(snap?.index, 2);
    assert.equal(snap?.price, 100);
  });

  it('does not snap when every value is farther than the snap radius (regression)', () => {
    // Bar 0 is at x = 0 and y = 895..905 (prices 105..95). Put the pointer 40px to the right.
    const snap = findMagnetSnap(transformerWith(10), { x: 40, y: 500 }, 0, barAt, bars.length);
    assert.equal(snap, null);
  });

  // Bar 0's low (95) sits at y = 905 and x = 0. Its other values are further
  // from these pointers, so the low decides.
  it('snaps when the pointer is just inside the radius', () => {
    const snap = findMagnetSnap(transformerWith(10), { x: 0, y: 905 + MAGNET_SNAP_PX - 1 }, 0, barAt, bars.length);
    assert.equal(snap?.price, 95);
  });

  it('keeps the pointer price when just outside the radius', () => {
    const snap = findMagnetSnap(transformerWith(10), { x: 0, y: 905 + MAGNET_SNAP_PX + 1 }, 0, barAt, bars.length);
    assert.equal(snap, null);
  });

  it('never looks past the last bar', () => {
    const snap = findMagnetSnap(transformerWith(10), { x: 25, y: 898 }, 2, barAt, bars.length);
    assert.ok(snap === null || snap.index < bars.length);
  });

  it('skips bars the lookup cannot provide', () => {
    const sparse = (index: number) => (index === 1 ? undefined : bars[index]);
    const snap = findMagnetSnap(transformerWith(10), { x: 10, y: 890 }, 1, sparse, bars.length);
    assert.notEqual(snap?.index, 1);
  });

  it('uses a radius of at least one bar when bars are very narrow', () => {
    // With 0.1px bars the radius in bars would be 120; the search is still bounded by the data.
    const snap = findMagnetSnap(transformerWith(0.1), { x: 0, y: 1000 - 105 }, 0, barAt, bars.length);
    assert.equal(snap?.price, 105);
  });
});
