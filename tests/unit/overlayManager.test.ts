import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { OverlayManager } from '../../src/engine/OverlayManager';
import type { Overlay } from '../../src/engine/OverlayManager';
import { CoordinateTransformer } from '../../src/engine/CoordinateTransformer';
import { DataStore } from '../../src/store/DataStore';
import type { KLineData } from '../../src/types';

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
  transformer.setDimensions(1000, 500);
  transformer.setRange(90, 110);
  transformer.setBarSpacing(10);
  transformer.setOffset(0);

  return { store, transformer };
}

function makeOverlay(id: string, extra: Partial<Overlay> = {}): Overlay {
  return {
    id,
    type: 'line',
    points: [
      { timestamp: 0, value: 100 },
      { timestamp: 10 * 60_000, value: 100 },
    ],
    color: '#fff',
    lineWidth: 1,
    ...extra,
  };
}

describe('metadata accessors', () => {
  it('sets and reads locked / visible / zLevel', () => {
    const manager = new OverlayManager();
    manager.addOverlay(makeOverlay('a'));

    assert.equal(manager.setLocked('a', true), true);
    assert.equal(manager.getOverlayById('a')?.locked, true);

    assert.equal(manager.setVisible('a', false), true);
    assert.equal(manager.getOverlayById('a')?.visible, false);

    assert.equal(manager.setZLevel('a', 5), true);
    assert.equal(manager.getOverlayById('a')?.zLevel, 5);
  });

  it('reports failure for an unknown id', () => {
    const manager = new OverlayManager();
    assert.equal(manager.setLocked('nope', true), false);
    assert.equal(manager.override('nope', { color: '#000' }), null);
    assert.equal(manager.getOverlayById('nope'), null);
  });

  it('override mutates the stored overlay, not a copy', () => {
    const manager = new OverlayManager();
    manager.addOverlay(makeOverlay('a', { color: '#111' }));
    manager.override('a', { color: '#222' });
    // getOverlays() returns sanitized copies, so read back through the store.
    assert.equal(manager.getOverlayById('a')?.color, '#222');
    assert.equal(manager.getOverlays()[0].color, '#222');
  });
});

describe('groups', () => {
  it('collects, updates, and removes by groupId', () => {
    const manager = new OverlayManager();
    manager.addOverlay(makeOverlay('a', { groupId: 'g1' }));
    manager.addOverlay(makeOverlay('b', { groupId: 'g1' }));
    manager.addOverlay(makeOverlay('c', { groupId: 'g2' }));

    assert.equal(manager.getOverlaysByGroup('g1').length, 2);

    assert.equal(manager.overrideGroup('g1', { visible: false }), 2);
    assert.equal(manager.getOverlayById('a')?.visible, false);
    assert.equal(manager.getOverlayById('b')?.visible, false);
    assert.equal(manager.getOverlayById('c')?.visible, undefined);

    assert.equal(manager.removeGroup('g1'), 2);
    assert.equal(manager.getOverlays().length, 1);
    assert.equal(manager.removeGroup('missing'), 0);
  });
});

