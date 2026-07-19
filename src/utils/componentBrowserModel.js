/**
 * Pure list model for the GM component library (issue 676): filter → sort → paginate →
 * group.
 *
 * That order is deliberate and is what `ComponentsBrowserView` composes: the PAGE is
 * grouped, so the pager stays the unit of truth for how many rows are on screen. (This
 * header claimed `filter → group → sort → paginate` until issue 676's follow-up — the
 * opposite of what ships, which is how the group header's page-vs-category count
 * confusion went unnoticed.) The group header therefore reports both its rendered count
 * and the category's filtered total; `countByCategory` supplies the latter.
 *
 * A sibling of `recipeBrowserModel.js`, and here for the same reason it is: `src/ui/**`
 * is not covered by the ESLint/Prettier globs, so a module there can be lint-green and
 * Sonar-red. Everything here is a pure function over the component rows the admin store
 * already projects — it never touches Foundry globals, the store, or localization.
 * Callers localize.
 *
 * Search is deliberately NOT a filter here: the admin store's item-search term is
 * applied before projection, so re-applying it would double-filter. The search term
 * still contributes an active-filter chip.
 */

import { categoryTotalOf } from './browserGroupCounts.js';
import { GENERAL_COMPONENT_CATEGORY, normalizeComponentCategory } from './componentCategories.js';

/** @typedef {'name' | 'category' | 'essences' | 'salvage'} ComponentSortKey */
/** @typedef {'asc' | 'desc'} SortDirection */

/** Sort keys offered by the library toolbar, in menu order. */
export const COMPONENT_SORT_KEYS = Object.freeze(['name', 'category', 'essences', 'salvage']);

/**
 * Default page size. It must EXCEED the smoke fixture's component count: the harness
 * waits for a visible `.manager-component-row` and fails on zero, so a default that
 * pages the fixture components off page 1 breaks the smoke gate.
 */
export const COMPONENT_DEFAULT_PAGE_SIZE = 25;

/**
 * Build a fresh component-browser view-state object.
 *
 * Lifted to the manager root and bound in, so it SURVIVES the editor round-trip:
 * opening a component unmounts the browser, and remounting it with these reset to
 * defaults threw away the page, filters, sort and grouping the GM left. `ComponentsBrowserView`
 * kept all of this locally before issue 676, which is exactly the bug.
 *
 * A fresh call is used on FIRST arrival and by isolated mounted tests that don't lift
 * the state — so this must always return a NEW object with a NEW Set, never a shared
 * singleton. `collapsedCategories` is collapse-opt-IN: absent from the set = expanded.
 *
 * @returns {{
 *   categoryFilter: string, essenceFilter: string, groupByCategory: boolean,
 *   sortKey: ComponentSortKey, sortDirection: SortDirection,
 *   pageIndex: number, pageSize: number, collapsedCategories: Set<string>
 * }}
 */
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

function essenceNames(component) {
  return (Array.isArray(component?.essences) ? component.essences : []).map(
    (essence) => essence?.name || essence?.id
  );
}

/**
 * Filter the projected rows by category and essence.
 *
 * Note there is deliberately no TAG filter: tags are a many-valued field that was
 * being asked to do a single-valued job, and `category` now does that job. Tags are
 * edited only in the component editor.
 *
 * @param {object[]} components
 * @param {{category?: string, essence?: string}} [filters]
 * @returns {object[]}
 */
export function filterComponents(components, filters = {}) {
  const category = filters.category || 'all';
  const essence = filters.essence || 'all';

  return (Array.isArray(components) ? components : []).filter((component) => {
    if (category !== 'all' && componentCategoryOf(component) !== category) return false;
    if (essence !== 'all' && !essenceNames(component).includes(essence)) return false;
    return true;
  });
}

/**
 * Order two category names, pinning the reserved `general` catch-all LAST. Shared by
 * the category sort and the group ordering so the two can never disagree.
 */
function compareCategories(left, right) {
  if (left === right) return 0;
  if (left === GENERAL_COMPONENT_CATEGORY) return 1;
  if (right === GENERAL_COMPONENT_CATEGORY) return -1;
  return left.localeCompare(right);
}

const SORT_VALUES = Object.freeze({
  essences: (component) => essenceNames(component).length,
  salvage: (component) => numeric(component?.salvageSummary?.resultGroupCount),
});

function sortValue(component, key) {
  const read = SORT_VALUES[key];
  return read ? read(component) : 0;
}

