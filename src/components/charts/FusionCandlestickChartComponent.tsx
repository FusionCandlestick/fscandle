"use client"

import React, { useEffect, useRef } from 'react';
import { FusionCandlestickChart } from '../../FusionCandlestickChart';
import { KLineData } from '../../types';
import { DeepPartial, ChartOptions, defaultOptions } from '../../types/options';
import { Overlay } from '../../engine/OverlayManager';
import {
  buildTradingLineFields,
  isTradingLineOverlayId,
  TRADING_LINE_OVERLAY_TYPE,
  tradingLineOverlayId,
  tradingLineTemplate,
} from '../../model/tradingLineOverlay';
import { planDataSync, stableSignature } from '../../model/chartSync';

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
  /**
   * Chart options. Changes are applied to the live chart with `applyOptions`,
   * so keys removed from this object keep their last value. Memoise it if it is
   * built inline, to avoid redundant work on every render.
   */
  options?: DeepPartial<ChartOptions>;
  /**
   * Stacked price panes, reconciled by `id` (or position when `id` is absent).
   * Memoise the array and each `data` array, or they are re-applied on every render.
   */
  stackedPricePanes?: StackedPricePaneInput[];
  /**
   * Overlays owned by the caller, reconciled by `id`. Overlays the user draws
   * are not touched. Give each overlay a stable `id`; without one, its position
   * in the array is used. Memoise the array.
   */
  overlays?: Array<Overlay | (Omit<Overlay, 'id'> & { id?: string })>;
  className?: string;
  style?: React.CSSProperties;
  /** Called once per mounted chart. The chart instance stays the same across prop changes. */
  onChartReady?: (chart: FusionCandlestickChart) => void;
  /**
   * Key under which the chart stores its drawings and layout in localStorage.
   * Every chart on a page needs a different key; a shared key makes charts
   * overwrite each other's state.
   */
  persistenceKey?: string;

  symbol?: string;
  tradingLines?: TradingLineInput[];
  onTradingLineDrag?: (id: string, nextPrice: number) => void;
}

const THEME_BACKGROUND = '#131722';
const THEME_TEXT = '#d1d4dc';
const PROP_OVERLAY_PREFIX = 'prop-overlay-';

/** Mounted charts per persistence key, to warn when two would share state. */
const mountedPersistenceKeys = new Map<string, number>();

function acquirePersistenceKey(key: string) {
  const count = (mountedPersistenceKeys.get(key) ?? 0) + 1;
  mountedPersistenceKeys.set(key, count);
  if (count > 1) {
    console.warn(
      `[fscandle] ${count} charts share the persistence key "${key}". They will overwrite each other's saved state. Pass a unique persistenceKey to each chart.`,
    );
  }
}

function releasePersistenceKey(key: string) {
  const count = (mountedPersistenceKeys.get(key) ?? 1) - 1;
  if (count <= 0) mountedPersistenceKeys.delete(key);
  else mountedPersistenceKeys.set(key, count);
}

/**
 * Options for the constructor. Caller options win; the dark theme only fills in
 * what the caller did not set, including inside `layout`.
 */
function constructorOptions(
  options: DeepPartial<ChartOptions> | undefined,
  persistenceKey: string,
): DeepPartial<ChartOptions> {
  return {
    ...options,
    layout: {
      background: { color: THEME_BACKGROUND },
      textColor: THEME_TEXT,
      ...options?.layout,
    },
    persistence: {
      ...options?.persistence,
      key: options?.persistence?.key ?? persistenceKey,
    },
  };
}

/**
 * Make the chart's trading-line overlays match `lines`: create missing ones,
 * update existing ones in place, and remove ones no longer requested. Safe on a
 * freshly built chart, whose persisted state may already hold them.
 */
function syncTradingLines(
  chart: FusionCandlestickChart,
  lines: TradingLineInput[] | undefined,
  anchorTimestamp: number,
  onDrag: (id: string, price: number) => void,
) {
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
    const handler = (overlay: Overlay) => onDrag(line.id, overlay.points[0].value);
    const callbacks = { onPressedMoving: handler, onPressedMoveEnd: handler };
    const existing = current.find(overlay => overlay.id === overlayId);

    if (existing && existing.type === TRADING_LINE_OVERLAY_TYPE) {
      chart.updateOverlay(overlayId, { ...fields, ...callbacks });
      return;
    }
    // A line of this id from an older build (for example a `price_line` overlay
    // restored from persisted state) cannot be updated into the new type.
    if (existing) chart.removeOverlay(overlayId);
    chart.createOverlay({ id: overlayId, ...fields, ...callbacks });
  });
}

interface ManagedStackedPane {
  signature: string;
  data: KLineData[];
}

