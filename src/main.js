// Import global stylesheet so Vite includes it in the module graph for HMR.
// In production builds, a Vite plugin resolves this to a no-op since Foundry
// loads the stylesheet via module.json's "styles" field instead.
import '../styles/fabricate.css';

import {
  TOOL_IMAGE_SENTINEL,
  linkedComponentFor,
  resolveToolDisplayImage,
  resolveToolDisplayName,
} from './models/toolDisplay.js';
import { findById, getDefinitionIndex } from './utils/definitionIndex.js';
import { RecipeManager } from './systems/RecipeManager.js';
import { CompendiumImporter, scopeStoreDelegate } from './systems/CompendiumImporter.js';
import { CraftingEngine } from './systems/CraftingEngine.js';
import { CraftingSystemManager } from './systems/CraftingSystemManager.js';
import { CraftingRunManager } from './systems/CraftingRunManager.js';
import { RunJournalBuilder } from './systems/RunJournalBuilder.js';
import { SalvageRunManager } from './systems/SalvageRunManager.js';
import { runContainersChanged } from './systems/runFlagInvalidation.js';
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
import { revealGatheringRealm, hideGatheringRealm, getDiscoveredRealmIds } from './systems/gatheringRealmDiscovery.js';
import { buildLocationSummaryForViewer } from './systems/gatheringLocation.js';
import { getRealmRevealMode, isGatheringRealmsEnabled } from './systems/gatheringRealms.js';
import { GatheringRunManager } from './systems/GatheringRunManager.js';
import { GatheringGateAndCheckEvaluator } from './systems/GatheringGateAndCheckEvaluator.js';
import { GatheringRichStateService } from './systems/GatheringRichStateService.js';
import { secondsPerUnitFromCalendar, daysPerYearFromCalendar } from './systems/foundryCalendar.js';
import { resolveAdvanceSources } from './systems/advanceCraftingSources.js';
import { GatheringEngine } from './systems/GatheringEngine.js';
import { GatheringHookPublisher } from './systems/GatheringHookPublisher.js';
import { EVENT_SCENE_SOCKET, createEventSceneTrigger, routeEventSceneSocketMessage } from './systems/eventSceneCoordinator.js';
import { createDepletionRateLimiter, createGatheringNodeDepletionWriter, routeGatheringNodeDepleteMessage } from './systems/gatheringNodeSocket.js';
import { GatheringBlindRunStore } from './systems/GatheringBlindRunStore.js';
import { createBlindStartRateLimiter, createGatheringBlindStartWriter, routeGatheringBlindStartMessage } from './systems/gatheringBlindRunSocket.js';
import { applyAuthoredComplications, buildComplicationMacroContext, createComplicationDeliveryDedupe, createComplicationDeliveryWriter, createComplicationRateLimiter, isRunnableComplicationMacro, routeComplicationDeliveryMessage } from './systems/complicationSocket.js';
import { buildGmComplicationCardContent, gmComplicationCardEntries, rollGmComplicationEffect } from './systems/complicationRuntime.js';
import { renderDialog, viewScene, localize as bridgeLocalize, enrichToHtml, primeEnricherCache } from './ui/svelte/util/foundryBridge.js';
import { buildInteractiveRollOptions, promptBulkCheckRoll, promptCheckRoll } from './ui/svelte/apps/crafting/rollPrompt.js';
import { RecipeVisibilityService } from './systems/RecipeVisibilityService.js';
import { runStartupMaintenance } from './systems/startupMaintenance.js';
import { composeStartupPassList } from './systems/startupPassComposition.js';
import { ResolutionModeService } from './systems/ResolutionModeService.js';
import { CraftingListingBuilder } from './systems/CraftingListingBuilder.js';
import { activeRunStepState, buildStepRecipeView, resolveStepIngredientSet } from './systems/stepRecipeView.js';
import { InventoryListingBuilder } from './systems/InventoryListingBuilder.js';
import { BulkSalvageService } from './systems/BulkSalvageService.js';
import { BulkDestroyService } from './systems/BulkDestroyService.js';
import { applyBulkChatVisibility } from './systems/bulkChatVisibility.js';
import { AlchemyListingBuilder } from './systems/AlchemyListingBuilder.js';
import {
  evaluatePreparedCraftingCheck,
  evaluatePreparedRunCheck,
  postCheckRollHandoff,
  resolveCheckFormulaDisplay,
  runFormulaPassFail,
  runFormulaProgressive,
} from './systems/checkRoll.js';
import { createFoundryJournalRunAuthority } from './systems/journalRunAuthority.js';
import {
  JOURNAL_RUN_SOCKET_KIND,
  authorityUnavailableAvailability,
  authorityUnavailableRefusal,
  createGatheringJournalRunOperations,
  createJournalExecutionReconstructor,
  createJournalRunCommandService,
  createManagerMutation,
  executePublicCraft,
  executePublicGather,
  installCraftingJournalRunAuthority,
  installGatheringJournalRunAuthority,
} from './systems/journalRunCommands.js';
import { SignatureValidator } from './systems/SignatureValidator.js';
import { Recipe } from './models/Recipe.js';
import { Ingredient } from './models/Ingredient.js';
import { IngredientGroup } from './models/IngredientGroup.js';
import { findCuratedIconRecord, listCuratedIconVocabulary } from './utils/iconVocabulary.js';
import { MacroExecutor } from './utils/MacroExecutor.js';
import {
  createGatheringResultCreator,
  resolveGatheringResultSource,
  gatheringRunItemRef
} from './gatheringResultCreation.js';
import { resolveAlchemySubmissions } from './utils/alchemySubmissions.js';
// The item -> managed-component resolver the crafting listing's summary phase tallies held
// stacks with (issue 1075), shared with InventoryListingBuilder's owned-row matching.
import { findMatchingComponent, resolveItemEssences } from './utils/essenceResolver.js';
import { progressiveOrderKey } from './utils/progressiveResultOrder.js';
import { findStackableMatch } from './utils/sourceUuid.js';
import { STARTUP_PHASES, createStartupMarks } from './utils/startupMarks.js';
// Issue 1565: the deferred-chunk failure and stale-entry-script notices. Everything a semantic
// mutation could break is in that module because nothing in THIS file is executable by a unit test;
// what stays here is the Foundry edge — the localizer, the channel and the console.
import {
  DEFERRED_CHUNK_LOAD_CONSOLE_MESSAGE,
  STALE_ENTRY_SCRIPT_CONSOLE_MESSAGE,
  buildStaleEntryNotice,
  createDeferredChunkFailureReporter,
  openDeferredApp,
  openDeferredAppRethrowing
} from './utils/deferredEntryNotice.js';
import { createMemoizedLoad } from './utils/memoizedModuleLoad.js';
import {
  callGatheringRuntimeWithCurrentViewer,
  createGatheringSceneAccess,
  createGatheringSelectableActorsGetter,
  evaluateGatheringExpression,
  processWorldTimeCallbacksSafely,
} from './gatheringBootstrapAdapters.js';
import { sceneRegionUuidsContainingToken } from './canvas/regionHitTest.js';
import {
  createGatheringToolAvailability,
  matchGatheringTools
} from './gatheringToolRuntime.js';
import { createToolBreakageRuntime } from './toolBreakageRuntime.js';
import {
  getFabricateAppClass,
  getCraftingSystemManagerAppClass,
  getInteractableBrowserAppClass,
  getInteractableConfigAppClass,
  getInteractablesManagerAppClass
} from './ui/appFactory.js';
import { addInteractableSceneControl } from './ui/interactableSceneControl.js';
import { managerExtensions } from './ui/managerExtensions.js';
import { playerExtensions } from './ui/playerExtensions.js';
import { applyCurrentFabricateTheme } from './ui/theme.js';
import { findItemsDirectoryActionsContainer, syncGatheringDirectoryButton } from './ui/itemsDirectoryButtons.js';
import { buildCompendiumImportContextOption, promptSelectCraftingSystem } from './ui/compendiumDirectoryContext.js';
import { registerFabricateSettings, getSetting, setSetting, SETTING_KEYS, FABRICATE_SETTINGS_NAMESPACE, RECIPE_ITEM_FLAG_STAMP_TARGET, COMPONENT_FLAG_STAMP_TARGET, TOOL_FLAG_STAMP_TARGET, OWNED_ITEM_COMPONENT_STAMP_TARGET, WORLD_SCOPE_IDENTITY_FLAG_TARGET, WORLD_ESSENCE_MERGE_FLAG_TARGET } from './config/settings.js';
import { notifyUnresolvedItemDescriptions } from './config/repairItemData.js';
import { getFabricateFlag, setFabricateFlag } from './config/flags.js';
import { isPlayerCharacterActor } from './config/playerCharacterTypes.js';
import { handleFabricateSettingChange } from './config/settingChangeBridge.js';
import { configureItemStackQuantityPath, probeStackQuantityPath, stackQuantityAdvisory } from './systems/itemStackQuantity.js';
import { stackQuantityPathPresetFor } from './config/stackQuantityPathPresets.js';
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
import { resolvedComponentsFor, resolvedToolsFor } from './systems/scopedEntityReads.js';
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
  AFFORDABILITY_MESSAGE_KEYS,
  CHECK_ROLL_MESSAGE_KEYS,
  COMPANION_CONTRACT,
  COMPANION_OUTCOMES,
  COMPONENT_AWARD_MESSAGE_KEYS,
  CURRENCY_CREDIT_MESSAGE_KEYS,
  KNOWLEDGE_GRANT_MESSAGE_KEYS,
  affordabilityResult,
  bulkCheckDecisionResult,
  checkRollResult,
  componentAwardResult,
  currencyCreditResult,
  gatePooledActorUuids,
  knowledgeGrantResult,
  pooledHoldingsConsumeResult,
  pooledHoldingsReadResult
} from './systems/companionContract.js';
// Aliased on import because the facade delegator below carries the SAME name. A class method is
// not a bare identifier in its own body, so the unaliased import would resolve correctly and read
// as a recursive call to every human who met it.
import { grantRecipeKnowledge as grantRecipeKnowledgeToActor } from './systems/companionKnowledgeGrant.js';
// Aliased for the same reason as the grant above.
import { awardComponents as awardComponentsToActor } from './systems/companionComponentAward.js';
// Aliased for the same reason as the grant above.
import {
  resolveBulkCheckDecision as resolveStandaloneBulkCheckDecision,
  rollActorCheck as rollStandaloneActorCheck
} from './systems/companionCheckRoll.js';
// Aliased for the same reason again (issue 1342): both facade delegators carry the SAME names as
// the leaves they delegate to, and the alias says which side of the boundary is which.
import { readPooledHoldings as readPooledHoldingsAcrossActors } from './systems/companionPooledHoldings.js';
import { consumePooledHoldings as consumePooledHoldingsFromActors } from './systems/companionPooledConsumption.js';

/**
 * `rollActorCheck`'s OWN refusal strings for the shared authorization preamble. There is deliberately
 * NO pair for `resolveBulkCheckDecision`: it takes no `actorId` and never reaches the preamble.
 */
const ROLL_ACTOR_CHECK_GATE_KEYS = Object.freeze({
  gmOnlyKey: CHECK_ROLL_MESSAGE_KEYS[COMPANION_OUTCOMES.gmOnly],
  noActorKey: CHECK_ROLL_MESSAGE_KEYS[COMPANION_OUTCOMES.noActor]
});

/**
 * `awardComponents`' and `creditCurrency`'s OWN refusal strings (issue 1301). TWO PAIRS AND NOT ONE:
 * a refused award reports itself in the award's words and a refused credit in the credit's.
 */
const AWARD_COMPONENTS_GATE_KEYS = Object.freeze({
  gmOnlyKey: COMPONENT_AWARD_MESSAGE_KEYS[COMPANION_OUTCOMES.gmOnly],
  noActorKey: COMPONENT_AWARD_MESSAGE_KEYS[COMPANION_OUTCOMES.noActor]
});

const CREDIT_CURRENCY_GATE_KEYS = Object.freeze({
  gmOnlyKey: CURRENCY_CREDIT_MESSAGE_KEYS[COMPANION_OUTCOMES.gmOnly],
  noActorKey: CURRENCY_CREDIT_MESSAGE_KEYS[COMPANION_OUTCOMES.noActor]
});

/**
 * The two pooled members carry NO hoisted refusal-string trio (issue 1342): the SET-valued preamble's
 * `message` is not read verbatim, so both branch on `gate.outcome` and build their own result.
 */
import {
  affordsCurrencySpends,
  buildCurrencyAffordProbe,
  checkWorldCurrencyAffordability,
  creditWorldCurrency,
} from './systems/currencyAffordance.js';
import { isGatheringActorSelectableByUser } from './config/preferencesCleanup.js';
import { registerFragmentDiscoveryHook } from './systems/FragmentDiscoveryHook.js';
import { registerRecipeItemLearningHook } from './systems/RecipeItemLearningHook.js';
import { InteractableManager } from './canvas/InteractableManager.js';
import {
  handleInteractableSocketMessage,
  applyInteractableBehaviorUpdate,
  resolveInteractableBehaviorByRef,
  writeInteractableBehaviorNode
} from './canvas/interactableSocketBridge.js';
import { registerInteractableRegionBehavior } from './canvas/regions/FabricateInteractableRegionBehavior.js';
import {
  evaluateInteractableCreate,
  neutralizeInheritedLinkedVisual,
  buildUnconfiguredSentinelPatch
} from './canvas/regions/interactableCreationGuard.js';
import {
  isInteractableRegionBehavior,
  readInteractableBehaviorSystem
} from './canvas/regions/interactableRegionFlags.js';
import { syncInteractableMarkers } from './canvas/regions/interactableMarkerDepletion.js';
import {
  decideWorldInteractableCleanup,
  executeWorldInteractableCleanup,
  planHasWork
} from './canvas/regions/interactableCleanup.js';
import {
  assignInteractableConfigSheet,
  resolveInteractableConfigTarget,
  shouldOfferInteractableConfigEntry
} from './canvas/regions/interactableConfigSheet.js';
import * as CraftingSystemExporter from './systems/CraftingSystemExporter.js';
import './ui/SvelteFabricateApp.svelte.js';
import './ui/InteractableBrowserApp.svelte.js';
import './ui/InteractionPromptApp.svelte.js';
import './ui/InteractableConfigApp.svelte.js';
import './ui/InteractablesManagerApp.svelte.js';

