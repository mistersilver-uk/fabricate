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
} from './migration/remapWorldScopeIdentityFlags.js';
import { hasPendingWorldScopeRekey } from './systems/worldScopeRekeyPending.js';
// THE SHARED READ SEAM (issue 1370). Seven call sites in this file enter through it, and this file
// is outside the CI lint glob — so an omitted import here is a ReferenceError that no lint, no test
// and no build reports. `tests/main-undefined-identifiers.test.js` is the guard.
import { resolvedComponentsFor, resolvedToolsFor } from './systems/scopedEntityReads.js';
import { readPersistedCraftingSystems } from './systems/SettingsCraftingDefinitionRepository.js';
import { reportWorldIdentityDrift } from './systems/worldIdentityDrift.js';
import { restampOwnedItemComponentIdentity } from './migration/restampOwnedItemComponentIdentity.js';
import { buildWorldEssenceMergeNotice, buildWorldScopeEntityNotice, buildWorldScopeIdentityRemapNotice, describeWorldIdentityDrift } from './migration/worldScopeEntityNotice.js';
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
 * `rollActorCheck`'s OWN refusal strings for the shared authorization preamble, hoisted to module
 * scope so the delegator reads on one line rather than restating a four-line object literal — the
 * same duplicated run between this file and its harness mirror the shipped two members carry.
 * There is deliberately NO second pair for `resolveBulkCheckDecision`: that member takes no
 * `actorId` and never reaches the preamble, so a pair for it would be dead.
 */
const ROLL_ACTOR_CHECK_GATE_KEYS = Object.freeze({
  gmOnlyKey: CHECK_ROLL_MESSAGE_KEYS[COMPANION_OUTCOMES.gmOnly],
  noActorKey: CHECK_ROLL_MESSAGE_KEYS[COMPANION_OUTCOMES.noActor]
});

/**
 * `awardComponents`' and `creditCurrency`'s OWN refusal strings, hoisted for the same reason (issue
 * 1301). TWO PAIRS AND NOT ONE: the point of parameterising the preamble is that a refused award
 * reports itself in the award's words and a refused credit in the credit's.
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
 * The two pooled members carry NO hoisted refusal-string trio, and that absence is deliberate (issue
 * 1342). Every member above hands its preamble its own keys because the SINGULAR preamble's
 * `message` is read verbatim; the SET-valued preamble's is not. Both pooled delegators branch on
 * `gate.outcome` alone and answer through their own result builder, so a key threaded through the
 * gate could only restate the string the builder is about to derive.
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
    // A refusal that has LIFTED invalidates every surface that captured it. The Journal reads
    // availability when it builds its listing, so a `claim-held` captured while a command ran
    // would otherwise keep refusing every run until something unrelated rebuilt the view
    // (issue 1648, M25). Broadcast the lift, never the refusal: a refusal is true while it
    // holds, and announcing it would only repaint the Journal mid-command.
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

// The GM notice for each way a startup migration pass can DEFER (issue 1242): a corpus
// could not be read, or could not be written. One complete localized sentence per reason,
// selected by a positive lookup, because the two differ in what the GM must do — only the
// writeback failure instructs a reload, since only that path leaves this session holding a
// transformed copy of data that was never saved.
const MIGRATION_DEFERRAL_NOTICES = Object.freeze({
  [MIGRATION_DEFERRAL_REASONS.CORPUS_READ_FAILED]: 'FABRICATE.Migration.Deferred.CorpusUnreadable',
  [MIGRATION_DEFERRAL_REASONS.WRITEBACK_FAILED]: 'FABRICATE.Migration.Deferred.WritebackFailed'
});

// The GM-only crafting system manager app is deferred to a lazy chunk so non-GM players never
// download its subtree at module init; the dynamic import runs the registration side effect once.
// THE MEMOIZATION LIVES IN `src/utils/memoizedModuleLoad.js` (issue 1565), where a unit test can
// execute it. It clears the memo when an attempt REJECTS, so the session does not retain a dead
// promise — NOT a retry capability: the host records a failed module fetch in the realm's own
// module map, so a later import() resolves to the recorded failure. Only a reload recovers.
/** Lazily load and register the GM crafting system manager app class. */
const loadCraftingSystemManagerAppClass = createMemoizedLoad(() =>
  import('./ui/SvelteCraftingSystemManagerApp.svelte.js').then(() =>
    getCraftingSystemManagerAppClass()
  )
);

/** Open the GM manager: the deferred load, then the app class's own `show()`. */
const showCraftingSystemManagerApp = () =>
  loadCraftingSystemManagerAppClass().then((AppClass) => AppClass.show());

/**
 * Report a failed deferred load of the manager subtree to the user (issue 1565). NOT GM-GATED: the
 * Items Directory button sits behind an `isGM` check but `openRecipeManager` does not, so a player
 * invoking it from a macro must not get a silent failure.
 * THE INJECTED FUNCTIONS ARE CLOSURES OVER `ui.notifications`, NOT BARE MEMBER VALUES, and that is
 * load-bearing: both members touch `Notifications`' private fields, so `notify:
 * ui.notifications.error` throws a TypeError at call time, on the failure branch of a path only a
 * stale client reaches — reproducing the exact dead-button defect this change exists to remove.
 */
const reportManagerLoadFailure = createDeferredChunkFailureReporter({
  notify: (message, options) => ui.notifications?.error?.(message, options),
  hasNotice: (notice) => ui.notifications?.has?.(notice),
  // `console.error`, pinned by `tests/release-build.test.js` matching THIS CALL in the built bundle
  // — a spy in a unit test passes at any level, so only the artefact can hold that line. NOT pinned
  // by the literal reaching the bundle: Rolldown may drop a declared-pure call only when its RETURN
  // VALUE IS UNUSED, and this concise arrow returns it. The stale-entry write below does strip.
  log: (error) => console.error(DEFERRED_CHUNK_LOAD_CONSOLE_MESSAGE, error),
  localize: (key, data) => (data ? game.i18n?.format?.(key, data) : game.i18n?.localize?.(key))
});

/**
 * Tell this client, once per session, that it is running a stale entry script (issue 1565).
 * THE DIRECT DETECTION, as opposed to reacting to a rejected import: Foundry renders the `esmodules`
 * entry with no cache-busting parameter, while the version a client REPORTS comes from
 * server-injected package data read from `module.json` on disk — which is what lets `game.modules`
 * say 1.9.4 while the running JavaScript is 1.9.3.
 * EVERY READ OF `__FABRICATE_BUILD_VERSION__` IS INSIDE THE `typeof` GUARD BELOW, and there is no
 * module-scope read anywhere. `vite.config.js` declares the define under `build` ONLY, so the
 * identifier is genuinely UNDECLARED in every non-build run — the dev server, each mounted suite's
 * harness, the screenshot lab and `node --test` alike — where a bare read is a `ReferenceError`
 * during module evaluation. ESLint cannot catch it, the identifier being declared a readonly global.
 * The comparison, and the silence unless BOTH sides are known and differ, is `buildStaleEntryNotice`'s.
 */
