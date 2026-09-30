/**
 * Evaluates and grades a success-counting check (DOMAIN.md "Check"): resolve the pool, settle
 * any pre-roll, roll the registered count Roll once, then pass/fail, a routed tier or a
 * progressive budget. The per-die direction governs qualification only; grading is always
 * `net >= required`, and routing ranks a higher net as better whatever that direction.
 */
import { resolveCheckModifierFormula } from './checkModifierResolver.js';
import { resolveModifierPreRolls } from './checkModifierRolls.js';
import { SUM_OVER_EVALUATION } from './checkModifierRouter.js';
import { defersModifierChoice, resolveCheckDecision } from './checkRollDecision.js';
import {
  checkRollHandoff,
  postCheckRoll,
  preRollEvidence,
  reportedVisibility,
  rolledDiceGroups,
} from './checkRollOutput.js';
import { classifyCheckTotal, forcedFailureTier, resolveForcedOutcome } from './checkRouting.js';
import { actorRollData, checkTargetRefusal } from './checkTarget.js';
import { countFlavorSuffix, namedPoolRefusal } from './countCheck.js';
import { countRollReport, reportedCountDisplay } from './countDisplayEvidence.js';
import { COUNT_CHECK_REFUSALS, countCheckPasses, resolvePool } from './countEvaluation.js';
import { CountRollRefusal, findCountRoll } from './countRoll.js';

const NO_ENGINE = { engine: false, total: 0, diceGroups: [], resolvedFormula: null };

/**
 * Evaluates a count check to `{ engine, total: net, diceGroups, policy, countProjection,
 * modifierPlacement }`, or `{ zeroPool: true }` with no main Roll, or `{ refusal }` for a pool
 * that cannot roll. The pool resolves before any prompt or pre-roll and again once they settle.
 * Options are `evaluateCheckRoll`'s, with the normalized count `evaluation` and `thresholdMode`.
 */
export async function evaluateCountCheckRoll(actor, options = {}) {
  const Roll = globalThis.Roll;
  if (typeof Roll !== 'function') return NO_ENGINE;
  const { evaluation, thresholdMode } = options;
  const rollData = actorRollData(actor);
  const unrolled = resolvePool({ evaluation, thresholdMode, rollData });
  if (!unrolled.ok)
    return { engine: true, refusal: namedPoolRefusal(unrolled, evaluation, rollData) };
  const CountRoll = findCountRoll(globalThis.CONFIG);
  if (!CountRoll) throw new Error('The Fabricate count roll is not registered');
  const deferred = defersModifierChoice(options);
  const { selected } = deferred
    ? { selected: [] }
    : resolveCheckModifierFormula('', actor, options.craftingModifier, Roll, evaluation);
  const decision = await resolveCheckDecision({
    authoredFormula: '',
    actor,
    options,
    evaluation,
    deferred,
    resolvedCheck: { formula: '', selected },
    displayFormula: () => null,
    Roll,
    countPolicy: unrolled.policy,
  });
  if (decision.cancelled) return { ...NO_ENGINE, engine: true, cancelled: true };
  const { placement, rolls: preRolls } = await resolveModifierPreRolls(decision.placementPlan, {
    Roll,
    rollData,
  });
  const settled = resolvePool({ evaluation, thresholdMode, rollData, placement });
  if (!settled.ok) return { engine: true, refusal: settled, modifierPlacement: placement };
  const rolled = {
    engine: true,
    policy: settled.policy,
    modifierPlacement: placement,
    ...countRollReport(options, { decision, evaluation, placement }),
  };
  if (settled.policy.zeroPool) {
    return { ...rolled, zeroPool: true, total: null, diceGroups: [], resolvedFormula: null };
  }
  const roll = CountRoll.fromPolicy(settled.policy);
  try {
    await roll.evaluate({ allowInteractive: false });
  } catch (error) {
    if (!(error instanceof CountRollRefusal) || !COUNT_CHECK_REFUSALS.includes(error.reason)) {
      throw error;
    }
    const refusal = { ok: false, reason: error.reason, refusedInput: error.refusedInput };
    return { engine: true, refusal, modifierPlacement: placement };
  }
  const flavor = countFlavor(decision.flavor, options);
  const posting = { roll, options, flavor, rollMode: decision.rollMode };
  await postCheckRoll({ ...posting, preRolls });
  const handoff = checkRollHandoff({ ...posting, placement });
  return {
    ...rolled,
    total: roll.total,
    diceGroups: rolledDiceGroups(roll),
    countProjection: roll.countProjection(),
    resolvedFormula: null,
    ...(handoff && { rollHandoff: handoff }),
  };
}

