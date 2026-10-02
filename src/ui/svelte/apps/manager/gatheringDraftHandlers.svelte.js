/**
 * The gathering workspace's write side: the environment, task and event library actions, the
 * staged task and event drafts, the task's drop rows and the rail's gathering sections. Every
 * root value is a thunk read at call time, and each route change lands through the root's
 * `confirmRouteExit`, `afterTruthyResult` and `setActiveView`.
 */
import { gatheringDropCountValue, gatheringTaskDropRows } from './gatheringDisplay.js';
import { EVENT_FIELDS, TASK_FIELDS } from './gatheringRouteModel.svelte.js';

const ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

/** `length` base36 characters from the platform CSPRNG; SonarCloud fails a `Math.random()` mint. */
export function randomBase36(length) {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (byte) => ID_ALPHABET[byte % ID_ALPHABET.length]).join('');
}

/** What differs between the task and the event library: names, route, store calls and copy. */
const RECORD_KINDS = Object.freeze({
  task: {
    fields: TASK_FIELDS,
    definitions: 'gatheringTaskDefinitions',
    tab: 'tasks',
    route: 'gathering-task-edit',
    add: (store, systemId) => store.addGatheringLibraryTask?.(systemId),
    update: (store, ...args) => store.updateGatheringLibraryTask?.(...args),
    duplicate: (store, ...args) => store.duplicateGatheringLibraryTask?.(...args),
    remove: (store, ...args) => store.deleteGatheringLibraryTask?.(...args),
    confirmLoss: (store, ...args) => store.confirmGatheringLibraryTaskCompositionLoss?.(...args),
    // A task save lands only on a truthy answer.
    isSaved: Boolean,
    saveFailed: (text) =>
      text('FABRICATE.Admin.Manager.Environment.Tasks.SaveFailed', 'Save failed. Try again.'),
    logLabel: 'Failed to save gathering task draft',
    // A store `false` keeps the editor open; the event library ignores the answer.
    keepsEditorOnRefusal: true,
    clearsSaving: false,
  },
  event: {
    fields: EVENT_FIELDS,
    definitions: 'gatheringEventDefinitions',
    tab: 'encounters',
    route: 'gathering-event-edit',
    add: (store, systemId) => store.addGatheringLibraryEvent?.(systemId),
    update: (store, ...args) => store.updateGatheringLibraryEvent?.(...args),
    duplicate: (store, ...args) => store.duplicateGatheringLibraryEvent?.(...args),
    remove: (store, ...args) => store.deleteGatheringLibraryEvent?.(...args),
    confirmLoss: (store, ...args) => store.confirmGatheringLibraryEventCompositionLoss?.(...args),
    // An event save fails only on a literal `false`.
    isSaved: (ok) => ok !== false,
    saveFailed: (text) =>
      text('FABRICATE.Admin.Manager.Environment.Events.SaveFailed', 'Save failed. Try again.'),
    logLabel: 'Failed to save gathering event draft',
    confirmDelete: (text) => {
      const message = text(
        'FABRICATE.Admin.Manager.Environment.Events.DeleteConfirm',
        'Delete this event? This cannot be undone.'
      );
      return typeof globalThis.confirm === 'function' ? globalThis.confirm(message) : true;
    },
    keepsEditorOnRefusal: false,
    clearsSaving: true,
  },
});

function sectionOpener({ gathering, navRail, setActiveView }) {
  return (tab, view) => {
    gathering.activeGatheringTab = tab;
    navRail().expandGroup('gathering');
    setActiveView(view);
  };
}

function createEnvironmentHandlers(inputs) {
  const { gathering, store, canShowEnvironments, isPromise, afterTruthyResult, setActiveView } =
    inputs;
  const selectedId = () => gathering.selectedEnvironment?.id;
  const openEditor = (value) => {
    if (value !== false && value !== null) setActiveView('environment-edit');
  };

  return {
    selectEnvironment(environmentId = selectedId()) {
      if (!environmentId) return;
      store().selectEnvironment?.(environmentId);
    },
    editEnvironment(environmentId = selectedId()) {
      if (!environmentId || !canShowEnvironments()) return;
      afterTruthyResult(store().selectEnvironment?.(environmentId), () => {
        setActiveView('environment-edit');
      });
    },
    createEnvironment() {
      if (!canShowEnvironments()) return;
      const created = store().createEnvironmentDraft?.();
      if (isPromise(created)) {
        created.then(openEditor);
        return;
      }
      openEditor(created);
    },
    toggleEnvironmentEnabled(environmentId, enabled) {
      if (!environmentId) return;
      store().toggleEnvironmentEnabled?.(environmentId, enabled);
    },
    duplicateEnvironment(environmentId = selectedId()) {
      if (!environmentId) return;
      store().duplicateEnvironmentDraft?.(environmentId);
    },
    deleteEnvironment(environmentId = selectedId()) {
      if (!environmentId) return;
      store().deleteEnvironmentDraft?.(environmentId);
    },
  };
}

