/**
 * Focused unit coverage for `GatheringNodeService` (issue 376) — the finite
 * resource-node subsystem extracted from `GatheringRichStateService`. These
 * exercise the collaborator directly through its injected seams: config reads
 * (`getConfig`), the environment store, the calendar-aware `secondsPerUnit`, the
 * d100 roller, the expression evaluator, and the interactable-scope seams.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { buildInteractableBehaviorSystem } from '../src/canvas/regions/interactableRegionFlags.js';
import { GatheringNodeService } from '../src/systems/GatheringNodeService.js';

const HOUR = 3600;
const SYS = 'sys-node';

function libraryTask(overrides = {}) {
  return {
    id: 'lib-1',
    name: 'Mine Ore',
    enabled: true,
    dropRows: [],
    nodes: {
      enabled: true,
      max: 3,
      current: 3,
      depletionTiming: 'onStart',
      respawn: { policy: 'manual' },
      ...overrides
    }
  };
}

function fakeEnvironmentStore(record) {
  let env = record;
  return {
    get: (id) => (id === env?.id ? env : null),
    update: async (id, patch) => {
      if (id !== env?.id) return null;
      env = { ...env, ...patch };
      return env;
    },
    _peek: () => env
  };
}

function makeService({
  store = null,
  config = { systems: { [SYS]: { tasks: [libraryTask()] } } },
  rolls = [1],
  evaluate = null,
  resolveRegionBehavior = null,
  writeInteractableBehavior = null
} = {}) {
  let rollIdx = 0;
  const hooks = [];
  const service = new GatheringNodeService({
    environmentStore: store,
    getConfig: () => config,
    secondsPerUnit: () => HOUR,
    rollD100: () => rolls[rollIdx++] ?? 1,
    evaluateExpression: evaluate ? async (p) => evaluate(p) : null,
    callHook: (name, payload) => hooks.push({ name, payload }),
    nowWorldTime: () => 0,
    resolveRegionBehavior,
    writeInteractableBehavior
  });
  return { service, hooks };
}

// --- _currentNodeState -----------------------------------------------------

test('_currentNodeState returns the runtime pool when present', () => {
  const { service } = makeService();
  const env = { id: 'env-1', craftingSystemId: SYS, nodeRuntime: { 'lib-1': { current: 1, max: 3 } } };
  assert.deepEqual(service._currentNodeState(env, 'lib-1'), { current: 1, max: 3 });
});

test('_currentNodeState seeds a fresh full pool from library config when no runtime', () => {
  const { service } = makeService();
  const env = { id: 'env-1', craftingSystemId: SYS, nodeRuntime: {} };
  const state = service._currentNodeState(env, 'lib-1');
  assert.equal(state.max, 3);
  assert.equal(state.current, 3, 'fresh pool starts full');
});

test('_currentNodeState returns null when the task has no node config', () => {
  const { service } = makeService({ config: { systems: { [SYS]: { tasks: [{ id: 'lib-1' }] } } } });
  assert.equal(service._currentNodeState({ craftingSystemId: SYS, nodeRuntime: {} }, 'lib-1'), null);
});

// --- _libraryNodeConfigs ---------------------------------------------------

test('_libraryNodeConfigs indexes only tasks carrying node configs', () => {
  const { service } = makeService({
    config: { systems: { [SYS]: { tasks: [libraryTask(), { id: 'lib-2' }] } } }
  });
  const map = service._libraryNodeConfigs(SYS);
  assert.equal(map.size, 1);
  assert.ok(map.has('lib-1'));
});

// --- _mergeNodeConfigState -------------------------------------------------

test('_mergeNodeConfigState keeps library capacity authoritative and clamps current', () => {
  const { service } = makeService();
  const libNode = { enabled: true, max: 5, current: 5, respawn: { policy: 'overTime', gainMode: 'guaranteed' } };
  const stored = { max: 99, current: 8, respawn: { lastEvaluatedWorldTime: 42, lastRoll: { rolls: [3] } } };
  const merged = service._mergeNodeConfigState(libNode, stored);
  assert.equal(merged.max, 5, 'capacity is library config');
  assert.equal(merged.current, 5, 'stored current clamped to library max');
  assert.equal(merged.respawn.policy, 'overTime', 'policy from library');
  assert.equal(merged.respawn.lastEvaluatedWorldTime, 42, 'anchor preserved from state');
  assert.deepEqual(merged.respawn.lastRoll, { rolls: [3] });
});

test('_mergeNodeConfigState falls back to stored when the library task was deleted', () => {
  const { service } = makeService();
  const stored = { max: 3, current: 1 };
  assert.equal(service._mergeNodeConfigState(null, stored), stored);
});

// --- restockNode -----------------------------------------------------------

test('restockNode tops up a regenerating pool and fires the hook', async () => {
  const env = { id: 'env-1', craftingSystemId: SYS, nodeRuntime: { 'lib-1': { enabled: true, max: 3, current: 0, respawn: { policy: 'manual' } } } };
  const store = fakeEnvironmentStore(env);
  const { service, hooks } = makeService({ store });
  const updated = await service.restockNode({ environmentId: 'env-1', taskId: 'lib-1', current: 3, max: 3 });
  assert.equal(updated.nodeRuntime['lib-1'].current, 3);
  assert.ok(hooks.some((h) => h.name === 'fabricate.gathering.nodeRestocked'));
});

test('restockNode is a no-op for a nonRegenerating pool (no write, no hook)', async () => {
  const config = { systems: { [SYS]: { tasks: [libraryTask({ respawn: { policy: 'nonRegenerating' } })] } } };
  const env = { id: 'env-1', craftingSystemId: SYS, nodeRuntime: { 'lib-1': { enabled: true, max: 3, current: 0, respawn: { policy: 'nonRegenerating' } } } };
  const store = fakeEnvironmentStore(env);
  const { service, hooks } = makeService({ store, config });
  const result = await service.restockNode({ environmentId: 'env-1', taskId: 'lib-1', current: 3 });
  assert.equal(result.current, 0, 'returned unchanged');
  assert.equal(hooks.length, 0, 'no nodeRestocked hook');
});

// --- respawnNodes ----------------------------------------------------------

test('respawnNodes regrows an overTime pool and writes the environment once', async () => {
  const config = { systems: { [SYS]: { tasks: [libraryTask({ respawn: { policy: 'overTime', gainMode: 'guaranteed', intervalUnit: 'hours', intervalAmount: 1 } })] } } };
  const env = {
    id: 'env-1',
    craftingSystemId: SYS,
    nodeRuntime: {
      'lib-1': { enabled: true, max: 3, current: 0, respawn: { policy: 'overTime', gainMode: 'guaranteed', intervalUnit: 'hours', intervalAmount: 1, lastEvaluatedWorldTime: 0 } }
    }
  };
  const store = fakeEnvironmentStore(env);
  const { service } = makeService({ store, config });
  const updated = await service.respawnNodes({ environment: env, worldTime: 2 * HOUR });
  assert.equal(updated.nodeRuntime['lib-1'].current, 2, '+1 per elapsed hour');
});

test('respawnNodes returns null when nothing changed', async () => {
  const env = { id: 'env-1', craftingSystemId: SYS, nodeRuntime: { 'lib-1': { enabled: true, max: 3, current: 3, respawn: { policy: 'manual' } } } };
  const store = fakeEnvironmentStore(env);
  const { service } = makeService({ store });
  assert.equal(await service.respawnNodes({ environment: env, worldTime: 10 * HOUR }), null);
});

// --- _respawnNode (chance gain + hook) -------------------------------------

test('_respawnNode adds chance-mode gains, persists rolls, and fires the respawn hook', async () => {
  const { service, hooks } = makeService({ rolls: [30, 80, 10] }); // hit, miss, hit → +2
  const node = { current: 0, max: 5, enabled: true, respawn: { policy: 'overTime', gainMode: 'chance', intervalUnit: 'hours', intervalAmount: 1, chance: 0.5, lastEvaluatedWorldTime: 0 } };
  const { changed, node: next } = await service._respawnNode(node, { now: 3 * HOUR, environmentId: 'env-1', taskId: 'lib-1' });
  assert.equal(changed, true);
  assert.equal(next.current, 2);
  const hook = hooks.find((h) => h.name === 'fabricate.gathering.nodeRespawned');
  assert.equal(hook.payload.amount, 2);
});

test('_respawnNode short-circuits for a non-overTime policy', async () => {
  const { service } = makeService();
  const node = { current: 1, max: 5, respawn: { policy: 'manual' } };
  const result = await service._respawnNode(node, { now: 5 * HOUR, environmentId: 'e', taskId: 't' });
  assert.equal(result.changed, false);
  assert.equal(result.node, node);
});

test('_respawnNode (expression) pre-rolls per interval via the evaluator', async () => {
  const { service } = makeService({ evaluate: () => 2 });
  const node = { current: 0, max: 10, enabled: true, respawn: { policy: 'overTime', gainMode: 'expression', amountExpression: '2', intervalUnit: 'hours', intervalAmount: 1, lastEvaluatedWorldTime: 0 } };
  const { node: next } = await service._respawnNode(node, { now: 2 * HOUR, environment: null, environmentId: 'e', taskId: 't' });
  assert.equal(next.current, 4, '2 intervals × rolled 2');
});

// --- issue 896: a null anchor must not pre-roll expression amounts ---------

/**
 * A depleted `expression` pool whose accrual anchor is an explicit `null` — the
 * shape `normalizeRespawn` persists for a pool that has never been evaluated.
 *
 * The literal `null` is load-bearing and NOT a style choice: `Number(undefined)`
 * is `NaN`, so a fixture that OMITS `lastEvaluatedWorldTime` already takes the
 * correct branch on the unfixed code and proves nothing. Only `null` differs
 * between the old lax predicate and #403's nullish-or-non-finite one, because
 * `Number(null) === 0` is finite and therefore read as "anchored at world time 0".
 */
