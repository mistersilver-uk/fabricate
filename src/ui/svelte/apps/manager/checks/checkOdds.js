/**
 * The Checks Studio's per-outcome odds enumerator. There is nothing random here: a check whose
 * formula is ONE unmodified single die plus a deterministic remainder has a finite outcome
 * space, so the histogram ENUMERATES that die's faces and buckets each one through the SAME
 * classifier the engine resolves a real roll with. No `Math.random`, no sampling, no second
 * model of what a tier means.
 *
 * The POSITIVE WHITELIST over `Roll.parse` that decides enumerability, the formulas a string
 * scan would wrongly admit, and the three properties of `Roll.parse` handled below rather than
 * assumed are stated in `openspec/specs/ui-integration/spec.md` → "Per-outcome odds histogram";
 * the numbered references in this file are to that list:
 *
 *   1. `Roll.parse` THROWS on a mid-edit formula, so the call is wrapped and a thrown parse is a
 *      not-enumerable OUTCOME.
 *   2. Its `missing: "0"` turns an unresolved `@` key into a literal `0` that parses cleanly, so
 *      the refusal reads {@link resolveCheckFormulaDisplay}'s `resolved === false`, not the parse.
 *   3. Determinism must RECURSE, `flattenTree` pushing a parenthetical, function or pool term
 *      WHOLE — and `StringTerm#isDeterministic` LIES, so it is refused explicitly.
 *
 * Every refusal carries a discriminated REASON CODE, so a predicate implemented as
 * `return false` is distinguishable from a correct one. `Roll` is a parameter defaulting to
 * `globalThis.Roll`, and a missing or throwing `parse` yields the not-enumerable result rather
 * than an escaped exception, which keeps a View Lab capture run from failing on this panel.
 */

import {
  classifyCheckTotal,
  resolveCheckFormulaDisplay,
  resolveForcedOutcome,
  resolveRolledFormula,
  rolledDiceGroups,
} from '../../../../../systems/checkRoll.js';
import { resolveProgressiveAward } from '../../../../../utils/progressiveAward.js';
import { reduceRollExpression } from '../../../../../utils/rollExpressionAverage.js';

/**
 * Why a formula is not enumerable, discriminated so each refusal is testable on its own terms.
 * `nonNumericDenomination` is separate from `nonIntegerFaces` because `FateDie` and `Coin` both
 * report integral faces and are distinguished ONLY by denomination, so "the faces are not an
 * integer" would be false in the panel.
 * @type {Readonly<Record<string, string>>}
 */
export const ODDS_REASONS = Object.freeze({
  parseThrew: 'parse-threw',
  noDice: 'no-dice',
  tooManyOutcomes: 'too-many-outcomes',
  dieModifiers: 'die-modifiers',
  nonUnitCount: 'non-unit-count',
  nonIntegerFaces: 'non-integer-faces',
  nonNumericDenomination: 'non-numeric-denomination',
  nonDeterministicRemainder: 'non-deterministic-remainder',
  stringTerm: 'string-term',
  unresolvedRollData: 'unresolved-roll-data',
});

/**
 * Why a PROGRESSIVE histogram has nothing to draw even though the formula is enumerable.
 * Deliberately NOT an {@link ODDS_REASONS} member: those say the formula cannot be enumerated,
 * where this says the opposite — the missing input is the GM's own sandbox order.
 * @type {string}
 */
export const SANDBOX_ABSENT = 'no-sandbox-order';

/** The largest joint outcome space this will walk. The enumeration is a cartesian product, so
 *  the cap REFUSES with a stated reason rather than sampling. */
const MAX_ENUMERATED_OUTCOMES = 50_000;

/** Foundry's non-numeric denominations, whose faces are not values (`1df`, `1dc`). */
const NON_NUMERIC_DENOMINATION = /^[fc]$/i;

const refuse = (reason) => ({ enumerable: false, reason });

/**
 * A term that carries a dice term's shape, whatever class it is. Deliberately STRUCTURAL: the
 * View Lab has no `foundry.dice.*` namespace, so an `instanceof` test would make this predicate
 * untestable outside a live client.
 *
 * @param {object} term A parsed roll term.
 * @returns {boolean} True when the term looks like a `DiceTerm`.
 */
function isDiceTermLike(term) {
  if (!term || typeof term !== 'object') return false;
  return 'faces' in term && 'number' in term && Array.isArray(term.modifiers);
}

/**
 * A `StringTerm`, which reports `isDeterministic: true` for an unresolvable string and then
 * throws at evaluate. `typeof term.term === 'string'` ALONE is not this test: `ParentheticalTerm`
 * also declares a string `term`, so `1d20 + (2d6)` would refuse as `string-term` rather than as
 * the `non-deterministic-remainder` it is, and is told apart by the two fields only it carries.
 *
 * @param {object} term A parsed roll term.
 * @returns {boolean} True when the term is a string term.
 */
