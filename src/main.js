// Import global stylesheet so Vite includes it in the module graph for HMR.
// In production builds, a Vite plugin resolves this to a no-op since Foundry
// loads the stylesheet via module.json's "styles" field instead.
import '../styles/fabricate.css';

import { RecipeManager } from './systems/RecipeManager.js';
import { CompendiumImporter } from './systems/CompendiumImporter.js';
import { CraftingEngine } from './systems/CraftingEngine.js';
import { CraftingSystemManager } from './systems/CraftingSystemManager.js';
import { CraftingRunManager } from './systems/CraftingRunManager.js';
import { SalvageRunManager } from './systems/SalvageRunManager.js';
import { GatheringEnvironmentStore } from './systems/GatheringEnvironmentStore.js';
import { GatheringRunManager } from './systems/GatheringRunManager.js';
import { GatheringGateAndCheckEvaluator } from './systems/GatheringGateAndCheckEvaluator.js';
import { GatheringRichStateService } from './systems/GatheringRichStateService.js';
import { secondsPerUnitFromCalendar } from './systems/foundryCalendar.js';
import { GatheringEngine } from './systems/GatheringEngine.js';
import { HAZARD_SCENE_SOCKET, createHazardSceneTrigger, routeHazardSceneSocketMessage } from './systems/hazardSceneCoordinator.js';
import { renderDialog, viewScene } from './ui/svelte/util/foundryBridge.js';
import { RecipeVisibilityService } from './systems/RecipeVisibilityService.js';
import { ResolutionModeService } from './systems/ResolutionModeService.js';
import { SignatureValidator } from './systems/SignatureValidator.js';
import { Recipe } from './models/Recipe.js';
import { Ingredient } from './models/Ingredient.js';
import { IngredientGroup } from './models/IngredientGroup.js';
import { MacroExecutor } from './utils/MacroExecutor.js';
import { findStackableMatch } from './utils/sourceUuid.js';
import {
  callGatheringRuntimeWithCurrentViewer,
  createGatheringSceneAccess,
  createGatheringSelectableActorsGetter,
  evaluateGatheringExpression,
  processWorldTimeCallbacksSafely,
} from './gatheringBootstrapAdapters.js';
import {
  createGatheringToolAvailability,
  matchGatheringTools
} from './gatheringToolRuntime.js';
import { createToolBreakageRuntime } from './toolBreakageRuntime.js';
import {
  getFabricateAppClass,
  getCraftingSystemManagerAppClass,
  getInteractableBrowserAppClass,
  getInteractableConfigAppClass
} from './ui/appFactory.js';
import { addInteractableSceneControl } from './ui/interactableSceneControl.js';
import { applyCurrentFabricateTheme } from './ui/theme.js';
import { findItemsDirectoryActionsContainer, syncGatheringDirectoryButton } from './ui/itemsDirectoryButtons.js';
import { registerFabricateSettings, getSetting, setSetting, SETTING_KEYS } from './config/settings.js';
import { MigrationRunner } from './migration/MigrationRunner.js';
import { ItemPilesIntegration } from './integrations/ItemPilesIntegration.js';
import { cleanupStalePreferences, isGatheringActorSelectableByUser } from './config/preferencesCleanup.js';
import { registerFragmentDiscoveryHook } from './systems/FragmentDiscoveryHook.js';
import { registerRecipeItemLearningHook } from './systems/RecipeItemLearningHook.js';
import { registerItemSheetRecipeLearnControl } from './ui/ItemSheetRecipeLearnControl.js';
import { InteractableManager } from './canvas/InteractableManager.js';
import { handleInteractableSocketMessage, resolveInteractableNodeStateForRef } from './canvas/interactableSocketBridge.js';
import { respawnInteractableRegionBehaviors } from './canvas/regions/interactableRegionWorldTime.js';
import { registerInteractableRegionBehavior } from './canvas/regions/FabricateInteractableRegionBehavior.js';
import {
  assignInteractableConfigSheet,
  resolveInteractableConfigTarget,
  shouldOfferInteractableConfigEntry
} from './canvas/regions/interactableConfigSheet.js';
import * as CraftingSystemExporter from './systems/CraftingSystemExporter.js';
import './ui/SvelteFabricateApp.svelte.js';
import './ui/SvelteCraftingSystemManagerApp.svelte.js';
import './ui/InteractableBrowserApp.svelte.js';
import './ui/InteractionPromptApp.svelte.js';
import './ui/InteractableConfigApp.svelte.js';

let gatheringEngine = null;

/**
 * Resolve a stored gathering actor preference against Foundry's actor collection.
 *
 * @param {string} actorId Actor id from the client preference.
 * @returns {Actor|null} Resolved actor, or null when stale.
 */
function resolveGatheringActor(actorId) {
  return game.actors?.get?.(actorId) ?? null;
}

/**
 * Check whether the current user may select an actor for gathering.
 *
 * @param {Actor} actor Candidate gathering actor.
 * @returns {boolean} True when the actor is selectable by the current user.
 */
function isSelectableGatheringActor(actor) {
  return isGatheringActorSelectableByUser(actor, game.user);
}

const getGatheringSelectableActors = createGatheringSelectableActorsGetter({
  getActors: () => game.actors,
  getCurrentUser: () => game.user,
  isSelectable: isGatheringActorSelectableByUser
});

/**
 * The current dnd5e/pf2e implementation of the **player-character concept**.
 *
 * "Player character" is a concept: the actor type(s) a system designates as
 * player characters. This predicate is the documented seam for future
 * per-system extension/configuration. `'character'` is the dnd5e/pf2e actor
 * type and is NOT asserted as a universal truth — systems whose player-character
 * actor type differs are a known limitation of this iteration (their PCs will not
 * appear in the actor-selection bar), and re-pointing this predicate is the
 * intended extension point.
 *
 * @param {Actor} actor Candidate actor.
 * @returns {boolean} True when the actor is a player character.
 */
function isPlayerCharacterActor(actor) {
  return actor?.type === 'character';
}

/**
 * Selection predicate for the actor-selection top bar.
 *
 * Combines the ownership rule reused for gathering attempt authorization
 * (`isGatheringActorSelectableByUser`: player owns / GM sees all) AND the
 * player-character concept (`isPlayerCharacterActor`). This narrows the bar's
 * list to player characters WITHOUT modifying attempt authorization — an owned
 * non-player-character actor stays attempt-authorized but is absent from the bar.
 *
 * @param {object} payload
 * @param {Actor} payload.actor Candidate actor.
 * @param {User} payload.viewer Foundry user the selection is for.
 * @returns {boolean} True when the actor is a selectable player character.
 */
function isSelectableBarActor({ actor, viewer } = {}) {
  return isGatheringActorSelectableByUser(actor, viewer) && isPlayerCharacterActor(actor);
}

const getBarSelectableActors = createGatheringSelectableActorsGetter({
  getActors: () => game.actors,
  getCurrentUser: () => game.user,
  isSelectable: (actor, viewer) => isSelectableBarActor({ actor, viewer })
});

function getGatheringRunViewer({ run } = {}) {
  const userId = run?.userId;
  return game.users?.get?.(userId) ?? { id: userId ?? null, isGM: false };
}

function isCurrentWorldPaused() {
  return game.paused === true;
}

