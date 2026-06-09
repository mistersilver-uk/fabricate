/**
 * Tests for T-097: Runtime fallback item ID matching in RecipeManager.
 *
 * Validates that ingredientMatchesItem() and toolMatchesItem() honor
 * fallbackItemIds between the primary UUID check and name fallback.
 *
 * Tests:
 *   1. Primary UUID matches — existing behaviour unchanged
 *   2. Fallback ID matches when primary UUID fails (ingredient)
 *   3. Fallback ID checked for tools
 *   4. Name match still works as last resort (no sourceUuid, no fallbacks)
 *   5. Legacy UUID-only workflows unchanged (no fallbackItemIds field)
 */

import test from 'node:test';
import assert from 'node:assert/strict';

// ---------------------------------------------------------------------------
// Foundry global stubs
// ---------------------------------------------------------------------------

let _idCounter = 0;
globalThis.foundry = {
  utils: {
    randomID: () => `id-${++_idCounter}`,
    getProperty: (obj, path) => {
      return path.split('.').reduce((o, k) => o?.[k], obj) ?? undefined;
    }
  }
};
globalThis.game = {
  fabricate: null // set per-test
};
globalThis.ui = { notifications: { info() {}, warn() {}, error() {} } };

// ---------------------------------------------------------------------------
// Module imports
// ---------------------------------------------------------------------------

