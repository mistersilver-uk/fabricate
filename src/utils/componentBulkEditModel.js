/**
 * Pure selection + staging model for the GM component browser's bulk edit (issue 772).
 *
 * A sibling of `componentBrowserModel.js`, and here for the same reason it is: `src/ui/**`
 * is not covered by the ESLint/Prettier globs, so a module there can be lint-green and
 * Sonar-red. Nothing in this file touches Foundry globals, the store, or localization —
 * the panel and the toolbar localize, and the admin store persists. Everything that can
 * be reasoned about without a DOM lives here; the Svelte surfaces are wiring.
 *
 * Two shapes travel together and must not be confused:
 *
 * - the SELECTION, a `Set` of component ids the browser owns as lifted view state;
 * - the DRAFT, the staged-but-unwritten edit the inspector rail's panel owns.
 *
 * Nothing here mutates its input. Every draft helper returns a NEW draft and every
 * selection helper returns a NEW `Set` — the Svelte side propagates on reference change,
 * exactly as `collapsedCategories` already documents.
 *
 * Category and tags carry a natural empty sentinel, so their staging is derivable from
 * the value. Essences and difficulty do not (`{}` and `0` are both meaningful values), so
 * those two axes carry an explicit `…Staged` flag: the flag is the axis's opt-in to the
 * write, not a second kind of state. A staged, all-zero essence map is a real edit
 * meaning "clear essences on every selected component", so emptiness must NEVER be read
 * as "no change" anywhere downstream of `toBulkComponentEdit`.
 */

/**
 * @typedef {object} ComponentBulkDraft
 * @property {string} category the staged category; `''` is the `Leave unchanged` sentinel.
 * @property {string[]} tagAdd tags staged for addition.
 * @property {string[]} tagRemove tags staged for removal; disjoint from `tagAdd`.
 * @property {boolean} essencesStaged whether the essence axis participates in the write.
 * @property {Record<string, number>} essences the staged whole-map replacement.
 * @property {boolean} difficultyStaged whether the progressive-DC axis participates.
 * @property {number} difficulty the staged progressive DC, 0..35; 0 CLEARS.
 */

/** The shipped component-editor clamp (`<Stepper min={0} max={35}>`), mirrored here. */
const DIFFICULTY_MIN = 0;
const DIFFICULTY_MAX = 35;

/**
 * Coerce an essence quantity to a non-negative integer.
 *
 * The write primitive's `_normalizeEssenceQuantities` coerces with a bare `Number()` and
 * does NOT floor, so truncation is this model's job — otherwise a fractional quantity
 * would reach persisted data.
 */
function clampQuantity(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.trunc(numeric));
}

/** Coerce a staged progressive DC into the shipped editor's 0..35 integer range. */
function clampDifficulty(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return DIFFICULTY_MIN;
  return Math.min(DIFFICULTY_MAX, Math.max(DIFFICULTY_MIN, Math.trunc(numeric)));
}

/** A de-duplicated list of non-empty tag names, order-preserving. */
function tagList(value) {
  const names = (Array.isArray(value) ? value : []).map((tag) => String(tag ?? '')).filter(Boolean);
  return [...new Set(names)];
}

/** A de-duplicated list of non-empty ids from an array, `Set`, or any other iterable. */
function idList(value) {
  if (!value || typeof value === 'string') return [];
  const source = Array.isArray(value) ? value : [...value];
  return [...new Set(source.map((id) => String(id ?? '')).filter(Boolean))];
}

/** A well-formed `{ essenceId: quantity }` map from arbitrary input. */
function essenceMap(value) {
  const output = {};
  if (!value || typeof value !== 'object') return output;
  for (const [rawId, rawQuantity] of Object.entries(value)) {
    const id = String(rawId || '').trim();
    if (id) output[id] = clampQuantity(rawQuantity);
  }
  return output;
}

/**
 * Read arbitrary input as a well-formed draft, so every export below is total and none of
 * them has to re-guard its input.
 *
 * `tagAdd` wins over `tagRemove` on collision: the never-both-states invariant is
 * structural here rather than merely a property of the cycle, so a draft that arrived
 * from anywhere else can never stage one tag as both.
 */
function readDraft(draft) {
  const source = draft && typeof draft === 'object' ? draft : {};
  const tagAdd = tagList(source.tagAdd);
  return {
    category: typeof source.category === 'string' ? source.category : '',
    tagAdd,
    tagRemove: tagList(source.tagRemove).filter((tag) => !tagAdd.includes(tag)),
    essencesStaged: source.essencesStaged === true,
    essences: essenceMap(source.essences),
    difficultyStaged: source.difficultyStaged === true,
    difficulty: clampDifficulty(source.difficulty),
  };
}

/**
 * A fresh, wholly unstaged draft.
 *
 * Always a NEW object with NEW collections — the manager root holds one per selection and
 * discards it when the selection empties, so a shared singleton would leak one bulk edit
 * into the next.
 *
 * @returns {ComponentBulkDraft}
 */
export function createComponentBulkDraft() {
  return {
    category: '',
    tagAdd: [],
    tagRemove: [],
    essencesStaged: false,
    essences: {},
    difficultyStaged: false,
    difficulty: 0,
  };
}

