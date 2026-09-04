import type { FusionCandlestickChart } from '../FusionCandlestickChart';
import type { Bounding } from '../types';
import type { CoordinateTransformer } from './CoordinateTransformer';

export type PrimitivePointerPhase = 'pointerDown' | 'pointerMove' | 'pointerUp';

export type PointerTargetArea =
  | 'chart'
  | 'top-x-axis'
  | 'bottom-x-axis'
  | 'left-y-axis'
  | 'right-y-axis'
  | 'outside';

export interface PanePointerTarget {
  id: string;
  bounding: Bounding;
  localY: number;
  axisSide: 'left' | 'right';
}

export interface PrimitivePointerEventContext {
  chart: FusionCandlestickChart;
  event: PointerEvent;
  containerX: number;
  containerY: number;
  chartX: number;
  chartY: number;
  target: PointerTargetArea;
  pane: PanePointerTarget | null;
  transformer: CoordinateTransformer | null;
  logicalIndex: number | null;
  timestamp: number | null;
  price: number | null;
  preventDefault: () => void;
  requestPointerCapture: () => void;
  releasePointerCapture: () => void;
  setCursor: (cursor: string) => void;
}
