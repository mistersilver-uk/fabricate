/**
 * Integration tests for ingredient/catalyst/recipe-item matching with _stats.compendiumSource (T-087)
 *
 * Covers:
 *   1. ingredientMatchesItem matches item with only _stats.compendiumSource
 *   2. ingredientMatchesItem still matches item with only flags.core.sourceId (legacy)
 *   3. _catalystMatchesItem matches item with only _stats.compendiumSource
 *   4. _catalystMatchesItem still matches item with only flags.core.sourceId (legacy)
 *   5. "Craftable only" filtering includes recipe when actor has items matched via _stats.compendiumSource
 */

import test from 'node:test';
import assert from 'node:assert/strict';

// ---------------------------------------------------------------------------
// Foundry globals (minimal shim — getSourceUuid will use item.flags.core.sourceId
// directly when foundry.utils.getProperty is available, so we provide it here)
// ---------------------------------------------------------------------------

function getProperty(object, path) {
  if (!object || !path) return undefined;
  return String(path)
    .split('.')
    .reduce((value, key) => (value == null ? undefined : value[key]), object);
}

globalThis.foundry = { utils: { getProperty } };
globalThis.ui = { notifications: { info: () => {}, warn: () => {}, error: () => {} } };

// game shim — RecipeManager calls game.fabricate for system lookups in _getComponent
function makeFakeGame({ system = null } = {}) {
  const systemManager = { getSystem: () => system };
  return {
    user: { isGM: true },
    fabricate: {
      getCraftingSystemManager: () => systemManager,
      getResolutionModeService: () => null,
      getCraftingRunManager: () => null,
      getRecipeVisibilityService: () => null
    }
  };
}

globalThis.game = makeFakeGame();

const { RecipeManager } = await import('../src/systems/RecipeManager.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeIngredient(componentId, quantity = 1) {
  return {
    componentId,
    quantity,
    getDescription: () => `ingredient-${componentId}`,
    match: null
  };
}

function makeCatalyst(componentId) {
  return { componentId, name: `catalyst-${componentId}` };
}

function makeRecipe(overrides = {}) {
  return {
    id: 'recipe-1',
    craftingSystemId: 'system-1',
    ingredientSets: [],
    catalysts: [],
    ...overrides
  };
}

/** Build a fake system with one managed component */
function makeSystem(componentId, sourceUuid, name = 'Test Item') {
  return {
    advancedOptionsEnabled: false,
    features: {},
    components: [{ id: componentId, sourceUuid, name }]
  };
}

function makeSystemWithComponent(component) {
  return {
    advancedOptionsEnabled: false,
    features: {},
    components: [component]
  };
}

// ---------------------------------------------------------------------------
// Test 1 — ingredientMatchesItem: _stats.compendiumSource
// ---------------------------------------------------------------------------

test('T1 - ingredientMatchesItem: matches item that only has _stats.compendiumSource', () => {
  const sourceUuid = 'Compendium.world.items.abc';
  const system = makeSystem('comp-1', sourceUuid);
  globalThis.game = makeFakeGame({ system });

  const manager = new RecipeManager();
  const recipe = makeRecipe();
  const ingredient = makeIngredient('comp-1');

  // Item has no flags.core.sourceId — only _stats.compendiumSource (Foundry v12+)
  const item = {
    uuid: 'world-item-uuid-different',
    _stats: { compendiumSource: sourceUuid },
    flags: {},
    name: 'Test Item',
    system: { quantity: 1 }
  };

  assert.equal(manager.ingredientMatchesItem(recipe, ingredient, item), true);
});

// ---------------------------------------------------------------------------
// Test 2 — ingredientMatchesItem: legacy flags.core.sourceId still works
// ---------------------------------------------------------------------------

test('T2 - ingredientMatchesItem: matches item with only flags.core.sourceId (legacy)', () => {
  const sourceUuid = 'Compendium.world.items.legacy';
  const system = makeSystem('comp-2', sourceUuid);
  globalThis.game = makeFakeGame({ system });

  const manager = new RecipeManager();
  const recipe = makeRecipe();
  const ingredient = makeIngredient('comp-2');

  const item = {
    uuid: 'world-item-uuid-v10',
    flags: { core: { sourceId: sourceUuid } },
    name: 'Legacy Item',
    system: { quantity: 1 }
  };

  assert.equal(manager.ingredientMatchesItem(recipe, ingredient, item), true);
});

