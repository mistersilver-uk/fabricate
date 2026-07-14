/**
 * inventoryStore — Svelte 5 runes store backing the player-facing Inventory tab.
 *
 * Mirrors {@link createCraftingStore}: a plain factory that NEVER touches Foundry
 * globals. Every Foundry-facing read flows through the injected `services` bag
 * (the unified-window seam set built in `SvelteFabricateApp._buildServices`), so
 * the store stays presentational and fully unit-testable.
 *
 * It holds the owned-inventory listing produced by the `InventoryListingBuilder`
 * (via `services.listInventoryForActor`) plus the local browse state (search,
 * filter pill, sort, selection, pagination). The selected character +
 * component-source actors are owned by the sibling crafting stores/seams — this
 * store reads the current ids through `services` when it loads (so the Inventory
 * and Crafting tabs agree on what the player owns).
 *
 * @param {object} deps
 * @param {object} deps.services Injected services bag exposing
 *   `listInventoryForActor({ rememberedActorId, componentSourceActorIds })`,
 *   `getSelectedCraftingActorId()`, `getCraftingComponentSourceIds()`, and the
 *   optional sibling `craftingSources` store.
 * @returns {object} The reactive inventory store.
 */

const DEFAULT_PAGE_SIZE = 25;

// The filter pills. Kept as a local constant so the store never imports the
// builder's module graph.
export const INVENTORY_FILTERS = Object.freeze([
  'all',
  'components',
  'essences',
  'tools',
  'recipeItems',
]);
const VALID_SORTS = new Set(['name', 'quantity', 'type']);

/**
 * Whether a row matches the free-text query. Matches the placeholder's promise —
 * item name, tags, and the names of essences the component carries — all
 * case-insensitively. An empty query matches everything.
 */
function matchesQuery(row, query) {
  if (query.length === 0) return true;
  if (String(row?.name ?? '').toLowerCase().includes(query)) return true;
  const tags = Array.isArray(row?.tags) ? row.tags : [];
  if (tags.some((tag) => String(tag ?? '').toLowerCase().includes(query))) return true;
  const essences = Array.isArray(row?.essences) ? row.essences : [];
  if (essences.some((essence) => String(essence?.name ?? '').toLowerCase().includes(query)))
    return true;
  return false;
}

function matchesFilter(row, filter) {
  switch (filter) {
    case 'components':
      // Books (recipe items) and essence rows are their own pills, so the
      // Components pill lists only true crafting components.
      return row?.isEssenceSource !== true && row?.isRecipeItem !== true;
    case 'essences':
      return row?.isEssenceSource === true;
    case 'tools':
      return row?.isTool === true;
    case 'recipeItems':
      return row?.isRecipeItem === true;
    case 'all':
    default:
      return true;
  }
}

