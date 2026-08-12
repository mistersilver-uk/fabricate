/**
 * The Checks Studio's per-outcome odds enumerator (issue 1097).
 *
 * There is nothing random here. A check whose formula is ONE unmodified single die plus
 * a deterministic remainder has a finite, fully knowable outcome space, so the histogram
 * ENUMERATES that die's faces and buckets each one through the SAME classifier the
 * engine resolves a real roll with ({@link classifyCheckTotal} for a routed check,
 * {@link resolveForcedOutcome} plus the comparison for a pass/fail one,
 * {@link resolveProgressiveAward} for a progressive one). No `Math.random`, no sampling,
 * no second model of what a tier means.
 *
 * ## The predicate is a POSITIVE WHITELIST over `Roll.parse`, not a string scan
 *
 * A string scan admits formulas face enumeration cannot describe. `2d6` is ONE die group
 * with eleven outcomes on a triangular distribution rather than six uniform faces;
 * Foundry declares seventeen die modifiers, of which `1d6x` has unbounded support,
 * `1d20r1` reweights, `1d20min2`/`max` clamp and `cs`/`cf`/`ms` change what `total` even
 * means (`Die#total` subtracts `marginSuccess`); `1d(1d4)` leaves `number`/`faces`
 * `undefined` until evaluated; and the grammar admits the non-numeric denominations
 * `1df` (a `FateDie`, which reports `faces: 3` and `denomination: 'f'`) and `1dc`.
 *
 * So the formula must parse to EXACTLY ONE die term with `modifiers.length === 0`,
 * `number === 1`, an integer `faces >= 1` and a numeric denomination, with every
 * remaining term deterministic and no `StringTerm` present. Anything else abstains with
 * a stated reason: a histogram that lies is worse than one that abstains.
 *
 * ## Three properties of `Roll.parse` are load-bearing, and are handled rather than assumed
 *
 * 1. **It throws.** `Roll.parse` calls `foundry.dice.RollGrammar.parse` with no `try`
 *    (`client/dice/roll.mjs`, verified against 14.365), and the compiled peggy grammar
 *    raises a `SyntaxError` — so every intermediate keystroke of a formula a GM is still
 *    typing (`1d20 +`, `1d20 + (`, `max(1d20,`) throws straight out of any predicate
 *    built on it. The call is WRAPPED and a thrown parse is a not-enumerable OUTCOME.
 * 2. **`missing: "0"` blinds it.** `Roll.parse` runs
 *    `replaceFormulaData(formula, data, { missing: "0" })` FIRST, so an `@` key the
 *    previewed actor lacks becomes the literal `0` and parses cleanly as a numeric term.
 *    The unresolved-roll-data refusal therefore reads
 *    {@link resolveCheckFormulaDisplay}'s `resolved === false` — the same
 *    `missing: 'NaN'` signal the simulator's own warning uses — and never the parse.
 * 3. **Determinism must RECURSE, and a `StringTerm` lies.** `RollParser.flattenTree`
 *    only recurses into `node.class === "Node"` (`client/dice/parser.mjs`), so a
 *    parenthetical, function or pool term is pushed WHOLE: `Roll.parse('1d20 + (2d6)')`
 *    yields exactly one top-level die term with hidden randomness inside it, and a
 *    top-level class scan would call that enumerable and draw a histogram that lies.
 *    Determinism is therefore judged by Foundry's own recursive `term.isDeterministic`
 *    (`ParentheticalTerm` → `Roll.create(this.term).isDeterministic`;
 *    `FunctionTerm`/`PoolTerm` → `terms.every(...)`; `DiceTerm` → `false`). But
 *    `StringTerm#isDeterministic` returns `true` for an unresolvable string and then
 *    THROWS at evaluate (`allowStrings` defaults false), so a `StringTerm` is refused
 *    explicitly.
 *
 * Every refusal carries a discriminated REASON CODE, so a predicate implemented as
 * `return false` is distinguishable from a correct one and the panel can say WHY.
 *
 * The module holds no Foundry global of its own: `Roll` is a parameter defaulting to
 * `globalThis.Roll`, and a missing or throwing `parse` yields the not-enumerable result
 * rather than an escaped exception — which is what keeps a View Lab capture run from
 * failing whole on this one panel.
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
 * Why a formula is not enumerable. Discriminated so each refusal is testable on its own
 * terms rather than on a shared "not enumerable" observable.
 *
 * `nonNumericDenomination` is not in issue 1097's original nine. It was added because
 * the recorded 14.365 source disproves the assumption behind folding `1df` into
 * `nonIntegerFaces`: `FateDie`'s constructor assigns `termData.faces = 3` and `Coin`'s
 * assigns `2`, so both report a perfectly integral `faces` and are distinguished ONLY by
 * their denomination (`DiceTerm#denomination` returns `constructor.DENOMINATION`, while
 * `Die` overrides it to `` `d${faces}` ``). Reporting "the faces are not an integer" for
 * a die whose faces are 3 would be a false statement in the panel.
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
 *
 * It is deliberately NOT an {@link ODDS_REASONS} member: those nine all say the formula
 * cannot be enumerated, and this one says the opposite — the formula is fine, and the
 * missing input is the GM's own sandbox order, which one field in the Preview-as card
 * fills. Folding it in would let a reader (and a test) mistake "the GM has not run an
 * experiment yet" for "this check cannot be charted".
 * @type {string}
 */
