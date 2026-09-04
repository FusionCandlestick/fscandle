import { CoordinateDataSource, CoordinateTransformer } from './CoordinateTransformer';
import { KLineData } from '../types';
import { UI_FONT_FAMILY } from '../model/fontFamily';
import {
  OverlayFigure,
  applyFigureStyleOverride,
  drawFigures,
  isPointInAnyFigure,
  type FigureStyleOverride,
} from './OverlayFigure';
import {
  bandHitFigures,
  channelHitFigures,
  labelHitFigures,
  lineHitFigures,
  rectangleHitFigures,
  waveHitFigures,
} from './overlayHitFigures';

const LABEL_SAFE_GAP = 20;

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

export class OverlayManager {
  private _overlays: Overlay[] = [];
  private _templates: Map<string, OverlayTemplate> = new Map();
  /** Per-overlay-type restyling, applied over whatever the template drew. */
  private _styleOverrides: Map<string, FigureStyleOverride> = new Map();

  constructor() {
    this._registerDefaultTemplates();
  }

  public registerTemplate(template: OverlayTemplate) {
    this._templates.set(template.type, template);
  }

  public getTemplate(type: string): OverlayTemplate | null {
    return this._templates.get(type) ?? null;
  }

  public getRegisteredTypes(): string[] {
    return [...this._templates.keys()];
  }

