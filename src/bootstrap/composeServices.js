/**
 * The composition root: everything `Fabricate#initialize()` builds, in phases whose order is
 * load-bearing and silent when wrong. The boot-contract suite pins that order behaviourally.
 */

import {
  applyInteractableBehaviorUpdate,
  resolveInteractableBehaviorByRef,
  writeInteractableBehaviorNode,
} from '../canvas/interactableSocketBridge.js';
import { isGatheringActorSelectableByUser } from '../config/preferencesCleanup.js';
import { getSetting, setSetting, SETTING_KEYS } from '../config/settings.js';
import {
  createGatheringSceneAccess,
  evaluateGatheringExpression,
  resolveViewerScene,
  senseTravelMarkerRegions,
} from '../gatheringBootstrapAdapters.js';
import { createGatheringResultCreator } from '../gatheringResultCreation.js';
import { createGatheringToolAvailability } from '../gatheringToolRuntime.js';
import { ItemPilesIntegration } from '../integrations/ItemPilesIntegration.js';
import { logMigrationNoticeDetail } from '../migration/migrationNoticeDetail.js';
import { CharacterLibrariesStore } from '../systems/CharacterLibrariesStore.js';
import { evaluatePreparedRunCheck } from '../systems/checkRoll.js';
import { ActorInventoryCoinSpender, ActorPropertyCoinSpender } from '../systems/CoinSpenders.js';
import { CompendiumImporter, scopeStoreDelegate } from '../systems/CompendiumImporter.js';
import { createComplicationDeliveryWriter } from '../systems/complicationSocket.js';
import { CraftingEngine } from '../systems/CraftingEngine.js';
import { CraftingRunManager } from '../systems/CraftingRunManager.js';
import { CraftingSystemManager } from '../systems/CraftingSystemManager.js';
import { CurrencyConfigStore } from '../systems/CurrencyConfigStore.js';
import { EVENT_SCENE_SOCKET, createEventSceneTrigger } from '../systems/eventSceneCoordinator.js';
import { secondsPerUnitFromCalendar } from '../systems/foundryCalendar.js';
import { registerFragmentDiscoveryHook } from '../systems/FragmentDiscoveryHook.js';
import { createGatheringBlindStartWriter } from '../systems/gatheringBlindRunSocket.js';
import { GatheringBlindRunStore } from '../systems/GatheringBlindRunStore.js';
import { GatheringEngine } from '../systems/GatheringEngine.js';
import { GatheringEnvironmentStore } from '../systems/GatheringEnvironmentStore.js';
import { GatheringGateAndCheckEvaluator } from '../systems/GatheringGateAndCheckEvaluator.js';
import { GatheringHookPublisher } from '../systems/GatheringHookPublisher.js';
import { GatheringLocationService } from '../systems/GatheringLocationService.js';
import { createGatheringNodeDepletionWriter } from '../systems/gatheringNodeSocket.js';
import { GatheringPartyStore } from '../systems/GatheringPartyStore.js';
import { GatheringRealmStore } from '../systems/GatheringRealmStore.js';
import { GatheringRichStateService } from '../systems/GatheringRichStateService.js';
import { GatheringRunManager } from '../systems/GatheringRunManager.js';
import { installGatheringJournalRunAuthority } from '../systems/journalRunCommands.js';
import { Pf2eInventoryCoinAdapter } from '../systems/Pf2eInventoryCoinAdapter.js';
import { registerRecipeItemLearningHook } from '../systems/RecipeItemLearningHook.js';
import { RecipeManager } from '../systems/RecipeManager.js';
import { RecipeVisibilityService } from '../systems/RecipeVisibilityService.js';
import { ResolutionModeService } from '../systems/ResolutionModeService.js';
import { SalvageRunManager } from '../systems/SalvageRunManager.js';
import { readPersistedCraftingSystems } from '../systems/SettingsCraftingDefinitionRepository.js';
import { runStartupMaintenance } from '../systems/startupMaintenance.js';
import { composeStartupPassList } from '../systems/startupPassComposition.js';
import { reportWorldIdentityDrift } from '../systems/worldIdentityDrift.js';
import { describeWorldIdentityDrift } from '../systems/worldScopeEntityNotice.js';
import {
  createComponentScopeStore,
  createEssenceScopeStore,
  createToolScopeStore,
} from '../systems/worldScopeStores.js';
import { createWorldVocabularyStore } from '../systems/WorldVocabularyStore.js';
import { enrichToHtml, primeEnricherCache } from '../ui/svelte/util/foundryBridge.js';
import { applyCurrentFabricateTheme } from '../ui/theme.js';
import { findMatchingComponent } from '../utils/essenceResolver.js';
import { STARTUP_PHASES, createStartupMarks } from '../utils/startupMarks.js';

