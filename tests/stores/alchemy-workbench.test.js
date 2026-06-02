/**
 * Tests for Phase B Alchemy Tab Redesign — Tasks 2, 6, 3, 4
 * Covers: alchemy system selection, tab visibility, workbench model, palette derivation.
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
// Store factory import
// ---------------------------------------------------------------------------

const { createCraftingStore } = await import('../../src/ui/svelte/stores/craftingStore.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Make a bare actor with no inventory items.
 * items is an empty array — Array.from([]) gives [] as expected by _findActorComponentItems.
 */
function makeActor(id, name = `Actor-${id}`) {
  return {
    id,
    name,
    isOwner: true,
    items: []
  };
}

/**
 * Make an actor with an array of inventory items.
 * Array.from(actor.items) will iterate correctly.
 */
function makeActorWithItems(id, name, items = []) {
  return {
    id,
    name,
    isOwner: true,
    items
  };
}

function makeInventoryItem(id, name, quantity = 1, flags = {}) {
  return {
    id,
    uuid: `Item.${id}`,
    name,
    img: 'item-icon.png',
    system: { quantity },
    flags
  };
}

/**
 * Make a component whose sourceUuid matches items created with
 * flags: { core: { sourceId: `Item.source-${id}` } }
 */
function makeComponent(id, name = `Component-${id}`, tags = []) {
  return {
    id,
    name,
    img: `icons/${id}.png`,
    tags,
    sourceUuid: `Item.source-${id}`
  };
}

function makeAlchemySystem(id = 'alchemy-sys', components = []) {
  return {
    id,
    name: `Alchemy System ${id}`,
    resolutionMode: 'alchemy',
    components,
    features: { salvage: false }
  };
}

function makeSimpleSystem(id = 'simple-sys') {
  return {
    id,
    name: `Simple System ${id}`,
    resolutionMode: 'simple',
    components: [],
    features: { salvage: false }
  };
}

function makeRecipe(id, craftingSystemId, name = `Recipe-${id}`, ingredientSets = []) {
  return {
    id,
    craftingSystemId,
    name,
    description: `${name} description`,
    img: 'icon.png',
    category: 'potions',
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
    getGameUser: () => ({ id: 'u1', character: actorA }),
    getWorldTime: () => 0,
    notify: { info: () => {}, warn: () => {}, error: () => {} },
    confirmDialog: async () => true
  };

  return { ...base, ...overrides };
}

// ============================================================================
// Task 2: Alchemy system selection
// ============================================================================

test('alchemySystems filters to only alchemy-mode systems', async () => {
  const simple = makeSimpleSystem('s1');
  const alchemy1 = makeAlchemySystem('a1');
  const alchemy2 = makeAlchemySystem('a2');

  const services = createMockServices({
    getCraftingSystemManager: () => ({ getSystems: () => [simple, alchemy1, alchemy2] })
  });

  const store = createCraftingStore(services);
  await store.refresh();

  const systems = get(store.alchemySystems);
  assert.equal(systems.length, 2);
  assert.ok(systems.every(s => s.resolutionMode === 'alchemy'));
});

test('auto-selects when exactly one alchemy system exists', async () => {
  const alchemy = makeAlchemySystem('a1');

  const services = createMockServices({
    getCraftingSystemManager: () => ({ getSystems: () => [alchemy] })
  });

  const store = createCraftingStore(services);
  await store.refresh();

  const selected = get(store.selectedAlchemySystem);
  assert.equal(selected?.id, 'a1');
});

test('uses persisted lastAlchemySystem when multiple systems exist', async () => {
  const alchemy1 = makeAlchemySystem('a1');
  const alchemy2 = makeAlchemySystem('a2');

  const services = createMockServices({
    getCraftingSystemManager: () => ({ getSystems: () => [alchemy1, alchemy2] }),
    getSetting: (key) => {
      if (key === 'lastAlchemySystem') return 'a2';
      if (key === 'lastComponentSources') return ['a1'];
      return null;
    }
  });

  const store = createCraftingStore(services);
  await store.refresh();

  const selected = get(store.selectedAlchemySystem);
  assert.equal(selected?.id, 'a2');
});

