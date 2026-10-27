/**
 * The manager browser views' lifted-list wiring, one factory per seam (issue 1716). Every input
 * is a thunk, because a caller's `ui` object and filtered list are `$derived` and must be read
 * inside this module's own `$derived.by` to subscribe across the boundary.
 */

import { DEFAULT_BROWSER_PAGE_SIZE } from '../../../model/managerBrowserViewState.js';

/**
 * The crafting-system switch sentinel. The equality guard is what keeps a remount at the same
 * system from reading as a switch (issue 806); `state().systemId` is written last so
 * `onSystemSwitch` observes the outgoing system, and `resetAxes` names only the axes to reset.
 */
export function createBrowserListState({ state, resetAxes = {}, onSystemSwitch } = {}) {
  function syncSystem(selectedSystemId) {
    const ui = state();
    if (selectedSystemId === ui.systemId) return;
    for (const [axis, value] of Object.entries(resetAxes)) ui[axis] = value;
    onSystemSwitch?.();
    ui.systemId = selectedSystemId;
  }

  return { syncSystem };
}

// Local rather than shared with `paginateRows`: a new import here must be added to every mounted
// harness manifest that reaches this module, and an omission hangs those suites.
function clampPageIndex(rowCount, pageSize, pageIndex) {
  const lastPage = Math.max(0, Math.ceil(rowCount / pageSize) - 1);
  return Math.min(Math.max(0, pageIndex), lastPage);
}

/**
 * The page window over `rows()`, clamping an out-of-range page to the last valid one, as
 * `ui-manager-shell` § Manager browse view-state says. `defaultPageSize` is only the unset
 * fallback: Tools keeps 8.
 */
export function createBrowserPageWindow({
  state,
  rows,
  defaultPageSize = DEFAULT_BROWSER_PAGE_SIZE,
} = {}) {
  const sizeOf = () => state().pageSize || defaultPageSize;
  const indexOf = () => state().pageIndex || 0;

  const pageRows = $derived.by(() => {
    const size = sizeOf();
    const all = rows();
    const index = clampPageIndex(all.length, size, indexOf());
    return all.slice(index * size, (index + 1) * size);
  });

  function clampPage() {
    const index = indexOf();
    const clamped = clampPageIndex(rows().length, sizeOf(), index);
    if (clamped !== index) state().pageIndex = clamped;
  }

  return {
    get pageRows() {
      return pageRows;
    },
    clampPage,
  };
}
