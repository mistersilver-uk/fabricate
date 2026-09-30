/**
 * The activity-agnostic check roll engine shared by crafting, salvage and gathering (DOMAIN.md
 * "Check"): roll, dice groups, forced outcomes, then pass/fail, a routed tier or a progressive
 * value. `label` only customises the failure messages; the result shape is identical.
 */

import { stripRetiredModifierPlaceholder } from '../utils/craftingCheckExpression.js';

import { chatModeOption } from './bulkChatVisibility.js';
import { compareToTarget, effectiveMargin } from './checkEvaluation.js';
import { evaluateKeptRoll } from './checkKeepTransform.js';
import {
  resolveCheckModifierFormula,
  resolvedLibraryContributions,
} from './checkModifierResolver.js';
import { postBundledCheckRoll, resolveModifierPreRolls } from './checkModifierRolls.js';
import { planModifierPlacement, SUM_OVER_EVALUATION } from './checkModifierRouter.js';
import { defersModifierChoice, resolveCheckDecision } from './checkRollDecision.js';
import {
  checkRollHandoff,
  postCheckRoll,
  preRollEvidence,
  reportedVisibility,
  rolledDiceGroups,
} from './checkRollOutput.js';
import {
  classifyCheckTotal,
  effectiveTarget,
  resolveForcedOutcome,
  sumGrading,
} from './checkRouting.js';
import {
  activeCheckEvaluation,
  checkTargetRefusal,
  isFixedSumOver,
  progressiveTargetRefusal,
  targetFlavorSuffix,
} from './checkTarget.js';
import { preparedCountEvaluation, preparedCountOptions } from './countCheck.js';
import {
  evaluateCountCheckRoll,
  preparedCountResult,
  runCountPassFail,
  runCountProgressive,
  runCountRouted,
} from './countCheckRoll.js';
import { authorizedPreparedDecision } from './preparedDecisionPolicy.js';

export { classifyCheckTotal, resolveForcedOutcome } from './checkRouting.js';
export { rolledDiceGroups } from './checkRollOutput.js';

/**
 * `data.targetTerms` outside sum/over/fixed (issue 2005): the resolved target's terms, else its
 * anchor, then the rolled tier's step, then the settled scalar benefits. Folded in order with
 * `preRolls` they reproduce `data.target`. A term is `{ kind, value, source?, label? }`, `label`
 * naming the tier of an adjustment. `data.targetSource` names the anchor's source; a character
 * value also records its typed formula and the character's name, so results never re-read them.
 */
function targetTermsEvidence({
  grading,
  target,
  anchor,
  baseTerms,
  tierTerm = null,
  rolled,
  evaluation,
  actor,
}) {
  if (target === null || (grading.direction === 'over' && grading.source === 'fixed')) return {};
  const base =
    Array.isArray(baseTerms) && baseTerms.length > 0
      ? baseTerms
      : [{ kind: 'anchor', value: anchor }];
  const benefits = grading.direction === 'under' ? (rolled?.benefitTerms ?? []) : [];
  return {
    targetSource: grading.source,
    ...attributeTargetFacts(grading, evaluation, actor),
    targetTerms: [
      ...base.map(({ kind, value, label }) => ({ kind, value, ...(label && { label }) })),
      ...(tierTerm ? [tierTerm] : []),
      ...benefits.map(({ kind, value, source }) => ({ kind, value, source })),
    ],
  };
}

/** A character-value target's typed formula and the name of the character it was read from. */
function attributeTargetFacts(grading, evaluation, actor) {
  if (grading.source !== 'attribute') return {};
  const expression = String(evaluation?.target?.expression ?? '').trim();
  const name = typeof actor?.name === 'string' ? actor.name.trim() : '';
  return {
    ...(expression && { targetExpression: expression }),
    ...(name && { targetActor: name }),
  };
}

/** The relative tier the roll matched, before forcing or steps, as its target term; its
 * threshold is the executed target, so forced and stepped outcomes keep it. */
function rolledTierTerm(grading, classifyInput) {
  const { matched } = classifyCheckTotal({ ...classifyInput, triggers: [], minOutcomeId: null });
  if (!matched) return null;
  const label = typeof matched.name === 'string' && matched.name ? { label: matched.name } : {};
  if (grading.multiply) return { kind: 'multiplier', value: Number(matched.adjustment), ...label };
  const step = Number(matched.dc);
  return { kind: 'adjustment', value: grading.direction === 'under' ? 0 - step : step, ...label };
}

/** A routed result's trigger evidence: a forced disposition (issue 2080) and a real tier step. */
function routedTriggerEvidence({ forcedDisposition, tierStepApplied }) {
  return {
    ...(forcedDisposition && { forcedOutcome: forcedDisposition }),
    ...(tierStepApplied && { tierStepApplied }),
  };
}

