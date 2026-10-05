import { getFabricateFlag, isSafeFlagKeySegment } from '../config/flags.js';
import { hasStackQuantity } from '../systems/itemStackQuantity.js';

import { findById, findBySourceRefs, getDefinitionIndex } from './definitionIndex.js';
import { getItemMatchUuids, pushUniqueReference } from './sourceReferenceUnion.js';

// Re-exported for existing importers; it moved out to break the `definitionIndex` import cycle.
export { getItemMatchUuids } from './sourceReferenceUnion.js';

/** `_stats.compendiumSource` (Foundry V12+), else the legacy `flags.core.sourceId`. */
export function getCompendiumSourceUuid(item) {
  if (!item) return null;
  const compendiumSource =
    item._stats?.compendiumSource || item.system?._stats?.compendiumSource || null;
  if (compendiumSource) return compendiumSource;
  if (typeof foundry !== 'undefined' && foundry?.utils?.getProperty) {
    return foundry.utils.getProperty(item, 'flags.core.sourceId') || null;
  }
  return item.flags?.core?.sourceId || null;
}

export function getDuplicateSourceUuid(item) {
  if (!item) return null;
  return item._stats?.duplicateSource || item.system?._stats?.duplicateSource || null;
}

export function getItemSourceReferences(item) {
  const refs = [];
  if (!item || typeof item !== 'object') return refs;
  pushUniqueReference(refs, item.uuid);
  pushUniqueReference(refs, getCompendiumSourceUuid(item));
  pushUniqueReference(refs, getDuplicateSourceUuid(item));
  return refs;
}

/** Excludes the world-duplicate source. */
export function getItemIdentityReferences(item) {
  const refs = [];
  if (!item || typeof item !== 'object') return refs;
  pushUniqueReference(refs, item.uuid);
  pushUniqueReference(refs, getCompendiumSourceUuid(item));
  return refs;
}

/** A name trimmed, whitespace-collapsed and lowercased for exact matching. A definition's name is
 * a registration snapshot and a compendium document's name is read live; neither is a localized
 * key, so the client language cannot move a match. */
export function normalizeMatchName(name) {
  return String(name ?? '')
    .trim()
    .replaceAll(/\s+/g, ' ')
    .toLowerCase();
}

/** The uuids a registration source owns: the one it is registered from, then its document's. */
export function getOwnSourceUuids(registeredItemUuid, source) {
  const refs = [];
  pushUniqueReference(refs, registeredItemUuid);
  pushUniqueReference(refs, source?.uuid);
  return refs;
}

function claimsAny(definition, uuids) {
  const held = getItemMatchUuids(definition);
  return uuids.some((uuid) => held.includes(uuid));
}

// A clone, or a derivative: a source whose recorded compendium source the resolved `snapshot`
// leaves out. Either keys on its own uuid alone (issue 2217).
function isOwnKeyedSource(source, snapshot) {
  if (getDuplicateSourceUuid(source)) return true;
  const compendiumUuid = getCompendiumSourceUuid(source);
  return !!compendiumUuid && !getItemMatchUuids(snapshot).includes(compendiumUuid);
}

/**
 * The definition a registration source already has, by find-existing precedence (issue 2217): a
 * durable id its flags carry, then a claim on its own uuid, then any reference `snapshot` claims.
 * A clone's or derivative's durable id naming a definition that claims none of its own uuids is
 * an inherited marker and is passed over.
 */
export function findRegisteredDefinition(definitions, snapshot, source, durableIds = []) {
  const own = getOwnSourceUuids(snapshot?.registeredItemUuid, source);
  const ownKeyed = isOwnKeyedSource(source, snapshot);
  for (const id of durableIds) {
    if (id == null) continue;
    const named = definitions.find((definition) => String(definition?.id) === String(id));
    if (named && (!ownKeyed || claimsAny(named, own))) return named;
  }
  return (
    definitions.find((definition) => claimsAny(definition, own)) ||
    definitions.find((definition) => claimsAny(definition, getItemMatchUuids(snapshot))) ||
    null
  );
}

/**
 * A re-registration neither adds nor releases a compendium-source claim (issue 2217). When
 * `existing` already claims the source's own uuid, a claim it lacks is withheld from `snapshot`
 * whatever the source's name now says, and one it holds stays as an alias once the origin moves
 * off it. Any other pairing answers `snapshot` unchanged.
 */
