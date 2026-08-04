/**
 * Pure staging model for the GM recipe browser's bulk edit (issue 1010).
 *
 * The deliberate mirror of `componentBulkEditModel.js`, and here for the same reason it
 * is: `src/ui/**` is not covered by the ESLint/Prettier globs, so a module there can be
 * lint-green and Sonar-red. Nothing in this file touches Foundry globals, the store, or
 * localization — the panel and the toolbar localize, and the admin store persists.
 * Everything that can be reasoned about without a DOM lives here; the Svelte surfaces are
 * wiring.
 *
 * A MIRROR, not a shared model. Only the SELECTION half is genuinely one concept across
 * the two studios, and it lives in the row-agnostic `bulkSelectionModel.js`; the four
 * selection helpers are re-exported at the foot of this file under `…RecipeSelection`
 * names so the recipe surfaces import one module. The staged DRAFT halves share nothing:
 * a component stages category / tags / essences / difficulty, a recipe stages category /
 * status / lock / check tier / recipe-book membership. The one exception is the tri-state
 * leave → add → remove → leave machine, which is a machine over two list keys rather than
 * a model, and which `cycleBulkRecipeBook` therefore delegates to the shared
 * `cycleTriStateStaging` instead of re-implementing.
 *
 * Nothing here mutates its input. Every helper returns a NEW draft — the Svelte side
 * propagates on reference change, exactly as `collapsedCategories` already documents.
 *
 * ## Why ONLY the check tier carries a `…Staged` flag
 *
 * Four of the five axes carry a natural sentinel, so their staging is derivable from the
 * value alone:
 *
 * - Category: `normalizeRecipeCategory` maps `''` to the literal `'general'`
 *   (`recipeCategories.js`), so `''` is unreachable as a persisted value and is free to
 *   mean `Leave unchanged` here.
 * - Status and Lock carry their sentinel IN the enum (`'unchanged'`).
 * - Recipe books are two disjoint lists, and emptiness on both is unambiguous. A
 *   REMOVAL-ONLY draft is a real edit, so `bulkRecipeDraftHasChanges` reads both lists or
 *   Apply goes inert for it.
 *
 * The check tier cannot, and the reason is precise enough to be worth stating exactly,
 * because it is easy to state loosely and wrong. The draft's `''`
 * (`RECIPE_CHECK_TIER_UNCHANGED`) is a DRAFT-LOCAL sentinel with no relation whatsoever to
 * the persisted `checkTierId` field. The flag is not needed to disambiguate the draft — it
 * is needed because the EDIT OBJECT `toBulkRecipeEdit` produces must distinguish an ABSENT
 * `checkTierId` key ("leave every selected recipe's tier alone") from a PRESENT
 * `checkTierId: null` ("clear every selected recipe to the system's default DC"), and only
 * KEY PRESENCE can carry that distinction. `checkTierStaged` is the axis's opt-in to the
 * write, so the projection has something to test; the write primitive then tests
 * `Object.hasOwn`, never truthiness.
 *
 * ## The shipped recipe editor gives `''` the OPPOSITE meaning
 *
 * `RecipeOverviewTab.svelte` renders its own check-tier `<select>` whose `value=""` option
 * IS `Default DC`, and writes `{ checkTierId: event.currentTarget.value || null }` — so
 * there, `''` means "clear to the default", which is this model's `'__default__'`. Two
 * near-identical selects therefore carry OPPOSITE sentinels, on purpose: the editor edits
 * one recipe and has no third state to express, while the bulk panel must express "leave
 * alone" as well. Neither should be "fixed" to match the other; changing either one in
 * isolation silently converts a leave-alone into a clear, or the reverse, across a whole
 * selection.
 */

import {
  cycleTriStateStaging,
  normalizeSelectionIds as normalizeBookIds,
} from './bulkSelectionModel.js';

