/**
 * Settling a pending award choice (issue 1773): which alternatives are claimable now, whether an
 * owed choice blocks the next stage, and the `award-choice`, `settle-choice` and `post-chat`
 * operation the executor's award-choice lane runs on an active or terminal run.
 */
import { diceEngine } from '../utils/rollFormulaRollability.js';
import { arrayOrEmpty as list } from '../utils/scalars.js';

import {
  awardPickRefusal,
  groupEvidenceFields,
  isUnsettledChoice,
  memberResultRow,
  pickedGroupAward,
} from './choiceGroupAward.js';
import { isRecipeKnown } from './companionKnowledgeGrant.js';
import { CraftingLifecycleExecutor } from './CraftingLifecycleExecutor.js';
import {
  applyRewardPlan,
  attachRewardAwards,
  currencyCreditBlocker,
  isRewardResult,
  planReward,
  rewardRefusals,
} from './resultKindAward.js';
import { resolveRolledAmount, rolledAmountRefusals } from './rolledAmountResolver.js';
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
const SETTLE_IN_PROGRESS = "Another settle of this run's reward is still in progress";
/** The executor's refusals before any plan is written: a settle refused there changed nothing. */
const PRE_PLAN_CODES = new Set([
  'PLAN_MISMATCH',
  'EXECUTION_IN_PROGRESS',
  'RUN_PAUSED',
  'STALE_RUN_REVISION',
  'LEGACY_RUN',
  'RUN_NOT_FOUND',
]);

function refusal(message) {
  const error = new Error(message);
  error.code = REFUSED;
  return error;
}

/** A bare `itemUuid` resolved without loading it; a compendium uuid answers its index entry. */
function resolveItemSync(uuid) {
  try {
    return globalThis.fromUuidSync?.(uuid, { strict: false }) ?? null;
  } catch {
    return null;
  }
}

function knowledgeUnclaimableReason(member, { actor, recipe, seams }) {
  const taught = seams.resolveRecipe?.(member.recipeId) ?? null;
  if (!taught || taught.craftingSystemId !== recipe?.craftingSystemId) return 'recipeMissing';
  const system = seams.resolveSystem?.(taught.craftingSystemId) ?? null;
  if (seams.isKnowledgeObservable?.(system) !== true) return 'knowledgeNotObservable';
  return isRecipeKnown(actor, member.recipeId, seams.readFlag) ? 'alreadyKnown' : null;
}

/**
 * Why an alternative cannot be claimed now, or `null`, judged against the live world at settle
 * time: its component or Item gone, a credit the world writer would refuse, or a taught recipe
 * gone, unobservable or already known, because picking that would write nothing.
 */
export function memberUnclaimableReason(member, context) {
  const kind = member?.kind ?? 'component';
  if (kind === 'knowledge') return knowledgeUnclaimableReason(member, context);
  if (kind === 'currency') return currencyCreditBlocker(member.unit, context);
  const found = member?.componentId
    ? context.resolveComponent(member.componentId)
    : member?.itemUuid && context.resolveItem(member.itemUuid);
  return found ? null : 'componentMissing';
}

/**
 * The step and pending choice `choiceId` names: on `stepIndex` when a persisted plan fixed it,
 * else the first still owed, else the first settled, so a repeat is refused as settled.
 */
function locateChoice(run, choiceId, stepIndex = null) {
  const located = list(run?.steps).flatMap((step, index) =>
    list(step?.pendingAwardChoices)
      .filter((entry) => entry?.choiceId === choiceId)
      .map((choice) => ({ stepIndex: index, choice }))
  );
  if (stepIndex !== null) return located.find((entry) => entry.stepIndex === stepIndex) ?? null;
  return located.find((entry) => isUnsettledChoice(entry.choice)) ?? located[0] ?? null;
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
  incrementRunRevision(run);
  return location.persist();
}

/** The cards' awarded array, rebuilt from the receipt when a resumed settle holds no live Items. */
const receiptItems = (receipt) =>
  attachRewardAwards(attachAwardReceipts([], list(receipt?.createdResults)), {
    currencyCredits: list(receipt?.currencyCredits),
    knowledgeGrants: list(receipt?.knowledgeGrants),
  });

/**
 * Settles pending award choices through the executor's award-choice lane. Its collaborators are
 * each a specific seam: the run manager and grant consumer, the recipe lookup, the reward seams, a
 * component lookup in a recipe's system, a synchronous Item lookup, the Item award and the card.
 */
