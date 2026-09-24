/**
 * The activity-agnostic check roll engine shared by crafting, salvage and gathering (DOMAIN.md
 * "Check"): roll, dice groups, forced outcomes, then pass/fail, a routed tier or a progressive
 * value. `label` only customises the failure messages; the result shape is identical.
 */

import { evaluateCheckBreakageCondition } from '../toolBreakageRuntime.js';
import {
  applyD20Advantage,
  hasPlainD20,
  stripRetiredModifierPlaceholder,
} from '../utils/craftingCheckExpression.js';

import { chatModeOption } from './bulkChatVisibility.js';
import { appendResolvedCheckModifier } from './checkModifierResolver.js';
import {
  appendCheckModifierRollTerms,
  appendCheckModifierTerm,
  CHECK_MODIFIER_TERM_LABEL,
} from './toolCheckBonus.js';

/** The deferred `playerPicks` slot the prompt shows as a trailing term, where the resolved term
 *  lands; `cleanHTML` strips inline handlers, so no live preview is possible. */
const DEFERRED_MODIFIER_SLOT = `(modifier)[${CHECK_MODIFIER_TERM_LABEL}]`;

/**
 * The formula this module actually rolls: the retired-placeholder shim (issue 1094), then the
 * check-modifier append. One derivation, because the roll, the display and the Checks Studio's
 * odds enumerator must agree (issue 1097). `craftingModifier` is `null` where no term appends,
 * including the deferred `playerPicks` path; `Roll` is a parameter so an injected engine drives
 * both steps. Returns `''` when the shim emptied the formula.
 */