/**
 * Execute a gathering macro through the shared macro runner.
 *
 * @param {string} macroUuid Macro document UUID.
 * @param {object} context Gathering macro context.
 * @returns {Promise<*>} Macro result.
 */
async function runGatheringMacro(macroUuid, context = {}) {
  return MacroExecutor.run(macroUuid, context);
}

function createGatheringToolBreakage({ craftingSystemManager, evaluateExpression }) {
  return createToolBreakageRuntime({
    matchTools: ({ actor, system, task, tools = [], presentTools = null }) =>
      matchGatheringTools({ actor, system, task, tools, craftingSystemManager, presentTools }),
    buildItemRef: (actor, item) => gatheringRunItemRef(actor, item),
    resolveReplacementSource: ({ componentId, system }) =>
      resolveGatheringResultSource({ componentId, quantity: 1 }, system, craftingSystemManager),
    evaluateExpression
  });
}

function createGatheringResultResolver(resolutionModeService) {
  return {
    async resolveRouted({ provider, resultSelection, resultGroups = [] } = {}) {
      if (provider === 'macroOutcome') {
        try {
          return await runGatheringMacro(resultSelection?.macroUuid, { kind: 'gatheringOutcome', resultGroups });
        } catch (err) {
          console.error('Fabricate | Gathering routed-outcome macro failed:', err);
          return {
            status: 'misconfigured',
            diagnostics: [{ code: 'MACRO_OUTCOME_THREW', message: err?.message || 'Gathering outcome macro threw' }]
          };
        }
      }

      if (provider === 'rollTableOutcome') {
        const tableResult = await resolutionModeService.resolveByRollTable(
          { resultSelection },
          null,
          resultGroups
        );
        return normalizeGatheringRollTableOutcome(tableResult);
      }

      return {
        status: 'misconfigured',
        diagnostics: [{ code: 'UNSUPPORTED_RESULT_PROVIDER', message: `Unsupported gathering result provider "${provider}"` }]
      };
    }
  };
}

function createGatheringResultCreator(craftingSystemManager) {
  return {
    async plan({ actor, system, resultGroups = [] } = {}) {
      return flattenGatheringResults(resultGroups)
        .map(result => {
          const source = resolveGatheringResultSource(result, system, craftingSystemManager);
          return source ? gatheringRunItemRef(actor, source, result.quantity) : null;
        })
        .filter(Boolean);
    },

    async create({ actor, system, resultGroups = [] } = {}) {
      const created = [];
      for (const result of flattenGatheringResults(resultGroups)) {
        const source = resolveGatheringResultSource(result, system, craftingSystemManager);
        if (!source) continue;

        const itemData = source.toObject?.() ?? {
          name: source.name ?? 'Gathered Item',
          img: source.img ?? 'icons/svg/item-bag.svg',
          type: source.type ?? 'loot',
          system: source.system ? globalThis.foundry?.utils?.deepClone?.(source.system) ?? { ...source.system } : {}
        };
        itemData.system ??= {};
        if (itemData.system.quantity !== undefined || result.quantity) {
          itemData.system.quantity = Number(result.quantity || 1);
        }
        if (source.uuid) {
          globalThis.foundry?.utils?.setProperty?.(itemData, 'flags.core.sourceId', source.uuid);
        }

        // Stack onto an existing matching item (same source UUID chain) that uses
        // a quantity field, rather than creating a duplicate document.
        const existing = findStackableMatch(normalizeFoundryCollection(actor.items), source);
        if (existing) {
          const next = Number(existing.system?.quantity || 0) + Number(result.quantity || 1);
          await existing.update({ 'system.quantity': next });
          created.push(gatheringRunItemRef(actor, existing, result.quantity));
          continue;
        }

        const [item] = await actor.createEmbeddedDocuments('Item', [itemData]);
        if (item) created.push(gatheringRunItemRef(actor, item, result.quantity));
      }
      return created;
    }
  };
}

function createGatheringFailureFeedback() {
  return {
    async apply({ failureOutcome, actor, viewer, system, environment, task, outcome, checkResult } = {}) {
      if (failureOutcome?.mode === 'macro') {
        try {
          return await runGatheringMacro(failureOutcome.macroUuid, {
            kind: 'gatheringFailure',
            actor,
            viewer,
            system,
            environment,
            task,
            outcome,
            checkResult
          });
        } catch (err) {
          console.error('Fabricate | Gathering failure-feedback macro failed:', err);
          const fallback = game.i18n?.localize?.('FABRICATE.Gathering.FailureDefault') || 'Gathering produced no results.';
          ui.notifications?.warn?.(fallback);
          return { message: fallback, error: err?.message || 'Macro threw' };
        }
      }
      const message = failureOutcome?.text || game.i18n?.localize?.('FABRICATE.Gathering.FailureDefault') || 'Gathering produced no results.';
      ui.notifications?.warn?.(message);
      return { message };
    }
  };
}

function fabricateEscapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));
}

function hazardScenePromptText(key, fallback, data) {
  const i18n = game?.i18n;
  if (!i18n) return fallback;
  if (data) return i18n.format?.(key, data) ?? fallback;
  const out = i18n.localize?.(key);
  return out && out !== key ? out : fallback;
}

// GM-side prompt: choose which active players to pull to a dropped hazard's
// linked scene. The GM also views the scene; selected players are pulled via
// the module socket. Lives here (not the engine) because it is Foundry glue.
async function showHazardScenePrompt({ sceneUuid, hazardName } = {}) {
  const scene = typeof fromUuid === 'function' ? await fromUuid(sceneUuid) : null;
  if (!scene) {
    ui.notifications?.warn?.(hazardScenePromptText(
      'FABRICATE.Admin.Manager.Environment.Hazards.HazardScenePrompt.Missing',
      'The hazard\'s linked scene could not be found.'
    ));
    return;
  }
  const sceneName = scene.name || sceneUuid;
  const players = Array.from(game.users?.contents || []).filter(user => user?.active && !user?.isGM);
  const intro = hazardScenePromptText(
    'FABRICATE.Admin.Manager.Environment.Hazards.HazardScenePrompt.Intro',
    `${hazardName || 'A hazard'} dropped. Move players to ${sceneName}?`,
    { hazard: hazardName || 'A hazard', scene: sceneName }
  );
  const rows = players.length === 0
    ? `<p class="notes">${fabricateEscapeHtml(hazardScenePromptText('FABRICATE.Admin.Manager.Environment.Hazards.HazardScenePrompt.NoPlayers', 'No active players to move.'))}</p>`
    : players.map(user => `<label style="display:flex;align-items:center;gap:6px;"><input type="checkbox" class="fab-pull-player" value="${fabricateEscapeHtml(user.id)}" checked /> ${fabricateEscapeHtml(user.name)}</label>`).join('');
  const content = `<div style="display:flex;flex-direction:column;gap:6px;"><p>${fabricateEscapeHtml(intro)}</p>${rows}</div>`;
  renderDialog({
    title: hazardScenePromptText('FABRICATE.Admin.Manager.Environment.Hazards.HazardScenePrompt.Title', 'Hazard struck'),
    content,
    default: 'move',
    buttons: {
      move: {
        label: hazardScenePromptText('FABRICATE.Admin.Manager.Environment.Hazards.HazardScenePrompt.Move', 'Move players'),
        callback: (html) => {
          const root = html?.[0] ?? html;
          const userIds = root
            ? Array.from(root.querySelectorAll('.fab-pull-player:checked')).map(input => input.value)
            : [];
          void viewScene(sceneUuid);
          if (userIds.length > 0) {
            game.socket?.emit(HAZARD_SCENE_SOCKET, { action: 'pullToScene', sceneUuid, userIds });
          }
        }
      },
      cancel: {
        label: hazardScenePromptText('FABRICATE.Admin.Manager.Environment.Hazards.HazardScenePrompt.Cancel', 'Cancel')
      }
    }
  });
}

