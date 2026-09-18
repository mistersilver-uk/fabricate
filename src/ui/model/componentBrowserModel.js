/** Pure list model for the GM component library (issue 676): filter → sort → paginate → group. */

import {
  GENERAL_COMPONENT_CATEGORY,
  normalizeComponentCategory,
} from '../../utils/componentCategories.js';

import {
  buildEntityBrowserModel,
  canonicalBrowserOptions,
  describeActiveEntityFilters,
  filterEntities,
  groupEntitiesByCategory,
  paginateEntities,
  sortEntities,
} from './entityBrowserModel.js';

/** Sort keys offered by the library toolbar, in menu order. */
export const COMPONENT_SORT_KEYS = Object.freeze([
  'name',
  'category',
  'essences',
  'tags',
  'salvage',
]);

/** The essence filter's two predicate values, offered ahead of the per-essence entries (#1371). */
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

/** The essence run a card draws: `essenceChips`, falling back to `essences` (#1371). */
export function componentEssenceRun(component) {
  if (Array.isArray(component?.essenceChips)) return component.essenceChips;
  return Array.isArray(component?.essences) ? component.essences : [];
}

function essenceNames(component) {
  return componentEssenceRun(component).map((essence) => essence?.name || essence?.id);
}

/** Order two category names, pinning the reserved `general` catch-all last. */
function compareCategories(left, right) {
  if (left === right) return 0;
  if (left === GENERAL_COMPONENT_CATEGORY) return 1;
  if (right === GENERAL_COMPONENT_CATEGORY) return -1;
  return left.localeCompare(right);
}

/**
 * How the component library shapes the shared pipeline. It is the only one of the three that pins
 * `general` last and that offers a sort key ordering by category; grouping off emits no buckets,
 * because its view slices its own ghost-inclusive window out of `sorted` and groups that itself.
 */
const COMPONENT_ADAPTER = Object.freeze({
  rowsKey: 'components',
  sortKeys: COMPONENT_SORT_KEYS,
  defaultPageSize: COMPONENT_DEFAULT_PAGE_SIZE,
  categoryOf: componentCategoryOf,
  compareCategories,
  categorySortKey: 'category',
  sortValues: Object.freeze({
    essences: (component) => essenceNames(component).length,
    // The reference's `Tags` key orders by the count of tags in effect.
    tags: (component) => (Array.isArray(component?.tags) ? component.tags.length : 0),
    salvage: (component) => numeric(component?.salvageSummary?.resultGroupCount),
  }),
  filters: Object.freeze([
    {
      id: 'category',
      matches: (component, value) => value === 'all' || componentCategoryOf(component) === value,
    },
    {
      id: 'essence',
      // The neutral `all`, either predicate, or a named essence (#1371).
      matches: (component, value) => {
        if (value === 'all') return true;
        const names = essenceNames(component);
        if (value === COMPONENT_ESSENCE_FILTER_ANY) return names.length > 0;
        if (value === COMPONENT_ESSENCE_FILTER_NONE) return names.length === 0;
        return names.includes(value);
      },
    },
  ]),
});

export const filterComponents = (rows, filters) => filterEntities(rows, filters, COMPONENT_ADAPTER);
export const sortComponents = (rows, options) => sortEntities(rows, options, COMPONENT_ADAPTER);
export const paginateComponents = (rows, options) =>
  paginateEntities(rows, options, COMPONENT_ADAPTER);
export const describeActiveComponentFilters = (filters) =>
  describeActiveEntityFilters(filters, COMPONENT_ADAPTER);
export const groupComponentsByCategory = (rows, totals) =>
  groupEntitiesByCategory(rows, totals, COMPONENT_ADAPTER);

/**
 * The category filter's options: every category present on a row, plus any authored-but-unused
 * vocabulary entry, with `general` pinned last as the catch-all.
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

/** Run the whole pipeline in one call, the sibling of `buildRecipeBrowserModel` (issue 1081). */
export function buildComponentBrowserModel(components, options = {}) {
  return buildEntityBrowserModel(components, canonicalBrowserOptions(options), COMPONENT_ADAPTER);
}