/**
 * Advance one tag through the three-state machine: `none -> add -> remove -> none`.
 *
 * The prototype's `cycleBulkTag` verbatim. A tag is never simultaneously staged for
 * addition and removal, which is what lets the write primitive apply `removeTags` after
 * `addTags` without the collision ever being reachable from the UI.
 *
 * @param {ComponentBulkDraft} draft
 * @param {string} tag
 * @returns {ComponentBulkDraft} a NEW draft; the input is not mutated.
 */
export function cycleBulkTag(draft, tag) {
  const next = readDraft(draft);
  const name = String(tag ?? '');
  if (!name) return next;

  if (next.tagAdd.includes(name)) {
    return {
      ...next,
      tagAdd: next.tagAdd.filter((entry) => entry !== name),
      tagRemove: [...next.tagRemove, name],
    };
  }
  if (next.tagRemove.includes(name)) {
    return { ...next, tagRemove: next.tagRemove.filter((entry) => entry !== name) };
  }
  return { ...next, tagAdd: [...next.tagAdd, name] };
}

/**
 * Stage a single-valued, overwriting category. `''` is the `Leave unchanged` sentinel.
 *
 * The value is stored verbatim rather than trimmed, because the panel's `<select>` binds
 * to it and matches an option by exact string; a whitespace-only value is treated as
 * unset by `bulkDraftHasChanges` and `toBulkComponentEdit` instead.
 *
 * @param {ComponentBulkDraft} draft
 * @param {string} category
 * @returns {ComponentBulkDraft} a NEW draft; the input is not mutated.
 */
export function setBulkCategory(draft, category) {
  return { ...readDraft(draft), category: String(category ?? '') };
}

/**
 * Stage an absolute quantity for one essence, clamped at 0 and truncated, and STAGE the
 * essence axis — matching the prototype's `bumpBulkEss`, which arms `essOn` on every touch.
 *
 * @param {ComponentBulkDraft} draft
 * @param {string} essenceId
 * @param {number} quantity
 * @returns {ComponentBulkDraft} a NEW draft; the input is not mutated.
 */
export function setBulkEssence(draft, essenceId, quantity) {
  const next = readDraft(draft);
  const id = String(essenceId ?? '').trim();
  if (!id) return next;
  return {
    ...next,
    essences: { ...next.essences, [id]: clampQuantity(quantity) },
    essencesStaged: true,
  };
}

/**
 * Nudge one essence by a delta, clamped at 0 and truncated, and STAGE the essence axis.
 *
 * Note this is not the only way to stage the axis, and cannot be: `Stepper` never emits a
 * no-op, so on a fresh draft (every essence 0) the steppers can only stage the axis via a
 * bump up and back down. `toggleBulkEssencesStaged` is the direct affordance.
 *
 * @param {ComponentBulkDraft} draft
 * @param {string} essenceId
 * @param {number} delta
 * @returns {ComponentBulkDraft} a NEW draft; the input is not mutated.
 */
export function adjustBulkEssence(draft, essenceId, delta) {
  const next = readDraft(draft);
  const id = String(essenceId ?? '').trim();
  if (!id) return next;
  const step = Number(delta);
  const current = next.essences[id] || 0;
  return setBulkEssence(next, id, current + (Number.isFinite(step) ? Math.trunc(step) : 0));
}

/**
 * Arm or disarm the essence axis without touching the staged values.
 *
 * Disarming keeps the map, so re-arming restores what the GM staged; the axis flag is the
 * opt-in to the write, not a second copy of the value.
 *
 * @param {ComponentBulkDraft} draft
 * @returns {ComponentBulkDraft} a NEW draft; the input is not mutated.
 */
export function toggleBulkEssencesStaged(draft) {
  const next = readDraft(draft);
  return { ...next, essencesStaged: !next.essencesStaged };
}

/**
 * Arm or disarm the progressive-DC axis.
 *
 * Arming an untouched draft leaves `difficulty` at its seeded `0`, so the panel shows a
 * `0` stepper the moment the axis is staged and "staged but untouched" is never a silent
 * clear — the write primitive treats `0`, `null` and `''` identically as CLEAR.
 *
 * @param {ComponentBulkDraft} draft
 * @returns {ComponentBulkDraft} a NEW draft; the input is not mutated.
 */
export function toggleBulkDifficultyStaged(draft) {
  const next = readDraft(draft);
  return { ...next, difficultyStaged: !next.difficultyStaged };
}

/**
 * Stage a progressive DC, clamped to 0..35, and STAGE the axis. `0` clears the value on
 * every selected component.
 *
 * @param {ComponentBulkDraft} draft
 * @param {number} value
 * @returns {ComponentBulkDraft} a NEW draft; the input is not mutated.
 */
export function setBulkDifficulty(draft, value) {
  return { ...readDraft(draft), difficulty: clampDifficulty(value), difficultyStaged: true };
}

