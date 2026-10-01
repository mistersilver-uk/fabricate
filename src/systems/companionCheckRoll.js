/**
 * Standalone check rolls use shared mechanics without a crafting system.
 * The resolved actor, prompt, runners and dice-engine check enter through named seams.
 */

import { stripRetiredModifierPlaceholder } from '../utils/craftingCheckExpression.js';

import { additionalDiceRefusalKey } from './additionalDiceReach.js';
import { intersectAdvantageOffers, resolveAdvantageOffer } from './checkAdvantage.js';
import { isFixedSumOver, resolveCheckTarget, selectTargetAdjustment } from './checkTarget.js';
import {
  resolveCompanionCheckEvaluation,
  supportsCompanionCheckEvaluation,
} from './companionCheckEvaluation.js';
import {
  CHECK_ROLL_DEFAULT_LABEL,
  COMPANION_OUTCOMES,
  additionalDiceCallSiteRefusal,
  bulkCheckDecisionResult,
  checkRollResult,
  gateCompanionCallSite,
} from './companionContract.js';
import { normalizeCheckAdvantage } from './normalize/checkAdvantage.js';
import { hasActiveCheck } from './salvageCheckUsability.js';

/** A standalone roll authors no advantage rule, so it rolls under the default one (ruling R2). */
const COMPANION_ADVANTAGE = Object.freeze(normalizeCheckAdvantage());

/**
 * The post-shim formula, or `''` when nothing is left to roll. Re-derives
 * `resolveActiveCraftingCheckFormula` (shim before the emptiness test, issue 1094) without a
 * crafting system; the shim also empties a formula it refuses as non-additive.
 */
function resolveUsableCheckFormula(formula) {
  return stripRetiredModifierPlaceholder(String(formula ?? '')).trim();
}

/** Defaulted to a localized noun: an unguarded flavor would read "undefined check (DC 15)". */
function resolveCheckLabel(label, seams) {
  const supplied = typeof label === 'string' ? label.trim() : '';
  if (supplied !== '') return supplied;
  return seams.localize(CHECK_ROLL_DEFAULT_LABEL.key, CHECK_ROLL_DEFAULT_LABEL.fallback);
}

/**
 * A count refusal (issue 2004) names its input as `data.refusedInput`: an unresolved or
 * non-numeric base or threshold is `poolUnresolved`, and every other named input (die, explode,
 * cancel, the settled pool) is `evaluationInvalid`.
 */
function countRefusalOutcome(result) {
  const refusedInput = result?.data?.refusedInput;
  return refusedInput === 'base' || refusedInput === 'threshold'
    ? COMPANION_OUTCOMES.poolUnresolved
    : COMPANION_OUTCOMES.evaluationInvalid;
}

/**
 * The ordered outcome ladder for both runners: an additional-dice refusal (issue 2008) before the
 * `cancelled === true` shape it shares, then that dismissal, then (for a count request only) a
 * `misconfigured` pool refusal, then `value === null` (strictly: a rolled `0` is falsy) as
 * `rollFailed`, then `outcome`, ungraded answering `rolled`. The null step is sound only because
 * both pre-dispatch gates ran: `evaluateCheckRoll` also answers `value: null` with no
 * `globalThis.Roll` and for a post-shim-empty formula.
 */
function discriminateCheckOutcome(result, graded, counted = false) {
  if (result?.additionalDiceRefusal) return COMPANION_OUTCOMES.additionalDiceRefused;
  if (result?.cancelled === true) return COMPANION_OUTCOMES.cancelled;
  if (counted && result?.misconfigured === true) return countRefusalOutcome(result);
  if (result?.value === null) return COMPANION_OUTCOMES.rollFailed;
  if (!graded) return COMPANION_OUTCOMES.rolled;
  return result?.outcome === 'pass'
    ? COMPANION_OUTCOMES.checkPassed
    : COMPANION_OUTCOMES.checkFailed;
}

