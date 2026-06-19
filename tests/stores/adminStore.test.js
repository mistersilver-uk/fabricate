/**
 * Tests for adminStore factory (T-120)
 * Uses node:test + node:assert/strict
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';
import {
  DEFAULT_GATHERING_EVENT_IMG,
  DEFAULT_GATHERING_TASK_IMG
} from '../../src/gatheringImageDefaults.js';

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

let _systemIdCounter = 1;
let _essenceIdCounter = 1;

function makeSystem(overrides = {}) {
  const id = overrides.id || `sys-${_systemIdCounter++}`;
  return {
    id,
    name: overrides.name || `System ${id}`,
    description: overrides.description || '',
    resolutionMode: overrides.resolutionMode || 'simple',
    features: overrides.features || {},
    categories: overrides.categories || [],
    itemTags: overrides.itemTags || [],
    essenceDefinitions: overrides.essenceDefinitions || [],
    items: overrides.items || [],
    requirements: overrides.requirements || { time: { enabled: false }, currency: { enabled: false, units: [] } },
    craftingCheck: overrides.craftingCheck || { mode: 'passFail', macroUuid: null, outcomes: [] },
    recipeVisibility: overrides.recipeVisibility || { listMode: 'global' },
    ...overrides
  };
}

function makeRecipe(overrides = {}) {
  const id = overrides.id || `recipe-${Math.random().toString(36).slice(2)}`;
  return {
    id,
    name: overrides.name || `Recipe ${id}`,
    description: overrides.description || '',
    img: 'recipe.png',
    category: overrides.category || 'general',
    enabled: overrides.enabled !== undefined ? overrides.enabled : true,
    locked: overrides.locked || false,
    visibility: overrides.visibility || {},
    ingredientSets: overrides.ingredientSets || [],
    isSimpleRecipe: () => true,
    toJSON: () => ({ id, name: overrides.name || `Recipe ${id}`, craftingSystemId: overrides.craftingSystemId || '' }),
    ...overrides
  };
}

function makeItem(overrides = {}) {
  const id = overrides.id || `item-${Math.random().toString(36).slice(2)}`;
  return {
    id,
    name: overrides.name || `Item ${id}`,
    img: overrides.img || 'item.png',
    tags: overrides.tags || [],
    essences: overrides.essences || {},
    ...overrides
  };
}

/**
 * Creates a fully-stubbed services object for adminStore tests.
 */
function createMockServices(overrides = {}) {
  const store = {
    lastManagedCraftingSystem: ''
  };

  let systems = [makeSystem({ id: 'sys1', name: 'System One' })];
  let recipes = [makeRecipe({ id: 'r1', name: 'Recipe One', craftingSystemId: 'sys1' })];

  const mockSystemManager = {
    getSystems: () => systems,
    getSystem: (id) => systems.find(s => s.id === id) || null,
    createSystem: async (data) => {
      const sys = makeSystem({ ...data, id: data.id || `sys-created-${Date.now()}` });
      systems.push(sys);
      return sys;
    },
    updateSystem: async (id, updates) => {
      const idx = systems.findIndex(s => s.id === id);
      if (idx >= 0) {
        systems[idx] = { ...systems[idx], ...updates };
        // Merge features specially
        if (updates.features) {
          systems[idx].features = { ...(systems[idx - 0]?.features || {}), ...updates.features };
          // Re-merge since we overwrote
          const base = systems.find(s => s.id === id) || {};
          systems[idx].features = { ...(base.features || {}), ...updates.features };
        }
      }
    },
    deleteSystem: async (id) => {
      systems = systems.filter(s => s.id !== id);
    },
    getItems: (systemId, searchTerm) => {
      const sys = systems.find(s => s.id === systemId);
      const items = sys?.components || sys?.items || [];
      if (!searchTerm) return items;
      const lower = searchTerm.toLowerCase();
      return items.filter(i => i.name.toLowerCase().includes(lower));
    },
    deleteItem: async (systemId, itemId) => {
      const sys = systems.find(s => s.id === systemId);
      if (sys) {
        if (Array.isArray(sys.items)) {
          sys.items = sys.items.filter(i => i.id !== itemId);
        }
        if (Array.isArray(sys.components)) {
          sys.components = sys.components.filter(i => i.id !== itemId);
        }
      }
    }
  };

  const mockRecipeManager = {
    getRecipes: (filter) => {
      if (filter?.craftingSystemId) {
        return recipes.filter(r => r.craftingSystemId === filter.craftingSystemId);
      }
      return recipes;
    },
    getRecipe: (id) => recipes.find(r => r.id === id) || null,
    createRecipe: async (data) => {
      const r = makeRecipe({ ...data, id: `r-new-${Date.now()}` });
      recipes.push(r);
      return r;
    },
    updateRecipe: async (id, updates) => {
      const idx = recipes.findIndex(r => r.id === id);
      if (idx >= 0) recipes[idx] = { ...recipes[idx], ...updates };
    },
    deleteRecipe: async (id) => {
      recipes = recipes.filter(r => r.id !== id);
    },
    importRecipes: async (data, overwrite) => {},
    exportRecipes: () => recipes.map(r => r.toJSON())
  };

  const base = {
    getSetting: (key) => store[key] ?? '',
    setSetting: async (key, value) => { store[key] = value; },
    getCraftingSystemManager: () => mockSystemManager,
    getRecipeManager: () => mockRecipeManager,
    getScriptMacros: () => [],
    getSceneOptions: () => [],
    getRollTableOptions: () => [],
    notify: {
      info: () => {},
      warn: () => {},
      error: () => {}
    },
    confirmDialog: async () => true,
    localize: (key) => key,
    copyToClipboard: async () => {},
    openRecipeEditor: () => {},
    renderImportDialog: async () => {}
  };

  const merged = { ...base, ...overrides };
  // Expose internal state for assertions
  merged._store = store;
  merged._getSystemsMutable = () => systems;
  merged._getRecipesMutable = () => recipes;

  return merged;
}

