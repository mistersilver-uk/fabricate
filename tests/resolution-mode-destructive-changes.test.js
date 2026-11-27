import test from 'node:test';
import assert from 'node:assert/strict';

let idSeq = 0;
globalThis.foundry = {
  utils: {
    randomID: () => `rid-${++idSeq}`,
    getProperty: () => undefined
  }
};
globalThis.ui = { notifications: { warn: () => {}, info: () => {}, error: () => {} } };

const settingsStore = new Map();
globalThis.game = {
  user: { isGM: true },
  actors: [],
  settings: {
    get: (_namespace, key) => settingsStore.get(key),
    set: async (_namespace, key, value) => {
      settingsStore.set(key, value);
      return value;
    }
  }
};

const { CraftingSystemManager } = await import('../src/systems/CraftingSystemManager.js');

// A recipe-manager mock that records migration calls (issue 1132).
function makeRecipeManager(recipes = []) {
  let mutableRecipes = recipes.map((r) => ({ ...r }));
  const deleted = [];
  const updated = [];
  let signatureChecks = 0;
  let flagPasses = 0;

  return {
    getRecipes(filters = {}) {
      if (filters.craftingSystemId) {
        return mutableRecipes.filter((recipe) => recipe.craftingSystemId === filters.craftingSystemId);
      }
      return mutableRecipes;
    },
    getRecipe(recipeId) {
      return mutableRecipes.find((recipe) => recipe.id === recipeId) || null;
    },
    async updateRecipe(recipeId, updates) {
      updated.push({ recipeId, updates });
      mutableRecipes = mutableRecipes.map((recipe) =>
        recipe.id === recipeId ? { ...recipe, ...updates } : recipe
      );
    },
    async deleteRecipe(recipeId) {
      deleted.push(recipeId);
      mutableRecipes = mutableRecipes.filter((recipe) => recipe.id !== recipeId);
    },
    async deleteRecipes(recipeIds) {
      const resolved = [...recipeIds].filter((id) =>
        mutableRecipes.some((recipe) => recipe.id === id)
      );
      const removed = mutableRecipes.filter((recipe) => resolved.includes(recipe.id));
      deleted.push(...resolved);
      mutableRecipes = mutableRecipes.filter((recipe) => !resolved.includes(recipe.id));
      return { deleted: resolved.length, recipeIds: resolved, recipes: removed };
    },
    async cleanupOrphanedRecipeFlags() {
      flagPasses += 1;
    },
    async disableSignatureConflicts() {
      signatureChecks += 1;
      return [];
    },
    _notifyRecipesChanged() {},
    notifyRecipesChanged() {},
    getFlagCleanupPassCount() {
      return flagPasses;
    },
    getDeletedRecipeIds() {
      return [...deleted];
    },
    getUpdatedRecipeIds() {
      return updated.map((u) => u.recipeId);
    },
    getUpdate(recipeId) {
      return updated.find((u) => u.recipeId === recipeId)?.updates;
    },
    getSignatureCheckCount() {
      return signatureChecks;
    }
  };
}

function makeManager(recipeManager, { recordSaves } = {}) {
  const manager = new CraftingSystemManager(recipeManager);
  manager.initialized = true;
  manager.save = async () => {
    recordSaves?.('system-save', manager.getSystem('sys-1')?.resolutionMode);
  };
  return manager;
}

function oneByOneRecipe(id, systemId, overrides = {}) {
  return {
    id,
    name: id,
    craftingSystemId: systemId,
    ingredientSets: [{ id: `${id}-s1` }],
    resultGroups: [{ id: `${id}-g1`, name: 'Default' }],
    ...overrides
  };
}

function multiGroupRecipe(id, systemId, overrides = {}) {
  return {
    id,
    name: id,
    craftingSystemId: systemId,
    ingredientSets: [{ id: `${id}-s1` }, { id: `${id}-s2` }],
    resultGroups: [
      { id: `${id}-g1`, name: 'Alpha' },
      { id: `${id}-g2`, name: 'Beta' }
    ],
    resultSelection: { provider: 'ingredientSet' },
    ...overrides
  };
}

