/**
 * Pointer, wheel and keyboard gestures, as their own layer.
 *
 * Pan, price-axis scale, time-axis scale, pinch, divider resize, overlay drag,
 * click and double-click detection lived in the chart facade beside the render
 * pass -- `_handlePointerDown` alone was 222 lines. That placement had two
 * costs. Every gesture reached straight into rendering state, so a change to
 * either could break the other silently; and none of it could be exercised
 * without a canvas, a pointer device and a laid-out DOM, which is why the
 * divider drag could lose its only writer and go unnoticed (`_isDraggingDivider`
 * was read on every pointer move and set by nothing).
 *
 * Everything here talks to the chart through `InteractionHost`, the same
 * pattern the GUI widgets use. A test supplies a host object and drives the
 * handlers with plain event-shaped values; no document is involved.
 *
 * What is deliberately *not* here: the drawing-tool state machine. Placing a
 * point, running a template's draw step and completing an overlay are overlay
 * model operations that happen to be triggered by a press, and they live with
 * the overlay code. This layer decides that a press means "draw" and hands over
 * the coordinates.
 */

import type { CoordinateTransformer } from './CoordinateTransformer';
import type { Pane } from './Pane';
import type { Overlay } from './OverlayManager';
import type { ChartSurfaceLayout } from '../model/pointerRegions';
import { resolvePointerRegion } from '../model/pointerRegions';
import type { PrimitivePointerPhase } from './PointerEvents';
import type { EventController } from './EventController';

/** Invalidation levels, mirrored so this module does not import the facade. */
enum GestureInvalidation {
  Cursor = 1,
  Overlay = 2,
  Light = 3,
  Full = 4,
}

/** A point, in whatever space the surrounding code names. */
interface Point {
  x: number;
  y: number;
}

/** Anchor points of an overlay, as a whole-body drag starts with. */
export type OverlayPoints = Array<{ timestamp: number; value: number }>;

/**
 * What a gesture needs from the chart.
 *
 * Grouped by what it is for rather than by which chart field backs it: geometry
 * the handlers measure against, viewport operations they perform, hit tests they
 * ask for, and the notifications they raise.
 */
export interface InteractionHost {
  // ── Geometry ────────────────────────────────────────────────────────────
  container(): HTMLDivElement;
  containerRect(): DOMRect;
  surfaceLayout(rect: DOMRect): ChartSurfaceLayout;
  /** Toolbar height, ruler height and gutter widths, in CSS pixels. */
  insets(): { toolbarHeight: number; xAxisHeight: number; left: number; right: number };
  panes(): Pane[];
  paneAt(containerY: number): Pane | null;
  /** Height the pane stack shares, which is what a divider drag is measured in. */
  paneStackHeight(): number;

  // ── Viewport ────────────────────────────────────────────────────────────
  transformer(): CoordinateTransformer;
  barSpacing(): number;
  /** Pan horizontally by a pixel delta; the host clamps and pushes to the transformer. */
  panHorizontallyBy(deltaPixels: number): void;
  panPaneVertically(paneId: string, deltaY: number): void;
  zoom(factor: number, centerX?: number, anchorIndex?: number): void;
  zoomY(factor: number, paneId: string): void;
  /** Move weight across divider `index`; true when the resize was allowed. */
  resizePanes(index: number, weightDelta: number): boolean;
  pixelsToPaneWeight(pixels: number, paneStackHeight: number): number;
  panesResizable(): boolean;
  /** Whether a drag or two-finger gesture may move the viewport. */
  panEnabled(): boolean;
  /** Whether the wheel, a pinch or an axis drag may change the scale. */
  zoomEnabled(): boolean;
  syncViewport(): void;
  syncCrosshair(): void;

  // ── Hit testing ─────────────────────────────────────────────────────────
  hitTestMainPanePriceScale(containerX: number): string | null;
  findMainPaneSeriesDragTarget(chartX: number, localY: number): string | null;
  preparePaneTransformer(pane: Pane): void;
  findOverlayHandleAt(chartX: number, localY: number): { overlay: Overlay; pointIndex: number } | null;
  findOverlayAt(chartX: number, localY: number): Overlay | null;