/**
 * @typedef {object} RecipeBulkDraft
 * @property {string} category the staged category; `''` is the `Leave unchanged` sentinel.
 * @property {'unchanged' | 'enable' | 'disable'} status the staged status intention.
 * @property {'unchanged' | 'lock' | 'unlock'} lock the staged lock intention.
 * @property {boolean} checkTierStaged whether the check-tier axis participates in the write.
 * @property {?string} checkTierId the staged tier id; `null` is `Default DC`, a REAL value.
 * @property {string[]} bookAdd recipe-book ids staged for addition.
 * @property {string[]} bookRemove recipe-book ids staged for removal; disjoint from `bookAdd`.
 */

/** The Status axis's three segments, in the panel's segmented-control order. */
export const RECIPE_BULK_STATUS_VALUES = Object.freeze(['unchanged', 'enable', 'disable']);

/** The Lock axis's three segments, in the panel's segmented-control order. */
export const RECIPE_BULK_LOCK_VALUES = Object.freeze(['unchanged', 'lock', 'unlock']);

/**
 * The check-tier `<select>` value that leaves the axis UNSTAGED — `Leave unchanged`.
 *
 * See the header: this is the exact inverse of the shipped single-recipe editor's `''`.
 */
export const RECIPE_CHECK_TIER_UNCHANGED = '';

/**
 * The check-tier `<select>` value that stages `checkTierId: null` — `Default DC`.
 *
 * A sentinel string rather than a real option value, because `null` has no `<option>`
 * representation and `''` is already spoken for. It is deliberately not a plausible tier
 * id: tier ids are generated secrets, so `__default__` cannot collide with one.
 */
export const RECIPE_CHECK_TIER_DEFAULT = '__default__';

/** The two list keys `cycleBulkRecipeBook` advances, named once. */
const BOOK_STAGING_KEYS = Object.freeze({ addKey: 'bookAdd', removeKey: 'bookRemove' });

/** One of the axis's three enum values, or its `unchanged` sentinel. */
function enumValue(value, allowed) {
  return allowed.includes(value) ? value : 'unchanged';
}

/**
 * Read arbitrary input as a well-formed draft, so every export below is total and none of
 * them has to re-guard its input.
 *
 * `bookAdd` wins over `bookRemove` on collision: the never-both-states invariant is
 * structural HERE rather than merely a property of the cycle, so a draft that arrived from
 * anywhere else — a persisted blob, a hand-built test fixture, a future panel — can never
 * stage one book as both, and the write primitive's "apply removals after additions" is
 * safe by construction rather than by convention.
 *
 * A staged `checkTierId` is normalized to `null` unless it is a non-blank string, so
 * `Default DC` has exactly ONE representation in a normalized draft. The `checkTierStaged`
 * flag is what carries participation; the value never has to.
 *
 * @param {?RecipeBulkDraft} draft
 * @returns {RecipeBulkDraft}
 */
function readDraft(draft) {
  const source = draft && typeof draft === 'object' ? draft : {};
  const bookAdd = normalizeBookIds(source.bookAdd);
  const tierId = typeof source.checkTierId === 'string' ? source.checkTierId.trim() : '';
  return {
    category: typeof source.category === 'string' ? source.category : '',
    status: enumValue(source.status, RECIPE_BULK_STATUS_VALUES),
    lock: enumValue(source.lock, RECIPE_BULK_LOCK_VALUES),
    checkTierStaged: source.checkTierStaged === true,
    checkTierId: tierId || null,
    bookAdd,
    bookRemove: normalizeBookIds(source.bookRemove).filter((id) => !bookAdd.includes(id)),
  };
}

/**
 * A fresh, wholly unstaged draft.
 *
 * Always a NEW object with NEW collections — the manager root holds one per selection and
 * discards it when the selection empties, so a shared singleton would leak one bulk edit
 * into the next.
 *
 * @returns {RecipeBulkDraft}
 */
export function createRecipeBulkDraft() {
  return {
    category: '',
    status: 'unchanged',
    lock: 'unchanged',
    checkTierStaged: false,
    checkTierId: null,
    bookAdd: [],
    bookRemove: [],
  };
}

