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
import { GatheringEngine } from './systems/GatheringEngine.js';
import { RecipeVisibilityService } from './systems/RecipeVisibilityService.js';
import { ResolutionModeService } from './systems/ResolutionModeService.js';
import { SignatureValidator } from './systems/SignatureValidator.js';
import { Recipe } from './models/Recipe.js';
import { Ingredient } from './models/Ingredient.js';
import { IngredientGroup } from './models/IngredientGroup.js';
import { Catalyst } from './models/Catalyst.js';
import { MacroExecutor } from './utils/MacroExecutor.js';
import {
  callGatheringRuntimeWithCurrentViewer,
  createGatheringSelectableActorsGetter,
  evaluateGatheringExpression,
  processWorldTimeCallbacksSafely,
} from './gatheringBootstrapAdapters.js';
import {
  getCraftingAppClass,
  getGatheringAppClass,
  getCraftingSystemManagerV2AppClass,
  getRecipeManagerAppClass,
  getRecipeEditorAppClass
} from './ui/appFactory.js';
import { findItemsDirectoryActionsContainer, syncGatheringDirectoryButton } from './ui/itemsDirectoryButtons.js';
import { registerFabricateSettings, getSetting, setSetting, SETTING_KEYS } from './config/settings.js';
import { MigrationRunner } from './migration/MigrationRunner.js';
import { ItemPilesIntegration } from './integrations/ItemPilesIntegration.js';
import { cleanupStalePreferences, isGatheringActorSelectableByUser } from './config/preferencesCleanup.js';
import { importStarterPack } from './starter/importStarterPack.js';
import { registerFragmentDiscoveryHook } from './systems/FragmentDiscoveryHook.js';
import { registerRecipeItemLearningHook } from './systems/RecipeItemLearningHook.js';
import { registerItemSheetRecipeLearnControl } from './ui/ItemSheetRecipeLearnControl.js';
import * as CraftingSystemExporter from './systems/CraftingSystemExporter.js';
import './ui/SvelteCraftingApp.svelte.js';
import './ui/SvelteGatheringApp.svelte.js';
import './ui/SvelteRecipeManagerApp.svelte.js';
import './ui/SvelteCraftingSystemManagerV2App.svelte.js';
import './ui/SvelteRecipeEditorApp.svelte.js';

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

/**
 * Enforce scene-linked gathering access.
 *
 * Scene links are attemptability gates rather than listing filters: failures
 * return a blocked result so the player app can show a localized reason.
 *
 * @param {object} payload
 * @param {object} payload.environment Gathering environment.
 * @param {Actor} payload.actor Acting actor.
 * @returns {Promise<{allowed: boolean, code?: string, messageKey?: string}>}
 */
async function canAttemptGatheringInScene({ environment, actor }) {
  const sceneUuid = environment?.sceneUuid;
  if (!sceneUuid) return { allowed: true };

  const currentScene = game.scenes?.current ?? game.scene ?? globalThis.canvas?.scene ?? null;
  if (!currentScene || currentScene.uuid !== sceneUuid) {
    return { allowed: false, code: 'SCENE_TOKEN_BLOCKED', messageKey: 'FABRICATE.Gathering.Blocked.SceneMissing' };
  }

  const token = actor?.getActiveTokens?.(false, true)?.find(token =>
    getTokenSceneUuid(token) === sceneUuid
  ) ?? null;
  if (!token) {
    return { allowed: false, code: 'SCENE_TOKEN_BLOCKED', messageKey: 'FABRICATE.Gathering.Blocked.TokenMissing' };
  }

  return { allowed: true };
}

/**
 * Resolve the scene UUID from Foundry token shapes seen across V13 adapters.
 *
 * Production TokenDocument instances expose the scene through `parent`; tests
 * and compatibility callers may still provide `token.scene` or
 * `token.document.parent`.
 *
 * @param {object} token Active token or token-like adapter.
 * @returns {string|null} Scene UUID for the token, when available.
 */
function getTokenSceneUuid(token) {
  return token?.parent?.uuid
    ?? token?.scene?.uuid
    ?? token?.document?.parent?.uuid
    ?? null;
}

function createGatheringCatalystAvailability(craftingSystemManager) {
  return {
    check({ actor, system, task, catalysts = [] } = {}) {
      const matched = matchGatheringCatalysts({ actor, system, task, catalysts, craftingSystemManager });
      return {
        available: matched.missing.length === 0,
        missing: matched.missing
      };
    }
  };
}