  private _registerDefaultTemplates() {
    // ── unified line ───────────────────────────────────────────────────────
    this.registerTemplate({
      type: 'line',
      createHitFigures: lineHitFigures,
      render: (ctx, overlay, transformer, dataStore) => {
        const line = overlay.line ?? {};
        const direction = line.direction ?? 'free';
        const extendStart = line.extendStart ?? false;
        const extendEnd = line.extendEnd ?? false;
        const showPriceLabel = line.showPriceLabel ?? false;
        const width = transformer.getWidth();
        const height = transformer.getHeight();
        const p1 = overlay.points[0];
        const p2 = overlay.points[1] ?? overlay.points[0];
        const x1 = transformer.timestampToXUnbounded(p1.timestamp, dataStore);
        const y1 = transformer.priceToY(p1.value);
        const rawX2 = transformer.timestampToXUnbounded(p2.timestamp, dataStore);
        const rawY2 = transformer.priceToY(p2.value);
        const x2 = direction === 'vertical' ? x1 : rawX2;
        const y2 = direction === 'horizontal' ? y1 : rawY2;

        ctx.save();
        if (showPriceLabel) ctx.setLineDash([5, 4]);
        this._drawLinePath(ctx, x1, y1, x2, y2, width, height, extendStart, extendEnd);
        ctx.stroke();
        if (showPriceLabel) {
          ctx.setLineDash([]);
          this._drawPriceTag(ctx, width, height, y1, p1.value.toFixed(2), overlay.color);
        }
        ctx.restore();

        if (overlay.points.length > 1 && !showPriceLabel) {
          this._drawHandles(ctx, [x1, y1], [x2, y2]);
        } else {
          this._drawHandles(ctx, [x1, y1]);
        }
      }
    });

    // ── unified channel ────────────────────────────────────────────────────
    this.registerTemplate({
      type: 'channel',
      createHitFigures: channelHitFigures,
      render: (ctx, overlay, transformer, dataStore) => {
        if (overlay.points.length < 2) return;
        const mode = overlay.channel?.mode ?? 'parallel';
        const { x1, y1, x2, y2 } = this._getCoordinates(overlay, transformer, dataStore);
        const width = transformer.getWidth();
        let x3 = x1;
        let y3 = y1;
        if (overlay.points.length >= 3) {
          x3 = transformer.timestampToXUnbounded(overlay.points[2].timestamp, dataStore);
          y3 = transformer.priceToY(overlay.points[2].value);
        }
        if (mode === 'price') {
          const slope = Math.abs(x2 - x1) < 0.001 ? 0 : (y2 - y1) / (x2 - x1);
          const baseLeft = y1 - slope * x1;
          const baseRight = y1 + slope * (width - x1);
          const lineDx = x2 - x1;
          const lineDy = y2 - y1;
          const lineLength = Math.hypot(lineDx, lineDy) || 1;
          const normalX = -lineDy / lineLength;
          const normalY = lineDx / lineLength;
          const normalDistance = (x3 - x1) * normalX + (y3 - y1) * normalY;
          const shiftX = normalX * normalDistance;
          const shiftY = normalY * normalDistance;
          const translatedLeft = baseLeft + shiftY - slope * shiftX;
          const translatedRight = baseRight + shiftY - slope * shiftX;
          ctx.beginPath(); ctx.moveTo(0, baseLeft); ctx.lineTo(width, baseRight); ctx.stroke();
          if (overlay.points.length >= 3) {
            ctx.beginPath();
            ctx.moveTo(0, translatedLeft);
            ctx.lineTo(width, translatedRight);
            ctx.stroke();
            this._fillChannel(ctx, 0, baseLeft, width, baseRight, width, translatedRight, 0, translatedLeft);
            ctx.setLineDash([5, 5]);
            ctx.beginPath(); ctx.moveTo(0, (baseLeft + translatedLeft) / 2); ctx.lineTo(width, (baseRight + translatedRight) / 2); ctx.stroke();
            ctx.setLineDash([]);
          }
          this._drawHandles(ctx, [x1, y1], [x2, y2], ...(overlay.points.length >= 3 ? [[x3, y3] as [number, number]] : []));
          return;
        }

        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
        if (overlay.points.length >= 3) {
          const lineDx = x2 - x1;
          const lineDy = y2 - y1;
          const lineLength = Math.hypot(lineDx, lineDy) || 1;
          const normalX = -lineDy / lineLength;
          const normalY = lineDx / lineLength;
          const normalDistance = (x3 - x1) * normalX + (y3 - y1) * normalY;
          const ox = normalX * normalDistance;
          const oy = normalY * normalDistance;
          const x4 = x2 + ox;
          const y4 = y2 + oy;
          ctx.beginPath();
          ctx.moveTo(x1 + ox, y1 + oy);
          ctx.lineTo(x4, y4);
          ctx.stroke();
          this._fillChannel(ctx, x1, y1, x2, y2, x4, y4, x1 + ox, y1 + oy);
          ctx.setLineDash([5, 5]);
          ctx.beginPath();
          ctx.moveTo(x1 + ox / 2, y1 + oy / 2);
          ctx.lineTo(x2 + ox / 2, y2 + oy / 2);
          ctx.stroke();
          ctx.setLineDash([]);
          this._drawHandles(ctx, [x1, y1], [x2, y2], [x3, y3]);
        } else {
          this._drawHandles(ctx, [x1, y1], [x2, y2]);
        }
      }
    });

    // ── unified annotation ─────────────────────────────────────────────────
    this.registerTemplate({
      type: 'annotation',
      createHitFigures: labelHitFigures,
      render: (ctx, overlay, transformer, dataStore, isSelected) => {
        const x = transformer.timestampToXUnbounded(overlay.points[0].timestamp, dataStore);
        const y = transformer.priceToY(overlay.points[0].value);
        if (overlay.annotation?.placement === 'bottom') {
          const width = transformer.getWidth();
          const height = transformer.getHeight();
          const markerY = height - 8;
          ctx.save();
          ctx.strokeStyle = overlay.color;
          ctx.lineWidth = 1;
          ctx.setLineDash([3, 4]);
          ctx.beginPath();
          ctx.moveTo(x, Math.min(height, y + 5));
          ctx.lineTo(x, markerY - 5);
          ctx.stroke();
          ctx.setLineDash([]);
          // Default is just the axis marker + leader; the label pops on click,
          // sitting right above the marker so it stays on the time axis.
          if (isSelected) {
            ctx.fillStyle = 'rgba(2, 6, 23, 0.58)';
            ctx.fillRect(0, 0, width, height);
            const labelOffset = overlay.annotation.kind === 'image' ? 70 : 48;
            this._drawUnifiedAnnotationWithLeader(ctx, overlay, x, markerY, x, markerY - labelOffset);
          }
          ctx.fillStyle = overlay.color;
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(x, markerY, isSelected ? 4 : 3, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          ctx.restore();
          return;
        }
        if (overlay.points.length >= 2) {
          const p2 = overlay.points[1];
          const x2 = transformer.timestampToXUnbounded(p2.timestamp, dataStore);
          const y2 = transformer.priceToY(p2.value);
          this._drawUnifiedAnnotationWithLeader(ctx, overlay, x, y, x2, y2);
          this._drawHandles(ctx, [x, y]);
        } else {
          const kind = overlay.annotation?.kind ?? 'text';
          const defaultOffset = kind === 'arrow' ? 44 : kind === 'image' ? -58 : -44;
          this._drawUnifiedAnnotationWithLeader(ctx, overlay, x, y, x, y + defaultOffset);
          this._drawHandles(ctx, [x, y]);
        }
      }
    });

    // ── Elliott / harmonic wave patterns ─────────────────────────────────
    this.registerTemplate({
      type: 'wave',
      createHitFigures: waveHitFigures,
      render: (ctx, overlay, transformer, dataStore) => {
        const kind = overlay.wave?.kind ?? 'three';
        const points = overlay.points.map(point => ({
          x: transformer.timestampToXUnbounded(point.timestamp, dataStore),
          y: transformer.priceToY(point.value),
        }));
        if (points.length < 2) return;

        ctx.save();
        ctx.lineWidth = overlay.lineWidth;
        ctx.strokeStyle = overlay.color;
        ctx.fillStyle = overlay.color;

        this._fillWaveTriangles(ctx, points, kind, overlay.color);

        ctx.beginPath();
        points.forEach((point, index) => {
          if (index === 0) ctx.moveTo(point.x, point.y);
          else ctx.lineTo(point.x, point.y);
        });

        if (kind === 'abcde' && points.length >= 5) {
          ctx.closePath();
          ctx.globalAlpha = 0.04;
          ctx.fill();
          ctx.globalAlpha = 1;
        }
        ctx.stroke();

        const labels = kind === 'five'
          ? ['0', '1', '2', '3', '4', '5']
          : kind === 'three'
            ? ['0', '1', '2', '3']
            : ['A', 'B', 'C', 'D', 'E'];
        ctx.font = `600 10px ${UI_FONT_FAMILY}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        points.forEach((point, index) => {
          const label = labels[index] ?? String(index + 1);
          const neighbourY = index === 0
            ? points[1]?.y ?? point.y
            : index === points.length - 1
              ? points[index - 1]?.y ?? point.y
              : ((points[index - 1]?.y ?? point.y) + (points[index + 1]?.y ?? point.y)) / 2;
          const yOffset = point.y <= neighbourY
            ? -(9 + LABEL_SAFE_GAP)
            : 9 + LABEL_SAFE_GAP;
          ctx.fillStyle = overlay.color;
          this._roundRect(ctx, point.x - 10, point.y + yOffset - 9, 20, 18, 4);
          ctx.fill();
          ctx.fillStyle = '#ffffff';
          ctx.fillText(label, point.x, point.y + yOffset);
        });
        ctx.restore();
        this._drawHandles(ctx, ...points.map(point => [point.x, point.y] as [number, number]));
      },
    });


    // ── rectangle ───────────────────────────────────────────────────────────
    this.registerTemplate({
      type: 'rectangle',
      createHitFigures: rectangleHitFigures,
      render: (ctx, overlay, transformer, dataStore) => {
        const { x1, y1, x2, y2 } = this._getCoordinates(overlay, transformer, dataStore);
        // A rectangle is a zone: it needs enough fill to read as filled area,
        // not just an outline that looks like every other line tool.
        ctx.globalAlpha = 0.16;
        ctx.fillRect(x1, y1, x2 - x1, y2 - y1);
        ctx.globalAlpha = 1.0;
        ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
        this._drawHandles(ctx, [x1, y1], [x2, y2]);
      }
    });

    // ── fibonacci ───────────────────────────────────────────────────────────
    this.registerTemplate({
      type: 'fibonacci',
      createHitFigures: bandHitFigures,
      render: (ctx, overlay, transformer, dataStore) => {
        if (overlay.points.length < 2) return;
        const { x1, y1, x2, y2 } = this._getCoordinates(overlay, transformer, dataStore);
        const levels = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
        const diffY = y2 - y1;
        const diffVal = overlay.points[1].value - overlay.points[0].value;
        const fibColors = ['#F44336','#FF9800','#FFC107','#4CAF50','#2196F3','#9C27B0','#F44336'];

        // A label is skipped when it would collide with the last one, so a
        // tight retracement stays readable.
        let lastLabelY = -Infinity;
        levels.forEach((level, i) => {
          const ly = y1 + diffY * level;
          const lval = overlay.points[0].value + diffVal * level;
          ctx.save();
          ctx.strokeStyle = fibColors[i % fibColors.length];
          ctx.globalAlpha = 0.8;
          ctx.setLineDash([3, 4]);
          ctx.beginPath();
          ctx.moveTo(x1, ly);
          ctx.lineTo(x2, ly);
          ctx.stroke();
          ctx.setLineDash([]);
          if (Math.abs(ly - lastLabelY) >= 12) {
            ctx.globalAlpha = 1;
            ctx.fillStyle = fibColors[i % fibColors.length];
            ctx.font = `400 10px ${UI_FONT_FAMILY}`;
            ctx.textBaseline = 'middle';
            ctx.fillText(`${lval.toFixed(2)} (${(level * 100).toFixed(1)}%)`, Math.min(x1, x2) + 4, ly);
            ctx.textBaseline = 'alphabetic';
            lastLabelY = ly;
          }
          ctx.restore();
        });
        this._drawHandles(ctx, [x1, y1], [x2, y2]);
      }
    });


    // ── measure ─────────────────────────────────────────────────────────────
    this.registerTemplate({
      type: 'measure',
      createHitFigures: rectangleHitFigures,
      render: (ctx, overlay, transformer, dataStore) => {
        if (overlay.points.length < 2) return;
        const { x1, y1, x2, y2 } = this._getCoordinates(overlay, transformer, dataStore);
        const p1 = overlay.points[0]; const p2 = overlay.points[1];
        const priceDiff = p2.value - p1.value;
        const pricePct = (priceDiff / Math.abs(p1.value)) * 100;
        const data = dataStore.getData();
        const idx1 = data.findIndex((d: KLineData) => d.timestamp === p1.timestamp);
        const idx2 = data.findIndex((d: KLineData) => d.timestamp === p2.timestamp);
        const barCount = Math.abs(idx2 - idx1);
        const color = overlay.color || '#2962FF';
        ctx.save();
        ctx.globalAlpha = 0.1;
        ctx.fillStyle = color;
        ctx.fillRect(x1, y1, x2 - x1, y2 - y1);
        ctx.globalAlpha = 1;
        ctx.strokeStyle = color;
        ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
        const sign = priceDiff >= 0 ? '+' : '';
        const text = `${sign}${priceDiff.toFixed(2)} (${sign}${pricePct.toFixed(2)}%)  ·  ${barCount} bars`;
        ctx.font = `600 10px ${UI_FONT_FAMILY}`;
        const tw = ctx.measureText(text).width;
        const bx = (x1 + x2) / 2;
        const belowBox = Math.max(y1, y2) + 18;
        const by = belowBox + 12 < transformer.getHeight() ? belowBox : Math.min(y1, y2) - 8;
        ctx.fillStyle = color;
        ctx.fillRect(bx - tw / 2 - 6, by - 11, tw + 12, 16);
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.fillText(text, bx, by);
        ctx.textAlign = 'left';
        ctx.restore();
        this._drawHandles(ctx, [x1, y1], [x2, y2]);
      }
    });



  }

  public addOverlay(overlay: Overlay) {
    this._overlays.push(overlay);
  }

  public removeOverlay(id: string) {
    this._overlays = this._overlays.filter(o => o.id !== id);
  }

  public clear() {
    this._overlays = [];
  }

  public getOverlays(): Overlay[] {
    // Strip non-serializable fields before returning (for save/undo)
    return this._overlays.map(overlay => {
      const sanitizedOverlay = { ...overlay };
      delete sanitizedOverlay._imageCache;
      return sanitizedOverlay;
    });
  }

  public setOverlays(overlays: Overlay[]) {
    this._overlays = overlays;
    // B2 fix: after undo/redo/import, preload images for image annotation overlays
    for (const o of this._overlays) {
      if (o.type === 'annotation' && o.annotation?.kind === 'image' && o.imageUrl && !o._imageCache) {
        const img = new Image();
        img.src = o.imageUrl;
        img.onload = () => { o._imageCache = img; };
        o._imageCache = img;
      }
    }
  }

  public render(ctx: CanvasRenderingContext2D, transformer: CoordinateTransformer, dataStore: CoordinateDataSource, selectedOverlay?: Overlay | null) {
    const width = transformer.getWidth();
    const height = transformer.getHeight();

    // Clip to chart area — overlays must never bleed into Y-axis columns
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, width, height);
    ctx.clip();

    this._getRenderOrder().forEach(overlay => {
      ctx.save();
      const isSelected = selectedOverlay?.id === overlay.id;
      ctx.strokeStyle = isSelected ? '#FFEB3B' : overlay.color;
      ctx.lineWidth = isSelected ? overlay.lineWidth + 1.5 : overlay.lineWidth;
      ctx.fillStyle = isSelected ? '#FFEB3B' : overlay.color;
      ctx.font = `400 10px ${UI_FONT_FAMILY}`;

      const template = this._templates.get(overlay.type);
      if (template) {
        template.render?.(ctx, overlay, transformer, dataStore, isSelected);
        if (template.createFigures) {
          drawFigures(
            ctx,
            applyFigureStyleOverride(
              template.createFigures(this._buildFigureParams(overlay, transformer, dataStore, isSelected, template)),
              this._styleOverrides.get(overlay.type),
            ),
          );
        }
      }
      ctx.restore();
    });

    ctx.restore(); // restore clip
  }

  /**
   * Visible overlays in paint order: ascending `zLevel`, ties broken by
   * insertion order so equal-level overlays keep their historical stacking.
   */
  private _getRenderOrder(): Overlay[] {
    return this._overlays
      .map((overlay, index) => ({ overlay, index }))
      .filter(entry => entry.overlay.visible !== false)
      .sort((a, b) => {
        const levelDelta = (a.overlay.zLevel ?? 0) - (b.overlay.zLevel ?? 0);
        return levelDelta !== 0 ? levelDelta : a.index - b.index;
      })
      .map(entry => entry.overlay);
  }

  private _buildFigureParams(
    overlay: Overlay,
    transformer: CoordinateTransformer,
    dataStore: CoordinateDataSource,
    isSelected: boolean,
    template: OverlayTemplate | undefined,
  ): OverlayFigureParams {
    const coordinates = overlay.points.map(point => ({
      x: transformer.timestampToXUnbounded(point.timestamp, dataStore),
      y: transformer.priceToY(point.value),
    }));
    if (overlay.annotation?.placement === 'bottom' && coordinates[0]) {
      const anchorY = transformer.getHeight() - 8;
      coordinates[0] = { x: coordinates[0].x, y: anchorY };
      coordinates.splice(1);
    }
    return {
      overlay,
      transformer,
      dataStore,
      coordinates,
      width: transformer.getWidth(),
      height: transformer.getHeight(),
      currentStep: overlay.currentStep ?? template?.totalStep ?? overlay.points.length,
      isSelected,
    };
  }

  /** Figures a template contributes to the price axis, if any. */
  public getPriceAxisFigures(
    overlay: Overlay,
    transformer: CoordinateTransformer,
    dataStore: CoordinateDataSource,
  ): OverlayFigure[] {
    const template = this._templates.get(overlay.type);
    if (!template?.createPriceAxisFigures || overlay.visible === false) return [];
    return template.createPriceAxisFigures(
      this._buildFigureParams(overlay, transformer, dataStore, false, template),
    );
  }

  /** Figures a template contributes to the time axis, if any. */
  public getTimeAxisFigures(
    overlay: Overlay,
    transformer: CoordinateTransformer,
    dataStore: CoordinateDataSource,
  ): OverlayFigure[] {
    const template = this._templates.get(overlay.type);
    if (!template?.createTimeAxisFigures || overlay.visible === false) return [];
    return template.createTimeAxisFigures(
      this._buildFigureParams(overlay, transformer, dataStore, false, template),
    );
  }

  // ── Metadata API ─────────────────────────────────────────────────────────

  public getOverlayById(id: string): Overlay | null {
    return this._overlays.find(overlay => overlay.id === id) ?? null;
  }

  /**
   * Merge a partial update into an overlay in place. Returns the updated
   * overlay, or null when the id is unknown.
   */
  public override(id: string, update: Partial<Omit<Overlay, 'id'>>): Overlay | null {
    const overlay = this._overlays.find(item => item.id === id);
    if (!overlay) return null;
    Object.assign(overlay, update);
    return overlay;
  }

  public setLocked(id: string, locked: boolean): boolean {
    return this.override(id, { locked }) !== null;
  }

  public setVisible(id: string, visible: boolean): boolean {
    return this.override(id, { visible }) !== null;
  }

  public setZLevel(id: string, zLevel: number): boolean {
    return this.override(id, { zLevel }) !== null;
  }

  public getOverlaysByGroup(groupId: string): Overlay[] {
    return this._overlays.filter(overlay => overlay.groupId === groupId);
  }

  /** Apply an update to every overlay in a group. Returns how many changed. */
  public overrideGroup(groupId: string, update: Partial<Omit<Overlay, 'id'>>): number {
    const targets = this._overlays.filter(overlay => overlay.groupId === groupId);
    targets.forEach(overlay => Object.assign(overlay, update));
    return targets.length;
  }

  public removeGroup(groupId: string): number {
    const before = this._overlays.length;
    this._overlays = this._overlays.filter(overlay => overlay.groupId !== groupId);
    return before - this._overlays.length;
  }

  /** Total points a type needs before it is considered complete. */
  public getTotalStep(type: string): number {
    return this._templates.get(type)?.totalStep ?? 2;
  }

  public getDrawStep(type: string, stepIndex: number): OverlayDrawStep | null {
    return this._templates.get(type)?.drawSteps?.[stepIndex] ?? null;
  }

  public needsDefaultPointFigure(type: string): boolean {
    return this._templates.get(type)?.needDefaultPointFigure !== false;
  }

  public getDefaultOverlayFields(type: string): Partial<Omit<Overlay, 'id' | 'type'>> {
    return this._templates.get(type)?.defaultOverlay ?? {};
  }

  /**
   * Overlays eligible for interaction: visible and unlocked, topmost first.
   * Hidden overlays are not on screen and locked ones are deliberately inert,
   * so neither should ever win a hit test.
   */
  private _getInteractiveOverlays(): Overlay[] {
    return this._getRenderOrder()
      .filter(overlay => !overlay.locked)
      .reverse();
  }

  /**
   * Topmost interactive overlay under the pointer, or null.
   *
   * Every template describes its clickable shape as figures — `createFigures`
   * when it draws declaratively, `createHitFigures` when it draws imperatively —
   * so first-party and third-party overlays share one hit-test path. A template
   * that describes neither is not selectable, which is a template bug rather
   * than something for this method to guess around.
   */
  public findOverlayAt(x: number, y: number, transformer: CoordinateTransformer, dataStore: CoordinateDataSource): Overlay | null {
    const threshold = 10;
    for (const overlay of this._getInteractiveOverlays()) {
      const figures = this._buildHitFigures(overlay, transformer, dataStore);
      if (figures.length > 0 && isPointInAnyFigure(x, y, figures, threshold)) return overlay;
    }
    return null;
  }

  /** Figures describing an overlay's clickable area, in pixel space. */
  private _buildHitFigures(
    overlay: Overlay,
    transformer: CoordinateTransformer,
    dataStore: CoordinateDataSource,
  ): OverlayFigure[] {
    const template = this._templates.get(overlay.type);
    if (!template) return [];
    const build = template.createHitFigures ?? template.createFigures;
    if (!build) return [];
    return build(this._buildFigureParams(overlay, transformer, dataStore, false, template));
  }


  public findHandleAt(x: number, y: number, transformer: CoordinateTransformer, dataStore: CoordinateDataSource, threshold?: number): { overlay: Overlay, pointIndex: number } | null {
    const handleThreshold = threshold || 12;
    for (const overlay of this._getInteractiveOverlays()) {
      if (!this.needsDefaultPointFigure(overlay.type)) continue;

      // Special handling for Price Tag, Signal Arrow, Text, and Image annotations:
      // Direct clicking anywhere on the badge/box allows dragging it
      if (
        overlay.annotation?.kind === 'tag' ||
        overlay.annotation?.kind === 'arrow' ||
        overlay.annotation?.kind === 'text' ||
        overlay.annotation?.kind === 'image'
      ) {
        let boxWidth = 50;
        let boxHeight = 24;

        if (overlay.annotation?.kind === 'image') {
          boxWidth = 72;
          boxHeight = 48;
          const img = overlay._imageCache;
          if (img && img.complete && img.naturalWidth > 0) {
            const scale = Math.min(96 / img.naturalWidth, 64 / img.naturalHeight, 1);
            boxWidth = img.naturalWidth * scale + 10;
            boxHeight = img.naturalHeight * scale + 10;
          }
        } else {
          const text =
            overlay.text ||
            (overlay.annotation?.kind === 'tag' && overlay.points[0]
              ? overlay.points[0].value.toFixed(2)
              : overlay.annotation?.kind === 'arrow'
                ? 'Signal'
                : 'Note');
          boxWidth = Math.max(48, text.length * 7 + 18);
          boxHeight = 24;
        }

        if (overlay.annotation?.placement === 'bottom' && overlay.points[0]) {
          const hx = transformer.timestampToXUnbounded(overlay.points[0].timestamp, dataStore);
          const anchorY = transformer.getHeight() - 8;
          if (Math.hypot(x - hx, y - anchorY) < handleThreshold + 4) {
            return { overlay, pointIndex: 0 };
          }
          continue;
        }

        // 1. Tag / Arrow Note / Text / Image Box hit test (pointIndex 1)
        if (overlay.points.length >= 2) {
          const hx1 = transformer.timestampToXUnbounded(overlay.points[1].timestamp, dataStore);
          const hy1 = transformer.priceToY(overlay.points[1].value);
          if (Math.abs(x - hx1) <= boxWidth / 2 + 8 && Math.abs(y - hy1) <= boxHeight / 2 + 8) {
            return { overlay, pointIndex: 1 };
          }
        } else if (overlay.points[0]) {
          const isArrow = overlay.annotation?.kind === 'arrow';
          const isImage = overlay.annotation?.kind === 'image';
          const offset = isArrow ? 26 : isImage ? -44 : -28;
          const hx0 = transformer.timestampToXUnbounded(overlay.points[0].timestamp, dataStore);
          const hy0 = transformer.priceToY(overlay.points[0].value) + offset;
          if (Math.abs(x - hx0) <= boxWidth / 2 + 8 && Math.abs(y - hy0) <= boxHeight / 2 + 8) {
            return { overlay, pointIndex: overlay.points.length >= 2 ? 1 : 0 };
          }
        }

        // 2. Anchor point on K-line hit test (pointIndex 0)
        if (overlay.points[0]) {
          const hx0 = transformer.timestampToXUnbounded(overlay.points[0].timestamp, dataStore);
          const hy0 = transformer.priceToY(overlay.points[0].value);
          if (Math.hypot(x - hx0, y - hy0) < handleThreshold + 4) {
            return { overlay, pointIndex: 0 };
          }
        }
        continue;
      }

      for (let i = 0; i < overlay.points.length; i++) {
        const p = overlay.points[i];
        const hx = transformer.timestampToXUnbounded(p.timestamp, dataStore);
        const hy = transformer.priceToY(p.value);
        const dist = Math.sqrt(Math.pow(x - hx, 2) + Math.pow(y - hy, 2));
        if (dist < handleThreshold) {
          return { overlay, pointIndex: i };
        }
      }
    }
    return null;
  }

  private _isPointNearLine(px: number, py: number, x1: number, y1: number, x2: number, y2: number, threshold: number): boolean {
    const l2 = Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2);
    if (l2 === 0) return Math.sqrt(Math.pow(px - x1, 2) + Math.pow(py - y1, 2)) < threshold;
    // For extended lines (trend/infinite/ray), allow hit test beyond the segment endpoints
    const t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
    const tClamped = Math.max(0, Math.min(1, t));
    const dist = Math.sqrt(Math.pow(px - (x1 + tClamped * (x2 - x1)), 2) + Math.pow(py - (y1 + tClamped * (y2 - y1)), 2));
    return dist < threshold;
  }

  private _getCoordinates(overlay: Overlay, transformer: CoordinateTransformer, dataStore: CoordinateDataSource) {
    return {
      x1: transformer.timestampToXUnbounded(overlay.points[0].timestamp, dataStore),
      y1: transformer.priceToY(overlay.points[0].value),
      x2: overlay.points.length > 1 ? transformer.timestampToXUnbounded(overlay.points[1].timestamp, dataStore) : 0,
      y2: overlay.points.length > 1 ? transformer.priceToY(overlay.points[1].value) : 0
    };
  }

  private _fillWaveTriangles(
    ctx: CanvasRenderingContext2D,
    points: { x: number; y: number }[],
    kind: NonNullable<Overlay['wave']>['kind'],
    color: string,
  ) {
    const triangles = this._getWaveFillTriangles(points, kind);
    triangles.forEach((triangle, index) => {
      ctx.save();
      ctx.globalAlpha = [0.14, 0.1, 0.07][index] ?? 0.07;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(triangle[0].x, triangle[0].y);
      ctx.lineTo(triangle[1].x, triangle[1].y);
      ctx.lineTo(triangle[2].x, triangle[2].y);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    });
  }

  private _isPointInWaveFill(
    x: number,
    y: number,
    points: { x: number; y: number }[],
    kind: NonNullable<Overlay['wave']>['kind'],
  ): boolean {
    return this._getWaveFillTriangles(points, kind).some(triangle => this._isPointInPolygon(x, y, triangle));
  }

  private _getWaveFillTriangles(
    points: { x: number; y: number }[],
    kind: NonNullable<Overlay['wave']>['kind'],
  ): { x: number; y: number }[][] {
    if (kind !== 'abcd' && kind !== 'abcde') {
      return [];
    }
    const triangles: { x: number; y: number }[][] = [];
    for (let start = 0; start <= points.length - 3; start++) {
      triangles.push([points[start], points[start + 1], points[start + 2]]);
    }
    return triangles;
  }

  private _isPointInPolygon(x: number, y: number, points: { x: number; y: number }[]): boolean {
    let inside = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const current = points[i];
      const previous = points[j];
      if (
        (current.y > y) !== (previous.y > y) &&
        x < ((previous.x - current.x) * (y - current.y)) / (previous.y - current.y) + current.x
      ) {
        inside = !inside;
      }
    }
    return inside;
  }

  private _drawLinePath(
    ctx: CanvasRenderingContext2D,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    width: number,
    height: number,
    extendStart: boolean,
    extendEnd: boolean,
  ) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    if (Math.abs(dx) < 0.001 && (extendStart || extendEnd)) {
      ctx.beginPath();
      ctx.moveTo(x1, extendStart ? 0 : y1);
      ctx.lineTo(x1, extendEnd ? height : y2);
      return;
    }
    if (Math.abs(dx) < 0.001) {
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      return;
    }
    const slope = dy / dx;
    const startX = extendStart ? 0 : x1;
    const endX = extendEnd ? width : x2;
    ctx.beginPath();
    ctx.moveTo(startX, y1 + slope * (startX - x1));
    ctx.lineTo(endX, y1 + slope * (endX - x1));
  }

  private _drawPriceTag(ctx: CanvasRenderingContext2D, width: number, height: number, y: number, text: string, color: string) {
    ctx.font = `600 10px ${UI_FONT_FAMILY}`;
    const labelWidth = Math.max(48, ctx.measureText(text).width + 12);
    const labelX = Math.max(0, width - labelWidth - 4);
    const labelY = Math.max(2, Math.min(height - 18, y - 9));
    ctx.fillStyle = color;
    this._roundRect(ctx, labelX, labelY, labelWidth, 18, 4);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, labelX + labelWidth / 2, labelY + 9);
  }

  private _fillChannel(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, x4: number, y4: number) {
    ctx.save();
    ctx.globalAlpha = 0.08;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.lineTo(x3, y3);
    ctx.lineTo(x4, y4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  private _drawUnifiedAnnotationWithLeader(
    ctx: CanvasRenderingContext2D,
    overlay: Overlay,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
  ) {
    const kind = overlay.annotation?.kind ?? 'text';
    ctx.save();

    let boxWidth = 50;
    let boxHeight = 24;
    let imgW = 0;
    let imgH = 0;
    let imgElement: HTMLImageElement | null = null;
    let text = '';

    if (kind === 'image') {
      const url = overlay.imageUrl || '';
      if (url) {
        if (!overlay._imageCache) {
          const img = new Image();
          img.src = url;
          img.onload = () => {
            overlay._imageCache = img;
          };
          overlay._imageCache = img;
        }
        imgElement = overlay._imageCache;
      }
      if (imgElement && imgElement.complete && imgElement.naturalWidth > 0) {
        const scale = Math.min(96 / imgElement.naturalWidth, 64 / imgElement.naturalHeight, 1);
        imgW = imgElement.naturalWidth * scale;
        imgH = imgElement.naturalHeight * scale;
        boxWidth = imgW + 10;
        boxHeight = imgH + 10;
      } else {
        boxWidth = 72;
        boxHeight = 44;
      }
    } else {
      text =
        overlay.text ||
        (kind === 'tag' && overlay.points[0]
          ? `$${Math.abs(overlay.points[0].value) >= 1000 ? Math.round(overlay.points[0].value).toLocaleString('en-US') : overlay.points[0].value.toFixed(2)}`
          : kind === 'arrow'
            ? 'Signal'
            : 'Note');
      ctx.font = `600 12px ${UI_FONT_FAMILY}`;
      const textW = ctx.measureText(text).width;
      boxWidth = Math.max(48, textW + 18);
      boxHeight = 24;
    }

    const halfW = boxWidth / 2;
    const halfH = boxHeight / 2;

    // Keep the label body clear of its anchor even when a caller supplies a
    // second point that is too close. Preserve its chosen direction and push
    // the box outward until its nearest edge has a consistent visual gap.
    let centerDx = x2 - x1;
    let centerDy = y2 - y1;
    let centerDistance = Math.hypot(centerDx, centerDy);
    if (centerDistance < 0.01) {
      centerDx = 0;
      centerDy = -1;
      centerDistance = 1;
    }
    const unitX = centerDx / centerDistance;
    const unitY = centerDy / centerDistance;
    const edgeDistance = Math.min(
      Math.abs(unitX) > 0.0001 ? halfW / Math.abs(unitX) : Infinity,
      Math.abs(unitY) > 0.0001 ? halfH / Math.abs(unitY) : Infinity,
    );
    const minimumCenterDistance = edgeDistance + LABEL_SAFE_GAP;
    if (centerDistance < minimumCenterDistance) {
      x2 = x1 + unitX * minimumCenterDistance;
      y2 = y1 + unitY * minimumCenterDistance;
    }

    // Calculate edge contact point on the badge box so dashed leader line stops cleanly at the outer perimeter
    const dx = x1 - x2;
    const dy = y1 - y2;
    let edgeX = x2;
    let edgeY = y2;

    if (Math.abs(dx) > 1e-4 || Math.abs(dy) > 1e-4) {
      const scaleX = Math.abs(dx) > 1e-4 ? halfW / Math.abs(dx) : Infinity;
      const scaleY = Math.abs(dy) > 1e-4 ? halfH / Math.abs(dy) : Infinity;
      const t = Math.min(scaleX, scaleY);
      edgeX = x2 + dx * t;
      edgeY = y2 + dy * t;
    }

    // 1. Dashed leader line strictly from anchor (x1, y1) to box edge (edgeX, edgeY)
    ctx.strokeStyle = overlay.color || '#2962ff';
    ctx.lineWidth = overlay.lineWidth || 1.5;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(edgeX, edgeY);
    ctx.stroke();
    ctx.setLineDash([]);

    // 2. A single compact anchor dot on the marked price point.
    ctx.fillStyle = overlay.color || '#2962ff';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x1, y1, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // 4. Floating Badge / Tag Box with configurable background color & opacity
    const bx = x2 - halfW;
    const by = y2 - halfH;
    const bgColor = overlay.backgroundColor || overlay.color || '#2962ff';
    const bgOpacity = overlay.backgroundOpacity ?? overlay.opacity ?? 0.92;

    ctx.save();
    ctx.globalAlpha = bgOpacity;
    ctx.fillStyle = bgColor;
    this._roundRect(ctx, bx, by, boxWidth, boxHeight, 4);
    ctx.fill();
    ctx.restore();

    // Box border outline
    ctx.strokeStyle = overlay.color || '#2962ff';
    ctx.lineWidth = 1.2;
    this._roundRect(ctx, bx, by, boxWidth, boxHeight, 4);
    ctx.stroke();

    // 5. Content inside box
    if (kind === 'image') {
      if (imgElement && imgElement.complete && imgElement.naturalWidth > 0) {
        ctx.drawImage(imgElement, x2 - imgW / 2, y2 - imgH / 2, imgW, imgH);
      } else {
        ctx.fillStyle = '#ffffff';
        ctx.font = `400 10px ${UI_FONT_FAMILY}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(overlay.imageUrl ? 'Loading...' : 'No image', x2, y2);
      }
    } else {
      ctx.fillStyle = '#ffffff';
      ctx.font = `600 12px ${UI_FONT_FAMILY}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, x2, y2);
    }

    ctx.restore();
  }

  private _isPointNearUnifiedLine(px: number, py: number, overlay: Overlay, transformer: CoordinateTransformer, dataStore: CoordinateDataSource, threshold: number) {
    const line = overlay.line ?? {};
    const width = transformer.getWidth();
    const height = transformer.getHeight();
    const p1 = overlay.points[0];
    const p2 = overlay.points[1] ?? overlay.points[0];
    const x1 = transformer.timestampToXUnbounded(p1.timestamp, dataStore);
    const y1 = transformer.priceToY(p1.value);
    const rawX2 = transformer.timestampToXUnbounded(p2.timestamp, dataStore);
    const rawY2 = transformer.priceToY(p2.value);
    const x2 = line.direction === 'vertical' ? x1 : rawX2;
    const y2 = line.direction === 'horizontal' ? y1 : rawY2;
    if (line.showPriceLabel || line.direction === 'horizontal') {
      const startX = line.extendStart ? 0 : x1;
      const endX = line.extendEnd ? width : x2;
      return Math.abs(py - y1) < threshold && px >= Math.min(startX, endX) - threshold && px <= Math.max(startX, endX) + threshold;
    }
    if (line.direction === 'vertical') {
      const startY = line.extendStart ? 0 : y1;
      const endY = line.extendEnd ? height : y2;
      return Math.abs(px - x1) < threshold && py >= Math.min(startY, endY) - threshold && py <= Math.max(startY, endY) + threshold;
    }
    const startX = line.extendStart ? 0 : x1;
    const endX = line.extendEnd ? width : x2;
    if (Math.abs(x2 - x1) < 0.001) return Math.abs(px - x1) < threshold;
    const slope = (y2 - y1) / (x2 - x1);
    const startY = y1 + slope * (startX - x1);
    const endY = y1 + slope * (endX - x1);
    return this._isPointNearLine(px, py, startX, startY, endX, endY, threshold);
  }

  /**
   * Draw handle circles at the given [x, y] coordinate pairs.
   * Handles are small and semi-transparent so they don't occlude chart content.
   */
  private _drawHandles(ctx: CanvasRenderingContext2D, ...points: [number, number][]) {
    ctx.save();
    points.forEach(([x, y]) => {
      // Outer ring: semi-transparent white fill with blue stroke
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.strokeStyle = '#2962FF';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2); // reduced from 6 → 4px
      ctx.fill();
      ctx.stroke();
      // Inner dot
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = '#2962FF';
      ctx.beginPath();
      ctx.arc(x, y, 1.5, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  /** Helper: draw a rounded rectangle path (does not fill/stroke) */
  private _roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  /**
   * Restyle every figure a template produces for one overlay type.
   *
   * The built-in templates choose their own colours and dash patterns, so
   * restyling one used to mean forking it. Pass `undefined` to drop the
   * override and go back to what the template draws.
   */
  public setStyleOverride(type: string, override: FigureStyleOverride | undefined): void {
    if (override === undefined) this._styleOverrides.delete(type);
    else this._styleOverrides.set(type, override);
  }

  /** The override registered for a type, if any. */
  public getStyleOverride(type: string): FigureStyleOverride | undefined {
    return this._styleOverrides.get(type);
  }
}
