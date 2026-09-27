/**
 * The activity-agnostic check roll engine shared by crafting, salvage and gathering (DOMAIN.md
 * "Check"): roll, dice groups, forced outcomes, then pass/fail, a routed tier or a progressive
 * value. `label` only customises the failure messages; the result shape is identical.
 */

import { stripRetiredModifierPlaceholder } from '../utils/craftingCheckExpression.js';
import { cloneJson } from '../utils/scalars.js';

import { chatModeOption } from './bulkChatVisibility.js';
import { compareToTarget, effectiveMargin } from './checkEvaluation.js';
import {
  resolveCheckModifierFormula,
  resolvedLibraryContributions,
} from './checkModifierResolver.js';
import { postBundledCheckRoll, resolveModifierPreRolls } from './checkModifierRolls.js';
import { planModifierPlacement, SUM_OVER_EVALUATION } from './checkModifierRouter.js';
import { resolveCheckDecision } from './checkRollDecision.js';
import {
  classifyCheckTotal,
  effectiveTarget,
  resolveForcedOutcome,
  sumGrading,
} from './checkRouting.js';
import {
  activeCheckEvaluation,
  checkTargetRefusal,
  progressiveTargetRefusal,
} from './checkTarget.js';

export { classifyCheckTotal, resolveForcedOutcome } from './checkRouting.js';