export function resolveRolledFormula(
  formula,
  actor,
  craftingModifier = null,
  Roll = globalThis.Roll
) {
  const authored = stripRetiredModifierPlaceholder(String(formula ?? ''), Roll);
  if (authored.trim() === '') return '';
  return appendResolvedCheckModifier(authored, actor, craftingModifier, Roll);
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
 * The forced outcome from the unified trigger list (issue 419): a matching `success`/`failure`
 * trigger forces that disposition, and a forced failure beats a forced success. `outcomeTier`
 * conditions are skipped here, because the tier is resolved after this, but stay live for tier
 * steps and tool breakage. Answers `{ disposition }` or `null`.
 */
export function resolveForcedOutcome(triggers, { total, value, diceGroups } = {}) {
  const list = Array.isArray(triggers) ? triggers : [];
  const checkResult = {
    value,
    data: { total, diceGroups: Array.isArray(diceGroups) ? diceGroups : [] },
  };
  let forcedSuccess = null;
  for (const trigger of list) {
    if (!trigger || typeof trigger !== 'object') continue;
    const outcome = trigger.outcome;
    if (outcome !== 'success' && outcome !== 'failure') continue;
    if (trigger.condition?.type === 'outcomeTier') continue;
    if (!evaluateCheckBreakageCondition(trigger.condition, checkResult)) continue;
    if (outcome === 'failure') return { disposition: 'failure' }; // forced failure wins
    forcedSuccess = { disposition: 'success' };
  }
  return forcedSuccess;
}

/**
 * The ids a returned prompt choice asks to spend, in precedence: `chosenModifierIds` (an empty
 * array is an answer, appending nothing), then the historical `chosenModifierId`, then the
 * descriptor's own pre-selection when the prompt confirmed without one.
 */
function requestedModifierIds(modifierChoice, choice) {
  if (Array.isArray(choice?.chosenModifierIds)) return choice.chosenModifierIds;
  const single = choice?.chosenModifierId;
  if (single !== undefined && single !== null) return [single];
  const defaults = modifierChoice?.defaultSelectedIds;
  if (Array.isArray(defaults)) return defaults;
  const fallback = modifierChoice?.defaultSelectedId;
  return fallback === undefined || fallback === null ? [] : [fallback];
}

/**
 * Reduce a returned selection to what counts, never trusting the prompt: unoffered ids are
 * discarded, survivors are taken in eligible order and truncated to `maxPicks` (absent or invalid
 * means 1), flat values sum, and rolling fragments are taken verbatim from the descriptor.
 */
function resolveModifierSelection(modifierChoice, choice) {
  const offered = Array.isArray(modifierChoice?.modifiers) ? modifierChoice.modifiers : [];
  const requested = new Set(requestedModifierIds(modifierChoice, choice));
  const rawCap = Number(modifierChoice?.maxPicks);
  const maxPicks = Number.isInteger(rawCap) && rawCap > 0 ? rawCap : 1;
  const picked = offered
    .filter((modifier) => typeof modifier?.id === 'string' && requested.has(modifier.id))
    .slice(0, maxPicks);
  const value = picked.reduce((sum, modifier) => {
    const num = Number(modifier?.value);
    return sum + (Number.isFinite(num) ? num : 0);
  }, 0);
  const formulas = picked
    .map((modifier) => modifier?.formula)
    .filter((formula) => typeof formula === 'string' && formula.trim() !== '');
  const labels = picked
    .map((modifier) => modifier?.label)
    .filter((label) => typeof label === 'string' && label !== '');
  return { value, formulas, labels };
}

/**
 * Evaluate a check formula to `{ engine, total, diceGroups, resolvedFormula }`: `engine: false`
 * without a dice engine, and a bad formula throws for the caller to wrap. Interactive behaviour
 * is opt-in: `interactive` with a `prompt` confirms with the player, and a pre-resolved
 * `rollDecision` (the prompt's shape minus `confirmed`, issue 859) stands in for the dialog so
 * one answer drives N rolls. `modifierChoice` defers the `playerPicks` append until the prompt
 * returns (issues 770, 1055); otherwise `craftingModifier` appends before anything reads the
 * formula. A cancelled prompt returns `cancelled: true` so the runner aborts with zero mutation.
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
  // Interactive `playerPicks` (issue 770): the value is picked in the prompt, so it appends later.
  const modifierChoice = options?.modifierChoice;
  const useDeferredChoice =
    Boolean(modifierChoice) &&
    options?.interactive === true &&
    (typeof options.prompt === 'function' || Boolean(options?.rollDecision));
  // Append before anything reads the formula, so dialog, roll and journal agree (issue 1097).
  const baseFormula = useDeferredChoice
    ? authoredFormula
    : resolveRolledFormula(authoredFormula, actor, options?.craftingModifier);
  // The `@`-resolved display, recomputed below whenever the formula changes.
  let resolved = resolveCheckFormulaDisplay(baseFormula, actor);

  let effectiveFormula = baseFormula;
  let effectiveRollMode = options?.rollMode;
  let effectiveFlavor = options?.flavor;
  // Advantage is asked of the authored check, never the appended modifiers (issue 1118): a
  // `(1d20)[Modifiers]` term would otherwise read as a plain d20 and be rewritten. Every appender
  // returns `base + terms`, so the transform applies to this prefix, guarded by `startsWith`.
  let advantageBase = authoredFormula.trim();

  // A pre-resolved decision (issue 859) stands in for the dialog's return value.
  const preResolved = options?.rollDecision ?? null;

  // Interactive roll: confirm (or reuse the decision) and optionally add a situational bonus.
  // `Boolean(preResolved) ||` is load-bearing: without it a decision with no `prompt` is dropped.
  if (
    options?.interactive === true &&
    (Boolean(preResolved) || typeof options.prompt === 'function')
  ) {
    // Prompt-only work, never computed for a pre-resolved roll.
    const askPlayer = async () => {
      // A deferred choice shows a neutral trailing slot, where the resolved term will land.
      const promptFormula = useDeferredChoice
        ? `${effectiveFormula} + ${DEFERRED_MODIFIER_SLOT}`
        : effectiveFormula;
      const promptResolved = useDeferredChoice
        ? resolveCheckFormulaDisplay(promptFormula, actor)
        : resolved;
      return options.prompt({
        formula: promptFormula,
        resolvedFormula: promptResolved?.display ?? null,
        dc: options.dc,
        label: options.flavor,
        name: options.name,
        activity: options.activity,
        img: options.img,
        modifierChoice,
        // Offered only for a plain-d20 authored check.
        allowAdvantage: hasPlainD20(advantageBase),
      });
    };
    const choice = preResolved ?? (await askPlayer());
    // `=== false` is load-bearing: a pre-resolved decision carries no `confirmed` key.
    if (!choice || choice.confirmed === false) {
      return { engine: true, cancelled: true, total: 0, diceGroups: [], resolvedFormula: null };
    }
    // The chosen modifiers append first, so advantage and the bonus compose on top of them.
    if (useDeferredChoice) {
      // Flat picks sum into one term and each rolling pick appends its own (issue 1118).
      const selection = resolveModifierSelection(modifierChoice, choice);
      effectiveFormula = appendCheckModifierRollTerms(
        appendCheckModifierTerm(effectiveFormula, { value: selection.value }),
        selection.formulas
      );
      resolved = resolveCheckFormulaDisplay(effectiveFormula, actor);
      // One bullet-joined label segment rides the chat flavor, however many were picked.
      const chosenLabel = selection.labels.join(', ');
      if (chosenLabel) {
        effectiveFlavor = effectiveFlavor ? `${effectiveFlavor} · ${chosenLabel}` : chosenLabel;
      }
    }
    // Advantage first, so the bonus appends after the pool; only a plain 1d20 is rewritten.
    if (choice.advantage === 'advantage' || choice.advantage === 'disadvantage') {
      if (effectiveFormula.startsWith(advantageBase)) {
        const rewritten = applyD20Advantage(advantageBase, choice.advantage);
        effectiveFormula = rewritten + effectiveFormula.slice(advantageBase.length);
        advantageBase = rewritten;
      } else {
        effectiveFormula = applyD20Advantage(effectiveFormula, choice.advantage);
      }
      resolved = resolveCheckFormulaDisplay(effectiveFormula, actor);
    }
    const bonus = typeof choice.bonus === 'string' ? choice.bonus.trim() : choice.bonus;
    if (bonus) {
      // A bonus `Roll.validate` rejects is ignored rather than rolled as a consuming failure.
      const combined = `${effectiveFormula} + (${bonus})`;
      // `Roll.validate` is a static that runs `new this(formula)`, so it must be called as a
      // method: detached, it answers `false` for every formula.
      const RollClass = globalThis.Roll;
      if (typeof RollClass?.validate === 'function' && RollClass.validate(combined) === false) {
        console.warn('Fabricate | Ignoring invalid situational bonus', bonus);
      } else {
        effectiveFormula = combined;
        // Reconcile the displayed formula with the total actually rolled.
        resolved = resolveCheckFormulaDisplay(effectiveFormula, actor);
      }
    }
    if (choice.rollMode) effectiveRollMode = choice.rollMode;
  }

  // `allowInteractive: false`: never surface a manual roll-fulfilment dialog mid-craft.
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
      await roll.toMessage(
        { speaker: options.speaker, flavor: effectiveFlavor },
        { rollMode: effectiveRollMode, create: true }
      );
    } catch (error) {
      console.error('Fabricate | Failed to post check roll to chat:', error);
    }
  }

  const result = {
    engine: true,
    total,
    diceGroups: rolledDiceGroups(roll),
    resolvedFormula: resolved?.display ?? null,
  };
  if (options?.includeRollHandoff === true && typeof roll?.toJSON === 'function') {
    result.rollHandoff = {
      serializedRoll: roll.toJSON(),
      flavor: effectiveFlavor ?? null,
      speaker: options?.speaker ?? null,
      rollMode: effectiveRollMode ?? null,
    };
  }
  return result;
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
  return {
    bonus: typeof source.bonus === 'string' ? source.bonus : null,
    advantage,
    rollMode,
    chosenModifierIds: selected,
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
  return {
    engine: result.engine,
    total: result.total,
    diceGroups: result.diceGroups,
    resolvedFormula: null,
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

/**
 * Evaluate and classify the private CraftingEngine check descriptor without accepting a client
 * formula or total. This is the authority-side twin of the three existing formula runners.
 */
export async function evaluatePreparedRunCheck(
  preparation,
  actor,
  decision = {},
  { secret = false, failureMessage = 'Check failed' } = {}
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
        speaker: preparation?.speaker ?? config.speaker ?? null,
      },
    },
    actor,
    authoritativeDecision
  );
  if (rolled.cancelled) {
    return { success: false, cancelled: true, outcome: null, value: null, data: {} };
  }
  const kind = preparedCheckKind(preparation);
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
  const triggers = config.checkBreakage?.triggers ?? config.triggers ?? [];
  const forced = resolveForcedOutcome(triggers, { total, diceGroups });
  const data = {
    dc: config.resolvedDc ?? config.dc,
    total,
    diceGroups,
  };
  let success = true;
  let outcome = null;
  let value = total;
  if (kind === 'progressive') {
    if (forced?.disposition === 'success') value = Number.MAX_SAFE_INTEGER;
    if (forced?.disposition === 'failure') value = 0;
    data.value = value;
  } else if (kind === 'routed') {
    const classified = classifyCheckTotal({
      type: config.type,
      total,
      dc: data.dc,
      comparison: config.thresholdMode === 'exceed' ? 'exceed' : 'meet',
      relativeOutcomes: config.relativeOutcomes,
      fixedOutcomes: config.fixedOutcomes,
      triggers,
      diceGroups,
      clampToNearest: config.clampToNearest !== false,
      minOutcomeId: config.minOutcomeId ?? null,
    });
    success = classified.success;
    outcome = classified.matched?.name ?? null;
    data.type = config.type;
    data.comparison = config.thresholdMode === 'exceed' ? 'exceed' : 'meet';
    data.outcomeId = classified.matched?.id ?? null;
    data.success = success;
    data.breakTools = classified.breakTools;
    if (classified.tierStepApplied) data.tierStepApplied = classified.tierStepApplied;
    if (classified.minTierFailed) {
      data.minTierFailed = true;
      data.blockedOutcomeId = classified.blockedOutcomeId;
    }
  } else {
    const comparison = config.thresholdMode === 'exceed' ? 'exceed' : 'meet';
    success = forced
      ? forced.disposition === 'success'
      : comparison === 'exceed'
        ? total > Number(data.dc)
        : total >= Number(data.dc);
    outcome = success ? 'pass' : 'fail';
    data.comparison = comparison;
  }
  return {
    success,
    outcome,
    value,
    data,
    message: success ? null : failureMessage,
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

/** Reconstruct and post a GM-evaluated roll in the entitled player's own Foundry session. */
export async function postCheckRollHandoff(handoff, { Roll = globalThis.Roll } = {}) {
  if (!handoff?.serializedRoll || typeof Roll?.fromData !== 'function') {
    return { success: false, reason: 'invalid-roll-handoff' };
  }
  try {
    const roll = Roll.fromData(handoff.serializedRoll);
    if (!roll || typeof roll.toMessage !== 'function') {
      return { success: false, reason: 'invalid-roll-handoff' };
    }
    await roll.toMessage(
      { speaker: handoff.speaker ?? undefined, flavor: handoff.flavor ?? undefined },
      { ...chatModeOption(handoff.rollMode), create: true }
    );
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
  Roll = globalThis.Roll
) {
  if (typeof formula !== 'string' || formula.trim() === '') return null;
  if (typeof Roll?.replaceFormulaData !== 'function') return null;
  const substituted = resolveRolledFormula(formula, actor, craftingModifier, Roll);
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
 * A pass/fail check: the total against `dc` (meet or exceed), honouring forced outcomes. A
 * dismissed interactive prompt returns `cancelled: true` so the caller aborts with zero
 * mutation; with no dice engine it passes rather than block.
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
}) {
  const formula = String(rawFormula || '').trim();
  let total = 0;
  let diceGroups = [];
  let resolvedFormula = null;
  if (formula) {
    let rolled;
    try {
      rolled = await evaluateCheckRoll(formula, actor, { ...rollOptions, dc, craftingModifier });
    } catch (error) {
      console.error(`Fabricate | ${label} check roll failed (${formula})`, error);
      return {
        success: false,
        outcome: 'fail',
        value: null,
        data: { dc, formula },
        message: `${label} check roll failed: ${error.message}`,
      };
    }
    // A cancelled prompt aborts with zero mutation.
    if (rolled.cancelled) {
      return { success: false, cancelled: true, outcome: null, value: null, data: { dc, formula } };
    }
    if (!rolled.engine) {
      // No dice engine: cannot evaluate, so do not block the activity.
      return { success: true, outcome: 'pass', value: null, data: { dc, formula }, message: null };
    }
    total = rolled.total;
    diceGroups = rolled.diceGroups;
    resolvedFormula = rolled.resolvedFormula;
  }

  const forced = resolveForcedOutcome(triggers, { total, diceGroups });
  const comparison = thresholdMode === 'exceed' ? 'exceed' : 'meet';
  let success;
  if (forced) {
    success = forced.disposition === 'success';
  } else if (comparison === 'exceed') {
    success = total > dc;
  } else {
    success = total >= dc;
  }
  return {
    success,
    outcome: success ? 'pass' : 'fail',
    value: total,
    data: {
      dc,
      formula,
      resolvedFormula,
      total,
      comparison,
      diceGroups,
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
}) {
  const formula = String(rawFormula || '').trim();
  let total = 0;
  let diceGroups = [];
  let resolvedFormula = null;
  if (formula) {
    let rolled;
    try {
      rolled = await evaluateCheckRoll(formula, actor, { ...rollOptions, craftingModifier });
    } catch (error) {
      console.error(`Fabricate | ${label} progressive check roll failed (${formula})`, error);
      return {
        success: false,
        outcome: null,
        value: null,
        data: { formula },
        message: `${label} check roll failed: ${error.message}`,
      };
    }
    // The player cancelled the interactive roll dialog: abort with zero mutation.
    if (rolled.cancelled) {
      return { success: false, cancelled: true, outcome: null, value: null, data: { formula } };
    }
    if (!rolled.engine) {
      // No dice engine: award nothing (a finite value) rather than block.
      return { success: true, outcome: null, value: 0, data: { formula, total: 0, value: 0 } };
    }
    total = rolled.total;
    diceGroups = rolled.diceGroups;
    resolvedFormula = rolled.resolvedFormula;
  }

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
    },
  };
}

