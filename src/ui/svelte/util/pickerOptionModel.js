// The arithmetic behind a picker's option list: which rows survive the query, how they bucket, what
// a cursor may index and the copy that counts or replaces them (issue 1719), plus the async source's
// request order and the trigger snippet's spread (issue 1782). Mount-free, so
// `tests/util/picker-option-model.test.js` is its whole test.

// A leaf, but every importer's mounted harness must list this file in `rawModules`; one that does
// not throws in `before()`, or hangs, reported either way as `# cancelled` rather than `# fail`.

const UNGROUPED_BUCKET_ID = '__ungrouped';

/** The default filter: rows whose label contains the query, which arrives already trimmed and lower-cased (see `normalizedSearch`). */
export function labelSubstringFilter(options, query) {
  if (!query) return options;
  return options.filter((option) =>
    String(option.label || '')
      .toLowerCase()
      .includes(query)
  );
}

/**
 * The rows bucketed in declared-group order, each carrying the flat-order `offset` its first row
 * sits at; unknown-group and ungrouped rows land last in one unlabelled bucket, and an emptied
 * bucket disappears, and no declared group answers with no buckets.
 */
export function groupedOptionBuckets(options, groups) {
  const declared = Array.isArray(groups) ? groups.filter((group) => group?.id) : [];
  if (declared.length === 0) return [];
  const known = new Set(declared.map((group) => group.id));
  const buckets = declared.map((group) => ({
    id: group.id,
    label: group.label || '',
    options: options.filter((option) => option.group === group.id),
  }));
  const ungrouped = options.filter((option) => !known.has(option.group));
  if (ungrouped.length > 0) {
    buckets.push({ id: UNGROUPED_BUCKET_ID, label: '', options: ungrouped });
  }
  let offset = 0;
  return buckets
    .filter((bucket) => bucket.options.length > 0)
    .map((bucket) => {
      const positioned = { ...bucket, offset };
      offset += bucket.options.length;
      return positioned;
    });
}

/** The order the rows render in, which is what every cursor index counts along. */
export function renderedOptionOrder(buckets, options) {
  return buckets.length > 0 ? buckets.flatMap((bucket) => bucket.options) : options;
}

/** The stamp a cursor position is recorded against; it moves whenever the rows can have changed. */
export function optionListGeneration({ open, query, options }) {
  return [
    open ? 'open' : 'closed',
    query,
    options.length,
    options[0]?.id ?? '',
    options.at(-1)?.id ?? '',
  ].join('/');
}

/** Where the cursor is now, or -1 when its stamp is stale or its position is past the end. */
export function activeCursorIndex(cursor, generation, count) {
  return cursor?.generation === generation && cursor.index < count ? cursor.index : -1;
}

/** The chosen ids as a set, and only in `multiple` mode — the scalar mode compares one id instead. */
export function selectedOptionIds(value, multiple) {
  if (!multiple) return new Set();
  return new Set(Array.isArray(value) ? value : [value]);
}

/** The caller's count template with this pass's numbers in it, so its words stay the caller's. */
export function filteredCountLabel(template, matched, total) {
  return String(template).replace('{matched}', String(matched)).replace('{total}', String(total));
}

/** A list holding nothing takes the caller's hint and detail; a list the query emptied takes the no-matches line and no detail. */
export function pickerEmptiness({ total, matched, noMatchesText, emptyHint, emptyDetail }) {
  const filteredToNothing = total > 0 && matched === 0;
  return {
    message: filteredToNothing ? noMatchesText : emptyHint,
    body: filteredToNothing ? '' : emptyDetail,
  };
}

/** The state an async `source` starts each panel session from: no rows yet, and pending. */
export const PENDING_SOURCE = Object.freeze({ rows: [], total: 0, pending: true, failed: false });

/** A refinement's state: the rows and total the last answer settled stay listed, marked pending. */
export function refiningSource(state) {
  return { ...state, pending: true, failed: false };
}

/**
 * A runner that settles only its LATEST request: `run(source, query, settle)` calls
 * `source(query)` and hands `settle` the source state it resolved to, while a request that an
 * earlier call started and a later call overtook settles nothing, however late it arrives; a call
 * with no source starts nothing and so only retires every request still out.
 */
export function latestSourceRequest() {
  let latest = 0;
  return (source, query, settle) => {
    const ticket = ++latest;
    if (!source) return;
    Promise.resolve()
      .then(() => source(query))
      .then(
        (result) => ticket === latest && settle(sourceRows(result)),
        () => ticket === latest && settle({ rows: [], total: 0, pending: false, failed: true })
      );
  };
}

/** A source's answer, an array or `{ options, total }`, as settled rows and the total they match within. */
export function sourceRows(result) {
  const rows = Array.isArray(result) ? result : (result?.options ?? []);
  const total = Number.isFinite(result?.total) ? result.total : rows.length;
  return { rows: Array.isArray(rows) ? rows : [], total, pending: false, failed: false };
}

/**
 * The panel's one status: an error replaces the list, a wait replaces it only while no row is
 * listed and otherwise marks the listed rows `refining`, and a settled list has none.
 */
export function pickerStatus({ failed, pending, rowCount, errorText, loadingText }) {
  if (failed) return { kind: 'error', text: errorText, replacesList: true };
  if (!pending) return null;
  if (rowCount > 0) return { kind: 'refining', text: '', replacesList: false };
  return { kind: 'loading', text: loadingText, replacesList: true };
}

/**
 * The rows a panel lists, the total they match within and its one status: a `source`'s settled
 * answer or `options` through `filterOptions`, and no row at all while a status replaces the list,
 * so a row the panel is not showing can be neither chosen nor pointed at.
 */
export function listedOptions(state) {
  const { source, remote, options, error, errorText, loadingText } = state;
  const sourced = Boolean(source);
  const rows = sourced ? remote.rows : state.filterOptions(options, state.query);
  const candidates = Array.isArray(rows) ? rows : [];
  const status = pickerStatus({
    failed: Boolean(error) || (sourced && remote.failed),
    pending: Boolean(state.loading) || (sourced && remote.pending),
    rowCount: candidates.length,
    errorText: error || errorText,
    loadingText,
  });
  return {
    rows: status?.replacesList ? [] : candidates,
    total: sourced ? remote.total : options.length,
    status,
  };
}

const CALLER_OWNED_TRIGGER_KEYS = new Set(['disabled', 'aria-disabled']);

/** The trigger attributes a `trigger` snippet may spread: no undefined value and no disabled pair, so the spread adds and never subtracts. */
export function spreadableTriggerAttributes(attributes) {
  const spreadable = {};
  for (const [key, value] of Object.entries(attributes)) {
    if (value === undefined || CALLER_OWNED_TRIGGER_KEYS.has(key)) continue;
    spreadable[key] = value;
  }
  return spreadable;
}

/** What moving a membership from `before` to `after` adds and removes, each in its own list's order. */
export function membershipChange(before, after) {
  return {
    added: after.filter((id) => !before.includes(id)),
    removed: before.filter((id) => !after.includes(id)),
  };
}

/** A staged change laid over the live membership, so a member that changed under it is kept. */
export function stagedMembership(members, { added, removed }) {
  return [
    ...members.filter((id) => !removed.includes(id)),
    ...added.filter((id) => !members.includes(id)),
  ];
}