function isStringTermLike(term) {
  if (!term || typeof term !== 'object') return false;
  if (isDiceTermLike(term)) return false;
  if (term.isIntermediate === true || 'roll' in term) return false;
  return typeof term.term === 'string';
}

/**
 * Refuse the non-die remainder for a STRING TERM only, and NOT for every non-deterministic term:
 * `flattenTree` pushes a parenthetical, function or pool term WHOLE, so a blanket determinism
 * test refuses every formula with a die inside brackets — which, a bounded rolling modifier
 * being expressed as `min(max((1d8), -1), 6)`, is every system carrying one. What survives is
 * the `StringTerm` refusal, the one shape whose `isDeterministic` LIES.
 *
 * @param {Array<object>} terms Every parsed term except the dice.
 * @returns {?{enumerable: false, reason: string}} A refusal, or null when it passes.
 */
function refuseRemainder(terms) {
  if (terms.some((term) => isStringTermLike(term))) return refuse(ODDS_REASONS.stringTerm);
  return null;
}

/**
 * The dice this formula rolls, in READING ORDER, or the reason it cannot be enumerated.
 *
 * IT DOES NOT SCAN THE STRING FOR `NdS`, and that is the whole point: such a scan hands back a
 * clamp's BOUND ARGUMENTS as though they were flat addends, and the histogram it draws is
 * monotone, correctly shaped, plausibly labelled and wrong — the worst thing this surface can
 * do, because nothing about it looks broken. So the dice are found by the SAME
 * recursive-descent reader that reduces the expression, which knows a function argument from a
 * top-level addend because it parsed both, and which asserts END OF INPUT.
 *
 * @param {string} display The `@`-resolved formula, flavour and all.
 * @returns {{dice: Array<{faces: number}>} | {enumerable: false, reason: string}} The plan.
 */
function planDice(display) {
  const dice = [];
  let refusal = null;
  const probe = reduceRollExpression(display, {
    dieValue: ({ count, faces, modifiers }) => {
      // ONE unmodified numeric die per group, the only shape whose faces are uniform: every
      // Foundry die modifier reweights, unbounds or changes what `total` means.
      if (modifiers !== '') refusal ??= ODDS_REASONS.dieModifiers;
      else if (count !== 1) refusal ??= ODDS_REASONS.nonUnitCount;
      else if (NON_NUMERIC_DENOMINATION.test(faces)) {
        // `FateDie` and `Coin` report integral faces and are told apart by DENOMINATION
        // alone, so "the faces are not an integer" would be false about either.
        refusal ??= ODDS_REASONS.nonNumericDenomination;
      } else if (!Number.isInteger(Number(faces)) || Number(faces) < 1) {
        refusal ??= ODDS_REASONS.nonIntegerFaces;
      } else {
        dice.push({ faces: Number(faces) });
        // The probe pass only has to prove the expression REDUCES, and no caller sees this.
        return (Number(faces) + 1) / 2;
      }
      return NaN;
    },
  });
  if (refusal) return refuse(refusal);
  // A finite value is the reader's own statement that it consumed the WHOLE expression.
  if (!Number.isFinite(probe.value)) return refuse(ODDS_REASONS.nonDeterministicRemainder);
  if (dice.length === 0) return refuse(ODDS_REASONS.noDice);
  return { dice };
}

/**
 * Walk the joint face space, reducing the expression once per assignment. EXACT, never sampled:
 * every assignment is equally likely, so the bucket counts are the real distribution, including
 * through a clamp — which is what charts a bounded `1d8` modifier as the `1..6` it contributes.
 *
 * @param {string} display The `@`-resolved formula.
 * @param {Array<{faces: number}>} dice The dice, in reading order.
 * @returns {Array<{total: number, diceGroups: Array<object>}>} One outcome per assignment.
 */
function enumerateOutcomes(display, dice) {
  const outcomes = [];
  const assignment = dice.map(() => 1);
  for (;;) {
    let ordinal = 0;
    const { value } = reduceRollExpression(display, {
      // Positional, and the reader's order is deterministic, so the k-th call is one die.
      dieValue: () => assignment[ordinal++],
    });
    outcomes.push({ total: value, diceGroups: diceGroupsFor(dice, assignment) });
    // An odometer over the faces, least-significant die last.
    let carry = dice.length - 1;
    while (carry >= 0 && assignment[carry] === dice[carry].faces) {
      assignment[carry] = 1;
      carry -= 1;
    }
    if (carry < 0) return outcomes;
    assignment[carry] += 1;
  }
}