/**
 * The formula this module actually rolls and its modifier placement: the retired-placeholder shim
 * (issue 1094), then the library append for `evaluation`. One derivation, because the roll, the
 * display and the Checks Studio's odds enumerator must agree (issue 1097). `craftingModifier` is
 * `null` where no term appends; `Roll` is a parameter so an injected engine drives both steps.
 * Tool contributions already sit in a sum/over formula and join the placement only.
 */
export function deriveCheckRoll(
  formula,
  actor,
  craftingModifier = null,
  Roll = globalThis.Roll,
  evaluation = SUM_OVER_EVALUATION,
  toolContributions = []
) {
  const rolled = resolveRolledCheck(formula, actor, craftingModifier, Roll, evaluation);
  const placement = planModifierPlacement({
    evaluation,
    contributions: [
      ...(Array.isArray(toolContributions) ? toolContributions : []),
      ...resolvedLibraryContributions(rolled.selected),
    ],
  });
  return { formula: rolled.formula, placement };
}

/** The formula half of {@link deriveCheckRoll}; `''` when the shim emptied the formula. */
export function resolveRolledFormula(
  formula,
  actor,
  craftingModifier = null,
  Roll = globalThis.Roll,
  evaluation = SUM_OVER_EVALUATION
) {
  return resolveRolledCheck(formula, actor, craftingModifier, Roll, evaluation).formula;
}

function resolveRolledCheck(
  formula,
  actor,
  craftingModifier,
  Roll = globalThis.Roll,
  evaluation = SUM_OVER_EVALUATION
) {
  const authored = stripRetiredModifierPlaceholder(String(formula ?? ''), Roll);
  if (authored.trim() === '') return { formula: '', selected: [] };
  return resolveCheckModifierFormula(authored, actor, craftingModifier, Roll, evaluation);
}

/**
 * Evaluate a check formula to `{ engine, total, diceGroups, resolvedFormula }`: `engine: false`
 * without a dice engine, and a bad formula throws for the caller to wrap. Interactive behaviour
 * is opt-in: `interactive` with a `prompt` confirms with the player, and a pre-resolved
 * `rollDecision` (the prompt's shape minus `confirmed`, issue 859) stands in for the dialog so
 * one answer drives N rolls. `modifierChoice` defers the `playerPicks` append until the prompt
 * returns (issues 770, 1055); otherwise `craftingModifier` appends before anything reads the
 * formula. A cancelled prompt returns `cancelled: true` so the runner aborts with zero mutation.
 * Separately evaluated modifiers settle before the main roll and return their ordered placement.
 * `advantage` is the check's normalized advantage rule, the normalizer's default when absent.
 */
export async function evaluateCheckRoll(formula, actor, options = {}) {
  // A count check rolls its structured pool, so its retained formula never reaches `Roll`.
  if (ownEvaluation(options).product === 'count') return evaluateCountCheckRoll(actor, options);
  if (typeof globalThis.Roll !== 'function')
    return { engine: false, total: 0, diceGroups: [], resolvedFormula: null };
  // The retirement shim runs first, unconditionally (issue 1094): a surviving token never
  // reaches `Roll` or double-counts against the appended term.
  const authoredFormula = stripRetiredModifierPlaceholder(String(formula));
  // A formula the shim emptied is not a check. The usability readers already gate on it; this
  // backstop keeps `new Roll('')` (a rolled, consuming failure) unreachable by any other route.
  if (authoredFormula.trim() === '')
    return { engine: false, total: 0, diceGroups: [], resolvedFormula: null };
  const rollData = actor?.getRollData?.() ?? actor?.system ?? {};
  const evaluation = ownEvaluation(options);
  const deferred = defersModifierChoice(options);
  const resolvedCheck = deferred
    ? { formula: authoredFormula, selected: [] }
    : resolveRolledCheck(
        authoredFormula,
        actor,
        options?.craftingModifier,
        globalThis.Roll,
        evaluation
      );
  const decision = await resolveCheckDecision({
    authoredFormula,
    actor,
    options,
    evaluation,
    deferred,
    resolvedCheck,
    displayFormula: resolveCheckFormulaDisplay,
    Roll: globalThis.Roll,
  });
  if (decision.cancelled) {
    return { engine: true, cancelled: true, total: 0, diceGroups: [], resolvedFormula: null };
  }
  const {
    formula: effectiveFormula,
    flavor: effectiveFlavor,
    rollMode: effectiveRollMode,
    resolvedFormula,
    placementPlan,
    benefitTerms,
  } = decision;
  const { placement: modifierPlacement, rolls: preRolls } = await resolveModifierPreRolls(
    placementPlan,
    { Roll: globalThis.Roll, rollData }
  );

  // Construct, keep (issue 2007), then evaluate with no manual-fulfilment dialog mid-craft.
  const { roll, kept } = await evaluateKeptRoll(effectiveFormula, rollData, decision.keep);
  const rolledTotal = Number(roll?.total);
  const total = Number.isFinite(rolledTotal) ? rolledTotal : 0;
  const flavor = settledFlavor(options, effectiveFlavor, evaluation, modifierPlacement);

  await postCheckRoll({ roll, preRolls, options, flavor, rollMode: effectiveRollMode });
  const result = {
    engine: true,
    total,
    diceGroups: rolledDiceGroups(roll),
    resolvedFormula: kept ? roll.formula : resolvedFormula,
    modifierPlacement,
    ...(benefitTerms?.length > 0 && { benefitTerms }),
    ...(options?.reportVisibility === true && { rollMode: effectiveRollMode ?? null }),
  };
  const rollHandoff = checkRollHandoff({
    roll,
    placement: modifierPlacement,
    options,
    flavor,
    rollMode: effectiveRollMode,
  });
  if (rollHandoff) result.rollHandoff = rollHandoff;
  return result;
}

