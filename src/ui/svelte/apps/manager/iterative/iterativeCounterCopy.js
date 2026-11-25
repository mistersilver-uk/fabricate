/**
 * The sentences a Counter row and its body say: what limits it, where it is used, and which of its
 * bounds are inverted. Every key is a literal, because `lang-keys-no-orphans` cannot see a built one.
 */
import { interpolate } from '../checks/checksCopy.js';

import { usageCounts } from './iterativeLibraryModel.js';

const isNumber = (value) => typeof value === 'number' && Number.isFinite(value);
const bound = (value) => (isNumber(value) ? String(value) : '—');

/** The one-line limit summary on a Counter's row. */
export function counterLimitText(counter, text) {
  const { min, max } = counter;
  if (counter.limit === 'global') {
    return interpolate(
      text('FABRICATE.Admin.Manager.Iterative.LimitGlobalRow', 'Global {min} to {max}'),
      {
        min: bound(min),
        max: bound(max),
      }
    );
  }
  if (counter.limit === 'perRecipe') {
    return interpolate(
      text(
        'FABRICATE.Admin.Manager.Iterative.LimitPerRecipeRow',
        'Per recipe · default {min} to {max}'
      ),
      { min: bound(min), max: bound(max) }
    );
  }
  return text('FABRICATE.Admin.Manager.Iterative.LimitNone', 'No limit');
}

/** "N actions · N steps", or "Not used yet", each count agreeing with its number. */
export function counterUsageText(uses, text) {
  const counts = usageCounts(uses);
  const parts = [];
  if (counts.actions === 1) {
    parts.push(text('FABRICATE.Admin.Manager.Iterative.UsageActionOne', '1 action'));
  } else if (counts.actions > 1) {
    parts.push(
      interpolate(text('FABRICATE.Admin.Manager.Iterative.UsageActions', '{count} actions'), {
        count: counts.actions,
      })
    );
  }
  if (counts.steps === 1) {
    parts.push(text('FABRICATE.Admin.Manager.Iterative.UsageStepOne', '1 step'));
  } else if (counts.steps > 1) {
    parts.push(
      interpolate(text('FABRICATE.Admin.Manager.Iterative.UsageSteps', '{count} steps'), {
        count: counts.steps,
      })
    );
  }
  return parts.length > 0
    ? parts.join(' · ')
    : text('FABRICATE.Admin.Manager.Iterative.UsageNone', 'Not used yet');
}

const useKinds = (text) => ({
  cost: text('FABRICATE.Admin.Manager.Iterative.UseCost', '{name} · cost'),
  effect: text('FABRICATE.Admin.Manager.Iterative.UseEffect', '{name} · effect'),
  costEffect: text('FABRICATE.Admin.Manager.Iterative.UseCostEffect', '{name} · cost and effect'),
  rule: text('FABRICATE.Admin.Manager.Iterative.UseRule', '{name} · rule'),
});

/** One use as a line: an action as "Hammer · cost and effect", or a step as "Recipe › Step". */
export function counterUseLines(uses, text) {
  const kinds = useKinds(text);
  const actions = uses.actions.map((action) =>
    kinds[action.kind] ? interpolate(kinds[action.kind], { name: action.label }) : action.label
  );
  const steps = uses.steps.map((step) =>
    interpolate(text('FABRICATE.Admin.Manager.Iterative.UseStep', '{recipe} › {step}'), {
      recipe: step.recipeName,
      step:
        step.stepName ||
        interpolate(text('FABRICATE.Admin.Manager.Iterative.UseStepFallback', 'Step {number}'), {
          number: step.stepIndex + 1,
        }),
    })
  );
  return [...actions, ...steps];
}

/** The sentence naming inverted bounds, or `''` when the counter has none. */
export function counterBoundsError(counter, text) {
  const { min, max } = counter;
  if (counter.limit === 'none' || !isNumber(min) || !isNumber(max) || min <= max) return '';
  const perRecipe = counter.limit === 'perRecipe';
  return interpolate(
    perRecipe
      ? text(
          'FABRICATE.Admin.Manager.Iterative.BoundsInvertedDefault',
          'Default min {min} is above default max {max}.'
        )
      : text('FABRICATE.Admin.Manager.Iterative.BoundsInverted', 'Min {min} is above max {max}.'),
    { min, max }
  );
}
