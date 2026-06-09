/**
 * Region-behaviour identity helper for the region-first interactable model.
 *
 * A canvas gathering-task interactable is a pure (environment, task) shortcut: it
 * carries NO per-interactable node pool. The environment's `nodeRuntime[taskId]`
 * is the single source of truth for depletion/respawn, so there is no
 * behaviour-backed node-state adapter here. What remains is the pure ref resolver
 * used by the config panel / socket edges to address one placed behaviour by
 * `{ sceneId, regionId, behaviorId }`.
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
  const sceneId = region?.parent?.id ?? region?.parent?._id
    ?? behavior?.scene?.id ?? behavior?.sceneId ?? null;
  if (!behaviorId || !regionId || !sceneId) return null;
  return { sceneId: String(sceneId), regionId: String(regionId), behaviorId: String(behaviorId) };
}
