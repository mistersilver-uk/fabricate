/**
 * The item-source cluster (issue 1923): the legacy recipe-item reconciler, component and
 * recipe-item registration from an Item uuid, component source replacement and the GM metadata
 * refresh, extracted from `CraftingSystemManager`. Every collaborator arrives in `io`, which the
 * manager's delegate rebuilds per call, so an instance patch is still observed.
 */
import { advanceDefinitionRevision } from '../../utils/definitionIndex.js';
import {
  getCompendiumSourceUuid,
  getDuplicateSourceUuid,
  getItemIdentityReferences,
  getItemMatchUuids,
} from '../../utils/sourceUuid.js';

import { baseCollaborators, COMPONENT_FACTS, RECIPE_ITEM_FACTS } from './collaborators.js';

/** This cluster's `io` bag: the base thunks plus the manager members the moved bodies reach. */
export function itemSourcesCollaborators(manager) {
  return {
    ...baseCollaborators(manager),
    systems: () => manager.systems,
    isActiveGM: () => manager._isActiveGM(),
    componentRoleFlagKey: (systemId) => manager._componentRoleFlagKey(systemId),
    recipeItemRoleFlagKey: (systemId) => manager._recipeItemRoleFlagKey(systemId),
    stampSourceIdentity: (source, flagKey, id) => manager._stampSourceIdentity(source, flagKey, id),
    clearSourceFlag: (registeredItemUuid, flagKey, id) =>
      manager._clearSourceFlag(registeredItemUuid, flagKey, id),
    buildComponentSourceSnapshot: (...args) => manager._buildComponentSourceSnapshot(...args),
    buildRecipeItemSourceSnapshot: (...args) => manager._buildRecipeItemSourceSnapshot(...args),
    buildFallbackSourceReferences: (...args) => manager._buildFallbackSourceReferences(...args),
    extractSourceDescription: (source) => manager._extractSourceDescription(source),
    resolveImportedComponentSourceData: (itemUuid, source) =>
      manager._resolveImportedComponentSourceData(itemUuid, source),
    findComponentBySourceReferences: (...args) => manager._findComponentBySourceReferences(...args),
    assertUniqueComponentSources: (...args) => manager._assertUniqueComponentSources(...args),
    findRecipeItemDefinitionForSource: (system, snapshot, source) =>
      manager._findRecipeItemDefinitionForSource(system, snapshot, source),
    scopeBasis: (system) => manager._scopeBasis(system),
    salvageNormalizationContext: (system) => manager._salvageNormalizationContext(system),
    normalizeComponent: (item, options) => manager._normalizeComponent(item, options),
    normalizeRecipeItemDefinition: (entry, usedIds) =>
      manager._normalizeRecipeItemDefinition(entry, usedIds),
  };
}

/** The Item document behind `itemUuid`; an unresolvable uuid passes through as `null`, and a
 * resolved non-Item document throws `nonItemMessage(documentName)`. */
async function resolveItemSource(itemUuid, nonItemMessage) {
  let source;
  try {
    source = await fromUuid(itemUuid);
  } catch {
    source = null;
  }

  if (source && source.documentName && source.documentName !== 'Item') {
    throw new Error(nonItemMessage(source.documentName));
  }
  return source;
}

/**
 * Reconcile recipes' legacy `recipeItemId` scalar with book membership. Runs ungated on every
 * `initialize()`, so both halves are idempotent and share one walk and one save per setting.
 * It mints a definition and stamps the scalar for a recipe keeping a standalone
 * `linkedRecipeItemUuid`, and clears a leaked scalar (issue 978) on a book member, since
 * legacy resolvers read it ahead of `recipe.img` (issue 887). The cohorts never overlap.
 */
