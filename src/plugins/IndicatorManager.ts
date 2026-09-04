import { DEFAULT_INDICATOR_TEMPLATES, Indicator, IndicatorRenderParams, IndicatorTemplate } from './Indicator';
import { KLineData } from '../types';
import type { IndicatorOptions } from '../types/options';

export interface CreateIndicatorOptions {
  id?: string;
  calcParams?: number[];
}

export class IndicatorManager {
  private _indicators: Map<string, Indicator[]> = new Map(); // paneId -> indicators
  private _templates: Map<string, IndicatorTemplate> = new Map();
  /** Chart-wide indicator style, pushed down from the `indicators` options. */
  private _styles: IndicatorOptions | null = null;

  constructor() {
    DEFAULT_INDICATOR_TEMPLATES.forEach(template => this.registerTemplate(template));
  }

  public registerTemplate(template: IndicatorTemplate) {
    this._templates.set(template.shortName.toUpperCase(), template);
    this._templates.set(template.name.toUpperCase(), template);
  }

  public getTemplate(name: string): IndicatorTemplate | null {
    return this._templates.get(name.toUpperCase()) ?? null;
  }

  public getRegisteredTemplates(): IndicatorTemplate[] {
    const byShortName = new Map<string, IndicatorTemplate>();
    this._templates.forEach(template => {
      byShortName.set(template.shortName.toUpperCase(), template);
    });
    return [...byShortName.values()];
  }

  public createIndicator(paneId: string, name: string, options: CreateIndicatorOptions = {}): Indicator {
    const template = this.getTemplate(name);
    if (!template) {
      throw new Error(`Unknown indicator template: ${name}`);
    }

    const indicator = new Indicator(options.id ?? `${template.shortName.toLowerCase()}_${Date.now()}`, {
      ...template,
      calcParams: options.calcParams ? [...options.calcParams] : [...template.calcParams],
      figures: template.figures.map(figure => ({ ...figure })),
    });
    this.addIndicator(paneId, indicator);
    return indicator;
  }

  public getIndicators(paneId: string): Indicator[] {
    return this._indicators.get(paneId) || [];
  }

  public addIndicator(paneId: string, indicator: Indicator) {
    if (!this._indicators.has(paneId)) {
      this._indicators.set(paneId, []);
    }
    this._indicators.get(paneId)?.push(indicator);
  }

  public calcAll(dataList: KLineData[]) {
    this._indicators.forEach(indicators => {
      indicators.forEach(indicator => {
        indicator.calc(dataList);
      });
    });
  }

  /** Drawing style for every indicator this manager renders. */
  public setStyles(styles: IndicatorOptions) {
    this._styles = styles;
  }

  public render(paneId: string, params: Omit<IndicatorRenderParams, 'result'>) {
    const indicators = this._indicators.get(paneId);
    if (!indicators) return;

    indicators.forEach(indicator => {
      if (indicator.result.length > 0) {
        indicator.draw({ styles: this._styles ?? undefined, ...params, result: indicator.result });
      }
    });
  }

  public removeIndicator(paneId: string, indicatorId: string) {
    const indicators = this._indicators.get(paneId);
    if (indicators) {
      this._indicators.set(paneId, indicators.filter(ind => ind.id !== indicatorId));
    }
  }

  public getValuesAt(paneId: string, index: number) {
    const indicators = this._indicators.get(paneId);
    if (!indicators) return [];
    
    return indicators.map(ind => {
      const val = ind.result[index];
      return {
        id: ind.id,
        name: ind.template.shortName,
        figures: ind.template.figures,
        data: val
      };
    });
  }
}
