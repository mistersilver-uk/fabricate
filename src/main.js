// Import global stylesheet so Vite includes it in the module graph for HMR.
// In production builds, a Vite plugin resolves this to a no-op since Foundry
// loads the stylesheet via module.json's "styles" field instead.
import '../styles/fabricate.css';
import { RecipeManager } from './systems/RecipeManager.js';
import { CompendiumImporter, scopeStoreDelegate } from './systems/CompendiumImporter.js';
import { CraftingEngine } from './systems/CraftingEngine.js';
import { CraftingSystemManager } from './systems/CraftingSystemManager.js';
import { CraftingRunManager } from './systems/CraftingRunManager.js';
import { SalvageRunManager } from './systems/SalvageRunManager.js';
import { GatheringEnvironmentStore } from './systems/GatheringEnvironmentStore.js';
import { GatheringRealmStore } from './systems/GatheringRealmStore.js';
import { CharacterLibrariesStore } from './systems/CharacterLibrariesStore.js';
import {
  createComponentScopeStore,
  createEssenceScopeStore,
  createToolScopeStore
} from './systems/worldScopeStores.js';
import { createWorldVocabularyStore } from './systems/WorldVocabularyStore.js';
import { CurrencyConfigStore } from './systems/CurrencyConfigStore.js';
import { GatheringPartyStore } from './systems/GatheringPartyStore.js';
import { GatheringLocationService } from './systems/GatheringLocationService.js';
import { GatheringRunManager } from './systems/GatheringRunManager.js';
import { GatheringGateAndCheckEvaluator } from './systems/GatheringGateAndCheckEvaluator.js';
import { GatheringRichStateService } from './systems/GatheringRichStateService.js';
import { secondsPerUnitFromCalendar } from './systems/foundryCalendar.js';
import { resolveAdvanceSources } from './systems/advanceCraftingSources.js';
import { GatheringEngine } from './systems/GatheringEngine.js';
import { GatheringHookPublisher } from './systems/GatheringHookPublisher.js';
import { EVENT_SCENE_SOCKET, createEventSceneTrigger } from './systems/eventSceneCoordinator.js';
import { createGatheringNodeDepletionWriter } from './systems/gatheringNodeSocket.js';
import { GatheringBlindRunStore } from './systems/GatheringBlindRunStore.js';
import { createGatheringBlindStartWriter } from './systems/gatheringBlindRunSocket.js';
import { createComplicationDeliveryWriter } from './systems/complicationSocket.js';
import { enrichToHtml, primeEnricherCache } from './ui/svelte/util/foundryBridge.js';
import { RecipeVisibilityService } from './systems/RecipeVisibilityService.js';
import { runStartupMaintenance } from './systems/startupMaintenance.js';
import { composeStartupPassList } from './systems/startupPassComposition.js';
import { ResolutionModeService } from './systems/ResolutionModeService.js';
import { CraftingListingBuilder } from './ui/presenters/CraftingListingBuilder.js';
import { activeRunStepState, buildStepRecipeView, resolveStepIngredientSet } from './systems/stepRecipeView.js';
import { InventoryListingBuilder } from './ui/presenters/InventoryListingBuilder.js';
import { AlchemyListingBuilder } from './ui/presenters/AlchemyListingBuilder.js';
import {
  evaluatePreparedRunCheck,
  resolveCheckFormulaDisplay,
} from './systems/checkRoll.js';
import {
  authorityUnavailableAvailability,
  executePublicCraft,
  installGatheringJournalRunAuthority,
} from './systems/journalRunCommands.js';
import { SignatureValidator } from './systems/SignatureValidator.js';
import { Recipe } from './models/Recipe.js';
import { Ingredient } from './models/Ingredient.js';
import { IngredientGroup } from './models/IngredientGroup.js';
import { findCuratedIconRecord, listCuratedIconVocabulary } from './utils/iconVocabulary.js';
import {
  createGatheringResultCreator,
} from './gatheringResultCreation.js';
import { resolveAlchemySubmissions } from './utils/alchemySubmissions.js';
// The item -> managed-component resolver the crafting listing's summary phase tallies held
// stacks with (issue 1075), shared with InventoryListingBuilder's owned-row matching.
import { findMatchingComponent } from './utils/essenceResolver.js';
import { progressiveOrderKey } from './utils/progressiveResultOrder.js';
import { STARTUP_PHASES, createStartupMarks } from './utils/startupMarks.js';
// Issue 1565: the deferred-chunk failure and stale-entry-script notices. Everything a semantic
// mutation could break is in that module because nothing in THIS file is executable by a unit test;
// what stays here is the Foundry edge — the localizer, the channel and the console.
import {
  DEFERRED_CHUNK_LOAD_CONSOLE_MESSAGE,
  STALE_ENTRY_SCRIPT_CONSOLE_MESSAGE,
  buildStaleEntryNotice,
  createDeferredChunkFailureReporter,
  openDeferredAppRethrowing
} from './utils/deferredEntryNotice.js';
import { createMemoizedLoad } from './utils/memoizedModuleLoad.js';
import {
  createGatheringSceneAccess,
  evaluateGatheringExpression,
  processWorldTimeCallbacksSafely,
  resolveViewerScene,
  senseTravelMarkerRegions,
} from './gatheringBootstrapAdapters.js';
import {
  createGatheringToolAvailability,
  matchGatheringTools
} from './gatheringToolRuntime.js';
import {
  getFabricateAppClass,
  getCraftingSystemManagerAppClass,
  getInteractableConfigAppClass,
  getInteractablesManagerAppClass
} from './ui/appFactory.js';
import { managerExtensions } from './ui/managerExtensions.js';
import { playerExtensions } from './ui/playerExtensions.js';
import { applyCurrentFabricateTheme } from './ui/theme.js';
import { registerFabricateSettings, getSetting, setSetting, SETTING_KEYS, RECIPE_ITEM_FLAG_STAMP_TARGET, COMPONENT_FLAG_STAMP_TARGET, TOOL_FLAG_STAMP_TARGET, OWNED_ITEM_COMPONENT_STAMP_TARGET, WORLD_SCOPE_IDENTITY_FLAG_TARGET, WORLD_ESSENCE_MERGE_FLAG_TARGET } from './config/settings.js';
import { getFabricateFlag, setFabricateFlag } from './config/flags.js';
import { FABRICATE_HOOKS } from './config/hooks.js';
import { MIGRATION_DEFERRAL_REASONS, MigrationRunner } from './migration/MigrationRunner.js';
// ALIASED, because the facade below exposes a PUBLIC method of the same name wrapping this one
// with the active-GM gate and the pending-map check. Two same-named callables in one module is a
// readability trap on a public surface, and the wrong one is the ungated one.
import {
  buildWorldEssenceMergeRemapNotice,
  forcedReplacementFlagPath,
  hasPendingWorldEssenceMerge,
  mayClearWorldEssenceMergeMap,
  mayClearWorldScopeRekeyMap,
  remapCompletedCleanly,
  remapWorldEssenceIdentityFlags as remapEssenceFlagsAcrossActors,
  remapWorldScopeIdentityFlags as remapIdentityFlagsAcrossActors,
} from './systems/remapWorldScopeIdentityFlags.js';
import { hasPendingWorldScopeRekey } from './systems/worldScopeRekeyPending.js';
// THE SHARED READ SEAM (issue 1370). Seven call sites in this file enter through it, and this file
// is outside the CI lint glob — so an omitted import here is a ReferenceError that no lint, no test
// and no build reports. `tests/main-undefined-identifiers.test.js` is the guard.
import { resolvedComponentsFor } from './systems/scopedEntityReads.js';
import { readPersistedCraftingSystems } from './systems/SettingsCraftingDefinitionRepository.js';
import { reportWorldIdentityDrift } from './systems/worldIdentityDrift.js';
import { restampOwnedItemComponentIdentity } from './systems/restampOwnedItemComponentIdentity.js';
import { buildWorldEssenceMergeNotice, buildWorldScopeEntityNotice, buildWorldScopeIdentityRemapNotice, describeWorldIdentityDrift } from './systems/worldScopeEntityNotice.js';
import { composeMigrationNotice, logMigrationNoticeDetail } from './migration/migrationNoticeDetail.js';
import { buildMigrationRecoveryPrompt } from './migration/migrationRecoveryPrompt.js';
import { buildRetiredCraftingModNotice } from './migration/migrateRetireCraftingModToken.js';
import { ItemPilesIntegration } from './integrations/ItemPilesIntegration.js';
import {
  ActorInventoryCoinSpender,
  ActorPropertyCoinSpender,
} from './systems/CoinSpenders.js';
import { Pf2eInventoryCoinAdapter } from './systems/Pf2eInventoryCoinAdapter.js';
import {
  COMPANION_CONTRACT,
} from './systems/companionContract.js';
import { isGatheringActorSelectableByUser } from './config/preferencesCleanup.js';
import { registerFragmentDiscoveryHook } from './systems/FragmentDiscoveryHook.js';
import { registerRecipeItemLearningHook } from './systems/RecipeItemLearningHook.js';
import { InteractableManager } from './canvas/InteractableManager.js';
import {
  applyInteractableBehaviorUpdate,
  resolveInteractableBehaviorByRef,
  writeInteractableBehaviorNode
} from './canvas/interactableSocketBridge.js';
import { syncInteractableMarkers } from './canvas/regions/interactableMarkerDepletion.js';
import {
  decideWorldInteractableCleanup,
  executeWorldInteractableCleanup,
  planHasWork
} from './canvas/regions/interactableCleanup.js';
import * as CraftingSystemExporter from './systems/CraftingSystemExporter.js';
import { bulkFacade } from './bootstrap/bulkFacade.js';
import { companionFacade } from './bootstrap/companionFacade.js';
import { gatheringFacade } from './bootstrap/gatheringFacade.js';
import {
  createGatheringFailureFeedback,
  createGatheringToolBreakage,
  deprecate,
  getBarSelectableActors,
  getGatheringEngine,
  getGatheringRunViewer,
  getGatheringSelectableActors,
  isCurrentWorldPaused,
  isSelectableGatheringActor,
  localizeGathering,
  resolveGatheringActor,
  setGatheringEngine,
} from './bootstrap/gatheringRuntime.js';
import { journalFacade } from './bootstrap/journalFacade.js';
import { applyItemStackQuantityPathSetting, registerModuleHooks } from './bootstrap/hooks.js';
import { createJournalCommandsForFabricate } from './bootstrap/journalOperations.js';
import {
  applyComplicationDelivery,
  applyGatheringBlindStart,
  showEventScenePrompt,
} from './bootstrap/socketRouter.js';
import './ui/SvelteFabricateApp.svelte.js';
import './ui/InteractableBrowserApp.svelte.js';
import './ui/InteractionPromptApp.svelte.js';
import './ui/InteractableConfigApp.svelte.js';
import './ui/InteractablesManagerApp.svelte.js';

// The GM notice for each way a startup migration pass can DEFER (issue 1242). One complete localized
// sentence per reason, because the two differ in what the GM must do: only the writeback failure
// instructs a reload, that path alone leaving this session holding unsaved transformed data.
const MIGRATION_DEFERRAL_NOTICES = Object.freeze({
  [MIGRATION_DEFERRAL_REASONS.CORPUS_READ_FAILED]: 'FABRICATE.Migration.Deferred.CorpusUnreadable',
  [MIGRATION_DEFERRAL_REASONS.WRITEBACK_FAILED]: 'FABRICATE.Migration.Deferred.WritebackFailed'
});

// The GM-only manager app is deferred to a lazy chunk so non-GM players never download its subtree.
// THE MEMOIZATION LIVES IN `src/utils/memoizedModuleLoad.js` (issue 1565), where a unit test can
// execute it; it clears on REJECTION so no dead promise is retained, which is not a retry capability
// — the host records a failed fetch, so only a reload recovers.
const loadCraftingSystemManagerAppClass = createMemoizedLoad(() =>
  import('./ui/SvelteCraftingSystemManagerApp.svelte.js').then(() =>
    getCraftingSystemManagerAppClass()
  )
);

/** Open the GM manager: the deferred load, then the app class's own `show()`. */
const showCraftingSystemManagerApp = () =>
  loadCraftingSystemManagerAppClass().then((AppClass) => AppClass.show());

/**
 * Report a failed deferred load of the manager subtree (issue 1565). NOT GM-GATED, `openRecipeManager`
 * being macro-reachable. THE INJECTED FUNCTIONS ARE CLOSURES OVER `ui.notifications`, NOT BARE
 * MEMBER VALUES: both touch private fields, so a bare one throws on the failure branch alone.
 */
const reportManagerLoadFailure = createDeferredChunkFailureReporter({
  notify: (message, options) => ui.notifications?.error?.(message, options),
  hasNotice: (notice) => ui.notifications?.has?.(notice),
  // `console.error`, pinned by `tests/release-build.test.js` against the BUILT BUNDLE: a spy passes
  // at any level. Rolldown drops a declared-pure call only when its RETURN VALUE IS UNUSED, and this
  // concise arrow returns it; the stale-entry write below does strip.
  log: (error) => console.error(DEFERRED_CHUNK_LOAD_CONSOLE_MESSAGE, error),
  localize: (key, data) => (data ? game.i18n?.format?.(key, data) : game.i18n?.localize?.(key))
});