function normalizeGatheringRollTableOutcome(tableResult) {
  const disposition = tableResult?.meta?.disposition;
  if (disposition === 'success') {
    return { status: 'succeeded', resultGroups: tableResult.groups ?? [], checkResult: tableResult.meta };
  }
  if (disposition === 'fail' || disposition === 'miss') {
    return { status: 'failed', resultGroups: [], checkResult: tableResult.meta };
  }
  return {
    status: 'misconfigured',
    diagnostics: [{ code: 'ROLL_TABLE_OUTCOME_FAILED', message: tableResult?.meta?.error || 'Gathering roll table did not resolve an outcome' }]
  };
}

function flattenGatheringResults(resultGroups = []) {
  return resultGroups.flatMap(group => Array.isArray(group?.results) ? group.results : []);
}

function resolveGatheringResultSource(result, system, craftingSystemManager) {
  if (result?.itemUuid) return resolveUuidSync(result.itemUuid);
  const componentId = result?.componentId || result?.systemItemId;
  const component = (system?.components ?? []).find(entry => entry.id === componentId)
    ?? craftingSystemManager?.getSystem?.(system?.id)?.components?.find(entry => entry.id === componentId)
    ?? null;
  if (!component) return null;
  if (component.sourceUuid) return resolveUuidSync(component.sourceUuid) ?? component;
  return component;
}

function resolveUuidSync(uuid) {
  if (!uuid || typeof globalThis.fromUuidSync !== 'function') return null;
  try {
    return globalThis.fromUuidSync(uuid) ?? null;
  } catch (_err) {
    return null;
  }
}

function normalizeFoundryCollection(collection) {
  if (!collection) return [];
  if (Array.isArray(collection)) return collection;
  if (Array.isArray(collection.contents)) return collection.contents;
  if (typeof collection.values === 'function') return Array.from(collection.values());
  if (typeof collection[Symbol.iterator] === 'function') return Array.from(collection);
  return [];
}

function gatheringRunItemRef(actor, item, quantity = 1) {
  return {
    actorUuid: actor?.uuid ?? null,
    itemUuid: item?.uuid ?? item?.sourceUuid ?? null,
    quantity: Number.isFinite(Number(quantity)) && Number(quantity) > 0 ? Number(quantity) : 1
  };
}

function localizeGathering(key, data = {}) {
  return game.i18n?.format?.(key, data) ?? game.i18n?.localize?.(key) ?? key;
}

/**
 * Evaluate a dice expression to its integer total via Foundry's `Roll`, returning
 * 0 when `Roll` is unavailable or the expression is invalid. Shared by the per-tile
 * and per-region interactable respawn passes.
 *
 * @param {string} expression
 * @returns {number}
 */
function rollExpressionTotal(expression) {
  const RollClass = globalThis.Roll;
  if (typeof RollClass !== 'function') return 0;
  try {
    const roll = new RollClass(String(expression || ''));
    roll?.evaluateSync?.();
    return Number(roll?.total ?? 0);
  } catch (_err) {
    return 0;
  }
}

/**
 * Dispatch startup/updateWorldTime processing for crafting, salvage, and gathering.
 *
 * Gathering timed completion is delegated to the module-internal GatheringEngine;
 * the raw engine is intentionally not exposed through `game.fabricate`.
 *
 * @param {number} worldTime Current Foundry world time.
 * @returns {Promise<void[]>} Promise that settles after every guarded processor settles.
 */
function processFabricateWorldTime(worldTime = Number(game.time?.worldTime || 0)) {
  return Promise.all(processWorldTimeCallbacksSafely([
    {
      label: 'Crafting',
      callback: () => game.fabricate?.getCraftingRunManager?.()?.processWorldTime?.(worldTime)
    },
    {
      label: 'Salvage',
      callback: () => game.fabricate?.getCraftingEngine?.()?.processPendingSalvageRuns?.(worldTime)
    },
    {
      label: 'Gathering',
      callback: () => gatheringEngine?.processWorldTime?.(worldTime)
    },
    {
      // Region-first per-behaviour gathering node respawn for placed
      // `fabricate.interactable` Region Behaviours. Active-GM ONLY so connected
      // clients never double-apply (gate inside the pass; mirrors the engine's
      // per-environment respawn, which is primary-GM gated).
      label: 'InteractableRegions',
      callback: () => {
        return respawnInteractableRegionBehaviors({
          worldTime,
          isActiveGM: () => game.user === game.users?.activeGM,
          secondsPerUnit: (unit) => secondsPerUnitFromCalendar(unit, game.time?.calendar ?? null),
          rollExpression: (expression) => rollExpressionTotal(expression)
        });
      }
    }
  ]));
}

/**
 * Fabricate - Universal Crafting System
 * Main module entry point
 */

class Fabricate {
  constructor() {
    this.recipeManager = null;
    this.craftingEngine = null;
    this.craftingSystemManager = null;
    this.craftingRunManager = null;
    this.salvageRunManager = null;
    this.gatheringEnvironmentStore = null;
    this.gatheringRichStateService = null;
    this.gatheringRunManager = null;
    this.gatheringGateAndCheckEvaluator = null;
    this.recipeVisibilityService = null;
    this.resolutionModeService = null;
    this.itemPilesIntegration = null;
    this.compendiumImporter = null;
    this.ready = false;
  }