/** One record kind's staged draft: clear it, save it, or delete the record it edits. */
function createDraftLifecycle(inputs, kind) {
  const { gathering, store, selectedSystemId, text } = inputs;
  const { fields } = kind;
  const openSection = sectionOpener(inputs);

  function clear() {
    gathering[fields.draft] = null;
    gathering[fields.baseline] = null;
    gathering[fields.saveError] = '';
    if (kind.clearsSaving) gathering[fields.saving] = false;
  }

  // The pre-attempt clear sits after the composition-loss confirmation: a cancelled confirmation
  // makes no attempt, so a standing failure stays on screen (issue 919).
  async function save() {
    if (!gathering[fields.draft] || !selectedSystemId() || !gathering[fields.selectedId])
      return false;
    const { valid, errors } = gathering[fields.validation];
    if (!valid) {
      gathering[fields.saveError] = errors[0] || '';
      return false;
    }
    const proceed =
      (await kind.confirmLoss(
        store(),
        selectedSystemId(),
        gathering[fields.selectedId],
        gathering[fields.draft]
      )) ?? true;
    if (!proceed) return false;
    gathering[fields.saveError] = '';
    gathering[fields.saving] = true;
    try {
      const ok = await kind.update(
        store(),
        selectedSystemId(),
        gathering[fields.selectedId],
        gathering[fields.draft]
      );
      if (kind.isSaved(ok)) {
        gathering[fields.baseline] = JSON.parse(JSON.stringify(gathering[fields.draft]));
        gathering[fields.saveError] = '';
        return true;
      }
      gathering[fields.saveError] = kind.saveFailed(text);
      return false;
    } catch (error) {
      console.error(kind.logLabel, error);
      gathering[fields.saveError] = kind.saveFailed(text);
      return false;
    } finally {
      gathering[fields.saving] = false;
    }
  }

  async function deleteDraft() {
    if (!selectedSystemId() || !gathering[fields.selectedId]) return;
    if (kind.confirmDelete?.(text) === false) return;
    const deletedId = gathering[fields.selectedId];
    const result = await kind.remove(store(), selectedSystemId(), deletedId);
    if (kind.keepsEditorOnRefusal && result === false) return;
    if (gathering[fields.selectedId] === deletedId) gathering[fields.selectedId] = '';
    clear();
    openSection(kind.tab, 'environments');
  }

  return { clear, save, deleteDraft };
}

function createRecordHandlers(inputs, kind) {
  const { gathering, store, selectedSystemId, canShowEnvironments, isPromise } = inputs;
  const { fields } = kind;
  const openSection = sectionOpener(inputs);
  const selectedRecordId = () => gathering[fields.selected]?.id;
  const selectId = (id) => {
    gathering[fields.selectedId] = id;
  };

  function selectCreated(created) {
    if (isPromise(created)) {
      created.then((record) => {
        if (record?.id) selectId(record.id);
      });
      return;
    }
    if (created?.id) selectId(created.id);
  }

  function deselectDeleted(deleted, id) {
    const deselect = (value) => {
      if (value !== false && gathering[fields.selectedId] === id) selectId('');
    };
    if (isPromise(deleted)) {
      deleted.then(deselect);
      return;
    }
    deselect(deleted);
  }

  return {
    ...createDraftLifecycle(inputs, kind),
    select(id = selectedRecordId()) {
      selectId(id || '');
    },
    create(systemId = selectedSystemId()) {
      if (!systemId) return;
      selectCreated(kind.add(store(), systemId));
    },
    edit(id = selectedRecordId()) {
      if (!id || !canShowEnvironments()) return;
      selectId(id);
      const source = gathering[kind.definitions].find((record) => record.id === id) || null;
      const snapshot = source ? JSON.parse(JSON.stringify(source)) : null;
      gathering[fields.draft] = snapshot;
      gathering[fields.baseline] = snapshot ? JSON.parse(JSON.stringify(snapshot)) : null;
      gathering[fields.saveError] = '';
      openSection(kind.tab, kind.route);
    },
    back() {
      inputs.afterTruthyResult(inputs.confirmRouteExit('environments'), () => {
        openSection(kind.tab, 'environments');
      });
    },
    duplicate(systemId = selectedSystemId(), id = selectedRecordId()) {
      if (!systemId || !id) return;
      selectCreated(kind.duplicate(store(), systemId, id));
    },
    remove(systemId = selectedSystemId(), id = selectedRecordId()) {
      if (!systemId || !id) return;
      deselectDeleted(kind.remove(store(), systemId, id), id);
    },
    toggle(systemId = selectedSystemId(), id = selectedRecordId(), enabled = true) {
      if (!systemId || !id) return;
      kind.update(store(), systemId, id, { enabled });
    },
    updateSelected(updates = {}) {
      const draft = gathering[fields.draft];
      if (draft) {
        gathering[fields.draft] = { ...draft, ...updates };
        return true;
      }
      const id = selectedRecordId();
      if (!selectedSystemId() || !id) return false;
      return kind.update(store(), selectedSystemId(), id, updates);
    },
  };
}

