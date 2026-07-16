/**
 * craftingStore — Svelte 5 runes store backing the player-facing Crafting tab.
 *
 * Mirrors {@link createActorBarStore}: a plain factory that NEVER touches Foundry
 * globals (`game`/`ui`/`Hooks`/…). Every Foundry-facing read/write flows through
 * the injected `services` bag (the unified-window seam set built in
 * `SvelteFabricateApp._buildServices`), so the store stays presentational and
 * fully unit-testable.
 *
 * The store holds the redaction-safe `RecipeListingModel` listing produced by the
 * `CraftingListingBuilder` (via `services.listCraftingForActor`) plus the local
 * browse state (search, pagination, selection, shopping list, recents) and the
 * craft action. The selected character + component-source actors are owned by the
 * sibling stores/seams; this store reads the current ids through `services` when
 * it loads or crafts.
 *
 * @param {object} deps
 * @param {object} deps.services Injected services bag exposing
 *   `listCraftingForActor({ rememberedActorId, componentSourceActorIds })`,
 *   `craftRecipe({ actorId, recipeId, ingredientSetId, ingredientOptionOverrides, componentSourceActorIds })`,
 *   `evaluateSelectedSet({ recipeId, setId, optionOverrides, actorId, componentSourceActorIds })`
 *   (fresh per-set craftability for an in-session option override — issue 552),
 *   `notify(message)`, `craftErrorMessage()` (localized generic craft-failure
 *   text for a thrown craft), `getRecipeManager()`, `getCraftingSourceActors()`,
 *   `getSelectedCraftingActorId()`, `getCraftingComponentSourceIds()`, and the
 *   optional sibling `craftingSources` store.
 * @returns {object} The reactive crafting store.
 */

import { aggregateShoppingList } from '../util/shoppingListAggregator.js';
import { applyPlayerResultOrder, progressiveOrderKey } from '../../../utils/progressiveResultOrder.js';
import { progressiveStageThresholds } from '../../../utils/progressiveStageThresholds.js';

const DEFAULT_PAGE_SIZE = 12;
// Under `scope: 'user'` every commit is a REPLICATED document write (`#setWorld` broadcasts
// createSetting/updateSetting to every client), so a burst of moves must not become a burst
// of writes. The burst comes from the KEYBOARD path — a player walking a stage up several
// places emits one move per chevron click. Drag emits only ONE move, on drop
// (`ProgressiveStageList` fires `onReorder` from `ondrop`, never from `ondragover`), so it
// settles immediately and the drop-path flush below commits it without waiting.
const ORDER_COMMIT_DEBOUNCE_MS = 400;
const MAX_RECENTS = 8;
// Mirrors CRAFTING_BROWSE_STATUS.AVAILABLE (systems/CraftingListingBuilder.js). A
// local copy keeps the store free of the builder import so its unit-test compiler
// need not resolve that module graph.
const RECIPE_STATUS_AVAILABLE = 'available';
// Mirrors GENERAL_RECIPE_CATEGORY (utils/recipeCategories.js). The reserved
// default bucket is pinned LAST in the category filter (it is the catch-all, not
// interleaved alphabetically). A local copy keeps the store import-free.
const GENERAL_RECIPE_CATEGORY = 'general';