describe('hit testing respects metadata', () => {
  it('skips locked overlays', () => {
    const { store, transformer } = makeContext();
    const manager = new OverlayManager();
    manager.addOverlay(makeOverlay('a'));

    const y = transformer.priceToY(100);
    const x = transformer.indexToX(5);
    assert.equal(manager.findOverlayAt(x, y, transformer, store)?.id, 'a');

    manager.setLocked('a', true);
    assert.equal(manager.findOverlayAt(x, y, transformer, store), null);
  });

  it('skips hidden overlays', () => {
    const { store, transformer } = makeContext();
    const manager = new OverlayManager();
    manager.addOverlay(makeOverlay('a'));

    const y = transformer.priceToY(100);
    const x = transformer.indexToX(5);

    manager.setVisible('a', false);
    assert.equal(manager.findOverlayAt(x, y, transformer, store), null);

    manager.setVisible('a', true);
    assert.equal(manager.findOverlayAt(x, y, transformer, store)?.id, 'a');
  });

  it('skips locked overlays for handle drags too', () => {
    const { store, transformer } = makeContext();
    const manager = new OverlayManager();
    manager.addOverlay(makeOverlay('a'));

    const handleX = transformer.indexToX(0);
    const handleY = transformer.priceToY(100);
    assert.notEqual(manager.findHandleAt(handleX, handleY, transformer, store), null);

    manager.setLocked('a', true);
    assert.equal(manager.findHandleAt(handleX, handleY, transformer, store), null);
  });

  it('prefers the topmost overlay by zLevel', () => {
    const { store, transformer } = makeContext();
    const manager = new OverlayManager();
    manager.addOverlay(makeOverlay('bottom', { zLevel: 10 }));
    manager.addOverlay(makeOverlay('top', { zLevel: 20 }));

    const y = transformer.priceToY(100);
    const x = transformer.indexToX(5);
    assert.equal(manager.findOverlayAt(x, y, transformer, store)?.id, 'top');

    manager.setZLevel('bottom', 30);
    assert.equal(manager.findOverlayAt(x, y, transformer, store)?.id, 'bottom');
  });

  it('falls back to insertion order when zLevels tie', () => {
    const { store, transformer } = makeContext();
    const manager = new OverlayManager();
    manager.addOverlay(makeOverlay('first'));
    manager.addOverlay(makeOverlay('second'));

    const y = transformer.priceToY(100);
    const x = transformer.indexToX(5);
    // Last added draws last, so it is on top and wins the hit test.
    assert.equal(manager.findOverlayAt(x, y, transformer, store)?.id, 'second');
  });
});

describe('templates', () => {
  it('defaults totalStep to 2 and reads it from a template', () => {
    const manager = new OverlayManager();
    assert.equal(manager.getTotalStep('line'), 2);

    manager.registerTemplate({
      type: 'triangle',
      totalStep: 3,
      createFigures: () => [],
    });
    assert.equal(manager.getTotalStep('triangle'), 3);
  });

  it('exposes draw steps by index', () => {
    const manager = new OverlayManager();
    manager.registerTemplate({
      type: 'stepped',
      totalStep: 2,
      drawSteps: [{ hint: 'pick start' }, { hint: 'pick end' }],
      createFigures: () => [],
    });

    assert.equal(manager.getDrawStep('stepped', 0)?.hint, 'pick start');
    assert.equal(manager.getDrawStep('stepped', 1)?.hint, 'pick end');
    assert.equal(manager.getDrawStep('stepped', 5), null);
    assert.equal(manager.getDrawStep('unknown', 0), null);
  });

  it('reports needDefaultPointFigure, defaulting to true', () => {
    const manager = new OverlayManager();
    assert.equal(manager.needsDefaultPointFigure('line'), true);

    manager.registerTemplate({
      type: 'no-handles',
      needDefaultPointFigure: false,
      createFigures: () => [],
    });
    assert.equal(manager.needsDefaultPointFigure('no-handles'), false);
  });

  it('exposes template default overlay fields', () => {
    const manager = new OverlayManager();
    assert.deepEqual(manager.getDefaultOverlayFields('line'), {});

    manager.registerTemplate({
      type: 'with-defaults',
      defaultOverlay: { zLevel: 7, locked: true },
      createFigures: () => [],
    });
    assert.deepEqual(manager.getDefaultOverlayFields('with-defaults'), {
      zLevel: 7,
      locked: true,
    });
  });

  it('hit-tests a figure-only template generically', () => {
    const { store, transformer } = makeContext();
    const manager = new OverlayManager();
    manager.registerTemplate({
      type: 'blob',
      createFigures: ({ coordinates }) => [
        { type: 'circle', attrs: { x: coordinates[0].x, y: coordinates[0].y, r: 15 }, styles: { style: 'fill' } },
      ],
    });
    manager.addOverlay({ ...makeOverlay('blob1'), type: 'blob' });

    const x = transformer.indexToX(0);
    const y = transformer.priceToY(100);
    assert.equal(manager.findOverlayAt(x, y, transformer, store)?.id, 'blob1');
    assert.equal(manager.findOverlayAt(x + 200, y, transformer, store), null);
  });
});

describe('getOverlays', () => {
  it('strips the non-serializable image cache', () => {
    const manager = new OverlayManager();
    const overlay = makeOverlay('a');
    (overlay as Overlay)._imageCache = {} as HTMLImageElement;
    manager.addOverlay(overlay);
    assert.equal('_imageCache' in manager.getOverlays()[0], false);
  });
});
