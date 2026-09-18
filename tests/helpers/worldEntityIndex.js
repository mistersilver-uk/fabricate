/**
 * The DESTINATION world-entity index every copy-mode `prepareForImport` call needs (issue 1364).
 */

/** A destination world holding no world entities at all. */
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

/** The index the two live call sites build, from the three world-scope entity stores. */
export function worldEntityIndexFromStores(stores) {
  return {
    components: stores?.components?.listEntities?.() ?? [],
    essences: stores?.essences?.listEntities?.() ?? [],
    tools: stores?.tools?.listEntities?.() ?? [],
  };
}
