import test from 'node:test';
import assert from 'node:assert/strict';

import { installFoundryEnv } from './helpers/foundryEnv.js';
// The panel's side of the contract. Imported HERE, in the manager's own suite, because the
// change's central claim is that the stated impact and the executed write agree — and that is
// a claim about two modules, so only a test that runs both can falsify it.
import { describeComponentDeleteImpact } from '../src/utils/recipeComponentReferences.js';

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
    }),
    // Rewritten but NOT disabled. It names `bar` among ALTERNATIVES at both ends — an
    // ingredient group of two options and a result group of two results — so a delete that
    // takes `bar` (or `wood`) still leaves it with something to consume and something to
    // produce. Without a recipe of this shape the fixture's rewrite and disable counts are
    // the same number, and every assertion comparing them is vacuous.
    makeRecipe({
      id: 'recipe-assortment',
      name: 'Smith Assortment',
      craftingSystemId: 'sys',
      enabled: true,
      ingredientSets: [
        {
          id: 's6',
          essences: {},
          ingredientGroups: [
            { id: 'g6', options: [{ componentId: 'wood' }, { componentId: 'plank' }] }
          ],
          ingredients: [{ componentId: 'wood' }]
        }
      ],
      resultGroups: [
        { id: 'rg6', results: [{ componentId: 'bar' }, { componentId: 'plank' }] }
      ]
    }),
    // ALREADY disabled, and it names `bar` as its only result. Deleting `bar` rewrites it
    // and leaves it with nothing to produce, so the rewrite clamps `enabled` to false again
    // — but no enabled→disabled TRANSITION happens, so `recipesDisabled` must not count it.
    // That is the whole content of the `json.enabled !== false` guard in
    // `_stripComponentsFromRecipes`, and of the identical `before?.enabled !== false` guard
    // in `describeComponentDeleteImpact`. It names neither `iron` nor `wood`, so it does not
    // disturb the single-component fixtures above it.
    makeRecipe({
      id: 'recipe-shelved-bar',
      name: 'Shelved Bar Mould',
      craftingSystemId: 'sys',
      enabled: false,
      ingredientSets: [
        {
          id: 's7',
          essences: {},
          ingredientGroups: [{ id: 'g7', options: [{ componentId: 'plank' }] }],
          ingredients: [{ componentId: 'plank' }]
        }
      ],
      resultGroups: [{ id: 'rg7', results: [{ componentId: 'bar' }] }]
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
    //
    // It also SNAPSHOTS what the in-memory map held at that instant. A call count alone
    // proves the write happened once; it cannot see a rewrite applied AFTER the persist, or
    // one applied to a copy the persist never reached — both of which leave the count at 1
    // and the world setting holding the pre-delete bodies.
    saveCalls: 0,
    savedRecipes: [],
    async save() {
      this.saveCalls += 1;
      this.savedRecipes.push(recipes.map((recipe) => recipe.toJSON()));
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
  // `save()` IS the `craftingSystems` world-setting write, so counting it is how "one
  // crafting-system write regardless of set size" becomes falsifiable rather than asserted in
  // a doc block. The snapshot is the same argument the recipe double's `save` records: a
  // count cannot see components removed after the persist.
  manager.saveCalls = 0;
  manager.savedComponentIds = [];
  manager.save = async () => {
    manager.saveCalls += 1;
    manager.savedComponentIds.push(
      (manager.getSystem('sys')?.components || []).map((component) => component.id)
    );
  };
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

test('deleteItem disables a recipe whose only RESULT was the deleted component', async () => {
  // The result side of the strip, and the branch that decides "no longer craftable".
  // `deleteItem` used to answer that question from the flat top-level `results` alias as well
  // as from `resultGroups`; issue 1087 retired the alias from `Recipe.toJSON()`, so the answer
  // now comes from the groups alone — which is where the alias's entries always came from.
  // Nothing else covered this branch: replacing it with a constant `true` broke no test.
  notifications.length = 0;
  const recipeManager = makeRecipeManager();
  const manager = makeManager(recipeManager);

  await manager.deleteItem('sys', 'bar');

  const ironUpdate = recipeManager.updateCalls.find(call => call.recipeId === 'recipe-iron');
  assert.ok(ironUpdate, 'the recipe producing the deleted component is updated');
  assert.equal(ironUpdate.updates.resultGroups.length, 0, 'the emptied result group is dropped');
  assert.ok(
    !('results' in ironUpdate.updates),
    'and the retired flat alias is not written back into the update payload'
  );
  assert.equal(ironUpdate.updates.enabled, false, 'a recipe left with no results is disabled');
  assert.equal(
    ironUpdate.updates.ingredientSets.length,
    1,
    'while its untouched ingredient set survives — the disable is the results rule, not a wipe'
  );
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
    [
      'recipe-iron',
      'recipe-none',
      'recipe-match-iron',
      'recipe-multistep-iron',
      'recipe-alias-iron',
      'recipe-assortment'
    ],
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
  //
  // The count is of enabled→disabled TRANSITIONS, not of recipes left clamped, so the
  // re-derivation has to know which recipes were enabled beforehand. `recipe-shelved-bar`
  // is rewritten and clamped to disabled like the rest and must NOT appear in the number,
  // and `recipe-assortment` keeps an alternative result and is not clamped at all.
  const enabledBefore = new Set(
    recipeManager
      .getRecipes({})
      .filter((recipe) => recipe.enabled !== false)
      .map((recipe) => recipe.id)
  );
  const result = await manager.deleteComponents('sys', ['bar']);

  const clamped = recipeManager.updateCalls.filter((call) => call.updates.enabled === false);
  const transitioned = clamped.filter((call) => enabledBefore.has(call.recipeId));
  assert.equal(
    result.recipesDisabled,
    transitioned.length,
    'the reported disable count equals the number actually taken from enabled to disabled'
  );
  assert.ok(result.recipesDisabled > 0, 'losing the only result disables the recipe');
  assert.ok(
    clamped.length > transitioned.length,
    'and an already-disabled recipe was clamped without being counted — otherwise the guard is unexercised'
  );
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

// ── The stated/executed contract, the write budget, and the GM gate (issue 1129) ──────
//
// The central claim of this change is that the numbers the bulk panel STATES are exactly what
// the write PERFORMS. `describeComponentDeleteImpact` counts through the same three leaf
// functions `deleteComponents` executes through, which makes drift structurally hard — but
// "hard" is not "checked", and nothing outside the leaf's own unit tests had ever run the two
// halves against one fixture and compared them.

test('1129: the STATED impact equals what the delete PERFORMS, on one fixture', async () => {
  notifications.length = 0;
  const recipeManager = makeRecipeManager();
  const manager = makeManager(recipeManager);

  // The fixture is chosen so the three stated numbers are three DIFFERENT numbers, and in
  // particular so `recipesRewritten > recipesDisabled > 0`. Equal counts are what make a
  // comparison like this vacuous: while rewrite and disable were both 4, TRANSPOSING the two
  // fields in the object `deleteComponents` returns passed every assertion here.
  //
  // `iron` is the only INGREDIENT of four recipes and `bar` is the only RESULT of the same
  // four, so each is rewritten once and left with nothing at either end. `recipe-assortment`
  // names `bar` among alternatives and is rewritten while staying craftable, which separates
  // rewrite from disable. `recipe-shelved-bar` names `bar` too but was ALREADY disabled, so
  // it is rewritten and clamped without being a transition — which is what makes the
  // `enabled !== false` guard on both sides of the comparison load-bearing.
  const ids = ['iron', 'bar'];
  const enabledBefore = new Set(
    recipeManager
      .getRecipes({})
      .filter((recipe) => recipe.enabled !== false)
      .map((recipe) => recipe.id)
  );
  const stated = describeComponentDeleteImpact(ids, recipeManager.getRecipes({}));

  const performed = await manager.deleteComponents('sys', ids);

  assert.equal(
    performed.recipesUpdated,
    stated.recipesRewritten,
    'the panel promised a rewrite count the write did not match'
  );
  assert.equal(
    performed.recipesDisabled,
    stated.recipesDisabled,
    'the panel promised a disable count the write did not match'
  );
  assert.equal(performed.deleted, stated.deletable);

  // Negative controls. Any two of these three numbers being equal makes the comparison
  // above satisfiable by an implementation that returns the wrong one, so each pair is
  // separated explicitly rather than left to the fixture's good behaviour.
  assert.ok(stated.recipesRewritten > 1, 'more than one recipe is rewritten');
  assert.ok(stated.recipesDisabled > 0, 'and some of them are left uncraftable');
  assert.ok(
    stated.recipesRewritten > stated.recipesDisabled,
    'the rewrite count and the disable count are genuinely different numbers'
  );
  assert.ok(
    stated.deletable !== stated.recipesRewritten && stated.deletable !== stated.recipesDisabled,
    'and neither of them is the component count'
  );
  // The guard that makes `recipesDisabled` a transition count is only exercised while an
  // already-disabled recipe is actually part of the rewritten set.
  assert.ok(
    recipeManager.updateCalls.some((call) => call.recipeId === 'recipe-shelved-bar'),
    'the already-disabled recipe really is rewritten by this selection'
  );

  // And the executed numbers are what the write DID, not a third count computed beside it.
  assert.equal(
    new Set(recipeManager.updateCalls.map((call) => call.recipeId)).size,
    stated.recipesRewritten
  );
  assert.equal(
    recipeManager.updateCalls.filter(
      (call) => call.updates.enabled === false && enabledBefore.has(call.recipeId)
    ).length,
    stated.recipesDisabled,
    'the disable count is the enabled→disabled transitions, not every recipe left clamped'
  );
});

test('1129: one craftingSystems write and one recipes write, regardless of set size', async () => {
  notifications.length = 0;
  const oneRecipes = makeRecipeManager();
  const one = makeManager(oneRecipes);
  await one.deleteComponents('sys', ['iron']);

  notifications.length = 0;
  const manyRecipes = makeRecipeManager();
  const many = makeManager(manyRecipes);
  await many.deleteComponents('sys', ['iron', 'wood', 'bar', 'potion', 'unused']);

  assert.equal(one.saveCalls, 1, 'a one-component delete issues one crafting-system write');
  assert.equal(many.saveCalls, 1, 'and so does a five-component delete — the budget is per CALL');
  assert.equal(oneRecipes.saveCalls, 1);
  assert.equal(
    manyRecipes.saveCalls,
    1,
    'one recipes write for five components across six recipes'
  );

  // The control that makes the equal counts mean batching rather than a delete that simply
  // did less: the larger set genuinely rewrote strictly more recipes.
  assert.ok(
    manyRecipes.updateCalls.length > oneRecipes.updateCalls.length,
    'the larger set genuinely rewrote more recipes'
  );
});

test('1129: the CONTENTS the write persists are the rewritten ones, not the pre-delete bodies', async () => {
  notifications.length = 0;
  const recipeManager = makeRecipeManager();
  const manager = makeManager(recipeManager);

  await manager.deleteComponents('sys', ['iron', 'wood']);

  // Read at `save()` time, not at the end of the test. A rewrite applied AFTER the persist, or
  // applied to a copy the persist never reached, leaves the call count at 1 and the world
  // setting holding the pre-delete bodies — invisible to a count-only assertion.
  const persistedRecipes = recipeManager.savedRecipes.at(-1);
  assert.ok(persistedRecipes, 'the recipes save happened');
  assert.equal(
    JSON.stringify(persistedRecipes).includes('"iron"'),
    false,
    'no persisted recipe still names the deleted component'
  );
  assert.equal(JSON.stringify(persistedRecipes).includes('"wood"'), false);
  // Negative control: an unrelated reference survives in the same snapshot, so the two
  // assertions above are not passing against an empty or truncated payload.
  assert.equal(
    JSON.stringify(persistedRecipes).includes('"potion"'),
    true,
    'an unrelated reference survives — the snapshot is real'
  );

  assert.deepEqual(
    manager.savedComponentIds.at(-1),
    ['unused', 'potion', 'bar', 'plank'],
    'the crafting-system write persists exactly the surviving components'
  );
});

test('1129: a NON-GM caller writes nothing through either delete', async () => {
  notifications.length = 0;
  const recipeManager = makeRecipeManager();
  const manager = makeManager(recipeManager);

  // Every test double here is omnipotent — none of them refuses a write — so a missing GM
  // gate is invisible to every other assertion in this file, and the smoke harness runs as a
  // GM. Flipping the flag is the only way the omission can fail a test.
  game.user.isGM = false;
  try {
    await assert.rejects(
      () => manager.deleteComponents('sys', ['iron']),
      /GM permissions required/,
      'the set delete is GM-gated'
    );
    await assert.rejects(
      () => manager.deleteItem('sys', 'iron'),
      /GM permissions required/,
      'and so is the singular delete it shares a body with'
    );
  } finally {
    game.user.isGM = true;
  }

  assert.equal(recipeManager.updateCalls.length, 0, 'no recipe was rewritten');
  assert.equal(recipeManager.saveCalls, 0, 'no recipes write');
  assert.equal(manager.saveCalls, 0, 'no crafting-system write');
  assert.ok(
    manager.getSystem('sys').components.some((component) => component.id === 'iron'),
    'and the component is still there'
  );
});

test('1129: the batch-level cascade helpers run once per CALL, not once per component', async () => {
  notifications.length = 0;
  const recipeManager = makeRecipeManager();
  const manager = makeManager(recipeManager);
  // The alchemy reconcile is gated on the system's resolution mode, so the fixture opts in
  // before the helper can run at all.
  manager.getSystem('sys').resolutionMode = 'alchemy';

  const hooksBefore = globalThis.Hooks;
  const hookNames = [];
  globalThis.Hooks = { callAll: (name) => hookNames.push(name) };
  try {
    await manager.deleteComponents('sys', ['iron', 'wood', 'bar']);
  } finally {
    globalThis.Hooks = hooksBefore;
  }

  assert.equal(recipeManager.disableCalls.length, 1, 'one alchemy signature reconcile per call');
  assert.equal(recipeManager.notifyCalls, 1, 'one recipes-changed signal per call');
  assert.equal(recipeManager.saveCalls, 1, 'one recipes persist per call');
  assert.equal(manager.saveCalls, 1, 'one crafting-system persist per call');
  assert.equal(
    hookNames.filter((name) => name === 'fabricate.craftingSystemsChanged').length,
    1,
    'one systems-changed hook per call'
  );
  assert.equal(notifications.length, 1, 'one summary notification, not one per component');
});

test('1129: salvage RUN cleanup is the one per-component pass, and is pinned as such', async () => {
  notifications.length = 0;
  const recipeManager = makeRecipeManager();
  const manager = makeManager(recipeManager);

  const removed = [];
  const fabricateBefore = game.fabricate;
  game.fabricate = {
    ...fabricateBefore,
    getSalvageRunManager: () => ({
      async removeRunsForComponent(componentId) {
        removed.push(componentId);
      },
    }),
  };
  try {
    await manager.deleteComponents('sys', ['iron', 'wood', 'bar']);
  } finally {
    game.fabricate = fabricateBefore;
  }

  // Asserted rather than quietly tolerated. `SalvageRunManager` offers no set-wise form, so
  // this one cascade still fans out over the selection — a pass over every actor's run history
  // per deleted component. Pinning it makes the cost visible, and gives a future batched
  // `removeRunsForComponents` a test that notices when it lands.
  //
  // This case installs `game.fabricate.getSalvageRunManager`, so it pins the DELEGATING branch
  // of `_cleanupSalvageRunsForComponent` only. The in-manager fallback that runs when no
  // salvage run manager is registered — the `for (const actor of game.actors)` walk — is where
  // the per-component cost is actually paid, and it has its own case below.
  assert.deepEqual(removed, ['iron', 'wood', 'bar'], 'one pass per deleted component');
});

test('1129: with no SalvageRunManager the cleanup walks every actor once per component', async () => {
  notifications.length = 0;
  const recipeManager = makeRecipeManager();
  const manager = makeManager(recipeManager);

  // The branch the case above does NOT reach. `_getSalvageRunManager()` returns null whenever
  // nothing registered one on `game.fabricate`, and the fallback then re-reads every actor's
  // salvage-run flag once per deleted component. `game.actors` is empty in every other test
  // here, so that loop body has never executed — the fan-out was asserted of the delegating
  // branch and merely assumed of the branch that pays for it.
  const reads = [];
  const writes = [];
  const makeActor = (id, history) => {
    const container = { history };
    return {
      id,
      getFlag(_scope, key) {
        reads.push(`${id}|${key}`);
        return key === 'fabricate.salvageRuns' ? container : null;
      },
      async setFlag(_scope, key, value) {
        writes.push({ actorId: id, key, componentIds: value.history.map((run) => run.componentId) });
        container.history = value.history;
      },
    };
  };

  const actorsBefore = game.actors;
  game.actors = [
    makeActor('actor-a', [
      { componentId: 'iron', craftingSystemId: 'sys' },
      { componentId: 'wood', craftingSystemId: 'sys' },
      // Another system's run for the same component: the filter is scoped by system, so this
      // must survive both passes.
      { componentId: 'iron', craftingSystemId: 'other-sys' },
    ]),
    makeActor('actor-b', [{ componentId: 'plank', craftingSystemId: 'sys' }]),
  ];
  try {
    await manager.deleteComponents('sys', ['iron', 'wood']);
  } finally {
    game.actors = actorsBefore;
  }

  assert.equal(
    reads.length,
    4,
    'every actor is re-read once per deleted component — actors x components, the cost a set-wise form would remove'
  );
  assert.deepEqual(
    writes.map((write) => write.actorId),
    ['actor-a', 'actor-a'],
    'only the actor whose history actually changed is written, once per matching component'
  );
  assert.deepEqual(
    writes.at(-1).componentIds,
    ['iron'],
    "the surviving entry is the OTHER system's run for the same component, not a leftover of this one"
  );
});

test('1129: deleteComponents returns the exact field names its callers read by name', async () => {
  notifications.length = 0;
  const recipeManager = makeRecipeManager();
  const manager = makeManager(recipeManager);

  const result = await manager.deleteComponents('sys', ['iron']);

  // A SEAM, not a redundant shape check. `adminStore.deleteComponents` reads `deleted`,
  // `recipesUpdated` and `recipesDisabled` off this object BY NAME and republishes the same
  // three names to the manager root, which interpolates them into the post-delete toast.
  // Renaming one is silent at every step: `Number(undefined) || 0` is 0, so a successful
  // delete would report "Deleted 0 component(s)" with every other test still green.
  assert.deepEqual(
    Object.keys(result).sort(),
    ['componentIds', 'deleted', 'recipesDisabled', 'recipesUpdated'],
    'the returned field names are a published contract, not an implementation detail'
  );
  assert.equal(typeof result.deleted, 'number');
  assert.equal(typeof result.recipesUpdated, 'number');
  assert.equal(typeof result.recipesDisabled, 'number');
  assert.ok(Array.isArray(result.componentIds));

  // The no-op return travels a different code path and must carry the same names, or a delete
  // that matched nothing reports through a differently-shaped object.
  const noop = await manager.deleteComponents('sys', ['nothing-named-this']);
  assert.deepEqual(Object.keys(noop).sort(), Object.keys(result).sort());
});
