/**
 * Engine-side handling of the player's essence-block allocation (issue 917).
 *
 * The allocation is a SCOPED payload — `{ stepId, ingredientSetId, allocation }` —
 * and every rule about it is enforced in `CraftingEngine`, never upstream:
 *
 *  1. It is dropped (never clamped into the wrong step) unless it names the step the
 *     engine actually resolved from `run.currentStepIndex` AND the ingredient set it
 *     actually resolved. A UI-side or facade-side guard checks an index that is stale
 *     by construction: the run can advance between the `$derived` that built the
 *     payload and the click that sends it.
 *  2. A COLLAPSED multi-step chain runs every authored step inside one `craft()` call
 *     while spreading `...options`, and it re-enters at step 0 — so the entry-time
 *     scope check passes and cannot protect the later steps. The recursion must null
 *     the allocation explicitly, exactly as it already nulls `ingredientOptionOverrides`.
 *  3. A short allocation is honoured and never topped up, so the craft must ABORT
 *     rather than consume a partial plan and still award the result. `canCraft` ran
 *     before the allocation was applied, so it cannot catch this.
 *  4. A timed step applies the allocation once, at START, and snapshots nothing: the
 *     source Items are deleted before the gate is armed, so an item-keyed map is stale
 *     by the time FINISH resumes.
 *
 * Plus a drift guard on the step->recipe view now shared by `CraftingEngine` and
 * `CraftingListingBuilder`.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { CraftingEngine } from '../src/systems/CraftingEngine.js';
import { CraftingListingBuilder } from '../src/systems/CraftingListingBuilder.js';
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

let idCounter = 0;
globalThis.foundry = {
  utils: {
    getProperty,
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
    this.deleted = false;
  }
  async delete() {
    // Model Foundry's strict embedded delete: a second delete on a dead document
    // throws rather than silently over-spending.
    if (this.deleted) throw new Error(`Item ${this.id} was already deleted`);
    this.deleted = true;
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
    this.flagStore = {};
    this.created = [];
  }
  getFlag(namespace, key) {
    return this.flagStore?.[namespace]?.[key];
  }
  async setFlag(namespace, key, value) {
    this.flagStore[namespace] = this.flagStore[namespace] || {};
    this.flagStore[namespace][key] = value;
    return value;
  }
  async createEmbeddedDocuments(type, data) {
    if (type === 'ActiveEffect') return data;
    const made = data.map((entry, index) => {
      const item = new FakeItem(`made-${this.created.length + index}`, entry.name, 1);
      item.parent = this;
      item.createEmbeddedDocuments = async (_t, effects) => effects;
      return item;
    });
    this.created.push(...made);
    return made;
  }
}

/**
 * A duck-typed ingredient set that RECORDS the resolver options it was handed, so a
 * test can assert exactly what the engine forwarded (or dropped). It consumes one
 * item per authored ingredient; an EMPTY allocation map starves it, which is how the
 * short-allocation abort is exercised.
 */
