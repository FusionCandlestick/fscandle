import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { cloneOptionTree, mergeOptionTree } from '../../src/model/optionTree';

describe('merging option trees', () => {
  it('keeps siblings the override never mentions', () => {
    // The failure the hand-written merge kept producing: set one field of a
    // group and the rest of the group disappears.
    const base = { grid: { vertLines: { visible: true, color: '#111' } } };
    const merged = mergeOptionTree(base, { grid: { vertLines: { visible: false } } });

    assert.deepEqual(merged.grid.vertLines, { visible: false, color: '#111' });
  });

  it('merges a group the schema gained without anyone updating a merge branch', () => {
    const base = { future: { family: { a: 1, b: 2 } } };
    const merged = mergeOptionTree(base, { future: { family: { b: 3 } } });

    assert.deepEqual(merged.future.family, { a: 1, b: 3 });
  });

  it('adds keys the base never had', () => {
    const merged = mergeOptionTree({ layout: { color: '#000' } } as Record<string, unknown>, {
      layout: { fontSize: 10 },
    });

    assert.deepEqual(merged, { layout: { color: '#000', fontSize: 10 } });
  });

  it('leaves the base untouched', () => {
    const base = { layout: { background: { color: '#111' } } };
    mergeOptionTree(base, { layout: { background: { color: '#fff' } } });

    assert.equal(base.layout.background.color, '#111');
  });

  it('treats undefined as "not mentioned", which is what DeepPartial produces', () => {
    const base = { crosshair: { visible: true, color: '#abc' } };
    const merged = mergeOptionTree(base, { crosshair: { color: undefined } });

    assert.equal(merged.crosshair.color, '#abc');
  });

  it('treats null as a value and replaces with it', () => {
    const merged = mergeOptionTree({ localization: { timeZone: 'UTC' } }, { localization: { timeZone: null } });

    assert.equal(merged.localization.timeZone, null);
  });

  it('replaces an atomic option instead of mixing two of them', () => {
    // `period` is `'15m'` or a Period object; the two forms are alternatives.
    // Merging one Period over another would produce a third interval nobody
    // asked for.
    const base = { timeScale: { period: { unit: 'minute', value: 15 } } };
    const merged = mergeOptionTree(base, { timeScale: { period: { unit: 'day', value: 1 } } });

    assert.deepEqual(merged.timeScale.period, { unit: 'day', value: 1 });
  });

  it('replaces an atomic object with the string form', () => {
    const base = { timeScale: { session: { timeZone: 'America/New_York' } } };
    const merged = mergeOptionTree(base, { timeScale: { session: 'crypto-24x7' } });

    assert.equal(merged.timeScale.session, 'crypto-24x7');
  });

  it('carries a function-valued option rather than merging into it', () => {
    const formatter = (price: number) => price.toFixed(2);
    const merged = mergeOptionTree({ localization: { priceFormatter: undefined } }, { localization: { priceFormatter: formatter } });

    assert.equal(merged.localization.priceFormatter, formatter);
  });

  it('replaces an array wholesale', () => {
    const merged = mergeOptionTree({ items: [1, 2, 3] }, { items: [9] });

    assert.deepEqual(merged.items, [9]);
  });

  it('replaces a class instance wholesale', () => {
    // Field-by-field merging a Date yields something that is neither date.
    const next = new Date('2026-01-02T00:00:00Z');
    const merged = mergeOptionTree({ at: new Date('2020-01-01T00:00:00Z') }, { at: next });

    assert.equal(merged.at, next);
  });

  it('returns the base when there is nothing to apply', () => {
    const base = { layout: { color: '#000' } };
    assert.equal(mergeOptionTree(base, undefined), base);
  });
});

describe('copying option trees', () => {
  it('copies nested groups deeply enough that a mutation cannot reach back', () => {
    const source = { grid: { vertLines: { visible: true } } };
    const copy = cloneOptionTree(source);
    copy.grid.vertLines.visible = false;

    assert.equal(source.grid.vertLines.visible, true);
  });

  it('shares functions instead of trying to copy them', () => {
    // structuredClone throws on this, which is why it is not used here.
    const formatter = (price: number) => `${price}`;
    const copy = cloneOptionTree({ localization: { priceFormatter: formatter } });

    assert.equal(copy.localization.priceFormatter, formatter);
  });

  it('shares class instances rather than flattening them into plain objects', () => {
    const at = new Date('2026-01-01T00:00:00Z');
    const copy = cloneOptionTree({ at });

    assert.equal(copy.at, at);
  });

  it('copies arrays without aliasing the original', () => {
    const source = { items: [{ id: 1 }] };
    const copy = cloneOptionTree(source);
    copy.items[0].id = 2;

    assert.equal(source.items[0].id, 1);
    assert.notEqual(copy.items, source.items);
  });

  it('shares an atomic option, which is a value and not a tree', () => {
    const period = { unit: 'minute', value: 15 };
    const copy = cloneOptionTree({ timeScale: { period } });

    assert.equal(copy.timeScale.period, period);
  });

  it('passes primitives through', () => {
    assert.equal(cloneOptionTree(7), 7);
    assert.equal(cloneOptionTree('a'), 'a');
    assert.equal(cloneOptionTree(null), null);
    assert.equal(cloneOptionTree(undefined), undefined);
  });
});
