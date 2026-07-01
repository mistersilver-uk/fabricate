/**
 * Pure ownership-guard + component-source resolution for the player-triggered
 * crafting advance boundary ({@link Fabricate#advanceCraftingRun}). Extracted
 * from `main.js` so the resolution + permission logic is unit-testable without a
 * live `game.*`: the Foundry edge injects the world actor, the run, and
 * `globalThis.fromUuidSync`.
 *
 * The run's persisted `componentSourceActorUuids` are UUIDs (NOT ids), so they
 * resolve through the injected `fromUuid`; falsy resolutions are filtered, and an
 * empty resolution falls back to `[actor]` (the run drew from the crafting actor's
 * own inventory). Because `craft()` BOTH reads from the source actors AND writes
 * results to the crafting `actor` via `createEmbeddedDocuments`, a user who does
 * not own the crafting actor OR any source actor cannot advance the run without an
 * ungraceful Foundry permission throw — so this guard reports `blocked` instead.
 */

/**
 * Resolve the component-source actors for an advance, guarding ownership.
 *
 * @param {object} options
 * @param {object|null} [options.actor] The crafting (world) actor the run is keyed
 *   to. A falsy actor (unknown id) is blocked.
 * @param {object|null} [options.run] The active crafting run (carries
 *   `componentSourceActorUuids`).
 * @param {Function} [options.fromUuid] `(uuid) => Document|null` resolver
 *   (injected `globalThis.fromUuidSync`).
 * @returns {{componentSourceActors: object[]}|{blocked: true}} The resolved source
 *   actors, or `{ blocked: true }` when the actor is unknown or the viewer lacks
 *   ownership of the crafting actor or any source actor.
 */
export function resolveAdvanceSources({ actor = null, run = null, fromUuid = null } = {}) {
  if (!actor) return { blocked: true };

  const resolve = typeof fromUuid === 'function' ? fromUuid : null;
  const sources =
    Array.isArray(run?.componentSourceActorUuids) && resolve
      ? run.componentSourceActorUuids.map((uuid) => resolve(uuid)).filter(Boolean)
      : [];
  const componentSourceActors = sources.length > 0 ? sources : [actor];

  // Guard BOTH the crafting actor (results are written to it) and every source
  // actor (components are consumed from them). Any non-owner blocks gracefully.
  const guardedActors = [actor, ...componentSourceActors];
  if (guardedActors.some((source) => source?.isOwner !== true)) {
    return { blocked: true };
  }
  return { componentSourceActors };
}
