/**
 * The terminal Iterative Attempt's settlement (`resolution-modes` § Iterative Terminal Routing):
 * one execution journal that records the attempt, uses the step's Tools, awards the selected
 * result group at most once, completes the step, records recipe use and posts the craft card.
 */
import { cloneJson } from '../../utils/scalars.js';
import { checkDisplayForCard, rollTotalForCard, tierStepForCard } from '../craftCardFields.js';
import { CraftingLifecycleExecutor } from '../CraftingLifecycleExecutor.js';
import { craftingStepHistoryEvidence } from '../craftingStepHistoryEvidence.js';
import { stageAwardHistory, versionedAwardEffects } from '../resultKindAward.js';
import { mapConsumedIngredientRef } from '../runHistoryEvidence.js';
import { effectiveToolBreakageAuthority } from '../toolBreakageAuthority.js';
import { versionedTransitionResult } from '../versionedCommandResults.js';

import { ITERATIVE_LANE } from './IterativeAttemptExecutor.js';
import { recordAttemptOnRun } from './iterativeStepState.js';

/** The settlement's working state, seeded from what the step spent when it started. */
function settlementState(prepared) {
  const started = prepared.startedConsumption ?? {};
  return {
    consumedItems: started.consumedItems ?? [],
    resolvedEssences: started.resolvedEssences ?? null,
    essenceEnabled: started.essenceEnabled ?? null,
    usedTools: [],
    resultItems: [],
    resultRecords: [],
    resolutionMeta: null,
    toolPairs: [...prepared.toolValidation.tools], // ratchet-exempt(world-scope): not-a-system
  };
}

function recordAttemptEffect(engine, { actor, runId, stepIndex, next, checked, entry }) {
  return {
    effectId: 'record-attempt',
    kind: 'recordIterativeAttempt',
    planned: { runId, stepIndex, attempt: entry.attempt },
    apply: async ({ trusted }) => {
      const current = engine._freshVersionedRun(actor, runId);
      recordAttemptOnRun(current, stepIndex, next, { checked });
      const saved = await engine._craftingRunManager().updateRun(actor, current, {
        expectedRevision: current.runRevision,
        executionOperationId: trusted.operationId,
      });
      return { runRevision: saved.runRevision };
    },
  };
}

/** Tools are used, and broken when a check latched `toolBreakOwed`, at every step end. */
function applyToolsEffect(engine, state, { prepared, next }) {
  const recipe = prepared.executionRecipe;
  return {
    effectId: 'apply-tools',
    kind: 'applyToolUsage',
    planned: prepared.plan.toolItemUuids,
    apply: async () => {
      const authority = effectiveToolBreakageAuthority(engine._getRecipeSystem(recipe));
      const tools = prepared.toolValidation.tools; // ratchet-exempt(world-scope): not-a-system
      const forceBreak = next.toolBreakOwed !== null;
      state.usedTools = await engine._applyToolBreakage(recipe, tools, { forceBreak, authority });
      return { tools: cloneJson(state.usedTools) };
    },
  };
}

/** The selected group's award effects, none when the terminal selected no group. */
function awardEffects(engine, state, { actor, runId, inspected, terminal, checkResult }) {
  const { prepared, step, selectedSet } = inspected;
  const group = (step.resultGroups ?? []).find((entry) => entry?.id === terminal.resultGroupId);
  if (!group) return [];
  const createItems = () =>
    engine._createResultItems(
      actor,
      prepared.executionRecipe,
      step,
      selectedSet,
      state.consumedItems,
      state.toolPairs,
      checkResult,
      terminal.resultGroupId,
      {
        precomputedEssences: state.resolvedEssences,
        essenceEnabled: state.essenceEnabled,
        resolveComponent: prepared.resolveComponent,
        deferRewards: true,
      }
    );
  const recipe = prepared.executionRecipe;
  const seams = engine._rewardSeams();
  return versionedAwardEffects(state, {
    groups: [group],
    createItems,
    actor,
    recipe,
    runId,
    seams,
  });
}

