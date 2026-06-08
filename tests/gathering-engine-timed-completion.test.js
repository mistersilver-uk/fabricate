import test from 'node:test';
import assert from 'node:assert/strict';

import { GatheringEngine } from '../src/systems/GatheringEngine.js';
import { GatheringRunManager } from '../src/systems/GatheringRunManager.js';

const viewer = { id: 'user-1', isGM: false };

class FakeActor {
  constructor({ id = 'actor-1', uuid = 'Actor.actor-1', name = 'Gatherer' } = {}) {
    this.id = id;
    this.uuid = uuid;
    this.name = name;
    this.flags = { fabricate: {} };
  }

  getFlag(namespace, key) {
    return this.flags?.[namespace]?.[key];
  }

  async setFlag(namespace, key, value) {
    this.flags[namespace] = this.flags[namespace] || {};
    this.flags[namespace][key] = JSON.parse(JSON.stringify(value));
    return value;
  }
}

const actor = new FakeActor();

function resetActor() {
  actor.flags = { fabricate: {} };
  return actor;
}

function makeRunManager({ actors = [actor], now = () => 1000, ids = ['run-1'] } = {}) {
  let id = 0;
  return new GatheringRunManager({
    randomID: () => ids[id++] ?? `run-${id}`,
    nowWorldTime: now,
    getUserId: () => viewer.id,
    getActors: () => actors
  });
}

function timedTask(overrides = {}) {
  return {
    id: 'task-a',
    name: 'Gather Iron',
    enabled: true,
    resolutionMode: 'routed',
    toolIds: [],
    timeRequirement: { minutes: 1 },
    resultGroups: [{
      id: 'group-a',
      name: 'Iron',
      results: [{ id: 'result-a', componentId: 'comp-a', quantity: 2 }]
    }],
    resultSelection: { provider: 'macroOutcome', macroUuid: 'Macro.outcome' },
    ...overrides
  };
}

const LIBRARY_TOOLS = [
  { id: 'tool-pick', componentId: 'pick', enabled: true },
  { id: 'tool-sickle', componentId: 'silver-sickle', enabled: true }
];

function environment(task = timedTask(), overrides = {}) {
  const env = {
    id: 'env-a',
    craftingSystemId: 'system-a',
    name: 'Old Mine',
    enabled: true,
    selectionMode: 'targeted',
    sceneUuid: null,
    tasks: [task],
    ...overrides
  };
  Object.defineProperty(env, '__libraryTools', {
    value: new Map(LIBRARY_TOOLS.map(t => [t.id, t])),
    enumerable: false,
    configurable: true
  });
  return env;
}

function system(overrides = {}) {
  return {
    id: 'system-a',
    enabled: true,
    features: { gathering: true },
    components: [{ id: 'comp-a', difficulty: 1 }],
    ...overrides
  };
}

function makeEngine({
  runManager,
  actingActor = actor,
  environments = [environment()],
  systems = [system()],
  routedOutcome = null,
  createdResults = [],
  usedTools = [],
  calls = {},
  getRunViewer = null
} = {}) {
  calls.resolveRouted = [];
  calls.evaluateCheck = [];
  calls.planResults = [];
  calls.createResults = [];
  calls.planTools = [];
  calls.applyTools = [];
  calls.failureFeedback = [];

  return new GatheringEngine({
    environmentStore: {
      list: () => environments,
      get: (environmentId) => environments.find(entry => entry.id === environmentId) ?? null
    },
    runManager,
    getSystems: () => systems,
    getSelectableActors: () => [actingActor],
    isActorSelectable: ({ actor: candidate }) => candidate?.id === actingActor.id || candidate?.uuid === actingActor.uuid,
    isGamePaused: () => false,
    getRunViewer,
    evaluator: {
      evaluateVisibility: async () => ({ visible: true, reasonCode: 'VISIBLE', diagnostic: null }),
      evaluateCheck: async (payload) => {
        calls.evaluateCheck.push(payload);
        return { success: null, status: null, value: 10, reasonCode: 'CHECK_VALUE', diagnostic: null };
      }
    },
    sceneAccess: { canAttempt: () => ({ allowed: true }) },
    toolAvailability: { check: () => ({ available: true, missing: [], failedRequirements: [] }) },
    resultResolver: {
      resolveRouted: async (payload) => {
        calls.resolveRouted.push(payload);
        return routedOutcome ?? {
          status: 'succeeded',
          resultGroups: [payload.task.resultGroups[0]],
          checkResult: { outcome: payload.task.resultGroups[0].name, provider: payload.provider }
        };
      },
      resolveProgressive: async (payload) => ({
        status: 'succeeded',
        resultGroups: [payload.task.resultGroups[0]],
        checkResult: payload.checkResult
      })
    },
    resultCreator: {
      plan: async (payload) => {
        calls.planResults.push(payload);
        return createdResults;
      },
      create: async (payload) => {
        calls.createResults.push(payload);
        return createdResults;
      }
    },
    toolBreakage: {
      plan: async (payload) => {
        calls.planTools.push(payload);
        return usedTools;
      },
      apply: async (payload) => {
        calls.applyTools.push(payload);
        return usedTools;
      }
    },
    failureFeedback: {
      apply: async (payload) => {
        calls.failureFeedback.push(payload);
        return { delivered: true };
      }
    },
    localize: (key, data) => data ? `${key}:${JSON.stringify(data)}` : key
  });
}

