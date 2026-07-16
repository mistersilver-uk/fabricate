/**
 * Pure list model for the GM recipe library (issue 643): filter → group → sort →
 * paginate, plus the per-row derivations the rich row renders.
 *
 * It lives under `src/utils/` rather than `src/ui/` deliberately: `src/ui/**` is
 * not covered by the ESLint/Prettier globs today, so a module there can be
 * lint-green and Sonar-red. Everything here is a pure function over the
 * already-projected recipe rows the admin store publishes — it never touches
 * Foundry globals, the store, or localization. Callers localize.
 *
 * Search is deliberately NOT a filter here: the admin store's `_buildRecipeList`
 * already applies `recipeSearchTerm` before projecting, so re-applying it would
 * double-filter. The search term still contributes an active-filter chip.
 */

/** @typedef {'name' | 'attention' | 'dc' | 'ingredients' | 'results'} RecipeSortKey */
/** @typedef {'asc' | 'desc'} SortDirection */

/** Sort keys offered by the library toolbar, in menu order. */
export const RECIPE_SORT_KEYS = Object.freeze([
  'name',
  'attention',
  'dc',
  'ingredients',
  'results',
]);

/** Status filter values. `all` is the default — see the smoke-harness note below. */
export const RECIPE_STATUS_FILTERS = Object.freeze(['all', 'on', 'off']);

/** Lock filter values. `all` is the default. */
export const RECIPE_LOCK_FILTERS = Object.freeze(['all', 'unlocked', 'locked']);

/**
 * Default page size. It must EXCEED the smoke fixture's recipe count: the harness
 * waits for a visible row and throws "Manager rendered no table rows" on zero, so
 * a default that pages the fixture recipes off page 1 breaks the smoke gate.
 */
export const RECIPE_DEFAULT_PAGE_SIZE = 25;

/**
 * Build a fresh recipe-browser view-state object: the filter / sort / group /
 * paginate controls that live above the pure list model (issue 643).
 *
 * The GM recipe library lifts this object up to the manager root so it SURVIVES the
 * edit round-trip — opening the editor unmounts the browser, and remounting it with
 * these reset to defaults threw away the page, filters, sort and grouping the GM left.
 * The root holds one `$state(createRecipeBrowserState())` and threads it back in, so
 * Save / Back return to the exact view. `collapsedCategories` is a `Set` (collapse is
 * opt-IN: a category absent from the set is expanded). A fresh call is used on FIRST
 * arrival (defaults) and by isolated mounted tests that don't lift the state — so this
 * must always return a NEW object with a NEW Set, never a shared singleton.
 *
 * @returns {{
 *   statusFilter: string, lockFilter: string, categoryFilter: string,
 *   groupByCategory: boolean, sortKey: RecipeSortKey, sortDirection: SortDirection,
 *   pageIndex: number, pageSize: number, collapsedCategories: Set<string>
 * }}
 */
export function createRecipeBrowserState() {
  return {
    statusFilter: 'all',
    lockFilter: 'all',
    categoryFilter: 'all',
    groupByCategory: true,
    sortKey: 'name',
    sortDirection: 'asc',
    pageIndex: 0,
    pageSize: RECIPE_DEFAULT_PAGE_SIZE,
    collapsedCategories: new Set(),
  };
}

/** The reserved category key a recipe with no authored category falls back to. */
const GENERAL_CATEGORY = 'general';

