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
 * ## The store's INVARIANTS are reproduced here, not left to each caller
 *
 * `deleteBlocked` is not an independent field. `adminStore._buildEssenceCards` sets it to
 * `componentUsageCount > 0` and nothing else, so `deleteBlocked: false` beside a non-empty
 * `componentUsageItems` is a shape the store CANNOT emit — and a suite built on it certifies
 * behaviour production can never reach. Two suites shipped exactly that row and between them
 * they proved a delete-impact number that was structurally always zero in the running app.
 *
 * So the default is DERIVED from the usage the caller declares. An explicit `deleteBlocked`
 * override still wins, because a test about the guard itself needs to state the flag — but it
 * has to state it, rather than inheriting a default that silently disagrees with its own
 * `componentUsageCount`.
 *
 * `hasEffectTransfer` and `sourceState` are the same kind of pair — the store sets
 * `hasEffectTransfer: sourceState !== 'none'` — and they now derive from each other for the
 * same reason: the Effects pill reports a NON-`linked` source as broken, so a fixture that
 * said "carries effects" while leaving the default `sourceState: 'none'` would silently be
 * testing the broken-link path while reading as the healthy one.
 *
 * @param {object} [overrides] any subset of the row.
 * @returns {object} a NEW row; nothing is shared between calls, so a test that mutates one
 *   cannot reach another's fixture.
 */
export function makeEssenceRow(overrides = {}) {
  // Read the caller's own component usage — either key, since the impact union accepts
  // both — so the derived block agrees with the row it is derived from.
  const usageCount = Number(overrides.componentUsageCount ?? 0);
  const usageItems = Array.isArray(overrides.componentUsageItems)
    ? overrides.componentUsageItems.length
    : 0;
  const usageIds = Array.isArray(overrides.componentUsageIds)
    ? overrides.componentUsageIds.length
    : 0;
  const carriesComponents = usageCount > 0 || usageItems > 0 || usageIds > 0;

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
    // The identities the bulk-delete impact statement UNIONS. A row that omits them
    // contributes zero rather than an over-count, which is exactly the silent under-report
    // this builder exists to stop a suite reproducing.
    recipeUsageIds: [],
    deleteRewritesRecipes: false,
    // DERIVED, never a free default — see the note above. `...overrides` follows, so an
    // explicit `deleteBlocked` still wins.
    deleteBlocked: carriesComponents,
    ...overrides,
  };
}
