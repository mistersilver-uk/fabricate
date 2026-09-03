import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { resolveScopedGatheringSelection } from '../../src/ui/svelte/apps/gathering/scopedSelection.js';
import { resolveDefaultSelection } from '../../src/ui/svelte/apps/gathering/selectionDefault.js';

function env(overrides = {}) {
  return { id: 'env-a', locked: false, ...overrides };
}

// Resolve against the real default resolver so the no-scope / scope-absent
// fallback exercises the exact production decision the component threads in.
function resolve(args) {
  return resolveScopedGatheringSelection({ defaultResolver: resolveDefaultSelection, ...args });
}

describe('resolveScopedGatheringSelection', () => {
  it('no scope -> defaults via the threaded resolver, no tab switch, scope key untouched', () => {
    const environments = [env({ id: 'env-a' }), env({ id: 'env-b' })];
    const decision = resolve({
      environments,
      scopedEnvironmentId: null,
      scopedTaskId: null,
      appliedScopeKey: null,
      currentSelectedId: 'env-b',
      currentTaskId: 'task-7'
    });
    // Preserves the still-valid current selection (default resolver behaviour),
    // keeps the current task preference, no forced tab, no scope recorded.
    assert.equal(decision.selectedEnvironmentId, 'env-b');
    assert.equal(decision.taskPreferenceId, 'task-7');
    assert.equal(decision.switchToTasksTab, false);
    assert.equal(decision.appliedScopeKey, null);
  });

  it('half-set scope (env only / task only) is treated as no scope', () => {
    const environments = [env({ id: 'env-a' })];
    const envOnly = resolve({
      environments,
      scopedEnvironmentId: 'env-a',
      scopedTaskId: null,
      appliedScopeKey: null,
      currentSelectedId: null,
      currentTaskId: null
    });
    assert.equal(envOnly.switchToTasksTab, false);
    assert.equal(envOnly.appliedScopeKey, null);
    assert.equal(envOnly.selectedEnvironmentId, 'env-a'); // default resolver picked it

    const taskOnly = resolve({
      environments,
      scopedEnvironmentId: null,
      scopedTaskId: 'task-1',
      appliedScopeKey: null,
      currentSelectedId: null,
      currentTaskId: null
    });
    assert.equal(taskOnly.switchToTasksTab, false);
    assert.equal(taskOnly.appliedScopeKey, null);
  });

  it('first scope applies: forces scoped env, prefers scoped task, switches tab, records scope key', () => {
    const environments = [env({ id: 'env-a' }), env({ id: 'env-scoped' })];
    const decision = resolve({
      environments,
      scopedEnvironmentId: 'env-scoped',
      scopedTaskId: 'task-scoped',
      appliedScopeKey: null,
      // The default resolver would have preserved env-a; the scope overrides it.
      currentSelectedId: 'env-a',
      currentTaskId: 'task-old'
    });
    assert.equal(decision.selectedEnvironmentId, 'env-scoped');
    assert.equal(decision.taskPreferenceId, 'task-scoped');
    assert.equal(decision.switchToTasksTab, true);
    assert.equal(decision.appliedScopeKey, 'env-scoped|task-scoped');
  });

  it('same scope re-load does NOT re-force: respects a manual currentSelectedId and current task', () => {
    const environments = [env({ id: 'env-scoped' }), env({ id: 'env-manual' })];
    const scopeKey = 'env-scoped|task-scoped';
    const decision = resolve({
      environments,
      scopedEnvironmentId: 'env-scoped',
      scopedTaskId: 'task-scoped',
      // Scope was already applied this session...
      appliedScopeKey: scopeKey,
      // ...and the player has since navigated to a different env + task.
      currentSelectedId: 'env-manual',
      currentTaskId: 'task-manual'
    });
    // The quiet re-load must NOT clobber the manual pick back to the scoped env.
    assert.equal(decision.selectedEnvironmentId, 'env-manual');
    assert.equal(decision.taskPreferenceId, 'task-manual');
    assert.equal(decision.switchToTasksTab, false);
    assert.equal(decision.appliedScopeKey, scopeKey);
  });

  it('a DIFFERENT scope re-applies even when a prior scope was already applied', () => {
    const environments = [env({ id: 'env-old' }), env({ id: 'env-new' })];
    const decision = resolve({
      environments,
      scopedEnvironmentId: 'env-new',
      scopedTaskId: 'task-new',
      // A previous interactable scope is recorded; the window re-opened against a
      // new env+task, so the new scope must win.
      appliedScopeKey: 'env-old|task-old',
      currentSelectedId: 'env-old',
      currentTaskId: 'task-old'
    });
    assert.equal(decision.selectedEnvironmentId, 'env-new');
    assert.equal(decision.taskPreferenceId, 'task-new');
    assert.equal(decision.switchToTasksTab, true);
    assert.equal(decision.appliedScopeKey, 'env-new|task-new');
  });

  it('scoped env LOCKED -> still force-selected (activation already validated it)', () => {
    const environments = [
      env({ id: 'env-a' }),
      env({ id: 'env-scoped', locked: true })
    ];
    const decision = resolve({
      environments,
      scopedEnvironmentId: 'env-scoped',
      scopedTaskId: 'task-scoped',
      appliedScopeKey: null,
      currentSelectedId: null,
      currentTaskId: null
    });
    // The default resolver's non-locked filter would skip env-scoped; the scope
    // overrides that and selects the locked env regardless.
    assert.equal(decision.selectedEnvironmentId, 'env-scoped');
    assert.equal(decision.taskPreferenceId, 'task-scoped');
    assert.equal(decision.switchToTasksTab, true);
    assert.equal(decision.appliedScopeKey, 'env-scoped|task-scoped');
  });

  it('scoped env ABSENT from listing -> falls back to default selection, scope key untouched', () => {
    const environments = [env({ id: 'env-a' }), env({ id: 'env-b' })];
    const decision = resolve({
      environments,
      scopedEnvironmentId: 'env-gone',
      scopedTaskId: 'task-scoped',
      appliedScopeKey: null,
      currentSelectedId: null,
      currentTaskId: 'task-cur'
    });
    // No matching env: default to the first non-locked env, keep current task,
    // no tab switch, and leave appliedScopeKey null so the scope can still apply
    // once the env appears in a later listing.
    assert.equal(decision.selectedEnvironmentId, 'env-a');
    assert.equal(decision.taskPreferenceId, 'task-cur');
    assert.equal(decision.switchToTasksTab, false);
    assert.equal(decision.appliedScopeKey, null);
  });

  it('absent scope that later appears applies on the next listing', () => {
    // First load: env not yet present -> fallback, scope not recorded.
    const first = resolve({
      environments: [env({ id: 'env-other' })],
      scopedEnvironmentId: 'env-scoped',
      scopedTaskId: 'task-scoped',
      appliedScopeKey: null,
      currentSelectedId: null,
      currentTaskId: null
    });
    assert.equal(first.appliedScopeKey, null);
    assert.equal(first.switchToTasksTab, false);

    // Second load (quiet re-fetch): env now present, scope still unapplied -> apply.
    const second = resolve({
      environments: [env({ id: 'env-other' }), env({ id: 'env-scoped' })],
      scopedEnvironmentId: 'env-scoped',
      scopedTaskId: 'task-scoped',
      appliedScopeKey: first.appliedScopeKey,
      currentSelectedId: first.selectedEnvironmentId,
      currentTaskId: null
    });
    assert.equal(second.selectedEnvironmentId, 'env-scoped');
    assert.equal(second.switchToTasksTab, true);
    assert.equal(second.appliedScopeKey, 'env-scoped|task-scoped');
  });

  it('scoped TASK absent from the env: env is selected, task preference left to the default resolver', () => {
    // resolveScopedGatheringSelection only decides the env/tab and surfaces the
    // scoped task as the PREFERENCE; the component feeds it to the task resolver,
    // which falls back to the first attemptable task when the preference is gone.
    const environments = [env({ id: 'env-scoped' })];
    const decision = resolve({
      environments,
      scopedEnvironmentId: 'env-scoped',
      scopedTaskId: 'task-not-in-env',
      appliedScopeKey: null,
      currentSelectedId: null,
      currentTaskId: null
    });
    assert.equal(decision.selectedEnvironmentId, 'env-scoped');
    // The preference is still the scoped task id; the env's visible-task list is
    // not the helper's concern, so a downstream resolveDefaultTaskSelection with a
    // task list lacking this id will fall back to the first attemptable task.
    assert.equal(decision.taskPreferenceId, 'task-not-in-env');
    assert.equal(decision.switchToTasksTab, true);
    assert.equal(decision.appliedScopeKey, 'env-scoped|task-not-in-env');
  });

  it('non-array environments -> safe default fallback (null env)', () => {
    const decision = resolve({
      environments: null,
      scopedEnvironmentId: 'env-scoped',
      scopedTaskId: 'task-scoped',
      appliedScopeKey: null,
      currentSelectedId: 'whatever',
      currentTaskId: null
    });
    assert.equal(decision.selectedEnvironmentId, null);
    assert.equal(decision.switchToTasksTab, false);
    assert.equal(decision.appliedScopeKey, null);
  });
});