function reportStaleEntryScript() {
  const buildVersion =
    typeof __FABRICATE_BUILD_VERSION__ === 'string' ? __FABRICATE_BUILD_VERSION__ : '';
  const installedVersion = game.modules?.get('fabricate')?.version ?? '';
  const message = buildStaleEntryNotice({ buildVersion, installedVersion }, (key, data) =>
    data ? game.i18n?.format?.(key, data) : game.i18n?.localize?.(key)
  );
  if (!message) return;
  // `warn`, not `error`: a baked-versus-installed divergence in the smoke's install path must not
  // redden the smoke through core's own console mirror. `{ console: false }` because core mirrors
  // every notification from inside its queue drain, and that mirror cannot carry the detail INSTEAD
  // — it is deferred behind the five-notice cap and lost outright if `clear()` or an unload beats
  // it. At `console.warn` because this write is an expression STATEMENT, so the declared
  // `log`/`info`/`debug` purity would let Rolldown delete it. `release-build.test.js` asserts both.
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
 * The selection predicate for the actor-selection top bar, combining the ownership rule gathering
 * attempt authorization reuses with the player-character concept. This NARROWS the bar's list
 * without modifying attempt authorization.
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
 * Push the configured item stack-quantity path into the accessor, then optionally probe it against
 * the world's items and warn the GM when it looks wrong (issue 1024).
 * ORDER IS LOAD-BEARING: the re-configure happens BEFORE the probe, or a GM editing the path
 * mid-session gets counts for the NEW path while every engine read and write continues on the OLD
 * one until reload — an advisory asserting a state that is not live.
 * The re-configure is UNGATED, the engine path having to be live on every client, while the
 * notification is GM-only: a permanent toast is actionable for the GM who just saved it and pure
 * noise for a player who cannot change it.
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

  // `game.items` ONLY: a bounded, synchronous, read-only scan that resolves nothing and rewrites
  // nothing. THAT SCOPE IS A REAL LIMIT — a world whose items all live in compendia and on actor
  // sheets yields verdict `'no-items'` and no warning at all, while every consume on those items
  // destroys stacks, so `'no-items'` is SILENCE and never a clean bill of health. Widening the scan
  // would make startup walk the whole world. The suggested correction is the ACTIVE SYSTEM's preset,
  // not the built-in default, which on tormenta20 would name the wrong field.
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
 * The GM-facing advisory for a stack-quantity probe result, or `null` when healthy. THE DECISION
 * belongs to `stackQuantityAdvisory` in the accessor module, where it is pure and testable against a
 * report; this wrapper is the i18n edge, because that module never touches `game`.
 * The chosen string names the CONSEQUENCE in plain language: a GM reading "0 of 412" has no reason
 * to connect it to inventory destruction.
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
 * The ACTIVE-GM edge for a relayed BLIND gathering start (issue 901).
 * THE GM RE-RUNS THE WHOLE ATTEMPT WITH THE REQUESTING USER AS THE VIEWER rather than itself, so
 * every gate the player would have faced is re-evaluated GM-side against the player who asked and
 * `_isOpaqueBlindTask` stays TRUE — running it as the GM's own viewer would write the real task id
 * onto the flag. The `senderId` is Foundry's server-attested socket sender, never a payload field.
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

/**
 * The components the ADDRESSED crafting system holds on THIS client — the corpus the GM-side re-read
 * resolves against (issue 1286). Split out so `applyComplicationDelivery` reads as
 * authorize-then-apply, the addressing-only contract itself being enforced by the pure
 * `findAuthoredComplication`.
 */
function complicationComponentsFor(craftingSystemId) {
  return fabricate.craftingSystemManager?.getComponentsForSystem?.(craftingSystemId) ?? [];
}

/**
 * The token and speaker the GM side resolves for an addressed actor, NEVER read from the payload —
 * a payload carries no speaker, so a forged one cannot make the GM's card speak as anything.
 * Guarded because a `getSpeaker` that threw would reject out of the writer's fire-and-forget apply.
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
 * Run one complication's authored macro on this elected-GM client and REPORT what happened. Never
 * throws: one bad complication must not cost a resolution its others.
 * THE `type === 'script'` GATE IS A CALL-SITE CHECK AND THIS IS THE CALL SITE, here rather than on
 * the acting client because compendium ownership is GM-configurable per role, so a player's
 * `fromUuid` can miss a macro the GM resolves fine. The uuid is resolved here AND again inside
 * `MacroExecutor.run`, because only settling "is this a script macro at all" before the try can tell
 * a broken link from a macro that blew up.
 * THE RETURN IS A REPORT, not the macro's own return value: nothing in Fabricate may read a macro's
 * return, and the miss has to be reportable on the GM-facing output, which a `console.warn` is not.
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
 * Everything the elected GM DOES for one re-read complication: roll a `gmOnly` effect roll, then run
 * the macro. Both are effects of the same authored complication and independent, so each carries its
 * own guard. The effect roll goes first only because the card reports it; the macro is unordered.
 */
async function runComplicationDelivery({ craftingSystemId, component, complication, entry, actor, token, speaker, senderUser, resolutionId }) {
  const effect = await rollGmComplicationEffect({ complication, actor, speaker });
  const macro = await runComplicationMacro({
    craftingSystemId, component, complication, entry, actor, token, speaker, senderUser, resolutionId
  });
  return { effect, macro };
}

/**
 * Whether the ADDRESSED crafting system narrates to chat at all (issue 1286). `features.chatOutput`
 * is a per-system GM toggle every other Fabricate chat poster consults, and the GM complication card
 * is unambiguously chat.
 * NEITHER THE MACRO NOR THE EFFECT ROLL IS GATED BY THIS, and the rule is card-vs-dice-message
 * rather than chat-vs-not-chat: the toggle has only ever gated the cards Fabricate composes about
 * its own resolutions and has never gated a die. `evaluateCheckRoll` posts on `options.interactive`
 * alone, so a `chatOutput: false` system already puts check rolls in chat with no card. The
 * argument is NOT that roll and posting are one call — `evaluateSideRoll` takes a `post` option.
 * THE TOGGLE IS NARROWER THAN "the card is chat": it suppresses result NARRATION, never the news
 * that a configuration is broken, so this predicate does not veto the card — it chooses which ROWS
 * the card is built from. Read from THIS client's own copy, and defaulted CLOSED for a system that
 * does not resolve.
 */
function complicationChatOutputEnabled(craftingSystemId) {
  return fabricate.craftingSystemManager?.getSystem?.(craftingSystemId)?.features?.chatOutput === true;
}

/**
 * Whether one delivered row's macro reports a CONFIGURATION FAULT rather than an outcome.
 * `skipped` is a `macroUuid` that did not resolve to a script macro; `failed` is a script macro
 * whose body threw. Both are the GM's OWN authorship to repair and both are invisible everywhere
 * else. `none` and `ran` are outcomes rather than faults and report nothing on their own.
 */
function hasComplicationMacroFault(row) {
  const status = row?.report?.macro?.status;
  return status === 'skipped' || status === 'failed';
}

/**
 * The GM-only chat card for one delivered resolution — the OUTPUT half of a `gmOnly` complication
 * (issue 1286). `gmOnly` is the AUTHORED DEFAULT, so without it such a complication with no macro
 * fires, pays the whole socket cost and produces nothing observable.
 * EVERY DELIVERED COMPLICATION GETS A ROW, not only the `gmOnly` ones: a delivery only reaches this
 * client for one that is `gmOnly` OR carries a macro, so the rows are exactly those that asked this
 * GM to run something, and their outcome has to be reported against a complication the card names.
 * `features.chatOutput` SELECTS THE ROWS AND DOES NOT VETO THE CARD. It suppresses per-resolution
 * NARRATION, not the news that a macro link is broken, and `recipes-and-steps/spec.md` § "The
 * `script` gate is a call-site check" requires an unresolvable uuid to be reported on the GM-facing
 * output — which this card is the only instance of. So the gate chooses the SET: every delivered
 * row when the system narrates, the faulted rows ALONE when it does not. A surviving row is NOT
 * re-projected for that case, and the residual is stated rather than hidden.
 * FOUR STEPS, IN AN ORDER THAT IS LOAD-BEARING: the `chatOutput` gate first and over the ROW SET,
 * taken from `applied` itself so a gated-off system with nothing faulted returns before any
 * projection; SPEAKER before the visibility pass, which `applyBulkChatVisibility` states as a
 * caller contract; VISIBILITY before `create`, through an EXPLICIT `gmroll` and never the
 * client-scoped `core.rollMode`; and `create` INSIDE the same guard, so a token the running Foundry
 * cannot map throws BEFORE the message exists — a GM-only card that could not be made GM-only must
 * not be posted at all.
 * The row MODEL is `gmComplicationCardEntries`, so a suite can drive it with rows that disagree.
 */
async function postGmComplicationCard({ craftingSystemId, actor, speaker, senderUser, applied = [] }) {
  try {
    // The toggle SELECTS rows; it does not veto the card. A configuration error is reported
    // whatever it says, narration is not. The filter runs over `applied` rather than the projected
    // entries, so the suppressed case — gate off, nothing faulted — returns before any projection
    // or localization, which is what made an early gate worth having.
    const delivered = Array.isArray(applied) ? applied : [];
    const reported = complicationChatOutputEnabled(craftingSystemId)
      ? delivered
      : delivered.filter((row) => hasComplicationMacroFault(row));
    if (reported.length === 0) return null;
    // `gmComplicationCardEntries` — the GM-facing projection, deliberately the only one that may
    // carry an authored description or a severity to a GM surface — augmented with what THIS client
    // did, which is the half no projection of the acting client's report could hold.
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
 * The ELECTED-GM edge for a relayed complication delivery (issue 1286). It runs strictly downstream
 * of an award the acting client has already committed, so it never influences one and never reports
 * back. What it adds is AUTHORITY — the macro runs on a GM client and both it and the GM-only card
 * come from the complication the GM's OWN world setting holds.
 * THE `senderId` IS FOUNDRY'S SERVER-ATTESTED SOCKET SENDER, never a payload field, and the actor is
 * re-authorized against THAT user rather than this client's ambient permissions. Each complication
 * is isolated: one that resolves to nothing is dropped and the rest still run.
 * The Foundry EDGE only; the re-read, the `script` discriminant and the isolation are pure and live
 * in `complicationSocket.js`, a source-text pin here being unable to see a positional fallback.
 */
async function applyComplicationDelivery({ senderId, craftingSystemId, actorUuid, resolutionId, complications = [] } = {}) {
  const senderUser = game.users?.get?.(senderId) ?? null;
  if (!senderUser) return null;
  const actor = resolveComplicationActor(actorUuid);
  // Failing CLOSED is right — nothing may run against an actor whose permissions cannot be asked —
  // but the drop has to be VISIBLE. `fromUuidSync` resolves a compendium uuid to a plain index entry
  // carrying no `testUserPermission`, so a well-formed delivery addressed at one is refused with no
  // roll, no macro, no card and otherwise no trace for the one client that could diagnose it.
  if (!actor || typeof actor.testUserPermission !== 'function') {
    console.warn('Fabricate | Refused a complication delivery: the addressed actor could not be resolved to a permission-testable document', {
      senderId, actorUuid
    });
    return null;
  }
  // Ask the ATTESTED SENDER's own permission, directly. Any predicate whose first disjunct reads
  // `actor.isOwner` resolves it against the AMBIENT `game.user`, which on the elected GM's client
  // owns every actor in the world, so it would pass for a sender who owns nothing. THE RULE (issue
  // 1288) IS THAT NO OWNERSHIP PREDICATE ON A GM-SIDE APPLY PATH MAY READ `isOwner`.
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
 * Dispatch startup and `updateWorldTime` processing for crafting, salvage and gathering. Timed
 * gathering completion is delegated to the module-internal GatheringEngine, which is intentionally
 * not exposed through `game.fabricate`.
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

/**
 * Emit a one-time console deprecation notice for a renamed public API method, used by the
 * `*Region*` to `*Realm*` delegates so existing macros keep working. Never throws.
 */
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
    // builders. Deliberately NOT exported onto `game.fabricate`: `salvageComponents` and
    // `destroyComponents` are the only supported entry points, because that is where the
    // per-target ownership gate is.
    this._bulkSalvageService = null;
    this._bulkDestroyService = null;
    this.itemPilesIntegration = null;
    this.actorInventoryCoinSpender = null;
    this.actorPropertyCoinSpender = null;
    this.compendiumImporter = null;
    this.ready = false;
    // Replay-safe readiness signal, resolving once `initialize()` completes. Unlike the one-shot
    // `fabricate.ready` Hook, awaiting this settled promise works even when readiness was reached
    // before the caller subscribed, so a late manager launch can never latch on a spent event.
    this._readyPromise = new Promise((resolve) => {
      this._resolveReady = resolve;
    });
  }

  /**
   * Replay-safe readiness: resolves when the module has finished initializing, immediately if
   * startup already completed.
   */
  whenReady() {
    return this._readyPromise;
  }

  /** Initialize the module. */
  async initialize() {
    console.log('Fabricate | Initializing...');

    // Explicit performance boundaries around startup (issue 1073), so "ready time attributable to
    // Fabricate" is measured rather than guessed from a stopwatch that also times Foundry.
    // `createStartupMarks` is total — an absent `performance` degrades to a no-op.
    this._startupMarks = createStartupMarks();
    this._startupMarks.begin(STARTUP_PHASES.INITIALIZE);

    this.registerSettings();
    applyCurrentFabricateTheme(getSetting, SETTING_KEYS.THEME);
    // Push the configured item stack-quantity path into the accessor BEFORE anything reads or
    // writes a stack. It must precede `_runMigrations()`, since a migration may touch owned items,
    // and follow `registerSettings()`, the key not being readable until registered. There is no
    // MIGRATIONS entry: the key is new, so no prior stored value exists to migrate.
    applyItemStackQuantityPathSetting();
    // Run data migrations before managers load persisted data.
    this._startupMarks.begin(STARTUP_PHASES.MIGRATIONS);
    await this._runMigrations();
    this._startupMarks.end(STARTUP_PHASES.MIGRATIONS);
    // Both seams are lazy closures because `craftingSystemManager` is constructed on the next
    // statement, needing `recipeManager` in ITS constructor. `getCraftingSystemManager` (issue 1072)
    // is what the twelve paths inside RecipeManager that used to read `game.fabricate` go through.
    // The world currency configuration (issue 1278) is constructed FIRST because both the recipe
    // manager and the crafting engine take it as a collaborator: currency is world scope.
    this.currencyConfigStore = new CurrencyConfigStore({
      getSetting,
      setSetting,
      randomID: () => foundry.utils.randomID()
    });
    this.currencyConfigStore.load();
    // Issue 1308: the world character libraries, constructed and loaded HERE, before both managers,
    // because `CraftingSystemManager` derives its Valid Id Basis from this store on every normalize.
    // NOT where the travel store sits, and copying that placement would be wrong: realms are read on
    // demand, whereas these libraries are read during normalization itself.
    this.characterLibrariesStore = new CharacterLibrariesStore({
      getSetting,
      setSetting,
      randomID: () => foundry.utils.randomID()
    });
    this.characterLibrariesStore.load();
    // Issue 1359: the three WORLD-SCOPE entity stores. Constructed and loaded HERE — AFTER
    // `registerSettings()`, AFTER `await this._runMigrations()`, and BEFORE both managers — and THE
    // ORDER IS SILENT WHEN WRONG: reading an unregistered key throws inside `assertSetting` and
    // `load()` is guarded, so a mis-ordering degrades to a permanently UNSEEDED store and a `null`
    // Valid Id Basis, against which the manager prunes every world reference. A source-order
    // assertion in `tests/scoped-definition-read-and-basis.test.js` pins it.
    this.componentScopeStore = createComponentScopeStore({ getSetting, setSetting });
    this.componentScopeStore.load();
    this.essenceScopeStore = createEssenceScopeStore({ getSetting, setSetting });
    this.essenceScopeStore.load();
    this.toolScopeStore = createToolScopeStore({ getSetting, setSetting });
    this.toolScopeStore.load();
    // Issue 1392: the WORLD VOCABULARY store, beside the three above for consistency and for the
    // shipped source-order assertion. Its own HARD constraint is only "after `registerSettings()`";
    // the prune-basis rationale belongs to the entity stores, this one being wired into no basis,
    // so a mis-order degrades to an unseeded store and a rail badge reading 0.
    this.worldVocabularyStore = createWorldVocabularyStore({ getSetting, setSetting });
    this.worldVocabularyStore.load();
    // 1.30.0 (issue 1370): THE WORLD IDENTITY DRIFT AUDIT, run once per session.
    // HERE, AND NOT IN THE MIGRATION'S NOTICE SLOT, because DRIFT IS NOT A MIGRATION EVENT: it
    // appears on the GM's FIRST identity edit after the migration and every session after, so it
    // belongs after the loads and before either manager — the last point at which nothing has read
    // the union. ACTIVE GM, NOT `isGM`, which would post once per assistant too. INFO, NEVER WARN:
    // nothing is wrong, and a permanent warning would redden every View Lab capture.
    // The COMPOSITION is not here, a grep being able to pin a DISPATCH but never a SUM.
    if (game.users?.activeGM?.id === game.user?.id) {
      const worldIdentityDrift = reportWorldIdentityDrift(readPersistedCraftingSystems(), {
        components: this.componentScopeStore.corpus(),
        essences: this.essenceScopeStore.corpus(),
        tools: this.toolScopeStore.corpus()
      });
      // THE FULL LEDGER GOES TO THE CONSOLE, AND FABRICATE HAS TO PUT IT THERE ITSELF.
      // `ui.notifications.info` defaults `console: true`, but what core logs is the CAPPED message
      // it was handed, so without this line the withheld records are unrecoverable from a running
      // client. `info`, NOT `debug`, which maps to a DevTools level Chromium filters out by default;
      // written through `logMigrationNoticeDetail` because a bare `console.info` is stripped (1737).
      const driftDetail = describeWorldIdentityDrift(worldIdentityDrift);
      logMigrationNoticeDetail('world identity drift', driftDetail);
      // CONSOLE ONLY (maintainer, 2026-09-06): the toast this used to raise repeated the whole
      // drifted list in the notification bar and read as an alarm for a state its own copy calls
      // harmless. The `info` line above is the whole report.
    }
    this.recipeManager = new RecipeManager({
      getCraftingSystem: (systemId) => this.craftingSystemManager?.getSystem?.(systemId) ?? null,
      getCraftingSystemManager: () => this.craftingSystemManager ?? null,
      currencyConfigStore: this.currencyConfigStore,
    });
    // Issue 800: the manager RESOLVES source descriptions through Foundry's own enricher at its
    // async ingestion boundaries. Both seams default to pass-throughs, `enrichHTML` being unable to
    // run under happy-dom, so wiring the real implementations here is what makes production resolve.
    this.craftingSystemManager = new CraftingSystemManager(this.recipeManager, {
      enrichToHtml: (raw, options) => enrichToHtml(raw, options),
      primeEnricherCache: (rawTexts) => primeEnricherCache(rawTexts)
    });
    // Wire the real primary-GM check into the timed world-time resume paths (issue 656). Both
    // managers and the gathering engine default this to `() => true`, fail-open so unit fixtures
    // resume, so passing the real `activeGM` check here is LOAD-BEARING: it gates the synced-hook
    // `setFlag` writes, item creation and node depletion to exactly one client.
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
      // A per-pass INVENTORY SNAPSHOT collaborator, not a visibility one (issue 1228). Every
      // production snapshot is built with the same identity pair, so the one this service hands
      // down is interchangeable with the crafting listing's rather than a half of one.
      findMatchingComponent
    );
    this.resolutionModeService = new ResolutionModeService(this.craftingSystemManager, {
      getPlayerResultOrder: entry => this._readPlayerResultOrder(entry)
    });
    this.itemPilesIntegration = new ItemPilesIntegration();
    this.itemPilesIntegration.detect();
    // The generic actor-inventory spender resolves a per-system coin adapter by `game.system.id`;
    // pf2e is the sole registered adapter, through an internal map rather than a plugin registry.
    // The actor-property spender is generic and needs no system-specific wiring.
    this.actorInventoryCoinSpender = new ActorInventoryCoinSpender({
      adapters: new Map([['pf2e', new Pf2eInventoryCoinAdapter()]]),
    });
    this.actorPropertyCoinSpender = new ActorPropertyCoinSpender();
    // Wire the gathering persistence seams the GM UI path already passes, so the public API surface
    // persists the gathering authoring bundle instead of silently dropping it (issue 699). The
    // environment store is constructed AFTER this importer, so it resolves lazily through a thin
    // delegating object — the `exportSystem` idiom — rather than capturing a still-undefined field.
    this.compendiumImporter = new CompendiumImporter(this.craftingSystemManager, this.recipeManager, {
      environmentStore: {
        list: () => this.gatheringEnvironmentStore?.list?.() ?? [],
        load: () => this.gatheringEnvironmentStore?.load?.() ?? [],
        save: (environments) => this.gatheringEnvironmentStore?.save?.(environments)
      },
      getSetting: (key) => getSetting(key),
      setSetting: (key, value) => setSetting(key, value),
      isGM: () => game.user?.isGM === true,
      // The three world-scope entity stores (issue 1364) resolve lazily through thin delegating
      // objects: the merge fails CLOSED on an absent store, so a seam capturing a still-undefined
      // field would make every world-scope import merge NOTHING and still report success. A
      // delegator closes over the FIELD, so a rename cannot slip past it.
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
    // The WORLD travel configuration (issue 1282): the realm library, the reveal mode and the
    // modifier visibility. Constructed FIRST because the environment store validates realm
    // references against it, and the resolver and engine both read realms through it.
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
    // Fabricate-managed parties and the current-realm resolver for location-aware gathering. Both
    // are world scope; the resolver is constructor-injected into the engine and never imported, so
    // the engine stays testable without Foundry.
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
      // Live token-derived sensing: which Scene Region UUIDs the party's travel marker sits inside.
      // PREFER Foundry's AUTHORITATIVE membership (`TokenDocument#regions`), which is not subject to
      // the move-animation lag that makes position hit-testing report the region just left; fall
      // back to hit-testing only when membership is unavailable.
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
    // Environment resource-node pools live in the `gatheringEnvironments` WORLD setting, and only a
    // GM may update a world Setting — so a player gathering from a node-backed task cannot write
    // their own decrement, and without this relay the write rejects and the pool never depletes. On
    // a GM client the writer applies locally, a socket emit never reaching the emitter.
    this.gatheringNodeDepletionWriter = createGatheringNodeDepletionWriter({
      isActiveGM: () => game.user?.id === game.users?.activeGM?.id,
      // `Users#activeGM` is null when no GM is connected, so nobody would apply the relayed write.
      // Report it rather than emitting into the void: the gather still succeeds, having never gated
      // on this write, and only the pool fails to deplete.
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
      // Calendar-aware regen and respawn intervals: day and week lengths track the active world
      // calendar, falling back to the Earth table. Resolved per call so a mid-session reconfig
      // is picked up.
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
    // Issue 901. A blind run's secret state — the drawn task, its start-time
    // snapshot, and its provisional node reservation — lives in the
    // `gatheringBlindRuns` WORLD setting, which only a GM may update. That is the
    // integrity boundary: a player can still READ world state (Foundry has no
    // server-side read authorization) but can no longer FORGE the task their run
    // will yield, which they could when it sat on an Actor flag they own.
    this.gatheringBlindRunStore = new GatheringBlindRunStore({
      getSetting,
      setSetting,
      settingKey: SETTING_KEYS.GATHERING_BLIND_RUNS,
      // Load-bearing: the active GM is the SINGLE writer. `game.settings.set` replaces rather than
      // merges and there is no compare-and-set anywhere, so a second concurrent writer would
      // clobber another run's record.
      isActiveGM: () => game.user?.id === game.users?.activeGM?.id,
      // Liveness: a record only counts while its run is still active. That is what keeps a
      // reservation PROVISIONAL under every path that never reaches the maturity release — a GM
      // deleting the environment, the task or the actor.
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
    // Only a GM may write that setting and, more importantly, the blind DRAW must happen somewhere
    // the acting player cannot rig it. A player's blind timed start is routed to the active GM over
    // the same channel the node-depletion relay uses (issue 983), and the GM re-runs the whole
    // attempt with the requesting user as the viewer.
    this.gatheringBlindStartWriter = createGatheringBlindStartWriter({
      isActiveGM: () => game.user?.id === game.users?.activeGM?.id,
      hasActiveGM: () => !!game.users?.activeGM,
      onUnroutable: ({ environmentId }) => console.warn(
        'Fabricate | Blind gathering start was not applied: no active GM is connected to write the world setting',
        { environmentId }
      ),
      emitStart: (message) => game.socket?.emit(EVENT_SCENE_SOCKET, message),
      // The local-apply branch has no socket sender to attest, so supply the current user. Reached
      // only if a GM ever routes its own start; the engine short-circuits before that, because a
      // client that may write the setting never relays.
      applyStart: (payload) => applyGatheringBlindStart({ senderId: game.user?.id, ...payload })
    });
    gatheringEngine.installBlindRunRelay({
      store: this.gatheringBlindRunStore,
      relayStart: (args) => this.gatheringBlindStartWriter.start(args)
    });
    // A complication's GM-only card and its macro must happen on a GM client: a player cannot author
    // a message as the GM, and a macro on the acting client would carry the acting client's
    // authority. Relayed ADDRESSING ONLY — the elected GM re-reads the authored complication from
    // its own record (issue 1286) — and applies locally on that GM, a broadcast excluding the emitter.
    this.complicationDeliveryWriter = createComplicationDeliveryWriter({
      isActiveGM: () => game.user?.id === game.users?.activeGM?.id,
      hasActiveGM: () => !!game.users?.activeGM,
      // Unlike the blind-start relay this DROPS rather than blocks: a complication is strictly
      // downstream of a committed award, so refusing it would strand a completed craft. The award,
      // the player-facing card and the run record stay unaffected; only the GM-only card and the
      // macro are lost, and there is no store to defer them into.
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
    // EXPLICIT injection into both engines that fire complications. Each also falls back to
    // `game.fabricate.complicationDeliveryWriter`, but a seam only the fallback ever satisfies is
    // not a seam: it cannot be substituted in a test that builds its own engine. Optional-chained
    // so a future reorder cannot take the whole boot down over a narrative beat.
    this.craftingEngine?.installComplicationDelivery({ writer: this.complicationDeliveryWriter });
    gatheringEngine?.installComplicationDelivery({ writer: this.complicationDeliveryWriter });
    // Housekeeping that drops entries naming deleted content. Each pass is INDEPENDENTLY GUARDED
    // (issue 970): they write to actor documents, and a refused write must never prevent `this.ready`
    // below, since every facade method throws through `_requireReady()`. Each pass is also scoped to
    // the actors this client owns, so this guard is the belt to that braces.
    // The list is composed by `composeStartupPassList` (issue 1224); the call sits BELOW both
    // `initialize()` calls so its id sets derive from the corpus this boot loaded.
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

    // Close the outer span BEFORE readiness is announced, so anything waiting on `whenReady()`
    // observes a complete `fabricate:initialize` measure. It sits ABOVE `this.ready = true`
    // deliberately: `manager-launch-readiness.test.js` pins that line and `this._resolveReady?.();`
    // as ADJACENT, and that adjacency guards readiness against drifting from the flag.
    this._startupMarks.end(STARTUP_PHASES.INITIALIZE);
    this.ready = true;
    this._resolveReady?.();
    console.log('Fabricate | Ready');
  }


  /** Run versioned startup data migrations via MigrationRunner. */
  async _runMigrations() {
    // Primary-GM only, so exactly one client runs the pass and no player or assistant races the
    // world-scoped writes. `isGM` is TRUE FOR ASSISTANT GMs, who hold SETTINGS_MODIFY, so an `isGM`
    // gate would let the full GM and every assistant transform-and-write concurrently;
    // `activeGM` fires on exactly one client, matching the primary-GM startup writers below.
    if (game.users?.activeGM?.id !== game.user?.id) return;
    const runner = new MigrationRunner({
      getSetting,
      setSetting,
      // The GM-only interactive recovery prompt, invoked by the runner on a fatal abort. "Keep
      // existing data" is the default and matches what the runner already did; the fix/retry choice
      // is INFORMATIONAL ONLY — the GM repairs and RELOADS, and migrations re-run because
      // `migrationVersion` was not advanced. There is NO same-pass auto-retry.
      promptRecovery: (context) => this._promptMigrationRecovery(context)
    });
    const summary = await runner.run();
    const localize = (key, data) => (data ? game.i18n?.format?.(key, data) : game.i18n?.localize?.(key));

    // A DEFERRED pass (issue 1242) persisted nothing and left `migrationVersion` where it found it.
    // It is NOT an abort — there is no failed document to remediate and no downgrade target to
    // recommend — so it gets its own permanent GM notice rather than the recovery dialog. Placed
    // ABOVE the abort branch because a deferred summary reports `aborted: false`.
    if (summary?.deferred === true) {
      // A COMPLETE localized sentence per reason, and only the writeback failure instructs a reload
      // — that distinction is the point. On a writeback failure the migrations have already
      // transformed this session's live values, so a GM who keeps working writes migrated records
      // back under an un-advanced version; the read failure refuses before any migration runs.
      const key = MIGRATION_DEFERRAL_NOTICES[summary.deferredReason] ?? MIGRATION_DEFERRAL_NOTICES[MIGRATION_DEFERRAL_REASONS.CORPUS_READ_FAILED];
      const notice = composeMigrationNotice(key, undefined, localize);
      console.error(`Fabricate | migration pass deferred (${summary.deferredReason}): ${notice.detail}`, summary.deferredError ?? '');
      if (game.user?.isGM) ui.notifications?.error?.(notice.message, { permanent: true });
      return;
    }

    // An ABORTED pass rolled the in-memory data back and persisted nothing, leaving
    // `migrationVersion` unchanged. Surface a GM-facing error and return WITHOUT firing any success
    // notice; the runner has already emitted per-document recovery guidance to the console.
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

    // 0.9.0 unified legacy realms on one or more systems: name them so the GM can re-enable Travel
    // & Realms, which stays disabled by default, and knows realm-scoped records may now appear in
    // more environments. GM-only, and only when something was migrated.
    const unifiedRegionSystems = Array.isArray(summary?.unifiedRegionSystems) ? summary.unifiedRegionSystems : [];
    if (unifiedRegionSystems.length > 0 && game.user?.isGM) {
      const notice = composeMigrationNotice('FABRICATE.Migration.UnifyRegions.Notice', { systems: unifiedRegionSystems.join(', ') }, localize);
      logMigrationNoticeDetail('0.9.0 unified gathering realms', notice.detail);
      ui.notifications?.info?.(notice.message);
    }

    // 1.6.0 removed the legacy routed result-selection providers, dropping roll-table references —
    // the draw mechanism is gone — and stripping gathering-task result selections. Name the
    // affected recipes and tasks so the GM can reconfigure them. GM-only, and only when something
    // was actually dropped.
    const removedProviders = summary?.removedResultSelectionProviders ?? null;
    const droppedRollTableRecipes = Array.isArray(removedProviders?.droppedRollTableRecipes)
      ? removedProviders.droppedRollTableRecipes : [];
    const strippedGatheringTasks = Array.isArray(removedProviders?.strippedGatheringTasks)
      ? removedProviders.strippedGatheringTasks : [];
    if ((droppedRollTableRecipes.length > 0 || strippedGatheringTasks.length > 0) && game.user?.isGM) {
      // Console recovery log naming the affected recipes and tasks. A routed gathering task now
      // resolves via the system gathering check, so the GM must populate
      // `gatheringCraftingCheck.routed.rollFormula` for any stripped task.
      console.warn(
        'Fabricate | 1.6.0 migration removed legacy result-selection providers. ' +
          'Populate gatheringCraftingCheck.routed.rollFormula for any stripped gathering task. Affected items:',
        { droppedRollTableRecipes, strippedGatheringTasks }
      );
    }

    // 1.17.0 disabled recipes to clear a newly-introduced alchemy signature collision, since
    // folding per-set essences into signature-bearing groups can overlap two sets. Name the
    // disabled recipes so the GM can rework and re-enable them.
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

    // 1.21.0 retired the check-modifier roll-formula placeholder, and its consequences are behaviour
    // changes rather than no-ops. PRIMARY-GM ONLY, not merely GM-only, `_runMigrations` returning
    // early unless this client is the active GM. THE COMPOSITION IS NOT HERE, for the reason the
    // sibling below states — three semantic mutations survived a green suite while it lived inline.
    const retiredCraftingModCounts = Array.isArray(summary?.retiredCraftingModCounts)
      ? summary.retiredCraftingModCounts : [];
    if (retiredCraftingModCounts.length > 0 && game.user?.isGM) {
      const notice = buildRetiredCraftingModNotice(retiredCraftingModCounts, localize);
      logMigrationNoticeDetail('1.21.0 retired check-modifier placeholder', notice.detail);
      if (notice.severity === 'warn') ui.notifications?.warn?.(notice.message, { permanent: true });
      else ui.notifications?.info?.(notice.message);
    }

    // 1.23.0: where the same modifier id was authored in BOTH libraries the gathering entry was
    // RE-KEYED. That is a visible rename in the authoring surface, so it is reported rather than
    // left to be discovered; only systems that actually collided are listed, and a clean merge is
    // silent. PRIMARY-GM ONLY, like every notice above it.
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

    // 1.28.0 (issue 1308): the character-library id collisions where two systems disagreed about
    // what an id MEANS. Identical copies are filtered upstream, so everything here changed a real
    // rule — and the change is INVISIBLE without this notice, because the reference still resolves,
    // to the other system's definition. The migration's own label promises this report by name.
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
    // the counts, the rename list and the references that already resolve to nothing (which the pass
    // REPORTS and never prunes) live in `buildWorldScopeEntityNotice`, because nothing in this file
    // is executable by a unit test and a grep can pin a DISPATCH but never a SUM. The report is
    // `null` unless the migration ran, so an omission fails SILENT — hence the PRESENCE assertion.
    const worldScopeEntityReport = summary?.worldScopeEntityReport ?? null;
    if (worldScopeEntityReport && game.user?.isGM) {
      const notice = buildWorldScopeEntityNotice(worldScopeEntityReport, localize);
      if (notice.message) {
        logMigrationNoticeDetail('1.30.0 world-scope entities', notice.detail);
        if (notice.severity === 'warn') ui.notifications?.warn?.(notice.message, { permanent: true });
        else ui.notifications?.info?.(notice.message);
      }
    }

    // 1.34.0 (issue 1654): the equivalent-essence merge notice. ALWAYS a permanent warning, because
    // every case that produces a message is one the GM must act on — the merge is irreversible and
    // a refusal is not retried. The toast names the groups under a cap; the explanation, the
    // item-override scope and every id go to the console at `info` (issue 1737).
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
   * The thin Foundry edge for the GM migration-abort recovery prompt. GM-only and defensive, never
   * throwing: a failure to open the dialog must not break startup, the console guidance and the
   * abort notification having already covered the GM.
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
   * Get the crafting engine instance. `COMPANION`'s `handle` tier (issue 1289): the promise is that
   * it answers the object Fabricate itself uses, or `null` before `initialize` has run — not a
   * promise about `CraftingEngine`'s method surface, the one exception being `findComponentItems`.
   * It is never ready-gated, so the pre-readiness `null` is the constructor's field, not a check.
   */
  getCraftingEngine() {
    return this.craftingEngine;
  }

  /**
   * Re-run the `1.30.0` world-scope identity-flag repair (issue 1363). A GM-FACING RECOVERY ACTION,
   * not a test hook, reachable exactly when the boot-time one-shot WITHHELD itself: a TORN MIGRATION
   * or a PARTIAL REMAP, both of which leave the map PENDING. Once the boot pass clears it this
   * answers `null`. A LOCKED-PACK skip is deliberately not one of those states.
   * ACTIVE-GM ONLY, a SINGLE-WRITER rule rather than a permission check: the pass walks the
   * UNFILTERED actor collection, so a player invoking it would have every write it does not own
   * rejected and mis-booked as a locked-pack skip.
   * IDEMPOTENT: it performs the remap ONLY, neither clearing the map nor advancing the version.
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
   * Re-run the `1.34.0` equivalent-essence merge's durable-flag repair (issue 1654). A GM-facing
   * recovery action for the two states its `1.30.0` sibling `remapWorldScopeIdentityFlags` serves;
   * a locked-pack skip is not one of them.
   * Active-GM only, and it WARNS rather than returning silently, because a player's writes across
   * the unfiltered actor collection would all be rejected and a silent `null` would read as success.
   * Idempotent: it remaps only, neither clearing the map nor advancing the one-shot version.
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

  /**
   * Get the gathering environment store, exposing persisted environment management without
   * exposing the module-internal GatheringEngine.
   */
  getGatheringEnvironmentStore() {
    return this.gatheringEnvironmentStore;
  }

  /** Get the Fabricate-managed gathering party store (world-level parties). */
  getGatheringPartyStore() {
    this._requireReady();
    return this.gatheringPartyStore;
  }

  /**
   * Get the world currency configuration store (issue 1278). World scope, not per crafting system:
   * a world runs one Foundry game system and so has one way actors store coins, and a crafting
   * system decides only whether it participates.
   * DELIBERATELY NOT `_requireReady()`-gated, matching the coin-spender accessors: this is the
   * global fallback `getCurrencyRequirementConfig` reads when no seam was injected, and that
   * resolver guards with optional chaining, which catches an absent accessor but NOT a throw — so
   * a readiness throw would crash the craftability path instead of yielding the empty ladder.
   */
  getCurrencyConfigStore() {
    return this.currencyConfigStore ?? null;
  }

  /**
   * Get the world character libraries store (issue 1308). World scope, not per crafting system,
   * because both libraries resolve against the acting CHARACTER; nothing stays per system.
   * DELIBERATELY NOT `_requireReady()`-gated, for the reason `getCurrencyConfigStore` is not: these
   * gate craftability, learning and tool usability, and every call site guards with optional
   * chaining, which catches an absent accessor but NOT a throw.
   */
  getCharacterLibrariesStore() {
    return this.characterLibrariesStore ?? null;
  }

  /**
   * Get the world COMPONENT scope store (issue 1359). DELIBERATELY NOT `_requireReady()`-gated,
   * matching `getCurrencyConfigStore` and emphatically NOT `getGatheringRealmStore`:
   * `CraftingSystemManager` resolves this lazily during `initialize()` and guards with optional
   * chaining, which absorbs an ABSENT accessor but not a THROW — which would surface as a crash
   * inside `_normalizeSystem`, the issue-970 shape where the manager never initializes at all.
   */
  getComponentScopeStore() {
    return this.componentScopeStore ?? null;
  }

  /** Get the world ESSENCE scope store (issue 1359). Ungated, for `getComponentScopeStore`'s reason. */
  getEssenceScopeStore() {
    return this.essenceScopeStore ?? null;
  }

  /**
   * Get the world TOOL scope store (issue 1359). Ungated, for `getComponentScopeStore`'s reason.
   * It carries the WORLD tool-breakage authority beside the three sub-keys.
   */
  getToolScopeStore() {
    return this.toolScopeStore ?? null;
  }

  /**
   * Get the world VOCABULARY store (issue 1392). DELIBERATELY UNGATED, and for its OWN reason:
   * nothing normalizes against this store, so the issue-970 shape the entity accessors guard against
   * does not apply. What does apply is `worldScopeProjection`'s `readCorpus`, which converts ANY
   * throw into a legitimate `{available: false, total: 0}` with no error and no failing test — so a
   * readiness throw would silently blank the world Tags & Categories screen.
   * THE NAME IS FIXED BY ITS CONSUMER, `adminStore` resolving it inside a gateway file this lane
   * may not open.
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
   * Read redaction-safe current-realm evidence for a selected actor, gated on a system.
   * Player-callable: only the resolved source token and disclosure-safe display data, never a raw
   * secret realm record.
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
   * Set a party's manual current-realm override. GM-only. A party has ONE override since issue
   * 1282, so `systemId` gates the write rather than selecting which override is written.
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
   * Reveal a realm's discovery on an actor. GM-only; the realm must exist in the WORLD library
   * before anything is written. `systemId` is the participation gate, not an ownership claim.
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
   * Get the `actorInventory` strategy's coin spender. `COMPANION`'s `handle` tier (issue 1289): the
   * promise is that it answers the object Fabricate itself uses, or `null` before readiness.
   * DELIBERATELY NOT `_requireReady()`-GATED, matching `getCurrencyConfigStore`: the field is `null`
   * from the constructor, so a pre-readiness read answers `null` rather than throwing.
   */
  getActorInventoryCoinSpender() {
    return this.actorInventoryCoinSpender;
  }

  /**
   * Get the `actorProperty` strategy's coin spender. `COMPANION`'s `handle` tier (issue 1289): the
   * promise is that it answers the object Fabricate itself uses, or `null` before readiness.
   * DELIBERATELY NOT `_requireReady()`-GATED, matching `getCurrencyConfigStore`: the field is `null`
   * from the constructor, so a pre-readiness read answers `null` rather than throwing.
   */
  getActorPropertyCoinSpender() {
    return this.actorPropertyCoinSpender;
  }

  getCompendiumImporter() {
    return this.compendiumImporter;
  }

  /**
   * Merge caller `options` with the persisted remembered-actor default: a TRUTHY id overrides, a
   * null or empty one falls back to the persisted last-gathering selection.
   * IT MUST COALESCE, NOT SPREAD. The UI passes `store.selectedActorId ?? null`, which on a fresh
   * open is `null` before the actor bar settles — a spread let that explicit `null` clobber the
   * default, so the engine resolved `selectableActors[0]` and every required tool read "missing".
   */
  _withRememberedActorDefault(options = {}) {
    return {
      ...options,
      rememberedActorId: options.rememberedActorId || this.getSelectedGatheringActorId() || null,
    };
  }

  /**
   * List gathering environments and tasks for the current user and selected actor; the engine
   * receives the current Foundry user as viewer, whatever the caller supplied. An omitted or null
   * `rememberedActorId` falls back to the persisted selection rather than the engine's arbitrary
   * first-selectable fallback. The engine resolves the id against its OWNERSHIP selectable list,
   * not the narrower player-character list, so a legacy persisted id is still honoured.
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
      // on (issue 917). Safe to capture in the cached builder: `this.craftingRunManager` is
      // constructed once during init and never reassigned.
      craftingRunManager: this.craftingRunManager,
      localize: (key, data) =>
        data !== undefined
          ? (game.i18n?.format?.(key, data) ?? key)
          : (game.i18n?.localize?.(key) ?? key),
      nowWorldTime: () => game.time?.worldTime ?? 0,
      resolveCheckFormula: (formula, actor, craftingModifier) =>
        resolveCheckFormulaDisplay(formula, actor, craftingModifier),
      // How a held document resolves to a managed component, for the summary phase's per-pass
      // tallies (issue 1075). The SAME full resolver `InventoryListingBuilder` matches owned stacks
      // with, so the crafting row's "looks makeable" and the inventory tab's owned count cannot
      // disagree. Injected rather than imported, so its matcher graph stays out of the harness.
      resolveComponentForItem: findMatchingComponent,
    });
    return this._craftingListingBuilder;
  }

  /**
   * Resolve a stored crafting actor preference against Foundry's actor collection; null for a stale
   * id. DEFENCE IN DEPTH: for a non-GM viewer the actor must pass the same ownership predicate the
   * gathering attempt path uses, so a console-supplied id cannot have its inventory read.
   */
  _resolveCraftingActor(actorId) {
    const actor = actorId ? (game.actors?.get?.(actorId) ?? null) : null;
    if (!actor) return null;
    if (game.user?.isGM === true) return actor;
    return isGatheringActorSelectableByUser(actor, game.user) ? actor : null;
  }

  /**
   * Resolve the effective crafting actor and component-source actors, applying the persisted
   * defaults. A truthy `rememberedActorId` overrides; stale ids resolve to nothing.
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
   * Build the player-facing Crafting listing. The current Foundry user is ALWAYS the viewer,
   * whatever the caller supplied; the visibility service honours the GM bypass.
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
   * DETAIL PHASE — the exact rich model for ONE recipe (issue 1075), the companion of
   * `listCraftingForActor`, which returns cheap summary rows. The player app calls this for the
   * selected recipe only, so the exact craftability, check resolution and stages are computed for
   * what is on screen rather than for the whole corpus.
   * `recipeId` arrives from a client and is NOT trusted: the actor and sources are re-resolved
   * through the same ownership-gated `_resolveCraftingSources`, and the builder re-evaluates
   * visibility, so an id the viewer may not see answers `null` and never a model.
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
   * Lazily build and cache the `InventoryListingBuilder` projecting the owned-component view.
   * `recipeVisibility` is injected so a non-GM viewer's used-by list never names a teaser recipe.
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
   * Build the player-facing Inventory listing, reusing the crafting selection so the Inventory and
   * Crafting tabs agree on what the player owns. The current Foundry user is always the viewer.
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
   * Learn one recipe from an owned recipe-item book, against the same scope the listing was computed
   * for, then delegated to the visibility service, which enforces the per-document learn budget for
   * capped systems and leaves uncapped books intact.
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
   * The ONE authorization rule every GM-gated, actor-targeted facade member applies: the caller is a
   * GM, and `actorId` resolves to an actor the caller may act as (issue 1289).
   * `companion-api/spec.md` § Behavioural Member Rules owns the normative GM -> actor -> readiness
   * order. THE MESSAGE KEYS ARE PARAMETERS, because a failed grant must not report itself in the
   * words of a failed reset. A SECOND COPY of this rule lives on the GM Knowledge surface's shell;
   * unifying them crosses the facade/UI boundary and is a follow-up, named so a THIRD copy meets it.
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
   * `companion-api/spec.md` § Behavioural Member Rules owns every rule: the GM text is DUPLICATED
   * rather than shared, the address is a UUID and never an id, the document must be an Actor and a
   * WORLD actor, a compendium address is refused, and both duplications are pinned as literal source
   * strings here and in the harness mirror. It takes NO refusal strings — each pooled delegator
   * answers through its own result builder, the one home of the member's words.
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
   * discovery progress for one system, or across every system when `systemId` is null.
   * EXPLICITLY GM-GATED even though it is GM-only, because it mutates player-owned actor state and,
   * for `total`-scope books, a world setting. It NEVER THROWS, answering `{ success, message }`.
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
   * `COMPANION.grantRecipeKnowledge` — teach one actor one recipe with NO owned book required (issue
   * 1289). It is unbounded by design, WHICH IS WHY the behaviour lives in the free function
   * `grantRecipeKnowledgeToActor` rather than on `RecipeVisibilityService`: that service is handed
   * out LIVE AND UNGATED, so an unbounded self-benefiting write there would be reachable by any
   * player from the console. It owns preconditions 1-3 only.
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
   * coin ladder (issue 1289)? World scope, never a crafting system, so it consults no
   * `requirements.currency` toggle; ladder-aware, so the caller aggregates nothing; it writes nothing.
   * GM-gated for the reason the grant is, plus one of its own: on a `macro`-strategy world the check
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
   * The ONE seam bag both WORLD-scoped currency members inject (issue 1301), hoisted so neither
   * delegator restates it. `isElectedExecutor` is deliberately NOT here: the check gates on no call
   * site, writing nothing, and a seam read by one of its two consumers is how a gate ends up
   * assumed rather than declared. `creditCurrency` spreads this bag and adds it.
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
   * ladder (issue 1301), sharing its request resolution with `checkAffordability` so the two cannot
   * disagree about `50 gp`. SITED BESIDE IT AND THE BAG THEY SHARE so the two delegators are not
   * adjacent in either this file or its harness mirror — MEASURED: adjacent near-identical
   * delegators concatenate into ONE duplicated run and the pair measured over the debt bar.
   * It routes through the spender's `refund`, so `caller: 'award'` is what lets a GM's `increment`
   * macro tell a credit from a cancel. NOT IDEMPOTENT: crediting 50 gp twice is 100 gp.
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
   * The seam bag `readPooledHoldings` injects (issue 1342). It SPREADS `_worldCurrencySeams` rather
   * than restating the coin bindings, the read's currency axis being the same WORLD ladder
   * `checkAffordability` reads. `findComponentItems` is the PUBLISHED matcher, which keeps what this
   * read COUNTS and what the consume TAKES from disagreeing. THREE SEAMS THE LEAF DECLARES ARE
   * DELIBERATELY ABSENT, for the reason `createOrStack` is absent from the award bag.
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
   * `companion-api/spec.md` § The Read Is Not A Reservation owns the rules. Sited HERE, beside the
   * world-currency members whose bag it spreads, for the duplicated-run reason on `creditCurrency`.
   * The first member addressed by actor UUID — `_requireGmActors` states why the address, not the id.
   */
  async readPooledHoldings({ actorUuids = null, costs = null } = {}) {
    const gate = this._requireGmActors(actorUuids);
    if (gate.outcome || this.ready !== true) {
      return pooledHoldingsReadResult(gate.outcome ?? COMPANION_OUTCOMES.notReady, gate.messageData);
    }
    return await readPooledHoldingsAcrossActors(gate.actors, { costs }, this._pooledHoldingsSeams());
  }

  /**
   * The ONE seam bag both Standalone Check Roll members inject, hoisted so neither delegator
   * restates it and the harness mirror has one thing to substitute. `resolveActor` and `isGm` are
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
   * (issue 1293). A Standalone Check Roll, as `companion-api/spec.md` defines it. It owns
   * preconditions 1-3 only, reusing the shared preamble VERBATIM; the leaf owns the call-site gate.
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
   * it makes (issue 1293). It rolls nothing. GM-gated INLINE rather than through `_requireGmActor`,
   * and not a second copy of the rule: `companion-api/spec.md` § Behavioural Member Rules scopes
   * the shared preamble to ACTOR-TARGETED members, and this one targets no actor.
   */
  async resolveBulkCheckDecision({ callSite = null, formulas = null } = {}) {
    const gmOnly = game.user?.isGM !== true ? COMPANION_OUTCOMES.gmOnly : null;
    if (gmOnly || this.ready !== true) {
      return bulkCheckDecisionResult(gmOnly ?? COMPANION_OUTCOMES.notReady);
    }
    return await resolveStandaloneBulkCheckDecision({ callSite, formulas }, this._companionCheckSeams());
  }

  /**
   * The seam bag `awardComponents` injects (issue 1301). FIVE seams, and the sixth the leaf declares
   * — `createOrStack` — is deliberately ABSENT: the leaf defaults it to the shared import, so
   * passing it here would give the create primitive two spellings and let a facade change route the
   * award past the seam whose normalisation the answer's truthfulness rests on.
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
   * `COMPANION.awardComponents` — place one or more of a crafting system's components onto an
   * actor's sheet (issue 1301); `companion-api/spec.md` § The Award Members owns the rules.
   * It owns preconditions 1-3 only, reusing the shared preamble VERBATIM, and the leaf owns the
   * call-site gate, the election and the `awards` validation. NOT IDEMPOTENT: there is no natural key.
   */
  async awardComponents({ actorId = null, systemId = null, awards = null, callSite = null } = {}) {
    const gate = this._requireGmActor(actorId, AWARD_COMPONENTS_GATE_KEYS);
    if (gate.outcome || this.ready !== true) {
      return componentAwardResult(gate.outcome ?? COMPANION_OUTCOMES.notReady);
    }
    return await awardComponentsToActor(gate.actor, { systemId, awards, callSite }, this._componentAwardSeams());
  }

  /**
   * The seam bag `consumePooledHoldings` injects (issue 1342). It spreads `_worldCurrencySeams` and
   * adds the election, as `creditCurrency` does, because this member WRITES.
   * THE COMPONENT TRIO IS BOUND IDENTICALLY TO THE AWARD'S, and that identity is the point: what an
   * award stacks onto, what salvage consumes and what this TAKES must resolve through one matcher.
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
   * `COMPANION.consumePooledHoldings` — take a set of costs from what a SET of characters holds
   * between them (issue 1342); `companion-api/spec.md` § The Pooled Holdings Members owns the rules.
   * The first published member that REMOVES value. Sited HERE rather than beside the read it pairs
   * with, for the duplicated-run reason recorded on `creditCurrency`.
   */
  async consumePooledHoldings({ actorUuids = null, callSite = null, costs = null } = {}) {
    const gate = this._requireGmActors(actorUuids);
    if (gate.outcome || this.ready !== true) {
      return pooledHoldingsConsumeResult(gate.outcome ?? COMPANION_OUTCOMES.notReady, gate.messageData);
    }
    return await consumePooledHoldingsFromActors(gate.actors, { callSite, costs }, this._pooledConsumptionSeams());
  }


  /**
   * Craft a recipe for the current selection, delegating to {@link Fabricate#craft}.
   * Resolves the crafting actor + component sources from the supplied ids (or the
   * persisted defaults) so the attempt uses the same inventory scope the listing
   * was computed for.
   * New starts use version 1 and preserve ready, fully supplied one-call execution.
   * Waiting or unresolved choices leave the run in the Journal without editable-material spending.
   * Unlike {@link Fabricate#craft}, this player-facing method accepts actor IDs, not documents.
   *
   * @param {object} options
   * @param {string|null} [options.actorId] Crafting actor id.
   * @param {string} options.recipeId Recipe id.
   * @param {string|null} [options.ingredientSetId] Chosen ingredient set id.
   * @param {Object<string, {optionIndex: number, heldItemId?: string}>|null}
   *   [options.ingredientOptionOverrides] Explicit ingredient-group choices.
   * @param {{stepId: string|null, ingredientSetId: string|null,
   *   allocation: Record<string, number>}|null} [options.ingredientEssenceAllocation]
   *   Physical carrier units scoped to the current step and ingredient set.
   *   Stale or mismatched intent blocks versioned execution until explicitly repaired.
   * @param {string[]|null} [options.componentSourceActorIds] Source actor ids.
   * @param {boolean} [options.interactive=false] Forwarded crafting option.
   *   Versioned required checks use the authority's prepare/prompt/resolve exchange regardless
   *   of this legacy opt-in. Cancelling the prompt leaves the stage unexecuted, not the run absent.
   * @returns {Promise<object>} Start/wait, execution, cancellation or refusal result.
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
   * Salvage one owned component for the current selection (issue 675), behind the Inventory tab's
   * Salvage panel. TAKES AN `actorId`, NEVER AN `actorUuid`: `CraftingEngine.salvage` performs NO
   * ownership check, so `_resolveCraftingActor` is the ONLY gate on this path, and a uuid would go
   * straight to `fromUuid()` where a stale or foreign one reaches the server and THROWS rather than
   * returning the `{ success: false, message }` a store expects. `craftRecipe` parity is the contract.
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
   * collaborator injected so the service reaches no Foundry global.
   * CACHING IS SOUND BECAUSE EVERY COLLABORATOR IS READ OFF `this` AT CALL TIME, not captured at
   * construction: `this.craftingEngine` is `null` until `initialize()`, so a service that captured
   * the field's value could hold `null` forever. `_getBulkDestroyService` restates the rule.
   */
  _getBulkSalvageService() {
    if (this._bulkSalvageService) return this._bulkSalvageService;
    this._bulkSalvageService = new BulkSalvageService({
      salvage: (actorUuid, systemId, componentId, options) =>
        this.craftingEngine.salvage(actorUuid, systemId, componentId, options),
      getCraftingSystem: (systemId) => this.craftingSystemManager.getSystem(systemId),
      promptRollDecision: promptBulkCheckRoll,
      postChatMessage: (message) => this._postBulkSalvageChatMessage(message),
      // The BATCHED complication relay (issue 1286), read off `this` at call time because the
      // writer is composed during `initialize()`. One message per addressed (system, actor) PAIR
      // rather than per ROW, both halves being GM-side authorization inputs and the rate limit
      // being sized against the fanned-out pair count.
      deliverComplications: (message) => this.complicationDeliveryWriter?.deliver(message),
      // The executing user's stored progressive stage order, through the SAME edge
      // `ResolutionModeService` and `CraftingEngine` are given (issue 1286). Only the pre-run
      // forecast consumes it; the RUN path uses the order its own run captured at start. Left
      // unwired the forecast quietly reads the AUTHORED order while the run reads the player's.
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
      // Destroy MUST resolve documents through the identical matcher salvage uses, including its
      // case-SENSITIVE name fallback: a destroy that matched more broadly than salvage would delete
      // things the player was shown as a different component. Read off `this.craftingEngine` at
      // CALL time, because this service is cached and the engine is assigned during `initialize()`.
      findComponentItems: (actor, component, system) =>
        this.craftingEngine.findComponentItems(actor, component, system),
      // Must RETURN the deleted documents: the service derives `unitsDeleted` from what came back
      // and never from what it asked for, because a `preDeleteItem` hook can veto individual ids
      // silently while the rest of the batch deletes.
      deleteItems: (actor, itemIds) => actor.deleteEmbeddedDocuments('Item', itemIds)
    });
    return this._bulkDestroyService;
  }

  /**
   * Post the ONE aggregated bulk-salvage chat card. THE ORDER OF THE THREE STEPS IS LOAD-BEARING:
   * SPEAKER first, because `applyMode`'s `ic` branch reads `chatData.speaker.actor` unguarded;
   * VISIBILITY before `create`, the legacy `rollMode` create option being honoured only for a
   * message carrying rolls and this card carrying none; and `create` LAST, with `author`, the V14
   * schema having no `user` field and no shim.
   * THE SPEAKER IS BUILT, NEVER INFERRED: `getSpeaker()` with no actor falls through to the
   * CONTROLLED TOKENS, so a GM with an unrelated NPC selected would have the card attributed to it.
   * NEVER read `core.messageMode`: `assertSetting` throws on V13, and `??` does not catch a throw.
   */
  async _postBulkSalvageChatMessage({ content, rollMode, actorUuid, actorNames = [] }) {
    // `globalThis.` rather than the bare global this file uses elsewhere: optional chaining does
    // not rescue an UNDECLARED identifier, so a bare `fromUuidSync?.()` still throws a
    // ReferenceError under a harness that has not installed it, and this poster must never be the
    // thing that costs a completed run its report.
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
   * Gate a bulk target list, resolving ONE actor per row from `target.actorId ?? actorId` and
   * NOTHING ELSE. There is deliberately no persisted-selection tail, unlike `_resolveCraftingSources`:
   * a bulk run may span actors, so that fallback would silently RETARGET a row whose own actor did
   * not resolve, destroying the wrong character's items with no error anywhere. Order is preserved.
   */
  _gateBulkTargets(targets, actorId) {
    return (targets || []).filter(Boolean).map((target) => ({
      target,
      actor: this._resolveCraftingActor(target.actorId ?? actorId)
    }));
  }

  /**
   * Weave a service's result rows back into the caller's ORIGINAL target order, substituting a
   * refusal row wherever the gate resolved no actor. A run that reordered its own rows would make
   * "the third one failed" unreadable.
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
   * The identity fields every refusal row carries, resolved from the crafting system so a refused
   * row still READS as the thing the player selected rather than as an unconnectable blank line.
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
      // The facade's own outcome, added to the service vocabulary rather than folded into
      // `skipped`: "you may not act on this actor" and "this row was not runnable" are different
      // answers and the panel gives them different chips.
      outcome: 'notPermitted',
      skipReason: null
    };
  }

  /**
   * Salvage MANY owned components in one gesture (issue 859), the seam behind the Inventory tab's
   * bulk panel.
   * IT TAKES AN `actorId` PER TARGET, NEVER AN `actorUuid`, AT ANY NESTING LEVEL. Neither the engine
   * nor `BulkSalvageService` performs an ownership check, so the per-target `_resolveCraftingActor`
   * is the ONLY gate — and it resolves through `game.actors`, so neither a compendium-backed actor
   * nor an unlinked token actor can ever be a target. An unresolvable actor becomes a
   * `notPermitted` ROW rather than a throw, so one refused row costs the player none of the others.
   * `interactive` defaults TRUE here, unlike the automation-facing `salvageComponent`.
   * STATED LIMIT: `onProgress`'s `total` counts the rows the SERVICE was given, so a run containing
   * a refused row finishes below the caller's own denominator.
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
   * Permanently destroy MANY owned components in one gesture (issue 859), under the same gate,
   * order-preserving merge and `onProgress` limit as `salvageComponents`.
   * DELETES WHOLE STACKS, and is deliberately NOT gated on `features.salvage` or a component's
   * `salvage.enabled`: a player can already delete their own Items from the Foundry sheet, so this
   * adds ergonomics and not capability. No chat card — a result card reports what a run PRODUCED.
   * The caller owns the confirmation; this executes against the snapshot it named.
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
   * Re-evaluate the craftability of ONE ingredient set with in-session per-group option overrides
   * applied (issue 552), through the SAME `evaluateCraftability` seam the engine consumes.
   * Synchronous, because the store reads it from a `$derived`.
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
    // Resolve through the EXECUTION STEPS, not `recipe.ingredientSets`, which is EMPTY for every
    // explicit multi-step recipe. `resolveStepIngredientSet` also enforces the two rules that make
    // this safe: with no `stepId` the ACTIVE step decides, and a set id is matched WITHIN it.
    const resolved = resolveStepIngredientSet({
      steps: this.resolutionModeService?.getExecutionSteps?.(recipe) ?? [],
      stepId,
      activeStepIndex: activeRunStepState(this.craftingRunManager, craftingActor, recipe.id).index,
      setId,
    });
    if (!resolved) return null;
    // Narrow the evaluation to the one selected set through the SHARED step view the engine crafts
    // against, so the step's tool union applies, keeping the recipe's data fields and the
    // IngredientSet instance methods.
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

  /**
   * Lazily build and cache the `AlchemyListingBuilder` projecting the leak-safe workbench view — a
   * Foundry-global-free read-side collaborator wired with the existing managers.
   */
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
      // The per-pass inventory snapshot's component resolver (issue 1228). The workbench never
      // reads component tallies itself; this is here so its snapshot is the same complete value
      // every other pass builds.
      resolveComponentForItem: findMatchingComponent,
    });
    return this._alchemyListingBuilder;
  }

  /**
   * Build the leak-safe player Alchemy workbench listing, scoped to `craftingSystemId`. The current
   * user is always the viewer, and the actor is resolved through the SAME owner gate as crafting —
   * a non-owner viewer's actor resolves to null, so the builder answers a denied, empty listing.
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
   * then delegated to `CraftingEngine#craftAlchemy`, which is AUTHORITATIVE — it matches against all
   * enabled recipes known and undiscovered, and fizzles with no check and no roll otherwise.
   * `interactive` prompts on a MATCHED brew only; a fizzle runs no check, so it never does.
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
   * The actors the current user may select as crafting or component-source actors, filtered exactly
   * like the actor-selection bar so the two pickers offer the same characters. Display data only.
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
   * Resolve the current selection's component-source actors as real Foundry actors, for the pure
   * shopping-list aggregator. Owner-scoped via the persisted ids only — it widens no access.
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
   * WORLD, so the same player in another world gets a fresh map and it does NOT follow the account
   * globally. The `getFavouriteRecipeIds` neighbour IS client-scoped.
   */
  getProgressiveResultOrder() {
    const stored = getSetting(SETTING_KEYS.PROGRESSIVE_RESULT_ORDER);
    return stored && typeof stored === 'object' ? stored : {};
  }

  /**
   * The Foundry edge for the `getPlayerResultOrder` seam (issue 651). Deliberately a settings read
   * answering DATA rather than a sorted array: the reconciliation is in `applyPlayerResultOrder`.
   */
  _readPlayerResultOrder(entry) {
    const key = progressiveOrderKey(entry);
    if (!key) return null;
    const order = this.getProgressiveResultOrder()[key];
    return Array.isArray(order) ? order : null;
  }

  /**
   * Persist the player's preferred result order for one namespaced key. ASYNC AND MUST BE AWAITED:
   * under `user` scope `set` is a real replicated write that can REJECT, unlike the client-scoped
   * fire-and-forget in `toggleFavouriteRecipe`, so swallowing it would report an order never stored.
   */
  async setProgressiveResultOrder(key, orderedIds) {
    const current = this.getProgressiveResultOrder();
    if (!key) return current;
    const next = { ...current, [key]: Array.isArray(orderedIds) ? orderedIds : [] };
    await setSetting(SETTING_KEYS.PROGRESSIVE_RESULT_ORDER, next);
    return next;
  }

  /**
   * Whether the player has opted to hide unavailable gathering environments. `scope: 'client'`, so
   * it persists in that browser's `localStorage` and is per device, not per user.
   */
  getHideUnavailableEnvironments() {
    // `Boolean()` rather than `=== true`: the setting is registered `type: Boolean`, and the
    // strict compare trips a static-analysis false positive.
    return Boolean(getSetting(SETTING_KEYS.GATHERING_HIDE_UNAVAILABLE));
  }

  /**
   * Persist the "hide unavailable environments" preference. Client-scoped, so it is remembered per
   * device. View-only: it changes no saved data, no engine listing and no GM configuration.
   */
  setHideUnavailableEnvironments(value) {
    return setSetting(SETTING_KEYS.GATHERING_HIDE_UNAVAILABLE, value === true);
  }

  /**
   * Start a gathering attempt for the current user; the raw GatheringEngine stays module-internal so
   * every public attempt carries current-user viewer enforcement. `interactive` prompts on the
   * routed and progressive paths only — the d100 and timed paths roll elsewhere and never prompt.
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

    // `requestStart`, not `startAttempt`: a blind timed start this client may not write is routed
    // to the active GM before any task is drawn (issue 901). Every other start is unchanged.
    return callGatheringRuntimeWithCurrentViewer(gatheringEngine, 'requestStart', withRememberedActor, () => game.user);
  }

  /**
   * The per-drop "What you might find" breakdown for one opened task, defaulting the remembered
   * actor to the persisted selection and enforcing the current user as viewer.
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
   * Read current gathering conditions and configured tag vocabularies. Player-safe: the global
   * weather and time-of-day state and the available tags, but no GM-only library internals.
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
   * Atomically update global gathering conditions; an omitted field keeps its current value. A
   * mutation requires a GM and validates its tags through the rich state service.
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

  /**
   * Read a crafting system's gathering economy block. Player-safe — the mode and regen cadence are
   * surfaced in the player UI.
   */
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
    // Player characters only, per the CONFIGURED player-character actor types (issue 1024) — so a
    // Fallout `robot` appears once the GM ticks it and a dnd5e `npc` never does. A character with no
    // rolled pool reports `max: null`, and the panel offers Roll.
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
   * Submit a current-lifecycle operation through active-GM authority after initialization.
   * Actor UUIDs address this authenticated command boundary, whose GM handler rechecks the
   * attested sender's ownership. They do not replace actor IDs in the player crafting facades.
   * A timeout is an unknown response, not proof that execution failed or permission to replay.
   * @param {{actorUuid: string, runType: 'crafting'|'gathering', runId: string,
   *   expectedRevision: number, action: string, payload?: object}} command
   *   Start uses an empty runId and revision zero. Alchemy uses runType `crafting`.
   * @returns {Promise<object>} Authoritative result or explicit refusal.
   */
  executeJournalRunCommand(command) {
    this._requireReady();
    return this.journalRunCommands?.executeJournalRunCommand(command)
      ?? Promise.resolve(authorityUnavailableRefusal());
  }

  /**
   * Hide a terminal entry for the current user in this world, preserving actor history.
   * The awaited user-scoped setting write follows the user across devices and can reject.
   * @param {{actorUuid: string, runType: string, runId: string}} options Native run identity.
   * @returns {Promise<object>} `{success, key}` on persistence or a refusal for an invalid target.
   */
  dismissJournalRun(options) {
    this._requireReady();
    return this.journalRunCommands?.dismissJournalRun(options)
      ?? Promise.resolve(authorityUnavailableRefusal());
  }

  /**
   * Read this user's hidden native run keys for one actor, without changing history.
   * @param {{actorUuid: string, viewerId?: string}} options A different viewer gets an empty set.
   * @returns {Set<string>}
   */
  getDismissedJournalRunKeys(options) {
    return this.journalRunCommands?.getDismissedJournalRunKeys(options) ?? new Set();
  }

  /**
   * Read cached authority availability. This neither provisions a ledger nor releases a claim.
   * @returns {{available: boolean, reason: string|null}}
   */
  getJournalRunAuthorityAvailability() {
    return this.journalRunCommands?.getJournalRunAuthorityAvailability()
      ?? authorityUnavailableAvailability();
  }

  /**
   * Ensure the private run-authority ledger exists, as the active GM. Idempotent: an existing
   * ledger is returned rather than refused, and no second ledger is ever created.
   * Boot recovery and the command path already provision automatically, so this is a no-op in a
   * healthy world. It never clears a retained execution claim.
   * @returns {Promise<object>} `{success: true, ledgerId}` or `{success: false, reason}`.
   */
  setupJournalRunAuthority() {
    return this.journalRunCommands?.setupJournalRunAuthority()
      ?? Promise.resolve(authorityUnavailableRefusal());
  }

  /**
   * Record manual disposition of an exact retained execution claim as the active GM.
   * Inspect actual receipts and the uncertain applying boundary first, after confirming no
   * other GM realm is still executing. Planned amounts are not proof of awards or spending.
   * Matching run evidence is reconstructed and disposition persisted before releasing the claim.
   * This releases authority only: the old request stays non-replayable and an uncertain run
   * effect remains recovery-required. It performs no replay, compensation or automatic rollback.
   * @param {{claimId: string, disposition: 'reconciled'|'abandoned'}} options
   *   claimId is the claim's random token, not the fixed embedded page ID or a run ID.
   * @returns {Promise<object>} `{success: true, disposition}` or `{success: false, reason}`.
   * @example
   * // Active-GM macro after reviewing the interrupted operation and its receipts.
   * await game.fabricate.whenReady();
   * const ledgers = [...game.journal].filter(
   *   (entry) => entry.getFlag('fabricate', 'journalRunAuthorityLedger') === true
   * );
   * if (ledgers.length !== 1) throw new Error('Expected one authority ledger');
   * const page = ledgers[0].pages.get('FabRunAuthority1');
   * const claimId = page?.getFlag('fabricate', 'journalRunClaimId');
   * if (!claimId) throw new Error('No retained claim to reconcile');
   * const result = await game.fabricate.reconcileJournalRunAuthority({
   *   claimId,
   *   disposition: 'reconciled',
   * });
   * if (!result.success) throw new Error(result.reason);
   */
  reconcileJournalRunAuthority(options) {
    return this.journalRunCommands?.reconcileJournalRunAuthority(options)
      ?? Promise.resolve(authorityUnavailableRefusal());
  }

  /**
   * Current world time in seconds (the Foundry-facing read seam). Lives on this
   * edge so the Journal store and pure UI utils stay free of `game.*`.
   *
   * @returns {number}
   */
  getWorldTime() {
    return Number(game.time?.worldTime || 0);
  }

  /**
   * Calendar components for an absolute world time, augmented with `daysPerYear` where derivable so
   * the pure `worldTimeLabel` util can compose an absolute campaign day without touching `game.*`.
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

  /**
   * Lazily construct the singleton `RunJournalBuilder`, held on the instance so a fresh builder is
   * not rebuilt per listing call.
   */
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
        // The per-pass inventory snapshot's component resolver (issue 1228). The Journal never reads
        // component tallies itself; this is here so its snapshot is the same complete value every
        // other pass builds.
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
   * Resolve a system library tool to `{ id, name, img }` through the `data-models` requirement 13
   * precedence. THE SNAPSHOT RUNG IS LOAD-BEARING — without it an item-sourced Tool, whose
   * `componentId` is null by construction, printed its raw id (issue 1119).
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
   * Resolve a gathering run's task to `{ name, img }` via the COMPOSED environment, which carries
   * the authored task name and image where the raw store does not; null leaves the raw-id fallback.
   */
  _resolveJournalGatheringTask(environmentId, taskId) {
    if (!environmentId || !taskId) return null;
    const environment = gatheringEngine?._findEnvironment?.(environmentId);
    const tasks = Array.isArray(environment?.tasks) ? environment.tasks : [];
    const task = tasks.find((entry) => entry?.id === taskId);
    return task ? { name: task.name, img: task.img } : null;
  }

  /**
   * Resolve a run's awarded item to `{ name, img }` by its recorded uuid, so the Journal can label
   * history recorded before name and img were captured at award time. Best-effort and synchronous.
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
   * Resolve a system component to `{ name, img }` for the Journal, powering a salvage run's title
   * and the fallback for a created result that captured neither; null leaves the raw-id fallback.
   */
  _resolveJournalComponent(systemId, componentId) {
    if (!systemId || !componentId) return null;
    const system = this.craftingSystemManager?.getSystem(systemId);
    const component = findById(getDefinitionIndex(resolvedComponentsFor(system)), componentId);
    return component ? { name: component.name ?? null, img: component.img ?? null } : null;
  }

  /**
   * Resolve the Journal's selected actor against the bar-selectable list, preferring a remembered id
   * and then the first selectable. Mirrors the gathering listing's remembered-actor seam.
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
   * Advance a crafting run's current step — the single player-triggerable advance boundary. Since
   * `craft()` writes directly to the source actors a non-owner cannot advance, which answers a
   * "needs owner" message rather than throwing. THE RECIPE COMES FROM THE RESOLVED RUN, NEVER THE
   * CALLER (issue 966): trusting a client-supplied id let a caller advance run X while naming Y.
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
   * `cancelCraft` restores items to the source actors, so a non-owner is blocked gracefully rather
   * than by a Foundry permission throw.
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
   * Craft a recipe for a resolved Actor, preserving one-call execution when the stage is ready
   * and all choices are supplied. New starts use version 1 through active-GM authority.
   * Waiting stages or unresolved choices remain in the Journal without editable-material spending.
   * Resuming an existing unversioned run preserves its legacy contract.
   * Use {@link Fabricate#craftRecipe} for the player-facing actor-ID selection facade.
   * Required versioned checks still use the authority's player prompt and GM evaluation.
   * Secret checks use a generic prompt and GM private posting without player roll-data handoff.
   * Foundry whisper/private-roll presentation is not a server confidentiality guarantee.
   * @param {Actor} actor The Actor document performing the craft, not its ID or UUID string.
   * @param {string|Recipe} recipe Recipe ID or resolved Recipe.
   * @param {object} [options]
   * @param {Actor[]} [options.componentSourceActors] Resolved source documents, defaulting to actor.
   * @param {string} [options.runId] Existing active run to continue.
   * @param {string|null} [options.ingredientSetId] Chosen ingredient route.
   * @param {Object<string, {optionIndex: number, heldItemId?: string}>}
   *   [options.ingredientOptionOverrides] Explicit group choices.
   * @param {{stepId: string, ingredientSetId: string, allocation: Object<string, number>}}
   *   [options.ingredientEssenceAllocation] Shared physical carrier allocation.
   * @returns {Promise<object>} Execution, start/wait or refusal result.
   * @example
   * await game.fabricate.whenReady();
   * const actor = game.actors.get('YOUR_ACTOR_ID');
   * const result = await game.fabricate.craft(actor, 'YOUR_RECIPE_ID');
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
      executeCommand: (command) => this.executeJournalRunCommand(command),
      resolveUuid: (uuid) => globalThis.fromUuid?.(uuid),
    });
  }

  /**
   * Delete a recipe by id, routed through `CraftingSystemManager.deleteRecipes` (issue 1132) so this
   * public API and the GM studio cannot disagree about what deleting a recipe reaches.
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

// Register the init-time Foundry CONFIG entries for the canvas Interactable foundation. Defensive
// and idempotent, so it is safe from BOTH `init` and `ready` — the latter being the backstop for a
// late module evaluation that registers the `init` callback for an already-spent event.
function registerFabricateConfig() {
  // Register the region-first `fabricate.interactable` data model and its type icon. Defensive and
  // idempotent: a no-op when the Foundry region APIs are unavailable.
  registerInteractableRegionBehavior(CONFIG);

  // Register the CORE schema-driven `RegionBehaviorConfig` as the document sheet for the
  // `fabricate.interactable` subtype. The rich `InteractableConfigApp` is an ApplicationV2, NOT a
  // DocumentSheet, so registering it left `behavior.sheet` null and broke the edit pencil; the rich
  // panel stays reachable from the HUD entry and the scene-control opener.
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

// Bind the public API onto the live `game.fabricate` global. A pure assignment, so it is idempotent
// and safe from BOTH `init` and `ready`. The `ready` call is the backstop for a late module
// evaluation that leaves `game.fabricate` unassigned and stalls the manager on "still loading".
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
    // module load and assigned HERE AND NOWHERE ELSE, so a companion can version-check from
    // Fabricate's own `init`. ITS `stable` MEMBERS ARE METHODS ON THE FACADE, not entries in this
    // class bag: publishing a grant symbol here would hand out a GM-gated write without its gate.
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
    // array and the whole `gatheringConfig` setting, which the exporter then slices. Passing three
    // args dropped both, making the public-API export lossy against the import path (issue 642).
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
    // And the three WORLD-SCOPE ENTITY settings (issue 1364), with a sharper consequence: these
    // slices are membership-filtered, so omitting them exports a system whose world roster,
    // defaults and membership records are all empty.
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

  // GM "prepare for uninstall" cleanup (issue 535). `fabricate.interactable` is a module-defined
  // RegionBehavior sub-type Foundry does NOT remove when Fabricate is disabled, so it errors on
  // every scene load. This strips ONLY what Fabricate owns and NEVER deletes a parent Region, a
  // foreign behaviour or a GM's own Token.
  game.fabricate.cleanupInteractables = () => runInteractableWorldCleanup();
}

/**
 * The DESTINATION world's entity roster (issue 1364). A copy-mode import matches every incoming
 * entity's SOURCE REFERENCES against this rather than minting a duplicate. An absent store answers
 * an empty list, so everything mints — correct for an unmigrated world.
 */
function buildWorldEntityIndex(fabricate) {
  return {
    components: fabricate?.getComponentScopeStore?.()?.listEntities?.() ?? [],
    essences: fabricate?.getEssenceScopeStore?.()?.listEntities?.() ?? [],
    tools: fabricate?.getToolScopeStore?.()?.listEntities?.() ?? [],
  };
}

/**
 * The GM-invocable uninstall-safe interactable cleanup edge. GM-gated and no-throw; answers `null`
 * when it did not run.
 */
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

// GM-only Compendium Directory bulk-import action, registered at module top-level and NOT in the
// `ready` body: that context menu is built once in `_onFirstRender`, which runs BEFORE `ready`, so
// a `ready`-body listener could miss it. The listener MUTATES `contextOptions` in place.
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
  // Backstop for a missed `init`, which a late module evaluation can cause. Both helpers are
  // idempotent, so re-running guarantees `game.fabricate` and the Interactable CONFIG exist before
  // readiness flips; otherwise the manager stalls on "still loading" forever.
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
  // the prepared document but is absent from `_source`, so every write is silently discarded. The
  // path was configured during `initialize()`; this adds the world scan, which needs `game.items`.
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
    // `senderId` is Foundry's server-attested sender user id (the trusted 2nd
    // callback arg of a custom module socket broadcast — set from the authenticated
    // session in `dist/server/sockets.mjs handleCustomSocket`, NOT from the client
    // payload). The interactable handler authenticates privileged edges against it
    // (issue 593); payload `userId` fields are client-supplied and spoofable.
    // Defensive: the event router shares the `module.fabricate` channel with the
    // canvas Interactable round-trip. Guard it so a throw on an event payload can
    // never prevent a non-event Interactable payload from reaching
    // handleInteractableSocketMessage below.
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
    // The same channel carries the environment node depletion a player emits from a node-backed
    // task: only the active GM may write `gatheringEnvironments`, so the single-unit decrement is
    // applied here, recomputed from its own stored state.
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
    // write `gatheringBlindRuns`, and only a client the player does not control may draw the task
    // without the player being able to rig it.
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
    // macro must run on a GM client, from the complication that GM's OWN record holds. Addressing
    // only — nothing on the wire names a macro, a visibility or any content.
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
    // The same channel carries the Interactable node-update action and the region-first activation
    // round-trip. Only the active GM applies node and behaviour writes and validates activation;
    // only the targeted user opens a granted session.
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

  // Env-node-driven marker swap: when a task node depletes or recharges, every linked Tile marker
  // flips to or from `depletedBehavior.swapImage`. Both the gather decrement and the world-time
  // respawn write `fabricate.gatheringEnvironments`, so reacting to that setting covers BOTH.
  // THE HANDLER TAKES THE `Setting` DOCUMENT ONLY, the create and update hooks differing in their
  // second argument. The try/catch buys a Fabricate-owned failure signal, not broadcast survival;
  // the collaborators are resolved PER CALL, and shared so the two listeners cannot drift.
  const fabricateSettingChangeTargets = () => ({
    craftingSystemManager: fabricate.craftingSystemManager,
    recipeManager: fabricate.recipeManager,
    gatheringEnvironmentStore: fabricate.gatheringEnvironmentStore,
    currencyConfigStore: fabricate.currencyConfigStore,
    travelStore: fabricate.gatheringRealmStore,
    characterLibrariesStore: fabricate.characterLibrariesStore,
    // Issue 1359. Without these three the bridge legs receive `undefined` and NO-OP silently: the
    // key still counts as handled, so nothing reports the miss and the client's corpus stays at its
    // boot value for the rest of the session.
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
      // Dismissals are `scope: 'user'`, so `updateSetting` delivers EVERY user's document to
      // every client; only this user's own hiding changes what this client shows. `Setting#user`
      // is an id (`idOnly: true` on V14.365); the `.id` read costs nothing and stays honest.
      if (
        key === `${FABRICATE_SETTINGS_NAMESPACE}.${SETTING_KEYS.JOURNAL_RUN_DISMISSALS}`
        && (setting?.user?.id ?? setting?.user) === game.user?.id
      ) {
        Hooks.callAll('fabricate.journalDismissalsChanged');
      }
      // Cross-client refresh: `craftingSystemsChanged` / `recipesChanged` are local
      // `Hooks.callAll`s fired only on the GM's client. The setting hooks fire on every
      // client when the replicated world setting lands, so reload the stale in-memory
      // manager here and re-emit the local change hook so open player apps refresh.
      handleFabricateSettingChange(key, fabricateSettingChangeTargets());
    } catch (error) {
      console.error('Fabricate | Failed to handle a Fabricate setting change', error);
    }
  };
  Hooks.on('updateSetting', handleFabricateSettingDocumentChange);
  // THE FIRST EVER WRITE TO A WORLD SETTING IS A CREATE, NOT AN UPDATE (issue 1024), so without this
  // line a GM setting a new value for the first time propagates to nobody until reload. BOTH LEGS
  // SHARE ONE LISTENER, pinned by two tests: nothing downstream distinguishes the two.
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
 * `roles[systemId].recipeItemDefinitionId` on every recipe-item definition's source Item, PER OWNING
 * SYSTEM so a source registered twice lands both leaves. NOT a MigrationRunner entry.
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
 * every registered component's source Item. PLACED BEFORE THE `updateItem` HOOK REGISTERS, so
 * restamp writes cannot trigger a metadata-refresh storm. ITS VERSION ADVANCE IS WITHHELD while
 * `1.30.0` has not completed (issue 1363), the spec's requirement 17 owning why.
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
 * ORDERING IS LOAD-BEARING: after the `1.15.0` migration populates each tool's source refs, and
 * before the `updateItem` hook registers. Sources only.
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
 * Issue 600 — the one-shot, active-GM-gated re-stamp writing `roles[systemId].componentId` onto
 * OWNED actor items resolving to a component by NAME ONLY. SCOPE: `game.actors` only, never an
 * unlinked synthetic-token actor, whose delta-based flags are fragile to write. NOT a
 * MigrationRunner entry: that runner has no Item handle, identical to the source stamps.
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
 * re-key invalidated. THE TWO GATES ARE DIFFERENT AND MUST STAY SO;
 * `destructive-changes-and-migrations/spec.md` § World-Scope Entity Migration requirements 13 and 17
 * own the run gate, the clear gate, the `compareSemver` rule and the withheld version advance.
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
    // THE RUN GATE IS CORPUS-DERIVED, and this is that predicate: a seeded scope with no pending
    // map has nothing to remap. A world with NOTHING to remap still falls through to the version
    // advance so it stops re-checking every boot, and that advance is itself gated on migration
    // completion, so a world whose migration deferred before writing the map re-runs.
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
    // THE SECOND WITHHOLD, a different question from the first: that gate asks whether the PRODUCING
    // migration completed, this whether THIS pass did. A rejected write leaves that actor naming
    // retired ids, and destroying the map would strand it and un-withhold the startup prune.
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
      // Two depths, deliberately: the crafting and salvage containers, the roles map and the legacy
      // scalar are DOUBLY nested under `flags.fabricate.fabricate.<key>`, while `gatheringRuns` is
      // written with a bare `setFlag` at the single-scope path.
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
 * decision record, so a world that consumed one may still owe the other, and writes a forced
 * replacement because it rewrites key sets. Its ordering against that sibling is at the call site.
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
    // The `systems` leg only, with `retired` written back explicitly: `retired` is the tombstone
    // keeping a retired essence id taken for the life of the world, so a clear writing `{}` would
    // let `mintEssenceId` reissue one.
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
 * Apply the essence remap; the gating above is the decision, this is the work. EVERY WRITE IS A
 * FORCED REPLACEMENT, never `setFabricateFlag`: an essence id is an object KEY and `Document#update`
 * merges inner objects without deleting, so a merge write would leave the retired key beside it.
 */
async function applyWorldEssenceMergeFlagRemap(mergeMap) {
  // A write counts as landed on the strength of not throwing, so the remapped counts can overstate.
  // Deliberately: the only tighter bucket is `skippedErrors`, which `remapCompletedCleanly` reads
  // to withhold the clear, and the overstatement reaches no gate.
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
 * Run the env-node-driven marker image sync across all scenes, resolving the environment and task
 * the way InteractableManager does and writing the tile texture as the active GM.
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
// never learn of a write another client made, so the stale cache is dropped when the synced
// document lands. THE KEY FILTER IS LOAD-BEARING — `updateActor` also fires on every HP tick.
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

// GM-only discoverability: a config button on a placeable's HUD when it is a linked interactable
// visual, resolving the owning behaviour from the reverse linked-visual flags. The thin edge the
// Tile and Token HUDs share; it NEVER touches a token's actor.
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
// is VALID-but-UNCONFIGURED since #342, so the create is ALLOWED, the sentinel is stamped and the
// behaviour is born inert. AN INHERITED MARKER LINK IS NEUTRALISED HERE, region duplication cloning
// `linkedVisual` verbatim. The thin no-throw edge; it never touches a non-interactable subtype.
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
 * Stamp the unconfigured sentinel onto any identity field the empty-system instantiation left
 * empty. `updateSource` is the V13 preCreate seam — a preCreate hook mutates the source in place.
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

/**
 * A freshly-created interactable NEVER inherits another's marker link, the region-duplication case.
 * The pure neutralisation helper is type-agnostic, so the caller gates it.
 */
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
 * System-agnostic crafting button integration
 * Add Craft button to Items Directory sidebar (works with all game systems)
 */

/**
 * Add the Craft button to Items Directory header
 * Inject when an element exists; ready can precede the sidebar's first render.
 * The renderItemDirectory hook retries for each rendered sidebar or popout instance.
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
 * auto-stamps populate the tier-1 `roles` identity `sourceUuid.js` resolves against before any name
 * fallback, and the listed ORDER is load-bearing. Exported as a BLOCK because several tests assert
 * on the literal source text of these functions.
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