async function createWaitingRun(runManager, runActor = actor, data = {}) {
  return runManager.createWaitingRun(runActor, {
    craftingSystemId: 'system-a',
    environmentId: 'env-a',
    taskId: 'task-a',
    ...data
  }, { minutes: 1 });
}

test('processWorldTime completes matured waitingTime run as succeeded and moves active to history', async () => {
  resetActor();
  let worldTime = 1000;
  const runManager = makeRunManager({ now: () => worldTime });
  const createdResults = [{ actorUuid: actor.uuid, itemUuid: 'Item.iron', quantity: 2 }];
  await createWaitingRun(runManager);
  worldTime = 1060;
  const calls = {};
  const engine = makeEngine({ runManager, createdResults, calls });

  const result = await engine.processWorldTime(worldTime);

  assert.equal(result.completed.length, 1);
  assert.equal(result.completed[0].state, 'succeeded');
  assert.deepEqual(runManager.getActiveRuns(actor), []);
  const history = runManager.getRunHistory(actor);
  assert.equal(history.length, 1);
  assert.equal(history[0].status, 'succeeded');
  assert.deepEqual(history[0].createdResults, createdResults);
  assert.deepEqual(history[0].checkResult, { outcome: 'Iron', provider: 'macroOutcome' });
  assert.equal(calls.createResults.length, 1);
});

test('processWorldTime completes matured failure without results and applies feedback after history persistence', async () => {
  resetActor();
  let worldTime = 1000;
  const realRunManager = makeRunManager({ now: () => worldTime });
  await createWaitingRun(realRunManager);
  worldTime = 1060;
  const order = [];
  const runManager = {
    getMaturedWaitingRuns: (...args) => realRunManager.getMaturedWaitingRuns(...args),
    completeRun: async (...args) => {
      order.push('completeRun');
      return realRunManager.completeRun(...args);
    },
    clearActiveRun: (...args) => realRunManager.clearActiveRun(...args),
    cancelRun: (...args) => realRunManager.cancelRun(...args)
  };
  const calls = {};
  const usedTools = [{ actorUuid: actor.uuid, itemUuid: 'Item.pick', quantity: 1 }];
  const task = timedTask({
    toolIds: ['tool-pick'],
    failureOutcome: { mode: 'text', text: 'The vein is exhausted.' }
  });
  const engine = makeEngine({
    runManager,
    environments: [environment(task)],
    routedOutcome: { status: 'failed', checkResult: { outcome: 'fail', provider: 'macroOutcome' } },
    usedTools,
    calls
  });

  const result = await engine.processWorldTime(worldTime);

  assert.equal(result.completed.length, 1);
  assert.equal(result.completed[0].state, 'failed');
  assert.deepEqual(realRunManager.getActiveRuns(actor), []);
  assert.equal(realRunManager.getRunHistory(actor)[0].status, 'failed');
  assert.deepEqual(realRunManager.getRunHistory(actor)[0].createdResults, []);
  assert.deepEqual(realRunManager.getRunHistory(actor)[0].usedTools, usedTools);
  assert.deepEqual(calls.createResults, []);
  assert.equal(calls.applyTools.length, 1);
  assert.equal(calls.applyTools[0].actor, actor);
  assert.equal(calls.failureFeedback.length, 1);
  assert.deepEqual(order, ['completeRun']);
});

test('processWorldTime ignores non-matured waitingTime runs', async () => {
  resetActor();
  let worldTime = 1000;
  const runManager = makeRunManager({ now: () => worldTime });
  await createWaitingRun(runManager);
  const calls = {};
  const engine = makeEngine({ runManager, calls });

  const result = await engine.processWorldTime(1059);

  assert.deepEqual(result.processed, []);
  assert.equal(runManager.getActiveRuns(actor).length, 1);
  assert.deepEqual(runManager.getRunHistory(actor), []);
  assert.deepEqual(calls.resolveRouted, []);
  assert.deepEqual(calls.createResults, []);
});