function countDigits(input) {
  return String(input.value || '')
    .replaceAll(/\D+/g, '')
    .replace(/^0+/, '');
}

function createDropCountHandlers(updateGatheringTaskDrop) {
  return {
    onGatheringDropCountInput(rowId, event) {
      const input = event.currentTarget;
      const normalized = countDigits(input);
      input.value = normalized;
      const quantity = Number(normalized);
      if (Number.isInteger(quantity) && quantity >= 1 && quantity <= 999)
        updateGatheringTaskDrop(rowId, { quantity });
    },
    onGatheringDropCountBlur(row, event) {
      const input = event.currentTarget;
      const normalized = countDigits(input);
      const quantity = Number(normalized);
      if (normalized !== '' && Number.isInteger(quantity) && quantity >= 1 && quantity <= 999) {
        input.value = String(quantity);
        updateGatheringTaskDrop(row.id, { quantity });
        return;
      }
      input.value = String(gatheringDropCountValue(row));
    },
    onGatheringDropCountKeydown(row, event) {
      event.stopPropagation();
      if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
      event.preventDefault();
      const currentValue =
        event.currentTarget.value === ''
          ? gatheringDropCountValue(row)
          : Number(event.currentTarget.value);
      const quantity = gatheringDropCountValue({
        quantity:
          (Number.isFinite(currentValue) ? currentValue : gatheringDropCountValue(row)) +
          (event.key === 'ArrowUp' ? 1 : -1),
      });
      event.currentTarget.value = String(quantity);
      updateGatheringTaskDrop(row.id, { quantity });
    },
  };
}

function createToolReferenceHandlers({ gathering }, updateTask) {
  const editingTask = () => gathering.editingGatheringTask;
  const toolIds = () => (Array.isArray(editingTask().toolIds) ? editingTask().toolIds : []);

  return {
    addToolReferenceToSelectedTask(toolId) {
      if (!editingTask() || !toolId) return;
      const existing = toolIds();
      if (existing.includes(toolId)) return;
      updateTask({ toolIds: [...existing, toolId] });
    },
    removeToolReferenceFromSelectedTask(toolId) {
      if (!editingTask() || !toolId) return;
      updateTask({ toolIds: toolIds().filter((id) => id !== toolId) });
    },
  };
}

