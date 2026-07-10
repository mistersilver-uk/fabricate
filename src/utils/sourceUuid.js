/**
 * @module sourceUuid
 */
import { getFabricateFlag } from '../config/flags.js';

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
  // A `flags.fabricate.componentId` on the item — copied from the component's flagged
  // source world item and inherited by every duplicate — is the most durable link: it
  // survives Foundry's transitive `_stats.duplicateSource` template chaining, which
  // source-UUID matching cannot (the copy loses the ref back to the component source).
  const componentId = component ? component.id : null;
  if (componentId && getFabricateFlag(item, 'componentId', null) === componentId) {
    return true;
  }
  const itemRefs = new Set(getItemSourceReferences(item));
  if (itemRefs.size === 0) return false;
  return getComponentSourceReferences(component).some((ref) => itemRefs.has(ref));
}

/**
 * The tier order for {@link matchRecipeItemDefinition}, most to least durable.
 * @type {['identity','uuid','compendium','duplicate']}
 */
export const RECIPE_ITEM_MATCH_TIERS = ['identity', 'uuid', 'compendium', 'duplicate'];

/**
 * Collect the UUID references a recipe-item definition can match against — the union
 * of its `sourceUuid` (the registered live document), `sourceItemUuid` (the canonical
 * compendium/source uuid), and any `fallbackItemIds`. Mirrors
 * {@link getComponentSourceReferences} so a recipe item claims the same breadth of
 * source refs a component does (match on everything; craft spawns from `sourceUuid`).
 *
 * @param {object|null} definition - Recipe-item definition with source UUID fields
 * @returns {string[]} Unique UUID references
 */
export function getRecipeItemSourceReferences(definition) {
  return getComponentSourceReferences(definition);
}

/**
 * Resolve which recipe-item definition an item IS, and by how durable a link.
 *
 * This is the single shared matcher for recipe items, mirroring
 * {@link itemMatchesComponentSource}'s durable-flag-first split. It evaluates four
 * tiers in strict precedence order — the FIRST tier that yields any matching
 * definition wins and there is NO fall-through to a lower tier:
 *
 *   1. `identity`   — `flags.fabricate.recipeItemDefinitionId === def.id` (the
 *                     durable, transferable identity-of-record; survives Foundry's
 *                     transitive `_stats.duplicateSource` template chaining).
 *   2. `uuid`       — `item.uuid === def.sourceItemUuid` (the item IS the source).
 *   3. `compendium` — `getSourceUuid(item) === def.sourceItemUuid` (compendium
 *                     provenance; a pack copy of the registered source).
 *   4. `duplicate`  — `getDuplicateSourceUuid(item) === def.sourceItemUuid` (a
 *                     drag/duplicate copy of an un-migrated world-template source).
 *
 * There is no clone-gate here, and there must never be one. Foundry stamps
 * `_stats.duplicateSource` on EVERY non-compendium drag-drop, so every legitimate
 * actor-owned copy carries it: a player's copy of a compendium-imported book holds both
 * an inherited `_stats.compendiumSource` (real provenance, tier 3) and a
 * `_stats.duplicateSource` (tier 4). Treating "has a duplicateSource" as "is a suspect
 * clone" here would misclassify every owned copy and refuse to resolve it through its
 * legitimate compendium source, breaking the common hand-a-player-a-copy case. The
 * clone-gate is a REGISTRATION and world/pack source-repair rule ONLY — it decides which
 * refs a duplicated SOURCE item contributes so a registered duplicate becomes its own
 * definition instead of overwriting the original — and it must never reach this matcher
 * or the repair of actor-owned copies. A future reader who "simplifies" the two paths
 * into one gate reintroduces issue 555.
 *
 * @param {Item|object|null} item - Item-like object with `uuid`, source metadata, and `getFlag`
 * @param {Array<object>|null} definitions - Candidate recipe-item definitions
 * @returns {{definition: object|null, tier: ('identity'|'uuid'|'compendium'|'duplicate'|null)}}
 */
export function matchRecipeItemDefinition(item, definitions) {
  const empty = { definition: null, tier: null };
  if (!item || typeof item !== 'object') return empty;
  const defs = Array.isArray(definitions) ? definitions : [];
  if (defs.length === 0) return empty;

  const flagValue = getFabricateFlag(item, 'recipeItemDefinitionId', null);
  const uuid = typeof item.uuid === 'string' ? item.uuid : null;
  const compendium = getSourceUuid(item);
  const duplicate = getDuplicateSourceUuid(item);

  // Tiers 2/3/4 test membership in the definition's UNION of source refs (its
  // `sourceUuid` + `sourceItemUuid` + fallbacks), so a compendium-imported book
  // resolves whether the owned copy was dragged from the compendium item or the
  // imported world item. Tier 1 (the durable flag) still wins outright.
  const refSets = new Map(defs.map((def) => [def, new Set(getRecipeItemSourceReferences(def))]));
  const predicates = {
    identity: (def) => flagValue != null && def?.id != null && String(def.id) === String(flagValue),
    uuid: (def) => uuid != null && refSets.get(def).has(uuid),
    compendium: (def) => compendium != null && refSets.get(def).has(compendium),
    duplicate: (def) => duplicate != null && refSets.get(def).has(duplicate),
  };

  for (const tier of RECIPE_ITEM_MATCH_TIERS) {
    const definition = defs.find(predicates[tier]);
    if (definition) return { definition, tier };
  }
  return empty;
}

/**
 * Whether an item matches any of the given recipe-item definitions, by any tier.
 * The boolean companion to {@link matchRecipeItemDefinition}.
 *
 * @param {Item|object|null} item
 * @param {Array<object>|null} definitions
 * @returns {boolean}
 */
export function itemMatchesRecipeItemSource(item, definitions) {
  return matchRecipeItemDefinition(item, definitions).definition != null;
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
