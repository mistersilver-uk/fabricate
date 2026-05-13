import test from 'node:test';
import assert from 'node:assert/strict';

import { GatheringEngine } from '../src/systems/GatheringEngine.js';

const viewer = { id: 'user-1', isGM: false };
const gmViewer = { id: 'gm-1', isGM: true };
const actor = {
  id: 'actor-1',
  uuid: 'Actor.actor-1',
  name: 'Gatherer',
  items: []
};

function makeEngine({
  systems = [{ id: 'system-a', enabled: true, features: { gathering: true }, components: [] }],
  environments = [environment()],
  selectableActors = [actor],
  paused = false,
  visibility = new Map(),
  sceneAccess = null,
  sceneAccessCollaborator = null,
  activeRuns = new Map(),
  catalystAvailability = null,
  validation = null,
  waitingRunResult = null,
  waitingRunError = null,
  routedOutcome = null,
  progressiveOutcome = null,
  createdResults = [],
  usedCatalysts = [],
  richState = null,
  calls = {}
} = {}) {
  calls.steps = [];
  calls.visibility = [];
  calls.scene = [];
  calls.catalysts = [];
  calls.activeRuns = [];
  calls.validate = [];
  calls.createTerminalRun = [];
  calls.createWaitingRun = [];
  calls.resolveRouted = [];
  calls.resolveProgressive = [];
  calls.evaluateCheck = [];
  calls.createResults = [];
  calls.useCatalysts = [];

  return new GatheringEngine({
    environmentStore: {
      list: () => environments,
      validate: (candidate) => {
        calls.steps.push('validate');
        calls.validate.push(candidate);
        if (typeof validation === 'function') return validation(candidate);
        return validation ?? { valid: true, errors: [] };
      }
    },
    richState,
    getSystems: () => systems,
    getSelectableActors: () => selectableActors,
    isActorSelectable: ({ actor: candidate }) => selectableActors.some(entry => sameActor(entry, candidate)),
    isGamePaused: () => {
      calls.steps.push('pause');
      return paused;
    },
    evaluator: {
      evaluateVisibility: async ({ task }) => {
        calls.steps.push('visibility');
        calls.visibility.push(task.id);
        const result = visibility instanceof Map ? visibility.get(task.id) : visibility?.[task.id];
        return result ?? { visible: true, reasonCode: 'VISIBLE', diagnostic: null };
      },
      evaluateCheck: async (payload) => {
        calls.steps.push('check');
        calls.evaluateCheck.push(payload);
        return { success: null, status: null, value: 10, reasonCode: 'CHECK_VALUE', diagnostic: null };
      }
    },
    sceneAccess: sceneAccessCollaborator ?? {
      canAttempt: ({ environment, actor: selectedActor, viewer: selectedViewer }) => {
        calls.steps.push('scene');
        calls.scene.push({ environment, actor: selectedActor, viewer: selectedViewer });
        if (typeof sceneAccess === 'function') return sceneAccess({ environment, actor: selectedActor, viewer: selectedViewer });
        return sceneAccess ?? { allowed: true };
      }
    },
    runManager: {
      findActiveRunForTask: (selectedActor, taskId) => {
        calls.steps.push('activeRun');
        calls.activeRuns.push({ actor: selectedActor, taskId });
        return activeRuns instanceof Map ? activeRuns.get(taskId) : activeRuns?.[taskId] ?? null;
      },
      createTerminalRun: (...args) => calls.createTerminalRun.push(args),
      createWaitingRun: async (...args) => {
        calls.steps.push('createWaitingRun');
        calls.createWaitingRun.push(args);
        if (waitingRunError) throw waitingRunError;
        if (waitingRunResult !== null) return waitingRunResult;
        return {
          id: 'run-waiting',
          status: 'waitingTime',
          ...args[1],
          timeGate: {
            requiredSeconds: 3600,
            availableAt: 4600,
            initiatedAt: 1000
          }
        };
      }
    },
    catalystAvailability: {
      check: (payload) => {
        calls.steps.push('catalysts');
        calls.catalysts.push(payload);
        if (typeof catalystAvailability === 'function') return catalystAvailability(payload);
        return catalystAvailability ?? { available: true, missing: [] };
      }
    },
    resultResolver: {
      resolveRouted: async (payload) => {
        calls.steps.push('resolveRouted');
        calls.resolveRouted.push(payload);
        return routedOutcome ?? {
          status: 'succeeded',
          resultGroups: [payload.task.resultGroups[0]],
          checkResult: { outcome: payload.task.resultGroups[0]?.name ?? 'success' }
        };
      },
      resolveProgressive: async (payload) => {
        calls.steps.push('resolveProgressive');
        calls.resolveProgressive.push(payload);
        return progressiveOutcome ?? {
          status: 'succeeded',
          resultGroups: [payload.task.resultGroups[0]],
          checkResult: payload.checkResult
        };
      }
    },
    resultCreator: {
      create: async (payload) => {
        calls.steps.push('createResults');
        calls.createResults.push(payload);
        return createdResults;
      }
    },
    catalystUsage: {
      apply: async (payload) => {
        calls.steps.push('useCatalysts');
        calls.useCatalysts.push(payload);
        return usedCatalysts;
      }
    },
    localize: (key, data) => data ? `${key}:${JSON.stringify(data)}` : key
  });
}