function nullAnchoredExpressionPool() {
  return {
    current: 0,
    max: 5,
    enabled: true,
    respawn: {
      policy: 'overTime',
      gainMode: 'expression',
      amountExpression: '1d4',
      intervalUnit: 'hours',
      intervalAmount: 1,
      lastEvaluatedWorldTime: null
    }
  };
}

/** A service whose expression evaluator counts every real evaluation. */
function countingEvaluatorService() {
  let evaluations = 0;
  const { service } = makeService({
    evaluate: () => {
      evaluations += 1;
      return 2;
    }
  });
  return { service, evaluations: () => evaluations };
}

// These cases assert the COUNT of expression evaluations, not the resulting pool
// state: the state was already correct before the fix (the math's seed branch
// consumed none of the pre-rolls), so the wasted work is the only defect signal.
//
// `_respawnNode` and `respawnInteractableNode` carry structurally identical
// pre-roll blocks, so each has to be pinned in BOTH directions or an edit to one
// of them ships green:
//  - "pre-rolls too many" — a null-anchored seeding tick must roll NOTHING. That
//    is the issue 896 defect, and it is the pair of cases immediately below.
//  - "pre-rolls none" — an anchored pool must still roll once per elapsed
//    interval. `_respawnNode` gets that from `_respawnNode (expression) pre-rolls
//    per interval via the evaluator` above; `respawnInteractableNode` had NO
//    expression-mode coverage in either direction, so its positive case is added
//    here. Without it, replacing that site's anchor line with `const last = now`
//    or zeroing its pre-roll loop survives green — the site would then never
//    pre-roll anything and every interactable-scoped `expression` pool would stop
//    regrowing.

