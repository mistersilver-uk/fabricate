/**
 * Tests for adminStore factory (T-120)
 * Uses node:test + node:assert/strict
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';
import {
  DEFAULT_GATHERING_EVENT_IMG,
  DEFAULT_GATHERING_TASK_IMG,
} from '../../src/gatheringImageDefaults.js';
import { CraftingSystemManager } from '../../src/systems/CraftingSystemManager.js';
import { InventoryListingBuilder } from '../../src/systems/InventoryListingBuilder.js';
import {
  REPORTER_ENRICHER_DESCRIPTION,
  REPORTER_RESOLVED_EXPECTED,
} from '../helpers/enricherDescriptionFixtures.js';

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
    requirements: overrides.requirements || {
      time: { enabled: false },
      currency: { enabled: false, units: [] },
    },
    craftingCheck: overrides.craftingCheck || { mode: 'passFail', macroUuid: null, outcomes: [] },
    recipeVisibility: overrides.recipeVisibility || { listMode: 'global' },
    ...overrides,
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
    toJSON: () => ({
      id,
      name: overrides.name || `Recipe ${id}`,
      craftingSystemId: overrides.craftingSystemId || '',
      visibility: overrides.visibility ?? null,
    }),
    ...overrides,
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
    ...overrides,
  };
}

/**
 * Creates a fully-stubbed services object for adminStore tests.
 */
