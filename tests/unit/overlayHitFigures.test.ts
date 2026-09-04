import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { OverlayManager } from '../../src/engine/OverlayManager';
import type { Overlay } from '../../src/engine/OverlayManager';
import { CoordinateTransformer } from '../../src/engine/CoordinateTransformer';
import { DataStore } from '../../src/store/DataStore';
import type { KLineData } from '../../src/types';

/**
 * Hit testing for the built-in templates, which used to be a hand-written
 * `if (overlay.type === ...)` chain and is now driven by each template's
 * `createHitFigures`. These assert the behaviours that chain encoded, so a
 * regression in the figure geometry shows up here rather than as an overlay
 * that silently stops being selectable.
 */

const WIDTH = 1000;
const HEIGHT = 500;

function makeContext() {
  const store = new DataStore();
  const data: KLineData[] = Array.from({ length: 20 }, (_, i) => ({
    timestamp: i * 60_000,
    open: 100,
    high: 110,
    low: 90,
    close: 100,
    volume: 1,
  }));
  store.setData(data);

  const transformer = new CoordinateTransformer();
  transformer.setDimensions(WIDTH, HEIGHT);
  transformer.setRange(90, 110);
  transformer.setBarSpacing(10);
  transformer.setOffset(0);

  return { store, transformer, manager: new OverlayManager() };
}

/** Pixel position of an overlay point, so tests can aim at real geometry. */
function pixel(
  transformer: CoordinateTransformer,
  store: DataStore,
  point: { timestamp: number; value: number },
) {
  return {
    x: transformer.timestampToXUnbounded(point.timestamp, store),
    y: transformer.priceToY(point.value),
  };
}

function overlay(type: string, points: Array<[number, number]>, extra: Partial<Overlay> = {}): Overlay {
  return {
    id: `${type}-1`,
    type,
    points: points.map(([timestamp, value]) => ({ timestamp, value })),
    color: '#000',
    lineWidth: 1,
    ...extra,
  };
}

