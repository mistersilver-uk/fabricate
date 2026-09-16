/**
 * Pure staging model for the GM recipe browser's bulk edit (issue 1010) — the mirror of
 * `componentBulkEditModel.js`, sharing only `bulkSelectionModel.js`. Every helper returns a NEW
 * draft and reads no Foundry global. Only the check tier carries a `…Staged` flag, because its edit
 * object must distinguish an ABSENT `checkTierId` key from `checkTierId: null`; `''` means "leave
 * alone" here and "clear to default" in `RecipeOverviewTab`, and neither may be "fixed".
 */

import {
  normalizeBulkStatus,
  normalizeSelectionIds as normalizeBookIds,
} from './bulkSelectionModel.js';

/** The Status axis's three segments, in the panel's segmented-control order. */
export { BULK_STATUS_VALUES as RECIPE_BULK_STATUS_VALUES } from './bulkSelectionModel.js';

/** The Lock axis's three segments, in the panel's segmented-control order. */
export const RECIPE_BULK_LOCK_VALUES = Object.freeze(['unchanged', 'lock', 'unlock']);

/** The check-tier `<select>` value that leaves the axis UNSTAGED — `Leave unchanged`. */
export const RECIPE_CHECK_TIER_UNCHANGED = '';

/** The check-tier `<select>` value that stages `checkTierId: null` — `Default DC`. */
export const RECIPE_CHECK_TIER_DEFAULT = '__default__';

/** The three ops the book axis can stage for ONE book. */
export const RECIPE_BULK_BOOK_OPS = Object.freeze(['none', 'add', 'remove']);

/** One of the axis's three enum values, or its `unchanged` sentinel. */
function enumValue(value, allowed) {
  return allowed.includes(value) ? value : 'unchanged';
}

/**
 * Read arbitrary input as a well-formed draft, so every export below is total and none of them has
 * to re-guard its input.
 */
function readDraft(draft) {
  const source = draft && typeof draft === 'object' ? draft : {};
  const bookAdd = normalizeBookIds(source.bookAdd);
  const tierId = typeof source.checkTierId === 'string' ? source.checkTierId.trim() : '';
  return {
    category: typeof source.category === 'string' ? source.category : '',
    status: normalizeBulkStatus(source.status),
    lock: enumValue(source.lock, RECIPE_BULK_LOCK_VALUES),
    checkTierStaged: source.checkTierStaged === true,
    checkTierId: tierId || null,
    bookAdd,
    bookRemove: normalizeBookIds(source.bookRemove).filter((id) => !bookAdd.includes(id)),
  };
}

/** A fresh, wholly unstaged draft. */
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

/** Stage a single-valued, overwriting category. */
export function setBulkRecipeCategory(draft, category) {
  return { ...readDraft(draft), category: String(category ?? '') };
}

/** Stage the Status intention: `unchanged`, `enable` or `disable`. */
export function setBulkRecipeStatus(draft, status) {
  return { ...readDraft(draft), status: normalizeBulkStatus(status) };
}

/** Stage the Lock intention: `unchanged`, `lock` or `unlock`. */
export function setBulkRecipeLock(draft, lock) {
  return { ...readDraft(draft), lock: enumValue(lock, RECIPE_BULK_LOCK_VALUES) };
}

/** Stage the check-tier axis from the panel's `<select>` value. */
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
 */
export function bulkRecipeCheckTierSelectValue(draft) {
  const next = readDraft(draft);
  if (!next.checkTierStaged) return RECIPE_CHECK_TIER_UNCHANGED;
  if (next.checkTierId === null) return RECIPE_CHECK_TIER_DEFAULT;
  return next.checkTierId;
}

/** Stage ONE recipe book's op: `'add'`, `'remove'`, or `'none'` to unstage it. */
export function setBulkRecipeBookOp(draft, bookId, op) {
  const next = readDraft(draft);
  const id = String(bookId ?? '');
  if (!id) return next;

  // Cleared from BOTH lists first, so the never-both-states invariant holds by construction here as
  // well as in `readDraft`.
  const bookAdd = next.bookAdd.filter((entry) => entry !== id);
  const bookRemove = next.bookRemove.filter((entry) => entry !== id);
  if (op === 'add') bookAdd.push(id);
  else if (op === 'remove') bookRemove.push(id);
  return { ...next, bookAdd, bookRemove };
}

/** The op currently staged for one recipe book, as the panel and its staged list read it. */
export function bulkRecipeBookOp(draft, bookId) {
  const next = readDraft(draft);
  const id = String(bookId ?? '');
  if (next.bookAdd.includes(id)) return 'add';
  if (next.bookRemove.includes(id)) return 'remove';
  return 'none';
}

/**
 * How many of the SELECTED recipes each recipe book currently holds — the `holds n of {total}`
 * figure the picker's option rows and its pick card state, and the figure the Add / Remove labels
 * and their disabled states are derived from.
 */
export function countRecipeBookMembership(rows) {
  const counts = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    // De-duplicated per row: one recipe contributes at most 1 to each book, whatever the projection
    // handed over, so the count can never exceed the selection size.
    for (const bookId of normalizeBookIds(row?.recipeItemIds)) {
      counts.set(bookId, (counts.get(bookId) || 0) + 1);
    }
  }
  return counts;
}

/** Whether anything at all is staged — the enablement condition for `Apply to {N} recipes`. */
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

/** Project the draft onto the `edit` object the set-apply write primitive takes. */
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
 * Whether the check-tier axis can be offered for this system, and if not, WHICH of the six reasons
 * it is — so the panel can state the reason in place of the control rather than silently hiding it.
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
  if (craftingCheckMode === null) return tierAxisUnavailable('noCheck');
  if (craftingCheckMode !== 'simple' && craftingCheckMode !== 'routed') {
    return tierAxisUnavailable('unrecognisedMode');
  }
  if (!Array.isArray(tierOptions) || tierOptions.length === 0) {
    return tierAxisUnavailable('noTiers');
  }
  return { available: true, reason: null };
}

/**
 * How many of the selected recipes the activation gate would refuse to enable — the lower-bound
 * count the pre-flight warning names.
 */
export function countBlockedRecipeEnables(rows, status) {
  if (status !== 'enable') return 0;
  const selected = Array.isArray(rows) ? rows : [];
  return selected.filter((row) => row?.enableBlocked === true && row?.enabled === false).length;
}

/** The shared selection helpers, re-exported under recipe-flavoured names. */
export {
  describeBulkSelection as describeRecipeSelection,
  toggleBulkSelection as toggleRecipeSelection,
  setBulkSelection as setRecipeSelection,
  pruneBulkSelection as pruneRecipeSelection,
} from './bulkSelectionModel.js';
