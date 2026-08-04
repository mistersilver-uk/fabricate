/**
 * Shared fakes for the token->region containment seam (issue 999).
 *
 * These stand in for a Foundry `RegionDocument` and `TokenDocument` on a client
 * that is NOT viewing the token's scene — the condition the containment re-check
 * has to survive — so neither fake ever exposes a placeable (`object`).
 *
 * Two properties of these fakes are load-bearing rather than decoration:
 *
 *  - `rectRegion` always carries a `uuid` AND `flags.fabricate.environmentId`.
 *    `sceneRegionUuidsContainingToken` skips a region without a uuid, and
 *    `regionEnvironmentIdsAtPoint` skips one without the env-id flag, BOTH before
 *    they reach `testPoint`. A fake lacking either records zero calls, which
 *    would make the elevation pins on those two functions silently vacuous.
 *  - `tokenDoc`'s `testInsideRegion` defaults to ABSENT and is NEVER derived from
 *    the rect. Every outcome of Foundry's own containment predicate is therefore
 *    a deliberate choice by the test, so no assertion aimed at the membership or
 *    centre-point signal can be silently satisfied by it, and which signal
 *    answered stays provable.
 */

/**
 * A RegionDocument fake whose `testPoint` is an axis-aligned rectangle, plus an
 * optional elevation band. Returns false (never throws) for non-finite input, and
 * records every submitted point on `testPointCalls`.
 *
 * @param {object} [options]
 * @param {string} [options.id]
 * @param {string} [options.uuid]
 * @param {string} [options.environmentId]
 * @param {number} [options.x]  Rect left.
 * @param {number} [options.y]  Rect top.
 * @param {number} [options.w]  Rect width.
 * @param {number} [options.h]  Rect height.
 * @param {{ bottom?: number, top?: number }|null} [options.elevationBand]
 *   Absent ⇒ THIS FAKE admits any elevation, including a non-finite one. That is
 *   a simplification, not a model of Foundry: real `RegionDocument#testPoint`
 *   still rejects a non-finite elevation even with no band configured, because
 *   the elevation is compared against the band's bounds and every comparison
 *   against a non-finite value reads false — this is the exact defect class
 *   issue 999 fixes.
 *   Present ⇒ only a finite elevation inside the band is admitted (see
 *   {@link admitsElevation}), and `top` here is INCLUSIVE, where Foundry's `top`
 *   is exclusive unless the region sets `topInclusive`.
 *   Do not read this fake as a model of Foundry's own elevation-band semantics.
 * @returns {object}
 */
export function rectRegion({
  id = 'region-1',
  uuid = 'Scene.scene-1.Region.region-1',
  environmentId = 'env-1',
  x = 0,
  y = 0,
  w = 100,
  h = 100,
  elevationBand = null
} = {}) {
  const region = {
    id,
    uuid,
    flags: { fabricate: { environmentId } },
    testPointCalls: [],
    testPoint(point) {
      region.testPointCalls.push(point);
      const px = Number(point?.x);
      const py = Number(point?.y);
      if (!Number.isFinite(px) || !Number.isFinite(py)) return false;
      if (px < x || px > x + w || py < y || py > y + h) return false;
      return elevationBand ? admitsElevation(elevationBand, point?.elevation) : true;
    }
  };
  return region;
}

/**
 * Whether a band admits an elevation; a non-finite elevation is never admitted.
 * `top` is treated as INCLUSIVE here, where Foundry's is exclusive unless the
 * region sets `topInclusive` — another respect in which this is a simplified
 * fake, not a model of Foundry's band semantics.
 */
function admitsElevation(band, elevation) {
  const value = Number(elevation);
  if (!Number.isFinite(value)) return false;
  const bottom = Number.isFinite(Number(band.bottom)) ? Number(band.bottom) : -Infinity;
  const top = Number.isFinite(Number(band.top)) ? Number(band.top) : Infinity;
  return value >= bottom && value <= top;
}