  // ── Overlays and drawing ────────────────────────────────────────────────
  activeDrawingType(): string | null;
  isCreatingOverlay(): boolean;
  inProgressDrawing(): Overlay | null;
  /** Place or advance a drawing point. The overlay model owns what that means. */
  drawingPointerDown(chartX: number, chartY: number, paneId: string): void;
  /** Move the provisional point of a drawing in progress. */
  drawingPointerMove(chartX: number, chartY: number): void;
  cancelInProgressDrawing(): void;
  setDrawingMode(type: string | null): void;
  moveOverlayHandle(overlay: Overlay, pointIndex: number, chartX: number, chartY: number, paneTop: number): void;
  /**
   * Translate every anchor point of an overlay. The vertical delta is given as
   * two coordinates rather than a difference because it is converted through
   * the price scale, which is not linear in every price-scale mode.
   */
  moveOverlayBody(overlay: Overlay, startPoints: OverlayPoints, chartDx: number, startY: number, currentY: number): void;
  selectedOverlay(): Overlay | null;
  selectOverlay(overlay: Overlay | null): void;
  removeOverlay(overlayId: string): void;
  emitOverlayEvent(overlay: Overlay | null, name: 'onClick' | 'onPressedMoveStart' | 'onPressedMoving' | 'onPressedMoveEnd'): void;

  // ── Notifications ───────────────────────────────────────────────────────
  setCrosshairPosition(position: Point | null): void;
  setHoveredIndex(index: number | null): void;
  hasSubscribers(name: 'click' | 'dblClick' | 'contextMenu' | 'crosshairMove'): boolean;
  emitPointerEvent(name: 'click' | 'dblClick' | 'contextMenu' | 'crosshairMove', chartX: number, chartY: number, event: PointerEvent | null): void;
  emitCrosshairLeave(paneId: string): void;
  dispatchPrimitivePointer(phase: PrimitivePointerPhase, event: PointerEvent): boolean;
  closeSeriesStyleMenu(): void;
  editOverlayText(overlay: Overlay): void;
  update(level: GestureInvalidation): void;
  relayout(): void;
  saveState(): void;
}

/** Snapshot of a two-finger gesture. */
interface PinchGeometry {
  spanX: number;
  spanY: number;
  distance: number;
  midX: number;
  midY: number;
}

export class InteractionController {
  private _host: InteractionHost;
  private _events: EventController;
  private _element: HTMLDivElement | null = null;

  // Pan and axis scaling
  private _isDragging = false;
  private _isScalingX = false;
  private _isScalingY = false;
  private _lastX = 0;
  private _lastY = 0;
  /**
   * A press on a time ruler that has not yet moved far enough to be a scale.
   *
   * Without the threshold, a click on the ruler rescales the chart by whatever
   * sub-pixel jitter the pointer had between down and up.
   */
  private _pendingXScale = false;
  private _xScaleStartX = 0;
  private _xScaleAnchorX = 0;
  private _xScaleAnchorIndex = 0;
  private readonly _xScaleDragThreshold = 6;

  // Which pane a vertical gesture applies to
  private _activePricePaneId = 'main';
  private _activeYAxisPaneId: string | null = null;

  // Overlay dragging
  private _draggingHandleOverlay: Overlay | null = null;
  private _draggingHandleIndex = -1;
  private _draggingHandlePaneTop = 0;
  private _draggingBodyOverlay: Overlay | null = null;
  private _draggingBodyStartX = 0;
  private _draggingBodyStartY = 0;
  private _draggingBodyStartPoints: OverlayPoints = [];

  // Pane divider
  private _draggingDividerIndex = -1;

  // Click and double-click detection
  /**
   * Whether a gesture has actually acted on pointer movement since the press.
   *
   * This used to be tested as `_isDragging || _isScalingX || _isScalingY`, all
   * of which are armed by the press itself: pressing anywhere on the plot arms
   * panning, so the condition was true for every release and `click` and
   * `dblClick` never fired at all. What excludes a pan is that it *moved*, which
   * is what this records.
   */
  private _gestureConsumedPointer = false;
  private _pointerDownClient: Point | null = null;
  private _lastClickTime = 0;
  private _lastClickPoint: Point | null = null;
  private readonly _clickMoveTolerance = 4;
  private readonly _dblClickIntervalMs = 300;

  // Multi-touch
  private _activePointers: Map<number, Point> = new Map();
  private _isPinching = false;
  private _pinchState: (PinchGeometry & { anchorIndex: number; paneId: string }) | null = null;

  constructor(host: InteractionHost, events: EventController) {
    this._host = host;
    this._events = events;
  }

