/**
 * The manager browser views' lifted-list wiring, one factory per seam (issue 1716). Every input
 * is a thunk, because a caller's `ui` object and filtered list are `$derived` and must be read
 * inside this module's own `$derived.by` to subscribe across the boundary.
 */

import { paginateRows } from '../../../model/browserPagination.js';
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

  const windowOf = () => paginateRows(rows(), { pageSize: sizeOf(), pageIndex: indexOf() });
  const pageRows = $derived.by(() => windowOf().rows);

  function clampPage() {
    const index = indexOf();
    const clamped = windowOf().pageIndex;
    if (clamped !== index) state().pageIndex = clamped;
  }

  return {
    get pageRows() {
      return pageRows;
    },
    clampPage,
  };
}
