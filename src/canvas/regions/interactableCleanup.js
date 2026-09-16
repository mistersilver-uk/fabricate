/**
 * Uninstall-safe world cleanup (issue 535). `data-models/spec.md` § Uninstall-safe world cleanup
 * owns why it exists and all three requirements, the Tile/Drawing-versus-Token asymmetry included.
 * The decision is PURE; {@link executeWorldInteractableCleanup} is the thin edge, no-throw per item.
 */

import { buildClearLinkedVisualFlags } from '../linkedVisuals/linkedInteractableVisual.js';

import { collectionToArray } from './coercion.js';
import { REGION_OWNERSHIP_FLAG, isFabricateOwnedRegion } from './interactableDeletion.js';
import { isInteractableRegionBehavior, isInteractableVisual } from './interactableRegionFlags.js';

/** The Foundry flag scope Fabricate writes under. */
const FLAG_SCOPE = 'fabricate';

/** The visual kinds Fabricate CREATED and may DELETE. A `Token` is the GM's own and is de-flagged only. */
const DELETABLE_VISUAL_KINDS = Object.freeze(['Tile', 'Drawing']);

/** The three scene-embedded collections a linked visual can live in. */
const VISUAL_COLLECTIONS = Object.freeze([
  { documentName: 'Tile', key: 'tiles' },
  { documentName: 'Drawing', key: 'drawings' },
  { documentName: 'Token', key: 'tokens' },
]);

/** A stable id for a document, tolerant of `id` / `_id`. */
function docId(doc) {
  const id = doc?.id ?? doc?._id ?? null;
  return id == null ? null : String(id);
}

/** PURE. One scene's removal set, or null when it holds nothing Fabricate owns. */
export function decideSceneInteractableCleanup(scene) {
  if (!scene || typeof scene !== 'object') return null;

  const regions = [];
  for (const region of collectionToArray(scene.regions)) {
    const removeBehaviorIds = collectionToArray(region?.behaviors)
      .filter((behavior) => isInteractableRegionBehavior(behavior))
      .map((behavior) => docId(behavior))
      .filter((id) => id != null);
    const clearOwnershipFlag = isFabricateOwnedRegion(region);
    if (removeBehaviorIds.length === 0 && !clearOwnershipFlag) continue;
    regions.push({
      regionId: docId(region),
      regionName: typeof region?.name === 'string' ? region.name : '',
      removeBehaviorIds,
      clearOwnershipFlag,
    });
  }

  const deleteVisuals = [];
  const clearVisualFlags = [];
  for (const { documentName, key } of VISUAL_COLLECTIONS) {
    for (const doc of collectionToArray(scene[key])) {
      if (!isInteractableVisual(doc)) continue;
      const id = docId(doc);
      if (id == null) continue;
      if (DELETABLE_VISUAL_KINDS.includes(documentName)) {
        deleteVisuals.push({ documentName, id });
      } else {
        // A Token marker is the GM's own token — de-flag, never delete.
        clearVisualFlags.push({ documentName, id });
      }
    }
  }

  if (regions.length === 0 && deleteVisuals.length === 0 && clearVisualFlags.length === 0) {
    return null;
  }
  return {
    sceneId: docId(scene),
    sceneName: typeof scene?.name === 'string' ? scene.name : '',
    regions,
    deleteVisuals,
    clearVisualFlags,
  };
}

/** PURE. The whole-world plan plus a summary; an empty world yields an all-zero no-op. */
export function decideWorldInteractableCleanup(scenes) {
  const plans = [];
  const summary = {
    scenesTouched: 0,
    behaviorsRemoved: 0,
    visualsDeleted: 0,
    visualFlagsCleared: 0,
    regionFlagsCleared: 0,
  };
  const list = scenes && typeof scenes[Symbol.iterator] === 'function' ? [...scenes] : [];
  for (const scene of list) {
    const plan = decideSceneInteractableCleanup(scene);
    if (!plan) continue;
    plans.push(plan);
    summary.scenesTouched += 1;
    for (const region of plan.regions) {
      summary.behaviorsRemoved += region.removeBehaviorIds.length;
      if (region.clearOwnershipFlag) summary.regionFlagsCleared += 1;
    }
    summary.visualsDeleted += plan.deleteVisuals.length;
    summary.visualFlagsCleared += plan.clearVisualFlags.length;
  }
  return { scenes: plans, summary };
}

