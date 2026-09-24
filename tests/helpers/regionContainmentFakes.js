/**
 * Shared fakes for the token->region containment seam (issue 999). `rectRegion` always carries a
 * `uuid` AND `flags.fabricate.environmentId`.
 */

/**
 * A RegionDocument fake whose `testPoint` is an axis-aligned rectangle, plus an optional elevation
 * band.
 *
 * @param {number} [options.x] Rect left.
 * @param {number} [options.y] Rect top.
 * @param {number} [options.w] Rect width.
 * @param {number} [options.h] Rect height.
 * @param {{ bottom?: number, top?: number }|null} [options.elevationBand] Absent ⇒ THIS FAKE admits
 * any elevation, including `undefined` and `NaN`. That is a simplification, not a model of Foundry:
 * real `RegionDocument#testPoint` still rejects `undefined`/`NaN` even with no band configured,
 * because an unset `bottom` normalizes to `-Infinity` and neither value compares true against
 * `-Infinity` or `Infinity`. An elevation of exactly `-Infinity` is NOT rejected the same way,
 * because `#testElevation`'s flat-region escape (`elevation === bottom`) admits it.
 * `undefined`/`NaN` is exactly what the real defect submits (issue 999). Present ⇒ only a finite
 * elevation inside the band is admitted (see {@link admitsElevation}), and `top` here is INCLUSIVE,
 * unconditionally. That matches Foundry V13.351, where `top` is always inclusive and there is no
 * `topInclusive` field at all, but diverges from Foundry V14.365, where `top` is exclusive unless
 * the region sets `topInclusive` (see foundry-and-architecture.md). Do not read this fake as a
 * model of Foundry's own elevation-band semantics: it happens to agree with V13 and silently
 * diverge from V14, which is MORE misleading than a simplification that matched neither build,
 * because a reader targeting V13 could reasonably conclude this fake models core faithfully and
 * generalise from it.
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

/** Whether a band admits an elevation; a non-finite elevation is never admitted. */
function admitsElevation(band, elevation) {
  const value = Number(elevation);
  if (!Number.isFinite(value)) return false;
  const bottom = Number.isFinite(Number(band.bottom)) ? Number(band.bottom) : -Infinity;
  const top = Number.isFinite(Number(band.top)) ? Number(band.top) : Infinity;
  return value >= bottom && value <= top;
}

/**
 * Sibling of {@link rectRegion} that omits `testPoint` entirely (a region shape the geometric
 * signal cannot question). `testPointCalls` is retained so a test can still assert it stayed empty.
 *
 * @param {object} [options] As {@link rectRegion}.
 */
export function rectRegionWithoutTestPoint(options = {}) {
  const region = rectRegion(options);
  delete region.testPoint;
  return region;
}

/**
 * Sibling of {@link rectRegion} whose `testPoint` THROWS. A throw means "could not determine", not
 * "outside".
 *
 * @param {object} [options] As {@link rectRegion}.
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
 * A TokenDocument fake with NO placeable, as seen by a client not viewing its scene.
 *
 * @param {number} [options.x] Document top-left x (NOT the centre).
 * @param {number} [options.y] Document top-left y (NOT the centre).
 * @param {number} [options.width] Footprint width in grid squares.
 * @param {number} [options.height] Footprint height in grid squares.
 * @param {object|null} [options.scene] The parent scene (should carry `grid.size`).
 * @param {number} [options.elevation] Omitted ⇒ the document has no elevation.
 * @param {*} [options.regions] The membership collection, used VERBATIM (Set, `{ contents }`,
 * array, null, ...).
 * @param {true|false|'throws'|'absent'} [options.insideRegion] Drives `testInsideRegion`; defaults
 * to `'absent'` (the method is not defined).
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
    // A complete ElevatedPoint, exactly as V13/V14 TokenDocument#getCenterPoint returns it: the
    // document's elevation is passed through VERBATIM, including when it is absent.
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
 * A minimal Scene fake carrying the grid size the centre computation needs, plus the token
 * documents `_tokenInsideRegion` enumerates.
 */
export function gridScene({ id = 'scene-1', gridSize = 100, tokens = [] } = {}) {
  return { id, grid: { size: gridSize }, tokens: { contents: [...tokens] } };
}
