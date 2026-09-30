/**
 * The Overview tab's four converted select vocabularies, in the shared `<Select>`'s option shape
 * (issue 1510). Every label is carried verbatim from the `<option>` text it replaced — the
 * localized category name, the tier's `name (DC n)` join and its unnamed fallback — so nothing a
 * GM reads changes with the control, and each blank row stays first with its exact copy. It lives
 * beside the tab rather than in it because the tab is at its size ledger's ceiling.
 */
import { normalizeCheckEvaluation } from '../../../../../systems/normalize/checkEvaluation.js';
import { formatCheckAdjustment } from '../../../../../utils/checkAdjustmentFormat.js';
import { fill } from '../../../../../utils/fillPlaceholders.js';

/** @returns {Array<{value: string, label: string}>} One row per system category. */
export function buildCategoryOptions(categories, labelFor) {
  return categories.map((category) => ({ value: category, label: labelFor(category) }));
}

/**
 * What a recipe's check tier names under the active check's `evaluation` (issue 2005): a DC for
 * summed roll-high against a fixed DC, a Target for roll-under, and an adjustment (`add` or
 * `multiply`) against a character value. A count names its successes needed (issue 2006).
 */
export function checkTierUnit(evaluation) {
  if (evaluation?.product === 'count') return 'successes';
  if (evaluation?.target?.source === 'attribute') {
    return evaluation.target.adjustmentKind === 'multiply' ? 'multiply' : 'add';
  }
  return evaluation?.direction === 'under' ? 'target' : 'dc';
}

/** `{name} · {n} successes`, `{name} · 1 success`, or `{name} · — successes` when none is set. */
function successesLabel(name, successes, text) {
  if (successes === 1) {
    return fill(text('FABRICATE.Admin.Manager.Recipe.Count.CheckTierOne', '{name} · 1 success'), {
      name,
    });
  }
  const count = Number.isInteger(successes) ? successes : '—';
  const template = text(
    'FABRICATE.Admin.Manager.Recipe.Count.CheckTier',
    '{name} · {count} successes'
  );
  return fill(template, { name, count });
}

/** One tier's label: `name (DC n)`, `name (Target n)`, `name (−2)`, `name (×½)` or its successes. */
export function checkTierLabel(tier, evaluation, text) {
  const name = tier.name || text('FABRICATE.Admin.Manager.Recipe.CheckTierUnnamed', 'Unnamed tier');
  const unit = checkTierUnit(evaluation);
  if (unit === 'successes') return successesLabel(name, tier.successes, text);
  if (unit === 'dc') return `${name} (DC ${tier.dc})`;
  if (unit === 'target') {
    const target = text('FABRICATE.Admin.Manager.Recipe.CheckTierTarget', 'Target {dc}');
    return `${name} (${target.replace('{dc}', String(tier.dc))})`;
  }
  return `${name} (${formatCheckAdjustment(unit, tier.adjustment) || '—'})`;
}

/** The no-tier row's label: `Default DC`, `Default target`, an adjustment or the pool's count. */
export function checkTierDefaultLabel(evaluation, text) {
  const unit = checkTierUnit(evaluation);
  if (unit === 'successes') {
    const name = text('FABRICATE.Admin.Manager.Recipe.Count.CheckTierDefault', 'Default');
    return successesLabel(name, normalizeCheckEvaluation(evaluation).pool.required, text);
  }
  if (unit === 'dc') return text('FABRICATE.Admin.Manager.Recipe.CheckTierDefault', 'Default DC');
  return unit === 'target'
    ? text('FABRICATE.Admin.Manager.Recipe.CheckTierDefaultTarget', 'Default target')
    : text(
        'FABRICATE.Admin.Manager.Recipe.CheckTierDefaultAdjustment',
        'Default · base adjustment'
      );
}

/**
 * The bulk check-tier axis's words by what a tier names (issue 2005): its hint, its default row's
 * hint, and a Target, adjustment or count check's own dynamic and no-tier reasons.
 */