/**
 * Tell this client, once per session, that it is running a stale entry script (issue 1565). THE
 * DIRECT DETECTION: the `esmodules` entry has no cache-busting parameter while the reported version
 * comes from `module.json` on disk. EVERY READ OF `__FABRICATE_BUILD_VERSION__` IS INSIDE THE
 * `typeof` GUARD BELOW — `vite.config.js` declares it under `build` ONLY, so a bare read is a
 * `ReferenceError` everywhere else and ESLint cannot catch it.
 */
function reportStaleEntryScript() {
  const buildVersion =
    typeof __FABRICATE_BUILD_VERSION__ === 'string' ? __FABRICATE_BUILD_VERSION__ : '';
  const installedVersion = game.modules?.get('fabricate')?.version ?? '';
  const message = buildStaleEntryNotice({ buildVersion, installedVersion }, (key, data) =>
    data ? game.i18n?.format?.(key, data) : game.i18n?.localize?.(key)
  );
  if (!message) return;
  // `warn`, not `error`, so a baked-versus-installed divergence cannot redden the smoke through
  // core's console mirror. `{ console: false }` because that mirror is deferred behind the
  // five-notice cap and lost to a `clear()`. `console.warn` because the declared `log`/`info`/`debug`
  // purity would let Rolldown delete this expression STATEMENT. `release-build.test.js` asserts both.
  console.warn(STALE_ENTRY_SCRIPT_CONSOLE_MESSAGE, { buildVersion, installedVersion });
  ui.notifications?.warn?.(message, { console: false });
}

/**
 * Dispatch startup and `updateWorldTime` processing for crafting, salvage and gathering; timed
 * gathering completion goes to the module-internal GatheringEngine, never exposed on `game.fabricate`.
 */
function processFabricateWorldTime(worldTime = Number(game.time?.worldTime || 0)) {
  return Promise.all(processWorldTimeCallbacksSafely([
    {
      label: 'Crafting',
      callback: async () => {
        await game.fabricate?.getCraftingRunManager?.()?.processWorldTime?.(worldTime);
        await game.fabricate?.getCraftingEngine?.()?.processVersionedWorldTime?.({ worldTime });
      }
    },
    {
      label: 'Salvage',
      callback: () => game.fabricate?.getCraftingEngine?.()?.processPendingSalvageRuns?.(worldTime)
    },
    {
      label: 'Gathering',
      callback: () => getGatheringEngine()?.processWorldTime?.(worldTime)
    }
  ]));
}

class Fabricate {
  constructor() {
    this.recipeManager = null;
    this.craftingEngine = null;
    this.craftingSystemManager = null;
    this.craftingRunManager = null;
    this.salvageRunManager = null;
    this._runJournalBuilder = null;
    this.journalRunCommands = null;
    this.gatheringEnvironmentStore = null;
    this.gatheringNodeDepletionWriter = null;
    this.gatheringBlindRunStore = null;
    this.gatheringBlindStartWriter = null;
    this.gatheringRichStateService = null;
    this.gatheringRunManager = null;
    this.gatheringGateAndCheckEvaluator = null;
    this.recipeVisibilityService = null;
    this.resolutionModeService = null;
    // Lazily-built player-facing crafting listing projector, built on first read.
    this._craftingListingBuilder = null;
    // Lazily-built player-facing inventory listing projector, built on first read.
    this._inventoryListingBuilder = null;
    // Lazily-built bulk salvage and destroy collaborators (issue 859), cached like the listing
    // builders and deliberately NOT on `game.fabricate`: `salvageComponents` and `destroyComponents`
    // are the only supported entry points, because that is where the per-target ownership gate is.
    this._bulkSalvageService = null;
    this._bulkDestroyService = null;
    this.itemPilesIntegration = null;
    this.actorInventoryCoinSpender = null;
    this.actorPropertyCoinSpender = null;
    this.compendiumImporter = null;
    this.ready = false;
    // Replay-safe readiness signal: unlike the one-shot `fabricate.ready` Hook, awaiting this settled
    // promise works even when readiness was reached before the caller subscribed.
    this._readyPromise = new Promise((resolve) => {
      this._resolveReady = resolve;
    });
  }

  /** Replay-safe readiness: resolves when initialization finished, immediately if it already had. */
  whenReady() {
    return this._readyPromise;
  }

