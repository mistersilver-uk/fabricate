/**
 * The manager's bulk selection, one composable per side (issue 1706): a browser view's selection
 * over its lifted `Set`, and the root's owner over the same field. Every input is a THUNK, because
 * a caller's list and its lifted object are themselves `$derived` and must be read inside this
 * module's own `$derived.by` to subscribe across the boundary. Every mutator assigns a NEW `Set`:
 * the reactive unit is `state()[key]`, so an in-place mutation would silently stop propagating.
 */
import {
  describeBulkSelection,
  pruneBulkSelection,
  setBulkSelection,
  toggleBulkSelection,
} from '../../../../utils/bulkSelectionModel.js';

/**
 * The browser-view side. `clear()` announces through the optional `onCleared` and `reset()` does
 * not: the toolbar's Clear is an emptying the GM performed, a system switch is not.
 */
export function createBulkSelection({ state, key, filteredIds, pageIds, onCleared } = {}) {
  const selectedIds = $derived.by(() => state()[key] ?? new Set());
  const summary = $derived.by(() =>
    describeBulkSelection({ pageIds: pageIds(), filteredIds: filteredIds(), selectedIds })
  );

  function write(next) {
    state()[key] = next;
  }

  function toggle(id) {
    write(toggleBulkSelection(selectedIds, id));
  }

  function setPageSelected(on) {
    write(setBulkSelection(selectedIds, pageIds(), on));
  }

  function selectAllResults() {
    write(setBulkSelection(selectedIds, filteredIds(), true));
  }

  // The write is FIRST, so the owner's callback runs with the flush ahead of its focus hop.
  function clear() {
    write(new Set());
    onCleared?.();
  }

  function reset() {
    write(new Set());
  }

  // Assigned only when something dropped, so a caller's `$effect` cannot loop on this.
  function prune(knownIds) {
    const current = selectedIds;
    const pruned = pruneBulkSelection(current, knownIds);
    if (pruned.size !== current.size) write(pruned);
  }

  return {
    get selectedIds() {
      return selectedIds;
    },
    get summary() {
      return summary;
    },
    toggle,
    setPageSelected,
    selectAllResults,
    clear,
    reset,
    prune,
  };
}

/**
 * The root side: the same field as ids, a count and the PROJECTED rows the bulk panels need.
 * `announce` receives the caller's message unchanged, so the root's default sentence is evaluated
 * after the write rather than before it.
 */
export function createBulkSelectionOwner({ state, key, rows, announce } = {}) {
  const ids = $derived.by(() => state()[key] ?? new Set());
  const count = $derived.by(() => ids.size);
  const selectedRows = $derived.by(() => rows().filter((row) => ids.has(row.id)));

  function announceCleared(message) {
    announce?.(message);
  }

  function clear(message) {
    state()[key] = new Set();
    announceCleared(message);
  }

  return {
    get ids() {
      return ids;
    },
    get count() {
      return count;
    },
    get rows() {
      return selectedRows;
    },
    clear,
    announceCleared,
  };
}
