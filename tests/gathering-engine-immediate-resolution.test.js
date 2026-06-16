import test from 'node:test';
import assert from 'node:assert/strict';

import { GatheringEngine } from '../src/systems/GatheringEngine.js';
import { GatheringRunManager } from '../src/systems/GatheringRunManager.js';

const viewer = { id: 'user-1', isGM: false };
const gmViewer = { id: 'gm-1', isGM: true };
const actor = {
  id: 'actor-1',
  uuid: 'Actor.actor-1',
  name: 'Gatherer'
};

function makeEngine({
  environment = targetedEnvironment(),
  task = environment.tasks[0],
  actingActor = actor,
  resolver = {},
  checkResult = { success: null, status: null, value: 10, reasonCode: 'CHECK_VALUE' },
  includeProgressiveResolver = true,
  createdResults = [],
  usedTools = [],
  libraryTools = [],
  terminalRunError = null,
  runManager = null,
  calls = {}
} = {}) {
  calls.resolveRouted = [];
  calls.resolveProgressive = [];
  calls.evaluateCheck = [];
  calls.planResults = [];
  calls.createResults = [];
  calls.planTools = [];
  calls.applyTools = [];
  calls.failureFeedback = [];
  calls.createTerminalRun = [];
  calls.createWaitingRun = [];

  const libraryToolsMap = new Map(libraryTools.map(tool => [tool.id, tool]));

  return new GatheringEngine({
    environmentStore: {
      list: () => {
        const composed = { ...environment, tasks: [task] };
        Object.defineProperty(composed, '__libraryTools', { value: libraryToolsMap, enumerable: false });
        return [composed];
      }
    },
    getSystems: () => [{
      id: 'system-a',
      enabled: true,
      features: { gathering: true },
      components: [
        { id: 'comp-a', difficulty: 3 },
        { id: 'comp-b', difficulty: 5 },
        { id: 'comp-c', difficulty: 7 }
      ]
    }],
    getSelectableActors: () => [actingActor],
    isActorSelectable: ({ actor: candidate }) => candidate === actingActor || candidate?.id === actingActor.id,
    isGamePaused: () => false,
    evaluator: {
      evaluateVisibility: async () => ({ visible: true, reasonCode: 'VISIBLE', diagnostic: null }),
      evaluateCheck: async (payload) => {
        calls.evaluateCheck.push(payload);
        return checkResult;
      }
    },
    sceneAccess: {
      canAttempt: () => ({ allowed: true })
    },
    toolAvailability: {
      check: () => ({ available: true, missing: [], failedRequirements: [] })
    },
    resultResolver: {
      resolveRouted: async (payload) => {
        calls.resolveRouted.push(payload);
        return resolver.routed ?? {
          status: 'succeeded',
          resultGroups: [task.resultGroups[0]],
          checkResult: { outcome: task.resultGroups[0]?.name ?? 'success', provider: task.resultSelection?.provider }
        };
      },
      ...(includeProgressiveResolver ? {
        resolveProgressive: async (payload) => {
          calls.resolveProgressive.push(payload);
          if (resolver.progressive) return resolver.progressive;
          const awarded = task.resultGroups[0].results.filter(result => result.componentId !== 'comp-c');
          return {
            status: awarded.length > 0 ? 'succeeded' : 'failed',
            resultGroups: [{ ...task.resultGroups[0], results: awarded }],
            checkResult: payload.checkResult
          };
        }
      } : {})
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
    runManager: runManager ?? {
      findActiveRunForTask: () => null,
      createWaitingRun: async (...args) => calls.createWaitingRun.push(args),
      createTerminalRun: async (...args) => {
        calls.createTerminalRun.push(args);
        if (terminalRunError) throw terminalRunError;
        return {
          id: `run-${calls.createTerminalRun.length}`,
          status: args[2],
          ...args[1],
          ...args[3]
        };
      }
    },
    localize: (key, data) => data ? `${key}:${JSON.stringify(data)}` : key
  });
}

function targetedEnvironment(overrides = {}) {
  return {
    id: 'env-a',
    craftingSystemId: 'system-a',
    name: 'Old Mine',
    enabled: true,
    selectionMode: 'targeted',
    sceneUuid: null,
    tasks: [routedTask()],
    ...overrides
  };
}

function routedTask(overrides = {}) {
  return {
    id: 'task-a',
    name: 'Gather Iron',
    enabled: true,
    resolutionMode: 'routed',
    toolIds: [],
    resultGroups: [{
      id: 'group-a',
      name: 'Iron',
      results: [{ id: 'result-a', componentId: 'comp-a', quantity: 2 }]
    }],
    resultSelection: { provider: 'macroOutcome', macroUuid: 'Macro.outcome' },
    ...overrides
  };
}

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
    if (!this.flags[namespace]) this.flags[namespace] = {};
    this.flags[namespace][key] = JSON.parse(JSON.stringify(value));
  }
}