export async function migrateLegacyRecipeItems(io) {
  if (!io.recipeManager()?.getRecipes || !io.recipeManager()?.save) return false;

  let systemsChanged = false;
  let recipesChanged = false;

  for (const system of io.getSystems()) {
    if (!Array.isArray(system.recipeItemDefinitions)) {
      system.recipeItemDefinitions = [];
    }

    const definitions = system.recipeItemDefinitions;
    const usedIds = new Set(definitions.map((def) => def.id));
    const bySource = new Map(
      definitions.filter((def) => def.originItemUuid).map((def) => [def.originItemUuid, def])
    );

    const recipes = io.recipeManager().getRecipes({ craftingSystemId: system.id });

    for (const recipe of recipes) {
      // Half 2 (issue 978) first, so a cleared recipe (no `linkedRecipeItemUuid`) is no
      // re-stamp candidate and the repair converges in one pass.
      if (
        recipe?.recipeItemId &&
        !String(recipe?.linkedRecipeItemUuid || '').trim() &&
        definitions.some((def) =>
          (Array.isArray(def.recipeIds) ? def.recipeIds : []).some(
            (id) => String(id) === String(recipe.id)
          )
        )
      ) {
        recipe.recipeItemId = null;
        recipesChanged = true;
      }

      const hasValidRecipeItemId =
        recipe?.recipeItemId && definitions.some((def) => def.id === recipe.recipeItemId);
      if (hasValidRecipeItemId) continue;

      const legacyUuid = String(recipe?.linkedRecipeItemUuid || '').trim();
      if (!legacyUuid) continue;

      let definition = bySource.get(legacyUuid);
      if (!definition) {
        let source;
        try {
          source = typeof fromUuidSync === 'function' ? fromUuidSync(legacyUuid) : null;
        } catch {
          source = null;
        }

        definition = io.normalizeRecipeItemDefinition(
          await io.buildRecipeItemSourceSnapshot(legacyUuid, source, {
            name: recipe?.name || 'Recipe Item',
            img: recipe?.img || 'icons/svg/item-bag.svg',
            description: recipe?.description || '',
          }),
          usedIds
        );
        if (!definition) continue;

        usedIds.add(definition.id);
        definitions.push(definition);
        if (definition.originItemUuid) {
          bySource.set(definition.originItemUuid, definition);
        }
        systemsChanged = true;
      }

      if (recipe.recipeItemId !== definition.id) {
        recipe.recipeItemId = definition.id;
        recipesChanged = true;
      }
    }
  }

  // The saves write GM-only world settings, and this runs from `initialize()` before
  // `runStartupMaintenance`'s isolation: on a player the rejection would leave `initialized`
  // false and break the facade for the session (issue 970). The in-memory pass stays ungated.
  if (!io.isActiveGM()) return false;
  if (systemsChanged) await io.saveSystems({ domains: RECIPE_ITEM_FACTS });
  if (recipesChanged) await io.recipeManager().save();
  return systemsChanged || recipesChanged;
}

export async function addRecipeItemFromUuid(io, systemId, itemUuid) {
  io.assertGM('add recipe item from uuid');
  const system = io.getSystem(systemId);
  if (!system) throw new Error(`Crafting system not found: ${systemId}`);

  const source = await resolveItemSource(
    itemUuid,
    (documentName) => `Cannot add non-Item document (${documentName}) as a recipe item`
  );

  // The recipe-item identity leaf (issue 567); an unsafe id yields null, so no stamp or clear
  // runs and the item resolves through the legacy scalar and raw references.
  const roleFlagKey = io.recipeItemRoleFlagKey(system.id);

  const snapshot = await io.buildRecipeItemSourceSnapshot(itemUuid, source);
  const existing = io.findRecipeItemDefinitionForSource(system, snapshot, source);
  if (existing) {
    const unchanged =
      existing.name === snapshot.name &&
      existing.img === snapshot.img &&
      existing.description === snapshot.description &&
      existing.originItemUuid === snapshot.originItemUuid;

    // Stamp the identity leaf (and strip a clone's stale `_stats`) on both branches, so
    // re-registering an unchanged definition recovers a source predating the flag (issue 555).
    const previousSourceUuid = existing.originItemUuid;
    if (roleFlagKey) await io.stampSourceIdentity(source, roleFlagKey, existing.id);

    if (unchanged) {
      return { item: existing, action: 'skipped' };
    }

    existing.name = snapshot.name;
    existing.img = snapshot.img;
    existing.description = snapshot.description;
    existing.originItemUuid = snapshot.originItemUuid;
    // Indexed fields changed at constant length, invisible to the `definitionIndex` rule.
    advanceDefinitionRevision(system.recipeItemDefinitions);

    await io.saveSystems({ put: system, domains: RECIPE_ITEM_FACTS });
    // A re-point clears only this system's leaf off the old source, never the whole `roles`
    // flag or `roles[systemId]`, which would destroy sibling componentId/toolId.
    if (roleFlagKey && previousSourceUuid && previousSourceUuid !== snapshot.originItemUuid) {
      await io.clearSourceFlag(previousSourceUuid, roleFlagKey, existing.id);
    }
    return { item: existing, action: 'updated' };
  }

  const recipeItemDefinitions = Array.isArray(system.recipeItemDefinitions)
    ? system.recipeItemDefinitions
    : [];
  const item = io.normalizeRecipeItemDefinition(
    snapshot,
    new Set(recipeItemDefinitions.map((def) => def.id))
  );
  recipeItemDefinitions.push(item);
  advanceDefinitionRevision(recipeItemDefinitions);
  system.recipeItemDefinitions = recipeItemDefinitions;

  if (roleFlagKey) await io.stampSourceIdentity(source, roleFlagKey, item.id);
  await io.saveSystems({ put: system, domains: RECIPE_ITEM_FACTS });
  return { item, action: 'added' };
}

