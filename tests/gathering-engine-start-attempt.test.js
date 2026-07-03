import test from 'node:test';
import assert from 'node:assert/strict';

import { GatheringEngine } from '../src/systems/GatheringEngine.js';
import { routedRoll, routedSystemCheck } from './helpers/gathering.js';

const viewer = { id: 'user-1', isGM: false };
const gmViewer = { id: 'gm-1', isGM: true };
const actor = {
  id: 'actor-1',
  uuid: 'Actor.actor-1',
  name: 'Gatherer',
  items: []
};

// A gathering system with no routed roll formula: routed tasks under it are
// misconfigured (validation requires the system-level gathering check formula).
function systemWithoutRoutedCheck() {
  return { id: 'system-a', enabled: true, features: { gathering: true }, components: [] };
}

function makeEngine({
  systems = [{ id: 'system-a', enabled: true, features: { gathering: true }, components: [], gatheringCraftingCheck: routedSystemCheck({ failureTierName: 'Barren' }) }],
  environments = [environment()],
  selectableActors = [actor],
  paused = false,
  visibility = new Map(),
  sceneAccess = null,
  sceneAccessCollaborator = null,
  activeRuns = new Map(),
  toolAvailability = null,
  validation = null,
  waitingRunResult = null,
  waitingRunError = null,
  progressiveOutcome = null,
  createdResults = [],
  usedTools = [],
  richState = null,
  random = Math.random,
  calls = {}
} = {}) {
  calls.steps = [];
  calls.visibility = [];
  calls.scene = [];
  calls.tools = [];
  calls.activeRuns = [];
  calls.validate = [];
  calls.createTerminalRun = [];
  calls.createWaitingRun = [];
  calls.resolveProgressive = [];
  calls.evaluateCheck = [];
  calls.createResults = [];
  calls.applyTools = [];

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
    toolAvailability: {
      check: (payload) => {
        calls.steps.push('tools');
        calls.tools.push(payload);
        if (typeof toolAvailability === 'function') return toolAvailability(payload);
        return toolAvailability ?? { available: true, missing: [], failedRequirements: [] };
      }
    },
    resultResolver: {
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
    toolBreakage: {
      apply: async (payload) => {
        calls.steps.push('applyTools');
        calls.applyTools.push(payload);
        return usedTools;
      }
    },
    random,
    localize: (key, data) => data ? `${key}:${JSON.stringify(data)}` : key
  });
}

const LIBRARY_TOOLS = [
  { id: 'tool-tool', componentId: 'tool', enabled: true },
  { id: 'tool-sickle', componentId: 'silver-sickle', enabled: true },
  { id: 'tool-herb', componentId: 'rare-herb', enabled: true }
];

