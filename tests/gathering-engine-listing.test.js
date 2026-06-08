import test from 'node:test';
import assert from 'node:assert/strict';

import { GatheringEngine } from '../src/systems/GatheringEngine.js';

const viewer = { id: 'user-1', isGM: false };
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
  visibility = new Map(),
  sceneAccess = null,
  activeRuns = new Map(),
  history = [],
  toolAvailability = null,
  richState = null,
  systemManager = null,
  calls = {}
} = {}) {
  calls.visibility = [];
  calls.scene = [];
  calls.tools = [];
  calls.activeRuns = [];

  return new GatheringEngine({
    richState,
    systemManager,
    environmentStore: {
      list: () => environments
    },
    getSystems: () => systems,
    getSelectableActors: () => selectableActors,
    isActorSelectable: ({ actor: candidate }) => selectableActors.some(entry => sameActor(entry, candidate)),
    evaluator: {
      evaluateVisibility: async ({ task }) => {
        calls.visibility.push(task.id);
        const result = visibility instanceof Map ? visibility.get(task.id) : visibility?.[task.id];
        return result ?? { visible: true, reasonCode: 'VISIBLE', diagnostic: null };
      }
    },
    sceneAccess: {
      canAttempt: ({ environment, actor: selectedActor, viewer: selectedViewer }) => {
        calls.scene.push({ environment, actor: selectedActor, viewer: selectedViewer });
        if (typeof sceneAccess === 'function') return sceneAccess({ environment, actor: selectedActor, viewer: selectedViewer });
        return sceneAccess ?? { allowed: true };
      }
    },
    runManager: {
      getActiveRuns: () => activeRuns instanceof Map ? Array.from(activeRuns.values()) : activeRuns,
      getRunHistory: () => history,
      findActiveRunForTask: (selectedActor, taskId) => {
        calls.activeRuns.push({ actor: selectedActor, taskId });
        return activeRuns instanceof Map ? activeRuns.get(taskId) : activeRuns?.[taskId] ?? null;
      }
    },
    toolAvailability: {
      check: (payload) => {
        calls.tools.push(payload);
        if (typeof toolAvailability === 'function') return toolAvailability(payload);
        return toolAvailability ?? { available: true, missing: [], failedRequirements: [] };
      }
    },
    localize: (key, data) => data ? `${key}:${JSON.stringify(data)}` : key
  });
}

const LIBRARY_TOOLS = [
  { id: 'tool-sickle', componentId: 'silver-sickle', enabled: true },
  { id: 'tool-a', componentId: 'tool-comp-a', enabled: true }
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
    resultSelection: { provider: 'macroOutcome', macroUuid: 'Macro.outcome' },
    ...overrides
  };
}

function sameActor(left, right) {
  return Boolean(left && right && (left === right || left.id === right.id || left.uuid === right.uuid));
}

function reasonCodes(entry) {
  return entry.blockedReasons.map(reason => reason.code);
}

test('listForActor reports no selectable actors before environment queries matter', async () => {
  const engine = makeEngine({ selectableActors: [] });

  const listing = await engine.listForActor({ viewer, actor: null });

  assert.equal(listing.visible, true);
  assert.equal(listing.attemptable, false);
  assert.deepEqual(reasonCodes(listing), ['NO_SELECTABLE_ACTORS']);
  assert.deepEqual(listing.environments, []);
});

test('listForActor reports invalid remembered actor without falling through to first selectable actor', async () => {
  const engine = makeEngine({ selectableActors: [actor] });

  const listing = await engine.listForActor({ viewer, rememberedActorId: 'actor-gone' });

  assert.equal(listing.selectedActorId, null);
  assert.equal(listing.attemptable, false);
  assert.deepEqual(reasonCodes(listing), ['INVALID_REMEMBERED_ACTOR']);
  assert.deepEqual(listing.environments, []);
});

test('listForActor reports no environments configured after gathering feature filtering', async () => {
  const engine = makeEngine({
    environments: [
      environment({ id: 'disabled-feature-env', craftingSystemId: 'system-disabled' }),
      environment({ id: 'missing-system-env', craftingSystemId: 'missing-system' })
    ],
    systems: [
      { id: 'system-a', enabled: true, features: { gathering: true } },
      { id: 'system-disabled', enabled: true, features: { gathering: false } }
    ]
  });

  const listing = await engine.listForActor({ viewer, actor });

  assert.equal(listing.attemptable, false);
  assert.deepEqual(reasonCodes(listing), ['NO_ENVIRONMENTS_CONFIGURED']);
  assert.deepEqual(listing.environments, []);
});

test('listForActor keeps active runs and history when browsing has no configured environments', async () => {
  const activeRun = {
    id: 'run-active-no-env',
    actorUuid: actor.uuid,
    userId: viewer.id,
    craftingSystemId: 'system-a',
    environmentId: 'env-gone',
    taskId: 'task-gone',
    status: 'waitingTime',
    startedAtWorldTime: 100,
    updatedAtWorldTime: 100,
    timeGate: { initiatedAt: 100, availableAt: 460, requiredSeconds: 360 }
  };
  const historyRun = {
    id: 'run-history-no-env',
    actorUuid: actor.uuid,
    userId: viewer.id,
    craftingSystemId: 'system-a',
    environmentId: 'env-gone',
    taskId: 'blind',
    status: 'cancelled',
    startedAtWorldTime: 10,
    updatedAtWorldTime: 20,
    completedAtWorldTime: 20,
    checkResult: { blind: true, status: 'cancelled' }
  };
  const engine = makeEngine({
    environments: [],
    activeRuns: new Map([['task-gone', activeRun]]),
    history: [historyRun]
  });

  const listing = await engine.listForActor({ viewer, actor });

  assert.equal(listing.attemptable, false);
  assert.deepEqual(reasonCodes(listing), ['NO_ENVIRONMENTS_CONFIGURED']);
  assert.deepEqual(listing.environments, []);
  assert.equal(listing.activeRuns.length, 1);
  assert.equal(listing.activeRuns[0].id, 'run-active-no-env');
  assert.equal(listing.activeRuns[0].blind, true);
  assert.equal(listing.activeRuns[0].taskId, null);
  assert.equal(listing.activeRuns[0].label, 'FABRICATE.Gathering.BlindTaskLabel');
  assert.equal(listing.history.length, 1);
  assert.equal(listing.history[0].id, 'run-history-no-env');
  assert.equal(listing.history[0].blind, true);
  assert.equal(listing.history[0].taskId, null);
  assert.equal(Object.hasOwn(listing.history[0], 'checkResult'), false);
});

test('listForActor reports no visible targeted tasks when all targeted task gates hide them', async () => {
  const engine = makeEngine({
    environments: [environment({ tasks: [task({ id: 'task-hidden' })] })],
    visibility: new Map([['task-hidden', { visible: false, reasonCode: 'HIDDEN', diagnostic: null }]])
  });

  const listing = await engine.listForActor({ viewer, actor });

  assert.equal(listing.attemptable, false);
  assert.deepEqual(reasonCodes(listing), ['NO_VISIBLE_TARGETED_TASKS']);
  assert.deepEqual(listing.environments, []);
});