export const SANDBOX_ABSENT = 'no-sandbox-order';

/**
 * The largest joint outcome space this will walk.
 *
 * The enumeration is a cartesian product, so it grows multiplicatively: a `1d20` check with a
 * `1d8` modifier is 160 assignments and `1d100 + 1d100` is 10 000. The cap REFUSES rather
 * than sampling, because a sampled histogram is the approximation this whole module exists to
 * avoid — and it refuses with a stated reason, so the panel says why instead of going blank.
 */
const MAX_ENUMERATED_OUTCOMES = 50_000;

/** Foundry's non-numeric denominations, whose faces are not values (`1df`, `1dc`). */
const NON_NUMERIC_DENOMINATION = /^[fc]$/i;

const refuse = (reason) => ({ enumerable: false, reason });

/**
 * A term that carries a dice term's shape, whatever class it is.
 *
 * Deliberately structural: the repository holds ZERO `foundry.dice.*` references and the
 * View Lab has no such namespace at all, so `instanceof foundry.dice.terms.Die` has no
 * headless fallback and would make this predicate untestable outside a live client.
 *
 * @param {object} term A parsed roll term.
 * @returns {boolean} True when the term looks like a `DiceTerm`.
 */
function isDiceTermLike(term) {
  if (!term || typeof term !== 'object') return false;
  return 'faces' in term && 'number' in term && Array.isArray(term.modifiers);
}

/**
 * A `StringTerm`, which reports `isDeterministic: true` for an unresolvable string and
 * then throws at evaluate.
 *
 * `typeof term.term === 'string'` ALONE is not this test, and getting that wrong would
 * mis-report the one case issue 1097 names explicitly: `ParentheticalTerm` also declares
 * a string `term` (`client/dice/terms/parenthetical.mjs`, recorded from 14.365), so
 * `1d20 + (2d6)` would refuse as `string-term` rather than as the
 * `non-deterministic-remainder` it is. A parenthetical is told apart by the two fields
 * only it carries — an own `roll` slot and `isIntermediate = true` — and the determinism
 * test runs FIRST regardless, so a non-deterministic parenthetical is answered before
 * this predicate is consulted at all.
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
 * Refuse the non-die remainder for a STRING TERM only.
 *
 * It used to refuse every non-deterministic term, and that is exactly the rule this change
 * lifts. `RollParser.flattenTree` pushes a parenthetical, function or pool term WHOLE, so a
 * blanket determinism test refused every formula with a die inside brackets — which, since a
 * check modifier may roll and its bounds are expressed IN the formula
 * (`min(max((1d8), -1), 6)[Modifiers]`), is now every system carrying a bounded rolling
 * modifier. Those formulas are perfectly enumerable; they are simply not "one die plus a flat
 * number", and abstaining on them left the panel blank for a feature that had just shipped.
 *
 * What survives is the `StringTerm` refusal, because that is the one shape whose
 * `isDeterministic` LIES: it answers `true` for a string Foundry then throws on at evaluate.
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
 * IT DOES NOT SCAN THE STRING FOR `NdS`, and that is the whole point. Such a scan splits on
 * whitespace, operators, parentheses and commas, so `min(max((1d8), -1), 6)[Modifiers]` hands
 * back the clamp's BOUND ARGUMENTS — `-1` and `6` — as though they were flat addends of the
 * roll. The enumerated domain then comes out shifted by `+5` and two faces too wide against
 * the true `1d20` plus a clamped `1d8`, and the histogram it draws is monotone, correctly
 * shaped, plausibly labelled and wrong. That is the worst thing this surface can do, because
 * nothing about it looks broken.
 *
 * So the dice are found by the SAME recursive-descent reader that reduces the expression —
 * {@link reduceRollExpression}'s `dieValue` hook — which knows a function argument from a
 * top-level addend because it parsed both. One reader, two questions.
 *
 * That reader also asserts END OF INPUT, which is the other half of trusting it: it refuses a
 * reduction it could not fully consume, so a shape it does not understand cannot quietly
 * reduce through a prefix of itself.
 *
 * @param {string} display The `@`-resolved formula, flavour and all.
 * @returns {{dice: Array<{faces: number}>} | {enumerable: false, reason: string}} The plan.
 */