const { RecipeManager } = await import('../src/systems/RecipeManager.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a minimal managed component (system item).
 */
function makeComponent({ id = 'comp1', name = 'Iron Ore', sourceUuid = null, fallbackItemIds = [] } = {}) {
  return { id, name, sourceUuid, sourceItemUuid: sourceUuid, fallbackItemIds };
}

/**
 * Build a mock actor item (world item).
 */
function makeItem({ uuid = 'Item.abc123', name = 'Iron Ore', compendiumSource = null, flagSourceId = null } = {}) {
  return {
    uuid,
    name,
    _stats: compendiumSource ? { compendiumSource } : {},
    flags: flagSourceId ? { core: { sourceId: flagSourceId } } : {}
  };
}

/**
 * Build a minimal recipe with one component ingredient.
 */
function makeRecipe({ craftingSystemId = 'sys1', componentId = 'comp1' } = {}) {
  return {
    craftingSystemId,
    ingredientSets: [],
    resultGroups: [],
    validate: () => ({ valid: true, errors: [] })
  };
}

/**
 * Build a minimal tool referencing a component.
 */
function makeTool({ componentId = 'comp1' } = {}) {
  return { componentId };
}

/**
 * Build a minimal ingredient referencing a component.
 */
function makeIngredient({ componentId = 'comp1', quantity = 1 } = {}) {
  return {
    componentId,
    quantity,
    match: { type: 'component', componentId },
    getDescription: () => 'test ingredient'
  };
}

/**
 * Set up game.fabricate mock with a specific component for a system.
 */
function setupGameFabricate(component) {
  globalThis.game.fabricate = {
    getCraftingSystemManager: () => ({
      getSystem: (sysId) => ({
        id: sysId,
        advancedOptionsEnabled: true,
        features: { itemTags: false, essences: false },
        components: [component],
        managedItems: [component],
        items: [component]
      })
    }),
    getResolutionModeService: () => null
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('T-097: primary UUID matches — existing behaviour unchanged', () => {
  const component = makeComponent({
    id: 'comp1',
    sourceUuid: 'Compendium.world.items.iron-ore',
    fallbackItemIds: ['Compendium.world.items.old-iron-ore']
  });
  setupGameFabricate(component);

  const recipeManager = new RecipeManager();
  const recipe = makeRecipe({ craftingSystemId: 'sys1', componentId: 'comp1' });
  const ingredient = makeIngredient({ componentId: 'comp1' });

  // Item with the primary UUID
  const item = makeItem({ uuid: 'Compendium.world.items.iron-ore', name: 'Iron Ore' });

  assert.ok(recipeManager.ingredientMatchesItem(recipe, ingredient, item),
    'Should match via primary sourceUuid');
});

test('T-097: fallback ID matches when primary UUID fails (ingredient)', () => {
  const component = makeComponent({
    id: 'comp1',
    sourceUuid: 'Compendium.world.items.new-iron-ore', // different from item's uuid
    fallbackItemIds: ['Compendium.world.items.old-iron-ore'] // matches item
  });
  setupGameFabricate(component);

  const recipeManager = new RecipeManager();
  const recipe = makeRecipe({ craftingSystemId: 'sys1', componentId: 'comp1' });
  const ingredient = makeIngredient({ componentId: 'comp1' });

  // Item whose uuid is NOT the primary but IS a fallback
  const item = makeItem({
    uuid: 'Compendium.world.items.old-iron-ore',
    name: 'Iron Ore'
  });

  assert.ok(recipeManager.ingredientMatchesItem(recipe, ingredient, item),
    'Should match via fallbackItemIds when primary UUID fails');
});

test('T-097: fallback ID checked for tools', () => {
  const component = makeComponent({
    id: 'mortar',
    name: 'Mortar and Pestle',
    sourceUuid: 'Compendium.world.tools.new-mortar',
    fallbackItemIds: ['Compendium.world.tools.old-mortar']
  });
  setupGameFabricate(component);

  const recipeManager = new RecipeManager();
  const recipe = makeRecipe({ craftingSystemId: 'sys1' });
  const tool = makeTool({ componentId: 'mortar' });

  // Item with old compendium source that matches fallback
  const item = makeItem({
    uuid: 'Item.actor-owned-mortar',
    name: 'Mortar and Pestle',
    compendiumSource: 'Compendium.world.tools.old-mortar'
  });

  assert.ok(recipeManager.toolMatchesItem(recipe, tool, item),
    'Should match tool via fallbackItemIds using compendium source');
});

test('T-097: name match still works as last resort (no sourceUuid, no fallbacks)', () => {
  const component = makeComponent({
    id: 'comp1',
    name: 'Iron Ore',
    sourceUuid: null,
    fallbackItemIds: []
  });
  setupGameFabricate(component);

  const recipeManager = new RecipeManager();
  const recipe = makeRecipe({ craftingSystemId: 'sys1', componentId: 'comp1' });
  const ingredient = makeIngredient({ componentId: 'comp1' });

  const item = makeItem({ uuid: 'Item.some-id', name: 'Iron Ore' });

  assert.ok(recipeManager.ingredientMatchesItem(recipe, ingredient, item),
    'Should match via name when no sourceUuid and no fallbacks');
});

test('T-097: legacy UUID-only workflows unchanged (no fallbackItemIds field)', () => {
  // Component without fallbackItemIds field at all (legacy data shape)
  const component = {
    id: 'comp1',
    name: 'Coal',
    sourceUuid: 'Compendium.world.items.coal',
    sourceItemUuid: 'Compendium.world.items.coal'
    // no fallbackItemIds
  };
  setupGameFabricate(component);

  const recipeManager = new RecipeManager();
  const recipe = makeRecipe({ craftingSystemId: 'sys1', componentId: 'comp1' });
  const ingredient = makeIngredient({ componentId: 'comp1' });

  // Matching by primary UUID works
  const matchingItem = makeItem({ uuid: 'Compendium.world.items.coal', name: 'Coal' });
  assert.ok(recipeManager.ingredientMatchesItem(recipe, ingredient, matchingItem),
    'Primary UUID match should still work for legacy components');

  // Non-matching item should not match
  const nonMatchingItem = makeItem({ uuid: 'Item.wrong-id', name: 'Wood' });
  assert.equal(recipeManager.ingredientMatchesItem(recipe, ingredient, nonMatchingItem), false,
    'Non-matching item should not match legacy component');
});