/** The live and canonical source references for an imported item uuid.
 * @returns {{ currentUuid: string|null, canonicalUuid: string|null, references: string[] }} */
function resolveImportedSourceData(itemUuid, source = null) {
  const references = [];
  if (typeof itemUuid === 'string' && itemUuid.trim()) {
    references.push(itemUuid.trim());
  }
  // A world source with `_stats.duplicateSource` is a clone whose inherited `compendiumSource`
  // names the original's pack, so it keys on its own uuid or it would overwrite the original's
  // definition (issue 555). Registration only: Foundry stamps `duplicateSource` on every
  // non-compendium drag-drop, so `matchRecipeItemDefinition` has no clone gate.
  const isClone = !!getDuplicateSourceUuid(source);
  const identityRefs = isClone
    ? [source?.uuid].filter((ref) => typeof ref === 'string' && ref.trim())
    : getItemIdentityReferences(source);
  for (const ref of identityRefs) {
    if (!references.includes(ref)) references.push(ref);
  }
  const currentUuid = references[0] || null;
  const canonicalUuid = (isClone ? null : getCompendiumSourceUuid(source)) || currentUuid;
  return { currentUuid, canonicalUuid, references, isClone };
}

/**
 * Component import source references, falling back when the recorded canonical source no
 * longer resolves.
 * @returns {Promise<{currentUuid: string|null, canonicalUuid: string|null, references: string[],
 *   aliasItemUuids: string[],
 *   sourceFallbacks: Array<{itemName: string, brokenUuid: string, fallbackUuid: string}>}>}
 */
export async function resolveImportedComponentSourceData(itemUuid, source = null) {
  const sourceData = resolveImportedSourceData(itemUuid, source);
  const sourceFallbacks = [];
  const aliasItemUuids = [];
  // A clone's inherited compendium source was already stripped; never resurrect it here.
  if (sourceData.isClone) {
    return { ...sourceData, aliasItemUuids, sourceFallbacks };
  }
  const recordedCanonicalUuid = getCompendiumSourceUuid(source);
  const currentUuid = sourceData.currentUuid;
  if (!recordedCanonicalUuid || !currentUuid || recordedCanonicalUuid === currentUuid) {
    return { ...sourceData, aliasItemUuids, sourceFallbacks };
  }

  let canonicalSource;
  try {
    canonicalSource = typeof fromUuid === 'function' ? await fromUuid(recordedCanonicalUuid) : null;
  } catch {
    canonicalSource = null;
  }

  if (canonicalSource) {
    return { ...sourceData, aliasItemUuids, sourceFallbacks };
  }

  if (!sourceData.references.includes(recordedCanonicalUuid)) {
    sourceData.references.push(recordedCanonicalUuid);
  }
  aliasItemUuids.push(recordedCanonicalUuid);
  sourceFallbacks.push({
    itemName: source?.name || itemUuid?.split('.')?.pop() || 'Imported Item',
    brokenUuid: recordedCanonicalUuid,
    fallbackUuid: currentUuid,
  });
  return {
    ...sourceData,
    canonicalUuid: currentUuid,
    aliasItemUuids,
    sourceFallbacks,
  };
}

/**
 * Import (or refresh) a single component from a source Item uuid.
 *
 * @param {{persist?: boolean}} [options] `persist: false` lets a batch caller such as
 *   `addItemsFromPack` issue one `save()` for many items; nothing else changes.
 */
