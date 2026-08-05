/**
 * Issue 901 — a blind gathering run's identity must not be persisted on the
 * player-readable, player-WRITABLE actor flag.
 *
 * The boundary these tests pin is INTEGRITY, not confidentiality: Foundry has no
 * server-side read authorization, so a determined player can still read world
 * state from a console. What they must not be able to do is forge it. Each of the
 * four binding decisions gets its own test:
 *
 *   1. one active blind run per blind environment
 *   2. the GM sees the resolved task, marked as a secret preview
 *   3. blind runs resolve against a START-TIME snapshot
 *   4. resource nodes are RESERVED at start
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { SETTING_KEYS } from '../src/config/settings.js';
import { RunJournalBuilder } from '../src/systems/RunJournalBuilder.js';

import {
  BLIND_ENVIRONMENT_ID,
  BLIND_GM,
  BLIND_PLAYER,
  BLIND_SYSTEM_ID,
  blindLibraryTask,
  makeBlindWorld,
} from './helpers/gathering-blind-runs.js';

const BLIND_MARKER = `blind:${BLIND_ENVIRONMENT_ID}`;

function libraryTasks(world) {
  return world.settings.get(SETTING_KEYS.GATHERING_CONFIG).systems[BLIND_SYSTEM_ID].tasks;
}

function journalBuilder(world, { blindSecret = true } = {}) {
  return new RunJournalBuilder({
    gatheringRunSource: world.runManager,
    getSystem: () => ({ id: BLIND_SYSTEM_ID, name: 'Blind System' }),
    getGatheringTask: (environmentId, taskId) =>
      libraryTasks(world).find((task) => task.id === taskId) ?? null,
    getGatheringBlindSecret: blindSecret ? (runId) => world.blindStore.get(runId) : null,
    localize: (key) => key,
    nowWorldTime: () => world.clock.worldTime,
  });
}

test('a blind waiting run persists no task identity, no runtime snapshot, and the environment risk', async () => {
  const world = makeBlindWorld({
    tasks: [blindLibraryTask({ id: 'task-silver', name: 'Silver Vein' })],
  });

  const result = await world.start();
  assert.equal(result.accepted, true, 'the blind attempt should start');

  const run = world.activeRun();
  // The player-readable flag: a marker, not the drawn task.
  assert.equal(run.taskId, BLIND_MARKER);
  assert.equal(
    run.economyEvidence.runtimeSnapshot,
    undefined,
    'the runtime snapshot embeds the whole task and must not reach the actor flag'
  );
  assert.equal(
    JSON.stringify(run).includes('task-silver'),
    false,
    'no part of the persisted run may name the drawn task'
  );
  assert.equal(
    JSON.stringify(run).includes('Silver Vein'),
    false,
    'no part of the persisted run may name the drawn task'
  );
  // The environment's risk, not the task's `riskOverride`, which would fingerprint it.
  assert.equal(run.riskLevel, 'safe');
});

test('the drawn task and its start-time snapshot are recorded in the GM-owned world setting', async () => {
  const world = makeBlindWorld();

  await world.start();

  const records = world.blindRecords();
  const record = records[world.activeRun().id];
  assert.ok(record, 'the blind run should have a secret record keyed by its run id');
  assert.equal(record.taskId, 'task-silver');
  assert.equal(record.snapshot.task.id, 'task-silver', 'the snapshot is taken at START');
  assert.deepEqual(record.reservation, {
    environmentId: BLIND_ENVIRONMENT_ID,
    taskId: 'task-silver',
    units: 1,
    scope: 'environment',
  });
});

// Decision 3 — the task is chosen up front and the run resolves against the
// environment as it was then, not as it stands at maturity.
test('a matured blind run resolves against its start-time snapshot even after the task is deleted', async () => {
  const world = makeBlindWorld();
  await world.start();

  // The GM deletes the task mid-run. Without a start-time snapshot the run has
  // nothing left to resolve against and would be cancelled.
  libraryTasks(world).length = 0;

  const matured = await world.mature();

  assert.equal(matured.completed.length, 1, 'the run should still complete');
  assert.equal(matured.cancelled.length, 0);
  assert.equal(world.runManager.getRunHistory(world.actor)[0].status, 'succeeded');
});

test('a blind run whose secret record is gone is cancelled rather than resolved against another task', async () => {
  const world = makeBlindWorld();
  await world.start();

  // Simulate the record being lost (a world rollback, a GM clearing the setting).
  world.settings.set(SETTING_KEYS.GATHERING_BLIND_RUNS, {});

  const matured = await world.mature();

  assert.equal(matured.cancelled.length, 1);
  assert.equal(world.runManager.getRunHistory(world.actor)[0].status, 'cancelled');
  assert.equal(world.nodePool('task-silver'), null, 'a cancelled run consumes no node');
});

// Decision 4 — the node is reserved at start, provisionally.
test('a blind start reserves a node without decrementing the real pool, and converts it at maturity', async () => {
  const world = makeBlindWorld({ tasks: [blindLibraryTask({ nodeMax: 2 })] });

  await world.start();
  assert.equal(
    world.nodePool('task-silver'),
    null,
    'the start must not write nodeRuntime — the claim is a reservation'
  );
  assert.equal(
    world.blindStore.reservedUnits({
      environmentId: BLIND_ENVIRONMENT_ID,
      taskId: 'task-silver',
    }),
    1
  );

  await world.mature();

  assert.equal(world.nodePool('task-silver').current, 1, 'maturity takes exactly one unit');
  assert.deepEqual(world.blindRecords(), {}, 'the reservation is released once converted');
});

test('outstanding reservations are counted against availability so a pool cannot be over-claimed', async () => {
  const world = makeBlindWorld({ tasks: [blindLibraryTask({ nodeMax: 1 })] });
  // A different party member already holds the only node in this pool.
  world.settings.set(SETTING_KEYS.GATHERING_BLIND_RUNS, {
    'run-other': {
      runId: 'run-other',
      actorUuid: 'Actor.other',
      environmentId: BLIND_ENVIRONMENT_ID,
      taskId: 'task-silver',
      reservation: {
        environmentId: BLIND_ENVIRONMENT_ID,
        taskId: 'task-silver',
        units: 1,
        scope: 'environment',
      },
    },
  });

  const result = await world.start();

  assert.equal(result.accepted, false);
  assert.equal(result.blockedReasons[0].code, 'BLIND_NO_CANDIDATE');
  assert.equal(world.activeRun(), null, 'no second run may claim the reserved node');
});

test('a cancelled blind run releases its reservation without the pool having moved', async () => {
  const world = makeBlindWorld({ tasks: [blindLibraryTask({ nodeMax: 1 })] });
  await world.start();
  assert.equal(
    world.blindStore.reservedUnits({
      environmentId: BLIND_ENVIRONMENT_ID,
      taskId: 'task-silver',
    }),
    1
  );

  // The environment disappears before the run matures.
  world.deleteEnvironment();
  const matured = await world.mature();

  assert.equal(matured.cancelled.length, 1);
  assert.deepEqual(world.blindRecords(), {}, 'the reservation is released');
  assert.equal(world.nodePool('task-silver'), null, 'and the real pool never moved');
});

// Decision 1 — one active blind run per blind environment.
test('a second blind attempt in the same environment is a duplicate, but another blind environment is not', async () => {
  const world = makeBlindWorld({
    tasks: [blindLibraryTask({ nodeMax: null })],
    environmentIds: [BLIND_ENVIRONMENT_ID, 'env-blind-2'],
  });

  const first = await world.start();
  assert.equal(first.accepted, true);

  const duplicate = await world.start();
  assert.equal(duplicate.accepted, false);
  assert.equal(duplicate.blockedReasons[0].code, 'DUPLICATE_ACTIVE_RUN');
  assert.equal(duplicate.taskId, null, 'the duplicate reason names no task');

  const elsewhere = await world.start({ environmentId: 'env-blind-2' });
  assert.equal(elsewhere.accepted, true, 'a different blind environment is a different search');
  assert.equal(world.runManager.getActiveRuns(world.actor).length, 2);
});

// Decision 2 — the GM must see the resolved task, marked as secret.
test('the GM listing previews the real task behind a blind run and the player listing does not', async () => {
  const world = makeBlindWorld();
  await world.start();

  const gmListing = await world.engine.listForActor({ viewer: BLIND_GM, actor: world.actor });
  const gmRun = gmListing.activeRuns[0];
  assert.equal(gmRun.blindSecretPreview, true, 'marked as a secret preview');
  assert.equal(gmRun.taskId, 'task-silver');
  assert.equal(gmRun.label, 'Silver Vein');

  const playerListing = await world.engine.listForActor({
    viewer: BLIND_PLAYER,
    actor: world.actor,
  });
  const playerRun = playerListing.activeRuns[0];
  assert.equal(playerRun.blindSecretPreview, undefined);
  assert.equal(playerRun.taskId, null);
  assert.equal(playerRun.blind, true);
  assert.equal(
    JSON.stringify(playerRun).includes('Silver Vein'),
    false,
    'the player listing never names the drawn task'
  );
});

test('the GM journal previews the real task behind a blind run and the player journal shows the blind label', async () => {
  const world = makeBlindWorld();
  await world.start();
  const builder = journalBuilder(world);

  const gmRun = builder.buildListing({ actor: world.actor, viewer: BLIND_GM }).activeRuns[0];
  assert.equal(gmRun.names.title, 'Silver Vein');
  assert.equal(gmRun.blindSecretPreview, true);

  const playerRun = builder.buildListing({ actor: world.actor, viewer: BLIND_PLAYER })
    .activeRuns[0];
  assert.equal(playerRun.names.title, 'FABRICATE.Gathering.BlindTaskLabel');
  assert.equal(playerRun.blindSecretPreview, false);
  assert.equal(
    JSON.stringify(playerRun).includes('Silver Vein'),
    false,
    'the player journal never names the drawn task'
  );
});

// The relay — a player may not write the world setting, so the GM draws.
test('a player client routes a blind timed start to the active GM instead of drawing locally', async () => {
  const relayed = [];
  const world = makeBlindWorld({
    isActiveGM: () => false,
    relayStart: (payload) => {
      relayed.push(payload);
      return true;
    },
  });

  const result = await world.start();

  assert.equal(result.state, 'relayed');
  assert.equal(result.accepted, true);
  assert.equal(result.runId, null);
  assert.equal(world.activeRun(), null, 'the player client creates nothing itself');
  assert.deepEqual(world.blindRecords(), {}, 'and writes no secret state');
  assert.deepEqual(relayed, [
    {
      environmentId: BLIND_ENVIRONMENT_ID,
      actorUuid: 'Actor.actor-blind',
      taskId: null,
      interactableRef: null,
    },
  ]);
});

test('an unroutable blind start is reported as blocked rather than silently dropped', async () => {
  const world = makeBlindWorld({ isActiveGM: () => false, relayStart: () => false });

  const result = await world.start();

  assert.equal(result.accepted, false);
  assert.equal(result.blockedReasons[0].code, 'RUN_CREATION_FAILED');
  assert.equal(world.activeRun(), null);
});

test('a blind environment with no timed task is resolved locally and is not routed', async () => {
  const relayed = [];
  const world = makeBlindWorld({
    tasks: [blindLibraryTask({ minutes: null, nodeMax: null })],
    isActiveGM: () => false,
    relayStart: (payload) => {
      relayed.push(payload);
      return true;
    },
  });

  const result = await world.start();

  assert.deepEqual(relayed, [], 'an immediate attempt persists no in-flight state to protect');
  assert.notEqual(result.state, 'relayed');
});

// Back-compat — runs written before this change carry their own identity.
test('a waiting run written before this change resolves from its own task id and snapshot', async () => {
  const world = makeBlindWorld();
  // The node this run already consumed when it was started under the old code:
  // an `onStart` task decrements the pool up front.
  world.seedNodeRuntime('task-silver', {
    enabled: true,
    max: 2,
    current: 1,
    depletionTiming: 'onStart',
    respawn: { policy: 'manual' },
  });
  const task = world.composedTask('task-silver');
  // The pre-901 shape: the real task id on the flag plus its own runtime snapshot,
  // and no blind-store record at all.
  await world.runManager.createWaitingRun(
    world.actor,
    {
      craftingSystemId: BLIND_SYSTEM_ID,
      environmentId: BLIND_ENVIRONMENT_ID,
      taskId: task.id,
      economyEvidence: { runtimeSnapshot: { task } },
    },
    { minutes: 1 }
  );
  assert.deepEqual(world.blindRecords(), {});

  const matured = await world.mature();

  assert.equal(matured.completed.length, 1);
  assert.equal(world.runManager.getRunHistory(world.actor)[0].status, 'succeeded');
  // And it is NOT charged a second node: a legacy run consumed its unit at start,
  // so maturity must still run as the second of two commits, not as a blind run's
  // single reservation-converting commit.
  assert.equal(world.nodePool('task-silver').current, 1);
});
