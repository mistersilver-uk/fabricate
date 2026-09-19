import { getFabricateFlag, setFabricateFlag, stampItemDataRoleIdentity } from '../config/flags.js';
import {
  isToolBroken,
  resolvePresentComponentIds,
  resolvePresentToolIds,
} from '../gatheringToolRuntime.js';
import { getMatchHandler } from '../models/match/matchTypes.js';
import { Tool } from '../models/Tool.js';
import {
  TOOL_IMAGE_SENTINEL,
  resolveToolDisplayImage,
  resolveToolDisplayName,
} from '../models/toolDisplay.js';
import {
  applyToolUsageAndBreakage,
  createToolReplacementCreator,
  evaluateCheckBreakage,
} from '../toolBreakageRuntime.js';
import { buildCraftingChatContent } from '../ui/presenters/CraftingChatCard.js';
import { buildSalvageChatContent } from '../ui/presenters/SalvageChatCard.js';
import { buildInteractiveRollOptions } from '../ui/svelte/apps/crafting/rollPrompt.js';
import { resolveRecipeImage } from '../ui/svelte/util/craftingImageDefaults.js';
import { canonicalSignatureKey } from '../utils/alchemySignatureKey.js';
import { resolveAlchemySubmissionComponent } from '../utils/alchemySubmissions.js';
import { planComplications, publicComplications } from '../utils/complicationPlan.js';
import { matchComponentByName } from '../utils/componentNameMatch.js';
import { hasPlainD20, stripRetiredModifierPlaceholder } from '../utils/craftingCheckExpression.js';
import { findById, getDefinitionIndex } from '../utils/definitionIndex.js';
import {
  accumulateSubmissionEssences,
  findMatchingComponent,
  resolveItemEssences,
} from '../utils/essenceResolver.js';
import { activityPermitsFailureResults } from '../utils/failureResultPolicy.js';
import { MacroExecutor } from '../utils/MacroExecutor.js';
import { resolveProgressiveAward } from '../utils/progressiveAward.js';
import { applyPlayerResultOrder } from '../utils/progressiveResultOrder.js';
import { diceEngine } from '../utils/rollFormulaRollability.js';
import { itemResolvesToComponent } from '../utils/sourceUuid.js';

import { evaluatePrerequisite } from './characterPrerequisites.js';
import {
  buildCheckModifierChoice,
  buildCheckModifierContext,
  makeRollDataExpressionResolver,
  resolveActiveCraftingCheckFormula,
  resolveModifierPolicy,
} from './checkModifierResolver.js';
import { runFormulaPassFail, runFormulaProgressive, runFormulaRouted } from './checkRoll.js';
import { fireComplications } from './complicationRuntime.js';
import { createOrStackComponentItem } from './componentStacking.js';
import {
  rollTotalForCard,
  tierStepForCard,
  VERSIONED_EXECUTION_CONTEXT,
} from './craftCardFields.js';
import { CraftingFizzleExecutor } from './CraftingFizzleExecutor.js';
import {
  CraftingLifecycleExecutionError,
  CraftingLifecycleExecutor,
} from './CraftingLifecycleExecutor.js';
import { craftingStepHistoryEvidence } from './CraftingRunManager.js';
import {
  commitCraft,
  continueCollapsedChain,
  openCraftStep,
  publishCraftSuccess,
  resolveCheckFailure,
  resolveCraftInputs,
  resolveModeValidationFailure,
  routeAlchemySimpleFailure,
  routeGatedExecution,
  runAffordGates,
  runCraftCheck,
  runResolutionPreflight,
} from './craftPipeline.js';
import {
  buildCurrencyAffordProbe,
  checkCurrencySpends,
  CURRENCY_SETUP_INCOMPLETE_MESSAGE,
  getCurrencyRequirementConfig,
  refundCurrencySpends,
  resolveCurrencyContext,
  spendCurrencySpends,
} from './currencyAffordance.js';
import { formatCurrencyRequirement, normalizeCurrencyUnit } from './currencyProfile.js';
import {
  hasStackQuantity,
  readStackQuantity,
  readStoredStackQuantity,
  setStackQuantity,
  itemStackQuantityPath,
  updateStackQuantity,
} from './itemStackQuantity.js';
import { planFirstFitDrain, pooledItemOrder } from './pooledAllocation.js';
import { resolveCheckTriggerMatches } from './ResolutionModeService.js';
import { resolveRolledAmount, rolledAwardRecord } from './rolledAmountResolver.js';
import { getCommittedExecutionOutcome, observeExecutionJournal } from './runExecutionJournal.js';
import {
  attachAwardReceipts,
  attachRolledAwards,
  awardReceipts,
  createItemReceiptCollector,
  itemReceipt,
  mapConsumedIngredientRef,
  sourceItemQuantity,
  receiptQuantity,
  requireDocumentAcknowledgment,
  unconfirmedHistoryError,
  linkResultGroups,
  assertNativeEffectsUninvoked,
} from './runHistoryEvidence.js';
import { getRunLifecycleContract } from './runLifecycleState.js';
import { resolveSalvageCheck } from './salvageCheckUsability.js';
import {
  beginSalvageSettlement,
  commitSalvage,
  fireSalvageComplications,
  openSalvageRun,
  publishSalvageFailure,
  publishSalvageSuccess,
  resolveSalvageFailure,
  resolveSalvageRunRecord,
  runSalvageCheck,
  salvageRefusal,
  validateSalvageTools,
} from './salvagePipeline.js';
import {
  resolvedComponentsFor,
  resolvedEssencesFor,
  resolvedToolsFor,
} from './scopedEntityReads.js';
import { SignatureValidator, signatureDominates } from './SignatureValidator.js';
import {
  STAGE_BLOCKERS,
  classifyStageReadiness,
  scopedEssenceAllocation,
  selectedIngredientItems,
  stageSelectionInputsComplete,
} from './stageReadiness.js';
import { buildStepRecipeView } from './stepRecipeView.js';
import { effectiveToolBreakageAuthority } from './toolBreakageAuthority.js';
import {
  appendToolBonusTerms,
  composeToolBonusTerms,
  evaluateToolCheckContribution,
} from './toolCheckBonus.js';

/** Resolve the winning alchemy match by picking the unique MOST-SPECIFIC set (issue 774) — the
 * unique maximum of the {@link signatureDominates} partial order. No unique maximum FAILS SAFE
 * to no-match, so the caller fizzles rather than brewing one by iteration order. */
export function resolveMostSpecificSignatureMatch(candidates) {
  if (!Array.isArray(candidates) || candidates.length === 0) return { matched: false };
  const pick = (candidate) => ({
    matched: true,
    recipe: candidate.recipe,
    ingredientSetId: candidate.ingredientSetId,
  });
  if (candidates.length === 1) return pick(candidates[0]);

  // The maximal candidates: those no other candidate strictly dominates. With a
  // transitive domination relation, exactly one maximal element IS the unique
  // maximum (the greatest); two or more means an incomparable tie → fail safe.
  const maximal = candidates.filter((candidate) =>
    candidates.every((other) => other === candidate || !signatureDominates(other, candidate))
  );
  return maximal.length === 1 ? pick(maximal[0]) : { matched: false };
}

/** A human-readable reference for a Tool in a missing-tool diagnostic (issue 777): the tool's
 * `label`/`name`, then the resolved managed-component name, and only then the raw component id. */
function toolDisplayReference(tool, recipe = null, recipeManager = null) {
  const name = tool?.label || tool?.name;
  if (name) return name;
  const componentId = tool?.componentId;
  const resolved = recipeManager?.resolveComponentName?.(recipe, componentId);
  if (resolved) return resolved;
  return componentId || tool?.id || 'unknown';
}

/** What a card states about the rolled amounts an awarded array carries (issue 1645): the live
 * rolls the message rides on, and the empty awards that created no item and so are their own row. */
function rolledAwardChatParts(awarded) {
  const awards = awarded?.rolledAwards ?? [];
  return {
    rolls: awards.map((award) => award.roll).filter(Boolean),
    emptyAwards: awards.filter((award) => award.quantity === 0),
  };
}

/** One award's rolled-amount evidence (issue 1645): the persistable record, plus the live `Roll` and
 * display fields only the chat card reads — an empty award has no item, so this row states its roll. */
const rolledAwardEvidence = (result, rolled, amount, roll, { name, img }) => ({
  ...rolledAwardRecord(result, rolled, amount),
  rolled,
  roll,
  name,
  img,
});

function addHistoricalEssenceContribution(carriers, essenceId, source) {
  const carrier = carriers.get(JSON.stringify([source.actorUuid, source.itemUuid]));
  if (!carrier) return;
  const prior = carrier.contributions.find((entry) => entry.essenceId === essenceId);
  if (prior) prior.amount += source.essenceTotal;
  else carrier.contributions.push({ essenceId, amount: source.essenceTotal });
}

/** Resolve the still-live inventory documents named by persisted Item UUIDs. Timed FINISH uses
 * them as Tool exclusions, because a partially consumed stack remains in inventory after START. */
function resolveLiveInventoryItemsByUuid(actors, itemUuids) {
  const uuidSet = itemUuids instanceof Set ? itemUuids : new Set(itemUuids);
  return new Set(
    (Array.isArray(actors) ? actors : [])
      .flatMap((actor) => [...(actor?.items ?? [])])
      .filter((item) => item?.uuid && uuidSet.has(item.uuid))
  );
}

/** Stamp the durable per-system component identity on a crafted OUTPUT item's data, BEFORE
 * creation, so the inventory matcher attributes it to its OWN component despite naming
 * collisions or Foundry's transitive `_stats.duplicateSource` chain (issue 539). Delegates to
 * the shared {@link stampItemDataRoleIdentity} writer so the four creation sites cannot drift. */
function stampCraftedComponentIdentity(itemData, systemId, componentId) {
  stampItemDataRoleIdentity(itemData, systemId, 'componentId', componentId);
}

/** Re-shape a progressive resolution's published `meta` into the award report
 * {@link planComplications} classifies stages against (issue 1286). A RENAME and nothing more. */
function awardFromResolutionMeta(meta) {
  return {
    awarded: Array.isArray(meta?.awardedResultIds) ? meta.awardedResultIds : [],
    remaining: Number(meta?.remaining ?? 0),
    partialResult: meta?.partialResultId ?? null,
    haltedResult: meta?.haltedResultId ?? null,
    skippedResults: Array.isArray(meta?.skippedResultIds) ? meta.skippedResultIds : [],
  };
}

/** Handles the actual crafting process Validates ingredients, consumes items, creates outputs */
export class CraftingEngine {
  constructor(
    recipeManager,
    craftingRunManager = null,
    resolutionModeService = null,
    itemPilesIntegration = null,
    salvageRunManager = null,
    actorInventoryCoinSpender = null,
    actorPropertyCoinSpender = null,
    // 8th positional options bag — additive, so existing call sites are unaffected.
    // `getPlayerResultOrder` is read ONCE at run start and captured onto the run record (issue
    // 651 D2). Deliberately NOT routed through `resolutionModeService`, which many callers omit.
    {
      getPlayerResultOrder = () => null,
      getCraftingSystem = () => null,
      resolveItemUuid = async () => null,
      // The world currency configuration (issue 1278). Optional: when absent, the shared
      // affordance resolver falls back to the `game.fabricate` global, which keeps every
      // existing construction site — production and fixture alike — working unchanged.
      currencyConfigStore = null,
    } = {}
  ) {
    this.recipeManager = recipeManager;
    this.craftingRunManager = craftingRunManager;
    this.resolutionModeService = resolutionModeService;
    this.itemPilesIntegration = itemPilesIntegration;
    this.salvageRunManager = salvageRunManager;
    // Stubbable spend seams: the actorInventory spender is injected by tests (and wired in
    // main.js) so they can assert which path ran; the actorProperty spender defaults to the
    // generic implementation. Both flow to the shared currency-affordance resolver.
    this.actorInventoryCoinSpender = actorInventoryCoinSpender;
    this.actorPropertyCoinSpender = actorPropertyCoinSpender;
    this.currencyConfigStore = currencyConfigStore;
    this.getPlayerResultOrder = getPlayerResultOrder;
    this.getCraftingSystem = getCraftingSystem;
    this.resolveItemUuid = resolveItemUuid;
    // Declared here, installed post-construction (issue 1286). See `installComplicationDelivery`
    // for why, and `_complicationWriter` for the ambient fallback.
    this.complicationDeliveryWriter = null;
    this.versionedRunAuthority = null;
  }

  installVersionedRunAuthority(authority = null) {
    this.versionedRunAuthority = authority && typeof authority === 'object' ? authority : null;
    return this;
  }

  async processVersionedWorldTime({ worldTime = Number(game.time?.worldTime || 0) } = {}) {
    const requestExecute = this.versionedRunAuthority?.requestExecute;
    if (typeof requestExecute !== 'function') return [];
    const candidates = this._craftingRunManager()?.listDueVersionedRuns?.(worldTime) ?? [];
    const results = [];
    for (const candidate of candidates) {
      let expectedRevision = candidate.expectedRevision;
      const maximumAttempts = Math.max(1, Number(candidate.maximumAttempts) || 1);
      for (let attempt = 0; attempt < maximumAttempts; attempt += 1) {
        const result = await requestExecute({
          actor: candidate.actor,
          runId: candidate.runId,
          expectedRevision,
          componentSourceActorUuids: candidate.componentSourceActorUuids,
          trigger: 'worldTime',
        });
        results.push(result);
        const nextRevision = Number(result?.runRevision);
        if (
          result?.success !== true ||
          result?.terminal === true ||
          result?.status !== 'inProgress' ||
          !Number.isSafeInteger(nextRevision) ||
          nextRevision <= Number(expectedRevision)
        ) {
          break;
        }
        expectedRevision = nextRevision;
      }
    }
    return results;
  }

  async describeVersionedStageCheck({
    actor,
    componentSourceActors,
    runId,
    selectionPlan = null,
    preparationGrant,
    requestId,
  }) {
    await this._consumeVersionedGrant(preparationGrant, {
      operation: 'describeCheck',
      actor,
      runId,
      expectedRevision: null,
      requestId,
    });
    const runManager = this._craftingRunManager();
    runManager?.invalidateCache?.(actor?.id);
    const run = runManager?.getActiveRun?.(actor, runId) ?? null;
    if (!run || getRunLifecycleContract(run) !== 'current' || run.pauseState) {
      throw new CraftingLifecycleExecutionError(
        'The crafting stage is not available for a check',
        'STAGE_NOT_EXECUTABLE'
      );
    }
    const recipe = this.recipeManager?.getRecipe?.(run.recipeId) ?? null;
    const stepIndex = Number(run.currentStepIndex);
    const step = this._executionSteps(recipe)[stepIndex];
    const lockedSelection = this._lockedStageSelection(run, stepIndex, selectionPlan);
    const selectedSet = this._selectedIngredientSet(step, lockedSelection.selectedIngredientSetId);
    if (!recipe || !step || !selectedSet) {
      throw new CraftingLifecycleExecutionError(
        'The crafting stage references are stale',
        'STALE_RUN_STAGE'
      );
    }
    // A check is describable only once EVERY other stage requirement is met, elapsed time
    // included. The UI withholds the roll for the same reason; this is its backstop.
    if (!this._versionedStageRollable({ run, recipe, step, stepIndex })) {
      throw new CraftingLifecycleExecutionError(
        'The crafting stage is not available for a check',
        'STAGE_NOT_EXECUTABLE'
      );
    }
    const system = this._getRecipeSystem(recipe);
    const activeCheck = resolveActiveCraftingCheckFormula(system);
    const prepared = await this._versionedStagePreparation({
      started: this._versionedStageStarted(run, stepIndex),
      run,
      actor,
      componentSourceActors,
      recipe,
      step,
      stepIndex,
      selectedSet,
      selectionPlan: lockedSelection,
    });
    if (!prepared.valid) {
      throw new CraftingLifecycleExecutionError(
        prepared.message || 'The crafting stage inputs are stale',
        'STALE_RUN_STAGE'
      );
    }
    const rollFormula = await this._appendToolCheckBonuses(
      activeCheck.rollFormula,
      prepared.toolItems
    );
    const modifierContext = buildCheckModifierContext(system, 'crafting', recipe);
    const modifierChoice = this._buildInteractiveModifierChoice(
      rollFormula,
      modifierContext,
      actor,
      true
    );
    const dc =
      activeCheck.slot && activeCheck.slot !== 'progressive'
        ? await this._resolveSimpleCheckDc(system, activeCheck.config, recipe, selectedSet, actor)
        : null;
    const dcLabel = Number.isFinite(dc) ? ` (DC ${dc})` : '';
    const flavor = `${recipe.name ? `${recipe.name} — ` : ''}Crafting check${dcLabel}`;
    const speaker = cloneJsonValue(globalThis.ChatMessage?.getSpeaker?.({ actor })) ?? null;
    return {
      required: activeCheck.checkUsable || activeCheck.requiresCheck,
      publicPrompt: {
        label: recipe.name || step.name || 'Crafting',
        mode: activeCheck.mode,
        allowsSituationalModifier: activeCheck.checkUsable,
        allowAdvantage: hasPlainD20(activeCheck.rollFormula),
        modifierChoice,
      },
      privateEvaluation: {
        actorUuid: actor?.uuid ?? null,
        flavor,
        speaker,
        componentSourceActorUuids: (componentSourceActors || [])
          .map((source) => source?.uuid)
          .filter(Boolean),
        recipeId: recipe.id,
        stepIndex,
        stepId: step.id ?? null,
        selectedIngredientSetId: selectedSet.id,
        mode: activeCheck.mode,
        slot: activeCheck.slot,
        rollFormula,
        checkConfig: cloneJsonValue(activeCheck.config) ?? null,
        decisionPolicy: {
          dc: Number.isFinite(dc) ? dc : null,
          thresholdMode: activeCheck.config?.thresholdMode ?? null,
          type: activeCheck.config?.type ?? null,
          relativeOutcomes: cloneJsonValue(activeCheck.config?.relativeOutcomes) ?? [],
          fixedOutcomes: cloneJsonValue(activeCheck.config?.fixedOutcomes) ?? [],
          clampToNearest: activeCheck.slot === 'routed',
          minOutcomeId:
            activeCheck.mode === 'routedByCheck' ? (recipe.minSuccessOutcomeId ?? null) : null,
        },
      },
    };
  }

  async prepareVersionedAlchemyStart({
    actor,
    sourceActors,
    craftingSystemId,
    submittedItems,
    executionGrant,
    requestId,
  }) {
    await this._consumeVersionedGrant(executionGrant, {
      operation: 'prepareAlchemyStart',
      actor,
      runId: null,
      expectedRevision: null,
      requestId,
    });
    if (!actor || !Array.isArray(sourceActors) || sourceActors.length === 0) {
      return versionedFailure('The crafting actor and component sources are required.');
    }
    if (!Array.isArray(submittedItems) || submittedItems.length === 0) {
      return versionedFailure('No ingredients submitted.');
    }
    const sourceUuids = new Set(sourceActors.map((source) => source?.uuid).filter(Boolean));
    if (
      submittedItems.some(
        (entry) =>
          !entry?.item ||
          !entry?.componentId ||
          !entry.item.uuid ||
          !sourceUuids.has(entry.item.parent?.uuid)
      )
    ) {
      return versionedFailure('The submitted alchemy ingredients are stale.');
    }

    const systemManager = game.fabricate?.getCraftingSystemManager?.();
    const system = systemManager?.getSystem?.(craftingSystemId) ?? null;
    if (!system || system.resolutionMode !== 'alchemy') {
      return versionedFailure('No alchemy-mode crafting system found.');
    }
    const recipeManager = this.recipeManager || game.fabricate?.getRecipeManager?.();
    const recipes = recipeManager?.getRecipes?.({ craftingSystemId, enabled: true }) ?? [];
    const components = resolvedComponentsFor(system);
    const signatureValidator = new SignatureValidator({
      getSystem: (id) => systemManager.getSystem(id),
      getRecipesForSystem: (id) =>
        recipeManager?.getRecipes?.({ craftingSystemId: id, enabled: true }) ?? [],
      getComponentsForSystem: (id) => resolvedComponentsFor(systemManager.getSystem(id)),
    });
    const matchResult = this._matchAlchemySignature(
      submittedItems,
      recipes,
      components,
      signatureValidator,
      { system }
    );
    const submittedItemUuids = submittedItems.map((entry) => entry.item.uuid);
    if (!matchResult.matched) {
      return {
        success: true,
        matched: false,
        activityKind: 'alchemy',
        craftingSystemId,
        consumeOnFail: system.alchemy?.consumeOnFail !== false,
        submittedItemUuids,
      };
    }
    return {
      success: true,
      matched: true,
      activityKind: 'alchemy',
      recipeId: matchResult.recipe.id,
      selectionPlan: { selectedIngredientSetId: matchResult.ingredientSetId },
      submittedItemUuids,
    };
  }

  async executeVersionedAlchemyFizzle({
    viewer,
    actor,
    sourceActors,
    craftingSystemId,
    submittedItems,
    executionGrant,
    requestId,
  }) {
    this._assertAlchemySubmissionDocuments(actor, sourceActors, submittedItems);
    const runManager = this._craftingRunManager();
    if (!runManager) return versionedFailure('Crafting runs are not available.');
    let current = null;
    const executor = new CraftingFizzleExecutor({
      runManager,
      consumeExecutionGrant: (...args) =>
        this.versionedRunAuthority?.consumeExecutionGrant?.(...args),
    });
    const execution = await executor.execute({
      actor,
      requestId,
      executionGrant,
      details: {
        craftingSystemId,
        userId: viewer?.id ?? null,
        componentSourceActorUuids: sourceActors.map((source) => source.uuid),
      },
      validateTrusted: () => {
        current = this._resolveVersionedAlchemyMatch(craftingSystemId, submittedItems);
        if (current.matchResult.matched) {
          throw new CraftingLifecycleExecutionError(
            'The alchemy submission now matches a recipe',
            'ALCHEMY_MATCH_CHANGED'
          );
        }
        this._assertAlchemySubmissionStock(sourceActors, submittedItems);
      },
      effects: () => {
        const deadEndKey = canonicalSignatureKey(this._submittedComponentMultiset(submittedItems));
        const effects = [
          {
            effectId: 'record-dead-end',
            kind: 'recordAlchemyDeadEnd',
            planned: { craftingSystemId },
            apply: async () => {
              const before = this._hasAlchemyDeadEnd(actor, craftingSystemId, deadEndKey);
              await this._recordAlchemyDeadEnd(
                actor,
                craftingSystemId,
                submittedItems,
                current.system.alchemy || {}
              );
              return {
                recorded: !before && this._hasAlchemyDeadEnd(actor, craftingSystemId, deadEndKey),
              };
            },
          },
        ];
        if (current.system.alchemy?.consumeOnFail !== false) {
          effects.push({
            effectId: 'consume-submissions',
            kind: 'consumeAlchemyItems',
            planned: submittedItems.map((entry) => ({
              itemUuid: entry.item.uuid,
              componentId: entry.componentId,
              quantity: 1,
            })),
            apply: async () => ({
              items: await this._consumeVersionedAlchemySubmission(sourceActors, submittedItems),
            }),
          });
        }
        effects.push({
          effectId: 'award-results',
          kind: 'awardResults',
          planned: [],
          apply: async () => ({ results: [] }),
        });
        return this._captureVersionedEffectPrefixes(effects, actor);
      },
      outcome: () => ({
        success: false,
        disposition: 'no-match',
        consumed: current.system.alchemy?.consumeOnFail !== false,
      }),
    });
    return versionedTransitionResult(execution.run, execution.outcome);
  }

  async startVersionedRun({
    viewer,
    actor,
    sourceActors,
    recipeId,
    selectionPlan = {},
    completionMode = 'manual',
    executionGrant,
    requestId,
  }) {
    const trusted = await this._consumeVersionedGrant(executionGrant, {
      operation: 'start',
      actor,
      runId: null,
      expectedRevision: null,
      requestId,
    });
    const runManager = this._craftingRunManager();
    const recipe = this.recipeManager?.getRecipe?.(recipeId) ?? null;
    const refusal = this._versionedRunStartRefusal({
      viewer,
      actor,
      sourceActors,
      recipe,
      trusted,
      runManager,
    });
    if (refusal) return refusal;

    const run = await runManager.createRun(actor, recipe, sourceActors, viewer?.id ?? null, {
      lifecycleVersion: 1,
      completionMode,
    });
    const planned = await this._planFirstVersionedStage({
      actor,
      viewer,
      sourceActors,
      recipe,
      run,
      selectionPlan,
    });
    if (!planned.valid) return versionedFailure(planned.message);
    const { stepIndex, step, selectedSet, historySnapshots, stagePlan } = planned;
    let current = planned.run;
    let opened;
    try {
      opened = await this._startFirstVersionedStage({
        actor,
        sourceActors,
        run: current,
        recipe,
        step,
        stepIndex,
        selectedSet,
        selectionPlan: stagePlan,
        historySnapshots,
        trusted,
        requestId,
      });
    } catch (error) {
      // A THROW is a refusal too, and the run this call created must not outlive it. Without the
      // discard the run stayed active carrying a `recoveryRequired` journal, which makes every
      // control false — cancel included — so nothing could clear it (issue 1648, F1).
      return this._discardFailedVersionedStart(actor, run.id, error);
    }
    if (!opened.success) {
      await runManager.discardRun(actor, run.id);
      return versionedFailure(opened.message);
    }
    current = opened.run;
    const canExecuteImmediately = await this._canExecuteVersionedStageImmediately({
      run: current,
      actor,
      componentSourceActors: sourceActors,
      recipe,
      step,
      selectedSet,
    });
    return {
      ...versionedTransitionResult(current, { success: true, disposition: 'started' }),
      started: true,
      requiresExecution: current.status !== 'waitingTime',
      canExecuteImmediately,
    };
  }

  /** Resolve the first stage, persist its plan, and answer the run that carries it. A run whose
   * first stage or requirement set cannot be resolved is discarded rather than left active. */
  async _planFirstVersionedStage({ actor, viewer, sourceActors, recipe, run, selectionPlan }) {
    const runManager = this._craftingRunManager();
    const stepIndex = Number(run.currentStepIndex) || 0;
    const step = this._executionSteps(recipe)[stepIndex];
    const selectedSet = this._selectedIngredientSet(step, selectionPlan.selectedIngredientSetId);
    if (!step || !selectedSet) {
      await runManager.discardRun(actor, run.id);
      return { valid: false, message: 'The selected crafting requirements are unavailable.' };
    }
    const historySnapshots = this._stageHistorySnapshots({
      recipe,
      step,
      actor,
      viewer,
      sourceActors,
    });
    const stagePlan = {
      selectedIngredientSetId: selectedSet.id,
      ingredientOptionOverrides: selectionPlan.ingredientOptionOverrides,
      ingredientEssenceAllocation: selectionPlan.ingredientEssenceAllocation,
    };
    const current = await runManager.setStepSelectionPlan(
      actor,
      run.id,
      stepIndex,
      {
        ...stagePlan,
        selectedRequirementSnapshot: snapshotRequirementSet(selectedSet),
        ...historySnapshots,
      },
      { expectedRevision: run.runRevision }
    );
    return { valid: true, run: current, stepIndex, step, selectedSet, historySnapshots, stagePlan };
  }

  /** Discard the run a failed start created, and answer the refusal its caller returns. A start
   * that left NO evidence wrote nothing; one that did keeps its run and rethrows. */
  async _discardFailedVersionedStart(actor, runId, error) {
    const discarded = await this._craftingRunManager().discardUnappliedRun(actor, runId);
    if (!discarded) throw error;
    return versionedFailure(error?.message || 'The crafting stage could not be started.');
  }

  /** Why a versioned run may not start: a missing recipe or actor, a viewer the recipe is not
   * craftable for, or an invalid recipe. A grant-attested alchemy match bypasses the visibility
   * guard. `null` when the run may start. */
  _versionedRunStartRefusal({ viewer, actor, sourceActors, recipe, trusted, runManager }) {
    if (!runManager || !recipe) return versionedFailure('The crafting recipe is unavailable.');
    if (!actor || !Array.isArray(sourceActors) || sourceActors.length === 0) {
      return versionedFailure('The crafting actor and component sources are required.');
    }
    const trustedAlchemyMatch =
      trusted?.matched === true &&
      trusted?.activityKind === 'alchemy' &&
      String(trusted?.recipeId ?? '') === String(recipe.id);
    if (!trustedAlchemyMatch) {
      const visibilityService = game.fabricate?.getRecipeVisibilityService?.();
      const guard =
        viewer && typeof visibilityService?.guardCraftStart === 'function'
          ? visibilityService.guardCraftStart({
              viewer,
              recipe,
              craftingActor: actor,
              componentSourceActors: sourceActors,
            })
          : null;
      if (guard?.craftable !== true) return versionedFailure('Crafting is unavailable.');
    }
    const validation = recipe.validate?.({ Roll: diceEngine() }) ?? { valid: true, errors: [] };
    if (validation.valid) return null;
    return versionedFailure(`Invalid recipe: ${(validation.errors || []).join(', ')}`);
  }

  /** D-026/D-028: for the first stage, run start IS stage start, so the choice locks and the
   * materials are spent here. EVERY first stage commits, the untimed one included (issue 1648,
   * M24), and the gate is armed from the EFFECTIVE duration. */
  async _startFirstVersionedStage({ sourceActors, run, recipe, step, ...commit }) {
    const seconds = this._craftingRunManager().durationToSeconds(step.timeRequirement);
    return this._commitVersionedStageStart({
      ...commit,
      componentSourceActors: sourceActors,
      run,
      recipe,
      step,
      requiredSeconds: this._timeRequirementsEnabled(recipe) ? seconds : 0,
    });
  }

  /** Begin the current versioned stage: lock its choice, spend its materials and start its clock,
   * in one act. Nothing else does any of the three, and none can be redone (D-026, D-028). */
  async beginVersionedStage({
    viewer = null,
    actor,
    componentSourceActors,
    runId,
    expectedRevision,
    selectionPlan = null,
    executionGrant,
    requestId,
  }) {
    const trusted = await this._consumeVersionedGrant(executionGrant, {
      operation: 'beginStep',
      actor,
      runId,
      expectedRevision,
      requestId,
    });
    const runManager = this._craftingRunManager();
    if (!runManager) return versionedFailure('Crafting runs are not available.');
    runManager.invalidateCache?.(actor?.id);
    const run = runManager.getActiveRun?.(actor, runId) ?? null;
    if (!run) return versionedFailure('There is no in-progress craft to begin.');
    if (getRunLifecycleContract(run) !== 'current') {
      return versionedFailure('The crafting run lifecycle version is unsupported.');
    }
    if (Number(expectedRevision) !== Number(run.runRevision)) {
      throw new CraftingLifecycleExecutionError(
        'The crafting run revision is stale',
        'STALE_RUN_REVISION'
      );
    }
    const recipe = this.recipeManager?.getRecipe?.(run.recipeId) ?? null;
    if (!recipe) return versionedFailure('The crafting recipe is unavailable.');
    const stepIndex = Number(run.currentStepIndex);
    const step = this._executionSteps(recipe)[stepIndex];
    if (!step) return versionedFailure('There is no active crafting step available.');
    if (
      this._versionedStageStarted(run, stepIndex) ||
      this._versionedStageArmedBeforeStartCommit(run, stepIndex)
    ) {
      return versionedFailure('This crafting stage has already started.');
    }
    if (!this._versionedStageNeedsStart(recipe, step)) {
      return versionedFailure('This crafting stage has no separate start.');
    }
    const selection = this._lockedStageSelection(run, stepIndex, selectionPlan);
    const selectedSet = this._selectedIngredientSet(step, selection.selectedIngredientSetId);
    if (!selectedSet) {
      return versionedFailure('The selected crafting requirements are unavailable.');
    }
    const committed = await this._commitVersionedStageStart({
      actor,
      componentSourceActors,
      run,
      recipe,
      step,
      stepIndex,
      selectedSet,
      selectionPlan: selection,
      historySnapshots: this._stageHistorySnapshots({
        recipe,
        step,
        actor,
        viewer: game.users?.get?.(run.userId) ?? (viewer?.id === run.userId ? viewer : null),
        sourceActors: componentSourceActors,
      }),
      requiredSeconds: runManager.durationToSeconds(step.timeRequirement),
      trusted,
      requestId,
    });
    if (!committed.success) return versionedFailure(committed.message);
    return {
      ...versionedTransitionResult(committed.run, { success: true, disposition: 'started' }),
      started: true,
      requiresExecution: false,
    };
  }

  /** The automatic advance's own stage start. A `worldTime` execute reaching an unstarted stage
   * begins it, because no player is present to press a button; a manual execute never does. */
  async _startVersionedStageOnExecute({
    actor,
    componentSourceActors,
    run,
    recipe,
    step,
    stepIndex,
    selectedSet,
    selectionPlan,
    historySnapshots,
    executionGrant,
    expectedRevision,
    requestId,
  }) {
    const trusted = await this._consumeVersionedGrant(executionGrant, {
      operation: 'execute',
      actor,
      runId: run.id,
      expectedRevision,
      requestId,
    });
    const committed = await this._commitVersionedStageStart({
      actor,
      componentSourceActors,
      run,
      recipe,
      step,
      stepIndex,
      selectedSet,
      selectionPlan,
      historySnapshots,
      requiredSeconds: this._craftingRunManager().durationToSeconds(step.timeRequirement),
      trusted,
      requestId,
    });
    if (!committed.success) return versionedFailure(committed.message);
    return {
      ...versionedTransitionResult(committed.run, { success: true, disposition: 'time-armed' }),
      started: true,
      requiresExecution: false,
    };
  }