import {
  createGatheringFailureFeedback,
  createGatheringToolBreakage,
  getGatheringEngine,
  getGatheringRunViewer,
  getGatheringSelectableActors,
  isCurrentWorldPaused,
  isSelectableGatheringActor,
  localizeGathering,
  resolveGatheringActor,
  setGatheringEngine,
} from './gatheringRuntime.js';
import { applyItemStackQuantityPathSetting } from './hooks.js';
import { createJournalCommandsForFabricate } from './journalOperations.js';
import {
  applyComplicationDelivery,
  applyGatheringBlindStart,
  showEventScenePrompt,
} from './socketRouter.js';

/** The single-writer gate every timed world-time resume is fenced with. */
const isPrimaryGM = () => game.users?.activeGM?.id === game.user?.id;

/** Open the outer startup span (issue 1073); an absent `performance` degrades to a no-op. */
function beginStartup(fabricate) {
  console.log('Fabricate | Initializing...');

  fabricate._startupMarks = createStartupMarks();
  fabricate._startupMarks.begin(STARTUP_PHASES.INITIALIZE);
}

/** Settings first: nothing below may read a key that is not registered yet. */
function registerSettingsAndTheme(fabricate) {
  fabricate.registerSettings();
  applyCurrentFabricateTheme(getSetting, SETTING_KEYS.THEME);
}

/** The migration pass, before any manager loads persisted data. */
async function runMigrationPass(fabricate) {
  // After `registerSettings()` and before `_runMigrations()`, since a migration can touch stacks.
  applyItemStackQuantityPathSetting();
  fabricate._startupMarks.begin(STARTUP_PHASES.MIGRATIONS);
  await fabricate._runMigrations();
  fabricate._startupMarks.end(STARTUP_PHASES.MIGRATIONS);
}