test('changing resolutionMode migrates 1×1 recipes instead of deleting them (inverted) and cleans stale progressive preferences', async () => {
  settingsStore.clear();
  settingsStore.set('lastManagedCraftingSystem', 'sys-1');
  // Keys are namespaced `recipe:<id>` (issue 651); values are result ids.
  settingsStore.set('progressiveResultOrder', {
    'recipe:recipe-1': ['a', 'b'],
    'recipe:recipe-2': ['c', 'd']
  });

  const recipeManager = makeRecipeManager([
    oneByOneRecipe('recipe-1', 'sys-1'),
    oneByOneRecipe('recipe-2', 'sys-2')
  ]);
  const manager = makeManager(recipeManager);
  manager.systems.set('sys-1', manager._normalizeSystem({
    id: 'sys-1',
    name: 'Alchemy Bench',
    resolutionMode: 'simple'
  }));

  // The legacy `tiered` token normalizes to `routedByCheck`; the mode still changes (simple →
  // routedByCheck) (issue 429).
  await manager.updateSystem('sys-1', { resolutionMode: 'tiered' });

  assert.equal(manager.getSystem('sys-1').resolutionMode, 'routedByCheck');
  assert.deepEqual(recipeManager.getDeletedRecipeIds(), []);
  assert.deepEqual(recipeManager.getUpdatedRecipeIds(), ['recipe-1']);
  // The routed modes carry no resultSelection (the routing basis is the mode).
  assert.equal(recipeManager.getUpdate('recipe-1').resultSelection ?? null, null);
  // Preferences cleanup still runs on a mode change.
  assert.equal(settingsStore.get('lastManagedCraftingSystem'), 'sys-1');
});

test('updating a system without changing resolutionMode does not migrate or delete recipes', async () => {
  settingsStore.clear();
  settingsStore.set('progressiveResultOrder', { 'recipe:recipe-1': ['a', 'b'] });

  const recipeManager = makeRecipeManager([oneByOneRecipe('recipe-1', 'sys-1')]);
  const manager = makeManager(recipeManager);
  manager.systems.set('sys-1', manager._normalizeSystem({
    id: 'sys-1',
    name: 'Forge',
    resolutionMode: 'simple'
  }));

  await manager.updateSystem('sys-1', { name: 'Grand Forge' });

  assert.equal(manager.getSystem('sys-1').name, 'Grand Forge');
  assert.deepEqual(recipeManager.getDeletedRecipeIds(), []);
  assert.deepEqual(recipeManager.getUpdatedRecipeIds(), []);
  assert.deepEqual(settingsStore.get('progressiveResultOrder'), { 'recipe:recipe-1': ['a', 'b'] });
});

test('widening simple → routed deletes zero recipes and seeds providers', async () => {
  settingsStore.clear();
  const recipeManager = makeRecipeManager([
    oneByOneRecipe('recipe-1', 'sys-1'),
    multiGroupRecipe('recipe-2', 'sys-1', { resultSelection: undefined })
  ]);
  const manager = makeManager(recipeManager);
  manager.systems.set('sys-1', manager._normalizeSystem({
    id: 'sys-1',
    name: 'Forge',
    resolutionMode: 'simple'
  }));

  await manager.updateSystem('sys-1', { resolutionMode: 'routed' });

  assert.deepEqual(recipeManager.getDeletedRecipeIds(), []);
  assert.deepEqual(recipeManager.getUpdatedRecipeIds().sort(), ['recipe-1', 'recipe-2']);
});

