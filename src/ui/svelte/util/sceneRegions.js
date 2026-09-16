// Pure readers for Foundry Scene Region documents, so the Svelte layer and Node tests can list a
// scene's regions without reaching for Foundry globals; the owning service injects the scene.

// Scene `regions` may surface as an array, an EmbeddedCollection (`.contents`), a Map-like
// (`.values()`) or any iterable. The same walk as `canvas/regionHitTest.js`, kept local so this
// util takes no canvas dependency.
function collectRegions(collection) {
  if (!collection) return [];
  if (Array.isArray(collection)) return collection;
  if (Array.isArray(collection.contents)) return collection.contents;
  if (typeof collection.values === 'function') return Array.from(collection.values());
  if (typeof collection[Symbol.iterator] === 'function') return Array.from(collection);
  return [];
}

// A V13 RegionDocument `color` may be a `Color` instance, a hex string with or without `#`, or a
// packed 24-bit number. Anything unrecognized yields `''` so the consumer falls back to a THEMED
// default: no colour literal is ever baked into the JS layer.
export function toCssColor(value, fallback = '') {
  if (value == null) return fallback;
  if (typeof value === 'object') {
    if (typeof value.css === 'string' && value.css) return value.css;
    const asString = typeof value.toString === 'function' ? value.toString() : '';
    if (/^#[0-9a-f]{3,8}$/i.test(asString)) return asString;
    const numeric = typeof value.valueOf === 'function' ? value.valueOf() : Number.NaN;
    return toCssColor(typeof numeric === 'number' ? numeric : Number.NaN, fallback);
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

// A flat, serializable shape for the Map Region Links tab. No active scene, or one with no regions,
// is the natural state in Node tests and with no canvas drawn, so it answers empty rather than null.
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

// Which actors' tokens sit inside a Region document right now. Containment is V13's
// `regionDoc.testPoint`, as in `canvas/regionHitTest.js`, and the token centre is resolved through
// an injected collaborator, so this is unit-testable with no live canvas.
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