test('processWorldTime cancels matured runs whose references disappear before resume', async () => {
  resetActor();
  for (const missing of ['environment', 'task', 'system', 'actor']) {
    let worldTime = 1000;
    const runActor = new FakeActor({ id: `actor-${missing}`, uuid: `Actor.${missing}` });
    const runManager = makeRunManager({ actors: [runActor], now: () => worldTime });
    const run = await createWaitingRun(runManager, runActor);
    if (missing === 'actor') {
      runActor.flags.fabricate.gatheringRuns.active[run.id].actorUuid = 'Actor.missing';
      runManager.invalidateCache(runActor.uuid);
    }
    worldTime = 1060;
    const task = timedTask();
    const env = environment(task);
    const engine = makeEngine({
      runManager,
      actingActor: runActor,
      environments: missing === 'environment' ? [] : [missing === 'task' ? environment(timedTask({ id: 'other-task' })) : env],
      systems: missing === 'system' ? [] : [system()]
    });

    const result = await engine.processWorldTime(worldTime);

    assert.equal(result.cancelled.length, 1, missing);
    assert.equal(result.cancelled[0].runStatus, 'cancelled', missing);
    assert.deepEqual(runManager.getActiveRuns(runActor), [], missing);
    assert.equal(runManager.getRunHistory(runActor)[0].status, 'cancelled', missing);
  }
});

test('resume-time misconfiguration clears active run without history, results, tools, or feedback', async () => {
  resetActor();
  let worldTime = 1000;
  const runManager = makeRunManager({ now: () => worldTime });
  await createWaitingRun(runManager);
  worldTime = 1060;
  const invalidTask = timedTask({ resultSelection: { provider: 'macroOutcome' } });
  const calls = {};
  const engine = makeEngine({
    runManager,
    environments: [environment(invalidTask)],
    usedTools: [{ actorUuid: actor.uuid, itemUuid: 'Item.pick', quantity: 1 }],
    createdResults: [{ actorUuid: actor.uuid, itemUuid: 'Item.iron', quantity: 2 }],
    calls
  });

  const result = await engine.processWorldTime(worldTime);

  assert.equal(result.cleared.length, 1);
  assert.deepEqual(runManager.getActiveRuns(actor), []);
  assert.deepEqual(runManager.getRunHistory(actor), []);
  assert.deepEqual(calls.resolveRouted, []);
  assert.deepEqual(calls.createResults, []);
  assert.deepEqual(calls.applyTools, []);
  assert.deepEqual(calls.failureFeedback, []);
});

test('post-history timed side effects are blocked if completeRun persistence fails', async () => {
  resetActor();
  const run = {
    id: 'run-ready',
    actorUuid: actor.uuid,
    userId: viewer.id,
    craftingSystemId: 'system-a',
    environmentId: 'env-a',
    taskId: 'task-a',
    status: 'waitingTime',
    startedAtWorldTime: 1000,
    updatedAtWorldTime: 1000,
    timeGate: { requiredSeconds: 60, initiatedAt: 1000, availableAt: 1060 },
    usedTools: [],
    createdResults: []
  };
  const runManager = {
    getMaturedWaitingRuns: () => [{ actor, run }],
    completeRun: async () => {
      throw Object.assign(new Error('flag write failed'), { code: 'FLAG_WRITE_FAILED' });
    }
  };
  const calls = {};
  const engine = makeEngine({
    runManager,
    environments: [environment(timedTask({ toolIds: ['tool-pick'] }))],
    routedOutcome: { status: 'failed', checkResult: { outcome: 'fail' } },
    usedTools: [{ actorUuid: actor.uuid, itemUuid: 'Item.pick', quantity: 1 }],
    calls
  });

  const result = await engine.processWorldTime(1060);

  assert.equal(result.errors.length, 1);
  assert.deepEqual(calls.planTools.length, 1);
  assert.deepEqual(calls.createResults, []);
  assert.deepEqual(calls.applyTools, []);
  assert.deepEqual(calls.failureFeedback, []);
});

test('post-history timed side effects are blocked when completeRun returns null', async () => {
  resetActor();
  const run = {
    id: 'run-ready',
    actorUuid: actor.uuid,
    userId: viewer.id,
    craftingSystemId: 'system-a',
    environmentId: 'env-a',
    taskId: 'task-a',
    status: 'waitingTime',
    startedAtWorldTime: 1000,
    updatedAtWorldTime: 1000,
    timeGate: { requiredSeconds: 60, initiatedAt: 1000, availableAt: 1060 },
    usedTools: [],
    createdResults: []
  };
  const runManager = {
    getMaturedWaitingRuns: () => [{ actor, run }],
    completeRun: async () => null
  };
  const calls = {};
  const engine = makeEngine({
    runManager,
    environments: [environment(timedTask({ toolIds: ['tool-pick'] }))],
    createdResults: [{ actorUuid: actor.uuid, itemUuid: 'Item.iron', quantity: 2 }],
    usedTools: [{ actorUuid: actor.uuid, itemUuid: 'Item.pick', quantity: 1 }],
    calls
  });

  const result = await engine.processWorldTime(1060);

  assert.deepEqual(result.completed, []);
  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0].code, 'TERMINAL_HISTORY_NOT_WRITTEN');
  assert.equal(calls.planResults.length, 1);
  assert.equal(calls.planTools.length, 1);
  assert.deepEqual(calls.createResults, []);
  assert.deepEqual(calls.applyTools, []);
  assert.deepEqual(calls.failureFeedback, []);
});

