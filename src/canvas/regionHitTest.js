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
 *
 * It also owns TOKEN→region containment ({@link regionContainsTokenDocument}),
 * which is a different question from point containment and MUST NOT be answered by
 * re-deriving geometry: the active GM re-validating a player's interact request may
 * not be viewing that player's scene, so nothing canvas-rendered is available.
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
 * The elevation is an EXPLICIT third parameter defaulting to 0, deliberately NOT
 * read off `point.elevation`. Callers that genuinely have no elevation (a mouse
 * drop point; a centre built by {@link tokenDocumentCenter}, which emits no
 * `elevation` key) submit 0 by omission and cannot start submitting `undefined`
 * later — `RegionDocument#testPoint`'s elevation-band test reads an `undefined`
 * elevation as a SILENT false, so that regression would present as an
 * unexplained containment miss rather than an error.
 *
 * @param {object} region  RegionDocument.
 * @param {{ x: number, y: number }} point  Scene-space drop point.
 * @param {number} [elevation]  Scene elevation to test at (default 0).
 * @returns {boolean}
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
 * The token's OWN elevation is tested (issue 999), so an elevation-banded region
 * re-prompts a token standing in it instead of silently testing elevation 0.
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
 * Sentinel for a signal that could not answer: absent, threw, or could not be
 * given a finite input. Distinct from both `true` and `false`.
 */
const INDETERMINATE = null;

/**
 * Whether a region contains a TOKEN DOCUMENT, answered WITHOUT the rendered
 * canvas (issue 999).
 *
 * The active GM re-validates every player interact request, and may not be
 * viewing the requester's scene — so `tokenDoc.object` is `null` and every
 * placeable-derived input (centre, footprint, scene level) is unavailable. On
 * V14 the same is true for a token on a non-active scene LEVEL of the scene the
 * GM IS viewing, because `viewed` also requires `includedInLevel`. Three signals
 * are consulted in order; each yields inside, outside, or indeterminate, and
 * THE FIRST DETERMINATE ANSWER DECIDES. When none answers the result is admit —
 * "cannot locate ⇒ do not block", the posture the re-check has always had.
 *
 *  1. AUTHORITATIVE MEMBERSHIP — `TokenDocument#regions`, which is backfilled in
 *     `prepareBaseData` from the persisted, replicated `_source._regions`, so it
 *     is correct on a client not viewing that scene and for a token that has
 *     never moved. Consulted FIRST and never reordered below signal 2: for a
 *     region ATTACHED to a token, `TokenDocument#_identifyRegions` treats
 *     membership as DEFINITIONAL and does not consult `testInsideRegion` at all.
 *     A membership MISS is indeterminate, never outside — `regions` is `null`
 *     before `game._documentsReady`, and an unbackfilled record is
 *     indistinguishable from a genuine absence once `collectRegions` has mapped
 *     both to `[]`.
 *  2. FOUNDRY'S OWN CONTAINMENT PREDICATE — `TokenDocument#testInsideRegion`,
 *     which tests scene-level inclusion, the elevation band, the token FOOTPRINT
 *     and hex shapes. It is DEFINITIVE IN BOTH DIRECTIONS: a `false` here denies
 *     and signal 3 is NOT consulted, because signal 3 is a strictly worse
 *     centre-point approximation of this very predicate and must never overturn
 *     it (a large token straddling a border, or a token on another scene level,
 *     is genuinely outside). Indeterminate ONLY when absent or throwing — a
 *     throw means "could not determine", not "outside".
 *  3. LAST-RESORT GEOMETRY — the region's own `testPoint` against the token
 *     document's centre. Retained as the guaranteed-available floor for a
 *     Foundry shape (or a fixture) exposing no `testInsideRegion`, never as a
 *     second opinion on signal 2.
 *
 * Signals 2 and 3 deliberately do NOT route through {@link regionContainsPoint}:
 * that helper submits the caller's elevation for a POINT, and reusing it here
 * would re-hardcode elevation 0 for a TOKEN — the exact defect this function
 * exists to fix.
 *
 * @param {object} region  RegionDocument (the behaviour's `parent`).
 * @param {object} tokenDoc  TokenDocument in the same Scene as `region`.
 * @returns {boolean} Whether to treat the token as inside.
 */
export function regionContainsTokenDocument(region, tokenDoc) {
  if (membershipIncludesRegion(tokenDoc, region)) return true;
  const byFoundry = testInsideRegionSignal(region, tokenDoc);
  if (byFoundry !== INDETERMINATE) return byFoundry;
  const byCentre = centerPointSignal(region, tokenDoc);
  return byCentre === INDETERMINATE ? true : byCentre;
}

/**
 * Signal 1: does the token document's own region membership name this region?
 * Read through {@link collectRegions} so every collection shape Foundry may hand
 * back (a `Set`, an EmbeddedCollection, an array) is tolerated — a hand-rolled
 * `Array.isArray` read would silently miss the real `Set` and leave the primary
 * path dead in production while green against array fixtures.
 *
 * @param {object} tokenDoc
 * @param {object} region
 * @returns {boolean} True only on a positive match; a miss is NOT a denial.
 */
