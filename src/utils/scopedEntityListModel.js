/**
 * Filter and sort for the shared scoped-entity list shells (issue 1380, epic 1357).
 *
 * The world catalogues and the three system-scope rules lists render ONE composition, and this
 * is the pure half of it: given a projection's `entries`, a query, a membership filter, the
 * lane's extra filter descriptors and a sort, answer which entries the list shows and in what
 * order. It reads no Foundry global, imports nothing, and knows nothing about the DOM.
 *
 * ## WHAT IT DELIBERATELY DOES NOT OWN
 *
 * SELECTION REDUCTION IS `src/utils/bulkSelectionModel.js`. That module already exports
 * `describeBulkSelection`, `toggleBulkSelection`, `setBulkSelection`, `pruneBulkSelection` and
 * `cycleTriStateStaging`, all three per-entity bulk models re-export them, and
 * `tests/bulk-selection-model.test.js` asserts the three are identical. A fourth implementation
 * would land in the file whose whole premise is preventing a fourth implementation.
 *
 * PAGE ARITHMETIC IS `src/utils/browserPagination.js`. Its header says the arithmetic "lives
 * here once, so a third literal copy never lands", and its clamp is what stops a filter that
 * SHRINKS the list stranding the pager on an empty page. The frame composes `paginateRows` over
 * this module's output.
 *
 * MEMBERSHIP IS NOT RE-INDEXED. `worldScopeProjection.js` already joined it: every entry
 * arrives with `membershipCount` and a pre-joined `systems` row array. Indexing it again would
 * mean two sources for one number.
 *
 * ## THE TWO MEMOS, AND WHY THEY ARE THE MODULE'S REAL JOB
 *
 * Filtering and sorting a few hundred rows is cheap. Deriving a searchable string per entry, and
 * resolving one entry's row for the selected crafting system, are not — done per keystroke, per
 * comparison, or per row they are the two costs that make a 2,000-entity corpus feel broken.
 *
 * So a model instance holds exactly two caches:
 *
 *  - the SEARCH INDEX, rebuilt when `entries` or `searchOf` changes. `searchOf` is called
 *    exactly once per entry per rebuild — never per comparison, and never twice for one pass;
 *  - the SYSTEM ROW resolution, rebuilt when `entries` or `systemId` changes.
 *
 * The system-row resolution is POSITIONAL and that is the point. `buildEntry` pushes one row per
 * crafting system in the roster's order, for every entry, so the index of a `systemId` is the
 * same in every entry's array. Finding it once and then reading `entry.systems[index]` is O(N)
 * index reads across the corpus, where a `.find()` per entry is O(N x S). The read is VERIFIED
 * rather than assumed — a row whose `systemId` does not match falls back to a scan of that one
 * entry — so a projection that ever stopped emitting a uniform row order degrades to the slower
 * answer instead of a wrong one.
 *
 * ## MEMBERSHIP FILTERS ARE TWO CLOSED SETS, ONE PER SCOPE
 *
 * A world catalogue asks "is this entity in any system at all", which is `membershipCount`. A
 * system-scope rules list asks "is it in THIS system", which is the resolved row's `member`.
 * They are different questions over different data and neither answers the other, so the two
 * vocabularies are separate rather than one set with a scope-dependent meaning.
 */

/**
 * The membership filter a WORLD catalogue offers.
 *
 * `all` shows everything, `member` the entities at least one crafting system has, and `unused`
 * the ones no system has — the corpus a GM prunes.
 *
 * @type {readonly string[]}
 */
export const WORLD_MEMBERSHIP_FILTERS = Object.freeze(['all', 'member', 'unused']);

/**
 * The membership filter a SYSTEM-SCOPE rules list offers.
 *
 * `in` and `out` are about THIS system's record, which is why they are not spelled `member` and
 * `unused`: a rules list showing "out" rows is showing entities the GM can add here, not
 * entities nothing in the world uses.
 *
 * @type {readonly string[]}
 */