function numeric(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function categoryOf(recipe) {
  const raw = typeof recipe?.category === 'string' ? recipe.category.trim() : '';
  return raw || GENERAL_CATEGORY;
}

/**
 * Filter the projected rows by status, lock state and category.
 *
 * @param {object[]} recipes
 * @param {{status?: string, lock?: string, category?: string}} [filters]
 * @returns {object[]}
 */
export function filterRecipes(recipes, filters = {}) {
  const status = filters.status || 'all';
  const lock = filters.lock || 'all';
  const category = filters.category || 'all';

  return (Array.isArray(recipes) ? recipes : []).filter((recipe) => {
    const enabled = recipe?.enabled !== false;
    const locked = recipe?.locked === true;

    if (status === 'on' && !enabled) return false;
    if (status === 'off' && enabled) return false;
    if (lock === 'locked' && !locked) return false;
    if (lock === 'unlocked' && locked) return false;
    if (category !== 'all' && categoryOf(recipe) !== category) return false;
    return true;
  });
}

/**
 * The attention rank a row sorts on: 2 = enabling is blocked, 1 = incomplete but
 * enabled, 0 = clear. Descending by default, so the rows needing work float up.
 *
 * @param {object} recipe
 * @returns {0 | 1 | 2}
 */
export function attentionRank(recipe) {
  if (recipe?.incomplete !== true) return 0;
  return recipe?.enabled === false ? 2 : 1;
}

// A recipe with no resolvable DC sorts below every recipe that has one, in both
// directions, rather than colliding with DC 0.
const SORT_VALUES = Object.freeze({
  attention: (recipe) => attentionRank(recipe),
  dc: (recipe) => numeric(recipe?.checkSummary?.dc, -Infinity),
  ingredients: (recipe) => numeric(recipe?.ingredientCount),
  results: (recipe) => numeric(recipe?.resultItemCount),
});

function sortValue(recipe, key) {
  const read = SORT_VALUES[key];
  return read ? read(recipe) : 0;
}

/**
 * Sort the rows by key + direction with an EXPLICIT comparator. `Array#sort()`
 * with no comparator is a SonarCloud finding (and lexicographic on numbers), so
 * every path through here passes one. Name is the stable tiebreak.
 *
 * @param {object[]} recipes
 * @param {{key?: RecipeSortKey, direction?: SortDirection}} [options]
 * @returns {object[]} a new array; the input is not mutated.
 */
export function sortRecipes(recipes, options = {}) {
  const key = RECIPE_SORT_KEYS.includes(options.key) ? options.key : 'name';
  const direction = options.direction === 'desc' ? -1 : 1;
  const byName = (a, b) => String(a?.name || '').localeCompare(String(b?.name || ''));

  return [...(Array.isArray(recipes) ? recipes : [])].sort((a, b) => {
    if (key === 'name') return direction * byName(a, b);
    const delta = sortValue(a, key) - sortValue(b, key);
    if (delta !== 0) return direction * delta;
    return byName(a, b);
  });
}

/**
 * Group the rows into category buckets, preserving the incoming row order inside
 * each bucket. Buckets are name-ordered so the group list is stable across
 * re-sorts of the rows themselves.
 *
 * @param {object[]} recipes
 * @returns {{category: string, recipes: object[]}[]}
 */
export function groupRecipesByCategory(recipes) {
  const buckets = new Map();

  for (const recipe of Array.isArray(recipes) ? recipes : []) {
    const category = categoryOf(recipe);
    if (!buckets.has(category)) buckets.set(category, []);
    buckets.get(category).push(recipe);
  }

  return [...buckets]
    .map(([category, rows]) => ({ category, recipes: rows }))
    .sort((a, b) => a.category.localeCompare(b.category));
}

/**
 * Slice one page out of the rows, clamping the page index into range so a filter
 * change that shrinks the list can never strand the pager on an empty page.
 *
 * The window is reported as a 1-based, inclusive RANGE (`rangeStart`..`rangeEnd`),
 * because the library's count reads "1–5 of 12": a bare "5 of 12" never tells the GM
 * WHICH page they are looking at. An empty result reports `0..0`.
 *
 * @param {object[]} recipes
 * @param {{pageIndex?: number, pageSize?: number}} [options]
 * @returns {{recipes: object[], pageIndex: number, pageCount: number, totalCount: number, rangeStart: number, rangeEnd: number}}
 */
export function paginateRecipes(recipes, options = {}) {
  const rows = Array.isArray(recipes) ? recipes : [];
  const pageSize = Math.max(1, numeric(options.pageSize, RECIPE_DEFAULT_PAGE_SIZE));
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const pageIndex = Math.min(Math.max(0, numeric(options.pageIndex)), pageCount - 1);
  const start = pageIndex * pageSize;
  const page = rows.slice(start, start + pageSize);

  return {
    recipes: page,
    pageIndex,
    pageCount,
    totalCount: rows.length,
    rangeStart: page.length > 0 ? start + 1 : 0,
    rangeEnd: page.length > 0 ? start + page.length : 0,
  };
}

/**
 * The active-filter chips, as data. Each chip names the filter it clears; the
 * caller localizes the label and supplies the clear handler.
 *
 * @param {{status?: string, lock?: string, category?: string, search?: string}} [filters]
 * @returns {{id: 'status' | 'lock' | 'category' | 'search', value: string}[]}
 */
export function describeActiveFilters(filters = {}) {
  const chips = [];
  if (filters.status && filters.status !== 'all')
    chips.push({ id: 'status', value: filters.status });
  if (filters.lock && filters.lock !== 'all') chips.push({ id: 'lock', value: filters.lock });
  if (filters.category && filters.category !== 'all') {
    chips.push({ id: 'category', value: filters.category });
  }
  const search = typeof filters.search === 'string' ? filters.search.trim() : '';
  if (search) chips.push({ id: 'search', value: search });
  return chips;
}

/**
 * The row's I/O readout (issue 643 §9 — resolved there, do not re-derive).
 *
 * `N in` is always shown. `N out` is shown ONLY in `simple` and `progressive`;
 * once results are tier- or set-keyed there is no single "outputs" number, so
 * `routedByIngredients`, `routedByCheck` and `alchemy` surface the RESULT-GROUP
 * count instead, labelled as groups.
 *
 * @param {object} recipe a projected recipe row.
 * @param {string} resolutionMode the SYSTEM's resolution mode.
 * @returns {{inCount: number, outKind: 'items' | 'groups', outCount: number, empty: boolean}}
 */
export function deriveRecipeIo(recipe, resolutionMode) {
  const inCount = numeric(recipe?.ingredientCount);
  const showsItemCount = resolutionMode === 'simple' || resolutionMode === 'progressive';
  const outCount = showsItemCount
    ? numeric(recipe?.resultItemCount)
    : numeric(recipe?.resultGroupCount);

  return {
    inCount,
    outKind: showsItemCount ? 'items' : 'groups',
    outCount,
    // A recipe that produces nothing is the readout's one danger state.
    empty: outCount === 0,
  };
}

/**
 * The row's status pills, in render order. At most one of the two authoring
 * states applies:
 *
 *  - `blocked` — incomplete AND currently off: enabling would be REFUSED by
 *    `toggleRecipeEnabled` (RecipeActivationError), so the row says so up front.
 *  - `incomplete` — incomplete but already on (a legacy row): work still to do,
 *    but nothing is being refused.
 *
 * @param {object} recipe a projected recipe row.
 * @returns {{id: 'disabled' | 'locked' | 'blocked' | 'incomplete', tone: string, icon: string}[]}
 */
export function deriveRecipeStatuses(recipe) {
  const pills = [];
  if (recipe?.enabled === false) {
    pills.push({ id: 'disabled', tone: 'subtle', icon: '' });
  }
  if (recipe?.locked === true) {
    pills.push({ id: 'locked', tone: 'accent', icon: 'fas fa-lock' });
  }
  if (recipe?.incomplete === true) {
    pills.push(
      recipe?.enabled === false
        ? { id: 'blocked', tone: 'danger', icon: 'fas fa-circle-exclamation' }
        : { id: 'incomplete', tone: 'warning', icon: 'fas fa-pen-ruler' }
    );
  }
  return pills;
}

// ---------------------------------------------------------------------------
// The library inspector's Requires / Produces lists (issue 643 §3.3).
//
// The inspector must be able to tell a GM what a recipe consumes and what it makes.
// Both answers live in the SAME nested shape — execution scope (the recipe itself, or
// each of its steps) → ingredient sets / result groups → options / results — so the
// walk is written once here, as pure data over the projected row, and both lists are
// built from it. Names and images are resolved against the caller's component and
// essence rosters; nothing here localizes.
// ---------------------------------------------------------------------------

/**
 * The recipe's execution scopes: its explicit `steps[]` when it has any, otherwise the
 * recipe itself as a single implicit scope. Mirrors `Recipe.getExecutionSteps()` for
 * the projected (plain-object) row, which carries no methods.
 *
 * @param {object} recipe a projected recipe row.
 * @returns {{id: string, name: string, multi: boolean, ingredientSets: object[], resultGroups: object[]}[]}
 * @private
 */
function executionScopes(recipe) {
  const steps = Array.isArray(recipe?.steps) ? recipe.steps : [];
  if (steps.length > 0) {
    return steps.map((step, index) => ({
      id: step?.id || `step-${index + 1}`,
      name: step?.name || `Step ${index + 1}`,
      multi: steps.length > 1,
      ingredientSets: Array.isArray(step?.ingredientSets) ? step.ingredientSets : [],
      resultGroups: Array.isArray(step?.resultGroups) ? step.resultGroups : [],
    }));
  }
  return [
    {
      id: 'implicit-step',
      name: '',
      multi: false,
      ingredientSets: Array.isArray(recipe?.ingredientSets) ? recipe.ingredientSets : [],
      resultGroups: Array.isArray(recipe?.resultGroups) ? recipe.resultGroups : [],
    },
  ];
}

function findById(roster, id) {
  return (Array.isArray(roster) ? roster : []).find((entry) => entry?.id === id) || null;
}

/**
 * The Requires list, one entry per ingredient REQUIREMENT (an `ingredientGroup`), in
 * authoring order.
 *
 * A requirement's options are the three real match types — `component`, `tags` and
 * `currency` (`src/models/match/matchTypes.js`) — each reported as itself rather than
 * flattened into a component row it is not. Shape depends on how many options a
 * requirement has:
 *  - ONE option → a flat requirement entry (`type: 'requirement'`) carrying that
 *    option's fields directly.
 *  - TWO OR MORE → an `type: 'anyOf'` group whose `members[]` are ALL equal peers
 *    (any one satisfies it). No member is promoted above the others; the caller draws
 *    the whole group inside an "ANY ONE OF" container.
 *
 * Per-SET essences are AND requirements on the whole set, so they follow that set's
 * requirements as their own `type: 'essence'` entries.
 *
 * @param {object} recipe a projected recipe row.
 * @param {{componentOptions?: object[], essenceOptions?: object[]}} [rosters]
 * @returns {object[]} requirements: a flat entry `{ id, type: 'requirement'|'essence', kind, name, img, quantity, … }`
 *   or a group `{ id, type: 'anyOf', members: [{ id, kind, name, img, quantity, … }], setId, setName, scopeName }`
 */
export function buildRecipeRequirementRows(recipe, rosters = {}) {
  const components = rosters.componentOptions;
  const essences = rosters.essenceOptions;
  const requirements = [];

  for (const scope of executionScopes(recipe)) {
    for (const [setIndex, set] of (scope.ingredientSets || []).entries()) {
      const setId = set?.id || `${scope.id}-set-${setIndex + 1}`;
      const setName = set?.name || '';
      const base = { setId, setName, scopeName: scope.multi ? scope.name : '' };
      const groups = Array.isArray(set?.ingredientGroups) ? set.ingredientGroups : [];

      for (const [groupIndex, group] of groups.entries()) {
        const options = Array.isArray(group?.options) ? group.options : [];
        if (options.length === 0) continue;
        const groupId = `${setId}:${group?.id || groupIndex}`;
        const members = options.map((option, optionIndex) => ({
          ...describeRequirementOption(option, components),
          id: `${groupId}:${option?.id || optionIndex}`,
        }));

        if (members.length === 1) {
          requirements.push({ ...base, ...members[0], id: groupId, type: 'requirement' });
        } else {
          requirements.push({ ...base, id: groupId, type: 'anyOf', members });
        }
      }

      for (const [essenceId, amount] of Object.entries(set?.essences || {})) {
        requirements.push({
          ...base,
          id: `${setId}:essence:${essenceId}`,
          type: 'essence',
          kind: 'essence',
          name: findById(essences, essenceId)?.name || '',
          icon: findById(essences, essenceId)?.icon || 'fas fa-flask-vial',
          img: '',
          quantity: Number(amount) || 0,
        });
      }
    }
  }

  return requirements;
}

function describeRequirementOption(option, components) {
  const match = option?.match || {};
  const quantity = Number(option?.quantity) > 0 ? Number(option.quantity) : 1;

  if (match.type === 'tags') {
    return {
      kind: 'tags',
      name: '',
      tags: Array.isArray(match.tags) ? [...match.tags] : [],
      tagMatch: match.tagMatch === 'all' ? 'all' : 'any',
      icon: 'fas fa-tags',
      img: '',
      quantity,
    };
  }
  if (match.type === 'currency') {
    return {
      kind: 'currency',
      name: '',
      unit: match.unit || '',
      amount: Number(match.amount) || 0,
      icon: 'fa-solid fa-coins',
      img: '',
      quantity,
    };
  }

  const component = findById(components, match.componentId);
  return {
    kind: 'component',
    componentId: match.componentId || '',
    name: component?.name || '',
    img: component?.img || '',
    icon: 'fas fa-cube',
    quantity,
  };
}

/**
 * One Produces row per result item, in authoring order, tagged with the result GROUP
 * it belongs to. A recipe produces ONE group's items (which group is chosen by outcome
 * routing at craft time), so the group name is carried on the row rather than the rows
 * being summed into a single output count — there is no such number in a routed mode.
 *
 * An EMPTY list is the danger state the caller renders as "a successful craft makes
 * nothing"; it is not an error here.
 *
 * @param {object} recipe a projected recipe row.
 * @param {{componentOptions?: object[]}} [rosters]
 * @returns {object[]} rows: `{ id, componentId, name, img, quantity, groupId, groupName, failure, scopeName }`
 */
export function buildRecipeProduceRows(recipe, rosters = {}) {
  const components = rosters.componentOptions;
  const rows = [];

  for (const scope of executionScopes(recipe)) {
    for (const [groupIndex, group] of (scope.resultGroups || []).entries()) {
      const groupId = group?.id || `${scope.id}-group-${groupIndex + 1}`;
      const results = Array.isArray(group?.results) ? group.results : [];

      for (const [resultIndex, result] of results.entries()) {
        const component = findById(components, result?.componentId);
        rows.push({
          id: `${groupId}:${result?.id || resultIndex}`,
          componentId: result?.componentId || '',
          name: component?.name || '',
          img: component?.img || '',
          quantity: Number(result?.quantity) > 0 ? Number(result.quantity) : 1,
          // The component's authored difficulty (its progressive "cost"/DC). Progressive
          // awards results in order, spending the check budget by each component's
          // difficulty, so the inspector shows this instead of a quantity in that mode.
          difficulty: Number.isFinite(Number(component?.difficulty))
            ? Number(component.difficulty)
            : null,
          groupId,
          groupName: group?.name || '',
          // The check-outcome tiers this result group is routed to (routed-by-check). The
          // inspector resolves these ids to tier NAMES for its grouped headings.
          checkOutcomeIds: Array.isArray(group?.checkOutcomeIds) ? group.checkOutcomeIds : [],
          // The reserved alchemy-Simple failure group: what a FAILED craft makes. It is
          // not a success output and must never be shown as one.
          failure: group?.role === 'failure',
          scopeName: scope.multi ? scope.name : '',
        });
      }
    }
  }

  return rows;
}

/**
 * Per-step Requires/Produces for a MULTI-step recipe's inspector (issue 643). A
 * multi-step recipe runs its steps in order, each with its own ingredient sets and result
 * groups, so the inspector paginates one step at a time rather than flattening every
 * step's requirements and results into two long lists. Each entry carries that step's
 * requirement rows and produce rows, built the same way the flat lists are.
 *
 * Returns `[]` for a single- (or zero-) step recipe: those use the flat Requires/Produces
 * lists, so there is nothing to paginate.
 *
 * @param {object} recipe a projected recipe row.
 * @param {{componentOptions?: object[], essenceOptions?: object[]}} [rosters]
 * @returns {{id: string, name: string, requirementRows: object[], produceRows: object[]}[]}
 */
export function buildRecipeStepModel(recipe, rosters = {}) {
  const steps = Array.isArray(recipe?.steps) ? recipe.steps : [];
  if (steps.length <= 1) return [];
  return steps.map((step, index) => {
    const scoped = {
      ingredientSets: Array.isArray(step?.ingredientSets) ? step.ingredientSets : [],
      resultGroups: Array.isArray(step?.resultGroups) ? step.resultGroups : [],
    };
    return {
      id: step?.id || `step-${index + 1}`,
      name: step?.name || '',
      requirementRows: buildRecipeRequirementRows(scoped, rosters),
      produceRows: buildRecipeProduceRows(scoped, rosters),
    };
  });
}

/**
 * Group produce rows by their result group, preserving first-seen order (issue 643). A
 * routed-by-check recipe routes each result group to a check-outcome tier, so its
 * inspector Produces list is grouped under each tier's group rather than dumped into one
 * flat list. Each bucket carries the group's name and its `failure` role for toning.
 *
 * @param {object[]} rows produce rows from {@link buildRecipeProduceRows}.
 * @returns {{groupId: string, groupName: string, failure: boolean, rows: object[]}[]}
 */
export function groupProduceRowsByResultGroup(rows) {
  const order = [];
  const byGroup = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!byGroup.has(row.groupId)) {
      byGroup.set(row.groupId, {
        groupId: row.groupId,
        groupName: row.groupName || '',
        checkOutcomeIds: Array.isArray(row.checkOutcomeIds) ? row.checkOutcomeIds : [],
        failure: row.failure === true,
        rows: [],
      });
      order.push(row.groupId);
    }
    byGroup.get(row.groupId).rows.push(row);
  }
  return order.map((id) => byGroup.get(id));
}