/** Has this plan anything to do? Lets the GM entry point report "nothing to clean up". */
export function planHasWork(plan) {
  const summary = plan?.summary;
  if (!summary) return false;
  return (
    summary.behaviorsRemoved > 0 ||
    summary.visualsDeleted > 0 ||
    summary.visualFlagsCleared > 0 ||
    summary.regionFlagsCleared > 0
  );
}

/** Resolve an embedded document by id from a collection (tolerant of `.get` + arrays). */
function findById(collection, id) {
  if (id == null) return null;
  const wanted = String(id);
  if (typeof collection?.get === 'function') {
    const hit = collection.get(wanted);
    if (hit) return hit;
  }
  return collectionToArray(collection).find((doc) => docId(doc) === wanted) ?? null;
}

/** Group `[{ documentName, id }]` visual removals into a `documentName → ids[]` map. */
function groupVisualIds(entries) {
  const byName = new Map();
  for (const { documentName, id } of entries) {
    if (!byName.has(documentName)) byName.set(documentName, []);
    byName.get(documentName).push(id);
  }
  return byName;
}

/**
 * THIN EDGE. Re-resolves by id and applies the writes, no-throw PER ITEM. It touches only what the
 * plan named, so it can never reach a Region, a foreign behaviour or a Token marker.
 */
export async function executeWorldInteractableCleanup(scenes, plan) {
  const applied = {
    behaviorsRemoved: 0,
    visualsDeleted: 0,
    visualFlagsCleared: 0,
    regionFlagsCleared: 0,
  };
  const scenePlans = Array.isArray(plan?.scenes) ? plan.scenes : [];
  if (scenePlans.length === 0) return applied;

  const sceneById = new Map();
  const sceneList = scenes && typeof scenes[Symbol.iterator] === 'function' ? [...scenes] : [];
  for (const scene of sceneList) {
    const id = docId(scene);
    if (id != null) sceneById.set(id, scene);
  }

  for (const scenePlan of scenePlans) {
    const scene = sceneById.get(String(scenePlan.sceneId));
    if (!scene) continue;

    for (const regionPlan of scenePlan.regions) {
      const region = findById(scene.regions, regionPlan.regionId);
      if (!region) continue;

      if (
        regionPlan.removeBehaviorIds.length > 0 &&
        typeof region.deleteEmbeddedDocuments === 'function'
      ) {
        try {
          await region.deleteEmbeddedDocuments('RegionBehavior', regionPlan.removeBehaviorIds);
          applied.behaviorsRemoved += regionPlan.removeBehaviorIds.length;
        } catch {
          // Tolerate: a single failed behaviour delete never aborts the sweep.
        }
      }

      if (regionPlan.clearOwnershipFlag && typeof region.unsetFlag === 'function') {
        try {
          await region.unsetFlag(FLAG_SCOPE, REGION_OWNERSHIP_FLAG);
          applied.regionFlagsCleared += 1;
        } catch {
          // Tolerate: a stale ownership stamp on a kept region is harmless.
        }
      }
    }

    for (const [documentName, ids] of groupVisualIds(scenePlan.deleteVisuals)) {
      if (ids.length > 0 && typeof scene.deleteEmbeddedDocuments === 'function') {
        try {
          await scene.deleteEmbeddedDocuments(documentName, ids);
          applied.visualsDeleted += ids.length;
        } catch {
          // Tolerate: a failed marker delete leaves a harmless orphan tile/drawing.
        }
      }
    }

    for (const { documentName, id } of scenePlan.clearVisualFlags) {
      const collectionKey = VISUAL_COLLECTIONS.find((c) => c.documentName === documentName)?.key;
      const doc = collectionKey ? findById(scene[collectionKey], id) : null;
      if (doc && typeof doc.update === 'function') {
        try {
          await doc.update(buildClearLinkedVisualFlags());
          applied.visualFlagsCleared += 1;
        } catch {
          // Tolerate: a lingering reverse flag on a token is harmless once Fabricate is gone.
        }
      }
    }
  }

  return applied;
}