function planDice(display) {
  const dice = [];
  let refusal = null;
  const probe = reduceRollExpression(display, {
    dieValue: ({ count, faces, modifiers }) => {
      // ONE unmodified numeric die per group, which is the only shape whose faces are uniform
      // and equally likely. Foundry declares seventeen die modifiers and every one of them
      // either reweights the faces, unbounds the support, or changes what `total` means, so a
      // modified pool is refused rather than charted as though it were flat.
      if (modifiers !== '') refusal ??= ODDS_REASONS.dieModifiers;
      else if (count !== 1) refusal ??= ODDS_REASONS.nonUnitCount;
      else if (NON_NUMERIC_DENOMINATION.test(faces)) {
        // `FateDie` reports `faces: 3` and `Coin` reports `2`, so both are perfectly integral
        // and are told apart from a numbered die by DENOMINATION alone. Reporting "the faces
        // are not an integer" for either would be a false statement about the die.
        refusal ??= ODDS_REASONS.nonNumericDenomination;
      } else if (!Number.isInteger(Number(faces)) || Number(faces) < 1) {
        refusal ??= ODDS_REASONS.nonIntegerFaces;
      } else {
        dice.push({ faces: Number(faces) });
        // The probe pass only has to prove the expression REDUCES; the mean is as good a
        // stand-in as any single face for that, and no caller ever sees this value.
        return (Number(faces) + 1) / 2;
      }
      return NaN;
    },
  });
  if (refusal) return refuse(refusal);
  // A finite value is the reader's own statement that it consumed the WHOLE expression and
  // that every part of it reduced — the end-of-input assertion included.
  if (!Number.isFinite(probe.value)) return refuse(ODDS_REASONS.nonDeterministicRemainder);
  if (dice.length === 0) return refuse(ODDS_REASONS.noDice);
  return { dice };
}

/**
 * Walk the joint face space, reducing the expression once per assignment.
 *
 * EXACT, never sampled and never approximated: every assignment is equally likely, so the
 * bucket counts are the real distribution — including through a clamp, where the reduction
 * `min(max((3), -1), 6)` answers 3 and `min(max((8), -1), 6)` answers 6. That is what makes a
 * bounded `1d8` modifier chart as the `1..6` it actually contributes rather than as the
 * `1..8` its die names.
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
      // Positional, and the reader's order is deterministic, so the k-th call is the same die
      // on every pass.
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
 * Decide whether a formula's outcome space can be enumerated for a previewed actor, and
 * with what remainder.
 *
 * IT ENUMERATES THE FORMULA THE RUNNER WILL ACTUALLY ROLL, not the one the GM authored,
 * and the difference is a whole check-modifier scalar. `buildPreviewCheckArgs` hands the
 * runner an AUTHORED formula plus a `craftingModifier` context, and `evaluateCheckRoll`
 * appends the resolved scalar itself — so a histogram built on the authored string spans
 * `1..20` while the readout beside it rolls `5..24`, on the same screen, for the same
 * check. Issue 1097 shipped exactly that, and nothing published was wrong only because
 * every View Lab check resolved a zero scalar.
 *
 * So the context IS a parameter, and the append is {@link resolveRolledFormula} — the
 * SAME derivation `evaluateCheckRoll` composes its rolled formula from, and the same one
 * {@link resolveCheckFormulaDisplay} resolves. There is one implementation of "what this
 * check rolls"; a second would be free to drift, which is the defect above.
 *
 * There is no double application: the appended string is resolved for DISPLAY with the
 * context omitted, exactly as `evaluateCheckRoll` does, so the scalar lands once.
 *
 * @param {string} formula The AUTHORED preview formula.
 * @param {object|null} actor The previewed actor, or null for "No actor".
 * @param {object} [options] Options.
 * @param {*} [options.Roll] The `Roll` class; defaults to `globalThis.Roll`.
 * @param {object|null} [options.craftingModifier] The check-modifier context the runner
 *   is being handed. Omit only where the runner is handed none.
 * @returns {{enumerable: true, faces: number, remainder: number, display: string}
 *   | {enumerable: false, reason: string}} The verdict.
 */