function membershipIncludesRegion(tokenDoc, region) {
  const wanted = region?.id == null ? null : String(region.id);
  for (const candidate of collectRegions(tokenDoc?.regions)) {
    if (candidate === region) return true;
    // A bare id string is fixture-only tolerance; Foundry always hands back
    // RegionDocuments.
    const id = typeof candidate === 'string' ? candidate : candidate?.id;
    if (wanted !== null && id != null && String(id) === wanted) return true;
  }
  return false;
}

/**
 * Signal 2: Foundry's own token→region containment predicate. Definitive in both
 * directions; indeterminate only when absent or throwing.
 *
 * @param {object} region
 * @param {object} tokenDoc
 * @returns {boolean|null}
 */
function testInsideRegionSignal(region, tokenDoc) {
  if (typeof tokenDoc?.testInsideRegion !== 'function') return INDETERMINATE;
  try {
    return tokenDoc.testInsideRegion(region) === true;
  } catch {
    return INDETERMINATE;
  }
}

/**
 * Signal 3: the region's geometric point test against the token document's
 * centre. Indeterminate when the region exposes no `testPoint`, when no finite
 * centre resolves, or when the test throws.
 *
 * @param {object} region
 * @param {object} tokenDoc
 * @returns {boolean|null}
 */
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
 * The token document's centre as a complete `ElevatedPoint`, or null when no
 * finite `x`/`y` resolves. Prefers `TokenDocument#getCenterPoint()` (canvas-free
 * and hex-aware), falling back to {@link tokenDocumentCenter}.
 *
 * The elevation is normalized to a FINITE number after EITHER centre source, and
 * that normalization is load-bearing rather than defensive tidying:
 * `getCenterPoint()` returns the document's elevation verbatim, so an absent
 * elevation reaches `testPoint` on the PRIMARY branch, and `testPoint` reads a
 * non-finite elevation as a silent `false` — i.e. as a denial.
 *
 * @param {object} tokenDoc
 * @returns {{ x: number, y: number, elevation: number } | null}
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
 * The token document's centre `x`/`y` plus whatever elevation the centre source
 * carried (possibly none). Split out so {@link tokenDocumentElevatedCenter} can
 * normalize ONE elevation for BOTH sources.
 *
 * This prefers `getCenterPoint()` FIRST, the opposite order from
 * {@link tokenDocumentCenter}. That is deliberate, not a divergence to reconcile:
 * `getCenterPoint()` reads the PREPARED `x`/`y`/`elevation` fields rather than
 * the source ones, which is what makes IT, not the `updateToken` hook, the actual
 * source of the lag {@link tokenDocumentCenter} avoids — Foundry's own
 * `testInsideRegion` JSDoc says it must read source fields instead for exactly
 * this reason. That lag needs an actively animating, rendered placeable, and
 * this function exists precisely for the client that has none, so
 * `getCenterPoint()`'s hex-aware math is safe (and preferred) here.
 *
 * @param {object} tokenDoc
 * @returns {{ x: number, y: number, elevation?: unknown } | null}
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
  // NOT `{ ...tokenDocumentCenter(doc), elevation }`: that spreads a null centre
  // into `{}` and submits an undefined x/y, which testPoint also reads as false.
  const computed = tokenDocumentCenter(tokenDoc);
  return computed ? { x: computed.x, y: computed.y } : null;
}

/**
 * Pick the token to re-prompt for after an interactable session closes (issue
 * 332): from a scene's token documents, the FIRST whose actor matches `actorId`.
 * Pure (no Foundry coupling): the caller passes the already-collected token-doc
 * list and reads `.object` (the placeable) off the returned doc to feed the
 * existing `_promptForTokenInsideRegion` re-prompt path, which then applies the
 * authoritative in-region hit-test and ownership guard. Returns null when no
 * actor matches (the activating token is gone), so a stale session-close does not
 * try to resurrect a prompt for a token that no longer exists.
 *
 * @param {Array<object>} tokenDocs  TokenDocuments (each may expose `.object`).
 * @param {string|null} actorId      The activating actor's id.
 * @returns {object|null} The matching TokenDocument, or null.
 */
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

/**
 * A token's scene elevation, read off its DOCUMENT and normalized to 0 when
 * non-finite. The document read is not a courtesy: the `Token` PLACEABLE has no
 * `elevation` getter and `Token#center` drops elevation entirely, while the
 * dominant caller (the `controlToken` / "interact here" re-trigger) hands in a
 * placeable — so a bare `token.elevation` read would be `undefined` on the live
 * path and silently fall back to 0, exactly the defect being fixed, while a
 * document-shaped fixture passed green.
 *
 * @param {object} token  TokenDocument or its placeable.
 * @returns {number}
 */
function tokenElevation(token) {
  const elevation = Number(token?.document?.elevation ?? token?.elevation);
  return Number.isFinite(elevation) ? elevation : 0;
}
