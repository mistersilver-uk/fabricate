import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  callGatheringRuntimeWithCurrentViewer,
  createGatheringSelectableActorsGetter,
  evaluateGatheringExpression,
  processWorldTimeCallbacksSafely,
  withCurrentGatheringViewer
} from '../src/gatheringBootstrapAdapters.js';
import { GatheringGateAndCheckEvaluator } from '../src/systems/GatheringGateAndCheckEvaluator.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const mainPath = resolve(__dirname, '../src/main.js');
const mainSource = readFileSync(mainPath, 'utf8');

test('Fabricate exposes gathering runtime getters and API methods', () => {
  for (const expected of [
    'getGatheringEnvironmentStore()',
    'getGatheringRunManager()',
    'getGatheringGateAndCheckEvaluator()',
    'listGatheringForActor(options = {})',
    'startGatheringAttempt(options = {})'
  ]) {
    assert.ok(mainSource.includes(expected), `src/main.js should expose ${expected}`);
  }

  assert.equal(
    mainSource.includes('getGatheringEngine()'),
    false,
    'game.fabricate should not expose a raw GatheringEngine accessor'
  );
  assert.equal(
    mainSource.includes('this.gatheringEngine'),
    false,
    'the raw GatheringEngine instance should not be exposed as a public Fabricate property'
  );

  assert.match(
    mainSource,
    /return callGatheringRuntimeWithCurrentViewer\(gatheringEngine, 'listForActor', options, \(\) => game\.user\);/,
    'listGatheringForActor should delegate through current-user viewer enforcement'
  );
  assert.match(
    mainSource,
    /return callGatheringRuntimeWithCurrentViewer\(gatheringEngine, 'startAttempt', options, \(\) => game\.user\);/,
    'startGatheringAttempt should delegate through current-user viewer enforcement'
  );
});

test('current-user viewer enforcement prevents public API viewer spoofing', () => {
  const currentUser = { id: 'real-user', isGM: false };
  const spoofedUser = { id: 'spoofed-gm', isGM: true };

  const payload = withCurrentGatheringViewer(
    { actor: { id: 'actor-1' }, viewer: spoofedUser, environmentId: 'env-a' },
    () => currentUser
  );

  assert.equal(payload.viewer, currentUser);
  assert.equal(payload.viewer.isGM, false);
  assert.equal(payload.environmentId, 'env-a');
});

test('public gathering API wrappers force current user before reaching runtime methods', () => {
  const calls = [];
  const currentUser = { id: 'real-user', isGM: false };
  const spoofedUser = { id: 'spoofed-gm', isGM: true };
  const runtime = {
    listForActor: (payload) => {
      calls.push({ method: 'listForActor', payload });
      return payload;
    },
    startAttempt: (payload) => {
      calls.push({ method: 'startAttempt', payload });
      return payload;
    }
  };

  const listPayload = callGatheringRuntimeWithCurrentViewer(
    runtime,
    'listForActor',
    { viewer: spoofedUser, rememberedActorId: 'actor-a' },
    () => currentUser
  );
  const startPayload = callGatheringRuntimeWithCurrentViewer(
    runtime,
    'startAttempt',
    { viewer: spoofedUser, environmentId: 'env-a', taskId: 'task-a' },
    () => currentUser
  );

  assert.equal(listPayload.viewer, currentUser);
  assert.equal(startPayload.viewer, currentUser);
  assert.equal(calls[0].payload.viewer.isGM, false);
  assert.equal(calls[1].payload.viewer.isGM, false);
  assert.deepEqual(calls.map(call => call.method), ['listForActor', 'startAttempt']);
});

test('selectable-actors adapter accepts GatheringEngine payload shape and preserves viewer permissions', () => {
  const player = { id: 'player', isGM: false };
  const gm = { id: 'gm', isGM: true };
  const ownedActor = { id: 'owned', ownership: { player: 3 } };
  const gmOnlyActor = { id: 'gm-only', ownership: {} };
  const actors = new Map([
    [ownedActor.id, ownedActor],
    [gmOnlyActor.id, gmOnlyActor]
  ]);

  const getSelectableActors = createGatheringSelectableActorsGetter({
    getActors: () => actors,
    getCurrentUser: () => player,
    isSelectable: (actor, viewer) => viewer?.isGM === true || actor.ownership?.[viewer?.id] >= 3
  });

  assert.deepEqual(getSelectableActors({ viewer: player }).map(actor => actor.id), ['owned']);
  assert.deepEqual(getSelectableActors({ viewer: gm }).map(actor => actor.id), ['owned', 'gm-only']);
  assert.deepEqual(getSelectableActors().map(actor => actor.id), ['owned']);
});

