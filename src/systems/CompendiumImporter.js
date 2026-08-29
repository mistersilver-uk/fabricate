/**
 * Orchestrates importing crafting systems and recipes from pack JSON data.
 * Handles UUID remapping with deterministic precedence and fallback item ID management.
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

/**
 * Sentinel cached against a pack whose `getIndex` rejected, so a broken pack is
 * skipped once per import run rather than retried for every unresolved component.
 */
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
 * Build the default V13 progress-notification reporter used when no `reportProgress`
 * seam is injected. `ui.notifications.info(msg, { progress: true, console: false })`
 * returns a handle whose `handle.update({ pct, message })` advances the bar (`pct` on
 * `[0, 1]`); it superseded `SceneNavigation.displayProgressBar`. `console: false`
 * matches the native scene loader and stops every progress tick from writing a
 * `console.info` line.
 *
 * The returned value is a callable reporter that ALSO owns the toast lifecycle: it is
 * the single owner of its notification handle, and it carries an idempotent `dismiss()`
 * terminal seam so an abnormal exit can finalize the still-open toast. The reporter is
 * stateful (it lazily opens ONE toast on first call, updates it thereafter, and tracks
 * `started`/`completed`) and carries the required guards:
 *   1. Undefined-handle / test-stub safety — when `info` is absent or returns a falsy
 *      handle (or a handle without `.update`), it degrades to a no-op rather than
 *      throwing (the test harness stubs `info` as `() => {}`, returning `undefined`).
 *   2. update-before-render safety — a progress toast queued behind the visible-toast
 *      cap may not be rendered when `.update()` is first called, which can throw; the
 *      call is wrapped in try/catch and degrades silently.
 *   3. Completion at `pct: 1` — a progress toast is exempt from the normal lifetime and
 *      only self-dismisses when it reaches `pct: 1`, so callers MUST finish at `pct: 1`;
 *      reaching `pct: 1` sets `completed`, after which `dismiss()` stands down (the toast
 *      already scheduled its own 500ms self-remove, so there is no double-remove race).
 *
 * `dismiss()` guarantees a terminal state on an exit that never reached `pct: 1`
 * (e.g. an import that throws mid-pipeline). It is a no-op when the reporter never
 * started or already completed; otherwise it removes the still-open toast via the
 * handle's own `handle.remove()` — NOT the `ui.notifications.remove(handle)` class
 * method, which throws on an undefined or stubbed handle, whereas `handle.remove()` is
 * reached only past the falsy/`remove`-method guard below. `handle.remove()` is also
 * immediate and queue-safe: it splices the notify queue without touching the DOM,
 * unlike `update({ pct: 1 })`, which would flash the bar to a misleading SUCCESS state
 * and can throw on an un-rendered toast. The removal call mirrors the existing guards:
 * a falsy handle, a missing `remove` method, or a teardown throw all degrade to a
 * no-op.
 *
 * @returns {((update: { pct?: number, message?: string, phase?: string }) => void) & { dismiss: () => void }}
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

    // `clampProgressFraction` returns a literal `1` at/above the cap, so this boundary
    // has no float-drift risk; reaching it marks the run complete (the toast self-
    // dismisses at strict `pct === 1`) so a later `dismiss()` stands down.
    if (fraction === 1) completed = true;

    if (!handle || typeof handle.update !== 'function') return;
    try {
      handle.update({ pct: fraction, message });
    } catch {
      // Toast not yet rendered (queued behind the visible-toast cap): degrade to a
      // no-op tick rather than throwing out of the import loop.
    }
  }

  reportProgress.dismiss = function dismiss() {
    // No-op when the toast never opened, or already reached pct:1 (where it scheduled
    // its own self-remove). Idempotent: `completed` is latched before the removal so a
    // repeat call — or a removal throw — cannot re-enter the removal path.
    if (!started || completed) return;
    completed = true;
    if (!handle || typeof handle.remove !== 'function') return;
    try {
      handle.remove();
    } catch {
      // Teardown on an un-rendered / queued toast can throw: degrade to a no-op.
    }
  };

  return reportProgress;
}

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

