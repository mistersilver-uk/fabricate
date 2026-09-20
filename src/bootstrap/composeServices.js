/**
 * The composition root: everything `Fabricate#initialize()` builds, in phases whose ORDER is
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

/** Open the outer startup span; an absent `performance` degrades to a no-op. */
function beginStartup(fabricate) {
  console.log('Fabricate | Initializing...');

  // Explicit performance boundaries around startup (issue 1073), so "ready time attributable to
  // Fabricate" is measured rather than guessed. Total: an absent `performance` degrades to a no-op.
  fabricate._startupMarks = createStartupMarks();
  fabricate._startupMarks.begin(STARTUP_PHASES.INITIALIZE);
}

/** Settings first: nothing below may read a key that is not registered yet. */
function registerSettingsAndTheme(fabricate) {
  fabricate.registerSettings();
  applyCurrentFabricateTheme(getSetting, SETTING_KEYS.THEME);
  // BEFORE anything reads or writes a stack: it must precede `_runMigrations()`, a migration being
  // able to touch owned items, and follow `registerSettings()`. No MIGRATIONS entry — the key is
  // new, so no prior stored value exists to migrate.
}

/** The migration pass, before any manager loads persisted data. */
async function runMigrationPass(fabricate) {
  applyItemStackQuantityPathSetting();
  // Run data migrations before managers load persisted data.
  fabricate._startupMarks.begin(STARTUP_PHASES.MIGRATIONS);
  await fabricate._runMigrations();
  fabricate._startupMarks.end(STARTUP_PHASES.MIGRATIONS);
}

/** The world-scope stores, loaded before both managers derive their id basis from them. */
function buildWorldStores(fabricate) {
  // Both seams are lazy closures, `craftingSystemManager` being constructed on the next statement
  // from `recipeManager`; `getCraftingSystemManager` (issue 1072) is what RecipeManager's twelve
  // former `game.fabricate` reads go through. The world currency configuration (issue 1278) is
  // FIRST, both the recipe manager and the crafting engine taking it as a collaborator.
  fabricate.currencyConfigStore = new CurrencyConfigStore({
    getSetting,
    setSetting,
    randomID: () => foundry.utils.randomID(),
  });
  fabricate.currencyConfigStore.load();
  // Issue 1308: the world character libraries, loaded HERE before both managers, because
  // `CraftingSystemManager` derives its Valid Id Basis from this store on every normalize — unlike
  // the travel store's realms, which are read on demand.
  fabricate.characterLibrariesStore = new CharacterLibrariesStore({
    getSetting,
    setSetting,
    randomID: () => foundry.utils.randomID(),
  });
  fabricate.characterLibrariesStore.load();
  // Issue 1359: the three WORLD-SCOPE entity stores, loaded AFTER `registerSettings()`, AFTER
  // `await fabricate._runMigrations()` and BEFORE both managers. THE ORDER IS SILENT WHEN WRONG —
  // `load()` is guarded, so a mis-ordering degrades to an UNSEEDED store and a `null` Valid Id
  // Basis against which the manager prunes every world reference — and a source-order assertion
  // in `tests/scoped-definition-read-and-basis.test.js` pins it.
  fabricate.componentScopeStore = createComponentScopeStore({ getSetting, setSetting });
  fabricate.componentScopeStore.load();
  fabricate.essenceScopeStore = createEssenceScopeStore({ getSetting, setSetting });
  fabricate.essenceScopeStore.load();
  fabricate.toolScopeStore = createToolScopeStore({ getSetting, setSetting });
  fabricate.toolScopeStore.load();
  // Issue 1392: the WORLD VOCABULARY store, beside the three above for the source-order assertion.
  // Its own HARD constraint is only "after `registerSettings()`", it being wired into no prune
  // basis, so a mis-order degrades to an unseeded store and a rail badge reading 0.
  fabricate.worldVocabularyStore = createWorldVocabularyStore({ getSetting, setSetting });
  fabricate.worldVocabularyStore.load();
  // 1.30.0 (issue 1370): THE WORLD IDENTITY DRIFT AUDIT, once per session. HERE, NOT IN THE
  // MIGRATION'S NOTICE SLOT, because DRIFT IS NOT A MIGRATION EVENT — it appears on the GM's first
  // identity edit and every session after. ACTIVE GM, NOT `isGM`. INFO, NEVER WARN.
  if (game.users?.activeGM?.id === game.user?.id) {
    const worldIdentityDrift = reportWorldIdentityDrift(readPersistedCraftingSystems(), {
      components: fabricate.componentScopeStore.corpus(),
      essences: fabricate.essenceScopeStore.corpus(),
      tools: fabricate.toolScopeStore.corpus(),
    });
    // THE FULL LEDGER GOES TO THE CONSOLE AND FABRICATE PUTS IT THERE ITSELF, core logging the
    // CAPPED message it was handed; the level and the wrapper are § Migration Notices' (1737).
    const driftDetail = describeWorldIdentityDrift(worldIdentityDrift);
    logMigrationNoticeDetail('world identity drift', driftDetail);
    // CONSOLE ONLY (maintainer, 2026-09-06): the toast read as an alarm for a harmless state.
  }
}

