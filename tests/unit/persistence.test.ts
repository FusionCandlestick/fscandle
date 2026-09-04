import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { PERSISTED_STATE_VERSION, parsePersistedState } from '../../src/store/persistence';

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
