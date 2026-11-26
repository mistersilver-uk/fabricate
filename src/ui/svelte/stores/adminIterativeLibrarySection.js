/**
 * The GM's writes to the iterative library: a section of `createAdminStore`. Every write rebuilds
 * `system.iterative` and sends it through `updateSystem`, so the normalizer remains the one judge of
 * its shape, then refreshes. A library newer than this build is never written.
 */
import { get, writable as writableStore } from 'svelte/store';

import {
  ITERATIVE_LIBRARY_VERSION,
  iterativeLibraryVersionUnsupported,
} from '../../../systems/normalize/iterativeLibrary.js';
import { arrayOrEmpty, cloneJson, trimString } from '../../../utils/scalars.js';
import {
  counterNameFault,
  deriveIterativeId,
} from '../apps/manager/iterative/iterativeLibraryModel.js';

import { reorderListByIndex } from './adminStoreInternals.js';

const COUNTER_FIELDS = Object.freeze(['description', 'limit', 'min', 'max']);
const isUnset = (value) => [null, undefined, ''].includes(value);
const indexOf = (list, id) => list.findIndex((entry) => entry.id === id);
const idsOf = (list) => list.map((entry) => entry.id);

const libraryOf = (raw) => ({
  version: ITERATIVE_LIBRARY_VERSION,
  counters: cloneJson(arrayOrEmpty(raw?.counters)),
  actions: cloneJson(arrayOrEmpty(raw?.actions)),
});

/** A label no other Counter holds: `base`, then `base 2`, `base 3` and so on. */
function uniqueCounterLabel(counters, base) {
  let label = base;
  for (let n = 2; counterNameFault(counters, '', label); n += 1) label = `${base} ${n}`;
  return label;
}

/** `counter` with the keys `patch` names applied, or `null` when its new name may not be written. */
function patchedCounter(counters, counter, patch) {
  const next = { ...counter };
  if ('label' in patch) {
    if (counterNameFault(counters, counter.id, patch.label)) return null;
    next.label = trimString(patch.label);
  }
  for (const key of COUNTER_FIELDS) {
    if (!(key in patch)) continue;
    if (isUnset(patch[key])) delete next[key];
    else next[key] = patch[key];
  }
  return next;
}

// Each change takes the library clone and answers `{ library, value }`, or `null` to refuse.

function addedCounter(library, base) {
  const label = uniqueCounterLabel(library.counters, base);
  const id = deriveIterativeId(label, 'counter', idsOf(library.counters));
  library.counters.push({ id, label, limit: 'none' });
  return { library, value: id };
}

function updatedCounter(library, id, patch) {
  const index = indexOf(library.counters, id);
  const next = index < 0 ? null : patchedCounter(library.counters, library.counters[index], patch);
  if (!next) return null;
  library.counters[index] = next;
  return { library, value: true };
}

function reorderedCounters(library, from, to) {
  const counters = reorderListByIndex(library.counters, from, to);
  return counters ? { library: { ...library, counters }, value: true } : null;
}

function withoutEntry(library, key, id) {
  if (indexOf(library[key], id) < 0) return null;
  library[key] = library[key].filter((entry) => entry.id !== id);
  return { library, value: true };
}

function savedAction(library, draft) {
  const id = draft?.id || deriveIterativeId(draft?.label, 'action', idsOf(library.actions));
  const action = { ...cloneJson(draft), id, label: trimString(draft?.label) };
  const index = indexOf(library.actions, id);
  if (index < 0) library.actions.push(action);
  else library.actions[index] = action;
  return { library, value: id };
}

function copiedAction(library, id, copyLabel) {
  const source = library.actions[indexOf(library.actions, id)];
  if (!source) return null;
  const label = copyLabel(source.label);
  const copyId = deriveIterativeId(label, 'action', idsOf(library.actions));
  library.actions.push({ ...cloneJson(source), id: copyId, label });
  return { library, value: copyId };
}

/** A blank Crafting Action to stage; its id is minted from its label when it is first saved. */
const blankAction = () => ({
  id: '',
  label: '',
  categories: [],
  usesSession: true,
  availability: { combine: 'all', rules: [] },
  costs: [],
  check: 'none',
  effects: [],
});

/**
 * The memo of active iterative runs, read by the editors' in-progress notes. It walks nothing
 * until an editor route watches it, and publishes only a list that differs from the last.
 */