export function createCraftingStore({ services } = {}) {
  let listing = $state(null);
  let loading = $state(false);
  let error = $state(null);
  let loadedOnce = $state(false);
  let selectedRecipeId = $state(null);
  let search = $state('');
  let page = $state(0);
  let pageSize = $state(DEFAULT_PAGE_SIZE);
  let selectedIngredientSetId = $state(null);
  // Per-group option overrides for the selected set (issue 552), keyed by group id:
  // `{ [groupId]: { optionIndex, heldItemId } }`. Empty means the default
  // first-satisfiable resolution (single-option groups and non-interacting players
  // see no change). Reset whenever the recipe or ingredient set changes.
  let selectedIngredientOptions = $state({});
  let shoppingEntries = $state([]);
  let craftInFlight = $state(false);
  // Per-recipe last craft outcome, keyed by recipe id. A plain object reassigned
  // on write so the rune tracks the change.
  let lastRollResult = $state({});
  let recents = $state([]);
  let worldTimeTick = $state(0);
  // Left-column filters (client-local browse state, alongside search/pagination).
  let favouriteIds = $state([]);
  // The player's stored progressive stage orders, keyed `recipe:<id>` (issue 651). A
  // plain object reassigned on write so the rune tracks the change.
  let progressiveOrders = $state({});
  // The last order successfully PERSISTED, per key — the revert target when a write
  // rejects (D7a). Not $state: it is never rendered, only read on failure.
  let persistedOrders = {};
  // Pending debounce timer + the announcement surfaced to the stage list's live region.
  let orderCommitTimer = null;
  let orderAnnouncement = $state('');
  let favouritesOnly = $state(false);
  let craftableOnly = $state(false);
  let systemFilter = $state(null);
  let categoryFilter = $state(null);

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

  const visibleRecipes = $derived.by(() => {
    const recipes = Array.isArray(listing?.recipes) ? listing.recipes : [];
    const query = search.trim().toLowerCase();
    const favourites = new Set(favouriteIds);
    const filtered = recipes.filter((recipe) => {
      if (
        query.length > 0 &&
        !String(recipe?.name ?? '')
          .toLowerCase()
          .includes(query)
      ) {
        return false;
      }
      if (favouritesOnly && !favourites.has(recipe?.id)) return false;
      if (craftableOnly && recipe?.browseStatus !== RECIPE_STATUS_AVAILABLE) return false;
      if (systemFilter && recipe?.systemId !== systemFilter) return false;
      if (categoryFilter && recipe?.category !== categoryFilter) return false;
      return true;
    });
    // Explicit comparator (never a bare `.sort()`): stable A→Z by display name.
    return [...filtered].sort((left, right) =>
      String(left?.name ?? '').localeCompare(String(right?.name ?? ''))
    );
  });

  // The distinct crafting systems present in the listing, for the system-filter
  // dropdown. Derived from the visible-across-systems listing (not the global
  // system library) so the dropdown only offers systems the player actually has
  // recipes in. De-duped by id, sorted A→Z by name.
  const availableSystems = $derived.by(() => {
    const recipes = Array.isArray(listing?.recipes) ? listing.recipes : [];
    const byId = new Map();
    for (const recipe of recipes) {
      const id = recipe?.systemId;
      if (id && !byId.has(id)) byId.set(id, { id, name: String(recipe?.systemName ?? '') });
    }
    return [...byId.values()].sort((left, right) => left.name.localeCompare(right.name));
  });

  // The distinct recipe categories present in the listing, for the category-filter
  // dropdown. Like availableSystems, derived from the visible listing (not a global
  // category vocabulary) so the dropdown only offers categories the player actually
  // has recipes in. De-duped by raw token; sorted non-`general` A→Z by label, then
  // the reserved "General" bucket pinned LAST when present (it is the catch-all).
  const availableCategories = $derived.by(() => {
    const recipes = Array.isArray(listing?.recipes) ? listing.recipes : [];
    const byId = new Map();
    for (const recipe of recipes) {
      const id = recipe?.category;
      if (id && !byId.has(id)) byId.set(id, { id, name: String(recipe?.categoryLabel ?? '') });
    }
    const entries = [...byId.values()];
    const general = entries.filter((entry) => entry.id === GENERAL_RECIPE_CATEGORY);
    const rest = entries
      .filter((entry) => entry.id !== GENERAL_RECIPE_CATEGORY)
      .sort((left, right) => left.name.localeCompare(right.name));
    return [...rest, ...general];
  });

  const pageCount = $derived.by(() => {
    const size = pageSize > 0 ? pageSize : 1;
    return Math.max(1, Math.ceil(visibleRecipes.length / size));
  });

  const pageItems = $derived.by(() => {
    const size = pageSize > 0 ? pageSize : visibleRecipes.length || 1;
    const clampedPage = Math.min(Math.max(0, page), pageCount - 1);
    const start = clampedPage * size;
    return visibleRecipes.slice(start, start + size);
  });

  // Find by id across the full listing; fall back to the first VISIBLE recipe so
  // the selection respects the active search filter.
  const selectedRecipe = $derived.by(() => {
    const recipes = Array.isArray(listing?.recipes) ? listing.recipes : [];
    if (recipes.length === 0) return null;
    return recipes.find((recipe) => recipe?.id === selectedRecipeId) ?? visibleRecipes[0] ?? null;
  });

  // The selected recipe's stages in the PLAYER'S order, with thresholds recomputed for
  // that order (issue 651).
  //
  // Ordering is applied HERE and not in the builder: the order must re-derive when the
  // player reorders, without a rebuild round-trip, and both award call sites plus this
  // one then share ONE reconciliation rule (`applyPlayerResultOrder`) rather than three
  // hand-rolled sorts. The GM's permission gates it — default-true, so only an explicit
  // `false` pins the authored order.
  //
  // THE THRESHOLD MUST BE RECOMPUTED, NOT CARRIED. A threshold is cumulative, so it is a
  // property of a stage's POSITION in the list the roll is spent down — not of the stage.
  // The builder bakes thresholds in AUTHORED order, and `applyPlayerResultOrder` returns
  // elements ===-identical to its inputs (deliberately — downstream depends on it), so a
  // reordered stage would otherwise carry its authored-position threshold with it: for
  // authored [A(5), B(3)] the rows would read "B >=8, A >=5" after moving B up, inverted,
  // with the top row claiming a higher bar than the row beneath. Recomputing through the
  // SAME helper the builder used (pinned by an oracle against the award loop) is what
  // keeps the badge and the award in step.
  const orderedProgressiveStages = $derived.by(() => {
    const stages = Array.isArray(selectedRecipe?.progressiveStages)
      ? selectedRecipe.progressiveStages
      : [];
    if (selectedRecipe?.allowPlayerResultReorder === false) return stages;
    const key = progressiveOrderKey({ scope: 'recipe', id: selectedRecipe?.id });
    if (!key) return stages;

    const ordered = applyPlayerResultOrder(stages, progressiveOrders[key] ?? null);
    // Identity means nothing moved, so the builder's authored thresholds already stand.
    if (ordered === stages) return stages;

    // `difficulty` is already null for an absent/invalid cost, so `?? NaN` reproduces the
    // award loop's skip: no budget reaches the stage, and its threshold stays null (the
    // row omits the badge rather than inventing a number for its new position).
    const thresholds = progressiveStageThresholds({
      results: ordered,
      costFor: (stage) => stage?.difficulty ?? NaN,
      awardMode: selectedRecipe?.progressiveAwardMode || 'equal',
    });
    return ordered.map((stage, index) => ({ ...stage, threshold: thresholds[index] }));
  });

  const selectedSet = $derived.by(() => {
    const sets = Array.isArray(selectedRecipe?.ingredientSets) ? selectedRecipe.ingredientSets : [];
    if (sets.length === 0) return null;
    const targetId = selectedIngredientSetId ?? selectedRecipe?.defaultSetId ?? null;
    return sets.find((set) => set?.id === targetId) ?? sets[0];
  });

  // Craftability for the selected set. With no per-group override this is the baked
  // listing value (single evaluate at listing-build time). When the player overrides
  // an option, the baked value is stale (ingredient display state is precomputed and
  // NOT reactive to an in-session choice), so re-evaluate the ONE selected set through
  // the same RecipeManager.evaluateCraftability → resolveIngredientSelection seam the
  // engine consumes, keeping the tiles == the consumed plan (issue 553 guarantee). No
  // full listing reload per toggle; no selection computed in the UI.
  const selectedCraftability = $derived.by(() => {
    const set = selectedSet;
    const baked = set?.craftability ?? null;
    const overrides = selectedIngredientOptions;
    if (!set?.id || !overrides || Object.keys(overrides).length === 0) return baked;
    const recomputed = services?.evaluateSelectedSet?.({
      recipeId: selectedRecipe?.id ?? null,
      setId: set.id,
      optionOverrides: overrides,
      actorId: currentActorId(),
      componentSourceActorIds: currentSourceIds(),
    });
    return recomputed ?? baked;
  });

  const shoppingAggregate = $derived.by(() => {
    const recipeManager = services?.getRecipeManager?.() ?? null;
    if (!recipeManager || shoppingEntries.length === 0) {
      return aggregateShoppingList([], recipeManager, []);
    }
    const sourceActors = services?.getCraftingSourceActors?.() ?? [];
    return aggregateShoppingList(shoppingEntries, recipeManager, sourceActors);
  });

  /**
   * Fetch the crafting listing for the current actor + component sources.
   *
   * @param {boolean} [quiet=false] When true, do not raise the `loading` flag
   *   (used for background refreshes after a craft / world-time tick) so the list
   *   does not flash a spinner.
   */
  async function load(quiet = false) {
    if (!quiet) loading = true;
    error = null;
    try {
      const result = await services?.listCraftingForActor?.({
        rememberedActorId: currentActorId(),
        componentSourceActorIds: currentSourceIds(),
      });
      listing = result ?? null;
      favouriteIds = services?.getFavouriteRecipeIds?.() ?? [];
      // Seed the player's stored stage orders, mirroring favouriteIds above. The
      // persisted snapshot is the revert target for a rejected write (D7a).
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

  /** Select a recipe by id, resetting the chosen ingredient set + option overrides. */
  function select(recipeId) {
    selectedRecipeId = recipeId ?? null;
    selectedIngredientSetId = null;
    selectedIngredientOptions = {};
  }

  /** Update the search query and jump back to the first page. */
  function setSearch(value) {
    search = typeof value === 'string' ? value : '';
    page = 0;
  }

  /** Toggle the favourites-only filter (jumps back to the first page). */
  function setFavouritesOnly(value) {
    favouritesOnly = value === true;
    page = 0;
  }

  /** Toggle the craftable-only filter (jumps back to the first page). */
  function setCraftableOnly(value) {
    craftableOnly = value === true;
    page = 0;
  }

  /** Filter to a single crafting system id, or clear it with a falsy value. */
  function setSystemFilter(systemId) {
    systemFilter = systemId ? String(systemId) : null;
    page = 0;
  }

  /** Filter to a single recipe category token, or clear it with a falsy value. */
  function setCategoryFilter(category) {
    categoryFilter = category ? String(category) : null;
    page = 0;
  }

  /** Toggle a recipe's favourite state, persisting through the services seam. */
  function toggleFavourite(recipeId) {
    if (!recipeId) return;
    const next = services?.toggleFavouriteRecipe?.(recipeId);
    favouriteIds = Array.isArray(next) ? next : favouriteIds;
  }

  /**
   * Persist the pending order for `key`, reverting and announcing on failure (D7a).
   *
   * Under `scope: 'user'` `set` is an async, replicated document write that CAN REJECT —
   * unlike the client-scoped, synchronous `toggleFavouriteRecipe` above, whose
   * fire-and-forget shape is safe precisely because it cannot fail.
   *
   * The write is optimistic, so by the time a rejection returns the row has ALREADY moved
   * and the live region has ALREADY announced the new position. Leaving that standing
   * would have the player believing an order that was never stored, while their next craft
   * silently awards down the old one — this issue's own defect class, reintroduced at the
   * UI edge. So a failure reverts to the last PERSISTED order and announces the revert
   * through the SAME live region. A toast is not sufficient: a keyboard user reordering by
   * chevron never looks at one.
   */
  async function commitProgressiveOrder(key) {
    const attempted = progressiveOrders[key] ?? [];
    try {
      await services?.setProgressiveResultOrder?.(key, attempted);
      persistedOrders[key] = [...attempted];
    } catch {
      const restored = persistedOrders[key] ?? null;
      progressiveOrders = { ...progressiveOrders };
      if (restored) {
        progressiveOrders[key] = [...restored];
      } else {
        delete progressiveOrders[key];
      }
      orderAnnouncement = services?.progressiveOrderRevertMessage?.() ?? '';
    }
  }

  /**
   * Move a stage of the selected progressive recipe, optimistically and debounced.
   *
   * @param {number} index the stage's current position
   * @param {number} target the position to move it to
   * @param {string} [announcement] pre-formatted live-region text (the component owns the
   *   i18n, and reads the moved stage's name BEFORE the move)
   */
  function reorderProgressiveStage(index, target, announcement = '') {
    const recipeId = selectedRecipe?.id;
    const key = progressiveOrderKey({ scope: 'recipe', id: recipeId });
    if (!key || selectedRecipe?.allowPlayerResultReorder === false) return;

    const current = orderedProgressiveStages;
    if (target < 0 || target >= current.length || index < 0 || index >= current.length) return;

    const next = [...current];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved);
    // Store ids, not indices: they survive a GM editing the recipe (D4).
    progressiveOrders = { ...progressiveOrders, [key]: next.map((stage) => stage.id) };
    orderAnnouncement = announcement;

    if (orderCommitTimer) clearTimeout(orderCommitTimer);
    orderCommitTimer = setTimeout(() => {
      orderCommitTimer = null;
      void commitProgressiveOrder(key);
    }, ORDER_COMMIT_DEBOUNCE_MS);
  }

  /**
   * Flush a pending debounced order write immediately.
   *
   * Called on drop (a drag has already settled, so there is nothing to coalesce) and on
   * window teardown via `SvelteFabricateApp._flushPendingOrderWrite` — without the latter,
   * a player who reorders and immediately closes or refreshes inside the debounce window
   * loses the order silently. A no-op when no write is pending, so a double call from both
   * `close()` and `_onClose()` writes once.
   */
  function flushProgressiveOrder() {
    if (!orderCommitTimer) return Promise.resolve();
    clearTimeout(orderCommitTimer);
    orderCommitTimer = null;
    const key = progressiveOrderKey({ scope: 'recipe', id: selectedRecipe?.id });
    return key ? commitProgressiveOrder(key) : Promise.resolve();
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

  function chooseIngredientSet(setId) {
    selectedIngredientSetId = setId ?? null;
    // Option overrides are keyed by group id (unique per set), so switching sets
    // clears them — the new set's groups start at their first-satisfiable default.
    selectedIngredientOptions = {};
  }

  /**
   * Choose a specific option (and, for a tag option matching multiple held stacks,
   * a specific held item) for one ingredient group (issue 552). Passing a nullish
   * `optionIndex` clears the group's override (back to the default resolution). The
   * whole map is reassigned so the `selectedCraftability` derive recomputes.
   *
   * @param {string} groupId
   * @param {{ optionIndex: number|null, heldItemId?: string|null }} [choice]
   */
  function chooseIngredientOption(groupId, choice = {}) {
    if (!groupId) return;
    const next = { ...selectedIngredientOptions };
    if (choice == null || choice.optionIndex == null) {
      delete next[groupId];
    } else {
      next[groupId] = {
        optionIndex: choice.optionIndex,
        heldItemId: choice.heldItemId ?? null,
      };
    }
    selectedIngredientOptions = next;
  }

  /** Add (or bump) a recipe in the shopping list. */
  function addToShoppingList(recipeId, quantity = 1) {
    if (!recipeId) return;
    const qty = Math.max(1, Math.trunc(Number(quantity) || 1));
    const existing = shoppingEntries.find((entry) => entry.recipeId === recipeId);
    if (existing) {
      shoppingEntries = shoppingEntries.map((entry) =>
        entry.recipeId === recipeId ? { ...entry, quantity: entry.quantity + qty } : entry
      );
      return;
    }
    shoppingEntries = [...shoppingEntries, { recipeId, quantity: qty }];
  }

  /** Decrement a shopping-list recipe's quantity by one, dropping it at zero. */
  function decrementShoppingList(recipeId) {
    if (!recipeId) return;
    shoppingEntries = shoppingEntries
      .map((entry) =>
        entry.recipeId === recipeId ? { ...entry, quantity: entry.quantity - 1 } : entry
      )
      .filter((entry) => entry.quantity > 0);
  }

  function removeFromShoppingList(recipeId) {
    shoppingEntries = shoppingEntries.filter((entry) => entry.recipeId !== recipeId);
  }

  function clearShoppingList() {
    shoppingEntries = [];
  }

  /** Record a recipe id as most-recently crafted (deduped, newest first, capped). */
  function markRecent(recipeId) {
    if (!recipeId) return;
    recents = [recipeId, ...recents.filter((id) => id !== recipeId)].slice(0, MAX_RECENTS);
  }

  /**
   * Craft a recipe. Guards against re-entrancy via `craftInFlight`; on a
   * `{ success: false }` result it surfaces the message through `services.notify`
   * and leaves the listing untouched; on success it records the roll outcome,
   * marks the recipe recent, and quietly refreshes the listing.
   *
   * The `services.craftRecipe` call is wrapped: the underlying crafting engine can
   * throw (e.g. on the currency-payment macro path), so a thrown error is caught
   * and surfaced as a localized generic failure notification rather than an
   * unhandled rejection. `craftInFlight` is always cleared in `finally` so a throw
   * never leaves the craft action stuck.
   *
   * @param {object|null} recipe The recipe model (or null to use the selection).
   * @returns {Promise<object|null>} The craft result.
   */
  async function craft(recipe) {
    if (craftInFlight) return null;
    const recipeId = recipe?.id ?? selectedRecipeId;
    if (!recipeId) return null;
    craftInFlight = true;
    try {
      const result = await services?.craftRecipe?.({
        actorId: currentActorId(),
        recipeId,
        ingredientSetId: selectedIngredientSetId ?? recipe?.defaultSetId ?? null,
        // Per-group option overrides (issue 552) so the engine consumes the same
        // option/stack the tiles show. Empty map keeps the default resolution.
        ingredientOptionOverrides: selectedIngredientOptions,
        componentSourceActorIds: currentSourceIds(),
        // UI-triggered craft: prompt an interactive roll dialog + post the roll to
        // chat (Dice So Nice). Automation/macros omit this and stay silent.
        interactive: true,
      });
      // Dismissing the roll dialog is a user choice, not a failure: a cancelled
      // result is also `success: false`, so it MUST be handled first and returned
      // quietly (no error notification, no listing refresh churn).
      if (result && result.cancelled === true) {
        return result;
      }
      if (result && result.success === false) {
        services?.notify?.(result.message);
        return result;
      }
      lastRollResult = { ...lastRollResult, [recipeId]: result ?? null };
      markRecent(recipeId);
      await load(true);
      return result ?? null;
    } catch (err) {
      const message = services?.craftErrorMessage?.() ?? '';
      services?.notify?.(message);
      return { success: false, results: null, message: err?.message ?? String(err) };
    } finally {
      craftInFlight = false;
    }
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
    get selectedRecipeId() {
      return selectedRecipeId;
    },
    get search() {
      return search;
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
    get selectedIngredientSetId() {
      return selectedIngredientSetId;
    },
    get selectedIngredientOptions() {
      return selectedIngredientOptions;
    },
    get shoppingEntries() {
      return shoppingEntries;
    },
    get craftInFlight() {
      return craftInFlight;
    },
    get lastRollResult() {
      return lastRollResult;
    },
    get recents() {
      return recents;
    },
    get worldTimeTick() {
      return worldTimeTick;
    },
    get favouriteIds() {
      return favouriteIds;
    },
    /** The selected progressive recipe's stages in the player's chosen order. */
    get orderedProgressiveStages() {
      return orderedProgressiveStages;
    },
    /** The raw stored order map, keyed `recipe:<id>`. */
    get progressiveOrders() {
      return progressiveOrders;
    },
    /** Live-region text for the stage list (a move, or a D7a revert). */
    get orderAnnouncement() {
      return orderAnnouncement;
    },
    get favouritesOnly() {
      return favouritesOnly;
    },
    get craftableOnly() {
      return craftableOnly;
    },
    get systemFilter() {
      return systemFilter;
    },
    get availableSystems() {
      return availableSystems;
    },
    get categoryFilter() {
      return categoryFilter;
    },
    get availableCategories() {
      return availableCategories;
    },
    get visibleRecipes() {
      return visibleRecipes;
    },
    get pageItems() {
      return pageItems;
    },
    get selectedRecipe() {
      return selectedRecipe;
    },
    get selectedSet() {
      return selectedSet;
    },
    get selectedCraftability() {
      return selectedCraftability;
    },
    get shoppingAggregate() {
      return shoppingAggregate;
    },
    load,
    select,
    setSearch,
    setFavouritesOnly,
    setCraftableOnly,
    setSystemFilter,
    setCategoryFilter,
    toggleFavourite,
    reorderProgressiveStage,
    flushProgressiveOrder,
    setPage,
    setPageSize,
    chooseIngredientSet,
    chooseIngredientOption,
    addToShoppingList,
    decrementShoppingList,
    removeFromShoppingList,
    clearShoppingList,
    craft,
    tickWorldTime,
    markRecent,
  };
}