/**
 * Sort the rows by key + direction with an EXPLICIT comparator. `Array#sort()` with no
 * comparator is a SonarCloud finding (and lexicographic on numbers), so every path
 * through here passes one. Name is the stable tiebreak.
 *
 * @param {object[]} components
 * @param {{key?: ComponentSortKey, direction?: SortDirection}} [options]
 * @returns {object[]} a new array; the input is not mutated.
 */
export function sortComponents(components, options = {}) {
  const key = COMPONENT_SORT_KEYS.includes(options.key) ? options.key : 'name';
  const direction = options.direction === 'desc' ? -1 : 1;
  const byName = (a, b) => String(a?.name || '').localeCompare(String(b?.name || ''));

  return [...(Array.isArray(components) ? components : [])].sort((a, b) => {
    if (key === 'name') return direction * byName(a, b);
    if (key === 'category') {
      // `general` sorts LAST, matching groupComponentsByCategory's pinning. Plain
      // localeCompare would float it to the front (g < H), so sorting by category with
      // grouping OFF would order the rows differently from the same rows grouped —
      // the catch-all bucket would jump from the bottom of the list to the top.
      const delta = compareCategories(componentCategoryOf(a), componentCategoryOf(b));
      return delta === 0 ? byName(a, b) : direction * delta;
    }
    const delta = sortValue(a, key) - sortValue(b, key);
    if (delta !== 0) return direction * delta;
    return byName(a, b);
  });
}

/**
 * Group the rows into category buckets, preserving the incoming row order inside each
 * bucket. `general` is pinned LAST as the catch-all, mirroring the Recipe Studio's
 * badge-vs-filter asymmetry; the remaining buckets are name-ordered so the group list
 * is stable across re-sorts of the rows themselves.
 *
 * The rows passed in are the PAGE, so each bucket also carries `total`: how many rows
 * the category holds across the whole FILTERED list. Without it the header reads
 * "General · 25 components" above page 1 of a 282-strong General bucket, which says the
 * bucket holds 25. Pass the map `countByCategory(filteredRows, componentCategoryOf)`
 * built from the same filters; omit it and `total` degrades to the bucket's own length.
 *
 * @param {object[]} components the page's rows.
 * @param {Map<string, number>} [categoryTotals] from `countByCategory`, over the
 *   FILTERED rows.
 * @returns {{category: string, components: object[], total: number}[]}
 */
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
 *
 * Each option carries its own `count`, because the Recipe Studio's category select
 * reads "Reagent (4)": a bare option list makes the GM open the filter to discover it
 * matches nothing. An authored-but-unused vocabulary entry therefore reports `0`
 * rather than being hidden — the vocabulary is a real thing the GM authored.
 *
 * @param {object[]} components
 * @param {string[]} [vocabulary] the system's authored `componentCategories`
 * @returns {{name: string, count: number}[]}
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

/**
 * The active-filter chips, as data. Each chip names the filter it clears; the view
 * localizes and renders the dismissible run. The SIBLING of the recipe library's
 * `describeActiveFilters` — the component browser shipped with only a single
 * "Clear filters" button, which says that filters are on but never which ones.
 *
 * Search is included even though it is not applied here (the admin store filters
 * before projection): a search term is an active filter the GM must be able to see
 * and clear.
 *
 * @param {{category?: string, essence?: string, search?: string}} [filters]
 * @returns {{id: 'category' | 'essence' | 'search', value: string}[]}
 */
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
 * Slice one page out of the rows, clamping the page index into range so a filter change
 * that shrinks the list can never strand the pager on an empty page.
 *
 * The window is reported as a 1-based, inclusive RANGE, because the library's count
 * reads "1–5 of 12": a bare "5 of 12" never tells the GM WHICH page they are looking
 * at. An empty result reports `0..0`.
 *
 * @param {object[]} components
 * @param {{pageIndex?: number, pageSize?: number}} [options]
 * @returns {{components: object[], pageIndex: number, pageCount: number, totalCount: number, rangeStart: number, rangeEnd: number}}
 */
export function paginateComponents(components, options = {}) {
  const rows = Array.isArray(components) ? components : [];
  const pageSize = Math.max(1, numeric(options.pageSize, COMPONENT_DEFAULT_PAGE_SIZE));
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const pageIndex = Math.min(Math.max(0, numeric(options.pageIndex)), pageCount - 1);
  const start = pageIndex * pageSize;
  const page = rows.slice(start, start + pageSize);

  return {
    components: page,
    pageIndex,
    pageCount,
    totalCount: rows.length,
    rangeStart: page.length === 0 ? 0 : start + 1,
    rangeEnd: page.length === 0 ? 0 : start + page.length,
  };
}
