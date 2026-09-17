/**
 * The shared way the config panel, socket and respawn edges address one placed region behaviour
 * by `{ sceneId, regionId, behaviorId }`, whichever node pool it uses
 * (`data-models/spec.md` § Gathering-Task Node State).
 */

/**
 * PURE. The scene, region and behaviour ids behind a live RegionBehavior (whose `parent` is the
 * Region, whose `parent` is the Scene). Null when any id is missing.
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
