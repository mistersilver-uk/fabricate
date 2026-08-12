import test from 'node:test';
import assert from 'node:assert/strict';

import { installFoundryEnv } from './helpers/foundryEnv.js';

const { notifications } = installFoundryEnv();

const { CraftingSystemManager } = await import('../src/systems/CraftingSystemManager.js');

/**
 * Plain recipe object whose toJSON() returns a deep, function-free copy (matching how Recipe
 * instances behave through the manager's transform and reference predicates).
 */
function makeRecipe(data) {
  return {
    ...data,
    toJSON() {
      const { toJSON, ...rest } = this;
      return structuredClone(rest);
    }
  };
}

/**
 * Recipe manager double that records updateRecipe calls and mirrors the real per-recipe
 * notification rule (emit unless notify === false), so we can prove suppression.
 */
function makeRecipeManager() {
  const updateCalls = [];
  const recipes = [
    makeRecipe({
      id: 'recipe-fire',
      name: 'Fire Brew',
      craftingSystemId: 'sys',
      enabled: true,
      ingredientSets: [{ id: 's1', essences: { fire: 2 }, ingredientGroups: [], ingredients: [] }],
      resultGroups: [{ id: 'rg1', results: [{ componentId: 'potion' }] }]
    }),
    makeRecipe({
      id: 'recipe-iron',
      name: 'Iron Bar',
      craftingSystemId: 'sys',
      enabled: true,
      ingredientSets: [
        {
          id: 's2',
          essences: {},
          ingredientGroups: [{ id: 'g2', options: [{ componentId: 'iron' }] }],
          ingredients: [{ componentId: 'iron' }]
        }
      ],
      resultGroups: [{ id: 'rg2', results: [{ componentId: 'bar' }] }]
    }),
    makeRecipe({
      id: 'recipe-none',
      name: 'Wood Plank',
      craftingSystemId: 'sys',
      enabled: true,
      ingredientSets: [
        {
          id: 's3',
          essences: { water: 1 },
          ingredientGroups: [{ id: 'g3', options: [{ componentId: 'wood' }] }],
          ingredients: [{ componentId: 'wood' }]
        }
      ],
      resultGroups: [{ id: 'rg3', results: [{ componentId: 'plank' }] }]
    }),
    // Carries its component reference via a structured `match: { type: 'component', componentId }`
    // rather than a bare top-level `componentId`, so deletion must resolve the id through the match
    // handler (not the bare-field fallback) to strip/detect it.
    makeRecipe({
      id: 'recipe-match-iron',
      name: 'Match Iron Bar',
      craftingSystemId: 'sys',
      enabled: true,
      ingredientSets: [
        {
          id: 's4',
          essences: {},
          ingredientGroups: [
            { id: 'g4', options: [{ match: { type: 'component', componentId: 'iron' } }] }
          ],
          ingredients: []
        }
      ],
      resultGroups: [{ id: 'rg4', results: [{ componentId: 'bar' }] }]
    }),
    // A recipe CONVERTED from single-step to multi-step by the shipped editor.
    // `handleEnterMultiStep` COPIES the recipe-level sets into step 1 and leaves the
    // recipe-level fields in place, and `Recipe.getExecutionSteps()` then returns
    // `steps` and IGNORES the recipe-level copies. So the only executable path is
    // `steps[0]`, and both copies name `iron`.
    makeRecipe({
      id: 'recipe-multistep-iron',
      name: 'Multi Step Iron',
      craftingSystemId: 'sys',
      enabled: true,
      ingredientSets: [
        {
          id: 'ms-set',
          essences: {},
          ingredientGroups: [{ id: 'ms-g', options: [{ componentId: 'iron' }] }],
          ingredients: [{ componentId: 'iron' }]
        }
      ],
      resultGroups: [{ id: 'ms-rg', results: [{ componentId: 'bar' }] }],
      steps: [
        {
          id: 'ms-step-1',
          name: 'Step 1',
          ingredientSets: [
            {
              id: 'ms-set',
              essences: {},
              ingredientGroups: [{ id: 'ms-g', options: [{ componentId: 'iron' }] }],
              ingredients: [{ componentId: 'iron' }]
            }
          ],
          resultGroups: [{ id: 'ms-rg', results: [{ componentId: 'bar' }] }]
        }
      ]
    }),
    // Carries its component reference via the legacy `systemItem`/`systemItemId` alias match shape,
    // which the handler aliases to the component handler — deletion must still resolve and strip it.
    makeRecipe({
      id: 'recipe-alias-iron',
      name: 'Alias Iron Bar',
      craftingSystemId: 'sys',
      enabled: true,
      ingredientSets: [
        {
          id: 's5',
          essences: {},
          ingredientGroups: [
            { id: 'g5', options: [{ match: { type: 'systemItem', systemItemId: 'iron' } }] }
          ],
          ingredients: []
        }
      ],
      resultGroups: [{ id: 'rg5', results: [{ componentId: 'bar' }] }]
    })
  ];

  return {
    getRecipes(filters = {}) {
      if (filters.craftingSystemId) {
        return recipes.filter(recipe => recipe.craftingSystemId === filters.craftingSystemId);
      }
      return recipes;
    },
    async updateRecipe(recipeId, updates, options = {}) {
      updateCalls.push({ recipeId, updates, options });
      const idx = recipes.findIndex(recipe => recipe.id === recipeId);
      if (idx >= 0) recipes[idx] = makeRecipe({ ...updates, id: recipeId });
      if (options.notify !== false) {
        ui.notifications.info(`Recipe "${updates.name}" updated`);
      }
    },
    // The real `RecipeManager` exposes `save()`, and the component delete cascade now batches
    // through it (issue 1129) exactly as the essence cascade already did: every rewrite is
    // `{ persist: false }` and ONE trailing `save()` is the only persist. A double without
    // `save` is LOOSER than the thing it stands for, which is how a suite proves a batching
    // claim it never exercised. Recording the calls is what lets the batching be asserted.
    saveCalls: 0,
    async save() {
      this.saveCalls += 1;
    },
    // The real `RecipeManager` exposes this, and the batched cascade now calls it ONCE to
    // restore the change signal that `emitChange: false` suppresses on every rewrite. A
    // double without it is looser than the real manager and hides a stale-UI regression.
    notifyCalls: 0,
    notifyRecipesChanged() {
      this.notifyCalls += 1;
    },
    // Spy for the alchemy post-deletion reconcile. Tests set `conflictDisableResult` to the list of
    // recipes the real manager would disable.
    conflictDisableResult: [],
    disableCalls: [],
    async disableSignatureConflicts(systemId) {
      this.disableCalls.push(systemId);
      return this.conflictDisableResult;
    },
    updateCalls
  };
}