export function createInventoryStore({ services } = {}) {
  let listing = $state(null);
  let loading = $state(false);
  let error = $state(null);
  let loadedOnce = $state(false);
  let selectedKey = $state(null);
  let search = $state('');
  let filter = $state('all');
  let sort = $state('name');
  let page = $state(0);
  let pageSize = $state(DEFAULT_PAGE_SIZE);
  let worldTimeTick = $state(0);
  // The recipe id currently being learned from a book (Inventory learn button),
  // so the UI can show a busy state and prevent double-submits.
  let learningRecipeId = $state(null);

  /** Resolve the current component-source actor ids, preferring the sibling store. */
  function currentSourceIds() {
    const fromSibling = services?.craftingSources?.selectedSourceIds;
    if (Array.isArray(fromSibling)) return fromSibling;
    const persisted = services?.getCraftingComponentSourceIds?.();
    return Array.isArray(persisted) ? persisted : [];
  }

  /** Resolve the current crafting actor id from persistence (sticky selection). */
  function currentActorId() {
    return services?.getSelectedCraftingActorId?.() || null;
  }

  const rows = $derived(Array.isArray(listing?.rows) ? listing.rows : []);
  const hasActor = $derived(Boolean(listing?.selectedActorId));

  const visibleItems = $derived.by(() => {
    const query = search.trim().toLowerCase();
    const filtered = rows.filter((row) => {
      if (!matchesFilter(row, filter)) return false;
      if (!matchesQuery(row, query)) return false;
      return true;
    });
    // Explicit comparator (never a bare `.sort()`).
    const byName = (left, right) =>
      String(left?.name ?? '').localeCompare(String(right?.name ?? ''));
    if (sort === 'quantity') {
      return [...filtered].sort(
        (left, right) =>
          (right?.totalQuantity ?? 0) - (left?.totalQuantity ?? 0) || byName(left, right)
      );
    }
    if (sort === 'type') {
      // Components before essences, then A→Z within each group.
      return [...filtered].sort(
        (left, right) =>
          Number(left?.isEssenceSource === true) - Number(right?.isEssenceSource === true) ||
          byName(left, right)
      );
    }
    return [...filtered].sort(byName);
  });

  // Per-pill counts for the filter row (computed over the search-filtered set so
  // the badges reflect what a pill would show given the current query).
  const filterCounts = $derived.by(() => {
    const query = search.trim().toLowerCase();
    const searched = rows.filter((row) => matchesQuery(row, query));
    const counts = {};
    for (const key of INVENTORY_FILTERS) {
      counts[key] = searched.filter((row) => matchesFilter(row, key)).length;
    }
    return counts;
  });

  const pageCount = $derived.by(() => {
    const size = pageSize > 0 ? pageSize : 1;
    return Math.max(1, Math.ceil(visibleItems.length / size));
  });

  const pageItems = $derived.by(() => {
    const size = pageSize > 0 ? pageSize : visibleItems.length || 1;
    const clampedPage = Math.min(Math.max(0, page), pageCount - 1);
    const start = clampedPage * size;
    return visibleItems.slice(start, start + size);
  });

  // Find by key across the full listing; fall back to the first VISIBLE item so
  // the selection respects the active search/filter.
  const selectedItem = $derived.by(() => {
    if (rows.length === 0) return null;
    return rows.find((row) => row?.key === selectedKey) ?? visibleItems[0] ?? null;
  });

  /**
   * Fetch the inventory listing for the current actor + component sources.
   *
   * @param {boolean} [quiet=false] When true, do not raise `loading` (used for
   *   background refreshes after a scene change / world-time tick).
   */
  async function load(quiet = false) {
    if (!quiet) loading = true;
    error = null;
    try {
      const result = await services?.listInventoryForActor?.({
        rememberedActorId: currentActorId(),
        componentSourceActorIds: currentSourceIds(),
      });
      listing = result ?? null;
      loadedOnce = true;
    } catch (err) {
      error = err?.message ?? String(err);
    } finally {
      if (!quiet) loading = false;
    }
  }

  /**
   * Learn one recipe from an owned recipe-item book. Routes through the
   * `learnRecipeFromInventory` seam (capped systems enforce the per-document
   * budget); on success the listing is quietly reloaded so the learned flag and
   * remaining budget update in place, and on failure the service message is
   * surfaced through the notify seam.
   *
   * @param {string} recipeId
   * @returns {Promise<{success: boolean, message?: string}>}
   */
  async function learn(recipeId) {
    if (!recipeId || learningRecipeId) return { success: false };
    learningRecipeId = recipeId;
    try {
      const result = await services?.learnRecipeFromInventory?.({
        actorId: currentActorId(),
        recipeId,
        componentSourceActorIds: currentSourceIds(),
      });
      if (result?.success) {
        await load(true);
      } else if (result?.message) {
        services?.notify?.(result.message);
      }
      return result ?? { success: false };
    } catch (err) {
      const message = err?.message ?? String(err);
      services?.notify?.(message);
      return { success: false, message };
    } finally {
      learningRecipeId = null;
    }
  }

  /**
   * Learn several recipes from an owned book in one action — the knowledge-mode
   * "Read & learn all N recipes" convenience (only offered when the reader can learn
   * everything). Learns sequentially through the same per-recipe seam, stopping on the
   * first failure (surfacing its message), and reloads once at the end.
   *
   * @param {string[]} recipeIds
   * @returns {Promise<{success: boolean}>}
   */
  async function learnAll(recipeIds = []) {
    const ids = (Array.isArray(recipeIds) ? recipeIds : []).filter(Boolean);
    if (!ids.length || learningRecipeId) return { success: false };
    learningRecipeId = '*';
    try {
      let anyLearned = false;
      for (const recipeId of ids) {
        const result = await services?.learnRecipeFromInventory?.({
          actorId: currentActorId(),
          recipeId,
          componentSourceActorIds: currentSourceIds(),
        });
        if (result?.success) {
          anyLearned = true;
        } else {
          if (result?.message) services?.notify?.(result.message);
          break;
        }
      }
      if (anyLearned) await load(true);
      return { success: anyLearned };
    } finally {
      learningRecipeId = null;
    }
  }

  /** Select an item by key. */
  function select(key) {
    selectedKey = key ?? null;
  }

  /** Update the search query and jump back to the first page. */
  function setSearch(value) {
    search = typeof value === 'string' ? value : '';
    page = 0;
  }

  /** Switch the active filter pill (jumps back to the first page). */
  function setFilter(value) {
    filter = INVENTORY_FILTERS.includes(value) ? value : 'all';
    page = 0;
  }

  /** Switch the sort key. */
  function setSort(value) {
    sort = VALID_SORTS.has(value) ? value : 'name';
  }

  function setPage(next) {
    const value = Number(next);
    page = Number.isFinite(value) && value >= 0 ? Math.trunc(value) : 0;
  }

  function setPageSize(next) {
    const value = Number(next);
    pageSize = Number.isFinite(value) && value > 0 ? Math.trunc(value) : DEFAULT_PAGE_SIZE;
    page = 0;
  }

  /** Bump the world-time tick so calendar-aware derived labels recompute. */
  function tickWorldTime() {
    worldTimeTick += 1;
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
    get hasActor() {
      return hasActor;
    },
    get search() {
      return search;
    },
    get filter() {
      return filter;
    },
    get sort() {
      return sort;
    },
    get page() {
      return page;
    },
    get pageSize() {
      return pageSize;
    },
    get pageCount() {
      return pageCount;
    },
    get selectedKey() {
      return selectedKey;
    },
    get learningRecipeId() {
      return learningRecipeId;
    },
    get worldTimeTick() {
      return worldTimeTick;
    },
    get rows() {
      return rows;
    },
    get visibleItems() {
      return visibleItems;
    },
    get filterCounts() {
      return filterCounts;
    },
    get pageItems() {
      return pageItems;
    },
    get selectedItem() {
      return selectedItem;
    },
    load,
    learn,
    learnAll,
    select,
    setSearch,
    setFilter,
    setSort,
    setPage,
    setPageSize,
    tickWorldTime,
  };
}
