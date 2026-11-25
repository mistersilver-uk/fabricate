/**
 * The Recipes library row's status pills, labelled. Both authoring states read ONE predicate,
 * `recipe.enableBlocked` (issue 1010), so the pilled rows, the bulk panel's pre-flight count and
 * the set-apply write are the same set by construction. An iterative row adds its status, in the
 * words the editor header uses. Every key is a literal, because `lang-keys-no-orphans` cannot see a
 * built one.
 */
import { deriveRecipeStatuses } from '../../../../model/recipeBrowserModel.js';

const STATUS_LABELS = Object.freeze({
  disabled: ['FABRICATE.Admin.Manager.StatusDisabled', 'Disabled'],
  locked: ['FABRICATE.Admin.Manager.Recipe.LockedLabel', 'Locked'],
  blocked: ['FABRICATE.Admin.Manager.Recipe.CantEnable', "Can't enable"],
  incomplete: ['FABRICATE.Admin.Manager.Recipe.Incomplete', 'Incomplete'],
  iterativeSetup: ['FABRICATE.Admin.Manager.Recipe.Iterative.StatusSetup', 'Needs iterative setup'],
  iterativeBlocking: [
    'FABRICATE.Admin.Manager.Recipe.Iterative.StatusBlocking',
    '{count} blocking',
  ],
  iterativeReady: ['FABRICATE.Admin.Manager.Recipe.Iterative.StatusReady', 'Ready'],
});

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