test('listForActor keeps targeted active runs and history when no tasks are visible', async () => {
  const activeRun = {
    id: 'run-active-hidden',
    actorUuid: actor.uuid,
    userId: viewer.id,
    craftingSystemId: 'system-a',
    environmentId: 'env-a',
    taskId: 'task-hidden',
    status: 'waitingTime',
    startedAtWorldTime: 100,
    updatedAtWorldTime: 100,
    timeGate: { initiatedAt: 100, availableAt: 460, requiredSeconds: 360 }
  };
  const historyRun = {
    id: 'run-history-hidden',
    actorUuid: actor.uuid,
    userId: viewer.id,
    craftingSystemId: 'system-a',
    environmentId: 'env-a',
    taskId: 'task-hidden',
    status: 'failed',
    startedAtWorldTime: 10,
    updatedAtWorldTime: 20,
    completedAtWorldTime: 20
  };
  const engine = makeEngine({
    environments: [environment({ tasks: [task({ id: 'task-hidden', name: 'Gather Tin' })] })],
    visibility: new Map([['task-hidden', { visible: false, reasonCode: 'HIDDEN', diagnostic: null }]]),
    activeRuns: new Map([['task-hidden', activeRun]]),
    history: [historyRun]
  });

  const listing = await engine.listForActor({ viewer, actor });

  assert.equal(listing.attemptable, false);
  assert.deepEqual(reasonCodes(listing), ['NO_VISIBLE_TARGETED_TASKS']);
  assert.deepEqual(listing.environments, []);
  assert.equal(listing.activeRuns.length, 1);
  assert.equal(listing.activeRuns[0].label, 'Gather Tin');
  assert.equal(listing.activeRuns[0].taskId, 'task-hidden');
  assert.equal(listing.history.length, 1);
  assert.equal(listing.history[0].label, 'Gather Tin');
  assert.equal(listing.history[0].taskId, 'task-hidden');
});

test('listForActor reports blind sole-task hidden without exposing the task', async () => {
  const engine = makeEngine({
    environments: [
      environment({
        selectionMode: 'blind',
        tasks: [task({ id: 'blind-task', name: 'Secret Mooncap Patch' })]
      })
    ],
    visibility: new Map([['blind-task', { visible: false, reasonCode: 'HIDDEN', diagnostic: null }]])
  });

  const listing = await engine.listForActor({ viewer, actor });

  assert.equal(listing.attemptable, false);
  assert.deepEqual(reasonCodes(listing), ['BLIND_SOLE_TASK_HIDDEN']);
  assert.deepEqual(listing.environments, []);
});

test('listForActor keeps blind active runs and history redacted when the sole task is hidden', async () => {
  const secretTask = task({ id: 'secret-task', name: 'Secret Truffle Grove' });
  const activeRun = {
    id: 'blind-active-hidden',
    actorUuid: actor.uuid,
    userId: viewer.id,
    craftingSystemId: 'system-a',
    environmentId: 'env-a',
    taskId: secretTask.id,
    status: 'waitingTime',
    startedAtWorldTime: 100,
    updatedAtWorldTime: 100,
    timeGate: { initiatedAt: 100, availableAt: 460, requiredSeconds: 360 }
  };
  const historyRun = {
    id: 'blind-history-hidden',
    actorUuid: actor.uuid,
    userId: viewer.id,
    craftingSystemId: 'system-a',
    environmentId: 'env-a',
    taskId: secretTask.id,
    status: 'succeeded',
    startedAtWorldTime: 10,
    updatedAtWorldTime: 20,
    completedAtWorldTime: 20,
    createdResults: [{ actorUuid: actor.uuid, itemUuid: 'Item.secret-truffle', quantity: 1 }],
    usedTools: [{ actorUuid: actor.uuid, itemUuid: 'Item.secret-spade', quantity: 1 }],
    checkResult: { provider: 'macro', value: 19 }
  };
  const engine = makeEngine({
    environments: [environment({ selectionMode: 'blind', tasks: [secretTask] })],
    visibility: new Map([[secretTask.id, { visible: false, reasonCode: 'HIDDEN', diagnostic: null }]]),
    activeRuns: new Map([[secretTask.id, activeRun]]),
    history: [historyRun]
  });

  const listing = await engine.listForActor({ viewer, actor });
  const serialized = JSON.stringify({ activeRuns: listing.activeRuns, history: listing.history });

  assert.equal(listing.attemptable, false);
  assert.deepEqual(reasonCodes(listing), ['BLIND_SOLE_TASK_HIDDEN']);
  assert.deepEqual(listing.environments, []);
  assert.equal(listing.activeRuns[0].label, 'FABRICATE.Gathering.BlindTaskLabel');
  assert.equal(listing.activeRuns[0].taskId, null);
  assert.equal(listing.history[0].label, 'FABRICATE.Gathering.BlindTaskLabel');
  assert.equal(listing.history[0].taskId, null);
  assert.equal(Object.hasOwn(listing.history[0], 'createdResults'), false);
  assert.equal(Object.hasOwn(listing.history[0], 'usedTools'), false);
  assert.equal(Object.hasOwn(listing.history[0], 'checkResult'), false);
  assert.equal(serialized.includes('Secret Truffle Grove'), false);
  assert.equal(serialized.includes('secret-truffle'), false);
  assert.equal(serialized.includes('secret-spade'), false);
  assert.equal(serialized.includes('macro'), false);
});

test('scene/token failure blocks attemptability but keeps the environment listed', async () => {
  const calls = {};
  const engine = makeEngine({
    environments: [environment({ sceneUuid: 'Scene.old-mine' })],
    sceneAccess: { allowed: false, code: 'SCENE_TOKEN_BLOCKED', messageKey: 'FABRICATE.Gathering.Blocked.TokenMissing' },
    calls
  });

  const listing = await engine.listForActor({ viewer, actor });

  assert.equal(listing.attemptable, false);
  assert.equal(listing.environments.length, 1);
  assert.equal(listing.environments[0].visible, true);
  assert.equal(listing.environments[0].attemptable, false);
  assert.deepEqual(reasonCodes(listing.environments[0]), ['SCENE_TOKEN_BLOCKED']);
  assert.deepEqual(reasonCodes(listing.environments[0].tasks[0]), ['SCENE_TOKEN_BLOCKED']);
  assert.equal(calls.scene.length, 1);
});

test('duplicate active run blocks attemptability through GatheringRunManager.findActiveRunForTask', async () => {
  const calls = {};
  const engine = makeEngine({
    activeRuns: new Map([['task-a', { id: 'run-active', taskId: 'task-a' }]]),
    calls
  });

  const listing = await engine.listForActor({ viewer, actor });

  assert.equal(listing.attemptable, false);
  assert.deepEqual(reasonCodes(listing.environments[0].tasks[0]), ['DUPLICATE_ACTIVE_RUN']);
  assert.deepEqual(calls.activeRuns.map(call => call.taskId), ['task-a']);
});

test('tool blocking uses only the acting actor and does not mutate items', async () => {
  const componentSourceActor = { id: 'source-actor', items: [{ id: 'source-tool' }] };
  const actingActor = {
    ...actor,
    items: Object.freeze([{ id: 'acting-item', system: { quantity: 1 } }])
  };
  const calls = {};
  const tool = { componentId: 'tool-comp-a', degradesOnUse: true, maxUses: 2 };
  const engine = makeEngine({
    environments: [environment({ tasks: [task({ toolIds: ['tool-a'] })] })],
    selectableActors: [actingActor, componentSourceActor],
    toolAvailability: ({ actor: selectedActor }) => ({
      available: false,
      missing: [{ componentId: 'tool-comp-a', actorId: selectedActor.id }]
    }),
    calls
  });

  const listing = await engine.listForActor({ viewer, actor: actingActor });

  assert.equal(listing.attemptable, false);
  assert.deepEqual(reasonCodes(listing.environments[0].tasks[0]), ['TOOL_BLOCKED']);
  assert.equal(calls.tools.length, 1);
  assert.equal(calls.tools[0].actor, actingActor);
  assert.equal('actors' in calls.tools[0], false);
  assert.equal('componentSourceActors' in calls.tools[0], false);
  assert.deepEqual(actingActor.items[0], { id: 'acting-item', system: { quantity: 1 } });
});