/** The world-scope stores, loaded before both managers derive their id basis from them. */
function buildWorldStores(fabricate) {
  // Currency first (issue 1278): the recipe manager and crafting engine both take it.
  fabricate.currencyConfigStore = new CurrencyConfigStore({
    getSetting,
    setSetting,
    randomID: () => foundry.utils.randomID(),
  });
  fabricate.currencyConfigStore.load();
  // Before both managers (issue 1308): `CraftingSystemManager` derives its Valid Id Basis from it.
  fabricate.characterLibrariesStore = new CharacterLibrariesStore({
    getSetting,
    setSetting,
    randomID: () => foundry.utils.randomID(),
  });
  fabricate.characterLibrariesStore.load();
  // After migrations, before both managers (issue 1359). Silent when wrong: `load()` is guarded, so
  // a mis-order yields an unseeded store and a `null` Valid Id Basis that prunes every world
  // reference. `tests/scoped-definition-read-and-basis.test.js` pins the source order.
  fabricate.componentScopeStore = createComponentScopeStore({ getSetting, setSetting });
  fabricate.componentScopeStore.load();
  fabricate.essenceScopeStore = createEssenceScopeStore({ getSetting, setSetting });
  fabricate.essenceScopeStore.load();
  fabricate.toolScopeStore = createToolScopeStore({ getSetting, setSetting });
  fabricate.toolScopeStore.load();
  // Issue 1392. It feeds no prune basis, so it needs only `registerSettings()`; a mis-order shows
  // an unseeded store and a rail badge of 0. Kept beside the three above for the order assertion.
  fabricate.worldVocabularyStore = createWorldVocabularyStore({ getSetting, setSetting });
  fabricate.worldVocabularyStore.load();
  // The world identity drift audit (issue 1370), once per session on the active GM (not `isGM`).
  // Drift is not a migration event, so it is not in the migration notice slot. Console only, since
  // a toast read as an alarm for a harmless state; the level is § Migration Notices' (issue 1737).
  if (game.users?.activeGM?.id === game.user?.id) {
    const worldIdentityDrift = reportWorldIdentityDrift(readPersistedCraftingSystems(), {
      components: fabricate.componentScopeStore.corpus(),
      essences: fabricate.essenceScopeStore.corpus(),
      tools: fabricate.toolScopeStore.corpus(),
    });
    const driftDetail = describeWorldIdentityDrift(worldIdentityDrift);
    logMigrationNoticeDetail('world identity drift', driftDetail);
  }
}

/** The crafting managers, services and engine, in dependency order. */
function buildCoreManagers(fabricate) {
  fabricate.recipeManager = new RecipeManager({
    getCraftingSystem: (systemId) => fabricate.craftingSystemManager?.getSystem?.(systemId) ?? null,
    getCraftingSystemManager: () => fabricate.craftingSystemManager ?? null,
    currencyConfigStore: fabricate.currencyConfigStore,
  });
  // Both enricher seams default to pass-throughs for happy-dom; production resolves only because
  // they are wired here (issue 800).
  fabricate.craftingSystemManager = new CraftingSystemManager(fabricate.recipeManager, {
    enrichToHtml: (raw, options) => enrichToHtml(raw, options),
    primeEnricherCache: (rawTexts) => primeEnricherCache(rawTexts),
  });
  // Load-bearing (issue 656): the managers default to a fail-open `() => true`, and this real check
  // is what limits every timed resume write to one client.
  fabricate.craftingRunManager = new CraftingRunManager({ isPrimaryGM });
  fabricate.salvageRunManager = new SalvageRunManager({ isPrimaryGM });
  fabricate.gatheringRunManager = new GatheringRunManager();
  fabricate.gatheringGateAndCheckEvaluator = new GatheringGateAndCheckEvaluator({
    evaluateExpression: evaluateGatheringExpression,
  });
  fabricate.recipeVisibilityService = new RecipeVisibilityService(
    fabricate.recipeManager,
    fabricate.craftingSystemManager,
    undefined,
    // The inventory snapshot's resolver, shared by every production snapshot (issue 1228).
    findMatchingComponent
  );
  fabricate.resolutionModeService = new ResolutionModeService(fabricate.craftingSystemManager, {
    getPlayerResultOrder: (entry) => fabricate._readPlayerResultOrder(entry),
  });
  fabricate.itemPilesIntegration = new ItemPilesIntegration();
  fabricate.itemPilesIntegration.detect();
  // Coin adapters are keyed by `game.system.id`; pf2e is the only one.
  fabricate.actorInventoryCoinSpender = new ActorInventoryCoinSpender({
    adapters: new Map([['pf2e', new Pf2eInventoryCoinAdapter()]]),
  });
  fabricate.actorPropertyCoinSpender = new ActorPropertyCoinSpender();
  // The gathering persistence seams, so the public API persists the authoring bundle (issue 699).
  // The stores are built after this importer, so each resolves lazily.
  fabricate.compendiumImporter = new CompendiumImporter(
    fabricate.craftingSystemManager,
    fabricate.recipeManager,
    {
      environmentStore: {
        list: () => fabricate.gatheringEnvironmentStore?.list?.() ?? [],
        load: () => fabricate.gatheringEnvironmentStore?.load?.() ?? [],
        save: (environments) => fabricate.gatheringEnvironmentStore?.save?.(environments),
      },
      // An unassigned realm store answers null, so the merge takes the raw-setting path.
      travelStore: {
        get: () => fabricate.gatheringRealmStore?.get?.() ?? null,
        save: (config) => fabricate.gatheringRealmStore?.save?.(config),
      },
      getSetting: (key) => getSetting(key),
      setSetting: (key, value) => setSetting(key, value),
      isGM: () => game.user?.isGM === true,
      // Delegators over the field (issue 1364): the merge fails closed on an absent store, so a
      // captured still-undefined value would merge nothing and report success.
      componentScopeStore: scopeStoreDelegate(() => fabricate.componentScopeStore),
      essenceScopeStore: scopeStoreDelegate(() => fabricate.essenceScopeStore),
      toolScopeStore: scopeStoreDelegate(() => fabricate.toolScopeStore),
    }
  );
  fabricate.craftingEngine = new CraftingEngine(
    fabricate.recipeManager,
    fabricate.craftingRunManager,
    fabricate.resolutionModeService,
    fabricate.itemPilesIntegration,
    fabricate.salvageRunManager,
    fabricate.actorInventoryCoinSpender,
    fabricate.actorPropertyCoinSpender,
    {
      getPlayerResultOrder: (entry) => fabricate._readPlayerResultOrder(entry),
      getCraftingSystem: (systemId) => fabricate.craftingSystemManager.getSystem(systemId),
      resolveItemUuid: (uuid) => fromUuid(uuid),
      currencyConfigStore: fabricate.currencyConfigStore,
    }
  );
  fabricate.journalRunCommands = createJournalCommandsForFabricate(fabricate);
}

