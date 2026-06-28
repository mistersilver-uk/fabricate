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
  const compendiumSource =
    item._stats?.compendiumSource || item.system?._stats?.compendiumSource || null;
  if (compendiumSource) return compendiumSource;
  // Legacy fallback
  if (typeof foundry !== 'undefined' && foundry?.utils?.getProperty) {
    return foundry.utils.getProperty(item, 'flags.core.sourceId') || null;
  }
  return item.flags?.core?.sourceId || null;
}

/**
 * Resolve the world-duplicate source UUID of a Foundry item document.
 *
 * When a world Item is duplicated (for example dragged) into an actor, Foundry
 * records the origin world document UUID in `_stats.duplicateSource` — distinct
 * from the compendium-source chain read by {@link getSourceUuid} (in that case
 * `_stats.compendiumSource` is typically `null` and there is no
 * `flags.core.sourceId`). This helper mirrors the dual-location pattern of
 * {@link getSourceUuid}, checking `_stats` then `system._stats`.
 *
 * @param {Item|object|null} item - A Foundry item document (or item-like object)
 * @returns {string|null} The world-duplicate source UUID, or null if unset
 */
export function getDuplicateSourceUuid(item) {
  if (!item) return null;
  return item._stats?.duplicateSource || item.system?._stats?.duplicateSource || null;
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
 * Contributes three references: the item's live `uuid`, its compendium-source
 * UUID ({@link getSourceUuid}), and its world-duplicate source UUID
 * ({@link getDuplicateSourceUuid}). The duplicate-source reference recognizes
 * items duplicated (for example dragged) from a component's source world item,
 * which carry the link only in `_stats.duplicateSource`.
 *
 * @param {Item|object|null} item - Item-like object that may expose `uuid` and source metadata
 * @returns {string[]} Unique UUID references, ordered as [item.uuid, compendium source UUID, world-duplicate source UUID]
 */
export function getItemSourceReferences(item) {
  const refs = [];
  if (!item || typeof item !== 'object') return refs;
  pushUnique(refs, item.uuid);
  pushUnique(refs, getSourceUuid(item));
  pushUnique(refs, getDuplicateSourceUuid(item));
  return refs;
}

/**
 * Collect the UUIDs that identify a Foundry item instance and its canonical
 * compendium source — but NOT its world-duplicate source.
 *
 * Contributes two references: the item's live `uuid` and its compendium-source
 * UUID ({@link getSourceUuid}). Unlike {@link getItemSourceReferences}, this
 * deliberately omits `_stats.duplicateSource`, so a world Item cloned from
 * another world Item is treated as a distinct identity. Use this for component
 * *identity* decisions — import de-duplication and source-metadata propagation —
 * where conflating a clone with its original would wrongly merge two components
 * or rewrite the wrong one. Use {@link getItemSourceReferences} (which keeps the
 * duplicate source) for craft-time inventory matching, where a player's
 * drag/duplicate copy of a component's source world item must still resolve to
 * that component.
 *
 * @param {Item|object|null} item - Item-like object that may expose `uuid` and source metadata
 * @returns {string[]} Unique UUID references, ordered as [item.uuid, compendium source UUID]
 */
export function getItemIdentityReferences(item) {
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
  return getComponentSourceReferences(component).some((ref) => itemRefs.has(ref));
}

/**
 * Find an existing actor item that should stack with a freshly-awarded source —
 * i.e. one that shares a source-UUID reference with `source` AND carries a
 * `system.quantity` field (so it can be incremented). Items without a quantity
 * field (unique gear) or with no shared source never match, so they create a new
 * document instead of stacking.
 *
 * @param {Array<object>} items - The actor's existing items (item-like objects).
 * @param {object} source - The resolved award source (a Foundry item or component).
 * @returns {object|null} The stackable match, or null.
 */
export function findStackableMatch(items, source) {
  const sourceRefs = new Set(
    [...getItemSourceReferences(source), ...getComponentSourceReferences(source)].filter(Boolean)
  );
  if (sourceRefs.size === 0) return null;
  for (const item of Array.isArray(items) ? items : []) {
    const quantity = item?.system?.quantity;
    if (quantity === undefined || quantity === null) continue;
    if (getItemSourceReferences(item).some((ref) => sourceRefs.has(ref))) return item;
  }
  return null;
}
