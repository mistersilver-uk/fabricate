/**
 * Filter and sort for the shared scoped-entity list shells (issue 1380, epic 1357): the pure half
 * answering which projected entries a list shows and in what order, reading no Foundry global.
 * Selection reduction stays in `bulkSelectionModel.js` and page arithmetic in
 * `browserPagination.js`. Its real job is two memos — the per-entry search index and the POSITIONAL
 * system-row resolution, verified per read so a projection that stopped emitting a uniform row
 * order degrades to a scan rather than a wrong answer. Membership vocabularies are closed per scope.
 */

/** The membership filter a WORLD catalogue offers. */
export const WORLD_MEMBERSHIP_FILTERS = Object.freeze(['all', 'member', 'unused']);

/** The membership filter a SYSTEM-SCOPE rules list offers. */
export const SYSTEM_MEMBERSHIP_FILTERS = Object.freeze(['all', 'in', 'out']);

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

/** Resolve one entry's row for `systemId`, positionally where the roster order allows it. */
function rowAt(entry, index, systemId) {
  const rows = asArray(entry?.systems);
  // ONE indexed read on the happy path.
  const candidate = index >= 0 ? rows[index] : null;
  if (candidate && candidate.systemId === systemId) return candidate;
  // The projection emits a uniform row order, so this is the degraded path rather than the normal
  // one.
  for (const row of rows) {
    if (row?.systemId === systemId) return row;
  }
  return null;
}

/** Does this entry pass the world-scope membership filter? */
function passesWorldMembership(entry, membership) {
  const count = Number(entry?.membershipCount) || 0;
  if (membership === 'member') return count > 0;
  if (membership === 'unused') return count === 0;
  return true;
}

/** Does this entry pass the system-scope membership filter? */
function passesSystemMembership(systemRow, membership) {
  if (membership === 'in') return systemRow?.member === true;
  if (membership === 'out') return systemRow?.member !== true;
  return true;
}

/** A list model instance, owning the two memos for one mounted list. */
export function createScopedEntityListModel() {
  let searchCache = null;
  let systemRowCache = null;

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

  /** Every entry's row for `systemId`, or an empty map in world scope. */
  function systemRowsOf(entries, systemId) {
    if (
      systemRowCache &&
      systemRowCache.entries === entries &&
      systemRowCache.systemId === systemId
    ) {
      return systemRowCache.rows;
    }
    const rows = new Map();
    if (systemId) {
      // ONE probe over ONE entry's rows decides the position; every other entry is a single indexed
      // read.
      const probe = asArray(entries[0]?.systems);
      const index = probe.findIndex((row) => row?.systemId === systemId);
      for (const entry of entries) rows.set(entry.id, rowAt(entry, index, systemId));
    }
    systemRowCache = { entries, systemId, rows };
    return rows;
  }

  return {
    /** The rows this list shows, filtered and sorted. */
    project({
      entries = [],
      searchOf = defaultScopedSearchText,
      query = '',
      membership = 'all',
      systemId = '',
      filters = [],
      filterValues = {},
      sort = 'name-asc',
      sorts = [],
    } = {}) {
      const all = asArray(entries);
      const index = indexOf(all, searchOf);
      const systemRows = systemRowsOf(all, systemId);
      const needle = String(query ?? '')
        .trim()
        .toLowerCase();
      const activeFilters = asArray(filters).filter((filter) => {
        const value = filterValues?.[filter?.id];
        return typeof value === 'string' && value !== '' && value !== 'all';
      });

      const rows = all.filter((entry) => {
        if (needle && !(index.text.get(entry.id) ?? '').includes(needle)) return false;
        const systemRow = systemRows.get(entry.id) ?? null;
        if (systemId) {
          if (!passesSystemMembership(systemRow, membership)) return false;
        } else if (!passesWorldMembership(entry, membership)) return false;
        for (const filter of activeFilters) {
          if (!filter.matches(entry, filterValues[filter.id], { systemId, systemRow }))
            return false;
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

      return { rows, systemRows, searchText: index.text };
    },
  };
}

/** The name collator. */
const NAME_COLLATOR = new Intl.Collator();

/** Order two entries by their PRE-DERIVED sort keys. */
function compareKeys(sortKey, left, right) {
  return NAME_COLLATOR.compare(sortKey.get(left.id) ?? '', sortKey.get(right.id) ?? '');
}
