/**
 * Regression tests for issue 966: a MATURED time-gated alchemy brew must resolve
 * through the same alchemy tail an immediate brew does.
 *
 * A brew starts through `craftAlchemy`, which is the only place that sets
 * `options.isAlchemyAttempt`. A time-gated brew does NOT resolve in that call: it
 * consumes at START, arms the gate, and returns. It resolves LATER, through
 * `Fabricate#advanceCraftingRun` → `craft(actor, recipeId, { runId })`, which
 * cannot carry that flag. Gating the alchemy tail on it therefore meant a matured
 * brew silently:
 *   - never recorded brew-discovery (`learnRecipeOnCraft`), and
 *   - degraded a matched Simple-check FAILURE to a generic fizzle instead of
 *     producing the reserved `role: 'failure'` result group.
 * Both gates now derive alchemy-ness from the recipe's own system.
 *
 * Also covers the START result's `disposition`, which tells the alchemy workbench
 * that the brew began rather than fizzled.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { CraftingEngine } from '../src/systems/CraftingEngine.js';
import { CraftingRunManager } from '../src/systems/CraftingRunManager.js';
import { ResolutionModeService } from '../src/systems/ResolutionModeService.js';

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

let idCounter = 0;
globalThis.foundry = {
  utils: {
    getProperty,
    setProperty,
    randomID: () => `id-${++idCounter}`,
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
  }
  async delete() {
    this._deleted = true;
  }
  async update(payload) {
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
    this.createdItems = [];
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
    if (type === 'ActiveEffect') return data;
    const created = data.map((entry, index) => {
      const item = new FakeItem(
        `created-${this.createdItems.length + index}`,
        entry.name,
        entry.system?.quantity || 1
      );
      item.parent = this;
      item.createEmbeddedDocuments = async (_t, effectData) => effectData;
      return item;
    });
    this.createdItems.push(...created);
    return created;
  }
}

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
      return {
        success: plan.length === ingredientDefs.length,
        plan,
        currencySpends: [],
        missingGroups: [],
      };
    },
  };
}

function buildRecipeManager(ingredientSet) {
  return {
    canCraft() {
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

/**
 * A visibility-service spy shaped like the two methods the crafting tail calls.
 */
function buildVisibilitySpy() {
  const calls = { learn: [], use: [] };
  return {
    calls,
    service: {
      // Alchemy is reveal-not-gate, so the real guard admits every brew.
      guardCraftStart: () => ({ craftable: true, visible: false, reason: 'alchemy-unrevealed' }),
      async applyRecipeItemUseOnCraft(payload) {
        calls.use.push(payload);
      },
      async learnRecipeOnCraft(recipe, craftingActor) {
        calls.learn.push({ recipeId: recipe?.id, actorId: craftingActor?.id });
      },
    },
  };
}

function setupGame(system, visibilityService, worldTime = 1000) {
  const systemManager = { getSystem: (id) => (id === system.id ? system : null) };
  // The REAL resolution service, so result-group routing (success vs the reserved
  // `role: 'failure'` group) is genuinely exercised rather than stubbed.
  const resolutionService = new ResolutionModeService(systemManager);
  globalThis.game = {
    fabricate: {
      getCraftingSystemManager: () => systemManager,
      getResolutionModeService: () => resolutionService,
      getRecipeVisibilityService: () => visibilityService,
    },
    user: { id: 'user-player', isGM: false },
    time: { worldTime },
    actors: [],
  };
  return resolutionService;
}

const SUCCESS_GROUP = {
  id: 'rg-success',
  results: [{ id: 'r-1', componentId: 'elixir', quantity: 1 }],
};
const FAILURE_GROUP = {
  id: 'rg-failure',
  role: 'failure',
  results: [{ id: 'r-2', componentId: 'sludge', quantity: 1 }],
};

function buildAlchemySystem({ id, checkMode = 'none' }) {
  return {
    id,
    resolutionMode: 'alchemy',
    visibilityMode: 'global',
    features: { craftingChecks: false, essences: false, multiStepRecipes: false },
    craftingCheck: { enabled: false, consumption: {} },
    alchemy: { checkMode, learnOnCraft: true, consumeOnFail: true },
    components: [
      { id: 'herb', name: 'Herb' },
      { id: 'elixir', name: 'Elixir' },
      { id: 'sludge', name: 'Sludge' },
    ],
  };
}