/**
 * Upcast a component's pre-`1.16.0` source-reference field names to their
 * renamed post-1.16.0 forms so a legacy-named component resolves, classifies, and
 * persists per spec (`openspec/specs/import-export/spec.md:70`). Tool and
 * recipe-item-definition import paths already accept the legacy names; components
 * were the gap.
 *
 * The rename is DELETE-AND-RENAME, never an additive spread: `_normalizeComponent`
 * prefers any present `aliasItemUuids` array, so leaving `fallbackItemIds` beside a
 * new (or empty) `aliasItemUuids` reproduces exactly the shadowing bug this fixes.
 * New names WIN when both are present (a post-rename export carries the new names).
 * Scoped to component records only — the same field names denote unrelated persisted
 * concepts elsewhere (RegionBehaviour schema field, essence `sourceItemUuid`,
 * actor-flag provenance), so this must not be a codemod on the literal string.
 *
 * @param {object} component
 * @returns {object} the component with legacy source fields renamed (a copy when a
 *   rename happened, otherwise the original reference)
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
 * A thin delegating view of ONE world-scope entity store, resolved on every call (issue 1364).
 *
 * IT LIVES BESIDE THE IMPORTER RATHER THAN AT THE WIRING SITE, because the rule it encodes is
 * this importer's: the world-scope merge FAILS CLOSED, so an absent store is skipped silently and
 * a seam that answered anything optimistic would turn "merged nothing" into "reported success".
 * Keeping the adapter next to `_scopeStore` is what stops the two halves of that contract drifting
 * apart, and it is what lets a test exercise the SHIPPED delegator instead of a copy of it.
 *
 * It exists at all for the reason the importer's `environmentStore` delegator does: the seam is
 * built while the field it names may not be assigned yet, so it closes over a READ rather than
 * over a value. Closing over the FIELD rather than an accessor NAME is also what distinguishes it
 * from the `game.fabricate` accessor mirror it replaced — a rename here is a rename of a property
 * the wiring site reads, not of a string in a hand-maintained table.
 *
 * `isSeeded` answers a strict `true` only when a real store says so, so an unassigned field is
 * indistinguishable from an unmigrated world and the merge is skipped — which also means `save` is
 * unreachable without a real store behind it.
 *
 * The three methods are exactly what the world-scope merge calls. It is a shared factory rather
 * than three inline literals at the wiring site because three near-identical blocks are what the
 * duplication gate counts.
 *
 * @param {() => object|null|undefined} resolve Reads the owning field at call time.
 * @returns {{isSeeded: (subKey: string) => boolean, get: () => object|null,
 *   save: (value: object) => Promise<unknown>|undefined}}
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
   * @param {object} craftingSystemManager
   * @param {object} recipeManager
   * @param {object} [seams]
   * @param {object} [seams.environmentStore] - GatheringEnvironmentStore seam (list/save)
   * @param {(key: string) => *} [seams.getSetting] - World-setting reader (gatheringConfig)
   * @param {(key: string, value: *) => Promise<*>} [seams.setSetting] - World-setting writer
   * @param {() => boolean} [seams.isGM] - GM predicate (F3 fail-fast gate)
   * @param {(uuid: string) => Promise<null | { uuid: string }>} [seams.resolveExternalUuid]
   * @param {(update: { pct?: number, message?: string, phase?: string }) => void} [seams.reportProgress]
   *   Live-progress sink called at phase boundaries, every N recipes, and on completion.
   *   Defaults to the Foundry V13 progress-notification factory so the caller wires nothing.
   * @param {object} [seams.componentScopeStore] World COMPONENT scope store (issue 1364)
   * @param {object} [seams.essenceScopeStore] World ESSENCE scope store (issue 1364)
   * @param {object} [seams.toolScopeStore] World TOOL scope store (issue 1364)
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
    // Store the injected seam (or null). The DEFAULT reporter is stateful — it opens
    // and then drives a single toast — and this importer is a long-lived singleton in
    // main.js reused across imports, so the default MUST be constructed per RUN (see
    // importFromPackData) rather than once here; otherwise a second import would try to
    // update the first run's already-dismissed toast. An injected seam is stateless and
    // is reused as-is.
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
   * One world-scope entity store, or `null`.
   *
   * IT FAILS CLOSED and never constructs one of its own. Synthesizing a store would hand the merge
   * a fabricated, UNSEEDED destination — and an unseeded destination is exactly the state whose
   * first write flips a whole world's Valid Id Basis from UNKNOWN to KNOWN. `_persistCharacterLibraries`
   * returns early on an absent seam for the same reason.
   *
   * **IT IS THE INJECTED SEAM ALONE, WITH NO `game.fabricate` FALLBACK, AND THE ABSENCE IS
   * DELIBERATE.** A lazy accessor lookup keyed on a hand-maintained mirror of `game.fabricate`'s
   * method names looks like belt-and-braces and is the opposite: because the merge fails closed,
   * a mirror that drifts — a renamed accessor, a moved store — makes every world-scope import
   * silently merge NOTHING and still report success, and no test can see the difference between
   * that and a correct fallback. Both production call sites inject the three stores explicitly and
   * are pinned by a source contract, which is a guard that can fail.
   *
   * @param {'components'|'essences'|'tools'} entityType
   * @returns {object|null}
   * @private
   */
  _scopeStore(entityType) {
    return this._scopeStoreSeams[entityType] ?? null;
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
   * @throws Re-throws the original error UNCHANGED (no wrapping, no swallow) when a phase
   *   after the `pct:0` start emit fails, after invoking the active reporter's terminal
   *   `dismiss()` so the still-open progress toast is torn down and a failed import never
   *   orphans the bar on screen until reload.
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
      recipes: { total: recipesData.length, imported: 0, skipped: 0, pruned: 0, errors: [] },
      collisions: [],
      // Orphan candidates surfaced under overwrite: recipes belonging to the target
      // system that are absent from the incoming payload. Each carries a `disposition`
      // (`pruned` for auto-removed provenance-matched recipes, `reported` for preserved
      // GM-authored / legacy / foreign-provenance candidates).
      orphans: [],
      // Structured cross-reference report surfaced to the GM (source items,
      // scenes, scene-regions, macros, drop-row items, broken internal links).
      unresolvedReferences: [],
    };

    // Fresh progress reporter per RUN: the default reporter carries per-toast state,
    // and this importer instance is reused across imports (main.js singleton), so a new
    // reporter is built here for each run. An injected seam is reused directly.
    this._activeProgressReporter = this._reportProgress ?? createDefaultProgressReporter();

    const systemLabel = summary.system.name || 'crafting system';
    this._emitProgress({ pct: 0, phase: 'start', message: `Importing ${systemLabel}…` });

    // Guarantee a terminal reporter state on EVERY exit path. This try wraps the phase
    // body AFTER the pct:0 start emit, so its catch targets THIS run's freshly-assigned
    // `_activeProgressReporter`, never a stale prior-run reporter on the instance field.
    // A progress toast self-dismisses only at pct:1, so a throw before the pct:1
    // completion emit would otherwise leave the bar frozen until reload; the catch
    // dismisses the still-open toast and then RE-THROWS the original error UNCHANGED so
    // the UI caller still surfaces the real failure (its distinct `Import failed:` toast).
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

      // ORDER IS LOAD-BEARING (issue 1308): the world character libraries are merged BEFORE the
      // system is created or updated, unlike the currency and travel slices, which are persisted
      // last because nothing reads them during normalization.
      //
      // These two ARE read during normalization. `_normalizeSystem` derives its Valid Id Basis
      // from the world libraries, so a system created while the incoming entries are still only
      // in the payload would have every tool prerequisite reference and every default modifier id
      // pruned against a basis that cannot yet see them. Merging first is what makes a copy-mode
      // import of a bundle authored in another world land with its references intact.
      await this._persistCharacterLibraries(packData.characterLibraries);

      // The world-scope entity ROSTERS and DEFAULTS (issue 1364), merged in the same slot and for
      // the same reason: `_normalizeSystem` derives its Valid Id Basis from the `entities` sub-key
      // on every normalize, so a system created while the incoming world entities are still only
      // in the payload would have every essence quantity pruned against a basis that cannot yet
      // see them. The MEMBERSHIP layer cannot be merged here — the destination's system id does
      // not exist until `createSystem` runs below — so it lands immediately after, which is why
      // this merge is split rather than atomic.
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
        // Force the pack's system ID if provided so cross-references remain stable
        system = await this._craftingSystemManager.createSystem(systemInput);
        summary.system.id = system.id;
        summary.system.name = system.name;
        summary.system.created = true;
      }

      // The MEMBERSHIP layer, now that the destination's system id exists. Every incoming record's
      // `systemId` is rewritten to it, in BOTH modes: copy-mode import removed the payload's id,
      // and a keep-mode overwrite may have resolved an existing system by NAME under a different
      // one, so the payload's id is the destination's in neither.
      await this._persistScopedEntityMemberships(packData, system.id, summary);

      // Provenance key for recipe import stamping (issue 775): the pack's own stable
      // identity when the payload carries one (keep-mode — preserved across reinstalls of
      // the same pack, which is what makes provenance-matched pruning correct on the NEXT
      // reinstall), else the freshly-created system id (copy-mode / id-less payloads,
      // where the stamp is inert because copy never overwrites an existing system).
      const packSystemId = systemData.id || system.id;

      // --- Phase 4: Import recipes ---
      // Each recipe mutates the in-memory recipe map only (persist:false); the whole
      // batch is flushed with ONE `save()` after the loop, collapsing N growing
      // whole-array `recipes` world writes to a single write. Per-recipe error
      // isolation is unchanged (the try/catch still runs per recipe), and a caught
      // failure leaves earlier successes in the map for the final `save()` to persist.
      const totalRecipes = recipesData.length;
      let processedRecipes = 0;
      for (const recipeData of recipesData) {
        const resolved = {
          ...recipeData,
          craftingSystemId:
            recipeData.craftingSystemId === '__SYSTEM_ID__'
              ? system.id
              : recipeData.craftingSystemId || system.id,
          // ALWAYS re-stamp provenance (issue 775), discarding any inbound `importSource`,
          // so it self-heals across re-export/re-import chains and across a stale/foreign
          // inbound value. A "stamp only when null" shortcut would be wrong.
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
      // Only ever runs in the `existingSystem && overwriteExisting` path: a copy-mode /
      // fresh-system import mints a new id and has no persisted recipes to overwrite, so
      // there is never an orphan to prune. Deletes mutate the in-memory map only
      // (persist:false), folding into the single post-loop save below.
      if (existingSystem && overwriteExisting) {
        this._emitProgress({
          pct: 0.92,
          phase: 'prune',
          message: 'Removing recipes dropped from the pack…',
        });
        await this._pruneOrphanedRecipes(system, recipesData, packSystemId, summary);
      }

      // Single batched persist for the whole recipe phase. Widened from `imported > 0` so
      // a prune-only reinstall (payload drops recipes but adds none, imported === 0) still
      // writes; an overwrite that imports and prunes NOTHING still writes nothing.
      // Optional-chained so a synchronous-storing mock recipe manager (which never needs a
      // settings flush) is a no-op here; the real RecipeManager always defines `save`, so
      // production still issues one write.
      if (summary.recipes.imported > 0 || summary.recipes.pruned > 0) {
        await this._recipeManager.save?.();
      }

      // ONE bulk actor-flag cleanup pass after the prune batch (F1, the deleteSystem
      // precedent): reconciles invalid-run and learned-recipe flags against the
      // post-deletion map in O(affected actors), not O(pruned × actors). Independent of
      // the `recipes` write above, so it runs after the single save.
      //
      // The pruned ids are NAMED (issue 1226). This is a destructive door the flag-cleanup
      // gate covers, and the ids are what it prunes when the corpus cannot be attested
      // complete — without them a reinstall against a half-converted world would leave
      // every flag its own prune orphaned. `_pruneOrphanedRecipes` records each one it
      // actually deleted as a `pruned` orphan, so this is derived from what happened rather
      // than from what was planned.
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

      // Completion MUST reach pct:1 — a progress toast is lifetime-exempt and only
      // self-dismisses at pct:1, so anything less leaves the bar on screen.
      this._emitProgress({ pct: 1, phase: 'complete', message: `Imported ${systemLabel}` });

      return summary;
    } catch (error) {
      // Terminal-on-throw: finalize the still-open progress indicator (no-op on the
      // success/skip paths, which already reached pct:1), then re-throw the ORIGINAL
      // error unchanged — no wrapping, no swallow.
      this._activeProgressReporter?.dismiss?.();
      throw error;
    }
  }

  /**
   * Emit a single progress update through the injected/defaulted `reportProgress`
   * seam. Clamps `pct` into `[0, 1]` so the completion contract holds regardless of
   * caller arithmetic.
   * @private
   */
  _emitProgress({ pct, message, phase } = {}) {
    this._activeProgressReporter?.({ pct: clampProgressFraction(pct), message, phase });
  }

  /**
   * Emit an interim recipe-phase progress tick every `RECIPE_PROGRESS_INTERVAL`
   * recipes (and on the final recipe), mapping recipe progress onto the `[0.25, 0.9]`
   * span reserved for Phase 4.
   * @private
   */
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
   * Prune provenance-matched orphans after an overwrite import (issue 775). Enumerate
   * the target system's persisted recipes that are ABSENT from the incoming payload,
   * partition them by provenance, auto-delete the ones stamped by THIS pack (mutating
   * the in-memory map only, so the deletions fold into the single post-loop save), and
   * record every candidate in `summary.orphans` with its disposition:
   *   - provenance-matched (`importSource.systemId === packSystemId`) → auto-pruned;
   *   - unprovenanced (`importSource == null`, GM-authored or pre-provenance legacy) → kept + reported;
   *   - foreign-provenance (`importSource.systemId` set but ≠ packSystemId) → kept + reported.
   *
   * The absent-set is derived from ALL payload recipe ids — NOT the successfully
   * imported ids — so a payload recipe whose overwrite THREW (per-recipe error
   * isolation) is still "shipped" and is never pruned (data-loss guard).
   * @private
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
    // The realm library rides the ENVELOPE since issue 1282, so it is handed to the resolver
    // alongside the rest: every realm's `sceneMappings[]` carries a scene and scene-region UUID
    // that the destination world may not have, and dropping it here is what would silently stop
    // those being reported.
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

    // The task LIBRARY lands before the environments that reference it. An environment's
    // enable gate asks whether it composes at least one task, and in automatic mode that
    // question can only be answered against the library — so persisting environments first
    // validates them against whatever the destination world already had. That ordering was
    // latent until issue 1315 closed the gate's mode-blind `enabledTaskIds` guard, which had
    // been answering "yes" for automatic environments without consulting the library at all.
    await this._persistGatheringConfig(system.id, resolvedConfig);
    await this._persistEnvironments(system.id, resolvedEnvironments);
    await this._persistCurrencyConfig(packData.currencyConfig);
    await this._persistTravelConfig(resolved.travelConfig);
  }

  /**
   * Merge the incoming world entity ROSTER and world DEFAULTS into this world's own, per entity
   * type and per layer, BEFORE the crafting system is created or updated (issue 1364).
   *
   * ## THE SEEDING GATE — the safety rule the whole merge rests on
   *
   * `ScopedDefinitionStore._persist` sets ALL THREE `seeded` flags and persists all three sub-keys
   * on any write, so a FIRST write would flip this world's Valid Id Basis from UNKNOWN to KNOWN
   * for that entity type across every system in the world — including systems the import never
   * touched. So the merge writes only into a scope the destination has ALREADY seeded, judged with
   * the PER-SUB-KEY form on `entities` and never the no-argument form, which ORs across sub-keys
   * and would report seeded on the strength of a sibling.
   *
   * An unmigrated destination is therefore NEVER seeded by an import: its three settings stay
   * absent and the created system behaves exactly as it does under schema 5. Nothing is lost — when
   * that world later migrates, the `1.30.0` pass derives the world entities for the imported system
   * from the in-system arrays the import DID land. Because the destination is already seeded
   * whenever a write happens, this merge only ever WIDENS a KNOWN basis, and widening a basis can
   * never prune anything that was surviving.
   *
   * ## THE MERGE BASE IS `store.get()`, NOT THE THREE SUB-KEYS
   *
   * `save(raw)` normalizes the RAW argument and rebuilds its extras from that argument alone, and
   * `normalizeWorldToolBreakage(undefined)` answers `{}`. So a merge written as
   * `save({ entities, defaults, membership })` would silently ERASE a world tool-breakage authority
   * a destination GM authored. The store's own persisted projection carries the extras, so the base
   * is that, mutated across the three sub-keys and handed back.
   *
   * It goes through `store.save()` rather than a direct `_setSetting`, because `save()` normalizes
   * on write AND publishes the cache in one step by contract, while the hand-rolled pair
   * `_persistCharacterLibraries` uses has two halves either of which is forgettable.
   *
   * @param {object} packData
   * @param {object} summary
   * @private
   */
  async _persistScopedEntityRosters(packData, summary) {
    const legs = this._readScopeMergeLegs(packData);
    // The merged COMPONENT roster, or `null` when the component scope will not be written and the
    // roster the addressability constraints consult is therefore UNDECIDABLE.
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

      // LAYER 2 — the world defaults, by `id`, DESTINATION WINS and is never re-examined. A record
      // the merge would ADD has every section re-decided against the destination's merged corpus.
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
        // A record left carrying only its `id` is not written at all, applying the election's own
        // rule; the world ENTITY and every membership record are untouched either way.
        if (!record) continue;
        merged.defaults[id] = record;
        added += 1;
      }

      // NO RECORD, NO WRITE — evaluated independently for each of the two writes the split
      // produces, exactly as every sibling world-scope merge does.
      if (added === 0) continue;
      await leg.store.save(merged);
    }
  }

  /**
   * Merge the incoming MEMBERSHIP records, AFTER the destination's system id exists (issue 1364).
   *
   * THE TWO WRITES ARE NOT ATOMIC, and that is stated rather than hidden. A failure between them
   * leaves the destination holding world entities with no membership record for the imported
   * system. That state is INERT: an absent membership record is a REFUSAL and never a prune, and
   * the basis union is deliberately not membership-filtered. Re-running the import repairs it under
   * KEEP mode, where the destination-wins merge makes the second run additive. A COPY-mode re-run
   * does NOT repair it — it mints a second destination system, and the torn one keeps its memberless
   * world entities until a GM deletes it.
   *
   * @param {object} packData
   * @param {string} systemId The RESOLVED destination system id.
   * @param {object} summary
   * @private
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
        // THE `systemId` REWRITE. Without it every record names a phantom system and the created
        // copy has zero members.
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
   * Resolve the three merge legs: the store, the incoming slice, the seeding verdict and a FRESH
   * copy of the destination's persisted projection.
   *
   * Read fresh on each of the two writes, deliberately: the first write publishes a new corpus, and
   * a base captured before it would silently drop whatever that write added.
   *
   * @param {object} packData
   * @returns {Record<string, {store: object|null, incoming: object|null, writable: boolean, base: object|null}>}
   * @private
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

  /**
   * One world-scope report entry. The three record-owned kinds reuse the shipped entity-specific
   * owner types, so no new `OwnerType` is introduced.
   *
   * @private
   */
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
   * Merge the imported world travel config into this world's own (issue 1282).
   *
   * NON-DESTRUCTIVE, and the direction matters for the same reason it does for currency:
   * realms are WORLD scope, so unlike the per-system gathering slice there is no key under
   * which an import may simply replace what is there. Overwriting would destroy the geography
   * the destination GM authored for systems that have nothing to do with this import.
   *
   * So realms merge by `id` with the DESTINATION winning a collision — an id already in this
   * world keeps its own definition, including its `sceneMappings[]`, and only genuinely new
   * places are appended. Environments (`includedRealmIds` / `excludedRealmIds`), party
   * overrides and actor discovery flags ALL cite realms by id, so a destination realm replaced
   * by an incoming one of the same id would silently re-point every one of those references at
   * a different place. Destination-wins is also what makes an import safe to run twice.
   *
   * The scalars (reveal mode, modifier visibility) are seeded ONLY into an unconfigured world.
   * A world that already has realms has already answered how it discloses its places, and an
   * imported system does not get to overrule it.
   * @private
   */
  async _persistTravelConfig(incoming) {
    if (!this._getSetting || !this._setSetting) return;
    if (!incoming || typeof incoming !== 'object') return;

    const current = this._getSetting(TRAVEL_CONFIG_KEY) || {};
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

    // Normalize before writing, for the reason `_persistCurrencyConfig` does: every other
    // writer of this setting goes through `GatheringRealmStore`, which normalizes on write.
    // Without this a hand-edited export could persist a shape the readers only repair on read —
    // and a scene mapping that arrived without an id would be minted a FRESH id on every
    // `load()`, changing its identity from one reload to the next.
    await this._setSetting(TRAVEL_CONFIG_KEY, normalizeTravelConfig(next));
  }

  /**
   * Merge the imported world character libraries into this world's own (issue 1308).
   *
   * NON-DESTRUCTIVE, and PER LIBRARY. The two lists share one setting key for persistence
   * economy only — they share no invariant — so they are merged independently. A single
   * object-level merge would let a destination holding prerequisites but no modifiers win the
   * whole slice and silently discard every incoming modifier.
   *
   * Entries merge by `id` with the DESTINATION winning a collision, exactly as currency units and
   * realms do: an id already in this world keeps its own definition and only genuinely new
   * entries are appended. That is what makes an import safe to run twice, and it is what keeps
   * every book, tool, check and drop row that references an id resolving to the rule its author
   * meant. Ids are never regenerated.
   * @private
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
    // Republish through the store so its cache is not left holding the pre-import libraries.
    // `_setSetting` writes the setting directly, so nothing else would refresh it, and the
    // crafting system normalizer reads this library on every save.
    globalThis.game?.fabricate?.getCharacterLibrariesStore?.()?.load?.();
  }

  /**
   * Merge the imported world currency config into this world's own (issue 1278).
   *
   * NON-DESTRUCTIVE, and the direction matters: currency is WORLD scope, so unlike the
   * per-system gathering slice there is no key under which an import may simply replace what is
   * there. Overwriting would destroy a ladder the destination GM authored for systems that have
   * nothing to do with this import.
   *
   * So units merge by `id` with the DESTINATION winning a collision — an id already in this world
   * keeps its own definition, and only genuinely new denominations are appended. That is what
   * makes an import safe to run twice, and it is also what keeps existing recipe currency costs
   * resolving to the units their author meant.
   *
   * The scalars (spend strategy, provider, macros) are seeded ONLY into an unconfigured world.
   * A world that already has a ladder has already answered "how do actors here store coins", and
   * an imported system does not get to overrule it.
   * @private
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

    // Normalize before writing. Every other writer of this setting goes through
    // `CurrencyConfigStore`, which normalizes on write; this one does not have the store, so
    // without this a hand-edited export could persist a shape the readers only repair on read —
    // and a unit that arrived without an id would be minted a FRESH id on every `load()`,
    // changing its identity from one reload to the next.
    await this._setSetting(CURRENCY_CONFIG_KEY, normalizeWorldCurrencyConfig(next));
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

    // Run-scoped name→entry lookup, built at most once per pack and reused across
    // every component's miss-path search — this removes the per-component linear
    // pack scan. It MUST stay method-local (never an instance field): a second
    // import on the same importer instance re-derives it, so a stale index can't
    // leak across runs.
    const packLookupCache = new Map();

    const remapped = [];
    for (const rawComponent of components) {
      // Upcast pre-1.16.0 source-reference field names before the originItemUuid
      // read below, so a legacy-named component takes the resolution path instead
      // of the id-less early exit that dropped its alias uuids (issue #700).
      const component = upcastComponentSourceFields(rawComponent);
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
      // Async since issue 800: `_extractSourceDescription` now RESOLVES the source
      // description through Foundry's enricher before normalizing it.
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
   * Search world compendium packs for an item whose source UUID matches and whose
   * name matches the component name. Returns the target compendium UUID, or null.
   *
   * @param {string} registeredItemUuid - The source UUID from the pack data
   * @param {string} name - Component name (case-insensitive match)
   * @param {string[]} targetPackIds - Optional filter to specific pack IDs
   * @param {Map<object, Map<string, object[]> | symbol>} packLookupCache - Run-scoped
   *   per-pack name→entry lookup (or a SKIP sentinel for a pack whose index failed),
   *   built once per import and reused across every component so the miss-path is an
   *   O(1) name lookup instead of a per-component linear scan of every pack index.
   * @returns {Promise<string|null>}
   * @private
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
   * Return (building on first request) the run-scoped name→entry lookup for a pack:
   * a `Map<nameLower, entry[]>` over its index, or {@link PACK_LOOKUP_SKIP} when the
   * pack's `getIndex` rejects (so a broken pack is skipped once, not retried per
   * component). `getIndex` already self-caches per pack at the Foundry level; the win
   * here is eliminating the per-component linear scan, and the cache is method-local
   * so it re-derives on the next import run.
   * @private
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