  async executeVersionedStage({
    viewer = null,
    actor,
    componentSourceActors,
    runId,
    expectedRevision,
    selectionPlan = null,
    executionGrant,
    requestId,
    trigger = 'manual',
  }) {
    const runManager = this._craftingRunManager();
    if (!runManager) return versionedFailure('Crafting runs are not available.');
    runManager.invalidateCache?.(actor?.id);
    const persisted = runManager.getRun?.(actor, runId) ?? null;
    const committed = persisted?.executionJournal
      ? getCommittedExecutionOutcome(persisted.executionJournal, requestId)
      : null;
    if (committed) {
      const duplicateExecutor = new CraftingLifecycleExecutor({
        runManager,
        consumeExecutionGrant: (...args) =>
          this.versionedRunAuthority?.consumeExecutionGrant?.(...args),
      });
      const duplicate = await duplicateExecutor.execute({
        actor,
        runId,
        expectedRevision,
        requestId,
        executionGrant,
        operation: null,
      });
      return versionedTransitionResult(duplicate.run, duplicate.outcome);
    }
    const journal = persisted?.executionJournal
      ? observeExecutionJournal(persisted.executionJournal)
      : null;
    const resuming =
      journal?.status === 'planned' &&
      journal.requestId === String(requestId ?? '').trim() &&
      journal.effects.every((effect) => effect.phase !== 'applying');
    const run = resuming ? persisted : runManager.getActiveRun(actor, runId);
    if (!run) return versionedFailure('There is no in-progress craft to execute.');
    const recipe = this.recipeManager?.getRecipe?.(run.recipeId) ?? null;
    if (!recipe) return versionedFailure('The crafting recipe is unavailable.');
    const stepIndex = resuming ? Number(journal.intent?.stepIndex) : Number(run.currentStepIndex);
    const step = this._executionSteps(recipe)[stepIndex];
    if (!step) return versionedFailure('There is no active crafting step available.');
    // Timed/GM execution is on behalf of the recorded initiator. Never substitute
    // the elected GM's ambient visibility for that user's entitlement.
    const historyViewer =
      game.users?.get?.(run.userId) ?? (viewer?.id === run.userId ? viewer : null);
    const permittedSnapshots = this._stageHistorySnapshots({
      recipe,
      step,
      actor,
      viewer: historyViewer,
      sourceActors: componentSourceActors,
    });
    const historySnapshots =
      resuming && permittedSnapshots.resolutionSnapshot
        ? craftingStepHistoryEvidence(run.steps?.[stepIndex])
        : permittedSnapshots;
    const persistedSelection = this._lockedStageSelection(run, stepIndex, selectionPlan);
    const selectedSet = this._selectedIngredientSet(
      step,
      persistedSelection.selectedIngredientSetId
    );
    if (!selectedSet)
      return versionedFailure('The selected crafting requirements are unavailable.');
    const started = this._versionedStageStarted(run, stepIndex);
    // A stage armed before the start commit has TAKEN its start, so it is not startable: asking
    // only `_versionedStageStarted` here deadlocked it against begin's own "already started"
    // refusal. The other three readers already ask the compatibility-aware question.
    const startable = !started && !this._versionedStageArmedBeforeStartCommit(run, stepIndex);
    if (!resuming && startable && this._versionedStageNeedsStart(recipe, step)) {
      if (trigger !== 'worldTime') {
        return versionedFailure('Begin this crafting stage before it can be resolved.');
      }
      // D-010 is retained: a conservative automatic advance decides BEFORE it spends, so
      // an unattended stage it cannot resolve is never started and never consumes.
      const blocker = this._automaticStageBlocker(run, recipe, step, selectedSet);
      if (blocker) {
        return {
          ...versionedFailure(blocker.message),
          automaticBlocked: true,
          blocker: blocker.code,
        };
      }
      return this._startVersionedStageOnExecute({
        actor,
        componentSourceActors,
        run,
        recipe,
        step,
        stepIndex,
        selectedSet,
        selectionPlan: persistedSelection,
        historySnapshots,
        executionGrant,
        expectedRevision,
        requestId,
      });
    }
    if (!resuming && !this._versionedStageRollable({ run, recipe, step, stepIndex })) {
      return versionedFailure('The crafting step is still in progress.');
    }
    if (!resuming && trigger === 'worldTime') {
      const blocker = this._automaticStageBlocker(run, recipe, step, selectedSet);
      if (blocker) {
        return {
          ...versionedFailure(blocker.message),
          automaticBlocked: true,
          blocker: blocker.code,
        };
      }
    }
    const prepared = await this._versionedStagePreparation({
      resuming,
      started,
      run,
      actor,
      componentSourceActors,
      recipe,
      step,
      stepIndex,
      selectedSet,
      selectionPlan: persistedSelection,
      journal,
    });
    if (!prepared.valid) return versionedFailure(prepared.message);
    const executor = new CraftingLifecycleExecutor({
      runManager,
      consumeExecutionGrant: (...args) =>
        this.versionedRunAuthority?.consumeExecutionGrant?.(...args),
    });
    try {
      const execution = await executor.execute({
        actor,
        runId,
        expectedRevision,
        requestId,
        executionGrant,
        selectionPlan:
          resuming || started
            ? null
            : {
                ...persistedSelection,
                selectedIngredientSetId: selectedSet.id,
                selectedRequirementSnapshot: snapshotRequirementSet(selectedSet),
                ...historySnapshots,
              },
        operation: ({ trusted }) =>
          this._buildVersionedStageOperation({
            actor,
            componentSourceActors,
            runId,
            recipe,
            step,
            stepIndex,
            selectedSet,
            prepared,
            trusted,
            trigger,
            historySnapshots,
          }),
      });
      return versionedTransitionResult(execution.run, execution.outcome);
    } catch (error) {
      if (error?.code === 'AUTHORITY_UNAVAILABLE') return authorityUnavailableResult();
      throw error;
    }
  }

  async cancelVersionedRun({ actor, runId, expectedRevision, executionGrant, requestId }) {
    const trusted = await this._consumeVersionedGrant(executionGrant, {
      operation: 'cancel',
      actor,
      runId,
      expectedRevision,
      requestId,
    });
    if (!trusted) return authorityUnavailableResult();
    const runManager = this._craftingRunManager();
    runManager?.invalidateCache?.(actor?.id);
    const run = runManager?.getActiveRun?.(actor, runId) ?? null;
    if (!run) return versionedFailure('There is no in-progress craft to cancel.');
    if (getRunLifecycleContract(run) !== 'current') {
      return versionedFailure('The crafting run lifecycle version is unsupported.');
    }
    if (Number(expectedRevision) !== Number(run.runRevision)) {
      throw new CraftingLifecycleExecutionError(
        'The crafting run revision is stale',
        'STALE_RUN_REVISION'
      );
    }
    if (run.executionJournal?.status === 'recoveryRequired') {
      return versionedFailure('The crafting run requires recovery.');
    }
    // A started stage has already spent its materials (D-026), so cancelling returns them
    // through the shared reversal — the same primitive and the same honest partial report
    // the legacy cancel path uses. Only a run that spent nothing reports nothing returned.
    const refundIntended = this._shouldRefundOnCancel(run);
    let restoredCount = 0;
    let reversalOk = true;
    let partialRefund = false;
    try {
      if (refundIntended) {
        const reversal = await this.reverseRunConsumption(actor, run);
        restoredCount = reversal.restored.length;
        reversalOk = reversal.ok;
        partialRefund =
          !reversal.ok &&
          (reversal.restored.length > 0 || reversal.currencyRefund.refundedGroups > 0);
      }
    } finally {
      await runManager.cancelRun(actor, runId);
    }
    return {
      success: true,
      cancelled: true,
      refunded: refundIntended && reversalOk,
      partialRefund,
      restoredCount,
    };
  }

  _craftingRunManager() {
    return this.craftingRunManager || game.fabricate?.getCraftingRunManager?.() || null;
  }

  _captureVersionedEffectPrefixes(effects, actor, runId = null) {
    return effects.map((effect) => ({
      ...effect,
      apply: async (context) => {
        try {
          return await effect.apply(context);
        } catch (error) {
          if (error.receipts?.length > 0) {
            const manager = this._craftingRunManager();
            const id =
              runId ??
              manager
                .getRunHistory(actor)
                .find((run) => run.executionJournal?.operationId === context.trusted.operationId)
                ?.id;
            await manager.retainUncertainReceipt(actor, id, effect.effectId, error.receipts, {
              executionOperationId: context.trusted.operationId,
            });
          }
          throw error;
        }
      },
    }));
  }

  async _beginNativeStage({
    craftingActor,
    run,
    runManager,
    stepIndex,
    recipe,
    step,
    componentSourceActors,
    timedStart = false,
  }) {
    if (!run || !runManager || getRunLifecycleContract(run) !== 'legacy') return;
    const stage = run.steps[stepIndex];
    assertNativeEffectsUninvoked(stage);
    const viewer =
      game.users?.get?.(run.userId) ?? (game.user?.id === run.userId ? game.user : null);
    const snapshots = this._stageHistorySnapshots({
      recipe,
      step,
      actor: craftingActor,
      viewer,
      sourceActors: componentSourceActors,
    });
    const system = this._getRecipeSystem(recipe);
    if (
      snapshots.resolutionSnapshot?.mode === 'simple' &&
      system?.features?.craftingChecks !== true &&
      system?.craftingCheck?.enabled !== true
    ) {
      snapshots.resolutionSnapshot.kind = 'none';
    }
    if (timedStart) delete snapshots.resolutionSnapshot;
    Object.assign(stage, snapshots);
    stage.historySettlement = {
      consumption: stage.historySettlement?.consumption ?? 'notApplicable',
      awards: 'pending',
    };
    await runManager.updateRun(craftingActor, run);
  }

  async _consumeNativeIngredients(plan, { craftingActor, run, runManager, stepIndex }) {
    if (!run || !runManager || getRunLifecycleContract(run) !== 'legacy')
      return this._consumeIngredients(plan);
    const stage = run.steps[stepIndex];
    stage.historySettlement = { ...stage.historySettlement, consumption: 'pending' };
    await runManager.updateRun(craftingActor, run);
    const consumed = await this._consumeIngredients(plan);
    await this._saveNativeConsumption(consumed, { craftingActor, run, runManager, stepIndex });
    return consumed;
  }

  async _saveNativeConsumption(consumed, { craftingActor, run, runManager, stepIndex }) {
    if (!run || !runManager || getRunLifecycleContract(run) !== 'legacy') return;
    const stage = run.steps[stepIndex];
    stage.consumedIngredients = consumed.map(mapConsumedIngredientRef);
    stage.historySettlement.consumption = 'complete';
    await runManager.updateRun(craftingActor, run);
  }

  async _recordNativeStageUncertainty(actor, runManager, run, error) {
    if (!runManager || !run || getRunLifecycleContract(run) !== 'legacy') return;
    const saved = runManager.getActiveRun(actor, run.id);
    const stage = saved?.steps?.[saved.currentStepIndex];
    if (!stage?.historySettlement) return;
    const field = error.historyField ?? 'awards';
    stage.historySettlement[field] = 'uncertain';
    const receiptKey = field === 'consumption' ? 'consumedIngredients' : 'createdResults';
    const prefix =
      error.receipts?.length > 0
        ? error.receipts
        : run.steps?.[saved.currentStepIndex]?.[receiptKey];
    if (Array.isArray(prefix)) stage[receiptKey] = prefix.map(itemReceipt);
    await runManager.updateRun(actor, saved);
  }

  _consumeVersionedGrant(executionGrant, context) {
    const consume = this.versionedRunAuthority?.consumeExecutionGrant;
    if (typeof consume !== 'function') {
      throw new CraftingLifecycleExecutionError(
        'Versioned crafting authority is unavailable',
        'AUTHORITY_UNAVAILABLE'
      );
    }
    return Promise.resolve(consume(executionGrant, context)).then((trusted) => {
      if (!trusted || typeof trusted !== 'object') {
        throw new CraftingLifecycleExecutionError(
          'Versioned crafting authority is unavailable',
          'AUTHORITY_UNAVAILABLE'
        );
      }
      return trusted;
    });
  }

  _executionSteps(recipe) {
    return typeof recipe?.getExecutionSteps === 'function' ? recipe.getExecutionSteps() : [];
  }

  _stageHistorySnapshots({ recipe, step, actor, viewer, sourceActors }) {
    if (!this._mayRecordStageHistory({ recipe, actor, viewer, sourceActors })) return {};
    const system = this._getRecipeSystem(recipe);
    const mode =
      this.resolutionModeService?.getMode?.(recipe) ?? system?.resolutionMode ?? 'simple';
    const check = resolveActiveCraftingCheckFormula({ ...system, resolutionMode: mode });
    let kind = 'none';
    if (check.requiresCheck || check.checkUsable) kind = 'check';
    else if (mode === 'routedByIngredients') kind = 'ingredients';
    const implicit = step.id === 'implicit-step' && !recipe.steps?.length;
    return craftingStepHistoryEvidence({
      resolutionSnapshot: { kind, mode },
      presentationSnapshot: {
        name: step.name ?? '',
        description: step.description || (implicit ? recipe.description : '') || '',
      },
    });
  }

  _mayRecordStageHistory({ recipe, actor, viewer, sourceActors }) {
    if (!viewer) return false;
    if (viewer.isGM === true) return true;
    try {
      const visibility = game.fabricate?.getRecipeVisibilityService?.();
      return (
        visibility?.evaluateRecipeAccess?.({
          recipe,
          viewer,
          craftingActor: actor,
          componentSourceActors: sourceActors,
        })?.visible === true
      );
    } catch {
      // Optional historical enrichment must not strand an otherwise valid run.
      return false;
    }
  }

  _selectedIngredientSet(step, selectedId) {
    const sets = Array.isArray(step?.ingredientSets) ? step.ingredientSets : [];
    if (selectedId == null || selectedId === '') return sets[0] ?? null;
    return sets.find((set) => String(set?.id) === String(selectedId)) ?? null;
  }

  _versionedGateReady(run) {
    const gate = run.steps?.[run.currentStepIndex]?.timeGate;
    if (!gate) return true;
    return Number(game.time?.worldTime || 0) >= Number(gate.availableAt || 0);
  }

  /** A stage whose choice is locked and whose materials are already spent (D-026/D-028). */
  _versionedStageStarted(run, stepIndex = run?.currentStepIndex) {
    return Boolean(run?.steps?.[stepIndex]?.preparedConsumption);
  }

  /** A stage armed by a release that consumed at execute: gated, with no start-phase consumption
   * record. It resolves on the pre-D-026 path so a run already in flight still completes. */
  _versionedStageArmedBeforeStartCommit(run, stepIndex = run?.currentStepIndex) {
    const step = run?.steps?.[stepIndex];
    return Boolean(step?.timeGate) && !step?.preparedConsumption;
  }

  /** Whether the stage has a start of its own: a zero-duration stage has no waiting window, so
   * beginning and resolving it stay one act. */
  _versionedStageNeedsStart(recipe, step) {
    const seconds = this._craftingRunManager()?.durationToSeconds?.(step?.timeRequirement) ?? 0;
    return seconds > 0 && this._timeRequirementsEnabled(recipe);
  }

  /** A check may only be rolled once EVERY other stage requirement is met: the stage has started,
   * so its choice is locked and its inputs are spent, and its gate has elapsed. */
  _versionedStageRollable({ run, recipe, step, stepIndex }) {
    if (!this._versionedGateReady(run)) return false;
    if (!this._versionedStageNeedsStart(recipe, step)) return true;
    return (
      this._versionedStageStarted(run, stepIndex) ||
      this._versionedStageArmedBeforeStartCommit(run, stepIndex)
    );
  }

  /** The selection the stage will spend. Once the stage has started the PERSISTED plan is
   * authoritative (D-028) and a late caller plan is ignored rather than refused. */
  _lockedStageSelection(run, stepIndex, selectionPlan) {
    const persisted = run?.steps?.[stepIndex]?.selectionPlan ?? null;
    if (this._versionedStageStarted(run, stepIndex)) return persisted ?? {};
    return selectionPlan || persisted || {};
  }

  /** Rebuild the stage preparation from the START snapshot. The ingredients are already consumed,
   * so only tools — which are never consumed — are validated again. */
  async _reconstructStartedVersionedStage({
    run,
    actor,
    componentSourceActors,
    recipe,
    step,
    stepIndex,
    selectedSet,
  }) {
    if (
      !sameStringSet(
        run?.componentSourceActorUuids,
        (componentSourceActors || []).map((source) => source?.uuid).filter(Boolean)
      )
    ) {
      return {
        valid: false,
        message: 'The crafting component sources changed after the run started.',
      };
    }
    const started = run.steps[stepIndex].preparedConsumption;
    const executionRecipe = this._buildStepRecipeView(recipe, step);
    const resolveComponent =
      this._getRecipeSystem(recipe)?.resolutionMode === 'alchemy'
        ? resolveAlchemySubmissionComponent
        : undefined;
    const summary = Array.isArray(started.consumedSummary) ? started.consumedSummary : [];
    const toolsForSet = this.recipeManager.getToolsForSet?.(executionRecipe, selectedSet) ?? [];
    const toolValidation = await this._validateTools(
      componentSourceActors,
      executionRecipe,
      toolsForSet,
      null,
      actor,
      {
        excludedItems: resolveLiveInventoryItemsByUuid(
          componentSourceActors,
          summary.map((entry) => entry?.itemUuid).filter(Boolean)
        ),
      }
    );
    if (!toolValidation.valid) return { valid: false, message: toolValidation.message };
    const currencySpends = cloneJsonValue(started.currencySpends) ?? [];
    return {
      valid: true,
      plan: {
        recipeId: recipe.id,
        stepId: step.id ?? null,
        selectedIngredientSetId: selectedSet.id,
        items: cloneJsonValue(summary) ?? [],
        currencySpends,
        ...versionedToolPlan(toolValidation).plan,
      },
      ...versionedToolPlan(toolValidation).items,
      executionRecipe,
      craftSelection: { plan: [] },
      toolValidation,
      currencySpends,
      resolveComponent,
      step,
      selectedSet,
      startedConsumption: startedConsumptionState(started),
    };
  }

  /** The stage preparation for the phase the stage is in: a resumed operation rebuilds from its
   * journal, a started stage from its START snapshot, an unstarted one from live inventory. */
  _versionedStagePreparation({ resuming = false, started = false, journal = null, ...stage }) {
    if (resuming) return this._reconstructVersionedStagePreparation({ ...stage, journal });
    if (started) return this._reconstructStartedVersionedStage(stage);
    return this._prepareVersionedStage(stage);
  }

  /** Prepare a stage and, in one journalled operation, consume its inputs, lock its selection and
   * arm its gate — the single commit point every versioned stage start goes through. */
  async _commitVersionedStageStart({
    actor,
    componentSourceActors,
    run,
    recipe,
    step,
    stepIndex,
    selectedSet,
    selectionPlan,
    historySnapshots,
    requiredSeconds,
    trusted,
    requestId,
  }) {
    const prepared = await this._prepareVersionedStage({
      run,
      actor,
      componentSourceActors,
      recipe,
      step,
      selectedSet,
      selectionPlan,
    });
    if (!prepared.valid) return { success: false, message: prepared.message };
    const executor = new CraftingLifecycleExecutor({
      runManager: this._craftingRunManager(),
      consumeExecutionGrant: () => trusted,
    });
    const execution = await executor.execute({
      actor,
      runId: run.id,
      expectedRevision: run.runRevision,
      // The journal keys idempotency on the request. The authority always supplies one and
      // mints the operation id FROM it, so the grant is the correct fallback, never a new id.
      requestId: String(requestId ?? '').trim() || trusted.operationId,
      operation: () =>
        this._buildVersionedStageStartOperation({
          actor,
          run,
          recipe,
          step,
          stepIndex,
          selectedSet,
          prepared,
          selectionPlan,
          historySnapshots,
          requiredSeconds,
        }),
    });
    return { success: true, run: execution.run };
  }

  /** The stage-start operation: consume the ingredients, settle the currency, then lock the
   * selection, record the consumption receipt and arm the gate in one persisted write. */
  _buildVersionedStageStartOperation({
    actor,
    run,
    recipe,
    stepIndex,
    selectedSet,
    prepared,
    selectionPlan,
    historySnapshots,
    requiredSeconds,
  }) {
    const state = {
      consumedItems: [],
      resolvedEssences: null,
      essenceEnabled: null,
      essenceSpend: historySnapshots?.resolutionSnapshot ? { labels: {}, carriers: [] } : undefined,
      currencySettlement: null,
    };
    const effects = [
      {
        effectId: 'consume-ingredients',
        kind: 'consumeIngredients',
        planned: prepared.plan.items,
        apply: async () => {
          state.consumedItems = await this._consumeIngredients(prepared.craftSelection.plan);
          return this._versionedConsumptionReceipt(
            state,
            prepared.executionRecipe,
            prepared.resolveComponent,
            historySnapshots
          );
        },
      },
    ];
    if (prepared.currencySpends.length > 0) {
      effects.push({
        effectId: 'spend-currency',
        kind: 'spendCurrency',
        planned: cloneJsonValue(prepared.currencySpends),
        apply: async () => {
          state.currencySettlement = cloneJsonValue(
            await this._spendCraftCurrencyVersioned(
              actor,
              prepared.executionRecipe,
              prepared.currencySpends
            )
          );
          return state.currencySettlement;
        },
      });
    }
    effects.push({
      effectId: 'start-stage',
      kind: 'startCraftingStage',
      planned: { runId: run.id, stepIndex, requiredSeconds },
      apply: async ({ trusted: effectTrusted }) => {
        const current = this._freshVersionedRun(actor, run.id);
        const started = await this._craftingRunManager().markStepStarted(
          actor,
          current,
          stepIndex,
          {
            selection: {
              ...selectionPlan,
              selectedIngredientSetId: selectedSet.id,
              selectedRequirementSnapshot: snapshotRequirementSet(selectedSet),
              ...historySnapshots,
            },
            prepared: this._startedConsumptionRecord(state, selectedSet),
            requiredSeconds,
          },
          {
            expectedRevision: current.runRevision,
            executionOperationId: effectTrusted.operationId,
          }
        );
        return { status: started.status, runRevision: started.runRevision };
      },
    });
    return {
      intent: { stepIndex, recipeId: recipe.id, trigger: 'start' },
      effects: this._captureVersionedEffectPrefixes(effects, actor, run.id),
      hydrate: ({ receipts }) => this._hydrateVersionedStartState(state, receipts),
      outcome: () => ({ success: true, disposition: 'started' }),
    };
  }

  /** The durable START snapshot: what was spent, and the essence context it resolved to. */
  _startedConsumptionRecord(state, selectedSet) {
    return {
      selectedIngredientSetId: selectedSet.id,
      currencySpends: state.currencySettlement?.settledSpends ?? [],
      resolvedEssences: state.resolvedEssences,
      essenceEnabled: state.essenceEnabled,
      consumedSummary: state.consumedItems.map((consumed) => ({
        ...mapConsumedIngredientRef(consumed),
        componentId:
          consumed.ingredient?.match?.componentId ??
          consumed.ingredient?.componentId ??
          consumed.ingredient?.systemItemId ??
          null,
      })),
      consumedSnapshots: state.consumedItems.map(snapshotVersionedConsumedItem),
      ...craftingStepHistoryEvidence({ essenceSpend: state.essenceSpend }),
    };
  }

  /** Restore a resumed start operation's state from its already-applied receipts. */
  _hydrateVersionedStartState(state, receipts) {
    const consumption = receipts['consume-ingredients'];
    if (consumption) {
      state.consumedItems = (consumption.consumedItems ?? []).map(rehydrateVersionedConsumedItem);
      state.resolvedEssences = cloneJsonValue(consumption.resolvedEssences) ?? null;
      state.essenceEnabled = cloneJsonValue(consumption.essenceEnabled) ?? null;
      state.essenceSpend = craftingStepHistoryEvidence(consumption).essenceSpend;
    }
    if (receipts['spend-currency']) {
      state.currencySettlement = cloneJsonValue(receipts['spend-currency']);
    }
  }

  _automaticStageBlocker(run, recipe, step, selectedSet) {
    if (run.completionMode !== 'worldTime') {
      return { code: 'manualPreference', message: 'This crafting run requires manual completion.' };
    }
    if (Array.isArray(selectedSet?.ingredients) && selectedSet.ingredients.length > 0) {
      return { code: 'materials', message: 'Automatic completion requires a no-input stage.' };
    }
    if (
      (Array.isArray(step?.toolIds) && step.toolIds.length > 0) ||
      (Array.isArray(recipe?.toolIds) && recipe.toolIds.length > 0)
    ) {
      return { code: 'tools', message: 'Automatic completion cannot use crafting tools.' };
    }
    if (
      Array.isArray(recipe?.currencyCost?.currencies) &&
      recipe.currencyCost.currencies.length > 0
    ) {
      return { code: 'currency', message: 'Automatic completion cannot spend currency.' };
    }
    const activeCheck = resolveActiveCraftingCheckFormula(this._getRecipeSystem(recipe));
    if (activeCheck.requiresCheck || activeCheck.checkUsable) {
      return {
        code: 'playerCheck',
        message: 'Automatic completion cannot resolve a player check.',
      };
    }
    return null;
  }

  async _canExecuteVersionedStageImmediately({
    run,
    actor,
    componentSourceActors,
    recipe,
    step,
    selectedSet,
  }) {
    if (run?.status === 'waitingTime' || run?.pauseState) return false;
    const stepIndex = Number(run?.currentStepIndex);
    const selectionPlan = run?.steps?.[stepIndex]?.selectionPlan ?? {};
    if (!this._versionedSelectionInputsComplete(selectedSet, selectionPlan, step)) return false;
    try {
      // Asked through the shared phase seam, because run start now COMMITS this stage: a
      // started stage holds what it needs and re-probing the inventory its own consumption
      // emptied would answer "cannot execute" for every craft that had just paid (M24).
      const prepared = await this._versionedStagePreparation({
        started: this._versionedStageStarted(run, stepIndex),
        run,
        actor,
        componentSourceActors,
        recipe,
        step,
        stepIndex,
        selectedSet,
        selectionPlan,
      });
      if (!prepared.valid) return false;
    } catch {
      return false;
    }
    const activeCheck = resolveActiveCraftingCheckFormula(this._getRecipeSystem(recipe));
    return !activeCheck.requiresCheck || activeCheck.checkUsable;
  }

  _versionedSelectionInputsComplete(selectedSet, selectionPlan, step) {
    return stageSelectionInputsComplete(selectedSet, selectionPlan, step?.id);
  }

  async _prepareVersionedStage({
    run,
    actor,
    componentSourceActors,
    recipe,
    step,
    selectedSet,
    selectionPlan,
  }) {
    if (
      !sameStringSet(
        run?.componentSourceActorUuids,
        (componentSourceActors || []).map((source) => source?.uuid).filter(Boolean)
      )
    ) {
      return {
        valid: false,
        message: 'The crafting component sources changed after the run started.',
      };
    }
    const executionRecipe = this._buildStepRecipeView(recipe, step);
    const resolveComponent =
      this._getRecipeSystem(recipe)?.resolutionMode === 'alchemy'
        ? resolveAlchemySubmissionComponent
        : undefined;
    const optionOverrides = selectionPlan?.ingredientOptionOverrides ?? null;
    const canCraft = this.recipeManager.canCraft(componentSourceActors, executionRecipe, {
      craftingActor: actor,
      resolveComponent,
      selectedSet,
      step,
      optionOverrides,
    });
    if (!canCraft.canCraft) {
      return this._versionedStageRefusal(
        STAGE_BLOCKERS.material,
        canCraft.missing,
        executionRecipe
      );
    }
    const essenceAllocation = this._scopedEssenceAllocation(
      selectionPlan?.ingredientEssenceAllocation,
      step,
      selectedSet
    );
    const craftSelection = this._resolveCraftSelection(
      componentSourceActors,
      selectedSet,
      executionRecipe,
      actor,
      resolveComponent,
      optionOverrides,
      essenceAllocation
    );
    // The predicate the Journal projection reads, so an offered control and this refusal cannot
    // name different causes (issue 1648).
    const readiness = classifyStageReadiness({
      selection: craftSelection,
      inputsComplete: this._versionedSelectionInputsComplete(selectedSet, selectionPlan, step),
    });
    if (!readiness.ready) {
      return this._versionedStageRefusal(
        readiness.blocker,
        { ingredients: craftSelection.missingGroups ?? [], essences: [], tools: [] },
        executionRecipe
      );
    }
    const toolsForSet = this.recipeManager.getToolsForSet?.(executionRecipe, selectedSet) ?? [];
    const toolValidation = await this._validateTools(
      componentSourceActors,
      executionRecipe,
      toolsForSet,
      null,
      actor,
      { excludedItems: selectedIngredientItems(craftSelection) }
    );
    if (!toolValidation.valid) {
      return { valid: false, blocker: STAGE_BLOCKERS.tool, message: toolValidation.message };
    }
    const currencySpends = craftSelection.currencySpends || [];
    const currencyCheck = await checkCurrencySpends(
      actor,
      executionRecipe,
      currencySpends,
      this._currencySeams()
    );
    if (!currencyCheck.valid) {
      return { valid: false, blocker: STAGE_BLOCKERS.currency, message: currencyCheck.message };
    }
    const itemPilesCheck = await this._checkItemPilesCurrencyCost(actor, recipe);
    if (!itemPilesCheck.valid) {
      return { valid: false, blocker: STAGE_BLOCKERS.currency, message: itemPilesCheck.message };
    }
    return {
      valid: true,
      plan: {
        recipeId: recipe.id,
        stepId: step.id ?? null,
        selectedIngredientSetId: selectedSet.id,
        items: (craftSelection.plan || []).map(({ item, quantity, ingredient }) => ({
          actorUuid: item?.parent?.uuid ?? null,
          itemUuid: item?.uuid ?? item?.id ?? null,
          quantity: Number(quantity) || 0,
          ingredient: cloneJsonValue(ingredient) ?? null,
        })),
        currencySpends: cloneJsonValue(currencySpends) ?? [],
        ...versionedToolPlan(toolValidation).plan,
      },
      ...versionedToolPlan(toolValidation).items,
      executionRecipe,
      craftSelection,
      toolValidation,
      currencySpends,
      resolveComponent,
      step,
      selectedSet,
    };
  }

  _reconstructVersionedStagePreparation({
    run,
    actor,
    componentSourceActors,
    recipe,
    step,
    stepIndex,
    selectedSet,
    journal,
  }) {
    if (
      !sameStringSet(
        run?.componentSourceActorUuids,
        (componentSourceActors || []).map((source) => source?.uuid).filter(Boolean)
      )
    ) {
      return {
        valid: false,
        message: 'The crafting component sources changed after the run started.',
      };
    }
    const executionRecipe = this._buildStepRecipeView(recipe, step);
    const resolveComponent =
      this._getRecipeSystem(recipe)?.resolutionMode === 'alchemy'
        ? resolveAlchemySubmissionComponent
        : undefined;
    const effects = new Map(journal.effects.map((effect) => [effect.effectId, effect]));
    const toolEffect = effects.get('apply-tools');
    const toolDefinitions = this.recipeManager.getToolsForSet?.(executionRecipe, selectedSet) ?? [];
    const toolPairs = (toolEffect?.planned || []).map((itemUuid, index) => {
      const item = findItemByUuid([actor, ...(componentSourceActors || [])], itemUuid);
      if (!item && toolEffect.phase !== 'applied') {
        throw new CraftingLifecycleExecutionError(
          'A planned crafting tool is no longer available',
          'STAGE_RECONSTRUCTION_FAILED'
        );
      }
      return {
        item: item ?? rehydrateVersionedItem({ itemUuid }),
        tool: toolDefinitions[index] ?? null,
      };
    });
    const currencySpends = cloneJsonValue(effects.get('spend-currency')?.planned) ?? [];
    return {
      valid: true,
      plan: {
        recipeId: recipe.id,
        stepId: step.id ?? null,
        selectedIngredientSetId: selectedSet.id,
        items: cloneJsonValue(effects.get('consume-ingredients')?.planned) ?? [],
        currencySpends,
        toolItemUuids: cloneJsonValue(toolEffect?.planned) ?? [],
      },
      toolItems: toolPairs.map((entry) => entry.item),
      executionRecipe,
      craftSelection: { plan: [] },
      toolValidation: { valid: true, tools: toolPairs },
      currencySpends,
      resolveComponent,
      step,
      selectedSet,
      startedConsumption: startedConsumptionState(run?.steps?.[stepIndex]?.preparedConsumption),
    };
  }

