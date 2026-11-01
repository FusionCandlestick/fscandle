"use client"

import React, { useEffect, useRef } from 'react';
import { FusionCandlestickChart } from '../../FusionCandlestickChart';
import { KLineData } from '../../types';
import { DeepPartial, ChartOptions } from '../../types/options';
import { Overlay } from '../../engine/OverlayManager';
import {
  buildTradingLineFields,
  isTradingLineOverlayId,
  TRADING_LINE_OVERLAY_TYPE,
  tradingLineOverlayId,
  tradingLineTemplate,
} from '../../model/tradingLineOverlay';

export interface StackedPricePaneInput {
  id?: string;
  data: KLineData[];
  side?: 'left' | 'right';
  style?: 'candle' | 'bar' | 'area' | 'hollow' | 'ha';
  options?: Record<string, unknown>;
}

export interface TradingLineInput {
  id: string;
  type: 'limit' | 'stop' | 'position' | 'entry';
  price: number;
  label: string;
  color?: string;
  draggable?: boolean;
}

export interface FusionCandlestickChartProps {
  data: KLineData[];
  options?: DeepPartial<ChartOptions>;
  stackedPricePanes?: StackedPricePaneInput[];
  overlays?: Array<Overlay | (Omit<Overlay, 'id'> & { id?: string })>;
  className?: string;
  style?: React.CSSProperties;
  onChartReady?: (chart: FusionCandlestickChart) => void;

  // ── Extended props to expose customization slots to component users ──
  symbol?: string;
  tradingLines?: TradingLineInput[];
  onTradingLineDrag?: (id: string, nextPrice: number) => void;
}

