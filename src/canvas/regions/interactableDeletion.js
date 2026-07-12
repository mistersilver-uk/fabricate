/**
 * Provenance-aware deletion for `fabricate.interactable` regions (issue 533).
 *
 * A Fabricate interactable is a Scene Region carrying a `fabricate.interactable`
 * Region Behaviour. That region reaches Fabricate through TWO very different
 * lifecycles:
 *
 *   - CREATED by Fabricate — a drag/drop or click-to-place spawns a brand-new
 *     Region whose ONLY reason to exist is the interactable. Fabricate owns the
 *     whole Region, so deleting the interactable may safely delete the Region.
 *   - PROMOTED by the user — the GM points Fabricate at a region THEY already drew
 *     for some other purpose (lighting/darkness, conditions, a third-party module)
 *     and Fabricate merely ATTACHES a behaviour to it. Fabricate owns only that one
 *     behaviour; the Region and every OTHER behaviour on it are the user's data.
 *
 * Before this module the delete path called `region.delete()` unconditionally, so
 * deleting a promoted interactable destroyed the user's underlying Region and all
 * its foreign behaviours — silent, irreversible data loss (issue 533).
 *
 * The fix: stamp a durable region-level ownership flag
 * (`flags.fabricate.interactableRegion`) when Fabricate CREATES a region, and route
 * every delete through the PURE {@link decideInteractableDeletion} /
 * {@link planInteractableDeletion} decision so we only ever remove what Fabricate
 * added:
 *
 *   - Fabricate-created region carrying NO foreign behaviours ⇒ delete the Region.
 *   - Otherwise (promoted foreign region, OR a region also carrying non-Fabricate
 *     behaviours) ⇒ delete only the `fabricate.interactable` behaviour(s) and clear
 *     Fabricate's region flag, leaving the Region and all foreign behaviours intact.
 *
 * SAFE LEGACY DEFAULT: a region created BEFORE this fix carries no ownership flag,
 * so its provenance is unknown. Unknown provenance is treated as PROMOTED
 * (do-not-destroy) — the conservative choice that can never destroy user data. The
 * cost is that a legacy Fabricate-created region may be left behind as an empty
 * Region after its interactable is removed; that is a harmless leftover, never data
 * loss, and the GM can delete it by hand.
 *
 * The decision is PURE (region flags + behaviour list → a plan) so it is unit
 * testable without Foundry. {@link executeInteractableDeletion} is the thin edge
 * that applies a plan to a live Region document.
 */

import { INTERACTABLE_BEHAVIOR_SUBTYPE } from './interactableRegionFlags.js';

/** The region-level ownership flag key under `flags.fabricate`. */
export const REGION_OWNERSHIP_FLAG = 'interactableRegion';

/** The Foundry flag scope Fabricate writes under. */
const FLAG_SCOPE = 'fabricate';

/**
 * The `flags` fragment stamped on a Region that Fabricate CREATES, marking it as
 * safe to delete wholesale later. Merged into the Region create payload
 * (`flags: buildInteractableRegionFlags()`). Promoted foreign regions never receive
 * it, which is exactly what lets the delete path tell the two apart.
 *
 * @returns {{ fabricate: { interactableRegion: true } }}
 */
export function buildInteractableRegionFlags() {
  return { [FLAG_SCOPE]: { [REGION_OWNERSHIP_FLAG]: true } };
}

/**
 * Whether Fabricate CREATED this region (vs. merely promoting a user region).
 * Tolerates a live Region document (`getFlag`) and a plain object (`flags`), so it
 * is usable both at the Foundry edge and in pure tests.
 *
 * @param {object} region  A Region document or plain `{ flags }` object.
 * @returns {boolean}
 */
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

/**
 * Read a region's behaviours as a plain `[{ id, type }]` list, tolerating the V13
 * embedded-collection shapes (a `RegionBehaviorCollection` with `.contents` /
 * `.values()`, or a plain array). Pure on its input (no `globalThis`).
 *
 * @param {object} region  A Region document or plain `{ behaviors }` object.
 * @returns {Array<{ id: string|null, type: string|null }>}
 */
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

/**
 * Resolve WHICH Fabricate behaviour ids to remove in the behaviour-scoped path:
 * prefer the specific behaviour the user asked to delete; fall back to every
 * `fabricate.interactable` behaviour on the region.
 */
