/**
 * Issue 901 — the world-scoped blind-run store and its GM relay.
 *
 * Two properties matter here and neither is confidentiality (Foundry has no
 * server-side read authorization, so any client can READ a world setting):
 *
 *   - only a GM may WRITE, so a player cannot forge which task their blind run
 *     will yield, and
 *   - the single-writer read-modify-write is safe only because `setSetting`
 *     REPLACES rather than merges and the active GM is the sole writer.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { GatheringBlindRunStore } from '../src/systems/GatheringBlindRunStore.js';
import {
  BLIND_START_RATE_LIMIT,
  GATHERING_BLIND_START,
  createBlindStartRateLimiter,
  createGatheringBlindStartWriter,
  routeGatheringBlindStartMessage,
  validateGatheringBlindStartPayload,
} from '../src/systems/gatheringBlindRunSocket.js';

const SETTING_KEY = 'gatheringBlindRuns';

function makeStore({ isActiveGM = () => true, isRunActive = null, seed = {} } = {}) {
  let stored = seed;
  const store = new GatheringBlindRunStore({
    getSetting: () => stored,
    setSetting: async (key, value) => {
      stored = value;
      return value;
    },
    settingKey: SETTING_KEY,
    isActiveGM,
    isRunActive,
    nowWorldTime: () => 4200,
  });
  return { store, read: () => stored };
}

function record(runId, taskId, { units = 1, actorUuid = 'Actor.a' } = {}) {
  return {
    runId,
    actorUuid,
    craftingSystemId: 'system-a',
    environmentId: 'env-a',
    taskId,
    snapshot: { task: { id: taskId } },
    reservation: { environmentId: 'env-a', taskId, units, scope: 'environment' },
  };
}

test('only a client that may write the world setting can record or release a blind run', async () => {
  const player = makeStore({ isActiveGM: () => false });

  assert.equal(player.store.canWrite(), false);
  assert.equal(await player.store.reserve(record('run-1', 'task-a')), null);
  assert.deepEqual(player.read(), {}, 'a player write must never land');

  const gm = makeStore({ seed: { 'run-1': record('run-1', 'task-a') } });
  assert.equal(gm.store.canWrite(), true);
  assert.ok(await gm.store.release('run-1'));
});

test('a write preserves other runs, because setSetting replaces the whole map', async () => {
  const { store, read } = makeStore({ seed: { 'run-1': record('run-1', 'task-a') } });

  await store.reserve(record('run-2', 'task-b'));
  assert.deepEqual(Object.keys(read()).sort(), ['run-1', 'run-2']);

  const released = await store.release('run-1');
  assert.equal(released.taskId, 'task-a');
  assert.deepEqual(Object.keys(read()), ['run-2'], 'only the released run is removed');
  assert.equal(await store.release('run-1'), null, 'releasing twice is a no-op');
});

test('reserved units are summed per pool, and a run may exclude its own claim', () => {
  const { store } = makeStore({
    seed: {
      'run-1': record('run-1', 'task-a'),
      'run-2': record('run-2', 'task-a', { units: 2 }),
      'run-3': record('run-3', 'task-b'),
    },
  });

  assert.equal(store.reservedUnits({ environmentId: 'env-a', taskId: 'task-a' }), 3);
  assert.equal(
    store.reservedUnits({ environmentId: 'env-a', taskId: 'task-a', excludeRunId: 'run-2' }),
    1
  );
  assert.equal(store.reservedUnits({ environmentId: 'env-a', taskId: 'task-b' }), 1);
  assert.equal(store.reservedUnits({ environmentId: 'env-other', taskId: 'task-a' }), 0);
});

test('a reservation whose run is no longer active neither counts nor survives a prune', async () => {
  const live = new Set(['run-1']);
  const { store, read } = makeStore({
    seed: {
      'run-1': record('run-1', 'task-a'),
      'run-2': record('run-2', 'task-a'),
    },
    isRunActive: ({ runId }) => live.has(runId),
  });

  assert.equal(
    store.reservedUnits({ environmentId: 'env-a', taskId: 'task-a' }),
    1,
    'a dead run cannot hold a pool hostage'
  );
  assert.deepEqual(await store.prune(), ['run-2']);
  assert.deepEqual(Object.keys(read()), ['run-1']);
});

test('a blind-start payload is accepted only when it addresses an environment and an actor', () => {
  assert.equal(validateGatheringBlindStartPayload(null), null);
  assert.equal(validateGatheringBlindStartPayload({ action: 'somethingElse' }), null);
  assert.equal(
    validateGatheringBlindStartPayload({ action: GATHERING_BLIND_START, environmentId: 'env-a' }),
    null
  );
  assert.deepEqual(
    validateGatheringBlindStartPayload({
      action: GATHERING_BLIND_START,
      environmentId: ' env-a ',
      actorUuid: 'Actor.a',
      interactableRef: { sceneId: 's', regionId: 'r' },
    }),
    {
      action: GATHERING_BLIND_START,
      environmentId: 'env-a',
      actorUuid: 'Actor.a',
      taskId: null,
      interactableRef: null,
    }
  );
});

test('the writer applies locally on the active GM and emits everywhere else', () => {
  const emitted = [];
  const applied = [];
  const gm = createGatheringBlindStartWriter({
    isActiveGM: () => true,
    emitStart: (payload) => emitted.push(payload),
    applyStart: (payload) => applied.push(payload),
  });
  assert.equal(gm.start({ environmentId: 'env-a', actorUuid: 'Actor.a' }), true);
  assert.equal(applied.length, 1, 'an emit never reaches the emitter, so the GM applies locally');
  assert.equal(emitted.length, 0);

  const player = createGatheringBlindStartWriter({
    isActiveGM: () => false,
    emitStart: (payload) => emitted.push(payload),
    applyStart: (payload) => applied.push(payload),
  });
  assert.equal(player.start({ environmentId: 'env-a', actorUuid: 'Actor.a' }), true);
  assert.equal(emitted.length, 1);
  assert.equal(applied.length, 1, 'the player client applies nothing itself');
});

test('with no active GM the writer reports the start as unroutable instead of emitting into the void', () => {
  const emitted = [];
  const unroutable = [];
  const writer = createGatheringBlindStartWriter({
    isActiveGM: () => false,
    hasActiveGM: () => false,
    onUnroutable: (payload) => unroutable.push(payload),
    emitStart: (payload) => emitted.push(payload),
    applyStart: () => {},
  });

  assert.equal(writer.start({ environmentId: 'env-a', actorUuid: 'Actor.a' }), false);
  assert.deepEqual(emitted, []);
  assert.equal(unroutable.length, 1);
});

test('an inbound start is applied only by the active GM, only for an attested sender', () => {
  const applied = [];
  const payload = {
    action: GATHERING_BLIND_START,
    environmentId: 'env-a',
    actorUuid: 'Actor.a',
  };
  const applyStart = (args) => applied.push(args);

  assert.equal(
    routeGatheringBlindStartMessage(payload, {
      isActiveGM: () => false,
      senderId: 'user-1',
      applyStart,
    }),
    false
  );
  assert.equal(
    routeGatheringBlindStartMessage(payload, {
      isActiveGM: () => true,
      senderId: '',
      applyStart,
    }),
    false,
    'an unauthenticated sender is refused fail-closed'
  );
  assert.deepEqual(applied, []);

  assert.equal(
    routeGatheringBlindStartMessage(payload, {
      isActiveGM: () => true,
      senderId: 'user-1',
      applyStart,
    }),
    true
  );
  assert.equal(
    applied[0].senderId,
    'user-1',
    'the attested sender is what the applier runs the attempt as'
  );
});

test('a flood of starts from one sender is throttled, and a refused message costs no budget', () => {
  const applied = [];
  const allowSender = createBlindStartRateLimiter({ now: () => 0 });
  const payload = {
    action: GATHERING_BLIND_START,
    environmentId: 'env-a',
    actorUuid: 'Actor.a',
  };
  const route = (senderId) =>
    routeGatheringBlindStartMessage(payload, {
      isActiveGM: () => true,
      senderId,
      allowSender,
      applyStart: (args) => applied.push(args),
    });

  for (let index = 0; index < BLIND_START_RATE_LIMIT; index += 1) {
    assert.equal(route('user-1'), true, `request ${index} should be allowed`);
  }
  assert.equal(route('user-1'), false, 'the sender is throttled past the limit');
  assert.equal(route('user-2'), true, 'the budget is per sender');
  assert.equal(applied.length, BLIND_START_RATE_LIMIT + 1);

  // A malformed message is rejected before the limiter, so it costs nothing.
  const spare = createBlindStartRateLimiter({ now: () => 0 });
  let spent = 0;
  routeGatheringBlindStartMessage(
    { action: GATHERING_BLIND_START },
    {
      isActiveGM: () => true,
      senderId: 'user-3',
      allowSender: (id) => {
        spent += 1;
        return spare(id);
      },
      applyStart: () => {},
    }
  );
  assert.equal(spent, 0);
});