test('non-GM visible blind task listing is opaque even when duplicate and tool blocked', async () => {
  const revealingTask = task({
    id: 'secret-mooncap-task',
    name: 'Secret Mooncap Patch',
    description: 'A hidden mushroom source.',
    img: 'icons/commodities/flowers/mushroom-red.webp',
    resolutionMode: 'progressive',
    timeRequirement: { hours: 1 },
    toolIds: ['tool-sickle']
  });
  const engine = makeEngine({
    environments: [
      environment({
        selectionMode: 'blind',
        tasks: [revealingTask]
      })
    ],
    visibility: new Map([[
      revealingTask.id,
      {
        visible: true,
        reasonCode: 'SECRET_MOONCAP_VISIBLE',
        description: 'Secret Mooncap Patch',
        diagnostic: { message: 'secret-mooncap-task' }
      }
    ]]),
    activeRuns: new Map([[revealingTask.id, { id: 'run-active', taskId: revealingTask.id }]]),
    toolAvailability: {
      available: false,
      missing: [{ componentId: 'silver-sickle', taskId: revealingTask.id }]
    }
  });

  const listing = await engine.listForActor({ viewer, actor });
  const blindTask = listing.environments[0].tasks[0];
  const serializedTask = JSON.stringify(blindTask);
  const serializedListing = JSON.stringify(listing);

  assert.equal(blindTask.action, 'blindGather');
  assert.equal(blindTask.blind, true);
  assert.equal(blindTask.label, 'FABRICATE.Gathering.BlindTaskLabel');
  assert.equal(Object.hasOwn(blindTask, 'id'), false);
  assert.equal(Object.hasOwn(blindTask, 'img'), false);
  assert.equal(Object.hasOwn(blindTask, 'resolutionMode'), false);
  assert.equal(Object.hasOwn(blindTask, 'hasTimeRequirement'), false);
  assert.equal(Object.hasOwn(blindTask, 'catalystCount'), false);
  assert.equal(blindTask.name, null);
  assert.equal(blindTask.description, '');
  assert.equal(blindTask.visibility.reasonCode, null);
  assert.equal(blindTask.visibility.description, '');
  assert.equal(blindTask.visibility.diagnostic, null);
  assert.equal(serializedTask.includes('secret-mooncap-task'), false);
  assert.equal(serializedTask.includes('Secret Mooncap Patch'), false);
  assert.equal(serializedTask.includes('SECRET_MOONCAP_VISIBLE'), false);
  assert.equal(serializedTask.includes('mushroom-red'), false);
  assert.equal(serializedTask.includes('silver-sickle'), false);
  assert.equal(serializedListing.includes('secret-mooncap-task'), false);
  assert.equal(serializedListing.includes('Secret Mooncap Patch'), false);
  assert.equal(serializedListing.includes('SECRET_MOONCAP_VISIBLE'), false);
  assert.equal(serializedListing.includes('mushroom-red'), false);
  assert.equal(serializedListing.includes('silver-sickle'), false);
  assert.deepEqual(
    blindTask.blockedReasons.map(reason => [reason.code, reason.data]),
    [
      ['DUPLICATE_ACTIVE_RUN', null],
      ['TOOL_BLOCKED', null]
    ]
  );
});

test('GM blind task listing exposes real task metadata for inspection', async () => {
  const gmViewer = { id: 'gm-1', isGM: true };
  const revealingTask = task({
    id: 'secret-mooncap-task',
    name: 'Secret Mooncap Patch',
    description: 'A hidden mushroom source.',
    img: 'icons/commodities/flowers/mushroom-red.webp',
    resolutionMode: 'progressive',
    timeRequirement: { hours: 1 },
    toolIds: ['tool-sickle']
  });
  const engine = makeEngine({
    environments: [
      environment({
        selectionMode: 'blind',
        tasks: [revealingTask]
      })
    ]
  });

  const listing = await engine.listForActor({ viewer: gmViewer, actor });
  const blindTask = listing.environments[0].tasks[0];

  assert.equal(blindTask.id, 'secret-mooncap-task');
  assert.equal(blindTask.name, 'Secret Mooncap Patch');
  assert.equal(blindTask.label, 'Secret Mooncap Patch');
  assert.equal(blindTask.description, 'A hidden mushroom source.');
  assert.equal(blindTask.img, 'icons/commodities/flowers/mushroom-red.webp');
  assert.equal(blindTask.resolutionMode, 'progressive');
  assert.equal(blindTask.hasTimeRequirement, true);
});

test('hidden targeted tasks are omitted while visible targeted tasks remain attemptable', async () => {
  const engine = makeEngine({
    environments: [
      environment({
        tasks: [
          task({ id: 'visible-task', name: 'Gather Iron' }),
          task({ id: 'hidden-task', name: 'Gather Gold' })
        ]
      })
    ],
    visibility: new Map([
      ['visible-task', { visible: true, reasonCode: 'VISIBLE', diagnostic: null }],
      ['hidden-task', { visible: false, reasonCode: 'HIDDEN', diagnostic: null }]
    ])
  });

  const listing = await engine.listForActor({ viewer, actor });

  assert.equal(listing.attemptable, true);
  assert.deepEqual(listing.environments.map(entry => entry.id), ['env-a']);
  assert.deepEqual(listing.environments[0].tasks.map(entry => entry.id), ['visible-task']);
  assert.equal(listing.environments[0].tasks[0].attemptable, true);
  assert.deepEqual(listing.environments[0].tasks[0].blockedReasons, []);
});

test('listForActor returns active timed runs and recent terminal history for targeted tasks', async () => {
  const activeRun = {
    id: 'run-active',
    actorUuid: actor.uuid,
    userId: viewer.id,
    craftingSystemId: 'system-a',
    environmentId: 'env-a',
    taskId: 'task-a',
    status: 'waitingTime',
    startedAtWorldTime: 100,
    updatedAtWorldTime: 100,
    timeGate: { initiatedAt: 100, availableAt: 460, requiredSeconds: 360 }
  };
  const historyRun = {
    id: 'run-history',
    actorUuid: actor.uuid,
    userId: viewer.id,
    craftingSystemId: 'system-a',
    environmentId: 'env-a',
    taskId: 'task-a',
    status: 'succeeded',
    startedAtWorldTime: 10,
    updatedAtWorldTime: 20,
    completedAtWorldTime: 20,
    createdResults: [{ actorUuid: actor.uuid, itemUuid: 'Item.iron', quantity: 2 }],
    usedTools: [{ actorUuid: actor.uuid, itemUuid: 'Item.pick', quantity: 1 }],
    checkResult: { value: 17, status: 'success' }
  };
  const engine = makeEngine({
    activeRuns: new Map([['task-a', activeRun]]),
    history: [historyRun]
  });

  const listing = await engine.listForActor({ viewer, actor });

  assert.equal(listing.activeRuns.length, 1);
  assert.equal(listing.activeRuns[0].id, 'run-active');
  assert.equal(listing.activeRuns[0].taskId, 'task-a');
  assert.equal(listing.activeRuns[0].label, 'Gather Iron');
  assert.equal(listing.activeRuns[0].status, 'waitingTime');
  assert.deepEqual(listing.activeRuns[0].timeGate, activeRun.timeGate);
  assert.equal(listing.history.length, 1);
  assert.equal(listing.history[0].id, 'run-history');
  assert.equal(listing.history[0].taskId, 'task-a');
  assert.equal(listing.history[0].label, 'Gather Iron');
  assert.equal(listing.history[0].status, 'succeeded');
  assert.equal(listing.history[0].createdResultCount, 1);
  assert.equal(listing.history[0].usedToolCount, 1);
  assert.deepEqual(listing.history[0].createdResults, historyRun.createdResults);
  assert.deepEqual(listing.history[0].usedTools, historyRun.usedTools);
  assert.deepEqual(listing.history[0].checkResult, historyRun.checkResult);
});