test('narrowing routed → simple deletes ONLY the multi-set recipe and migrates the 1×1', async () => {
  settingsStore.clear();
  const recipeManager = makeRecipeManager([
    oneByOneRecipe('keep-me', 'sys-1', { resultSelection: { provider: 'ingredientSet' } }),
    multiGroupRecipe('delete-me', 'sys-1')
  ]);
  const manager = makeManager(recipeManager);
  manager.systems.set('sys-1', manager._normalizeSystem({
    id: 'sys-1',
    name: 'Forge',
    resolutionMode: 'routed'
  }));

  await manager.updateSystem('sys-1', { resolutionMode: 'simple' });

  assert.deepEqual(recipeManager.getDeletedRecipeIds(), ['delete-me']);
  assert.deepEqual(recipeManager.getUpdatedRecipeIds(), ['keep-me']);
  assert.equal(recipeManager.getUpdate('keep-me').resultSelection, null);
});

test('simple → progressive keeps a recipe with a failure group and persists it without that group', async () => {
  settingsStore.clear();
  const recipeManager = makeRecipeManager([
    oneByOneRecipe('with-failure', 'sys-1', {
      resultGroups: [
        { id: 'with-failure-g1', name: 'Default', results: [] },
        { id: 'with-failure-fail', name: '', role: 'failure', results: [] }
      ]
    })
  ]);
  const manager = makeManager(recipeManager);
  manager.systems.set('sys-1', manager._normalizeSystem({
    id: 'sys-1',
    name: 'Forge',
    resolutionMode: 'simple'
  }));

  await manager.updateSystem('sys-1', { resolutionMode: 'progressive' });

  assert.deepEqual(recipeManager.getDeletedRecipeIds(), []);
  assert.deepEqual(recipeManager.getUpdatedRecipeIds(), ['with-failure']);
  assert.deepEqual(
    recipeManager.getUpdate('with-failure').resultGroups.map((group) => group.id),
    ['with-failure-g1']
  );
});

test('moving a multi-step recipe into alchemy is the only alchemy-direction delete', async () => {
  settingsStore.clear();
  const recipeManager = makeRecipeManager([
    {
      id: 'stepped',
      name: 'stepped',
      craftingSystemId: 'sys-1',
      steps: [
        { id: 'st-1', ingredientSets: [{ id: 's1' }], resultGroups: [{ id: 'g1', name: 'A' }] },
        { id: 'st-2', ingredientSets: [{ id: 's2' }], resultGroups: [{ id: 'g2', name: 'B' }] }
      ],
      resultSelection: { provider: 'check' }
    },
    oneByOneRecipe('flat', 'sys-1', { resultSelection: { provider: 'check' } })
  ]);
  const manager = makeManager(recipeManager);
  manager.systems.set('sys-1', manager._normalizeSystem({
    id: 'sys-1',
    name: 'Bench',
    resolutionMode: 'routed'
  }));

  await manager.updateSystem('sys-1', { resolutionMode: 'alchemy' });

  assert.deepEqual(recipeManager.getDeletedRecipeIds(), ['stepped']);
  // The flat routed recipe carries verbatim into alchemy.
  assert.deepEqual(recipeManager.getUpdatedRecipeIds(), ['flat']);
});

test('the merged system (with its new mode) is saved BEFORE recipes are migrated', async () => {
  settingsStore.clear();
  const events = [];
  const recipeManager = makeRecipeManager([oneByOneRecipe('recipe-1', 'sys-1')]);
  // Record the in-memory mode at the moment updateRecipe runs so we can prove the
  // system was already persisted with the new mode first.
  const originalUpdate = recipeManager.updateRecipe.bind(recipeManager);
  let managerRef = null;
  recipeManager.updateRecipe = async (recipeId, updates) => {
    events.push(`migrate:${managerRef.getSystem('sys-1').resolutionMode}`);
    return originalUpdate(recipeId, updates);
  };
  const manager = makeManager(recipeManager, {
    recordSaves: (_event, mode) => events.push(`save:${mode}`)
  });
  managerRef = manager;
  manager.systems.set('sys-1', manager._normalizeSystem({
    id: 'sys-1',
    name: 'Forge',
    resolutionMode: 'simple'
  }));

  await manager.updateSystem('sys-1', { resolutionMode: 'routedByIngredients' });

  const firstSave = events.indexOf('save:routedByIngredients');
  const firstMigrate = events.indexOf('migrate:routedByIngredients');
  assert.ok(firstSave >= 0, 'system saved with the new mode');
  assert.ok(firstMigrate >= 0, 'recipe migrated reading the new mode');
  assert.ok(firstSave < firstMigrate, 'system save must precede recipe migration');
});