function createDropHandlers({ gathering, store, services, selectedSystemId }, updateTask) {
  const editingTask = () => gathering.editingGatheringTask;
  const selectedDropId = () => gathering.selectedGatheringDrop?.id;

  function gatheringDropRowId() {
    return `drop-${Date.now().toString(36)}-${randomBase36(5)}`;
  }

  function updateGatheringTaskDrop(rowId, updates = {}) {
    if (!editingTask() || !rowId) return;
    const rows = gatheringTaskDropRows(editingTask()).map((row) =>
      row.id === rowId ? { ...row, ...updates } : row
    );
    const patch =
      store().gatheringTaskAutopopulateFromComponent?.(selectedSystemId(), editingTask(), rows) ||
      {};
    updateTask({ dropRows: rows, ...patch });
  }

  return {
    gatheringDropRowId,
    updateGatheringTaskDrop,
    ...createDropCountHandlers(updateGatheringTaskDrop),
    addGatheringTaskDrop() {
      if (!editingTask()) return;
      const row = {
        id: gatheringDropRowId(),
        name: '',
        componentId: '',
        itemUuid: '',
        quantity: 1,
        dropRate: 25,
        conditionModifiers: { biome: [], timeOfDay: [], weather: [] },
        enabled: false,
      };
      gathering.selectedGatheringDropId = row.id;
      updateTask({ dropRows: [...gatheringTaskDropRows(editingTask()), row] });
    },
    duplicateGatheringTaskDrop(rowId = selectedDropId()) {
      if (!editingTask() || !rowId) return;
      const rows = gatheringTaskDropRows(editingTask());
      const index = rows.findIndex((row) => row.id === rowId);
      if (index === -1) return;
      const duplicate = { ...JSON.parse(JSON.stringify(rows[index])), id: gatheringDropRowId() };
      gathering.selectedGatheringDropId = duplicate.id;
      updateTask({ dropRows: [...rows.slice(0, index + 1), duplicate, ...rows.slice(index + 1)] });
    },
    deleteGatheringTaskDrop(rowId = selectedDropId()) {
      if (!editingTask() || !rowId) return;
      const rows = gatheringTaskDropRows(editingTask());
      const index = rows.findIndex((row) => row.id === rowId);
      const nextRows = rows.filter((row) => row.id !== rowId);
      gathering.selectedGatheringDropId = nextRows[Math.min(index, nextRows.length - 1)]?.id || '';
      updateTask({ dropRows: nextRows });
    },
    moveGatheringTaskDrop(rowId, direction) {
      if (!editingTask() || !rowId) return;
      const rows = gatheringTaskDropRows(editingTask());
      const index = rows.findIndex((row) => row.id === rowId);
      if (index === -1) return;
      const target = direction === 'up' ? index - 1 : index + 1;
      if (target < 0 || target >= rows.length) return;
      const next = [...rows];
      next[index] = rows[target];
      next[target] = rows[index];
      updateTask({ dropRows: next });
    },
    // `data` reaches the service exactly as the drop delivered it.
    async importGatheringTaskDrop(rowId, data) {
      if (!rowId) return false;
      const item = await services()?.importSingleManagedItemFromDrop?.(data);
      if (!item?.id) return false;
      updateGatheringTaskDrop(rowId, {
        componentId: item.id,
        itemUuid: '',
        name: '',
        enabled: true,
      });
      gathering.selectedGatheringDropId = rowId;
      return true;
    },
  };
}

function createSectionHandlers(inputs) {
  const { gathering, store, selectedSystemId, canShowEnvironments, navRail } = inputs;
  const openSection = sectionOpener(inputs);
  const offeredTab = (tabId) =>
    gathering.visibleGatheringNavItems.some((tab) => tab.id === tabId) ? tabId : 'environments';

  function openGatheringSection(tabId = 'environments') {
    if (!canShowEnvironments()) return;
    const nextTab = offeredTab(tabId);
    inputs.afterTruthyResult(inputs.confirmRouteExit('environments'), () => {
      openSection(nextTab, 'environments');
    });
  }

  return {
    openGatheringSection,
    updateSelectedGatheringRules(updates) {
      if (!selectedSystemId()) return;
      store().updateGatheringRules?.(selectedSystemId(), updates);
    },
    selectGatheringTab(tabId) {
      gathering.activeGatheringTab = offeredTab(tabId);
      navRail().expandGroup('gathering');
    },
    activateGatheringParent() {
      if (gathering.isActiveGatheringChildRoute) {
        navRail().expandGroup('gathering');
        return;
      }
      openGatheringSection('environments');
    },
  };
}

export function createGatheringDraftHandlers(inputs) {
  const tasks = createRecordHandlers(inputs, RECORD_KINDS.task);
  const events = createRecordHandlers(inputs, RECORD_KINDS.event);

  return {
    ...createEnvironmentHandlers(inputs),
    ...createSectionHandlers(inputs),
    ...createDropHandlers(inputs, tasks.updateSelected),
    ...createToolReferenceHandlers(inputs, tasks.updateSelected),
    selectGatheringTask: tasks.select,
    createGatheringTask: tasks.create,
    editGatheringTask: tasks.edit,
    clearGatheringTaskDraft: tasks.clear,
    backToGatheringTaskLibrary: tasks.back,
    saveGatheringTaskDraft: tasks.save,
    deleteGatheringTaskDraft: tasks.deleteDraft,
    duplicateGatheringTask: tasks.duplicate,
    deleteGatheringTask: tasks.remove,
    toggleGatheringTaskEnabled: tasks.toggle,
    updateSelectedGatheringTask: tasks.updateSelected,
    selectGatheringEvent: events.select,
    createGatheringEvent: events.create,
    editGatheringEvent: events.edit,
    clearGatheringEventDraft: events.clear,
    backToGatheringEventLibrary: events.back,
    saveGatheringEventDraft: events.save,
    deleteGatheringEventDraft: events.deleteDraft,
    duplicateGatheringEvent: events.duplicate,
    deleteGatheringEvent: events.remove,
    toggleGatheringEventEnabled: events.toggle,
    updateSelectedGatheringEvent: events.updateSelected,
  };
}
