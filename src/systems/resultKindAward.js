/**
 * The non-component result kinds (issue 1773). A `currency` result is a recipe-keyed credit and a
 * `knowledge` result a recipe-knowledge grant: each is PLANNED where items are awarded, its amount
 * resolved once there, and APPLIED by the reward step after them, so neither writes an Item.
 */
import { getFabricateFlag, setFabricateFlag } from '../config/flags.js';
import { cloneJson } from '../utils/scalars.js';

import { GRANTED_BY_MAX_LENGTH } from './companionContract.js';
import { createCurrencyCreditKind } from './companionCurrencyEffect.js';
import { grantRecipeKnowledgeEntry } from './companionKnowledgeGrant.js';
import { getCurrencyRequirementConfig } from './currencyAffordance.js';
import { currencyUnitDisplayName, findCurrencyUnit } from './currencyProfile.js';
import { resolveRolledAmount } from './rolledAmountResolver.js';
import {
  awardReceipts,
  currencyCreditRecord,
  historyEvidenceFields,
  knowledgeGrantRecord,
  unconfirmedHistoryError,
} from './runHistoryEvidence.js';

export const AWARD_REWARDS_EFFECT_ID = 'award-rewards';

const REWARD_KINDS = new Set(['currency', 'knowledge']);

export const isRewardResult = (result) => REWARD_KINDS.has(result?.kind);

const list = (value) => (Array.isArray(value) ? value : []);

/** The seams the plan, the apply and the pre-flight read, seam-first with a `game.fabricate`
 *  fallback for the system, the visibility service and the flags. */
export function craftRewardSeams({ currencySeams = {}, recipeManager = null } = {}) {
  const fabricate = () => globalThis.game?.fabricate;
  return {
    ...currencySeams,
    resolveRecipe: (id) => recipeManager?.getRecipe?.(id) ?? null,
    resolveSystem: (id) => fabricate()?.getCraftingSystemManager?.()?.getSystem?.(id) ?? null,
    isKnowledgeObservable: (system) =>
      fabricate()?.getRecipeVisibilityService?.()?.isLearnedKnowledgeObservable?.(system) === true,
    readFlag: getFabricateFlag,
    writeFlag: setFabricateFlag,
  };
}

/** The recipe's name as `grantedBy`: trimmed, then cut to the limit in code points. */
export function grantedByFor(recipe) {
  const name = typeof recipe?.name === 'string' ? recipe.name.trim() : '';
  return [...name].slice(0, GRANTED_BY_MAX_LENGTH).join('') || null;
}

const worldUnits = (recipe, seams) => getCurrencyRequirementConfig(recipe, seams)?.units ?? [];

/**
 * One reward's plan entry, its amount resolved here and nowhere later, plus the live `Roll` a card
 * carries; the entry is what the award receipt persists.
 */
export async function planReward(result, actor, recipe, { Roll, seams = {} } = {}) {
  if (result.kind === 'knowledge') {
    const taught = seams.resolveRecipe?.(result.recipeId) ?? null;
    const recipeName = typeof taught?.name === 'string' ? taught.name : null;
    return {
      entry: {
        kind: 'knowledge',
        resultId: result.id,
        recipeId: result.recipeId,
        ...(recipeName && { recipeName }),
      },
      roll: null,
    };
  }
  const { amount, rolled, roll } = await resolveRolledAmount(result, actor, { Roll });
  const unitName = currencyUnitDisplayName(
    findCurrencyUnit(worldUnits(recipe, seams), result.unit)
  );
  const entry = {
    kind: 'currency',
    ...currencyCreditRecord({ ...result, resultId: result.id, amount, rolled, unitName }),
  };
  return { entry, roll };
}

/** A non-`applied` writer answer as the error the run's recovery evidence reads. */
function rewardFailure(answer, receipts) {
  const reason = answer?.failure?.reason ?? answer?.status ?? 'unknown';
  return unconfirmedHistoryError(`Reward effects require reconciliation (${reason})`, receipts);
}

/** One credit through the world strategy's own writer, after the system's currency toggle. */
async function creditOnce(entry, { actor, recipe, seams, marker }) {
  if (getCurrencyRequirementConfig(recipe, seams)?.enabled !== true) {
    return { status: 'knownFailure', failure: { reason: 'currencyDisabled' } };
  }
  const planned = createCurrencyCreditKind({ ...seams, resolveActor: () => actor }).plan({
    recipients: [{ actorId: actor?.id ?? '', amount: entry.amount }],
    unitId: entry.unit,
  });
  if (planned.failure) return { status: 'knownFailure', failure: planned.failure };
  return planned.units[0].write({ marker, beforeWrite: () => true });
}

