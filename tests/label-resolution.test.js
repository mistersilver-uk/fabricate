/**
 * Tests for T-090: Recipe Display Labels and Icon Fallbacks
 *
 * Covers:
 *   TC1: resolveComponentName — valid managed component returns component.name
 *   TC2: resolveComponentName — missing component returns localized fallback
 *   TC3: resolveComponentName — component with sourceUuid resolves via fromUuid
 *   TC4: resolveComponentImg — valid component with img returns component.img
 *   TC5: resolveComponentImg — missing component returns fallback icon
 *   TC6: Ingredient states return resolved component names (not "managed item")
 *   TC7: Tool states return resolved names (not undefined)
 *   TC8: Result description resolution via resolveComponentName
 *   TC9: Recipe icon fallback — custom img passes through unchanged
 *   TC10: Recipe icon fallback — default bag icon falls back to linked item img
 *   TC11: Recipe icon fallback — no linked item falls back to document icon
 *   TC12: Graceful degradation for broken sourceUuid references
 *   TC13: resolveComponentName — component with no sourceUuid falls back to name match
 */
import test from 'node:test';
import assert from 'node:assert/strict';

// ---------------------------------------------------------------------------
// Foundry globals required for module load
// ---------------------------------------------------------------------------

function getProperty(object, path) {
  if (!object || !path) return undefined;
  return String(path).split('.').reduce((v, k) => (v == null ? undefined : v[k]), object);
}

let _idCounter = 0;
globalThis.foundry = {
  utils: {
    randomID: () => `id-${++_idCounter}`,
    getProperty
  },
  applications: {
    api: {
      HandlebarsApplicationMixin: (Base) => class extends Base {},
      ApplicationV2: class { async _prepareContext() { return {}; } close() {} }
    }
  }
};
globalThis.game = { user: { isGM: true, name: 'Test' }, fabricate: null };
globalThis.ui = { notifications: { info: () => {}, warn: () => {}, error: () => {} } };
globalThis.ChatMessage = { create: () => {}, getSpeaker: () => ({}) };

// ---------------------------------------------------------------------------
// Imports — must come after globals
// ---------------------------------------------------------------------------

const { RecipeManager } = await import('../src/systems/RecipeManager.js');
const { Recipe } = await import('../src/models/Recipe.js');
const { IngredientSet } = await import('../src/models/IngredientSet.js');
const { Ingredient } = await import('../src/models/Ingredient.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSystem(components = [], tools = []) {
  return {
    id: 'sys-1',
    advancedOptionsEnabled: false,
    features: {},
    components,
    tools
  };
}

function makeComponent(id, name, img = null, sourceUuid = null) {
  return { id, name, img, sourceUuid };
}

function makeRecipeWithSystem(systemId = 'sys-1', extras = {}) {
  return new Recipe({
    name: 'Test Recipe',
    craftingSystemId: systemId,
    ingredientSets: [],
    results: [],
    ...extras
  });
}

function makeSystemManager(system) {
  return {
    getSystem: (id) => (id === system.id ? system : null)
  };
}

function setupGame(system) {
  const systemManager = makeSystemManager(system);
  globalThis.game = {
    user: { isGM: true, name: 'Test' },
    fabricate: {
      getCraftingSystemManager: () => systemManager
    }
  };
}

function teardownGame() {
  globalThis.game = { user: { isGM: true, name: 'Test' }, fabricate: null };
}

// ---------------------------------------------------------------------------
// TC1: resolveComponentName — known component returns its name
// ---------------------------------------------------------------------------

test('TC1: resolveComponentName returns component name for known component', () => {
  const component = makeComponent('comp-1', 'Iron Ore');
  const system = makeSystem([component]);
  setupGame(system);

  const manager = new RecipeManager();
  const recipe = makeRecipeWithSystem('sys-1');

  const result = manager.resolveComponentName(recipe, 'comp-1');
  assert.equal(result, 'Iron Ore');

  teardownGame();
});

// ---------------------------------------------------------------------------
// TC2: resolveComponentName — missing component returns localized fallback
// ---------------------------------------------------------------------------

test('TC2: resolveComponentName returns fallback for unknown component', () => {
  const system = makeSystem([]);
  setupGame(system);

  const manager = new RecipeManager();
  const recipe = makeRecipeWithSystem('sys-1');

  const result = manager.resolveComponentName(recipe, 'no-such-comp');
  assert.equal(typeof result, 'string');
  assert.ok(result.length > 0, 'Fallback should be non-empty string');

  teardownGame();
});