// ---------------------------------------------------------------------------
// Test 3 — _catalystMatchesItem: _stats.compendiumSource
// ---------------------------------------------------------------------------

test('T3 - _catalystMatchesItem: matches item that only has _stats.compendiumSource', () => {
  const sourceUuid = 'Compendium.world.items.catalyst';
  const system = makeSystem('cat-1', sourceUuid);
  globalThis.game = makeFakeGame({ system });

  const manager = new RecipeManager();
  const recipe = makeRecipe();
  const catalyst = makeCatalyst('cat-1');

  const item = {
    uuid: 'world-catalyst-uuid',
    _stats: { compendiumSource: sourceUuid },
    flags: {},
    name: 'Catalyst Item'
  };

  assert.equal(manager.catalystMatchesItem(recipe, catalyst, item), true);
});

// ---------------------------------------------------------------------------
// Test 4 — _catalystMatchesItem: legacy flags.core.sourceId still works
// ---------------------------------------------------------------------------

test('T4 - _catalystMatchesItem: matches item with only flags.core.sourceId (legacy)', () => {
  const sourceUuid = 'Compendium.world.items.legacycat';
  const system = makeSystem('cat-2', sourceUuid);
  globalThis.game = makeFakeGame({ system });

  const manager = new RecipeManager();
  const recipe = makeRecipe();
  const catalyst = makeCatalyst('cat-2');

  const item = {
    uuid: 'world-catalyst-uuid-v10',
    flags: { core: { sourceId: sourceUuid } },
    name: 'Legacy Catalyst'
  };

  assert.equal(manager.catalystMatchesItem(recipe, catalyst, item), true);
});

// ---------------------------------------------------------------------------
// Test 5 — ingredientMatchesItem does NOT match when source UUIDs differ
// ---------------------------------------------------------------------------

test('T5 - ingredientMatchesItem: no match when compendiumSource differs from component sourceUuid', () => {
  const system = makeSystem('comp-5', 'Compendium.world.items.correct');
  globalThis.game = makeFakeGame({ system });

  const manager = new RecipeManager();
  const recipe = makeRecipe();
  const ingredient = makeIngredient('comp-5');

  const item = {
    uuid: 'world-item-wrong',
    _stats: { compendiumSource: 'Compendium.world.items.wrong' },
    flags: {},
    name: 'Wrong Item',
    system: { quantity: 1 }
  };

  assert.equal(manager.ingredientMatchesItem(recipe, ingredient, item), false);
});

// ---------------------------------------------------------------------------
// Test 6 — _catalystMatchesItem does NOT match when source UUIDs differ
// ---------------------------------------------------------------------------

test('T6 - _catalystMatchesItem: no match when compendiumSource differs from component sourceUuid', () => {
  const system = makeSystem('cat-6', 'Compendium.world.items.correct');
  globalThis.game = makeFakeGame({ system });

  const manager = new RecipeManager();
  const recipe = makeRecipe();
  const catalyst = makeCatalyst('cat-6');

  const item = {
    uuid: 'world-wrong',
    _stats: { compendiumSource: 'Compendium.world.items.wrong' },
    flags: {},
    name: 'Wrong Catalyst'
  };

  assert.equal(manager.catalystMatchesItem(recipe, catalyst, item), false);
});

test('T7 - ingredientMatchesItem: matches canonical sourceItemUuid when live sourceUuid differs', () => {
  const system = makeSystemWithComponent({
    id: 'comp-7',
    sourceUuid: 'Compendium.world.items.iron-ore-live',
    sourceItemUuid: 'Compendium.source.items.iron-ore',
    name: 'Iron Ore'
  });
  globalThis.game = makeFakeGame({ system });

  const manager = new RecipeManager();
  const recipe = makeRecipe();
  const ingredient = makeIngredient('comp-7');

  const item = {
    uuid: 'Item.actor-owned-iron-ore',
    _stats: { compendiumSource: 'Compendium.source.items.iron-ore' },
    flags: {},
    name: 'Iron Ore',
    system: { quantity: 1 }
  };

  assert.equal(manager.ingredientMatchesItem(recipe, ingredient, item), true);
});
