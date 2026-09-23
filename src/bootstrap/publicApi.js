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
    // DEPRECATED region-named aliases: forward to the realm method and warn once, so existing
    // macros keep working.
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
    // DEPRECATED alias for backwards compatibility — the same class.
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
    // Public hook names module authors may subscribe to.
    HOOKS: FABRICATE_HOOKS,
    // The named, versioned contract for outbound BEHAVIOURAL consumption (issue 1289).
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
    // Gathering authoring rides along, mirroring `adminStore.exportSystem`: the FULL environment
    // array and the whole `gatheringConfig`, which the exporter slices. Passing three args dropped
    // both and made the public-API export lossy against the import path (issue 642).
    const gatheringEnvironments = fabricate.gatheringEnvironmentStore?.list?.() ?? [];
    const gatheringConfig = getSetting(SETTING_KEYS.GATHERING_CONFIG) || {};
    // The world currency ladder rides along too (issue 1278). It is WORLD scope, so there is
    // nothing on the system to fall back on: omit it and every cost lands as an unresolvable unit.
    const currencyConfig = fabricate.currencyConfigStore?.get?.() ?? {};
    // The world realm library rides along too (issue 1282), same reason: realms are WORLD scope,
    // so omitting this lands every realm-gated environment citing realm ids that name nothing.
    const travelConfig = fabricate.gatheringRealmStore?.get?.() ?? {};
    // And the world character libraries (issue 1308), same reason, same consequence: omit them and
    // every learning gate, tool requirement and check modifier in the payload lands unresolvable.
    const characterLibraries = fabricate.characterLibrariesStore?.get?.() ?? {};
    // And the three WORLD-SCOPE ENTITY settings (issue 1364), sharper because these slices are
    // membership-filtered: omitting them exports an empty roster, defaults and membership.
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
    // The DESTINATION world's entity roster (issue 1364). Copy mode REQUIRES it: without it every
    // incoming component mints a fresh id, creating a second record for every item this world holds.
    const worldEntityIndex = buildWorldEntityIndex(fabricate);
    const packData = CraftingSystemExporter.prepareForImport(data, mode, { worldEntityIndex });
    return fabricate.compendiumImporter.importFromPackData(packData, {
      overwriteExisting: options.overwriteExisting || false,
    });
  };
}

// Bind the public API onto the live `game.fabricate` global. A pure assignment, idempotent and
// safe from both `init` and `ready`, the latter backstopping a manager stalled on "still loading".
export function bindFabricateGlobal(fabricate, io) {
  game.fabricate = fabricate;
  // Expose the manager singleton so the region behaviour event handlers can resolve
  // `game.fabricate.interactableManager` to dispatch onRegionEnter and onRegionExit.
  game.fabricate.interactableManager = InteractableManager.instance;
  game.fabricate.gathering = buildGatheringNamespace(fabricate);

  // Classes exposed for advanced users.
  game.fabricate.api = buildApiClasses(io);
  managerExtensions.bindPublicApi(game.fabricate.api);
  // Both registries are page-session singletons imported at module scope, so the init and ready
  // replays re-publish the SAME registry: a companion registered during its own `init` survives.
  playerExtensions.bindPublicApi(game.fabricate.api);

  game.fabricate.importFromPack = (packData, options) =>
    fabricate.compendiumImporter?.importFromPackData(packData, options);
  game.fabricate.getCompendiumImporter = () => fabricate.compendiumImporter;

  game.fabricate.exportSystem = buildExportSystem(fabricate);

  game.fabricate.importSystemFromFile = buildImportSystem(fabricate);

  // GM "prepare for uninstall" cleanup (issue 535): `fabricate.interactable` is a module-defined
  // RegionBehavior sub-type Foundry does NOT remove on disable, so it errors on every scene load.
  // This strips ONLY what Fabricate owns, never a parent Region, a foreign behaviour or a Token.
  game.fabricate.cleanupInteractables = () => runInteractableWorldCleanup();
}

/**
 * The DESTINATION world's entity roster (issue 1364), which a copy-mode import matches incoming
 * SOURCE REFERENCES against rather than minting a duplicate. An absent store answers an empty list,
 * so everything mints — correct for an unmigrated world.
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

/**
 * The macro-facing public surface, assigned to `globalThis.fabricate` by the module entry. A
 * factory because the deferred manager opener and its failure reporter stay in `src/main.js`.
 */
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
      // RETHROWING (issue 1565): a public API member must keep returning a promise that rejects with
      // the original error, so a macro author's `await` sees the failure while the user gets a notice.
      return openDeferredAppRethrowing(
        io.showCraftingSystemManagerApp,
        io.reportManagerLoadFailure
      );
    },

    /** List crafting systems. */
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