// ---------------------------------------------------------------------------
// TC3: resolveComponentName — component with sourceUuid resolves via fromUuid
// ---------------------------------------------------------------------------

test('TC3: resolveComponentName uses fromUuid when component has sourceUuid', async () => {
  const component = makeComponent('comp-uuid-1', 'Fallback Name', null, 'World.Item.abc123');
  const system = makeSystem([component]);
  setupGame(system);

  // Mock fromUuid to return item with a known name
  globalThis.fromUuid = async (uuid) => {
    if (uuid === 'World.Item.abc123') return { name: 'Resolved Iron Ore', img: 'icons/iron.png' };
    return null;
  };

  const manager = new RecipeManager();
  const recipe = makeRecipeWithSystem('sys-1');

  const result = await manager.resolveComponentNameAsync(recipe, 'comp-uuid-1');
  assert.equal(result, 'Resolved Iron Ore');

  delete globalThis.fromUuid;
  teardownGame();
});

// ---------------------------------------------------------------------------
// TC4: resolveComponentImg — valid component with img returns component.img
// ---------------------------------------------------------------------------

test('TC4: resolveComponentImg returns component.img when available', () => {
  const component = makeComponent('comp-2', 'Iron Ore', 'icons/ore.png');
  const system = makeSystem([component]);
  setupGame(system);

  const manager = new RecipeManager();
  const recipe = makeRecipeWithSystem('sys-1');

  const result = manager.resolveComponentImg(recipe, 'comp-2');
  assert.equal(result, 'icons/ore.png');

  teardownGame();
});

// ---------------------------------------------------------------------------
// TC5: resolveComponentImg — missing component returns fallback icon
// ---------------------------------------------------------------------------

test('TC5: resolveComponentImg returns fallback for unknown component', () => {
  const system = makeSystem([]);
  setupGame(system);

  const manager = new RecipeManager();
  const recipe = makeRecipeWithSystem('sys-1');

  const result = manager.resolveComponentImg(recipe, 'no-such-comp');
  assert.equal(typeof result, 'string');
  assert.ok(result.length > 0);

  teardownGame();
});

// ---------------------------------------------------------------------------
// TC6: Ingredient states return resolved component names (not "managed item")
// ---------------------------------------------------------------------------

test('TC6: _buildIngredientStates resolves component names instead of "managed item"', () => {
  const component = makeComponent('comp-3', 'Dragon Scale');
  const system = makeSystem([component]);
  setupGame(system);

  const manager = new RecipeManager();
  const recipe = makeRecipeWithSystem('sys-1');

  const ingredient = new Ingredient({ match: { type: 'component', componentId: 'comp-3' }, quantity: 2 });
  const ingredientSet = IngredientSet.fromJSON({
    ingredientGroups: [{ id: 'grp-1', options: [ingredient.toJSON()] }]
  });

  // Simulate a missing selection (ingredient not found, forces isMissing path)
  const missingGroups = [{ group: ingredientSet.ingredientGroups[0], ingredient, have: 0, need: 2 }];
  const selection = { success: false, missingGroups, selectedIngredients: [] };

  const states = manager._buildIngredientStates(recipe, ingredientSet, selection, []);
  assert.equal(states.length, 1);
  assert.ok(!states[0].description.includes('managed item'),
    `Expected no "managed item" in description, got: "${states[0].description}"`);
  assert.ok(states[0].description.includes('Dragon Scale'),
    `Expected "Dragon Scale" in description, got: "${states[0].description}"`);

  teardownGame();
});

// ---------------------------------------------------------------------------
// TC7: Tool states return resolved names (not undefined)
// ---------------------------------------------------------------------------

test('TC7: evaluateCraftability resolves tool names (not undefined)', () => {
  const component = makeComponent('cat-comp-1', 'Mortar and Pestle');
  const system = makeSystem([component], [{ id: 'tool-mortar', componentId: 'cat-comp-1', enabled: true }]);
  setupGame(system);

  const manager = new RecipeManager();
  const recipe = new Recipe({
    craftingSystemId: 'sys-1',
    name: 'Tool Recipe',
    toolIds: ['tool-mortar'],
    ingredientSets: [{ ingredientGroups: [] }]
  });

  // Actor with no items — tool will be "unavailable"
  const actor = { items: new Map() };
  const result = manager.evaluateCraftability([actor], recipe);

  assert.equal(result.toolStates.length, 1);
  const toolState = result.toolStates[0];
  assert.ok(toolState.name !== undefined, 'Tool name should not be undefined');
  assert.equal(toolState.name, 'Mortar and Pestle');

  teardownGame();
});