function environment(overrides = {}) {
  return {
    id: 'env-a',
    craftingSystemId: 'system-a',
    name: 'Old Mine',
    description: 'A narrow mine.',
    enabled: true,
    selectionMode: 'targeted',
    sceneUuid: null,
    tasks: [task()],
    ...overrides
  };
}

function task(overrides = {}) {
  return {
    id: 'task-a',
    name: 'Gather Iron',
    description: 'Search for ore.',
    img: 'icons/svg/item-bag.svg',
    enabled: true,
    resolutionMode: 'routed',
    catalysts: [],
    resultGroups: [{ id: 'group-a', name: 'Iron', results: [] }],
    resultSelection: { provider: 'macroOutcome', macroUuid: 'Macro.outcome' },
    ...overrides
  };
}

function sameActor(left, right) {
  return Boolean(left && right && (left === right || left.id === right.id || left.uuid === right.uuid));
}

function codes(result) {
  return result.blockedReasons.map(reason => reason.code);
}

function assertNoRunMutation(calls) {
  assert.deepEqual(calls.createTerminalRun, []);
  assert.deepEqual(calls.createWaitingRun, []);
}

test('startAttempt resolves a fully guarded immediate task into terminal history', async () => {
  const calls = {};
  const immediateTask = task({
    resultGroups: [{
      id: 'group-a',
      name: 'Iron',
      results: [{ id: 'result-a', componentId: 'iron', quantity: 2 }]
    }]
  });
  const engine = makeEngine({
    environments: [environment({ tasks: [immediateTask] })],
    createdResults: [{ actorUuid: actor.uuid, itemUuid: 'Item.iron', quantity: 2 }],
    calls
  });

  const result = await engine.startAttempt({
    viewer,
    actor,
    environmentId: 'env-a',
    taskId: 'task-a'
  });

  assert.equal(result.accepted, true);
  assert.equal(result.started, true);
  assert.equal(result.state, 'succeeded');
  assert.equal(result.runStatus, 'succeeded');
  assert.equal(result.actorId, 'actor-1');
  assert.equal(result.environmentId, 'env-a');
  assert.equal(result.taskId, 'task-a');
  assert.deepEqual(result.blockedReasons, []);
  assert.deepEqual(calls.visibility, ['task-a']);
  assert.deepEqual(calls.activeRuns.map(call => call.taskId), ['task-a']);
  assert.deepEqual(calls.validate, []);
  assert.equal(calls.createTerminalRun.length, 1);
  assert.equal(calls.createTerminalRun[0][0], actor);
  assert.deepEqual(calls.createTerminalRun[0][1], {
    craftingSystemId: 'system-a',
    environmentId: 'env-a',
    taskId: 'task-a'
  });
  assert.equal(calls.createTerminalRun[0][2], 'succeeded');
  assert.deepEqual(calls.createTerminalRun[0][3], {
    createdResults: [],
    usedCatalysts: [],
    usedTools: [],
    checkResult: { outcome: 'Iron' }
  });
  assert.deepEqual(calls.createWaitingRun, []);
});

