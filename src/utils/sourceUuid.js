/**
 * Resolve the compendium source UUID of a Foundry item document.
 *
 * On Foundry v12+, the canonical location is `_stats.compendiumSource`.
 * Older versions (and some migration paths) store it in `flags.core.sourceId`.
 * This helper checks both, preferring the modern field.
 *
 * @param {Item} item - A Foundry item document (or item-like object with flags/_stats)
 * @returns {string|null} The source UUID, or null if neither field is set
 */
export function getSourceUuid(item) {
  if (!item) return null;
  // Foundry v12+ canonical field
  const compendiumSource = item._stats?.compendiumSource
    || item.system?._stats?.compendiumSource
    || null;
  if (compendiumSource) return compendiumSource;
  // Legacy fallback
  if (typeof foundry !== 'undefined' && foundry?.utils?.getProperty) {
    return foundry.utils.getProperty(item, 'flags.core.sourceId') || null;
  }
  return item.flags?.core?.sourceId || null;
}

function pushUnique(target, value) {
  if (typeof value !== 'string') return;
  const trimmed = value.trim();
  if (!trimmed || target.includes(trimmed)) return;
  target.push(trimmed);
}

/**
 * Collect the UUIDs that may identify a Foundry item instance and its canonical source.
 *
 * @param {Item|object|null} item - Item-like object that may expose `uuid` and source metadata
 * @returns {string[]} Unique UUID references, ordered as [item.uuid, canonical source UUID]
 */
export function getItemSourceReferences(item) {
  const refs = [];
  if (!item || typeof item !== 'object') return refs;
  pushUnique(refs, item.uuid);
  pushUnique(refs, getSourceUuid(item));
  return refs;
}

/**
 * Collect every UUID reference that a component can use for runtime matching.
 *
 * @param {object|null} component - Component-like object with source UUID fields
 * @returns {string[]} Unique UUID references across sourceUuid, sourceItemUuid, and fallbacks
 */
export function getComponentSourceReferences(component) {
  const refs = [];
  if (!component || typeof component !== 'object') return refs;
  pushUnique(refs, component.sourceUuid);
  pushUnique(refs, component.sourceItemUuid);
  if (Array.isArray(component.fallbackItemIds)) {
    for (const ref of component.fallbackItemIds) pushUnique(refs, ref);
  }
  return refs;
}

/**
 * Determine whether an item matches any source reference claimed by a component.
 *
 * @param {Item|object|null} item - Item-like object with `uuid` and optional source metadata
 * @param {object|null} component - Component-like object with source UUID fields
 * @returns {boolean} True when the item overlaps the component's source reference chain
 */
export function itemMatchesComponentSource(item, component) {
  const itemRefs = new Set(getItemSourceReferences(item));
  if (itemRefs.size === 0) return false;
  return getComponentSourceReferences(component).some(ref => itemRefs.has(ref));
}
