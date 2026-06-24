import test from 'node:test';
import assert from 'node:assert/strict';

import { GatheringEngine } from '../src/systems/GatheringEngine.js';
import { GatheringRunManager } from '../src/systems/GatheringRunManager.js';
import { GatheringRichStateService } from '../src/systems/GatheringRichStateService.js';
import { SETTING_KEYS } from '../src/config/settings.js';

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
    ...overrides
  };
}

// Routed gathering resolves through the system-level routed gathering check
// formula (issue 424). This check's single success tier is named 'Iron' so a
// passing roll routes to the same-named result group; `stubRoll`/`routedRoll`
// control whether the formula passes the DC.
function routedSystemCheck() {
  return {
    routed: {
      rollFormula: '1d20',
      dc: 15,
      type: 'relative',
      thresholdMode: 'meet',
      relativeOutcomes: [{ id: 'tier-iron', name: 'Iron', success: true, dc: 0 }]
    }
  };
}

function stubRoll(total, dice = []) {
  globalThis.Roll = class {
    async evaluate() {
      return { total, dice };
    }
  };
}

function routedRoll(success = true) {
  const total = success ? 18 : 5;
  stubRoll(total, [{ number: 1, faces: 20, total }]);
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
    gatheringCraftingCheck: routedSystemCheck(),
    ...overrides
  };
}

