/** Resolves an interactive check decision into a formula and modifier placement plan. */

import { applyD20Advantage, hasPlainD20 } from '../utils/craftingCheckExpression.js';

import {
  appendPlannedLibraryTerms,
  resolvedLibraryContributions,
} from './checkModifierResolver.js';
import { planModifierPlacement } from './checkModifierRouter.js';
import { CHECK_MODIFIER_TERM_LABEL } from './toolCheckBonus.js';

/** The deferred `playerPicks` slot the prompt shows as a trailing term, where the resolved term lands. */
const DEFERRED_MODIFIER_SLOT = `(modifier)[${CHECK_MODIFIER_TERM_LABEL}]`;
const KEEP_UNDER = { advantage: 'disadvantage', disadvantage: 'advantage' };
const BENEFIT_SOURCES = Object.freeze(['tool', 'library', 'situational', 'advantage']);

function requestedModifierIds(modifierChoice, choice) {
  if (Array.isArray(choice?.chosenModifierIds)) return choice.chosenModifierIds;
  const single = choice?.chosenModifierId;
  if (single !== undefined && single !== null) return [single];
  const defaults = modifierChoice?.defaultSelectedIds;
  if (Array.isArray(defaults)) return defaults;
  const fallback = modifierChoice?.defaultSelectedId;
  return fallback === undefined || fallback === null ? [] : [fallback];
}

/** A returned choice is bounded by offered ids, in eligible order and within the pick cap. */
function resolveModifierSelection(modifierChoice, choice) {
  const offered = Array.isArray(modifierChoice?.modifiers) ? modifierChoice.modifiers : [];
  const requested = new Set(requestedModifierIds(modifierChoice, choice));
  const rawCap = Number(modifierChoice?.maxPicks);
  const maxPicks = Number.isInteger(rawCap) && rawCap > 0 ? rawCap : 1;
  const selected = offered
    .filter((modifier) => typeof modifier?.id === 'string' && requested.has(modifier.id))
    .slice(0, maxPicks);
  const labels = selected
    .map((modifier) => modifier?.label)
    .filter((label) => typeof label === 'string' && label !== '');
  return { selected, labels };
}

function situationalContribution(bonus, evaluation) {
  if (!bonus) return null;
  const numeric = Number(bonus);
  if (
    (evaluation.product !== 'sum' || evaluation.direction !== 'over') &&
    Number.isFinite(numeric)
  ) {
    return { source: 'situational', label: '', form: 'scalar', value: numeric };
  }
  return { source: 'situational', label: '', form: 'expression', expression: String(bonus) };
}

/** Whether the offered `modifierChoice` waits for the prompt's answer before it appends. */
export function defersModifierChoice(options) {
  return (
    Boolean(options?.modifierChoice) &&
    options?.interactive === true &&
    (typeof options.prompt === 'function' || Boolean(options?.rollDecision))
  );
}

/**
 * A summed roll-under prompt's character-value target basis and the Tool bonus already rolled
 * into its target, which the prompt adds to the target it names; nothing for any other check.
 */
export function underTargetPromptFields(
  evaluation,
  { targetBasis = null, toolContributions } = {}
) {
  if (evaluation?.product !== 'sum' || evaluation.direction !== 'under') return {};
  const tools = Array.isArray(toolContributions) ? toolContributions : [];
  return {
    targetBasis,
    toolBonus: tools.reduce(
      (sum, tool) => sum + (Number.isFinite(tool?.value) ? tool.value : 0),
      0
    ),
  };
}

/**
 * A count prompt's fields: the pre-modifier pool, threshold and face rules from the pool resolved
 * before the prompt opens (`policy`, or null), and the required count, or null when nothing grades
 * against it: a progressive or fixed-range routed check, or a hidden gathering task.
 * `thresholdSource` is the authored threshold when it is not a plain number.
 */
