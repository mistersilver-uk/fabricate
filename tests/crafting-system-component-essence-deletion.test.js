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
    ['recipe-iron', 'recipe-match-iron', 'recipe-alias-iron'],
    'every iron-referencing recipe is updated — including the structured-match and legacy-alias forms'
  );
  for (const call of recipeManager.updateCalls) {
    assert.equal(call.options.notify, false, 'per-recipe notification suppressed');
  }
  assert.deepEqual(notifications, ['Removed "Iron" and updated 3 recipe(s).']);
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