test('startAttempt creates one waitingTime run for a fully guarded timed task', async () => {
  const calls = {};
  const timedTask = task({
    id: 'timed-task',
    catalysts: [{ componentId: 'tool' }],
    timeRequirement: {
      hours: '1',
      minutes: 30,
      days: 0,
      ignored: 99
    }
  });
  const createdRun = {
    id: 'run-timed',
    status: 'waitingTime',
    craftingSystemId: 'system-a',
    environmentId: 'env-a',
    taskId: 'timed-task',
    timeGate: {
      requiredSeconds: 5400,
      availableAt: 6400,
      initiatedAt: 1000
    },
    usedCatalysts: [],
    createdResults: []
  };
  const engine = makeEngine({
    environments: [environment({ sceneUuid: 'Scene.old-mine', tasks: [timedTask] })],
    waitingRunResult: createdRun,
    calls
  });

  const result = await engine.startAttempt({
    viewer,
    actor,
    environmentId: 'env-a',
    taskId: 'timed-task'
  });

  assert.equal(result.accepted, true);
  assert.equal(result.started, true);
  assert.equal(result.state, 'waitingTime');
  assert.equal(result.runId, 'run-timed');
  assert.equal(result.runStatus, 'waitingTime');
  assert.deepEqual(result.run, createdRun);
  assert.deepEqual(result.timeGate, createdRun.timeGate);
  assert.deepEqual(result.blockedReasons, []);
  assert.deepEqual(calls.steps, [
    'pause',
    'scene',
    'visibility',
    'activeRun',
    'catalysts',
    'createWaitingRun'
  ]);
  assert.deepEqual(calls.createTerminalRun, []);
  assert.equal(calls.createWaitingRun.length, 1);
  assert.equal(calls.createWaitingRun[0].length, 3);
  assert.equal(calls.createWaitingRun[0][0], actor);
  assert.deepEqual(calls.createWaitingRun[0][1], {
    craftingSystemId: 'system-a',
    environmentId: 'env-a',
    taskId: 'timed-task'
  });
  assert.equal('usedCatalysts' in calls.createWaitingRun[0][1], false);
  assert.equal('createdResults' in calls.createWaitingRun[0][1], false);
  assert.deepEqual(calls.createWaitingRun[0][2], {
    hours: 1,
    minutes: 30
  });
});

test('startAttempt accepts selected valid targeted task when an unrelated task is misconfigured', async () => {
  const calls = {};
  const validTask = task({ id: 'valid-task', name: 'Gather Iron' });
  const invalidTask = task({
    id: 'invalid-task',
    name: 'Broken Gold Route',
    resultSelection: { provider: 'macroOutcome' }
  });
  const engine = makeEngine({
    environments: [environment({ tasks: [validTask, invalidTask] })],
    validation: { valid: false, errors: ['unrelated task is invalid'] },
    calls
  });

  const result = await engine.startAttempt({
    viewer,
    actor,
    environmentId: 'env-a',
    taskId: 'valid-task'
  });

  assert.equal(result.accepted, true);
  assert.equal(result.state, 'succeeded');
  assert.equal(result.taskId, 'valid-task');
  assert.deepEqual(result.blockedReasons, []);
  assert.deepEqual(calls.visibility, ['valid-task']);
  assert.deepEqual(calls.activeRuns.map(call => call.taskId), ['valid-task']);
  assert.deepEqual(calls.validate, []);
  assert.equal(calls.createTerminalRun.length, 1);
  assert.deepEqual(calls.createWaitingRun, []);
});

test('startAttempt rejects paused game before catalyst checks, validation, or run writes', async () => {
  const calls = {};
  const engine = makeEngine({
    paused: true,
    environments: [environment({ tasks: [task({ catalysts: [{ componentId: 'tool' }] })] })],
    calls
  });

  const result = await engine.startAttempt({ viewer, actor, environmentId: 'env-a', taskId: 'task-a' });

  assert.equal(result.accepted, false);
  assert.deepEqual(codes(result), ['GAME_PAUSED']);
  assert.deepEqual(calls.scene, []);
  assert.deepEqual(calls.visibility, []);
  assert.deepEqual(calls.activeRuns, []);
  assert.deepEqual(calls.catalysts, []);
  assert.deepEqual(calls.validate, []);
  assertNoRunMutation(calls);
});

test('startAttempt rejects missing references before later guards', async () => {
  const calls = {};
  const engine = makeEngine({ environments: [], calls });

  const result = await engine.startAttempt({ viewer, actor, environmentId: 'missing-env', taskId: 'task-a' });

  assert.equal(result.accepted, false);
  assert.deepEqual(codes(result), ['MISSING_REFERENCE']);
  assert.equal(result.environmentId, null);
  assert.equal(result.taskId, null);
  assert.deepEqual(calls.scene, []);
  assert.deepEqual(calls.visibility, []);
  assert.deepEqual(calls.activeRuns, []);
  assert.deepEqual(calls.catalysts, []);
  assert.deepEqual(calls.validate, []);
  assertNoRunMutation(calls);
});