function buildTimedAlchemyRecipe(craftingSystemId, resultGroups) {
  const set = buildIngredientSet('set-1', [{ componentId: 'herb', quantity: 2 }]);
  const step = {
    // `implicit-step` is the id a real Recipe gives the single derived step; the
    // alchemy validator rejects anything else as an authored step.
    id: 'implicit-step',
    name: 'Brew',
    ingredientSets: [set],
    resultGroups,
    toolIds: [],
    outcomeRouting: null,
    timeRequirement: { hours: 1 },
  };
  const recipe = {
    id: 'recipe-brew',
    name: 'Draught of Nothing In Particular',
    craftingSystemId,
    ingredientSets: [set],
    resultGroups,
    toolIds: [],
    outcomeRouting: null,
    resultSelection: null,
    transferEffects: false,
    // NO explicit `steps`: an alchemy recipe's single execution step is implicit
    // (ResolutionModeService rejects an alchemy recipe that authored steps), and the
    // run manager builds its step states from `getExecutionSteps()` regardless.
    getExecutionSteps: () => [step],
    validate: () => ({ valid: true, errors: [] }),
    toJSON() {
      return { id: this.id, name: this.name, craftingSystemId: this.craftingSystemId };
    },
  };
  return { recipe, set };
}

// ---------------------------------------------------------------------------
// 1. START reports a distinct disposition, not a bare failure
// ---------------------------------------------------------------------------

test('a time-gated brew START reports disposition "timed-start", not a fizzle-shaped failure', async () => {
  const system = buildAlchemySystem({ id: 'sys-brew-start' });
  const spy = buildVisibilitySpy();
  const resolutionService = setupGame(system, spy.service, 1000);

  const { recipe, set } = buildTimedAlchemyRecipe('sys-brew-start', [SUCCESS_GROUP]);
  const herb = new FakeItem('herb', 'Herb', 5);
  const crafter = new FakeActor('Crafter');
  const source = new FakeActor('Source', [herb]);

  const runManager = new CraftingRunManager();
  const engine = new CraftingEngine(buildRecipeManager(set), runManager, resolutionService);
  engine._runCraftingCheck = async () => ({ success: true, outcome: null, value: null, data: {} });

  const result = await engine.craft(crafter, [source], recipe, null, { isAlchemyAttempt: true });

  assert.equal(result.success, false, 'nothing is produced yet');
  assert.equal(
    result.disposition,
    'timed-start',
    'the workbench must be able to tell a started brew from a no-signature fizzle'
  );
  assert.equal(herb.system.quantity, 3, 'the ingredients were consumed at START');
  assert.equal(runManager.getActiveRuns(crafter)[0].status, 'waitingTime');
  assert.deepEqual(spy.calls.learn, [], 'START does not learn — discovery lands at FINISH');
});

// ---------------------------------------------------------------------------
// 2. The matured FINISH learns, with no `isAlchemyAttempt` in sight
// ---------------------------------------------------------------------------

test('a matured brew records discovery even though the resume carries no isAlchemyAttempt', async () => {
  const system = buildAlchemySystem({ id: 'sys-brew-learn' });
  const spy = buildVisibilitySpy();
  const resolutionService = setupGame(system, spy.service, 1000);

  const { recipe, set } = buildTimedAlchemyRecipe('sys-brew-learn', [SUCCESS_GROUP]);
  const herb = new FakeItem('herb', 'Herb', 5);
  const crafter = new FakeActor('Crafter');
  const source = new FakeActor('Source', [herb]);

  const runManager = new CraftingRunManager();
  const engine = new CraftingEngine(buildRecipeManager(set), runManager, resolutionService);
  engine._runCraftingCheck = async () => ({ success: true, outcome: null, value: null, data: {} });

  await engine.craft(crafter, [source], recipe, null, { isAlchemyAttempt: true });
  const runId = runManager.getActiveRuns(crafter)[0].id;

  // Time passes, and the run resumes the way `advanceCraftingRun` resumes it:
  // by run id alone. NO alchemy options are threaded — that is the whole point.
  game.time.worldTime = 1000 + 3600;
  const finished = await engine.craft(crafter, [source], recipe, null, { runId });

  assert.equal(finished.success, true, finished.message);
  assert.deepEqual(
    spy.calls.learn,
    [{ recipeId: 'recipe-brew', actorId: crafter.id }],
    'the matured brew must record brew-discovery for the crafting actor'
  );
  assert.equal(crafter.createdItems.length, 1, 'the success result was produced');
});

