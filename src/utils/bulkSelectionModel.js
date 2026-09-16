/**
 * The pure, row-agnostic selection model shared by the GM manager's bulk-edit browsers (issues 772
 * and 1010), extracted so the second studio is not the copy SonarCloud's new-code duplication gate
 * counts. Only the SELECTION is one concept; the staged drafts stay per-studio mirrors.
 * `cycleTriStateStaging` is here for the same duplication reason — it is the leave → add → remove
 * machine, parameterised on two list keys and ignorant of the nouns. It imports NOTHING, because
 * every mounted-Svelte suite naming it inherits its closure, and every helper returns a NEW `Set`.
 */

/** The Status axis's three segments, in every panel's segmented-control order. */
export const BULK_STATUS_VALUES = Object.freeze(['unchanged', 'enable', 'disable']);

/** Read arbitrary input as one of the three status segments. */
export function normalizeBulkStatus(value) {
  return BULK_STATUS_VALUES.includes(value) ? value : 'unchanged';
}

/** A de-duplicated list of non-empty ids from an array, `Set`, or any other iterable. */
export function normalizeSelectionIds(value) {
  if (!value || typeof value === 'string') return [];
  const source = Array.isArray(value) ? value : [...value];
  return [...new Set(source.map((id) => String(id ?? '').trim()).filter(Boolean))];
}

/** Describe the selection for the toolbar. */
export function describeBulkSelection(selection = {}) {
  const pageIds = normalizeSelectionIds(selection.pageIds);
  const filteredIds = normalizeSelectionIds(selection.filteredIds);
  const selectedIds = new Set(normalizeSelectionIds(selection.selectedIds));

  const selectedOnPage = pageIds.filter((id) => selectedIds.has(id)).length;
  let pageSelectionState = 'none';
  if (pageIds.length > 0 && selectedOnPage === pageIds.length) pageSelectionState = 'all';
  else if (selectedOnPage > 0) pageSelectionState = 'some';

  const allFilteredSelected =
    filteredIds.length > 0 && filteredIds.every((id) => selectedIds.has(id));

  return {
    count: selectedIds.size,
    pageSelectionState,
    showSelectAllResults: filteredIds.length > pageIds.length && !allFilteredSelected,
    selectAllResultsCount: filteredIds.length,
  };
}

/** Add or drop one id. */
export function toggleBulkSelection(selectedIds, id) {
  const next = new Set(normalizeSelectionIds(selectedIds));
  const name = String(id ?? '');
  if (!name) return next;
  if (next.has(name)) next.delete(name);
  else next.add(name);
  return next;
}

/**
 * Select or clear a whole run of ids in one pass — the page control and the `Select all {N}
 * results` link.
 */
export function setBulkSelection(selectedIds, ids, on = true) {
  const next = new Set(normalizeSelectionIds(selectedIds));
  for (const id of normalizeSelectionIds(ids)) {
    if (on) next.add(id);
    else next.delete(id);
  }
  return next;
}

/** Drop every selected id that no longer resolves to a row. */
export function pruneBulkSelection(selectedIds, knownIds) {
  const known = new Set(normalizeSelectionIds(knownIds));
  return new Set(normalizeSelectionIds(selectedIds).filter((id) => known.has(id)));
}

/**
 * Advance one value through the tri-state staging machine `none -> add -> remove -> none` over a
 * draft's two disjoint list fields.
 */
export function cycleTriStateStaging(draft, value, { addKey, removeKey }) {
  const source = draft && typeof draft === 'object' ? draft : {};
  const staged = Array.isArray(source[addKey]) ? source[addKey] : [];
  const unstaged = Array.isArray(source[removeKey]) ? source[removeKey] : [];
  const name = String(value ?? '');
  if (!name) return { ...source };

  if (staged.includes(name)) {
    return {
      ...source,
      [addKey]: staged.filter((entry) => entry !== name),
      [removeKey]: [...unstaged, name],
    };
  }
  if (unstaged.includes(name)) {
    return { ...source, [removeKey]: unstaged.filter((entry) => entry !== name) };
  }
  return { ...source, [addKey]: [...staged, name] };
}