/**
 * The flavor a pass/fail roll posts: outside sum/over/fixed it names the FINAL target, the
 * `flavorTarget` anchor with its settled benefits, as the prompt chip and the result's Target row
 * do (maintainer ruling M1). The suffix sits before any appended modifier label.
 */
function settledFlavor(options, flavor, evaluation, placement) {
  const anchor = options?.flavorTarget;
  if (typeof flavor !== 'string' || !Number.isFinite(anchor)) return flavor;
  if (evaluation?.product !== 'sum' || isFixedSumOver(evaluation)) return flavor;
  const target = effectiveTarget(anchor, sumGrading(evaluation), placement?.targetDelta);
  const base = flavor.startsWith(options.flavor ?? '\0') ? options.flavor : flavor;
  return `${base}${targetFlavorSuffix(target)}${flavor.slice(base.length)}`;
}

/**
 * The first own `evaluation` among `sources`, else sum/over. An own key only: an inherited
 * `evaluation` (prototype pollution) never selects a mode.
 */
function ownEvaluation(...sources) {
  for (const source of sources) {
    const evaluation =
      source != null && Object.hasOwn(source, 'evaluation') ? source.evaluation : null;
    if (evaluation != null) return evaluation;
  }
  return SUM_OVER_EVALUATION;
}

function validatedPreparedDecision(decision, modifierChoice) {
  const source = decision && typeof decision === 'object' ? decision : {};
  const offered = new Set(
    (Array.isArray(modifierChoice?.modifiers) ? modifierChoice.modifiers : [])
      .map((modifier) => modifier?.id)
      .filter((id) => typeof id === 'string')
  );
  const selected = (Array.isArray(source.modifierIds) ? source.modifierIds : []).filter(
    (id) => typeof id === 'string' && offered.has(id)
  );
  const advantage = ['advantage', 'disadvantage'].includes(source.advantage)
    ? source.advantage
    : null;
  const rollMode = ['publicroll', 'gmroll', 'blindroll', 'selfroll'].includes(source.rollMode)
    ? source.rollMode
    : null;
  // Absent ids fall through to the descriptor's defaults; an empty array is an answer.
  return {
    bonus: typeof source.bonus === 'string' ? source.bonus : null,
    advantage,
    rollMode,
    ...(Array.isArray(source.modifierIds) && { chosenModifierIds: selected }),
  };
}

/**
 * Evaluate a GM-retained check plan from player decisions. Client totals, formulas and modifier
 * values are absent from the accepted boundary; eligible modifier ids are revalidated here.
 * Visible rolls are handed back as evaluated Roll data for player-authored chat/DSN posting.
 * Secret rolls post privately in the GM realm and return no formula-bearing handoff.
 */
export async function evaluatePreparedCheck(preparation, actor, decision = {}) {
  const source = preparation && typeof preparation === 'object' ? preparation : {};
  const options = source.options && typeof source.options === 'object' ? source.options : {};
  const secret = source.secret === true;
  const rollDecision = validatedPreparedDecision(decision, options.modifierChoice);
  // Secrecy is authoritative, not a default that the player's roll-mode choice may override.
  if (secret) rollDecision.rollMode = 'gmroll';
  const result = await evaluateCheckRoll(source.formula, actor, {
    ...options,
    interactive: true,
    prompt: null,
    rollDecision,
    post: secret,
    includeRollHandoff: !secret,
  });
  if (!secret) return result;
  // The settled placement stays inside the authority for classification; the requester's reply never carries it.
  return {
    engine: result.engine,
    total: result.total,
    diceGroups: result.diceGroups,
    resolvedFormula: null,
    modifierPlacement: result.modifierPlacement,
    ...(result.refusal && { refusal: result.refusal }),
    ...(result.policy && {
      policy: result.policy,
      zeroPool: result.zeroPool === true,
      countProjection: result.countProjection ?? null,
    }),
    secret: true,
  };
}