test('_respawnNode: a null-anchored expression pool pre-rolls nothing on its seeding tick', async () => {
  const { service, evaluations } = countingEvaluatorService();
  const { node: next } = await service._respawnNode(nullAnchoredExpressionPool(), {
    now: 500 * HOUR,
    environment: null,
    environmentId: 'e',
    taskId: 't'
  });
  assert.equal(evaluations(), 0, 'issue 896: _respawnNode must roll no expression amounts on the seeding tick');
  assert.equal(next.respawn.lastEvaluatedWorldTime, 500 * HOUR, 'the tick seeds the anchor at now');
});

test('respawnInteractableNode: a null-anchored expression pool pre-rolls nothing on its seeding tick', async () => {
  const { service, evaluations } = countingEvaluatorService();
  const { node: next } = await service.respawnInteractableNode({
    node: nullAnchoredExpressionPool(),
    worldTime: 500 * HOUR
  });
  assert.equal(evaluations(), 0, 'issue 896: respawnInteractableNode must roll no expression amounts on the seeding tick');
  assert.equal(next.respawn.lastEvaluatedWorldTime, 500 * HOUR, 'the tick seeds the anchor at now');
});

// The positive counterpart for the scoped site: the pre-roll bound must still
// produce one evaluation per elapsed interval for an ANCHORED pool. This is what
// keeps the "pre-rolls none" direction honest at `respawnInteractableNode`.
test('respawnInteractableNode (expression): pre-rolls per interval via the evaluator', async () => {
  const { service, evaluations } = countingEvaluatorService();
  const pool = nullAnchoredExpressionPool();
  const node = { ...pool, max: 10, respawn: { ...pool.respawn, lastEvaluatedWorldTime: 0 } };
  const { node: next } = await service.respawnInteractableNode({ node, worldTime: 2 * HOUR });
  assert.equal(evaluations(), 2, '2 elapsed intervals → 2 evaluations');
  assert.equal(next.current, 4, '2 intervals × rolled 2');
});

