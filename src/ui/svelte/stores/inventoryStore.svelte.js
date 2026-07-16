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

import {
  applyPlayerResultOrder,
  progressiveOrderKey,
} from '../../../utils/progressiveResultOrder.js';
import { progressiveStageThresholds } from '../../../utils/progressiveStageThresholds.js';

const DEFAULT_PAGE_SIZE = 25;

// Reorder writes are replicated `scope: 'user'` document writes, so they are coalesced
// rather than issued per gesture. Mirrors the crafting store's window.
const ORDER_COMMIT_DEBOUNCE_MS = 400;

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
  // The component id currently being salvaged, so the footer can show a busy state
  // and refuse a double-submit.
  let salvagingKey = $state(null);
  // The last salvage outcome, held against the component it belongs to. Cleared by
  // "Salvage again" or by selecting another item.
  let salvageResult = $state(null);
  // Decision 11: hold the SALVAGED row selected while its ribbon is up. Salvaging the
  // last copy drops the row from the listing, and `selectedItem` would fall through to
  // `visibleItems[0]` — rendering the success ribbon against the wrong component. This
  // is the common case (the smoke fixture seeds a single copy), not an edge.
  let heldItem = $state(null);
  // The player's standing progressive stage orders, keyed `salvage:<componentId>`,
  // seeded from settings on load. `persistedOrders` is the last known-GOOD snapshot —
  // the revert target when an optimistic write is rejected.
  let progressiveOrders = $state({});
  let persistedOrders = {};
  let orderCommitTimer = null;
  let salvageOrderAnnouncement = $state('');

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
    const byName = (left, right) => String(left?.name ?? '').localeCompare(String(right?.name ?? ''));
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
  //
  // `heldItem` (decision 11) takes precedence while a salvage ribbon is up: the last
  // copy of a salvaged component leaves the listing, so `rows.find` misses and the
  // fallback would swap in an unrelated component under the ribbon. The held snapshot
  // is the row as it was salvaged; it is released on the next `select` or reset.
  const selectedItem = $derived.by(() => {
    const live = rows.find((row) => row?.key === selectedKey) ?? null;
    if (live) return live;
    if (heldItem && heldItem.key === selectedKey) return heldItem;
    if (rows.length === 0) return null;
    return visibleItems[0] ?? null;
  });

  /**
   * The selected component's progressive salvage stages in the PLAYER'S order, with
   * thresholds RECOMPUTED for that order (issue 675).
   *
   * The recompute is not an optimization, it is a correctness requirement. A threshold
   * is cumulative — a property of a stage's POSITION in the list the roll is spent
   * down, not of the stage — and `applyPlayerResultOrder` returns elements
   * ===-identical to its inputs (deliberately; downstream depends on it). So a moved
   * stage would otherwise carry its authored-position threshold with it, and the top
   * row would claim a HIGHER bar than the row beneath it.
   *
   * It recomputes through the SAME helper the builder used, fed SALVAGE's own award
   * mode, which is the only thing that keeps the badge and the award in step.
   */
  const orderedSalvageStages = $derived.by(() => {
    const salvage = selectedItem?.salvage ?? null;
    const stages = Array.isArray(salvage?.stages) ? salvage.stages : [];
    if (stages.length === 0) return stages;
    if (salvage.allowPlayerResultReorder === false) return stages;
    const key = progressiveOrderKey({ scope: 'salvage', id: selectedItem?.componentId });
    if (!key) return stages;

    const ordered = applyPlayerResultOrder(stages, progressiveOrders[key] ?? null);
    // Identity means nothing moved, so the builder's authored thresholds already stand.
    if (ordered === stages) return stages;

    // `difficulty` is already null for an absent/invalid cost, so `?? NaN` reproduces
    // the award loop's skip: no budget reaches the stage, and its threshold stays null.
    const thresholds = progressiveStageThresholds({
      results: ordered,
      costFor: (stage) => stage?.difficulty ?? NaN,
      awardMode: salvage.awardMode || 'equal',
    });
    return ordered.map((stage, index) => ({ ...stage, threshold: thresholds[index] }));
  });

  /**
   * Persist the pending order for `key`, reverting and announcing on failure.
   *
   * Mirrors `craftingStore.commitProgressiveOrder`'s STRUCTURE but NOT its error
   * contract. That one swallows the rejection outright, so `await flushProgressiveOrder()`
   * resolves successfully even when the write FAILED and the order was silently
   * reverted. Safe for crafting, which never gates an engine call on the flush —
   * unusable here, where a rejected write must ABORT the salvage.
   *
   * SIGNALS BY RETURN STATUS, NEVER BY REthrow. That is a constraint, not a taste:
   * `SvelteFabricateApp._flushPendingOrderWrite` calls this at window teardown as
   * `void`, inside a `try/catch` that catches only SYNCHRONOUS throws — so a rejecting
   * flush would become an unhandled promise rejection on a path with no user to see
   * it, land in the smoke run's `consoleErrors[]`, and flip its `passed` to false.
   *
   * The revert + the live-region announcement stay internal: the write is optimistic,
   * so by the time a rejection returns, the row has ALREADY moved and the announcement
   * has ALREADY been made. A toast is not sufficient — a keyboard user reordering by
   * chevron never looks at one.
   *
   * @returns {Promise<{ok: boolean}>}
   */
  async function commitProgressiveOrder(key) {
    const attempted = progressiveOrders[key] ?? [];
    try {
      await services?.setProgressiveResultOrder?.(key, attempted);
      persistedOrders[key] = [...attempted];
      return { ok: true };
    } catch {
      const restored = persistedOrders[key] ?? null;
      progressiveOrders = { ...progressiveOrders };
      if (restored) {
        progressiveOrders[key] = [...restored];
      } else {
        delete progressiveOrders[key];
      }
      salvageOrderAnnouncement = services?.progressiveOrderRevertMessage?.() ?? '';
      return { ok: false };
    }
  }

  /**
   * Move a stage of the selected progressive salvage, optimistically and debounced.
   *
   * @param {number} index the stage's current position
   * @param {number} target the position to move it to
   * @param {string} [announcement] pre-formatted live-region text (the component owns
   *   the i18n, and reads the moved stage's name BEFORE the move)
   */
  function reorderSalvageStage(index, target, announcement = '') {
    const componentId = selectedItem?.componentId;
    const key = progressiveOrderKey({ scope: 'salvage', id: componentId });
    if (!key || selectedItem?.salvage?.allowPlayerResultReorder === false) return;

    const current = orderedSalvageStages;
    if (target < 0 || target >= current.length || index < 0 || index >= current.length) return;

    const next = [...current];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved);
    // Store ids, not indices: they survive a GM editing the component's salvage.
    progressiveOrders = { ...progressiveOrders, [key]: next.map((stage) => stage.id) };
    salvageOrderAnnouncement = announcement;

    if (orderCommitTimer) clearTimeout(orderCommitTimer);
    orderCommitTimer = setTimeout(() => {
      orderCommitTimer = null;
      void commitProgressiveOrder(key);
    }, ORDER_COMMIT_DEBOUNCE_MS);
  }

  /**
   * Flush a pending debounced order write immediately, reporting whether it landed.
   *
   * Called on drop, before a salvage run starts, and on window teardown via
   * `SvelteFabricateApp._flushPendingOrderWrite` — without the last, a player who
   * reorders and immediately closes or refreshes inside the debounce window loses the
   * order silently. A no-op when nothing is pending, so a double call from both
   * `close()` and `_onClose()` writes once.
   *
   * NEVER REJECTS: see `commitProgressiveOrder`.
   *
   * @returns {Promise<{ok: boolean}>}
   */
  function flushSalvageOrder() {
    if (!orderCommitTimer) return Promise.resolve({ ok: true });
    clearTimeout(orderCommitTimer);
    orderCommitTimer = null;
    const key = progressiveOrderKey({ scope: 'salvage', id: selectedItem?.componentId });
    return key ? commitProgressiveOrder(key) : Promise.resolve({ ok: true });
  }

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
      // Seed the player's stored stage orders. The persisted snapshot is the revert
      // target for a rejected write.
      const orders = services?.getProgressiveResultOrder?.() ?? {};
      progressiveOrders = orders && typeof orders === 'object' ? { ...orders } : {};
      persistedOrders = { ...progressiveOrders };
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

  /**
   * Salvage the selected owned component (issue 675) — the first player-facing caller
   * of `CraftingEngine.salvage`.
   *
   * Routes through `services.salvageComponent({ actorId, ... })`. An ACTOR ID, never a
   * uuid: `_resolveCraftingActor` behind that facade is the only ownership gate the
   * salvage path has, and a uuid would bypass it and reach the engine (which mutates
   * Items directly and THROWS on a bad uuid rather than returning a message).
   *
   * `salvage()` has FOUR outcomes, not two — a `success` with null results is a
   * time-gated run that has STARTED and awarded nothing:
   *
   *   cancelled            → silently back to pre-roll. NO notify: the player chose to
   *                          dismiss the prompt; an error toast would be a lie.
   *   success, no results  → waiting state carrying the engine's message. No ribbon,
   *                          no "Salvage again" (that would re-enter the time gate).
   *   success + results    → success ribbon, quiet reload, selection HELD.
   *   !success             → surface the message (this is also the misconfigured shape).
   *
   * NO ORDER IS THREADED INTO THE OPTIONS BAG. The engine captures the player's order
   * onto the run record at start, reading the standing preference exactly once, there.
   * Threading one here would reintroduce the executing-user read that capture exists to
   * prevent. Writing the standing preference is the UI's whole job — which is why this
   * FLUSHES the pending debounced write first: without that, a player who reorders and
   * immediately presses Salvage starts a run inside the debounce window and the engine
   * captures the STALE order.
   *
   * A REJECTED FLUSH ABORTS THE SALVAGE (decision 9). The store has already reverted
   * the row and announced the revert, so proceeding would consume the component against
   * an order the player can see was undone. Nothing is consumed; they retry deliberately.
   *
   * @param {string} componentId
   * @returns {Promise<{success: boolean, cancelled?: boolean, message?: string}>}
   */
  async function salvage(componentId) {
    if (!componentId || salvagingKey) return { success: false };
    const row = rows.find((entry) => entry?.componentId === componentId) ?? null;
    const systemId = row?.systemId ?? null;
    if (!systemId) return { success: false };

    salvagingKey = componentId;
    try {
      const flush = await flushSalvageOrder();
      if (flush?.ok === false) {
        // The revert and its live-region announcement already happened inside the
        // flush. Consume nothing.
        return { success: false, message: salvageOrderAnnouncement };
      }
      const result = await services?.salvageComponent?.({
        // Decision 8: the first OWNED actor holding the component.
        actorId: row?.salvage?.targetActorId ?? null,
        systemId,
        componentId,
        interactive: true,
      });

      if (result?.cancelled === true) {
        salvageResult = null;
        return result;
      }
      if (result?.success === true && result?.results == null) {
        salvageResult = { componentId, state: 'waiting', message: result?.message ?? '' };
        await load(true);
        return result;
      }
      if (result?.success === true) {
        // Snapshot the row BEFORE the reload: salvaging the last copy drops it from the
        // listing, and the ribbon must stay on the component it belongs to.
        heldItem = row;
        selectedKey = row?.key ?? selectedKey;
        salvageResult = {
          componentId,
          state: 'success',
          message: result?.message ?? '',
          // The created result documents, projected for the read-only summary. Never a
          // formula: that is system-authored and the prompt already showed it.
          awarded: (Array.isArray(result.results) ? result.results : []).map((entry) => ({
            name: String(entry?.name ?? ''),
            img: typeof entry?.img === 'string' ? entry.img : null,
          })),
          // What the run RECORDED, so the body can reconcile itself with the roll rather
          // than keep asserting a pre-roll state under a success ribbon.
          //
          // `createdResults` is the engine's own record of what it awarded, keyed by
          // componentId — the only honest source for a per-stage "Recovered" chip
          // (the created Items are matched by name otherwise, which is fragile).
          // `data.outcomeId` is the routed tier the roll actually matched.
          //
          // Both are null/empty when the salvage ran WITHOUT a run manager (the runless
          // invariant), in which case the bodies fall back to a neutral resolved state
          // rather than inventing one.
          awardedComponentIds: (Array.isArray(result?.salvageRun?.createdResults)
            ? result.salvageRun.createdResults
            : []
          )
            .map((entry) => entry?.componentId)
            .filter(Boolean),
          outcomeId: result?.salvageRun?.checkResult?.data?.outcomeId ?? null,
        };
        await load(true);
        return result;
      }
      salvageResult = null;
      if (result?.message) services?.notify?.(result.message);
      return result ?? { success: false };
    } catch (err) {
      const message = err?.message ?? String(err);
      salvageResult = null;
      services?.notify?.(message);
      return { success: false, message };
    } finally {
      salvagingKey = null;
    }
  }

  /** Dismiss the salvage outcome and return the panel to its pre-roll state. */
  function resetSalvage() {
    salvageResult = null;
    heldItem = null;
  }

  /** Select an item by key. Releases any held (salvaged) row and its ribbon. */
  function select(key) {
    selectedKey = key ?? null;
    heldItem = null;
    salvageResult = null;
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
    get salvagingKey() {
      return salvagingKey;
    },
    get salvageResult() {
      return salvageResult;
    },
    get orderedSalvageStages() {
      return orderedSalvageStages;
    },
    get salvageOrderAnnouncement() {
      return salvageOrderAnnouncement;
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
    salvage,
    resetSalvage,
    reorderSalvageStage,
    flushSalvageOrder,
    select,
    setSearch,
    setFilter,
    setSort,
    setPage,
    setPageSize,
    tickWorldTime,
  };
}
