import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  InteractionController,
  type InteractionHost,
} from '../../src/engine/InteractionController';
import type { EventController } from '../../src/engine/EventController';
import type { Pane } from '../../src/engine/Pane';
import type { Overlay } from '../../src/engine/OverlayManager';

/**
 * The whole point of the extraction: gestures driven with plain numbers, no
 * canvas, no document, no pointer device. The host below records what the
 * controller asked the chart to do.
 */

const SURFACE = { width: 800, height: 600, toolbarHeight: 0, xAxisHeight: 20, leftGutter: 0, rightGutter: 60 };

const pane = (id: string, top: number, height: number, side: 'left' | 'right' = 'right') => ({
  getId: () => id,
  getBounding: () => ({ top, height, width: 800, left: 0 }),
  getYAxisSide: () => side,
}) as unknown as Pane;

interface Recorder {
  zooms: Array<{ factor: number; centerX?: number }>;
  zoomYs: Array<{ factor: number; paneId: string }>;
  pans: number[];
  verticalPans: Array<{ paneId: string; deltaY: number }>;
  resizes: Array<{ index: number; delta: number }>;
  events: Array<{ name: string; x: number; y: number }>;
  drawPoints: Array<{ x: number; y: number; paneId: string }>;
  handleMoves: Array<{ id: string; index: number; x: number; y: number }>;
  bodyMoves: Array<{ id: string; dx: number }>;
  selections: Array<string | null>;
  removed: string[];
  relayouts: number;
}

function makeHost(overrides: Partial<InteractionHost> = {}) {
  const recorder: Recorder = {
    zooms: [], zoomYs: [], pans: [], verticalPans: [], resizes: [], events: [],
    drawPoints: [], handleMoves: [], bodyMoves: [], selections: [], removed: [], relayouts: 0,
  };
  const style: Record<string, string> = {};

  const host: InteractionHost = {
    container: () => ({ style } as unknown as HTMLDivElement),
    containerRect: () => ({ left: 0, top: 0, width: 800, height: 600 } as DOMRect),
    surfaceLayout: () => SURFACE,
    insets: () => ({ toolbarHeight: 0, xAxisHeight: 20, left: 0, right: 60 }),
    panes: () => [pane('main', 20, 400), pane('vol', 424, 156)],
    paneAt: containerY => (containerY < 424 ? pane('main', 20, 400) : pane('vol', 424, 156)),
    paneStackHeight: () => 560,

    transformer: () => ({ xToIndex: (x: number) => Math.round(x / 10) }) as never,
    barSpacing: () => 10,
    panHorizontallyBy: delta => recorder.pans.push(delta),
    panPaneVertically: (paneId, deltaY) => recorder.verticalPans.push({ paneId, deltaY }),
    zoom: (factor, centerX) => recorder.zooms.push({ factor, centerX }),
    zoomY: (factor, paneId) => recorder.zoomYs.push({ factor, paneId }),
    resizePanes: (index, delta) => {
      recorder.resizes.push({ index, delta });
      return true;
    },
    pixelsToPaneWeight: (pixels, height) => pixels / height,
    panesResizable: () => true,
    panEnabled: () => true,
    zoomEnabled: () => true,
    syncViewport: () => {},
    syncCrosshair: () => {},

    hitTestMainPanePriceScale: containerX => (containerX > 740 ? 'main' : null),
    findMainPaneSeriesDragTarget: () => null,
    preparePaneTransformer: () => {},
    findOverlayHandleAt: () => null,
    findOverlayAt: () => null,

    activeDrawingType: () => null,
    isCreatingOverlay: () => false,
    inProgressDrawing: () => null,
    drawingPointerDown: (x, y, paneId) => recorder.drawPoints.push({ x, y, paneId }),
    drawingPointerMove: () => {},
    cancelInProgressDrawing: () => {},
    setDrawingMode: () => {},
    moveOverlayHandle: (overlay, index, x, y) => recorder.handleMoves.push({ id: overlay.id, index, x, y }),
    moveOverlayBody: (overlay, _points, dx) => recorder.bodyMoves.push({ id: overlay.id, dx }),
    selectedOverlay: () => null,
    selectOverlay: overlay => recorder.selections.push(overlay?.id ?? null),
    removeOverlay: id => recorder.removed.push(id),
    emitOverlayEvent: () => {},

    setCrosshairPosition: () => {},
    setHoveredIndex: () => {},
    hasSubscribers: () => true,
    emitPointerEvent: (name, x, y) => recorder.events.push({ name, x, y }),
    emitCrosshairLeave: () => recorder.events.push({ name: 'crosshairLeave', x: NaN, y: NaN }),
    dispatchPrimitivePointer: () => false,
    closeSeriesStyleMenu: () => {},
    editOverlayText: () => {},
    update: () => {},
    relayout: () => {
      recorder.relayouts += 1;
    },
    saveState: () => {},
    ...overrides,
  };

  const events = { on: () => () => {} } as unknown as EventController;
  return { controller: new InteractionController(host, events), recorder, style };
}

