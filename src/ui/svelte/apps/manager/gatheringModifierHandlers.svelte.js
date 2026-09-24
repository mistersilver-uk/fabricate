/**
 * How gathering applies modifiers to a task's drop rows and to an event. A drop or an event
 * references Modifier Library entries (with an operator, bounds and an optional expression
 * override) through a search, and carries environment condition modifiers per time of day,
 * weather and biome through a picker and a signed stepper. Every root value is a thunk read at
 * call time; the root runs the five reconcilers from its own `$effect`.
 */
import {
  gatheringModifierDisplayValue,
  gatheringModifierSignedValue,
  gatheringTaskDropRows,
  gatheringVocabularyValues,
  signedToOperatorValue,
} from './gatheringDisplay.js';
import { randomBase36 } from './gatheringDraftHandlers.svelte.js';
import { mergeAccessors } from './gatheringRouteModel.svelte.js';

const CONDITION_KINDS = Object.freeze(['biome', 'timeOfDay', 'weather']);

function rowCharacterModifiers(row) {
  return Array.isArray(row?.characterModifiers) ? row.characterModifiers : [];
}

function characterModifierIsCustomized(ref) {
  if (!ref) return false;
  return Boolean(ref.expressionOverride);
}

function characterModifierOperatorClass(operator) {
  return operator === '-' ? 'is-negative' : 'is-positive';
}

function gatheringConditionModifierRows(row, kind) {
  const values = row?.conditionModifiers?.[kind];
  return Array.isArray(values) ? values : [];
}

function gatheringConditionModifierGroups(row) {
  return {
    timeOfDay: gatheringConditionModifierRows(row, 'timeOfDay'),
    weather: gatheringConditionModifierRows(row, 'weather'),
    biome: gatheringConditionModifierRows(row, 'biome'),
  };
}

function characterModifierRef(modifierId, refs) {
  return {
    id: `char-mod-${modifierId}-${refs.length + 1}-${randomBase36(4)}`,
    modifierId,
    operator: '+',
    min: null,
    max: null,
    expressionOverride: '',
  };
}

function characterModifierSearchClippingBounds(node) {
  const documentRef = globalThis.document;
  const windowRef = globalThis.window || globalThis;
  const viewportTop = 0;
  const viewportBottom =
    Number(globalThis.innerHeight || windowRef.innerHeight) ||
    documentRef?.documentElement?.clientHeight ||
    0;
  let parent = node?.parentElement;
  while (parent && parent !== documentRef?.documentElement) {
    const style = globalThis.getComputedStyle?.(parent);
    const overflow = `${style?.overflow || ''} ${style?.overflowY || ''} ${style?.overflowX || ''}`;
    if (/(auto|scroll|hidden|clip)/.test(overflow)) {
      const rect = parent.getBoundingClientRect?.();
      if (rect) {
        return {
          top: Math.max(viewportTop, rect.top),
          bottom: Math.min(viewportBottom || rect.bottom, rect.bottom),
        };
      }
    }
    parent = parent.parentElement;
  }
  return { top: viewportTop, bottom: viewportBottom };
}