export function bulkCheckTierCopy(evaluation, text) {
  const dynamicTarget = () =>
    text(
      'FABRICATE.Admin.Manager.Recipe.BulkEdit.CheckTierDynamicTarget',
      "This system's crafting check resolves its target dynamically at craft time, so recipes carry no tier to select."
    );
  const copy = {
    dc: {
      hint: () =>
        text(
          'FABRICATE.Admin.Manager.Recipe.BulkEdit.CheckTierHint',
          "The DC these recipes roll against — not the check's outcome tiers."
        ),
      defaultHint: () =>
        text(
          'FABRICATE.Admin.Manager.Recipe.BulkEdit.CheckTierDefaultHint',
          "Clears every selected recipe to the system's default DC."
        ),
    },
    target: {
      hint: () =>
        text(
          'FABRICATE.Admin.Manager.Recipe.BulkEdit.CheckTierHintTarget',
          "The target these recipes roll against — not the check's outcome tiers."
        ),
      defaultHint: () =>
        text(
          'FABRICATE.Admin.Manager.Recipe.BulkEdit.CheckTierDefaultHintTarget',
          "Clears every selected recipe to the system's default target."
        ),
      dynamic: dynamicTarget,
      noTiers: () =>
        text(
          'FABRICATE.Admin.Manager.Recipe.BulkEdit.CheckTierNoTiersTarget',
          "This system's crafting check authors no tiers, so every recipe uses its default target. Add tiers under Checks to assign them here."
        ),
    },
    adjustment: {
      hint: () =>
        text(
          'FABRICATE.Admin.Manager.Recipe.BulkEdit.CheckTierHintAdjustment',
          "The adjustment these recipes apply — not the check's outcome tiers."
        ),
      defaultHint: () =>
        text(
          'FABRICATE.Admin.Manager.Recipe.BulkEdit.CheckTierDefaultHintAdjustment',
          'Clears every selected recipe to the base adjustment.'
        ),
      // A macro adjusts a character value's target, so the target is what resolves dynamically.
      dynamic: dynamicTarget,
      noTiers: () =>
        text(
          'FABRICATE.Admin.Manager.Recipe.BulkEdit.CheckTierNoTiersAdjustment',
          "This system's crafting check authors no tiers, so every recipe uses its base adjustment. Add tiers under Checks to assign them here."
        ),
    },
    successes: {
      hint: () =>
        text(
          'FABRICATE.Admin.Manager.Recipe.BulkEdit.Count.CheckTierHint',
          "The successes needed these recipes roll for — not the check's outcome tiers."
        ),
      defaultHint: () =>
        text(
          'FABRICATE.Admin.Manager.Recipe.BulkEdit.Count.CheckTierDefaultHint',
          "Clears every selected recipe to the system's default successes needed."
        ),
      dynamic: () =>
        text(
          'FABRICATE.Admin.Manager.Recipe.BulkEdit.Count.CheckTierDynamic',
          "This system's crafting check takes its successes needed from a macro at craft time, so recipes carry no tier to select."
        ),
      noTiers: () =>
        text(
          'FABRICATE.Admin.Manager.Recipe.BulkEdit.Count.CheckTierNoTiers',
          "This system's crafting check authors no tiers, so every recipe uses its default successes needed. Add tiers under Checks to assign them here."
        ),
    },
  };
  const unit = checkTierUnit(evaluation);
  return copy[Object.hasOwn(copy, unit) ? unit : 'adjustment'];
}

/** @returns {Array<{value: string, label: string}>} The default row, then the ranked tiers. */
export function buildCheckTierOptions(tiers, text, evaluation = null) {
  return [
    { value: '', label: checkTierDefaultLabel(evaluation, text) },
    ...tiers.map((tier) => ({ value: tier.id, label: checkTierLabel(tier, evaluation, text) })),
  ];
}

/** @returns {Array<{value: string, label: string}>} The no-override row, then the success tiers. */
export function buildMinSuccessTierOptions(tiers, text) {
  const unnamed = text('FABRICATE.Admin.Manager.Recipe.CheckTierUnnamed', 'Unnamed tier');
  return [
    {
      value: '',
      label: text(
        'FABRICATE.Admin.Manager.Recipe.MinSuccessTierNone',
        'No override (use final tier)'
      ),
    },
    ...tiers.map((tier) => ({ value: tier.id, label: tier.name || unnamed })),
  ];
}

/** @returns {Array<{value: string, label: string}>} The eligible-set tri-state, in shipped order. */
export function buildModifierSetOptions(text) {
  return [
    {
      value: 'inherit',
      label: text(
        'FABRICATE.Admin.Manager.Recipe.CraftingModifierSetInherit',
        'Inherit system default'
      ),
    },
    {
      value: 'custom',
      label: text('FABRICATE.Admin.Manager.Recipe.CraftingModifierSetCustom', 'Custom set'),
    },
    {
      value: 'none',
      label: text('FABRICATE.Admin.Manager.Recipe.CraftingModifierSetNone', 'No modifiers'),
    },
  ];
}