export function settleCompendiumClaim(snapshot, existing, source) {
  const compendiumUuid = getDuplicateSourceUuid(source) ? null : getCompendiumSourceUuid(source);
  const own = getOwnSourceUuids(snapshot?.registeredItemUuid, source);
  if (!compendiumUuid || own.includes(compendiumUuid) || !claimsAny(existing, own)) return snapshot;
  const aliasItemUuids = (snapshot.aliasItemUuids || []).filter((ref) => ref !== compendiumUuid);
  if (!getItemMatchUuids(existing).includes(compendiumUuid)) {
    return { ...snapshot, originItemUuid: snapshot.registeredItemUuid, aliasItemUuids };
  }
  if (snapshot.originItemUuid === compendiumUuid) return snapshot;
  return { ...snapshot, aliasItemUuids: [...aliasItemUuids, compendiumUuid] };
}

// One console line per offending system id, not per candidate item.
const _warnedUnsafeSystemIds = new Set();

function warnUnsafeSystemIdOnce(systemId) {
  const key = String(systemId);
  if (_warnedUnsafeSystemIds.has(key)) return;
  _warnedUnsafeSystemIds.add(key);
  console.warn?.(
    `Fabricate | crafting system id "${key}" is not a valid durable-flag map key (it contains a "." or other unsafe character), so its durable identities (components, tools, and recipe items) resolve only by raw source references, not the per-system \`roles\` identity map. Recreate/re-import the system with a valid id (letters, digits, "_" or "-").`
  );
}

/**
 * `flags.fabricate.roles[systemId][roleKey]`. An absent `roles`, an absent or empty
 * `roles[systemId]`, or a nullish leaf is no claim.
 */
function claimedRoleId(item, systemId, roleKey) {
  // A dotted systemId would be nested by expandObject on write, so it can index no roles key; the
  // resolver degrades to raw refs.
  if (!isSafeFlagKeySegment(systemId)) return null;
  const roles = getFabricateFlag(item, 'roles', null);
  if (!roles || typeof roles !== 'object') return null;
  const perSystem = roles[systemId];
  if (!perSystem || typeof perSystem !== 'object') return null;
  const claimed = perSystem[roleKey];
  return claimed ?? null;
}

/** The durable-flag tiers for every kind, so hygiene and fall-through order live here once. */
function durableClaimedFromSet(item, candidates, systemId, { roleKey, legacyScalarKey }) {
  // Tier 1: the per-system identity map.
  const roleId = claimedRoleId(item, systemId, roleKey);
  const index = getDefinitionIndex(candidates);
  if (roleId != null) {
    const byRole = findById(index, roleId);
    if (byRole) return byRole;
  }

  // Tier 2: legacy scalar identity, honored until the restamp backfills the map.
  if (legacyScalarKey != null) {
    const legacyId = getFabricateFlag(item, legacyScalarKey, null);
    if (legacyId != null) {
      const byLegacy = findById(index, legacyId);
      if (byLegacy) return byLegacy;
    }
  }

  return null;
}

function durableClaimedComponent(item, candidates, systemId) {
  return durableClaimedFromSet(item, candidates, systemId, {
    roleKey: 'componentId',
    legacyScalarKey: 'componentId',
  });
}

/** Any system's `roles[*].componentId`, or the legacy flat `componentId` scalar. */
export function itemHasComponentIdentityFlag(item) {
  if (!item || typeof item !== 'object') return false;
  if (getFabricateFlag(item, 'componentId', null) != null) return true;
  const roles = getFabricateFlag(item, 'roles', null);
  if (roles && typeof roles === 'object') {
    for (const perSystem of Object.values(roles)) {
      if (perSystem && typeof perSystem === 'object' && perSystem.componentId != null) return true;
    }
  }
  return false;
}

/** Which component an owned item is, within one system's candidates. */
export function resolveComponentForItem(item, components, systemId) {
  if (!item || typeof item !== 'object') return null;
  const candidates = Array.isArray(components) ? components : [];
  if (candidates.length === 0) return null;

  // Every stamp site skips a dotted systemId, so no identity claim exists for one.
  if (systemId != null && !isSafeFlagKeySegment(systemId)) {
    warnUnsafeSystemIdOnce(systemId);
  }

  const durable = durableClaimedComponent(item, candidates, systemId);
  if (durable) return durable;

  // Tier 3: raw source references.
  const itemRefs = getItemSourceReferences(item);
  if (itemRefs.length === 0) return null;
  return findBySourceRefs(getDefinitionIndex(candidates), itemRefs);
}

/** The Tool analogue of {@link resolveComponentForItem} (issue 561). */
export function resolveToolForItem(item, tools, systemId) {
  if (!item || typeof item !== 'object') return null;
  const candidates = Array.isArray(tools) ? tools : [];
  if (candidates.length === 0) return null;

  if (systemId != null && !isSafeFlagKeySegment(systemId)) {
    warnUnsafeSystemIdOnce(systemId);
  }

  const durable = durableClaimedFromSet(item, candidates, systemId, {
    roleKey: 'toolId',
    legacyScalarKey: null,
  });
  if (durable) return durable;

  const itemRefs = getItemSourceReferences(item);
  if (itemRefs.length === 0) return null;
  return findBySourceRefs(getDefinitionIndex(candidates), itemRefs);
}

