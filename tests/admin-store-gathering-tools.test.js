/**
 * Coverage for the per-system library tools and their draft layer in adminStore.
 *
 * Tools are SYSTEM-OWNED: the canonical library lives on the crafting system
 * (`system.tools`, persisted via the crafting system manager's `craftingSystems`
 * setting), NOT under `gatheringConfig.systems[id].tools`. This suite exercises:
 *   - _normalizeGatheringLibraryTool persistence + legacy compatibility (via the
 *     system-tools round-trip surfaced on viewState.selectedSystem.tools),
 *   - addGatheringLibraryTool / updateGatheringLibraryTool / deleteGatheringLibraryTool
 *     persisting through the crafting system manager,
 *   - the toolsDraft lifecycle (enter/update/save/cancel) and dirty tracking.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';

import { createAdminStore } from '../src/ui/svelte/stores/adminStore.js';

// Minimal stand-in for CraftingSystemManager._normalizeTool so the mock's
// updateSystem round-trips library tools to the same canonical shape the real
// manager produces.
function normalizeToolShape(tool = {}) {
  const t = tool && typeof tool === 'object' ? tool : {};
  const id = String(t.id || Math.random().toString(36).slice(2, 10));
  const breakageModes = new Set(['limitedUses', 'breakageChance', 'diceExpression']);
  const onBreakModes = new Set(['destroy', 'flagBroken', 'replaceWith']);
  const providers = new Set(['dnd5e', 'pf2e', 'macro']);
  let breakage;
  const bmode = breakageModes.has(t.breakage?.mode) ? t.breakage.mode : 'limitedUses';
  if (bmode === 'limitedUses') {
    const raw = t.breakage?.maxUses;
    const num = raw === null || raw === undefined || raw === '' ? null : Number(raw);
    breakage = { mode: 'limitedUses', maxUses: Number.isFinite(num) ? num : null };
  } else if (bmode === 'breakageChance') {
    const raw = Number(t.breakage?.breakageChance);
    breakage = { mode: 'breakageChance', breakageChance: Number.isFinite(raw) ? raw : 0 };
  } else {
    const thr = Number(t.breakage?.threshold);
    breakage = { mode: 'diceExpression', formula: typeof t.breakage?.formula === 'string' ? t.breakage.formula : '', threshold: Number.isFinite(thr) ? thr : 0 };
  }
  const omode = onBreakModes.has(t.onBreak?.mode) ? t.onBreak.mode : 'destroy';
  const onBreak = omode === 'replaceWith'
    ? { mode: 'replaceWith', replacementComponentId: typeof t.onBreak?.replacementComponentId === 'string' ? t.onBreak.replacementComponentId : null }
    : { mode: omode };
  let requirement = null;
  if (t.requirement && typeof t.requirement === 'object') {
    requirement = {
      provider: providers.has(t.requirement.provider) ? t.requirement.provider : 'dnd5e',
      formula: typeof t.requirement.formula === 'string' ? t.requirement.formula : '',
      macroUuid: typeof t.requirement.macroUuid === 'string' ? t.requirement.macroUuid : ''
    };
  }
  return {
    id,
    label: typeof t.label === 'string' ? t.label.trim() : '',
    enabled: t.enabled !== false,
    componentId: typeof t.componentId === 'string' && t.componentId.trim() ? t.componentId.trim() : null,
    requirement,
    breakage,
    onBreak
  };
}

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
    tools: (Array.isArray(overrides.tools) ? overrides.tools : []).map(normalizeToolShape),
    ...overrides,
    // Ensure tools is the normalized array even when overrides spread a raw `tools`.
    ...(overrides.tools ? { tools: overrides.tools.map(normalizeToolShape) } : {})
  };
}

function createMockServices(overrides = {}) {
  const store = { gatheringConfig: overrides.gatheringConfig ?? null };
  let systems = [makeSystem({ id: 'sys1', name: 'System One', components: overrides.components || [], tools: overrides.systemTools || [] })];

  const mockSystemManager = {
    getSystems: () => systems,
    getSystem: (id) => systems.find(s => s.id === id) || null,
    createSystem: async () => systems[0],
    // Round-trips library tools onto the system, mirroring the real manager:
    // tools are normalized and stored on the system object.
    updateSystem: async (id, updates = {}) => {
      const sys = systems.find(s => s.id === id);
      if (!sys) return null;
      if (Object.prototype.hasOwnProperty.call(updates, 'tools')) {
        sys.tools = (Array.isArray(updates.tools) ? updates.tools : []).map(normalizeToolShape);
      }
      Object.assign(sys, { ...updates, tools: sys.tools });
      return sys;
    },
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
  merged._systemManager = mockSystemManager;
  merged._systemTools = () => mockSystemManager.getSystem('sys1')?.tools || [];
  return merged;
}

describe('adminStore library tools (system-owned)', () => {

  // ---------------------------------------------------------------------------
  // Normalization (via system-tools round-trip surfaced on viewState)
  // ---------------------------------------------------------------------------

  describe('_normalizeGatheringLibraryTool', () => {
    it('defaults a sparse tool to limited uses with destroy on break', async () => {
      const services = createMockServices({ systemTools: [{ id: 't1' }] });
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      const tool = get(store.viewState).selectedSystem.tools[0];
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
        systemTools: [{
          id: 't1',
          componentId: 'comp-axe',
          breakage: { mode: 'frobnicate', maxUses: 7 },
          onBreak: { mode: 'banana' }
        }]
      });
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      const tool = get(store.viewState).selectedSystem.tools[0];
      assert.equal(tool.breakage.mode, 'limitedUses');
      assert.equal(tool.breakage.maxUses, 7);
      assert.equal(tool.onBreak.mode, 'destroy');
    });

    it('preserves valid breakageChance and replaceWith configuration', async () => {
      const services = createMockServices({
        systemTools: [{
          id: 't1',
          componentId: 'comp-axe',
          breakage: { mode: 'breakageChance', breakageChance: 25 },
          onBreak: { mode: 'replaceWith', replacementComponentId: 'comp-axe-broken' }
        }]
      });
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      const tool = get(store.viewState).selectedSystem.tools[0];
      assert.equal(tool.breakage.mode, 'breakageChance');
      assert.equal(tool.breakage.breakageChance, 25);
      assert.equal(tool.onBreak.mode, 'replaceWith');
      assert.equal(tool.onBreak.replacementComponentId, 'comp-axe-broken');
    });

    it('systems without a tools array load as []', async () => {
      const services = createMockServices();
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      assert.deepEqual(get(store.viewState).selectedSystem.tools, []);
    });
  });

  // ---------------------------------------------------------------------------
  // Task → tool reference normalization (task.toolIds: string[]) — still in
  // gatheringConfig (tasks remain gathering-scoped).
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
  // Library CRUD — persists through the crafting system manager onto system.tools
  // ---------------------------------------------------------------------------

  describe('library CRUD', () => {
    it('addGatheringLibraryTool appends a normalized tool to the system', async () => {
      const services = createMockServices();
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      const tool = await store.addGatheringLibraryTool('sys1');
      assert.ok(tool && tool.id);
      assert.equal(tool.breakage.mode, 'limitedUses');
      assert.deepEqual(services._systemTools()[0], tool);
      // Never persisted onto the gathering config.
      assert.ok(!services._store.gatheringConfig?.systems?.sys1?.tools);
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
      const updated = services._systemTools()[0];
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
      assert.deepEqual(services._systemTools(), []);
    });

    it('deleteGatheringLibraryTool is cancelled by the dialog', async () => {
      const services = createMockServices({ confirmDialog: async () => false });
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      const tool = await store.addGatheringLibraryTool('sys1');
      const removed = await store.deleteGatheringLibraryTool('sys1', tool.id);
      assert.equal(removed, false);
      assert.equal(services._systemTools().length, 1);
    });
  });

  // ---------------------------------------------------------------------------
  // Draft layer
  // ---------------------------------------------------------------------------

  describe('toolsDraft lifecycle', () => {
    it('enterToolsDraft snapshots the live system tools array', async () => {
      const services = createMockServices({ systemTools: [{ id: 't1', componentId: 'comp-axe' }] });
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

    it('saveToolsDraft writes all dirty tools to the system and clears dirty', async () => {
      const services = createMockServices();
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      store.enterToolsDraft('sys1');
      const added = store.addToolToDraft();
      store.updateToolInDraft(added.id, { componentId: 'comp-axe', label: 'Iron Pickaxe' });
      const saved = await store.saveToolsDraft();
      assert.equal(saved, true);
      const tool = services._systemTools()[0];
      assert.equal(tool.label, 'Iron Pickaxe');
      assert.equal(tool.componentId, 'comp-axe');
      assert.equal(get(store.viewState).toolsDraftDirty, false);
      assert.deepEqual(get(store.viewState).toolsDraftDirtyToolIds, []);
    });

    it('issue 297: saveAllDirtyToolDrafts discards a blank unmodified new-tool draft and succeeds', async () => {
      const services = createMockServices();
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      store.enterToolsDraft('sys1');
      // User clicks "Add tool" but never assigns a component (invalid + blank).
      const added = store.addToolToDraft();
      assert.equal(store.validateToolDraft(added.id).valid, false, 'blank new tool is invalid (no component)');

      const saved = await store.saveAllDirtyToolDrafts();
      assert.equal(saved, true, 'save completes cleanly instead of silently blocking');
      const state = get(store.viewState);
      assert.equal(state.toolsDraft.find(tool => tool.id === added.id), undefined, 'the blank new draft is discarded');
      assert.deepEqual(state.toolsDraftDirtyToolIds, [], 'no dirty drafts remain');
      assert.equal(services._systemTools().length, 0, 'nothing blank was persisted');
    });

    it('issue 297: saveAllDirtyToolDrafts keeps a valid tool and drops only the blank new draft', async () => {
      const services = createMockServices();
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      store.enterToolsDraft('sys1');
      const valid = store.addToolToDraft();
      store.updateToolInDraft(valid.id, { componentId: 'comp-axe', label: 'Iron Pickaxe' });
      store.addToolToDraft();

      const saved = await store.saveAllDirtyToolDrafts();
      assert.equal(saved, true);
      const persisted = services._systemTools();
      assert.equal(persisted.length, 1, 'only the valid tool persists');
      assert.equal(persisted[0].componentId, 'comp-axe');
      assert.equal(get(store.viewState).toolsDraft.length, 1, 'blank new draft discarded, valid tool kept');
    });

    it('issue 297: saveAllDirtyToolDrafts returns false for a partially-edited invalid tool (no component)', async () => {
      const services = createMockServices();
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      store.enterToolsDraft('sys1');
      const added = store.addToolToDraft();
      // Edited (named) but still missing the required component: NOT blank, so it
      // must block the save rather than being silently discarded.
      store.updateToolInDraft(added.id, { label: 'Unfinished Tool' });

      const saved = await store.saveAllDirtyToolDrafts();
      assert.equal(saved, false, 'a partially-edited invalid tool blocks the save so the caller can warn');
      const state = get(store.viewState);
      assert.ok(state.toolsDraft.some(tool => tool.id === added.id), 'the edited invalid tool is preserved, not discarded');
      const validation = store.validateToolsDraft();
      assert.equal(validation.valid, false, 'validateToolsDraft reports the offending tool for the warning');
      assert.equal(validation.errors[0].id, added.id);
    });

    it('saveToolDraft writes only the selected dirty tool and leaves other dirty tools unsaved', async () => {
      const services = createMockServices({
        systemTools: [
          { id: 't1', componentId: 'comp-axe', label: 'Axe', enabled: true },
          { id: 't2', componentId: 'comp-pick', label: 'Pick', enabled: true }
        ]
      });
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      store.enterToolsDraft('sys1');
      store.updateToolInDraft('t1', { label: 'Saved Axe' });
      store.updateToolInDraft('t2', { label: 'Unsaved Pick' });
      assert.deepEqual(get(store.viewState).toolsDraftDirtyToolIds, ['t1', 't2']);

      const saved = await store.saveToolDraft('t1');
      assert.equal(saved, true);
      assert.equal(services._systemTools().find(tool => tool.id === 't1').label, 'Saved Axe');
      assert.equal(services._systemTools().find(tool => tool.id === 't2').label, 'Pick');
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
      // A non-blank invalid tool (edited but missing the required component). A
      // genuinely-invalid tool still blocks the save and sets the error state;
      // only blank, unmodified new drafts are discarded cleanly (issue 297).
      store.updateToolInDraft(added.id, { label: 'Unfinished Tool' });
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

    it('deleteToolFromDraft immediately removes persisted tools from the system', async () => {
      const services = createMockServices({
        systemTools: [
          { id: 't1', componentId: 'comp-axe', label: 'Axe', enabled: true },
          { id: 't2', componentId: 'comp-pick', label: 'Pick', enabled: true }
        ]
      });
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      store.enterToolsDraft('sys1');

      const deleted = await store.deleteToolFromDraft('t1');
      assert.equal(deleted, true);
      assert.deepEqual(services._systemTools().map(tool => tool.id), ['t2']);
      assert.deepEqual(get(store.viewState).toolsDraft.map(tool => tool.id), ['t2']);
      assert.deepEqual(get(store.viewState).toolsDraftBaseline.map(tool => tool.id), ['t2']);
      assert.deepEqual(get(store.viewState).toolsDraftDirtyToolIds, []);
    });
  });
});