function makeManager(recipeManager) {
  const manager = new CraftingSystemManager(recipeManager);
  manager.initialized = true;
  manager.save = async () => {};
  manager.systems.set('sys', manager._normalizeSystem({
    id: 'sys',
    name: 'Alchemy',
    features: { essences: true },
    components: [
      { id: 'iron', name: 'Iron' },
      { id: 'wood', name: 'Wood' },
      { id: 'unused', name: 'Unused' },
      { id: 'potion', name: 'Potion' },
      { id: 'bar', name: 'Bar' },
      { id: 'plank', name: 'Plank' }
    ],
    essenceDefinitions: [
      { id: 'fire', name: 'Fire' },
      { id: 'water', name: 'Water' },
      { id: 'air', name: 'Air' }
    ]
  }));
  return manager;
}

test('deleteItem updates only recipes that reference the component, with one summary notification', async () => {
  notifications.length = 0;
  const recipeManager = makeRecipeManager();
  const manager = makeManager(recipeManager);

  await manager.deleteItem('sys', 'iron');

  assert.deepEqual(
    recipeManager.updateCalls.map(call => call.recipeId),
    ['recipe-iron', 'recipe-match-iron', 'recipe-multistep-iron', 'recipe-alias-iron'],
    'every iron-referencing recipe is updated — including the structured-match, legacy-alias and multi-step forms'
  );
  for (const call of recipeManager.updateCalls) {
    assert.equal(call.options.notify, false, 'per-recipe notification suppressed');
  }
  assert.deepEqual(notifications, ['Removed "Iron" and updated 4 recipe(s).']);
});

