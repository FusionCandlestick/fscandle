import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { AxisLayoutModel } from '../../src/model/AxisLayoutModel';

/**
 * Price-axis gutter geometry.
 *
 * This arithmetic used to live inline in the chart's hit-test branch, where
 * nothing could reach it. The boundary cases below — which pixel belongs to the
 * plot rather than to column 0, and which column an x lands in when several are
 * stacked — are the ones that produce "clicking the axis grabs the wrong scale"
 * when they are off by one.
 */

const COLUMN = 55;
const CONTAINER = 1000;

const layout = (left: number, right: number) => {
  const model = new AxisLayoutModel(COLUMN, 3);
  model.setColumns(left, right);
  return model;
};

describe('gutter widths', () => {
  it('is one column per scale on each side', () => {
    const model = layout(1, 2);
    assert.equal(model.leftWidth, COLUMN);
    assert.equal(model.rightWidth, COLUMN * 2);
  });

  it('caps each side at the maximum column count', () => {
    const model = layout(9, 9);
    assert.equal(model.leftColumns, 3);
    assert.equal(model.rightColumns, 3);
  });

  it('treats a negative or non-finite count as none', () => {
    const model = layout(-2, Number.NaN);
    assert.equal(model.leftColumns, 0);
    assert.equal(model.rightColumns, 0);
  });
});

describe('chart width', () => {
  it('is the container minus both gutters', () => {
    assert.equal(layout(1, 1).chartWidth(CONTAINER), CONTAINER - COLUMN * 2);
  });

  it('never goes negative, however narrow the container', () => {
    assert.equal(layout(3, 3).chartWidth(100), 0);
  });
});

describe('toChartX', () => {
  it('shifts container coordinates past the left gutter', () => {
    const model = layout(1, 1);
    assert.equal(model.toChartX(COLUMN), 0);
    assert.equal(model.toChartX(COLUMN + 42), 42);
  });

  it('reports negative values inside the left gutter, rather than clamping', () => {
    // Callers use the sign to tell "left of the plot" from "at its edge".
    assert.equal(layout(1, 1).toChartX(0), -COLUMN);
  });
});

describe('isWithinChart', () => {
  it('includes both plot edges and excludes the gutters', () => {
    const model = layout(1, 1);
    assert.equal(model.isWithinChart(COLUMN, CONTAINER), true, 'left edge is plot');
    assert.equal(model.isWithinChart(CONTAINER - COLUMN, CONTAINER), true, 'right edge is plot');
    assert.equal(model.isWithinChart(COLUMN - 1, CONTAINER), false);
    assert.equal(model.isWithinChart(CONTAINER - COLUMN + 1, CONTAINER), false);
  });
});

describe('hitTest', () => {
  it('returns null over the plot', () => {
    assert.equal(layout(1, 1).hitTest(CONTAINER / 2, CONTAINER), null);
  });

  it('numbers columns outward from the plot on the left', () => {
    const model = layout(3, 0);
    // Column 0 is the one against the plot, which on the left is the rightmost.
    assert.deepEqual(model.hitTest(COLUMN * 3 - 1, CONTAINER), { side: 'left', axisIndex: 0 });
    assert.deepEqual(model.hitTest(COLUMN * 2 - 1, CONTAINER), { side: 'left', axisIndex: 1 });
    assert.deepEqual(model.hitTest(0, CONTAINER), { side: 'left', axisIndex: 2 });
  });

  it('numbers columns outward from the plot on the right', () => {
    const model = layout(0, 3);
    const edge = CONTAINER - COLUMN * 3;
    assert.deepEqual(model.hitTest(edge + 1, CONTAINER), { side: 'right', axisIndex: 0 });
    assert.deepEqual(model.hitTest(edge + COLUMN + 1, CONTAINER), { side: 'right', axisIndex: 1 });
    assert.deepEqual(model.hitTest(CONTAINER - 1, CONTAINER), { side: 'right', axisIndex: 2 });
  });

  it('gives the boundary pixel to the plot, not to column 0', () => {
    const model = layout(1, 1);
    // The pixel at exactly leftWidth is the plot's first column of candles.
    assert.equal(model.hitTest(COLUMN, CONTAINER), null);
    assert.deepEqual(model.hitTest(COLUMN - 1, CONTAINER), { side: 'left', axisIndex: 0 });

    assert.equal(model.hitTest(CONTAINER - COLUMN, CONTAINER), null);
    assert.deepEqual(model.hitTest(CONTAINER - COLUMN + 1, CONTAINER), { side: 'right', axisIndex: 0 });
  });

  it('never reports a gutter that is not there', () => {
    const model = layout(0, 1);
    assert.equal(model.hitTest(0, CONTAINER), null, 'no left gutter to hit');
    assert.deepEqual(model.hitTest(CONTAINER - 1, CONTAINER), { side: 'right', axisIndex: 0 });
  });

  it('declines to divide by a zero column width', () => {
    const model = layout(1, 1);
    model.columnWidth = 0;
    assert.equal(model.hitTest(0, CONTAINER), null);
  });
});

describe('columnBounds', () => {
  it('lays left columns out right-to-left so index 0 sits against the plot', () => {
    const model = layout(3, 0);
    assert.equal(model.columnBounds('left', 0, 400).left, COLUMN * 2);
    assert.equal(model.columnBounds('left', 2, 400).left, 0);
  });

  it('lays right columns out left-to-right within their own gutter', () => {
    const model = layout(0, 3);
    assert.equal(model.columnBounds('right', 0, 400).left, 0);
    assert.equal(model.columnBounds('right', 2, 400).left, COLUMN * 2);
  });

  it('carries the column width and the requested height', () => {
    const bounds = layout(0, 1).columnBounds('right', 0, 400);
    assert.equal(bounds.width, COLUMN);
    assert.equal(bounds.height, 400);
    assert.equal(bounds.top, 0);
  });

  it('agrees with hitTest: a column bound maps back to its own index', () => {
    const model = layout(3, 0);
    for (const axisIndex of [0, 1, 2]) {
      const bounds = model.columnBounds('left', axisIndex, 400);
      // Probe one pixel inside the column's right edge.
      const probe = bounds.left + bounds.width - 1;
      assert.deepEqual(model.hitTest(probe, CONTAINER), { side: 'left', axisIndex });
    }
  });
});