  /**
   * Initialize the module
   */
  async initialize() {
    console.log('Fabricate | Initializing...');

    // Register settings
    this.registerSettings();
    applyCurrentFabricateTheme(getSetting, SETTING_KEYS.THEME);
    // Run data migrations before managers load persisted data
    await this._runMigrations();
    // Create managers
    this.recipeManager = new RecipeManager();
    this.craftingSystemManager = new CraftingSystemManager(this.recipeManager);
    this.craftingRunManager = new CraftingRunManager();
    this.salvageRunManager = new SalvageRunManager();
    this.gatheringRunManager = new GatheringRunManager();
    this.gatheringGateAndCheckEvaluator = new GatheringGateAndCheckEvaluator({
      runMacro: runGatheringMacro,
      evaluateExpression: evaluateGatheringExpression
    });
    this.recipeVisibilityService = new RecipeVisibilityService(this.recipeManager, this.craftingSystemManager);
    this.resolutionModeService = new ResolutionModeService(this.craftingSystemManager);
    this.itemPilesIntegration = new ItemPilesIntegration();
    this.itemPilesIntegration.detect();
    this.compendiumImporter = new CompendiumImporter(this.craftingSystemManager, this.recipeManager);
    this.craftingEngine = new CraftingEngine(
      this.recipeManager,
      this.craftingRunManager,
      this.resolutionModeService,
      this.itemPilesIntegration,
      this.salvageRunManager
    );

    // Initialize recipe manager
    await this.recipeManager.initialize();
    await this.craftingSystemManager.initialize();
    this.gatheringEnvironmentStore = new GatheringEnvironmentStore({
      systemManager: this.craftingSystemManager,
      runCleanup: {
        removeRunsForSystem: (systemId) => this.gatheringRunManager.removeRunsForSystem(systemId),
        removeRunsForEnvironment: (environmentId) => this.gatheringRunManager.removeRunsForEnvironment(environmentId),
        removeRunsForTask: (taskId, options) => this.gatheringRunManager.removeRunsForTask(taskId, options)
      }
    });
    this.gatheringEnvironmentStore.load();
    this.gatheringRichStateService = new GatheringRichStateService({
      environmentStore: this.gatheringEnvironmentStore,
      getSetting,
      setSetting,
      settingKey: SETTING_KEYS.GATHERING_CONFIG,
      nowWorldTime: () => Number(game.time?.worldTime || 0),
      getUserId: () => game.user?.id || null,
      hooks: Hooks,
      evaluateExpression: evaluateGatheringExpression,
      runMacro: runGatheringMacro,
      // Calendar-aware regen/respawn intervals: day/week lengths track the active
      // Foundry V13 world calendar (falls back to the Earth table when none).
      // Resolved per call so a mid-session calendar reconfig is picked up.
      secondsPerUnit: (unit) => secondsPerUnitFromCalendar(unit, game.time?.calendar ?? null)
    });
    gatheringEngine = new GatheringEngine({
      environmentStore: this.gatheringEnvironmentStore,
      runManager: this.gatheringRunManager,
      richState: this.gatheringRichStateService,
      evaluator: this.gatheringGateAndCheckEvaluator,
      systemManager: this.craftingSystemManager,
      getSelectableActors: getGatheringSelectableActors,
      isActorSelectable: ({ actor, viewer }) => isGatheringActorSelectableByUser(actor, viewer),
      isGamePaused: isCurrentWorldPaused,
      sceneAccess: createGatheringSceneAccess({
        getCurrentUser: () => game.user,
        getCurrentScene: () => game.scenes?.current ?? game.scene ?? globalThis.canvas?.scene ?? null
      }),
      toolAvailability: createGatheringToolAvailability({
        craftingSystemManager: this.craftingSystemManager,
        evaluator: this.gatheringGateAndCheckEvaluator
      }),
      resultResolver: createGatheringResultResolver(this.resolutionModeService),
      resultCreator: createGatheringResultCreator(this.craftingSystemManager),
      toolBreakage: createGatheringToolBreakage({
        craftingSystemManager: this.craftingSystemManager,
        evaluateExpression: evaluateGatheringExpression
      }),
      failureFeedback: createGatheringFailureFeedback(),
      hazardSceneTrigger: createHazardSceneTrigger({
        isGM: () => !!game.user?.isGM,
        emitPrompt: ({ sceneUuid, hazardName }) => game.socket?.emit(HAZARD_SCENE_SOCKET, {
          action: 'hazardScenePrompt', sceneUuid, hazardName, requestedBy: game.user?.id
        }),
        showPrompt: showHazardScenePrompt
      }),
      getRunViewer: getGatheringRunViewer,
      // Rebuild a node adapter at TIMED-run maturity from the persisted ref, so an
      // `onSuccess` decrement lands on the authoritative node (via the GM socket),
      // not `environment.nodeRuntime[taskId]`. The resolver is widened to accept
      // either a legacy tile ref ({ sceneId, tileId }) or a region-behaviour ref
      // ({ sceneId, regionId, behaviorId }); the engine treats the ref as opaque,
      // so the seam name stays `resolveTileNodeState`.
      resolveTileNodeState: resolveInteractableNodeStateForRef,
      localize: localizeGathering
    });
    const validRecipes = new Set(this.recipeManager.getRecipes({}).map(r => r.id));
    const validSystems = new Set(this.craftingSystemManager.getSystems().map(s => s.id));
    const validSalvageComponentsBySystem = new Map(
      this.craftingSystemManager.getSystems().map(system => [
        system.id,
        new Set((system.components || []).map(component => component.id))
      ])
    );
    await this.craftingRunManager.cleanupInvalidRuns(validRecipes, validSystems);
    await this.salvageRunManager.cleanupInvalidRuns(validSystems, validSalvageComponentsBySystem);
    await this.recipeVisibilityService.cleanupLearnedRecipes(validRecipes);
    await cleanupStalePreferences(validSystems, validRecipes, getSetting, setSetting, {
      resolveGatheringActor,
      isSelectableGatheringActor
    });

    registerFragmentDiscoveryHook(this.craftingSystemManager, this.recipeVisibilityService);
    registerRecipeItemLearningHook(this.recipeVisibilityService);
    registerItemSheetRecipeLearnControl(this.recipeVisibilityService);

    this.ready = true;
    console.log('Fabricate | Ready');
  }

  /**
   * Run versioned startup data migrations via MigrationRunner.
   */
  async _runMigrations() {
    const runner = new MigrationRunner({ getSetting, setSetting });
    const summary = await runner.run();

    // One-time GM-facing notice: when the 0.6.0 migration actually converted catalysts into
    // shared library Tools, tell the GM (so they know where the catalyst data went). GM-only
    // and only when something was migrated; the pure migration stays free of edge effects.
    const migratedCount = Number(summary?.migratedCatalystCount || 0);
    if (migratedCount > 0 && game.user?.isGM) {
      const message = game.i18n?.format?.('FABRICATE.Migration.CatalystsToTools.Notice', { count: migratedCount })
        || `Fabricate migrated ${migratedCount} catalyst(s) to the Tools library. Find them under the Tools tab.`;
      ui.notifications?.info?.(message);
    }
  }

  /**
   * Register module settings
   */
  registerSettings() {
    registerFabricateSettings();
  }

  /**
   * Get the recipe manager instance
   */
  getRecipeManager() {
    return this.recipeManager;
  }

  /**
   * Get the crafting engine instance
   */
  getCraftingEngine() {
    return this.craftingEngine;
  }

  /**
   * Get the crafting system manager instance
   */
  getCraftingSystemManager() {
    return this.craftingSystemManager;
  }

  /**
   * Get the crafting run manager instance
   */
  getCraftingRunManager() {
    return this.craftingRunManager;
  }

  getSalvageRunManager() {
    return this.salvageRunManager;
  }

  /**
   * Get the gathering environment store.
   *
   * This exposes persisted environment management without exposing the
   * module-internal GatheringEngine.
   *
   * @returns {GatheringEnvironmentStore|null}
   */
  getGatheringEnvironmentStore() {
    return this.gatheringEnvironmentStore;
  }

  /**
   * Get the gathering run manager.
   *
   * @returns {GatheringRunManager|null}
   */
  getGatheringRunManager() {
    return this.gatheringRunManager;
  }

  /**
   * Get the gathering gate/check evaluator.
   *
   * @returns {GatheringGateAndCheckEvaluator|null}
   */
  getGatheringGateAndCheckEvaluator() {
    return this.gatheringGateAndCheckEvaluator;
  }

  getGatheringRichStateService() {
    return this.gatheringRichStateService;
  }

