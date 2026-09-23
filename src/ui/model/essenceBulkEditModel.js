/**
 * Pure staging model for the GM essence browser's bulk edit (issue 1036) — a MIRROR of
 * `recipeBulkEditModel.js`, sharing its selection and status halves through
 * `bulkSelectionModel.js`. Icon, Colour and Status are the only staged axes; names, descriptions,
 * linked sources and macros stay per-essence. Every helper returns a NEW draft. Colour carries a
 * `…Staged` flag because its edit object must distinguish an ABSENT `colorToken` key from
 * `colorToken: null`, so the write primitive tests `Object.hasOwn` and never truthiness.
 */

import { normalizeBulkStatus } from '../../utils/bulkSelectionModel.js';

/** The Status axis's three segments, in the panel's segmented-control order. */
export { BULK_STATUS_VALUES as ESSENCE_BULK_STATUS_VALUES } from '../../utils/bulkSelectionModel.js';

/** The Colour control value that leaves the axis UNSTAGED — `Leave unchanged`. */
export const ESSENCE_BULK_COLOUR_UNCHANGED = '';

/** The Colour control value that stages `colorToken: null` — `Clear colour`. */
export const ESSENCE_BULK_COLOUR_NONE = '__none__';

/**
 * Read arbitrary input as a well-formed draft, so every export below is total and none of them has
 * to re-guard its input.
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

/** A fresh, wholly unstaged draft. */
export function createEssenceBulkDraft() {
  return { icon: '', colorTokenStaged: false, colorToken: null, status: 'unchanged' };
}

/** Stage a single-valued, overwriting icon class. */
export function setBulkEssenceIcon(draft, icon) {
  return { ...readDraft(draft), icon: String(icon ?? '') };
}

/** Stage the Colour axis from the panel's control value. */
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
 * The control value representing the draft's staged colour — the exact inverse of {@link
 * setBulkEssenceColour}, so the control round-trips.
 */
export function bulkEssenceColourControlValue(draft) {
  const next = readDraft(draft);
  if (!next.colorTokenStaged) return ESSENCE_BULK_COLOUR_UNCHANGED;
  if (next.colorToken === null) return ESSENCE_BULK_COLOUR_NONE;
  return next.colorToken;
}

/** Stage the Status intention: `unchanged`, `enable` or `disable`. */
export function setBulkEssenceStatus(draft, status) {
  return { ...readDraft(draft), status: normalizeBulkStatus(status) };
}

/** Whether anything at all is staged — the enablement condition for `Apply to {N}`. */
export function bulkEssenceDraftHasChanges(draft) {
  const next = readDraft(draft);
  return Boolean(next.icon.trim() || next.colorTokenStaged || next.status !== 'unchanged');
}

/**
 * Project the draft onto the `edit` object `CraftingSystemManager.applyBulkEditToEssences` takes.
 */
export function toBulkEssenceEdit(draft) {
  const next = readDraft(draft);
  const edit = {};
  if (next.icon.trim()) edit.icon = next.icon;
  if (next.colorTokenStaged) edit.colorToken = next.colorToken;
  if (next.status !== 'unchanged') edit.enabled = next.status === 'enable';
  return edit;
}

/** Collect the distinct ids a set of rows names on one axis. */
function unionOfIds(rows, fields) {
  const union = new Set();
  for (const row of rows) {
    for (const field of fields) {
      const value = row?.[field];
      if (!Array.isArray(value)) continue;
      for (const entry of value) {
        const id = String((entry && typeof entry === 'object' ? entry.id : entry) ?? '');
        if (id) union.add(id);
      }
      break;
    }
  }
  return union;
}

/**
 * What a delete of the current selection would actually do — the impact statement the maintainer
 * required, stated BEFORE the action is armed.
 */
export function describeEssenceDeleteImpact(rows) {
  const selected = Array.isArray(rows) ? rows : [];
  return {
    deletable: selected.length,
    deletableIds: selected.map((row) => String(row?.id ?? '')).filter(Boolean),
    componentsAffected: unionOfIds(selected, ['componentUsageIds', 'componentUsageItems']).size,
    recipeRewrites: unionOfIds(selected, ['recipeUsageIds']).size,
  };
}

/** The shared selection helpers, re-exported under essence-flavoured names. */
export {
  describeBulkSelection as describeEssenceSelection,
  toggleBulkSelection as toggleEssenceSelection,
  setBulkSelection as setEssenceSelection,
  pruneBulkSelection as pruneEssenceSelection,
} from '../../utils/bulkSelectionModel.js';