export function itemResolvesToTool(item, tool, tools, systemId) {
  if (!tool || tool.id == null) return false;
  const resolved = resolveToolForItem(item, tools, systemId);
  return resolved != null && resolved.id === tool.id;
}

/** The narrow durable-identity gate for destructive tool selection (issue 561). */
export function itemIsToolByDurableIdentity(item, tool, tools, systemId) {
  if (!item || typeof item !== 'object') return false;
  if (!tool || tool.id == null) return false;
  const candidates = Array.isArray(tools) ? tools : [];
  if (candidates.length === 0) return false;

  if (systemId != null && !isSafeFlagKeySegment(systemId)) {
    warnUnsafeSystemIdOnce(systemId);
  }

  const durable = durableClaimedFromSet(item, candidates, systemId, {
    roleKey: 'toolId',
    legacyScalarKey: null,
  });
  if (durable) return durable.id === tool.id;

  const itemRefs = getItemIdentityReferences(item);
  if (itemRefs.length === 0) return false;
  const resolved = findBySourceRefs(getDefinitionIndex(candidates), itemRefs);
  return resolved != null && resolved.id === tool.id;
}

export function itemResolvesToComponent(
  item,
  component,
  components,
  systemId,
  resolveComponent = resolveComponentForItem
) {
  if (!component || component.id == null) return false;
  const resolved = resolveComponent(item, components, systemId);
  return resolved != null && resolved.id === component.id;
}

/** The tier order for {@link matchRecipeItemDefinition}, most to least durable. */
export const RECIPE_ITEM_MATCH_TIERS = ['identity', 'uuid', 'compendium', 'duplicate'];

/** Which recipe-item definition, and by how durable a link. */
export function matchRecipeItemDefinition(item, definitions, systemId) {
  const empty = { definition: null, tier: null };
  if (!item || typeof item !== 'object') return empty;
  const defs = Array.isArray(definitions) ? definitions : [];
  if (defs.length === 0) return empty;

  // A dotted systemId has no `roles` claim: degrade to the later tiers, warning once.
  if (systemId != null && !isSafeFlagKeySegment(systemId)) {
    warnUnsafeSystemIdOnce(systemId);
  }

  // Tier 1: the `roles` map, then the legacy scalar, both list-aware.
  const durable = durableClaimedFromSet(item, defs, systemId, {
    roleKey: 'recipeItemDefinitionId',
    legacyScalarKey: 'recipeItemDefinitionId',
  });
  if (durable) return { definition: durable, tier: 'identity' };

  // Tiers 2-4 test the definition's union of source refs, so a compendium-imported book resolves
  // whichever copy the owned item was dragged from.
  const index = getDefinitionIndex(defs);
  const refByTier = {
    uuid: typeof item.uuid === 'string' ? item.uuid : null,
    compendium: getCompendiumSourceUuid(item),
    duplicate: getDuplicateSourceUuid(item),
  };

  for (const tier of RECIPE_ITEM_MATCH_TIERS) {
    if (tier === 'identity') continue;
    const ref = refByTier[tier];
    if (ref == null) continue;
    const definition = findBySourceRefs(index, [ref]);
    if (definition) return { definition, tier };
  }
  return empty;
}

export function itemMatchesRecipeItemSource(item, definitions, systemId) {
  return matchRecipeItemDefinition(item, definitions, systemId).definition != null;
}

function resolveSourceComponentIdentity(source, components, systemId) {
  if (!source || typeof source !== 'object') return null;
  if (typeof source.getFlag === 'function') {
    return resolveComponentForItem(source, components, systemId);
  }
  return source;
}

/** An owned item sharing a source reference and holding a stack quantity to increment. */
export function findStackableMatch(items, source, components = [], systemId) {
  const sourceRefs = new Set(
    [...getItemSourceReferences(source), ...getItemMatchUuids(source)].filter(Boolean)
  );
  if (sourceRefs.size === 0) return null;
  const sourceComponent = resolveSourceComponentIdentity(source, components, systemId);
  for (const item of Array.isArray(items) ? items : []) {
    // Presence, not a count: a stored 0 still stacks; gear with no such field never does.
    if (!hasStackQuantity(item)) continue;
    const candidateComponent = resolveComponentForItem(item, components, systemId);
    // Skip ONLY when both identities resolve and name different components.
    if (sourceComponent && candidateComponent && sourceComponent.id !== candidateComponent.id) {
      continue;
    }
    if (getItemSourceReferences(item).some((ref) => sourceRefs.has(ref))) return item;
  }
  return null;
}
