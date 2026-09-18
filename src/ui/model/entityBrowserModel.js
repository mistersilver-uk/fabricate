/**
 * The one list pipeline behind the GM libraries (issue 1688): filter → sort → paginate → group,
 * shaped per entity by a frozen adapter literal naming its row-collection key, sort keys and value
 * readers, ordered filter axes, and how it derives and orders categories.
 */

import { categoryTotalOf, countByCategory } from './browserGroupCounts.js';
import { paginateRows } from './browserPagination.js';

const compareByName = (a, b) => String(a?.name || '').localeCompare(String(b?.name || ''));

const compareNames = (left, right) => left.localeCompare(right);

function categoryComparator(adapter) {
  return adapter.compareCategories || compareNames;
}

/** Order two rows by category; the adapter's comparator takes the category names, not the rows. */
function compareRowCategories(adapter, left, right) {
  return categoryComparator(adapter)(adapter.categoryOf(left), adapter.categoryOf(right));
}

function sortValueOf(adapter, row, key) {
  const read = adapter.sortValues[key];
  return read ? read(row) : 0;
}

/** The per-key row comparator, shared so the flat and category-major sorts order rows alike. */
function rowComparator(adapter, key, direction) {
  return (a, b) => {
    if (key === 'name') return direction * compareByName(a, b);
    const delta =
      key === adapter.categorySortKey
        ? compareRowCategories(adapter, a, b)
        : sortValueOf(adapter, a, key) - sortValueOf(adapter, b, key);
    return delta === 0 ? compareByName(a, b) : direction * delta;
  };
}

/**
 * The canonical options for a toolbar that names them `sortKey`, `sortDirection` and
 * `groupByCategory`; grouping on orders category-major before pagination, so each category is a
 * contiguous run across page boundaries rather than an interleaved slice per page.
 */
export const canonicalBrowserOptions = (options) => ({
  ...options,
  key: options.sortKey,
  direction: options.sortDirection,
  categoryMajor: !!options.groupByCategory,
});

/** An axis with an `allowed` list coerces an unrecognised value back to the neutral `all`. */
function filterValue(options, filter) {
  const raw = options[filter.id];
  if (filter.allowed) return filter.allowed.includes(raw) ? raw : 'all';
  return raw || 'all';
}

/** Keep the rows every one of the adapter's filter axes admits. */
export function filterEntities(rows, options = {}, adapter) {
  const axes = adapter.filters.map((filter) => [filter, filterValue(options, filter)]);
  return (Array.isArray(rows) ? rows : []).filter((row) =>
    axes.every(([filter, value]) => filter.matches(row, value))
  );
}

/** Sort the rows by key + direction with an explicit comparator. */
export function sortEntities(rows, options = {}, adapter) {
  const key = adapter.sortKeys.includes(options.key) ? options.key : 'name';
  const direction = options.direction === 'desc' ? -1 : 1;
  const compareRows = rowComparator(adapter, key, direction);
  const sorted = [...(Array.isArray(rows) ? rows : [])];
  if (!options.categoryMajor || !adapter.categoryOf) return sorted.sort(compareRows);

  // Buckets are always ascending here, so a sort by category tiebreaks on an ascending name.
  const secondary = key === adapter.categorySortKey ? compareByName : compareRows;
  return sorted.sort((a, b) => compareRowCategories(adapter, a, b) || secondary(a, b));
}

/** Slice one page out under the adapter's row key, clamping the index so no filter strands it. */
export function paginateEntities(rows, options = {}, adapter) {
  const { rows: page, ...window } = paginateRows(rows, options, adapter.defaultPageSize);
  return { [adapter.rowsKey]: page, ...window };
}

/** Group the rows into category buckets, preserving the incoming row order inside each bucket. */
export function groupEntitiesByCategory(rows, categoryTotals, adapter) {
  const buckets = new Map();

  for (const row of Array.isArray(rows) ? rows : []) {
    const category = adapter.categoryOf(row);
    if (!buckets.has(category)) buckets.set(category, []);
    buckets.get(category).push(row);
  }

  return [...buckets]
    .map(([category, bucket]) => ({
      category,
      [adapter.rowsKey]: bucket,
      total: categoryTotalOf(categoryTotals, category, bucket.length),
    }))
    .sort((a, b) => categoryComparator(adapter)(a.category, b.category));
}

/** The active-filter chips, as data, in the adapter's filter order. */
export function describeActiveEntityFilters(options = {}, adapter) {
  const chips = [];
  for (const filter of adapter.filters) {
    const value = options[filter.id];
    if (value && value !== 'all') chips.push({ id: filter.id, value });
  }
  const search = adapter.searchOf ? adapter.searchOf(options) : String(options.search || '').trim();
  if (search) chips.push({ id: 'search', value: search });
  return chips;
}

function assembleGroups(page, categoryTotals, options, adapter) {
  if (options.categoryMajor && adapter.categoryOf) {
    return groupEntitiesByCategory(page, categoryTotals, adapter);
  }
  // `single` is the only route by which a grouping-off view that renders groups draws any row.
  return adapter.ungroupedGroups === 'single'
    ? [{ category: '', [adapter.rowsKey]: page, total: page.length }]
    : [];
}

/**
 * The whole pipeline in one call, as the superset each entity's own model reshapes. `categoryTotals`
 * counts the filtered cohort before pagination, so a header states its bucket's size in the cohort.
 */
export function buildEntityBrowserModel(rows, options = {}, adapter) {
  const filtered = filterEntities(rows, options, adapter);
  const sorted = sortEntities(filtered, options, adapter);
  const categoryTotals = adapter.categoryOf
    ? countByCategory(filtered, adapter.categoryOf)
    : new Map();
  const paged = paginateEntities(sorted, options, adapter);
  const page = paged[adapter.rowsKey];

  return {
    filtered,
    sorted,
    page,
    groups: assembleGroups(page, categoryTotals, options, adapter),
    categoryTotals,
    pageIndex: paged.pageIndex,
    pageCount: paged.pageCount,
    totalCount: paged.totalCount,
    rangeStart: paged.rangeStart,
    rangeEnd: paged.rangeEnd,
    chips: describeActiveEntityFilters(options, adapter),
  };
}