// ---------------------------------------------------------------------------
// 3. A non-alchemy timed craft must NOT reach the alchemy learn
// ---------------------------------------------------------------------------

test('a matured NON-alchemy timed craft never calls learnRecipeOnCraft', async () => {
  const system = {
    id: 'sys-plain',
    resolutionMode: 'simple',
    features: { craftingChecks: false, essences: false },
    craftingCheck: { enabled: false, consumption: {} },
    components: [{ id: 'herb', name: 'Herb' }],
  };
  const spy = buildVisibilitySpy();
  const resolutionService = setupGame(system, spy.service, 1000);

  const { recipe, set } = buildTimedAlchemyRecipe('sys-plain', [SUCCESS_GROUP]);
  const herb = new FakeItem('herb', 'Herb', 5);
  const crafter = new FakeActor('Crafter');
  const source = new FakeActor('Source', [herb]);

  const runManager = new CraftingRunManager();
  const engine = new CraftingEngine(buildRecipeManager(set), runManager, resolutionService);
  engine._runCraftingCheck = async () => ({ success: true, outcome: null, value: null, data: {} });

  await engine.craft(crafter, [source], recipe, null, {});
  const runId = runManager.getActiveRuns(crafter)[0].id;
  game.time.worldTime = 1000 + 3600;
  const finished = await engine.craft(crafter, [source], recipe, null, { runId });

  assert.equal(finished.success, true, finished.message);
  assert.deepEqual(spy.calls.learn, [], 'learn-on-craft is alchemy-only');
});

// ---------------------------------------------------------------------------
// 4. A matured Simple-check FAILURE produces the reserved failure group
// ---------------------------------------------------------------------------

test('a matured Simple brew that fails its check produces the reserved failure result', async () => {
  const system = buildAlchemySystem({ id: 'sys-brew-fail', checkMode: 'simple' });
  const spy = buildVisibilitySpy();
  const resolutionService = setupGame(system, spy.service, 1000);

  const { recipe, set } = buildTimedAlchemyRecipe('sys-brew-fail', [SUCCESS_GROUP, FAILURE_GROUP]);
  const herb = new FakeItem('herb', 'Herb', 5);
  const crafter = new FakeActor('Crafter');
  const source = new FakeActor('Source', [herb]);

  const runManager = new CraftingRunManager();
  const engine = new CraftingEngine(buildRecipeManager(set), runManager, resolutionService);
  let checkPasses = true;
  engine._runCraftingCheck = async () => ({
    success: checkPasses,
    outcome: null,
    value: null,
    data: {},
    message: checkPasses ? 'Success' : 'The brew curdles',
  });

  await engine.craft(crafter, [source], recipe, null, { isAlchemyAttempt: true });
  const runId = runManager.getActiveRuns(crafter)[0].id;

  // The check runs at FINISH, not at START, so flip it while the gate matures.
  checkPasses = false;
  game.time.worldTime = 1000 + 3600;
  const finished = await engine.craft(crafter, [source], recipe, null, { runId });

  assert.equal(finished.success, false, 'a failed check is still a failure');
  assert.equal(
    finished.disposition,
    'produced-on-failure',
    'a matched Simple failure is a genuine outcome, not a no-signature fizzle'
  );
  assert.equal(crafter.createdItems.length, 1, 'the reserved failure result was produced');
  assert.equal(crafter.createdItems[0].name, 'Sludge');
  assert.equal(
    spy.calls.learn.length,
    1,
    'discovery is on a matched signature, independent of the check outcome'
  );
});