/** Both deserializations, the corpus-proportional half of startup. */
async function loadPersistedData(fabricate) {
  fabricate._startupMarks.begin(STARTUP_PHASES.DATA_LOAD);
  await fabricate.recipeManager.initialize();
  await fabricate.craftingSystemManager.initialize();
  fabricate._startupMarks.end(STARTUP_PHASES.DATA_LOAD);
}

/** The gathering world stores and the current-realm resolver. */
function buildGatheringStores(fabricate) {
  // First (issue 1282): the environment store validates realm references against it.
  fabricate.gatheringRealmStore = new GatheringRealmStore({
    getSetting,
    setSetting,
    randomID: () => foundry.utils.randomID(),
  });
  fabricate.gatheringRealmStore.load();
  fabricate.gatheringEnvironmentStore = new GatheringEnvironmentStore({
    systemManager: fabricate.craftingSystemManager,
    travelStore: fabricate.gatheringRealmStore,
    runCleanup: {
      removeRunsForSystem: (systemId) =>
        fabricate.gatheringRunManager.removeRunsForSystem(systemId),
      removeRunsForEnvironment: (environmentId) =>
        fabricate.gatheringRunManager.removeRunsForEnvironment(environmentId),
      removeRunsForTask: (taskId, options) =>
        fabricate.gatheringRunManager.removeRunsForTask(taskId, options),
    },
  });
  fabricate.gatheringEnvironmentStore.load();
  fabricate.gatheringPartyStore = new GatheringPartyStore({
    getSetting,
    setSetting,
    randomID: () => foundry.utils.randomID(),
    getUserId: () => game.user?.id || null,
    now: () => Date.now(),
  });
  fabricate.gatheringPartyStore.load();
  fabricate.gatheringLocationService = new GatheringLocationService({
    partyStore: fabricate.gatheringPartyStore,
    travelStore: fabricate.gatheringRealmStore,
    // The marker's Scene Regions on ANY scene, not this client's canvas (issue 1912).
    senseSceneRegions: (travelActorUuid) => {
      const resolve = globalThis.fromUuidSync;
      if (typeof resolve !== 'function' || !travelActorUuid) return [];
      let actor = null;
      try {
        actor = resolve(String(travelActorUuid));
      } catch {
        // An unresolvable travel actor senses no regions.
      }
      return senseTravelMarkerRegions({ actor });
    },
  });
}

