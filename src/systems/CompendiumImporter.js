/**
 * Imports a crafting system and its recipes from pack JSON, remapping component source UUIDs by
 * deterministic precedence and merging the world slices (`openspec/specs/import-export/spec.md`).
 */
import { normalizeWorldCurrencyConfig } from './currencyProfile.js';
import { validateGatheringDropReferences } from './GatheringDropReferenceValidator.js';
import { normalizeTravelConfig } from './gatheringRealms.js';
import {
  resolveImportReferences,
  REFERENCE_KINDS,
  WORLD_SCOPE_ENTITY_TYPES,
  WORLD_SCOPE_SLICE_KEYS,
} from './importReferenceResolver.js';
import { membershipKey } from './scopedDefinitions.js';
import {
  membershipKeySet,
  mergedEntityIds,
  mergedMembershipUnion,
  recheckWorldDefault,
  sliceRecords,
} from './worldScopeImportMerge.js';

/** World-setting key for the per-system gathering config (mirrors SETTING_KEYS.GATHERING_CONFIG). */
const GATHERING_CONFIG_KEY = 'gatheringConfig';

/** World-setting key for the currency config (mirrors SETTING_KEYS.CURRENCY_CONFIG). */
const CURRENCY_CONFIG_KEY = 'currencyConfig';

/** World-setting key for the travel config (mirrors SETTING_KEYS.TRAVEL_CONFIG). */
const TRAVEL_CONFIG_KEY = 'travelConfig';
const CHARACTER_LIBRARIES_KEY = 'characterLibraries';

/** The report owner type each world-scope entity type reuses. */
const SCOPE_OWNER_TYPES = Object.freeze({
  components: 'component',
  essences: 'essence',
  tools: 'tool',
});

/** How often (in recipes processed) Phase 4 emits an interim progress tick. */
const RECIPE_PROGRESS_INTERVAL = 10;

/** Cached for a pack whose `getIndex` rejected, skipping it once per run, not per component. */
const PACK_LOOKUP_SKIP = Symbol('pack-lookup-skip');

/** The records of a payload-supplied report array, or none. */
function arrayOfRecords(value) {
  return Array.isArray(value) ? value.filter((entry) => entry && typeof entry === 'object') : [];
}

