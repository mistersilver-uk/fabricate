/**
 * What the recipe Overview shows for check modifiers. Only the `bySubject` rule defers the pick to
 * the recipe, so under every other rule it shows nothing; under that rule a system that rolls no
 * check for the picks to reach shows the inert callout instead of the controls.
 */

/** The callout copy per inert cause, said from the recipe's side: what the GM loses here. */
export const MODIFIER_INERT_COPY = Object.freeze({
  noCheck: {
    key: 'FABRICATE.Admin.Manager.Recipe.CraftingModifierInertNoCheck',
    fallback:
      'This system resolves without a crafting check, so check modifiers change nothing for this recipe.',
  },
  noFormula: {
    key: 'FABRICATE.Admin.Manager.Recipe.CraftingModifierInertNoFormula',
    fallback:
      'The system’s crafting check has no roll formula yet, so check modifiers change nothing for this recipe.',
  },
});

/**
 * `{ inert, showInert, showControls }`: the inert copy for `inertCause` or `null`, and which of the
 * two exclusive dispositions draws. `policy` is the canonical token, so `byRecipe` arrives normalized.
 */
export function recipeModifierDisposition({ options, policy, inertCause }) {
  const inert = MODIFIER_INERT_COPY[inertCause] || null;
  const deferred = options.length > 0 && policy === 'bySubject';
  return { inert, showInert: deferred && !!inert, showControls: deferred && !inert };
}
