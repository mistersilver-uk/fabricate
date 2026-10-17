/**
 * The recipe editor's set and group drafts: their default names, whether one renders bare, and the
 * duplicate and sole-entry edits. Pure; `mintId` is injected so tests fix the ids.
 */
import { cloneJson } from '../../../../../utils/scalars.js';
import { newDraftId } from '../../../util/draftId.js';
import { localizeOr } from '../../../util/localizeOr.js';

/** `"Set N"` for the set at `index`. */
export function defaultSetName(index) {
  return `${localizeOr('FABRICATE.Admin.Manager.Recipe.SetLabel', 'Set')} ${index + 1}`;
}

/** The set's trimmed name, else its default. */
export function setDisplayName(set, index) {
  return String(set?.name || '').trim() || defaultSetName(index);
}

/** Whether a scope of `count` sets or groups renders without set chrome; a routed one never does. */
export function rendersBare(count, { routed = false } = {}) {
  return count <= 1 && !routed;
}

/**
 * A deep copy of `set` with the set and group ids re-minted and its routing dropped, so the copy
 * starts unassigned; a named source is copied as `"<name> (Copy)"`.
 */
export function duplicateIngredientSet(set, mintId = newDraftId) {
  const copy = cloneJson(set);
  const name = String(set?.name || '').trim()
    ? `${set.name} (${localizeOr('FABRICATE.Admin.Manager.Recipe.SetCopySuffix', 'Copy')})`
    : '';
  const groups = Array.isArray(copy.ingredientGroups) ? copy.ingredientGroups : [];
  return {
    ...copy,
    id: mintId(),
    ingredientGroups: groups.map((group) => ({ ...group, id: mintId() })),
    resultGroupId: null,
    resultMapping: [],
    name,
  };
}

/** The one-entry list a bare scope writes: `next` over the existing entry, keeping its id. */
export function withSoleEntry(entries, next, mintId = newDraftId) {
  const [first] = Array.isArray(entries) ? entries : [];
  return [{ ...first, ...next, id: first?.id || next?.id || mintId() }];
}
