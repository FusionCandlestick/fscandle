/**
 * Public shapes for overlays and their templates. Re-exported from
 * `OverlayManager` so existing imports keep working.
 */

import type { CoordinateDataSource, CoordinateTransformer } from './CoordinateTransformer';
import type { OverlayFigure } from './OverlayFigure';

export interface OverlayPoint {
  timestamp: number;
  value: number;
}

export interface Overlay {
  id: string;
  type: string;
  points: OverlayPoint[];
  color: string;
  lineWidth: number;

  // ── Metadata ───────────────────────────────────────────────────────────
  /** When locked, the overlay renders but cannot be selected, dragged, or deleted. */
  locked?: boolean;
  /** When false, the overlay is skipped by both rendering and hit testing. Defaults to true. */
  visible?: boolean;
  /** Paint order within the overlay layer. Higher draws later (on top). Defaults to 0. */
  zLevel?: number;
  /** Free-form grouping key so callers can show/hide/remove sets of overlays together. */
  groupId?: string;
  /** Arbitrary caller-owned data, preserved across save/load. */
  extendData?: unknown;
  /** How many points this overlay still needs before it is complete. */
  currentStep?: number;
  line?: {
    direction?: 'free' | 'horizontal' | 'vertical';
    extendStart?: boolean;
    extendEnd?: boolean;
    showPriceLabel?: boolean;
  };
  channel?: {
    mode?: 'parallel' | 'price';
  };
  annotation?: {
    kind?: 'text' | 'arrow' | 'image' | 'tag';
    /** TradingView-style event placement along the bottom of the price pane. */
    placement?: 'floating' | 'bottom';
  };
  wave?: {
    kind?: 'three' | 'five' | 'abcd' | 'abcde';
  };
  /** Background color for annotation overlays */
  backgroundColor?: string;
  /** Background opacity (0 to 1) for annotation overlays */
  backgroundOpacity?: number;
  /** Overall opacity (0 to 1) for overlay */
  opacity?: number;
  /** Text content for annotation overlays */
  text?: string;
  /** Image URL for annotation image overlays */
  imageUrl?: string;
  /** Cached HTMLImageElement for annotation image overlays (not serialized) */
  _imageCache?: HTMLImageElement;
  onDrawStart?: (overlay: Overlay) => void;
  onDrawing?: (overlay: Overlay) => void;
  onDrawEnd?: (overlay: Overlay) => void;
  onRemoved?: (overlay: Overlay) => void;
  onClick?: (overlay: Overlay) => void;
  onSelected?: (overlay: Overlay) => void;
  onDeselected?: (overlay: Overlay) => void;
  onPressedMoveStart?: (overlay: Overlay) => void;
  onPressedMoving?: (overlay: Overlay) => void;
  onPressedMoveEnd?: (overlay: Overlay) => void;
}

/** Context handed to a template's declarative figure factories. */
export interface OverlayFigureParams {
  overlay: Overlay;
  transformer: CoordinateTransformer;
  dataStore: CoordinateDataSource;
  /** Overlay points already converted to pixel space, in point order. */
  coordinates: Array<{ x: number; y: number }>;
  width: number;
  height: number;
  /** Which draw step the overlay is on; equals `totalStep` once complete. */
  currentStep: number;
  isSelected: boolean;
}

/** One step of a multi-step drawing interaction. */
export interface OverlayDrawStep {
  /** Human-readable hint, e.g. `'Select the channel width'`. */
  hint?: string;
  /**
   * Called when this step's point is placed. Return `false` to reject the
   * point and stay on the same step.
   */
  onPlace?: (overlay: Overlay, point: OverlayPoint, stepIndex: number) => boolean | void;
}

export interface OverlayTemplate {
  type: string;
  /**
   * Imperative renderer. Templates may implement this, `createFigures`, or
   * both — `render` runs first, then any figures are drawn on top.
   */
  render?: (ctx: CanvasRenderingContext2D, overlay: Overlay, transformer: CoordinateTransformer, dataStore: CoordinateDataSource, isSelected?: boolean) => void;

  /**
   * Declarative renderer. Preferred for new templates: the returned figures
   * are drawn and hit-tested by the engine, so a template does not need to
   * supply its own hit-test logic.
   */
  createFigures?: (params: OverlayFigureParams) => OverlayFigure[];

  /**
   * Geometry used for hit testing, when it differs from what is drawn.
   *
   * A template that draws with `createFigures` is hit-tested from those figures
   * and needs nothing here. A template that draws imperatively with `render`
   * declares its clickable shape here instead — otherwise the engine has no
   * description of it and the overlay cannot be selected. Styling is ignored.
   */
  createHitFigures?: (params: OverlayFigureParams) => OverlayFigure[];

  /** Figures drawn on the price axis (e.g. a price tag for a horizontal line). */
  createPriceAxisFigures?: (params: OverlayFigureParams) => OverlayFigure[];
  /** Figures drawn on the time axis. */
  createTimeAxisFigures?: (params: OverlayFigureParams) => OverlayFigure[];

  /**
   * How many points the overlay needs. Defaults to 2. The engine uses this to
   * decide when a drawing is complete.
   */
  totalStep?: number;

  /** Per-step configuration. Indexes correspond to point indexes. */
  drawSteps?: OverlayDrawStep[];

  /** Draw the default square handles at each point. Defaults to true. */
  needDefaultPointFigure?: boolean;

  /** Values merged under an overlay's own fields when one is created. */
  defaultOverlay?: Partial<Omit<Overlay, 'id' | 'type'>>;
}
