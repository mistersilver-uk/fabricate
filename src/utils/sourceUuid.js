import { getFabricateFlag, isSafeFlagKeySegment } from '../config/flags.js';
import { hasStackQuantity } from '../systems/itemStackQuantity.js';

import { findById, findBySourceRefs, getDefinitionIndex } from './definitionIndex.js';
import { getItemMatchUuids, pushUniqueReference } from './sourceReferenceUnion.js';

// Re-exported at its historical spelling so the eleven existing importers of `getItemMatchUuids`
// from this module are unaffected by the extraction that broke the `sourceUuid` <->
// `definitionIndex` import cycle.
export { getItemMatchUuids } from './sourceReferenceUnion.js';

/** Resolve the compendium source UUID of a Foundry item document. */
export function getCompendiumSourceUuid(item) {
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

/** Resolve the world-duplicate source UUID of a Foundry item document. */
export function getDuplicateSourceUuid(item) {
  if (!item) return null;
  return item._stats?.duplicateSource || item.system?._stats?.duplicateSource || null;
}

/** Collect the UUIDs that may identify a Foundry item instance and its canonical source. */
export function getItemSourceReferences(item) {
  const refs = [];
  if (!item || typeof item !== 'object') return refs;
  pushUniqueReference(refs, item.uuid);
  pushUniqueReference(refs, getCompendiumSourceUuid(item));
  pushUniqueReference(refs, getDuplicateSourceUuid(item));
  return refs;
}

/**
 * Collect the UUIDs that identify a Foundry item instance and its canonical compendium source — but
 * NOT its world-duplicate source.
 */
export function getItemIdentityReferences(item) {
  const refs = [];
  if (!item || typeof item !== 'object') return refs;
  pushUniqueReference(refs, item.uuid);
  pushUniqueReference(refs, getCompendiumSourceUuid(item));
  return refs;
}

// Systems already warned-about, so a per-item resolve loop emits at most one console line per
// offending system id rather than one per candidate item.
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
 * Read the per-system durable identity a given ROLE claims for an item via
 * `flags.fabricate.roles[systemId][roleKey]` (`roleKey` is `'componentId'`, `'toolId'`, …),
 * applying the hygiene rule: an absent `roles`, an absent or empty `roles[systemId]`, or a nullish
 * leaf all yield no claim.
 */
function claimedRoleId(item, systemId, roleKey) {
  // A `systemId` that is not a safe single dotted-path segment (absent, or containing a `.` that
  // `expandObject` would have nested on write) can never index the `roles` map correctly, so it
  // yields NO identity and the resolver degrades to raw refs rather than reading a mis-keyed map.
  if (!isSafeFlagKeySegment(systemId)) return null;
  const roles = getFabricateFlag(item, 'roles', null);
  if (!roles || typeof roles !== 'object') return null;
  const perSystem = roles[systemId];
  if (!perSystem || typeof perSystem !== 'object') return null;
  const claimed = perSystem[roleKey];
  return claimed ?? null;
}

/**
 * The durable-flag tiers of a registered kind's identity, GENERALIZED over the per-system role leaf
 * (`roleKey`) and the optional legacy scalar flag (`legacyScalarKey`), so the flag hygiene and
 * fall-through order live in exactly one place for every kind (components and first-class tools).
 */
function durableClaimedFromSet(item, candidates, systemId, { roleKey, legacyScalarKey }) {
  // Tier 1: durable per-system identity map.
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

/**
 * The two durable-flag tiers of COMPONENT identity — `durableClaimedFromSet` with the component
 * role leaf and its legacy scalar.
 */
function durableClaimedComponent(item, candidates, systemId) {
  return durableClaimedFromSet(item, candidates, systemId, {
    roleKey: 'componentId',
    legacyScalarKey: 'componentId',
  });
}

/**
 * Whether an owned item carries ANY durable COMPONENT identity claim — a per-system
 * `flags.fabricate.roles[*].componentId` for some system, OR the legacy flat
 * `flags.fabricate.componentId` scalar.
 */
export function itemHasComponentIdentityFlag(item) {
  if (!item || typeof item !== 'object') return false;
  // Legacy flat scalar — honored until the one-shot restamp backfills the roles map.
  if (getFabricateFlag(item, 'componentId', null) != null) return true;
  // Per-system roles map — a non-nullish `componentId` leaf under ANY system is a claim.
  const roles = getFabricateFlag(item, 'roles', null);
  if (roles && typeof roles === 'object') {
    for (const perSystem of Object.values(roles)) {
      if (perSystem && typeof perSystem === 'object' && perSystem.componentId != null) return true;
    }
  }
  return false;
}

/**
 * Resolve which single component an owned item IS, within ONE crafting system's candidate set,
 * scoped by that system's id.
 */
export function resolveComponentForItem(item, components, systemId) {
  if (!item || typeof item !== 'object') return null;
  const candidates = Array.isArray(components) ? components : [];
  if (candidates.length === 0) return null;

  // An unsafe (e.g. dotted) systemId can never have been written as a `roles` map key — every
  // stamp/repair/restamp site skips it — so there is no identity claim to honour.
  if (systemId != null && !isSafeFlagKeySegment(systemId)) {
    warnUnsafeSystemIdOnce(systemId);
  }

  // Tiers 1-2: durable-flag identity.
  const durable = durableClaimedComponent(item, candidates, systemId);
  if (durable) return durable;

  // Tier 3: raw source-reference intersection, resolved through the retained reverse map.
  const itemRefs = getItemSourceReferences(item);
  if (itemRefs.length === 0) return null;
  return findBySourceRefs(getDefinitionIndex(candidates), itemRefs);
}

// ── First-class Tool identity (issue 561) ──

/**
 * Resolve which single first-class Tool an owned item IS, within ONE crafting system's Tools set,
 * scoped by that system's id — the Tool-kind analogue of {@link resolveComponentForItem}.
 */
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

/**
 * Boolean companion to {@link resolveToolForItem}: whether the item resolves, within `tools` scoped
 * by `systemId`, to the specific `tool`.
 */
export function itemResolvesToTool(item, tool, tools, systemId) {
  if (!tool || tool.id == null) return false;
  const resolved = resolveToolForItem(item, tools, systemId);
  return resolved != null && resolved.id === tool.id;
}

/**
 * Whether an owned item IS the given first-class `tool` by **durable-identity matching** — the
 * NARROW gate for destructive/consumptive tool selection (issue 561, superseding the
 * component-scoped #557 gate).
 */
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

/**
 * Boolean companion to {@link resolveComponentForItem}: whether the item resolves, within
 * `components` scoped by `systemId`, to the specific `component`.
 */
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

/**
 * Resolve which recipe-item definition an item IS, and by how durable a link, within ONE crafting
 * system's candidate set scoped by that system's id.
 */
export function matchRecipeItemDefinition(item, definitions, systemId) {
  const empty = { definition: null, tier: null };
  if (!item || typeof item !== 'object') return empty;
  const defs = Array.isArray(definitions) ? definitions : [];
  if (defs.length === 0) return empty;

  // A dotted/unsafe systemId can never have been written as a `roles` map key, so there is no
  // identity claim to honour; degrade to the legacy scalar + source-uuid tiers and leave a single
  // breadcrumb per offending system rather than a mute degrade or a throw.
  if (systemId != null && !isSafeFlagKeySegment(systemId)) {
    warnUnsafeSystemIdOnce(systemId);
  }

  // Tier 1 (identity): the durable per-system `roles` map, then the legacy scalar — both
  // list-aware.
  const durable = durableClaimedFromSet(item, defs, systemId, {
    roleKey: 'recipeItemDefinitionId',
    legacyScalarKey: 'recipeItemDefinitionId',
  });
  if (durable) return { definition: durable, tier: 'identity' };

  // Tiers 2/3/4 test membership in the definition's UNION of source refs (its `registeredItemUuid`
  // + `originItemUuid` + aliases), so a compendium-imported book resolves whether the owned copy
  // was dragged from the compendium item or the imported world item.
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

/** Whether an item matches any of the given recipe-item definitions, by any tier. */
export function itemMatchesRecipeItemSource(item, definitions, systemId) {
  return matchRecipeItemDefinition(item, definitions, systemId).definition != null;
}

/** Resolve the durable component identity of a gathering-award SOURCE. */
function resolveSourceComponentIdentity(source, components, systemId) {
  if (!source || typeof source !== 'object') return null;
  if (typeof source.getFlag === 'function') {
    return resolveComponentForItem(source, components, systemId);
  }
  // A bare component source's identity is itself.
  return source;
}

/**
 * Find an existing actor item that should stack with a freshly-awarded source — one that shares a
 * source-UUID reference with `source` AND carries a value at the configured stack-quantity path (so
 * it can be incremented).
 */
export function findStackableMatch(items, source, components = [], systemId) {
  const sourceRefs = new Set(
    [...getItemSourceReferences(source), ...getItemMatchUuids(source)].filter(Boolean)
  );
  if (sourceRefs.size === 0) return null;
  const sourceComponent = resolveSourceComponentIdentity(source, components, systemId);
  for (const item of Array.isArray(items) ? items : []) {
    // Stackability, not a count: `hasStackQuantity` tests PRESENCE, so an item with a stored 0
    // still stacks (as it did before) and unique gear with no such field never does.
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
