/**
 * The Crafting System Manager's lifted browser view-state (issue 1438).
 *
 * ── WHY THIS FILE EXISTS ────────────────────────────────────────────────────────────────
 * Every manager browse surface lives inside ONE mutually-exclusive `{#if currentView === …}`
 * chain in `CraftingSystemManagerRoot.svelte`. Opening a record switches `currentView` to that
 * record's editor route, which UNMOUNTS the browser; coming back mounts a fresh instance. Any
 * filter, search term, sort or page the GM left in a component-local `$state` is destroyed by
 * that transition and silently reset to its default — the defect issue 1036 named and fixed for
 * the Essence Studio, still live across nine more surfaces and two rosters.
 *
 * The fix is the one the three shipped studios already use: the state lives on an object the
 * ROOT owns, and each browser binds it. The root outlives every route change, so the object
 * survives the round-trip.
 *
 * ── THE ONE MECHANISM, AND WHY THE STORE IS NOT IT ──────────────────────────────────────
 * Two mechanisms carry a "search term" in this app today, and they are NOT two spellings of one
 * meaning — they answer different questions, which is why only one of them is generalised here:
 *
 *  1. A VIEW FILTER over rows the store has already published. It narrows what is drawn and
 *     nothing else. That is this file.
 *  2. A QUERY PARAMETER the store's own data assembly consumes. `adminStore`'s `itemSearch` and
 *     `recipeSearch` are these: `setItemSearch` awaits `refresh()`, and the refresh threads the
 *     term into `buildItemCards(…, itemSearchTerm, …)` → `systemManager.getItems(systemId,
 *     search)` and into `buildRecipeList(…, recipeSearch, …)`. The term selects the COHORT that
 *     is fetched, hydrated and memoised, so the store must hold it; moving it here would move
 *     cohort selection out of the store, which is a behaviour change and not a lift.
 *
 * So: a view filter belongs on this object, a cohort selector belongs in the store, and the two
 * store-backed searches stay where they are. Neither is "world state" — `recipeSearch` and
 * `itemSearch` are plain in-memory `writable` instances minted per `createAdminStore` call and
 * are never written to a Foundry setting, so both mechanisms are per-session either way and the
 * choice between them is about ROLE, not persistence.
 *
 * `design-system/spec.md` makes the same call from the other side for row disclosure state: it
 * must NOT be lifted into the store the list renders from, because every persisted edit
 * refreshes that store. The same hazard applies to a filter — a store refresh must never be able
 * to reset the GM's filter bar.
 *
 * ── WHAT DOES NOT BELONG HERE ───────────────────────────────────────────────────────────
 * State that is SUPPOSED to reset. An armed destructive confirmation (`pendingRemovalId`,
 * `armedToken`) names one row in one sitting and must die with the mount. So do an editor's own
 * pickers: `GatheringTaskEditView`'s four search terms belong to a single editing session, and
 * `EnvironmentsBrowserView`'s vocabulary add-form inputs are a half-typed entry, not a filter.
 *
 * Every factory here returns a PLAIN object literal with no methods, no identity and no Foundry
 * reach, so a caller can wrap it in `$state(…)` and Svelte's deep proxy makes every nested write
 * reactive and propagating.
 */

/** The page size every browse surface uses unless it says otherwise. */
export const DEFAULT_BROWSER_PAGE_SIZE = 10;

/**
 * The axes every browse surface has, with per-surface axes spread over the top.
 *
 * `systemId` is the SYSTEM-SWITCH SENTINEL, and it lives here rather than in the component for
 * the reason issue 1036 recorded: a surface that resets its filters when the selected system
 * changes compares against a remembered id, and a component-local sentinel re-initialises to ''
 * on every mount — so returning from an editor reads as a system switch and wipes the very state
 * this object exists to preserve. Lifting the axes without lifting the sentinel is inert.
 *
 * @param {object} [axes] Surface-specific axes, overriding the shared defaults.
 * @returns {object} A fresh view-state object.
 */
function browseState(axes = {}) {
  return {
    searchTerm: '',
    pageIndex: 0,
    pageSize: DEFAULT_BROWSER_PAGE_SIZE,
    systemId: '',
    ...axes,
  };
}

/** Systems list: name/description search plus the enabled/disabled axis. */
export function createSystemsBrowserState() {
  return browseState({ statusFilter: 'all' });
}

/** Gathering > Environments: status, selection, risk and biome axes. */
export function createEnvironmentsBrowserState() {
  return browseState({
    statusFilter: 'all',
    selectionFilter: 'all',
    riskFilter: 'all',
    biomeFilter: 'all',
  });
}

/** Gathering > Tasks: status, biome and availability axes. */
export function createGatheringTasksBrowserState() {
  return browseState({ statusFilter: 'all', biomeFilter: 'all', availabilityFilter: 'all' });
}

/** Gathering > Encounters: status, biome and danger axes. */
export function createGatheringEventsBrowserState() {
  return browseState({ statusFilter: 'all', biomeFilter: 'all', dangerFilter: 'all' });
}