test('falls back to first alchemy system when persisted value is invalid', async () => {
  const alchemy1 = makeAlchemySystem('a1');
  const alchemy2 = makeAlchemySystem('a2');

  const services = createMockServices({
    getCraftingSystemManager: () => ({ getSystems: () => [alchemy1, alchemy2] }),
    getSetting: (key) => {
      if (key === 'lastAlchemySystem') return 'nonexistent-system';
      if (key === 'lastComponentSources') return ['a1'];
      return null;
    }
  });

  const store = createCraftingStore(services);
  await store.refresh();

  const selected = get(store.selectedAlchemySystem);
  assert.equal(selected?.id, 'a1');
});

test('selectAlchemySystem persists to setting and updates state', async () => {
  const alchemy1 = makeAlchemySystem('a1');
  const alchemy2 = makeAlchemySystem('a2');
  const settings = { lastAlchemySystem: '', lastComponentSources: ['a1'] };

  const services = createMockServices({
    getCraftingSystemManager: () => ({ getSystems: () => [alchemy1, alchemy2] }),
    getSetting: (key) => settings[key] ?? null,
    setSetting: async (key, value) => { settings[key] = value; }
  });

  const store = createCraftingStore(services);
  await store.refresh();

  await store.selectAlchemySystem('a2');

  assert.equal(get(store.selectedAlchemySystem)?.id, 'a2');
  assert.equal(settings.lastAlchemySystem, 'a2');
});

test('selectedAlchemySystem is null when no alchemy systems exist', async () => {
  const simple = makeSimpleSystem('s1');

  const services = createMockServices({
    getCraftingSystemManager: () => ({ getSystems: () => [simple] })
  });

  const store = createCraftingStore(services);
  await store.refresh();

  const selected = get(store.selectedAlchemySystem);
  assert.equal(selected, null);
});

// ============================================================================
// Task 6: Tab visibility
// ============================================================================

test('hasAlchemyTab is true when alchemy system exists', async () => {
  const alchemy = makeAlchemySystem('a1');

  const services = createMockServices({
    getCraftingSystemManager: () => ({ getSystems: () => [alchemy] })
  });

  const store = createCraftingStore(services);
  await store.refresh();

  assert.equal(get(store.hasAlchemyTab), true);
});

test('hasAlchemyTab is false when no alchemy systems exist', async () => {
  const simple = makeSimpleSystem('s1');

  const services = createMockServices({
    getCraftingSystemManager: () => ({ getSystems: () => [simple] })
  });

  const store = createCraftingStore(services);
  await store.refresh();

  assert.equal(get(store.hasAlchemyTab), false);
});

test('hasCraftingTab is true when non-alchemy system exists', async () => {
  const simple = makeSimpleSystem('s1');

  const services = createMockServices({
    getCraftingSystemManager: () => ({ getSystems: () => [simple] })
  });

  const store = createCraftingStore(services);
  await store.refresh();

  assert.equal(get(store.hasCraftingTab), true);
});

test('hasCraftingTab is false when only alchemy systems exist', async () => {
  const alchemy = makeAlchemySystem('a1');

  const services = createMockServices({
    getCraftingSystemManager: () => ({ getSystems: () => [alchemy] })
  });

  const store = createCraftingStore(services);
  await store.refresh();

  assert.equal(get(store.hasCraftingTab), false);
});

test('showTabBar is true only when both alchemy and non-alchemy systems exist', async () => {
  const simple = makeSimpleSystem('s1');
  const alchemy = makeAlchemySystem('a1');

  const services = createMockServices({
    getCraftingSystemManager: () => ({ getSystems: () => [simple, alchemy] })
  });

  const store = createCraftingStore(services);
  await store.refresh();

  assert.equal(get(store.showTabBar), true);
});

test('showTabBar is false when only one type of system exists', async () => {
  const simple = makeSimpleSystem('s1');

  const services = createMockServices({
    getCraftingSystemManager: () => ({ getSystems: () => [simple] })
  });

  const store = createCraftingStore(services);
  await store.refresh();

  assert.equal(get(store.showTabBar), false);
});