export function countPromptFields(evaluation, policy, required) {
  return {
    product: 'count',
    direction: evaluation.direction === 'under' ? 'under' : 'over',
    comparison: policy?.comparison ?? null,
    pool: policy?.dice ?? null,
    threshold: policy?.threshold ?? null,
    thresholdSource: policy ? authoredThreshold(evaluation.pool?.threshold) : null,
    die: policy?.die ?? null,
    explode: policy?.explode
      ? { kind: policy.explode.kind, value: policy.explode.value, once: policy.explode.once }
      : null,
    cancel: policy?.cancel ? { kind: policy.cancel.kind, value: policy.cancel.value } : null,
    required: Number.isFinite(required) ? required : null,
    modifierDestination:
      evaluation.pool?.modifierDestination === 'threshold' ? 'threshold' : 'pool',
  };
}

function authoredThreshold(expression) {
  const text = String(expression ?? '').trim();
  return text && !/^[+-]?\d+(?:\.\d+)?$/.test(text) ? text : null;
}

function promptInput({
  authoredFormula,
  actor,
  options,
  evaluation,
  resolvedCheck,
  displayFormula,
  deferred,
  countPolicy,
}) {
  // A count check shows no formula, so no bare deferred slot either (issue 2004).
  const formula =
    deferred && evaluation.product !== 'count'
      ? `${resolvedCheck.formula} + ${DEFERRED_MODIFIER_SLOT}`
      : resolvedCheck.formula;
  const resolved = displayFormula(formula, actor);
  // The modifiers `selectedModifiers` itemises are chips, so the shown formula omits their terms.
  const shownFormula = deferred ? formula : authoredFormula.trim();
  return {
    formula,
    resolvedFormula: resolved?.display ?? null,
    displayFormula: displayFormula(shownFormula, actor)?.display ?? shownFormula,
    dc: options.dc,
    // The pre-modifier target and, for a summed check, the direction the roll must land on.
    target: Number.isFinite(options.dc) ? options.dc : null,
    direction: evaluation.product === 'sum' ? evaluation.direction : null,
    ...underTargetPromptFields(evaluation, options),
    label: options.flavor,
    name: options.name,
    activity: options.activity,
    img: options.img,
    modifierChoice: options.modifierChoice,
    selectedModifiers: resolvedCheck.selected,
    thresholdMode: options.thresholdMode === 'exceed' ? 'exceed' : 'meet',
    // A count check offers no advantage until it is mode-aware (issue 2007).
    allowAdvantage: evaluation.product !== 'count' && hasPlainD20(authoredFormula.trim()),
    // Display only: a bonus the decision carries still applies when the offer is off.
    offerSituationalBonus: options.offerSituationalBonus !== false,
    ...(evaluation.product === 'count' &&
      countPromptFields(evaluation, countPolicy, options.required)),
  };
}

function applyAdvantage(formula, authoredFormula, advantage, evaluation) {
  if (advantage !== 'advantage' && advantage !== 'disadvantage') {
    return { formula, contribution: null };
  }
  // A count check drops a supplied advantage before placement until issue 2007.
  if (evaluation.product === 'count') return { formula, contribution: null };
  // Keeping the lowest die is the advantage when a sum must come in under its target.
  const keep = evaluation.direction === 'under' ? KEEP_UNDER[advantage] : advantage;
  const prefix = authoredFormula.trim();
  const rewritten = applyD20Advantage(prefix, keep);
  return {
    formula: formula.startsWith(prefix)
      ? rewritten + formula.slice(prefix.length)
      : applyD20Advantage(formula, keep),
    contribution: null,
  };
}