  /** Initialize the module. */
  async initialize() {
    console.log('Fabricate | Initializing...');

    // Explicit performance boundaries around startup (issue 1073), so "ready time attributable to
    // Fabricate" is measured rather than guessed. Total: an absent `performance` degrades to a no-op.
    this._startupMarks = createStartupMarks();
    this._startupMarks.begin(STARTUP_PHASES.INITIALIZE);

    this.registerSettings();
    applyCurrentFabricateTheme(getSetting, SETTING_KEYS.THEME);
    // BEFORE anything reads or writes a stack: it must precede `_runMigrations()`, a migration being
    // able to touch owned items, and follow `registerSettings()`. No MIGRATIONS entry — the key is
    // new, so no prior stored value exists to migrate.
    applyItemStackQuantityPathSetting();
    // Run data migrations before managers load persisted data.
    this._startupMarks.begin(STARTUP_PHASES.MIGRATIONS);
    await this._runMigrations();
    this._startupMarks.end(STARTUP_PHASES.MIGRATIONS);
    // Both seams are lazy closures, `craftingSystemManager` being constructed on the next statement
    // from `recipeManager`; `getCraftingSystemManager` (issue 1072) is what RecipeManager's twelve
    // former `game.fabricate` reads go through. The world currency configuration (issue 1278) is
    // FIRST, both the recipe manager and the crafting engine taking it as a collaborator.
    this.currencyConfigStore = new CurrencyConfigStore({
      getSetting,
      setSetting,
      randomID: () => foundry.utils.randomID()
    });
    this.currencyConfigStore.load();
    // Issue 1308: the world character libraries, loaded HERE before both managers, because
    // `CraftingSystemManager` derives its Valid Id Basis from this store on every normalize — unlike
    // the travel store's realms, which are read on demand.
    this.characterLibrariesStore = new CharacterLibrariesStore({
      getSetting,
      setSetting,
      randomID: () => foundry.utils.randomID()
    });
    this.characterLibrariesStore.load();
    // Issue 1359: the three WORLD-SCOPE entity stores, loaded AFTER `registerSettings()`, AFTER
    // `await this._runMigrations()` and BEFORE both managers. THE ORDER IS SILENT WHEN WRONG —
    // `load()` is guarded, so a mis-ordering degrades to an UNSEEDED store and a `null` Valid Id
    // Basis against which the manager prunes every world reference — and a source-order assertion
    // in `tests/scoped-definition-read-and-basis.test.js` pins it.
    this.componentScopeStore = createComponentScopeStore({ getSetting, setSetting });
    this.componentScopeStore.load();
    this.essenceScopeStore = createEssenceScopeStore({ getSetting, setSetting });
    this.essenceScopeStore.load();
    this.toolScopeStore = createToolScopeStore({ getSetting, setSetting });
    this.toolScopeStore.load();
    // Issue 1392: the WORLD VOCABULARY store, beside the three above for the source-order assertion.
    // Its own HARD constraint is only "after `registerSettings()`", it being wired into no prune
    // basis, so a mis-order degrades to an unseeded store and a rail badge reading 0.
    this.worldVocabularyStore = createWorldVocabularyStore({ getSetting, setSetting });
    this.worldVocabularyStore.load();
    // 1.30.0 (issue 1370): THE WORLD IDENTITY DRIFT AUDIT, once per session. HERE, NOT IN THE
    // MIGRATION'S NOTICE SLOT, because DRIFT IS NOT A MIGRATION EVENT — it appears on the GM's first
    // identity edit and every session after. ACTIVE GM, NOT `isGM`. INFO, NEVER WARN.
    if (game.users?.activeGM?.id === game.user?.id) {
      const worldIdentityDrift = reportWorldIdentityDrift(readPersistedCraftingSystems(), {
        components: this.componentScopeStore.corpus(),
        essences: this.essenceScopeStore.corpus(),
        tools: this.toolScopeStore.corpus()
      });
      // THE FULL LEDGER GOES TO THE CONSOLE AND FABRICATE PUTS IT THERE ITSELF, core logging the
      // CAPPED message it was handed; the level and the wrapper are § Migration Notices' (1737).
      const driftDetail = describeWorldIdentityDrift(worldIdentityDrift);
      logMigrationNoticeDetail('world identity drift', driftDetail);
      // CONSOLE ONLY (maintainer, 2026-09-06): the toast read as an alarm for a harmless state.
    }
    this.recipeManager = new RecipeManager({
      getCraftingSystem: (systemId) => this.craftingSystemManager?.getSystem?.(systemId) ?? null,
      getCraftingSystemManager: () => this.craftingSystemManager ?? null,
      currencyConfigStore: this.currencyConfigStore,
    });
    // Issue 800: the manager RESOLVES source descriptions through Foundry's enricher at its async
    // ingestion boundaries. Both seams default to pass-throughs, `enrichHTML` not running under
    // happy-dom, so wiring the real implementations here is what makes production resolve.
    this.craftingSystemManager = new CraftingSystemManager(this.recipeManager, {
      enrichToHtml: (raw, options) => enrichToHtml(raw, options),
      primeEnricherCache: (rawTexts) => primeEnricherCache(rawTexts)
    });
    // Wire the real primary-GM check into the timed world-time resume paths (issue 656). The
    // collaborators default it to a fail-open `() => true` so unit fixtures resume, so passing the
    // real check here is LOAD-BEARING: it gates every resume write to exactly one client.
    const isPrimaryGM = () => game.users?.activeGM?.id === game.user?.id;
    this.craftingRunManager = new CraftingRunManager({ isPrimaryGM });
    this.salvageRunManager = new SalvageRunManager({ isPrimaryGM });
    this.gatheringRunManager = new GatheringRunManager();
    this.gatheringGateAndCheckEvaluator = new GatheringGateAndCheckEvaluator({
      evaluateExpression: evaluateGatheringExpression
    });
    this.recipeVisibilityService = new RecipeVisibilityService(
      this.recipeManager,
      this.craftingSystemManager,
      undefined,
      // A per-pass INVENTORY SNAPSHOT collaborator, not a visibility one (issue 1228): every
      // production snapshot is built with the same identity pair.
      findMatchingComponent
    );
    this.resolutionModeService = new ResolutionModeService(this.craftingSystemManager, {
      getPlayerResultOrder: entry => this._readPlayerResultOrder(entry)
    });
    this.itemPilesIntegration = new ItemPilesIntegration();
    this.itemPilesIntegration.detect();
    // The actor-inventory spender resolves a per-system coin adapter by `game.system.id` through an
    // internal map, pf2e being the only one; the actor-property spender needs no such wiring.
    this.actorInventoryCoinSpender = new ActorInventoryCoinSpender({
      adapters: new Map([['pf2e', new Pf2eInventoryCoinAdapter()]]),
    });
    this.actorPropertyCoinSpender = new ActorPropertyCoinSpender();
    // Wire the gathering persistence seams the GM UI path already passes, so the public API persists
    // the authoring bundle rather than dropping it (issue 699). The environment store is constructed
    // AFTER this importer, so it resolves lazily through a delegating object.
    this.compendiumImporter = new CompendiumImporter(this.craftingSystemManager, this.recipeManager, {
      environmentStore: {
        list: () => this.gatheringEnvironmentStore?.list?.() ?? [],
        load: () => this.gatheringEnvironmentStore?.load?.() ?? [],
        save: (environments) => this.gatheringEnvironmentStore?.save?.(environments)
      },
      // Lazy for the same reason; with the realm store unassigned `get()` answers null and the merge
      // takes the raw-setting path rather than awaiting a `save` that resolves to undefined.
      travelStore: {
        get: () => this.gatheringRealmStore?.get?.() ?? null,
        save: (config) => this.gatheringRealmStore?.save?.(config)
      },
      getSetting: (key) => getSetting(key),
      setSetting: (key, value) => setSetting(key, value),
      isGM: () => game.user?.isGM === true,
      // The three world-scope entity stores (issue 1364) resolve lazily: the merge fails CLOSED on an
      // absent store, so a seam capturing a still-undefined field would merge NOTHING and still
      // report success. A delegator closes over the FIELD, so a rename cannot slip past it.
      componentScopeStore: scopeStoreDelegate(() => this.componentScopeStore),
      essenceScopeStore: scopeStoreDelegate(() => this.essenceScopeStore),
      toolScopeStore: scopeStoreDelegate(() => this.toolScopeStore)
    });
    this.craftingEngine = new CraftingEngine(
      this.recipeManager,
      this.craftingRunManager,
      this.resolutionModeService,
      this.itemPilesIntegration,
      this.salvageRunManager,
      this.actorInventoryCoinSpender,
      this.actorPropertyCoinSpender,
      {
        getPlayerResultOrder: entry => this._readPlayerResultOrder(entry),
        getCraftingSystem: systemId => this.craftingSystemManager.getSystem(systemId),
        resolveItemUuid: uuid => fromUuid(uuid),
        currencyConfigStore: this.currencyConfigStore
      }
    );
    this.journalRunCommands = createJournalCommandsForFabricate(this);

    // Both `initialize()` calls deserialize a whole world-setting payload, so this span is the
    // corpus-proportional half of startup.
    this._startupMarks.begin(STARTUP_PHASES.DATA_LOAD);
    await this.recipeManager.initialize();
    await this.craftingSystemManager.initialize();
    this._startupMarks.end(STARTUP_PHASES.DATA_LOAD);
    // The WORLD travel configuration (issue 1282), FIRST because the environment store validates
    // realm references against it and the resolver and engine both read realms through it.
    this.gatheringRealmStore = new GatheringRealmStore({
      getSetting,
      setSetting,
      randomID: () => foundry.utils.randomID()
    });
    this.gatheringRealmStore.load();
    this.gatheringEnvironmentStore = new GatheringEnvironmentStore({
      systemManager: this.craftingSystemManager,
      travelStore: this.gatheringRealmStore,
      runCleanup: {
        removeRunsForSystem: (systemId) => this.gatheringRunManager.removeRunsForSystem(systemId),
        removeRunsForEnvironment: (environmentId) => this.gatheringRunManager.removeRunsForEnvironment(environmentId),
        removeRunsForTask: (taskId, options) => this.gatheringRunManager.removeRunsForTask(taskId, options)
      }
    });
    this.gatheringEnvironmentStore.load();
    // Fabricate-managed parties and the current-realm resolver, both world scope. The resolver is
    // constructor-injected rather than imported, so the engine stays testable without Foundry.
    this.gatheringPartyStore = new GatheringPartyStore({
      getSetting,
      setSetting,
      randomID: () => foundry.utils.randomID(),
      getUserId: () => game.user?.id || null,
      now: () => Date.now()
    });
    this.gatheringPartyStore.load();
    this.gatheringLocationService = new GatheringLocationService({
      partyStore: this.gatheringPartyStore,
      travelStore: this.gatheringRealmStore,
      // The marker's Scene Regions on ANY scene, not this client's canvas (issue 1912).
      senseSceneRegions: (travelActorUuid) => {
        const resolve = globalThis.fromUuidSync;
        if (typeof resolve !== 'function' || !travelActorUuid) return [];
        let actor = null;
        try { actor = resolve(String(travelActorUuid)); } catch (_) { actor = null; }
        return senseTravelMarkerRegions({ actor });
      }
    });
    // Node pools live in the `gatheringEnvironments` WORLD setting and only a GM may write one, so
    // without this relay a player's decrement rejects and the pool never depletes. On a GM client
    // the writer applies locally, a socket emit never reaching the emitter.
    this.gatheringNodeDepletionWriter = createGatheringNodeDepletionWriter({
      isActiveGM: () => game.user?.id === game.users?.activeGM?.id,
      // `Users#activeGM` is null with no GM connected, so report rather than emit into the void: the
      // gather still succeeds, having never gated on this write, and only the pool fails to deplete.
      hasActiveGM: () => !!game.users?.activeGM,
      onUnroutable: ({ environmentId, taskId }) => console.warn(
        'Fabricate | Gathering node depletion was not applied: no active GM is connected to write the world setting',
        { environmentId, taskId }
      ),
      emitDeplete: (message) => game.socket?.emit(EVENT_SCENE_SOCKET, message),
      applyDeplete: (payload) => this.gatheringRichStateService?.applyEnvironmentNodeDepletion(payload)
    });
    this.gatheringRichStateService = new GatheringRichStateService({
      environmentStore: this.gatheringEnvironmentStore,
      depleteEnvironmentNode: (payload) => this.gatheringNodeDepletionWriter.deplete(payload),
      getSetting,
      setSetting,
      settingKey: SETTING_KEYS.GATHERING_CONFIG,
      nowWorldTime: () => Number(game.time?.worldTime || 0),
      getUserId: () => game.user?.id || null,
      hooks: Hooks,
      evaluateExpression: evaluateGatheringExpression,
      // Calendar-aware regen and respawn intervals, falling back to the Earth table and resolved per
      // call so a mid-session reconfig is picked up.
      secondsPerUnit: (unit) => secondsPerUnitFromCalendar(unit, game.time?.calendar ?? null),
      // Interactable-scoped node seams (issue 302): resolve a behaviour by ref and route its
      // scoped-node write through the active GM.
      resolveRegionBehavior: (ref) => resolveInteractableBehaviorByRef(ref),
      writeInteractableBehavior: (ref, patch) => writeInteractableBehaviorNode(ref, patch)
    });
    const gatheringEngine = setGatheringEngine(new GatheringEngine({
      // Load-bearing: without it every connected client resumes the same matured timed run and
      // double-applies its items, tool wear and node depletion.
      resumeTimedRuns: isPrimaryGM,
      environmentStore: this.gatheringEnvironmentStore,
      runManager: this.gatheringRunManager,
      richState: this.gatheringRichStateService,
      evaluator: this.gatheringGateAndCheckEvaluator,
      systemManager: this.craftingSystemManager,
      getSelectableActors: getGatheringSelectableActors,
      isActorSelectable: ({ actor, viewer }) => isGatheringActorSelectableByUser(actor, viewer),
      isGamePaused: isCurrentWorldPaused,
      sceneAccess: createGatheringSceneAccess({
        // The REQUESTING viewer's scene, not this client's (issue 1912).
        getCurrentScene: (viewer) => resolveViewerScene({
          viewer,
          currentUser: game.user,
          scenes: game.scenes,
          currentScene: () => game.scenes?.current ?? game.scene ?? globalThis.canvas?.scene ?? null
        })
      }),
      toolAvailability: createGatheringToolAvailability({
        craftingSystemManager: this.craftingSystemManager,
        evaluator: this.gatheringGateAndCheckEvaluator
      }),
      resultCreator: createGatheringResultCreator(this.craftingSystemManager),
      toolBreakage: createGatheringToolBreakage({
        craftingSystemManager: this.craftingSystemManager,
        evaluateExpression: evaluateGatheringExpression
      }),
      failureFeedback: createGatheringFailureFeedback(),
      // Publishes the documented public `fabricate.gathering.*` hooks on terminal completion.
      hookPublisher: new GatheringHookPublisher({
        hooks: Hooks,
        nowWorldTime: () => Number(game.time?.worldTime || 0)
      }),
      eventSceneTrigger: createEventSceneTrigger({
        isGM: () => !!game.user?.isGM,
        emitPrompt: ({ sceneUuid, eventName }) => game.socket?.emit(EVENT_SCENE_SOCKET, {
          action: 'eventScenePrompt', sceneUuid, eventName, requestedBy: game.user?.id
        }),
        showPrompt: showEventScenePrompt
      }),
      getRunViewer: getGatheringRunViewer,
      locationResolver: this.gatheringLocationService,
      travelStore: this.gatheringRealmStore,
      localize: localizeGathering,
      // Interactable-scoped node respawn enumeration (issue 302): scan scenes for scoped-node
      // behaviours and route the changed `system.node` write through the active GM.
      scenes: () => game.scenes ?? null,
      applyInteractableBehaviorUpdate: (ref, update) =>
        applyInteractableBehaviorUpdate({
          sceneId: ref?.sceneId,
          regionId: ref?.regionId,
          behaviorId: ref?.behaviorId,
          update
        })
    }));
    installGatheringJournalRunAuthority({
      engine: gatheringEngine,
      service: this.journalRunCommands,
      evaluatePreparedRunCheck,
    });
    await this.journalRunCommands?.bootstrapJournalRunAuthority?.();
    // Issue 901. A blind run's secret state lives in the `gatheringBlindRuns` WORLD setting, which
    // only a GM may update. That is the integrity boundary: a player can still READ world state, but
    // can no longer FORGE the task their run yields as they could on an Actor flag they own.
    this.gatheringBlindRunStore = new GatheringBlindRunStore({
      getSetting,
      setSetting,
      settingKey: SETTING_KEYS.GATHERING_BLIND_RUNS,
      // Load-bearing: the active GM is the SINGLE writer. `game.settings.set` replaces rather than
      // merges, so a second concurrent writer would clobber another run's record.
      isActiveGM: () => game.user?.id === game.users?.activeGM?.id,
      // Liveness: a record only counts while its run is active, which is what keeps a reservation
      // PROVISIONAL under every path that never reaches the maturity release.
      isRunActive: ({ actorUuid, runId }) => {
        const resolve = globalThis.fromUuidSync;
        if (typeof resolve !== 'function' || !actorUuid || !runId) return true;
        let runActor = null;
        try { runActor = resolve(String(actorUuid)); } catch (_) { runActor = null; }
        if (!runActor) return false;
        return Boolean(this.gatheringRunManager?.getActiveRun?.(runActor, runId));
      },
      nowWorldTime: () => Number(game.time?.worldTime || 0)
    });
    // The blind DRAW must happen somewhere the acting player cannot rig it, so a player's blind
    // timed start routes to the active GM over the node-depletion relay's channel (issue 983) and
    // the GM re-runs the whole attempt with the requesting user as the viewer.
    this.gatheringBlindStartWriter = createGatheringBlindStartWriter({
      isActiveGM: () => game.user?.id === game.users?.activeGM?.id,
      hasActiveGM: () => !!game.users?.activeGM,
      onUnroutable: ({ environmentId }) => console.warn(
        'Fabricate | Blind gathering start was not applied: no active GM is connected to write the world setting',
        { environmentId }
      ),
      emitStart: (message) => game.socket?.emit(EVENT_SCENE_SOCKET, message),
      // The local-apply branch has no socket sender to attest, so supply the current user; reached
      // only if a GM ever routes its own start, which the engine short-circuits before.
      applyStart: (payload) => applyGatheringBlindStart({ senderId: game.user?.id, ...payload })
    });
    gatheringEngine.installBlindRunRelay({
      store: this.gatheringBlindRunStore,
      relayStart: (args) => this.gatheringBlindStartWriter.start(args)
    });
    // A complication's GM-only card and its macro must happen on a GM client, a macro on the acting
    // client carrying that client's authority. Relayed ADDRESSING ONLY — the elected GM re-reads the
    // authored complication from its own record (issue 1286) — and applied locally on that GM.
    this.complicationDeliveryWriter = createComplicationDeliveryWriter({
      isActiveGM: () => game.user?.id === game.users?.activeGM?.id,
      hasActiveGM: () => !!game.users?.activeGM,
      // Unlike the blind-start relay this DROPS rather than blocks: a complication is strictly
      // downstream of a committed award, so refusing would strand a completed craft. Only the
      // GM-only card and the macro are lost, and there is no store to defer them into.
      onUnroutable: ({ resolutionId }) => console.warn(
        'Fabricate | Complications were not delivered: no active GM is connected to run them',
        { resolutionId }
      ),
      // Minted here rather than inside the socket module, which touches no Foundry global.
      // `randomID` and not `Math.random()`.
      mintResolutionId: () => globalThis.foundry?.utils?.randomID?.(),
      emitComplications: (message) => game.socket?.emit(EVENT_SCENE_SOCKET, message),
      // The local-apply branch has no socket sender to attest, so supply the current user — who is,
      // on that branch, the acting user.
      applyComplications: (payload) => applyComplicationDelivery({ senderId: game.user?.id, ...payload })
    });
    // EXPLICIT injection into both engines that fire complications: each also falls back to
    // `game.fabricate.complicationDeliveryWriter`, but a seam only the fallback satisfies cannot be
    // substituted in a test. Optional-chained so a reorder cannot take the boot down.
    this.craftingEngine?.installComplicationDelivery({ writer: this.complicationDeliveryWriter });
    gatheringEngine?.installComplicationDelivery({ writer: this.complicationDeliveryWriter });
    // Housekeeping that drops entries naming deleted content. Each pass is INDEPENDENTLY GUARDED
    // (issue 970): a refused actor write must never prevent `this.ready` below, every facade method
    // throwing through `_requireReady()`. The list is composed by `composeStartupPassList` (issue
    // 1224) BELOW both `initialize()` calls, so its id sets derive from the corpus this boot loaded.
    this._startupMarks.begin(STARTUP_PHASES.STARTUP_MAINTENANCE);
    await runStartupMaintenance(composeStartupPassList({
      recipeManager: this.recipeManager,
      craftingSystemManager: this.craftingSystemManager,
      craftingRunManager: this.craftingRunManager,
      salvageRunManager: this.salvageRunManager,
      recipeVisibilityService: this.recipeVisibilityService,
      getSetting,
      setSetting,
      resolveGatheringActor,
      isSelectableGatheringActor
    }));
    this._startupMarks.end(STARTUP_PHASES.STARTUP_MAINTENANCE);

    registerFragmentDiscoveryHook(this.craftingSystemManager, this.recipeVisibilityService);
    registerRecipeItemLearningHook(this.recipeVisibilityService);

    // Close the outer span BEFORE readiness is announced, so a `whenReady()` waiter observes a
    // complete `fabricate:initialize` measure. ABOVE `this.ready = true` deliberately:
    // `manager-launch-readiness.test.js` pins that line and `this._resolveReady?.();` as ADJACENT.
    this._startupMarks.end(STARTUP_PHASES.INITIALIZE);
    this.ready = true;
    this._resolveReady?.();
    console.log('Fabricate | Ready');
  }

