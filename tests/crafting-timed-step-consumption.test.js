/**
 * Tests for timed crafting-step consumption (fix/crafting-timed-step-consumption).
 *
 * A crafting step whose time requirement resolves to > 0 seconds now consumes
 * its components (and currency) at START — the call that ARMS the world-time
 * gate — then resumes at maturity (FINISH) to run the crafting check and create
 * results WITHOUT re-consuming. Covers:
 *   1. _formatMissingItems renders component display names.
 *   2. A timed step consumes at START (gate-arm call), leaving a waiting run.
 *   3. After maturity, FINISH produces results without the components present and
 *      completes the run to history.
 *   4. Essence transfer works via the persisted resolvedEssences snapshot.
 *   5. A failed final check does NOT refund and completes the run as failed.
 *   6. Missing components at START leave NO lingering active run (zombie guard)
 *      and the message includes component names.
 *   7. Non-timed step behaviour is unchanged (consume at finish, produce results).
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { CraftingEngine } from '../src/systems/CraftingEngine.js';
import { CraftingRunManager } from '../src/systems/CraftingRunManager.js';

// ---------------------------------------------------------------------------
// Foundry / game globals
// ---------------------------------------------------------------------------

function getProperty(object, path) {
  if (!object || !path) return undefined;
  return String(path)
    .split('.')
    .reduce((value, key) => (value == null ? undefined : value[key]), object);
}

function setProperty(object, path, value) {
  const keys = String(path).split('.');
  let cursor = object;
  for (let i = 0; i < keys.length - 1; i += 1) {
    cursor[keys[i]] = cursor[keys[i]] || {};
    cursor = cursor[keys[i]];
  }
  cursor[keys[keys.length - 1]] = value;
  return object;
}

let _idCounter = 0;
globalThis.foundry = {
  utils: {
    getProperty,
    setProperty,
    randomID: () => `id-${++_idCounter}`,
    deepClone: (value) => JSON.parse(JSON.stringify(value ?? null)),
  },
};
globalThis.ui = { notifications: { info() {}, warn() {}, error() {} } };

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

class FakeItem {
  constructor(id, name, quantity = 1) {
    this.id = id;
    this.uuid = `Item.${id}`;
    this.name = name;
    this.img = `icons/${id}.png`;
    this.parent = null;
    this.system = { quantity };
    this.effects = [];
    this._deleted = false;
    this._updates = [];
  }
  async delete() {
    this._deleted = true;
  }
  async update(payload) {
    this._updates.push({ ...payload });
    if (payload['system.quantity'] !== undefined) this.system.quantity = payload['system.quantity'];
  }
  toObject() {
    return { name: this.name, img: this.img, type: 'loot', system: { ...this.system } };
  }
}

class FakeActor {
  constructor(name, items = []) {
    this.id = `actor-${name}`;
    this.uuid = `Actor.${name}`;
    this.name = name;
    this.items = items;
    for (const item of items) item.parent = this;
    this._flags = {};
    this.createdEffects = [];
    this._createdDocs = [];
  }
  getFlag(ns, key) {
    return this._flags?.[ns]?.[key];
  }
  async setFlag(ns, key, value) {
    this._flags[ns] = this._flags[ns] || {};
    this._flags[ns][key] = value;
    return value;
  }
  async createEmbeddedDocuments(type, data) {
    if (type === 'ActiveEffect') {
      this.createdEffects.push(...data);
      return data;
    }
    const created = data.map((d, i) => {
      const item = new FakeItem(`created-${this._createdDocs.length + i}`, d.name, d.system?.quantity || 1);
      item.parent = this;
      item.createEmbeddedDocuments = async (t, effectData) => {
        item.effects.push(...effectData);
        return effectData;
      };
      return item;
    });
    this._createdDocs.push(...created);
    return created;
  }
}

// A duck-typed ingredient set whose resolveIngredientSelection matches items by
// componentId. Currency spends are empty here (component-only recipes).
function buildIngredientSet(id, ingredientDefs) {
  return {
    id,
    resolveIngredientSelection(availableItems, matcher) {
      const plan = [];
      for (const def of ingredientDefs) {
        const ingredient = {
          componentId: def.componentId,
          systemItemId: def.componentId,
          quantity: def.quantity,
          match: { type: 'component', componentId: def.componentId },
          getDescription: () => `${def.quantity}x component`,
        };
        const item = availableItems.find((i) => matcher(ingredient, i));
        if (item) plan.push({ item, quantity: def.quantity, ingredient });
      }
      return { success: plan.length === ingredientDefs.length, plan, currencySpends: [], missingGroups: [] };
    },
  };
}

function buildRecipe({ craftingSystemId, ingredientSets, resultGroups = [], steps, transferEffects = false }) {
  return {
    id: 'recipe-timed',
    name: 'Timed Recipe',
    craftingSystemId,
    ingredientSets,
    resultGroups,
    toolIds: [],
    outcomeRouting: null,
    resultSelection: null,
    transferEffects,
    getExecutionSteps: () => steps,
    validate() {
      return { valid: true, errors: [] };
    },
    toJSON() {
      return { id: this.id, name: this.name, craftingSystemId: this.craftingSystemId };
    },
  };
}

function buildRecipeManager({ ingredientSet, canCraft = true, missing = null }) {
  return {
    canCraft() {
      if (!canCraft) {
        return {
          canCraft: false,
          satisfiableSet: null,
          missing: missing || { ingredients: [], essences: [], tools: [] },
        };
      }
      return {
        canCraft: true,
        satisfiableSet: ingredientSet,
        missing: { ingredients: [], essences: [], tools: [] },
      };
    },
    getToolsForSet() {
      return [];
    },
    toolMatchesItem() {
      return false;
    },
    ingredientMatchesItem(_recipe, ingredient, item) {
      return item.id === (ingredient.componentId || ingredient.systemItemId);
    },
  };
}

function setupGame(system, worldTime = 1000) {
  globalThis.game = {
    fabricate: {
      getCraftingSystemManager: () => ({ getSystem: (id) => (id === system.id ? system : null) }),
      getResolutionModeService: () => null,
      getRecipeVisibilityService: () => null,
    },
    user: { id: 'user-gm', isGM: true },
    time: { worldTime },
    actors: [],
  };
}

function timedStep({ id = 'step-1', ingredientSets, resultGroups = [] } = {}) {
  return {
    id,
    name: 'Timed Step',
    ingredientSets,
    resultGroups,
    toolIds: [],
    outcomeRouting: null,
    timeRequirement: { hours: 1 },
  };
}

// ---------------------------------------------------------------------------
// 1. _formatMissingItems renders component display names
// ---------------------------------------------------------------------------

test('_formatMissingItems renders component display names from the system components', () => {
  const system = {
    id: 'sys-fmt',
    components: [{ id: 'iron-rivet', name: 'Iron Rivet' }],
  };
  setupGame(system);
  const engine = new CraftingEngine({});

  const missing = {
    ingredients: [
      {
        ingredient: {
          match: { type: 'component', componentId: 'iron-rivet' },
          getDescription: () => '2x component',
        },
        have: 0,
        need: 2,
      },
    ],
    essences: [],
    tools: [],
  };

  const message = engine._formatMissingItems(missing, { craftingSystemId: 'sys-fmt' });
  assert.equal(message, '2x Iron Rivet: have 0, need 2');
});

test('_formatMissingItems falls back to getDescription when no component name resolves', () => {
  const system = { id: 'sys-fmt2', components: [] };
  setupGame(system);
  const engine = new CraftingEngine({});
  const missing = {
    ingredients: [{ ingredient: { getDescription: () => 'Mystery Herb' }, have: 1, need: 3 }],
    essences: [],
    tools: [],
  };
  const message = engine._formatMissingItems(missing, { craftingSystemId: 'sys-fmt2' });
  assert.equal(message, 'Mystery Herb: have 1, need 3');
});

// ---------------------------------------------------------------------------
// 2. Timed step consumes at START (gate-arm call), leaving a waiting run
// ---------------------------------------------------------------------------

test('timed step consumes components at START (gate arm), leaving a waitingTime run', async () => {
  const system = {
    id: 'sys-timed',
    resolutionMode: 'simple',
    features: { craftingChecks: false, essences: false },
    craftingCheck: { enabled: false, consumption: {} },
    components: [{ id: 'wood', name: 'Wood' }],
  };
  setupGame(system, 1000);

  const wood = new FakeItem('wood', 'Wood', 5);
  const craftingActor = new FakeActor('Crafter');
  const sourceActor = new FakeActor('Source', [wood]);
  const set = buildIngredientSet('set-1', [{ componentId: 'wood', quantity: 2 }]);
  const recipe = buildRecipe({
    craftingSystemId: 'sys-timed',
    ingredientSets: [set],
    resultGroups: [{ id: 'rg-1', results: [{ id: 'r-1', componentId: 'plank', quantity: 1 }] }],
    steps: [timedStep({ ingredientSets: [set], resultGroups: [{ id: 'rg-1', results: [{ id: 'r-1', componentId: 'plank', quantity: 1 }] }] })],
  });

  const runManager = new CraftingRunManager();
  const engine = new CraftingEngine(buildRecipeManager({ ingredientSet: set }), runManager, null);
  engine._runCraftingCheck = async () => ({ success: true, outcome: null, value: null, data: {} });

  const result = await engine.craft(craftingActor, [sourceActor], recipe, null, {});

  assert.equal(result.success, false, 'START returns "in progress" while the gate matures');
  assert.match(result.message, /in progress/i);
  // Components already reduced at START.
  assert.equal(wood.system.quantity, 3, 'wood reduced from 5 to 3 at START (consumed 2)');

  const activeRuns = runManager.getActiveRuns(craftingActor);
  assert.equal(activeRuns.length, 1, 'exactly one waiting run is kept active');
  assert.equal(activeRuns[0].status, 'waitingTime');
  const step = activeRuns[0].steps[0];
  assert.ok(step.timeGate, 'the time gate is armed');
  assert.ok(step.preparedConsumption, 'the START consumption snapshot is persisted');
  assert.equal(step.preparedConsumption.selectedIngredientSetId, 'set-1');
  assert.equal(step.preparedConsumption.consumedSummary.length, 1);
  assert.equal(step.preparedConsumption.consumedSummary[0].componentId, 'wood');
});

// ---------------------------------------------------------------------------
// 2b. When the system's time requirements are DISABLED, a step's timeRequirement
//     does NOT arm a gate — the craft resolves immediately (issue 714).
// ---------------------------------------------------------------------------

test('a timed step resolves immediately when requirements.time.enabled === false', async () => {
  const system = {
    id: 'sys-time-off',
    resolutionMode: 'simple',
    features: { craftingChecks: false, essences: false },
    craftingCheck: { enabled: false, consumption: {} },
    requirements: { time: { enabled: false } },
    components: [{ id: 'wood', name: 'Wood' }],
  };
  setupGame(system, 1000);

  const wood = new FakeItem('wood', 'Wood', 3);
  const plank = new FakeItem('plank-result', 'Plank', 1);
  const craftingActor = new FakeActor('Crafter');
  const sourceActor = new FakeActor('Source', [wood]);
  const resultGroups = [{ id: 'rg-1', results: [{ id: 'r-1', componentId: 'plank', quantity: 1 }] }];
  const set = buildIngredientSet('set-1', [{ componentId: 'wood', quantity: 2 }]);
  const recipe = buildRecipe({
    craftingSystemId: 'sys-time-off',
    ingredientSets: [set],
    resultGroups,
    steps: [timedStep({ ingredientSets: [set], resultGroups })],
  });

  const runManager = new CraftingRunManager();
  const engine = new CraftingEngine(buildRecipeManager({ ingredientSet: set }), runManager, null);
  engine._runCraftingCheck = async () => ({ success: true, outcome: null, value: null, data: {} });
  engine._createSingleResult = async () => plank;

  const result = await engine.craft(craftingActor, [sourceActor], recipe, null, {});

  assert.equal(result.success, true, 'the craft completes in a single call — no time gate');
  assert.equal(result.results.length, 1, 'results are produced immediately');
  assert.equal(wood.system.quantity, 1, 'wood consumed once at finish (3 -> 1)');
  assert.equal(
    runManager.getActiveRuns(craftingActor).length,
    0,
    'no waiting run is left active when time requirements are off'
  );
  assert.equal(runManager.getRunHistory(craftingActor).length, 1, 'the completed run is archived');
});

test('a timed step still arms a gate when requirements.time is absent (default on)', async () => {
  const system = {
    id: 'sys-time-default',
    resolutionMode: 'simple',
    features: { craftingChecks: false, essences: false },
    craftingCheck: { enabled: false, consumption: {} },
    components: [{ id: 'wood', name: 'Wood' }],
  };
  setupGame(system, 1000);

  const wood = new FakeItem('wood', 'Wood', 5);
  const craftingActor = new FakeActor('Crafter');
  const sourceActor = new FakeActor('Source', [wood]);
  const resultGroups = [{ id: 'rg-1', results: [{ id: 'r-1', componentId: 'plank', quantity: 1 }] }];
  const set = buildIngredientSet('set-1', [{ componentId: 'wood', quantity: 2 }]);
  const recipe = buildRecipe({
    craftingSystemId: 'sys-time-default',
    ingredientSets: [set],
    resultGroups,
    steps: [timedStep({ ingredientSets: [set], resultGroups })],
  });

  const runManager = new CraftingRunManager();
  const engine = new CraftingEngine(buildRecipeManager({ ingredientSet: set }), runManager, null);
  engine._runCraftingCheck = async () => ({ success: true, outcome: null, value: null, data: {} });

  const result = await engine.craft(craftingActor, [sourceActor], recipe, null, {});

  assert.equal(result.success, false, 'an absent time flag defaults ON, so the gate arms');
  assert.match(result.message, /in progress/i);
  const activeRuns = runManager.getActiveRuns(craftingActor);
  assert.equal(activeRuns.length, 1, 'the waiting run is kept active');
  assert.equal(activeRuns[0].status, 'waitingTime');
});

// ---------------------------------------------------------------------------
// 3. FINISH produces results without components present, completes to history
// ---------------------------------------------------------------------------

test('timed step FINISH produces results without the components present and completes the run', async () => {
  const system = {
    id: 'sys-timed3',
    resolutionMode: 'simple',
    features: { craftingChecks: false, essences: false },
    craftingCheck: { enabled: false, consumption: {} },
    components: [{ id: 'wood', name: 'Wood' }],
  };
  setupGame(system, 1000);

  const wood = new FakeItem('wood', 'Wood', 2);
  const plank = new FakeItem('plank-result', 'Plank', 1);
  const craftingActor = new FakeActor('Crafter');
  const sourceActor = new FakeActor('Source', [wood]);
  const resultGroups = [{ id: 'rg-1', results: [{ id: 'r-1', componentId: 'plank', quantity: 1 }] }];
  const set = buildIngredientSet('set-1', [{ componentId: 'wood', quantity: 2 }]);
  const recipe = buildRecipe({
    craftingSystemId: 'sys-timed3',
    ingredientSets: [set],
    resultGroups,
    steps: [timedStep({ ingredientSets: [set], resultGroups })],
  });

  const runManager = new CraftingRunManager();
  const engine = new CraftingEngine(buildRecipeManager({ ingredientSet: set }), runManager, null);
  engine._runCraftingCheck = async () => ({ success: true, outcome: null, value: null, data: {} });
  engine._createSingleResult = async () => plank;

  // START: arm gate + consume (wood 2 -> deleted).
  const startResult = await engine.craft(craftingActor, [sourceActor], recipe, null, {});
  assert.equal(startResult.success, false);
  assert.equal(wood._deleted, true, 'wood fully consumed at START');

  // Simulate the source actor no longer having the wood (already consumed).
  sourceActor.items = [];

  // Advance world time past the gate.
  game.time.worldTime = 1000 + 3600 + 1;

  // FINISH: no components present, but results are still produced.
  const finishResult = await engine.craft(craftingActor, [sourceActor], recipe, null, {});
  assert.equal(finishResult.success, true, 'FINISH succeeds even though the components are gone');
  assert.equal(finishResult.results.length, 1);
  assert.equal(finishResult.results[0].name, 'Plank');

  assert.equal(runManager.getActiveRuns(craftingActor).length, 0, 'no active run remains after FINISH');
  const history = runManager.getRunHistory(craftingActor);
  assert.equal(history.length, 1, 'the completed run is archived to history');
  assert.equal(history[0].status, 'succeeded');
  const consumed = history[0].steps[0].consumedIngredients;
  assert.equal(consumed.length, 1, 'run history records the consumed component');
  // Issue 738: the timed FINISH path must persist the consume-time name/img/componentId
  // (captured into the START snapshot before the source items were deleted), exactly like
  // the immediate craft paths do via mapConsumedIngredientRef. Regression guard: this ref
  // previously dropped to a bare {actorUuid,itemUuid,quantity}, blanking the history row.
  assert.equal(consumed[0].name, 'Wood', 'the timed-step run persists the consume-time name');
  assert.equal(consumed[0].img, 'icons/wood.png', 'the timed-step run persists the consume-time img');
  assert.equal(consumed[0].componentId, 'wood', 'the timed-step run persists the componentId');
  assert.equal(consumed[0].itemUuid, 'Item.wood');
  assert.equal(consumed[0].quantity, 2);
});

// ---------------------------------------------------------------------------
// 3b. Disabling time requirements MID-RUN must still resume an already-armed
//     gate — the flag gates arming a NEW gate only, never re-consumes (issue 714)
// ---------------------------------------------------------------------------

test('an already-armed gate still resumes (no double consume) when time requirements are disabled mid-run', async () => {
  const system = {
    id: 'sys-toggle-midrun',
    resolutionMode: 'simple',
    features: { craftingChecks: false, essences: false },
    craftingCheck: { enabled: false, consumption: {} },
    components: [{ id: 'wood', name: 'Wood' }],
  };
  setupGame(system, 1000);

  const wood = new FakeItem('wood', 'Wood', 2);
  const plank = new FakeItem('plank-result', 'Plank', 1);
  const craftingActor = new FakeActor('Crafter');
  const sourceActor = new FakeActor('Source', [wood]);
  const resultGroups = [{ id: 'rg-1', results: [{ id: 'r-1', componentId: 'plank', quantity: 1 }] }];
  const set = buildIngredientSet('set-1', [{ componentId: 'wood', quantity: 2 }]);
  const recipe = buildRecipe({
    craftingSystemId: 'sys-toggle-midrun',
    ingredientSets: [set],
    resultGroups,
    steps: [timedStep({ ingredientSets: [set], resultGroups })],
  });

  const runManager = new CraftingRunManager();
  const engine = new CraftingEngine(buildRecipeManager({ ingredientSet: set }), runManager, null);
  engine._runCraftingCheck = async () => ({ success: true, outcome: null, value: null, data: {} });
  engine._createSingleResult = async () => plank;

  // START (time on by default): arm the gate + consume the wood.
  const startResult = await engine.craft(craftingActor, [sourceActor], recipe, null, {});
  assert.equal(startResult.success, false, 'START arms the gate while time is enabled');
  assert.equal(wood._deleted, true, 'wood fully consumed at START');

  // GM disables time requirements while the gate is still maturing.
  system.requirements = { time: { enabled: false } };
  sourceActor.items = [];
  game.time.worldTime = 1000 + 3600 + 1;

  // Guard against any re-consumption at FINISH.
  const consumeSpy = { called: false };
  engine._consumeIngredients = async () => {
    consumeSpy.called = true;
    return [];
  };

  const finishResult = await engine.craft(craftingActor, [sourceActor], recipe, null, {});
  assert.equal(finishResult.success, true, 'the armed gate still resumes despite the disabled flag');
  assert.equal(finishResult.results.length, 1, 'results are produced on resume');
  assert.equal(consumeSpy.called, false, 'FINISH never re-consumes (no double count)');
  assert.equal(runManager.getActiveRuns(craftingActor).length, 0, 'no active run remains after resume');
  assert.equal(runManager.getRunHistory(craftingActor).length, 1, 'the completed run is archived');
});

// ---------------------------------------------------------------------------
// 4. Essence transfer via the persisted resolvedEssences snapshot
// ---------------------------------------------------------------------------

test('timed step transfers effects via the persisted resolvedEssences snapshot', async () => {
  const essenceSourceItem = new FakeItem('fire-src', 'Fire Crystal', 1);
  essenceSourceItem.effects = [{ toObject: () => ({ name: 'Burning', changes: [] }) }];

  const system = {
    id: 'sys-ess',
    resolutionMode: 'simple',
    features: { craftingChecks: false, essences: true, effectTransfer: true },
    craftingCheck: { enabled: false, consumption: {} },
    components: [
      { id: 'ember', name: 'Ember', essences: { fire: 1 } },
      { id: 'fire-comp', name: 'Fire Comp', registeredItemUuid: 'Item.fire-src' },
    ],
    essenceDefinitions: [{ id: 'fire', sourceComponentId: 'fire-comp' }],
  };
  setupGame(system, 500);

  // fromUuid resolves the essence-definition source item.
  globalThis.fromUuid = async (uuid) => (uuid === 'Item.fire-src' ? essenceSourceItem : null);

  const ember = new FakeItem('ember', 'Ember', 1);
  const craftingActor = new FakeActor('Crafter');
  const sourceActor = new FakeActor('Source', [ember]);
  const resultGroups = [{ id: 'rg-1', results: [{ id: 'r-1', componentId: 'ember', quantity: 1 }] }];
  const set = buildIngredientSet('set-1', [{ componentId: 'ember', quantity: 1 }]);
  const recipe = buildRecipe({
    craftingSystemId: 'sys-ess',
    ingredientSets: [set],
    resultGroups,
    steps: [timedStep({ ingredientSets: [set], resultGroups })],
    transferEffects: true,
  });

  const runManager = new CraftingRunManager();
  const engine = new CraftingEngine(buildRecipeManager({ ingredientSet: set }), runManager, null);
  engine._runCraftingCheck = async () => ({ success: true, outcome: null, value: null, data: {} });

  // START consumes the ember; snapshot resolvedEssences = { fire: 1 }.
  await engine.craft(craftingActor, [sourceActor], recipe, null, {});
  const run = runManager.getActiveRuns(craftingActor)[0];
  assert.deepEqual(run.steps[0].preparedConsumption.resolvedEssences, { fire: 1 }, 'essence snapshot persisted');

  sourceActor.items = [];
  game.time.worldTime = 500 + 3600 + 1;

  const finishResult = await engine.craft(craftingActor, [sourceActor], recipe, null, {});
  assert.equal(finishResult.success, true);
  assert.equal(finishResult.results.length, 1);
  const resultItem = finishResult.results[0];
  assert.equal(resultItem.effects.length, 1, 'the essence-source effect transferred to the result');
  assert.equal(resultItem.effects[0].name, 'Burning');

  delete globalThis.fromUuid;
});

// ---------------------------------------------------------------------------
// 5. Failed final check does NOT refund; completes as failed (no zombie)
// ---------------------------------------------------------------------------

test('timed step failed FINISH check does not refund and completes the run as failed', async () => {
  const system = {
    id: 'sys-fail',
    resolutionMode: 'simple',
    features: { craftingChecks: true, essences: false },
    craftingCheck: { enabled: true, consumption: { consumeIngredientsOnFail: true, breakToolsOnFail: false } },
    components: [{ id: 'wood', name: 'Wood' }],
  };
  setupGame(system, 2000);

  const wood = new FakeItem('wood', 'Wood', 2);
  const craftingActor = new FakeActor('Crafter');
  const sourceActor = new FakeActor('Source', [wood]);
  const resultGroups = [{ id: 'rg-1', results: [] }];
  const set = buildIngredientSet('set-1', [{ componentId: 'wood', quantity: 2 }]);
  const recipe = buildRecipe({
    craftingSystemId: 'sys-fail',
    ingredientSets: [set],
    resultGroups,
    steps: [timedStep({ ingredientSets: [set], resultGroups })],
  });

  const runManager = new CraftingRunManager();
  const engine = new CraftingEngine(buildRecipeManager({ ingredientSet: set }), runManager, null);

  // START consumes (deletes) the wood.
  engine._runCraftingCheck = async () => ({ success: true, outcome: null, value: null, data: {} });
  await engine.craft(craftingActor, [sourceActor], recipe, null, {});
  assert.equal(wood._deleted, true, 'components consumed at START');
  wood._deleted = false; // reset the spy so we can prove no re-consume at FINISH

  sourceActor.items = [];
  game.time.worldTime = 2000 + 3600 + 1;

  // FINISH: the check now fails.
  engine._runCraftingCheck = async () => ({ success: false, message: 'Bad roll', outcome: null, value: null, data: {} });
  const consumeSpy = { called: false };
  engine._consumeIngredients = async () => {
    consumeSpy.called = true;
    return [];
  };

  const finishResult = await engine.craft(craftingActor, [sourceActor], recipe, null, {});
  assert.equal(finishResult.success, false, 'the failed check reports failure');
  assert.equal(consumeSpy.called, false, 'FINISH never re-consumes (no double count)');
  assert.equal(wood._deleted, false, 'no refund and no second consumption of the component');

  assert.equal(runManager.getActiveRuns(craftingActor).length, 0, 'no zombie active run remains');
  const history = runManager.getRunHistory(craftingActor);
  assert.equal(history.length, 1, 'the failed run is archived');
  assert.equal(history[0].status, 'failed');
});

// ---------------------------------------------------------------------------
// 6. Missing components at START: no lingering run + component names in message
// ---------------------------------------------------------------------------

test('timed step with missing components at START leaves no active run and names components', async () => {
  const system = {
    id: 'sys-miss',
    resolutionMode: 'simple',
    features: { craftingChecks: false, essences: false },
    craftingCheck: { enabled: false, consumption: {} },
    components: [{ id: 'iron-rivet', name: 'Iron Rivet' }],
  };
  setupGame(system, 1000);

  const craftingActor = new FakeActor('Crafter');
  const sourceActor = new FakeActor('Source', []); // owns nothing
  const set = buildIngredientSet('set-1', [{ componentId: 'iron-rivet', quantity: 2 }]);
  const recipe = buildRecipe({
    craftingSystemId: 'sys-miss',
    ingredientSets: [set],
    resultGroups: [{ id: 'rg-1', results: [] }],
    steps: [timedStep({ ingredientSets: [set] })],
  });

  const missing = {
    ingredients: [
      {
        ingredient: { match: { type: 'component', componentId: 'iron-rivet' }, getDescription: () => '2x component' },
        have: 0,
        need: 2,
      },
    ],
    essences: [],
    tools: [],
  };
  const runManager = new CraftingRunManager();
  const engine = new CraftingEngine(buildRecipeManager({ ingredientSet: set, canCraft: false, missing }), runManager, null);

  const result = await engine.craft(craftingActor, [sourceActor], recipe, null, {});

  assert.equal(result.success, false);
  assert.match(result.message, /Missing required items/i);
  assert.match(result.message, /2x Iron Rivet: have 0, need 2/, 'the message names the component');

  assert.equal(runManager.getActiveRuns(craftingActor).length, 0, 'no zombie active run (gate never armed)');
  assert.equal(runManager.getRunHistory(craftingActor).length, 0, 'no history entry — the attempt never began');
});

// ---------------------------------------------------------------------------
// 7. Non-timed step behaviour unchanged (consume + produce at finish)
// ---------------------------------------------------------------------------

test('non-timed step still consumes at finish and produces results (regression guard)', async () => {
  const system = {
    id: 'sys-instant',
    resolutionMode: 'simple',
    features: { craftingChecks: false, essences: false },
    craftingCheck: { enabled: false, consumption: {} },
    components: [{ id: 'wood', name: 'Wood' }],
  };
  setupGame(system, 1000);

  const wood = new FakeItem('wood', 'Wood', 3);
  const plank = new FakeItem('plank', 'Plank', 1);
  const craftingActor = new FakeActor('Crafter');
  const sourceActor = new FakeActor('Source', [wood]);
  const resultGroups = [{ id: 'rg-1', results: [{ id: 'r-1', componentId: 'plank', quantity: 1 }] }];
  const set = buildIngredientSet('set-1', [{ componentId: 'wood', quantity: 1 }]);
  const nonTimedStep = {
    id: 'step-1',
    name: 'Instant Step',
    ingredientSets: [set],
    resultGroups,
    toolIds: [],
    outcomeRouting: null,
    timeRequirement: null,
  };
  const recipe = buildRecipe({
    craftingSystemId: 'sys-instant',
    ingredientSets: [set],
    resultGroups,
    steps: [nonTimedStep],
  });

  const runManager = new CraftingRunManager();
  const engine = new CraftingEngine(buildRecipeManager({ ingredientSet: set }), runManager, null);
  engine._runCraftingCheck = async () => ({ success: true, outcome: null, value: null, data: {} });
  engine._createSingleResult = async () => plank;

  const result = await engine.craft(craftingActor, [sourceActor], recipe, null, {});

  assert.equal(result.success, true, 'a non-timed craft completes in a single call');
  assert.equal(result.results.length, 1);
  assert.equal(wood.system.quantity, 2, 'wood consumed at finish (3 -> 2)');
  assert.equal(runManager.getActiveRuns(craftingActor).length, 0, 'no active run for a single-step instant craft');
  assert.equal(runManager.getRunHistory(craftingActor).length, 1, 'the completed run is archived');
});

// ---------------------------------------------------------------------------
// Collapsed multi-step chain (issue 710)
//
// When a system's multi-step feature is OFF, a recipe that still carries authored
// steps runs as ONE atomic craft action: its steps execute back-to-back in a
// single craft() call, per-step time gates are summed into one gate, and mid-chain
// failure follows the existing per-step failure policy. The steps are never
// deleted; re-enabling the feature restores the normal step-by-step flow.
// ---------------------------------------------------------------------------

function collapsedStep({ id, ingredientSets, resultComponentId, timeRequirement = null }) {
  return {
    id,
    name: `Step ${id}`,
    ingredientSets,
    resultGroups: [
      { id: `rg-${id}`, results: [{ id: `r-${id}`, componentId: resultComponentId, quantity: 1 }] },
    ],
    toolIds: [],
    outcomeRouting: null,
    timeRequirement,
  };
}

// A multi-step recipe (explicit `steps[]`, length > 1) whose system has the
// multi-step feature OFF — the collapse trigger.
function buildCollapsedRecipe({ craftingSystemId, set, stepTime = null }) {
  const steps = [
    collapsedStep({
      id: 'a',
      ingredientSets: [set],
      resultComponentId: 'intermediate',
      timeRequirement: stepTime,
    }),
    collapsedStep({
      id: 'b',
      ingredientSets: [set],
      resultComponentId: 'final',
      timeRequirement: stepTime,
    }),
  ];
  return {
    id: 'recipe-collapsed',
    name: 'Collapsed Recipe',
    craftingSystemId,
    ingredientSets: [set],
    resultGroups: [],
    toolIds: [],
    outcomeRouting: null,
    resultSelection: null,
    steps,
    getExecutionSteps: () => steps,
    validate() {
      return { valid: true, errors: [] };
    },
    toJSON() {
      return { id: this.id, name: this.name, craftingSystemId: this.craftingSystemId, steps };
    },
  };
}

function collapsedSystem(overrides = {}) {
  return {
    id: 'sys-collapsed',
    resolutionMode: 'simple',
    features: {
      multiStepRecipes: false,
      craftingChecks: false,
      essences: false,
      chatOutput: false,
    },
    craftingCheck: { enabled: false, consumption: { consumeIngredientsOnFail: false } },
    components: [
      { id: 'wood', name: 'Wood' },
      { id: 'intermediate', name: 'Intermediate' },
      { id: 'final', name: 'Final' },
    ],
    ...overrides,
  };
}

// Deterministic per-step result: one item tagged with that step's result component
// so the returned `results` can be asserted to be the FINAL step's output.
function stubCollapsedEngine(engine, { checkFailsForStep = null } = {}) {
  engine._runCraftingCheck = async (_execRecipe, _actor, _sources, _set, step) => ({
    success: step?.id !== checkFailsForStep,
    outcome: null,
    value: null,
    data: {},
    message: step?.id === checkFailsForStep ? 'Check failed' : 'Success',
  });
  engine._createResultItems = async (_actor, _execRecipe, step) => {
    const componentId = step?.resultGroups?.[0]?.results?.[0]?.componentId ?? 'unknown';
    const item = new FakeItem(`result-${step.id}`, componentId, 1);
    return { items: [item] };
  };
  engine._postCraftChatMessage = async () => {};
}

test('collapsed chain runs both steps back-to-back in one call and returns the final step results', async () => {
  const system = collapsedSystem();
  setupGame(system, 1000);

  const wood = new FakeItem('wood', 'Wood', 10);
  const craftingActor = new FakeActor('Crafter');
  const sourceActor = new FakeActor('Source', [wood]);
  const set = buildIngredientSet('set-shared', [{ componentId: 'wood', quantity: 2 }]);
  const recipe = buildCollapsedRecipe({ craftingSystemId: system.id, set });

  const runManager = new CraftingRunManager();
  const engine = new CraftingEngine(buildRecipeManager({ ingredientSet: set }), runManager, null);
  stubCollapsedEngine(engine);

  const result = await engine.craft(craftingActor, [sourceActor], recipe, null, {});

  assert.equal(result.success, true, 'the whole chain resolves in a single craft action');
  assert.equal(result.results.length, 1, 'the returned results are the final step output');
  assert.equal(result.results[0].name, 'final', 'the effective result is the FINAL step result');
  assert.equal(wood.system.quantity, 6, 'both steps consumed (10 -> 6, 2 per step)');
  assert.equal(
    runManager.getActiveRuns(craftingActor).length,
    0,
    'no active run lingers after the atomic chain'
  );
  const history = runManager.getRunHistory(craftingActor);
  assert.equal(history.length, 1, 'the completed run is archived');
  assert.equal(history[0].status, 'succeeded');
  assert.equal(history[0].steps.length, 2, 'the run record retains per-step detail');
  assert.ok(
    history[0].steps.every((step) => step.status === 'succeeded'),
    'every step succeeded'
  );
});

test('collapsed chain mid-chain failure keeps prior-step consumption and fails the run', async () => {
  const system = collapsedSystem();
  setupGame(system, 1000);

  const wood = new FakeItem('wood', 'Wood', 10);
  const craftingActor = new FakeActor('Crafter');
  const sourceActor = new FakeActor('Source', [wood]);
  const set = buildIngredientSet('set-shared', [{ componentId: 'wood', quantity: 2 }]);
  const recipe = buildCollapsedRecipe({ craftingSystemId: system.id, set });

  const runManager = new CraftingRunManager();
  const engine = new CraftingEngine(buildRecipeManager({ ingredientSet: set }), runManager, null);
  stubCollapsedEngine(engine, { checkFailsForStep: 'b' });

  const result = await engine.craft(craftingActor, [sourceActor], recipe, null, {});

  assert.equal(result.success, false, 'the chain fails when a mid-chain step fails');
  assert.equal(wood.system.quantity, 8, 'only the first step consumed (10 -> 8); it stays consumed');
  const history = runManager.getRunHistory(craftingActor);
  assert.equal(history.length, 1, 'the failed run is archived');
  assert.equal(history[0].status, 'failed');
  assert.equal(history[0].steps[0].status, 'succeeded', 'the first step is recorded succeeded');
  assert.equal(history[0].steps[1].status, 'failed', 'the failing step is recorded failed');
  assert.equal(runManager.getActiveRuns(craftingActor).length, 0, 'no active run lingers');
});

test('collapsed chain sums step durations into ONE time gate for the single action', async () => {
  const system = collapsedSystem();
  setupGame(system, 1000);

  const wood = new FakeItem('wood', 'Wood', 10);
  const craftingActor = new FakeActor('Crafter');
  const sourceActor = new FakeActor('Source', [wood]);
  const set = buildIngredientSet('set-shared', [{ componentId: 'wood', quantity: 2 }]);
  // Each step requires 1 hour; the summed gate is 2 hours (7200s).
  const recipe = buildCollapsedRecipe({ craftingSystemId: system.id, set, stepTime: { hours: 1 } });

  const runManager = new CraftingRunManager();
  const engine = new CraftingEngine(buildRecipeManager({ ingredientSet: set }), runManager, null);
  stubCollapsedEngine(engine);

  // First call ARMS the single summed gate and consumes NOTHING yet.
  const armResult = await engine.craft(craftingActor, [sourceActor], recipe, null, {});
  assert.equal(armResult.success, false, 'the chain waits for its summed gate to mature');
  assert.match(armResult.message, /in progress/i);
  assert.equal(wood.system.quantity, 10, 'a collapsed chain consumes nothing when the gate is armed');

  const active = runManager.getActiveRuns(craftingActor);
  assert.equal(active.length, 1, 'one waiting run is kept active');
  assert.equal(active[0].status, 'waitingTime');
  const gate = active[0].steps[0].timeGate;
  assert.ok(gate, 'the single summed gate is armed on step 0');
  assert.equal(gate.requiredSeconds, 7200, 'the gate sums both step durations (3600 + 3600)');
  assert.equal(gate.availableAt, 1000 + 7200, 'the gate matures after the summed duration');

  // Advance world time past maturity and resume: both steps now execute back-to-back.
  globalThis.game.time.worldTime = 1000 + 7200;
  const finishResult = await engine.craft(craftingActor, [sourceActor], recipe, null, {});
  assert.equal(finishResult.success, true, 'the matured chain completes in one resume call');
  assert.equal(finishResult.results[0].name, 'final', 'the final step output is returned');
  assert.equal(wood.system.quantity, 6, 'both steps consumed at maturity (10 -> 6)');
  assert.equal(
    runManager.getActiveRuns(craftingActor).length,
    0,
    'no active run remains after the chain finishes'
  );
  assert.equal(runManager.getRunHistory(craftingActor)[0].status, 'succeeded');
});

test('multi-step feature ON is NOT collapsed: one craft call resolves a single step', async () => {
  const system = collapsedSystem({
    features: { multiStepRecipes: true, craftingChecks: false, essences: false, chatOutput: false },
  });
  setupGame(system, 1000);

  const wood = new FakeItem('wood', 'Wood', 10);
  const craftingActor = new FakeActor('Crafter');
  const sourceActor = new FakeActor('Source', [wood]);
  const set = buildIngredientSet('set-shared', [{ componentId: 'wood', quantity: 2 }]);
  const recipe = buildCollapsedRecipe({ craftingSystemId: system.id, set });

  const runManager = new CraftingRunManager();
  const engine = new CraftingEngine(buildRecipeManager({ ingredientSet: set }), runManager, null);
  stubCollapsedEngine(engine);

  const result = await engine.craft(craftingActor, [sourceActor], recipe, null, {});

  assert.equal(result.success, true, 'the first step resolves');
  assert.equal(wood.system.quantity, 8, 'only the first step consumed (10 -> 8) — no auto-advance');
  const active = runManager.getActiveRuns(craftingActor);
  assert.equal(active.length, 1, 'the run stays active for the next step (normal multi-step flow)');
  assert.equal(active[0].currentStepIndex, 1, 'the run advanced to the second step, awaiting a new trigger');
});
