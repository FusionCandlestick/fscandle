import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { DEFAULT_INDICATOR_TEMPLATES, Indicator } from '../../src/plugins/Indicator';
import type { IndicatorResultRow } from '../../src/plugins/Indicator';
import { DataStore } from '../../src/store/DataStore';
import type { KLineData } from '../../src/types';

const MINUTE = 60_000;

/** A deterministic series with trends, reversals and varying volume. */
function series(count: number, start = 0): KLineData[] {
  const bars: KLineData[] = [];
  let price = 100;
  for (let i = start; i < start + count; i += 1) {
    const open = price;
    price = Math.max(1, price + Math.sin(i / 17) * 0.9 + Math.cos(i / 5) * 0.4);
    bars.push({
      timestamp: i * MINUTE,
      open,
      high: Math.max(open, price) + 0.3 + (i % 3) * 0.1,
      low: Math.min(open, price) - 0.3 - (i % 4) * 0.1,
      close: price,
      volume: 1000 + ((i * 37) % 500),
    });
  }
  return bars;
}

function assertSameRows(actual: IndicatorResultRow[], expected: IndicatorResultRow[], label: string) {
  assert.equal(actual.length, expected.length, `${label}: length`);
  for (let i = 0; i < expected.length; i += 1) {
    for (const key of Object.keys(expected[i])) {
      const a = actual[i][key];
      const b = expected[i][key];
      const aFinite = typeof a === 'number' && Number.isFinite(a);
      const bFinite = typeof b === 'number' && Number.isFinite(b);
      assert.equal(aFinite, bFinite, `${label}: row ${i} ${key} finiteness (${a} vs ${b})`);
      if (aFinite && bFinite) {
        assert.ok(Math.abs(a - b) <= 1e-8 * Math.max(1, Math.abs(b)), `${label}: row ${i} ${key} ${a} vs ${b}`);
      }
    }
  }
}

/** Apply bars to a store holding `base`, then compare calcFrom with a full recalculation. */
function check(templateIndex: number, base: KLineData[], updates: KLineData[], label: string) {
  const template = DEFAULT_INDICATOR_TEMPLATES[templateIndex];
  const store = new DataStore();
  store.setData(base.map(bar => ({ ...bar })));
  const incremental = new Indicator('inc', template);
  incremental.calc(store.getData());

  let changedFrom = Number.POSITIVE_INFINITY;
  for (const bar of updates) changedFrom = Math.min(changedFrom, store.addData(bar));
  incremental.calcFrom(store.getData(), changedFrom);

  const full = new Indicator('full', template);
  full.calc(store.getData());
  assertSameRows(incremental.result, full.result, `${template.shortName} ${label}`);
}

describe('Indicator.calcFrom', () => {
  const base = series(3000);
  const last = base[base.length - 1];

  DEFAULT_INDICATOR_TEMPLATES.forEach((template, index) => {
    describe(template.shortName, () => {
      it('matches a full recalculation when the last bar is replaced', () => {
        check(index, base, [{ ...last, close: last.close + 1.5, high: last.high + 1.5 }], 'replace last');
      });

      it('matches a full recalculation when one bar is appended', () => {
        check(index, base, series(1, 3000), 'append one');
      });

      it('matches a full recalculation when a batch is appended', () => {
        check(index, base, series(40, 3000), 'append batch');
      });

      it('matches a full recalculation when an older bar is inserted', () => {
        const withGap = base.filter((_, i) => i !== 2500);
        check(index, withGap, [base[2500]], 'insert older');
      });

      it('matches a full recalculation on a series shorter than the warm-up', () => {
        const short = series(200);
        check(index, short, series(1, 200), 'short series');
      });
    });
  });
});

describe('DataStore.addData', () => {
  it('reports the index of the first bar that changed', () => {
    const store = new DataStore();
    store.setData(series(10));
    assert.equal(store.addData({ ...series(1, 9)[0], close: 1 }), 9, 'replace the last bar');
    assert.equal(store.addData(series(1, 10)[0]), 10, 'append');
    const withGap = series(10).filter((_, i) => i !== 4);
    store.setData(withGap);
    assert.equal(store.addData(series(10)[4]), 4, 'insert out of order');
  });
});

describe('Indicator.calcFrom path', () => {
  /** Wrap a template so the lengths it is asked to compute are recorded. */
  function recording(shortName: string) {
    const template = DEFAULT_INDICATOR_TEMPLATES.find(item => item.shortName === shortName);
    if (!template) throw new Error(`no template ${shortName}`);
    const lengths: number[] = [];
    const wrapped = { ...template, calc: (data: KLineData[], params: number[]) => { lengths.push(data.length); return template.calc(data, params); } };
    return { indicator: new Indicator(shortName, wrapped), lengths };
  }

  it('recomputes only the tail for a converging indicator', () => {
    const { indicator, lengths } = recording('EMA');
    const data = series(3000);
    indicator.calc(data);
    const next = [...data, series(1, 3000)[0]];
    indicator.calcFrom(next, 3000);
    assert.deepEqual(lengths, [3000, 701], 'one full pass, then a 701-row tail');
  });

  it('falls back to a full recalculation for a running total, once', () => {
    const { indicator, lengths } = recording('OBV');
    const data = series(3000);
    indicator.calc(data);
    indicator.calcFrom([...data, series(1, 3000)[0]], 3000);
    indicator.calcFrom([...data, ...series(2, 3000)], 3001);
    assert.deepEqual(lengths, [3000, 701, 3001, 3002], 'the tail is tried once, then skipped');
  });
});
