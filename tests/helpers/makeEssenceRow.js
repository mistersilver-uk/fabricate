/**
 * ONE projected-essence-row builder, shared by every issue-1036 UI suite.
 *
 * The essence surfaces are fed by `adminStore._buildEssenceCards`, whose row is now
 * fourteen fields wide — identity, colour, the two capability booleans, two usage counts,
 * two usage identity lists and two delete flags. A per-suite literal of that shape is a
 * dozen lines that SonarCloud's new-code duplication gate counts as duplication the moment
 * a second suite writes it, and (worse) each copy drifts: a suite that forgets
 * `recipeUsageIds` silently asserts against an impact statement that unions nothing.
 *
 * It lives in `tests/helpers/` because that directory is for BUILDERS, and it is a pure
 * data factory with no imports.
 *
 * Defaults describe an ORDINARY enabled essence with no colour, no source, no macro and no
 * usage — the state a freshly created essence is in. Every interesting state is an override,
 * so a test's own literal names exactly what that test is about.
 */

/**
 * @param {object} [overrides] any subset of the row.
 * @returns {object} a NEW row; nothing is shared between calls, so a test that mutates one
 *   cannot reach another's fixture.
 */
export function makeEssenceRow(overrides = {}) {
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
    sourceState: 'none',
    hasEffectTransfer: false,
    hasPropertyMacro: false,
    componentUsageCount: 0,
    componentUsageItems: [],
    recipeUsageCount: 0,
    // The identities the bulk-delete impact statement UNIONS. A row that omits them
    // contributes zero rather than an over-count, which is exactly the silent under-report
    // this builder exists to stop a suite reproducing.
    recipeUsageIds: [],
    deleteRewritesRecipes: false,
    deleteBlocked: false,
    ...overrides,
  };
}