/** The crafting managers, services and engine, in dependency order. */
function buildCoreManagers(fabricate) {
  fabricate.recipeManager = new RecipeManager({
    getCraftingSystem: (systemId) => fabricate.craftingSystemManager?.getSystem?.(systemId) ?? null,
    getCraftingSystemManager: () => fabricate.craftingSystemManager ?? null,
    currencyConfigStore: fabricate.currencyConfigStore,
  });
  // Issue 800: the manager RESOLVES source descriptions through Foundry's enricher at its async
  // ingestion boundaries. Both seams default to pass-throughs, `enrichHTML` not running under
  // happy-dom, so wiring the real implementations here is what makes production resolve.
  fabricate.craftingSystemManager = new CraftingSystemManager(fabricate.recipeManager, {
    enrichToHtml: (raw, options) => enrichToHtml(raw, options),
    primeEnricherCache: (rawTexts) => primeEnricherCache(rawTexts),
  });
  // Wire the real primary-GM check into the timed world-time resume paths (issue 656). The
  // collaborators default it to a fail-open `() => true` so unit fixtures resume, so passing the
  // real check here is LOAD-BEARING: it gates every resume write to exactly one client.
  const isPrimaryGM = () => game.users?.activeGM?.id === game.user?.id;
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
    // A per-pass INVENTORY SNAPSHOT collaborator, not a visibility one (issue 1228): every
    // production snapshot is built with the same identity pair.
    findMatchingComponent
  );
  fabricate.resolutionModeService = new ResolutionModeService(fabricate.craftingSystemManager, {
    getPlayerResultOrder: (entry) => fabricate._readPlayerResultOrder(entry),
  });
  fabricate.itemPilesIntegration = new ItemPilesIntegration();
  fabricate.itemPilesIntegration.detect();
  // The actor-inventory spender resolves a per-system coin adapter by `game.system.id` through an
  // internal map, pf2e being the only one; the actor-property spender needs no such wiring.
  fabricate.actorInventoryCoinSpender = new ActorInventoryCoinSpender({
    adapters: new Map([['pf2e', new Pf2eInventoryCoinAdapter()]]),
  });
  fabricate.actorPropertyCoinSpender = new ActorPropertyCoinSpender();
  // Wire the gathering persistence seams the GM UI path already passes, so the public API persists
  // the authoring bundle rather than dropping it (issue 699). The environment store is constructed
  // AFTER this importer, so it resolves lazily through a delegating object.
  fabricate.compendiumImporter = new CompendiumImporter(
    fabricate.craftingSystemManager,
    fabricate.recipeManager,
    {
      environmentStore: {
        list: () => fabricate.gatheringEnvironmentStore?.list?.() ?? [],
        load: () => fabricate.gatheringEnvironmentStore?.load?.() ?? [],
        save: (environments) => fabricate.gatheringEnvironmentStore?.save?.(environments),
      },
      // Lazy for the same reason; with the realm store unassigned `get()` answers null and the merge
      // takes the raw-setting path rather than awaiting a `save` that resolves to undefined.
      travelStore: {
        get: () => fabricate.gatheringRealmStore?.get?.() ?? null,
        save: (config) => fabricate.gatheringRealmStore?.save?.(config),
      },
      getSetting: (key) => getSetting(key),
      setSetting: (key, value) => setSetting(key, value),
      isGM: () => game.user?.isGM === true,
      // The three world-scope entity stores (issue 1364) resolve lazily: the merge fails CLOSED on an
      // absent store, so a seam capturing a still-undefined field would merge NOTHING and still
      // report success. A delegator closes over the FIELD, so a rename cannot slip past it.
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
  // Both `initialize()` calls deserialize a whole world-setting payload, so this span is the
  // corpus-proportional half of startup.
  fabricate._startupMarks.begin(STARTUP_PHASES.DATA_LOAD);
  await fabricate.recipeManager.initialize();
  await fabricate.craftingSystemManager.initialize();
  fabricate._startupMarks.end(STARTUP_PHASES.DATA_LOAD);
  // The WORLD travel configuration (issue 1282), FIRST because the environment store validates
}

/** The gathering world stores and the current-realm resolver. */
function buildGatheringStores(fabricate) {
  // realm references against it and the resolver and engine both read realms through it.
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
  // Fabricate-managed parties and the current-realm resolver, both world scope. The resolver is
  // constructor-injected rather than imported, so the engine stays testable without Foundry.
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
        // An unresolvable travel actor senses no regions rather than throwing into the resolver.
      }
      return senseTravelMarkerRegions({ actor });
    },
  });
  // Node pools live in the `gatheringEnvironments` WORLD setting and only a GM may write one, so
  // without this relay a player's decrement rejects and the pool never depletes. On a GM client
  // the writer applies locally, a socket emit never reaching the emitter.
}

