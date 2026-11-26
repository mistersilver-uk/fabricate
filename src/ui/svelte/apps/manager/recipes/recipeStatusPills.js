/**
 * The Recipes library row's status pills, labelled. Both authoring states read ONE predicate,
 * `recipe.enableBlocked` (issue 1010), so the pilled rows, the bulk panel's pre-flight count and
 * the set-apply write are the same set by construction. An iterative row adds its status from
 * `ITERATIVE_STATUS`, the table the editor headers read. Every key is a literal, because
 * `lang-keys-no-orphans` cannot see a built one.
 */
import { fill } from '../../../../../utils/fillPlaceholders.js';
import { deriveRecipeStatuses } from '../../../../model/recipeBrowserModel.js';
import { statusChipTone } from '../../../util/statusChipTone.js';
import { ITERATIVE_STATUS, iterativeStatusChip } from '../iterative/iterativeStatusCopy.js';

const STATUS_LABELS = Object.freeze({
  disabled: ['FABRICATE.Admin.Manager.StatusDisabled', 'Disabled'],
  locked: ['FABRICATE.Admin.Manager.Recipe.LockedLabel', 'Locked'],
  blocked: ['FABRICATE.Admin.Manager.Recipe.CantEnable', "Can't enable"],
  incomplete: ['FABRICATE.Admin.Manager.Recipe.Incomplete', 'Incomplete'],
  ...Object.fromEntries(
    Object.values(ITERATIVE_STATUS).map((entry) => [entry.pill, [entry.key, entry.fallback]])
  ),
});

/** The pills a structural gap draws, which stand in for an iterative Ready it withholds. */
const WITHHELD_PILLS = new Set(['incomplete', 'blocked']);

/** `{ id, tone, icon, label }` per pill, in render order; `format` fills a counted label. */
export function statusPills(recipe, { text, format }) {
  return deriveRecipeStatuses(recipe).map((pill) => {
    const [labelKey, fallback] = STATUS_LABELS[pill.id];
    const label =
      pill.count === undefined
        ? text(labelKey, fallback)
        : format(labelKey, fallback, { count: pill.count });
    return { ...pill, label };
  });
}

/**
 * The recipe editor header's chip for `status`, the route model's `recipeHeaderStatus`: the
 * iterative status, or while Ready is withheld (`{ id: 'withheld' }`) the row's Incomplete or
 * Can't enable pill, so the editor and its library row agree. Its tone is `Chip`'s.
 */
export function recipeHeaderChip(status, recipe, text) {
  if (status?.id !== 'withheld') return iterativeStatusChip(status, text);
  const format = (key, fallback, values) => fill(text(key, fallback), values);
  const pill = statusPills(recipe, { text, format }).find((entry) => WITHHELD_PILLS.has(entry.id));
  if (!pill) return null;
  return { id: pill.id, label: pill.label, tone: statusChipTone(pill.tone), icon: pill.icon };
}
