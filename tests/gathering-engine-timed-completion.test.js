import test from 'node:test';
import assert from 'node:assert/strict';

import { GatheringEngine } from '../src/systems/GatheringEngine.js';
import { GatheringRunManager } from '../src/systems/GatheringRunManager.js';
import { GatheringRichStateService } from '../src/systems/GatheringRichStateService.js';
import { SETTING_KEYS } from '../src/config/settings.js';
import { routedRoll, routedSystemCheck } from './helpers/gathering.js';

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
    // Include a failure tier so a below-success roll resolves to a genuine failure:
    // routed gathering now clamps a below-lowest relative roll to the closest tier, so
    // a success-only check would clamp a miss up to success. With the failure tier the
    // fixture's sub-threshold behaviour matches the pre-clamp "no match → failure".
    gatheringCraftingCheck: routedSystemCheck({ failureTierName: 'Barren' }),
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
  richState = null,
  eventSceneTrigger = null,
  hookPublisher = null,
  isPrimaryGM = null,
  versionedRunAuthority = null,
  onCreateResults = null,
  gamePaused = false
} = {}) {
  calls.evaluateCheck = [];
  calls.planResults = [];
  calls.createResults = [];
  calls.planTools = [];
  calls.applyTools = [];
  calls.failureFeedback = [];

  const engine = new GatheringEngine({
    environmentStore: {
      list: () => environments,
      get: (environmentId) => environments.find(entry => entry.id === environmentId) ?? null
    },
    runManager,
    richState,
    getSystems: () => systems,
    getSelectableActors: () => [actingActor],
    isActorSelectable: ({ actor: candidate }) => candidate?.id === actingActor.id || candidate?.uuid === actingActor.uuid,
    isGamePaused: () => gamePaused,
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
        await onCreateResults?.(payload);
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
    eventSceneTrigger,
    hookPublisher,
    ...(isPrimaryGM ? { isPrimaryGM } : {}),
    localize: (key, data) => data ? `${key}:${JSON.stringify(data)}` : key
  });
  if (versionedRunAuthority) engine.installVersionedRunAuthority(versionedRunAuthority);
  return engine;
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

test('processWorldTime resolves a matured straight task without a check or d100 yield', async () => {
  resetActor();
  let worldTime = 1000;
  const runManager = makeRunManager({ now: () => worldTime });
  const task = timedTask({
    resolutionMode: 'straight',
    dropRows: [{ id: 'inactive-drop', componentId: 'comp-a', quantity: 99, dropRate: 100 }]
  });
  const createdResults = [{ actorUuid: actor.uuid, itemUuid: 'Item.iron', quantity: 2 }];
  await createWaitingRun(runManager);
  worldTime = 1060;
  const calls = {};
  const engine = makeEngine({
    runManager,
    environments: [environment(task)],
    createdResults,
    calls
  });

  const result = await engine.processWorldTime(worldTime);

  assert.equal(result.completed.length, 1);
  assert.equal(result.completed[0].state, 'succeeded');
  assert.deepEqual(calls.evaluateCheck, []);
  assert.deepEqual(calls.createResults[0].resultGroups, task.resultGroups);
  assert.deepEqual(runManager.getRunHistory(actor)[0].createdResults, createdResults);
  assert.equal(runManager.getRunHistory(actor)[0].checkResult, undefined);
});

test('lifecycle-v1 gathering start routes through authority and defaults to a manual run', async () => {
  resetActor();
  const runManager = makeRunManager();
  const task = timedTask({ resolutionMode: 'straight' });
  const routedStarts = [];
  const grantContexts = [];
  const engine = makeEngine({
    runManager,
    environments: [environment(task)],
    versionedRunAuthority: {
      requestStart: async (payload) => {
        routedStarts.push(payload);
        return { success: true, relayed: true };
      },
      consumeExecutionGrant: async (_grant, context) => {
        grantContexts.push(context);
        return { operationId: 'start-operation' };
      }
    }
  });

  const routed = await engine.requestStart({
    viewer,
    actor,
    environmentId: 'env-a',
    taskId: 'task-a',
    lifecycleVersion: 1
  });
  assert.equal(routed.relayed, true);
  assert.equal(routedStarts[0].completionMode, 'manual');
  assert.deepEqual(runManager.getActiveRuns(actor), []);

  const unsupported = await engine.requestStart({
    actor,
    environmentId: 'env-a',
    taskId: 'task-a',
    lifecycleVersion: 2
  });
  const bypassed = await engine.startAttempt(
    {
      actor,
      environmentId: 'env-a',
      taskId: 'task-a',
      lifecycleVersion: 1
    },
    { operationId: 'forged-operation', completionMode: 'manual' }
  );
  assert.equal(unsupported.success, false);
  assert.equal(bypassed.success, false);
  assert.equal(bypassed.code, 'AUTHORITY_UNAVAILABLE');
  assert.deepEqual(runManager.getActiveRuns(actor), []);

  const invalidCompletion = await engine.startVersionedRun({
    actor,
    environmentId: 'env-a',
    taskId: 'task-a',
    completionMode: 'whenever',
    executionGrant: { token: 'invalid-start' },
    requestId: 'request-invalid-start'
  });
  assert.equal(invalidCompletion.code, 'INVALID_COMPLETION_MODE');
  assert.deepEqual(runManager.getActiveRuns(actor), []);

  const started = await engine.startVersionedRun({
    viewer,
    actor,
    environmentId: 'env-a',
    taskId: 'task-a',
    executionGrant: { token: 'start' },
    requestId: 'request-start'
  });
  const active = runManager.getActiveRuns(actor)[0];
  assert.equal(started.success, true);
  assert.equal(active.lifecycleVersion, 1);
  assert.equal(active.completionMode, 'manual');
  assert.equal(active.runRevision, 0);
  assert.equal(grantContexts[0].operation, 'start');
});

test('lifecycle-v1 gathering without a time gate waits ready for manual collection', async () => {
  resetActor();
  const runManager = makeRunManager();
  const task = timedTask({ resolutionMode: 'straight', timeRequirement: null });
  const calls = {};
  const engine = makeEngine({
    runManager,
    environments: [environment(task)],
    createdResults: [{ actorUuid: actor.uuid, itemUuid: 'Item.iron', quantity: 2 }],
    calls,
    getRunViewer: async () => viewer,
    versionedRunAuthority: {
      consumeExecutionGrant: async (_grant, context) => ({
        operationId: `${context.operation}-operation`
      })
    }
  });

  const started = await engine.startVersionedRun({
    viewer,
    actor,
    environmentId: 'env-a',
    taskId: 'task-a',
    executionGrant: { token: 'start' },
    requestId: 'request-start'
  });
  assert.equal(started.state, 'ready');
  assert.equal(runManager.getActiveRuns(actor)[0].status, 'inProgress');
  assert.deepEqual(calls.createResults, []);

  const collected = await engine.executeVersionedStage({
    actor,
    runId: started.runId,
    expectedRevision: 0,
    executionGrant: { token: 'collect' },
    requestId: 'request-collect'
  });
  assert.equal(collected.success, true);
  assert.equal(calls.createResults.length, 1);
});

test('versioned world-time completion routes only eligible no-check runs through authority', async () => {
  resetActor();
  let worldTime = 1000;
  const runManager = makeRunManager({ now: () => worldTime });
  const task = timedTask({ resolutionMode: 'straight' });
  await createWaitingRun(runManager, actor, {
    lifecycleVersion: 1,
    completionMode: 'worldTime'
  });
  worldTime = 1060;
  const executions = [];
  const calls = {};
  const engine = makeEngine({
    runManager,
    environments: [environment(task)],
    calls,
    versionedRunAuthority: {
      requestExecute: async (payload) => {
        executions.push(payload);
        return { success: true, state: 'succeeded', runId: payload.runId };
      }
    }
  });

  const result = await engine.processWorldTime(worldTime);

  assert.equal(result.completed.length, 1);
  assert.equal(executions.length, 1);
  assert.equal(executions[0].trigger, 'worldTime');
  assert.deepEqual(calls.createResults, [], 'the observing tick never applies effects locally');

  resetActor();
  worldTime = 1000;
  const routedManager = makeRunManager({ now: () => worldTime });
  await createWaitingRun(routedManager, actor, {
    lifecycleVersion: 1,
    completionMode: 'worldTime'
  });
  worldTime = 1060;
  const routedExecutions = [];
  const routedEngine = makeEngine({
    runManager: routedManager,
    versionedRunAuthority: {
      requestExecute: async (payload) => routedExecutions.push(payload)
    }
  });
  const blocked = await routedEngine.processWorldTime(worldTime);
  assert.equal(blocked.errors[0].code, 'AUTOMATIC_CHECK_REQUIRED');
  assert.deepEqual(routedExecutions, []);
  assert.equal(routedManager.getActiveRuns(actor)[0].completionMode, 'worldTime');
});

test('authoritative manual collection persists and settles ordered gathering effects', async () => {
  resetActor();
  let worldTime = 1000;
  const runManager = makeRunManager({ now: () => worldTime });
  const task = timedTask({ resolutionMode: 'straight' });
  const active = await createWaitingRun(runManager, actor, {
    lifecycleVersion: 1,
    completionMode: 'manual'
  });
  worldTime = 1060;
  const createdResults = [{ actorUuid: actor.uuid, itemUuid: 'Item.iron', quantity: 2 }];
  const published = [];
  const calls = {};
  const engine = makeEngine({
    runManager,
    environments: [environment(task)],
    createdResults,
    calls,
    getRunViewer: async () => viewer,
    hookPublisher: { publishAttemptCompleted: (payload) => published.push(payload) },
    isPrimaryGM: () => true,
    onCreateResults: async () => {
      const journal = runManager.getRunHistory(actor)[0].executionJournal;
      assert.equal(journal.status, 'planned', 'terminal history precedes item creation');
      assert.equal(journal.effects.find((effect) => effect.effectId === 'results').phase, 'applying');
    },
    versionedRunAuthority: {
      consumeExecutionGrant: async (_grant, context) => {
        assert.equal(context.operation, 'execute');
        return { operationId: 'collect-operation' };
      }
    }
  });

  const result = await engine.executeVersionedStage({
    actor,
    runId: active.id,
    expectedRevision: 0,
    executionGrant: { token: 'collect' },
    requestId: 'request-collect'
  });

  assert.equal(result.success, true);
  assert.deepEqual(runManager.getActiveRuns(actor), []);
  const terminal = runManager.getRunHistory(actor)[0];
  assert.equal(terminal.status, 'succeeded');
  assert.equal(terminal.executionJournal.status, 'committed');
  assert.ok(terminal.executionJournal.effects.every((effect) => effect.phase === 'applied'));
  assert.deepEqual(
    terminal.executionJournal.effects.map((effect) => effect.effectId),
    ['economy', 'results', 'complications', 'tools', 'events', 'reservation', 'presentation']
  );
  assert.equal(
    terminal.executionJournal.effects.find((effect) => effect.effectId === 'results').receipt[0]
      .itemUuid,
    'Item.iron'
  );
  assert.deepEqual(terminal.createdResults, createdResults);
  assert.equal(calls.createResults.length, 1);
  assert.equal(published.length, 1);

  const duplicate = await engine.executeVersionedStage({
    actor,
    runId: active.id,
    expectedRevision: 0,
    executionGrant: { token: 'collect-duplicate' },
    requestId: 'request-collect'
  });
  assert.equal(duplicate.success, true);
  assert.equal(calls.createResults.length, 1);
  assert.equal(published.length, 1);
});

test('versioned routed collection describes and consumes only the GM-resolved check', async () => {
  resetActor();
  let worldTime = 1000;
  const runManager = makeRunManager({ now: () => worldTime });
  const active = await createWaitingRun(runManager, actor, {
    lifecycleVersion: 1,
    completionMode: 'manual'
  });
  worldTime = 1060;
  const evaluations = [];
  const engine = makeEngine({
    runManager,
    getRunViewer: async () => viewer,
    createdResults: [{ actorUuid: actor.uuid, itemUuid: 'Item.iron', quantity: 2 }],
    versionedRunAuthority: {
      consumeExecutionGrant: async (_grant, context) => ({
        operationId: `${context.operation}-operation`,
        ...(context.operation === 'execute'
          ? { resolvedCheckResult: { success: true, outcome: 'Iron', value: 21, data: {} } }
          : {})
      }),
      evaluatePreparedRunCheck: (...args) => {
        evaluations.push(args);
        return { engineEvaluated: true, success: true, outcome: 'Iron', value: 21, data: {} };
      }
    }
  });

  const descriptor = await engine.describeVersionedStageCheck({
    actor,
    runId: active.id,
    preparationGrant: { token: 'prepare' },
    requestId: 'request-prepare'
  });
  assert.equal(descriptor.required, true);
  assert.equal(descriptor.publicPrompt.mode, 'routedByCheck');
  assert.equal(descriptor.privateEvaluation.slot, 'routed');
  assert.equal(descriptor.privateEvaluation.secret, false);

  const evaluated = await engine.evaluatePreparedVersionedCheck({
    actor,
    privateEvaluation: descriptor.privateEvaluation,
    decision: { situationalBonus: 1 }
  });
  assert.equal(evaluated.engineEvaluated, true);
  assert.equal(evaluations[0][0].taskId, 'task-a');
  assert.equal(evaluations[0][1], actor);

  const result = await engine.executeVersionedStage({
    actor,
    runId: active.id,
    expectedRevision: 0,
    executionGrant: { token: 'execute' },
    requestId: 'request-execute'
  });
  assert.equal(result.success, true);
  assert.equal(result.checkResult.outcome, 'Iron');
});

test('versioned blind check preparation keeps task identity and roll terms private', async () => {
  resetActor();
  let worldTime = 1000;
  const runManager = makeRunManager({ now: () => worldTime });
  const active = await createWaitingRun(runManager, actor, {
    taskId: 'blind:env-a',
    lifecycleVersion: 1,
    completionMode: 'manual'
  });
  const task = timedTask();
  const env = environment(task, { selectionMode: 'blind' });
  worldTime = 1060;
  const engine = makeEngine({
    runManager,
    environments: [env],
    versionedRunAuthority: {
      consumeExecutionGrant: async () => ({ operationId: 'blind-prepare-operation' })
    }
  });
  engine.installBlindRunRelay({
    store: {
      get: (runId) => runId === active.id
        ? {
            taskId: task.id,
            snapshot: {
              task,
              events: [],
              rules: {},
              useLegacyTaskItemSelectionMode: false,
              eventSelectionMode: null,
              eventLimit: null,
              eventPolicy: null,
              conditions: {}
            }
          }
        : null
    }
  });

  const descriptor = await engine.describeVersionedStageCheck({
    actor,
    runId: active.id,
    preparationGrant: { token: 'blind-prepare' },
    requestId: 'request-blind-prepare'
  });

  assert.equal(descriptor.publicPrompt.label, 'FABRICATE.Gathering.BlindTaskLabel');
  assert.equal(descriptor.publicPrompt.mode, 'routedByCheck');
  assert.equal(descriptor.privateEvaluation.secret, true);
  assert.equal(descriptor.privateEvaluation.taskId, task.id);
  assert.equal('rollFormula' in descriptor.publicPrompt, false);
});

test('ambiguous versioned award requires recovery and is never replayed', async () => {
  resetActor();
  let worldTime = 1000;
  const runManager = makeRunManager({ now: () => worldTime });
  const task = timedTask({ resolutionMode: 'straight' });
  const active = await createWaitingRun(runManager, actor, {
    lifecycleVersion: 1,
    completionMode: 'manual'
  });
  worldTime = 1060;
  let awardCalls = 0;
  const engine = makeEngine({
    runManager,
    environments: [environment(task)],
    createdResults: [{ actorUuid: actor.uuid, itemUuid: 'Item.iron', quantity: 2 }],
    getRunViewer: async () => viewer,
    onCreateResults: async () => {
      awardCalls += 1;
      throw new Error('lost item-create acknowledgement');
    },
    versionedRunAuthority: {
      consumeExecutionGrant: async () => ({ operationId: 'uncertain-operation' })
    }
  });

  await assert.rejects(
    () => engine.executeVersionedStage({
      actor,
      runId: active.id,
      expectedRevision: 0,
      executionGrant: { token: 'collect' },
      requestId: 'request-uncertain'
    }),
    (error) => error.code === 'RECOVERY_REQUIRED'
  );
  assert.equal(runManager.getRunHistory(actor)[0].executionJournal.status, 'recoveryRequired');

  await assert.rejects(
    () => engine.executeVersionedStage({
      actor,
      runId: active.id,
      expectedRevision: 0,
      executionGrant: { token: 'collect-again' },
      requestId: 'request-uncertain'
    }),
    (error) => error.code === 'RUN_NOT_FOUND'
  );
  assert.equal(awardCalls, 1);
});

test('paused, stale, unsupported, and missing versioned executions have zero effects', async () => {
  for (const scenario of ['paused', 'stale', 'unsupported', 'missing']) {
    resetActor();
    let worldTime = 1000;
    const runManager = makeRunManager({ now: () => worldTime });
    let runId = 'missing-run';
    let expectedRevision = 0;
    if (scenario === 'unsupported') {
      actor.flags.fabricate.gatheringRuns = {
        active: {
          future: {
            id: 'future',
            lifecycleVersion: 2,
            craftingSystemId: 'system-a',
            environmentId: 'env-a',
            taskId: 'task-a',
            status: 'waitingTime',
            startedAtWorldTime: 1000,
            updatedAtWorldTime: 1000,
            timeGate: { requiredSeconds: 60, initiatedAt: 1000, availableAt: 1060 }
          }
        },
        history: []
      };
      runId = 'future';
    } else if (scenario !== 'missing') {
      const run = await createWaitingRun(runManager, actor, {
        lifecycleVersion: 1,
        completionMode: 'manual'
      });
      runId = run.id;
      if (scenario === 'paused') {
        await runManager.pauseRun(actor, run.id, { expectedRevision: 0 });
        expectedRevision = 1;
      } else {
        expectedRevision = 99;
      }
    }
    worldTime = 1060;
    const calls = {};
    const engine = makeEngine({
      runManager,
      calls,
      versionedRunAuthority: {
        consumeExecutionGrant: async () => ({ operationId: `${scenario}-operation` })
      }
    });

    await assert.rejects(
      () => engine.executeVersionedStage({
        actor,
        runId,
        expectedRevision,
        executionGrant: { token: scenario },
        requestId: `request-${scenario}`
      }),
      (error) => ['RUN_PAUSED', 'STALE_RUN_REVISION', 'UNSUPPORTED_RUN', 'RUN_NOT_FOUND'].includes(error.code),
      scenario
    );
    assert.deepEqual(calls.createResults, [], scenario);
    assert.deepEqual(calls.applyTools, [], scenario);
    assert.deepEqual(calls.failureFeedback, [], scenario);
  }
});

test('versioned cancellation archives without refunding sunk gathering costs', async () => {
  resetActor();
  const runManager = makeRunManager();
  const active = await createWaitingRun(runManager, actor, {
    lifecycleVersion: 1,
    completionMode: 'manual',
    economyEvidence: { stamina: { spent: 3 } }
  });
  const engine = makeEngine({
    runManager,
    versionedRunAuthority: {
      consumeExecutionGrant: async (_grant, context) => {
        assert.equal(context.operation, 'cancel');
        return { operationId: 'cancel-operation' };
      }
    }
  });

  const result = await engine.cancelVersionedRun({
    actor,
    runId: active.id,
    expectedRevision: 0,
    executionGrant: { token: 'cancel' },
    requestId: 'request-cancel'
  });

  assert.equal(result.success, true);
  assert.equal(result.refunded, false);
  assert.equal(runManager.getRunHistory(actor)[0].status, 'cancelled');
  assert.deepEqual(runManager.getRunHistory(actor)[0].economyEvidence, {
    stamina: { spent: 3 }
  });
});

test('non-blind timed task resolves from its start-time mode and results after live edits', async () => {
  resetActor();
  let worldTime = 1000;
  const runManager = makeRunManager({ now: () => worldTime });
  const task = timedTask({ resolutionMode: 'straight' });
  const env = environment(task);
  const calls = {};
  const engine = makeEngine({
    runManager,
    environments: [env],
    createdResults: [{ actorUuid: actor.uuid, itemUuid: 'Item.original', quantity: 2 }],
    calls
  });

  const started = await engine.startAttempt({
    viewer,
    actor,
    environmentId: 'env-a',
    taskId: 'task-a'
  });
  const active = runManager.getActiveRuns(actor)[0];
  assert.equal(started.state, 'waitingTime');
  assert.equal(active.economyEvidence.runtimeSnapshot.task.resolutionMode, 'straight');

  task.resolutionMode = 'routed';
  task.resultGroups = [{
    id: 'edited-group',
    name: 'Edited',
    results: [{ id: 'edited-result', componentId: 'comp-edited', quantity: 9 }]
  }];
  worldTime = 1060;

  const result = await engine.processWorldTime(worldTime);

  assert.equal(result.completed[0].state, 'succeeded');
  assert.deepEqual(calls.evaluateCheck, [], 'the edited routed mode is not read at maturity');
  assert.deepEqual(calls.planResults[0].resultGroups, [
    {
      id: 'group-a',
      name: 'Iron',
      results: [{ id: 'result-a', componentId: 'comp-a', quantity: 2 }]
    }
  ]);
});

test('matured legacy run rejects an invalid live result quantity before terminal side effects', async () => {
  resetActor();
  let worldTime = 1000;
  const runManager = makeRunManager({ now: () => worldTime });
  await createWaitingRun(runManager);
  worldTime = 1060;
  const task = timedTask({
    resolutionMode: 'straight',
    resultGroups: [{
      id: 'group-a',
      name: 'Iron',
      results: [{ id: 'result-a', componentId: 'comp-a', quantity: NaN }]
    }]
  });
  const calls = {};
  const engine = makeEngine({ runManager, environments: [environment(task)], calls });

  const result = await engine.processWorldTime(worldTime);

  assert.equal(result.cleared.length, 1);
  assert.deepEqual(runManager.getActiveRuns(actor), []);
  assert.deepEqual(runManager.getRunHistory(actor), []);
  assert.deepEqual(calls.planResults, []);
  assert.deepEqual(calls.createResults, []);
  assert.deepEqual(calls.planTools, []);
  assert.deepEqual(calls.applyTools, []);
  assert.deepEqual(calls.failureFeedback, []);
});

test('timed straight and routed attempts resolve one independent environmental event', async () => {
  for (const mode of ['straight', 'routed']) {
    resetActor();
    let worldTime = 1000;
    const runManager = makeRunManager({ now: () => worldTime });
    const task = timedTask({ resolutionMode: mode });
    const env = environment(task);
    const event = { id: `event-${mode}`, name: `${mode} rockfall` };
    env.events = [event];
    const evidence = { rows: [], events: [{ eventId: event.id, contributions: [] }] };
    const eventCalls = [];
    const sceneCalls = [];
    const published = [];
    const richState = {
      resolveEnvironmentalEvents: async (payload) => {
        eventCalls.push(payload);
        return {
          status: 'succeeded',
          events: [event],
          eventPolicy: 'successWithEvent',
          characterModifierSnapshot: evidence
        };
      }
    };
    const calls = {};
    const engine = makeEngine({
      runManager,
      environments: [env],
      richState,
      eventSceneTrigger: {
        apply: async (payload) => {
          sceneCalls.push(payload);
        }
      },
      hookPublisher: {
        publishAttemptCompleted: (payload) => {
          published.push(payload);
        }
      },
      isPrimaryGM: () => true,
      calls
    });
    if (mode === 'routed') routedRoll(true);
    try {
      const started = await engine.startAttempt({
        viewer,
        actor,
        environmentId: 'env-a',
        taskId: 'task-a'
      });
      assert.equal(started.state, 'waitingTime', mode);
      worldTime = 1060;

      const result = await engine.processWorldTime(worldTime);

      assert.equal(result.completed[0].state, 'succeeded', mode);
      assert.equal(eventCalls.length, 1, `${mode} rolls events exactly once at maturity`);
      const history = runManager.getRunHistory(actor)[0];
      assert.deepEqual(history.checkResult.events, [event]);
      assert.equal(history.checkResult.eventPolicy, 'successWithEvent');
      assert.deepEqual(history.checkResult.characterModifierSnapshot, evidence);
      assert.deepEqual(history.characterModifierSnapshot, evidence);
      assert.deepEqual(sceneCalls[0].events, [event]);
      assert.deepEqual(published[0].checkResult.events, [event]);
    } finally {
      if (mode === 'routed') delete globalThis.Roll;
    }
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
