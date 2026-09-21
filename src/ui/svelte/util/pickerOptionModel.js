// The arithmetic behind a picker's option list: which rows survive the query, how they bucket, what
// a cursor may index and the copy that counts or replaces them (issue 1719). Pure and mount-free,
// so `tests/util/picker-option-model.test.js` is its whole test.

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