/**
 * The flavor the count Roll posts: a pass/fail or relative check names its required count after
 * the caller's flavor and before any chosen-modifier label, as a summed target is named.
 */
function countFlavor(flavor, options) {
  if (typeof flavor !== 'string' || !Number.isInteger(options?.required)) return flavor;
  const base = flavor.startsWith(options.flavor ?? '\0') ? options.flavor : flavor;
  return `${base}${countFlavorSuffix(options.required)}${flavor.slice(base.length)}`;
}

/** A count refusal's misconfigured result: its reason, the input it names, and a sentence. */
export function countRefusalResult(refusal, label) {
  return checkTargetRefusal(refusal.reason, label, refusal);
}

/**
 * Count `data`: `dc` null, `target` the effective per-die threshold, `total` the raw net, and
 * `margin` the net less the required count the roll matched (null when none applies).
 */
function countEvidence(rolled, required) {
  const { policy, countProjection } = rolled;
  return {
    product: 'count',
    direction: policy.direction,
    comparison: policy.comparison,
    dc: null,
    target: policy.threshold,
    total: rolled.total,
    successes: countProjection.successes,
    cancelled: countProjection.cancelled,
    margin: Number.isFinite(required) ? rolled.total - required : null,
  };
}

/** A zero pool's `data`: nothing was rolled, so every rolled figure is null. */
function zeroPoolEvidence(rolled) {
  const { policy } = rolled;
  return {
    formula: '',
    resolvedFormula: null,
    product: 'count',
    direction: policy.direction,
    comparison: policy.comparison,
    dc: null,
    target: policy.threshold,
    total: null,
    successes: null,
    cancelled: null,
    margin: null,
    zeroPool: true,
    diceGroups: [],
    ...preRollEvidence(rolled),
  };
}

function rolledEvidence(rolled, required) {
  return {
    formula: '',
    resolvedFormula: null,
    ...countEvidence(rolled, required),
    diceGroups: rolled.diceGroups,
    ...preRollEvidence(rolled),
  };
}

/** Pass/fail: `net >= required`, forced outcomes honoured; a zero pool fails without triggers. */
export function gradeCountPassFail(rolled, { required, triggers, label = 'Crafting' }) {
  if (rolled.zeroPool) {
    return {
      success: false,
      outcome: 'fail',
      value: 0,
      data: zeroPoolEvidence(rolled),
      message: `${label} check failed`,
      ...reportedVisibility(rolled),
      ...reportedCountDisplay(rolled, required),
    };
  }
  const net = rolled.total;
  const forced = resolveForcedOutcome(triggers, { total: net, diceGroups: rolled.diceGroups });
  const success = forced
    ? forced.disposition === 'success'
    : countCheckPasses({ policy: rolled.policy, net, required });
  return {
    success,
    outcome: success ? 'pass' : 'fail',
    value: net,
    data: {
      ...rolledEvidence(rolled, required),
      ...(forced && { forcedOutcome: forced.disposition }),
    },
    message: success ? null : `${label} check failed`,
    ...reportedVisibility(rolled),
    ...reportedCountDisplay(rolled, required),
  };
}

/**
 * Routed: the net classified over and met against `required + outcome.dc`, with no target shift.
 * A zero pool routes like a forced failure, with no step and no minimum gate.
 */
