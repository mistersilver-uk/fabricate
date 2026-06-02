/**
 * Tests for Phase B Task 5: Discovered recipes + auto-fill
 * Covers: discoveredRecipes, search/filter, autoFill action, resolveAutoFill pure function.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';

// ---------------------------------------------------------------------------
// Foundry globals
// ---------------------------------------------------------------------------

globalThis.foundry = { utils: { randomID: () => `id-${Math.random().toString(36).slice(2)}` } };
globalThis.game = { user: { id: 'u1', character: null }, actors: [] };
globalThis.ui = { notifications: { info: () => {}, warn: () => {}, error: () => {} } };

// ---------------------------------------------------------------------------
// Store + utility imports
// ---------------------------------------------------------------------------

const { createCraftingStore } = await import('../../src/ui/svelte/stores/craftingStore.js');
const { resolveAutoFill } = await import('../../src/ui/svelte/util/autoFillResolver.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeActor(id, name = `Actor-${id}`) {
  return { id, name, isOwner: true, items: [] };
}

function makeActorWithItems(id, name, items = []) {
  return { id, name, isOwner: true, items };
}

function makeInventoryItem(id, name, quantity = 1, flags = {}) {
  return { id, uuid: `Item.${id}`, name, img: 'item-icon.png', system: { quantity }, flags };
}

function makeComponent(id, name = `Component-${id}`, tags = [], essences = {}) {
  return { id, name, img: `icons/${id}.png`, tags, essences, sourceUuid: `Item.source-${id}` };
}

function makeAlchemySystem(id = 'alchemy-sys', components = [], recipes = []) {
  return {
    id,
    name: `Alchemy System ${id}`,
    resolutionMode: 'alchemy',
    components,
    recipes,
    features: { salvage: false }
  };
}

function makeSimpleSystem(id = 'simple-sys') {
  return { id, name: `Simple System ${id}`, resolutionMode: 'simple', components: [], features: { salvage: false } };
}

function makeIngredientOption(componentId, quantity = 1) {
  return { match: { type: 'component', componentId }, quantity };
}

function makeIngredientGroup(options = [], quantity = 1) {
  return { options, quantity };
}

function makeIngredientSet(groups = [], essences = {}) {
  return { id: `set-${Math.random().toString(36).slice(2)}`, ingredientGroups: groups, essences };
}

function makeAlchemyRecipe(id, craftingSystemId, name = `Recipe-${id}`, ingredientSets = []) {
  return {
    id,
    craftingSystemId,
    name,
    description: `${name} description`,
    img: 'icon.png',
    category: 'alchemy',
    ingredientSets,
    results: [],
    steps: [],
    isSimpleRecipe: () => true,
    getResultDescription: () => 'result'
  };
}

function createMockServices(overrides = {}) {
  const actorA = makeActor('a1', 'Alice');
  const settings = {
    lastCraftingActor: '',
    lastComponentSources: ['a1'],
    lastAlchemySystem: '',
    favouriteRecipes: [],
    recentlyCrafted: [],
  };

  const base = {
    getRecipeManager: () => ({
      getRecipes: () => [],
      getRecipe: () => null,
      evaluateCraftability: () => ({
        canCraft: false,
        satisfiableSet: null,
        missing: { ingredients: [], essences: [], catalysts: [] },
        ingredientStates: [],
        essenceStates: [],
        catalystStates: []
      })
    }),
    getRecipeVisibilityService: () => null,
    getCraftingRunManager: () => ({ getActiveRuns: () => [], getRunHistory: () => [] }),
    getCraftingEngine: () => null,
    getCraftingSystemManager: () => null,
    getSetting: (key) => settings[key] ?? null,
    setSetting: async (key, value) => { settings[key] = value; },
    getAvailableActors: () => [actorA],
    getOwnedActors: () => [actorA],
    getGameUser: () => ({ id: 'u1', character: actorA, isGM: false }),
    getWorldTime: () => 0,
    notify: { info: () => {}, warn: () => {}, error: () => {} },
    confirmDialog: async () => true
  };

  return { ...base, ...overrides };
}

// ============================================================================
// resolveAutoFill pure function tests
// ============================================================================

test('resolveAutoFill returns empty entries when recipe has no ingredient sets', () => {
  const recipe = makeAlchemyRecipe('r1', 'a1', 'Test', []);
  const result = resolveAutoFill(recipe, [], [], () => new Set());
  assert.deepEqual(result.entries, []);
  assert.deepEqual(result.unfulfilled, []);
});

test('auto-fill with single ingredient set fully satisfiable', () => {
  const comp = makeComponent('iron-ore', 'Iron Ore');
  const palette = [{ componentId: 'iron-ore', name: 'Iron Ore', img: 'icons/iron-ore.png', inventoryQuantity: 3 }];
  const group = makeIngredientGroup([makeIngredientOption('iron-ore')], 2);
  const set = makeIngredientSet([group]);
  const recipe = makeAlchemyRecipe('r1', 'a1', 'Iron Recipe', [set]);

  const expandGroupFn = (g) => {
    const ids = new Set();
    for (const opt of g.options || []) {
      if (opt.match?.componentId) ids.add(opt.match.componentId);
    }
    return ids;
  };

  const result = resolveAutoFill(recipe, [comp], palette, expandGroupFn);
  assert.equal(result.unfulfilled.length, 0);
  assert.equal(result.entries.length, 1);
  assert.equal(result.entries[0].componentId, 'iron-ore');
  assert.equal(result.entries[0].quantity, 2);
});

test('auto-fill with partially satisfiable set fills what is possible and reports unfulfilled', () => {
  const comp = makeComponent('iron-ore', 'Iron Ore');
  const palette = [{ componentId: 'iron-ore', name: 'Iron Ore', img: 'icons/iron-ore.png', inventoryQuantity: 1 }];

  const group1 = makeIngredientGroup([makeIngredientOption('iron-ore')], 1);
  const group2 = makeIngredientGroup([makeIngredientOption('rare-gem')], 1); // not in palette
  const set = makeIngredientSet([group1, group2]);
  const recipe = makeAlchemyRecipe('r1', 'a1', 'Mixed Recipe', [set]);

  const expandGroupFn = (g) => {
    const ids = new Set();
    for (const opt of g.options || []) {
      if (opt.match?.componentId) ids.add(opt.match.componentId);
    }
    return ids;
  };

  const result = resolveAutoFill(recipe, [comp], palette, expandGroupFn);
  assert.equal(result.entries.length, 1);
  assert.equal(result.entries[0].componentId, 'iron-ore');
  assert.equal(result.unfulfilled.length, 1);
});

test('auto-fill with no available components reports all unfulfilled', () => {
  const comp = makeComponent('iron-ore', 'Iron Ore');
  const palette = [{ componentId: 'iron-ore', name: 'Iron Ore', img: 'icons/iron-ore.png', inventoryQuantity: 0 }];

  const group = makeIngredientGroup([makeIngredientOption('iron-ore')], 1);
  const set = makeIngredientSet([group]);
  const recipe = makeAlchemyRecipe('r1', 'a1', 'Iron Recipe', [set]);

  const expandGroupFn = (g) => {
    const ids = new Set();
    for (const opt of g.options || []) {
      if (opt.match?.componentId) ids.add(opt.match.componentId);
    }
    return ids;
  };

  const result = resolveAutoFill(recipe, [comp], palette, expandGroupFn);
  assert.equal(result.entries.length, 0);
  assert.equal(result.unfulfilled.length, 1);
});

test('resolveAutoFill uses first fully satisfiable set when multiple sets exist', () => {
  const comp1 = makeComponent('iron-ore', 'Iron Ore');
  const comp2 = makeComponent('coal', 'Coal');
  const palette = [
    { componentId: 'iron-ore', name: 'Iron Ore', img: null, inventoryQuantity: 0 },
    { componentId: 'coal', name: 'Coal', img: null, inventoryQuantity: 5 }
  ];

  // Set 1: needs iron-ore (not available)
  const set1 = makeIngredientSet([makeIngredientGroup([makeIngredientOption('iron-ore')], 1)]);
  // Set 2: needs coal (available)
  const set2 = makeIngredientSet([makeIngredientGroup([makeIngredientOption('coal')], 2)]);
  const recipe = makeAlchemyRecipe('r1', 'a1', 'Multi Recipe', [set1, set2]);

  const expandGroupFn = (g) => {
    const ids = new Set();
    for (const opt of g.options || []) {
      if (opt.match?.componentId) ids.add(opt.match.componentId);
    }
    return ids;
  };

  const result = resolveAutoFill(recipe, [comp1, comp2], palette, expandGroupFn);
  assert.equal(result.unfulfilled.length, 0);
  assert.equal(result.entries.length, 1);
  assert.equal(result.entries[0].componentId, 'coal');
  assert.equal(result.entries[0].quantity, 2);
});

test('resolveAutoFill uses best partial set when none fully satisfiable', () => {
  const palette = [
    { componentId: 'iron-ore', name: 'Iron Ore', img: null, inventoryQuantity: 1 },
    { componentId: 'coal', name: 'Coal', img: null, inventoryQuantity: 1 }
  ];

  // Set 1: needs iron-ore (1 available) + rare-gem (not available) — 1 unfulfilled
  const set1 = makeIngredientSet([
    makeIngredientGroup([makeIngredientOption('iron-ore')], 1),
    makeIngredientGroup([makeIngredientOption('rare-gem')], 1)
  ]);
  // Set 2: needs iron-ore + coal + magic-herb (not available) — 2 unfulfilled
  const set2 = makeIngredientSet([
    makeIngredientGroup([makeIngredientOption('iron-ore')], 1),
    makeIngredientGroup([makeIngredientOption('coal')], 1),
    makeIngredientGroup([makeIngredientOption('magic-herb')], 1)
  ]);
  const recipe = makeAlchemyRecipe('r1', 'a1', 'Hard Recipe', [set1, set2]);

  const expandGroupFn = (g) => {
    const ids = new Set();
    for (const opt of g.options || []) {
      if (opt.match?.componentId) ids.add(opt.match.componentId);
    }
    return ids;
  };

  const result = resolveAutoFill(recipe, [], palette, expandGroupFn);
  // Should pick set1 (1 unfulfilled) over set2 (2 unfulfilled)
  assert.equal(result.unfulfilled.length, 1);
  assert.equal(result.entries.length, 1);
  assert.equal(result.entries[0].componentId, 'iron-ore');
});

// ============================================================================
// Store-level: discoveredRecipes
// ============================================================================

test('discovered recipes shows only learned recipes for non-GM', async () => {
  const comp = makeComponent('iron-ore', 'Iron Ore');
  const alchemy = makeAlchemySystem('a1', [comp]);
  const recipe1 = makeAlchemyRecipe('r1', 'a1', 'Known Recipe');
  const recipe2 = makeAlchemyRecipe('r2', 'a1', 'Unknown Recipe');
  // Actor with learnedRecipes flag: only r1 is learned
  const actorA = {
    id: 'a1',
    name: 'Alice',
    isOwner: true,
    items: [],
    flags: { fabricate: { learnedRecipes: { 'r1': true } } }
  };

  const services = createMockServices({
    getCraftingSystemManager: () => ({
      getSystems: () => [alchemy],
      getRecipesForSystem: (id) => id === 'a1' ? [recipe1, recipe2] : []
    }),
    getAvailableActors: () => [actorA],
    getOwnedActors: () => [actorA],
    getGameUser: () => ({ id: 'u1', character: actorA, isGM: false }),
    getSetting: (key) => {
      if (key === 'lastComponentSources') return ['a1'];
      if (key === 'lastAlchemySystem') return 'a1';
      return null;
    }
  });

  const store = createCraftingStore(services);
  await store.refresh();

  const discovered = get(store.discoveredRecipes);
  assert.equal(discovered.length, 1, 'non-GM should only see learned recipes');
  assert.equal(discovered[0].id, 'r1', 'should see the learned recipe');
});

test('discovered recipes marks learned essence-only recipe uncraftable when essences are missing', async () => {
  const alchemy = makeAlchemySystem('a1', []);
  const recipe = makeAlchemyRecipe(
    'r1',
    'a1',
    'Restorative Potion',
    [makeIngredientSet([], { restorative: 2 })]
  );
  const actorA = {
    id: 'a1',
    name: 'Alice',
    isOwner: true,
    items: [],
    flags: { fabricate: { learnedRecipes: { r1: true } } }
  };

  const services = createMockServices({
    getCraftingSystemManager: () => ({
      getSystems: () => [alchemy],
      getRecipesForSystem: (id) => id === 'a1' ? [recipe] : []
    }),
    getAvailableActors: () => [actorA],
    getOwnedActors: () => [actorA],
    getGameUser: () => ({ id: 'u1', character: actorA, isGM: false }),
    getSetting: (key) => {
      if (key === 'lastComponentSources') return ['a1'];
      if (key === 'lastAlchemySystem') return 'a1';
      return null;
    }
  });

  const store = createCraftingStore(services);
  await store.refresh();

  const discovered = get(store.discoveredRecipes);
  assert.equal(discovered.length, 1);
  assert.equal(discovered[0].id, 'r1');
  assert.equal(
    discovered[0].canCraft,
    false,
    'essence-only recipe should not be craftable when required essences are missing'
  );

  store.toggleDiscoveredCraftableOnly();
  assert.deepEqual(
    get(store.discoveredRecipes),
    [],
    'craftable-only filter should hide a learned recipe whose essence requirement is unmet'
  );
});

test('discovered recipes counts component-defined essences for pure-essence recipes', async () => {
  const comp = makeComponent('red-herb', 'Red Herb', [], { restorative: 1 });
  const alchemy = makeAlchemySystem('a1', [comp]);
  const recipe = makeAlchemyRecipe(
    'r1',
    'a1',
    'Restorative Potion',
    [makeIngredientSet([], { restorative: 2 })]
  );
  const invItem = makeInventoryItem('item1', 'Red Herb', 2, { core: { sourceId: 'Item.source-red-herb' } });
  const actorA = makeActorWithItems('a1', 'Alice', [invItem]);

  const services = createMockServices({
    getCraftingSystemManager: () => ({
      getSystems: () => [alchemy],
      getRecipesForSystem: (id) => id === 'a1' ? [recipe] : []
    }),
    getAvailableActors: () => [actorA],
    getOwnedActors: () => [actorA],
    getGameUser: () => ({ id: 'u1', character: actorA, isGM: true }),
    getSetting: (key) => {
      if (key === 'lastComponentSources') return ['a1'];
      if (key === 'lastAlchemySystem') return 'a1';
      return null;
    }
  });

  const store = createCraftingStore(services);
  await store.refresh();

  const discovered = get(store.discoveredRecipes);
  assert.equal(discovered.length, 1);
  assert.equal(discovered[0].canCraft, true);
});

test('discovered recipes uses item-flag essences before component fallback', async () => {
  const comp = makeComponent('red-herb', 'Red Herb', [], { restorative: 5 });
  const alchemy = makeAlchemySystem('a1', [comp]);
  const recipe = makeAlchemyRecipe(
    'r1',
    'a1',
    'Restorative Potion',
    [makeIngredientSet([], { restorative: 2 })]
  );
  const flaggedItem = {
    id: 'item1',
    uuid: 'Item.item1',
    name: 'Red Herb',
    img: 'item-icon.png',
    system: { quantity: 1 },
    flags: { core: { sourceId: 'Item.source-red-herb' } },
    getFlag: (scope, key) => {
      if (scope === 'fabricate' && key === 'fabricate.essences') return { restorative: 1 };
      return undefined;
    }
  };
  const actorA = makeActorWithItems('a1', 'Alice', [flaggedItem]);

  const services = createMockServices({
    getCraftingSystemManager: () => ({
      getSystems: () => [alchemy],
      getRecipesForSystem: (id) => id === 'a1' ? [recipe] : []
    }),
    getAvailableActors: () => [actorA],
    getOwnedActors: () => [actorA],
    getGameUser: () => ({ id: 'u1', character: actorA, isGM: true }),
    getSetting: (key) => {
      if (key === 'lastComponentSources') return ['a1'];
      if (key === 'lastAlchemySystem') return 'a1';
      return null;
    }
  });

  const store = createCraftingStore(services);
  await store.refresh();

  const discovered = get(store.discoveredRecipes);
  assert.equal(discovered.length, 1);
  assert.equal(
    discovered[0].canCraft,
    false,
    'item flag essence should override larger component fallback'
  );
});

// ============================================================================
// Store-level: discoveredRecipes derivation (integration)
// ============================================================================

test('store exports discoveredRecipes, discoveredRecipeSearch, discoveredCraftableOnly', () => {
  const services = createMockServices();
  const store = createCraftingStore(services);

  assert.ok('discoveredRecipes' in store, 'discoveredRecipes should be exported');
  assert.ok('discoveredRecipeSearch' in store, 'discoveredRecipeSearch should be exported');
  assert.ok('discoveredCraftableOnly' in store, 'discoveredCraftableOnly should be exported');
  assert.ok(typeof store.setDiscoveredRecipeSearch === 'function', 'setDiscoveredRecipeSearch should be exported');
  assert.ok(typeof store.toggleDiscoveredCraftableOnly === 'function', 'toggleDiscoveredCraftableOnly should be exported');
  assert.ok(typeof store.autoFill === 'function', 'autoFill should be exported');
});

test('discoveredRecipeSearch defaults to empty string', () => {
  const services = createMockServices();
  const store = createCraftingStore(services);

  assert.equal(get(store.discoveredRecipeSearch), '');
});

test('discoveredCraftableOnly defaults to false', () => {
  const services = createMockServices();
  const store = createCraftingStore(services);

  assert.equal(get(store.discoveredCraftableOnly), false);
});

test('setDiscoveredRecipeSearch updates the search term', () => {
  const services = createMockServices();
  const store = createCraftingStore(services);

  store.setDiscoveredRecipeSearch('potion');
  assert.equal(get(store.discoveredRecipeSearch), 'potion');
});

test('toggleDiscoveredCraftableOnly flips the filter', () => {
  const services = createMockServices();
  const store = createCraftingStore(services);

  assert.equal(get(store.discoveredCraftableOnly), false);
  store.toggleDiscoveredCraftableOnly();
  assert.equal(get(store.discoveredCraftableOnly), true);
  store.toggleDiscoveredCraftableOnly();
  assert.equal(get(store.discoveredCraftableOnly), false);
});

test('discoveredRecipes is empty when no alchemy system selected', async () => {
  const simple = makeSimpleSystem('s1');

  const services = createMockServices({
    getCraftingSystemManager: () => ({ getSystems: () => [simple] })
  });

  const store = createCraftingStore(services);
  await store.refresh();

  const discovered = get(store.discoveredRecipes);
  assert.deepEqual(discovered, []);
});

test('autoFill clears workbench before populating', async () => {
  const comp = makeComponent('iron-ore', 'Iron Ore');
  const alchemy = makeAlchemySystem('a1', [comp]);
  const invItem = makeInventoryItem('item1', 'Iron Ore', 5, { core: { sourceId: 'Item.source-iron-ore' } });
  const actorA = makeActorWithItems('a1', 'Alice', [invItem]);

  const group = makeIngredientGroup([makeIngredientOption('iron-ore')], 1);
  const set = makeIngredientSet([group]);
  const recipe = makeAlchemyRecipe('r1', 'a1', 'Iron Recipe', [set]);

  const services = createMockServices({
    getCraftingSystemManager: () => ({
      getSystems: () => [alchemy],
      getRecipesForSystem: (id) => id === 'a1' ? [recipe] : []
    }),
    getAvailableActors: () => [actorA],
    getOwnedActors: () => [actorA],
    getSetting: (key) => {
      if (key === 'lastComponentSources') return ['a1'];
      if (key === 'lastAlchemySystem') return 'a1';
      return null;
    }
  });

  const store = createCraftingStore(services);
  await store.refresh();

  // Pre-populate workbench with coal
  const comp2 = makeComponent('coal', 'Coal');
  // Manually add item to palette by adding a coal component — but since the system doesn't have it
  // we'll use a simpler approach: add directly if possible. For the test, we verify the workbench
  // is cleared before autofill populates it.

  // Directly set workbench state via the store (workbench is a writable)
  // We can't set it directly, but we can add iron-ore first
  store.addToWorkbench('iron-ore');
  assert.equal(get(store.workbench).length, 1);

  await store.autoFill('r1');

  // After autoFill, workbench should contain recipe's required ingredients (not the old iron-ore twice)
  const wb = get(store.workbench);
  // autoFill clears then populates — so there should be exactly 1 iron-ore (from the recipe's group quantity=1)
  assert.equal(wb.filter(e => e.componentId === 'iron-ore').length, 1);
  assert.equal(wb.length, 1);
});

test('autoFill selects components via expandGroupToComponentIds', async () => {
  const comp = makeComponent('iron-ore', 'Iron Ore');
  const alchemy = makeAlchemySystem('a1', [comp]);
  const invItem = makeInventoryItem('item1', 'Iron Ore', 3, { core: { sourceId: 'Item.source-iron-ore' } });
  const actorA = makeActorWithItems('a1', 'Alice', [invItem]);

  const group = makeIngredientGroup([makeIngredientOption('iron-ore')], 2);
  const set = makeIngredientSet([group]);
  const recipe = makeAlchemyRecipe('r1', 'a1', 'Iron Recipe', [set]);

  const services = createMockServices({
    getCraftingSystemManager: () => ({
      getSystems: () => [alchemy],
      getRecipesForSystem: (id) => id === 'a1' ? [recipe] : []
    }),
    getAvailableActors: () => [actorA],
    getOwnedActors: () => [actorA],
    getSetting: (key) => {
      if (key === 'lastComponentSources') return ['a1'];
      if (key === 'lastAlchemySystem') return 'a1';
      return null;
    }
  });

  const store = createCraftingStore(services);
  await store.refresh();

  await store.autoFill('r1');

  const wb = get(store.workbench);
  assert.ok(wb.length > 0, 'workbench should have entries after autoFill');
  const ironEntry = wb.find(e => e.componentId === 'iron-ore');
  assert.ok(ironEntry, 'iron-ore should be in workbench');
  assert.equal(ironEntry.quantity, 2);
});

test('Search filters discovered recipes by name', async () => {
  const comp = makeComponent('iron-ore', 'Iron Ore');
  const alchemy = makeAlchemySystem('a1', [comp]);
  const actorA = makeActor('a1', 'Alice');

  const recipe1 = makeAlchemyRecipe('r1', 'a1', 'Iron Potion', []);
  const recipe2 = makeAlchemyRecipe('r2', 'a1', 'Gold Elixir', []);

  const services = createMockServices({
    getCraftingSystemManager: () => ({
      getSystems: () => [alchemy],
      getRecipesForSystem: (id) => id === 'a1' ? [recipe1, recipe2] : []
    }),
    getAvailableActors: () => [actorA],
    getOwnedActors: () => [actorA],
    getGameUser: () => ({ id: 'u1', character: actorA, isGM: true }), // GM sees all
    getSetting: (key) => {
      if (key === 'lastComponentSources') return ['a1'];
      if (key === 'lastAlchemySystem') return 'a1';
      return null;
    }
  });

  const store = createCraftingStore(services);
  await store.refresh();

  // GM sees all — verify both recipes visible initially
  const initialDiscovered = get(store.discoveredRecipes);
  assert.equal(initialDiscovered.length, 2);

  // Now search
  store.setDiscoveredRecipeSearch('iron');

  const filtered = get(store.discoveredRecipes);
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].name, 'Iron Potion');
});

test('Craftable-only filter excludes uncraftable recipes', async () => {
  const comp = makeComponent('iron-ore', 'Iron Ore');
  const alchemy = makeAlchemySystem('a1', [comp]);

  const invItem = makeInventoryItem('item1', 'Iron Ore', 3, { core: { sourceId: 'Item.source-iron-ore' } });
  const actorA = makeActorWithItems('a1', 'Alice', [invItem]);

  // Recipe 1: requires iron-ore (available)
  const group1 = makeIngredientGroup([makeIngredientOption('iron-ore')], 1);
  const recipe1 = makeAlchemyRecipe('r1', 'a1', 'Craftable Recipe', [makeIngredientSet([group1])]);

  // Recipe 2: requires rare-gem (not available)
  const group2 = makeIngredientGroup([makeIngredientOption('rare-gem')], 1);
  const recipe2 = makeAlchemyRecipe('r2', 'a1', 'Uncraftable Recipe', [makeIngredientSet([group2])]);

  const services = createMockServices({
    getCraftingSystemManager: () => ({
      getSystems: () => [alchemy],
      getRecipesForSystem: (id) => id === 'a1' ? [recipe1, recipe2] : []
    }),
    getAvailableActors: () => [actorA],
    getOwnedActors: () => [actorA],
    getGameUser: () => ({ id: 'u1', character: actorA, isGM: true }), // GM sees all
    getSetting: (key) => {
      if (key === 'lastComponentSources') return ['a1'];
      if (key === 'lastAlchemySystem') return 'a1';
      return null;
    }
  });

  const store = createCraftingStore(services);
  await store.refresh();

  const initialDiscovered = get(store.discoveredRecipes);
  assert.equal(initialDiscovered.length, 2);

  store.toggleDiscoveredCraftableOnly();

  const filtered = get(store.discoveredRecipes);
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].id, 'r1');
});

test('Discovered recipes shows all recipes for GM', async () => {
  const comp = makeComponent('iron-ore', 'Iron Ore');
  const alchemy = makeAlchemySystem('a1', [comp]);
  const actorA = makeActor('a1', 'Alice');

  const recipe1 = makeAlchemyRecipe('r1', 'a1', 'Recipe 1', []);
  const recipe2 = makeAlchemyRecipe('r2', 'a1', 'Recipe 2', []);
  const recipe3 = makeAlchemyRecipe('r3', 'a1', 'Recipe 3', []);

  const services = createMockServices({
    getCraftingSystemManager: () => ({
      getSystems: () => [alchemy],
      getRecipesForSystem: (id) => id === 'a1' ? [recipe1, recipe2, recipe3] : []
    }),
    getAvailableActors: () => [actorA],
    getOwnedActors: () => [actorA],
    getGameUser: () => ({ id: 'u1', character: actorA, isGM: true }),
    getSetting: (key) => {
      if (key === 'lastComponentSources') return ['a1'];
      if (key === 'lastAlchemySystem') return 'a1';
      return null;
    }
  });

  const store = createCraftingStore(services);
  await store.refresh();

  const discovered = get(store.discoveredRecipes);
  assert.equal(discovered.length, 3);
});