let gatheringEngine = null;

// Per-sender throttle for inbound gathering node depletions, held at module scope so the window
// survives across socket messages — a per-message limiter would never refuse anything. Only the
// active GM ever consults it.
const gatheringDepletionRateLimiter = createDepletionRateLimiter();
// A separate budget for the blind-start relay (issue 901), so a burst of gathers and a burst of
// starts cannot starve one another through a shared allowance.
const gatheringBlindStartRateLimiter = createBlindStartRateLimiter();
// Third budget, for the complication relay (issue 1286). Charged per MESSAGE, and one resolution —
// a whole bulk salvage included — emits exactly one.
const complicationDeliveryRateLimiter = createComplicationRateLimiter();
// Suppresses a complication re-delivered to THIS context. Module scope for the reason the limiters
// are: a per-message set would remember nothing. It cannot cover an elected GM with the world open
// in two tabs, which is a stated, accepted residual rather than an oversight.
const complicationDeliveryDedupe = createComplicationDeliveryDedupe();

async function resolveJournalSourceActors(run, payload = {}, fallbackActor = null) {
  const supplied = Array.isArray(payload.sourceActorUuids) ? payload.sourceActorUuids : null;
  const persisted = Array.isArray(run?.componentSourceActorUuids)
    ? run.componentSourceActorUuids
    : null;
  const uuids = persisted ?? supplied ?? [];
  const actors = [];
  for (const uuid of uuids) {
    try {
      const actor = await globalThis.fromUuid?.(uuid);
      if (actor) actors.push(actor);
    } catch (_error) {
      return null;
    }
  }
  return actors.length > 0 ? actors : (fallbackActor ? [fallbackActor] : []);
}

function journalSourcesOwnedBy(sender, actors) {
  return sender?.isGM === true || actors.every(
    (actor) => actor?.testUserPermission?.(sender, 'OWNER') === true
  );
}

function consumeJournalGrant(service, grant, context) {
  return service?.consumeExecutionGrant?.(grant, context) ?? null;
}

function createCraftingJournalOperations(fabricate, getService) {
  const authorizeRollHandoff = async ({ actor, run, payload, sender, privateEvaluation }) => {
    const componentSourceActors = await resolveJournalSourceActors(run, payload, actor);
    if (!componentSourceActors) return false;
    const recipeId = privateEvaluation?.recipeId ?? run?.recipeId;
    const recipe = fabricate.recipeManager?.getRecipe?.(recipeId) ?? null;
    if (!recipe) return false;
    if (sender?.isGM === true) return true;
    if (!sender) return false;
    return Boolean(
      fabricate.recipeVisibilityService?.getVisibleRecipes?.({
        viewer: sender,
        craftingActor: actor,
        componentSourceActors,
        craftingSystemId: recipe.craftingSystemId,
      })?.some?.((candidate) => candidate?.recipe?.id === recipe.id)
    );
  };
  const managerMutation = createManagerMutation((grant, context) =>
    consumeJournalGrant(getService(), grant, context));
  return {
    getRun: ({ actor, runId }) => {
      fabricate.craftingRunManager?.invalidateCache?.(actor?.id);
      return fabricate.craftingRunManager?.getRun?.(actor, runId)
        ?? fabricate.craftingRunManager?.getActiveRun?.(actor, runId)
        ?? null;
    },
    authorize: async ({ actor, run, payload, sender }) => {
      const sourceActors = await resolveJournalSourceActors(run, payload, actor);
      return Boolean(sourceActors && journalSourcesOwnedBy(sender, sourceActors));
    },
    prepareStart: async ({ actor, payload, preparationGrant, requestId }) => {
      if (payload.activityKind !== 'alchemy') return { success: true, payload };
      const sourceActors = await resolveJournalSourceActors(null, payload, actor);
      if (!sourceActors) return { success: false, reason: 'source-actor-not-found' };
      const system = fabricate.craftingSystemManager?.getSystem?.(payload.craftingSystemId) ?? null;
      if (!system || system.resolutionMode !== 'alchemy') {
        return { success: false, reason: 'alchemy-system-not-found' };
      }
      const submitted = Array.isArray(payload.submittedItems) ? payload.submittedItems : [];
      const componentIds = submitted.map((record) => record?.componentId);
      if (componentIds.some((id) => typeof id !== 'string' || id.length === 0)) {
        return { success: false, reason: 'alchemy-submission-invalid' };
      }
      const canonicalSubmissions = resolveAlchemySubmissions(
        sourceActors,
        resolvedComponentsFor(system),
        componentIds,
        payload.craftingSystemId
      );
      if (
        canonicalSubmissions.length !== submitted.length ||
        canonicalSubmissions.some((record, index) => record.item?.uuid !== submitted[index]?.itemUuid)
      ) {
        return { success: false, reason: 'alchemy-submission-invalid' };
      }
      const prepare = fabricate.craftingEngine?.prepareVersionedAlchemyStart;
      if (typeof prepare !== 'function') return { success: false, reason: 'unsupported-operation' };
      const prepared = await prepare.call(fabricate.craftingEngine, {
        actor,
        sourceActors,
        craftingSystemId: payload.craftingSystemId,
        submittedItems: canonicalSubmissions,
        executionGrant: preparationGrant,
        requestId,
      });
      if (!prepared?.matched) {
        return {
          success: true,
          executionOperation: 'executeAlchemyFizzle',
          payload,
          trustedContext: {
            ...prepared,
            alchemySubmittedItems: canonicalSubmissions,
          },
        };
      }
      return {
        success: true,
        payload: {
          ...payload,
          recipeId: prepared.recipeId,
          selectionPlan: prepared.selectionPlan,
        },
        trustedContext: {
          ...prepared,
          alchemySubmittedItems: canonicalSubmissions,
        },
      };
    },
    start: async ({ actor, payload, executionGrant, requestId, sender }) => {
      const sourceActors = await resolveJournalSourceActors(null, payload, actor);
      if (!sourceActors) return { success: false, reason: 'source-actor-not-found' };
      const start = fabricate.craftingEngine?.startVersionedRun;
      if (typeof start !== 'function') return { success: false, reason: 'unsupported-operation' };
      return start.call(fabricate.craftingEngine, {
        viewer: sender,
        actor,
        sourceActors,
        recipeId: payload.recipeId,
        selectionPlan: payload.selectionPlan,
        completionMode: payload.completionMode,
        executionGrant,
        requestId,
      });
    },
    executeAlchemyFizzle: async ({ actor, payload, executionGrant, requestId, sender }) => {
      const sourceActors = await resolveJournalSourceActors(null, payload, actor);
      if (!sourceActors) return { success: false, reason: 'source-actor-not-found' };
      const system = fabricate.craftingSystemManager?.getSystem?.(payload.craftingSystemId) ?? null;
      const submitted = Array.isArray(payload.submittedItems) ? payload.submittedItems : [];
      const submittedItems = resolveAlchemySubmissions(
        sourceActors,
        resolvedComponentsFor(system),
        submitted.map((record) => record?.componentId),
        payload.craftingSystemId
      );
      if (
        submittedItems.length !== submitted.length ||
        submittedItems.some((record, index) => record.item?.uuid !== submitted[index]?.itemUuid)
      ) {
        return { success: false, reason: 'alchemy-submission-invalid' };
      }
      const execute = fabricate.craftingEngine?.executeVersionedAlchemyFizzle;
      if (typeof execute !== 'function') return { success: false, reason: 'unsupported-operation' };
      return execute.call(fabricate.craftingEngine, {
        viewer: sender,
        actor,
        sourceActors,
        craftingSystemId: payload.craftingSystemId,
        submittedItems,
        executionGrant,
        requestId,
      });
    },
    describeCheck: async ({ actor, run, payload, sender, preparationGrant, requestId }) => {
      const componentSourceActors = await resolveJournalSourceActors(run, payload, actor);
      if (!componentSourceActors) return { required: false, blocked: 'source-actor-not-found' };
      const describe = fabricate.craftingEngine?.describeVersionedStageCheck;
      if (typeof describe !== 'function') {
        return { required: false, blocked: 'unsupported-operation' };
      }
      const descriptor = await describe.call(fabricate.craftingEngine, {
        actor,
        componentSourceActors,
        runId: run.id,
        selectionPlan: payload.selectionPlan,
        preparationGrant,
        requestId,
      });
      if (!descriptor?.required) return descriptor;
      const visible = await authorizeRollHandoff({
        actor, run, payload, sender, privateEvaluation: descriptor.privateEvaluation,
      });
      if (visible) return descriptor;
      // The engine describes the check on the GM. Only the attested initiator's
      // entitlement permits its subject or modifiers to enter the initial reply.
      // An unnamed descriptor uses the local prompt's generic check title.
      return {
        ...descriptor,
        publicPrompt: {
          allowsSituationalModifier: descriptor.publicPrompt?.allowsSituationalModifier === true,
          allowAdvantage: descriptor.publicPrompt?.allowAdvantage === true,
        },
      };
    },
    evaluateCheck: async ({ actor, privateEvaluation, decision, sender }) => {
      const componentSourceActors = await resolveJournalSourceActors(null, {
        sourceActorUuids: privateEvaluation?.componentSourceActorUuids,
      }, actor) ?? [];
      const recipe = fabricate.recipeManager?.getRecipe?.(privateEvaluation?.recipeId) ?? null;
      const visible = sender?.isGM === true || Boolean(
        recipe && fabricate.recipeVisibilityService?.getVisibleRecipes?.({
          viewer: sender,
          craftingActor: actor,
          componentSourceActors,
          craftingSystemId: recipe.craftingSystemId,
        })?.some?.((candidate) => candidate?.recipe?.id === recipe.id)
      );
      return evaluatePreparedCraftingCheck(privateEvaluation, actor, decision, {
        secret: !visible,
      });
    },
    authorizeRollHandoff,
    execute: async ({ actor, run, payload, executionGrant, requestId, expectedRevision, sender }) => {
      const componentSourceActors = await resolveJournalSourceActors(run, payload, actor);
      if (!componentSourceActors) return { success: false, reason: 'source-actor-not-found' };
      const execute = fabricate.craftingEngine?.executeVersionedStage;
      if (typeof execute !== 'function') return { success: false, reason: 'unsupported-operation' };
      return execute.call(fabricate.craftingEngine, {
        viewer: sender,
        actor,
        componentSourceActors,
        runId: run.id,
        expectedRevision,
        selectionPlan: payload.selectionPlan,
        trigger: payload.trigger === 'worldTime' ? 'worldTime' : 'manual',
        executionGrant,
        requestId,
      });
    },
    beginStep: async ({ actor, run, payload, executionGrant, requestId, expectedRevision, sender }) => {
      const componentSourceActors = await resolveJournalSourceActors(run, payload, actor);
      if (!componentSourceActors) return { success: false, reason: 'source-actor-not-found' };
      const begin = fabricate.craftingEngine?.beginVersionedStage;
      if (typeof begin !== 'function') return { success: false, reason: 'unsupported-operation' };
      return begin.call(fabricate.craftingEngine, {
        viewer: sender,
        actor,
        componentSourceActors,
        runId: run.id,
        expectedRevision,
        selectionPlan: payload.selectionPlan,
        executionGrant,
        requestId,
      });
    },
    cancel: async ({ actor, run, payload, executionGrant, requestId, expectedRevision }) => {
      const componentSourceActors = await resolveJournalSourceActors(run, payload, actor);
      if (!componentSourceActors) return { success: false, reason: 'source-actor-not-found' };
      const cancel = fabricate.craftingEngine?.cancelVersionedRun;
      if (typeof cancel !== 'function') return { success: false, reason: 'unsupported-operation' };
      return cancel.call(fabricate.craftingEngine, {
        actor,
        runId: run.id,
        expectedRevision,
        executionGrant,
        requestId,
      });
    },
    pause: (args) => managerMutation(args, 'pause', () =>
      fabricate.craftingRunManager?.pauseRun?.(args.actor, args.runId, {
        expectedRevision: args.expectedRevision,
      })),
    resume: (args) => managerMutation(args, 'resume', () =>
      fabricate.craftingRunManager?.resumeRun?.(args.actor, args.runId, {
        expectedRevision: args.expectedRevision,
      })),
    setCompletionMode: (args) => managerMutation(args, 'setCompletionMode', () =>
      fabricate.craftingRunManager?.setCompletionMode?.(
        args.actor,
        args.runId,
        args.payload.completionMode,
        { expectedRevision: args.expectedRevision }
      )),
    setSelection: (args) => {
      const recipe = fabricate.recipeManager?.getRecipe?.(args.run.recipeId);
      const step = recipe?.getExecutionSteps?.()?.[args.payload.stepIndex];
      const selection = args.payload.selectionPlan ?? {};
      const selectedId = String(selection.selectedIngredientSetId ?? '').trim();
      const selectedSet = step?.ingredientSets?.find((set) => set.id === selectedId);
      if (!selectedSet) return { success: false, reason: 'ingredient-set-not-found' };
      // This callback runs inside the authority claim, after actor/source ownership
      // and revision checks. Snapshot the authored route here, never client evidence.
      return managerMutation(args, 'setSelection', () =>
        fabricate.craftingRunManager?.setStepSelectionPlan?.(
          args.actor,
          args.runId,
          args.payload.stepIndex,
          {
            ...selection,
            selectedIngredientSetId: selectedSet.id,
            selectedRequirementSnapshot: selectedSet.toJSON?.() ?? selectedSet,
          },
          { expectedRevision: args.expectedRevision }
        ));
    },
  };
}