test('listForActor annotates environments and run rows with gathering system metadata', async () => {
  const systems = [
    { id: 'system-a', name: 'Mythwright', enabled: true, features: { gathering: true }, components: [] },
    { id: 'system-b', name: 'Alchemy', enabled: true, features: { gathering: true }, components: [] }
  ];
  const activeRun = {
    id: 'run-active',
    actorUuid: actor.uuid,
    userId: viewer.id,
    craftingSystemId: 'system-b',
    environmentId: 'env-b',
    taskId: 'task-b',
    status: 'waitingTime'
  };
  const historyRun = {
    id: 'run-history',
    actorUuid: actor.uuid,
    userId: viewer.id,
    craftingSystemId: 'system-a',
    environmentId: 'env-a',
    taskId: 'task-a',
    status: 'succeeded'
  };
  const engine = makeEngine({
    systems,
    environments: [
      environment({ id: 'env-a', craftingSystemId: 'system-a', name: 'Mines' }),
      environment({ id: 'env-b', craftingSystemId: 'system-b', name: 'Greenhouse', tasks: [task({ id: 'task-b', name: 'Clip Herbs' })] })
    ],
    activeRuns: new Map([['task-b', activeRun]]),
    history: [historyRun]
  });

  const listing = await engine.listForActor({ viewer, actor });

  assert.deepEqual(listing.gatheringSystems, [
    { id: 'system-b', name: 'Alchemy' },
    { id: 'system-a', name: 'Mythwright' }
  ]);
  assert.equal(listing.environments.find(entry => entry.id === 'env-a').craftingSystemName, 'Mythwright');
  assert.equal(listing.environments.find(entry => entry.id === 'env-b').craftingSystemName, 'Alchemy');
  assert.equal(listing.activeRuns[0].craftingSystemName, 'Alchemy');
  assert.equal(listing.history[0].craftingSystemName, 'Mythwright');
});

test('non-GM blind active and history rows do not expose task identity or terminal internals', async () => {
  const secretTask = task({
    id: 'secret-mooncap-task',
    name: 'Secret Mooncap Patch',
    description: 'A hidden mushroom source.',
    img: 'icons/commodities/flowers/mushroom-red.webp',
    toolIds: ['tool-sickle']
  });
  const activeRun = {
    id: 'blind-active',
    actorUuid: actor.uuid,
    userId: viewer.id,
    craftingSystemId: 'system-a',
    environmentId: 'env-a',
    taskId: secretTask.id,
    status: 'waitingTime',
    startedAtWorldTime: 100,
    updatedAtWorldTime: 100,
    timeGate: { initiatedAt: 100, availableAt: 460, requiredSeconds: 360 }
  };
  const historyRun = {
    id: 'blind-history',
    actorUuid: actor.uuid,
    userId: viewer.id,
    craftingSystemId: 'system-a',
    environmentId: 'env-a',
    taskId: secretTask.id,
    status: 'succeeded',
    startedAtWorldTime: 10,
    updatedAtWorldTime: 20,
    completedAtWorldTime: 20,
    createdResults: [{ actorUuid: actor.uuid, itemUuid: 'Item.secret-mooncap', quantity: 2 }],
    usedTools: [{ actorUuid: actor.uuid, itemUuid: 'Item.silver-sickle', quantity: 1 }],
    checkResult: {
      provider: 'macro',
      value: 22,
      diagnostic: { message: 'Secret Mooncap Patch' }
    }
  };
  const engine = makeEngine({
    environments: [environment({ selectionMode: 'blind', tasks: [secretTask] })],
    activeRuns: new Map([[secretTask.id, activeRun]]),
    history: [historyRun]
  });

  const listing = await engine.listForActor({ viewer, actor });
  const serialized = JSON.stringify({
    activeRuns: listing.activeRuns,
    history: listing.history
  });

  assert.equal(listing.activeRuns[0].blind, true);
  assert.equal(listing.activeRuns[0].taskId, null);
  assert.equal(listing.activeRuns[0].label, 'FABRICATE.Gathering.BlindTaskLabel');
  assert.equal(listing.history[0].blind, true);
  assert.equal(listing.history[0].taskId, null);
  assert.equal(listing.history[0].label, 'FABRICATE.Gathering.BlindTaskLabel');
  assert.equal(Object.hasOwn(listing.history[0], 'createdResults'), false);
  assert.equal(Object.hasOwn(listing.history[0], 'usedTools'), false);
  assert.equal(Object.hasOwn(listing.history[0], 'checkResult'), false);
  assert.equal(serialized.includes('secret-mooncap-task'), false);
  assert.equal(serialized.includes('Secret Mooncap Patch'), false);
  assert.equal(serialized.includes('secret-mooncap'), false);
  assert.equal(serialized.includes('silver-sickle'), false);
  assert.equal(serialized.includes('macro'), false);
});

function stubRichState({ revealCount = 0, biomeTags = [] } = {}) {
  return {
    countRevealedTasks: () => revealCount,
    resolveBiomeTags: () => biomeTags
  };
}

test('listForActor surfaces a disabled environment to players as an identity-only locked listing', async () => {
  const engine = makeEngine({
    // Real composed tasks + a richState that WOULD report a non-zero reveal on a
    // non-locked path; the locked teaser must still pin both counts to 0 so a
    // regression leaking real composition through the teaser would fail here.
    environments: [environment({
      id: 'env-locked',
      name: 'Sealed Vault',
      enabled: false,
      selectionMode: 'blind',
      rules: { revealPolicy: 'onAttempt' },
      tasks: [task({ id: 'task-a' }), task({ id: 'task-b' })]
    })],
    richState: stubRichState({ revealCount: 2 })
  });

  const listing = await engine.listForActor({ viewer, actor });

  assert.equal(listing.environments.length, 1);
  const locked = listing.environments[0];
  assert.equal(locked.id, 'env-locked');
  assert.equal(locked.name, 'Sealed Vault');
  assert.equal(locked.locked, true);
  assert.equal(locked.visible, true);
  assert.equal(locked.attemptable, false);
  assert.deepEqual(locked.tasks, []);
  assert.deepEqual(reasonCodes(locked), ['ENVIRONMENT_DISABLED']);
  // Counts are pinned to 0 on the locked teaser even though the env has 2 real
  // tasks and richState reports 2 reveals; no real composition leaks through.
  assert.equal(locked.composedTaskCount, 0);
  assert.equal(locked.discoveredTaskCount, 0);
  // No GM-internal composition data leaks through the locked teaser.
  const serialized = JSON.stringify(locked);
  assert.equal(serialized.includes('task-a'), false);
  assert.equal(serialized.includes('Gather Iron'), false);
});