/** Clamp a progress fraction into the Foundry-required `[0, 1]` range. */
function clampProgressFraction(pct) {
  const value = Number(pct);
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/**
 * The default progress reporter: one lazily opened `ui.notifications.info(msg, { progress: true,
 * console: false })` toast, advanced through its handle (the API and its guards are in
 * `.agents/docs/foundry-and-architecture.md`). A missing or stub handle, and an `update` on a
 * toast not yet rendered, degrade to a no-op. Callers must finish at `pct: 1`, where the toast
 * self-dismisses; the idempotent `dismiss()` removes a toast an abnormal exit left open, through
 * `handle.remove()`, and stands down once `pct: 1` was reached.
 */
export function createDefaultProgressReporter() {
  let handle = null;
  let started = false;
  let completed = false;

  function reportProgress({ pct, message } = {}) {
    const notifications = globalThis.ui?.notifications;
    if (!notifications || typeof notifications.info !== 'function') return;

    const fraction = clampProgressFraction(pct);
    if (!started) {
      started = true;
      try {
        handle = notifications.info(message ?? '', { progress: true, console: false });
      } catch {
        handle = null;
      }
    }

    // `clampProgressFraction` returns a literal `1` at the cap, so reaching it marks completion.
    if (fraction === 1) completed = true;

    if (!handle || typeof handle.update !== 'function') return;
    try {
      handle.update({ pct: fraction, message });
    } catch {
      // Not yet rendered (queued behind the visible-toast cap): degrade to a no-op tick.
    }
  }

  reportProgress.dismiss = function dismiss() {
    // `completed` latches before the removal, so a repeat call or a removal throw cannot re-enter.
    if (!started || completed) return;
    completed = true;
    if (!handle || typeof handle.remove !== 'function') return;
    try {
      handle.remove();
    } catch {
      // Teardown on an unrendered toast can throw: degrade to a no-op.
    }
  };

  return reportProgress;
}

/**
 * The default external-reference resolver: async `fromUuid` (`fromUuidSync` reliably resolves only
 * cached world documents), answering `{ uuid }` or `null`; a malformed UUID throws for the caller.
 */
async function defaultResolveExternalUuid(uuid) {
  if (!uuid) return null;
  const doc = await fromUuid(uuid);
  return doc ? { uuid: doc.uuid ?? uuid } : null;
}

/**
 * Rename a component's pre-`1.16.0` source-reference fields to their current names
 * (`import-export/spec.md` § Reference handling), returning a copy when anything moved. A
 * DELETE-AND-RENAME, never an additive spread, since a leftover `fallbackItemIds` beside
 * `aliasItemUuids` shadows it; a present new name wins. Components only: the same field names mean
 * unrelated things elsewhere.
 */
function upcastComponentSourceFields(component) {
  if (!component || typeof component !== 'object') return component;
  if (
    !('sourceUuid' in component) &&
    !('sourceItemUuid' in component) &&
    !('fallbackItemIds' in component)
  ) {
    return component;
  }

  const next = { ...component };
  if ('sourceUuid' in next) {
    if (!('registeredItemUuid' in next)) next.registeredItemUuid = next.sourceUuid;
    delete next.sourceUuid;
  }
  if ('sourceItemUuid' in next) {
    if (!('originItemUuid' in next)) next.originItemUuid = next.sourceItemUuid;
    delete next.sourceItemUuid;
  }
  if ('fallbackItemIds' in next) {
    if (!('aliasItemUuids' in next)) next.aliasItemUuids = next.fallbackItemIds;
    delete next.fallbackItemIds;
  }
  return next;
}

/**
 * A delegating view of one world-scope entity store, resolved on every call (issue 1364), because
 * the wiring site builds the seam before the field it reads may be assigned. It lives here since
 * the merge FAILS CLOSED: `isSeeded` is strictly `true` only when a real store says so, so an
 * unassigned field reads as an unmigrated world, the merge is skipped and `save` is unreachable.
 */
export function scopeStoreDelegate(resolve) {
  return {
    isSeeded: (subKey) => resolve()?.isSeeded?.(subKey) === true,
    get: () => resolve()?.get?.() ?? null,
    save: (value) => resolve()?.save?.(value),
  };
}

export class CompendiumImporter {
  /**
   * `reportProgress` defaults to a fresh `createDefaultProgressReporter` per run; the three
   * `*ScopeStore` seams are the world-scope entity stores (issue 1364), and `travelStore` is
   * preferred over the raw setting pair for the travel merge (issue 1858).
   */
  constructor(craftingSystemManager, recipeManager, seams = {}) {
    this._craftingSystemManager = craftingSystemManager;
    this._recipeManager = recipeManager;
    this._environmentStore = seams.environmentStore ?? null;
    this._travelStore = seams.travelStore ?? null;
    this._getSetting = seams.getSetting ?? null;
    this._setSetting = seams.setSetting ?? null;
    // The GM gate applies whenever a Foundry `game.user` is present; pure tests pass through.
    this._isGM =
      seams.isGM ??
      (() => {
        const g = globalThis.game;
        return g?.user ? g.user.isGM === true : true;
      });
    this._resolveExternalUuid = seams.resolveExternalUuid ?? defaultResolveExternalUuid;
    // The default reporter is stateful and this importer is a long-lived singleton, so the default
    // is built per RUN in `importFromPackData`, never here; an injected seam is reused as-is.
    this._reportProgress = seams.reportProgress ?? null;
    this._activeProgressReporter = null;
    // The three world-scope entity stores (issue 1364), injected exactly as `environmentStore` is.
    this._scopeStoreSeams = {
      components: seams.componentScopeStore ?? null,
      essences: seams.essenceScopeStore ?? null,
      tools: seams.toolScopeStore ?? null,
    };
  }

  /**
   * One world-scope entity store, or `null`: the injected seam alone, FAILING CLOSED, never a
   * synthesized store (whose first write would flip the world's Valid Id Basis to KNOWN) and never
   * a `game.fabricate` fallback, whose drift would make every import silently merge nothing. Both
   * production call sites inject the stores, pinned by a source contract.
   */
  _scopeStore(entityType) {
    return this._scopeStoreSeams[entityType] ?? null;
  }

  /**
   * Import a crafting system and its recipes from pack JSON, answering a structured summary.
   * `retainFallbackIds` keeps existing `aliasItemUuids`; `additionalFallbackIds` maps component
   * ids to extra ones; `targetPackIds` limits the source+name search. A phase failing after the
   * `pct: 0` emit dismisses the progress toast and re-throws the original error unchanged.
   */
  async importFromPackData(packData, options = {}) {
    if (!packData || typeof packData !== 'object' || !packData.system) {
      throw new Error('Invalid pack data: missing required "system" field');
    }

    // GM gate first, before ANY world-scope write: the server rejects a non-GM world-setting
    // write, which would leave a partial system.
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
      recipes: { total: recipesData.length, imported: 0, skipped: 0, pruned: 0, errors: [] },
      collisions: [],
      // Recipes of the target system absent from the payload, under overwrite: `pruned` when
      // provenance-matched, else `reported`.
      orphans: [],
      // The cross-reference report surfaced to the GM.
      unresolvedReferences: [],
    };

    // A fresh reporter per RUN, since the default carries per-toast state.
    this._activeProgressReporter = this._reportProgress ?? createDefaultProgressReporter();

    const systemLabel = summary.system.name || 'crafting system';
    this._emitProgress({ pct: 0, phase: 'start', message: `Importing ${systemLabel}…` });

    // Every exit after the `pct: 0` emit ends the toast: a throw dismisses THIS run's reporter and
    // re-throws the original error, so the UI still surfaces the real failure.
    try {
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
        this._emitProgress({
          pct: 1,
          phase: 'complete',
          message: `${existingSystem.name} already installed`,
        });
        return summary;
      }

      // --- Phase 2: Remap component UUIDs ---
      const components = Array.isArray(systemData.components) ? systemData.components : [];
      summary.components.total = components.length;

      this._emitProgress({
        pct: 0.05,
        phase: 'components',
        message: `Resolving ${components.length} component references…`,
      });

      const remappedComponents = await this._remapComponentUuids(
        components,
        existingSystem,
        retainFallbackIds,
        additionalFallbackIds,
        targetPackIds,
        summary
      );

      // --- Phase 3: Create or overwrite system ---
      this._emitProgress({ pct: 0.2, phase: 'system', message: `Saving ${systemLabel}…` });
      const systemInput = { ...systemData, components: remappedComponents };
      await this._validateGatheringConfig(systemInput);

      // ORDER IS LOAD-BEARING (issue 1308): the character libraries merge BEFORE the system is
      // created or updated, since `_normalizeSystem` derives its Valid Id Basis from them and would
      // prune every incoming reference; currency and travel persist last, unread by normalization.
      await this._persistCharacterLibraries(packData.characterLibraries);

      // The world-scope rosters and defaults merge in the same slot for the same reason (issue
      // 1364); memberships need the destination system id, so they land after `createSystem`.
      summary.unresolvedReferences.push(...arrayOfRecords(packData.worldScopeReferences));
      await this._persistScopedEntityRosters(packData, summary);

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
        system = await this._craftingSystemManager.createSystem(systemInput);
        summary.system.id = system.id;
        summary.system.name = system.name;
        summary.system.created = true;
      }

      // Every membership's `systemId` is rewritten to the destination's in BOTH modes: copy mode
      // removed the payload's id, and a keep-mode overwrite may have matched a system by NAME.
      await this._persistScopedEntityMemberships(packData, system.id, summary);

      // Provenance (issue 775): the pack's own id when present, stable across reinstalls, which is
      // what makes the next reinstall's pruning correct; else the new id (copy mode, inert).
      const packSystemId = systemData.id || system.id;

      // --- Phase 4: Import recipes ---
      // Each recipe mutates the in-memory map only (`persist: false`), flushed by ONE `save()`
      // after the loop; a failed recipe is isolated and earlier successes still persist.
      const totalRecipes = recipesData.length;
      let processedRecipes = 0;
      for (const recipeData of recipesData) {
        const resolved = {
          ...recipeData,
          craftingSystemId:
            recipeData.craftingSystemId === '__SYSTEM_ID__'
              ? system.id
              : recipeData.craftingSystemId || system.id,
          // ALWAYS re-stamp provenance (issue 775), discarding any inbound `importSource`, so it
          // self-heals across re-export chains.
          importSource: { systemId: packSystemId, importedAt: Date.now() },
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
          processedRecipes++;
          this._maybeEmitRecipeProgress(processedRecipes, totalRecipes);
          continue;
        }

        try {
          if (existing && overwriteExisting) {
            await this._recipeManager.updateRecipe(resolved.id, resolved, {
              notify: false,
              emitChange: false,
              persist: false,
            });
            summary.collisions.push({
              type: 'recipe',
              id: resolved.id,
              name: resolved.name || resolved.id,
              resolution: 'overwritten',
            });
          } else {
            await this._recipeManager.createRecipe(resolved, {
              notify: false,
              emitChange: false,
              persist: false,
            });
          }
          summary.recipes.imported++;
        } catch (error) {
          summary.recipes.errors.push({
            recipeId: resolved.id,
            recipeName: resolved.name || resolved.id,
            error: error.message || String(error),
          });
        }

        processedRecipes++;
        this._maybeEmitRecipeProgress(processedRecipes, totalRecipes);
      }

      // --- Phase 4b: Prune provenance-matched orphans (overwrite of an existing system) ---
      // Only an overwrite can orphan a recipe; the deletes fold into the one save below.
      if (existingSystem && overwriteExisting) {
        this._emitProgress({
          pct: 0.92,
          phase: 'prune',
          message: 'Removing recipes dropped from the pack…',
        });
        await this._pruneOrphanedRecipes(system, recipesData, packSystemId, summary);
      }

      // One batched persist, also after a prune-only reinstall; optional for a mock manager.
      if (summary.recipes.imported > 0 || summary.recipes.pruned > 0) {
        await this._recipeManager.save?.();
      }

      // ONE bulk flag cleanup after the prune (the `deleteSystem` precedent), naming the ids it
      // actually pruned (issue 1226): the gate prunes exactly those when the corpus cannot be
      // attested complete.
      if (summary.recipes.pruned > 0) {
        await this._recipeManager.cleanupOrphanedRecipeFlags?.({
          removedRecipeIds: summary.orphans
            .filter((orphan) => orphan.disposition === 'pruned')
            .map((orphan) => orphan.recipeId),
        });
      }

      this._recipeManager.notifyRecipesChanged?.({
        action: 'importFromPack',
        imported: summary.recipes.imported,
        skipped: summary.recipes.skipped,
        pruned: summary.recipes.pruned,
        errors: summary.recipes.errors.length,
        systemId: system.id,
      });

      // --- Phase 5: Gathering authoring (environments + config) ---
      this._emitProgress({ pct: 0.95, phase: 'gathering', message: 'Saving gathering data…' });
      await this._importGatheringAuthoring(packData, system, recipesData, summary);

      // Fold the component source-item resolution into the unified reference report.
      this._foldComponentReferences(summary);

      // Completion MUST reach `pct: 1`, the only point a progress toast self-dismisses.
      this._emitProgress({ pct: 1, phase: 'complete', message: `Imported ${systemLabel}` });

      return summary;
    } catch (error) {
      // Terminal on throw: close the still-open toast, then re-throw the original error.
      this._activeProgressReporter?.dismiss?.();
      throw error;
    }
  }

  /** Emit one progress update, clamping `pct` into `[0, 1]`. */
  _emitProgress({ pct, message, phase } = {}) {
    this._activeProgressReporter?.({ pct: clampProgressFraction(pct), message, phase });
  }

  /** A recipe-phase tick every `RECIPE_PROGRESS_INTERVAL` recipes and the last, on [0.25, 0.9]. */
  _maybeEmitRecipeProgress(processed, total) {
    if (total <= 0) return;
    if (processed % RECIPE_PROGRESS_INTERVAL !== 0 && processed !== total) return;
    const pct = 0.25 + 0.65 * (processed / total);
    this._emitProgress({
      pct,
      phase: 'recipes',
      message: `Importing recipes (${processed}/${total})…`,
    });
  }

  /**
   * Prune provenance-matched orphans after an overwrite (issue 775): each persisted recipe of the
   * system absent from the payload is deleted when stamped by THIS pack, and otherwise kept and
   * reported (`unprovenanced` or `foreignProvenance`). Absence is judged against EVERY payload id,
   * so a recipe whose overwrite threw is never pruned.
   */
  async _pruneOrphanedRecipes(system, recipesData, packSystemId, summary) {
    const payloadIds = new Set(
      recipesData.map((recipeData) => recipeData?.id).filter((id) => id != null)
    );

    const persistedRecipes =
      this._recipeManager.getRecipes?.({ craftingSystemId: system.id }) ?? [];
    const orphanCandidates = persistedRecipes.filter((recipe) => !payloadIds.has(recipe.id));

    for (const orphan of orphanCandidates) {
      const provenanceSystemId = orphan.importSource?.systemId ?? null;
      if (provenanceSystemId === packSystemId) {
        await this._recipeManager.deleteRecipe(orphan.id, {
          notify: false,
          emitChange: false,
          persist: false,
          cleanupFlags: false,
        });
        summary.recipes.pruned++;
        summary.orphans.push({
          recipeId: orphan.id,
          recipeName: orphan.name || orphan.id,
          disposition: 'pruned',
          reason: 'provenanceMatched',
        });
      } else {
        summary.orphans.push({
          recipeId: orphan.id,
          recipeName: orphan.name || orphan.id,
          disposition: 'reported',
          reason: provenanceSystemId == null ? 'unprovenanced' : 'foreignProvenance',
        });
      }
    }
  }

  /**
   * The gathering authoring bundle: rebind environments to the system, resolve and report
   * references, then merge the realm library, gathering config and environments.
   */
  async _importGatheringAuthoring(packData, system, recipesData, summary) {
    const environments = Array.isArray(packData.gatheringEnvironments)
      ? structuredClone(packData.gatheringEnvironments)
      : [];
    const gatheringConfig =
      packData.gatheringConfig && typeof packData.gatheringConfig === 'object'
        ? structuredClone(packData.gatheringConfig)
        : null;

    // Point every environment at the (possibly new) system id; task, event and modifier ids stay.
    for (const env of environments) {
      if (env && typeof env === 'object') env.craftingSystemId = system.id;
    }

    // The realm library rides the envelope (issue 1282), handed to the resolver so its scene and
    // region UUIDs are reported; the default resolver never rewrites an external UUID.
    const travelConfig =
      packData.travelConfig && typeof packData.travelConfig === 'object'
        ? structuredClone(packData.travelConfig)
        : null;

    const { resolved, unresolvedReferences } = await resolveImportReferences(
      {
        system,
        recipes: recipesData,
        gatheringEnvironments: environments,
        gatheringConfig,
        travelConfig,
      },
      { resolveUuid: this._resolveExternalUuid }
    );
    summary.unresolvedReferences.push(...unresolvedReferences);

    const resolvedEnvironments = Array.isArray(resolved.gatheringEnvironments)
      ? resolved.gatheringEnvironments
      : [];
    const resolvedConfig = resolved.gatheringConfig;

    // The realm library and task library land before the environments, which the store validates
    // against them on every write (issues 1315, 1848).
    await this._persistTravelConfig(resolved.travelConfig);
    await this._persistGatheringConfig(system.id, resolvedConfig);
    await this._persistEnvironments(system.id, resolvedEnvironments);
    await this._persistCurrencyConfig(packData.currencyConfig);
  }

  /**
   * Merge the incoming world entity rosters and defaults BEFORE the system is created (issue
   * 1364; `import-export/spec.md` § World-scope entity merge on import). It writes only into a
   * scope the destination already SEEDED, judged per sub-key on `entities`, since a first write
   * would flip that type's Valid Id Basis to KNOWN world-wide; so it only ever widens a known
   * basis. The base is `store.get()`, never the three sub-keys, which would erase a world
   * tool-breakage authority, and the write goes through `store.save()`, which normalizes and
   * publishes in one step.
   */
  async _persistScopedEntityRosters(packData, summary) {
    const legs = this._readScopeMergeLegs(packData);
    // The merged component roster, or `null` when that scope will not be written (undecidable).
    const componentLeg = legs.components;
    const worldComponentIds = componentLeg.writable
      ? mergedEntityIds(componentLeg.base, componentLeg.incoming)
      : null;
    const componentMembers = membershipKeySet(
      mergedMembershipUnion(componentLeg.base, componentLeg.incoming)
    );

    for (const entityType of WORLD_SCOPE_ENTITY_TYPES) {
      const leg = legs[entityType];
      if (!leg.writable) continue;

      const merged = leg.base;
      const entityIds = new Set(sliceRecords(merged, 'entities').map((entity) => entity.id));
      let added = 0;

      // LAYER 1 — the world entity roster, by `id`, DESTINATION WINS.
      for (const entity of sliceRecords(leg.incoming, 'entities')) {
        const id = typeof entity.id === 'string' ? entity.id.trim() : '';
        if (!id || entityIds.has(id)) continue;
        entityIds.add(id);
        merged.entities.push(structuredClone(entity));
        added += 1;
      }

      // LAYER 2 - world defaults, by `id`, DESTINATION WINS; an added record has every section
      // re-decided against the merged corpus.
      const membershipUnion = mergedMembershipUnion(leg.base, leg.incoming);
      for (const incoming of sliceRecords(leg.incoming, 'defaults')) {
        const id = typeof incoming.id === 'string' ? incoming.id.trim() : '';
        if (!id || merged.defaults[id]) continue;
        if (!entityIds.has(id)) {
          summary.unresolvedReferences.push(
            this._scopeReference(REFERENCE_KINDS.WORLD_ENTITY_MISSING, entityType, incoming, id)
          );
        }
        const { record, declined } = recheckWorldDefault({
          entityType,
          record: incoming,
          worldComponentIds,
          membershipUnion,
          componentMembers,
        });
        for (const decline of declined) {
          summary.unresolvedReferences.push(
            this._scopeReference(
              REFERENCE_KINDS.WORLD_DEFAULT_DECLINED,
              entityType,
              incoming,
              decline.referenceValue
            )
          );
        }
        // A record left carrying only its `id` is not written; entities and memberships stay.
        if (!record) continue;
        merged.defaults[id] = record;
        added += 1;
      }

      // No record, no write, for each of the two writes independently.
      if (added === 0) continue;
      await leg.store.save(merged);
    }
  }

  /**
   * Merge the incoming memberships once the destination system id exists (issue 1364). The two
   * writes are not atomic; the torn state is inert (an absent membership refuses, never prunes)
   * and a keep-mode re-run repairs it, a copy-mode one does not.
   */
  async _persistScopedEntityMemberships(packData, systemId, summary) {
    if (!systemId) return;
    const legs = this._readScopeMergeLegs(packData);

    for (const entityType of WORLD_SCOPE_ENTITY_TYPES) {
      const leg = legs[entityType];
      if (!leg.writable) continue;

      const merged = leg.base;
      const entityIds = new Set(sliceRecords(merged, 'entities').map((entity) => entity.id));
      let added = 0;

      for (const incoming of sliceRecords(leg.incoming, 'membership')) {
        const entityId = typeof incoming.entityId === 'string' ? incoming.entityId.trim() : '';
        if (!entityId) continue;
        // Without the `systemId` rewrite every record names a phantom system.
        const record = { ...structuredClone(incoming), entityId, systemId };
        const key = membershipKey(entityId, systemId);
        if (merged.membership[key]) continue;
        if (!entityIds.has(entityId)) {
          summary.unresolvedReferences.push(
            this._scopeReference(
              REFERENCE_KINDS.WORLD_ENTITY_MISSING,
              entityType,
              incoming,
              entityId
            )
          );
        }
        merged.membership[key] = record;
        added += 1;
      }

      if (added === 0) continue;
      await leg.store.save(merged);
    }
  }

  /**
   * Each entity type's store, incoming slice, seeding verdict and FRESH persisted base, re-read
   * for each of the two writes so the second never drops what the first added.
   */
  _readScopeMergeLegs(packData) {
    const legs = {};
    for (const entityType of WORLD_SCOPE_ENTITY_TYPES) {
      const store = this._scopeStore(entityType);
      const raw = packData?.[WORLD_SCOPE_SLICE_KEYS[entityType]];
      const incoming = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : null;
      const writable = Boolean(store && incoming && store.isSeeded?.('entities') === true);
      legs[entityType] = {
        store,
        incoming,
        writable,
        base: writable ? store.get() : null,
      };
    }
    return legs;
  }

  /** One world-scope report entry, reusing the entity owner types. */
  _scopeReference(kind, entityType, owner, referenceValue) {
    return {
      kind,
      ownerType: SCOPE_OWNER_TYPES[entityType],
      ownerId: owner?.id ?? owner?.entityId ?? null,
      ownerName: owner?.name ?? '',
      referenceValue,
      disposition: 'reported',
    };
  }

  /**
   * Merge the incoming travel config NON-DESTRUCTIVELY (issue 1282): realms merge by `id`, the
   * DESTINATION winning, because environments, party overrides and discovery flags cite realms by
   * id; the scalars seed only an unconfigured world. It writes through the resolved `travelStore`,
   * else the raw setting pair (issue 1858).
   */
  async _persistTravelConfig(incoming) {
    if (!incoming || typeof incoming !== 'object') return;
    const store = this._resolveTravelStore();
    if (!store && (!this._getSetting || !this._setSetting)) return;

    const current = (store ? store.get() : this._getSetting(TRAVEL_CONFIG_KEY)) || {};
    const currentRealms = Array.isArray(current.realms) ? current.realms : [];
    const incomingRealms = Array.isArray(incoming.realms) ? incoming.realms : [];
    if (incomingRealms.length === 0) return;

    const seen = new Set(
      currentRealms.map((realm) => String(realm?.id || '').trim()).filter(Boolean)
    );
    const added = [];
    for (const realm of incomingRealms) {
      const id = String(realm?.id || '').trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      added.push(structuredClone(realm));
    }

    const worldWasUnconfigured = currentRealms.length === 0;
    if (added.length === 0 && !worldWasUnconfigured) return;

    const next = {
      ...current,
      realms: [...currentRealms, ...added],
    };
    if (worldWasUnconfigured) {
      if (incoming.revealMode) next.revealMode = incoming.revealMode;
      if (incoming.modifierVisibility) next.modifierVisibility = incoming.modifierVisibility;
    }

    if (store) {
      // The store publishes its cache before awaiting the setting, so the environment writes that
      // follow validate against the merged library with no replicated-setting hook (issue 1858).
      await store.save(next);
      return;
    }

    // Normalized as `GatheringRealmStore` would, or an id-less scene mapping would be minted a
    // fresh id on every `load()`.
    await this._setSetting(TRAVEL_CONFIG_KEY, normalizeTravelConfig(next));
  }

  /**
   * The realm store behind the `travelStore` seam, resolved per call, or `null`: the wired seam is
   * a lazy delegator whose `save` could report a phantom success, so `get()` answering is the
   * liveness probe before the raw setting fallback is skipped.
   */
  _resolveTravelStore() {
    const store = this._travelStore;
    if (typeof store?.get !== 'function' || typeof store?.save !== 'function') return null;
    return store.get() ? store : null;
  }

  /**
   * Merge the incoming character libraries NON-DESTRUCTIVELY and PER LIBRARY (issue 1308): they
   * share a setting key but no invariant. Entries merge by `id`, the DESTINATION winning, and ids
   * are never regenerated, so an import is safe to run twice.
   */
  async _persistCharacterLibraries(incoming) {
    if (!this._getSetting || !this._setSetting) return;
    if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) return;

    const current = this._getSetting(CHARACTER_LIBRARIES_KEY) || {};
    const next = { ...current };
    let changed = false;

    for (const key of ['characterPrerequisites', 'modifiers']) {
      const currentList = Array.isArray(current[key]) ? current[key] : [];
      const incomingList = Array.isArray(incoming[key]) ? incoming[key] : [];
      if (incomingList.length === 0) {
        next[key] = currentList;
        continue;
      }
      const seen = new Set(
        currentList.map((entry) => String(entry?.id || '').trim()).filter(Boolean)
      );
      const added = [];
      for (const entry of incomingList) {
        const id = String(entry?.id || '').trim();
        if (!id || seen.has(id)) continue;
        seen.add(id);
        added.push(structuredClone(entry));
      }
      next[key] = added.length > 0 ? [...currentList, ...added] : currentList;
      if (added.length > 0) changed = true;
    }

    if (!changed) return;
    await this._setSetting(CHARACTER_LIBRARIES_KEY, next);
    // Republish through the store, whose cache the direct write left stale; the crafting system
    // normalizer reads this library on every save.
    globalThis.game?.fabricate?.getCharacterLibrariesStore?.()?.load?.();
  }

  /**
   * Merge the incoming currency config NON-DESTRUCTIVELY (issue 1278): units merge by `id`, the
   * DESTINATION winning, so existing costs keep their units; the scalars seed only an unconfigured
   * world.
   */
  async _persistCurrencyConfig(incoming) {
    if (!this._getSetting || !this._setSetting) return;
    if (!incoming || typeof incoming !== 'object') return;

    const current = this._getSetting(CURRENCY_CONFIG_KEY) || {};
    const currentUnits = Array.isArray(current.units) ? current.units : [];
    const incomingUnits = Array.isArray(incoming.units) ? incoming.units : [];
    if (incomingUnits.length === 0) return;

    const seen = new Set(currentUnits.map((unit) => String(unit?.id || '').trim()).filter(Boolean));
    const added = [];
    for (const unit of incomingUnits) {
      const id = String(unit?.id || '').trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      added.push(structuredClone(unit));
    }

    const worldWasUnconfigured = currentUnits.length === 0;
    if (added.length === 0 && !worldWasUnconfigured) return;

    const next = {
      ...current,
      units: [...currentUnits, ...added],
    };
    if (worldWasUnconfigured) {
      if (incoming.spendStrategy) next.spendStrategy = incoming.spendStrategy;
      if (incoming.providerId) next.providerId = incoming.providerId;
      if (incoming.macros && typeof incoming.macros === 'object') next.macros = incoming.macros;
    }

    // Normalized as `CurrencyConfigStore` would, or an id-less unit would be minted a fresh id on
    // every `load()`.
    await this._setSetting(CURRENCY_CONFIG_KEY, normalizeWorldCurrencyConfig(next));
  }

  /**
   * Replace this system's environments in the global array (delete-then-add, so an overwrite
   * never accumulates stale records), leaving other systems' environments untouched.
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

    // Neither imported nor pre-existing records: skip the redundant global write.
    if (importedEnvironments.length === 0 && others.length === (all?.length ?? 0)) {
      return;
    }

    await store.save([...others, ...importedEnvironments]);
  }

  /**
   * Merge the exported `{ system, shared }` config under the system id, keeping other systems,
   * existing vocabularies and the world's current conditions.
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

  /** Fold the component source-item resolution into the unified reference report. */
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
   * Remap component `originItemUuid`s by precedence: an exact UUID match is retained; a
   * source+name match in world packs is remapped, the old UUID joining `aliasItemUuids`; anything
   * else stays as-is and is reported.
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

    // Run-scoped name lookup per pack, reused across components; method-local, so a later import
    // re-derives it.
    const packLookupCache = new Map();

    const remapped = [];
    for (const rawComponent of components) {
      // Upcast legacy source fields first, so a legacy component takes the resolution path
      // (issue 700).
      const component = upcastComponentSourceFields(rawComponent);
      const { id: compId, name: compName, originItemUuid } = component;

      // Fallbacks: retained existing ids, then the pack's own, then explicit additions.
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
          await this._withResolvedSourceMetadata(
            { ...component, aliasItemUuids: mergedFallbacks },
            exactDoc
          )
        );
        continue;
      }

      // Source+name match
      const foundUuid = await this._findBySourceAndName(
        originItemUuid,
        compName,
        targetPackIds,
        packLookupCache
      );
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
          await this._withResolvedSourceMetadata(
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

  /** The document behind a UUID, or `null` when missing or unresolvable. */
  async _resolveUuidDocument(uuid) {
    if (!uuid) return null;
    try {
      return (await fromUuid(uuid)) ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Snapshot a resolved source item's img and description onto a component that omitted them, as
   * the interactive drop path does: a premium system backed by a foreign pack cannot bake them in.
   * Baked art and copy are kept.
   */
  async _withResolvedSourceMetadata(component, sourceDoc) {
    if (!sourceDoc) return component;
    const enriched = { ...component };

    const storedImg = typeof component.img === 'string' ? component.img.trim() : '';
    if ((!storedImg || storedImg === 'icons/svg/item-bag.svg') && sourceDoc.img) {
      enriched.img = sourceDoc.img;
    }

    const storedDescription =
      typeof component.description === 'string' ? component.description.trim() : '';
    if (!storedDescription) {
      // Async since issue 800: the source description is enriched before it is normalized.
      const extract = this._craftingSystemManager?._extractSourceDescription;
      const description =
        typeof extract === 'function'
          ? await extract.call(this._craftingSystemManager, sourceDoc)
          : '';
      if (description) enriched.description = description;
    }

    return enriched;
  }

  /**
   * The compendium UUID of a world-pack Item whose source UUID and (case-insensitive) name match,
   * or `null`, through the run-scoped per-pack name lookup.
   */
  async _findBySourceAndName(registeredItemUuid, name, targetPackIds, packLookupCache) {
    if (!registeredItemUuid || !name) return null;
    const nameLower = name.trim().toLowerCase();

    const packs = game.packs ? [...game.packs] : [];
    const filteredPacks = packs.filter((p) => {
      if (p.documentName !== 'Item') return false;
      if (targetPackIds.length > 0 && !targetPackIds.includes(p.collection)) return false;
      return true;
    });

    for (const pack of filteredPacks) {
      const lookup = await this._getPackNameLookup(pack, packLookupCache);
      if (lookup === PACK_LOOKUP_SKIP) continue;

      const candidates = lookup.get(nameLower);
      if (!candidates) continue;

      for (const entry of candidates) {
        const entrySource = entry._stats?.compendiumSource || entry.flags?.core?.sourceId || null;
        if (entrySource === registeredItemUuid) {
          return `Compendium.${pack.collection}.${entry._id}`;
        }
      }
    }

    return null;
  }

  /**
   * The run-scoped `nameLower -> entries` lookup for a pack, or `PACK_LOOKUP_SKIP` when its
   * `getIndex` rejects.
   */
  async _getPackNameLookup(pack, packLookupCache) {
    if (packLookupCache.has(pack)) return packLookupCache.get(pack);

    let index;
    try {
      index = await pack.getIndex({
        fields: ['name', '_stats.compendiumSource', 'flags.core.sourceId'],
      });
    } catch {
      packLookupCache.set(pack, PACK_LOOKUP_SKIP);
      return PACK_LOOKUP_SKIP;
    }

    const lookup = new Map();
    for (const entry of index) {
      const entryName = (entry.name || '').trim().toLowerCase();
      if (!entryName) continue;
      const bucket = lookup.get(entryName);
      if (bucket) bucket.push(entry);
      else lookup.set(entryName, [entry]);
    }

    packLookupCache.set(pack, lookup);
    return lookup;
  }

  /** An existing crafting system by id, then by name. */
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
