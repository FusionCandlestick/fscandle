/**
 * Undo and redo for overlays.
 *
 * Snapshots used to be JSON strings, which drop every function. Undoing any
 * edit therefore stripped overlay callbacks (onClick, onPressedMoving, ...),
 * and a React trading line stopped reporting drags after one Ctrl+Z.
 *
 * A snapshot now keeps the data as JSON, so later edits cannot reach it, and
 * the functions separately by overlay id. On restore, an overlay's current
 * callbacks win over the snapshot's: the live handler is the newest one. The
 * snapshot's callbacks apply only to overlays that undo brings back.
 */

import type { Overlay } from './overlayTypes';

type Callbacks = Record<string, unknown>;

interface Snapshot {
  data: string;
  callbacks: Map<string, Callbacks>;
}

function callbacksOf(overlay: Overlay): Callbacks {
  const callbacks: Callbacks = {};
  for (const [key, value] of Object.entries(overlay)) {
    if (typeof value === 'function') callbacks[key] = value;
  }
  return callbacks;
}

function takeSnapshot(overlays: readonly Overlay[]): Snapshot {
  return {
    data: JSON.stringify(overlays),
    callbacks: new Map(overlays.map(overlay => [overlay.id, callbacksOf(overlay)])),
  };
}

function restoreSnapshot(snapshot: Snapshot, current: readonly Overlay[]): Overlay[] {
  const live = new Map(current.map(overlay => [overlay.id, callbacksOf(overlay)]));
  return (JSON.parse(snapshot.data) as Overlay[]).map(overlay => ({
    ...overlay,
    ...snapshot.callbacks.get(overlay.id),
    ...live.get(overlay.id),
  }));
}

export class OverlayHistory {
  private _undo: Snapshot[] = [];
  private _redo: Snapshot[] = [];

  constructor(private readonly _limit = 50) {}

  /** Remember the overlays as they are before an edit. Clears the redo stack. */
  public record(current: readonly Overlay[]): void {
    this._undo.push(takeSnapshot(current));
    if (this._undo.length > this._limit) this._undo.shift();
    this._redo = [];
  }

  /** The overlays before the last edit, or null when there is nothing to undo. */
  public undo(current: readonly Overlay[]): Overlay[] | null {
    const previous = this._undo.pop();
    if (!previous) return null;
    this._redo.push(takeSnapshot(current));
    return restoreSnapshot(previous, current);
  }

  /** The overlays after the last undone edit, or null when there is nothing to redo. */
  public redo(current: readonly Overlay[]): Overlay[] | null {
    const next = this._redo.pop();
    if (!next) return null;
    this._undo.push(takeSnapshot(current));
    return restoreSnapshot(next, current);
  }

  public clear(): void {
    this._undo = [];
    this._redo = [];
  }

  public get canUndo(): boolean {
    return this._undo.length > 0;
  }

  public get canRedo(): boolean {
    return this._redo.length > 0;
  }
}
