/** Pure list model for the GM essence library (issue 1036): filter → sort → paginate. */

import { countByCategory } from './browserGroupCounts.js';
import { paginateRows } from './browserPagination.js';

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

/** Filter the projected rows by status and source state. */
export function filterEssences(essences, filters = {}) {
  const status = ESSENCE_STATUS_FILTERS.includes(filters.status) ? filters.status : 'all';
  const source = ESSENCE_SOURCE_FILTERS.includes(filters.source) ? filters.source : 'all';

  return (Array.isArray(essences) ? essences : []).filter((essence) => {
    if (status !== 'all' && essenceStatusOf(essence) !== status) return false;
    if (source !== 'all' && !matchesSourceFilter(essence, source)) return false;
    return true;
  });
}

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

function numeric(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

const SORT_VALUES = Object.freeze({
  // Enabled first on an ascending sort: the GM's working set is the live essences, and a status
  // sort that buried them under the disabled ones would invert the control's obvious reading.
  status: (essence) => (essenceStatusOf(essence) === 'enabled' ? 0 : 1),
  components: (essence) => numeric(essence?.componentUsageCount),
  recipes: (essence) => numeric(essence?.recipeUsageCount),
});

/** Sort the rows by key + direction with an EXPLICIT comparator. */
export function sortEssences(essences, options = {}) {
  const key = ESSENCE_SORT_KEYS.includes(options.key) ? options.key : 'name';
  const direction = options.direction === 'desc' ? -1 : 1;
  const byName = (a, b) => String(a?.name || '').localeCompare(String(b?.name || ''));
  const read = SORT_VALUES[key];

  return [...(Array.isArray(essences) ? essences : [])].sort((a, b) => {
    if (!read) return direction * byName(a, b);
    const delta = read(a) - read(b);
    return delta === 0 ? byName(a, b) : direction * delta;
  });
}

/**
 * Slice one page out of the rows, clamping the page index into range so a filter change that
 * shrinks the list can never strand the pager on an empty page.
 */
export function paginateEssences(essences, options = {}) {
  const { rows, ...window } = paginateRows(essences, options, ESSENCE_DEFAULT_PAGE_SIZE);
  return { essences: rows, ...window };
}

/** The active-filter chips, as data. */
export function describeActiveEssenceFilters(filters = {}) {
  const chips = [];
  if (filters.status && filters.status !== 'all') {
    chips.push({ id: 'status', value: filters.status });
  }
  if (filters.source && filters.source !== 'all') {
    chips.push({ id: 'source', value: filters.source });
  }
  const search = String(filters.search || '').trim();
  if (search) chips.push({ id: 'search', value: search });
  return chips;
}

/** Run the whole pipeline in one call: filter → sort → paginate. */
export function buildEssenceBrowserModel(essences, options = {}) {
  const filtered = filterEssences(essences, options);
  const sorted = sortEssences(filtered, options);
  const paged = paginateEssences(sorted, options);

  return {
    ...paged,
    filteredIds: sorted.map((essence) => String(essence?.id ?? '')).filter(Boolean),
    pageIds: paged.essences.map((essence) => String(essence?.id ?? '')).filter(Boolean),
    statusCounts: essenceStatusCounts(filterEssences(essences, { ...options, status: 'all' })),
  };
}