/**
 * Stage a single-valued, overwriting category. `''` is the `Leave unchanged` sentinel.
 *
 * The value is stored verbatim rather than trimmed, because the panel's `<select>` binds to
 * it and matches an option by exact string; a whitespace-only value is treated as unset by
 * `bulkRecipeDraftHasChanges` and `toBulkRecipeEdit` instead.
 *
 * @param {RecipeBulkDraft} draft
 * @param {string} category
 * @returns {RecipeBulkDraft} a NEW draft; the input is not mutated.
 */
export function setBulkRecipeCategory(draft, category) {
  return { ...readDraft(draft), category: String(category ?? '') };
}

/**
 * Stage the Status intention: `unchanged`, `enable` or `disable`.
 *
 * An unrecognised value falls back to `unchanged` rather than throwing, so a stray segment
 * value can only ever UNSTAGE an axis — never stage an edit nobody asked for.
 *
 * @param {RecipeBulkDraft} draft
 * @param {'unchanged' | 'enable' | 'disable'} status
 * @returns {RecipeBulkDraft} a NEW draft; the input is not mutated.
 */
export function setBulkRecipeStatus(draft, status) {
  return { ...readDraft(draft), status: enumValue(status, RECIPE_BULK_STATUS_VALUES) };
}

/**
 * Stage the Lock intention: `unchanged`, `lock` or `unlock`.
 *
 * @param {RecipeBulkDraft} draft
 * @param {'unchanged' | 'lock' | 'unlock'} lock
 * @returns {RecipeBulkDraft} a NEW draft; the input is not mutated.
 */
export function setBulkRecipeLock(draft, lock) {
  return { ...readDraft(draft), lock: enumValue(lock, RECIPE_BULK_LOCK_VALUES) };
}

/**
 * Stage the check-tier axis from the panel's `<select>` value.
 *
 * Three distinct instructions, never two:
 *
 * - `RECIPE_CHECK_TIER_UNCHANGED` (`''`) — UNSTAGE the axis. `toBulkRecipeEdit` omits the
 *   `checkTierId` key entirely and every selected recipe keeps the tier it has.
 * - `RECIPE_CHECK_TIER_DEFAULT` (`'__default__'`) — stage `null`. The key IS emitted, and
 *   every selected recipe is cleared to the system's default DC.
 * - anything else — stage that tier id.
 *
 * Unstaging resets `checkTierId` to `null` so an unstaged draft has one canonical shape;
 * nothing reads the value while the flag is off, so there is no staged value to preserve
 * (unlike the component model's essence map, which is a whole authored payload).
 *
 * @param {RecipeBulkDraft} draft
 * @param {string} selectValue
 * @returns {RecipeBulkDraft} a NEW draft; the input is not mutated.
 */
export function setBulkRecipeCheckTier(draft, selectValue) {
  const next = readDraft(draft);
  const value = String(selectValue ?? '').trim();
  if (value === RECIPE_CHECK_TIER_UNCHANGED) {
    return { ...next, checkTierStaged: false, checkTierId: null };
  }
  if (value === RECIPE_CHECK_TIER_DEFAULT) {
    return { ...next, checkTierStaged: true, checkTierId: null };
  }
  return { ...next, checkTierStaged: true, checkTierId: value };
}

/**
 * The `<select>` value that represents the draft's staged check tier — the exact inverse of
 * `setBulkRecipeCheckTier`, so the control round-trips.
 *
 * An early-return chain rather than a nested ternary on purpose (Sonar S3358): three
 * outcomes over two conditions is precisely the shape that reads wrong when nested, and
 * collapsing `''` and `'__default__'` is the defect this whole axis exists to prevent.
 *
 * @param {RecipeBulkDraft} draft
 * @returns {string}
 */
export function bulkRecipeCheckTierSelectValue(draft) {
  const next = readDraft(draft);
  if (!next.checkTierStaged) return RECIPE_CHECK_TIER_UNCHANGED;
  if (next.checkTierId === null) return RECIPE_CHECK_TIER_DEFAULT;
  return next.checkTierId;
}

/**
 * Advance one recipe book through `none -> add -> remove -> none`.
 *
 * Delegates the machine to the shared `cycleTriStateStaging`, which the Component Studio's
 * tag run is the other instance of. Normalization stays here, because `readDraft` knows
 * this model's other four axes and the shared machine deliberately does not.
 *
 * @param {RecipeBulkDraft} draft
 * @param {string} bookId a recipe-item definition id.
 * @returns {RecipeBulkDraft} a NEW draft; the input is not mutated.
 */
