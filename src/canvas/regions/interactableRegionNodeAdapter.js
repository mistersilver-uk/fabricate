/**
 * Region-behaviour identity helper for the region-first interactable model.
 *
 * A canvas gathering-task interactable defaults to a LINKED (environment, task)
 * shortcut whose depletion/respawn follows the task via the environment's
 * `nodeRuntime[taskId]`. It may be UNLINKED with its own independent node pool
 * (issue 302) when `taskNodeLink === 'unlinked'` (the pool lives verbatim on the
 * behaviour `system.node`; `GatheringRichStateService._resolveNodeSource` selects
 * which pool an attempt addresses). Either way, the pure ref resolver below is the
 * shared way the config panel / socket / respawn edges address one placed
 * behaviour by `{ sceneId, regionId, behaviorId }`.
 */

/**
 * Resolve a region-behaviour document's scene + region + behaviour ids, tolerating
 * a live RegionBehavior document (whose `parent` is the Region, whose `parent` is
 * the Scene). Pure (no `game.*`): returns null when any id is missing.
 *
 * @param {object} behavior
 * @returns {{ sceneId: string, regionId: string, behaviorId: string } | null}
 */
export function identifyRegionBehaviorRef(behavior) {
  const behaviorId = behavior?.id ?? behavior?._id ?? null;
  const region = behavior?.parent ?? null;
  const regionId = region?.id ?? region?._id ?? behavior?.regionId ?? null;
  const sceneId =
    region?.parent?.id ?? region?.parent?._id ?? behavior?.scene?.id ?? behavior?.sceneId ?? null;
  if (!behaviorId || !regionId || !sceneId) return null;
  return { sceneId: String(sceneId), regionId: String(regionId), behaviorId: String(behaviorId) };
}