test('listForActor still locks a disabled blind environment whose sole task is hidden', async () => {
  const engine = makeEngine({
    environments: [environment({
      id: 'env-blind-locked',
      enabled: false,
      selectionMode: 'blind',
      tasks: [task({ id: 'task-hidden' })]
    })],
    visibility: new Map([['task-hidden', { visible: false, reasonCode: 'HIDDEN', diagnostic: null }]])
  });

  const listing = await engine.listForActor({ viewer, actor });

  assert.equal(listing.environments.length, 1);
  assert.equal(listing.environments[0].id, 'env-blind-locked');
  assert.equal(listing.environments[0].locked, true);
  assert.deepEqual(reasonCodes(listing.environments[0]), ['ENVIRONMENT_DISABLED']);
});

test('listForActor surfaces a disabled environment to a GM as the same identity-only locked listing', async () => {
  const gmViewer = { id: 'gm-1', isGM: true };
  const engine = makeEngine({
    // Same real-composition + non-zero richState setup as the player test: the
    // GM locked teaser must NOT leak real counts either. A regression that let
    // a non-locked path report through the GM teaser would surface non-zero
    // counts here and fail.
    environments: [environment({
      id: 'env-gm-disabled',
      name: 'Sealed Vault',
      enabled: false,
      selectionMode: 'blind',
      rules: { revealPolicy: 'onAttempt' },
      tasks: [task({ id: 'task-a' }), task({ id: 'task-b' })]
    })],
    richState: stubRichState({ revealCount: 2 })
  });

  const listing = await engine.listForActor({ viewer: gmViewer, actor });

  assert.equal(listing.environments.length, 1);
  const entry = listing.environments[0];
  assert.equal(entry.id, 'env-gm-disabled');
  assert.equal(entry.locked, true);
  assert.equal(entry.visible, true);
  assert.equal(entry.attemptable, false);
  assert.deepEqual(entry.tasks, []);
  assert.deepEqual(reasonCodes(entry), ['ENVIRONMENT_DISABLED']);
  // Counts pinned to 0 for a GM viewer too, despite 2 real tasks + 2 reveals.
  assert.equal(entry.composedTaskCount, 0);
  assert.equal(entry.discoveredTaskCount, 0);
  // No GM-internal composition data leaks through the locked teaser even for a GM.
  const serialized = JSON.stringify(entry);
  assert.equal(serialized.includes('task-a'), false);
  assert.equal(serialized.includes('Gather Iron'), false);
});

test('listForActor adds reveal/composition/biome fields to an enabled listing from system rules', async () => {
  const biomeTags = [{ id: 'forest', label: 'Forest', icon: 'fas fa-tree', colorToken: 'sage', customColor: '' }];
  const engine = makeEngine({
    environments: [environment({
      biomes: ['forest'],
      rules: { revealPolicy: 'onAttempt', revealScope: 'actor' },
      tasks: [task({ id: 'task-1' }), task({ id: 'task-2' })]
    })],
    richState: stubRichState({ revealCount: 1, biomeTags })
  });

  const listing = await engine.listForActor({ viewer, actor });
  const entry = listing.environments[0];

  assert.equal(entry.locked, false);
  assert.equal(entry.revealPolicy, 'onAttempt');
  assert.equal(entry.composedTaskCount, 2);
  assert.equal(entry.discoveredTaskCount, 1);
  assert.deepEqual(entry.biomeTags, biomeTags);
});

test('listForActor ignores an environment.reveal override when resolving revealPolicy', async () => {
  const engine = makeEngine({
    environments: [environment({
      // System-level rules say never; a stray environment.reveal must not win.
      rules: { revealPolicy: 'never' },
      reveal: { policy: 'onSuccess', scope: 'global' }
    })],
    richState: stubRichState({ revealCount: 9 })
  });

  const listing = await engine.listForActor({ viewer, actor });
  const entry = listing.environments[0];

  assert.equal(entry.revealPolicy, 'never');
  // revealPolicy 'never' forces discoveredTaskCount to 0 regardless of stored reveals.
  assert.equal(entry.discoveredTaskCount, 0);
});

test('listForActor drops an enabled composed-empty environment but pins a locked one to 0 counts', async () => {
  // Two distinct paths, NOT the same outcome:
  //  - ENABLED + composed-empty  -> no visible tasks -> the env is DROPPED from
  //    the listing entirely (model.visible === false), so it never surfaces a
  //    pinned count; we assert it resolves to [] below.
  //  - LOCKED (enabled === false) -> the env IS surfaced as a teaser, and its
  //    composedTaskCount / discoveredTaskCount are pinned to 0 regardless of
  //    stored reveals; that pinning is what we assert via the locked path.
  const emptyEngine = makeEngine({
    environments: [environment({
      id: 'env-empty',
      selectionMode: 'blind',
      rules: { revealPolicy: 'onAttempt' },
      tasks: []
    })],
    richState: stubRichState({ revealCount: 4 })
  });

  // Locked env carries a real task; locking (not an empty pool) is what forces
  // the pinned 0 counts on the surfaced teaser.
  const lockedEngine = makeEngine({
    environments: [environment({
      id: 'env-locked-counts',
      enabled: false,
      selectionMode: 'blind',
      rules: { revealPolicy: 'onAttempt' },
      tasks: [task({ id: 'task-x' })]
    })],
    richState: stubRichState({ revealCount: 7 })
  });

  const lockedListing = await lockedEngine.listForActor({ viewer, actor });
  const lockedEntry = lockedListing.environments[0];
  assert.equal(lockedEntry.locked, true);
  assert.equal(lockedEntry.composedTaskCount, 0);
  assert.equal(lockedEntry.discoveredTaskCount, 0);

  // The enabled composed-empty env is DROPPED (visible:false), so the listing is
  // empty — there is no enabled count-0 entry to pin. (Confirms the engine also
  // does not throw while resolving an empty-pool blind environment.)
  const emptyListing = await emptyEngine.listForActor({ viewer, actor });
  assert.deepEqual(emptyListing.environments, []);
});

function richStateWithReveals(revealedTaskIds = [], biomeTags = []) {
  return {
    countRevealedTasks: () => revealedTaskIds.length,
    listRevealedTaskIds: () => [...revealedTaskIds],
    resolveBiomeTags: () => biomeTags
  };
}

test('targeted d100 task listing exposes a static successChance from enabled drop rows', async () => {
  const engine = makeEngine({
    environments: [environment({
      tasks: [task({
        id: 'd100-task',
        resolutionMode: 'd100',
        dropRows: [
          { id: 'r1', dropRate: 50, enabled: true },
          { id: 'r2', dropRate: 50, enabled: true }
        ]
      })]
    })]
  });

  const listing = await engine.listForActor({ viewer, actor });
  // 1 − (1−0.5)(1−0.5) = 0.75
  assert.ok(Math.abs(listing.environments[0].tasks[0].successChance - 0.75) < 1e-9);
});

test('successChance is null for a non-d100 task', async () => {
  const engine = makeEngine({
    environments: [environment({
      tasks: [task({
        id: 'routed-task',
        resolutionMode: 'routed',
        dropRows: [{ id: 'r', dropRate: 80, enabled: true }]
      })]
    })]
  });

  const listing = await engine.listForActor({ viewer, actor });
  assert.equal(listing.environments[0].tasks[0].successChance, null);
});

test('successChance ignores disabled drop rows', async () => {
  const engine = makeEngine({
    environments: [environment({
      tasks: [task({
        id: 'd100-task',
        resolutionMode: 'd100',
        dropRows: [
          { id: 'r1', dropRate: 100, enabled: false },
          { id: 'r2', dropRate: 50, enabled: true }
        ]
      })]
    })]
  });

  const listing = await engine.listForActor({ viewer, actor });
  assert.ok(Math.abs(listing.environments[0].tasks[0].successChance - 0.5) < 1e-9);
});