/**
 * Sibling of {@link rectRegion} that omits `testPoint` entirely (a region shape
 * the geometric signal cannot question). `testPointCalls` is retained so a test
 * can still assert it stayed empty.
 *
 * @param {object} [options]  As {@link rectRegion}.
 * @returns {object}
 */
export function rectRegionWithoutTestPoint(options = {}) {
  const region = rectRegion(options);
  delete region.testPoint;
  return region;
}

/**
 * Sibling of {@link rectRegion} whose `testPoint` THROWS. A throw means "could
 * not determine", not "outside".
 *
 * @param {object} [options]  As {@link rectRegion}.
 * @returns {object}
 */
export function rectRegionThrowingTestPoint(options = {}) {
  const region = rectRegion(options);
  region.testPoint = (point) => {
    region.testPointCalls.push(point);
    throw new Error('testPoint exploded');
  };
  return region;
}

/**
 * A TokenDocument fake with NO placeable, as seen by a client not viewing its
 * scene. `parent` is the passed scene object identically (real Foundry
 * guarantees `tokenDoc.parent === scene` for a scene's embedded tokens), and
 * `getCenterPoint()` computes the centre from the footprint and that scene's
 * grid size.
 *
 * @param {object} [options]
 * @param {number} [options.x]  Document top-left x (NOT the centre).
 * @param {number} [options.y]  Document top-left y (NOT the centre).
 * @param {number} [options.width]   Footprint width in grid squares.
 * @param {number} [options.height]  Footprint height in grid squares.
 * @param {object|null} [options.scene]  The parent scene (should carry `grid.size`).
 * @param {number} [options.elevation]  Omitted ⇒ the document has no elevation.
 * @param {*} [options.regions]  The membership collection, used VERBATIM (Set,
 *   `{ contents }`, array, null, ...).
 * @param {true|false|'throws'|'absent'} [options.insideRegion]  Drives
 *   `testInsideRegion`; defaults to `'absent'` (the method is not defined).
 * @param {string} [options.actorId]
 * @returns {object}
 */
export function tokenDoc({
  x = 0,
  y = 0,
  width = 1,
  height = 1,
  scene = null,
  elevation,
  regions = [],
  insideRegion = 'absent',
  actorId = 'actor-1'
} = {}) {
  const gridSize = Number(scene?.grid?.size);
  const grid = Number.isFinite(gridSize) && gridSize > 0 ? gridSize : 100;
  const doc = {
    actorId,
    actor: { id: actorId },
    x,
    y,
    width,
    height,
    elevation,
    parent: scene,
    regions,
    testInsideRegionCalls: [],
    // A complete ElevatedPoint, exactly as V13/V14 TokenDocument#getCenterPoint
    // returns it: the document's elevation is passed through VERBATIM, including
    // when it is absent.
    getCenterPoint: () => ({
      x: x + (grid * width) / 2,
      y: y + (grid * height) / 2,
      elevation
    })
  };
  if (insideRegion !== 'absent') {
    doc.testInsideRegion = (region) => {
      doc.testInsideRegionCalls.push(region);
      if (insideRegion === 'throws') throw new Error('testInsideRegion exploded');
      return insideRegion === true;
    };
  }
  return doc;
}

/**
 * A minimal Scene fake carrying the grid size the centre computation needs, plus
 * the token documents `_tokenInsideRegion` enumerates. Fixture fidelity matters
 * here: a token document with no grid-bearing parent degrades to its top-left,
 * which REPRODUCES the bug rather than testing the fix.
 *
 * @param {object} [options]
 * @param {string} [options.id]
 * @param {number} [options.gridSize]
 * @param {Array<object>} [options.tokens]
 * @returns {object}
 */
export function gridScene({ id = 'scene-1', gridSize = 100, tokens = [] } = {}) {
  return { id, grid: { size: gridSize }, tokens: { contents: [...tokens] } };
}
