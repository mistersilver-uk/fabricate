/**
 * The published surface: `game.fabricate` and its `gathering`, `api` and macro namespaces. Pure
 * assignment, idempotent from both `init` and `ready`. Every member here is a consumer contract.
 */

import { InteractableManager } from '../canvas/InteractableManager.js';
import {
  decideWorldInteractableCleanup,
  executeWorldInteractableCleanup,
  planHasWork,
} from '../canvas/regions/interactableCleanup.js';
import { FABRICATE_HOOKS } from '../config/hooks.js';
import { getSetting, SETTING_KEYS } from '../config/settings.js';
import { ItemPilesIntegration } from '../integrations/ItemPilesIntegration.js';
import { Ingredient } from '../models/Ingredient.js';
import { IngredientGroup } from '../models/IngredientGroup.js';
import { Recipe } from '../models/Recipe.js';
import { COMPANION_CONTRACT } from '../systems/companionContract.js';
import { CompendiumImporter } from '../systems/CompendiumImporter.js';
import { CraftingEngine } from '../systems/CraftingEngine.js';
import { CraftingRunManager } from '../systems/CraftingRunManager.js';
import * as CraftingSystemExporter from '../systems/CraftingSystemExporter.js';
import { CraftingSystemManager } from '../systems/CraftingSystemManager.js';
import { CurrencyConfigStore } from '../systems/CurrencyConfigStore.js';
import { GatheringEngine } from '../systems/GatheringEngine.js';
import { GatheringEnvironmentStore } from '../systems/GatheringEnvironmentStore.js';
import { GatheringGateAndCheckEvaluator } from '../systems/GatheringGateAndCheckEvaluator.js';
import { GatheringLocationService } from '../systems/GatheringLocationService.js';
import { GatheringPartyStore } from '../systems/GatheringPartyStore.js';
import { GatheringRealmStore } from '../systems/GatheringRealmStore.js';
import { GatheringRunManager } from '../systems/GatheringRunManager.js';
import { RecipeManager } from '../systems/RecipeManager.js';
import { RecipeVisibilityService } from '../systems/RecipeVisibilityService.js';
import { ResolutionModeService } from '../systems/ResolutionModeService.js';
import { SalvageRunManager } from '../systems/SalvageRunManager.js';
import { SignatureValidator } from '../systems/SignatureValidator.js';
import {
  getFabricateAppClass,
  getCraftingSystemManagerAppClass,
  getInteractableConfigAppClass,
  getInteractablesManagerAppClass,
} from '../ui/appFactory.js';
import { managerExtensions } from '../ui/managerExtensions.js';
import { playerExtensions } from '../ui/playerExtensions.js';
import { openDeferredAppRethrowing } from '../utils/deferredEntryNotice.js';

import { deprecate } from './gatheringRuntime.js';

const COMPANION_MIGRATION_DOCS =
  'https://mistersilver-uk.github.io/fabricate/api/#companion-contract';

