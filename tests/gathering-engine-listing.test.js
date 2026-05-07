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
  catalystAvailability = null,
  calls = {}
} = {}) {
  calls.visibility = [];
  calls.scene = [];
  calls.catalysts = [];
  calls.activeRuns = [];

  return new GatheringEngine({
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
    catalystAvailability: {
      check: (payload) => {
        calls.catalysts.push(payload);
        if (typeof catalystAvailability === 'function') return catalystAvailability(payload);
        return catalystAvailability ?? { available: true, missing: [] };
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
    usedCatalysts: [{ actorUuid: actor.uuid, itemUuid: 'Item.secret-spade', quantity: 1 }],
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
  assert.equal(Object.hasOwn(listing.history[0], 'usedCatalysts'), false);
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

test('catalyst blocking uses only the acting actor and does not mutate items', async () => {
  const componentSourceActor = { id: 'source-actor', items: [{ id: 'source-catalyst' }] };
  const actingActor = {
    ...actor,
    items: Object.freeze([{ id: 'acting-item', system: { quantity: 1 } }])
  };
  const calls = {};
  const catalyst = { componentId: 'catalyst-a', degradesOnUse: true, maxUses: 2 };
  const engine = makeEngine({
    environments: [environment({ tasks: [task({ catalysts: [catalyst] })] })],
    selectableActors: [actingActor, componentSourceActor],
    catalystAvailability: ({ actor: selectedActor }) => ({
      available: false,
      missing: [{ componentId: 'catalyst-a', actorId: selectedActor.id }]
    }),
    calls
  });

  const listing = await engine.listForActor({ viewer, actor: actingActor });

  assert.equal(listing.attemptable, false);
  assert.deepEqual(reasonCodes(listing.environments[0].tasks[0]), ['CATALYST_BLOCKED']);
  assert.equal(calls.catalysts.length, 1);
  assert.equal(calls.catalysts[0].actor, actingActor);
  assert.equal('actors' in calls.catalysts[0], false);
  assert.equal('componentSourceActors' in calls.catalysts[0], false);
  assert.deepEqual(actingActor.items[0], { id: 'acting-item', system: { quantity: 1 } });
});

test('non-GM visible blind task listing is opaque even when duplicate and catalyst blocked', async () => {
  const revealingTask = task({
    id: 'secret-mooncap-task',
    name: 'Secret Mooncap Patch',
    description: 'A hidden mushroom source.',
    img: 'icons/commodities/flowers/mushroom-red.webp',
    resolutionMode: 'progressive',
    timeRequirement: { hours: 1 },
    catalysts: [{ componentId: 'silver-sickle' }]
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
    catalystAvailability: {
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
      ['CATALYST_BLOCKED', null]
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
    catalysts: [{ componentId: 'silver-sickle' }]
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
  assert.equal(blindTask.catalystCount, 1);
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
    usedCatalysts: [{ actorUuid: actor.uuid, itemUuid: 'Item.pick', quantity: 1 }],
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
  assert.equal(listing.history[0].usedCatalystCount, 1);
  assert.deepEqual(listing.history[0].createdResults, historyRun.createdResults);
  assert.deepEqual(listing.history[0].usedCatalysts, historyRun.usedCatalysts);
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
    catalysts: [{ componentId: 'silver-sickle' }]
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
    usedCatalysts: [{ actorUuid: actor.uuid, itemUuid: 'Item.silver-sickle', quantity: 1 }],
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
  assert.equal(Object.hasOwn(listing.history[0], 'usedCatalysts'), false);
  assert.equal(Object.hasOwn(listing.history[0], 'checkResult'), false);
  assert.equal(serialized.includes('secret-mooncap-task'), false);
  assert.equal(serialized.includes('Secret Mooncap Patch'), false);
  assert.equal(serialized.includes('secret-mooncap'), false);
  assert.equal(serialized.includes('silver-sickle'), false);
  assert.equal(serialized.includes('macro'), false);
});
