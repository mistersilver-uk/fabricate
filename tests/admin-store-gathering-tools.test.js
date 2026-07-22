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

import { Tool } from '../src/models/Tool.js';
import { createAdminStore } from '../src/ui/svelte/stores/adminStore.js';

let generatedToolId = 0;

function normalizeToolShape(tool = {}) {
  const t = tool && typeof tool === 'object' ? tool : {};
  const originItemUuid = t.originItemUuid || t.registeredItemUuid || t.sourceItemUuid || t.sourceUuid || null;
  const registeredItemUuid = t.registeredItemUuid || t.originItemUuid || t.sourceUuid || t.sourceItemUuid || null;
  const aliasItemUuids = Array.isArray(t.aliasItemUuids) ? t.aliasItemUuids : t.fallbackItemIds;
  return Tool.fromJSON({
    ...t,
    id: String(t.id || `test-tool-${++generatedToolId}`),
    registeredItemUuid,
    originItemUuid,
    aliasItemUuids
  }).toJSON();
}

function makeSystem(overrides = {}) {
  return {
    id: overrides.id || 'sys1',
    name: overrides.name || 'System One',
    description: '',
    resolutionMode: 'simple',
    features: { gathering: true, ...(overrides.features || {}) },
    categories: [],
    itemTags: [],
    essenceDefinitions: [],
    items: overrides.items || [],
    requirements: { time: { enabled: false }, currency: { enabled: false, units: [] } },
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
  const calls = [];
  let systems = overrides.systems || [
    makeSystem({
      id: 'sys1',
      name: 'System One',
      components: overrides.components || [],
      tools: overrides.systemTools || []
    })
  ];

  const mockSystemManager = {
    getSystems: () => systems,
    getSystem: (id) => systems.find(s => s.id === id) || null,
    createSystem: async () => systems[0],
    // Round-trips library tools onto the system, mirroring the real manager:
    // tools are normalized and stored on the system object.
    updateSystem: async (id, updates = {}) => {
      calls.push(['updateSystem', id, updates]);
      const sys = systems.find(s => s.id === id);
      if (!sys) return null;
      if (Object.prototype.hasOwnProperty.call(updates, 'tools')) {
        sys.tools = (Array.isArray(updates.tools) ? updates.tools : []).map(normalizeToolShape);
      }
      Object.assign(sys, { ...updates, tools: sys.tools });
      return sys;
    },
    upsertTool: async (id, data, options = {}) => {
      calls.push(['upsertTool', id, data, options]);
      if (overrides.upsertToolError) throw overrides.upsertToolError;
      const sys = systems.find(system => system.id === id);
      if (!sys) throw new Error(`Missing system ${id}`);
      const staged = normalizeToolShape({
        ...data,
        ...(options.itemUuid
          ? {
              componentId: null,
              registeredItemUuid: options.itemUuid,
              originItemUuid: options.itemUuid,
              name: data.name || 'Linked source'
            }
          : {})
      });
      const index = sys.tools.findIndex(tool => tool.id === staged.id);
      if (index >= 0) sys.tools[index] = staged;
      else sys.tools.push(staged);
      return { item: staged, action: index >= 0 ? 'updated' : 'added' };
    },
    deleteTool: async (id, toolId) => {
      calls.push(['deleteTool', id, toolId]);
      if (overrides.deleteToolError) throw overrides.deleteToolError;
      const sys = systems.find(system => system.id === id);
      const before = sys?.tools.length || 0;
      if (sys) sys.tools = sys.tools.filter(tool => tool.id !== toolId);
      return { deleted: (sys?.tools.length || 0) !== before };
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
  merged._calls = calls;
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
        name: null,
        img: null,
        description: '',
        registeredItemUuid: null,
        originItemUuid: null,
        aliasItemUuids: [],
        requirement: null,
        prerequisites: { enabled: false, ids: [], gateMode: 'usability' },
        bonus: { enabled: false, expression: '' },
        breakage: { mode: 'limitedUses', maxUses: null },
        checkBreakable: true,
        onBreak: { mode: 'destroy' },
        repairRequirements: []
      });
    });

    it('accepts LEGACY source fields and emits the renamed names (issue 560)', async () => {
      const services = createMockServices({
        systemTools: [{
          id: 't1',
          sourceUuid: 'Item.old-live',
          sourceItemUuid: 'Compendium.old-origin',
          fallbackItemIds: ['Item.old-alias']
        }]
      });
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      const tool = get(store.viewState).selectedSystem.tools[0];
      assert.equal(tool.registeredItemUuid, 'Item.old-live');
      assert.equal(tool.originItemUuid, 'Compendium.old-origin');
      assert.deepEqual(tool.aliasItemUuids, ['Item.old-alias']);
      assert.ok(!('sourceUuid' in tool));
      assert.ok(!('sourceItemUuid' in tool));
      assert.ok(!('fallbackItemIds' in tool));
    });

    it('preserves NEW-named source fields without drop (issue 560)', async () => {
      const services = createMockServices({
        systemTools: [{
          id: 't1',
          registeredItemUuid: 'Item.new-live',
          originItemUuid: 'Compendium.new-origin',
          aliasItemUuids: ['Item.new-alias']
        }]
      });
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      const tool = get(store.viewState).selectedSystem.tools[0];
      assert.equal(tool.registeredItemUuid, 'Item.new-live');
      assert.equal(tool.originItemUuid, 'Compendium.new-origin');
      assert.deepEqual(tool.aliasItemUuids, ['Item.new-alias']);
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
      assert.deepEqual(tool.onBreak.replacementTarget, {
        type: 'component',
        componentId: 'comp-axe-broken'
      });
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

    it('keeps an invalid new draft mounted when save is attempted', async () => {
      const services = createMockServices();
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      store.enterToolsDraft('sys1');
      // User clicks "Add tool" but never assigns a component (invalid + blank).
      const added = store.addToolToDraft();
      assert.equal(store.validateToolDraft(added.id).valid, false, 'blank new tool is invalid (no component)');

      const saved = await store.saveToolDraft();
      assert.equal(saved, false);
      const state = get(store.viewState);
      assert.equal(state.toolDraft.id, added.id);
      assert.equal(state.toolDraftSaveError, 'invalid');
      assert.equal(state.toolDraftDirty, true);
      assert.equal(services._systemTools().length, 0);
    });

    it('opening a second Tool replaces the focused draft instead of retaining an array of edits', async () => {
      const services = createMockServices();
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      store.enterToolsDraft('sys1');
      const valid = store.addToolToDraft();
      store.updateToolInDraft(valid.id, { componentId: 'comp-axe', label: 'Iron Pickaxe' });
      const replacement = store.createToolDraft({ componentId: 'comp-pick' });
      const state = get(store.viewState);
      assert.equal(state.toolDraft.id, replacement.id);
      assert.equal(state.toolDraftBaseline, null);
      assert.equal(state.toolDraftDirty, true);
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

    it('openToolDraft replaces unsaved state with one persisted Tool baseline', async () => {
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
      assert.equal(get(store.viewState).toolDraftDirty, true);
      assert.equal(store.openToolDraft('t2'), true);
      const state = get(store.viewState);
      assert.equal(state.toolDraft.id, 't2');
      assert.equal(state.toolDraft.label, 'Pick');
      assert.deepEqual(state.toolDraft, state.toolDraftBaseline);
      assert.equal(state.toolDraftDirty, false);
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

  describe('focused Tool editor contract', () => {
    it('creates one unlinked canonical draft without a Kind field', async () => {
      const store = createAdminStore(createMockServices());
      await store.selectSystem('sys1');
      const created = store.createToolDraft({ kind: 'forbidden' });
      const state = get(store.viewState);
      assert.equal(state.toolDraft.id, created.id);
      assert.equal(state.toolDraft.componentId, null);
      assert.equal(state.toolDraftBaseline, null);
      assert.equal(state.toolDraftDirty, true);
      assert.equal('kind' in state.toolDraft, false);
    });

    it('stages source linkage and unlinkage without persisting either action', async () => {
      const services = createMockServices();
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      store.createToolDraft();
      assert.equal(
        store.stageToolDraftSource('Compendium.tools.hammer', {
          name: 'Smith Hammer',
          img: 'icons/tools/hammer.webp',
          description: 'Heavy.'
        }),
        true
      );
      let state = get(store.viewState);
      assert.equal(state.toolDraftSourceItemUuid, 'Compendium.tools.hammer');
      assert.equal(state.toolDraft.description, 'Heavy.');
      assert.equal(services._calls.some(call => call[0] === 'upsertTool'), false);
      assert.equal(store.unlinkToolDraftSource(), true);
      state = get(store.viewState);
      assert.equal(state.toolDraft.registeredItemUuid, null);
      assert.equal(state.toolDraftSourceItemUuid, '');
    });

    it('preserves every expanded field through open, patch, and discard', async () => {
      const services = createMockServices({
        systemTools: [{
          id: 'expanded',
          componentId: 'comp-hammer',
          label: 'Forge Hammer',
          description: 'Snapshot description',
          prerequisites: { enabled: true, ids: ['trained'], gateMode: 'bonus' },
          bonus: { enabled: true, expression: '2' },
          breakage: { mode: 'diceExpression', formula: '1d20', threshold: 5 },
          checkBreakable: false,
          onBreak: {
            mode: 'replaceWith',
            replacementTarget: { type: 'item', itemUuid: 'Item.broken-hammer' }
          },
          repairRequirements: [{ id: 'repair', options: [] }]
        }]
      });
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      assert.equal(store.openToolDraft('expanded'), true);
      store.patchToolDraft({ label: 'Changed' });
      assert.equal(get(store.viewState).toolDraftDirty, true);
      assert.equal(store.discardToolDraft(), true);
      const draft = get(store.viewState).toolDraft;
      assert.equal(draft.description, 'Snapshot description');
      assert.deepEqual(draft.prerequisites, { enabled: true, ids: ['trained'], gateMode: 'bonus' });
      assert.deepEqual(draft.bonus, { enabled: true, expression: '2' });
      assert.equal(draft.checkBreakable, false);
      assert.deepEqual(draft.onBreak.replacementTarget, {
        type: 'item', itemUuid: 'Item.broken-hammer'
      });
      assert.equal(draft.repairRequirements.length, 1);
      assert.equal(get(store.viewState).toolDraftDirty, false);
    });

    it('saves one source-aware draft atomically and advances its baseline', async () => {
      const services = createMockServices();
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      store.createToolDraft({ label: 'Hammer' });
      store.stageToolDraftSource('Item.hammer', { name: 'Hammer' });
      assert.equal(await store.saveToolDraft(), true);
      const call = services._calls.find(entry => entry[0] === 'upsertTool');
      assert.equal(call[1], 'sys1');
      assert.deepEqual(call[3], { itemUuid: 'Item.hammer' });
      const state = get(store.viewState);
      assert.deepEqual(state.toolDraft, state.toolDraftBaseline);
      assert.equal(state.toolDraftDirty, false);
    });

    it('keeps a valid draft mounted when manager persistence fails', async () => {
      const errors = [];
      const services = createMockServices({
        upsertToolError: new Error('adapter leaked secret save detail'),
        notify: { error: (message) => errors.push(message) },
        localize: (key) => ({
          'FABRICATE.Admin.Manager.Tools.Editor.SaveFailed': 'The Tool could not be saved. Try again.'
        })[key] || key
      });
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      store.createToolDraft({ componentId: 'comp-hammer', label: 'Hammer' });
      assert.equal(await store.saveToolDraft(), false);
      const state = get(store.viewState);
      assert.equal(state.toolDraft.label, 'Hammer');
      assert.equal(state.toolDraftDirty, true);
      assert.equal(state.toolDraftSaveError, 'adapter leaked secret save detail');
      assert.deepEqual(errors, ['The Tool could not be saved. Try again.']);
      assert.doesNotMatch(errors.join(' '), /adapter leaked secret/);
    });

    it('reports localized operation errors without exposing adapter details', async () => {
      const localized = {
        'FABRICATE.Admin.Manager.Tools.Editor.DeleteFailed': 'The Tool could not be deleted. Try again.',
        'FABRICATE.Admin.Manager.Tools.Editor.ToggleFailed': 'The Tool status could not be changed. Try again.'
      };

      for (const operation of ['delete', 'toggle']) {
        const errors = [];
        const rawMessage = `adapter leaked secret ${operation} detail`;
        const services = createMockServices({
          systemTools: [{ id: 'hammer', componentId: 'comp-hammer', enabled: true }],
          ...(operation === 'delete'
            ? { deleteToolError: new Error(rawMessage) }
            : { upsertToolError: new Error(rawMessage) }),
          notify: { error: (message) => errors.push(message) },
          localize: (key) => localized[key] || key
        });
        const store = createAdminStore(services);
        await store.selectSystem('sys1');

        if (operation === 'delete') {
          store.openToolDraft('hammer');
          assert.equal(await store.deleteToolDraft(), false);
        } else {
          assert.equal(await store.toggleToolEnabled('hammer', false), false);
        }

        assert.equal(errors.length, 1);
        const errorKey =
          operation === 'delete'
            ? 'FABRICATE.Admin.Manager.Tools.Editor.DeleteFailed'
            : 'FABRICATE.Admin.Manager.Tools.Editor.ToggleFailed';
        assert.equal(errors[0], localized[errorKey]);
        assert.doesNotMatch(errors[0], /adapter leaked secret/);
      }
    });

    it('deletes through manager behavior and toggles library enabled state live', async () => {
      const services = createMockServices({
        systemTools: [{ id: 'hammer', componentId: 'comp-hammer', enabled: true }]
      });
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      assert.equal(await store.toggleToolEnabled('hammer', false), true);
      assert.equal(services._systemTools()[0].enabled, false);
      store.openToolDraft('hammer');
      assert.equal(await store.deleteToolDraft(), true);
      assert.equal(services._calls.some(call => call[0] === 'deleteTool'), true);
      assert.equal(get(store.viewState).toolDraft, null);
    });

    it('updates breakage authority and replaces the draft on a system-scope open', async () => {
      const services = createMockServices({
        systems: [
          makeSystem({ id: 'sys1', tools: [{ id: 'one', componentId: 'comp-one' }] }),
          makeSystem({ id: 'sys2', tools: [{ id: 'two', componentId: 'comp-two' }] })
        ]
      });
      const store = createAdminStore(services);
      await store.selectSystem('sys1');
      store.openToolDraft('one', 'sys1');
      store.patchToolDraft({ label: 'Unsaved' });
      assert.equal(store.openToolDraft('two', 'sys2'), true);
      assert.equal(get(store.viewState).toolDraft.id, 'two');
      assert.equal(get(store.viewState).toolDraftSystemId, 'sys2');
      assert.equal(get(store.viewState).toolDraftDirty, false);
      assert.equal(await store.setToolBreakageAuthority('checkDriven'), true);
      assert.equal(services._systemManager.getSystem('sys1').toolBreakage.authority, 'checkDriven');
    });
  });
});