test('startAttempt rejects missing system and task references without later guard calls', async () => {
  const missingSystemCalls = {};
  const missingSystemEngine = makeEngine({
    systems: [],
    calls: missingSystemCalls
  });

  const missingSystem = await missingSystemEngine.startAttempt({
    viewer,
    actor,
    environmentId: 'env-a',
    taskId: 'task-a'
  });

  assert.equal(missingSystem.accepted, false);
  assert.deepEqual(codes(missingSystem), ['MISSING_REFERENCE']);
  assert.deepEqual(missingSystemCalls.scene, []);
  assert.deepEqual(missingSystemCalls.visibility, []);
  assert.deepEqual(missingSystemCalls.catalysts, []);
  assertNoRunMutation(missingSystemCalls);

  const missingTaskCalls = {};
  const missingTaskEngine = makeEngine({ calls: missingTaskCalls });

  const missingTask = await missingTaskEngine.startAttempt({
    viewer,
    actor,
    environmentId: 'env-a',
    taskId: 'missing-task'
  });

  assert.equal(missingTask.accepted, false);
  assert.deepEqual(codes(missingTask), ['MISSING_REFERENCE']);
  assert.deepEqual(missingTaskCalls.scene, []);
  assert.deepEqual(missingTaskCalls.visibility, []);
  assert.deepEqual(missingTaskCalls.catalysts, []);
  assertNoRunMutation(missingTaskCalls);
});

test('startAttempt rejects disabled gathering systems before record guards', async () => {
  const calls = {};
  const engine = makeEngine({
    systems: [{ id: 'system-a', enabled: true, features: { gathering: false }, components: [] }],
    calls
  });

  const result = await engine.startAttempt({ viewer, actor, environmentId: 'env-a', taskId: 'task-a' });

  assert.equal(result.accepted, false);
  assert.deepEqual(codes(result), ['SYSTEM_DISABLED']);
  assert.deepEqual(calls.scene, []);
  assert.deepEqual(calls.visibility, []);
  assert.deepEqual(calls.catalysts, []);
  assertNoRunMutation(calls);
});

test('startAttempt rejects disabled environment and disabled task before visibility or catalysts', async () => {
  const environmentCalls = {};
  const disabledEnvironmentEngine = makeEngine({
    environments: [environment({ enabled: false, tasks: [task({ catalysts: [{ componentId: 'tool' }] })] })],
    calls: environmentCalls
  });

  const disabledEnvironment = await disabledEnvironmentEngine.startAttempt({
    viewer,
    actor,
    environmentId: 'env-a',
    taskId: 'task-a'
  });

  assert.equal(disabledEnvironment.accepted, false);
  assert.deepEqual(codes(disabledEnvironment), ['ENVIRONMENT_DISABLED']);
  assert.deepEqual(environmentCalls.visibility, []);
  assert.deepEqual(environmentCalls.catalysts, []);
  assertNoRunMutation(environmentCalls);

  const taskCalls = {};
  const disabledTaskEngine = makeEngine({
    environments: [environment({ tasks: [task({ enabled: false, catalysts: [{ componentId: 'tool' }] })] })],
    calls: taskCalls
  });

  const disabledTask = await disabledTaskEngine.startAttempt({
    viewer,
    actor,
    environmentId: 'env-a',
    taskId: 'task-a'
  });

  assert.equal(disabledTask.accepted, false);
  assert.deepEqual(codes(disabledTask), ['TASK_DISABLED']);
  assert.deepEqual(taskCalls.visibility, []);
  assert.deepEqual(taskCalls.catalysts, []);
  assertNoRunMutation(taskCalls);
});

test('startAttempt rejects actors that are not selectable before environment gate checks', async () => {
  const calls = {};
  const unownedActor = { id: 'actor-2', uuid: 'Actor.actor-2', name: 'Unowned' };
  const engine = makeEngine({ selectableActors: [actor], calls });

  const result = await engine.startAttempt({
    viewer,
    actor: unownedActor,
    environmentId: 'env-a',
    taskId: 'task-a'
  });

  assert.equal(result.accepted, false);
  assert.deepEqual(codes(result), ['ACTOR_NOT_SELECTABLE']);
  assert.deepEqual(calls.scene, []);
  assert.deepEqual(calls.visibility, []);
  assert.deepEqual(calls.catalysts, []);
  assertNoRunMutation(calls);
});