  /** Run versioned startup data migrations via MigrationRunner. */
  async _runMigrations() {
    // Primary-GM only, so exactly one client runs the pass. `isGM` is TRUE FOR ASSISTANT GMs, who
    // hold SETTINGS_MODIFY, so an `isGM` gate would let every assistant transform-and-write
    // concurrently; `activeGM` fires on exactly one client.
    if (game.users?.activeGM?.id !== game.user?.id) return;
    const runner = new MigrationRunner({
      getSetting,
      setSetting,
      // The GM-only recovery prompt, invoked by the runner on a fatal abort. "Keep existing data" is
      // the default and matches what the runner already did; the fix/retry choice is INFORMATIONAL
      // ONLY — the GM repairs and RELOADS. There is NO same-pass auto-retry.
      promptRecovery: (context) => this._promptMigrationRecovery(context)
    });
    const summary = await runner.run();
    const localize = (key, data) => (data ? game.i18n?.format?.(key, data) : game.i18n?.localize?.(key));

    // A DEFERRED pass (issue 1242) is NOT an abort, so it gets its own permanent notice rather than
    // the dialog — ABOVE that branch, a deferred summary reporting `aborted: false`.
    if (summary?.deferred === true) {
      // A COMPLETE sentence per reason, and only the writeback failure instructs a reload: it alone
      // leaves this session holding transformed values under an un-advanced version.
      const key = MIGRATION_DEFERRAL_NOTICES[summary.deferredReason] ?? MIGRATION_DEFERRAL_NOTICES[MIGRATION_DEFERRAL_REASONS.CORPUS_READ_FAILED];
      const notice = composeMigrationNotice(key, undefined, localize);
      console.error(`Fabricate | migration pass deferred (${summary.deferredReason}): ${notice.detail}`, summary.deferredError ?? '');
      if (game.user?.isGM) ui.notifications?.error?.(notice.message, { permanent: true });
      return;
    }

    // An ABORTED pass rolled back and persisted nothing. Surface a GM-facing error and return
    // WITHOUT any success notice; the runner already emitted per-document guidance to the console.
    if (summary?.aborted === true) {
      if (game.user?.isGM) {
        ui.notifications?.error?.(composeMigrationNotice('FABRICATE.Migration.Aborted.Notice', undefined, localize).message);
      }
      return;
    }

    // 0.6.0 converted catalysts into shared library Tools: tell the GM where the catalyst data
    // went. GM-only and only when something was migrated; the pure migration stays edge-free.
    const migratedCount = Number(summary?.migratedCatalystCount || 0);
    if (migratedCount > 0 && game.user?.isGM) {
      const message = game.i18n?.format?.('FABRICATE.Migration.CatalystsToTools.Notice', { count: migratedCount })
        || `Fabricate migrated ${migratedCount} catalyst(s) to the Tools library. Find them under the Tools tab.`;
      ui.notifications?.info?.(message);
    }

    // 0.9.0 unified legacy realms: name the systems so the GM can re-enable Travel & Realms.
    const unifiedRegionSystems = Array.isArray(summary?.unifiedRegionSystems) ? summary.unifiedRegionSystems : [];
    if (unifiedRegionSystems.length > 0 && game.user?.isGM) {
      const notice = composeMigrationNotice('FABRICATE.Migration.UnifyRegions.Notice', { systems: unifiedRegionSystems.join(', ') }, localize);
      logMigrationNoticeDetail('0.9.0 unified gathering realms', notice.detail);
      ui.notifications?.info?.(notice.message);
    }

    // 1.6.0 removed the legacy routed result-selection providers, dropping roll-table references and
    // stripping gathering-task result selections; name them so the GM can reconfigure.
    const removedProviders = summary?.removedResultSelectionProviders ?? null;
    const droppedRollTableRecipes = Array.isArray(removedProviders?.droppedRollTableRecipes)
      ? removedProviders.droppedRollTableRecipes : [];
    const strippedGatheringTasks = Array.isArray(removedProviders?.strippedGatheringTasks)
      ? removedProviders.strippedGatheringTasks : [];
    if ((droppedRollTableRecipes.length > 0 || strippedGatheringTasks.length > 0) && game.user?.isGM) {
      // Console recovery log naming the affected recipes and tasks: a routed gathering task now
      // resolves via `gatheringCraftingCheck.routed.rollFormula`, which the GM must populate.
      console.warn(
        'Fabricate | 1.6.0 migration removed legacy result-selection providers. ' +
          'Populate gatheringCraftingCheck.routed.rollFormula for any stripped gathering task. Affected items:',
        { droppedRollTableRecipes, strippedGatheringTasks }
      );
    }

    // 1.17.0 disabled recipes to clear an alchemy signature collision; name them so the GM can fix.
    const essenceCollisionDisabledRecipes = Array.isArray(summary?.essenceCollisionDisabledRecipes)
      ? summary.essenceCollisionDisabledRecipes
      : [];
    if (essenceCollisionDisabledRecipes.length > 0 && game.user?.isGM) {
      const notice = composeMigrationNotice('FABRICATE.Migration.EssenceGroups.CollisionNotice', {
        count: essenceCollisionDisabledRecipes.length,
        recipes: essenceCollisionDisabledRecipes.join(', '),
      }, localize);
      logMigrationNoticeDetail('1.17.0 essence-group collisions', notice.detail);
      ui.notifications?.warn?.(notice.message);
    }

    // 1.21.0 retired the check-modifier roll-formula placeholder, its consequences being behaviour
    // changes. THE COMPOSITION IS NOT HERE: three semantic mutations survived a green suite inline.
    const retiredCraftingModCounts = Array.isArray(summary?.retiredCraftingModCounts)
      ? summary.retiredCraftingModCounts : [];
    if (retiredCraftingModCounts.length > 0 && game.user?.isGM) {
      const notice = buildRetiredCraftingModNotice(retiredCraftingModCounts, localize);
      logMigrationNoticeDetail('1.21.0 retired check-modifier placeholder', notice.detail);
      if (notice.severity === 'warn') ui.notifications?.warn?.(notice.message, { permanent: true });
      else ui.notifications?.info?.(notice.message);
    }

    // 1.23.0: an id authored in BOTH libraries had its gathering entry RE-KEYED, a visible rename, so
    // it is reported rather than discovered. Only colliding systems are listed.
    const unifiedModifierCollisions = Array.isArray(summary?.unifiedModifierCollisions)
      ? summary.unifiedModifierCollisions : [];
    if (unifiedModifierCollisions.length > 0 && game.user?.isGM) {
      const notice = composeMigrationNotice('FABRICATE.Migration.UnifyModifiers.CollisionNotice', {
        count: unifiedModifierCollisions.reduce((sum, entry) => sum + entry.collisions, 0),
        systems: unifiedModifierCollisions.map((entry) => entry.system).join(', '),
      }, localize);
      logMigrationNoticeDetail('1.23.0 unified modifier collisions', notice.detail);
      ui.notifications?.warn?.(notice.message, { permanent: true });
    }

    // 1.28.0 (issue 1308): the character-library id collisions where two systems disagreed about what
    // an id MEANS. Identical copies are filtered upstream, so every one here changed a rule INVISIBLY.
    const characterLibraryCollisions = Array.isArray(summary?.characterLibraryCollisions)
      ? summary.characterLibraryCollisions : [];
    if (characterLibraryCollisions.length > 0 && game.user?.isGM) {
      const notice = composeMigrationNotice('FABRICATE.Migration.CharacterLibraries.CollisionNotice', {
        count: characterLibraryCollisions.length,
        entries: [...new Set(characterLibraryCollisions.map((entry) => entry.entryId))].join(', '),
      }, localize);
      logMigrationNoticeDetail('1.28.0 character library collisions', notice.detail);
      ui.notifications?.warn?.(notice.message, { permanent: true });
    }

    // 1.30.0 (issue 1363): what the world-scope entity migration did. THE COMPOSITION IS NOT HERE —
    // it lives in `buildWorldScopeEntityNotice` — and the report is `null` unless the migration ran,
    // so an omission fails SILENT, hence the PRESENCE assertion.
    const worldScopeEntityReport = summary?.worldScopeEntityReport ?? null;
    if (worldScopeEntityReport && game.user?.isGM) {
      const notice = buildWorldScopeEntityNotice(worldScopeEntityReport, localize);
      if (notice.message) {
        logMigrationNoticeDetail('1.30.0 world-scope entities', notice.detail);
        if (notice.severity === 'warn') ui.notifications?.warn?.(notice.message, { permanent: true });
        else ui.notifications?.info?.(notice.message);
      }
    }

    // 1.34.0 (issue 1654): the equivalent-essence merge notice, ALWAYS a permanent warning, every
    // case that produces a message being one the GM must act on (§ Migration Notices, issue 1737).
    const worldEssenceMergeReport = summary?.worldEssenceMergeReport ?? null;
    if (worldEssenceMergeReport && game.user?.isGM) {
      const essenceNotice = buildWorldEssenceMergeNotice(worldEssenceMergeReport, localize);
      if (essenceNotice.message) {
        logMigrationNoticeDetail('1.34.0 equivalent essence merge', essenceNotice.detail);
        ui.notifications?.warn?.(essenceNotice.message, { permanent: true });
      }
    }
  }

  /**
   * The thin Foundry edge for the GM migration-abort recovery prompt. GM-only and never throwing:
   * the console guidance and the abort notification have already covered the GM.
   */
  async _promptMigrationRecovery(context) {
    try {
      if (!game.user?.isGM) return;
      const DialogV2 = globalThis.foundry?.applications?.api?.DialogV2;
      if (!DialogV2?.wait && !DialogV2?.prompt) return;

      const localize = (key, data) =>
        data ? game.i18n?.format?.(key, data) ?? key : game.i18n?.localize?.(key) ?? key;
      const config = buildMigrationRecoveryPrompt(context, localize);

      const buttons = config.buttons.map((button) => ({
        action: button.action,
        label: button.label,
        default: button.default
      }));

      // `DialogV2.wait` resolves to the chosen action; both choices are informational, the runner
      // having already kept existing data, and closing the dialog is equivalent to keeping it.
      await DialogV2.wait({
        window: { title: config.title },
        content: config.content,
        buttons,
        default: config.default,
        rejectClose: false
      });
    } catch (error) {
      console.warn(`Fabricate | Failed to present migration recovery prompt: ${error?.message ?? error}`);
    }
  }

  /** Register module settings. */
  registerSettings() {
    registerFabricateSettings();
  }

  /** Get the recipe manager instance. */
  getRecipeManager() {
    return this.recipeManager;
  }

  /**
   * Get the crafting engine instance. `COMPANION`'s `handle` tier (issue 1289), whose one carve-out
   * is `findComponentItems`; ungated, per § The Ungated Handle Accessors.
   */
  getCraftingEngine() {
    return this.craftingEngine;
  }

  /**
   * Re-run the `1.30.0` world-scope identity-flag repair (issue 1363). A GM-FACING RECOVERY ACTION,
   * not a test hook, reachable exactly when the boot-time one-shot WITHHELD itself: a TORN MIGRATION
   * or a PARTIAL REMAP, both of which leave the map PENDING; a LOCKED-PACK skip is not one of them.
   * ACTIVE-GM ONLY, a SINGLE-WRITER rule rather than a permission check, the pass walking the
   * UNFILTERED actor collection. IDEMPOTENT: it remaps only, clearing and advancing nothing.
   */
  async remapWorldScopeIdentityFlags() {
    if (game.users?.activeGM?.id !== game.user?.id) {
      console.warn(
        'Fabricate | world-scope identity repair declined: it writes across every actor in the world, so it runs on the ACTIVE GM alone. Ask the active GM to run it, or take over as active GM first.'
      );
      return null;
    }
    const rekeyMap = getSetting(SETTING_KEYS.WORLD_SCOPE_REKEY_MAP) ?? {};
    if (!hasPendingWorldScopeRekey(() => rekeyMap)) return null;
    return applyWorldScopeIdentityFlagRemap(rekeyMap);
  }

  /**
   * Re-run the `1.34.0` equivalent-essence merge's durable-flag repair (issue 1654), for the two
   * states its `1.30.0` sibling `remapWorldScopeIdentityFlags` serves. Active-GM only, and it WARNS
   * rather than returning silently, a silent `null` reading as success. Idempotent.
   */
  async remapWorldEssenceIdentityFlags() {
    if (game.users?.activeGM?.id !== game.user?.id) {
      console.warn(
        'Fabricate | world essence merge repair declined: it writes across every actor in the world, so it runs on the ACTIVE GM alone. Ask the active GM to run it, or take over as active GM first.'
      );
      return null;
    }
    const mergeMap = getSetting(SETTING_KEYS.WORLD_ESSENCE_MERGE_MAP) ?? {};
    if (!hasPendingWorldEssenceMerge(mergeMap)) return null;
    return applyWorldEssenceMergeFlagRemap(mergeMap);
  }

