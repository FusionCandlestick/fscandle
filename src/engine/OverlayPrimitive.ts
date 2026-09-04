import type { DataStore } from '../store/DataStore';
import type { ChartPrimitive, PrimitivePaneRenderer } from './Primitive';
import type { Overlay, OverlayManager } from './OverlayManager';

export class OverlayPrimitive implements ChartPrimitive {
  public id = 'fusion:overlays';
  private _overlayManager: OverlayManager;
  private _dataStore: DataStore;
  private _getSelectedOverlay: () => Overlay | null;

  constructor(overlayManager: OverlayManager, dataStore: DataStore, getSelectedOverlay: () => Overlay | null) {
    this._overlayManager = overlayManager;
    this._dataStore = dataStore;
    this._getSelectedOverlay = getSelectedOverlay;
  }

  public paneViews() {
    return [{
      paneId: 'main',
      layer: 'overlay' as const,
      zOrder: 0,
      renderer: (): PrimitivePaneRenderer => ({
        draw: (ctx, params) => {
          this._overlayManager.render(ctx, params.transformer, this._dataStore, this._getSelectedOverlay());
        },
      }),
    }];
  }
}
