/**
 * Pure list model for the GM recipe library (issue 643): filter → sort → paginate → group, plus the
 * per-row derivations the rich row renders.
 */

import { categoryTotalOf, countByCategory } from './browserGroupCounts.js';
import { paginateRows } from './browserPagination.js';

/** Sort keys offered by the library toolbar, in menu order. */
export const RECIPE_SORT_KEYS = Object.freeze([
  'name',
  'attention',
  'dc',
  'ingredients',
  'results',
]);

/** Status filter values. */
export const RECIPE_STATUS_FILTERS = Object.freeze(['all', 'on', 'off']);

/** Lock filter values. */
export const RECIPE_LOCK_FILTERS = Object.freeze(['all', 'unlocked', 'locked']);

/** Default page size. */
export const RECIPE_DEFAULT_PAGE_SIZE = 25;

/**
 * Build a fresh recipe-browser view-state object: the filter / sort / group / paginate controls
 * that live above the pure list model (issue 643).
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
    systemId: '',
    bulkSelectedRecipeIds: new Set(),
  };
}

/** The reserved category key a recipe with no authored category falls back to. */
const GENERAL_CATEGORY = 'general';

function numeric(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * The category bucket a row belongs to; an unauthored category falls back to the reserved `general`
 * catch-all.
 */
export function recipeCategoryOf(recipe) {
  const raw = typeof recipe?.category === 'string' ? recipe.category.trim() : '';
  return raw || GENERAL_CATEGORY;
}

/** Filter the projected rows by status, lock state and category. */
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
    if (category !== 'all' && recipeCategoryOf(recipe) !== category) return false;
    return true;
  });
}

/** The attention rank a row sorts on. */
export function attentionRank(recipe) {
  if (recipe?.enableBlocked !== true) return 0;
  return recipe?.enabled === false ? 2 : 1;
}

// A recipe with no resolvable DC sorts below every recipe that has one, in both directions, rather
// than colliding with DC 0.
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

/** Order two rows by their category. */
function compareRecipeCategories(left, right) {
  return recipeCategoryOf(left).localeCompare(recipeCategoryOf(right));
}

/**
 * The per-key row comparator, factored out so both the flat sort and the category-major sort
 * compose the SAME within-row ordering (a bug injected here flips both).
 */
function rowComparator(key, direction) {
  const byName = (a, b) => String(a?.name || '').localeCompare(String(b?.name || ''));
  return (a, b) => {
    if (key === 'name') return direction * byName(a, b);
    const delta = sortValue(a, key) - sortValue(b, key);
    if (delta !== 0) return direction * delta;
    return byName(a, b);
  };
}

/** Sort the rows by key + direction with an EXPLICIT comparator. */
export function sortRecipes(recipes, options = {}) {
  const key = RECIPE_SORT_KEYS.includes(options.key) ? options.key : 'name';
  const direction = options.direction === 'desc' ? -1 : 1;
  const compareRows = rowComparator(key, direction);
  const comparator = options.categoryMajor
    ? (a, b) => compareRecipeCategories(a, b) || compareRows(a, b)
    : compareRows;

  return [...(Array.isArray(recipes) ? recipes : [])].sort(comparator);
}

/** Group the rows into category buckets, preserving the incoming row order inside each bucket. */
export function groupRecipesByCategory(recipes, categoryTotals) {
  const buckets = new Map();

  for (const recipe of Array.isArray(recipes) ? recipes : []) {
    const category = recipeCategoryOf(recipe);
    if (!buckets.has(category)) buckets.set(category, []);
    buckets.get(category).push(recipe);
  }

  return [...buckets]
    .map(([category, rows]) => ({
      category,
      recipes: rows,
      total: categoryTotalOf(categoryTotals, category, rows.length),
    }))
    .sort((a, b) => compareRecipeCategories(a, b));
}

/**
 * Slice one page out of the rows, clamping the page index into range so a filter change that
 * shrinks the list can never strand the pager on an empty page.
 */
export function paginateRecipes(recipes, options = {}) {
  const { rows, ...window } = paginateRows(recipes, options, RECIPE_DEFAULT_PAGE_SIZE);
  return { recipes: rows, ...window };
}

/** The active-filter chips, as data. */
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

/** The row's I/O readout (issue 643 §9 — resolved there, do not re-derive). */
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

