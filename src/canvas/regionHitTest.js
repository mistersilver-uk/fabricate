/**
 * Thin, testable seam over the Foundry V13 Scene Region point-in-region test.
 *
 * The pure env-resolution decision (`environmentResolution.js`) takes a list of
 * environment ids from the regions that CONTAIN the drop point; this module
 * produces that list. It is isolated here so the V13 region API surface
 * (`region.testPoint` / the region polygon) is the only Foundry coupling, and the
 * collection + flag-read logic can be unit-tested against fakes.
 *
 * A Fabricate-flagged region carries `flags.fabricate.environmentId`. V13 exposes
 * containment via the document-level `RegionDocument#testPoint(point:
 * ElevatedPoint)` — a single `{ x, y, elevation }` object. The placeable's
 * `Region#object.testPoint(point, elevation?)` is deprecated in V13; we prefer the
 * document method and only fall back to the deprecated placeable shape when the
 * document method is absent, returning no hit when neither is available.
 */

/**
 * Read a region's Fabricate environment id flag, or null.
 *
 * @param {object} region  A RegionDocument (or its placeable's document).
 * @returns {string|null}
 */
function regionEnvironmentId(region) {
  const id = region?.flags?.fabricate?.environmentId;
  return typeof id === 'string' && id.trim() ? id.trim() : null;
}

/**
 * Whether a region contains a scene-space point. Prefers the V13 document-level
 * `RegionDocument#testPoint({ x, y, elevation })`; only falls back to the
 * deprecated placeable `region.object.testPoint(point)` when the document method
 * is absent, returning false when neither exists.
 *
 * @param {object} region  RegionDocument.
 * @param {{ x: number, y: number }} point  Scene-space drop point.
 * @returns {boolean}
 */
function regionContainsPoint(region, point) {
  // V13: the document-level testPoint takes a single ElevatedPoint; a 2D drop
  // uses elevation 0.
  if (typeof region?.testPoint === 'function') {
    try {
      return region.testPoint({ x: point?.x, y: point?.y, elevation: 0 }) === true;
    } catch {
      return false;
    }
  }
  // Deprecated fallback: the placeable's testPoint(point, elevation?).
  const placeable = region?.object;
  if (typeof placeable?.testPoint === 'function') {
    try {
      return placeable.testPoint(point) === true;
    } catch {
      return false;
    }
  }
  return false;
}

/**
 * Collect the environment ids of every Fabricate-flagged Scene Region that
 * contains the drop point. Returns `[]` when the scene has no flagged regions or
 * none contain the point.
 *
 * @param {object} args
 * @param {object} args.scene  The active scene (carries `regions`).
 * @param {{ x: number, y: number }} args.point  Scene-space drop point.
 * @returns {string[]}
 */
export function regionEnvironmentIdsAtPoint({ scene, point } = {}) {
  const regions = collectRegions(scene?.regions);
  const ids = [];
  for (const region of regions) {
    const envId = regionEnvironmentId(region);
    if (!envId) continue;
    if (regionContainsPoint(region, point)) ids.push(envId);
  }
  return ids;
}

function collectRegions(collection) {
  if (!collection) return [];
  if (Array.isArray(collection)) return collection;
  if (Array.isArray(collection.contents)) return collection.contents;
  if (typeof collection.values === 'function') return [...collection.values()];
  if (typeof collection[Symbol.iterator] === 'function') return [...collection];
  return [];
}

/**
 * Collect every `fabricate.interactable` Region Behaviour whose Region contains a
 * token's center, paired with its owning Region. Used by the re-trigger path
 * (`controlToken` / keybind) so a token already inside an interactable region on
 * scene load (where Foundry's `tokenEnter` never fires) can still raise the
 * prompt. Generalizes {@link regionEnvironmentIdsAtPoint}: same containment test,
 * but keyed on the behaviour subtype rather than the env-id flag.
 *
 * The behaviour-subtype predicate is INJECTED (the pure
 * `isInteractableRegionBehavior`), keeping this module free of the flags module
 * and unit-testable against fakes.
 *
 * @param {object} args
 * @param {object} args.scene  The token's scene (carries `regions`).
 * @param {object} args.token  A TokenDocument (or its placeable's document) with center coords.
 * @param {(behavior: object) => boolean} args.isInteractableBehavior  Subtype predicate.
 * @returns {Array<{ region: object, behavior: object }>}
 */
