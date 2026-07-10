/**
 * @module sourceUuid
 */
import { getFabricateFlag, isSafeFlagKeySegment } from '../config/flags.js';

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
 * Whether an item's raw source-reference chain intersects a component's — the
 * durable-flag-agnostic tail of component matching. Kept as an INTERNAL helper
 * only: the exported `itemMatchesComponentSource` pairwise matcher was retired in
 * favour of the list-aware, system-scoped {@link resolveComponentForItem}, which
 * owns identity/exclusivity. This helper is the resolver's raw-reference
 * fall-through tier and nothing else.
 *
 * @param {Set<string>} itemRefs - The item's precomputed source-reference set.
 * @param {object|null} component - Component-like object with source UUID fields.
 * @returns {boolean} True when the item's refs overlap the component's source refs.
 */
function itemSourceRefsIntersectComponent(itemRefs, component) {
  return getComponentSourceReferences(component).some((ref) => itemRefs.has(ref));
}

// Systems already warned-about, so a per-item resolve loop emits at most one console
// line per offending system id rather than one per candidate item.
const _warnedUnsafeSystemIds = new Set();

function warnUnsafeSystemIdOnce(systemId) {
  const key = String(systemId);
  if (_warnedUnsafeSystemIds.has(key)) return;
  _warnedUnsafeSystemIds.add(key);
  console.warn?.(
    `Fabricate | crafting system id "${key}" is not a valid durable-flag map key (it contains a "." or other unsafe character), so its components resolve only by raw source references, not the per-system \`roles\` identity map. Recreate/re-import the system with a valid id (letters, digits, "_" or "-").`
  );
}

/**
 * Read the per-system durable component identity claimed by an item's
 * `flags.fabricate.roles[systemId].componentId`, applying the hygiene rule:
 * an absent `roles`, an absent or empty `roles[systemId]`, or a nullish
 * `componentId` is NO claim (returns null). Tested BEFORE any membership check so
 * `{}` or `{ componentId: null }` (a restamp interrupted midway) can never
 * spuriously match a component whose id is itself nullish.
 *
 * @param {Item|object|null} item
 * @param {string|null|undefined} systemId
 * @returns {string|null} The claimed component id, or null when there is no claim.
 */
function claimedRoleComponentId(item, systemId) {
  // A `systemId` that is not a safe single dotted-path segment (absent, or containing
  // a `.` that `expandObject` would have nested on write) can never index the `roles`
  // map correctly, so it yields NO identity and the resolver degrades to raw refs —
  // rather than silently reading past a nested key. See `isSafeFlagKeySegment`.
  if (!isSafeFlagKeySegment(systemId)) return null;
  const roles = getFabricateFlag(item, 'roles', null);
  if (!roles || typeof roles !== 'object') return null;
  const perSystem = roles[systemId];
  if (!perSystem || typeof perSystem !== 'object') return null;
  const componentId = perSystem.componentId;
  return componentId == null ? null : componentId;
}

/**
 * Resolve which single component an owned item IS, within ONE crafting system's
 * candidate set, scoped by that system's id. The shared, list-aware, system-scoped
 * component matcher — the component-kind analogue of {@link matchRecipeItemDefinition}.
 * Evaluated as tiers WITH fall-through (the FIRST tier that names a component in the
 * set wins; a claimed id naming nothing in this set is not "foreign", it is
 * irrelevant, so evaluation falls through):
 *
 *   1. identity (roles) — `flags.fabricate.roles[systemId].componentId` names a
 *      component in `components` ⇒ that component, exclusively; siblings fail closed.
 *   2. identity (legacy) — else the legacy scalar `flags.fabricate.componentId`
 *      names a component in the set ⇒ that component, exclusively (honored until the
 *      one-shot restamp backfills the map; the scalar carries no system so it stays
 *      list-aware).
 *   3. fall-through — else the item's raw source references (`uuid`,
 *      `_stats.compendiumSource`/`flags.core.sourceId`, transitive
 *      `_stats.duplicateSource`) intersect a component's; the first such component,
 *      else null. Load-bearing for un-stamped pre-#555 worlds, stale flags, and
 *      multi-system worlds.
 *
 * `systemId` is threaded, not derivable: component ids are NOT globally unique (a
 * copy-imported system preserves its origin's component ids), so identity is scoped
 * per system. The invariant is only that within a single system's set at most one
 * component bears a given id.
 *
 * There is NO clone-gate here and there must never be one — Foundry stamps
 * `_stats.duplicateSource` on every non-compendium drag-drop, so distrusting it here
 * would break the ordinary hand-a-player-a-copy case (issue 555).
 *
 * @param {Item|object|null} item - Item-like object with `uuid`, source metadata, and `getFlag`.
 * @param {Array<object>|null} components - The candidate component set of ONE system.
 * @param {string|null|undefined} systemId - That system's id.
 * @returns {object|null} The single component the item IS, or null.
 */