/** The node-depletion relay and the rich-state service it writes through. */
function buildGatheringServices(fabricate) {
  // Node pools are a GM-only world setting, so a player's decrement relays to the active GM. A GM
  // applies locally, since a socket emit never reaches its emitter.
  fabricate.gatheringNodeDepletionWriter = createGatheringNodeDepletionWriter({
    isActiveGM: () => game.user?.id === game.users?.activeGM?.id,
    // `Users#activeGM` is null with no GM connected; the gather succeeds, the pool stays full.
    hasActiveGM: () => !!game.users?.activeGM,
    onUnroutable: ({ environmentId, taskId }) =>
      console.warn(
        'Fabricate | Gathering node depletion was not applied: no active GM is connected to write the world setting',
        { environmentId, taskId }
      ),
    emitDeplete: (message) => game.socket?.emit(EVENT_SCENE_SOCKET, message),
    applyDeplete: (payload) =>
      fabricate.gatheringRichStateService?.applyEnvironmentNodeDepletion(payload),
  });
  fabricate.gatheringRichStateService = new GatheringRichStateService({
    environmentStore: fabricate.gatheringEnvironmentStore,
    depleteEnvironmentNode: (payload) => fabricate.gatheringNodeDepletionWriter.deplete(payload),
    getSetting,
    setSetting,
    settingKey: SETTING_KEYS.GATHERING_CONFIG,
    nowWorldTime: () => Number(game.time?.worldTime || 0),
    getUserId: () => game.user?.id || null,
    hooks: Hooks,
    evaluateExpression: evaluateGatheringExpression,
    // Resolved per call, so a mid-session calendar change is picked up; else the Earth table.
    secondsPerUnit: (unit) => secondsPerUnitFromCalendar(unit, game.time?.calendar ?? null),
    // Interactable-scoped nodes (issue 302); the write routes through the active GM.
    resolveRegionBehavior: (ref) => resolveInteractableBehaviorByRef(ref),
    writeInteractableBehavior: (ref, patch) => writeInteractableBehaviorNode(ref, patch),
  });
}