async function runStandaloneCheck(
  { formula, dc, compare, actor, label, interactive, rollDecision, evaluation, purchase },
  seams
) {
  const graded = Number.isFinite(dc);
  const rollOptions = seams.buildRollOptions({
    interactive,
    actor,
    activity: label,
    dc: graded ? dc : undefined,
    // The flavor names a DC only for sum/over/fixed; a roll-under target is named once it settles.
    evaluation,
  });
  // Fabricate's own prompt owns dismissal, since Foundry's RollResolver fulfils rather than aborts on close; set after the builder so a test seam can inject a dismissing prompt.
  rollOptions.prompt = seams.prompt;
  rollOptions.advantage = COMPANION_ADVANTAGE;
  Object.assign(rollOptions, purchase);
  if (rollDecision) {
    rollOptions.rollDecision = {
      bonus: rollDecision.bonus,
      rollMode: rollDecision.rollMode,
      advantage: rollDecision.advantage,
      additionalDice: rollDecision.additionalDice,
    };
  }
  const result = graded
    ? await seams.runPassFail({
        formula,
        dc,
        thresholdMode: compare === 'exceed' ? 'exceed' : 'meet',
        triggers: [],
        actor,
        label,
        rollOptions,
        craftingModifier: null,
        evaluation,
      })
    : await seams.runProgressive({
        formula,
        triggers: [],
        actor,
        label,
        rollOptions,
        craftingModifier: null,
        evaluation,
      });
  return { result, graded };
}

/**
 * The `dc` `runStandaloneCheck` grades against, resolved before any roll (issue 2003). A fixed
 * sum/under request needs its own finite `dc` (D10, preferred over an ungraded roll); an attribute
 * request ignores `dc` and reads the resolved actor instead, and any resolution failure other than
 * an invalid multiplier answers `targetUnresolved` rather than a reason code no caller expects.
 */
function resolveCompanionCheckTarget(evaluation, requestDc, actor) {
  if (evaluation.target.source !== 'attribute') {
    if (evaluation.direction === 'under' && !Number.isFinite(requestDc)) {
      return { refusal: COMPANION_OUTCOMES.evaluationInvalid };
    }
    return { dc: requestDc };
  }
  const rollData = typeof actor?.getRollData === 'function' ? actor.getRollData() : {};
  const resolved = resolveCheckTarget({
    evaluation,
    rollData,
    anchor: requestDc,
    adjustment: selectTargetAdjustment(evaluation, null),
  });
  if (resolved.ok) return { dc: resolved.target };
  return {
    refusal:
      resolved.reason === 'adjustment-invalid'
        ? COMPANION_OUTCOMES.evaluationInvalid
        : COMPANION_OUTCOMES.targetUnresolved,
  };
}

/**
 * The `dc` a request grades against: a count request ignores its own `dc` and target, always
 * grading against `pool.required` (issue 2004); any other request resolves its sum target.
 */
function resolveCompanionDc(evaluation, counted, requestDc, actor) {
  if (counted) return { dc: evaluation.pool.required };
  return resolveCompanionCheckTarget(evaluation, requestDc, actor);
}

/**
 * `rollActorCheck`'s `messageData` once graded: a caller-`dc` grade (sum/over/fixed) names it, a
 * count grade names its required count (a zero pool needs neither), and any other grade names its
 * resolved target from the runner's own executed evidence, never the request `dc`.
 */
function companionCheckMessageData({
  label,
  total,
  dc,
  graded,
  counted,
  fixedOver,
  zeroPool,
  target,
  required,
}) {
  if (!graded) return { label, total };
  if (counted) return zeroPool ? { label } : { label, total, required };
  return fixedOver ? { label, total, dc } : { label, total, target };
}

/** Whether a request names bought dice at all: any value but absent, `null` or `0`. */
function namesAdditionalDice(value) {
  return value !== undefined && value !== null && value !== 0;
}

/**
 * The additional-dice refusal a request earns before any budget read (issue 2008), or null: a
 * count its evaluation does not offer, one that is not a whole number of 0 or more, or any
 * purchase on a `broadcast` call site. The limit, availability and the spend are the engine's.
 */
function additionalDiceRequestRefusal({ requested, request }, evaluation) {
  if (!namesAdditionalDice(requested)) return null;
  if (evaluation.product !== 'count' || evaluation.pool.additionalDice.enabled !== true) {
    return 'notOffered';
  }
  if (!Number.isInteger(requested) || requested < 0) return 'choiceInvalid';
  return additionalDiceCallSiteRefusal(request);
}

/**
 * The roll options a purchase adds: a non-interactive request's count, and the unavailable reason
 * a call site that may not spend shows on the prompt.
 */
function additionalDiceOptions({ interactive, requested, request }) {
  const forcedUnavailable = additionalDiceCallSiteRefusal(request);
  return {
    ...(!interactive && namesAdditionalDice(requested) && { additionalDice: requested }),
    ...(forcedUnavailable && { forcedUnavailable }),
  };
}

/**
 * An `additionalDiceRefused` answer: its reason, the reason's key for the authored Resource name
 * and source, and every fact that key names, from the engine's notice once it read a budget.
 */
