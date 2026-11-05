import type { Pane } from '../engine/Pane';

export interface ScreenshotInput {
  /** The chart's size in CSS pixels. */
  width: number;
  height: number;
  devicePixelRatio: number;
  background: string;
  panes: readonly Pane[];
  /** A time ruler's layer canvases and its top edge in CSS pixels, when shown. */
  topRuler: { canvases: Map<string, HTMLCanvasElement>; top: number } | null;
  bottomRuler: { canvases: Map<string, HTMLCanvasElement>; top: number } | null;
}

/**
 * Composite the chart's canvases into one PNG data URL: each pane's grid, main
 * and overlay layers for the plot and both price-axis columns, then the time
 * rulers. The DOM toolbar and legends are not part of it.
 */
export function composeScreenshot(input: ScreenshotInput): string {
  const dpr = input.devicePixelRatio || 1;
  const finalCanvas = document.createElement('canvas');
  finalCanvas.width = input.width * dpr;
  finalCanvas.height = input.height * dpr;
  const ctx = finalCanvas.getContext('2d');
  if (!ctx) return '';

  // `drawImage` throws on a zero-sized source (an inactive Y-axis rail keeps a
  // 0-width canvas), so every blit goes through this guard.
  const blit = (source: HTMLCanvasElement | null | undefined, x: number, y: number) => {
    if (source && source.width > 0 && source.height > 0) ctx.drawImage(source, x, y);
  };
  const leftOf = (canvas: HTMLCanvasElement) => Number.parseFloat(canvas.style.left || '0') * dpr;

  ctx.fillStyle = input.background;
  ctx.fillRect(0, 0, finalCanvas.width, finalCanvas.height);

  for (const pane of input.panes) {
    const top = pane.getBounding().top * dpr;
    for (const layer of ['grid', 'main', 'overlay'] as const) {
      const chartCanvas = pane.getCanvas(layer, 'chart');
      if (chartCanvas) blit(chartCanvas, leftOf(chartCanvas), top);
      for (const area of ['leftYAxis', 'rightYAxis'] as const) {
        const axisCanvas = pane.getCanvas(layer, area);
        if (axisCanvas) blit(axisCanvas, leftOf(axisCanvas), top);
      }
    }
  }

  for (const ruler of [input.topRuler, input.bottomRuler]) {
    if (!ruler) continue;
    for (const layer of ['grid', 'overlay']) {
      const canvas = ruler.canvases.get(layer);
      if (canvas) blit(canvas, leftOf(canvas), ruler.top * dpr);
    }
  }

  return finalCanvas.toDataURL('image/png');
}