test('fresh manual restart after resume-time misconfiguration repair is possible', async () => {
  resetActor();
  let worldTime = 1000;
  const runManager = makeRunManager({ now: () => worldTime, ids: ['stuck-run', 'fresh-run'] });
  await createWaitingRun(runManager);
  worldTime = 1060;
  const brokenTask = timedTask({ resultSelection: { provider: 'macroOutcome' } });
  const engine = makeEngine({ runManager, environments: [environment(brokenTask)] });
  await engine.processWorldTime(worldTime);
  assert.deepEqual(runManager.getActiveRuns(actor), []);

  const repairedTask = timedTask();
  const repairedEngine = makeEngine({ runManager, environments: [environment(repairedTask)] });
  const restarted = await repairedEngine.startAttempt({
    viewer,
    actor,
    environmentId: 'env-a',
    taskId: 'task-a'
  });

  assert.equal(restarted.accepted, true);
  assert.equal(restarted.state, 'waitingTime');
  assert.equal(restarted.runId, 'fresh-run');
  assert.equal(runManager.getActiveRuns(actor).length, 1);
});

test('non-GM blind missing-task timed cancellation history and result do not expose the original task', async () => {
  resetActor();
  let worldTime = 1000;
  const runManager = makeRunManager({ now: () => worldTime });
  const secretTask = timedTask({
    id: 'secret-task',
    name: 'Secret Mooncap Patch'
  });
  await createWaitingRun(runManager, actor, { taskId: secretTask.id });
  worldTime = 1060;
  const replacementTask = timedTask({
    id: 'replacement-task',
    name: 'Replacement Task'
  });
  const engine = makeEngine({
    runManager,
    environments: [environment(replacementTask, { selectionMode: 'blind' })]
  });

  const result = await engine.processWorldTime(worldTime);
  const history = runManager.getRunHistory(actor);
  const serializedResult = JSON.stringify(result);
  const serializedHistory = JSON.stringify(history);

  assert.equal(result.cancelled.length, 1);
  assert.equal(result.cancelled[0].taskId, null);
  assert.deepEqual(runManager.getActiveRuns(actor), []);
  assert.equal(history.length, 1);
  assert.equal(history[0].status, 'cancelled');
  assert.equal(history[0].taskId, 'blind');
  assert.deepEqual(history[0].createdResults, []);
  assert.deepEqual(history[0].usedTools, []);
  assert.deepEqual(history[0].checkResult, { blind: true, status: 'cancelled' });
  for (const text of ['secret-task', 'Secret Mooncap Patch']) {
    assert.equal(serializedResult.includes(text), false, text);
    assert.equal(serializedHistory.includes(text), false, text);
  }
});

test('non-GM blind timed terminal history remains redacted and generic', async () => {
  resetActor();
  let worldTime = 1000;
  const runManager = makeRunManager({ now: () => worldTime });
  const secretTask = timedTask({
    id: 'secret-mooncap-task',
    name: 'Secret Mooncap Patch',
    toolIds: ['tool-sickle']
  });
  await createWaitingRun(runManager, actor, { taskId: secretTask.id });
  worldTime = 1060;
  const calls = {};
  const engine = makeEngine({
    runManager,
    environments: [environment(secretTask, { selectionMode: 'blind' })],
    createdResults: [{ actorUuid: actor.uuid, itemUuid: 'Item.secret-mooncap', quantity: 1 }],
    usedTools: [{ actorUuid: actor.uuid, itemUuid: 'Item.silver-sickle', quantity: 1 }],
    calls
  });

  const result = await engine.processWorldTime(worldTime);
  const history = runManager.getRunHistory(actor);
  const serializedResult = JSON.stringify(result);
  const serializedHistory = JSON.stringify(history);

  assert.equal(result.completed.length, 1);
  assert.equal(result.completed[0].taskId, null);
  assert.equal(history.length, 1);
  assert.equal(history[0].taskId, 'blind');
  assert.deepEqual(history[0].createdResults, []);
  assert.deepEqual(history[0].usedTools, []);
  assert.deepEqual(history[0].checkResult, { blind: true, status: 'succeeded' });
  for (const text of ['secret-mooncap-task', 'Secret Mooncap Patch', 'silver-sickle', 'secret-mooncap', 'macroOutcome']) {
    assert.equal(serializedResult.includes(text), false, text);
    assert.equal(serializedHistory.includes(text), false, text);
  }
});