function resolveBehaviorIds(fabricateBehaviors, targetBehaviorId) {
  const allIds = fabricateBehaviors.map((behavior) => behavior.id).filter((id) => id != null);
  const target = targetBehaviorId == null ? null : String(targetBehaviorId);
  if (target && allIds.some((id) => String(id) === target)) {
    return [target];
  }
  return allIds;
}

/**
 * PURE ownership decision. Given a region's provenance flag, its behaviour list,
 * and the behaviour the user is deleting, decide EXACTLY what to remove.
 *
 *   { scope: 'region' }
 *     — Fabricate created this region and it carries no foreign behaviours, so the
 *       whole Region is Fabricate's and is safe to delete.
 *
 *   { scope: 'behavior', behaviorIds: string[], clearRegionOwnershipFlag: boolean }
 *     — promoted foreign region, OR a region also carrying non-Fabricate
 *       behaviours, OR unknown (legacy) provenance. Remove only Fabricate's
 *       behaviour(s); leave the Region and every foreign behaviour intact.
 *       `clearRegionOwnershipFlag` is true only when Fabricate DID own the region
 *       but foreign behaviours keep it alive, so its now-stale ownership stamp is
 *       cleared.
 *
 * @param {object} params
 * @param {boolean} params.fabricateOwnsRegion  `flags.fabricate.interactableRegion === true`.
 * @param {Array<{ id, type }>} [params.behaviors]  All behaviours on the region.
 * @param {string} [params.targetBehaviorId]  The `fabricate.interactable` behaviour being deleted.
 * @returns {{ scope: 'region' } | { scope: 'behavior', behaviorIds: string[], clearRegionOwnershipFlag: boolean }}
 */
export function decideInteractableDeletion({
  fabricateOwnsRegion,
  behaviors = [],
  targetBehaviorId,
} = {}) {
  const list = Array.isArray(behaviors) ? behaviors : [];
  const fabricateBehaviors = list.filter(isFabricateInteractableBehavior);
  const hasForeignBehavior = list.some((behavior) => !isFabricateInteractableBehavior(behavior));

  // Only a region Fabricate provably CREATED, and which carries nothing foreign,
  // may be deleted wholesale. Unknown (legacy) provenance is fabricateOwnsRegion
  // false ⇒ falls through to the conservative behaviour-only path.
  if (fabricateOwnsRegion === true && !hasForeignBehavior) {
    return { scope: 'region' };
  }

  return {
    scope: 'behavior',
    behaviorIds: resolveBehaviorIds(fabricateBehaviors, targetBehaviorId),
    clearRegionOwnershipFlag: fabricateOwnsRegion === true,
  };
}

/**
 * Read a live/plain Region's provenance + behaviours and return the deletion plan.
 * The Foundry-free convenience wrapper over {@link decideInteractableDeletion} the
 * app shells call.
 *
 * @param {object} region  A Region document (or plain `{ flags, behaviors }`).
 * @param {object} [options]
 * @param {string} [options.targetBehaviorId]  The behaviour being deleted.
 * @returns {{ scope: 'region' } | { scope: 'behavior', behaviorIds: string[], clearRegionOwnershipFlag: boolean }}
 */
export function planInteractableDeletion(region, { targetBehaviorId } = {}) {
  return decideInteractableDeletion({
    fabricateOwnsRegion: isFabricateOwnedRegion(region),
    behaviors: readRegionBehaviors(region),
    targetBehaviorId,
  });
}

/**
 * Apply a deletion plan to a live Region document. The thin Foundry edge — it only
 * touches the passed Region document, so it is testable with a fake that records
 * its calls.
 *
 *   scope 'region'   ⇒ `region.delete()`.
 *   scope 'behavior' ⇒ `region.deleteEmbeddedDocuments('RegionBehavior', ids)` and,
 *                       when the (Fabricate-owned) region is kept alive by foreign
 *                       behaviours, `region.unsetFlag('fabricate', …)` to drop the
 *                       now-stale ownership stamp.
 *
 * No-throw on the flag-clear (a working, non-destroyed region is acceptable even if
 * clearing the stamp fails); the caller wraps the main deletion.
 *
 * @param {object} region  The live Region document.
 * @param {object} plan  A {@link decideInteractableDeletion} result.
 * @returns {Promise<boolean>} Whether a deletion was attempted.
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