/**
 * The routed-by-ingredients pairing model for the library inspector (issue 643): the
 * recipe's ingredient sets and result groups, plus the set→group routing each set
 * carries (`IngredientSet.resultGroupId`). In this mode the chosen ingredient set
 * determines the produced result group, so the inspector pairs a set dropdown with a
 * result-set dropdown and keeps them in sync via this map.
 *
 * Ids match the ones `buildRecipeRequirementRows` (`setId`) and `buildRecipeProduceRows`
 * (`groupId`) stamp on their rows, so the inspector can filter those rows by the
 * selected set/group. Recipe-level only — a stepped recipe (uncommon for this mode)
 * yields empty lists and the inspector falls back to its flat all-rows view.
 *
 * @param {object} recipe a projected recipe row.
 * @returns {{ sets: {id: string, name: string, groupId: string|null}[],
 *   groups: {id: string, name: string}[] }}
 */
export function buildRecipeRoutingModel(recipe) {
  const sets = (Array.isArray(recipe?.ingredientSets) ? recipe.ingredientSets : []).map(
    (set, index) => ({
      id: set?.id || `set-${index + 1}`,
      name: set?.name || '',
      groupId: set?.resultGroupId || null,
    })
  );
  const groups = (Array.isArray(recipe?.resultGroups) ? recipe.resultGroups : []).map(
    (group, index) => ({
      id: group?.id || `group-${index + 1}`,
      name: group?.name || '',
    })
  );
  return { sets, groups };
}