  _buildVersionedStageOperation({
    actor,
    componentSourceActors,
    runId,
    recipe,
    step,
    stepIndex,
    selectedSet,
    prepared,
    trusted,
    trigger,
    historySnapshots = {},
  }) {
    const checkResult = trusted?.resolvedCheckResult;
    if (!checkResult || typeof checkResult !== 'object') {
      throw new CraftingLifecycleExecutionError(
        'A validated crafting check result is required',
        'CHECK_RESULT_REQUIRED'
      );
    }
    if (checkResult.cancelled || checkResult.misconfigured) {
      throw new CraftingLifecycleExecutionError(
        'The validated crafting check result is not executable',
        'CHECK_RESULT_INVALID'
      );
    }
    const isAlchemy = trusted.activityKind === 'alchemy';
    const alchemySubmittedItems = isAlchemy ? trusted.alchemySubmittedItems : null;
    if (isAlchemy) {
      this._assertVersionedAlchemyItems(componentSourceActors, alchemySubmittedItems);
    }
    const resolutionService =
      this.resolutionModeService || game.fabricate?.getResolutionModeService?.();
    const resultValid =
      !resolutionService ||
      resolutionService.validateCheckResult({
        recipe: prepared.executionRecipe,
        checkResult,
      });
    const succeeded = checkResult.success === true && resultValid;
    const failurePolicy = this._getFailureConsumptionPolicy(prepared.executionRecipe);
    const alchemySimpleFailure =
      isAlchemy && !succeeded && this._getAlchemyCheckMode(prepared.executionRecipe) === 'simple';
    const consumeOnFailure = alchemySimpleFailure
      ? this._getRecipeSystem(prepared.executionRecipe)?.alchemy?.consumeOnFail !== false
      : failurePolicy.consumeIngredientsOnFail;
    const shouldConsume = succeeded || consumeOnFailure;
    const shouldUseTools = succeeded || alchemySimpleFailure || failurePolicy.breakToolsOnFail;
    const state = {
      consumedItems: [],
      usedTools: [],
      resultItems: [],
      resultRecords: [],
      resolutionMeta: null,
      firedComplications: null,
      currencySettlement: null,
      resolvedEssences: null,
      essenceEnabled: null,
      essenceSpend: historySnapshots.resolutionSnapshot ? { labels: {}, carriers: [] } : undefined,
      toolPairs: [...prepared.toolValidation.tools],
    };
    // A stage that already spent its inputs at START never re-consumes or re-spends here: it
    // resolves against the snapshot the start commit persisted.
    const spentAtStart = prepared.startedConsumption ?? null;
    if (spentAtStart) seedStartedStageState(state, spentAtStart);
    const effects = this._versionedStageInputEffects({
      actor,
      componentSourceActors,
      prepared,
      state,
      historySnapshots,
      spentAtStart,
      shouldConsume,
      alchemySubmittedItems: isAlchemy ? alchemySubmittedItems : null,
    });

    if (shouldUseTools && prepared.toolValidation.tools.length > 0) {
      effects.push({
        effectId: 'apply-tools',
        kind: 'applyToolUsage',
        planned: prepared.plan.toolItemUuids,
        apply: async () => {
          const decision = this._resolveCraftingBreakageDecision(
            this._getRecipeSystem(prepared.executionRecipe),
            prepared.executionRecipe,
            checkResult
          );
          state.usedTools = await this._applyToolBreakage(
            prepared.executionRecipe,
            prepared.toolValidation.tools,
            {
              forceBreak: decision.forceBreak,
              authority: decision.authority,
              reason: decision.reason,
              triggerId: decision.triggerId,
            }
          );
          return {
            tools: cloneJsonValue(state.usedTools),
            resolvedTools: state.toolPairs.map(snapshotVersionedToolPair),
          };
        },
      });
    }

    if (succeeded && this._hasItemPilesCurrencyCost(recipe)) {
      effects.push({
        effectId: 'spend-item-piles-currency',
        kind: 'spendItemPilesCurrency',
        planned: cloneJsonValue(recipe.currencyCost.currencies),
        apply: async () => this._deductItemPilesCurrencyCostVersioned(actor, recipe),
      });
    }

    if (
      succeeded ||
      this._versionedFailureAwardAllowed(prepared, checkResult, alchemySimpleFailure)
    ) {
      effects.push({
        effectId: 'award-results',
        kind: 'awardResults',
        planned: this._versionedResultPlan(prepared, checkResult),
        apply: async () => {
          const created = await this._createResultItems(
            actor,
            prepared.executionRecipe,
            step,
            selectedSet,
            state.consumedItems,
            state.toolPairs,
            checkResult,
            null,
            {
              precomputedEssences: state.resolvedEssences,
              essenceEnabled: state.essenceEnabled,
              resolveComponent: prepared.resolveComponent,
            }
          );
          state.resultItems = created.items;
          state.resolutionMeta = created.resolutionMeta;
          state.resultRecords = awardReceipts(state.resultItems);
          return {
            results: state.resultRecords,
            resolutionMeta: cloneJsonValue(state.resolutionMeta) ?? null,
          };
        },
      });
    }

    effects.push({
      effectId: 'finalize-stage',
      kind: 'finalizeCraftingStage',
      planned: { runId, stepIndex, succeeded },
      apply: async ({ trusted: effectTrusted }) => {
        const current = this._freshVersionedRun(actor, runId);
        const payload = {
          selectedIngredientSetId: selectedSet.id,
          lastCheckResult: {
            success: succeeded,
            reason: succeeded ? 'Success' : checkResult.message || 'Crafting check failed',
            outcome: checkResult.outcome ?? undefined,
            value: checkResult.value ?? undefined,
            data: checkResult.data || {},
          },
          consumedIngredients: state.consumedItems.map(mapConsumedIngredientRef),
          usedTools: state.usedTools,
          createdResults: state.resultRecords,
          ...craftingStepHistoryEvidence({
            ...historySnapshots,
            // Purpose was captured on arm, not rebuilt from a later edit.
            presentationSnapshot:
              current.steps?.[stepIndex]?.presentationSnapshot ??
              historySnapshots.presentationSnapshot,
            essenceSpend: state.essenceSpend,
            currencySpends: historySnapshots.resolutionSnapshot
              ? this._historicalCurrencySpends(state, recipe)
              : undefined,
          }),
        };
        const options = {
          expectedRevision: current.runRevision,
          executionOperationId: effectTrusted.operationId,
        };
        const completed = succeeded
          ? await this._craftingRunManager().completeStepSuccess(
              actor,
              current,
              current.currentStepIndex,
              payload,
              options
            )
          : await this._craftingRunManager().completeStepFailure(
              actor,
              current,
              current.currentStepIndex,
              payload.lastCheckResult.reason,
              payload,
              options
            );
        return {
          status: completed.status,
          runRevision: completed.runRevision,
          terminal: completed.currentStepIndex === null,
        };
      },
    });

    this._appendVersionedPostEffects(effects, state, {
      actor,
      componentSourceActors,
      recipe,
      step,
      prepared,
      selectedSet,
      checkResult,
      succeeded,
      isAlchemy,
    });
    return {
      intent: { stepIndex, recipeId: recipe.id, trigger },
      effects: this._captureVersionedEffectPrefixes(effects, actor, runId),
      hydrate: ({ receipts }) => this._hydrateVersionedStageState(state, receipts),
      outcome: () => ({
        success: succeeded,
        disposition: succeeded ? 'succeeded' : 'failed',
        createdResultUuids: state.resultRecords.map((record) => record.itemUuid).filter(Boolean),
      }),
    };
  }

  _versionedConsumptionReceipt(state, recipe, resolveComponent, historySnapshots = {}) {
    const { resolvedEssences, essenceSources } = this._buildEssenceContext(
      state.consumedItems,
      recipe,
      null,
      resolveComponent
    );
    state.resolvedEssences = resolvedEssences;
    state.essenceEnabled = this._snapshotEssenceEnabled(
      resolvedEssences,
      this._getRecipeSystem(recipe)
    );
    if (historySnapshots.resolutionSnapshot) {
      state.essenceSpend = this._historicalEssenceSpend(
        state.consumedItems,
        essenceSources,
        recipe
      );
    }
    return {
      items: state.consumedItems.map(mapConsumedIngredientRef),
      consumedItems: state.consumedItems.map(snapshotVersionedConsumedItem),
      resolvedEssences: cloneJsonValue(state.resolvedEssences),
      essenceEnabled: cloneJsonValue(state.essenceEnabled),
      ...craftingStepHistoryEvidence({ essenceSpend: state.essenceSpend }),
    };
  }

  /** The stage's INPUT effects: consume, spend, or — when a stage spent at start and its check
   * failed under `consumeIngredientsOnFail: false` — return what it spent (issue 1648, F3). */
  _versionedStageInputEffects({
    actor,
    componentSourceActors,
    prepared,
    state,
    historySnapshots,
    spentAtStart,
    shouldConsume,
    alchemySubmittedItems,
  }) {
    const receipt = () =>
      this._versionedConsumptionReceipt(
        state,
        prepared.executionRecipe,
        prepared.resolveComponent,
        historySnapshots
      );
    if (spentAtStart) {
      return shouldConsume ? [] : [this._versionedRefundEffect(actor, prepared, state)];
    }
    if (!shouldConsume) return [];
    const effects = [
      {
        effectId: 'consume-ingredients',
        kind: 'consumeIngredients',
        planned: prepared.plan.items,
        apply: async () => {
          state.consumedItems = await this._consumeIngredients(prepared.craftSelection.plan);
          return receipt();
        },
      },
    ];
    if (alchemySubmittedItems?.length > 0) {
      effects.push({
        effectId: 'consume-alchemy-extras',
        kind: 'consumeAlchemyExtras',
        planned: alchemySubmittedItems.map((item) => ({ itemUuid: item.uuid })),
        apply: async () => {
          await this._consumeAlchemyExtraItems(state.consumedItems, componentSourceActors, {
            isAlchemyAttempt: true,
            alchemySubmittedItems,
          });
          return receipt();
        },
      });
    }
    if (prepared.currencySpends.length > 0) {
      effects.push({
        effectId: 'spend-currency',
        kind: 'spendCurrency',
        planned: cloneJsonValue(prepared.currencySpends),
        apply: async () => {
          state.currencySettlement = cloneJsonValue(
            await this._spendCraftCurrencyVersioned(
              actor,
              prepared.executionRecipe,
              prepared.currencySpends
            )
          );
          return state.currencySettlement;
        },
      });
    }
    return effects;
  }

  /** Return a failed stage's START-time spend. D-026 governs WHEN materials are spent, not whether
   * a failed check keeps them, so `consumeIngredientsOnFail: false` still hands them back. */
  _versionedRefundEffect(actor, prepared, state) {
    const started = prepared.startedConsumption;
    const items = cloneJsonValue(started.consumedSummary) ?? [];
    const currencySpends = cloneJsonValue(started.currencySettlement?.settledSpends) ?? [];
    return {
      effectId: 'refund-start-consumption',
      kind: 'refundStageConsumption',
      planned: { items, currencySpends },
      apply: async () => {
        const restore = await this._restoreConsumedIngredients(
          actor,
          prepared.executionRecipe?.craftingSystemId ?? null,
          items
        );
        const currency =
          currencySpends.length > 0
            ? await this._refundCraftCurrency(actor, prepared.executionRecipe, currencySpends)
            : null;
        clearRefundedStageState(state);
        return {
          restoredCount: restore.restored.length,
          restoreFailures: restore.failures,
          currencyRefunded: currency === null ? null : currency.valid === true,
        };
      },
    };
  }

  _hydrateVersionedStageState(state, receipts) {
    const consumption = receipts['consume-alchemy-extras'] ?? receipts['consume-ingredients'];
    if (consumption) {
      const snapshots = consumption.consumedItems ?? consumption.items ?? [];
      state.consumedItems = snapshots.map(rehydrateVersionedConsumedItem);
      state.resolvedEssences = cloneJsonValue(consumption.resolvedEssences) ?? null;
      state.essenceEnabled = cloneJsonValue(consumption.essenceEnabled) ?? null;
      state.essenceSpend = craftingStepHistoryEvidence(consumption).essenceSpend;
    }
    const toolReceipt = receipts['apply-tools'];
    if (toolReceipt) {
      state.usedTools = cloneJsonValue(toolReceipt.tools) ?? [];
      if (Array.isArray(toolReceipt.resolvedTools)) {
        state.toolPairs = toolReceipt.resolvedTools.map(rehydrateVersionedToolPair);
      }
    }
    if (receipts['spend-currency']) {
      state.currencySettlement = cloneJsonValue(receipts['spend-currency']);
    }
    const awardReceipt = receipts['award-results'];
    if (awardReceipt) {
      state.resultRecords = cloneJsonValue(awardReceipt.results) ?? [];
      state.resultItems = attachAwardReceipts(
        state.resultRecords.map(rehydrateVersionedResultItem),
        state.resultRecords
      );
      state.resolutionMeta = cloneJsonValue(awardReceipt.resolutionMeta) ?? null;
    }
    if (receipts['fire-complications']) {
      state.firedComplications = {
        fired: cloneJsonValue(receipts['fire-complications'].fired) ?? [],
      };
    }
    // Last, so it overrides the START seeding: a resumed operation whose refund already applied
    // must not restate the spend that refund reversed.
    if (receipts['refund-start-consumption']) clearRefundedStageState(state);
  }

  _historicalEssenceSpend(consumedItems, essenceSources, recipe) {
    const definitions = resolvedEssencesFor(this._getRecipeSystem(recipe));
    const labels = Object.fromEntries(
      definitions
        .filter((definition) => Object.hasOwn(essenceSources, definition.id))
        .map((definition) => [definition.id, definition.name])
    );
    const carriers = new Map();
    for (const consumed of consumedItems) {
      const ref = mapConsumedIngredientRef(consumed);
      if (!ref.itemUuid || !Number.isFinite(ref.quantity) || ref.quantity <= 0) continue;
      const key = JSON.stringify([ref.actorUuid, ref.itemUuid]);
      const prior = carriers.get(key);
      if (prior) prior.quantity += ref.quantity;
      else carriers.set(key, { ...ref, contributions: [] });
    }
    for (const [essenceId, sources] of Object.entries(essenceSources)) {
      for (const source of sources) {
        addHistoricalEssenceContribution(carriers, essenceId, source);
      }
    }
    return craftingStepHistoryEvidence({
      essenceSpend: {
        labels,
        carriers: [...carriers.values()].filter((carrier) => carrier.contributions.length > 0),
      },
    }).essenceSpend;
  }

  _historicalCurrencySpends(state, recipe) {
    if (Array.isArray(state.currencySettlement?.settledSpends)) {
      return state.currencySettlement.settledSpends;
    }
    return this._hasItemPilesCurrencyCost(recipe) ? undefined : [];
  }

  _appendVersionedPostEffects(
    effects,
    state,
    { actor, componentSourceActors, recipe, step, prepared, checkResult, succeeded, isAlchemy }
  ) {
    const visibilityService = game.fabricate?.getRecipeVisibilityService?.();
    if (visibilityService && (succeeded || isAlchemy)) {
      effects.push({
        effectId: 'record-recipe-use',
        kind: 'recordRecipeUse',
        planned: { recipeId: recipe.id },
        apply: async () => {
          await visibilityService.applyRecipeItemUseOnCraft({
            recipe,
            craftingActor: actor,
            componentSourceActors,
          });
          return { recorded: true };
        },
      });
      if (isAlchemy) {
        effects.push({
          effectId: 'learn-alchemy-recipe',
          kind: 'learnAlchemyRecipe',
          planned: { recipeId: recipe.id },
          apply: async () => {
            await visibilityService.learnRecipeOnCraft(recipe, actor);
            return { learned: true };
          },
        });
      }
    }
    if (succeeded) {
      effects.push({
        effectId: 'fire-complications',
        kind: 'fireComplications',
        planned: { recipeId: recipe.id, stepId: step.id ?? null },
        apply: async () => {
          state.firedComplications = await this._fireCraftComplications({
            actor,
            recipe: prepared.executionRecipe,
            step,
            checkResult,
            resolutionMeta: state.resolutionMeta,
          });
          return {
            fired: cloneJsonValue(state.firedComplications?.fired) ?? [],
          };
        },
      });
    }
    effects.push({
      effectId: 'post-chat',
      kind: 'postCraftChat',
      planned: { success: succeeded },
      apply: async () => {
        await this._postCraftChatMessage({
          success: succeeded,
          craftingActor: actor,
          recipe,
          consumedIngredients: state.consumedItems,
          tools: state.toolPairs,
          createdResults: state.resultItems,
          failureReason: succeeded ? null : checkResult.message || 'Crafting check failed',
          rollValue: rollTotalForCard(checkResult),
          tierStep: tierStepForCard(checkResult),
          firedComplications: state.firedComplications?.fired ?? null,
        });
        return { posted: true };
      },
    });
  }

  _versionedFailureAwardAllowed(prepared, checkResult, alchemySimpleFailure) {
    if (alchemySimpleFailure) return true;
    if (
      !activityPermitsFailureResults(this._getRecipeSystem(prepared.executionRecipe), 'crafting')
    ) {
      return false;
    }
    const resolutionService =
      this.resolutionModeService || game.fabricate?.getResolutionModeService?.();
    if (typeof resolutionService?.resolveResultGroups !== 'function') return false;
    const resolved = resolutionService.resolveResultGroups({
      recipe: prepared.executionRecipe,
      step: prepared.step,
      ingredientSet: prepared.selectedSet,
      checkResult,
      selectedResultGroupId: null,
    });
    return this._isFailureAwardDisposition(resolved?.meta?.disposition);
  }

  _versionedResultPlan(prepared, checkResult) {
    const resolutionService =
      this.resolutionModeService || game.fabricate?.getResolutionModeService?.();
    const resolved = resolutionService?.resolveResultGroups?.({
      recipe: prepared.executionRecipe,
      step: prepared.step,
      ingredientSet: prepared.selectedSet,
      checkResult,
      selectedResultGroupId: null,
    });
    return (resolved?.groups || prepared.executionRecipe.resultGroups || []).flatMap((group) =>
      (group?.results || []).map((result) => ({
        resultId: result?.id ?? null,
        componentId: result?.componentId ?? null,
        itemUuid: result?.itemUuid ?? null,
        quantity: Number(result?.quantity) || 1,
      }))
    );
  }

  _freshVersionedRun(actor, runId) {
    const runManager = this._craftingRunManager();
    runManager?.invalidateCache?.(actor?.id);
    const run = runManager?.getRun?.(actor, runId) ?? null;
    if (!run) {
      throw new CraftingLifecycleExecutionError(
        'The crafting run disappeared during execution',
        'RUN_NOT_FOUND'
      );
    }
    return run;
  }

  _assertVersionedAlchemyItems(componentSourceActors, submittedItems) {
    if (!Array.isArray(submittedItems)) {
      throw new CraftingLifecycleExecutionError(
        'Trusted alchemy submissions are required',
        'STALE_ALCHEMY_SUBMISSION'
      );
    }
    const liveItems = new Set(
      (componentSourceActors || []).flatMap((source) => [...(source?.items || [])])
    );
    if (submittedItems.some((item) => !item?.uuid || !liveItems.has(item))) {
      throw new CraftingLifecycleExecutionError(
        'Trusted alchemy submissions are stale',
        'STALE_ALCHEMY_SUBMISSION'
      );
    }
  }

  _assertAlchemySubmissionDocuments(actor, sourceActors, submittedItems) {
    if (!actor || !Array.isArray(sourceActors) || sourceActors.length === 0) {
      throw new CraftingLifecycleExecutionError(
        'The crafting actor and component sources are required',
        'STALE_ALCHEMY_SUBMISSION'
      );
    }
    const sourceUuids = new Set(sourceActors.map((source) => source?.uuid).filter(Boolean));
    if (
      !Array.isArray(submittedItems) ||
      submittedItems.length === 0 ||
      submittedItems.some(
        (entry) =>
          !entry?.componentId || !entry?.item?.uuid || !sourceUuids.has(entry.item.parent?.uuid)
      )
    ) {
      throw new CraftingLifecycleExecutionError(
        'The submitted alchemy ingredients are stale',
        'STALE_ALCHEMY_SUBMISSION'
      );
    }
  }

  _resolveVersionedAlchemyMatch(craftingSystemId, submittedItems) {
    const systemManager = game.fabricate?.getCraftingSystemManager?.();
    const system = systemManager?.getSystem?.(craftingSystemId) ?? null;
    if (!system || system.resolutionMode !== 'alchemy') {
      throw new CraftingLifecycleExecutionError(
        'No alchemy-mode crafting system found',
        'ALCHEMY_SYSTEM_UNAVAILABLE'
      );
    }
    const recipeManager = this.recipeManager || game.fabricate?.getRecipeManager?.();
    const recipes = recipeManager?.getRecipes?.({ craftingSystemId, enabled: true }) ?? [];
    const components = resolvedComponentsFor(system);
    const signatureValidator = new SignatureValidator({
      getSystem: (id) => systemManager.getSystem(id),
      getRecipesForSystem: (id) =>
        recipeManager?.getRecipes?.({ craftingSystemId: id, enabled: true }) ?? [],
      getComponentsForSystem: (id) => resolvedComponentsFor(systemManager.getSystem(id)),
    });
    return {
      system,
      matchResult: this._matchAlchemySignature(
        submittedItems,
        recipes,
        components,
        signatureValidator,
        { system }
      ),
    };
  }

  _assertAlchemySubmissionStock(sourceActors, submittedItems) {
    const sourceItems = new Set(sourceActors.flatMap((source) => [...(source?.items || [])]));
    const counts = new Map();
    for (const entry of submittedItems) {
      if (!sourceItems.has(entry.item)) {
        throw new CraftingLifecycleExecutionError(
          'The submitted alchemy ingredients are stale',
          'STALE_ALCHEMY_SUBMISSION'
        );
      }
      counts.set(entry.item, (counts.get(entry.item) || 0) + 1);
    }
    for (const [item, count] of counts) {
      if (readStoredStackQuantity(item, { absentDefault: 1 }) < count) {
        throw new CraftingLifecycleExecutionError(
          'The submitted alchemy quantity is no longer available',
          'STALE_ALCHEMY_SUBMISSION'
        );
      }
    }
  }

  async _consumeVersionedAlchemySubmission(sourceActors, submittedItems) {
    this._assertAlchemySubmissionStock(sourceActors, submittedItems);
    const counts = new Map();
    for (const { item } of submittedItems) counts.set(item, (counts.get(item) || 0) + 1);
    const before = new Map([...counts.keys()].map((item) => [item, sourceItemQuantity(item)]));
    const consumed = await this._consumeIngredients(
      [...counts].map(([item, quantity]) => ({ item, quantity }))
    );
    return consumed.map((entry) => ({
      ...mapConsumedIngredientRef(entry),
      consumedQuantity: entry.quantity,
      beforeQuantity: before.get(entry.item),
      afterQuantity: before.get(entry.item) - entry.quantity,
    }));
  }

  _hasAlchemyDeadEnd(actor, craftingSystemId, key) {
    const deadEnds = getFabricateFlag(actor, 'alchemyDeadEnds', {});
    return Array.isArray(deadEnds?.[craftingSystemId]) && deadEnds[craftingSystemId].includes(key);
  }

  async _spendCraftCurrencyVersioned(craftingActor, recipe, currencySpends) {
    const result = await spendCurrencySpends(
      craftingActor,
      recipe,
      currencySpends,
      this._currencySeams()
    );
    return {
      valid: result?.valid === true,
      message: result?.message ?? null,
      groups: Array.isArray(result?.groups) ? result.groups : [],
      settledSpends: Array.isArray(result?.settledSpends) ? result.settledSpends : [],
    };
  }

  _hasItemPilesCurrencyCost(recipe) {
    const currencies = recipe?.currencyCost?.currencies;
    if (!Array.isArray(currencies) || currencies.length === 0) return false;
    const integration = this.itemPilesIntegration || game.fabricate?.getItemPilesIntegration?.();
    if (!integration) return false;
    return integration.isEnabled(this._getRecipeSystem(recipe));
  }

  async _deductItemPilesCurrencyCostVersioned(craftingActor, recipe) {
    const integration = this.itemPilesIntegration || game.fabricate?.getItemPilesIntegration?.();
    await integration.deductCurrency(craftingActor, recipe.currencyCost.currencies);
    return { deducted: true };
  }

  async _routeVersionedCraft(actor, sourceActors, recipe, ingredientSetId, options) {
    if (options?.[VERSIONED_EXECUTION_CONTEXT]) return null;
    const runManager = this._craftingRunManager();
    const existing = options?.runId ? runManager?.getActiveRun?.(actor, options.runId) : null;
    const contract = existing ? getRunLifecycleContract(existing) : null;
    if (contract === 'unsupported') {
      return versionedFailure('The crafting run lifecycle version is unsupported.');
    }
    if (contract !== 'current' && options?.lifecycleVersion !== 1) return null;

    if (existing) {
      const requestExecute = this.versionedRunAuthority?.requestExecute;
      if (typeof requestExecute !== 'function') return authorityUnavailableResult();
      return requestExecute({
        actor,
        componentSourceActors: sourceActors,
        runId: existing.id,
        expectedRevision: existing.runRevision,
        selectionPlan: {
          selectedIngredientSetId: ingredientSetId,
          ingredientOptionOverrides: options?.ingredientOptionOverrides,
          ingredientEssenceAllocation: options?.ingredientEssenceAllocation,
        },
      });
    }

    const requestStart = this.versionedRunAuthority?.requestStart;
    if (typeof requestStart !== 'function') return authorityUnavailableResult();
    return requestStart({
      actor,
      sourceActors,
      recipeId: recipe?.id,
      selectionPlan: {
        selectedIngredientSetId: ingredientSetId,
        ingredientOptionOverrides: options?.ingredientOptionOverrides,
        ingredientEssenceAllocation: options?.ingredientEssenceAllocation,
      },
      completionMode: options?.completionMode || 'manual',
    });
  }

  _versionedMutationOptions(options, run) {
    const context = options?.[VERSIONED_EXECUTION_CONTEXT];
    if (!context?.operationId) return {};
    return {
      expectedRevision: run.runRevision,
      executionOperationId: context.operationId,
    };
  }

  /** Install the complication delivery writer (issue 1286). A POST-CONSTRUCTION seam on the
   * `GatheringEngine#installBlindRunRelay` precedent, so existing `new CraftingEngine(...)` sites
   * keep working. Without it the writer falls back to `game.fabricate.complicationDeliveryWriter`;
   * with NEITHER the GM requests are dropped and award, run record and chat card are untouched. */
  installComplicationDelivery({ writer = null } = {}) {
    this.complicationDeliveryWriter = writer;
    return this;
  }

  /** The complication delivery writer, injected or ambient. */
  _complicationWriter() {
    return this.complicationDeliveryWriter || game.fabricate?.complicationDeliveryWriter || null;
  }

  /**
   * FIRE the component complications a committed progressive award earned — the one guarded seam
   * all three engine call sites route through (issue 1286): the immediate craft path, the timed
   * craft FINISH path, and salvage, each AFTER the award is committed and BEFORE the chat card
   * is posted. It fires once per STEP resolution, so a collapsed three-step chain fires three
   * times. Guard 3 of 3: a complication is strictly downstream of a committed award, so plan,
   * trigger evaluation, firing and delivery are all inside one `try`, and the delivery writer
   * OWNS the emit and mints the resolution id. `options.stages` is the ORDERED stage occurrence
   * list in fire order; `options.deliver: false` returns the GM requests for a batching caller
   * instead, because the rate limit in `complicationSocket.js` is sized on ONE message per run.
   */
  async _fireComponentComplications({
    activity,
    actor,
    craftingSystemId,
    stages,
    award,
    checkBreakage,
    checkResult,
    deliver = true,
  }) {
    try {
      if (!Array.isArray(stages) || stages.length === 0) return null;
      const plan = planComplications({
        activity,
        stages,
        award,
        ...resolveCheckTriggerMatches(checkBreakage, checkResult),
      });
      const fired = await fireComplications({
        plan,
        actor,
        context: {
          craftingSystemId: craftingSystemId ?? null,
          actorUuid: actor?.uuid ?? null,
          speaker: globalThis.ChatMessage?.getSpeaker?.({ actor }),
        },
      });
      if (deliver && fired.gmRequests.length > 0) {
        this._complicationWriter()?.deliver({
          craftingSystemId: craftingSystemId ?? null,
          actorUuid: actor?.uuid ?? null,
          complications: fired.gmRequests,
        });
      }
      return fired;
    } catch (error) {
      // The award is already committed. A complication that cannot fire is a lost
      // narrative beat; a thrown craft here would be lost items.
      console.error('Fabricate | Component complications failed to fire', error);
      return null;
    }
  }

  /** The crafting call site's adapter: the ordered stage list from the resolution service and the
   * award from the resolution it just published (issue 1286). The `awardedResultIds` guard keeps
   * a non-progressive resolution out, where every stage would classify as `unreached`. */
  async _fireCraftComplications({ actor, recipe, step, checkResult, resolutionMeta }) {
    const resolutionService =
      this.resolutionModeService || game.fabricate?.getResolutionModeService?.();
    if (resolutionService?.getMode?.(recipe) !== 'progressive') return null;
    if (!Array.isArray(resolutionMeta?.awardedResultIds)) return null;
    const system = this._getRecipeSystem(recipe);
    return this._fireComponentComplications({
      activity: 'crafting',
      actor,
      craftingSystemId: recipe?.craftingSystemId ?? null,
      stages: resolutionService.progressiveStageOccurrences?.({ recipe, step }) ?? [],
      award: awardFromResolutionMeta(resolutionMeta),
      checkBreakage: this._resolveCraftingCheckBreakage(system, recipe),
      checkResult,
    });
  }

  /**
   * The spend seams handed to the shared currency-affordance helpers
   * ({@link buildCurrencyAffordProbe}, {@link checkCurrencySpends}, {@link spendCurrencySpends}).
   */
  _currencySeams() {
    return {
      actorInventoryCoinSpender: this.actorInventoryCoinSpender,
      actorPropertyCoinSpender: this.actorPropertyCoinSpender,
      getCurrencyConfig: () => this.currencyConfigStore?.get(),
    };
  }

  /** The component resolver to inject through the craftability, selection and essence-context
   * paths for THIS craft (issue 578). Only an alchemy attempt supplies the tier-4-aware
   * {@link resolveAlchemySubmissionComponent}; every other craft gets `undefined` and defaults
   * to the shared standard-craft resolver, so standard crafting never gains tier 4. */
  _alchemyComponentResolver(options) {
    return options?.isAlchemyAttempt === true ? resolveAlchemySubmissionComponent : undefined;
  }

  /** A resolution `meta.disposition` representing a crafting-system MISCONFIGURATION (issue 85) —
   * `misconfiguration`, `unrouted-tier` or `error`. A GM-side authoring gap, not a rolled player
   * failure, so the craft aborts with ZERO mutation rather than a silent empty success. */
  _isMisconfigurationDisposition(disposition) {
    return ['misconfiguration', 'unrouted-tier', 'error'].includes(disposition);
  }

  /**
   * Does this resolution `meta.disposition` identify an authored FAILURE output?
   *
   * THE FAILURE AWARD IS AN ALLOWLIST, NEVER A FALL-THROUGH (issue 1098). Only `'fail'` — the
   * reserved `role: 'failure'` group selected BY ROLE — and `'failure'`, a `routedByCheck`
   * failure-marked outcome tier, may be produced on a failed check. `routedByCheck`'s
   * single-group exemption reports `'success'` for any non-keyword outcome, so falling through
   * would hand a failed craft its full SUCCESS output; `routedByIngredients` reports none at all.
   */
  _isFailureAwardDisposition(disposition) {
    return ['fail', 'failure'].includes(disposition);
  }

  /**
   * The Foundry edge, the validated call inputs and the run this craft runs against, all resolved
   * before the phantom-run window opens. A `refusal` is the caller's return; it is only ever set
   * before the run is created, so no created run can escape the caller's `try`.
   */
  async _openCraftContext(craftingActor, componentSourceActors, recipe, ingredientSetId, options) {
    const ctx = {
      craftingActor,
      componentSourceActors,
      recipe,
      ingredientSetId,
      options,
      resolutionService: this.resolutionModeService || game.fabricate?.getResolutionModeService?.(),
      runManager: this.craftingRunManager || game.fabricate?.getCraftingRunManager?.(),
      visibilityService: game.fabricate?.getRecipeVisibilityService?.(),
      user: game.user,
      // A thunk, not a sample: several awaits separate this block from the time gate, and
      // `core.time` moves from the socket, so the gate must read the clock at its own position.
      readWorldTime: () => Number(game.time?.worldTime || 0),
      // Virtual-present tools injected by an active canvas Tool station (Phase 4). A componentId is
      // satisfied without an owned item, and excluded from breakage/usage, ONLY when the active
      // tool's systemId matches the recipe's system — componentId is a per-system id.
      presentTools:
        options?.presentTools && !Array.isArray(options.presentTools) ? options.presentTools : null,
      // Per-group player option overrides (issue 552), threaded to BOTH the craftability gate and
      // the single selection source so the display and the consumed plan resolve the same option.
      ingredientOptionOverrides:
        options?.ingredientOptionOverrides && typeof options.ingredientOptionOverrides === 'object'
          ? options.ingredientOptionOverrides
          : null,
      // The player's essence-block funding (issue 917), SCOPED rather than a bare map: item uuids
      // are not step-scoped, and the run's step index can move between the `$derived` that built
      // the payload and the click that sends it, so the check belongs HERE, not in the UI.
      ingredientEssenceAllocation:
        options?.ingredientEssenceAllocation &&
        typeof options.ingredientEssenceAllocation === 'object'
          ? options.ingredientEssenceAllocation
          : null,
      run: null,
      // Track whether THIS call created the run and whether it reached a legitimate persisted
      // state. A run created here but never resolved is a phantom, discarded in the caller's
      // `finally`, so a failed craft never lingers as an "in progress" active run.
      createdThisCall: false,
      resolved: false,
      refusal: null,
    };

    // Validate inputs
    if (!craftingActor) {
      ctx.refusal = { success: false, results: null, message: 'No crafting actor selected' };
      return ctx;
    }
    if (!componentSourceActors || componentSourceActors.length === 0) {
      ctx.refusal = {
        success: false,
        results: null,
        message: 'No component source actors selected',
      };
      return ctx;
    }
    const validation = recipe.validate({ Roll: diceEngine() });
    if (!validation.valid) {
      ctx.refusal = {
        success: false,
        results: null,
        message: `Invalid recipe: ${validation.errors.join(', ')}`,
      };
      return ctx;
    }

    if (ctx.runManager) {
      ctx.run = options?.runId
        ? ctx.runManager.getActiveRun(craftingActor, options.runId)
        : ctx.runManager.findActiveRunForRecipe(craftingActor, recipe.id);
      if (!ctx.run) {
        ctx.run = await ctx.runManager.createRun(
          craftingActor,
          recipe,
          componentSourceActors,
          ctx.user?.id || null
        );
        ctx.createdThisCall = true;
      }
    }
    return ctx;
  }

  /**
   * A run created this call that never armed a time gate or completed a step is a phantom stranded
   * by a pre-check early-return. Discard it with no history entry; completed runs have already
   * moved to history, and a reused pre-existing run is never touched.
   */
  async _discardPhantomRun(ctx) {
    const { craftingActor, run, runManager } = ctx;
    if (
      ctx.createdThisCall &&
      !ctx.resolved &&
      run &&
      !run.steps?.some((step) => step.historySettlement) &&
      runManager?.getActiveRun(craftingActor, run.id)
    ) {
      await runManager.discardRun(craftingActor, run.id);
    }
  }