/**
 * Match a total to a routed tier, or `null`. Relative tiers carry a DC delta over the base `dc`
 * and the matching tier with the highest threshold wins; fixed tiers carry `[start, end]` and
 * the highest matching `start` wins. `clampToNearest` (relative only) routes a total below every
 * threshold to the lowest tier; there is no top-end clamp.
 */
function matchRoutedOutcome({
  type,
  total,
  dc,
  comparison,
  relativeOutcomes,
  fixedOutcomes,
  clampToNearest = false,
}) {
  if (type === 'fixed') {
    const outcomes = Array.isArray(fixedOutcomes) ? fixedOutcomes : [];
    let best = null;
    for (const outcome of outcomes) {
      if (!outcome) continue;
      const start = Number(outcome.start);
      const end = Number(outcome.end);
      if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
      if (total < start || total > end) continue;
      if (!best || start > Number(best.start)) best = outcome;
    }
    return best;
  }
  const outcomes = Array.isArray(relativeOutcomes) ? relativeOutcomes : [];
  let best = null;
  let bestThreshold = null;
  let lowest = null;
  let lowestThreshold = null;
  for (const outcome of outcomes) {
    if (!outcome) continue;
    const delta = Number(outcome.dc);
    if (!Number.isFinite(delta)) continue;
    const threshold = dc + delta;
    // Strict `<` keeps the first authored tier among equal-lowest thresholds.
    if (lowest === null || threshold < lowestThreshold) {
      lowest = outcome;
      lowestThreshold = threshold;
    }
    const matches = comparison === 'exceed' ? total > threshold : total >= threshold;
    if (!matches) continue;
    if (best === null || threshold > bestThreshold) {
      best = outcome;
      bestThreshold = threshold;
    }
  }
  // Below every threshold: clamp to the closest (lowest) tier when asked, else null.
  if (best === null && clampToNearest) return lowest;
  return best;
}

