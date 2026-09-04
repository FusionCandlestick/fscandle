import { Bounding } from '../types';

export type PaneLayer = 'main' | 'grid' | 'overlay';
export type PaneArea = 'chart' | 'yAxis' | 'leftYAxis' | 'rightYAxis';

export class Pane {
  private _id: string;
  private _container: HTMLDivElement;
  private _canvases: Map<string, HTMLCanvasElement> = new Map();
  private _bounding: Bounding = { width: 0, height: 0, left: 0, top: 0 };
  private _yAxisSide: 'left' | 'right' = 'right';

  constructor(id: string, parent: HTMLDivElement) {
    this._id = id;
    this._container = document.createElement('div');
    this._container.style.position = 'absolute';
    this._container.style.width = '100%';
    this._container.style.overflow = 'hidden';
    parent.appendChild(this._container);

    this._setupCanvases();
  }

  private _setupCanvases() {
    const layers = ['main', 'grid', 'overlay'];
    const areas = ['chart', 'leftYAxis', 'rightYAxis'];
    
    areas.forEach(area => {
      layers.forEach(layer => {
        const canvas = document.createElement('canvas');
        canvas.style.position = 'absolute';
        canvas.style.top = '0';
        canvas.style.left = '0';
        canvas.style.right = 'auto';
        canvas.style.zIndex = layer === 'overlay' ? '10' : '0';
        this._container.appendChild(canvas);
        this._canvases.set(`${area}_${layer}`, canvas);
      });
    });
  }

  public resize(bounding: Bounding, leftYAxisWidth: number, rightYAxisWidth: number) {
    this._bounding = bounding;
    this._container.style.height = `${bounding.height}px`;
    this._container.style.top = `${bounding.top}px`;
    
    const dpr = window.devicePixelRatio || 1;
    const chartWidth = bounding.width - leftYAxisWidth - rightYAxisWidth;

    this._canvases.forEach((canvas, key) => {
      const isLeftYAxis = key.startsWith('leftYAxis_');
      const isRightYAxis = key.startsWith('rightYAxis_');
      const width = isLeftYAxis ? leftYAxisWidth : isRightYAxis ? rightYAxisWidth : chartWidth;
      
      canvas.width = width * dpr;
      canvas.height = bounding.height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${bounding.height}px`;
      if (isLeftYAxis) {
        canvas.style.left = '0';
      } else if (isRightYAxis) {
        canvas.style.left = `${leftYAxisWidth + chartWidth}px`;
      } else {
        canvas.style.left = `${leftYAxisWidth}px`;
      }
      
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    });
  }

  public setYAxisSide(side: 'left' | 'right') {
    this._yAxisSide = side;
  }

  public getYAxisSide() {
    return this._yAxisSide;
  }

  public getContext(layer: PaneLayer, area: PaneArea = 'chart'): CanvasRenderingContext2D | null {
    const normalizedArea = area === 'yAxis' ? (this._yAxisSide === 'left' ? 'leftYAxis' : 'rightYAxis') : area;
    return this._canvases.get(`${normalizedArea}_${layer}`)?.getContext('2d') || null;
  }

  public getCanvas(layer: PaneLayer, area: PaneArea = 'chart'): HTMLCanvasElement | null {
    const normalizedArea = area === 'yAxis' ? (this._yAxisSide === 'left' ? 'leftYAxis' : 'rightYAxis') : area;
    return this._canvases.get(`${normalizedArea}_${layer}`) ?? null;
  }

  public getContainer(): HTMLDivElement {
    return this._container;
  }

  public getId(): string { return this._id; }
  public getBounding(): Bounding { return this._bounding; }
}
