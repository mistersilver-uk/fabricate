/** Resolves an interactive check decision into a formula and modifier placement plan. */

import { applyD20Advantage, hasPlainD20 } from '../utils/craftingCheckExpression.js';

import {
  appendPlannedLibraryTerms,
  resolvedLibraryContributions,
} from './checkModifierResolver.js';
import { planModifierPlacement } from './checkModifierRouter.js';
import { CHECK_MODIFIER_TERM_LABEL } from './toolCheckBonus.js';

const DEFERRED_MODIFIER_SLOT = `(modifier)[${CHECK_MODIFIER_TERM_LABEL}]`;

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

function promptInput({ authoredFormula, actor, options, resolvedCheck, displayFormula, deferred }) {
  const formula = deferred
    ? `${resolvedCheck.formula} + ${DEFERRED_MODIFIER_SLOT}`
    : resolvedCheck.formula;
  const resolved = displayFormula(formula, actor);
  return {
    formula,
    resolvedFormula: resolved?.display ?? null,
    dc: options.dc,
    label: options.flavor,
    name: options.name,
    activity: options.activity,
    img: options.img,
    modifierChoice: options.modifierChoice,
    selectedModifiers: resolvedCheck.selected,
    thresholdMode: options.thresholdMode === 'exceed' ? 'exceed' : 'meet',
    allowAdvantage: hasPlainD20(authoredFormula.trim()),
  };
}

function applyAdvantage(formula, authoredFormula, advantage, evaluation) {
  if (advantage !== 'advantage' && advantage !== 'disadvantage') {
    return { formula, contribution: null };
  }
  if (evaluation.product === 'count') {
    return {
      formula,
      contribution: {
        source: 'advantage',
        label: '',
        form: 'scalar',
        value: advantage === 'advantage' ? 1 : -1,
      },
    };
  }
  const prefix = authoredFormula.trim();
  const rewritten = applyD20Advantage(prefix, advantage);
  return {
    formula: formula.startsWith(prefix)
      ? rewritten + formula.slice(prefix.length)
      : applyD20Advantage(formula, advantage),
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

/** The prompt returns a decision, but never determines the selected modifier data directly. */
export async function resolveCheckDecision({
  authoredFormula,
  actor,
  options,
  evaluation,
  resolvedCheck,
  displayFormula,
  Roll,
}) {
  const deferred =
    Boolean(options?.modifierChoice) &&
    options?.interactive === true &&
    (typeof options.prompt === 'function' || Boolean(options?.rollDecision));
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
          resolvedCheck,
          displayFormula,
          deferred,
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

  const placementPlan = planModifierPlacement({
    evaluation,
    contributions: [
      ...(Array.isArray(options?.toolContributions) ? options.toolContributions : []),
      ...resolvedLibraryContributions(selectedModifiers),
      ...(situational ? [situational] : []),
      ...(advantageContribution ? [advantageContribution] : []),
    ],
  });
  return {
    formula,
    flavor,
    rollMode,
    placementPlan,
    resolvedFormula: displayFormula(formula, actor)?.display ?? null,
  };
}