/**
 * The tool library's toolbar, at its own page size.
 *
 * `membershipFilter` defaults to `in` rather than `all` because this surface is a SYSTEM's rules
 * list: the rows it exists to show are the tools this system has adopted, and the world tools it
 * has not are the browse-and-adopt cohort behind the segment next to it (issue 1373).
 *
 * The sort axes sit here for the reason the file's header gives: they narrow and order rows the
 * store has already published, so they are view filters rather than cohort selectors. Left in
 * component scope they would be reset by the trip to the tool editor and back while the search
 * term beside them survived, which is the original defect wearing a partial fix.
 */
export function createToolsBrowserState() {
  return browseState({
    pageSize: 8,
    membershipFilter: 'in',
    sortKey: 'name',
    sortDirection: 'asc',
  });
}

/**
 * World > Travel > Realms.
 *
 * `navigatedSelectionId` is the tab's page-to-the-selection guard, lifted for the same reason
 * the system sentinel is: left component-local it re-initialises on the remount and pages away
 * from the page the GM was restored to, which looks exactly like the page not surviving at all.
 */
export function createTravelRealmsBrowserState() {
  return browseState({ pageSize: 6, navigatedSelectionId: '' });
}

/**
 * The expanded realm row's two environment pickers.
 *
 * Two independent searchable lists, so two independent slots — and a `realmId` sentinel, because
 * "which environments am I still missing" is a question about ONE realm: carrying a term from
 * realm A into realm B would filter B's lists by a name that means nothing there.
 */
export function createRealmEnvironmentsBrowserState() {
  return {
    realmId: '',
    availableSearchTerm: '',
    availablePageIndex: 0,
    includedSearchTerm: '',
    includedPageIndex: 0,
  };
}

/**
 * One vocabulary panel's search box.
 *
 * Tags, recipe categories and component categories each get their own slot: the three panels are
 * mutually-exclusive branches of one tabbed surface, so they never coexist, but "herb" names a
 * tag and nothing in the category vocabulary next door.
 */
export function createVocabularyBrowserState() {
  return { searchTerm: '' };
}

/**
 * The shared scoped-entity list frame (`EntityListInspectorFrame`).
 *
 * `filterValues` is a per-lane map keyed by filter descriptor id, so it is an object rather than
 * a fixed set of axes; the frame replaces it wholesale on every change, which the proxy carries.
 * The frame's BULK SELECTION is deliberately absent: a selection is an in-progress action over a
 * set rather than a filter, and its owner is the lane that supplies the `bulk` descriptor.
 *
 * `pageSize` RESTATES the frame's own `DEFAULT_PAGE_SIZE` and has to move with it (issue 1373,
 * maintainer feedback round 2). The frame falls back to its constant only when nothing binds a
 * view-state, so a stale size here would pin the old twenty-five-row window on every surface
 * that DOES bind one — which is most of them — and the frame's default would look like it had
 * simply not worked.
 */
export function createScopedListBrowserState() {
  return browseState({
    pageSize: 10,
    membership: 'all',
    filterValues: {},
    sortKey: 'name',
    sortDirection: 'asc',
  });
}

/** The Knowledge surface's character roster search. */
export function createKnowledgeRosterBrowserState() {
  return { searchTerm: '' };
}

/**
 * The grant-access inspector's two rosters.
 *
 * Characters and players are separate rosters with separate boxes, so neither term nor page is
 * shared. Both are kept ACROSS a recipe change, which is the behaviour the shipped component
 * already has — it stays mounted while the selected recipe changes — so lifting adds route
 * survival without altering what a GM sees today.
 */
export function createRecipeAccessBrowserState() {
  return {
    characterSearchTerm: '',
    characterPageIndex: 0,
    playerSearchTerm: '',
    playerPageIndex: 0,
  };
}

/**
 * Every lifted browser view-state the manager root owns, in one object.
 *
 * ONE root declaration rather than thirteen, because these are one homogeneous family with one
 * lifetime and one reason to exist. It is a state RECORD and not a service bag: no consumer ever
 * receives the record, only its own slot, so no surface can read or write another's.
 *
 * @returns {object} A fresh set of per-surface view-state objects.
 */
export function createManagerBrowserViewStates() {
  return {
    systems: createSystemsBrowserState(),
    environments: createEnvironmentsBrowserState(),
    gatheringTasks: createGatheringTasksBrowserState(),
    gatheringEvents: createGatheringEventsBrowserState(),
    tools: createToolsBrowserState(),
    travelRealms: createTravelRealmsBrowserState(),
    realmEnvironments: createRealmEnvironmentsBrowserState(),
    recipeCategoryVocabulary: createVocabularyBrowserState(),
    componentCategoryVocabulary: createVocabularyBrowserState(),
    componentTagVocabulary: createVocabularyBrowserState(),
    worldEssenceCatalogue: createScopedListBrowserState(),
    // The world COMPONENT catalogue's list state (issue 1371), on the same factory as its essence
    // twin above: one composition, one shape, configured per scope. It is MINTED HERE rather than
    // seeded at the root because the root's binding contract is a biconditional — every slot the
    // registry mints must be bound, and nothing else may be — so a root-side slot is a binding
    // the registry cannot account for.
    worldComponentCatalogue: createScopedListBrowserState(),
    knowledgeRoster: createKnowledgeRosterBrowserState(),
    recipeAccess: createRecipeAccessBrowserState(),
  };
}
