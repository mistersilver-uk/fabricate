import test from 'node:test';
import assert from 'node:assert/strict';

import { GatheringHookPublisher } from '../src/systems/GatheringHookPublisher.js';
import { GATHERING_HOOKS } from '../src/config/hooks.js';
import { GatheringEngine } from '../src/systems/GatheringEngine.js';

function recordingHooks() {
  const calls = [];
  return {
    calls,
    callAll: (name, payload) => calls.push({ name, payload }),
  };
}

const actor = { id: 'actor-1', uuid: 'Actor.actor-1', name: 'Gatherer', items: [] };
const gmViewer = { id: 'gm-1', isGM: true };
const playerViewer = { id: 'user-1', isGM: false };
const system = { id: 'system-a', name: 'Alchemy', features: {} };
const environment = { id: 'env-1', name: 'Whispering Woods', selectionMode: 'targeted' };
const task = { id: 'task-1', name: 'Harvest Moonpetal' };

function baseArgs(overrides = {}) {
  return {
    viewer: gmViewer,
    actor,
    system,
    environment,
    task,
    status: 'succeeded',
    run: {
      id: 'run-1',
      status: 'succeeded',
      userId: 'user-1',
      riskLevel: 'moderate',
      conditionSnapshot: { weather: 'rain', timeOfDay: 'dawn' },
    },
    createdResults: [{ actorUuid: 'Actor.actor-1', itemUuid: 'Item.x', componentId: 'comp-1', quantity: 2 }],
    usedTools: [{ actorUuid: 'Actor.actor-1', itemUuid: 'Item.tool', quantity: 1, broken: true }],
    checkResult: { provider: 'd100', events: [{ id: 'evt-1', name: 'Wolf Pack', risk: 'high' }] },
    ...overrides,
  };
}

function completionOf(hooks) {
  return hooks.calls.find((c) => c.name === GATHERING_HOOKS.ATTEMPT_COMPLETED)?.payload;
}

test('publishes a completion hook with embedded gathering data on success', () => {
  const hooks = recordingHooks();
  const publisher = new GatheringHookPublisher({ hooks, nowWorldTime: () => 1234 });

  publisher.publishAttemptCompleted(baseArgs());

  const payload = completionOf(hooks);
  assert.ok(payload, 'completion hook fired');
  assert.equal(payload.hook, GATHERING_HOOKS.ATTEMPT_COMPLETED);
  assert.equal(payload.schemaVersion, 1);
  assert.equal(payload.status, 'succeeded');
  assert.equal(payload.initiatedBy, 'immediate');
  assert.equal(payload.worldTime, 1234);
  assert.equal(payload.userId, 'user-1');
  assert.equal(payload.actorUuid, 'Actor.actor-1');
  assert.equal(payload.actorName, 'Gatherer');
  assert.equal(payload.craftingSystemId, 'system-a');
  assert.equal(payload.environmentId, 'env-1');
  assert.equal(payload.taskId, 'task-1');
  assert.equal(payload.taskName, 'Harvest Moonpetal');
  assert.equal(payload.runId, 'run-1');
  assert.equal(payload.riskLevel, 'moderate');
  assert.deepEqual(payload.conditions, { weather: 'rain', timeOfDay: 'dawn' });
  assert.deepEqual(payload.gatheredItems, [
    { actorUuid: 'Actor.actor-1', itemUuid: 'Item.x', componentId: 'comp-1', quantity: 2 },
  ]);
  assert.deepEqual(payload.usedTools, [
    { actorUuid: 'Actor.actor-1', itemUuid: 'Item.tool', quantity: 1, broken: true },
  ]);
  assert.equal(payload.events.length, 1);
});

test('marks failure status and timed origin', () => {
  const hooks = recordingHooks();
  const publisher = new GatheringHookPublisher({ hooks });

  publisher.publishAttemptCompleted(
    baseArgs({ status: 'failed', run: { id: 'run-2', status: 'failed' }, initiatedBy: 'timed' })
  );

  const payload = completionOf(hooks);
  assert.equal(payload.status, 'failed');
  assert.equal(payload.runStatus, 'failed');
  assert.equal(payload.initiatedBy, 'timed');
});