  /**
   * Get the recipe visibility service instance
   */
  getRecipeVisibilityService() {
    return this.recipeVisibilityService;
  }

  getResolutionModeService() {
    return this.resolutionModeService;
  }

  getItemPilesIntegration() {
    return this.itemPilesIntegration;
  }

  getCompendiumImporter() {
    return this.compendiumImporter;
  }

  /**
   * List gathering environments/tasks for the current user and selected actor.
   *
   * The internal GatheringEngine receives the current Foundry user as viewer,
   * regardless of any viewer supplied by the caller.
   *
   * When `options.rememberedActorId` is omitted (or otherwise absent), it
   * defaults to the persisted last-gathering selection
   * ({@link Fabricate#getSelectedGatheringActorId}) so a fresh listing honors
   * the remembered actor. An explicit `rememberedActorId` in `options` always
   * overrides that default (including an explicit `null`, which forces no
   * remembered actor). The engine resolves the id against its OWNERSHIP
   * selectable list, not the narrower player-character list used by the actor
   * selection bar, so a legacy persisted owned non-player-character id is still
   * honored for that fetch.
   *
   * @param {object} [options] Gathering listing options.
   * @param {string|null} [options.rememberedActorId] Actor id to list for;
   *   defaults to the persisted last-gathering selection when omitted.
   * @returns {*} Gathering listing result with attemptability metadata.
   */
  listGatheringForActor(options = {}) {
    if (!this.ready) {
      throw new Error('Fabricate not initialized');
    }

    // Default the remembered actor to the persisted last-gathering selection so
    // a fresh listing honors it; an explicit `rememberedActorId` in `options`
    // still overrides the persisted default. The engine resolves this id against
    // its OWNERSHIP selectable list (not the player-character list), so a legacy
    // persisted owned non-PC id is honored by the engine for that fetch; the bar
    // store converges it to a player character (see design convergence contract).
    const withRememberedActor = {
      rememberedActorId: this.getSelectedGatheringActorId() || null,
      ...options
    };

    return callGatheringRuntimeWithCurrentViewer(gatheringEngine, 'listForActor', withRememberedActor, () => game.user);
  }

  /**
   * List the actors the current user may select as a gathering actor in the
   * unified-window actor selection bar.
   *
   * Returns the user's selectable **player characters** — owned for non-GM
   * users, all for GMs, narrowed by the player-character concept
   * ({@link isPlayerCharacterActor}). The result is redaction-safe display data:
   * each record contains ONLY `{ id, uuid, name, img }` and no other actor
   * internals. This selection predicate is distinct from gathering attempt
   * authorization and does not expand it.
   *
   * @returns {Array<{id: string|null, uuid: string|null, name: string, img: string|null}>}
   */
  listSelectableActors() {
    this._requireReady();
    return getBarSelectableActors({ viewer: game.user }).map((actor) => ({
      id: actor?.id ?? actor?.uuid ?? null,
      uuid: actor?.uuid ?? null,
      name: actor?.name ?? '',
      img: actor?.img ?? null
    }));
  }

  /**
   * Read the persisted remembered gathering-actor selection.
   *
   * Reads the existing `LAST_GATHERING_ACTOR` client setting; no new key is
   * introduced. Returns an empty string when unset.
   *
   * @returns {string} The persisted actor id, or '' when unset.
   */
  getSelectedGatheringActorId() {
    return getSetting(SETTING_KEYS.LAST_GATHERING_ACTOR) || '';
  }

  /**
   * Persist the remembered gathering-actor selection.
   *
   * Writes the existing `LAST_GATHERING_ACTOR` client setting; no new key is
   * introduced.
   *
   * @param {string} id Actor id to persist.
   * @returns {*} The setSetting result.
   */
  setSelectedGatheringActorId(id) {
    return setSetting(SETTING_KEYS.LAST_GATHERING_ACTOR, id ?? '');
  }

  /**
   * Start a gathering attempt for the current user.
   *
   * The raw GatheringEngine remains module-internal so all public attempts use
   * current-user viewer enforcement.
   *
   * @param {object} options Gathering start-attempt options.
   * @returns {*} Gathering start-attempt result.
   */
  startGatheringAttempt(options = {}) {
    if (!this.ready) {
      throw new Error('Fabricate not initialized');
    }

    return callGatheringRuntimeWithCurrentViewer(gatheringEngine, 'startAttempt', options, () => game.user);
  }

  /**
   * Lazily compute the per-drop "What you might find" breakdown for one task the
   * player has opened in the gathering inspector. Defaults the remembered actor
   * to the persisted selection (explicit `rememberedActorId` overrides) and
   * enforces the current Foundry user as the viewer.
   *
   * @param {object} options { environmentId, taskId, rememberedActorId? }
   * @returns {*} Drop-breakdown result ({ resolutionMode, awardMode, awardLimit, hazardPolicy, drops }).
   */
  getGatheringDropBreakdown(options = {}) {
    if (!this.ready) {
      throw new Error('Fabricate not initialized');
    }

    const withRememberedActor = {
      rememberedActorId: this.getSelectedGatheringActorId() || null,
      ...options
    };

    return callGatheringRuntimeWithCurrentViewer(gatheringEngine, 'getTaskDropBreakdown', withRememberedActor, () => game.user);
  }

  inspectGatheringEnvironmentState(options = {}) {
    this._requireReady();
    this._requireGM();
    return this.gatheringRichStateService?.inspectEnvironment(options.environmentId) ?? null;
  }

  restockGatheringNode(options = {}) {
    this._requireReady();
    this._requireGM();
    return this.gatheringRichStateService?.restockNode(options);
  }

  updateGatheringConditions(options = {}) {
    this._requireReady();
    this._requireGM();
    return this.gatheringRichStateService?.updateConditions(options);
  }

  /**
   * Read current gathering conditions and configured tag vocabularies.
   *
   * This public API is safe for player-facing callers. It exposes global
   * weather/time-of-day state and available gathering tags, but not GM-only
   * library internals.
   *
   * @returns {{weather: string, timeOfDay: string, vocabularies: object}|undefined}
   */
  getGatheringConditions() {
    this._requireReady();
    return this.gatheringRichStateService?.getConditions();
  }

  /**
   * Set the current global gathering weather tag.
   *
   * @param {string} weatherTag Configured weather tag.
   * @returns {*} Updated gathering conditions.
   */
  setGatheringWeather(weatherTag) {
    this._requireReady();
    this._requireGM();
    return this.gatheringRichStateService?.setWeather(weatherTag);
  }

  /**
   * Set the current global gathering time-of-day tag.
   *
   * @param {string} timeOfDayTag Configured time-of-day tag.
   * @returns {*} Updated gathering conditions.
   */
  setGatheringTimeOfDay(timeOfDayTag) {
    this._requireReady();
    this._requireGM();
    return this.gatheringRichStateService?.setTimeOfDay(timeOfDayTag);
  }

  /**
   * Atomically update global gathering conditions.
   *
   * Omitted fields keep their current values. Mutations require a GM user,
   * validate tags through the rich state service, persist the setting, and
   * dispatch the gathering condition update hook.
   *
   * @param {{weather?: string, timeOfDay?: string}} conditions Condition updates.
   * @returns {*} Updated gathering conditions.
   */
  setGatheringConditions(conditions = {}) {
    this._requireReady();
    this._requireGM();
    return this.gatheringRichStateService?.setConditions(conditions);
  }

