import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  normalizeDrawingLayers,
  PERSISTED_STATE_VERSION,
  parsePersistedState,
  type StoredDrawingLayer,
} from '../../src/store/persistence';

describe('current persisted state contract', () => {
  it('accepts exactly the current version', () => {
    const state = { version: PERSISTED_STATE_VERSION, options: { crosshair: { visible: true } } };
    assert.deepEqual(parsePersistedState(JSON.stringify(state)), state);
  });

  it('rejects unversioned, old, future, malformed, and non-object payloads', () => {
    for (const value of [{}, { version: PERSISTED_STATE_VERSION - 1 }, { version: PERSISTED_STATE_VERSION + 1 }, [], null]) {
      assert.equal(parsePersistedState(JSON.stringify(value)), null);
    }
    assert.equal(parsePersistedState('{'), null);
    assert.equal(parsePersistedState(null), null);
  });
});

describe('normalizeDrawingLayers', () => {
  const NOW = 1_700_000_000_000;
  // Stored data is untrusted, so these tests feed in shapes the type does not allow.
  const stored = (...layers: unknown[]) => layers as Array<Partial<StoredDrawingLayer>>;

  it('drops layers that have no overlays array', () => {
    const layers = normalizeDrawingLayers(stored({ id: 'a', overlays: [] }, { id: 'b' }), NOW);
    assert.deepEqual(layers.map(layer => layer.id), ['a']);
  });

  it('keeps stored values and fills in the missing ones', () => {
    const [layer] = normalizeDrawingLayers(stored({ id: 'keep', name: 'Mine', overlays: [], createdAt: 1, updatedAt: 2 }), NOW);
    assert.deepEqual(layer, { id: 'keep', name: 'Mine', overlays: [], createdAt: 1, updatedAt: 2 });
  });

  it('numbers unnamed layers by position and stamps missing timestamps with now', () => {
    const layers = normalizeDrawingLayers(stored({ overlays: [] }, { overlays: [] }), NOW);
    assert.deepEqual(
      layers.map(({ name, createdAt, updatedAt }) => ({ name, createdAt, updatedAt })),
      [
        { name: 'Layer 1', createdAt: NOW, updatedAt: NOW },
        { name: 'Layer 2', createdAt: NOW, updatedAt: NOW },
      ],
    );
  });

  it('gives an id derived from now and position when none is stored', () => {
    const [layer] = normalizeDrawingLayers(stored({ overlays: [] }), NOW);
    assert.equal(layer.id, `layer_${NOW}_0`);
  });

  it('ignores non-string ids and names rather than storing them', () => {
    const [layer] = normalizeDrawingLayers(stored({ id: 42, name: null, overlays: [] }), NOW);
    assert.equal(layer.id, `layer_${NOW}_0`);
    assert.equal(layer.name, 'Layer 1');
  });
});
