/**
 * craftingStore — Svelte 5 runes store backing the player-facing Crafting tab.
 *
 * Mirrors {@link createActorBarStore}: a plain factory that NEVER touches Foundry
 * globals (`game`/`ui`/`Hooks`/…). Every Foundry-facing read/write flows through
 * the injected `services` bag (the unified-window seam set built in
 * `SvelteFabricateApp._buildServices`), so the store stays presentational and
 * fully unit-testable.
 *
 * The store holds the redaction-safe listing produced by the
 * `CraftingListingBuilder` (via `services.listCraftingForActor`) plus the local
 * browse state (search, pagination, selection, shopping list) and the
 * craft action. The selected character + component-source actors are owned by the
 * sibling stores/seams; this store reads the current ids through `services` when
 * it loads or crafts.
 *
 * ## Two phases: cheap rows, one hydrated detail (issue 1075)
 *
 * `listing.summaries` is a page-cheap row per browsable recipe — identity, grouping,
 * browse status and an OPTIMISTIC material-availability verdict, and nothing else. Search,
 * the four filters, the A-Z sort and pagination all run against those, so browsing costs
 * nothing per recipe beyond the row itself.
 *
 * The rich model the centre column renders — exact per-set craftability, ingredient
 * choices, the essence pool, checks, outcome tiers, durations, steps and progressive
 * stages — is hydrated for the SELECTED recipe only, through `services.hydrateCraftingRecipe`.
 * That mirrors `selectedCraftability` below, which has always round-tripped to a service for
 * one recipe rather than holding a corpus of pre-computed answers.
 *
 * Everything reading the rich model therefore reads `selectedRecipe`, which IS the hydrated
 * object; `selectedSummary` is the row it was hydrated from and is what the browser list
 * highlights. The two are deliberately separate values: the row is what the player picked,
 * the detail is what the app then went and asked for, and conflating them is how a summary
 * field ends up standing in for a detail field nobody noticed was missing.
 *
 * @param {object} deps
 * @param {object} deps.services Injected services bag exposing
 *   `listCraftingForActor({ rememberedActorId, componentSourceActorIds })`,
 *   `hydrateCraftingRecipe({ recipeId, actorId, componentSourceActorIds })` (the exact
 *   rich model for ONE recipe — issue 1075),
 *   `craftRecipe({ actorId, recipeId, ingredientSetId, ingredientOptionOverrides, componentSourceActorIds })`,
 *   `evaluateSelectedSet({ recipeId, setId, optionOverrides, actorId, componentSourceActorIds })`
 *   (fresh per-set craftability for an in-session option override — issue 552),
 *   `notify(message)`, `craftErrorMessage()` (localized generic craft-failure
 *   text), `localize(key)` (used to word an authority refusal that carries a
 *   `reason` and no `message`), `getRecipeManager()`, `getCraftingSourceActors()`,
 *   `getSelectedCraftingActorId()`, `getCraftingComponentSourceIds()`, and the
 *   optional sibling `craftingSources` store.
 * @returns {object} The reactive crafting store.
 */

import { aggregateShoppingList } from '../util/shoppingListAggregator.js';
import {
  isResolvedFailureOutcome,
  journalRefusalMessage,
  resolvedFailureMessage,
} from '../util/journalRunReasons.js';
import {
  CLOSED_SLOT_ID,
  buildRequirementSlots,
  composeSlotKey,
  resolveOpenSlotId,
  suggestChoiceOverrides,
} from '../util/requirementSlots.js';
import { createListingLoad, createPageWindow, firstVisible } from './browseListing.svelte.js';
import { createPlayerResultOrder } from './playerResultOrder.svelte.js';

const DEFAULT_PAGE_SIZE = 12;
// Mirrors CRAFTING_BROWSE_STATUS.AVAILABLE (ui/presenters/CraftingListingBuilder.js). A
// local copy keeps the store free of the builder import so its unit-test compiler
// need not resolve that module graph.
const RECIPE_STATUS_AVAILABLE = 'available';
// Mirrors GENERAL_RECIPE_CATEGORY (utils/recipeCategories.js). The reserved
// default bucket is pinned LAST in the category filter (it is the catch-all, not
// interleaved alphabetically). A local copy keeps the store import-free.
const GENERAL_RECIPE_CATEGORY = 'general';