function createJournalCommandsForFabricate(fabricate) {
  const authority = createFoundryJournalRunAuthority({
    reconstructExecutions: createJournalExecutionReconstructor({
      getCraftingRunManager: () => fabricate.craftingRunManager,
      getGatheringRunManager: () => fabricate.gatheringRunManager,
    }),
    // A refusal that has LIFTED invalidates every surface that captured it, the Journal having read
    // availability when it built its listing (issue 1648, M25). Broadcast the LIFT, never the
    // refusal: a refusal is true while it holds, and announcing it repaints mid-command.
    onAvailabilityRestored: () => Hooks.callAll('fabricate.journalRunAuthorityRestored'),
  });
  let service = null;
  service = createJournalRunCommandService({
    authority,
    operations: {
      crafting: createCraftingJournalOperations(fabricate, () => service),
      gathering: createGatheringJournalRunOperations({
        getEngine: () => gatheringEngine,
        runManager: fabricate.gatheringRunManager,
        getService: () => service,
        getUser: (userId) => game.users?.get(userId) ?? null,
      }),
    },
    currentUser: () => game.user,
    activeGM: () => game.users?.activeGM ?? null,
    getUser: (userId) => game.users?.get(userId) ?? null,
    resolveUuid: (uuid) => globalThis.fromUuid?.(uuid),
    emit: (message, options) => game.socket?.emit(EVENT_SCENE_SOCKET, message, options ?? {}),
    randomId: () => foundry.utils.randomID(),
    promptCheck: (descriptor) => promptCheckRoll({
      name: descriptor?.label,
      activity: descriptor?.label,
      allowAdvantage: descriptor?.allowAdvantage === true,
      modifierChoice: descriptor?.modifierChoice ?? null,
    }),
    postRollHandoff: (handoff) => postCheckRollHandoff(handoff),
    getDismissals: () => getSetting(SETTING_KEYS.JOURNAL_RUN_DISMISSALS),
    setDismissals: (value) => setSetting(SETTING_KEYS.JOURNAL_RUN_DISMISSALS, value),
    onDismissalsChanged: (payload) => Hooks.callAll('fabricate.journalDismissalsChanged', payload),
  });
  installCraftingJournalRunAuthority({ engine: fabricate.craftingEngine, service });
  return service;
}

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

/** Resolve a stored gathering actor preference against Foundry's actor collection. */
function resolveGatheringActor(actorId) {
  return game.actors?.get?.(actorId) ?? null;
}

/** Whether the current user may select an actor for gathering. */
function isSelectableGatheringActor(actor) {
  return isGatheringActorSelectableByUser(actor, game.user);
}

const getGatheringSelectableActors = createGatheringSelectableActorsGetter({
  getActors: () => game.actors,
  getCurrentUser: () => game.user,
  isSelectable: isGatheringActorSelectableByUser
});

/**
 * The actor-selection top bar's predicate: attempt authorization's ownership rule plus the
 * player-character concept. It NARROWS the bar, never attempt authorization.
 */
function isSelectableBarActor({ actor, viewer } = {}) {
  return isGatheringActorSelectableByUser(actor, viewer) && isPlayerCharacterActor(actor);
}

const getBarSelectableActors = createGatheringSelectableActorsGetter({
  getActors: () => game.actors,
  getCurrentUser: () => game.user,
  isSelectable: (actor, viewer) => isSelectableBarActor({ actor, viewer })
});

/**
 * Push the configured item stack-quantity path into the accessor, then optionally probe it and warn
 * the GM (issue 1024). ORDER IS LOAD-BEARING: re-configure BEFORE the probe. The re-configure is
 * UNGATED, the engine path having to be live everywhere, while the notification is GM-only.
 */
function applyItemStackQuantityPathSetting({ notify = false } = {}) {
  let stored = null;
  try {
    stored = getSetting(SETTING_KEYS.ITEM_STACK_QUANTITY_PATH);
  } catch {
    // Unregistered or unreadable: `configureItemStackQuantityPath` keeps the current path rather
    // than storing a falsy one, and never throws.
  }
  const path = configureItemStackQuantityPath(stored);
  if (!notify || game.user?.isGM !== true) return path;

  // `game.items` ONLY, a bounded read-only scan, and THAT SCOPE IS A REAL LIMIT: a world whose items
  // all live in compendia and on sheets yields `'no-items'`, which is SILENCE and never a clean bill
  // of health. The suggested correction is the ACTIVE SYSTEM's preset, not the built-in default.
  const report = probeStackQuantityPath(game.items ?? [], {
    path,
    defaultPath: stackQuantityPathPresetFor(game.system?.id),
  });
  const message = describeStackQuantityProbe(report);
  // PERMANENT: subject to the scope caveat above, this is the remaining defence against a typo'd
  // path destroying stacks. The object-valued write guard cannot see the failure, because all four
  // consume sites take `item.delete()` INSTEAD of `item.update(...)`.
  if (message) ui.notifications?.warn?.(message, { permanent: true });
  return path;
}

/**
 * The GM-facing advisory for a stack-quantity probe result, or `null` when healthy: THE DECISION is
 * `stackQuantityAdvisory`'s and this is the i18n edge. The string names the CONSEQUENCE plainly.
 */
function describeStackQuantityProbe(report) {
  const advisory = stackQuantityAdvisory(report);
  if (!advisory) return null;
  return game.i18n?.format?.(advisory.key, advisory.data) ?? advisory.key;
}

function getGatheringRunViewer({ run } = {}) {
  const userId = run?.userId;
  return game.users?.get?.(userId) ?? { id: userId ?? null, isGM: false };
}

function isCurrentWorldPaused() {
  return game.paused === true;
}

/**
 * The ACTIVE-GM edge for a relayed BLIND gathering start (issue 901). THE GM RE-RUNS THE WHOLE
 * ATTEMPT WITH THE REQUESTING USER AS THE VIEWER, so every gate is re-evaluated against the player
 * who asked and `_isOpaqueBlindTask` stays TRUE. `senderId` is the attested socket sender.
 */
async function applyGatheringBlindStart({ senderId, environmentId, actorUuid, taskId = null, interactableRef = null } = {}) {
  const requester = game.users?.get?.(senderId) ?? null;
  if (!requester) return null;
  const resolve = globalThis.fromUuidSync;
  let startActor = null;
  try { startActor = typeof resolve === 'function' ? resolve(String(actorUuid)) : null; } catch (_) { startActor = null; }
  if (!startActor) return null;
  // `interactive: false`: the situational-modifier dialog belongs to the player's client, never the
  // GM's, and a timed blind run does not roll at start anyway.
  return gatheringEngine?.startAttempt({
    viewer: requester,
    actor: startActor,
    environmentId,
    taskId,
    interactableRef,
    interactive: false
  });
}

/** Resolve an addressed actor synchronously, or `null` when it names nothing reachable. */
function resolveComplicationActor(actorUuid) {
  const resolve = globalThis.fromUuidSync;
  if (typeof resolve !== 'function' || !actorUuid) return null;
  try { return resolve(String(actorUuid)) ?? null; } catch (_) { return null; }
}

/** The corpus the GM-side re-read resolves against (issue 1286): THIS client's own components. */
function complicationComponentsFor(craftingSystemId) {
  return fabricate.craftingSystemManager?.getComponentsForSystem?.(craftingSystemId) ?? [];
}

/**
 * The token and speaker the GM side resolves for an addressed actor, NEVER read from the payload.
 * Guarded: a throwing `getSpeaker` would reject out of the fire-and-forget apply.
 */
function resolveComplicationSpeaker(actor) {
  try {
    const token = actor?.token ?? actor?.getActiveTokens?.(false, true)?.[0] ?? null;
    return { token, speaker: globalThis.ChatMessage?.getSpeaker?.({ actor, token }) ?? null };
  } catch (error) {
    console.warn('Fabricate | Could not resolve a complication speaker', error);
    return { token: null, speaker: null };
  }
}

/**
 * Run one complication's authored macro on this elected-GM client and REPORT what happened, never
 * throwing; `recipes-and-steps/spec.md` § Complication Macros owns the `script` call-site gate, the
 * double uuid resolve and why the return is a REPORT rather than the macro's own value.
 */
async function runComplicationMacro({ craftingSystemId, component, complication, entry, actor, token, speaker, senderUser, resolutionId }) {
  const macroUuid = complication.macroUuid;
  if (!macroUuid) return { status: 'none', macroUuid: null };
  let macro;
  try {
    macro = await fromUuid(macroUuid);
  } catch {
    macro = null;
  }
  if (!isRunnableComplicationMacro(macro)) {
    console.warn(
      `Fabricate | Complication "${complication.name || complication.id}" names a macro that could not be resolved to a script macro and was skipped (${macroUuid})`
    );
    return { status: 'skipped', macroUuid };
  }
  try {
    await MacroExecutor.run(macroUuid, buildComplicationMacroContext({
      craftingSystemId, component, complication, entry, actor, token, speaker, senderUser, resolutionId
    }));
    return { status: 'ran', macroUuid };
  } catch (error) {
    console.error(`Fabricate | Complication macro failed (${macroUuid})`, error);
    return { status: 'failed', macroUuid };
  }
}

/**
 * Everything the elected GM DOES for one re-read complication: a `gmOnly` effect roll, then the
 * macro. Independent, so each carries its own guard, and the macro is unordered.
 */
async function runComplicationDelivery({ craftingSystemId, component, complication, entry, actor, token, speaker, senderUser, resolutionId }) {
  const effect = await rollGmComplicationEffect({ complication, actor, speaker });
  const macro = await runComplicationMacro({
    craftingSystemId, component, complication, entry, actor, token, speaker, senderUser, resolutionId
  });
  return { effect, macro };
}

/**
 * Whether the ADDRESSED crafting system narrates to chat at all (issue 1286). NEITHER THE MACRO NOR
 * THE EFFECT ROLL IS GATED BY THIS, and it SELECTS ROWS rather than vetoing the card —
 * `recipes-and-steps/spec.md` § Complication Macros owns both rules. Read from THIS client's copy,
 * defaulted CLOSED.
 */
function complicationChatOutputEnabled(craftingSystemId) {
  return fabricate.craftingSystemManager?.getSystem?.(craftingSystemId)?.features?.chatOutput === true;
}

/**
 * Whether one delivered row's macro reports a CONFIGURATION FAULT rather than an outcome: `skipped`
 * is an unresolvable `macroUuid` and `failed` a body that threw; `none` and `ran` are outcomes.
 */
function hasComplicationMacroFault(row) {
  const status = row?.report?.macro?.status;
  return status === 'skipped' || status === 'failed';
}

/**
 * The GM-only chat card for one delivered resolution — the OUTPUT half of a `gmOnly` complication
 * (issue 1286); `recipes-and-steps/spec.md` § Complication Macros owns the row set and the
 * `chatOutput` rule. FOUR STEPS, IN AN ORDER THAT IS LOAD-BEARING: the `chatOutput` gate first and
 * over the ROW SET, so a gated-off system with nothing faulted returns before any projection;
 * SPEAKER before the visibility pass, which `applyBulkChatVisibility` states as a caller contract;
 * VISIBILITY before `create`, through an EXPLICIT `gmroll`; and `create` INSIDE the same guard, so
 * a card that could not be made GM-only is never posted.
 */
async function postGmComplicationCard({ craftingSystemId, actor, speaker, senderUser, applied = [] }) {
  try {
    // Over `applied` rather than the projected entries, so the suppressed case returns early.
    const delivered = Array.isArray(applied) ? applied : [];
    const reported = complicationChatOutputEnabled(craftingSystemId)
      ? delivered
      : delivered.filter((row) => hasComplicationMacroFault(row));
    if (reported.length === 0) return null;
    // `gmComplicationCardEntries` — the only projection that may carry an authored description or a
    // severity to a GM surface — augmented with what THIS client did. A suite can drive it directly.
    const entries = gmComplicationCardEntries(reported);
    const content = buildGmComplicationCardContent(
      { entries, actorName: actor?.name ?? '', reporterName: senderUser?.name ?? '' },
      (key) => game.i18n?.localize?.(key) ?? key
    );
    if (!content) return null;

    const chatData = { author: game.user?.id, speaker, content };
    applyBulkChatVisibility(chatData, 'gmroll');
    return await ChatMessage.create(chatData);
  } catch (error) {
    console.error('Fabricate | Failed to post the GM complication card', error);
    return null;
  }
}

/**
 * The ELECTED-GM edge for a relayed complication delivery (issue 1286); `recipes-and-steps/spec.md`
 * § Complication Macros owns the re-read, the attested `senderId` and the per-complication
 * isolation. The Foundry EDGE only — the pure half lives in `complicationSocket.js`.
 */
async function applyComplicationDelivery({ senderId, craftingSystemId, actorUuid, resolutionId, complications = [] } = {}) {
  const senderUser = game.users?.get?.(senderId) ?? null;
  if (!senderUser) return null;
  const actor = resolveComplicationActor(actorUuid);
  // Failing CLOSED is right, but VISIBLY: `fromUuidSync` answers a compendium uuid with an index
  // entry carrying no `testUserPermission`, so such a delivery would be refused with no trace.
  if (!actor || typeof actor.testUserPermission !== 'function') {
    console.warn('Fabricate | Refused a complication delivery: the addressed actor could not be resolved to a permission-testable document', {
      senderId, actorUuid
    });
    return null;
  }
  // Ask the ATTESTED SENDER's own permission directly: `actor.isOwner` resolves against the AMBIENT
  // `game.user`, which on the elected GM's client owns every actor. THE RULE (issue 1288) IS THAT NO
  // OWNERSHIP PREDICATE ON A GM-SIDE APPLY PATH MAY READ `isOwner`.
  if (actor.testUserPermission(senderUser, 'OWNER') !== true) {
    console.warn('Fabricate | Refused a complication delivery: the sender does not own the addressed actor', {
      senderId, actorUuid
    });
    return null;
  }
  const { token, speaker } = resolveComplicationSpeaker(actor);
  const applied = await applyAuthoredComplications({
    components: complicationComponentsFor(craftingSystemId),
    complications,
    execute: ({ component, complication, entry }) => runComplicationDelivery({
      craftingSystemId, component, complication, entry, actor, token, speaker, senderUser, resolutionId
    })
  });
  await postGmComplicationCard({ craftingSystemId, actor, speaker, senderUser, applied });
  return applied;
}

/** Execute a gathering macro through the shared macro runner. */
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
    resolveItemUuid: (uuid) => fromUuid(uuid),
    evaluateExpression
  });
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

function eventScenePromptText(key, fallback, data) {
  const i18n = game?.i18n;
  if (!i18n) return fallback;
  if (data) return i18n.format?.(key, data) ?? fallback;
  const out = i18n.localize?.(key);
  return out && out !== key ? out : fallback;
}

