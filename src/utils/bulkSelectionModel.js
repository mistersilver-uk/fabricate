/**
 * The pure, row-agnostic selection model shared by the GM manager's bulk edit browsers
 * (issues 772 and 1010).
 *
 * Extracted verbatim from `componentBulkEditModel.js`, where it shipped first for the
 * Component Studio. The Recipe Studio's bulk edit needs the identical semantics over
 * recipe ids, and a second copy would be a copy: SonarCloud fails the new-code duplication
 * gate above 3%, and `sonar.cpd.exclusions` is inert under Automatic Analysis, so the
 * duplicate would count in `src/` and in `tests/` alike. `componentBulkEditModel.js` keeps
 * re-exporting these under its original `…ComponentSelection` names, so no call site
 * changed when they moved.
 *
 * A selection is a `Set` of row ids the browser owns as lifted view state. The STAGED
 * DRAFT — what the inspector rail's panel holds — is deliberately NOT here: the component
 * and recipe axes have nothing in common, so those two models are mirrors of each other
 * rather than sharers of one thing. Only the selection is genuinely one concept.
 *
 * The one exception is `cycleTriStateStaging`, which is here for the same duplication
 * reason the selection helpers are. It is not a draft model: it is the leave → add →
 * remove → leave MACHINE, parameterised on the two list keys it advances, and it knows
 * nothing about what those lists stage. The Component Studio's tag run and the Recipe
 * Studio's recipe-book run are the identical machine over different nouns, and a second
 * literal copy of it is exactly the ~16 duplicated lines the Sonar new-code duplication
 * gate exists to refuse.
 *
 * Nothing in this module touches Foundry globals, the store, localization, or a DOM, and
 * it imports nothing at all. That leaf status is load-bearing beyond tidiness: every
 * mounted-Svelte suite naming `componentBulkEditModel.js` must now name this file too, and
 * an import added here would propagate into all of those lists.
 *
 * Every helper is immutable and returns a NEW `Set` — the Svelte side propagates on
 * reference change, exactly as `collapsedCategories` already documents.
 */

/**
 * A de-duplicated list of non-empty ids from an array, `Set`, or any other iterable.
 *
 * A coercion rather than a getter, and the one every export below funnels its inputs
 * through, so each of them is total and none has to re-guard its own arguments. A bare
 * string is rejected rather than spread, since spreading one yields its characters and a
 * single id passed where a list was expected would silently become several.
 *
 * @param {Set<string> | string[] | Iterable<string> | undefined} value
 * @returns {string[]}
 */
export function normalizeSelectionIds(value) {
  if (!value || typeof value === 'string') return [];
  const source = Array.isArray(value) ? value : [...value];
  return [...new Set(source.map((id) => String(id ?? '')).filter(Boolean))];
}

/**
 * Describe the selection for the toolbar.
 *
 * `pageSelectionState` is computed over the RENDERED row ids — which is the current page
 * flat, and the union of the NON-COLLAPSED groups' rows when grouping is on — while
 * `showSelectAllResults` covers ALL filtered rows. They are two distinct actions and this
 * model keeps them distinct, exactly as the prototype does: the page control's job is the
 * rows the GM can see, and the results link's job is to reach the ones it cannot.
 *
 * An EMPTY page is `'none'`, never `'all'`. `[].every()` returns `true`, which would paint
 * a checked page box over a no-results search; the same trap is guarded on the filtered
 * set, so an empty result never suppresses the link by claiming it is fully selected.
 *
 * `count` is the WHOLE selection, not its intersection with the page: a selection made on
 * page 1 survives paging and must still be counted in `Apply to {N}`.
 *
 * @param {{pageIds?: string[], filteredIds?: string[], selectedIds?: Set<string> | string[]}} selection
 * @returns {{count: number, pageSelectionState: 'all' | 'some' | 'none', showSelectAllResults: boolean, selectAllResultsCount: number}}
 */
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

/**
 * Add or drop one id.
 *
 * @param {Set<string> | string[]} selectedIds
 * @param {string} id
 * @returns {Set<string>} a NEW `Set`; the input is not mutated.
 */
export function toggleBulkSelection(selectedIds, id) {
  const next = new Set(normalizeSelectionIds(selectedIds));
  const name = String(id ?? '');
  if (!name) return next;
  if (next.has(name)) next.delete(name);
  else next.add(name);
  return next;
}

/**
 * Select or clear a whole run of ids in one pass — the page control and the
 * `Select all {N} results` link.
 *
 * @param {Set<string> | string[]} selectedIds
 * @param {string[]} ids
 * @param {boolean} [on]
 * @returns {Set<string>} a NEW `Set`; the input is not mutated.
 */
export function setBulkSelection(selectedIds, ids, on = true) {
  const next = new Set(normalizeSelectionIds(selectedIds));
  for (const id of normalizeSelectionIds(ids)) {
    if (on) next.add(id);
    else next.delete(id);
  }
  return next;
}

/**
 * Drop every selected id that no longer resolves to a row.
 *
 * A delete, an unlink or a search change must never leave a phantom id in the count or in
 * an `Apply`; each browser runs this against its current projected row ids.
 *
 * @param {Set<string> | string[]} selectedIds
 * @param {string[]} knownIds
 * @returns {Set<string>} a NEW `Set`; the input is not mutated.
 */
export function pruneBulkSelection(selectedIds, knownIds) {
  const known = new Set(normalizeSelectionIds(knownIds));
  return new Set(normalizeSelectionIds(selectedIds).filter((id) => known.has(id)));
}

/**
 * Advance one value through the tri-state staging machine `none -> add -> remove -> none`
 * over a draft's two disjoint list fields.
 *
 * The one DRAFT-shaped thing the two studios genuinely share (see the header): the
 * Component Studio stages tags on `tagAdd`/`tagRemove` and the Recipe Studio stages
 * recipe-book membership on `bookAdd`/`bookRemove`, and the state machine between them is
 * the same one. Parameterising it on the two key names keeps one implementation, so the
 * two runs cannot drift and neither costs the Sonar duplication budget.
 *
 * The invariant this exists to hold is that a value is NEVER simultaneously staged for
 * addition and for removal — which is what lets a write primitive apply its removals after
 * its additions without the collision ever being reachable from the UI.
 *
 * It deliberately does NOT normalize the draft it is handed: each model owns its own
 * `readDraft`, which knows the rest of that model's axes, and normalizes BEFORE calling
 * here. This function reads only the two named lists, so it stays total over whatever else
 * the draft carries and never has to know about it.
 *
 * @param {object} draft an ALREADY-normalized draft carrying both list fields.
 * @param {string} value the value to advance; a blank one is a no-op.
 * @param {{addKey: string, removeKey: string}} keys the draft's two list field names.
 * @returns {object} a NEW draft; the input is not mutated.
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