  setGatheringStamina(options = {}) {
    this._requireReady();
    this._requireGM();
    const actor = options.actor || (options.actorId ? game.actors?.get(options.actorId) : null);
    return this.gatheringRichStateService?.setActorStamina(actor, options);
  }

  adjustGatheringStamina(options = {}) {
    this._requireReady();
    this._requireGM();
    const actor = options.actor || (options.actorId ? game.actors?.get(options.actorId) : null);
    return this.gatheringRichStateService?.adjustActorStamina(actor, options);
  }

  /**
   * Read a crafting system's gathering economy block (mode + stamina regen).
   * Player-safe — the mode and regen cadence are surfaced in the player UI.
   *
   * @param {{systemId: string}} options
   * @returns {{mode: string, stamina: {regen: object}}|null}
   */
  getGatheringEconomy(options = {}) {
    this._requireReady();
    return this.gatheringRichStateService?.systemEconomy(options.systemId) ?? null;
  }

  /**
   * Set a crafting system's gathering economy block. GM-only.
   *
   * @param {{systemId: string, economy: object}} options
   * @returns {Promise<object|null>} The normalized economy block.
   */
  setGatheringEconomy(options = {}) {
    this._requireReady();
    this._requireGM();
    return this.gatheringRichStateService?.setSystemEconomy(options);
  }

  /**
   * List the stamina pools of player-owned actors for one crafting system, for
   * the GM "Gathering State" panel. GM-only.
   *
   * @param {{systemId: string}} options
   * @returns {Array<{actorId: string, name: string, img: string, current: number|null, max: number|null, provider: string}>}
   */
  getGatheringStaminaState(options = {}) {
    this._requireReady();
    this._requireGM();
    const systemId = options.systemId;
    const service = this.gatheringRichStateService;
    if (!service || !systemId) return [];
    // Characters only — exclude NPCs (and other non-character actor types). A
    // character with no rolled pool yet reports max: null (the panel offers Roll).
    return Array.from(game.actors?.contents ?? [])
      .filter(actor => actor?.type === 'character')
      .map(actor => {
        const stamina = service.getActorStamina(actor, systemId);
        return { actorId: actor.id, name: actor.name, img: actor.img, ...stamina };
      });
  }

  /**
   * (Re)roll a character's stamina pool from the system max/start expression
   * templates and persist it. GM-only; used by the panel's Roll/Reset control.
   *
   * @param {{systemId: string, actorId: string}} options
   * @returns {Promise<object|null>} The materialized pool, or null.
   */
  rollGatheringStamina(options = {}) {
    this._requireReady();
    this._requireGM();
    const actor = options.actor || (options.actorId ? game.actors?.get(options.actorId) : null);
    if (!actor) return null;
    return this.gatheringRichStateService?.seedActorStaminaIfNeeded({ actor, systemId: options.systemId, force: true });
  }

  revealGatheringTask(options = {}) {
    this._requireReady();
    this._requireGM();
    return this.gatheringRichStateService?.revealTask(options.actor, options);
  }

  clearGatheringTaskReveal(options = {}) {
    this._requireReady();
    this._requireGM();
    return this.gatheringRichStateService?.clearReveal(options.actor, options);
  }

  _requireReady() {
    if (!this.ready) throw new Error('Fabricate not initialized');
  }

  _requireGM() {
    if (game.user?.isGM !== true) throw new Error('Gathering rich state changes require a GM user');
  }

  /**
   * Quick craft helper - craft a recipe for an actor
   * @param {Actor} actor - The actor performing the craft
   * @param {string|Recipe} recipe - Recipe ID or Recipe object
   * @param {Object} options - Crafting options
   */
  async craft(actor, recipe, options = {}) {
    if (!this.ready) {
      throw new Error('Fabricate not initialized');
    }

    // Get recipe object if ID was provided
    if (typeof recipe === 'string') {
      recipe = this.recipeManager.getRecipe(recipe);
      if (!recipe) {
        throw new Error(`Recipe ${recipe} not found`);
      }
    }

    const componentSourceActors = Array.isArray(options.componentSourceActors)
      ? options.componentSourceActors.filter(Boolean)
      : [actor];

    const ingredientSetId = options.ingredientSetId || null;

    return await this.craftingEngine.craft(
      actor,
      componentSourceActors,
      recipe,
      ingredientSetId,
      options
    );
  }

  /**
   * Delete a recipe by ID.
   * @param {string} recipeId - The recipe ID to delete
   */
  async deleteRecipe(recipeId) {
    if (!this.ready) {
      throw new Error('Fabricate not initialized');
    }

    return await this.recipeManager.deleteRecipe(recipeId);
  }
}

// Create global instance
const fabricate = new Fabricate();

// Hook into Foundry's initialization
Hooks.once('init', async () => {
  console.log('Fabricate | Init Hook');

  // Register the region-first `fabricate.interactable` Region Behaviour data model
  // + its type icon/label. Defensive + idempotent: no-ops when the Foundry region
  // APIs are unavailable (e.g. an older core), so it is safe to call unconditionally.
  registerInteractableRegionBehavior(CONFIG);

  // Register the rich GM config panel as the config sheet for the
  // `fabricate.interactable` RegionBehavior subtype (V13). Resolved defensively
  // via globalThis — a no-op when the DocumentSheetConfig / RegionBehavior API
  // shape differs, so it never throws into init.
  try {
    const DocumentSheetConfig = foundry?.applications?.apps?.DocumentSheetConfig
      ?? globalThis.DocumentSheetConfig;
    const RegionBehavior = foundry?.documents?.RegionBehavior
      ?? CONFIG?.RegionBehavior?.documentClass
      ?? globalThis.RegionBehavior;
    assignInteractableConfigSheet({
      registrar: DocumentSheetConfig,
      RegionBehavior,
      SheetClass: getInteractableConfigAppClass()
    });
  } catch (_error) {
    // Defensive: a sheet-registration shape mismatch must not break init.
  }

  // Make API available globally
  game.fabricate = fabricate;
  // Expose the canvas interactable manager singleton so the region behaviour event
  // handlers (`FabricateInteractableRegionBehavior.static events`) can resolve
  // `game.fabricate.interactableManager` to dispatch onRegionEnter/onRegionExit.
  // The handler bodies are added in Phase 1c; the reference must resolve now.
  game.fabricate.interactableManager = InteractableManager.instance;
  game.fabricate.gathering = {
    getConditions: () => fabricate.getGatheringConditions(),
    setWeather: (weatherTag) => fabricate.setGatheringWeather(weatherTag),
    setTimeOfDay: (timeOfDayTag) => fabricate.setGatheringTimeOfDay(timeOfDayTag),
    setConditions: (conditions) => fabricate.setGatheringConditions(conditions)
  };

  // Expose classes for advanced users
  game.fabricate.api = {
    Recipe,
    Ingredient,
    IngredientGroup,
    RecipeManager,
    CraftingEngine,
    getFabricateAppClass,
    getCraftingSystemManagerAppClass,
    CraftingSystemManager,
    CraftingRunManager,
    SalvageRunManager,
    GatheringEnvironmentStore,
    GatheringRunManager,
    GatheringGateAndCheckEvaluator,
    GatheringEngine,
    RecipeVisibilityService,
    ResolutionModeService,
    SignatureValidator,
    ItemPilesIntegration,
    CompendiumImporter,
    CraftingSystemExporter
  };

  game.fabricate.importFromPack = (packData, options) =>
    fabricate.compendiumImporter?.importFromPackData(packData, options);
  game.fabricate.getCompendiumImporter = () => fabricate.compendiumImporter;

  game.fabricate.exportSystem = (systemId) => {
    const systemManager = fabricate.craftingSystemManager;
    const recipeManager = fabricate.recipeManager;
    if (!systemManager || !recipeManager) throw new Error('Fabricate not initialized');
    const system = systemManager.getSystem(systemId);
    if (!system) throw new Error(`System "${systemId}" not found`);
    const recipes = recipeManager.getRecipes({ craftingSystemId: systemId }).map(r => r.toJSON());
    const version = game.modules?.get('fabricate')?.version || '0.0.0';
    return CraftingSystemExporter.buildExportPayload(system, recipes, version);
  };

  game.fabricate.importSystemFromFile = async (file, options = {}) => {
    const text = typeof file === 'string' ? file : await file.text();
    const data = JSON.parse(text);
    const validation = CraftingSystemExporter.validateImportData(data);
    if (!validation.valid) throw new Error(`Invalid import data: ${validation.errors.join('; ')}`);
    const mode = options.copyMode ? 'copy' : 'keep';
    const packData = CraftingSystemExporter.prepareForImport(data, mode);
    return fabricate.compendiumImporter.importFromPackData(packData, {
      overwriteExisting: options.overwriteExisting || false
    });
  };

});