function preparedCheckKind(preparation) {
  const slot = String(preparation?.slot ?? '').toLowerCase();
  const mode = String(preparation?.mode ?? '').toLowerCase();
  if (slot.includes('progressive') || mode.includes('progressive')) return 'progressive';
  if (slot.includes('routed') || mode.includes('routedbycheck') || mode.includes('tiered')) {
    return 'routed';
  }
  return 'simple';
}

/** The executed evidence of a summed check: `target` is effective and `margin` benefit-positive. */
function executedSumEvidence(total, target, comparison, direction = 'over') {
  return {
    product: 'sum',
    direction,
    comparison,
    target,
    margin: target === null ? null : effectiveMargin(total, target, direction),
    successes: null,
    cancelled: null,
  };
}

/** `data.dc` names only a fixed target; an attribute result carries its number in `data.target`. */
function fixedDc(dc, grading) {
  return grading.source === 'fixed' ? dc : null;
}

/** A prepared check refuses progressive sum/under, and a blank sum/under formula, before any roll. */
function preparedCheckRefusal(kind, evaluation, formula) {
  if (kind === 'progressive') return progressiveTargetRefusal(evaluation);
  const blank = String(formula ?? '').trim() === '';
  return blank && sumGrading(evaluation).direction === 'under' ? 'formula-empty' : null;
}

/** Grades a prepared total as the matching runner does, against the captured anchor. */
function gradePreparedTotal(
  kind,
  { config, evaluation, anchor, rolled, total, diceGroups, secret, actor }
) {
  const grading = sumGrading(evaluation);
  const targetDelta = rolled.modifierPlacement?.targetDelta;
  const triggers = config.checkBreakage?.triggers ?? config.triggers ?? [];
  const comparison = config.thresholdMode === 'exceed' ? 'exceed' : 'meet';
  const terms = (target, tierTerm) =>
    secret
      ? {}
      : targetTermsEvidence({
          grading,
          target,
          anchor,
          baseTerms: config.targetTerms,
          tierTerm,
          rolled,
          evaluation,
          actor,
        });
  if (kind === 'routed') {
    const classifyInput = {
      type: config.type,
      total,
      dc: anchor,
      comparison,
      relativeOutcomes: config.relativeOutcomes,
      fixedOutcomes: config.fixedOutcomes,
      triggers,
      diceGroups,
      clampToNearest: config.clampToNearest !== false,
      minOutcomeId: config.minOutcomeId ?? null,
      evaluation,
      targetDelta,
    };
    const classified = classifyCheckTotal(classifyInput);
    const tierTerm = classified.target === null ? null : rolledTierTerm(grading, classifyInput);
    return {
      success: classified.success,
      outcome: classified.matched?.name ?? null,
      value: total,
      data: {
        type: config.type,
        ...executedSumEvidence(total, classified.target, classified.comparison, grading.direction),
        ...terms(classified.target, tierTerm),
        outcomeId: classified.matched?.id ?? null,
        success: classified.success,
        breakTools: classified.breakTools,
        ...routedTriggerEvidence(classified),
        ...(classified.minTierFailed && {
          minTierFailed: true,
          blockedOutcomeId: classified.blockedOutcomeId,
        }),
      },
    };
  }
  const forced = resolveForcedOutcome(triggers, { total, diceGroups });
  if (kind === 'progressive') {
    let value = total;
    if (forced?.disposition === 'success') value = Number.MAX_SAFE_INTEGER;
    if (forced?.disposition === 'failure') value = 0;
    return {
      success: true,
      outcome: null,
      value,
      data: {
        ...executedSumEvidence(total, null, null),
        value,
        ...(forced && { forcedOutcome: forced.disposition }),
      },
    };
  }
  const target = effectiveTarget(Number(anchor), grading, targetDelta);
  const success = forced
    ? forced.disposition === 'success'
    : compareToTarget(total, target, comparison, grading.direction);
  return {
    success,
    outcome: success ? 'pass' : 'fail',
    value: total,
    data: {
      ...executedSumEvidence(total, target, comparison, grading.direction),
      ...terms(target, null),
      ...(forced && { forcedOutcome: forced.disposition }),
    },
  };
}

/**
 * Evaluate and classify the private CraftingEngine check descriptor without accepting a client
 * formula or total. This is the authority-side twin of the three existing formula runners; it
 * places by the prepared evaluation and grades against the captured `decisionPolicy.target`.
 */