function createActiveRunsMemo(services) {
  const activeRuns = writableStore([]);
  let watching = false;
  let runsRefreshQueued = false;
  let runsKey = '[]';
  const keyOf = (runs) =>
    JSON.stringify(runs.map((run) => [run?.recipeId, run?.craftingSystemId, run?.actionIds]));
  function recomputeActiveRuns() {
    const runs = arrayOrEmpty(services.getActiveIterativeRuns?.());
    const key = keyOf(runs);
    if (key === runsKey) return;
    runsKey = key;
    activeRuns.set(runs);
  }

  return {
    activeIterativeRuns: { subscribe: activeRuns.subscribe },
    /** Starts or stops keeping the memo; turning it on recomputes once. */
    watchActiveRuns(on) {
      watching = on === true;
      if (watching) recomputeActiveRuns();
    },
    /** Recomputes the memo through one coalescing microtask while watched, and does nothing otherwise. */
    scheduleActiveRunsRefresh() {
      if (!watching || runsRefreshQueued) return;
      runsRefreshQueued = true;
      queueMicrotask(() => {
        runsRefreshQueued = false;
        if (watching) recomputeActiveRuns();
      });
    },
  };
}

/**
 * @param {object} deps
 * @param {object} deps.services The manager services: the system manager, `localize`, `notify`.
 * @param {object} deps.selectedSystemId The selected system's id store.
 * @param {() => Promise<void>} deps.refresh Republishes the store after a write.
 * @param {Function} deps.confirmDiscardDirty The store's shared unsaved-changes prompt.
 */
export function createIterativeLibrarySection({
  services,
  selectedSystemId,
  refresh,
  confirmDiscardDirty,
}) {
  const localized = (key, fallback, data = {}) => services.localize?.(key, data) || fallback;

  /** The system id and a clone of its library, or `null` when no write may happen. */
  function writable() {
    const systemId = get(selectedSystemId);
    const system = systemId ? services.getCraftingSystemManager().getSystem(systemId) : null;
    if (!system || iterativeLibraryVersionUnsupported(system.iterative)) return null;
    return { systemId, library: libraryOf(system.iterative) };
  }

  /** Applies `change` to the clone and writes the result: its `value`, or `false` on a refusal. */
  async function commit(change) {
    const held = writable();
    const outcome = held && change(held.library);
    if (!outcome) return false;
    try {
      await services
        .getCraftingSystemManager()
        .updateSystem(held.systemId, { iterative: outcome.library });
      await refresh();
    } catch (error) {
      console.error('Fabricate | Failed to save the iterative library:', error);
      services.notify?.error?.(error?.message || 'Failed to save the iterative library');
      return false;
    }
    return outcome.value;
  }

  /** The system's recipes, for usage and for the readiness the editor shows. */
  const systemRecipes = () => {
    const systemId = get(selectedSystemId);
    const recipeManager = services.getRecipeManager?.();
    return systemId ? (recipeManager?.getRecipes?.({ craftingSystemId: systemId }) ?? []) : [];
  };

  const copyLabel = (label) =>
    localized('FABRICATE.Admin.Manager.Iterative.CopyLabel', `${label} copy`, { label });

  return {
    systemRecipes,
    ...createActiveRunsMemo(services),
    /** Adds a Counter under a placeholder name, so its id comes from that name; answers its id. */
    addCounter: () =>
      commit((library) =>
        addedCounter(
          library,
          localized('FABRICATE.Admin.Manager.Iterative.NewCounterLabel', 'New counter')
        )
      ),
    /** Writes `patch` (`label`, `description`, `limit`, `min`, `max`); an unset value drops its key. */
    updateCounter: (id, patch) => commit((library) => updatedCounter(library, id, patch ?? {})),
    reorderCounters: (from, to) => commit((library) => reorderedCounters(library, from, to)),
    /** Removes the Counter and rewrites no reference to it; the caller has confirmed. */
    deleteCounter: (id) => commit((library) => withoutEntry(library, 'counters', id)),
    newActionDraft: blankAction,
    /** Inserts or replaces the action; a draft with no id gets one from its label. Answers its id. */
    saveAction: (draft) => commit((library) => savedAction(library, draft)),
    /** Appends a copy of the action under a new id and a "copy" label; answers the copy's id. */
    duplicateAction: (id) => commit((library) => copiedAction(library, id, copyLabel)),
    /** Removes the action and rewrites no reference to it; the caller has confirmed. */
    deleteAction: (id) => commit((library) => withoutEntry(library, 'actions', id)),
    confirmDiscardDirtyActionDraft: () =>
      confirmDiscardDirty(
        'FABRICATE.Admin.Manager.Iterative.DiscardDirtyContent',
        'The current action has unsaved changes. Save them and continue, or discard them?'
      ),
  };
}
