/**
 * The browse-listing shape the four player stores share (issue 1673): the load envelope, a page
 * window over one list, and the first-visible selection fallback. `items` is a thunk, never an
 * array: a store's filtered list depends on this window's page state, so the thunk is read inside
 * the window's own `$derived.by` to subscribe across the module boundary, where passing the array
 * would freeze one pass and close that cycle.
 */

/**
 * The `listing`/`loading`/`error`/`loadedOnce` envelope around one async fetch. `onResult` is
 * synchronous and runs with no await between the listing write and it, so nothing observes
 * `loadedOnce` true against the previous pass's seeded state. `afterCommit` is awaited inside the
 * same try, after `loadedOnce`, so its failure lands in `error` like any other.
 */
export function createListingLoad({ fetch, onResult, afterCommit } = {}) {
  let listing = $state(null);
  let loading = $state(false);
  let error = $state(null);
  let loadedOnce = $state(false);

  /** Fetch and commit one pass; `quiet` leaves the `loading` flag alone so the list cannot flash. */
  async function refresh(quiet = false) {
    if (!quiet) loading = true;
    error = null;
    try {
      listing = (await fetch()) ?? null;
      onResult?.();
      loadedOnce = true;
      if (afterCommit) await afterCommit();
    } catch (error_) {
      error = error_?.message ?? String(error_);
    } finally {
      if (!quiet) loading = false;
    }
  }

  return {
    get listing() {
      return listing;
    },
    get loading() {
      return loading;
    },
    get error() {
      return error;
    },
    get loadedOnce() {
      return loadedOnce;
    },
    refresh,
  };
}

/**
 * The `page`/`pageSize` window over `items()`. `clamp: 'read'` clamps inside `pageItems` and lets
 * `setPage` store any index at or above zero; `clamp: 'write'` clamps in `setPage` against the live
 * count and slices raw. A `pageSizes` allowlist ignores every other size; without one any finite
 * size above zero is taken and anything else falls back to `defaultPageSize`.
 */
export function createPageWindow({
  items,
  defaultPageSize,
  pageSizes = null,
  clamp = 'read',
} = {}) {
  let page = $state(0);
  let pageSize = $state(defaultPageSize);

  const all = $derived.by(() => items());

  const pageCount = $derived.by(() => {
    const size = pageSize > 0 ? pageSize : 1;
    return Math.max(1, Math.ceil(all.length / size));
  });

  // A non-positive `pageSize` divides `pageCount` by 1 while the slice shows everything. The
  // branch is unreachable through `setPageSize` and is reproduced rather than simplified, because
  // it is the arithmetic the crafting and inventory pagers ship today.
  const clampedPageItems = $derived.by(() => {
    const size = pageSize > 0 ? pageSize : all.length || 1;
    const clampedPage = Math.min(Math.max(0, page), pageCount - 1);
    const start = clampedPage * size;
    return all.slice(start, start + size);
  });

  const rawPageItems = $derived.by(() => {
    const start = page * pageSize;
    return all.slice(start, start + pageSize);
  });

  /** The write-mode clamp, reading the thunk directly so the bound is the live count. */
  function clampedIndex(value) {
    const requested = Math.max(0, Math.trunc(Number(value) || 0));
    const last = Math.max(0, Math.ceil(items().length / pageSize) - 1);
    return Math.min(requested, last);
  }

  function setPage(next) {
    if (clamp === 'write') {
      page = clampedIndex(next);
      return;
    }
    const value = Number(next);
    page = Number.isFinite(value) && value >= 0 ? Math.trunc(value) : 0;
  }

  function setPageSize(next) {
    const value = Number(next);
    if (pageSizes) {
      if (!pageSizes.includes(value)) return;
      pageSize = value;
      page = 0;
      return;
    }
    pageSize = Number.isFinite(value) && value > 0 ? Math.trunc(value) : defaultPageSize;
    page = 0;
  }

  function resetPage() {
    page = 0;
  }

  /** Re-clamp the stored page against the live count, after a load or a filter change. */
  function clampPage() {
    page = clampedIndex(page);
  }

  return {
    get page() {
      return page;
    },
    get pageSize() {
      return pageSize;
    },
    get pageCount() {
      return pageCount;
    },
    get pageItems() {
      return clamp === 'write' ? rawPageItems : clampedPageItems;
    },
    setPage,
    setPageSize,
    resetPage,
    clampPage,
  };
}

/**
 * The selection fallback tail: nothing while the full listing is empty, else the first row the
 * active filters leave visible. Callers put their own id lookup in front of it.
 */
export function firstVisible({ all, visible }) {
  if (all.length === 0) return null;
  return visible[0] ?? null;
}