test('switching to alchemy runs the signature reconciliation after migration', async () => {
  settingsStore.clear();
  const recipeManager = makeRecipeManager([
    oneByOneRecipe('recipe-1', 'sys-1', { resultSelection: { provider: 'check' } })
  ]);
  const manager = makeManager(recipeManager);
  manager.systems.set('sys-1', manager._normalizeSystem({
    id: 'sys-1',
    name: 'Bench',
    resolutionMode: 'routed'
  }));

  await manager.updateSystem('sys-1', { resolutionMode: 'alchemy' });

  assert.equal(recipeManager.getSignatureCheckCount(), 1);
});

test('a non-alchemy mode change does not run signature reconciliation', async () => {
  settingsStore.clear();
  const recipeManager = makeRecipeManager([oneByOneRecipe('recipe-1', 'sys-1')]);
  const manager = makeManager(recipeManager);
  manager.systems.set('sys-1', manager._normalizeSystem({
    id: 'sys-1',
    name: 'Forge',
    resolutionMode: 'simple'
  }));

  await manager.updateSystem('sys-1', { resolutionMode: 'routed' });

  assert.equal(recipeManager.getSignatureCheckCount(), 0);
});

// Crafting-check slot movement across the routedByIngredients boundary (issue 532)
// `reconcileCraftingCheckSlots` in `src/systems/manager/resolutionModeChange.js`, run by
// `prepareModeChange` in updateSystem after normalization and before the first persist, keyed on
// the resolution-mode change.

test('switching routedByCheck → routedByIngredients copies the pass/fail config routed → simple', async () => {
  settingsStore.clear();
  const recipeManager = makeRecipeManager([]);
  const manager = makeManager(recipeManager);
  manager.systems.set('sys-1', manager._normalizeSystem({
    id: 'sys-1',
    name: 'Forge',
    resolutionMode: 'routedByCheck',
    craftingCheck: {
      routed: {
        rollFormula: '1d20+3',
        dc: 17,
        thresholdMode: 'exceed',
        tiers: [{ id: 'tier-hard', name: 'Hard', dc: 22 }]
      }
    }
  }));

  await manager.updateSystem('sys-1', { resolutionMode: 'routedByIngredients' });

  const check = manager.getSystem('sys-1').craftingCheck;
  assert.equal(check.simple.rollFormula, '1d20+3', 'formula copied into the simple slot');
  assert.equal(check.simple.dc, 17);
  assert.equal(check.simple.thresholdMode, 'exceed');
  assert.equal(check.simple.tiers[0].id, 'tier-hard', 'tier ids preserved');
});

test('switching routedByIngredients → routedByCheck copies the pass/fail config simple → routed', async () => {
  settingsStore.clear();
  const recipeManager = makeRecipeManager([]);
  const manager = makeManager(recipeManager);
  manager.systems.set('sys-1', manager._normalizeSystem({
    id: 'sys-1',
    name: 'Forge',
    resolutionMode: 'routedByIngredients',
    craftingCheck: {
      simple: { rollFormula: '2d6+1', dc: 11, thresholdMode: 'meet' }
    }
  }));

  await manager.updateSystem('sys-1', { resolutionMode: 'routedByCheck' });

  const check = manager.getSystem('sys-1').craftingCheck;
  assert.equal(check.routed.rollFormula, '2d6+1', 'formula copied into the routed slot');
  assert.equal(check.routed.dc, 11);
  assert.equal(check.routed.thresholdMode, 'meet');
});