/**
 * Decide whether a formula's outcome space can be enumerated for a previewed actor.
 *
 * IT ENUMERATES THE FORMULA THE RUNNER WILL ACTUALLY ROLL, not the one the GM authored:
 * `evaluateCheckRoll` appends the check-modifier scalar itself, so a histogram built on the
 * authored string spans `1..20` while the readout beside it rolls `5..24`. So the context IS a
 * parameter and the append is {@link resolveRolledFormula}, the SAME derivation
 * `evaluateCheckRoll` composes its rolled formula from. There is no double application: the
 * appended string is resolved for DISPLAY with the context omitted, so the scalar lands once.
 *
 * @param {string} formula The AUTHORED preview formula.
 * @param {object|null} actor The previewed actor, or null for "No actor".
 * @param {object} [options] Options.
 * @param {*} [options.Roll] The `Roll` class; defaults to `globalThis.Roll`.
 * @param {object|null} [options.craftingModifier] The check-modifier context the runner is
 *   being handed. Omit only where the runner is handed none.
 * @returns {{enumerable: true, faces: number, remainder: number, display: string}
 *   | {enumerable: false, reason: string}} The verdict.
 */
export function describeFormulaEnumerability(
  formula,
  actor,
  { Roll = globalThis.Roll, craftingModifier = null } = {}
) {
  const rolledFormula = resolveRolledFormula(formula, actor, craftingModifier, Roll);
  // The SAME `Roll` drives the display resolution and the parse: two engines would let a test
  // grade the predicate against recorded output while the unresolved-key signal came elsewhere.
  const display = resolveCheckFormulaDisplay(rolledFormula, actor, null, Roll);
  if (!display) return refuse(ODDS_REASONS.noDice);
  // (2) above: the parse cannot see an unresolved `@` key, so this signal alone detects one.
  if (display.resolved === false) return refuse(ODDS_REASONS.unresolvedRollData);

  const rollData = actor?.getRollData?.() ?? actor?.system ?? {};
  let terms;
  try {
    if (typeof Roll?.parse !== 'function') return refuse(ODDS_REASONS.parseThrew);
    terms = Roll.parse(String(rolledFormula), rollData);
  } catch {
    // (1) above. A mid-edit formula is a not-enumerable OUTCOME, never an escaped throw.
    return refuse(ODDS_REASONS.parseThrew);
  }
  if (!Array.isArray(terms)) return refuse(ODDS_REASONS.parseThrew);

  // The one shape whose `isDeterministic` lies. Everything else is decided by the reader below,
  // which — unlike `flattenTree`'s top-level term list — sees inside a parenthetical.
  const stringRefusal = refuseRemainder(terms.filter((term) => !isDiceTermLike(term)));
  if (stringRefusal) return stringRefusal;

  // The ONE fact the reader cannot state: `1d(1d4)` puts an EXPRESSION where the faces go, so
  // the reader does not recognise the token as a die at all and would report it as an expression
  // that does not reduce, which is true and unhelpful.
  const nonIntegerFaces = terms
    .filter((term) => isDiceTermLike(term))
    .some((die) => !Number.isInteger(die.faces));
  if (nonIntegerFaces) return refuse(ODDS_REASONS.nonIntegerFaces);

  const plan = planDice(display.display);
  if (plan.enumerable === false) return plan;

  const combinations = plan.dice.reduce((product, die) => product * die.faces, 1);
  if (combinations > MAX_ENUMERATED_OUTCOMES) return refuse(ODDS_REASONS.tooManyOutcomes);

  const outcomes = enumerateOutcomes(display.display, plan.dice);
  if (outcomes.some((outcome) => !Number.isFinite(outcome.total))) {
    // Every assignment reduced during the probe, so a non-finite total means the reduction is
    // not a function of the faces alone. Refusing the WHOLE histogram beats charting part.
    return refuse(ODDS_REASONS.nonDeterministicRemainder);
  }

  return {
    enumerable: true,
    dice: plan.dice,
    // `faces` survives for the single-die reading the rail heading names; a multi-die formula
    // has a COMBINATION count instead, which is a different sentence.
    faces: plan.dice.length === 1 ? plan.dice[0].faces : null,
    combinations,
    outcomes,
    display: display.display,
  };
}

/**
 * The per-assignment dice bag, built through the PRODUCTION code path: a bag that omits
 * `results` or spells `group` differently makes every natural-20 trigger silently invisible to
 * the histogram while STILL matching a hand-computed distribution for a trigger-free check.
 * EVERY die is in it, a rolling modifier's included, because that is what the engine's own bag
 * holds — modifier terms are APPENDED, so the authored dice keep their group ids.
 *
 * @param {Array<{faces: number}>} dice The dice, in reading order.
 * @param {Array<number>} assignment The face each die shows.
 * @returns {Array<object>} The dice-group bag for that assignment.
 */
function diceGroupsFor(dice, assignment) {
  return rolledDiceGroups({
    dice: dice.map((die, index) => ({
      number: 1,
      faces: die.faces,
      total: assignment[index],
      results: [{ result: assignment[index], active: true }],
    })),
  });
}