// The `interval > 0` half of both pre-roll guards, pinned at both sites: a legacy
// zero-interval pool must skip the block entirely. Without this, dropping that
// half divides by zero, yields an `Infinity` elapsed-interval count and pre-rolls
// a full restock the math never consumes (it short-circuits on the interval).
test('a legacy zero-interval expression pool pre-rolls nothing at either site', async () => {
  const zeroInterval = () => {
    const pool = nullAnchoredExpressionPool();
    return {
      ...pool,
      respawn: { ...pool.respawn, intervalUnit: null, intervalSeconds: 0, lastEvaluatedWorldTime: 0 }
    };
  };
  const env = countingEvaluatorService();
  await env.service._respawnNode(zeroInterval(), { now: 5 * HOUR, environment: null, environmentId: 'e', taskId: 't' });
  assert.equal(env.evaluations(), 0, '_respawnNode: no resolvable interval → the pre-roll block is skipped');

  const scoped = countingEvaluatorService();
  await scoped.service.respawnInteractableNode({ node: zeroInterval(), worldTime: 5 * HOUR });
  assert.equal(scoped.evaluations(), 0, 'respawnInteractableNode: no resolvable interval → the pre-roll block is skipped');
});

// --- _resolveNodeSource (interactable scope) -------------------------------

test('_resolveNodeSource resolves the environment pool by default', () => {
  const { service } = makeService();
  const source = service._resolveNodeSource({ environment: { id: 'env-1' }, task: { id: 'lib-1', nodes: { current: 2, max: 3 } } });
  assert.equal(source.kind, 'environment');
  assert.deepEqual(source.read(), { current: 2, max: 3 });
});

test('_resolveNodeSource resolves an unlinked interactable scoped pool and routes writes to it', async () => {
  const ref = { sceneId: 's', regionId: 'r', behaviorId: 'b' };
  const writes = [];
  const behavior = {
    type: 'fabricate.interactable',
    system: buildInteractableBehaviorSystem({
      interactableType: 'gatheringTask',
      sourceUuid: 'Item.task-1',
      taskNodeLink: 'unlinked',
      node: { enabled: true, max: 4, current: 4, respawn: { policy: 'manual' } }
    })
  };
  const { service } = makeService({
    resolveRegionBehavior: (r) => (r?.behaviorId === 'b' ? behavior : null),
    writeInteractableBehavior: (r, patch) => writes.push({ r, patch })
  });
  const source = service._resolveNodeSource({
    environment: { id: 'env-1' },
    task: { id: 'lib-1', nodes: { current: 1, max: 1 } },
    interactableRef: ref
  });
  assert.equal(source.kind, 'interactable');
  assert.equal(source.read().max, 4, 'self-authoritative scoped pool, no library merge');
  await source.write({ current: 3 });
  assert.equal(writes.length, 1);
  assert.deepEqual(writes[0].patch, { node: { current: 3 } });
});

test('_resolveNodeSource falls back to the environment pool when the behaviour is gone', () => {
  const { service } = makeService({ resolveRegionBehavior: () => null });
  const source = service._resolveNodeSource({
    environment: { id: 'env-1' },
    task: { id: 'lib-1', nodes: { current: 2, max: 3 } },
    interactableRef: { behaviorId: 'missing' }
  });
  assert.equal(source.kind, 'environment');
});

// --- respawnInteractableNode -----------------------------------------------

test('respawnInteractableNode regrows an overTime scoped pool with no library merge', async () => {
  const { service } = makeService({ rolls: [] });
  const node = { current: 0, max: 5, enabled: true, respawn: { policy: 'overTime', gainMode: 'guaranteed', intervalUnit: 'hours', intervalAmount: 1, lastEvaluatedWorldTime: 0 } };
  const { changed, node: next } = await service.respawnInteractableNode({ node, worldTime: 2 * HOUR });
  assert.equal(changed, true);
  assert.equal(next.current, 2);
});

test('respawnInteractableNode is a no-op for manual / nonRegenerating policies', async () => {
  const { service } = makeService();
  for (const policy of ['manual', 'nonRegenerating']) {
    const node = { current: 0, max: 5, respawn: { policy } };
    const result = await service.respawnInteractableNode({ node, worldTime: 5 * HOUR });
    assert.equal(result.changed, false);
  }
});