/** The engine itself and the journal authority it answers to. */
async function buildGatheringEngine(fabricate) {
  const gatheringEngine = setGatheringEngine(
    new GatheringEngine({
      // Load-bearing: without it every connected client resumes the same matured timed run and
      // double-applies its items, tool wear and node depletion.
      resumeTimedRuns: isPrimaryGM,
      environmentStore: fabricate.gatheringEnvironmentStore,
      runManager: fabricate.gatheringRunManager,
      richState: fabricate.gatheringRichStateService,
      evaluator: fabricate.gatheringGateAndCheckEvaluator,
      systemManager: fabricate.craftingSystemManager,
      getSelectableActors: getGatheringSelectableActors,
      isActorSelectable: ({ actor, viewer }) => isGatheringActorSelectableByUser(actor, viewer),
      isGamePaused: isCurrentWorldPaused,
      sceneAccess: createGatheringSceneAccess({
        // The REQUESTING viewer's scene, not this client's (issue 1912).
        getCurrentScene: (viewer) =>
          resolveViewerScene({
            viewer,
            currentUser: game.user,
            scenes: game.scenes,
            currentScene: () =>
              game.scenes?.current ?? game.scene ?? globalThis.canvas?.scene ?? null,
          }),
      }),
      toolAvailability: createGatheringToolAvailability({
        craftingSystemManager: fabricate.craftingSystemManager,
        evaluator: fabricate.gatheringGateAndCheckEvaluator,
      }),
      resultCreator: createGatheringResultCreator(fabricate.craftingSystemManager),
      toolBreakage: createGatheringToolBreakage({
        craftingSystemManager: fabricate.craftingSystemManager,
        evaluateExpression: evaluateGatheringExpression,
      }),
      failureFeedback: createGatheringFailureFeedback(),
      hookPublisher: new GatheringHookPublisher({
        hooks: Hooks,
        nowWorldTime: () => Number(game.time?.worldTime || 0),
      }),
      eventSceneTrigger: createEventSceneTrigger({
        isGM: () => !!game.user?.isGM,
        emitPrompt: ({ sceneUuid, eventName }) =>
          game.socket?.emit(EVENT_SCENE_SOCKET, {
            action: 'eventScenePrompt',
            sceneUuid,
            eventName,
            requestedBy: game.user?.id,
          }),
        showPrompt: showEventScenePrompt,
      }),
      getRunViewer: getGatheringRunViewer,
      locationResolver: fabricate.gatheringLocationService,
      travelStore: fabricate.gatheringRealmStore,
      localize: localizeGathering,
      // Scoped-node respawn (issue 302); the `system.node` write routes through the active GM.
      scenes: () => game.scenes ?? null,
      applyInteractableBehaviorUpdate: (ref, update) =>
        applyInteractableBehaviorUpdate({
          sceneId: ref?.sceneId,
          regionId: ref?.regionId,
          behaviorId: ref?.behaviorId,
          update,
        }),
    })
  );
  installGatheringJournalRunAuthority({
    engine: gatheringEngine,
    service: fabricate.journalRunCommands,
    evaluatePreparedRunCheck,
  });
  await fabricate.journalRunCommands?.bootstrapJournalRunAuthority?.();
}

/** The blind-run and complication relays, both routed through the active GM. */
function installRelays(fabricate) {
  // A blind run's secret state is a GM-only world setting (issue 901): an integrity boundary, not
  // secrecy. A player can read it but cannot forge the task their run yields.
  fabricate.gatheringBlindRunStore = new GatheringBlindRunStore({
    getSetting,
    setSetting,
    settingKey: SETTING_KEYS.GATHERING_BLIND_RUNS,
    // The single writer: `game.settings.set` replaces, so a concurrent writer clobbers a record.
    isActiveGM: () => game.user?.id === game.users?.activeGM?.id,
    // A record counts only while its run is active, keeping a reservation provisional on every
    // path that never reaches the maturity release.
    isRunActive: ({ actorUuid, runId }) => {
      const resolve = globalThis.fromUuidSync;
      if (typeof resolve !== 'function' || !actorUuid || !runId) return true;
      let runActor = null;
      try {
        runActor = resolve(String(actorUuid));
      } catch {
        // An unresolvable actor makes the record inactive.
      }
      if (!runActor) return false;
      return Boolean(fabricate.gatheringRunManager?.getActiveRun?.(runActor, runId));
    },
    nowWorldTime: () => Number(game.time?.worldTime || 0),
  });
  // The blind draw must be out of the player's reach, so a player's blind timed start relays to the
  // active GM (issue 983), who re-runs the attempt with the requesting user as the viewer.
  fabricate.gatheringBlindStartWriter = createGatheringBlindStartWriter({
    isActiveGM: () => game.user?.id === game.users?.activeGM?.id,
    hasActiveGM: () => !!game.users?.activeGM,
    onUnroutable: ({ environmentId }) =>
      console.warn(
        'Fabricate | Blind gathering start was not applied: no active GM is connected to write the world setting',
        { environmentId }
      ),
    emitStart: (message) => game.socket?.emit(EVENT_SCENE_SOCKET, message),
    // A local apply has no socket sender, so the current user attests.
    applyStart: (payload) => applyGatheringBlindStart({ senderId: game.user?.id, ...payload }),
  });
  getGatheringEngine().installBlindRunRelay({
    store: fabricate.gatheringBlindRunStore,
    relayStart: (args) => fabricate.gatheringBlindStartWriter.start(args),
  });
  // A complication's GM card and macro run on the GM, since a macro carries its client's authority.
  // The relay carries addressing only; the GM re-reads the authored complication (issue 1286).
  fabricate.complicationDeliveryWriter = createComplicationDeliveryWriter({
    isActiveGM: () => game.user?.id === game.users?.activeGM?.id,
    hasActiveGM: () => !!game.users?.activeGM,
    // Drops rather than blocks: it is downstream of a committed award, so only the GM card and the
    // macro are lost, and there is no store to defer them into.
    onUnroutable: ({ resolutionId }) =>
      console.warn(
        'Fabricate | Complications were not delivered: no active GM is connected to run them',
        { resolutionId }
      ),
    // Minted here because the socket module touches no Foundry global.
    mintResolutionId: () => globalThis.foundry?.utils?.randomID?.(),
    emitComplications: (message) => game.socket?.emit(EVENT_SCENE_SOCKET, message),
    // A local apply has no socket sender; the current user is the acting user there.
    applyComplications: (payload) =>
      applyComplicationDelivery({ senderId: game.user?.id, ...payload }),
  });
  // Injected explicitly so a test can substitute it, though each engine falls back to
  // `game.fabricate.complicationDeliveryWriter`. Optional-chained so a reorder cannot break boot.
  fabricate.craftingEngine?.installComplicationDelivery({
    writer: fabricate.complicationDeliveryWriter,
  });
  getGatheringEngine()?.installComplicationDelivery({
    writer: fabricate.complicationDeliveryWriter,
  });
}