/**
 * Whether anything at all is staged — the prototype's `anyChange`, and the enablement
 * condition for `Apply to {N} component(s)`.
 *
 * A REMOVAL-ONLY draft counts: a tag cycled straight to `remove` is a real edit the chip
 * run can stage on its own, and reading only `tagAdd` here would leave Apply inert for it.
 *
 * @param {ComponentBulkDraft} draft
 * @returns {boolean}
 */
export function bulkDraftHasChanges(draft) {
  const next = readDraft(draft);
  return Boolean(
    next.category.trim() ||
    next.tagAdd.length > 0 ||
    next.tagRemove.length > 0 ||
    next.essencesStaged ||
    next.difficultyStaged
  );
}

/**
 * Project the draft onto the `edit` object the set-apply write primitive takes.
 *
 * The `essences` key is present IF AND ONLY IF `essencesStaged`, and `difficulty` IF AND
 * ONLY IF `difficultyStaged`. That is the whole point of the two flags: `{}` and `0` are
 * both real instructions ("clear essences", "clear the DC"), so the primitive's no-op
 * guard tests key PRESENCE rather than truthiness, and this projection must give it
 * something to test. An unstaged axis is never sent.
 *
 * Zero quantities are emitted verbatim rather than filtered out: `_normalizeEssenceQuantities`
 * drops non-positive quantities, so `{fire: 0}` and `{}` reach persisted data identically,
 * and passing what the GM staged keeps the two sides honest.
 *
 * @param {ComponentBulkDraft} draft
 * @returns {{category?: string, addTags?: string[], removeTags?: string[], essences?: Record<string, number>, difficulty?: number}}
 */
export function toBulkComponentEdit(draft) {
  const next = readDraft(draft);
  const edit = {};
  if (next.category.trim()) edit.category = next.category;
  if (next.tagAdd.length > 0) edit.addTags = [...next.tagAdd];
  if (next.tagRemove.length > 0) edit.removeTags = [...next.tagRemove];
  if (next.essencesStaged) edit.essences = { ...next.essences };
  if (next.difficultyStaged) edit.difficulty = next.difficulty;
  return edit;
}

/**
 * How many of the selected components would have an AUTHORED essence value CHANGED or
 * REMOVED if the staged map were applied — the count the conditional overwrite warning
 * names, per `openspec/specs/ui-integration/spec.md` Component Studio requirement 10.
 *
 * The rule is deliberately wide rather than "would lose value". Overwriting a GM's
 * hand-tuned `3` with a `5` destroys that authored `3` just as surely as a `0` does, so a
 * bulk set of one essence across a dozen individually-tuned components deserves the same
 * warning as a bulk clear. The permanent sub-hint already says that applying essences
 * overwrites every selected component; this count's job is to say how many of them
 * actually carry authored values in the blast radius.
 *
 * Only AUTHORED entries are compared, so a component with no essences at all is never
 * counted (the staged map purely ADDS to it, destroying nothing), and neither is a
 * component whose every authored quantity survives the overwrite unchanged.
 *
 * Reads the PROJECTED `itemCards[].essences` ARRAY (`[{id, quantity}]`), never the
 * persisted map — the map shape only ever reaches the write primitive — so this stays
 * pure and testable over the same rows the browser renders.
 *
 * @param {{essences?: {id: string, quantity: number}[]}[]} selectedCards
 * @param {Record<string, number>} stagedEssences
 * @returns {number}
 */
export function countComponentsChangingEssences(selectedCards, stagedEssences) {
  const staged = essenceMap(stagedEssences);
  const rows = Array.isArray(selectedCards) ? selectedCards : [];
  return rows.filter((row) => {
    const authored = Array.isArray(row?.essences) ? row.essences : [];
    return authored.some((essence) => {
      const id = String(essence?.id || '').trim();
      const quantity = clampQuantity(essence?.quantity);
      return Boolean(id) && quantity > 0 && (staged[id] || 0) !== quantity;
    });
  }).length;
}

/**
 * Describe the selection for the toolbar.
 *
 * `pageSelectionState` is computed over the RENDERED row ids — which is `page.components`
 * flat, and the union of the NON-COLLAPSED groups' components when grouping is on — while
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
export function describeComponentSelection(selection = {}) {
  const pageIds = idList(selection.pageIds);
  const filteredIds = idList(selection.filteredIds);
  const selectedIds = new Set(idList(selection.selectedIds));

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
export function toggleComponentSelection(selectedIds, id) {
  const next = new Set(idList(selectedIds));
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
export function setComponentSelection(selectedIds, ids, on = true) {
  const next = new Set(idList(selectedIds));
  for (const id of idList(ids)) {
    if (on) next.add(id);
    else next.delete(id);
  }
  return next;
}

/**
 * Drop every selected id that no longer resolves to a component.
 *
 * A delete, an unlink or a search change must never leave a phantom id in the count or in
 * an `Apply`; the browser runs this against the current `itemCards` ids.
 *
 * @param {Set<string> | string[]} selectedIds
 * @param {string[]} knownIds
 * @returns {Set<string>} a NEW `Set`; the input is not mutated.
 */
export function pruneComponentSelection(selectedIds, knownIds) {
  const known = new Set(idList(knownIds));
  return new Set(idList(selectedIds).filter((id) => known.has(id)));
}