/**
 * Apply a reward plan once, in order: a zero credit writes nothing and is recorded empty, and an
 * already-known recipe writes nothing and is recorded `alreadyKnown`. A write that is not `applied`
 * throws carrying every receipt before it, and nothing is ever probed or replayed.
 */
export async function applyRewardPlan(plan, { actor, recipe, runId = null, seams = {} }) {
  const currencyCredits = [];
  const knowledgeGrants = [];
  const receipts = () => [...currencyCredits, ...knowledgeGrants];
  for (const [index, entry] of list(plan).entries()) {
    if (entry?.kind === 'currency') {
      const marker = { runId, effectId: AWARD_REWARDS_EFFECT_ID, resultId: entry.resultId, index };
      const answer =
        entry.amount > 0 ? await creditOnce(entry, { actor, recipe, seams, marker }) : null;
      if (answer && answer.status !== 'applied') throw rewardFailure(answer, receipts());
      currencyCredits.push(currencyCreditRecord(entry));
    } else if (entry?.kind === 'knowledge') {
      const answer = await grantRecipeKnowledgeEntry(
        {
          actor,
          recipeId: entry.recipeId,
          grantedBy: grantedByFor(recipe),
          beforeWrite: () => true,
        },
        { readFlag: seams.readFlag, writeFlag: seams.writeFlag }
      );
      if (answer.status !== 'applied') throw rewardFailure(answer, receipts());
      const outcome = answer.receipt?.result === 'alreadyKnown' ? 'alreadyKnown' : 'granted';
      knowledgeGrants.push(knowledgeGrantRecord({ ...entry, outcome }));
    }
  }
  return { currencyCredits, knowledgeGrants };
}

/** Carries a non-enumerable field on an awarded array, as its receipts and rolled awards ride. */
function attach(items, key, value) {
  Object.defineProperty(items, key, { value, configurable: true });
  return items;
}

/** The plan and live rolls `_createResultItems` resolved; never persisted from here. */
export const attachRewardPlan = (items, plan, rolls) =>
  attach(attach(items, 'rewardPlan', plan), 'rewardRolls', rolls);

/** What the reward step applied, for the chat card and the step record. */
export const attachRewardAwards = (items, awards) => attach(items, 'rewardAwards', awards);

/** Apply an awarded array's plan in place (the unversioned paths), its Item receipts kept in front
 *  of any reward receipt a failure retains. */
export async function settleRewardPlan(items, context) {
  if (list(items.rewardPlan).length === 0) return items;
  try {
    return attachRewardAwards(items, await applyRewardPlan(items.rewardPlan, context));
  } catch (error) {
    throw unconfirmedHistoryError(error.message, [
      ...list(items.historyReceipts),
      ...list(error.receipts),
    ]);
  }
}

/** The step record's award fields: the Item receipts, then any credits and grants. */
export function awardHistory(items) {
  return {
    createdResults: awardReceipts(items),
    ...historyEvidenceFields({ ...items?.rewardAwards }),
  };
}

/** What a card states about rewards: one row per credit and grant, and the credit rolls. */
export function rewardChatParts(items) {
  const awards = items?.rewardAwards;
  return {
    rolls: list(items?.rewardRolls).filter(Boolean),
    rows: [
      ...list(awards?.currencyCredits).map((credit) => ({ kind: 'currency', ...credit })),
      ...list(awards?.knowledgeGrants).map((grant) => ({ kind: 'knowledge', ...grant })),
    ],
  };
}

/** `award-results`' planned list: one entry per routed result, of every kind, as it always was. */
export const versionedResultPlan = (groups) =>
  list(groups).flatMap((group) =>
    list(group?.results).map((result) => ({
      resultId: result?.id ?? null,
      componentId: result?.componentId ?? null,
      itemUuid: result?.itemUuid ?? null,
      quantity: Number(result?.quantity) || 1,
    }))
  );

/** The ids of every reward result in the routed groups, in award order. */
export const rewardResultIds = (groups) =>
  list(groups).flatMap((group) =>
    list(group?.results)
      .filter(isRewardResult)
      .map((result) => result.id ?? null)
  );

