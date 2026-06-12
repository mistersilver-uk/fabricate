/**
 * Orchestrates importing crafting systems and recipes from pack JSON data.
 * Handles UUID remapping with deterministic precedence and fallback item ID management.
 */
import { validateGatheringDropReferences } from './GatheringDropReferenceValidator.js';

export class CompendiumImporter {
  /**
   * @param {object} craftingSystemManager
   * @param {object} recipeManager
   */
  constructor(craftingSystemManager, recipeManager) {
    this._craftingSystemManager = craftingSystemManager;
    this._recipeManager = recipeManager;
  }

  /**
   * Import a crafting system and recipes from pack JSON data.
   *
   * @param {object} packData - Pack JSON (must have a `system` field; `recipes` is optional)
   * @param {object} [options]
   * @param {boolean} [options.overwriteExisting=false] - Overwrite system/recipes if they exist
   * @param {boolean} [options.retainFallbackIds=true] - Keep existing fallbackItemIds on re-import
   * @param {object} [options.additionalFallbackIds={}] - Map of componentId -> string[] extra fallbacks
   * @param {string[]} [options.targetPackIds=[]] - Limit source+name search to specific pack IDs
   * @returns {Promise<object>} Structured import summary
   */
  async importFromPackData(packData, options = {}) {
    if (!packData || typeof packData !== 'object' || !packData.system) {
      throw new Error('Invalid pack data: missing required "system" field');
    }

    const {
      overwriteExisting = false,
      retainFallbackIds = true,
      additionalFallbackIds = {},
      targetPackIds = []
    } = options;

    const systemData = packData.system;
    const recipesData = Array.isArray(packData.recipes) ? packData.recipes : [];

    const summary = {
      system: { id: null, name: systemData.name || '', created: false, skipped: false },
      components: { total: 0, remapped: [], retained: [], unresolved: [] },
      recipes: { total: recipesData.length, imported: 0, skipped: 0, errors: [] },
      collisions: []
    };

    // --- Phase 1: Resolve existing system ---
    const existingSystem = this._findExistingSystem(systemData);

    if (existingSystem && !overwriteExisting) {
      summary.system.id = existingSystem.id;
      summary.system.name = existingSystem.name;
      summary.system.skipped = true;
      summary.collisions.push({
        type: 'system',
        id: existingSystem.id,
        name: existingSystem.name,
        resolution: 'skipped'
      });
      return summary;
    }

    // --- Phase 2: Remap component UUIDs ---
    const components = Array.isArray(systemData.components) ? systemData.components : [];
    summary.components.total = components.length;

    const remappedComponents = await this._remapComponentUuids(
      components,
      existingSystem,
      retainFallbackIds,
      additionalFallbackIds,
      targetPackIds,
      summary
    );

    // --- Phase 3: Create or overwrite system ---
    const systemInput = { ...systemData, components: remappedComponents };
    await this._validateGatheringConfig(systemInput);

    let system;
    if (existingSystem && overwriteExisting) {
      system = await this._craftingSystemManager.updateSystem(existingSystem.id, systemInput);
      summary.system.id = system.id;
      summary.system.name = system.name;
      summary.collisions.push({
        type: 'system',
        id: system.id,
        name: system.name,
        resolution: 'overwritten'
      });
    } else {
      // Force the pack's system ID if provided so cross-references remain stable
      system = await this._craftingSystemManager.createSystem(systemInput);
      summary.system.id = system.id;
      summary.system.name = system.name;
      summary.system.created = true;
    }

    // --- Phase 4: Import recipes ---
    for (const recipeData of recipesData) {
      const resolved = {
        ...recipeData,
        craftingSystemId: recipeData.craftingSystemId === '__SYSTEM_ID__'
          ? system.id
          : (recipeData.craftingSystemId || system.id)
      };

      const existing = this._recipeManager.getRecipe(resolved.id);
      if (existing && !overwriteExisting) {
        summary.recipes.skipped++;
        summary.collisions.push({
          type: 'recipe',
          id: resolved.id,
          name: resolved.name || resolved.id,
          resolution: 'skipped'
        });
        continue;
      }

      try {
        if (existing && overwriteExisting) {
          await this._recipeManager.updateRecipe(resolved.id, resolved, { notify: false, emitChange: false });
          summary.collisions.push({
            type: 'recipe',
            id: resolved.id,
            name: resolved.name || resolved.id,
            resolution: 'overwritten'
          });
        } else {
          await this._recipeManager.createRecipe(resolved, { notify: false, emitChange: false });
        }
        summary.recipes.imported++;
      } catch (err) {
        summary.recipes.errors.push({
          recipeId: resolved.id,
          recipeName: resolved.name || resolved.id,
          error: err.message || String(err)
        });
      }
    }

    this._recipeManager.notifyRecipesChanged?.({
      action: 'importFromPack',
      imported: summary.recipes.imported,
      skipped: summary.recipes.skipped,
      errors: summary.recipes.errors.length,
      systemId: system.id
    });

    return summary;
  }