/** The Modifier Library search both subjects share, and which way its suggestions open. */
function createCharacterModifierSearch({ gathering, selectedSystemModifiers }) {
  let characterModifierSearchTerm = $state('');
  let characterModifierSearchAnchor = $state(null);
  let characterModifierSearchOpenUp = $state(false);

  function suggestionsFor(record) {
    const term = characterModifierSearchTerm.trim().toLowerCase();
    if (!term) return [];
    const attached = new Set(
      (record?.characterModifiers || []).map((ref) => ref.modifierId).filter(Boolean)
    );
    return selectedSystemModifiers().filter((entry) => {
      if (attached.has(entry.id)) return false;
      const label = String(entry.label || '').toLowerCase();
      const id = String(entry.id || '').toLowerCase();
      return label.includes(term) || id.includes(term);
    });
  }

  const characterModifierSearchSuggestions = $derived(
    suggestionsFor(gathering.selectedGatheringDrop)
  );
  const eventCharacterModifierSearchSuggestions = $derived(
    suggestionsFor(gathering.editingGatheringEvent)
  );

  function updateCharacterModifierSearchDirection() {
    const node = characterModifierSearchAnchor;
    const rect = node?.getBoundingClientRect?.();
    if (!rect) {
      characterModifierSearchOpenUp = false;
      return;
    }
    const bounds = characterModifierSearchClippingBounds(node);
    const spaceBelow = bounds.bottom - rect.bottom;
    const spaceAbove = rect.top - bounds.top;
    const openUpThreshold = 160;
    characterModifierSearchOpenUp = spaceBelow < openUpThreshold && spaceAbove > spaceBelow;
  }

  return {
    get characterModifierSearchTerm() {
      return characterModifierSearchTerm;
    },
    set characterModifierSearchTerm(term) {
      characterModifierSearchTerm = term;
    },
    get characterModifierSearchAnchor() {
      return characterModifierSearchAnchor;
    },
    set characterModifierSearchAnchor(node) {
      characterModifierSearchAnchor = node;
    },
    get characterModifierSearchOpenUp() {
      return characterModifierSearchOpenUp;
    },
    get characterModifierSearchSuggestions() {
      return characterModifierSearchSuggestions;
    },
    get eventCharacterModifierSearchSuggestions() {
      return eventCharacterModifierSearchSuggestions;
    },
    resetSearchOnDrop() {
      if (gathering.selectedGatheringDrop?.id) characterModifierSearchTerm = '';
    },
    resetSearchOnEvent() {
      if (gathering.editingGatheringEvent?.id) characterModifierSearchTerm = '';
    },
    syncSearchDirection() {
      if (characterModifierSearchSuggestions.length === 0) {
        characterModifierSearchOpenUp = false;
        return;
      }
      updateCharacterModifierSearchDirection();
    },
  };
}

function createPickerSelections(record, availableOptions) {
  const selections = $state({ biome: '', timeOfDay: '', weather: '' });

  return {
    selection: (kind) =>
      kind === 'biome' || kind === 'weather' ? selections[kind] : selections.timeOfDay,
    select(kind, value) {
      if (kind === 'biome' || kind === 'weather') selections[kind] = value;
      else selections.timeOfDay = value;
    },
    reconcile() {
      for (const kind of CONDITION_KINDS) {
        const available = availableOptions(record(), kind);
        if (available.every((option) => option.id !== selections[kind])) {
          selections[kind] = available[0]?.id || '';
        }
      }
    },
  };
}

/** The drop row or the event an edit lands on, read fresh, with the writer that stores it. */
function createEditTargets(gathering, drafts) {
  return {
    dropTarget(rowId, field) {
      if (!gathering.editingGatheringTask || !rowId) return null;
      const row = gatheringTaskDropRows(gathering.editingGatheringTask).find(
        (entry) => entry.id === rowId
      );
      if (!row) return null;
      return {
        record: row,
        write: (value) => drafts.updateGatheringTaskDrop(rowId, { [field]: value }),
      };
    },
    eventTarget(field) {
      const event = gathering.editingGatheringEvent;
      if (!event?.id) return null;
      return {
        record: event,
        write: (value) => drafts.updateSelectedGatheringEvent({ [field]: value }),
      };
    },
  };
}

function writeConditionModifiers(target, kind, change) {
  if (!target) return;
  const conditionModifiers = gatheringConditionModifierGroups(target.record);
  const next = change(conditionModifiers[kind]);
  if (!next) return;
  conditionModifiers[kind] = next;
  target.write(conditionModifiers);
}

/** Arrow Up/Down steps the signed value by one; every keydown stops propagating. */
function stepConditionModifier(modifier, event, write) {
  event.stopPropagation();
  if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
  event.preventDefault();
  const next = signedToOperatorValue(
    String(gatheringModifierSignedValue(modifier) + (event.key === 'ArrowUp' ? 1 : -1))
  );
  event.currentTarget.value = gatheringModifierDisplayValue(next);
  write(next);
}

