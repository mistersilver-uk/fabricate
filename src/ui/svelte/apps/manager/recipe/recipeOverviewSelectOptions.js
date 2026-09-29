/**
 * The Overview tab's four converted select vocabularies, in the shared `<Select>`'s option shape
 * (issue 1510). Every label is carried verbatim from the `<option>` text it replaced — the
 * localized category name, the tier's `name (DC n)` join and its unnamed fallback — so nothing a
 * GM reads changes with the control, and each blank row stays first with its exact copy. It lives
 * beside the tab rather than in it because the tab is at its size ledger's ceiling.
 */
import { formatCheckAdjustment } from '../../../../../utils/checkAdjustmentFormat.js';

/** @returns {Array<{value: string, label: string}>} One row per system category. */
export function buildCategoryOptions(categories, labelFor) {
  return categories.map((category) => ({ value: category, label: labelFor(category) }));
}

/**
 * What a recipe's check tier names under the active check's `evaluation` (issue 2005): a DC for
 * summed roll-high against a fixed DC, a Target for roll-under, and an adjustment (`add` or
 * `multiply`) against a character value. A count keeps its DC wording until issue 2006.
 */
export function checkTierUnit(evaluation) {
  if ((evaluation?.product ?? 'sum') !== 'sum') return 'dc';
  if (evaluation?.target?.source === 'attribute') {
    return evaluation.target.adjustmentKind === 'multiply' ? 'multiply' : 'add';
  }
  return evaluation?.direction === 'under' ? 'target' : 'dc';
}

/** One tier's label: `name (DC n)`, `name (Target n)`, `name (−2)` or `name (×½)`. */
export function checkTierLabel(tier, evaluation, text) {
  const name = tier.name || text('FABRICATE.Admin.Manager.Recipe.CheckTierUnnamed', 'Unnamed tier');
  const unit = checkTierUnit(evaluation);
  if (unit === 'dc') return `${name} (DC ${tier.dc})`;
  if (unit === 'target') {
    const target = text('FABRICATE.Admin.Manager.Recipe.CheckTierTarget', 'Target {dc}');
    return `${name} (${target.replace('{dc}', String(tier.dc))})`;
  }
  return `${name} (${formatCheckAdjustment(unit, tier.adjustment) || '—'})`;
}

/** The no-tier row's label: `Default DC`, `Default target` or `Default · base adjustment`. */
export function checkTierDefaultLabel(evaluation, text) {
  const unit = checkTierUnit(evaluation);
  if (unit === 'dc') return text('FABRICATE.Admin.Manager.Recipe.CheckTierDefault', 'Default DC');
  return unit === 'target'
    ? text('FABRICATE.Admin.Manager.Recipe.CheckTierDefaultTarget', 'Default target')
    : text(
        'FABRICATE.Admin.Manager.Recipe.CheckTierDefaultAdjustment',
        'Default · base adjustment'
      );
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
