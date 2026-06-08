/**
 * MUST-FIX 2 coverage: the per-token node override must be threaded through the
 * LISTING path (not just attempt), scoped to its OWN env+task, so a placed
 * gathering-task token's listing row reflects the token's own current/max/
 * depleted/respawnEta — and OTHER listed tasks in the same environment are
 * unaffected (they read the env/library node, never the token's).
 *
 * This exercises `GatheringEngine.listForActor` with `nodeStateOverride` +
 * `nodeStateOverrideScope`, asserting the scoping guard
 * (`_scopedNodeStateOverride`) only feeds the override to the matching env+task.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { GatheringEngine } from '../../src/systems/GatheringEngine.js';

const viewer = { id: 'user-1', isGM: true };
const actor = { id: 'actor-1', uuid: 'Actor.actor-1', name: 'Gatherer', items: [] };

function task(id) {
  return {
    id,
    name: `Task ${id}`,
    description: '',
    img: 'icons/svg/item-bag.svg',
    enabled: true,
    resolutionMode: 'routed',
    toolIds: [],
    nodes: { enabled: true, max: 5, current: 5, respawn: { policy: 'manual' } },
    resultGroups: [{ id: 'g', name: 'Ore', results: [] }],
    resultSelection: { provider: 'macroOutcome', macroUuid: 'Macro.outcome' }
  };
}

function environment() {
  const env = {
    id: 'env-a',
    craftingSystemId: 'system-a',
    name: 'Quarry',
    description: '',
    enabled: true,
    selectionMode: 'targeted',
    sceneUuid: null,
    tasks: [task('task-1'), task('task-2')]
  };
  Object.defineProperty(env, '__libraryTools', { value: new Map(), enumerable: false, configurable: true });
  return env;
}

// A rich-state whose listing metadata reflects an injected per-token nodeState
// (the override) when present, else the composed task's env node.
const richState = {
  composeEnvironment: (env) => env,
  economyMode: () => 'nodes',
  buildListingMetadata: ({ task: t, nodeState }) => {
    const override = nodeState && typeof nodeState.read === 'function' ? nodeState.read() : null;
    const display = override ?? t.nodes;
    return {
      nodes: display ? {
        enabled: true,
        available: Number(display.current || 0) > 0,
        depleted: Number(display.current || 0) <= 0,
        current: Number(display.current || 0),
        max: Number(display.max || 0),
        ...(override && typeof nodeState.respawnEta === 'function' && nodeState.respawnEta()
          ? { respawnEta: nodeState.respawnEta() } : {})
      } : null,
      stamina: null,
      risk: 'safe',
      conditions: {}
    };
  },
  evaluateStart: async () => ({ blockedReasons: [], evidence: {} })
};

function makeEngine() {
  return new GatheringEngine({
    richState,
    environmentStore: { list: () => [environment()], get: () => environment() },
    getSystems: () => [{ id: 'system-a', enabled: true, features: { gathering: true }, components: [] }],
    getSelectableActors: () => [actor],
    isActorSelectable: ({ actor: a }) => a?.uuid === actor.uuid,
    evaluator: { evaluateVisibility: async () => ({ visible: true, reasonCode: 'VISIBLE', diagnostic: null }) },
    sceneAccess: { canAttempt: () => ({ allowed: true }) },
    runManager: { getActiveRuns: () => [], getRunHistory: () => [], findActiveRunForTask: () => null },
    toolAvailability: { check: () => ({ available: true, missing: [], failedRequirements: [] }) },
    localize: (key) => key
  });
}

// A depleted token adapter for task-1 with a respawn ETA.
function tokenAdapter() {
  return {
    read: () => ({ enabled: true, max: 5, current: 0, respawn: { policy: 'overTime' } }),
    respawnEta: () => ({ nextWorldTime: 3600, secondsUntil: 1800 })
  };
}

function rowsById(listing) {
  const tasks = listing.environments[0].tasks;
  return new Map(tasks.map(t => [t.id, t]));
}

test('MF-2: the listing surfaces the OVERRIDE node counts for the SCOPED task only', async () => {
  const engine = makeEngine();
  const listing = await engine.listForActor({
    viewer,
    actor,
    nodeStateOverride: tokenAdapter(),
    nodeStateOverrideScope: { environmentId: 'env-a', taskId: 'task-1' }
  });

  const rows = rowsById(listing);
  // Scoped task-1 reflects the TOKEN node: depleted, current 0, with respawn ETA.
  assert.equal(rows.get('task-1').rich.nodes.current, 0, 'task-1 shows the token node count (0), not the env node (5)');
  assert.equal(rows.get('task-1').rich.nodes.depleted, true);
  assert.equal(rows.get('task-1').rich.nodes.available, false);
  assert.deepEqual(rows.get('task-1').rich.nodes.respawnEta, { nextWorldTime: 3600, secondsUntil: 1800 });

  // task-2 is UNAFFECTED — it reads the env/library node (full, 5), no leak.
  assert.equal(rows.get('task-2').rich.nodes.current, 5, 'task-2 is unaffected by task-1 token override');
  assert.equal(rows.get('task-2').rich.nodes.depleted, false);
  assert.equal(rows.get('task-2').rich.nodes.respawnEta, undefined);
});

test('MF-2: no override (no token session) → every task reads the env node', async () => {
  const engine = makeEngine();
  const listing = await engine.listForActor({ viewer, actor });
  const rows = rowsById(listing);
  assert.equal(rows.get('task-1').rich.nodes.current, 5);
  assert.equal(rows.get('task-2').rich.nodes.current, 5);
});

test('MF-2: an override with a non-matching scope leaks into NO task (scoping guard)', async () => {
  const engine = makeEngine();
  const listing = await engine.listForActor({
    viewer,
    actor,
    nodeStateOverride: tokenAdapter(),
    // Scope points at a task that is not in this environment ⇒ inert everywhere.
    nodeStateOverrideScope: { environmentId: 'env-a', taskId: 'task-missing' }
  });
  const rows = rowsById(listing);
  assert.equal(rows.get('task-1').rich.nodes.current, 5, 'unmatched scope never feeds the override');
  assert.equal(rows.get('task-2').rich.nodes.current, 5);
});
