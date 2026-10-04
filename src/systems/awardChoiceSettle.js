/**
 * Settling a pending award choice (issue 1773): which members are claimable now, whether an owed
 * choice blocks the next stage, and the `award-choice`, `settle-choice` and `post-chat` operation
 * the executor's award-choice lane runs on an active or terminal run.
 */
import { diceEngine } from '../utils/rollFormulaRollability.js';

import {
  awardPickRefusal,
  groupEvidenceFields,
  holdsUnsettledAwardChoice,
  isUnsettledChoice,
  memberResultRow,
} from './choiceGroupAward.js';
import { isRecipeKnown } from './companionKnowledgeGrant.js';
import { CraftingLifecycleExecutor } from './CraftingLifecycleExecutor.js';
import { getCurrencyRequirementConfig } from './currencyAffordance.js';
import { findCurrencyUnit } from './currencyProfile.js';
import {
  applyRewardPlan,
  attachRewardAwards,
  isRewardResult,
  planReward,
} from './resultKindAward.js';
import { resolveRolledAmount } from './rolledAmountResolver.js';
import {
  attachAwardReceipts,
  awardReceipts,
  createItemReceiptCollector,
  historyEvidenceFields,
  itemReceipt,
} from './runHistoryEvidence.js';
import { incrementRunRevision, RunLifecycleError } from './runLifecycleState.js';
import { STAGE_BLOCKERS } from './stageReadiness.js';
import {
  authorityUnavailableResult,
  versionedFailure,
  versionedTransitionResult,
} from './versionedCommandResults.js';

const AWARD_CHOICE_EFFECT_ID = 'award-choice';

/** The stage preparation's refusal while an earlier stage's award choice is owed. */
export const AWARD_CHOICE_PENDING = Object.freeze({
  valid: false,
  blocker: STAGE_BLOCKERS.award,
  message: 'Choose the pending reward before the next stage can begin.',
});
const REFUSED = 'AWARD_CHOICE_REFUSED';

const list = (value) => (Array.isArray(value) ? value : []);

function refusal(message) {
  const error = new Error(message);
  error.code = REFUSED;
  return error;
}

function knowledgeUnclaimableReason(member, { actor, recipe, seams }) {
  const taught = seams.resolveRecipe?.(member.recipeId) ?? null;
  if (!taught || taught.craftingSystemId !== recipe?.craftingSystemId) return 'recipeMissing';
  const system = seams.resolveSystem?.(taught.craftingSystemId) ?? null;
  if (seams.isKnowledgeObservable?.(system) !== true) return 'knowledgeNotObservable';
  return isRecipeKnown(actor, member.recipeId, seams.readFlag) ? 'alreadyKnown' : null;
}

/**
 * Why a member cannot be claimed now, or `null`, judged against the live world at settle time: a
 * component gone, currency off or its unit gone, or a taught recipe gone, unobservable or already
 * known, because picking that would write nothing.
 */
export function memberUnclaimableReason(member, context) {
  const kind = member?.kind ?? 'component';
  if (kind === 'knowledge') return knowledgeUnclaimableReason(member, context);
  if (kind === 'currency') {
    const config = getCurrencyRequirementConfig(context.recipe, context.seams);
    if (config?.enabled !== true) return 'currencyDisabled';
    return findCurrencyUnit(config.units, member.unit) ? null : 'unitMissing';
  }
  if (!member?.componentId) return member?.itemUuid ? null : 'componentMissing';
  return context.resolveComponent(member.componentId) ? null : 'componentMissing';
}

/** The run's step and pending choice for `choiceId`, or `null`. */
function locateChoice(run, choiceId) {
  for (const [stepIndex, step] of list(run?.steps).entries()) {
    const choice = list(step?.pendingAwardChoices).find((entry) => entry?.choiceId === choiceId);
    if (choice) return { stepIndex, choice };
  }
  return null;
}

/**
 * Write a settle onto the step that holds the choice: its picks, `settledAt` and outcome, and the
 * award's receipts appended to the step's own. Only the award-choice operation that planned it may
 * write it, once.
 */