test('expression adapter accepts evaluator payload shape and uses actor roll data', async () => {
  const rollCalls = [];
  const previousRoll = globalThis.Roll;
  globalThis.Roll = class FakeRoll {
    constructor(formula, data) {
      this.formula = formula;
      this.data = data;
      rollCalls.push({ formula, data });
    }

    async evaluate(options) {
      rollCalls[rollCalls.length - 1].options = options;
      return { total: this.formula === '@skills.sur.mod + 10' ? this.data.skills.sur.mod + 10 : 12 };
    }

    evaluateSync() {
      rollCalls[rollCalls.length - 1].options = 'sync';
      return { total: this.formula === '@skills.sur.mod + 10' ? this.data.skills.sur.mod + 10 : 12 };
    }
  };

  try {
    const actor = {
      getRollData: () => ({ skills: { sur: { mod: 5 } } })
    };
    const evaluator = new GatheringGateAndCheckEvaluator({
      evaluateExpression: evaluateGatheringExpression
    });

    const result = await evaluator.evaluateVisibility({
      gate: { provider: 'dnd5e', formula: '@skills.sur.mod + 10', threshold: '12' },
      actor
    });

    assert.equal(result.visible, true);
    assert.equal(result.reasonCode, 'VISIBLE');
    assert.deepEqual(rollCalls.map(call => call.formula), ['@skills.sur.mod + 10', '12']);
    assert.deepEqual(rollCalls[0].data, { skills: { sur: { mod: 5 } } });
    assert.equal(rollCalls[0].options, 'sync');
  } finally {
    if (previousRoll === undefined) {
      delete globalThis.Roll;
    } else {
      globalThis.Roll = previousRoll;
    }
  }
});

test('bootstrap constructs gathering collaborators after systems load with explicit seams', () => {
  assert.ok(
    mainSource.indexOf('await this.craftingSystemManager.initialize();') <
      mainSource.indexOf('this.gatheringEnvironmentStore = new GatheringEnvironmentStore'),
    'environment store should be created after systems initialize'
  );
  assert.ok(
    mainSource.includes('this.gatheringEnvironmentStore.load();'),
    'environment store should load persisted environments during bootstrap'
  );

  for (const expected of [
    'environmentStore: this.gatheringEnvironmentStore',
    'runManager: this.gatheringRunManager',
    'evaluator: this.gatheringGateAndCheckEvaluator',
    'systemManager: this.craftingSystemManager',
    'getSelectableActors: getGatheringSelectableActors',
    'isActorSelectable: ({ actor, viewer }) => isGatheringActorSelectableByUser(actor, viewer)',
    'sceneAccess: { canAttempt: canAttemptGatheringInScene }',
    'catalystAvailability: createGatheringCatalystAvailability(this.craftingSystemManager)',
    'resultResolver: createGatheringResultResolver(this.resolutionModeService)',
    'resultCreator: createGatheringResultCreator(this.craftingSystemManager)',
    'catalystUsage: createGatheringCatalystUsage(this.craftingSystemManager)',
    'failureFeedback: createGatheringFailureFeedback()',
    'getRunViewer: getGatheringRunViewer',
    'localize: localizeGathering'
  ]) {
    assert.ok(mainSource.includes(expected), `GatheringEngine should receive ${expected}`);
  }

  for (const expected of [
    'removeRunsForSystem: (systemId) => this.gatheringRunManager.removeRunsForSystem(systemId)',
    'removeRunsForEnvironment: (environmentId) => this.gatheringRunManager.removeRunsForEnvironment(environmentId)',
    'removeRunsForTask: (taskId, options) => this.gatheringRunManager.removeRunsForTask(taskId, options)'
  ]) {
    assert.ok(mainSource.includes(expected), `environment cleanup should wire ${expected}`);
  }
});