  /** Build the transparent layer that receives gestures, and wire it up. */
  public mount(): HTMLDivElement {
    if (this._element) return this._element;

    const { toolbarHeight } = this._host.insets();
    const layer = document.createElement('div');
    layer.style.position = 'absolute';
    layer.style.width = '100%';
    layer.style.height = `calc(100% - ${toolbarHeight}px)`;
    layer.style.top = `${toolbarHeight}px`;
    layer.style.zIndex = '2500';
    layer.style.cursor = 'crosshair';
    this._host.container().appendChild(layer);
    this._element = layer;

    this._events.on(layer, 'pointerdown', (event: PointerEvent) => this.handlePointerDown(event));
    this._events.on(layer, 'pointermove', (event: PointerEvent) =>
      this.handlePointerMove(event.clientX, event.clientY, event),
    );
    // A divider sits above this layer, so while one is being dragged its pointer
    // moves never reach the layer. This listener runs for that case and no other.
    this._events.on(window, 'pointermove', (event: PointerEvent) => {
      if (this._draggingDividerIndex === -1) return;
      this.handlePointerMove(event.clientX, event.clientY, event);
    });
    this._events.on(window, 'pointerup', (event: PointerEvent) => this.handlePointerUp(event));
    // Without pointercancel the pointer map leaks on touch interruptions
    // (incoming call, browser gesture), leaving the chart stuck in pinch mode.
    this._events.on(window, 'pointercancel', (event: PointerEvent) => this.handlePointerUp(event));
    this._events.on(layer, 'wheel', (event: WheelEvent) => this.handleWheel(event), { passive: false });
    this._events.on(layer, 'dblclick', (event: MouseEvent) => this.handleDblClick(event));
    this._events.on(layer, 'mouseleave', () => this.handlePointerLeave());
    this._events.on(layer, 'contextmenu', event => this.handleContextMenu(event as PointerEvent));
    this._events.on(this._host.container(), 'keydown', (event: KeyboardEvent) => this.handleKeyDown(event));

    const container = this._host.container();
    // Keyboard events need a focusable container.
    if (!container.getAttribute('tabindex')) container.setAttribute('tabindex', '-1');

    return layer;
  }

  public element(): HTMLDivElement | null {
    return this._element;
  }

  public isPinching(): boolean {
    return this._isPinching;
  }

  public activePricePaneId(): string {
    return this._activePricePaneId;
  }

  public activeYAxisPaneId(): string | null {
    return this._activeYAxisPaneId;
  }

  /** Drop references to a pane that no longer exists. */
  public forgetPane(paneId: string): void {
    if (this._activePricePaneId === paneId) this._activePricePaneId = 'main';
    if (this._activeYAxisPaneId === paneId) this._activeYAxisPaneId = null;
  }

  /** Start a pane resize, from a press the divider element reported. */
  public beginDividerDrag(index: number, clientY: number): void {
    if (!this._host.panesResizable()) return;
    if (index < 0 || index >= this._host.panes().length - 1) return;
    this._draggingDividerIndex = index;
    this._lastY = clientY;
    this._pointerDownClient = null;
    this._host.container().style.cursor = 'ns-resize';
  }

  // ── Pointer down ──────────────────────────────────────────────────────────

  /** Drop references to an overlay that no longer exists. */
  public forgetOverlay(overlayId: string): void {
    if (this._draggingHandleOverlay?.id === overlayId) {
      this._draggingHandleOverlay = null;
      this._draggingHandleIndex = -1;
    }
    if (this._draggingBodyOverlay?.id === overlayId) {
      this._draggingBodyOverlay = null;
      this._draggingBodyStartPoints = [];
    }
  }

  public handlePointerDown(e: PointerEvent): void {
    this._activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this._activePointers.size >= 2) {
      this._beginPinch();
      return;
    }
    this._pointerDownClient = { x: e.clientX, y: e.clientY };
    this._gestureConsumedPointer = false;
    this._host.closeSeriesStyleMenu();
    if (this._host.dispatchPrimitivePointer('pointerDown', e)) return;

    const rect = this._host.containerRect();
    const insets = this._host.insets();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    this._lastX = e.clientX;
    this._lastY = e.clientY;

    const region = resolvePointerRegion(x, y, this._host.surfaceLayout(rect));
    const chartAreaX = x - insets.left;
    const chartAreaY = y - (insets.toolbarHeight + insets.xAxisHeight);
    const isWithinChartAreaX = x >= insets.left && x <= rect.width - insets.right;

