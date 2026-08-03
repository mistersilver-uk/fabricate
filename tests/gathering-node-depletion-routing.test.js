/**
 * Coverage for GM-routed ENVIRONMENT resource-node depletion.
 *
 * An environment's node pool lives in `environment.nodeRuntime[taskId]`, persisted
 * in the `fabricate.gatheringEnvironments` WORLD setting. Foundry lets only a GM
 * update a world Setting document, so a player gathering from a node-backed task
 * used to fail with "User <name> lacks permission to update Setting [...]" — an
 * unhandled rejection that also left the pool un-depleted. The decrement is now
 * emitted to the active GM, which recomputes the single unit from its OWN stored
 * state.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { GatheringNodeService } from '../src/systems/GatheringNodeService.js';
import { GatheringRichStateService } from '../src/systems/GatheringRichStateService.js';
import { depleteNodeOnce } from '../src/systems/gatheringNodeConfig.js';
import {
  GATHERING_NODE_DEPLETE,
  createGatheringNodeDepletionWriter,
  createDepletionRateLimiter,
  routeGatheringNodeDepleteMessage,
  validateGatheringNodeDepletePayload
} from '../src/systems/gatheringNodeSocket.js';

const SYS = 'sys-node';

function libraryTask(nodes = {}) {
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
      ...nodes
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
  depleteEnvironmentNode = null,
  nodesEnabled = null,
  nowWorldTime = () => 0
} = {}) {
  return new GatheringNodeService({
    environmentStore: store,
    getConfig: () => config,
    secondsPerUnit: () => 3600,
    rollD100: () => 1,
    nowWorldTime,
    depleteEnvironmentNode,
    nodesEnabled
  });
}

// --- depleteNodeOnce -------------------------------------------------------

test('depleteNodeOnce consumes one unit without mutating the input', () => {
  const node = { enabled: true, max: 3, current: 2, respawn: { policy: 'manual' } };
  const next = depleteNodeOnce(node);
  assert.equal(next.current, 1);
  assert.equal(node.current, 2, 'the input node is untouched');
});

test('depleteNodeOnce clamps into [0, max]', () => {
  assert.equal(depleteNodeOnce({ max: 3, current: 0 }).current, 0, 'never goes negative');
  assert.equal(depleteNodeOnce({ max: 2, current: 99 }).current, 2, 'drifted count is capped');
});

test('depleteNodeOnce seeds an overTime respawn anchor only when unset', () => {
  const fresh = depleteNodeOnce(
    { max: 3, current: 3, respawn: { policy: 'overTime', lastEvaluatedWorldTime: null } },
    { worldTime: 1200 }
  );
  assert.equal(fresh.respawn.lastEvaluatedWorldTime, 1200);

  const anchored = depleteNodeOnce(
    { max: 3, current: 3, respawn: { policy: 'overTime', lastEvaluatedWorldTime: 60 } },
    { worldTime: 1200 }
  );
  assert.equal(anchored.respawn.lastEvaluatedWorldTime, 60, 'an existing anchor is preserved');
});

test('depleteNodeOnce leaves a manual pool without an anchor', () => {
  const next = depleteNodeOnce({ max: 3, current: 3, respawn: { policy: 'manual' } });
  assert.equal(next.respawn.lastEvaluatedWorldTime, undefined);
});

test('depleteNodeOnce returns null for a missing node', () => {
  assert.equal(depleteNodeOnce(null), null);
  assert.equal(depleteNodeOnce('nope'), null);
});

// --- payload validation ----------------------------------------------------

test('validateGatheringNodeDepletePayload normalizes a well-formed payload', () => {
  assert.deepEqual(
    validateGatheringNodeDepletePayload({
      action: GATHERING_NODE_DEPLETE,
      environmentId: ' env-1 ',
      taskId: ' lib-1 '
    }),
    { action: GATHERING_NODE_DEPLETE, environmentId: 'env-1', taskId: 'lib-1' }
  );
});

test('validateGatheringNodeDepletePayload rejects malformed payloads', () => {
  const cases = [
    null,
    'string',
    { action: 'somethingElse', environmentId: 'env-1', taskId: 'lib-1' },
    { action: GATHERING_NODE_DEPLETE, taskId: 'lib-1' },
    { action: GATHERING_NODE_DEPLETE, environmentId: 'env-1' },
    { action: GATHERING_NODE_DEPLETE, environmentId: '  ', taskId: 'lib-1' }
  ];
  for (const payload of cases) {
    assert.equal(validateGatheringNodeDepletePayload(payload), null, JSON.stringify(payload));
  }
});

test('the payload carries no node object, so a forged message cannot restock or resize', () => {
  const normalized = validateGatheringNodeDepletePayload({
    action: GATHERING_NODE_DEPLETE,
    environmentId: 'env-1',
    taskId: 'lib-1',
    node: { max: 9999, current: 9999, showCountsToPlayers: true }
  });
  assert.deepEqual(Object.keys(normalized).sort(), ['action', 'environmentId', 'taskId']);
});

// --- writer routing --------------------------------------------------------

test('a non-GM client emits the depletion instead of writing it', () => {
  const emitted = [];
  const applied = [];
  const writer = createGatheringNodeDepletionWriter({
    isActiveGM: () => false,
    emitDeplete: (payload) => emitted.push(payload),
    applyDeplete: (args) => applied.push(args)
  });
  writer.deplete({ environmentId: 'env-1', taskId: 'lib-1' });
  assert.deepEqual(emitted, [
    { action: GATHERING_NODE_DEPLETE, environmentId: 'env-1', taskId: 'lib-1' }
  ]);
  assert.equal(applied.length, 0);
});

test('the active GM applies locally — a socket emit never reaches the emitter', () => {
  const emitted = [];
  const applied = [];
  const writer = createGatheringNodeDepletionWriter({
    isActiveGM: () => true,
    emitDeplete: (payload) => emitted.push(payload),
    applyDeplete: (args) => applied.push(args)
  });
  writer.deplete({ environmentId: 'env-1', taskId: 'lib-1' });
  assert.deepEqual(applied, [{ environmentId: 'env-1', taskId: 'lib-1' }]);
  assert.equal(emitted.length, 0);
});

test('a GM-less session reports the unroutable depletion instead of emitting into the void', () => {
  // Users#activeGM is null with no GM connected, so nothing would ever apply the
  // emit. The gather still succeeds — it never gated on this write — but the pool
  // does not deplete, and that must be observable rather than silent.
  const emitted = [];
  const unroutable = [];
  const writer = createGatheringNodeDepletionWriter({
    isActiveGM: () => false,
    hasActiveGM: () => false,
    onUnroutable: (args) => unroutable.push(args),
    emitDeplete: (payload) => emitted.push(payload)
  });
  writer.deplete({ environmentId: 'env-1', taskId: 'lib-1' });
  assert.deepEqual(unroutable, [{ environmentId: 'env-1', taskId: 'lib-1' }]);
  assert.equal(emitted.length, 0, 'no emit when nobody can apply it');
});

test('an omitted hasActiveGM seam keeps the plain emit behaviour', () => {
  const emitted = [];
  const writer = createGatheringNodeDepletionWriter({
    isActiveGM: () => false,
    emitDeplete: (payload) => emitted.push(payload)
  });
  writer.deplete({ environmentId: 'env-1', taskId: 'lib-1' });
  assert.equal(emitted.length, 1);
});

test('the writer drops a payload it cannot address', () => {
  const emitted = [];
  const writer = createGatheringNodeDepletionWriter({
    isActiveGM: () => false,
    emitDeplete: (payload) => emitted.push(payload)
  });
  writer.deplete({ environmentId: 'env-1' });
  writer.deplete();
  assert.equal(emitted.length, 0);
});

// --- inbound routing -------------------------------------------------------

test('only the active GM applies an inbound depletion', () => {
  const applied = [];
  const deps = { senderId: 'user-1', applyDeplete: (args) => applied.push(args) };
  const payload = { action: GATHERING_NODE_DEPLETE, environmentId: 'env-1', taskId: 'lib-1' };

  assert.equal(routeGatheringNodeDepleteMessage(payload, { ...deps, isActiveGM: () => false }), false);
  assert.equal(applied.length, 0);

  assert.equal(routeGatheringNodeDepleteMessage(payload, { ...deps, isActiveGM: () => true }), true);
  assert.deepEqual(applied, [{ environmentId: 'env-1', taskId: 'lib-1' }]);
});

test('an unauthenticated sender is refused (fail-closed)', () => {
  const applied = [];
  const result = routeGatheringNodeDepleteMessage(
    { action: GATHERING_NODE_DEPLETE, environmentId: 'env-1', taskId: 'lib-1' },
    { isActiveGM: () => true, applyDeplete: (args) => applied.push(args) }
  );
  assert.equal(result, false);
  assert.equal(applied.length, 0);
});

test('a malformed inbound payload is ignored', () => {
  const applied = [];
  const result = routeGatheringNodeDepleteMessage(
    { action: 'unrelatedAction' },
    { isActiveGM: () => true, senderId: 'user-1', applyDeplete: (args) => applied.push(args) }
  );
  assert.equal(result, false);
  assert.equal(applied.length, 0);
});

// --- the source handle -----------------------------------------------------

test('_resolveNodeSource routes deplete through the seam and writes nothing directly', async () => {
  const store = fakeEnvironmentStore({ id: 'env-1', craftingSystemId: SYS, nodeRuntime: {} });
  const routed = [];
  const service = makeService({ store, depleteEnvironmentNode: (args) => routed.push(args) });
  const source = service._resolveNodeSource({
    environment: { id: 'env-1' },
    task: { id: 'lib-1', nodes: { max: 3, current: 3 } }
  });

  assert.equal(source.kind, 'environment');
  await source.deplete({ max: 3, current: 2 });
  assert.deepEqual(routed, [{ environmentId: 'env-1', taskId: 'lib-1' }]);
  assert.deepEqual(store._peek().nodeRuntime, {}, 'the acting client writes no world setting');
});

test('without the seam, deplete writes in place (GM-only worlds and tests)', async () => {
  const store = fakeEnvironmentStore({ id: 'env-1', craftingSystemId: SYS, nodeRuntime: {} });
  const service = makeService({ store });
  const source = service._resolveNodeSource({
    environment: { id: 'env-1' },
    task: { id: 'lib-1', nodes: { max: 3, current: 3 } }
  });

  await source.deplete({ max: 3, current: 2 });
  assert.equal(store._peek().nodeRuntime['lib-1'].current, 2);
});

// --- the active-GM applier -------------------------------------------------

test('applyEnvironmentNodeDepletion consumes one unit from the STORED pool', async () => {
  const store = fakeEnvironmentStore({
    id: 'env-1',
    craftingSystemId: SYS,
    nodeRuntime: { 'lib-1': { enabled: true, max: 3, current: 2, respawn: { policy: 'manual' } } }
  });
  const service = makeService({ store });

  await service.applyEnvironmentNodeDepletion({ environmentId: 'env-1', taskId: 'lib-1' });
  assert.equal(store._peek().nodeRuntime['lib-1'].current, 1);
});

test('applyEnvironmentNodeDepletion seeds a full pool from library config on first depletion', async () => {
  const store = fakeEnvironmentStore({ id: 'env-1', craftingSystemId: SYS, nodeRuntime: {} });
  const service = makeService({ store });

  await service.applyEnvironmentNodeDepletion({ environmentId: 'env-1', taskId: 'lib-1' });
  const written = store._peek().nodeRuntime['lib-1'];
  assert.equal(written.max, 3);
  assert.equal(written.current, 2, 'a fresh full pool of 3 drops to 2');
});

test('concurrent depletions are additive rather than last-write-wins', async () => {
  const store = fakeEnvironmentStore({
    id: 'env-1',
    craftingSystemId: SYS,
    nodeRuntime: { 'lib-1': { enabled: true, max: 3, current: 3, respawn: { policy: 'manual' } } }
  });
  const service = makeService({ store });

  // Two players who each saw current: 3 and each computed current: 2 locally. The
  // GM recomputes from its own state, so both units are actually consumed.
  await service.applyEnvironmentNodeDepletion({ environmentId: 'env-1', taskId: 'lib-1' });
  await service.applyEnvironmentNodeDepletion({ environmentId: 'env-1', taskId: 'lib-1' });
  assert.equal(store._peek().nodeRuntime['lib-1'].current, 1);
});

test('applyEnvironmentNodeDepletion keeps library capacity authoritative', async () => {
  const store = fakeEnvironmentStore({
    id: 'env-1',
    craftingSystemId: SYS,
    // A stale snapshot claiming a bigger pool than the library task allows.
    nodeRuntime: { 'lib-1': { enabled: true, max: 99, current: 99, respawn: { policy: 'manual' } } }
  });
  const service = makeService({ store });

  await service.applyEnvironmentNodeDepletion({ environmentId: 'env-1', taskId: 'lib-1' });
  const written = store._peek().nodeRuntime['lib-1'];
  assert.equal(written.max, 3, 'library max wins');
  assert.equal(written.current, 2, 'clamped to the library max, then decremented');
});

test('applyEnvironmentNodeDepletion re-checks the node economy toggle', async () => {
  const store = fakeEnvironmentStore({
    id: 'env-1',
    craftingSystemId: SYS,
    nodeRuntime: { 'lib-1': { enabled: true, max: 3, current: 3, respawn: { policy: 'manual' } } }
  });
  const service = makeService({ store, nodesEnabled: () => false });

  assert.equal(
    await service.applyEnvironmentNodeDepletion({ environmentId: 'env-1', taskId: 'lib-1' }),
    null
  );
  assert.equal(store._peek().nodeRuntime['lib-1'].current, 3, 'nothing consumed');
});

test('applyEnvironmentNodeDepletion no-ops on an unknown environment or task', async () => {
  const store = fakeEnvironmentStore({ id: 'env-1', craftingSystemId: SYS, nodeRuntime: {} });
  const service = makeService({ store });

  assert.equal(
    await service.applyEnvironmentNodeDepletion({ environmentId: 'env-gone', taskId: 'lib-1' }),
    null
  );
  assert.equal(
    await service.applyEnvironmentNodeDepletion({ environmentId: 'env-1', taskId: 'lib-gone' }),
    null
  );
});

// --- composition: the real commitAcceptedAttempt path -----------------------
//
// The routing units above all stay green if `commitAcceptedAttempt` reverts to
// `source.write(node)` — which is exactly the original bug. These drive the real
// service so the seam cannot be silently disconnected.

function makeRoutedRichState({ store, routed }) {
  const config = {
    systems: {
      [SYS]: {
        tasks: [libraryTask()],
        economy: { nodes: { enabled: true }, stamina: { enabled: false } }
      }
    }
  };
  return new GatheringRichStateService({
    environmentStore: store,
    getSetting: () => config,
    setSetting: async () => config,
    settingKey: 'gatheringConfig',
    nowWorldTime: () => 0,
    hooks: { callAll: () => {} },
    depleteEnvironmentNode: (args) => routed.push(args)
  });
}

test('commitAcceptedAttempt routes the environment decrement instead of writing it', async () => {
  const store = fakeEnvironmentStore({ id: 'env-1', craftingSystemId: SYS, nodeRuntime: {} });
  const routed = [];
  const service = makeRoutedRichState({ store, routed });

  const evidence = await service.commitAcceptedAttempt({
    actor: { id: 'a1', uuid: 'Actor.a1' },
    system: { id: SYS },
    environment: { id: 'env-1', craftingSystemId: SYS },
    task: { id: 'lib-1', nodes: { enabled: true, max: 3, current: 3, respawn: { policy: 'manual' } } },
    outcome: { status: 'succeeded' }
  });

  assert.deepEqual(routed, [{ environmentId: 'env-1', taskId: 'lib-1' }], 'relayed to the GM');
  assert.deepEqual(store._peek().nodeRuntime, {}, 'the acting client wrote no world setting');
  assert.equal(evidence.node.consumed, 1);
  assert.equal(evidence.node.scope, 'environment');
});

test('a relayed decrement is flagged non-authoritative so no guessed count is published', async () => {
  const store = fakeEnvironmentStore({ id: 'env-1', craftingSystemId: SYS, nodeRuntime: {} });
  const service = makeRoutedRichState({ store, routed: [] });

  const evidence = await service.commitAcceptedAttempt({
    actor: { id: 'a1', uuid: 'Actor.a1' },
    system: { id: SYS },
    environment: { id: 'env-1', craftingSystemId: SYS },
    task: { id: 'lib-1', nodes: { enabled: true, max: 3, current: 3, respawn: { policy: 'manual' } } },
    outcome: { status: 'succeeded' }
  });

  assert.equal(evidence.node.authoritative, false, 'the count is this client, not the world');
});

test('without the seam the decrement is authoritative and written in place', async () => {
  const store = fakeEnvironmentStore({ id: 'env-1', craftingSystemId: SYS, nodeRuntime: {} });
  const config = {
    systems: {
      [SYS]: { tasks: [libraryTask()], economy: { nodes: { enabled: true } } }
    }
  };
  const service = new GatheringRichStateService({
    environmentStore: store,
    getSetting: () => config,
    setSetting: async () => config,
    settingKey: 'gatheringConfig',
    nowWorldTime: () => 0,
    hooks: { callAll: () => {} }
  });

  const evidence = await service.commitAcceptedAttempt({
    actor: { id: 'a1', uuid: 'Actor.a1' },
    system: { id: SYS },
    environment: { id: 'env-1', craftingSystemId: SYS },
    task: { id: 'lib-1', nodes: { enabled: true, max: 3, current: 3, respawn: { policy: 'manual' } } },
    outcome: { status: 'succeeded' }
  });

  assert.equal(evidence.node.authoritative, true);
  assert.equal(evidence.node.remaining, 2);
  assert.equal(store._peek().nodeRuntime['lib-1'].current, 2, 'a GM writes directly');
});

// --- one consumption per run across a timed run's two commits ---------------
//
// A timed run commits twice: once when the wait starts and once when it matures.
// `shouldDepleteNode` answers true at BOTH for `onStart` timing, so the pool used to
// lose two units per run. Pre-existing and GM-visible; only surfaced for players once
// the permission failure stopped masking it.

function makeLocalRichState(store, depletionTiming) {
  const config = {
    systems: {
      [SYS]: {
        tasks: [libraryTask({ depletionTiming })],
        economy: { nodes: { enabled: true } }
      }
    }
  };
  return new GatheringRichStateService({
    environmentStore: store,
    getSetting: () => config,
    setSetting: async () => config,
    settingKey: 'gatheringConfig',
    nowWorldTime: () => 0,
    hooks: { callAll: () => {} }
  });
}

function timedTask(depletionTiming) {
  return {
    id: 'lib-1',
    nodes: { enabled: true, max: 3, current: 3, depletionTiming, respawn: { policy: 'manual' } }
  };
}

async function commitPhase(service, task, phase, status) {
  return service.commitAcceptedAttempt({
    actor: { id: 'a1', uuid: 'Actor.a1' },
    system: { id: SYS },
    environment: { id: 'env-1', craftingSystemId: SYS },
    task,
    outcome: { status },
    phase
  });
}

test('an onStart timed run consumes exactly one unit across both commits', async () => {
  const store = fakeEnvironmentStore({ id: 'env-1', craftingSystemId: SYS, nodeRuntime: {} });
  const service = makeLocalRichState(store, 'onStart');

  const started = await commitPhase(service, timedTask('onStart'), 'waitingStart', 'waitingTime');
  assert.ok(started.node, 'onStart consumes when the wait begins');
  assert.equal(store._peek().nodeRuntime['lib-1'].current, 2);

  // The maturity commit re-reads the same composed task; it must not consume again.
  const matured = await commitPhase(service, timedTask('onStart'), 'timedMaturity', 'succeeded');
  assert.equal(matured.node, null, 'the unit was already consumed at the start');
  assert.equal(store._peek().nodeRuntime['lib-1'].current, 2, 'still one unit consumed');
});

test('an onSuccess timed run consumes at maturity only', async () => {
  const store = fakeEnvironmentStore({ id: 'env-1', craftingSystemId: SYS, nodeRuntime: {} });
  const service = makeLocalRichState(store, 'onSuccess');

  const started = await commitPhase(service, timedTask('onSuccess'), 'waitingStart', 'waitingTime');
  assert.equal(started.node, null, 'nothing consumed before the outcome is known');
  assert.deepEqual(store._peek().nodeRuntime, {});

  const matured = await commitPhase(service, timedTask('onSuccess'), 'timedMaturity', 'succeeded');
  assert.ok(matured.node);
  assert.equal(store._peek().nodeRuntime['lib-1'].current, 2);
});

test('an immediate attempt still consumes on its single commit', async () => {
  for (const timing of ['onStart', 'onSuccess']) {
    const store = fakeEnvironmentStore({ id: 'env-1', craftingSystemId: SYS, nodeRuntime: {} });
    const service = makeLocalRichState(store, timing);
    const evidence = await commitPhase(service, timedTask(timing), 'immediate', 'succeeded');
    assert.ok(evidence.node, `${timing} consumes on an immediate attempt`);
    assert.equal(store._peek().nodeRuntime['lib-1'].current, 2, timing);
  }
});

// --- inbound rate limiting -------------------------------------------------
//
// The applier re-checks the node economy but not whether the sender could actually
// reach the task, so an authenticated user can address any (environmentId, taskId).
// That residual is denial-of-RESOURCE; the limiter bounds it to human gathering speed.

test('the rate limiter allows a normal gathering cadence', () => {
  let clock = 0;
  const allow = createDepletionRateLimiter({ now: () => clock, limit: 3, windowMs: 1000 });
  assert.equal(allow('user-1'), true);
  clock = 400;
  assert.equal(allow('user-1'), true);
  clock = 800;
  assert.equal(allow('user-1'), true);
});

test('the rate limiter refuses a burst beyond the window budget', () => {
  const allow = createDepletionRateLimiter({ now: () => 0, limit: 3, windowMs: 1000 });
  assert.equal(allow('user-1'), true);
  assert.equal(allow('user-1'), true);
  assert.equal(allow('user-1'), true);
  assert.equal(allow('user-1'), false, 'the fourth in the same window is refused');
});

test('a sustained flood stays refused rather than resetting its own budget', () => {
  let clock = 0;
  const allow = createDepletionRateLimiter({ now: () => clock, limit: 2, windowMs: 1000 });
  allow('user-1');
  allow('user-1');
  for (let i = 0; i < 50; i += 1) {
    clock += 1;
    assert.equal(allow('user-1'), false, `flood message ${i} stays refused`);
  }
});

test('the window slides, so a throttled sender recovers', () => {
  let clock = 0;
  const allow = createDepletionRateLimiter({ now: () => clock, limit: 2, windowMs: 1000 });
  allow('user-1');
  allow('user-1');
  assert.equal(allow('user-1'), false);
  clock = 1001;
  assert.equal(allow('user-1'), true, 'the earlier hits have aged out');
});

test('the rate limiter budgets each sender independently', () => {
  const allow = createDepletionRateLimiter({ now: () => 0, limit: 1, windowMs: 1000 });
  assert.equal(allow('user-1'), true);
  assert.equal(allow('user-1'), false);
  assert.equal(allow('user-2'), true, 'one griefer does not throttle everyone else');
});

test('the rate limiter refuses a blank sender', () => {
  const allow = createDepletionRateLimiter({ now: () => 0 });
  assert.equal(allow(''), false);
  assert.equal(allow(null), false);
});

test('the router refuses a rate-limited sender without applying', () => {
  const applied = [];
  const result = routeGatheringNodeDepleteMessage(
    { action: GATHERING_NODE_DEPLETE, environmentId: 'env-1', taskId: 'lib-1' },
    {
      isActiveGM: () => true,
      senderId: 'user-1',
      allowSender: () => false,
      applyDeplete: (args) => applied.push(args)
    }
  );
  assert.equal(result, false);
  assert.equal(applied.length, 0);
});

test('a refused message does not consume the sender budget', () => {
  // The limiter is consulted LAST, so malformed and unauthenticated traffic cannot
  // exhaust a legitimate player's allowance.
  const consulted = [];
  const deps = {
    isActiveGM: () => true,
    allowSender: (id) => {
      consulted.push(id);
      return true;
    },
    applyDeplete: () => {}
  };
  routeGatheringNodeDepleteMessage({ action: 'unrelated' }, { ...deps, senderId: 'user-1' });
  routeGatheringNodeDepleteMessage(
    { action: GATHERING_NODE_DEPLETE, environmentId: 'env-1', taskId: 'lib-1' },
    deps
  );
  assert.deepEqual(consulted, [], 'neither reached the limiter');
});
