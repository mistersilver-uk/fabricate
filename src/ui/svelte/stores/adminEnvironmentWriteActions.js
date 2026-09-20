/**
 * The eight environment writes (issue 1708): every action that persists through the gathering
 * environment store. It owns no state — the draft section's writables and its two state helpers
 * arrive as a bag, so the two halves of one section present one API.
 */
import { get } from 'svelte/store';

import {
  buildEnvironmentValidationState,
  environmentErrorMessage,
} from '../../model/environmentValidation.js';

import { clonePlain } from './adminStoreInternals.js';

export function createEnvironmentWriteActions({
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
  nextValidationAttempt,
  setEnvironmentDraftState,
  patchEnvironmentViewState,
  proceedAfterDirtyConfirm,
}) {
  async function cancelEnvironmentDraft() {
    const persistedDraft = get(persistedEnvironmentDraft);
    if (persistedDraft) {
      selectedEnvironmentId.set(persistedDraft.id || '');
      setEnvironmentDraftState(persistedDraft, {
        persistedDraft,
        dirty: false,
        isNew: false,
        saveError: null,
      });
    } else {
      const environments = get(viewState).environments || [];
      const fallback = environments[0] || null;
      selectedEnvironmentId.set(fallback?.id || '');
      setEnvironmentDraftState(fallback, {
        persistedDraft: fallback,
        dirty: false,
        isNew: false,
        saveError: null,
      });
    }
    patchEnvironmentViewState();
    return clonePlain(get(environmentDraft));
  }

  async function saveEnvironmentDraft() {
    const current = get(environmentDraft);
    if (!current) return { ok: false, error: 'No environment draft is selected.' };

    const environmentStore = getEnvironmentStore();
    if (!environmentStore) {
      const message =
        services.localize?.('FABRICATE.Admin.Environments.StoreUnavailable') ||
        'Gathering environment data is not available.';
      environmentSaveError.set(message);
      environmentValidationState.set(null);
      patchEnvironmentViewState();
      return { ok: false, error: message };
    }

    environmentSaving.set(true);
    environmentSaveError.set(null);
    environmentValidationState.set(null);
    patchEnvironmentViewState();

    try {
      const payload = clonePlain(current);
      let saved;
      if (get(environmentDraftIsNew) || !payload.id) {
        if (!environmentStore.create) {
          throw new Error('Gathering environment store cannot create environments.');
        }
        if (!payload.id) delete payload.id;
        saved = await environmentStore.create(payload);
      } else {
        if (!environmentStore.update) {
          throw new Error('Gathering environment store cannot update environments.');
        }
        saved = await environmentStore.update(payload.id, payload);
      }

      const savedDraft = clonePlain(saved || payload);
      selectedEnvironmentId.set(savedDraft?.id || payload.id || '');
      setEnvironmentDraftState(savedDraft, {
        persistedDraft: savedDraft,
        dirty: false,
        isNew: false,
        saveError: null,
      });
      environmentSaving.set(false);
      await refresh();
      return { ok: true, environment: clonePlain(get(environmentDraft)) };
    } catch (error) {
      const message = environmentErrorMessage(error);
      const validationState = buildEnvironmentValidationState(
        error,
        get(environmentDraft),
        services.localize,
        nextValidationAttempt()
      );
      environmentSaving.set(false);
      environmentSaveError.set(message);
      environmentValidationState.set(validationState);
      patchEnvironmentViewState();
      return { ok: false, error: message, validation: clonePlain(validationState) };
    }
  }

  async function duplicateEnvironmentDraft(environmentId = get(selectedEnvironmentId)) {
    const sourceId = environmentId || get(environmentDraft)?.id || '';
    if (!sourceId) return null;
    if (!(await proceedAfterDirtyConfirm())) return null;

    const environmentStore = getEnvironmentStore();
    if (!environmentStore?.duplicate) return null;

    try {
      const duplicate = await environmentStore.duplicate(sourceId);
      if (!duplicate) return null;
      selectedEnvironmentId.set(duplicate.id || '');
      setEnvironmentDraftState(duplicate, {
        persistedDraft: duplicate,
        dirty: false,
        isNew: false,
        saveError: null,
      });
      await refresh();
      return clonePlain(get(environmentDraft));
    } catch (error) {
      environmentSaveError.set(environmentErrorMessage(error));
      environmentValidationState.set(null);
      patchEnvironmentViewState();
      return null;
    }
  }

  async function deleteEnvironmentDraft(environmentId = get(selectedEnvironmentId)) {
    const targetId = environmentId || get(environmentDraft)?.id || '';
    if (!targetId) {
      if (!(await proceedAfterDirtyConfirm())) return false;
      await cancelEnvironmentDraft();
      return false;
    }

    const environmentStore = getEnvironmentStore();
    if (!environmentStore?.delete) return false;

    const currentEnvironments = get(viewState).environments || [];
    const selectedIdBeforeDelete = get(selectedEnvironmentId);
    const deletingSelectedDraft =
      targetId === selectedIdBeforeDelete || targetId === get(environmentDraft)?.id;
    const targetIndex = currentEnvironments.findIndex((environment) => environment.id === targetId);
    const targetEnvironment =
      currentEnvironments.find((environment) => environment.id === targetId) ||
      get(environmentDraft);
    // The name is raw in the TITLE (ApplicationV2 assigns it through `innerText`, so
    // escaping there would surface a literal `&#39;`) and escaped in the CONTENT, which is
    // HTML.
    const environmentName = String(targetEnvironment?.name || targetId);
    const escapedEnvironmentName = escapeHtml(environmentName);
    const confirmed = await services.confirmDialog?.({
      title:
        services.localize?.('FABRICATE.Admin.Environments.DeleteTitle', {
          name: environmentName,
        }) || `Delete ${environmentName}?`,
      content: `<p>${
        services.localize?.('FABRICATE.Admin.Environments.DeleteContent', {
          name: escapedEnvironmentName,
        }) ||
        `Delete gathering environment <strong>${escapedEnvironmentName}</strong>? This also cleans active and historical gathering runs that reference it.`
      }</p>`,
      ...deleteConfirmButtons(),
    });
    if (!confirmed) return false;

    try {
      const deleted = await environmentStore.delete(targetId);
      if (!deleted) return false;
      const remaining = currentEnvironments.filter((environment) => environment.id !== targetId);
      if (deletingSelectedDraft) {
        const next =
          remaining[Math.min(Math.max(targetIndex, 0), Math.max(remaining.length - 1, 0))] || null;
        selectedEnvironmentId.set(next?.id || '');
        setEnvironmentDraftState(next, {
          persistedDraft: next,
          dirty: false,
          isNew: false,
          saveError: null,
        });
      } else {
        selectedEnvironmentId.set(selectedIdBeforeDelete);
        environmentSaveError.set(null);
        environmentValidationState.set(null);
      }
      await refresh();
      return true;
    } catch (error) {
      environmentSaveError.set(environmentErrorMessage(error));
      environmentValidationState.set(null);
      patchEnvironmentViewState();
      return false;
    }
  }

  async function reorderEnvironments(orderedEnvironmentIds = []) {
    const systemId = get(selectedSystemId);
    const environmentStore = getEnvironmentStore();
    if (!systemId || !environmentStore?.reorder) return [];

    try {
      const reordered = await environmentStore.reorder(systemId, orderedEnvironmentIds);
      const environments = Array.isArray(reordered) ? reordered : [];
      const selectedId = get(selectedEnvironmentId);
      if (selectedId && environments.every((environment) => !(environment.id === selectedId))) {
        selectedEnvironmentId.set(environments[0]?.id || '');
        environmentDraftDirty.set(false);
        environmentDraftIsNew.set(false);
      }
      environmentSaveError.set(null);
      environmentValidationState.set(null);
      await refresh();
      return clonePlain(get(viewState).environments || []);
    } catch (error) {
      environmentSaveError.set(environmentErrorMessage(error));
      environmentValidationState.set(null);
      patchEnvironmentViewState();
      return [];
    }
  }

  async function moveEnvironmentDraft(environmentId, direction) {
    const environments = get(viewState).environments || [];
    const index = environments.findIndex((environment) => environment.id === environmentId);
    if (index === -1) return [];

    const nextIndex = direction === 'up' ? index - 1 : index + 1;
    if (nextIndex < 0 || nextIndex >= environments.length) return environments;

    const ordered = environments.map((environment) => environment.id);
    const [moved] = ordered.splice(index, 1);
    ordered.splice(nextIndex, 0, moved);
    return reorderEnvironments(ordered);
  }

  async function toggleEnvironmentEnabled(environmentId, enabled) {
    const targetId = environmentId || '';
    if (!targetId) return false;

    const environmentStore = getEnvironmentStore();
    if (!environmentStore?.update) return false;

    const environments = get(viewState).environments || [];
    const target = environments.find((environment) => environment.id === targetId);
    if (!target) return false;

    const nextEnabled = typeof enabled === 'boolean' ? enabled : target.enabled !== true;
    const payload = {
      ...clonePlain(target),
      enabled: nextEnabled,
    };

    try {
      const saved = clonePlain((await environmentStore.update(targetId, payload)) || payload);
      if (get(selectedEnvironmentId) === targetId || get(environmentDraft)?.id === targetId) {
        if (get(environmentDraftDirty)) {
          const currentDraft = clonePlain(get(environmentDraft));
          if (currentDraft?.id === targetId) {
            environmentDraft.set({
              ...currentDraft,
              enabled: saved.enabled === true,
            });
            persistedEnvironmentDraft.set(saved);
          }
        } else {
          setEnvironmentDraftState(saved, {
            persistedDraft: saved,
            dirty: false,
            isNew: false,
            saveError: null,
          });
        }
      }
      environmentSaveError.set(null);
      environmentValidationState.set(null);
      await refresh();
      return true;
    } catch (error) {
      environmentSaveError.set(environmentErrorMessage(error));
      environmentValidationState.set(null);
      patchEnvironmentViewState();
      return false;
    }
  }

  // Add or remove a realm "tag" on a specific environment's includedRealmIds,
  // persisting immediately. Driven from the Realms tab membership editor; the
  // inverse of the environment editor's own realm selector.
  async function setEnvironmentRealmMembership(environmentId, realmId, included) {
    const targetId = environmentId || '';
    const realm = String(realmId ?? '');
    if (!targetId || !realm) return false;

    const environmentStore = getEnvironmentStore();
    if (!environmentStore?.update) return false;

    const environments = get(viewState).environments || [];
    const target = environments.find((environment) => environment.id === targetId);
    if (!target) return false;

    const current = Array.isArray(target.includedRealmIds) ? target.includedRealmIds : [];
    const has = current.includes(realm);
    if (included === has) return true; // already in the desired state
    const nextIds = included ? [...current, realm] : current.filter((id) => id !== realm);
    const payload = {
      ...clonePlain(target),
      includedRealmIds: nextIds,
    };

    try {
      const saved = clonePlain((await environmentStore.update(targetId, payload)) || payload);
      if (get(selectedEnvironmentId) === targetId || get(environmentDraft)?.id === targetId) {
        if (get(environmentDraftDirty)) {
          const currentDraft = clonePlain(get(environmentDraft));
          if (currentDraft?.id === targetId) {
            environmentDraft.set({
              ...currentDraft,
              includedRealmIds: Array.isArray(saved.includedRealmIds)
                ? saved.includedRealmIds
                : nextIds,
            });
            persistedEnvironmentDraft.set(saved);
          }
        } else {
          setEnvironmentDraftState(saved, {
            persistedDraft: saved,
            dirty: false,
            isNew: false,
            saveError: null,
          });
        }
      }
      environmentSaveError.set(null);
      environmentValidationState.set(null);
      await refresh();
      return true;
    } catch (error) {
      environmentSaveError.set(environmentErrorMessage(error));
      environmentValidationState.set(null);
      patchEnvironmentViewState();
      return false;
    }
  }

  return {
    cancelEnvironmentDraft,
    saveEnvironmentDraft,
    duplicateEnvironmentDraft,
    deleteEnvironmentDraft,
    reorderEnvironments,
    moveEnvironmentDraft,
    toggleEnvironmentEnabled,
    setEnvironmentRealmMembership,
  };
}