  /** Get the crafting system manager instance. */
  getCraftingSystemManager() {
    return this.craftingSystemManager;
  }

  /** Get the crafting run manager instance. */
  getCraftingRunManager() {
    return this.craftingRunManager;
  }

  getSalvageRunManager() {
    return this.salvageRunManager;
  }

  /** Get the gathering environment store, without exposing the module-internal GatheringEngine. */
  getGatheringEnvironmentStore() {
    return this.gatheringEnvironmentStore;
  }

  /** Get the Fabricate-managed gathering party store (world-level parties). */
  getGatheringPartyStore() {
    this._requireReady();
    return this.gatheringPartyStore;
  }

  /**
   * Get the world currency configuration store (issue 1278). World scope: a world runs one game
   * system and so has one way actors store coins. UNGATED, per § The Ungated Handle Accessors.
   */
  getCurrencyConfigStore() {
    return this.currencyConfigStore ?? null;
  }

  /**
   * Get the world character libraries store (issue 1308). World scope, both libraries resolving
   * against the acting CHARACTER. UNGATED, per § The Ungated Handle Accessors.
   */
  getCharacterLibrariesStore() {
    return this.characterLibrariesStore ?? null;
  }

  /**
   * Get the world COMPONENT scope store (issue 1359). UNGATED, per § The Ungated Handle Accessors,
   * and emphatically NOT like `getGatheringRealmStore`: a throw here crashes `_normalizeSystem`.
   */
  getComponentScopeStore() {
    return this.componentScopeStore ?? null;
  }

  /** Get the world ESSENCE scope store (issue 1359). Ungated, for `getComponentScopeStore`'s reason. */
  getEssenceScopeStore() {
    return this.essenceScopeStore ?? null;
  }

  /** The world TOOL scope store (1359), ungated; it carries the WORLD tool-breakage authority. */
  getToolScopeStore() {
    return this.toolScopeStore ?? null;
  }

  /**
   * Get the world VOCABULARY store (issue 1392). UNGATED for its OWN reason: nothing normalizes
   * against it, but `worldScopeProjection`'s `readCorpus` converts ANY throw into a legitimate
   * `{available: false, total: 0}`, so a readiness throw would silently blank Tags & Categories.
   * THE NAME IS FIXED BY ITS CONSUMER, `adminStore`.
   */
  getVocabularyScopeStore() {
    return this.worldVocabularyStore ?? null;
  }

  /** Get the per-system gathering realm store. */
  getGatheringRealmStore() {
    this._requireReady();
    return this.gatheringRealmStore;
  }

  /** @deprecated Use `getGatheringRealmStore`. */
  getGatheringRegionStore() {
    deprecate('getGatheringRegionStore', 'getGatheringRealmStore');
    return this.getGatheringRealmStore();
  }

  /** Get the current-realm resolver used for location-aware gathering. */
  getGatheringLocationService() {
    this._requireReady();
    return this.gatheringLocationService;
  }

  /** Get the gathering run manager. */
  getGatheringRunManager() {
    return this.gatheringRunManager;
  }

  /** Get the gathering gate/check evaluator. */
  getGatheringGateAndCheckEvaluator() {
    return this.gatheringGateAndCheckEvaluator;
  }

  getGatheringRichStateService() {
    return this.gatheringRichStateService;
  }

  /** Get the recipe visibility service instance. */
  getRecipeVisibilityService() {
    return this.recipeVisibilityService;
  }

  getResolutionModeService() {
    return this.resolutionModeService;
  }

  getItemPilesIntegration() {
    return this.itemPilesIntegration;
  }

  /**
   * Get the `actorInventory` strategy's coin spender. `COMPANION`'s `handle` tier (issue 1289),
   * ungated per § The Ungated Handle Accessors.
   */
  getActorInventoryCoinSpender() {
    return this.actorInventoryCoinSpender;
  }

  /**
   * Get the `actorProperty` strategy's coin spender. `COMPANION`'s `handle` tier (issue 1289),
   * ungated per § The Ungated Handle Accessors.
   */
  getActorPropertyCoinSpender() {
    return this.actorPropertyCoinSpender;
  }

  getCompendiumImporter() {
    return this.compendiumImporter;
  }

  /**
   * Merge caller `options` with the persisted remembered-actor default: a TRUTHY id overrides and a
   * null or empty one falls back. IT MUST COALESCE, NOT SPREAD — the UI passes
   * `store.selectedActorId ?? null`, which on a fresh open is `null` before the actor bar settles.
   */
  _withRememberedActorDefault(options = {}) {
    return {
      ...options,
      rememberedActorId: options.rememberedActorId || this.getSelectedGatheringActorId() || null,
    };
  }

  /**
   * List Fabricate's curated icon vocabulary. ONE vocabulary serves every icon field, published here
   * so a companion binds to it instead of hand-curating a second list that drifts. It is measured
   * from the Font Awesome bundle a Foundry install ships rather than from Font Awesome's metadata.
   * `Curated` is the qualifier because the unfiltered catalogue is deliberately NOT published.
   * READY-GATED BY THROWING rather than answering an empty list, as every other `list…` is: an empty
   * vocabulary is indistinguishable from one that lost its contents.
   * THE RECORDS ARE FRESHLY BUILT PER CALL, so a caller may sort or mutate them; `aliases` is
   * published because there is one entry per GLYPH and not per name, and the other names are what a
   * caller needs to read data a GM already saved.
   */
  listCuratedIcons() {
    this._requireReady();
    return listCuratedIconVocabulary();
  }

  /**
   * Resolve one icon name against the curated vocabulary, under its offered name or any alias. A
   * companion holding `fas fa-cog` gets the `gear` row; a typo or an uncurated icon gets `null`.
   * `find…` rather than `get…` because the lookup can miss — a `get…` sibling would suggest a value
   * always comes back. READY-GATED BY THROWING, like its sibling: `null` says the vocabulary does
   * not offer that name and must not also mean it was not there to ask.
   * PUBLISHED AS WELL AS `aliases`, which is for OFFERING and SEARCHING where this is for
   * INTERPRETING a persisted value, O(1) against a prebuilt index — and because the obvious
   * `some(({ iconCode }) => iconCode === name)` reports a saved `cog` as unknown.
   */
  findCuratedIcon(iconName) {
    this._requireReady();
    return findCuratedIconRecord(iconName);
  }

  /** Read the persisted remembered gathering-actor selection; an empty string when unset. */
  getSelectedGatheringActorId() {
    return getSetting(SETTING_KEYS.LAST_GATHERING_ACTOR) || '';
  }

  /**
   * Lazily build and cache the `CraftingListingBuilder` projecting the backend into redaction-safe
   * listing models, so GM and player viewers resolve through one code path. It imports no Foundry
   * globals — `localize` and `nowWorldTime` are injected here.
   */
  _getCraftingListingBuilder() {
    if (this._craftingListingBuilder) return this._craftingListingBuilder;
    this._craftingListingBuilder = new CraftingListingBuilder({
      recipeManager: this.recipeManager,
      recipeVisibility: this.recipeVisibilityService,
      resolutionModeService: this.resolutionModeService,
      craftingSystemManager: this.craftingSystemManager,
      // Read ONLY for `findActiveRunForRecipe`, so the projection can name the step a run is parked
      // on (issue 917). Safe to capture: `this.craftingRunManager` is never reassigned.
      craftingRunManager: this.craftingRunManager,
      localize: (key, data) =>
        data !== undefined
          ? (game.i18n?.format?.(key, data) ?? key)
          : (game.i18n?.localize?.(key) ?? key),
      nowWorldTime: () => game.time?.worldTime ?? 0,
      resolveCheckFormula: (formula, actor, craftingModifier) =>
        resolveCheckFormulaDisplay(formula, actor, craftingModifier),
      // How a held document resolves to a managed component (issue 1075): the SAME full resolver
      // `InventoryListingBuilder` matches owned stacks with, so the crafting row's "looks makeable"
      // and the inventory tab's owned count cannot disagree. Injected, so its graph stays out of
      // the harness.
      resolveComponentForItem: findMatchingComponent,
    });
    return this._craftingListingBuilder;
  }

  /**
   * Resolve a stored crafting actor preference; null for a stale id. DEFENCE IN DEPTH: a non-GM
   * viewer's actor must pass the gathering attempt path's ownership predicate.
   */
  _resolveCraftingActor(actorId) {
    const actor = actorId ? (game.actors?.get?.(actorId) ?? null) : null;
    if (!actor) return null;
    if (game.user?.isGM === true) return actor;
    return isGatheringActorSelectableByUser(actor, game.user) ? actor : null;
  }

  /**
   * Resolve the effective crafting actor and component-source actors against the persisted defaults;
   * a truthy `rememberedActorId` overrides and stale ids resolve to nothing.
   */
  _resolveCraftingSources({ rememberedActorId = null, componentSourceActorIds = null } = {}) {
    const actorId = rememberedActorId || this.getSelectedCraftingActorId() || null;
    const craftingActor = this._resolveCraftingActor(actorId);
    const sourceIds = Array.isArray(componentSourceActorIds)
      ? componentSourceActorIds
      : this.getCraftingComponentSourceIds();
    const componentSourceActors = sourceIds
      .map((id) => this._resolveCraftingActor(id))
      .filter(Boolean);
    return { craftingActor, componentSourceActors };
  }

  /**
   * Build the player-facing Crafting listing. The current Foundry user is ALWAYS the viewer, and the
   * visibility service honours the GM bypass.
   */
  listCraftingForActor(options = {}) {
    this._requireReady();
    const { craftingActor, componentSourceActors } = this._resolveCraftingSources(options);
    return this._getCraftingListingBuilder().buildListing({
      craftingActor,
      componentSourceActors,
      viewer: game.user,
    });
  }

  /**
   * DETAIL PHASE — the exact rich model for ONE recipe (issue 1075), companion to
   * `listCraftingForActor`'s cheap summary rows, so craftability, check resolution and stages are
   * computed for what is on screen. `recipeId` is NOT trusted: the actor and sources are re-resolved
   * through `_resolveCraftingSources` and visibility is re-evaluated, so an id the viewer may not
   * see answers `null`.
   */
  hydrateCraftingRecipe({ recipeId = null, actorId = null, componentSourceActorIds = null } = {}) {
    this._requireReady();
    if (!recipeId) return null;
    const { craftingActor, componentSourceActors } = this._resolveCraftingSources({
      rememberedActorId: actorId,
      componentSourceActorIds,
    });
    return this._getCraftingListingBuilder().buildRecipeDetail({
      recipeId,
      craftingActor,
      componentSourceActors,
      viewer: game.user,
    });
  }

  /**
   * Lazily build and cache the `InventoryListingBuilder`; `recipeVisibility` is injected so a non-GM
   * viewer's used-by list never names a teaser recipe.
   */
  _getInventoryListingBuilder() {
    if (this._inventoryListingBuilder) return this._inventoryListingBuilder;
    this._inventoryListingBuilder = new InventoryListingBuilder({
      recipeManager: this.recipeManager,
      craftingSystemManager: this.craftingSystemManager,
      recipeVisibility: this.recipeVisibilityService,
      localize: (key, data) =>
        data !== undefined
          ? (game.i18n?.format?.(key, data) ?? key)
          : (game.i18n?.localize?.(key) ?? key),
      nowWorldTime: () => game.time?.worldTime ?? 0,
      // Gathering tasks live in the `gatheringConfig` setting keyed by system id, not on the system
      // object, so they are surfaced here for the "produced by" gathering index.
      getGatheringTasksForSystem: (systemId) => {
        const config = getSetting(SETTING_KEYS.GATHERING_CONFIG);
        const tasks = config?.systems?.[systemId]?.tasks;
        return Array.isArray(tasks) ? tasks : [];
      },
    });
    return this._inventoryListingBuilder;
  }

  /**
   * Build the player-facing Inventory listing, reusing the crafting selection so the two tabs agree
   * on what the player owns. The current Foundry user is always the viewer.
   */
  listInventoryForActor(options = {}) {
    this._requireReady();
    const { craftingActor, componentSourceActors } = this._resolveCraftingSources(options);
    return this._getInventoryListingBuilder().buildListing({
      craftingActor,
      componentSourceActors,
      viewer: game.user,
    });
  }

  /**
   * Learn one recipe from an owned book against the scope the listing was computed for, delegated to
   * the visibility service, which enforces the per-document learn budget for capped systems.
   */
  async learnRecipeFromInventory({ actorId = null, recipeId = null, componentSourceActorIds = null } = {}) {
    this._requireReady();
    const recipe = this.recipeManager?.getRecipe?.(recipeId);
    if (!recipe) {
      return { success: false, message: 'FABRICATE.Knowledge.NoMatchingItem' };
    }
    const { craftingActor, componentSourceActors } = this._resolveCraftingSources({
      rememberedActorId: actorId,
      componentSourceActorIds,
    });
    return this.recipeVisibilityService.learnRecipeFromOwnedBook({
      recipe,
      craftingActor,
      componentSourceActors,
    });
  }