function recordingIngredientSet(id, ingredientDefs) {
  const seen = [];
  return {
    id,
    seen,
    resolveIngredientSelection(availableItems, matcher, options = {}) {
      seen.push(options);
      const starved =
        options.essenceAllocation && Object.keys(options.essenceAllocation).length === 0;
      const plan = [];
      for (const def of ingredientDefs) {
        const ingredient = {
          componentId: def.componentId,
          systemItemId: def.componentId,
          quantity: def.quantity,
          match: { type: 'component', componentId: def.componentId },
          getDescription: () => `${def.quantity}x component`,
        };
        const item = availableItems.find((candidate) => matcher(ingredient, candidate));
        if (item) plan.push({ item, quantity: def.quantity, ingredient });
      }
      if (starved) {
        return {
          success: false,
          plan: [],
          currencySpends: [],
          missingGroups: [
            {
              ingredient: { getDescription: () => '2 Emberlight essence' },
              have: 0,
              need: 2,
            },
          ],
        };
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

function recordingRecipeManager() {
  return {
    canCraft(_sources, recipe) {
      return {
        canCraft: true,
        satisfiableSet: recipe.ingredientSets[0],
        missing: { ingredients: [], essences: [], tools: [] },
      };
    },
    getToolsForSet: () => [],
    toolMatchesItem: () => false,
    ingredientMatchesItem: (_recipe, ingredient, item) =>
      item.id === (ingredient.componentId || ingredient.systemItemId),
  };
}

function stepFor(id, ingredientSets, extra = {}) {
  return {
    id,
    name: id,
    ingredientSets,
    resultGroups: [{ id: `rg-${id}`, results: [{ id: `r-${id}`, componentId: 'plank', quantity: 1 }] }],
    toolIds: [],
    outcomeRouting: null,
    timeRequirement: null,
    ...extra,
  };
}

function recipeFor(steps, { craftingSystemId = 'sys-alloc', authoredSteps = null } = {}) {
  return {
    id: 'recipe-alloc',
    name: 'Allocated Recipe',
    craftingSystemId,
    ingredientSets: steps[0].ingredientSets,
    resultGroups: steps[0].resultGroups,
    toolIds: [],
    outcomeRouting: null,
    resultSelection: null,
    transferEffects: false,
    // `_isCollapsedChain` reads the AUTHORED `steps`, not the execution projection.
    steps: authoredSteps,
    getExecutionSteps: () => steps,
    validate: () => ({ valid: true, errors: [] }),
    toJSON() {
      return { id: this.id, name: this.name, craftingSystemId: this.craftingSystemId };
    },
  };
}

function installGame(system, { worldTime = 1000 } = {}) {
  globalThis.game = {
    fabricate: {
      getCraftingSystemManager: () => ({ getSystem: (id) => (id === system.id ? system : null) }),
      getResolutionModeService: () => null,
      getRecipeVisibilityService: () => null,
    },
    user: { id: 'user-gm', isGM: true },
    time: { worldTime },
    actors: [],
    i18n: { localize: (key) => key },
  };
}

function systemFor(overrides = {}) {
  return {
    id: 'sys-alloc',
    resolutionMode: 'simple',
    features: { craftingChecks: false, essences: true, multiStepRecipes: true },
    craftingCheck: { enabled: false, consumption: {} },
    components: [{ id: 'emberwood', name: 'Emberwood' }],
    ...overrides,
  };
}

function engineFor({ system = systemFor(), runManager = null } = {}) {
  installGame(system);
  const engine = new CraftingEngine(recordingRecipeManager(), runManager, null);
  engine._runCraftingCheck = async () => ({ success: true, outcome: null, value: null, data: {} });
  return engine;
}

function payload({ stepId, ingredientSetId, allocation }) {
  return { stepId, ingredientSetId, allocation };
}

const ALLOCATION = { 'Item.emberwood': 2 };

// ---------------------------------------------------------------------------
// 1. Scoping — the payload is honoured only for the step AND set it names
// ---------------------------------------------------------------------------

test('an allocation naming the resolved step and set reaches the ingredient resolver', async () => {
  const set = recordingIngredientSet('set-1', [{ componentId: 'emberwood', quantity: 1 }]);
  const recipe = recipeFor([stepFor('step-1', [set])]);
  const engine = engineFor();
  const source = new FakeActor('src', [new FakeItem('emberwood', 'Emberwood', 4)]);

  const result = await engine.craft(new FakeActor('pc'), [source], recipe, 'set-1', {
    ingredientEssenceAllocation: payload({
      stepId: 'step-1',
      ingredientSetId: 'set-1',
      allocation: ALLOCATION,
    }),
  });

  assert.equal(result.success, true, 'the craft completes');
  const consuming = set.seen.at(-1);
  assert.deepEqual(consuming.essenceAllocation, ALLOCATION, 'the allocation reached consumption');
});

test('an allocation naming a DIFFERENT step is dropped, not clamped into the resolved step', async () => {
  const set = recordingIngredientSet('set-1', [{ componentId: 'emberwood', quantity: 1 }]);
  const recipe = recipeFor([stepFor('step-1', [set])]);
  const engine = engineFor();
  const source = new FakeActor('src', [new FakeItem('emberwood', 'Emberwood', 4)]);

  const result = await engine.craft(new FakeActor('pc'), [source], recipe, 'set-1', {
    // The rail was derived while the run sat on step 2; the run has since moved.
    ingredientEssenceAllocation: payload({
      stepId: 'step-2',
      ingredientSetId: 'set-1',
      allocation: ALLOCATION,
    }),
  });

  assert.equal(result.success, true, 'the craft still completes on the default suggestion');
  assert.equal(
    set.seen.at(-1).essenceAllocation,
    null,
    'the mismatched allocation is dropped entirely'
  );
});

test('an allocation naming a DIFFERENT ingredient set is dropped', async () => {
  const set = recordingIngredientSet('set-1', [{ componentId: 'emberwood', quantity: 1 }]);
  const recipe = recipeFor([stepFor('step-1', [set])]);
  const engine = engineFor();
  const source = new FakeActor('src', [new FakeItem('emberwood', 'Emberwood', 4)]);

  await engine.craft(new FakeActor('pc'), [source], recipe, 'set-1', {
    ingredientEssenceAllocation: payload({
      stepId: 'step-1',
      ingredientSetId: 'set-9',
      allocation: ALLOCATION,
    }),
  });

  assert.equal(set.seen.at(-1).essenceAllocation, null, 'the set mismatch drops the allocation');
});

test('a bare allocation map with no scope envelope is ignored', async () => {
  const set = recordingIngredientSet('set-1', [{ componentId: 'emberwood', quantity: 1 }]);
  const recipe = recipeFor([stepFor('step-1', [set])]);
  const engine = engineFor();
  const source = new FakeActor('src', [new FakeItem('emberwood', 'Emberwood', 4)]);

  await engine.craft(new FakeActor('pc'), [source], recipe, 'set-1', {
    ingredientEssenceAllocation: ALLOCATION,
  });

  assert.equal(set.seen.at(-1).essenceAllocation, null, 'an unscoped map never steers consumption');
});

test('omitting the allocation leaves the resolver options byte-for-byte unchanged', async () => {
  const set = recordingIngredientSet('set-1', [{ componentId: 'emberwood', quantity: 1 }]);
  const recipe = recipeFor([stepFor('step-1', [set])]);
  const engine = engineFor();
  const source = new FakeActor('src', [new FakeItem('emberwood', 'Emberwood', 4)]);

  await engine.craft(new FakeActor('pc'), [source], recipe, 'set-1', {});

  assert.equal(set.seen.at(-1).essenceAllocation, null, 'no allocation is invented');
});

// ---------------------------------------------------------------------------
// 2. Collapsed multi-step chain — a step-0 allocation must not leak forward
// ---------------------------------------------------------------------------

test('a collapsed multi-step chain applies the allocation to step 0 only', async () => {
  const first = recordingIngredientSet('set-1', [{ componentId: 'emberwood', quantity: 1 }]);
  const second = recordingIngredientSet('set-2', [{ componentId: 'emberwood', quantity: 1 }]);
  const steps = [stepFor('step-1', [first]), stepFor('step-2', [second])];
  const recipe = recipeFor(steps, { authoredSteps: steps });
  // The collapsed chain is exactly `multiStepRecipes: false` + more than one step.
  const runManager = new CraftingRunManager();
  const engine = engineFor({
    system: systemFor({ features: { craftingChecks: false, essences: true, multiStepRecipes: false } }),
    runManager,
  });
  const source = new FakeActor('src', [
    new FakeItem('emberwood', 'Emberwood', 8),
  ]);

  const result = await engine.craft(new FakeActor('pc'), [source], recipe, 'set-1', {
    ingredientEssenceAllocation: payload({
      stepId: 'step-1',
      ingredientSetId: 'set-1',
      allocation: ALLOCATION,
    }),
  });

  assert.equal(result.success, true, 'the whole chain runs in one call');
  // Non-vacuity: the second step genuinely executed inside the same call.
  assert.ok(second.seen.length > 0, 'step 2 resolved its own selection');
  assert.deepEqual(first.seen.at(-1).essenceAllocation, ALLOCATION, 'step 1 keeps the allocation');
  assert.equal(
    second.seen.at(-1).essenceAllocation,
    null,
    'the step-0 allocation does not re-apply to step 2 through the spread options'
  );
});

test('a collapsed chain nulls the allocation even when it names a LATER step exactly', async () => {
  const first = recordingIngredientSet('set-1', [{ componentId: 'emberwood', quantity: 1 }]);
  const second = recordingIngredientSet('set-2', [{ componentId: 'emberwood', quantity: 1 }]);
  const steps = [stepFor('step-1', [first]), stepFor('step-2', [second])];
  const recipe = recipeFor(steps, { authoredSteps: steps });
  const engine = engineFor({
    system: systemFor({ features: { craftingChecks: false, essences: true, multiStepRecipes: false } }),
    runManager: new CraftingRunManager(),
  });
  const source = new FakeActor('src', [new FakeItem('emberwood', 'Emberwood', 8)]);

  // A payload scoped to step 2 / set 2. The per-call scope check drops it on entry
  // (entry IS step 1), but it would match EXACTLY when the chain recurses into step 2
  // through `...options`. A collapsed chain is ONE atomic action driven by ONE rail —
  // the step-0 rail — so a later step's requirements were never shown to the player and
  // an allocation for them can only have been fabricated. The recursion's explicit
  // null is the only thing that stops it.
  await engine.craft(new FakeActor('pc'), [source], recipe, 'set-1', {
    ingredientEssenceAllocation: payload({
      stepId: 'step-2',
      ingredientSetId: 'set-2',
      allocation: ALLOCATION,
    }),
  });

  assert.ok(second.seen.length > 0, 'non-vacuity: step 2 executed inside the same call');
  assert.equal(
    second.seen.at(-1).essenceAllocation,
    null,
    'the chain carries no allocation into a later step, however it is scoped'
  );
});

// ---------------------------------------------------------------------------
// 3. A short allocation aborts the craft rather than crafting for less
// ---------------------------------------------------------------------------

test('an allocation that does not fund the set aborts the craft with zero consumption', async () => {
  const set = recordingIngredientSet('set-1', [{ componentId: 'emberwood', quantity: 1 }]);
  const recipe = recipeFor([stepFor('step-1', [set])]);
  const engine = engineFor();
  const emberwood = new FakeItem('emberwood', 'Emberwood', 4);
  const source = new FakeActor('src', [emberwood]);
  const crafter = new FakeActor('pc');

  const result = await engine.craft(crafter, [source], recipe, 'set-1', {
    // Allocating nothing: honoured, never topped up.
    ingredientEssenceAllocation: payload({
      stepId: 'step-1',
      ingredientSetId: 'set-1',
      allocation: {},
    }),
  });

  assert.equal(result.success, false, 'the craft is refused');
  assert.match(result.message, /Missing required items/);
  assert.match(result.message, /Emberlight essence/, 'the shortfall names the essence requirement');
  assert.equal(emberwood.system.quantity, 4, 'nothing was consumed');
  assert.equal(crafter.created.length, 0, 'no result was awarded');
});

// ---------------------------------------------------------------------------
// 4. Timed START applies the allocation once and snapshots nothing
// ---------------------------------------------------------------------------

test('a timed step applies the allocation at START and persists no allocation snapshot', async () => {
  const set = recordingIngredientSet('set-1', [{ componentId: 'emberwood', quantity: 1 }]);
  const steps = [stepFor('step-1', [set], { timeRequirement: { hours: 1 } })];
  const recipe = recipeFor(steps);
  const runManager = new CraftingRunManager();
  const engine = engineFor({ runManager });
  const crafter = new FakeActor('pc');
  const source = new FakeActor('src', [new FakeItem('emberwood', 'Emberwood', 4)]);

  const result = await engine.craft(crafter, [source], recipe, 'set-1', {
    ingredientEssenceAllocation: payload({
      stepId: 'step-1',
      ingredientSetId: 'set-1',
      allocation: ALLOCATION,
    }),
  });

  assert.equal(result.success, false, 'START arms the gate and returns "in progress"');
  assert.deepEqual(
    set.seen.at(-1).essenceAllocation,
    ALLOCATION,
    'the allocation steered the START consumption'
  );
  const prepared = runManager.getActiveRuns(crafter)[0].steps[0].preparedConsumption;
  assert.ok(prepared, 'the START snapshot exists');
  assert.ok(
    !('essenceAllocation' in prepared),
    'no allocation is snapshotted — the source items are already deleted at START'
  );
});

test('a timed START refuses an allocation that does not fund the set and leaves no run', async () => {
  const set = recordingIngredientSet('set-1', [{ componentId: 'emberwood', quantity: 1 }]);
  const steps = [stepFor('step-1', [set], { timeRequirement: { hours: 1 } })];
  const recipe = recipeFor(steps);
  const runManager = new CraftingRunManager();
  const engine = engineFor({ runManager });
  const crafter = new FakeActor('pc');
  const emberwood = new FakeItem('emberwood', 'Emberwood', 4);

  const result = await engine.craft(crafter, [new FakeActor('src', [emberwood])], recipe, 'set-1', {
    ingredientEssenceAllocation: payload({
      stepId: 'step-1',
      ingredientSetId: 'set-1',
      allocation: {},
    }),
  });

  assert.equal(result.success, false);
  assert.match(result.message, /Missing required items/);
  assert.equal(emberwood.system.quantity, 4, 'nothing was consumed before the gate');
  assert.equal(runManager.getActiveRuns(crafter).length, 0, 'no zombie run lingers');
});

// ---------------------------------------------------------------------------
// 5. Two plan entries naming ONE document compose rather than double-spend
// ---------------------------------------------------------------------------

// The essence block contributes at most one plan entry per item key, but a set can
// still name the same held stack twice — a non-essence requirement and an essence
// carrier resolving to the same Item. `_consumeIngredients` re-reads
// `item.system.quantity` LIVE on every entry precisely so the second entry sees what
// the first left; a snapshot taken up front would compare both entries against the
// original quantity and delete a document that is already gone (the update path is the
// same defect wearing a smaller number). FakeItem's `delete()` throws on a second call,
// so the hazard fails loudly here rather than silently over-spending.
test('two plan entries naming one document consume the stack once, in composition', async () => {
  const engine = engineFor();
  const stack = new FakeItem('emberwood', 'Emberwood', 3);
  const ingredient = { getDescription: () => '3x Emberwood' };

  const consumed = await engine._consumeIngredients([
    { item: stack, quantity: 1, ingredient },
    { item: stack, quantity: 2, ingredient },
  ]);

  assert.equal(consumed.length, 2, 'both entries are reported for effect transfer');
  assert.equal(stack.deleted, true, 'the second entry exhausts the stack and deletes it');
  assert.equal(stack.system.quantity, 2, 'the first entry decremented the LIVE quantity');
});

test('two plan entries under the live stack leave the remainder behind', async () => {
  const engine = engineFor();
  const stack = new FakeItem('emberwood', 'Emberwood', 5);
  const ingredient = { getDescription: () => '5x Emberwood' };

  await engine._consumeIngredients([
    { item: stack, quantity: 1, ingredient },
    { item: stack, quantity: 2, ingredient },
  ]);

  assert.equal(stack.deleted, false, 'three of five is not the whole stack');
  assert.equal(stack.system.quantity, 2, 'the two entries compose: 5 - 1 - 2');
});

// ---------------------------------------------------------------------------
// 6. The step->recipe view is genuinely shared with the read side
// ---------------------------------------------------------------------------

test('the engine and the listing builder project the same step recipe view', () => {
  installGame(systemFor());
  const engine = new CraftingEngine(recordingRecipeManager(), null, null);
  const builder = new CraftingListingBuilder({});
  const recipe = {
    id: 'r1',
    craftingSystemId: 'sys-alloc',
    ingredientSets: [{ id: 'recipe-set' }],
    resultGroups: [{ id: 'recipe-rg' }],
    toolIds: ['tool-recipe'],
    toolBonusModes: { 'tool-recipe': 'always' },
  };
  const step = {
    id: 'step-1',
    ingredientSets: [{ id: 'step-set' }],
    resultGroups: [{ id: 'step-rg' }],
    toolIds: ['tool-step'],
  };

  const engineView = engine._buildStepRecipeView(recipe, step);
  const builderView = builder._stepRecipeView(recipe, step);

  assert.deepEqual(engineView.ingredientSets, builderView.ingredientSets);
  assert.deepEqual(engineView.resultGroups, builderView.resultGroups);
  assert.deepEqual(
    builderView.toolIds,
    ['tool-recipe', 'tool-step'],
    'the tool ids are the UNION, never a step-else-recipe fallback'
  );
  assert.deepEqual(engineView.toolIds, builderView.toolIds, 'both sides craft against one union');
  // The engine's only additions on top of the shared projection.
  assert.ok(!('toolBonusModes' in engineView), 'the engine strips the recipe-level bonus modes');
  assert.ok('toolBonusModes' in builderView, 'the read-side view keeps them');
});
