import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { MIN_PANE_WEIGHT, PaneLayoutModel } from '../../src/model/PaneLayoutModel';

const DIVIDER = 4;

const model = (weights?: number[]) => {
  const layout = new PaneLayoutModel(DIVIDER);
  if (weights) layout.setWeights(weights);
  return layout;
};

describe('pane weights', () => {
  it('starts as a single full-height pane', () => {
    assert.deepEqual(model().weights(), [1]);
  });

  it('gives a second pane 30% and leaves the main pane 70%', () => {
    const layout = model();
    layout.appendPane();
    assert.deepEqual(layout.weights(), [0.7, 0.3]);
  });

  it('normalizes to a sum of one', () => {
    const layout = model([2, 1, 1]);
    const total = layout.weights().reduce((sum, weight) => sum + weight, 0);
    assert.ok(Math.abs(total - 1) < 1e-9);
    assert.ok(Math.abs(layout.weights()[0] - 0.5) < 1e-9);
  });

  it('floors a zero weight before rescaling, so no pane has zero height', () => {
    // The floor applies to the input, not the result: 1 and 0 become 1 and 0.1
    // and then rescale to 0.909 and 0.0909. The share ends up just under the
    // minimum, which is expected — what matters is that the pane still exists.
    const layout = model([1, 0]);
    assert.ok(layout.weights()[1] > 0);
    assert.ok(Math.abs(layout.weights()[1] - MIN_PANE_WEIGHT / 1.1) < 1e-9);
  });

  it('replaces non-finite weights rather than propagating them', () => {
    // Restored workspace state is the realistic source of a NaN here; one NaN
    // in the sum would make every pane NaN-high.
    const layout = model([1, Number.NaN]);
    assert.ok(layout.weights().every(weight => Number.isFinite(weight)));
  });

  it('drops the removed pane and keeps at least one', () => {
    const layout = model([0.5, 0.5]);
    layout.removePane(1);
    assert.equal(layout.count, 1);
    layout.removePane(0);
    assert.deepEqual(layout.weights(), [1]);
  });
});

describe('resizing a pair', () => {
  it('moves weight from one pane to its neighbour', () => {
    const layout = model([0.5, 0.5]);
    assert.equal(layout.resizePair(0, 0.1), true);
    assert.deepEqual(layout.weights(), [0.6, 0.4]);
  });

  it('refuses a move that would push a pane below the minimum', () => {
    const layout = model([0.5, 0.5]);
    assert.equal(layout.resizePair(0, 0.45), false);
    assert.deepEqual(layout.weights(), [0.5, 0.5]);
  });

  it('refuses an index with no neighbour', () => {
    const layout = model([0.5, 0.5]);
    assert.equal(layout.resizePair(1, 0.1), false);
    assert.equal(layout.resizePair(-1, 0.1), false);
  });
});

describe('vertical geometry', () => {
  it('stacks one pane over the whole area', () => {
    const boxes = model().boxes(400, 20);
    assert.deepEqual(boxes, [{ top: 20, height: 400 }]);
  });

  it('takes the dividers out of the height the panes share', () => {
    const boxes = model([0.5, 0.5]).boxes(404, 0);
    // 404 less one 4px divider is 400, split evenly.
    assert.deepEqual(boxes, [
      { top: 0, height: 200 },
      { top: 204, height: 200 },
    ]);
  });

  it('leaves no gap and no overflow across three panes', () => {
    const chartAreaHeight = 500;
    const boxes = model([0.6, 0.25, 0.15]).boxes(chartAreaHeight, 30);
    const last = boxes[boxes.length - 1];
    assert.ok(Math.abs(last.top + last.height - (30 + chartAreaHeight)) < 1e-9);
    boxes.slice(1).forEach((box, index) => {
      const previous = boxes[index];
      assert.ok(Math.abs(box.top - (previous.top + previous.height + DIVIDER)) < 1e-9);
    });
  });

  it('reads weights as shares of their own sum, normalized or not', () => {
    const layout = new PaneLayoutModel(DIVIDER);
    layout.setWeights([0.5, 0.5]);
    // Simulate an un-normalized edit through resizePair, which does not rescale.
    layout.resizePair(0, 0.2);
    const boxes = layout.boxes(404, 0);
    assert.ok(Math.abs(boxes[0].height - 280) < 1e-9);
    assert.ok(Math.abs(boxes[1].height - 120) < 1e-9);
  });

  it('reports the divider top between panes and nothing after the last', () => {
    const layout = model([0.5, 0.5]);
    assert.equal(layout.dividerTop(0, 404, 0), 200);
    assert.equal(layout.dividerTop(1, 404, 0), null);
  });

  it('never returns a negative height when the area is smaller than the dividers', () => {
    const boxes = model([0.5, 0.5]).boxes(2, 0);
    assert.ok(boxes.every(box => box.height >= 0));
  });
});