test('activeTab defaults to crafting', () => {
  const services = createMockServices();
  const store = createCraftingStore(services);

  assert.equal(get(store.activeTab), 'crafting');
});

test('setActiveTab switches tab', () => {
  const services = createMockServices();
  const store = createCraftingStore(services);

  store.setActiveTab('alchemy');
  assert.equal(get(store.activeTab), 'alchemy');

  store.setActiveTab('crafting');
  assert.equal(get(store.activeTab), 'crafting');
});

// ============================================================================
// Task 3: Workbench model
// ============================================================================

test('workbench starts empty', () => {
  const services = createMockServices();
  const store = createCraftingStore(services);

  assert.deepEqual(get(store.workbench), []);
});

test('addToWorkbench creates new entry for new component', async () => {
  const comp = makeComponent('iron-ore', 'Iron Ore');
  const alchemy = makeAlchemySystem('a1', [comp]);
  const invItem = makeInventoryItem('item1', 'Iron Ore', 3, { core: { sourceId: 'Item.source-iron-ore' } });
  const actorA = makeActorWithItems('a1', 'Alice', [invItem]);

  const services = createMockServices({
    getCraftingSystemManager: () => ({ getSystems: () => [alchemy] }),
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

  store.addToWorkbench('iron-ore');

  const wb = get(store.workbench);
  assert.equal(wb.length, 1);
  assert.equal(wb[0].componentId, 'iron-ore');
  assert.equal(wb[0].quantity, 1);
  assert.equal(wb[0].name, 'Iron Ore');
});

test('addToWorkbench increments quantity for existing component', async () => {
  const comp = makeComponent('iron-ore', 'Iron Ore');
  const alchemy = makeAlchemySystem('a1', [comp]);
  const invItem = makeInventoryItem('item1', 'Iron Ore', 5, { core: { sourceId: 'Item.source-iron-ore' } });
  const actorA = makeActorWithItems('a1', 'Alice', [invItem]);

  const services = createMockServices({
    getCraftingSystemManager: () => ({ getSystems: () => [alchemy] }),
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

  store.addToWorkbench('iron-ore');
  store.addToWorkbench('iron-ore');

  const wb = get(store.workbench);
  assert.equal(wb.length, 1);
  assert.equal(wb[0].quantity, 2);
});

test('removeFromWorkbench decrements quantity', async () => {
  const comp = makeComponent('iron-ore', 'Iron Ore');
  const alchemy = makeAlchemySystem('a1', [comp]);
  const invItem = makeInventoryItem('item1', 'Iron Ore', 5, { core: { sourceId: 'Item.source-iron-ore' } });
  const actorA = makeActorWithItems('a1', 'Alice', [invItem]);

  const services = createMockServices({
    getCraftingSystemManager: () => ({ getSystems: () => [alchemy] }),
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

  store.addToWorkbench('iron-ore');
  store.addToWorkbench('iron-ore');
  store.removeFromWorkbench('iron-ore');

  const wb = get(store.workbench);
  assert.equal(wb.length, 1);
  assert.equal(wb[0].quantity, 1);
});

test('removeFromWorkbench removes entry when quantity reaches 0', async () => {
  const comp = makeComponent('iron-ore', 'Iron Ore');
  const alchemy = makeAlchemySystem('a1', [comp]);
  const invItem = makeInventoryItem('item1', 'Iron Ore', 3, { core: { sourceId: 'Item.source-iron-ore' } });
  const actorA = makeActorWithItems('a1', 'Alice', [invItem]);

  const services = createMockServices({
    getCraftingSystemManager: () => ({ getSystems: () => [alchemy] }),
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

  store.addToWorkbench('iron-ore');
  store.removeFromWorkbench('iron-ore');

  const wb = get(store.workbench);
  assert.equal(wb.length, 0);
});

test('clearWorkbench resets to empty', async () => {
  const comp1 = makeComponent('iron-ore', 'Iron Ore');
  const comp2 = makeComponent('coal', 'Coal');
  const alchemy = makeAlchemySystem('a1', [comp1, comp2]);
  const actorA = makeActorWithItems('a1', 'Alice', [
    makeInventoryItem('item1', 'Iron Ore', 5, { core: { sourceId: 'Item.source-iron-ore' } }),
    makeInventoryItem('item2', 'Coal', 5, { core: { sourceId: 'Item.source-coal' } })
  ]);

  const services = createMockServices({
    getCraftingSystemManager: () => ({ getSystems: () => [alchemy] }),
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

  store.addToWorkbench('iron-ore');
  store.addToWorkbench('coal');
  store.clearWorkbench();

  assert.deepEqual(get(store.workbench), []);
});

test('submitWorkbench converts to items and calls craftAlchemy with selected system', async () => {
  let capturedArgs = null;
  const comp = makeComponent('iron-ore', 'Iron Ore');
  const alchemy = makeAlchemySystem('a1', [comp]);
  const invItem = makeInventoryItem('item1', 'Iron Ore', 3, { core: { sourceId: 'Item.source-iron-ore' } });
  const actorA = makeActorWithItems('a1', 'Alice', [invItem]);

  const services = createMockServices({
    getCraftingSystemManager: () => ({ getSystems: () => [alchemy] }),
    getAvailableActors: () => [actorA],
    getOwnedActors: () => [actorA],
    getCraftingEngine: () => ({
      craftAlchemy: async (actor, sources, items, opts) => {
        capturedArgs = { actor, sources, items, opts };
        return { success: true, message: 'Crafted!' };
      }
    }),
    getSetting: (key) => {
      if (key === 'lastComponentSources') return ['a1'];
      if (key === 'lastAlchemySystem') return 'a1';
      return null;
    }
  });

  const store = createCraftingStore(services);
  await store.refresh();

  store.addToWorkbench('iron-ore');
  await store.submitWorkbench();

  assert.ok(capturedArgs, 'craftAlchemy should have been called');
  assert.equal(capturedArgs.opts.craftingSystemId, 'a1');
  assert.ok(capturedArgs.items.length > 0, 'items should be passed');
});

test('submitWorkbench clears workbench after attempt', async () => {
  const comp = makeComponent('iron-ore', 'Iron Ore');
  const alchemy = makeAlchemySystem('a1', [comp]);
  const invItem = makeInventoryItem('item1', 'Iron Ore', 3, { core: { sourceId: 'Item.source-iron-ore' } });
  const actorA = makeActorWithItems('a1', 'Alice', [invItem]);

  const services = createMockServices({
    getCraftingSystemManager: () => ({ getSystems: () => [alchemy] }),
    getAvailableActors: () => [actorA],
    getOwnedActors: () => [actorA],
    getCraftingEngine: () => ({
      craftAlchemy: async () => ({ success: false, message: 'No match', disposition: 'no-match' })
    }),
    getSetting: (key) => {
      if (key === 'lastComponentSources') return ['a1'];
      if (key === 'lastAlchemySystem') return 'a1';
      return null;
    }
  });

  const store = createCraftingStore(services);
  await store.refresh();

  store.addToWorkbench('iron-ore');
  await store.submitWorkbench();

  assert.deepEqual(get(store.workbench), []);
});

// ============================================================================
// Task 4: Palette derivation
// ============================================================================

test('palette includes all components from selected alchemy system', async () => {
  const comp1 = makeComponent('iron-ore', 'Iron Ore');
  const comp2 = makeComponent('coal', 'Coal');
  const alchemy = makeAlchemySystem('a1', [comp1, comp2]);
  const actorA = makeActor('a1', 'Alice');

  const services = createMockServices({
    getCraftingSystemManager: () => ({ getSystems: () => [alchemy] }),
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

  const palette = get(store.palette);
  assert.equal(palette.length, 2);
  assert.ok(palette.some(e => e.componentId === 'iron-ore'));
  assert.ok(palette.some(e => e.componentId === 'coal'));
});

test('palette quantities reflect actor inventory', async () => {
  const comp = makeComponent('iron-ore', 'Iron Ore');
  const alchemy = makeAlchemySystem('a1', [comp]);
  const invItem = makeInventoryItem('item1', 'Iron Ore', 3, { core: { sourceId: 'Item.source-iron-ore' } });
  const actorA = makeActorWithItems('a1', 'Alice', [invItem]);

  const services = createMockServices({
    getCraftingSystemManager: () => ({ getSystems: () => [alchemy] }),
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

  const palette = get(store.palette);
  const ironEntry = palette.find(e => e.componentId === 'iron-ore');
  assert.ok(ironEntry, 'iron-ore should be in palette');
  assert.equal(ironEntry.inventoryQuantity, 3);
  assert.equal(ironEntry.availableQuantity, 3);
});

test('palette available quantity decreases when workbench has items', async () => {
  const comp = makeComponent('iron-ore', 'Iron Ore');
  const alchemy = makeAlchemySystem('a1', [comp]);
  const invItem = makeInventoryItem('item1', 'Iron Ore', 5, { core: { sourceId: 'Item.source-iron-ore' } });
  const actorA = makeActorWithItems('a1', 'Alice', [invItem]);

  const services = createMockServices({
    getCraftingSystemManager: () => ({ getSystems: () => [alchemy] }),
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

  store.addToWorkbench('iron-ore');
  store.addToWorkbench('iron-ore');

  const palette = get(store.palette);
  const ironEntry = palette.find(e => e.componentId === 'iron-ore');
  assert.equal(ironEntry.inventoryQuantity, 5);
  assert.equal(ironEntry.workbenchQuantity, 2);
  assert.equal(ironEntry.availableQuantity, 3);
});

test('zero-inventory components appear with availableQuantity: 0', async () => {
  const comp = makeComponent('rare-gem', 'Rare Gem');
  const alchemy = makeAlchemySystem('a1', [comp]);
  const actorA = makeActor('a1', 'Alice'); // no items

  const services = createMockServices({
    getCraftingSystemManager: () => ({ getSystems: () => [alchemy] }),
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

  const palette = get(store.palette);
  const gemEntry = palette.find(e => e.componentId === 'rare-gem');
  assert.ok(gemEntry, 'rare-gem should still appear in palette');
  assert.equal(gemEntry.inventoryQuantity, 0);
  assert.equal(gemEntry.availableQuantity, 0);
});

test('palette updates when alchemy system changes', async () => {
  const comp1 = makeComponent('iron-ore', 'Iron Ore');
  const comp2 = makeComponent('magic-dust', 'Magic Dust');
  const alchemy1 = makeAlchemySystem('a1', [comp1]);
  const alchemy2 = makeAlchemySystem('a2', [comp2]);
  const actorA = makeActor('actor1', 'Alice');
  const settings = { lastComponentSources: ['actor1'], lastAlchemySystem: 'a1' };

  const services = createMockServices({
    getCraftingSystemManager: () => ({
      getSystems: () => [alchemy1, alchemy2]
    }),
    getAvailableActors: () => [actorA],
    getOwnedActors: () => [actorA],
    getSetting: (key) => settings[key] ?? null,
    setSetting: async (key, value) => { settings[key] = value; }
  });

  const store = createCraftingStore(services);
  await store.refresh();

  let palette = get(store.palette);
  assert.ok(palette.some(e => e.componentId === 'iron-ore'));

  await store.selectAlchemySystem('a2');

  palette = get(store.palette);
  assert.ok(palette.some(e => e.componentId === 'magic-dust'));
  assert.ok(!palette.some(e => e.componentId === 'iron-ore'));
});

test('palette is empty when no alchemy system selected', async () => {
  const simple = makeSimpleSystem('s1');

  const services = createMockServices({
    getCraftingSystemManager: () => ({ getSystems: () => [simple] })
  });

  const store = createCraftingStore(services);
  await store.refresh();

  const palette = get(store.palette);
  assert.deepEqual(palette, []);
});