// ---------------------------------------------------------------------------
// TC8: Result description resolution uses component name
// ---------------------------------------------------------------------------

test('TC8: resolveResultDescription returns component name instead of "Nx item"', () => {
  const component = makeComponent('res-comp-1', 'Health Potion');
  const system = makeSystem([component]);
  setupGame(system);

  const manager = new RecipeManager();
  const recipe = makeRecipeWithSystem('sys-1');

  const description = manager.resolveResultDescription(recipe, 'res-comp-1', 2);
  assert.ok(!description.includes('item'),
    `Expected no generic "item" in description, got: "${description}"`);
  assert.ok(description.includes('Health Potion'),
    `Expected "Health Potion" in description, got: "${description}"`);
  assert.ok(description.startsWith('2x'), `Expected "2x" prefix, got: "${description}"`);

  teardownGame();
});

// ---------------------------------------------------------------------------
// TC9: Recipe icon fallback — custom img passes through unchanged
// ---------------------------------------------------------------------------

test('TC9: _resolveRecipeIcon returns custom recipe img unchanged', () => {
  const manager = new RecipeManager();
  const recipe = makeRecipeWithSystem('sys-1', { img: 'icons/custom/potion.png' });

  const icon = manager.resolveRecipeIcon(recipe);
  assert.equal(icon, 'icons/custom/potion.png');
});

// ---------------------------------------------------------------------------
// TC10: Recipe icon fallback — default bag icon falls back to linked item img
// ---------------------------------------------------------------------------

test('TC10: _resolveRecipeIcon falls back to linked item when img is default bag', async () => {
  // Recipe uses the default bag icon but has a linked item
  const manager = new RecipeManager();
  const recipe = makeRecipeWithSystem('sys-1', {
    img: 'icons/svg/item-bag.svg',
    linkedRecipeItemUuid: 'World.Item.linked123'
  });

  globalThis.fromUuid = async (uuid) => {
    if (uuid === 'World.Item.linked123') return { name: 'Linked Recipe', img: 'icons/linked-recipe.png' };
    return null;
  };

  const icon = await manager.resolveRecipeIconAsync(recipe);
  assert.equal(icon, 'icons/linked-recipe.png');

  delete globalThis.fromUuid;
});

// ---------------------------------------------------------------------------
// TC11: Recipe icon fallback — no linked item falls back to document icon
// ---------------------------------------------------------------------------

test('TC11: _resolveRecipeIconAsync falls back to document icon when no linked item', async () => {
  const manager = new RecipeManager();
  const recipe = makeRecipeWithSystem('sys-1', {
    img: 'icons/svg/item-bag.svg',
    linkedRecipeItemUuid: null
  });

  const icon = await manager.resolveRecipeIconAsync(recipe);
  assert.ok(typeof icon === 'string' && icon.length > 0);
  assert.ok(icon !== 'icons/svg/item-bag.svg', 'Should not return default bag icon as final result');
});

// ---------------------------------------------------------------------------
// TC12: Graceful degradation for broken sourceUuid references
// ---------------------------------------------------------------------------

test('TC12: resolveComponentNameAsync handles broken fromUuid gracefully', async () => {
  const component = makeComponent('broken-comp', 'Fallback Name', null, 'World.Item.broken');
  const system = makeSystem([component]);
  setupGame(system);

  // fromUuid throws to simulate broken reference
  globalThis.fromUuid = async () => { throw new Error('Item not found'); };

  const manager = new RecipeManager();
  const recipe = makeRecipeWithSystem('sys-1');

  const result = await manager.resolveComponentNameAsync(recipe, 'broken-comp');
  // Should fall back to component.name or localized fallback, not throw
  assert.equal(typeof result, 'string');
  assert.ok(result.length > 0);

  delete globalThis.fromUuid;
  teardownGame();
});

// ---------------------------------------------------------------------------
// TC13: resolveComponentName — component with no sourceUuid returns component.name
// ---------------------------------------------------------------------------

test('TC13: resolveComponentName returns component.name when no sourceUuid', () => {
  const component = makeComponent('comp-nosrc', 'Silver Ingot', null, null);
  const system = makeSystem([component]);
  setupGame(system);

  const manager = new RecipeManager();
  const recipe = makeRecipeWithSystem('sys-1');

  const result = manager.resolveComponentName(recipe, 'comp-nosrc');
  assert.equal(result, 'Silver Ingot');

  teardownGame();
});