export function createCraftingStore({ services } = {}) {
  const listingLoad = createListingLoad({
    fetch: () =>
      services?.listCraftingForActor?.({
        rememberedActorId: currentActorId(),
        componentSourceActorIds: currentSourceIds(),
      }),
    onResult: () => {
      favouriteIds = services?.getFavouriteRecipeIds?.() ?? [];
      order.seed();
    },
  });
  const listing = $derived(listingLoad.listing);
  let selectedRecipeId = $state(null);
  let search = $state('');
  let selectedIngredientSetId = $state(null);
  // Per-group option overrides for the selected set (issue 552), keyed by group id:
  // `{ [groupId]: { optionIndex, heldItemId } }`. Empty means the default
  // first-satisfiable resolution (single-option groups and non-interacting players
  // see no change). Reset whenever the recipe or ingredient set changes.
  let selectedIngredientOptions = $state({});
  // The player's essence funding (issue 917), keyed by the COMPOSED scope key
  // (`setId` plus the model's active step id) → `{ [itemKey]: units }`. The engine
  // consumes per set per step, so the pool is scoped the same way; a set-only key
  // would carry a step-1 allocation into a step-2 craft.
  //
  // KEY PRESENCE IS THE "the player has funded this scope themselves" MARKER —
  // deliberately the same idiom `selectedIngredientOptions` uses to tell an untouched
  // choice from an explicitly made one, rather than a second parallel flag map that
  // could drift out of step with the allocation it describes. A scope with no key
  // defers to the resolver's greedy suggestion; a scope whose key maps to `{}` is an
  // explicitly EMPTIED pool and is sent as exactly that.
  //
  // Reading the VALUE cannot tell the two apart, because `setEssenceAllocation`
  // deletes a carrier's entry at zero: a player who zeroes their last allocated
  // carrier leaves `{}` behind, and a `length > 0` test reads that as "no allocation
  // at all" and silently snaps the pool back to the suggestion they just cleared —
  // a control that appears to work while its value goes nowhere.
  let selectedEssenceAllocation = $state({});
  // The chooser the player last opened, as `${scopeKey}:${slotId}`. Stored raw and
  // RE-VALIDATED on read (see `openSlotId`): a bare sticky key opens a stale — or
  // absent — chooser the moment the set, step or recipe changes.
  let activeSlotKey = $state(null);
  // The requirement rail's OWN live region. Deliberately not `orderAnnouncement`: a
  // progressive recipe renders both a stage list and a rail, so one shared field
  // would have the two surfaces overwrite each other's announcements.
  let slotAnnouncement = $state('');
  let shoppingEntries = $state([]);
  let craftInFlight = $state(false);
  // Per-recipe last craft outcome, keyed by recipe id. A plain object reassigned
  // on write so the rune tracks the change.
  let lastRollResult = $state({});
  let worldTimeTick = $state(0);
  // Left-column filters (client-local browse state, alongside search/pagination).
  let favouriteIds = $state([]);
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

  /**
   * The crafting actor, picked OUT of the source-actor list the same derive already has.
   *
   * Matched by ID, never by position (issue 1493). `getCraftingSourceActors` unshifts the
   * crafting actor only when it is not already among the persisted component sources, so
   * index 0 is the crafting actor exactly when the player has NOT also lent that actor's
   * inventory — the commonest configuration being the one where it is not.
   *
   * Reuses `currentActorId`, which is the store's one answer to "who is crafting"; a
   * second read of the same setting here could drift from the one the listing loaded with.
   *
   * @param {object[]} sourceActors
   * @returns {object|null}
   */
  function resolveCraftingActorFrom(sourceActors) {
    const actorId = currentActorId();
    if (!actorId || !Array.isArray(sourceActors)) return null;
    return sourceActors.find((actor) => actor?.id === actorId) ?? null;
  }

  const visibleRecipes = $derived.by(() => {
    const recipes = Array.isArray(listing?.summaries) ? listing.summaries : [];
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
    const recipes = Array.isArray(listing?.summaries) ? listing.summaries : [];
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
    const recipes = Array.isArray(listing?.summaries) ? listing.summaries : [];
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

  const pageWindow = createPageWindow({
    items: () => visibleRecipes,
    defaultPageSize: DEFAULT_PAGE_SIZE,
  });

  const selectedSummary = $derived.by(() => {
    const recipes = Array.isArray(listing?.summaries) ? listing.summaries : [];
    if (recipes.length === 0) return null;
    return (
      recipes.find((recipe) => recipe?.id === selectedRecipeId) ??
      firstVisible({ all: recipes, visible: visibleRecipes })
    );
  });

  // The hydrated rich models of this LOAD PASS, keyed by recipe id.
  //
  // Not `$state`, and not a cache with a lifetime of its own: it is dropped wholesale the
  // moment `listing` is replaced, and `load()` is what replaces it — on mount, on an actor
  // change, after a craft, on a scene change, on a world-time tick and on any inventory
  // mutation of a relevant actor. So a hydrated model can never outlive the read pass whose
  // world it describes, which is the same invalidation rule the inventory snapshot behind it
  // obeys, for the same reason: this model carries exact craftability derived from live
  // `actor.items`, and a stale one would tell the player they can craft something they
  // cannot.
  //
  // Within one pass it memoises, and that IS the point of holding it at all: `selectedRecipe`
  // re-derives whenever any of its dependencies moves — a filter, the page, the search box —
  // and re-hydrating the same recipe on each of those would put the exact-evaluation cost
  // back on the browse path this issue exists to take it off.
  let hydratedDetails = new Map();
  let hydratedForListing = null;

  /**
   * The exact rich model for one recipe, asked for once per load pass.
   *
   * Called BOTH from `select()` — so the cost is paid on the click that caused it — and
   * from the `selectedRecipe` derive, which is what covers the selection the player never
   * made: with nothing selected the browser shows the first visible row, and that row
   * changes under them whenever a filter does.
   *
   * A null answer is surfaced as null rather than falling back to the summary row. The two
   * shapes are not substitutable — the summary has no `ingredientSets`, no `check` and no
   * `defaultSetId` — so a fallback would render a detail panel that is silently missing
   * everything, instead of an empty one that is visibly wrong.
   */
  function hydrateDetail(recipeId) {
    if (!recipeId) return null;
    if (hydratedForListing !== listing) {
      hydratedDetails = new Map();
      hydratedForListing = listing;
    }
    if (hydratedDetails.has(recipeId)) return hydratedDetails.get(recipeId);
    const detail =
      services?.hydrateCraftingRecipe?.({
        recipeId,
        actorId: currentActorId(),
        componentSourceActorIds: currentSourceIds(),
      }) ?? null;
    hydratedDetails.set(recipeId, detail);
    return detail;
  }

  // THE rich model. Every consumer of exact craftability, ingredient sets, checks, steps,
  // durations and progressive stages reads this one.
  const selectedRecipe = $derived.by(() => hydrateDetail(selectedSummary?.id ?? null));

  /**
   * Player Result Order editing for the selected recipe (issue 651), through the composable both
   * progressive player surfaces share (issue 1695).
   *
   * Ordering is applied here and not in the builder: the order must re-derive when the player
   * reorders, without a rebuild round-trip, and both award call sites plus this one then share one
   * reconciliation rule rather than three hand-rolled sorts. The GM's permission gates it,
   * default-true, so only an explicit `false` pins the authored order.
   *
   * The player complication projection rides along for free (issue 1286), because
   * `CraftingListingBuilder._buildProgressiveStages` attaches each stage's player-visible forecast
   * to the row itself; a parallel list keyed by result id would desynchronise at exactly the point
   * the reorder happens.
   *
   * No `markFiredStages` hook is passed, and one must not be added: the fired record is defined on
   * the salvage run record, the immediate crafting path writes none, so this surface has nothing to
   * read and every entry honestly reads `fired: false`. Nor may a component re-derive the tense
   * from a stage being short — `match` and the condition roll mean a missed stage need not have
   * fired anything. No audience filter belongs here either: the rows arrive already redacted
   * builder-side, against the same records the engine fires from, so a second copy of that rule is
   * only an opportunity for the two to drift.
   */
  const order = createPlayerResultOrder({
    scope: 'recipe',
    subject: () => ({
      orderId: selectedRecipe?.id ?? null,
      stages: selectedRecipe?.progressiveStages,
      awardMode: selectedRecipe?.progressiveAwardMode,
      allowReorder: selectedRecipe?.allowPlayerResultReorder !== false,
    }),
    read: () => services?.getProgressiveResultOrder?.(),
    write: (key, ids) => services?.setProgressiveResultOrder?.(key, ids),
    revertMessage: () => services?.progressiveOrderRevertMessage?.(),
  });

  const selectedSet = $derived.by(() => {
    const sets = Array.isArray(selectedRecipe?.ingredientSets) ? selectedRecipe.ingredientSets : [];
    if (sets.length === 0) return null;
    const targetId = selectedIngredientSetId ?? selectedRecipe?.defaultSetId ?? null;
    return sets.find((set) => set?.id === targetId) ?? sets[0];
  });

  // The pool's scope key. `craftability.essencePool.scopeKey` is the bare SET id;
  // only the store knows which step the model reports as active, so the step half is
  // composed here. A craftable recipe ALWAYS reports a step id — a single-step recipe
  // reports the synthesized `implicit-step` from `Recipe.getExecutionSteps` — so the
  // composed form is what ships; the bare-key branch covers a listing entry that
  // carries no run position at all (a Discovery-Mode teaser, which has no
  // craftability and so never reaches the pool).
  const essenceScopeKey = $derived.by(() => {
    const setId = selectedSet?.id ?? null;
    if (!setId) return null;
    const stepId = selectedRecipe?.activeStepId ?? null;
    return stepId ? `${setId}::${stepId}` : setId;
  });

  // `null` while the player has not funded this scope at all (defer to the resolver's
  // suggestion); an object — POSSIBLY EMPTY — once they have (send exactly that).
  const currentEssenceAllocation = $derived.by(() => {
    const scopeKey = essenceScopeKey;
    if (!scopeKey || !Object.hasOwn(selectedEssenceAllocation, scopeKey)) return null;
    return selectedEssenceAllocation[scopeKey] ?? {};
  });

  // Craftability for the selected set. With no per-group override AND no essence
  // allocation this is the baked listing value (single evaluate at listing-build
  // time). As soon as the player overrides an option OR allocates a carrier to the
  // essence pool, the baked value is stale (ingredient display state is precomputed
  // and NOT reactive to an in-session choice), so re-evaluate the ONE selected set
  // through the same RecipeManager.evaluateCraftability → resolveIngredientSelection
  // seam the engine consumes, keeping the tiles == the consumed plan (issue 553).
  //
  // THE ALLOCATION HALF OF THAT GUARD IS LOAD-BEARING (issue 917): gating only on
  // overrides means a stepper-only change never re-evaluates, so the pool would ship
  // green and completely inert — every bar frozen at the baked suggestion while the
  // craft consumed something else.
  const selectedCraftability = $derived.by(() => {
    const set = selectedSet;
    const baked = set?.craftability ?? null;
    const overrides = selectedIngredientOptions;
    const allocation = currentEssenceAllocation;
    const hasOverrides = Object.keys(overrides ?? {}).length > 0;
    // PRESENCE, not size: an explicitly emptied pool must re-evaluate too. Sizing it
    // would send a cleared pool straight back to the baked suggestion, so the bars
    // would refill themselves the moment the player zeroed their last carrier.
    const hasAllocation = allocation !== null;
    if (!set?.id || (!hasOverrides && !hasAllocation)) return baked;
    const recomputed = services?.evaluateSelectedSet?.({
      recipeId: selectedRecipe?.id ?? null,
      setId: set.id,
      optionOverrides: overrides,
      // NULL, not `{}`, for an untouched pool. The model reads a supplied allocation
      // as authoritative and never tops it up, and `{}` is a supplied allocation — so
      // sending it for an untouched pool zeroed every essence bar and blocked the
      // craft as soon as the player picked an ingredient OPTION, which allocates
      // nothing. Only an explicitly emptied pool may send `{}`.
      essenceAllocation: allocation,
      stepId: selectedRecipe?.activeStepId ?? null,
      actorId: currentActorId(),
      componentSourceActorIds: currentSourceIds(),
    });
    return recomputed ?? baked;
  });

  // The rail's ordered slot list, and the chooser that is open for it.
  const railSlots = $derived(
    buildRequirementSlots(selectedCraftability, {
      chosenGroupIds: Object.keys(selectedIngredientOptions ?? {}),
    })
  );

  const openSlotId = $derived(
    resolveOpenSlotId({
      slots: railSlots,
      scopeKey: essenceScopeKey,
      rememberedKey: activeSlotKey,
    })
  );

  const shoppingAggregate = $derived.by(() => {
    const recipeManager = services?.getRecipeManager?.() ?? null;
    if (!recipeManager || shoppingEntries.length === 0) {
      return aggregateShoppingList([], recipeManager, []);
    }
    const sourceActors = services?.getCraftingSourceActors?.() ?? [];
    return aggregateShoppingList(shoppingEntries, recipeManager, sourceActors, {
      craftingActor: resolveCraftingActorFrom(sourceActors),
    });
  });

  /** Fetch the crafting listing for the current actor + component sources. */
  function load(quiet = false) {
    return listingLoad.refresh(quiet);
  }

  /**
   * Select a recipe by id, resetting every per-selection choice: the ingredient set,
   * the per-group option overrides, the essence allocation and the open chooser.
   * Rapid recipe switching must not leave one recipe's funding pointed at another's.
   */
  function select(recipeId) {
    selectedRecipeId = recipeId ?? null;
    selectedIngredientSetId = null;
    selectedIngredientOptions = {};
    resetRequirementSelection();
    // Hydrate the exact detail HERE, on the click, rather than leaving it to the first
    // reader (issue 1075). The derive below would fetch it anyway, so this buys no
    // correctness — it buys attribution: the round-trip happens inside the interaction that
    // asked for it instead of inside whichever render happened to read the model first.
    hydrateDetail(selectedRecipeId);
  }

  /**
   * Drop the scoped essence funding, the open chooser and its announcement.
   *
   * Dropping the whole map drops the per-scope "the player funded this" markers with
   * it — they are the same keys — so a scope the player has left can never leave a
   * stale marker pointing at it. A step change needs no reset for the same reason:
   * the step id is part of the scope key, so the new step starts untouched.
   */
  function resetRequirementSelection() {
    selectedEssenceAllocation = {};
    activeSlotKey = null;
    slotAnnouncement = '';
  }

  function setSearch(value) {
    search = typeof value === 'string' ? value : '';
    pageWindow.resetPage();
  }

  /** Toggle the favourites-only filter (jumps back to the first page). */
  function setFavouritesOnly(value) {
    favouritesOnly = value === true;
    pageWindow.resetPage();
  }

  /** Toggle the craftable-only filter (jumps back to the first page). */
  function setCraftableOnly(value) {
    craftableOnly = value === true;
    pageWindow.resetPage();
  }

  /** Filter to a single crafting system id, or clear it with a falsy value. */
  function setSystemFilter(systemId) {
    systemFilter = systemId ? String(systemId) : null;
    pageWindow.resetPage();
  }

  /** Filter to a single recipe category token, or clear it with a falsy value. */
  function setCategoryFilter(category) {
    categoryFilter = category ? String(category) : null;
    pageWindow.resetPage();
  }

  /** Toggle a recipe's favourite state, persisting through the services seam. */
  function toggleFavourite(recipeId) {
    if (!recipeId) return;
    const next = services?.toggleFavouriteRecipe?.(recipeId);
    favouriteIds = Array.isArray(next) ? next : favouriteIds;
  }

  function chooseIngredientSet(setId) {
    selectedIngredientSetId = setId ?? null;
    // Option overrides are keyed by group id (unique per set), so switching sets
    // clears them — the new set's groups start at their first-satisfiable default.
    selectedIngredientOptions = {};
    // The essence pool and the open chooser are set-scoped for the same reason: a
    // carrier allocated for one set funds requirements the new set does not have.
    resetRequirementSelection();
  }

  /**
   * Toggle ONE chooser in the requirement rail.
   *
   * The key is stored scoped, so it stops matching (and the rail falls back to the
   * first unsatisfied slot) as soon as the set or step moves under it.
   *
   * Clicking the slot that is ALREADY open COLLAPSES it, which is what a control
   * reporting `aria-expanded="true"` promises. Clearing the remembered key cannot
   * express that: with nothing remembered the resolver re-opens the first unsatisfied
   * slot, which is usually the very slot just clicked, so the click read as a no-op.
   * Only the scoped CLOSED sentinel survives that re-validation.
   *
   * A nullish slot id is the distinct FORGET operation: it drops the player's choice
   * and lets the rail re-derive its own default, which is what a caller that is not
   * the tile (a reset, a programmatic clear) means.
   *
   * @param {string|null} slotId
   */
  function openSlot(slotId) {
    activeSlotKey = slotId
      ? composeSlotKey(essenceScopeKey, slotId === openSlotId ? CLOSED_SLOT_ID : slotId)
      : null;
    slotAnnouncement = '';
  }

  /**
   * Allocate `units` of one held item to the selected set's shared essence pool.
   *
   * The key is an index into the ledger the resolver already produced (the pool's
   * own `carriers[].itemKey`), never a uuid the engine would have to resolve, and a
   * zero clears the entry rather than storing a no-op. The whole map is reassigned
   * so `selectedCraftability` re-evaluates and the bars, the tiles and the
   * consumption plan all move together.
   *
   * The SCOPE's own entry is written either way, including when clearing the last
   * carrier leaves it `{}`: that entry is what records that the player has taken the
   * pool over, so an emptied pool stays empty instead of reverting to the suggestion.
   *
   * @param {string} itemKey
   * @param {number} units
   */
  function setEssenceAllocation(itemKey, units) {
    const scopeKey = essenceScopeKey;
    if (!scopeKey || !itemKey) return;
    const amount = Math.max(0, Math.trunc(Number(units) || 0));
    const scoped = { ...(selectedEssenceAllocation[scopeKey] ?? {}) };
    if (amount > 0) scoped[itemKey] = amount;
    else delete scoped[itemKey];
    selectedEssenceAllocation = { ...selectedEssenceAllocation, [scopeKey]: scoped };
  }

  /**
   * "Pick for me": fill the set's unmade choices and adopt the resolver's suggested
   * essence allocation.
   *
   * BOTH halves are read off the craftability the resolver produced — the allocation
   * is `essencePool.suggested`, the choices come from `ingredientChoices`' own
   * held/satisfied numbers. Nothing is recomputed in the UI, because a second
   * implementation of "what is best here" would drift from the plan the engine
   * consumes, which is the defect class this whole surface exists to remove. On an
   * infeasible inventory the resolver's suggestion is the best PARTIAL one, so the
   * shortfall stays visible on the tiles instead of this throwing or looping.
   *
   * @param {string} [announcement] pre-formatted live-region text (the component
   *   owns the i18n, exactly as the progressive reorder path does).
   */
  function pickForMe(announcement = '') {
    const craftability = selectedCraftability;
    const suggestedOptions = suggestChoiceOverrides(craftability);
    if (Object.keys(suggestedOptions).length > 0) {
      selectedIngredientOptions = { ...selectedIngredientOptions, ...suggestedOptions };
    }
    // Adopting the suggestion is itself an EDIT — the player asked for it — so the
    // write happens whenever the set has a pool at all, marking the scope funded even
    // when the suggestion is empty. Sizing the suggestion instead would leave the
    // scope reading as untouched, and a later manual zeroing would then revert to the
    // suggestion rather than honouring the empty selection on screen.
    const pool = craftability?.essencePool ?? null;
    const scopeKey = essenceScopeKey;
    if (scopeKey && pool) {
      selectedEssenceAllocation = {
        ...selectedEssenceAllocation,
        [scopeKey]: { ...(pool.suggested ?? {}) },
      };
    }
    slotAnnouncement = typeof announcement === 'string' ? announcement : '';
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

  /**
   * Craft a recipe. Guards against re-entrancy via `craftInFlight`. A REFUSAL
   * (`success: false` with no resolved disposition) is surfaced through
   * `services.notify` and leaves the listing untouched; a success OR a resolved
   * failed check records the roll outcome and quietly refreshes the listing.
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
  /**
   * The scoped essence funding to send with a craft, or null when the player has not
   * funded this scope at all (which keeps today's behaviour byte-for-byte: the engine
   * allocates its own suggestion).
   *
   * An explicitly EMPTIED pool is `{}` and IS sent. The engine honours a short
   * allocation and never tops it up, so an empty one blocks the craft with the
   * missing-materials reason instead of silently drawing the full greedy allocation
   * the player had just cleared.
   *
   * It names the step and set it was authored against rather than being a bare map:
   * the ENGINE re-resolves the step from the active run and drops a payload naming a
   * different one. A store-side guard would check an index that is stale by
   * construction — a timed gate maturing or another owner advancing the run can move
   * it between this read and the click.
   *
   * @param {object|null} recipe
   * @private
   */
  function essenceAllocationPayload(recipe) {
    const allocation = currentEssenceAllocation;
    if (allocation === null) return null;
    return {
      stepId: selectedRecipe?.activeStepId ?? null,
      ingredientSetId: selectedIngredientSetId ?? recipe?.defaultSetId ?? null,
      allocation: { ...allocation },
    };
  }

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
        // The player's essence funding for the ACTIVE step's set (issue 917), so the
        // block consumes exactly the carriers the pool bars showed.
        ingredientEssenceAllocation: essenceAllocationPayload(recipe),
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
      // A versioned-run authority refusal carries `reason` and NO `message`, so
      // notifying `result.message` alone showed the literal text "undefined".
      if (result && result.success === false && !isResolvedFailureOutcome(result)) {
        services?.notify?.(
          journalRefusalMessage(result, services?.localize, services?.craftErrorMessage?.())
        );
        return result;
      }
      // A resolved failure falls THROUGH to the success tail on purpose: the check ran, the
      // attempt may have spent materials under the failure policy, and the listing is stale.
      const failed = result?.success === false;
      const notice = failed ? resolvedFailureMessage(services?.localize) : '';
      if (notice) services?.notify?.(notice);
      lastRollResult = {
        ...lastRollResult,
        [recipeId]: failed ? { ...result, message: notice } : (result ?? null),
      };
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
      return listingLoad.loading;
    },
    get error() {
      return listingLoad.error;
    },
    get loadedOnce() {
      return listingLoad.loadedOnce;
    },
    get selectedRecipeId() {
      return selectedRecipeId;
    },
    get search() {
      return search;
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
    get selectedIngredientSetId() {
      return selectedIngredientSetId;
    },
    get selectedIngredientOptions() {
      return selectedIngredientOptions;
    },
    /** The whole scoped allocation map, keyed by composed scope key. */
    get selectedEssenceAllocation() {
      return selectedEssenceAllocation;
    },
    /** The selected set + active step's scope key, or null with no set. */
    get essenceScopeKey() {
      return essenceScopeKey;
    },
    /** The requirement rail's ordered slots for the selected set. */
    get railSlots() {
      return railSlots;
    },
    /** Which chooser is open, re-validated against the live slot list on read. */
    get openSlotId() {
      return openSlotId;
    },
    /** Live-region text for the rail (currently "Pick for me" only). */
    get slotAnnouncement() {
      return slotAnnouncement;
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
    get worldTimeTick() {
      return worldTimeTick;
    },
    get favouriteIds() {
      return favouriteIds;
    },
    /** The selected progressive recipe's stages in the player's chosen order. */
    get orderedProgressiveStages() {
      return order.orderedStages;
    },
    /** The raw stored order map, keyed `recipe:<id>`. */
    get progressiveOrders() {
      return order.orders;
    },
    /** Live-region text for the stage list (a move, or a D7a revert). */
    get orderAnnouncement() {
      return order.announcement;
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
      return pageWindow.pageItems;
    },
    /**
     * The selected ROW — the cheap summary the browser list highlights, and the identity
     * the detail was hydrated from. Read this (never `selectedRecipe`) for anything that
     * must survive a failed or pending hydration, such as which row is marked selected.
     */
    get selectedSummary() {
      return selectedSummary;
    },
    /** The selected recipe's exact, hydrated rich model (issue 1075). */
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
    reorderProgressiveStage: order.reorder,
    flushProgressiveOrder: order.flush,
    setPage: pageWindow.setPage,
    setPageSize: pageWindow.setPageSize,
    chooseIngredientSet,
    chooseIngredientOption,
    openSlot,
    setEssenceAllocation,
    pickForMe,
    addToShoppingList,
    decrementShoppingList,
    removeFromShoppingList,
    clearShoppingList,
    craft,
    tickWorldTime,
  };
}