export const FusionCandlestickChartComponent: React.FC<FusionCandlestickChartProps> = ({
  data,
  options,
  stackedPricePanes,
  overlays,
  className,
  style,
  onChartReady,
  persistenceKey,
  symbol,
  tradingLines,
  onTradingLineDrag,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<FusionCandlestickChart | null>(null);

  // Latest props for code that runs once (mount) or from chart callbacks, which
  // must not capture a stale closure.
  const latest = useRef({ options, onChartReady, onTradingLineDrag, persistenceKey, symbol });
  const dataRef = useRef<KLineData[] | null>(null);
  const optionsSignatureRef = useRef('');
  const stackedRef = useRef(new Map<string, ManagedStackedPane>());
  const overlaysRef = useRef<{ ids: Set<string> } | null>(null);

  useEffect(() => {
    latest.current = { options, onChartReady, onTradingLineDrag, persistenceKey, symbol };
  });

  // Create the chart once per mount. Everything else is applied to it below.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const { options: initialOptions, onChartReady: ready, persistenceKey: keyProp } = latest.current;
    const key = initialOptions?.persistence?.key ?? keyProp ?? defaultOptions.persistence.key;
    acquirePersistenceKey(key);

    const chart = new FusionCandlestickChart(container, constructorOptions(initialOptions, key));
    // The main series must exist before stacked panes are added: without it, the
    // main price range follows the first stacked series instead of the candles.
    chart.addCandlestickSeries();
    // Restored state can override what the caller passed. Re-apply the caller's
    // options so that props win over saved state.
    chart.applyOptions(initialOptions ?? {});

    chartRef.current = chart;
    dataRef.current = null;
    stackedRef.current = new Map();
    overlaysRef.current = null;
    optionsSignatureRef.current = stableSignature(initialOptions);

    ready?.(chart);

    return () => {
      chartRef.current = null;
      chart.destroy();
      releasePersistenceKey(key);
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const signature = stableSignature(options);
    if (signature === optionsSignatureRef.current) return;
    optionsSignatureRef.current = signature;
    chart.applyOptions(options ?? {});
  }, [options]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const plan = planDataSync(dataRef.current, data);
    dataRef.current = data;
    if (plan.kind === 'set') {
      chart.setData(plan.data);
    } else if (plan.kind === 'upsert') {
      chart.updateData(plan.bars);
    }
  }, [data]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const managed = stackedRef.current;
    const panes = (stackedPricePanes ?? []).map((pane, index) => ({
      id: pane.id ?? `stacked-${index}`,
      pane,
    }));
    const wantedIds = new Set(panes.map(entry => entry.id));

    for (const id of [...managed.keys()]) {
      if (!wantedIds.has(id)) {
        chart.removeStackedPricePane(id);
        managed.delete(id);
      }
    }

    panes.forEach(({ id, pane }) => {
      const signature = stableSignature({ side: pane.side, style: pane.style, options: pane.options });
      const entry = managed.get(id);

      if (entry && entry.signature === signature) {
        if (entry.data !== pane.data) {
          chart.setStackedPaneData(id, pane.data);
          entry.data = pane.data;
        }
        return;
      }

      if (entry) chart.removeStackedPricePane(id);
      const created = chart.addStackedPricePane({
        id,
        data: pane.data,
        side: pane.side,
        style: pane.style ?? 'candle',
        options: pane.options,
      });
      if (created) managed.set(id, { signature, data: pane.data });
      else managed.delete(id);
    });
  }, [stackedPricePanes]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    const wanted = (overlays ?? []).map((overlay, index) => ({
      ...overlay,
      id: overlay.id ?? `${PROP_OVERLAY_PREFIX}${index}`,
    })) as Overlay[];
    const wantedIds = new Set(wanted.map(overlay => overlay.id));
    const previous = overlaysRef.current;

    // Drop overlays this prop used to provide, and any index-named leftovers from a
    // restored state that the prop no longer provides.
    const existing = chart.getOverlays();
    existing.forEach(overlay => {
      const ownedBefore = previous?.ids.has(overlay.id) ?? false;
      const indexNamed = overlay.id.startsWith(PROP_OVERLAY_PREFIX);
      if ((ownedBefore || indexNamed) && !wantedIds.has(overlay.id)) {
        chart.removeOverlay(overlay.id);
      }
    });

    const present = new Set(existing.map(overlay => overlay.id));
    wanted.forEach(overlay => {
      if (present.has(overlay.id)) {
        const { id, ...fields } = overlay;
        chart.updateOverlay(id, fields);
      } else {
        chart.createOverlay(overlay);
      }
    });

    overlaysRef.current = { ids: wantedIds };
  }, [overlays]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    // The data effect runs first in the same commit, so this is the bar set the chart shows.
    const synced = dataRef.current;
    const anchorTimestamp = synced && synced.length > 0 ? synced[synced.length - 1].timestamp : 0;
    syncTradingLines(chart, tradingLines, anchorTimestamp, (id, price) => {
      latest.current.onTradingLineDrag?.(id, price);
    });
  }, [tradingLines]);

  useEffect(() => {
    const chart = chartRef.current;
    if (chart && symbol) {
      chart.applyOptions({ watermark: { text: symbol } });
    }
  }, [symbol]);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ width: '100%', height: '100%', ...style }}
    />
  );
};