/** Completes the step on the step's own captured evidence, and never with a `lastCheckResult`. */
function finalizeEffect(engine, state, { actor, runId, stepIndex, selectedSet, success }) {
  return {
    effectId: 'finalize-iterative-step',
    kind: 'finalizeIterativeStep',
    planned: { runId, stepIndex, success },
    apply: async ({ trusted }) => {
      const current = engine._freshVersionedRun(actor, runId);
      const { resolutionSnapshot, presentationSnapshot } = current.steps[stepIndex];
      const payload = {
        selectedIngredientSetId: selectedSet?.id,
        consumedIngredients: state.consumedItems.map(mapConsumedIngredientRef),
        usedTools: state.usedTools,
        ...stageAwardHistory(state),
        ...craftingStepHistoryEvidence(
          { resolutionSnapshot, presentationSnapshot },
          { executed: true }
        ),
      };
      const options = {
        expectedRevision: current.runRevision,
        executionOperationId: trusted.operationId,
      };
      const runManager = engine._craftingRunManager();
      const completed = success
        ? await runManager.completeStepSuccess(actor, current, stepIndex, payload, options)
        : await runManager.completeStepFailure(
            actor,
            current,
            stepIndex,
            'iterativeFailure',
            payload,
            options
          );
      return { status: completed.status, runRevision: completed.runRevision };
    },
  };
}

function recordRecipeUseEffect({ actor, componentSourceActors, recipe }) {
  const visibility = globalThis.game?.fabricate?.getRecipeVisibilityService?.();
  if (!visibility) return [];
  return [
    {
      effectId: 'record-recipe-use',
      kind: 'recordRecipeUse',
      planned: { recipeId: recipe.id },
      apply: async () => {
        await visibility.applyRecipeItemUseOnCraft({
          recipe,
          craftingActor: actor,
          componentSourceActors,
        });
        return { recorded: true };
      },
    },
  ];
}

/** The craft card, last, so it reports the settled run; a checked end's card claims its roll. */
function postChatEffect(engine, state, { actor, recipe, success, checkResult }) {
  return {
    effectId: 'post-chat',
    kind: 'postCraftChat',
    planned: { success },
    apply: async () => {
      await engine._postCraftChatMessage({
        success,
        craftingActor: actor,
        recipe,
        consumedIngredients: state.consumedItems,
        tools: state.toolPairs,
        createdResults: state.resultItems,
        failureReason: success ? null : 'iterativeFailure',
        rollValue: checkResult ? rollTotalForCard(checkResult) : null,
        tierStep: checkResult ? tierStepForCard(checkResult) : null,
        check: checkResult ? checkDisplayForCard(checkResult) : null,
      });
      return { posted: true };
    },
  };
}

function terminalOperation(engine, request) {
  const { actor, runId, inspected, next, checked, trusted } = request;
  const { recipe, stepIndex, prepared } = inspected;
  const { terminal } = next;
  const success = terminal.kind === 'success';
  const checkResult = checked ? trusted.resolvedCheckResult : null;
  const state = settlementState(prepared);
  const facts = { ...request, ...inspected, success, terminal, checkResult };
  const effects = [
    recordAttemptEffect(engine, { ...request, stepIndex }),
    ...(state.toolPairs.length > 0 ? [applyToolsEffect(engine, state, { prepared, next })] : []),
    ...awardEffects(engine, state, facts),
    finalizeEffect(engine, state, facts),
    ...(success ? recordRecipeUseEffect(facts) : []),
    postChatEffect(engine, state, facts),
  ];
  return {
    intent: { stepIndex, recipeId: recipe.id, trigger: 'takeAction' },
    effects: engine._captureVersionedEffectPrefixes(effects, actor, runId),
    hydrate: ({ receipts }) => engine._hydrateVersionedStageState(state, receipts),
    outcome: () => ({
      success: true,
      createdResultUuids: state.resultRecords.map((record) => record.itemUuid).filter(Boolean),
      iterative: { attempt: next.log.at(-1), stepEnd: { ...terminal }, replayed: false },
    }),
  };
}

/**
 * Settles a terminal Iterative Attempt through the stage's execution journal, under the grant
 * the attempt already consumed. A success advances to the next step, unstarted, or completes the
 * run; a failure ends the step and the run `failed`.
 */
export async function settleIterativeTerminal(engine, request) {
  const { actor, runId, expectedRevision, requestId, trusted } = request;
  const executor = new CraftingLifecycleExecutor({
    runManager: engine._craftingRunManager(),
    consumeExecutionGrant: () => trusted,
  });
  const execution = await executor.execute({
    actor,
    runId,
    expectedRevision,
    requestId,
    executionGrant: null,
    lane: ITERATIVE_LANE,
    operation: () => terminalOperation(engine, request),
  });
  return {
    ...versionedTransitionResult(execution.run, execution.outcome),
    iterative: execution.outcome.iterative,
  };
}