function progressiveTask(overrides = {}) {
  return routedTask({
    resolutionMode: 'progressive',
    resultSelection: null,
    check: { formula: '1d20 + @skills.sur.mod', threshold: '12' },
    progressive: { awardMode: 'equal' },
    resultGroups: [{
      id: 'group-progressive',
      name: 'Ore',
      results: [
        { id: 'result-a', componentId: 'comp-a', quantity: 1 },
        { id: 'result-b', componentId: 'comp-b', quantity: 1 },
        { id: 'result-c', componentId: 'comp-c', quantity: 1 }
      ]
    }],
    ...overrides
  });
}

function codes(result) {
  return result.blockedReasons.map(reason => reason.code);
}

function assertNoTerminalSideEffects(calls) {
  assert.deepEqual(calls.createTerminalRun, []);
  assert.deepEqual(calls.createWaitingRun, []);
  assert.deepEqual(calls.planResults, []);
  assert.deepEqual(calls.createResults, []);
  assert.deepEqual(calls.planTools, []);
  assert.deepEqual(calls.applyTools, []);
  assert.deepEqual(calls.failureFeedback, []);
}

function assertNoPostHistorySideEffects(calls) {
  assert.deepEqual(calls.createResults, []);
  assert.deepEqual(calls.applyTools, []);
  assert.deepEqual(calls.failureFeedback, []);
}

function assertNoBlindTerminalLeak(call) {
  const serialized = JSON.stringify(call);
  assert.equal(serialized.includes('secret-mooncap-task'), false);
  assert.equal(serialized.includes('Secret Mooncap Patch'), false);
  assert.equal(serialized.includes('silver-sickle'), false);
  assert.equal(serialized.includes('secret-mooncap'), false);
  assert.equal(serialized.includes('macroOutcome'), false);
  assert.equal(serialized.includes('diagnostic'), false);
}

test('immediate routed success creates result items and writes succeeded terminal history', async () => {
  const calls = {};
  const createdResults = [{ actorUuid: actor.uuid, itemUuid: 'Item.iron', quantity: 2 }];
  const usedTools = [{ actorUuid: actor.uuid, itemUuid: 'Item.pick', quantity: 1 }];
  const task = routedTask({ toolIds: ['tool-pick'] });
  const engine = makeEngine({ task, createdResults, usedTools, libraryTools: [{ id: 'tool-pick', componentId: 'pick' }], calls });

  const result = await engine.startAttempt({ viewer, actor, environmentId: 'env-a', taskId: 'task-a' });

  assert.equal(result.accepted, true);
  assert.equal(result.state, 'succeeded');
  assert.equal(result.runStatus, 'succeeded');
  assert.deepEqual(result.createdResults, createdResults);
  assert.deepEqual(result.usedTools, usedTools);
  assert.equal(calls.resolveRouted.length, 1);
  assert.equal(calls.resolveRouted[0].provider, 'macroOutcome');
  assert.equal(calls.createResults.length, 1);
  assert.equal(calls.createResults[0].actor, actor);
  assert.deepEqual(calls.createResults[0].resultGroups, [task.resultGroups[0]]);
  assert.equal(calls.createTerminalRun.length, 1);
  assert.equal(calls.createTerminalRun[0][0], actor);
  assert.deepEqual(calls.createTerminalRun[0][1], {
    craftingSystemId: 'system-a',
    environmentId: 'env-a',
    taskId: 'task-a'
  });
  assert.equal(calls.createTerminalRun[0][2], 'succeeded');
  assert.deepEqual(calls.createTerminalRun[0][3], {
    createdResults,
    usedTools,
    checkResult: { outcome: 'Iron', provider: 'macroOutcome' }
  });
});

