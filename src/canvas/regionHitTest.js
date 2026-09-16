/**
 * The only Foundry coupling to the V13 Scene Region containment API, isolated so the collection
 * and flag reads test against fakes. It answers two questions: POINT containment for drop-time
 * environment resolution, and TOKEN containment for the active GM's interact re-check, whose
 * signal rule is `data-models/spec.md` § fabricate.interactable Region Behaviour, requirement 6.
 */

/** A region's `flags.fabricate.environmentId`, or null. */
function regionEnvironmentId(region) {
  const id = region?.flags?.fabricate?.environmentId;
  return typeof id === 'string' && id.trim() ? id.trim() : null;
}

/**
 * Point containment, preferring `RegionDocument#testPoint` over the deprecated placeable form.
 * `elevation` is an EXPLICIT third parameter defaulting to 0, deliberately not read off `point`:
 * `testPoint` reads a non-finite elevation as a SILENT false, so drifting into `undefined` would
 * present as an unexplained containment miss rather than an error.
 */
function regionContainsPoint(region, point, elevation = 0) {
  // V13: the document-level testPoint takes a single ElevatedPoint.
  if (typeof region?.testPoint === 'function') {
    try {
      return region.testPoint({ x: point?.x, y: point?.y, elevation }) === true;
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

/** The environment ids of every Fabricate-flagged region containing the drop point, or `[]`. */
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
 * Every `fabricate.interactable` behaviour whose Region contains the token centre, paired with its
 * Region — {@link regionEnvironmentIdsAtPoint} keyed on the subtype rather than the env-id flag.
 * The subtype predicate is INJECTED, keeping this module free of the flags module, and the token's
 * OWN elevation is tested so an elevation-banded region re-prompts (issue 999).
 */
export function interactableBehaviorsContainingToken({
  scene,
  token,
  isInteractableBehavior,
} = {}) {
  const point = tokenCenter(token);
  if (!point) return [];
  const elevation = tokenElevation(token);
  const regions = collectRegions(scene?.regions);
  const out = [];
  for (const region of regions) {
    if (!regionContainsPoint(region, point, elevation)) continue;
    const behaviors = collectRegions(region?.behaviors);
    for (const behavior of behaviors) {
      if (typeof isInteractableBehavior === 'function' && isInteractableBehavior(behavior) !== true)
        continue;
      out.push({ region, behavior });
    }
  }
  return out;
}

/** Region UUIDs containing the token centre — any region, not only flagged ones. */
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

/** Sentinel for a signal that could not answer. Distinct from both `true` and `false`. */
const INDETERMINATE = null;

/**
 * TOKEN containment answered WITHOUT the rendered canvas (issue 999): the active GM re-validates
 * every request and may not be viewing that scene, or on V14 that scene LEVEL, so `tokenDoc.object`
 * is null. Requirement 6 owns the three-signal order and the admit-when-none-answers posture.
 * Two things it does not state. Signal 2 is DEFINITIVE IN BOTH DIRECTIONS, so a false denies and
 * signal 3 — a strictly worse centre-point approximation of that very predicate — is not consulted.
 * And signals 2 and 3 deliberately do NOT route through {@link regionContainsPoint}, which submits
 * the caller's elevation for a POINT and would re-hardcode elevation 0 for a TOKEN.
 */
export function regionContainsTokenDocument(region, tokenDoc) {
  if (membershipIncludesRegion(tokenDoc, region)) return true;
  const byFoundry = testInsideRegionSignal(region, tokenDoc);
  if (byFoundry !== INDETERMINATE) return byFoundry;
  const byCentre = centerPointSignal(region, tokenDoc);
  return byCentre === INDETERMINATE ? true : byCentre;
}

/**
 * Signal 1, read through {@link collectRegions} so every shape Foundry may return (a `Set`, an
 * EmbeddedCollection, an array) is tolerated — an `Array.isArray` read would miss the real `Set`
 * and leave the primary path dead in production while green against fixtures. A miss is NOT a denial.
 */
function membershipIncludesRegion(tokenDoc, region) {
  const wanted = region?.id == null ? null : String(region.id);
  for (const candidate of collectRegions(tokenDoc?.regions)) {
    if (candidate === region) return true;
    // A bare id string is fixture-only tolerance; Foundry always returns RegionDocuments.
    const id = typeof candidate === 'string' ? candidate : candidate?.id;
    if (wanted !== null && id != null && String(id) === wanted) return true;
  }
  return false;
}

/** Signal 2. Definitive in both directions; indeterminate only when absent or throwing. */
function testInsideRegionSignal(region, tokenDoc) {
  if (typeof tokenDoc?.testInsideRegion !== 'function') return INDETERMINATE;
  try {
    return tokenDoc.testInsideRegion(region) === true;
  } catch {
    return INDETERMINATE;
  }
}

/** Signal 3. Indeterminate with no `testPoint`, no finite centre, or a throw. */
function centerPointSignal(region, tokenDoc) {
  if (typeof region?.testPoint !== 'function') return INDETERMINATE;
  const point = tokenDocumentElevatedCenter(tokenDoc);
  if (!point) return INDETERMINATE;
  try {
    return region.testPoint(point) === true;
  } catch {
    return INDETERMINATE;
  }
}

/**
 * The token centre as a complete `ElevatedPoint`, or null when no finite `x`/`y` resolves.
 * Normalizing the elevation after EITHER source is load-bearing: `getCenterPoint()` returns the
 * document's verbatim, so an absent one would reach `testPoint` and read as a silent denial.
 */
function tokenDocumentElevatedCenter(tokenDoc) {
  const center = tokenDocumentCenterPoint(tokenDoc);
  if (!center) return null;
  const elevation = Number(center.elevation ?? tokenDoc?.elevation);
  return {
    x: center.x,
    y: center.y,
    elevation: Number.isFinite(elevation) ? elevation : 0,
  };
}

/**
 * The centre plus whatever elevation the source carried, split out so the caller normalizes ONE
 * elevation for both. It prefers `getCenterPoint()` FIRST, the opposite order from
 * {@link tokenDocumentCenter} and deliberately: that function avoids a lag which needs an actively
 * animating rendered placeable, and this path exists for the client that has none.
 */
function tokenDocumentCenterPoint(tokenDoc) {
  if (typeof tokenDoc?.getCenterPoint === 'function') {
    try {
      const center = tokenDoc.getCenterPoint();
      const x = Number(center?.x);
      const y = Number(center?.y);
      if (Number.isFinite(x) && Number.isFinite(y)) return { x, y, elevation: center?.elevation };
    } catch {
      // fall through to the computed centre.
    }
  }
  // NOT `{ ...tokenDocumentCenter(doc), elevation }`: that spreads a null centre into `{}` and
  // submits an undefined x/y, which testPoint also reads as false.
  const computed = tokenDocumentCenter(tokenDoc);
  return computed ? { x: computed.x, y: computed.y } : null;
}

/** PURE. The first of `tokenDocs` whose actor matches, else null, for the re-prompt (issue 332). */
export function selectRepromptTokenDoc(tokenDocs, actorId) {
  if (!actorId) return null;
  const list = Array.isArray(tokenDocs) ? tokenDocs : [];
  const wanted = String(actorId);
  for (const tokenDoc of list) {
    const id = tokenDoc?.actorId ?? tokenDoc?.actor?.id ?? null;
    if (id != null && String(id) === wanted) return tokenDoc;
  }
  return null;
}

/**
 * A token's centre from its DOCUMENT, preferring the document position over the placeable's
 * `center`: at the `updateToken` hook the placeable still reports the OLD position mid-animation
 * while the document holds the new one, which live travel sensing reads.
 */
export function tokenDocumentCenter(token) {
  const x = Number(token?.x);
  const y = Number(token?.y);
  // PRIMARY: the DOCUMENT position plus footprint. Reading the lagging placeable centre here
  // produces an off-by-one — the region the token just LEFT.
  const grid = Number(token?.parent?.grid?.size);
  if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(grid) && grid > 0) {
    const w = Number(token?.width);
    const h = Number(token?.height);
    return {
      x: x + (grid * (Number.isFinite(w) ? w : 1)) / 2,
      y: y + (grid * (Number.isFinite(h) ? h : 1)) / 2,
    };
  }
  // Fallbacks for gridless or unusual scenes where the footprint cannot be sized.
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

/** A token's centre in scene space, preferring the live placeable's `center`, else the top-left. */
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

/**
 * A token's elevation off its DOCUMENT, normalized to 0 when non-finite. The document read is
 * load-bearing: the `Token` PLACEABLE has no `elevation` getter and `Token#center` drops it, yet
 * the dominant caller hands in a placeable — so `token.elevation` would be `undefined` on the live
 * path and fall back to 0, the very defect this fixes, while a document fixture passed green.
 */
function tokenElevation(token) {
  const elevation = Number(token?.document?.elevation ?? token?.elevation);
  return Number.isFinite(elevation) ? elevation : 0;
}
