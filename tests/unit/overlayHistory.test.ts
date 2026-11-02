import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { OverlayHistory } from '../../src/engine/OverlayHistory';
import type { Overlay } from '../../src/engine/OverlayManager';

function overlay(id: string, extra: Partial<Overlay> = {}): Overlay {
  return {
    id,
    type: 'line',
    points: [{ timestamp: 0, value: 100 }, { timestamp: 60_000, value: 101 }],
    color: '#fff',
    lineWidth: 1,
    ...extra,
  };
}

describe('OverlayHistory', () => {
  it('keeps callbacks across undo, which JSON snapshots used to drop', () => {
    const onPressedMoving = () => {};
    const history = new OverlayHistory();
    const before = [overlay('line', { onPressedMoving })];
    history.record(before);

    const restored = history.undo([...before, overlay('later')]);
    assert.deepEqual(restored?.map(item => item.id), ['line']);
    assert.equal(restored?.[0].onPressedMoving, onPressedMoving);
  });

  it('restores the callbacks of an overlay that undo brings back', () => {
    const onClick = () => {};
    const history = new OverlayHistory();
    history.record([overlay('deleted', { onClick })]);

    const restored = history.undo([]);
    assert.equal(restored?.[0].onClick, onClick);
  });

  it('prefers the live callback over the one in the snapshot', () => {
    const old = () => {};
    const latest = () => {};
    const history = new OverlayHistory();
    history.record([overlay('line', { onClick: old })]);

    const restored = history.undo([overlay('line', { onClick: latest, color: '#000' })]);
    assert.equal(restored?.[0].onClick, latest);
    assert.equal(restored?.[0].color, '#fff', 'the data still comes from the snapshot');
  });

  it('is not affected by edits made after the snapshot', () => {
    const history = new OverlayHistory();
    const live = overlay('line');
    history.record([live]);
    live.points[0].value = 999;

    assert.equal(history.undo([live])?.[0].points[0].value, 100);
  });

  it('redoes what was undone, callbacks included', () => {
    const onClick = () => {};
    const history = new OverlayHistory();
    history.record([]);
    const afterEdit = [overlay('added', { onClick })];

    assert.deepEqual(history.undo(afterEdit), []);
    const redone = history.redo([]);
    assert.deepEqual(redone?.map(item => item.id), ['added']);
    assert.equal(redone?.[0].onClick, onClick);
  });

  it('clears redo on a new edit, and returns null when there is nothing to move to', () => {
    const history = new OverlayHistory();
    assert.equal(history.undo([]), null);
    history.record([]);
    history.undo([overlay('a')]);
    history.record([]);
    assert.equal(history.canRedo, false);
    assert.equal(history.redo([]), null);
  });

  it('keeps at most the configured number of steps', () => {
    const history = new OverlayHistory(2);
    history.record([overlay('1')]);
    history.record([overlay('2')]);
    history.record([overlay('3')]);
    assert.deepEqual(history.undo([])?.map(item => item.id), ['3']);
    assert.deepEqual(history.undo([])?.map(item => item.id), ['2']);
    assert.equal(history.undo([]), null);
  });

  it('forgets everything on clear', () => {
    const history = new OverlayHistory();
    history.record([overlay('a')]);
    history.clear();
    assert.equal(history.canUndo, false);
  });
});