    const targetPane = this._host.paneAt(y);
    if (targetPane) {
      const mainPaneDragTarget = targetPane.getId() === 'main' && isWithinChartAreaX
        ? this._host.findMainPaneSeriesDragTarget(chartAreaX, y - targetPane.getBounding().top)
        : null;
      this._activePricePaneId = mainPaneDragTarget ?? (targetPane.getId() === 'main' ? 'main' : targetPane.getId());
    }

    // Either time ruler starts a horizontal scale drag; they behave alike, and
    // `resolvePointerRegion` is what says which one -- and that the gutters
    // beside them are not part of them.
    if ((region.kind === 'time-axis-top' || region.kind === 'time-axis-bottom') && this._host.zoomEnabled()) {
      this._pendingXScale = true;
      this._xScaleStartX = e.clientX;
      this._xScaleAnchorX = chartAreaX;
      this._xScaleAnchorIndex = this._host.transformer().xToIndex(chartAreaX);
      this._host.container().style.cursor = 'ew-resize';
      return;
    }

    if (this._isOnPriceAxis(x, rect, targetPane) && this._host.zoomEnabled()) {
      const mainScaleId = targetPane?.getId() === 'main' ? this._host.hitTestMainPanePriceScale(x) : null;
      this._isScalingY = true;
      this._activeYAxisPaneId = targetPane?.getId() === 'main' ? (mainScaleId || 'main') : (targetPane?.getId() || 'main');
      this._activePricePaneId = this._activeYAxisPaneId;
      this._host.container().style.cursor = 'ns-resize';
      return;
    }

    // Drawing tools take precedence over existing handles. Without this,
    // placing a later point on a provisional overlay can be read as a handle
    // drag instead of a drawing step (especially on compact touch UIs).
    if (!this._host.activeDrawingType()) {
      const hit = this._findHandleHit(y, chartAreaX);
      if (hit) {
        this._host.selectOverlay(hit.handle.overlay);
        this._host.emitOverlayEvent(hit.handle.overlay, 'onPressedMoveStart');
        this._draggingHandleOverlay = hit.handle.overlay;
        this._draggingHandleIndex = hit.handle.pointIndex;
        this._draggingHandlePaneTop = hit.paneTop;
        this._host.container().style.cursor = 'move';
        this._element?.setPointerCapture(e.pointerId);
        this._host.update(GestureInvalidation.Full);
        return;
      }
    }

    if (this._host.activeDrawingType()) {
      this._host.drawingPointerDown(chartAreaX, chartAreaY, targetPane?.getId() || 'main');
      return;
    }

    // Whole-body overlay drag: a press on the line itself moves every point.
    const bodyHit = this._findBodyHit(y, chartAreaX);
    if (bodyHit) {
      this._host.selectOverlay(bodyHit);
      this._host.emitOverlayEvent(bodyHit, 'onClick');
      this._host.emitOverlayEvent(bodyHit, 'onPressedMoveStart');
      this._draggingBodyOverlay = bodyHit;
      this._draggingBodyStartX = chartAreaX;
      this._draggingBodyStartY = chartAreaY;
      this._draggingBodyStartPoints = bodyHit.points.map(point => ({ ...point }));
      this._host.container().style.cursor = 'move';
      this._element?.setPointerCapture(e.pointerId);
      this._host.update(GestureInvalidation.Full);
      return;
    }

