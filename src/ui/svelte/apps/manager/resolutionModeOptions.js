// Shared recipe/salvage resolution-mode option lists (issue 511). Extracted from
// SystemEditView so the Crafting Settings page and any other surface reuse one
// canonical list rather than duplicating it (avoids Sonar new-code duplication).
// Each option is { value, labelKey, fallback, descKey, descFallback } for the
// shared ResolutionModeCard.

export const resolutionModeOptions = [
  {
    value: 'simple',
    icon: 'fas fa-wand-magic-sparkles',
    labelKey: 'FABRICATE.Admin.SystemSettings.ResolutionSimple',
    fallback: 'Simple',
    descKey: 'FABRICATE.Admin.SystemSettings.ResolutionSimpleDesc',
    descFallback: 'One ingredient set and one result group, with an optional pass/fail check.',
  },
  {
    value: 'routedByIngredients',
    icon: 'fas fa-layer-group',
    labelKey: 'FABRICATE.Admin.SystemSettings.ResolutionRoutedByIngredients',
    fallback: 'Routed by ingredients',
    descKey: 'FABRICATE.Admin.SystemSettings.ResolutionRoutedByIngredientsDesc',
    descFallback:
      'Multiple ingredient sets and result groups; the chosen ingredient set selects which result group is produced. The crafting check is optional.',
  },
  {
    value: 'routedByCheck',
    icon: 'fas fa-dice-d20',
    labelKey: 'FABRICATE.Admin.SystemSettings.ResolutionRoutedByCheck',
    fallback: 'Routed by check',
    descKey: 'FABRICATE.Admin.SystemSettings.ResolutionRoutedByCheckDesc',
    descFallback:
      'Multiple ingredient sets and result groups; the crafting check outcome selects which result group is produced. Requires a crafting check.',
  },
  {
    value: 'progressive',
    icon: 'fas fa-bars-progress',
    labelKey: 'FABRICATE.Admin.SystemSettings.ResolutionProgressive',
    fallback: 'Progressive',
    descKey: 'FABRICATE.Admin.SystemSettings.ResolutionProgressiveDesc',
    descFallback:
      'One ingredient set and one ordered result group; a numeric check awards every result whose difficulty threshold is met.',
  },
  {
    value: 'alchemy',
    icon: 'fas fa-flask',
    labelKey: 'FABRICATE.Admin.SystemSettings.ResolutionAlchemy',
    fallback: 'Alchemy',
    descKey: 'FABRICATE.Admin.SystemSettings.ResolutionAlchemyDesc',
    descFallback:
      'Players submit ingredient combinations directly to discover hidden recipes; one result is selected per attempt.',
  },
];

// Salvage has exactly one ingredient, so ingredient-set routing is meaningless and
// `alchemy` is not offered. The default `simple` returns one result group with an
// optional pass/fail salvage check. For routed, the canonical persisted token stays
// `routed`; the display name is "Routed by check".
export const salvageResolutionModeOptions = [
  {
    value: 'simple',
    icon: 'fas fa-wand-magic-sparkles',
    labelKey: 'FABRICATE.Admin.SystemSettings.SalvageResolutionSimple',
    fallback: 'Simple',
    descKey: 'FABRICATE.Admin.SystemSettings.SalvageResolutionSimpleDesc',
    descFallback: 'One result group, with an optional pass/fail salvage check.',
  },
  {
    value: 'progressive',
    icon: 'fas fa-bars-progress',
    labelKey: 'FABRICATE.Admin.SystemSettings.SalvageResolutionProgressive',
    fallback: 'Progressive',
    descKey: 'FABRICATE.Admin.SystemSettings.SalvageResolutionProgressiveDesc',
    descFallback:
      'One ordered result group; a numeric salvage check awards every result whose difficulty threshold is met.',
  },
  {
    value: 'routed',
    icon: 'fas fa-dice-d20',
    labelKey: 'FABRICATE.Admin.SystemSettings.SalvageResolutionRouted',
    fallback: 'Routed by check',
    descKey: 'FABRICATE.Admin.SystemSettings.SalvageResolutionRoutedDesc',
    descFallback:
      'Multiple result groups; the salvage check outcome selects which result group is returned.',
  },
];