  /**
   * Craft a recipe for the current selection, delegating to {@link Fabricate#craft} but taking actor
   * IDS rather than documents, and resolving the crafting actor and component sources so the attempt
   * uses the inventory scope the listing was computed for. New starts use version 1 and preserve
   * ready, fully supplied one-call execution; waiting or unresolved choices leave the run in the
   * Journal without editable-material spending, and a stale `ingredientEssenceAllocation` blocks
   * versioned execution until repaired. Versioned required checks use the authority's
   * prepare/prompt/resolve exchange whatever `interactive` says, and cancelling the prompt leaves
   * the stage unexecuted rather than the run absent.
   */
  async craftRecipe({ actorId = null, recipeId, ingredientSetId = null, ingredientOptionOverrides = null, ingredientEssenceAllocation = null, componentSourceActorIds = null, interactive = false } = {}) {
    this._requireReady();
    const { craftingActor, componentSourceActors } = this._resolveCraftingSources({
      rememberedActorId: actorId,
      componentSourceActorIds,
    });
    if (!craftingActor) {
      return { success: false, results: null, message: 'No crafting actor selected' };
    }
    const sources = componentSourceActors.length > 0 ? componentSourceActors : [craftingActor];
    // `interactive` opts into the confirm-roll dialog and chat post; false for automation.
    return await this.craft(craftingActor, recipeId, {
      componentSourceActors: sources,
      lifecycleVersion: 1,
      ingredientSetId,
      // Per-group player option overrides (issue 552); null keeps default resolution.
      ingredientOptionOverrides,
      // Scoped essence-block funding (issue 917); null keeps the allocator's suggestion.
      ingredientEssenceAllocation,
      interactive,
    });
  }

  /**
   * Salvage one owned component for the current selection (issue 675). TAKES AN `actorId`, NEVER AN
   * `actorUuid`: `CraftingEngine.salvage` performs NO ownership check, so `_resolveCraftingActor` is
   * the ONLY gate here, and a uuid would reach `fromUuid()` and THROW rather than answering the
   * `{ success: false, message }` a store expects. `craftRecipe` parity is the contract.
   */
  async salvageComponent({ actorId = null, systemId, componentId, interactive = false } = {}) {
    this._requireReady();
    const { craftingActor } = this._resolveCraftingSources({ rememberedActorId: actorId });
    if (!craftingActor) {
      return { success: false, results: null, message: 'No crafting actor selected' };
    }
    return await this.craftingEngine.salvage(craftingActor.uuid, systemId, componentId, {
      interactive
    });
  }

  /**
   * Re-evaluate ONE ingredient set's craftability with in-session per-group overrides (issue 552),
   * through the SAME `evaluateCraftability` seam the engine consumes. Synchronous, for a `$derived`.
   */
  evaluateSelectedSet({ recipeId = null, setId = null, optionOverrides = null, essenceAllocation = null, stepId = null, actorId = null, componentSourceActorIds = null } = {}) {
    this._requireReady();
    const recipe = this.recipeManager?.getRecipe?.(recipeId);
    if (!recipe) return null;
    const { craftingActor, componentSourceActors } = this._resolveCraftingSources({
      rememberedActorId: actorId,
      componentSourceActorIds,
    });
    const sources = componentSourceActors.length > 0
      ? componentSourceActors
      : (craftingActor ? [craftingActor] : []);
    if (sources.length === 0) return null;
    // Resolve through the EXECUTION STEPS, not the `recipe.ingredientSets` that is EMPTY for every
    // explicit multi-step recipe; `resolveStepIngredientSet` also enforces the two rules that make
    // this safe.
    const resolved = resolveStepIngredientSet({
      steps: this.resolutionModeService?.getExecutionSteps?.(recipe) ?? [],
      stepId,
      activeStepIndex: activeRunStepState(this.craftingRunManager, craftingActor, recipe.id).index,
      setId,
    });
    if (!resolved) return null;
    // Narrow to the one selected set through the SHARED step view the engine crafts against, so the
    // step's tool union applies and the IngredientSet instance methods survive.
    const singleSetRecipe = {
      ...buildStepRecipeView(recipe, resolved.step),
      ingredientSets: [resolved.set],
    };
    return this.recipeManager.evaluateCraftability(sources, singleSetRecipe, {
      craftingActor,
      optionOverrides,
      essenceAllocation,
    }) ?? null;
  }

  /** Lazily cache the `AlchemyListingBuilder`: the leak-safe, Foundry-global-free workbench view. */
  _getAlchemyListingBuilder() {
    if (this._alchemyListingBuilder) return this._alchemyListingBuilder;
    this._alchemyListingBuilder = new AlchemyListingBuilder({
      recipeManager: this.recipeManager,
      craftingSystemManager: this.craftingSystemManager,
      recipeVisibility: this.recipeVisibilityService,
      localize: (key, data) =>
        data !== undefined
          ? (game.i18n?.format?.(key, data) ?? key)
          : (game.i18n?.localize?.(key) ?? key),
      // The per-pass inventory snapshot's component resolver (issue 1228): the workbench reads no
      // tallies itself, but its snapshot must be the same complete value every other pass builds.
      resolveComponentForItem: findMatchingComponent,
    });
    return this._alchemyListingBuilder;
  }

  /**
   * Build the leak-safe player Alchemy workbench listing for `craftingSystemId`. The current user is
   * always the viewer and the actor goes through crafting's owner gate, so a non-owner viewer's
   * actor resolves to null and the builder answers a denied, empty listing.
   */
  listAlchemyForActor({ actorId = null, craftingSystemId = null, componentSourceActorIds = null } = {}) {
    this._requireReady();
    const { craftingActor, componentSourceActors } = this._resolveCraftingSources({
      rememberedActorId: actorId,
      componentSourceActorIds,
    });
    return this._getAlchemyListingBuilder().buildListing({
      craftingActor,
      componentSourceActors,
      viewer: game.user,
      craftingSystemId,
    });
  }

  /**
   * Submit a workbench of components as an alchemy brew attempt. Owner-scoped like `craftRecipe`,
   * then delegated to the AUTHORITATIVE `CraftingEngine#craftAlchemy`, which matches every enabled
   * recipe known and undiscovered and otherwise fizzles with no check and no roll. `interactive`
   * prompts on a MATCHED brew only.
   */
  async submitAlchemyAttempt({
    actorId = null,
    craftingSystemId = null,
    submittedComponentIds = [],
    componentSourceActorIds = null,
    interactive = false,
  } = {}) {
    this._requireReady();
    const { craftingActor, componentSourceActors } = this._resolveCraftingSources({
      rememberedActorId: actorId,
      componentSourceActorIds,
    });
    if (!craftingActor) {
      return { success: false, results: null, message: 'No crafting actor selected', disposition: 'error' };
    }
    const sources = componentSourceActors.length > 0 ? componentSourceActors : [craftingActor];
    const system = this.craftingSystemManager?.getSystem?.(craftingSystemId) ?? null;
    const components = resolvedComponentsFor(system);
    const submittedItems = resolveAlchemySubmissions(
      sources,
      components,
      submittedComponentIds,
      craftingSystemId
    );
    if (submittedItems.length === 0) {
      return { success: false, results: null, message: 'FABRICATE.App.Alchemy.NoIngredients', disposition: 'error' };
    }
    return await this.craftingEngine.craftAlchemy(craftingActor, sources, submittedItems, {
      craftingSystemId,
      lifecycleVersion: 1,
      interactive,
    });
  }

  /** Read the persisted last-selected alchemy system; an empty string when unset. */
  getSelectedAlchemySystemId() {
    return getSetting(SETTING_KEYS.LAST_ALCHEMY_SYSTEM) || '';
  }

  /** Persist the selected alchemy system. */
  setSelectedAlchemySystemId(id) {
    return setSetting(SETTING_KEYS.LAST_ALCHEMY_SYSTEM, id ?? '');
  }

  /**
   * The actors the current user may select as crafting or component-source actors, filtered like the
   * actor-selection bar so the two pickers agree. Display data only.
   */
  listCraftingSourceActors() {
    this._requireReady();
    return getBarSelectableActors({ viewer: game.user }).map((actor) => ({
      id: actor?.id ?? actor?.uuid ?? null,
      uuid: actor?.uuid ?? null,
      name: actor?.name ?? '',
      img: actor?.img ?? null,
    }));
  }

  /**
   * Resolve the current selection's component-source actors as real Foundry actors for the pure
   * shopping-list aggregator. Owner-scoped via the persisted ids only; it widens no access.
   */
  getCraftingSourceActors() {
    this._requireReady();
    const { craftingActor, componentSourceActors } = this._resolveCraftingSources();
    const actors = componentSourceActors.length > 0 ? componentSourceActors : [];
    if (craftingActor && !actors.includes(craftingActor)) actors.unshift(craftingActor);
    return actors;
  }

  /** Read the persisted remembered crafting-actor selection; an empty string when unset. */
  getSelectedCraftingActorId() {
    return getSetting(SETTING_KEYS.LAST_CRAFTING_ACTOR) || '';
  }

  /** Persist the remembered crafting-actor selection. */
  setSelectedCraftingActorId(id) {
    return setSetting(SETTING_KEYS.LAST_CRAFTING_ACTOR, id ?? '');
  }

  /** Read the persisted component-source actor ids. */
  getCraftingComponentSourceIds() {
    const ids = getSetting(SETTING_KEYS.LAST_COMPONENT_SOURCES);
    return Array.isArray(ids) ? ids : [];
  }

  /** Persist the component-source actor ids. */
  setCraftingComponentSourceIds(ids) {
    return setSetting(SETTING_KEYS.LAST_COMPONENT_SOURCES, Array.isArray(ids) ? ids : []);
  }

  /** The player's favourite recipe ids (client-scoped). */
  getFavouriteRecipeIds() {
    const ids = getSetting(SETTING_KEYS.FAVOURITE_RECIPES);
    return Array.isArray(ids) ? ids : [];
  }

  /** Toggle a recipe's favourite state and persist the updated id list. */
  toggleFavouriteRecipe(recipeId) {
    const current = this.getFavouriteRecipeIds();
    if (!recipeId) return current;
    const next = current.includes(recipeId)
      ? current.filter((id) => id !== recipeId)
      : [...current, recipeId];
    setSetting(SETTING_KEYS.FAVOURITE_RECIPES, next);
    return next;
  }

  /**
   * The player's stored progressive result orders. USER-scoped, NOT client-scoped: per user PER
   * WORLD, so another world gets a fresh map. The `getFavouriteRecipeIds` neighbour IS client-scoped.
   */
  getProgressiveResultOrder() {
    const stored = getSetting(SETTING_KEYS.PROGRESSIVE_RESULT_ORDER);
    return stored && typeof stored === 'object' ? stored : {};
  }

  /**
   * The Foundry edge for the `getPlayerResultOrder` seam (issue 651): a settings read answering DATA,
   * the reconciliation living in `applyPlayerResultOrder`.
   */
  _readPlayerResultOrder(entry) {
    const key = progressiveOrderKey(entry);
    if (!key) return null;
    const order = this.getProgressiveResultOrder()[key];
    return Array.isArray(order) ? order : null;
  }

  /**
   * Persist the player's preferred result order for one namespaced key. ASYNC AND MUST BE AWAITED:
   * under `user` scope `set` is a replicated write that can REJECT, unlike the client-scoped
   * fire-and-forget in `toggleFavouriteRecipe`.
   */
  async setProgressiveResultOrder(key, orderedIds) {
    const current = this.getProgressiveResultOrder();
    if (!key) return current;
    const next = { ...current, [key]: Array.isArray(orderedIds) ? orderedIds : [] };
    await setSetting(SETTING_KEYS.PROGRESSIVE_RESULT_ORDER, next);
    return next;
  }

  /**
   * Whether the player hides unavailable gathering environments. `scope: 'client'`, so it persists in
   * that browser's `localStorage`, per device rather than per user.
   */
  getHideUnavailableEnvironments() {
    // `Boolean()` rather than `=== true`: the setting is registered `type: Boolean`, and the
    // strict compare trips a static-analysis false positive.
    return Boolean(getSetting(SETTING_KEYS.GATHERING_HIDE_UNAVAILABLE));
  }

  /**
   * Persist the "hide unavailable environments" preference, client-scoped and view-only: it changes
   * no saved data, no engine listing and no GM configuration.
   */
  setHideUnavailableEnvironments(value) {
    return setSetting(SETTING_KEYS.GATHERING_HIDE_UNAVAILABLE, value === true);
  }

  /**
   * Read current gathering conditions and configured tag vocabularies. Player-safe: weather,
   * time-of-day and the available tags, but no GM-only library internals.
   */
  getGatheringConditions() {
    this._requireReady();
    return this.gatheringRichStateService?.getConditions();
  }

  _requireReady() {
    if (!this.ready) throw new Error('Fabricate not initialized');
  }

  _requireGM() {
    if (game.user?.isGM !== true) throw new Error('Gathering rich state changes require a GM user');
  }

  /** Cached authority availability; it neither provisions a ledger nor releases a claim. */
  getJournalRunAuthorityAvailability() {
    return this.journalRunCommands?.getJournalRunAuthorityAvailability()
      ?? authorityUnavailableAvailability();
  }