  async _validateGatheringConfig(systemInput) {
    const gatheringConfig = systemInput?.gatheringConfig;
    if (!gatheringConfig || typeof gatheringConfig !== 'object') return;
    const systems = gatheringConfig.systems && typeof gatheringConfig.systems === 'object'
      ? gatheringConfig.systems
      : {};
    const errors = [];
    for (const [systemId, systemConfig] of Object.entries(systems)) {
      if (!Array.isArray(systemConfig?.tasks)) continue;
      const validationErrors = await validateGatheringDropReferences({
        tasks: systemConfig.tasks,
        system: { components: systemInput.components || [] },
        systemId
      });
      errors.push(...validationErrors);
    }
    if (errors.length > 0) {
      throw new Error(`Invalid gatheringConfig: ${errors.join('; ')}`);
    }
  }

  /**
   * Remap component sourceItemUuids using deterministic precedence:
   *   1. Exact UUID match (fromUuid succeeds) — retain as-is
   *   2. Source+name match in world packs — remap, old UUID added to fallbacks
   *   3. Unresolved — keep as-is, mark in summary
   *
   * @private
   */
  async _remapComponentUuids(
    components,
    existingSystem,
    retainFallbackIds,
    additionalFallbackIds,
    targetPackIds,
    summary
  ) {
    const existingComponentsById = new Map();
    if (existingSystem) {
      const items = existingSystem.items || existingSystem.components || [];
      for (const item of items) {
        existingComponentsById.set(item.id, item);
      }
    }

    const remapped = [];
    for (const component of components) {
      const { id: compId, name: compName, sourceItemUuid } = component;

      // Collect fallback IDs: existing retained IDs + explicit additions + pack-provided fallbacks
      let mergedFallbacks = [];

      if (retainFallbackIds) {
        const existing = existingComponentsById.get(compId);
        if (existing && Array.isArray(existing.fallbackItemIds)) {
          mergedFallbacks.push(...existing.fallbackItemIds);
        }
      }

      // Pack-provided fallbacks
      if (Array.isArray(component.fallbackItemIds)) {
        for (const fid of component.fallbackItemIds) {
          if (!mergedFallbacks.includes(fid)) mergedFallbacks.push(fid);
        }
      }

      // Explicit additions from options
      const additionalForComp = additionalFallbackIds[compId];
      if (Array.isArray(additionalForComp)) {
        for (const fid of additionalForComp) {
          if (!mergedFallbacks.includes(fid)) mergedFallbacks.push(fid);
        }
      }

      if (!sourceItemUuid) {
        remapped.push({ ...component, fallbackItemIds: mergedFallbacks });
        continue;
      }

      // Check exact UUID match
      const exactDoc = await this._resolveUuidDocument(sourceItemUuid);
      if (exactDoc) {
        summary.components.remapped.push({
          componentId: compId,
          componentName: compName,
          oldUuid: sourceItemUuid,
          newUuid: sourceItemUuid,
          method: 'exact'
        });
        remapped.push(this._withResolvedSourceMetadata(
          { ...component, fallbackItemIds: mergedFallbacks },
          exactDoc
        ));
        continue;
      }

      // Source+name match
      const foundUuid = await this._findBySourceAndName(sourceItemUuid, compName, targetPackIds);
      if (foundUuid) {
        // Old UUID becomes a fallback
        if (!mergedFallbacks.includes(sourceItemUuid)) {
          mergedFallbacks.push(sourceItemUuid);
        }
        summary.components.remapped.push({
          componentId: compId,
          componentName: compName,
          oldUuid: sourceItemUuid,
          newUuid: foundUuid,
          method: 'sourceName'
        });
        const foundDoc = await this._resolveUuidDocument(foundUuid);
        remapped.push(this._withResolvedSourceMetadata(
          { ...component, sourceItemUuid: foundUuid, sourceUuid: foundUuid, fallbackItemIds: mergedFallbacks },
          foundDoc
        ));
        continue;
      }

      // Unresolved
      summary.components.unresolved.push({
        componentId: compId,
        componentName: compName,
        sourceItemUuid
      });

      if (mergedFallbacks.length > 0) {
        summary.components.retained.push({
          componentId: compId,
          componentName: compName,
          fallbackIds: [...mergedFallbacks]
        });
      }

      remapped.push({ ...component, fallbackItemIds: mergedFallbacks });
    }

    return remapped;
  }