function createMockServices(overrides = {}) {
  const store = {
    lastManagedCraftingSystem: '',
  };

  let systems = overrides.systems || [makeSystem({ id: 'sys1', name: 'System One' })];
  let recipes = [makeRecipe({ id: 'r1', name: 'Recipe One', craftingSystemId: 'sys1' })];

  const mockSystemManager = {
    getSystems: () => systems,
    getSystem: (id) => systems.find((s) => s.id === id) || null,
    createSystem: async (data) => {
      const sys = makeSystem({ ...data, id: data.id || `sys-created-${Date.now()}` });
      systems.push(sys);
      return sys;
    },
    updateSystem: async (id, updates) => {
      const idx = systems.findIndex((s) => s.id === id);
      if (idx >= 0) {
        systems[idx] = { ...systems[idx], ...updates };
        // Merge features specially
        if (updates.features) {
          systems[idx].features = { ...(systems[idx - 0]?.features || {}), ...updates.features };
          // Re-merge since we overwrote
          const base = systems.find((s) => s.id === id) || {};
          systems[idx].features = { ...(base.features || {}), ...updates.features };
        }
      }
    },
    deleteSystem: async (id) => {
      systems = systems.filter((s) => s.id !== id);
    },
    getItems: (systemId, searchTerm) => {
      const sys = systems.find((s) => s.id === systemId);
      const items = sys?.components || sys?.items || [];
      if (!searchTerm) return items;
      const lower = searchTerm.toLowerCase();
      return items.filter((i) => i.name.toLowerCase().includes(lower));
    },
    deleteItem: async (systemId, itemId) => {
      const sys = systems.find((s) => s.id === systemId);
      if (sys) {
        if (Array.isArray(sys.items)) {
          sys.items = sys.items.filter((i) => i.id !== itemId);
        }
        if (Array.isArray(sys.components)) {
          sys.components = sys.components.filter((i) => i.id !== itemId);
        }
      }
    },
    deleteEssence: async (systemId, essenceId) => {
      const sys = systems.find((s) => s.id === systemId);
      if (!sys) return false;
      const defs = Array.isArray(sys.essenceDefinitions) ? sys.essenceDefinitions : [];
      if (!defs.some((d) => d.id === essenceId)) return false;
      sys.essenceDefinitions = defs.filter((d) => d.id !== essenceId);
      sys.essences = sys.essenceDefinitions.map((d) => d.id);
      return true;
    },
  };

  const mockRecipeManager = {
    getRecipes: (filter) => {
      if (filter?.craftingSystemId) {
        return recipes.filter((r) => r.craftingSystemId === filter.craftingSystemId);
      }
      return recipes;
    },
    getRecipe: (id) => recipes.find((r) => r.id === id) || null,
    createRecipe: async (data) => {
      const r = makeRecipe({ ...data, id: `r-new-${Date.now()}` });
      recipes.push(r);
      return r;
    },
    updateRecipe: async (id, updates) => {
      const idx = recipes.findIndex((r) => r.id === id);
      if (idx >= 0) recipes[idx] = { ...recipes[idx], ...updates };
    },
    deleteRecipe: async (id) => {
      recipes = recipes.filter((r) => r.id !== id);
    },
    importRecipes: async (data, overwrite) => {},
    exportRecipes: () => recipes.map((r) => r.toJSON()),
  };

  const base = {
    getSetting: (key) => store[key] ?? '',
    setSetting: async (key, value) => {
      store[key] = value;
    },
    getCraftingSystemManager: () => mockSystemManager,
    getRecipeManager: () => mockRecipeManager,
    getScriptMacros: () => [],
    getSceneOptions: () => [],
    notify: {
      info: () => {},
      warn: () => {},
      error: () => {},
    },
    confirmDialog: async () => true,
    localize: (key) => key,
    copyToClipboard: async () => {},
    openRecipeEditor: () => {},
    renderImportDialog: async () => {},
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
const { PF2E_CURRENCY_PRESETS } = await import('../../src/config/currencyPresets.js');

/**
 * Spin up an adminStore whose `updateSystem` calls are captured, select `sys1`,
 * and expose readers for the captured payload. The currency setter/seed tests
 * all share this exact setup (capture `updateSystem` → drive setters → read back
 * `requirements.currency`), so it lives here instead of being inlined per test.
 *
 * @param {object} [overrides] forwarded to `createMockServices`
 * @returns {Promise<{ store: object, currency: () => object, updateArgs: () => object|null }>}
 */
async function setupCurrencyStore(overrides = {}) {
  let updateArgs = null;
  const services = createMockServices(overrides);
  const origManager = services.getCraftingSystemManager();
  services.getCraftingSystemManager = () => ({
    ...origManager,
    updateSystem: async (id, updates) => {
      updateArgs = { id, updates };
      await origManager.updateSystem(id, updates);
    },
  });
  const store = createAdminStore(services);
  await store.selectSystem('sys1');
  return {
    store,
    currency: () => updateArgs.updates.requirements.currency,
    updateArgs: () => updateArgs,
  };
}

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
        getSetting: () => '',
      });
      const store = createAdminStore(services);
      await store.refresh();
      const vs = get(store.viewState);
      assert.equal(get(store.selectedSystemId), 'sys1');
      assert.equal(vs.selectedSystem?.id, 'sys1');
      assert.equal(vs.systems[0].selected, true);
    });

    it('projects features.refundOnPlayerCancel (default ON) into the selected system', async () => {
      // The projection is a hand-built allowlist: without the projected field the
      // player-cancel refund toggle (issue 848) would be invisible to the manager UI.
      const services = createMockServices();
      const store = createAdminStore(services);
      await store.refresh();
      await store.selectSystem('sys1');
      const selected = get(store.viewState).selectedSystem;
      assert.equal(
        selected.features.refundOnPlayerCancel,
        true,
        'a system with no explicit flag defaults to refunding on cancel'
      );
    });

    it('projects an explicit features.refundOnPlayerCancel:false as forfeit-on-cancel', async () => {
      const services = createMockServices({
        systems: [
          makeSystem({ id: 'sys1', name: 'System One', features: { refundOnPlayerCancel: false } }),
        ],
      });
      const store = createAdminStore(services);
      await store.refresh();
      await store.selectSystem('sys1');
      const selected = get(store.viewState).selectedSystem;
      assert.equal(
        selected.features.refundOnPlayerCancel,
        false,
        'an explicit false projects through as forfeit-on-cancel'
      );
    });

    it('restores selected system from lastManagedCraftingSystem setting', () => {
      const services = createMockServices({
        getSetting: (key) => (key === 'lastManagedCraftingSystem' ? 'sys1' : ''),
      });
      const store = createAdminStore(services);
      assert.equal(get(store.selectedSystemId), 'sys1');
    });

    it('falls back to first system when saved system no longer exists', async () => {
      const services = createMockServices({
        getSetting: (key) => (key === 'lastManagedCraftingSystem' ? 'sys-gone' : ''),
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
      assert.equal(
        vs.selectedSystem?.id,
        'sys1',
        'phase-1 must publish selected system details before yielding'
      );
      assert.equal(vs.selectedSystem?.name, 'System One');
      assert.equal(
        vs.recipes.length,
        1,
        'phase-1 must publish synchronous recipe browser data before yielding'
      );
      // Let phase-2 settle so the rest of the suite starts from a clean state.
      await store.refresh();
    });

    it('projects toolBreakage.authority and preserves per-check checkBreakage blocks (issue 419)', async () => {
      const services = createMockServices();
      // Seed the selected system with checkDriven authority and a checkBreakage
      // block on every per-mode check sub-object the projection clones.
      const checkBreakage = {
        enabled: true,
        triggers: [
          {
            id: 'trg1',
            label: 'Natural 1',
            condition: { type: 'diceGroup', groupId: 0, aggregate: 'anyDie', operator: '==', value: 1 },
          },
        ],
      };
      const systems = services._getSystemsMutable();
      const sys = systems.find((s) => s.id === 'sys1');
      sys.toolBreakage = { authority: 'checkDriven' };
      sys.craftingCheck = {
        mode: 'passFail',
        simple: { rollFormula: '1d20', checkBreakage },
        routed: { type: 'relative', rollFormula: '1d20', checkBreakage },
        progressive: { rollFormula: '2d6', checkBreakage },
      };

      const store = createAdminStore(services);
      await store.refresh();
      const selected = get(store.viewState).selectedSystem;

      // Authority is now visible in the projection (was previously unprojected).
      assert.deepEqual(selected.toolBreakage, { authority: 'checkDriven' });

      // The checkBreakage block survives the _clonePlain projection for every mode.
      for (const mode of ['simple', 'routed', 'progressive']) {
        assert.deepEqual(
          selected.craftingCheck[mode].checkBreakage,
          checkBreakage,
          `craftingCheck.${mode}.checkBreakage survives the projection clone`
        );
        // It is a deep clone, not the same reference (the projection must not leak
        // the live persisted object into the view state).
        assert.notEqual(
          selected.craftingCheck[mode].checkBreakage,
          checkBreakage,
          `craftingCheck.${mode}.checkBreakage is cloned, not shared`
        );
      }
    });

    it('projects the crafting check-modifier catalogue, policy, and default ids (issue 770 allowlist)', async () => {
      // The projection is a hand-built allowlist: a field dropped from it is invisible
      // to the UI. The ChecksView mount test feeds these as direct props, bypassing the
      // projection, so this reads the ACTUAL projection to catch a silently-dropped field.
      const services = createMockServices();
      const sys = services._getSystemsMutable().find((s) => s.id === 'sys1');
      sys.craftingCheck = {
        mode: 'passFail',
        simple: { rollFormula: '1d20 + @craftingmod' },
        checkModifiers: [
          { id: 'med', label: 'Medicine', expression: '@abilities.med.mod' },
          { id: 'alch', label: 'Alchemy', expression: '@abilities.alch.mod' },
        ],
        defaultModifierPolicy: 'highest',
        defaultModifierIds: ['med'],
      };
      const store = createAdminStore(services);
      await store.refresh();
      const check = get(store.viewState).selectedSystem.craftingCheck;

      assert.deepEqual(
        check.checkModifiers.map((modifier) => modifier.id),
        ['med', 'alch'],
        'the catalogue surfaces through the projection allowlist'
      );
      assert.notEqual(
        check.checkModifiers[0],
        sys.craftingCheck.checkModifiers[0],
        'catalogue entries are cloned, not shared with the live system'
      );
      assert.equal(check.defaultModifierPolicy, 'highest');
      assert.deepEqual(check.defaultModifierIds, ['med']);
    });

    it('saveCraftingCheckModifiers preserves sibling check fields and replaces the catalogue array (issue 770 persistence trap)', async () => {
      // updateSystem shallow-merges only the top level, so a checkModifiers-only patch
      // that failed to spread `...existing` would drop every sibling check field. Capture
      // the persisted payload and assert the siblings survive AND that a dropped catalogue
      // entry does not resurrect (whole-array replace, not merge).
      let updateArgs = null;
      const services = createMockServices();
      const sys = services._getSystemsMutable().find((s) => s.id === 'sys1');
      sys.craftingCheck = {
        mode: 'passFail',
        simple: { rollFormula: '1d20 + @craftingmod', dc: 12 },
        routed: { type: 'relative', rollFormula: '1d20' },
        progressive: { rollFormula: '2d6' },
        consumption: { consumeIngredientsOnFail: false, breakToolsOnFail: true },
        checkModifiers: [
          { id: 'med', label: 'Medicine', expression: '@med' },
          { id: 'alch', label: 'Alchemy', expression: '@alch' },
        ],
        defaultModifierPolicy: 'addAll',
        defaultModifierIds: ['med', 'alch'],
      };
      const origManager = services.getCraftingSystemManager();
      services.getCraftingSystemManager = () => ({
        ...origManager,
        updateSystem: async (id, updates) => {
          updateArgs = { id, updates };
          await origManager.updateSystem(id, updates);
        },
      });
      const store = createAdminStore(services);
      await store.selectSystem('sys1');

      // A checkModifiers-only patch (the shallow-spread footgun surface): drop 'alch'.
      await store.saveCraftingCheckModifiers({
        checkModifiers: [{ id: 'med', label: 'Medicine', expression: '@med' }],
      });

      const persisted = updateArgs.updates.craftingCheck;
      // Every sibling check field survives the nested write (would vanish without ...existing).
      assert.equal(persisted.simple.rollFormula, '1d20 + @craftingmod');
      assert.equal(persisted.simple.dc, 12);
      assert.equal(persisted.routed.type, 'relative');
      assert.equal(persisted.progressive.rollFormula, '2d6');
      assert.deepEqual(persisted.consumption, {
        consumeIngredientsOnFail: false,
        breakToolsOnFail: true,
      });
      // The catalogue array is REPLACED whole — 'alch' does not resurrect.
      assert.deepEqual(
        persisted.checkModifiers.map((modifier) => modifier.id),
        ['med'],
        'the whole checkModifiers array is replaced, not merged'
      );
      // A sibling modifier field not in the patch is preserved from existing.
      assert.deepEqual(persisted.defaultModifierIds, ['med', 'alch']);
    });

    it('projects toolBreakage.authority as toolSpecific when the system has none (issue 419)', async () => {
      const services = createMockServices();
      const store = createAdminStore(services);
      await store.refresh();
      const selected = get(store.viewState).selectedSystem;
      assert.deepEqual(
        selected.toolBreakage,
        { authority: 'toolSpecific' },
        'a system with no toolBreakage projects the toolSpecific default'
      );
    });

    it('publishes loading instead of a true empty state while managers are uninitialized', () => {
      let readyCallback = null;
      const services = createMockServices({
        isFabricateReady: () => false,
        onFabricateReady: (callback) => {
          readyCallback = callback;
          return () => {};
        },
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
        },
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
        },
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
        },
      });
      const store = createAdminStore(services);
      await store.refresh();

      assert.equal(get(store.viewState).recipes.length, 1);
      services._getRecipesMutable().push(
        makeRecipe({
          id: 'r-external',
          name: 'External Recipe',
          craftingSystemId: 'sys1',
        })
      );

      dataChangedCallback?.('recipes');
      await new Promise((resolve) => setTimeout(resolve, 0));

      assert.equal(get(store.viewState).recipes.length, 2);

      store.destroy();
      assert.equal(cleanupCalled, true);

      services._getRecipesMutable().push(
        makeRecipe({
          id: 'r-after-destroy',
          name: 'After Destroy',
          craftingSystemId: 'sys1',
        })
      );
      dataChangedCallback?.('recipes');
      await new Promise((resolve) => setTimeout(resolve, 0));

      assert.equal(get(store.viewState).recipes.length, 2);
    });

    it('leaves selection empty when no systems exist', async () => {
      const services = createMockServices({
        getSetting: () => '',
      });
      const originalManager = services.getCraftingSystemManager();
      services.getCraftingSystemManager = () => ({
        ...originalManager,
        getSystems: () => [],
        getSystem: () => null,
        getItems: () => [],
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
        setSetting: async (key, value) => {
          if (key === 'lastManagedCraftingSystem') persisted = value;
        },
      });
      services._getSystemsMutable().push(makeSystem({ id: 'sys2', name: 'System Two' }));
      const store = createAdminStore(services);
      await store.selectSystem('sys2');
      assert.equal(get(store.selectedSystemId), 'sys2');
      assert.equal(persisted, 'sys2');
    });

    it('selectSystem refreshes viewState with new system data', async () => {
      const services = createMockServices({
        getSetting: () => '',
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

    // A search term names a vocabulary that belongs to ONE system: "iron" is a real
    // component in the system the GM typed it into and means nothing in the next one.
    // Carrying it across a system change silently filters the new system's browser
    // down to (usually) nothing, and the GM sees an empty library, not a filter.
    //
    // The clear lives HERE and not in the views because every consumer reads the same
    // store: `itemSearch` reaches the component browser via
    // `getItems(systemId, search)` → `itemCards`, and `recipeSearch`/`graphSearch`
    // reach the recipe browser and the graph the same way. Clearing at the selection
    // covers all of them at once and survives a system change triggered from anywhere.
    it('selectSystem clears every system-scoped search filter', async () => {
      const services = createMockServices();
      services._getSystemsMutable().push(makeSystem({ id: 'sys2', name: 'System Two' }));
      const store = createAdminStore(services);
      await store.selectSystem('sys1');

      await store.setItemSearch('iron');
      await store.setRecipeSearch('potion');
      await store.setGraphSearch('ingot');

      await store.selectSystem('sys2');

      const vs = get(store.viewState);
      assert.equal(vs.itemSearchTerm, '', 'the component search must not follow the GM');
      assert.equal(vs.recipeSearchTerm, '', 'the recipe search must not follow the GM');
      assert.equal(vs.graphSearchTerm, '', 'the graph search must not follow the GM');
    });

    it('createSystem clears every system-scoped search filter', async () => {
      const services = createMockServices();
      const store = createAdminStore(services);
      await store.selectSystem('sys1');

      await store.setItemSearch('iron');
      await store.setRecipeSearch('potion');
      await store.setGraphSearch('ingot');

      await store.createSystem();

      const vs = get(store.viewState);
      assert.equal(vs.itemSearchTerm, '', 'a brand-new system starts unfiltered');
      assert.equal(vs.recipeSearchTerm, '', 'a brand-new system starts unfiltered');
      assert.equal(vs.graphSearchTerm, '', 'a brand-new system starts unfiltered');
    });

    // Re-selecting the SAME system is a refresh, not a change of vocabulary — the
    // search the GM is actively typing must survive it.
    it('re-selecting the current system keeps the search filters', async () => {
      const services = createMockServices();
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      await store.setItemSearch('iron');

      await store.selectSystem('sys1');

      assert.equal(get(store.viewState).itemSearchTerm, 'iron');
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
      assert.ok(vs.systems.some((s) => s.id === sysId));
    });

    it('createSystem generates unique name when default already exists', async () => {
      const services = createMockServices();
      // First creation will produce 'New Crafting System'
      await createAdminStore(services).createSystem();
      // Second creation
      const store2 = createAdminStore(services);
      await store2.createSystem();
      const allNames = services
        .getCraftingSystemManager()
        .getSystems()
        .map((s) => s.name);
      const newSystems = allNames.filter((n) => n.startsWith('New Crafting System'));
      assert.ok(
        newSystems.length >= 2,
        `Expected at least 2 "New Crafting System*" names, got: ${JSON.stringify(allNames)}`
      );
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
        confirmDialog: async () => {
          confirmCalled = true;
          return true;
        },
      });
      const systemManager = services.getCraftingSystemManager();
      // Add a second system so there's a fallback
      await systemManager.createSystem({ name: 'System Two', id: 'sys2' });

      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      await store.deleteSystem('sys1');

      assert.ok(confirmCalled, 'should call confirmDialog');
      const remaining = systemManager.getSystems();
      assert.ok(!remaining.some((s) => s.id === 'sys1'), 'sys1 should be deleted');
    });

    it('deleteSystem does nothing when confirm is declined', async () => {
      const services = createMockServices({
        confirmDialog: async () => false,
      });
      const store = createAdminStore(services);
      await store.deleteSystem('sys1');
      const remaining = services.getCraftingSystemManager().getSystems();
      assert.ok(
        remaining.some((s) => s.id === 'sys1'),
        'sys1 should not be deleted when declined'
      );
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
        },
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
        updateSystem: async () => {
          updateCalled = true;
        },
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
        },
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
        confirmDialog: async () => {
          confirmCalled = true;
          return true;
        },
      });
      const origManager = services.getCraftingSystemManager();
      services.getCraftingSystemManager = () => ({
        ...origManager,
        updateSystem: async (id, updates) => {
          updateArgs = { id, updates };
          await origManager.updateSystem(id, updates);
        },
      });

      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      const result = await store.setResolutionMode('routed');

      assert.equal(result, true);
      assert.equal(confirmCalled, true);
      assert.equal(updateArgs?.id, 'sys1');
      assert.equal(updateArgs?.updates?.resolutionMode, 'routed');
    });

    it('setResolutionMode leaves the system unchanged when the confirmation is declined', async () => {
      let updateCalled = false;
      const services = createMockServices({
        confirmDialog: async () => false,
      });
      const origManager = services.getCraftingSystemManager();
      services.getCraftingSystemManager = () => ({
        ...origManager,
        updateSystem: async () => {
          updateCalled = true;
        },
      });

      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      const result = await store.setResolutionMode('routed');

      assert.equal(result, false);
      assert.equal(updateCalled, false);
    });

    // Salvage mode change is non-destructive (updateSystem runs only the inline
    // _disableInvalidSalvageConfigs cleanup), so the confirm is salvage-accurate.
    // Both branches share this setup, parameterized on the confirm answer.
    async function runSalvageMode(confirmAnswer) {
      let confirmCalled = false;
      let updateArgs = null;
      const services = createMockServices({
        confirmDialog: async () => {
          confirmCalled = true;
          return confirmAnswer;
        },
      });
      const origManager = services.getCraftingSystemManager();
      services.getCraftingSystemManager = () => ({
        ...origManager,
        updateSystem: async (id, updates) => {
          updateArgs = { id, updates };
          await origManager.updateSystem(id, updates);
        },
      });
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      const result = await store.setSalvageResolutionMode('routed');
      return { store, result, confirmCalled, updateArgs: () => updateArgs };
    }

    it('setSalvageResolutionMode confirms and persists the new salvage mode', async () => {
      const { result, confirmCalled, updateArgs } = await runSalvageMode(true);
      assert.equal(result, true);
      assert.equal(confirmCalled, true);
      assert.equal(updateArgs()?.id, 'sys1');
      assert.equal(updateArgs()?.updates?.salvageResolutionMode, 'routed');
    });

    it('setSalvageResolutionMode leaves the system unchanged when the confirmation is declined', async () => {
      const { result, confirmCalled, updateArgs } = await runSalvageMode(false);
      assert.equal(result, false);
      assert.equal(confirmCalled, true);
      assert.equal(updateArgs(), null);
    });

    it('exposes setSalvageResolutionMode on the store API', () => {
      const store = createAdminStore(createMockServices());
      assert.equal(typeof store.setSalvageResolutionMode, 'function');
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
        },
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
        gathering: 'gathering',
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
          },
        });
        const store = createAdminStore(services);
        await store.selectSystem('sys1');
        await store.toggleFeature(featureName, true);
        assert.ok(updateArgs, `updateSystem should be called for feature: ${featureName}`);
        assert.ok(
          expectedKey in updateArgs.updates.features,
          `Expected key "${expectedKey}" in features update for "${featureName}"`
        );
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
        },
      });
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      await store.toggleRequirement('currency', true);
      assert.ok(updateArgs, 'updateSystem should be called');
      assert.equal(updateArgs.updates.requirements.currency.enabled, true);
      assert.deepEqual(updateArgs.updates.requirements.currency.units, []);
      assert.equal(
        'provider' in updateArgs.updates.requirements.currency,
        false,
        'should not emit provider field'
      );
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
        },
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
        updateSystem: async () => {
          updateCalled = true;
        },
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
        },
      });
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      await store.addCategory('Weapons');
      await store.addCategory('Weapons'); // duplicate
      assert.ok(savedCategories !== null);
      assert.equal(savedCategories.filter((c) => c === 'Weapons').length, 1);
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
        },
      });
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      await store.removeCategory('Potions');
      assert.ok(savedCategories !== null);
      assert.ok(!savedCategories.includes('Potions'));
      assert.ok(savedCategories.includes('Weapons'));
    });

    // ── The COMPONENT category vocabulary (issue 676) ──────────────────────────
    // A sibling of the recipe handlers above, mirroring their coverage. The write path
    // had none, and the root calls these optional-chained (`store.addComponentCategory?.()`)
    // — so deleting the store export no-ops silently and ships green.

    function trackComponentCategoryWrites(seed = null) {
      const services = createMockServices();
      const origManager = services.getCraftingSystemManager();
      if (seed) {
        const sys = origManager.getSystem('sys1');
        if (sys) sys.componentCategories = seed;
      }
      const saved = { componentCategories: null, categories: null, updateCalled: false };
      services.getCraftingSystemManager = () => ({
        ...origManager,
        updateSystem: async (id, updates) => {
          saved.updateCalled = true;
          if (updates.componentCategories) saved.componentCategories = updates.componentCategories;
          if (updates.categories) saved.categories = updates.categories;
          await origManager.updateSystem(id, updates);
        },
      });
      return { services, saved };
    }

    it('addComponentCategory appends to componentCategories and deduplicates', async () => {
      const { services, saved } = trackComponentCategoryWrites();
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      await store.addComponentCategory('Reagent');
      await store.addComponentCategory('Reagent'); // duplicate
      assert.ok(saved.componentCategories !== null, 'the write reaches updateSystem');
      assert.equal(saved.componentCategories.filter((c) => c === 'Reagent').length, 1);
      // Written TOP-LEVEL and alone — never folded into the recipe vocabulary.
      assert.equal(saved.categories, null, 'the recipe categories are never touched');
    });

    it('removeComponentCategory filters out the category', async () => {
      const { services, saved } = trackComponentCategoryWrites(['Reagent', 'Metal']);
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      await store.removeComponentCategory('Reagent');
      assert.ok(saved.componentCategories !== null);
      assert.ok(!saved.componentCategories.includes('Reagent'));
      assert.ok(saved.componentCategories.includes('Metal'));
    });

    it('addComponentCategory does nothing with an empty string', async () => {
      const { services, saved } = trackComponentCategoryWrites();
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      await store.addComponentCategory('');
      await store.addComponentCategory('   ');
      assert.ok(!saved.updateCalled, 'updateSystem should not be called for a blank category');
    });

    it('the reserved general bucket can be neither added nor removed', async () => {
      // `general` is implied, never persisted in the array. The guard is what stops a
      // GM authoring a duplicate "General" entry, or deleting the catch-all.
      const { services, saved } = trackComponentCategoryWrites(['Reagent']);
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      for (const reserved of ['general', 'General', ' GENERAL ']) {
        await store.addComponentCategory(reserved);
        await store.removeComponentCategory(reserved);
      }
      assert.ok(!saved.updateCalled, 'the reserved bucket never reaches updateSystem');
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
        },
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
        updateSystem: async () => {
          updateCalled = true;
        },
      });
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      await store.addCategory('General');
      assert.ok(
        !updateCalled,
        'updateSystem should not be called for the reserved General category'
      );
    });

    it('removeCategory does nothing for the reserved general category', async () => {
      let updateCalled = false;
      const services = createMockServices();
      const origManager = services.getCraftingSystemManager();
      services.getCraftingSystemManager = () => ({
        ...origManager,
        updateSystem: async () => {
          updateCalled = true;
        },
      });
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      await store.removeCategory('general');
      assert.ok(
        !updateCalled,
        'updateSystem should not be called for the reserved General category'
      );
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
        },
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
        },
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
        },
      });
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      await store.addTag('fire');
      assert.ok(savedTags !== null);
      assert.equal(savedTags.filter((t) => t === 'fire').length, 1);
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
        },
      });
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      await store.addEssence('Fire', 'Burning essence', 'fas fa-fire', null);
      assert.ok(savedEssences !== null);
      assert.ok(savedEssences.some((e) => e.name === 'Fire'));
      const newEssence = savedEssences.find((e) => e.name === 'Fire');
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
        },
      });
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      await store.addEssence('Water', 'Flowing essence', '', null);

      const newEssence = savedEssences?.find((e) => e.name === 'Water');
      assert.ok(newEssence, 'new essence should be persisted');
      assert.equal(newEssence.icon, DEFAULT_ESSENCE_ICON);
    });

    it('addEssence persists the selected component id and resolved source item UUID', async () => {
      let savedEssences = null;
      const services = createMockServices();
      const origManager = services.getCraftingSystemManager();
      const sys = origManager.getSystem('sys1');
      if (sys) {
        sys.components = [
          makeItem({
            id: 'comp-1',
            name: 'Sunleaf',
            img: 'sunleaf.png',
            originItemUuid: 'Compendium.fabricate.items.sunleaf',
          }),
        ];
      }
      services.getCraftingSystemManager = () => ({
        ...origManager,
        updateSystem: async (id, updates) => {
          if (updates.essenceDefinitions) savedEssences = updates.essenceDefinitions;
          await origManager.updateSystem(id, updates);
        },
      });
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      await store.addEssence('Radiance', 'Bright essence', 'fas fa-sun', 'comp-1');

      const newEssence = savedEssences?.find((e) => e.name === 'Radiance');
      assert.ok(newEssence, 'new essence should be persisted');
      assert.equal(newEssence.sourceComponentId, 'comp-1');
      assert.equal(newEssence.sourceItemUuid, 'Compendium.fabricate.items.sunleaf');
      assert.equal(newEssence.associatedSystemItemId, 'comp-1');
    });

    it('issue 560 (asymmetric): a NEW-name-only component resolves the essence source link, while the essence keeps its OWN sourceItemUuid', async () => {
      // Post-migration data: the linked component carries ONLY the renamed
      // registeredItemUuid/originItemUuid (no legacy sourceUuid/sourceItemUuid). The
      // essence source resolution must read the component's NEW field names, while the
      // essence definition's OWN output key stays `sourceItemUuid` (out of scope, kept).
      let savedEssences = null;
      const services = createMockServices();
      const origManager = services.getCraftingSystemManager();
      const sys = origManager.getSystem('sys1');
      if (sys) {
        sys.components = [
          makeItem({
            id: 'comp-1',
            name: 'Sunleaf',
            img: 'sunleaf.png',
            registeredItemUuid: 'Item.sunleaf-live',
            originItemUuid: 'Compendium.fabricate.items.sunleaf',
          }),
        ];
        // Prove there are NO legacy keys on the component projection.
        assert.ok(!('sourceUuid' in sys.components[0]));
        assert.ok(!('sourceItemUuid' in sys.components[0]));
      }
      services.getCraftingSystemManager = () => ({
        ...origManager,
        updateSystem: async (id, updates) => {
          if (updates.essenceDefinitions) savedEssences = updates.essenceDefinitions;
          await origManager.updateSystem(id, updates);
        },
      });
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      await store.addEssence('Radiance', 'Bright essence', 'fas fa-sun', 'comp-1');

      const newEssence = savedEssences?.find((e) => e.name === 'Radiance');
      assert.ok(newEssence, 'new essence should be persisted');
      // The essence resolved its source through the component's NEW field name.
      assert.equal(newEssence.sourceComponentId, 'comp-1');
      // The essence's OWN output key stays `sourceItemUuid` (kept).
      assert.equal(newEssence.sourceItemUuid, 'Compendium.fabricate.items.sunleaf');
      assert.ok(!('originItemUuid' in newEssence));
    });

    it('addEssence rejects duplicate name', async () => {
      let warnMsg = null;
      const services = createMockServices({
        notify: {
          info: () => {},
          warn: (m) => {
            warnMsg = m;
          },
          error: () => {},
        },
      });
      const origManager = services.getCraftingSystemManager();
      const sys = origManager.getSystem('sys1');
      if (sys) {
        sys.essenceDefinitions = [
          { id: 'ess1', name: 'Fire', description: '', icon: '', sourceItemUuid: null },
        ];
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
        },
      });
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      await store.addEssence('', '', '', null);
      assert.ok(!updateCalled, 'updateSystem should not be called for empty name');
    });

    it('removeEssence shows confirm before deleting', async () => {
      let confirmCalled = false;
      const services = createMockServices({
        confirmDialog: async () => {
          confirmCalled = true;
          return true;
        },
      });
      const manager = services.getCraftingSystemManager();
      const sys = manager.getSystem('sys1');
      if (sys)
        sys.essenceDefinitions = [
          { id: 'ess1', name: 'Fire', description: '', icon: '', sourceItemUuid: null },
        ];
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      await store.removeEssence('ess1');
      assert.ok(confirmCalled, 'should call confirmDialog');
      assert.ok(!manager.getSystem('sys1').essenceDefinitions.some((e) => e.id === 'ess1'));
    });

    it('removeEssence does nothing when confirm declined', async () => {
      const services = createMockServices({ confirmDialog: async () => false });
      const manager = services.getCraftingSystemManager();
      const sys = manager.getSystem('sys1');
      if (sys)
        sys.essenceDefinitions = [
          { id: 'ess1', name: 'Fire', description: '', icon: '', sourceItemUuid: null },
        ];
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      await store.removeEssence('ess1');
      assert.ok(
        manager.getSystem('sys1').essenceDefinitions.some((e) => e.id === 'ess1'),
        'should not delete when declined'
      );
    });

    it('removeEssence delegates to systemManager.deleteEssence', async () => {
      const services = createMockServices();
      const manager = services.getCraftingSystemManager();
      const sys = manager.getSystem('sys1');
      if (sys) {
        sys.essenceDefinitions = [
          { id: 'ess1', name: 'Fire', description: '', icon: '', sourceItemUuid: null },
          { id: 'ess2', name: 'Ice', description: '', icon: '', sourceItemUuid: null },
        ];
      }
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      await store.removeEssence('ess1');
      const remaining = manager.getSystem('sys1').essenceDefinitions;
      assert.ok(!remaining.some((e) => e.id === 'ess1'));
      assert.ok(remaining.some((e) => e.id === 'ess2'));
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
            associatedSystemItemId: 'item-1',
          },
        ];
      }
      services.getCraftingSystemManager = () => ({
        ...origManager,
        updateSystem: async (id, updates) => {
          if (updates.essenceDefinitions) savedEssences = updates.essenceDefinitions;
          await origManager.updateSystem(id, updates);
        },
      });

      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      await store.updateEssence('ess1', {
        name: 'Volatile',
        description: 'Explosive energy',
        icon: 'fas fa-bolt',
      });

      assert.equal(savedEssences?.length, 1);
      assert.deepEqual(savedEssences?.[0], {
        id: 'ess1',
        name: 'Volatile',
        description: 'Explosive energy',
        icon: 'fas fa-bolt',
        sourceItemUuid: 'item-1',
        associatedSystemItemId: 'item-1',
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
            associatedSystemItemId: 'legacy-component',
          },
        ];
      }
      services.getCraftingSystemManager = () => ({
        ...origManager,
        updateSystem: async (id, updates) => {
          if (updates.essenceDefinitions) savedEssences = updates.essenceDefinitions;
          await origManager.updateSystem(id, updates);
        },
      });

      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      await store.updateEssence('ess1', {
        name: 'Ember',
        description: 'Warmth',
        icon: 'fas fa-fire-flame-curved',
      });

      assert.deepEqual(savedEssences?.[0], {
        id: 'ess1',
        name: 'Ember',
        description: 'Warmth',
        icon: 'fas fa-fire-flame-curved',
        sourceItemUuid: 'Compendium.fabricate.items.fire-core',
        associatedSystemItemId: 'legacy-component',
      });
    });

    it('updateEssence rewrites source fields only when sourceComponentId is provided', async () => {
      let savedEssences = null;
      const services = createMockServices();
      const origManager = services.getCraftingSystemManager();
      const sys = origManager.getSystem('sys1');
      if (sys) {
        sys.components = [
          makeItem({
            id: 'new-component',
            name: 'New Component',
            originItemUuid: 'Compendium.fabricate.items.new-component',
          }),
        ];
        sys.essenceDefinitions = [
          {
            id: 'ess1',
            name: 'Fire',
            description: 'Burning essence',
            icon: 'fas fa-fire',
            sourceItemUuid: 'old-component',
            associatedSystemItemId: 'old-component',
          },
        ];
      }
      services.getCraftingSystemManager = () => ({
        ...origManager,
        updateSystem: async (id, updates) => {
          if (updates.essenceDefinitions) savedEssences = updates.essenceDefinitions;
          await origManager.updateSystem(id, updates);
        },
      });

      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      await store.updateEssence('ess1', {
        name: 'Fire',
        sourceComponentId: 'new-component',
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
            associatedSystemItemId: null,
          },
        ];
      }
      services.getCraftingSystemManager = () => ({
        ...origManager,
        updateSystem: async (id, updates) => {
          if (updates.essenceDefinitions) savedEssences = updates.essenceDefinitions;
          await origManager.updateSystem(id, updates);
        },
      });

      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      await store.updateEssence('ess1', {
        name: 'Ember',
      });

      assert.equal(savedEssences?.[0].sourceItemUuid, 'Compendium.fabricate.items.stale-fire');
      await store.updateEssence('ess1', {
        name: 'Ember',
        sourceComponentId: null,
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
          warn: (message) => {
            warnMsg = message;
          },
          error: () => {},
        },
      });
      const origManager = services.getCraftingSystemManager();
      const sys = origManager.getSystem('sys1');
      if (sys) {
        sys.essenceDefinitions = [
          { id: 'ess1', name: 'Fire', description: '', icon: 'fas fa-fire', sourceItemUuid: null },
          { id: 'ess2', name: 'Water', description: '', icon: 'fas fa-tint', sourceItemUuid: null },
        ];
      }
      services.getCraftingSystemManager = () => ({
        ...origManager,
        updateSystem: async () => {
          updateCalled = true;
        },
      });

      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      const didSave = await store.updateEssence('ess2', {
        name: 'Fire',
        description: 'Duplicate',
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
        },
      });
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      await store.addEssence('Fire', 'Burning', 'fas fa-fire', null);
      assert.ok(lastSavedEssences !== null);
      const addedEssence = lastSavedEssences.find((e) => e.name === 'Fire');
      assert.ok(addedEssence, 'essence should exist after add');
      assert.ok(addedEssence.id, 'essence should have an id');
      await store.removeEssence(addedEssence.id);
      const remaining = origManager.getSystem('sys1').essenceDefinitions;
      assert.ok(
        !remaining.some((e) => e.id === addedEssence.id),
        'essence should be removed after removeEssence'
      );
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
        confirmDialog: async () => {
          confirmCalled = true;
          return true;
        },
      });
      const origManager = services.getRecipeManager();
      services.getRecipeManager = () => ({
        ...origManager,
        deleteRecipe: async (id) => {
          deletedId = id;
          await origManager.deleteRecipe(id);
        },
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
        confirmDialog: async () => false,
      });
      const origManager = services.getRecipeManager();
      services.getRecipeManager = () => ({
        ...origManager,
        deleteRecipe: async (id) => {
          deletedId = id;
        },
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
        createRecipe: async (data) => {
          createdData = data;
          return origManager.createRecipe(data);
        },
      });
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      await store.duplicateRecipe('r1');
      assert.ok(createdData !== null);
      assert.ok(
        createdData.name.includes('(Copy)'),
        `Expected "(Copy)" in name: ${createdData.name}`
      );
      assert.ok(!createdData.id, 'duplicated recipe should not have an id');
    });

    it('toggleRecipeEnabled calls recipeManager.updateRecipe', async () => {
      let updateArgs = null;
      const services = createMockServices();
      const origManager = services.getRecipeManager();
      services.getRecipeManager = () => ({
        ...origManager,
        updateRecipe: async (id, updates) => {
          updateArgs = { id, updates };
          await origManager.updateRecipe(id, updates);
        },
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
        copyToClipboard: async (text) => {
          clipboardContent = text;
        },
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
        renderImportDialog: async (sysId) => {
          importSystemId = sysId;
        },
      });
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      await store.importRecipes();
      assert.equal(
        importSystemId,
        'sys1',
        'renderImportDialog should be called with the selected system id'
      );
    });

    it('updateRecipe persists updates, refreshes, and returns true', async () => {
      let updateArgs = null;
      let refreshed = false;
      const services = createMockServices();
      const origManager = services.getRecipeManager();
      services.getRecipeManager = () => ({
        ...origManager,
        updateRecipe: async (id, updates) => {
          updateArgs = { id, updates };
          await origManager.updateRecipe(id, updates);
        },
        getRecipes: (filter) => {
          refreshed = true;
          return origManager.getRecipes(filter);
        },
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
        notify: { info: () => {}, warn: () => {}, error: (msg) => errors.push(msg) },
      });
      const origManager = services.getRecipeManager();
      services.getRecipeManager = () => ({
        ...origManager,
        updateRecipe: async () => {
          throw new Error('recipe boom');
        },
      });
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      const result = await store.updateRecipe('r1', { name: 'Renamed' });
      assert.equal(result, false);
      assert.deepEqual(errors, ['recipe boom']);
    });

    it('confirmRecipeAction resolves true/false from services.confirmDialog (no persistence)', async () => {
      let captured = null;
      const services = createMockServices({
        confirmDialog: async (opts) => {
          captured = opts;
          return true;
        },
      });
      const store = createAdminStore(services);
      const yes = await store.confirmRecipeAction({
        title: 'Delete step?',
        content: '<p>Remove it?</p>',
      });
      assert.equal(yes, true, 'returns true when the user confirms');
      assert.equal(captured.title, 'Delete step?', 'forwards the title');
      assert.equal(captured.content, '<p>Remove it?</p>', 'forwards the content');

      const noServices = createMockServices({ confirmDialog: async () => false });
      const noStore = createAdminStore(noServices);
      const no = await noStore.confirmRecipeAction({ title: 't', content: 'c' });
      assert.equal(no, false, 'returns false when the user declines');
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
        },
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
        },
      });
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      await store.updateRecipe('r1', { name: 'Renamed Shell' });
      assert.equal(updateOptions?.allowIncomplete, true, 'editor save must allow incomplete');
    });

    it('updateRecipe forwards notify:false for quiet step edits and defaults to notify:true', async () => {
      const optionsSeen = [];
      const services = createMockServices();
      const origManager = services.getRecipeManager();
      services.getRecipeManager = () => ({
        ...origManager,
        updateRecipe: async (id, updates, options) => {
          optionsSeen.push(options);
          await origManager.updateRecipe(id, updates, options);
        },
      });
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      await store.updateRecipe('r1', { name: 'Loud' });
      await store.updateRecipe('r1', { steps: [] }, { notify: false });
      assert.equal(optionsSeen[0]?.notify, true, 'a normal save notifies');
      assert.equal(optionsSeen[1]?.notify, false, 'a quiet step save suppresses the toast');
    });

    it('viewState.recipes entries carry raw steps and top-level authoring data for the editor', async () => {
      const services = createMockServices();
      const origManager = services.getRecipeManager();
      const recipe = makeRecipe({
        id: 'r-steps',
        name: 'Authored',
        craftingSystemId: 'sys1',
        toJSON: () => ({
          id: 'r-steps',
          name: 'Authored',
          craftingSystemId: 'sys1',
          steps: [{ id: 'sa', name: 'Step 1', description: 'first' }],
          ingredientSets: [{ id: 'iset' }],
          resultGroups: [{ id: 'rg' }],
          toolIds: ['t1'],
        }),
      });
      services.getRecipeManager = () => ({
        ...origManager,
        getRecipes: (filter) =>
          [recipe].filter(
            (r) => !filter?.craftingSystemId || r.craftingSystemId === filter.craftingSystemId
          ),
      });
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      const projected = get(store.viewState).recipes.find((r) => r.id === 'r-steps');
      assert.ok(projected, 'recipe should be projected');
      assert.equal(projected.steps.length, 1, 'raw steps survive projection');
      assert.equal(projected.steps[0].name, 'Step 1', 'step data is intact');
      assert.deepEqual(projected.toolIds, ['t1'], 'top-level toolIds projected for migration');
      assert.equal(projected.ingredientSets.length, 1, 'top-level ingredientSets projected');
      assert.equal(projected.resultGroups.length, 1, 'top-level resultGroups projected');
    });

    it('viewState.recipes projects the per-recipe craftingModifier override for the editor (issue 770 allowlist)', async () => {
      // The recipe list projection is a hand-built ALLOWLIST. Omitting craftingModifier
      // makes the Overview override control seed from `undefined` → render "Inherit
      // system default" → and (since the editor saves the whole draft) silently write the
      // override back to null. Read the ACTUAL projection, not a prop-fed tab.
      const services = createMockServices();
      const origManager = services.getRecipeManager();
      const recipe = makeRecipe({
        id: 'r-mod',
        name: 'Brew Healing Potion',
        craftingSystemId: 'sys1',
        toJSON: () => ({
          id: 'r-mod',
          name: 'Brew Healing Potion',
          craftingSystemId: 'sys1',
          craftingModifier: { policy: 'byRecipe', modifierIds: ['alch'] },
        }),
      });
      services.getRecipeManager = () => ({
        ...origManager,
        getRecipes: (filter) =>
          [recipe].filter(
            (r) => !filter?.craftingSystemId || r.craftingSystemId === filter.craftingSystemId
          ),
      });
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      const projected = get(store.viewState).recipes.find((r) => r.id === 'r-mod');
      assert.ok(projected, 'recipe should be projected');
      assert.deepEqual(
        projected.craftingModifier,
        { policy: 'byRecipe', modifierIds: ['alch'] },
        'the override surfaces so the editor renders OVERRIDE, not inherit'
      );
    });

    it('viewState.recipes projects a null craftingModifier when the recipe inherits (issue 770)', async () => {
      const services = createMockServices();
      const origManager = services.getRecipeManager();
      const recipe = makeRecipe({
        id: 'r-inherit',
        craftingSystemId: 'sys1',
        toJSON: () => ({ id: 'r-inherit', name: 'Inheritor', craftingSystemId: 'sys1' }),
      });
      services.getRecipeManager = () => ({
        ...origManager,
        getRecipes: () => [recipe],
      });
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      const projected = get(store.viewState).recipes.find((r) => r.id === 'r-inherit');
      assert.equal(projected.craftingModifier, null, 'no override projects as null (inherit)');
    });

    it('updateRecipe threads a craftingModifier override through the save path (issue 770 round-trip)', async () => {
      // The editor saves the whole draft (seeded from the projection above). Assert the
      // store save path forwards craftingModifier to the recipe manager so an authored
      // override survives save → reload rather than being dropped en route.
      let updateArgs = null;
      const services = createMockServices();
      const origManager = services.getRecipeManager();
      services.getRecipeManager = () => ({
        ...origManager,
        updateRecipe: async (id, updates, options) => {
          updateArgs = { id, updates, options };
          return origManager.updateRecipe(id, updates, options);
        },
      });
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      const ok = await store.updateRecipe('r1', {
        name: 'Renamed',
        craftingModifier: { policy: 'highest', modifierIds: ['med'] },
      });
      assert.equal(ok, true);
      assert.deepEqual(
        updateArgs.updates.craftingModifier,
        { policy: 'highest', modifierIds: ['med'] },
        'the override is threaded to recipeManager.updateRecipe, not stripped'
      );
    });

    it('addRecipeItemFromUuid passes through the manager result', async () => {
      const passthrough = { item: { id: 'item-x' }, action: 'created' };
      const services = createMockServices();
      const origManager = services.getCraftingSystemManager();
      services.getCraftingSystemManager = () => ({
        ...origManager,
        addRecipeItemFromUuid: async () => passthrough,
      });
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      const result = await store.addRecipeItemFromUuid('sys1', 'Item.abc');
      assert.deepEqual(result, passthrough);
    });

    it('addRecipeItemFromUuid returns false and notifies when the manager rejects', async () => {
      const errors = [];
      const services = createMockServices({
        notify: { info: () => {}, warn: () => {}, error: (msg) => errors.push(msg) },
      });
      const origManager = services.getCraftingSystemManager();
      services.getCraftingSystemManager = () => ({
        ...origManager,
        addRecipeItemFromUuid: async () => {
          throw new Error('link boom');
        },
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
        },
      });
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      await store.exportSystem();
      assert.ok(downloadedJson !== null, 'downloadFile should be called');
      assert.ok(
        downloadedFilename.startsWith('fabricate-'),
        'filename should start with fabricate-'
      );
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
        downloadFile: async (json) => {
          downloadedJson = json;
        },
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
        notify: {
          info: () => {},
          warn: (m) => {
            warnMsg = m;
          },
          error: () => {},
        },
        downloadFile: async () => {
          downloadCalled = true;
        },
      });
      const origManager = services.getCraftingSystemManager();
      services.getCraftingSystemManager = () => ({
        ...origManager,
        getSystems: () => [],
        getSystem: () => null,
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
        downloadFile: async (json) => {
          downloadedJson = json;
        },
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
        renderSystemImportDialog: async () => {
          dialogCalled = true;
        },
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
        confirmDialog: async () => {
          confirmCalled = true;
          return true;
        },
      });
      const origManager = services.getCraftingSystemManager();
      const sys = origManager.getSystem('sys1');
      if (sys) sys.items = [makeItem({ id: 'item1', name: 'Herb' })];
      services.getCraftingSystemManager = () => ({
        ...origManager,
        deleteItem: async (sysId, itemId) => {
          deletedArgs = { sysId, itemId };
          await origManager.deleteItem(sysId, itemId);
        },
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
        confirmDialog: async () => false,
      });
      const origManager = services.getCraftingSystemManager();
      const sys = origManager.getSystem('sys1');
      if (sys) sys.items = [makeItem({ id: 'item1', name: 'Herb' })];
      services.getCraftingSystemManager = () => ({
        ...origManager,
        deleteItem: async (sysId, itemId) => {
          deletedArgs = { sysId, itemId };
        },
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
        deleteItem: async (sysId, itemId) => {
          deletedArgs = { sysId, itemId };
        },
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
        updateItem: async (sysId, itemId, updates) => {
          updateArgs = { sysId, itemId, updates };
        },
      });
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      const result = await store.updateComponent('item1', {
        tags: ['herb'],
        essences: { earth: 2 },
      });
      assert.equal(result, true);
      assert.deepEqual(updateArgs, {
        sysId: 'sys1',
        itemId: 'item1',
        updates: { tags: ['herb'], essences: { earth: 2 } },
      });
    });

    it('updateComponent returns false when systemManager.updateItem rejects', async () => {
      const errors = [];
      const services = createMockServices({
        notify: { info: () => {}, warn: () => {}, error: (msg) => errors.push(msg) },
      });
      const origManager = services.getCraftingSystemManager();
      services.getCraftingSystemManager = () => ({
        ...origManager,
        updateItem: async () => {
          throw new Error('boom');
        },
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
        updateItem: async () => {
          updateCalled = true;
        },
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
            makeRecipe({ id: 'r2', name: 'Fire Sword', craftingSystemId: 'sys1' }),
          ].filter(
            (r) => !filter?.craftingSystemId || r.craftingSystemId === filter.craftingSystemId
          );
        },
      });
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      await store.setRecipeSearch('healing');
      const vs = get(store.viewState);
      assert.ok(vs.recipes.every((r) => r.name.toLowerCase().includes('healing')));
      assert.ok(!vs.recipes.some((r) => r.id === 'r2'));
    });

    it('setItemSearch filters viewState item cards', async () => {
      const services = createMockServices();
      const origManager = services.getCraftingSystemManager();
      const sys = origManager.getSystem('sys1');
      if (sys) {
        sys.items = [
          makeItem({ id: 'item1', name: 'Iron Ore' }),
          makeItem({ id: 'item2', name: 'Gold Nugget' }),
        ];
      }
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      await store.setItemSearch('iron');
      const vs = get(store.viewState);
      assert.ok(vs.itemCards.every((i) => i.name.toLowerCase().includes('iron')));
      assert.ok(!vs.itemCards.some((i) => i.id === 'item2'));
    });
  });

  // -------------------------------------------------------------------------
  // 12. Config save actions
  // -------------------------------------------------------------------------

  describe('config save actions', () => {
    it('saveCraftingCheckRouted persists the routed config and preserves other check fields', async () => {
      let updateArgs = null;
      const services = createMockServices();
      const origManager = services.getCraftingSystemManager();
      const sys = origManager.getSystem('sys1');
      if (sys) {
        sys.craftingCheck = { enabled: true, mode: 'passFail', outcomes: ['fail', 'pass'] };
      }
      services.getCraftingSystemManager = () => ({
        ...origManager,
        updateSystem: async (id, updates) => {
          updateArgs = { id, updates };
          await origManager.updateSystem(id, updates);
        },
      });
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      const routed = {
        type: 'relative',
        rollExpression: '1d20+@attributes.con.mod',
        relativeOutcomes: [{ id: 'o1', name: 'Botch', success: false, breakTools: true, dc: -5 }],
        fixedOutcomes: [],
      };
      await store.saveCraftingCheckRouted(routed);
      assert.ok(updateArgs !== null);
      assert.deepEqual(updateArgs.updates.craftingCheck.routed, routed);
      // existing canonical fields are not lost
      assert.deepEqual(updateArgs.updates.craftingCheck.outcomes, ['fail', 'pass']);
      assert.equal(updateArgs.updates.craftingCheck.mode, 'passFail');
    });

    it('saveCraftingCheckRouted strips deleted tier ids from recipe result groups and notifies', async () => {
      const infoMessages = [];
      const services = createMockServices({
        notify: { info: (m) => infoMessages.push(m), warn: () => {}, error: () => {} },
      });
      const origManager = services.getCraftingSystemManager();
      const sys = origManager.getSystem('sys1');
      sys.craftingCheck = { enabled: true, mode: 'passFail', outcomes: [] };

      // A recipe carrying a stale routed tier id ('t-deleted') alongside a surviving
      // one ('t-good'), at both the recipe level and inside a step.
      const recipeUpdates = [];
      const recipeManager = services.getRecipeManager();
      const recipeData = {
        id: 'r-routed',
        name: 'Routed Recipe',
        craftingSystemId: 'sys1',
        resultGroups: [
          { id: 'g-good', name: 'Good', checkOutcomeIds: ['t-good'] },
          { id: 'g-stale', name: 'Stale', checkOutcomeIds: ['t-good', 't-deleted'] },
        ],
        steps: [
          {
            id: 'step-1',
            resultGroups: [{ id: 'sg-stale', name: 'StepStale', checkOutcomeIds: ['t-deleted'] }],
          },
        ],
      };
      services._getRecipesMutable().push(
        makeRecipe({
          ...recipeData,
          toJSON: () => recipeData,
        })
      );
      const origUpdateRecipe = recipeManager.updateRecipe;
      recipeManager.updateRecipe = async (id, updates, options) => {
        recipeUpdates.push({ id, updates, options });
        return origUpdateRecipe(id, updates, options);
      };

      const store = createAdminStore(services);
      await store.selectSystem('sys1');

      // The saved routed config keeps only 't-good' — 't-deleted' is gone.
      await store.saveCraftingCheckRouted({
        type: 'relative',
        rollExpression: '1d20',
        relativeOutcomes: [{ id: 't-good', name: 'Good', success: true, breakTools: false, dc: 0 }],
        fixedOutcomes: [],
      });

      assert.equal(recipeUpdates.length, 1, 'the affected recipe is persisted once');
      const persisted = recipeUpdates[0];
      assert.equal(persisted.id, 'r-routed');
      assert.equal(persisted.options.notify, false, 'batch update suppresses per-recipe toast');
      assert.deepEqual(persisted.updates.resultGroups[0].checkOutcomeIds, ['t-good']);
      assert.deepEqual(
        persisted.updates.resultGroups[1].checkOutcomeIds,
        ['t-good'],
        'the deleted id is stripped, the surviving id stays'
      );
      assert.deepEqual(persisted.updates.steps[0].resultGroups[0].checkOutcomeIds, []);
      // Two result groups (one recipe-level, one step-level) carried the deleted id.
      assert.ok(
        infoMessages.some((m) => m.includes('2 recipe result group')),
        `expected a "2 recipe result group(s)" notification, got: ${JSON.stringify(infoMessages)}`
      );
    });

    it('saveCraftingCheckRouted does not notify or persist when no recipe references a deleted tier', async () => {
      const infoMessages = [];
      const services = createMockServices({
        notify: { info: (m) => infoMessages.push(m), warn: () => {}, error: () => {} },
      });
      const recipeManager = services.getRecipeManager();
      const recipeData = {
        id: 'r-clean',
        name: 'Clean Recipe',
        craftingSystemId: 'sys1',
        resultGroups: [{ id: 'g-good', name: 'Good', checkOutcomeIds: ['t-good'] }],
        steps: [],
      };
      services._getRecipesMutable().push(
        makeRecipe({ ...recipeData, toJSON: () => recipeData })
      );
      let updateCount = 0;
      const origUpdateRecipe = recipeManager.updateRecipe;
      recipeManager.updateRecipe = async (id, updates, options) => {
        updateCount += 1;
        return origUpdateRecipe(id, updates, options);
      };

      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      await store.saveCraftingCheckRouted({
        type: 'relative',
        rollExpression: '1d20',
        relativeOutcomes: [{ id: 't-good', name: 'Good', success: true, breakTools: false, dc: 0 }],
        fixedOutcomes: [],
      });

      assert.equal(updateCount, 0, 'no recipe is rewritten when nothing is stale');
      assert.equal(
        infoMessages.some((m) => m.includes('recipe result group')),
        false,
        'no cleanup notification when nothing changed'
      );
    });

    it('saveCraftingCheckSimple persists the simple config and preserves other check fields', async () => {
      let updateArgs = null;
      const services = createMockServices();
      const origManager = services.getCraftingSystemManager();
      const sys = origManager.getSystem('sys1');
      if (sys) {
        sys.craftingCheck = { enabled: true, mode: 'passFail', outcomes: ['fail', 'pass'] };
      }
      services.getCraftingSystemManager = () => ({
        ...origManager,
        updateSystem: async (id, updates) => {
          updateArgs = { id, updates };
          await origManager.updateSystem(id, updates);
        },
      });
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      const simple = {
        rollFormula: '1d20',
        dc: 12,
        thresholdMode: 'meet',
        dcMode: 'static',
        tiers: [{ id: 't1', name: 'Hard', dc: 18 }],
        macroUuid: null,
        diceCrits: [{ id: 'cr1', die: '1d20', raw: 20, success: true, breakTools: false }],
      };
      await store.saveCraftingCheckSimple(simple);
      assert.ok(updateArgs !== null);
      assert.deepEqual(updateArgs.updates.craftingCheck.simple, simple);
      assert.deepEqual(updateArgs.updates.craftingCheck.outcomes, ['fail', 'pass']);
    });

    it('surfaces the simple crafting check config in the selected-system view state', async () => {
      const services = createMockServices();
      const manager = services.getCraftingSystemManager();
      const sys = manager.getSystem('sys1');
      if (sys) {
        sys.craftingCheck = {
          enabled: true,
          simple: {
            rollFormula: '1d20',
            dc: 14,
            thresholdMode: 'meet',
            dcMode: 'static',
            tiers: [{ id: 't1', name: 'Hard', dc: 18 }],
            macroUuid: null,
          },
        };
      }
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      const vs = get(store.viewState);
      assert.ok(
        vs.selectedSystem.craftingCheck.simple,
        'simple config is projected into view state'
      );
      assert.equal(vs.selectedSystem.craftingCheck.simple.dc, 14);
      assert.equal(vs.selectedSystem.craftingCheck.simple.tiers[0].name, 'Hard');
    });

    it('surfaces the routed crafting check config in the selected-system view state', async () => {
      const services = createMockServices();
      const manager = services.getCraftingSystemManager();
      const sys = manager.getSystem('sys1');
      if (sys) {
        sys.craftingCheck = {
          enabled: true,
          routed: {
            type: 'fixed',
            rollExpression: '1d20',
            relativeOutcomes: [],
            fixedOutcomes: [
              { id: 'o1', name: 'Hit', success: true, breakTools: false, start: 1, end: 20 },
            ],
          },
        };
      }
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      const vs = get(store.viewState);
      assert.ok(
        vs.selectedSystem.craftingCheck.routed,
        'routed config is projected into view state'
      );
      assert.equal(vs.selectedSystem.craftingCheck.routed.rollExpression, '1d20');
      assert.equal(vs.selectedSystem.craftingCheck.routed.fixedOutcomes[0].name, 'Hit');
    });

    it('saveCraftingCheckActive toggles enabled and preserves the rest of the check', async () => {
      let updateArgs = null;
      const services = createMockServices();
      const origManager = services.getCraftingSystemManager();
      const sys = origManager.getSystem('sys1');
      if (sys) {
        sys.craftingCheck = {
          enabled: false,
          mode: 'passFail',
          outcomes: ['fail', 'pass'],
          routed: {
            type: 'relative',
            rollExpression: '1d20',
            relativeOutcomes: [],
            fixedOutcomes: [],
          },
        };
      }
      services.getCraftingSystemManager = () => ({
        ...origManager,
        updateSystem: async (id, updates) => {
          updateArgs = { id, updates };
          await origManager.updateSystem(id, updates);
        },
      });
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      await store.saveCraftingCheckActive(true);
      assert.equal(updateArgs.updates.craftingCheck.enabled, true);
      assert.deepEqual(updateArgs.updates.craftingCheck.outcomes, ['fail', 'pass']);
      assert.equal(updateArgs.updates.craftingCheck.routed.rollExpression, '1d20');
    });

    it('projects craftingCheck.consumption into view state, preserving an authored-off consumeIngredientsOnFail (issue 712)', async () => {
      const services = createMockServices();
      const manager = services.getCraftingSystemManager();
      const sys = manager.getSystem('sys1');
      if (sys) {
        // A `false` fixture: a dropped projection field would invert the default-true
        // flag to ON, so pin the false round-trip explicitly.
        sys.craftingCheck = {
          enabled: true,
          consumption: { consumeIngredientsOnFail: false, breakToolsOnFail: true },
        };
      }
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      const vs = get(store.viewState);
      assert.equal(
        vs.selectedSystem.craftingCheck.consumption.consumeIngredientsOnFail,
        false,
        'an authored-off consumeIngredientsOnFail survives the projection'
      );
      assert.equal(vs.selectedSystem.craftingCheck.consumption.breakToolsOnFail, true);
    });

    it('saveCraftingCheckConsumption spreads the nested consumption block and preserves other check fields (issue 712)', async () => {
      let updateArgs = null;
      const services = createMockServices();
      const origManager = services.getCraftingSystemManager();
      const sys = origManager.getSystem('sys1');
      if (sys) {
        sys.craftingCheck = {
          enabled: true,
          mode: 'passFail',
          outcomes: ['fail', 'pass'],
          consumption: { consumeIngredientsOnFail: true, breakToolsOnFail: false },
          simple: { rollFormula: '1d20', dc: 12 },
        };
      }
      services.getCraftingSystemManager = () => ({
        ...origManager,
        updateSystem: async (id, updates) => {
          updateArgs = { id, updates };
          await origManager.updateSystem(id, updates);
        },
      });
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      await store.saveCraftingCheckConsumption({ consumeIngredientsOnFail: false });
      assert.ok(updateArgs !== null);
      // The toggled field is written…
      assert.equal(updateArgs.updates.craftingCheck.consumption.consumeIngredientsOnFail, false);
      // …the untouched sibling flag survives (shallow-spread guard)…
      assert.equal(updateArgs.updates.craftingCheck.consumption.breakToolsOnFail, false);
      // …and the rest of the craftingCheck block is preserved.
      assert.deepEqual(updateArgs.updates.craftingCheck.outcomes, ['fail', 'pass']);
      assert.deepEqual(updateArgs.updates.craftingCheck.simple, { rollFormula: '1d20', dc: 12 });
    });

    it('saveSalvageCheckActive toggles the salvage check enabled flag', async () => {
      let updateArgs = null;
      const services = createMockServices();
      const origManager = services.getCraftingSystemManager();
      const sys = origManager.getSystem('sys1');
      if (sys) {
        sys.salvageCraftingCheck = { enabled: true, outcomes: ['fail', 'pass'] };
      }
      services.getCraftingSystemManager = () => ({
        ...origManager,
        updateSystem: async (id, updates) => {
          updateArgs = { id, updates };
          await origManager.updateSystem(id, updates);
        },
      });
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      await store.saveSalvageCheckActive(false);
      assert.equal(updateArgs.updates.salvageCraftingCheck.enabled, false);
    });

    it('viewState.selectedSystem.gatheringCraftingCheck surfaces the progressive and routed config so editors read it back', async () => {
      const services = createMockServices();
      const sys = services.getCraftingSystemManager().getSystem('sys1');
      if (sys) {
        sys.gatheringCraftingCheck = {
          enabled: true,
          progressive: {
            rollFormula: '1d20',
            awardMode: 'equal',
            diceCrits: [],
          },
          routed: {
            type: 'relative',
            rollFormula: '1d20',
            relativeOutcomes: [{ id: 'g1', name: 'Rich Vein', success: true, dc: 5 }],
          },
        };
      }
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      const vs = get(store.viewState);
      const gathering = vs.selectedSystem?.gatheringCraftingCheck;
      assert.ok(gathering?.progressive, 'progressive gathering config should be surfaced, not dropped');
      assert.equal(gathering.progressive.awardMode, 'equal');
      assert.ok(gathering?.routed, 'routed gathering config should be surfaced, not dropped');
      assert.equal(gathering.routed.relativeOutcomes?.[0]?.name, 'Rich Vein');
    });

    it('saveGatheringCheckProgressive persists the progressive config and preserves other check fields', async () => {
      let updateArgs = null;
      const services = createMockServices();
      const origManager = services.getCraftingSystemManager();
      const sys = origManager.getSystem('sys1');
      if (sys) {
        sys.gatheringCraftingCheck = { enabled: true, routed: { type: 'fixed', fixedOutcomes: [] } };
      }
      services.getCraftingSystemManager = () => ({
        ...origManager,
        updateSystem: async (id, updates) => {
          updateArgs = { id, updates };
          await origManager.updateSystem(id, updates);
        },
      });
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      const progressive = {
        rollFormula: '2d6',
        awardMode: 'partial',
        diceCrits: [{ id: 'cr1', die: '1d6', raw: 6, success: true, breakTools: false }],
      };
      await store.saveGatheringCheckProgressive(progressive);
      assert.ok(updateArgs !== null);
      assert.deepEqual(updateArgs.updates.gatheringCraftingCheck.progressive, progressive);
      // existing fields are preserved by the shallow merge
      assert.equal(updateArgs.updates.gatheringCraftingCheck.enabled, true);
      assert.deepEqual(updateArgs.updates.gatheringCraftingCheck.routed, { type: 'fixed', fixedOutcomes: [] });
    });

    it('addCurrencyUnit and updateCurrencyUnit persist editable unit fields', async () => {
      const { store, currency, updateArgs } = await setupCurrencyStore();
      const created = await store.addCurrencyUnit('sys1', {
        id: 'gp',
        label: 'Gold',
        abbreviation: 'gp',
        icon: 'fa-solid fa-coins',
        actorPath: 'system.currency.gp',
      });
      assert.equal(created.id, 'gp');
      await store.updateCurrencyUnit('sys1', 'gp', {
        label: 'Gold pieces',
        actorPath: 'system.currency.gp.value',
      });
      assert.ok(updateArgs() !== null);
      assert.equal(currency().units[0].id, 'gp');
      assert.equal(currency().units[0].label, 'Gold pieces');
      assert.equal(currency().units[0].actorPath, 'system.currency.gp.value');
      assert.equal('provider' in currency(), false);
    });

    it('currency sub-unit actions add, update, and remove denomination breakdowns', async () => {
      const { store, currency, updateArgs } = await setupCurrencyStore({
        randomID: (() => {
          const ids = ['cp', 'sp'];
          let index = 0;
          return () => ids[index++] || `id-${index}`;
        })(),
      });
      await store.addCurrencyUnit('sys1', {
        id: 'cp',
        label: 'Copper',
        abbreviation: 'cp',
        actorPath: 'system.currency.cp',
      });
      await store.addCurrencyUnit('sys1', {
        id: 'sp',
        label: 'Silver',
        abbreviation: 'sp',
        actorPath: 'system.currency.sp',
      });
      await store.addCurrencySubUnit('sys1', 'sp', 'cp');
      await store.updateCurrencySubUnit('sys1', 'sp', 'cp', 10);
      assert.ok(updateArgs() !== null);
      let silver = currency().units.find((unit) => unit.id === 'sp');
      assert.deepEqual(silver.contains, [{ unitId: 'cp', amount: 10 }]);

      await store.deleteCurrencySubUnit('sys1', 'sp', 'cp');
      silver = currency().units.find((unit) => unit.id === 'sp');
      assert.deepEqual(silver.contains, []);
    });

    it('seedCurrencyUnitPresets adds dnd5e units idempotently', async () => {
      const { store, currency } = await setupCurrencyStore({ getFoundrySystemId: () => 'dnd5e' });
      const first = await store.seedCurrencyUnitPresets('sys1');
      const second = await store.seedCurrencyUnitPresets('sys1');
      assert.equal(first.unsupported, false);
      assert.equal(first.added.length, 5);
      assert.equal(second.added.length, 0);
      assert.equal(second.skipped.length, 5);
      assert.equal(
        currency().units.some((unit) => unit.id === 'gp'),
        true
      );
    });

    it('seedCurrencyUnitPresets sets actorInventory spend strategy for pf2e worlds', async () => {
      const { store, currency } = await setupCurrencyStore({ getFoundrySystemId: () => 'pf2e' });
      const result = await store.seedCurrencyUnitPresets('sys1');
      assert.equal(result.unsupported, false);
      assert.equal(currency().spendStrategy, 'actorInventory');
      const gp = currency().units.find((unit) => unit.id === 'gp');
      assert.equal(gp.denomination, 'gp');
    });

    it('seedCurrencyUnitPresets seeds the actorInventory strategy for pf2e worlds', async () => {
      const { store, currency } = await setupCurrencyStore({ getFoundrySystemId: () => 'pf2e' });
      await store.seedCurrencyUnitPresets('sys1');
      assert.equal('inventoryMode' in currency(), false);
      assert.equal(currency().spendStrategy, 'actorInventory');
      assert.equal(currency().providerId, 'pf2e-inventory');
      // The actorInventory strategy is provider-owned, so the seeded units are the canonical ladder.
      assert.deepEqual(
        currency().units.map((unit) => unit.id),
        PF2E_CURRENCY_PRESETS.map((unit) => unit.id)
      );
      assert.deepEqual(
        currency().units.map((unit) => unit.denomination),
        PF2E_CURRENCY_PRESETS.map((unit) => unit.denomination)
      );
    });

    it('setCurrencySpendStrategy persists and defaults providerId for pf2e actorInventory', async () => {
      const { store, currency } = await setupCurrencyStore({ getFoundrySystemId: () => 'pf2e' });
      await store.setCurrencySpendStrategy('sys1', 'actorInventory');
      assert.equal(currency().spendStrategy, 'actorInventory');
      assert.equal(currency().providerId, 'pf2e-inventory');
    });

    it('setCurrencySpendStrategy persists the macro strategy and preserves providerId', async () => {
      const { store, currency } = await setupCurrencyStore({ getFoundrySystemId: () => 'pf2e' });
      await store.setCurrencySpendStrategy('sys1', 'actorInventory');
      await store.setCurrencySpendStrategy('sys1', 'macro');
      assert.equal(currency().spendStrategy, 'macro');
      assert.equal('inventoryMode' in currency(), false);
      // providerId is inert under macro but is preserved across the switch.
      assert.equal(currency().providerId, 'pf2e-inventory');
      await store.setCurrencyProvider('sys1', 'pf2e-inventory');
      assert.equal(currency().providerId, 'pf2e-inventory');
    });

    it('setCurrencySpendStrategy("actorInventory") syncs units to the provider canonical ladder', async () => {
      const { store, currency } = await setupCurrencyStore({ getFoundrySystemId: () => 'pf2e' });
      // Seed a user-managed unit first, then switching to actorInventory overwrites it.
      await store.addCurrencyUnit('sys1', {
        id: 'junk',
        label: 'Junk',
        actorPath: 'system.currency.junk',
      });
      await store.setCurrencySpendStrategy('sys1', 'actorInventory');
      const units = currency().units;
      assert.deepEqual(
        units.map((unit) => unit.id),
        PF2E_CURRENCY_PRESETS.map((unit) => unit.id)
      );
      assert.deepEqual(
        units.map((unit) => unit.denomination),
        PF2E_CURRENCY_PRESETS.map((unit) => unit.denomination)
      );
      assert.equal(
        units.some((unit) => unit.id === 'junk'),
        false,
        'user-managed unit should be overwritten by canonical ladder'
      );
    });

    it('setCurrencyProvider syncs canonical units while under the actorInventory strategy', async () => {
      const { store, currency } = await setupCurrencyStore({ getFoundrySystemId: () => 'pf2e' });
      await store.setCurrencySpendStrategy('sys1', 'actorInventory');
      await store.setCurrencyProvider('sys1', 'pf2e-inventory');
      assert.deepEqual(
        currency().units.map((unit) => unit.id),
        PF2E_CURRENCY_PRESETS.map((unit) => unit.id)
      );
    });

    it('switching to actorProperty or macro leaves user-managed units untouched', async () => {
      const { store, currency } = await setupCurrencyStore({ getFoundrySystemId: () => 'pf2e' });
      await store.addCurrencyUnit('sys1', {
        id: 'mine',
        label: 'Mine',
        actorPath: 'system.currency.mine',
      });
      // macro strategy keeps the user's units.
      await store.setCurrencySpendStrategy('sys1', 'macro');
      assert.equal(
        currency().units.some((unit) => unit.id === 'mine'),
        true
      );
      // actorProperty strategy keeps the user's units too.
      await store.setCurrencySpendStrategy('sys1', 'actorProperty');
      assert.equal(
        currency().units.some((unit) => unit.id === 'mine'),
        true
      );
      // setCurrencyProvider outside the actorInventory strategy does not touch the user's units.
      await store.setCurrencyProvider('sys1', 'pf2e-inventory');
      assert.equal(
        currency().units.some((unit) => unit.id === 'mine'),
        true
      );
    });

    it('actorInventory in a no-provider system (dnd5e) leaves configured units untouched', async () => {
      // Regression: dnd5e has no registered provider, so getDefaultProviderId('dnd5e') === '' and
      // getProviderCanonicalUnits('') is empty. The actorInventory strategy must NOT wipe the GM's
      // units in that case.
      const { store, currency } = await setupCurrencyStore({ getFoundrySystemId: () => 'dnd5e' });
      await store.addCurrencyUnit('sys1', {
        id: 'gp',
        label: 'Gold',
        actorPath: 'system.currency.gp',
      });
      await store.setCurrencySpendStrategy('sys1', 'actorInventory');
      assert.equal(
        currency().units.some((unit) => unit.id === 'gp'),
        true,
        'no-provider system must not have its configured units wiped by the actorInventory strategy'
      );
      // setCurrencyProvider with an empty/unknown provider id also preserves the units.
      await store.setCurrencyProvider('sys1', '');
      assert.equal(
        currency().units.some((unit) => unit.id === 'gp'),
        true,
        'selecting an empty provider id must not wipe configured units'
      );
    });

    it('setCurrencyMacro and clearCurrencyMacro persist per-key macro UUIDs', async () => {
      const { store, currency } = await setupCurrencyStore();
      await store.setCurrencyMacro('sys1', 'canAfford', 'Macro.can');
      assert.equal(currency().macros.canAfford, 'Macro.can');
      await store.setCurrencyMacro('sys1', 'decrement', 'Macro.dec');
      assert.equal(currency().macros.decrement, 'Macro.dec');
      await store.clearCurrencyMacro('sys1', 'canAfford');
      assert.equal(currency().macros.canAfford, '');
      assert.equal(currency().macros.decrement, 'Macro.dec');
    });

    it('seedCurrencyUnitPresets does not overwrite a user-edited seeded unit', async () => {
      const { store, currency } = await setupCurrencyStore({ getFoundrySystemId: () => 'dnd5e' });
      await store.seedCurrencyUnitPresets('sys1');
      await store.updateCurrencyUnit('sys1', 'gp', {
        label: 'Custom Gold',
        actorPath: 'system.currency.gp.value',
      });
      const second = await store.seedCurrencyUnitPresets('sys1');
      assert.equal(second.added.length, 0);
      const units = currency().units;
      const gold = units.find((unit) => unit.id === 'gp');
      assert.equal(gold.label, 'Custom Gold');
      assert.equal(gold.actorPath, 'system.currency.gp.value');
      // No duplicate gp unit was introduced by the second seed.
      assert.equal(units.filter((unit) => unit.id === 'gp').length, 1);
    });

    it("deleteCurrencyUnit removes the unit and strips it from other units' sub-units", async () => {
      const { store, currency } = await setupCurrencyStore();
      await store.addCurrencyUnit('sys1', {
        id: 'cp',
        label: 'Copper',
        abbreviation: 'cp',
        actorPath: 'system.currency.cp',
      });
      await store.addCurrencyUnit('sys1', {
        id: 'sp',
        label: 'Silver',
        abbreviation: 'sp',
        actorPath: 'system.currency.sp',
      });
      await store.addCurrencySubUnit('sys1', 'sp', 'cp', 10);
      await store.deleteCurrencyUnit('sys1', 'cp');
      const units = currency().units;
      assert.equal(
        units.some((unit) => unit.id === 'cp'),
        false
      );
      const silver = units.find((unit) => unit.id === 'sp');
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
          showAttemptHistoryToPlayers: true,
        };
      }
      services.getCraftingSystemManager = () => ({
        ...origManager,
        updateSystem: async (id, updates) => {
          updateArgs = { id, updates };
          await origManager.updateSystem(id, updates);
        },
      });
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      await store.saveAlchemyConfig({
        learnOnCraft: true,
        consumeOnFail: false,
        showAttemptHistoryToPlayers: false,
      });
      assert.ok(updateArgs !== null);
      assert.equal(updateArgs.updates.alchemy.learnOnCraft, true);
      assert.equal(updateArgs.updates.alchemy.consumeOnFail, false);
      assert.equal(updateArgs.updates.alchemy.showAttemptHistoryToPlayers, false);
    });

    it('projects the alchemy behaviour flags into view state, preserving authored-off defaults (issue 713)', async () => {
      const services = createMockServices();
      const manager = services.getCraftingSystemManager();
      const sys = manager.getSystem('sys1');
      if (sys) {
        sys.resolutionMode = 'alchemy';
        // Non-default fixtures for all three flags: a dropped projection field would
        // invert the default-true consumeOnFail/showAttemptHistoryToPlayers to ON.
        sys.alchemy = {
          checkMode: 'simple',
          learnOnCraft: true,
          consumeOnFail: false,
          showAttemptHistoryToPlayers: false,
        };
      }
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      const alchemy = get(store.viewState).selectedSystem.alchemy;
      assert.equal(alchemy.learnOnCraft, true, 'a stored learnOnCraft:true survives');
      assert.equal(alchemy.consumeOnFail, false, 'an authored-off consumeOnFail survives');
      assert.equal(
        alchemy.showAttemptHistoryToPlayers,
        false,
        'an authored-off showAttemptHistoryToPlayers survives'
      );
    });

    it('updateRecipeItemCaps delegates a caps patch to the manager for the selected system', async () => {
      let updateCall = null;
      const services = createMockServices();
      const origManager = services.getCraftingSystemManager();
      services.getCraftingSystemManager = () => ({
        ...origManager,
        updateRecipeItemDefinition: async (systemId, recipeItemId, patch) => {
          updateCall = { systemId, recipeItemId, patch };
          return { item: { id: recipeItemId } };
        },
      });

      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      await store.updateRecipeItemCaps('book-1', { learn: { limitRecipes: true, maxRecipes: 4 } });

      assert.ok(updateCall !== null);
      assert.equal(updateCall.systemId, 'sys1');
      assert.equal(updateCall.recipeItemId, 'book-1');
      assert.deepEqual(updateCall.patch, { caps: { learn: { limitRecipes: true, maxRecipes: 4 } } });
    });

    it('updateRecipeItemCaps is a no-op without a recipe item id', async () => {
      let called = false;
      const services = createMockServices();
      const origManager = services.getCraftingSystemManager();
      services.getCraftingSystemManager = () => ({
        ...origManager,
        updateRecipeItemDefinition: async () => {
          called = true;
        },
      });

      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      await store.updateRecipeItemCaps('', { item: { limitUses: true } });

      assert.equal(called, false);
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
        updateSystem: async (id, updates) => {
          updateArgs = { id, updates };
          await origManager.updateSystem(id, updates);
        },
      });
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      const teaserConfig = {
        enabled: true,
        discoveryMode: 'fragments',
        fragments: [{ id: 'f1', name: 'Shard', progressValue: 50 }],
      };
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
        'selectedSystemId',
        'activeTab',
        'recipeSearch',
        'itemSearch',
        'viewState',
        'selectSystem',
        'createSystem',
        'deleteSystem',
        'saveSystemDetails',
        'setTab',
        'toggleSystemEnabled',
        'toggleFeature',
        'toggleRequirement',
        'addCategory',
        'removeCategory',
        'addTag',
        'removeTag',
        'addEssence',
        'removeEssence',
        'addCurrencyUnit',
        'updateCurrencyUnit',
        'deleteCurrencyUnit',
        'addCurrencySubUnit',
        'updateCurrencySubUnit',
        'deleteCurrencySubUnit',
        'setCurrencySpendStrategy',
        'setCurrencyProvider',
        'setCurrencyMacro',
        'clearCurrencyMacro',
        'seedCurrencyUnitPresets',
        'saveTeaserConfig',
        'deleteRecipe',
        'duplicateRecipe',
        'toggleRecipeEnabled',
        'importRecipes',
        'exportRecipes',
        'exportSystem',
        'importSystem',
        'deleteComponent',
        'updateComponent',
        'setRecipeSearch',
        'setItemSearch',
        'refresh',
        'destroy',
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
      const selected = vs.systems.filter((s) => s.selected === true);
      const notSelected = vs.systems.filter((s) => s.selected === false);
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
        'id',
        'name',
        'description',
        'enabled',
        'features',
        'categories',
        'itemTags',
        'essenceDefinitions',
        'managedItemOptions',
        'componentTagOptions',
        'requirements',
        'craftingCheck',
        'recipeVisibility',
        'showRecipeVisibilityKnowledgeOptions',
        'showRecipeVisibilityPlayerNote',
        'showTags',
        'showEssences',
        'availableScriptMacros',
        'sceneOptions',
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
      assert.ok(
        !('complexRecipes' in features),
        'complexRecipes is no longer a normalized feature (#102)'
      );
      for (const key of [
        'recipeCategories',
        'itemTags',
        'essences',
        'multiStepRecipes',
        'propertyMacros',
        'craftingChecks',
        'outcomeRouting',
        'effectTransfer',
        'gathering',
        'salvage',
      ]) {
        assert.ok(key in features, `features should have key: ${key}`);
      }
    });

    it('viewState.selectedSystem.features.salvage reflects the stored value (salvage is optional)', async () => {
      const services = createMockServices();
      const sys = services.getCraftingSystemManager().getSystem('sys1');
      // Salvage is now an opt-out feature: an explicit salvage:false projects as off.
      if (sys) sys.features = { ...sys.features, salvage: false };
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      const vs = get(store.viewState);
      assert.equal(vs.selectedSystem?.features.salvage, false);
    });

    it('viewState.selectedSystem.salvageCraftingCheck surfaces the routed config so editors read it back', async () => {
      const services = createMockServices();
      const sys = services.getCraftingSystemManager().getSystem('sys1');
      if (sys) {
        sys.salvageResolutionMode = 'routed';
        sys.salvageCraftingCheck = {
          enabled: true,
          routed: {
            type: 'relative',
            rollFormula: '1d20',
            relativeOutcomes: [{ id: 'o1', name: 'Clean Salvage', success: true, dc: 5 }],
          },
        };
      }
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      const vs = get(store.viewState);
      const routed = vs.selectedSystem?.salvageCraftingCheck?.routed;
      assert.ok(routed, 'routed salvage config should be surfaced, not dropped');
      assert.equal(routed.relativeOutcomes?.[0]?.name, 'Clean Salvage');
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
        localize: (key) =>
          key === 'FABRICATE.Admin.Manager.Environment.NewLibraryTask' ? 'New Gathering Task' : key,
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
        dropRows: [{ id: 'drop-herb', componentId: 'herb', quantity: 2, dropRate: 80 }],
      });
      const event = await store.addGatheringLibraryEvent('sys1');
      await store.updateGatheringLibraryEvent('sys1', event.id, {
        name: 'Thorns',
        dangerTags: ['hazardous'],
        dropRate: 30,
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
          { id: 'wind', label: 'Wind', icon: 'fas fa-wind' },
        ],
      });
      assert.deepEqual(config.systems.sys1.conditions.timeOfDay, {
        enabled: true,
        current: 'night',
        values: [
          { id: 'dawn', label: 'Dawn', icon: 'fas fa-cloud-sun' },
          { id: 'day', label: 'Day', icon: 'fas fa-sun' },
          { id: 'dusk', label: 'Dusk', icon: 'fas fa-cloud-moon' },
          { id: 'night', label: 'Night', icon: 'fas fa-moon' },
        ],
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
        enabled: true,
      });
      assert.equal(config.systems.sys1.events[0].name, 'Thorns');
      assert.equal(get(store.viewState).gatheringConfig.systems.sys1.events[0].dropRate, 30);
      // An event with no custom image is stamped with the shared default.
      assert.equal(config.systems.sys1.events[0].img, DEFAULT_GATHERING_EVENT_IMG);
    });

    it('auto-populates default task name and image when the first drop row receives a component', async () => {
      const services = createMockServices({
        localize: (key) => {
          if (key === 'FABRICATE.Admin.Manager.Environment.NewLibraryTask')
            return 'New Gathering Task';
          if (key === 'FABRICATE.Admin.Manager.Environment.Tasks.AutoNameTemplate')
            return 'Gather {component}';
          return key;
        },
      });
      const sys = services.getCraftingSystemManager().getSystem('sys1');
      sys.features = { gathering: true };
      sys.components = [{ id: 'ore', name: 'Raw Ore', img: 'icons/raw-ore.png' }];

      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      const task = await store.addGatheringLibraryTask('sys1');

      await store.updateGatheringLibraryTask('sys1', task.id, {
        dropRows: [{ id: 'drop-a', componentId: 'ore', quantity: 1, dropRate: 50 }],
      });

      const persisted = services._store.gatheringConfig.systems.sys1.tasks[0];
      assert.equal(persisted.name, 'Gather Raw Ore');
      assert.equal(persisted.img, 'icons/raw-ore.png');
    });

    it('does not auto-populate the task name and image when the task name has been customized', async () => {
      const services = createMockServices({
        localize: (key) => {
          if (key === 'FABRICATE.Admin.Manager.Environment.NewLibraryTask')
            return 'New Gathering Task';
          if (key === 'FABRICATE.Admin.Manager.Environment.Tasks.AutoNameTemplate')
            return 'Gather {component}';
          return key;
        },
      });
      const sys = services.getCraftingSystemManager().getSystem('sys1');
      sys.features = { gathering: true };
      sys.components = [{ id: 'ore', name: 'Raw Ore', img: 'icons/raw-ore.png' }];

      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      const task = await store.addGatheringLibraryTask('sys1');
      await store.updateGatheringLibraryTask('sys1', task.id, { name: 'Forage Roots' });

      await store.updateGatheringLibraryTask('sys1', task.id, {
        dropRows: [{ id: 'drop-a', componentId: 'ore', quantity: 1, dropRate: 50 }],
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
      assert.equal(
        services._store.gatheringConfig.systems.sys1.tasks[0].defaultEnvironmentId,
        null
      );

      // A trimmed id round-trips through persistence.
      await store.updateGatheringLibraryTask('sys1', task.id, {
        defaultEnvironmentId: '  env-7  ',
      });
      assert.equal(
        services._store.gatheringConfig.systems.sys1.tasks[0].defaultEnvironmentId,
        'env-7'
      );

      // An empty/whitespace id normalizes back to null (not the empty string).
      await store.updateGatheringLibraryTask('sys1', task.id, { defaultEnvironmentId: '   ' });
      assert.equal(
        services._store.gatheringConfig.systems.sys1.tasks[0].defaultEnvironmentId,
        null
      );
    });

    it('persists a per-task gathering DC override (finite truncates, else null)', async () => {
      const services = createMockServices();
      const sys = services.getCraftingSystemManager().getSystem('sys1');
      sys.features = { gathering: true };
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      const task = await store.addGatheringLibraryTask('sys1');

      // A fresh task defaults to null (use the system-level default DC).
      assert.equal(services._store.gatheringConfig.systems.sys1.tasks[0].dcOverride, null);

      // A finite override round-trips, truncated to an integer.
      await store.updateGatheringLibraryTask('sys1', task.id, { dcOverride: '17.9' });
      assert.equal(services._store.gatheringConfig.systems.sys1.tasks[0].dcOverride, 17);

      // A non-numeric override normalizes back to null.
      await store.updateGatheringLibraryTask('sys1', task.id, { dcOverride: 'nope' });
      assert.equal(services._store.gatheringConfig.systems.sys1.tasks[0].dcOverride, null);
    });

    it('persists depletedBehavior swap-image on the node config (legacy deleteToken dropped)', async () => {
      const services = createMockServices();
      const sys = services.getCraftingSystemManager().getSystem('sys1');
      sys.features = { gathering: true };
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      const task = await store.addGatheringLibraryTask('sys1');

      await store.updateGatheringLibraryTask('sys1', task.id, {
        nodes: {
          enabled: true,
          max: 3,
          depletedBehavior: { swapImage: '  icons/x.webp ', postfixName: true },
        },
      });
      assert.deepEqual(
        services._store.gatheringConfig.systems.sys1.tasks[0].nodes.depletedBehavior,
        { swapImage: 'icons/x.webp', postfixName: true }
      );

      // The removed deleteToken flag is ignored; only the swap-image survives.
      await store.updateGatheringLibraryTask('sys1', task.id, {
        nodes: {
          enabled: true,
          max: 3,
          depletedBehavior: { deleteToken: true, swapImage: 'icons/y.webp' },
        },
      });
      assert.deepEqual(
        services._store.gatheringConfig.systems.sys1.tasks[0].nodes.depletedBehavior,
        { swapImage: 'icons/y.webp' }
      );
    });

    it('does not auto-populate the task name and image when the task image has been customized', async () => {
      const services = createMockServices({
        localize: (key) => {
          if (key === 'FABRICATE.Admin.Manager.Environment.NewLibraryTask')
            return 'New Gathering Task';
          if (key === 'FABRICATE.Admin.Manager.Environment.Tasks.AutoNameTemplate')
            return 'Gather {component}';
          return key;
        },
      });
      const sys = services.getCraftingSystemManager().getSystem('sys1');
      sys.features = { gathering: true };
      sys.components = [{ id: 'ore', name: 'Raw Ore', img: 'icons/raw-ore.png' }];

      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      const task = await store.addGatheringLibraryTask('sys1');
      await store.updateGatheringLibraryTask('sys1', task.id, { img: 'icons/svg/leaf.svg' });

      await store.updateGatheringLibraryTask('sys1', task.id, {
        dropRows: [{ id: 'drop-a', componentId: 'ore', quantity: 1, dropRate: 50 }],
      });

      const persisted = services._store.gatheringConfig.systems.sys1.tasks[0];
      assert.equal(persisted.name, 'New Gathering Task');
      assert.equal(persisted.img, 'icons/svg/leaf.svg');
    });

    it('does not auto-populate the task name and image when a second drop row receives a component', async () => {
      const services = createMockServices({
        localize: (key) => {
          if (key === 'FABRICATE.Admin.Manager.Environment.NewLibraryTask')
            return 'New Gathering Task';
          if (key === 'FABRICATE.Admin.Manager.Environment.Tasks.AutoNameTemplate')
            return 'Gather {component}';
          return key;
        },
      });
      const sys = services.getCraftingSystemManager().getSystem('sys1');
      sys.features = { gathering: true };
      sys.components = [
        { id: 'ore', name: 'Raw Ore', img: 'icons/raw-ore.png' },
        { id: 'gem', name: 'Rough Gem', img: 'icons/gem.png' },
      ];

      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      const task = await store.addGatheringLibraryTask('sys1');
      await store.updateGatheringLibraryTask('sys1', task.id, {
        name: 'Mining Run',
        img: 'icons/pickaxe.png',
      });
      await store.updateGatheringLibraryTask('sys1', task.id, {
        dropRows: [{ id: 'drop-a', componentId: 'ore', quantity: 1, dropRate: 50 }],
      });

      await store.updateGatheringLibraryTask('sys1', task.id, {
        dropRows: [
          { id: 'drop-a', componentId: 'ore', quantity: 1, dropRate: 50 },
          { id: 'drop-b', componentId: 'gem', quantity: 1, dropRate: 10 },
        ],
      });

      const persisted = services._store.gatheringConfig.systems.sys1.tasks[0];
      assert.equal(persisted.name, 'Mining Run');
      assert.equal(persisted.img, 'icons/pickaxe.png');
    });

    it('does not auto-populate the task name and image when an empty drop row is added', async () => {
      const services = createMockServices({
        localize: (key) => {
          if (key === 'FABRICATE.Admin.Manager.Environment.NewLibraryTask')
            return 'New Gathering Task';
          if (key === 'FABRICATE.Admin.Manager.Environment.Tasks.AutoNameTemplate')
            return 'Gather {component}';
          return key;
        },
      });
      const sys = services.getCraftingSystemManager().getSystem('sys1');
      sys.features = { gathering: true };
      sys.components = [{ id: 'ore', name: 'Raw Ore', img: 'icons/raw-ore.png' }];

      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      const task = await store.addGatheringLibraryTask('sys1');

      await store.updateGatheringLibraryTask('sys1', task.id, {
        dropRows: [{ id: 'drop-a', componentId: '', quantity: 1, dropRate: 50 }],
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
        localize: (key) =>
          key === 'FABRICATE.Admin.Manager.Environment.Tasks.CopySuffix' ? 'Copy' : key,
      });
      const sys = services.getCraftingSystemManager().getSystem('sys1');
      sys.features = { gathering: true };
      services._store.gatheringConfig = {
        systems: {
          sys1: {
            tasks: [
              {
                id: 'task-herbs',
                name: 'Moon Herbs',
                description: 'Gather under old trees.',
                enabled: true,
                region: 'north',
                biomes: ['forest'],
                weather: ['clear'],
                timeOfDay: ['night'],
                dropRows: [
                  {
                    id: 'drop-a',
                    componentId: 'herb',
                    quantity: 2,
                    dropRate: 80,
                    conditionModifiers: {
                      weather: [{ id: 'rain-bonus', conditionId: 'rain', value: 10 }],
                    },
                    enabled: true,
                  },
                  {
                    id: 'drop-b',
                    itemUuid: 'Item.random',
                    quantity: 1,
                    dropRate: 20,
                    enabled: false,
                  },
                ],
                staminaCost: 1,
                gatheringModifier: { provider: 'macro', macroUuid: 'Macro.mod' },
                timeRequirement: { hours: 1 },
              },
            ],
          },
          sys2: {
            tasks: [{ id: 'task-other', name: 'Other System', dropRows: [{ id: 'drop-other' }] }],
          },
        },
      };
      const store = createAdminStore(services);
      await store.selectSystem('sys1');

      const duplicate = await store.duplicateGatheringLibraryTask('sys1', 'task-herbs');

      const sys1Tasks = services._store.gatheringConfig.systems.sys1.tasks;
      assert.equal(duplicate.id, 'copy-id-1');
      assert.equal(duplicate.name, 'Moon Herbs (Copy)');
      assert.deepEqual(
        duplicate.dropRows.map((row) => row.id),
        ['copy-id-2', 'copy-id-3']
      );
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
      assert.deepEqual(
        sys1Tasks[0].dropRows.map((row) => row.id),
        ['drop-a', 'drop-b']
      );
      assert.equal(services._store.gatheringConfig.systems.sys2.tasks.length, 1);
      assert.equal(services._store.gatheringConfig.systems.sys2.tasks[0].id, 'task-other');
      assert.equal(services._store.gatheringConfig.systems.sys2.tasks[0].name, 'Other System');
      assert.deepEqual(
        services._store.gatheringConfig.systems.sys2.tasks[0].dropRows.map((row) => row.id),
        ['drop-other']
      );
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
        dropRows: [
          {
            id: 'drop-zero',
            componentId: 'herb',
            quantity: 3,
            dropRate: 0,
            conditionModifiers: {
              weather: [{ id: 'rain-bonus', conditionId: 'Rain', value: 15 }],
              timeOfDay: [{ id: 'night-penalty', conditionId: 'night', value: -5 }],
            },
          },
        ],
      });

      const saved = services._store.gatheringConfig.systems.sys1.tasks[0];
      assert.deepEqual(saved.weather, ['rain']);
      assert.deepEqual(saved.timeOfDay, []);
      assert.equal(saved.dropRows[0].dropRate, 0);
      assert.deepEqual(saved.dropRows[0].conditionModifiers, {
        timeOfDay: [{ id: 'night-penalty', conditionId: 'night', operator: '-', value: 5 }],
        weather: [{ id: 'rain-bonus', conditionId: 'rain', operator: '+', value: 15 }],
        biome: [],
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
        empty.errors.some((error) => error.includes('requires at least one drop row')),
        `expected "requires at least one drop row" in errors: ${empty.errors.join(' | ')}`
      );

      const unresolved = store.validateGatheringLibraryTask({
        id: 't2',
        name: 'Gather',
        dropRows: [
          { id: 'row-1', componentId: '', itemUuid: '', quantity: 1, dropRate: 50, enabled: true },
        ],
      });
      assert.equal(unresolved.valid, false);
      assert.ok(
        unresolved.errors.some((error) => error.includes('requires componentId or itemUuid')),
        `expected "requires componentId or itemUuid" in errors: ${unresolved.errors.join(' | ')}`
      );

      const resolved = store.validateGatheringLibraryTask({
        id: 't3',
        name: 'Gather',
        dropRows: [
          {
            id: 'row-1',
            componentId: 'herb',
            itemUuid: '',
            quantity: 1,
            dropRate: 50,
            enabled: true,
          },
        ],
      });
      assert.equal(resolved.valid, true);
      assert.deepEqual(resolved.errors, []);

      const staleComponent = store.validateGatheringLibraryTask({
        id: 't-stale',
        name: 'Gather',
        dropRows: [
          {
            id: 'row-stale',
            componentId: 'missing-herb',
            itemUuid: '',
            quantity: 1,
            dropRate: 50,
            enabled: true,
          },
        ],
      });
      assert.equal(staleComponent.valid, false);
      assert.ok(
        staleComponent.errors.some(
          (error) => error.includes('missing-herb') && error.includes('unknown componentId')
        ),
        `expected stale component to be rejected: ${staleComponent.errors.join(' | ')}`
      );

      const originalFromUuidSync = globalThis.fromUuidSync;
      globalThis.fromUuidSync = (uuid) =>
        uuid === 'Item.valid-reward' ? { documentName: 'Item' } : null;
      try {
        const staleItem = store.validateGatheringLibraryTask({
          id: 't-stale-item',
          name: 'Gather',
          dropRows: [
            {
              id: 'row-item',
              componentId: '',
              itemUuid: 'Item.missing-reward',
              quantity: 1,
              dropRate: 50,
              enabled: true,
            },
          ],
        });
        assert.equal(staleItem.valid, false);
        assert.ok(
          staleItem.errors.some(
            (error) =>
              error.includes('Item.missing-reward') && error.includes('does not resolve to an Item')
          ),
          `expected stale item UUID to be rejected: ${staleItem.errors.join(' | ')}`
        );

        const validItem = store.validateGatheringLibraryTask({
          id: 't-valid-item',
          name: 'Gather',
          dropRows: [
            {
              id: 'row-item',
              componentId: '',
              itemUuid: 'Item.valid-reward',
              quantity: 1,
              dropRate: 50,
              enabled: true,
            },
          ],
        });
        assert.equal(validItem.valid, true);
      } finally {
        globalThis.fromUuidSync = originalFromUuidSync;
      }

      const enabledResolvedPlusDisabledUnresolved = store.validateGatheringLibraryTask({
        id: 't4',
        name: 'Gather',
        dropRows: [
          {
            id: 'row-1',
            componentId: 'herb',
            itemUuid: '',
            quantity: 1,
            dropRate: 50,
            enabled: true,
          },
          { id: 'row-2', componentId: '', itemUuid: '', quantity: 1, dropRate: 25, enabled: false },
        ],
      });
      assert.equal(enabledResolvedPlusDisabledUnresolved.valid, false);
      assert.ok(
        enabledResolvedPlusDisabledUnresolved.errors.some(
          (error) => error.includes('row-2') && error.includes('requires componentId or itemUuid')
        ),
        `expected disabled unresolved row to be rejected: ${enabledResolvedPlusDisabledUnresolved.errors.join(' | ')}`
      );
    });

    it('does not persist gathering library task drops with stale reward targets', async () => {
      const errors = [];
      const services = createMockServices({
        notify: { info: () => {}, warn: () => {}, error: (message) => errors.push(message) },
      });
      const sys = services.getCraftingSystemManager().getSystem('sys1');
      sys.features = { gathering: true };
      sys.components = [{ id: 'herb', name: 'Herb', img: 'herb.webp' }];
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      const task = await store.addGatheringLibraryTask('sys1');

      const saved = await store.updateGatheringLibraryTask('sys1', task.id, {
        dropRows: [{ id: 'row-stale', componentId: 'missing-herb', quantity: 1, dropRate: 50 }],
      });

      assert.equal(saved, false);
      assert.equal(services._store.gatheringConfig.systems.sys1.tasks[0].dropRows.length, 0);
      assert.ok(errors.some((error) => error.includes('missing-herb')));
    });

    it('returns null when duplicating a missing gathering task', async () => {
      const services = createMockServices();
      services._store.gatheringConfig = {
        systems: {
          sys1: {
            tasks: [{ id: 'task-herbs', name: 'Moon Herbs', dropRows: [] }],
          },
        },
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
        localize: (key) =>
          key === 'FABRICATE.Admin.Manager.Environment.Tasks.CopySuffix' ? 'Copy' : key,
      });
      const sys = services.getCraftingSystemManager().getSystem('sys1');
      sys.features = { gathering: true };
      services._store.gatheringConfig = {
        systems: {
          sys1: {
            events: [
              {
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
                characterModifiers: [],
              },
            ],
          },
          sys2: {
            events: [{ id: 'event-other', name: 'Other Event', dropRate: 10 }],
          },
        },
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
            events: [{ id: 'event-thorns', name: 'Thornwall', dropRate: 25 }],
          },
        },
      };
      const store = createAdminStore(services);
      await store.selectSystem('sys1');

      assert.equal(await store.duplicateGatheringLibraryEvent('sys1', 'missing'), null);
      assert.equal(
        await store.duplicateGatheringLibraryEvent('missing-system', 'event-thorns'),
        null
      );
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
              timeOfDay: { enabled: true, current: 'night', values: ['night', 'day'] },
            },
            tasks: [
              {
                id: 'task-rain',
                name: 'Rain',
                weather: ['rain'],
                timeOfDay: ['night'],
                dropRows: [],
              },
            ],
            events: [
              {
                id: 'event-rain',
                name: 'Rain Event',
                weather: ['rain'],
                timeOfDay: ['night'],
                dropRate: 50,
              },
            ],
          },
          sys2: {
            conditions: {
              weather: { enabled: true, current: 'rain', values: ['rain'] },
              timeOfDay: { enabled: true, current: 'night', values: ['night'] },
            },
            tasks: [
              {
                id: 'task-other',
                name: 'Other',
                weather: ['rain'],
                timeOfDay: ['night'],
                dropRows: [],
              },
            ],
            events: [
              {
                id: 'event-other',
                name: 'Other Event',
                weather: ['rain'],
                timeOfDay: ['night'],
                dropRate: 50,
              },
            ],
          },
        },
      };
      const store = createAdminStore(services);
      await store.selectSystem('sys1');

      assert.equal(await store.deleteGatheringConditionValue('weather', 'rain', 'sys1'), false);
      await store.toggleGatheringConditionEnabled('weather', false, 'sys1');
      assert.equal(await store.deleteGatheringConditionValue('weather', 'rain', 'sys1'), true);
      await store.addGatheringConditionValue('weather', 'Ash Fall', 'sys1');
      await store.addGatheringConditionValue('weather', 'ash fall', 'sys1');
      await store.updateGatheringConditionValue(
        'weather',
        'ash-fall',
        { label: 'Ashfall', icon: 'fas fa-volcano' },
        'sys1'
      );
      await store.updateGatheringConditions({ weather: 'ash-fall', systemId: 'sys1' });

      const sys1 = services._store.gatheringConfig.systems.sys1;
      const sys2 = services._store.gatheringConfig.systems.sys2;
      assert.deepEqual(sys1.conditions.weather, {
        enabled: false,
        current: 'ash-fall',
        values: [{ id: 'ash-fall', label: 'Ashfall', icon: 'fas fa-volcano' }],
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
                values: [
                  { id: 'heavy-rain', label: 'Heavy Rain', icon: 'fas fa-cloud-showers-heavy' },
                ],
              },
              timeOfDay: {
                enabled: true,
                current: 'night',
                values: [{ id: 'night', label: 'Night', icon: 'fas fa-moon' }],
              },
            },
            tasks: [
              {
                id: 'task-rain',
                name: 'Rain',
                weather: ['heavy-rain'],
                timeOfDay: ['night'],
                dropRows: [],
              },
            ],
            events: [
              {
                id: 'event-rain',
                name: 'Rain Event',
                weather: ['heavy-rain'],
                timeOfDay: ['night'],
                dropRate: 50,
              },
            ],
          },
          sys2: {
            conditions: {
              weather: {
                enabled: true,
                current: 'heavy-rain',
                values: [
                  { id: 'heavy-rain', label: 'Heavy Rain', icon: 'fas fa-cloud-showers-heavy' },
                ],
              },
              timeOfDay: {
                enabled: true,
                current: 'night',
                values: [{ id: 'night', label: 'Night', icon: 'fas fa-moon' }],
              },
            },
            tasks: [
              {
                id: 'task-other',
                name: 'Other',
                weather: ['heavy-rain'],
                timeOfDay: ['night'],
                dropRows: [],
              },
            ],
            events: [
              {
                id: 'event-other',
                name: 'Other Event',
                weather: ['heavy-rain'],
                timeOfDay: ['night'],
                dropRate: 50,
              },
            ],
          },
        },
      };
      const store = createAdminStore(services);
      await store.selectSystem('sys1');

      assert.equal(
        await store.updateGatheringConditionValue(
          'weather',
          'heavy-rain',
          { label: 'Storm Rain' },
          'sys1'
        ),
        true
      );
      assert.equal(
        await store.updateGatheringConditionValue(
          'weather',
          'heavy-rain',
          { label: '   ' },
          'sys1'
        ),
        true
      );

      const sys1 = services._store.gatheringConfig.systems.sys1;
      assert.deepEqual(sys1.conditions.weather, {
        enabled: true,
        current: 'heavy-rain',
        values: [{ id: 'heavy-rain', label: 'Storm Rain', icon: 'fas fa-cloud-showers-heavy' }],
      });
      assert.deepEqual(sys1.tasks[0].weather, ['heavy-rain']);
      assert.deepEqual(sys1.events[0].weather, ['heavy-rain']);

      assert.equal(
        await store.deleteGatheringConditionValue('weather', 'heavy-rain', 'sys1'),
        false
      );
      await store.toggleGatheringConditionEnabled('weather', false, 'sys1');
      assert.equal(
        await store.deleteGatheringConditionValue('weather', 'heavy-rain', 'sys1'),
        true
      );

      assert.deepEqual(services._store.gatheringConfig.systems.sys1.tasks[0].weather, []);
      assert.deepEqual(services._store.gatheringConfig.systems.sys1.events[0].weather, []);
      assert.deepEqual(services._store.gatheringConfig.systems.sys2.tasks[0].weather, [
        'heavy-rain',
      ]);
      assert.deepEqual(services._store.gatheringConfig.systems.sys2.events[0].weather, [
        'heavy-rain',
      ]);
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
          timeOfDay: ['day'],
        },
        systems: {
          sys1: {
            tasks: [{ id: 'task-forest', name: 'Forest', biomes: ['forest'], dropRows: [] }],
            events: [
              { id: 'event-forest', name: 'Forest Event', biomes: ['forest'], dropRate: 50 },
            ],
          },
        },
      };
      const store = createAdminStore(services);
      await store.selectSystem('sys1');

      // Region is no longer a composition vocabulary dimension.
      assert.equal(
        'regions' in get(store.viewState).gatheringConfig.systems.sys1.vocabularies,
        false
      );
      assert.deepEqual(
        get(store.viewState).gatheringConfig.systems.sys1.vocabularies.biomes.values,
        [
          {
            id: 'forest',
            label: 'Forest',
            icon: 'fas fa-tree',
            colorToken: 'sage',
            customColor: '',
          },
        ]
      );

      // The regions dimension is rejected by the vocabulary actions.
      assert.equal(
        await store.addGatheringVocabularyValue('regions', 'South Coast', 'sys1'),
        false
      );
      await store.addGatheringVocabularyValue(
        'biomes',
        { label: 'Crystal Cavern', icon: 'fas fa-gem', colorToken: 'mist', customColor: '#88aaff' },
        'sys1'
      );
      await store.updateGatheringVocabularyValue(
        'biomes',
        'crystal cavern',
        {
          label: 'Crystal Caves',
          icon: 'fas fa-mountain',
          colorToken: '--fab-tag-lavender',
          customColor: 'bad',
        },
        'sys1'
      );

      const vocabularies = services._store.gatheringConfig.systems.sys1.vocabularies;
      assert.equal('regions' in vocabularies, false);
      assert.deepEqual(vocabularies.biomes.values.at(-1), {
        id: 'crystal cavern',
        label: 'Crystal Caves',
        icon: 'fas fa-mountain',
        colorToken: 'lavender',
        customColor: '',
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
          biomes: ['forest', 'mountain', 'swamp'],
        },
      };

      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      const config = get(store.viewState).gatheringConfig;

      assert.equal(
        'regions' in config.vocabularies,
        false,
        'region is no longer a composition vocabulary dimension'
      );

      assert.deepEqual(
        config.vocabularies.biomes,
        [
          {
            id: 'forest',
            label: 'Forest',
            icon: 'fas fa-tree',
            colorToken: 'sage',
            customColor: '',
          },
          {
            id: 'mountain',
            label: 'Mountain',
            icon: 'fas fa-mountain',
            colorToken: 'mist',
            customColor: '',
          },
          {
            id: 'swamp',
            label: 'Swamp',
            icon: 'fas fa-frog',
            colorToken: 'mauve',
            customColor: '',
          },
        ],
        'each default biome gets its own colour token, not a single flat fallback'
      );
    });

    it('seeds default biomes/weather/timeOfDay at the top level when the persisted setting has none', async () => {
      const services = createMockServices();
      const sys = services.getCraftingSystemManager().getSystem('sys1');
      sys.features = { gathering: true };
      services._store.gatheringConfig = {};

      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      const config = get(store.viewState).gatheringConfig;

      assert.equal(
        'regions' in config.vocabularies,
        false,
        'region is no longer a composition vocabulary dimension'
      );

      const biomeIds = config.vocabularies.biomes.map((b) => b.id);
      assert.deepEqual(biomeIds, [
        'forest',
        'grassland',
        'mountain',
        'cave',
        'coastal',
        'swamp',
        'desert',
        'urban',
        'ruins',
        'wasteland',
      ]);
      const distinctColorTokens = new Set(config.vocabularies.biomes.map((b) => b.colorToken));
      assert.ok(
        distinctColorTokens.size >= 6,
        'default biomes use multiple distinct colour tokens, not a single fallback'
      );

      const weatherLabels = config.vocabularies.weather.map((w) => w.label);
      assert.ok(
        weatherLabels.every((label) => /^[A-Z]/.test(label)),
        'every weather label starts with an uppercase letter'
      );
      const weatherIds = config.vocabularies.weather.map((w) => w.id);
      assert.deepEqual(weatherIds, ['clear', 'cloudy', 'rain', 'storm', 'snow', 'fog', 'wind']);

      const timeOfDayLabels = config.vocabularies.timeOfDay.map((t) => t.label);
      assert.deepEqual(timeOfDayLabels, ['Dawn', 'Day', 'Dusk', 'Night']);
    });

    it('deletes selected-system biome vocabulary values and prunes matching references only in that system', async () => {
      const environmentUpdates = [];
      const environments = [
        { id: 'env-sys1', craftingSystemId: 'sys1', biomes: ['forest', 'swamp'] },
        { id: 'env-sys2', craftingSystemId: 'sys2', biomes: ['forest'] },
      ];
      const services = createMockServices({
        getGatheringEnvironmentStore: () => ({
          list: () => environments,
          update: async (id, updates) => {
            environmentUpdates.push([id, updates]);
            const index = environments.findIndex((environment) => environment.id === id);
            if (index >= 0) environments[index] = { ...environments[index], ...updates };
            return environments[index];
          },
        }),
      });
      const sys = services.getCraftingSystemManager().getSystem('sys1');
      sys.features = { gathering: true };
      services._store.gatheringConfig = {
        systems: {
          sys1: {
            vocabularies: {
              biomes: {
                values: [
                  { id: 'forest', label: 'Forest', icon: 'fas fa-tree', colorToken: 'sage' },
                ],
              },
            },
            tasks: [{ id: 'task-forest', name: 'Forest', biomes: ['forest'], dropRows: [] }],
            events: [
              { id: 'event-forest', name: 'Forest Event', biomes: ['forest'], dropRate: 50 },
            ],
          },
          sys2: {
            vocabularies: {
              biomes: {
                values: [
                  { id: 'forest', label: 'Forest', icon: 'fas fa-tree', colorToken: 'sage' },
                ],
              },
            },
            tasks: [{ id: 'task-other', name: 'Other', biomes: ['forest'], dropRows: [] }],
            events: [{ id: 'event-other', name: 'Other Event', biomes: ['forest'], dropRate: 50 }],
          },
        },
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
      assert.deepEqual(
        environmentUpdates.map((update) => update[0]),
        ['env-sys1']
      );
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
              eventVisibility: 'not-a-visibility',
            },
            tasks: [],
            events: [],
          },
        },
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
        dropModifierMode: 'additive',
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
        eventVisibility: 'full',
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
        dropModifierMode: 'additive',
      });
      assert.deepEqual(
        get(store.viewState).gatheringConfig.systems.sys1.rules,
        services._store.gatheringConfig.systems.sys1.rules
      );
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
              { id: 'str', label: 'Str', icon: '', expression: '@abilities.str.mod' },
            ],
            tasks: [
              {
                id: 'task-iron',
                name: 'Iron',
                dropRows: [
                  {
                    id: 'row-iron',
                    componentId: 'iron',
                    quantity: 1,
                    dropRate: 50,
                    characterModifiers: [
                      { id: 'ref-plain', modifierId: 'str', operator: '+' }, // no mode
                      { id: 'ref-mult', modifierId: 'str', operator: '-', mode: 'multiplicative' }, // stray mode stripped
                      { id: 'ref-add', modifierId: 'str', operator: '+', mode: 'additive' }, // stray mode stripped
                    ],
                    conditionModifiers: {
                      weather: [
                        { id: 'w-plain', conditionId: 'rain', operator: '-', value: 10 }, // no mode
                        {
                          id: 'w-mult',
                          conditionId: 'storm',
                          operator: '-',
                          value: 50,
                          mode: 'multiplicative',
                        }, // stray mode stripped
                      ],
                      timeOfDay: [
                        {
                          id: 't-bad',
                          conditionId: 'night',
                          operator: '+',
                          value: 5,
                          mode: 'bogus',
                        },
                      ], // stray mode stripped
                      biome: [
                        {
                          id: 'b-add',
                          conditionId: 'forest',
                          operator: '+',
                          value: 5,
                          mode: 'additive',
                        },
                      ], // stray mode stripped
                    },
                  },
                ],
              },
            ],
            events: [
              {
                id: 'event-1',
                name: 'Trap',
                dropRate: 25,
                characterModifiers: [
                  { id: 'eref', modifierId: 'str', operator: '-', mode: 'multiplicative' },
                ],
              },
            ],
          },
        },
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
        assert.equal(
          'mode' in ref,
          false,
          `character modifier reference ${ref.id} carries no mode`
        );
      }
      assert.equal(
        'mode' in config.events[0].characterModifiers[0],
        false,
        'event ref carries no mode'
      );
      const cm = config.tasks[0].dropRows[0].conditionModifiers;
      for (const list of [cm.weather, cm.timeOfDay, cm.biome]) {
        for (const entry of list) {
          assert.equal('mode' in entry, false, `condition modifier ${entry.id} carries no mode`);
        }
      }

      // A valid system mode survives the round-trip and emits only the new key.
      await store.updateGatheringRules('sys1', { dropModifierMode: 'multiplicative' });
      assert.equal(
        services._store.gatheringConfig.systems.sys1.rules.dropModifierMode,
        'multiplicative'
      );
      assert.equal(
        'characterModifierMode' in services._store.gatheringConfig.systems.sys1.rules,
        false
      );
    });

    it('issue 299: reads the legacy characterModifierMode rule key (read-time compat)', async () => {
      const services = createMockServices();
      const sys = services.getCraftingSystemManager().getSystem('sys1');
      sys.features = { gathering: true };
      services._store.gatheringConfig = {
        systems: { sys1: { rules: { characterModifierMode: 'multiplicative' } } },
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
              hazardVisibility: 'full',
            },
            tasks: [],
            events: [],
          },
        },
      };

      const store = createAdminStore(services);
      await store.selectSystem('sys1');

      const rules = get(store.viewState).gatheringConfig.systems.sys1.rules;
      assert.equal(
        rules.eventSelectionMode,
        'highestRankedDrop',
        'legacy hazardSelectionMode read'
      );
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
              {
                id: 'legacy-event',
                name: 'Wandering Pedlar',
                dropRate: 25,
                hazardModifier: { provider: 'macro', macroUuid: 'Macro.m' },
              },
            ],
          },
        },
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

      store.updateEnvironmentDraft({
        compositionMode: 'manual',
        taskOrder: ['t2', 't1', 't1'],
        eventOrder: ['h1'],
      });
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
      const environments = [
        {
          id: 'env-cave',
          craftingSystemId: 'sys1',
          name: 'Cave',
          biomes: ['cave'],
          compositionMode: 'automatic',
        },
      ];
      const services = createMockServices({
        getGatheringEnvironmentStore: () => ({
          list: () => environments,
          listBySystem: async () => environments,
        }),
      });
      const sys = services.getCraftingSystemManager().getSystem('sys1');
      sys.features = { gathering: true };
      services._store.gatheringConfig = {
        systems: {
          sys1: {
            tasks: [
              { id: 't-cave', name: 'Cave', biomes: ['cave'], dropRows: [] },
              { id: 't-desert', name: 'Desert', biomes: ['desert'], dropRows: [] },
            ],
            events: [],
          },
        },
      };
      const store = createAdminStore(services);
      await store.selectSystem('sys1');

      const listed = get(store.viewState).environments.find(
        (environment) => environment.id === 'env-cave'
      );
      assert.ok(listed, 'environment should be present in the view-state list');
      assert.equal(
        listed.availableTaskCount,
        undefined,
        'derived counts should not pollute the persisted environment object'
      );
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
              { id: 't-off', name: 'Disabled', enabled: false, biomes: ['cave'], dropRows: [] },
            ],
            events: [],
          },
        },
      };
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      await store.createEnvironmentDraft();
      store.updateEnvironmentDraft({ biomes: ['cave'], compositionMode: 'automatic' });

      let composition = get(store.viewState).environmentComposition;
      const byId = Object.fromEntries(composition.tasks.map((entry) => [entry.id, entry]));
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
      assert.equal(
        composition.tasks.find((entry) => entry.id === 't-cave').compositionState,
        'excluded'
      );
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
              { id: 't-desert', name: 'Desert', biomes: ['desert'], dropRows: [] },
            ],
            events: [],
          },
        },
      };
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      await store.createEnvironmentDraft();
      store.updateEnvironmentDraft({ biomes: ['cave'], compositionMode: 'manual' });

      let composition = get(store.viewState).environmentComposition;
      assert.equal(
        composition.tasks.find((entry) => entry.id === 't-cave').compositionState,
        'candidate'
      );

      store.includeEnvironmentRecord('task', 't-cave');
      let draft = get(store.viewState).environmentDraft;
      assert.ok(draft.enabledTaskIds.includes('t-cave'));
      assert.ok(draft.taskOrder.includes('t-cave'));
      composition = get(store.viewState).environmentComposition;
      const included = composition.tasks.find((entry) => entry.id === 't-cave');
      assert.equal(included.compositionState, 'explicitlyIncluded');
      assert.equal(included.runtimeState, 'available');

      store.excludeEnvironmentRecord('task', 't-cave');
      draft = get(store.viewState).environmentDraft;
      assert.ok(!draft.enabledTaskIds.includes('t-cave'));
      assert.ok(!draft.disabledTaskIds.includes('t-cave'));
      composition = get(store.viewState).environmentComposition;
      const removed = composition.tasks.find((entry) => entry.id === 't-cave');
      assert.equal(removed.compositionState, 'candidate');
      assert.equal(removed.runtimeState, 'unavailable');
      assert.equal(composition.counts.excludedTasks, 0);

      store.updateEnvironmentDraft({ disabledTaskIds: ['t-cave'] });
      composition = get(store.viewState).environmentComposition;
      const staleManualDisabled = composition.tasks.find((entry) => entry.id === 't-cave');
      assert.equal(staleManualDisabled.compositionState, 'candidate');
      assert.equal(staleManualDisabled.runtimeState, 'unavailable');
      assert.equal(composition.counts.excludedTasks, 0);

      store.forceIncludeEnvironmentRecord('task', 't-desert');
      draft = get(store.viewState).environmentDraft;
      assert.ok(draft.forcedTaskIds.includes('t-desert'));
      composition = get(store.viewState).environmentComposition;
      assert.equal(
        composition.tasks.find((entry) => entry.id === 't-desert').compositionState,
        'forceIncluded'
      );

      store.excludeEnvironmentRecord('task', 't-desert');
      draft = get(store.viewState).environmentDraft;
      assert.ok(!draft.forcedTaskIds.includes('t-desert'));
      assert.ok(!draft.disabledTaskIds.includes('t-desert'));
      composition = get(store.viewState).environmentComposition;
      const removedForced = composition.tasks.find((entry) => entry.id === 't-desert');
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
              { id: 'h-desert', name: 'Desert Event', biomes: ['desert'], dropRate: 25 },
            ],
          },
        },
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
      assert.equal(
        composition.events.find((entry) => entry.id === 'h-cave').compositionState,
        'candidate'
      );
      assert.equal(composition.counts.excludedEvents, 0);

      store.updateEnvironmentDraft({ disabledEventIds: ['h-cave'] });
      composition = get(store.viewState).environmentComposition;
      assert.equal(
        composition.events.find((entry) => entry.id === 'h-cave').compositionState,
        'candidate'
      );
      assert.equal(composition.counts.excludedEvents, 0);

      store.forceIncludeEnvironmentRecord('event', 'h-desert');
      store.excludeEnvironmentRecord('event', 'h-desert');
      const forcedDraft = get(store.viewState).environmentDraft;
      assert.ok(!forcedDraft.forcedEventIds.includes('h-desert'));
      assert.ok(!forcedDraft.disabledEventIds.includes('h-desert'));
      composition = get(store.viewState).environmentComposition;
      assert.equal(
        composition.events.find((entry) => entry.id === 'h-desert').compositionState,
        'notMatching'
      );
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
              {
                id: 'h-cave',
                name: 'Cave Event',
                biomes: ['cave'],
                dangerTags: ['hazardous'],
                dropRate: 25,
              },
              {
                id: 'h-gas',
                name: 'Gas Pocket',
                biomes: ['cave'],
                dangerTags: ['hazardous'],
                dropRate: 25,
              },
              {
                id: 'h-storm',
                name: 'Storm Event',
                biomes: ['cave'],
                dangerTags: ['hazardous'],
                weather: ['storm'],
                dropRate: 25,
              },
              {
                id: 'h-desert',
                name: 'Desert Storm',
                biomes: ['desert'],
                dangerTags: ['hazardous'],
                weather: ['storm'],
                dropRate: 25,
              },
            ],
          },
        },
      };
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      await store.createEnvironmentDraft();
      store.updateEnvironmentDraft({
        biomes: ['cave'],
        dangerLevel: 'hazardous',
        compositionMode: 'manual',
      });

      store.includeEnvironmentRecord('event', 'h-cave');
      store.includeEnvironmentRecord('event', 'h-gas');
      store.includeEnvironmentRecord('event', 'h-storm');
      store.forceIncludeEnvironmentRecord('event', 'h-desert');

      let composition = get(store.viewState).environmentComposition;
      assert.deepEqual(
        composition.events
          .filter((entry) =>
            ['explicitlyIncluded', 'forceIncluded'].includes(entry.compositionState)
          )
          .map((entry) => entry.id),
        ['h-cave', 'h-gas', 'h-storm', 'h-desert']
      );
      const conditionBlocked = composition.events.find((entry) => entry.id === 'h-storm');
      assert.equal(conditionBlocked.compositionState, 'explicitlyIncluded');
      assert.equal(conditionBlocked.runtimeState, 'unavailable');
      const forced = composition.events.find((entry) => entry.id === 'h-desert');
      assert.equal(forced.compositionState, 'forceIncluded');
      assert.equal(forced.runtimeState, 'unavailable');

      assert.equal(store.reorderEnvironmentRecord('event', 2, 0), true);

      let draft = get(store.viewState).environmentDraft;
      assert.deepEqual(draft.eventOrder, ['h-storm', 'h-cave', 'h-gas', 'h-desert']);
      composition = get(store.viewState).environmentComposition;
      assert.deepEqual(
        composition.events
          .filter((entry) =>
            ['explicitlyIncluded', 'forceIncluded'].includes(entry.compositionState)
          )
          .map((entry) => entry.id),
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
              {
                id: 'h-cave',
                name: 'Cave Event',
                biomes: ['cave'],
                dangerTags: ['hazardous'],
                dropRate: 25,
              },
              {
                id: 'h-desert',
                name: 'Desert Storm',
                biomes: ['desert'],
                dangerTags: ['hazardous'],
                dropRate: 25,
              },
            ],
          },
        },
      };
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      await store.createEnvironmentDraft();
      store.updateEnvironmentDraft({
        biomes: ['cave'],
        dangerLevel: 'hazardous',
        compositionMode: 'manual',
      });

      store.includeEnvironmentRecord('event', 'h-cave');
      store.forceIncludeEnvironmentRecord('event', 'h-desert');
      store.updateEnvironmentDraft({ biomes: ['desert'] });

      let composition = get(store.viewState).environmentComposition;
      const forced = composition.events.find((entry) => entry.id === 'h-desert');
      assert.equal(forced.matches, true);
      assert.equal(forced.compositionState, 'forceIncluded');
      assert.equal(forced.runtimeState, 'available');

      assert.equal(store.reorderEnvironmentRecord('event', 0, 1), true);
      const draft = get(store.viewState).environmentDraft;
      assert.deepEqual(draft.eventOrder, ['h-desert', 'h-cave']);
      composition = get(store.viewState).environmentComposition;
      assert.deepEqual(
        composition.events
          .filter((entry) =>
            [
              'includedByMatch',
              'explicitlyIncluded',
              'forceIncluded',
              'includedButUnavailable',
            ].includes(entry.compositionState)
          )
          .map((entry) => entry.id),
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
            events: [{ id: 'h-cave', name: 'Cave Event', biomes: ['cave'], dropRate: 25 }],
          },
        },
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
      assert.equal(
        composition.events.find((entry) => entry.id === 'h-cave').compositionState,
        'excluded'
      );
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
          list: () => [
            {
              id: 'env-used',
              name: 'Used Grove',
              craftingSystemId: 'sys1',
              region: 'north',
              biomes: ['forest'],
              dangerTags: ['hazardous'],
              enabledTaskIds: ['task-used'],
              enabledEventIds: ['event-used'],
            },
          ],
        }),
      });
      services._store.gatheringConfig = {
        conditions: { weather: 'clear', timeOfDay: 'day' },
        vocabularies: {
          regions: ['north'],
          biomes: ['forest'],
          danger: ['safe', 'hazardous'],
          weather: ['clear'],
          timeOfDay: ['day'],
        },
        systems: {
          sys1: {
            tasks: [
              {
                id: 'task-used',
                name: 'Used Task',
                region: 'north',
                biomes: ['forest'],
                dropRows: [],
              },
            ],
            events: [
              {
                id: 'event-used',
                name: 'Used Event',
                dangerTags: ['hazardous'],
                region: 'north',
                biomes: ['forest'],
                dropRate: 25,
              },
            ],
          },
        },
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
        getGatheringEnvironmentStore: () => ({ list: () => [] }),
      });
      services._store.gatheringConfig = {
        systems: {
          sys1: {
            tasks: [{ id: 'task-unused', name: 'Lone Task', dropRows: [] }],
            events: [{ id: 'event-unused', name: 'Lone Event', dropRate: 10 }],
          },
        },
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
        getGatheringEnvironmentStore: () => ({ list: () => [] }),
      });
      services._store.gatheringConfig = {
        systems: {
          sys1: {
            tasks: [{ id: 'task-unused', name: 'Lone Task', dropRows: [] }],
            events: [{ id: 'event-unused', name: 'Lone Event', dropRate: 10 }],
          },
        },
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
          list: () => [
            {
              id: 'env-used',
              name: 'Used Grove',
              craftingSystemId: 'sys1',
              region: 'north',
              biomes: ['forest'],
              dangerTags: ['hazardous'],
              enabledTaskIds: ['task-used'],
              enabledEventIds: ['event-used'],
            },
          ],
        }),
      });
      services._store.gatheringConfig = {
        conditions: { weather: 'clear', timeOfDay: 'day' },
        vocabularies: {
          regions: ['north'],
          biomes: ['forest'],
          danger: ['safe', 'hazardous'],
          weather: ['clear'],
          timeOfDay: ['day'],
        },
        systems: {
          sys1: {
            tasks: [
              {
                id: 'task-used',
                name: 'Used Task',
                region: 'north',
                biomes: ['forest'],
                dropRows: [],
              },
            ],
            events: [
              {
                id: 'event-used',
                name: 'Used Event',
                dangerTags: ['hazardous'],
                region: 'north',
                biomes: ['forest'],
                dropRate: 25,
              },
            ],
          },
        },
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
        })(),
      });
      const sys = services.getCraftingSystemManager().getSystem('sys1');
      sys.features = { gathering: true };
      services._store.gatheringConfig = {
        systems: {
          sys1: {
            characterModifiers: [
              {
                id: 'strength',
                label: 'Strength',
                icon: 'fa-solid fa-dumbbell',
                expression: '@abilities.str.mod',
              },
              {
                id: 'dexterity',
                label: 'Dexterity',
                icon: 'fa-solid fa-running',
                expression: '@abilities.dex.mod',
              },
            ],
            tasks: [
              {
                id: 'task-iron',
                name: 'Iron Vein',
                dropRows: [{ id: 'row-iron', componentId: 'iron', quantity: 1, dropRate: 50 }],
              },
            ],
            events: [{ id: 'event-cave-in', name: 'Cave-in', dropRate: 25 }],
          },
        },
      };
      const store = createAdminStore(services);
      await store.selectSystem('sys1');

      const dropRef = await store.addGatheringDropRowCharacterModifier(
        'sys1',
        'task-iron',
        'row-iron'
      );
      assert.ok(dropRef, 'drop ref was created');
      assert.equal(dropRef.modifierId, 'strength');
      assert.equal(dropRef.operator, '+');
      assert.equal(
        'mode' in dropRef,
        false,
        'new drop ref carries no per-reference mode (issue 299)'
      );
      let task = services._store.gatheringConfig.systems.sys1.tasks[0];
      assert.equal(task.dropRows[0].characterModifiers.length, 1);
      assert.equal(task.dropRows[0].characterModifiers[0].id, dropRef.id);

      const updated = await store.updateGatheringDropRowCharacterModifier(
        'sys1',
        'task-iron',
        'row-iron',
        dropRef.id,
        {
          modifierId: 'dexterity',
          operator: '-',
          mode: 'multiplicative',
          min: -2,
          max: 5,
          expressionOverride: '1d4 + @abilities.dex.mod',
        }
      );
      assert.equal(updated, true);
      task = services._store.gatheringConfig.systems.sys1.tasks[0];
      assert.equal(task.dropRows[0].characterModifiers[0].modifierId, 'dexterity');
      assert.equal(task.dropRows[0].characterModifiers[0].operator, '-');
      assert.equal(
        'mode' in task.dropRows[0].characterModifiers[0],
        false,
        'a stray mode partial is dropped on normalization (issue 299)'
      );
      assert.equal(task.dropRows[0].characterModifiers[0].min, -2);
      assert.equal(task.dropRows[0].characterModifiers[0].max, 5);
      assert.equal(
        task.dropRows[0].characterModifiers[0].expressionOverride,
        '1d4 + @abilities.dex.mod'
      );

      const eventRef = await store.addGatheringEventCharacterModifier('sys1', 'event-cave-in', {
        modifierId: 'strength',
        operator: '-',
      });
      assert.ok(eventRef, 'event ref was created');
      assert.equal(eventRef.modifierId, 'strength');
      assert.equal(eventRef.operator, '-');
      assert.equal(
        'mode' in eventRef,
        false,
        'new event ref carries no per-reference mode (issue 299)'
      );
      let event = services._store.gatheringConfig.systems.sys1.events[0];
      assert.equal(event.characterModifiers.length, 1);
      assert.equal(event.characterModifiers[0].id, eventRef.id);

      const eventUpdated = await store.updateGatheringEventCharacterModifier(
        'sys1',
        'event-cave-in',
        eventRef.id,
        {
          expressionOverride: '1d6 + @abilities.con.mod',
        }
      );
      assert.equal(eventUpdated, true);
      event = services._store.gatheringConfig.systems.sys1.events[0];
      assert.equal(event.characterModifiers[0].expressionOverride, '1d6 + @abilities.con.mod');

      const dropDeleted = await store.deleteGatheringDropRowCharacterModifier(
        'sys1',
        'task-iron',
        'row-iron',
        dropRef.id
      );
      assert.equal(dropDeleted, true);
      task = services._store.gatheringConfig.systems.sys1.tasks[0];
      assert.equal(task.dropRows[0].characterModifiers.length, 0);

      const eventDeleted = await store.deleteGatheringEventCharacterModifier(
        'sys1',
        'event-cave-in',
        eventRef.id
      );
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
            characterModifiers: [
              { id: 'strength', label: 'Strength', icon: '', expression: '@abilities.str.mod' },
            ],
            tasks: [
              { id: 'task-iron', name: 'Iron', dropRows: [{ id: 'row-iron', dropRate: 50 }] },
            ],
            events: [],
          },
        },
      };
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      assert.equal(
        await store.addGatheringDropRowCharacterModifier('sys1', 'unknown-task', 'row-iron'),
        null
      );
      assert.equal(
        await store.addGatheringDropRowCharacterModifier('sys1', 'task-iron', 'unknown-row'),
        null
      );
      assert.equal(await store.addGatheringEventCharacterModifier('sys1', 'unknown-event'), null);
    });

    it('viewState.selectedSystem.craftingCheck.outcomesText is comma-separated string from outcomes array', async () => {
      const services = createMockServices();
      const origManager = services.getCraftingSystemManager();
      const sys = origManager.getSystem('sys1');
      if (sys) {
        sys.craftingCheck = {
          mode: 'namedOutcomes',
          macroUuid: 'uuid',
          outcomes: ['critical', 'success', 'failure'],
        };
      }
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      const vs = get(store.viewState);
      assert.equal(vs.selectedSystem?.craftingCheck.outcomesText, 'critical, success, failure');
    });

    it('viewState.selectedSystem.availableScriptMacros reflects getScriptMacros()', async () => {
      const macros = [
        { uuid: 'm1', name: 'My Macro' },
        { uuid: 'm2', name: 'Other' },
      ];
      const services = createMockServices({
        getScriptMacros: () => macros,
      });
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      const vs = get(store.viewState);
      assert.deepEqual(vs.selectedSystem?.availableScriptMacros, macros);
    });

    it('viewState.selectedSystem exposes injected scene picker options', async () => {
      const sceneOptions = [{ uuid: 'Scene.forest', name: 'Forest', img: 'forest.webp' }];
      const services = createMockServices({
        getSceneOptions: () => sceneOptions,
      });
      const store = createAdminStore(services);

      await store.selectSystem('sys1');

      const selectedSystem = get(store.viewState).selectedSystem;
      assert.deepEqual(selectedSystem?.sceneOptions, sceneOptions);
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
          'id',
          'name',
          'img',
          'description',
          'category',
          'enabled',
          'locked',
          'recipeItemId',
          'isSimple',
          'visibilitySummary',
          'stepCount',
          'resultGroupCount',
          'ingredientCount',
          'toolCount',
          'structureKey',
          'structureLabel',
          'requirementsPreview',
          'ingredients',
          'tools',
        ]) {
          assert.ok(field in recipe, `recipe entry should have field: ${field}`);
        }
      }
    });

    it('viewState.recipes entries project the raw visibility object for the restriction editor', async () => {
      const services = createMockServices();
      const origManager = services.getRecipeManager();
      const visibility = { restricted: true, allowedUserIds: ['u1', 'u2'] };
      services.getRecipeManager = () => ({
        ...origManager,
        getRecipes: (filter) =>
          [makeRecipe({ id: 'r1', name: 'VIP', craftingSystemId: 'sys1', visibility })].filter(
            (r) => !filter?.craftingSystemId || r.craftingSystemId === filter.craftingSystemId
          ),
        getRecipe: () => null,
      });
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      const vs = get(store.viewState);
      const r = vs.recipes.find((row) => row.id === 'r1');
      assert.ok(r, 'the recipe row is present');
      assert.ok('visibility' in r, 'the row projects a visibility field');
      assert.deepEqual(r.visibility, visibility, 'the raw visibility object flows through toJSON');
    });

    it('viewState.recipes visibility is null when the recipe has no visibility object', async () => {
      const services = createMockServices();
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      const vs = get(store.viewState);
      assert.ok(vs.recipes.length > 0, 'at least one recipe');
      assert.equal(vs.recipes[0].visibility, null, 'absent visibility projects as null');
    });

    it('viewState.worldUsers exposes non-GM users from the getWorldUsers service', async () => {
      const worldUsers = [
        { id: 'u1', name: 'Alice' },
        { id: 'u2', name: 'Bob' },
      ];
      const services = createMockServices({ getWorldUsers: () => worldUsers });
      const store = createAdminStore(services);
      await store.refresh();
      assert.deepEqual(get(store.viewState).worldUsers, worldUsers);
    });

    it('viewState.worldUsers defaults to an empty array when the service is absent', async () => {
      const services = createMockServices();
      const store = createAdminStore(services);
      await store.refresh();
      assert.deepEqual(get(store.viewState).worldUsers, []);
    });

    it('refreshAccessRosters re-projects BOTH access rosters without a full refresh', async () => {
      // The user-only `refreshWorldUsers` is gone: the two rosters move together (the
      // same user and actor CRUD changes both), so the app wires one helper to both
      // hook families. A players-only refresh would leave `controlledBy` — which derives
      // from `actor.ownership` — stale.
      let users = [{ id: 'u1', name: 'Alice' }];
      let characters = [{ id: 'a1', name: 'Vex', controlledBy: [] }];
      const services = createMockServices({
        getWorldUsers: () => users,
        getAccessCharacterActors: () => characters,
      });
      const store = createAdminStore(services);
      await store.refresh();
      assert.deepEqual(get(store.viewState).worldUsers, [{ id: 'u1', name: 'Alice' }]);
      assert.equal(get(store.viewState).accessCharacters.length, 1);

      users = [
        { id: 'u1', name: 'Alice' },
        { id: 'u2', name: 'Bob' },
      ];
      characters = [{ id: 'a1', name: 'Vex', controlledBy: [{ id: 'u2', name: 'Bob' }] }];
      store.refreshAccessRosters();

      assert.deepEqual(get(store.viewState).worldUsers, users);
      assert.deepEqual(get(store.viewState).accessCharacters[0].controlledBy, [
        { id: 'u2', name: 'Bob' },
      ]);
      assert.equal(store.refreshWorldUsers, undefined, 'the dead users-only helper is gone');
    });

    it('viewState.experimentalFeaturesEnabled mirrors the world setting', async () => {
      const services = createMockServices({
        getSetting: (key) => (key === 'experimentalFeatures' ? true : ''),
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
            ingredientSets: [
              {
                id: 'set-herbs',
                ingredientGroups: [
                  { id: 'group-herb', options: [{ componentId: 'mint' }, { componentId: 'sage' }] },
                  { id: 'group-water', options: [{ componentId: 'water' }] },
                ],
                toolIds: ['mortar'],
              },
            ],
            resultGroups: [{ id: 'mix-success' }, { id: 'mix-critical' }],
          },
          {
            id: 'step-finish',
            name: 'Finish',
            ingredientSets: [
              {
                id: 'set-finish',
                ingredients: [{ componentId: 'ash' }, { componentId: 'salt' }],
                toolIds: ['filter', 'vial'],
              },
            ],
            resultGroups: [{ id: 'finish-success' }],
          },
        ],
        isSimpleRecipe: () => false,
        getExecutionSteps() {
          return this.steps;
        },
      });

      services.getRecipeManager = () => ({
        ...origManager,
        getRecipes: (filter) =>
          [multiStepRecipe].filter(
            (r) => !filter?.craftingSystemId || r.craftingSystemId === filter.craftingSystemId
          ),
      });

      const store = createAdminStore(services);
      await store.selectSystem('sys1');

      const recipe = get(store.viewState).recipes.find((r) => r.id === 'r-multi');
      assert.ok(recipe, 'multi-step recipe should be present');
      assert.equal(recipe.description, 'Brew in two phases.');
      assert.equal(recipe.stepCount, 2);
      assert.equal(recipe.resultGroupCount, 3);
      assert.equal(recipe.ingredientCount, 5);
      assert.equal(recipe.toolCount, 6);
      assert.equal(recipe.structureKey, 'multiStep');
      assert.equal(recipe.structureLabel, 'Multi-step');
      assert.equal(
        recipe.ingredients.length,
        5,
        'legacy ingredients array should track derived count'
      );
      assert.equal(recipe.tools.length, 6, 'tools array should track derived count');
      assert.deepEqual(recipe.requirementsPreview, [
        {
          id: 'step-mix',
          name: 'Mix',
          ingredientSetCount: 1,
          ingredientCount: 3,
          toolCount: 3,
          resultGroupCount: 2,
          resultItemCount: 0,
          hasAlternatives: false,
          ingredientSetSummaries: [
            {
              id: 'set-herbs',
              name: 'Set 1',
              ingredientCount: 3,
              toolCount: 1,
            },
          ],
        },
        {
          id: 'step-finish',
          name: 'Finish',
          ingredientSetCount: 1,
          ingredientCount: 2,
          toolCount: 3,
          resultGroupCount: 1,
          resultItemCount: 0,
          hasAlternatives: false,
          ingredientSetSummaries: [
            {
              id: 'set-finish',
              name: 'Set 1',
              ingredientCount: 2,
              toolCount: 2,
            },
          ],
        },
      ]);
    });

    it('viewState.recipes falls back to recipe-level ingredientSets and preserves alternatives for requirementsPreview', async () => {
      const services = createMockServices();
      const origManager = services.getRecipeManager();
      const fallbackRecipe = makeRecipe({
        id: 'r-single',
        name: 'Fallback Stew',
        craftingSystemId: 'sys1',
        ingredientSets: [
          {
            id: 'set-main',
            ingredientGroups: [
              { id: 'group-main', options: [{ componentId: 'root' }, { componentId: 'mushroom' }] },
            ],
            toolIds: ['pot'],
          },
          {
            id: 'set-alt',
            ingredients: [
              { componentId: 'fish' },
              { componentId: 'salt' },
              { componentId: 'herb' },
            ],
            toolIds: [],
          },
        ],
        resultGroups: [{ id: 'success' }, { id: 'bonus' }],
        toolIds: ['ladle'],
      });

      services.getRecipeManager = () => ({
        ...origManager,
        getRecipes: (filter) =>
          [fallbackRecipe].filter(
            (r) => !filter?.craftingSystemId || r.craftingSystemId === filter.craftingSystemId
          ),
      });

      const store = createAdminStore(services);
      await store.selectSystem('sys1');

      const recipe = get(store.viewState).recipes.find((r) => r.id === 'r-single');
      assert.ok(recipe, 'fallback recipe should be present');
      assert.equal(recipe.stepCount, 1);
      assert.equal(recipe.resultGroupCount, 2);
      assert.equal(recipe.ingredientCount, 3);
      assert.equal(recipe.toolCount, 2);
      assert.equal(recipe.structureKey, 'simple');
      assert.deepEqual(recipe.requirementsPreview, [
        {
          id: 'implicit-step',
          name: 'Step 1',
          ingredientSetCount: 2,
          ingredientCount: 3,
          toolCount: 2,
          resultGroupCount: 2,
          resultItemCount: 0,
          hasAlternatives: true,
          ingredientSetSummaries: [
            {
              id: 'set-main',
              name: 'Set 1',
              ingredientCount: 2,
              toolCount: 1,
            },
            {
              id: 'set-alt',
              name: 'Set 2',
              ingredientCount: 3,
              toolCount: 0,
            },
          ],
        },
      ]);
    });

    it('surfaces recipe routing fields (resultSelection, checkTierId, checkOutcomeIds) in the view state', async () => {
      const services = createMockServices();
      const origManager = services.getRecipeManager();
      const routedRecipe = makeRecipe({
        id: 'r-routed',
        craftingSystemId: 'sys1',
        // The routing mode and check-tier live at the top level; the projection
        // must carry them through or the editor loses them on reload.
        toJSON: () => ({
          id: 'r-routed',
          name: 'Routed',
          craftingSystemId: 'sys1',
          resultSelection: { provider: 'check', macroUuid: null, rollTableUuid: null },
          checkTierId: 'tier-x',
          resultGroups: [{ id: 'g1', name: 'G1', checkOutcomeIds: ['t-a'], results: [] }],
          ingredientSets: [],
        }),
      });
      services.getRecipeManager = () => ({
        ...origManager,
        getRecipes: (filter) =>
          [routedRecipe].filter(
            (r) => !filter?.craftingSystemId || r.craftingSystemId === filter.craftingSystemId
          ),
      });

      const store = createAdminStore(services);
      await store.selectSystem('sys1');

      const recipe = get(store.viewState).recipes.find((r) => r.id === 'r-routed');
      assert.ok(recipe, 'routed recipe should be present');
      assert.equal(
        recipe.resultSelection.provider,
        'check',
        'routing mode survives the projection'
      );
      assert.equal(recipe.checkTierId, 'tier-x');
      assert.deepEqual(recipe.resultGroups[0].checkOutcomeIds, ['t-a']);
    });

    it('viewState.recipeCategories groups recipes by category with counts', async () => {
      const services = createMockServices();
      const origManager = services.getRecipeManager();
      services.getRecipeManager = () => ({
        ...origManager,
        getRecipes: (filter) => {
          const all = [
            makeRecipe({
              id: 'r1',
              name: 'Healing Potion',
              category: 'potions',
              craftingSystemId: 'sys1',
            }),
            makeRecipe({
              id: 'r2',
              name: 'Mana Potion',
              category: 'potions',
              craftingSystemId: 'sys1',
            }),
            makeRecipe({
              id: 'r3',
              name: 'Iron Sword',
              category: 'weapons',
              craftingSystemId: 'sys1',
            }),
          ];
          return filter?.craftingSystemId
            ? all.filter((r) => r.craftingSystemId === filter.craftingSystemId)
            : all;
        },
      });
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      const vs = get(store.viewState);
      const potions = vs.recipeCategories.find((c) => c.name === 'potions');
      const weapons = vs.recipeCategories.find((c) => c.name === 'weapons');
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
        getRecipes: (filter) =>
          [
            makeRecipe({
              id: 'r1',
              name: 'Open',
              craftingSystemId: 'sys1',
              visibility: { restricted: false },
            }),
          ].filter(
            (r) => !filter?.craftingSystemId || r.craftingSystemId === filter.craftingSystemId
          ),
        getRecipe: (id) =>
          id === 'r1'
            ? makeRecipe({
                id: 'r1',
                name: 'Open',
                craftingSystemId: 'sys1',
                visibility: { restricted: false },
              })
            : null,
      });
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      const vs = get(store.viewState);
      const r = vs.recipes.find((r) => r.id === 'r1');
      assert.equal(r?.visibilitySummary, 'All players');
    });

    it('_visibilitySummary returns "Restricted (none selected)" for restricted recipe with empty allowedUserIds', async () => {
      const services = createMockServices();
      const origManager = services.getRecipeManager();
      services.getRecipeManager = () => ({
        ...origManager,
        getRecipes: (filter) =>
          [
            makeRecipe({
              id: 'r1',
              name: 'VIP',
              craftingSystemId: 'sys1',
              visibility: { restricted: true, allowedUserIds: [] },
            }),
          ].filter(
            (r) => !filter?.craftingSystemId || r.craftingSystemId === filter.craftingSystemId
          ),
        getRecipe: () => null,
      });
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      const vs = get(store.viewState);
      const r = vs.recipes.find((r) => r.id === 'r1');
      assert.equal(r?.visibilitySummary, 'Restricted (none selected)');
    });

    it('_visibilitySummary returns "Restricted (N)" for restricted recipe with N allowed users', async () => {
      const services = createMockServices();
      const origManager = services.getRecipeManager();
      services.getRecipeManager = () => ({
        ...origManager,
        getRecipes: (filter) =>
          [
            makeRecipe({
              id: 'r1',
              name: 'VIP',
              craftingSystemId: 'sys1',
              visibility: { restricted: true, allowedUserIds: ['u1', 'u2'] },
            }),
          ].filter(
            (r) => !filter?.craftingSystemId || r.craftingSystemId === filter.craftingSystemId
          ),
        getRecipe: () => null,
      });
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      const vs = get(store.viewState);
      const r = vs.recipes.find((r) => r.id === 'r1');
      assert.equal(r?.visibilitySummary, 'Restricted (2)');
    });

    it('viewState.hasSystem is false and selectedSystem is null when no systems exist', async () => {
      const services = createMockServices();
      const origManager = services.getCraftingSystemManager();
      services.getCraftingSystemManager = () => ({
        ...origManager,
        getSystems: () => [],
        getSystem: () => null,
        getItems: () => [],
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
      if (sys)
        sys.items = [makeItem({ id: 'i1', name: 'Herb' }), makeItem({ id: 'i2', name: 'Salt' })];
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
          {
            id: 'ess-fire',
            name: 'Fire',
            description: '',
            icon: 'fas fa-fire',
            sourceItemUuid: null,
          },
          { id: 'ess-shadow', name: 'Shadow', description: '', icon: '', sourceItemUuid: null },
        ];
        sys.components = [
          makeItem({
            id: 'comp-1',
            name: 'Blazing Herb',
            description: ' Hot enough to scorch your fingers. ',
            registeredItemUuid: 'Item.live-123',
            originItemUuid: 'Compendium.source.items.blazing-herb',
            tags: ['fire'],
            essences: { 'ess-fire': 2, 'ess-shadow': 1 },
            salvage: {
              enabled: true,
              ingredientQuantity: 3,
              toolIds: ['knife'],
              resultGroups: [{ id: 'grp-1', results: [] }],
              timeRequirement: { seconds: 60 },
              currencyRequirement: { amount: 5 },
              outcomeRouting: { success: 'grp-1' },
            },
          }),
        ];
        delete sys.items;
      }
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      const vs = get(store.viewState);
      const card = vs.itemCards[0];

      assert.equal(card.description, 'Hot enough to scorch your fingers.');
      assert.equal(card.hasDescription, true);
      assert.equal(card.registeredItemUuidDisplay, 'Compendium.source.items.blazing-herb');
      assert.equal(card.hasRegisteredItemUuid, true);
      assert.equal(card.sourceOrigin, 'compendium');
      assert.equal(card.sourceOriginLabel, 'Compendium');
      assert.equal(card.sourceMissing, false);
      assert.deepEqual(card.tags, ['fire']);
      assert.deepEqual(card.essences, [
        { id: 'ess-fire', name: 'Fire', icon: 'fas fa-fire', quantity: 2 },
        { id: 'ess-shadow', name: 'Shadow', icon: 'fas fa-mortar-pestle', quantity: 1 },
      ]);
      assert.deepEqual(card.salvageSummary, {
        quantityRequired: 3,
        toolCount: 1,
        resultGroupCount: 1,
        hasTimeRequirement: true,
        hasCurrencyRequirement: true,
        outcomeCount: 1,
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
            description: { value: '<p>Bright <strong>moonlit</strong> leaves.</p>' },
          }),
          makeItem({
            id: 'comp-unknown-description',
            name: 'Voidbloom',
            description: { unexpected: 'shape' },
          }),
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

    // -----------------------------------------------------------------------
    // Issue 800 — read-side precedence. Descriptions are RESOLVED at write time,
    // so the store reads the STORED value first and only falls back to the live
    // document (enriching it) when the stored value is empty.
    // -----------------------------------------------------------------------

    /**
     * Seed `sys1` with a single component and drive a refresh, with `fromUuid` and the
     * `enrichToHtml` seam stubbed. Returns the projected card plus the enrich calls.
     */
    async function itemCardFor(component, { liveDoc = null } = {}) {
      const services = createMockServices();
      const enrichCalls = [];
      services.enrichToHtml = async (raw, options) => {
        enrichCalls.push({ raw, options });
        return `<a class="content-link">Component Pouch</a>`;
      };
      const sys = services.getCraftingSystemManager().getSystem('sys1');
      sys.components = [makeItem(component)];
      delete sys.items;

      const originalFromUuid = globalThis.fromUuid;
      globalThis.fromUuid = async () => liveDoc;
      try {
        const store = createAdminStore(services);
        await store.selectSystem('sys1');
        return { card: get(store.viewState).itemCards[0], enrichCalls };
      } finally {
        globalThis.fromUuid = originalFromUuid;
      }
    }

    it('itemCards prefer a NON-EMPTY stored description over a differing live document (issue 800)', async () => {
      const { card, enrichCalls } = await itemCardFor(
        {
          id: 'comp-stored',
          name: 'Alchemist’s Supplies',
          registeredItemUuid: 'Compendium.dnd5e.equipment24.Item.supplies',
          description: REPORTER_RESOLVED_EXPECTED,
        },
        { liveDoc: { system: { description: { value: 'Something else entirely.' } } } }
      );

      assert.equal(card.description, REPORTER_RESOLVED_EXPECTED);
      assert.equal(
        enrichCalls.length,
        0,
        'statement form is load-bearing: `(await enriched) || stored` would re-introduce ' +
          'the per-component enrichHTML call this flip exists to avoid'
      );
    });

    it('itemCards fall back to the ENRICHED live document when the stored description is empty (issue 800)', async () => {
      // The issue 676 population — a compendium-linked component with no stored
      // description — is exactly the population whose live text carries raw
      // directives, so a non-enriching fallback would leave the reported bug visible
      // here until a GM ran Repair.
      const { card, enrichCalls } = await itemCardFor(
        {
          id: 'comp-empty',
          name: 'Alchemist’s Supplies',
          registeredItemUuid: 'Compendium.dnd5e.equipment24.Item.supplies',
          description: '',
        },
        { liveDoc: { system: { description: { value: REPORTER_ENRICHER_DESCRIPTION } } } }
      );

      assert.equal(card.description, 'Component Pouch');
      // A refresh publishes view state in two phases, so the projection may be built
      // more than once; what matters is that the fallback resolves at all (the
      // stored-first test above pins the ZERO-call case).
      assert.ok(enrichCalls.length >= 1, 'the live fallback resolves');
      assert.equal(enrichCalls[0].raw, REPORTER_ENRICHER_DESCRIPTION);
      assert.ok(
        enrichCalls[0].options?.relativeTo,
        'relativeTo must be passed on the live path too, or a description that resolved ' +
          'at ingestion goes broken on this fallback'
      );
    });

    it('every read surface forwards the STORED string unchanged (issue 800 cross-caller invariant)', async () => {
      // The cross-caller invariant in its new form. Its old form asserted that three
      // surfaces produced identical FLATTENED output; the flatten is gone, so what must
      // now hold across surfaces is that a STORED (already-resolved) description is
      // forwarded byte-for-byte, with no surface resolving or rewriting it.
      const stored = REPORTER_RESOLVED_EXPECTED;
      const { card } = await itemCardFor({
        id: 'comp-forward',
        name: 'Alchemist’s Supplies',
        description: stored,
      });
      assert.equal(card.description, stored, 'adminStore projection');

      const manager = new CraftingSystemManager({ getRecipes: () => [] });
      assert.equal(
        manager._normalizeComponentDescription(stored),
        stored,
        'CraftingSystemManager sync normalizer'
      );

      const builder = new InventoryListingBuilder({
        recipeManager: { getRecipes: () => [], toolMatchesItem: () => false },
        craftingSystemManager: {
          getSystems: () => [
            {
              id: 'sys-x',
              name: 'Alchemy',
              components: [{ id: 'cx', name: 'Supplies', description: stored }],
            },
          ],
        },
        localize: (key) => key,
        nowWorldTime: () => 0,
      });
      const listing = builder.buildListing({
        craftingActor: {
          id: 'a1',
          name: 'Akra',
          img: 'icons/a1.webp',
          items: [{ name: 'Supplies', system: { quantity: 1 } }],
        },
      });
      assert.equal(
        listing.rows.find((row) => row.componentId === 'cx' && !row.isEssenceSource)?.description,
        stored,
        'InventoryListingBuilder buildListing row'
      );
    });

    it('read surfaces DIVERGE on an un-repaired labelled directive, and that is the real contract (issue 800)', async () => {
      // The test above passes for a resolved string, but a resolved string is already
      // plain text — so normalization is a no-op there and it would pass identically if
      // the surfaces diverged wildly. This case uses a LABELLED directive, where they
      // genuinely differ, so the contract is pinned rather than merely asserted.
      //
      // `adminStore` and the manager's sync normalizer both run `plainTextDescription`,
      // whose retained mop-up renders the label; `InventoryListingBuilder` forwards the
      // stored string untouched. The consequence is real and worth seeing: until a GM
      // runs Repair Item Data, the SAME component reads "Acid" in the manager and
      // "@UUID[…]{Acid}" in a player's inventory. Repair converges them, which is why
      // it — not a wider read-side rewrite — is the fix.
      const labelled = '@UUID[Compendium.dnd5e.items.Item.acid00]{Acid}';

      const { card } = await itemCardFor({
        id: 'comp-labelled',
        name: 'Alchemist’s Supplies',
        description: labelled,
      });
      assert.equal(card.description, 'Acid', 'adminStore normalizes: the mop-up renders the label');

      const manager = new CraftingSystemManager({ getRecipes: () => [] });
      assert.equal(
        manager._normalizeComponentDescription(labelled),
        'Acid',
        'the manager normalizer agrees with adminStore'
      );

      const builder = new InventoryListingBuilder({
        recipeManager: { getRecipes: () => [], toolMatchesItem: () => false },
        craftingSystemManager: {
          getSystems: () => [
            {
              id: 'sys-x',
              name: 'Alchemy',
              components: [{ id: 'cx', name: 'Supplies', description: labelled }],
            },
          ],
        },
        localize: (key) => key,
        nowWorldTime: () => 0,
      });
      const listing = builder.buildListing({
        craftingActor: {
          id: 'a1',
          name: 'Akra',
          img: 'icons/a1.webp',
          items: [{ name: 'Supplies', system: { quantity: 1 } }],
        },
      });
      assert.equal(
        listing.rows.find((row) => row.componentId === 'cx' && !row.isEssenceSource)?.description,
        labelled,
        'the inventory listing forwards the stored string VERBATIM and resolves nothing'
      );
    });

    // -----------------------------------------------------------------------
    // Issue 148 — per-store item-card memo. Unchanged components skip their
    // per-item `fromUuid`/`enrichHTML` on refresh; a signature over the WHOLE
    // stored item plus the external flags (`showTags`/`showEssences`/`showSalvage`)
    // and resolved essence catalog invalidates only what actually changed.
    // -----------------------------------------------------------------------

    /**
     * Seed `sys1` with `components`, instrument `globalThis.fromUuid` with a call
     * counter, create the store, and run `body` with a `count()` reader and a
     * `reset()`. Restores `fromUuid` afterwards. Shared by the memo tests so the
     * seam swap is written once (Sonar new-code duplication).
     */
    async function withMemoStore(components, servicesOverrides, body) {
      const services = createMockServices(servicesOverrides);
      const sys = services.getCraftingSystemManager().getSystem('sys1');
      sys.components = components;
      delete sys.items;
      let calls = 0;
      const originalFromUuid = globalThis.fromUuid;
      globalThis.fromUuid = async () => {
        calls += 1;
        return {};
      };
      try {
        const store = createAdminStore(services);
        await store.selectSystem('sys1');
        return await body({
          store,
          sys,
          count: () => calls,
          reset: () => {
            calls = 0;
          },
        });
      } finally {
        globalThis.fromUuid = originalFromUuid;
      }
    }

    it('memoizes item cards: a single-component edit re-resolves 1, a no-op refresh re-resolves 0 (issue 148)', async () => {
      const components = Array.from({ length: 75 }, (_, i) =>
        makeItem({
          id: `comp-${i}`,
          name: `Component ${i}`,
          registeredItemUuid: `Item.live-${i}`,
          description: '',
        })
      );
      await withMemoStore(components, undefined, async ({ store, sys, count, reset }) => {
        // Baseline: every one of the 75 components forces a source resolution.
        assert.ok(count() >= 75, `initial selectSystem resolves all components (got ${count()})`);

        // Mutate exactly ONE component (new object, same id, changed name).
        reset();
        sys.components = sys.components.map((item, i) =>
          i === 0 ? makeItem({ ...item, name: 'Component 0 EDITED' }) : item
        );
        await store.refresh();
        assert.equal(count(), 1, 'only the edited component re-resolves — not O(all)');

        // A no-op refresh (nothing changed) hits the cache for every card.
        reset();
        await store.refresh();
        assert.equal(count(), 0, 'an unchanged same-system refresh resolves nothing');
      });
    });

    it('stale-card guard: editing ONLY a component category yields a fresh card with the new category (issue 148)', async () => {
      // `category` is not read by `fromUuid`, so a hand-enumerated signature subset
      // (name/description/tags/essences) would leave the signature unchanged and serve
      // a STALE card. The whole-item serialization catches it.
      const components = [makeItem({ id: 'comp-cat', name: 'Herb', category: 'herbs' })];
      await withMemoStore(components, undefined, async ({ store, sys }) => {
        assert.equal(get(store.viewState).itemCards[0].category, 'herbs');

        sys.components = [makeItem({ id: 'comp-cat', name: 'Herb', category: 'potions' })];
        await store.refresh();
        assert.equal(
          get(store.viewState).itemCards[0].category,
          'potions',
          'the whole-item signature invalidates on a category-only edit'
        );
      });
    });

    it('salvage toggle refreshes every card salvageSummary (issue 148)', async () => {
      // `showSalvage = features.salvage` is neither an item field nor a system-id
      // change, so it lives IN the signature: flipping it must miss every card.
      const salvage = {
        enabled: true,
        ingredientQuantity: 2,
        toolIds: ['hammer'],
        resultGroups: [],
        outcomeRouting: {},
      };
      const components = [
        makeItem({ id: 'ore-a', name: 'Ore A', salvage }),
        makeItem({ id: 'ore-b', name: 'Ore B', salvage }),
      ];
      await withMemoStore(components, undefined, async ({ store, sys }) => {
        sys.features = { salvage: false };
        await store.refresh();
        for (const card of get(store.viewState).itemCards) {
          assert.equal(card.salvageSummary, null, 'salvage off → no summary');
        }

        sys.features = { salvage: true };
        await store.refresh();
        for (const card of get(store.viewState).itemCards) {
          assert.ok(card.salvageSummary, 'salvage on → every card gains a summary');
          assert.equal(card.salvageSummary.quantityRequired, 2);
        }
      });
    });

    it('two-phase publish: the settled selectedSystem is a NEW reference carrying enriched recipeItemDefinitions (issue 148 invariant)', async () => {
      // The memo must not touch `selectedSystem`: phase-2 still builds a NEW
      // selectedSystemData object, or Svelte's `$derived` never re-propagates the
      // enriched Books & Scrolls projection.
      const services = createMockServices();
      const sys = services.getCraftingSystemManager().getSystem('sys1');
      sys.recipeItemDefinitions = [
        { id: 'def-1', name: 'Tome', originItemUuid: '', recipeIds: [] },
      ];

      const store = createAdminStore(services);
      const captured = [];
      const unsub = store.viewState.subscribe((vs) => {
        if (vs.selectedSystem) captured.push(vs.selectedSystem);
      });
      await store.selectSystem('sys1');
      unsub();

      const phase1 = captured[0];
      const settled = get(store.viewState).selectedSystem;
      assert.ok(phase1, 'phase-1 publishes a selectedSystem');
      assert.notEqual(
        phase1,
        settled,
        'phase-2 selectedSystem must be a different reference for $derived to re-propagate'
      );
      assert.ok(
        Array.isArray(settled.recipeItemDefinitions),
        'the settled reference carries the enriched recipeItemDefinitions'
      );
    });

    it('viewState.selectedSystem projects componentCategories, independently of categories (issue 676)', async () => {
      // AC6 clause 3. This hand-built projection is an ALLOWLIST, and its failure mode
      // is silent: without the line, the Tags & Categories screen's component-categories
      // section is permanently EMPTY however correctly the normalizer and the write path
      // behave. A NON-EMPTY fixture is the point — an `|| []` fallback or a stubbed-out
      // line reads green against an empty one.
      const services = createMockServices();
      const origManager = services.getCraftingSystemManager();
      const sys = origManager.getSystem('sys1');
      if (sys) {
        sys.categories = ['Potions'];
        sys.componentCategories = ['Reagent', 'Metal'];
      }

      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      const vs = get(store.viewState);

      assert.deepEqual(vs.selectedSystem.componentCategories, ['Reagent', 'Metal']);
      // The two vocabularies are SIBLINGS and must never cross-populate: reuse would
      // have leaked component categories into the Recipe Studio's filter and vice versa.
      assert.deepEqual(vs.selectedSystem.categories, ['Potions']);
      assert.ok(!vs.selectedSystem.categories.includes('Reagent'));
      assert.ok(!vs.selectedSystem.componentCategories.includes('Potions'));
    });

    it('viewState.selectedSystem.componentCategories defaults to an empty array', async () => {
      const services = createMockServices();
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      assert.deepEqual(get(store.viewState).selectedSystem.componentCategories, []);
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
            description: { value: '<p>Bright <strong>ember</strong> leaf.</p>' },
          }),
          makeItem({
            id: 'comp-2',
            name: 'Moon Salt',
            img: '',
            description: { unexpected: 'shape' },
          }),
        ];
        sys.essenceDefinitions = [
          {
            id: 'ess-fire',
            name: 'Fire',
            description: 'Hot stuff',
            icon: 'fas fa-fire',
            sourceItemUuid: 'comp-1',
            associatedSystemItemId: 'comp-1',
          },
          {
            id: 'ess-moon',
            name: 'Moon',
            description: '',
            icon: 'fas fa-moon',
            sourceItemUuid: null,
            associatedSystemItemId: null,
          },
        ];
      }

      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      const vs = get(store.viewState);
      const [linkedEssence, unlinkedEssence] = vs.selectedSystem.essenceDefinitions;

      // `category` (issue 676) is projected here unconditionally — this is the
      // PER-COMPONENT field projection, distinct from the system-level
      // `componentCategories` vocabulary projection. deepEqual (not deepInclude) is
      // the point: it fails if the field is ever dropped from the allowlist.
      assert.deepEqual(vs.selectedSystem.managedItemOptions, [
        {
          id: 'comp-1',
          name: 'Blazing Herb',
          img: 'blazing-herb.png',
          description: 'Bright ember leaf.',
          category: 'general',
        },
        {
          id: 'comp-2',
          name: 'Moon Salt',
          img: 'icons/svg/item-bag.svg',
          description: '',
          category: 'general',
        },
      ]);
      assert.deepEqual(linkedEssence.associatedItem, {
        id: 'comp-1',
        name: 'Blazing Herb',
        img: 'blazing-herb.png',
      });
      assert.equal(linkedEssence.associatedItemName, 'Blazing Herb');
      assert.equal(unlinkedEssence.associatedItem, null);
      assert.equal(unlinkedEssence.associatedItemName, null);
    });

    it('viewState.selectedSystem.componentTagOptions is an { id, tags, essences } projection separate from managedItemOptions', async () => {
      const services = createMockServices();
      const origManager = services.getCraftingSystemManager();
      const sys = origManager.getSystem('sys1');
      if (sys) {
        sys.components = [
          makeItem({
            id: 'comp-1',
            name: 'Iron Ore',
            tags: [' metal ', 'ore', ''],
            essences: { ' ess-fire ': 2, 'ess-zero': 0 },
          }),
          makeItem({ id: 'comp-2', name: 'Herb', tags: ['plant'] }),
          makeItem({ id: 'comp-3', name: 'Untagged' }),
        ];
      }

      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      const vs = get(store.viewState);

      // Built as { id, tags, essences } from managed items, with tags trim-normalized
      // to line up with how the tags-match handler stores match tags, and essences
      // trimmed + numeric-positive so an essence option expands correctly (issue 649).
      assert.deepEqual(vs.selectedSystem.componentTagOptions, [
        { id: 'comp-1', tags: ['metal', 'ore'], essences: { 'ess-fire': 2 } },
        { id: 'comp-2', tags: ['plant'], essences: {} },
        { id: 'comp-3', tags: [], essences: {} },
      ]);

      // The managedItemOptions contract shape is unchanged (no tags leak in). It does
      // carry the per-component `category` (issue 676) — tags and category are
      // different axes and neither substitutes for the other.
      assert.deepEqual(vs.selectedSystem.managedItemOptions, [
        { id: 'comp-1', name: 'Iron Ore', img: 'item.png', description: '', category: 'general' },
        { id: 'comp-2', name: 'Herb', img: 'item.png', description: '', category: 'general' },
        { id: 'comp-3', name: 'Untagged', img: 'item.png', description: '', category: 'general' },
      ]);
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
            originItemUuid: 'Compendium.fabricate.items.blazing-herb',
            essences: { 'ess-fire': 2 },
          }),
          makeItem({
            id: 'comp-2',
            name: 'Moon Salt',
            img: '',
            essences: {},
          }),
        ];
        sys.essenceDefinitions = [
          {
            id: 'ess-fire',
            name: 'Fire',
            description: 'Hot stuff',
            icon: 'fas fa-fire',
            sourceComponentId: 'comp-1',
            sourceItemUuid: 'comp-1',
            associatedSystemItemId: 'comp-1',
          },
          {
            id: 'ess-moon',
            name: 'Moon',
            description: '',
            icon: '',
            sourceComponentId: null,
            sourceItemUuid: null,
            associatedSystemItemId: null,
          },
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
        { id: 'comp-1', name: 'Blazing Herb', img: 'blazing-herb.png' },
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
      const services = createMockServices({
        choiceDialog: async (opts) => {
          captured = opts;
          return 'cancel';
        },
      });
      const store = createAdminStore(services);
      await store.confirmDiscardDirtyComponentDraft();
      assert.equal(captured.defaultAction, 'save');
      assert.deepEqual(
        captured.choices.map((c) => c.action),
        ['save', 'discard', 'cancel']
      );
    });

    it('falls back to the two-way confirm when no choiceDialog is available', async () => {
      const confirmTrue = createMockServices({
        choiceDialog: undefined,
        confirmDialog: async () => true,
      });
      const storeTrue = createAdminStore(confirmTrue);
      assert.equal(await storeTrue.confirmDiscardDirtyComponentDraft(), 'discard');

      const confirmFalse = createMockServices({
        choiceDialog: undefined,
        confirmDialog: async () => false,
      });
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
    const gatheringConfig = {
      systems: {
        sys1: {
          economy: {
            stamina: {
              enabled: true,
              max: '40',
              start: '',
              regen: { policy: 'none', unit: 'hours', amount: '' },
            },
            nodes: { enabled: false },
          },
        },
      },
    };
    const services = createMockServices({
      getSetting: (key) => (key === 'gatheringConfig' ? gatheringConfig : ''),
    });
    const store = createAdminStore(services);
    await store.refresh();
    const vs = get(store.viewState);
    // The two flags are preserved verbatim by the store normalizer.
    assert.equal(vs.gatheringConfig.systems.sys1.economy.stamina.enabled, true);
    assert.equal(vs.gatheringConfig.systems.sys1.economy.nodes.enabled, false);
    assert.equal(vs.gatheringConfig.systems.sys1.economy.stamina.max, '40');
  });

  it('preserves a library task node config through normalization (so it survives save)', async () => {
    const gatheringConfig = {
      systems: {
        sys1: {
          economy: { nodes: { enabled: true } },
          tasks: [
            {
              id: 't1',
              name: 'Mine',
              nodes: {
                enabled: true,
                max: 4,
                current: 4,
                depletionTiming: 'onStart',
                respawn: { policy: 'overTime', gainMode: 'guaranteed', intervalSeconds: 3600 },
              },
            },
          ],
        },
      },
    };
    const services = createMockServices({
      getSetting: (key) => (key === 'gatheringConfig' ? gatheringConfig : ''),
    });
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
    let gatheringConfig = {
      systems: {
        sys1: {
          economy: {
            stamina: { enabled: true, regen: { policy: 'none', unit: 'hours', amount: '' } },
            nodes: { enabled: false },
          },
        },
      },
    };
    const services = createMockServices({
      getSetting: (key) => (key === 'gatheringConfig' ? gatheringConfig : ''),
    });
    const store = createAdminStore(services);
    await store.refresh();
    assert.equal(get(store.viewState).gatheringConfig.systems.sys1.economy.stamina.enabled, true);

    // External write disables stamina; refresh pulls the new flags into viewState.
    gatheringConfig = {
      systems: {
        sys1: {
          economy: {
            stamina: { enabled: false, regen: { policy: 'none', unit: 'hours', amount: '' } },
            nodes: { enabled: false },
          },
        },
      },
    };
    store.refreshGatheringConfig();
    assert.equal(get(store.viewState).gatheringConfig.systems.sys1.economy.stamina.enabled, false);
  });
});