/** The published `game.fabricate.gathering` namespace, deprecated region aliases included. */
function buildGatheringNamespace(fabricate) {
  return {
    getConditions: () => fabricate.getGatheringConditions(),
    setWeather: (weatherTag) => fabricate.setGatheringWeather(weatherTag),
    setTimeOfDay: (timeOfDayTag) => fabricate.setGatheringTimeOfDay(timeOfDayTag),
    setConditions: (conditions) => fabricate.setGatheringConditions(conditions),
    getPartyStore: () => fabricate.getGatheringPartyStore(),
    getRealmStore: () => fabricate.getGatheringRealmStore(),
    getLocationService: () => fabricate.getGatheringLocationService(),
    getLocationForActor: (options) => fabricate.getGatheringLocationForActor(options),
    setPartyRealmOverride: (options) => fabricate.setGatheringPartyRealmOverride(options),
    clearPartyRealmOverride: (options) => fabricate.clearGatheringPartyRealmOverride(options),
    revealRealmForActor: (options) => fabricate.revealGatheringRealmForActor(options),
    hideRealmForActor: (options) => fabricate.hideGatheringRealmForActor(options),
    // Deprecated region aliases forward to the realm method and warn once.
    getRegionStore: () => {
      deprecate('gathering.getRegionStore', 'gathering.getRealmStore');
      return fabricate.getGatheringRealmStore();
    },
    setPartyRegionOverride: (options) => {
      deprecate('gathering.setPartyRegionOverride', 'gathering.setPartyRealmOverride');
      return fabricate.setGatheringPartyRealmOverride({
        ...options,
        realmIds: options?.realmIds ?? options?.regionIds,
      });
    },
    clearPartyRegionOverride: (options) => {
      deprecate('gathering.clearPartyRegionOverride', 'gathering.clearPartyRealmOverride');
      return fabricate.clearGatheringPartyRealmOverride(options);
    },
    revealRegionForActor: (options) => {
      deprecate('gathering.revealRegionForActor', 'gathering.revealRealmForActor');
      return fabricate.revealGatheringRealmForActor({
        ...options,
        realmId: options?.realmId ?? options?.regionId,
      });
    },
    hideRegionForActor: (options) => {
      deprecate('gathering.hideRegionForActor', 'gathering.hideRealmForActor');
      return fabricate.hideGatheringRealmForActor({
        ...options,
        realmId: options?.realmId ?? options?.regionId,
      });
    },
  };
}

/** The classes and named contracts exposed for advanced users and companion modules. */
function buildApiClasses(io) {
  const api = {
    Recipe,
    Ingredient,
    IngredientGroup,
    RecipeManager,
    CraftingEngine,
    getFabricateAppClass,
    loadCraftingSystemManagerAppClass: io.loadCraftingSystemManagerAppClass,
    getCraftingSystemManagerAppClass,
    getInteractableConfigAppClass,
    getInteractablesManagerAppClass,
    CraftingSystemManager,
    CraftingRunManager,
    SalvageRunManager,
    GatheringEnvironmentStore,
    GatheringRealmStore,
    // Deprecated alias, the same class.
    GatheringRegionStore: GatheringRealmStore,
    GatheringPartyStore,
    CurrencyConfigStore,
    GatheringLocationService,
    GatheringRunManager,
    GatheringGateAndCheckEvaluator,
    GatheringEngine,
    RecipeVisibilityService,
    ResolutionModeService,
    SignatureValidator,
    ItemPilesIntegration,
    CompendiumImporter,
    CraftingSystemExporter,
    HOOKS: FABRICATE_HOOKS,
    // The named, versioned contract for behavioural consumption (issue 1289).
    companion: COMPANION_CONTRACT,
  };
  Object.defineProperty(api, 'COMPANION', {
    enumerable: true,
    configurable: true,
    get() {
      deprecate(
        'game.fabricate.api.COMPANION',
        'game.fabricate.api.companion',
        COMPANION_MIGRATION_DOCS
      );
      return COMPANION_CONTRACT;
    },
  });
  return api;
}