const pointer = (x: number, y: number, id = 1) =>
  ({ clientX: x, clientY: y, pointerId: id, preventDefault: () => {} }) as unknown as PointerEvent;

describe('panning the plot', () => {
  it('pans horizontally and vertically by the pointer delta', () => {
    const { controller, recorder } = makeHost();
    controller.handlePointerDown(pointer(300, 200));
    controller.handlePointerMove(340, 230, pointer(340, 230));

    assert.deepEqual(recorder.pans, [40]);
    assert.deepEqual(recorder.verticalPans, [{ paneId: 'main', deltaY: 30 }]);
  });

  it('applies the vertical pan to the pane the press landed in', () => {
    const { controller, recorder } = makeHost();
    controller.handlePointerDown(pointer(300, 500));
    controller.handlePointerMove(300, 520, pointer(300, 520));
    assert.deepEqual(recorder.verticalPans, [{ paneId: 'vol', deltaY: 20 }]);
  });

  it('stops panning on pointer up', () => {
    const { controller, recorder } = makeHost();
    controller.handlePointerDown(pointer(300, 200));
    controller.handlePointerUp(pointer(300, 200));
    controller.handlePointerMove(400, 200, pointer(400, 200));
    assert.deepEqual(recorder.pans, []);
  });
});

describe('scaling from the axes', () => {
  it('ignores a time-ruler drag under the threshold, so a click does not rescale', () => {
    const { controller, recorder } = makeHost();
    controller.handlePointerDown(pointer(300, 590)); // bottom ruler
    controller.handlePointerMove(303, 590, pointer(303, 590));
    assert.deepEqual(recorder.zooms, []);
  });

  it('scales time once the drag passes the threshold', () => {
    const { controller, recorder } = makeHost();
    controller.handlePointerDown(pointer(300, 590));
    // The move that crosses the threshold re-baselines and scales by 1; the
    // gesture is measured from there, so it cannot jump by the threshold.
    controller.handlePointerMove(320, 590, pointer(320, 590));
    assert.deepEqual(recorder.zooms.map(zoom => zoom.factor), [1]);

    controller.handlePointerMove(340, 590, pointer(340, 590));
    assert.equal(recorder.zooms.length, 2);
    assert.ok(recorder.zooms[1].factor > 1, 'dragging right zooms in');
  });

  it('scales the price axis the press landed on', () => {
    const { controller, recorder } = makeHost();
    controller.handlePointerDown(pointer(780, 200)); // right gutter, main pane
    controller.handlePointerMove(780, 160, pointer(780, 160));
    assert.equal(recorder.zoomYs.length, 1);
    assert.equal(recorder.zoomYs[0].paneId, 'main');
    assert.ok(recorder.zoomYs[0].factor > 1, 'dragging up zooms in');
  });

  it('treats a gutter press that hits no scale as a plot press', () => {
    // The main pane's gutter is shared by stacked scales; a press between them
    // is not an axis drag.
    const { controller, recorder } = makeHost({ hitTestMainPanePriceScale: () => null });
    controller.handlePointerDown(pointer(780, 200));
    controller.handlePointerMove(760, 200, pointer(760, 200));
    assert.deepEqual(recorder.zoomYs, []);
    assert.deepEqual(recorder.pans, [-20]);
  });
});

describe('the wheel', () => {
  const wheel = (over: Partial<WheelEvent>) =>
    ({ clientX: 300, clientY: 200, deltaX: 0, deltaY: 0, ctrlKey: false, metaKey: false, preventDefault: () => {}, ...over }) as WheelEvent;

  it('zooms time when a modifier is held', () => {
    const { controller, recorder } = makeHost();
    controller.handleWheel(wheel({ deltaY: -1, ctrlKey: true }));
    assert.equal(recorder.zooms.length, 1);
    assert.equal(recorder.zooms[0].factor, 1.05);
  });

  it('zooms the price scale over a price gutter', () => {
    const { controller, recorder } = makeHost();
    controller.handleWheel(wheel({ clientX: 780, deltaY: 1 }));
    assert.deepEqual(recorder.zoomYs, [{ factor: 0.95, paneId: 'main' }]);
  });

  it('pans on a horizontal scroll, in the direction of the gesture', () => {
    const { controller, recorder } = makeHost();
    controller.handleWheel(wheel({ deltaX: 30 }));
    assert.deepEqual(recorder.pans, [-30]);
  });
});

