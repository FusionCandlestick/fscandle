import { KLineData } from '../types';
import { RawKLineInput } from './types';

function toTimestamp(value: string | number | Date | undefined): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value < 10_000_000_000 ? value * 1000 : value;
  if (typeof value === 'string') {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric < 10_000_000_000 ? numeric * 1000 : numeric;
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  throw new Error(`Invalid K-line timestamp: ${String(value)}`);
}

function toFiniteNumber(value: string | number | null | undefined, field: string): number {
  const numberValue = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numberValue)) {
    throw new Error(`Invalid K-line ${field}: ${String(value)}`);
  }
  return numberValue;
}

export function normalizeKLineData(input: RawKLineInput): KLineData {
  if (Array.isArray(input)) {
    return {
      timestamp: toTimestamp(input[0]),
      open: toFiniteNumber(input[1], 'open'),
      high: toFiniteNumber(input[2], 'high'),
      low: toFiniteNumber(input[3], 'low'),
      close: toFiniteNumber(input[4], 'close'),
      volume: input[5] === undefined ? undefined : toFiniteNumber(input[5], 'volume'),
    };
  }

  const record = input as Record<string, unknown>;
  return {
    timestamp: toTimestamp((record.timestamp ?? record.time) as string | number | Date | undefined),
    open: toFiniteNumber(record.open as string | number, 'open'),
    high: toFiniteNumber(record.high as string | number, 'high'),
    low: toFiniteNumber(record.low as string | number, 'low'),
    close: toFiniteNumber(record.close as string | number, 'close'),
    volume: record.volume === undefined ? undefined : toFiniteNumber(record.volume as string | number, 'volume'),
    turnover: record.turnover === undefined ? undefined : toFiniteNumber(record.turnover as string | number, 'turnover'),
  };
}

export function normalizeKLineDataList(input: RawKLineInput[]): KLineData[] {
  return input
    .map(normalizeKLineData)
    .sort((a, b) => a.timestamp - b.timestamp);
}
