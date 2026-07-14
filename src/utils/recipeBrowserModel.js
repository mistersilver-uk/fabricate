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
 * @param {object[]} recipes
 * @param {{pageIndex?: number, pageSize?: number}} [options]
 * @returns {{recipes: object[], pageIndex: number, pageCount: number, totalCount: number}}
 */
export function paginateRecipes(recipes, options = {}) {
  const rows = Array.isArray(recipes) ? recipes : [];
  const pageSize = Math.max(1, numeric(options.pageSize, RECIPE_DEFAULT_PAGE_SIZE));
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const pageIndex = Math.min(Math.max(0, numeric(options.pageIndex)), pageCount - 1);
  const start = pageIndex * pageSize;

  return {
    recipes: rows.slice(start, start + pageSize),
    pageIndex,
    pageCount,
    totalCount: rows.length,
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
    chips: describeActiveFilters(options),
  };
}