test('immediate routed failure writes failed terminal history, creates no results, and applies tool breakage plus failure feedback', async () => {
  const calls = {};
  const usedTools = [{ actorUuid: actor.uuid, itemUuid: 'Item.pick', quantity: 1 }];
  const failureOutcome = { mode: 'text', text: 'The vein is exhausted.' };
  const task = routedTask({ toolIds: ['tool-pick'], failureOutcome });
  const engine = makeEngine({
    task,
    libraryTools: [{ id: 'tool-pick', componentId: 'pick' }],
    resolver: {
      routed: {
        status: 'failed',
        checkResult: { outcome: 'fail', provider: 'rollTableOutcome' }
      }
    },
    usedTools,
    calls
  });

  const result = await engine.startAttempt({ viewer, actor, environmentId: 'env-a', taskId: 'task-a' });

  assert.equal(result.accepted, true);
  assert.equal(result.state, 'failed');
  assert.deepEqual(result.createdResults, []);
  assert.deepEqual(result.usedTools, usedTools);
  assert.deepEqual(calls.createResults, []);
  assert.equal(calls.applyTools.length, 1);
  assert.equal(calls.failureFeedback.length, 1);
  assert.equal(calls.failureFeedback[0].actor, actor);
  assert.equal(calls.failureFeedback[0].failureOutcome, failureOutcome);
  assert.equal(calls.failureFeedback[0].checkResult.outcome, 'fail');
  assert.equal(calls.createTerminalRun.length, 1);
  assert.equal(calls.createTerminalRun[0][2], 'failed');
  assert.deepEqual(calls.createTerminalRun[0][3], {
    createdResults: [],
    usedTools,
    checkResult: { outcome: 'fail', provider: 'rollTableOutcome' }
  });
});

test('progressive success awards expected results from numeric check value', async () => {
  const calls = {};
  const task = progressiveTask();
  const createdResults = [
    { actorUuid: actor.uuid, itemUuid: 'Item.ore-a', quantity: 1 },
    { actorUuid: actor.uuid, itemUuid: 'Item.ore-b', quantity: 1 }
  ];
  const engine = makeEngine({
    task,
    checkResult: { success: null, status: null, value: 8, reasonCode: 'CHECK_VALUE' },
    createdResults,
    calls
  });

  const result = await engine.startAttempt({ viewer, actor, environmentId: 'env-a', taskId: 'task-a' });

  assert.equal(result.accepted, true);
  assert.equal(result.state, 'succeeded');
  assert.equal(calls.evaluateCheck.length, 1);
  assert.equal(calls.resolveProgressive.length, 1);
  assert.equal(calls.resolveProgressive[0].checkResult.value, 8);
  assert.deepEqual(
    calls.createResults[0].resultGroups[0].results.map(entry => entry.id),
    ['result-a', 'result-b']
  );
  assert.deepEqual(result.createdResults, createdResults);
});

test('progressive fallback uses component difficulty and ignores inline result difficulty', async () => {
  const calls = {};
  const task = progressiveTask({
    resultGroups: [{
      id: 'group-progressive',
      name: 'Ore',
      results: [
        { id: 'result-a', componentId: 'comp-a', quantity: 1, difficulty: 1 }
      ]
    }]
  });
  const engine = makeEngine({
    task,
    checkResult: { success: null, status: null, value: 2, reasonCode: 'CHECK_VALUE' },
    includeProgressiveResolver: false,
    calls
  });

  const result = await engine.startAttempt({ viewer, actor, environmentId: 'env-a', taskId: 'task-a' });

  assert.equal(result.accepted, true);
  assert.equal(result.state, 'failed');
  assert.deepEqual(calls.resolveProgressive, []);
  assert.deepEqual(calls.createResults, []);
  assert.equal(calls.failureFeedback.length, 1);
  assert.equal(calls.createTerminalRun.length, 1);
  assert.equal(calls.createTerminalRun[0][2], 'failed');
});

