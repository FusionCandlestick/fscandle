import { FusionCandlestickChart } from '../FusionCandlestickChart';

export class ChartSyncGroup {
  private _charts: Set<FusionCandlestickChart> = new Set();
  private _isLocked: boolean = false;

  public addChart(chart: FusionCandlestickChart) {
    this._charts.add(chart);
  }

  public removeChart(chart: FusionCandlestickChart) {
    this._charts.delete(chart);
  }

  public sync(source: FusionCandlestickChart, state: { 
    offset?: number; 
    barSpacing?: number; 
    yScale?: number; 
    yOffset?: number;
    crosshairPos?: { x: number, y: number } | null 
  }) {
    if (this._isLocked) return;
    this._isLocked = true;

    try {
      this._charts.forEach(chart => {
        if (chart === source) return;

        if (state.offset !== undefined || state.barSpacing !== undefined || state.yScale !== undefined || state.yOffset !== undefined) {
          chart.syncState({
            offset: state.offset,
            barSpacing: state.barSpacing,
            yScale: state.yScale,
            yOffset: state.yOffset
          });
        }

        if (state.crosshairPos !== undefined) {
          chart.syncCrosshair(state.crosshairPos);
        }
      });
    } finally {
      this._isLocked = false;
    }
  }
}