test('startAttempt rejects scene/token blockers before visibility, duplicate, catalysts, or validation', async () => {
  const calls = {};
  const engine = makeEngine({
    environments: [environment({ sceneUuid: 'Scene.old-mine', tasks: [task({ catalysts: [{ componentId: 'tool' }] })] })],
    sceneAccess: { allowed: false, code: 'SCENE_TOKEN_BLOCKED', messageKey: 'FABRICATE.Gathering.Blocked.TokenMissing' },
    calls
  });

  const result = await engine.startAttempt({ viewer, actor, environmentId: 'env-a', taskId: 'task-a' });

  assert.equal(result.accepted, false);
  assert.deepEqual(codes(result), ['SCENE_TOKEN_BLOCKED']);
  assert.equal(calls.scene.length, 1);
  assert.deepEqual(calls.visibility, []);
  assert.deepEqual(calls.activeRuns, []);
  assert.deepEqual(calls.catalysts, []);
  assert.deepEqual(calls.validate, []);
  assertNoRunMutation(calls);
});

test('startAttempt fails closed for scene-linked environments without a sceneAccess implementation', async () => {
  const calls = {};
  const engine = makeEngine({
    environments: [environment({ sceneUuid: 'Scene.old-mine', tasks: [task({ catalysts: [{ componentId: 'tool' }] })] })],
    sceneAccessCollaborator: {},
    calls
  });

  const result = await engine.startAttempt({ viewer, actor, environmentId: 'env-a', taskId: 'task-a' });

  assert.equal(result.accepted, false);
  assert.deepEqual(codes(result), ['SCENE_TOKEN_BLOCKED']);
  assert.deepEqual(calls.scene, []);
  assert.deepEqual(calls.visibility, []);
  assert.deepEqual(calls.activeRuns, []);
  assert.deepEqual(calls.catalysts, []);
  assert.deepEqual(calls.validate, []);
  assertNoRunMutation(calls);
});

test('startAttempt rejects hidden visibility before duplicate active run or catalysts', async () => {
  const calls = {};
  const engine = makeEngine({
    environments: [environment({ tasks: [task({ catalysts: [{ componentId: 'tool' }] })] })],
    visibility: new Map([['task-a', { visible: false, reasonCode: 'HIDDEN', diagnostic: { taskId: 'task-a' } }]]),
    activeRuns: new Map([['task-a', { id: 'run-active', taskId: 'task-a' }]]),
    calls
  });

  const result = await engine.startAttempt({ viewer, actor, environmentId: 'env-a', taskId: 'task-a' });

  assert.equal(result.accepted, false);
  assert.deepEqual(codes(result), ['TASK_HIDDEN']);
  assert.deepEqual(calls.visibility, ['task-a']);
  assert.deepEqual(calls.activeRuns, []);
  assert.deepEqual(calls.catalysts, []);
  assert.deepEqual(calls.validate, []);
  assertNoRunMutation(calls);
});

test('startAttempt rejects duplicate active run before catalyst availability or validation', async () => {
  const calls = {};
  const engine = makeEngine({
    environments: [environment({ tasks: [task({ catalysts: [{ componentId: 'tool' }] })] })],
    activeRuns: new Map([['task-a', { id: 'run-active', taskId: 'task-a' }]]),
    calls
  });

  const result = await engine.startAttempt({ viewer, actor, environmentId: 'env-a', taskId: 'task-a' });

  assert.equal(result.accepted, false);
  assert.deepEqual(codes(result), ['DUPLICATE_ACTIVE_RUN']);
  assert.deepEqual(calls.activeRuns.map(call => call.taskId), ['task-a']);
  assert.deepEqual(calls.catalysts, []);
  assert.deepEqual(calls.validate, []);
  assertNoRunMutation(calls);
});

test('startAttempt rejects timed task with an existing active run before waiting run creation', async () => {
  const calls = {};
  const timedTask = task({
    id: 'timed-task',
    catalysts: [{ componentId: 'tool' }],
    timeRequirement: { hours: 1 }
  });
  const engine = makeEngine({
    environments: [environment({ tasks: [timedTask] })],
    activeRuns: new Map([['timed-task', { id: 'run-active', taskId: 'timed-task' }]]),
    calls
  });

  const result = await engine.startAttempt({ viewer, actor, environmentId: 'env-a', taskId: 'timed-task' });

  assert.equal(result.accepted, false);
  assert.deepEqual(codes(result), ['DUPLICATE_ACTIVE_RUN']);
  assert.deepEqual(calls.activeRuns.map(call => call.taskId), ['timed-task']);
  assert.deepEqual(calls.catalysts, []);
  assert.deepEqual(calls.createWaitingRun, []);
});

