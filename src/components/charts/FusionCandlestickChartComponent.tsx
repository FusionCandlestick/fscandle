"use client"

import React, { useEffect, useRef } from 'react';
import { FusionCandlestickChart } from '../../FusionCandlestickChart';
import { KLineData } from '../../types';
import { DeepPartial, ChartOptions } from '../../types/options';
import { Overlay } from '../../engine/OverlayManager';

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

    chartRef.current = mainChart;
    onChartReady?.(mainChart);

    return () => {
      mainChart.destroy();
      chartRef.current = null;
    };
  }, [data, options, stackedPricePanes, overlays, onChartReady]);

  // Synchronize tradingLines props with chart price_line overlays
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !tradingLines) return;

    // Get current chart overlays
    const existing = chart.getOverlays();

    // Remove trading lines that are no longer in props
    existing.forEach((o) => {
      if (o.id.startsWith('trading-line-')) {
        const id = o.id.replace('trading-line-', '');
        if (!tradingLines.some((l) => l.id === id)) {
          chart.removeOverlay(o.id);
        }
      }
    });

    // Create or update trading lines from props
    tradingLines.forEach((line) => {
      const overlayId = `trading-line-${line.id}`;
      const hasOverlay = existing.some((o) => o.id === overlayId);

      const overlayData = {
        id: overlayId,
        type: 'price_line',
        points: [{ timestamp: 0, value: line.price }],
        color: line.color ?? (line.type === 'position' ? '#10b981' : '#f59e0b'),
        lineWidth: 2,
        onPressedMoving: (ov: Overlay) => {
          if (line.draggable !== false) {
            onTradingLineDrag?.(line.id, ov.points[0].value);
          }
        },
        onPressedMoveEnd: (ov: Overlay) => {
          if (line.draggable !== false) {
            onTradingLineDrag?.(line.id, ov.points[0].value);
          }
        }
      };

      if (hasOverlay) {
        chart.updateOverlay(overlayId, {
          points: overlayData.points,
          color: overlayData.color,
          onPressedMoving: overlayData.onPressedMoving,
          onPressedMoveEnd: overlayData.onPressedMoveEnd
        });
      } else {
        chart.createOverlay(overlayData);
      }
    });
  }, [tradingLines, onTradingLineDrag]);

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
