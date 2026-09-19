/**
 * The Overview tab's four converted select vocabularies, in the shared `<Select>`'s option shape
 * (issue 1510). Every label is carried verbatim from the `<option>` text it replaced — the
 * localized category name, the tier's `name (DC n)` join and its unnamed fallback — so nothing a
 * GM reads changes with the control, and each blank row stays first with its exact copy. It lives
 * beside the tab rather than in it because the tab is at its size ledger's ceiling.
 */

/** @returns {Array<{value: string, label: string}>} One row per system category. */
export function buildCategoryOptions(categories, labelFor) {
  return categories.map((category) => ({ value: category, label: labelFor(category) }));
}

/** @returns {Array<{value: string, label: string}>} The Default DC row, then the ranked tiers. */
export function buildCheckTierOptions(tiers, text) {
  const unnamed = text('FABRICATE.Admin.Manager.Recipe.CheckTierUnnamed', 'Unnamed tier');
  return [
    { value: '', label: text('FABRICATE.Admin.Manager.Recipe.CheckTierDefault', 'Default DC') },
    ...tiers.map((tier) => ({ value: tier.id, label: `${tier.name || unnamed} (DC ${tier.dc})` })),
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