// GM-side prompt choosing which active players to pull to a dropped event's linked scene. Lives
// here rather than in the engine because it is Foundry glue.
async function showEventScenePrompt({ sceneUuid, eventName } = {}) {
  const scene = typeof fromUuid === 'function' ? await fromUuid(sceneUuid) : null;
  if (!scene) {
    ui.notifications?.warn?.(eventScenePromptText(
      'FABRICATE.Admin.Manager.Environment.Events.EventScenePrompt.Missing',
      'The event\'s linked scene could not be found.'
    ));
    return;
  }
  const sceneName = scene.name || sceneUuid;
  const players = Array.from(game.users?.contents || []).filter(user => user?.active && !user?.isGM);
  const intro = eventScenePromptText(
    'FABRICATE.Admin.Manager.Environment.Events.EventScenePrompt.Intro',
    `${eventName || 'An event'} dropped. Move players to ${sceneName}?`,
    { event: eventName || 'An event', scene: sceneName }
  );
  const rows = players.length === 0
    ? `<p class="notes">${fabricateEscapeHtml(eventScenePromptText('FABRICATE.Admin.Manager.Environment.Events.EventScenePrompt.NoPlayers', 'No active players to move.'))}</p>`
    : players.map(user => `<label style="display:flex;align-items:center;gap:6px;"><input type="checkbox" class="fab-pull-player" value="${fabricateEscapeHtml(user.id)}" checked /> ${fabricateEscapeHtml(user.name)}</label>`).join('');
  const content = `<div style="display:flex;flex-direction:column;gap:6px;"><p>${fabricateEscapeHtml(intro)}</p>${rows}</div>`;
  renderDialog({
    title: eventScenePromptText('FABRICATE.Admin.Manager.Environment.Events.EventScenePrompt.Title', 'An event occurred'),
    content,
    default: 'move',
    buttons: {
      move: {
        label: eventScenePromptText('FABRICATE.Admin.Manager.Environment.Events.EventScenePrompt.Move', 'Move players'),
        callback: (html) => {
          const root = html?.[0] ?? html;
          const userIds = root
            ? Array.from(root.querySelectorAll('.fab-pull-player:checked')).map(input => input.value)
            : [];
          void viewScene(sceneUuid);
          if (userIds.length > 0) {
            game.socket?.emit(EVENT_SCENE_SOCKET, { action: 'pullToScene', sceneUuid, userIds });
          }
        }
      },
      cancel: {
        label: eventScenePromptText('FABRICATE.Admin.Manager.Environment.Events.EventScenePrompt.Cancel', 'Cancel')
      }
    }
  });
}

function localizeGathering(key, data = {}) {
  return game.i18n?.format?.(key, data) ?? game.i18n?.localize?.(key) ?? key;
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
      callback: () => gatheringEngine?.processWorldTime?.(worldTime)
    }
  ]));
}

// Tracks which deprecated API names have already warned, so the notice fires once per old name
// rather than on every call.
const _deprecationWarned = new Set();

