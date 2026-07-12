/**
 * Uninstall-safe world cleanup for `fabricate.interactable` region behaviours and
 * Fabricate's own linked-visual markers (issue 535).
 *
 * THE CORE CAVEAT this module exists to work around.
 * `fabricate.interactable` is a MODULE-DEFINED Region Behaviour sub-type (declared
 * in `module.json`'s `documentTypes.RegionBehavior.interactable`, auto-namespaced to
 * `fabricate.interactable`, and registered at runtime on `CONFIG.RegionBehavior`).
 * When Fabricate is DISABLED or UNINSTALLED, Foundry can no longer construct the
 * sub-type, so every such behaviour becomes an unregistered-sub-type document that
 * logs `"fabricate.interactable" is not a valid type` on EVERY load of the scene it
 * sits on — and there is no core UI to view or remove it (foundryvtt#11234). On
 * Foundry < 14.360 the invalid behaviour cascade-invalidates its parent Region and
 * the whole Scene; on ≥ 14.360 it is merely quarantined and logged. Foundry does NOT
 * remove module sub-typed documents on disable, and Fabricate cannot change core —
 * so the only safe fix is to let a GM STRIP Fabricate's behaviours + markers from the
 * world BEFORE uninstalling.
 *
 * WHAT THIS REMOVES (only what Fabricate owns):
 *   - every `fabricate.interactable` Region Behaviour ({@link isInteractableRegionBehavior}),
 *     via `region.deleteEmbeddedDocuments('RegionBehavior', …)` — the behaviour only,
 *     NEVER the parent Region and NEVER any foreign (non-Fabricate) behaviour on it;
 *   - Fabricate's own linked-visual MARKERS — Tiles and Drawings carrying the reverse
 *     flag `flags.fabricate.isInteractableVisual` ({@link isInteractableVisual}) —
 *     which Fabricate created as presentation for its interactables;
 *   - the region-level ownership stamp `flags.fabricate.interactableRegion`
 *     ({@link REGION_OWNERSHIP_FLAG}), unset on any region that still carries it.
 *
 * WHAT THIS NEVER TOUCHES (user data):
 *   - a parent Region is NEVER deleted (unlike single-interactable deletion, which may
 *     delete a Fabricate-CREATED region wholesale). Cleanup leaves every Region in
 *     place — an empty leftover region is a harmless artefact a GM can delete by hand,
 *     which is the deliberately conservative, can-never-destroy-user-data choice;
 *   - a foreign behaviour on a promoted region is never removed;
 *   - a TOKEN marker is NEVER deleted. A Token marker is an EXISTING GM-owned token the
 *     GM relinked (e.g. a merchant NPC); Fabricate only stamped a reverse flag on it.
 *     Cleanup CLEARS that reverse flag ({@link buildClearLinkedVisualFlags}) and leaves
 *     the token itself intact.
 *
 * The decision is PURE — {@link decideWorldInteractableCleanup} takes scene documents
 * (or plain fakes) and returns the EXACT id-keyed set to remove, so it is unit-testable
 * without Foundry. {@link executeWorldInteractableCleanup} is the thin Foundry edge that
 * re-resolves each live document by id and applies the plan (no-throw per item).
 */

import { buildClearLinkedVisualFlags } from '../linkedVisuals/linkedInteractableVisual.js';

import { collectionToArray } from './coercion.js';
import { REGION_OWNERSHIP_FLAG, isFabricateOwnedRegion } from './interactableDeletion.js';
import { isInteractableRegionBehavior, isInteractableVisual } from './interactableRegionFlags.js';

/** The Foundry flag scope Fabricate writes under. */
const FLAG_SCOPE = 'fabricate';

/**
 * The visual kinds Fabricate CREATED and may therefore DELETE on cleanup. A `Token`
 * marker is deliberately excluded — it is the GM's own token and is only de-flagged.
 */
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

/**
 * Decide the cleanup plan for ONE scene. PURE: reads the scene's regions +
 * behaviours + linked-visual documents and returns the id-keyed removal set, or
 * `null` when the scene has nothing Fabricate owns (so the world aggregate can skip
 * no-op scenes).
 *
 * @param {object} scene  A Scene document (or a plain `{ id, name, regions, tiles, drawings, tokens }`).
 * @returns {object|null}
 */
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

/**
 * Decide the cleanup plan for the WHOLE world. PURE: maps every scene through
 * {@link decideSceneInteractableCleanup}, drops no-op scenes, and rolls up a
 * summary. An empty world (no scenes, or no Fabricate-owned documents) yields an
 * empty plan with an all-zero summary — the caller treats that as a no-op.
 *
 * @param {Iterable<object>} scenes  The world's scenes (`game.scenes`, or a plain array).
 * @returns {{
 *   scenes: object[],
 *   summary: {
 *     scenesTouched: number,
 *     behaviorsRemoved: number,
 *     visualsDeleted: number,
 *     visualFlagsCleared: number,
 *     regionFlagsCleared: number,
 *   },
 * }}
 */
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

/**
 * Whether a cleanup plan has anything to do. A convenience for the GM entry point so
 * it can report "nothing to clean up" without re-deriving the summary.
 *
 * @param {{ summary?: object }} plan  A {@link decideWorldInteractableCleanup} result.
 * @returns {boolean}
 */
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
 * Apply a world cleanup plan to the live scene documents. THIN Foundry EDGE: it
 * re-resolves each region / visual by id from the passed scenes and performs the
 * `deleteEmbeddedDocuments` / `unsetFlag` / `update` writes. No-throw PER ITEM — a
 * single failed delete never aborts the rest of the sweep — and it only ever touches
 * the documents the pure plan named, so it can never delete a Region, a foreign
 * behaviour, or a Token marker.
 *
 * @param {Iterable<object>} scenes  The same live scenes the plan was derived from.
 * @param {object} plan  A {@link decideWorldInteractableCleanup} result.
 * @returns {Promise<{
 *   behaviorsRemoved: number,
 *   visualsDeleted: number,
 *   visualFlagsCleared: number,
 *   regionFlagsCleared: number,
 * }>} The counts actually applied.
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