/** The `award-results` effect: items through `createItems`, rewards planned but not applied. */
function awardResultsEffect(state, groups, createItems) {
  return {
    effectId: 'award-results',
    kind: 'awardResults',
    planned: versionedResultPlan(groups),
    apply: async () => {
      const { items, resolutionMeta } = await createItems();
      Object.assign(state, { resultItems: items, resolutionMeta, rewardPlan: items.rewardPlan });
      state.resultRecords = awardReceipts(items);
      return {
        results: state.resultRecords,
        resolutionMeta: cloneJson(resolutionMeta) ?? null,
        ...(list(items.rewardPlan).length > 0 && { rewardPlan: cloneJson(items.rewardPlan) }),
      };
    },
  };
}

/**
 * A versioned stage's award effects: `award-results`, then `award-rewards` (kind `awardRewards`)
 * only when the routed set holds a reward, so a component-only stage's plan is unchanged. The
 * reward step applies the plan the applied `award-results` receipt carries.
 */
export function versionedAwardEffects(state, { groups, createItems, actor, recipe, runId, seams }) {
  const effects = [awardResultsEffect(state, groups, createItems)];
  const planned = rewardResultIds(groups);
  if (planned.length === 0) return effects;
  effects.push({
    effectId: AWARD_REWARDS_EFFECT_ID,
    kind: 'awardRewards',
    planned,
    apply: async () => {
      const awards = await applyRewardPlan(state.rewardPlan, { actor, recipe, runId, seams });
      Object.assign(state, awards);
      if (Array.isArray(state.resultItems)) attachRewardAwards(state.resultItems, awards);
      return awards;
    },
  });
  return effects;
}

/** Restore the reward plan and what the reward step applied from the applied receipts. */
export function hydrateRewardState(state, receipts) {
  const plan = receipts['award-results']?.rewardPlan;
  if (Array.isArray(plan)) state.rewardPlan = structuredClone(plan);
  const applied = receipts[AWARD_REWARDS_EFFECT_ID];
  if (!applied) return;
  Object.assign(state, historyEvidenceFields(applied));
  if (Array.isArray(state.resultItems)) {
    attachRewardAwards(state.resultItems, historyEvidenceFields(applied));
  }
}

/** The finalize payload's award fields: the receipts, then whatever the reward step applied. */
export const stageAwardHistory = (state) => ({
  createdResults: state.resultRecords,
  ...historyEvidenceFields({
    currencyCredits: state.currencyCredits,
    knowledgeGrants: state.knowledgeGrants,
  }),
});

function currencyRefusals(result, { actor, recipe, seams }) {
  const config = getCurrencyRequirementConfig(recipe, seams);
  if (config?.enabled !== true) {
    return [`Currency reward "${result.unit}" needs currency enabled for this crafting system`];
  }
  if (!findCurrencyUnit(config.units, result.unit)) {
    return [`Currency reward unit "${result.unit}" is not configured`];
  }
  if (!result.quantityFormula && !Number.isSafeInteger(result.quantity)) {
    return [`Currency reward "${result.unit}" must be a whole amount`];
  }
  const planned = createCurrencyCreditKind({ ...seams, resolveActor: () => actor }).plan({
    recipients: [{ actorId: actor?.id ?? '', amount: 1 }],
    unitId: result.unit,
  });
  return planned.failure
    ? [`Currency reward cannot be credited to this character (${planned.failure.reason})`]
    : [];
}

function knowledgeRefusals(result, { recipe, seams }) {
  const taught = seams.resolveRecipe?.(result.recipeId) ?? null;
  if (!taught || taught.craftingSystemId !== recipe?.craftingSystemId) {
    return [`Knowledge reward recipe "${result.recipeId}" is not in this crafting system`];
  }
  const system = seams.resolveSystem?.(taught.craftingSystemId) ?? null;
  return seams.isKnowledgeObservable?.(system) === true
    ? []
    : ['Knowledge reward cannot be granted (knowledgeNotObservable)'];
}

/**
 * The pre-flight `validateCraft` runs over every result group of every step, failure-role sets
 * included, before anything is consumed: a reward under progressive, and every currency or
 * knowledge result its world cannot honour for `actor`.
 */
export function rewardRefusals(seams) {
  return (groups, { actor, recipe, progressive = false }) =>
    list(groups)
      .flatMap((group) => list(group?.results).filter(isRewardResult))
      .flatMap((result) => {
        if (progressive) return ['A progressive result must award a component'];
        const context = { actor, recipe, seams };
        return result.kind === 'currency'
          ? currencyRefusals(result, context)
          : knowledgeRefusals(result, context);
      });
}