export async function addItemFromUuid(io, systemId, itemUuid, options = {}) {
  io.assertGM('add component from uuid');
  const system = io.getSystem(systemId);
  if (!system) throw new Error(`Crafting system not found: ${systemId}`);

  const source = await resolveItemSource(
    itemUuid,
    (documentName) => `Cannot add non-Item document (${documentName}) as a crafting component`
  );

  const nextSourceData = await io.resolveImportedComponentSourceData(itemUuid, source);
  const existing = io.findComponentBySourceReferences(system, nextSourceData.references);
  const nextSnapshot = await io.buildComponentSourceSnapshot(
    itemUuid,
    source,
    existing,
    nextSourceData
  );
  if (existing) {
    const nextFallbacks = io.buildFallbackSourceReferences(
      existing,
      nextSnapshot.registeredItemUuid,
      nextSnapshot.originItemUuid,
      nextSnapshot.aliasItemUuids
    );
    const unchanged =
      existing.registeredItemUuid === nextSnapshot.registeredItemUuid &&
      existing.originItemUuid === nextSnapshot.originItemUuid &&
      existing.name === nextSnapshot.name &&
      existing.img === nextSnapshot.img &&
      existing.description === nextSnapshot.description &&
      nextFallbacks.length === (existing.aliasItemUuids || []).length &&
      nextFallbacks.every((ref) => (existing.aliasItemUuids || []).includes(ref));

    // Stamp the source on both branches so one predating the flag, or re-imported, carries the
    // component id; skipped for an unsafe system id.
    const existingRoleKey = io.componentRoleFlagKey(system.id);
    if (existingRoleKey) await io.stampSourceIdentity(source, existingRoleKey, existing.id);

    if (unchanged) {
      return { item: existing, action: 'skipped', sourceFallbacks: nextSnapshot.sourceFallbacks };
    }

    existing.name = nextSnapshot.name;
    existing.img = nextSnapshot.img;
    existing.description = nextSnapshot.description;
    existing.registeredItemUuid = nextSnapshot.registeredItemUuid;
    existing.originItemUuid = nextSnapshot.originItemUuid;
    existing.aliasItemUuids = nextFallbacks;
    // Indexed fields rewritten in place (issue 1076).
    advanceDefinitionRevision(system.components);

    if (options.persist !== false) await io.saveSystems({ put: system, domains: COMPONENT_FACTS });
    return { item: existing, action: 'updated', sourceFallbacks: nextSnapshot.sourceFallbacks };
  }

  // No match: create a new component. A `_normalizeSystem` bypass site (issue 1359): same basis,
  // same helper, `Set|null`; see `_scopeBasis`.
  const { essenceIds: validEssenceIds } = io.scopeBasis(system);
  const item = io.normalizeComponent(
    {
      ...nextSnapshot,
    },
    { validEssenceIds, ...io.salvageNormalizationContext(system) }
  );

  io.assertUniqueComponentSources(system, item);
  system.components.push(item);
  advanceDefinitionRevision(system.components);
  const addedRoleKey = io.componentRoleFlagKey(system.id);
  if (addedRoleKey) await io.stampSourceIdentity(source, addedRoleKey, item.id);
  if (options.persist !== false) await io.saveSystems({ put: system, domains: COMPONENT_FACTS });
  return { item, action: 'added', sourceFallbacks: nextSnapshot.sourceFallbacks };
}

/** Replace a component's source Item link and return fallback metadata when the dropped Item's
 * recorded canonical source is broken.
 * @returns {Promise<{item: object,
 *   sourceFallbacks: Array<{itemName: string, brokenUuid: string, fallbackUuid: string}>}>} */