test('into routedByIngredients does NOT clobber an already-authored simple slot', async () => {
  settingsStore.clear();
  const recipeManager = makeRecipeManager([]);
  const manager = makeManager(recipeManager);
  manager.systems.set('sys-1', manager._normalizeSystem({
    id: 'sys-1',
    name: 'Forge',
    resolutionMode: 'routedByCheck',
    craftingCheck: {
      routed: { rollFormula: '1d20+3', dc: 17 },
      simple: { rollFormula: '1d8', dc: 6 }
    }
  }));

  await manager.updateSystem('sys-1', { resolutionMode: 'routedByIngredients' });

  const check = manager.getSystem('sys-1').craftingCheck;
  assert.equal(check.simple.rollFormula, '1d8', 'authored simple check is preserved');
  assert.equal(check.simple.dc, 6);
});

test('out of routedByIngredients does NOT clobber an already-authored routed slot', async () => {
  settingsStore.clear();
  const recipeManager = makeRecipeManager([]);
  const manager = makeManager(recipeManager);
  manager.systems.set('sys-1', manager._normalizeSystem({
    id: 'sys-1',
    name: 'Forge',
    resolutionMode: 'routedByIngredients',
    craftingCheck: {
      simple: { rollFormula: '2d6+1', dc: 11 },
      routed: { rollFormula: '1d20', dc: 25 }
    }
  }));

  await manager.updateSystem('sys-1', { resolutionMode: 'routedByCheck' });

  const check = manager.getSystem('sys-1').craftingCheck;
  assert.equal(check.routed.rollFormula, '1d20', 'authored routed check is preserved');
  assert.equal(check.routed.dc, 25);
});

test('a dynamic-DC simple check moved into routedByCheck KEEPS its dynamic DC (issue 1096)', async () => {
  settingsStore.clear();
  const recipeManager = makeRecipeManager([]);
  const manager = makeManager(recipeManager);
  manager.systems.set('sys-1', manager._normalizeSystem({
    id: 'sys-1',
    name: 'Forge',
    resolutionMode: 'routedByIngredients',
    craftingCheck: {
      simple: { rollFormula: '1d20', dc: 13, dcMode: 'dynamic', macroUuid: 'Macro.abc' }
    }
  }));

  await manager.updateSystem('sys-1', { resolutionMode: 'routedByCheck' });

  const routed = manager.getSystem('sys-1').craftingCheck.routed;
  assert.equal(routed.rollFormula, '1d20');
  // The routed slot carries dcMode/macroUuid now (issue 1096), so the move no longer
  // silently reverts a dynamic check to whatever static DC lingered in the simple slot.
  assert.equal(routed.dcMode, 'dynamic', 'the DC source travels with the formula');
  assert.equal(routed.macroUuid, 'Macro.abc', 'the macro link travels with it');
  assert.equal(routed.dc, 13, 'the static DC still travels, as the anchor the macro receives');
});

test('the pass/fail move carries the evaluation, offer and advantage rule both ways', async () => {
  const advantage = {
    mode: 'bonus',
    extraDice: 2,
    bonusExpression: '1d8 + 1',
    offerDisadvantage: false,
    countEnabled: false,
    countDice: 3,
  };
  const evaluation = {
    product: 'sum',
    direction: 'under',
    target: { source: 'attribute', expression: '@skills.craft.value', adjustmentKind: 'add', baseAdjustment: -2 },
  };
  for (const [fromMode, toMode, from, to] of [
    ['routedByCheck', 'routedByIngredients', 'routed', 'simple'],
    ['routedByIngredients', 'routedByCheck', 'simple', 'routed'],
  ]) {
    settingsStore.clear();
    const manager = makeManager(makeRecipeManager([]));
    manager.systems.set('sys-1', manager._normalizeSystem({
      id: 'sys-1',
      name: 'Forge',
      resolutionMode: fromMode,
      craftingCheck: {
        [from]: { rollFormula: '1d20', evaluation, offerSituationalBonus: false, advantage }
      }
    }));

    await manager.updateSystem('sys-1', { resolutionMode: toMode });

    const moved = manager.getSystem('sys-1').craftingCheck[to];
    assert.equal(moved.rollFormula, '1d20', `${from} → ${to} moved`);
    assert.equal(moved.evaluation.direction, 'under', `${from} → ${to} keeps the evaluation`);
    assert.deepEqual(moved.evaluation.target, evaluation.target);
    assert.equal(moved.offerSituationalBonus, false, `${from} → ${to} keeps the offer`);
    assert.deepEqual(moved.advantage, advantage, `${from} → ${to} keeps the advantage rule`);
  }
});