/** The node-depletion relay and the rich-state service it writes through. */
function buildGatheringServices(fabricate) {
  fabricate.gatheringNodeDepletionWriter = createGatheringNodeDepletionWriter({
    isActiveGM: () => game.user?.id === game.users?.activeGM?.id,
    // `Users#activeGM` is null with no GM connected, so report rather than emit into the void: the
    // gather still succeeds, having never gated on this write, and only the pool fails to deplete.
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
    // Calendar-aware regen and respawn intervals, falling back to the Earth table and resolved per
    // call so a mid-session reconfig is picked up.
    secondsPerUnit: (unit) => secondsPerUnitFromCalendar(unit, game.time?.calendar ?? null),
    // Interactable-scoped node seams (issue 302): resolve a behaviour by ref and route its
    // scoped-node write through the active GM.
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
      // Publishes the documented public `fabricate.gathering.*` hooks on terminal completion.
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
      // Interactable-scoped node respawn enumeration (issue 302): scan scenes for scoped-node
      // behaviours and route the changed `system.node` write through the active GM.
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
  // Issue 901. A blind run's secret state lives in the `gatheringBlindRuns` WORLD setting, which
}

/** The blind-run and complication relays, both routed through the active GM. */
function installRelays(fabricate) {
  // only a GM may update. That is the integrity boundary: a player can still READ world state, but
  // can no longer FORGE the task their run yields as they could on an Actor flag they own.
  fabricate.gatheringBlindRunStore = new GatheringBlindRunStore({
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
      try {
        runActor = resolve(String(actorUuid));
      } catch {
        // An unresolvable actor makes the record inactive rather than throwing into the store.
      }
      if (!runActor) return false;
      return Boolean(fabricate.gatheringRunManager?.getActiveRun?.(runActor, runId));
    },
    nowWorldTime: () => Number(game.time?.worldTime || 0),
  });
  // The blind DRAW must happen somewhere the acting player cannot rig it, so a player's blind
  // timed start routes to the active GM over the node-depletion relay's channel (issue 983) and
  // the GM re-runs the whole attempt with the requesting user as the viewer.
  fabricate.gatheringBlindStartWriter = createGatheringBlindStartWriter({
    isActiveGM: () => game.user?.id === game.users?.activeGM?.id,
    hasActiveGM: () => !!game.users?.activeGM,
    onUnroutable: ({ environmentId }) =>
      console.warn(
        'Fabricate | Blind gathering start was not applied: no active GM is connected to write the world setting',
        { environmentId }
      ),
    emitStart: (message) => game.socket?.emit(EVENT_SCENE_SOCKET, message),
    // The local-apply branch has no socket sender to attest, so supply the current user; reached
    // only if a GM ever routes its own start, which the engine short-circuits before.
    applyStart: (payload) => applyGatheringBlindStart({ senderId: game.user?.id, ...payload }),
  });
  getGatheringEngine().installBlindRunRelay({
    store: fabricate.gatheringBlindRunStore,
    relayStart: (args) => fabricate.gatheringBlindStartWriter.start(args),
  });
  // A complication's GM-only card and its macro must happen on a GM client, a macro on the acting
  // client carrying that client's authority. Relayed ADDRESSING ONLY — the elected GM re-reads the
  // authored complication from its own record (issue 1286) — and applied locally on that GM.
  fabricate.complicationDeliveryWriter = createComplicationDeliveryWriter({
    isActiveGM: () => game.user?.id === game.users?.activeGM?.id,
    hasActiveGM: () => !!game.users?.activeGM,
    // Unlike the blind-start relay this DROPS rather than blocks: a complication is strictly
    // downstream of a committed award, so refusing would strand a completed craft. Only the
    // GM-only card and the macro are lost, and there is no store to defer them into.
    onUnroutable: ({ resolutionId }) =>
      console.warn(
        'Fabricate | Complications were not delivered: no active GM is connected to run them',
        { resolutionId }
      ),
    // Minted here rather than inside the socket module, which touches no Foundry global.
    // `randomID` and not `Math.random()`.
    mintResolutionId: () => globalThis.foundry?.utils?.randomID?.(),
    emitComplications: (message) => game.socket?.emit(EVENT_SCENE_SOCKET, message),
    // The local-apply branch has no socket sender to attest, so supply the current user — who is,
    // on that branch, the acting user.
    applyComplications: (payload) =>
      applyComplicationDelivery({ senderId: game.user?.id, ...payload }),
  });
  // EXPLICIT injection into both engines that fire complications: each also falls back to
  // `game.fabricate.complicationDeliveryWriter`, but a seam only the fallback satisfies cannot be
  // substituted in a test. Optional-chained so a reorder cannot take the boot down.
  fabricate.craftingEngine?.installComplicationDelivery({
    writer: fabricate.complicationDeliveryWriter,
  });
  getGatheringEngine()?.installComplicationDelivery({
    writer: fabricate.complicationDeliveryWriter,
  });
  // Housekeeping that drops entries naming deleted content. Each pass is INDEPENDENTLY GUARDED
  // (issue 970): a refused actor write must never prevent `fabricate.ready` below, every facade method
  // throwing through `_requireReady()`. The list is composed by `composeStartupPassList` (issue
  // 1224) BELOW both `initialize()` calls, so its id sets derive from the corpus this boot loaded.
}

/** Housekeeping that drops entries naming deleted content, then the item hooks. */
async function runStartupPasses(fabricate) {
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

/** Close the outer span BEFORE readiness is announced, then settle `whenReady()`. */
function announceReady(fabricate) {
  // Close the outer span BEFORE readiness is announced, so a `whenReady()` waiter observes a
  // complete `fabricate:initialize` measure. ABOVE `fabricate.ready = true` deliberately:
  // `manager-launch-readiness.test.js` pins that line and `fabricate._resolveReady?.();` as ADJACENT.
  fabricate._startupMarks.end(STARTUP_PHASES.INITIALIZE);
  fabricate.ready = true;
  fabricate._resolveReady?.();
  console.log('Fabricate | Ready');
}

/**
 * Compose every collaborator `game.fabricate` publishes, in the one order that works.
 */
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