describe('click detection', () => {
  it('reports a press and release in the same place as a click', () => {
    const { controller, recorder } = makeHost();
    controller.handlePointerDown(pointer(300, 200));
    controller.handlePointerUp(pointer(301, 201));
    assert.deepEqual(recorder.events.map(event => event.name), ['click']);
  });

  it('does not report a pan as a click, even one that ends where it began', () => {
    const { controller, recorder } = makeHost();
    controller.handlePointerDown(pointer(300, 200));
    controller.handlePointerMove(400, 200, pointer(400, 200));
    controller.handlePointerMove(300, 200, pointer(300, 200));
    controller.handlePointerUp(pointer(300, 200));
    assert.equal(recorder.events.filter(event => event.name === 'click').length, 0);
  });

  it('reports a second quick click in the same place as a double click', () => {
    const { controller, recorder } = makeHost();
    controller.handlePointerDown(pointer(300, 200));
    controller.handlePointerUp(pointer(300, 200));
    controller.handlePointerDown(pointer(300, 200));
    controller.handlePointerUp(pointer(300, 200));
    assert.deepEqual(recorder.events.map(event => event.name), ['click', 'click', 'dblClick']);
  });

  it('does not report a third click as another double', () => {
    const { controller, recorder } = makeHost();
    for (let i = 0; i < 3; i += 1) {
      controller.handlePointerDown(pointer(300, 200));
      controller.handlePointerUp(pointer(300, 200));
    }
    assert.equal(recorder.events.filter(event => event.name === 'dblClick').length, 1);
  });
});

describe('resizing panes by their divider', () => {
  it('moves weight across the divider and re-lays out', () => {
    // The regression this exists for: nothing set the dragging-divider index,
    // so the divider drew, offered a resize cursor, and did nothing.
    const { controller, recorder } = makeHost();
    controller.beginDividerDrag(0, 400);
    controller.handlePointerMove(300, 450, pointer(300, 450));

    assert.equal(recorder.resizes.length, 1);
    assert.equal(recorder.resizes[0].index, 0);
    assert.ok(Math.abs(recorder.resizes[0].delta - 50 / 560) < 1e-9);
    assert.equal(recorder.relayouts, 1);
  });

  it('does nothing when panes are not resizable', () => {
    const { controller, recorder } = makeHost({ panesResizable: () => false });
    controller.beginDividerDrag(0, 400);
    controller.handlePointerMove(300, 450, pointer(300, 450));
    assert.deepEqual(recorder.resizes, []);
  });

  it('ignores a divider index the pane stack does not have', () => {
    const { controller, recorder } = makeHost();
    controller.beginDividerDrag(5, 400);
    controller.handlePointerMove(300, 450, pointer(300, 450));
    assert.deepEqual(recorder.resizes, []);
  });

  it('releases the divider on pointer up', () => {
    const { controller, recorder } = makeHost();
    controller.beginDividerDrag(0, 400);
    controller.handlePointerUp(pointer(300, 400));
    controller.handlePointerMove(300, 500, pointer(300, 500));
    assert.deepEqual(recorder.resizes, []);
  });
});

describe('two-finger gestures', () => {
  it('a second pointer starts a pinch and abandons the pan in flight', () => {
    const { controller, recorder } = makeHost();
    controller.handlePointerDown(pointer(300, 200, 1));
    controller.handlePointerDown(pointer(400, 200, 2));
    assert.equal(controller.isPinching(), true);

    controller.handlePointerMove(280, 200, pointer(280, 200, 1));
    // Spreading the fingers zooms; the pan that was in flight does not resume.
    assert.equal(recorder.zooms.length, 1);
    assert.ok(recorder.zooms[0].factor > 1);
  });

  it('a vertical pinch scales price rather than time', () => {
    const { controller, recorder } = makeHost();
    controller.handlePointerDown(pointer(300, 150, 1));
    controller.handlePointerDown(pointer(300, 250, 2));
    controller.handlePointerMove(300, 300, pointer(300, 300, 2));

    assert.equal(recorder.zooms.length, 0);
    assert.equal(recorder.zoomYs.length, 1);
    assert.ok(recorder.zoomYs[0].factor > 1);
  });

  it('lifting one finger ends the pinch without turning the other into a pan', () => {
    const { controller, recorder } = makeHost();
    controller.handlePointerDown(pointer(300, 200, 1));
    controller.handlePointerDown(pointer(400, 200, 2));
    controller.handlePointerUp(pointer(400, 200, 2));
    assert.equal(controller.isPinching(), false);

    controller.handlePointerMove(350, 200, pointer(350, 200, 1));
    assert.deepEqual(recorder.pans, []);
  });
});