export function interactableBehaviorsContainingToken({
  scene,
  token,
  isInteractableBehavior,
} = {}) {
  const point = tokenCenter(token);
  if (!point) return [];
  const regions = collectRegions(scene?.regions);
  const out = [];
  for (const region of regions) {
    if (!regionContainsPoint(region, point)) continue;
    const behaviors = collectRegions(region?.behaviors);
    for (const behavior of behaviors) {
      if (typeof isInteractableBehavior === 'function' && isInteractableBehavior(behavior) !== true)
        continue;
      out.push({ region, behavior });
    }
  }
  return out;
}

/**
 * Collect the UUIDs of every Scene Region on the given scene whose shape contains
 * the token's center. Keyed on `region.uuid` (not the Fabricate env flag), so it
 * works for plain regions a GM has drawn. Backs the travel-marker current-region
 * sensor: which Scene Regions is this token standing in right now?
 *
 * @param {object} args
 * @param {object} args.scene  The token's scene (carries `regions`).
 * @param {object} args.token  A TokenDocument (or its placeable) with center coords.
 * @returns {string[]} Region UUIDs containing the token center ([] when none / no point).
 */
export function sceneRegionUuidsContainingToken({ scene, token } = {}) {
  const point = tokenDocumentCenter(token);
  if (!point) return [];
  const uuids = [];
  for (const region of collectRegions(scene?.regions)) {
    if (!region?.uuid) continue;
    if (regionContainsPoint(region, point)) uuids.push(String(region.uuid));
  }
  return uuids;
}

/**
 * Resolve a token's CENTER point from its DOCUMENT, preferring the authoritative
 * document position over the placeable's `center`. This matters for live travel
 * sensing: the `updateToken` hook fires before the placeable finishes its move
 * animation, so `object.center` still reports the OLD position while the document
 * already holds the new one. Order: V13 `TokenDocument#getCenterPoint()` →
 * computed from `x/y` + footprint (when a grid size is known) → the placeable
 * `center` → the document top-left. Returns null when nothing finite resolves.
 *
 * @param {object} token  TokenDocument (preferred) or its placeable.
 * @returns {{ x: number, y: number } | null}
 */
export function tokenDocumentCenter(token) {
  const x = Number(token?.x);
  const y = Number(token?.y);
  // PRIMARY: compute the centre from the DOCUMENT position + footprint. At the
  // `updateToken` hook the document already holds the destination, while the
  // placeable centre / `getCenterPoint()` still lag behind the move animation —
  // reading those produces an off-by-one (the region the token just LEFT).
  const grid = Number(token?.parent?.grid?.size);
  if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(grid) && grid > 0) {
    const w = Number(token?.width);
    const h = Number(token?.height);
    return {
      x: x + (grid * (Number.isFinite(w) ? w : 1)) / 2,
      y: y + (grid * (Number.isFinite(h) ? h : 1)) / 2,
    };
  }
  // Fallbacks for gridless / unusual scenes where the footprint cannot be sized.
  if (typeof token?.getCenterPoint === 'function') {
    try {
      const c = token.getCenterPoint();
      if (Number.isFinite(Number(c?.x)) && Number.isFinite(Number(c?.y))) {
        return { x: Number(c.x), y: Number(c.y) };
      }
    } catch {
      // fall through
    }
  }
  const center = token?.object?.center;
  if (center && Number.isFinite(Number(center.x)) && Number.isFinite(Number(center.y))) {
    return { x: Number(center.x), y: Number(center.y) };
  }
  if (Number.isFinite(x) && Number.isFinite(y)) return { x, y };
  return null;
}

/**
 * Resolve a token's CENTER point in scene-space, preferring the live placeable's
 * `center` (the authoritative pixel center Foundry computes from the footprint),
 * falling back to the document's top-left `x/y`. Returns null when no finite
 * point resolves.
 *
 * @param {object} token  TokenDocument or its placeable.
 * @returns {{ x: number, y: number } | null}
 */
function tokenCenter(token) {
  const center = token?.object?.center ?? token?.center;
  if (center && Number.isFinite(Number(center.x)) && Number.isFinite(Number(center.y))) {
    return { x: Number(center.x), y: Number(center.y) };
  }
  const x = Number(token?.x);
  const y = Number(token?.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x, y };
}