function additionalDiceRefusedAnswer({ reason, label, evaluation, actor, notice = {} }) {
  const { label: resource, source } = evaluation.pool.additionalDice;
  return checkRollResult(
    COMPANION_OUTCOMES.additionalDiceRefused,
    {
      label,
      reason,
      actor: actor?.name ?? '',
      resource,
      n: Number.isInteger(notice.dice) ? notice.dice : null,
      limit: notice.limit ?? 0,
      available: notice.available ?? 0,
    },
    { refusalKey: additionalDiceRefusalKey(reason, { label: resource, source }) }
  );
}

/**
 * Discriminate a settled runner result into `rollActorCheck`'s answer: an additional-dice refusal,
 * a dismissal, a count pool refusal (before any executed evidence, naming any dice a refused Roll
 * already spent), a generic roll failure, or the executed evidence.
 */
function buildCheckRollAnswer({ result, graded, counted, evaluation, label, dc, actor }) {
  const outcome = discriminateCheckOutcome(result, graded, counted);
  if (outcome === COMPANION_OUTCOMES.additionalDiceRefused) {
    const { additionalDiceRefusal: reason, additionalDiceNotice: notice } = result;
    return additionalDiceRefusedAnswer({ reason, label, evaluation, actor, notice });
  }
  if (outcome === COMPANION_OUTCOMES.cancelled) {
    return checkRollResult(COMPANION_OUTCOMES.cancelled, { label });
  }
  if (outcome === COMPANION_OUTCOMES.rollFailed) {
    return checkRollResult(COMPANION_OUTCOMES.rollFailed, {
      label,
      detail: typeof result?.message === 'string' ? result.message : '',
    });
  }
  if (
    outcome === COMPANION_OUTCOMES.poolUnresolved ||
    outcome === COMPANION_OUTCOMES.evaluationInvalid
  ) {
    const bought = result.data?.boughtDice?.count;
    return checkRollResult(outcome, bought ? { label, boughtDice: bought } : { label });
  }
  // `data.total`, never `value`: on the ungraded arm `value` is the awarding value a forced
  // outcome can overwrite.
  const total = result.data.total;
  const zeroPool = result.data.zeroPool === true;
  const fixedOver = !counted && isFixedSumOver(evaluation);
  const messageData = companionCheckMessageData({
    label,
    total,
    dc,
    graded,
    counted,
    fixedOver,
    zeroPool,
    target: result.data.target,
    required: evaluation.pool.required,
  });
  return checkRollResult(outcome, messageData, {
    total,
    diceGroups: result.data.diceGroups,
    resolvedFormula: result.data.resolvedFormula ?? null,
    product: result.data.product,
    direction: result.data.direction,
    comparison: result.data.comparison,
    target: result.data.target,
    margin: result.data.margin,
    successes: result.data.successes,
    cancelled: result.data.cancelled,
    targetGraded: graded && !counted && !fixedOver,
    zeroPool,
    boughtDice: result.data.boughtDice?.count ?? 0,
  });
}

/**
 * Roll one formula for one actor, graded against a finite `dc` or ungraded, without throwing.
 * The request is closed and does not spread caller properties into the runner or roll options.
 * A supplied evaluation is strictly validated after call-site and roll-decision gates, then matched to a published mode.
 */
export async function rollActorCheck(request, seams) {
  try {
    const refusal = gateCompanionCallSite(request, seams);
    if (refusal) return checkRollResult(refusal);
    return await settleRollActorCheck(request, seams);
  } catch (error) {
    return checkRollResult(COMPANION_OUTCOMES.rollFailed, {
      label: CHECK_ROLL_DEFAULT_LABEL.fallback,
      detail: typeof error?.message === 'string' ? error.message : '',
    });
  }
}

/**
 * Whether a request carries a choice the evaluator would silently discard: a `rollDecision` with
 * `interactive: false`, which `evaluateCheckRoll` reads only in its interactive branch, or an
 * interactive request's top-level `additionalDice`, where the prompt or decision chooses instead.
 */
function discardsDecision(request, interactive) {
  return interactive
    ? namesAdditionalDice(request?.additionalDice)
    : Boolean(request?.rollDecision);
}

