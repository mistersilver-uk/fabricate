/**
 * Filter and sort for the shared scoped-entity list shells (issue 1380, epic 1357): the pure half
 * answering which projected entries a list shows and in what order, reading no Foundry global.
 * Selection reduction stays in `bulkSelectionModel.js` and page arithmetic in
 * `browserPagination.js`. Its real job is the per-entry search index memo.
 */

/** The membership filter a WORLD catalogue offers. */
export const WORLD_MEMBERSHIP_FILTERS = Object.freeze(['all', 'member', 'unused']);

/** The sorts every scoped list offers before a lane adds its own. */
export const SCOPED_LIST_SORTS = Object.freeze([
  'name-asc',
  'name-desc',
  'systems-asc',
  'systems-desc',
]);

/** The default search string for one entry: its name and description, lowercased. */
export function defaultScopedSearchText(entry) {
  const entity = entry?.entity ?? null;
  const name = typeof entity?.name === 'string' ? entity.name : '';
  const description = typeof entity?.description === 'string' ? entity.description : '';
  return `${name} ${description}`.toLowerCase();
}

/** The name a row sorts and renders under, with an id fallback. */
export function scopedEntryName(entry) {
  const name = entry?.entity?.name;
  return typeof name === 'string' && name.trim() ? name : String(entry?.id ?? '');
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

/** Does this entry pass the world-scope membership filter? */
function passesWorldMembership(entry, membership) {
  const count = Number(entry?.membershipCount) || 0;
  if (membership === 'member') return count > 0;
  if (membership === 'unused') return count === 0;
  return true;
}

/** A list model instance, owning the search-index memo for one mounted list. */
export function createScopedEntityListModel() {
  let searchCache = null;

  /** The search string and the sort key for every entry, one `searchOf` call each. */
  function indexOf(entries, searchOf) {
    if (searchCache && searchCache.entries === entries && searchCache.searchOf === searchOf) {
      return searchCache;
    }
    const text = new Map();
    const sortKey = new Map();
    for (const entry of entries) {
      text.set(entry.id, String(searchOf(entry) ?? '').toLowerCase());
      // THE SORT KEY IS THE RAW NAME.
      sortKey.set(entry.id, scopedEntryName(entry));
    }
    searchCache = { entries, searchOf, text, sortKey };
    return searchCache;
  }

  return {
    /** The rows this list shows, filtered and sorted. */
    project({
      entries = [],
      searchOf = defaultScopedSearchText,
      query = '',
      membership = 'all',
      filters = [],
      filterValues = {},
      sort = 'name-asc',
      sorts = [],
    } = {}) {
      const all = asArray(entries);
      const index = indexOf(all, searchOf);
      const needle = String(query ?? '')
        .trim()
        .toLowerCase();
      const activeFilters = asArray(filters).filter((filter) => {
        const value = filterValues?.[filter?.id];
        return typeof value === 'string' && value !== '' && value !== 'all';
      });

      const rows = all.filter((entry) => {
        if (needle && !(index.text.get(entry.id) ?? '').includes(needle)) return false;
        if (!passesWorldMembership(entry, membership)) return false;
        for (const filter of activeFilters) {
          if (!filter.matches(entry, filterValues[filter.id])) return false;
        }
        return true;
      });

      // A LANE DESCRIPTOR OUTRANKS EVERY BUILT-IN ID, so it is tested before the switch rather than
      // inside it: a lane may legitimately declare a sort whose id shadows one of these.
      const extra = asArray(sorts).find((descriptor) => descriptor?.id === sort);
      if (extra) {
        rows.sort((left, right) => extra.compare(left, right));
      } else {
        // The NAME tie-break runs in the same direction on BOTH membership sorts, so two entities
        // held by the same number of systems keep one stable neighbourhood however the count is
        // ordered.
        switch (sort) {
          case 'name-desc': {
            rows.sort((left, right) => compareKeys(index.sortKey, right, left));
            break;
          }
          case 'systems-desc': {
            rows.sort(
              (left, right) =>
                (Number(right.membershipCount) || 0) - (Number(left.membershipCount) || 0) ||
                compareKeys(index.sortKey, left, right)
            );
            break;
          }
          case 'systems-asc': {
            rows.sort(
              (left, right) =>
                (Number(left.membershipCount) || 0) - (Number(right.membershipCount) || 0) ||
                compareKeys(index.sortKey, left, right)
            );
            break;
          }
          default: {
            rows.sort((left, right) => compareKeys(index.sortKey, left, right));
          }
        }
      }

      return { rows, searchText: index.text };
    },
  };
}

/** The name collator. */
const NAME_COLLATOR = new Intl.Collator();

/** Order two entries by their PRE-DERIVED sort keys. */
function compareKeys(sortKey, left, right) {
  return NAME_COLLATOR.compare(sortKey.get(left.id) ?? '', sortKey.get(right.id) ?? '');
}