  /**
   * Attempt to craft an item using a recipe.
   *
   * @param {string} ingredientSetId Which ingredient set to use; the first satisfiable when null.
   * @param {object|null} [options.ingredientOptionOverrides] Per-group player option overrides
   *   (issue 552), keyed by `group.id`, so the consumed plan matches what the player chose. For a
   *   time-gated step they apply at START, so the FINISH resume replays the chosen option/stack.
   * @param {{stepId: string|null, ingredientSetId: string|null,
   *   allocation: Record<string, number>}|null} [options.ingredientEssenceAllocation] The
   *   player's essence-block funding (issue 917), SCOPED to the step and set it was computed
   *   against and dropped wholesale — never clamped into the wrong step — when either id
   *   disagrees. There is no timed snapshot: the source Items are deleted at START.
   * @param {boolean} [options.interactive] Prompt with the confirm-roll dialog and post the roll
   *   to chat; defaults false so automation stays silent, and a dismissed prompt returns
   *   `cancelled: true` with zero mutation. A timed step's RESUME is always a player click.
   * @returns {Promise<{success: boolean, results: Item[]|null, message: string, cancelled?: boolean}>}
   */
  async craft(craftingActor, componentSourceActors, recipe, ingredientSetId = null, options = {}) {
    const routedVersioned = await this._routeVersionedCraft(
      craftingActor,
      componentSourceActors,
      recipe,
      ingredientSetId,
      options
    );
    if (routedVersioned) return routedVersioned;
    const ctx = await this._openCraftContext(
      craftingActor,
      componentSourceActors,
      recipe,
      ingredientSetId,
      options
    );
    if (ctx.refusal) return ctx.refusal;
    const settle = (outcome) => {
      ctx.resolved = outcome.resolved;
      return outcome.result;
    };

    try {
      const opened = await openCraftStep(this, ctx);
      if (opened) return settle(opened);
      const gated = await routeGatedExecution(this, ctx);
      if (gated) return settle(gated);
      const inputs = await resolveCraftInputs(this, ctx);
      if (inputs.result) return settle(inputs);
      const craftInputs = inputs.craftInputs;
      const afforded = await runAffordGates(this, ctx, craftInputs);
      if (afforded) return settle(afforded);
      const checked = await runCraftCheck(this, ctx, craftInputs);
      if (checked) return settle(checked);
      // Both halves of the native-effect bracket stay here: this stage opens on the success and
      // the failure path alike, and the `catch` below is what closes it.
      await this._beginNativeStage({
        craftingActor,
        run: ctx.run,
        runManager: ctx.runManager,
        stepIndex: ctx.stepIndex,
        recipe: craftInputs.executionRecipe,
        step: ctx.step,
        componentSourceActors,
      });
      const alchemyFailure = await routeAlchemySimpleFailure(this, ctx, craftInputs);
      if (alchemyFailure) return settle(alchemyFailure);
      const checkFailure = await resolveCheckFailure(this, ctx, craftInputs);
      if (checkFailure) return settle(checkFailure);
      const modeFailure = await resolveModeValidationFailure(this, ctx, craftInputs);
      if (modeFailure) return settle(modeFailure);
      const preflight = await runResolutionPreflight(this, ctx, craftInputs);
      if (preflight) return settle(preflight);

      const award = await commitCraft(this, ctx, craftInputs);
      // Step resolved: a multi-step recipe keeps an active run for the next step; a
      // final step is already moved to history. Either way it is not a phantom.
      ctx.resolved = true;
      await publishCraftSuccess(this, ctx, craftInputs, award);
      const chained = continueCollapsedChain(this, ctx);
      if (chained) return settle(chained);
      return {
        success: true,
        results: award.resultItems,
        message:
          ctx.run?.status === 'succeeded'
            ? `Successfully crafted ${recipe.name}`
            : `Completed ${ctx.step.name || `step ${ctx.stepIndex + 1}`} for ${recipe.name}`,
      };
    } catch (error) {
      if (error.code === 'HISTORY_EFFECT_UNCERTAIN') {
        ctx.resolved = true;
        await this._recordNativeStageUncertainty(craftingActor, ctx.runManager, ctx.run, error);
      }
      throw error;
    } finally {
      await this._discardPhantomRun(ctx);
    }
  }

  /**
   * START phase of a time-gated step: validate craftability, resolve the single craft selection,
   * run the afford / tool gates, then CONSUME components and currency NOW, before the gate is
   * armed. Snapshots the resolved essences and a consumed-item summary onto the run step so
   * FINISH can build results without re-reading the deleted source items. Any pre-arm failure
   * removes the run, and tool BREAKAGE is NOT applied here — it is tied to the check outcome at
   * FINISH. `ingredientEssenceAllocation` applies exactly once, HERE, and is NOT snapshotted.
   */
  async _startTimedStep({
    craftingActor,
    componentSourceActors,
    recipe,
    step,
    stepIndex,
    ingredientSetId,
    ingredientOptionOverrides = null,
    ingredientEssenceAllocation = null,
    presentTools,
    options,
    runManager,
    run,
    createdThisCall,
  }) {
    const executionRecipe = this._buildStepRecipeView(recipe, step);

    // A timed alchemy attempt reaches canCraft/selection/essence-context here too (issue 578):
    // inject the tier-4-aware submission resolver so a purely-tier-4 submission STARTS and its
    // component's essences are snapshotted for the FINISH effect transfer.
    const resolveComponent = this._alchemyComponentResolver(options);

    // Remove the never-armed run on any pre-arm failure so no zombie lingers: a
    // run this call created is discarded (no history); a reused run is cancelled.
    const abort = async (message) => {
      await (createdThisCall
        ? runManager.discardRun(craftingActor, run.id)
        : runManager.cancelRun(craftingActor, run.id));
      return { resolved: true, result: { success: false, results: null, message } };
    };

    const canCraftCheck = this.recipeManager.canCraft(componentSourceActors, executionRecipe, {
      presentTools,
      craftingActor,
      resolveComponent,
      optionOverrides: ingredientOptionOverrides,
    });
    if (!canCraftCheck.canCraft) {
      return abort(
        `Missing required items:\n${this._formatMissingItems(canCraftCheck.missing, executionRecipe)}`
      );
    }

    let ingredientSet;
    if (ingredientSetId) {
      ingredientSet = executionRecipe.ingredientSets.find((s) => s.id === ingredientSetId);
      if (!ingredientSet) {
        return abort(`Invalid ingredient set ID: ${ingredientSetId}`);
      }
    } else {
      ingredientSet = canCraftCheck.satisfiableSet;
    }

    // SINGLE SELECTION SOURCE (mirrors craft()): the item plan and currencySpends
    // both come from ONE _resolveCraftSelection call so consumption never diverges
    // from the gated/spent currency.
    const essenceAllocation = this._scopedEssenceAllocation(
      ingredientEssenceAllocation,
      step,
      ingredientSet
    );
    const craftSelection = this._resolveCraftSelection(
      componentSourceActors,
      ingredientSet,
      executionRecipe,
      craftingActor,
      resolveComponent,
      ingredientOptionOverrides,
      essenceAllocation
    );
    const shortAllocation = this._allocationShortfallMessage(
      essenceAllocation,
      craftSelection,
      executionRecipe
    );
    if (shortAllocation) return abort(shortAllocation);
    const currencySpends = craftSelection.currencySpends || [];

    const toolsForSet =
      typeof this.recipeManager.getToolsForSet === 'function'
        ? this.recipeManager.getToolsForSet(executionRecipe, ingredientSet)
        : [];
    const toolValidation = await this._validateTools(
      componentSourceActors,
      executionRecipe,
      toolsForSet,
      presentTools,
      craftingActor,
      { excludedItems: selectedIngredientItems(craftSelection) }
    );
    if (!toolValidation.valid) {
      return abort(toolValidation.message);
    }

    const currencyAffordCheck = await checkCurrencySpends(
      craftingActor,
      executionRecipe,
      currencySpends,
      this._currencySeams()
    );
    if (!currencyAffordCheck.valid) {
      return abort(currencyAffordCheck.message);
    }

    const itemPilesAffordCheck = await this._checkItemPilesCurrencyCost(craftingActor, recipe);
    if (!itemPilesAffordCheck.valid) {
      return abort(itemPilesAffordCheck.message);
    }

    // Consume NOW (at START): items first, then currency (both gates passed).
    await this._beginNativeStage({
      craftingActor,
      run,
      runManager,
      stepIndex,
      recipe: executionRecipe,
      step,
      componentSourceActors,
      timedStart: true,
    });
    const consumedItems = await this._consumeNativeIngredients(craftSelection.plan, {
      craftingActor,
      run,
      runManager,
      stepIndex,
    });
    // The deduction deliberately does not abort the craft on failure (clause 4 forbids
    // both aborting and rolling back), so the run must record what SETTLED rather than
    // what was planned — otherwise a cancel refunds currency the actor never paid.
    const currencySettlement = await this._spendCraftCurrency(
      craftingActor,
      executionRecipe,
      currencySpends
    );
    await this._deductItemPilesCurrencyCost(craftingActor, recipe);

    // Snapshot for the FINISH resume: essence quantities are precomputed here
    // because the source items are deleted before the check runs; the consumed
    // summary carries only what chat / history / property-macro ingredientPool need.
    const { resolvedEssences } = this._buildEssenceContext(
      consumedItems,
      executionRecipe,
      null,
      resolveComponent
    );
    // Enabled-ness is snapshotted HERE, at START, alongside the quantities (issue 1036):
    // evaluating the behaviour gate at FINISH would let a mid-run GM toggle change the
    // outcome of a craft whose inputs are already gone.
    const essenceEnabled = this._snapshotEssenceEnabled(
      resolvedEssences,
      this._getRecipeSystem(executionRecipe)
    );
    const consumedSummary = consumedItems.map((consumed) => ({
      ...mapConsumedIngredientRef(consumed),
      componentId:
        consumed.ingredient?.match?.componentId ??
        consumed.ingredient?.componentId ??
        consumed.ingredient?.systemItemId ??
        null,
    }));

    await runManager.markStepPrepared(craftingActor, run, stepIndex, {
      selectedIngredientSetId: ingredientSet.id,
      currencySpends: currencySettlement.settledSpends,
      resolvedEssences,
      essenceEnabled,
      consumedSummary,
    });

    // Only the acknowledged waiting transition releases the invocation guard.
    run.steps[stepIndex].historySettlement.awards = 'notApplicable';
    const armedRun = await runManager.markStepWaitingForTime(
      craftingActor,
      run,
      stepIndex,
      step.timeRequirement
    );
    const gate = armedRun.steps?.[stepIndex]?.timeGate;
    const remaining = Math.max(
      0,
      Math.ceil(Number(gate?.availableAt || 0) - Number(game.time?.worldTime || 0))
    );
    const stepLabel = step.name || `Step ${stepIndex + 1}`;
    return {
      resolved: true,
      result: {
        success: false,
        results: null,
        message: `Step "${stepLabel}" is still in progress (${remaining}s remaining)`,
        // A START is a SUCCESSFUL arming, not a failure: inputs are secured and the run is live.
        // `success` stays false because nothing was produced, so the disposition is what tells a
        // caller the two apart (issue 966).
        disposition: 'timed-start',
      },
    };
  }

  /**
   * FINISH phase of a time-gated step: the gate has matured, so this runs the crafting check and
   * creates results from the START-phase snapshot. Components and currency were consumed at
   * START, so it NEVER re-consumes, re-spends or refunds, and essence transfer uses the
   * precomputed `resolvedEssences` because the source items are deleted. A rolled failure only
   * breaks tools per the policy; a misconfigured or cancelled check leaves the run resumable.
   */
  async _finishTimedStep({
    craftingActor,
    componentSourceActors,
    recipe,
    step,
    stepIndex,
    options,
    presentTools,
    runManager,
    run,
  }) {
    const executionRecipe = this._buildStepRecipeView(recipe, step);
    const prepared = run.steps?.[stepIndex]?.preparedConsumption || {};
    const ingredientSet =
      executionRecipe.ingredientSets.find((s) => s.id === prepared.selectedIngredientSetId) || null;
    const resolvedEssences =
      prepared.resolvedEssences && typeof prepared.resolvedEssences === 'object'
        ? prepared.resolvedEssences
        : {};
    // Enabled-ness is read from the START snapshot, never live (issue 1036): a mid-run
    // toggle must not change the outcome of a craft whose inputs are already consumed.
    const essenceEnabled = this._resumedEssenceEnabled(prepared);
    const summary = Array.isArray(prepared.consumedSummary) ? prepared.consumedSummary : [];
    const consumedLiveItems = resolveLiveInventoryItemsByUuid(
      componentSourceActors,
      summary.map((entry) => entry?.itemUuid).filter(Boolean)
    );

    // Reconstruct lightweight consumed-item snapshots. The real Foundry items were
    // deleted at START, so these carry only what chat / history / property-macro
    // ingredientPool and essence transfer need.
    const consumedItems = summary.map((entry) => ({
      item: {
        uuid: entry.itemUuid ?? null,
        name: entry.name ?? null,
        img: entry.img ?? null,
        system: { quantity: entry.quantity },
        parent: entry.actorUuid ? { uuid: entry.actorUuid } : null,
      },
      quantity: entry.quantity,
      ingredient: entry.componentId
        ? { componentId: entry.componentId, systemItemId: entry.componentId }
        : null,
    }));
    // Route the reconstructed snapshots through the same mapper the immediate craft paths use, so
    // the persisted run refs carry the consume-time name/img and the summary's componentId — the
    // Journal projection falls back to it when a live lookup fails.
    const consumedRunRefs = consumedItems.map((consumed) => ({
      ...mapConsumedIngredientRef(consumed),
      componentId: consumed.ingredient?.componentId ?? null,
    }));

    // Tools are reusable and were NOT consumed at START, so re-resolve them here
    // for breakage (tied to the check outcome). A tool that went missing since
    // START simply yields no breakable pairs — the components are already spent.
    const toolsForSet =
      typeof this.recipeManager.getToolsForSet === 'function'
        ? this.recipeManager.getToolsForSet(executionRecipe, ingredientSet)
        : [];
    const toolValidation = await this._validateTools(
      componentSourceActors,
      executionRecipe,
      toolsForSet,
      presentTools,
      craftingActor,
      { excludedItems: consumedLiveItems }
    );
    const toolItems = toolValidation.valid ? toolValidation.tools || [] : [];

    const resolutionService =
      this.resolutionModeService || game.fabricate?.getResolutionModeService?.();

    const checkResult = await this._runCraftingCheck(
      executionRecipe,
      craftingActor,
      componentSourceActors,
      ingredientSet,
      step,
      {
        interactive: options?.interactive === true,
        toolItems,
      }
    );

    if (checkResult.misconfigured) {
      // GM-side gap: components stay consumed (no refund), but the run remains
      // active/resumable so a fixed check completes it later.
      return {
        resolved: true,
        result: { success: false, results: null, message: checkResult.message },
      };
    }
    if (checkResult.cancelled) {
      // Player dismissed the roll: retryable. Components stay consumed (no refund);
      // the run remains active so a later Finish can resolve it.
      return {
        resolved: true,
        result: { success: false, cancelled: true, results: null, message: 'Crafting cancelled' },
      };
    }

    await this._beginNativeStage({
      craftingActor,
      run,
      runManager,
      stepIndex,
      recipe: executionRecipe,
      step,
      componentSourceActors,
    });

    // Shared timed-step failure recorder: components are already gone (consumed at
    // START), so NEVER re-consume or refund — only break tools per the failure
    // policy, archive the failed run, and post the failure chat.
    const recordFailure = async (message) => {
      const failurePolicy = this._getFailureConsumptionPolicy(executionRecipe);
      let usedToolPairs = [];
      let usedTools = [];
      try {
        if (failurePolicy.breakToolsOnFail && toolItems.length > 0) {
          usedToolPairs = toolItems;
          const breakDecision = this._resolveCraftingBreakageDecision(
            this._getRecipeSystem(executionRecipe),
            executionRecipe,
            checkResult
          );
          usedTools = await this._applyToolBreakage(executionRecipe, toolItems, {
            forceBreak: breakDecision.forceBreak,
            authority: breakDecision.authority,
            reason: breakDecision.reason,
            triggerId: breakDecision.triggerId,
          });
        }
      } catch (breakageError) {
        console.error('Fabricate | Error during timed-step failure tool breakage:', breakageError);
      }
      // THE FAILURE AWARD, timed twin (issue 1098): a timed craft that fails must produce what an
      // immediate one would, because the delay is a scheduling property. The START snapshot is
      // threaded because the source items are already gone.
      const failureResults = await this._produceCraftingFailureResults({
        craftingActor,
        executionRecipe,
        step,
        ingredientSet,
        consumedItems,
        toolItems,
        checkResult,
        precomputedEssences: resolvedEssences,
      });
      await runManager.completeStepFailure(craftingActor, run, stepIndex, message, {
        selectedIngredientSetId: ingredientSet?.id,
        lastCheckResult: {
          success: false,
          reason: message,
          outcome: checkResult.outcome ?? undefined,
          value: checkResult.value ?? undefined,
          data: checkResult.data || {},
        },
        consumedIngredients: consumedRunRefs,
        usedTools,
        createdResults: awardReceipts(failureResults),
      });
      await this._postCraftChatMessage({
        success: false,
        craftingActor,
        recipe,
        consumedIngredients: consumedItems,
        tools: usedToolPairs,
        createdResults: failureResults,
        failureReason: message,
        rollValue: rollTotalForCard(checkResult),
        tierStep: tierStepForCard(checkResult),
      });
      return {
        resolved: true,
        result: {
          success: false,
          results: failureResults.length > 0 ? failureResults : null,
          message,
          ...(failureResults.length > 0 && { disposition: 'produced-on-failure' }),
        },
      };
    };

    if (!checkResult.success) {
      // Matched Simple alchemy attempt (timed twin): produce the reserved failure group and learn
      // WITHOUT re-consuming. Keyed on the RECIPE'S SYSTEM, never on `options.isAlchemyAttempt`
      // (issue 966), which `advanceCraftingRun` cannot carry.
      if (this._getAlchemyCheckMode(executionRecipe) === 'simple') {
        return this._finishAlchemySimpleFailure({
          craftingActor,
          componentSourceActors,
          recipe,
          executionRecipe,
          step,
          stepIndex,
          ingredientSet,
          consumedItems,
          consumedRunRefs,
          toolItems,
          resolvedEssences,
          checkResult,
          runManager,
          run,
        });
      }
      return recordFailure(checkResult.message || 'Crafting check failed');
    }
    if (
      resolutionService &&
      !resolutionService.validateCheckResult({ recipe: executionRecipe, checkResult })
    ) {
      return recordFailure(
        'Crafting check result does not satisfy current resolution mode requirements'
      );
    }

    // SUCCESS tool breakage (tied to the check outcome, applied here at FINISH).
    const successBreakDecision = this._resolveCraftingBreakageDecision(
      this._getRecipeSystem(executionRecipe),
      executionRecipe,
      checkResult
    );
    const usedTools = await this._applyToolBreakage(executionRecipe, toolItems, {
      forceBreak: successBreakDecision.forceBreak,
      authority: successBreakDecision.authority,
      reason: successBreakDecision.reason,
      triggerId: successBreakDecision.triggerId,
    });

    // Create results from the snapshot: essence transfer uses the precomputed
    // resolvedEssences (source items are deleted); chat/history/property-macro use
    // the snapshot consumedItems.
    const { items: resultItems, resolutionMeta } = await this._createResultItems(
      craftingActor,
      executionRecipe,
      step,
      ingredientSet,
      consumedItems,
      toolItems,
      checkResult,
      options?.resultGroupId || null,
      { precomputedEssences: resolvedEssences, essenceEnabled }
    );

    // Timed misconfiguration (issue 85). A timed step consumed its inputs at START, so this can
    // only record a failure with NO refund, never a zero-mutation abort. The shared predicate
    // covers `unrouted-tier`, which would otherwise complete as a false success with lost inputs.
    if (this._isMisconfigurationDisposition(resolutionMeta?.disposition)) {
      const message = resolutionMeta.error || 'Crafting resolution failed';
      await runManager.completeStepFailure(craftingActor, run, stepIndex, message, {
        selectedIngredientSetId: ingredientSet?.id,
        lastCheckResult: {
          success: false,
          reason: message,
          outcome: checkResult.outcome ?? undefined,
          value: checkResult.value ?? undefined,
          data: checkResult.data || {},
        },
        consumedIngredients: consumedRunRefs,
        usedTools,
      });
      await this._postCraftChatMessage({
        success: false,
        craftingActor,
        recipe,
        consumedIngredients: consumedItems,
        tools: toolItems,
        createdResults: [],
        failureReason: message,
        rollValue: rollTotalForCard(checkResult),
        tierStep: tierStepForCard(checkResult),
      });
      return {
        resolved: true,
        result: {
          success: false,
          results: null,
          message,
          disposition: resolutionMeta.disposition,
        },
      };
    }

    const completedRun = await runManager.completeStepSuccess(craftingActor, run, stepIndex, {
      selectedIngredientSetId: ingredientSet?.id,
      lastCheckResult: {
        success: true,
        reason: checkResult.message || 'Success',
        outcome: checkResult.outcome ?? undefined,
        value: checkResult.value ?? undefined,
        data: checkResult.data || {},
      },
      consumedIngredients: consumedRunRefs,
      usedTools,
      createdResults: awardReceipts(resultItems),
    });

    const visibilityService = game.fabricate?.getRecipeVisibilityService?.();
    if (visibilityService) {
      await visibilityService.applyRecipeItemUseOnCraft({
        recipe,
        craftingActor,
        componentSourceActors,
      });
      // Learn on match for a matured timed alchemy brew too, gated inside `learnRecipeOnCraft`.
      // Keyed on the recipe's own system for the reason given at the Simple-failure branch: the
      // resume path cannot carry `options.isAlchemyAttempt` (issue 966).
      if (this._getAlchemyCheckMode(recipe) !== null) {
        await visibilityService.learnRecipeOnCraft(recipe, craftingActor);
      }
    }

    // Component complications (issue 1286). The timed path reaches this point only
    // after the matured FINISH created its results and `completeStepSuccess` archived
    // the run, so the award is as committed here as it is on the immediate path.
    const firedComplications = await this._fireCraftComplications({
      actor: craftingActor,
      recipe: executionRecipe,
      step,
      checkResult,
      resolutionMeta,
    });

    await this._postCraftChatMessage({
      success: true,
      craftingActor,
      recipe,
      consumedIngredients: consumedItems,
      tools: toolItems,
      createdResults: resultItems,
      rollValue: rollTotalForCard(checkResult),
      tierStep: tierStepForCard(checkResult),
      firedComplications: firedComplications?.fired ?? null,
    });

    const stepLabel = step.name || `step ${stepIndex + 1}`;
    return {
      resolved: true,
      result: {
        success: true,
        results: resultItems,
        message:
          completedRun?.status === 'succeeded'
            ? `Successfully crafted ${recipe.name}`
            : `Completed ${stepLabel} for ${recipe.name}`,
      },
    };
  }

  /**
   * Produce the authored FAILURE result for a failed crafting check (issue 1098), or nothing —
   * the seam both crafting failure paths call so the two cannot diverge. `never` short-circuits
   * BEFORE any group is selected; `perRecord` and `always` are ONE predicate,
   * {@link activityPermitsFailureResults}, because the policy SELECTS an authored output and
   * never fabricates one. IT DECIDES NOTHING ABOUT COST: consumption and tool breakage are
   * governed by `craftingCheck.consumption` and applied by the caller BEFORE this runs.
   */
  async _produceCraftingFailureResults({
    craftingActor,
    executionRecipe,
    step,
    ingredientSet,
    consumedItems,
    toolItems,
    checkResult,
    resultGroupId = null,
    precomputedEssences = null,
    essenceEnabled = null,
  }) {
    if (!activityPermitsFailureResults(this._getRecipeSystem(executionRecipe), 'crafting')) {
      return [];
    }
    try {
      // PREFLIGHT THE DISPOSITION BEFORE CREATING ANYTHING. Resolution is pure and deterministic,
      // so asking it twice agrees with itself — the same argument the pre-consumption gate in
      // `craft()` makes. Asking after creation would be too late: the items would be on the actor.
      const resolutionService =
        this.resolutionModeService || game.fabricate?.getResolutionModeService?.();
      if (typeof resolutionService?.resolveResultGroups !== 'function') return [];
      const preflight = resolutionService.resolveResultGroups({
        recipe: executionRecipe,
        step,
        ingredientSet,
        checkResult,
        selectedResultGroupId: resultGroupId,
      });
      if (!this._isFailureAwardDisposition(preflight?.meta?.disposition)) return [];

      const { items } = await this._createResultItems(
        craftingActor,
        executionRecipe,
        step,
        ingredientSet,
        consumedItems,
        toolItems,
        checkResult,
        resultGroupId,
        { precomputedEssences, essenceEnabled }
      );
      return Array.isArray(items) ? items : [];
    } catch (error) {
      throw unconfirmedHistoryError(
        'Failure awards require reconciliation',
        error.receipts ?? [],
        error
      );
    }
  }

  /** Shared tail for a matched Simple alchemy FAILURE (immediate and timed alike): apply tool
   * breakage unless the caller already did, produce the reserved `role: 'failure'` group, record
   * the run as a failure, learn on match and post the distinct failure banner. Consumption
   * differs per caller, so it is passed in as `consumedItems`/`consumedRunRefs`. */
  async _produceAlchemyFailureResults({
    craftingActor,
    componentSourceActors,
    recipe,
    executionRecipe,
    step,
    stepIndex,
    ingredientSet,
    consumedItems,
    consumedRunRefs,
    toolItems,
    usedTools = null,
    resolvedEssences,
    resultGroupId = null,
    checkResult,
    runManager,
    run,
    mutationOptions = {},
  }) {
    let appliedTools = usedTools;
    if (appliedTools === null) {
      try {
        const breakDecision = this._resolveCraftingBreakageDecision(
          this._getRecipeSystem(executionRecipe),
          executionRecipe,
          checkResult
        );
        appliedTools = await this._applyToolBreakage(executionRecipe, toolItems, {
          forceBreak: breakDecision.forceBreak,
          authority: breakDecision.authority,
          reason: breakDecision.reason,
          triggerId: breakDecision.triggerId,
        });
      } catch (breakageError) {
        console.error(
          'Fabricate | Error during alchemy failure-result tool breakage:',
          breakageError
        );
        appliedTools = [];
      }
    }

    // Route to + produce the reserved failure group (the failed checkResult routes
    // `_resolveAlchemyResultGroups` there); empty/absent yields no items.
    const { items: resultItems } = await this._createResultItems(
      craftingActor,
      executionRecipe,
      step,
      ingredientSet,
      consumedItems,
      toolItems,
      checkResult,
      resultGroupId,
      { precomputedEssences: resolvedEssences }
    );

    if (runManager && run) {
      await runManager.completeStepFailure(
        craftingActor,
        run,
        stepIndex,
        checkResult.message || 'Crafting check failed',
        {
          selectedIngredientSetId: ingredientSet?.id,
          lastCheckResult: {
            success: false,
            reason: checkResult.message || 'Crafting check failed',
            outcome: checkResult.outcome ?? undefined,
            value: checkResult.value ?? undefined,
            data: checkResult.data || {},
          },
          consumedIngredients: consumedRunRefs,
          usedTools: appliedTools,
        },
        mutationOptions
      );
    }

    // Learn on MATCH regardless of pass/fail; `learnRecipeOnCraft` internally gates
    // on `alchemy.learnOnCraft === true`. Mirror the success path's recipe-item use.
    const visibilityService = game.fabricate?.getRecipeVisibilityService?.();
    if (visibilityService) {
      await visibilityService.applyRecipeItemUseOnCraft({
        recipe,
        craftingActor,
        componentSourceActors,
      });
      await visibilityService.learnRecipeOnCraft(recipe, craftingActor);
    }

    await this._postCraftChatMessage({
      success: false,
      craftingActor,
      recipe,
      consumedIngredients: consumedItems,
      tools: appliedTools,
      createdResults: resultItems,
      failureReason: checkResult.message || 'Crafting check failed',
      rollValue: rollTotalForCard(checkResult),
      tierStep: tierStepForCard(checkResult),
    });

    return {
      resolved: true,
      result: {
        success: false,
        results: resultItems.length > 0 ? resultItems : null,
        message: checkResult.message || 'FABRICATE.Alchemy.FailureResult',
        disposition: 'produced-on-failure',
      },
    };
  }

  /** Timed twin of {@link _resolveAlchemySimpleFailure}. Components were already consumed at
   * START, so this NEVER re-consumes — it defers to {@link _produceAlchemyFailureResults} using
   * the START snapshot (`resolvedEssences`). */
  async _finishAlchemySimpleFailure({
    craftingActor,
    componentSourceActors,
    recipe,
    executionRecipe,
    step,
    stepIndex,
    ingredientSet,
    consumedItems,
    consumedRunRefs,
    toolItems,
    resolvedEssences,
    checkResult,
    runManager,
    run,
  }) {
    return this._produceAlchemyFailureResults({
      craftingActor,
      componentSourceActors,
      recipe,
      executionRecipe,
      step,
      stepIndex,
      ingredientSet,
      consumedItems,
      consumedRunRefs,
      toolItems,
      usedTools: null,
      resolvedEssences,
      resultGroupId: null,
      checkResult,
      runManager,
      run,
      mutationOptions: {},
    });
  }

  /** Produce the reserved failure result group for a matched Simple alchemy attempt whose check
   * FAILED (the immediate `craft()` path). Consumes per `alchemy.consumeOnFail`, NOT the generic
   * `_getFailureConsumptionPolicy`, then defers to {@link _produceAlchemyFailureResults}. */
  async _resolveAlchemySimpleFailure({
    craftingActor,
    componentSourceActors,
    recipe,
    executionRecipe,
    step,
    stepIndex,
    ingredientSet,
    craftSelection,
    currencySpends,
    toolValidation,
    checkResult,
    options,
    runManager,
    run,
  }) {
    const system = this._getRecipeSystem(executionRecipe);
    const consumeOnFail = system?.alchemy?.consumeOnFail !== false;

    let consumedItems = [];
    let usedTools = [];
    try {
      if (consumeOnFail) {
        consumedItems = await this._consumeNativeIngredients(craftSelection.plan, {
          craftingActor,
          run,
          runManager,
          stepIndex,
        });
        await this._consumeAlchemyExtraItems(consumedItems, componentSourceActors, options);
        await this._saveNativeConsumption(consumedItems, {
          craftingActor,
          run,
          runManager,
          stepIndex,
        });
        await this._spendCraftCurrency(craftingActor, executionRecipe, currencySpends);
      }
      const breakDecision = this._resolveCraftingBreakageDecision(
        system,
        executionRecipe,
        checkResult
      );
      usedTools = await this._applyToolBreakage(executionRecipe, toolValidation.tools, {
        forceBreak: breakDecision.forceBreak,
        authority: breakDecision.authority,
        reason: breakDecision.reason,
        triggerId: breakDecision.triggerId,
      });
    } catch (consumptionError) {
      if (consumptionError.code === 'HISTORY_EFFECT_UNCERTAIN') throw consumptionError;
      console.error(
        'Fabricate | Error during alchemy failure-result consumption:',
        consumptionError
      );
    }

    const consumedRunRefs = consumedItems.map(mapConsumedIngredientRef);

    // Build a tier-4-aware essence snapshot over the consumed items (issue 578) so the reserved
    // Simple-failure group's effect transfer credits a purely-tier-4 submission its component's
    // essences, mirroring how the timed twin forwards the START snapshot.
    const { resolvedEssences } = this._buildEssenceContext(
      consumedItems,
      executionRecipe,
      null,
      this._alchemyComponentResolver(options)
    );

    return this._produceAlchemyFailureResults({
      craftingActor,
      componentSourceActors,
      recipe,
      executionRecipe,
      step,
      stepIndex,
      ingredientSet,
      consumedItems,
      consumedRunRefs,
      toolItems: toolValidation.tools,
      usedTools,
      resolvedEssences,
      resultGroupId: options?.resultGroupId || null,
      checkResult,
      runManager,
      run,
    });
  }

  /**
   * Attempt to craft using the alchemy discovery mode. Submitted items are matched against the
   * component signatures of all enabled recipes; recipe names and ingredient lists stay hidden.
   * Requires `resolutionMode: 'alchemy'`.
   *
   * @param {Array<{item: object, componentId: string}>} submittedItems Pre-bucketed records from
   *   {@link resolveAlchemySubmissions} (issue 572). The engine CONSUMES the bucketed
   *   `componentId` rather than re-deriving identity, so palette, collector and engine agree.
   */
  async craftAlchemy(craftingActor, componentSourceActors, submittedItems, options = {}) {
    if (options?.lifecycleVersion === 1 && !options?.[VERSIONED_EXECUTION_CONTEXT]) {
      const requestStart = this.versionedRunAuthority?.requestStart;
      if (typeof requestStart !== 'function') return authorityUnavailableResult();
      return requestStart({
        activityKind: 'alchemy',
        actor: craftingActor,
        sourceActors: componentSourceActors,
        craftingSystemId: options.craftingSystemId,
        submittedItems: (submittedItems || []).map((entry) => ({
          itemUuid: entry?.item?.uuid ?? entry?.item?.id ?? null,
          componentId: entry?.componentId ?? null,
        })),
        completionMode: options?.completionMode || 'manual',
      });
    }
    if (!craftingActor) {
      return {
        success: false,
        results: null,
        message: 'No crafting actor selected',
        disposition: 'error',
      };
    }
    if (!componentSourceActors?.length) {
      return {
        success: false,
        results: null,
        message: 'No component source actors selected',
        disposition: 'error',
      };
    }
    if (!submittedItems?.length) {
      return {
        success: false,
        results: null,
        message: 'No ingredients submitted',
        disposition: 'error',
      };
    }

    const systemManager = game.fabricate?.getCraftingSystemManager?.();
    const systemId = options.craftingSystemId;
    const system = systemManager?.getSystem(systemId);
    if (!system || system.resolutionMode !== 'alchemy') {
      return {
        success: false,
        results: null,
        message: 'No alchemy-mode crafting system found',
        disposition: 'error',
      };
    }

    const recipeManager = this.recipeManager || game.fabricate?.getRecipeManager?.();
    const systemRecipes = recipeManager
      ? recipeManager.getRecipes({ craftingSystemId: systemId, enabled: true })
      : [];
    const signatureValidator =
      options.signatureValidator ||
      new SignatureValidator({
        getSystem: (id) => systemManager.getSystem(id),
        getRecipesForSystem: (id) =>
          recipeManager ? recipeManager.getRecipes({ craftingSystemId: id, enabled: true }) : [],
        getComponentsForSystem: (id) => {
          const sys = systemManager.getSystem(id);
          return resolvedComponentsFor(sys);
        },
      });

    const components = resolvedComponentsFor(system);
    const recipes = systemRecipes;
    // The bare owned items, for the uuid/essence-keyed paths (consumption and essence
    // accumulation) that must key on the item, not its bucketed component id.
    const submissionItems = submittedItems.map((record) => record.item);
    const matchResult = this._matchAlchemySignature(
      submittedItems,
      recipes,
      components,
      signatureValidator,
      { system }
    );

    const alchemyCfg = system.alchemy || {};
    const shouldConsume = alchemyCfg.consumeOnFail !== false;

    if (!matchResult.matched) {
      const runManager = this.craftingRunManager || game.fabricate?.getCraftingRunManager?.();
      if (options.runId)
        assertNativeEffectsUninvoked(runManager?.getRun(craftingActor, options.runId));
      const fizzle = await runManager?.recordFizzle(craftingActor, {
        craftingSystemId: systemId,
        userId: game.user?.id ?? null,
        resolutionSnapshot: { kind: 'none', mode: 'alchemy' },
        createdResults: [],
        historySettlement: {
          consumption: shouldConsume ? 'pending' : 'notApplicable',
          awards: 'complete',
        },
      });
      let consumed = [];
      try {
        await this._recordAlchemyDeadEnd(craftingActor, systemId, submittedItems, alchemyCfg);
        if (shouldConsume)
          consumed = await this._consumeSubmittedAlchemyItems(
            componentSourceActors,
            submissionItems
          );
        if (fizzle)
          await runManager.settleHistory(craftingActor, fizzle.id, {
            consumedIngredients: consumed,
            historySettlement: {
              consumption: shouldConsume ? 'complete' : 'notApplicable',
              awards: 'complete',
            },
          });
      } catch (error) {
        if (fizzle)
          await runManager.settleHistory(craftingActor, fizzle.id, {
            consumedIngredients: error.historyField === 'consumption' ? error.receipts : consumed,
            historySettlement: { consumption: 'uncertain', awards: 'complete' },
          });
        throw error;
      }
      return {
        success: false,
        results: null,
        message: 'FABRICATE.Alchemy.NoMatch',
        disposition: 'no-match',
        consumed: shouldConsume,
        runId: fizzle?.id ?? null,
      };
    }

    const recipe = matchResult.recipe;
    const ingredientSetId = matchResult.ingredientSetId;
    return this.craft(craftingActor, componentSourceActors, recipe, ingredientSetId, {
      ...options,
      isAlchemyAttempt: true,
      alchemySubmittedItems: submissionItems,
      // An alchemy brew has no requirement rail and no player-chosen essence funding: the recipe
      // and its ingredient set are DISCOVERED by matching the submission, so any allocation
      // riding on `options` was scoped to something else entirely (issue 917).
      ingredientEssenceAllocation: null,
    });
  }