export async function evaluatePreparedRunCheck(
  preparation,
  actor,
  decision = {},
  { secret = false, failureMessage = 'Check failed', label = 'Crafting' } = {}
) {
  const checkConfig =
    preparation?.checkConfig && typeof preparation.checkConfig === 'object'
      ? preparation.checkConfig
      : {};
  const decisionPolicy =
    preparation?.decisionPolicy && typeof preparation.decisionPolicy === 'object'
      ? preparation.decisionPolicy
      : {};
  const config = { ...checkConfig, ...decisionPolicy };
  const kind = preparedCheckKind(preparation);
  const evaluation = activeCheckEvaluation(checkConfig);
  const refusal = preparedCheckRefusal(kind, evaluation, preparation?.rollFormula);
  if (refusal) return checkTargetRefusal(refusal, label);
  // A count check replays its captured policy and never re-reads the live actor's pool.
  const count =
    evaluation.product === 'count' ? preparedCountEvaluation(decisionPolicy.count) : null;
  if (evaluation.product === 'count' && !count) {
    return checkTargetRefusal('invalid', label, { refusedInput: 'pool' });
  }
  const anchor = decisionPolicy.target ?? config.resolvedDc ?? config.dc;
  const authoritativeDecision = authorizedPreparedDecision(decision);
  const rolled = await evaluatePreparedCheck(
    {
      formula: preparation?.rollFormula,
      secret,
      options: {
        flavor:
          preparation?.flavor ??
          preparation?.publicPrompt?.label ??
          config.label ??
          'Crafting check',
        rollMode: secret ? 'gmroll' : (authoritativeDecision.rollMode ?? 'selfroll'),
        craftingModifier: config.craftingModifier ?? null,
        modifierChoice: config.modifierChoice ?? null,
        toolContributions: config.toolContributions ?? [],
        evaluation,
        speaker: preparation?.speaker ?? config.speaker ?? null,
        ...preparedCountOptions(count, { secret, kind, type: config.type }),
        // A pass/fail roll names its final target; a secret one never carries it.
        ...(kind === 'simple' && !secret && { flavorTarget: anchor }),
        reportVisibility: true,
      },
    },
    actor,
    authoritativeDecision
  );
  if (rolled.cancelled) {
    return { success: false, cancelled: true, outcome: null, value: null, data: {} };
  }
  if (count) {
    const grading = { config, required: count.required, secret, failureMessage, label };
    return preparedCountResult(kind, rolled, grading);
  }
  if (!rolled.engine) {
    return {
      success: true,
      outcome: kind === 'simple' ? 'pass' : null,
      value: kind === 'progressive' ? 0 : null,
      data: { dc: config.resolvedDc ?? config.dc },
      message: null,
      engineEvaluated: true,
      secret,
    };
  }
  const total = Number(rolled.total) || 0;
  const diceGroups = Array.isArray(rolled.diceGroups) ? rolled.diceGroups : [];
  const graded = gradePreparedTotal(kind, {
    config,
    evaluation,
    anchor,
    rolled,
    total,
    diceGroups,
    secret,
    actor,
  });
  return {
    success: graded.success,
    outcome: graded.outcome,
    value: graded.value,
    data: {
      dc: config.resolvedDc ?? config.dc,
      total,
      // The formulas the dice line states, typed and resolved; a secret roll hands back neither.
      ...(rolled.resolvedFormula && {
        rollFormula: stripRetiredModifierPlaceholder(String(preparation.rollFormula ?? '')).trim(),
        resolvedFormula: rolled.resolvedFormula,
      }),
      diceGroups,
      ...(!secret && preRollEvidence(rolled)),
      ...graded.data,
    },
    message: graded.success ? null : failureMessage,
    engineEvaluated: true,
    secret,
    visibility: { rollMode: secret ? 'gmroll' : (rolled.rollMode ?? null), secret },
    ...(rolled.rollHandoff && { rollHandoff: rolled.rollHandoff }),
  };
}

/** Crafting-labelled compatibility wrapper over the shared authoritative run-check evaluator. */
export function evaluatePreparedCraftingCheck(preparation, actor, decision = {}, options = {}) {
  return evaluatePreparedRunCheck(preparation, actor, decision, {
    failureMessage: 'Crafting check failed',
    ...options,
  });
}

/** Reconstruct and post an entitled GM-evaluated roll, including serialized pre-rolls without rerolling. */
export async function postCheckRollHandoff(handoff, { Roll = globalThis.Roll } = {}) {
  if (!handoff?.serializedRoll || typeof Roll?.fromData !== 'function') {
    return { success: false, reason: 'invalid-roll-handoff' };
  }
  try {
    const roll = Roll.fromData(handoff.serializedRoll);
    if (!roll) {
      return { success: false, reason: 'invalid-roll-handoff' };
    }
    const serializedPreRolls = handoff.serializedPreRolls;
    if (Array.isArray(serializedPreRolls) && serializedPreRolls.length > 0) {
      const preRolls = serializedPreRolls.map((data) => Roll.fromData(data));
      if (preRolls.some((entry) => !entry)) {
        return { success: false, reason: 'invalid-roll-handoff' };
      }
      await postBundledCheckRoll({
        mainRoll: roll,
        preRolls,
        speaker: handoff.speaker ?? undefined,
        flavor: handoff.flavor ?? undefined,
        rollMode: handoff.rollMode,
      });
    } else {
      if (typeof roll.toMessage !== 'function') {
        return { success: false, reason: 'invalid-roll-handoff' };
      }
      await roll.toMessage(
        { speaker: handoff.speaker ?? undefined, flavor: handoff.flavor ?? undefined },
        { ...chatModeOption(handoff.rollMode), create: true }
      );
    }
    return { success: true };
  } catch (error) {
    console.error('Fabricate | Failed to post authoritative check roll to chat:', error);
    return { success: false, reason: 'chat-post-failed' };
  }
}

