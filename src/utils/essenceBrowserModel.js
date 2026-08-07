/**
 * Pure list model for the GM essence library (issue 1036): filter → sort → paginate.
 *
 * The third studio to get one, and a sibling of `componentBrowserModel.js` and
 * `recipeBrowserModel.js` for the reason they exist: `src/ui/**` is not covered by the
 * ESLint/Prettier globs, so a module there can be lint-green and Sonar-red. Everything
 * here is a pure function over the essence rows the admin store already projects — it
 * never touches Foundry globals, the store, or localization. Callers localize.
 *
 * There is deliberately NO grouping stage. The other two libraries group by CATEGORY, and
 * essences have no category vocabulary; the status axis is a three-way FILTER, which is a
 * different control and a different question. The page-window arithmetic comes from the
 * shared `browserPagination.js` leaf and the status tallies from `browserGroupCounts.js`,
 * so neither is a third copy.
 *
 * Search is deliberately NOT a filter here, and NOT because the store applies it first —
 * there is no essence search in `adminStore` at all, which is why the term had to move onto
 * the lifted browser state. It is applied by the VIEW because whether a source name is
 * searchable depends on `showSourceUi`, a presentation fact this module cannot know. The
 * term still contributes an active-filter chip through `describeActiveEssenceFilters`.
 */

import { countByCategory } from './browserGroupCounts.js';
import { paginateRows } from './browserPagination.js';

/** @typedef {'name' | 'status' | 'components' | 'recipes'} EssenceSortKey */
/** @typedef {'asc' | 'desc'} SortDirection */

/** Sort keys offered by the library toolbar, in menu order. */
export const ESSENCE_SORT_KEYS = Object.freeze(['name', 'status', 'components', 'recipes']);

/** The status segmented control's three options, in render order. */
export const ESSENCE_STATUS_FILTERS = Object.freeze(['all', 'enabled', 'disabled']);

/**
 * The source-state filter's options, in render order.
 *
 * Retained from the shipped browser and reachable only when `showSourceUi` is true: a
 * broken source link is otherwise unfindable, which is the only reason `needs-attention`
 * exists.
 */
export const ESSENCE_SOURCE_FILTERS = Object.freeze(['all', 'linked', 'none', 'needs-attention']);

/** The library's two presentations. Actions stay row-only; grid selection routes via the inspector. */
export const ESSENCE_VIEW_MODES = Object.freeze(['list', 'grid']);

/**
 * Default page size. It must EXCEED the lab and smoke fixtures' essence counts: those
 * harnesses wait for a visible essence row and fail on zero, so a default that pages the
 * fixture essences off page 1 breaks the gate.
 */
export const ESSENCE_DEFAULT_PAGE_SIZE = 25;

/**
 * Build a fresh essence-browser view-state object.
 *
 * Lifted to the manager root and bound in, so it SURVIVES the editor round-trip: opening
 * an essence unmounts the browser, and remounting it with these reset to defaults threw
 * away the page, filters and sort the GM left. The shipped `EssenceBrowserView` kept all
 * of this component-locally, which is exactly the bug.
 *
 * A fresh call is used on FIRST arrival and by isolated mounted tests that do not lift the
 * state, so this must always return a NEW object with a NEW `Set`, never a shared
 * singleton.
 *
 * `systemId` is the PERSISTED system sentinel the view's reset effect compares against
 * `selectedSystemId`. It lives here — not as component-local `$state` — so a remount is
 * not misread as a system switch and does not wipe the page and filters this object
 * otherwise preserves.
 *
 * `bulkSelectedEssenceIds` is deliberately a bare `new Set()` literal and NOT an import
 * from `essenceBulkEditModel.js`: a new import in this module would force matching
 * mount-harness allowlist edits in every suite that mounts the manager, where an omission
 * HANGS the suite as `# cancelled` rather than failing it.
 *
 * `searchTerm` lives here and NOT in the admin store, which is where the recipe browser's
 * equivalent lives. There is no essence search in `adminStore` at all — no
 * `essenceSearchTerm`, no pre-projection filter — so a component-local term would be
 * destroyed by the very editor round-trip the rest of this object survives, and criterion
 * 12 would be satisfied for the filters and silently not for the search. The TERM is
 * carried here; the FILTER is applied by the view, because whether a source name is
 * searchable depends on `showSourceUi`, which is a presentation fact.
 *
 * @returns {{
 *   searchTerm: string, statusFilter: string, sourceFilter: string, viewMode: string,
 *   sortKey: EssenceSortKey, sortDirection: SortDirection,
 *   pageIndex: number, pageSize: number, systemId: string,
 *   bulkSelectedEssenceIds: Set<string>
 * }}
 */
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