  /**
   * Match submitted items against all recipe signatures in the system.
   *
   * Matching is quantity-aware and counts by OCCURRENCE: the workbench expands a stack into one
   * submission per unit, so a submission contributes at most one unit per group and stack
   * quantities are never read, differing deliberately from
   * {@link IngredientSet#resolveIngredientSelection}. Component identity is NOT resolved here
   * (issue 572): each record arrives already bucketed by the collector's shared resolver.
   */
  _matchAlchemySignature(submittedItems, recipes, components, signatureValidator, options = {}) {
    const system = options?.system;

    // Consume the component id each submission was bucketed to ONCE at the collector (issue 572),
    // never re-deriving identity here; `null` when it resolved to no component. Re-resolving per
    // candidate would double-count a submission matching several components of one group.
    const resolvedComponentIds = submittedItems.map((record) => record?.componentId ?? null);

    // Count submissions whose resolved component id is one of the given ids. Each resolved to
    // exactly one component, so it contributes at most one unit toward a group.
    const availableForComponentIds = (componentIds) => {
      const idSet = componentIds instanceof Set ? componentIds : new Set(componentIds);
      let available = 0;
      for (const resolvedId of resolvedComponentIds) {
        if (resolvedId != null && idSet.has(resolvedId)) available += 1;
      }
      return available;
    };

    // Check whether the system supports essences
    const essencesEnabled = system?.features?.essences === true;

    // Accumulate essences from the PRE-BUCKETED submission records (duplicates count multiple
    // times). Reading the collector's `componentId`, rather than the tier-4-blind
    // `findMatchingComponent`, keeps essence attribution on the id group counting reads.
    let submittedEssences = null;
    if (essencesEnabled) {
      submittedEssences = accumulateSubmissionEssences(submittedItems, {
        components,
        systemId: system?.id,
      });
    }

    // A group is essence-only iff every one of its options is an essence match. When
    // essences are disabled, such a group is inert (issue 649 group-granular rule).
    const isEssenceOnlyGroup = (group) => {
      const opts = Array.isArray(group?.options) ? group.options : [];
      return opts.length > 0 && opts.every((option) => option?.match?.type === 'essence');
    };

    // Whether a single group is satisfied by the submitted multiset: options are alternatives, so
    // any one satisfying option satisfies the group. An essence option is amount-based, not
    // occurrence-based, and is ignored under `skipEssence` so the group falls to its other arm.
    const groupSatisfied = (group, groupComponentIds, skipEssence) => {
      const groupOptions = Array.isArray(group?.options) ? group.options : [];
      if (groupOptions.length === 0) {
        // No structured options (defensive): fall back to mere presence in the
        // merged component-ID set for this group.
        return availableForComponentIds(groupComponentIds) > 0;
      }
      return groupOptions.some((option) => {
        if (option?.match?.type === 'essence') {
          if (skipEssence) return false;
          const essenceId = String(option.match.essenceId || '').trim();
          const amount = Math.max(0, Number(option.match.amount) || 0);
          // A no-op essence option (id-less / zero amount) is trivially satisfied.
          if (!essenceId || amount <= 0) return true;
          return (submittedEssences?.[essenceId] || 0) >= amount;
        }
        const optionComponentIds = signatureValidator.expandIngredientToComponentIds(
          option,
          components
        );
        const required = Math.max(1, Number(option?.quantity) || 1);
        return availableForComponentIds(optionComponentIds) >= required;
      });
    };

    // Collect EVERY set that matches this submission, then resolve the unique most-specific one
    // (issue 774) instead of early-returning the first authored match: a superset submission can
    // satisfy several nested sets, and an incomparable tie must fail safe rather than pick one.
    const candidates = [];
    for (const recipe of recipes) {
      if (!recipe.enabled) continue;
      const ingredientSets = Array.isArray(recipe.ingredientSets) ? recipe.ingredientSets : [];
      for (const set of ingredientSets) {
        // The signature is computed 1:1 from `set.ingredientGroups`, so they align by index.
        // Counting is by submission occurrence, not by summed stack quantity.
        const signature = signatureValidator.computeSignature(set, components);
        const groups = Array.isArray(set.ingredientGroups) ? set.ingredientGroups : [];
        // Legacy back-compat READ of the retired per-set essences map (one release):
        // migrated data carries essences as groups instead, so `setEssences` is {}.
        const setEssences = set.essences || {};
        const hasEssences = essencesEnabled && Object.keys(setEssences).length > 0;

        if (!essencesEnabled) {
          // Group-granular essences-disabled rule (issue 649): evaluate only the non-essence-only
          // groups and skip essence options inside them, so a set whose every group is
          // essence-only is unmatchable.
          const nonEssenceGroupIndexes = [];
          for (const [index, group] of groups.entries()) {
            if (!isEssenceOnlyGroup(group)) nonEssenceGroupIndexes.push(index);
          }
          if (nonEssenceGroupIndexes.length === 0) continue;
          const allGroupsSatisfied = nonEssenceGroupIndexes.every((index) =>
            groupSatisfied(groups[index], signature[index], true)
          );
          if (allGroupsSatisfied) {
            candidates.push({ recipe, ingredientSetId: set.id, signature, set });
          }
          continue;
        }

        // Essences enabled: evaluate every group (essence options amount-based).
        // Skip sets that carry neither ingredient groups nor a legacy essence map.
        if (signature.length === 0 && !hasEssences) continue;

        const allGroupsSatisfied = signature.every((groupComponentIds, groupIndex) =>
          groupSatisfied(groups[groupIndex], groupComponentIds, false)
        );

        // Legacy per-set essences map (back-compat read): AND-required as before.
        let essencesSatisfied = true;
        if (hasEssences && submittedEssences) {
          for (const [essenceType, requiredQty] of Object.entries(setEssences)) {
            if ((submittedEssences[essenceType] || 0) < requiredQty) {
              essencesSatisfied = false;
              break;
            }
          }
        }

        if (allGroupsSatisfied && essencesSatisfied) {
          candidates.push({ recipe, ingredientSetId: set.id, signature, set });
        }
      }
    }

    // The specificity tiebreak is only consulted when more than one set matched, so
    // defer computing each candidate's `groupOptions` (the domination input) until
    // then — a single match returns directly and never needs it.
    if (candidates.length > 1) {
      for (const candidate of candidates) {
        candidate.groupOptions = signatureValidator.computeGroupOptions(candidate.set, components);
      }
    }
    return resolveMostSpecificSignatureMatch(candidates);
  }

  /**
   * For a matched alchemy attempt, consume any submitted items that standard ingredient matching
   * did not already consume (essence-option contributors and surplus). Mutates `consumedItems`
   * in place with `{ item, quantity, ingredient: null }` entries. Shared by the success path AND
   * the Simple failure path so a matched fail consumes the same submitted multiset as a pass.
   * No-op unless this is an alchemy attempt carrying `alchemySubmittedItems`.
   */
  async _consumeAlchemyExtraItems(consumedItems, componentSourceActors, options) {
    if (!options?.isAlchemyAttempt || !Array.isArray(options?.alchemySubmittedItems)) return;
    const alreadyConsumedUuids = new Set(consumedItems.map((c) => c.item.uuid));
    const essenceConsumeCounts = new Map();
    for (const item of options.alchemySubmittedItems) {
      if (item.uuid && !alreadyConsumedUuids.has(item.uuid)) {
        essenceConsumeCounts.set(item.uuid, (essenceConsumeCounts.get(item.uuid) || 0) + 1);
      }
    }
    const plan = componentSourceActors
      .flatMap((actor) => [...(actor.items || [])])
      .filter((item) => essenceConsumeCounts.has(item.uuid))
      .map((item) => ({ item, quantity: essenceConsumeCounts.get(item.uuid), ingredient: null }));
    try {
      if (plan.length !== essenceConsumeCounts.size)
        throw unconfirmedHistoryError('Submitted alchemy Items are missing');
      consumedItems.push(...(await this._consumeIngredients(plan)));
    } catch (error) {
      const failure = unconfirmedHistoryError(
        'Alchemy consumption requires reconciliation',
        [...consumedItems.map(mapConsumedIngredientRef), ...(error.receipts ?? [])],
        error
      );
      failure.historyField = 'consumption';
      throw failure;
    }
  }

  /**
   * Consume submitted alchemy items (no-match failure path).
   * Best-effort: removes items by UUID from component source actors.
   */
  async _consumeSubmittedAlchemyItems(componentSourceActors, submittedItems) {
    const consumeCounts = new Map();
    for (const item of submittedItems) {
      if (item.uuid) {
        consumeCounts.set(item.uuid, (consumeCounts.get(item.uuid) || 0) + 1);
      }
    }
    const available = componentSourceActors.flatMap((actor) => [...(actor.items || [])]);
    const plan = [];
    for (const [uuid, quantity] of consumeCounts) {
      const matches = available.filter((item) => item.uuid === uuid);
      if (matches.length !== 1)
        throw unconfirmedHistoryError('Submitted alchemy Item identity is unavailable');
      plan.push({ item: matches[0], quantity });
    }
    return (await this._consumeIngredients(plan)).map(mapConsumedIngredientRef);
  }

  /**
   * Map submission records to a plain-component multiset `{ componentId: units }` from the SAME
   * `componentId` each was bucketed to at the collector (issue 572), so the dead-end key can
   * never drift from the signature {@link _matchAlchemySignature} matched against. Each record
   * contributes at most one unit; a record with no component id is skipped.
   */
  _submittedComponentMultiset(submittedItems) {
    const multiset = {};
    for (const record of Array.isArray(submittedItems) ? submittedItems : []) {
      const componentId = record?.componentId;
      if (!componentId) continue;
      multiset[componentId] = (multiset[componentId] || 0) + 1;
    }
    return multiset;
  }

  /**
   * Record a fizzled alchemy attempt's canonical signature key on the crafting actor, under a
   * per-system append-only, deduped array (`alchemyDeadEnds[craftingSystemId] = [signatureKey]`).
   * Written ONLY when the system's `showAttemptHistoryToPlayers` is true. No-ops on an empty or
   * duplicate key, or an actor without flag support.
   */
  async _recordAlchemyDeadEnd(craftingActor, systemId, submittedItems, alchemyCfg) {
    if (alchemyCfg?.showAttemptHistoryToPlayers !== true) return;
    if (!systemId || typeof craftingActor?.setFlag !== 'function') return;
    const key = canonicalSignatureKey(this._submittedComponentMultiset(submittedItems));
    if (!key) return;
    const deadEnds = getFabricateFlag(craftingActor, 'alchemyDeadEnds', {});
    const current = deadEnds && typeof deadEnds === 'object' ? deadEnds : {};
    const forSystem = Array.isArray(current[systemId]) ? current[systemId] : [];
    if (forSystem.includes(key)) return;
    await setFabricateFlag(craftingActor, 'alchemyDeadEnds', {
      ...current,
      [systemId]: [...forSystem, key],
    });
  }

  /**
   * Deduct the chosen currency spends for a craft, after item consumption; the afford gate in
   * {@link craft} already confirmed affordability, so a spend failure is logged, never refunded,
   * and does not abort the craft. It RETURNS the settlement (issue 902), which only the
   * time-gated START path consumes, because only it persists a record a later cancel reversal
   * would hand back. Never throws: a thrown deduction reports total non-settlement.
   */
  async _spendCraftCurrency(craftingActor, recipe, currencySpends) {
    if (!currencySpends?.length) return { valid: true, groups: [], settledSpends: [] };
    try {
      const result = await spendCurrencySpends(
        craftingActor,
        recipe,
        currencySpends,
        this._currencySeams()
      );
      if (!result?.valid) {
        console.error('Fabricate | Currency deduction reported failure', result?.message);
      }
      return {
        valid: result?.valid === true,
        message: result?.message,
        groups: Array.isArray(result?.groups) ? result.groups : [],
        settledSpends: Array.isArray(result?.settledSpends) ? result.settledSpends : [],
      };
    } catch (error) {
      console.error('Fabricate | Currency deduction error', error);
      return { valid: false, groups: [], settledSpends: [] };
    }
  }

  /**
   * Refund the currency a craft spent at START — the inverse of {@link _spendCraftCurrency}. A
   * failure is logged, never thrown, so a cancel that cannot refund still removes the run. FAILS
   * CLOSED (issue 902): a refund that throws reports total failure with NO group detail, and
   * absent detail is read as unknown-and-failed.
   */
  async _refundCraftCurrency(craftingActor, recipe, currencySpends) {
    if (!currencySpends?.length) return { valid: true, groups: [] };
    try {
      const result = await refundCurrencySpends(
        craftingActor,
        recipe,
        currencySpends,
        this._currencySeams()
      );
      if (!result?.valid) {
        console.error('Fabricate | Currency refund reported failure', result?.message);
      }
      return {
        valid: result?.valid === true,
        message: result?.message,
        groups: Array.isArray(result?.groups) ? result.groups : [],
      };
    } catch (error) {
      console.error('Fabricate | Currency refund error', error);
      return { valid: false, groups: [] };
    }
  }

  /**
   * Recreate a single consumed component's item back on an actor (issue 848), mirroring
   * {@link _createSingleResult}: the component's `registeredItemUuid` source item is cloned, the
   * quantity is set, and the durable per-system component identity is stamped so the restored
   * item resolves to its OWN component. With no component/source, a lightweight item is built
   * from the consume-time name/img snapshot so the player gets a stand-in rather than nothing.
   */
  async _restoreComponentItem({ actor, system, componentId, quantity, name, img }) {
    if (!actor || typeof actor.createEmbeddedDocuments !== 'function') return null;
    const qty = Math.max(0, Math.trunc(Number(quantity) || 0));
    if (qty <= 0) return null;

    const component = findById(getDefinitionIndex(resolvedComponentsFor(system)), componentId);
    let sourceItem = null;
    if (component?.registeredItemUuid) {
      try {
        sourceItem = (await fromUuid(component.registeredItemUuid)) ?? null;
      } catch {
        sourceItem = null;
      }
    }

    let itemData;
    if (sourceItem) {
      itemData = sourceItem.toObject();
    } else if (component) {
      itemData = {
        name: component.name || name || 'Restored Item',
        img: component.img || img || 'icons/svg/item-bag.svg',
        type: 'loot',
        system: {},
      };
    } else if (name) {
      // No managed component to resolve (e.g. an unmanaged submission): rebuild a
      // stand-in from the consume-time snapshot so nothing is silently lost.
      itemData = { name, img: img || 'icons/svg/item-bag.svg', type: 'loot', system: {} };
    } else {
      return null;
    }

    itemData.system ??= {};
    setStackQuantity(itemData, qty);
    if (component?.id) {
      stampCraftedComponentIdentity(itemData, system?.id, component.id);
    }
    const [created] = await actor.createEmbeddedDocuments('Item', [itemData]);
    return created ?? null;
  }

  /**
   * Restore every consumed ingredient captured in a step's START-phase snapshot back onto its
   * source actor (issue 848), falling back to the crafting actor when the recorded source actor
   * no longer resolves.
   */
  async _restoreConsumedIngredients(craftingActor, systemId, consumedSummary = []) {
    const systemManager = game.fabricate?.getCraftingSystemManager?.();
    const system = systemManager?.getSystem(systemId) || null;
    const restored = [];
    let failures = 0;
    for (const entry of Array.isArray(consumedSummary) ? consumedSummary : []) {
      // Best-effort per entry: a create that throws (permission, invalid item type)
      // must NOT abort the reversal or propagate out of cancelCraft — otherwise the
      // run would stay active and re-cancelling it would double-restore the entries
      // that already succeeded. Record the failure and continue.
      // A degenerate zero-quantity entry is nothing to restore, not a failure.
      const qty = Math.max(0, Math.trunc(Number(entry?.quantity) || 0));
      if (qty <= 0) continue;
      try {
        const targetActor = this._resolveRestoreActor(craftingActor, entry?.actorUuid);
        const item = await this._restoreComponentItem({
          actor: targetActor,
          system,
          componentId: entry?.componentId ?? null,
          quantity: qty,
          name: entry?.name ?? null,
          img: entry?.img ?? null,
        });
        if (item) restored.push(item);
        else failures += 1;
      } catch (error) {
        console.error('Fabricate | Failed to restore a cancelled craft ingredient:', error);
        failures += 1;
      }
    }
    return { restored, failures };
  }

  /**
   * Resolve the actor a consumed ingredient should be restored to: the recorded
   * source actor uuid, or the crafting actor when it no longer resolves.
   */
  _resolveRestoreActor(craftingActor, actorUuid) {
    if (actorUuid && typeof globalThis.fromUuidSync === 'function') {
      try {
        const resolved = globalThis.fromUuidSync(actorUuid);
        if (resolved) return resolved;
      } catch {
        /* fall through to crafting actor */
      }
    }
    return craftingActor;
  }

  /**
   * Reverse the START-phase consumption of an in-progress run — restore consumed ingredients and
   * refund spent currency for every step CONSUMED but not yet resolved. The shared "un-consume"
   * primitive for player self-cancel (issue 848) and GM cancel/reverse (issue 847); it never
   * touches the run record, so callers own removing or archiving it.
   *
   * Best-effort: per-entry restore failures are caught so a throw can never strand the run
   * active, `ok` reports whether the reversal was COMPLETE, and the currency half reports a
   * `currencyRefund` VALUE rather than a boolean (issue 902) — read `status`, never the object.
   */
  async reverseRunConsumption(craftingActor, run) {
    const restored = [];
    let restoreFailures = 0;
    let currencyAttempted = false;
    let currencyFailed = false;
    let refundedGroups = 0;
    const recipe = this.recipeManager?.getRecipe?.(run?.recipeId) ?? {
      craftingSystemId: run?.craftingSystemId ?? null,
    };
    const steps = Array.isArray(run?.steps) ? run.steps : [];
    for (const step of steps) {
      const prepared = step?.preparedConsumption;
      // Only a consumed-but-not-produced step holds recoverable inputs. A resolved
      // step (succeeded/failed) already turned its inputs into an outcome.
      if (!prepared || step.status === 'succeeded' || step.status === 'failed') continue;
      const outcome = await this._restoreConsumedIngredients(
        craftingActor,
        run?.craftingSystemId,
        prepared.consumedSummary
      );
      restored.push(...outcome.restored);
      restoreFailures += outcome.failures;
      // The record holds only the spends that SETTLED, so an empty array correctly skips
      // the refund: there is nothing the actor paid and nothing to hand back.
      if (Array.isArray(prepared.currencySpends) && prepared.currencySpends.length > 0) {
        currencyAttempted = true;
        const refund = await this._refundCraftCurrency(
          craftingActor,
          recipe,
          prepared.currencySpends
        );
        // Count the groups that DEMONSTRABLY came back. Absent group detail (a refund that
        // threw) therefore counts zero — unknown-and-failed, never "all refunded".
        refundedGroups += (refund?.groups || []).filter((group) => group.refunded === true).length;
        // Any failed refund makes the whole reversal incomplete (fail-closed on truth).
        if (refund?.valid !== true) currencyFailed = true;
      }
    }
    const currencyRefund = this._currencyRefundOutcome({
      attempted: currencyAttempted,
      failed: currencyFailed,
      refundedGroups,
    });
    // A refund that was never attempted is not a failure; the reversal is complete only
    // when nothing failed to restore and no attempted currency refund reported failure.
    const ok =
      restoreFailures === 0 &&
      (currencyRefund.status === 'none' || currencyRefund.status === 'full');
    return { restored, restoreFailures, currencyAttempted, currencyRefund, ok };
  }

  /**
   * Classify a reversal's currency refund (issue 902). `none` means it was never attempted, and
   * is neither a success nor a failure; `partial` requires at least one group demonstrably back.
   */
  _currencyRefundOutcome({ attempted, failed, refundedGroups }) {
    let status = 'full';
    if (!attempted) status = 'none';
    else if (failed) status = refundedGroups > 0 ? 'partial' : 'failed';
    return { attempted, refundedGroups, status };
  }

  /**
   * Cancel a player's in-progress craft (issue 848). Owner-scoped: the craft engine writes items
   * directly with no GM relay, so a player may cancel only a run on an OWNED actor. The run is
   * archived as `cancelled`, nothing is produced, any rolled check outcome is discarded, and —
   * when `features.refundOnPlayerCancel` is on (default) — {@link reverseRunConsumption} restores
   * the START-phase consumption. With the flag off the inputs are forfeit. The recipe becomes
   * craftable again either way; `options.refund` overrides the system flag.
   */
  async cancelCraft(craftingActor, componentSourceActors, runId, options = {}) {
    // Owner scope: refuse a cancel on an actor the caller demonstrably does not own.
    // The advance/cancel edge already guards via resolveAdvanceSources; this is a
    // defensive fail-closed for a non-owner reaching the engine directly.
    if (craftingActor?.isOwner === false) {
      return { success: false, message: 'You must own this character to cancel its craft.' };
    }
    const runManager = this.craftingRunManager || game.fabricate?.getCraftingRunManager?.();
    if (!runManager) {
      return { success: false, message: 'Crafting runs are not available.' };
    }
    const run = runManager.getActiveRun(craftingActor, runId);
    if (!run) {
      return { success: false, message: 'There is no in-progress craft to cancel.' };
    }
    const lifecycleContract = getRunLifecycleContract(run);
    if (lifecycleContract === 'legacy')
      for (const step of run.steps ?? []) assertNativeEffectsUninvoked(step);
    if (lifecycleContract === 'unsupported') {
      return versionedFailure('The crafting run lifecycle version is unsupported.');
    }
    if (lifecycleContract === 'current') {
      const requestCancel = this.versionedRunAuthority?.requestCancel;
      if (typeof requestCancel !== 'function') return authorityUnavailableResult();
      return requestCancel({
        actor: craftingActor,
        componentSourceActors,
        runId,
        expectedRevision: run.runRevision,
      });
    }

    const refundIntended = this._shouldRefundOnCancel(run, options);
    let restoredCount = 0;
    let reversalOk = true;
    let partialRefund = false;
    try {
      if (refundIntended) {
        const reversal = await this.reverseRunConsumption(craftingActor, run);
        restoredCount = reversal.restored.length;
        reversalOk = reversal.ok;
        // A partial reversal (some inputs back, some lost) is worth flagging distinctly
        // from a total failure so callers can message honestly. Both operands must be
        // re-derived rather than read from `currencyRefund` directly: it is an OBJECT and
        // would collapse this whole expression to `!reversal.ok` in boolean context. A
        // refund that was never attempted recovered nothing, so it is not partial either.
        const currencyRecovered = reversal.currencyRefund.refundedGroups > 0;
        partialRefund = !reversal.ok && (reversal.restored.length > 0 || currencyRecovered);
      }
    } finally {
      // Always archive the run, even if the reversal threw or partially failed, so the
      // run can never be re-cancelled (which would double-restore the succeeded entries).
      await runManager.cancelRun(craftingActor, runId);
    }

    // Report the ACTUAL outcome, not the policy intent: `refunded` is true only when a
    // refund was intended AND the reversal completed fully.
    return {
      success: true,
      cancelled: true,
      refunded: refundIntended && reversalOk,
      partialRefund,
      restoredCount,
    };
  }

  /**
   * Whether a player cancel should refund the consumed inputs. An explicit `options.refund` wins;
   * otherwise the owning system's `features.refundOnPlayerCancel` decides, defaulting ON.
   */
  _shouldRefundOnCancel(run, options = {}) {
    if (typeof options.refund === 'boolean') return options.refund;
    const system = game.fabricate?.getCraftingSystemManager?.()?.getSystem?.(run?.craftingSystemId);
    return system?.features?.refundOnPlayerCancel !== false;
  }

  /**
   * Resolve the single craft selection for a step: the widened ingredient-set selection with the
   * currency afford probe bound to the crafting actor, carrying the item `plan` and the
   * `currencySpends`. Computed ONCE in {@link craft} so consumption and the currency spend never
   * diverge. `resolveComponent` is the alchemy-path resolver (issue 578); `essenceAllocation` is
   * the player's step-scoped funding (issue 917), so the consumed plan is exactly what the
   * requirement rail displayed.
   */
  _resolveCraftSelection(
    componentSourceActors,
    ingredientSet,
    recipe,
    craftingActor,
    resolveComponent,
    optionOverrides = null,
    essenceAllocation = null
  ) {
    const availableItems = pooledItemOrder(componentSourceActors);
    const matcher = (ingredient, item) =>
      this.recipeManager.ingredientMatchesItem(recipe, ingredient, item, resolveComponent);
    if (typeof ingredientSet?.resolveIngredientSelection === 'function') {
      const affordCurrency = buildCurrencyAffordProbe(craftingActor, recipe, this._currencySeams());
      // Bind the component-aware essence resolver so an essence GROUP option consumes
      // items carrying that essence at craft time (issue 649).
      const resolveItemEssences =
        typeof this.recipeManager?._buildEssenceOptionResolver === 'function'
          ? this.recipeManager._buildEssenceOptionResolver(recipe, resolveComponent)
          : undefined;
      return ingredientSet.resolveIngredientSelection(availableItems, matcher, {
        affordCurrency,
        optionOverrides,
        essenceAllocation,
        resolveItemEssences,
      });
    }
    // Back-compat: an ingredient set exposing only matchIngredients (older duck-typed
    // shapes) yields an item-only plan with no currency spends.
    if (typeof ingredientSet?.matchIngredients === 'function') {
      return {
        success: true,
        plan: ingredientSet.matchIngredients(availableItems, matcher),
        currencySpends: [],
        missingGroups: [],
      };
    }
    return { success: true, plan: [], currencySpends: [], missingGroups: [] };
  }

  /**
   * The player's essence allocation IF it was computed for the step and ingredient set this craft
   * actually resolved, else null (issue 917). `step` here is the step resolved from
   * `run.currentStepIndex`, not the one the UI believed was active, so a UI-side guard would be
   * stale by construction. On a mismatch the allocation is DROPPED, never clamped into the
   * resolved step — item uuids carry no step identity, so a step-1 map applied to step 2 would
   * look plausible while steering the wrong consumption.
   */
  _scopedEssenceAllocation(payload, step, ingredientSet) {
    return scopedEssenceAllocation(payload, step?.id, ingredientSet?.id);
  }

  /**
   * The missing-materials message for a craft whose PLAYER-SUPPLIED essence allocation does not
   * fund the set, else null (issue 917). A short allocation is honoured and never topped up, so
   * the resolved selection comes back `success: false` with a partial plan; `RecipeManager.canCraft`
   * ran BEFORE the allocation was applied, so without this the engine would consume the partial
   * plan and still award the result. Scoped to the supplied-allocation case.
   */
  _allocationShortfallMessage(essenceAllocation, craftSelection, executionRecipe) {
    if (!essenceAllocation || craftSelection?.success !== false) return null;
    const missing = {
      ingredients: Array.isArray(craftSelection.missingGroups) ? craftSelection.missingGroups : [],
      essences: [],
      tools: [],
    };
    return `Missing required items:\n${this._formatMissingItems(missing, executionRecipe)}`;
  }

  /** One refusal per cause: the projection's own blocker code, and the sentence for it. */
  _versionedStageRefusal(blocker, missing, executionRecipe) {
    const message =
      blocker === STAGE_BLOCKERS.choice
        ? 'Choose the crafting requirements before executing this step.'
        : `Missing required items:\n${this._formatMissingItems(missing, executionRecipe)}`;
    return { valid: false, blocker, message };
  }

  /**
   * Consume the item plan from the single craft selection, computed once in {@link craft} and
   * passed in, so this never recomputes the match against possibly-mutated items. Every
   * consumption requires document acknowledgement; there is no unconfirmed mode.
   * @param {Array<{item: Item, quantity: number, ingredient: object}>} consumptionPlan
   */
  async _consumeIngredients(consumptionPlan = []) {
    const consumedItems = [];
    try {
      for (const { item, quantity, ingredient } of consumptionPlan) {
        const captured = mapConsumedIngredientRef({ item, quantity });
        const snapshot = snapshotVersionedItem(item);
        const actual = await this._consumeItemQuantity(item, quantity);
        const consumed = {
          item,
          quantity: actual,
          ...(ingredient !== undefined && { ingredient }),
        };
        Object.defineProperties(consumed, {
          receipt: { value: Object.freeze({ ...captured, quantity: actual }) },
          snapshot: { value: snapshot },
        });
        consumedItems.push(consumed);
        if (actual !== quantity) throw unconfirmedHistoryError('Partial consumption');
      }
    } catch (error) {
      // A path-guard refusal reached no database at all. With nothing consumed yet that is a
      // DEFINITE failure, not the uncertain effect reconciliation exists for; once an earlier
      // item has already been decremented the partial effect is real and stays uncertain.
      if (error?.code === 'STACK_QUANTITY_PATH_REFUSED' && consumedItems.length === 0) throw error;
      const failure = unconfirmedHistoryError(
        'Consumption requires reconciliation',
        [...consumedItems.map(mapConsumedIngredientRef), ...(error.receipts ?? [])],
        error
      );
      failure.historyField = 'consumption';
      throw failure;
    }
    return consumedItems;
  }

  /** Only the acknowledged source decrement establishes consumption. */
  async _consumeItemQuantity(item, quantity) {
    const path = itemStackQuantityPath();
    const before = sourceItemQuantity(item, { path });
    const captured = mapConsumedIngredientRef({ item, quantity });
    if (before === null || receiptQuantity(quantity) === null)
      throw unconfirmedHistoryError('Unknown consumption quantity');
    // A whole-document delete yields what the PLAN counted it as, and every consumption
    // plan reads capacity with `readStackQuantity` ("a present item is at least one"):
    // the stored value answers 0 for a stored-`0` stack and refuses the consumption.
    const whole = readStackQuantity(item?._source ?? item, path);
    const result = await (quantity >= before
      ? item.delete()
      : updateStackQuantity(item, before - quantity, path, { throwOnRefusal: true }));
    requireDocumentAcknowledgment(item, result);
    if (quantity >= before) return whole;
    const after = sourceItemQuantity(item, { path, absentDefault: null });
    if (after === null || after > before)
      throw unconfirmedHistoryError('Consumption decrement is uncertain');
    if (before - after !== quantity)
      throw unconfirmedHistoryError('Partial consumption decrement', [
        { ...captured, quantity: before - after },
      ]);
    return before - after;
  }

  /**
   * Validate that all required library Tools resolved for this recipe/step are present (a
   * matching, non-broken item) on the component source actors, returning the matched
   * `{ tool, item, breakable }` pairs so the caller can apply usage/breakage.
   *
   * Durable-identity selection (issue 557): the PREFERRED item matches by durable identity — the
   * only kind that may be consumed or destroyed — and a presence-only match satisfies the
   * presence gate alone, returned `breakable: false` so {@link _applyToolBreakage} spares it.
   * Virtual-present injection (Phase 4): a tool in the active canvas Tool's `presentTools` payload
   * whose system matches is satisfied WITHOUT an owned item and returned `virtual: true`; an
   * owned, non-broken item still takes precedence, and {@link resolvePresentComponentIds}
   * enforces the system scope.
   */
  async _validateTools(
    actors,
    recipe,
    tools = [],
    presentTools = null,
    primaryActor = null,
    { excludedItems = null } = {}
  ) {
    const excluded = excludedItems instanceof Set ? excludedItems : new Set(excludedItems);
    if (typeof this.recipeManager?.resolveToolStates === 'function') {
      const states = this.recipeManager.resolveToolStates(recipe, tools, actors, {
        presentTools,
        primaryActor,
        excludedItems: excluded,
      });
      const missingIndex = states.findIndex((state) => state?.available !== true);
      if (missingIndex !== -1) {
        return {
          valid: false,
          message: `Missing required tool (${toolDisplayReference(
            tools[missingIndex],
            recipe,
            this.recipeManager
          )})`,
        };
      }
      return {
        valid: true,
        tools: states.map((state, index) => {
          const tool = tools[index];
          const item = state?.contributionInput?.matchedItem ?? null;
          return {
            tool,
            item,
            virtual: state?.virtual === true,
            breakable:
              item && typeof this.recipeManager?.toolMatchesItemByIdentity === 'function'
                ? this.recipeManager.toolMatchesItemByIdentity(recipe, tool, item) === true
                : item != null,
            contributionInput: state?.contributionInput ?? null,
          };
        }),
      };
    }

    const toolItems = [];
    const presentScope = { presentTools, systemId: recipe?.craftingSystemId ?? null };
    const presentSet = resolvePresentComponentIds(presentScope);
    // An item-sourced Tool station has no componentId to key on (issue 1119).
    const presentToolSet = resolvePresentToolIds(presentScope);

    for (const tool of tools) {
      // Durable-identity selection (issue 557): PREFER an owned item matching the tool by durable
      // identity, and fall back to a presence-only match ONLY to satisfy the presence gate,
      // tagging that pair `breakable: false`. When an actor owns both the durably-identified
      // tool and a decoy, the durable tool is the one carried into breakage.
      const hasIdentityMatcher =
        typeof this.recipeManager?.toolMatchesItemByIdentity === 'function';
      let identityItem = null;
      let presenceItem = null;
      for (const actor of actors) {
        for (const item of actor?.items ?? []) {
          if (excluded.has(item)) continue;
          if (isToolBroken(item)) continue;
          if (!presenceItem && this.recipeManager.toolMatchesItem(recipe, tool, item)) {
            presenceItem = item;
          }
          if (
            hasIdentityMatcher &&
            !identityItem &&
            this.recipeManager.toolMatchesItemByIdentity(recipe, tool, item) === true
          ) {
            identityItem = item;
          }
          if (identityItem) break;
        }
        if (identityItem) break;
      }

      const found = identityItem ?? presenceItem;
      if (found) {
        // When the manager exposes no identity matcher (legacy/test managers) preserve
        // prior behaviour and treat a presence match as breakable; otherwise only a
        // durable-identity match is breakable.
        const breakable = hasIdentityMatcher ? identityItem != null : true;
        toolItems.push({ tool, item: found, breakable });
      } else if (presentToolSet.has(tool?.id) || presentSet.has(tool?.componentId)) {
        // Virtual-present: satisfied by the active canvas Tool, no owned item.
        toolItems.push({ tool, item: null, virtual: true });
      } else {
        return {
          valid: false,
          message: `Missing required tool (${toolDisplayReference(tool, recipe, this.recipeManager)})`,
        };
      }
    }

    return { valid: true, tools: toolItems };
  }

