/**
 * Tests for adminStore factory (T-120)
 * Uses node:test + node:assert/strict
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';

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
    features: overrides.features || {},
    advancedOptionsEnabled: overrides.advancedOptionsEnabled !== undefined ? overrides.advancedOptionsEnabled : true,
    categories: overrides.categories || [],
    itemTags: overrides.itemTags || [],
    essenceDefinitions: overrides.essenceDefinitions || [],
    items: overrides.items || [],
    requirements: overrides.requirements || { time: { enabled: false }, currency: { enabled: false, provider: 'macro' } },
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
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      assert.equal(get(store.selectedSystemId), 'sys1');
      assert.equal(persisted, 'sys1');
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

    it('saveSystemDetails calls systemManager.updateSystem with given name, description, advancedOptionsEnabled', async () => {
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
      await store.saveSystemDetails('Updated Name', 'Updated Desc', false);
      assert.ok(updateArgs !== null, 'updateSystem should be called');
      assert.equal(updateArgs.id, 'sys1');
      assert.equal(updateArgs.updates.name, 'Updated Name');
      assert.equal(updateArgs.updates.description, 'Updated Desc');
      assert.equal(updateArgs.updates.advancedOptionsEnabled, false);
    });

    it('saveSystemDetails does nothing when no system is selected', async () => {
      let updateCalled = false;
      const services = createMockServices();
      const origManager = services.getCraftingSystemManager();
      services.getCraftingSystemManager = () => ({
        ...origManager,
        updateSystem: async () => { updateCalled = true; }
      });
      const store = createAdminStore(services);
      // selectedSystemId stays '' — never call selectSystem
      await store.saveSystemDetails('Name', 'Desc', true);
      assert.ok(!updateCalled, 'updateSystem should not be called when no system is selected');
    });
  });

  // -------------------------------------------------------------------------
  // 5. Feature toggles
  // -------------------------------------------------------------------------

  describe('feature toggles', () => {
    it('toggleFeature("categories", true) calls updateSystem with recipeCategories: true', async () => {
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
      await store.toggleFeature('categories', true);
      assert.ok(updateArgs, 'updateSystem should be called');
      assert.deepEqual(updateArgs.updates.features, { recipeCategories: true });
    });

    it('toggleFeature maps all feature names correctly', async () => {
      const expectedMappings = {
        categories: 'recipeCategories',
        itemTags: 'itemTags',
        essences: 'essences',
        complexRecipes: 'complexRecipes',
        multiStepRecipes: 'multiStepRecipes',
        propertyMacros: 'propertyMacros',
        craftingChecks: 'craftingChecks',
        outcomeRouting: 'outcomeRouting',
        effectTransfer: 'effectTransfer'
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

    it('toggleAdvancedOptions(false) calls updateSystem with advancedOptionsEnabled: false', async () => {
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
      await store.toggleAdvancedOptions(false);
      assert.ok(updateArgs, 'updateSystem should be called');
      assert.equal(updateArgs.updates.advancedOptionsEnabled, false);
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
      assert.ok('provider' in updateArgs.updates.requirements.currency, 'should preserve provider field');
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

    it('addEssence persists the selected source item id on both essence source fields', async () => {
      let savedEssences = null;
      const services = createMockServices();
      const origManager = services.getCraftingSystemManager();
      const sys = origManager.getSystem('sys1');
      if (sys) {
        sys.components = [makeItem({ id: 'comp-1', name: 'Sunleaf', img: 'sunleaf.png' })];
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
      assert.equal(newEssence.sourceItemUuid, 'comp-1');
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

    it('createRecipe calls openRecipeEditor when a system is selected', async () => {
      let editorArgs = null;
      const services = createMockServices({
        openRecipeEditor: (...args) => { editorArgs = args; }
      });
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      await store.createRecipe();
      assert.ok(editorArgs !== null, 'openRecipeEditor should be called');
      assert.equal(editorArgs[0], null, 'first arg should be null (new recipe)');
      assert.equal(editorArgs[2], 'sys1', 'third arg should be the system id');
    });

    it('createRecipe warns and skips openRecipeEditor when no system is selected', async () => {
      let warnMsg = null;
      let editorCalled = false;
      const services = createMockServices({
        openRecipeEditor: () => { editorCalled = true; },
        notify: {
          info: () => {},
          warn: (m) => { warnMsg = m; },
          error: () => {}
        }
      });
      const store = createAdminStore(services);
      // No selectSystem — selectedSystemId stays ''
      await store.createRecipe();
      assert.ok(warnMsg !== null, 'warn should be called when no system selected');
      assert.ok(!editorCalled, 'openRecipeEditor should not be called when no system selected');
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
      const store = createAdminStore(services);
      // No selectSystem call
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

    it('saveCurrencyConfig builds correct requirements object with macro provider', async () => {
      let updateArgs = null;
      const services = createMockServices();
      const origManager = services.getCraftingSystemManager();
      services.getCraftingSystemManager = () => ({
        ...origManager,
        updateSystem: async (id, updates) => { updateArgs = { id, updates }; await origManager.updateSystem(id, updates); }
      });
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      await store.saveCurrencyConfig('macro', null, 'check-uuid', 'decrement-uuid', 'format-uuid');
      assert.ok(updateArgs !== null);
      const currency = updateArgs.updates.requirements.currency;
      assert.equal(currency.provider, 'macro');
      assert.equal(currency.checkCurrencyMacroUuid, 'check-uuid');
      assert.equal(currency.decrementCurrencyMacroUuid, 'decrement-uuid');
      assert.equal(currency.formatCurrencyMacroUuid, 'format-uuid');
    });

    it('saveCurrencyConfig with system provider sets systemAdapter and nulls macro UUIDs', async () => {
      let updateArgs = null;
      const services = createMockServices();
      const origManager = services.getCraftingSystemManager();
      services.getCraftingSystemManager = () => ({
        ...origManager,
        updateSystem: async (id, updates) => { updateArgs = { id, updates }; await origManager.updateSystem(id, updates); }
      });
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      await store.saveCurrencyConfig('system', 'dnd5e', null, null, null);
      assert.ok(updateArgs !== null);
      const currency = updateArgs.updates.requirements.currency;
      assert.equal(currency.provider, 'system');
      assert.equal(currency.systemAdapter, 'dnd5e');
      assert.equal(currency.checkCurrencyMacroUuid, null, 'macro UUIDs should be null for system provider');
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
        'toggleFeature', 'toggleAdvancedOptions', 'toggleRequirement',
        'addCategory', 'removeCategory',
        'addTag', 'removeTag',
        'addEssence', 'removeEssence',
        'saveCraftingCheckConfig', 'saveCurrencyConfig', 'saveVisibilityConfig', 'saveTeaserConfig',
        'createRecipe', 'deleteRecipe', 'duplicateRecipe', 'toggleRecipeEnabled',
        'importRecipes', 'exportRecipes',
        'exportSystem', 'importSystem',
        'deleteComponent',
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
    it('viewState.systems entries include id, name, description, and selected flag', async () => {
      const services = createMockServices();
      const store = createAdminStore(services);
      await store.refresh();
      const vs = get(store.viewState);
      for (const sys of vs.systems) {
        assert.ok('id' in sys, 'system entry should have id');
        assert.ok('name' in sys, 'system entry should have name');
        assert.ok('description' in sys, 'system entry should have description');
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
        'id', 'name', 'description', 'advancedOptionsEnabled', 'features',
        'categories', 'itemTags', 'essenceDefinitions', 'managedItemOptions',
        'requirements', 'craftingCheck', 'recipeVisibility',
        'showRecipeVisibilityKnowledgeOptions', 'showRecipeVisibilityPlayerNote',
        'showTags', 'showEssences', 'availableScriptMacros'
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
      for (const key of [
        'recipeCategories', 'itemTags', 'essences', 'complexRecipes',
        'multiStepRecipes', 'propertyMacros', 'craftingChecks',
        'outcomeRouting', 'effectTransfer'
      ]) {
        assert.ok(key in features, `features should have key: ${key}`);
      }
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

    it('viewState.selectedSystem.showTags and showEssences are true when features and advancedOptions are both enabled', async () => {
      const services = createMockServices();
      const origManager = services.getCraftingSystemManager();
      const sys = origManager.getSystem('sys1');
      if (sys) {
        sys.advancedOptionsEnabled = true;
        sys.features = { itemTags: true, essences: true };
      }
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      const vs = get(store.viewState);
      assert.equal(vs.selectedSystem?.showTags, true);
      assert.equal(vs.selectedSystem?.showEssences, true);
    });

    it('viewState.selectedSystem.showTags is false when advancedOptionsEnabled is false, even if feature is on', async () => {
      const services = createMockServices();
      const origManager = services.getCraftingSystemManager();
      const sys = origManager.getSystem('sys1');
      if (sys) {
        sys.advancedOptionsEnabled = false;
        sys.features = { itemTags: true, essences: true };
      }
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      const vs = get(store.viewState);
      assert.equal(vs.selectedSystem?.showTags, false);
      assert.equal(vs.selectedSystem?.showEssences, false);
    });

    it('viewState.recipes entries include all required display fields', async () => {
      const services = createMockServices();
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      const vs = get(store.viewState);
      assert.ok(vs.recipes.length > 0, 'should have at least one recipe');
      for (const recipe of vs.recipes) {
        for (const field of ['id', 'name', 'img', 'category', 'enabled', 'locked', 'isSimple', 'visibilitySummary', 'ingredients', 'catalysts']) {
          assert.ok(field in recipe, `recipe entry should have field: ${field}`);
        }
      }
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

    it('viewState.hasSystem is false and selectedSystem is null when no system is selected', async () => {
      const services = createMockServices();
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
        sys.advancedOptionsEnabled = true;
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
              catalysts: [{ componentId: 'knife' }],
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
      assert.deepEqual(card.tags, ['fire']);
      assert.deepEqual(card.essences, [
        { id: 'ess-fire', name: 'Fire', icon: 'fas fa-fire', quantity: 2 },
        { id: 'ess-shadow', name: 'Shadow', icon: 'fas fa-mortar-pestle', quantity: 1 }
      ]);
      assert.deepEqual(card.salvageSummary, {
        quantityRequired: 3,
        catalystCount: 1,
        resultGroupCount: 1,
        hasTimeRequirement: true,
        hasCurrencyRequirement: true,
        outcomeCount: 1
      });
    });

    it('viewState.selectedSystem exposes managed item images and resolved essence source item metadata', async () => {
      const services = createMockServices();
      const origManager = services.getCraftingSystemManager();
      const sys = origManager.getSystem('sys1');
      if (sys) {
        sys.features = { essences: true };
        sys.advancedOptionsEnabled = true;
        sys.components = [
          makeItem({ id: 'comp-1', name: 'Blazing Herb', img: 'blazing-herb.png' }),
          makeItem({ id: 'comp-2', name: 'Moon Salt', img: '' })
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
        { id: 'comp-1', name: 'Blazing Herb', img: 'blazing-herb.png' },
        { id: 'comp-2', name: 'Moon Salt', img: 'icons/svg/item-bag.svg' }
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

});
