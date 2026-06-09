/**
 * Pure-helper coverage for the rich GM config panel's action/decision module
 * (`interactableConfigActions.js`): the state-flag / clear-visual planners and
 * the interactable view-model summary.
 *
 * A region-first interactable carries NO per-interactable node pool (the
 * environment's `nodeRuntime[taskId]` owns depletion/respawn), so there is no
 * restock plan or node-state summary to cover here.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  planSetEnabled,
  planSetLocked,
  planClearVisualLink,
  summarizeInteractable
} from '../../../src/canvas/regions/interactableConfigActions.js';

/** A normalized-ish behaviour system for a gathering task with a node. */
function taskSystem(overrides = {}) {
  return {
    interactableType: 'gatheringTask',
    sourceUuid: 'fabricate-task.system-a.task-1',
    systemId: 'system-a',
    toolId: null,
    taskId: 'task-1',
    environmentId: 'env-1',
    name: 'Berry bush',
    presentation: { promptText: 'Forage here', hidden: false },
    linkedVisual: { uuid: 'Scene.s.Tile.t', documentName: 'Tile', mode: 'marker', missingPolicy: 'warn' },
    state: {
      enabled: true,
      consumed: false,
      locked: false,
      uses: { max: null, used: 0 },
      cooldown: { seconds: null, lastUsedWorldTime: null }
    },
    activation: { trigger: 'regionEnter', audience: 'players' },
    ...overrides
  };
}

function toolSystem(overrides = {}) {
  return {
    interactableType: 'tool',
    sourceUuid: 'fabricate-tool.system-a.tool-1',
    systemId: 'system-a',
    toolId: 'tool-1',
    taskId: null,
    environmentId: null,
    name: 'Anvil',
    presentation: { promptText: null, hidden: false },
    linkedVisual: { uuid: null, documentName: null, mode: 'marker', missingPolicy: 'warn' },
    state: {
      enabled: true,
      consumed: false,
      locked: false,
      uses: { max: null, used: 0 },
      cooldown: { seconds: null, lastUsedWorldTime: null }
    },
    activation: { trigger: 'regionEnter', audience: 'players' },
    ...overrides
  };
}

describe('planSet* state flag planners', () => {
  it('planSetEnabled returns the minimal patch and no-ops on same value', () => {
    assert.deepEqual(planSetEnabled(toolSystem(), false), { system: { state: { enabled: false } } });
    assert.equal(planSetEnabled(toolSystem(), true), null, 'enabled→true is a no-op (already enabled)');
  });

  it('planSetLocked returns the minimal patch and no-ops on same value', () => {
    assert.deepEqual(planSetLocked(toolSystem(), true), { system: { state: { locked: true } } });
    assert.equal(planSetLocked(toolSystem(), false), null, 'locked→false is a no-op (already unlocked)');
  });
});

describe('planClearVisualLink', () => {
  it('returns the detach patch (uuid/documentName null, mode none)', () => {
    assert.deepEqual(planClearVisualLink(taskSystem()), {
      system: { linkedVisual: { uuid: null, documentName: null, mode: 'none' } }
    });
  });
});

describe('summarizeInteractable', () => {
  it('builds the gathering-task view model with linked-visual status', () => {
    const view = summarizeInteractable(taskSystem(), { resolveVisual: () => ({ doc: {}, documentName: 'Tile' }) });
    assert.equal(view.interactableType, 'gatheringTask');
    assert.equal(view.name, 'Berry bush');
    assert.equal(view.referenceId, 'task-1', 'referenceId is the taskId for a gathering task');
    assert.equal(view.taskId, 'task-1');
    assert.equal(view.environmentId, 'env-1');
    assert.equal(view.linkedVisual.status, 'ok', 'a resolvable marker is ok');
    assert.equal(view.activation.audience, 'players');
    assert.equal(view.state.enabled, true);
  });

  it('marks a configured-but-unresolvable visual as missing', () => {
    const view = summarizeInteractable(taskSystem(), { resolveVisual: () => null });
    assert.equal(view.linkedVisual.status, 'missing');
  });

  it('reports status none when no marker is configured (region-only / no uuid)', () => {
    const view = summarizeInteractable(toolSystem(), { resolveVisual: () => null });
    assert.equal(view.linkedVisual.status, 'none', 'no configured uuid → none, resolver not consulted');
    assert.equal(view.referenceId, 'tool-1', 'referenceId is the toolId for a tool station');
  });

  it('reports status none — NOT missing — for an explicit region-only interactable (mode none)', () => {
    // Region-only = `linkedVisual.mode:'none'`. This is intentional, so the panel
    // must show "region only", never the missing-visual warning — even though the
    // resolver would return null (there is no marker to resolve).
    const regionOnly = toolSystem({
      presentation: { promptText: null, hidden: true },
      linkedVisual: { uuid: null, documentName: null, mode: 'none', missingPolicy: 'warn' }
    });
    const view = summarizeInteractable(regionOnly, { resolveVisual: () => { throw new Error('resolver must NOT be consulted for mode none'); } });
    assert.equal(view.linkedVisual.status, 'none', 'mode none → status none (distinct from missing)');
    assert.equal(view.linkedVisual.mode, 'none');
    assert.equal(view.presentation.hidden, true);
  });

  it('returns null for a non-interactable system', () => {
    assert.equal(summarizeInteractable({ foo: 'bar' }, { resolveVisual: () => null }), null);
  });
});