function createGatheringCatalystUsage(craftingSystemManager) {
  return {
    plan({ actor, system, task, catalysts = [] } = {}) {
      const matched = matchGatheringCatalysts({ actor, system, task, catalysts, craftingSystemManager });
      return matched.items.map(({ item }) => gatheringRunItemRef(actor, item));
    },

    async apply({ actor, system, task, catalysts = [] } = {}) {
      const matched = matchGatheringCatalysts({ actor, system, task, catalysts, craftingSystemManager });
      for (const { catalyst, item } of matched.items) {
        await Catalyst.fromJSON(catalyst).applyDegradation(item);
      }
      return matched.items.map(({ item }) => gatheringRunItemRef(actor, item));
    }
  };
}

function matchGatheringCatalysts({ actor, system, task, catalysts = [], craftingSystemManager } = {}) {
  const matchedItems = [];
  const missing = [];
  const syntheticRecipe = {
    id: `gathering:${task?.id ?? 'task'}`,
    craftingSystemId: system?.id ?? task?.craftingSystemId ?? null
  };
  const items = normalizeFoundryCollection(actor?.items);

  for (const catalyst of catalysts) {
    const item = items.find(candidate =>
      craftingSystemManager?.catalystMatchesItem?.(syntheticRecipe, catalyst, candidate)
    );
    if (item) {
      matchedItems.push({ catalyst, item });
    } else {
      missing.push(catalyst);
    }
  }

  return { items: matchedItems, missing };
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
      hooks: Hooks
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
      sceneAccess: { canAttempt: canAttemptGatheringInScene },
      catalystAvailability: createGatheringCatalystAvailability(this.craftingSystemManager),
      resultResolver: createGatheringResultResolver(this.resolutionModeService),
      resultCreator: createGatheringResultCreator(this.craftingSystemManager),
      catalystUsage: createGatheringCatalystUsage(this.craftingSystemManager),
      failureFeedback: createGatheringFailureFeedback(),
      getRunViewer: getGatheringRunViewer,
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
    await runner.run();
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
   * @param {object} options Gathering listing options.
   * @returns {*} Gathering listing result with attemptability metadata.
   */
  listGatheringForActor(options = {}) {
    if (!this.ready) {
      throw new Error('Fabricate not initialized');
    }

    return callGatheringRuntimeWithCurrentViewer(gatheringEngine, 'listForActor', options, () => game.user);
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

  getGatheringConditions() {
    this._requireReady();
    return this.gatheringRichStateService?.getConditions();
  }

  setGatheringWeather(weatherTag) {
    this._requireReady();
    this._requireGM();
    return this.gatheringRichStateService?.setWeather(weatherTag);
  }

  setGatheringTimeOfDay(timeOfDayTag) {
    this._requireReady();
    this._requireGM();
    return this.gatheringRichStateService?.setTimeOfDay(timeOfDayTag);
  }

  setGatheringConditions(conditions = {}) {
    this._requireReady();
    this._requireGM();
    return this.gatheringRichStateService?.setConditions(conditions);
  }

  setGatheringStamina(options = {}) {
    this._requireReady();
    this._requireGM();
    return this.gatheringRichStateService?.setActorStamina(options.actor, options);
  }

  adjustGatheringStamina(options = {}) {
    this._requireReady();
    this._requireGM();
    return this.gatheringRichStateService?.adjustActorStamina(options.actor, options);
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

  // Make API available globally
  game.fabricate = fabricate;
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
    Catalyst,
    RecipeManager,
    CraftingEngine,
    getCraftingAppClass,
    getGatheringAppClass,
    getCraftingSystemManagerV2AppClass,
    getRecipeManagerAppClass,
    getRecipeEditorAppClass,
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
    importStarterPack,
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
    const craftButton = createHeaderButton('Craft Item', 'fas fa-hammer', 'craft', () => getCraftingAppClass().show());
    actionsContainer.insertBefore(craftButton, actionsContainer.firstChild);
  }

  syncGatheringDirectoryButton({
    itemsDirectory: itemsDir,
    enabled: hasGatheringEnabledSystems(),
    createButton: () => createHeaderButton('Gathering', 'fas fa-leaf', 'gathering', () => getGatheringAppClass().show()),
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
        () => getCraftingSystemManagerV2AppClass().show()
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
   * Open GM recipe manager
   */
  openRecipeManager: () => {
    return getRecipeManagerAppClass().show();
  },

  /**
   * List crafting systems
   */
  listCraftingSystems: () => {
    return game.fabricate.getCraftingSystemManager().getSystems();
  },

  importStarterPack: async (packId) => {
    return importStarterPack(packId);
  },

  exportSystem: (systemId) => {
    return game.fabricate.exportSystem(systemId);
  },

  importSystemFromFile: async (file, options) => {
    return game.fabricate.importSystemFromFile(file, options);
  }
};

export default fabricate;
