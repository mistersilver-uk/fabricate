/** Pure list model for the GM essence library (issue 1036): filter → sort → paginate. */

import { countByCategory } from './browserGroupCounts.js';
import {
  buildEntityBrowserModel,
  describeActiveEntityFilters,
  filterEntities,
  paginateEntities,
  sortEntities,
} from './entityBrowserModel.js';

/** Sort keys offered by the library toolbar, in menu order. */
export const ESSENCE_SORT_KEYS = Object.freeze(['name', 'status', 'components', 'recipes']);

/** The status segmented control's three options, in render order. */
export const ESSENCE_STATUS_FILTERS = Object.freeze(['all', 'enabled', 'disabled']);

/** The source-state filter's options, in render order. */
export const ESSENCE_SOURCE_FILTERS = Object.freeze(['all', 'linked', 'none', 'needs-attention']);

/** The library's two presentations. */
export const ESSENCE_VIEW_MODES = Object.freeze(['list', 'grid']);

/** Default page size. */
export const ESSENCE_DEFAULT_PAGE_SIZE = 25;

/** Build a fresh essence-browser view-state object. */
export function createEssenceBrowserState() {
  return {
    searchTerm: '',
    statusFilter: 'all',
    sourceFilter: 'all',
    viewMode: 'list',
    sortKey: 'name',
    sortDirection: 'asc',
    pageIndex: 0,
    pageSize: ESSENCE_DEFAULT_PAGE_SIZE,
    systemId: '',
    bulkSelectedEssenceIds: new Set(),
  };
}

/** An essence row's status key — the axis the segmented control filters and counts on. */
export function essenceStatusOf(essence) {
  return essence?.enabled === false ? 'disabled' : 'enabled';
}

/** Whether a row satisfies the source-state filter. */
function matchesSourceFilter(essence, source) {
  const state = String(essence?.sourceState || 'none');
  if (source === 'linked') return state === 'linked';
  if (source === 'none') return state === 'none';
  return state === 'stale' || state === 'missing';
}

function numeric(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * How the essence library shapes the shared pipeline. It has no category, so it never groups, and
 * both axes carry an allowed list: an uncoerced `source` would read as `needs-attention` and hide
 * every healthy row. The lists coerce the filter and not the chips, which report the raw values.
 */
const ESSENCE_ADAPTER = Object.freeze({
  rowsKey: 'essences',
  sortKeys: ESSENCE_SORT_KEYS,
  defaultPageSize: ESSENCE_DEFAULT_PAGE_SIZE,
  sortValues: Object.freeze({
    // Enabled first on an ascending sort: the GM's working set is the live essences, and a status
    // sort that buried them under the disabled ones would invert the control's obvious reading.
    status: (essence) => (essenceStatusOf(essence) === 'enabled' ? 0 : 1),
    components: (essence) => numeric(essence?.componentUsageCount),
    recipes: (essence) => numeric(essence?.recipeUsageCount),
  }),
  filters: Object.freeze([
    {
      id: 'status',
      allowed: ESSENCE_STATUS_FILTERS,
      matches: (essence, value) => value === 'all' || essenceStatusOf(essence) === value,
    },
    {
      id: 'source',
      allowed: ESSENCE_SOURCE_FILTERS,
      matches: (essence, value) => value === 'all' || matchesSourceFilter(essence, value),
    },
  ]),
});

export const filterEssences = (rows, filters) => filterEntities(rows, filters, ESSENCE_ADAPTER);
export const sortEssences = (rows, options) => sortEntities(rows, options, ESSENCE_ADAPTER);
export const paginateEssences = (rows, options) => paginateEntities(rows, options, ESSENCE_ADAPTER);
export const describeActiveEssenceFilters = (filters) =>
  describeActiveEntityFilters(filters, ESSENCE_ADAPTER);

/**
 * How many rows each status holds — the counts the segmented control's option labels read, so the
 * GM can see that `Disabled` matches nothing without opening it.
 */
export function essenceStatusCounts(essences) {
  const rows = Array.isArray(essences) ? essences : [];
  const counts = countByCategory(rows, essenceStatusOf);
  return {
    all: rows.length,
    enabled: counts.get('enabled') || 0,
    disabled: counts.get('disabled') || 0,
  };
}

const idsOf = (rows) => rows.map((essence) => String(essence?.id ?? '')).filter(Boolean);

/** Run the whole pipeline in one call: filter → sort → paginate. */
export function buildEssenceBrowserModel(essences, options = {}) {
  const model = buildEntityBrowserModel(essences, options, ESSENCE_ADAPTER);

  return {
    essences: model.page,
    pageIndex: model.pageIndex,
    pageCount: model.pageCount,
    totalCount: model.totalCount,
    rangeStart: model.rangeStart,
    rangeEnd: model.rangeEnd,
    filteredIds: idsOf(model.sorted),
    pageIds: idsOf(model.page),
    // A second, status-neutral pass, so each option's count survives the status filter itself.
    statusCounts: essenceStatusCounts(filterEssences(essences, { ...options, status: 'all' })),
  };
}
