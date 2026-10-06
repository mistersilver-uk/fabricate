/**
 * The item-source cluster (issue 1923): the legacy recipe-item reconciler, component and
 * recipe-item registration from an Item uuid, component source replacement and the GM metadata
 * refresh; collaborators arrive in `io`. Import de-duplication (`addItemFromUuid`) keys on the
 * source's own uuid plus its compendium source, the latter dropped for a clone or a derivative;
 * the metadata refresh (`refreshComponentMetadataForUpdatedItem`) keys on the own uuid alone.
 */
import { advanceDefinitionRevision } from '../../utils/definitionIndex.js';
import { isEmbeddedItemUuid } from '../../utils/sourceReferenceUnion.js';
import {
  getCompendiumSourceUuid,
  getDuplicateSourceUuid,
  getItemIdentityReferences,
  getItemMatchUuids,
  getOwnSourceUuids,
  normalizeMatchName,
  settleCompendiumClaim,
  storedMatchName,
} from '../../utils/sourceUuid.js';

import { baseCollaborators, COMPONENT_FACTS, RECIPE_ITEM_FACTS } from './collaborators.js';
import {
  adoptedWorldComponentId,
  flushWorldComponentRegistrations,
} from './worldComponentRegistration.js';

/** This cluster's `io` bag: the base thunks plus the manager members these bodies reach. */
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
    addItemFromUuid: (...args) => manager.addItemFromUuid(...args),
    componentScopeStore: () => manager._resolveComponentScopeStore(),
    persistedSystems: () => manager._repository.readReplicatedSnapshot(),
    flushWorldComponentRegistrations: (registrations) =>
      manager.flushWorldComponentRegistrations(registrations),
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

  const resolved = await io.buildRecipeItemSourceSnapshot(itemUuid, source);
  const existing = io.findRecipeItemDefinitionForSource(system, resolved, source);
  const snapshot = settleCompendiumClaim(resolved, existing, source);
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
    // An origin move releases no claim the registration still lists, and no alias repeats the
    // origin or the registered uuid (issue 2217).
    const aliases = new Set(existing.aliasItemUuids || []);
    if ((snapshot.aliasItemUuids || []).includes(previousSourceUuid)) {
      aliases.add(previousSourceUuid);
    }
    aliases.delete(existing.originItemUuid);
    aliases.delete(existing.registeredItemUuid);
    existing.aliasItemUuids = [...aliases];
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
  // definition (issue 555). Registration only: an actor-owned copy may carry `duplicateSource`
  // too, depending on the core build, so `matchRecipeItemDefinition` has no clone gate.
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

/** Whether a non-clone source is a derivative of its resolved compendium source (issue 2217): its
 * stored name is neither the entry's stored name nor the original a translation module recorded
 * on the entry. The source's own recorded original is not read, because `fromCompendium` copies
 * the entry's flags into everything built from it. A side with no name is no evidence. */
function isDerivativeOf(source, compendiumDocument) {
  const name = storedMatchName(source);
  const entryNames = [
    storedMatchName(compendiumDocument),
    normalizeMatchName(compendiumDocument?.flags?.babele?.originalName),
  ].filter(Boolean);
  return !!name && entryNames.length > 0 && !entryNames.includes(name);
}

/**
 * Import source references for every kind. A derivative keys on its own uuid as a clone does, with
 * its `_stats` left alone; a recorded canonical source that no longer resolves falls back.
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
    if (!isDerivativeOf(source, canonicalSource)) {
      return { ...sourceData, aliasItemUuids, sourceFallbacks };
    }
    return {
      ...sourceData,
      canonicalUuid: currentUuid,
      references: sourceData.references.filter((ref) => ref !== recordedCanonicalUuid),
      aliasItemUuids,
      sourceFallbacks,
    };
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

const componentRowsOf = (io) => (systemId) => io.getSystem(systemId)?.components ?? []; // ratchet-exempt(world-scope): writer

/** Whether the persisted `craftingSystems` setting holds a component row, read once on first use.
 * A row a rejected or pending write left only in memory is not held, nor is any row of a setting
 * that cannot be read, so no membership is written for a row the setting lacks. */
function persistedRowTest(io) {
  let held = null;
  return (systemId, componentId) => {
    held ??= persistedComponentIds(io);
    return held.get(systemId)?.has(componentId) === true;
  };
}

function persistedComponentIds(io) {
  let systems;
  try {
    systems = io.persistedSystems();
  } catch {
    systems = null;
  }
  const held = new Map();
  for (const system of systems ?? []) {
    held.set(system.id, new Set((system.components ?? []).map((component) => component.id))); // ratchet-exempt(world-scope): writer
  }
  return held;
}