/**
 * Roll a side expression (not a check) verbatim, with no shim, modifier append or advantage, and
 * post it under an explicit visibility token, never the client-scoped `core.rollMode` or
 * `core.messageMode` fallback, which follows the writing client's own selector. `post: false`
 * only evaluates. `engine: false` without a dice engine or with an empty formula; a bad formula
 * throws for the caller to wrap.
 */
export async function evaluateSideRoll(formula, actor, options = {}) {
  const expression = String(formula ?? '').trim();
  if (typeof globalThis.Roll !== 'function' || expression === '')
    return { engine: false, total: 0, formula: null, posted: false, roll: null };
  const rollData = actor?.getRollData?.() ?? actor?.system ?? {};
  // `allowInteractive: false`, as on the check path.
  const roll = await new globalThis.Roll(expression, rollData).evaluate({
    allowInteractive: false,
  });
  const rolledTotal = Number(roll?.total);
  const total = Number.isFinite(rolledTotal) ? rolledTotal : 0;
  let posted = false;
  if (options?.post !== false && typeof roll?.toMessage === 'function') {
    const messageData = { flavor: options?.flavor };
    if (options?.speaker) messageData.speaker = options.speaker;
    try {
      await roll.toMessage(messageData, {
        ...chatModeOption(options?.rollMode || 'publicroll'),
        create: true,
      });
      posted = true;
    } catch (error) {
      // Logged, never thrown: a chat failure must not cost the caller its committed outcome.
      console.error('Fabricate | Failed to post side roll to chat:', error);
    }
  }
  return { engine: true, total, formula: expression, posted, roll };
}

/**
 * Resolve a check formula's `@` placeholders for display without rolling (`1d20 + @prof` to
 * `1d20 + 2`), through the same shim and modifier append the roll uses, so display equals eval.
 * `null` with no formula or no engine; `resolved` is false when the formula does not reduce for
 * this actor, detected through `missing: 'NaN'`; `modifiers` are the library entries it applied.
 * `Roll` is a parameter so the Checks Studio's odds enumerator drives one injected engine.
 */
export function resolveCheckFormulaDisplay(
  formula,
  actor,
  craftingModifier = null,
  Roll = globalThis.Roll,
  evaluation = SUM_OVER_EVALUATION
) {
  if (typeof formula !== 'string' || formula.trim() === '') return null;
  if (typeof Roll?.replaceFormulaData !== 'function') return null;
  const rolled = resolveRolledCheck(formula, actor, craftingModifier, Roll, evaluation);
  const substituted = rolled.formula;
  if (substituted.trim() === '') return null;
  const rollData = actor?.getRollData?.() ?? actor?.system ?? {};
  const display = Roll.replaceFormulaData(substituted, rollData, {
    missing: 'NaN',
    warn: false,
  });
  const resolved =
    !/NaN/.test(display) &&
    !/@/.test(display) &&
    (typeof Roll.validate !== 'function' || Roll.validate(display) === true);
  return { display, resolved, modifiers: rolled.selected };
}

/**
 * A free-text situational bonus as a number, for the d100 gathering path, which needs a scalar:
 * a plain number is used as-is with no engine, anything else is rolled, and a malformed entry is
 * `0`, never `NaN` or a throw.
 */
export async function evaluateSituationalBonus(bonus, actor = null) {
  const text = typeof bonus === 'string' ? bonus.trim() : bonus;
  if ([null, undefined, ''].includes(text)) return 0;
  const direct = Number(text);
  if (Number.isFinite(direct)) return direct;
  const RollClass = globalThis.Roll;
  if (typeof RollClass !== 'function') return 0;
  const formula = String(text);
  // Called as a METHOD, not detached — see the note in `evaluateCheckRoll`.
  if (typeof RollClass.validate === 'function' && RollClass.validate(formula) === false) {
    console.warn('Fabricate | Ignoring invalid situational bonus', bonus);
    return 0;
  }
  try {
    const rollData = actor?.getRollData?.() ?? actor?.system ?? {};
    // `allowInteractive: false`, as on the check path.
    const rolled = await new RollClass(formula, rollData).evaluate({
      allowInteractive: false,
    });
    const total = Number(rolled?.total);
    return Number.isFinite(total) ? total : 0;
  } catch (error) {
    console.warn('Fabricate | Ignoring invalid situational bonus', bonus, error);
    return 0;
  }
}

