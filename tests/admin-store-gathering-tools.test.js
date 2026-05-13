/**
 * Coverage for the per-system gathering tools library and its draft layer in
 * adminStore. Exercises:
 *   - _normalizeGatheringLibraryTool persistence + legacy compatibility,
 *   - addGatheringLibraryTool / updateGatheringLibraryTool / deleteGatheringLibraryTool
 *     against the live gathering config,
 *   - the toolsDraft lifecycle (enter/update/save/cancel) and dirty tracking.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';

import { createAdminStore } from '../src/ui/svelte/stores/adminStore.js';

function makeSystem(overrides = {}) {
  return {
    id: overrides.id || 'sys1',
    name: overrides.name || 'System One',
    description: '',
    resolutionMode: 'simple',
    features: { gathering: true, ...(overrides.features || {}) },
    advancedOptionsEnabled: true,
    categories: [],
    itemTags: [],
    essenceDefinitions: [],
    items: overrides.items || [],
    requirements: { time: { enabled: false }, currency: { enabled: false, provider: 'macro' } },
    craftingCheck: { mode: 'passFail', macroUuid: null, outcomes: [] },
    recipeVisibility: { listMode: 'global' },
    components: overrides.components || [],
    ...overrides
  };
}

function createMockServices(overrides = {}) {
  const store = { gatheringConfig: overrides.gatheringConfig ?? null };
  let systems = [makeSystem({ id: 'sys1', name: 'System One', components: overrides.components || [] })];

  const mockSystemManager = {
    getSystems: () => systems,
    getSystem: (id) => systems.find(s => s.id === id) || null,
    createSystem: async () => systems[0],
    updateSystem: async () => {},
    deleteSystem: async () => {},
    getItems: (systemId) => {
      const sys = systems.find(s => s.id === systemId);
      return sys?.components || sys?.items || [];
    },
    deleteItem: async () => {}
  };

  const mockRecipeManager = {
    getRecipes: () => [],
    getRecipe: () => null,
    createRecipe: async () => ({}),
    updateRecipe: async () => {},
    deleteRecipe: async () => {},
    importRecipes: async () => {},
    exportRecipes: () => []
  };

  const base = {
    getSetting: (key) => store[key] ?? null,
    setSetting: async (key, value) => { store[key] = value; },
    getCraftingSystemManager: () => mockSystemManager,
    getRecipeManager: () => mockRecipeManager,
    getGatheringEnvironmentStore: () => ({ list: () => [], save: async () => true }),
    getScriptMacros: () => [],
    getSceneOptions: () => [],
    getRollTableOptions: () => [],
    notify: { info: () => {}, warn: () => {}, error: () => {} },
    confirmDialog: async () => true,
    localize: (key) => key,
    copyToClipboard: async () => {},
    openRecipeEditor: () => {},
    renderImportDialog: async () => {}
  };

  const merged = { ...base, ...overrides };
  merged._store = store;
  return merged;
}

describe('adminStore gathering tools library', () => {

  // ---------------------------------------------------------------------------
  // Normalization (via config round-trip)
  // ---------------------------------------------------------------------------

  describe('_normalizeGatheringLibraryTool', () => {
    it('defaults a sparse tool to limited uses with destroy on break', async () => {
      const services = createMockServices({
        gatheringConfig: { systems: { sys1: { tools: [{ id: 't1' }] } } }
      });
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      const tool = get(store.viewState).gatheringConfig.systems.sys1.tools[0];
      assert.deepEqual(tool, {
        id: 't1',
        label: '',
        enabled: true,
        componentId: null,
        requirement: null,
        breakage: { mode: 'limitedUses', maxUses: null },
        onBreak: { mode: 'destroy' }
      });
    });

    it('coerces unknown breakage / on-break modes to defaults', async () => {
      const services = createMockServices({
        gatheringConfig: {
          systems: {
            sys1: {
              tools: [{
                id: 't1',
                componentId: 'comp-axe',
                breakage: { mode: 'frobnicate', maxUses: 7 },
                onBreak: { mode: 'banana' }
              }]
            }
          }
        }
      });
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      const tool = get(store.viewState).gatheringConfig.systems.sys1.tools[0];
      assert.equal(tool.breakage.mode, 'limitedUses');
      assert.equal(tool.breakage.maxUses, 7);
      assert.equal(tool.onBreak.mode, 'destroy');
    });

    it('preserves valid breakageChance and replaceWith configuration', async () => {
      const services = createMockServices({
        gatheringConfig: {
          systems: {
            sys1: {
              tools: [{
                id: 't1',
                componentId: 'comp-axe',
                breakage: { mode: 'breakageChance', breakageChance: 25 },
                onBreak: { mode: 'replaceWith', replacementComponentId: 'comp-axe-broken' }
              }]
            }
          }
        }
      });
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      const tool = get(store.viewState).gatheringConfig.systems.sys1.tools[0];
      assert.equal(tool.breakage.mode, 'breakageChance');
      assert.equal(tool.breakage.breakageChance, 25);
      assert.equal(tool.onBreak.mode, 'replaceWith');
      assert.equal(tool.onBreak.replacementComponentId, 'comp-axe-broken');
    });

    it('legacy configs without a tools array load as []', async () => {
      const services = createMockServices({
        gatheringConfig: { systems: { sys1: { tasks: [] } } }
      });
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      assert.deepEqual(get(store.viewState).gatheringConfig.systems.sys1.tools, []);
    });
  });

  // ---------------------------------------------------------------------------
  // Task → tool reference normalization (task.toolIds: string[])
  // ---------------------------------------------------------------------------

  describe('task toolIds normalization', () => {
    it('legacy tasks without toolIds default to an empty array', async () => {
      const services = createMockServices({
        gatheringConfig: { systems: { sys1: { tasks: [{ id: 'task-a' }] } } }
      });
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      const task = get(store.viewState).gatheringConfig.systems.sys1.tasks[0];
      assert.deepEqual(task.toolIds, []);
    });

    it('stores task.toolIds as trimmed string ids and drops empties', async () => {
      const services = createMockServices({
        gatheringConfig: { systems: { sys1: { tasks: [{
          id: 'task-a',
          toolIds: ['  tool-a  ', '', null, 42, 'tool-b']
        }] } } }
      });
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      const task = get(store.viewState).gatheringConfig.systems.sys1.tasks[0];
      assert.deepEqual(task.toolIds, ['tool-a', '42', 'tool-b']);
    });
  });

  // ---------------------------------------------------------------------------
  // Library CRUD
  // ---------------------------------------------------------------------------

  describe('library CRUD', () => {
    it('addGatheringLibraryTool appends a normalized tool', async () => {
      const services = createMockServices();
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      const tool = await store.addGatheringLibraryTool('sys1');
      assert.ok(tool && tool.id);
      assert.equal(tool.breakage.mode, 'limitedUses');
      assert.deepEqual(services._store.gatheringConfig.systems.sys1.tools[0], tool);
    });

    it('updateGatheringLibraryTool merges patches and re-normalizes', async () => {
      const services = createMockServices();
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      const tool = await store.addGatheringLibraryTool('sys1');
      await store.updateGatheringLibraryTool('sys1', tool.id, {
        label: 'Iron Pickaxe',
        componentId: 'comp-pick',
        breakage: { mode: 'breakageChance', breakageChance: 40 }
      });
      const updated = services._store.gatheringConfig.systems.sys1.tools[0];
      assert.equal(updated.label, 'Iron Pickaxe');
      assert.equal(updated.componentId, 'comp-pick');
      assert.equal(updated.breakage.mode, 'breakageChance');
      assert.equal(updated.breakage.breakageChance, 40);
    });

    it('deleteGatheringLibraryTool removes the tool when the dialog confirms', async () => {
      const services = createMockServices({ confirmDialog: async () => true });
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      const tool = await store.addGatheringLibraryTool('sys1');
      const removed = await store.deleteGatheringLibraryTool('sys1', tool.id);
      assert.equal(removed, true);
      assert.deepEqual(services._store.gatheringConfig.systems.sys1.tools, []);
    });

    it('deleteGatheringLibraryTool is cancelled by the dialog', async () => {
      const services = createMockServices({ confirmDialog: async () => false });
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      const tool = await store.addGatheringLibraryTool('sys1');
      const removed = await store.deleteGatheringLibraryTool('sys1', tool.id);
      assert.equal(removed, false);
      assert.equal(services._store.gatheringConfig.systems.sys1.tools.length, 1);
    });
  });

  // ---------------------------------------------------------------------------
  // Draft layer
  // ---------------------------------------------------------------------------

  describe('toolsDraft lifecycle', () => {
    it('enterToolsDraft snapshots the live tools array', async () => {
      const services = createMockServices({
        gatheringConfig: { systems: { sys1: { tools: [{ id: 't1', componentId: 'comp-axe' }] } } }
      });
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      assert.equal(store.enterToolsDraft('sys1'), true);
      const draft = get(store.viewState).toolsDraft;
      assert.equal(draft.length, 1);
      assert.equal(draft[0].id, 't1');
      assert.equal(get(store.viewState).toolsDraftDirty, false);
    });

    it('addToolToDraft flips dirty and selects + expands the new tool', async () => {
      const services = createMockServices();
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      store.enterToolsDraft('sys1');
      const added = store.addToolToDraft();
      assert.ok(added && added.id);
      const state = get(store.viewState);
      assert.equal(state.toolsDraft.length, 1);
      assert.equal(state.toolsDraftDirty, true);
      assert.deepEqual(state.toolsDraftDirtyToolIds, [added.id]);
      assert.equal(state.toolsDraftSelectedToolId, added.id);
      assert.equal(state.toolsDraftExpandedToolId, added.id);
    });

    it('addToolToDraft accepts an initial component mapping', async () => {
      const services = createMockServices();
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      store.enterToolsDraft('sys1');
      const added = store.addToolToDraft({ componentId: 'comp-pickaxe' });
      assert.ok(added && added.id);
      const state = get(store.viewState);
      assert.equal(state.toolsDraft[0].componentId, 'comp-pickaxe');
      assert.equal(state.toolsDraftDirty, true);
      assert.deepEqual(state.toolsDraftDirtyToolIds, [added.id]);
      assert.equal(state.toolsDraftSelectedToolId, added.id);
      assert.equal(state.toolsDraftExpandedToolId, added.id);
    });

    it('updateToolInDraft applies the patch and updates dirty', async () => {
      const services = createMockServices();
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      store.enterToolsDraft('sys1');
      const added = store.addToolToDraft();
      store.updateToolInDraft(added.id, { label: 'Iron Pickaxe' });
      const draft = get(store.viewState).toolsDraft;
      assert.equal(draft[0].label, 'Iron Pickaxe');
      assert.equal(get(store.viewState).toolsDraftDirty, true);
      assert.deepEqual(get(store.viewState).toolsDraftDirtyToolIds, [added.id]);
    });

    it('saveToolsDraft writes all dirty tools to the live config and clears dirty', async () => {
      const services = createMockServices();
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      store.enterToolsDraft('sys1');
      const added = store.addToolToDraft();
      store.updateToolInDraft(added.id, { componentId: 'comp-axe', label: 'Iron Pickaxe' });
      const saved = await store.saveToolsDraft();
      assert.equal(saved, true);
      const tool = services._store.gatheringConfig.systems.sys1.tools[0];
      assert.equal(tool.label, 'Iron Pickaxe');
      assert.equal(tool.componentId, 'comp-axe');
      assert.equal(get(store.viewState).toolsDraftDirty, false);
      assert.deepEqual(get(store.viewState).toolsDraftDirtyToolIds, []);
    });

    it('saveToolDraft writes only the selected dirty tool and leaves other dirty tools unsaved', async () => {
      const services = createMockServices({
        gatheringConfig: {
          systems: {
            sys1: {
              tools: [
                { id: 't1', componentId: 'comp-axe', label: 'Axe', enabled: true },
                { id: 't2', componentId: 'comp-pick', label: 'Pick', enabled: true }
              ]
            }
          }
        }
      });
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      store.enterToolsDraft('sys1');
      store.updateToolInDraft('t1', { label: 'Saved Axe' });
      store.updateToolInDraft('t2', { label: 'Unsaved Pick' });
      assert.deepEqual(get(store.viewState).toolsDraftDirtyToolIds, ['t1', 't2']);

      const saved = await store.saveToolDraft('t1');
      assert.equal(saved, true);
      assert.equal(services._store.gatheringConfig.systems.sys1.tools.find(tool => tool.id === 't1').label, 'Saved Axe');
      assert.equal(services._store.gatheringConfig.systems.sys1.tools.find(tool => tool.id === 't2').label, 'Pick');
      assert.deepEqual(get(store.viewState).toolsDraftDirtyToolIds, ['t2']);
    });

    it('cancelToolsDraft clears the draft state', async () => {
      const services = createMockServices();
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      store.enterToolsDraft('sys1');
      store.addToolToDraft();
      store.cancelToolsDraft();
      const state = get(store.viewState);
      assert.equal(state.toolsDraft, null);
      assert.equal(state.toolsDraftDirty, false);
      assert.deepEqual(state.toolsDraftDirtyToolIds, []);
      assert.equal(state.toolsDraftSelectedToolId, '');
    });

    it('validateToolsDraft surfaces per-tool errors and saveToolsDraft blocks when invalid', async () => {
      const services = createMockServices();
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      store.enterToolsDraft('sys1');
      const added = store.addToolToDraft();
      const validation = store.validateToolsDraft();
      assert.equal(validation.valid, false);
      assert.equal(validation.errors[0].id, added.id);
      const saved = await store.saveToolsDraft();
      assert.equal(saved, false);
      assert.equal(get(store.viewState).toolsDraftSaveError, 'invalid');
    });

    it('deleteToolFromDraft removes the tool and clears selection when it matched', async () => {
      const services = createMockServices();
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      store.enterToolsDraft('sys1');
      const added = store.addToolToDraft();
      await store.deleteToolFromDraft(added.id);
      const state = get(store.viewState);
      assert.equal(state.toolsDraft.length, 0);
      assert.equal(state.toolsDraftSelectedToolId, '');
    });

    it('deleteToolFromDraft immediately removes persisted tools from live config', async () => {
      const services = createMockServices({
        gatheringConfig: {
          systems: {
            sys1: {
              tools: [
                { id: 't1', componentId: 'comp-axe', label: 'Axe', enabled: true },
                { id: 't2', componentId: 'comp-pick', label: 'Pick', enabled: true }
              ]
            }
          }
        }
      });
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      store.enterToolsDraft('sys1');

      const deleted = await store.deleteToolFromDraft('t1');
      assert.equal(deleted, true);
      assert.deepEqual(services._store.gatheringConfig.systems.sys1.tools.map(tool => tool.id), ['t2']);
      assert.deepEqual(get(store.viewState).toolsDraft.map(tool => tool.id), ['t2']);
      assert.deepEqual(get(store.viewState).toolsDraftBaseline.map(tool => tool.id), ['t2']);
      assert.deepEqual(get(store.viewState).toolsDraftDirtyToolIds, []);
    });
  });
});
