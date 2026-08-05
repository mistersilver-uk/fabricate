/**
 * Pure staging model for the GM essence browser's bulk edit (issue 1036).
 *
 * The third studio to stage a bulk edit, and a MIRROR of `recipeBulkEditModel.js` rather
 * than a copy of it: only the SELECTION half is genuinely one concept across the three
 * studios, and it lives in the row-agnostic `bulkSelectionModel.js` — as does the
 * `unchanged | enable | disable` STATUS axis, which the Recipe Studio and this one stage
 * identically onto the identical `enabled` edit key. The four selection helpers are
 * re-exported at the foot of this file under `…EssenceSelection` names so the essence
 * surfaces import ONE model module.
 *
 * The staged axes are Icon, Colour and Status, and no more. Names, descriptions, linked
 * sources and property macros stay PER-ESSENCE: each is either unique to one essence or
 * carries behaviour that a whole-selection overwrite would silently destroy.
 *
 * Nothing here mutates its input. Every helper returns a NEW draft — the Svelte side
 * propagates on reference change.
 *
 * ## Why the Colour axis carries a `…Staged` flag and Icon and Status do not
 *
 * Icon and Status carry a natural sentinel. An icon class is never empty when authored, so
 * `''` is free to mean `Leave unchanged`; Status carries `'unchanged'` inside its enum.
 *
 * Colour cannot, and for the same reason the Recipe Studio's check tier cannot: the EDIT
 * OBJECT must distinguish an ABSENT `colorToken` key ("leave every selected essence's
 * colour alone") from a PRESENT `colorToken: null` ("clear every selected essence to the
 * theme accent"), and only KEY PRESENCE can carry that distinction. The write primitive
 * then tests `Object.hasOwn`, never truthiness — a truthiness test would silently drop
 * both Clear colour and Disable, two of the panel's most ordinary operations.
 */

import { normalizeBulkStatus } from './bulkSelectionModel.js';

/**
 * @typedef {object} EssenceBulkDraft
 * @property {string} icon the staged icon class; `''` is the `Leave unchanged` sentinel.
 * @property {boolean} colorTokenStaged whether the colour axis participates in the write.
 * @property {?string} colorToken the staged token; `null` is `Clear colour`, a REAL value.
 * @property {'unchanged' | 'enable' | 'disable'} status the staged status intention.
 */

/** The Status axis's three segments, in the panel's segmented-control order. */
export { BULK_STATUS_VALUES as ESSENCE_BULK_STATUS_VALUES } from './bulkSelectionModel.js';

/** The Colour control value that leaves the axis UNSTAGED — `Leave unchanged`. */
export const ESSENCE_BULK_COLOUR_UNCHANGED = '';

/**
 * The Colour control value that stages `colorToken: null` — `Clear colour`.
 *
 * A sentinel string rather than a real token, because `null` has no control-value
 * representation and `''` is already spoken for. `--fab-tag-*` tokens are bare palette
 * keys, so a double-underscore sentinel cannot collide with one.
 */
export const ESSENCE_BULK_COLOUR_NONE = '__none__';

/**
 * Read arbitrary input as a well-formed draft, so every export below is total and none of
 * them has to re-guard its input.
 *
 * A staged `colorToken` is normalized to `null` unless it is a non-blank string, so
 * `Clear colour` has exactly ONE representation in a normalized draft; `colorTokenStaged`
 * is what carries participation, and the value never has to.
 *
 * @param {?EssenceBulkDraft} draft
 * @returns {EssenceBulkDraft}
 */
function readDraft(draft) {
  const source = draft && typeof draft === 'object' ? draft : {};
  const token = typeof source.colorToken === 'string' ? source.colorToken.trim() : '';
  return {
    icon: typeof source.icon === 'string' ? source.icon : '',
    colorTokenStaged: source.colorTokenStaged === true,
    colorToken: token || null,
    status: normalizeBulkStatus(source.status),
  };
}

/**
 * A fresh, wholly unstaged draft.
 *
 * Always a NEW object — the manager root holds one per selection and discards it when the
 * selection empties, so a shared singleton would leak one bulk edit into the next.
 *
 * @returns {EssenceBulkDraft}
 */
export function createEssenceBulkDraft() {
  return { icon: '', colorTokenStaged: false, colorToken: null, status: 'unchanged' };
}

/**
 * Stage a single-valued, overwriting icon class. `''` is the `Leave unchanged` sentinel,
 * which is also what the panel's `Leave unchanged` reset emits.
 *
 * @param {EssenceBulkDraft} draft
 * @param {string} icon
 * @returns {EssenceBulkDraft} a NEW draft; the input is not mutated.
 */
export function setBulkEssenceIcon(draft, icon) {
  return { ...readDraft(draft), icon: String(icon ?? '') };
}

/**
 * Stage the Colour axis from the panel's control value.
 *
 * Three distinct instructions, never two:
 *
 * - `ESSENCE_BULK_COLOUR_UNCHANGED` (`''`) — UNSTAGE. `toBulkEssenceEdit` omits the
 *   `colorToken` key entirely and every selected essence keeps the colour it has.
 * - `ESSENCE_BULK_COLOUR_NONE` (`'__none__'`) — stage `null`. The key IS emitted and every
 *   selected essence is cleared to the theme accent.
 * - anything else — stage that `--fab-tag-*` token.
 *
 * @param {EssenceBulkDraft} draft
 * @param {string} controlValue
 * @returns {EssenceBulkDraft} a NEW draft; the input is not mutated.
 */