test('successChance clamps out-of-range drop rates', async () => {
  const engine = makeEngine({
    environments: [environment({
      tasks: [
        task({ id: 'over', resolutionMode: 'd100', dropRows: [{ id: 'r', dropRate: 150, enabled: true }] }),
        task({ id: 'mixed', resolutionMode: 'd100', dropRows: [
          { id: 'a', dropRate: -10, enabled: true },
          { id: 'b', dropRate: 50, enabled: true }
        ] })
      ]
    })]
  });

  const tasks = (await engine.listForActor({ viewer, actor })).environments[0].tasks;
  const byId = Object.fromEntries(tasks.map(entry => [entry.id, entry]));
  // 150 clamps to 100 -> certain.
  assert.equal(byId.over.successChance, 1);
  // -10 clamps to 0 (contributes nothing) -> only the 50% row counts.
  assert.ok(Math.abs(byId.mixed.successChance - 0.5) < 1e-9);
});

test('successChance is null when a d100 task has no enabled drop rows', async () => {
  const engine = makeEngine({
    environments: [environment({
      tasks: [task({
        id: 'd100-empty',
        resolutionMode: 'd100',
        dropRows: [{ id: 'r', dropRate: 80, enabled: false }]
      })]
    })]
  });

  const listing = await engine.listForActor({ viewer, actor });
  assert.equal(listing.environments[0].tasks[0].successChance, null);
});

test('blind environment surfaces revealed tasks as discovered models and one opaque action', async () => {
  const engine = makeEngine({
    environments: [environment({
      id: 'env-blind',
      selectionMode: 'blind',
      rules: { revealPolicy: 'onAttempt', revealScope: 'actor' },
      tasks: [
        task({ id: 'task-a', name: 'Hidden A' }),
        task({
          id: 'task-b',
          name: 'Revealed B',
          description: 'Found it',
          resolutionMode: 'd100',
          dropRows: [{ id: 'r', dropRate: 50, enabled: true }]
        })
      ]
    })],
    richState: richStateWithReveals(['task-b'])
  });

  const listing = await engine.listForActor({ viewer, actor });
  const entry = listing.environments[0];

  // The non-GM blind listing collapses to a single opaque "Attempt gathering"
  // action that leaks no task identity or aggregate drop info.
  assert.equal(entry.tasks.length, 1);
  assert.equal(entry.tasks[0].action, 'blindGather');
  assert.equal(Object.hasOwn(entry.tasks[0], 'id'), false);
  assert.equal(Object.hasOwn(entry.tasks[0], 'successChance'), false);

  // The revealed task is surfaced transparently in discoveredTasks.
  assert.equal(entry.discoveredTasks.length, 1);
  assert.equal(entry.discoveredTasks[0].id, 'task-b');
  assert.equal(entry.discoveredTasks[0].name, 'Revealed B');
  assert.equal(entry.discoveredTasks[0].discovered, true);
  assert.ok(Math.abs(entry.discoveredTasks[0].successChance - 0.5) < 1e-9);
  assert.equal(entry.discoveredTasks.length, entry.discoveredTaskCount);

  // The unrevealed task never leaks into the listing.
  const serialized = JSON.stringify(entry);
  assert.equal(serialized.includes('Hidden A'), false);
  assert.equal(serialized.includes('task-a'), false);
});

test('discovered blind tasks carry real blocked-reason data while the opaque action stays redacted', async () => {
  const engine = makeEngine({
    environments: [environment({
      id: 'env-blind-tools',
      selectionMode: 'blind',
      rules: { revealPolicy: 'onAttempt', revealScope: 'actor' },
      tasks: [
        task({ id: 'task-a', name: 'Hidden A', toolIds: ['missing-tool'] }),
        task({ id: 'task-b', name: 'Revealed B', toolIds: ['missing-tool'] })
      ]
    })],
    richState: richStateWithReveals(['task-b'])
  });

  const entry = (await engine.listForActor({ viewer, actor })).environments[0];

  // The opaque blind action surfaces the TOOL_BLOCKED code but redacts its data.
  const opaqueTool = entry.tasks[0].blockedReasons.find(reason => reason.code === 'TOOL_BLOCKED');
  assert.ok(opaqueTool, 'opaque blind action still reports the blocked code');
  assert.equal(opaqueTool.data, null, 'opaque blind action redacts the blocked-reason data');

  // The discovered (transparent) task carries the real tool details.
  const discoveredTool = entry.discoveredTasks[0].blockedReasons.find(reason => reason.code === 'TOOL_BLOCKED');
  assert.ok(discoveredTool, 'discovered task reports the blocked code');
  assert.ok(discoveredTool.data, 'discovered task carries real blocked-reason data');
  assert.deepEqual(discoveredTool.data.missingToolIds, ['missing-tool']);
});

test('blind environment with revealPolicy never exposes no discovered tasks', async () => {
  const engine = makeEngine({
    environments: [environment({
      id: 'env-blind-never',
      selectionMode: 'blind',
      rules: { revealPolicy: 'never' },
      tasks: [task({ id: 'task-a' }), task({ id: 'task-b' })]
    })],
    richState: richStateWithReveals(['task-b'])
  });

  const entry = (await engine.listForActor({ viewer, actor })).environments[0];
  assert.deepEqual(entry.discoveredTasks, []);
});

test('GM viewer of a blind environment gets the full task list and no separate discovered list', async () => {
  const gmViewer = { id: 'gm-1', isGM: true };
  const engine = makeEngine({
    environments: [environment({
      id: 'env-blind-gm',
      selectionMode: 'blind',
      rules: { revealPolicy: 'onAttempt', revealScope: 'actor' },
      tasks: [task({ id: 'task-a' }), task({ id: 'task-b' })]
    })],
    richState: richStateWithReveals(['task-b'])
  });

  const entry = (await engine.listForActor({ viewer: gmViewer, actor })).environments[0];
  assert.equal(entry.tasks.length, 2);
  assert.equal(entry.tasks[0].id, 'task-a');
  assert.deepEqual(entry.discoveredTasks, []);
});

function toolItem({ componentId, broken = false }) {
  return {
    componentId,
    getFlag: (ns, key) => (ns === 'fabricate' && key === 'toolBroken' ? broken : undefined)
  };
}

function systemManagerMock(components = []) {
  return {
    getItems: () => components,
    toolMatchesItem: (_recipe, tool, candidate) =>
      Boolean(tool?.componentId) && tool.componentId === candidate?.componentId
  };
}

function actorWithItems(items) {
  return { id: 'actor-1', uuid: 'Actor.actor-1', name: 'Gatherer', items };
}

test('task model exposes required tools with present / missing state and display metadata', async () => {
  const engine = makeEngine({
    environments: [environment({
      tasks: [task({
        id: 'tooled',
        tools: [{ componentId: 'c-axe' }, { componentId: 'c-lantern' }]
      })]
    })],
    systemManager: systemManagerMock([
      { id: 'c-axe', name: 'Stone Pickaxe', img: 'icons/axe.webp' },
      { id: 'c-lantern', name: 'Lantern', img: 'icons/lantern.webp' }
    ])
  });

  const tools = (await engine.listForActor({
    viewer,
    actor: actorWithItems([toolItem({ componentId: 'c-axe' })])
  })).environments[0].tasks[0].tools;

  assert.deepEqual(tools, [
    { id: 'c-axe', name: 'Stone Pickaxe', img: 'icons/axe.webp', state: 'present', required: true },
    { id: 'c-lantern', name: 'Lantern', img: 'icons/lantern.webp', state: 'missing', required: true }
  ]);
});