export async function replaceItemSource(io, systemId, itemId, itemUuid) {
  io.assertGM('replace component source');
  const system = io.getSystem(systemId);
  if (!system) throw new Error(`Crafting system not found: ${systemId}`);
  const idx = system.components.findIndex((i) => i.id === itemId);
  if (idx === -1) throw new Error(`Component not found: ${itemId}`);

  const source = await resolveItemSource(
    itemUuid,
    (documentName) => `Cannot use non-Item document (${documentName}) as a component source`
  );

  const existing = system.components[idx];
  const previousSourceUuid = existing.originItemUuid || existing.registeredItemUuid || null;
  const nextSnapshot = await io.buildComponentSourceSnapshot(itemUuid, source, existing);
  const conflict = io.findComponentBySourceReferences(system, nextSnapshot.references, itemId);
  if (conflict) {
    throw new Error(
      `Component source reference already belongs to "${conflict.name || conflict.id}" (${conflict.id})`
    );
  }

  // A `_normalizeSystem` bypass site (issue 1359): same basis, `Set|null`; see `_scopeBasis`.
  const { essenceIds: validEssenceIds } = io.scopeBasis(system);
  const updatedItem = io.normalizeComponent(
    {
      ...existing,
      ...nextSnapshot,
      aliasItemUuids: io.buildFallbackSourceReferences(
        existing,
        nextSnapshot.registeredItemUuid,
        nextSnapshot.originItemUuid,
        nextSnapshot.aliasItemUuids
      ),
      id: itemId,
    },
    { validEssenceIds, ...io.salvageNormalizationContext(system) }
  );

  system.components[idx] = updatedItem;
  advanceDefinitionRevision(system.components);
  // Re-point the flag: clear the old source if it points here and stamp the new one.
  const replaceRoleKey = io.componentRoleFlagKey(system.id);
  if (replaceRoleKey) {
    if (previousSourceUuid && previousSourceUuid !== itemUuid) {
      await io.clearSourceFlag(previousSourceUuid, replaceRoleKey, itemId);
    }
    await io.stampSourceIdentity(source, replaceRoleKey, itemId);
  }
  await io.saveSystems({ put: system, domains: COMPONENT_FACTS });
  return { item: updatedItem, sourceFallbacks: nextSnapshot.sourceFallbacks };
}

function hasChangedPath(changes = {}, path = []) {
  if (!changes || typeof changes !== 'object' || path.length === 0) return false;

  const dotted = path.join('.');
  if (Object.prototype.hasOwnProperty.call(changes, dotted)) return true;
  if (Object.keys(changes).some((key) => key.startsWith(`${dotted}.`))) return true;

  let cursor = changes;
  for (const segment of path) {
    if (
      !cursor ||
      typeof cursor !== 'object' ||
      !Object.prototype.hasOwnProperty.call(cursor, segment)
    ) {
      return false;
    }
    cursor = cursor[segment];
  }

  return true;
}

function hasUpdatedItemDescription(changes = {}) {
  return (
    hasChangedPath(changes, ['system', 'description']) || hasChangedPath(changes, ['description'])
  );
}

export async function refreshComponentMetadataForUpdatedItem(io, item, changes = {}) {
  if (!globalThis.game?.user?.isGM) return { updated: 0 };

  const refreshName = hasChangedPath(changes, ['name']);
  const refreshImg = !!changes && Object.prototype.hasOwnProperty.call(changes, 'img');
  const refreshDescription = hasUpdatedItemDescription(changes);
  if (!refreshName && !refreshImg && !refreshDescription) return { updated: 0 };

  // Identity references only: a clone's duplicateSource names its original, which must not
  // receive this edit.
  const itemRefs = new Set(getItemIdentityReferences(item));
  if (itemRefs.size === 0) return { updated: 0 };

  const nextName = refreshName ? item?.name || changes.name || 'Unnamed Item' : null;
  const nextImg = refreshImg ? item?.img || changes.img || 'icons/svg/item-bag.svg' : null;
  // Item sync resolves too (issue 800), or an edited source would re-propagate raw directive
  // text over a repaired description.
  const nextDescription = refreshDescription ? await io.extractSourceDescription(item) : null;
  let updated = 0;
  // The systems this walk rewrote (issue 1078). It walks every system, but a bare `save()` would
  // advance every system's token on each GM item edit via the `updateItem` hook.
  const touched = new Set();

  for (const system of io.systems().values()) {
    const components = Array.isArray(system.components) ? system.components : [];
    for (const component of components) {
      const matches = getItemMatchUuids(component).some((ref) => itemRefs.has(ref));
      if (!matches) continue;

      let changed = false;
      if (refreshName && component.name !== nextName) {
        component.name = nextName;
        changed = true;
      }
      if (refreshImg && component.img !== nextImg) {
        component.img = nextImg;
        changed = true;
      }
      if (refreshDescription && component.description !== nextDescription) {
        component.description = nextDescription;
        changed = true;
      }
      if (changed) {
        updated++;
        touched.add(system);
        // `name` is indexed by the name fallback and rewritten in place (issue 1076).
        advanceDefinitionRevision(components);
      }
    }
  }

  if (updated > 0) {
    await io.saveSystems({ batch: touched, domains: COMPONENT_FACTS });
    io.notifySystemsChanged();
  }

  return { updated };
}