/** One-time console deprecation notice for a renamed public API method. Never throws. */
function deprecate(oldName, newName) {
  if (_deprecationWarned.has(oldName)) return;
  _deprecationWarned.add(oldName);
  console.warn(`Fabricate: ${oldName} is deprecated; use ${newName} instead.`);
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
      // Which Scene Region UUIDs the party's travel marker sits inside. PREFER Foundry's
      // AUTHORITATIVE `TokenDocument#regions`, free of the move-animation lag that makes position
      // hit-testing report the region just left; hit-test only when membership is unavailable.
      senseSceneRegions: (travelActorUuid) => {
        const resolve = globalThis.fromUuidSync;
        if (typeof resolve !== 'function' || !travelActorUuid) return [];
        let actor = null;
        try { actor = resolve(String(travelActorUuid)); } catch (_) { actor = null; }
        const tokens = actor?.getActiveTokens?.(false, true) || [];
        const uuids = new Set();
        for (const token of tokens) {
          const memberRegions = token?.regions;
          let matched = false;
          if (memberRegions && typeof memberRegions[Symbol.iterator] === 'function') {
            for (const region of memberRegions) {
              if (region?.uuid) { uuids.add(String(region.uuid)); matched = true; }
            }
          }
          if (matched) continue;
          const scene = token?.parent ?? token?.scene ?? null;
          for (const uuid of sceneRegionUuidsContainingToken({ scene, token })) uuids.add(uuid);
        }
        return uuids;
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
    gatheringEngine = new GatheringEngine({
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
        getCurrentScene: () => game.scenes?.current ?? game.scene ?? globalThis.canvas?.scene ?? null
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
    });
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

  /**
   * Read redaction-safe current-realm evidence for a selected actor, gated on a system and
   * player-callable: the resolved source token and display data only, never a secret realm record.
   */
  getGatheringLocationForActor({ actorId = null, actor = null, systemId = null } = {}) {
    this._requireReady();
    const resolvedActor = actor || (actorId ? game.actors?.get(actorId) : null);
    if (!resolvedActor || !systemId) return null;
    // Realm/travel disabled for this system: no location surface at all.
    if (!isGatheringRealmsEnabled(this.craftingSystemManager?.getSystem(systemId))) return null;
    const context = this.gatheringLocationService?.buildCurrentRealmContext({ actor: resolvedActor });
    if (!context) return null;
    const isGM = game.user?.isGM === true;
    // Reveal mode and realm discovery are both WORLD facts now (issue 1282). `systemId` above
    // remains the GATE — whether this system surfaces a location at all — and nothing more.
    const revealMode = getRealmRevealMode(this.gatheringRealmStore?.get?.());
    const discoveredRealmIds = getDiscoveredRealmIds(resolvedActor);
    return buildLocationSummaryForViewer({ context, isGM, revealMode, discoveredRealmIds });
  }

  /**
   * Set a party's manual current-realm override. GM-only, and a party has ONE override since issue
   * 1282, so `systemId` gates the write rather than selecting which one is written.
   */
  setGatheringPartyRealmOverride({ partyId = null, systemId = null, realmIds = [] } = {}) {
    this._requireReady();
    this._requireGM();
    if (!partyId || !systemId) return null;
    // Realm/travel disabled: no-op, and no override writes.
    if (!isGatheringRealmsEnabled(this.craftingSystemManager?.getSystem(systemId))) return null;
    return this.gatheringPartyStore?.setCurrentRealmOverride(partyId, realmIds);
  }

  /** @deprecated Use `setGatheringPartyRealmOverride`. */
  setGatheringPartyRegionOverride({ partyId = null, systemId = null, regionIds = [] } = {}) {
    deprecate('setGatheringPartyRegionOverride', 'setGatheringPartyRealmOverride');
    return this.setGatheringPartyRealmOverride({ partyId, systemId, realmIds: regionIds });
  }

  /** Clear a party's current-realm override for one crafting system. GM-only. */
  clearGatheringPartyRealmOverride({ partyId = null, systemId = null } = {}) {
    this._requireReady();
    this._requireGM();
    if (!partyId || !systemId) return null;
    // Realm/travel disabled: no-op, and no override writes.
    if (!isGatheringRealmsEnabled(this.craftingSystemManager?.getSystem(systemId))) return null;
    return this.gatheringPartyStore?.clearCurrentRealmOverride(partyId);
  }

  /** @deprecated Use `clearGatheringPartyRealmOverride`. */
  clearGatheringPartyRegionOverride({ partyId = null, systemId = null } = {}) {
    deprecate('clearGatheringPartyRegionOverride', 'clearGatheringPartyRealmOverride');
    return this.clearGatheringPartyRealmOverride({ partyId, systemId });
  }

  /**
   * Reveal a realm's discovery on an actor. GM-only, the realm must exist in the WORLD library, and
   * `systemId` is the participation gate rather than an ownership claim.
   */
  revealGatheringRealmForActor({ actorId = null, actor = null, systemId = null, realmId = null, source = 'manual', partyId = null } = {}) {
    this._requireReady();
    this._requireGM();
    const resolvedActor = actor || (actorId ? game.actors?.get(actorId) : null);
    if (!resolvedActor || !systemId || !realmId) return Promise.resolve(false);
    const system = this.craftingSystemManager?.getSystem(systemId);
    // Realm/travel disabled: no-op, and no discovery writes.
    if (!isGatheringRealmsEnabled(system)) return Promise.resolve(false);
    // `systemId` above stays the GATE — whether this system surfaces travel at all. The realm is
    // validated against the WORLD library (issue 1282), and the discovery it writes is world-wide.
    return revealGatheringRealm(resolvedActor, {
      realmId,
      source,
      partyId,
      validateRealmExists: this.gatheringRealmStore?.get?.(),
      now: () => Date.now()
    });
  }

  /** @deprecated Use `revealGatheringRealmForActor`. */
  revealGatheringRegionForActor({ actorId = null, actor = null, systemId = null, regionId = null, source = 'manual', partyId = null } = {}) {
    deprecate('revealGatheringRegionForActor', 'revealGatheringRealmForActor');
    return this.revealGatheringRealmForActor({ actorId, actor, systemId, realmId: regionId, source, partyId });
  }

  /** Hide a realm's discovery on an actor. GM-only. */
  hideGatheringRealmForActor({ actorId = null, actor = null, systemId = null, realmId = null } = {}) {
    this._requireReady();
    this._requireGM();
    const resolvedActor = actor || (actorId ? game.actors?.get(actorId) : null);
    if (!resolvedActor || !systemId || !realmId) return Promise.resolve(false);
    // Realm/travel disabled: no-op, and no discovery writes.
    if (!isGatheringRealmsEnabled(this.craftingSystemManager?.getSystem(systemId))) return Promise.resolve(false);
    return hideGatheringRealm(resolvedActor, { realmId });
  }

  /** @deprecated Use `hideGatheringRealmForActor`. */
  hideGatheringRegionForActor({ actorId = null, actor = null, systemId = null, regionId = null } = {}) {
    deprecate('hideGatheringRegionForActor', 'hideGatheringRealmForActor');
    return this.hideGatheringRealmForActor({ actorId, actor, systemId, realmId: regionId });
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
   * List gathering environments and tasks for the current user and selected actor; the engine always
   * receives the current Foundry user as viewer. An omitted `rememberedActorId` falls back to the
   * persisted selection, resolved against the OWNERSHIP list rather than the player-character one.
   */
  listGatheringForActor(options = {}) {
    if (!this.ready) {
      throw new Error('Fabricate not initialized');
    }

    // Resolve against the persisted last-gathering selection by default; an explicit truthy id
    // still overrides.
    const withRememberedActor = this._withRememberedActorDefault(options);

    return callGatheringRuntimeWithCurrentViewer(gatheringEngine, 'listForActor', withRememberedActor, () => game.user);
  }

  /**
   * The actors the current user may select in the unified-window actor selection bar: selectable
   * PLAYER CHARACTERS, owned for a non-GM and all for a GM. Display data only. This predicate is
   * DISTINCT from gathering attempt authorization and does not expand it.
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

  /** Persist the remembered gathering-actor selection to the existing client setting. */
  setSelectedGatheringActorId(id) {
    return setSetting(SETTING_KEYS.LAST_GATHERING_ACTOR, id ?? '');
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
   * The ONE authorization rule every GM-gated, actor-targeted facade member applies (issue 1289);
   * `companion-api/spec.md` § Behavioural Member Rules owns the normative GM -> actor -> readiness
   * order. THE MESSAGE KEYS ARE PARAMETERS. A SECOND COPY lives on the GM Knowledge surface's shell,
   * unifying them crossing the facade/UI boundary; named here so a THIRD copy meets it.
   */
  _requireGmActor(actorId, { gmOnlyKey, noActorKey }) {
    if (game.user?.isGM !== true) {
      return { actor: null, outcome: COMPANION_OUTCOMES.gmOnly, message: gmOnlyKey };
    }
    const actor = this._resolveCraftingActor(actorId);
    if (!actor) {
      return { actor: null, outcome: COMPANION_OUTCOMES.noActor, message: noActorKey };
    }
    return { actor, outcome: null, message: null };
  }

  /**
   * The SET-VALUED extension of `_requireGmActor`, for the two pooled members (issue 1342).
   * `companion-api/spec.md` § Behavioural Member Rules owns every rule, the DUPLICATED GM text and
   * the UUID address included. It takes NO refusal strings — each pooled delegator answers through
   * its own result builder.
   */
  _requireGmActors(actorUuids) {
    if (game.user?.isGM !== true) {
      return { actors: null, outcome: COMPANION_OUTCOMES.gmOnly, messageData: null };
    }
    return gatePooledActorUuids(actorUuids, {
      resolveActor: (uuid) => {
        const addressed = globalThis.fromUuidSync?.(uuid) ?? null;
        if (addressed?.documentName !== 'Actor') return null;
        return addressed.inCompendium === true ? null : addressed;
      }
    });
  }

  /**
   * GM-only crafting-knowledge reset (issue 773), clearing one actor's learned recipes and scoped
   * discovery for one system, or every system when `systemId` is null. EXPLICITLY GM-GATED, it
   * mutating player-owned actor state and, for `total`-scope books, a world setting. NEVER THROWS.
   */
  async resetActorKnowledge({ actorId = null, systemId = null, freeLearnBudget = true } = {}) {
    const gate = this._requireGmActor(actorId, {
      gmOnlyKey: 'FABRICATE.Knowledge.Reset.GMOnly',
      noActorKey: 'FABRICATE.Knowledge.Reset.NoActor'
    });
    if (gate.outcome) return { success: false, message: gate.message };
    const actor = gate.actor;
    const service = this.recipeVisibilityService;
    const result = systemId
      ? await service.forgetSystemLearnedRecipes(actor, systemId, { freeLearnBudget })
      : await service.forgetAllLearnedRecipes(actor, { freeLearnBudget });
    return {
      success: result.success === true,
      message: 'FABRICATE.Knowledge.Reset.Success',
      messageData: { actor: actor.name, count: result.count || 0, systemId },
    };
  }

  /**
   * `COMPANION.grantRecipeKnowledge` — teach one actor one recipe with NO owned book (issue 1289).
   * Unbounded by design, WHICH IS WHY it lives in the free function `grantRecipeKnowledgeToActor`:
   * `RecipeVisibilityService` is handed out LIVE AND UNGATED, so the write would be reachable from
   * any player's console. It owns preconditions 1-3 only.
   */
  async grantRecipeKnowledge({ actorId = null, recipeId = null, grantedBy = null } = {}) {
    const gate = this._requireGmActor(actorId, {
      gmOnlyKey: KNOWLEDGE_GRANT_MESSAGE_KEYS[COMPANION_OUTCOMES.gmOnly],
      noActorKey: KNOWLEDGE_GRANT_MESSAGE_KEYS[COMPANION_OUTCOMES.noActor]
    });
    // ONE guard, holding the normative order: the preamble's refusal decides first and readiness
    // only where it passed, because `_requireReady()` throws and this member may not.
    if (gate.outcome || this.ready !== true) {
      return knowledgeGrantResult(gate.outcome ?? COMPANION_OUTCOMES.notReady);
    }
    return await grantRecipeKnowledgeToActor({ actor: gate.actor, recipeId, grantedBy }, {
      resolveRecipe: (id) => this.recipeManager?.getRecipe?.(id) ?? null,
      resolveSystem: (recipe) => this.craftingSystemManager?.getSystem?.(recipe?.craftingSystemId) ?? null,
      isObservable: (system) => this.recipeVisibilityService?.isLearnedKnowledgeObservable?.(system) === true,
      readFlag: (actor, key, fallback) => getFabricateFlag(actor, key, fallback),
      writeFlag: (actor, key, value) => setFabricateFlag(actor, key, value)
    });
  }

  /**
   * `COMPANION.checkAffordability` — can this actor afford `amount` of `unitId` against the WORLD
   * coin ladder (issue 1289)? World scope, so no `requirements.currency` toggle; ladder-aware; it
   * writes nothing. GM-gated for the grant's reason plus its own: on a `macro`-strategy world it
   * triggers GM-authored macro code with caller-chosen arguments.
   */
  async checkAffordability({ actorId = null, unitId = null, amount = null } = {}) {
    const gate = this._requireGmActor(actorId, {
      gmOnlyKey: AFFORDABILITY_MESSAGE_KEYS[COMPANION_OUTCOMES.gmOnly],
      noActorKey: AFFORDABILITY_MESSAGE_KEYS[COMPANION_OUTCOMES.noActor]
    });
    if (gate.outcome || this.ready !== true) {
      return affordabilityResult(gate.outcome ?? COMPANION_OUTCOMES.notReady);
    }
    return await checkWorldCurrencyAffordability(gate.actor, { unitId, amount }, this._worldCurrencySeams());
  }

  /**
   * The ONE seam bag both WORLD-scoped currency members inject (issue 1301). `isElectedExecutor` is
   * deliberately NOT here — the check gates on no call site, writing nothing — and `creditCurrency`
   * spreads this bag and adds it.
   */
  _worldCurrencySeams() {
    return {
      getCurrencyConfig: () => this.currencyConfigStore?.get?.() ?? null,
      actorPropertyCoinSpender: this.actorPropertyCoinSpender,
      actorInventoryCoinSpender: this.actorInventoryCoinSpender
    };
  }

  /**
   * `COMPANION.creditCurrency` — credit `amount` of `unitId` to an actor against the WORLD coin
   * ladder (issue 1301), sharing request resolution with `checkAffordability`. SITED BESIDE IT so
   * the two delegators are not adjacent here or in the harness mirror — MEASURED: adjacent
   * near-identical delegators concatenate into ONE duplicated run over the debt bar. It routes
   * through the spender's `refund`, so `caller: 'award'` tells a credit from a cancel. NOT IDEMPOTENT.
   */
  async creditCurrency({ actorId = null, unitId = null, amount = null, callSite = null } = {}) {
    const gate = this._requireGmActor(actorId, CREDIT_CURRENCY_GATE_KEYS);
    if (gate.outcome || this.ready !== true) {
      return currencyCreditResult(gate.outcome ?? COMPANION_OUTCOMES.notReady);
    }
    return await creditWorldCurrency(gate.actor, { unitId, amount, callSite }, {
      ...this._worldCurrencySeams(),
      isElectedExecutor: () => game.users?.activeGM?.id === game.user?.id
    });
  }

  /**
   * The seam bag `readPooledHoldings` injects (issue 1342). It SPREADS `_worldCurrencySeams`, the
   * read's currency axis being the same WORLD ladder; `findComponentItems` is the PUBLISHED matcher,
   * so what this COUNTS and what the consume TAKES cannot disagree. THREE SEAMS THE LEAF DECLARES
   * ARE DELIBERATELY ABSENT, for the reason `createOrStack` is absent from the award bag.
   */
  _pooledHoldingsSeams() {
    return {
      ...this._worldCurrencySeams(),
      listSystems: () => this.craftingSystemManager?.getSystems?.() ?? [],
      craftingSystemManager: this.craftingSystemManager,
      findComponentItems: (actor, component, system) => this.craftingEngine?.findComponentItems?.(actor, component, system) ?? []
    };
  }

  /**
   * `COMPANION.readPooledHoldings` — what a SET of characters holds between them (issue 1342);
   * `companion-api/spec.md` § The Read Is Not A Reservation owns the rules. Sited HERE for the
   * duplicated-run reason on `creditCurrency`, and the first member addressed by actor UUID.
   */
  async readPooledHoldings({ actorUuids = null, costs = null } = {}) {
    const gate = this._requireGmActors(actorUuids);
    if (gate.outcome || this.ready !== true) {
      return pooledHoldingsReadResult(gate.outcome ?? COMPANION_OUTCOMES.notReady, gate.messageData);
    }
    return await readPooledHoldingsAcrossActors(gate.actors, { costs }, this._pooledHoldingsSeams());
  }

  /**
   * The ONE seam bag both Standalone Check Roll members inject. `resolveActor` and `isGm` are
   * deliberately ABSENT, both gates living in the facade; `prompt` and `promptBulk` exist because
   * both prompt functions AUTO-CONFIRM where there is no `DialogV2`.
   */
  _companionCheckSeams() {
    return {
      isElectedExecutor: () => game.users?.activeGM?.id === game.user?.id,
      hasDiceEngine: () => typeof globalThis.Roll === 'function',
      localize: (key, fallback) => {
        const resolved = bridgeLocalize(key);
        return typeof resolved === 'string' && resolved !== '' && resolved !== key ? resolved : fallback;
      },
      prompt: promptCheckRoll,
      promptBulk: promptBulkCheckRoll,
      runPassFail: runFormulaPassFail,
      runProgressive: runFormulaProgressive,
      buildRollOptions: buildInteractiveRollOptions
    };
  }

  /**
   * `COMPANION.rollActorCheck` — roll ONE formula for ONE actor, graded against a `dc` or ungraded
   * (issue 1293). It owns preconditions 1-3 only; the leaf owns the call-site gate.
   */
  async rollActorCheck({ actorId = null, callSite = null, formula = null, dc = null, compare = null, label = null, interactive = false, rollDecision = null } = {}) {
    const gate = this._requireGmActor(actorId, ROLL_ACTOR_CHECK_GATE_KEYS);
    if (gate.outcome || this.ready !== true) {
      return checkRollResult(gate.outcome ?? COMPANION_OUTCOMES.notReady);
    }
    return await rollStandaloneActorCheck({ actor: gate.actor, callSite, formula, dc, compare, label, interactive, rollDecision }, this._companionCheckSeams());
  }

  /**
   * `COMPANION.resolveBulkCheckDecision` — answer ONE roll decision the caller will apply to N rolls
   * it makes (issue 1293). It rolls nothing, and is GM-gated INLINE rather than through
   * `_requireGmActor`, which § Behavioural Member Rules scopes to ACTOR-TARGETED members.
   */
  async resolveBulkCheckDecision({ callSite = null, formulas = null } = {}) {
    const gmOnly = game.user?.isGM !== true ? COMPANION_OUTCOMES.gmOnly : null;
    if (gmOnly || this.ready !== true) {
      return bulkCheckDecisionResult(gmOnly ?? COMPANION_OUTCOMES.notReady);
    }
    return await resolveStandaloneBulkCheckDecision({ callSite, formulas }, this._companionCheckSeams());
  }

  /**
   * The seam bag `awardComponents` injects (issue 1301). FIVE seams, the sixth — `createOrStack` —
   * deliberately ABSENT: the leaf defaults it to the shared import, so passing it here would give
   * the create primitive two spellings and let a facade change route the award past the seam.
   */
  _componentAwardSeams() {
    return {
      resolveSystem: (systemId) => this.craftingSystemManager?.getSystem?.(systemId) ?? null,
      resolveComponent: (system, componentId) => findById(getDefinitionIndex(resolvedComponentsFor(system)), componentId) ?? null,
      findComponentItems: (actor, component, system) => this.craftingEngine?.findComponentItems?.(actor, component, system) ?? [],
      resolveSourceItem: (uuid) => fromUuid(uuid),
      isElectedExecutor: () => game.users?.activeGM?.id === game.user?.id
    };
  }

  /**
   * `COMPANION.awardComponents` — place components onto an actor's sheet (issue 1301);
   * `companion-api/spec.md` § The Award Members owns the rules. Preconditions 1-3 only; the leaf
   * owns the call-site gate, the election and the `awards` validation. NOT IDEMPOTENT.
   */
  async awardComponents({ actorId = null, systemId = null, awards = null, callSite = null } = {}) {
    const gate = this._requireGmActor(actorId, AWARD_COMPONENTS_GATE_KEYS);
    if (gate.outcome || this.ready !== true) {
      return componentAwardResult(gate.outcome ?? COMPANION_OUTCOMES.notReady);
    }
    return await awardComponentsToActor(gate.actor, { systemId, awards, callSite }, this._componentAwardSeams());
  }

  /**
   * The seam bag `consumePooledHoldings` injects (issue 1342): `_worldCurrencySeams` plus the
   * election, as `creditCurrency` does, this member WRITING. THE COMPONENT TRIO IS BOUND IDENTICALLY
   * TO THE AWARD'S, award, salvage and take having to resolve through one matcher.
   */
  _pooledConsumptionSeams() {
    return {
      ...this._worldCurrencySeams(),
      isElectedExecutor: () => game.users?.activeGM?.id === game.user?.id,
      resolveSystem: (systemId) => this.craftingSystemManager?.getSystem?.(systemId) ?? null,
      resolveComponent: (system, componentId) => findById(getDefinitionIndex(resolvedComponentsFor(system)), componentId) ?? null,
      findComponentItems: (actor, component, system) => this.craftingEngine?.findComponentItems?.(actor, component, system) ?? []
    };
  }

  /**
   * `COMPANION.consumePooledHoldings` — take costs from what a SET of characters holds between them
   * (issue 1342); § The Pooled Holdings Members owns the rules. The first published member that
   * REMOVES value, sited HERE for the duplicated-run reason recorded on `creditCurrency`.
   */
  async consumePooledHoldings({ actorUuids = null, callSite = null, costs = null } = {}) {
    const gate = this._requireGmActors(actorUuids);
    if (gate.outcome || this.ready !== true) {
      return pooledHoldingsConsumeResult(gate.outcome ?? COMPANION_OUTCOMES.notReady, gate.messageData);
    }
    return await consumePooledHoldingsFromActors(gate.actors, { callSite, costs }, this._pooledConsumptionSeams());
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
   * Lazily build and cache the `BulkSalvageService` behind `salvageComponents` (issue 859), every
   * collaborator injected so it reaches no Foundry global. CACHING IS SOUND BECAUSE EVERY
   * COLLABORATOR IS READ OFF `this` AT CALL TIME: `this.craftingEngine` is `null` until
   * `initialize()`, so a captured field value could hold `null` forever.
   */
  _getBulkSalvageService() {
    if (this._bulkSalvageService) return this._bulkSalvageService;
    this._bulkSalvageService = new BulkSalvageService({
      salvage: (actorUuid, systemId, componentId, options) =>
        this.craftingEngine.salvage(actorUuid, systemId, componentId, options),
      getCraftingSystem: (systemId) => this.craftingSystemManager.getSystem(systemId),
      promptRollDecision: promptBulkCheckRoll,
      postChatMessage: (message) => this._postBulkSalvageChatMessage(message),
      // The BATCHED complication relay (issue 1286), read off `this` at call time. One message per
      // addressed (system, actor) PAIR rather than per ROW, both halves being GM-side authorization
      // inputs and the rate limit being sized against the pair count.
      deliverComplications: (message) => this.complicationDeliveryWriter?.deliver(message),
      // The executing user's stored progressive stage order, through the SAME edge
      // `ResolutionModeService` and `CraftingEngine` are given (issue 1286). Only the pre-run
      // forecast consumes it; left unwired it quietly reads the AUTHORED order instead.
      getPlayerResultOrder: entry => this._readPlayerResultOrder(entry),
      // Key-only, matching every card module's `localize` contract; the aggregate card substitutes
      // its own counts.
      localize: (key) => game.i18n?.localize?.(key) ?? key
    });
    return this._bulkSalvageService;
  }

  /** Lazily build and cache the `BulkDestroyService` behind `destroyComponents` (issue 859). */
  _getBulkDestroyService() {
    if (this._bulkDestroyService) return this._bulkDestroyService;
    this._bulkDestroyService = new BulkDestroyService({
      getCraftingSystem: (systemId) => this.craftingSystemManager.getSystem(systemId),
      // Destroy MUST resolve documents through the identical matcher salvage uses, case-SENSITIVE
      // name fallback included, or it would delete what the player was shown as a different
      // component. Read off `this.craftingEngine` at CALL time, this service being cached.
      findComponentItems: (actor, component, system) =>
        this.craftingEngine.findComponentItems(actor, component, system),
      // Must RETURN the deleted documents: `unitsDeleted` comes from what came back, never from what
      // was asked for, a `preDeleteItem` hook being able to veto individual ids silently.
      deleteItems: (actor, itemIds) => actor.deleteEmbeddedDocuments('Item', itemIds)
    });
    return this._bulkDestroyService;
  }

  /**
   * Post the ONE aggregated bulk-salvage chat card. THE ORDER OF THE THREE STEPS IS LOAD-BEARING:
   * SPEAKER first, `applyMode`'s `ic` branch reading `chatData.speaker.actor` unguarded; VISIBILITY
   * before `create`, the legacy `rollMode` option being honoured only for a message carrying rolls;
   * and `create` LAST, with `author`, the V14 schema having no `user` field. THE SPEAKER IS BUILT,
   * NEVER INFERRED — `getSpeaker()` with no actor falls through to the CONTROLLED TOKENS. NEVER read
   * `core.messageMode`: `assertSetting` throws on V13 and `??` does not catch a throw.
   */
  async _postBulkSalvageChatMessage({ content, rollMode, actorUuid, actorNames = [] }) {
    // `globalThis.` rather than the bare global: optional chaining does not rescue an UNDECLARED
    // identifier, so a bare `fromUuidSync?.()` throws under a harness that has not installed it,
    // and this poster must never cost a completed run its report.
    const actor = actorUuid ? (globalThis.fromUuidSync?.(actorUuid) ?? null) : null;
    const alias = actorNames.filter(Boolean).join(', ') || game.user?.name || '';
    const speaker = actor
      ? ChatMessage.getSpeaker({ actor })
      : { scene: game.scenes?.current?.id ?? null, actor: null, token: null, alias };

    const chatData = { author: game.user?.id, speaker, content };
    applyBulkChatVisibility(chatData, rollMode || game.settings?.get?.('core', 'rollMode'));
    return await ChatMessage.create(chatData);
  }

  /**
   * Gate a bulk target list, resolving ONE actor per row from `target.actorId ?? actorId` and NOTHING
   * ELSE. No persisted-selection tail, unlike `_resolveCraftingSources`: a bulk run may span actors,
   * so that fallback would silently RETARGET an unresolved row. Order is preserved.
   */
  _gateBulkTargets(targets, actorId) {
    return (targets || []).filter(Boolean).map((target) => ({
      target,
      actor: this._resolveCraftingActor(target.actorId ?? actorId)
    }));
  }

  /**
   * Weave a service's result rows back into the caller's ORIGINAL target order, substituting a
   * refusal row where the gate resolved no actor, or "the third one failed" is unreadable.
   */
  _mergeBulkRows(gated, ranItems, buildRefusedRow) {
    const rows = [];
    let next = 0;
    for (const entry of gated) {
      if (entry.actor && next < ranItems.length) {
        rows.push(ranItems[next]);
        next += 1;
      } else {
        rows.push(buildRefusedRow(entry.target));
      }
    }
    return rows;
  }

  /**
   * The identity fields every refusal row carries, resolved from the crafting system so it still
   * READS as the thing the player selected rather than as a blank line.
   */
  _buildNotPermittedRow(target) {
    const system = this.craftingSystemManager?.getSystem?.(target?.systemId) ?? null;
    const component = findById(getDefinitionIndex(resolvedComponentsFor(system)), target?.componentId);
    return {
      actorId: target?.actorId ?? null,
      actorName: '',
      systemId: target?.systemId ?? null,
      componentId: target?.componentId ?? null,
      name: component?.name || '',
      img: component?.img || '',
      // The facade's own outcome, never folded into `skipped`: "you may not act on this actor" and
      // "this row was not runnable" are different answers and the panel chips them differently.
      outcome: 'notPermitted',
      skipReason: null
    };
  }

  /**
   * Salvage MANY owned components in one gesture (issue 859). IT TAKES AN `actorId` PER TARGET,
   * NEVER AN `actorUuid`, AT ANY NESTING LEVEL: neither the engine nor `BulkSalvageService` performs
   * an ownership check, so the per-target `_resolveCraftingActor` is the ONLY gate, and it resolves
   * through `game.actors`, excluding compendium-backed and unlinked token actors. An unresolvable
   * actor becomes a `notPermitted` ROW rather than a throw. `interactive` defaults TRUE here, unlike
   * `salvageComponent`. STATED LIMIT: `onProgress`'s `total` counts the rows the SERVICE was given.
   */
  async salvageComponents({ actorId = null, targets = [], interactive = true, onProgress = null } = {}) {
    this._requireReady();
    const gated = this._gateBulkTargets(targets, actorId);
    const runnable = gated.filter((entry) => entry.actor);

    const result = await this._getBulkSalvageService().run({
      targets: runnable.map(({ target, actor }) => ({
        actorUuid: actor.uuid,
        actorId: actor.id,
        actorName: actor.name,
        systemId: target.systemId,
        componentId: target.componentId
      })),
      interactive,
      onProgress
    });
    // A dismissed prompt returns before the first engine call, so nothing ran and there is no
    // per-row story to tell — pass the zero-mutation shape through rather than reporting refusals.
    if (result.cancelled) return result;

    const items = this._mergeBulkRows(gated, result.items, (target) => ({
      ...this._buildNotPermittedRow(target),
      rollValue: null,
      tierStep: null,
      message: '',
      results: [],
      consumed: [],
      tools: []
    }));
    return {
      cancelled: false,
      items,
      counts: {
        ...result.counts,
        total: items.length,
        notPermitted: items.length - result.items.length
      },
      posted: result.posted
    };
  }

  /**
   * Permanently destroy MANY owned components in one gesture (issue 859), under `salvageComponents`'
   * gate, merge and `onProgress` limit. DELETES WHOLE STACKS, deliberately NOT gated on
   * `features.salvage` or `salvage.enabled`: a player can already delete their own Items, so this is
   * ergonomics and not capability. No chat card. The caller owns the confirmation.
   */
  async destroyComponents({ actorId = null, targets = [], onProgress = null } = {}) {
    this._requireReady();
    const gated = this._gateBulkTargets(targets, actorId);
    const runnable = gated.filter((entry) => entry.actor);

    const result = await this._getBulkDestroyService().run({
      targets: runnable.map(({ target, actor }) => ({
        // The RESOLVED document, not an id: the service's matcher and delete both need the actor
        // itself, and re-resolving there would be a second gate to keep honest.
        actor,
        actorId: actor.id,
        actorName: actor.name,
        systemId: target.systemId,
        componentId: target.componentId
      })),
      onProgress
    });

    const items = this._mergeBulkRows(gated, result.items, (target) => ({
      ...this._buildNotPermittedRow(target),
      requested: 0,
      unitsDeleted: 0,
      documentsDeleted: 0,
      staleIds: 0,
      items: [],
      vetoed: []
    }));
    return { items, unitsDeleted: result.unitsDeleted, documentsDeleted: result.documentsDeleted };
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
   * Start a gathering attempt for the current user; the raw GatheringEngine stays module-internal so
   * every public attempt carries current-user viewer enforcement. `interactive` prompts on the
   * routed and progressive paths only.
   */
  startGatheringAttempt(options = {}) {
    if (!this.ready) {
      throw new Error('Fabricate not initialized');
    }

    // Resolve the SAME actor the listing was computed for. Without this the engine falls back to
    // `selectableActors[0]` and silently mis-gates the attempt — the "nothing happens" bug.
    const withRememberedActor = this._withRememberedActorDefault(options);
    const selectableActors = getGatheringSelectableActors({ viewer: game.user });
    const selectedActor = withRememberedActor.actor ?? (
      withRememberedActor.rememberedActorId
        ? selectableActors.find((actor) =>
            [actor?.id, actor?.uuid].includes(withRememberedActor.rememberedActorId)) ?? null
        : (selectableActors[0] ?? null)
    );
    Object.assign(withRememberedActor, { actor: selectedActor, lifecycleVersion: 1 });

    // `requestStart`, not `startAttempt`: a blind timed start this client may not write is routed to
    // the active GM before any task is drawn (issue 901). Wrapped in `executePublicGather` so a
    // READY attempt still finishes in one call — the `lifecycleVersion: 1` stamped above routes it
    // into a started run awaiting execution, so without this the public API answers
    // `accepted: true` and awards nothing (issue 1759). A waiting or timed attempt is untouched.
    return executePublicGather({
      requestStart: () =>
        callGatheringRuntimeWithCurrentViewer(
          gatheringEngine,
          'requestStart',
          withRememberedActor,
          () => game.user
        ),
      actor: selectedActor,
      executeCommand: (command, commandOptions) =>
        this.executeJournalRunCommand(command, commandOptions),
      // The gathering screen's `interactive: true` reaches the execute, so a required check still
      // opens its roll dialog; a macro's omitted flag stays the silent route (issue 1780).
      interactive: withRememberedActor.interactive === true,
    });
  }

  /**
   * The per-drop "What you might find" breakdown for one opened task, defaulting the remembered actor
   * to the persisted selection and enforcing the current user as viewer.
   */
  getGatheringDropBreakdown(options = {}) {
    if (!this.ready) {
      throw new Error('Fabricate not initialized');
    }

    const withRememberedActor = this._withRememberedActorDefault(options);

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
   * Read current gathering conditions and configured tag vocabularies. Player-safe: weather,
   * time-of-day and the available tags, but no GM-only library internals.
   */
  getGatheringConditions() {
    this._requireReady();
    return this.gatheringRichStateService?.getConditions();
  }

  /** Set the current global gathering weather tag. */
  setGatheringWeather(weatherTag) {
    this._requireReady();
    this._requireGM();
    return this.gatheringRichStateService?.setWeather(weatherTag);
  }

  /** Set the current global gathering time-of-day tag. */
  setGatheringTimeOfDay(timeOfDayTag) {
    this._requireReady();
    this._requireGM();
    return this.gatheringRichStateService?.setTimeOfDay(timeOfDayTag);
  }

  /**
   * Atomically update global gathering conditions, an omitted field keeping its value. A mutation
   * requires a GM and validates its tags through the rich state service.
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
    // Legacy back-compat: a `{ provider: 'external' }` argument maps to a read-only max. The service
    // tolerates the legacy value too, but mapping it here keeps the boundary on `maxReadOnly`.
    const { provider, ...rest } = options;
    const mapped =
      provider === undefined ? rest : { ...rest, maxReadOnly: provider === 'external' };
    return this.gatheringRichStateService?.setActorStamina(actor, mapped);
  }

  adjustGatheringStamina(options = {}) {
    this._requireReady();
    this._requireGM();
    const actor = options.actor || (options.actorId ? game.actors?.get(options.actorId) : null);
    return this.gatheringRichStateService?.adjustActorStamina(actor, options);
  }

  /** Read a crafting system's gathering economy block. Player-safe: mode and regen cadence. */
  getGatheringEconomy(options = {}) {
    this._requireReady();
    return this.gatheringRichStateService?.systemEconomy(options.systemId) ?? null;
  }

  /** Set a crafting system's gathering economy block. GM-only. */
  setGatheringEconomy(options = {}) {
    this._requireReady();
    this._requireGM();
    return this.gatheringRichStateService?.setSystemEconomy(options);
  }

  /** The stamina pools of player-owned actors for one system, for the GM Gathering State panel. */
  getGatheringStaminaState(options = {}) {
    this._requireReady();
    this._requireGM();
    const systemId = options.systemId;
    const service = this.gatheringRichStateService;
    if (!service || !systemId) return [];
    // Player characters only, per the CONFIGURED player-character actor types (issue 1024), so a
    // Fallout `robot` appears once the GM ticks it. No rolled pool reports `max: null`.
    return Array.from(game.actors?.contents ?? [])
      .filter(actor => isPlayerCharacterActor(actor))
      .map(actor => {
        const stamina = service.getActorStamina(actor, systemId);
        return { actorId: actor.id, name: actor.name, img: actor.img, ...stamina };
      });
  }

  /** (Re)roll a character's stamina pool from the system templates and persist it. GM-only. */
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
   * Submit a current-lifecycle operation through active-GM authority after initialization. Actor
   * UUIDs address this authenticated command boundary, whose GM handler rechecks the attested
   * sender's ownership; they do not replace actor IDs in the player crafting facades. A timeout is
   * an unknown response, not proof of failure and not permission to replay. `command` start uses an
   * empty runId and revision zero, and alchemy uses runType `crafting`.
   * `options` MUST BE FORWARDED: it carries `interactive`, and this signature once took `command`
   * alone while its caller passed both, so `game.fabricate.craft()` on a checked recipe opened a
   * dialog nobody could answer and waited forever — the source pin covered the CALL, not this
   * signature (issue 1759).
   */
  executeJournalRunCommand(command, options) {
    this._requireReady();
    return this.journalRunCommands?.executeJournalRunCommand(command, options)
      ?? Promise.resolve(authorityUnavailableRefusal());
  }

  /**
   * Hide a terminal entry for the current user in this world, preserving actor history. The awaited
   * user-scoped write follows the user across devices and can reject.
   */
  dismissJournalRun(options) {
    this._requireReady();
    return this.journalRunCommands?.dismissJournalRun(options)
      ?? Promise.resolve(authorityUnavailableRefusal());
  }

  /** This user's hidden native run keys for one actor; a different viewer gets an empty set. */
  getDismissedJournalRunKeys(options) {
    return this.journalRunCommands?.getDismissedJournalRunKeys(options) ?? new Set();
  }

  /** Cached authority availability; it neither provisions a ledger nor releases a claim. */
  getJournalRunAuthorityAvailability() {
    return this.journalRunCommands?.getJournalRunAuthorityAvailability()
      ?? authorityUnavailableAvailability();
  }

  /**
   * Ensure the private run-authority ledger exists, as the active GM. Idempotent: an existing
   * ledger is returned rather than refused, boot recovery and the command path already provision
   * automatically, and it never clears a retained execution claim.
   */
  setupJournalRunAuthority() {
    return this.journalRunCommands?.setupJournalRunAuthority()
      ?? Promise.resolve(authorityUnavailableRefusal());
  }

  /**
   * Record manual disposition of an exact retained execution claim as the active GM. Inspect actual
   * receipts and the uncertain applying boundary first, after confirming no other GM realm is still
   * executing; planned amounts are not proof of awards or spending. `claimId` is the claim's random
   * token (the `journalRunClaimId` flag on the ledger's `FabRunAuthority1` page), never the page id
   * or a run id. THIS RELEASES AUTHORITY ONLY: the old request stays non-replayable, an uncertain
   * run effect remains recovery-required, and it performs no replay, compensation or rollback.
   */
  reconcileJournalRunAuthority(options) {
    return this.journalRunCommands?.reconcileJournalRunAuthority(options)
      ?? Promise.resolve(authorityUnavailableRefusal());
  }

  /** Current world time in seconds, on this edge so the Journal store stays free of `game.*`. */
  getWorldTime() {
    return Number(game.time?.worldTime || 0);
  }

  /**
   * Calendar components for an absolute world time, plus `daysPerYear` where derivable, so the pure
   * `worldTimeLabel` util can compose a campaign day without touching `game.*`.
   */
  getWorldTimeComponents(worldTime = this.getWorldTime()) {
    const calendar = game.time?.calendar ?? null;
    if (typeof calendar?.timeToComponents !== 'function') return null;
    try {
      const components = calendar.timeToComponents(Number(worldTime) || 0);
      if (!components || typeof components !== 'object') return null;
      const daysPerYear = daysPerYearFromCalendar(calendar);
      if (daysPerYear !== null) components.daysPerYear = daysPerYear;
      return components;
    } catch {
      return null;
    }
  }

  /** Lazily construct the singleton `RunJournalBuilder`, so it is not rebuilt per listing call. */
  _getRunJournalBuilder() {
    if (!this._runJournalBuilder) {
      this._runJournalBuilder = new RunJournalBuilder({
        craftingRunManager: this.craftingRunManager,
        salvageRunManager: this.salvageRunManager,
        gatheringRunSource: this.gatheringRunManager,
        recipeManager: this.recipeManager,
        resolutionModeService: this.resolutionModeService,
        recipeVisibility: this.recipeVisibilityService,
        getSystem: (systemId) => this.craftingSystemManager?.getSystem(systemId) ?? null,
        getTool: (systemId, toolId) => this._resolveJournalTool(systemId, toolId),
        getGatheringTask: (environmentId, taskId) =>
          this._resolveJournalGatheringTask(environmentId, taskId),
        // GM-only secret preview of an in-flight blind run's drawn task (issue 901). The builder
        // consults it only for a GM viewer; a player's journal shows the generic blind label.
        getGatheringBlindSecret: (runId) => this.gatheringBlindRunStore?.get(runId) ?? null,
        // D-027: history names a blind task only once the reveal policy has disclosed it, never
        // because the viewer owns the actor. The engine owns the chat card's identical decision.
        isGatheringIdentityHidden: (args) =>
          gatheringEngine?.isHistoricalBlindIdentityHidden?.(args) === true,
        getResultItem: (itemUuid) => this._resolveJournalResultItem(itemUuid),
        getComponent: (systemId, componentId) =>
          this._resolveJournalComponent(systemId, componentId),
        getViewer: () => game.user,
        localize: (key, data) => localizeGathering(key, data),
        nowWorldTime: () => this.getWorldTime(),
        // The per-pass inventory snapshot's component resolver (issue 1228): the Journal reads no
        // tallies itself, but its snapshot must be the same complete value every other pass builds.
        resolveComponentForItem: findMatchingComponent,
        getComponentSourceActors: ({ actor, run }) => {
          const uuids = Array.isArray(run?.componentSourceActorUuids)
            ? run.componentSourceActorUuids
            : [];
          const sources = uuids
            .map((uuid) => globalThis.fromUuidSync?.(uuid) ?? null)
            .filter(Boolean);
          return sources.length > 0 ? sources : (actor ? [actor] : []);
        },
        resolveItemEssences: ({ item, recipe }) => {
          const system = this.craftingSystemManager?.getSystem(recipe?.craftingSystemId);
          return resolveItemEssences(
            item,
            resolvedComponentsFor(system),
            recipe?.craftingSystemId,
            findMatchingComponent
          );
        },
        affordCurrency: ({ actor, recipe, match }) =>
          buildCurrencyAffordProbe(
            actor,
            recipe,
            this.craftingEngine?._currencySeams?.() ?? {}
          )(match),
        // The AGGREGATE answer the per-option probe above cannot give: two currency ingredients
        // each affordable alone but not together (issue 1648, F2).
        affordCurrencySpends: ({ actor, recipe, currencySpends }) =>
          affordsCurrencySpends(
            actor,
            recipe,
            currencySpends,
            this.craftingEngine?._currencySeams?.() ?? {}
          ),
        getDismissedRunKeys: ({ actorUuid, viewerId }) =>
          this.getDismissedJournalRunKeys({ actorUuid, viewerId }),
        getJournalActionAvailability: () => this.getJournalRunAuthorityAvailability(),
      });
    }
    return this._runJournalBuilder;
  }

  /**
   * Resolve a system library tool to `{ id, name, img }` through `data-models` requirement 13's
   * precedence. THE SNAPSHOT RUNG IS LOAD-BEARING: an item-sourced Tool has a null `componentId` by
   * construction and without it printed its raw id (issue 1119).
   */
  _resolveJournalTool(systemId, toolId) {
    const system = this.craftingSystemManager?.getSystem(systemId);
    if (!system || !toolId) return null;
    const tool = resolvedToolsFor(system).find((entry) => entry?.id === toolId);
    if (!tool) return null;
    const component = linkedComponentFor(tool, resolvedComponentsFor(system));
    const img = resolveToolDisplayImage(tool, component);
    return {
      id: tool.id,
      name: resolveToolDisplayName(tool, component, tool.id),
      // The Journal renders its own default artwork, so the generic sentinel stays null.
      img: img === TOOL_IMAGE_SENTINEL ? null : img,
    };
  }

  /**
   * Resolve a gathering run's task to `{ name, img }` via the COMPOSED environment, which alone
   * carries the authored name and image; null leaves the raw-id fallback.
   */
  _resolveJournalGatheringTask(environmentId, taskId) {
    if (!environmentId || !taskId) return null;
    const environment = gatheringEngine?._findEnvironment?.(environmentId);
    const tasks = Array.isArray(environment?.tasks) ? environment.tasks : [];
    const task = tasks.find((entry) => entry?.id === taskId);
    return task ? { name: task.name, img: task.img } : null;
  }

  /**
   * Resolve a run's awarded item to `{ name, img }` by recorded uuid, labelling history written
   * before name and img were captured at award time. Best-effort and synchronous.
   */
  _resolveJournalResultItem(itemUuid) {
    if (!itemUuid || typeof fromUuidSync !== 'function') return null;
    let doc = null;
    try {
      doc = fromUuidSync(itemUuid);
    } catch {
      doc = null;
    }
    return doc ? { name: doc.name ?? null, img: doc.img ?? null } : null;
  }

  /**
   * Resolve a system component to `{ name, img }` for the Journal: a salvage run's title and the
   * fallback for a result that captured neither; null leaves the raw-id fallback.
   */
  _resolveJournalComponent(systemId, componentId) {
    if (!systemId || !componentId) return null;
    const system = this.craftingSystemManager?.getSystem(systemId);
    const component = findById(getDefinitionIndex(resolvedComponentsFor(system)), componentId);
    return component ? { name: component.name ?? null, img: component.img ?? null } : null;
  }

  /**
   * Resolve the Journal's selected actor against the bar-selectable list, remembered id first, then
   * the first selectable — the gathering listing's remembered-actor seam.
   */
  _resolveJournalActor(rememberedActorId) {
    const selectable = getBarSelectableActors({ viewer: game.user });
    if (selectable.length === 0) return null;
    if (rememberedActorId) {
      const wanted = String(rememberedActorId);
      const match = selectable.find((actor) => actor?.id === wanted || actor?.uuid === wanted);
      if (match) return match;
    }
    return selectable[0];
  }

  /** The unified Journal listing, through the same remembered-actor seam as the gathering listing. */
  listJournalForActor(options = {}) {
    this._requireReady();
    const { rememberedActorId } = this._withRememberedActorDefault(options);
    const actor = this._resolveJournalActor(rememberedActorId);
    return this._getRunJournalBuilder().buildListing({ actor, viewer: game.user });
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

const fabricate = new Fabricate();

// The init-time Foundry CONFIG entries for the canvas Interactable foundation. Idempotent, so it is
// safe from BOTH `init` and `ready`, the latter backstopping a late module evaluation.
function registerFabricateConfig() {
  // Register the region-first `fabricate.interactable` data model and its type icon. Defensive and
  // idempotent: a no-op when the Foundry region APIs are unavailable.
  registerInteractableRegionBehavior(CONFIG);

  // The CORE schema-driven `RegionBehaviorConfig` as the document sheet for `fabricate.interactable`:
  // the rich `InteractableConfigApp` is an ApplicationV2, NOT a DocumentSheet, so registering it
  // left `behavior.sheet` null and broke the edit pencil. The rich panel stays on the HUD entry.
  try {
    const DocumentSheetConfig = foundry?.applications?.apps?.DocumentSheetConfig
      ?? globalThis.DocumentSheetConfig;
    const RegionBehavior = foundry?.documents?.RegionBehavior
      ?? CONFIG?.RegionBehavior?.documentClass
      ?? globalThis.RegionBehavior;
    const RegionBehaviorConfig = globalThis.foundry?.applications?.sheets?.RegionBehaviorConfig;
    if (typeof RegionBehaviorConfig === 'function') {
      assignInteractableConfigSheet({
        registrar: DocumentSheetConfig,
        RegionBehavior,
        SheetClass: RegionBehaviorConfig
      });
    }
  } catch (_error) {
    // Defensive: a sheet-registration shape mismatch must not break init.
  }
}

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

Hooks.once('init', async () => {
  console.log('Fabricate | Init Hook');
  registerFabricateConfig();
  bindFabricateGlobal();
});

// GM-only Compendium Directory bulk-import action, at module top-level and NOT in the `ready` body:
// that context menu is built once in `_onFirstRender`, BEFORE `ready`. It MUTATES in place.
Hooks.on('getCompendiumContextOptions', (application, contextOptions) => {
  contextOptions.push(buildCompendiumImportContextOption({
    localize: bridgeLocalize,
    isGM: () => game.user?.isGM,
    isItemPack: (id) => game.packs.get(id)?.documentName === 'Item',
    getPackName: (id) => {
      const pack = game.packs.get(id);
      return pack?.title ?? pack?.metadata?.label ?? id;
    },
    getSystems: () => game.fabricate?.getCraftingSystemManager?.()?.getSystems?.() ?? [],
    promptSelectSystem: promptSelectCraftingSystem,
    importPack: (systemId, packId) => game.fabricate.getCraftingSystemManager().addItemsFromPack(systemId, packId),
    notify: ui.notifications
  }));
});

Hooks.once('ready', async () => {
  // Issue 1565: FIRST, because it depends on nothing Fabricate has built and a client on a stale
  // entry script may fail below. In the `ready` body, not `initialize()`, which the View Lab calls.
  reportStaleEntryScript();
  // Backstop for the `init` a late module evaluation can miss. Both helpers are idempotent, so this
  // guarantees `game.fabricate` and the Interactable CONFIG exist before readiness flips.
  registerFabricateConfig();
  bindFabricateGlobal();
  await fabricate.initialize();
  await processFabricateWorldTime();
  await runRecipeItemFlagAutoStamp();
  await runComponentFlagAutoStamp();
  // AFTER the MigrationRunner, which persists the `1.15.0` tool source-ref migration at init, and
  // after the component stamp: this reads the migration-populated tool refs.
  await runToolFlagAutoStamp();
  // Issue 600: re-stamp durable component identity onto owned items resolving by name only. AFTER
  // the source-side stamp, so a fresh drag inherits the flag first.
  await runOwnedItemComponentIdentityRestamp();
  // Issue 1363: remap the identity flags the `1.30.0` re-key invalidated. AFTER the source-side
  // stamps and the owned-item restamp, neither of which reaches this population.
  await runWorldScopeIdentityFlagRemap();
  // Issue 1654: remap the essence references the `1.34.0` merge invalidated. AFTER the `1.30.0`
  // remap — both rewrite the same run containers, and this one writes a forced replacement.
  await runWorldEssenceMergeFlagRemap();

  // Issue 800: a GM-only cue for a world whose stored descriptions predate write-time resolution.
  // A DETECTOR only — it rewrites nothing and self-clears once the GM has run Repair Item Data.
  notifyUnresolvedItemDescriptions();

  // Issue 1024: the GM-only advisory for a stack-quantity path that resolves nothing, or reads on
  // the prepared document but is absent from `_source` so every write is discarded. The path was
  // configured during `initialize()`; this adds the world scan, which needs `game.items`.
  applyItemStackQuantityPathSetting({ notify: true });

  // Wire the region-first canvas Interactable foundation: drop interception, the region-enter
  // prompt, the controlToken re-trigger and the interact keybinding. `register()` is idempotent.
  InteractableManager.instance.register();

  game.socket?.on(EVENT_SCENE_SOCKET, (payload, senderId) => {
    if (
      payload?.kind === JOURNAL_RUN_SOCKET_KIND.REQUEST ||
      payload?.kind === JOURNAL_RUN_SOCKET_KIND.REPLY
    ) {
      Promise.resolve(fabricate.journalRunCommands?.handleSocketMessage(payload, senderId)).catch(
        (error) => console.error('Fabricate | Journal run socket command failed', error)
      );
    }
    // `senderId` is Foundry's server-attested sender user id — the trusted 2nd callback arg of a
    // custom module socket broadcast, set from the authenticated session in
    // `dist/server/sockets.mjs handleCustomSocket` — which the interactable handler authenticates
    // privileged edges against (issue 593); payload `userId` fields are spoofable. Guarded because
    // this router shares the `module.fabricate` channel with the Interactable round-trip below.
    try {
      routeEventSceneSocketMessage(payload, {
        currentUserId: () => game.user?.id,
        isActiveGM: () => game.user?.id === game.users?.activeGM?.id,
        showPrompt: showEventScenePrompt,
        viewSceneForSelf: (uuid) => viewScene(uuid)
      });
    } catch (_error) {
      // Defensive: never block the Interactable payload below.
    }
    // The same channel carries the environment node depletion a player emits: only the active GM may
    // write `gatheringEnvironments`, so the decrement is applied here from its own stored state.
    try {
      routeGatheringNodeDepleteMessage(payload, {
        isActiveGM: () => game.user?.id === game.users?.activeGM?.id,
        senderId,
        // Bounds the residual denial-of-resource surface: the applier re-checks the node economy
        // but not whether the sender could reach that task, so throttle to human gathering speed.
        allowSender: gatheringDepletionRateLimiter,
        applyDeplete: (args) => {
          // The apply is async and nothing awaits a socket handler, so a failed world-setting write
          // must be caught here or it lands as an unhandled rejection on the GM's client.
          Promise.resolve(fabricate.gatheringRichStateService?.applyEnvironmentNodeDepletion(args))
            .catch(error => console.warn('Fabricate | Gathering node depletion failed', error));
        }
      });
    } catch (_error) {
      // Defensive: never block the Interactable payload below.
    }
    // The same channel carries a player's BLIND gathering start (issue 901): only the active GM may
    // write `gatheringBlindRuns`, and only a client the player does not control may draw the task.
    try {
      routeGatheringBlindStartMessage(payload, {
        isActiveGM: () => game.user?.id === game.users?.activeGM?.id,
        senderId,
        allowSender: gatheringBlindStartRateLimiter,
        applyStart: (args) => {
          // Nothing awaits a socket handler, so a rejected start must be caught here.
          Promise.resolve(applyGatheringBlindStart(args))
            .catch(error => console.warn('Fabricate | Blind gathering start failed', error));
        }
      });
    } catch (_error) {
      // Defensive: never block the Interactable payload below.
    }
    // The same channel carries a relayed COMPLICATION delivery (issue 1286): the GM-only card and
    // macro run from that GM's OWN record. Addressing only — the wire names no macro or content.
    try {
      routeComplicationDeliveryMessage(payload, {
        isActiveGM: () => game.user?.id === game.users?.activeGM?.id,
        senderId,
        // Applied LAST of the refusal gates, so a malformed or unauthenticated message never
        // consumes a sender's budget. Charged per MESSAGE: one resolution emits exactly one.
        allowSender: complicationDeliveryRateLimiter,
        // An elected GM holding two sockets in ONE context receives the message twice; two tabs are
        // two contexts and remain a stated, accepted residual.
        isFreshDelivery: complicationDeliveryDedupe,
        applyComplications: (args) => {
          // Nothing awaits a socket handler, so a rejected apply must be caught here.
          Promise.resolve(applyComplicationDelivery(args))
            .catch(error => console.warn('Fabricate | Complication delivery failed', error));
        }
      });
    } catch (_error) {
      // Defensive: never block the Interactable payload below.
    }
    // The same channel carries the Interactable node-update and region-first activation round-trip:
    // only the active GM writes and validates, and only the targeted user opens a granted session.
    handleInteractableSocketMessage(payload, {
      senderId,
      isSenderGM: (id) => game.users?.get(id)?.isGM === true,
      validateAndGrant: (request) => InteractableManager.instance.validateAndGrant(request),
      openGrant: (grant) => InteractableManager.instance.openGrant(grant),
      notifyDenied: (reason) => InteractableManager.instance.notifyActivationDenied(reason)
    });
  });

  addModuleButtonsToItemsDirectory();
  Hooks.on('fabricate.craftingSystemsChanged', () => addModuleButtonsToItemsDirectory());
  Hooks.on('renderItemDirectory', (app) => addModuleButtonsToItemsDirectory(app));
  Hooks.on('updateItem', (item, changes) => {
    void fabricate.craftingSystemManager?.refreshComponentMetadataForUpdatedItem(item, changes);
  });

  // Env-node-driven marker swap: a depleting or recharging task node flips every linked Tile marker
  // to or from `depletedBehavior.swapImage`, and both the gather decrement and the world-time
  // respawn write `fabricate.gatheringEnvironments`, so reacting to that setting covers BOTH. THE
  // HANDLER TAKES THE `Setting` DOCUMENT ONLY, the two hooks differing in their second argument;
  // collaborators are resolved PER CALL and shared so the two listeners cannot drift.
  const fabricateSettingChangeTargets = () => ({
    craftingSystemManager: fabricate.craftingSystemManager,
    recipeManager: fabricate.recipeManager,
    gatheringEnvironmentStore: fabricate.gatheringEnvironmentStore,
    currencyConfigStore: fabricate.currencyConfigStore,
    travelStore: fabricate.gatheringRealmStore,
    characterLibrariesStore: fabricate.characterLibrariesStore,
    // Issue 1359. Without these three the bridge legs receive `undefined` and NO-OP silently — the
    // key still counts as handled — so the client's corpus stays at its boot value all session.
    componentScopeStore: fabricate.componentScopeStore,
    essenceScopeStore: fabricate.essenceScopeStore,
    toolScopeStore: fabricate.toolScopeStore,
    // Issue 1392. Same silent failure as the three above.
    worldVocabularyStore: fabricate.worldVocabularyStore,
    callAll: (hook, payload) => Hooks.callAll(hook, payload)
  });
  const handleFabricateSettingDocumentChange = (setting) => {
    try {
      const key = setting?.key ?? `${setting?.namespace ?? ''}.${setting?.id ?? ''}`;
      if (key === `${FABRICATE_SETTINGS_NAMESPACE}.${SETTING_KEYS.GATHERING_ENVIRONMENTS}`) {
        void runInteractableMarkerSync();
      }
      if (key === `${FABRICATE_SETTINGS_NAMESPACE}.${SETTING_KEYS.ITEM_STACK_QUANTITY_PATH}`) {
        // Re-configure, THEN probe: the setting is runtime-mutable, and a startup-only probe would
        // separate the advisory from the typo by an arbitrary amount of destroyed inventory.
        applyItemStackQuantityPathSetting({ notify: true });
      }
      // Dismissals are `scope: 'user'`, so `updateSetting` delivers EVERY user's document to every
      // client. `Setting#user` is an id (`idOnly: true` on V14.365); the `.id` read stays honest.
      if (
        key === `${FABRICATE_SETTINGS_NAMESPACE}.${SETTING_KEYS.JOURNAL_RUN_DISMISSALS}`
        && (setting?.user?.id ?? setting?.user) === game.user?.id
      ) {
        Hooks.callAll('fabricate.journalDismissalsChanged');
      }
      // Cross-client refresh: `craftingSystemsChanged` / `recipesChanged` fire only on the GM's
      // client, while the setting hooks fire everywhere the replicated world setting lands, so
      // reload the stale in-memory manager here and re-emit the local hook.
      handleFabricateSettingChange(key, fabricateSettingChangeTargets());
    } catch (error) {
      console.error('Fabricate | Failed to handle a Fabricate setting change', error);
    }
  };
  Hooks.on('updateSetting', handleFabricateSettingDocumentChange);
  // THE FIRST EVER WRITE TO A WORLD SETTING IS A CREATE, NOT AN UPDATE (issue 1024), so without this
  // a first-time value propagates to nobody until reload. BOTH LEGS SHARE ONE LISTENER.
  Hooks.on('createSetting', handleFabricateSettingDocumentChange);
  const refreshJournalRunAuthorityAvailability = () => {
    void fabricate.journalRunCommands?.refreshJournalRunAuthorityAvailability?.();
  };
  const bootstrapJournalRunAuthority = () => {
    void fabricate.journalRunCommands?.bootstrapJournalRunAuthority?.();
  };
  Hooks.on('createJournalEntry', refreshJournalRunAuthorityAvailability);
  Hooks.on('updateJournalEntry', refreshJournalRunAuthorityAvailability);
  Hooks.on('deleteJournalEntry', refreshJournalRunAuthorityAvailability);
  Hooks.on('createJournalEntryPage', refreshJournalRunAuthorityAvailability);
  Hooks.on('deleteJournalEntryPage', refreshJournalRunAuthorityAvailability);
  Hooks.on('updateUser', bootstrapJournalRunAuthority);
  Hooks.on('userConnected', bootstrapJournalRunAuthority);
  Hooks.on('canvasReady', () => {
    void runInteractableMarkerSync();
  });
  void runInteractableMarkerSync();

  Hooks.callAll('fabricate.ready');
});

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

Hooks.on('updateWorldTime', (worldTime) => {
  void processFabricateWorldTime(worldTime);
});

// Cross-client run-cache coherence (issues 733 + 739): the run managers cache an actor's runs and
// never learn of another client's write, so the stale cache is dropped when the synced document
// lands. THE KEY FILTER IS LOAD-BEARING — `updateActor` also fires on every HP tick.
Hooks.on('updateActor', (actor, changes) => {
  invalidateRunCachesForActorUpdate(actor, changes);
});

function invalidateRunCachesForActorUpdate(actor, changes) {
  if (!actor?.id) return;
  const changed = runContainersChanged(changes, foundry.utils.hasProperty);
  if (changed.length === 0) return;
  // The crafting and salvage caches key on `actor.id` and the gathering cache on the actor uuid, so
  // each manager is passed the key it stores under.
  const invalidators = {
    crafting: () => fabricate.craftingRunManager?.invalidateCache(actor.id),
    salvage: () => fabricate.salvageRunManager?.invalidateCache(actor.id),
    gathering: () => fabricate.gatheringRunManager?.invalidateCache(actor.uuid ?? actor.id),
  };
  for (const key of changed) {
    invalidators[key]?.();
  }
}

// GM-only scene-control button launching the Interactable browser. Foundry V13 passes `controls` as
// a keyed RECORD, not the pre-V13 array, and the pure seam mutates that record.
Hooks.on('getSceneControlButtons', (controls) => {
  addInteractableSceneControl(controls, {
    isGM: game.user?.isGM === true,
    onClick: () => getInteractableBrowserAppClass().show(),
    // The Manage Interactables panel (issue 335): a sibling GM-only tool listing every interactable
    // on the scene and promoting regions.
    onManageClick: () => getInteractablesManagerAppClass().show(),
    localize: (key, fallback) => {
      const out = game.i18n?.localize?.(key);
      return out && out !== key ? out : fallback;
    }
  });
});

// GM-only discoverability: a config button on a linked interactable visual's HUD, resolving the
// owning behaviour from the reverse linked-visual flags. Shared by both HUDs; it never touches an
// actor.
function installInteractableConfigHudEntry(hud, element, { localizeKey }) {
  try {
    const document = hud?.object?.document ?? hud?.document ?? null;
    if (!shouldOfferInteractableConfigEntry(document, { isGM: game.user?.isGM === true })) return;

    const target = resolveInteractableConfigTarget(document, {
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

    const out = game.i18n?.localize?.(localizeKey);
    const label = out && out !== localizeKey ? out : 'Configure Fabricate Interactable';

    const button = window.document.createElement('button');
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
}

Hooks.on('renderTileHUD', (hud, element) => {
  installInteractableConfigHudEntry(hud, element, { localizeKey: 'FABRICATE.Canvas.Interactable.Config.OpenFromTile' });
});

Hooks.on('renderTokenHUD', (hud, element) => {
  installInteractableConfigHudEntry(hud, element, { localizeKey: 'FABRICATE.Canvas.Interactable.Config.OpenFromToken' });
});

// The `fabricate.interactable` Region Behaviour creation edge (issues 334 + 342). An empty `system`
// is VALID-but-UNCONFIGURED since #342, so the create is ALLOWED and the behaviour is born inert.
// AN INHERITED MARKER LINK IS NEUTRALISED HERE, region duplication cloning `linkedVisual` verbatim.
Hooks.on('preCreateRegionBehavior', (document) => {
  try {
    // The decision seam always allows through now; it is referenced so the edge keeps one decision
    // point and a future cancellation policy has a home.
    evaluateInteractableCreate(document);
    if (!isInteractableRegionBehavior(document)) {
      return undefined;
    }

    if (applyUnconfiguredSentinelStamp(document)) {
      notifyUnconfiguredInteractableCreated();
    }
    neutralizeInheritedInteractableLink(document);
    return undefined;
  } catch (_error) {
    // Defensive: a guard error must never block an unrelated behaviour creation.
    return undefined;
  }
});

/**
 * Stamp the unconfigured sentinel onto any identity field the empty-system instantiation left empty;
 * `updateSource` is the V13 preCreate seam, a preCreate hook mutating the source in place.
 */
function applyUnconfiguredSentinelStamp(document) {
  const system = readInteractableBehaviorSystem(document) ?? document?.system ?? {};
  const sentinel = buildUnconfiguredSentinelPatch(system);
  if (!sentinel.changed || typeof document?.updateSource !== 'function') {
    return false;
  }
  document.updateSource(sentinel.patch);
  return true;
}

/** INFO, not an error: creation succeeded and the interactable only needs configuring. */
function notifyUnconfiguredInteractableCreated() {
  const out = game.i18n?.localize?.('FABRICATE.Canvas.Interactable.Create.Unconfigured');
  const message =
    out && out !== 'FABRICATE.Canvas.Interactable.Create.Unconfigured'
      ? out
      : 'Created an unconfigured Fabricate interactable. Configure its source (type, system, tool/task) from the Interactable config panel; it stays inert until then.';
  ui.notifications?.info?.(message);
}

/** A fresh interactable NEVER inherits another's marker link; type-agnostic, so the caller gates it. */
function neutralizeInheritedInteractableLink(document) {
  const neutralised = neutralizeInheritedLinkedVisual(document?.system);
  if (neutralised.changed && typeof document?.updateSource === 'function') {
    document.updateSource({
      'system.linkedVisual.uuid': neutralised.patch.linkedVisual.uuid,
      'system.linkedVisual.documentName': neutralised.patch.linkedVisual.documentName
    });
  }
}


/**
 * Add the system-agnostic Craft button to the Items Directory header, injecting when an element
 * exists — `ready` can precede the sidebar's first render, so `renderItemDirectory` retries per
 * rendered sidebar or popout instance.
 */
function addModuleButtonsToItemsDirectory(itemsDir = ui.items) {
  if (!itemsDir?.element) {
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
        () => {
          // SWALLOWING (issue 1565): nothing awaits a click handler, so the wrapper reports the
          // failure rather than leaving an unhandled rejection as the user's only signal.
          void openDeferredApp(showCraftingSystemManagerApp, reportManagerLoadFailure);
        }
      );
      actionsContainer.insertBefore(managerButton, actionsContainer.firstChild);
    }
  }
}

function hasGatheringEnabledSystems() {
  const systems = game.fabricate?.getCraftingSystemManager?.()?.getSystems?.() ?? [];
  return Array.from(systems).some(system => system?.features?.gathering === true);
}

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

Hooks.on('chatMessage', (chatLog, message, chatData) => {
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

    const recipes = fabricate.recipeManager.getRecipes({ search: recipeName });
    if (recipes.length === 0) {
      ui.notifications.error(`Recipe "${recipeName}" not found`);
      return false;
    }

    const recipe = recipes[0];

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
