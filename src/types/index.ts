export interface KLineData {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
  turnover?: number;
  marker?: {
    text: string;
    color: string;
    position: 'top' | 'bottom';
  };
}

export type Point = { x: number; y: number };

export interface Bounding {
  width: number;
  height: number;
  left: number;
  top: number;
}

export interface VisibleRange {
  from: number;
  to: number;
}

export type FigureStyleMap = Record<string, string | number | boolean | null | undefined>;

export interface Figure {
  type: 'line' | 'bar' | 'circle' | 'text' | 'rect';
  attrs: FigureStyleMap;
  styles?: FigureStyleMap;
}

export interface IndicatorFigure {
  key: string;
  type: 'line' | 'bar' | 'circle' | 'text';
  title?: string;
  styles?: (params: Record<string, unknown>) => FigureStyleMap;
  baseValue?: number;
}
