/**
 * The gathering environment editor's draft (issue 1708): the eleven closure variables it owns, the
 * out-of-band publish, the `refresh()` projection, and the discard guard four navigation paths
 * call into. The persisting actions live in `adminEnvironmentWriteActions.js` and are composed in
 * here, so the store sees one section presenting one API.
 */
import { get, writable } from 'svelte/store';

import { ENVIRONMENT_INCLUDED_COMPOSITION_STATES } from '../../../systems/gatheringComposition.js';
import { normalizeNodeRuntime } from '../../../systems/gatheringNodeConfig.js';
import {
  emptyEnvironmentState,
  environmentErrorMessage,
  normalizeDraftBlindSelection,
  normalizeDraftDropRateAdjustmentMap,
  normalizeDraftEventDropRateAdjustmentsEnabled,
  normalizeDraftTaskDropRateAdjustments,
  normalizeDraftTaskDropRateAdjustmentsEnabled,
} from '../../model/environmentValidation.js';

import { createEnvironmentWriteActions } from './adminEnvironmentWriteActions.js';
import { clonePlain } from './adminStoreInternals.js';

/** The authored fields an environment draft accepts; anything else in a patch is ignored. */
const ENVIRONMENT_DRAFT_FIELDS = new Set([
  'name',
  'description',
  'img',
  'enabled',
  'selectionMode',
  'compositionMode',
  'sceneUuid',
  'includedRealmIds',
  'biomes',
  'dangerTags',
  'dangerLevel',
  'eventSelectionMode',
  'eventPolicy',
  'enabledTaskIds',
  'disabledTaskIds',
  'enabledEventIds',
  'disabledEventIds',
  'forcedTaskIds',
  'forcedEventIds',
  'taskOrder',
  'eventOrder',
  'taskDropRateAdjustments',
  'taskDropRateAdjustmentsEnabled',
  'eventDropRateAdjustments',
  'eventDropRateAdjustmentsEnabled',
  'blindSelection',
  'nodeRuntime',
]);

/** The fields normalized as a de-duplicated, trimmed id list. */
const ENVIRONMENT_DRAFT_ID_LISTS = new Set([
  'includedRealmIds',
  'enabledTaskIds',
  'disabledTaskIds',
  'enabledEventIds',
  'disabledEventIds',
  'forcedTaskIds',
  'forcedEventIds',
  'taskOrder',
  'eventOrder',
]);

/** One authored field's normalized value. Every unlisted field is coerced to a string. */
function normalizeEnvironmentDraftField(field, value, normalizeTagList) {
  switch (field) {
    case 'enabled': {
      return value === true;
    }
    case 'compositionMode': {
      return value === 'manual' ? 'manual' : 'automatic';
    }
    case 'sceneUuid':
    case 'img': {
      return String(value ?? '').trim() || null;
    }
    case 'biomes':
    case 'dangerTags': {
      return normalizeTagList(value);
    }
    case 'eventDropRateAdjustments': {
      return normalizeDraftDropRateAdjustmentMap(value);
    }
    case 'eventDropRateAdjustmentsEnabled': {
      return normalizeDraftEventDropRateAdjustmentsEnabled(value);
    }
    case 'taskDropRateAdjustments': {
      return normalizeDraftTaskDropRateAdjustments(value);
    }
    case 'taskDropRateAdjustmentsEnabled': {
      return normalizeDraftTaskDropRateAdjustmentsEnabled(value);
    }
    case 'blindSelection': {
      return normalizeDraftBlindSelection(value);
    }
    case 'nodeRuntime': {
      return normalizeNodeRuntime(value);
    }
    default: {
      return ENVIRONMENT_DRAFT_ID_LISTS.has(field)
        ? [
            ...new Set(
              (Array.isArray(value) ? value : [])
                .map((entry) => String(entry || '').trim())
                .filter(Boolean)
            ),
          ]
        : String(value ?? '');
    }
  }
}

