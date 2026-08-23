import test from 'node:test';
import assert from 'node:assert/strict';

import { GatheringEngine } from '../src/systems/GatheringEngine.js';
import { GatheringRunManager } from '../src/systems/GatheringRunManager.js';
import { routedRoll, routedSystemCheck, stubRoll } from './helpers/gathering.js';

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
  gatheringCraftingCheck = null,
  calls = {}
} = {}) {
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

  // Routed tasks resolve via the system-level routed gathering check formula.
  // Default a routed system check (named after the task's first result group) so
  // routed harness tasks resolve unless a test opts out by passing `null`/a custom
  // check (or `gatheringCraftingCheck: false` to assert the no-formula path).
  const effectiveCheck =
    gatheringCraftingCheck === undefined || gatheringCraftingCheck === null
      ? (task?.resolutionMode === 'routed'
          ? routedSystemCheck({ tierName: task?.resultGroups?.[0]?.name })
          : null)
      : gatheringCraftingCheck || null;

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
      ],
      ...(effectiveCheck ? { gatheringCraftingCheck: effectiveCheck } : {})
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
    resultResolver: includeProgressiveResolver ? {
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
    } : {},
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
  assert.equal(serialized.includes('diagnostic'), false);
}

test('immediate routed success creates result items and writes succeeded terminal history', async () => {
  const calls = {};
  const createdResults = [{ actorUuid: actor.uuid, itemUuid: 'Item.iron', quantity: 2 }];
  const usedTools = [{ actorUuid: actor.uuid, itemUuid: 'Item.pick', quantity: 1 }];
  const task = routedTask({ toolIds: ['tool-pick'] });
  routedRoll(true);
  try {
    const engine = makeEngine({ task, createdResults, usedTools, libraryTools: [{ id: 'tool-pick', componentId: 'pick' }], calls });

    const result = await engine.startAttempt({ viewer, actor, environmentId: 'env-a', taskId: 'task-a' });

    assert.equal(result.accepted, true);
    assert.equal(result.state, 'succeeded');
    assert.equal(result.runStatus, 'succeeded');
    assert.deepEqual(result.createdResults, createdResults);
    assert.deepEqual(result.usedTools, usedTools);
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
    // The terminal history carries the formula-derived check result; the routed
    // tier name ('Iron') matched the same-named result group.
    assert.deepEqual(calls.createTerminalRun[0][3].createdResults, createdResults);
    assert.deepEqual(calls.createTerminalRun[0][3].usedTools, usedTools);
    assert.equal(calls.createTerminalRun[0][3].checkResult.outcome, 'Iron');
    assert.equal(calls.createTerminalRun[0][3].checkResult.success, true);
  } finally {
    delete globalThis.Roll;
  }
});

