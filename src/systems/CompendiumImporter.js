/**
 * Orchestrates importing crafting systems and recipes from pack JSON data.
 * Handles UUID remapping with deterministic precedence and fallback item ID management.
 */
import { validateGatheringDropReferences } from './GatheringDropReferenceValidator.js';
import { resolveImportReferences, REFERENCE_KINDS } from './importReferenceResolver.js';

/** World-setting key for the per-system gathering config (mirrors SETTING_KEYS.GATHERING_CONFIG). */
const GATHERING_CONFIG_KEY = 'gatheringConfig';

/** How often (in recipes processed) Phase 4 emits an interim progress tick. */
const RECIPE_PROGRESS_INTERVAL = 10;

/**
 * Sentinel cached against a pack whose `getIndex` rejected, so a broken pack is
 * skipped once per import run rather than retried for every unresolved component.
 */
const PACK_LOOKUP_SKIP = Symbol('pack-lookup-skip');

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
      if (summary.recipes.pruned > 0) {
        await this._recipeManager.cleanupOrphanedRecipeFlags?.();
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