test('progressive neutral zero-award path writes terminal failure when no explicit check success exists', async () => {
  const calls = {};
  const task = progressiveTask();
  const engine = makeEngine({
    task,
    checkResult: { success: null, status: null, value: 0, reasonCode: 'CHECK_VALUE' },
    resolver: {
      progressive: {
        status: 'failed',
        resultGroups: [{ ...task.resultGroups[0], results: [] }],
        checkResult: { value: 0, reasonCode: 'CHECK_VALUE' }
      }
    },
    calls
  });

  const result = await engine.startAttempt({ viewer, actor, environmentId: 'env-a', taskId: 'task-a' });

  assert.equal(result.accepted, true);
  assert.equal(result.state, 'failed');
  assert.deepEqual(result.createdResults, []);
  assert.deepEqual(calls.createResults, []);
  assert.equal(calls.failureFeedback.length, 1);
  assert.equal(calls.failureFeedback[0].failureOutcome, null);
  assert.equal(calls.failureFeedback[0].checkResult.value, 0);
  assert.equal(calls.createTerminalRun.length, 1);
  assert.equal(calls.createTerminalRun[0][2], 'failed');
});

test('invalid failureOutcome aborts before resolver or terminal side effects', async () => {
  for (const failureOutcome of [
    { mode: 'text', text: '' },
    { mode: 'macro', macroUuid: '' },
    { mode: 'other', text: 'No useful finds.' }
  ]) {
    const calls = {};
    const task = routedTask({ failureOutcome });
    const engine = makeEngine({ task, calls });

    const result = await engine.startAttempt({ viewer, actor, environmentId: 'env-a', taskId: 'task-a' });

    assert.equal(result.accepted, false);
    assert.deepEqual(codes(result), ['TASK_MISCONFIGURED']);
    assert.deepEqual(calls.resolveRouted, []);
    assertNoTerminalSideEffects(calls);
  }
});

test('terminal history persistence failure prevents results, tools, and failure feedback side effects', async () => {
  const calls = {};
  const task = routedTask({
    failureOutcome: { mode: 'text', text: 'No useful finds.' }
  });
  const engine = makeEngine({
    task,
    resolver: {
      routed: {
        status: 'failed',
        checkResult: { outcome: 'fail', provider: 'macroOutcome' }
      }
    },
    terminalRunError: Object.assign(new Error('flag write failed'), { code: 'FLAG_WRITE_FAILED' }),
    calls
  });

  const result = await engine.startAttempt({ viewer, actor, environmentId: 'env-a', taskId: 'task-a' });

  assert.equal(result.accepted, false);
  assert.deepEqual(codes(result), ['RUN_CREATION_FAILED']);
  assert.equal(calls.createTerminalRun.length, 1);
  assertNoPostHistorySideEffects(calls);
});

test('real run manager persists immediate non-blind history with the same created and used refs as response', async () => {
  const calls = {};
  const actingActor = new FakeActor();
  const createdResults = [{ actorUuid: actingActor.uuid, itemUuid: 'Item.iron', quantity: 2 }];
  const usedTools = [{ actorUuid: actingActor.uuid, itemUuid: 'Item.pick', quantity: 1 }];
  const task = routedTask({ toolIds: ['tool-pick'] });
  const runManager = new GatheringRunManager({
    randomID: () => 'run-terminal',
    nowWorldTime: () => 1000,
    getUserId: () => viewer.id
  });
  const engine = makeEngine({
    actingActor,
    task,
    createdResults,
    usedTools,
    libraryTools: [{ id: 'tool-pick', componentId: 'pick' }],
    runManager,
    calls
  });

  const result = await engine.startAttempt({ viewer, actor: actingActor, environmentId: 'env-a', taskId: 'task-a' });
  const history = actingActor.flags.fabricate.gatheringRuns.history;

  assert.equal(result.accepted, true);
  assert.deepEqual(result.createdResults, createdResults);
  assert.deepEqual(result.usedTools, usedTools);
  assert.equal(history.length, 1);
  assert.equal(history[0].status, 'succeeded');
  assert.deepEqual(history[0].createdResults, createdResults);
  assert.deepEqual(history[0].usedTools, usedTools);
  assert.deepEqual(history[0].checkResult, { outcome: 'Iron', provider: 'macroOutcome' });
  assert.equal(calls.createResults.length, 1);
  assert.equal(calls.applyTools.length, 1);
});

test('tool terminal usage receives only the acting actor and never actor collections', async () => {
  const calls = {};
  const task = routedTask({ toolIds: ['tool-pick'] });
  const engine = makeEngine({ task, libraryTools: [{ id: 'tool-pick', componentId: 'pick' }], calls });

  await engine.startAttempt({ viewer, actor, environmentId: 'env-a', taskId: 'task-a' });

  assert.equal(calls.applyTools.length, 1);
  assert.equal(calls.applyTools[0].actor, actor);
  assert.equal('actors' in calls.applyTools[0], false);
  assert.equal('componentSourceActors' in calls.applyTools[0], false);
});