test('startAttempt rejects missing catalysts before task misconfiguration validation', async () => {
  const calls = {};
  const engine = makeEngine({
    environments: [environment({ tasks: [task({ catalysts: [{ componentId: 'tool' }] })] })],
    catalystAvailability: { available: false, missing: [{ componentId: 'tool' }] },
    validation: { valid: false, errors: ['task is invalid'] },
    calls
  });

  const result = await engine.startAttempt({ viewer, actor, environmentId: 'env-a', taskId: 'task-a' });

  assert.equal(result.accepted, false);
  assert.deepEqual(codes(result), ['CATALYST_BLOCKED']);
  assert.equal(calls.catalysts.length, 1);
  assert.equal(calls.catalysts[0].actor, actor);
  assert.equal('actors' in calls.catalysts[0], false);
  assert.equal('componentSourceActors' in calls.catalysts[0], false);
  assert.deepEqual(calls.validate, []);
  assertNoRunMutation(calls);
});

test('startAttempt evaluates rich node, stamina, and attempt-limit blockers before task validation', async () => {
  const calls = {};
  const richTask = task({
    nodes: { current: 0, max: 2, depletionTiming: 'onStart', respawn: { policy: 'manual' } },
    staminaCost: 5,
    attemptLimit: { scope: 'actor', max: 1 }
  });
  const richState = {
    evaluateStart: async () => ({
      blockedReasons: [
        { code: 'NODE_DEPLETED', messageKey: 'FABRICATE.Gathering.Blocked.NodeDepleted' },
        { code: 'STAMINA_BLOCKED', messageKey: 'FABRICATE.Gathering.Blocked.StaminaBlocked' }
      ],
      evidence: {
        nodes: { current: 0, max: 2 },
        stamina: { cost: 5, state: { current: 0, max: 10 } }
      }
    })
  };
  const engine = makeEngine({
    environments: [environment({ tasks: [richTask] })],
    richState,
    validation: () => {
      throw new Error('validation should not run after rich blockers');
    },
    calls
  });

  const result = await engine.startAttempt({ viewer, actor, environmentId: 'env-a', taskId: 'task-a' });

  assert.equal(result.accepted, false);
  assert.deepEqual(codes(result), ['NODE_DEPLETED']);
  assertNoRunMutation(calls);
  assert.equal(calls.validate.length, 0);
});

test('startAttempt rejects timed task with missing catalysts before waiting run creation', async () => {
  const calls = {};
  const timedTask = task({
    id: 'timed-task',
    catalysts: [{ componentId: 'tool' }],
    timeRequirement: { hours: 1 }
  });
  const engine = makeEngine({
    environments: [environment({ tasks: [timedTask] })],
    catalystAvailability: { available: false, missing: [{ componentId: 'tool' }] },
    calls
  });

  const result = await engine.startAttempt({ viewer, actor, environmentId: 'env-a', taskId: 'timed-task' });

  assert.equal(result.accepted, false);
  assert.deepEqual(codes(result), ['CATALYST_BLOCKED']);
  assert.equal(calls.catalysts.length, 1);
  assert.deepEqual(calls.createWaitingRun, []);
});

test('startAttempt rejects task misconfiguration after catalysts but before run writes', async () => {
  const calls = {};
  const engine = makeEngine({
    environments: [environment({ tasks: [task({ resultSelection: { provider: 'macroOutcome' } })] })],
    validation: { valid: false, errors: ['routed task requires a macroUuid'] },
    calls
  });

  const result = await engine.startAttempt({ viewer, actor, environmentId: 'env-a', taskId: 'task-a' });

  assert.equal(result.accepted, false);
  assert.deepEqual(codes(result), ['TASK_MISCONFIGURED']);
  assert.deepEqual(result.blockedReasons[0].data.errors, ['Routed macro outcome gathering task requires a macro UUID']);
  assert.deepEqual(calls.validate, []);
  assertNoRunMutation(calls);
});

test('startAttempt rejects timed task misconfiguration before waiting run creation', async () => {
  const calls = {};
  const engine = makeEngine({
    environments: [environment({
      tasks: [task({
        id: 'timed-task',
        resultSelection: { provider: 'macroOutcome' },
        timeRequirement: { hours: 1 }
      })]
    })],
    calls
  });

  const result = await engine.startAttempt({ viewer, actor, environmentId: 'env-a', taskId: 'timed-task' });

  assert.equal(result.accepted, false);
  assert.deepEqual(codes(result), ['TASK_MISCONFIGURED']);
  assert.deepEqual(calls.createWaitingRun, []);
});