export function gradeCountRouted(rolled, { required, label = 'Crafting', ...routing }) {
  const { type, relativeOutcomes, fixedOutcomes } = routing;
  // A fixed-range check grades the net itself, so its card states no required count.
  const reported = {
    ...reportedVisibility(rolled),
    ...reportedCountDisplay(rolled, type === 'fixed' ? null : required),
  };
  if (rolled.zeroPool) {
    const tier = forcedFailureTier({ type, dc: required, relativeOutcomes, fixedOutcomes });
    return {
      success: false,
      outcome: tier?.name ?? null,
      value: 0,
      data: {
        ...zeroPoolEvidence(rolled),
        type,
        outcomeId: tier?.id ?? null,
        success: false,
        breakTools: tier?.breakTools === true,
      },
      message: `${label} check failed`,
      ...reported,
    };
  }
  const classified = classifyCheckTotal({
    ...routing,
    total: rolled.total,
    dc: required,
    comparison: 'meet',
    diceGroups: rolled.diceGroups,
    evaluation: SUM_OVER_EVALUATION,
    targetDelta: 0,
  });
  const { matched, success } = classified;
  return {
    success,
    outcome: matched ? matched.name : null,
    value: rolled.total,
    data: {
      ...rolledEvidence(rolled, classified.target),
      type,
      outcomeId: matched?.id ?? null,
      success,
      breakTools: classified.breakTools,
      ...(classified.forcedDisposition && { forcedOutcome: classified.forcedDisposition }),
      ...(classified.tierStepApplied && { tierStepApplied: classified.tierStepApplied }),
      ...(classified.minTierFailed && {
        minTierFailed: true,
        blockedOutcomeId: classified.blockedOutcomeId,
      }),
    },
    message: success ? null : `${label} check failed`,
    ...reported,
  };
}

/**
 * Progressive: the budget is `max(0, net)`, which `progressiveValue` reads, while `rollTotal`
 * reads the raw net. A forced success spends everything and a forced failure nothing.
 */
export function gradeCountProgressive(rolled, { triggers }) {
  if (rolled.zeroPool) {
    return {
      success: true,
      outcome: null,
      value: 0,
      data: { ...zeroPoolEvidence(rolled), value: 0 },
      ...reportedVisibility(rolled),
      ...reportedCountDisplay(rolled, null),
    };
  }
  const budget = Math.max(0, rolled.total);
  const forced = resolveForcedOutcome(triggers, {
    total: rolled.total,
    value: budget,
    diceGroups: rolled.diceGroups,
  });
  let value = budget;
  if (forced) value = forced.disposition === 'success' ? Number.MAX_SAFE_INTEGER : 0;
  return {
    success: true,
    outcome: null,
    value,
    data: {
      ...rolledEvidence(rolled, null),
      value,
      ...(forced && { forcedOutcome: forced.disposition }),
    },
    ...reportedVisibility(rolled),
    ...reportedCountDisplay(rolled, null),
  };
}

/**
 * Evaluates a count check for a runner, or answers `{ exit }`: a refusal, a thrown roll, a
 * cancelled prompt (zero mutation) or a missing dice engine (`headless`).
 */
async function rollCountCheck({ actor, options, label, kind = '', headless }) {
  let rolled;
  try {
    rolled = await evaluateCountCheckRoll(actor, options);
  } catch (error) {
    console.error(`Fabricate | ${label} ${kind}count check roll failed`, error);
    const message = `${label} check roll failed: ${error.message}`;
    return {
      exit: { success: false, outcome: kind ? null : 'fail', value: null, data: {}, message },
    };
  }
  if (rolled.refusal) return { exit: countRefusalResult(rolled.refusal, label) };
  if (rolled.cancelled) {
    return { exit: { success: false, cancelled: true, outcome: null, value: null, data: {} } };
  }
  if (!rolled.engine) return { exit: headless };
  return { rolled };
}

/**
 * The runner options a count check rolls with: no DC reaches the prompt or the flavor, and the
 * prompt reads the required count, which a progressive check does not have.
 */
