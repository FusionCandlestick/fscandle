import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { OverlayManager } from '../../src/engine/OverlayManager';
import type { Overlay } from '../../src/engine/OverlayManager';
import { mergeOptionTree } from '../../src/model/optionTree';
import { sanitizeOverlay, sanitizeOverlays } from '../../src/model/overlayValidation';
import { normalizeDrawingLayers } from '../../src/store/persistence';
import { makeChartContext, recordingContext, MINUTE } from '../support/fixtures';

const point = (index: number, value = 100) => ({ timestamp: index * MINUTE, value });

const valid = (extra: Record<string, unknown> = {}) => ({
  id: 'a',
  type: 'line',
  points: [point(1), point(5)],
  color: '#fff',
  lineWidth: 2,
  ...extra,
});

describe('sanitizeOverlay', () => {
  it('keeps a well-formed overlay as it is', () => {
    assert.deepEqual(sanitizeOverlay(valid()), valid());
  });

  it('rejects an overlay that could not be drawn', () => {
    const broken: unknown[] = [
      null,
      'line',
      valid({ id: '' }),
      valid({ id: 7 }),
      valid({ type: undefined }),
      valid({ points: undefined }),
      valid({ points: [] }),
      valid({ points: [point(1), { timestamp: 'soon', value: 1 }] }),
      valid({ points: [{ timestamp: Number.NaN, value: 1 }] }),
    ];
    for (const raw of broken) assert.equal(sanitizeOverlay(raw), null, JSON.stringify(raw));
  });

  it('fills in a missing colour and an invalid line width', () => {
    const overlay = sanitizeOverlay(valid({ color: undefined, lineWidth: -3 }));
    assert.equal(overlay?.color, '#2962FF');
    assert.equal(overlay?.lineWidth, 1);
  });

  it('drops functions, the image cache, and prototype keys', () => {
    const raw = JSON.parse('{"__proto__": {"polluted": true}}') as Record<string, unknown>;
    Object.assign(raw, valid({ onClick: () => {}, _imageCache: {} }));
    const overlay = sanitizeOverlay(raw) as unknown as Record<string, unknown>;
    assert.equal('onClick' in overlay, false);
    assert.equal('_imageCache' in overlay, false);
    assert.equal(Object.getPrototypeOf(overlay), Object.prototype);
    assert.equal((overlay as { polluted?: unknown }).polluted, undefined);
  });

  it('keeps image annotations only when the picture is a data URL', () => {
    assert.equal(sanitizeOverlay(valid({ imageUrl: 'data:image/png;base64,AAAA' }))?.imageUrl, 'data:image/png;base64,AAAA');
    assert.equal('imageUrl' in (sanitizeOverlay(valid({ imageUrl: 'https://tracker.example/p.gif' })) ?? {}), false);
  });

  it('drops known optional fields of the wrong type but keeps unknown plain fields', () => {
    const overlay = sanitizeOverlay(valid({ locked: 'yes', zLevel: 'top', text: 7, myTemplateData: { a: 1 } })) as unknown as Record<string, unknown>;
    assert.equal('locked' in overlay, false);
    assert.equal('zLevel' in overlay, false);
    assert.equal('text' in overlay, false);
    assert.deepEqual(overlay.myTemplateData, { a: 1 });
  });

  it('keeps overlays of a type no template has registered yet', () => {
    assert.equal(sanitizeOverlay(valid({ type: 'trading_line' }))?.type, 'trading_line');
  });
});

describe('sanitizeOverlays', () => {
  it('keeps the drawable ones and counts the rest', () => {
    const { overlays, rejected } = sanitizeOverlays([valid({ id: 'ok' }), { id: 'bad', type: 'line' }]);
    assert.deepEqual(overlays.map(overlay => overlay.id), ['ok']);
    assert.equal(rejected, 1);
  });

  it('treats a non-array as empty', () => {
    assert.deepEqual(sanitizeOverlays({ overlays: [] }), { overlays: [], rejected: 0 });
  });
});

describe('normalizeDrawingLayers with malformed overlays', () => {
  it('drops overlays that could not be drawn and reports how many', () => {
    let reported = 0;
    const [layer] = normalizeDrawingLayers(
      [{ id: 'l', overlays: [valid({ id: 'ok' }), { id: 'bad', type: 'line', color: '#f00', lineWidth: 1 }] }] as never,
      1,
      count => { reported = count; },
    );
    assert.deepEqual(layer.overlays.map(overlay => overlay.id), ['ok']);
    assert.equal(reported, 1);
  });
});

describe('OverlayManager with a malformed overlay', () => {
  function managerWith(overlays: Overlay[]) {
    const manager = new OverlayManager();
    overlays.forEach(overlay => manager.addOverlay(overlay));
    return manager;
  }
  const missingPoints = { id: 'bad', type: 'line', color: '#f00', lineWidth: 1 } as unknown as Overlay;

  it('keeps drawing the other overlays and marks the broken one', () => {
    const { store, transformer } = makeChartContext();
    const { ctx, calls } = recordingContext();
    const manager = managerWith([missingPoints, valid({ id: 'good' }) as Overlay]);
    const originalWarn = console.warn;
    console.warn = () => {};
    try {
      assert.doesNotThrow(() => manager.render(ctx, transformer, store));
    } finally {
      console.warn = originalWarn;
    }
    assert.ok(calls.point > 0, 'the good overlay was drawn');
    assert.deepEqual(manager.getBrokenOverlayIds(), ['bad']);
  });

  it('leaves a broken overlay out of hit testing', () => {
    const { store, transformer } = makeChartContext();
    const manager = managerWith([missingPoints]);
    const originalWarn = console.warn;
    console.warn = () => {};
    try {
      manager.render(recordingContext().ctx, transformer, store);
      assert.doesNotThrow(() => manager.findOverlayAt(10, 10, transformer, store));
      assert.equal(manager.findHandleAt(10, 10, transformer, store), null);
    } finally {
      console.warn = originalWarn;
    }
  });

  it('gives an overlay another chance once it is updated', () => {
    const { store, transformer } = makeChartContext();
    const manager = managerWith([missingPoints]);
    const originalWarn = console.warn;
    console.warn = () => {};
    try {
      manager.render(recordingContext().ctx, transformer, store);
    } finally {
      console.warn = originalWarn;
    }
    manager.override('bad', { points: [point(1), point(5)] });
    assert.deepEqual(manager.getBrokenOverlayIds(), []);
    assert.doesNotThrow(() => manager.render(recordingContext().ctx, transformer, store));
  });
});

describe('mergeOptionTree with parsed input', () => {
  it('ignores prototype keys instead of replacing the prototype', () => {
    const overrides = JSON.parse('{"__proto__": {"injected": true}, "grid": {"visible": false}}');
    const merged = mergeOptionTree({ grid: { visible: true } }, overrides) as Record<string, unknown>;
    assert.equal(Object.getPrototypeOf(merged), Object.prototype);
    assert.equal((merged as { injected?: unknown }).injected, undefined);
    assert.deepEqual(merged.grid, { visible: false });
  });
});
