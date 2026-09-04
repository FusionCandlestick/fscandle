import { FusionCandlestickChart } from '../FusionCandlestickChart';
import { MarketDataFeed, MarketDataRequest, MarketDataStatus } from './types';

export interface BindMarketDataOptions extends MarketDataRequest {
  feed: MarketDataFeed;
  chart: FusionCandlestickChart;
  onStatusChange?: (status: MarketDataStatus) => void;
  onError?: (error: Error) => void;
}

export async function bindMarketDataFeed(options: BindMarketDataOptions): Promise<() => void> {
  const { chart, feed, onStatusChange, onError, ...request } = options;
  onStatusChange?.('loading');

  try {
    const history = await feed.getHistory(request);
    chart.setData(history);
  } catch (error) {
    onStatusChange?.('error');
    onError?.(error instanceof Error ? error : new Error(String(error)));
    return () => undefined;
  }

  if (!feed.subscribe) {
    onStatusChange?.('closed');
    return () => undefined;
  }

  return feed.subscribe({
    ...request,
    onUpdate: bar => chart.updateData(bar),
    onStatusChange,
    onError,
  });
}

