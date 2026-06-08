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
 * containment via `RegionDocument#object.testPoint(point, elevation)` on the
 * placeable; we tolerate both the document-level and placeable-level shape and
 * fall back to no hit when neither is available.
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
 * Whether a region contains a scene-space point. Tolerates the V13
 * `region.object.testPoint` (placeable) and a document-level `testPoint`,
 * returning false when neither exists.
 *
 * @param {object} region  RegionDocument.
 * @param {{ x: number, y: number }} point  Scene-space drop point.
 * @returns {boolean}
 */
function regionContainsPoint(region, point) {
  const tester = region?.object ?? region;
  if (typeof tester?.testPoint === 'function') {
    try {
      // V13 testPoint takes (point, elevation?); a 2D drop uses no elevation.
      return tester.testPoint(point) === true || tester.testPoint(point, 0) === true;
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
  if (typeof collection.values === 'function') return Array.from(collection.values());
  if (typeof collection[Symbol.iterator] === 'function') return Array.from(collection);
  return [];
}
