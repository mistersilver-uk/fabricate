/**
 * Provenance-aware deletion for `fabricate.interactable` regions (issue 533).
 * `data-models/spec.md` § Region-level ownership & provenance-aware deletion owns all three rules:
 * the stamp at create, delete-only-what-Fabricate-added, and unknown provenance read as promoted.
 * The decision is PURE; {@link executeInteractableDeletion} is the thin edge that applies a plan.
 */

import { INTERACTABLE_BEHAVIOR_SUBTYPE } from './interactableRegionFlags.js';

/** The region-level ownership flag key under `flags.fabricate`. */
export const REGION_OWNERSHIP_FLAG = 'interactableRegion';

/** The Foundry flag scope Fabricate writes under. */
const FLAG_SCOPE = 'fabricate';

/** The `flags` fragment stamped on a Region Fabricate CREATES; a promoted one never receives it. */
export function buildInteractableRegionFlags() {
  return { [FLAG_SCOPE]: { [REGION_OWNERSHIP_FLAG]: true } };
}

/** Did Fabricate CREATE this region? Tolerates a live Region (`getFlag`) and a plain `{ flags }`. */
export function isFabricateOwnedRegion(region) {
  if (!region || typeof region !== 'object') return false;
  if (typeof region.getFlag === 'function') {
    try {
      if (region.getFlag(FLAG_SCOPE, REGION_OWNERSHIP_FLAG) === true) return true;
    } catch {
      /* fall through to the raw-flags read. */
    }
  }
  return region.flags?.[FLAG_SCOPE]?.[REGION_OWNERSHIP_FLAG] === true;
}

/** A region's behaviours as `[{ id, type }]`, tolerating the V13 collection shapes and an array. */
export function readRegionBehaviors(region) {
  const behaviors = region?.behaviors;
  const list = Array.isArray(behaviors?.contents)
    ? behaviors.contents
    : typeof behaviors?.values === 'function'
      ? [...behaviors.values()]
      : Array.isArray(behaviors)
        ? behaviors
        : [];
  return list.map((behavior) => ({
    id: behavior?.id ?? behavior?._id ?? null,
    type: behavior?.type ?? null,
  }));
}

/** Whether a `{ type }` behaviour ref is a `fabricate.interactable`. */
function isFabricateInteractableBehavior(behavior) {
  return behavior?.type === INTERACTABLE_BEHAVIOR_SUBTYPE;
}

/** The ids removed: the one asked for, else every `fabricate.interactable` on the region. */
function resolveBehaviorIds(fabricateBehaviors, targetBehaviorId) {
  const allIds = fabricateBehaviors.map((behavior) => behavior.id).filter((id) => id != null);
  const target = targetBehaviorId == null ? null : String(targetBehaviorId);
  if (target && allIds.some((id) => String(id) === target)) {
    return [target];
  }
  return allIds;
}

/**
 * PURE. Requirement 2: `{ scope: 'region' }` when Fabricate created the region and nothing foreign
 * lives on it, else `{ scope: 'behavior', behaviorIds, clearRegionOwnershipFlag }`, where the flag
 * clears only when Fabricate owned a region foreign behaviours keep alive.
 */
export function decideInteractableDeletion({
  fabricateOwnsRegion,
  behaviors = [],
  targetBehaviorId,
} = {}) {
  const list = Array.isArray(behaviors) ? behaviors : [];
  const fabricateBehaviors = list.filter(isFabricateInteractableBehavior);
  const hasForeignBehavior = list.some((behavior) => !isFabricateInteractableBehavior(behavior));

  // Unknown (legacy) provenance reads false here, falling through to the conservative path.
  if (fabricateOwnsRegion === true && !hasForeignBehavior) {
    return { scope: 'region' };
  }

  return {
    scope: 'behavior',
    behaviorIds: resolveBehaviorIds(fabricateBehaviors, targetBehaviorId),
    clearRegionOwnershipFlag: fabricateOwnsRegion === true,
  };
}

/** The Foundry-free wrapper over {@link decideInteractableDeletion} the app shells call. */
export function planInteractableDeletion(region, { targetBehaviorId } = {}) {
  return decideInteractableDeletion({
    fabricateOwnsRegion: isFabricateOwnedRegion(region),
    behaviors: readRegionBehaviors(region),
    targetBehaviorId,
  });
}

/**
 * The thin edge: `region.delete()`, else `deleteEmbeddedDocuments` plus `unsetFlag` when a
 * Fabricate-owned region survives. The flag clear is no-throw; the caller wraps the deletion.
 */
export async function executeInteractableDeletion(region, plan) {
  if (!region || !plan) return false;

  if (plan.scope === 'region') {
    if (typeof region.delete !== 'function') return false;
    await region.delete();
    return true;
  }

  const ids = Array.isArray(plan.behaviorIds) ? plan.behaviorIds.filter((id) => id != null) : [];
  if (ids.length > 0 && typeof region.deleteEmbeddedDocuments === 'function') {
    await region.deleteEmbeddedDocuments('RegionBehavior', ids);
  }
  if (plan.clearRegionOwnershipFlag === true && typeof region.unsetFlag === 'function') {
    try {
      await region.unsetFlag(FLAG_SCOPE, REGION_OWNERSHIP_FLAG);
    } catch {
      // Defensive: a kept region with a stale ownership stamp is harmless.
    }
  }
  return true;
}
