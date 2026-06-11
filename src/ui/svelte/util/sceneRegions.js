/**
 * Pure readers for Foundry Scene Region documents, kept dependency-free so the
 * Svelte layer (and Node tests) can list the current scene's regions without
 * reaching into Foundry globals directly. The owning service injects the scene.
 */

/**
 * Walk a Foundry "collection" defensively. Scene `regions` may surface as a
 * plain array, an EmbeddedCollection (`.contents`), a Map-like (`.values()`), or
 * any iterable. Mirrors the walk in `canvas/regionHitTest.js` but kept local so
 * this util stays free of canvas dependencies.
 *
 * @param {*} collection
 * @returns {Array<object>}
 */
function collectRegions(collection) {
  if (!collection) return [];
  if (Array.isArray(collection)) return collection;
  if (Array.isArray(collection.contents)) return collection.contents;
  if (typeof collection.values === 'function') return Array.from(collection.values());
  if (typeof collection[Symbol.iterator] === 'function') return Array.from(collection);
  return [];
}

/**
 * Coerce a Foundry RegionDocument `color` into a CSS hex string. In Foundry V13
 * the value may be a `Color` instance (exposes `.css` / a `#rrggbb` toString), a
 * plain hex string (with or without a leading `#`), or a packed 24-bit number.
 * Anything unrecognized yields an empty string so the consumer can fall back to
 * a themed default (we never bake a colour literal into the JS layer).
 *
 * @param {*} value
 * @param {string} [fallback]
 * @returns {string}
 */
export function toCssColor(value, fallback = '') {
  if (value == null) return fallback;
  if (typeof value === 'object') {
    if (typeof value.css === 'string' && value.css) return value.css;
    const asString = typeof value.toString === 'function' ? value.toString() : '';
    if (/^#[0-9a-f]{3,8}$/i.test(asString)) return asString;
    const numeric = typeof value.valueOf === 'function' ? value.valueOf() : NaN;
    return toCssColor(typeof numeric === 'number' ? numeric : NaN, fallback);
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return fallback;
    return trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    const clamped = Math.max(0, Math.min(0xffffff, Math.trunc(value)));
    return `#${clamped.toString(16).padStart(6, '0')}`;
  }
  return fallback;
}

/**
 * Read the Scene Regions of the given scene into a flat, serializable shape for
 * the Map Region Links tab. Returns an empty list (and empty scene uuid) when no
 * scene is active or it carries no regions — the natural state in Node tests and
 * when the GM has no canvas drawn.
 *
 * @param {object|null} scene  A Foundry Scene document (carries `uuid` + `regions`).
 * @returns {{ sceneUuid: string, regions: Array<{ sceneRegionUuid: string, name: string, color: string }> }}
 */
export function readSceneRegions(scene) {
  const sceneUuid = scene?.uuid ? String(scene.uuid) : '';
  const regions = collectRegions(scene?.regions)
    .map(region => ({
      sceneRegionUuid: region?.uuid ? String(region.uuid) : '',
      name: region?.name ? String(region.name) : '',
      color: toCssColor(region?.color)
    }))
    .filter(region => region.sceneRegionUuid);
  return { sceneUuid, regions };
}

/**
 * Filter a list of actor uuids down to those whose token sits inside the given
 * Foundry Region document, right now. Pure given its injected collaborators so
 * it is unit-testable without a live canvas: `regionDoc.testPoint` does the
 * containment (Foundry V13 RegionDocument API, as in `canvas/regionHitTest.js`),
 * and `resolveActorTokenCenter(actorUuid)` yields the actor's token centre point
 * (or null when the actor has no token on the region's scene).
 *
 * @param {object} args
 * @param {{ testPoint?: (point: { x: number, y: number, elevation: number }) => boolean }} args.regionDoc
 * @param {string[]} args.actorUuids
 * @param {(actorUuid: string) => ({ x: number, y: number } | null)} args.resolveActorTokenCenter
 * @returns {string[]} The subset of `actorUuids` whose token centre is inside the region.
 */
export function filterActorUuidsInsideRegion({ regionDoc, actorUuids, resolveActorTokenCenter } = {}) {
  if (!regionDoc || typeof regionDoc.testPoint !== 'function') return [];
  if (!Array.isArray(actorUuids) || typeof resolveActorTokenCenter !== 'function') return [];
  const inside = [];
  for (const actorUuid of actorUuids) {
    const center = resolveActorTokenCenter(actorUuid);
    if (!center || !Number.isFinite(center.x) || !Number.isFinite(center.y)) continue;
    let contained = false;
    try {
      contained = regionDoc.testPoint({ x: center.x, y: center.y, elevation: 0 }) === true;
    } catch (_) {
      contained = false;
    }
    if (contained) inside.push(actorUuid);
  }
  return inside;
}
