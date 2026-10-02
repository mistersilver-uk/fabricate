/**
 * The Journal command's prepared-check legs (issue 2008): the additional-dice offer the authority
 * attaches when it describes a prepared count check, read for the attested sender, and the player's
 * decision evaluated under the consumed prepare token, which may spend just before the main dice.
 */
import {
  buildAdditionalDiceReach,
  publicAdditionalDiceOffer,
  resolveAdditionalDiceBudget,
} from './additionalDice.js';
import { preparedCheckKind } from './checkRoll.js';
import { preparedCountEvaluation } from './countCheck.js';
import { additionalDiceOffer } from './countCheckRoll.js';
import { resolvePool } from './countEvaluation.js';
import { decisionAdditionalDice } from './preparedDecisionPolicy.js';

function failure(reason, extra = {}) {
  return { success: false, reason, ...extra };
}

/** A transported roll decision, allowlisted: unknown keys, previews included, never cross. */
export function safeRollDecision(value) {
  const decision = value && typeof value === 'object' ? value : {};
  const modifierIds = decision.modifierIds ?? decision.chosenModifierIds;
  return {
    bonus: typeof decision.bonus === 'string' ? decision.bonus : null,
    rollMode: typeof decision.rollMode === 'string' ? decision.rollMode : null,
    advantage: typeof decision.advantage === 'string' ? decision.advantage : null,
    // `null` when no choice was offered, so the prepared defaults roll; `[]` is an answer.
    modifierIds: Array.isArray(modifierIds)
      ? modifierIds.filter((id) => typeof id === 'string')
      : null,
    ...decisionAdditionalDice(decision),
  };
}

/**
 * The offer's `reach`: none for a secret or unentitled prompt, whose pool is redacted (R3), and a
 * needed count only for a simple check whose prompt states its required count.
 */
function preparedReach({ publicPrompt: prompt, privateEvaluation: preparation }, rollOptions) {
  if (preparation?.secret === true || !Number.isFinite(prompt?.pool)) return null;
  const { evaluation, thresholdMode } = rollOptions;
  const pool = resolvePool({ evaluation, thresholdMode });
  if (!pool.ok) return null;
  const kind = preparedCheckKind(preparation);
  const config = preparation.checkConfig ?? {};
  return buildAdditionalDiceReach({
    policy: pool.policy,
    needed: kind === 'simple' && Number.isFinite(prompt.required) ? prompt.required : null,
    triggers: config.checkBreakage?.triggers ?? config.triggers ?? [],
    evaluation,
    routed: kind === 'routed',
  });
}

/**
 * The described check's public prompt with its `additionalDiceOffer`, when its snapshot enables
 * additional dice: the sender's budget, read on this client, and its reach. The read macro sees
 * the payload the evaluation's read will.
 */
export async function withPreparedAdditionalDiceOffer(descriptor, { actor, sender }) {
  const prompt = descriptor.publicPrompt;
  const count = descriptor.privateEvaluation?.decisionPolicy?.count;
  if (count?.additionalDice?.enabled !== true) return prompt;
  const { rollOptions } = preparedCountEvaluation(count);
  const additionalDice = rollOptions.evaluation.pool.additionalDice;
  const activity = descriptor.privateEvaluation.checkConfig?.craftingModifier?.activity ?? null;
  const subject = { craftingSystem: null, recipe: null, component: null, task: null };
  const evaluation = structuredClone(rollOptions.evaluation);
  const payload = { actor, user: sender, ...subject, activity, evaluation, rolls: 1 };
  const budget = await resolveAdditionalDiceBudget({
    additionalDice,
    actor,
    user: sender,
    payload,
  });
  const reach = preparedReach(descriptor, rollOptions);
  const offer = additionalDiceOffer({ additionalDice, budget, reach });
  return { ...prompt, additionalDiceOffer: publicAdditionalDiceOffer(offer) };
}

/** The facts a refused or spent additional-dice notice names, with the actor's own name. */
function noticeFacts(notice, actor) {
  return { ...notice, actorName: typeof actor?.name === 'string' ? actor.name : '' };
}

/**
 * Evaluates the player's decision under the prepare token: the token is consumed, then the active
 * GM confirmed, then the check evaluated, which may spend bought dice. Answers `{ response }` for
 * a refusal, else `{ checkResult, privateEvaluation }`; `spent` records the dice a check paid for.
 */
export async function evaluatePreparedJournalCheck({
  request,
  context,
  binding,
  evaluate,
  consumePrepareToken,
  currentRealmIsActiveGm,
  spent,
}) {
  const token = consumePrepareToken(request.payload?.prepareToken, binding);
  if (!token) return { response: failure('prepare-token-invalid') };
  if (!currentRealmIsActiveGm()) return { response: failure('active-gm-required') };
  const { actor, run, sender } = context;
  const privateEvaluation = token.binding?.privateEvaluation;
  const decision = {
    ...safeRollDecision(request.payload?.rollDecision),
    ...token.binding?.decisionPolicy,
  };
  const checkResult = await evaluate({ actor, run, sender, privateEvaluation, decision });
  const bought = checkResult?.data?.boughtDice;
  if (bought?.count > 0) {
    const label = privateEvaluation?.decisionPolicy?.count?.additionalDice?.label ?? '';
    spent.boughtDice = bought.count;
    spent.notice = noticeFacts({ dice: bought.count, label, source: bought.source }, actor);
  }
  if (!checkResult?.additionalDiceRefusal) return { checkResult, privateEvaluation };
  return {
    response: failure('additional-dice-refused', {
      additionalDiceRefusal: checkResult.additionalDiceRefusal,
      additionalDiceNotice: noticeFacts(checkResult.additionalDiceNotice, actor),
    }),
  };
}

/**
 * A reply that did not commit its stage after the check spent bought dice carries `boughtDice`
 * and the notice facts, since nothing refunds them; a reply whose run advanced resolved instead.
 */
export function withSpentAdditionalDice(response, spent, expectedRevision) {
  if (!(spent.boughtDice > 0) || !response || response.success === true) return response;
  if (Number(response.runRevision) > expectedRevision) return response;
  return { ...response, boughtDice: spent.boughtDice, additionalDiceNotice: spent.notice };
}
