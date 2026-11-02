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

describe('createWebSocketDataFeed reconnects', () => {
  let saved: unknown;
  let savedSetTimeout: unknown;
  let savedClearTimeout: unknown;
  beforeEach(() => {
    saved = globals.WebSocket;
    savedSetTimeout = globals.setTimeout;
    savedClearTimeout = globals.clearTimeout;
  });
  afterEach(() => {
    globals.WebSocket = saved;
    globals.setTimeout = savedSetTimeout;
    globals.clearTimeout = savedClearTimeout;
  });

  /** Timeouts that fire only when a test advances the clock. */
  function fakeClock() {
    const pending = new Map<number, { fn: () => void; due: number }>();
    let now = 0;
    let next = 1;
    globals.setTimeout = (fn: () => void, ms: number) => { pending.set(next, { fn, due: now + ms }); return next++; };
    globals.clearTimeout = (id: number) => { pending.delete(id); };
    return {
      advance(ms: number) {
        now += ms;
        for (const [id, timer] of [...pending]) {
          if (timer.due <= now && pending.delete(id)) timer.fn();
        }
      },
      pending: () => pending.size,
    };
  }

  /** A socket class that records every instance and lets the test fire events. */
  function sockets() {
    const list: Array<{ fire: (type: string, event?: unknown) => void; closed: boolean }> = [];
    globals.WebSocket = class {
      private listeners = new Map<string, Array<(event: unknown) => void>>();
      public closed = false;
      constructor() { list.push(this as never); }
      addEventListener(type: string, fn: (event: unknown) => void) {
        this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
      }
      send() {}
      close() { this.closed = true; }
      fire(type: string, event?: unknown) { (this.listeners.get(type) ?? []).forEach(fn => fn(event)); }
    };
    return list;
  }

  const feed = (reconnect?: Parameters<typeof createWebSocketDataFeed>[0]['reconnect']) => createWebSocketDataFeed({
    url: 'wss://example.test',
    parseMessage: payload => payload as never,
    reconnect,
  });

  it('reconnects after an unexpected close, reports reconnecting, and streams again', () => {
    const clock = fakeClock();
    const list = sockets();
    const { updates, statuses, subscription } = recorder();
    feed({ initialDelayMs: 1000 }).subscribe!(subscription);

    list[0].fire('open');
    list[0].fire('close');
    assert.equal(list.length, 1, 'nothing reconnects before the delay');
    clock.advance(999);
    assert.equal(list.length, 1);
    clock.advance(1);
    assert.equal(list.length, 2);

    list[1].fire('open');
    list[1].fire('message', { data: JSON.stringify(row(1_700_000_000)) });
    assert.deepEqual(updates, [1_700_000_000_000]);
    assert.deepEqual(statuses, ['streaming', 'reconnecting', 'streaming']);
  });

  it('doubles the delay between attempts up to the cap, and resets after a successful open', () => {
    const clock = fakeClock();
    const list = sockets();
    const { statuses, subscription } = recorder();
    feed({ initialDelayMs: 1000, maxDelayMs: 3000 }).subscribe!(subscription);

    const delays: number[] = [];
    list[0].fire('close');
    for (let attempt = 0; attempt < 4; attempt++) {
      const before = list.length;
      let waited = 0;
      while (list.length === before) { clock.advance(100); waited += 100; }
      delays.push(waited);
      list.at(-1)!.fire('close');
    }
    assert.deepEqual(delays, [1000, 2000, 3000, 3000]);

    // The last retry is still pending. Let it open, then a successful open resets the backoff.
    let waited = 0;
    while (list.length === 5) { clock.advance(100); waited += 100; }
    list.at(-1)!.fire('open');
    list.at(-1)!.fire('close');
    waited = 0;
    while (list.length === 6) { clock.advance(100); waited += 100; }
    assert.equal(waited, 1000, 'the next delay starts from the initial value');
    assert.equal(statuses.filter(status => status === 'reconnecting').length, 6);
  });

  it('cancels a pending retry when the caller unsubscribes', () => {
    const clock = fakeClock();
    const list = sockets();
    const { statuses, subscription } = recorder();
    const dispose = feed().subscribe!(subscription);

    list[0].fire('close');
    dispose();
    clock.advance(60_000);
    assert.equal(list.length, 1, 'no socket is opened after unsubscribe');
    assert.equal(clock.pending(), 0);
    assert.deepEqual(statuses, ['reconnecting', 'closed']);
  });

  it('reports closed without retrying when reconnect is disabled', () => {
    const clock = fakeClock();
    const list = sockets();
    const { statuses, subscription } = recorder();
    feed(false).subscribe!(subscription);

    list[0].fire('close');
    clock.advance(60_000);
    assert.equal(list.length, 1);
    assert.deepEqual(statuses, ['closed']);
  });

  it('gives up after maxAttempts and reports why', () => {
    const clock = fakeClock();
    const list = sockets();
    const errors: string[] = [];
    const { statuses, subscription } = recorder();
    feed({ initialDelayMs: 10, maxAttempts: 2 }).subscribe!({
      ...subscription,
      onError: error => errors.push(error.message),
    });

    list[0].fire('close');
    clock.advance(10);
    list[1].fire('close');
    clock.advance(20);
    list[2].fire('close');
    clock.advance(60_000);

    assert.equal(list.length, 3, 'two retries, then no more sockets');
    assert.deepEqual(statuses, ['reconnecting', 'reconnecting', 'closed']);
    assert.match(errors[0], /gave up after 2 reconnect attempts/);
  });

  it('destroy stops every subscription without reconnecting or reporting', () => {
    const clock = fakeClock();
    const list = sockets();
    const first = recorder();
    const second = recorder();
    const f = feed();
    f.subscribe!(first.subscription);
    f.subscribe!(second.subscription);

    list[0].fire('close');
    f.destroy!();
    clock.advance(60_000);
    assert.equal(list.length, 2, 'the retry of the first subscription is cancelled');
    assert.equal(list[1].closed, true);
    assert.deepEqual(first.statuses, ['reconnecting']);
    assert.deepEqual(second.statuses, []);
  });
});