test('deleteItem strips a structured component-match ingredient and disables the emptied recipe', async () => {
  notifications.length = 0;
  const recipeManager = makeRecipeManager();
  const manager = makeManager(recipeManager);

  await manager.deleteItem('sys', 'iron');

  const matchUpdate = recipeManager.updateCalls.find(call => call.recipeId === 'recipe-match-iron');
  assert.ok(matchUpdate, 'the structured-match recipe is updated');
  // The sole ingredient option referenced iron via `match: { type: 'component', componentId }`, so
  // stripping it empties the only ingredient set and the recipe is disabled.
  assert.equal(matchUpdate.updates.ingredientSets.length, 0, 'emptied ingredient set is dropped');
  assert.equal(matchUpdate.updates.enabled, false, 'recipe left without ingredient sets is disabled');
});

test('deleteItem strips a legacy systemItem-alias match ingredient', async () => {
  notifications.length = 0;
  const recipeManager = makeRecipeManager();
  const manager = makeManager(recipeManager);

  await manager.deleteItem('sys', 'iron');

  const aliasUpdate = recipeManager.updateCalls.find(call => call.recipeId === 'recipe-alias-iron');
  assert.ok(aliasUpdate, 'the legacy systemItem-alias recipe is detected and updated');
  assert.equal(aliasUpdate.updates.ingredientSets.length, 0, 'emptied ingredient set is dropped');
  assert.equal(aliasUpdate.updates.enabled, false, 'recipe left without ingredient sets is disabled');
});

test('_recipeReferencesComponent detects structured-match and legacy-alias component references', () => {
  const recipeManager = makeRecipeManager();
  const manager = makeManager(recipeManager);

  const matchRecipe = makeRecipe({
    id: 'r-match',
    craftingSystemId: 'sys',
    ingredientSets: [
      {
        id: 's',
        ingredientGroups: [{ id: 'g', options: [{ match: { type: 'component', componentId: 'iron' } }] }],
        ingredients: []
      }
    ],
    resultGroups: []
  });
  const aliasRecipe = makeRecipe({
    id: 'r-alias',
    craftingSystemId: 'sys',
    ingredientSets: [
      {
        id: 's',
        ingredientGroups: [{ id: 'g', options: [{ match: { type: 'systemItem', systemItemId: 'iron' } }] }],
        ingredients: []
      }
    ],
    resultGroups: []
  });
  const unrelated = makeRecipe({
    id: 'r-none',
    craftingSystemId: 'sys',
    ingredientSets: [
      {
        id: 's',
        ingredientGroups: [{ id: 'g', options: [{ match: { type: 'component', componentId: 'wood' } }] }],
        ingredients: []
      }
    ],
    resultGroups: []
  });

  assert.equal(manager._recipeReferencesComponent(matchRecipe, 'iron'), true);
  assert.equal(manager._recipeReferencesComponent(aliasRecipe, 'iron'), true);
  assert.equal(manager._recipeReferencesComponent(unrelated, 'iron'), false);
});

test('deleteItem with no referencing recipes emits no notification', async () => {
  notifications.length = 0;
  const recipeManager = makeRecipeManager();
  const manager = makeManager(recipeManager);

  const result = await manager.deleteItem('sys', 'unused');

  assert.equal(result, true);
  assert.deepEqual(recipeManager.updateCalls, []);
  assert.deepEqual(notifications, []);
  assert.ok(!manager.getSystem('sys').components.some(c => c.id === 'unused'));
});