  /** Current world time in seconds, on this edge so the Journal store stays free of `game.*`. */
  getWorldTime() {
    return Number(game.time?.worldTime || 0);
  }

  /**
   * Advance a crafting run's current step — the single player-triggerable advance boundary. `craft()`
   * writes directly to the source actors, so a non-owner gets a "needs owner" message rather than a
   * throw. THE RECIPE COMES FROM THE RESOLVED RUN, NEVER THE CALLER (issue 966).
   */
  async advanceCraftingRun({ actorId, runId, interactive = false } = {}) {
    this._requireReady();
    const actor = game.actors?.get(actorId);
    const run = actor ? (this.craftingRunManager?.getActiveRun(actor, runId) ?? null) : null;
    const resolved = resolveAdvanceSources({ actor, run, fromUuid: globalThis.fromUuidSync });
    if (resolved.blocked) {
      return { success: false, message: localizeGathering('FABRICATE.App.Journal.Actions.NeedsOwner') };
    }
    // A run that vanished between render and click has no recipe to resolve. Report it rather than
    // falling through to `craft()`, which would treat the missing run as a fresh craft.
    if (!run?.recipeId) {
      return { success: false, message: localizeGathering('FABRICATE.App.Journal.Actions.NoRun') };
    }
    return this.craft(actor, run.recipeId, {
      runId,
      componentSourceActors: resolved.componentSourceActors,
      interactive,
    });
  }

  /**
   * Cancel a player's in-progress craft (issue 848), reusing `advanceCraftingRun`'s ownership guard:
   * `cancelCraft` restores items to the source actors, so a non-owner is blocked gracefully.
   */
  async cancelCraftingRun({ actorId, runId } = {}) {
    this._requireReady();
    const actor = game.actors?.get(actorId);
    const run = actor ? (this.craftingRunManager?.getActiveRun(actor, runId) ?? null) : null;
    const resolved = resolveAdvanceSources({ actor, run, fromUuid: globalThis.fromUuidSync });
    if (resolved.blocked) {
      return {
        success: false,
        message: localizeGathering('FABRICATE.App.Journal.Actions.NeedsOwner'),
      };
    }
    const result = await this.craftingEngine.cancelCraft(
      actor,
      resolved.componentSourceActors,
      runId
    );
    if (result?.success && result.cancelled) {
      let key = 'FABRICATE.App.Journal.Actions.Cancelled';
      if (result.refunded) {
        key = 'FABRICATE.App.Journal.Actions.CancelledRefunded';
      } else if (result.partialRefund) {
        // A partial reversal must not claim a full return: some inputs came back and others,
        // or the currency refund, could not be restored.
        key = 'FABRICATE.App.Journal.Actions.CancelledPartial';
      }
      return { ...result, message: localizeGathering(key) };
    }
    return result;
  }

  /**
   * Craft a recipe for a resolved Actor DOCUMENT — never an id or uuid string; {@link
   * Fabricate#craftRecipe} is the player-facing actor-ID facade. One-call execution is preserved
   * when the stage is ready and all choices are supplied; new starts use version 1 through active-GM
   * authority, waiting stages and unresolved choices stay in the Journal without editable-material
   * spending, and resuming an existing unversioned run keeps its legacy contract.
   * Required versioned checks use the authority's player prompt and GM evaluation; a SECRET check
   * uses a generic prompt and GM private posting with no player roll-data handoff, and Foundry's
   * whisper presentation is not a server confidentiality guarantee.
   */
  async craft(actor, recipe, options = {}) {
    if (!this.ready) {
      throw new Error('Fabricate not initialized');
    }

    // Capture the id BEFORE the reassignment, so the not-found message names it: reading `recipe`
    // after the lookup always reported "Recipe undefined not found".
    if (typeof recipe === 'string') {
      const recipeId = recipe;
      recipe = this.recipeManager.getRecipe(recipeId);
      if (!recipe) {
        throw new Error(`Recipe ${recipeId} not found`);
      }
    }

    const componentSourceActors = Array.isArray(options.componentSourceActors)
      ? options.componentSourceActors.filter(Boolean)
      : [actor];

    const ingredientSetId = options.ingredientSetId || null;

    return executePublicCraft({
      engine: this.craftingEngine,
      runManager: this.craftingRunManager,
      actor,
      sourceActors: componentSourceActors,
      recipe,
      ingredientSetId,
      options,
      executeCommand: (command, options) => this.executeJournalRunCommand(command, options),
      resolveUuid: (uuid) => globalThis.fromUuid?.(uuid),
    });
  }

  /**
   * Delete a recipe by id through `CraftingSystemManager.deleteRecipes` (issue 1132), so this public
   * API and the GM studio cannot disagree about what deleting a recipe reaches.
   */
  async deleteRecipe(recipeId) {
    if (!this.ready) {
      throw new Error('Fabricate not initialized');
    }

    const recipe = this.recipeManager.getRecipe(recipeId);
    if (!recipe) {
      throw new Error(`Recipe ${recipeId} not found`);
    }

    return await this.craftingSystemManager.deleteRecipes(recipe.craftingSystemId, [recipeId]);
  }
}

/** Install one facade slice as prototype methods, matching the descriptors a class method carries. */
function installFacadeSlice(slice) {
  const descriptors = {};
  for (const [name, value] of Object.entries(slice)) {
    descriptors[name] = { value, enumerable: false, writable: true, configurable: true };
  }
  Object.defineProperties(Fabricate.prototype, descriptors);
  return Object.keys(descriptors);
}

// The four slices go on the PROTOTYPE and never on the instance: a class method is non-enumerable,
// writable and configurable, and `tests/bootstrap/fabricate-boot-contract.test.js` pins both halves.
installFacadeSlice(gatheringFacade);
installFacadeSlice(companionFacade);
installFacadeSlice(bulkFacade);
installFacadeSlice(journalFacade);

const fabricate = new Fabricate();

