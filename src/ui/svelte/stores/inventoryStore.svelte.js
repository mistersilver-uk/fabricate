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

import { createListingLoad, createPageWindow, firstVisible } from './browseListing.svelte.js';
import { createBulkActions } from './inventoryBulkActions.svelte.js';
import { createSalvageExecution } from './inventorySalvageExecution.svelte.js';
import { createPlayerResultOrder } from './playerResultOrder.svelte.js';
import { markFiredStageComplications } from '../../../utils/progressiveStageComplications.js';

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
  if (
    String(row?.name ?? '')
      .toLowerCase()
      .includes(query)
  )
    return true;
  const tags = Array.isArray(row?.tags) ? row.tags : [];
  if (
    tags.some((tag) =>
      String(tag ?? '')
        .toLowerCase()
        .includes(query)
    )
  )
    return true;
  const essences = Array.isArray(row?.essences) ? row.essences : [];
  if (
    essences.some((essence) =>
      String(essence?.name ?? '')
        .toLowerCase()
        .includes(query)
    )
  )
    return true;
  return false;
}

/**
 * The primary participation of a card: the `systems[]` entry the card's top-level
 * identity mirrors (the builder's salvageable-biased primary), else the first entry.
 * Pure, so the store never re-derives the builder's primary-selection bias.
 */
function primaryParticipation(item) {
  const systems = Array.isArray(item?.systems) ? item.systems : [];
  return systems.find((entry) => entry?.systemId === item?.systemId) ?? systems[0] ?? null;
}

/**
 * The progressive salvage order id for a participation — `<systemId>:<componentId>`
 * (issue 766). Component ids are NOT globally unique (copy-import preserves them), so the
 * old `salvage:<componentId>` key collided across systems the moment the collapse surfaced
 * two participations of one card. Returns null when either id is missing.
 */
function salvageOrderId(participation) {
  const systemId = participation?.systemId;
  const componentId = participation?.componentId;
  if (typeof systemId !== 'string' || systemId.trim() === '') return null;
  if (typeof componentId !== 'string' || componentId.trim() === '') return null;
  return `${systemId}:${componentId}`;
}