test('deleteEssence strips the essence from referencing recipes and disables emptied recipes', async () => {
  notifications.length = 0;
  const recipeManager = makeRecipeManager();
  const manager = makeManager(recipeManager);

  await manager.deleteEssence('sys', 'fire');

  assert.deepEqual(
    recipeManager.updateCalls.map(call => call.recipeId),
    ['recipe-fire'],
    'only the fire-referencing recipe is updated'
  );
  const update = recipeManager.updateCalls[0];
  assert.equal(update.options.notify, false, 'per-recipe notification suppressed');
  assert.equal(update.updates.ingredientSets.length, 0, 'emptied ingredient set is dropped');
  assert.equal(update.updates.enabled, false, 'recipe left without ingredient sets is disabled');
  assert.deepEqual(notifications, ['Removed essence "Fire" and updated 1 recipe(s).']);
  assert.ok(!manager.getSystem('sys').essenceDefinitions.some(def => def.id === 'fire'));
});

test('deleteEssence with no referencing recipes removes the definition silently', async () => {
  notifications.length = 0;
  const recipeManager = makeRecipeManager();
  const manager = makeManager(recipeManager);

  const result = await manager.deleteEssence('sys', 'air');

  assert.equal(result, true);
  assert.deepEqual(recipeManager.updateCalls, []);
  assert.deepEqual(notifications, []);
  assert.ok(!manager.getSystem('sys').essenceDefinitions.some(def => def.id === 'air'));
});

test('deleteEssence returns false for an unknown essence', async () => {
  notifications.length = 0;
  const recipeManager = makeRecipeManager();
  const manager = makeManager(recipeManager);

  const result = await manager.deleteEssence('sys', 'nonexistent');

  assert.equal(result, false);
  assert.deepEqual(recipeManager.updateCalls, []);
  assert.deepEqual(notifications, []);
});

function makeAlchemyManager(recipeManager) {
  const manager = makeManager(recipeManager);
  const system = manager.getSystem('sys');
  system.resolutionMode = 'alchemy';
  return manager;
}

test('deleteItem in alchemy mode disables conflicting recipes and notifies their names', async () => {
  notifications.length = 0;
  const recipeManager = makeRecipeManager();
  recipeManager.conflictDisableResult = [
    { id: 'recipe-fire', name: 'Fire Brew' },
    { id: 'recipe-none', name: 'Wood Plank' }
  ];
  const manager = makeAlchemyManager(recipeManager);

  await manager.deleteItem('sys', 'iron');

  assert.deepEqual(recipeManager.disableCalls, ['sys'], 'reconcile runs for alchemy systems');
  assert.ok(
    notifications.includes('Disabled 2 recipe(s) with conflicting signatures: Fire Brew, Wood Plank'),
    'a summary lists the disabled recipe names'
  );
});

test('deleteEssence in alchemy mode runs the signature reconcile', async () => {
  notifications.length = 0;
  const recipeManager = makeRecipeManager();
  recipeManager.conflictDisableResult = [{ id: 'recipe-fire', name: 'Fire Brew' }];
  const manager = makeAlchemyManager(recipeManager);

  await manager.deleteEssence('sys', 'fire');

  assert.deepEqual(recipeManager.disableCalls, ['sys']);
  assert.ok(
    notifications.includes('Disabled 1 recipe(s) with conflicting signatures: Fire Brew')
  );
});

test('deletion in a non-alchemy system does not run the signature reconcile', async () => {
  notifications.length = 0;
  const recipeManager = makeRecipeManager();
  const manager = makeManager(recipeManager);

  await manager.deleteItem('sys', 'iron');

  assert.deepEqual(recipeManager.disableCalls, [], 'reconcile is skipped outside alchemy mode');
});

// --- First-class essence OPTION deletion (issue 649) ------------------------

