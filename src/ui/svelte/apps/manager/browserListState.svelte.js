/**
 * The manager browser views' lifted-list wiring, one factory per seam (issue 1716). Every input
 * is a thunk, because a caller's `ui` object and filtered list are `$derived` and must be read
 * inside this module's own `$derived.by` to subscribe across the boundary.
 */

import { DEFAULT_BROWSER_PAGE_SIZE } from '../../../model/managerBrowserViewState.js';

/**
 * The crafting-system switch sentinel. `state().systemId` is written last so `onSystemSwitch`
 * observes the outgoing system; `resetAxes` names only the axes a caller's effect resets.
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
 * The page window over `rows()`, resetting to page zero where `ui-integration` says the last
 * valid page. `defaultPageSize` is the unset fallback only, so Tools keeps its own size of 8.
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
    const index = indexOf();
    return rows().slice(index * size, (index + 1) * size);
  });

  function clampPage() {
    const index = indexOf();
    if (index > 0 && index * sizeOf() >= rows().length) state().pageIndex = 0;
  }

  return {
    get pageRows() {
      return pageRows;
    },
    clampPage,
  };
}