/** `game.fabricate.exportSystem`: one system, its recipes and every world-scope slice. */
function buildExportSystem(fabricate) {
  return (systemId) => {
    const systemManager = fabricate.craftingSystemManager;
    const recipeManager = fabricate.recipeManager;
    if (!systemManager || !recipeManager) throw new Error('Fabricate not initialized');
    const system = systemManager.getSystem(systemId);
    if (!system) throw new Error(`System "${systemId}" not found`);
    const recipes = recipeManager.getRecipes({ craftingSystemId: systemId }).map((r) => r.toJSON());
    const version = game.modules?.get('fabricate')?.version || '0.0.0';
    // Like `adminStore.exportSystem`, the full environments and `gatheringConfig`, which the
    // exporter slices; without them the export is lossy against the import (issue 642).
    const gatheringEnvironments = fabricate.gatheringEnvironmentStore?.list?.() ?? [];
    const gatheringConfig = getSetting(SETTING_KEYS.GATHERING_CONFIG) || {};
    // The world slices (issues 1278, 1282, 1308, 1364): the system holds no copy, so an omitted
    // slice lands its costs, realms, gates or modifiers unresolvable, and an omitted scope slice
    // exports an empty roster, defaults and membership.
    const currencyConfig = fabricate.currencyConfigStore?.get?.() ?? {};
    const travelConfig = fabricate.gatheringRealmStore?.get?.() ?? {};
    const characterLibraries = fabricate.characterLibrariesStore?.get?.() ?? {};
    const componentScope = fabricate.getComponentScopeStore?.()?.get?.() ?? {};
    const essenceScope = fabricate.getEssenceScopeStore?.()?.get?.() ?? {};
    const toolScope = fabricate.getToolScopeStore?.()?.get?.() ?? {};
    return CraftingSystemExporter.buildExportPayload(
      system,
      recipes,
      version,
      gatheringEnvironments,
      gatheringConfig,
      currencyConfig,
      travelConfig,
      characterLibraries,
      componentScope,
      essenceScope,
      toolScope
    );
  };
}

/** `game.fabricate.importSystemFromFile`: validate, then prepare against this world roster. */
function buildImportSystem(fabricate) {
  return async (file, options = {}) => {
    const text = typeof file === 'string' ? file : await file.text();
    const data = JSON.parse(text);
    const validation = CraftingSystemExporter.validateImportData(data);
    if (!validation.valid) throw new Error(`Invalid import data: ${validation.errors.join('; ')}`);
    const mode = options.copyMode ? 'copy' : 'keep';
    // Copy mode requires it, or every incoming component mints a duplicate record (issue 1364).
    const worldEntityIndex = buildWorldEntityIndex(fabricate);
    const packData = CraftingSystemExporter.prepareForImport(data, mode, { worldEntityIndex });
    return fabricate.compendiumImporter.importFromPackData(packData, {
      overwriteExisting: options.overwriteExisting || false,
    });
  };
}

// Idempotent, so safe from both `init` and `ready`; the latter backstops a manager stalled on
// "still loading".
export function bindFabricateGlobal(fabricate, io) {
  game.fabricate = fabricate;
  // The region behaviour handlers dispatch onRegionEnter and onRegionExit through it.
  game.fabricate.interactableManager = InteractableManager.instance;
  game.fabricate.gathering = buildGatheringNamespace(fabricate);

  game.fabricate.api = buildApiClasses(io);
  managerExtensions.bindPublicApi(game.fabricate.api);
  // Page-session singletons, so the `ready` replay re-publishes the registry a companion
  // registered into during its own `init`.
  playerExtensions.bindPublicApi(game.fabricate.api);

  game.fabricate.importFromPack = (packData, options) =>
    fabricate.compendiumImporter?.importFromPackData(packData, options);
  game.fabricate.getCompendiumImporter = () => fabricate.compendiumImporter;

  game.fabricate.exportSystem = buildExportSystem(fabricate);

  game.fabricate.importSystemFromFile = buildImportSystem(fabricate);

  // Foundry keeps a module's RegionBehavior sub-type on disable, so it errors on every scene
  // load (issue 535). This strips only what Fabricate owns, never a Region, behaviour or Token.
  game.fabricate.cleanupInteractables = () => runInteractableWorldCleanup();
}

/**
 * The destination roster a copy-mode import matches source references against (issue 1364). An
 * absent store answers empty, so everything mints, which is correct for an unmigrated world.
 */
function buildWorldEntityIndex(fabricate) {
  return {
    components: fabricate?.getComponentScopeStore?.()?.listEntities?.() ?? [],
    essences: fabricate?.getEssenceScopeStore?.()?.listEntities?.() ?? [],
    tools: fabricate?.getToolScopeStore?.()?.listEntities?.() ?? [],
  };
}

