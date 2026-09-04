import assert from 'node:assert/strict';
import test, { describe } from 'node:test';

import { CoordinateTransformer } from '../../src/engine/CoordinateTransformer';
import { PaneTransformers } from '../../src/engine/PaneTransformers';

const mainTransformer = () => {
  const transformer = new CoordinateTransformer();
  transformer.setDimensions(600, 300);
  transformer.setRange(100, 200);
  return transformer;
};

describe('per-pane coordinate transformers', () => {
  test('the main pane keeps using the chart transformer', () => {
    const main = mainTransformer();
    const transformers = new PaneTransformers(main);
    assert.equal(transformers.for('main'), main);
    assert.equal(transformers.find('main'), main);
  });

  test('a sub-pane gets its own instance, created once', () => {
    const transformers = new PaneTransformers(mainTransformer());
    const rsi = transformers.for('pane_rsi');
    assert.notEqual(rsi, transformers.for('main'));
    assert.equal(transformers.for('pane_rsi'), rsi);
  });

  test('a sub-pane range does not leak into the main pane', () => {
    const main = mainTransformer();
    const transformers = new PaneTransformers(main);

    // What a frame does: the main pane scales to prices, then an RSI pane
    // scales to 0-100 on its own transformer.
    const rsi = transformers.for('pane_rsi');
    rsi.setDimensions(600, 120);
    rsi.setRange(0, 100);

    // The regression: reading a price back from the main pane after the frame.
    const midPrice = main.yToPrice(main.priceToY(150));
    assert.ok(Math.abs(midPrice - 150) < 1e-6, `main pane price was ${midPrice}`);
    assert.deepEqual(main.getRange(), { min: 100, max: 200 });

    // And the RSI pane still answers in its own space.
    assert.ok(Math.abs(rsi.yToPrice(rsi.priceToY(70)) - 70) < 1e-6);
  });

  test('new sub-pane transformers are configured by the owner', () => {
    const configured: CoordinateTransformer[] = [];
    const transformers = new PaneTransformers(mainTransformer(), transformer => {
      configured.push(transformer);
      transformer.setRightMarginRatio(0);
    });

    const pane = transformers.for('pane_macd');
    assert.deepEqual(configured, [pane]);
    pane.setDimensions(600, 120);
    pane.setBarSpacing(10);
    pane.setOffset(0);
    // Right margin 0 means the last bar sits at the right edge, not at 80%.
    assert.equal(pane.indexToX(0), 595);
  });

  test('find does not create, retain forgets removed panes', () => {
    const transformers = new PaneTransformers(mainTransformer());
    assert.equal(transformers.find('pane_rsi'), null);
    assert.equal(transformers.has('pane_rsi'), false);

    const rsi = transformers.for('pane_rsi');
    transformers.for('pane_macd');
    assert.equal(transformers.has('pane_rsi'), true);

    transformers.retain(['main', 'pane_rsi']);
    assert.equal(transformers.find('pane_rsi'), rsi);
    assert.equal(transformers.find('pane_macd'), null);
    // The main pane is never forgotten, whatever the pane list says.
    assert.equal(transformers.has('main'), true);
  });

  test('forEach visits the main transformer and every sub-pane', () => {
    const main = mainTransformer();
    const transformers = new PaneTransformers(main);
    transformers.for('pane_rsi');
    transformers.for('pane_macd');

    const visited: CoordinateTransformer[] = [];
    transformers.forEach(transformer => visited.push(transformer));
    assert.equal(visited.length, 3);
    assert.ok(visited.includes(main));
  });
});