/**
 * Rolls a runner's formula, or answers `{ exit }`: the runner's result for a thrown roll, a
 * cancelled prompt (zero mutation) or a missing dice engine. A blank formula rolls nothing.
 */
async function rollRunnerFormula({ formula, actor, options, label, kind = '', data, headless }) {
  if (!formula) return { total: 0, diceGroups: [], resolvedFormula: null };
  let rolled;
  try {
    rolled = await evaluateCheckRoll(formula, actor, options);
  } catch (error) {
    console.error(`Fabricate | ${label} ${kind}check roll failed (${formula})`, error);
    return {
      exit: {
        success: false,
        outcome: kind ? null : 'fail',
        value: null,
        data,
        message: `${label} check roll failed: ${error.message}`,
      },
    };
  }
  if (rolled.cancelled) {
    return { exit: { success: false, cancelled: true, outcome: null, value: null, data } };
  }
  if (!rolled.engine) return { exit: headless };
  const { total, diceGroups, resolvedFormula } = rolled;
  return { rolled, total, diceGroups, resolvedFormula };
}

/**
 * A pass/fail check: the total against `dc` (the resolved anchor), met or (`thresholdMode:
 * 'exceed'`) strictly exceeded in the evaluation's direction, honouring forced outcomes. Under,
 * the settled `targetDelta` raises the target once. A dismissed prompt returns `cancelled: true`;
 * with no dice engine it passes rather than block.
 */
export async function runFormulaPassFail({
  formula: rawFormula,
  dc,
  thresholdMode,
  triggers,
  actor,
  label = 'Crafting',
  rollOptions = null,
  craftingModifier = null,
  targetTerms = null,
  ...input
}) {
  const evaluation = ownEvaluation(input, rollOptions);
  if (evaluation.product === 'count') {
    const count = { rollOptions, evaluation, thresholdMode, craftingModifier };
    return runCountPassFail({ ...count, dc, triggers, actor, label });
  }
  const grading = sumGrading(evaluation);
  const formula = String(rawFormula || '').trim();
  if (!formula && grading.direction === 'under') return checkTargetRefusal('formula-empty', label);
  const data = { dc: fixedDc(dc, grading), formula };
  const roll = await rollRunnerFormula({
    formula,
    actor,
    label,
    data,
    options: {
      ...rollOptions,
      evaluation,
      dc,
      thresholdMode,
      craftingModifier,
      flavorTarget: dc,
    },
    headless: { success: true, outcome: 'pass', value: null, data, message: null },
  });
  if (roll.exit) return roll.exit;
  const { total, diceGroups, resolvedFormula, rolled } = roll;

  const forced = resolveForcedOutcome(triggers, { total, diceGroups });
  const comparison = thresholdMode === 'exceed' ? 'exceed' : 'meet';
  const target = effectiveTarget(dc, grading, rolled?.modifierPlacement?.targetDelta);
  const success = forced
    ? forced.disposition === 'success'
    : compareToTarget(total, target, comparison, grading.direction);
  return {
    success,
    outcome: success ? 'pass' : 'fail',
    value: total,
    data: {
      dc: data.dc,
      // Typed, after the retired-placeholder shim, so its operands align with the resolved one.
      formula: stripRetiredModifierPlaceholder(formula),
      resolvedFormula,
      total,
      comparison,
      ...(formula && executedSumEvidence(total, target, comparison, grading.direction)),
      ...(formula &&
        targetTermsEvidence({
          grading,
          target,
          anchor: dc,
          baseTerms: targetTerms,
          rolled,
          evaluation,
          actor,
        })),
      diceGroups,
      ...preRollEvidence(rolled),
      ...(forced && { forcedOutcome: forced.disposition }),
    },
    message: success ? null : `${label} check failed`,
    ...reportedVisibility(rolled),
  };
}

/**
 * A progressive check: the total becomes the `value` progressive awarding spends, and the
 * activity always proceeds unless the roll itself throws or the prompt is cancelled. A forced
 * success awards everything (`MAX_SAFE_INTEGER`), a forced failure nothing.
 */
