import { KLineData } from '../types';
import { Period, periodToMilliseconds } from '../model/period';
import { TradingSession, isWithinSession } from '../model/session';

export class DataStore {
  private _dataList: KLineData[] = [];
  private _timestampIndex: Map<number, number> = new Map();
  /** Every positive gap between consecutive bars, ascending. See `_applyIntervalStats`. */
  private _sortedIntervals: number[] = [];
  private _medianInterval: number = 3600000;
  private _regularInterval: number = 3600000;
  private _gapThresholdMultiplier: number = 3;
  private _onDataChanged: (() => void)[] = [];
  private _period: Period | null = null;
  private _session: TradingSession | null = null;

  /**
   * Declare the bar interval. When set, it replaces the interval inferred from
   * the data, so a series with missing bars still maps to the correct logical
   * indexes instead of silently compressing the gap.
   */
  public setPeriod(period: Period | null) {
    this._period = period;
    // The bars did not move, so only what the period feeds into is re-derived.
    this._applyIntervalStats();
    this._notify();
  }

  public getPeriod(): Period | null {
    return this._period;
  }

  /**
   * Declare the trading session. Gaps that fall entirely outside session hours
   * are treated as market closures rather than missing data, so overnight and
   * weekend breaks stop being rendered as holes in the time axis.
   */
  public setSession(session: TradingSession | null) {
    this._session = session;
    this._notify();
  }

  public getSession(): TradingSession | null {
    return this._session;
  }

  public setData(data: KLineData[]) {
    // Copy, because the caller keeps their array and may mutate it. Sort only
    // when the copy is not already in order: a feed delivers bars
    // chronologically, so the common case was paying n log n -- about 3.4
    // million comparisons at 200,000 bars -- to confirm what one pass can.
    const next = [...data];
    if (!isAscendingByTimestamp(next)) next.sort((a, b) => a.timestamp - b.timestamp);
    this._dataList = next;
    this._rebuildTimeScale();
    this._notify();
  }

  public getData() {
    return this._dataList;
  }

