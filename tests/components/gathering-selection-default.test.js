import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  resolveDefaultSelection,
  resolveDefaultTaskSelection,
  visibleTasksFor
} from '../../src/ui/svelte/apps/gathering/selectionDefault.js';

function env(overrides = {}) {
  return { id: 'env-a', locked: false, ...overrides };
}

function task(overrides = {}) {
  return { id: 'task-a', attemptable: true, ...overrides };
}

describe('resolveDefaultSelection', () => {
  it('preserves a still-valid non-locked selection on re-fetch (does not reset to first)', () => {
    const list = [
      env({ id: 'env-a' }),
      env({ id: 'env-b' })
    ];
    // selectedId points at the SECOND (non-locked) env; it must survive, not
    // get clobbered back to the first.
    assert.equal(resolveDefaultSelection(list, 'env-b'), 'env-b');
  });

  it('defaults to the first non-locked env when selection is null', () => {
    const list = [env({ id: 'env-a' }), env({ id: 'env-b' })];
    assert.equal(resolveDefaultSelection(list, null), 'env-a');
  });

  it('skips a leading locked env and selects the first non-locked one', () => {
    const list = [
      env({ id: 'env-locked', locked: true }),
      env({ id: 'env-open' })
    ];
    assert.equal(resolveDefaultSelection(list, null), 'env-open');
  });

  it('returns null when every env is locked', () => {
    const list = [
      env({ id: 'env-1', locked: true }),
      env({ id: 'env-2', locked: true })
    ];
    assert.equal(resolveDefaultSelection(list, null), null);
  });

  it('returns null for an empty list', () => {
    assert.equal(resolveDefaultSelection([], 'env-a'), null);
  });

  it('returns null for a non-array environments value', () => {
    assert.equal(resolveDefaultSelection(null, 'env-a'), null);
    assert.equal(resolveDefaultSelection(undefined, null), null);
  });

  it('falls through to the first non-locked env when selectedId points at a now-locked env', () => {
    const list = [
      env({ id: 'env-open' }),
      env({ id: 'env-was-open', locked: true })
    ];
    // The user had selected env-was-open; it is now locked, so the selection is
    // replaced with the first selectable env.
    assert.equal(resolveDefaultSelection(list, 'env-was-open'), 'env-open');
  });

  it('falls through to the first non-locked env when selectedId is absent from the list', () => {
    const list = [env({ id: 'env-open' }), env({ id: 'env-other' })];
    assert.equal(resolveDefaultSelection(list, 'env-gone'), 'env-open');
  });

  it('returns null when selectedId is absent and all remaining envs are locked', () => {
    const list = [
      env({ id: 'env-1', locked: true }),
      env({ id: 'env-2', locked: true })
    ];
    assert.equal(resolveDefaultSelection(list, 'env-gone'), null);
  });
});

describe('visibleTasksFor', () => {
  it('returns the full task list for a targeted environment', () => {
    const environment = { selectionMode: 'targeted', tasks: [task({ id: 't1' })], discoveredTasks: [task({ id: 'd1' })] };
    assert.deepEqual(visibleTasksFor(environment).map(t => t.id), ['t1']);
  });

  it('returns discovered tasks for a blind environment', () => {
    const environment = { selectionMode: 'blind', tasks: [task({ id: 't1' })], discoveredTasks: [task({ id: 'd1' })] };
    assert.deepEqual(visibleTasksFor(environment).map(t => t.id), ['d1']);
  });

  it('returns an empty array for null or missing lists', () => {
    assert.deepEqual(visibleTasksFor(null), []);
    assert.deepEqual(visibleTasksFor({ selectionMode: 'targeted' }), []);
    assert.deepEqual(visibleTasksFor({ selectionMode: 'blind' }), []);
  });
});

describe('resolveDefaultTaskSelection', () => {
  it('defaults to the first attemptable task when selection is null', () => {
    const list = [task({ id: 't1' }), task({ id: 't2' })];
    assert.equal(resolveDefaultTaskSelection(list, null), 't1');
  });

  it('skips leading blocked tasks and selects the first attemptable one', () => {
    const list = [task({ id: 't1', attemptable: false }), task({ id: 't2', attemptable: true })];
    assert.equal(resolveDefaultTaskSelection(list, null), 't2');
  });

  it('returns null when no task is attemptable', () => {
    const list = [task({ id: 't1', attemptable: false }), task({ id: 't2', attemptable: false })];
    assert.equal(resolveDefaultTaskSelection(list, null), null);
  });

  it('returns null for an empty or non-array list', () => {
    assert.equal(resolveDefaultTaskSelection([], 't1'), null);
    assert.equal(resolveDefaultTaskSelection(null, 't1'), null);
  });

  it('preserves a still-present selection even when it is blocked (manual pick survives a refresh)', () => {
    const list = [task({ id: 't1', attemptable: true }), task({ id: 't2', attemptable: false })];
    assert.equal(resolveDefaultTaskSelection(list, 't2'), 't2');
  });

  it('falls through to the first attemptable task when the prior selection is gone', () => {
    const list = [task({ id: 't1', attemptable: false }), task({ id: 't2', attemptable: true })];
    assert.equal(resolveDefaultTaskSelection(list, 'gone'), 't2');
  });
});
