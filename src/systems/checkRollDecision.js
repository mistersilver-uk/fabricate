/** Resolves an interactive check decision into a formula and modifier placement plan. */

import { localizeWith } from '../utils/localizeWithFallback.js';

import { offeredDecision, resolveAdvantageOffer } from './checkAdvantage.js';
import { planKeepTransform } from './checkKeepTransform.js';
import {
  appendPlannedLibraryTerms,
  resolvedLibraryContributions,
} from './checkModifierResolver.js';
import { planModifierPlacement } from './checkModifierRouter.js';
import { countThresholdSource } from './countCheck.js';
import { describeCountPolicy } from './countEvaluation.js';
import { normalizeCheckAdvantage } from './normalize/checkAdvantage.js';
import { CHECK_MODIFIER_TERM_LABEL } from './toolCheckBonus.js';

/** The deferred `playerPicks` slot the prompt shows as a trailing term, where the resolved term lands. */
const DEFERRED_MODIFIER_SLOT = `(modifier)[${CHECK_MODIFIER_TERM_LABEL}]`;
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

/** A summed character-value target is a target to name, never a DC, in either direction. */
export function attributeTargetPromptField(evaluation) {
  return evaluation?.product === 'sum' && evaluation.target?.source === 'attribute'
    ? { targetSource: 'attribute' }
    : {};
}

/**
 * A count prompt's fields, numbers and enums only, from the pool resolved before the prompt opens
 * (`policy`, or null): `pool` and `threshold` are the resolved base and threshold with any scalar
 * Tool benefit already settled on them, unfloored, which the prompt settles its picks and bonus
 * onto; `thresholdAnchor` is the resolved threshold before any benefit, read from the character or
 * `fixed` as `thresholdSource` says; `explode` and `cancel` name the face each acts from. The
 * required count is null when nothing grades against it: progressive, fixed-range routed, hidden.
 */
export function countPromptFields(evaluation, policy, required, toolContributions = []) {
  const direction = evaluation.direction === 'under' ? 'under' : 'over';
  const modifierDestination =
    evaluation.pool?.modifierDestination === 'threshold' ? 'threshold' : 'pool';
  const shared = {
    product: 'count',
    direction,
    comparison: policy?.comparison ?? null,
    required: Number.isFinite(required) ? required : null,
    modifierDestination,
  };
  if (!policy) return { ...shared, ...UNRESOLVED_COUNT_FIELDS };
  const tools = planModifierPlacement({
    evaluation: { product: 'count', direction, pool: { modifierDestination } },
    contributions: settledToolBenefits(toolContributions),
  });
  const { explode, cancel } = describeCountPolicy(policy);
  return {
    ...shared,
    pool: policy.resolved.base + tools.poolDelta,
    die: policy.die,
    threshold: policy.resolved.threshold + tools.thresholdDelta,
    thresholdAnchor: policy.resolved.threshold,
    thresholdSource: countThresholdSource(evaluation),
    explode: explode && {
      kind: explode.from ? 'from' : 'best',
      face: explode.face,
      once: explode.once === true,
    },
    cancel: cancel && { kind: cancel.from ? 'from' : 'worst', face: cancel.face },
    zeroPoolFails: evaluation.pool?.zeroPoolFails !== false,
  };
}

const UNRESOLVED_COUNT_FIELDS = Object.freeze({
  pool: null,
  die: null,
  threshold: null,
  thresholdAnchor: null,
  thresholdSource: null,
  explode: null,
  cancel: null,
  zeroPoolFails: null,
});