// A recipe manager whose recipe carries the essence via a first-class ingredient
// OPTION (`match: { type: 'essence', ... }`) inside a group, NOT the legacy per-set
// essences map — deleteEssence must strip the option and _recipeReferencesEssence
// must detect it via the option shape.
function makeEssenceOptionRecipeManager() {
  const updateCalls = [];
  const recipes = [
    makeRecipe({
      id: 'recipe-fire-opt',
      name: 'Fire Option Brew',
      craftingSystemId: 'sys',
      enabled: true,
      ingredientSets: [
        {
          id: 's1',
          ingredientGroups: [
            { id: 'g-comp', options: [{ match: { type: 'component', componentId: 'iron' } }] },
            { id: 'g-ess', options: [{ quantity: 1, match: { type: 'essence', essenceId: 'fire', amount: 2 } }] },
          ],
        },
      ],
      resultGroups: [{ id: 'rg1', results: [{ componentId: 'bar' }] }],
    }),
  ];
  return {
    getRecipes(filters = {}) {
      if (filters.craftingSystemId) {
        return recipes.filter((recipe) => recipe.craftingSystemId === filters.craftingSystemId);
      }
      return recipes;
    },
    async updateRecipe(recipeId, updates, options = {}) {
      updateCalls.push({ recipeId, updates, options });
    },
    // See the note on the sibling double: the real `RecipeManager` has `save()`, so this one does too.
    saveCalls: 0,
    async save() {
      this.saveCalls += 1;
    },
    notifyCalls: 0,
    notifyRecipesChanged() {
      this.notifyCalls += 1;
    },
    conflictDisableResult: [],
    disableCalls: [],
    async disableSignatureConflicts(systemId) {
      this.disableCalls.push(systemId);
      return this.conflictDisableResult;
    },
    updateCalls,
  };
}

test('deleteEssence detects and strips a first-class essence OPTION (not just the legacy map)', async () => {
  notifications.length = 0;
  const recipeManager = makeEssenceOptionRecipeManager();
  const manager = makeManager(recipeManager);

  await manager.deleteEssence('sys', 'fire');

  assert.deepEqual(
    recipeManager.updateCalls.map((call) => call.recipeId),
    ['recipe-fire-opt'],
    'the recipe is detected via its essence OPTION shape'
  );
  const update = recipeManager.updateCalls[0];
  const groups = update.updates.ingredientSets[0].ingredientGroups;
  // The essence group (its only option was the deleted essence) is dropped; the
  // component group survives.
  assert.equal(groups.length, 1, 'the emptied essence group is removed');
  assert.equal(groups[0].id, 'g-comp', 'the component group is retained');
  assert.equal(update.updates.enabled, true, 'the recipe still has ingredients/results, so it stays enabled');
});

// ── The batched set delete (issue 1129) ──────────────────────────────────────────────
//
// `deleteComponents` exists so a set delete issues ONE `craftingSystems` write and ONE
// `recipes` write instead of N and N x M. These tests pin that batching, and pin the two
// numbers the bulk panel states BEFORE the GM arms it — `recipesUpdated` and
// `recipesDisabled` — against what the write actually does. The panel counts through the
// same leaf functions this method executes through, so a drift between the stated and the
// executed number would have to break one of these.

test('deleteComponents rewrites each referencing recipe ONCE for the whole set', async () => {
  notifications.length = 0;
  const recipeManager = makeRecipeManager();
  const manager = makeManager(recipeManager);

  // `iron` and `wood` are named by disjoint recipes here, so the union is the plain sum;
  // the shared-recipe case is the test below.
  const result = await manager.deleteComponents('sys', ['iron', 'wood']);

  assert.equal(result.deleted, 2);
  assert.deepEqual(result.componentIds, ['iron', 'wood']);
  assert.deepEqual(
    recipeManager.updateCalls.map((call) => call.recipeId),
    ['recipe-iron', 'recipe-none', 'recipe-match-iron', 'recipe-multistep-iron', 'recipe-alias-iron'],
    'every referencing recipe is rewritten exactly once, in one pass over the recipe list'
  );
});

test('deleteComponents counts a SHARED recipe once rather than summing per component', async () => {
  notifications.length = 0;
  const recipeManager = makeRecipeManager();
  const manager = makeManager(recipeManager);

  // `recipe-iron` names iron as an ingredient AND bar as its result. Deleting both must
  // rewrite it once and report 1 — a per-component sum would report 2, which is exactly the
  // over-promise the impact statement exists to avoid.
  const result = await manager.deleteComponents('sys', ['iron', 'bar']);

  const ironRewrites = recipeManager.updateCalls.filter(
    (call) => call.recipeId === 'recipe-iron'
  );
  assert.equal(ironRewrites.length, 1, 'the shared recipe is written once, not once per component');
  assert.equal(
    result.recipesUpdated,
    new Set(recipeManager.updateCalls.map((call) => call.recipeId)).size,
    'the reported count is the DISTINCT recipe count'
  );
});