export function describeFormulaEnumerability(
  formula,
  actor,
  { Roll = globalThis.Roll, craftingModifier = null } = {}
) {
  const rolledFormula = resolveRolledFormula(formula, actor, craftingModifier, Roll);
  // The SAME `Roll` drives the display resolution and the parse. Two engines here would
  // let a test grade the predicate against recorded real-Foundry output while the
  // unresolved-key signal came from somewhere else entirely.
  const display = resolveCheckFormulaDisplay(rolledFormula, actor, null, Roll);
  if (!display) return refuse(ODDS_REASONS.noDice);
  // (2) above: the parse cannot see an unresolved `@` key, so this signal — and only
  // this signal — is what detects one.
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

  // The one shape whose `isDeterministic` lies. Everything else about the formula is decided
  // by the reader below, which — unlike `flattenTree`'s top-level term list — sees inside a
  // parenthetical, a function and a pool.
  const stringRefusal = refuseRemainder(terms.filter((term) => !isDiceTermLike(term)));
  if (stringRefusal) return stringRefusal;

  // The ONE fact the reader cannot state, kept for its own sake rather than as a second
  // opinion: `1d(1d4)` puts an EXPRESSION where the faces go, so Foundry answers with a die
  // whose `faces` is `undefined` until it is evaluated, and the reader — whose faces
  // production is digits or a configured denomination — simply does not recognise the token
  // as a die at all. Left to it, that formula would be reported as an expression that does
  // not reduce, which is true and unhelpful. Nothing else is checked here.
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
    // Every assignment reduced during the probe pass, so a non-finite total here means the
    // reduction is not a function of the faces alone — a division by a die that rolled a
    // zero, say. Refusing the WHOLE histogram beats charting the assignments that worked.
    return refuse(ODDS_REASONS.nonDeterministicRemainder);
  }

  return {
    enumerable: true,
    dice: plan.dice,
    // `faces` survives for the single-die reading the rail heading names (`all 20 faces`); a
    // multi-die formula has a COMBINATION count instead, which is a different sentence.
    faces: plan.dice.length === 1 ? plan.dice[0].faces : null,
    combinations,
    outcomes,
    display: display.display,
  };
}

/**
 * The per-assignment dice bag, built through the PRODUCTION code path.
 *
 * `resolveForcedOutcome` and `applyTierStepTriggers` both read `data.diceGroups`, and a bag
 * that omits `results` or spells `group` differently makes every natural-20 trigger silently
 * invisible to the histogram — while STILL matching a hand-computed distribution for a check
 * with no triggers. So the shape is not restated here; a roll-shaped object goes through
 * {@link rolledDiceGroups}.
 *
 * EVERY die is in the bag, a rolling check modifier's included, because that is what the
 * engine's own bag holds: modifier terms are APPENDED, so the authored dice keep the group
 * ids they always had and a trigger keyed on group 0 still means the same die.
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
 * Bucket every enumerated outcome of a pass/fail check.
 *
 * It mirrors {@link runFormulaPassFail}'s own two decisions — a matched forced outcome
 * first, then the comparison — rather than only the comparison, because a trigger that
 * forces a failure on a natural 1 changes the histogram and nothing else here would see
 * it.
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
 * A progressive check has no tiers to land on: its total is a budget spent down an
 * ordered list of result difficulties, so the only outcome a GM can read off it is how
 * many results the roll pays for. The spend is {@link resolveProgressiveAward} — the
 * same loop crafting, salvage and gathering all award through — not a second
 * implementation of the same three award modes.
 *
 * An outcome that awards nothing is a real outcome (`0 of 4`) and IS listed; a count no
 * outcome can reach is not, and is omitted.
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
      // The engines normalize the budget before the loop; a negative roll total awards
      // nothing rather than reading as a credit.
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