// Hook into Foundry's ready event
Hooks.once('ready', async () => {
  await fabricate.initialize();
  await processFabricateWorldTime();

  // Wire the canvas Interactable foundation (drop interception + double-click
  // dispatch). Idempotent — register() no-ops on repeat calls.
  InteractableManager.instance.register();

  game.socket?.on(HAZARD_SCENE_SOCKET, (payload) => {
    routeHazardSceneSocketMessage(payload, {
      currentUserId: () => game.user?.id,
      isActiveGM: () => game.user === game.users?.activeGM,
      showPrompt: showHazardScenePrompt,
      viewSceneForSelf: (uuid) => viewScene(uuid)
    });
    // Same `module.fabricate` channel also carries the canvas Interactable
    // node-update action (player → active GM token-flag write) AND the region-first
    // activation round-trip. Only the active GM applies node/behaviour writes +
    // validates activation; only the targeted user opens a granted session. The
    // validate/grant + open bodies are the manager's region-first activation seams.
    handleInteractableSocketMessage(payload, {
      validateAndGrant: (request) => InteractableManager.instance.validateAndGrant(request),
      openGrant: (grant) => InteractableManager.instance.openGrant(grant)
    });
  });

  addModuleButtonsToItemsDirectory();
  Hooks.on('fabricate.craftingSystemsChanged', () => addModuleButtonsToItemsDirectory());
  Hooks.on('renderItemDirectory', () => addModuleButtonsToItemsDirectory());
  Hooks.on('updateItem', (item, changes) => {
    void fabricate.craftingSystemManager?.refreshComponentMetadataForUpdatedItem(item, changes);
  });

  Hooks.callAll('fabricate.ready');
});

Hooks.on('updateWorldTime', (worldTime) => {
  void processFabricateWorldTime(worldTime);
});

// GM-only scene-control button (Phase 7): adds a Fabricate control group whose
// single button launches the Interactable browser app. Foundry V13 passes
// `controls` as an OBJECT-of-controls (keyed record), NOT the pre-V13 array; the
// pure `addInteractableSceneControl` seam mutates that record. The hook body
// here is the thin edge supplying the GM gate, the localizer, and the launch
// callback.
Hooks.on('getSceneControlButtons', (controls) => {
  addInteractableSceneControl(controls, {
    isGM: game.user?.isGM === true,
    onClick: () => getInteractableBrowserAppClass().show(),
    localize: (key, fallback) => {
      const out = game.i18n?.localize?.(key);
      return out && out !== key ? out : fallback;
    }
  });
});

// GM-only discoverability (Phase 2): a "Configure Fabricate Interactable" button
// on the Tile HUD for a tile that is a Fabricate interactable visual. It resolves
// the owning behaviour from the tile's reverse linked-visual flags and opens the
// rich config panel. The pure gate + target resolution live in
// `interactableConfigSheet.js`; this hook body is the thin Foundry edge.
Hooks.on('renderTileHUD', (hud, element) => {
  try {
    const tile = hud?.object?.document ?? hud?.document ?? null;
    if (!shouldOfferInteractableConfigEntry(tile, { isGM: game.user?.isGM === true })) return;

    const target = resolveInteractableConfigTarget(tile, {
      resolveRegion: (regionUuid) => {
        const region = fromUuidSync?.(regionUuid) ?? null;
        const regionId = region?.id ?? region?._id ?? null;
        const sceneId = region?.parent?.id ?? region?.parent?._id ?? null;
        return regionId && sceneId ? { sceneId, regionId } : null;
      }
    });
    if (!target) return;

    const root = element instanceof HTMLElement ? element : element?.[0] ?? null;
    const column = root?.querySelector?.('.col.left') ?? root?.querySelector?.('.col') ?? root;
    if (!column?.appendChild) return;

    const label = (() => {
      const out = game.i18n?.localize?.('FABRICATE.Canvas.Interactable.Config.OpenFromTile');
      return out && out !== 'FABRICATE.Canvas.Interactable.Config.OpenFromTile'
        ? out
        : 'Configure Fabricate Interactable';
    })();

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'control-icon fabricate-interactable-config-hud';
    button.title = label;
    button.setAttribute('aria-label', label);
    button.innerHTML = '<i class="fas fa-sliders"></i>';
    button.addEventListener('click', (event) => {
      event.preventDefault();
      void getInteractableConfigAppClass().show(target);
    });
    column.appendChild(button);
  } catch (_error) {
    // Defensive: a HUD augmentation must never throw into Foundry's render.
  }
});

// GM-only discoverability (Phase 5): the same "Configure Fabricate Interactable"
// button on the Token HUD for a Token that is a linked Fabricate interactable
// visual (`linkedVisual.documentName:'Token'`). The Token carries the SAME reverse
// linked-visual flags as a Tile/Drawing, so the pure gate + target resolution from
// `interactableConfigSheet.js` generalize unchanged — only the host HUD differs.
// This NEVER touches the token's actor: it only opens the behaviour config panel.
Hooks.on('renderTokenHUD', (hud, element) => {
  try {
    const token = hud?.object?.document ?? hud?.document ?? null;
    if (!shouldOfferInteractableConfigEntry(token, { isGM: game.user?.isGM === true })) return;

    const target = resolveInteractableConfigTarget(token, {
      resolveRegion: (regionUuid) => {
        const region = fromUuidSync?.(regionUuid) ?? null;
        const regionId = region?.id ?? region?._id ?? null;
        const sceneId = region?.parent?.id ?? region?.parent?._id ?? null;
        return regionId && sceneId ? { sceneId, regionId } : null;
      }
    });
    if (!target) return;

    const root = element instanceof HTMLElement ? element : element?.[0] ?? null;
    const column = root?.querySelector?.('.col.left') ?? root?.querySelector?.('.col') ?? root;
    if (!column?.appendChild) return;

    const label = (() => {
      const out = game.i18n?.localize?.('FABRICATE.Canvas.Interactable.Config.OpenFromToken');
      return out && out !== 'FABRICATE.Canvas.Interactable.Config.OpenFromToken'
        ? out
        : 'Configure Fabricate Interactable';
    })();

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'control-icon fabricate-interactable-config-hud';
    button.title = label;
    button.setAttribute('aria-label', label);
    button.innerHTML = '<i class="fas fa-sliders"></i>';
    button.addEventListener('click', (event) => {
      event.preventDefault();
      void getInteractableConfigAppClass().show(target);
    });
    column.appendChild(button);
  } catch (_error) {
    // Defensive: a HUD augmentation must never throw into Foundry's render.
  }
});

