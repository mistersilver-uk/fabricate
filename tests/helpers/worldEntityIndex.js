/**
 * The DESTINATION world-entity index every copy-mode `prepareForImport` call needs (issue 1364).
 *
 * Copy mode REQUIRES the index and throws without it, deliberately: defaulting it would silently
 * mint a fresh id for every incoming component, creating a second world record for every item the
 * destination already holds — the duplication epic 1357 exists to end.
 *
 * Most suites want the EMPTY index, because an empty destination matches nothing, so every
 * component mints and the pre-1364 copy-mode behaviour those suites were written for is exactly
 * what they get. It lives here rather than in each suite because `tests/**` counts against the
 * SonarCloud new-code duplication gate exactly as `src/` does.
 *
 * This file is a HELPER, never a `*.test.js`.
 */

/**
 * A destination world holding no world entities at all.
 *
 * @returns {{components: object[], essences: object[], tools: object[]}}
 */
export function emptyWorldEntityIndex() {
  return { components: [], essences: [], tools: [] };
}

/**
 * The third `prepareForImport` argument for a copy against an empty destination.
 *
 * @returns {{worldEntityIndex: {components: object[], essences: object[], tools: object[]}}}
 */
export function emptyCopyOptions() {
  return { worldEntityIndex: emptyWorldEntityIndex() };
}

/**
 * The index the two live call sites build, from the three world-scope entity stores.
 *
 * @param {{components?: object, essences?: object, tools?: object}} stores
 * @returns {{components: object[], essences: object[], tools: object[]}}
 */
export function worldEntityIndexFromStores(stores) {
  return {
    components: stores?.components?.listEntities?.() ?? [],
    essences: stores?.essences?.listEntities?.() ?? [],
    tools: stores?.tools?.listEntities?.() ?? [],
  };
}