function applySituationalBonus(formula, rawBonus, evaluation, Roll) {
  const bonus = typeof rawBonus === 'string' ? rawBonus.trim() : rawBonus;
  if (!bonus) return { formula, contribution: null };
  const sumOver = evaluation.product === 'sum' && evaluation.direction === 'over';
  const combined = `${formula} + (${bonus})`;
  const validationFormula = sumOver ? combined : String(bonus);
  // Roll.validate uses `this` to construct a Roll; do not detach it.
  if (typeof Roll?.validate === 'function' && Roll.validate(validationFormula) === false) {
    console.warn('Fabricate | Ignoring invalid situational bonus', bonus);
    return { formula, contribution: null };
  }
  return {
    formula: sumOver ? combined : formula,
    contribution: situationalContribution(bonus, evaluation),
  };
}

/**
 * The prompt returns a decision, but never determines the selected modifier data directly.
 * `deferred` means the offered `modifierChoice` is selected by that decision; a count check
 * passes the `countPolicy` its pool resolved to before the prompt.
 */
export async function resolveCheckDecision({
  authoredFormula,
  actor,
  options,
  evaluation,
  deferred,
  resolvedCheck,
  displayFormula,
  Roll,
  countPolicy = null,
}) {
  let formula = resolvedCheck.formula;
  let flavor = options?.flavor;
  let rollMode = options?.rollMode;
  let selectedModifiers = resolvedCheck.selected;
  let situational = null;
  let advantageContribution = null;
  const preResolved = options?.rollDecision ?? null;

  if (options?.interactive === true && (preResolved || typeof options.prompt === 'function')) {
    const choice =
      preResolved ??
      (await options.prompt(
        promptInput({
          authoredFormula,
          actor,
          options,
          evaluation,
          resolvedCheck,
          displayFormula,
          deferred,
          countPolicy,
        })
      ));
    if (!choice || choice.confirmed === false) return { cancelled: true };

    if (deferred) {
      const selection = resolveModifierSelection(options.modifierChoice, choice);
      selectedModifiers = selection.selected;
      const placement = planModifierPlacement({
        evaluation,
        contributions: resolvedLibraryContributions(selectedModifiers),
      });
      formula = appendPlannedLibraryTerms(formula, placement);
      const chosenLabel = selection.labels.join(', ');
      if (chosenLabel) flavor = flavor ? `${flavor} · ${chosenLabel}` : chosenLabel;
    }

    const advantage = applyAdvantage(formula, authoredFormula, choice.advantage, evaluation);
    formula = advantage.formula;
    advantageContribution = advantage.contribution;
    const bonus = applySituationalBonus(formula, choice.bonus, evaluation, Roll);
    formula = bonus.formula;
    situational = bonus.contribution;
    if (choice.rollMode) rollMode = choice.rollMode;
  }

  const contributions = [
    ...(Array.isArray(options?.toolContributions) ? options.toolContributions : []),
    ...resolvedLibraryContributions(selectedModifiers),
    ...(situational ? [situational] : []),
    ...(advantageContribution ? [advantageContribution] : []),
  ];
  const placementPlan = planModifierPlacement({ evaluation, contributions });
  return {
    formula,
    flavor,
    rollMode,
    placementPlan,
    benefitTerms: targetBenefitTerms(evaluation, contributions),
    resolvedFormula: displayFormula(formula, actor)?.display ?? null,
  };
}

/**
 * The settled scalar benefits a summed roll-under target gains, one nonzero `benefit` term per
 * router source in placement order. A pre-rolled benefit is evidenced by its `preRolls` entry
 * instead, so the terms and the pre-rolls together fold to the executed target (issue 2005).
 */
function targetBenefitTerms(evaluation, contributions) {
  if (evaluation?.product !== 'sum' || evaluation.direction !== 'under') return [];
  const totals = new Map();
  for (const { source, form, value, preRoll } of contributions) {
    if (form !== 'scalar' || preRoll) continue;
    totals.set(source, (totals.get(source) ?? 0) + value);
  }
  return BENEFIT_SOURCES.filter((source) => (totals.get(source) ?? 0) !== 0).map((source) => ({
    kind: 'benefit',
    value: totals.get(source),
    source,
  }));
}