/**
 * System-agnostic crafting button integration
 * Add Craft button to Items Directory sidebar (works with all game systems)
 */

/**
 * Add the Craft button to Items Directory header
 * Since sidebar is already rendered at module init, we inject directly
 */
function addModuleButtonsToItemsDirectory() {
  const itemsDir = ui.items;
  if (!itemsDir?.element) {
    console.error('Fabricate | Items directory not found or not rendered');
    return;
  }

  const header = itemsDir.element.querySelector('.directory-header, header');
  if (!header) {
    console.error('Fabricate | Items directory header not found');
    return;
  }

  const actionsContainer = findItemsDirectoryActionsContainer(itemsDir, document);
  if (!actionsContainer) {
    console.error('Fabricate | Items directory actions container not found');
    return;
  }

  // Add craft button for all users
  const craftExists = Array.from(actionsContainer.querySelectorAll('button.create-document'))
    .some(btn =>
      btn.dataset.fabricateAction === 'craft' ||
      btn.textContent?.includes('Craft Item')
    );
  if (!craftExists) {
    const craftButton = createHeaderButton('Craft Item', 'fas fa-hammer', 'craft', () => getFabricateAppClass().show('crafting'));
    actionsContainer.insertBefore(craftButton, actionsContainer.firstChild);
  }

  syncGatheringDirectoryButton({
    itemsDirectory: itemsDir,
    enabled: hasGatheringEnabledSystems(),
    createButton: () => createHeaderButton('Gathering', 'fas fa-leaf', 'gathering', () => getFabricateAppClass().show('gathering')),
    documentRef: document
  });

  // Add recipe manager button for GMs only
  if (game.user?.isGM) {
    const managerExists = Array.from(actionsContainer.querySelectorAll('button.create-document'))
      .some(btn =>
        btn.dataset.fabricateAction === 'manage' ||
        btn.textContent?.includes('Manage Crafting Systems')
      );
    if (!managerExists) {
      const managerButton = createHeaderButton(
        'Manage Crafting Systems',
        'fas fa-book',
        'manage',
        () => getCraftingSystemManagerAppClass().show()
      );
      actionsContainer.insertBefore(managerButton, actionsContainer.firstChild);
    }
  }
}

function hasGatheringEnabledSystems() {
  const systems = game.fabricate?.getCraftingSystemManager?.()?.getSystems?.() ?? [];
  return Array.from(systems).some(system => system?.features?.gathering === true);
}

/**
 * Create a sidebar header button that matches Foundry style
 * @private
 */
function createHeaderButton(labelText, iconClass, actionId, onClick) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'create-document';
  button.dataset.tooltip = labelText;
  button.dataset.fabricateAction = actionId;
  button.setAttribute('aria-label', labelText);

  const icon = document.createElement('i');
  icon.className = iconClass;
  button.appendChild(icon);

  const label = document.createElement('span');
  label.textContent = labelText;
  button.appendChild(label);

  button.addEventListener('click', (event) => {
    event.preventDefault();
    onClick();
  });

  return button;
}

// Chat command for quick crafting (for testing)
Hooks.on('chatMessage', (chatLog, message, chatData) => {
  // Check for /craft command
  if (message.startsWith('/craft')) {
    const parts = message.split(' ');
    if (parts.length < 2) {
      ui.notifications.warn('Usage: /craft <recipe-name>');
      return false;
    }

    const recipeName = parts.slice(1).join(' ');
    const actor = game.user.character;

    if (!actor) {
      ui.notifications.error('No character selected');
      return false;
    }

    // Find recipe by name
    const recipes = fabricate.recipeManager.getRecipes({ search: recipeName });
    if (recipes.length === 0) {
      ui.notifications.error(`Recipe "${recipeName}" not found`);
      return false;
    }

    const recipe = recipes[0];

    // Attempt to craft
    fabricate.craft(actor, recipe).then(result => {
      if (result.success) {
        ui.notifications.info(result.message);
      } else {
        ui.notifications.error(result.message);
      }
    }).catch(err => {
      ui.notifications.error(err.message);
      console.error('Fabricate | Crafting error:', err);
    });

    return false; // Prevent the message from being sent to chat
  }
});

// Macro helper
globalThis.fabricate = {
  /**
   * Create a simple recipe
   * @example
   * fabricate.createSimpleRecipe('Iron Sword', [
   *   { itemId: 'ironIngot', quantity: 2 },
   *   { itemId: 'wood', quantity: 1 }
   * ], { itemId: 'ironSword', quantity: 1 });
   */
  createSimpleRecipe: async (name, ingredients, result) => {
    const { Recipe } = game.fabricate.api;
    const recipe = Recipe.createSimple(name, ingredients, result);
    return await game.fabricate.getRecipeManager().createRecipe(recipe.toJSON());
  },

  /**
   * Craft an item
   * @example
   * fabricate.craft(game.user.character, 'recipeId');
   */
  craft: async (actor, recipeId, options) => {
    return await game.fabricate.craft(actor, recipeId, options);
  },

  /**
   * List all recipes
   */
  listRecipes: (filters = {}) => {
    return game.fabricate.getRecipeManager().getRecipes(filters);
  },

  /**
   * Delete a recipe by ID
   */
  deleteRecipe: async (recipeId) => {
    return await game.fabricate.deleteRecipe(recipeId);
  },

  /**
   * Get recipes available to an actor
   */
  getAvailableRecipes: (actorOrActors) => {
    const actors = Array.isArray(actorOrActors) ? actorOrActors : [actorOrActors];
    return game.fabricate.getRecipeManager().getAvailableRecipes(actors.filter(Boolean));
  },

  /**
   * Open the GM crafting system manager
   */
  openRecipeManager: () => {
    return getCraftingSystemManagerAppClass().show();
  },

  /**
   * List crafting systems
   */
  listCraftingSystems: () => {
    return game.fabricate.getCraftingSystemManager().getSystems();
  },

  exportSystem: (systemId) => {
    return game.fabricate.exportSystem(systemId);
  },

  importSystemFromFile: async (file, options) => {
    return game.fabricate.importSystemFromFile(file, options);
  }
};

export const __test = {
  createGatheringToolAvailability,
  createGatheringToolBreakage,
  matchGatheringTools
};

export default fabricate;
