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
  planConfigureSource,
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

describe('planConfigureSource (issue 342 — never writes a partial identity)', () => {
  it('builds the correct patch for a tool selection', () => {
    const patch = planConfigureSource(null, {
      interactableType: 'tool',
      systemId: 'system-a',
      toolId: 'tool-1'
    });
    assert.deepEqual(patch, {
      system: {
        interactableType: 'tool',
        systemId: 'system-a',
        sourceUuid: 'Fabricate.system-a.tool.tool-1',
        toolId: 'tool-1',
        // Off-type id cleared.
        taskId: null,
        environmentId: null
      }
    });
  });

  it('builds the correct patch for a gatheringTask selection (with environment)', () => {
    const patch = planConfigureSource(null, {
      interactableType: 'gatheringTask',
      systemId: 'system-a',
      taskId: 'task-1',
      environmentId: 'env-1'
    });
    assert.deepEqual(patch, {
      system: {
        interactableType: 'gatheringTask',
        systemId: 'system-a',
        sourceUuid: 'Fabricate.system-a.gatheringTask.task-1',
        taskId: 'task-1',
        environmentId: 'env-1',
        // Off-type id cleared.
        toolId: null
      }
    });
  });

  it('clears the off-type id when RE-TARGETING a configured interactable', () => {
    // Re-target a configured tool → gatheringTask: the resulting patch must carry
    // toolId:null so the stale tool id never lingers.
    const current = toolSystem();
    const patch = planConfigureSource(current, {
      interactableType: 'gatheringTask',
      systemId: 'system-b',
      taskId: 'task-9'
    });
    assert.equal(patch.system.interactableType, 'gatheringTask');
    assert.equal(patch.system.toolId, null);
    assert.equal(patch.system.taskId, 'task-9');
    assert.equal(patch.system.environmentId, null);
    assert.equal(patch.system.sourceUuid, 'Fabricate.system-b.gatheringTask.task-9');
  });

  it('no-ops (returns null) on an INCOMPLETE selection — never a partial write', () => {
    // Missing reference id.
    assert.equal(planConfigureSource(null, { interactableType: 'tool', systemId: 'system-a' }), null);
    assert.equal(planConfigureSource(null, { interactableType: 'gatheringTask', systemId: 'system-a' }), null);
    // Missing system id.
    assert.equal(planConfigureSource(null, { interactableType: 'tool', toolId: 'tool-1' }), null);
    // Blank/whitespace values.
    assert.equal(planConfigureSource(null, { interactableType: 'tool', systemId: '  ', toolId: 'tool-1' }), null);
    assert.equal(planConfigureSource(null, { interactableType: 'tool', systemId: 'system-a', toolId: '   ' }), null);
    // Unknown / missing type.
    assert.equal(planConfigureSource(null, { interactableType: 'mystery', systemId: 'system-a', toolId: 'tool-1' }), null);
    assert.equal(planConfigureSource(null, {}), null);
  });

  it('treats a blank environment as no environment for a gatheringTask', () => {
    const patch = planConfigureSource(null, {
      interactableType: 'gatheringTask',
      systemId: 'system-a',
      taskId: 'task-1',
      environmentId: '   '
    });
    assert.equal(patch.system.environmentId, null);
  });
});