test('deleteComponents persists the recipe rewrites in ONE save, not one per recipe', async () => {
  notifications.length = 0;
  const recipeManager = makeRecipeManager();
  const manager = makeManager(recipeManager);

  await manager.deleteComponents('sys', ['iron', 'wood']);

  assert.ok(recipeManager.updateCalls.length > 1, 'several recipes were rewritten');
  for (const call of recipeManager.updateCalls) {
    assert.equal(call.options.persist, false, 'no rewrite persists on its own');
    assert.equal(call.options.emitChange, false, 'no rewrite emits its own change');
    assert.equal(call.options.notify, false, 'per-recipe notification suppressed');
  }
  assert.equal(recipeManager.saveCalls, 1, 'exactly one trailing recipes save for the whole set');
});

test('deleteComponents reports the recipes it leaves uncraftable, and disables them', async () => {
  notifications.length = 0;
  const recipeManager = makeRecipeManager();
  const manager = makeManager(recipeManager);

  // `bar` is the ONLY result of recipe-iron, recipe-match-iron and recipe-alias-iron, so
  // deleting it leaves each with nothing to produce.
  const result = await manager.deleteComponents('sys', ['bar']);

  const disabled = recipeManager.updateCalls.filter((call) => call.updates.enabled === false);
  assert.equal(
    result.recipesDisabled,
    disabled.length,
    'the reported disable count equals the number actually clamped'
  );
  assert.ok(result.recipesDisabled > 0, 'losing the only result disables the recipe');
});

test('deleteComponents ignores unknown ids and is a no-op for an empty selection', async () => {
  notifications.length = 0;
  const recipeManager = makeRecipeManager();
  const manager = makeManager(recipeManager);

  const empty = await manager.deleteComponents('sys', []);
  assert.deepEqual(empty, { deleted: 0, componentIds: [], recipesUpdated: 0, recipesDisabled: 0 });

  const unknown = await manager.deleteComponents('sys', ['nope', 'also-nope']);
  assert.deepEqual(unknown, { deleted: 0, componentIds: [], recipesUpdated: 0, recipesDisabled: 0 });
  assert.equal(recipeManager.updateCalls.length, 0, 'nothing is written for a no-op');
});

test('deleteComponents removes the components from the system', async () => {
  notifications.length = 0;
  const recipeManager = makeRecipeManager();
  const manager = makeManager(recipeManager);

  await manager.deleteComponents('sys', ['iron', 'unused']);

  const remaining = manager.getSystem('sys').components.map((component) => component.id);
  assert.ok(!remaining.includes('iron'));
  assert.ok(!remaining.includes('unused'));
  assert.ok(remaining.includes('wood'), 'unselected components are untouched');
});

test('deleteComponents deletes a recipe-referenced component rather than refusing it', async () => {
  notifications.length = 0;
  const recipeManager = makeRecipeManager();
  const manager = makeManager(recipeManager);

  // Warned, not blocked — the same rule the essence delete follows. `iron` is referenced by
  // three recipes and is deleted anyway.
  const result = await manager.deleteComponents('sys', ['iron']);

  assert.equal(result.deleted, 1, 'nothing is skipped on account of recipe usage');
  assert.ok(!manager.getSystem('sys').components.some((c) => c.id === 'iron'));
});

