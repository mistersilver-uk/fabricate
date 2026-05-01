import test from 'node:test';
import assert from 'node:assert/strict';

import { SETTING_KEYS } from '../src/config/settings.js';
import { GatheringEnvironmentStore } from '../src/systems/GatheringEnvironmentStore.js';
import { GatheringEngine } from '../src/systems/GatheringEngine.js';
import { GatheringGateAndCheckEvaluator } from '../src/systems/GatheringGateAndCheckEvaluator.js';
import { GatheringRunManager } from '../src/systems/GatheringRunManager.js';

const viewer = { id: 'user-1', isGM: false };
const system = {
  id: 'system-a',
  enabled: true,
  features: { gathering: true },
  components: [{ id: 'ore', name: 'Iron Ore', difficulty: 1 }]
};

class FakeActor {
  constructor({ id = 'actor-1', uuid = 'Actor.actor-1', name = 'Gatherer' } = {}) {
    this.id = id;
    this.uuid = uuid;
    this.name = name;
    this.flags = { fabricate: {} };
    this.tokens = [];
  }

  getFlag(namespace, key) {
    return this.flags?.[namespace]?.[key];
  }

  async setFlag(namespace, key, value) {
    this.flags[namespace] = this.flags[namespace] || {};
    this.flags[namespace][key] = cloneJson(value);
    return value;
  }

  getActiveTokens() {
    return this.tokens;
  }
}

function sceneEnvironment(overrides = {}) {
  return {
    id: 'env-scene',
    craftingSystemId: system.id,
    name: 'Old Mine',
    enabled: true,
    selectionMode: 'targeted',
    sceneUuid: 'Scene.old-mine',
    tasks: [gatherTask()],
    ...overrides
  };
}

function gatherTask(overrides = {}) {
  return {
    id: 'task-ore',
    name: 'Gather Iron',
    enabled: true,
    resolutionMode: 'routed',
    catalysts: [],
    resultGroups: [{
      id: 'group-ore',
      name: 'Iron',
      results: [{ id: 'result-ore', componentId: 'ore', quantity: 2 }]
    }],
    resultSelection: { provider: 'macroOutcome', macroUuid: 'Macro.oreOutcome' },
    ...overrides
  };
}

function makeRuntime({
  actor = new FakeActor(),
  environments = [sceneEnvironment()],
  sceneState = { currentSceneUuid: 'Scene.old-mine' },
  worldTime = { value: 1000 },
  ids = ['run-1', 'run-2'],
  calls = {}
} = {}) {
  calls.scene = [];
  calls.resolveRouted = [];
  calls.planResults = [];
  calls.createResults = [];

  const store = new GatheringEnvironmentStore({
    getSetting: key => key === SETTING_KEYS.GATHERING_ENVIRONMENTS ? environments : null,
    setSetting: async () => {},
    systemManager: {
      getSystem: id => id === system.id ? system : null,
      getSystems: () => [system]
    },
    randomID: stableIdGenerator('env-id')
  });
  store.load();

  const runManager = new GatheringRunManager({
    randomID: stableIdGenerator(...ids),
    nowWorldTime: () => worldTime.value,
    getUserId: () => viewer.id,
    getActors: () => [actor]
  });

  const evaluator = new GatheringGateAndCheckEvaluator();
  const engine = new GatheringEngine({
    environmentStore: store,
    runManager,
    evaluator,
    getSystems: () => [system],
    getSelectableActors: () => [actor],
    isActorSelectable: ({ actor: candidate }) => candidate?.id === actor.id || candidate?.uuid === actor.uuid,
    isGamePaused: () => false,
    sceneAccess: {
      canAttempt: ({ environment, actor: selectedActor }) => {
        calls.scene.push({ environmentId: environment.id, actorId: selectedActor.id });
        if (sceneState.currentSceneUuid !== environment.sceneUuid) {
          return {
            allowed: false,
            code: 'SCENE_TOKEN_BLOCKED',
            messageKey: 'FABRICATE.Gathering.Blocked.SceneMissing'
          };
        }
        const hasToken = selectedActor.getActiveTokens()
          .some(token => tokenSceneUuid(token) === environment.sceneUuid);
        return hasToken
          ? { allowed: true }
          : {
              allowed: false,
              code: 'SCENE_TOKEN_BLOCKED',
              messageKey: 'FABRICATE.Gathering.Blocked.TokenMissing'
            };
      }
    },
    catalystAvailability: { check: () => ({ available: true, missing: [] }) },
    resultResolver: {
      resolveRouted: async payload => {
        calls.resolveRouted.push(payload);
        return {
          status: 'succeeded',
          resultGroups: [payload.task.resultGroups[0]],
          checkResult: { outcome: payload.task.resultGroups[0].name }
        };
      }
    },
    resultCreator: {
      plan: async payload => {
        calls.planResults.push(payload);
        return [{ actorUuid: actor.uuid, itemUuid: 'Item.ore', quantity: 2 }];
      },
      create: async payload => {
        calls.createResults.push(payload);
        return [{ actorUuid: actor.uuid, itemUuid: 'Item.ore', quantity: 2 }];
      }
    },
    catalystUsage: {
      plan: async () => [],
      apply: async () => []
    },
    localize: key => key
  });

  return { actor, engine, runManager, store, calls, sceneState, worldTime };
}

