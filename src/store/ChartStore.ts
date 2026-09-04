import { KLineData } from '../types';

interface ViewportState {
  offset: number;
  barSpacing: number;
  yScale: number;
  yOffset: number;
}

interface InteractionState {
  crosshairPos: { x: number; y: number } | null;
  hoveredData: KLineData | null;
  activeDrawingType: string | null;
  magnetMode: boolean;
  activePricePaneId: string;
  activeYAxisPaneId: string | null;
}

export interface ChartStoreState {
  viewport: ViewportState;
  interaction: InteractionState;
  paneWeights: number[];
}

export class ChartStore {
  private _state: ChartStoreState;

  constructor(initialState?: Partial<ChartStoreState>) {
    this._state = {
      viewport: {
        offset: 20,
        barSpacing: 10,
        yScale: 1,
        yOffset: 0,
        ...initialState?.viewport,
      },
      interaction: {
        crosshairPos: null,
        hoveredData: null,
        activeDrawingType: null,
        magnetMode: true,
        activePricePaneId: 'main',
        activeYAxisPaneId: null,
        ...initialState?.interaction,
      },
      paneWeights: initialState?.paneWeights ? [...initialState.paneWeights] : [1],
    };
  }

  public getState() {
    return this._state;
  }

  public replace(state: Partial<ChartStoreState>) {
    this._state = {
      ...this._state,
      ...state,
      viewport: {
        ...this._state.viewport,
        ...state.viewport,
      },
      interaction: {
        ...this._state.interaction,
        ...state.interaction,
      },
      paneWeights: state.paneWeights ? [...state.paneWeights] : this._state.paneWeights,
    };
  }
}
