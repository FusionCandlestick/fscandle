// A page that mounts FusionCandlestickChartComponent for the browser tests.
// Props cross the Playwright boundary as data, so the callbacks live here and
// record into window.reactEvents.

import { createRoot, type Root } from 'react-dom/client';

import { FusionCandlestickChartComponent } from '../../src/react';
import type { FusionCandlestickChartProps } from '../../src/react';
import type { FusionCandlestickChart } from '../../src/FusionCandlestickChart';

export interface ReactEvents {
  ready: number;
  drags: Array<[string, number]>;
}

declare global {
  interface Window {
    reactEvents: ReactEvents;
    reactChart: FusionCandlestickChart | null;
    renderChart: (props: Partial<FusionCandlestickChartProps>, target?: string) => void;
    unmountChart: (target?: string) => void;
  }
}

window.reactEvents = { ready: 0, drags: [] };
window.reactChart = null;

const roots = new Map<string, Root>();
const currentProps = new Map<string, Partial<FusionCandlestickChartProps>>();

// Stable callbacks: tests check that the chart is not rebuilt, so these must
// not change identity between renders.
const onChartReady = (chart: FusionCandlestickChart) => {
  window.reactEvents.ready += 1;
  window.reactChart = chart;
};
const onTradingLineDrag = (id: string, price: number) => {
  window.reactEvents.drags.push([id, price]);
};

window.renderChart = (props, target = 'root') => {
  const merged = { ...currentProps.get(target), ...props };
  currentProps.set(target, merged);
  let root = roots.get(target);
  if (!root) {
    root = createRoot(document.getElementById(target) as HTMLElement);
    roots.set(target, root);
  }
  root.render(
    <div style={{ width: 900, height: 500 }}>
      <FusionCandlestickChartComponent
        data={[]}
        onChartReady={onChartReady}
        onTradingLineDrag={onTradingLineDrag}
        {...merged}
      />
    </div>,
  );
};

window.unmountChart = (target = 'root') => {
  roots.get(target)?.unmount();
  roots.delete(target);
  currentProps.delete(target);
};