/** A relative tier ranks by DC delta, a fixed one by range start. */
function routedRankKey(type) {
  return type === 'fixed' ? 'start' : 'dc';
}

/**
 * The single derivation of routed tier order (issue 975), ascending by `dc` or `start`: tiers
 * with a non-finite rank are dropped and ties keep author order. Callers locate a tier by id,
 * never by identity, because this is a copy.
 */
function rankedRoutedOutcomes({ type, relativeOutcomes, fixedOutcomes }) {
  const key = routedRankKey(type);
  const source = type === 'fixed' ? fixedOutcomes : relativeOutcomes;
  return (Array.isArray(source) ? source : [])
    .map((outcome, authorIndex) => ({ outcome, authorIndex, rank: Number(outcome?.[key]) }))
    .filter((entry) => Boolean(entry.outcome) && Number.isFinite(entry.rank))
    .toSorted((left, right) => left.rank - right.rank || left.authorIndex - right.authorIndex)
    .map((entry) => entry.outcome);
}

/** The ranked tiers of one disposition, the only subset a forced outcome or a step moves in. */
function dispositionSubset(ranked, disposition) {
  const wantSuccess = disposition === 'success';
  return ranked.filter((outcome) => (outcome.success === true) === wantSuccess);
}

/** A forced failure routes to the lowest-ranked failing tier and a forced success to the
 *  highest-ranked succeeding one; equal ranks keep the first authored. `null` when none exists. */