/**
 * A percentage, to one decimal place, that still sums to 100 across a partition.
 *
 * @param {number} count Outcomes in this bucket.
 * @param {number} total Outcomes in the whole enumerated space.
 * @returns {number} The percentage.
 */
function percentOf(count, total) {
  return Math.round((count / total) * 1000) / 10;
}

/**
 * Bucket every enumerated outcome of a routed check through the engine's own classifier.
 *
 * @param {object} params Params.
 * @param {Array<{total: number, diceGroups: Array<object>}>} params.outcomes The enumerated
 *   outcome space, one entry per equally-likely assignment of faces.
 * @param {object} params.args The classifier arguments (`type`, `dc`, `comparison`,
 *   both outcome lists, `triggers`, `clampToNearest`, `minOutcomeId`).
 * @returns {Array<{id: string, name: string, success: boolean, count: number,
 *   percent: number}>} One bucket per reachable tier, in the classifier's own tier
 *   order, with zero-probability tiers omitted.
 */
export function enumerateRoutedOdds({ outcomes, args }) {
  const buckets = new Map();
  for (const outcome of outcomes) {
    const classified = classifyCheckTotal({ ...args, ...outcome });
    const id = classified.matched?.id ?? '';
    const existing = buckets.get(id);
    if (existing) {
      existing.count += 1;
      continue;
    }
    buckets.set(id, {
      id,
      name: classified.matched?.name ?? '',
      success: classified.success === true,
      count: 1,
    });
  }
  return [...buckets.values()].map((bucket) => ({
    ...bucket,
    percent: percentOf(bucket.count, outcomes.length),
  }));
}

/**
 * Bucket every enumerated outcome of a pass/fail check, mirroring {@link runFormulaPassFail}'s
 * own two decisions — a matched forced outcome first, then the comparison — because a trigger
 * that forces a failure on a natural 1 changes the histogram and nothing else here would see it.
 *
 * @param {object} params Params.
 * @param {Array<{total: number, diceGroups: Array<object>}>} params.outcomes The enumerated
 *   outcome space.
 * @param {object} params.args `{ dc, comparison, triggers }`.
 * @returns {Array<{id: string, name: string, success: boolean, count: number,
 *   percent: number}>} At most two buckets, failure first, zero-probability omitted.
 */
export function enumeratePassFailOdds({ outcomes, args }) {
  const tally = { failure: 0, success: 0 };
  for (const outcome of outcomes) {
    const forced = resolveForcedOutcome(args.triggers, outcome);
    const passed = forced
      ? forced.disposition === 'success'
      : args.comparison === 'exceed'
        ? outcome.total > args.dc
        : outcome.total >= args.dc;
    tally[passed ? 'success' : 'failure'] += 1;
  }
  return ['failure', 'success']
    .filter((key) => tally[key] > 0)
    .map((key) => ({
      id: key,
      name: '',
      success: key === 'success',
      count: tally[key],
      percent: percentOf(tally[key], outcomes.length),
    }));
}

/**
 * Bucket every enumerated outcome of a progressive check by AWARD COUNT.
 *
 * A progressive check has no tiers to land on: its total is a budget spent down an ordered list
 * of result difficulties, and the spend is {@link resolveProgressiveAward}, the same loop all
 * three activities award through. An outcome that awards nothing is a real outcome and IS
 * listed; a count no outcome can reach is omitted.
 *
 * @param {object} params Params.
 * @param {Array<{total: number, diceGroups: Array<object>}>} params.outcomes The enumerated
 *   outcome space.
 * @param {Array<number>} params.difficulties The record's ordered result difficulties.
 * @param {'equal'|'exceed'|'partial'} [params.awardMode] The check's award mode.
 * @returns {Array<{id: string, awarded: number, of: number, count: number,
 *   percent: number}>} One bucket per reachable award count, ascending.
 */
export function enumerateProgressiveOdds({ outcomes, difficulties, awardMode = 'equal' }) {
  const results = (Array.isArray(difficulties) ? difficulties : []).map((difficulty, index) => ({
    index,
    difficulty,
  }));
  const tally = new Map();
  for (const outcome of outcomes) {
    const { awarded } = resolveProgressiveAward({
      results,
      // The engines normalize the budget first: a negative total awards nothing, not a credit.
      initialRemaining: Math.max(0, outcome.total),
      costFor: (result) => Number(result.difficulty),
      awardMode,
      invalidCost: 'skip',
    });
    tally.set(awarded.length, (tally.get(awarded.length) ?? 0) + 1);
  }
  return [...tally]
    .toSorted(([left], [right]) => left - right)
    .map(([awarded, count]) => ({
      id: `award-${awarded}`,
      awarded,
      of: results.length,
      count,
      percent: percentOf(count, outcomes.length),
    }));
}
