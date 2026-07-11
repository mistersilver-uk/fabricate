/**
 * Orchestrates importing crafting systems and recipes from pack JSON data.
 * Handles UUID remapping with deterministic precedence and fallback item ID management.
 */
import { validateGatheringDropReferences } from './GatheringDropReferenceValidator.js';
import { resolveImportReferences, REFERENCE_KINDS } from './importReferenceResolver.js';

/** World-setting key for the per-system gathering config (mirrors SETTING_KEYS.GATHERING_CONFIG). */
const GATHERING_CONFIG_KEY = 'gatheringConfig';

/**
 * Default external-reference resolver. Wraps the async `fromUuid` (NOT
 * `fromUuidSync`, which only reliably resolves cached world docs). Returns
 * `{ uuid }` when the document exists, else `null` (absent). Throws on a
 * malformed UUID, so the caller wraps in try/catch → treated as absent.
 */
async function defaultResolveExternalUuid(uuid) {
  if (!uuid) return null;
  const doc = await fromUuid(uuid);
  return doc ? { uuid: doc.uuid ?? uuid } : null;
}

export class CompendiumImporter {
  /**
   * @param {object} craftingSystemManager
   * @param {object} recipeManager
   * @param {object} [seams]
   * @param {object} [seams.environmentStore] - GatheringEnvironmentStore seam (list/save)
   * @param {(key: string) => *} [seams.getSetting] - World-setting reader (gatheringConfig)
   * @param {(key: string, value: *) => Promise<*>} [seams.setSetting] - World-setting writer
   * @param {() => boolean} [seams.isGM] - GM predicate (F3 fail-fast gate)
   * @param {(uuid: string) => Promise<null | { uuid: string }>} [seams.resolveExternalUuid]
   */
  constructor(craftingSystemManager, recipeManager, seams = {}) {
    this._craftingSystemManager = craftingSystemManager;
    this._recipeManager = recipeManager;
    this._environmentStore = seams.environmentStore ?? null;
    this._getSetting = seams.getSetting ?? null;
    this._setSetting = seams.setSetting ?? null;
    // Enforce the GM gate whenever a Foundry `game.user` is present; pure tests
    // that never install `game.user` are allowed through.
    this._isGM =
      seams.isGM ??
      (() => {
        const g = globalThis.game;
        return g?.user ? g.user.isGM === true : true;
      });
    this._resolveExternalUuid = seams.resolveExternalUuid ?? defaultResolveExternalUuid;
  }

  /**
   * Import a crafting system and recipes from pack JSON data.
   *
   * @param {object} packData - Pack JSON (must have a `system` field; `recipes` is optional)
   * @param {object} [options]
   * @param {boolean} [options.overwriteExisting=false] - Overwrite system/recipes if they exist
   * @param {boolean} [options.retainFallbackIds=true] - Keep existing aliasItemUuids on re-import
   * @param {object} [options.additionalFallbackIds={}] - Map of componentId -> string[] extra fallbacks
   * @param {string[]} [options.targetPackIds=[]] - Limit source+name search to specific pack IDs
   * @returns {Promise<object>} Structured import summary
   */
  async importFromPackData(packData, options = {}) {
    if (!packData || typeof packData !== 'object' || !packData.system) {
      throw new Error('Invalid pack data: missing required "system" field');
    }

    // F3 — GM gate first: fail fast before ANY world-scope write. A non-GM
    // `game.settings.set` on world scope is server-rejected in V13, which would
    // leave a partial system + rejected writes if not gated here.
    if (!this._isGM()) {
      throw new Error('Only a GM can import a crafting system (world-scope write).');
    }

    const {
      overwriteExisting = false,
      retainFallbackIds = true,
      additionalFallbackIds = {},
      targetPackIds = [],
    } = options;

    const systemData = packData.system;
    const recipesData = Array.isArray(packData.recipes) ? packData.recipes : [];

    const summary = {
      system: { id: null, name: systemData.name || '', created: false, skipped: false },
      components: { total: 0, remapped: [], retained: [], unresolved: [] },
      recipes: { total: recipesData.length, imported: 0, skipped: 0, errors: [] },
      collisions: [],
      // Structured cross-reference report surfaced to the GM (source items,
      // scenes, scene-regions, macros, drop-row items, broken internal links).
      unresolvedReferences: [],
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
        resolution: 'skipped',
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
        resolution: 'overwritten',
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
        craftingSystemId:
          recipeData.craftingSystemId === '__SYSTEM_ID__'
            ? system.id
            : recipeData.craftingSystemId || system.id,
      };

      const existing = this._recipeManager.getRecipe(resolved.id);
      if (existing && !overwriteExisting) {
        summary.recipes.skipped++;
        summary.collisions.push({
          type: 'recipe',
          id: resolved.id,
          name: resolved.name || resolved.id,
          resolution: 'skipped',
        });
        continue;
      }

      try {
        if (existing && overwriteExisting) {
          await this._recipeManager.updateRecipe(resolved.id, resolved, {
            notify: false,
            emitChange: false,
          });
          summary.collisions.push({
            type: 'recipe',
            id: resolved.id,
            name: resolved.name || resolved.id,
            resolution: 'overwritten',
          });
        } else {
          await this._recipeManager.createRecipe(resolved, { notify: false, emitChange: false });
        }
        summary.recipes.imported++;
      } catch (error) {
        summary.recipes.errors.push({
          recipeId: resolved.id,
          recipeName: resolved.name || resolved.id,
          error: error.message || String(error),
        });
      }
    }