function matchesFilter(row, filter) {
  switch (filter) {
    case 'components':
      // Books (recipe items), essence rows and tool-only cards are their own pills, so
      // the Components pill lists only true crafting components.
      //
      // `isToolOnly` (issue 1119) is deliberately a NEGATIVE test, matching its siblings: a
      // positive `isComponent === true` would silently drop every hand-built row that omits
      // the flag. A component that is ALSO a registered tool has `isToolOnly: false` and so
      // still lists under both this pill and Tools.
      return (
        row?.isEssenceSource !== true && row?.isRecipeItem !== true && row?.isToolOnly !== true
      );
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
  const listingLoad = createListingLoad({
    fetch: () =>
      services?.listInventoryForActor?.({
        rememberedActorId: currentActorId(),
        componentSourceActorIds: currentSourceIds(),
      }),
    onResult: () => order.seed(),
  });
  const listing = $derived(listingLoad.listing);
  let selectedKey = $state(null);
  // The acting/selected system participation within the selected card (issue 766). null =
  // the primary participation. Reset on every `select`, so a freshly-selected card always
  // opens on its primary. Salvage routing, the success-ribbon gate, and the progressive
  // order key all resolve through the participation this names — never the primary default.
  let selectedSystemId = $state(null);
  let search = $state('');
  let filter = $state('all');
  let sort = $state('name');
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

  const pageWindow = createPageWindow({
    items: () => visibleItems,
    defaultPageSize: DEFAULT_PAGE_SIZE,
  });

  // The execution sub-store's held row (decision 11) takes precedence while a salvage ribbon is
  // up: the last copy of a salvaged component leaves the listing, so `rows.find` misses and the
  // fallback would swap in an unrelated component under the ribbon. The held snapshot is the row as
  // it was salvaged; it is released on the next `select` or reset.
  const selectedItem = $derived.by(() => {
    const live = rows.find((row) => row?.key === selectedKey) ?? null;
    if (live) return live;
    const held = salvageExecution?.heldItem ?? null;
    if (held && held.key === selectedKey) return held;
    return firstVisible({ all: rows, visible: visibleItems });
  });

  /**
   * The acting participation of the selected card (issue 766): the `systems[]` entry named
   * by `selectedSystemId`, else the PRIMARY. For a single-system / legacy card (no
   * `systems`) it is the card's own top-level identity, so salvage routing is uniform and
   * byte-identical to today. Never falls back to the primary once a system is explicitly
   * selected AND still present.
   */
  const selectedParticipation = $derived.by(() => {
    const item = selectedItem;
    if (!item) return null;
    const systems = Array.isArray(item.systems) ? item.systems : [];
    if (systems.length === 0) {
      return {
        systemId: item.systemId ?? null,
        componentId: item.componentId ?? null,
        salvage: item.salvage ?? null,
        ownedQuantity: Number(item.totalQuantity ?? 0),
      };
    }
    const chosen =
      systems.find((entry) => entry?.systemId === selectedSystemId) ?? primaryParticipation(item);
    return chosen ?? null;
  });

  // Declared before the composable and assigned after it, so `markFiredStages` closes over the
  // execution sub-store LAZILY: the fired derive is read only when `orderedStages` is evaluated.
  let salvageExecution = null;

  /**
   * Player Result Order editing for the inspected participation (issue 675), through the composable
   * both progressive player surfaces share (issue 1695).
   *
   * `markFiredStages` marks the resolution's fired tense onto the forecast the builder already
   * attached (issue 1286), and it lands here rather than in the builder because the forecast rides
   * on the stage row precisely so the reorder carries it: marking has to happen downstream of the
   * reorder and of the threshold recompute, or the marks would be keyed to positions the panel no
   * longer renders. This is the last point at which the list is final.
   *
   * It marks and never adds. `markFiredStageComplications` only ever flips `fired` on an entry the
   * forecast already published, so a record naming a complication the forecast withheld — a
   * `gmOnly` one above all — matches nothing and is dropped. That is why this store re-applies no
   * audience filter of its own: the redaction is structural, and `publicComplications` cannot be
   * re-applied here anyway, since it reads a `visibility` its own output does not carry.
   *
   * Identity is preserved end to end: both halves return their input when they change nothing, so a
   * component authoring no player-visible complication gets back the very array the builder
   * published.
   */
  const order = createPlayerResultOrder({
    scope: 'salvage',
    subject: () => {
      const salvage = selectedParticipation?.salvage ?? null;
      return {
        orderId: salvageOrderId(selectedParticipation),
        stages: salvage?.stages,
        awardMode: salvage?.awardMode,
        allowReorder: salvage?.allowPlayerResultReorder !== false,
      };
    },
    read: () => services?.getProgressiveResultOrder?.(),
    write: (key, ids) => services?.setProgressiveResultOrder?.(key, ids),
    revertMessage: () => services?.progressiveOrderRevertMessage?.(),
    markFiredStages: (stages) =>
      markFiredStageComplications(stages, salvageExecution.firedComplications),
  });

  /**
   * The two sub-stores this store composes (issue 1695). The seam is bidirectional by design:
   * `createSalvageExecution` owns the ribbon and the held row, and the `selectedItem` derive above
   * reads that held row back through its lazy getter, which is what keeps the ribbon on the
   * component that was salvaged when its last copy leaves the listing (decision 11). Both are
   * handed thunks rather than values, so each reads this store's live `$derived` rather than one
   * frozen pass, and neither imports back.
   */
  salvageExecution = createSalvageExecution({
    selectedItem: () => selectedItem,
    selectedParticipation: () => selectedParticipation,
    rows: () => rows,
    holdSelection: (key) => {
      selectedKey = key ?? selectedKey;
    },
    flushOrder: order.flush,
    orderAnnouncement: () => order.announcement,
    reload: load,
    services,
  });

  const bulk = createBulkActions({
    rows: () => rows,
    inspectedKey: () => selectedKey,
    selectedSystemId: () => selectedSystemId,
    // The browse store's own resolvers, injected rather than copied: a second declaration of
    // either would be two answers to one question.
    primaryParticipation,
    salvageOrderId,
    orders: () => order.orders,
    flushOrder: order.flush,
    orderAnnouncement: () => order.announcement,
    clearRibbon: salvageExecution.clearRibbon,
    reload: load,
    services,
  });
  /** Fetch the inventory listing for the current actor + component sources. */
  function load(quiet = false) {
    return listingLoad.refresh(quiet);
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
   * Select an item by key. Releases any held (salvaged) row and its ribbon, and resets the
   * acting participation to the primary so a freshly-selected card opens on its default
   * system (issue 766).
   */
  function select(key) {
    // Cleared FIRST (issue 859) so every plain-click exit from bulk gets it for
    // free — a normal card click always means "leave bulk, inspect this one".
    bulk.clearBulkSelection();
    selectedKey = key ?? null;
    selectedSystemId = null;
    salvageExecution.clearRibbon();
  }

  /**
   * Handle a hook-driven listing refresh, quietly reloading UNLESS a bulk run is in
   * flight (issue 859).
   *
   * THIS IS THE ONLY WAY THE SHELL MAY REFRESH THE LISTING. `FabricateAppRoot`
   * routes BOTH of its subscriptions here — `subscribeInventoryChange` and
   * `subscribeCraftingDataChange` (`src/ui/svelte/util/foundryBridge.js`) — and
   * `fabricate-app-shell.test.js` pins the absence of a direct `load(true)` call
   * there, because a bypassed guard is indistinguishable from a missing one and
   * this store's own tests cannot see the bypass (they call the guard directly).
   * The item-change hook is the sharp case: item mutations arrive one hook fire per
   * document, so a bulk run's burst would otherwise reload roughly once per queued
   * item.
   *
   * This is a DROP, not a defer, and that is safe ONLY because it is paired with
   * `bulkSalvage()`/`bulkDestroy()` always performing their own terminal
   * `load(true)` once the run ends — a dropped reload here is never lost, only
   * deferred to that terminal reload.
   *
   * The flag is read HERE, AT FIRE TIME — never by unsubscribing/re-subscribing
   * the hook, which is registered ONCE for the whole window's lifetime.
   */
  function reloadOnDocumentChange() {
    if (bulk.busy) return;
    void load(true);
  }

  /**
   * Choose which system participation the selected card's detail body scopes to (issue
   * 766). null restores the primary. Clears the salvage ribbon: it belongs to whichever
   * participation was just acted on, and switching systems changes the acting one.
   */
  function selectSystem(systemId) {
    selectedSystemId = systemId ?? null;
    salvageExecution.clearRibbon();
  }

  function setSearch(value) {
    search = typeof value === 'string' ? value : '';
    pageWindow.resetPage();
  }

  /** Switch the active filter pill (jumps back to the first page). */
  function setFilter(value) {
    filter = INVENTORY_FILTERS.includes(value) ? value : 'all';
    pageWindow.resetPage();
  }

  /** Switch the sort key. */
  function setSort(value) {
    sort = VALID_SORTS.has(value) ? value : 'name';
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
      return listingLoad.loading;
    },
    get error() {
      return listingLoad.error;
    },
    get loadedOnce() {
      return listingLoad.loadedOnce;
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
      return pageWindow.page;
    },
    get pageSize() {
      return pageWindow.pageSize;
    },
    get pageCount() {
      return pageWindow.pageCount;
    },
    get selectedKey() {
      return selectedKey;
    },
    get learningRecipeId() {
      return learningRecipeId;
    },
    get salvagingKey() {
      return salvageExecution.salvagingKey;
    },
    get salvageResult() {
      return salvageExecution.salvageResult;
    },
    get orderedSalvageStages() {
      return order.orderedStages;
    },
    get salvageOrderAnnouncement() {
      return order.announcement;
    },
    get salvageOrderIsCustom() {
      return order.isCustom;
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
      return pageWindow.pageItems;
    },
    get selectedItem() {
      return selectedItem;
    },
    get selectedSystemId() {
      return selectedSystemId;
    },
    get selectedParticipation() {
      return selectedParticipation;
    },
    get bulkSelectedKeys() {
      return bulk.bulkSelectedKeys;
    },
    get bulkRunning() {
      return bulk.bulkRunning;
    },
    get bulkDestroying() {
      return bulk.bulkDestroying;
    },
    get bulkProgress() {
      return bulk.bulkProgress;
    },
    get bulkReport() {
      return bulk.bulkReport;
    },
    get bulkSelectedRows() {
      return bulk.bulkSelectedRows;
    },
    get bulkEntries() {
      return bulk.bulkEntries;
    },
    get bulkSalvageable() {
      return bulk.bulkSalvageable;
    },
    get bulkBlocked() {
      return bulk.bulkBlocked;
    },
    get bulkCounts() {
      return bulk.bulkCounts;
    },
    get bulkYieldPreview() {
      return bulk.bulkYieldPreview;
    },
    get bulkActive() {
      return bulk.bulkActive;
    },
    load,
    learn,
    learnAll,
    salvage: salvageExecution.salvage,
    resetSalvage: salvageExecution.resetSalvage,
    reorderSalvageStage: order.reorder,
    resetSalvageOrder: order.reset,
    flushSalvageOrder: order.flush,
    select,
    selectSystem,
    setSearch,
    setFilter,
    setSort,
    setPage: pageWindow.setPage,
    setPageSize: pageWindow.setPageSize,
    tickWorldTime,
    toggleBulkSelection: bulk.toggleBulkSelection,
    removeFromBulkSelection: bulk.removeFromBulkSelection,
    clearBulkSelection: bulk.clearBulkSelection,
    bulkSalvage: bulk.bulkSalvage,
    bulkDestroy: bulk.bulkDestroy,
    reloadOnDocumentChange,
  };
}