function codes(entry) {
  return entry.blockedReasons.map(reason => reason.code);
}

test('scene-linked gathering stays listable when blocked and only starts with the linked scene and token', async () => {
  const actor = new FakeActor();
  const runtime = makeRuntime({
    actor,
    sceneState: { currentSceneUuid: 'Scene.other' }
  });

  const wrongSceneListing = await runtime.engine.listForActor({ viewer, actor });
  assert.equal(wrongSceneListing.visible, true);
  assert.equal(wrongSceneListing.attemptable, false);
  assert.equal(wrongSceneListing.environments.length, 1);
  assert.deepEqual(codes(wrongSceneListing.environments[0]), ['SCENE_TOKEN_BLOCKED']);
  assert.deepEqual(codes(wrongSceneListing.environments[0].tasks[0]), ['SCENE_TOKEN_BLOCKED']);

  const wrongSceneStart = await runtime.engine.startAttempt({
    viewer,
    actor,
    environmentId: 'env-scene',
    taskId: 'task-ore'
  });
  assert.equal(wrongSceneStart.accepted, false);
  assert.deepEqual(codes(wrongSceneStart), ['SCENE_TOKEN_BLOCKED']);
  assert.deepEqual(runtime.runManager.getRunHistory(actor), []);
  assert.deepEqual(runtime.calls.resolveRouted, []);

  runtime.sceneState.currentSceneUuid = 'Scene.old-mine';
  const missingTokenListing = await runtime.engine.listForActor({ viewer, actor });
  assert.equal(missingTokenListing.attemptable, false);
  assert.equal(missingTokenListing.environments.length, 1);
  assert.deepEqual(codes(missingTokenListing.environments[0]), ['SCENE_TOKEN_BLOCKED']);

  actor.tokens = [{ id: 'token-1', parent: { uuid: 'Scene.old-mine' } }];
  const validListing = await runtime.engine.listForActor({ viewer, actor });
  assert.equal(validListing.attemptable, true);
  assert.equal(validListing.environments[0].tasks[0].attemptable, true);

  const start = await runtime.engine.startAttempt({
    viewer,
    actor,
    environmentId: 'env-scene',
    taskId: 'task-ore'
  });
  assert.equal(start.accepted, true);
  assert.equal(start.started, true);
  assert.equal(start.state, 'succeeded');
  assert.equal(start.taskId, 'task-ore');
  assert.deepEqual(codes(start), []);
  assert.equal(runtime.runManager.getRunHistory(actor).length, 1);
  assert.equal(runtime.calls.resolveRouted.length, 1);
  assert.equal(runtime.calls.createResults.length, 1);
});

test('timed gathering started through real collaborators completes from processWorldTime when mature', async () => {
  const actor = new FakeActor();
  actor.tokens = [{ id: 'token-1', parent: { uuid: 'Scene.old-mine' } }];
  const timedTask = gatherTask({
    id: 'task-timed-ore',
    timeRequirement: { minutes: 1 }
  });
  const runtime = makeRuntime({
    actor,
    environments: [sceneEnvironment({ tasks: [timedTask] })],
    ids: ['timed-run'],
    worldTime: { value: 2000 }
  });

  const started = await runtime.engine.startAttempt({
    viewer,
    actor,
    environmentId: 'env-scene',
    taskId: 'task-timed-ore'
  });

  assert.equal(started.accepted, true);
  assert.equal(started.state, 'waitingTime');
  assert.equal(started.runId, 'timed-run');
  assert.equal(runtime.runManager.getActiveRuns(actor).length, 1);
  assert.deepEqual(runtime.runManager.getRunHistory(actor), []);
  assert.deepEqual(runtime.calls.resolveRouted, []);
  assert.deepEqual(runtime.calls.createResults, []);

  const early = await runtime.engine.processWorldTime(2059);
  assert.deepEqual(early.processed, []);
  assert.equal(runtime.runManager.getActiveRuns(actor).length, 1);

  runtime.worldTime.value = 2060;
  const completed = await runtime.engine.processWorldTime(2060);

  assert.equal(completed.completed.length, 1);
  assert.equal(completed.completed[0].state, 'succeeded');
  assert.deepEqual(completed.errors, []);
  assert.deepEqual(runtime.runManager.getActiveRuns(actor), []);
  const history = runtime.runManager.getRunHistory(actor);
  assert.equal(history.length, 1);
  assert.equal(history[0].status, 'succeeded');
  assert.equal(history[0].taskId, 'task-timed-ore');
  assert.deepEqual(history[0].createdResults, [{ actorUuid: actor.uuid, itemUuid: 'Item.ore', quantity: 2 }]);
  assert.equal(runtime.calls.resolveRouted.length, 1);
  assert.equal(runtime.calls.createResults.length, 1);
});

function stableIdGenerator(...ids) {
  let index = 0;
  return () => ids[index++] ?? `${ids[0] ?? 'id'}-${index}`;
}

function tokenSceneUuid(token) {
  return token?.parent?.uuid
    ?? token?.scene?.uuid
    ?? token?.document?.parent?.uuid
    ?? null;
}

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}