    // Empty plot: deselect, and start panning if panning is allowed. A chart
    // with panning off still tracks the crosshair -- it just does not move.
    this._host.selectOverlay(null);
    this._isDragging = this._host.panEnabled();
    this._lastX = e.clientX;
    this._lastY = e.clientY;
    if (this._element) this._element.style.cursor = 'grabbing';
    this._host.update(GestureInvalidation.Full);
  }

  // ── Pointer move ──────────────────────────────────────────────────────────

  public handlePointerMove(clientX: number, clientY: number, event?: PointerEvent): void {
    if (event && this._activePointers.has(event.pointerId)) {
      this._activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    }
    if (this._isPinching) {
      // A pinch owns the gesture completely -- no crosshair, no drag, no draw.
      this._updatePinch();
      return;
    }

    const rect = this._host.containerRect();
    const insets = this._host.insets();
    const xRaw = clientX - rect.left;
    const yRaw = clientY - rect.top;
    const x = xRaw - insets.left;
    const y = yRaw - (insets.toolbarHeight + insets.xAxisHeight);
    this._host.setCrosshairPosition({ x, y });

    if (event && this._host.dispatchPrimitivePointer('pointerMove', event)) {
      this._host.update(GestureInvalidation.Cursor);
      return;
    }

    if (this._pendingXScale) {
      if (Math.abs(clientX - this._xScaleStartX) < this._xScaleDragThreshold) return;
      this._pendingXScale = false;
      this._isScalingX = true;
      this._lastX = clientX;
    }

    if (this._isScalingY) {
      this._gestureConsumedPointer = true;
      const factor = 1 - (clientY - this._lastY) / 200; // Slower, more controlled zoom
      this._host.zoomY(factor, this._activeYAxisPaneId || this._activePricePaneId || 'main');
      this._lastY = clientY;
      return;
    }

    if (this._isScalingX) {
      this._gestureConsumedPointer = true;
      const factor = 1 + (clientX - this._lastX) / 200;
      this._host.zoom(factor, this._xScaleAnchorX, this._xScaleAnchorIndex);
      this._lastX = clientX;
      return;
    }

    if (!this._host.activeDrawingType() && !this._isDragging) {
      this._updateHoverCursor(xRaw, yRaw, x, y, rect);
    }

    if (this._draggingHandleOverlay && this._draggingHandleIndex !== -1) {
      this._gestureConsumedPointer = true;
      this._host.moveOverlayHandle(
        this._draggingHandleOverlay,
        this._draggingHandleIndex,
        x,
        y,
        this._draggingHandlePaneTop,
      );
      this._host.update(GestureInvalidation.Overlay);
      return;
    }

    if (this._draggingBodyOverlay) {
      this._gestureConsumedPointer = true;
      this._host.moveOverlayBody(
        this._draggingBodyOverlay,
        this._draggingBodyStartPoints,
        x - this._draggingBodyStartX,
        this._draggingBodyStartY,
        y,
      );
      this._host.update(GestureInvalidation.Overlay);
      return;
    }

    if (this._host.activeDrawingType() && this._host.isCreatingOverlay() && this._host.inProgressDrawing()) {
      this._host.drawingPointerMove(x, y);
      return;
    }

    if (this._draggingDividerIndex !== -1) {
      this._gestureConsumedPointer = true;
      const deltaY = clientY - this._lastY;
      const weightChange = this._host.pixelsToPaneWeight(deltaY, this._host.paneStackHeight());
      if (this._host.resizePanes(this._draggingDividerIndex, weightChange)) {
        this._host.relayout();
      }
      this._lastY = clientY;
      return;
    }

    if (this._isDragging) {
      if (clientX !== this._lastX || clientY !== this._lastY) this._gestureConsumedPointer = true;
      this._host.panHorizontallyBy(clientX - this._lastX);
      this._host.panPaneVertically(this._activePricePaneId, clientY - this._lastY);
      this._host.syncViewport();
      this._lastX = clientX;
      this._lastY = clientY;
      this._host.update(GestureInvalidation.Full);
    } else {
      this._host.setHoveredIndex(Math.round(this._host.transformer().xToIndex(x)));
      this._host.syncCrosshair();
    }

    if (this._host.hasSubscribers('crosshairMove')) {
      this._host.emitPointerEvent('crosshairMove', x, y, event ?? null);
    }
    this._host.update(GestureInvalidation.Cursor);
  }

  // ── Pointer up ────────────────────────────────────────────────────────────

  public handlePointerUp(e: PointerEvent): void {
    this._activePointers.delete(e.pointerId);
    if (this._isPinching) {
      // Lifting one finger ends the pinch; the remaining finger must not
      // instantly turn into a pan, so swallow this event entirely.
      if (this._activePointers.size < 2) this._endPinch();
      else this._beginPinch(); // three-plus fingers, one lifted: re-baseline
      this._pointerDownClient = null;
      return;
    }
    if (this._host.dispatchPrimitivePointer('pointerUp', e)) return;
    this._maybeEmitClick(e);

    const movedOverlay = this._draggingHandleOverlay || this._draggingBodyOverlay;
    this._isDragging = false;
    this._isScalingX = false;
    this._pendingXScale = false;
    this._xScaleAnchorX = 0;
    this._xScaleAnchorIndex = 0;
    this._isScalingY = false;
    this._draggingDividerIndex = -1;
    this._activeYAxisPaneId = null;
    this._activePricePaneId = 'main';
    this._host.emitOverlayEvent(movedOverlay, 'onPressedMoveEnd');
    this._draggingHandleOverlay = null;
    this._draggingHandleIndex = -1;
    this._draggingBodyOverlay = null;
    this._draggingBodyStartPoints = [];
    this._host.container().style.cursor = this._host.activeDrawingType() ? 'crosshair' : 'default';
    if (this._element?.hasPointerCapture(e.pointerId)) {
      this._element.releasePointerCapture(e.pointerId);
    }
    if (movedOverlay) this._host.saveState();
  }

  public handleDblClick(e: MouseEvent): void {
    const rect = this._host.containerRect();
    const insets = this._host.insets();
    const x = e.clientX - rect.left - insets.left;
    const y = e.clientY - rect.top - (insets.toolbarHeight + insets.xAxisHeight);

    if (this._host.hasSubscribers('dblClick')) {
      this._host.emitPointerEvent('dblClick', x, y, e as unknown as PointerEvent);
    }

    for (const pane of this._host.panes()) {
      const localY = y - pane.getBounding().top;
      this._host.preparePaneTransformer(pane);
      const handleHit = this._host.findOverlayHandleAt(x, localY);
      const bodyHit = this._host.findOverlayAt(x, localY);
      const targetOverlay = handleHit?.overlay || bodyHit;
      if (targetOverlay) {
        this._host.editOverlayText(targetOverlay);
        break;
      }
    }
  }

  /**
   * Fire `click` / `dblClick` when the pointer barely moved between down and
   * up. Runs before the gesture flags are cleared, so a completed pan is
   * excluded rather than reported as a click that happened to end where it
   * started.
   */
  private _maybeEmitClick(e: PointerEvent): void {
    const down = this._pointerDownClient;
    this._pointerDownClient = null;
    if (!down) return;
    if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > this._clickMoveTolerance) return;
    if (this._gestureConsumedPointer) return;

    const rect = this._host.containerRect();
    const insets = this._host.insets();
    const x = e.clientX - rect.left - insets.left;
    const y = e.clientY - rect.top - (insets.toolbarHeight + insets.xAxisHeight);
    if (this._host.hasSubscribers('click')) {
      this._host.emitPointerEvent('click', x, y, e);
    }

    const now = Date.now();
    const isDouble =
      this._lastClickPoint !== null &&
      now - this._lastClickTime <= this._dblClickIntervalMs &&
      Math.hypot(e.clientX - this._lastClickPoint.x, e.clientY - this._lastClickPoint.y) <=
        this._clickMoveTolerance;

    if (isDouble) {
      if (this._host.hasSubscribers('dblClick')) {
        this._host.emitPointerEvent('dblClick', x, y, e);
      }

      // Check if an annotation or text overlay was double-clicked to edit its text
      for (const pane of this._host.panes()) {
        const localY = y - pane.getBounding().top;
        this._host.preparePaneTransformer(pane);
        const handleHit = this._host.findOverlayHandleAt(x, localY);
        const bodyHit = this._host.findOverlayAt(x, localY);
        const targetOverlay = handleHit?.overlay || bodyHit;
        if (targetOverlay) {
          this._host.editOverlayText(targetOverlay);
          break;
        }
      }

      // Reset so a third click doesn't register as another double.
      this._lastClickTime = 0;
      this._lastClickPoint = null;
    } else {
      this._lastClickTime = now;
      this._lastClickPoint = { x: e.clientX, y: e.clientY };
    }
  }

  // ── Wheel, leave, context menu, keyboard ─────────────────────────────────

  public handleWheel(event: WheelEvent): void {
    const canZoom = this._host.zoomEnabled();
    const canPan = this._host.panEnabled();
    // A chart that can neither zoom nor pan must let the page scroll past it
    // rather than swallowing the wheel.
    if (!canZoom && !canPan) return;
    event.preventDefault();
    const rect = this._host.containerRect();
    const insets = this._host.insets();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;
    const chartX = mouseX - insets.left;
    const isWithinChartAreaX = mouseX >= insets.left && mouseX <= rect.width - insets.right;
    const pane = this._host.paneAt(mouseY);
    const mainScaleId = pane?.getId() === 'main' ? this._host.hitTestMainPanePriceScale(mouseX) : null;

    if (event.ctrlKey || event.metaKey) {
      if (canZoom) this._host.zoom(event.deltaY > 0 ? 0.95 : 1.05, chartX);
      return;
    }

    if (canZoom && this._isOnPriceAxis(mouseX, rect, pane) && pane) {
      this._host.zoomY(
        event.deltaY > 0 ? 0.95 : 1.05,
        pane.getId() === 'main' ? (mainScaleId || 'main') : pane.getId(),
      );
      return;
    }

    const isOnTopXAxis =
      isWithinChartAreaX &&
      mouseY >= insets.toolbarHeight &&
      mouseY <= insets.toolbarHeight + insets.xAxisHeight;
    const isOnBottomXAxis = isWithinChartAreaX && mouseY >= rect.height - insets.xAxisHeight;
    if (isOnTopXAxis || isOnBottomXAxis) {
      if (canZoom) this._host.zoom(event.deltaY > 0 ? 0.95 : 1.05, chartX);
      return;
    }

    if (!canPan) return;

    // A trackpad's horizontal component pans; `panHorizontallyBy` takes the
    // pixel delta in the same sense a drag does, hence the sign.
    this._host.panHorizontallyBy(-event.deltaX);
    this._host.update(GestureInvalidation.Full);
  }

  public handlePointerLeave(): void {
    this._host.setCrosshairPosition(null);
    this._host.setHoveredIndex(null);
    // Leaving the chart is reported as a move with nothing under the pointer,
    // so subscribers can clear their own readouts.
    if (this._host.hasSubscribers('crosshairMove')) {
      this._host.emitCrosshairLeave(this._activePricePaneId);
    }
    this._host.update(GestureInvalidation.Full);
  }

  public handleContextMenu(event: PointerEvent): void {
    if (!this._host.hasSubscribers('contextMenu')) return;
    const rect = this._host.containerRect();
    const insets = this._host.insets();
    this._host.emitPointerEvent(
      'contextMenu',
      event.clientX - rect.left - insets.left,
      event.clientY - rect.top - (insets.toolbarHeight + insets.xAxisHeight),
      event,
    );
  }

  public handleKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Delete' || event.key === 'Backspace') {
      const selected = this._host.selectedOverlay();
      if (selected) {
        this._host.removeOverlay(selected.id);
        this._host.update(GestureInvalidation.Full);
        event.preventDefault();
      }
    }
    if (event.key === 'Escape') {
      this._host.cancelInProgressDrawing();
      this._host.selectOverlay(null);
      this._host.setDrawingMode(null);
      this._host.update(GestureInvalidation.Full);
      event.preventDefault();
    }
  }

  // ── Multi-touch ───────────────────────────────────────────────────────────

  private _readPinchGeometry(): PinchGeometry | null {
    const points = Array.from(this._activePointers.values());
    if (points.length < 2) return null;
    const [a, b] = points;
    const spanX = Math.abs(a.x - b.x);
    const spanY = Math.abs(a.y - b.y);
    return {
      spanX,
      spanY,
      distance: Math.hypot(spanX, spanY),
      midX: (a.x + b.x) / 2,
      midY: (a.y + b.y) / 2,
    };
  }

  /**
   * Enter pinch mode. Any single-pointer interaction in flight (pan, axis
   * scale, drawing drag) is abandoned -- a second finger means the user is
   * doing something else now.
   */
  private _beginPinch(): void {
    const geometry = this._readPinchGeometry();
    if (!geometry) return;

    this._isDragging = false;
    this._isScalingX = false;
    this._isScalingY = false;
    this._pendingXScale = false;
    this._draggingHandleOverlay = null;
    this._draggingHandleIndex = -1;
    this._draggingBodyOverlay = null;
    this._draggingBodyStartPoints = [];
    this._pointerDownClient = null;

    const rect = this._host.containerRect();
    const chartMidX = geometry.midX - rect.left - this._host.insets().left;
    const pane = this._host.paneAt(geometry.midY - rect.top);

    this._isPinching = true;
    this._pinchState = {
      ...geometry,
      anchorIndex: this._host.transformer().xToIndex(chartMidX),
      paneId: pane?.getId() ?? 'main',
    };
  }

  private _endPinch(): void {
    this._isPinching = false;
    this._pinchState = null;
  }

  /**
   * Apply one frame of a two-finger gesture: pinch to zoom, drag the midpoint
   * to pan. A clearly vertical pinch scales the price axis instead of time,
   * matching how touch charting apps behave.
   */
  private _updatePinch(): void {
    const previous = this._pinchState;
    const current = this._readPinchGeometry();
    if (!previous || !current) return;

    const rect = this._host.containerRect();
    const chartMidX = current.midX - rect.left - this._host.insets().left;

    // Guard against the degenerate case where fingers land on the same spot.
    const isVerticalPinch = current.spanY > current.spanX * 1.5;
    if (!this._host.zoomEnabled()) {
      // fall through to the pan below, which has its own guard
    } else if (isVerticalPinch) {
      if (previous.spanY > 4 && current.spanY > 4) {
        this._host.zoomY(current.spanY / previous.spanY, previous.paneId);
      }
    } else if (previous.distance > 4 && current.distance > 4) {
      this._host.zoom(current.distance / previous.distance, chartMidX, previous.anchorIndex);
    }

    // Pan by however far the midpoint travelled this frame.
    const deltaX = current.midX - previous.midX;
    const deltaY = current.midY - previous.midY;
    if (this._host.panEnabled()) {
      if (deltaX !== 0) this._host.panHorizontallyBy(deltaX);
      if (deltaY !== 0) this._host.panPaneVertically(previous.paneId, deltaY);
    }
    this._host.syncViewport();

    // Re-anchor each frame so the gesture tracks the fingers rather than
    // accumulating drift from the original touch-down positions.
    this._pinchState = {
      ...current,
      anchorIndex: this._host.transformer().xToIndex(chartMidX),
      paneId: previous.paneId,
    };

    this._host.update(GestureInvalidation.Full);
  }

  // ── Shared hit tests ──────────────────────────────────────────────────────

  /**
   * Whether a container-relative x is over the price gutter that belongs to
   * `pane`. The main pane has stacked scales, so it also has to hit one.
   */
  private _isOnPriceAxis(containerX: number, rect: DOMRect, pane: Pane | null): boolean {
    if (!pane) return false;
    const insets = this._host.insets();
    const inLeftGutter = containerX < insets.left;
    const inRightGutter = containerX > rect.width - insets.right;
    if (!inLeftGutter && !inRightGutter) return false;
    if (pane.getId() === 'main') return this._host.hitTestMainPanePriceScale(containerX) !== null;
    return pane.getYAxisSide() === (inLeftGutter ? 'left' : 'right');
  }

  private _findHandleHit(containerY: number, chartX: number) {
    for (const pane of this._host.panes()) {
      const paneTop = pane.getBounding().top;
      this._host.preparePaneTransformer(pane);
      const handle = this._host.findOverlayHandleAt(chartX, containerY - paneTop);
      if (!handle) continue;
      // A press on the overlay currently being drawn is a drawing step, not the
      // start of a handle drag.
      if (this._host.isCreatingOverlay() && handle.overlay === this._host.inProgressDrawing()) continue;
      return { handle, paneTop };
    }
    return null;
  }

  private _findBodyHit(containerY: number, chartX: number): Overlay | null {
    for (const pane of this._host.panes()) {
      this._host.preparePaneTransformer(pane);
      const hit = this._host.findOverlayAt(chartX, containerY - pane.getBounding().top);
      if (hit) return hit;
    }
    return null;
  }

  /** Axis affordances win over overlay ones, which win over the plain crosshair. */
  private _updateHoverCursor(xRaw: number, yRaw: number, x: number, y: number, rect: DOMRect): void {
    if (!this._element) return;
    const axisCursor = this._axisCursor(xRaw, yRaw, rect);
    let hoverHandle = false;
    let hoverBody = false;
    let hoverPriceScale = false;

    if (!axisCursor) {
      for (const pane of this._host.panes()) {
        const localY = y - pane.getBounding().top;
        this._host.preparePaneTransformer(pane);
        if (this._host.findOverlayHandleAt(x, localY)) {
          hoverHandle = true;
          break;
        }
        if (this._host.findOverlayAt(x, localY)) {
          hoverBody = true;
          break;
        }
      }

      if (!hoverHandle && !hoverBody) {
        const targetPane = this._host.paneAt(yRaw);
        if (targetPane?.getId() === 'main') {
          hoverPriceScale =
            this._host.findMainPaneSeriesDragTarget(x, yRaw - targetPane.getBounding().top) !== null;
        }
      }
    }

    this._element.style.cursor =
      axisCursor || (hoverHandle ? 'move' : hoverBody || hoverPriceScale ? 'grab' : 'crosshair');
  }

  private _axisCursor(xRaw: number, yRaw: number, rect: DOMRect): string | null {
    const insets = this._host.insets();
    const topXBottom = insets.toolbarHeight + insets.xAxisHeight;
    const bottomXTop = rect.height - insets.xAxisHeight;
    const isWithinChartAreaX = xRaw >= insets.left && xRaw <= rect.width - insets.right;
    if (isWithinChartAreaX && ((yRaw > insets.toolbarHeight && yRaw < topXBottom) || yRaw > bottomXTop)) {
      return 'ew-resize';
    }
    return this._isOnPriceAxis(xRaw, rect, this._host.paneAt(yRaw)) ? 'ns-resize' : null;
  }
}