export async function runFormulaProgressive({
  formula: rawFormula,
  triggers,
  actor,
  label = 'Crafting',
  rollOptions = null,
  craftingModifier = null,
  ...input
}) {
  const evaluation = ownEvaluation(input, rollOptions);
  if (evaluation.product === 'count') {
    return runCountProgressive({
      rollOptions,
      evaluation,
      craftingModifier,
      triggers,
      actor,
      label,
    });
  }
  const refusal = progressiveTargetRefusal(evaluation);
  if (refusal) return checkTargetRefusal(refusal, label);
  const formula = String(rawFormula || '').trim();
  const roll = await rollRunnerFormula({
    formula,
    actor,
    label,
    kind: 'progressive ',
    data: { formula },
    options: { ...rollOptions, evaluation, craftingModifier },
    // No dice engine: award nothing (a finite value) rather than block.
    headless: { success: true, outcome: null, value: 0, data: { formula, total: 0, value: 0 } },
  });
  if (roll.exit) return roll.exit;
  const { total, diceGroups, resolvedFormula, rolled } = roll;

  // Forcing sees the raw total as the value, which `progressiveValue` conditions target.
  const forced = resolveForcedOutcome(triggers, { total, value: total, diceGroups });
  let value;
  if (forced) {
    value = forced.disposition === 'success' ? Number.MAX_SAFE_INTEGER : 0;
  } else {
    value = total;
  }
  return {
    success: true,
    outcome: null,
    // `value` awards (forcing may overwrite it) while `data.total` keeps the raw total, so a
    // `progressiveValue` and a `rollTotal` trigger can resolve differently on one roll.
    value,
    data: {
      formula,
      resolvedFormula,
      total,
      value,
      diceGroups,
      ...(formula && executedSumEvidence(total, null, null)),
      ...preRollEvidence(rolled),
      ...(forced && { forcedOutcome: forced.disposition }),
    },
    ...reportedVisibility(rolled),
  };
}

/**
 * A routed check: roll, then `classifyCheckTotal`, returning the final tier's name as `outcome`
 * for result-group routing. Headless it returns a non-blocking `success: true, outcome: null`
 * rather than fabricate a route, and a cancelled prompt returns `cancelled: true`. Every routed
 * caller passes `clampToNearest: true` today. `minOutcomeId` (fixed type, crafting only) fails a
 * final tier below it, or a total outside every range, and drops its `breakTools`; a forced
 * outcome bypasses it.
 */
export async function runFormulaRouted({
  formula: rawFormula,
  dc,
  thresholdMode,
  type,
  relativeOutcomes,
  fixedOutcomes,
  triggers,
  actor,
  label = 'Crafting',
  rollOptions = null,
  clampToNearest = false,
  minOutcomeId = null,
  craftingModifier = null,
  targetTerms = null,
  ...input
}) {
  const evaluation = ownEvaluation(input, rollOptions);
  if (evaluation.product === 'count') {
    return runCountRouted({
      rollOptions,
      evaluation,
      thresholdMode,
      craftingModifier,
      dc,
      actor,
      label,
      type,
      relativeOutcomes,
      fixedOutcomes,
      triggers,
      clampToNearest,
      minOutcomeId,
    });
  }
  const grading = sumGrading(evaluation);
  const formula = String(rawFormula || '').trim();
  if (!formula && grading.direction === 'under') return checkTargetRefusal('formula-empty', label);
  const data = { dc: fixedDc(dc, grading), formula, type };
  const roll = await rollRunnerFormula({
    formula,
    actor,
    label,
    kind: 'routed ',
    data,
    // No `dc`: callers already put the prompt-facing DC on `rollOptions` (none for fixed).
    options: { ...rollOptions, evaluation, thresholdMode, craftingModifier },
    headless: { success: true, outcome: null, value: null, data, message: null },
  });
  if (roll.exit) return roll.exit;
  const { total, diceGroups, resolvedFormula, rolled } = roll;

  // The whole post-roll resolution, shared with the odds histogram (issue 1097).
  const classifyInput = {
    type,
    total,
    dc,
    comparison: thresholdMode,
    relativeOutcomes,
    fixedOutcomes,
    triggers,
    diceGroups,
    clampToNearest,
    minOutcomeId,
    evaluation,
    targetDelta: rolled?.modifierPlacement?.targetDelta,
  };
  const classified = classifyCheckTotal(classifyInput);
  const { matched, success, comparison } = classified;
  const tierTerm = classified.target === null ? null : rolledTierTerm(grading, classifyInput);

  return {
    success,
    outcome: matched ? matched.name : null,
    value: total,
    data: {
      dc: data.dc,
      formula: stripRetiredModifierPlaceholder(formula),
      resolvedFormula,
      total,
      type,
      comparison,
      ...(formula && executedSumEvidence(total, classified.target, comparison, grading.direction)),
      ...(formula &&
        targetTermsEvidence({
          grading,
          target: classified.target,
          anchor: dc,
          baseTerms: targetTerms,
          tierTerm,
          rolled,
          evaluation,
          actor,
        })),
      ...preRollEvidence(rolled),
      outcomeId: matched?.id ?? null,
      success,
      breakTools: classified.breakTools,
      diceGroups,
      // Only on a real tier change (issue 975), and on a min-tier failure the tier it blocked.
      ...routedTriggerEvidence(classified),
      ...(classified.minTierFailed && {
        minTierFailed: true,
        blockedOutcomeId: classified.blockedOutcomeId,
      }),
    },
    message: success ? null : `${label} check failed`,
    ...reportedVisibility(rolled),
  };
}
