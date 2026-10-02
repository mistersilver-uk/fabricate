/**
 * Ownership guard and component-source resolution for a player-triggered crafting advance or
 * cancel (`src/bootstrap/craftingFacade.js`), which injects the actor, the run and
 * `globalThis.fromUuidSync`. The run's `componentSourceActorUuids` are UUIDs, not ids; an empty
 * resolution falls back to `[actor]`. `craft()` consumes from every source actor and writes results
 * to the crafting actor, so an unknown actor, or a viewer who does not own every one of them, gets
 * `{ blocked: true }` rather than a Foundry permission throw.
 */
export function resolveAdvanceSources({ actor = null, run = null, fromUuid = null } = {}) {
  if (!actor) return { blocked: true };

  const resolve = typeof fromUuid === 'function' ? fromUuid : null;
  const sources =
    Array.isArray(run?.componentSourceActorUuids) && resolve
      ? run.componentSourceActorUuids.map((uuid) => resolve(uuid)).filter(Boolean)
      : [];
  const componentSourceActors = sources.length > 0 ? sources : [actor];

  const guardedActors = [actor, ...componentSourceActors];
  if (guardedActors.some((source) => source?.isOwner !== true)) {
    return { blocked: true };
  }
  return { componentSourceActors };
}