function createConditionOptions(gathering) {
  function gatheringConditionOptions(kind) {
    const setting = gathering.selectedGatheringSystemConfig.conditions?.[kind] || {};
    return Array.isArray(setting.values) ? setting.values : [];
  }
  function gatheringVocabularyOptions(kind) {
    return gatheringVocabularyValues(gathering.selectedGatheringSystemConfig, kind);
  }
  function gatheringConditionAvailableOptions(row, kind) {
    const options =
      kind === 'biome' ? gatheringVocabularyOptions('biomes') : gatheringConditionOptions(kind);
    if (!row) return options;
    const attached = new Set(
      gatheringConditionModifierRows(row, kind).map((modifier) => modifier.conditionId)
    );
    return options.filter((option) => !attached.has(option.id));
  }
  const drop = createPickerSelections(
    () => gathering.selectedGatheringDrop,
    gatheringConditionAvailableOptions
  );
  const event = createPickerSelections(
    () => gathering.editingGatheringEvent,
    gatheringConditionAvailableOptions
  );

  return {
    gatheringConditionOptions,
    gatheringVocabularyOptions,
    gatheringConditionAvailableOptions,
    gatheringConditionModifierRows,
    gatheringDropModifierPickerSelection: drop.selection,
    setGatheringDropModifierPickerSelection: drop.select,
    gatheringEventModifierPickerSelection: event.selection,
    setGatheringEventModifierPickerSelection: event.select,
    reconcileDropPickers: drop.reconcile,
    reconcileEventPickers: event.reconcile,
  };
}

function createConditionModifierHandlers({ dropTarget, eventTarget }, drafts) {
  const add = (target, kind, conditionId) =>
    writeConditionModifiers(target, kind, (rows) =>
      rows.some((modifier) => modifier.conditionId === conditionId)
        ? null
        : [
            ...rows,
            { id: `${kind}-${drafts.gatheringDropRowId()}`, conditionId, operator: '+', value: 0 },
          ]
    );
  const update = (target, kind, modifierId, updates) =>
    writeConditionModifiers(target, kind, (rows) =>
      rows.map((modifier) => (modifier.id === modifierId ? { ...modifier, ...updates } : modifier))
    );
  const remove = (target, kind, modifierId) =>
    writeConditionModifiers(target, kind, (rows) =>
      rows.filter((modifier) => modifier.id !== modifierId)
    );

  function updateGatheringDropModifier(rowId, kind, modifierId, updates = {}) {
    if (!kind || !modifierId) return;
    update(dropTarget(rowId, 'conditionModifiers'), kind, modifierId, updates);
  }
  function updateGatheringEventConditionModifier(kind, modifierId, updates = {}) {
    if (!kind || !modifierId) return;
    update(eventTarget('conditionModifiers'), kind, modifierId, updates);
  }

  return {
    updateGatheringDropModifier,
    updateGatheringEventConditionModifier,
    addGatheringDropModifier(rowId, kind, conditionId) {
      if (!kind || !conditionId) return;
      add(dropTarget(rowId, 'conditionModifiers'), kind, conditionId);
    },
    deleteGatheringDropModifier(rowId, kind, modifierId) {
      if (!kind || !modifierId) return;
      remove(dropTarget(rowId, 'conditionModifiers'), kind, modifierId);
    },
    addGatheringEventConditionModifier(kind, conditionId) {
      if (!kind || !conditionId) return;
      add(eventTarget('conditionModifiers'), kind, conditionId);
    },
    deleteGatheringEventConditionModifier(kind, modifierId) {
      if (!kind || !modifierId) return;
      remove(eventTarget('conditionModifiers'), kind, modifierId);
    },
    onGatheringDropModifierKeydown(rowId, kind, modifier, event) {
      stepConditionModifier(modifier, event, (next) =>
        updateGatheringDropModifier(rowId, kind, modifier.id, next)
      );
    },
    onGatheringEventModifierKeydown(kind, modifier, event) {
      stepConditionModifier(modifier, event, (next) =>
        updateGatheringEventConditionModifier(kind, modifier.id, next)
      );
    },
  };
}