export function resolveComponentForItem(item, components, systemId) {
  if (!item || typeof item !== 'object') return null;
  const candidates = Array.isArray(components) ? components : [];
  if (candidates.length === 0) return null;

  // An unsafe (e.g. dotted) systemId can never have been written as a `roles` map key —
  // every stamp/repair/restamp site skips it — so there is no identity claim to honour.
  // Treat it as the ordinary UNSTAMPED case: skip tier 1 and fall through to tiers 2/3.
  // Do NOT refuse the resolution; that would strip the load-bearing raw-ref tier from a
  // legacy world (imported with a dotted id before creation-time validation existed) and
  // break its crafting entirely — strictly worse than the pre-#556 mis-attribution it
  // would prevent. `claimedRoleComponentId` already returns null for an unsafe segment;
  // warn once per system so a GM has a breadcrumb rather than a mute degrade.
  if (systemId != null && !isSafeFlagKeySegment(systemId)) {
    warnUnsafeSystemIdOnce(systemId);
  }

  // Tier 1: durable per-system identity map.
  const roleId = claimedRoleComponentId(item, systemId);
  if (roleId != null) {
    const byRole = candidates.find((component) => component && component.id === roleId);
    if (byRole) return byRole;
  }

  // Tier 2: legacy scalar identity, honored until the restamp backfills the map.
  const legacyId = getFabricateFlag(item, 'componentId', null);
  if (legacyId != null) {
    const byLegacy = candidates.find((component) => component && component.id === legacyId);
    if (byLegacy) return byLegacy;
  }

  // Tier 3: raw source-reference intersection.
  const itemRefs = new Set(getItemSourceReferences(item));
  if (itemRefs.size === 0) return null;
  return (
    candidates.find((component) => itemSourceRefsIntersectComponent(itemRefs, component)) || null
  );
}

/**
 * Boolean companion to {@link resolveComponentForItem}: whether the item resolves,
 * within `components` scoped by `systemId`, to the specific `component`.
 *
 * @param {Item|object|null} item
 * @param {object|null} component - The component to test identity against.
 * @param {Array<object>|null} components - The candidate set the identity is scoped to.
 * @param {string|null|undefined} systemId
 * @returns {boolean}
 */
export function itemResolvesToComponent(item, component, components, systemId) {
  if (!component || component.id == null) return false;
  const resolved = resolveComponentForItem(item, components, systemId);
  return resolved != null && resolved.id === component.id;
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
 * {@link resolveComponentForItem}'s durable-identity-first, list-aware split. It evaluates four
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
 * Resolve the durable component identity of a gathering-award SOURCE. A Foundry
 * Item source (it exposes `getFlag`) is resolved through the list-aware, system-
 * scoped {@link resolveComponentForItem}; a bare component source IS its own
 * identity. An Item's Foundry document `.id` is NEVER its component identity.
 *
 * @param {object|null} source
 * @param {Array<object>} components - The awarding system's resolved component set.
 * @param {string|null|undefined} systemId
 * @returns {object|null} The component the source IS, or null.
 */
function resolveSourceComponentIdentity(source, components, systemId) {
  if (!source || typeof source !== 'object') return null;
  if (typeof source.getFlag === 'function') {
    return resolveComponentForItem(source, components, systemId);
  }
  // A bare component source's identity is itself.
  return source;
}

/**
 * Find an existing actor item that should stack with a freshly-awarded source —
 * one that shares a source-UUID reference with `source` AND carries a
 * `system.quantity` field (so it can be incremented). Items without a quantity
 * field (unique gear) or with no shared source never match, so they create a new
 * document instead of stacking.
 *
 * Durable-identity guard (issue 556): a candidate that resolves — within the
 * awarding system's `components` scoped by `systemId` — to a DIFFERENT component
 * than the award source is skipped, so an award is never folded into an unrelated
 * owned stack merely because a transitive `_stats.duplicateSource` shares a raw
 * source reference. A candidate is skipped ONLY when BOTH the source and the
 * candidate resolve to components and those components differ; when either does not
 * resolve, stacking falls back to shared raw source references exactly as before.
 *
 * DOCUMENTED DEGRADE: `components`/`systemId` default to absent so a 2-arg call
 * reverts to pure raw-ref matching (the resolver returns null on both sides, so no
 * candidate is ever skipped) — a deliberate, tested fallback.
 *
 * @param {Array<object>} items - The actor's existing items (item-like objects).
 * @param {object} source - The resolved award source (a Foundry item or component).
 * @param {Array<object>} [components] - The awarding system's resolved component set.
 * @param {string} [systemId] - The awarding system's id.
 * @returns {object|null} The stackable match, or null.
 */
export function findStackableMatch(items, source, components = [], systemId) {
  const sourceRefs = new Set(
    [...getItemSourceReferences(source), ...getComponentSourceReferences(source)].filter(Boolean)
  );
  if (sourceRefs.size === 0) return null;
  const sourceComponent = resolveSourceComponentIdentity(source, components, systemId);
  for (const item of Array.isArray(items) ? items : []) {
    const quantity = item?.system?.quantity;
    if (quantity === undefined || quantity === null) continue;
    const candidateComponent = resolveComponentForItem(item, components, systemId);
    // Skip ONLY when both identities resolve and name different components.
    if (sourceComponent && candidateComponent && sourceComponent.id !== candidateComponent.id) {
      continue;
    }
    if (getItemSourceReferences(item).some((ref) => sourceRefs.has(ref))) return item;
  }
  return null;
}