    this._recipeManager.notifyRecipesChanged?.({
      action: 'importFromPack',
      imported: summary.recipes.imported,
      skipped: summary.recipes.skipped,
      errors: summary.recipes.errors.length,
      systemId: system.id,
    });

    // --- Phase 5: Gathering authoring (environments + config) ---
    await this._importGatheringAuthoring(packData, system, recipesData, summary);

    // Fold the component source-item resolution into the unified reference report.
    this._foldComponentReferences(summary);

    return summary;
  }

  /**
   * Import the gathering-authoring bundle for the (possibly freshly-created)
   * system: rebind container ids, resolve/report references, persist environments
   * via replace-by-system-id (F1), and merge the gatheringConfig slice.
   * @private
   */
  async _importGatheringAuthoring(packData, system, recipesData, summary) {
    const environments = Array.isArray(packData.gatheringEnvironments)
      ? structuredClone(packData.gatheringEnvironments)
      : [];
    const gatheringConfig =
      packData.gatheringConfig && typeof packData.gatheringConfig === 'object'
        ? structuredClone(packData.gatheringConfig)
        : null;

    // F2 — copy-mode container rebind BEFORE persistence: point every
    // environment at the (possibly newly generated) system id and rekey the
    // config slice under it. Task/event/modifier ids are preserved (D3).
    for (const env of environments) {
      if (env && typeof env === 'object') env.craftingSystemId = system.id;
    }

    // Resolve + classify references (external existence + broken-internal), then
    // report them. Realm scene refs live on the already-created system; the
    // default resolver never rewrites external UUIDs, so they are reported only.
    const { resolved, unresolvedReferences } = await resolveImportReferences(
      { system, recipes: recipesData, gatheringEnvironments: environments, gatheringConfig },
      { resolveUuid: this._resolveExternalUuid }
    );
    summary.unresolvedReferences.push(...unresolvedReferences);

    const resolvedEnvironments = Array.isArray(resolved.gatheringEnvironments)
      ? resolved.gatheringEnvironments
      : [];
    const resolvedConfig = resolved.gatheringConfig;

    await this._persistEnvironments(system.id, resolvedEnvironments);
    await this._persistGatheringConfig(system.id, resolvedConfig);
  }

  /**
   * F1 — replace-by-system-id persistence. Read the ENTIRE global environment
   * array, remove the target system's existing environments (delete-then-add so
   * an overwrite re-import never accumulates stale records), splice in the
   * imported set, and write the merged whole — so other systems' environments
   * are never clobbered.
   * @private
   */
  async _persistEnvironments(systemId, importedEnvironments) {
    const store = this._environmentStore;
    if (!store || typeof store.save !== 'function') return;

    const all =
      typeof store.list === 'function'
        ? store.list()
        : typeof store.load === 'function'
          ? store.load()
          : [];
    const others = (Array.isArray(all) ? all : []).filter(
      (env) => env?.craftingSystemId !== systemId
    );

    // Nothing to do when there are neither imported nor pre-existing records for
    // this system (avoids a redundant global write).
    if (importedEnvironments.length === 0 && others.length === (all?.length ?? 0)) {
      return;
    }

    await store.save([...others, ...importedEnvironments]);
  }

  /**
   * Merge the exported `{ system: <slice>, shared: <vocab+conditions> }` config
   * into the global gatheringConfig setting under the (possibly rebased) system
   * id, without clobbering other systems or the world's current-condition state.
   * @private
   */
  async _persistGatheringConfig(systemId, config) {
    if (!this._getSetting || !this._setSetting || !config || typeof config !== 'object') return;

    const slice = config.system && typeof config.system === 'object' ? config.system : {};
    const shared = config.shared && typeof config.shared === 'object' ? config.shared : {};

    const global = this._getSetting(GATHERING_CONFIG_KEY) || {};
    const next = {
      ...global,
      // replace-by-system-id
      systems: { ...global.systems, [systemId]: slice },
      // Seed missing shared vocabularies without overwriting existing ones.
      vocabularies: { ...shared.vocabularies, ...global.vocabularies },
      // Preserve the world's current-condition state; only seed when absent.
      conditions: global.conditions || shared.conditions || {},
    };

    await this._setSetting(GATHERING_CONFIG_KEY, next);
  }

  /**
   * Map the component source-item resolution (remapped/retained/unresolved) into
   * the unified `unresolvedReferences[]` collection so the report surfaces source
   * items alongside every other reference kind.
   * @private
   */
  _foldComponentReferences(summary) {
    const refs = summary.unresolvedReferences;
    for (const entry of summary.components.remapped) {
      refs.push({
        kind: REFERENCE_KINDS.SOURCE_ITEM,
        ownerType: 'component',
        ownerId: entry.componentId,
        ownerName: entry.componentName,
        referenceValue: entry.oldUuid,
        disposition: entry.method === 'exact' ? 'retained' : 'remapped',
      });
    }
    for (const entry of summary.components.unresolved) {
      refs.push({
        kind: REFERENCE_KINDS.SOURCE_ITEM,
        ownerType: 'component',
        ownerId: entry.componentId,
        ownerName: entry.componentName,
        referenceValue: entry.originItemUuid,
        disposition: 'reported',
      });
    }
  }

  async _validateGatheringConfig(systemInput) {
    const gatheringConfig = systemInput?.gatheringConfig;
    if (!gatheringConfig || typeof gatheringConfig !== 'object') return;
    const systems =
      gatheringConfig.systems && typeof gatheringConfig.systems === 'object'
        ? gatheringConfig.systems
        : {};
    const errors = [];
    for (const [systemId, systemConfig] of Object.entries(systems)) {
      if (!Array.isArray(systemConfig?.tasks)) continue;
      const validationErrors = await validateGatheringDropReferences({
        tasks: systemConfig.tasks,
        system: { components: systemInput.components || [] },
        systemId,
      });
      errors.push(...validationErrors);
    }
    if (errors.length > 0) {
      throw new Error(`Invalid gatheringConfig: ${errors.join('; ')}`);
    }
  }

  /**
   * Remap component originItemUuids using deterministic precedence:
   *   1. Exact UUID match (fromUuid succeeds) — retain as-is
   *   2. Source+name match in world packs — remap, old UUID added to aliasItemUuids
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
      const { id: compId, name: compName, originItemUuid } = component;

      // Collect fallback IDs: existing retained IDs + explicit additions + pack-provided fallbacks
      const mergedFallbacks = [];

      if (retainFallbackIds) {
        const existing = existingComponentsById.get(compId);
        if (existing && Array.isArray(existing.aliasItemUuids)) {
          mergedFallbacks.push(...existing.aliasItemUuids);
        }
      }

      // Pack-provided fallbacks
      if (Array.isArray(component.aliasItemUuids)) {
        for (const fid of component.aliasItemUuids) {
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

      if (!originItemUuid) {
        remapped.push({ ...component, aliasItemUuids: mergedFallbacks });
        continue;
      }

      // Check exact UUID match
      const exactDoc = await this._resolveUuidDocument(originItemUuid);
      if (exactDoc) {
        summary.components.remapped.push({
          componentId: compId,
          componentName: compName,
          oldUuid: originItemUuid,
          newUuid: originItemUuid,
          method: 'exact',
        });
        remapped.push(
          this._withResolvedSourceMetadata(
            { ...component, aliasItemUuids: mergedFallbacks },
            exactDoc
          )
        );
        continue;
      }

      // Source+name match
      const foundUuid = await this._findBySourceAndName(originItemUuid, compName, targetPackIds);
      if (foundUuid) {
        // Old UUID becomes a fallback
        if (!mergedFallbacks.includes(originItemUuid)) {
          mergedFallbacks.push(originItemUuid);
        }
        summary.components.remapped.push({
          componentId: compId,
          componentName: compName,
          oldUuid: originItemUuid,
          newUuid: foundUuid,
          method: 'sourceName',
        });
        const foundDoc = await this._resolveUuidDocument(foundUuid);
        remapped.push(
          this._withResolvedSourceMetadata(
            {
              ...component,
              originItemUuid: foundUuid,
              registeredItemUuid: foundUuid,
              aliasItemUuids: mergedFallbacks,
            },
            foundDoc
          )
        );
        continue;
      }

      // Unresolved
      summary.components.unresolved.push({
        componentId: compId,
        componentName: compName,
        originItemUuid,
      });

      if (mergedFallbacks.length > 0) {
        summary.components.retained.push({
          componentId: compId,
          componentName: compName,
          fallbackIds: [...mergedFallbacks],
        });
      }

      remapped.push({ ...component, aliasItemUuids: mergedFallbacks });
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

    const storedDescription =
      typeof component.description === 'string' ? component.description.trim() : '';
    if (!storedDescription) {
      const extract = this._craftingSystemManager?._extractSourceDescription;
      const description =
        typeof extract === 'function' ? extract.call(this._craftingSystemManager, sourceDoc) : '';
      if (description) enriched.description = description;
    }

    return enriched;
  }

  /**
   * Search world compendium packs for an item whose source UUID matches and whose
   * name matches the component name. Returns the target compendium UUID, or null.
   *
   * @param {string} registeredItemUuid - The source UUID from the pack data
   * @param {string} name - Component name (case-insensitive match)
   * @param {string[]} targetPackIds - Optional filter to specific pack IDs
   * @returns {Promise<string|null>}
   * @private
   */
  async _findBySourceAndName(registeredItemUuid, name, targetPackIds) {
    if (!registeredItemUuid || !name) return null;
    const nameLower = name.trim().toLowerCase();

    const packs = game.packs ? [...game.packs] : [];
    const filteredPacks = packs.filter((p) => {
      if (p.documentName !== 'Item') return false;
      if (targetPackIds.length > 0 && !targetPackIds.includes(p.collection)) return false;
      return true;
    });

    for (const pack of filteredPacks) {
      let index;
      try {
        index = await pack.getIndex({
          fields: ['name', '_stats.compendiumSource', 'flags.core.sourceId'],
        });
      } catch {
        continue;
      }

      for (const entry of index) {
        const entryName = (entry.name || '').trim().toLowerCase();
        if (entryName !== nameLower) continue;

        const entrySource = entry._stats?.compendiumSource || entry.flags?.core?.sourceId || null;
        if (entrySource === registeredItemUuid) {
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
      const byId = systems.find((s) => s.id === systemData.id);
      if (byId) return byId;
    }

    if (systemData.name) {
      const nameLower = systemData.name.trim().toLowerCase();
      const byName = systems.find((s) => (s.name || '').trim().toLowerCase() === nameLower);
      if (byName) return byName;
    }

    return null;
  }
}