test('startAttempt rejects invalid timed task gate before waiting run creation', async () => {
  const calls = {};
  const engine = makeEngine({
    environments: [environment({
      tasks: [task({
        id: 'timed-task',
        timeRequirement: { minutes: 0, hours: 'nope' }
      })]
    })],
    calls
  });

  const result = await engine.startAttempt({ viewer, actor, environmentId: 'env-a', taskId: 'timed-task' });

  assert.equal(result.accepted, false);
  assert.deepEqual(codes(result), ['TASK_MISCONFIGURED']);
  assert.deepEqual(calls.createWaitingRun, []);
});

test('non-GM blind hidden start response does not expose task identity or visibility details', async () => {
  const calls = {};
  const blindTask = task({
    id: 'secret-mooncap-task',
    name: 'Secret Mooncap Patch',
    catalysts: [{ componentId: 'silver-sickle' }]
  });
  const engine = makeEngine({
    environments: [environment({
      selectionMode: 'blind',
      tasks: [blindTask]
    })],
    visibility: new Map([[
      blindTask.id,
      {
        visible: false,
        reasonCode: 'SECRET_MOONCAP_HIDDEN',
        description: 'Secret Mooncap Patch is concealed',
        diagnostic: { taskId: blindTask.id, componentId: 'silver-sickle' }
      }
    ]]),
    calls
  });

  const result = await engine.startAttempt({ viewer, actor, environmentId: 'env-a' });
  const serialized = JSON.stringify(result);

  assert.equal(result.accepted, false);
  assert.deepEqual(codes(result), ['TASK_HIDDEN']);
  assert.equal(result.taskId, null);
  assert.equal(serialized.includes('secret-mooncap-task'), false);
  assert.equal(serialized.includes('Secret Mooncap Patch'), false);
  assert.equal(serialized.includes('SECRET_MOONCAP_HIDDEN'), false);
  assert.equal(serialized.includes('silver-sickle'), false);
  assert.deepEqual(result.blockedReasons[0].data, null);
  assert.deepEqual(calls.catalysts, []);
  assertNoRunMutation(calls);
});

test('non-GM blind start response does not expose task identity when waiting run creation fails', async () => {
  const calls = {};
  const blindTask = task({
    id: 'secret-mooncap-task',
    name: 'Secret Mooncap Patch',
    timeRequirement: { hours: 1 }
  });
  const engine = makeEngine({
    environments: [environment({
      selectionMode: 'blind',
      tasks: [blindTask]
    })],
    waitingRunError: new Error('Secret Mooncap Patch failed for secret-mooncap-task'),
    calls
  });

  const result = await engine.startAttempt({ viewer, actor, environmentId: 'env-a' });
  const serialized = JSON.stringify(result);

  assert.equal(result.accepted, false);
  assert.deepEqual(codes(result), ['RUN_CREATION_FAILED']);
  assert.equal(result.taskId, null);
  assert.equal(serialized.includes('secret-mooncap-task'), false);
  assert.equal(serialized.includes('Secret Mooncap Patch'), false);
  assert.deepEqual(result.blockedReasons[0].data, null);
  assert.equal(calls.createWaitingRun.length, 1);
});

test('non-GM blind start response does not expose task identity when waiting run creation returns diagnostics', async () => {
  const calls = {};
  const blindTask = task({
    id: 'secret-mooncap-task',
    name: 'Secret Mooncap Patch',
    timeRequirement: { hours: 1 }
  });
  const engine = makeEngine({
    environments: [environment({
      selectionMode: 'blind',
      tasks: [blindTask]
    })],
    waitingRunResult: {
      diagnostics: [{ taskId: blindTask.id, message: 'Secret Mooncap Patch failed' }]
    },
    calls
  });

  const result = await engine.startAttempt({ viewer, actor, environmentId: 'env-a' });
  const serialized = JSON.stringify(result);

  assert.equal(result.accepted, false);
  assert.deepEqual(codes(result), ['RUN_CREATION_FAILED']);
  assert.equal(result.taskId, null);
  assert.equal(serialized.includes('secret-mooncap-task'), false);
  assert.equal(serialized.includes('Secret Mooncap Patch'), false);
  assert.deepEqual(result.blockedReasons[0].data, null);
  assert.equal(calls.createWaitingRun.length, 1);
});