export const SYSTEM_MEMBERSHIP_FILTERS = Object.freeze(['all', 'in', 'out']);

/**
 * The sorts every scoped list offers before a lane adds its own.
 *
 * @type {readonly string[]}
 */
export const SCOPED_LIST_SORTS = Object.freeze(['name-asc', 'name-desc', 'systems-desc']);

/**
 * The default search string for one entry: its name and description, lowercased.
 *
 * A lane overrides it through `searchOf` when its screen searches something else as well — a
 * tool's source item, a component's tags. Exported so an override can COMPOSE with the default
 * rather than replace it and silently stop matching a name.
 *
 * @param {object} entry a projected entry.
 * @returns {string}
 */
export function defaultScopedSearchText(entry) {
  const entity = entry?.entity ?? null;
  const name = typeof entity?.name === 'string' ? entity.name : '';
  const description = typeof entity?.description === 'string' ? entity.description : '';
  return `${name} ${description}`.toLowerCase();
}

/**
 * The name a row sorts and renders under, with an id fallback.
 *
 * @param {object} entry
 * @returns {string}
 */
export function scopedEntryName(entry) {
  const name = entry?.entity?.name;
  return typeof name === 'string' && name.trim() ? name : String(entry?.id ?? '');
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

/**
 * Resolve one entry's row for `systemId`, positionally where the roster order allows it.
 *
 * @param {object} entry
 * @param {number} index the position `systemId` occupied in the probe entry's rows.
 * @param {string} systemId
 * @returns {object|null}
 */
function rowAt(entry, index, systemId) {
  const rows = asArray(entry?.systems);
  // ONE indexed read on the happy path. See the header: this is the whole difference between
  // O(N) and O(N x S) reads over the corpus.
  const candidate = index >= 0 ? rows[index] : null;
  if (candidate && candidate.systemId === systemId) return candidate;
  // The projection emits a uniform row order, so this is the degraded path rather than the
  // normal one. Kept because a wrong row is a worse failure than a slow one.
  for (const row of rows) {
    if (row?.systemId === systemId) return row;
  }
  return null;
}

/**
 * Does this entry pass the world-scope membership filter?
 *
 * @param {object} entry
 * @param {string} membership one of {@link WORLD_MEMBERSHIP_FILTERS}.
 * @returns {boolean}
 */
function passesWorldMembership(entry, membership) {
  const count = Number(entry?.membershipCount) || 0;
  if (membership === 'member') return count > 0;
  if (membership === 'unused') return count === 0;
  return true;
}

/**
 * Does this entry pass the system-scope membership filter?
 *
 * @param {object|null} systemRow the entry's row for the selected system.
 * @param {string} membership one of {@link SYSTEM_MEMBERSHIP_FILTERS}.
 * @returns {boolean}
 */
function passesSystemMembership(systemRow, membership) {
  if (membership === 'in') return systemRow?.member === true;
  if (membership === 'out') return systemRow?.member !== true;
  return true;
}

/**
 * A list model instance, owning the two memos for one mounted list.
 *
 * A FACTORY RATHER THAN MODULE STATE. Two lists can be alive in one manager session — a
 * catalogue behind a route the GM navigated away from, and the one on screen — and a shared
 * module-level cache would make one list's `entries` evict the other's on every keystroke. It
 * also makes the memo directly testable: a suite builds an instance, drives it, and counts.
 *
 * @returns {{project: (options: object) => {rows: object[], systemRows: Map<string, object|null>,
 *   searchText: Map<string, string>}}}
 */
export function createScopedEntityListModel() {
  /** @type {{entries: unknown, searchOf: unknown, text: Map<string, string>, sortKey: Map<string, string>}|null} */
  let searchCache = null;
  /** @type {{entries: unknown, systemId: string, rows: Map<string, object|null>}|null} */
  let systemRowCache = null;

  /**
   * The search string and the sort key for every entry, one `searchOf` call each.
   *
   * @param {object[]} entries
   * @param {(entry: object) => string} searchOf
   * @returns {{text: Map<string, string>, sortKey: Map<string, string>}}
   */
  function indexOf(entries, searchOf) {
    if (searchCache && searchCache.entries === entries && searchCache.searchOf === searchOf) {
      return searchCache;
    }
    const text = new Map();
    const sortKey = new Map();
    for (const entry of entries) {
      text.set(entry.id, String(searchOf(entry) ?? '').toLowerCase());
      sortKey.set(entry.id, scopedEntryName(entry).toLowerCase());
    }
    searchCache = { entries, searchOf, text, sortKey };
    return searchCache;
  }

  /**
   * Every entry's row for `systemId`, or an empty map in world scope.
   *
   * @param {object[]} entries
   * @param {string} systemId
   * @returns {Map<string, object|null>}
   */
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
      // ONE probe over ONE entry's rows decides the position; every other entry is a single
      // indexed read. See the header: this is the difference between O(N) and O(N x S).
      const probe = asArray(entries[0]?.systems);
      const index = probe.findIndex((row) => row?.systemId === systemId);
      for (const entry of entries) rows.set(entry.id, rowAt(entry, index, systemId));
    }
    systemRowCache = { entries, systemId, rows };
    return rows;
  }

  return {
    /**
     * The rows this list shows, filtered and sorted.
     *
     * @param {object} options
     * @param {object[]} [options.entries] the projection's joined entries.
     * @param {(entry: object) => string} [options.searchOf] the per-entry searchable string.
     * @param {string} [options.query] the search box's raw value.
     * @param {string} [options.membership] a member of one of the two filter vocabularies.
     * @param {string} [options.systemId] `''` in world scope; the selected system otherwise.
     * @param {Array<{id: string, matches: (entry: object, value: string, ctx: object) => boolean}>}
     *   [options.filters] the lane's extra filter descriptors.
     * @param {Record<string, string>} [options.filterValues] each extra filter's current value;
     *   `''` and `'all'` are inert.
     * @param {string} [options.sort] a member of {@link SCOPED_LIST_SORTS} or of `sorts`.
     * @param {Array<{id: string, compare: (left: object, right: object) => number}>} [options.sorts]
     *   the lane's extra sort descriptors.
     * @returns {{rows: object[], systemRows: Map<string, object|null>, searchText: Map<string, string>}}
     */
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

      const extra = asArray(sorts).find((descriptor) => descriptor?.id === sort);
      if (extra) rows.sort((left, right) => extra.compare(left, right));
      else if (sort === 'name-desc') {
        rows.sort((left, right) => compareKeys(index.sortKey, right, left));
      } else if (sort === 'systems-desc') {
        rows.sort(
          (left, right) =>
            (Number(right.membershipCount) || 0) - (Number(left.membershipCount) || 0) ||
            compareKeys(index.sortKey, left, right)
        );
      } else {
        rows.sort((left, right) => compareKeys(index.sortKey, left, right));
      }

      return { rows, systemRows, searchText: index.text };
    },
  };
}

/**
 * Order two entries by their PRE-DERIVED sort keys.
 *
 * The keys come out of the memo rather than off the entry, so a comparator never re-derives a
 * string: a name-ordered sort over a 2,000-entry corpus runs ~22,000 comparisons, and deriving
 * per comparison is the regression `npm run benchmark:performance` exists to catch.
 *
 * @param {Map<string, string>} sortKey
 * @param {object} left
 * @param {object} right
 * @returns {number}
 */
function compareKeys(sortKey, left, right) {
  const a = sortKey.get(left.id) ?? '';
  const b = sortKey.get(right.id) ?? '';
  if (a < b) return -1;
  return a > b ? 1 : 0;
}
