import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildChartFrame, type ChartFrameInput } from '../../src/model/renderFrame';

const input = (over: Partial<ChartFrameInput> = {}): ChartFrameInput => ({
  width: 800,
  height: 600,
  toolbarHeight: 30,
  xAxisHeight: 20,
  leftGutter: 0,
  rightGutter: 60,
  panes: [
    { id: 'main', kind: 'price', bounding: { top: 50, left: 0, width: 800, height: 380 }, axisSide: 'right' },
    { id: 'rsi', kind: 'indicator', bounding: { top: 434, left: 0, width: 800, height: 146 }, axisSide: 'right' },
  ],
  crosshair: null,
  level: 4,
  ...over,
});

describe('the plot rectangle of a pane', () => {
  it('takes both gutters off the pane width', () => {
    const frame = buildChartFrame(input({ leftGutter: 55, rightGutter: 60 }));
    assert.equal(frame.panes[0].plotWidth, 800 - 55 - 60);
    assert.equal(frame.panes[0].plotHeight, 380);
  });

  it('floors a negative plot width at zero', () => {
    // A container narrower than its own gutters. `clearRect` ignores a negative
    // width silently, and every coordinate derived from it comes out mirrored.
    const frame = buildChartFrame(input({ leftGutter: 500, rightGutter: 400 }));
    assert.equal(frame.panes[0].plotWidth, 0);
  });

  it('measures pane-local coordinates from below the top ruler', () => {
    const frame = buildChartFrame(input());
    assert.deepEqual(frame.plotOrigin, { left: 0, top: 50 });
  });
});

describe('which pane owns the time-axis labels', () => {
  it('marks only the bottom pane as last', () => {
    const frame = buildChartFrame(input());
    assert.deepEqual(frame.panes.map(pane => pane.isLast), [false, true]);
  });

  it('marks a lone pane as last', () => {
    const frame = buildChartFrame(input({
      panes: [{ id: 'main', kind: 'price', bounding: { top: 50, left: 0, width: 800, height: 530 }, axisSide: 'right' }],
    }));
    assert.equal(frame.panes[0].isLast, true);
  });

  it('produces a walkable frame for an empty pane list', () => {
    const frame = buildChartFrame(input({ panes: [] }));
    assert.deepEqual(frame.panes, []);
  });
});

describe('placing the crosshair in a pane', () => {
  it('gives it to the pane it falls in, in that pane\'s coordinates', () => {
    // Plot-relative y of 300 is 300 below the plot top (50), so inside the main
    // pane (top 50, height 380) at local y 300.
    const frame = buildChartFrame(input({ crosshair: { x: 120, y: 300 } }));
    assert.deepEqual(frame.panes[0].crosshair, { x: 120, y: 300 });
    assert.equal(frame.panes[1].crosshair, null);
  });

  it('re-bases it for a lower pane', () => {
    const frame = buildChartFrame(input({ crosshair: { x: 120, y: 450 } }));
    assert.equal(frame.panes[0].crosshair, null);
    // 450 - (434 - 50) = 66 from the top of the RSI pane.
    assert.deepEqual(frame.panes[1].crosshair, { x: 120, y: 66 });
  });

  it('shares the x coordinate, which spans the stack', () => {
    const frame = buildChartFrame(input({ crosshair: { x: 120, y: 450 } }));
    assert.equal(frame.panes[1].crosshair?.x, 120);
  });

  it('gives it to nobody when there is no pointer on the chart', () => {
    const frame = buildChartFrame(input({ crosshair: null }));
    assert.deepEqual(frame.panes.map(pane => pane.crosshair), [null, null]);
  });

  it('gives it to nobody when it falls in the gap between two panes', () => {
    // 384 plot-relative is 434 in container space: the divider, not a pane.
    const frame = buildChartFrame(input({ crosshair: { x: 120, y: 382 } }));
    assert.equal(frame.panes[0].crosshair, null);
    assert.equal(frame.panes[1].crosshair, null);
  });
});

describe('per-pane redraw levels', () => {
  it('gives every pane the chart-wide level', () => {
    const frame = buildChartFrame(input({ level: 3 }));
    assert.deepEqual(frame.panes.map(pane => pane.level), [3, 3]);
    assert.equal(frame.level, 3);
  });

  it('raises one pane above the floor without touching its neighbour', () => {
    const frame = buildChartFrame(input({ level: 1, levelByPane: new Map([['rsi', 4]]) }));
    assert.deepEqual(frame.panes.map(pane => pane.level), [1, 4]);
  });

  it('reports the highest level any pane needs, for the shared chrome', () => {
    // The time rulers are one surface: if any pane forces them to be cleared,
    // they have to be redrawn at that level too.
    const frame = buildChartFrame(input({ level: 1, levelByPane: new Map([['rsi', 4]]) }));
    assert.equal(frame.level, 4);
  });

  it('never lowers a pane below the chart-wide level', () => {
    const frame = buildChartFrame(input({ level: 3, levelByPane: new Map([['rsi', 1]]) }));
    assert.deepEqual(frame.panes.map(pane => pane.level), [3, 3]);
  });
});