  public timestampToIndex(timestamp: number): number {
    const exactIndex = this._timestampIndex.get(timestamp);
    if (exactIndex !== undefined) return exactIndex;

    let low = 0;
    let high = this._dataList.length - 1;
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      if (this._dataList[mid].timestamp === timestamp) return mid;
      if (this._dataList[mid].timestamp < timestamp) low = mid + 1;
      else high = mid - 1;
    }
    return low; // Return nearest index
  }

  /**
   * Convert a timestamp into a Lightweight Charts-style logical index.
   * Exact bars return integer indexes; timestamps between known bars return
   * fractional indexes; timestamps outside the data range extrapolate from
   * the nearest edge using the detected median bar interval.
   */
  public timestampToLogicalIndex(timestamp: number): number {
    const dataCount = this._dataList.length;
    if (dataCount === 0) return 0;

    const exactIndex = this._timestampIndex.get(timestamp);
    if (exactIndex !== undefined) return exactIndex;

    const insertionIndex = this.timestampToIndex(timestamp);
    if (insertionIndex <= 0) {
      return (timestamp - this._dataList[0].timestamp) / this._regularInterval;
    }
    if (insertionIndex >= dataCount) {
      const lastIndex = dataCount - 1;
      return lastIndex + (timestamp - this._dataList[lastIndex].timestamp) / this._regularInterval;
    }

    const prev = this._dataList[insertionIndex - 1];
    const next = this._dataList[insertionIndex];
    const interval = Math.max(next.timestamp - prev.timestamp, 1);
    if (this._isTimeGap(interval, prev.timestamp, next.timestamp)) {
      const distanceFromPrev = Math.max(0, timestamp - prev.timestamp) / this._regularInterval;
      const distanceToNext = Math.max(0, next.timestamp - timestamp) / this._regularInterval;
      if (distanceFromPrev <= 1) {
        return insertionIndex - 1 + Math.min(distanceFromPrev, 0.999999);
      }
      if (distanceToNext <= 1) {
        return insertionIndex - Math.min(distanceToNext, 0.999999);
      }
      return distanceFromPrev <= distanceToNext ? insertionIndex - 1 : insertionIndex;
    }

    return insertionIndex - 1 + (timestamp - prev.timestamp) / interval;
  }

  public logicalIndexToTimestamp(logicalIndex: number): number | null {
    const dataCount = this._dataList.length;
    if (dataCount === 0) return null;

    if (logicalIndex <= 0) {
      return this._dataList[0].timestamp + logicalIndex * this._regularInterval;
    }

    const lastIndex = dataCount - 1;
    if (logicalIndex >= lastIndex) {
      return this._dataList[lastIndex].timestamp + (logicalIndex - lastIndex) * this._regularInterval;
    }

    const leftIndex = Math.floor(logicalIndex);
    const rightIndex = Math.ceil(logicalIndex);
    if (leftIndex === rightIndex) return this._dataList[leftIndex].timestamp;

    const left = this._dataList[leftIndex];
    const right = this._dataList[rightIndex];
    return left.timestamp + (right.timestamp - left.timestamp) * (logicalIndex - leftIndex);
  }

  public getDetectedInterval(): number {
    return this._medianInterval;
  }

  public getRegularInterval(): number {
    return this._regularInterval;
  }

  /**
   * Apply one bar, as a live feed delivers them.
   *
   * The two cases this exists for — the last bar ticking, and a new bar
   * appended after it — used to cost a full sort of the dataset plus a full
   * rebuild of the time scale, on every tick: O(n log n) over 200,000 bars to
   * absorb one value. Neither case can reorder anything, so neither needs it.
   *
   * An update in place changes no timestamp at all, so the time scale is
   * already correct. An append adds exactly one index and one interval, both of
   * which extend the existing structures. Only a bar landing *before* the last
   * one — a backfill or a correction, which is the rare case — still falls back
   * to sorting and rebuilding.
   */
  public addData(data: KLineData) {
    const existingIndex = this._timestampIndex.get(data.timestamp);
    if (existingIndex !== undefined) {
      this._dataList[existingIndex] = data;
      this._notify();
      return;
    }

    const lastIndex = this._dataList.length - 1;
    if (lastIndex < 0 || data.timestamp > this._dataList[lastIndex].timestamp) {
      this._dataList.push(data);
      this._appendToTimeScale();
      this._notify();
      return;
    }

    // Out of order: the bar belongs somewhere inside the series.
    this._dataList.push(data);
    this._dataList.sort((a, b) => a.timestamp - b.timestamp);
    this._rebuildTimeScale();
    this._notify();
  }

  /** Extend the time scale by the single bar just pushed onto the end. */
  private _appendToTimeScale() {
    const lastIndex = this._dataList.length - 1;
    this._timestampIndex.set(this._dataList[lastIndex].timestamp, lastIndex);

    if (lastIndex > 0) {
      const interval = this._dataList[lastIndex].timestamp - this._dataList[lastIndex - 1].timestamp;
      if (interval > 0) insertSorted(this._sortedIntervals, interval);
    }
    this._applyIntervalStats();
  }

  public subscribe(cb: () => void) {
    this._onDataChanged.push(cb);
    return () => {
      this._onDataChanged = this._onDataChanged.filter(listener => listener !== cb);
    };
  }

  private _notify() {
    this._onDataChanged.forEach(cb => cb());
  }

  public getVisibleData(fromIndex: number, toIndex: number): KLineData[] {
    return this._dataList.slice(
      Math.max(0, fromIndex),
      Math.min(this._dataList.length, toIndex)
    );
  }

  private _rebuildTimeScale() {
    this._timestampIndex.clear();
    this._dataList.forEach((item, index) => {
      this._timestampIndex.set(item.timestamp, index);
    });

    const intervals: number[] = [];
    for (let i = 1; i < this._dataList.length; i++) {
      const interval = this._dataList[i].timestamp - this._dataList[i - 1].timestamp;
      if (interval > 0) intervals.push(interval);
    }

    // Kept sorted, and kept: the median and the shortest interval are read off
    // it, and an appended bar can then be spliced in rather than re-deriving
    // every interval in the series.
    intervals.sort((a, b) => a - b);
    this._sortedIntervals = intervals;
    this._applyIntervalStats();
  }

  /** Derive the bar intervals from `_sortedIntervals` and the declared period. */
  private _applyIntervalStats() {
    const declaredInterval = this._period ? periodToMilliseconds(this._period) : null;

    if (this._sortedIntervals.length === 0) {
      this._medianInterval = declaredInterval ?? 3600000;
      this._regularInterval = declaredInterval ?? 3600000;
      return;
    }

    this._medianInterval = declaredInterval ?? this._sortedIntervals[Math.floor(this._sortedIntervals.length / 2)];

    if (declaredInterval !== null) {
      this._regularInterval = Math.max(1, declaredInterval);
      return;
    }

    const shortestInterval = this._sortedIntervals[0];
    this._regularInterval = Math.max(1, Math.min(this._medianInterval, shortestInterval));
  }

  /**
   * Whether the span between two bars should be compressed on the time axis
   * rather than spread out proportionally.
   *
   * Without a session this is a pure "much longer than one bar" heuristic.
   * With a session declared, a span containing no trading minutes is a market
   * closure and is always compressed — that is the point of declaring one.
   * Otherwise a weekend or overnight break shorter than the generic threshold
   * would be rendered as real elapsed time and leave a hole in the axis.
   */
  private _isTimeGap(interval: number, fromTimestamp?: number, toTimestamp?: number) {
    if (this._session && fromTimestamp !== undefined && toTimestamp !== undefined) {
      if (!this._spanContainsSessionTime(fromTimestamp, toTimestamp)) return true;
    }

    return interval > this._regularInterval * this._gapThresholdMultiplier;
  }

  /**
   * Sample the span for any minute the market was open. Sampling (rather than
   * scanning every minute) keeps this O(1) for multi-month gaps; the step is
   * capped at the session's shortest meaningful resolution.
   */
  private _spanContainsSessionTime(fromTimestamp: number, toTimestamp: number): boolean {
    const session = this._session;
    if (!session) return true;

    const step = Math.max(60_000, Math.min(this._regularInterval, 900_000));
    const maxSamples = 512;
    const span = toTimestamp - fromTimestamp;
    const sampleStep = Math.max(step, span / maxSamples);

    for (let t = fromTimestamp + sampleStep; t < toTimestamp; t += sampleStep) {
      if (isWithinSession(t, session)) return true;
    }
    return false;
  }
}

/**
 * Place `value` into an ascending array, keeping it ascending.
 *
 * Inserts *after* any equal values rather than before them: a regular feed
 * produces the same interval every bar, so the position past the run of equals
 * is the end of the array, and the splice moves nothing. Anchoring on the first
 * equal value instead would memmove the whole array on every tick.
 */
function insertSorted(sorted: number[], value: number): void {
  let low = 0;
  let high = sorted.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (sorted[mid] <= value) low = mid + 1;
    else high = mid;
  }
  sorted.splice(low, 0, value);
}

/** Whether bars are already in chronological order, in one pass. */
function isAscendingByTimestamp(data: KLineData[]): boolean {
  for (let i = 1; i < data.length; i += 1) {
    if (data[i - 1].timestamp > data[i].timestamp) return false;
  }
  return true;
}