test('deleteItem and deleteComponents agree — the singular is the set of one', async () => {
  notifications.length = 0;
  const singleManagerRecipes = makeRecipeManager();
  const singleManager = makeManager(singleManagerRecipes);
  await singleManager.deleteItem('sys', 'iron');

  notifications.length = 0;
  const setManagerRecipes = makeRecipeManager();
  const setManager = makeManager(setManagerRecipes);
  await setManager.deleteComponents('sys', ['iron']);

  assert.deepEqual(
    setManagerRecipes.updateCalls.map((call) => call.recipeId),
    singleManagerRecipes.updateCalls.map((call) => call.recipeId),
    'both routes rewrite the same recipes'
  );
  assert.deepEqual(
    setManager.getSystem('sys').components.map((c) => c.id),
    singleManager.getSystem('sys').components.map((c) => c.id),
    'both routes leave the same components behind'
  );
});


test('1129: deleting a component strips it from STEP ingredient sets too', async () => {
  notifications.length = 0;
  const recipeManager = makeRecipeManager();
  const manager = makeManager(recipeManager);

  await manager.deleteComponents('sys', ['iron']);

  const update = recipeManager.updateCalls.find((call) => call.recipeId === 'recipe-multistep-iron');
  assert.ok(update, 'the converted multi-step recipe is detected as referencing iron');

  const stepSets = update.updates.steps?.[0]?.ingredientSets || [];
  const stepNamesIron = JSON.stringify(stepSets).includes('iron');
  assert.equal(
    stepNamesIron,
    false,
    'the STEP copy must be stripped too — it is the only path `getExecutionSteps()` executes'
  );
});

test('1129: a converted multi-step recipe left with no executable path is DISABLED', async () => {
  notifications.length = 0;
  const recipeManager = makeRecipeManager();
  const manager = makeManager(recipeManager);

  // Before this issue, `deleteItem` read recipe-level sets only and clamped this recipe to
  // disabled. A steps-aware "lost its shape" check paired with a strip that never walked
  // steps would leave it ENABLED holding a reference to a component that no longer exists —
  // permanently uncraftable, and offered to players.
  await manager.deleteComponents('sys', ['iron']);

  const update = recipeManager.updateCalls.find((call) => call.recipeId === 'recipe-multistep-iron');
  assert.equal(
    update.updates.enabled,
    false,
    'losing its only ingredient in every copy makes it uncraftable, so it must be disabled'
  );
});


test('1129: a batched delete emits exactly ONE recipes-changed signal, and never zero', async () => {
  notifications.length = 0;
  const recipeManager = makeRecipeManager();
  const manager = makeManager(recipeManager);

  // Every rewrite is issued with `emitChange: false`, so without an explicit batch-level
  // signal the acting client would receive NOTHING: `settingChangeBridge` re-emits only when
  // `reload()` reports a change, and on the writing client the in-memory map already equals
  // the saved setting. The GM's own crafting window would keep offering pre-rewrite recipes.
  await manager.deleteComponents('sys', ['iron', 'wood']);

  assert.ok(recipeManager.updateCalls.length > 1, 'several recipes were rewritten');
  for (const call of recipeManager.updateCalls) {
    assert.equal(call.options.emitChange, false, 'no rewrite emits its own change');
  }
  assert.equal(recipeManager.notifyCalls, 1, 'exactly one signal for the whole batch');
});

test('1129: the SINGULAR delete also emits a recipes-changed signal', async () => {
  notifications.length = 0;
  const recipeManager = makeRecipeManager();
  const manager = makeManager(recipeManager);

  // `deleteItem` does not call `_notifySystemsChanged()`, so the batched recipes signal is
  // its ONLY change notification. Losing it is invisible to every other assertion here.
  await manager.deleteItem('sys', 'iron');

  assert.equal(recipeManager.notifyCalls, 1);
});

test('1129: a delete that rewrites NOTHING emits no signal and saves nothing', async () => {
  notifications.length = 0;
  const recipeManager = makeRecipeManager();
  const manager = makeManager(recipeManager);

  // `unused` is named by no recipe, so there is nothing to announce.
  await manager.deleteComponents('sys', ['unused']);

  assert.equal(recipeManager.updateCalls.length, 0);
  assert.equal(recipeManager.saveCalls, 0, 'no recipes write for a component no recipe names');
  assert.equal(recipeManager.notifyCalls, 0, 'and no spurious signal');
});