/**
 * Run the whole pipeline in one call: filter → sort → paginate (→ group the page).
 * Grouping is applied to the PAGE, not the full list, so the pager stays the unit
 * of truth for how many rows are on screen.
 *
 * @param {object[]} recipes
 * @param {{
 *   status?: string, lock?: string, category?: string, search?: string,
 *   sortKey?: RecipeSortKey, sortDirection?: SortDirection,
 *   pageIndex?: number, pageSize?: number, groupByCategory?: boolean
 * }} [options]
 * @returns {{
 *   filtered: object[], page: object[], groups: {category: string, recipes: object[]}[],
 *   pageIndex: number, pageCount: number, totalCount: number,
 *   rangeStart: number, rangeEnd: number,
 *   chips: {id: string, value: string}[]
 * }}
 */
export function buildRecipeBrowserModel(recipes, options = {}) {
  const filtered = sortRecipes(filterRecipes(recipes, options), {
    key: options.sortKey,
    direction: options.sortDirection,
  });
  const paged = paginateRecipes(filtered, options);
  const groups = options.groupByCategory
    ? groupRecipesByCategory(paged.recipes)
    : [{ category: '', recipes: paged.recipes }];

  return {
    filtered,
    page: paged.recipes,
    groups,
    pageIndex: paged.pageIndex,
    pageCount: paged.pageCount,
    totalCount: paged.totalCount,
    // The page WINDOW, so the count can read "1–5 of 12" rather than "5 of 12" — which
    // never told the GM which page they were on.
    rangeStart: paged.rangeStart,
    rangeEnd: paged.rangeEnd,
    chips: describeActiveFilters(options),
  };
}