test('crossing from routedByIngredients into progressive moves no crafting-check config', async () => {
  settingsStore.clear();
  const recipeManager = makeRecipeManager([]);
  const manager = makeManager(recipeManager);
  manager.systems.set('sys-1', manager._normalizeSystem({
    id: 'sys-1',
    name: 'Forge',
    resolutionMode: 'routedByIngredients',
    craftingCheck: { simple: { rollFormula: '2d6', dc: 9 } }
  }));

  await manager.updateSystem('sys-1', { resolutionMode: 'progressive' });

  // progressive has no comparable pass/fail slot; the routed slot stays unauthored.
  assert.equal(manager.getSystem('sys-1').craftingCheck.routed.rollFormula, '');
});

// The crafting-check slot across `iterative`, which rolls `craftingCheck.routed` (D16).

/** A ready manager holding `sys-1` in `resolutionMode` with the given `craftingCheck`. */
function slotManager(resolutionMode, craftingCheck) {
  settingsStore.clear();
  const manager = makeManager(makeRecipeManager([]));
  manager.systems.set(
    'sys-1',
    manager._normalizeSystem({ id: 'sys-1', name: 'Forge', resolutionMode, craftingCheck })
  );
  return manager;
}

test('routedByIngredients → iterative copies the pass/fail config simple → routed', async () => {
  const manager = slotManager('routedByIngredients', { simple: { rollFormula: '2d6+1', dc: 11 } });
  await manager.updateSystem('sys-1', { resolutionMode: 'iterative' });
  const { routed } = manager.getSystem('sys-1').craftingCheck;
  assert.equal(routed.rollFormula, '2d6+1');
  assert.equal(routed.dc, 11);
});

test('routedByIngredients → iterative does NOT clobber an already-authored routed slot', async () => {
  const manager = slotManager('routedByIngredients', {
    simple: { rollFormula: '2d6+1', dc: 11 },
    routed: { rollFormula: '1d20', dc: 25 },
  });
  await manager.updateSystem('sys-1', { resolutionMode: 'iterative' });
  const { routed } = manager.getSystem('sys-1').craftingCheck;
  assert.equal(routed.rollFormula, '1d20', 'authored routed check is preserved');
  assert.equal(routed.dc, 25);
});

test('iterative → routedByIngredients copies the pass/fail config routed → simple, never clobbering', async () => {
  const moved = slotManager('iterative', { routed: { rollFormula: '1d20+3', dc: 17 } });
  await moved.updateSystem('sys-1', { resolutionMode: 'routedByIngredients' });
  assert.equal(moved.getSystem('sys-1').craftingCheck.simple.rollFormula, '1d20+3');
  assert.equal(moved.getSystem('sys-1').craftingCheck.simple.dc, 17);

  const kept = slotManager('iterative', {
    routed: { rollFormula: '1d20+3', dc: 17 },
    simple: { rollFormula: '1d8', dc: 6 },
  });
  await kept.updateSystem('sys-1', { resolutionMode: 'routedByIngredients' });
  assert.equal(kept.getSystem('sys-1').craftingCheck.simple.rollFormula, '1d8');
});