test('immediate routed failure writes failed terminal history, creates no results, and applies tool breakage plus failure feedback', async () => {
  const calls = {};
  const usedTools = [{ actorUuid: actor.uuid, itemUuid: 'Item.pick', quantity: 1 }];
  const failureOutcome = { mode: 'text', text: 'The vein is exhausted.' };
  const task = routedTask({ toolIds: ['tool-pick'], failureOutcome });
  routedRoll(false); // 5 lands the failure tier (threshold 5) → routed failure
  try {
    const engine = makeEngine({
      task,
      // A failure tier is needed now that a below-lowest relative roll clamps to the
      // closest tier: without it, the miss would clamp up to the success tier.
      gatheringCraftingCheck: routedSystemCheck({ failureTierName: 'Barren' }),
      libraryTools: [{ id: 'tool-pick', componentId: 'pick' }],
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
    assert.equal(calls.failureFeedback[0].checkResult.success, false);
    assert.equal(calls.createTerminalRun.length, 1);
    assert.equal(calls.createTerminalRun[0][2], 'failed');
    assert.deepEqual(calls.createTerminalRun[0][3].createdResults, []);
    assert.deepEqual(calls.createTerminalRun[0][3].usedTools, usedTools);
    assert.equal(calls.createTerminalRun[0][3].checkResult.success, false);
  } finally {
    delete globalThis.Roll;
  }
});

test('progressive success awards expected results from numeric check value', async () => {
  const calls = {};
  const task = progressiveTask();
  const createdResults = [
    { actorUuid: actor.uuid, itemUuid: 'Item.ore-a', quantity: 1 },
    { actorUuid: actor.uuid, itemUuid: 'Item.ore-b', quantity: 1 }
  ];
  stubRoll(8); // system gathering check rolls 8 → drives the numeric award value
  try {
    const engine = makeEngine({
      task,
      gatheringCraftingCheck: { progressive: { rollFormula: '2d8', awardMode: 'equal' } },
      createdResults,
      calls
    });

    const result = await engine.startAttempt({ viewer, actor, environmentId: 'env-a', taskId: 'task-a' });

    assert.equal(result.accepted, true);
    assert.equal(result.state, 'succeeded');
    assert.deepEqual(calls.evaluateCheck, []);
    assert.equal(calls.resolveProgressive.length, 1);
    assert.equal(calls.resolveProgressive[0].checkResult.value, 8);
    assert.deepEqual(
      calls.createResults[0].resultGroups[0].results.map(entry => entry.id),
      ['result-a', 'result-b']
    );
    assert.deepEqual(result.createdResults, createdResults);
  } finally {
    delete globalThis.Roll;
  }
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
  stubRoll(2); // value 2 < comp-a difficulty (3) → awards nothing → terminal failure
  try {
    const engine = makeEngine({
      task,
      gatheringCraftingCheck: { progressive: { rollFormula: '1d8', awardMode: 'equal' } },
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
  } finally {
    delete globalThis.Roll;
  }
});

test('progressive neutral zero-award path writes terminal failure when no explicit check success exists', async () => {
  const calls = {};
  const task = progressiveTask();
  stubRoll(0); // system gathering check rolls 0 → neutral, no award
  try {
    const engine = makeEngine({
      task,
      gatheringCraftingCheck: { progressive: { rollFormula: '1d8', awardMode: 'equal' } },
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
  } finally {
    delete globalThis.Roll;
  }
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
    assertNoTerminalSideEffects(calls);
  }
});

test('terminal history persistence failure prevents results, tools, and failure feedback side effects', async () => {
  const calls = {};
  const task = routedTask({
    failureOutcome: { mode: 'text', text: 'No useful finds.' }
  });
  routedRoll(false); // routed failure → terminal failure write that then fails to persist
  try {
    const engine = makeEngine({
      task,
      terminalRunError: Object.assign(new Error('flag write failed'), { code: 'FLAG_WRITE_FAILED' }),
      calls
    });

    const result = await engine.startAttempt({ viewer, actor, environmentId: 'env-a', taskId: 'task-a' });

    assert.equal(result.accepted, false);
    assert.deepEqual(codes(result), ['RUN_CREATION_FAILED']);
    assert.equal(calls.createTerminalRun.length, 1);
    assertNoPostHistorySideEffects(calls);
  } finally {
    delete globalThis.Roll;
  }
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
  routedRoll(true);
  try {
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
    assert.equal(history[0].checkResult.outcome, 'Iron');
    assert.equal(history[0].checkResult.success, true);
    assert.equal(calls.createResults.length, 1);
    assert.equal(calls.applyTools.length, 1);
  } finally {
    delete globalThis.Roll;
  }
});

test('tool terminal usage receives only the acting actor and never actor collections', async () => {
  const calls = {};
  const task = routedTask({ toolIds: ['tool-pick'] });
  routedRoll(true);
  try {
    const engine = makeEngine({ task, libraryTools: [{ id: 'tool-pick', componentId: 'pick' }], calls });

    await engine.startAttempt({ viewer, actor, environmentId: 'env-a', taskId: 'task-a' });

    assert.equal(calls.applyTools.length, 1);
    assert.equal(calls.applyTools[0].actor, actor);
    assert.equal('actors' in calls.applyTools[0], false);
    assert.equal('componentSourceActors' in calls.applyTools[0], false);
  } finally {
    delete globalThis.Roll;
  }
});

test('misconfiguration abort creates no active run, terminal history, result items, or tool usage', async () => {
  const calls = {};
  const task = routedTask();
  // No system routed roll formula: the routed task is misconfigured (validation
  // requires the system-level gathering check formula).
  const engine = makeEngine({ task, gatheringCraftingCheck: false, calls });

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
  assertNoTerminalSideEffects(calls);
});

test('routed resolution with no system roll formula reports a misconfiguration diagnostic', async () => {
  // Directly characterize `_resolveRoutedOutcome` with a routed task whose system
  // configures no routed roll formula: a MISSING_ROUTED_CHECK diagnostic, never a
  // terminal success/failure.
  const calls = {};
  const task = routedTask();
  const engine = makeEngine({ task, gatheringCraftingCheck: false, calls });

  const outcome = await engine._resolveRoutedOutcome({ actor, system: {}, task });

  assert.equal(outcome.status, 'misconfigured');
  assert.equal(outcome.diagnostics[0].code, 'MISSING_ROUTED_CHECK');
  assert.match(outcome.diagnostics[0].message, /system-level gathering check roll formula/);

  // End to end: the attempt aborts as a task misconfiguration with no side effects.
  const result = await engine.startAttempt({ viewer, actor, environmentId: 'env-a', taskId: 'task-a' });
  assert.equal(result.accepted, false);
  assert.deepEqual(codes(result), ['TASK_MISCONFIGURED']);
  assertNoTerminalSideEffects(calls);
});

test('blind non-GM terminal success response redacts task, tool, provider, and result internals', async () => {
  const calls = {};
  const secretTask = routedTask({
    id: 'secret-mooncap-task',
    name: 'Secret Mooncap Patch',
    toolIds: ['tool-sickle']
  });
  routedRoll(true);
  try {
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
  } finally {
    delete globalThis.Roll;
  }
});

test('blind non-GM terminal failure response redacts task, tool, provider diagnostics, and result internals', async () => {
  const calls = {};
  const secretTask = routedTask({
    id: 'secret-mooncap-task',
    name: 'Secret Mooncap Patch',
    toolIds: ['tool-sickle']
  });
  routedRoll(false); // 5 lands the failure tier (threshold 5) → routed failure
  try {
    const engine = makeEngine({
      environment: targetedEnvironment({ selectionMode: 'blind', tasks: [secretTask] }),
      task: secretTask,
      // A failure tier so the low roll fails rather than clamping up to success.
      gatheringCraftingCheck: routedSystemCheck({ failureTierName: 'Barren' }),
      libraryTools: [{ id: 'tool-sickle', componentId: 'silver-sickle' }],
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
  } finally {
    delete globalThis.Roll;
  }
});

test('GM blind terminal response may include task and result details for inspection', async () => {
  const calls = {};
  const secretTask = routedTask({
    id: 'secret-mooncap-task',
    name: 'Secret Mooncap Patch'
  });
  const createdResults = [{ actorUuid: actor.uuid, itemUuid: 'Item.secret-mooncap', quantity: 1 }];
  routedRoll(true);
  try {
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
  } finally {
    delete globalThis.Roll;
  }
});

// ---------------------------------------------------------------------------
// System-level gathering check (Checks editor) formula consumption (issue 437):
// the engine rolls the system `gatheringCraftingCheck` formula via the shared
// checkRoll resolvers. The legacy per-task `task.check` fallback has been
// retired; without a system roll formula progressive resolution is misconfigured.
// ---------------------------------------------------------------------------

test('progressive: system gathering check formula drives the numeric award value', async () => {
  const calls = {};
  const task = progressiveTask();
  stubRoll(8); // total 8 → awards comp-a (3) + comp-b (5), stops before comp-c (7)
  try {
    const engine = makeEngine({
      task,
      includeProgressiveResolver: false,
      gatheringCraftingCheck: { progressive: { rollFormula: '2d8', awardMode: 'equal' } },
      createdResults: [{ actorUuid: actor.uuid, itemUuid: 'Item.ore', quantity: 1 }],
      calls
    });

    const result = await engine.startAttempt({ viewer, actor, environmentId: 'env-a', taskId: 'task-a' });

    assert.equal(result.accepted, true);
    assert.equal(result.state, 'succeeded');
    // The legacy expression evaluator must NOT be consulted when the system formula is set.
    assert.deepEqual(calls.evaluateCheck, []);
    assert.deepEqual(
      calls.createResults[0].resultGroups[0].results.map(entry => entry.id),
      ['result-a', 'result-b']
    );
  } finally {
    delete globalThis.Roll;
  }
});

test('progressive: with no system formula the check is misconfigured (no legacy task.check fallback)', async () => {
  const calls = {};
  const task = progressiveTask();
  const engine = makeEngine({
    task,
    createdResults: [{ actorUuid: actor.uuid, itemUuid: 'Item.ore', quantity: 1 }],
    calls
  });

  // Directly exercise the check evaluation: no system progressive roll formula
  // means a MISSING_GATHERING_CHECK diagnostic, never the retired task.check path.
  const checkResult = await engine._evaluateGatheringCheck({
    actor,
    viewer,
    system: {},
    environment: {},
    task
  });
  assert.equal(checkResult.success, null);
  assert.equal(checkResult.status, null);
  assert.equal(checkResult.value, null);
  assert.equal(checkResult.reasonCode, 'MISCONFIGURED_PROVIDER');
  assert.equal(checkResult.diagnostic.code, 'MISSING_GATHERING_CHECK');
  assert.match(checkResult.diagnostic.message, /system-level gathering check roll formula/);

  // End to end: the attempt is rejected as a task misconfiguration and the
  // legacy evaluator is never consulted or even able to award results.
  const result = await engine.startAttempt({ viewer, actor, environmentId: 'env-a', taskId: 'task-a' });

  assert.equal(result.accepted, false);
  assert.deepEqual(codes(result), ['TASK_MISCONFIGURED']);
  assert.deepEqual(calls.evaluateCheck, []);
  assert.deepEqual(calls.resolveProgressive, []);
  assert.deepEqual(calls.createResults, []);
});

test('progressive: system awardMode drives the award (per-task award mode is ignored)', async () => {
  const calls = {};
  // value 4 covers comp-a (3) with 1 left over (< comp-b 5). 'equal' would stop
  // after comp-a; 'partial' awards comp-b too with a remainder. The system mode
  // ('partial') drives the award; the stale per-task 'equal' is ignored.
  const task = progressiveTask({ progressive: { awardMode: 'equal' } });
  stubRoll(4);
  try {
    const engine = makeEngine({
      task,
      includeProgressiveResolver: false,
      gatheringCraftingCheck: { progressive: { rollFormula: '1d8', awardMode: 'partial' } },
      createdResults: [{ actorUuid: actor.uuid, itemUuid: 'Item.ore', quantity: 1 }],
      calls
    });

    const result = await engine.startAttempt({ viewer, actor, environmentId: 'env-a', taskId: 'task-a' });

    assert.equal(result.accepted, true);
    assert.deepEqual(
      calls.createResults[0].resultGroups[0].results.map(entry => entry.id),
      ['result-a', 'result-b']
    );
  } finally {
    delete globalThis.Roll;
  }
});

test('progressive exceed mode awards only results whose cost is strictly below remaining', async () => {
  const calls = {};
  // comp-a cost 3, comp-b cost 5, comp-c cost 7. value 8 (exceed): comp-a (8 > 3,
  // remaining 5) awarded; comp-b (5 > 5 false) stops. Only comp-a is awarded.
  const task = progressiveTask();
  stubRoll(8);
  try {
    const engine = makeEngine({
      task,
      includeProgressiveResolver: false,
      gatheringCraftingCheck: { progressive: { rollFormula: '2d8', awardMode: 'exceed' } },
      createdResults: [{ actorUuid: actor.uuid, itemUuid: 'Item.ore', quantity: 1 }],
      calls
    });

    const result = await engine.startAttempt({ viewer, actor, environmentId: 'env-a', taskId: 'task-a' });

    assert.equal(result.accepted, true);
    assert.equal(result.state, 'succeeded');
    assert.deepEqual(
      calls.createResults[0].resultGroups[0].results.map(entry => entry.id),
      ['result-a'],
      'exceed awards comp-a only (8 > 3); comp-b stops (5 > 5 is false)'
    );
  } finally {
    delete globalThis.Roll;
  }
});

test('progressive: a result whose component lacks a valid difficulty makes the task misconfigured', async () => {
  const calls = {};
  // Gathering FAILS (does not skip) a result referencing a component without a
  // finite difficulty >= 1: INVALID_PROGRESSIVE_DIFFICULTY → misconfigured → the
  // attempt surfaces TASK_MISCONFIGURED and creates no results.
  const task = progressiveTask({
    resultGroups: [{
      id: 'group-progressive',
      name: 'Ore',
      results: [
        { id: 'result-a', componentId: 'comp-a', quantity: 1 }, // difficulty 3
        { id: 'result-x', componentId: 'comp-missing', quantity: 1 } // no such component → invalid difficulty
      ]
    }]
  });
  stubRoll(20); // ample value so the loop reaches the invalid result
  try {
    const engine = makeEngine({
      task,
      includeProgressiveResolver: false,
      gatheringCraftingCheck: { progressive: { rollFormula: '2d8', awardMode: 'equal' } },
      calls
    });

    const result = await engine.startAttempt({ viewer, actor, environmentId: 'env-a', taskId: 'task-a' });

    assert.equal(result.accepted, false);
    assert.deepEqual(codes(result), ['TASK_MISCONFIGURED']);
    assert.deepEqual(calls.createResults, []);
  } finally {
    delete globalThis.Roll;
  }
});

test('routed: system routed formula resolves a tier name and routes to the same-named result group', async () => {
  const calls = {};
  const task = routedTask({
    resultGroups: [{ id: 'group-iron', name: 'Iron', results: [{ id: 'result-a', componentId: 'comp-a', quantity: 2 }] }]
  });
  stubRoll(18, [{ number: 1, faces: 20, total: 18 }]); // 18 ≥ dc 15 → 'Iron' tier
  try {
    const engine = makeEngine({
      task,
      gatheringCraftingCheck: {
        routed: {
          rollFormula: '1d20',
          dc: 15,
          type: 'relative',
          thresholdMode: 'meet',
          relativeOutcomes: [{ id: 'tier-iron', name: 'Iron', success: true, dc: 0 }]
        }
      },
      createdResults: [{ actorUuid: actor.uuid, itemUuid: 'Item.iron', quantity: 2 }],
      calls
    });

    const result = await engine.startAttempt({ viewer, actor, environmentId: 'env-a', taskId: 'task-a' });

    assert.equal(result.accepted, true);
    assert.equal(result.state, 'succeeded');
    assert.equal(calls.createTerminalRun[0][3].checkResult.outcome, 'Iron');
    assert.deepEqual(calls.createResults[0].resultGroups[0].results.map(entry => entry.id), ['result-a']);
  } finally {
    delete globalThis.Roll;
  }
});

test('routed: task.dcOverride shifts the base DC for the formula tier match', async () => {
  const calls = {};
  // Roll 18 with a per-task dcOverride of 20 misses the success tier (delta 0 →
  // threshold 20) but lands the failure tier (delta -10 → threshold 10), so no group
  // routes and the attempt fails. (With the default dc 15 the same roll would clear
  // the success tier — this pins that the override shifts every threshold.)
  const task = routedTask({
    dcOverride: 20,
    failureOutcome: { mode: 'text', text: 'No useful finds.' },
    resultGroups: [{ id: 'group-iron', name: 'Iron', results: [{ id: 'result-a', componentId: 'comp-a', quantity: 2 }] }]
  });
  stubRoll(18, [{ number: 1, faces: 20, total: 18 }]);
  try {
    const engine = makeEngine({
      task,
      gatheringCraftingCheck: routedSystemCheck({ failureTierName: 'Barren' }),
      calls
    });

    const result = await engine.startAttempt({ viewer, actor, environmentId: 'env-a', taskId: 'task-a' });

    assert.equal(result.accepted, true);
    assert.equal(result.state, 'failed');
    assert.deepEqual(calls.createResults, []);
  } finally {
    delete globalThis.Roll;
  }
});

test('routed: a winning tier whose name matches no result group is blocked, without crashing', async () => {
  const calls = {};
  // Roll 18 vs dc 15 wins the success tier "Iron" (delta 0 → threshold 15), but the
  // task has no result group named "Iron" — so nothing routes and the attempt
  // resolves safely (no provider call, no result items, no throw).
  //
  // This test previously pinned `accepted: true` — it was a CRASH-SAFETY test, as its
  // name said, and the empty success it documented was the routed twin of the d100 miss
  // in issue 1027: node and stamina spent, nothing awarded, nobody told. Since gathering
  // routes by NAME, a tier rename on the system silently unroutes every task, so this is
  // a content bug rather than a legitimate outcome and is now reported as such. The
  // no-throw guarantee the test was written for is unchanged and still asserted.
  const task = routedTask({
    failureOutcome: { mode: 'text', text: 'No useful finds.' },
    resultGroups: [{ id: 'group-copper', name: 'Copper', results: [{ id: 'result-a', componentId: 'comp-a', quantity: 1 }] }]
  });
  stubRoll(18, [{ number: 1, faces: 20, total: 18 }]);
  try {
    const engine = makeEngine({
      task,
      gatheringCraftingCheck: {
        routed: {
          rollFormula: '1d20',
          dc: 15,
          type: 'relative',
          thresholdMode: 'meet',
          relativeOutcomes: [{ id: 'tier-iron', name: 'Iron', success: true, dc: 0 }]
        }
      },
      calls
    });

    const result = await engine.startAttempt({ viewer, actor, environmentId: 'env-a', taskId: 'task-a' });

    assert.equal(result.accepted, false, 'an unroutable success tier is a misconfiguration');
    assert.deepEqual(codes(result), ['TASK_MISCONFIGURED']);
    assert.deepEqual(calls.createResults, []);
  } finally {
    delete globalThis.Roll;
  }
});

test('routed: with no system routed formula the attempt is a task misconfiguration', async () => {
  const calls = {};
  const task = routedTask();
  const engine = makeEngine({ task, gatheringCraftingCheck: false, calls });

  const result = await engine.startAttempt({ viewer, actor, environmentId: 'env-a', taskId: 'task-a' });

  assert.equal(result.accepted, false);
  assert.deepEqual(codes(result), ['TASK_MISCONFIGURED']);
});

test('d100: a d100 task still resolves via the d100 path regardless of a system gathering check', async () => {
  const calls = {};
  const task = routedTask({
    resolutionMode: 'd100',
    resultSelection: null,
    dropRows: [{ id: 'drop-a', componentId: 'comp-a', dropRate: 50, quantity: 1, enabled: true }]
  });
  const engine = makeEngine({
    task,
    gatheringCraftingCheck: { progressive: { rollFormula: '2d8', awardMode: 'equal' }, routed: { rollFormula: '1d20', dc: 15 } },
    calls
  });

  // No richState.resolveD100Attempt is wired in this harness, so the d100 path
  // surfaces its own misconfigured outcome — proving dispatch stayed on d100 and
  // never touched the progressive/routed formula resolvers.
  const result = await engine.startAttempt({ viewer, actor, environmentId: 'env-a', taskId: 'task-a' });

  assert.equal(result.accepted, false);
  assert.deepEqual(codes(result), ['TASK_MISCONFIGURED']);
  assert.deepEqual(calls.resolveProgressive, []);
  assert.deepEqual(calls.evaluateCheck, []);
});

// ---------------------------------------------------------------------------
// `_resolveRoutedFormulaOutcome` direct characterization (issue 424): the routed
// system check formula is the only routed resolution path. A passing tier routes
// by name to the matching result group; a failing or unmatched tier resolves to a
// terminal failure; no system roll formula reports a misconfiguration diagnostic.
// ---------------------------------------------------------------------------

test('_resolveRoutedFormulaOutcome: a passing tier routes to the same-named result group', async () => {
  const task = routedTask();
  const routed = routedSystemCheck().routed;
  stubRoll(18, [{ number: 1, faces: 20, total: 18 }]);
  try {
    const engine = makeEngine({ task });
    const outcome = await engine._resolveRoutedFormulaOutcome({
      routed,
      rollFormula: routed.rollFormula,
      actor,
      task
    });
    assert.equal(outcome.status, 'succeeded');
    assert.equal(outcome.checkResult.outcome, 'Iron');
    assert.deepEqual(outcome.resultGroups.map(group => group.id), ['group-a']);
  } finally {
    delete globalThis.Roll;
  }
});

test('_resolveRoutedFormulaOutcome: a below-lowest total clamps to the closest tier', async () => {
  // Single 'Iron' success tier at threshold 15; a roll of 5 meets no threshold, so
  // gathering (like crafting/salvage) clamps to that closest tier rather than a
  // null/failure outcome, and routes to the same-named result group.
  const task = routedTask();
  const routed = routedSystemCheck().routed;
  stubRoll(5, [{ number: 1, faces: 20, total: 5 }]); // misses dc 15 → clamps to Iron
  try {
    const engine = makeEngine({ task });
    const outcome = await engine._resolveRoutedFormulaOutcome({
      routed,
      rollFormula: routed.rollFormula,
      actor,
      task
    });
    assert.equal(outcome.status, 'succeeded');
    assert.equal(outcome.checkResult.outcome, 'Iron');
    assert.deepEqual(outcome.resultGroups.map(group => group.id), ['group-a']);
  } finally {
    delete globalThis.Roll;
  }
});

test('_resolveRoutedFormulaOutcome: a matched failure tier resolves to a terminal failure', async () => {
  // With an explicit failure tier as the lowest tier, a low roll lands (or clamps) on
  // it and resolves to a terminal failure — the clamp routes to the closest tier, it
  // does not force success.
  const task = routedTask();
  const routed = {
    ...routedSystemCheck().routed,
    relativeOutcomes: [
      { id: 'tier-iron', name: 'Iron', success: true, dc: 0 }, // threshold 15
      { id: 'tier-dust', name: 'Dust', success: false, dc: -10 } // threshold 5
    ]
  };
  stubRoll(5, [{ number: 1, faces: 20, total: 5 }]); // matches Dust (threshold 5)
  try {
    const engine = makeEngine({ task });
    const outcome = await engine._resolveRoutedFormulaOutcome({
      routed,
      rollFormula: routed.rollFormula,
      actor,
      task
    });
    assert.equal(outcome.status, 'failed');
    assert.deepEqual(outcome.resultGroups, []);
    assert.equal(outcome.checkResult.success, false);
    assert.equal(outcome.checkResult.outcome, 'Dust');
  } finally {
    delete globalThis.Roll;
  }
});

test('_resolveRoutedFormulaOutcome: a winning tier with no matching result group is MISCONFIGURED', async () => {
  // Tier 'Iron' wins but the only result group is named 'Copper'. This previously
  // asserted `succeeded` with an empty result set — the routed twin of the d100 miss in
  // issue 1027, except that here nothing rolled badly: the content is simply unrouted.
  const task = routedTask({
    resultGroups: [{ id: 'group-copper', name: 'Copper', results: [{ id: 'result-a', componentId: 'comp-a', quantity: 1 }] }]
  });
  const routed = routedSystemCheck().routed;
  stubRoll(18, [{ number: 1, faces: 20, total: 18 }]);
  try {
    const engine = makeEngine({ task });
    const outcome = await engine._resolveRoutedFormulaOutcome({
      routed,
      rollFormula: routed.rollFormula,
      actor,
      task
    });
    assert.equal(outcome.status, 'misconfigured');
    assert.equal(outcome.code, 'ROUTED_TIER_UNROUTED');
    assert.deepEqual(outcome.resultGroups, []);
    // The roll is still reported, so the GM can see which tier failed to route.
    assert.equal(outcome.checkResult.outcome, 'Iron');
  } finally {
    delete globalThis.Roll;
  }
});

test('_resolveRoutedFormulaOutcome: a tier-step trigger moves the gathering tier and reroutes by the FINAL name', async () => {
  // Acceptance criterion 5, "gathering routed checks step" (issue 975). Tier stepping is a
  // per-trigger effect on the unified trigger list, so it reaches gathering through the same
  // `routed.checkBreakage.triggers` the engine already forwards to `runFormulaRouted` —
  // there is no gathering-specific opt-in, which is the point of retiring `natStepping`.
  //
  // Two tiers, two same-named result groups. A total of 5 matches 'Dust' (threshold
  // dc-10 = 5), a FAILURE tier — the exact configuration the sibling test above pins as a
  // terminal failure. The only difference here is one `up 1` trigger, so anything that
  // stopped the step from applying would put this test back on that test's outcome.
  //
  // What it proves beyond "the step ran": gathering routes by the tier NAME, so a step
  // changes which result group a gather produces, and with no forced outcome `success`
  // follows the final tier — a failure tier stepped up onto a success tier succeeds.
  const task = routedTask({
    resultGroups: [
      { id: 'group-dust', name: 'Dust', results: [{ id: 'result-dust', componentId: 'comp-a', quantity: 1 }] },
      { id: 'group-iron', name: 'Iron', results: [{ id: 'result-iron', componentId: 'comp-b', quantity: 1 }] }
    ]
  });
  // A `rollTotal` condition rather than a `diceGroup` one: it reads only `total`, which the
  // roll stub supplies unconditionally, so the test cannot pass or fail on dice-group shape.
  const routed = routedSystemCheck({
    failureTierName: 'Dust',
    triggers: [{
      id: 'gather-step-up',
      condition: { type: 'rollTotal', operator: '<=', value: 5 },
      outcome: 'none',
      breakTools: false,
      tierStep: { mode: 'up', steps: 1, tierId: null }
    }]
  }).routed;
  stubRoll(5, [{ number: 1, faces: 20, total: 5 }]); // matches Dust (threshold 5) → steps up to Iron
  try {
    const engine = makeEngine({ task });
    const outcome = await engine._resolveRoutedFormulaOutcome({
      routed,
      rollFormula: routed.rollFormula,
      actor,
      task
    });
    assert.equal(outcome.status, 'succeeded');
    assert.equal(outcome.checkResult.outcome, 'Iron', 'the FINAL tier name is the routing key');
    assert.equal(outcome.checkResult.success, true, 'success follows the final tier');
    assert.deepEqual(outcome.resultGroups.map(group => group.id), ['group-iron']);
    assert.deepEqual(outcome.checkResult.data.tierStepApplied, {
      mode: 'up',
      steps: 1,
      fromOutcomeId: 'tier-Dust',
      toOutcomeId: 'tier-Iron',
      stepClamped: false,
      triggerIds: ['gather-step-up']
    });
  } finally {
    delete globalThis.Roll;
  }
});

test('_resolveRoutedOutcome: no system roll formula reports a MISSING_ROUTED_CHECK diagnostic', async () => {
  const task = routedTask();
  const engine = makeEngine({ task, gatheringCraftingCheck: false });
  const outcome = await engine._resolveRoutedOutcome({ actor, system: {}, task });
  assert.equal(outcome.status, 'misconfigured');
  assert.equal(outcome.diagnostics[0].code, 'MISSING_ROUTED_CHECK');
});

// ---------------------------------------------------------------------------
// Interactive roll cancel: dismissing the dialog aborts with ZERO mutation.
// Stub `foundry.applications.api.DialogV2.wait` to resolve to a cancel so the
// real `promptCheckRoll` returns { confirmed: false } -> the routed/progressive
// check reports a cancelled outcome -> `_resolveImmediateAttempt` returns quietly
// before any run creation / result / tool side effect.
// ---------------------------------------------------------------------------

function stubCancelDialog() {
  const original = globalThis.foundry;
  globalThis.foundry = {
    applications: { api: { DialogV2: { wait: async () => ({ confirmed: false }) } } }
  };
  return () => {
    if (original === undefined) delete globalThis.foundry;
    else globalThis.foundry = original;
  };
}

test('immediate interactive cancel (routed): dismissing the roll dialog aborts with zero mutation', async () => {
  const calls = {};
  routedRoll(true);
  const restoreFoundry = stubCancelDialog();
  try {
    const engine = makeEngine({ calls });
    const result = await engine.startAttempt({
      viewer,
      actor,
      environmentId: 'env-a',
      taskId: 'task-a',
      interactive: true
    });

    assert.equal(result.accepted, false, 'a cancelled attempt is not accepted');
    assert.equal(result.cancelled, true, 'the cancelled flag is surfaced for a silent no-op');
    assert.deepEqual(result.blockedReasons, [], 'no blocked reasons — a cancel is not a rejection');
    assertNoTerminalSideEffects(calls);
  } finally {
    restoreFoundry();
    delete globalThis.Roll;
  }
});

test('immediate interactive cancel (progressive): dismissing the roll dialog aborts with zero mutation', async () => {
  const calls = {};
  routedRoll(true);
  const restoreFoundry = stubCancelDialog();
  try {
    const engine = makeEngine({
      task: progressiveTask(),
      gatheringCraftingCheck: { progressive: { rollFormula: '1d20' } },
      calls
    });
    const result = await engine.startAttempt({
      viewer,
      actor,
      environmentId: 'env-a',
      taskId: 'task-a',
      interactive: true
    });

    assert.equal(result.accepted, false, 'a cancelled attempt is not accepted');
    assert.equal(result.cancelled, true, 'the cancelled flag is surfaced');
    assert.deepEqual(result.blockedReasons, [], 'no blocked reasons on cancel');
    assertNoTerminalSideEffects(calls);
  } finally {
    restoreFoundry();
    delete globalThis.Roll;
  }
});

// ---------------------------------------------------------------------------
// A routed SUCCESS tier that matches no result group.
//
// Gathering routes by NAME, so this is not only an authoring omission: renaming a
// tier on the system silently unroutes every task whose groups were named for the old
// tier. It used to report `succeeded` with an empty result set — spending the node and
// the stamina, awarding nothing, and telling nobody.
// ---------------------------------------------------------------------------

test('a routed success tier with NO matching result group is blocked, not a silent empty success', async () => {
  const calls = {};
  // The system's success tier is 'Iron'; the task's only group is named 'Copper', so
  // the tier routes nowhere.
  const task = routedTask({
    resultGroups: [
      { id: 'group-copper', name: 'Copper', results: [{ id: 'r', componentId: 'comp-a', quantity: 1 }] }
    ]
  });
  routedRoll(true);
  try {
    const engine = makeEngine({
      task,
      gatheringCraftingCheck: routedSystemCheck({ tierName: 'Iron' }),
      calls
    });

    const result = await engine.startAttempt({ viewer, actor, environmentId: 'env-a', taskId: 'task-a' });

    assert.equal(result.accepted, false, 'the attempt is blocked, not accepted as a success');
    assert.deepEqual(codes(result), ['TASK_MISCONFIGURED']);
  } finally {
    delete globalThis.Roll;
  }
});

test('an unrouted success tier consumes nothing — no run, no results, no tools', async () => {
  const calls = {};
  const task = routedTask({
    toolIds: ['tool-pick'],
    resultGroups: [
      { id: 'group-copper', name: 'Copper', results: [{ id: 'r', componentId: 'comp-a', quantity: 1 }] }
    ]
  });
  routedRoll(true);
  try {
    const engine = makeEngine({
      task,
      gatheringCraftingCheck: routedSystemCheck({ tierName: 'Iron' }),
      libraryTools: [{ id: 'tool-pick', componentId: 'pick' }],
      calls
    });

    await engine.startAttempt({ viewer, actor, environmentId: 'env-a', taskId: 'task-a' });

    // The block lands before createTerminalRun and before the rich commit, so the
    // player can retry once the GM fixes the routing.
    assert.equal(calls.createTerminalRun.length, 0, 'no terminal run is written');
    assert.equal(calls.createResults.length, 0, 'nothing is awarded');
    assert.equal(calls.applyTools.length, 0, 'no tool wear is applied');
  } finally {
    delete globalThis.Roll;
  }
});

test('a tier whose group EXISTS but is empty still succeeds — deliberate no-award authoring', async () => {
  const calls = {};
  // Named for the tier, but holding no results: the GM's way of saying "this tier
  // succeeds and awards nothing". It matches by name, so it must NOT be treated as a
  // misconfiguration — it renders the explicit nothing-found card instead.
  const task = routedTask({
    resultGroups: [{ id: 'group-iron', name: 'Iron', results: [] }]
  });
  routedRoll(true);
  try {
    const engine = makeEngine({
      task,
      gatheringCraftingCheck: routedSystemCheck({ tierName: 'Iron' }),
      calls
    });

    const result = await engine.startAttempt({ viewer, actor, environmentId: 'env-a', taskId: 'task-a' });

    assert.equal(result.accepted, true, 'an explicitly empty group is legal authoring');
    assert.equal(result.state, 'succeeded');
    assert.deepEqual(result.createdResults, [], 'and it awards nothing');
  } finally {
    delete globalThis.Roll;
  }
});

// ---------------------------------------------------------------------------
// Progressive component complications: the gathering call site (issue 1286)
//
// PROGRESSIVE GATHERING SHIPS DORMANT. `_libraryTaskToRuntimeTask` hardcodes
// `resolutionMode: 'd100'` and `GatheringEconomyView` renders both formula-rolled modes
// disabled, pending issue 683, so `_resolveProgressiveOutcome` is unreachable from any
// GM-selectable configuration today. An end-to-end `startAttempt` test of this would
// therefore pass VACUOUSLY — it would assert that a d100 attempt fires nothing, which is
// true whether or not any of this works. These drive `_resolveProgressiveOutcome` and
// `_commitTerminalSideEffects` DIRECTLY, exactly as the other dormant seams in this file
// are exercised, so that issue 683 flips a switch onto tested behaviour.
// ---------------------------------------------------------------------------

/** An authored complication; `gmOnly`, so every firing produces a GM request. */
function gatheringComplication({
  id = 'cx',
  when = { stageAwarded: true },
  match = 'any',
  activities = { gathering: true }
} = {}) {
  return {
    id,
    name: 'Cave-in',
    description: 'Cave-in description',
    severity: 'major',
    visibility: 'gmOnly',
    activities,
    match,
    when,
    rollCondition: { enabled: false },
    effectRoll: { enabled: false }
  };
}

/**
 * A progressive gathering system whose three ore components cost 3, 5 and 7, with the
 * complications attached per component id.
 */
function progressiveGatheringSystem({ complications = {}, difficulties = {}, triggers = [] } = {}) {
  // A component with no authored complications carries NO `complications` key at all,
  // matching the absence-preserving normalizer: the plan must cope with the field being
  // absent rather than an empty array.
  const component = (id, difficulty) => {
    const record = { id, name: id, difficulty: difficulties[id] ?? difficulty };
    if (complications[id]) record.complications = complications[id];
    return record;
  };
  return {
    id: 'system-a',
    enabled: true,
    features: { gathering: true },
    components: [component('comp-a', 3), component('comp-b', 5), component('comp-c', 7)],
    gatheringCraftingCheck: {
      progressive: { rollFormula: '1d20', awardMode: 'equal', checkBreakage: { triggers } }
    }
  };
}

/** Resolve a progressive gathering outcome and commit its terminal side effects. */
async function driveProgressiveGathering({ engine, system, task, total = 8 }) {
  stubRoll(total, [{ number: 1, faces: 20, total }]);
  try {
    const environment = targetedEnvironment({ tasks: [task] });
    const outcome = await engine._resolveProgressiveOutcome({
      viewer,
      actor,
      system,
      environment,
      task
    });
    if (outcome.status !== 'misconfigured') {
      await engine._commitTerminalSideEffects({
        viewer,
        actor,
        system,
        environment,
        task,
        outcome,
        checkResult: outcome.checkResult
      });
    }
    return outcome;
  } finally {
    delete globalThis.Roll;
  }
}

test('progressive gathering (DORMANT): a committed award fires its awarded stages once', async () => {
  const calls = {};
  const task = progressiveTask();
  const engine = makeEngine({ task, includeProgressiveResolver: false, calls });
  const writer = { calls: [], deliver(args) { this.calls.push(args); return true; } };
  engine.installComplicationDelivery({ writer });
  const system = progressiveGatheringSystem({
    complications: {
      'comp-a': [gatheringComplication({ id: 'ca' })],
      'comp-c': [gatheringComplication({ id: 'cc', when: { stageMissed: true } })]
    }
  });

  const outcome = await driveProgressiveGathering({ engine, system, task });

  assert.equal(outcome.status, 'succeeded');
  // Budget 8: comp-a (3) and comp-b (5) are awarded, comp-c (7) halts the loop.
  assert.deepEqual(outcome.checkResult.resolutionMeta, {
    awardedResultIds: ['result-a', 'result-b'],
    remaining: 0,
    partialResultId: null,
    haltedResultId: 'result-c',
    skippedResultIds: []
  });
  assert.equal(writer.calls.length, 1, 'one delivery for one resolution');
  assert.deepEqual(
    writer.calls[0].complications.map(entry => [entry.componentId, entry.bucket, entry.activity]),
    [
      ['comp-a', 'full', 'gathering'],
      ['comp-c', 'halted', 'gathering']
    ]
  );
  assert.equal(writer.calls[0].actorUuid, actor.uuid);
  assert.equal(writer.calls[0].craftingSystemId, 'system-a');
});

test('progressive gathering (DORMANT): NEGATIVE CONTROL — an invalid-cost abort fires nothing', async () => {
  // `invalidCost: 'fail'` makes gathering raise INVALID_PROGRESSIVE_DIFFICULTY, and a GM
  // misconfiguration is not a narrative outcome — matching the crafting misconfiguration
  // gate. The abort returns before the award, so the commit is never reached at all.
  const calls = {};
  const task = progressiveTask();
  const engine = makeEngine({ task, includeProgressiveResolver: false, calls });
  const writer = { calls: [], deliver(args) { this.calls.push(args); return true; } };
  engine.installComplicationDelivery({ writer });
  const system = progressiveGatheringSystem({
    complications: {
      'comp-a': [gatheringComplication({ id: 'ca' })],
      'comp-b': [gatheringComplication({ id: 'cb', when: { stageMissed: true } })]
    },
    difficulties: { 'comp-b': 0 }
  });

  const outcome = await driveProgressiveGathering({ engine, system, task });

  assert.equal(outcome.status, 'misconfigured');
  assert.equal(outcome.code, 'INVALID_PROGRESSIVE_DIFFICULTY');
  assert.equal(writer.calls.length, 0, 'a misconfigured resolution fires nothing');
});

test('progressive gathering (DORMANT): NEGATIVE CONTROL — a d100 outcome never reaches the site', async () => {
  const calls = {};
  const task = routedTask();
  const engine = makeEngine({ task, calls });
  const writer = { calls: [], deliver(args) { this.calls.push(args); return true; } };
  engine.installComplicationDelivery({ writer });
  const system = progressiveGatheringSystem({
    // Deliberately a complication that would match on EVERY bucket. Without the mode
    // guard a d100 stage would classify as `unreached` — never having been "awarded" by
    // a loop that never ran — and this would fire. That is the failure mode the control
    // exists to catch, so a `stageAwarded`-only complication would prove nothing.
    complications: {
      'comp-a': [gatheringComplication({ when: { stageAwarded: true, stageMissed: true } })]
    }
  });

  // A d100 outcome carries no progressive resolution meta, and the guard reads the
  // task's own mode before anything else.
  await engine._commitTerminalSideEffects({
    viewer,
    actor,
    system,
    environment: targetedEnvironment({ tasks: [task] }),
    task,
    outcome: { status: 'succeeded', resultGroups: task.resultGroups, checkResult: { provider: 'd100' } },
    checkResult: { provider: 'd100' }
  });

  assert.equal(writer.calls.length, 0, 'complications are a progressive-only consequence');
});

test('progressive gathering (DORMANT): a THROWING delivery writer never costs the attempt its award', async () => {
  const calls = {};
  const task = progressiveTask();
  const engine = makeEngine({ task, includeProgressiveResolver: false, calls });
  engine.installComplicationDelivery({
    writer: {
      deliver() {
        throw new Error('socket exploded');
      }
    }
  });
  const system = progressiveGatheringSystem({
    complications: { 'comp-a': [gatheringComplication()] }
  });

  const outcome = await driveProgressiveGathering({ engine, system, task });

  assert.equal(outcome.status, 'succeeded');
  assert.equal(calls.createResults.length, 1, 'the gathered results were still created');
});