  async _appendToolCheckBonuses(formula, toolItems = []) {
    const contributions = [];
    const seenToolIds = new Set();
    for (const toolItem of Array.isArray(toolItems) ? toolItems : []) {
      const input = toolItem?.contributionInput;
      if (!input) continue;
      const toolId = input.tool?.id ?? null;
      if (toolId && seenToolIds.has(toolId)) continue;
      if (toolId) seenToolIds.add(toolId);
      contributions.push(
        await evaluateToolCheckContribution({
          ...input,
          evaluatePrerequisite: ({ actor, prerequisite }) =>
            evaluatePrerequisite(actor?.getRollData?.() ?? actor?.system ?? {}, prerequisite),
          evaluateExpression: async ({ actor, expression }) => {
            if (typeof globalThis.Roll !== 'function') return 0;
            const rollData = actor?.getRollData?.() ?? actor?.system ?? {};
            const roll = await new globalThis.Roll(expression, rollData).evaluate({
              allowInteractive: false,
            });
            return roll?.total;
          },
        })
      );
    }
    return appendToolBonusTerms(formula, composeToolBonusTerms(contributions).terms);
  }

  /**
   * Apply usage and breakage to matched tools, delegating to the shared
   * {@link applyToolUsageAndBreakage} runtime and returning `usedTools` evidence in the
   * run-record item-ref shape. `forceBreak` passes a `planned: { mode: 'forced', broken: true }`
   * override.
   *
   * Authority (issue 419): under `checkDriven` an `immune` tool is filtered OUT of the forced set
   * and recorded as `skippedImmune`, virtual tools are recorded as skipped, and a forced break
   * attaches its `authority`/`reason`/`triggerId`. Under `toolSpecific` each tool's own mode
   * decides. Durable-identity gate (issue 557): an item is used OR broken only when it matches
   * the tool by durable identity, re-checked here so a presence-only item never reaches `delete()`.
   */
  async _applyToolBreakage(
    recipe,
    toolItems = [],
    {
      forceBreak = false,
      authority = 'toolSpecific',
      reason = null,
      triggerId = null,
      checkId = null,
    } = {}
  ) {
    const checkDriven = authority === 'checkDriven';
    const evidence = [];
    for (const { tool: toolData, item, virtual, breakable: selectedBreakable } of toolItems) {
      const tool = toolData instanceof Tool ? toolData : Tool.fromJSON(toolData);
      // Virtual-present (canvas-tool) matches have no owned item to use/break.
      // Under checkDriven they are recorded as skipped evidence (not mutated);
      // under toolSpecific they are silent (today's behaviour).
      if (virtual || !item) {
        if (checkDriven) {
          evidence.push({
            actorUuid: null,
            itemUuid: null,
            quantity: 1,
            componentId: tool.componentId ?? null,
            toolId: tool.id ?? null,
            broken: false,
            authority,
            virtual: true,
          });
        }
        continue;
      }
      // Durable-identity gate (issue 557): an owned item is used OR broken only when it matches
      // the tool by durable identity, re-checked authoritatively here so a mis-tagged,
      // presence-only item can never reach delete(); with no identity matcher fall back to the
      // selection tag, defaulting to breakable. A spared item is left untouched.
      const identityMatcher = this.recipeManager?.toolMatchesItemByIdentity;
      const breakable =
        typeof identityMatcher === 'function'
          ? identityMatcher.call(this.recipeManager, recipe, toolData, item) === true
          : selectedBreakable !== false;
      if (!breakable) {
        if (checkDriven) {
          evidence.push({
            actorUuid: item?.parent?.uuid ?? null,
            itemUuid: item?.uuid ?? null,
            quantity: 1,
            componentId: tool.componentId ?? null,
            toolId: tool.id ?? null,
            broken: false,
            authority,
            spared: true,
          });
        }
        continue;
      }
      const actor = item?.parent ?? null;
      const isImmune = tool.checkBreakable === false || tool.breakage?.mode === 'immune';
      // checkDriven: `checkBreakable: false` excludes a Tool from the forced set;
      // every other required Tool breaks when forceBreak. toolSpecific: this flag
      // does not grant immunity. The retained Tool-specific breakage mode decides.
      let planned;
      const extra = {};
      if (checkDriven) {
        if (isImmune) {
          planned = { mode: 'immune', broken: false, evidence: { authority } };
          extra.authority = authority;
          extra.skippedImmune = true;
        } else if (forceBreak) {
          planned = { mode: 'forced', broken: true, evidence: { authority } };
          extra.authority = authority;
          extra.reason = reason;
          extra.triggerId = triggerId;
          extra.checkId = checkId;
        } else {
          planned = { mode: 'forced', broken: false, evidence: { authority } };
          extra.authority = authority;
        }
      } else if (isImmune) {
        // `checkBreakable` governs check-driven participation only. Under
        // toolSpecific, defer to the Tool's retained breakage-mode evaluation.
        planned = undefined;
      } else {
        planned = forceBreak ? { mode: 'forced', broken: true, evidence: {} } : undefined;
      }
      const entry = await applyToolUsageAndBreakage({
        tool,
        actor,
        item,
        planned,
        authority,
        buildItemRef: (_actor, breakItem) => ({
          actorUuid: breakItem?.parent?.uuid || null,
          itemUuid: breakItem?.uuid || null,
          quantity: 1,
        }),
        createReplacement: this._makeToolReplacementCreator(recipe),
      });
      evidence.push({
        actorUuid: entry.itemRef?.actorUuid ?? null,
        itemUuid: entry.itemRef?.itemUuid ?? null,
        quantity: entry.itemRef?.quantity ?? 1,
        componentId: entry.componentId ?? null,
        toolId: entry.toolId ?? null,
        broken: entry.broken === true,
        ...extra,
      });
    }
    return evidence;
  }

  /**
   * Build a `replaceWith` creator that resolves component targets through the
   * recipe's crafting system and direct-Item targets by UUID, then creates the
   * replacement item on the actor.
   */
  _makeToolReplacementCreator(recipe) {
    const system = this.getCraftingSystem(recipe?.craftingSystemId);
    return createToolReplacementCreator({
      system,
      resolveComponentSource: async ({ componentId }) => {
        const component = findById(getDefinitionIndex(resolvedComponentsFor(system)), componentId);
        if (!component?.registeredItemUuid) return component;
        const source = await this.resolveItemUuid(component.registeredItemUuid);
        return source?.documentName === 'Item' ? source : null;
      },
      resolveItemUuid: this.resolveItemUuid,
    });
  }

  /**
   * The three essence-resolution inputs travel in one trailing options bag, matching
   * {@link CraftingEngine#_createSingleResult}; only the time-gated FINISH path supplies them.
   */
  async _createResultItems(
    craftingActor,
    recipe,
    sourceStep,
    ingredientSet,
    consumedItems,
    toolItems,
    checkResult = null,
    selectedResultGroupId = null,
    {
      precomputedEssences = null,
      essenceEnabled = null,
      resolveComponent = findMatchingComponent,
    } = {}
  ) {
    const step = { ...sourceStep, resultGroups: linkResultGroups(sourceStep?.resultGroups) };
    const resolutionService =
      this.resolutionModeService || game.fabricate?.getResolutionModeService?.();

    const resolved = resolutionService
      ? resolutionService.resolveResultGroups({
          recipe,
          step,
          ingredientSet,
          checkResult,
          selectedResultGroupId,
        })
      : {
          groups: Array.isArray(step?.resultGroups) ? step.resultGroups : [],
          meta: {},
        };

    const groupsToCreate = Array.isArray(resolved?.groups) ? resolved.groups : [];

    const createdItems = [];
    const rolledAwards = [];
    const receiptCollector = createItemReceiptCollector();
    try {
      for (const group of groupsToCreate) {
        for (const result of group.results || []) {
          const resultItem = await this._createSingleResult(
            craftingActor,
            result,
            consumedItems,
            toolItems,
            recipe,
            {
              ...checkResult,
              resolutionMeta: resolved?.meta || {},
            },
            {
              step,
              precomputedEssences,
              essenceEnabled,
              resolveComponent,
              receiptCollector,
              rolledAwards,
            }
          );

          // Return each physical Item once; the collector retains every row's delta.
          if (resultItem && !createdItems.includes(resultItem)) {
            createdItems.push(resultItem);
          }
        }
      }
    } catch (error) {
      throw receiptCollector.failure(error);
    }

    return {
      items: attachRolledAwards(
        attachAwardReceipts(createdItems, receiptCollector.snapshot()),
        rolledAwards
      ),
      resolutionMeta: resolved?.meta || null,
    };
  }

  /** Create one result item: resolve its amount, build its data, and award or stack it. */
  async _createSingleResult(
    craftingActor,
    result,
    consumedItems,
    toolItems,
    recipe,
    checkResult = null,
    {
      step = null,
      precomputedEssences = null,
      essenceEnabled = null,
      resolveComponent,
      receiptCollector = null,
      rolledAwards = null,
    } = {}
  ) {
    let sourceItem;
    let managedItem = null;
    // Resolved once for the whole method: a bare `itemUuid` output with no managed component
    // still transfers effects, so this must not be scoped to the managed-component branch.
    const systemManager = game.fabricate?.getCraftingSystemManager?.();
    const system = recipe.craftingSystemId
      ? (systemManager?.getSystem(recipe.craftingSystemId) ?? null)
      : null;
    if ((result.componentId || result.systemItemId) && recipe.craftingSystemId) {
      managedItem = findById(
        getDefinitionIndex(resolvedComponentsFor(system)),
        result.componentId || result.systemItemId
      );
      if (managedItem?.registeredItemUuid) {
        sourceItem = await fromUuid(managedItem.registeredItemUuid);
      }
    }

    if (result.itemUuid) {
      sourceItem = await fromUuid(result.itemUuid);
    }

    let itemData;
    if (sourceItem) {
      itemData = sourceItem.toObject();
    } else if (managedItem) {
      console.warn(
        `Fabricate | Managed result source item could not be resolved for "${managedItem.id || managedItem.name || 'unknown'}"; using fallback item data`
      );
      itemData = {
        name: managedItem.name || 'Crafted Item',
        img: managedItem.img || 'icons/svg/item-bag.svg',
        type: 'loot',
        system: {},
      };
    } else {
      console.error(
        `Fabricate | Result item not found: ${result.itemUuid || result.componentId || result.systemItemId}`
      );
      throw unconfirmedHistoryError('Crafting result source is unavailable');
    }

    // Resolved ONCE, before `setStackQuantity` and `receiptQuantity` read it. Zero is an EMPTY
    // AWARD: no item is created, and the record is what states the roll (issue 1645).
    const { amount, rolled, roll } = await resolveRolledAmount(result, craftingActor, {
      Roll: diceEngine(),
    });
    if (rolled) rolledAwards?.push(rolledAwardEvidence(result, rolled, amount, roll, itemData));
    if (amount === 0) return null;
    if (hasStackQuantity(itemData) || !sourceItem) {
      setStackQuantity(itemData, amount);
    }

    // Every CONTRIBUTING essence's property macro runs FIRST (issue 1036), in `essenceDefinitions`
    // order, so the result's own macro is the LAST writer at any path the two share.
    const essenceMacrosApplied = await this._runEssencePropertyMacros(itemData, {
      system,
      recipe,
      craftingActor,
      result,
      consumedItems,
      toolItems,
      checkResult,
      step,
      precomputedEssences,
      essenceEnabled,
      resolveComponent,
    });
    const propertyUpdates = await this._runPropertyMacro(
      result.propertyMacroUuid,
      recipe,
      craftingActor,
      result,
      consumedItems,
      toolItems,
      checkResult,
      step,
      precomputedEssences,
      resolveComponent
    );
    const resultMacroApplied =
      propertyUpdates &&
      typeof propertyUpdates === 'object' &&
      Object.keys(propertyUpdates).length > 0;
    if (resultMacroApplied) {
      for (const [path, value] of Object.entries(propertyUpdates)) {
        foundry.utils.setProperty(itemData, path, value);
      }
    }
    // The veto is the OR across every macro that applied a path (issue 1036), because
    // `createOrStackComponentItem` discards `itemData` when it stacks, losing every mutation.
    const hasPropertyUpdates = Boolean(essenceMacrosApplied || resultMacroApplied);

    // The durable component identity, so the inventory matcher attributes this output to its OWN
    // component and not a sibling reached through `_stats.duplicateSource` (issue 539).
    stampCraftedComponentIdentity(itemData, recipe.craftingSystemId, managedItem?.id);

    // Both flags must be set, and a transferring output never merges into an existing stack.
    const transfersEffects =
      recipe.transferEffects === true && system?.features?.effectTransfer === true;

    // Only a PLAIN component output stacks onto an existing item (issue 858): a managed component
    // with no property-macro customization and no transferred effects.
    const awardedQuantity = receiptQuantity(amount ?? 1);
    const itemsIterable =
      craftingActor?.items != null && typeof craftingActor.items[Symbol.iterator] === 'function';
    let matchingItems = [];
    if (managedItem && system && itemsIterable && !hasPropertyUpdates && !transfersEffects) {
      matchingItems = this.findComponentItems(craftingActor, managedItem, system) || [];
    }

    const resultItem = await createOrStackComponentItem({
      actor: craftingActor,
      itemData,
      matchingItems,
      awardedQuantity,
      receiptCollector,
      receiptIdentity: {
        actorUuid: craftingActor.uuid,
        componentId: managedItem?.id ?? null,
        resultRowId: result.resultRowId ?? null,
        sourceItemUuid: sourceItem?.uuid ?? null,
        ...(rolled && { rolled }),
      },
    });
    if (!resultItem) return null;

    const stacked = matchingItems.includes(resultItem);

    // Only ever a freshly created item: a stacked one keeps its own effects and, by construction,
    // `transfersEffects` is false when stacking.
    if (!stacked && transfersEffects) {
      await this._transferEffects(
        resultItem,
        consumedItems,
        recipe,
        precomputedEssences,
        resolveComponent,
        essenceEnabled
      );
    }

    return resultItem;
  }

  /**
   * Transfer active effects from essence source items to the result item, per spec 005
   * §"Effect Transfer Semantics": determine the contributing essence IDs from the resolved
   * ingredients, collect active effects from each `EssenceDefinition.sourceItemUuid` that
   * resolves, and transfer them via `createEmbeddedDocuments`. A DISABLED essence carries no
   * behaviour (issue 1036) but its quantities still match, accumulate and are consumed —
   * `enabled` gates essence-carried BEHAVIOUR, never essence ARITHMETIC. This walk stays SEPARATE
   * from the property-macro loop, whose GM-authorable order would change the `effectsData` order.
   */
  async _transferEffects(
    resultItem,
    consumedItems,
    recipe,
    precomputedEssences = null,
    resolveComponent = findMatchingComponent,
    essenceEnabled = null
  ) {
    // 1. Get the crafting system and verify essences are enabled
    const systemManager = game.fabricate?.getCraftingSystemManager?.();
    const system = systemManager?.getSystem(recipe.craftingSystemId);
    if (!system?.features?.essences) return;

    // 2. Build essence context — resolvedEssences maps essenceId -> total quantity
    // contributed (or the precomputed snapshot on the time-gated FINISH path).
    const { resolvedEssences } = this._buildEssenceContext(
      consumedItems,
      recipe,
      precomputedEssences,
      resolveComponent
    );
    const contributingEssenceIds = Object.keys(resolvedEssences);
    if (contributingEssenceIds.length === 0) return;

    // 3. For each contributing essence, find its EssenceDefinition and resolve the source item
    const essenceDefinitions = resolvedEssencesFor(system);
    const effectsData = [];

    for (const essenceId of contributingEssenceIds) {
      const definition = essenceDefinitions.find((d) => d.id === essenceId);
      // BEFORE `_sourceUuidForEssenceDefinition`, and null-safe: `.find(...)` returns
      // `undefined` for an essence deleted between a timed craft's START and FINISH, a
      // state the shipped code survives only because that helper guards `!definition`.
      if (!this._essenceCarriesBehaviour(definition, essenceId, essenceEnabled)) continue;
      const sourceItemUuid = this._sourceUuidForEssenceDefinition(definition, system);
      if (!sourceItemUuid) continue;

      const sourceItem = await fromUuid(sourceItemUuid);
      if (!sourceItem) continue;

      const itemEffects = sourceItem.effects || [];
      for (const effect of itemEffects) {
        effectsData.push(effect.toObject());
      }
    }

    // 4. Transfer all collected effects to the result item
    if (effectsData.length === 0) return;
    await resultItem.createEmbeddedDocuments('ActiveEffect', effectsData);
  }

  /**
   * Whether an essence carries its BEHAVIOUR onto this result — the ONE predicate behind both
   * essence-carried behaviours (issue 1036), so the effect transfer and the property macro can
   * never disagree. A time-gated craft evaluates the SNAPSHOT taken at START, never the live
   * definition, so a mid-run GM toggle cannot change a craft whose inputs are already consumed;
   * the snapshot is COMPLETE over the START keys, and an ABSENT key falls through to the live
   * definition and reads as enabled.
   */
  _essenceCarriesBehaviour(definition, essenceId, essenceEnabled = null) {
    if (
      essenceEnabled &&
      typeof essenceEnabled === 'object' &&
      Object.hasOwn(essenceEnabled, essenceId)
    ) {
      return essenceEnabled[essenceId] !== false;
    }
    return definition?.enabled !== false;
  }

  /**
   * The enabled-ness map a RESUMING time-gated step evaluates its behaviour gate from.
   *
   * A run armed BEFORE `essenceEnabled` existed carries no map and must read as ALL-ENABLED — the
   * behaviour it was armed under — so this synthesises a complete all-true map over the START
   * keys rather than returning `null`, which means "no snapshot at all, evaluate live" and is the
   * COLLAPSED-chain carve-out. An EMPTY stored map is deliberately not distinguished from an
   * absent one: `_snapshotEssenceEnabled` emits one entry per START key, so the two readings
   * coincide, and `tests/essence-timed-craft-gate.test.js` fails on a dropped key at either site.
   */
  _resumedEssenceEnabled(prepared) {
    const stored = prepared?.essenceEnabled;
    if (stored && typeof stored === 'object' && Object.keys(stored).length > 0) return stored;
    const resolved = prepared?.resolvedEssences;
    if (!resolved || typeof resolved !== 'object') return null;
    return Object.fromEntries(Object.keys(resolved).map((essenceId) => [essenceId, true]));
  }

  /**
   * The START-phase enabled-ness snapshot for a time-gated step: one entry for EVERY contributing
   * essence, not only the disabled ones (issue 1036). Completeness is load-bearing — the
   * `actor.setFlag` merge cannot delete a key inside a SURVIVING run, so an omitted key
   * resurrects with its old value, and a disabled-ids-only map would be indistinguishable from
   * the absent map that has to keep meaning "evaluate live".
   */
  _snapshotEssenceEnabled(resolvedEssences, system) {
    const definitions = resolvedEssencesFor(system);
    const snapshot = {};
    for (const essenceId of Object.keys(resolvedEssences || {})) {
      const definition = definitions.find((def) => def?.id === essenceId);
      snapshot[essenceId] = definition?.enabled !== false;
    }
    return snapshot;
  }

  /**
   * Run every contributing essence's own property macro against the crafted item data, before the
   * result's own macro (issue 1036). The seam is `_createSingleResult`, after `itemData` is
   * populated and before the item is created, so this runs for SALVAGE awards too.
   *
   * Ordering is by `essenceDefinitions` LIBRARY POSITION, filtered to the contributing set —
   * never by iterating `resolvedEssences`, whose key order is neither stable nor authorable.
   * Updates are applied per macro, in loop order, never spread-merged, because the returns are
   * string PATHS. TWO gates apply: `features.propertyMacros` (default false) AND
   * `features.essences`; the system, both gates and the essence context are resolved ONCE
   * rather than per essence, which would rebuild the identical context N+1 times per result.
   *
   * @returns {Promise<boolean>} whether ANY essence macro applied at least one path — the essence
   *   half of `_createSingleResult`'s `hasPropertyUpdates` stacking veto.
   */
  async _runEssencePropertyMacros(
    itemData,
    {
      system,
      recipe,
      craftingActor,
      result,
      consumedItems,
      toolItems,
      checkResult = null,
      step = null,
      precomputedEssences = null,
      essenceEnabled = null,
      resolveComponent = findMatchingComponent,
    } = {}
  ) {
    const features = system?.features || {};
    if (features.propertyMacros !== true || features.essences !== true) return false;

    const definitions = resolvedEssencesFor(system);
    if (definitions.length === 0) return false;

    // Everything this predicate reads is on the definition itself, so it is decidable
    // BEFORE the essence context exists. Only the contributing-set membership below is not.
    const carriesRunnableMacro = (definition) =>
      typeof definition?.propertyMacroUuid === 'string' &&
      definition.propertyMacroUuid !== '' &&
      this._essenceCarriesBehaviour(definition, definition.id, essenceEnabled);
    if (!definitions.some(carriesRunnableMacro)) return false;

    const { resolvedEssences, essenceSources } = this._buildEssenceContext(
      consumedItems,
      recipe,
      precomputedEssences,
      resolveComponent
    );
    const runnable = definitions.filter(
      (definition) =>
        carriesRunnableMacro(definition) && Object.hasOwn(resolvedEssences, definition.id)
    );
    if (runnable.length === 0) return false;

    const context = {
      recipe: recipe?.toJSON?.() || recipe,
      craftingSystem: system,
      craftingActor,
      ingredientPool: consumedItems.map(({ item, quantity, ingredient }) => ({
        item,
        quantity,
        ingredient,
      })),
      resolvedIngredients: consumedItems.map(({ item, quantity, ingredient }) => ({
        item,
        quantity,
        ingredient,
      })),
      resolvedTools: toolItems.map(({ item, tool }) => ({ item, tool })),
      resolvedEssences,
      essenceSources,
      checkResult,
      result: result?.toJSON?.() || result,
      step,
    };

    let applied = false;
    for (const definition of runnable) {
      // Each macro is ISOLATED: a throw fails that essence only and every later macro
      // still runs and still applies. `essence` and `essenceQuantity` are what let the
      // archetypal macro ("+1 damage per unit of Fire") find its OWN contribution —
      // without them a shared macro cannot tell which essence invoked it.
      const updates = await this._runOneEssencePropertyMacro(definition, {
        ...context,
        essence: definition,
        essenceQuantity: resolvedEssences[definition.id],
      });
      if (!updates) continue;
      if (this._applyEssencePropertyUpdates(itemData, updates, definition)) applied = true;
    }
    return applied;
  }

  /**
   * Apply ONE macro's flat path -> value map to the crafted item data, isolating a failure to
   * that essence.
   *
   * Without this guard a craft aborts AFTER consumption: `foundry.utils.setProperty` vivifies an
   * intermediate only when it is `=== undefined`, so a `null` or primitive intermediate throws
   * from inside core — and `itemData` is `sourceItem.toObject()`, where both shapes are ordinary.
   * `craft()` has no try around `_createResultItems`, so the unguarded outcome is inputs consumed
   * and NO result item. Logged, not toasted, because it is a GM-side authoring defect that would
   * otherwise raise one notification per essence per result on the PLAYER's screen. A partial
   * application still counts as applied, so the stacking veto fires and the landed mutations are
   * not silently merged away; later essences still run.
   */
  _applyEssencePropertyUpdates(itemData, updates, definition) {
    let applied = false;
    try {
      for (const [path, value] of Object.entries(updates)) {
        foundry.utils.setProperty(itemData, path, value);
        applied = true;
      }
    } catch (error) {
      console.error(
        `Fabricate | Essence "${definition?.name || definition?.id}" property macro returned a path that could not be applied; the remaining paths of that essence were skipped (${definition?.propertyMacroUuid})`,
        error
      );
    }
    return applied;
  }

  /**
   * Run ONE essence property macro and return its flat path -> value map, or `null`.
   *
   * An UNRESOLVABLE `propertyMacroUuid` is logged and skipped SILENTLY rather than raising
   * `ui.notifications.error`, which would fire once per essence per result on the crafting
   * PLAYER's screen for a defect only the GM can fix. `type === 'script'` is checked here and not
   * left to the drop handler: `command` is required on BOTH Macro types and `type` DEFAULTS to
   * `chat`, and imports and hand-edited settings arrive unguarded. The uuid is resolved here AND
   * again inside `MacroExecutor.run` DELIBERATELY — `run` THROWS for an unresolvable uuid, and
   * settling "is the GM's link broken" before entering the try is what keeps that case silent.
   * Return handling matches the result macro: a non-object or Array return is warned and ignored.
   */
  async _runOneEssencePropertyMacro(definition, context) {
    const macroUuid = definition.propertyMacroUuid;
    let macro;
    try {
      macro = await fromUuid(macroUuid);
    } catch {
      macro = null;
    }
    if (!macro || macro.type !== 'script' || typeof macro.command !== 'string') {
      console.warn(
        `Fabricate | Essence "${definition.name || definition.id}" property macro could not be resolved to a script macro and was skipped (${macroUuid})`
      );
      return null;
    }

    try {
      const updates = await MacroExecutor.run(macroUuid, context);
      if (updates == null) return null;
      if (typeof updates !== 'object' || Array.isArray(updates)) {
        console.warn(`Fabricate | Essence property macro ${macroUuid} did not return an object`);
        return null;
      }
      return updates;
    } catch (error) {
      console.error(`Fabricate | Essence property macro failed (${macroUuid})`, error);
      ui?.notifications?.error?.(`Property macro failed: ${error.message || macroUuid}`);
      return null;
    }
  }

  _sourceUuidForEssenceDefinition(definition, system) {
    if (!definition) return null;
    const sourceComponentId =
      definition.sourceComponentId || definition.associatedSystemItemId || '';
    if (sourceComponentId) {
      // The legacy `items` alias is NOT a scoped corpus and keeps its raw read: it predates
      // `components` and no world entity has ever been lifted from it.
      const components = Array.isArray(system?.components)
        ? resolvedComponentsFor(system)
        : Array.isArray(system?.items)
          ? system.items
          : [];
      const component = findById(getDefinitionIndex(components), sourceComponentId);
      if (component?.originItemUuid || component?.registeredItemUuid) {
        return component.originItemUuid || component.registeredItemUuid;
      }
      return null;
    }
    return definition.sourceItemUuid || null;
  }

  _getFailureConsumptionPolicy(recipe) {
    const systemId = recipe?.craftingSystemId;
    if (!systemId) {
      return { consumeIngredientsOnFail: true, breakToolsOnFail: false };
    }
    const systemManager = game.fabricate?.getCraftingSystemManager?.();
    const system = systemManager?.getSystem(systemId);
    if (!system) {
      return { consumeIngredientsOnFail: true, breakToolsOnFail: false };
    }
    const consumption = system.craftingCheck?.consumption || {};
    return {
      consumeIngredientsOnFail: consumption.consumeIngredientsOnFail !== false,
      // Normalized systems carry `breakToolsOnFail`; tolerate the legacy
      // `consumeCatalystsOnFail` defensively for any un-normalized path.
      breakToolsOnFail:
        (consumption.breakToolsOnFail ?? consumption.consumeCatalystsOnFail) === true,
    };
  }

  /**
   * Check Item Piles currency cost on a recipe, if the integration is enabled.
   */
  async _checkItemPilesCurrencyCost(craftingActor, recipe) {
    const cost = recipe?.currencyCost;
    if (!cost?.currencies?.length) return { valid: true };

    const integration = this.itemPilesIntegration || game.fabricate?.getItemPilesIntegration?.();
    if (!integration) return { valid: true };

    const systemManager = game.fabricate?.getCraftingSystemManager?.();
    const system = systemManager?.getSystem(recipe?.craftingSystemId);
    if (!integration.isEnabled(system)) return { valid: true };

    try {
      const affordable = await integration.canAfford(craftingActor, cost.currencies);
      if (!affordable) {
        return {
          valid: false,
          message: 'Insufficient currency (Item Piles). Cannot afford recipe cost.',
        };
      }
      return { valid: true };
    } catch (error) {
      console.error('Fabricate | Item Piles canAfford error', error);
      return { valid: false, message: 'Item Piles currency check failed: ' + error.message };
    }
  }

  /**
   * Deduct Item Piles currency cost from actor after a successful craft.
   * Errors are logged but do not throw, to avoid losing crafting results.
   */
  async _deductItemPilesCurrencyCost(craftingActor, recipe) {
    const cost = recipe?.currencyCost;
    if (!cost?.currencies?.length) return;

    const integration = this.itemPilesIntegration || game.fabricate?.getItemPilesIntegration?.();
    if (!integration) return;

    const systemManager = game.fabricate?.getCraftingSystemManager?.();
    const system = systemManager?.getSystem(recipe?.craftingSystemId);
    if (!integration.isEnabled(system)) return;

    try {
      await integration.deductCurrency(craftingActor, cost.currencies);
    } catch (error) {
      console.error('Fabricate | Item Piles deductCurrency error', error);
    }
  }