export function createEnvironmentDraftSection({
  services,
  viewState,
  selectedSystemId,
  refresh,
  escapeHtml,
  deleteConfirmButtons,
  getEnvironmentStore,
  canShowEnvironmentsTab,
  buildCompositionViewModel,
  normalizeGatheringTagList,
}) {
  const selectedEnvironmentId = writable('');
  const selectedEnvironmentSystemId = writable('');
  const environmentDraft = writable(null);
  const persistedEnvironmentDraft = writable(null);
  const environmentDraftDirty = writable(false);
  const environmentDraftIsNew = writable(false);
  const environmentSaving = writable(false);
  const environmentSaveError = writable(null);
  const environmentValidationState = writable(null);
  let environmentValidationAttempt = 0;
  let dirtyEnvironmentDiscardConfirmation = null;

  function setEnvironmentDraftState(
    draft,
    { persistedDraft = draft, dirty = false, isNew = false, saveError = null } = {}
  ) {
    const draftClone = clonePlain(draft);
    environmentDraft.set(draftClone);
    persistedEnvironmentDraft.set(clonePlain(persistedDraft));
    environmentDraftDirty.set(dirty);
    environmentDraftIsNew.set(isNew);
    environmentSaveError.set(saveError);
    environmentValidationState.set(null);
  }

  function clearEnvironmentDraftState({ canShowEnvironmentsTab = false, error = null } = {}) {
    selectedEnvironmentId.set('');
    setEnvironmentDraftState(null, {
      persistedDraft: null,
      dirty: false,
      isNew: false,
      saveError: null,
    });
    return emptyEnvironmentState(canShowEnvironmentsTab, error);
  }

  function currentEnvironmentViewPatch() {
    return {
      selectedEnvironmentId: get(selectedEnvironmentId),
      environmentDraft: clonePlain(get(environmentDraft)),
      environmentDraftDirty: get(environmentDraftDirty),
      environmentDraftIsNew: get(environmentDraftIsNew),
      environmentSaving: get(environmentSaving),
      environmentSaveError: get(environmentSaveError),
      environmentValidationState: clonePlain(get(environmentValidationState)),
      environmentComposition: clonePlain(buildCompositionViewModel(get(environmentDraft))),
    };
  }

  function patchEnvironmentViewState() {
    viewState.update((state) => ({
      ...state,
      ...currentEnvironmentViewPatch(),
    }));
  }

  function newEnvironmentDraft(systemId) {
    return {
      craftingSystemId: systemId,
      name:
        services.localize?.('FABRICATE.Admin.Environments.NewEnvironmentName') ||
        'New Gathering Environment',
      description: '',
      enabled: false,
      selectionMode: 'targeted',
      dangerLevel: 'safe',
      sceneUuid: null,
    };
  }

  function hasDirtyEnvironmentDraft() {
    return get(environmentDraftDirty) === true && !!get(environmentDraft);
  }

  async function confirmDiscardDirtyEnvironmentDraft() {
    if (!hasDirtyEnvironmentDraft()) return 'discard';
    if (dirtyEnvironmentDiscardConfirmation) return dirtyEnvironmentDiscardConfirmation;

    const localizeFn = services.localize;
    dirtyEnvironmentDiscardConfirmation = (async () => {
      try {
        const content = `<p>${
          localizeFn?.('FABRICATE.Admin.Environments.DiscardDirtyContent') ||
          'The current gathering environment has unsaved changes. Save them and continue?'
        }</p>`;
        if (typeof services.choiceDialog !== 'function') {
          // Fall back to the two-way confirm when no three-way dialog is available.
          const confirmed = await services.confirmDialog?.({
            title:
              localizeFn?.('FABRICATE.Admin.Environments.DiscardDirtyTitle') ||
              'Discard unsaved environment changes?',
            content,
            yes: {
              label:
                localizeFn?.('FABRICATE.Admin.Environments.DiscardDirtyConfirm') ||
                'Discard Changes',
              callback: () => true,
            },
            no: {
              label:
                localizeFn?.('FABRICATE.Admin.Environments.DiscardDirtyCancel') || 'Keep Editing',
              callback: () => false,
            },
          });
          return confirmed === true ? 'discard' : 'cancel';
        }
        const action = await services.choiceDialog({
          title:
            localizeFn?.('FABRICATE.Admin.Manager.NavigationDirty.Title') ||
            'Save unsaved changes?',
          content,
          choices: [
            {
              action: 'save',
              label: localizeFn?.('FABRICATE.Admin.Manager.NavigationDirty.Save') || 'Save',
              icon: 'fas fa-save',
            },
            {
              action: 'discard',
              label:
                localizeFn?.('FABRICATE.Admin.Manager.NavigationDirty.Discard') ||
                'Discard Changes',
              icon: 'fas fa-trash',
            },
            {
              action: 'cancel',
              label:
                localizeFn?.('FABRICATE.Admin.Manager.NavigationDirty.Cancel') || 'Keep Editing',
              icon: 'fas fa-times',
            },
          ],
          defaultAction: 'save',
        });
        return action === 'save' || action === 'discard' ? action : 'cancel';
      } finally {
        dirtyEnvironmentDiscardConfirmation = null;
      }
    })();

    return dirtyEnvironmentDiscardConfirmation;
  }

  // Resolve a dirty environment draft for an action that would leave it: true to proceed, false to
  // abort. On 'save' the draft is persisted (abort if it fails validation); 'discard' proceeds.
  async function proceedAfterDirtyConfirm() {
    const action = await confirmDiscardDirtyEnvironmentDraft();
    if (action === 'cancel') return false;
    if (action === 'save') {
      const result = await writeActions.saveEnvironmentDraft();
      return result?.ok !== false;
    }
    return true;
  }

  async function discardDirtyForNavigation() {
    if (!hasDirtyEnvironmentDraft()) return true;
    const action = await confirmDiscardDirtyEnvironmentDraft();
    if (action === 'cancel') return false;
    if (action === 'save') {
      const result = await writeActions.saveEnvironmentDraft();
      return result?.ok !== false;
    }
    await writeActions.cancelEnvironmentDraft();
    return true;
  }

  async function buildState(selectedSystem) {
    if (!canShowEnvironmentsTab(selectedSystem)) {
      selectedEnvironmentId.set('');
      selectedEnvironmentSystemId.set(selectedSystem?.id || '');
      return clearEnvironmentDraftState();
    }

    if (get(selectedEnvironmentSystemId) !== selectedSystem.id) {
      selectedEnvironmentId.set('');
      selectedEnvironmentSystemId.set(selectedSystem.id);
      setEnvironmentDraftState(null, { persistedDraft: null });
    }

    const environmentStore = getEnvironmentStore();
    if (!environmentStore?.listBySystem) {
      return clearEnvironmentDraftState({
        canShowEnvironmentsTab: true,
        error:
          services.localize?.('FABRICATE.Admin.Environments.StoreUnavailable') ||
          'Gathering environment store is not available.',
      });
    }

    try {
      const rawEnvironments = await environmentStore.listBySystem(selectedSystem.id);
      const environments = clonePlain(Array.isArray(rawEnvironments) ? rawEnvironments : []);
      const environmentTaskCounts = {};
      for (const environment of environments) {
        const counts = buildCompositionViewModel(environment)?.counts || {};
        environmentTaskCounts[String(environment.id)] = {
          availableTaskCount: counts.availableTasks || 0,
          availableEventCount: counts.availableEvents || 0,
          requiredToolCount: counts.requiredTools || 0,
        };
      }
      let environmentId = get(selectedEnvironmentId);
      const canKeepNewDraft =
        get(environmentDraftIsNew) &&
        get(environmentDraftDirty) &&
        get(environmentDraft)?.craftingSystemId === selectedSystem.id;

      if (canKeepNewDraft) {
        environmentId = '';
      } else if (environments.every((environment) => !(environment.id === environmentId))) {
        environmentId = environments[0]?.id || '';
        selectedEnvironmentId.set(environmentId);
      }

      if (!canKeepNewDraft) {
        const persistedDraft = environmentId
          ? clonePlain(environments.find((environment) => environment.id === environmentId) || null)
          : null;
        const canPreserveDirtyDraft =
          get(environmentDraftDirty) &&
          get(environmentDraft)?.id === environmentId &&
          get(environmentDraft)?.craftingSystemId === selectedSystem.id;

        if (canPreserveDirtyDraft) {
          persistedEnvironmentDraft.set(clonePlain(persistedDraft));
        } else {
          setEnvironmentDraftState(persistedDraft, {
            persistedDraft,
            dirty: false,
            isNew: false,
            saveError: null,
          });
        }
      }

      return {
        canShowEnvironmentsTab: true,
        environmentsLoading: false,
        environmentsError: null,
        environments,
        environmentTaskCounts,
        ...currentEnvironmentViewPatch(),
      };
    } catch (error) {
      return clearEnvironmentDraftState({
        canShowEnvironmentsTab: true,
        error: environmentErrorMessage(error),
      });
    }
  }

  async function selectEnvironment(environmentId) {
    // A default parameter only covers `undefined`, and every falsy id must clear the selection.
    // eslint-disable-next-line unicorn/prefer-default-parameters
    const nextEnvironmentId = environmentId || '';
    if (nextEnvironmentId === get(selectedEnvironmentId)) return true;
    if (!(await proceedAfterDirtyConfirm())) return false;

    selectedEnvironmentId.set(nextEnvironmentId);
    environmentDraftDirty.set(false);
    environmentDraftIsNew.set(false);
    environmentSaveError.set(null);
    environmentValidationState.set(null);
    await refresh();
    return true;
  }

  async function createEnvironmentDraft() {
    const systemManager = services.getCraftingSystemManager();
    const system = systemManager?.getSystem?.(get(selectedSystemId)) || null;
    if (!canShowEnvironmentsTab(system)) return null;
    if (!(await proceedAfterDirtyConfirm())) return null;

    selectedEnvironmentId.set('');
    setEnvironmentDraftState(newEnvironmentDraft(system.id), {
      persistedDraft: null,
      dirty: true,
      isNew: true,
      saveError: null,
    });
    patchEnvironmentViewState();
    return clonePlain(get(environmentDraft));
  }

  function updateEnvironmentDraft(updates = {}) {
    const current = get(environmentDraft);
    if (!current || typeof updates !== 'object' || updates === null) return false;

    const next = clonePlain(current);
    for (const [field, value] of Object.entries(updates)) {
      if (!ENVIRONMENT_DRAFT_FIELDS.has(field)) continue;
      next[field] = normalizeEnvironmentDraftField(field, value, normalizeGatheringTagList);
    }

    environmentDraft.set(next);
    environmentDraftDirty.set(true);
    environmentSaveError.set(null);
    environmentValidationState.set(null);
    patchEnvironmentViewState();
    return true;
  }

  function compositionFieldKeys(kind) {
    return kind === 'event'
      ? {
          enabledKey: 'enabledEventIds',
          disabledKey: 'disabledEventIds',
          orderKey: 'eventOrder',
          forcedKey: 'forcedEventIds',
        }
      : {
          enabledKey: 'enabledTaskIds',
          disabledKey: 'disabledTaskIds',
          orderKey: 'taskOrder',
          forcedKey: 'forcedTaskIds',
        };
  }

  function compositionIdArray(value) {
    return Array.isArray(value)
      ? value.map((entry) => String(entry || '').trim()).filter(Boolean)
      : [];
  }

  function setEnvironmentCompositionMode(mode) {
    return updateEnvironmentDraft({ compositionMode: mode === 'manual' ? 'manual' : 'automatic' });
  }

  function includeEnvironmentRecord(kind, recordId) {
    const current = get(environmentDraft);
    if (!current) return false;
    const id = String(recordId || '').trim();
    if (!id) return false;
    const { enabledKey, disabledKey, orderKey } = compositionFieldKeys(kind);
    const enabled = compositionIdArray(current[enabledKey]);
    const disabled = compositionIdArray(current[disabledKey]).filter((entry) => entry !== id);
    const order = compositionIdArray(current[orderKey]);
    if (!enabled.includes(id)) enabled.push(id);
    if (!order.includes(id)) order.push(id);
    return updateEnvironmentDraft({
      [enabledKey]: enabled,
      [disabledKey]: disabled,
      [orderKey]: order,
    });
  }

  function forceIncludeEnvironmentRecord(kind, recordId) {
    const current = get(environmentDraft);
    if (!current) return false;
    const id = String(recordId || '').trim();
    if (!id) return false;
    const { disabledKey, orderKey, forcedKey } = compositionFieldKeys(kind);
    const disabled = compositionIdArray(current[disabledKey]).filter((entry) => entry !== id);
    const order = compositionIdArray(current[orderKey]);
    const forced = compositionIdArray(current[forcedKey]);
    if (!forced.includes(id)) forced.push(id);
    if (!order.includes(id)) order.push(id);
    return updateEnvironmentDraft({
      [forcedKey]: forced,
      [disabledKey]: disabled,
      [orderKey]: order,
    });
  }

  function excludeEnvironmentRecord(kind, recordId) {
    const current = get(environmentDraft);
    if (!current) return false;
    const id = String(recordId || '').trim();
    if (!id) return false;
    const { enabledKey, disabledKey, forcedKey } = compositionFieldKeys(kind);
    const enabled = compositionIdArray(current[enabledKey]).filter((entry) => entry !== id);
    const forced = compositionIdArray(current[forcedKey]).filter((entry) => entry !== id);
    const disabled = compositionIdArray(current[disabledKey]).filter((entry) => entry !== id);
    if (current.compositionMode !== 'manual') disabled.push(id);
    return updateEnvironmentDraft({
      [enabledKey]: enabled,
      [disabledKey]: disabled,
      [forcedKey]: forced,
    });
  }

  function restoreEnvironmentRecord(kind, recordId) {
    const current = get(environmentDraft);
    if (!current) return false;
    const id = String(recordId || '').trim();
    if (!id) return false;
    const { disabledKey } = compositionFieldKeys(kind);
    const disabled = compositionIdArray(current[disabledKey]).filter((entry) => entry !== id);
    return updateEnvironmentDraft({ [disabledKey]: disabled });
  }

  function reorderEnvironmentRecord(kind, fromIndex, toIndex) {
    const current = get(environmentDraft);
    if (!current) return false;
    const viewModel = buildCompositionViewModel(current);
    const records = kind === 'event' ? viewModel.events : viewModel.tasks;
    // Both kinds filter on the shared four-state included set, not `runtimeState`, which requires
    // `conditionsMet`: an included record whose current weather/time did not match would drop out
    // of `ids`, and this function writes `ids` as the entire new order array, so an ambient runtime
    // condition would silently discard that record's saved rank.
    const ids = records
      .filter((entry) => ENVIRONMENT_INCLUDED_COMPOSITION_STATES.has(entry.compositionState))
      .map((entry) => entry.id);
    const from = Number(fromIndex);
    const to = Number(toIndex);
    if (!Number.isInteger(from) || !Number.isInteger(to)) return false;
    if (from < 0 || from >= ids.length || to < 0 || to >= ids.length || from === to) return false;
    const [moved] = ids.splice(from, 1);
    ids.splice(to, 0, moved);
    const { orderKey } = compositionFieldKeys(kind);
    return updateEnvironmentDraft({ [orderKey]: ids });
  }

  /** Drop the selection and the draft when the store moves to another crafting system. */
  function resetForSystem(systemId) {
    selectedEnvironmentId.set('');
    selectedEnvironmentSystemId.set(systemId || '');
    setEnvironmentDraftState(null, { persistedDraft: null });
  }

  const writeActions = createEnvironmentWriteActions({
    services,
    viewState,
    selectedSystemId,
    refresh,
    escapeHtml,
    deleteConfirmButtons,
    getEnvironmentStore,
    selectedEnvironmentId,
    environmentDraft,
    persistedEnvironmentDraft,
    environmentDraftDirty,
    environmentDraftIsNew,
    environmentSaving,
    environmentSaveError,
    environmentValidationState,
    nextValidationAttempt: () => ++environmentValidationAttempt,
    setEnvironmentDraftState,
    patchEnvironmentViewState,
    proceedAfterDirtyConfirm,
  });

  // A deleted realm id is definitionally invalid rather than a GM edit, so it leaves an open
  // draft too — dirty drafts survive the post-delete re-read, and a clean one is re-seeded from
  // a record the cascade may have failed to rewrite. Stripping both the draft and its persisted
  // baseline is what stops a later save re-introducing the id (issue 1848).
  function stripRealmFromDraft(realmId) {
    const realm = String(realmId ?? '');
    if (!realm) return;
    const draft = withoutRealmMembership(get(environmentDraft), realm);
    const persisted = withoutRealmMembership(get(persistedEnvironmentDraft), realm);
    if (!draft && !persisted) return;
    if (draft) environmentDraft.set(draft);
    if (persisted) persistedEnvironmentDraft.set(persisted);
    patchEnvironmentViewState();
  }

  // The record with `realmId` gone from both membership lists, or null when it cites neither.
  function withoutRealmMembership(record, realmId) {
    if (!record || typeof record !== 'object') return null;
    const included = Array.isArray(record.includedRealmIds) ? record.includedRealmIds : [];
    const excluded = Array.isArray(record.excludedRealmIds) ? record.excludedRealmIds : [];
    if (!included.includes(realmId) && !excluded.includes(realmId)) return null;
    const next = clonePlain(record);
    if (Array.isArray(record.includedRealmIds)) {
      next.includedRealmIds = included.filter((id) => id !== realmId);
    }
    if (Array.isArray(record.excludedRealmIds)) {
      next.excludedRealmIds = excluded.filter((id) => id !== realmId);
    }
    return next;
  }

  return {
    selectedEnvironmentId,
    selectEnvironment,
    createEnvironmentDraft,
    updateEnvironmentDraft,
    setEnvironmentCompositionMode,
    includeEnvironmentRecord,
    forceIncludeEnvironmentRecord,
    excludeEnvironmentRecord,
    restoreEnvironmentRecord,
    reorderEnvironmentRecord,
    confirmDiscardDirtyEnvironmentDraft,
    ...writeActions,
    buildState,
    resetForSystem,
    discardDirtyForNavigation,
    proceedAfterDirtyConfirm,
    stripRealmFromDraft,
  };
}