function environment(overrides = {}) {
  const env = {
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
  // The production composed environment exposes a non-enumerable `__libraryTools`
  // Map resolving task `toolIds` to per-system library Tools.
  Object.defineProperty(env, '__libraryTools', {
    value: new Map(LIBRARY_TOOLS.map(t => [t.id, t])),
    enumerable: false,
    configurable: true
  });
  return env;
}

function task(overrides = {}) {
  return {
    id: 'task-a',
    name: 'Gather Iron',
    description: 'Search for ore.',
    img: 'icons/svg/item-bag.svg',
    enabled: true,
    resolutionMode: 'routed',
    toolIds: [],
    resultGroups: [{ id: 'group-a', name: 'Iron', results: [] }],
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

  let result;
  routedRoll(true);
  try {
    result = await engine.startAttempt({
      viewer,
      actor,
      environmentId: 'env-a',
      taskId: 'task-a'
    });
  } finally {
    delete globalThis.Roll;
  }

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
  assert.deepEqual(calls.createTerminalRun[0][3].createdResults, []);
  assert.deepEqual(calls.createTerminalRun[0][3].usedTools, []);
  assert.equal(calls.createTerminalRun[0][3].checkResult.outcome, 'Iron');
  assert.equal(calls.createTerminalRun[0][3].checkResult.success, true);
  assert.deepEqual(calls.createWaitingRun, []);
});

test('startAttempt creates one waitingTime run for a fully guarded timed task', async () => {
  const calls = {};
  const timedTask = task({
    id: 'timed-task',
    toolIds: ['tool-tool'],
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
    usedTools: [],
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
    'tools',
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
  assert.equal('usedTools' in calls.createWaitingRun[0][1], false);
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
    name: 'Broken Gold Route'
  });
  const engine = makeEngine({
    environments: [environment({ tasks: [validTask, invalidTask] })],
    validation: { valid: false, errors: ['unrelated task is invalid'] },
    calls
  });

  let result;
  routedRoll(true);
  try {
    result = await engine.startAttempt({
      viewer,
      actor,
      environmentId: 'env-a',
      taskId: 'valid-task'
    });
  } finally {
    delete globalThis.Roll;
  }

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

test('startAttempt rejects paused game before tool checks, validation, or run writes', async () => {
  const calls = {};
  const engine = makeEngine({
    paused: true,
    environments: [environment({ tasks: [task({ toolIds: ['tool-tool'] })] })],
    calls
  });

  const result = await engine.startAttempt({ viewer, actor, environmentId: 'env-a', taskId: 'task-a' });

  assert.equal(result.accepted, false);
  assert.deepEqual(codes(result), ['GAME_PAUSED']);
  assert.deepEqual(calls.scene, []);
  assert.deepEqual(calls.visibility, []);
  assert.deepEqual(calls.activeRuns, []);
  assert.deepEqual(calls.tools, []);
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
  assert.deepEqual(calls.tools, []);
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
  assert.deepEqual(missingSystemCalls.tools, []);
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
  assert.deepEqual(missingTaskCalls.tools, []);
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
  assert.deepEqual(calls.tools, []);
  assertNoRunMutation(calls);
});

// A `blocks: 'system'` gathering system (issue 429): gathering is ENABLED, so it
// passes the pre-existing features.gathering guard, but multi-step recipes left on
// in alchemy mode is a structural system-validation blocker (needs no recipes to
// fire). The start-path system-validity guard must reject a non-GM attempt while a
// GM bypasses it.
const blockedGatheringSystem = {
  id: 'system-a',
  enabled: true,
  features: { gathering: true, multiStepRecipes: true },
  resolutionMode: 'alchemy',
  components: [],
  gatheringCraftingCheck: routedSystemCheck()
};

test('startAttempt rejects a system-blocked system for a non-GM before record guards', async () => {
  const calls = {};
  const engine = makeEngine({ systems: [blockedGatheringSystem], calls });

  const result = await engine.startAttempt({ viewer, actor, environmentId: 'env-a', taskId: 'task-a' });

  assert.equal(result.accepted, false);
  assert.deepEqual(codes(result), ['SYSTEM_DISABLED']);
  assert.deepEqual(calls.scene, []);
  assert.deepEqual(calls.visibility, []);
  assert.deepEqual(calls.tools, []);
  assertNoRunMutation(calls);
});

test('startAttempt does not reject a system-blocked system for a GM (GM bypass)', async () => {
  const calls = {};
  const engine = makeEngine({ systems: [blockedGatheringSystem], calls });

  const result = await engine.startAttempt({ viewer: gmViewer, actor, environmentId: 'env-a', taskId: 'task-a' });

  // The GM bypasses the system-validity guard: whatever the eventual outcome, it
  // is NOT the SYSTEM_DISABLED rejection from this branch, and the attempt reached
  // the downstream record guards a non-GM (blocked at the gate) never gets to.
  assert.equal(codes(result).includes('SYSTEM_DISABLED'), false, 'GM bypasses the system-blocker guard');
  assert.ok(
    calls.activeRuns.length > 0,
    'GM attempt reached the active-run guard past the system-validity gate'
  );
});

test('startAttempt rejects disabled environment and disabled task before visibility or tools', async () => {
  const environmentCalls = {};
  const disabledEnvironmentEngine = makeEngine({
    environments: [environment({ enabled: false, tasks: [task({ toolIds: ['tool-tool'] })] })],
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
  assert.deepEqual(environmentCalls.tools, []);
  assertNoRunMutation(environmentCalls);

  const taskCalls = {};
  const disabledTaskEngine = makeEngine({
    environments: [environment({ tasks: [task({ enabled: false, toolIds: ['tool-tool'] })] })],
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
  assert.deepEqual(taskCalls.tools, []);
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
  assert.deepEqual(calls.tools, []);
  assertNoRunMutation(calls);
});

test('startAttempt rejects scene/token blockers before visibility, duplicate, tools, or validation', async () => {
  const calls = {};
  const engine = makeEngine({
    environments: [environment({ sceneUuid: 'Scene.old-mine', tasks: [task({ toolIds: ['tool-tool'] })] })],
    sceneAccess: { allowed: false, code: 'SCENE_TOKEN_BLOCKED', messageKey: 'FABRICATE.Gathering.Blocked.TokenMissing' },
    calls
  });

  const result = await engine.startAttempt({ viewer, actor, environmentId: 'env-a', taskId: 'task-a' });

  assert.equal(result.accepted, false);
  assert.deepEqual(codes(result), ['SCENE_TOKEN_BLOCKED']);
  assert.equal(calls.scene.length, 1);
  assert.deepEqual(calls.visibility, []);
  assert.deepEqual(calls.activeRuns, []);
  assert.deepEqual(calls.tools, []);
  assert.deepEqual(calls.validate, []);
  assertNoRunMutation(calls);
});

test('startAttempt fails closed for scene-linked environments without a sceneAccess implementation', async () => {
  const calls = {};
  const engine = makeEngine({
    environments: [environment({ sceneUuid: 'Scene.old-mine', tasks: [task({ toolIds: ['tool-tool'] })] })],
    sceneAccessCollaborator: {},
    calls
  });

  const result = await engine.startAttempt({ viewer, actor, environmentId: 'env-a', taskId: 'task-a' });

  assert.equal(result.accepted, false);
  assert.deepEqual(codes(result), ['SCENE_TOKEN_BLOCKED']);
  assert.deepEqual(calls.scene, []);
  assert.deepEqual(calls.visibility, []);
  assert.deepEqual(calls.activeRuns, []);
  assert.deepEqual(calls.tools, []);
  assert.deepEqual(calls.validate, []);
  assertNoRunMutation(calls);
});

test('startAttempt rejects hidden visibility before duplicate active run or tools', async () => {
  const calls = {};
  const engine = makeEngine({
    environments: [environment({ tasks: [task({ toolIds: ['tool-tool'] })] })],
    visibility: new Map([['task-a', { visible: false, reasonCode: 'HIDDEN', diagnostic: { taskId: 'task-a' } }]]),
    activeRuns: new Map([['task-a', { id: 'run-active', taskId: 'task-a' }]]),
    calls
  });

  const result = await engine.startAttempt({ viewer, actor, environmentId: 'env-a', taskId: 'task-a' });

  assert.equal(result.accepted, false);
  assert.deepEqual(codes(result), ['TASK_HIDDEN']);
  assert.deepEqual(calls.visibility, ['task-a']);
  assert.deepEqual(calls.activeRuns, []);
  assert.deepEqual(calls.tools, []);
  assert.deepEqual(calls.validate, []);
  assertNoRunMutation(calls);
});

test('startAttempt rejects duplicate active run before tool availability or validation', async () => {
  const calls = {};
  const engine = makeEngine({
    environments: [environment({ tasks: [task({ toolIds: ['tool-tool'] })] })],
    activeRuns: new Map([['task-a', { id: 'run-active', taskId: 'task-a' }]]),
    calls
  });

  const result = await engine.startAttempt({ viewer, actor, environmentId: 'env-a', taskId: 'task-a' });

  assert.equal(result.accepted, false);
  assert.deepEqual(codes(result), ['DUPLICATE_ACTIVE_RUN']);
  assert.deepEqual(calls.activeRuns.map(call => call.taskId), ['task-a']);
  assert.deepEqual(calls.tools, []);
  assert.deepEqual(calls.validate, []);
  assertNoRunMutation(calls);
});

test('startAttempt rejects timed task with an existing active run before waiting run creation', async () => {
  const calls = {};
  const timedTask = task({
    id: 'timed-task',
    toolIds: ['tool-tool'],
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
  assert.deepEqual(calls.tools, []);
  assert.deepEqual(calls.createWaitingRun, []);
});

test('startAttempt rejects missing tools before task misconfiguration validation', async () => {
  const calls = {};
  const engine = makeEngine({
    environments: [environment({ tasks: [task({ toolIds: ['tool-tool'] })] })],
    toolAvailability: { available: false, missing: [{ componentId: 'tool' }] },
    validation: { valid: false, errors: ['task is invalid'] },
    calls
  });

  const result = await engine.startAttempt({ viewer, actor, environmentId: 'env-a', taskId: 'task-a' });

  assert.equal(result.accepted, false);
  assert.deepEqual(codes(result), ['TOOL_BLOCKED']);
  assert.equal(calls.tools.length, 1);
  assert.equal(calls.tools[0].actor, actor);
  assert.equal('actors' in calls.tools[0], false);
  assert.equal('componentSourceActors' in calls.tools[0], false);
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

test('startAttempt rejects timed task with missing tools before waiting run creation', async () => {
  const calls = {};
  const timedTask = task({
    id: 'timed-task',
    toolIds: ['tool-tool'],
    timeRequirement: { hours: 1 }
  });
  const engine = makeEngine({
    environments: [environment({ tasks: [timedTask] })],
    toolAvailability: { available: false, missing: [{ componentId: 'tool' }] },
    calls
  });

  const result = await engine.startAttempt({ viewer, actor, environmentId: 'env-a', taskId: 'timed-task' });

  assert.equal(result.accepted, false);
  assert.deepEqual(codes(result), ['TOOL_BLOCKED']);
  assert.equal(calls.tools.length, 1);
  assert.deepEqual(calls.createWaitingRun, []);
});

test('startAttempt rejects task misconfiguration after tools but before run writes', async () => {
  const calls = {};
  const engine = makeEngine({
    // No system routed roll formula → the routed task is misconfigured.
    systems: [systemWithoutRoutedCheck()],
    calls
  });

  const result = await engine.startAttempt({ viewer, actor, environmentId: 'env-a', taskId: 'task-a' });

  assert.equal(result.accepted, false);
  assert.deepEqual(codes(result), ['TASK_MISCONFIGURED']);
  assert.deepEqual(result.blockedReasons[0].data.errors, ['Routed gathering task requires a system-level gathering check roll formula']);
  assert.deepEqual(calls.validate, []);
  assertNoRunMutation(calls);
});

test('startAttempt rejects timed task misconfiguration before waiting run creation', async () => {
  const calls = {};
  const engine = makeEngine({
    systems: [systemWithoutRoutedCheck()],
    environments: [environment({
      tasks: [task({
        id: 'timed-task',
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
    toolIds: ['tool-sickle']
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
  // The sole task is concealed by its visibility gate, so it is never a blind
  // candidate; the player gets an opaque "nothing to gather" response.
  assert.deepEqual(codes(result), ['BLIND_NO_CANDIDATE']);
  assert.equal(result.taskId, null);
  assert.equal(serialized.includes('secret-mooncap-task'), false);
  assert.equal(serialized.includes('Secret Mooncap Patch'), false);
  assert.equal(serialized.includes('SECRET_MOONCAP_HIDDEN'), false);
  assert.equal(serialized.includes('silver-sickle'), false);
  assert.deepEqual(result.blockedReasons[0].data, null);
  assert.deepEqual(calls.tools, []);
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

test('non-GM blind misconfigured start response does not expose task identity, tool, or visibility details', async () => {
  const calls = {};
  const blindTask = task({
    id: 'secret-mooncap-task',
    name: 'Secret Mooncap Patch',
    toolIds: ['tool-sickle']
  });
  const engine = makeEngine({
    // No system routed roll formula → the routed task is misconfigured.
    systems: [systemWithoutRoutedCheck()],
    environments: [environment({
      selectionMode: 'blind',
      rules: { blindCandidateGate: 'allMatching' },
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
  assert.equal(calls.tools.length, 1);
  assertNoRunMutation(calls);
});

test('non-GM blind blocked start response does not expose task identity in duplicate or tool data', async () => {
  const calls = {};
  const blindTask = task({
    id: 'secret-mooncap-task',
    name: 'Secret Mooncap Patch',
    toolIds: ['tool-sickle']
  });
  const engine = makeEngine({
    environments: [environment({
      selectionMode: 'blind',
      rules: { blindCandidateGate: 'allMatching' },
      tasks: [blindTask]
    })],
    activeRuns: new Map([[blindTask.id, { id: 'run-active', taskId: blindTask.id }]]),
    toolAvailability: { available: false, missing: [{ componentId: 'silver-sickle', taskId: blindTask.id }] },
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

test('non-GM blind tool-blocked start response does not expose missing tool details', async () => {
  const calls = {};
  const blindTask = task({
    id: 'secret-mooncap-task',
    name: 'Secret Mooncap Patch',
    toolIds: ['tool-sickle']
  });
  const engine = makeEngine({
    environments: [environment({
      selectionMode: 'blind',
      rules: { blindCandidateGate: 'allMatching' },
      tasks: [blindTask]
    })],
    toolAvailability: { available: false, missing: [{ componentId: 'silver-sickle', taskId: blindTask.id }] },
    calls
  });

  const result = await engine.startAttempt({ viewer, actor, environmentId: 'env-a' });
  const serialized = JSON.stringify(result);

  assert.equal(result.accepted, false);
  assert.deepEqual(codes(result), ['TOOL_BLOCKED']);
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
      rules: { blindCandidateGate: 'allMatching' },
      tasks: [blindTask]
    })],
    activeRuns: new Map([[blindTask.id, { id: 'run-active', taskId: blindTask.id }]])
  });

  const result = await engine.startAttempt({ viewer: gmViewer, actor, environmentId: 'env-a' });

  assert.equal(result.accepted, false);
  assert.equal(result.taskId, 'secret-mooncap-task');
  assert.deepEqual(result.blockedReasons[0].data, { taskId: 'secret-mooncap-task' });
});

test('blind attemptableOnly gate skips a blocked task and starts an attemptable one', async () => {
  const calls = {};
  const blocked = task({ id: 'blocked-task', name: 'Blocked', toolIds: ['tool-herb'] });
  const good = task({ id: 'good-task', name: 'Good' });
  const engine = makeEngine({
    environments: [environment({ selectionMode: 'blind', tasks: [blocked, good] })],
    toolAvailability: (payload) => payload.task.id === 'blocked-task'
      ? { available: false, missing: [{ componentId: 'rare-herb' }] }
      : { available: true, missing: [] },
    calls
  });

  // GM viewer so the resolved task identity is exposed for the assertion.
  const result = await engine.startAttempt({ viewer: gmViewer, actor, environmentId: 'env-a' });

  assert.equal(result.taskId, 'good-task');
  assert.notDeepEqual(codes(result), ['BLIND_NO_CANDIDATE']);
});

test('blind attemptableOnly gate yields no candidate when the sole task is blocked', async () => {
  const calls = {};
  const blocked = task({ id: 'blocked-task', name: 'Blocked', toolIds: ['tool-herb'] });
  const engine = makeEngine({
    environments: [environment({ selectionMode: 'blind', tasks: [blocked] })],
    toolAvailability: { available: false, missing: [{ componentId: 'rare-herb' }] },
    calls
  });

  const result = await engine.startAttempt({ viewer, actor, environmentId: 'env-a' });

  assert.equal(result.accepted, false);
  assert.deepEqual(codes(result), ['BLIND_NO_CANDIDATE']);
  assert.equal(result.taskId, null);
  assert.deepEqual(result.blockedReasons[0].data, null);
  assertNoRunMutation(calls);
});

test('blind selection honors per-task weights with a seeded RNG', async () => {
  const x = task({ id: 'task-x', name: 'X' });
  const y = task({ id: 'task-y', name: 'Y' });
  const makeBlindEnv = () => environment({
    selectionMode: 'blind',
    blindSelection: { weights: { 'task-x': 3, 'task-y': 1 } },
    tasks: [x, y]
  });

  const low = makeEngine({ environments: [makeBlindEnv()], random: () => 0 });
  const lowResult = await low.startAttempt({ viewer: gmViewer, actor, environmentId: 'env-a' });
  assert.equal(lowResult.taskId, 'task-x');

  const high = makeEngine({ environments: [makeBlindEnv()], random: () => 0.95 });
  const highResult = await high.startAttempt({ viewer: gmViewer, actor, environmentId: 'env-a' });
  assert.equal(highResult.taskId, 'task-y');
});

test('blind selection excludes a task weighted to zero', async () => {
  const x = task({ id: 'task-x', name: 'X' });
  const y = task({ id: 'task-y', name: 'Y' });
  const engine = makeEngine({
    environments: [environment({
      selectionMode: 'blind',
      blindSelection: { weights: { 'task-x': 0, 'task-y': 1 } },
      tasks: [x, y]
    })],
    random: () => 0
  });

  const result = await engine.startAttempt({ viewer: gmViewer, actor, environmentId: 'env-a' });
  assert.equal(result.taskId, 'task-y');
});

test('blind allMatching gate keeps blocked tasks in the pool so they can still be selected', async () => {
  const blocked = task({ id: 'blocked-task', name: 'Blocked', toolIds: ['tool-herb'] });
  const good = task({ id: 'good-task', name: 'Good' });
  const engine = makeEngine({
    environments: [environment({
      selectionMode: 'blind',
      rules: { blindCandidateGate: 'allMatching' },
      tasks: [blocked, good]
    })],
    toolAvailability: (payload) => payload.task.id === 'blocked-task'
      ? { available: false, missing: [{ componentId: 'rare-herb' }] }
      : { available: true, missing: [] },
    // Seed the weighted pick to land on the first pool entry (both tasks weight 1 by default).
    random: () => 0
  });

  // allMatching ignores attemptability: the blocked task remains a draw candidate
  // and the attempt is blocked rather than skipping to a usable task.
  const result = await engine.startAttempt({ viewer: gmViewer, actor, environmentId: 'env-a' });
  assert.equal(result.taskId, 'blocked-task');
  assert.deepEqual(codes(result), ['TOOL_BLOCKED']);
});

const ironTask = (overrides = {}) => task({
  resultGroups: [{ id: 'group-iron', name: 'Iron', results: [{ id: 'result-iron', componentId: 'iron', quantity: 1 }] }],
  ...overrides
});

test('blind reveal policy onAttempt reveals the resolved task on success', async () => {
  const captured = [];
  const engine = makeEngine({
    environments: [environment({
      selectionMode: 'blind',
      rules: { revealPolicy: 'onAttempt', revealScope: 'party' },
      tasks: [ironTask({ id: 'reveal-task' })]
    })],
    richState: { revealTask: async (_actor, payload) => { captured.push(payload); } },
    createdResults: [{ actorUuid: actor.uuid, itemUuid: 'Item.iron', quantity: 1 }]
  });

  let result;
  routedRoll(true);
  try {
    result = await engine.startAttempt({ viewer, actor, environmentId: 'env-a' });
  } finally {
    delete globalThis.Roll;
  }
  assert.equal(result.state, 'succeeded');
  // The blind response stays opaque, but the reveal records the real task id.
  assert.equal(result.taskId, null);
  assert.deepEqual(captured, [{ environmentId: 'env-a', taskId: 'reveal-task', scope: 'party' }]);
});

test('blind reveal policy onSuccess does not reveal a failed attempt', async () => {
  const captured = [];
  const engine = makeEngine({
    environments: [environment({
      selectionMode: 'blind',
      rules: { revealPolicy: 'onSuccess' },
      tasks: [ironTask({ id: 'reveal-task' })]
    })],
    richState: { revealTask: async (_actor, payload) => { captured.push(payload); } }
  });

  let result;
  routedRoll(false); // miss the success tier → routed failure
  try {
    result = await engine.startAttempt({ viewer, actor, environmentId: 'env-a' });
  } finally {
    delete globalThis.Roll;
  }
  assert.equal(result.state, 'failed');
  assert.deepEqual(captured, []);
});

test('blind reveal policy never (default) does not reveal', async () => {
  const captured = [];
  const engine = makeEngine({
    environments: [environment({
      selectionMode: 'blind',
      tasks: [ironTask({ id: 'reveal-task' })]
    })],
    richState: { revealTask: async (_actor, payload) => { captured.push(payload); } },
    createdResults: [{ actorUuid: actor.uuid, itemUuid: 'Item.iron', quantity: 1 }]
  });

  let result;
  routedRoll(true);
  try {
    result = await engine.startAttempt({ viewer, actor, environmentId: 'env-a' });
  } finally {
    delete globalThis.Roll;
  }
  assert.equal(result.state, 'succeeded');
  assert.deepEqual(captured, []);
});

test('targeted mode never auto-reveals even when the system policy would reveal', async () => {
  const targetedCaptured = [];
  const targetedEngine = makeEngine({
    environments: [environment({
      selectionMode: 'targeted',
      rules: { revealPolicy: 'onAttempt' },
      tasks: [ironTask({ id: 'targeted-task' })]
    })],
    richState: { revealTask: async (_actor, payload) => { targetedCaptured.push(payload); } },
    createdResults: [{ actorUuid: actor.uuid, itemUuid: 'Item.iron', quantity: 1 }]
  });
  routedRoll(true);
  try {
    await targetedEngine.startAttempt({ viewer, actor, environmentId: 'env-a', taskId: 'targeted-task' });
  } finally {
    delete globalThis.Roll;
  }
  assert.deepEqual(targetedCaptured, []);
});
