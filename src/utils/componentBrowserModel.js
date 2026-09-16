/** Pure list model for the GM component library (issue 676): filter → sort → paginate → group. */

import { categoryTotalOf, countByCategory } from './browserGroupCounts.js';
import { paginateRows } from './browserPagination.js';
import { GENERAL_COMPONENT_CATEGORY, normalizeComponentCategory } from './componentCategories.js';

/** Sort keys offered by the library toolbar, in menu order. */
export const COMPONENT_SORT_KEYS = Object.freeze([
  'name',
  'category',
  'essences',
  'tags',
  'salvage',
]);

/**
 * The essence filter's two PREDICATE values (issue 1371 r12-list): the reference offers `Carries
 * any essence` and `No essences` ahead of the per-essence entries (`proto:5533`), and
 * `proto:5477-5479` is the predicate each applies.
 */
export const COMPONENT_ESSENCE_FILTER_ANY = '__any';
export const COMPONENT_ESSENCE_FILTER_NONE = '__none';

/** Default page size. */
export const COMPONENT_DEFAULT_PAGE_SIZE = 25;

/** Build a fresh component-browser view-state object. */
export function createComponentBrowserState() {
  return {
    categoryFilter: 'all',
    essenceFilter: 'all',
    groupByCategory: true,
    sortKey: 'name',
    sortDirection: 'asc',
    pageIndex: 0,
    pageSize: COMPONENT_DEFAULT_PAGE_SIZE,
    collapsedCategories: new Set(),
    systemId: '',
    bulkSelectedComponentIds: new Set(),
  };
}