/** A run's world-component registrations, written in one `fabricate.componentScope` save. A
 * non-GM writes and registers nothing, and is answered rather than refused, because two callers
 * flush inside `finally`. */
export async function flushImportRegistrations(io, registrations) {
  if (!globalThis.game?.user?.isGM) return { registered: 0, error: null };
  return flushWorldComponentRegistrations({
    store: io.componentScopeStore(),
    registrations,
    rowsOf: componentRowsOf(io),
    isPersisted: persistedRowTest(io),
  });
}

/** The array one import records its registration into, or `null` when it registers nothing: an
 * Item embedded in an actor, read off its uuid when it no longer resolves, or an unpersisted call
 * whose owner passed no array to flush. */
function registrationsFor(itemUuid, source, options) {
  const embedded = source
    ? source.isEmbedded
    : isEmbeddedItemUuid(itemUuid, globalThis.foundry?.utils?.parseUuid);
  if (embedded) return null;
  if (options.registrations) return options.registrations;
  return options.persist === false ? null : [];
}

/** `{ id }` naming the World Component a new record adopts, or `{}` to mint its own id. */
function adoptedIdentity(io, system, registrations, record) {
  const store = registrations ? io.componentScopeStore() : null;
  if (!store) return {};
  const id = adoptedWorldComponentId({
    entities: store.listEntities(),
    registrations,
    rowsOf: componentRowsOf(io),
    systemId: system.id,
    record,
  });
  return id ? { id } : {};
}

function withRegistrationError(result, flushed) {
  return flushed?.error ? { ...result, worldRegistrationError: flushed.error } : result;
}

/** One exit of `addItemFromUuid`: the `craftingSystems` write when this call owns it, then the
 * row's registration, flushed here unless a batch owner passed `options.registrations`. A rejected
 * save throws before anything registers; a rejected scope write is a `worldRegistrationError`. */
async function settleImport(io, system, options, registrations, result) {
  if (result.action !== 'skipped' && options.persist !== false) {
    await io.saveSystems({ put: system, domains: COMPONENT_FACTS });
  }
  if (!registrations) return result;
  registrations.push({
    systemId: system.id,
    componentId: result.item.id,
    added: result.action === 'added',
  });
  if (registrations === options.registrations) return result;
  return withRegistrationError(result, await io.flushWorldComponentRegistrations(registrations));
}

/**
 * Import (or refresh) a single component from a source Item uuid, registering it as a World
 * Component the system holds (`### Component scope` requirement 6).
 *
 * @param {{persist?: boolean, registrations?: object[]}} [options] `persist: false` lets a batch
 *   owner issue one `save()` for many items; `registrations` is the array that owner later hands
 *   to `flushWorldComponentRegistrations`.
 */
export async function addItemFromUuid(io, systemId, itemUuid, options = {}) {
  io.assertGM('add component from uuid');
  const system = io.getSystem(systemId);
  if (!system) throw new Error(`Crafting system not found: ${systemId}`);

  const source = await resolveItemSource(
    itemUuid,
    (documentName) => `Cannot add non-Item document (${documentName}) as a crafting component`
  );
  const registrations = registrationsFor(itemUuid, source, options);
  const settle = (result) => settleImport(io, system, options, registrations, result);

  const nextSourceData = await io.resolveImportedComponentSourceData(itemUuid, source);
  // The component claiming the source's own uuid wins over one claiming only its compendium
  // source (issue 2217).
  const existing =
    io.findComponentBySourceReferences(system, getOwnSourceUuids(itemUuid, source)) ||
    io.findComponentBySourceReferences(system, nextSourceData.references);
  const nextSnapshot = settleCompendiumClaim(
    await io.buildComponentSourceSnapshot(itemUuid, source, existing, nextSourceData),
    existing,
    source
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

    const sourceFallbacks = nextSnapshot.sourceFallbacks;
    if (unchanged) return settle({ item: existing, action: 'skipped', sourceFallbacks });

    existing.name = nextSnapshot.name;
    existing.img = nextSnapshot.img;
    existing.description = nextSnapshot.description;
    existing.registeredItemUuid = nextSnapshot.registeredItemUuid;
    existing.originItemUuid = nextSnapshot.originItemUuid;
    existing.aliasItemUuids = nextFallbacks;
    // Indexed fields rewritten in place (issue 1076).
    advanceDefinitionRevision(system.components); // ratchet-exempt(world-scope): writer

    return settle({ item: existing, action: 'updated', sourceFallbacks });
  }

  // No match: create a new component. A `_normalizeSystem` bypass site (issue 1359): same basis,
  // same helper, `Set|null`; see `_scopeBasis`.
  const { essenceIds: validEssenceIds } = io.scopeBasis(system);
  const item = io.normalizeComponent(
    { ...nextSnapshot, ...adoptedIdentity(io, system, registrations, nextSnapshot) },
    { validEssenceIds, ...io.salvageNormalizationContext(system) }
  );

  io.assertUniqueComponentSources(system, item);
  system.components.push(item); // ratchet-exempt(world-scope): writer
  advanceDefinitionRevision(system.components); // ratchet-exempt(world-scope): writer
  const addedRoleKey = io.componentRoleFlagKey(system.id);
  if (addedRoleKey) await io.stampSourceIdentity(source, addedRoleKey, item.id);
  return settle({ item, action: 'added', sourceFallbacks: nextSnapshot.sourceFallbacks });
}

