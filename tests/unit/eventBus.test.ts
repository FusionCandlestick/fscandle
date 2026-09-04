import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';

import { EventBus } from '../../src/engine/EventBus';

describe('EventBus', () => {
  it('delivers events to subscribers', () => {
    const bus = new EventBus();
    const received: Array<{ from: number; to: number }> = [];
    bus.on('visibleLogicalRangeChange', range => received.push(range));

    bus.emit('visibleLogicalRangeChange', { from: 0, to: 10 });
    assert.deepEqual(received, [{ from: 0, to: 10 }]);
  });

  it('returns an unsubscribe function', () => {
    const bus = new EventBus();
    let calls = 0;
    const unsubscribe = bus.on('sizeChange', () => {
      calls += 1;
    });

    bus.emit('sizeChange', { width: 1, height: 1 });
    unsubscribe();
    bus.emit('sizeChange', { width: 2, height: 2 });
    assert.equal(calls, 1);
  });

  it('supports off()', () => {
    const bus = new EventBus();
    let calls = 0;
    const handler = () => {
      calls += 1;
    };
    bus.on('sizeChange', handler);
    bus.off('sizeChange', handler);
    bus.emit('sizeChange', { width: 1, height: 1 });
    assert.equal(calls, 0);
  });

  it('once() fires exactly once', () => {
    const bus = new EventBus();
    let calls = 0;
    bus.once('sizeChange', () => {
      calls += 1;
    });

    bus.emit('sizeChange', { width: 1, height: 1 });
    bus.emit('sizeChange', { width: 2, height: 2 });
    assert.equal(calls, 1);
  });

  it('tracks whether an event has subscribers', () => {
    const bus = new EventBus();
    assert.equal(bus.hasSubscribers('click'), false);

    const unsubscribe = bus.on('click', () => {});
    assert.equal(bus.hasSubscribers('click'), true);

    unsubscribe();
    assert.equal(bus.hasSubscribers('click'), false);
  });

  it('lets a handler unsubscribe itself mid-dispatch without skipping others', () => {
    const bus = new EventBus();
    const order: string[] = [];

    const unsubscribeFirst = bus.on('sizeChange', () => {
      order.push('first');
      unsubscribeFirst();
    });
    bus.on('sizeChange', () => order.push('second'));

    bus.emit('sizeChange', { width: 1, height: 1 });
    assert.deepEqual(order, ['first', 'second']);

    bus.emit('sizeChange', { width: 2, height: 2 });
    assert.deepEqual(order, ['first', 'second', 'second']);
  });

  it('isolates a throwing handler from the rest', () => {
    const bus = new EventBus();
    const errorMock = mock.method(console, 'error', () => {});

    let reached = false;
    bus.on('sizeChange', () => {
      throw new Error('boom');
    });
    bus.on('sizeChange', () => {
      reached = true;
    });

    assert.doesNotThrow(() => bus.emit('sizeChange', { width: 1, height: 1 }));
    assert.equal(reached, true, 'later handlers must still run');
    assert.equal(errorMock.mock.callCount(), 1);
    errorMock.mock.restore();
  });

  it('clear() removes every subscription', () => {
    const bus = new EventBus();
    let calls = 0;
    bus.on('sizeChange', () => {
      calls += 1;
    });
    bus.clear();
    bus.emit('sizeChange', { width: 1, height: 1 });
    assert.equal(calls, 0);
  });

  it('emitting with no subscribers is a no-op', () => {
    const bus = new EventBus();
    assert.doesNotThrow(() => bus.emit('click', {
      time: null,
      logical: 0,
      point: { x: 0, y: 0 },
      price: null,
      bar: null,
      paneId: 'main',
      overlay: null,
      sourceEvent: null,
    }));
  });
});
