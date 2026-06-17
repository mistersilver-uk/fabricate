import test from 'node:test';
import assert from 'node:assert/strict';

import { GatheringHookPublisher } from '../src/systems/GatheringHookPublisher.js';
import { GATHERING_HOOKS } from '../src/config/hooks.js';
import { GatheringEngine } from '../src/systems/GatheringEngine.js';
import { GatheringRunManager } from '../src/systems/GatheringRunManager.js';

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

// Mirrors the real runtime shapes the engine hands the publisher: createdResults
// from normalizeRunItems ({actorUuid,itemUuid,quantity} — no componentId), and
// usedTools as tool-breakage plan entries (componentId, itemRef, mode, broken,
// evidence). componentId for gathered items is recovered from checkResult.items.
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
    createdResults: [{ actorUuid: 'Actor.actor-1', itemUuid: 'Item.x', quantity: 2 }],
    usedTools: [
      {
        componentId: 'pick',
        itemRef: { actorUuid: 'Actor.actor-1', itemUuid: 'Item.tool', quantity: 1 },
        mode: 'consume',
        broken: true,
        evidence: { roll: 5, threshold: 10 },
      },
    ],
    checkResult: {
      provider: 'd100',
      items: [{ itemUuid: 'Item.x', componentId: 'comp-1', quantity: 2 }],
      events: [{ id: 'evt-1', name: 'Wolf Pack', risk: 'high' }],
    },
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
  assert.equal(payload.events.length, 1);
});

test('normalizes gathered items, recovering componentId from checkResult.items', () => {
  const hooks = recordingHooks();
  const publisher = new GatheringHookPublisher({ hooks });

  publisher.publishAttemptCompleted(baseArgs());

  assert.deepEqual(completionOf(hooks).gatheredItems, [
    { actorUuid: 'Actor.actor-1', itemUuid: 'Item.x', componentId: 'comp-1', quantity: 2 },
  ]);
});

test('prefers a componentId already present on the created result', () => {
  const hooks = recordingHooks();
  const publisher = new GatheringHookPublisher({ hooks });

  publisher.publishAttemptCompleted(
    baseArgs({
      createdResults: [
        { actorUuid: 'Actor.actor-1', itemUuid: 'Item.y', componentId: 'comp-own', quantity: 1 },
      ],
      checkResult: { events: [] },
    })
  );

  assert.equal(completionOf(hooks).gatheredItems[0].componentId, 'comp-own');
});

test('projects used tools to a public shape, dropping breakage internals', () => {
  const hooks = recordingHooks();
  const publisher = new GatheringHookPublisher({ hooks });

  publisher.publishAttemptCompleted(baseArgs());

  // mode / evidence / itemRef must NOT leak to subscribers.
  assert.deepEqual(completionOf(hooks).usedTools, [
    { componentId: 'pick', actorUuid: 'Actor.actor-1', itemUuid: 'Item.tool', quantity: 1, broken: true },
  ]);
});

test('marks failure status and timed origin, and still surfaces tool breakage', () => {
  const hooks = recordingHooks();
  const publisher = new GatheringHookPublisher({ hooks });

  publisher.publishAttemptCompleted(
    baseArgs({ status: 'failed', run: { id: 'run-2', status: 'failed' }, initiatedBy: 'timed' })
  );

  const payload = completionOf(hooks);
  assert.equal(payload.status, 'failed');
  assert.equal(payload.runStatus, 'failed');
  assert.equal(payload.initiatedBy, 'timed');
  assert.equal(payload.usedTools[0].broken, true);
});

test('degrades missing run fields to null', () => {
  const hooks = recordingHooks();
  const publisher = new GatheringHookPublisher({ hooks });

  publisher.publishAttemptCompleted(baseArgs({ run: { id: 'run-3', status: 'succeeded' } }));

  const payload = completionOf(hooks);
  assert.equal(payload.userId, null);
  assert.equal(payload.riskLevel, null);
  assert.equal(payload.conditions, null);
});

