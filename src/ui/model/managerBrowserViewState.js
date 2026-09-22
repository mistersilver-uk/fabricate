/**
 * The Crafting System Manager's lifted browser view-state (issue 1438). Every route change unmounts
 * the browse surface, so a filter, search term, sort or page left in component-local `$state` is
 * silently reset; this state lives on an object the root owns and each browser binds. A VIEW FILTER
 * belongs here, a COHORT SELECTOR (`adminStore`'s `itemSearch`/`recipeSearch`) stays in the store,
 * and state that is SUPPOSED to reset — armed confirmations, editor pickers — never lands here.
 * Every factory returns a plain literal so a caller can wrap it in `$state(…)`.
 */

/** The page size every browse surface uses unless it says otherwise. */
export const DEFAULT_BROWSER_PAGE_SIZE = 10;

/** The axes every browse surface has, with per-surface axes spread over the top. */
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

/** The tool library's toolbar, at its own page size. */
export function createToolsBrowserState() {
  return browseState({
    pageSize: 8,
    membershipFilter: 'in',
    sortKey: 'name',
    sortDirection: 'asc',
  });
}

/** World > Travel > Realms. */
export function createTravelRealmsBrowserState() {
  return browseState({ pageSize: 6, navigatedSelectionId: '' });
}

/** The expanded realm row's two environment pickers. */
export function createRealmEnvironmentsBrowserState() {
  return {
    realmId: '',
    availableSearchTerm: '',
    availablePageIndex: 0,
    includedSearchTerm: '',
    includedPageIndex: 0,
  };
}

/** One vocabulary panel's search box and its sort pair (issue 1915). */
export function createVocabularyBrowserState() {
  return { searchTerm: '', sortKey: 'name', sortDirection: 'asc' };
}

/** The shared scoped-entity list frame (`EntityListInspectorFrame`). */
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

/** The grant-access inspector's two rosters. */
export function createRecipeAccessBrowserState() {
  return {
    characterSearchTerm: '',
    characterPageIndex: 0,
    playerSearchTerm: '',
    playerPageIndex: 0,
  };
}

/** Every lifted browser view-state the manager root owns, in one object. */
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
    // twin above: one composition, one shape, configured per scope.
    worldComponentCatalogue: createScopedListBrowserState(),
    knowledgeRoster: createKnowledgeRosterBrowserState(),
    recipeAccess: createRecipeAccessBrowserState(),
  };
}