test('routedByCheck ↔ iterative moves no crafting-check config, both rolling the routed slot', async () => {
  for (const [from, to] of [
    ['routedByCheck', 'iterative'],
    ['iterative', 'routedByCheck'],
  ]) {
    const manager = slotManager(from, { routed: { rollFormula: '1d20', dc: 15 } });
    await manager.updateSystem('sys-1', { resolutionMode: to });
    const check = manager.getSystem('sys-1').craftingCheck;
    assert.equal(check.routed.rollFormula, '1d20', `${from} → ${to}`);
    assert.equal(check.simple.rollFormula, '', `${from} → ${to}`);
  }
});

// Round trips into and out of `iterative`: each hop is the real migration through `updateSystem`,
// with every stored recipe re-read through `Recipe.fromJSON(json).toJSON()`.

const { Recipe } = await import('../src/models/Recipe.js');
const { buildIterativeAuthoringFixture, ITERATIVE_MULTI_RECIPE_ID } = await import(
  './helpers/iterativeAuthoringFixture.js'
);

const modelJSON = (json) => Recipe.fromJSON(structuredClone(json)).toJSON();
const METADATA = Object.freeze({ created: 1, modified: 1, author: 'GM', version: '1.0.0' });

/** A recipe manager storing every recipe as its model JSON, the way `RecipeManager` persists it. */
function modelRecipeManager(recipes) {
  const stored = new Map(recipes.map((recipe) => [recipe.id, modelJSON(recipe)]));
  const manager = makeRecipeManager([]);
  return Object.assign(manager, {
    getRecipes: () => [...stored.values()].map((json) => ({ ...structuredClone(json), toJSON: () => structuredClone(json) })),
    getRecipe: (id) => stored.get(id) ?? null,
    async updateRecipe(id, next) {
      stored.set(id, modelJSON(next));
    },
    stored,
  });
}

async function roundTrip(system, recipes, modes) {
  settingsStore.clear();
  const recipeManager = modelRecipeManager(recipes);
  const manager = makeManager(recipeManager);
  manager.systems.set(system.id, manager._normalizeSystem({ ...system, resolutionMode: modes[0] }));
  for (const mode of modes.slice(1)) await manager.updateSystem(system.id, { resolutionMode: mode });
  return { manager, stored: recipeManager.stored };
}

test('routedByCheck → iterative → routedByCheck collapses sets, seeds the line and keeps the rest', async () => {
  const set = (id, resultGroupId) => ({ id, name: id, resultGroupId, ingredientGroups: [] });
  const authored = {
    id: 'r-rt',
    name: 'Round Trip',
    craftingSystemId: 'sys-1',
    metadata: { ...METADATA },
    steps: [
      {
        id: 'st-1',
        name: 'Rough',
        ingredientSets: [set('s-1', 'g-hit'), set('s-2', 'g-miss')],
        outcomeRouting: { success: 'g-hit' },
        resultGroups: [
          { id: 'g-hit', name: 'Hit', checkOutcomeIds: ['tier-hit'], results: [] },
          { id: 'g-miss', name: 'Miss', checkOutcomeIds: ['tier-miss'], results: [] },
          { id: 'g-fail', name: '', role: 'failure', results: [] },
        ],
      },
      { id: 'st-2', name: 'Finish', ingredientSets: [set('s-3', null)], resultGroups: [{ id: 'g-2', name: 'Done', results: [] }] },
    ],
  };
  const { stored } = await roundTrip({ id: 'sys-1', name: 'Forge' }, [authored], [
    'routedByCheck',
    'iterative',
    'routedByCheck',
  ]);

  const expected = modelJSON(authored);
  expected.steps[0].ingredientSets = expected.steps[0].ingredientSets.slice(0, 1);
  expected.steps[0].resultGroups[2].producedWhen = [{ end: 'failure', rules: [] }];
  assert.equal(expected.steps[0].resultSelection, null, 'the premise: no selection survives either way');
  assert.deepEqual(stored.get('r-rt'), expected);
  assert.deepEqual(stored.get('r-rt').steps[0].resultGroups[0].checkOutcomeIds, ['tier-hit']);
  assert.equal(stored.get('r-rt').steps[0].ingredientSets[0].resultGroupId, 'g-hit');
  assert.deepEqual(stored.get('r-rt').steps[0].outcomeRouting, { success: 'g-hit' });
});

