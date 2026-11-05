import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildLegendContent, buildToolbarContentItems } from '../../src/gui/contentModel';
import type { LegendContentInput } from '../../src/gui/contentModel';
import { makeBar } from '../support/fixtures';

const element = {} as HTMLDivElement;

function legendInput(extra: Partial<LegendContentInput> = {}): LegendContentInput {
  return {
    bar: makeBar(5, 100),
    index: 5,
    panes: [{ id: 'main', element }, { id: 'rsi', element }, { id: 'hidden-legend', element: undefined }],
    mainSeriesLabel: 'Candles',
    stacked: [],
    hidden: new Set(),
    indicatorValuesAt: () => [],
    formatValue: value => value.toFixed(2),
    notAvailable: 'n/a',
    ...extra,
  };
}

describe('buildLegendContent', () => {
  it('has one group per pane with a legend element, and the main row on the main pane', () => {
    const content = buildLegendContent(legendInput());
    assert.deepEqual(content.map(group => group.paneId), ['main', 'rsi']);
    assert.deepEqual(content[0].series.map(row => [row.kind, row.id, row.label]), [['main', 'main', 'Candles']]);
    assert.deepEqual(content[1].series, []);
  });

  it('adds stacked rows that have a bar at the index, with their own colours', () => {
    const content = buildLegendContent(legendInput({
      stacked: [
        { id: 'eth', options: { borderUpColor: '#0f0', upColor: '#0a0', downColor: '#a00' }, data: Array.from({ length: 10 }, (_, i) => makeBar(i, 50)) },
        { id: 'short', options: {}, data: [makeBar(0, 1)] },
      ],
      hidden: new Set(['eth']),
    }));
    const stacked = content[0].series.filter(row => row.kind === 'stacked');
    assert.deepEqual(stacked.map(row => row.id), ['eth'], 'a series without a bar at the index is left out');
    assert.equal(stacked[0].upColor, '#0f0', 'the border colour wins');
    assert.equal(stacked[0].downColor, '#a00');
    assert.equal(stacked[0].hidden, true);
  });

  it('formats indicator values and marks missing ones', () => {
    const content = buildLegendContent(legendInput({
      indicatorValuesAt: paneId => paneId === 'rsi'
        ? [{ id: 'r1', name: 'RSI', figures: [{ key: 'rsi' }, { key: 'signal' }], data: { rsi: 61.234, signal: Number.NaN } }]
        : [],
    }));
    assert.deepEqual(content[1].indicators, [{ id: 'r1', name: 'RSI', values: [{ key: 'rsi', text: '61.23' }, { key: 'signal', text: 'n/a' }] }]);
  });

  it('has no main row without a main series', () => {
    const content = buildLegendContent(legendInput({ mainSeriesLabel: null }));
    assert.deepEqual(content[0].series, []);
  });
});

describe('buildToolbarContentItems', () => {
  it('lists series, stacked series, indicators, then drawings', () => {
    const items = buildToolbarContentItems({
      series: [{ label: 'Candles', isMain: true }, { label: 'Volume', isMain: false }],
      stacked: [{ id: 'eth', options: { lineColor: '#123' } }],
      indicators: [{ id: 'i1', paneId: 'rsi', label: 'RSI(14)' }],
      overlays: [{ id: 'o1', label: 'Trend line', color: '#f0f' }, { id: 'o2', label: 'Text' }],
      textColor: '#ddd',
    });
    assert.deepEqual(items.map(item => [item.kind, item.id, item.color]), [
      ['series', '0', '#2962FF'],
      ['series', '1', '#ddd'],
      ['stacked', 'eth', '#123'],
      ['indicator', 'i1', '#FF9800'],
      ['overlay', 'o1', '#f0f'],
      ['overlay', 'o2', '#ddd'],
    ]);
    assert.equal(items[3].paneId, 'rsi');
  });

  it('picks a stacked colour from the border, then the line, then the top, then the text colour', () => {
    const colorOf = (options: Record<string, string>) =>
      buildToolbarContentItems({ series: [], stacked: [{ id: 'x', options }], indicators: [], overlays: [], textColor: '#ddd' })[0].color;
    assert.equal(colorOf({ borderUpColor: '#1', lineColor: '#2', topColor: '#3' }), '#1');
    assert.equal(colorOf({ lineColor: '#2', topColor: '#3' }), '#2');
    assert.equal(colorOf({ topColor: '#3' }), '#3');
    assert.equal(colorOf({}), '#ddd');
  });
});