describe('divider drags', () => {
  it('converts pixels against the height the panes actually share', () => {
    // The layout pass and the drag used to disagree here: the drag divided by
    // the full chart area, dividers included, so it under-moved by that
    // fraction. 100px of a 400px pane area is a quarter of the total weight.
    const layout = model([0.5, 0.5]);
    assert.ok(Math.abs(layout.pixelsToWeight(100, 404) - 0.25) < 1e-9);
  });

  it('moves the divider to the cursor', () => {
    const chartAreaHeight = 404;
    const layout = model([0.5, 0.5]);
    const before = layout.dividerTop(0, chartAreaHeight, 0)!;

    const drag = 60;
    layout.resizePair(0, layout.pixelsToWeight(drag, chartAreaHeight));

    assert.ok(Math.abs(layout.dividerTop(0, chartAreaHeight, 0)! - (before + drag)) < 1e-9);
  });

  it('returns no weight change when there is no height to drag in', () => {
    assert.equal(model([0.5, 0.5]).pixelsToWeight(50, 0), 0);
  });
});

describe('configurable pane geometry', () => {
  it('takes the divider height, weight floor and new-pane share from options', () => {
    const layout = new PaneLayoutModel(4, { dividerHeight: 10, minWeight: 0.2, newPaneWeight: 0.5 });
    assert.equal(layout.dividerHeight, 10);
    assert.equal(layout.minWeight, 0.2);
    layout.appendPane();
    assert.deepEqual(layout.weights(), [0.5, 0.5]);
  });

  it('stops a resize at the configured floor rather than the built-in one', () => {
    const layout = new PaneLayoutModel(4, { minWeight: 0.3 });
    layout.setWeights([0.5, 0.5]);
    assert.equal(layout.resizePair(0, 0.15), true, '0.65 / 0.35 clears a floor of 0.3');
    assert.equal(layout.resizePair(0, 0.1), false, 'would push the second pane under 0.3');
  });

  it('renormalizes the weights it already holds when the floor changes', () => {
    // Otherwise raising the floor leaves the stack in a state the floor forbids
    // until something else happens to call normalize.
    const layout = new PaneLayoutModel(4);
    layout.setWeights([0.95, 0.05]);
    layout.setGeometry({ minWeight: 0.4 });
    assert.ok(layout.weights()[1] >= 0.4 / 1.35 - 1e-9);
  });

  it('clamps a floor two panes could not both clear', () => {
    const layout = new PaneLayoutModel(4, { minWeight: 0.9 });
    assert.equal(layout.minWeight, 0.5);
  });

  it('ignores a non-finite geometry value instead of poisoning the layout', () => {
    const layout = new PaneLayoutModel(4, { dividerHeight: Number.NaN, minWeight: Number.NaN });
    assert.equal(layout.dividerHeight, 4);
    assert.equal(layout.minWeight, MIN_PANE_WEIGHT);
  });
});
