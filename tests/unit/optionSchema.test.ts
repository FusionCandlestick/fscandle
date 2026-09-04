import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { findUnknownOptionPaths } from '../../src/model/optionSchema';
import { defaultOptions } from '../../src/types/options';

const defaults = {
  layout: { background: { type: 'solid', color: '#000' }, fontSize: 10 },
  crosshair: { visible: true, color: '#fff' },
  timeScale: { period: '1d' as string | { unit: string }, session: undefined },
};

describe('finding options the schema has no place for', () => {
  it('accepts every path the defaults declare', () => {
    assert.deepEqual(
      findUnknownOptionPaths(defaults, { crosshair: { color: '#f00' }, layout: { fontSize: 12 } }),
      [],
    );
  });

  it('reports a misspelled leaf with its full path', () => {
    // The failure this exists for: one letter, silently ignored.
    assert.deepEqual(findUnknownOptionPaths(defaults, { crosshair: { colour: '#f00' } }), [
      'crosshair.colour',
    ]);
  });

  it('reports an unknown group without walking into it', () => {
    assert.deepEqual(findUnknownOptionPaths(defaults, { sparkline: { color: '#f00', width: 2 } }), [
      'sparkline',
    ]);
  });

  it('reports nested paths', () => {
    assert.deepEqual(findUnknownOptionPaths(defaults, { layout: { background: { colour: 1 } } }), [
      'layout.background.colour',
    ]);
  });

  it('ignores undefined, which is what DeepPartial produces for an omitted field', () => {
    assert.deepEqual(findUnknownOptionPaths(defaults, { crosshair: { colour: undefined } }), []);
  });

  it('does not walk into a value the schema treats as a leaf', () => {
    // `timeScale.period` takes a string or a Period object; neither shape should
    // be searched for unknown keys.
    assert.deepEqual(findUnknownOptionPaths(defaults, { timeScale: { period: { unit: 'minute', value: 15 } } }), []);
  });

  it('collects several at once', () => {
    const unknown = findUnknownOptionPaths(defaults, {
      crosshair: { colour: '#f00' },
      layout: { fontsize: 12 },
    });
    assert.deepEqual(unknown.sort(), ['crosshair.colour', 'layout.fontsize']);
  });
});

describe('the shipped defaults as the schema', () => {
  // Every optional option has to be declared in the default tree, because
  // `key in defaults` is the whole test. These four were not: setting a period,
  // a session, a timezone or a price formatter worked *and* warned that it had
  // been ignored, and pruning persisted options would have dropped them.
  const documented = {
    timeScale: { period: '15m', session: 'us-equity' },
    localization: {
      locale: 'zh-CN',
      timeZone: 'Asia/Shanghai',
      priceFormatter: (price: number) => String(price),
      timeFormatter: (timestamp: number) => String(timestamp),
    },
    axis: { showExtremes: false },
    panes: { dividerHeight: 8 },
    indicators: { palette: ['#fff'] },
  };

  it('reports no documented option as unknown', () => {
    assert.deepEqual(findUnknownOptionPaths(defaultOptions, documented), []);
  });

});