// Bind the public API onto the live `game.fabricate` global. A pure assignment, idempotent and safe
// from BOTH `init` and `ready`, the latter backstopping a manager stalled on "still loading".
function bindFabricateGlobal() {
  game.fabricate = fabricate;
  // Expose the manager singleton so the region behaviour event handlers can resolve
  // `game.fabricate.interactableManager` to dispatch onRegionEnter and onRegionExit.
  game.fabricate.interactableManager = InteractableManager.instance;
  game.fabricate.gathering = {
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
    getRegionStore: () => { deprecate('gathering.getRegionStore', 'gathering.getRealmStore'); return fabricate.getGatheringRealmStore(); },
    setPartyRegionOverride: (options) => { deprecate('gathering.setPartyRegionOverride', 'gathering.setPartyRealmOverride'); return fabricate.setGatheringPartyRealmOverride({ ...options, realmIds: options?.realmIds ?? options?.regionIds }); },
    clearPartyRegionOverride: (options) => { deprecate('gathering.clearPartyRegionOverride', 'gathering.clearPartyRealmOverride'); return fabricate.clearGatheringPartyRealmOverride(options); },
    revealRegionForActor: (options) => { deprecate('gathering.revealRegionForActor', 'gathering.revealRealmForActor'); return fabricate.revealGatheringRealmForActor({ ...options, realmId: options?.realmId ?? options?.regionId }); },
    hideRegionForActor: (options) => { deprecate('gathering.hideRegionForActor', 'gathering.hideRealmForActor'); return fabricate.hideGatheringRealmForActor({ ...options, realmId: options?.realmId ?? options?.regionId }); }
  };

  // Classes exposed for advanced users.
  game.fabricate.api = {
    Recipe,
    Ingredient,
    IngredientGroup,
    RecipeManager,
    CraftingEngine,
    getFabricateAppClass,
    loadCraftingSystemManagerAppClass,
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
    // The named, versioned contract for outbound BEHAVIOURAL consumption (issue 1289), frozen at
    // module load and assigned HERE AND NOWHERE ELSE. ITS `stable` MEMBERS ARE METHODS ON THE
    // FACADE: publishing a grant symbol here would hand out a GM-gated write without its gate.
    COMPANION: COMPANION_CONTRACT
  };
  managerExtensions.bindPublicApi(game.fabricate.api);
  // Both registries are page-session singletons imported at module scope, so the init and ready
  // replays re-publish the SAME registry: a companion registered during its own `init` survives.
  playerExtensions.bindPublicApi(game.fabricate.api);

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

  game.fabricate.importSystemFromFile = async (file, options = {}) => {
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
      overwriteExisting: options.overwriteExisting || false
    });
  };

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
  const t = (key, fallback, data) => {
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
      t('FABRICATE.Canvas.Cleanup.NothingToDo', 'No Fabricate interactables found. Nothing to clean up.')
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
        scenes: summary.scenesTouched
      }
    )}</p>`,
    yes: { label: t('FABRICATE.Canvas.Cleanup.Confirm', 'Remove them') },
    no: { label: t('FABRICATE.Canvas.Cleanup.Cancel', 'Cancel') }
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
 * Issue 555 (repurposed by 567) — the one-shot, primary-GM-gated backfill stamping
 * `roles[systemId].recipeItemDefinitionId` on each definition's source Item, PER OWNING SYSTEM so a
 * source registered twice lands both leaves. NOT a MigrationRunner entry.
 */
async function runRecipeItemFlagAutoStamp() {
  try {
    // Primary-GM only, so exactly one client performs the write in a multi-GM world.
    if (game.users?.activeGM?.id !== game.user?.id) return;
    if (Number(getSetting(SETTING_KEYS.RECIPE_ITEM_FLAG_STAMP_VERSION)) >= RECIPE_ITEM_FLAG_STAMP_TARGET) {
      return;
    }
    const manager = fabricate?.getCraftingSystemManager?.();
    if (!manager?.autoStampRecipeItemSources) return;
    const summary = await manager.autoStampRecipeItemSources();
    console.debug?.('Fabricate | recipe-item durable-flag auto-stamp complete', summary);
    await setSetting(SETTING_KEYS.RECIPE_ITEM_FLAG_STAMP_VERSION, RECIPE_ITEM_FLAG_STAMP_TARGET);
  } catch (error) {
    console.error('Fabricate | recipe-item durable-flag auto-stamp failed', error);
  }
}

/**
 * Issue 556 — the one-shot, primary-GM-gated backfill stamping `roles[system.id].componentId` onto
 * every registered component's source Item, BEFORE THE `updateItem` HOOK REGISTERS so restamp writes
 * cannot storm. ITS VERSION ADVANCE IS WITHHELD while `1.30.0` has not completed (requirement 17).
 */
async function runComponentFlagAutoStamp() {
  try {
    // Primary-GM only, so exactly one client performs the write in a multi-GM world.
    if (game.users?.activeGM?.id !== game.user?.id) return;
    if (Number(getSetting(SETTING_KEYS.COMPONENT_FLAG_STAMP_VERSION)) >= COMPONENT_FLAG_STAMP_TARGET) {
      return;
    }
    const manager = fabricate?.getCraftingSystemManager?.();
    if (!manager?.autoStampComponentSources) return;
    const summary = await manager.autoStampComponentSources();
    console.debug?.('Fabricate | component durable-flag auto-stamp complete', summary);
    // WITHHOLD THE VERSION ADVANCE UNTIL THE PRODUCING MIGRATION HAS COMPLETED (issue 1363);
    // `destructive-changes-and-migrations/spec.md` § World-Scope Entity Migration requirement 17
    // owns the rule and the permanent damage an unconditional advance produces.
    if (!mayClearWorldScopeRekeyMap(getSetting(SETTING_KEYS.MIGRATION_VERSION))) return;
    await setSetting(SETTING_KEYS.COMPONENT_FLAG_STAMP_VERSION, COMPONENT_FLAG_STAMP_TARGET);
  } catch (error) {
    console.error('Fabricate | component durable-flag auto-stamp failed', error);
  }
}

/**
 * Issue 561 — the one-shot, primary-GM-gated backfill stamping `roles[system.id].toolId` onto every
 * registered tool's source Item, withholding its advance for `runComponentFlagAutoStamp`'s reason.
 * ORDERING IS LOAD-BEARING: after `1.15.0` populates the source refs, before `updateItem` registers.
 */
async function runToolFlagAutoStamp() {
  try {
    // Primary-GM only, so exactly one client performs the write in a multi-GM world.
    if (game.users?.activeGM?.id !== game.user?.id) return;
    if (Number(getSetting(SETTING_KEYS.TOOL_FLAG_STAMP_VERSION)) >= TOOL_FLAG_STAMP_TARGET) {
      return;
    }
    const manager = fabricate?.getCraftingSystemManager?.();
    if (!manager?.autoStampToolSources) return;
    const summary = await manager.autoStampToolSources();
    console.debug?.('Fabricate | tool durable-flag auto-stamp complete', summary);
    // WITHHOLD THE VERSION ADVANCE UNTIL THE PRODUCING MIGRATION HAS COMPLETED (issue 1363);
    // `destructive-changes-and-migrations/spec.md` § World-Scope Entity Migration requirement 17
    // owns the rule and the permanent damage an unconditional advance produces.
    if (!mayClearWorldScopeRekeyMap(getSetting(SETTING_KEYS.MIGRATION_VERSION))) return;
    await setSetting(SETTING_KEYS.TOOL_FLAG_STAMP_VERSION, TOOL_FLAG_STAMP_TARGET);
  } catch (error) {
    console.error('Fabricate | tool durable-flag auto-stamp failed', error);
  }
}

/**
 * Issue 600 — the one-shot, active-GM-gated re-stamp writing `roles[systemId].componentId` onto OWNED
 * actor items resolving to a component by NAME ONLY. SCOPE: `game.actors` only, never an unlinked
 * synthetic-token actor. NOT a MigrationRunner entry: that runner has no Item handle.
 */
async function runOwnedItemComponentIdentityRestamp() {
  try {
    // Active-GM only, so exactly one client performs the inventory writes.
    if (game.users?.activeGM?.id !== game.user?.id) return;
    if (
      Number(getSetting(SETTING_KEYS.OWNED_ITEM_COMPONENT_STAMP_VERSION)) >=
      OWNED_ITEM_COMPONENT_STAMP_TARGET
    ) {
      return;
    }
    const manager = fabricate?.getCraftingSystemManager?.();
    const systems = manager?.getSystems?.() ?? [];
    const summary = await restampOwnedItemComponentIdentity({
      actors: game.actors ?? [],
      systems,
      writeFlag: (item, flagKey, componentId) => setFabricateFlag(item, flagKey, componentId),
    });
    console.debug?.('Fabricate | owned-item component identity re-stamp complete', summary);
    await setSetting(
      SETTING_KEYS.OWNED_ITEM_COMPONENT_STAMP_VERSION,
      OWNED_ITEM_COMPONENT_STAMP_TARGET
    );
  } catch (error) {
    console.error('Fabricate | owned-item component identity re-stamp failed', error);
  }
}

/**
 * Issue 1363 — the one-shot, active-GM-gated pass remapping every durable identity flag the `1.30.0`
 * re-key invalidated. THE TWO GATES ARE DIFFERENT AND MUST STAY SO; § World-Scope Entity Migration
 * requirements 13 and 17 own both, the `compareSemver` rule and the withheld version advance.
 */
async function runWorldScopeIdentityFlagRemap() {
  try {
    // Active-GM only, so exactly one client performs the writes.
    if (game.users?.activeGM?.id !== game.user?.id) return;
    if (
      Number(getSetting(SETTING_KEYS.WORLD_SCOPE_IDENTITY_FLAG_VERSION)) >=
      WORLD_SCOPE_IDENTITY_FLAG_TARGET
    ) {
      return;
    }
    // THE RUN GATE IS CORPUS-DERIVED: a seeded scope with no pending map has nothing to remap, and a
    // world with nothing to remap still falls through to the version advance so it stops re-checking
    // — an advance itself gated on migration completion, so a deferred migration re-runs.
    const rekeyMap = getSetting(SETTING_KEYS.WORLD_SCOPE_REKEY_MAP) ?? {};
    let summary = null;
    if (hasPendingWorldScopeRekey(() => rekeyMap)) {
      summary = await applyWorldScopeIdentityFlagRemap(rekeyMap);
    }

    // THE CLEAR and the version advance share ONE gate, on `compareSemver` in the pure module so no
    // reader re-derives it as a bare JS `>=` over a STRING setting.
    if (!mayClearWorldScopeRekeyMap(getSetting(SETTING_KEYS.MIGRATION_VERSION))) {
      console.warn(
        'Fabricate | world-scope re-key map RETAINED: the 1.30.0 migration has not completed on this world yet, so the decision record it may still need is not destroyed. This pass will run again after a successful migration pass.'
      );
      return;
    }
    // THE SECOND WITHHOLD, asking whether THIS pass completed where the first asks about the
    // PRODUCING migration: destroying the map would strand a rejected write's actor on retired ids.
    if (!remapCompletedCleanly(summary)) {
      console.warn(
        `Fabricate | world-scope re-key map RETAINED: ${summary.skippedErrors} document(s) could not be updated, so the repair is incomplete and its decision record is not destroyed. Fix the cause and reload, or run game.fabricate.remapWorldScopeIdentityFlags().`
      );
      return;
    }
    await setSetting(SETTING_KEYS.WORLD_SCOPE_REKEY_MAP, {});
    await setSetting(
      SETTING_KEYS.WORLD_SCOPE_IDENTITY_FLAG_VERSION,
      WORLD_SCOPE_IDENTITY_FLAG_TARGET
    );
  } catch (error) {
    console.error('Fabricate | world-scope identity flag remap failed', error);
  }
}

/** Apply the remap and post its GM notice; the gating above is the decision, this is the work. */
async function applyWorldScopeIdentityFlagRemap(rekeyMap) {
    const summary = await remapIdentityFlagsAcrossActors({
      actors: game.actors ?? [],
      rekeyMap,
      // Two depths, deliberately: the containers, the roles map and the legacy scalar are DOUBLY
      // nested under `flags.fabricate.fabricate.<key>`, while `gatheringRuns` is single-scope.
      readFlag: (document, key, fallback = null, options = {}) =>
        options.bare
          ? (document?.getFlag?.('fabricate', key) ?? fallback)
          : getFabricateFlag(document, key, fallback),
      writeFabricateFlag: (document, key, value) => setFabricateFlag(document, key, value),
      writeBareFlag: (document, key, value) => document?.setFlag?.('fabricate', key, value),
    });
    console.debug?.('Fabricate | world-scope identity flag remap complete', summary);

    const notice = buildWorldScopeIdentityRemapNotice(summary, (key, data) =>
      data ? game.i18n?.format?.(key, data) : game.i18n?.localize?.(key)
    );
    if (notice.message && game.user?.isGM) {
      logMigrationNoticeDetail('1.30.0 world-scope identity flag remap', notice.detail);
      ui.notifications?.warn?.(notice.message, { permanent: true });
    }
    return summary;
}

/**
 * Issue 1654 — the one-shot, active-GM-gated pass remapping every durable essence reference the
 * `1.34.0` merge invalidated. It mirrors `runWorldScopeIdentityFlagRemap` but carries its OWN
 * decision record, so a world that consumed one may still owe the other.
 */
async function runWorldEssenceMergeFlagRemap() {
  try {
    // Active-GM only, so exactly one client performs the writes.
    if (game.users?.activeGM?.id !== game.user?.id) return;
    if (
      Number(getSetting(SETTING_KEYS.WORLD_ESSENCE_MERGE_FLAG_VERSION)) >=
      WORLD_ESSENCE_MERGE_FLAG_TARGET
    ) {
      return;
    }
    // The run gate. A world with nothing to remap still falls through to the version advance so it
    // stops re-checking every boot; that advance is itself gated on migration completion.
    const mergeMap = getSetting(SETTING_KEYS.WORLD_ESSENCE_MERGE_MAP) ?? {};
    let summary = null;
    if (hasPendingWorldEssenceMerge(mergeMap)) {
      summary = await applyWorldEssenceMergeFlagRemap(mergeMap);
    }

    // The clear and the version advance share one gate, on `compareSemver` in the pure module so
    // no reader re-derives it as a bare JS `>=` on a string setting.
    if (!mayClearWorldEssenceMergeMap(getSetting(SETTING_KEYS.MIGRATION_VERSION))) {
      console.warn(
        'Fabricate | world essence merge map RETAINED: the 1.34.0 migration has not completed on this world yet, so the decision record it may still need is not destroyed. This pass will run again after a successful migration pass.'
      );
      return;
    }
    // The second withhold asks a different question from the first: that gate asks whether the
    // producing migration completed, this whether this pass did.
    if (!remapCompletedCleanly(summary)) {
      console.warn(
        `Fabricate | world essence merge map RETAINED: ${summary.skippedErrors} document(s) could not be updated, so the repair is incomplete and its decision record is not destroyed. Fix the cause and reload, or run game.fabricate.remapWorldEssenceIdentityFlags().`
      );
      return;
    }
    // The `systems` leg only, `retired` written back explicitly: it is the tombstone keeping a
    // retired essence id taken for the life of the world, so a `{}` clear would let it reissue.
    const stored = getSetting(SETTING_KEYS.WORLD_ESSENCE_MERGE_MAP) ?? {};
    await setSetting(SETTING_KEYS.WORLD_ESSENCE_MERGE_MAP, {
      systems: {},
      retired: stored.retired ?? {},
    });
    await setSetting(
      SETTING_KEYS.WORLD_ESSENCE_MERGE_FLAG_VERSION,
      WORLD_ESSENCE_MERGE_FLAG_TARGET
    );
  } catch (error) {
    console.error('Fabricate | world essence merge flag remap failed', error);
  }
}

/**
 * Apply the essence remap; the gating above is the decision. EVERY WRITE IS A FORCED REPLACEMENT,
 * never `setFabricateFlag`: an essence id is an object KEY and `Document#update` merges without
 * deleting, so a merge write would leave the retired key beside the new one.
 */
async function applyWorldEssenceMergeFlagRemap(mergeMap) {
  // A write counts as landed on the strength of not throwing, so the counts can overstate —
  // deliberately, the overstatement reaching no gate that `skippedErrors` does not already serve.
  const replace = (document, path, value) => document?.update?.({ [path]: value });
  const summary = await remapEssenceFlagsAcrossActors({
    actors: game.actors ?? [],
    mergeMap,
    // The same two read depths the `1.30.0` edge supplies, for the same reason.
    readFlag: (document, key, fallback = null, options = {}) =>
      options.bare
        ? (document?.getFlag?.('fabricate', key) ?? fallback)
        : getFabricateFlag(document, key, fallback),
    replaceFabricateFlag: (document, key, value) =>
      replace(document, forcedReplacementFlagPath(key), value),
    replaceBareFlag: (document, key, value) =>
      replace(document, forcedReplacementFlagPath(key, { bare: true }), value),
  });
  console.debug?.('Fabricate | world essence merge flag remap complete', summary);

  // The GM channel: a refused group leaves the world merged in its settings and un-merged in its
  // actor flags, the one outcome of this pass a GM must act on.
  const notice = buildWorldEssenceMergeRemapNotice(summary, (key, data) =>
    data ? game.i18n?.format?.(key, data) : game.i18n?.localize?.(key)
  );
  if (notice.message && game.user?.isGM) {
    logMigrationNoticeDetail('1.34.0 essence flag remap', notice.detail);
    ui.notifications?.warn?.(notice.message, { permanent: true });
  }
  return summary;
}

/**
 * Run the env-node-driven marker image sync across all scenes, resolving environment and task the
 * way InteractableManager does and writing the tile texture as the active GM.
 */
async function runInteractableMarkerSync() {
  try {
    const environmentStore = fabricate?.getGatheringEnvironmentStore?.() ?? null;
    await syncInteractableMarkers({
      scenes: game.scenes,
      isActiveGM: () => game.user?.id === game.users?.activeGM?.id,
      resolveEnvironment: (environmentId) => environmentStore?.get?.(environmentId) ?? null,
      resolveTask: (systemId, taskId) => {
        const config = getSetting(SETTING_KEYS.GATHERING_CONFIG);
        const tasks = config?.systems?.[systemId]?.tasks;
        return (Array.isArray(tasks) ? tasks : []).find(task => task?.id === taskId) ?? null;
      },
      applyTileImage: (tile, update) => tile?.update?.(update)
    });
  } catch (_error) {
    // Defensive: marker sync must never throw into a hook body.
  }
}

/**
 * What `src/bootstrap/` needs from the module entry: the singleton, the world-time dispatcher, the
 * startup one-shots, the marker sync and the deferred manager entry. The dependency runs one way —
 * `src/main.js` to `src/bootstrap/` — so no bootstrap module imports this file.
 */
const io = {
  fabricate,
  bindFabricateGlobal,
  processFabricateWorldTime,
  reportManagerLoadFailure,
  reportStaleEntryScript,
  runComponentFlagAutoStamp,
  runInteractableMarkerSync,
  runOwnedItemComponentIdentityRestamp,
  runRecipeItemFlagAutoStamp,
  runToolFlagAutoStamp,
  runWorldEssenceMergeFlagRemap,
  runWorldScopeIdentityFlagRemap,
  showCraftingSystemManagerApp,
};

registerModuleHooks(io);

// The macro-facing public surface.
globalThis.fabricate = {
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
    return openDeferredAppRethrowing(showCraftingSystemManagerApp, reportManagerLoadFailure);
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
  }
};

export const __test = {
  createGatheringToolAvailability,
  createGatheringToolBreakage,
  createGatheringResultCreator,
  matchGatheringTools
};

/**
 * The rest of the `ready` startup, exported so a Foundry-free host can run it: these flag
 * auto-stamps populate the tier-1 `roles` identity `sourceUuid.js` resolves against, and the listed
 * ORDER is load-bearing. Exported as a BLOCK, several tests asserting on their literal source text.
 */
export {
  processFabricateWorldTime,
  runRecipeItemFlagAutoStamp,
  runComponentFlagAutoStamp,
  runToolFlagAutoStamp,
  runOwnedItemComponentIdentityRestamp,
  runWorldScopeIdentityFlagRemap,
};

export default fabricate;
