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
import { createGatheringToolAvailability } from '../src/gatheringToolRuntime.js';
import { GatheringGateAndCheckEvaluator } from '../src/systems/GatheringGateAndCheckEvaluator.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const mainPath = resolve(__dirname, '../src/main.js');
const toolRuntimePath = resolve(__dirname, '../src/gatheringToolRuntime.js');
const adaptersPath = resolve(__dirname, '../src/gatheringBootstrapAdapters.js');
const mainSource = readFileSync(mainPath, 'utf8');
const toolRuntimeSource = readFileSync(toolRuntimePath, 'utf8');
const adaptersSource = readFileSync(adaptersPath, 'utf8');

test('Fabricate exposes gathering runtime getters and API methods', () => {
  for (const expected of [
    'getGatheringEnvironmentStore()',
    'getGatheringRunManager()',
    'getGatheringGateAndCheckEvaluator()',
    'listGatheringForActor(options = {})',
    'startGatheringAttempt(options = {})',
    'getGatheringDropBreakdown(options = {})'
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
    /return callGatheringRuntimeWithCurrentViewer\(gatheringEngine, 'listForActor', withRememberedActor, \(\) => game\.user\);/,
    'listGatheringForActor should delegate through current-user viewer enforcement (with the remembered-actor default)'
  );
  assert.match(
    mainSource,
    /return callGatheringRuntimeWithCurrentViewer\(gatheringEngine, 'startAttempt', withRememberedActor, \(\) => game\.user\);/,
    'startGatheringAttempt should delegate through current-user viewer enforcement (with the remembered-actor default)'
  );
  // The three wrappers (list, attempt, drop breakdown) MUST resolve the SAME actor
  // the UI displays. They default `rememberedActorId` through
  // `_withRememberedActorDefault`: a truthy id overrides, but a null/omitted id
  // falls back to the persisted selection — NOT the engine's arbitrary
  // `selectableActors[0]` fallback (the wrong-actor "all tools missing / nothing
  // happens" bug). Guarded so a regression to the old `{ persisted, ...options }`
  // spread (where an explicit `null` clobbered the default) fails loudly.
  assert.match(
    mainSource,
    /_withRememberedActorDefault\(options = \{\}\) \{[\s\S]*?rememberedActorId: options\.rememberedActorId \|\| this\.getSelectedGatheringActorId\(\) \|\| null,/,
    '_withRememberedActorDefault should coalesce a null/omitted id to the persisted selection (a truthy id overrides)'
  );
  for (const wrapper of ['listGatheringForActor', 'startGatheringAttempt', 'getGatheringDropBreakdown']) {
    assert.match(
      mainSource,
      new RegExp(`${wrapper}\\(options = \\{\\}\\) \\{[\\s\\S]*?const withRememberedActor = this\\._withRememberedActorDefault\\(options\\);`),
      `${wrapper} should default the remembered actor through _withRememberedActorDefault`
    );
  }
  assert.equal(
    mainSource.includes('rememberedActorId: this.getSelectedGatheringActorId() || null,'),
    false,
    'the buggy `{ rememberedActorId: persisted, ...options }` spread (explicit null clobbers the default) must not return'
  );
  assert.match(
    mainSource,
    /return callGatheringRuntimeWithCurrentViewer\(gatheringEngine, 'getTaskDropBreakdown', withRememberedActor, \(\) => game\.user\);/,
    'getGatheringDropBreakdown should delegate through current-user viewer enforcement (with the remembered-actor default)'
  );
});

test('actor-selection bar wiring filters to player characters and returns redaction-safe records', () => {
  // Guard the hand-maintained predicate so a future change to the PC concept or
  // the ownership-AND-type composition fails here rather than silently widening
  // the bar's actor list (the unit test re-states this logic on the DI boundary).
  assert.ok(
    mainSource.includes("return actor?.type === 'character';"),
    "isPlayerCharacterActor should realise the player-character concept as type === 'character'"
  );
  assert.ok(
    mainSource.includes('return isGatheringActorSelectableByUser(actor, viewer) && isPlayerCharacterActor(actor);'),
    'isSelectableBarActor should compose ownership authorization AND the player-character concept'
  );
  assert.ok(
    mainSource.includes('isSelectable: (actor, viewer) => isSelectableBarActor({ actor, viewer })'),
    'getBarSelectableActors should be wired through the shared selectable-actors getter'
  );
  // Guard the redacted shape: exactly { id, uuid, name, img }, nothing else.
  assert.match(
    mainSource,
    /getBarSelectableActors\(\{ viewer: game\.user \}\)\.map\(\(actor\) => \(\{\s*id: actor\?\.id \?\? actor\?\.uuid \?\? null,\s*uuid: actor\?\.uuid \?\? null,\s*name: actor\?\.name \?\? '',\s*img: actor\?\.img \?\? null,?\s*\}\)\)/,
    'listSelectableActors should map to only the redaction-safe { id, uuid, name, img } record shape'
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
  };

  try {
    const actor = {
      getRollData: () => ({ skills: { sur: { mod: 5 } } })
    };
    const evaluator = new GatheringGateAndCheckEvaluator({
      evaluateExpression: evaluateGatheringExpression
    });

    const result = await evaluator.evaluateVisibility({
      gate: { formula: '@skills.sur.mod + 10', threshold: '12' },
      actor
    });

    assert.equal(result.visible, true);
    assert.equal(result.reasonCode, 'VISIBLE');
    assert.deepEqual(rollCalls.map(call => call.formula), ['@skills.sur.mod + 10', '12']);
    assert.deepEqual(rollCalls[0].data, { skills: { sur: { mod: 5 } } });
    // async evaluate() (not evaluateSync()), with the non-interactive option so a
    // manual roll-fulfilment dialog can never surface mid-gather (defect 3).
    assert.deepEqual(rollCalls[0].options, { allowInteractive: false });
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
    'sceneAccess: createGatheringSceneAccess({',
    'resultCreator: createGatheringResultCreator(this.craftingSystemManager)',
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
    // The ready hook may first re-run the idempotent init backstop (bindFabricateGlobal)
    // to recover from a missed `init`, then must await initialize() → world-time → ready.
    /Hooks\.once\('ready', async \(\) => \{[\s\S]*?await fabricate\.initialize\(\);\s*await processFabricateWorldTime\(\);[\s\S]*Hooks\.callAll\('fabricate\.ready'\);/s,
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
    adaptersSource,
    /getActiveTokens\?\.\(false, true\)\?\.find/,
    'scene access should request TokenDocument results from Actor#getActiveTokens'
  );
  assert.match(
    adaptersSource,
    /token\?\.parent\?\.uuid[\s\S]*token\?\.scene\?\.uuid[\s\S]*token\?\.document\?\.parent\?\.uuid/,
    'scene access should accept V13 TokenDocument parent UUID and legacy fake/placeable shapes'
  );
  // The scene-token gate applies to ALL users (no GM exemption), additive with
  // the realm/stamina/node gates.
  assert.doesNotMatch(
    adaptersSource,
    /isGM === true\) return \{ allowed: true \}/,
    'scene access should NOT exempt GM viewers from the scene gate'
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
    /createGatheringToolAvailability/,
    'main.js should wire createGatheringToolAvailability'
  );
  assert.match(
    mainSource,
    /function createGatheringToolBreakage\(/,
    'main.js should declare createGatheringToolBreakage'
  );
  assert.match(
    toolRuntimeSource,
    /toolBroken/,
    'tool availability should consider the toolBroken flag'
  );
  assert.match(
    toolRuntimeSource,
    /evaluateRequirement\?\.\(/,
    'tool availability should evaluate per-tool requirement'
  );
});

test('tool availability injectable blocks when actor lacks a required library tool', async () => {
  const availability = createGatheringToolAvailability({
    craftingSystemManager: {
      toolMatchesItem: (_recipe, tool, item) => tool.componentId === item.componentId
    },
    evaluator: { evaluateRequirement: async () => ({ allowed: true }) }
  });

  const result = await availability.check({
    actor: { uuid: 'Actor.actor-1', items: [] },
    system: { id: 'system-a' },
    task: { id: 'task-a' },
    tools: [{ componentId: 'tool-pick' }]
  });

  assert.equal(result.available, false);
  assert.deepEqual(result.missing, [{ componentId: 'tool-pick' }]);
});

test('tool availability injectable treats actor tools flagged broken as missing', async () => {
  const availability = createGatheringToolAvailability({
    craftingSystemManager: {
      toolMatchesItem: (_recipe, tool, item) => tool.componentId === item.componentId
    },
    evaluator: { evaluateRequirement: async () => ({ allowed: true }) }
  });
  const brokenItem = {
    uuid: 'Item.pick',
    componentId: 'tool-pick',
    flags: { fabricate: { toolBroken: true } },
    getFlag: (namespace, key) => namespace === 'fabricate' && key === 'toolBroken' ? true : undefined
  };

  const result = await availability.check({
    actor: { uuid: 'Actor.actor-1', items: [brokenItem] },
    system: { id: 'system-a' },
    task: { id: 'task-a' },
    tools: [{ componentId: 'tool-pick' }]
  });

  assert.equal(result.available, false);
  assert.deepEqual(result.missing, [{ componentId: 'tool-pick' }]);
});