function routeCritOutcome({ type, forcedSuccess, relativeOutcomes, fixedOutcomes }) {
  const wantSuccess = forcedSuccess === true;
  const ranked = dispositionSubset(
    rankedRoutedOutcomes({ type, relativeOutcomes, fixedOutcomes }),
    wantSuccess ? 'success' : 'failure'
  );
  if (ranked.length === 0) return null;
  // Ascending order: index 0 already IS the lowest-ranked, author-first tier.
  if (!wantSuccess) return ranked[0];
  // The highest rank sits at the end, but equal-rank tiers must resolve to the FIRST
  // authored one, so seek the START of the top-rank run rather than reading `at(-1)`.
  const key = routedRankKey(type);
  const topRank = Number(ranked.at(-1)[key]);
  return ranked[ranked.findIndex((outcome) => Number(outcome[key]) === topRank)];
}

/** The `tierStep.mode` values that move; `none` and anything unrecognised is inert. */
const TIER_STEP_MODES = new Set(['target', 'up', 'down']);

/**
 * The frozen rolled-tier snapshot every step condition is evaluated against, once: a step asks
 * about the tier the dice landed on, never the stepped one, so steps cannot cycle. `value` stays
 * `undefined` so `progressiveValue` is invisible, as in `resolveForcedOutcome`.
 */
