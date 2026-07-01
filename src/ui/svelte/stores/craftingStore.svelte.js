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
 *   `craftRecipe({ actorId, recipeId, ingredientSetId, componentSourceActorIds })`,
 *   `notify(message)`, `craftErrorMessage()` (localized generic craft-failure
 *   text for a thrown craft), `getRecipeManager()`, `getCraftingSourceActors()`,
 *   `getSelectedCraftingActorId()`, `getCraftingComponentSourceIds()`, and the
 *   optional sibling `craftingSources` store.
 * @returns {object} The reactive crafting store.
 */

import { aggregateShoppingList } from '../util/shoppingListAggregator.js';

const DEFAULT_PAGE_SIZE = 12;
const MAX_RECENTS = 8;
// Mirrors CRAFTING_BROWSE_STATUS.AVAILABLE (systems/CraftingListingBuilder.js). A
// local copy keeps the store free of the builder import so its unit-test compiler
// need not resolve that module graph.
const RECIPE_STATUS_AVAILABLE = 'available';

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
  let shoppingEntries = $state([]);
  let craftInFlight = $state(false);
  // Per-recipe last craft outcome, keyed by recipe id. A plain object reassigned
  // on write so the rune tracks the change.
  let lastRollResult = $state({});
  let recents = $state([]);
  let worldTimeTick = $state(0);
  // Left-column filters (client-local browse state, alongside search/pagination).
  let favouriteIds = $state([]);
  let favouritesOnly = $state(false);
  let craftableOnly = $state(false);
  let systemFilter = $state(null);

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

  const selectedSet = $derived.by(() => {
    const sets = Array.isArray(selectedRecipe?.ingredientSets) ? selectedRecipe.ingredientSets : [];
    if (sets.length === 0) return null;
    const targetId = selectedIngredientSetId ?? selectedRecipe?.defaultSetId ?? null;
    return sets.find((set) => set?.id === targetId) ?? sets[0];
  });

  const selectedCraftability = $derived(selectedSet?.craftability ?? null);

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
      loadedOnce = true;
    } catch (err) {
      error = err?.message ?? String(err);
    } finally {
      if (!quiet) loading = false;
    }
  }

  /** Select a recipe by id, resetting the chosen ingredient set to its default. */
  function select(recipeId) {
    selectedRecipeId = recipeId ?? null;
    selectedIngredientSetId = null;
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

  /** Toggle a recipe's favourite state, persisting through the services seam. */
  function toggleFavourite(recipeId) {
    if (!recipeId) return;
    const next = services?.toggleFavouriteRecipe?.(recipeId);
    favouriteIds = Array.isArray(next) ? next : favouriteIds;
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
        componentSourceActorIds: currentSourceIds(),
      });
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
    toggleFavourite,
    setPage,
    setPageSize,
    chooseIngredientSet,
    addToShoppingList,
    removeFromShoppingList,
    clearShoppingList,
    craft,
    tickWorldTime,
    markRecent,
  };
}