// ---------------------------------------------------------------------------
// Import the store factory
// ---------------------------------------------------------------------------
const { createAdminStore } = await import('../../src/ui/svelte/stores/adminStore.js');
const { DEFAULT_ESSENCE_ICON } = await import('../../src/ui/svelte/util/essenceIcons.js');

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createAdminStore', () => {

  // -------------------------------------------------------------------------
  // 1. Initialization
  // -------------------------------------------------------------------------

  describe('initialization', () => {
    it('creates store with system list populated from systemManager', async () => {
      const services = createMockServices();
      const store = createAdminStore(services);
      await store.refresh();
      const vs = get(store.viewState);
      assert.ok(Array.isArray(vs.systems));
      assert.equal(vs.systems.length, 1);
      assert.equal(vs.systems[0].id, 'sys1');
    });

    it('defaults to first system when no saved system is set', async () => {
      const services = createMockServices({
        getSetting: () => ''
      });
      const store = createAdminStore(services);
      await store.refresh();
      const vs = get(store.viewState);
      assert.equal(get(store.selectedSystemId), 'sys1');
      assert.equal(vs.selectedSystem?.id, 'sys1');
      assert.equal(vs.systems[0].selected, true);
    });

    it('restores selected system from lastManagedCraftingSystem setting', () => {
      const services = createMockServices({
        getSetting: (key) => key === 'lastManagedCraftingSystem' ? 'sys1' : ''
      });
      const store = createAdminStore(services);
      assert.equal(get(store.selectedSystemId), 'sys1');
    });

    it('falls back to first system when saved system no longer exists', async () => {
      const services = createMockServices({
        getSetting: (key) => key === 'lastManagedCraftingSystem' ? 'sys-gone' : ''
      });
      const store = createAdminStore(services);
      await store.refresh();
      // sys-gone does not exist, sys1 does — should fall back to first system
      assert.equal(get(store.selectedSystemId), 'sys1');
      assert.equal(get(store.viewState).systems[0].selected, true);
    });

    it('publishes systems list and selected-system context synchronously before phase-2 await chain', async () => {
      // Regression: previously refresh() built systemList early but only wrote
      // viewState after awaiting expensive per-system work (item cards, environments),
      // so the v2 systems browser flashed "No crafting systems yet" on open.
      // The selected-system rail and inspector also need selectedSystem before
      // refresh() yields to the microtask queue, otherwise the shell appears
      // selected-but-broken until phase 2 finishes.
      const services = createMockServices();
      const store = createAdminStore(services);
      // createAdminStore kicks off refresh() without awaiting it; the synchronous
      // portion of refresh() runs before this line, including the phase-1 write.
      const vs = get(store.viewState);
      assert.equal(vs.systems.length, 1, 'phase-1 must publish systems before yielding');
      assert.equal(vs.systems[0].id, 'sys1');
      assert.equal(vs.hasSystem, true, 'phase-1 must mark a selected system as present');
      assert.equal(vs.selectedSystemName, 'System One');
      assert.equal(vs.selectedSystem?.id, 'sys1', 'phase-1 must publish selected system details before yielding');
      assert.equal(vs.selectedSystem?.name, 'System One');
      assert.equal(vs.recipes.length, 1, 'phase-1 must publish synchronous recipe browser data before yielding');
      // Let phase-2 settle so the rest of the suite starts from a clean state.
      await store.refresh();
    });

    it('publishes loading instead of a true empty state while managers are uninitialized', () => {
      let readyCallback = null;
      const services = createMockServices({
        isFabricateReady: () => false,
        onFabricateReady: (callback) => {
          readyCallback = callback;
          return () => {};
        }
      });
      const store = createAdminStore(services);
      const vs = get(store.viewState);

      assert.equal(vs.systemsLoading, true);
      assert.deepEqual(vs.systems, []);
      assert.equal(vs.hasSystem, false);
      assert.equal(typeof readyCallback, 'function');
    });

    it('refreshes and selects the first system when fabricate.ready fires', async () => {
      let ready = false;
      let readyCallback = null;
      const services = createMockServices({
        getSetting: () => '',
        isFabricateReady: () => ready,
        onFabricateReady: (callback) => {
          readyCallback = callback;
          return () => {};
        }
      });
      const store = createAdminStore(services);

      assert.equal(get(store.viewState).systemsLoading, true);
      ready = true;
      await readyCallback();

      const vs = get(store.viewState);
      assert.equal(vs.systemsLoading, false);
      assert.equal(vs.systems.length, 1);
      assert.equal(vs.systems[0].id, 'sys1');
      assert.equal(vs.systems[0].selected, true);
      assert.equal(get(store.selectedSystemId), 'sys1');
    });

    it('destroy unregisters a pending fabricate.ready refresh callback', () => {
      let cleanupCalled = false;
      const services = createMockServices({
        isFabricateReady: () => false,
        onFabricateReady: () => () => {
          cleanupCalled = true;
        }
      });
      const store = createAdminStore(services);

      store.destroy();

      assert.equal(cleanupCalled, true);
    });

    it('refreshes on external Fabricate data changes and unsubscribes on destroy', async () => {
      let dataChangedCallback = null;
      let cleanupCalled = false;
      const services = createMockServices({
        onFabricateDataChanged: (callback) => {
          dataChangedCallback = callback;
          return () => {
            cleanupCalled = true;
          };
        }
      });
      const store = createAdminStore(services);
      await store.refresh();

      assert.equal(get(store.viewState).recipes.length, 1);
      services._getRecipesMutable().push(makeRecipe({
        id: 'r-external',
        name: 'External Recipe',
        craftingSystemId: 'sys1'
      }));

      dataChangedCallback?.('recipes');
      await new Promise(resolve => setTimeout(resolve, 0));

      assert.equal(get(store.viewState).recipes.length, 2);

      store.destroy();
      assert.equal(cleanupCalled, true);

      services._getRecipesMutable().push(makeRecipe({
        id: 'r-after-destroy',
        name: 'After Destroy',
        craftingSystemId: 'sys1'
      }));
      dataChangedCallback?.('recipes');
      await new Promise(resolve => setTimeout(resolve, 0));

      assert.equal(get(store.viewState).recipes.length, 2);
    });

    it('leaves selection empty when no systems exist', async () => {
      const services = createMockServices({
        getSetting: () => ''
      });
      const originalManager = services.getCraftingSystemManager();
      services.getCraftingSystemManager = () => ({
        ...originalManager,
        getSystems: () => [],
        getSystem: () => null,
        getItems: () => []
      });
      const store = createAdminStore(services);
      await store.refresh();
      const vs = get(store.viewState);
      assert.equal(get(store.selectedSystemId), '');
      assert.equal(vs.selectedSystem, null);
      assert.deepEqual(vs.systems, []);
    });
  });

  // -------------------------------------------------------------------------
  // 2. System selection
  // -------------------------------------------------------------------------

  describe('system selection', () => {
    it('selectSystem updates selectedSystemId and persists setting', async () => {
      let persisted = null;
      const services = createMockServices({
        setSetting: async (key, value) => { if (key === 'lastManagedCraftingSystem') persisted = value; }
      });
      services._getSystemsMutable().push(makeSystem({ id: 'sys2', name: 'System Two' }));
      const store = createAdminStore(services);
      await store.selectSystem('sys2');
      assert.equal(get(store.selectedSystemId), 'sys2');
      assert.equal(persisted, 'sys2');
    });

    it('selectSystem refreshes viewState with new system data', async () => {
      const services = createMockServices({
        getSetting: () => ''
      });
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      const vs = get(store.viewState);
      assert.ok(vs.hasSystem);
      assert.equal(vs.selectedSystem?.id, 'sys1');
    });

    it('selecting non-existent system falls back to first available system', async () => {
      const services = createMockServices();
      const store = createAdminStore(services);
      await store.selectSystem('does-not-exist');
      await store.refresh();
      const vs = get(store.viewState);
      // 'does-not-exist' is not in the list; refresh falls back to first system (sys1)
      assert.equal(vs.hasSystem, true);
      assert.equal(vs.selectedSystem?.id, 'sys1');
    });
  });

  // -------------------------------------------------------------------------
  // 3. Tab switching
  // -------------------------------------------------------------------------

  describe('tab switching', () => {
    it('setTab updates activeTab writable', async () => {
      const services = createMockServices();
      const store = createAdminStore(services);
      await store.setTab('recipes');
      assert.equal(get(store.activeTab), 'recipes');
    });

    it('activeTab defaults to systems', () => {
      const services = createMockServices();
      const store = createAdminStore(services);
      assert.equal(get(store.activeTab), 'systems');
    });
  });

  // -------------------------------------------------------------------------
  // 4. System CRUD
  // -------------------------------------------------------------------------

  describe('system CRUD', () => {
    it('createSystem calls systemManager.createSystem and selects the new system', async () => {
      const services = createMockServices();
      const store = createAdminStore(services);
      await store.createSystem();
      const sysId = get(store.selectedSystemId);
      assert.ok(sysId, 'should have a selectedSystemId after createSystem');
      const vs = get(store.viewState);
      assert.ok(vs.systems.some(s => s.id === sysId));
    });

    it('createSystem generates unique name when default already exists', async () => {
      const services = createMockServices();
      // First creation will produce 'New Crafting System'
      await createAdminStore(services).createSystem();
      // Second creation
      const store2 = createAdminStore(services);
      await store2.createSystem();
      const allNames = services.getCraftingSystemManager().getSystems().map(s => s.name);
      const newSystems = allNames.filter(n => n.startsWith('New Crafting System'));
      assert.ok(newSystems.length >= 2, `Expected at least 2 "New Crafting System*" names, got: ${JSON.stringify(allNames)}`);
      // Ensure no duplicates
      assert.equal(new Set(allNames).size, allNames.length, 'All system names should be unique');
    });

    it('createSystem sets activeTab to systems', async () => {
      const services = createMockServices();
      const store = createAdminStore(services);
      store.activeTab.set('recipes');
      await store.createSystem();
      assert.equal(get(store.activeTab), 'systems');
    });

    it('deleteSystem shows confirm dialog, calls deleteSystem, selects next system', async () => {
      let confirmCalled = false;
      const services = createMockServices({
        confirmDialog: async () => { confirmCalled = true; return true; }
      });
      const systemManager = services.getCraftingSystemManager();
      // Add a second system so there's a fallback
      await systemManager.createSystem({ name: 'System Two', id: 'sys2' });

      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      await store.deleteSystem('sys1');

      assert.ok(confirmCalled, 'should call confirmDialog');
      const remaining = systemManager.getSystems();
      assert.ok(!remaining.some(s => s.id === 'sys1'), 'sys1 should be deleted');
    });

    it('deleteSystem does nothing when confirm is declined', async () => {
      const services = createMockServices({
        confirmDialog: async () => false
      });
      const store = createAdminStore(services);
      await store.deleteSystem('sys1');
      const remaining = services.getCraftingSystemManager().getSystems();
      assert.ok(remaining.some(s => s.id === 'sys1'), 'sys1 should not be deleted when declined');
    });

    it('saveSystemDetails calls systemManager.updateSystem with given name and description', async () => {
      let updateArgs = null;
      const services = createMockServices();
      const origManager = services.getCraftingSystemManager();
      services.getCraftingSystemManager = () => ({
        ...origManager,
        updateSystem: async (id, updates) => {
          updateArgs = { id, updates };
          await origManager.updateSystem(id, updates);
        }
      });
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      await store.saveSystemDetails('Updated Name', 'Updated Desc');
      assert.ok(updateArgs !== null, 'updateSystem should be called');
      assert.equal(updateArgs.id, 'sys1');
      assert.equal(updateArgs.updates.name, 'Updated Name');
      assert.equal(updateArgs.updates.description, 'Updated Desc');
    });

    it('saveSystemDetails does nothing when no system is selected', async () => {
      let updateCalled = false;
      const services = createMockServices();
      const origManager = services.getCraftingSystemManager();
      services.getCraftingSystemManager = () => ({
        ...origManager,
        getSystems: () => [],
        getSystem: () => null,
        updateSystem: async () => { updateCalled = true; }
      });
      const store = createAdminStore(services);
      await store.saveSystemDetails('Name', 'Desc');
      assert.ok(!updateCalled, 'updateSystem should not be called when no system is selected');
    });

    it('toggleSystemEnabled calls systemManager.updateSystem for the target system', async () => {
      let updateArgs = null;
      const services = createMockServices();
      const origManager = services.getCraftingSystemManager();
      services.getCraftingSystemManager = () => ({
        ...origManager,
        updateSystem: async (id, updates) => {
          updateArgs = { id, updates };
          await origManager.updateSystem(id, updates);
        }
      });
      const store = createAdminStore(services);
      const result = await store.toggleSystemEnabled('sys1', false);
      assert.equal(result, true);
      assert.ok(updateArgs !== null, 'updateSystem should be called');
      assert.equal(updateArgs.id, 'sys1');
      assert.equal(updateArgs.updates.enabled, false);
    });

    it('setResolutionMode confirms and persists the new mode', async () => {
      let confirmCalled = false;
      let updateArgs = null;
      const services = createMockServices({
        confirmDialog: async () => { confirmCalled = true; return true; }
      });
      const origManager = services.getCraftingSystemManager();
      services.getCraftingSystemManager = () => ({
        ...origManager,
        updateSystem: async (id, updates) => {
          updateArgs = { id, updates };
          await origManager.updateSystem(id, updates);
        }
      });

      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      const result = await store.setResolutionMode('tiered');

      assert.equal(result, true);
      assert.equal(confirmCalled, true);
      assert.equal(updateArgs?.id, 'sys1');
      assert.equal(updateArgs?.updates?.resolutionMode, 'tiered');
    });

    it('setResolutionMode leaves the system unchanged when the confirmation is declined', async () => {
      let updateCalled = false;
      const services = createMockServices({
        confirmDialog: async () => false
      });
      const origManager = services.getCraftingSystemManager();
      services.getCraftingSystemManager = () => ({
        ...origManager,
        updateSystem: async () => { updateCalled = true; }
      });

      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      const result = await store.setResolutionMode('tiered');

      assert.equal(result, false);
      assert.equal(updateCalled, false);
    });
  });

  // -------------------------------------------------------------------------
  // 5. Feature toggles
  // -------------------------------------------------------------------------

  describe('feature toggles', () => {
    it('toggleFeature("categories", false) sends the legacy compatibility update shape', async () => {
      let updateArgs = null;
      const services = createMockServices();
      const origManager = services.getCraftingSystemManager();
      services.getCraftingSystemManager = () => ({
        ...origManager,
        updateSystem: async (id, updates) => {
          updateArgs = { id, updates };
          await origManager.updateSystem(id, updates);
        }
      });
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      await store.toggleFeature('categories', false);
      assert.ok(updateArgs, 'updateSystem should be called');
      assert.deepEqual(updateArgs.updates.features, { recipeCategories: false });
    });

    it('toggleFeature maps optional feature names correctly', async () => {
      const expectedMappings = {
        essences: 'essences',
        multiStepRecipes: 'multiStepRecipes',
        propertyMacros: 'propertyMacros',
        craftingChecks: 'craftingChecks',
        outcomeRouting: 'outcomeRouting',
        effectTransfer: 'effectTransfer',
        gathering: 'gathering'
      };

      for (const [featureName, expectedKey] of Object.entries(expectedMappings)) {
        let updateArgs = null;
        const services = createMockServices();
        const origManager = services.getCraftingSystemManager();
        services.getCraftingSystemManager = () => ({
          ...origManager,
          updateSystem: async (id, updates) => {
            updateArgs = { id, updates };
            await origManager.updateSystem(id, updates);
          }
        });
        const store = createAdminStore(services);
        await store.selectSystem('sys1');
        await store.toggleFeature(featureName, true);
        assert.ok(updateArgs, `updateSystem should be called for feature: ${featureName}`);
        assert.ok(expectedKey in updateArgs.updates.features,
          `Expected key "${expectedKey}" in features update for "${featureName}"`);
      }
    });

    it('toggleRequirement("currency", true) calls updateSystem with correct requirements shape', async () => {
      let updateArgs = null;
      const services = createMockServices();
      const origManager = services.getCraftingSystemManager();
      services.getCraftingSystemManager = () => ({
        ...origManager,
        updateSystem: async (id, updates) => {
          updateArgs = { id, updates };
          await origManager.updateSystem(id, updates);
        }
      });
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      await store.toggleRequirement('currency', true);
      assert.ok(updateArgs, 'updateSystem should be called');
      assert.equal(updateArgs.updates.requirements.currency.enabled, true);
      assert.deepEqual(updateArgs.updates.requirements.currency.units, []);
      assert.equal('provider' in updateArgs.updates.requirements.currency, false, 'should not emit provider field');
    });

    it('toggleRequirement("time", true) calls updateSystem with time.enabled: true', async () => {
      let updateArgs = null;
      const services = createMockServices();
      const origManager = services.getCraftingSystemManager();
      services.getCraftingSystemManager = () => ({
        ...origManager,
        updateSystem: async (id, updates) => {
          updateArgs = { id, updates };
          await origManager.updateSystem(id, updates);
        }
      });
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      await store.toggleRequirement('time', true);
      assert.ok(updateArgs, 'updateSystem should be called');
      assert.equal(updateArgs.updates.requirements.time.enabled, true);
    });

    it('toggleRequirement does nothing for unknown requirement type', async () => {
      let updateCalled = false;
      const services = createMockServices();
      const origManager = services.getCraftingSystemManager();
      services.getCraftingSystemManager = () => ({
        ...origManager,
        updateSystem: async () => { updateCalled = true; }
      });
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      await store.toggleRequirement('gold', true);
      assert.ok(!updateCalled, 'should not call updateSystem for unknown requirement');
    });
  });

  // -------------------------------------------------------------------------
  // 6. Category management
  // -------------------------------------------------------------------------

  describe('category management', () => {
    it('addCategory appends to categories and deduplicates', async () => {
      let savedCategories = null;
      const services = createMockServices();
      const origManager = services.getCraftingSystemManager();
      services.getCraftingSystemManager = () => ({
        ...origManager,
        updateSystem: async (id, updates) => {
          if (updates.categories) savedCategories = updates.categories;
          await origManager.updateSystem(id, updates);
        }
      });
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      await store.addCategory('Weapons');
      await store.addCategory('Weapons'); // duplicate
      assert.ok(savedCategories !== null);
      assert.equal(savedCategories.filter(c => c === 'Weapons').length, 1);
    });

    it('removeCategory filters out the category', async () => {
      let savedCategories = null;
      const services = createMockServices();
      const origManager = services.getCraftingSystemManager();
      // Pre-seed a category
      const sys = origManager.getSystem('sys1');
      if (sys) sys.categories = ['Potions', 'Weapons'];
      services.getCraftingSystemManager = () => ({
        ...origManager,
        updateSystem: async (id, updates) => {
          if (updates.categories) savedCategories = updates.categories;
          await origManager.updateSystem(id, updates);
        }
      });
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      await store.removeCategory('Potions');
      assert.ok(savedCategories !== null);
      assert.ok(!savedCategories.includes('Potions'));
      assert.ok(savedCategories.includes('Weapons'));
    });

    it('addCategory does nothing with empty string', async () => {
      let updateCalled = false;
      const services = createMockServices();
      const origManager = services.getCraftingSystemManager();
      services.getCraftingSystemManager = () => ({
        ...origManager,
        updateSystem: async (id, updates) => {
          updateCalled = true;
          await origManager.updateSystem(id, updates);
        }
      });
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      await store.addCategory('');
      assert.ok(!updateCalled, 'updateSystem should not be called for empty category');
    });

    it('addCategory does not persist the reserved general category as a custom category', async () => {
      let updateCalled = false;
      const services = createMockServices();
      const origManager = services.getCraftingSystemManager();
      services.getCraftingSystemManager = () => ({
        ...origManager,
        updateSystem: async () => { updateCalled = true; }
      });
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      await store.addCategory('General');
      assert.ok(!updateCalled, 'updateSystem should not be called for the reserved General category');
    });

    it('removeCategory does nothing for the reserved general category', async () => {
      let updateCalled = false;
      const services = createMockServices();
      const origManager = services.getCraftingSystemManager();
      services.getCraftingSystemManager = () => ({
        ...origManager,
        updateSystem: async () => { updateCalled = true; }
      });
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      await store.removeCategory('general');
      assert.ok(!updateCalled, 'updateSystem should not be called for the reserved General category');
    });
  });

  // -------------------------------------------------------------------------
  // 7. Tag management
  // -------------------------------------------------------------------------

  describe('tag management', () => {
    it('addTag lowercases and appends', async () => {
      let savedTags = null;
      const services = createMockServices();
      const origManager = services.getCraftingSystemManager();
      services.getCraftingSystemManager = () => ({
        ...origManager,
        updateSystem: async (id, updates) => {
          if (updates.itemTags) savedTags = updates.itemTags;
          await origManager.updateSystem(id, updates);
        }
      });
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      await store.addTag('FIRE');
      assert.ok(savedTags !== null);
      assert.ok(savedTags.includes('fire'), 'Tag should be lowercased');
    });

    it('removeTag filters out the tag', async () => {
      let savedTags = null;
      const services = createMockServices();
      const origManager = services.getCraftingSystemManager();
      const sys = origManager.getSystem('sys1');
      if (sys) sys.itemTags = ['fire', 'ice'];
      services.getCraftingSystemManager = () => ({
        ...origManager,
        updateSystem: async (id, updates) => {
          if (updates.itemTags) savedTags = updates.itemTags;
          await origManager.updateSystem(id, updates);
        }
      });
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      await store.removeTag('fire');
      assert.ok(savedTags !== null);
      assert.ok(!savedTags.includes('fire'));
      assert.ok(savedTags.includes('ice'));
    });

    it('addTag deduplicates', async () => {
      let savedTags = null;
      const services = createMockServices();
      const origManager = services.getCraftingSystemManager();
      const sys = origManager.getSystem('sys1');
      if (sys) sys.itemTags = ['fire'];
      services.getCraftingSystemManager = () => ({
        ...origManager,
        updateSystem: async (id, updates) => {
          if (updates.itemTags) savedTags = updates.itemTags;
          await origManager.updateSystem(id, updates);
        }
      });
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      await store.addTag('fire');
      assert.ok(savedTags !== null);
      assert.equal(savedTags.filter(t => t === 'fire').length, 1);
    });
  });

  // -------------------------------------------------------------------------
  // 8. Essence management
  // -------------------------------------------------------------------------

  describe('essence management', () => {
    it('addEssence appends to essenceDefinitions', async () => {
      let savedEssences = null;
      const services = createMockServices();
      const origManager = services.getCraftingSystemManager();
      services.getCraftingSystemManager = () => ({
        ...origManager,
        updateSystem: async (id, updates) => {
          if (updates.essenceDefinitions) savedEssences = updates.essenceDefinitions;
          await origManager.updateSystem(id, updates);
        }
      });
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      await store.addEssence('Fire', 'Burning essence', 'fas fa-fire', null);
      assert.ok(savedEssences !== null);
      assert.ok(savedEssences.some(e => e.name === 'Fire'));
      const newEssence = savedEssences.find(e => e.name === 'Fire');
      assert.ok(newEssence.id, 'new essence should have an id');
      assert.equal(typeof newEssence.id, 'string');
    });

    it('addEssence uses the default icon when none is provided', async () => {
      let savedEssences = null;
      const services = createMockServices();
      const origManager = services.getCraftingSystemManager();
      services.getCraftingSystemManager = () => ({
        ...origManager,
        updateSystem: async (id, updates) => {
          if (updates.essenceDefinitions) savedEssences = updates.essenceDefinitions;
          await origManager.updateSystem(id, updates);
        }
      });
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      await store.addEssence('Water', 'Flowing essence', '', null);

      const newEssence = savedEssences?.find(e => e.name === 'Water');
      assert.ok(newEssence, 'new essence should be persisted');
      assert.equal(newEssence.icon, DEFAULT_ESSENCE_ICON);
    });

    it('addEssence persists the selected component id and resolved source item UUID', async () => {
      let savedEssences = null;
      const services = createMockServices();
      const origManager = services.getCraftingSystemManager();
      const sys = origManager.getSystem('sys1');
      if (sys) {
        sys.components = [makeItem({
          id: 'comp-1',
          name: 'Sunleaf',
          img: 'sunleaf.png',
          sourceItemUuid: 'Compendium.fabricate.items.sunleaf'
        })];
      }
      services.getCraftingSystemManager = () => ({
        ...origManager,
        updateSystem: async (id, updates) => {
          if (updates.essenceDefinitions) savedEssences = updates.essenceDefinitions;
          await origManager.updateSystem(id, updates);
        }
      });
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      await store.addEssence('Radiance', 'Bright essence', 'fas fa-sun', 'comp-1');

      const newEssence = savedEssences?.find(e => e.name === 'Radiance');
      assert.ok(newEssence, 'new essence should be persisted');
      assert.equal(newEssence.sourceComponentId, 'comp-1');
      assert.equal(newEssence.sourceItemUuid, 'Compendium.fabricate.items.sunleaf');
      assert.equal(newEssence.associatedSystemItemId, 'comp-1');
    });

    it('addEssence rejects duplicate name', async () => {
      let warnMsg = null;
      const services = createMockServices({
        notify: {
          info: () => {},
          warn: (m) => { warnMsg = m; },
          error: () => {}
        }
      });
      const origManager = services.getCraftingSystemManager();
      const sys = origManager.getSystem('sys1');
      if (sys) {
        sys.essenceDefinitions = [{ id: 'ess1', name: 'Fire', description: '', icon: '', sourceItemUuid: null }];
      }
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      await store.addEssence('Fire', 'Another fire', '', null);
      assert.ok(warnMsg !== null, 'should warn about duplicate');
    });

    it('addEssence rejects empty name', async () => {
      let updateCalled = false;
      const services = createMockServices();
      const origManager = services.getCraftingSystemManager();
      services.getCraftingSystemManager = () => ({
        ...origManager,
        updateSystem: async (id, updates) => {
          updateCalled = true;
          await origManager.updateSystem(id, updates);
        }
      });
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      await store.addEssence('', '', '', null);
      assert.ok(!updateCalled, 'updateSystem should not be called for empty name');
    });

    it('removeEssence filters out by essenceId', async () => {
      let savedEssences = null;
      const services = createMockServices();
      const origManager = services.getCraftingSystemManager();
      const sys = origManager.getSystem('sys1');
      if (sys) {
        sys.essenceDefinitions = [
          { id: 'ess1', name: 'Fire', description: '', icon: '', sourceItemUuid: null },
          { id: 'ess2', name: 'Ice', description: '', icon: '', sourceItemUuid: null }
        ];
      }
      services.getCraftingSystemManager = () => ({
        ...origManager,
        updateSystem: async (id, updates) => {
          if (updates.essenceDefinitions) savedEssences = updates.essenceDefinitions;
          await origManager.updateSystem(id, updates);
        }
      });
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      await store.removeEssence('ess1');
      assert.ok(savedEssences !== null);
      assert.ok(!savedEssences.some(e => e.id === 'ess1'));
      assert.ok(savedEssences.some(e => e.id === 'ess2'));
    });

    it('updateEssence renames and updates description and icon inline', async () => {
      let savedEssences = null;
      const services = createMockServices();
      const origManager = services.getCraftingSystemManager();
      const sys = origManager.getSystem('sys1');
      if (sys) {
        sys.essenceDefinitions = [
          {
            id: 'ess1',
            name: 'Fire',
            description: 'Burning essence',
            icon: 'fas fa-fire',
            sourceItemUuid: 'item-1',
            associatedSystemItemId: 'item-1'
          }
        ];
      }
      services.getCraftingSystemManager = () => ({
        ...origManager,
        updateSystem: async (id, updates) => {
          if (updates.essenceDefinitions) savedEssences = updates.essenceDefinitions;
          await origManager.updateSystem(id, updates);
        }
      });

      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      await store.updateEssence('ess1', {
        name: 'Volatile',
        description: 'Explosive energy',
        icon: 'fas fa-bolt'
      });

      assert.equal(savedEssences?.length, 1);
      assert.deepEqual(savedEssences?.[0], {
        id: 'ess1',
        name: 'Volatile',
        description: 'Explosive energy',
        icon: 'fas fa-bolt',
        sourceItemUuid: 'item-1',
        associatedSystemItemId: 'item-1'
      });
    });

    it('updateEssence preserves source evidence when no source update is provided', async () => {
      let savedEssences = null;
      const services = createMockServices();
      const origManager = services.getCraftingSystemManager();
      const sys = origManager.getSystem('sys1');
      if (sys) {
        sys.features = { essences: true, effectTransfer: false };
        sys.essenceDefinitions = [
          {
            id: 'ess1',
            name: 'Fire',
            description: 'Burning essence',
            icon: 'fas fa-fire',
            sourceItemUuid: 'Compendium.fabricate.items.fire-core',
            associatedSystemItemId: 'legacy-component'
          }
        ];
      }
      services.getCraftingSystemManager = () => ({
        ...origManager,
        updateSystem: async (id, updates) => {
          if (updates.essenceDefinitions) savedEssences = updates.essenceDefinitions;
          await origManager.updateSystem(id, updates);
        }
      });

      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      await store.updateEssence('ess1', {
        name: 'Ember',
        description: 'Warmth',
        icon: 'fas fa-fire-flame-curved'
      });

      assert.deepEqual(savedEssences?.[0], {
        id: 'ess1',
        name: 'Ember',
        description: 'Warmth',
        icon: 'fas fa-fire-flame-curved',
        sourceItemUuid: 'Compendium.fabricate.items.fire-core',
        associatedSystemItemId: 'legacy-component'
      });
    });

    it('updateEssence rewrites source fields only when sourceComponentId is provided', async () => {
      let savedEssences = null;
      const services = createMockServices();
      const origManager = services.getCraftingSystemManager();
      const sys = origManager.getSystem('sys1');
      if (sys) {
        sys.components = [makeItem({
          id: 'new-component',
          name: 'New Component',
          sourceItemUuid: 'Compendium.fabricate.items.new-component'
        })];
        sys.essenceDefinitions = [
          {
            id: 'ess1',
            name: 'Fire',
            description: 'Burning essence',
            icon: 'fas fa-fire',
            sourceItemUuid: 'old-component',
            associatedSystemItemId: 'old-component'
          }
        ];
      }
      services.getCraftingSystemManager = () => ({
        ...origManager,
        updateSystem: async (id, updates) => {
          if (updates.essenceDefinitions) savedEssences = updates.essenceDefinitions;
          await origManager.updateSystem(id, updates);
        }
      });

      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      await store.updateEssence('ess1', {
        name: 'Fire',
        sourceComponentId: 'new-component'
      });

      assert.equal(savedEssences?.[0].sourceComponentId, 'new-component');
      assert.equal(savedEssences?.[0].sourceItemUuid, 'Compendium.fabricate.items.new-component');
      assert.equal(savedEssences?.[0].associatedSystemItemId, 'new-component');
    });

    it('updateEssence clears source evidence only when the source field is explicitly cleared', async () => {
      let savedEssences = null;
      const services = createMockServices();
      const origManager = services.getCraftingSystemManager();
      const sys = origManager.getSystem('sys1');
      if (sys) {
        sys.essenceDefinitions = [
          {
            id: 'ess1',
            name: 'Fire',
            description: 'Burning essence',
            icon: 'fas fa-fire',
            sourceComponentId: null,
            sourceItemUuid: 'Compendium.fabricate.items.stale-fire',
            associatedSystemItemId: null
          }
        ];
      }
      services.getCraftingSystemManager = () => ({
        ...origManager,
        updateSystem: async (id, updates) => {
          if (updates.essenceDefinitions) savedEssences = updates.essenceDefinitions;
          await origManager.updateSystem(id, updates);
        }
      });

      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      await store.updateEssence('ess1', {
        name: 'Ember'
      });

      assert.equal(savedEssences?.[0].sourceItemUuid, 'Compendium.fabricate.items.stale-fire');
      await store.updateEssence('ess1', {
        name: 'Ember',
        sourceComponentId: null
      });

      assert.equal(savedEssences?.[0].sourceComponentId, null);
      assert.equal(savedEssences?.[0].sourceItemUuid, null);
      assert.equal(savedEssences?.[0].associatedSystemItemId, null);
    });

    it('updateEssence rejects duplicate names from another essence', async () => {
      let warnMsg = null;
      let updateCalled = false;
      const services = createMockServices({
        notify: {
          info: () => {},
          warn: (message) => { warnMsg = message; },
          error: () => {}
        }
      });
      const origManager = services.getCraftingSystemManager();
      const sys = origManager.getSystem('sys1');
      if (sys) {
        sys.essenceDefinitions = [
          { id: 'ess1', name: 'Fire', description: '', icon: 'fas fa-fire', sourceItemUuid: null },
          { id: 'ess2', name: 'Water', description: '', icon: 'fas fa-tint', sourceItemUuid: null }
        ];
      }
      services.getCraftingSystemManager = () => ({
        ...origManager,
        updateSystem: async () => {
          updateCalled = true;
        }
      });

      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      const didSave = await store.updateEssence('ess2', {
        name: 'Fire',
        description: 'Duplicate'
      });

      assert.equal(didSave, false);
      assert.ok(warnMsg, 'duplicate rename should warn');
      assert.equal(updateCalled, false, 'duplicate rename should not persist');
    });

    it('addEssence followed by removeEssence round-trips correctly', async () => {
      let lastSavedEssences = null;
      const services = createMockServices();
      const origManager = services.getCraftingSystemManager();
      const sys = origManager.getSystem('sys1');
      if (sys) sys.essenceDefinitions = [];
      services.getCraftingSystemManager = () => ({
        ...origManager,
        updateSystem: async (id, updates) => {
          if (updates.essenceDefinitions) {
            lastSavedEssences = updates.essenceDefinitions;
            const s = origManager.getSystem(id);
            if (s) s.essenceDefinitions = updates.essenceDefinitions;
          }
          await origManager.updateSystem(id, updates);
        }
      });
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      await store.addEssence('Fire', 'Burning', 'fas fa-fire', null);
      assert.ok(lastSavedEssences !== null);
      const addedEssence = lastSavedEssences.find(e => e.name === 'Fire');
      assert.ok(addedEssence, 'essence should exist after add');
      assert.ok(addedEssence.id, 'essence should have an id');
      await store.removeEssence(addedEssence.id);
      assert.ok(!lastSavedEssences.some(e => e.id === addedEssence.id), 'essence should be removed after removeEssence');
    });
  });

  // -------------------------------------------------------------------------
  // 9. Recipe list operations
  // -------------------------------------------------------------------------

  describe('recipe list operations', () => {
    it('deleteRecipe shows confirm and calls recipeManager.deleteRecipe', async () => {
      let confirmCalled = false;
      let deletedId = null;
      const services = createMockServices({
        confirmDialog: async () => { confirmCalled = true; return true; }
      });
      const origManager = services.getRecipeManager();
      services.getRecipeManager = () => ({
        ...origManager,
        deleteRecipe: async (id) => { deletedId = id; await origManager.deleteRecipe(id); }
      });
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      await store.deleteRecipe('r1');
      assert.ok(confirmCalled, 'should call confirmDialog');
      assert.equal(deletedId, 'r1');
    });

    it('deleteRecipe does nothing when confirm declined', async () => {
      let deletedId = null;
      const services = createMockServices({
        confirmDialog: async () => false
      });
      const origManager = services.getRecipeManager();
      services.getRecipeManager = () => ({
        ...origManager,
        deleteRecipe: async (id) => { deletedId = id; }
      });
      const store = createAdminStore(services);
      await store.deleteRecipe('r1');
      assert.equal(deletedId, null, 'should not delete when declined');
    });

    it('duplicateRecipe clones recipe with (Copy) suffix', async () => {
      let createdData = null;
      const services = createMockServices();
      const origManager = services.getRecipeManager();
      services.getRecipeManager = () => ({
        ...origManager,
        createRecipe: async (data) => { createdData = data; return origManager.createRecipe(data); }
      });
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      await store.duplicateRecipe('r1');
      assert.ok(createdData !== null);
      assert.ok(createdData.name.includes('(Copy)'), `Expected "(Copy)" in name: ${createdData.name}`);
      assert.ok(!createdData.id, 'duplicated recipe should not have an id');
    });

    it('toggleRecipeEnabled calls recipeManager.updateRecipe', async () => {
      let updateArgs = null;
      const services = createMockServices();
      const origManager = services.getRecipeManager();
      services.getRecipeManager = () => ({
        ...origManager,
        updateRecipe: async (id, updates) => { updateArgs = { id, updates }; await origManager.updateRecipe(id, updates); }
      });
      const store = createAdminStore(services);
      await store.toggleRecipeEnabled('r1', false);
      assert.ok(updateArgs !== null);
      assert.equal(updateArgs.id, 'r1');
      assert.equal(updateArgs.updates.enabled, false);
    });

    it('exportRecipes serializes recipes and calls copyToClipboard', async () => {
      let clipboardContent = null;
      const services = createMockServices({
        copyToClipboard: async (text) => { clipboardContent = text; }
      });
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      await store.exportRecipes();
      assert.ok(clipboardContent !== null, 'copyToClipboard should be called');
      const parsed = JSON.parse(clipboardContent);
      assert.ok(Array.isArray(parsed));
    });

    it('importRecipes delegates to services.renderImportDialog with selected system id', async () => {
      let importSystemId = null;
      const services = createMockServices({
        renderImportDialog: async (sysId) => { importSystemId = sysId; }
      });
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      await store.importRecipes();
      assert.equal(importSystemId, 'sys1', 'renderImportDialog should be called with the selected system id');
    });

    it('updateRecipe persists updates, refreshes, and returns true', async () => {
      let updateArgs = null;
      let refreshed = false;
      const services = createMockServices();
      const origManager = services.getRecipeManager();
      services.getRecipeManager = () => ({
        ...origManager,
        updateRecipe: async (id, updates) => { updateArgs = { id, updates }; await origManager.updateRecipe(id, updates); },
        getRecipes: (filter) => { refreshed = true; return origManager.getRecipes(filter); }
      });
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      const result = await store.updateRecipe('r1', { name: 'Renamed' });
      assert.equal(result, true);
      assert.deepEqual(updateArgs, { id: 'r1', updates: { name: 'Renamed' } });
      assert.ok(refreshed, 'updateRecipe should refresh projections');
    });

    it('updateRecipe returns false and notifies when recipeManager.updateRecipe rejects', async () => {
      const errors = [];
      const services = createMockServices({
        notify: { info: () => {}, warn: () => {}, error: (msg) => errors.push(msg) }
      });
      const origManager = services.getRecipeManager();
      services.getRecipeManager = () => ({
        ...origManager,
        updateRecipe: async () => { throw new Error('recipe boom'); }
      });
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      const result = await store.updateRecipe('r1', { name: 'Renamed' });
      assert.equal(result, false);
      assert.deepEqual(errors, ['recipe boom']);
    });

    it('createRecipe requests an incomplete shell via the allowIncomplete option', async () => {
      let createArgs = null;
      const services = createMockServices();
      const origManager = services.getRecipeManager();
      services.getRecipeManager = () => ({
        ...origManager,
        createRecipe: async (data, options) => {
          createArgs = { data, options };
          return origManager.createRecipe(data, options);
        }
      });
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      const created = await store.createRecipe();
      assert.ok(created?.id, 'createRecipe should return the created shell id');
      assert.equal(createArgs.options?.allowIncomplete, true, 'shell create must allow incomplete');
      assert.equal(createArgs.data.craftingSystemId, 'sys1');
    });

    it('updateRecipe requests allowIncomplete so identity-only shell edits are not blocked', async () => {
      let updateOptions = null;
      const services = createMockServices();
      const origManager = services.getRecipeManager();
      services.getRecipeManager = () => ({
        ...origManager,
        updateRecipe: async (id, updates, options) => {
          updateOptions = options;
          await origManager.updateRecipe(id, updates, options);
        }
      });
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      await store.updateRecipe('r1', { name: 'Renamed Shell' });
      assert.equal(updateOptions?.allowIncomplete, true, 'editor save must allow incomplete');
    });

    it('addRecipeItemFromUuid passes through the manager result', async () => {
      const passthrough = { item: { id: 'item-x' }, action: 'created' };
      const services = createMockServices();
      const origManager = services.getCraftingSystemManager();
      services.getCraftingSystemManager = () => ({
        ...origManager,
        addRecipeItemFromUuid: async () => passthrough
      });
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      const result = await store.addRecipeItemFromUuid('sys1', 'Item.abc');
      assert.deepEqual(result, passthrough);
    });

    it('addRecipeItemFromUuid returns false and notifies when the manager rejects', async () => {
      const errors = [];
      const services = createMockServices({
        notify: { info: () => {}, warn: () => {}, error: (msg) => errors.push(msg) }
      });
      const origManager = services.getCraftingSystemManager();
      services.getCraftingSystemManager = () => ({
        ...origManager,
        addRecipeItemFromUuid: async () => { throw new Error('link boom'); }
      });
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      const result = await store.addRecipeItemFromUuid('sys1', 'Item.abc');
      assert.equal(result, false);
      assert.deepEqual(errors, ['link boom']);
    });

  });

  // -------------------------------------------------------------------------
  // 9b. System import/export
  // -------------------------------------------------------------------------

  describe('system import/export', () => {
    it('exportSystem calls downloadFile with JSON payload', async () => {
      let downloadedJson = null;
      let downloadedFilename = null;
      const services = createMockServices({
        getModuleVersion: () => '1.0.0-rc.12',
        downloadFile: async (json, filename) => {
          downloadedJson = json;
          downloadedFilename = filename;
        }
      });
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      await store.exportSystem();
      assert.ok(downloadedJson !== null, 'downloadFile should be called');
      assert.ok(downloadedFilename.startsWith('fabricate-'), 'filename should start with fabricate-');
      assert.ok(downloadedFilename.endsWith('.json'), 'filename should end with .json');
      const parsed = JSON.parse(downloadedJson);
      assert.equal(parsed.fabricateVersion, '1.0.0-rc.12');
      assert.ok(parsed.system, 'payload should have system');
      assert.ok(Array.isArray(parsed.recipes), 'payload should have recipes array');
    });

    it('exportSystem replaces craftingSystemId with placeholder', async () => {
      let downloadedJson = null;
      const services = createMockServices({
        getModuleVersion: () => '1.0.0',
        downloadFile: async (json) => { downloadedJson = json; }
      });
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      await store.exportSystem();
      const parsed = JSON.parse(downloadedJson);
      for (const recipe of parsed.recipes) {
        assert.equal(recipe.craftingSystemId, '__SYSTEM_ID__');
      }
    });

    it('exportSystem warns when no system is selected', async () => {
      let warnMsg = null;
      let downloadCalled = false;
      const services = createMockServices({
        notify: { info: () => {}, warn: (m) => { warnMsg = m; }, error: () => {} },
        downloadFile: async () => { downloadCalled = true; }
      });
      const origManager = services.getCraftingSystemManager();
      services.getCraftingSystemManager = () => ({
        ...origManager,
        getSystems: () => [],
        getSystem: () => null
      });
      const store = createAdminStore(services);
      await store.exportSystem();
      assert.ok(warnMsg !== null, 'should warn');
      assert.ok(!downloadCalled, 'downloadFile should not be called');
    });

    it('exportSystem accepts explicit systemId parameter', async () => {
      let downloadedJson = null;
      const services = createMockServices({
        getModuleVersion: () => '1.0.0',
        downloadFile: async (json) => { downloadedJson = json; }
      });
      const store = createAdminStore(services);
      // Don't select — pass systemId directly
      await store.exportSystem('sys1');
      assert.ok(downloadedJson !== null, 'downloadFile should be called');
      const parsed = JSON.parse(downloadedJson);
      assert.equal(parsed.system.name, 'System One');
    });

    it('importSystem delegates to services.renderSystemImportDialog', async () => {
      let dialogCalled = false;
      const services = createMockServices({
        renderSystemImportDialog: async () => { dialogCalled = true; }
      });
      const store = createAdminStore(services);
      await store.importSystem();
      assert.ok(dialogCalled, 'renderSystemImportDialog should be called');
    });
  });

  // -------------------------------------------------------------------------
  // 10. Item operations
  // -------------------------------------------------------------------------

  describe('item operations', () => {
    it('deleteComponent shows confirm and calls systemManager.deleteItem', async () => {
      let confirmCalled = false;
      let deletedArgs = null;
      const services = createMockServices({
        confirmDialog: async () => { confirmCalled = true; return true; }
      });
      const origManager = services.getCraftingSystemManager();
      const sys = origManager.getSystem('sys1');
      if (sys) sys.items = [makeItem({ id: 'item1', name: 'Herb' })];
      services.getCraftingSystemManager = () => ({
        ...origManager,
        deleteItem: async (sysId, itemId) => { deletedArgs = { sysId, itemId }; await origManager.deleteItem(sysId, itemId); }
      });
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      await store.deleteComponent('item1');
      assert.ok(confirmCalled, 'should call confirmDialog');
      assert.ok(deletedArgs !== null);
      assert.equal(deletedArgs.itemId, 'item1');
    });

    it('deleteComponent does nothing when confirm declined', async () => {
      let deletedArgs = null;
      const services = createMockServices({
        confirmDialog: async () => false
      });
      const origManager = services.getCraftingSystemManager();
      const sys = origManager.getSystem('sys1');
      if (sys) sys.items = [makeItem({ id: 'item1', name: 'Herb' })];
      services.getCraftingSystemManager = () => ({
        ...origManager,
        deleteItem: async (sysId, itemId) => { deletedArgs = { sysId, itemId }; }
      });
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      await store.deleteComponent('item1');
      assert.equal(deletedArgs, null, 'should not delete when declined');
    });

    it('deleteComponent resolves components from system.components when no items alias exists', async () => {
      let deletedArgs = null;
      const services = createMockServices();
      const origManager = services.getCraftingSystemManager();
      const sys = origManager.getSystem('sys1');
      if (sys) {
        sys.components = [makeItem({ id: 'comp-1', name: 'Herb' })];
        delete sys.items;
      }
      services.getCraftingSystemManager = () => ({
        ...origManager,
        deleteItem: async (sysId, itemId) => { deletedArgs = { sysId, itemId }; }
      });
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      await store.deleteComponent('comp-1');
      assert.deepEqual(deletedArgs, { sysId: 'sys1', itemId: 'comp-1' });
    });

    it('updateComponent forwards updates to systemManager.updateItem and refreshes', async () => {
      let updateArgs = null;
      const services = createMockServices();
      const origManager = services.getCraftingSystemManager();
      const sys = origManager.getSystem('sys1');
      if (sys) sys.items = [makeItem({ id: 'item1', name: 'Herb' })];
      services.getCraftingSystemManager = () => ({
        ...origManager,
        updateItem: async (sysId, itemId, updates) => { updateArgs = { sysId, itemId, updates }; }
      });
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      const result = await store.updateComponent('item1', { tags: ['herb'], essences: { earth: 2 } });
      assert.equal(result, true);
      assert.deepEqual(updateArgs, { sysId: 'sys1', itemId: 'item1', updates: { tags: ['herb'], essences: { earth: 2 } } });
    });

    it('updateComponent returns false when systemManager.updateItem rejects', async () => {
      const errors = [];
      const services = createMockServices({
        notify: { info: () => {}, warn: () => {}, error: (msg) => errors.push(msg) }
      });
      const origManager = services.getCraftingSystemManager();
      services.getCraftingSystemManager = () => ({
        ...origManager,
        updateItem: async () => { throw new Error('boom'); }
      });
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      const result = await store.updateComponent('item1', { tags: ['herb'] });
      assert.equal(result, false);
      assert.deepEqual(errors, ['boom']);
    });

    it('updateComponent is a no-op when itemId or system is missing', async () => {
      let updateCalled = false;
      const services = createMockServices();
      const origManager = services.getCraftingSystemManager();
      services.getCraftingSystemManager = () => ({
        ...origManager,
        updateItem: async () => { updateCalled = true; }
      });
      const store = createAdminStore(services);
      const result = await store.updateComponent('', { tags: [] });
      assert.equal(result, false);
      assert.equal(updateCalled, false);
    });
  });

  // -------------------------------------------------------------------------
  // 11. Search
  // -------------------------------------------------------------------------

  describe('search', () => {
    it('setRecipeSearch filters viewState recipes by name', async () => {
      const services = createMockServices();
      const origManager = services.getRecipeManager();
      services.getRecipeManager = () => ({
        ...origManager,
        getRecipes: (filter) => {
          return [
            makeRecipe({ id: 'r1', name: 'Healing Potion', craftingSystemId: 'sys1' }),
            makeRecipe({ id: 'r2', name: 'Fire Sword', craftingSystemId: 'sys1' })
          ].filter(r => !filter?.craftingSystemId || r.craftingSystemId === filter.craftingSystemId);
        }
      });
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      await store.setRecipeSearch('healing');
      const vs = get(store.viewState);
      assert.ok(vs.recipes.every(r => r.name.toLowerCase().includes('healing')));
      assert.ok(!vs.recipes.some(r => r.id === 'r2'));
    });

    it('setItemSearch filters viewState item cards', async () => {
      const services = createMockServices();
      const origManager = services.getCraftingSystemManager();
      const sys = origManager.getSystem('sys1');
      if (sys) {
        sys.items = [
          makeItem({ id: 'item1', name: 'Iron Ore' }),
          makeItem({ id: 'item2', name: 'Gold Nugget' })
        ];
      }
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      await store.setItemSearch('iron');
      const vs = get(store.viewState);
      assert.ok(vs.itemCards.every(i => i.name.toLowerCase().includes('iron')));
      assert.ok(!vs.itemCards.some(i => i.id === 'item2'));
    });
  });

  // -------------------------------------------------------------------------
  // 12. Config save actions
  // -------------------------------------------------------------------------

  describe('config save actions', () => {
    it('saveCraftingCheckConfig parses outcomes text and calls updateSystem', async () => {
      let updateArgs = null;
      const services = createMockServices();
      const origManager = services.getCraftingSystemManager();
      services.getCraftingSystemManager = () => ({
        ...origManager,
        updateSystem: async (id, updates) => { updateArgs = { id, updates }; await origManager.updateSystem(id, updates); }
      });
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      await store.saveCraftingCheckConfig('namedOutcomes', 'macro-uuid', 'critical, success, failure');
      assert.ok(updateArgs !== null);
      assert.equal(updateArgs.updates.craftingCheck.mode, 'namedOutcomes');
      assert.deepEqual(updateArgs.updates.craftingCheck.outcomes, ['critical', 'success', 'failure']);
    });

    it('saveCraftingCheckConfig treats empty outcomesText as empty outcomes array', async () => {
      let updateArgs = null;
      const services = createMockServices();
      const origManager = services.getCraftingSystemManager();
      services.getCraftingSystemManager = () => ({
        ...origManager,
        updateSystem: async (id, updates) => { updateArgs = { id, updates }; await origManager.updateSystem(id, updates); }
      });
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      await store.saveCraftingCheckConfig('passFail', null, '');
      assert.ok(updateArgs !== null);
      assert.deepEqual(updateArgs.updates.craftingCheck.outcomes, []);
    });

    it('saveCraftingCheckConfig preserves existing canonical check fields', async () => {
      let updateArgs = null;
      const services = createMockServices();
      const origManager = services.getCraftingSystemManager();
      const sys = origManager.getSystem('sys1');
      if (sys) {
        sys.craftingCheck = {
          enabled: true,
          mode: 'passFail',
          macroUuid: 'macro-old',
          successMacroUuid: 'macro-success',
          failureMacroUuid: 'macro-failure',
          consumption: {
            consumeIngredientsOnFail: false,
            consumeCatalystsOnFail: true
          },
          progressive: {
            awardMode: 'partial',
            allowPlayerReorder: true
          },
          outcomes: ['fail', 'pass']
        };
      }
      services.getCraftingSystemManager = () => ({
        ...origManager,
        updateSystem: async (id, updates) => { updateArgs = { id, updates }; await origManager.updateSystem(id, updates); }
      });
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      await store.saveCraftingCheckConfig('namedOutcomes', 'macro-new', 'critical, success');
      assert.ok(updateArgs !== null);
      assert.equal(updateArgs.updates.craftingCheck.successMacroUuid, 'macro-success');
      assert.equal(updateArgs.updates.craftingCheck.failureMacroUuid, 'macro-failure');
      assert.equal(updateArgs.updates.craftingCheck.consumption.consumeIngredientsOnFail, false);
      assert.equal(updateArgs.updates.craftingCheck.progressive.awardMode, 'partial');
    });

    it('addCurrencyUnit and updateCurrencyUnit persist editable unit fields', async () => {
      let updateArgs = null;
      const services = createMockServices();
      const origManager = services.getCraftingSystemManager();
      services.getCraftingSystemManager = () => ({
        ...origManager,
        updateSystem: async (id, updates) => { updateArgs = { id, updates }; await origManager.updateSystem(id, updates); }
      });
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      const created = await store.addCurrencyUnit('sys1', {
        id: 'gp',
        label: 'Gold',
        abbreviation: 'gp',
        icon: 'fa-solid fa-coins',
        actorPath: 'system.currency.gp'
      });
      assert.equal(created.id, 'gp');
      await store.updateCurrencyUnit('sys1', 'gp', { label: 'Gold pieces', actorPath: 'system.currency.gp.value' });
      assert.ok(updateArgs !== null);
      const currency = updateArgs.updates.requirements.currency;
      assert.equal(currency.units[0].id, 'gp');
      assert.equal(currency.units[0].label, 'Gold pieces');
      assert.equal(currency.units[0].actorPath, 'system.currency.gp.value');
      assert.equal('provider' in currency, false);
    });

    it('currency sub-unit actions add, update, and remove denomination breakdowns', async () => {
      let updateArgs = null;
      const services = createMockServices({
        randomID: (() => {
          const ids = ['cp', 'sp'];
          let index = 0;
          return () => ids[index++] || `id-${index}`;
        })()
      });
      const origManager = services.getCraftingSystemManager();
      services.getCraftingSystemManager = () => ({
        ...origManager,
        updateSystem: async (id, updates) => { updateArgs = { id, updates }; await origManager.updateSystem(id, updates); }
      });
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      await store.addCurrencyUnit('sys1', { id: 'cp', label: 'Copper', abbreviation: 'cp', actorPath: 'system.currency.cp' });
      await store.addCurrencyUnit('sys1', { id: 'sp', label: 'Silver', abbreviation: 'sp', actorPath: 'system.currency.sp' });
      await store.addCurrencySubUnit('sys1', 'sp', 'cp');
      await store.updateCurrencySubUnit('sys1', 'sp', 'cp', 10);
      assert.ok(updateArgs !== null);
      let silver = updateArgs.updates.requirements.currency.units.find(unit => unit.id === 'sp');
      assert.deepEqual(silver.contains, [{ unitId: 'cp', amount: 10 }]);

      await store.deleteCurrencySubUnit('sys1', 'sp', 'cp');
      silver = updateArgs.updates.requirements.currency.units.find(unit => unit.id === 'sp');
      assert.deepEqual(silver.contains, []);
    });

    it('seedCurrencyUnitPresets adds dnd5e units idempotently', async () => {
      let updateArgs = null;
      const services = createMockServices({
        getFoundrySystemId: () => 'dnd5e'
      });
      const origManager = services.getCraftingSystemManager();
      services.getCraftingSystemManager = () => ({
        ...origManager,
        updateSystem: async (id, updates) => { updateArgs = { id, updates }; await origManager.updateSystem(id, updates); }
      });
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      const first = await store.seedCurrencyUnitPresets('sys1');
      const second = await store.seedCurrencyUnitPresets('sys1');
      assert.equal(first.unsupported, false);
      assert.equal(first.added.length, 5);
      assert.equal(second.added.length, 0);
      assert.equal(second.skipped.length, 5);
      assert.equal(updateArgs.updates.requirements.currency.units.some(unit => unit.id === 'gp'), true);
    });

    it('seedCurrencyUnitPresets sets pf2eInventory spend strategy for pf2e worlds', async () => {
      let updateArgs = null;
      const services = createMockServices({
        getFoundrySystemId: () => 'pf2e'
      });
      const origManager = services.getCraftingSystemManager();
      services.getCraftingSystemManager = () => ({
        ...origManager,
        updateSystem: async (id, updates) => { updateArgs = { id, updates }; await origManager.updateSystem(id, updates); }
      });
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      const result = await store.seedCurrencyUnitPresets('sys1');
      assert.equal(result.unsupported, false);
      assert.equal(updateArgs.updates.requirements.currency.spendStrategy, 'pf2eInventory');
      const gp = updateArgs.updates.requirements.currency.units.find(unit => unit.id === 'gp');
      assert.equal(gp.denomination, 'gp');
    });

    it('seedCurrencyUnitPresets does not overwrite a user-edited seeded unit', async () => {
      let updateArgs = null;
      const services = createMockServices({
        getFoundrySystemId: () => 'dnd5e'
      });
      const origManager = services.getCraftingSystemManager();
      services.getCraftingSystemManager = () => ({
        ...origManager,
        updateSystem: async (id, updates) => { updateArgs = { id, updates }; await origManager.updateSystem(id, updates); }
      });
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      await store.seedCurrencyUnitPresets('sys1');
      await store.updateCurrencyUnit('sys1', 'gp', { label: 'Custom Gold', actorPath: 'system.currency.gp.value' });
      const second = await store.seedCurrencyUnitPresets('sys1');
      assert.equal(second.added.length, 0);
      const units = updateArgs.updates.requirements.currency.units;
      const gold = units.find(unit => unit.id === 'gp');
      assert.equal(gold.label, 'Custom Gold');
      assert.equal(gold.actorPath, 'system.currency.gp.value');
      // No duplicate gp unit was introduced by the second seed.
      assert.equal(units.filter(unit => unit.id === 'gp').length, 1);
    });

    it('deleteCurrencyUnit removes the unit and strips it from other units\' sub-units', async () => {
      let updateArgs = null;
      const services = createMockServices();
      const origManager = services.getCraftingSystemManager();
      services.getCraftingSystemManager = () => ({
        ...origManager,
        updateSystem: async (id, updates) => { updateArgs = { id, updates }; await origManager.updateSystem(id, updates); }
      });
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      await store.addCurrencyUnit('sys1', { id: 'cp', label: 'Copper', abbreviation: 'cp', actorPath: 'system.currency.cp' });
      await store.addCurrencyUnit('sys1', { id: 'sp', label: 'Silver', abbreviation: 'sp', actorPath: 'system.currency.sp' });
      await store.addCurrencySubUnit('sys1', 'sp', 'cp', 10);
      await store.deleteCurrencyUnit('sys1', 'cp');
      const units = updateArgs.updates.requirements.currency.units;
      assert.equal(units.some(unit => unit.id === 'cp'), false);
      const silver = units.find(unit => unit.id === 'sp');
      assert.deepEqual(silver.contains, []);
    });

    it('saveAlchemyConfig persists canonical alchemy settings', async () => {
      let updateArgs = null;
      const services = createMockServices();
      const origManager = services.getCraftingSystemManager();
      const sys = origManager.getSystem('sys1');
      if (sys) {
        sys.resolutionMode = 'alchemy';
        sys.alchemy = {
          learnOnCraft: false,
          consumeOnFail: true,
          showAttemptHistoryToPlayers: true
        };
      }
      services.getCraftingSystemManager = () => ({
        ...origManager,
        updateSystem: async (id, updates) => { updateArgs = { id, updates }; await origManager.updateSystem(id, updates); }
      });
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      await store.saveAlchemyConfig({
        learnOnCraft: true,
        consumeOnFail: false,
        showAttemptHistoryToPlayers: false
      });
      assert.ok(updateArgs !== null);
      assert.equal(updateArgs.updates.alchemy.learnOnCraft, true);
      assert.equal(updateArgs.updates.alchemy.consumeOnFail, false);
      assert.equal(updateArgs.updates.alchemy.showAttemptHistoryToPlayers, false);
    });

    it('saveVisibilityConfig merges with existing visibility config', async () => {
      let updateArgs = null;
      const services = createMockServices();
      const origManager = services.getCraftingSystemManager();
      const sys = origManager.getSystem('sys1');
      if (sys) {
        sys.recipeVisibility = {
          listMode: 'global',
          knowledge: { mode: 'itemOrLearned', learn: { consumeOnLearn: true } }
        };
      }
      services.getCraftingSystemManager = () => ({
        ...origManager,
        updateSystem: async (id, updates) => { updateArgs = { id, updates }; await origManager.updateSystem(id, updates); }
      });
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      await store.saveVisibilityConfig('knowledge', 'learned', false);
      assert.ok(updateArgs !== null);
      const rv = updateArgs.updates.recipeVisibility;
      assert.equal(rv.listMode, 'knowledge');
      assert.equal(rv.knowledge.mode, 'learned');
      assert.equal(rv.knowledge.learn.consumeOnLearn, false);
    });

    it('saveVisibilityConfig accepts canonical knowledge item and learn fields', async () => {
      let updateArgs = null;
      const services = createMockServices();
      const origManager = services.getCraftingSystemManager();
      const sys = origManager.getSystem('sys1');
      if (sys) {
        sys.recipeVisibility = {
          listMode: 'knowledge',
          knowledge: {
            mode: 'itemOrLearned',
            item: { limitUses: false, destroyWhenExhausted: false },
            learn: { consumeOnLearn: true, dragDropEnabled: true }
          }
        };
      }
      services.getCraftingSystemManager = () => ({
        ...origManager,
        updateSystem: async (id, updates) => { updateArgs = { id, updates }; await origManager.updateSystem(id, updates); }
      });

      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      await store.saveVisibilityConfig({
        listMode: 'knowledge',
        knowledgeMode: 'itemOrLearned',
        consumeOnLearn: false,
        limitUses: true,
        maxUses: 3,
        destroyWhenExhausted: true,
        dragDropEnabled: false
      });

      const rv = updateArgs.updates.recipeVisibility;
      assert.equal(rv.listMode, 'knowledge');
      assert.equal(rv.knowledge.item.limitUses, true);
      assert.equal(rv.knowledge.item.maxUses, 3);
      assert.equal(rv.knowledge.item.destroyWhenExhausted, true);
      assert.equal(rv.knowledge.learn.consumeOnLearn, false);
      assert.equal(rv.knowledge.learn.dragDropEnabled, false);
    });
  });

  // -------------------------------------------------------------------------
  // 12b. Teaser config
  // -------------------------------------------------------------------------

  describe('teaser config', () => {
    it('saveTeaserConfig persists teaser config via updateSystem', async () => {
      let updateArgs = null;
      const services = createMockServices();
      const origManager = services.getCraftingSystemManager();
      services.getCraftingSystemManager = () => ({
        ...origManager,
        updateSystem: async (id, updates) => { updateArgs = { id, updates }; await origManager.updateSystem(id, updates); }
      });
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      const teaserConfig = { enabled: true, discoveryMode: 'fragments', fragments: [{ id: 'f1', name: 'Shard', progressValue: 50 }] };
      await store.saveTeaserConfig(teaserConfig);
      assert.ok(updateArgs !== null);
      assert.deepStrictEqual(updateArgs.updates.teaserConfig, teaserConfig);
    });

    it('viewState includes teaserConfig from selected system', async () => {
      const services = createMockServices();
      const origManager = services.getCraftingSystemManager();
      const sys = origManager.getSystem('sys1');
      if (sys) {
        sys.teaserConfig = { enabled: true, discoveryMode: 'threshold', fragments: [] };
      }
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      const vs = get(store.viewState);
      assert.equal(vs.selectedSystem.teaserConfig.enabled, true);
      assert.equal(vs.selectedSystem.teaserConfig.discoveryMode, 'threshold');
    });
  });

  // -------------------------------------------------------------------------
  // 13. State isolation
  // -------------------------------------------------------------------------

  describe('state isolation', () => {
    it('two store instances do not share state', async () => {
      const services = createMockServices();
      const storeA = createAdminStore(services);
      const storeB = createAdminStore(services);

      storeA.recipeSearch.set('hello');

      assert.equal(get(storeA.recipeSearch), 'hello');
      assert.equal(get(storeB.recipeSearch), '');
    });
  });

  // -------------------------------------------------------------------------
  // Factory shape
  // -------------------------------------------------------------------------

  describe('factory output shape', () => {
    it('returns all expected properties', () => {
      const services = createMockServices();
      const store = createAdminStore(services);

      const expectedKeys = [
        'selectedSystemId', 'activeTab', 'recipeSearch', 'itemSearch',
        'viewState',
        'selectSystem', 'createSystem', 'deleteSystem', 'saveSystemDetails',
        'setTab',
        'toggleSystemEnabled', 'toggleFeature', 'toggleRequirement',
        'addCategory', 'removeCategory',
        'addTag', 'removeTag',
        'addEssence', 'removeEssence',
        'saveCraftingCheckConfig',
        'addCurrencyUnit', 'updateCurrencyUnit', 'deleteCurrencyUnit',
        'addCurrencySubUnit', 'updateCurrencySubUnit', 'deleteCurrencySubUnit',
        'seedCurrencyUnitPresets',
        'saveVisibilityConfig', 'saveTeaserConfig',
        'deleteRecipe', 'duplicateRecipe', 'toggleRecipeEnabled',
        'importRecipes', 'exportRecipes',
        'exportSystem', 'importSystem',
        'deleteComponent', 'updateComponent',
        'setRecipeSearch', 'setItemSearch',
        'refresh', 'destroy'
      ];

      for (const key of expectedKeys) {
        assert.ok(key in store, `Expected store to have property: ${key}`);
      }
    });
  });

  // -------------------------------------------------------------------------
  // 14. ViewState data contracts
  // -------------------------------------------------------------------------

  describe('viewState data contracts', () => {
    it('viewState.systems entries include manager summary fields', async () => {
      const services = createMockServices();
      const store = createAdminStore(services);
      await store.refresh();
      const vs = get(store.viewState);
      for (const sys of vs.systems) {
        assert.ok('id' in sys, 'system entry should have id');
        assert.ok('name' in sys, 'system entry should have name');
        assert.ok('description' in sys, 'system entry should have description');
        assert.ok('enabled' in sys, 'system entry should have enabled status');
        assert.ok('resolutionMode' in sys, 'system entry should have resolution mode');
        assert.ok('featureCount' in sys, 'system entry should have enabled feature count');
        assert.ok('componentCount' in sys, 'system entry should have component count');
        assert.ok('recipeCount' in sys, 'system entry should have recipe count');
        assert.ok('selected' in sys, 'system entry should have selected flag');
      }
    });

    it('viewState.systems marks the selected system with selected:true and others with selected:false', async () => {
      const services = createMockServices();
      const origManager = services.getCraftingSystemManager();
      // Add a second system — the mock auto-generates the id so we find it by name
      await origManager.createSystem({ name: 'System Two' });
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      const vs = get(store.viewState);
      assert.equal(vs.systems.length, 2, 'there should be 2 systems');
      const selected = vs.systems.filter(s => s.selected === true);
      const notSelected = vs.systems.filter(s => s.selected === false);
      assert.equal(selected.length, 1, 'exactly one system should be selected');
      assert.equal(selected[0].id, 'sys1', 'sys1 should be the selected system');
      assert.equal(notSelected.length, 1, 'the other system should have selected:false');
    });

    it('viewState.selectedSystem contains all required shape keys', async () => {
      const services = createMockServices();
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      const vs = get(store.viewState);
      const sys = vs.selectedSystem;
      assert.ok(sys !== null, 'selectedSystem should not be null');
      const requiredKeys = [
        'id', 'name', 'description', 'enabled', 'features',
        'categories', 'itemTags', 'essenceDefinitions', 'managedItemOptions',
        'requirements', 'craftingCheck', 'recipeVisibility',
        'showRecipeVisibilityKnowledgeOptions', 'showRecipeVisibilityPlayerNote',
        'showTags', 'showEssences', 'availableScriptMacros', 'sceneOptions', 'rollTableOptions'
      ];
      for (const key of requiredKeys) {
        assert.ok(key in sys, `selectedSystem should have key: ${key}`);
      }
    });

    it('viewState.selectedSystem.features has all expected feature keys', async () => {
      const services = createMockServices();
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      const vs = get(store.viewState);
      const features = vs.selectedSystem?.features;
      assert.ok(features, 'features should exist');
      assert.ok(!('complexRecipes' in features), 'complexRecipes is no longer a normalized feature (#102)');
      for (const key of [
        'recipeCategories', 'itemTags', 'essences',
        'multiStepRecipes', 'propertyMacros', 'craftingChecks',
        'outcomeRouting', 'effectTransfer', 'gathering'
      ]) {
        assert.ok(key in features, `features should have key: ${key}`);
      }
    });

    it('viewState.selectedSystem.features preserves gathering when enabled', async () => {
      const services = createMockServices();
      const sys = services.getCraftingSystemManager().getSystem('sys1');
      if (sys) {
        sys.features = { gathering: true };
      }

      const store = createAdminStore(services);
      await store.selectSystem('sys1');

      const vs = get(store.viewState);
      assert.equal(vs.selectedSystem?.features.gathering, true);
    });

    it('exposes and persists gathering config libraries and global conditions', async () => {
      const services = createMockServices({
        randomID: (() => {
          let id = 0;
          return () => `gid-${++id}`;
        })(),
        localize: (key) => key === 'FABRICATE.Admin.Manager.Environment.NewLibraryTask' ? 'New Gathering Task' : key
      });
      const sys = services.getCraftingSystemManager().getSystem('sys1');
      sys.features = { gathering: true };
      sys.components = [{ id: 'herb', name: 'Herb', img: 'herb.webp' }];

      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      await store.updateGatheringConditions({ weather: 'rain', timeOfDay: 'night' });
      const task = await store.addGatheringLibraryTask('sys1');
      assert.equal(task.name, 'New Gathering Task');
      await store.updateGatheringLibraryTask('sys1', task.id, {
        name: 'Rain Herbs',
        biomes: ['forest'],
        weather: ['rain'],
        timeOfDay: ['night'],
        dropRows: [{ id: 'drop-herb', componentId: 'herb', quantity: 2, dropRate: 80 }]
      });
      const event = await store.addGatheringLibraryEvent('sys1');
      await store.updateGatheringLibraryEvent('sys1', event.id, {
        name: 'Thorns',
        dangerTags: ['hazardous'],
        dropRate: 30
      });

      const config = services._store.gatheringConfig;
      assert.deepEqual(config.conditions, { weather: 'rain', timeOfDay: 'night' });
      assert.deepEqual(config.systems.sys1.conditions.weather, {
        enabled: true,
        current: 'rain',
        values: [
          { id: 'clear', label: 'Clear', icon: 'fas fa-sun' },
          { id: 'cloudy', label: 'Cloudy', icon: 'fas fa-cloud' },
          { id: 'rain', label: 'Rain', icon: 'fas fa-cloud-rain' },
          { id: 'storm', label: 'Storm', icon: 'fas fa-bolt' },
          { id: 'snow', label: 'Snow', icon: 'fas fa-snowflake' },
          { id: 'fog', label: 'Fog', icon: 'fas fa-smog' },
          { id: 'wind', label: 'Wind', icon: 'fas fa-wind' }
        ]
      });
      assert.deepEqual(config.systems.sys1.conditions.timeOfDay, {
        enabled: true,
        current: 'night',
        values: [
          { id: 'dawn', label: 'Dawn', icon: 'fas fa-cloud-sun' },
          { id: 'day', label: 'Day', icon: 'fas fa-sun' },
          { id: 'dusk', label: 'Dusk', icon: 'fas fa-cloud-moon' },
          { id: 'night', label: 'Night', icon: 'fas fa-moon' }
        ]
      });
      // Region is no longer a composition vocabulary; it is geography (GatheringRegion).
      assert.equal('regions' in config.vocabularies, false);
      assert.equal(config.systems.sys1.tasks[0].name, 'Rain Herbs');
      assert.deepEqual(config.systems.sys1.tasks[0].dropRows[0], {
        id: 'drop-herb',
        name: '',
        componentId: 'herb',
        itemUuid: '',
        quantity: 2,
        dropRate: 80,
        conditionModifiers: { timeOfDay: [], weather: [], biome: [] },
        characterModifiers: [],
        enabled: true
      });
      assert.equal(config.systems.sys1.events[0].name, 'Thorns');
      assert.equal(get(store.viewState).gatheringConfig.systems.sys1.events[0].dropRate, 30);
      // An event with no custom image is stamped with the shared default.
      assert.equal(config.systems.sys1.events[0].img, DEFAULT_GATHERING_EVENT_IMG);
    });

    it('auto-populates default task name and image when the first drop row receives a component', async () => {
      const services = createMockServices({
        localize: (key) => {
          if (key === 'FABRICATE.Admin.Manager.Environment.NewLibraryTask') return 'New Gathering Task';
          if (key === 'FABRICATE.Admin.Manager.Environment.Tasks.AutoNameTemplate') return 'Gather {component}';
          return key;
        }
      });
      const sys = services.getCraftingSystemManager().getSystem('sys1');
      sys.features = { gathering: true };
      sys.components = [{ id: 'ore', name: 'Raw Ore', img: 'icons/raw-ore.png' }];

      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      const task = await store.addGatheringLibraryTask('sys1');

      await store.updateGatheringLibraryTask('sys1', task.id, {
        dropRows: [{ id: 'drop-a', componentId: 'ore', quantity: 1, dropRate: 50 }]
      });

      const persisted = services._store.gatheringConfig.systems.sys1.tasks[0];
      assert.equal(persisted.name, 'Gather Raw Ore');
      assert.equal(persisted.img, 'icons/raw-ore.png');
    });

    it('does not auto-populate the task name and image when the task name has been customized', async () => {
      const services = createMockServices({
        localize: (key) => {
          if (key === 'FABRICATE.Admin.Manager.Environment.NewLibraryTask') return 'New Gathering Task';
          if (key === 'FABRICATE.Admin.Manager.Environment.Tasks.AutoNameTemplate') return 'Gather {component}';
          return key;
        }
      });
      const sys = services.getCraftingSystemManager().getSystem('sys1');
      sys.features = { gathering: true };
      sys.components = [{ id: 'ore', name: 'Raw Ore', img: 'icons/raw-ore.png' }];

      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      const task = await store.addGatheringLibraryTask('sys1');
      await store.updateGatheringLibraryTask('sys1', task.id, { name: 'Forage Roots' });

      await store.updateGatheringLibraryTask('sys1', task.id, {
        dropRows: [{ id: 'drop-a', componentId: 'ore', quantity: 1, dropRate: 50 }]
      });

      const persisted = services._store.gatheringConfig.systems.sys1.tasks[0];
      assert.equal(persisted.name, 'Forage Roots');
      assert.equal(persisted.img, DEFAULT_GATHERING_TASK_IMG);
    });

    it('normalizes defaultEnvironmentId (trimmed string or null) and round-trips it', async () => {
      const services = createMockServices();
      const sys = services.getCraftingSystemManager().getSystem('sys1');
      sys.features = { gathering: true };
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      const task = await store.addGatheringLibraryTask('sys1');

      // A fresh task defaults to null (ask on drop).
      assert.equal(services._store.gatheringConfig.systems.sys1.tasks[0].defaultEnvironmentId, null);

      // A trimmed id round-trips through persistence.
      await store.updateGatheringLibraryTask('sys1', task.id, { defaultEnvironmentId: '  env-7  ' });
      assert.equal(services._store.gatheringConfig.systems.sys1.tasks[0].defaultEnvironmentId, 'env-7');

      // An empty/whitespace id normalizes back to null (not the empty string).
      await store.updateGatheringLibraryTask('sys1', task.id, { defaultEnvironmentId: '   ' });
      assert.equal(services._store.gatheringConfig.systems.sys1.tasks[0].defaultEnvironmentId, null);
    });

    it('persists depletedBehavior swap-image on the node config (legacy deleteToken dropped)', async () => {
      const services = createMockServices();
      const sys = services.getCraftingSystemManager().getSystem('sys1');
      sys.features = { gathering: true };
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      const task = await store.addGatheringLibraryTask('sys1');

      await store.updateGatheringLibraryTask('sys1', task.id, {
        nodes: { enabled: true, max: 3, depletedBehavior: { swapImage: '  icons/x.webp ', postfixName: true } }
      });
      assert.deepEqual(
        services._store.gatheringConfig.systems.sys1.tasks[0].nodes.depletedBehavior,
        { swapImage: 'icons/x.webp', postfixName: true }
      );

      // The removed deleteToken flag is ignored; only the swap-image survives.
      await store.updateGatheringLibraryTask('sys1', task.id, {
        nodes: { enabled: true, max: 3, depletedBehavior: { deleteToken: true, swapImage: 'icons/y.webp' } }
      });
      assert.deepEqual(
        services._store.gatheringConfig.systems.sys1.tasks[0].nodes.depletedBehavior,
        { swapImage: 'icons/y.webp' }
      );
    });

    it('does not auto-populate the task name and image when the task image has been customized', async () => {
      const services = createMockServices({
        localize: (key) => {
          if (key === 'FABRICATE.Admin.Manager.Environment.NewLibraryTask') return 'New Gathering Task';
          if (key === 'FABRICATE.Admin.Manager.Environment.Tasks.AutoNameTemplate') return 'Gather {component}';
          return key;
        }
      });
      const sys = services.getCraftingSystemManager().getSystem('sys1');
      sys.features = { gathering: true };
      sys.components = [{ id: 'ore', name: 'Raw Ore', img: 'icons/raw-ore.png' }];

      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      const task = await store.addGatheringLibraryTask('sys1');
      await store.updateGatheringLibraryTask('sys1', task.id, { img: 'icons/svg/leaf.svg' });

      await store.updateGatheringLibraryTask('sys1', task.id, {
        dropRows: [{ id: 'drop-a', componentId: 'ore', quantity: 1, dropRate: 50 }]
      });

      const persisted = services._store.gatheringConfig.systems.sys1.tasks[0];
      assert.equal(persisted.name, 'New Gathering Task');
      assert.equal(persisted.img, 'icons/svg/leaf.svg');
    });

    it('does not auto-populate the task name and image when a second drop row receives a component', async () => {
      const services = createMockServices({
        localize: (key) => {
          if (key === 'FABRICATE.Admin.Manager.Environment.NewLibraryTask') return 'New Gathering Task';
          if (key === 'FABRICATE.Admin.Manager.Environment.Tasks.AutoNameTemplate') return 'Gather {component}';
          return key;
        }
      });
      const sys = services.getCraftingSystemManager().getSystem('sys1');
      sys.features = { gathering: true };
      sys.components = [
        { id: 'ore', name: 'Raw Ore', img: 'icons/raw-ore.png' },
        { id: 'gem', name: 'Rough Gem', img: 'icons/gem.png' }
      ];

      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      const task = await store.addGatheringLibraryTask('sys1');
      await store.updateGatheringLibraryTask('sys1', task.id, { name: 'Mining Run', img: 'icons/pickaxe.png' });
      await store.updateGatheringLibraryTask('sys1', task.id, {
        dropRows: [{ id: 'drop-a', componentId: 'ore', quantity: 1, dropRate: 50 }]
      });

      await store.updateGatheringLibraryTask('sys1', task.id, {
        dropRows: [
          { id: 'drop-a', componentId: 'ore', quantity: 1, dropRate: 50 },
          { id: 'drop-b', componentId: 'gem', quantity: 1, dropRate: 10 }
        ]
      });

      const persisted = services._store.gatheringConfig.systems.sys1.tasks[0];
      assert.equal(persisted.name, 'Mining Run');
      assert.equal(persisted.img, 'icons/pickaxe.png');
    });

    it('does not auto-populate the task name and image when an empty drop row is added', async () => {
      const services = createMockServices({
        localize: (key) => {
          if (key === 'FABRICATE.Admin.Manager.Environment.NewLibraryTask') return 'New Gathering Task';
          if (key === 'FABRICATE.Admin.Manager.Environment.Tasks.AutoNameTemplate') return 'Gather {component}';
          return key;
        }
      });
      const sys = services.getCraftingSystemManager().getSystem('sys1');
      sys.features = { gathering: true };
      sys.components = [{ id: 'ore', name: 'Raw Ore', img: 'icons/raw-ore.png' }];

      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      const task = await store.addGatheringLibraryTask('sys1');

      await store.updateGatheringLibraryTask('sys1', task.id, {
        dropRows: [{ id: 'drop-a', componentId: '', quantity: 1, dropRate: 50 }]
      });

      const persisted = services._store.gatheringConfig.systems.sys1.tasks[0];
      assert.equal(persisted.name, 'New Gathering Task');
      assert.equal(persisted.img, DEFAULT_GATHERING_TASK_IMG);
    });

    it('duplicates gathering tasks with fresh task and drop ids', async () => {
      const services = createMockServices({
        randomID: (() => {
          let id = 0;
          return () => `copy-id-${++id}`;
        })(),
        localize: (key) => key === 'FABRICATE.Admin.Manager.Environment.Tasks.CopySuffix' ? 'Copy' : key
      });
      const sys = services.getCraftingSystemManager().getSystem('sys1');
      sys.features = { gathering: true };
      services._store.gatheringConfig = {
        systems: {
          sys1: {
            tasks: [{
              id: 'task-herbs',
              name: 'Moon Herbs',
              description: 'Gather under old trees.',
              enabled: true,
              region: 'north',
              biomes: ['forest'],
              weather: ['clear'],
              timeOfDay: ['night'],
              dropRows: [
                { id: 'drop-a', componentId: 'herb', quantity: 2, dropRate: 80, conditionModifiers: { weather: [{ id: 'rain-bonus', conditionId: 'rain', value: 10 }] }, enabled: true },
                { id: 'drop-b', itemUuid: 'Item.random', quantity: 1, dropRate: 20, enabled: false }
              ],
              staminaCost: 1,
              gatheringModifier: { provider: 'macro', macroUuid: 'Macro.mod' },
              timeRequirement: { hours: 1 }
            }]
          },
          sys2: {
            tasks: [{ id: 'task-other', name: 'Other System', dropRows: [{ id: 'drop-other' }] }]
          }
        }
      };
      const store = createAdminStore(services);
      await store.selectSystem('sys1');

      const duplicate = await store.duplicateGatheringLibraryTask('sys1', 'task-herbs');

      const sys1Tasks = services._store.gatheringConfig.systems.sys1.tasks;
      assert.equal(duplicate.id, 'copy-id-1');
      assert.equal(duplicate.name, 'Moon Herbs (Copy)');
      assert.deepEqual(duplicate.dropRows.map(row => row.id), ['copy-id-2', 'copy-id-3']);
      // Region is no longer a composition axis: legacy `region`/`regions` input is
      // dropped by the task normalizer (not carried onto the record).
      assert.equal('regions' in duplicate, false);
      assert.equal('region' in duplicate, false);
      assert.deepEqual(duplicate.biomes, ['forest']);
      assert.deepEqual(duplicate.weather, ['clear']);
      assert.deepEqual(duplicate.timeOfDay, ['night']);
      assert.deepEqual(duplicate.gatheringModifier, { provider: 'macro', macroUuid: 'Macro.mod' });
      assert.deepEqual(duplicate.timeRequirement, { hours: 1 });
      assert.equal(sys1Tasks.length, 2);
      assert.deepEqual(sys1Tasks[0].dropRows.map(row => row.id), ['drop-a', 'drop-b']);
      assert.equal(services._store.gatheringConfig.systems.sys2.tasks.length, 1);
      assert.equal(services._store.gatheringConfig.systems.sys2.tasks[0].id, 'task-other');
      assert.equal(services._store.gatheringConfig.systems.sys2.tasks[0].name, 'Other System');
      assert.deepEqual(services._store.gatheringConfig.systems.sys2.tasks[0].dropRows.map(row => row.id), ['drop-other']);
      duplicate.dropRows[0].quantity = 99;
      duplicate.dropRows[0].conditionModifiers.weather[0].value = 50;
      assert.equal(sys1Tasks[0].dropRows[0].quantity, 2);
      assert.equal(sys1Tasks[0].dropRows[0].conditionModifiers.weather[0].value, 10);
      assert.equal(get(store.viewState).gatheringConfig.systems.sys1.tasks.length, 2);
    });

    it('normalizes gathering task drop chance zero, condition modifiers, and single-value availability', async () => {
      const services = createMockServices();
      const sys = services.getCraftingSystemManager().getSystem('sys1');
      sys.features = { gathering: true };
      sys.components = [{ id: 'herb', name: 'Herb', img: 'herb.webp' }];
      services._store.gatheringConfig = { systems: { sys1: { tasks: [] } } };
      const store = createAdminStore(services);
      await store.selectSystem('sys1');

      const task = await store.addGatheringLibraryTask('sys1');
      await store.updateGatheringLibraryTask('sys1', task.id, {
        weather: ['rain'],
        timeOfDay: [],
        dropRows: [{
          id: 'drop-zero',
          componentId: 'herb',
          quantity: 3,
          dropRate: 0,
          conditionModifiers: {
            weather: [{ id: 'rain-bonus', conditionId: 'Rain', value: 15 }],
            timeOfDay: [{ id: 'night-penalty', conditionId: 'night', value: -5 }]
          }
        }]
      });

      const saved = services._store.gatheringConfig.systems.sys1.tasks[0];
      assert.deepEqual(saved.weather, ['rain']);
      assert.deepEqual(saved.timeOfDay, []);
      assert.equal(saved.dropRows[0].dropRate, 0);
      assert.deepEqual(saved.dropRows[0].conditionModifiers, {
        timeOfDay: [{ id: 'night-penalty', conditionId: 'night', operator: '-', value: 5 }],
        weather: [{ id: 'rain-bonus', conditionId: 'rain', operator: '+', value: 15 }],
        biome: []
      });
    });

    it('creates new gathering library tasks with no default drops', async () => {
      const services = createMockServices();
      const sys = services.getCraftingSystemManager().getSystem('sys1');
      sys.features = { gathering: true };
      sys.components = [{ id: 'herb', name: 'Herb', img: 'herb.webp' }];
      const store = createAdminStore(services);
      await store.selectSystem('sys1');

      const task = await store.addGatheringLibraryTask('sys1');

      assert.deepEqual(task.dropRows, []);
      assert.deepEqual(services._store.gatheringConfig.systems.sys1.tasks[0].dropRows, []);
    });

    it('rejects gathering library task save when drops are missing or unresolved', async () => {
      const services = createMockServices();
      const sys = services.getCraftingSystemManager().getSystem('sys1');
      sys.features = { gathering: true };
      sys.components = [{ id: 'herb', name: 'Herb', img: 'herb.webp' }];
      const store = createAdminStore(services);
      await store.selectSystem('sys1');

      const empty = store.validateGatheringLibraryTask({ id: 't1', name: 'Gather', dropRows: [] });
      assert.equal(empty.valid, false);
      assert.ok(
        empty.errors.some(error => error.includes('requires at least one drop row')),
        `expected "requires at least one drop row" in errors: ${empty.errors.join(' | ')}`
      );

      const unresolved = store.validateGatheringLibraryTask({
        id: 't2',
        name: 'Gather',
        dropRows: [{ id: 'row-1', componentId: '', itemUuid: '', quantity: 1, dropRate: 50, enabled: true }]
      });
      assert.equal(unresolved.valid, false);
      assert.ok(
        unresolved.errors.some(error => error.includes('requires componentId or itemUuid')),
        `expected "requires componentId or itemUuid" in errors: ${unresolved.errors.join(' | ')}`
      );

      const resolved = store.validateGatheringLibraryTask({
        id: 't3',
        name: 'Gather',
        dropRows: [{ id: 'row-1', componentId: 'herb', itemUuid: '', quantity: 1, dropRate: 50, enabled: true }]
      });
      assert.equal(resolved.valid, true);
      assert.deepEqual(resolved.errors, []);

      const staleComponent = store.validateGatheringLibraryTask({
        id: 't-stale',
        name: 'Gather',
        dropRows: [{ id: 'row-stale', componentId: 'missing-herb', itemUuid: '', quantity: 1, dropRate: 50, enabled: true }]
      });
      assert.equal(staleComponent.valid, false);
      assert.ok(
        staleComponent.errors.some(error => error.includes('missing-herb') && error.includes('unknown componentId')),
        `expected stale component to be rejected: ${staleComponent.errors.join(' | ')}`
      );

      const originalFromUuidSync = globalThis.fromUuidSync;
      globalThis.fromUuidSync = (uuid) => uuid === 'Item.valid-reward' ? { documentName: 'Item' } : null;
      try {
        const staleItem = store.validateGatheringLibraryTask({
          id: 't-stale-item',
          name: 'Gather',
          dropRows: [{ id: 'row-item', componentId: '', itemUuid: 'Item.missing-reward', quantity: 1, dropRate: 50, enabled: true }]
        });
        assert.equal(staleItem.valid, false);
        assert.ok(
          staleItem.errors.some(error => error.includes('Item.missing-reward') && error.includes('does not resolve to an Item')),
          `expected stale item UUID to be rejected: ${staleItem.errors.join(' | ')}`
        );

        const validItem = store.validateGatheringLibraryTask({
          id: 't-valid-item',
          name: 'Gather',
          dropRows: [{ id: 'row-item', componentId: '', itemUuid: 'Item.valid-reward', quantity: 1, dropRate: 50, enabled: true }]
        });
        assert.equal(validItem.valid, true);
      } finally {
        globalThis.fromUuidSync = originalFromUuidSync;
      }

      const enabledResolvedPlusDisabledUnresolved = store.validateGatheringLibraryTask({
        id: 't4',
        name: 'Gather',
        dropRows: [
          { id: 'row-1', componentId: 'herb', itemUuid: '', quantity: 1, dropRate: 50, enabled: true },
          { id: 'row-2', componentId: '', itemUuid: '', quantity: 1, dropRate: 25, enabled: false }
        ]
      });
      assert.equal(enabledResolvedPlusDisabledUnresolved.valid, false);
      assert.ok(
        enabledResolvedPlusDisabledUnresolved.errors.some(error =>
          error.includes('row-2') && error.includes('requires componentId or itemUuid')
        ),
        `expected disabled unresolved row to be rejected: ${enabledResolvedPlusDisabledUnresolved.errors.join(' | ')}`
      );
    });

    it('does not persist gathering library task drops with stale reward targets', async () => {
      const errors = [];
      const services = createMockServices({ notify: { info: () => {}, warn: () => {}, error: (message) => errors.push(message) } });
      const sys = services.getCraftingSystemManager().getSystem('sys1');
      sys.features = { gathering: true };
      sys.components = [{ id: 'herb', name: 'Herb', img: 'herb.webp' }];
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      const task = await store.addGatheringLibraryTask('sys1');

      const saved = await store.updateGatheringLibraryTask('sys1', task.id, {
        dropRows: [{ id: 'row-stale', componentId: 'missing-herb', quantity: 1, dropRate: 50 }]
      });

      assert.equal(saved, false);
      assert.equal(services._store.gatheringConfig.systems.sys1.tasks[0].dropRows.length, 0);
      assert.ok(errors.some(error => error.includes('missing-herb')));
    });

    it('returns null when duplicating a missing gathering task', async () => {
      const services = createMockServices();
      services._store.gatheringConfig = {
        systems: {
          sys1: {
            tasks: [{ id: 'task-herbs', name: 'Moon Herbs', dropRows: [] }]
          }
        }
      };
      const store = createAdminStore(services);
      await store.selectSystem('sys1');

      assert.equal(await store.duplicateGatheringLibraryTask('sys1', 'missing'), null);
      assert.equal(await store.duplicateGatheringLibraryTask('missing-system', 'task-herbs'), null);
      assert.equal(services._store.gatheringConfig.systems.sys1.tasks.length, 1);
    });

    it('duplicates gathering library events with a fresh id and Copy suffix', async () => {
      const services = createMockServices({
        randomID: (() => {
          let id = 0;
          return () => `event-copy-${++id}`;
        })(),
        localize: (key) => key === 'FABRICATE.Admin.Manager.Environment.Tasks.CopySuffix' ? 'Copy' : key
      });
      const sys = services.getCraftingSystemManager().getSystem('sys1');
      sys.features = { gathering: true };
      services._store.gatheringConfig = {
        systems: {
          sys1: {
            events: [{
              id: 'event-thorns',
              name: 'Thornwall',
              description: 'Vicious thicket.',
              enabled: true,
              dangerTags: ['hazardous'],
              regions: ['north'],
              biomes: ['forest'],
              weather: ['rain'],
              timeOfDay: ['night'],
              dropRate: 35,
              eventModifier: { provider: 'macro', macroUuid: 'Macro.thorn' },
              characterModifiers: []
            }]
          },
          sys2: {
            events: [{ id: 'event-other', name: 'Other Event', dropRate: 10 }]
          }
        }
      };
      const store = createAdminStore(services);
      await store.selectSystem('sys1');

      const duplicate = await store.duplicateGatheringLibraryEvent('sys1', 'event-thorns');

      const sys1Events = services._store.gatheringConfig.systems.sys1.events;
      assert.equal(duplicate.id, 'event-copy-1');
      assert.equal(duplicate.name, 'Thornwall (Copy)');
      // Region dropped from event composition (legacy `regions` input not carried).
      assert.equal('regions' in duplicate, false);
      assert.deepEqual(duplicate.biomes, ['forest']);
      assert.deepEqual(duplicate.weather, ['rain']);
      assert.deepEqual(duplicate.timeOfDay, ['night']);
      assert.deepEqual(duplicate.dangerTags, ['hazardous']);
      assert.equal(duplicate.dropRate, 35);
      assert.deepEqual(duplicate.eventModifier, { provider: 'macro', macroUuid: 'Macro.thorn' });
      assert.equal(sys1Events.length, 2);
      assert.equal(sys1Events[0].id, 'event-thorns');
      assert.equal(services._store.gatheringConfig.systems.sys2.events.length, 1);
      assert.equal(get(store.viewState).gatheringConfig.systems.sys1.events.length, 2);
    });

    it('returns null when duplicating a missing gathering event', async () => {
      const services = createMockServices();
      services._store.gatheringConfig = {
        systems: {
          sys1: {
            events: [{ id: 'event-thorns', name: 'Thornwall', dropRate: 25 }]
          }
        }
      };
      const store = createAdminStore(services);
      await store.selectSystem('sys1');

      assert.equal(await store.duplicateGatheringLibraryEvent('sys1', 'missing'), null);
      assert.equal(await store.duplicateGatheringLibraryEvent('missing-system', 'event-thorns'), null);
      assert.equal(services._store.gatheringConfig.systems.sys1.events.length, 1);
    });

    it('manages selected-system gathering weather and time vocabulary without affecting other systems', async () => {
      const services = createMockServices();
      const sys = services.getCraftingSystemManager().getSystem('sys1');
      sys.features = { gathering: true };
      services._store.gatheringConfig = {
        systems: {
          sys1: {
            conditions: {
              weather: { enabled: true, current: 'rain', values: ['rain'] },
              timeOfDay: { enabled: true, current: 'night', values: ['night', 'day'] }
            },
            tasks: [{ id: 'task-rain', name: 'Rain', weather: ['rain'], timeOfDay: ['night'], dropRows: [] }],
            events: [{ id: 'event-rain', name: 'Rain Event', weather: ['rain'], timeOfDay: ['night'], dropRate: 50 }]
          },
          sys2: {
            conditions: {
              weather: { enabled: true, current: 'rain', values: ['rain'] },
              timeOfDay: { enabled: true, current: 'night', values: ['night'] }
            },
            tasks: [{ id: 'task-other', name: 'Other', weather: ['rain'], timeOfDay: ['night'], dropRows: [] }],
            events: [{ id: 'event-other', name: 'Other Event', weather: ['rain'], timeOfDay: ['night'], dropRate: 50 }]
          }
        }
      };
      const store = createAdminStore(services);
      await store.selectSystem('sys1');

      assert.equal(await store.deleteGatheringConditionValue('weather', 'rain', 'sys1'), false);
      await store.toggleGatheringConditionEnabled('weather', false, 'sys1');
      assert.equal(await store.deleteGatheringConditionValue('weather', 'rain', 'sys1'), true);
      await store.addGatheringConditionValue('weather', 'Ash Fall', 'sys1');
      await store.addGatheringConditionValue('weather', 'ash fall', 'sys1');
      await store.updateGatheringConditionValue('weather', 'ash-fall', { label: 'Ashfall', icon: 'fas fa-volcano' }, 'sys1');
      await store.updateGatheringConditions({ weather: 'ash-fall', systemId: 'sys1' });

      const sys1 = services._store.gatheringConfig.systems.sys1;
      const sys2 = services._store.gatheringConfig.systems.sys2;
      assert.deepEqual(sys1.conditions.weather, {
        enabled: false,
        current: 'ash-fall',
        values: [{ id: 'ash-fall', label: 'Ashfall', icon: 'fas fa-volcano' }]
      });
      assert.deepEqual(sys1.tasks[0].weather, []);
      assert.deepEqual(sys1.events[0].weather, []);
      assert.deepEqual(sys2.tasks[0].weather, ['rain']);
      assert.deepEqual(sys2.events[0].weather, ['rain']);
    });

    it('edits condition labels without changing ids, icons, selections, or library references', async () => {
      const services = createMockServices();
      const sys = services.getCraftingSystemManager().getSystem('sys1');
      sys.features = { gathering: true };
      services._store.gatheringConfig = {
        systems: {
          sys1: {
            conditions: {
              weather: {
                enabled: true,
                current: 'heavy-rain',
                values: [{ id: 'heavy-rain', label: 'Heavy Rain', icon: 'fas fa-cloud-showers-heavy' }]
              },
              timeOfDay: {
                enabled: true,
                current: 'night',
                values: [{ id: 'night', label: 'Night', icon: 'fas fa-moon' }]
              }
            },
            tasks: [{ id: 'task-rain', name: 'Rain', weather: ['heavy-rain'], timeOfDay: ['night'], dropRows: [] }],
            events: [{ id: 'event-rain', name: 'Rain Event', weather: ['heavy-rain'], timeOfDay: ['night'], dropRate: 50 }]
          },
          sys2: {
            conditions: {
              weather: {
                enabled: true,
                current: 'heavy-rain',
                values: [{ id: 'heavy-rain', label: 'Heavy Rain', icon: 'fas fa-cloud-showers-heavy' }]
              },
              timeOfDay: {
                enabled: true,
                current: 'night',
                values: [{ id: 'night', label: 'Night', icon: 'fas fa-moon' }]
              }
            },
            tasks: [{ id: 'task-other', name: 'Other', weather: ['heavy-rain'], timeOfDay: ['night'], dropRows: [] }],
            events: [{ id: 'event-other', name: 'Other Event', weather: ['heavy-rain'], timeOfDay: ['night'], dropRate: 50 }]
          }
        }
      };
      const store = createAdminStore(services);
      await store.selectSystem('sys1');

      assert.equal(await store.updateGatheringConditionValue('weather', 'heavy-rain', { label: 'Storm Rain' }, 'sys1'), true);
      assert.equal(await store.updateGatheringConditionValue('weather', 'heavy-rain', { label: '   ' }, 'sys1'), true);

      const sys1 = services._store.gatheringConfig.systems.sys1;
      assert.deepEqual(sys1.conditions.weather, {
        enabled: true,
        current: 'heavy-rain',
        values: [{ id: 'heavy-rain', label: 'Storm Rain', icon: 'fas fa-cloud-showers-heavy' }]
      });
      assert.deepEqual(sys1.tasks[0].weather, ['heavy-rain']);
      assert.deepEqual(sys1.events[0].weather, ['heavy-rain']);

      assert.equal(await store.deleteGatheringConditionValue('weather', 'heavy-rain', 'sys1'), false);
      await store.toggleGatheringConditionEnabled('weather', false, 'sys1');
      assert.equal(await store.deleteGatheringConditionValue('weather', 'heavy-rain', 'sys1'), true);

      assert.deepEqual(services._store.gatheringConfig.systems.sys1.tasks[0].weather, []);
      assert.deepEqual(services._store.gatheringConfig.systems.sys1.events[0].weather, []);
      assert.deepEqual(services._store.gatheringConfig.systems.sys2.tasks[0].weather, ['heavy-rain']);
      assert.deepEqual(services._store.gatheringConfig.systems.sys2.events[0].weather, ['heavy-rain']);
    });

    it('normalizes and edits selected-system region and biome vocabularies', async () => {
      const services = createMockServices();
      const sys = services.getCraftingSystemManager().getSystem('sys1');
      sys.features = { gathering: true };
      services._store.gatheringConfig = {
        vocabularies: {
          biomes: ['forest'],
          danger: ['safe'],
          weather: ['clear'],
          timeOfDay: ['day']
        },
        systems: {
          sys1: {
            tasks: [{ id: 'task-forest', name: 'Forest', biomes: ['forest'], dropRows: [] }],
            events: [{ id: 'event-forest', name: 'Forest Event', biomes: ['forest'], dropRate: 50 }]
          }
        }
      };
      const store = createAdminStore(services);
      await store.selectSystem('sys1');

      // Region is no longer a composition vocabulary dimension.
      assert.equal('regions' in get(store.viewState).gatheringConfig.systems.sys1.vocabularies, false);
      assert.deepEqual(get(store.viewState).gatheringConfig.systems.sys1.vocabularies.biomes.values, [
        { id: 'forest', label: 'Forest', icon: 'fas fa-tree', colorToken: 'sage', customColor: '' }
      ]);

      // The regions dimension is rejected by the vocabulary actions.
      assert.equal(await store.addGatheringVocabularyValue('regions', 'South Coast', 'sys1'), false);
      await store.addGatheringVocabularyValue('biomes', { label: 'Crystal Cavern', icon: 'fas fa-gem', colorToken: 'mist', customColor: '#88aaff' }, 'sys1');
      await store.updateGatheringVocabularyValue('biomes', 'crystal cavern', { label: 'Crystal Caves', icon: 'fas fa-mountain', colorToken: '--fab-tag-lavender', customColor: 'bad' }, 'sys1');

      const vocabularies = services._store.gatheringConfig.systems.sys1.vocabularies;
      assert.equal('regions' in vocabularies, false);
      assert.deepEqual(vocabularies.biomes.values.at(-1), {
        id: 'crystal cavern',
        label: 'Crystal Caves',
        icon: 'fas fa-mountain',
        colorToken: 'lavender',
        customColor: ''
      });
      assert.deepEqual(services._store.gatheringConfig.systems.sys1.tasks[0].biomes, ['forest']);
      assert.deepEqual(services._store.gatheringConfig.systems.sys1.events[0].biomes, ['forest']);
    });

    it('normalises top-level vocabularies into objects with capitalised labels and per-biome colour tokens', async () => {
      const services = createMockServices();
      const sys = services.getCraftingSystemManager().getSystem('sys1');
      sys.features = { gathering: true };
      services._store.gatheringConfig = {
        vocabularies: {
          biomes: ['forest', 'mountain', 'swamp']
        }
      };

      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      const config = get(store.viewState).gatheringConfig;

      assert.equal('regions' in config.vocabularies, false,
        'region is no longer a composition vocabulary dimension');

      assert.deepEqual(config.vocabularies.biomes, [
        { id: 'forest', label: 'Forest', icon: 'fas fa-tree', colorToken: 'sage', customColor: '' },
        { id: 'mountain', label: 'Mountain', icon: 'fas fa-mountain', colorToken: 'mist', customColor: '' },
        { id: 'swamp', label: 'Swamp', icon: 'fas fa-frog', colorToken: 'mauve', customColor: '' }
      ], 'each default biome gets its own colour token, not a single flat fallback');
    });

    it('seeds default biomes/weather/timeOfDay at the top level when the persisted setting has none', async () => {
      const services = createMockServices();
      const sys = services.getCraftingSystemManager().getSystem('sys1');
      sys.features = { gathering: true };
      services._store.gatheringConfig = {};

      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      const config = get(store.viewState).gatheringConfig;

      assert.equal('regions' in config.vocabularies, false,
        'region is no longer a composition vocabulary dimension');

      const biomeIds = config.vocabularies.biomes.map(b => b.id);
      assert.deepEqual(biomeIds, [
        'forest', 'grassland', 'mountain', 'cave', 'coastal',
        'swamp', 'desert', 'urban', 'ruins', 'wasteland'
      ]);
      const distinctColorTokens = new Set(config.vocabularies.biomes.map(b => b.colorToken));
      assert.ok(distinctColorTokens.size >= 6,
        'default biomes use multiple distinct colour tokens, not a single fallback');

      const weatherLabels = config.vocabularies.weather.map(w => w.label);
      assert.ok(weatherLabels.every(label => /^[A-Z]/.test(label)),
        'every weather label starts with an uppercase letter');
      const weatherIds = config.vocabularies.weather.map(w => w.id);
      assert.deepEqual(weatherIds, ['clear', 'cloudy', 'rain', 'storm', 'snow', 'fog', 'wind']);

      const timeOfDayLabels = config.vocabularies.timeOfDay.map(t => t.label);
      assert.deepEqual(timeOfDayLabels, ['Dawn', 'Day', 'Dusk', 'Night']);
    });

    it('deletes selected-system biome vocabulary values and prunes matching references only in that system', async () => {
      const environmentUpdates = [];
      const environments = [
        { id: 'env-sys1', craftingSystemId: 'sys1', biomes: ['forest', 'swamp'] },
        { id: 'env-sys2', craftingSystemId: 'sys2', biomes: ['forest'] }
      ];
      const services = createMockServices({
        getGatheringEnvironmentStore: () => ({
          list: () => environments,
          update: async (id, updates) => {
            environmentUpdates.push([id, updates]);
            const index = environments.findIndex(environment => environment.id === id);
            if (index >= 0) environments[index] = { ...environments[index], ...updates };
            return environments[index];
          }
        })
      });
      const sys = services.getCraftingSystemManager().getSystem('sys1');
      sys.features = { gathering: true };
      services._store.gatheringConfig = {
        systems: {
          sys1: {
            vocabularies: {
              biomes: { values: [{ id: 'forest', label: 'Forest', icon: 'fas fa-tree', colorToken: 'sage' }] }
            },
            tasks: [{ id: 'task-forest', name: 'Forest', biomes: ['forest'], dropRows: [] }],
            events: [{ id: 'event-forest', name: 'Forest Event', biomes: ['forest'], dropRate: 50 }]
          },
          sys2: {
            vocabularies: {
              biomes: { values: [{ id: 'forest', label: 'Forest', icon: 'fas fa-tree', colorToken: 'sage' }] }
            },
            tasks: [{ id: 'task-other', name: 'Other', biomes: ['forest'], dropRows: [] }],
            events: [{ id: 'event-other', name: 'Other Event', biomes: ['forest'], dropRate: 50 }]
          }
        }
      };
      const store = createAdminStore(services);
      await store.selectSystem('sys1');

      // Region is no longer a vocabulary dimension: the action rejects it.
      assert.equal(await store.deleteGatheringVocabularyValue('regions', 'north', 'sys1'), false);
      assert.equal(await store.deleteGatheringVocabularyValue('biomes', 'forest', 'sys1'), true);

      const sys1 = services._store.gatheringConfig.systems.sys1;
      const sys2 = services._store.gatheringConfig.systems.sys2;
      assert.equal('regions' in sys1.vocabularies, false);
      assert.deepEqual(sys1.vocabularies.biomes.values, []);
      assert.deepEqual(sys1.tasks[0].biomes, []);
      assert.deepEqual(sys1.events[0].biomes, []);
      assert.deepEqual(sys2.tasks[0].biomes, ['forest']);
      assert.deepEqual(environmentUpdates.map(update => update[0]), ['env-sys1']);
      assert.deepEqual(environments[0].biomes, ['swamp']);
      assert.deepEqual(environments[1].biomes, ['forest']);
    });

    it('normalizes and persists selected-system gathering rules', async () => {
      const services = createMockServices();
      const sys = services.getCraftingSystemManager().getSystem('sys1');
      sys.features = { gathering: true };

      services._store.gatheringConfig = {
        systems: {
          sys1: {
            rules: {
              rewardSelectionMode: 'invalid',
              rewardLimit: 0,
              eventSelectionMode: 'limitedDrops',
              eventLimit: '3.8',
              eventPolicy: 'bad-policy',
              blindCandidateGate: 'not-a-gate',
              revealPolicy: 'not-a-policy',
              revealScope: 'not-a-scope',
              eventVisibility: 'not-a-visibility'
            },
            tasks: [],
            events: []
          }
        }
      };

      const store = createAdminStore(services);
      await store.selectSystem('sys1');

      assert.deepEqual(get(store.viewState).gatheringConfig.systems.sys1.rules, {
        rewardSelectionMode: 'highestRankedDrop',
        rewardLimit: 1,
        eventSelectionMode: 'limitedDrops',
        eventLimit: 3,
        eventPolicy: 'successWithEvent',
        toolBreakagePolicy: 'failureOnBreak',
        biomeModifierAggregation: 'strongestOfEach',
        blindCandidateGate: 'attemptableOnly',
        revealPolicy: 'never',
        revealScope: 'actor',
        eventVisibility: 'encounterChance',
        dropModifierMode: 'additive'
      });

      await store.updateGatheringRules('sys1', {
        rewardSelectionMode: 'limitedDrops',
        rewardLimit: 2,
        eventSelectionMode: 'highestRankedDrop',
        eventLimit: -4,
        eventPolicy: 'failureWithEvent',
        blindCandidateGate: 'allMatching',
        revealPolicy: 'onAttempt',
        revealScope: 'global',
        eventVisibility: 'full'
      });

      assert.deepEqual(services._store.gatheringConfig.systems.sys1.rules, {
        rewardSelectionMode: 'limitedDrops',
        rewardLimit: 2,
        eventSelectionMode: 'highestRankedDrop',
        eventLimit: 1,
        eventPolicy: 'failureWithEvent',
        toolBreakagePolicy: 'failureOnBreak',
        biomeModifierAggregation: 'strongestOfEach',
        blindCandidateGate: 'allMatching',
        revealPolicy: 'onAttempt',
        revealScope: 'global',
        eventVisibility: 'full',
        dropModifierMode: 'additive'
      });
      assert.deepEqual(get(store.viewState).gatheringConfig.systems.sys1.rules, services._store.gatheringConfig.systems.sys1.rules);
    });

    it('issue 299: normalizes the global dropModifierMode and strips any per-reference/per-entry mode (defaults, unknown fallback, valid preserved, legacy key)', async () => {
      const services = createMockServices();
      const sys = services.getCraftingSystemManager().getSystem('sys1');
      sys.features = { gathering: true };

      services._store.gatheringConfig = {
        systems: {
          sys1: {
            // Unknown system mode falls back to the additive default.
            rules: { dropModifierMode: 'bogus' },
            characterModifiers: [
              { id: 'str', label: 'Str', icon: '', expression: '@abilities.str.mod' }
            ],
            tasks: [{
              id: 'task-iron',
              name: 'Iron',
              dropRows: [{
                id: 'row-iron', componentId: 'iron', quantity: 1, dropRate: 50,
                characterModifiers: [
                  { id: 'ref-plain', modifierId: 'str', operator: '+' },                          // no mode
                  { id: 'ref-mult', modifierId: 'str', operator: '-', mode: 'multiplicative' },    // stray mode stripped
                  { id: 'ref-add', modifierId: 'str', operator: '+', mode: 'additive' }            // stray mode stripped
                ],
                conditionModifiers: {
                  weather: [
                    { id: 'w-plain', conditionId: 'rain', operator: '-', value: 10 },                       // no mode
                    { id: 'w-mult', conditionId: 'storm', operator: '-', value: 50, mode: 'multiplicative' } // stray mode stripped
                  ],
                  timeOfDay: [{ id: 't-bad', conditionId: 'night', operator: '+', value: 5, mode: 'bogus' }], // stray mode stripped
                  biome: [{ id: 'b-add', conditionId: 'forest', operator: '+', value: 5, mode: 'additive' }]  // stray mode stripped
                }
              }]
            }],
            events: [{
              id: 'event-1', name: 'Trap', dropRate: 25,
              characterModifiers: [{ id: 'eref', modifierId: 'str', operator: '-', mode: 'multiplicative' }]
            }]
          }
        }
      };

      const store = createAdminStore(services);
      await store.selectSystem('sys1');

      const config = get(store.viewState).gatheringConfig.systems.sys1;
      // System default: unknown coerces to 'additive' and emits the new key only.
      assert.equal(config.rules.dropModifierMode, 'additive');
      assert.equal('characterModifierMode' in config.rules, false, 'legacy rule key not emitted');
      // Per-reference/per-entry mode is no longer a configurable field: it is
      // stripped on normalization so it cannot subvert the global system mode.
      const refs = config.tasks[0].dropRows[0].characterModifiers;
      for (const ref of refs) {
        assert.equal('mode' in ref, false, `character modifier reference ${ref.id} carries no mode`);
      }
      assert.equal('mode' in config.events[0].characterModifiers[0], false, 'event ref carries no mode');
      const cm = config.tasks[0].dropRows[0].conditionModifiers;
      for (const list of [cm.weather, cm.timeOfDay, cm.biome]) {
        for (const entry of list) {
          assert.equal('mode' in entry, false, `condition modifier ${entry.id} carries no mode`);
        }
      }

      // A valid system mode survives the round-trip and emits only the new key.
      await store.updateGatheringRules('sys1', { dropModifierMode: 'multiplicative' });
      assert.equal(services._store.gatheringConfig.systems.sys1.rules.dropModifierMode, 'multiplicative');
      assert.equal('characterModifierMode' in services._store.gatheringConfig.systems.sys1.rules, false);
    });

    it('issue 299: reads the legacy characterModifierMode rule key (read-time compat)', async () => {
      const services = createMockServices();
      const sys = services.getCraftingSystemManager().getSystem('sys1');
      sys.features = { gathering: true };
      services._store.gatheringConfig = {
        systems: { sys1: { rules: { characterModifierMode: 'multiplicative' } } }
      };
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      const rules = get(store.viewState).gatheringConfig.systems.sys1.rules;
      assert.equal(rules.dropModifierMode, 'multiplicative', 'legacy key honored on read');
      assert.equal('characterModifierMode' in rules, false, 'legacy key dropped on output');
    });

    it('accepts legacy hazard-schema rule keys/values on read (pre-1.0.0 / imported config)', async () => {
      const services = createMockServices();
      const sys = services.getCraftingSystemManager().getSystem('sys1');
      sys.features = { gathering: true };

      // A gathering config saved before the hazard->event rename, never run through
      // the 1.0.0 startup migration (e.g. imported in the same session).
      services._store.gatheringConfig = {
        systems: {
          sys1: {
            rules: {
              hazardSelectionMode: 'highestRankedDrop',
              hazardLimit: 4,
              hazardPolicy: 'failureWithHazard',
              hazardVisibility: 'full'
            },
            tasks: [],
            events: []
          }
        }
      };

      const store = createAdminStore(services);
      await store.selectSystem('sys1');

      const rules = get(store.viewState).gatheringConfig.systems.sys1.rules;
      assert.equal(rules.eventSelectionMode, 'highestRankedDrop', 'legacy hazardSelectionMode read');
      assert.equal(rules.eventLimit, 4, 'legacy hazardLimit read');
      assert.equal(rules.eventPolicy, 'failureWithEvent', 'legacy policy value coerced');
      assert.equal(rules.eventVisibility, 'full', 'legacy hazardVisibility read');
    });

    it('reads a legacy hazards collection and hazardModifier field on a pre-rename system config', async () => {
      const services = createMockServices();
      const sys = services.getCraftingSystemManager().getSystem('sys1');
      sys.features = { gathering: true };

      services._store.gatheringConfig = {
        systems: {
          sys1: {
            rules: {},
            tasks: [],
            hazards: [
              { id: 'legacy-event', name: 'Wandering Pedlar', dropRate: 25, hazardModifier: { provider: 'macro', macroUuid: 'Macro.m' } }
            ]
          }
        }
      };

      const store = createAdminStore(services);
      await store.selectSystem('sys1');

      const events = get(store.viewState).gatheringConfig.systems.sys1.events;
      assert.equal(events.length, 1, 'legacy hazards collection surfaced as events');
      assert.equal(events[0].id, 'legacy-event');
      assert.ok(events[0].eventModifier, 'legacy hazardModifier surfaced as eventModifier');
    });

    it('updateEnvironmentDraft accepts compositionMode, taskOrder, and eventOrder', async () => {
      const services = createMockServices();
      const sys = services.getCraftingSystemManager().getSystem('sys1');
      sys.features = { gathering: true };
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      await store.createEnvironmentDraft();

      store.updateEnvironmentDraft({ compositionMode: 'manual', taskOrder: ['t2', 't1', 't1'], eventOrder: ['h1'] });
      const draft = get(store.viewState).environmentDraft;
      assert.equal(draft.compositionMode, 'manual');
      assert.deepEqual(draft.taskOrder, ['t2', 't1']);
      assert.deepEqual(draft.eventOrder, ['h1']);

      store.updateEnvironmentDraft({ compositionMode: 'not-a-mode' });
      assert.equal(get(store.viewState).environmentDraft.compositionMode, 'automatic');
    });

    it('updateEnvironmentDraft applies an image path and clears it to null', async () => {
      const services = createMockServices();
      const sys = services.getCraftingSystemManager().getSystem('sys1');
      sys.features = { gathering: true };
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      await store.createEnvironmentDraft();

      store.updateEnvironmentDraft({ img: 'icons/svg/mines.svg' });
      assert.equal(get(store.viewState).environmentDraft.img, 'icons/svg/mines.svg');
      assert.equal(get(store.viewState).environmentDraftDirty, true);

      store.updateEnvironmentDraft({ img: '   ' });
      assert.equal(get(store.viewState).environmentDraft.img, null);
    });

    it('environments list carries a composed availableTaskCount per environment', async () => {
      const environments = [{ id: 'env-cave', craftingSystemId: 'sys1', name: 'Cave', biomes: ['cave'], compositionMode: 'automatic' }];
      const services = createMockServices({
        getGatheringEnvironmentStore: () => ({
          list: () => environments,
          listBySystem: async () => environments
        })
      });
      const sys = services.getCraftingSystemManager().getSystem('sys1');
      sys.features = { gathering: true };
      services._store.gatheringConfig = {
        systems: {
          sys1: {
            tasks: [
              { id: 't-cave', name: 'Cave', biomes: ['cave'], dropRows: [] },
              { id: 't-desert', name: 'Desert', biomes: ['desert'], dropRows: [] }
            ],
            events: []
          }
        }
      };
      const store = createAdminStore(services);
      await store.selectSystem('sys1');

      const listed = get(store.viewState).environments.find(environment => environment.id === 'env-cave');
      assert.ok(listed, 'environment should be present in the view-state list');
      assert.equal(listed.availableTaskCount, undefined, 'derived counts should not pollute the persisted environment object');
      assert.equal(get(store.viewState).environmentTaskCounts['env-cave'].availableTaskCount, 1);
    });

    it('exposes a composition view-model classifying each library record and counts', async () => {
      const services = createMockServices();
      const sys = services.getCraftingSystemManager().getSystem('sys1');
      sys.features = { gathering: true };
      services._store.gatheringConfig = {
        systems: {
          sys1: {
            tasks: [
              { id: 't-cave', name: 'Cave', biomes: ['cave'], dropRows: [] },
              { id: 't-desert', name: 'Desert', biomes: ['desert'], dropRows: [] },
              { id: 't-off', name: 'Disabled', enabled: false, biomes: ['cave'], dropRows: [] }
            ],
            events: []
          }
        }
      };
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      await store.createEnvironmentDraft();
      store.updateEnvironmentDraft({ biomes: ['cave'], compositionMode: 'automatic' });

      let composition = get(store.viewState).environmentComposition;
      const byId = Object.fromEntries(composition.tasks.map(entry => [entry.id, entry]));
      assert.equal(byId['t-cave'].compositionState, 'includedByMatch');
      assert.equal(byId['t-cave'].runtimeState, 'available');
      assert.equal(byId['t-desert'].compositionState, 'notMatching');
      assert.equal(byId['t-desert'].runtimeState, 'unavailable');
      assert.equal(byId['t-off'].compositionState, 'libraryDisabled');
      assert.equal(composition.counts.availableTasks, 1);
      assert.equal(composition.counts.diagnosticTasks, 2);

      store.excludeEnvironmentRecord('task', 't-cave');
      const draft = get(store.viewState).environmentDraft;
      assert.ok(draft.disabledTaskIds.includes('t-cave'));
      composition = get(store.viewState).environmentComposition;
      assert.equal(composition.tasks.find(entry => entry.id === 't-cave').compositionState, 'excluded');
      assert.equal(composition.counts.availableTasks, 0);
      assert.equal(composition.counts.excludedTasks, 1);
    });

    it('manual composition task removal clears include/force state without local exclusion', async () => {
      const services = createMockServices();
      const sys = services.getCraftingSystemManager().getSystem('sys1');
      sys.features = { gathering: true };
      services._store.gatheringConfig = {
        systems: {
          sys1: {
            tasks: [
              { id: 't-cave', name: 'Cave', biomes: ['cave'], dropRows: [] },
              { id: 't-desert', name: 'Desert', biomes: ['desert'], dropRows: [] }
            ],
            events: []
          }
        }
      };
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      await store.createEnvironmentDraft();
      store.updateEnvironmentDraft({ biomes: ['cave'], compositionMode: 'manual' });

      let composition = get(store.viewState).environmentComposition;
      assert.equal(composition.tasks.find(entry => entry.id === 't-cave').compositionState, 'candidate');

      store.includeEnvironmentRecord('task', 't-cave');
      let draft = get(store.viewState).environmentDraft;
      assert.ok(draft.enabledTaskIds.includes('t-cave'));
      assert.ok(draft.taskOrder.includes('t-cave'));
      composition = get(store.viewState).environmentComposition;
      const included = composition.tasks.find(entry => entry.id === 't-cave');
      assert.equal(included.compositionState, 'explicitlyIncluded');
      assert.equal(included.runtimeState, 'available');

      store.excludeEnvironmentRecord('task', 't-cave');
      draft = get(store.viewState).environmentDraft;
      assert.ok(!draft.enabledTaskIds.includes('t-cave'));
      assert.ok(!draft.disabledTaskIds.includes('t-cave'));
      composition = get(store.viewState).environmentComposition;
      const removed = composition.tasks.find(entry => entry.id === 't-cave');
      assert.equal(removed.compositionState, 'candidate');
      assert.equal(removed.runtimeState, 'unavailable');
      assert.equal(composition.counts.excludedTasks, 0);

      store.updateEnvironmentDraft({ disabledTaskIds: ['t-cave'] });
      composition = get(store.viewState).environmentComposition;
      const staleManualDisabled = composition.tasks.find(entry => entry.id === 't-cave');
      assert.equal(staleManualDisabled.compositionState, 'candidate');
      assert.equal(staleManualDisabled.runtimeState, 'unavailable');
      assert.equal(composition.counts.excludedTasks, 0);

      store.forceIncludeEnvironmentRecord('task', 't-desert');
      draft = get(store.viewState).environmentDraft;
      assert.ok(draft.forcedTaskIds.includes('t-desert'));
      composition = get(store.viewState).environmentComposition;
      assert.equal(composition.tasks.find(entry => entry.id === 't-desert').compositionState, 'forceIncluded');

      store.excludeEnvironmentRecord('task', 't-desert');
      draft = get(store.viewState).environmentDraft;
      assert.ok(!draft.forcedTaskIds.includes('t-desert'));
      assert.ok(!draft.disabledTaskIds.includes('t-desert'));
      composition = get(store.viewState).environmentComposition;
      const removedForced = composition.tasks.find(entry => entry.id === 't-desert');
      assert.equal(removedForced.compositionState, 'notMatching');
      assert.equal(removedForced.runtimeState, 'unavailable');
    });

    it('manual event removal clears include and force state without local exclusion', async () => {
      const services = createMockServices();
      const sys = services.getCraftingSystemManager().getSystem('sys1');
      sys.features = { gathering: true };
      services._store.gatheringConfig = {
        systems: {
          sys1: {
            tasks: [],
            events: [
              { id: 'h-cave', name: 'Cave Event', biomes: ['cave'], dropRate: 25 },
              { id: 'h-desert', name: 'Desert Event', biomes: ['desert'], dropRate: 25 }
            ]
          }
        }
      };
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      await store.createEnvironmentDraft();
      store.updateEnvironmentDraft({ biomes: ['cave'], compositionMode: 'manual' });

      store.includeEnvironmentRecord('event', 'h-cave');
      store.excludeEnvironmentRecord('event', 'h-cave');

      const draft = get(store.viewState).environmentDraft;
      assert.ok(!draft.enabledEventIds.includes('h-cave'));
      assert.ok(!draft.disabledEventIds.includes('h-cave'));
      let composition = get(store.viewState).environmentComposition;
      assert.equal(composition.events.find(entry => entry.id === 'h-cave').compositionState, 'candidate');
      assert.equal(composition.counts.excludedEvents, 0);

      store.updateEnvironmentDraft({ disabledEventIds: ['h-cave'] });
      composition = get(store.viewState).environmentComposition;
      assert.equal(composition.events.find(entry => entry.id === 'h-cave').compositionState, 'candidate');
      assert.equal(composition.counts.excludedEvents, 0);

      store.forceIncludeEnvironmentRecord('event', 'h-desert');
      store.excludeEnvironmentRecord('event', 'h-desert');
      const forcedDraft = get(store.viewState).environmentDraft;
      assert.ok(!forcedDraft.forcedEventIds.includes('h-desert'));
      assert.ok(!forcedDraft.disabledEventIds.includes('h-desert'));
      composition = get(store.viewState).environmentComposition;
      assert.equal(composition.events.find(entry => entry.id === 'h-desert').compositionState, 'notMatching');
    });

    it('reorders all included events including condition-blocked force-added events', async () => {
      const services = createMockServices();
      const sys = services.getCraftingSystemManager().getSystem('sys1');
      sys.features = { gathering: true };
      services._store.gatheringConfig = {
        systems: {
          sys1: {
            tasks: [],
            events: [
              { id: 'h-cave', name: 'Cave Event', biomes: ['cave'], dangerTags: ['hazardous'], dropRate: 25 },
              { id: 'h-gas', name: 'Gas Pocket', biomes: ['cave'], dangerTags: ['hazardous'], dropRate: 25 },
              { id: 'h-storm', name: 'Storm Event', biomes: ['cave'], dangerTags: ['hazardous'], weather: ['storm'], dropRate: 25 },
              { id: 'h-desert', name: 'Desert Storm', biomes: ['desert'], dangerTags: ['hazardous'], weather: ['storm'], dropRate: 25 }
            ]
          }
        }
      };
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      await store.createEnvironmentDraft();
      store.updateEnvironmentDraft({ biomes: ['cave'], dangerLevel: 'hazardous', compositionMode: 'manual' });

      store.includeEnvironmentRecord('event', 'h-cave');
      store.includeEnvironmentRecord('event', 'h-gas');
      store.includeEnvironmentRecord('event', 'h-storm');
      store.forceIncludeEnvironmentRecord('event', 'h-desert');

      let composition = get(store.viewState).environmentComposition;
      assert.deepEqual(
        composition.events
          .filter(entry => ['explicitlyIncluded', 'forceIncluded'].includes(entry.compositionState))
          .map(entry => entry.id),
        ['h-cave', 'h-gas', 'h-storm', 'h-desert']
      );
      const conditionBlocked = composition.events.find(entry => entry.id === 'h-storm');
      assert.equal(conditionBlocked.compositionState, 'explicitlyIncluded');
      assert.equal(conditionBlocked.runtimeState, 'unavailable');
      const forced = composition.events.find(entry => entry.id === 'h-desert');
      assert.equal(forced.compositionState, 'forceIncluded');
      assert.equal(forced.runtimeState, 'unavailable');

      assert.equal(store.reorderEnvironmentRecord('event', 2, 0), true);

      let draft = get(store.viewState).environmentDraft;
      assert.deepEqual(draft.eventOrder, ['h-storm', 'h-cave', 'h-gas', 'h-desert']);
      composition = get(store.viewState).environmentComposition;
      assert.deepEqual(
        composition.events
          .filter(entry => ['explicitlyIncluded', 'forceIncluded'].includes(entry.compositionState))
          .map(entry => entry.id),
        ['h-storm', 'h-cave', 'h-gas', 'h-desert']
      );

      assert.equal(store.reorderEnvironmentRecord('event', 3, 1), true);
      draft = get(store.viewState).environmentDraft;
      assert.deepEqual(draft.eventOrder, ['h-storm', 'h-desert', 'h-cave', 'h-gas']);
    });

    it('keeps force-added events included after environment edits make them match', async () => {
      const services = createMockServices();
      const sys = services.getCraftingSystemManager().getSystem('sys1');
      sys.features = { gathering: true };
      services._store.gatheringConfig = {
        systems: {
          sys1: {
            tasks: [],
            events: [
              { id: 'h-cave', name: 'Cave Event', biomes: ['cave'], dangerTags: ['hazardous'], dropRate: 25 },
              { id: 'h-desert', name: 'Desert Storm', biomes: ['desert'], dangerTags: ['hazardous'], dropRate: 25 }
            ]
          }
        }
      };
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      await store.createEnvironmentDraft();
      store.updateEnvironmentDraft({ biomes: ['cave'], dangerLevel: 'hazardous', compositionMode: 'manual' });

      store.includeEnvironmentRecord('event', 'h-cave');
      store.forceIncludeEnvironmentRecord('event', 'h-desert');
      store.updateEnvironmentDraft({ biomes: ['desert'] });

      let composition = get(store.viewState).environmentComposition;
      const forced = composition.events.find(entry => entry.id === 'h-desert');
      assert.equal(forced.matches, true);
      assert.equal(forced.compositionState, 'forceIncluded');
      assert.equal(forced.runtimeState, 'available');

      assert.equal(store.reorderEnvironmentRecord('event', 0, 1), true);
      const draft = get(store.viewState).environmentDraft;
      assert.deepEqual(draft.eventOrder, ['h-desert', 'h-cave']);
      composition = get(store.viewState).environmentComposition;
      assert.deepEqual(
        composition.events
          .filter(entry => ['includedByMatch', 'explicitlyIncluded', 'forceIncluded', 'includedButUnavailable'].includes(entry.compositionState))
          .map(entry => entry.id),
        ['h-desert', 'h-cave']
      );
    });

    it('automatic event exclusion writes local excluded state', async () => {
      const services = createMockServices();
      const sys = services.getCraftingSystemManager().getSystem('sys1');
      sys.features = { gathering: true };
      services._store.gatheringConfig = {
        systems: {
          sys1: {
            tasks: [],
            events: [{ id: 'h-cave', name: 'Cave Event', biomes: ['cave'], dropRate: 25 }]
          }
        }
      };
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      await store.createEnvironmentDraft();
      store.updateEnvironmentDraft({ biomes: ['cave'], compositionMode: 'automatic' });

      store.excludeEnvironmentRecord('event', 'h-cave');

      const draft = get(store.viewState).environmentDraft;
      assert.ok(!draft.enabledEventIds.includes('h-cave'));
      assert.ok(draft.disabledEventIds.includes('h-cave'));
      const composition = get(store.viewState).environmentComposition;
      assert.equal(composition.events.find(entry => entry.id === 'h-cave').compositionState, 'excluded');
      assert.equal(composition.counts.excludedEvents, 1);
    });

    it('requires confirmation before deleting gathering library records used by environments', async () => {
      const confirmations = [];
      const services = createMockServices({
        confirmDialog: async (options) => {
          confirmations.push(options);
          return false;
        },
        getGatheringEnvironmentStore: () => ({
          list: () => [{
            id: 'env-used',
            name: 'Used Grove',
            craftingSystemId: 'sys1',
            region: 'north',
            biomes: ['forest'],
            dangerTags: ['hazardous'],
            enabledTaskIds: ['task-used'],
            enabledEventIds: ['event-used']
          }]
        })
      });
      services._store.gatheringConfig = {
        conditions: { weather: 'clear', timeOfDay: 'day' },
        vocabularies: {
          regions: ['north'],
          biomes: ['forest'],
          danger: ['safe', 'hazardous'],
          weather: ['clear'],
          timeOfDay: ['day']
        },
        systems: {
          sys1: {
            tasks: [{ id: 'task-used', name: 'Used Task', region: 'north', biomes: ['forest'], dropRows: [] }],
            events: [{ id: 'event-used', name: 'Used Event', dangerTags: ['hazardous'], region: 'north', biomes: ['forest'], dropRate: 25 }]
          }
        }
      };

      const store = createAdminStore(services);
      await store.selectSystem('sys1');

      assert.equal(await store.deleteGatheringLibraryTask('sys1', 'task-used'), false);
      assert.equal(await store.deleteGatheringLibraryEvent('sys1', 'event-used'), false);
      assert.equal(confirmations.length, 2);
      assert.ok(confirmations[0].content.includes('Used Grove'));
      assert.ok(confirmations[1].content.includes('Used Grove'));
      assert.ok(confirmations[0].content.includes('cannot be undone'));
      assert.ok(confirmations[1].content.includes('cannot be undone'));
      assert.equal(services._store.gatheringConfig.systems.sys1.tasks.length, 1);
      assert.equal(services._store.gatheringConfig.systems.sys1.events.length, 1);
    });

    it('requires confirmation before deleting unused gathering library records and keeps them on decline', async () => {
      const confirmations = [];
      const services = createMockServices({
        confirmDialog: async (options) => {
          confirmations.push(options);
          return false;
        },
        getGatheringEnvironmentStore: () => ({ list: () => [] })
      });
      services._store.gatheringConfig = {
        systems: {
          sys1: {
            tasks: [{ id: 'task-unused', name: 'Lone Task', dropRows: [] }],
            events: [{ id: 'event-unused', name: 'Lone Event', dropRate: 10 }]
          }
        }
      };

      const store = createAdminStore(services);
      await store.selectSystem('sys1');

      assert.equal(await store.deleteGatheringLibraryTask('sys1', 'task-unused'), false);
      assert.equal(await store.deleteGatheringLibraryEvent('sys1', 'event-unused'), false);
      assert.equal(confirmations.length, 2);
      assert.ok(confirmations[0].content.includes('Lone Task'));
      assert.ok(confirmations[0].content.includes('cannot be undone'));
      assert.ok(!confirmations[0].content.includes('Used by'));
      assert.ok(confirmations[1].content.includes('Lone Event'));
      assert.ok(confirmations[1].content.includes('cannot be undone'));
      assert.ok(!confirmations[1].content.includes('Used by'));
      assert.equal(services._store.gatheringConfig.systems.sys1.tasks.length, 1);
      assert.equal(services._store.gatheringConfig.systems.sys1.events.length, 1);
    });

    it('deletes unused gathering library records when the confirmation is accepted', async () => {
      let confirmationCount = 0;
      const services = createMockServices({
        confirmDialog: async () => {
          confirmationCount += 1;
          return true;
        },
        getGatheringEnvironmentStore: () => ({ list: () => [] })
      });
      services._store.gatheringConfig = {
        systems: {
          sys1: {
            tasks: [{ id: 'task-unused', name: 'Lone Task', dropRows: [] }],
            events: [{ id: 'event-unused', name: 'Lone Event', dropRate: 10 }]
          }
        }
      };

      const store = createAdminStore(services);
      await store.selectSystem('sys1');

      assert.equal(await store.deleteGatheringLibraryTask('sys1', 'task-unused'), true);
      assert.equal(await store.deleteGatheringLibraryEvent('sys1', 'event-unused'), true);
      assert.equal(confirmationCount, 2);
      assert.equal(services._store.gatheringConfig.systems.sys1.tasks.length, 0);
      assert.equal(services._store.gatheringConfig.systems.sys1.events.length, 0);
    });

    it('deletes gathering library records after used-record confirmation is accepted', async () => {
      let confirmationCount = 0;
      const services = createMockServices({
        confirmDialog: async () => {
          confirmationCount += 1;
          return true;
        },
        getGatheringEnvironmentStore: () => ({
          list: () => [{
            id: 'env-used',
            name: 'Used Grove',
            craftingSystemId: 'sys1',
            region: 'north',
            biomes: ['forest'],
            dangerTags: ['hazardous'],
            enabledTaskIds: ['task-used'],
            enabledEventIds: ['event-used']
          }]
        })
      });
      services._store.gatheringConfig = {
        conditions: { weather: 'clear', timeOfDay: 'day' },
        vocabularies: {
          regions: ['north'],
          biomes: ['forest'],
          danger: ['safe', 'hazardous'],
          weather: ['clear'],
          timeOfDay: ['day']
        },
        systems: {
          sys1: {
            tasks: [{ id: 'task-used', name: 'Used Task', region: 'north', biomes: ['forest'], dropRows: [] }],
            events: [{ id: 'event-used', name: 'Used Event', dangerTags: ['hazardous'], region: 'north', biomes: ['forest'], dropRate: 25 }]
          }
        }
      };

      const store = createAdminStore(services);
      await store.selectSystem('sys1');

      assert.equal(await store.deleteGatheringLibraryTask('sys1', 'task-used'), true);
      assert.equal(await store.deleteGatheringLibraryEvent('sys1', 'event-used'), true);
      assert.equal(confirmationCount, 2);
      assert.equal(services._store.gatheringConfig.systems.sys1.tasks.length, 0);
      assert.equal(services._store.gatheringConfig.systems.sys1.events.length, 0);
    });

    it('adds, updates, and deletes character modifier references on drop rows and events', async () => {
      const services = createMockServices({
        randomID: (() => {
          let id = 0;
          return () => `cmref-${++id}`;
        })()
      });
      const sys = services.getCraftingSystemManager().getSystem('sys1');
      sys.features = { gathering: true };
      services._store.gatheringConfig = {
        systems: {
          sys1: {
            characterModifiers: [
              { id: 'strength', label: 'Strength', icon: 'fa-solid fa-dumbbell', expression: '@abilities.str.mod' },
              { id: 'dexterity', label: 'Dexterity', icon: 'fa-solid fa-running', expression: '@abilities.dex.mod' }
            ],
            tasks: [{
              id: 'task-iron',
              name: 'Iron Vein',
              dropRows: [
                { id: 'row-iron', componentId: 'iron', quantity: 1, dropRate: 50 }
              ]
            }],
            events: [
              { id: 'event-cave-in', name: 'Cave-in', dropRate: 25 }
            ]
          }
        }
      };
      const store = createAdminStore(services);
      await store.selectSystem('sys1');

      const dropRef = await store.addGatheringDropRowCharacterModifier('sys1', 'task-iron', 'row-iron');
      assert.ok(dropRef, 'drop ref was created');
      assert.equal(dropRef.modifierId, 'strength');
      assert.equal(dropRef.operator, '+');
      assert.equal('mode' in dropRef, false, 'new drop ref carries no per-reference mode (issue 299)');
      let task = services._store.gatheringConfig.systems.sys1.tasks[0];
      assert.equal(task.dropRows[0].characterModifiers.length, 1);
      assert.equal(task.dropRows[0].characterModifiers[0].id, dropRef.id);

      const updated = await store.updateGatheringDropRowCharacterModifier('sys1', 'task-iron', 'row-iron', dropRef.id, {
        modifierId: 'dexterity',
        operator: '-',
        mode: 'multiplicative',
        min: -2,
        max: 5,
        expressionOverride: '1d4 + @abilities.dex.mod'
      });
      assert.equal(updated, true);
      task = services._store.gatheringConfig.systems.sys1.tasks[0];
      assert.equal(task.dropRows[0].characterModifiers[0].modifierId, 'dexterity');
      assert.equal(task.dropRows[0].characterModifiers[0].operator, '-');
      assert.equal('mode' in task.dropRows[0].characterModifiers[0], false, 'a stray mode partial is dropped on normalization (issue 299)');
      assert.equal(task.dropRows[0].characterModifiers[0].min, -2);
      assert.equal(task.dropRows[0].characterModifiers[0].max, 5);
      assert.equal(task.dropRows[0].characterModifiers[0].expressionOverride, '1d4 + @abilities.dex.mod');

      const eventRef = await store.addGatheringEventCharacterModifier('sys1', 'event-cave-in', {
        modifierId: 'strength',
        operator: '-'
      });
      assert.ok(eventRef, 'event ref was created');
      assert.equal(eventRef.modifierId, 'strength');
      assert.equal(eventRef.operator, '-');
      assert.equal('mode' in eventRef, false, 'new event ref carries no per-reference mode (issue 299)');
      let event = services._store.gatheringConfig.systems.sys1.events[0];
      assert.equal(event.characterModifiers.length, 1);
      assert.equal(event.characterModifiers[0].id, eventRef.id);

      const eventUpdated = await store.updateGatheringEventCharacterModifier('sys1', 'event-cave-in', eventRef.id, {
        expressionOverride: '1d6 + @abilities.con.mod'
      });
      assert.equal(eventUpdated, true);
      event = services._store.gatheringConfig.systems.sys1.events[0];
      assert.equal(event.characterModifiers[0].expressionOverride, '1d6 + @abilities.con.mod');

      const dropDeleted = await store.deleteGatheringDropRowCharacterModifier('sys1', 'task-iron', 'row-iron', dropRef.id);
      assert.equal(dropDeleted, true);
      task = services._store.gatheringConfig.systems.sys1.tasks[0];
      assert.equal(task.dropRows[0].characterModifiers.length, 0);

      const eventDeleted = await store.deleteGatheringEventCharacterModifier('sys1', 'event-cave-in', eventRef.id);
      assert.equal(eventDeleted, true);
      event = services._store.gatheringConfig.systems.sys1.events[0];
      assert.equal(event.characterModifiers.length, 0);
    });

    it('returns null when adding a character modifier reference to an unknown row', async () => {
      const services = createMockServices();
      const sys = services.getCraftingSystemManager().getSystem('sys1');
      sys.features = { gathering: true };
      services._store.gatheringConfig = {
        systems: {
          sys1: {
            characterModifiers: [{ id: 'strength', label: 'Strength', icon: '', expression: '@abilities.str.mod' }],
            tasks: [{ id: 'task-iron', name: 'Iron', dropRows: [{ id: 'row-iron', dropRate: 50 }] }],
            events: []
          }
        }
      };
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      assert.equal(await store.addGatheringDropRowCharacterModifier('sys1', 'unknown-task', 'row-iron'), null);
      assert.equal(await store.addGatheringDropRowCharacterModifier('sys1', 'task-iron', 'unknown-row'), null);
      assert.equal(await store.addGatheringEventCharacterModifier('sys1', 'unknown-event'), null);
    });

    it('viewState.selectedSystem.craftingCheck.outcomesText is comma-separated string from outcomes array', async () => {
      const services = createMockServices();
      const origManager = services.getCraftingSystemManager();
      const sys = origManager.getSystem('sys1');
      if (sys) {
        sys.craftingCheck = { mode: 'namedOutcomes', macroUuid: 'uuid', outcomes: ['critical', 'success', 'failure'] };
      }
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      const vs = get(store.viewState);
      assert.equal(vs.selectedSystem?.craftingCheck.outcomesText, 'critical, success, failure');
    });

    it('viewState.selectedSystem.availableScriptMacros reflects getScriptMacros()', async () => {
      const macros = [{ uuid: 'm1', name: 'My Macro' }, { uuid: 'm2', name: 'Other' }];
      const services = createMockServices({
        getScriptMacros: () => macros
      });
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      const vs = get(store.viewState);
      assert.deepEqual(vs.selectedSystem?.availableScriptMacros, macros);
    });

    it('viewState.selectedSystem exposes injected scene and roll-table picker options', async () => {
      const sceneOptions = [{ uuid: 'Scene.forest', name: 'Forest', img: 'forest.webp' }];
      const rollTableOptions = [{ uuid: 'RollTable.forage', name: 'Forage', img: 'table.svg' }];
      const services = createMockServices({
        getSceneOptions: () => sceneOptions,
        getRollTableOptions: () => rollTableOptions
      });
      const store = createAdminStore(services);

      await store.selectSystem('sys1');

      const selectedSystem = get(store.viewState).selectedSystem;
      assert.deepEqual(selectedSystem?.sceneOptions, sceneOptions);
      assert.deepEqual(selectedSystem?.rollTableOptions, rollTableOptions);
    });

    it('viewState.selectedSystem.showTags and showEssences are true when the essences feature is enabled', async () => {
      const services = createMockServices();
      const origManager = services.getCraftingSystemManager();
      const sys = origManager.getSystem('sys1');
      if (sys) {
        sys.features = { itemTags: true, essences: true };
      }
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      const vs = get(store.viewState);
      assert.equal(vs.selectedSystem?.showTags, true);
      assert.equal(vs.selectedSystem?.showEssences, true);
    });

    it('viewState.selectedSystem.showEssences is false when the essences feature is disabled', async () => {
      const services = createMockServices();
      const origManager = services.getCraftingSystemManager();
      const sys = origManager.getSystem('sys1');
      if (sys) {
        sys.features = { itemTags: true, essences: false };
      }
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      const vs = get(store.viewState);
      assert.equal(vs.selectedSystem?.showTags, true);
      assert.equal(vs.selectedSystem?.showEssences, false);
    });

    it('viewState.recipes entries include all required display fields', async () => {
      const services = createMockServices();
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      const vs = get(store.viewState);
      assert.ok(vs.recipes.length > 0, 'should have at least one recipe');
      for (const recipe of vs.recipes) {
        for (const field of [
          'id', 'name', 'img', 'description', 'category', 'enabled', 'locked',
          'recipeItemId', 'isSimple', 'visibilitySummary', 'stepCount', 'resultGroupCount',
          'ingredientCount', 'toolCount', 'structureKey', 'structureLabel',
          'requirementsPreview', 'ingredients', 'tools'
        ]) {
          assert.ok(field in recipe, `recipe entry should have field: ${field}`);
        }
      }
    });

    it('viewState.experimentalFeaturesEnabled mirrors the world setting', async () => {
      const services = createMockServices({
        getSetting: (key) => key === 'experimentalFeatures'
          ? true
          : ''
      });
      const store = createAdminStore(services);
      await store.refresh();

      assert.equal(get(store.viewState).experimentalFeaturesEnabled, true);
    });

    it('viewState.recipes derives browser display counts from execution steps', async () => {
      const services = createMockServices();
      const origManager = services.getRecipeManager();
      const multiStepRecipe = makeRecipe({
        id: 'r-multi',
        name: 'Layered Potion',
        description: 'Brew in two phases.',
        craftingSystemId: 'sys1',
        ingredientSets: [],
        resultGroups: [],
        toolIds: ['cauldron'],
        steps: [
          {
            id: 'step-mix',
            name: 'Mix',
            toolIds: ['stirring-rod'],
            ingredientSets: [{
              id: 'set-herbs',
              ingredientGroups: [
                { id: 'group-herb', options: [{ componentId: 'mint' }, { componentId: 'sage' }] },
                { id: 'group-water', options: [{ componentId: 'water' }] }
              ],
              toolIds: ['mortar']
            }],
            resultGroups: [{ id: 'mix-success' }, { id: 'mix-critical' }]
          },
          {
            id: 'step-finish',
            name: 'Finish',
            ingredientSets: [{
              id: 'set-finish',
              ingredients: [{ componentId: 'ash' }, { componentId: 'salt' }],
              toolIds: ['filter', 'vial']
            }],
            resultGroups: [{ id: 'finish-success' }]
          }
        ],
        isSimpleRecipe: () => false,
        getExecutionSteps() {
          return this.steps;
        }
      });

      services.getRecipeManager = () => ({
        ...origManager,
        getRecipes: (filter) => [multiStepRecipe]
          .filter(r => !filter?.craftingSystemId || r.craftingSystemId === filter.craftingSystemId)
      });

      const store = createAdminStore(services);
      await store.selectSystem('sys1');

      const recipe = get(store.viewState).recipes.find(r => r.id === 'r-multi');
      assert.ok(recipe, 'multi-step recipe should be present');
      assert.equal(recipe.description, 'Brew in two phases.');
      assert.equal(recipe.stepCount, 2);
      assert.equal(recipe.resultGroupCount, 3);
      assert.equal(recipe.ingredientCount, 5);
      assert.equal(recipe.toolCount, 6);
      assert.equal(recipe.structureKey, 'multiStep');
      assert.equal(recipe.structureLabel, 'Multi-step');
      assert.equal(recipe.ingredients.length, 5, 'legacy ingredients array should track derived count');
      assert.equal(recipe.tools.length, 6, 'tools array should track derived count');
      assert.deepEqual(recipe.requirementsPreview, [
        {
          id: 'step-mix',
          name: 'Mix',
          ingredientSetCount: 1,
          ingredientCount: 3,
          toolCount: 3,
          resultGroupCount: 2,
          hasAlternatives: false,
          ingredientSetSummaries: [{
            id: 'set-herbs',
            name: 'Set 1',
            ingredientCount: 3,
            toolCount: 1
          }]
        },
        {
          id: 'step-finish',
          name: 'Finish',
          ingredientSetCount: 1,
          ingredientCount: 2,
          toolCount: 3,
          resultGroupCount: 1,
          hasAlternatives: false,
          ingredientSetSummaries: [{
            id: 'set-finish',
            name: 'Set 1',
            ingredientCount: 2,
            toolCount: 2
          }]
        }
      ]);
    });

    it('viewState.recipes falls back to recipe-level ingredientSets and preserves alternatives for requirementsPreview', async () => {
      const services = createMockServices();
      const origManager = services.getRecipeManager();
      const fallbackRecipe = makeRecipe({
        id: 'r-single',
        name: 'Fallback Stew',
        craftingSystemId: 'sys1',
        ingredientSets: [{
          id: 'set-main',
          ingredientGroups: [
            { id: 'group-main', options: [{ componentId: 'root' }, { componentId: 'mushroom' }] }
          ],
          toolIds: ['pot']
        }, {
          id: 'set-alt',
          ingredients: [{ componentId: 'fish' }, { componentId: 'salt' }, { componentId: 'herb' }],
          toolIds: []
        }],
        resultGroups: [{ id: 'success' }, { id: 'bonus' }],
        toolIds: ['ladle']
      });

      services.getRecipeManager = () => ({
        ...origManager,
        getRecipes: (filter) => [fallbackRecipe]
          .filter(r => !filter?.craftingSystemId || r.craftingSystemId === filter.craftingSystemId)
      });

      const store = createAdminStore(services);
      await store.selectSystem('sys1');

      const recipe = get(store.viewState).recipes.find(r => r.id === 'r-single');
      assert.ok(recipe, 'fallback recipe should be present');
      assert.equal(recipe.stepCount, 1);
      assert.equal(recipe.resultGroupCount, 2);
      assert.equal(recipe.ingredientCount, 3);
      assert.equal(recipe.toolCount, 2);
      assert.equal(recipe.structureKey, 'simple');
      assert.deepEqual(recipe.requirementsPreview, [{
        id: 'implicit-step',
        name: 'Step 1',
        ingredientSetCount: 2,
        ingredientCount: 3,
        toolCount: 2,
        resultGroupCount: 2,
        hasAlternatives: true,
        ingredientSetSummaries: [
          {
            id: 'set-main',
            name: 'Set 1',
            ingredientCount: 2,
            toolCount: 1
          },
          {
            id: 'set-alt',
            name: 'Set 2',
            ingredientCount: 3,
            toolCount: 0
          }
        ]
      }]);
    });

    it('viewState.recipeCategories groups recipes by category with counts', async () => {
      const services = createMockServices();
      const origManager = services.getRecipeManager();
      services.getRecipeManager = () => ({
        ...origManager,
        getRecipes: (filter) => {
          const all = [
            makeRecipe({ id: 'r1', name: 'Healing Potion', category: 'potions', craftingSystemId: 'sys1' }),
            makeRecipe({ id: 'r2', name: 'Mana Potion', category: 'potions', craftingSystemId: 'sys1' }),
            makeRecipe({ id: 'r3', name: 'Iron Sword', category: 'weapons', craftingSystemId: 'sys1' })
          ];
          return filter?.craftingSystemId ? all.filter(r => r.craftingSystemId === filter.craftingSystemId) : all;
        }
      });
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      const vs = get(store.viewState);
      const potions = vs.recipeCategories.find(c => c.name === 'potions');
      const weapons = vs.recipeCategories.find(c => c.name === 'weapons');
      assert.ok(potions, 'potions category should exist');
      assert.equal(potions.count, 2);
      assert.ok(weapons, 'weapons category should exist');
      assert.equal(weapons.count, 1);
    });

    it('_visibilitySummary returns "All players" for unrestricted recipe', async () => {
      const services = createMockServices();
      const origManager = services.getRecipeManager();
      services.getRecipeManager = () => ({
        ...origManager,
        getRecipes: (filter) => [
          makeRecipe({ id: 'r1', name: 'Open', craftingSystemId: 'sys1', visibility: { restricted: false } })
        ].filter(r => !filter?.craftingSystemId || r.craftingSystemId === filter.craftingSystemId),
        getRecipe: (id) => id === 'r1'
          ? makeRecipe({ id: 'r1', name: 'Open', craftingSystemId: 'sys1', visibility: { restricted: false } })
          : null
      });
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      const vs = get(store.viewState);
      const r = vs.recipes.find(r => r.id === 'r1');
      assert.equal(r?.visibilitySummary, 'All players');
    });

    it('_visibilitySummary returns "Restricted (none selected)" for restricted recipe with empty allowedUserIds', async () => {
      const services = createMockServices();
      const origManager = services.getRecipeManager();
      services.getRecipeManager = () => ({
        ...origManager,
        getRecipes: (filter) => [
          makeRecipe({ id: 'r1', name: 'VIP', craftingSystemId: 'sys1', visibility: { restricted: true, allowedUserIds: [] } })
        ].filter(r => !filter?.craftingSystemId || r.craftingSystemId === filter.craftingSystemId),
        getRecipe: () => null
      });
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      const vs = get(store.viewState);
      const r = vs.recipes.find(r => r.id === 'r1');
      assert.equal(r?.visibilitySummary, 'Restricted (none selected)');
    });

    it('_visibilitySummary returns "Restricted (N)" for restricted recipe with N allowed users', async () => {
      const services = createMockServices();
      const origManager = services.getRecipeManager();
      services.getRecipeManager = () => ({
        ...origManager,
        getRecipes: (filter) => [
          makeRecipe({ id: 'r1', name: 'VIP', craftingSystemId: 'sys1',
            visibility: { restricted: true, allowedUserIds: ['u1', 'u2'] } })
        ].filter(r => !filter?.craftingSystemId || r.craftingSystemId === filter.craftingSystemId),
        getRecipe: () => null
      });
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      const vs = get(store.viewState);
      const r = vs.recipes.find(r => r.id === 'r1');
      assert.equal(r?.visibilitySummary, 'Restricted (2)');
    });

    it('viewState.hasSystem is false and selectedSystem is null when no systems exist', async () => {
      const services = createMockServices();
      const origManager = services.getCraftingSystemManager();
      services.getCraftingSystemManager = () => ({
        ...origManager,
        getSystems: () => [],
        getSystem: () => null,
        getItems: () => []
      });
      const store = createAdminStore(services);
      await store.refresh();
      const vs = get(store.viewState);
      assert.equal(vs.hasSystem, false);
      assert.equal(vs.selectedSystem, null);
    });

    it('viewState.itemCards are populated from systemManager.getItems when a system is selected', async () => {
      const services = createMockServices();
      const origManager = services.getCraftingSystemManager();
      const sys = origManager.getSystem('sys1');
      if (sys) sys.items = [makeItem({ id: 'i1', name: 'Herb' }), makeItem({ id: 'i2', name: 'Salt' })];
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      const vs = get(store.viewState);
      assert.ok(Array.isArray(vs.itemCards), 'itemCards should be an array');
      assert.equal(vs.itemCards.length, 2);
    });

    it('viewState.itemCards expose essence icons, source UUID display, and salvage summary fields', async () => {
      const services = createMockServices();
      const origManager = services.getCraftingSystemManager();
      const sys = origManager.getSystem('sys1');
      if (sys) {
        sys.features = { salvage: true, itemTags: true, essences: true };
        sys.essenceDefinitions = [
          { id: 'ess-fire', name: 'Fire', description: '', icon: 'fas fa-fire', sourceItemUuid: null },
          { id: 'ess-shadow', name: 'Shadow', description: '', icon: '', sourceItemUuid: null }
        ];
        sys.components = [
          makeItem({
            id: 'comp-1',
            name: 'Blazing Herb',
            description: ' Hot enough to scorch your fingers. ',
            sourceUuid: 'Item.live-123',
            sourceItemUuid: 'Compendium.source.items.blazing-herb',
            tags: ['fire'],
            essences: { 'ess-fire': 2, 'ess-shadow': 1 },
            salvage: {
              enabled: true,
              ingredientQuantity: 3,
              toolIds: ['knife'],
              resultGroups: [{ id: 'grp-1', results: [] }],
              timeRequirement: { seconds: 60 },
              currencyRequirement: { amount: 5 },
              outcomeRouting: { success: 'grp-1' }
            }
          })
        ];
        delete sys.items;
      }
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      const vs = get(store.viewState);
      const card = vs.itemCards[0];

      assert.equal(card.description, 'Hot enough to scorch your fingers.');
      assert.equal(card.hasDescription, true);
      assert.equal(card.sourceUuidDisplay, 'Compendium.source.items.blazing-herb');
      assert.equal(card.hasSourceUuid, true);
      assert.equal(card.sourceOrigin, 'compendium');
      assert.equal(card.sourceOriginLabel, 'Compendium');
      assert.equal(card.sourceMissing, false);
      assert.deepEqual(card.tags, ['fire']);
      assert.deepEqual(card.essences, [
        { id: 'ess-fire', name: 'Fire', icon: 'fas fa-fire', quantity: 2 },
        { id: 'ess-shadow', name: 'Shadow', icon: 'fas fa-mortar-pestle', quantity: 1 }
      ]);
      assert.deepEqual(card.salvageSummary, {
        quantityRequired: 3,
        toolCount: 1,
        resultGroupCount: 1,
        hasTimeRequirement: true,
        hasCurrencyRequirement: true,
        outcomeCount: 1
      });
    });

    it('viewState.itemCards normalize object-shaped descriptions without object strings', async () => {
      const services = createMockServices();
      const origManager = services.getCraftingSystemManager();
      const sys = origManager.getSystem('sys1');
      if (sys) {
        sys.components = [
          makeItem({
            id: 'comp-object-description',
            name: 'Silverweed',
            description: { value: '<p>Bright <strong>moonlit</strong> leaves.</p>' }
          }),
          makeItem({
            id: 'comp-unknown-description',
            name: 'Voidbloom',
            description: { unexpected: 'shape' }
          })
        ];
        delete sys.items;
      }

      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      const vs = get(store.viewState);

      assert.equal(vs.itemCards[0].description, 'Bright moonlit leaves.');
      assert.equal(vs.itemCards[0].hasDescription, true);
      assert.equal(vs.itemCards[1].description, '');
      assert.equal(vs.itemCards[1].hasDescription, false);
      assert.ok(!JSON.stringify(vs.itemCards).includes('[object Object]'));
    });

    it('viewState.selectedSystem exposes managed item images and resolved essence source item metadata', async () => {
      const services = createMockServices();
      const origManager = services.getCraftingSystemManager();
      const sys = origManager.getSystem('sys1');
      if (sys) {
        sys.features = { essences: true };
        sys.components = [
          makeItem({
            id: 'comp-1',
            name: 'Blazing Herb',
            img: 'blazing-herb.png',
            description: { value: '<p>Bright <strong>ember</strong> leaf.</p>' }
          }),
          makeItem({
            id: 'comp-2',
            name: 'Moon Salt',
            img: '',
            description: { unexpected: 'shape' }
          })
        ];
        sys.essenceDefinitions = [
          {
            id: 'ess-fire',
            name: 'Fire',
            description: 'Hot stuff',
            icon: 'fas fa-fire',
            sourceItemUuid: 'comp-1',
            associatedSystemItemId: 'comp-1'
          },
          {
            id: 'ess-moon',
            name: 'Moon',
            description: '',
            icon: 'fas fa-moon',
            sourceItemUuid: null,
            associatedSystemItemId: null
          }
        ];
      }

      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      const vs = get(store.viewState);
      const [linkedEssence, unlinkedEssence] = vs.selectedSystem.essenceDefinitions;

      assert.deepEqual(vs.selectedSystem.managedItemOptions, [
        { id: 'comp-1', name: 'Blazing Herb', img: 'blazing-herb.png', description: 'Bright ember leaf.' },
        { id: 'comp-2', name: 'Moon Salt', img: 'icons/svg/item-bag.svg', description: '' }
      ]);
      assert.deepEqual(linkedEssence.associatedItem, {
        id: 'comp-1',
        name: 'Blazing Herb',
        img: 'blazing-herb.png'
      });
      assert.equal(linkedEssence.associatedItemName, 'Blazing Herb');
      assert.equal(unlinkedEssence.associatedItem, null);
      assert.equal(unlinkedEssence.associatedItemName, null);
    });

    it('viewState.essenceCards expose source state and component usage for manager', async () => {
      const services = createMockServices();
      const origManager = services.getCraftingSystemManager();
      const sys = origManager.getSystem('sys1');
      if (sys) {
        sys.features = { essences: true };
        sys.components = [
          makeItem({
            id: 'comp-1',
            name: 'Blazing Herb',
            img: 'blazing-herb.png',
            sourceItemUuid: 'Compendium.fabricate.items.blazing-herb',
            essences: { 'ess-fire': 2 }
          }),
          makeItem({
            id: 'comp-2',
            name: 'Moon Salt',
            img: '',
            essences: {}
          })
        ];
        sys.essenceDefinitions = [
          {
            id: 'ess-fire',
            name: 'Fire',
            description: 'Hot stuff',
            icon: 'fas fa-fire',
            sourceComponentId: 'comp-1',
            sourceItemUuid: 'comp-1',
            associatedSystemItemId: 'comp-1'
          },
          {
            id: 'ess-moon',
            name: 'Moon',
            description: '',
            icon: '',
            sourceComponentId: null,
            sourceItemUuid: null,
            associatedSystemItemId: null
          }
        ];
      }

      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      const cards = get(store.viewState).essenceCards;

      assert.equal(cards.length, 2);
      assert.equal(cards[0].sourceComponentId, 'comp-1');
      assert.equal(cards[0].sourceName, 'Blazing Herb');
      assert.equal(cards[0].sourceState, 'linked');
      assert.equal(cards[0].componentUsageCount, 1);
      assert.deepEqual(cards[0].componentUsageItems, [
        { id: 'comp-1', name: 'Blazing Herb', img: 'blazing-herb.png' }
      ]);
      assert.equal(cards[0].deleteBlocked, true);
      assert.equal(cards[1].sourceState, 'none');
      assert.deepEqual(cards[1].componentUsageItems, []);
      assert.equal(cards[1].icon, DEFAULT_ESSENCE_ICON);
      assert.equal(cards[1].deleteBlocked, false);
    });

    it('viewState.recipeSearchTerm and itemSearchTerm echo the current search values', async () => {
      const services = createMockServices();
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      await store.setRecipeSearch('healing');
      await store.setItemSearch('iron');
      const vs = get(store.viewState);
      assert.equal(vs.recipeSearchTerm, 'healing');
      assert.equal(vs.itemSearchTerm, 'iron');
    });
  });

  // -------------------------------------------------------------------------
  // Three-way dirty-navigation confirm
  // -------------------------------------------------------------------------
  describe('confirmDiscardDirty*Draft (three-way)', () => {
    it('returns the choiceDialog action verbatim for save/discard/cancel', async () => {
      for (const action of ['save', 'discard', 'cancel']) {
        const services = createMockServices({ choiceDialog: async () => action });
        const store = createAdminStore(services);
        assert.equal(await store.confirmDiscardDirtyComponentDraft(), action);
        assert.equal(await store.confirmDiscardDirtyEssenceDraft(), action);
        assert.equal(await store.confirmDiscardDirtyGatheringTaskDraft(), action);
        assert.equal(await store.confirmDiscardDirtyGatheringEventDraft(), action);
      }
    });

    it('passes Save as the default action to the choiceDialog', async () => {
      let captured = null;
      const services = createMockServices({ choiceDialog: async (opts) => { captured = opts; return 'cancel'; } });
      const store = createAdminStore(services);
      await store.confirmDiscardDirtyComponentDraft();
      assert.equal(captured.defaultAction, 'save');
      assert.deepEqual(captured.choices.map(c => c.action), ['save', 'discard', 'cancel']);
    });

    it('falls back to the two-way confirm when no choiceDialog is available', async () => {
      const confirmTrue = createMockServices({ choiceDialog: undefined, confirmDialog: async () => true });
      const storeTrue = createAdminStore(confirmTrue);
      assert.equal(await storeTrue.confirmDiscardDirtyComponentDraft(), 'discard');

      const confirmFalse = createMockServices({ choiceDialog: undefined, confirmDialog: async () => false });
      const storeFalse = createAdminStore(confirmFalse);
      assert.equal(await storeFalse.confirmDiscardDirtyComponentDraft(), 'cancel');
    });

    it('treats an unexpected choiceDialog result as cancel', async () => {
      const services = createMockServices({ choiceDialog: async () => undefined });
      const store = createAdminStore(services);
      assert.equal(await store.confirmDiscardDirtyComponentDraft(), 'cancel');
    });
  });

});