/** Bulk-import every Item document of a compendium pack through `addItemFromUuid`, with one
 * `craftingSystems` write and then one flush of the run's world registrations.
 * @returns {Promise<{added: number, updated: number, skipped: number, total: number,
 *   sourceFallbacks: Array<{itemName: string, brokenUuid: string, fallbackUuid: string}>}>} */
export async function addItemsFromPack(io, systemId, packId) {
  io.assertGM('bulk import from compendium');
  const system = io.getSystem(systemId);
  if (!system) throw new Error(`Crafting system not found: ${systemId}`);

  const pack = globalThis.game?.packs?.get(packId);
  if (!pack) throw new Error(`Compendium pack not found: ${packId}`);

  const documents = await pack.getDocuments();
  const items = documents.filter((d) => d.documentName === 'Item');

  // No `_primeEnricherCache` here (issue 800): `getDocuments()` already cached this pack, and
  // intra-pack references are the common case, so per-item priming mostly hits the cache.
  const counts = { added: 0, updated: 0, skipped: 0 };
  const sourceFallbacks = [];
  // Items mutate memory only (`persist: false`) and one `save()` below flushes the batch (issue
  // 1086); `dirty` keeps an all-skipped re-drop from writing.
  let dirty = false;
  const registrations = [];
  let flushed;
  try {
    for (const item of items) {
      const uuid = item.uuid || `Compendium.${packId}.${item.id}`;
      const result = await io.addItemFromUuid(systemId, uuid, { persist: false, registrations });
      if (result.action === 'added' || result.action === 'updated') {
        counts[result.action] += 1;
        dirty = true;
      } else counts.skipped += 1;
      if (Array.isArray(result.sourceFallbacks)) sourceFallbacks.push(...result.sourceFallbacks);
    }
  } finally {
    // In `finally`, so items imported before a throw still persist; named, because every item
    // went into this one system (issue 1078).
    if (dirty) await io.saveSystems({ put: system, domains: COMPONENT_FACTS });
    // After the save and never gated on `dirty`: a rejected save has thrown past this line, and
    // an all-skipped run may still register a component that has no World Component.
    flushed = await io.flushWorldComponentRegistrations(registrations);
  }

  return withRegistrationError({ ...counts, total: items.length, sourceFallbacks }, flushed);
}

/** Replace a component's source Item link and return fallback metadata when the dropped Item's
 * recorded canonical source is broken.
 * @returns {Promise<{item: object,
 *   sourceFallbacks: Array<{itemName: string, brokenUuid: string, fallbackUuid: string}>}>} */
export async function replaceItemSource(io, systemId, itemId, itemUuid) {
  io.assertGM('replace component source');
  const system = io.getSystem(systemId);
  if (!system) throw new Error(`Crafting system not found: ${systemId}`);
  const idx = system.components.findIndex((i) => i.id === itemId); // ratchet-exempt(world-scope): writer
  if (idx === -1) throw new Error(`Component not found: ${itemId}`);

  const source = await resolveItemSource(
    itemUuid,
    (documentName) => `Cannot use non-Item document (${documentName}) as a component source`
  );

  const existing = system.components[idx]; // ratchet-exempt(world-scope): writer
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

  system.components[idx] = updatedItem; // ratchet-exempt(world-scope): writer
  advanceDefinitionRevision(system.components); // ratchet-exempt(world-scope): writer
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

  // The edited Item's own uuid only: its compendium and duplicate sources name sibling Items,
  // whose components must not receive this edit (issue 2217).
  const ownUuids = getOwnSourceUuids(item?.uuid, item);
  if (ownUuids.length === 0) return { updated: 0 };

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
    const components = Array.isArray(system.components) ? system.components : []; // ratchet-exempt(world-scope): writer
    for (const component of components) {
      if (getItemMatchUuids(component).every((ref) => !ownUuids.includes(ref))) continue;

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
