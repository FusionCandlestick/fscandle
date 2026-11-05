import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createDrawingOverlay, parseDrawingMode, requiredDrawingPointCount } from '../../src/engine/drawingModes';

const defaults = { color: '#123456', lineWidth: 3 };
const point = { timestamp: 1, value: 2 };
const noTemplate = () => null;

describe('parseDrawingMode', () => {
  it('splits family and variant, defaulting the variant', () => {
    assert.deepEqual(parseDrawingMode('line:ray'), { family: 'line', variant: 'ray' });
    assert.deepEqual(parseDrawingMode('wave'), { family: 'wave', variant: 'default' });
  });
});

describe('requiredDrawingPointCount', () => {
  it('uses the built-in counts per family and variant', () => {
    const cases: Array<[string | null, number]> = [
      [null, 0],
      ['annotation:text', 1],
      ['channel', 3],
      ['wave', 4],
      ['wave:five', 6],
      ['wave:abcde', 5],
      ['line:horizontal', 1],
      ['line:price', 1],
      ['line:trend', 2],
      ['line', 2],
    ];
    for (const [mode, expected] of cases) assert.equal(requiredDrawingPointCount(mode, noTemplate), expected, String(mode));
  });

  it('asks a registered template for any other family, and defaults to two points', () => {
    assert.equal(requiredDrawingPointCount('fib', family => (family === 'fib' ? 3 : null)), 3);
    assert.equal(requiredDrawingPointCount('rect', noTemplate), 2);
    assert.equal(requiredDrawingPointCount('line:trend', () => 9), 2, 'line keeps its own count');
  });
});

describe('createDrawingOverlay', () => {
  it('applies the default colour and width and a fresh id', () => {
    const a = createDrawingOverlay('rect', [point], defaults);
    const b = createDrawingOverlay('rect', [point], defaults);
    assert.equal(a.color, '#123456');
    assert.equal(a.lineWidth, 3);
    assert.equal(a.type, 'rect');
    assert.notEqual(a.id, b.id);
  });

  it('maps line variants to direction and extension', () => {
    const line = (variant: string) => createDrawingOverlay(`line:${variant}`, [point, point], defaults).line;
    assert.deepEqual(line('trend'), { direction: 'free', extendStart: true, extendEnd: true, showPriceLabel: false });
    assert.deepEqual(line('ray'), { direction: 'free', extendStart: false, extendEnd: true, showPriceLabel: false });
    assert.deepEqual(line('segment'), { direction: 'free', extendStart: false, extendEnd: false, showPriceLabel: false });
    assert.deepEqual(line('horizontal-ray'), { direction: 'horizontal', extendStart: false, extendEnd: true, showPriceLabel: false });
    assert.deepEqual(line('price'), { direction: 'horizontal', extendStart: true, extendEnd: true, showPriceLabel: true });
    assert.equal(line('vertical')?.direction, 'vertical');
  });

  it('maps channel, annotation and wave variants', () => {
    assert.deepEqual(createDrawingOverlay('channel:price', [point], defaults).channel, { mode: 'price' });
    assert.deepEqual(createDrawingOverlay('channel', [point], defaults).channel, { mode: 'parallel' });
    assert.deepEqual(createDrawingOverlay('annotation', [point], defaults).annotation, { kind: 'text', placement: 'floating' });
    assert.deepEqual(createDrawingOverlay('annotation:event-earnings', [point], defaults).annotation, { kind: 'tag', placement: 'bottom' });
    assert.deepEqual(createDrawingOverlay('annotation:arrow', [point], defaults).annotation, { kind: 'arrow', placement: 'floating' });
    assert.deepEqual(createDrawingOverlay('wave', [point], defaults).wave, { kind: 'three' });
    assert.deepEqual(createDrawingOverlay('wave:abcd', [point], defaults).wave, { kind: 'abcd' });
  });
});