export function setBulkEssenceColour(draft, controlValue) {
  const next = readDraft(draft);
  const value = String(controlValue ?? '').trim();
  if (value === ESSENCE_BULK_COLOUR_UNCHANGED) {
    return { ...next, colorTokenStaged: false, colorToken: null };
  }
  if (value === ESSENCE_BULK_COLOUR_NONE) {
    return { ...next, colorTokenStaged: true, colorToken: null };
  }
  return { ...next, colorTokenStaged: true, colorToken: value };
}

/**
 * The control value representing the draft's staged colour — the exact inverse of
 * {@link setBulkEssenceColour}, so the control round-trips.
 *
 * An early-return chain rather than a nested ternary on purpose (Sonar S3358): collapsing
 * `''` and `'__none__'` is the defect this whole axis exists to prevent.
 *
 * @param {EssenceBulkDraft} draft
 * @returns {string}
 */
export function bulkEssenceColourControlValue(draft) {
  const next = readDraft(draft);
  if (!next.colorTokenStaged) return ESSENCE_BULK_COLOUR_UNCHANGED;
  if (next.colorToken === null) return ESSENCE_BULK_COLOUR_NONE;
  return next.colorToken;
}

/**
 * Stage the Status intention: `unchanged`, `enable` or `disable`.
 *
 * @param {EssenceBulkDraft} draft
 * @param {'unchanged' | 'enable' | 'disable'} status
 * @returns {EssenceBulkDraft} a NEW draft; the input is not mutated.
 */
export function setBulkEssenceStatus(draft, status) {
  return { ...readDraft(draft), status: normalizeBulkStatus(status) };
}

/**
 * Whether anything at all is staged — the enablement condition for `Apply to {N}`.
 *
 * `colorTokenStaged` is read as the FLAG it is, never as the truthiness of `colorToken`: a
 * staged `null` is the `Clear colour` instruction and must enable Apply.
 *
 * @param {EssenceBulkDraft} draft
 * @returns {boolean}
 */
export function bulkEssenceDraftHasChanges(draft) {
  const next = readDraft(draft);
  return Boolean(next.icon.trim() || next.colorTokenStaged || next.status !== 'unchanged');
}

/**
 * Project the draft onto the `edit` object `CraftingSystemManager.applyBulkEditToEssences`
 * takes.
 *
 * Two of its keys are FALSY BUT REAL — `colorToken: null` (Clear colour) and `enabled:
 * false` (Disable) — and each is present if and only if its axis is staged. Everything
 * downstream therefore tests `Object.hasOwn`, NEVER truthiness.
 *
 * @param {EssenceBulkDraft} draft
 * @returns {{icon?: string, colorToken?: ?string, enabled?: boolean}}
 */
export function toBulkEssenceEdit(draft) {
  const next = readDraft(draft);
  const edit = {};
  if (next.icon.trim()) edit.icon = next.icon;
  if (next.colorTokenStaged) edit.colorToken = next.colorToken;
  if (next.status !== 'unchanged') edit.enabled = next.status === 'enable';
  return edit;
}

/**
 * What a bulk delete of the current selection would actually do — the impact statement the
 * maintainer required in the bulk-edit sidebar, stated BEFORE the action is armed.
 *
 * Three numbers that are genuinely different questions and must not be derived from each
 * other: how many essences will be deleted, how many COMPONENTS carry any of them, and how
 * many RECIPES will be rewritten. One essence carried by twelve components is 1 deletion
 * and 12 carriers; two essences in one recipe is 2 deletions and 1 rewrite.
 *
 * Component and recipe carriers are counted from the rows' own usage counts, which are
 * per-essence, so a component carrying two selected essences is counted twice. That is
 * stated rather than hidden: the projection has only per-essence counts to work from, and
 * the copy the panel renders says "component links", not "distinct components".
 *
 * BLOCKED members are excluded and named. The single-delete guard is a data-loss guard and
 * removing it was not what was directed, so the panel says how many it will skip and why,
 * and `canDelete` is false when every selection member is blocked — an inert action rather
 * than one that silently does less than it says.
 *
 * @param {{id?: string, name?: string, deleteBlocked?: boolean, componentUsageCount?: number,
 *   recipeUsageCount?: number}[]} rows the SELECTED projected essence rows.
 * @returns {{deletable: number, deletableIds: string[], blocked: number,
 *   blockedNames: string[], componentLinks: number, recipeRewrites: number,
 *   canDelete: boolean}}
 */
export function describeEssenceDeleteImpact(rows) {
  const selected = Array.isArray(rows) ? rows : [];
  const deletable = selected.filter((row) => row?.deleteBlocked !== true);
  const blocked = selected.filter((row) => row?.deleteBlocked === true);

  let componentLinks = 0;
  let recipeRewrites = 0;
  for (const row of deletable) {
    componentLinks += Math.max(0, Number(row?.componentUsageCount) || 0);
    recipeRewrites += Math.max(0, Number(row?.recipeUsageCount) || 0);
  }

  return {
    deletable: deletable.length,
    deletableIds: deletable.map((row) => String(row?.id ?? '')).filter(Boolean),
    blocked: blocked.length,
    blockedNames: blocked.map((row) => String(row?.name ?? '')).filter(Boolean),
    componentLinks,
    recipeRewrites,
    canDelete: deletable.length > 0,
  };
}

/**
 * The shared selection helpers, re-exported under essence-flavoured names.
 *
 * They live in `bulkSelectionModel.js` because the selection semantics are identical over
 * any row id, while the staged draft above is not shareable at all. Aliasing them here
 * mirrors what `componentBulkEditModel.js` and `recipeBulkEditModel.js` already do, so
 * each browser imports ONE model module and none has to know the shared leaf exists.
 */
export {
  describeBulkSelection as describeEssenceSelection,
  toggleBulkSelection as toggleEssenceSelection,
  setBulkSelection as setEssenceSelection,
  pruneBulkSelection as pruneEssenceSelection,
} from './bulkSelectionModel.js';