  /**
   * Run the crafting check for an attempt, if one is required or enabled. A check is REQUIRED —
   * run even when the system has crafting checks disabled — when the recipe needs a check outcome
   * to select its result: `progressive` or `routedByCheck`. `routedByIngredients` selects by the
   * chosen ingredient set, so its check is the same optional pass/fail check as `simple`/`alchemy`
   * on the shared `craftingCheck.simple` slot. `simple` honours the crafting-checks toggle;
   * alchemy and `routedByIngredients` run on an authored roll formula alone.
   */
  async _runCraftingCheck(
    recipe,
    craftingActor,
    componentSourceActors,
    ingredientSet,
    // The routing basis is now a property of the system MODE, so the check no
    // longer reads the step's `resultSelection`; the param is retained for the
    // positional call signature.
    _step = null,
    // Interactive-roll options threaded from `craft()`. `{ interactive }` opts a
    // UI-triggered craft into the confirm-roll dialog + chat post; defaults to
    // non-interactive so the programmatic API stays silent.
    { interactive = false, toolItems = [] } = {}
  ) {
    const resolutionService =
      this.resolutionModeService || game.fabricate?.getResolutionModeService?.();
    const systemId = recipe?.craftingSystemId;
    if (!systemId) {
      return { success: true, outcome: null, value: null, data: {} };
    }
    const systemManager = game.fabricate?.getCraftingSystemManager?.();
    const system = systemManager?.getSystem(systemId);
    if (!system) {
      return { success: true, outcome: null, value: null, data: {} };
    }

    const mode = resolutionService?.getMode(recipe) || system?.resolutionMode || 'simple';

    // WHETHER THE ACTIVE CHECK CAN ROLL AT ALL, asked ONCE, of the same selector every GM surface
    // asks (issue 1094). Testing each slot's RAW `rollFormula` diverged once the retirement shim
    // landed: on alchemy `simple` the brew succeeded UNCONDITIONALLY with the DC ignored, and on
    // `routedByCheck`/`progressive` the `requiresCheck` abort never fired, so the craft consumed
    // its ingredients and routed to nothing. `checkUsable` makes a strip-to-empty formula take
    // exactly the path a blank one takes.
    const activeCheck = resolveActiveCraftingCheckFormula({ ...system, resolutionMode: mode });

    // Alchemy: routing and check-ness are driven by the SYSTEM-level `alchemy.checkMode`, NOT the
    // generic `checksEnabled` master toggle, and are dispatched entirely here so the shared
    // non-alchemy logic below never applies.
    //  - `none`   → unconditional no-op success: a matched brew always succeeds.
    //  - `simple` → the mandatory pass/fail check, run whenever a formula exists; a MISSING
    //               formula is a misconfiguration, so craft() aborts with zero mutation.
    //  - `tiered` → the mandatory routed check; a missing routed formula is likewise a
    //               misconfiguration.
    if (mode === 'alchemy') {
      const alchemyCheckMode = system?.alchemy?.checkMode || 'none';
      if (alchemyCheckMode === 'none') {
        return { success: true, outcome: null, value: null, data: {} };
      }
      if (alchemyCheckMode === 'simple') {
        if (!activeCheck.checkUsable) {
          return {
            success: false,
            misconfigured: true,
            outcome: null,
            value: null,
            data: {},
            message: 'alchemy simple check mode requires a configured crafting check roll formula',
          };
        }
        return this._runSimpleCheck(system, recipe, ingredientSet, craftingActor, {
          interactive,
          toolItems,
        });
      }
      // tiered
      if (!activeCheck.checkUsable) {
        return {
          success: false,
          misconfigured: true,
          outcome: null,
          value: null,
          data: {},
          message:
            'alchemy tiered check mode requires a configured routed crafting check roll formula',
        };
      }
      // The per-recipe minimum-success-tier gate (`minSuccessOutcomeId`) is scoped to
      // `routedByCheck` only: its authoring control auto-hides for alchemy, so a value
      // carried here (authored before a mode switch, or imported) is unclearable. Pass
      // `applyMinSuccessOutcome: false` so a carried id stays inert on an alchemy brew —
      // tiered outcomes already gate success via each tier's `success` flag.
      return this._runRoutedCheck(system, recipe, ingredientSet, craftingActor, {
        interactive,
        applyMinSuccessOutcome: false,
        toolItems,
      });
    }

    const checkRequired = mode === 'progressive' || mode === 'routedByCheck';
    const features = system.features || {};
    const checksEnabled =
      features.craftingChecks === true || system?.craftingCheck?.enabled === true;

    // Simple pass/fail check for the simple AND routedByIngredients modes, used when a roll
    // formula is configured (alchemy is dispatched above and never reaches here). The
    // `craftingCheck.simple` slot backs both modes and is NOT simple-mode-only: optional in
    // simple (gated by `checksEnabled`) and in routedByIngredients, which routes result groups
    // by ingredient set so its check never gates routing. "Unusable" is `activeCheck.checkUsable`,
    // which covers both an empty formula and one the retirement shim strips to empty.
    const useSimpleCheck =
      ['simple', 'routedByIngredients'].includes(mode) &&
      activeCheck.checkUsable &&
      (mode === 'routedByIngredients' || checksEnabled);

    // Progressive check (Checks editor) for progressive mode: rolls a formula
    // whose total becomes the numeric `value` the progressive result-awarding
    // spends against result difficulties. Usable only when a roll formula is
    // configured; with no formula the required-check guard below fails the attempt.
    const useProgressiveCheck = mode === 'progressive' && activeCheck.checkUsable;

    // Routed check for `routedByCheck` ONLY: rolls the routed formula and maps the total to an
    // outcome tier whose NAME drives the routing. The check is required, so a missing formula
    // fails via the required-check guard below; `routedByIngredients` reads `craftingCheck.simple`.
    const useRoutedCheck = mode === 'routedByCheck' && activeCheck.checkUsable;

    if (
      !checksEnabled &&
      !checkRequired &&
      !useSimpleCheck &&
      !useProgressiveCheck &&
      !useRoutedCheck
    ) {
      return { success: true, outcome: null, data: {} };
    }

    if (useSimpleCheck) {
      return this._runSimpleCheck(system, recipe, ingredientSet, craftingActor, {
        interactive,
        toolItems,
      });
    }

    if (useProgressiveCheck) {
      return this._runProgressiveCheck(system, recipe, craftingActor, { interactive, toolItems });
    }

    if (useRoutedCheck) {
      // Only `routedByCheck` uses the tier-routing path (its check total maps to an
      // outcome tier whose name drives routing). `routedByIngredients` routes result
      // groups by the chosen ingredient set and runs its optional pass/fail check
      // through `useSimpleCheck` above against `craftingCheck.simple`.
      return this._runRoutedCheck(system, recipe, ingredientSet, craftingActor, {
        interactive,
        toolItems,
      });
    }

    // No usable roll-formula check path applied. A check is only "usable" when its
    // resolution mode has an authored roll formula (handled above). When a check is
    // REQUIRED (progressive, or routedByCheck) but no roll formula is configured,
    // fail loudly so the misconfiguration is visible; otherwise this is an optional
    // check with nothing to run, so treat it as a no-op success.
    if (checkRequired) {
      return {
        success: false,
        misconfigured: true,
        outcome: null,
        value: null,
        data: {},
        message: `${mode} mode requires a configured crafting check roll formula`,
      };
    }
    return { success: true, outcome: null, value: null, data: {} };
  }

  /**
   * Evaluate the simple pass/fail crafting check: roll the formula, resolve the DC (static
   * default, the recipe's selected tier, or a dynamic macro), and compare. A configured critical
   * raw roll on any die auto-fails or auto-succeeds, overriding the comparison.
   *
   * @returns {Promise<{success: boolean, outcome: string, value: number|null, data: object, message: string|null}>}
   */
  async _runSimpleCheck(
    system,
    recipe,
    ingredientSet,
    craftingActor,
    { interactive = false, toolItems = [] } = {}
  ) {
    return this._runPassFailCheck(
      system,
      system?.craftingCheck?.simple || {},
      recipe,
      ingredientSet,
      craftingActor,
      { interactive, toolItems }
    );
  }

  /**
   * Evaluate a pass/fail crafting check against an arbitrary check sub-config — the shared
   * `simple` slot backing `simple`/`routedByIngredients` and the alchemy `simple` mode. The DC
   * resolves via {@link _resolveSimpleCheckDc} parameterized over `config`, so a recipe
   * `checkTierId` or dynamic-DC macro still applies, and the roll goes through the shared
   * {@link runFormulaPassFail}, which honours forced outcomes and interactive cancel.
   */
  async _runPassFailCheck(
    system,
    config,
    recipe,
    ingredientSet,
    craftingActor,
    { interactive = false, toolItems = [] } = {}
  ) {
    const checkConfig = config || {};
    const formula = await this._appendToolCheckBonuses(checkConfig.rollFormula, toolItems);
    const dc = await this._resolveSimpleCheckDc(
      system,
      checkConfig,
      recipe,
      ingredientSet,
      craftingActor
    );
    const craftingModifier = buildCheckModifierContext(system, 'crafting', recipe);
    const result = await runFormulaPassFail({
      formula,
      dc,
      thresholdMode: checkConfig.thresholdMode,
      triggers: checkConfig.checkBreakage?.triggers,
      actor: craftingActor,
      label: 'Crafting',
      craftingModifier,
      rollOptions: buildInteractiveRollOptions({
        interactive,
        actor: craftingActor,
        name: recipe?.name,
        activity: 'Crafting',
        img: this._resolveRecipePromptImg(recipe),
        dc,
        modifierChoice: this._buildInteractiveModifierChoice(
          formula,
          craftingModifier,
          craftingActor,
          interactive
        ),
      }),
    });
    return this._markEngineEvaluated(result);
  }

  /**
   * Evaluate the authored routed crafting check: roll the routed formula and map its total onto
   * one of the configured outcome tiers, returning the matched tier's NAME as `outcome`. Unlike
   * recipe-less salvage and gathering, which pass the flat `routed.dc`, the base DC resolves via
   * the SAME recipe-tier / dynamic-macro path as {@link _runSimpleCheck}, because routed crafting
   * carries `recipe.checkTierId` and relative tiers shift each threshold by `dc + outcome.dc`.
   * Not reached when no routed formula is configured: the caller's required-check guard fails.
   */
  async _runRoutedCheck(
    system,
    recipe,
    ingredientSet,
    craftingActor,
    // `applyMinSuccessOutcome` gates the recipe minimum-tier bump: `routedByCheck`
    // applies it, the alchemy tiered dispatch passes false so a carried (unclearable)
    // `minSuccessOutcomeId` has no runtime effect on an alchemy brew.
    { interactive = false, applyMinSuccessOutcome = true, toolItems = [] } = {}
  ) {
    const routed = system?.craftingCheck?.routed || {};
    const formula = await this._appendToolCheckBonuses(routed.rollFormula, toolItems);
    const dc = await this._resolveSimpleCheckDc(
      system,
      routed,
      recipe,
      ingredientSet,
      craftingActor
    );
    const craftingModifier = buildCheckModifierContext(system, 'crafting', recipe);
    const result = await runFormulaRouted({
      formula,
      dc,
      thresholdMode: routed.thresholdMode,
      type: routed.type,
      relativeOutcomes: routed.relativeOutcomes,
      fixedOutcomes: routed.fixedOutcomes,
      triggers: routed.checkBreakage?.triggers,
      actor: craftingActor,
      label: 'Crafting',
      craftingModifier,
      // A total below every relative threshold clamps to the lowest tier, so a
      // recipe-tier / dynamic DC bump never leaves a craft rolled-but-unrouted.
      clampToNearest: true,
      // Fixed-type only: a recipe may require a minimum success tier; a roll below it
      // fails the craft outright. Null for relative / unset recipes (no-op), and forced
      // null for the alchemy tiered path (its authoring control is `routedByCheck`-only).
      minOutcomeId: applyMinSuccessOutcome ? (recipe?.minSuccessOutcomeId ?? null) : null,
      rollOptions: buildInteractiveRollOptions({
        interactive,
        actor: craftingActor,
        name: recipe?.name,
        activity: 'Crafting',
        img: this._resolveRecipePromptImg(recipe),
        // Fixed-type routed checks match by value range, not DC, so the prompt must
        // not advertise a (meaningless) DC. Undefined suppresses the chip + flavor.
        dc: routed.type === 'fixed' ? undefined : dc,
        modifierChoice: this._buildInteractiveModifierChoice(
          formula,
          craftingModifier,
          craftingActor,
          interactive
        ),
      }),
    });
    return this._markEngineEvaluated(result);
  }

  /** Tag a check result as engine-evaluated so the craft seam knows its `data.breakTools` is an
   * authored signal it may honour. The no-check passthrough success is NOT tagged. */
  _markEngineEvaluated(result) {
    return { ...result, engineEvaluated: true };
  }

  /**
   * Build the deferred interactive `playerPicks` modifier-choice descriptor (issues 770, 1055,
   * 1094). Returned ONLY for an interactive roll over an authored roll formula, under
   * `playerPicks`, with at least TWO eligible modifiers; otherwise `null`, so every other rule
   * threads a byte-identical `rollOptions` bag. THE FORMULA CONDITION IS USABILITY, NOT TOKEN
   * PRESENCE (issue 1094). `bySubject` defers to the subject AUTHOR, so it is never prompted.
   */
  _buildInteractiveModifierChoice(formula, craftingModifierContext, craftingActor, interactive) {
    if (interactive !== true) return null;
    // No authored (post-shim) roll formula means no check to modify, so a choice would be
    // meaningless — and `evaluateCheckRoll` would short-circuit that roll anyway.
    if (stripRetiredModifierPlaceholder(String(formula ?? '')).trim() === '') return null;
    if (resolveModifierPolicy(craftingModifierContext) !== 'playerPicks') return null;
    // Returns the descriptor, or null when fewer than two modifiers are eligible (a
    // one-option group is not a choice — the deterministic scalar IS the only possible
    // pick, so the prompt falls through to it);
    // `buildInteractiveRollOptions` omits the `modifierChoice` key for a falsy value.
    return buildCheckModifierChoice(
      craftingModifierContext,
      makeRollDataExpressionResolver(craftingActor)
    );
  }

  /** Resolve the recipe icon for the interactive roll prompt: the recipe's OWN `img`, per
   * `data-models/spec.md` `## Recipe` requirement 16 (issue 887). `resolveRecipeImage` treats
   * Foundry's generic item-bag as "no image", so the prompt icon never falls back to the bag. */
  _resolveRecipePromptImg(recipe) {
    return resolveRecipeImage(recipe);
  }

  /** Run the progressive crafting check: the rolled total is the `value` progressive awarding
   * spends against result difficulties, with no DC. Per-die crits force the award — SUCCESS
   * awards everything, FAILURE awards nothing, and either may break tools (failure wins). */
  async _runProgressiveCheck(
    system,
    recipe,
    craftingActor,
    { interactive = false, toolItems = [] } = {}
  ) {
    const progressive = system?.craftingCheck?.progressive || {};
    const formula = await this._appendToolCheckBonuses(progressive.rollFormula, toolItems);
    const craftingModifier = buildCheckModifierContext(system, 'crafting', recipe);
    const result = await runFormulaProgressive({
      formula,
      triggers: progressive.checkBreakage?.triggers,
      actor: craftingActor,
      label: 'Crafting',
      craftingModifier,
      rollOptions: buildInteractiveRollOptions({
        interactive,
        actor: craftingActor,
        name: recipe?.name,
        activity: 'Crafting',
        img: this._resolveRecipePromptImg(recipe),
        modifierChoice: this._buildInteractiveModifierChoice(
          formula,
          craftingModifier,
          craftingActor,
          interactive
        ),
      }),
    });
    return this._markEngineEvaluated(result);
  }

  /** Resolve the active crafting check's `checkBreakage` block for the resolution mode (issue
   * 419): simple/routedByIngredients on the shared simple check, routedByCheck on the routed
   * check, progressive on the progressive check, alchemy per `alchemy.checkMode`. */
  _resolveCraftingCheckBreakage(system, recipe) {
    const resolutionService =
      this.resolutionModeService || game.fabricate?.getResolutionModeService?.();
    const mode = resolutionService?.getMode?.(recipe) || system?.resolutionMode || 'simple';
    const check = system?.craftingCheck || {};
    if (mode === 'routedByCheck') return check.routed?.checkBreakage ?? null;
    if (mode === 'progressive') return check.progressive?.checkBreakage ?? null;
    if (mode === 'alchemy' && (system?.alchemy?.checkMode || 'none') === 'tiered') {
      return check.routed?.checkBreakage ?? null;
    }
    return check.simple?.checkBreakage ?? null;
  }

  /** Resolve the active salvage check's `checkBreakage` block via the shared
   * {@link resolveSalvageCheck} derivation (issue 419/859). An UNSUPPORTED mode breaks nothing:
   * an invalid config aborts `misconfigured` with zero mutation before breakage is reached. */
  _resolveSalvageCheckBreakage(system) {
    const { config, unsupportedMode } = resolveSalvageCheck(system);
    if (unsupportedMode) return null;
    return config?.checkBreakage ?? null;
  }

  /** Resolve the salvage breakage decision via the shared {@link evaluateCheckBreakage} seam,
   * bringing salvage to parity with crafting (issue 419). */
  _resolveSalvageBreakageDecision(system, checkResult) {
    // Routed through the world scope at issue 1363: the crafting-system normalizer is
    // absence-preserving now, so a local `?? toolSpecific` here would silently ignore an
    // authored world authority and make the flip inert at this reader.
    const authority = effectiveToolBreakageAuthority(system);
    // Either-or authority (issue 419): a check can only break tools under
    // `checkDriven`. Under `toolSpecific` tools break solely by their own modes, so
    // the check-driven force-break (and the routed per-tier legacy bridge) is not
    // consulted.
    if (authority !== 'checkDriven') {
      return { forceBreak: false, triggerId: null, reason: null, authority };
    }
    const checkBreakage = this._resolveSalvageCheckBreakage(system);
    const decision = evaluateCheckBreakage({ checkBreakage, checkResult });
    return { ...decision, authority };
  }

  /** Resolve the breakage decision for a crafting attempt via the shared
   * {@link evaluateCheckBreakage} seam (issue 419), plus the system's `authority`. Strictly
   * either-or: `toolSpecific` NEVER breaks tools from a check, `checkDriven` lets the active
   * check's triggers decide, and only engine-evaluated roll-formula results can force-break. */
  _resolveCraftingBreakageDecision(system, recipe, checkResult) {
    // Routed through the world scope at issue 1363, for the reason
    // `_resolveSalvageBreakageDecision` states.
    const authority = effectiveToolBreakageAuthority(system);
    // Either-or authority (issue 419): a check can only break tools under
    // `checkDriven`. Under `toolSpecific` tools break solely by their own modes, so
    // the check-driven force-break (and the routed per-tier legacy bridge) is not
    // consulted.
    if (authority !== 'checkDriven') {
      return { forceBreak: false, triggerId: null, reason: null, authority };
    }
    const checkBreakage = this._resolveCraftingCheckBreakage(system, recipe);
    const decision = evaluateCheckBreakage({ checkBreakage, checkResult });
    return { ...decision, authority };
  }

  /**
   * Resolve the system for a recipe (or salvage synthetic recipe) from the manager.
   */
  _getRecipeSystem(recipe) {
    const systemManager = game.fabricate?.getCraftingSystemManager?.();
    return systemManager?.getSystem(recipe?.craftingSystemId) ?? null;
  }

  /** Whether the recipe's system applies time requirements. When off, timed steps resolve
   * immediately. Defaults ON, so only an explicit `false` disables gating. */
  _timeRequirementsEnabled(recipe) {
    return this._getRecipeSystem(recipe)?.requirements?.time?.enabled !== false;
  }

  /** True when a recipe must run as a COLLAPSED atomic chain (issue 710): it carries authored
   * `steps[]` but its system has the multi-step feature OFF. The steps are never deleted, so
   * re-enabling the feature restores the full flow. */
  _isCollapsedChain(recipe) {
    // Only a genuine MULTI-step recipe (> 1 authored step) collapses; a single
    // explicit step behaves exactly like a normal single-step recipe (including its
    // consume-at-start timed path), so it is never treated as a chain.
    if (!Array.isArray(recipe?.steps) || recipe.steps.length <= 1) return false;
    return this._getRecipeSystem(recipe)?.features?.multiStepRecipes !== true;
  }

  /** The single summed time gate for a collapsed chain: every authored step's `timeRequirement`
   * in seconds, or 0 when time requirements are disabled. ONE gate for the total rather than one
   * per step, so the whole atomic action waits once and then runs every step at maturity. */
  _collapsedChainSeconds(recipe, executionSteps, runManager) {
    if (!runManager || !Array.isArray(executionSteps)) return 0;
    if (!this._timeRequirementsEnabled(recipe)) return 0;
    return executionSteps.reduce(
      (total, step) =>
        total + (step?.timeRequirement ? runManager.durationToSeconds(step.timeRequirement) : 0),
      0
    );
  }

  /** Arm / resume / advance the collapsed chain's single summed time gate, called once at the
   * chain entry. `waiting: true` leaves the run active for a later resume; `waiting: false` means
   * the caller executes the steps back-to-back. The chain consumes NOTHING when the gate is
   * armed, so there is no prepared-consumption snapshot to manage. */
  async _handleCollapsedChainGate({ craftingActor, recipe, executionSteps, runManager, run }) {
    const summedSeconds = this._collapsedChainSeconds(recipe, executionSteps, runManager);
    if (summedSeconds <= 0) return { waiting: false, run };

    const now = Number(game.time?.worldTime || 0);
    const gate = run?.steps?.[0]?.timeGate;
    if (!gate) {
      const armed = await runManager.armCollapsedChainGate(craftingActor, run, summedSeconds);
      return {
        waiting: true,
        run: armed,
        result: {
          success: false,
          results: null,
          message: `Crafting ${recipe.name} is in progress (${summedSeconds}s remaining)`,
        },
      };
    }
    if (!runManager.canProceedTimeGate(run, 0, now)) {
      const remaining = Math.max(0, Math.ceil(Number(gate.availableAt || 0) - now));
      return {
        waiting: true,
        run,
        result: {
          success: false,
          results: null,
          message: `Crafting ${recipe.name} is still in progress (${remaining}s remaining)`,
        },
      };
    }
    const resumed = await runManager.markStepInProgress(craftingActor, run, 0);
    return { waiting: false, run: resumed };
  }

  /** The system-level alchemy check mode (`none` | `simple` | `tiered`), defaulting to `none`;
   * `null` for a non-alchemy system. */
  _getAlchemyCheckMode(recipe) {
    const system = this._getRecipeSystem(recipe);
    if (system?.resolutionMode !== 'alchemy') return null;
    return system?.alchemy?.checkMode || 'none';
  }

  /** Resolve the engine check's DC: a dynamic macro's returned number, the recipe's selected
   * static tier, or the static default. Any failure falls back to the default DC. Parameterized
   * over the check config so the routed check resolves its base DC the same way. */
  async _resolveSimpleCheckDc(system, simple, recipe, ingredientSet, craftingActor) {
    // THE ANCHOR, resolved FIRST and always: the record's selected difficulty tier when it
    // names one that still exists, else the static default.
    const anchor = this._resolveCheckAnchorDc(simple, recipe);
    if (simple.dcMode !== 'dynamic') return anchor;
    if (!simple.macroUuid) return anchor;
    try {
      const value = await MacroExecutor.run(simple.macroUuid, {
        recipe: recipe?.toJSON?.() || recipe,
        craftingSystem: system,
        craftingActor,
        candidateIngredientSet: ingredientSet,
        // THE MACRO RECEIVES THE ANCHOR AND RETURNS THE FINAL NUMBER (issue 1096). The tier sets
        // the anchor and the macro adjusts it, so the two COMPOSE rather than compete, and
        // neither the tiers nor the tier list are hidden under dynamic. Additive to a NAMED bag,
        // so a shipped macro that destructures the fields it wants is unaffected.
        anchorDc: anchor,
      });
      const numeric = Number(value);
      return Number.isFinite(numeric) ? Math.trunc(numeric) : anchor;
    } catch (error) {
      console.error(`Fabricate | Crafting check DC macro failed (${simple.macroUuid})`, error);
      return anchor;
    }
  }

  /** The DC before any macro runs: the record's selected difficulty tier, else the static default.
   * Split out of {@link _resolveSimpleCheckDc} because it is needed TWICE there, and a second
   * inline copy would be two chances to disagree about what "the anchor" means. */
  _resolveCheckAnchorDc(config, recipe) {
    const fallback = Number.isFinite(Number(config?.dc)) ? Math.trunc(Number(config.dc)) : 15;
    const tierId = recipe?.checkTierId;
    if (!tierId) return fallback;
    const tiers = Array.isArray(config?.tiers) ? config.tiers : [];
    const tier = tiers.find((entry) => entry.id === tierId);
    const tierDc = Number(tier?.dc);
    return tier && Number.isFinite(tierDc) ? Math.trunc(tierDc) : fallback;
  }

  /**
   * The PLAYER-SAFE chat rows for a resolution's fired complications (issue 1286).
   * `publicComplications` is the audience filter, applied on the way INTO the card, so a `gmOnly`
   * complication has no row here on any client, INCLUDING a GM's. One row per FIRING, repeats
   * NOT collapsed — collapsing would tell a player one `1d6` was rolled when two were — told
   * apart by `position`, each firing's place in the ordered stage list.
   */
  _complicationChatEntries(fired, system) {
    const componentIndex = getDefinitionIndex(resolvedComponentsFor(system));
    return publicComplications(fired).map((entry) => ({
      name: entry.name,
      description: entry.description,
      severity: entry.severity,
      componentName: findById(componentIndex, entry.componentId)?.name || '',
      position: entry.position,
    }));
  }

