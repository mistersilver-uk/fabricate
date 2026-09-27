/**
 * Standalone check rolls use shared mechanics without a crafting system.
 * The resolved actor, prompt, runners and dice-engine check enter through named seams.
 */

import { hasPlainD20, stripRetiredModifierPlaceholder } from '../utils/craftingCheckExpression.js';

import {
  resolveCompanionCheckEvaluation,
  supportsCompanionCheckEvaluation,
} from './companionCheckEvaluation.js';
import {
  CHECK_ROLL_DEFAULT_LABEL,
  COMPANION_OUTCOMES,
  bulkCheckDecisionResult,
  checkRollResult,
  gateCompanionCallSite,
} from './companionContract.js';

/**
 * The post-shim formula, or `''` when nothing is left to roll. Re-derives
 * `resolveActiveCraftingCheckFormula` (shim before the emptiness test, issue 1094) without a
 * crafting system; the shim also empties a formula it refuses as non-additive.
 */
function resolveUsableCheckFormula(formula) {
  return stripRetiredModifierPlaceholder(String(formula ?? '')).trim();
}

/**
 * Internal, never a seam: an injectable copy would let the `noFormula` gate and the bulk usable
 * filter disagree, and taking no `Roll` keeps it on `evaluateCheckRoll`'s dice-engine binding.
 */
const isUsableCheckFormula = (formula) => resolveUsableCheckFormula(formula) !== '';

/** Defaulted to a localized noun: an unguarded flavor would read "undefined check (DC 15)". */
function resolveCheckLabel(label, seams) {
  const supplied = typeof label === 'string' ? label.trim() : '';
  if (supplied !== '') return supplied;
  return seams.localize(CHECK_ROLL_DEFAULT_LABEL.key, CHECK_ROLL_DEFAULT_LABEL.fallback);
}

/**
 * The ordered outcome ladder for both runners: `cancelled === true` first, then `value === null`
 * (strictly: a rolled `0` is falsy) as `rollFailed`, then `outcome`, ungraded answering `rolled`.
 * The null step is sound only because both pre-dispatch gates ran: `evaluateCheckRoll` also
 * answers `value: null` with no `globalThis.Roll` and for a post-shim-empty formula.
 */
function discriminateCheckOutcome(result, graded) {
  if (result?.cancelled === true) return COMPANION_OUTCOMES.cancelled;
  if (result?.value === null) return COMPANION_OUTCOMES.rollFailed;
  if (!graded) return COMPANION_OUTCOMES.rolled;
  return result?.outcome === 'pass'
    ? COMPANION_OUTCOMES.checkPassed
    : COMPANION_OUTCOMES.checkFailed;
}

async function runStandaloneCheck(
  { formula, dc, compare, actor, label, interactive, rollDecision },
  seams
) {
  const graded = Number.isFinite(dc);
  const rollOptions = seams.buildRollOptions({
    interactive,
    actor,
    activity: label,
    dc: graded ? dc : undefined,
  });
  // Fabricate's own prompt owns dismissal, since Foundry's RollResolver fulfils rather than aborts on close; set after the builder so a test seam can inject a dismissing prompt.
  rollOptions.prompt = seams.prompt;
  if (rollDecision) {
    rollOptions.rollDecision = {
      bonus: rollDecision.bonus,
      rollMode: rollDecision.rollMode,
      advantage: rollDecision.advantage,
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
      })
    : await seams.runProgressive({
        formula,
        triggers: [],
        actor,
        label,
        rollOptions,
        craftingModifier: null,
      });
  return { result, graded };
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

async function settleRollActorCheck(request, seams) {
  const label = resolveCheckLabel(request?.label, seams);
  const interactive = request?.interactive === true;
  const rollDecision = request?.rollDecision ?? null;
  // A decision with `interactive: false` is refused, not discarded: `evaluateCheckRoll` reads it
  // only in its interactive branch, so the base formula would silently roll.
  if (rollDecision && !interactive) {
    return checkRollResult(COMPANION_OUTCOMES.invalidRollDecision, { label });
  }
  // A forwarded prompt answer with `confirmed: false` is a decline; `confirmed` is read as a named
  // key, never spread, so nothing else the caller attached is honoured.
  if (rollDecision?.confirmed === false) {
    return checkRollResult(COMPANION_OUTCOMES.cancelled, { label });
  }

  const resolved = resolveCompanionCheckEvaluation(request?.evaluation);
  if (!resolved.ok) return checkRollResult(COMPANION_OUTCOMES.evaluationInvalid, { label });
  if (!supportsCompanionCheckEvaluation(resolved.evaluation, interactive)) {
    return checkRollResult(COMPANION_OUTCOMES.evaluationUnsupported, { label });
  }

  // `noFormula` before `engineUnavailable`; safe either way, as the shim fails open without `Roll`
  // and so never manufactures a spurious `noFormula`.
  const formula = String(request?.formula ?? '');
  if (!isUsableCheckFormula(formula)) {
    return checkRollResult(COMPANION_OUTCOMES.noFormula, { label });
  }
  if (seams.hasDiceEngine() !== true) {
    return checkRollResult(COMPANION_OUTCOMES.engineUnavailable, { label });
  }

  const dc = request?.dc;
  let result;
  let graded;
  try {
    ({ result, graded } = await runStandaloneCheck(
      {
        formula,
        dc,
        compare: request?.compare,
        actor: request?.actor ?? null,
        label,
        interactive,
        rollDecision,
      },
      seams
    ));
  } catch (error) {
    return checkRollResult(COMPANION_OUTCOMES.rollFailed, {
      label,
      detail: typeof error?.message === 'string' ? error.message : '',
    });
  }

  const outcome = discriminateCheckOutcome(result, graded);
  if (outcome === COMPANION_OUTCOMES.cancelled) {
    return checkRollResult(COMPANION_OUTCOMES.cancelled, { label });
  }
  if (outcome === COMPANION_OUTCOMES.rollFailed) {
    return checkRollResult(COMPANION_OUTCOMES.rollFailed, {
      label,
      detail: typeof result?.message === 'string' ? result.message : '',
    });
  }
  // `data.total`, never `value`: on the ungraded arm `value` is the awarding value a forced
  // outcome can overwrite.
  const total = result.data.total;
  // Only the graded strings name the DC; `assertMessageDataCovers` derives keys from the string.
  return checkRollResult(outcome, graded ? { label, total, dc } : { label, total }, {
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
  });
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

  // All-or-nothing over the usable subset only.
  const allowAdvantage = usable.every((entry) => hasPlainD20(entry.formula));
  // The whole batch, as the salvage service counts; with no `subjects` the dialog reads "0 items".
  const choice = await seams.promptBulk({ allowAdvantage, count: formulas.length });
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
