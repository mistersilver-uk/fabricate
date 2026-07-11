/**
 * Integration tests for ingredient/tool/recipe-item matching with _stats.compendiumSource (T-087)
 *
 * Covers:
 *   1. ingredientMatchesItem matches item with only _stats.compendiumSource
 *   2. ingredientMatchesItem still matches item with only flags.core.sourceId (legacy)
 *   3. _toolMatchesItem matches item with only _stats.compendiumSource
 *   4. _toolMatchesItem still matches item with only flags.core.sourceId (legacy)
 *   5. "Craftable only" filtering includes recipe when actor has items matched via _stats.compendiumSource
 *   T7. ingredientMatchesItem matches canonical originItemUuid when the live registeredItemUuid differs
 *   T8. _toolMatchesItem matches an item linked only by _stats.duplicateSource (drag-copied world item)
 *   T9. _toolMatchesItem does NOT match on flags.fabricate.mythwrightId alone
 */

import test from 'node:test';
import assert from 'node:assert/strict';

// ---------------------------------------------------------------------------
// Foundry globals (minimal shim — getCompendiumSourceUuid will use item.flags.core.sourceId
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

// Issue 561: a first-class Tool carries its OWN source refs (derived from its linked
// component at migration/registration). Build the tool that the system exposes so the
// matcher resolves the owned item against the tool's own refs, not through the component.
function toolFromComponent(component) {
  return {
    id: `tool-${component.id}`,
    componentId: component.id,
    // No snapshot name here so the presence name-fallback resolves through the linked
    // component's name (the migrated-tool behaviour), exactly as it did before.
    name: null,
    registeredItemUuid: component.registeredItemUuid || component.originItemUuid || null,
    originItemUuid: component.originItemUuid || component.registeredItemUuid || null,
    aliasItemUuids: Array.isArray(component.aliasItemUuids) ? component.aliasItemUuids : [],
  };
}

// The `tool` argument passed to the matcher; it shares an id with the tool the system
// exposes, so `resolveToolForItem` (which matches against `system.tools`) resolves to it.
function makeTool(componentId) {
  return { id: `tool-${componentId}`, componentId, name: null };
}

function makeRecipe(overrides = {}) {
  return {
    id: 'recipe-1',
    craftingSystemId: 'system-1',
    ingredientSets: [],
    ...overrides
  };
}

/** Build a fake system with one managed component and its first-class tool. */
function makeSystem(componentId, registeredItemUuid, name = 'Test Item') {
  const component = { id: componentId, registeredItemUuid, name };
  return {
    features: {},
    components: [component],
    tools: [toolFromComponent(component)]
  };
}

function makeSystemWithComponent(component) {
  return {
    features: {},
    components: [component],
    tools: [toolFromComponent(component)]
  };
}

// ---------------------------------------------------------------------------
// Test 1 — ingredientMatchesItem: _stats.compendiumSource
// ---------------------------------------------------------------------------