test('non-GM blind misconfigured start response does not expose task identity, catalyst, or visibility details', async () => {
  const calls = {};
  const blindTask = task({
    id: 'secret-mooncap-task',
    name: 'Secret Mooncap Patch',
    catalysts: [{ componentId: 'silver-sickle' }],
    resultSelection: { provider: 'macroOutcome' }
  });
  const engine = makeEngine({
    environments: [environment({
      selectionMode: 'blind',
      tasks: [blindTask]
    })],
    visibility: new Map([[
      blindTask.id,
      {
        visible: true,
        reasonCode: 'SECRET_MOONCAP_VISIBLE',
        description: 'Secret Mooncap Patch',
        diagnostic: { taskId: blindTask.id, componentId: 'silver-sickle' }
      }
    ]]),
    calls
  });

  const result = await engine.startAttempt({ viewer, actor, environmentId: 'env-a' });
  const serialized = JSON.stringify(result);

  assert.equal(result.accepted, false);
  assert.deepEqual(codes(result), ['TASK_MISCONFIGURED']);
  assert.equal(result.taskId, null);
  assert.equal(serialized.includes('secret-mooncap-task'), false);
  assert.equal(serialized.includes('Secret Mooncap Patch'), false);
  assert.equal(serialized.includes('SECRET_MOONCAP_VISIBLE'), false);
  assert.equal(serialized.includes('silver-sickle'), false);
  assert.deepEqual(result.blockedReasons[0].data, null);
  assert.equal(calls.catalysts.length, 1);
  assertNoRunMutation(calls);
});

test('non-GM blind blocked start response does not expose task identity in duplicate or catalyst data', async () => {
  const calls = {};
  const blindTask = task({
    id: 'secret-mooncap-task',
    name: 'Secret Mooncap Patch',
    catalysts: [{ componentId: 'silver-sickle' }]
  });
  const engine = makeEngine({
    environments: [environment({
      selectionMode: 'blind',
      tasks: [blindTask]
    })],
    activeRuns: new Map([[blindTask.id, { id: 'run-active', taskId: blindTask.id }]]),
    catalystAvailability: { available: false, missing: [{ componentId: 'silver-sickle', taskId: blindTask.id }] },
    calls
  });

  const result = await engine.startAttempt({ viewer, actor, environmentId: 'env-a' });
  const serialized = JSON.stringify(result);

  assert.equal(result.accepted, false);
  assert.deepEqual(codes(result), ['DUPLICATE_ACTIVE_RUN']);
  assert.equal(result.taskId, null);
  assert.equal(serialized.includes('secret-mooncap-task'), false);
  assert.equal(serialized.includes('Secret Mooncap Patch'), false);
  assert.equal(serialized.includes('silver-sickle'), false);
  assert.deepEqual(result.blockedReasons[0].data, null);
  assertNoRunMutation(calls);
});

test('non-GM blind catalyst-blocked start response does not expose missing catalyst details', async () => {
  const calls = {};
  const blindTask = task({
    id: 'secret-mooncap-task',
    name: 'Secret Mooncap Patch',
    catalysts: [{ componentId: 'silver-sickle' }]
  });
  const engine = makeEngine({
    environments: [environment({
      selectionMode: 'blind',
      tasks: [blindTask]
    })],
    catalystAvailability: { available: false, missing: [{ componentId: 'silver-sickle', taskId: blindTask.id }] },
    calls
  });

  const result = await engine.startAttempt({ viewer, actor, environmentId: 'env-a' });
  const serialized = JSON.stringify(result);

  assert.equal(result.accepted, false);
  assert.deepEqual(codes(result), ['CATALYST_BLOCKED']);
  assert.equal(result.taskId, null);
  assert.equal(serialized.includes('secret-mooncap-task'), false);
  assert.equal(serialized.includes('Secret Mooncap Patch'), false);
  assert.equal(serialized.includes('silver-sickle'), false);
  assert.deepEqual(result.blockedReasons[0].data, null);
  assertNoRunMutation(calls);
});

test('GM blind blocked start response may expose task identity for inspection', async () => {
  const blindTask = task({
    id: 'secret-mooncap-task',
    name: 'Secret Mooncap Patch'
  });
  const engine = makeEngine({
    environments: [environment({
      selectionMode: 'blind',
      tasks: [blindTask]
    })],
    activeRuns: new Map([[blindTask.id, { id: 'run-active', taskId: blindTask.id }]])
  });

  const result = await engine.startAttempt({ viewer: gmViewer, actor, environmentId: 'env-a' });

  assert.equal(result.accepted, false);
  assert.equal(result.taskId, 'secret-mooncap-task');
  assert.deepEqual(result.blockedReasons[0].data, { taskId: 'secret-mooncap-task' });
});