  /**
   * Resolve a UUID via fromUuid. Returns the document, or null if it is
   * missing or unresolvable.
   * @private
   */
  async _resolveUuidDocument(uuid) {
    if (!uuid) return null;
    try {
      return (await fromUuid(uuid)) ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Bring a resolved pack component to parity with the interactive drop path
   * (CraftingSystemManager.addItemFromUuid), which snapshots a live Item's
   * img/description onto the component it creates. Pre-built premium systems
   * leave these off components backed by a foreign pack (e.g. the dnd5e SRD)
   * because that pack isn't available to the build, so the live item at import
   * time is the only icon/description source. Without this, such components
   * fall back to icons/svg/item-bag.svg and show no description in the manager.
   *
   * Only fills what the pack JSON omitted, so baked in-module art/copy (set by
   * the premium build for contentRef components) is preserved.
   *
   * @private
   */
  _withResolvedSourceMetadata(component, sourceDoc) {
    if (!sourceDoc) return component;
    const enriched = { ...component };

    const storedImg = typeof component.img === 'string' ? component.img.trim() : '';
    if ((!storedImg || storedImg === 'icons/svg/item-bag.svg') && sourceDoc.img) {
      enriched.img = sourceDoc.img;
    }

    const storedDescription = typeof component.description === 'string' ? component.description.trim() : '';
    if (!storedDescription) {
      const extract = this._craftingSystemManager?._extractSourceDescription;
      const description = typeof extract === 'function'
        ? extract.call(this._craftingSystemManager, sourceDoc)
        : '';
      if (description) enriched.description = description;
    }

    return enriched;
  }

  /**
   * Search world compendium packs for an item whose source UUID matches and whose
   * name matches the component name. Returns the target compendium UUID, or null.
   *
   * @param {string} sourceUuid - The source UUID from the pack data
   * @param {string} name - Component name (case-insensitive match)
   * @param {string[]} targetPackIds - Optional filter to specific pack IDs
   * @returns {Promise<string|null>}
   * @private
   */
  async _findBySourceAndName(sourceUuid, name, targetPackIds) {
    if (!sourceUuid || !name) return null;
    const nameLower = name.trim().toLowerCase();

    const packs = game.packs ? Array.from(game.packs) : [];
    const filteredPacks = packs.filter(p => {
      if (p.documentName !== 'Item') return false;
      if (targetPackIds.length > 0 && !targetPackIds.includes(p.collection)) return false;
      return true;
    });

    for (const pack of filteredPacks) {
      let index;
      try {
        index = await pack.getIndex({ fields: ['name', '_stats.compendiumSource', 'flags.core.sourceId'] });
      } catch {
        continue;
      }

      for (const entry of index) {
        const entryName = (entry.name || '').trim().toLowerCase();
        if (entryName !== nameLower) continue;

        const entrySource = entry._stats?.compendiumSource || entry.flags?.core?.sourceId || null;
        if (entrySource === sourceUuid) {
          return `Compendium.${pack.collection}.${entry._id}`;
        }
      }
    }

    return null;
  }

  /**
   * Find an existing crafting system by ID then by name.
   * @private
   */
  _findExistingSystem(systemData) {
    const systems = this._craftingSystemManager.getSystems();

    if (systemData.id) {
      const byId = systems.find(s => s.id === systemData.id);
      if (byId) return byId;
    }

    if (systemData.name) {
      const nameLower = systemData.name.trim().toLowerCase();
      const byName = systems.find(s => (s.name || '').trim().toLowerCase() === nameLower);
      if (byName) return byName;
    }

    return null;
  }
}