test('a matching but broken tool item is reported as damaged, not missing', async () => {
  const engine = makeEngine({
    environments: [environment({
      tasks: [task({ id: 'tooled', tools: [{ componentId: 'c-axe' }] })]
    })],
    systemManager: systemManagerMock([{ id: 'c-axe', name: 'Stone Pickaxe', img: 'icons/axe.webp' }])
  });

  const tools = (await engine.listForActor({
    viewer,
    actor: actorWithItems([toolItem({ componentId: 'c-axe', broken: true })])
  })).environments[0].tasks[0].tools;

  assert.equal(tools[0].state, 'damaged');
});

test('an unresolved library tool reference surfaces as a missing tool entry', async () => {
  const engine = makeEngine({
    environments: [environment({
      tasks: [task({ id: 'tooled', toolIds: ['ghost-tool'] })]
    })],
    systemManager: systemManagerMock([])
  });

  const tools = (await engine.listForActor({ viewer, actor: actorWithItems([]) })).environments[0].tasks[0].tools;
  assert.deepEqual(tools, [
    { id: 'ghost-tool', name: 'ghost-tool', img: 'icons/svg/item-bag.svg', state: 'missing', required: true }
  ]);
});

test('a tool label overrides the component name', async () => {
  const engine = makeEngine({
    environments: [environment({
      tasks: [task({ id: 'tooled', tools: [{ componentId: 'c-axe', label: 'Masterwork Pick' }] })]
    })],
    systemManager: systemManagerMock([{ id: 'c-axe', name: 'Stone Pickaxe', img: 'icons/axe.webp' }])
  });

  const tools = (await engine.listForActor({ viewer, actor: actorWithItems([]) })).environments[0].tasks[0].tools;
  assert.equal(tools[0].name, 'Masterwork Pick');
});

test('a task with no tools exposes an empty tools array', async () => {
  const engine = makeEngine({ systemManager: systemManagerMock([]) });
  const tools = (await engine.listForActor({ viewer, actor })).environments[0].tasks[0].tools;
  assert.deepEqual(tools, []);
});

test('the opaque blind action carries no tools while a discovered task does', async () => {
  const engine = makeEngine({
    environments: [environment({
      id: 'env-blind-tooled',
      selectionMode: 'blind',
      rules: { revealPolicy: 'onAttempt', revealScope: 'actor' },
      tasks: [
        task({ id: 'task-a', tools: [{ componentId: 'c-axe' }] }),
        task({ id: 'task-b', tools: [{ componentId: 'c-axe' }] })
      ]
    })],
    richState: richStateWithReveals(['task-b']),
    systemManager: systemManagerMock([{ id: 'c-axe', name: 'Stone Pickaxe', img: 'icons/axe.webp' }])
  });

  const entry = (await engine.listForActor({ viewer, actor: actorWithItems([]) })).environments[0];
  assert.equal(Object.hasOwn(entry.tasks[0], 'tools'), false, 'opaque blind action leaks no tools');
  assert.equal(entry.discoveredTasks[0].tools.length, 1, 'discovered task carries its tools');
  assert.equal(entry.discoveredTasks[0].tools[0].state, 'missing');
});

test('listForActor exposes an environment hazardChance derived from its hazards', async () => {
  const engine = makeEngine({
    environments: [environment({ hazards: [{ id: 'h1', dropRate: 50 }, { id: 'h2', dropRate: 50, enabled: true }] })]
  });

  const listing = await engine.listForActor({ viewer, actor });
  const env = listing.environments.find(entry => entry.id === 'env-a');
  assert.ok(env, 'environment is listed');
  // 1 - (1 - 0.5)(1 - 0.5) = 0.75
  assert.ok(Math.abs(env.hazardChance - 0.75) < 1e-9, 'hazardChance is 1 - product of per-hazard misses');
});

test('listForActor reports hazardChance 0 for an environment with no hazards', async () => {
  const engine = makeEngine({ environments: [environment()] });

  const listing = await engine.listForActor({ viewer, actor });
  const env = listing.environments.find(entry => entry.id === 'env-a');
  assert.equal(env.hazardChance, 0);
});

test('listForActor ignores disabled hazards and clamps out-of-range dropRates for hazardChance', async () => {
  const engine = makeEngine({
    environments: [environment({ hazards: [{ id: 'h1', dropRate: 150 }, { id: 'h2', dropRate: 80, enabled: false }] })]
  });

  const listing = await engine.listForActor({ viewer, actor });
  const env = listing.environments.find(entry => entry.id === 'env-a');
  // h1 clamps to 100% (-> certain), h2 disabled and excluded.
  assert.equal(env.hazardChance, 1);
});

test('listForActor exposes per-hazard models (identity, danger, chance, matching) for a targeted environment', async () => {
  const engine = makeEngine({
    environments: [environment({
      rules: { hazardVisibility: 'full' },
      hazards: [
        {
          id: 'h1', name: 'Rockslide', description: 'Falling rocks.', img: 'icons/svg/hazard.svg',
          dropRate: 40, dangerTags: ['hazardous'],
          weather: ['storm'], timeOfDay: ['night'], biomes: ['mountain'], regions: ['north'],
          linkedSceneUuid: 'Scene.abc'
        },
        { id: 'h2', name: 'Sinkhole', dropRate: 0, enabled: false }
      ]
    })]
  });

  const listing = await engine.listForActor({ viewer, actor });
  const env = listing.environments.find(entry => entry.id === 'env-a');
  assert.ok(Array.isArray(env.hazards), 'environment carries a hazards array');
  // Disabled hazards are excluded, mirroring the hazardChance computation.
  assert.equal(env.hazards.length, 1, 'only enabled hazards are surfaced');
  assert.deepEqual(env.hazards[0], {
    id: 'h1',
    name: 'Rockslide',
    description: 'Falling rocks.',
    img: 'icons/svg/hazard.svg',
    dangerTags: ['hazardous'],
    risk: 'hazardous',
    chance: 0.4,
    weather: ['storm'],
    timeOfDay: ['night'],
    biomes: ['mountain'],
    biomeTags: [],
    regions: ['north'],
    linkedSceneUuid: 'Scene.abc'
  }, 'the hazard model carries identity, danger, chance, and matching criteria');
});

test('listForActor defaults hazard matching criteria to empty arrays', async () => {
  const engine = makeEngine({
    environments: [environment({ rules: { hazardVisibility: 'full' }, hazards: [{ id: 'h1', name: 'Rockslide', dropRate: 20 }] })]
  });

  const listing = await engine.listForActor({ viewer, actor });
  const hazard = listing.environments.find(entry => entry.id === 'env-a').hazards[0];
  assert.deepEqual(hazard.weather, []);
  assert.deepEqual(hazard.timeOfDay, []);
  assert.deepEqual(hazard.biomes, []);
  assert.deepEqual(hazard.biomeTags, []);
  assert.deepEqual(hazard.regions, []);
  assert.equal(hazard.linkedSceneUuid, null);
});

test('listForActor resolves hazard biomeTags via richState, scoped to the crafting system', async () => {
  const calls = [];
  const richState = {
    resolveBiomeTags: (biomes, systemId) => {
      calls.push({ biomes, systemId });
      return biomes.map(id => ({ id, label: id, icon: 'fas fa-tree', colorToken: 'sage', customColor: '' }));
    }
  };
  const engine = makeEngine({
    richState,
    environments: [environment({ rules: { hazardVisibility: 'full' }, hazards: [{ id: 'h1', name: 'Rockslide', dropRate: 20, biomes: ['forest'] }] })]
  });

  const listing = await engine.listForActor({ viewer, actor });
  const hazard = listing.environments.find(entry => entry.id === 'env-a').hazards[0];
  assert.deepEqual(hazard.biomeTags, [{ id: 'forest', label: 'forest', icon: 'fas fa-tree', colorToken: 'sage', customColor: '' }]);
  assert.ok(calls.some(call => call.systemId === 'system-a' && call.biomes.includes('forest')), 'resolveBiomeTags called with the hazard biomes + system id');
});