test('world-time hooks dispatch gathering without coupling failures to existing processors', () => {
  assert.match(
    mainSource,
    /processWorldTimeCallbacksSafely\(\[\s*\{\s*label: 'Crafting',\s*callback: \(\) => game\.fabricate\?\.getCraftingRunManager\?\.\(\)\?\.processWorldTime\?\.\(worldTime\)\s*\}/s,
    'crafting world-time processing should still run'
  );
  assert.match(
    mainSource,
    /label: 'Salvage',\s*callback: \(\) => game\.fabricate\?\.getCraftingEngine\?\.\(\)\?\.processPendingSalvageRuns\?\.\(worldTime\)/s,
    'salvage world-time processing should still run'
  );
  assert.match(
    mainSource,
    /label: 'Gathering',\s*callback: \(\) => gatheringEngine\?\.processWorldTime\?\.\(worldTime\)/s,
    'gathering world-time processing should run through GatheringEngine.processWorldTime'
  );
  assert.match(
    mainSource,
    /Hooks\.once\('ready', async \(\) => \{\s*await fabricate\.initialize\(\);\s*await processFabricateWorldTime\(\);[\s\S]*Hooks\.callAll\('fabricate\.ready'\);/s,
    'ready hook should await startup world-time processing before fabricate.ready'
  );
  assert.match(
    mainSource,
    /Hooks\.on\('updateWorldTime', \(worldTime\) => \{\s*void processFabricateWorldTime\(worldTime\);\s*\}\);/s,
    'updateWorldTime hook should explicitly fire-and-forget the guarded dispatcher'
  );
  assert.match(
    mainSource,
    /let gatheringEngine = null;[\s\S]*gatheringEngine = new GatheringEngine\(/,
    'GatheringEngine should remain module-private while still receiving timed completion calls'
  );
  assert.match(
    mainSource,
    /function processFabricateWorldTime\(worldTime = Number\(game\.time\?\.worldTime \|\| 0\)\) \{\s*return Promise\.all\(processWorldTimeCallbacksSafely\(\[[\s\S]*label: 'Crafting'[\s\S]*label: 'Salvage'[\s\S]*label: 'Gathering'/,
    'startup and update dispatch should return guarded settlement for crafting, salvage, and gathering processors'
  );
});

test('world-time processor helper continues after synchronous throws and async rejections', async () => {
  const calls = [];
  const errors = [];

  const settlements = processWorldTimeCallbacksSafely([
    {
      label: 'Crafting',
      callback: () => {
        calls.push('crafting');
        throw new Error('crafting failed');
      }
    },
    {
      label: 'Salvage',
      callback: async () => {
        calls.push('salvage');
        throw new Error('salvage failed');
      }
    },
    {
      label: 'Gathering',
      callback: () => {
        calls.push('gathering');
      }
    }
  ], {
    onError: (label, error) => errors.push({ label, message: error.message })
  });

  assert.deepEqual(calls, ['crafting', 'salvage', 'gathering']);
  await Promise.all(settlements);
  assert.deepEqual(errors, [
    { label: 'Crafting', message: 'crafting failed' },
    { label: 'Salvage', message: 'salvage failed' }
  ]);
});

test('awaited startup settlement delays fabricate.ready until all guarded processors settle', async () => {
  const calls = [];
  const errors = [];
  let releaseCrafting;

  async function simulatedReadyHook() {
    await Promise.all(processWorldTimeCallbacksSafely([
      {
        label: 'Crafting',
        callback: () => {
          calls.push('crafting');
          return new Promise(resolve => {
            releaseCrafting = resolve;
          });
        }
      },
      {
        label: 'Salvage',
        callback: () => {
          calls.push('salvage');
          throw new Error('salvage failed');
        }
      },
      {
        label: 'Gathering',
        callback: async () => {
          calls.push('gathering');
          throw new Error('gathering failed');
        }
      }
    ], {
      onError: (label, error) => errors.push({ label, message: error.message })
    }));
    calls.push('fabricate.ready');
  }

  const readyPromise = simulatedReadyHook();
  assert.deepEqual(calls, ['crafting', 'salvage', 'gathering']);
  assert.equal(calls.includes('fabricate.ready'), false);

  releaseCrafting();
  await readyPromise;

  assert.deepEqual(calls, ['crafting', 'salvage', 'gathering', 'fabricate.ready']);
  assert.deepEqual(errors, [
    { label: 'Salvage', message: 'salvage failed' },
    { label: 'Gathering', message: 'gathering failed' }
  ]);
});

test('scene access adapter accepts Foundry V13 TokenDocument parent scene shape', () => {
  assert.match(
    mainSource,
    /getActiveTokens\?\.\(false, true\)\?\.find/,
    'scene access should request TokenDocument results from Actor#getActiveTokens'
  );
  assert.match(
    mainSource,
    /token\?\.parent\?\.uuid[\s\S]*token\?\.scene\?\.uuid[\s\S]*token\?\.document\?\.parent\?\.uuid/,
    'scene access should accept V13 TokenDocument parent UUID and legacy fake/placeable shapes'
  );
});

test('GatheringEngine is constructed with tool availability and breakage injectables', () => {
  assert.match(
    mainSource,
    /toolAvailability: createGatheringToolAvailability\(/,
    'GatheringEngine should be given a toolAvailability factory'
  );
  assert.match(
    mainSource,
    /toolBreakage: createGatheringToolBreakage\(/,
    'GatheringEngine should be given a toolBreakage factory'
  );
});

test('tool availability injectable matches by componentId and skips broken-flagged items', () => {
  assert.match(
    mainSource,
    /function createGatheringToolAvailability\(/,
    'main.js should declare createGatheringToolAvailability'
  );
  assert.match(
    mainSource,
    /function createGatheringToolBreakage\(/,
    'main.js should declare createGatheringToolBreakage'
  );
  assert.match(
    mainSource,
    /toolBroken/,
    'tool availability should consider the toolBroken flag'
  );
  assert.match(
    mainSource,
    /evaluateRequirement\?\.\(/,
    'tool availability should evaluate per-tool requirement'
  );
});