test('T1 - ingredientMatchesItem: matches item that only has _stats.compendiumSource', () => {
  const registeredItemUuid = 'Compendium.world.items.abc';
  const system = makeSystem('comp-1', registeredItemUuid);
  globalThis.game = makeFakeGame({ system });

  const manager = new RecipeManager();
  const recipe = makeRecipe();
  const ingredient = makeIngredient('comp-1');

  // Item has no flags.core.sourceId — only _stats.compendiumSource (Foundry v12+)
  const item = {
    uuid: 'world-item-uuid-different',
    _stats: { compendiumSource: registeredItemUuid },
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
  const registeredItemUuid = 'Compendium.world.items.legacy';
  const system = makeSystem('comp-2', registeredItemUuid);
  globalThis.game = makeFakeGame({ system });

  const manager = new RecipeManager();
  const recipe = makeRecipe();
  const ingredient = makeIngredient('comp-2');

  const item = {
    uuid: 'world-item-uuid-v10',
    flags: { core: { sourceId: registeredItemUuid } },
    name: 'Legacy Item',
    system: { quantity: 1 }
  };

  assert.equal(manager.ingredientMatchesItem(recipe, ingredient, item), true);
});

// ---------------------------------------------------------------------------
// Test 3 — _toolMatchesItem: _stats.compendiumSource
// ---------------------------------------------------------------------------

test('T3 - _toolMatchesItem: matches item that only has _stats.compendiumSource', () => {
  const registeredItemUuid = 'Compendium.world.items.catalyst';
  const system = makeSystem('cat-1', registeredItemUuid);
  globalThis.game = makeFakeGame({ system });

  const manager = new RecipeManager();
  const recipe = makeRecipe();
  const tool = makeTool('cat-1');

  const item = {
    uuid: 'world-catalyst-uuid',
    _stats: { compendiumSource: registeredItemUuid },
    flags: {},
    name: 'Catalyst Item'
  };

  assert.equal(manager.toolMatchesItem(recipe, tool, item), true);
});

// ---------------------------------------------------------------------------
// Test 4 — _toolMatchesItem: legacy flags.core.sourceId still works
// ---------------------------------------------------------------------------

test('T4 - _toolMatchesItem: matches item with only flags.core.sourceId (legacy)', () => {
  const registeredItemUuid = 'Compendium.world.items.legacycat';
  const system = makeSystem('cat-2', registeredItemUuid);
  globalThis.game = makeFakeGame({ system });

  const manager = new RecipeManager();
  const recipe = makeRecipe();
  const tool = makeTool('cat-2');

  const item = {
    uuid: 'world-catalyst-uuid-v10',
    flags: { core: { sourceId: registeredItemUuid } },
    name: 'Legacy Catalyst'
  };

  assert.equal(manager.toolMatchesItem(recipe, tool, item), true);
});

// ---------------------------------------------------------------------------
// Test 5 — ingredientMatchesItem does NOT match when source UUIDs differ
// ---------------------------------------------------------------------------

test('T5 - ingredientMatchesItem: no match when compendiumSource differs from component registeredItemUuid', () => {
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
// Test 6 — _toolMatchesItem does NOT match when source UUIDs differ
// ---------------------------------------------------------------------------

test('T6 - _toolMatchesItem: no match when compendiumSource differs from component registeredItemUuid', () => {
  const system = makeSystem('cat-6', 'Compendium.world.items.correct');
  globalThis.game = makeFakeGame({ system });

  const manager = new RecipeManager();
  const recipe = makeRecipe();
  const tool = makeTool('cat-6');

  const item = {
    uuid: 'world-wrong',
    _stats: { compendiumSource: 'Compendium.world.items.wrong' },
    flags: {},
    name: 'Wrong Catalyst'
  };

  assert.equal(manager.toolMatchesItem(recipe, tool, item), false);
});

// ---------------------------------------------------------------------------
// Test 8 — duplicate-source-only item matches a catalyst via originItemUuid
// ---------------------------------------------------------------------------

test('T8 - toolMatchesItem: matches item linked only by _stats.duplicateSource', () => {
  const system = makeSystemWithComponent({
    id: 'cat-8',
    registeredItemUuid: 'Compendium.world.items.pick-live',
    originItemUuid: 'Item.world-pick',
    name: 'Mining Pick'
  });
  globalThis.game = makeFakeGame({ system });

  const manager = new RecipeManager();
  const recipe = makeRecipe();
  const tool = makeTool('cat-8');

  // Drag-copied world item: compendiumSource null, link only in duplicateSource.
  const item = {
    uuid: 'Item.actor-drag-copy',
    _stats: { compendiumSource: null, duplicateSource: 'Item.world-pick' },
    flags: {},
    name: 'Mining Pick'
  };

  assert.equal(manager.toolMatchesItem(recipe, tool, item), true);
});

// ---------------------------------------------------------------------------
// Test 9 — mythwrightId-only item with an unrelated name does NOT match
// ---------------------------------------------------------------------------

test('T9 - toolMatchesItem: does NOT match on flags.fabricate.mythwrightId with an unrelated name', () => {
  const system = makeSystemWithComponent({
    id: 'cat-9',
    registeredItemUuid: 'Compendium.world.items.pick-live',
    originItemUuid: 'Item.world-pick',
    name: 'Mining Pick'
  });
  globalThis.game = makeFakeGame({ system });

  const manager = new RecipeManager();
  const recipe = makeRecipe();
  const tool = makeTool('cat-9');

  // Neither the source UUIDs nor the name match — a mythwrightId flag alone is not
  // a match signal.
  const item = {
    uuid: 'Item.actor-seeded',
    _stats: {},
    flags: { fabricate: { mythwrightId: 'mw-pick' } },
    name: 'Unrelated Chisel'
  };

  assert.equal(manager.toolMatchesItem(recipe, tool, item), false);
});

test('T9b - toolMatchesItem: matches a same-named item when source UUIDs differ (template-copy fallback)', () => {
  const system = makeSystemWithComponent({
    id: 'cat-9b',
    registeredItemUuid: 'Compendium.world.items.pick-live',
    originItemUuid: 'Item.world-pick',
    name: 'Mining Pick'
  });
  globalThis.game = makeFakeGame({ system });

  const manager = new RecipeManager();
  const recipe = makeRecipe();
  const tool = makeTool('cat-9b');

  // Owned copy whose only source ref is a template, not the tool component's source.
  const item = {
    uuid: 'Item.actor-templated',
    _stats: { duplicateSource: 'Item.some-template' },
    flags: {},
    name: 'Mining Pick'
  };

  assert.equal(manager.toolMatchesItem(recipe, tool, item), true);
});

test('T7 - ingredientMatchesItem: matches canonical originItemUuid when live registeredItemUuid differs', () => {
  const system = makeSystemWithComponent({
    id: 'comp-7',
    registeredItemUuid: 'Compendium.world.items.iron-ore-live',
    originItemUuid: 'Compendium.source.items.iron-ore',
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
