/**
 * MUST-FIX 1 coverage: a TIMED gathering attempt started from a canvas
 * gathering-task token must, at MATURITY, route its node decrement onto the
 * TOKEN's own node (via a rebuilt per-token adapter) and leave
 * `environment.nodeRuntime[taskId]` untouched — even for
 * `depletionTiming: 'onSuccess'`, where nothing is consumed at start.
 *
 * The waiting run cannot persist the live adapter (a function object), so it
 * persists only the token REF (`economyEvidence.tokenNodeRef`). The engine
 * rebuilds the adapter at maturity through the injected `resolveTokenNodeState`
 * seam and threads it into `_commitRichAttempt`. This test asserts the rebuilt
 * adapter is the SAME `nodeState` the rich-state commit receives at maturity
 * (the token-vs-env decrement behavior itself is covered by
 * `gathering-node-override.test.js`). Both branches are exercised: token ref
 * present (rebuilt adapter threaded) vs. absent (null → env fallback).
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { GatheringEngine } from '../../src/systems/GatheringEngine.js';
import { GatheringRunManager } from '../../src/systems/GatheringRunManager.js';

const SYS = 'system-node';
const viewer = { id: 'user-1', isGM: false };

class FakeActor {
  constructor() {
    this.id = 'actor-1';
    this.uuid = 'Actor.actor-1';
    this.name = 'Gatherer';
    this.flags = { fabricate: {} };
  }
  getFlag(ns, key) { return this.flags?.[ns]?.[key]; }
  async setFlag(ns, key, value) {
    this.flags[ns] = this.flags[ns] || {};
    this.flags[ns][key] = JSON.parse(JSON.stringify(value));
    return value;
  }
}

const actor = new FakeActor();

function onSuccessTask() {
  return {
    id: 'task-node',
    name: 'Mine Ore',
    enabled: true,
    resolutionMode: 'routed',
    toolIds: [],
    timeRequirement: { minutes: 1 },
    nodes: { enabled: true, max: 5, current: 5, depletionTiming: 'onSuccess', respawn: { policy: 'manual' } },
    resultGroups: [{ id: 'g', name: 'Ore', results: [{ id: 'r', componentId: 'comp-a', quantity: 1 }] }],
    resultSelection: { provider: 'macroOutcome', macroUuid: 'Macro.outcome' }
  };
}

function environment() {
  const env = {
    id: 'env-node',
    craftingSystemId: SYS,
    name: 'Quarry',
    enabled: true,
    selectionMode: 'targeted',
    sceneUuid: null,
    nodeRuntime: { 'task-node': { enabled: true, max: 5, current: 5, respawn: { policy: 'manual' } } },
    tasks: [onSuccessTask()]
  };
  Object.defineProperty(env, '__libraryTools', { value: new Map(), enumerable: false, configurable: true });
  return env;
}

function system() {
  return { id: SYS, enabled: true, features: { gathering: true }, components: [{ id: 'comp-a', difficulty: 1 }] };
}

// A spy rich-state that records the nodeState threaded into the maturity commit.
// (composeEnvironment is the identity so the engine's _findEnvironment does not
// re-normalize the inline routed task.)
function spyRichState() {
  const commits = [];
  return {
    commits,
    rich: {
      composeEnvironment: (env) => env,
      economyMode: () => 'nodes',
      buildListingMetadata: () => ({ nodes: null, stamina: null, risk: 'safe', conditions: {} }),
      evaluateStart: async () => ({ blockedReasons: [], evidence: {} }),
      commitAcceptedAttempt: async ({ nodeState, outcome }) => {
        commits.push({ nodeState, outcome });
        // Route the decrement exactly like the real service would: through the
        // adapter when present (token), else signal an env-node write.
        if (nodeState && typeof nodeState.write === 'function') {
          const node = nodeState.read();
          nodeState.write({ ...node, current: Math.max(0, Number(node.current || 0) - 1) });
        }
        return { node: { taskId: 'task-node', consumed: 1 } };
      }
    }
  };
}

function tokenAdapter(current) {
  const node = { enabled: true, max: 5, current, respawn: { policy: 'manual' } };
  const writes = [];
  return {
    writes,
    adapter: {
      tokenRef: () => ({ sceneId: 'scene-1', tokenId: 'token-1' }),
      read: () => node,
      write: (next) => { writes.push(next); node.current = next.current; }
    }
  };
}

function makeEngine({ runManager, rich, resolveTokenNodeState }) {
  return new GatheringEngine({
    environmentStore: {
      list: () => [environment()],
      get: (id) => (id === 'env-node' ? environment() : null)
    },
    runManager,
    richState: rich,
    getSystems: () => [system()],
    getSelectableActors: () => [actor],
    isActorSelectable: ({ actor: a }) => a?.uuid === actor.uuid,
    isGamePaused: () => false,
    resolveTokenNodeState,
    evaluator: {
      evaluateVisibility: async () => ({ visible: true, reasonCode: 'VISIBLE', diagnostic: null }),
      evaluateCheck: async () => ({ success: true, status: 'succeeded', value: 10, reasonCode: 'OK', diagnostic: null })
    },
    sceneAccess: { canAttempt: () => ({ allowed: true }) },
    toolAvailability: { check: () => ({ available: true, missing: [], failedRequirements: [] }) },
    resultResolver: {
      resolveRouted: async (p) => ({ status: 'succeeded', resultGroups: [p.task.resultGroups[0]], checkResult: { outcome: 'Ore', provider: p.provider } })
    },
    resultCreator: { plan: async () => [], create: async () => [] },
    toolBreakage: { plan: async () => [], apply: async () => [] },
    failureFeedback: { apply: async () => ({ delivered: true }) },
    localize: (key) => key
  });
}

function makeRunManager(now) {
  return new GatheringRunManager({
    randomID: () => 'run-1',
    nowWorldTime: now,
    getUserId: () => viewer.id,
    getActors: () => [actor]
  });
}

test('MF-1: onSuccess timed token run rebuilds the TOKEN adapter at maturity and threads it into the commit', async () => {
  actor.flags = { fabricate: {} };
  let worldTime = 1000;
  const runManager = makeRunManager(() => worldTime);
  const { rich, commits } = spyRichState();
  const { adapter, writes } = tokenAdapter(5);

  let resolvedRef = null;
  const resolveTokenNodeState = (ref) => { resolvedRef = ref; return adapter; };
  const engine = makeEngine({ runManager, rich, resolveTokenNodeState });

  await runManager.createWaitingRun(actor, {
    craftingSystemId: SYS,
    environmentId: 'env-node',
    taskId: 'task-node',
    economyEvidence: { tokenNodeRef: { sceneId: 'scene-1', tokenId: 'token-1' } }
  }, { minutes: 1 });

  worldTime = 1060; // mature
  const result = await engine.processWorldTime(worldTime);

  assert.equal(result.completed.length, 1, 'the run matured to completion');
  assert.deepEqual(resolvedRef, { sceneId: 'scene-1', tokenId: 'token-1' }, 'maturity rebuilt the adapter from the persisted ref');
  assert.equal(commits.length, 1);
  assert.equal(commits[0].nodeState, adapter, 'the rebuilt TOKEN adapter is threaded into the maturity commit');
  assert.equal(writes.length, 1, 'the onSuccess decrement routed through the TOKEN adapter');
  assert.equal(writes[0].current, 4, '5 → 4 on the token node (env nodeRuntime is never written by the spy)');
});

test('MF-1: a matured run WITHOUT a token ref threads nodeState=null (env fallback), never invoking the rebuild seam', async () => {
  actor.flags = { fabricate: {} };
  let worldTime = 1000;
  const runManager = makeRunManager(() => worldTime);
  const { rich, commits } = spyRichState();

  let seamCalls = 0;
  const resolveTokenNodeState = () => { seamCalls += 1; return null; };
  const engine = makeEngine({ runManager, rich, resolveTokenNodeState });

  await runManager.createWaitingRun(actor, {
    craftingSystemId: SYS,
    environmentId: 'env-node',
    taskId: 'task-node'
  }, { minutes: 1 });

  worldTime = 1060;
  const result = await engine.processWorldTime(worldTime);

  assert.equal(result.completed.length, 1);
  assert.equal(seamCalls, 0, 'no token ref ⇒ the rebuild seam is never invoked');
  assert.equal(commits.length, 1);
  assert.equal(commits[0].nodeState, null, 'the maturity commit receives nodeState=null and falls back to the env node');
});