export function cycleBulkRecipeBook(draft, bookId) {
  return cycleTriStateStaging(readDraft(draft), bookId, BOOK_STAGING_KEYS);
}

/**
 * Whether anything at all is staged — the enablement condition for `Apply to {N} recipes`.
 *
 * A REMOVAL-ONLY draft counts: a book chip cycled straight past `add` to `remove` is a real
 * edit the chip run can stage on its own, and reading only `bookAdd` here would leave Apply
 * inert for it.
 *
 * `checkTierStaged` is read as the flag it is, never as the truthiness of `checkTierId` — a
 * staged `null` is the `Default DC` instruction and must enable Apply.
 *
 * @param {RecipeBulkDraft} draft
 * @returns {boolean}
 */
export function bulkRecipeDraftHasChanges(draft) {
  const next = readDraft(draft);
  return Boolean(
    next.category.trim() ||
    next.status !== 'unchanged' ||
    next.lock !== 'unchanged' ||
    next.checkTierStaged ||
    next.bookAdd.length > 0 ||
    next.bookRemove.length > 0
  );
}

/**
 * Project the draft onto the `edit` object the set-apply write primitive takes.
 *
 * Three of its keys are FALSY BUT REAL — `enabled: false`, `locked: false` and
 * `checkTierId: null` — and each is present if and only if its axis is staged. Everything
 * downstream (the store seam, the write primitive's staging guard, the per-recipe patch)
 * therefore tests `Object.hasOwn`, NEVER truthiness: a truthiness test would silently drop
 * `Disable`, `Unlock` and `Default DC`, which are three of the panel's most ordinary
 * operations.
 *
 * @param {RecipeBulkDraft} draft
 * @returns {{category?: string, enabled?: boolean, locked?: boolean, checkTierId?: ?string,
 *   addBookIds?: string[], removeBookIds?: string[]}}
 */
export function toBulkRecipeEdit(draft) {
  const next = readDraft(draft);
  const edit = {};
  if (next.category.trim()) edit.category = next.category;
  if (next.status !== 'unchanged') edit.enabled = next.status === 'enable';
  if (next.lock !== 'unchanged') edit.locked = next.lock === 'lock';
  if (next.checkTierStaged) edit.checkTierId = next.checkTierId;
  if (next.bookAdd.length > 0) edit.addBookIds = [...next.bookAdd];
  if (next.bookRemove.length > 0) edit.removeBookIds = [...next.bookRemove];
  return edit;
}

/** The axis is unavailable for the named reason. */
function tierAxisUnavailable(reason) {
  return { available: false, reason };
}

/**
 * Whether the check-tier axis can be offered for this system, and if not, WHICH of the
 * five reasons it is — so the panel can state the reason in place of the control rather
 * than silently hiding it.
 *
 * The gate mirrors `resolveRecipeCheckTierOptions`'s own structure exactly, because the two
 * must never disagree: that helper returns the tier list, this one explains an empty one.
 *
 * - `progressive` — difficulty lives on each RESULT COMPONENT, so there is no recipe-level
 *   tier at all.
 * - `dynamic` — a simple check whose DC is resolved at craft time.
 * - `fixed` — a routed check of fixed type, where per-recipe difficulty is the recipe's
 *   minimum success tier instead.
 * - `unrecognisedMode` — see below.
 * - `noTiers` — the gate is open but the check authors no tiers, so every recipe uses the
 *   default DC and there is nothing to pick.
 *
 * `unrecognisedMode` is a DEFENSIVE branch, not a reachable state.
 * `CraftingSystemManager._normalizeResolutionMode` coerces every persisted
 * `resolutionMode` to one of five tokens with a `simple` fallback, and it runs on load, on
 * create and on update; the manager root then defaults a missing mode to `simple` again. So
 * `craftingCheckMode` is never `null` for a system read through the manager. The branch
 * exists only so this function is TOTAL over its input and can be unit-tested by passing
 * `null` directly — it is deliberately absent from the canonical spec, because a canonical
 * requirement must not assert a state no world can produce.
 *
 * This is NOT the same fact as the system having no usable crafting check at all (no
 * authored `rollFormula`); that is orthogonal, and the row's own `No check` pill reports it.
 * The two are never conflated.
 *
 * An early-return chain rather than nested ternaries (Sonar S3358).
 *
 * @param {{craftingCheck?: object, craftingCheckMode?: ?string, tierOptions?: object[]}} axis
 * @returns {{available: boolean, reason: ?('progressive'|'dynamic'|'fixed'|'unrecognisedMode'|'noTiers')}}
 */