function numeric(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** Every component has a category — normalization guarantees at least `general`. */
export function componentCategoryOf(component) {
  return normalizeComponentCategory(component?.category);
}

/**
 * The essence run a card DRAWS — `essenceChips`, falling back to `essences` (issue 1371
 * r22-store4).
 */
export function componentEssenceRun(component) {
  if (Array.isArray(component?.essenceChips)) return component.essenceChips;
  return Array.isArray(component?.essences) ? component.essences : [];
}

function essenceNames(component) {
  return componentEssenceRun(component).map((essence) => essence?.name || essence?.id);
}

/**
 * The essence filter's predicate: the neutral `all`, the two reference predicates, or a named
 * essence (`proto:5477-5479`, issue 1371 r12-list).
 */
function essenceMatches(component, essence) {
  if (essence === 'all') return true;
  const names = essenceNames(component);
  if (essence === COMPONENT_ESSENCE_FILTER_ANY) return names.length > 0;
  if (essence === COMPONENT_ESSENCE_FILTER_NONE) return names.length === 0;
  return names.includes(essence);
}

/** Filter the projected rows by category and essence. */
export function filterComponents(components, filters = {}) {
  const category = filters.category || 'all';
  const essence = filters.essence || 'all';

  return (Array.isArray(components) ? components : []).filter((component) => {
    if (category !== 'all' && componentCategoryOf(component) !== category) return false;
    return essenceMatches(component, essence);
  });
}

/** Order two category names, pinning the reserved `general` catch-all LAST. */
function compareCategories(left, right) {
  if (left === right) return 0;
  if (left === GENERAL_COMPONENT_CATEGORY) return 1;
  if (right === GENERAL_COMPONENT_CATEGORY) return -1;
  return left.localeCompare(right);
}

const SORT_VALUES = Object.freeze({
  essences: (component) => essenceNames(component).length,
  // The reference's `Tags` key orders by the count of tags in effect (`proto:5485`).
  tags: (component) => (Array.isArray(component?.tags) ? component.tags.length : 0),
  salvage: (component) => numeric(component?.salvageSummary?.resultGroupCount),
});

function sortValue(component, key) {
  const read = SORT_VALUES[key];
  return read ? read(component) : 0;
}

/**
 * The per-key row comparator, factored out so both the flat sort and the category-major sort
 * compose the SAME within-row ordering (a bug injected here flips both).
 */
function rowComparator(key, direction) {
  const byName = (a, b) => String(a?.name || '').localeCompare(String(b?.name || ''));
  return (a, b) => {
    if (key === 'name') return direction * byName(a, b);
    if (key === 'category') {
      // `general` sorts LAST, matching groupComponentsByCategory's pinning.
      const delta = compareCategories(componentCategoryOf(a), componentCategoryOf(b));
      return delta === 0 ? byName(a, b) : direction * delta;
    }
    const delta = sortValue(a, key) - sortValue(b, key);
    if (delta !== 0) return direction * delta;
    return byName(a, b);
  };
}

/** Sort the rows by key + direction with an EXPLICIT comparator. */
export function sortComponents(components, options = {}) {
  const key = COMPONENT_SORT_KEYS.includes(options.key) ? options.key : 'name';
  const direction = options.direction === 'desc' ? -1 : 1;
  const rows = [...(Array.isArray(components) ? components : [])];
  const compareRows = rowComparator(key, direction);

  if (!options.categoryMajor) {
    return rows.sort(compareRows);
  }

  const byName = (a, b) => String(a?.name || '').localeCompare(String(b?.name || ''));
  const secondary = key === 'category' ? byName : compareRows;
  return rows.sort(
    (a, b) => compareCategories(componentCategoryOf(a), componentCategoryOf(b)) || secondary(a, b)
  );
}

/** Group the rows into category buckets, preserving the incoming row order inside each bucket. */
export function groupComponentsByCategory(components, categoryTotals) {
  const buckets = new Map();

  for (const component of Array.isArray(components) ? components : []) {
    const category = componentCategoryOf(component);
    if (!buckets.has(category)) buckets.set(category, []);
    buckets.get(category).push(component);
  }

  return [...buckets]
    .map(([category, rows]) => ({
      category,
      components: rows,
      total: categoryTotalOf(categoryTotals, category, rows.length),
    }))
    .sort((a, b) => compareCategories(a.category, b.category));
}

/**
 * The category filter's options: every category actually present on a row, plus any
 * authored-but-unused vocabulary entry, with `general` pinned LAST as the catch-all.
 */
export function componentCategoryOptions(components, vocabulary = []) {
  const counts = new Map();
  for (const component of Array.isArray(components) ? components : []) {
    const category = componentCategoryOf(component);
    counts.set(category, (counts.get(category) || 0) + 1);
  }
  for (const category of Array.isArray(vocabulary) ? vocabulary : []) {
    const normalized = normalizeComponentCategory(category);
    if (normalized !== GENERAL_COMPONENT_CATEGORY && !counts.has(normalized)) {
      counts.set(normalized, 0);
    }
  }

  const named = [...counts.keys()]
    .filter((category) => category !== GENERAL_COMPONENT_CATEGORY)
    .sort((a, b) => a.localeCompare(b))
    .map((name) => ({ name, count: counts.get(name) }));

  return [
    ...named,
    { name: GENERAL_COMPONENT_CATEGORY, count: counts.get(GENERAL_COMPONENT_CATEGORY) || 0 },
  ];
}

/** The active-filter chips, as data. */
export function describeActiveComponentFilters(filters = {}) {
  const chips = [];
  if (filters.category && filters.category !== 'all') {
    chips.push({ id: 'category', value: filters.category });
  }
  if (filters.essence && filters.essence !== 'all') {
    chips.push({ id: 'essence', value: filters.essence });
  }
  const search = String(filters.search || '').trim();
  if (search) chips.push({ id: 'search', value: search });
  return chips;
}

/**
 * Slice one page out of the rows, clamping the page index into range so a filter change that
 * shrinks the list can never strand the pager on an empty page.
 */
export function paginateComponents(components, options = {}) {
  const { rows, ...window } = paginateRows(components, options, COMPONENT_DEFAULT_PAGE_SIZE);
  return { components: rows, ...window };
}

/**
 * Run the whole pipeline in one call: filter → sort → paginate (→ group the page), the SIBLING of
 * `recipeBrowserModel.buildRecipeBrowserModel` (issue 1081).
 */
export function buildComponentBrowserModel(components, options = {}) {
  const filtered = filterComponents(components, options);
  const sorted = sortComponents(filtered, {
    key: options.sortKey,
    direction: options.sortDirection,
    categoryMajor: !!options.groupByCategory,
  });
  // Counted over the FILTERED COHORT and before pagination — see `countByCategory`.
  const categoryTotals = countByCategory(filtered, componentCategoryOf);
  const paged = paginateComponents(sorted, options);
  const groups = options.groupByCategory
    ? groupComponentsByCategory(paged.components, categoryTotals)
    : [];

  return {
    filtered,
    sorted,
    page: paged.components,
    groups,
    categoryTotals,
    pageIndex: paged.pageIndex,
    pageCount: paged.pageCount,
    totalCount: paged.totalCount,
    rangeStart: paged.rangeStart,
    rangeEnd: paged.rangeEnd,
    chips: describeActiveComponentFilters(options),
  };
}