test('tolerates an absent checkResult', () => {
  const hooks = recordingHooks();
  const publisher = new GatheringHookPublisher({ hooks });

  publisher.publishAttemptCompleted(baseArgs({ checkResult: undefined }));

  const payload = completionOf(hooks);
  assert.deepEqual(payload.events, []);
  assert.equal(payload.checkResult, null);
  assert.equal(hooks.calls.filter((c) => c.name === GATHERING_HOOKS.EVENT_TRIGGERED).length, 0);
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

test('redacts all detail (including checkResult) and skips event hooks for an opaque blind viewer', () => {
  const hooks = recordingHooks();
  const publisher = new GatheringHookPublisher({ hooks });

  publisher.publishAttemptCompleted(baseArgs({ opaqueBlind: true }));

  const payload = completionOf(hooks);
  assert.equal(payload.taskId, null);
  assert.equal(payload.taskName, null);
  assert.equal(payload.gatheredItems, undefined);
  assert.equal(payload.usedTools, undefined);
  assert.equal(payload.events, undefined);
  // The leak class: checkResult carries items/events and must NOT pass through.
  assert.equal(payload.checkResult, undefined);
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

test('swallows a payload that cannot be cloned', () => {
  const hooks = recordingHooks();
  const publisher = new GatheringHookPublisher({ hooks });

  // A function is not structured-cloneable — building the payload would throw.
  assert.doesNotThrow(() =>
    publisher.publishAttemptCompleted(baseArgs({ checkResult: { events: [], notClonable: () => {} } }))
  );
});

test('is a no-op when no hooks object is available', () => {
  const publisher = new GatheringHookPublisher({ hooks: null });
  assert.doesNotThrow(() => publisher.publishAttemptCompleted(baseArgs()));
});

test('GatheringEngine._terminalStart drives the publisher with opaqueBlind + initiatedBy', async () => {
  const published = [];
  const engine = new GatheringEngine({
    hookPublisher: { publishAttemptCompleted: (args) => published.push(args) },
    // Allow the timed branch below to publish (the default GM check is false in tests).
    isPrimaryGM: () => true,
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

test('GatheringEngine._terminalStart does not redact for a GM viewer of a blind task', async () => {
  const published = [];
  const engine = new GatheringEngine({
    hookPublisher: { publishAttemptCompleted: (args) => published.push(args) },
  });

  await engine._terminalStart({
    viewer: gmViewer,
    actor,
    system,
    environment: { ...environment, selectionMode: 'blind' },
    task,
    status: 'succeeded',
    run: { id: 'run-1', status: 'succeeded' },
    createdResults: [],
    usedTools: [],
    checkResult: { events: [] },
  });

  assert.equal(published.length, 1);
  assert.equal(published[0].opaqueBlind, false);
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

// --- Real timed path through processWorldTime -------------------------------

class FakeActor {
  id = 'actor-1';
  uuid = 'Actor.actor-1';
  name = 'Gatherer';
  flags = { fabricate: {} };

  getFlag(namespace, key) {
    return this.flags?.[namespace]?.[key];
  }

  async setFlag(namespace, key, value) {
    this.flags[namespace] = this.flags[namespace] || {};
    this.flags[namespace][key] = structuredClone(value);
    return value;
  }
}

function timedEnvironment() {
  return {
    id: 'env-a',
    craftingSystemId: 'system-a',
    name: 'Old Mine',
    enabled: true,
    selectionMode: 'targeted',
    sceneUuid: null,
    tasks: [
      {
        id: 'task-a',
        name: 'Gather Iron',
        enabled: true,
        resolutionMode: 'routed',
        toolIds: [],
        timeRequirement: { minutes: 1 },
        resultGroups: [
          { id: 'group-a', name: 'Iron', results: [{ id: 'r-a', componentId: 'comp-a', quantity: 2 }] },
        ],
        resultSelection: { provider: 'macroOutcome', macroUuid: 'Macro.outcome' },
      },
    ],
  };
}

function makeTimedEngine({ timedActor, runManager, hookPublisher, isPrimaryGM }) {
  const environments = [timedEnvironment()];
  const systems = [
    { id: 'system-a', enabled: true, features: { gathering: true }, components: [{ id: 'comp-a' }] },
  ];
  return new GatheringEngine({
    environmentStore: {
      list: () => environments,
      get: (id) => environments.find((e) => e.id === id) ?? null,
    },
    runManager,
    getSystems: () => systems,
    getSelectableActors: () => [timedActor],
    isActorSelectable: ({ actor: c }) => c?.id === timedActor.id || c?.uuid === timedActor.uuid,
    isGamePaused: () => false,
    isPrimaryGM,
    hookPublisher,
    evaluator: {
      evaluateVisibility: async () => ({ visible: true, reasonCode: 'VISIBLE', diagnostic: null }),
      evaluateCheck: async () => ({ success: null, status: null, value: 10, diagnostic: null }),
    },
    sceneAccess: { canAttempt: () => ({ allowed: true }) },
    toolAvailability: { check: () => ({ available: true, missing: [], failedRequirements: [] }) },
    resultResolver: {
      resolveRouted: async (payload) => ({
        status: 'succeeded',
        resultGroups: [payload.task.resultGroups[0]],
        checkResult: { outcome: payload.task.resultGroups[0].name, provider: payload.provider },
      }),
    },
    resultCreator: {
      plan: async () => [{ actorUuid: timedActor.uuid, itemUuid: 'Item.iron', quantity: 2 }],
      create: async () => [{ actorUuid: timedActor.uuid, itemUuid: 'Item.iron', quantity: 2 }],
    },
    toolBreakage: { plan: async () => [], apply: async () => [] },
    failureFeedback: { apply: async () => ({ delivered: true }) },
    localize: (key) => key,
  });
}

// Build a matured timed-run scenario and run it through the real
// `processWorldTime` path, returning the recorded hooks and the result.
async function runMaturedTimedAttempt({ isPrimaryGM }) {
  const timedActor = new FakeActor();
  const state = { worldTime: 1000 };
  const runManager = new GatheringRunManager({
    randomID: () => 'run-1',
    nowWorldTime: () => state.worldTime,
    getUserId: () => 'user-1',
    getActors: () => [timedActor],
  });
  await runManager.createWaitingRun(
    timedActor,
    { craftingSystemId: 'system-a', environmentId: 'env-a', taskId: 'task-a' },
    { minutes: 1 }
  );
  state.worldTime = 1060;

  const hooks = recordingHooks();
  const engine = makeTimedEngine({
    timedActor,
    runManager,
    hookPublisher: new GatheringHookPublisher({ hooks, nowWorldTime: () => state.worldTime }),
    isPrimaryGM,
  });

  const result = await engine.processWorldTime(state.worldTime);
  return { hooks, result };
}

test('processWorldTime publishes the completion hook with initiatedBy: timed on the primary GM', async () => {
  const { hooks, result } = await runMaturedTimedAttempt({ isPrimaryGM: () => true });

  assert.equal(result.completed.length, 1);
  const payload = completionOf(hooks);
  assert.ok(payload, 'attemptCompleted fired from the real timed path');
  assert.equal(payload.initiatedBy, 'timed');
  assert.equal(payload.status, 'succeeded');
  assert.deepEqual(payload.gatheredItems, [
    { actorUuid: 'Actor.actor-1', itemUuid: 'Item.iron', componentId: null, quantity: 2 },
  ]);
});

test('processWorldTime does not publish a timed completion on a non-primary-GM client', async () => {
  const { hooks, result } = await runMaturedTimedAttempt({ isPrimaryGM: () => false });

  assert.equal(result.completed.length, 1, 'the run still completes on this client');
  assert.equal(completionOf(hooks), undefined, 'but no public hook is published');
});