export function describeRecipeCheckTierAxis(axis = {}) {
  const { craftingCheck, craftingCheckMode, tierOptions } = axis || {};

  if (craftingCheckMode === 'progressive') return tierAxisUnavailable('progressive');
  if (craftingCheckMode === 'simple' && craftingCheck?.simple?.dcMode === 'dynamic') {
    return tierAxisUnavailable('dynamic');
  }
  if (craftingCheckMode === 'routed' && craftingCheck?.routed?.type === 'fixed') {
    return tierAxisUnavailable('fixed');
  }
  if (craftingCheckMode !== 'simple' && craftingCheckMode !== 'routed') {
    return tierAxisUnavailable('unrecognisedMode');
  }
  if (!Array.isArray(tierOptions) || tierOptions.length === 0) {
    return tierAxisUnavailable('noTiers');
  }
  return { available: true, reason: null };
}

/**
 * How many of the selected recipes the activation gate would refuse to enable — the
 * lower-bound count the pre-flight warning names.
 *
 * Zero unless `Enable` is actually staged: `Disable` and `Unchanged` never transition a
 * recipe into the enabled state, so nothing can be refused and there is nothing to warn
 * about.
 *
 * The predicate is the ROW PILL's, deliberately and exactly: `enableBlocked` AND currently
 * off. An already-enabled blocked recipe contributes ZERO — the activation gate fires only
 * on a `false -> true` transition, so a recipe that is already on is never refused. Its row
 * wears `Incomplete` rather than `Can't enable` for the same reason. Counting it would let
 * the panel say "3 selected recipes will stay off" while fewer rows wore the pill: two
 * contradicting statements about one fact, on one screen.
 *
 * "Currently off" is `enabled === false`, matching `deriveRecipeStatuses`'s own strict test
 * rather than a loose falsy check, so a malformed row missing the field is counted by
 * NEITHER surface instead of by exactly one of them. Every projected row carries the
 * boolean, so the two readings coincide for real data; this is about staying identical at
 * the edges too.
 *
 * The count is a LOWER BOUND, and the copy that reports it says so: it cannot see
 * collisions the batch itself creates, because two selected alchemy recipes that collide
 * only with EACH OTHER both read `enableBlocked: false` and the write enables the first and
 * refuses the second. The post-apply report is the authority.
 *
 * @param {{enableBlocked?: boolean, enabled?: boolean}[]} rows the SELECTED projected rows.
 * @param {'unchanged' | 'enable' | 'disable'} status the draft's staged status.
 * @returns {number}
 */
export function countBlockedRecipeEnables(rows, status) {
  if (status !== 'enable') return 0;
  const selected = Array.isArray(rows) ? rows : [];
  return selected.filter((row) => row?.enableBlocked === true && row?.enabled === false).length;
}

/**
 * The shared selection helpers, re-exported under recipe-flavoured names.
 *
 * They live in `bulkSelectionModel.js` (issue 1010) because the selection semantics are
 * identical over any row id, while the staged draft above is not shareable at all. Aliasing
 * them here mirrors what `componentBulkEditModel.js` does for the Component Studio, so each
 * browser imports ONE model module and neither has to know the shared leaf exists.
 */
export {
  describeBulkSelection as describeRecipeSelection,
  toggleBulkSelection as toggleRecipeSelection,
  setBulkSelection as setRecipeSelection,
  pruneBulkSelection as pruneRecipeSelection,
} from './bulkSelectionModel.js';