function makeEngine({
  runManager,
  actingActor = actor,
  environments = [environment()],
  systems = [system()],
  createdResults = [],
  usedTools = [],
  calls = {},
  getRunViewer = null,
  richState = null
} = {}) {
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
    richState,
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

// A timed library task in nodes economy mode. Library tasks resolve as `d100`
// (composeEnvironment forces it), so the per-attempt outcome status — and thus
// node depletion under `onSuccess` — is driven by the drop/event rolls, not a
// routed macro. `dropRate: 100` makes the find deterministic.
function nodesLibraryTask(overrides = {}) {
  return {
    id: 'task-a',
    name: 'Gather Iron',
    enabled: true,
    timeRequirement: { minutes: 1 },
    dropRows: [{ id: 'row-a', componentId: 'comp-a', quantity: 2, dropRate: 100, enabled: true }],
    nodes: { enabled: true, max: 3, current: 3, depletionTiming: 'onSuccess', respawn: { policy: 'manual' } },
    ...overrides
  };
}

// Build a real GatheringRichStateService in nodes economy mode, backed by the
// supplied environments so its node-state writes mutate the same env objects the
// engine reads at maturity. The store's `update` merges the patch in place so
// `env.nodeRuntime` is observable after `commitAcceptedAttempt`. The library
// `tasks`/`events` feed composeEnvironment, which the engine uses to resolve
// the matured run's task (embedded `env.tasks` are ignored under richState).
function makeNodesRichState(environments, { tasks = [nodesLibraryTask()], events = [], rules = null, rollD100 = () => 1 } = {}) {
  const byId = new Map(environments.map(env => [env.id, env]));
  const system = { economy: { mode: 'nodes' }, tasks, events };
  if (rules) system.rules = rules;
  const settings = new Map([[SETTING_KEYS.GATHERING_CONFIG, { systems: { 'system-a': system } }]]);
  return new GatheringRichStateService({
    getSetting: key => settings.get(key),
    setSetting: async (key, value) => { settings.set(key, value); return value; },
    settingKey: SETTING_KEYS.GATHERING_CONFIG,
    environmentStore: {
      get: id => byId.get(id) ?? environments[0],
      list: () => environments,
      update: async (id, patch) => { Object.assign(byId.get(id), patch); return byId.get(id); }
    },
    rollD100,
    hooks: { callAll: () => {} }
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
  routedRoll(true);
  try {
    const engine = makeEngine({ runManager, createdResults, calls });

    const result = await engine.processWorldTime(worldTime);

    assert.equal(result.completed.length, 1);
    assert.equal(result.completed[0].state, 'succeeded');
    assert.deepEqual(runManager.getActiveRuns(actor), []);
    const history = runManager.getRunHistory(actor);
    assert.equal(history.length, 1);
    assert.equal(history[0].status, 'succeeded');
    assert.deepEqual(history[0].createdResults, createdResults);
    assert.equal(history[0].checkResult.outcome, 'Iron');
    assert.equal(history[0].checkResult.success, true);
    assert.equal(calls.createResults.length, 1);
  } finally {
    delete globalThis.Roll;
  }
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
  routedRoll(false); // miss the success tier → routed failure
  try {
    const engine = makeEngine({
      runManager,
      environments: [environment(task)],
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
  } finally {
    delete globalThis.Roll;
  }
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
  // A routed timed task whose system has no routed gathering check formula is
  // misconfigured at resume time.
  const calls = {};
  const engine = makeEngine({
    runManager,
    systems: [system({ gatheringCraftingCheck: {} })],
    usedTools: [{ actorUuid: actor.uuid, itemUuid: 'Item.pick', quantity: 1 }],
    createdResults: [{ actorUuid: actor.uuid, itemUuid: 'Item.iron', quantity: 2 }],
    calls
  });

  const result = await engine.processWorldTime(worldTime);

  assert.equal(result.cleared.length, 1);
  assert.deepEqual(runManager.getActiveRuns(actor), []);
  assert.deepEqual(runManager.getRunHistory(actor), []);
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
  routedRoll(false); // routed failure → plans tools, then completeRun throws
  try {
    const engine = makeEngine({
      runManager,
      environments: [environment(timedTask({ toolIds: ['tool-pick'] }))],
      usedTools: [{ actorUuid: actor.uuid, itemUuid: 'Item.pick', quantity: 1 }],
      calls
    });

    const result = await engine.processWorldTime(1060);

    assert.equal(result.errors.length, 1);
    assert.deepEqual(calls.planTools.length, 1);
    assert.deepEqual(calls.createResults, []);
    assert.deepEqual(calls.applyTools, []);
    assert.deepEqual(calls.failureFeedback, []);
  } finally {
    delete globalThis.Roll;
  }
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
  routedRoll(true); // routed success → plans results, then completeRun returns null
  try {
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
  } finally {
    delete globalThis.Roll;
  }
});

test('fresh manual restart after resume-time misconfiguration repair is possible', async () => {
  resetActor();
  let worldTime = 1000;
  const runManager = makeRunManager({ now: () => worldTime, ids: ['stuck-run', 'fresh-run'] });
  await createWaitingRun(runManager);
  worldTime = 1060;
  // The system has no routed gathering check formula, so the matured run clears
  // as a misconfiguration.
  const engine = makeEngine({
    runManager,
    environments: [environment(timedTask())],
    systems: [system({ gatheringCraftingCheck: {} })]
  });
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
  routedRoll(true);
  try {
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
    for (const text of ['secret-mooncap-task', 'Secret Mooncap Patch', 'silver-sickle', 'secret-mooncap']) {
      assert.equal(serializedResult.includes(text), false, text);
      assert.equal(serializedHistory.includes(text), false, text);
    }
  } finally {
    delete globalThis.Roll;
  }
});

test('timed nodes-mode maturity decrements the environment node on a successful onSuccess gather', async () => {
  resetActor();
  let worldTime = 1000;
  const runManager = makeRunManager({ now: () => worldTime });
  // Library-driven env (composeEnvironment supplies the task); embedded tasks: [].
  const env = environment([], { compositionMode: 'automatic', tasks: [] });
  const environments = [env];
  const richState = makeNodesRichState(environments);
  await createWaitingRun(runManager);
  worldTime = 1060;
  const engine = makeEngine({ runManager, environments, richState });

  const result = await engine.processWorldTime(worldTime);

  // A d100 gather with no triggered event matures as succeeded, so the
  // onSuccess node pool depletes by one on the ENVIRONMENT (nodeRuntime[taskId]).
  assert.equal(result.completed.length, 1);
  assert.equal(result.completed[0].state, 'succeeded');
  assert.equal(env.nodeRuntime['task-a'].current, 2, 'the environment node decremented by 1 at maturity');
  assert.equal(env.nodeRuntime['task-a'].max, 3);
  assert.equal(
    result.completed[0].run.economyEvidence.node.remaining,
    2,
    'the committed rich evidence reflects the decremented environment pool'
  );
});

test('timed nodes-mode maturity does not decrement the environment node on a failed onSuccess gather', async () => {
  resetActor();
  let worldTime = 1000;
  const runManager = makeRunManager({ now: () => worldTime });
  const env = environment([], { compositionMode: 'automatic', tasks: [], dangerTags: ['hazardous'] });
  const environments = [env];
  // A guaranteed event under a failureWithEvent policy forces the matured
  // d100 outcome to 'failed', so the onSuccess pool must stay untouched.
  const richState = makeNodesRichState(environments, {
    events: [{ id: 'haz-a', name: 'Cave-in', enabled: true, dangerTags: ['hazardous'], dropRate: 100 }],
    rules: { eventSelectionMode: 'all', eventPolicy: 'failureWithEvent' }
  });
  await createWaitingRun(runManager);
  worldTime = 1060;
  const engine = makeEngine({ runManager, environments, richState });

  const result = await engine.processWorldTime(worldTime);

  assert.equal(result.completed.length, 1);
  assert.equal(result.completed[0].state, 'failed');
  assert.equal(env.nodeRuntime?.['task-a'], undefined, 'no node state is written for a failed onSuccess gather');
});