/** The Tool benefits already rolled before the prompt, as bare scalars for the router to place. */
function settledToolBenefits(toolContributions) {
  return (Array.isArray(toolContributions) ? toolContributions : [])
    .filter((tool) => tool?.form === 'scalar' && Number.isFinite(tool.value))
    .map((tool) => ({ source: 'tool', label: '', form: 'scalar', value: tool.value }));
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
  advantageOffer,
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
    ...attributeTargetPromptField(evaluation),
    ...underTargetPromptFields(evaluation, options),
    label: options.flavor,
    name: options.name,
    activity: options.activity,
    img: options.img,
    modifierChoice: options.modifierChoice,
    selectedModifiers: resolvedCheck.selected,
    thresholdMode: options.thresholdMode === 'exceed' ? 'exceed' : 'meet',
    allowAdvantage: advantageOffer.advantage,
    advantageOffer,
    // Display only: a bonus the decision carries still applies when the offer is off.
    offerSituationalBonus: options.offerSituationalBonus !== false,
    ...(evaluation.product === 'count' &&
      countPromptFields(evaluation, countPolicy, options.required, options.toolContributions)),
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

const ADVANTAGE_LABELS = Object.freeze({
  advantage: ['FABRICATE.Check.Advantage.Advantage', 'Advantage'],
  disadvantage: ['FABRICATE.Check.Advantage.Disadvantage', 'Disadvantage'],
});

/**
 * The one contribution an offered button yields, or null: a count offer moves the pool by
 * `±dice`; a bonus offer rolls its expression whole, negated for Disadvantage. Keep yields none.
 */
export function advantageContribution(offer, decided) {
  if (!decided || (offer?.kind !== 'count' && offer?.kind !== 'bonus')) return null;
  const [key, fallback] = ADVANTAGE_LABELS[decided];
  const label = localizeWith(
    (id) => globalThis.game?.i18n?.localize?.(id),
    key,
    undefined,
    fallback
  );
  const negate = decided === 'disadvantage';
  if (offer.kind === 'count') {
    const dice = offer.detail.dice;
    return { source: 'advantage', label, form: 'scalar', value: negate ? -dice : dice };
  }
  const { expression } = offer.detail;
  return { source: 'advantage', label, form: 'expression', expression, negate };
}

/** Sum/over rolls a bonus die in the main roll, after the situational bonus; elsewhere nothing. */
function appendAdvantageBonus(formula, contribution, evaluation) {
  if (contribution?.form !== 'expression') return formula;
  if (evaluation.product !== 'sum' || evaluation.direction !== 'over') return formula;
  return `${formula} ${contribution.negate ? '-' : '+'} (${contribution.expression})`;
}

/**
 * The contributions a decision places and their plan: Tool contributions, the selected library
 * entries, then any the prompt's answer added. The Studio preview plans with no answer, as a
 * roll with no prompt does.
 */
export function planDecisionPlacement({ evaluation, toolContributions, selected, answered = [] }) {
  const contributions = [
    ...(Array.isArray(toolContributions) ? toolContributions : []),
    ...resolvedLibraryContributions(selected),
    ...answered,
  ];
  return { contributions, placementPlan: planModifierPlacement({ evaluation, contributions }) };
}

/**
 * The prompt returns a decision, but never determines the selected modifier data directly.
 * `deferred` means the offered `modifierChoice` is selected by that decision; a count check
 * passes the `countPolicy` its pool resolved to before the prompt, and gets back the
 * `contributions` it placed. `keep` is the keep transform the main roll takes, or null.
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
  let keep = null;
  let advantaged = null;
  const preResolved = options?.rollDecision ?? null;

  if (options?.interactive === true && (preResolved || typeof options.prompt === 'function')) {
    const advantage = normalizeCheckAdvantage(options.advantage);
    const advantageOffer = resolveAdvantageOffer({ advantage, evaluation, authoredFormula, Roll });
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
          advantageOffer,
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

    // A button the check's own offer excludes rolls normally, whatever transport carried it.
    const decided = offeredDecision(advantageOffer, choice.advantage);
    // Keep acts on the constructed Roll, never this string; a count check keeps nothing.
    keep = planKeepTransform({ choice: decided, evaluation, advantage, authoredFormula });
    const bonus = applySituationalBonus(formula, choice.bonus, evaluation, Roll);
    situational = bonus.contribution;
    advantaged = advantageContribution(advantageOffer, decided);
    formula = appendAdvantageBonus(bonus.formula, advantaged, evaluation);
    if (choice.rollMode) rollMode = choice.rollMode;
  }

  const { contributions, placementPlan } = planDecisionPlacement({
    evaluation,
    toolContributions: options?.toolContributions,
    selected: selectedModifiers,
    answered: [situational, advantaged].filter(Boolean),
  });
  return {
    formula,
    flavor,
    rollMode,
    placementPlan,
    benefitTerms: targetBenefitTerms(evaluation, contributions),
    resolvedFormula: displayFormula(formula, actor)?.display ?? null,
    keep,
    ...(evaluation.product === 'count' && { contributions }),
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
