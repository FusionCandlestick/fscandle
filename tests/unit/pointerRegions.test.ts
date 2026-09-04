import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { isWithinPlotWidth, resolvePointerRegion } from '../../src/model/pointerRegions';

const layout = {
  width: 800,
  height: 500,
  toolbarHeight: 40,
  xAxisHeight: 24,
  leftGutter: 60,
  rightGutter: 70,
};

const kindAt = (x: number, y: number) => resolvePointerRegion(x, y, layout).kind;

describe('resolving a pointer to a chart region', () => {
  it('reads the toolbar band before anything else', () => {
    assert.equal(kindAt(400, 10), 'toolbar');
    assert.equal(kindAt(400, 40), 'toolbar');
  });

  it('reads the top time ruler just below the toolbar', () => {
    assert.equal(kindAt(400, 41), 'time-axis-top');
    assert.equal(kindAt(400, 63), 'time-axis-top');
  });

  it('reads the plot below the top ruler', () => {
    assert.equal(kindAt(400, 64), 'plot');
  });

  it('reads the bottom time ruler in the last band', () => {
    assert.equal(kindAt(400, 477), 'time-axis-bottom');
    assert.equal(kindAt(400, 499), 'time-axis-bottom');
  });

  it('reads each gutter as its own price axis', () => {
    assert.deepEqual(resolvePointerRegion(20, 250, layout), { kind: 'price-axis', side: 'left' });
    assert.deepEqual(resolvePointerRegion(780, 250, layout), { kind: 'price-axis', side: 'right' });
  });

  it('gives the corner beside a ruler to the axis, not to the ruler', () => {
    // The rulers span the plot's width only. A point level with the top ruler
    // but over the left gutter belongs to the axis it sits next to -- dragging
    // there scales prices, not time.
    assert.deepEqual(resolvePointerRegion(20, 50, layout), { kind: 'price-axis', side: 'left' });
    assert.deepEqual(resolvePointerRegion(780, 490, layout), { kind: 'price-axis', side: 'right' });
  });

  it('treats the gutter edges as plot, matching the drag handlers', () => {
    // `x === leftGutter` is the first plot pixel; the axis owns everything
    // strictly left of it.
    assert.equal(kindAt(60, 250), 'plot');
    assert.equal(kindAt(59.9, 250), 'price-axis');
    assert.equal(kindAt(730, 250), 'plot');
    assert.equal(kindAt(730.1, 250), 'price-axis');
  });

  it('covers the surface: every point resolves to exactly one region', () => {
    const kinds = new Set<string>();
    for (let x = 0; x <= layout.width; x += 7) {
      for (let y = 0; y <= layout.height; y += 7) {
        const region = resolvePointerRegion(x, y, layout);
        assert.ok(region.kind, `no region at ${x},${y}`);
        kinds.add(region.kind);
      }
    }
    assert.deepEqual(
      [...kinds].sort(),
      ['plot', 'price-axis', 'time-axis-bottom', 'time-axis-top', 'toolbar'],
    );
  });

  it('survives a chart with no toolbar and no gutters', () => {
    const bare = { ...layout, toolbarHeight: 0, leftGutter: 0, rightGutter: 0 };
    assert.equal(resolvePointerRegion(0, 0, bare).kind, 'toolbar');
    assert.equal(resolvePointerRegion(400, 1, bare).kind, 'time-axis-top');
    assert.equal(resolvePointerRegion(400, 250, bare).kind, 'plot');
  });

  it('reports plot width membership on the same boundaries', () => {
    assert.equal(isWithinPlotWidth(60, layout), true);
    assert.equal(isWithinPlotWidth(59, layout), false);
    assert.equal(isWithinPlotWidth(730, layout), true);
    assert.equal(isWithinPlotWidth(731, layout), false);
  });
});
