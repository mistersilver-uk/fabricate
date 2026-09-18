/** ONE projected-essence-row builder, shared by every issue-1036 UI suite. */

/**
 * The store's INVARIANTS are reproduced here, not left to each caller. Deleting an essence is
 * WARNED, never BLOCKED (issue 1036, maintainer round): the cascade strips the essence from every
 * carrying component and rewrites every referencing recipe, so `_buildEssenceCards` no longer emits
 * a `deleteBlocked` flag and this builder carries none.
 *
 * @param {object} [overrides] any subset of the row.
 * @returns {object} a NEW row; nothing is shared between calls, so a test that mutates one cannot
 * reach another's fixture.
 */
export function makeEssenceRow(overrides = {}) {
  // Either half of the source pair implies the other. An explicit `sourceState` is the
  // stronger statement, because it is the field the store derives FROM.
  const statedSourceState =
    typeof overrides.sourceState === 'string' ? overrides.sourceState : '';
  const carriesSource = statedSourceState
    ? statedSourceState !== 'none'
    : overrides.hasEffectTransfer === true;

  return {
    id: 'fire',
    name: 'Fire',
    description: 'Forge-heat and ember.',
    icon: 'fas fa-fire',
    colorToken: null,
    // Default-TRUE, matching the persisted field: a row carrying no `enabled` key reads as
    // enabled everywhere, so the default has to be the same answer.
    enabled: true,
    propertyMacroUuid: null,
    sourceComponentId: null,
    sourceItemUuid: null,
    associatedItem: null,
    sourceName: '',
    // DERIVED as a pair — see the note above. A caller wanting the BROKEN link states
    // `sourceState: 'stale' | 'missing'` and gets `hasEffectTransfer: true` with it.
    sourceState: carriesSource ? 'linked' : 'none',
    hasEffectTransfer: carriesSource,
    hasPropertyMacro: false,
    componentUsageCount: 0,
    componentUsageItems: [],
    recipeUsageCount: 0,
    // The identities the bulk-delete impact statement UNIONS.
    recipeUsageIds: [],
    deleteRewritesRecipes: false,
    ...overrides,
  };
}