/** The row's status pills, in render order. */
export function deriveRecipeStatuses(recipe) {
  const pills = [];
  if (recipe?.enabled === false) {
    pills.push({ id: 'disabled', tone: 'subtle', icon: '' });
  }
  if (recipe?.locked === true) {
    pills.push({ id: 'locked', tone: 'accent', icon: 'fas fa-lock' });
  }
  if (recipe?.enableBlocked === true) {
    pills.push(
      recipe?.enabled === false
        ? { id: 'blocked', tone: 'danger', icon: 'fas fa-circle-exclamation' }
        : { id: 'incomplete', tone: 'warning', icon: 'fas fa-pen-ruler' }
    );
  }
  return pills;
}

// ── The library inspector's Requires / Produces lists (issue 643 §3.3) ──

/**
 * The recipe's execution scopes: its explicit `steps[]` when it has any, otherwise the recipe
 * itself as a single implicit scope.
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
 * The Requires list, one entry per ingredient REQUIREMENT (an `ingredientGroup`), in authoring
 * order.
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
          ...describeRequirementOption(option, components, essences),
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

function describeRequirementOption(option, components, essences) {
  const match = option?.match || {};
  const quantity = Number(option?.quantity) > 0 ? Number(option.quantity) : 1;

  if (match.type === 'essence') {
    const essence = findById(essences, match.essenceId);
    return {
      kind: 'essence',
      essenceId: match.essenceId || '',
      name: essence?.name || '',
      amount: Number(match.amount) || 0,
      icon: essence?.icon || 'fas fa-flask-vial',
      img: '',
      quantity,
    };
  }
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

/** What a reader prints for an amount: the expression when rolled, the number otherwise (1645). */
function amountLabelOf(result) {
  const formula = typeof result?.quantityFormula === 'string' ? result.quantityFormula.trim() : '';
  if (formula.length > 0) return formula;
  return String(Number(result?.quantity) > 0 ? Number(result.quantity) : 1);
}

/**
 * One Produces row per result item, in authoring order, tagged with the result GROUP it belongs to.
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
          amountLabel: amountLabelOf(result),
          // The component's authored difficulty (its progressive "cost"/DC).
          difficulty: Number.isFinite(Number(component?.difficulty))
            ? Number(component.difficulty)
            : null,
          groupId,
          groupName: group?.name || '',
          // The check-outcome tiers this result group is routed to (routed-by-check).
          checkOutcomeIds: Array.isArray(group?.checkOutcomeIds) ? group.checkOutcomeIds : [],
          // The reserved alchemy-Simple failure group: what a FAILED craft makes.
          failure: group?.role === 'failure',
          scopeName: scope.multi ? scope.name : '',
        });
      }
    }
  }

  return rows;
}

/** Per-step Requires/Produces for a MULTI-step recipe's inspector (issue 643). */
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

/** Group produce rows by their result group, preserving first-seen order (issue 643). */
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
 * The routed-by-ingredients pairing model for the library inspector (issue 643): the recipe's
 * ingredient sets and result groups, plus the set→group routing each set carries
 * (`IngredientSet.resultGroupId`).
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

/** Run the whole pipeline in one call: filter → sort → paginate (→ group the page). */
export function buildRecipeBrowserModel(recipes, options = {}) {
  const filtered = sortRecipes(filterRecipes(recipes, options), {
    key: options.sortKey,
    direction: options.sortDirection,
    // Grouping ON ⇒ order category-major BEFORE pagination, so each category is a contiguous run
    // across page boundaries rather than an interleaved slice per page.
    categoryMajor: !!options.groupByCategory,
  });
  // COUNTED BEFORE PAGINATION, unconditionally (issue 1081).
  const categoryTotals = countByCategory(filtered, recipeCategoryOf);
  const paged = paginateRecipes(filtered, options);
  const groups = options.groupByCategory
    ? groupRecipesByCategory(paged.recipes, categoryTotals)
    : [{ category: '', recipes: paged.recipes, total: paged.recipes.length }];

  return {
    filtered,
    page: paged.recipes,
    groups,
    // The FILTERED-COHORT counts, exported so a caller rendering its own header reads the same map
    // the group headers do instead of recounting whatever array it happens to hold.
    categoryTotals,
    pageIndex: paged.pageIndex,
    pageCount: paged.pageCount,
    totalCount: paged.totalCount,
    // The page WINDOW, so the count can read "1–5 of 12" rather than "5 of 12" — which never told
    // the GM which page they were on.
    rangeStart: paged.rangeStart,
    rangeEnd: paged.rangeEnd,
    chips: describeActiveFilters(options),
  };
}