function preRollEvidence(rolled) {
  const entries = rolled?.modifierPlacement?.preRolls;
  if (!Array.isArray(entries) || entries.length === 0) return {};
  return {
    preRolls: entries.map(({ source, label, expression, total, destination }) => ({
      source,
      label,
      expression,
      total,
      destination,
    })),
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
 * The evaluated roll's dice as `{ groupId, group: "NdS", sum, results }`. `groupId` is the index
 * in `roll.dice` order, which `diceGroup` triggers target. Rolling check modifiers append their
 * dice after the authored ones (issue 1118), so authored indices never move; a trigger whose
 * index already dangled may now match a modifier's die, deliberately unguarded because a
 * re-parsed group count disagrees with `roll.dice` on some formulas. `sum` is the post-modifier
 * `DiceTerm#total` (else the active faces' sum) and `results` are the active-only raw faces
 * (`.agents/docs/foundry-and-architecture.md`, `DiceTerm#total`).
 */
export function rolledDiceGroups(roll) {
  const dice = Array.isArray(roll?.dice) ? roll.dice : [];
  return dice.map((die, groupId) => {
    const count = Number(die?.number);
    const faces = Number(die?.faces);
    const dieTotal = Number(die?.total);
    // `active !== false`: Foundry omits `active` on a kept result (issue 419).
    const rawResults = Array.isArray(die?.results) ? die.results : [];
    const results = rawResults
      .filter((entry) => entry?.active !== false)
      .map((entry) => Number(entry?.result))
      .filter((face) => Number.isFinite(face));
    // Post-modifier total, else the active faces' sum for an unevaluated die (issue 443).
    const sum = Number.isFinite(dieTotal) ? dieTotal : results.reduce((acc, face) => acc + face, 0);
    return {
      groupId,
      group: `${Number.isFinite(count) ? count : 0}d${Number.isFinite(faces) ? faces : 0}`,
      sum,
      results,
    };
  });
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
 */
export async function evaluateCheckRoll(formula, actor, options = {}) {
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
  const modifierChoice = options?.modifierChoice;
  const deferred =
    Boolean(modifierChoice) &&
    options?.interactive === true &&
    (typeof options.prompt === 'function' || Boolean(options?.rollDecision));
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
  } = decision;
  const { placement: modifierPlacement, rolls: preRolls } = await resolveModifierPreRolls(
    placementPlan,
    { Roll: globalThis.Roll, rollData }
  );

  // `allowInteractive: false`: no manual-fulfilment dialog mid-craft, as in V13 `Roll.simulate`.
  const roll = await new globalThis.Roll(effectiveFormula, rollData).evaluate({
    allowInteractive: false,
  });
  const rolledTotal = Number(roll?.total);
  const total = Number.isFinite(rolledTotal) ? rolledTotal : 0;

  // Interactive rolls post to chat, which is what Dice So Nice animates; a failure is swallowed.
  if (
    options?.interactive &&
    options?.post !== false &&
    typeof globalThis.ChatMessage?.create === 'function'
  ) {
    try {
      if (preRolls.length > 0) {
        await postBundledCheckRoll({
          mainRoll: roll,
          preRolls,
          speaker: options.speaker,
          flavor: effectiveFlavor,
          rollMode: effectiveRollMode,
        });
      } else {
        await roll.toMessage(
          { speaker: options.speaker, flavor: effectiveFlavor },
          { ...chatModeOption(effectiveRollMode), create: true }
        );
      }
    } catch (error) {
      console.error('Fabricate | Failed to post check roll to chat:', error);
    }
  }

  const result = {
    engine: true,
    total,
    diceGroups: rolledDiceGroups(roll),
    resolvedFormula,
    modifierPlacement,
  };
  const serializedPreRolls = modifierPlacement.preRolls.map((entry) => entry.serializedRoll);
  if (
    options?.includeRollHandoff === true &&
    typeof roll?.toJSON === 'function' &&
    serializedPreRolls.every(Boolean)
  ) {
    result.rollHandoff = {
      serializedRoll: cloneJson(roll),
      ...(serializedPreRolls.length > 0 && { serializedPreRolls }),
      flavor: effectiveFlavor ?? null,
      speaker: options?.speaker ?? null,
      rollMode: effectiveRollMode ?? null,
    };
  }
  return result;
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
  // The settled placement stays inside the authority for classification; callers never return it.
  return {
    engine: result.engine,
    total: result.total,
    diceGroups: result.diceGroups,
    resolvedFormula: null,
    modifierPlacement: result.modifierPlacement,
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
function gradePreparedTotal(kind, { config, evaluation, anchor, targetDelta, total, diceGroups }) {
  const grading = sumGrading(evaluation);
  const triggers = config.checkBreakage?.triggers ?? config.triggers ?? [];
  const comparison = config.thresholdMode === 'exceed' ? 'exceed' : 'meet';
  if (kind === 'routed') {
    const classified = classifyCheckTotal({
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
    });
    return {
      success: classified.success,
      outcome: classified.matched?.name ?? null,
      value: total,
      data: {
        type: config.type,
        ...executedSumEvidence(total, classified.target, classified.comparison, grading.direction),
        outcomeId: classified.matched?.id ?? null,
        success: classified.success,
        breakTools: classified.breakTools,
        ...(classified.tierStepApplied && { tierStepApplied: classified.tierStepApplied }),
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
      data: { ...executedSumEvidence(total, null, null), value },
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
    data: executedSumEvidence(total, target, comparison, grading.direction),
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
  const authoritativeDecision = {
    ...decision,
    bonus: decision?.allowsSituationalModifier === true ? decision.bonus : null,
    advantage: decision?.allowAdvantage === true ? decision.advantage : null,
  };
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
      },
    },
    actor,
    authoritativeDecision
  );
  if (rolled.cancelled) {
    return { success: false, cancelled: true, outcome: null, value: null, data: {} };
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
    anchor: decisionPolicy.target ?? config.resolvedDc ?? config.dc,
    targetDelta: rolled.modifierPlacement?.targetDelta,
    total,
    diceGroups,
  });
  return {
    success: graded.success,
    outcome: graded.outcome,
    value: graded.value,
    data: {
      dc: config.resolvedDc ?? config.dc,
      total,
      diceGroups,
      ...(!secret && preRollEvidence(rolled)),
      ...graded.data,
    },
    message: graded.success ? null : failureMessage,
    engineEvaluated: true,
    secret,
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
 * this actor, detected through `missing: 'NaN'`. `Roll` is a parameter so the Checks Studio's
 * odds enumerator drives one injected engine (issue 1097).
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
  const substituted = resolveRolledFormula(formula, actor, craftingModifier, Roll, evaluation);
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
  return { display, resolved };
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
  ...input
}) {
  const evaluation = ownEvaluation(input, rollOptions);
  const grading = sumGrading(evaluation);
  const formula = String(rawFormula || '').trim();
  if (!formula && grading.direction === 'under') return checkTargetRefusal('formula-empty', label);
  const data = { dc: fixedDc(dc, grading), formula };
  const roll = await rollRunnerFormula({
    formula,
    actor,
    label,
    data,
    options: { ...rollOptions, evaluation, dc, thresholdMode, craftingModifier },
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
      formula,
      resolvedFormula,
      total,
      comparison,
      ...(formula && executedSumEvidence(total, target, comparison, grading.direction)),
      diceGroups,
      ...preRollEvidence(rolled),
    },
    message: success ? null : `${label} check failed`,
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
    },
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
  ...input
}) {
  const evaluation = ownEvaluation(input, rollOptions);
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
    // No `dc` here: `evaluateCheckRoll` uses it for the prompt only, and callers already put
    // the prompt-facing DC on `rollOptions` (none for a fixed check).
    options: { ...rollOptions, evaluation, thresholdMode, craftingModifier },
    headless: { success: true, outcome: null, value: null, data, message: null },
  });
  if (roll.exit) return roll.exit;
  const { total, diceGroups, resolvedFormula, rolled } = roll;

  // The whole post-roll resolution, shared with the odds histogram (issue 1097).
  const classified = classifyCheckTotal({
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
  });
  const { matched, success, comparison } = classified;

  return {
    success,
    outcome: matched ? matched.name : null,
    value: total,
    data: {
      dc: data.dc,
      formula,
      resolvedFormula,
      total,
      type,
      comparison,
      ...(formula && executedSumEvidence(total, classified.target, comparison, grading.direction)),
      ...preRollEvidence(rolled),
      outcomeId: matched?.id ?? null,
      success,
      breakTools: classified.breakTools,
      diceGroups,
      // Only on a real tier change (issue 975).
      ...(classified.tierStepApplied && { tierStepApplied: classified.tierStepApplied }),
      // Only on a min-tier failure: the post-step tier the gate blocked.
      ...(classified.minTierFailed && {
        minTierFailed: true,
        blockedOutcomeId: classified.blockedOutcomeId,
      }),
    },
    message: success ? null : `${label} check failed`,
  };
}