describe('drawing and overlays', () => {
  const overlay = { id: 'o1', points: [{ timestamp: 1, value: 2 }] } as Overlay;

  it('routes a press to the drawing tool rather than to a handle drag', () => {
    // Placing a later point on a provisional overlay must not be read as
    // grabbing one of its handles.
    const { controller, recorder } = makeHost({
      activeDrawingType: () => 'line',
      findOverlayHandleAt: () => ({ overlay, pointIndex: 0 }),
    });
    controller.handlePointerDown(pointer(300, 200));

    assert.deepEqual(recorder.drawPoints, [{ x: 300, y: 180, paneId: 'main' }]);
    assert.deepEqual(recorder.handleMoves, []);
  });

  it('drags a handle that was pressed', () => {
    const { controller, recorder } = makeHost({
      findOverlayHandleAt: () => ({ overlay, pointIndex: 1 }),
    });
    controller.handlePointerDown(pointer(300, 200));
    controller.handlePointerMove(320, 210, pointer(320, 210));

    assert.deepEqual(recorder.selections, ['o1']);
    assert.deepEqual(recorder.handleMoves, [{ id: 'o1', index: 1, x: 320, y: 190 }]);
    assert.deepEqual(recorder.pans, [], 'a handle drag is not also a pan');
  });

  it('drags a whole overlay pressed on its body', () => {
    const { controller, recorder } = makeHost({ findOverlayAt: () => overlay });
    controller.handlePointerDown(pointer(300, 200));
    controller.handlePointerMove(330, 200, pointer(330, 200));
    assert.deepEqual(recorder.bodyMoves, [{ id: 'o1', dx: 30 }]);
  });

  it('deselects when the press lands on empty plot', () => {
    const { controller, recorder } = makeHost();
    controller.handlePointerDown(pointer(300, 200));
    assert.deepEqual(recorder.selections, [null]);
  });

  it('removes the selected overlay on Delete', () => {
    const { controller, recorder } = makeHost({ selectedOverlay: () => overlay });
    controller.handleKeyDown({ key: 'Delete', preventDefault: () => {} } as KeyboardEvent);
    assert.deepEqual(recorder.removed, ['o1']);
  });

  it('cancels a drawing in progress on Escape', () => {
    let cancelled = 0;
    const { controller } = makeHost({ cancelInProgressDrawing: () => { cancelled += 1; } });
    controller.handleKeyDown({ key: 'Escape', preventDefault: () => {} } as KeyboardEvent);
    assert.equal(cancelled, 1);
  });
});

describe('panes that go away', () => {
  it('forgets a removed pane rather than keeping it as the gesture target', () => {
    const { controller, recorder } = makeHost();
    controller.handlePointerDown(pointer(300, 500)); // press in the volume pane
    assert.equal(controller.activePricePaneId(), 'vol');

    controller.forgetPane('vol');
    controller.handlePointerMove(300, 520, pointer(300, 520));
    assert.deepEqual(recorder.verticalPans, [{ paneId: 'main', deltaY: 20 }]);
  });
});

describe('a chart that may not move', () => {
  // An embedded readout — a sparkline on a card — wants the crosshair to follow
  // the pointer while the line stays where it was put. Turning pointer events
  // off on the container achieves the second half by giving up the first.
  it('tracks the pointer but does not pan when panning is off', () => {
    const { controller, recorder } = makeHost({ panEnabled: () => false });
    controller.handlePointerDown(pointer(300, 200));
    controller.handlePointerMove(340, 230, pointer(340, 230));

    assert.deepEqual(recorder.pans, []);
    assert.deepEqual(recorder.verticalPans, []);
    assert.equal(recorder.events.some(event => event.name === 'crosshairMove'), true);
  });

  it('does not scale from an axis drag when zooming is off', () => {
    const { controller, recorder } = makeHost({ zoomEnabled: () => false });
    controller.handlePointerDown(pointer(780, 200)); // price gutter
    controller.handlePointerMove(780, 160, pointer(780, 160));
    controller.handlePointerDown(pointer(300, 590)); // time ruler
    controller.handlePointerMove(340, 590, pointer(340, 590));

    assert.deepEqual(recorder.zoomYs, []);
    assert.deepEqual(recorder.zooms, []);
  });

  it('leaves the wheel to the page when neither gesture is allowed', () => {
    let prevented = 0;
    const { controller, recorder } = makeHost({ panEnabled: () => false, zoomEnabled: () => false });
    controller.handleWheel({
      clientX: 300, clientY: 200, deltaX: 30, deltaY: -1, ctrlKey: false, metaKey: false,
      preventDefault: () => { prevented += 1; },
    } as unknown as WheelEvent);

    assert.equal(prevented, 0, 'the page has to be able to scroll past the chart');
    assert.deepEqual(recorder.zooms, []);
    assert.deepEqual(recorder.pans, []);
  });

  it('still zooms and pans when both are allowed', () => {
    const { controller, recorder } = makeHost();
    controller.handlePointerDown(pointer(300, 200));
    controller.handlePointerMove(340, 200, pointer(340, 200));
    assert.deepEqual(recorder.pans, [40]);
  });
});
