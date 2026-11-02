import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';

import { createPollingDataFeed, createWebSocketDataFeed } from '../../src/datafeed/adapters';
import type { MarketDataSubscription } from '../../src/datafeed/types';

const globals = globalThis as unknown as Record<string, unknown>;

/** Timers that only fire when a test says so. */
function manualTimers() {
  const callbacks = new Map<number, () => void>();
  let next = 1;
  globals.window = {
    setInterval: (fn: () => void) => { callbacks.set(next, fn); return next++; },
    clearInterval: (id: number) => { callbacks.delete(id); },
  };
  return { tick: () => [...callbacks.values()].forEach(fn => fn()), active: () => callbacks.size };
}

/** A fetch whose responses resolve only when a test releases them. */
function deferredFetch() {
  const pending: Array<(rows: unknown[]) => void> = [];
  globals.fetch = () => new Promise(resolve => {
    pending.push(rows => resolve({ ok: true, json: async () => rows }));
  });
  return { pending };
}

const flush = () => new Promise(resolve => setImmediate(resolve));
const row = (seconds: number) => [seconds, 1, 2, 0.5, 1.5, 10];

function recorder() {
  const updates: number[] = [];
  const statuses: string[] = [];
  const subscription: MarketDataSubscription = {
    symbol: 'TEST',
    interval: '1m',
    onUpdate: bar => updates.push(bar.timestamp),
    onStatusChange: status => statuses.push(status),
  } as MarketDataSubscription;
  return { updates, statuses, subscription };
}

describe('createPollingDataFeed', () => {
  let saved: Record<string, unknown>;
  beforeEach(() => { saved = { window: globals.window, fetch: globals.fetch }; });
  afterEach(() => { globals.window = saved.window; globals.fetch = saved.fetch; });

  it('delivers bars and reports streaming', async () => {
    manualTimers();
    const { pending } = deferredFetch();
    const { updates, statuses, subscription } = recorder();
    createPollingDataFeed({ endpoint: 'https://example.test' }).subscribe!(subscription);
    pending[0]([row(1_700_000_000)]);
    await flush();
    assert.deepEqual(updates, [1_700_000_000_000]);
    assert.deepEqual(statuses, ['loading', 'streaming']);
  });

  it('drops a response that arrives after unsubscribe', async () => {
    manualTimers();
    const { pending } = deferredFetch();
    const { updates, statuses, subscription } = recorder();
    const dispose = createPollingDataFeed({ endpoint: 'https://example.test' }).subscribe!(subscription);
    dispose();
    pending[0]([row(1_700_000_000)]);
    await flush();
    assert.deepEqual(updates, [], 'no bars after the caller let go');
    assert.deepEqual(statuses, ['loading', 'closed'], 'closed is the last status');
  });

  it('does not start a poll while one is still in flight', async () => {
    const timers = manualTimers();
    const { pending } = deferredFetch();
    const { subscription } = recorder();
    createPollingDataFeed({ endpoint: 'https://example.test' }).subscribe!(subscription);
    timers.tick();
    timers.tick();
    assert.equal(pending.length, 1, 'the slow first request is not overtaken');

    pending[0]([]);
    await flush();
    timers.tick();
    assert.equal(pending.length, 2, 'the next poll runs once the first has finished');
  });

  it('stops every subscription on destroy, including one in flight', async () => {
    const timers = manualTimers();
    const { pending } = deferredFetch();
    const { updates, subscription } = recorder();
    const feed = createPollingDataFeed({ endpoint: 'https://example.test' });
    feed.subscribe!(subscription);
    feed.destroy!();
    assert.equal(timers.active(), 0);
    pending[0]([row(1_700_000_000)]);
    await flush();
    assert.deepEqual(updates, []);
  });
});

describe('createWebSocketDataFeed', () => {
  let saved: unknown;
  beforeEach(() => { saved = globals.WebSocket; });
  afterEach(() => { globals.WebSocket = saved; });

  /** A socket whose events the test fires by hand. */
  function fakeSocketClass() {
    const sockets: Array<{ fire: (type: string, event?: unknown) => void; closed: boolean }> = [];
    globals.WebSocket = class {
      private listeners = new Map<string, Array<(event: unknown) => void>>();
      public closed = false;
      constructor() { sockets.push(this as never); }
      addEventListener(type: string, fn: (event: unknown) => void) {
        this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
      }
      send() {}
      close() { this.closed = true; }
      fire(type: string, event?: unknown) { (this.listeners.get(type) ?? []).forEach(fn => fn(event)); }
    };
    return sockets;
  }

  it('ignores messages and the close event that arrive after unsubscribe', () => {
    const sockets = fakeSocketClass();
    const { updates, statuses, subscription } = recorder();
    const dispose = createWebSocketDataFeed({
      url: 'wss://example.test',
      parseMessage: payload => payload as never,
    }).subscribe!(subscription);

    sockets[0].fire('message', { data: JSON.stringify(row(1_700_000_000)) });
    dispose();
    sockets[0].fire('message', { data: JSON.stringify(row(1_700_000_060)) });
    sockets[0].fire('close');

    assert.deepEqual(updates, [1_700_000_000_000]);
    assert.equal(sockets[0].closed, true);
    assert.deepEqual(statuses, ['closed'], 'closed is reported once');
  });
});