test('emits one event hook per triggered encounter, with attempt context', () => {
  const hooks = recordingHooks();
  const publisher = new GatheringHookPublisher({ hooks });

  publisher.publishAttemptCompleted(
    baseArgs({
      checkResult: {
        events: [
          { id: 'evt-1', name: 'Wolf Pack' },
          { id: 'evt-2', name: 'Rockslide' },
        ],
      },
    })
  );

  const eventCalls = hooks.calls.filter((c) => c.name === GATHERING_HOOKS.EVENT_TRIGGERED);
  assert.equal(eventCalls.length, 2);
  assert.equal(eventCalls[0].payload.event.id, 'evt-1');
  assert.equal(eventCalls[0].payload.actorUuid, 'Actor.actor-1');
  assert.equal(eventCalls[0].payload.taskId, 'task-1');
  assert.equal(eventCalls[0].payload.runId, 'run-1');
  assert.equal(eventCalls[1].payload.event.id, 'evt-2');
});

test('redacts detail and skips event hooks for an opaque blind viewer', () => {
  const hooks = recordingHooks();
  const publisher = new GatheringHookPublisher({ hooks });

  publisher.publishAttemptCompleted(baseArgs({ opaqueBlind: true }));

  const payload = completionOf(hooks);
  assert.equal(payload.taskId, null);
  assert.equal(payload.taskName, null);
  assert.equal(payload.gatheredItems, undefined);
  assert.equal(payload.usedTools, undefined);
  assert.equal(payload.events, undefined);
  assert.equal(hooks.calls.filter((c) => c.name === GATHERING_HOOKS.EVENT_TRIGGERED).length, 0);
});

test('payload is a serializable clone decoupled from source objects', () => {
  const hooks = recordingHooks();
  const publisher = new GatheringHookPublisher({ hooks });
  const args = baseArgs();

  publisher.publishAttemptCompleted(args);
  args.checkResult.events[0].name = 'MUTATED';

  const payload = completionOf(hooks);
  assert.equal(payload.events[0].name, 'Wolf Pack');
  assert.doesNotThrow(() => JSON.stringify(payload));
});

test('swallows a throwing subscriber', () => {
  const hooks = {
    callAll: () => {
      throw new Error('subscriber blew up');
    },
  };
  const publisher = new GatheringHookPublisher({ hooks });
  assert.doesNotThrow(() => publisher.publishAttemptCompleted(baseArgs()));
});

test('is a no-op when no hooks object is available', () => {
  const publisher = new GatheringHookPublisher({ hooks: null });
  assert.doesNotThrow(() => publisher.publishAttemptCompleted(baseArgs()));
});

test('GatheringEngine._terminalStart drives the publisher with opaqueBlind + initiatedBy', async () => {
  const published = [];
  const engine = new GatheringEngine({
    hookPublisher: {
      publishAttemptCompleted: (args) => published.push(args),
    },
  });

  await engine._terminalStart({
    viewer: gmViewer,
    actor,
    system,
    environment,
    task,
    status: 'succeeded',
    run: { id: 'run-1', status: 'succeeded' },
    createdResults: [],
    usedTools: [],
    checkResult: { events: [] },
  });

  assert.equal(published.length, 1);
  assert.equal(published[0].initiatedBy, 'immediate');
  assert.equal(published[0].opaqueBlind, false);

  // Blind environment + non-GM viewer ⇒ opaque blind redaction signalled to publisher.
  published.length = 0;
  await engine._terminalStart({
    viewer: playerViewer,
    actor,
    system,
    environment: { ...environment, selectionMode: 'blind' },
    task,
    status: 'failed',
    run: { id: 'run-2', status: 'failed' },
    createdResults: [],
    usedTools: [],
    checkResult: { events: [] },
    initiatedBy: 'timed',
  });

  assert.equal(published.length, 1);
  assert.equal(published[0].opaqueBlind, true);
  assert.equal(published[0].initiatedBy, 'timed');
});

test('GatheringEngine._terminalStart is a no-op without a publisher', async () => {
  const engine = new GatheringEngine({});
  await assert.doesNotReject(
    engine._terminalStart({
      viewer: gmViewer,
      actor,
      system,
      environment,
      task,
      status: 'succeeded',
      run: { id: 'run-1', status: 'succeeded' },
      createdResults: [],
      usedTools: [],
      checkResult: { events: [] },
    })
  );
});
