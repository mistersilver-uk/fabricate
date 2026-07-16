/**
 * Pure list model for the GM component library (issue 676): filter → group → sort →
 * paginate.
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
 * @param {object[]} components
 * @returns {{category: string, components: object[]}[]}
 */
export function groupComponentsByCategory(components) {
  const buckets = new Map();

  for (const component of Array.isArray(components) ? components : []) {
    const category = componentCategoryOf(component);
    if (!buckets.has(category)) buckets.set(category, []);
    buckets.get(category).push(component);
  }

  return [...buckets]
    .map(([category, rows]) => ({ category, components: rows }))
    .sort((a, b) => compareCategories(a.category, b.category));
}

/**
 * The category filter's options: every category actually present on a row, plus any
 * authored-but-unused vocabulary entry, with `general` pinned LAST as the catch-all.
 *
 * @param {object[]} components
 * @param {string[]} [vocabulary] the system's authored `componentCategories`
 * @returns {string[]}
 */
export function componentCategoryOptions(components, vocabulary = []) {
  const present = new Set(
    (Array.isArray(components) ? components : []).map((component) => componentCategoryOf(component))
  );
  for (const category of Array.isArray(vocabulary) ? vocabulary : []) {
    const normalized = normalizeComponentCategory(category);
    if (normalized !== GENERAL_COMPONENT_CATEGORY) present.add(normalized);
  }
  present.delete(GENERAL_COMPONENT_CATEGORY);
  return [...[...present].sort((a, b) => a.localeCompare(b)), GENERAL_COMPONENT_CATEGORY];
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