export async function persistAwardChoiceSettlement(location, settlement, options = {}) {
  const run = location?.run;
  if (!run) throw new RunLifecycleError('The crafting run is unavailable', 'RUN_NOT_FOUND');
  location.assertMutation({ expectedRevision: options.expectedRevision, currentOnly: true });
  const journal = run.awardChoiceJournal;
  if (journal?.status !== 'planned' || journal.operationId !== options.executionOperationId) {
    throw new RunLifecycleError(
      'The award choice operation does not own this run',
      'EXECUTION_OPERATION_MISMATCH'
    );
  }
  const step = run.steps?.[settlement.stepIndex];
  const choice = list(step?.pendingAwardChoices).find(
    (entry) => entry?.choiceId === settlement.choiceId
  );
  if (!isUnsettledChoice(choice)) {
    throw new RunLifecycleError('The award choice is already settled', 'AWARD_CHOICE_SETTLED');
  }
  Object.assign(choice, {
    picks: [...settlement.picks],
    settledAt: location.now(),
    outcome: settlement.outcome,
  });
  const receipt = settlement.receipt ?? {};
  step.createdResults = [
    ...list(step.createdResults),
    ...list(receipt.createdResults).map(itemReceipt),
  ];
  const evidence = {
    ...historyEvidenceFields(receipt),
    ...groupEvidenceFields({ groupAwards: [settlement.groupAward] }),
  };
  for (const [key, entries] of Object.entries(evidence)) {
    if (entries.length > 0) step[key] = [...list(step[key]), ...entries];
  }
  if (step.historySettlement && !holdsUnsettledAwardChoice(step)) {
    step.historySettlement = { ...step.historySettlement, awards: 'complete' };
  }
  incrementRunRevision(run);
  return location.persist();
}

/** The cards' awarded array, rebuilt from the receipt when a resumed settle holds no live Items. */
const receiptItems = (receipt) =>
  attachRewardAwards(attachAwardReceipts([], list(receipt?.createdResults)), {
    currencyCredits: list(receipt?.currencyCredits),
    knowledgeGrants: list(receipt?.knowledgeGrants),
  });

/** The `groupAwards` entry a settle appends: the player's picks as the group's selections. */
const pickedGroupAward = (choice, picks) => ({
  choiceId: choice.choiceId,
  chooser: 'playerChooses',
  awardStrategy: choice.awardStrategy,
  count: choice.count,
  ...(choice.countRoll && { countRoll: choice.countRoll }),
  selections: picks.map((alternativeId) => ({ alternativeId })),
});

/**
 * Settles pending award choices through the executor's award-choice lane. Its collaborators are
 * each a specific seam: the run manager and grant consumer, the recipe lookup, the reward seams, a
 * component lookup in a recipe's system, the Item award and the result card.
 */
export class AwardChoiceSettler {
  constructor({
    runManager,
    consumeExecutionGrant,
    getRecipe,
    seams,
    resolveComponent,
    awardComponent,
    postChat,
  }) {
    this.runManager = runManager;
    this.consumeExecutionGrant = consumeExecutionGrant;
    this.getRecipe = getRecipe;
    this.seams = seams;
    this.resolveComponent = resolveComponent;
    this.awardComponent = awardComponent;
    this.postChat = postChat;
  }

  /** Whether `run` owes a choice with a claimable member, which its next stage waits on. */
  blocks(run, actor) {
    const context = this._claimContext(actor, this._recipeOf(run));
    return list(run?.steps)
      .flatMap((step) => list(step?.pendingAwardChoices).filter(isUnsettledChoice))
      .some((choice) =>
        list(choice.alternatives).some(
          (member) => memberUnclaimableReason(member, context) === null
        )
      );
  }

  /** Settle `choiceId` with `picks` (alternative ids) under a `chooseAward` grant. */
  async settle({ actor, runId, expectedRevision, requestId, executionGrant, choiceId, picks }) {
    const { runManager, consumeExecutionGrant } = this;
    const executor = new CraftingLifecycleExecutor({ runManager, consumeExecutionGrant });
    const chosen = list(picks).map(String);
    try {
      const execution = await executor.settleAwardChoice({
        actor,
        runId,
        expectedRevision,
        requestId,
        executionGrant,
        operation: ({ run }) => this._operation({ actor, run, requestId, choiceId, picks: chosen }),
      });
      return versionedTransitionResult(execution.run, execution.outcome);
    } catch (error) {
      if (error?.code === 'AUTHORITY_UNAVAILABLE') return authorityUnavailableResult();
      if (error?.code === REFUSED) return versionedFailure(error.message);
      throw error;
    }
  }

  /** The awarding recipe, or its id and system when it has since been deleted. */
  _recipeOf(run) {
    return (
      this.getRecipe(run?.recipeId) ?? {
        id: run?.recipeId,
        craftingSystemId: run?.craftingSystemId,
      }
    );
  }

  _claimContext(actor, recipe) {
    const resolveComponent = (componentId) => this.resolveComponent(recipe, componentId);
    return { actor, recipe, seams: this.seams, resolveComponent };
  }

