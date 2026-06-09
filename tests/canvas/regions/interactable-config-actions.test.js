/**
 * Pure-helper coverage for the rich GM config panel's action/decision module
 * (`interactableConfigActions.js`): the Restock / state-flag / clear-visual
 * planners, the node-state + interactable view-model summaries, and the
 * GM Test-as-Player activation context.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  planRestock,
  planSetEnabled,
  planSetLocked,
  planClearVisualLink,
  summarizeNodeState,
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
    node: { enabled: true, max: 5, current: 2, respawn: { policy: 'manual' } },
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
    node: null,
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

describe('planRestock', () => {
  it('fills the node up to max when below max', () => {
    const patch = planRestock(taskSystem({ node: { enabled: true, max: 5, current: 1 } }));
    assert.ok(patch, 'returns a patch');
    assert.equal(patch.system.node.current, 5, 'current restored to max');
    assert.equal(patch.system.node.max, 5);
  });

  it('is a no-op when the node is already full', () => {
    assert.equal(planRestock(taskSystem({ node: { enabled: true, max: 5, current: 5 } })), null);
  });

  it('is a no-op when there is no node (tool / unlimited)', () => {
    assert.equal(planRestock(toolSystem()), null);
    assert.equal(planRestock(taskSystem({ node: null })), null);
  });
});

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

describe('summarizeNodeState', () => {
  it('reports current/max/available with no respawn for a manual node', () => {
    const summary = summarizeNodeState(taskSystem({ node: { enabled: true, max: 5, current: 3, respawn: { policy: 'manual' } } }), {
      now: 1000,
      secondsPerUnit: () => 3600
    });
    assert.deepEqual(summary, { hasNode: true, current: 3, max: 5, depleted: false, respawnEta: null });
  });

  it('reports depleted + a respawn ETA for an overTime node at zero', () => {
    const node = {
      enabled: true,
      max: 4,
      current: 0,
      respawn: { policy: 'overTime', gainMode: 'guaranteed', intervalUnit: 'hours', intervalAmount: 1, lastEvaluatedWorldTime: 0 }
    };
    const summary = summarizeNodeState(taskSystem({ node }), { now: 1800, secondsPerUnit: () => 3600 });
    assert.equal(summary.hasNode, true);
    assert.equal(summary.depleted, true);
    assert.ok(summary.respawnEta, 'has an ETA');
    assert.equal(summary.respawnEta.nextWorldTime, 3600, 'next interval anchor');
    assert.equal(summary.respawnEta.secondsUntil, 1800, 'half an hour remaining');
  });

  it('reports no node for a tool / unlimited node', () => {
    assert.deepEqual(summarizeNodeState(toolSystem()), { hasNode: false, current: null, max: null, depleted: false, respawnEta: null });
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

  it('returns null for a non-interactable system', () => {
    assert.equal(summarizeInteractable({ foo: 'bar' }, { resolveVisual: () => null }), null);
  });
});