export const FusionCandlestickChartComponent: React.FC<FusionCandlestickChartProps> = ({
  data,
  options,
  stackedPricePanes,
  overlays,
  className,
  style,
  onChartReady,
  symbol,
  tradingLines,
  onTradingLineDrag,
}) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<FusionCandlestickChart | null>(null);
  // Drag callbacks are attached to chart overlays once and must always reach the
  // latest handler, so they read it through a ref rather than a stale closure.
  const onTradingLineDragRef = useRef(onTradingLineDrag);
  useEffect(() => {
    onTradingLineDragRef.current = onTradingLineDrag;
  }, [onTradingLineDrag]);

  const anchorTimestamp = data.length > 0 ? data[data.length - 1].timestamp : 0;

  /**
   * Make the chart's trading-line overlays match `lines`: create missing ones,
   * update existing ones in place, and remove ones no longer requested. Safe to
   * call on a freshly built chart, whose persisted state may already hold them.
   */
  const syncTradingLines = (chart: FusionCandlestickChart, lines: TradingLineInput[] | undefined) => {
    chart.registerOverlayTemplate(tradingLineTemplate);

    const wanted = lines ?? [];
    const wantedIds = new Set(wanted.map(line => tradingLineOverlayId(line.id)));
    const current = chart.getOverlays();
    current.forEach(overlay => {
      if (isTradingLineOverlayId(overlay.id) && !wantedIds.has(overlay.id)) {
        chart.removeOverlay(overlay.id);
      }
    });

    wanted.forEach(line => {
      const overlayId = tradingLineOverlayId(line.id);
      const fields = buildTradingLineFields(line, anchorTimestamp);
      const onDrag = (overlay: Overlay) => {
        onTradingLineDragRef.current?.(line.id, overlay.points[0].value);
      };
      const existing = current.find(overlay => overlay.id === overlayId);

      if (existing && existing.type === TRADING_LINE_OVERLAY_TYPE) {
        chart.updateOverlay(overlayId, { ...fields, onPressedMoving: onDrag, onPressedMoveEnd: onDrag });
        return;
      }
      // A line of this id from an older build (for example a `price_line`
      // overlay restored from persisted state) cannot be updated into the new
      // type, so replace it.
      if (existing) chart.removeOverlay(overlayId);
      chart.createOverlay({ id: overlayId, ...fields, onPressedMoving: onDrag, onPressedMoveEnd: onDrag });
    });
  };

  const buildLayerData = (source: KLineData[], multiplier: number, wave: number) => {
    return source.map((item, index) => {
      const drift = 1 + Math.sin(index / 10) * wave + Math.cos(index / 17) * wave * 0.6;
      const scaledOpen = item.open * multiplier * drift;
      const scaledClose = item.close * multiplier * (1 + Math.sin(index / 13) * wave * 0.8);
      const high = Math.max(scaledOpen, scaledClose, item.high * multiplier * drift);
      const low = Math.min(scaledOpen, scaledClose, item.low * multiplier * drift);

      return {
        ...item,
        open: scaledOpen,
        high,
        low,
        close: scaledClose,
      };
    });
  };

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const mainChart = new FusionCandlestickChart(chartContainerRef.current, {
      layout: { background: { color: '#131722' }, textColor: '#d1d4dc' },
      ...options,
    });
    mainChart.addCandlestickSeries();
    mainChart.setData(data);

    const stackedLayers: StackedPricePaneInput[] = stackedPricePanes ?? [
      {
        id: 'eth',
        side: 'left',
        data: buildLayerData(data, 0.42, 0.035),
        options: { upColor: 'rgba(56, 189, 248, 0.55)', downColor: 'rgba(14, 165, 233, 0.35)', borderUpColor: '#38bdf8', borderDownColor: '#0ea5e9', wickUpColor: '#7dd3fc', wickDownColor: '#38bdf8' }
      },
      {
        id: 'sol',
        side: 'right',
        data: buildLayerData(data, 0.18, 0.042),
        options: { upColor: 'rgba(244, 114, 182, 0.5)', downColor: 'rgba(236, 72, 153, 0.35)', borderUpColor: '#f472b6', borderDownColor: '#ec4899', wickUpColor: '#f9a8d4', wickDownColor: '#f472b6' }
      },
      {
        id: 'nvda',
        side: 'left',
        data: buildLayerData(data, 1.28, 0.028),
        options: { upColor: 'rgba(132, 204, 22, 0.45)', downColor: 'rgba(101, 163, 13, 0.32)', borderUpColor: '#84cc16', borderDownColor: '#65a30d', wickUpColor: '#bef264', wickDownColor: '#84cc16' }
      },
      {
        id: 'tsla',
        side: 'right',
        data: buildLayerData(data, 0.74, 0.032),
        options: { upColor: 'rgba(251, 191, 36, 0.45)', downColor: 'rgba(245, 158, 11, 0.3)', borderUpColor: '#fbbf24', borderDownColor: '#f59e0b', wickUpColor: '#fde68a', wickDownColor: '#fbbf24' }
      },
      {
        id: 'aapl',
        side: 'left',
        data: buildLayerData(data, 0.93, 0.024),
        options: { upColor: 'rgba(168, 85, 247, 0.42)', downColor: 'rgba(147, 51, 234, 0.28)', borderUpColor: '#a855f7', borderDownColor: '#9333ea', wickUpColor: '#d8b4fe', wickDownColor: '#a855f7' }
      },
    ];

    stackedLayers.forEach(layer => {
      mainChart.addStackedPricePane({
        id: layer.id,
        data: layer.data,
        side: layer.side,
        style: layer.style ?? 'candle',
        options: layer.options,
      });
    });

    if (overlays) {
      overlays.forEach(overlay => mainChart.createOverlay(overlay));
    } else if (data.length > 50) {
      mainChart.createOverlay({
        type: 'line',
        points: [
          { timestamp: data[0].timestamp, value: data[0].low },
          { timestamp: data[data.length - 1].timestamp, value: data[data.length - 1].high }
        ],
        color: '#2962FF',
        lineWidth: 2,
        line: { direction: 'free', extendStart: false, extendEnd: false }
      });
    }

    // A rebuilt chart starts without its trading lines (their callbacks are not
    // persisted), so they are restored here, not only when `tradingLines` changes.
    syncTradingLines(mainChart, tradingLines);

    chartRef.current = mainChart;
    onChartReady?.(mainChart);

    return () => {
      mainChart.destroy();
      chartRef.current = null;
    };
  }, [data, options, stackedPricePanes, overlays, onChartReady]);

  // Keep the chart's trading lines in step with the `tradingLines` prop.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    syncTradingLines(chart, tradingLines);
  }, [tradingLines]);

  // Synchronize active symbol changes
  useEffect(() => {
    if (chartRef.current && symbol) {
      chartRef.current.applyOptions({
        watermark: {
          text: symbol,
        }
      });
    }
  }, [symbol]);

  return (
    <div
      ref={chartContainerRef}
      className={className}
      style={{ width: '100%', height: '100%', ...style }}
    />
  );
};