  /** A resumed settle runs the plan it persisted; claimability is judged once, before the plan. */
  _operation({ actor, run, requestId, choiceId, picks }) {
    const located = locateChoice(run, choiceId);
    if (!located) throw refusal('There is no such award choice on this run');
    const { stepIndex, choice } = located;
    const recipe = this._recipeOf(run);
    const journal = run.awardChoiceJournal;
    if (journal?.status !== 'planned' || journal.requestId !== String(requestId ?? '').trim()) {
      const context = this._claimContext(actor, recipe);
      const claimable = (member) => memberUnclaimableReason(member, context) === null;
      const reason = awardPickRefusal(choice, picks, claimable);
      if (reason) throw refusal(reason);
    }
    const outcome = picks.length > 0 ? 'awarded' : 'forfeited';
    const settle = { actor, run, recipe, stepIndex, choice, picks, outcome, state: {} };
    return {
      intent: { choiceId, stepIndex },
      effects: this._effects(settle),
      hydrate: ({ receipts }) => {
        settle.state.receipt = receipts[AWARD_CHOICE_EFFECT_ID] ?? settle.state.receipt;
      },
      outcome: () => ({
        success: true,
        disposition: settle.outcome,
        createdResultUuids: list(settle.state.receipt?.createdResults)
          .map((record) => record.itemUuid)
          .filter(Boolean),
      }),
    };
  }

  /** `award-choice` writes the picks, `settle-choice` records them on the step, `post-chat` posts. */
  _effects({ actor, run, recipe, stepIndex, choice, picks, state, outcome }) {
    const { choiceId } = choice;
    return [
      {
        effectId: AWARD_CHOICE_EFFECT_ID,
        kind: 'awardChoice',
        planned: { choiceId, picks },
        apply: async () => {
          const members = picks.map((id) => choice.alternatives.find((entry) => entry.id === id));
          state.items = await this._awardPicks(members, { actor, recipe, run, choiceId });
          state.receipt = {
            createdResults: awardReceipts(state.items),
            ...historyEvidenceFields(state.items.rewardAwards),
          };
          return state.receipt;
        },
      },
      {
        effectId: 'settle-choice',
        kind: 'settleAwardChoice',
        planned: { choiceId, stepIndex, outcome },
        apply: async ({ run: current, trusted }) => {
          const groupAward = pickedGroupAward(choice, picks);
          const settlement = { stepIndex, choiceId, picks, outcome, groupAward };
          await this.runManager.settleAwardChoice(
            actor,
            run.id,
            { ...settlement, receipt: state.receipt },
            { expectedRevision: current.runRevision, executionOperationId: trusted.operationId }
          );
          return { outcome };
        },
      },
      {
        effectId: 'post-chat',
        kind: 'postCraftChat',
        planned: { success: true },
        apply: async () => {
          if (outcome !== 'awarded') return { posted: false };
          const createdResults = state.items ?? receiptItems(state.receipt);
          const card = { consumedIngredients: [], tools: [], createdResults };
          await this.postChat({ success: true, craftingActor: actor, recipe, ...card });
          return { posted: true };
        },
      },
    ];
  }

  /** Every pick's amount resolved before the first write, then the Items, then the rewards. */
  async _awardPicks(members, { actor, recipe, run, choiceId }) {
    const Roll = diceEngine();
    const carrier = { id: choiceId };
    const components = [];
    const plan = [];
    for (const member of members) {
      if (isRewardResult(member)) {
        const options = { Roll, seams: this.seams, carrier };
        plan.push((await planReward(member, actor, recipe, options)).entry);
      } else {
        components.push({ member, amount: await resolveRolledAmount(member, actor, { Roll }) });
      }
    }
    const receiptCollector = createItemReceiptCollector();
    const rolledAwards = [];
    const items = [];
    try {
      for (const { member, amount } of components) {
        const row = { ...memberResultRow(member, carrier), resolvedAmount: amount };
        const options = { receiptCollector, rolledAwards };
        const item = await this.awardComponent(actor, row, recipe, options);
        if (item && !items.includes(item)) items.push(item);
      }
    } catch (error) {
      throw receiptCollector.failure(error);
    }
    attachAwardReceipts(items, receiptCollector.snapshot());
    const context = { actor, recipe, runId: run.id, seams: this.seams };
    const rewards = await applyRewardPlan(plan, { ...context, effectId: AWARD_CHOICE_EFFECT_ID });
    return attachRewardAwards(items, rewards);
  }
}