function rolledTierSnapshot(rolled, total, diceGroups) {
  return Object.freeze({
    value: undefined,
    outcome: rolled?.name ?? null,
    data: Object.freeze({
      total,
      diceGroups: Array.isArray(diceGroups) ? diceGroups : [],
      outcomeId: rolled?.id ?? null,
    }),
  });
}

/** Triggers matching the rolled tier whose `tierStep` moves, in author order. */
function matchedTierStepTriggers(triggers, snapshot) {
  return (Array.isArray(triggers) ? triggers : []).filter((trigger) => {
    if (!TIER_STEP_MODES.has(trigger?.tierStep?.mode)) return false;
    return evaluateCheckBreakageCondition(trigger.condition, snapshot);
  });
}

/** An integer `>= 1`, clamped here too so a raw negative never inverts the authored direction. */
function tierStepMagnitude(steps) {
  const value = Math.trunc(Number(steps));
  return Number.isFinite(value) && value >= 1 ? value : 1;
}

/**
 * The winning `target` trigger: a target is eligible only when its `tierId` is in the array in
 * play, and among eligible ones the lowest-ranked tier wins, order-independent and pessimistic.
 * `index` is -1 when none survives.
 */
function resolveTierStepTarget(stepping, inPlay) {
  let index = -1;
  let trigger = null;
  for (const candidate of stepping) {
    if (candidate.tierStep.mode !== 'target') continue;
    const tierId = candidate.tierStep.tierId;
    if (typeof tierId !== 'string' || tierId === '') continue;
    const found = inPlay.findIndex((outcome) => outcome.id === tierId);
    if (found === -1) continue;
    if (index === -1 || found < index) {
      index = found;
      trigger = candidate;
    }
  }
  return { index, trigger };
}