export class AwardChoiceSettler {
  constructor({
    runManager,
    consumeExecutionGrant,
    getRecipe,
    seams,
    resolveComponent,
    resolveItem = resolveItemSync,
    awardComponent,
    postChat,
  }) {
    this.runManager = runManager;
    this.consumeExecutionGrant = consumeExecutionGrant;
    this.getRecipe = getRecipe;
    this.seams = seams;
    this.resolveComponent = resolveComponent;
    this.resolveItem = resolveItem;
    this.awardComponent = awardComponent;
    this.postChat = postChat;
  }

  /**
   * Whether `run` owes a choice with a claimable alternative: the one predicate both the next
   * stage's start and the world-time sweep wait on.
   */
  blocks(run, actor) {
    const claimable = this._claimable(actor, this._recipeOf(run));
    return list(run?.steps)
      .flatMap((step) => list(step?.pendingAwardChoices).filter(isUnsettledChoice))
      .some((choice) => list(choice.alternatives).some(claimable));
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
      if (error?.code === REFUSED || PRE_PLAN_CODES.has(error?.code)) {
        return versionedFailure(error.message);
      }
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

  /** Why `actor` cannot claim an alternative of `run`'s choices now, or `null`, for the Journal. */
  unclaimable(run, actor) {
    return this._unclaimable(actor, this._recipeOf(run));
  }

  _unclaimable(actor, recipe) {
    const resolveComponent = (componentId) => this.resolveComponent(recipe, componentId);
    const { seams, resolveItem } = this;
    const context = { actor, recipe, seams, resolveComponent, resolveItem };
    return (member) => memberUnclaimableReason(member, context);
  }

  _claimable(actor, recipe) {
    const reason = this._unclaimable(actor, recipe);
    return (member) => reason(member) === null;
  }

  /**
   * A fresh settle is refused before any plan exists, and while another settle's plan is open; a
   * resume runs the plan it persisted, with no claim check. Until `award-choice` has started,
   * every pick is resolved here, so it only writes.
   */
  async _operation({ actor, run, requestId, choiceId, picks }) {
    const journal = run.awardChoiceJournal;
    const planned = journal?.status === 'planned';
    const resuming = planned && journal.requestId === String(requestId ?? '').trim();
    if (planned && !resuming) throw refusal(SETTLE_IN_PROGRESS);
    const located = locateChoice(run, choiceId, resuming ? journal.intent?.stepIndex : null);
    if (!located) throw refusal('There is no such award choice on this run');
    const { stepIndex, choice } = located;
    const recipe = this._recipeOf(run);
    const members = picks.map((id) => list(choice.alternatives).find((entry) => entry.id === id));
    const outcome = picks.length > 0 ? 'awarded' : 'forfeited';
    const settle = { actor, run, recipe, stepIndex, choice, picks, members, outcome, state: {} };
    if (!resuming) this._refuseUnpreparedPicks(settle);
    const award = journal?.effects?.find((effect) => effect.effectId === AWARD_CHOICE_EFFECT_ID);
    if (!resuming || award?.phase === 'planned') {
      settle.state.resolved = await this._resolve(settle);
    }
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

  /** The pick rules, then the craft-time pre-flight over the picks: either refuses the settle. */
  _refuseUnpreparedPicks({ actor, recipe, choice, picks, members }) {
    const reason = awardPickRefusal(choice, picks, this._claimable(actor, recipe));
    if (reason) throw refusal(reason);
    const groups = [{ results: members }];
    const errors = [
      ...rewardRefusals(this.seams)(groups, { actor, recipe }),
      ...rolledAmountRefusals(groups, diceEngine(), actor?.getRollData?.() ?? {}),
    ];
    if (errors.length > 0) throw refusal(errors.join(', '));
  }

  /** Every pick's amount and reward plan, resolved once; a roll that cannot total refuses. */
  async _resolve({ actor, recipe, choice, members }) {
    const Roll = diceEngine();
    const carrier = { id: choice.choiceId, resultRowId: choice.resultRowId };
    const resolved = { rows: [], plan: [] };
    try {
      for (const member of members) {
        if (isRewardResult(member)) {
          const options = { Roll, seams: this.seams, carrier };
          resolved.plan.push((await planReward(member, actor, recipe, options)).entry);
        } else {
          const amount = await resolveRolledAmount(member, actor, { Roll });
          resolved.rows.push({ ...memberResultRow(member, carrier), resolvedAmount: amount });
        }
      }
    } catch (error) {
      throw refusal(error?.message ?? String(error));
    }
    return resolved;
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
          state.items = await this._awardPicks(state.resolved, { actor, recipe, run });
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

  /** The resolved picks written: their Items, then their credits and grants. */
  async _awardPicks({ rows, plan }, { actor, recipe, run }) {
    const receiptCollector = createItemReceiptCollector();
    const items = [];
    try {
      for (const row of rows) {
        const item = await this.awardComponent(actor, row, recipe, { receiptCollector });
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