function createModifierLibrary({ selectedSystemModifiers, text }) {
  function characterModifierLibraryEntry(modifierId) {
    if (!modifierId) return null;
    return selectedSystemModifiers().find((entry) => entry.id === modifierId) || null;
  }

  return {
    rowCharacterModifiers,
    characterModifierIsCustomized,
    characterModifierOperatorClass,
    characterModifierLibraryEntry,
    characterModifierLabelForRef(ref) {
      const entry = characterModifierLibraryEntry(ref?.modifierId);
      if (entry) return entry.label || entry.id;
      return text(
        'FABRICATE.Admin.Manager.Gathering.CharacterModifiers.UnknownModifier',
        'Unknown modifier ({id})'
      ).replace('{id}', ref?.modifierId || '');
    },
    characterModifierIconForRef: (ref) =>
      characterModifierLibraryEntry(ref?.modifierId)?.icon || 'fa-solid fa-user',
  };
}

function updateCharacterModifierRef(target, refId, patch) {
  if (!target || !refId) return;
  const refs = rowCharacterModifiers(target.record);
  target.write(refs.map((ref) => (ref.id === refId ? { ...ref, ...patch } : ref)));
}

function createCharacterModifierRefs({ gathering, selectedSystemModifiers }, targets, search) {
  const { dropTarget, eventTarget } = targets;
  const editingTaskId = () => gathering.editingGatheringTask?.id;

  async function onAddDropCharacterModifier(rowId, modifierId = null) {
    if (!editingTaskId() || !rowId) return;
    const id = modifierId ?? selectedSystemModifiers()[0]?.id ?? '';
    const target = id ? dropTarget(rowId, 'characterModifiers') : null;
    if (!target) return;
    const refs = rowCharacterModifiers(target.record);
    target.write([...refs, characterModifierRef(id, refs)]);
  }
  async function onUpdateDropCharacterModifier(rowId, refId, patch) {
    if (!editingTaskId()) return;
    updateCharacterModifierRef(dropTarget(rowId, 'characterModifiers'), refId, patch);
  }
  function onUpdateEventCharacterModifier(refId, patch) {
    updateCharacterModifierRef(eventTarget('characterModifiers'), refId, patch);
  }

  return {
    onAddDropCharacterModifier,
    onUpdateDropCharacterModifier,
    onUpdateEventCharacterModifier,
    async pickCharacterModifierForRow(rowId, modifierId) {
      search.characterModifierSearchTerm = '';
      await onAddDropCharacterModifier(rowId, modifierId);
    },
    pickCharacterModifierForEvent(modifierId) {
      const target = modifierId ? eventTarget('characterModifiers') : null;
      if (!target) return;
      const refs = rowCharacterModifiers(target.record);
      if (refs.some((ref) => ref.modifierId === modifierId)) return;
      search.characterModifierSearchTerm = '';
      target.write([...refs, characterModifierRef(modifierId, refs)]);
    },
    async onDeleteDropCharacterModifier(rowId, refId) {
      const target = refId && editingTaskId() ? dropTarget(rowId, 'characterModifiers') : null;
      if (!target) return;
      const refs = rowCharacterModifiers(target.record);
      const nextRefs = refs.filter((ref) => ref.id !== refId);
      if (nextRefs.length === refs.length) return;
      target.write(nextRefs);
    },
    onDeleteEventCharacterModifier(refId) {
      const target = refId ? eventTarget('characterModifiers') : null;
      if (!target) return;
      target.write(rowCharacterModifiers(target.record).filter((ref) => ref.id !== refId));
    },
    async setCharacterModifierOverrideEnabled(rowId, ref, enabled, libraryEntry) {
      const expressionOverride = enabled ? libraryEntry?.expression || '' : '';
      await onUpdateDropCharacterModifier(rowId, ref.id, { expressionOverride });
    },
    setEventCharacterModifierOverrideEnabled(ref, enabled, libraryEntry) {
      const expressionOverride = enabled ? libraryEntry?.expression || '' : '';
      onUpdateEventCharacterModifier(ref.id, { expressionOverride });
    },
  };
}

export function createGatheringModifierHandlers(inputs) {
  const { gathering, drafts } = inputs;
  const search = createCharacterModifierSearch(inputs);
  const targets = createEditTargets(gathering, drafts);
  return mergeAccessors(
    search,
    createModifierLibrary(inputs),
    createConditionOptions(gathering),
    createConditionModifierHandlers(targets, drafts),
    createCharacterModifierRefs(inputs, targets, search)
  );
}