/** `Σ up − Σ down`: summing is commutative, so `up 1` plus `down 1` is a deliberate no-op. */
function netTierSteps(stepping) {
  return stepping.reduce((net, trigger) => {
    const { mode, steps } = trigger.tierStep;
    if (mode === 'up') return net + tierStepMagnitude(steps);
    if (mode === 'down') return net - tierStepMagnitude(steps);
    return net;
  }, 0);
}

/** The winning target plus every matched relative trigger; a losing target is not credited. */
function appliedTierStepTriggerIds(stepping, winningTarget) {
  return stepping
    .filter((trigger) => trigger.tierStep.mode !== 'target' || trigger === winningTarget)
    .map((trigger) => trigger.id)
    .filter((id) => typeof id === 'string' && id !== '');
}

/**
 * Apply every matching trigger's `tierStep` to the rolled tier (issue 975). Stepping preserves
 * disposition: under a forced outcome the array in play is that disposition's subset, so
 * `data.success` always agrees with the final tier. A winning target sets the base, the net
 * relative offset applies, and the result clamps to the array (`stepClamped`, unrelated to
 * `clampToNearest`). A `null` rolled tier steps nothing; `tierStepApplied` marks a real change.
 */
function applyTierStepTriggers({
  rolled,
  type,
  forcedDisposition = null,
  triggers,
  relativeOutcomes,
  fixedOutcomes,
  total,
  diceGroups,
}) {
  if (!rolled) return { matched: null, tierStepApplied: null };

  const stepping = matchedTierStepTriggers(triggers, rolledTierSnapshot(rolled, total, diceGroups));
  if (stepping.length === 0) return { matched: rolled, tierStepApplied: null };

  const ranked = rankedRoutedOutcomes({ type, relativeOutcomes, fixedOutcomes });
  const inPlay = forcedDisposition === null ? ranked : dispositionSubset(ranked, forcedDisposition);
  const fromIndex = inPlay.findIndex((outcome) => outcome.id === rolled.id);
  if (fromIndex === -1) return { matched: rolled, tierStepApplied: null };

  const target = resolveTierStepTarget(stepping, inPlay);
  const base = target.index === -1 ? fromIndex : target.index;
  const requestedIndex = base + netTierSteps(stepping);
  const toIndex = Math.min(Math.max(requestedIndex, 0), inPlay.length - 1);
  // A clamped no-op or a cancelling pair leaves the rolled tier with no evidence.
  if (toIndex === fromIndex) return { matched: rolled, tierStepApplied: null };

  const stepped = inPlay[toIndex];
  // A winning target is `target` whatever the delta: a placement has no direction.
  let mode = 'target';
  if (target.index === -1) mode = toIndex > fromIndex ? 'up' : 'down';
  return {
    matched: stepped,
    tierStepApplied: {
      mode,
      // The realized magnitude, which the chat card renders; `stepClamped` says more was asked.
      steps: Math.abs(toIndex - fromIndex),
      fromOutcomeId: rolled.id ?? null,
      toOutcomeId: stepped.id ?? null,
      stepClamped: requestedIndex !== toIndex,
      triggerIds: appliedTierStepTriggerIds(stepping, target.trigger),
    },
  };
}

/**
 * Whether the fixed-type recipe minimum tier blocks the final tier. It compares `start` values,
 * not rank indices, because overlapping ranges are a readiness issue rather than refused, and
 * two tiers sharing a `start` must compare equal.
 */
function minSuccessTierFailed({ type, minOutcomeId, matched, relativeOutcomes, fixedOutcomes }) {
  if (type !== 'fixed' || !minOutcomeId) return false;
  const ranked = rankedRoutedOutcomes({ type, relativeOutcomes, fixedOutcomes });
  const requiredIndex = ranked.findIndex((outcome) => outcome.id === minOutcomeId);
  const requiredStart = Number(ranked[requiredIndex]?.start);
  // A stale/unknown `minOutcomeId` no-ops gracefully, like `checkTierId`.
  if (!Number.isFinite(requiredStart)) return false;
  const matchedStart = Number(matched?.start);
  return !Number.isFinite(matchedStart) || matchedStart < requiredStart;
}