describe('built-in overlay hit geometry', () => {
  it('hits a segment along its length but not past its end', () => {
    const { manager, transformer, store } = makeContext();
    const item = overlay('line', [[2 * 60_000, 100], [6 * 60_000, 104]]);
    manager.setOverlays([item]);
    const a = pixel(transformer, store, item.points[0]);
    const b = pixel(transformer, store, item.points[1]);

    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    assert.equal(manager.findOverlayAt(mid.x, mid.y, transformer, store)?.id, item.id);
    // Well beyond the far endpoint, along the same slope.
    const beyondX = b.x + (b.x - a.x);
    const beyondY = b.y + (b.y - a.y);
    assert.equal(manager.findOverlayAt(beyondX, beyondY, transformer, store), null);
  });

  it('hits an infinite line beyond both endpoints', () => {
    const { manager, transformer, store } = makeContext();
    const item = overlay('line', [[2 * 60_000, 100], [6 * 60_000, 104]], { line: { extendStart: true, extendEnd: true } });
    manager.setOverlays([item]);
    const a = pixel(transformer, store, item.points[0]);
    const b = pixel(transformer, store, item.points[1]);
    const slope = (b.y - a.y) / (b.x - a.x);

    for (const x of [a.x - 150, WIDTH - 5]) {
      const y = a.y + slope * (x - a.x);
      assert.equal(manager.findOverlayAt(x, y, transformer, store)?.id, item.id, `x=${x}`);
    }
  });

  it('hits a ray forward only', () => {
    const { manager, transformer, store } = makeContext();
    const item = overlay('line', [[4 * 60_000, 100], [8 * 60_000, 104]], { line: { extendEnd: true } });
    manager.setOverlays([item]);
    const a = pixel(transformer, store, item.points[0]);
    const b = pixel(transformer, store, item.points[1]);
    const slope = (b.y - a.y) / (b.x - a.x);

    const forwardX = b.x + 100;
    assert.equal(
      manager.findOverlayAt(forwardX, a.y + slope * (forwardX - a.x), transformer, store)?.id,
      item.id,
    );
    const backwardX = a.x - 100;
    assert.equal(
      manager.findOverlayAt(backwardX, a.y + slope * (backwardX - a.x), transformer, store),
      null,
    );
  });

  it('hits a horizontal line across the full width', () => {
    const { manager, transformer, store } = makeContext();
    const item = overlay('line', [[5 * 60_000, 100], [9 * 60_000, 100]], { line: { direction: 'horizontal', extendStart: true, extendEnd: true } });
    manager.setOverlays([item]);
    const { y } = pixel(transformer, store, item.points[0]);

    for (const x of [0, WIDTH / 2, WIDTH - 1]) {
      assert.equal(manager.findOverlayAt(x, y, transformer, store)?.id, item.id, `x=${x}`);
    }
    assert.equal(manager.findOverlayAt(WIDTH / 2, y + 60, transformer, store), null);
  });

  it('hits a horizontal ray only to the right of its anchor', () => {
    const { manager, transformer, store } = makeContext();
    const item = overlay('line', [[8 * 60_000, 100], [9 * 60_000, 100]], { line: { direction: 'horizontal', extendEnd: true } });
    manager.setOverlays([item]);
    const anchor = pixel(transformer, store, item.points[0]);

    assert.equal(manager.findOverlayAt(WIDTH - 5, anchor.y, transformer, store)?.id, item.id);
    assert.equal(manager.findOverlayAt(anchor.x - 200, anchor.y, transformer, store), null);
  });

  it('hits a vertical line down the full height', () => {
    const { manager, transformer, store } = makeContext();
    const item = overlay('line', [[5 * 60_000, 100], [5 * 60_000, 104]], { line: { direction: 'vertical', extendStart: true, extendEnd: true } });
    manager.setOverlays([item]);
    const { x } = pixel(transformer, store, item.points[0]);

    for (const y of [0, HEIGHT / 2, HEIGHT - 1]) {
      assert.equal(manager.findOverlayAt(x, y, transformer, store)?.id, item.id, `y=${y}`);
    }
    assert.equal(manager.findOverlayAt(x + 60, HEIGHT / 2, transformer, store), null);
  });

  it('hits inside a rectangle, not outside it', () => {
    const { manager, transformer, store } = makeContext();
    const item = overlay('rectangle', [[2 * 60_000, 96], [8 * 60_000, 106]]);
    manager.setOverlays([item]);
    const a = pixel(transformer, store, item.points[0]);
    const b = pixel(transformer, store, item.points[1]);

    assert.equal(
      manager.findOverlayAt((a.x + b.x) / 2, (a.y + b.y) / 2, transformer, store)?.id,
      item.id,
    );
    assert.equal(manager.findOverlayAt(b.x + 120, b.y + 120, transformer, store), null);
  });

  it('hits a label within its padded box', () => {
    const { manager, transformer, store } = makeContext();
    const item = overlay('annotation', [[5 * 60_000, 100]], { text: 'note', annotation: { kind: 'text' } });
    manager.setOverlays([item]);
    const anchor = pixel(transformer, store, item.points[0]);

    assert.equal(manager.findOverlayAt(anchor.x + 40, anchor.y + 20, transformer, store)?.id, item.id);
    assert.equal(manager.findOverlayAt(anchor.x + 200, anchor.y, transformer, store), null);
  });

  it('respects the grouped line template direction and extension flags', () => {
    const { manager, transformer, store } = makeContext();
    const item = overlay('line', [[4 * 60_000, 100], [8 * 60_000, 106]], {
      line: { direction: 'horizontal', extendEnd: true },
    });
    manager.setOverlays([item]);
    const anchor = pixel(transformer, store, item.points[0]);

    // Direction 'horizontal' pins the second point's price to the first.
    assert.equal(manager.findOverlayAt(WIDTH - 5, anchor.y, transformer, store)?.id, item.id);
  });

  it('hits a wave along its legs and inside its filled region', () => {
    const { manager, transformer, store } = makeContext();
    const item = overlay(
      'wave',
      [[2 * 60_000, 96], [5 * 60_000, 106], [8 * 60_000, 98], [11 * 60_000, 105]],
      { wave: { kind: 'abcd' } },
    );
    manager.setOverlays([item]);
    const points = item.points.map(point => pixel(transformer, store, point));

    const legMid = { x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 };
    assert.equal(manager.findOverlayAt(legMid.x, legMid.y, transformer, store)?.id, item.id);

    const centroid = {
      x: (points[0].x + points[1].x + points[2].x) / 3,
      y: (points[0].y + points[1].y + points[2].y) / 3,
    };
    assert.equal(manager.findOverlayAt(centroid.x, centroid.y, transformer, store)?.id, item.id);
  });

  it('hits both rails of a channel', () => {
    const { manager, transformer, store } = makeContext();
    const item = overlay('channel', [[2 * 60_000, 98], [10 * 60_000, 104], [2 * 60_000, 102]]);
    manager.setOverlays([item]);
    const [p1, p2, p3] = item.points.map(point => pixel(transformer, store, point));

    assert.equal(
      manager.findOverlayAt((p1.x + p2.x) / 2, (p1.y + p2.y) / 2, transformer, store)?.id,
      item.id,
    );
    const offsetMid = {
      x: (p3.x + p2.x + (p3.x - p1.x)) / 2,
      y: (p3.y + p2.y + (p3.y - p1.y)) / 2,
    };
    assert.equal(manager.findOverlayAt(offsetMid.x, offsetMid.y, transformer, store)?.id, item.id);
  });

  it('leaves locked and hidden overlays unselectable', () => {
    const { manager, transformer, store } = makeContext();
    const locked = overlay('line', [[2 * 60_000, 100], [6 * 60_000, 100]], { locked: true });
    manager.setOverlays([locked]);
    const anchor = pixel(transformer, store, locked.points[0]);
    assert.equal(manager.findOverlayAt(anchor.x + 10, anchor.y, transformer, store), null);

    const hidden = overlay('line', [[2 * 60_000, 100], [6 * 60_000, 100]], { visible: false });
    manager.setOverlays([hidden]);
    assert.equal(manager.findOverlayAt(anchor.x + 10, anchor.y, transformer, store), null);
  });

  it('gives every built-in template hit geometry', () => {
    const { manager, transformer, store } = makeContext();
    for (const type of manager.getRegisteredTypes()) {
      const template = manager.getTemplate(type);
      assert.ok(
        template?.createHitFigures ?? template?.createFigures,
        `built-in template "${type}" has no hit geometry, so it cannot be selected`,
      );
    }
    void transformer;
    void store;
  });
});