/** The GM-invocable uninstall-safe interactable cleanup edge: no-throw, `null` when it did not run. */
async function runInteractableWorldCleanup() {
  const t = (key, fallback, data = null) => {
    const i18n = globalThis.game?.i18n;
    if (data && typeof i18n?.format === 'function') {
      const out = i18n.format(key, data);
      if (out && out !== key) return out;
    } else if (typeof i18n?.localize === 'function') {
      const out = i18n.localize(key);
      if (out && out !== key) return out;
    }
    return fallback;
  };

  if (globalThis.game?.user?.isGM !== true) {
    globalThis.ui?.notifications?.warn?.(
      t('FABRICATE.Canvas.Cleanup.NotGM', 'Only a GM can run Fabricate interactable cleanup.')
    );
    return null;
  }

  const scenes = [...(globalThis.game?.scenes ?? [])];
  const plan = decideWorldInteractableCleanup(scenes);
  if (!planHasWork(plan)) {
    globalThis.ui?.notifications?.info?.(
      t(
        'FABRICATE.Canvas.Cleanup.NothingToDo',
        'No Fabricate interactables found. Nothing to clean up.'
      )
    );
    return plan.summary;
  }

  const { summary } = plan;
  const confirmed = await globalThis.foundry?.applications?.api?.DialogV2?.confirm?.({
    window: { title: t('FABRICATE.Canvas.Cleanup.Title', 'Remove Fabricate interactables') },
    content: `<p>${t(
      'FABRICATE.Canvas.Cleanup.Prompt',
      'Remove {behaviors} Fabricate interactable(s) and {markers} marker(s) across {scenes} scene(s)? Your regions, tokens, and any other region behaviours are kept. Run this BEFORE disabling or uninstalling Fabricate.',
      {
        behaviors: summary.behaviorsRemoved,
        markers: summary.visualsDeleted,
        scenes: summary.scenesTouched,
      }
    )}</p>`,
    yes: { label: t('FABRICATE.Canvas.Cleanup.Confirm', 'Remove them') },
    no: { label: t('FABRICATE.Canvas.Cleanup.Cancel', 'Cancel') },
  });
  if (confirmed !== true) return null;

  const applied = await executeWorldInteractableCleanup(scenes, plan);
  globalThis.ui?.notifications?.info?.(
    t(
      'FABRICATE.Canvas.Cleanup.Done',
      'Removed {behaviors} Fabricate interactable(s) and {markers} marker(s). You can now safely disable or uninstall Fabricate.',
      { behaviors: applied.behaviorsRemoved, markers: applied.visualsDeleted }
    )
  );
  return applied;
}

/** `globalThis.fabricate`; a factory because the manager opener stays in `src/main.js`. */
export function buildMacroApi(io) {
  return {
    createSimpleRecipe: async (name, ingredients, result) => {
      const { Recipe } = game.fabricate.api;
      const recipe = Recipe.createSimple(name, ingredients, result);
      return await game.fabricate.getRecipeManager().createRecipe(recipe.toJSON());
    },

    craft: async (actor, recipeId, options) => {
      return await game.fabricate.craft(actor, recipeId, options);
    },

    listRecipes: (filters = {}) => {
      return game.fabricate.getRecipeManager().getRecipes(filters);
    },

    deleteRecipe: async (recipeId) => {
      return await game.fabricate.deleteRecipe(recipeId);
    },

    getAvailableRecipes: (actorOrActors) => {
      const actors = Array.isArray(actorOrActors) ? actorOrActors : [actorOrActors];
      return game.fabricate.getRecipeManager().getAvailableRecipes(actors.filter(Boolean));
    },

    openRecipeManager: () => {
      // Rethrows (issue 1565), so a macro's `await` sees the original error beside the notice.
      return openDeferredAppRethrowing(
        io.showCraftingSystemManagerApp,
        io.reportManagerLoadFailure
      );
    },

    listCraftingSystems: () => {
      return game.fabricate.getCraftingSystemManager().getSystems();
    },

    exportSystem: (systemId) => {
      return game.fabricate.exportSystem(systemId);
    },

    importSystemFromFile: async (file, options) => {
      return game.fabricate.importSystemFromFile(file, options);
    },
  };
}