test('listForActor redacts individual hazards for a non-GM viewer of a blind environment', async () => {
  const hazards = [{ id: 'h1', name: 'Rockslide', dropRate: 50 }];
  const engine = makeEngine({
    environments: [environment({ selectionMode: 'blind', hazards })]
  });

  const listing = await engine.listForActor({ viewer, actor });
  const env = listing.environments.find(entry => entry.id === 'env-a');
  assert.deepEqual(env.hazards, [], 'a player sees no individual hazards for a blind environment');
  // The aggregate chance is still emitted so the UI can show the bar.
  assert.ok(env.hazardChance > 0, 'the aggregate hazard chance is still exposed');
});

test('listForActor exposes the full hazard list to a GM viewer of a blind environment', async () => {
  const hazards = [{ id: 'h1', name: 'Rockslide', dropRate: 50 }];
  const engine = makeEngine({
    environments: [environment({ selectionMode: 'blind', hazards })]
  });

  const listing = await engine.listForActor({ viewer: { id: 'gm', isGM: true }, actor });
  const env = listing.environments.find(entry => entry.id === 'env-a');
  assert.equal(env.hazards.length, 1, 'a GM sees the full hazard list even for a blind environment');
  assert.equal(env.hazards[0].name, 'Rockslide');
});

test('listForActor defaults a non-GM viewer to the encounterChance visibility tier', async () => {
  const engine = makeEngine({
    environments: [environment({ hazards: [{ id: 'h1', name: 'Rockslide', dropRate: 50 }] })]
  });

  const env = (await engine.listForActor({ viewer, actor })).environments.find(entry => entry.id === 'env-a');
  assert.equal(env.hazardVisibility, 'encounterChance', 'absent rules fall back to the restrictive tier');
  assert.deepEqual(env.hazards, [], 'individual hazards are withheld below the full tier');
  assert.ok(env.hazardChance > 0, 'the aggregate encounter chance is still exposed');
});

test('listForActor with hazardVisibility "encounterChance" exposes the chance but no hazards', async () => {
  const engine = makeEngine({
    environments: [environment({ rules: { hazardVisibility: 'encounterChance' }, hazards: [{ id: 'h1', name: 'Rockslide', dropRate: 50 }] })]
  });

  const env = (await engine.listForActor({ viewer, actor })).environments.find(entry => entry.id === 'env-a');
  assert.equal(env.hazardVisibility, 'encounterChance');
  assert.deepEqual(env.hazards, []);
  assert.ok(env.hazardChance > 0, 'the encounter-chance bar value is exposed');
});

test('listForActor with hazardVisibility "dangerLevelOnly" hides hazards and the encounter chance', async () => {
  const engine = makeEngine({
    environments: [environment({ rules: { hazardVisibility: 'dangerLevelOnly' }, hazards: [{ id: 'h1', name: 'Rockslide', dropRate: 50 }] })]
  });

  const env = (await engine.listForActor({ viewer, actor })).environments.find(entry => entry.id === 'env-a');
  assert.equal(env.hazardVisibility, 'dangerLevelOnly');
  assert.deepEqual(env.hazards, [], 'no individual hazards');
  assert.equal(env.hazardChance, null, 'the encounter chance is withheld (null, not 0)');
});

test('listForActor with hazardVisibility "full" exposes hazards to a non-GM viewer', async () => {
  const engine = makeEngine({
    environments: [environment({ rules: { hazardVisibility: 'full' }, hazards: [{ id: 'h1', name: 'Rockslide', dropRate: 50 }] })]
  });

  const env = (await engine.listForActor({ viewer, actor })).environments.find(entry => entry.id === 'env-a');
  assert.equal(env.hazardVisibility, 'full');
  assert.equal(env.hazards.length, 1, 'individual hazards are surfaced at the full tier');
  assert.ok(env.hazardChance > 0);
});

test('listForActor always resolves hazardVisibility to full for a GM regardless of the rule', async () => {
  const engine = makeEngine({
    environments: [environment({ rules: { hazardVisibility: 'dangerLevelOnly' }, hazards: [{ id: 'h1', name: 'Rockslide', dropRate: 50 }] })]
  });

  const env = (await engine.listForActor({ viewer: { id: 'gm', isGM: true }, actor })).environments.find(entry => entry.id === 'env-a');
  assert.equal(env.hazardVisibility, 'full', 'a GM is never restricted by the visibility rule');
  assert.equal(env.hazards.length, 1, 'a GM sees the full hazard list');
  assert.ok(env.hazardChance > 0, 'a GM sees the encounter chance');
});

test('getTaskDropBreakdown returns award/hazard info + per-drop chances with component images', async () => {
  const previewCalls = [];
  const richState = {
    composeEnvironment: (env) => env,
    previewDropBreakdown: async (args) => {
      previewCalls.push(args);
      return {
        drops: [{
          id: 'd1', name: 'Iron', componentId: 'iron', quantity: 2,
          baseChance: 0.4, finalChance: 0.53,
          modifiers: { weather: { value: 10 }, timeOfDay: { value: -5 }, biome: { value: 3 }, character: [] }
        }],
        successChance: 0.53,
        awardMode: 'allDrops', awardLimit: 1, hazardPolicy: 'successWithHazard'
      };
    }
  };
  const systemManager = { getItems: () => [{ id: 'iron', name: 'Iron', img: 'icons/iron.webp' }] };
  const engine = makeEngine({
    environments: [environment({ tasks: [task({ id: 'task-a', resolutionMode: 'd100', dropRows: [{ id: 'd1', dropRate: 40 }] })] })],
    richState,
    systemManager
  });

  const result = await engine.getTaskDropBreakdown({ viewer, environmentId: 'env-a', taskId: 'task-a', rememberedActorId: 'actor-1' });
  assert.equal(result.resolutionMode, 'd100');
  assert.equal(result.successChance, 0.53, 'aggregate success chance passes through from the preview');
  assert.equal(result.awardMode, 'allDrops');
  assert.equal(result.hazardPolicy, 'successWithHazard');
  assert.equal(result.drops.length, 1);
  assert.equal(result.drops[0].img, 'icons/iron.webp', 'drop image resolved from the component');
  assert.equal(previewCalls.length, 1, 'delegated to richState.previewDropBreakdown once');
});

test('getTaskDropBreakdown returns empty drops for an unknown or hidden task', async () => {
  const richState = { composeEnvironment: (env) => env, previewDropBreakdown: async () => ({ drops: [] }) };
  const engine = makeEngine({ environments: [environment()], richState });

  const result = await engine.getTaskDropBreakdown({ viewer, environmentId: 'env-a', taskId: 'task-missing', rememberedActorId: 'actor-1' });
  assert.deepEqual(result.drops, []);
});

test('getTaskDropBreakdown returns empty drops when richState has no previewDropBreakdown', async () => {
  const engine = makeEngine({ environments: [environment()] });
  const result = await engine.getTaskDropBreakdown({ viewer, environmentId: 'env-a', taskId: 'task-a', rememberedActorId: 'actor-1' });
  assert.deepEqual(result.drops, []);
});
