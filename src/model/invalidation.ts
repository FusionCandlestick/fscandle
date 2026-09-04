/**
 * What has to be redrawn, tracked per pane rather than per chart.
 *
 * The chart carried a single `_invalidationLevel`, so every request redrew
 * every pane at that level. Adding an indicator to the RSI pane recalculated
 * and repainted the price pane, its stacked scales, its overlays and both time
 * rulers; so did removing one, and so did a data push into one stacked scale.
 *
 * Levels are raised, never lowered: two requests between frames give the higher
 * of the two, which is what makes it safe for callers to ask for the cheapest
 * level they know is sufficient. A request that names no pane raises the floor
 * for all of them, so the conservative call is still the default one.
 */

export class InvalidationState {
  private _global: number;
  private _byPane: Map<string, number> = new Map();
  private readonly _none: number;

  constructor(none = 0, initial = none) {
    this._none = none;
    this._global = initial;
  }

  /** Raise the level for one pane, or for the whole chart when none is named. */
  public raise(level: number, paneId?: string): void {
    if (paneId === undefined) {
      this._global = Math.max(this._global, level);
      return;
    }
    this._byPane.set(paneId, Math.max(this._byPane.get(paneId) ?? this._none, level));
  }

  /** Level a given pane must be drawn at. */
  public levelFor(paneId: string): number {
    return Math.max(this._global, this._byPane.get(paneId) ?? this._none);
  }

  /** Level the chart-wide chrome must be drawn at: the highest any pane needs. */
  public maxLevel(): number {
    let highest = this._global;
    for (const level of this._byPane.values()) highest = Math.max(highest, level);
    return highest;
  }

  /** Whether anything at all is pending. */
  public isDirty(): boolean {
    return this.maxLevel() > this._none;
  }

  /** Per-pane levels above the global floor, for a frame to read. */
  public byPane(): ReadonlyMap<string, number> {
    return this._byPane;
  }

  public globalLevel(): number {
    return this._global;
  }

  /** Called once a frame has been drawn. */
  public clear(): void {
    this._global = this._none;
    this._byPane.clear();
  }

  /** Drop a pane that no longer exists, so its level cannot outlive it. */
  public forgetPane(paneId: string): void {
    this._byPane.delete(paneId);
  }
}