function countOptions({ rollOptions, evaluation, thresholdMode, craftingModifier, required }) {
  return {
    ...rollOptions,
    evaluation,
    thresholdMode,
    craftingModifier,
    dc: null,
    required: required ?? null,
  };
}

/** `runFormulaPassFail` for a count check; with no dice engine it passes rather than block. */
export async function runCountPassFail({ dc: required, triggers, actor, label, ...input }) {
  const roll = await rollCountCheck({
    actor,
    label,
    options: countOptions({ ...input, required }),
    headless: { success: true, outcome: 'pass', value: null, data: { dc: null }, message: null },
  });
  return roll.exit ?? gradeCountPassFail(roll.rolled, { required, triggers, label });
}

/**
 * `runFormulaRouted` for a count check; headless it routes nothing rather than block. Fixed ranges
 * grade the net itself, so its prompt names no required count.
 */
export async function runCountRouted({ dc: required, actor, label, type, ...input }) {
  const { relativeOutcomes, fixedOutcomes, triggers, clampToNearest, minOutcomeId } = input;
  const roll = await rollCountCheck({
    actor,
    label,
    kind: 'routed ',
    options: countOptions({ ...input, required: type === 'fixed' ? null : required }),
    headless: {
      success: true,
      outcome: null,
      value: null,
      data: { dc: null, type },
      message: null,
    },
  });
  return (
    roll.exit ??
    gradeCountRouted(roll.rolled, {
      required,
      label,
      type,
      relativeOutcomes,
      fixedOutcomes,
      triggers,
      clampToNearest,
      minOutcomeId,
    })
  );
}

/** `runFormulaProgressive` for a count check; headless it awards nothing rather than block. */
export async function runCountProgressive({ triggers, actor, label, ...input }) {
  const roll = await rollCountCheck({
    actor,
    label,
    kind: 'progressive ',
    options: countOptions(input),
    headless: { success: true, outcome: null, value: 0, data: { total: 0, value: 0 } },
  });
  return roll.exit ?? gradeCountProgressive(roll.rolled, { triggers });
}

function gradePreparedCount(kind, rolled, { config, required, label }) {
  const triggers = config.checkBreakage?.triggers ?? config.triggers ?? [];
  if (kind === 'progressive') return gradeCountProgressive(rolled, { triggers });
  if (kind !== 'routed') return gradeCountPassFail(rolled, { required, triggers, label });
  return gradeCountRouted(rolled, {
    required,
    label,
    type: config.type,
    relativeOutcomes: config.relativeOutcomes,
    fixedOutcomes: config.fixedOutcomes,
    triggers,
    clampToNearest: config.clampToNearest !== false,
    minOutcomeId: config.minOutcomeId ?? null,
  });
}

/**
 * `evaluatePreparedRunCheck`'s answer for a count check it already rolled from its captured
 * policy, with its executed visibility. A secret result keeps its pre-roll evidence, projection
 * and display evidence inside the authority.
 */
export function preparedCountResult(kind, rolled, { secret, failureMessage, ...grading }) {
  if (rolled.refusal) return countRefusalResult(rolled.refusal, grading.label);
  if (!rolled.engine) {
    return {
      success: true,
      outcome: kind === 'simple' ? 'pass' : null,
      value: kind === 'progressive' ? 0 : null,
      data: { dc: null },
      message: null,
      engineEvaluated: true,
      secret,
    };
  }
  const graded = gradePreparedCount(kind, rolled, grading);
  const { preRolls, ...data } = graded.data;
  return {
    success: graded.success,
    outcome: graded.outcome,
    value: graded.value,
    data: { ...data, ...(!secret && preRolls && { preRolls }) },
    message: graded.success ? null : failureMessage,
    engineEvaluated: true,
    secret,
    visibility: { rollMode: secret ? 'gmroll' : (rolled.rollMode ?? null), secret },
    ...(!secret && graded.countDisplay && { countDisplay: graded.countDisplay }),
    ...(rolled.rollHandoff && { rollHandoff: rolled.rollHandoff }),
  };
}