  /**
   * Post an automatic crafting summary chat message. Checks `system.features.chatOutput` and
   * returns silently when the toggle is off or the system cannot be resolved;
   * `ChatMessage.create` errors are caught so they never propagate up the `craft()` call stack.
   *
   * @param {Array|null} [params.firedComplications] The UNREDACTED fired list (issue 1286),
   *   redacted here via {@link _complicationChatEntries}; an absent list renders nothing.
   */
  async _postCraftChatMessage({
    success,
    craftingActor,
    recipe,
    consumedIngredients,
    tools,
    createdResults,
    failureReason,
    rollValue = null,
    tierStep = null,
    firedComplications = null,
  }) {
    const systemManager = game.fabricate?.getCraftingSystemManager?.();
    const system = systemManager?.getSystem(recipe?.craftingSystemId);
    if (!system || system.features?.chatOutput !== true) return;

    const localize = (key) => game.i18n?.localize?.(key) ?? key;

    const toolEntries = this._resolveToolChatEntries(tools, system);
    const { rolls, emptyAwards } = rolledAwardChatParts(createdResults);

    // A plain, Foundry-free model: names and images resolve here, formatting happens there.
    const content = buildCraftingChatContent(
      {
        status: success ? 'succeeded' : 'failed',
        actorName: craftingActor?.name || '',
        recipeName: recipe?.name || '',
        results: [...awardReceipts(createdResults), ...emptyAwards],
        consumed: (consumedIngredients || []).map(({ item, quantity }) => ({
          name: item?.name || '',
          img: item?.img || '',
          quantity: Number(quantity || 1),
        })),
        tools: toolEntries,
        rollValue: Number.isFinite(rollValue) ? rollValue : null,
        tierStep,
        failureReason: failureReason || '',
        complications: this._complicationChatEntries(firedComplications, system),
      },
      localize
    );

    // The rolls sound the dice and animate Dice So Nice. The custom `content` survives them because
    // the card has child elements, and a result card is never whispered, so they hide it from nobody.
    try {
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: craftingActor }),
        content,
        ...(rolls.length > 0 && { rolls }),
      });
    } catch (error) {
      console.error('Fabricate | Failed to post crafting chat message:', error);
    }
  }

  /** Resolve `[{ tool, item }]` matches to `{ name, img }` chat entries. Tools render by their
   * AUTHORED name, not the matched item's, because one owned item can satisfy more than one tool
   * slot; de-duped by component id and shared by the crafting and salvage cards. */
  _resolveToolChatEntries(tools, system) {
    const componentById = new Map(
      resolvedComponentsFor(system).map((component) => [component?.id, component])
    );
    const entries = [];
    const seen = new Set();
    for (const pair of tools || []) {
      // Skip virtual-present canvas tools (no owned item) — no chip to render.
      if (!pair?.item) continue;
      const componentId = pair.tool?.componentId || null;
      const component = componentId ? componentById.get(componentId) : null;
      const key = componentId || pair.item?.uuid || pair.item?.name || null;
      if (key && seen.has(key)) continue;
      if (key) seen.add(key);
      // `data-models` requirement 13: the authored label and the registration snapshot both
      // outrank the linked component, and the matched item is the last resort (issue 1119).
      entries.push({
        name: resolveToolDisplayName(pair.tool, component, '') || pair.item?.name || '',
        img: this._toolChatImage(pair.tool, component) || pair.item?.img || '',
      });
    }
    return entries;
  }

  /** The requirement-13 image for a chat chip, with the generic item-bag sentinel mapped back to
   * empty so the caller's own last-resort fallback still applies. */
  _toolChatImage(tool, component) {
    const img = resolveToolDisplayImage(tool, component);
    return img === TOOL_IMAGE_SENTINEL ? '' : img;
  }

  /** Resolve the `_applyToolBreakage` evidence records that BROKE this salvage to `{ name, img }`
   * chat entries, de-duped by `componentId`. Non-broken evidence is skipped, so the card names
   * only what was actually lost. */
  _resolveBrokenToolChatEntries(usedTools, system) {
    const componentById = new Map(
      resolvedComponentsFor(system).map((component) => [component?.id, component])
    );
    // The evidence carries `toolId` (issue 1119) precisely so this card can reach a Tool an
    // item sourced, which has no component to name and so resolves to nothing by `componentId`.
    const toolById = new Map(resolvedToolsFor(system).map((tool) => [tool?.id, tool]));
    const entries = [];
    const seen = new Set();
    for (const record of usedTools || []) {
      if (record?.broken !== true) continue;
      const componentId = record.componentId || null;
      const component = componentId ? componentById.get(componentId) : null;
      const tool = record.toolId ? (toolById.get(record.toolId) ?? null) : null;
      const key = record.toolId || componentId || record.itemUuid || null;
      if (key && seen.has(key)) continue;
      if (key) seen.add(key);
      entries.push({
        name: resolveToolDisplayName(tool, component, ''),
        img: this._toolChatImage(tool, component),
      });
    }
    return entries;
  }

  /**
   * The salvage analogue of {@link _postCraftChatMessage} (issue 675), on the SAME
   * `features.chatOutput` toggle and posted only for a resolved success or a rolled failure.
   *
   * @param {boolean} [params.suppressed] Post nothing (issue 859) because a bulk salvage posts
   *   ONE aggregated card; gated with `features.chatOutput` so there is one early return.
   * @param {Array|null} [params.firedComplications] The UNREDACTED fired list, redacted here.
   */
  async _postSalvageChatMessage({
    success,
    actor,
    system,
    component,
    consumedQuantity,
    results,
    usedTools,
    failureReason,
    rollValue = null,
    tierStep = null,
    suppressed = false,
    firedComplications = null,
  }) {
    if (suppressed || !system || system.features?.chatOutput !== true) return;

    const localize = (key) => game.i18n?.localize?.(key) ?? key;
    const { rolls, emptyAwards } = rolledAwardChatParts(results);
    const consumed =
      Number(consumedQuantity) > 0
        ? [
            {
              name: component?.name || '',
              img: component?.img || '',
              quantity: Number(consumedQuantity),
            },
          ]
        : [];

    const content = buildSalvageChatContent(
      {
        status: success ? 'succeeded' : 'failed',
        actorName: actor?.name || '',
        componentName: component?.name || '',
        results: [...awardReceipts(results), ...emptyAwards],
        consumed,
        tools: this._resolveBrokenToolChatEntries(usedTools, system),
        rollValue: Number.isFinite(rollValue) ? rollValue : null,
        tierStep,
        failureReason: failureReason || '',
        complications: this._complicationChatEntries(firedComplications, system),
      },
      localize
    );

    try {
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content,
        ...(rolls.length > 0 && { rolls }),
      });
    } catch (error) {
      console.error('Fabricate | Failed to post salvage chat message:', error);
    }
  }

  async _runPropertyMacro(
    macroUuid,
    recipe,
    craftingActor,
    result,
    consumedItems,
    toolItems,
    checkResult = null,
    step = null,
    precomputedEssences = null,
    resolveComponent = findMatchingComponent
  ) {
    if (!macroUuid) return null;

    const systemManager = game.fabricate?.getCraftingSystemManager?.();
    const craftingSystem = recipe?.craftingSystemId
      ? systemManager?.getSystem(recipe.craftingSystemId)
      : null;
    const features = craftingSystem?.features || {};
    const enabled = features.propertyMacros === true;
    if (!enabled) return null;

    const essenceContext = this._buildEssenceContext(
      consumedItems,
      recipe,
      precomputedEssences,
      resolveComponent
    );
    const context = {
      recipe: recipe?.toJSON?.() || recipe,
      craftingSystem,
      craftingActor,
      ingredientPool: consumedItems.map(({ item, quantity, ingredient }) => ({
        item,
        quantity,
        ingredient,
      })),
      resolvedIngredients: consumedItems.map(({ item, quantity, ingredient }) => ({
        item,
        quantity,
        ingredient,
      })),
      resolvedTools: toolItems.map(({ item, tool }) => ({
        item,
        tool,
      })),
      resolvedEssences: essenceContext.resolvedEssences,
      essenceSources: essenceContext.essenceSources,
      checkResult,
      result: result?.toJSON?.() || result,
      step,
    };

    try {
      const updates = await MacroExecutor.run(macroUuid, context);
      if (updates == null) return null;
      if (typeof updates !== 'object' || Array.isArray(updates)) {
        console.warn(`Fabricate | Property macro ${macroUuid} did not return an object`);
        return null;
      }
      return updates;
    } catch (error) {
      console.error(`Fabricate | Property macro failed (${macroUuid})`, error);
      ui.notifications.error(`Property macro failed: ${error.message || macroUuid}`);
      return null;
    }
  }

  /** Build the essence context from consumed items. `precomputedEssences` is supplied by the
   * time-gated FINISH path, whose source items are deleted, and used verbatim.
   * `resolveComponent` is the alchemy-path resolver (issue 578). */
  _buildEssenceContext(
    consumedItems,
    recipe = null,
    precomputedEssences = null,
    resolveComponent = findMatchingComponent
  ) {
    if (precomputedEssences && typeof precomputedEssences === 'object') {
      return { resolvedEssences: { ...precomputedEssences }, essenceSources: {} };
    }
    const resolvedEssences = {};
    const essenceSources = {};
    const components = this._getSystemComponents(recipe);

    for (const { item, quantity } of consumedItems) {
      const itemEssences = resolveItemEssences(
        item,
        components,
        recipe?.craftingSystemId,
        resolveComponent
      );
      for (const [essenceId, perUnit] of Object.entries(itemEssences)) {
        const value = Number(perUnit);
        if (!Number.isFinite(value) || value <= 0) continue;
        const total = value * (Number(quantity) || 1);
        resolvedEssences[essenceId] = (resolvedEssences[essenceId] || 0) + total;
        essenceSources[essenceId] ||= [];
        essenceSources[essenceId].push({
          itemId: item.id,
          actorUuid: item.parent?.uuid ?? null,
          itemUuid: item.uuid ?? null,
          itemName: item.name,
          quantityConsumed: quantity,
          essencePerItem: value,
          essenceTotal: total,
        });
      }
    }

    return { resolvedEssences, essenceSources };
  }

  _getSystemComponents(recipe) {
    const systemId = recipe?.craftingSystemId;
    if (!systemId) return [];
    const systemManager = game.fabricate?.getCraftingSystemManager?.();
    const system = systemManager?.getSystem(systemId);
    return resolvedComponentsFor(system);
  }

  /**
   * The recipe's normalized currency units, or `[]` when the recipe names no system, currency is
   * unconfigured, or the read throws — degrading to `formatCurrencyRequirement`'s raw-id fallback.
   */
  _missingItemsCurrencyUnits(recipe) {
    try {
      const units = getCurrencyRequirementConfig(recipe, this._currencySeams())?.units || [];
      return units.map((unit) => normalizeCurrencyUnit(unit)).filter(Boolean);
    } catch {
      return [];
    }
  }

  /**
   * Why the world's currency configuration cannot be spent against for this recipe, or `null`
   * when it can (issue 1493). An unresolvable currency option is refused at SELECTION, so the
   * craft dies in the missing-items message — the only surface the player reads — accusing them
   * of being poor for a cost the system could not price. {@link _formatMissingItems} uses the
   * return as a presence flag only.
   */
  _missingItemsCurrencyReason(recipe) {
    try {
      const context = resolveCurrencyContext(recipe, this._currencySeams());
      return context?.error || context?.spenderUnavailableReason || null;
    } catch {
      return null;
    }
  }

  /** Format a human-readable "missing required items" message. With a `recipe`, a component-match
   * ingredient renders with the component's display name — `"2x Iron Rivet: have 0, need 2"` —
   * instead of the nameless `"2x component"` fallback. */
  _formatMissingItems(missing, recipe = null) {
    const components = this._getSystemComponents(recipe);
    // Resolved ONCE for the whole message, not per line: `getCurrencyRequirementConfig` is a
    // corpus-scaled read the performance programme instruments (see its own comment), and a
    // missing-items list can carry many ingredients.
    const currencyUnits = this._missingItemsCurrencyUnits(recipe);
    const currencyReason = this._missingItemsCurrencyReason(recipe);
    const lines = [];

    for (const { ingredient, have, need } of missing.ingredients) {
      let line = null;
      const componentId =
        ingredient?.match?.type === 'component' ? ingredient.match.componentId : null;
      if (componentId) {
        const name = components.find((component) => component?.id === componentId)?.name;
        if (name) {
          line = `${need}x ${name}: have ${have}, need ${need}`;
        }
      }
      // Currency needs the same name resolution components get (issue 1410), on the surface that
      // renders precisely when the player CANNOT AFFORD the cost: `Ingredient.getDescription()`
      // prints `match.unit` verbatim, so the player was told "Requires 1 9KJkn2dfmziq29Gq".
      if (
        !line &&
        ingredient?.match?.type === 'currency' &&
        getMatchHandler(ingredient.match).isComplete(ingredient.match)
      ) {
        // The cost is the SAME sentence `Ingredient.getDescription` produces, with only the unit
        // resolved (issue 1410). Three departures from the item branch, all issue 1493: a
        // configuration reason REPLACES the shortfall framing; `: have N, need N` is dropped,
        // because those are occurrence counts rather than coins; and the reason is NOT composed
        // into the sentence, because this is a 5000ms toast.
        const cost = formatCurrencyRequirement(ingredient.match, currencyUnits);
        if (currencyReason) {
          console.warn('Fabricate | Currency requirement could not be priced:', currencyReason);
        }
        line = currencyReason
          ? `Requires ${cost}. ${CURRENCY_SETUP_INCOMPLETE_MESSAGE}`
          : `Insufficient currency. Requires ${cost}.`;
      }
      if (!line) {
        const description =
          typeof ingredient?.getDescription === 'function'
            ? ingredient.getDescription()
            : 'Ingredient';
        line = `${description}: have ${have}, need ${need}`;
      }
      lines.push(line);
    }

    for (const { type, have, need } of missing.essences) {
      lines.push(`${type} essence: have ${have}, need ${need}`);
    }

    for (const tool of missing.tools || []) {
      lines.push(`Tool (${toolDisplayReference(tool, recipe, this.recipeManager)}): missing`);
    }

    return lines.join('\n');
  }

  /** The recipe narrowed to one execution step, via the SHARED {@link buildStepRecipeView} that
   * `CraftingListingBuilder` also uses (issue 917), so the read side evaluates craftability
   * against exactly the view this engine crafts against. The engine drops `toolBonusModes` and
   * takes step-else-recipe precedence for routing/selection. */
  _buildStepRecipeView(recipe, step) {
    const view = buildStepRecipeView(recipe, step);
    delete view.toolBonusModes;
    view.outcomeRouting = step?.outcomeRouting || recipe.outcomeRouting || null;
    view.resultSelection = step?.resultSelection || recipe.resultSelection || null;
    return view;
  }

  _getSalvageRunManager() {
    return this.salvageRunManager || game.fabricate?.getSalvageRunManager?.() || null;
  }

  async processPendingSalvageRuns(worldTime = Number(game.time?.worldTime || 0)) {
    const salvageRunManager = this._getSalvageRunManager();
    if (!salvageRunManager) return;

    await salvageRunManager.processWorldTime(worldTime, async (actor, run) => {
      try {
        await this.salvage(actor.uuid, run.craftingSystemId, run.componentId, {
          runId: run.id,
          skipTimeGate: true,
        });
      } catch (error) {
        console.error(`Fabricate | Failed to resume salvage run ${run.id}:`, error);
      }
    });
  }

  /**
   * Perform the salvage pipeline for a component: resolve actor, system and component, then
   * validate -> tool check -> salvage check -> failure policy -> consume -> create results ->
   * record run.
   *
   * THIS METHOD PERFORMS NO OWNERSHIP CHECK (corrected by issue 675): it resolves `actorUuid`
   * through `fromUuid` and mutates that actor's Items directly. The only ownership gate is at the
   * facade, `Fabricate#salvageComponent`, which takes an ACTOR ID. No UI may plumb a uuid here.
   *
   * @param {object|null} [options.rollDecision] A PRE-RESOLVED roll decision so ONE prompt answer
   *   drives every roll of a bulk run (issue 859); no dialog is shown when set.
   * @param {boolean} [options.suppressChat] Suppress this call's per-item card (issue 859)
   *   because a bulk run posts ONE aggregated card. It does NOT suppress the roll's own
   *   `Roll#toMessage` post, which is the Dice So Nice trigger.
   * @param {boolean} [options.deferComplicationDelivery] Still FIRE complications but do not emit
   *   them, returning the GM requests on `complicationRequests` for the caller to batch into ONE
   *   socket message (issue 1286) — the GM-side rate limiter is sized on one message per run.
   */
  async salvage(actorUuid, craftingSystemId, componentId, options = {}) {
    const ctx = await this._openSalvageContext(actorUuid, craftingSystemId, componentId, options);
    if (ctx.refusal) return ctx.refusal;
    const record = await resolveSalvageRunRecord(this, ctx);
    if (record) return record.result;
    const tools = await validateSalvageTools(this, ctx);
    if (tools) return tools.result;
    const opened = await openSalvageRun(this, ctx);
    if (opened) return opened.result;
    const checked = await runSalvageCheck(this, ctx);
    if (checked) return checked.result;
    // The settlement write stays OUTSIDE the bracket, where `try` opened before this split: it is
    // an actor-flag write whose rejection must escape uncaught, because inside the bracket
    // `_recordSalvageUncertainty` would answer it with a second write to the same flag.
    await beginSalvageSettlement(this, ctx);
    try {
      await resolveSalvageFailure(this, ctx);
      const failed = await publishSalvageFailure(this, ctx);
      if (failed) return failed.result;
      await commitSalvage(this, ctx);
      await fireSalvageComplications(this, ctx);
      const succeeded = await publishSalvageSuccess(this, ctx);
      return succeeded.result;
    } catch (error) {
      await this._recordSalvageUncertainty(ctx, error);
      throw error;
    }
  }

  /**
   * The Foundry edge, the call inputs and the component this salvage runs against. A `refusal` is
   * the caller's own return; every one of them is reached before any salvage run exists.
   */
  async _openSalvageContext(actorUuid, craftingSystemId, componentId, options) {
    const ctx = {
      actorUuid,
      craftingSystemId,
      componentId,
      options,
      deferComplicationDelivery: options?.deferComplicationDelivery === true,
      actor: await fromUuid(actorUuid),
      // CACHE-ONCE, unlike `craft()`'s thunk: `openSalvageRun` samples this exactly once and
      // reuses that sample across its awaits, because salvage measures its gate from the instant
      // the run opened. It exists only to keep the bare `game` read inside this file.
      readWorldTime: () => Number(game.time?.worldTime || 0),
      refusal: null,
    };
    if (!ctx.actor) {
      ctx.refusal = salvageRefusal('Actor not found');
      return ctx;
    }

    const systemManager = game.fabricate?.getCraftingSystemManager?.();
    ctx.system = systemManager?.getSystem(craftingSystemId);
    if (!ctx.system) {
      ctx.refusal = salvageRefusal(`Crafting system "${craftingSystemId}" not found`);
      return ctx;
    }

    ctx.managedItems = resolvedComponentsFor(ctx.system);
    const componentDefinition = findById(getDefinitionIndex(ctx.managedItems), componentId);
    ctx.component = componentDefinition
      ? {
          ...componentDefinition,
          salvage: {
            ...componentDefinition.salvage,
            resultGroups: linkResultGroups(componentDefinition.salvage?.resultGroups),
          },
        }
      : null;
    if (!ctx.component) {
      ctx.refusal = salvageRefusal(`Component "${componentId}" not found in system`);
      return ctx;
    }

    if (!ctx.system.features?.salvage) {
      ctx.refusal = salvageRefusal('Salvage feature is not enabled on this crafting system');
      return ctx;
    }
    if (!ctx.component.salvage?.enabled) {
      ctx.refusal = salvageRefusal(
        `Salvage is not enabled for component "${ctx.component.name || componentId}"`
      );
      return ctx;
    }

    // 4. Validate salvage configuration via ResolutionModeService
    const resolutionService =
      this.resolutionModeService || game.fabricate?.getResolutionModeService?.();
    if (resolutionService) {
      const validation = resolutionService.validateSalvage(ctx.component, ctx.system);
      if (!validation.valid) {
        // The SAME additive discriminator the misconfigured-check abort carries (issue 859).
        // This gate runs BEFORE `_runSalvageCraftingCheck`, so without the flag a caller reads
        // a GM-side config error as a rolled failure and tells the player "nothing recovered".
        ctx.refusal = salvageRefusal(
          `Invalid salvage configuration: ${validation.errors.join(', ')}`,
          { misconfigured: true }
        );
      }
    }
    return ctx;
  }

  /** An interrupted salvage's uncertain effect, recorded on the still-active run so a resumed run
   * refuses to replay what this call may already have applied. */
  async _recordSalvageUncertainty(ctx, error) {
    const { actor, salvageRun, salvageRunManager } = ctx;
    if (!salvageRunManager || !salvageRun) return;
    const saved = salvageRunManager.getActiveRun(actor, salvageRun.id);
    if (!saved) return;
    const field = error.historyField ?? 'awards';
    saved.historySettlement = { ...saved.historySettlement, [field]: 'uncertain' };
    if (Array.isArray(error.receipts))
      saved[field === 'consumption' ? 'consumedComponents' : 'createdResults'] =
        error.receipts.map(itemReceipt);
    await salvageRunManager.updateRun(actor, saved);
  }

  async _recordSalvageConsumption(actor, manager, run, consumed) {
    if (!manager || !run) return;
    run.consumedComponents = consumed.map(mapConsumedIngredientRef);
    run.historySettlement = { ...run.historySettlement, consumption: 'complete' };
    await manager.updateRun(actor, run);
  }

  /**
   * Find items on an actor that match a managed component through the shared, list-aware,
   * system-scoped resolver, falling back to a case-SENSITIVE exact name match when none resolve
   * (closure deferred to issue 557). Public because DESTROY must match exactly what SALVAGE
   * matches: the sibling matchers fall back case-INSENSITIVELY, so matching more broadly would
   * delete items belonging to a differently-cased component.
   */
  findComponentItems(actor, component, system) {
    const items = [...actor.items];
    const components = resolvedComponentsFor(system);
    if (
      component.registeredItemUuid ||
      component.originItemUuid ||
      component.aliasItemUuids?.length
    ) {
      const byUuid = items.filter((item) =>
        itemResolvesToComponent(item, component, components, system?.id)
      );
      if (byUuid.length > 0) return byUuid;
    }
    // Name fallback (issue 557). Shared, telemetry-bearing helper (issue 540); this
    // salvage path stays case-SENSITIVE (`item.name === component.name`), unlike the
    // three case-insensitive read/craft sites.
    if (component.name) {
      return items.filter((item) =>
        matchComponentByName(item, component, { caseSensitive: true, systemId: system?.id })
      );
    }
    return [];
  }

  /** The private spelling {@link CraftingEngine#findComponentItems} was promoted from, retained as
   * a THIN DELEGATE and never a second copy: a drifted destroy matcher deletes wrong documents. */
  _findComponentItems(actor, component, system) {
    return this.findComponentItems(actor, component, system);
  }

  /** Consume a specific total quantity from component items on the actor, deleting items when
   * fully consumed and reducing quantity otherwise. WHICH items pay is the first-fit drain policy
   * in {@link planFirstFitDrain} (issue 1342), shared with the pooled companion consume; only the
   * WRITES stayed here, preserving this site's `readStackQuantity` reader. `actor` is UNUSED. */
  async _consumeComponentItems(actor, items, quantity) {
    const snapshots = items.map((item) => ({ ...(item._source ?? item), original: item }));
    const plan = planFirstFitDrain(snapshots, quantity);
    const consumed = await this._consumeIngredients(
      plan.takes.map((take) => ({ item: take.item.original, quantity: take.quantity }))
    );
    if (consumed.reduce((sum, entry) => sum + entry.quantity, 0) !== quantity) {
      const error = unconfirmedHistoryError(
        'Partial salvage consumption',
        consumed.map(mapConsumedIngredientRef)
      );
      error.historyField = 'consumption';
      throw error;
    }
    return consumed;
  }

  /** Every result in the resolved salvage groups: the created documents, plus the award records the
   * run container needs. ONE implementation, TWO callers (issue 1098). */
  async _awardSalvageResultGroups({
    actor,
    resultGroups,
    consumedItems,
    tools,
    salvageRecipeView,
    checkResult,
  }) {
    const resultItems = [];
    // The awarding component id travels beside each item, leaving `resultItems` unreshaped.
    const createdRecords = [];
    const rolledAwards = [];
    const receiptCollector = createItemReceiptCollector();
    try {
      for (const group of resultGroups) {
        for (const result of group.results || []) {
          const created = await this._createSingleResult(
            actor,
            result,
            consumedItems,
            tools,
            salvageRecipeView,
            checkResult,
            { receiptCollector, rolledAwards }
          );
          // Return each physical Item once while preserving all receipt rows.
          if (created && !resultItems.includes(created)) {
            resultItems.push(created);
          }
        }
      }
    } catch (error) {
      throw receiptCollector.failure(error);
    }
    createdRecords.push(...receiptCollector.snapshot());
    return {
      resultItems: attachRolledAwards(
        attachAwardReceipts(resultItems, createdRecords),
        rolledAwards
      ),
      createdRecords,
    };
  }

  /** The salvage failure consumption policy, defaulting to `consumeComponentOnFail: true` and
   * `breakToolsOnFail: false`. */
  _getSalvageFailureConsumptionPolicy(system) {
    const consumption = system?.salvageCraftingCheck?.consumption || {};
    return {
      consumeComponentOnFail: consumption.consumeComponentOnFail !== false,
      // Normalized systems carry `breakToolsOnFail`; tolerate the legacy key defensively.
      breakToolsOnFail:
        (consumption.breakToolsOnFail ?? consumption.consumeCatalystsOnFail) === true,
    };
  }

  /**
   * Resolve which salvage result groups to use based on mode and check result.
   *
   * `disposition: 'success'` — the DEFAULT — is the prior behaviour: `simple` awards
   * `resultGroups[0]` BY INDEX (the retain-one clamp guarantees the SUCCESS group sits there),
   * `routed` routes by `outcomeRouting[outcome]`, `progressive` spends the budget. `'failure'`
   * (issue 1098, CF1) takes the reserved `role: 'failure'` group BY ROLE, NEVER BY INDEX, routes
   * the FAILING tier's name, or returns `[]` for progressive. The CALLER owns the policy gate,
   * and `salvageRun` carries the order captured at start (issue 651 D2), never settings.
   */
  _resolveSalvageResultGroups(
    component,
    system,
    checkResult,
    salvageRun = null,
    disposition = 'success'
  ) {
    // The mode comes from the shared derivation (issue 859), which also flags a token outside
    // `simple|routed|progressive`. Legacy tokens are rewritten by the manager and the 1.4.0
    // migration, so an unsupported token is a CONFIG DEFECT: award nothing rather than guess.
    const { mode, unsupportedMode } = resolveSalvageCheck(system);
    if (unsupportedMode) return [];

    const allGroups = Array.isArray(component.salvage?.resultGroups)
      ? component.salvage.resultGroups
      : [];
    const failureAward = disposition === 'failure';

    if (mode === 'simple') {
      // BY ROLE on failure, BY INDEX on success. See the header: the retain-one clamp
      // puts the SUCCESS group at index 0, so an index-based failure selection would
      // award the full success salvage output on a failed check.
      if (failureAward) {
        const failureGroup = allGroups.find((group) => group?.role === 'failure');
        return failureGroup ? [failureGroup] : [];
      }
      return allGroups.slice(0, 1);
    }

    // One success group against a budget, and no tier to mark: a failing check has
    // nothing to select here, so `progressive` awards nothing on failure whatever the
    // policy says (issue 1098).
    if (mode === 'progressive' && failureAward) return [];

    if (mode === 'routed') {
      const outcome = checkResult?.outcome == null ? null : String(checkResult.outcome);
      const routing = component.salvage?.outcomeRouting || {};
      const routedId = outcome ? routing[outcome] : null;
      if (!routedId) return [];
      return allGroups.filter((g) => g.id === routedId);
    }

    if (mode === 'progressive') {
      const resolved = this._resolveProgressiveSalvageAward(
        component,
        system,
        checkResult,
        salvageRun
      );
      if (!resolved) return [];

      // Progressive results are a quantity-less ordered list: the loop awards each entry ONCE, so
      // the GM expresses "more of X" by listing X again. `quantity: 1` and the dropped formula are
      // forced on the award path, never in the award resolver (issues 676, 1645).
      return [
        {
          ...resolved.group,
          results: resolved.award.awarded.map((result) => ({
            ...result,
            quantity: 1,
            quantityFormula: null,
          })),
        },
      ];
    }

    // Unreachable: `mode` is one of `simple | routed | progressive` by construction and
    // every one of the three returns above. Kept as an explicit exhaustiveness fallback
    // that awards NOTHING, never `allGroups`.
    return [];
  }

  /**
   * Resolve a progressive SALVAGE award, returning the plan inputs rather than the award-shaped
   * result groups (issue 1286). Split out of {@link _resolveSalvageResultGroups} because two
   * callers need two halves of one computation: the awarded results to grant, and the WHOLE
   * ordered list plus the loop's report of why it stopped. Salvage does NOT zero the budget after
   * a `partial` tail award, which is why the loop reports `partialResult` itself (see #431).
   * `salvageRun` carries the order captured at START; no run means AUTHORED ORDER, with
   * deliberately NO settings fallback (issue 651 D2).
   */
  _resolveProgressiveSalvageAward(component, system, checkResult, salvageRun = null) {
    const allGroups = Array.isArray(component?.salvage?.resultGroups)
      ? component.salvage.resultGroups
      : [];
    const group = allGroups[0];
    if (!group) return null;

    const authored = group.results || [];
    const results =
      component.salvage?.allowPlayerResultReorder === false
        ? authored
        : applyPlayerResultOrder(authored, salvageRun?.resultOrder ?? null);

    // Resolved ONCE for the whole award rather than per result: `costFor` is called for
    // every result in the group, and every bulk row calls this method, so a scan here was
    // a `rows x results x components` term.
    const managedItemIndex = getDefinitionIndex(resolvedComponentsFor(system));
    const award = resolveProgressiveAward({
      results,
      initialRemaining: Number(checkResult?.value || 0),
      costFor: (result) =>
        Number(findById(managedItemIndex, result.componentId || result.systemItemId)?.difficulty),
      awardMode: system?.salvageCraftingCheck?.progressive?.awardMode || 'equal',
      invalidCost: 'skip',
      zeroRemainingOnPartial: false,
    });

    return { group, results, award };
  }

  /**
   * The salvage stage occurrences and award report a firing needs, or null when this salvage is
   * not progressive (issue 1286). Called at the RESOLVE site and held in a local until the award
   * is committed: `completeRun` reassigns `salvageRun`, so re-resolving afterwards would fall
   * back to the AUTHORED order and name the wrong stage. It runs the award loop a SECOND time,
   * deliberately and cheaply, because the loop is pure.
   */
  _progressiveSalvagePlanInputs(component, system, checkResult, salvageRun = null) {
    const { mode, unsupportedMode } = resolveSalvageCheck(system);
    if (unsupportedMode || mode !== 'progressive') return null;
    const resolved = this._resolveProgressiveSalvageAward(
      component,
      system,
      checkResult,
      salvageRun
    );
    if (!resolved) return null;
    const managedItemIndex = getDefinitionIndex(resolvedComponentsFor(system));
    const stages = resolved.results.map((result) => {
      const componentId = result?.componentId || result?.systemItemId || null;
      return {
        resultId: result?.id ?? null,
        componentId,
        component: componentId ? (findById(managedItemIndex, componentId) ?? null) : null,
      };
    });
    return { stages, award: resolved.award };
  }

  /** Resolve a component's salvage `toolIds` to library Tool objects from the owning system.
   * Unknown ids are skipped rather than throwing, and ids are deduped. */
  _resolveSalvageTools(system, salvage) {
    const ids = Array.isArray(salvage?.toolIds) ? salvage.toolIds : [];
    const library = resolvedToolsFor(system);
    const seen = new Set();
    const tools = [];
    for (const rawId of ids) {
      const id = String(rawId ?? '').trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const tool = library.find((entry) => entry?.id === id);
      if (tool) tools.push(tool);
    }
    return tools;
  }

  /**
   * Run the salvage crafting check for the active salvage resolution mode, dispatching on the
   * `(mode, checkUsable)` PAIR from the shared {@link resolveSalvageCheck} derivation (issue 859).
   * A check is usable only over an authored, NON-EMPTY roll formula, so a whitespace-only formula
   * reads as "no check" everywhere instead of rolling `"   "`. Routed maps the total onto a named
   * outcome tier; routed/progressive with no formula fail loudly, and every other mode with no
   * usable formula is a no-op success.
   *
   * THE CHECK-MODIFIER CONTEXT IS BUILT ONCE, HERE (issue 1095), and threaded to whichever runner
   * dispatch selects, so a fourth runner cannot ship without one. `salvageCraftingCheck`'s own
   * modifier triple selects over the system catalogue, with the COMPONENT as the subject.
   */
  async _runSalvageCraftingCheck(
    component,
    system,
    actor,
    { interactive = false, toolItems = [], rollDecision = null } = {}
  ) {
    const { mode, config, checkUsable, requiresCheck, unsupportedMode } =
      resolveSalvageCheck(system);
    const runOptions = {
      interactive,
      toolItems,
      rollDecision,
      craftingModifier: buildCheckModifierContext(system, 'salvage', component),
    };

    // A mode outside `simple|routed|progressive` is a GM-side config defect, not a rolled failure:
    // report it exactly as a missing required formula is reported so `salvage()` aborts with ZERO
    // mutation, matching `ResolutionModeService.validateSalvage`. The authored token is read HERE
    // for the MESSAGE only — never to dispatch on.
    if (unsupportedMode) {
      return {
        success: false,
        misconfigured: true,
        outcome: null,
        value: null,
        data: {},
        message: `Unsupported salvage resolution mode: ${system?.salvageResolutionMode}`,
      };
    }

    if (checkUsable) {
      if (mode === 'progressive') {
        return this._runSalvageProgressiveCheck(config, component, actor, runOptions);
      }
      if (mode === 'routed') {
        return this._runSalvageRoutedCheck(config, component, actor, runOptions);
      }
      return this._runSalvageSimpleCheck(config, component, actor, runOptions);
    }

    // A salvage check is REQUIRED to produce an outcome in progressive mode and in
    // routed mode (the routed result-group routing keys off the outcome tier name).
    if (requiresCheck) {
      return {
        success: false,
        misconfigured: true,
        outcome: null,
        value: null,
        data: {},
        message: `${mode} salvage mode requires a configured salvage check roll formula`,
      };
    }

    return { success: true, outcome: null, value: null, data: {} };
  }

  /** Resolve the salvage check DC: the per-component override when set, else the
   * check sub-object's default DC (fallback 15). */
  _resolveSalvageDc(checkMode, component) {
    const override = component?.salvage?.dcOverride;
    if (Number.isFinite(override)) return Math.trunc(override);
    const dc = Number(checkMode?.dc);
    return Number.isFinite(dc) ? Math.trunc(dc) : 15;
  }

  /**
   * The interactive roll-options bag every salvage check runner passes to its shared formula
   * runner: {@link buildInteractiveRollOptions} plus the optional PRE-RESOLVED `rollDecision`
   * (issue 859). The decision attaches ONLY when truthy, so a single-item salvage's bag stays
   * byte-identical and `evaluateCheckRoll` keeps taking the prompt path. One helper rather than
   * three inline spreads, so a fourth runner cannot silently ship without it. `modifierChoice`
   * (issue 1095) is built through the SAME {@link CraftingEngine#_buildInteractiveModifierChoice}
   * crafting uses, so salvage's `playerPicks` prompt renders on exactly crafting's terms.
   */
  _salvageRollOptions({
    interactive,
    actor,
    component,
    dc,
    rollDecision = null,
    formula = '',
    craftingModifier = null,
  }) {
    const rollOptions = buildInteractiveRollOptions({
      interactive,
      actor,
      name: component?.name,
      activity: 'Salvage',
      img: component?.img,
      dc,
      modifierChoice: this._buildInteractiveModifierChoice(
        formula,
        craftingModifier,
        actor,
        interactive
      ),
    });
    if (rollDecision) rollOptions.rollDecision = rollDecision;
    return rollOptions;
  }

  /** Salvage simple pass/fail check: compare the rolled total against the resolved DC
   * (per-component override ?? default), honouring per-die crits via {@link runFormulaPassFail}. */
  async _runSalvageSimpleCheck(
    simple,
    component,
    actor,
    { interactive = false, toolItems = [], rollDecision = null, craftingModifier = null } = {}
  ) {
    const dc = this._resolveSalvageDc(simple, component);
    // Tool bonuses append FIRST and the modifier term after them, exactly as on crafting:
    // `_appendToolCheckBonuses` rewrites the formula here, and `evaluateCheckRoll` appends
    // the resolved modifier scalar to whatever it is handed.
    const formula = await this._appendToolCheckBonuses(simple.rollFormula, toolItems);
    const result = await runFormulaPassFail({
      formula,
      dc,
      thresholdMode: simple.thresholdMode,
      triggers: simple.checkBreakage?.triggers,
      actor,
      label: 'Salvage',
      craftingModifier,
      rollOptions: this._salvageRollOptions({
        interactive,
        actor,
        component,
        dc,
        rollDecision,
        formula,
        craftingModifier,
      }),
    });
    return this._markEngineEvaluated(result);
  }

  /** Salvage progressive check: the rolled total becomes the numeric `value` progressive salvage
   * awarding spends against result difficulties, via the shared {@link runFormulaProgressive}. */
  async _runSalvageProgressiveCheck(
    progressive,
    component,
    actor,
    { interactive = false, toolItems = [], rollDecision = null, craftingModifier = null } = {}
  ) {
    const formula = await this._appendToolCheckBonuses(progressive.rollFormula, toolItems);
    const result = await runFormulaProgressive({
      formula,
      triggers: progressive.checkBreakage?.triggers,
      actor,
      label: 'Salvage',
      craftingModifier,
      // No `dc`: progressive has none, and the prompt must show no DC chip.
      rollOptions: this._salvageRollOptions({
        interactive,
        actor,
        component,
        rollDecision,
        formula,
        craftingModifier,
      }),
    });
    return this._markEngineEvaluated(result);
  }

  /**
   * Salvage routed check: roll the routed formula and map its total onto one of the configured
   * outcome tiers. The matched tier's NAME becomes the `outcome`
   * {@link _resolveSalvageResultGroups} feeds through `component.salvage.outcomeRouting`. The
   * base DC is the resolved salvage DC, so a per-component `dcOverride` shifts every relative
   * threshold. Delegates to the shared {@link runFormulaRouted}.
   */
  async _runSalvageRoutedCheck(
    routed,
    component,
    actor,
    { interactive = false, toolItems = [], rollDecision = null, craftingModifier = null } = {}
  ) {
    const dc = this._resolveSalvageDc(routed, component);
    const formula = await this._appendToolCheckBonuses(routed.rollFormula, toolItems);
    const result = await runFormulaRouted({
      formula,
      dc,
      thresholdMode: routed.thresholdMode,
      type: routed.type,
      relativeOutcomes: routed.relativeOutcomes,
      fixedOutcomes: routed.fixedOutcomes,
      triggers: routed.checkBreakage?.triggers,
      actor,
      label: 'Salvage',
      craftingModifier,
      // Clamp a below-lowest total to the closest tier (mirrors crafting); a per-
      // component dcOverride never opens a null-outcome dead zone.
      clampToNearest: true,
      rollOptions: this._salvageRollOptions({
        interactive,
        actor,
        component,
        dc,
        rollDecision,
        formula,
        craftingModifier,
      }),
    });
    return this._markEngineEvaluated(result);
  }

  /** Build a minimal recipe-like view from a component's salvage data, as context for
   * `_createSingleResult`. */
  _buildSalvageRecipeView(component, system) {
    return {
      id: component.id,
      name: component.name,
      craftingSystemId: system?.id,
      resultGroups: component.salvage?.resultGroups || [],
      outcomeRouting: component.salvage?.outcomeRouting || null,
      ingredientSets: [],
      transferEffects: false,
      toJSON() {
        return { id: this.id, name: this.name };
      },
    };
  }
}

function snapshotRequirementSet(ingredientSet) {
  const source = ingredientSet?.toJSON?.() ?? ingredientSet;
  return cloneJsonValue(source) ?? null;
}

function snapshotVersionedItem(item) {
  const data =
    cloneJsonValue(item?.toObject?.()) ??
    cloneJsonValue({
      _id: item?.id ?? null,
      name: item?.name ?? null,
      img: item?.img ?? null,
      type: item?.type ?? null,
      system: item?.system ?? {},
      flags: item?.flags ?? {},
    });
  return {
    actorUuid: item?.parent?.uuid ?? null,
    itemUuid: item?.uuid ?? item?.id ?? null,
    data,
  };
}

function rehydrateVersionedItem(snapshot = {}) {
  const data = cloneJsonValue(snapshot.data) ?? {};
  return {
    ...data,
    id: data._id ?? snapshot.itemId ?? snapshot.itemUuid ?? null,
    uuid: snapshot.itemUuid ?? data.uuid ?? data._id ?? null,
    name: data.name ?? snapshot.name ?? null,
    img: data.img ?? snapshot.img ?? null,
    parent: snapshot.actorUuid ? { uuid: snapshot.actorUuid } : null,
    toObject: () => cloneJsonValue(data),
  };
}

/** The tool half of a stage plan: the uuids the plan records and the live documents it holds. One
 * reader, so the live-resolution and start-snapshot paths cannot describe tools differently. */
function versionedToolPlan(toolValidation) {
  const tools = toolValidation.tools;
  return {
    plan: {
      toolItemUuids: tools
        .map((entry) => entry?.item?.uuid ?? entry?.item?.id ?? null)
        .filter(Boolean),
    },
    items: { toolItems: tools.map((entry) => entry.item).filter(Boolean) },
  };
}

/** Resolve a started stage from what it actually spent, never from live inventory. */
/** A refunded stage spent nothing, so it records nothing - the legacy failure path's shape. */
function clearRefundedStageState(state) {
  state.consumedItems = [];
  state.currencySettlement = null;
  if (state.essenceSpend) state.essenceSpend = { labels: {}, carriers: [] };
}

function seedStartedStageState(state, spentAtStart) {
  state.consumedItems = spentAtStart.consumedItems;
  state.resolvedEssences = spentAtStart.resolvedEssences;
  state.essenceEnabled = spentAtStart.essenceEnabled;
  state.currencySettlement = spentAtStart.currencySettlement;
  if (state.essenceSpend && spentAtStart.essenceSpend) {
    state.essenceSpend = spentAtStart.essenceSpend;
  }
}

/** The resolve-time view of a stage's START consumption: what it spent and the essence context it
 * resolved to. `null` for a stage that has not started. */
function startedConsumptionState(started) {
  if (!started || typeof started !== 'object') return null;
  return {
    consumedItems: (Array.isArray(started.consumedSnapshots) ? started.consumedSnapshots : []).map(
      rehydrateVersionedConsumedItem
    ),
    // The RESTORE-shaped copy of the same receipt, identical whichever preparation built it, so a
    // refund's plan survives the resume comparison.
    consumedSummary: cloneJsonValue(started.consumedSummary) ?? [],
    resolvedEssences: cloneJsonValue(started.resolvedEssences) ?? {},
    essenceEnabled: cloneJsonValue(started.essenceEnabled) ?? {},
    essenceSpend: craftingStepHistoryEvidence(started).essenceSpend,
    currencySettlement: { settledSpends: cloneJsonValue(started.currencySpends) ?? [] },
  };
}

function snapshotVersionedConsumedItem({ item, quantity, ingredient, snapshot }) {
  return {
    ...(snapshot ?? snapshotVersionedItem(item)),
    quantity: Number(quantity) || 0,
    ingredient: cloneJsonValue(ingredient) ?? null,
  };
}

function rehydrateVersionedConsumedItem(snapshot) {
  return {
    item: rehydrateVersionedItem(snapshot),
    quantity: Number(snapshot?.quantity) || 0,
    ingredient: cloneJsonValue(snapshot?.ingredient) ?? null,
  };
}

function snapshotVersionedToolPair({ item, tool }) {
  return {
    item: snapshotVersionedItem(item),
    tool: cloneJsonValue(tool?.toJSON?.() ?? tool) ?? null,
  };
}

function rehydrateVersionedToolPair(snapshot) {
  return {
    item: rehydrateVersionedItem(snapshot?.item),
    tool: cloneJsonValue(snapshot?.tool) ?? null,
  };
}

function rehydrateVersionedResultItem(record) {
  const item = rehydrateVersionedItem({
    actorUuid: record?.actorUuid,
    itemUuid: record?.itemUuid,
    name: record?.name,
    img: record?.img,
  });
  return item;
}

function findItemByUuid(actors, itemUuid) {
  for (const actor of actors || []) {
    const item = [...(actor?.items || [])].find(
      (candidate) => candidate?.uuid === itemUuid || candidate?.id === itemUuid
    );
    if (item) return item;
  }
  return null;
}

function versionedTransitionResult(run, outcome = {}) {
  return {
    success: outcome?.success === true,
    runId: run?.id ?? null,
    status: run?.status ?? null,
    runRevision: Number(run?.runRevision) || 0,
    waiting: run?.status === 'waitingTime',
    terminal: run?.currentStepIndex === null,
    disposition: outcome?.disposition ?? null,
    createdResultUuids: Array.isArray(outcome?.createdResultUuids)
      ? [...outcome.createdResultUuids]
      : [],
    ...(Object.hasOwn(outcome || {}, 'consumed') && { consumed: outcome.consumed === true }),
  };
}

function authorityUnavailableResult() {
  return {
    success: false,
    authorityUnavailable: true,
    results: null,
    message: 'Versioned crafting authority is unavailable.',
  };
}

function versionedFailure(message) {
  return { success: false, results: null, message };
}

function cloneJsonValue(value) {
  if (value === undefined) return;
  return JSON.parse(JSON.stringify(value));
}

function sameStringSet(left, right) {
  const leftValues = [...new Set((left || []).map(String))].sort((a, b) => a.localeCompare(b));
  const rightValues = [...new Set((right || []).map(String))].sort((a, b) => a.localeCompare(b));
  return (
    leftValues.length === rightValues.length &&
    leftValues.every((value, index) => value === rightValues[index])
  );
}