describe('createAdminStore — gathering economy', () => {
  it('preserves the per-system economy block (two flags) in the normalized gathering config', async () => {
    // Regression: the normalizer used to drop systems[id].economy, so the task
    // editor (which reads the limitation flags reactively) lost its gating.
    const gatheringConfig = { systems: { sys1: { economy: { stamina: { enabled: true, max: '40', start: '', regen: { policy: 'none', unit: 'hours', amount: '' } }, nodes: { enabled: false } } } } };
    const services = createMockServices({ getSetting: (key) => (key === 'gatheringConfig' ? gatheringConfig : '') });
    const store = createAdminStore(services);
    await store.refresh();
    const vs = get(store.viewState);
    // The two flags are preserved verbatim by the store normalizer.
    assert.equal(vs.gatheringConfig.systems.sys1.economy.stamina.enabled, true);
    assert.equal(vs.gatheringConfig.systems.sys1.economy.nodes.enabled, false);
    assert.equal(vs.gatheringConfig.systems.sys1.economy.stamina.max, '40');
  });

  it('preserves a library task node config through normalization (so it survives save)', async () => {
    const gatheringConfig = { systems: { sys1: { economy: { nodes: { enabled: true } }, tasks: [{ id: 't1', name: 'Mine', nodes: { enabled: true, max: 4, current: 4, depletionTiming: 'onStart', respawn: { policy: 'overTime', gainMode: 'guaranteed', intervalSeconds: 3600 } } }] } } };
    const services = createMockServices({ getSetting: (key) => (key === 'gatheringConfig' ? gatheringConfig : '') });
    const store = createAdminStore(services);
    await store.refresh();
    const node = get(store.viewState).gatheringConfig.systems.sys1.tasks[0].nodes;
    assert.equal(node.max, 4);
    assert.equal(node.depletionTiming, 'onStart');
    assert.equal(node.respawn.policy, 'overTime');
    assert.equal(node.respawn.gainMode, 'guaranteed');
  });

  it('refreshGatheringConfig re-reads the setting so a flag change reflects without reopening', async () => {
    // The economy panel persists via the game service, not the store, so the
    // store's viewState would otherwise stay stale until the app reopens.
    let gatheringConfig = { systems: { sys1: { economy: { stamina: { enabled: true, regen: { policy: 'none', unit: 'hours', amount: '' } }, nodes: { enabled: false } } } } };
    const services = createMockServices({ getSetting: (key) => (key === 'gatheringConfig' ? gatheringConfig : '') });
    const store = createAdminStore(services);
    await store.refresh();
    assert.equal(get(store.viewState).gatheringConfig.systems.sys1.economy.stamina.enabled, true);

    // External write disables stamina; refresh pulls the new flags into viewState.
    gatheringConfig = { systems: { sys1: { economy: { stamina: { enabled: false, regen: { policy: 'none', unit: 'hours', amount: '' } }, nodes: { enabled: false } } } } };
    store.refreshGatheringConfig();
    assert.equal(get(store.viewState).gatheringConfig.systems.sys1.economy.stamina.enabled, false);
  });
});
