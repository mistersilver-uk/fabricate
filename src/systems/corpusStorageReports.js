/**
 * The per-entity-kind Definition Storage reports a **Valid Id Basis** is sampled from
 * (issues 1224, 1212, 1226).
 *
 * ONE derivation, shared by both composition sites — the startup pass list
 * (`startupPassComposition.js`) and the mutation-time cleanup
 * (`mutationCleanupComposition.js`) — because this mapping is the half of the gate that
 * has already drifted once. `components` used to be answered by the SYSTEM repository's
 * report, because components rode inside `system.components` and therefore shared that
 * repository. Issue 1212 extracted them, so the two reports now DIVERGE: the
 * crafting-system container is never granular and the component class is, whenever its
 * layout says so. Answering `components` from the container report makes the component
 * basis known-complete BY CONSTRUCTION on exactly the world where it is half-written.
 *
 * A second hand-written copy of the mapping is that regression waiting to happen, which
 * is why this is a module rather than an object literal at each site.
 *
 * The `?? storage` fallbacks are the pre-1212 shape: a manager whose
 * `describeDefinitionStorage()` returns only the flat container report answers both kinds
 * from it, which is what every fixture predating the split supplies. That is a widening of
 * the SOURCE, never of the answer — a flat report with no `granular: true` still fails
 * every clause `validIdBasis.js` states for a declared-granular kind.
 */

/**
 * Sample what each manager can attest about the storage its own corpus arrived through.
 *
 * @param {object} [options]
 * @param {object|null} [options.recipeManager] Supplies the `recipes` report.
 * @param {object|null} [options.craftingSystemManager] Supplies the `systems` and
 *   `components` reports.
 * @returns {{recipes: object|null, systems: object|null, components: object|null}} the
 *   `storage` bag {@link import('./validIdBasis.js').readValidIdBasisInputs} takes. An
 *   absent report is `null`, which is unknown, and unknown is not known-complete for any
 *   kind this build declares granular.
 */
export function describeCorpusStorage({ recipeManager = null, craftingSystemManager = null } = {}) {
  const storage = craftingSystemManager?.describeDefinitionStorage?.() ?? null;
  return {
    recipes: recipeManager?.describeDefinitionStorage?.() ?? null,
    systems: storage?.systems ?? storage,
    components: storage?.components ?? storage,
  };
}