test('misconfiguration abort creates no active run, terminal history, result items, or tool usage', async () => {
  const calls = {};
  const task = routedTask({ resultSelection: { provider: 'macroOutcome' } });
  const engine = makeEngine({ task, calls });

  const result = await engine.startAttempt({ viewer, actor, environmentId: 'env-a', taskId: 'task-a' });

  assert.equal(result.accepted, false);
  assert.deepEqual(codes(result), ['TASK_MISCONFIGURED']);
  assertNoTerminalSideEffects(calls);
});

test('routed task with reserved failure keyword result group aborts before resolver or terminal side effects', async () => {
  const calls = {};
  const task = routedTask({
    resultGroups: [{
      id: 'group-fail',
      name: 'fail',
      results: [{ id: 'result-a', componentId: 'comp-a', quantity: 1 }]
    }]
  });
  const engine = makeEngine({ task, calls });

  const result = await engine.startAttempt({ viewer, actor, environmentId: 'env-a', taskId: 'task-a' });

  assert.equal(result.accepted, false);
  assert.deepEqual(codes(result), ['TASK_MISCONFIGURED']);
  assert.deepEqual(calls.resolveRouted, []);
  assertNoTerminalSideEffects(calls);
});

test('routed task with duplicate normalized result group names aborts before terminal side effects', async () => {
  const calls = {};
  const task = routedTask({
    resultGroups: [
      {
        id: 'group-a',
        name: 'Iron',
        results: [{ id: 'result-a', componentId: 'comp-a', quantity: 1 }]
      },
      {
        id: 'group-b',
        name: ' iron ',
        results: [{ id: 'result-b', componentId: 'comp-b', quantity: 1 }]
      }
    ]
  });
  const engine = makeEngine({ task, calls });

  const result = await engine.startAttempt({ viewer, actor, environmentId: 'env-a', taskId: 'task-a' });

  assert.equal(result.accepted, false);
  assert.deepEqual(codes(result), ['TASK_MISCONFIGURED']);
  assert.deepEqual(calls.resolveRouted, []);
  assertNoTerminalSideEffects(calls);
});

test('resolver diagnostics abort as task misconfiguration without results, tools, or history', async () => {
  const calls = {};
  const task = routedTask();
  const engine = makeEngine({
    task,
    resolver: {
      routed: {
        diagnostics: [{
          code: 'UNMATCHED_OUTCOME',
          message: 'No result group matches secret provider outcome'
        }]
      }
    },
    calls
  });

  const result = await engine.startAttempt({ viewer, actor, environmentId: 'env-a', taskId: 'task-a' });

  assert.equal(result.accepted, false);
  assert.deepEqual(codes(result), ['TASK_MISCONFIGURED']);
  assert.deepEqual(calls.resolveRouted.length, 1);
  assertNoTerminalSideEffects(calls);
});

test('explicit resolver misconfiguration with result groups aborts before terminal side effects', async () => {
  const calls = {};
  const task = routedTask();
  const engine = makeEngine({
    task,
    resolver: {
      routed: {
        status: 'misconfigured',
        resultGroups: [task.resultGroups[0]],
        checkResult: { outcome: 'Iron', provider: 'macroOutcome' }
      }
    },
    calls
  });

  const result = await engine.startAttempt({ viewer, actor, environmentId: 'env-a', taskId: 'task-a' });

  assert.equal(result.accepted, false);
  assert.deepEqual(codes(result), ['TASK_MISCONFIGURED']);
  assert.equal(calls.resolveRouted.length, 1);
  assertNoTerminalSideEffects(calls);
});