/**
 * An essence row's status key — the axis the segmented control filters and counts on.
 *
 * Default-TRUE, matching the persisted field: a row carrying no `enabled` key reads as
 * enabled. Pinning that here rather than at each call site is what stops the filter and
 * the tally disagreeing about a legacy row.
 *
 * @param {{enabled?: boolean}} essence
 * @returns {'enabled' | 'disabled'}
 */
export function essenceStatusOf(essence) {
  return essence?.enabled === false ? 'disabled' : 'enabled';
}

/**
 * Whether a row satisfies the source-state filter. `needs-attention` is the union of the
 * two BROKEN states, which is the whole reason the option exists.
 */
function matchesSourceFilter(essence, source) {
  const state = String(essence?.sourceState || 'none');
  if (source === 'linked') return state === 'linked';
  if (source === 'none') return state === 'none';
  return state === 'stale' || state === 'missing';
}

/**
 * Filter the projected rows by status and source state.
 *
 * @param {object[]} essences
 * @param {{status?: string, source?: string}} [filters]
 * @returns {object[]} a new array; the input is not mutated.
 */
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
 * How many rows each status holds — the counts the segmented control's option labels read,
 * so the GM can see that `Disabled` matches nothing without opening it.
 *
 * Total over whatever rows it is GIVEN. `buildEssenceBrowserModel` gives it the rows every
 * active filter EXCEPT the status axis leaves, which is what makes each segment's number
 * equal to what clicking it shows; see that function.
 *
 * Computed with the shared `countByCategory` tally rather than a hand-rolled loop; it is
 * key-agnostic and this is a second key.
 *
 * @param {object[]} essences
 * @returns {{all: number, enabled: number, disabled: number}}
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
  // Enabled first on an ascending sort: the GM's working set is the live essences, and a
  // status sort that buried them under the disabled ones would invert the control's
  // obvious reading.
  status: (essence) => (essenceStatusOf(essence) === 'enabled' ? 0 : 1),
  components: (essence) => numeric(essence?.componentUsageCount),
  recipes: (essence) => numeric(essence?.recipeUsageCount),
});

/**
 * Sort the rows by key + direction with an EXPLICIT comparator. `Array#sort()` with no
 * comparator is a SonarCloud finding (and lexicographic on numbers), so every path through
 * here passes one. Name is the stable tiebreak.
 *
 * @param {object[]} essences
 * @param {{key?: EssenceSortKey, direction?: SortDirection}} [options]
 * @returns {object[]} a new array; the input is not mutated.
 */
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
 * Slice one page out of the rows, clamping the page index into range so a filter change
 * that shrinks the list can never strand the pager on an empty page. The window is a
 * 1-based inclusive RANGE; an empty result reports `0..0`.
 *
 * @param {object[]} essences
 * @param {{pageIndex?: number, pageSize?: number}} [options]
 * @returns {{essences: object[], pageIndex: number, pageCount: number, totalCount: number,
 *   rangeStart: number, rangeEnd: number}}
 */
export function paginateEssences(essences, options = {}) {
  const { rows, ...window } = paginateRows(essences, options, ESSENCE_DEFAULT_PAGE_SIZE);
  return { essences: rows, ...window };
}

/**
 * The active-filter chips, as data. Each chip names the filter it clears; the view
 * localizes and renders the dismissible run.
 *
 * Search is included even though it is applied by the VIEW rather than here: a search term
 * is an active filter the GM must be able to see and clear, wherever it is applied.
 *
 * @param {{status?: string, source?: string, search?: string}} [filters]
 * @returns {{id: 'status' | 'source' | 'search', value: string}[]}
 */
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

/**
 * Run the whole pipeline in one call: filter → sort → paginate.
 *
 * One entry point so the view composes nothing itself and the ORDER cannot drift.
 *
 * ## What the status counts are counted over
 *
 * Every active filter EXCEPT the status axis itself — so the count on each segment is
 * exactly how many rows clicking it would show. Counting over the status-filtered rows
 * would be the tautology `Disabled (0)` while the Enabled segment is selected; counting
 * over the raw roster would print a number the GM cannot reach, because the search and the
 * source filter are still narrowing the list. `browserGroupCounts.js` states the same rule
 * for the library group headers — "a category total that ignored the active search /
 * category / essence filters would be a third wrong number" — and this is the same
 * question asked on a different axis.
 *
 * The SEARCH is applied by the view before the rows arrive here, so it is already
 * accounted for; the SOURCE filter is applied here and is therefore re-applied explicitly
 * with the status axis widened to `all`.
 *
 * @param {object[]} essences the projected rows, already narrowed by the view's search.
 * @param {{status?: string, source?: string, key?: EssenceSortKey,
 *   direction?: SortDirection, pageIndex?: number, pageSize?: number}} [options]
 * @returns {{essences: object[], filteredIds: string[], pageIds: string[],
 *   statusCounts: {all: number, enabled: number, disabled: number}, pageIndex: number,
 *   pageCount: number, totalCount: number, rangeStart: number, rangeEnd: number}}
 */
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