async function settleRollActorCheck(request, seams) {
  const label = resolveCheckLabel(request?.label, seams);
  const interactive = request?.interactive === true;
  const rollDecision = request?.rollDecision ?? null;
  if (discardsDecision(request, interactive)) {
    return checkRollResult(COMPANION_OUTCOMES.invalidRollDecision, { label });
  }
  // A forwarded prompt answer with `confirmed: false` is a decline; `confirmed` is read as a named
  // key, never spread, so nothing else the caller attached is honoured.
  if (rollDecision?.confirmed === false) {
    return checkRollResult(COMPANION_OUTCOMES.cancelled, { label });
  }

  const resolved = resolveCompanionCheckEvaluation(request?.evaluation);
  if (!resolved.ok) return checkRollResult(COMPANION_OUTCOMES.evaluationInvalid, { label });
  const evaluation = resolved.evaluation;
  if (!supportsCompanionCheckEvaluation(evaluation, interactive)) {
    return checkRollResult(COMPANION_OUTCOMES.evaluationUnsupported, { label });
  }
  const counted = evaluation.product === 'count';
  const actor = request?.actor ?? null;
  const purchase = {
    interactive,
    requested: interactive ? rollDecision?.additionalDice : request?.additionalDice,
    request,
  };
  const reason = additionalDiceRequestRefusal(purchase, evaluation);
  if (reason) {
    const notice = { dice: purchase.requested };
    return additionalDiceRefusedAnswer({ reason, label, evaluation, actor, notice });
  }

  // `noFormula` applies to sum only (issue 2004): `hasActiveCheck` reads a count evaluation as
  // active regardless of `formula`. Checked before `engineUnavailable`; safe either way, as the
  // shim fails open without `Roll` and so never manufactures a spurious `noFormula`.
  const formula = String(request?.formula ?? '');
  if (!hasActiveCheck({ evaluation }, resolveUsableCheckFormula(formula))) {
    return checkRollResult(COMPANION_OUTCOMES.noFormula, { label });
  }
  if (seams.hasDiceEngine() !== true) {
    return checkRollResult(COMPANION_OUTCOMES.engineUnavailable, { label });
  }

  const targeting = resolveCompanionDc(evaluation, counted, request?.dc, actor);
  if (targeting.refusal) return checkRollResult(targeting.refusal, { label });
  const dc = targeting.dc;

  let result;
  let graded;
  try {
    ({ result, graded } = await runStandaloneCheck(
      {
        formula,
        dc,
        compare: request?.compare,
        actor,
        label,
        interactive,
        rollDecision,
        evaluation,
        purchase: additionalDiceOptions(purchase),
      },
      seams
    ));
  } catch (error) {
    return checkRollResult(COMPANION_OUTCOMES.rollFailed, {
      label,
      detail: typeof error?.message === 'string' ? error.message : '',
    });
  }

  return buildCheckRollAnswer({ result, graded, counted, evaluation, label, dc, actor });
}

/**
 * Answer one roll decision (bonus, roll mode, Advantage) for N rolls the caller makes; it rolls
 * nothing, so a dismissal mutates nothing. Mirrors `BulkSalvageService._resolveRollDecision`.
 * No `actorId` (it reads no actor) and no `interactive` (prompting is the member); still GM-gated
 * inline in the facade, `callSite`-gated, elected and `notReady`-refusing. Never throws.
 */
export async function resolveBulkCheckDecision(request, seams) {
  const refusal = gateCompanionCallSite(request, seams);
  if (refusal) return bulkCheckDecisionResult(refusal);

  const formulas = Array.isArray(request?.formulas) ? request.formulas : [];
  // The same post-shim predicate as the `noFormula` gate.
  const usable = [];
  for (const [index, formula] of formulas.entries()) {
    const resolved = resolveUsableCheckFormula(formula);
    if (resolved !== '') usable.push({ index, formula: resolved });
  }
  const covered = usable.map((entry) => entry.index);
  if (usable.length === 0) {
    // Not a failure: a batch in which nothing rolls has nothing to prompt about.
    return bulkCheckDecisionResult(COMPANION_OUTCOMES.nothingToDecide, null, {
      choice: null,
      allowAdvantage: false,
      covered,
    });
  }

  // All-or-nothing over the usable subset only, each formula under the default advantage rule.
  const advantageOffer = intersectAdvantageOffers(
    usable.map((entry) =>
      resolveAdvantageOffer({ advantage: COMPANION_ADVANTAGE, authoredFormula: entry.formula })
    )
  );
  const allowAdvantage = advantageOffer.advantage;
  // The whole batch, as the salvage service counts; with no `subjects` the dialog reads "0 items".
  const choice = await seams.promptBulk({ allowAdvantage, advantageOffer, count: formulas.length });
  if (!choice || choice.confirmed === false) {
    return bulkCheckDecisionResult(COMPANION_OUTCOMES.cancelled);
  }
  // The prompt's shape minus `confirmed`, so the evaluator reads a choice, not a cancellation.
  return bulkCheckDecisionResult(
    COMPANION_OUTCOMES.decided,
    { count: covered.length, total: formulas.length },
    {
      choice: {
        bonus: choice.bonus,
        rollMode: choice.rollMode,
        advantage: choice.advantage,
      },
      allowAdvantage,
      covered,
    }
  );
}
