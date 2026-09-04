import { BaseSeries } from './BaseSeries';
import { CoordinateTransformer } from './CoordinateTransformer';

export interface VolumeSeriesOptions {
  upColor?: string;
  downColor?: string;
}

export class VolumeSeries extends BaseSeries<VolumeSeriesOptions> {
  public updateOptions(options: Partial<VolumeSeriesOptions>) {
    this._options = { ...this._options, ...options };
  }

  public render(ctx: CanvasRenderingContext2D, transformer: CoordinateTransformer): void {
    const data = this._data;
    if (data.length === 0) return;

    const barSpacing = transformer.getBarSpacing();
    const barWidth = barSpacing * 0.8;
    const height = transformer.getHeight() || ctx.canvas.height;
    
    // Find max volume for scaling (usually only uses bottom 20% of pane)
    // A scan, not a spread over a mapped copy: this runs on every render, and
    // the spread form would throw on a dataset large enough to need it.
    let maxVolume = 0;
    for (const item of data) {
      const volume = item.volume || 0;
      if (volume > maxVolume) maxVolume = volume;
    }
    const volumeHeight = height * 0.2; // Reserve 20% for volume

    data.forEach((d, i) => {
      const x = transformer.indexToX(i) - barWidth / 2;
      const vHeight = ((d.volume || 0) / maxVolume) * volumeHeight;
      const y = height - vHeight;

      const isUp = d.close >= d.open;
      ctx.fillStyle = isUp
        ? (this._options.upColor ?? 'rgba(38, 166, 154, 0.5)')
        : (this._options.downColor ?? 'rgba(239, 83, 80, 0.5)');
      
      ctx.fillRect(x, y, barWidth, vHeight);
    });
  }
}
