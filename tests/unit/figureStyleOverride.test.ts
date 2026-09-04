import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { applyFigureStyleOverride } from '../../src/engine/OverlayFigure';
import type { OverlayFigure } from '../../src/engine/OverlayFigure';

const line = (): OverlayFigure => ({
  type: 'line',
  attrs: { coordinates: [{ x: 0, y: 0 }, { x: 10, y: 10 }] },
  styles: { color: '#111', lineWidth: 2, dashedValue: [3, 3] },
});
const handle = (): OverlayFigure => ({ type: 'circle', attrs: { x: 5, y: 5, r: 4 } });

describe('overriding figure styles', () => {
  it('returns the figures untouched when there is no override', () => {
    const figures = [line()];
    assert.equal(applyFigureStyleOverride(figures, undefined), figures);
  });

  it('merges over the template style instead of replacing it', () => {
    // A partial override has to stay partial: set only the colour and the
    // template's dash pattern and width must survive, or every override turns
    // into a full restyle.
    const [figure] = applyFigureStyleOverride([line()], { color: '#f00' });
    assert.deepEqual(figure.styles, { color: '#f00', lineWidth: 2, dashedValue: [3, 3] });
  });

  it('styles a figure that had none', () => {
    const [figure] = applyFigureStyleOverride([handle()], { color: '#0f0' });
    assert.deepEqual(figure.styles, { color: '#0f0' });
  });

  it('lets a function style each figure differently', () => {
    const figures = applyFigureStyleOverride(
      [line(), handle()],
      figure => (figure.type === 'circle' ? { color: '#00f' } : { color: '#f00' }),
    );
    assert.equal(figures[0].styles?.color, '#f00');
    assert.equal(figures[1].styles?.color, '#00f');
  });

  it('passes the index so repeated shapes can differ', () => {
    const figures = applyFigureStyleOverride([handle(), handle()], (_figure, index) => ({
      color: index === 0 ? '#111' : '#222',
    }));
    assert.deepEqual(figures.map(f => f.styles?.color), ['#111', '#222']);
  });

  it('leaves a figure alone when the function returns nothing', () => {
    const figures = [line()];
    const result = applyFigureStyleOverride(figures, () => undefined);
    assert.deepEqual(result[0].styles, figures[0].styles);
  });

  it('does not mutate the figures it was given', () => {
    const figures = [line()];
    const before = JSON.stringify(figures);
    applyFigureStyleOverride(figures, { color: '#f00' });
    assert.equal(JSON.stringify(figures), before);
  });
});