/** Housekeeping that drops entries naming deleted content, then the item hooks. */
async function runStartupPasses(fabricate) {
  // Each pass is guarded (issue 970), so a refused actor write never withholds `fabricate.ready`.
  // Composed after both `initialize()` calls, so its id sets derive from this boot's corpus.
  fabricate._startupMarks.begin(STARTUP_PHASES.STARTUP_MAINTENANCE);
  await runStartupMaintenance(
    composeStartupPassList({
      recipeManager: fabricate.recipeManager,
      craftingSystemManager: fabricate.craftingSystemManager,
      craftingRunManager: fabricate.craftingRunManager,
      salvageRunManager: fabricate.salvageRunManager,
      recipeVisibilityService: fabricate.recipeVisibilityService,
      getSetting,
      setSetting,
      resolveGatheringActor,
      isSelectableGatheringActor,
    })
  );
  fabricate._startupMarks.end(STARTUP_PHASES.STARTUP_MAINTENANCE);

  registerFragmentDiscoveryHook(fabricate.craftingSystemManager, fabricate.recipeVisibilityService);
  registerRecipeItemLearningHook(fabricate.recipeVisibilityService);
}

/**
 * Close the outer span first, so a `whenReady()` waiter sees a complete measure.
 * `manager-launch-readiness.test.js` pins the two lines after it as adjacent.
 */
function announceReady(fabricate) {
  fabricate._startupMarks.end(STARTUP_PHASES.INITIALIZE);
  fabricate.ready = true;
  fabricate._resolveReady?.();
  console.log('Fabricate | Ready');
}

/** Compose every collaborator `game.fabricate` publishes, in the one order that works. */
export async function composeFabricateServices(fabricate) {
  beginStartup(fabricate);
  registerSettingsAndTheme(fabricate);
  await runMigrationPass(fabricate);
  buildWorldStores(fabricate);
  buildCoreManagers(fabricate);
  await loadPersistedData(fabricate);
  buildGatheringStores(fabricate);
  buildGatheringServices(fabricate);
  await buildGatheringEngine(fabricate);
  installRelays(fabricate);
  await runStartupPasses(fabricate);
  announceReady(fabricate);
}