test('iterative → routedByCheck → iterative keeps every iterative key and seeds only a bare failure group', async () => {
  const fixture = buildIterativeAuthoringFixture();
  const shield = structuredClone(fixture.recipes.find((recipe) => recipe.id === ITERATIVE_MULTI_RECIPE_ID));
  delete shield.steps[1].resultGroups[1].producedWhen;
  shield.metadata = { ...METADATA };
  const { manager, stored } = await roundTrip(fixture.system, [shield], [
    'iterative',
    'routedByCheck',
    'iterative',
  ]);

  const expected = modelJSON(shield);
  expected.steps[1].resultGroups[1].producedWhen = [{ end: 'failure', rules: [] }];
  assert.deepEqual(stored.get(ITERATIVE_MULTI_RECIPE_ID), expected);
  assert.deepEqual(manager.getSystem(fixture.system.id).iterative, manager._normalizeSystem(fixture.system).iterative);
  assert.ok(manager.getSystem(fixture.system.id).iterative.counters.length > 0, 'the premise: a library');
});

// Multi-step is clamped off in alchemy by the normalizer (`resolution-modes` § Validation).

test('a change into alchemy with Multi-step on persists it off in the same save, and it stays off', async () => {
  settingsStore.clear();
  const saved = [];
  const manager = makeManager(makeRecipeManager([]), {
    recordSaves: () => {
      saved.push(manager.getSystem('sys-1').features.multiStepRecipes);
    },
  });
  manager.systems.set(
    'sys-1',
    manager._normalizeSystem({ id: 'sys-1', name: 'Forge', features: { multiStepRecipes: true } })
  );
  assert.equal(manager.getSystem('sys-1').features.multiStepRecipes, true, 'the premise: on in simple');

  await manager.updateSystem('sys-1', { resolutionMode: 'alchemy' });
  assert.deepEqual(saved, [false], 'one save, already off');

  await manager.updateSystem('sys-1', { features: { multiStepRecipes: true } });
  await manager.updateSystem('sys-1', { enableMultiStepRecipes: true });
  assert.equal(manager.getSystem('sys-1').features.multiStepRecipes, false);

  await manager.updateSystem('sys-1', { resolutionMode: 'simple' });
  assert.equal(manager.getSystem('sys-1').features.multiStepRecipes, false, 'leaving alchemy leaves it off');
});

test('the clamp turns Multi-step off in alchemy only, over every mode, alias and unknown token', async () => {
  const { RESOLUTION_MODES } = await import('../src/systems/resolutionModeAvailability.js');
  const manager = makeManager(makeRecipeManager([]));
  const tokens = [...RESOLUTION_MODES, 'cauldron', 'mapped', 'routed', 'tiered', 'bogus', undefined];
  for (const resolutionMode of tokens) {
    for (const features of [{ multiStepRecipes: true }, { complexRecipes: true }]) {
      const normalized = manager._normalizeSystem({ id: 'sys-c', name: 'Clamp', resolutionMode, features });
      const label = `${resolutionMode} ${Object.keys(features)[0]}`;
      assert.equal(normalized.features.multiStepRecipes, normalized.resolutionMode !== 'alchemy', label);
      assert.deepEqual(manager._normalizeSystem(normalized).features, normalized.features, `${label} re-normalized`);
    }
  }
});

test('createSystem in alchemy (or its cauldron alias) with Multi-step on persists it off', async () => {
  for (const resolutionMode of ['alchemy', 'cauldron']) {
    settingsStore.clear();
    const manager = makeManager(makeRecipeManager([]));
    const created = await manager.createSystem({
      id: `sys-${resolutionMode}`,
      name: 'Still',
      resolutionMode,
      features: { multiStepRecipes: true },
    });
    assert.equal(created.features.multiStepRecipes, false, resolutionMode);
    assert.equal(created.enableMultiStepRecipes, false, resolutionMode);
  }
});