/**
 * Classify one total against a routed check's tiers: the whole post-roll resolution, which
 * `runFormulaRouted` calls so the Checks Studio's odds histogram cannot drift from it (issue
 * 1097). Order is load-bearing: forced reroute (an extreme tier), then the relative tier step,
 * then the minimum gate on the final tier. A caller synthesising `diceGroups` must build them
 * through `rolledDiceGroups`, or per-die triggers go silently invisible. `matched` is the
 * effective tier (`null` when the gate blocked it, naming it in `blockedOutcomeId`).
 */
export function classifyCheckTotal({
  type,
  total,
  dc,
  comparison,
  relativeOutcomes,
  fixedOutcomes,
  triggers,
  diceGroups = [],
  clampToNearest = false,
  minOutcomeId = null,
}) {
  const forced = resolveForcedOutcome(triggers, { total, diceGroups });

  let matched = forced
    ? routeCritOutcome({
        type,
        forcedSuccess: forced.disposition === 'success',
        relativeOutcomes,
        fixedOutcomes,
      })
    : matchRoutedOutcome({
        type,
        total,
        dc,
        comparison,
        relativeOutcomes,
        fixedOutcomes,
        clampToNearest,
      });

  const tierStep = applyTierStepTriggers({
    rolled: matched,
    type,
    forcedDisposition: forced ? forced.disposition : null,
    triggers,
    relativeOutcomes,
    fixedOutcomes,
    total,
    diceGroups,
  });
  matched = tierStep.matched;

  const minTierFailed =
    !forced &&
    minSuccessTierFailed({ type, minOutcomeId, matched, relativeOutcomes, fixedOutcomes });
  const effectiveMatched = minTierFailed ? null : matched;

  const success = minTierFailed
    ? false
    : forced
      ? forced.disposition === 'success'
      : effectiveMatched
        ? effectiveMatched.success === true
        : false;

  return {
    matched: effectiveMatched,
    forcedDisposition: forced ? forced.disposition : null,
    success,
    // The final tier's `breakTools` is the only `data.breakTools` source.
    breakTools: effectiveMatched ? effectiveMatched.breakTools === true : false,
    tierStepApplied: tierStep.tierStepApplied,
    minTierFailed,
    blockedOutcomeId: minTierFailed ? (matched?.id ?? null) : null,
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
}) {
  const formula = String(rawFormula || '').trim();
  let total = 0;
  let diceGroups = [];
  let resolvedFormula = null;
  if (formula) {
    let rolled;
    try {
      // No `dc` here: `evaluateCheckRoll` uses it for the prompt only, and callers already put
      // the prompt-facing DC on `rollOptions` (none for a fixed check).
      rolled = await evaluateCheckRoll(formula, actor, { ...rollOptions, craftingModifier });
    } catch (error) {
      console.error(`Fabricate | ${label} routed check roll failed (${formula})`, error);
      return {
        success: false,
        outcome: null,
        value: null,
        data: { dc, formula, type },
        message: `${label} check roll failed: ${error.message}`,
      };
    }
    // The player cancelled the interactive roll dialog: abort with zero mutation.
    if (rolled.cancelled) {
      return {
        success: false,
        cancelled: true,
        outcome: null,
        value: null,
        data: { dc, formula, type },
      };
    }
    if (!rolled.engine) {
      return {
        success: true,
        outcome: null,
        value: null,
        data: { dc, formula, type },
        message: null,
      };
    }
    total = rolled.total;
    diceGroups = rolled.diceGroups;
    resolvedFormula = rolled.resolvedFormula;
  }

  const comparison = thresholdMode === 'exceed' ? 'exceed' : 'meet';

  // The whole post-roll resolution, shared with the odds histogram (issue 1097).
  const classified = classifyCheckTotal({
    type,
    total,
    dc,
    comparison,
    relativeOutcomes,
    fixedOutcomes,
    triggers,
    diceGroups,
    clampToNearest,
    minOutcomeId,
  });
  const { matched, success } = classified;

  return {
    success,
    outcome: matched ? matched.name : null,
    value: total,
    data: {
      dc,
      formula,
      resolvedFormula,
      total,
      type,
      comparison,
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
