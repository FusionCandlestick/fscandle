import { CoordinateDataSource, CoordinateTransformer } from './CoordinateTransformer';
import { UI_FONT_FAMILY } from '../model/fontFamily';
import {
  OverlayFigure,
  applyFigureStyleOverride,
  drawFigures,
  isPointInAnyFigure,
  type FigureStyleOverride,
} from './OverlayFigure';
import type { Overlay, OverlayDrawStep, OverlayFigureParams, OverlayTemplate } from './overlayTypes';
import { createBuiltinOverlayTemplates } from './builtinOverlayTemplates';
export type { Overlay, OverlayDrawStep, OverlayFigureParams, OverlayPoint, OverlayTemplate } from './overlayTypes';

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
    for (const template of createBuiltinOverlayTemplates()) this.registerTemplate(template);
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

  /**
   * Draw handle circles at the given [x, y] coordinate pairs.
   * Handles are small and semi-transparent so they don't occlude chart content.
   */

  /** Helper: draw a rounded rectangle path (does not fill/stroke) */

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