test('blind non-GM terminal success response redacts task, tool, provider, and result internals', async () => {
  const calls = {};
  const secretTask = routedTask({
    id: 'secret-mooncap-task',
    name: 'Secret Mooncap Patch',
    toolIds: ['tool-sickle']
  });
  const engine = makeEngine({
    environment: targetedEnvironment({ selectionMode: 'blind', tasks: [secretTask] }),
    task: secretTask,
    createdResults: [{ actorUuid: actor.uuid, itemUuid: 'Item.secret-mooncap', quantity: 1 }],
    usedTools: [{ actorUuid: actor.uuid, itemUuid: 'Item.silver-sickle', quantity: 1 }],
    libraryTools: [{ id: 'tool-sickle', componentId: 'silver-sickle' }],
    calls
  });

  const result = await engine.startAttempt({ viewer, actor, environmentId: 'env-a' });
  const serialized = JSON.stringify(result);

  assert.equal(result.accepted, true);
  assert.equal(result.state, 'succeeded');
  assert.equal(result.taskId, null);
  assert.equal(serialized.includes('secret-mooncap-task'), false);
  assert.equal(serialized.includes('Secret Mooncap Patch'), false);
  assert.equal(serialized.includes('silver-sickle'), false);
  assert.equal(serialized.includes('secret-mooncap'), false);
  assert.equal(serialized.includes('macroOutcome'), false);
  assert.equal('createdResults' in result, false);
  assert.equal('usedTools' in result, false);
  assert.equal('checkResult' in result, false);
  assert.equal(calls.createTerminalRun.length, 1);
  assert.deepEqual(calls.createTerminalRun[0][1], {
    craftingSystemId: 'system-a',
    environmentId: 'env-a',
    taskId: 'blind'
  });
  assert.deepEqual(calls.createTerminalRun[0][3], {
    createdResults: [],
    usedTools: [],
    checkResult: { blind: true, status: 'succeeded' }
  });
  assertNoBlindTerminalLeak(calls.createTerminalRun[0]);
});

test('blind non-GM terminal failure response redacts task, tool, provider diagnostics, and result internals', async () => {
  const calls = {};
  const secretTask = routedTask({
    id: 'secret-mooncap-task',
    name: 'Secret Mooncap Patch',
    toolIds: ['tool-sickle']
  });
  const engine = makeEngine({
    environment: targetedEnvironment({ selectionMode: 'blind', tasks: [secretTask] }),
    task: secretTask,
    libraryTools: [{ id: 'tool-sickle', componentId: 'silver-sickle' }],
    resolver: {
      routed: {
        status: 'failed',
        checkResult: {
          outcome: 'fail',
          provider: 'macroOutcome',
          diagnostic: { taskId: 'secret-mooncap-task', componentId: 'silver-sickle' }
        }
      }
    },
    usedTools: [{ actorUuid: actor.uuid, itemUuid: 'Item.silver-sickle', quantity: 1 }],
    calls
  });

  const result = await engine.startAttempt({ viewer, actor, environmentId: 'env-a' });
  const serialized = JSON.stringify(result);

  assert.equal(result.accepted, true);
  assert.equal(result.state, 'failed');
  assert.equal(result.taskId, null);
  assert.equal(serialized.includes('secret-mooncap-task'), false);
  assert.equal(serialized.includes('Secret Mooncap Patch'), false);
  assert.equal(serialized.includes('silver-sickle'), false);
  assert.equal(serialized.includes('macroOutcome'), false);
  assert.equal(serialized.includes('diagnostic'), false);
  assert.equal('createdResults' in result, false);
  assert.equal('usedTools' in result, false);
  assert.equal('checkResult' in result, false);
  assert.equal(calls.createTerminalRun.length, 1);
  assert.deepEqual(calls.createTerminalRun[0][1], {
    craftingSystemId: 'system-a',
    environmentId: 'env-a',
    taskId: 'blind'
  });
  assert.deepEqual(calls.createTerminalRun[0][3], {
    createdResults: [],
    usedTools: [],
    checkResult: { blind: true, status: 'failed' }
  });
  assertNoBlindTerminalLeak(calls.createTerminalRun[0]);
});

test('GM blind terminal response may include task and result details for inspection', async () => {
  const calls = {};
  const secretTask = routedTask({
    id: 'secret-mooncap-task',
    name: 'Secret Mooncap Patch'
  });
  const createdResults = [{ actorUuid: actor.uuid, itemUuid: 'Item.secret-mooncap', quantity: 1 }];
  const engine = makeEngine({
    environment: targetedEnvironment({ selectionMode: 'blind', tasks: [secretTask] }),
    task: secretTask,
    createdResults,
    calls
  });

  const result = await engine.startAttempt({ viewer: gmViewer, actor, environmentId: 'env-a' });

  assert.equal(result.accepted, true);
  assert.equal(result.taskId, 'secret-mooncap-task');
  assert.deepEqual(result.createdResults, createdResults);
});
