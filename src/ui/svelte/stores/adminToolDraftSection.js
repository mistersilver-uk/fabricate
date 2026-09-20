/**
 * The Tool rules editor's draft (issue 1373), a section of `createAdminStore` (issue 1708). It owns
 * the nine draft writables and publishes out of band, so it adds no `buildState` to `refresh()`.
 */
import { get, writable } from 'svelte/store';

import { Tool } from '../../../models/Tool.js';
import { findMembership, isSectionInherited } from '../../../systems/scopedDefinitions.js';
import { resolvedToolsFor } from '../../../systems/scopedEntityReads.js';
import { TOOL_SECTIONS } from '../../../systems/toolScope.js';

import { clonePlain, normalizeGatheringLibraryTool } from './adminStoreInternals.js';

export function createToolDraftSection({
  services,
  viewState,
  selectedSystemId,
  refresh,
  randomID,
  systemTools,
  worldToolCorpus,
  getWorldScopeTool,
}) {
  const toolDraft = writable(null);
  const toolDraftBaseline = writable(null);
  const toolDraftSystemId = writable('');
  const toolDraftSourceItemUuid = writable('');
  const toolDraftDirty = writable(false);
  const toolDraftSaving = writable(false);
  const toolDraftSaveError = writable(null);
  const toolDraftValidation = writable({ valid: false, errors: ['missing'] });
  let dirtyToolsDraftDiscardConfirmation = null;

  function currentToolsDraftViewPatch() {
    const draft = get(toolDraft);
    const baseline = get(toolDraftBaseline);
    const systemId = get(toolDraftSystemId);
    // The read union, because this is a display projection and the draft it overlays is one too
    // (issue 1373): a raw-array library beneath a union-seeded draft would answer one question twice.
    const library = systemId ? resolvedSystemTools(systemId) : [];
    const overlay = (entries, entry) => {
      if (!entry) return entries.map(clonePlain);
      const index = entries.findIndex((tool) => String(tool.id) === String(entry.id));
      if (index === -1) return [...entries.map(clonePlain), clonePlain(entry)];
      return entries.map((tool, toolIndex) =>
        toolIndex === index ? clonePlain(entry) : clonePlain(tool)
      );
    };
    return {
      toolDraft: clonePlain(draft),
      toolDraftBaseline: clonePlain(baseline),
      toolDraftSystemId: systemId,
      toolDraftSourceItemUuid: get(toolDraftSourceItemUuid),
      toolDraftDirty: get(toolDraftDirty),
      toolDraftSaving: get(toolDraftSaving),
      toolDraftSaveError: get(toolDraftSaveError),
      toolDraftValidation: clonePlain(get(toolDraftValidation)),
      // Temporary shell aliases: these are projections, never mutable editor state.
      toolsDraft: systemId ? overlay(library, draft) : null,
      toolsDraftBaseline: systemId ? overlay(library, baseline) : null,
      toolsDraftSystemId: systemId,
      toolsDraftDirty: get(toolDraftDirty),
      toolsDraftDirtyToolIds: get(toolDraftDirty) && draft?.id ? [draft.id] : [],
      toolsDraftSaving: get(toolDraftSaving),
      toolsDraftSaveError: get(toolDraftSaveError),
      toolsDraftSelectedToolId: draft?.id || '',
      toolsDraftExpandedToolId: draft?.id || '',
    };
  }

  function patchToolsDraftViewState() {
    viewState.update((state) => ({
      ...state,
      ...currentToolsDraftViewPatch(),
    }));
  }

  function recomputeToolsDraftDirty() {
    const current = get(toolDraft);
    const baseline = get(toolDraftBaseline);
    toolDraftDirty.set(current !== null && JSON.stringify(current) !== JSON.stringify(baseline));
  }

  function enterToolsDraft(systemId = get(selectedSystemId)) {
    if (!systemId) return false;
    toolDraft.set(null);
    toolDraftBaseline.set(null);
    toolDraftSystemId.set(String(systemId));
    toolDraftSourceItemUuid.set('');
    toolDraftDirty.set(false);
    toolDraftSaveError.set(null);
    toolDraftValidation.set({ valid: false, errors: ['missing'] });
    patchToolsDraftViewState();
    return true;
  }

  function setFocusedToolDraft(draft, baseline, systemId) {
    toolDraft.set(clonePlain(draft));
    toolDraftBaseline.set(clonePlain(baseline));
    toolDraftSystemId.set(String(systemId || ''));
    toolDraftSourceItemUuid.set('');
    toolDraftSaveError.set(null);
    recomputeToolsDraftDirty();
    toolDraftValidation.set(validateToolDraft());
    patchToolsDraftViewState();
    return true;
  }

  /** Open an unpersisted draft for a brand-new system Tool. */
  function createToolDraft(initialPatch = {}, systemId = get(selectedSystemId)) {
    if (!systemId) return null;
    const patch = initialPatch && typeof initialPatch === 'object' ? initialPatch : {};
    const created = normalizeGatheringLibraryTool({ ...patch, id: randomID() }, randomID);
    setFocusedToolDraft(created, null, systemId);
    return clonePlain(created);
  }

  /**
   * Open the rules editor on one Tool, seeded from the read union (issue 1373): for an inheriting
   * section the draft must state the value a craft will take.
   */
  function openToolDraft(toolId, systemId = get(selectedSystemId)) {
    const id = String(toolId || '');
    if (!id || !systemId) return false;
    const existing = resolvedSystemTools(systemId).find((tool) => String(tool.id) === id);
    if (!existing) return false;
    return setFocusedToolDraft(existing, existing, systemId);
  }

  function patchToolDraft(patch = {}) {
    const current = get(toolDraft);
    if (!current || !patch || typeof patch !== 'object') return false;
    const nested = ['requirement', 'prerequisites', 'bonus', 'breakage', 'onBreak'];
    const merged = { ...current, ...patch };
    for (const key of nested) {
      if (patch[key] && typeof patch[key] === 'object') {
        merged[key] = { ...current[key], ...patch[key] };
      }
    }
    toolDraft.set(normalizeGatheringLibraryTool(merged, randomID));
    toolDraftSaveError.set(null);
    recomputeToolsDraftDirty();
    toolDraftValidation.set(validateToolDraft());
    patchToolsDraftViewState();
    return true;
  }

  function updateToolsDraft(mutator) {
    if (typeof mutator !== 'function') return false;
    const current = get(toolDraft);
    if (!current) return false;
    const next = mutator([clonePlain(current)]);
    return Array.isArray(next) && next[0] ? patchToolDraft(next[0]) : false;
  }

  /**
   * Register a first-class item-sourced Tool from a dropped Item uuid (issue 561): `componentId:
   * null`, its own source refs, and the durable `roles[systemId].toolId` stamped on the Item.
   */
  async function addToolFromUuidToDraft(itemUuid) {
    if (!get(toolDraft) && !createToolDraft()) return false;
    return stageToolDraftSource(itemUuid);
  }

  function stageToolDraftSource(itemUuid, snapshot = {}) {
    const uuid = String(itemUuid || '').trim();
    if (!uuid || !get(toolDraft)) return false;
    toolDraftSourceItemUuid.set(uuid);
    return patchToolDraft({
      ...snapshot,
      componentId: null,
      registeredItemUuid: uuid,
      originItemUuid: uuid,
      aliasItemUuids: [],
    });
  }

  function unlinkToolDraftSource() {
    if (!get(toolDraft)) return false;
    toolDraftSourceItemUuid.set('');
    return patchToolDraft({
      componentId: null,
      registeredItemUuid: null,
      originItemUuid: null,
      aliasItemUuids: [],
      name: null,
      img: null,
      description: '',
    });
  }

  function updateToolInDraft(toolId, patch = {}) {
    if (!toolId || typeof patch !== 'object' || patch === null) return false;
    if (String(get(toolDraft)?.id || '') !== String(toolId) && !openToolDraft(toolId)) return false;
    return patchToolDraft(patch);
  }

  async function deleteToolFromDraft(toolId) {
    const id = String(toolId || get(toolDraft)?.id || '');
    if (!id) return false;
    if (String(get(toolDraft)?.id || '') !== id && !openToolDraft(id)) return false;
    return deleteToolDraft();
  }

  function selectDraftTool(toolId) {
    return toolId ? openToolDraft(toolId) : false;
  }

  function setExpandedDraftTool(toolId) {
    return toolId ? openToolDraft(toolId) : false;
  }

  function validateToolsDraft() {
    const result = validateToolDraft();
    return result.valid
      ? { valid: true, errors: [] }
      : { valid: false, errors: [{ id: get(toolDraft)?.id || '', errors: result.errors }] };
  }

  function validateToolDraft(toolId = get(toolDraft)?.id) {
    const id = String(toolId || '');
    const tool = get(toolDraft);
    if (String(tool?.id || '') !== id) return { valid: false, errors: ['missing'] };
    if (!tool) return { valid: false, errors: ['missing'] };
    const result = Tool.fromJSON(tool).validate();
    return { valid: result.valid, errors: result.errors };
  }

  function isToolDraftDirty(toolId = get(toolDraft)?.id) {
    return String(toolId || '') === String(get(toolDraft)?.id || '') && get(toolDraftDirty);
  }

  async function saveToolDraft() {
    const systemId = get(toolDraftSystemId);
    const draft = get(toolDraft);
    if (!systemId || !draft) return false;
    if (!get(toolDraftDirty)) return true;
    const validation = validateToolDraft();
    toolDraftValidation.set(validation);
    if (!validation.valid) {
      toolDraftSaveError.set('invalid');
      patchToolsDraftViewState();
      return false;
    }
    const systemManager = services.getCraftingSystemManager?.();
    if (typeof systemManager?.upsertTool !== 'function') return false;
    toolDraftSaving.set(true);
    toolDraftSaveError.set(null);
    patchToolsDraftViewState();
    try {
      const itemUuid = get(toolDraftSourceItemUuid);
      // Section-aware: `toolRecordForSave` restores every inheriting section from the live
      // in-system record, so a union-seeded draft cannot write the world's answer as an override.
      const result = await systemManager.upsertTool(
        systemId,
        toolRecordForSave(systemId, draft),
        itemUuid ? { itemUuid } : {}
      );
      if (!result?.item) throw new Error('Tool save returned no item');
      const persisted = normalizeGatheringLibraryTool(result.item, randomID);
      // The editor goes back to the union, not to the record the manager just wrote: an
      // inheriting section's persisted value is deliberately not what this screen shows.
      const saved =
        resolvedSystemTools(systemId).find((tool) => String(tool.id) === String(persisted.id)) ||
        persisted;
      toolDraft.set(clonePlain(saved));
      toolDraftBaseline.set(clonePlain(saved));
      toolDraftSourceItemUuid.set('');
      toolDraftDirty.set(false);
      toolDraftValidation.set(validateToolDraft(saved.id));
      await refresh();
      return true;
    } catch (error) {
      toolDraftSaveError.set(error?.message || 'save');
      services.notify?.error?.(
        services.localize?.('FABRICATE.Admin.Manager.Tools.Editor.SaveFailed') ||
          'The Tool could not be saved. Try again.'
      );
      return false;
    } finally {
      toolDraftSaving.set(false);
      patchToolsDraftViewState();
    }
  }

  function discardToolDraft() {
    const baseline = get(toolDraftBaseline);
    if (baseline) {
      toolDraft.set(clonePlain(baseline));
      toolDraftDirty.set(false);
      toolDraftSaveError.set(null);
      toolDraftSourceItemUuid.set('');
      toolDraftValidation.set(validateToolDraft(baseline.id));
      patchToolsDraftViewState();
      return true;
    }
    return cancelToolsDraft();
  }

  async function deleteToolDraft() {
    const draft = get(toolDraft);
    const systemId = get(toolDraftSystemId);
    if (!draft || !systemId) return false;
    const persisted = get(toolDraftBaseline) !== null;
    toolDraftSaving.set(true);
    patchToolsDraftViewState();
    try {
      if (persisted) {
        const systemManager = services.getCraftingSystemManager?.();
        if (typeof systemManager?.deleteTool !== 'function') return false;
        const result = await systemManager.deleteTool(systemId, draft.id);
        if (result?.deleted !== true) return false;
      }
      toolDraft.set(null);
      toolDraftBaseline.set(null);
      toolDraftSourceItemUuid.set('');
      toolDraftDirty.set(false);
      toolDraftSaveError.set(null);
      toolDraftValidation.set({ valid: false, errors: ['missing'] });
      await refresh();
      patchToolsDraftViewState();
      return true;
    } catch (error) {
      toolDraftSaveError.set(error?.message || 'delete');
      services.notify?.error?.(
        services.localize?.('FABRICATE.Admin.Manager.Tools.Editor.DeleteFailed') ||
          'The Tool could not be deleted. Try again.'
      );
      return false;
    } finally {
      toolDraftSaving.set(false);
      patchToolsDraftViewState();
    }
  }

  /** Write a few fields onto one system's live Tool record without committing the open draft. */
  async function writeLiveTool(toolId, systemId, patch, failureKey, failureFallback) {
    const systemManager = services.getCraftingSystemManager?.();
    const live = systemTools(systemId).find((tool) => String(tool.id) === String(toolId));
    if (!live || typeof systemManager?.upsertTool !== 'function') return false;
    try {
      const result = await systemManager.upsertTool(systemId, { ...live, ...patch });
      if (!result?.item) return false;
      const saved = normalizeGatheringLibraryTool(result.item, randomID);
      if (String(get(toolDraft)?.id || '') === String(saved.id)) {
        const written = Object.fromEntries(Object.keys(patch).map((key) => [key, saved[key]]));
        if (get(toolDraftDirty)) {
          toolDraft.update((draft) => ({ ...draft, ...written }));
          toolDraftBaseline.update((baseline) =>
            baseline ? { ...baseline, ...written } : baseline
          );
        } else {
          // The union, not the record the manager handed back (issue 1373): `saved` is the raw
          // in-system record, and re-seeding a clean draft from it would restore the inherited value.
          const resolved =
            resolvedSystemTools(systemId).find((tool) => String(tool.id) === String(saved.id)) ||
            saved;
          toolDraft.set(clonePlain(resolved));
          toolDraftBaseline.set(clonePlain(resolved));
        }
        recomputeToolsDraftDirty();
      }
      await refresh();
      patchToolsDraftViewState();
      return true;
    } catch {
      services.notify?.error?.(services.localize?.(failureKey) || failureFallback);
      return false;
    }
  }

  async function toggleToolEnabled(toolId, enabled, systemId = get(selectedSystemId)) {
    return writeLiveTool(
      toolId,
      systemId,
      { enabled: enabled === true },
      'FABRICATE.Admin.Manager.Tools.Editor.ToggleFailed',
      'The Tool status could not be changed. Try again.'
    );
  }

  /**
   * Move one world-default section between following the world Tool and this system's own. Turning
   * inheritance on writes the switch alone; turning it off seeds the override from the value that
   * was on screen. `ui-integration` `### Tools Tab`, requirement 15 clause 1a (issue 1373).
   */
  async function setToolSectionInherited(
    toolId,
    section,
    inherit,
    systemId = get(selectedSystemId)
  ) {
    const target = String(toolId || '').trim();
    const system = String(systemId || '').trim();
    if (!target || !system || typeof inherit !== 'boolean') return false;
    // Read before the write: once the switch says overriding, the union answers this section from
    // the in-system record, so the world value the GM was looking at is no longer reachable here.
    const shown = inherit
      ? undefined
      : resolvedSystemTools(system).find((tool) => String(tool.id) === target)?.[section];
    const written = await getWorldScopeTool().setSectionInherited(target, system, section, inherit);
    if (written !== true) return false;
    if (inherit || shown === undefined) {
      await refresh();
      syncToolDraftSection(target, system, section);
      return true;
    }
    return writeLiveTool(
      target,
      system,
      { [section]: clonePlain(shown) },
      'FABRICATE.Admin.Manager.Tools.Editor.InheritFailed',
      'This section could not be set for this system. Try again.'
    );
  }

  /**
   * Stop using one world Tool in one crafting system (issue 1373), the inverse of {@link
   * adoptWorldTool}.
   */
  async function removeToolFromSystem(toolId, systemId = get(selectedSystemId)) {
    const target = String(toolId || '').trim();
    const system = String(systemId || '').trim();
    if (!target || !system) return false;
    const systemManager = services.getCraftingSystemManager?.();
    if (typeof systemManager?.deleteTool !== 'function') return false;
    try {
      const deleted = await systemManager.deleteTool(system, target);
      if (deleted?.deleted !== true) return false;
    } catch (error) {
      services.notify?.error?.(
        services.localize?.('FABRICATE.Admin.Manager.Tools.Editor.RemoveFromSystemFailed') ||
          `The Tool could not be removed from this system. ${error?.message || ''}`.trim()
      );
      return false;
    }
    await getWorldScopeTool().removeFromSystem(target, system);
    if (String(get(toolDraft)?.id || '') === target) {
      toolDraft.set(null);
      toolDraftBaseline.set(null);
      toolDraftSourceItemUuid.set('');
      toolDraftDirty.set(false);
      toolDraftSaveError.set(null);
      toolDraftValidation.set({ valid: false, errors: ['missing'] });
    }
    await refresh();
    patchToolsDraftViewState();
    return true;
  }

  async function saveAllDirtyToolDrafts() {
    return saveToolDraft();
  }

  async function saveToolsDraft() {
    return saveAllDirtyToolDrafts();
  }

  function cancelToolsDraft() {
    toolDraft.set(null);
    toolDraftBaseline.set(null);
    toolDraftSystemId.set('');
    toolDraftSourceItemUuid.set('');
    toolDraftDirty.set(false);
    toolDraftSaveError.set(null);
    toolDraftValidation.set({ valid: false, errors: ['missing'] });
    patchToolsDraftViewState();
    return true;
  }

  function isToolsDraftDirty() {
    return get(toolDraftDirty) && get(toolDraft) !== null;
  }

  async function confirmDiscardDirtyToolsDraft() {
    if (!isToolsDraftDirty()) return true;
    if (dirtyToolsDraftDiscardConfirmation) return dirtyToolsDraftDiscardConfirmation;
    dirtyToolsDraftDiscardConfirmation = (async () => {
      const result = await services.confirmDialog?.({
        title:
          services.localize?.('FABRICATE.Admin.Manager.Tools.DiscardDirty.Title') ||
          'Discard unsaved tool changes?',
        content:
          services.localize?.('FABRICATE.Admin.Manager.Tools.DiscardDirty.Content') ||
          'The tools library has unsaved changes. Discard them and continue?',
        yes: {
          label:
            services.localize?.('FABRICATE.Admin.Manager.Tools.DiscardDirty.Confirm') ||
            'Discard changes',
          callback: () => true,
        },
        no: {
          label:
            services.localize?.('FABRICATE.Admin.Manager.Tools.DiscardDirty.Cancel') ||
            'Keep editing',
          callback: () => false,
        },
      });
      return result === true;
    })();
    try {
      return await dirtyToolsDraftDiscardConfirmation;
    } finally {
      dirtyToolsDraftDiscardConfirmation = null;
    }
  }

  /**
   * The same library through the read union — what a craft will actually do. A display read and
   * never a write source; {@link toolRecordForSave} keeps the two apart. `ui-integration`
   * `### Tools Tab` states the rule, on requirement 15 clause 1a (issue 1373).
   */
  function resolvedSystemTools(systemId) {
    const id = String(systemId || get(selectedSystemId) || '');
    if (!id) return [];
    const system = services.getCraftingSystemManager?.()?.getSystem?.(id) || null;
    if (!system) return [];
    return resolvedToolsFor(system, worldToolCorpus()).map((tool) =>
      normalizeGatheringLibraryTool(tool, randomID)
    );
  }

  /**
   * One `(tool, system)` pair's world membership record, the only carrier of the per-section
   * inherit switch.
   */
  function toolMembership(toolId, systemId) {
    return findMembership(worldToolCorpus()?.membership, toolId, systemId);
  }

  /**
   * The record a save actually persists: the draft, with every inheriting section restored from the
   * live in-system record. The save reads the switch, not the draft, because persisting the draft
   * whole would freeze one moment's world default onto this system with nothing going red.
   * `ui-integration` `### Tools Tab` states it (issue 1373).
   */
  function toolRecordForSave(systemId, draft) {
    const record = clonePlain(draft);
    const id = String(record?.id ?? '');
    const membership = toolMembership(id, systemId);
    if (!membership) return record;
    const live = systemTools(systemId).find((tool) => String(tool.id) === id) || null;
    if (!live) return record;
    for (const section of TOOL_SECTIONS) {
      if (!isSectionInherited(membership, section)) continue;
      if (section in live) record[section] = clonePlain(live[section]);
      else delete record[section];
    }
    return record;
  }

  /**
   * Re-read one section of the open draft from the read union, after a membership write moved it.
   */
  function syncToolDraftSection(toolId, systemId, section) {
    if (String(get(toolDraft)?.id || '') !== String(toolId)) return;
    const resolved = resolvedSystemTools(systemId).find(
      (tool) => String(tool.id) === String(toolId)
    );
    if (!resolved) return;
    const written = { [section]: clonePlain(resolved[section]) };
    toolDraft.update((draft) => (draft ? { ...draft, ...written } : draft));
    toolDraftBaseline.update((baseline) => (baseline ? { ...baseline, ...written } : baseline));
    recomputeToolsDraftDirty();
    toolDraftValidation.set(validateToolDraft());
    patchToolsDraftViewState();
  }

  return {
    createToolDraft,
    openToolDraft,
    patchToolDraft,
    stageToolDraftSource,
    unlinkToolDraftSource,
    discardToolDraft,
    deleteToolDraft,
    toggleToolEnabled,
    setToolSectionInherited,
    removeToolFromSystem,
    enterToolsDraft,
    updateToolsDraft,
    addToolFromUuidToDraft,
    updateToolInDraft,
    deleteToolFromDraft,
    selectDraftTool,
    setExpandedDraftTool,
    validateToolsDraft,
    validateToolDraft,
    isToolDraftDirty,
    saveToolDraft,
    saveAllDirtyToolDrafts,
    saveToolsDraft,
    cancelToolsDraft,
    isToolsDraftDirty,
    confirmDiscardDirtyToolsDraft,
  };
}
