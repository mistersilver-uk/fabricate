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

import { evaluateNumericExpression } from '../../../../../systems/checkModifierResolver.js';
import {
  classifyCheckTotal,
  resolveCheckFormulaDisplay,
  resolveForcedOutcome,
  rolledDiceGroups,
} from '../../../../../systems/checkRoll.js';
import { resolveProgressiveAward } from '../../../../../utils/progressiveAward.js';

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
  multipleDieGroups: 'multiple-die-groups',
  dieModifiers: 'die-modifiers',
  nonUnitCount: 'non-unit-count',
  nonIntegerFaces: 'non-integer-faces',
  nonNumericDenomination: 'non-numeric-denomination',
  nonDeterministicRemainder: 'non-deterministic-remainder',
  stringTerm: 'string-term',
  unresolvedRollData: 'unresolved-roll-data',
});

/** A Foundry flavour annotation (`+ 3[Tools]`). Inert label text, never a value. */
const FLAVOUR_SPAN = /\[[^\]]*]/g;

/** The `NdS` substring of an already-validated single-die formula. */
const DIE_SUBSTRING = /\d*d\d+/i;

/** Every `NdS` substring, for the expected-value annotation (which allows N groups). */
const DIE_SUBSTRING_ALL = /(\d*)d(\d+)/gi;

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
 * Refuse the single die term unless it is one unmodified numeric die.
 *
 * @param {object} die The sole dice term.
 * @returns {?{enumerable: false, reason: string}} A refusal, or null when it passes.
 */
function refuseDieShape(die) {
  if (die.modifiers.length > 0) return refuse(ODDS_REASONS.dieModifiers);
  if (!Number.isInteger(die.number) || die.number !== 1) {
    return refuse(ODDS_REASONS.nonUnitCount);
  }
  if (!Number.isInteger(die.faces) || die.faces < 1) {
    return refuse(ODDS_REASONS.nonIntegerFaces);
  }
  if (die.denomination !== `d${die.faces}`) {
    return refuse(ODDS_REASONS.nonNumericDenomination);
  }
  return null;
}

/**
 * Refuse the non-die remainder unless every term of it is deterministic.
 *
 * @param {Array<object>} terms Every parsed term except the die.
 * @returns {?{enumerable: false, reason: string}} A refusal, or null when it passes.
 */
function refuseRemainder(terms) {
  // Determinism first, which decides PRECEDENCE for a remainder carrying both a string term
  // and a rolled one. It is NOT what keeps `1d20 + (2d6)` off the string-term branch —
  // {@link isStringTermLike} does that, by excluding a parenthetical outright — because a
  // DETERMINISTIC parenthetical (`1d20 + (2)`) passes this test and would then be refused
  // as a string term by any looser predicate.
  if (terms.some((term) => term?.isDeterministic !== true)) {
    return refuse(ODDS_REASONS.nonDeterministicRemainder);
  }
  if (terms.some((term) => isStringTermLike(term))) return refuse(ODDS_REASONS.stringTerm);
  return null;
}

/**
 * The deterministic part of the formula, as a number.
 *
 * Read off the RESOLVED display rather than re-walking the parse tree: the display is
 * the `@`-substituted string the simulator itself shows, so the histogram and the
 * readout can never disagree about what the modifiers came to. Flavour spans are lifted
 * out first — a tool named "Anvil d20 of Power" would otherwise contribute a die term
 * out of its own label — and the single validated die is replaced by zero.
 *
 * @param {string} display The `@`-resolved formula.
 * @returns {number} The remainder, or NaN when it does not reduce.
 */
function resolveRemainder(display) {
  const masked = String(display ?? '').replaceAll(FLAVOUR_SPAN, '');
  return evaluateNumericExpression(masked.replace(DIE_SUBSTRING, '0'));
}

/**
 * Decide whether a formula's outcome space can be enumerated for a previewed actor, and
 * with what remainder.
 *
 * The modifier context is deliberately NOT a parameter. After issue 1094
 * {@link resolveCheckFormulaDisplay} APPENDS the resolved modifier term itself, and the
 * formula handed here has already been through `buildPreviewCheckArgs` — which appends
 * it too. Re-passing the context would shift every bucket by the scalar, and a system
 * with an empty catalogue would pass the test vacuously because a zero scalar appends
 * nothing at all.
 *
 * @param {string} formula The PREVIEW formula (modifier term already appended).
 * @param {object|null} actor The previewed actor, or null for "No actor".
 * @param {object} [options] Options.
 * @param {*} [options.Roll] The `Roll` class; defaults to `globalThis.Roll`.
 * @returns {{enumerable: true, faces: number, remainder: number, display: string}
 *   | {enumerable: false, reason: string}} The verdict.
 */
export function describeFormulaEnumerability(formula, actor, { Roll = globalThis.Roll } = {}) {
  // The SAME `Roll` drives the display resolution and the parse. Two engines here would
  // let a test grade the predicate against recorded real-Foundry output while the
  // unresolved-key signal came from somewhere else entirely.
  const display = resolveCheckFormulaDisplay(formula, actor, null, Roll);
  if (!display) return refuse(ODDS_REASONS.noDice);
  // (2) above: the parse cannot see an unresolved `@` key, so this signal — and only
  // this signal — is what detects one.
  if (display.resolved === false) return refuse(ODDS_REASONS.unresolvedRollData);

  const rollData = actor?.getRollData?.() ?? actor?.system ?? {};
  let terms;
  try {
    if (typeof Roll?.parse !== 'function') return refuse(ODDS_REASONS.parseThrew);
    terms = Roll.parse(String(formula), rollData);
  } catch {
    // (1) above. A mid-edit formula is a not-enumerable OUTCOME, never an escaped throw.
    return refuse(ODDS_REASONS.parseThrew);
  }
  if (!Array.isArray(terms)) return refuse(ODDS_REASONS.parseThrew);

  const dice = terms.filter((term) => isDiceTermLike(term));
  if (dice.length > 1) return refuse(ODDS_REASONS.multipleDieGroups);
  if (dice.length === 0) {
    // ORDER MATTERS. `flattenTree` pushes a parenthetical, function or pool term WHOLE,
    // so `max(1d20,5)` and `{1d20,1d12}kh` reach here with no TOP-LEVEL die at all — and
    // answering them "this formula rolls no dice of its own" would be a false statement
    // about a formula that plainly rolls some. A non-deterministic remainder is the
    // accurate reading; `no-dice` is reserved for a formula that really is all arithmetic.
    return refuseRemainder(terms) ?? refuse(ODDS_REASONS.noDice);
  }

  const shapeRefusal = refuseDieShape(dice[0]);
  if (shapeRefusal) return shapeRefusal;

  const remainderRefusal = refuseRemainder(terms.filter((term) => !isDiceTermLike(term)));
  if (remainderRefusal) return remainderRefusal;

  const remainder = resolveRemainder(display.display);
  if (!Number.isFinite(remainder)) return refuse(ODDS_REASONS.nonDeterministicRemainder);

  return { enumerable: true, faces: dice[0].faces, remainder, display: display.display };
}

/**
 * The per-face dice bag, built through the PRODUCTION code path.
 *
 * `resolveForcedOutcome` and `applyTierStepTriggers` both read `data.diceGroups`, and a
 * bag that omits `results` or spells `group` differently makes every natural-20 trigger
 * silently invisible to the histogram — while STILL matching a hand-computed
 * distribution for a check with no triggers. So the shape is not restated here; a
 * one-die roll-shaped object goes through {@link rolledDiceGroups}.
 *
 * @param {number} faces The die's face count.
 * @param {number} face The rolled face.
 * @returns {Array<object>} The dice-group bag for that face.
 */
function diceGroupsForFace(faces, face) {
  return rolledDiceGroups({
    dice: [{ number: 1, faces, total: face, results: [{ result: face, active: true }] }],
  });
}

/**
 * A percentage, to one decimal place, that still sums to 100 across a partition.
 *
 * @param {number} count Faces in this bucket.
 * @param {number} faces Total faces.
 * @returns {number} The percentage.
 */
function percentOf(count, faces) {
  return Math.round((count / faces) * 1000) / 10;
}

/**
 * Bucket every face of an enumerable routed check through the engine's own classifier.
 *
 * @param {object} params Params.
 * @param {number} params.faces The die's face count.
 * @param {number} params.remainder The deterministic remainder.
 * @param {object} params.args The classifier arguments (`type`, `dc`, `comparison`,
 *   both outcome lists, `triggers`, `clampToNearest`, `minOutcomeId`).
 * @returns {Array<{id: string, name: string, success: boolean, count: number,
 *   percent: number}>} One bucket per reachable tier, in the classifier's own tier
 *   order, with zero-probability tiers omitted.
 */
export function enumerateRoutedOdds({ faces, remainder, args }) {
  const buckets = new Map();
  for (let face = 1; face <= faces; face += 1) {
    const total = face + remainder;
    const classified = classifyCheckTotal({
      ...args,
      total,
      diceGroups: diceGroupsForFace(faces, face),
    });
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
    percent: percentOf(bucket.count, faces),
  }));
}

/**
 * Bucket every face of an enumerable pass/fail check.
 *
 * It mirrors {@link runFormulaPassFail}'s own two decisions — a matched forced outcome
 * first, then the comparison — rather than only the comparison, because a trigger that
 * forces a failure on a natural 1 changes the histogram and nothing else here would see
 * it.
 *
 * @param {object} params Params.
 * @param {number} params.faces The die's face count.
 * @param {number} params.remainder The deterministic remainder.
 * @param {object} params.args `{ dc, comparison, triggers }`.
 * @returns {Array<{id: string, name: string, success: boolean, count: number,
 *   percent: number}>} At most two buckets, failure first, zero-probability omitted.
 */
export function enumeratePassFailOdds({ faces, remainder, args }) {
  const tally = { failure: 0, success: 0 };
  for (let face = 1; face <= faces; face += 1) {
    const total = face + remainder;
    const forced = resolveForcedOutcome(args.triggers, {
      total,
      diceGroups: diceGroupsForFace(faces, face),
    });
    const passed = forced
      ? forced.disposition === 'success'
      : args.comparison === 'exceed'
        ? total > args.dc
        : total >= args.dc;
    tally[passed ? 'success' : 'failure'] += 1;
  }
  return ['failure', 'success']
    .filter((key) => tally[key] > 0)
    .map((key) => ({
      id: key,
      name: '',
      success: key === 'success',
      count: tally[key],
      percent: percentOf(tally[key], faces),
    }));
}

/**
 * Bucket every face of an enumerable progressive check by AWARD COUNT.
 *
 * A progressive check has no tiers to land on: its total is a budget spent down an
 * ordered list of result difficulties, so the only outcome a GM can read off it is how
 * many results the roll pays for. The spend is {@link resolveProgressiveAward} — the
 * same loop crafting, salvage and gathering all award through — not a second
 * implementation of the same three award modes.
 *
 * A face that awards nothing is a real outcome (`0 of 4`) and IS listed; a count no face
 * can reach is not, and is omitted.
 *
 * @param {object} params Params.
 * @param {number} params.faces The die's face count.
 * @param {number} params.remainder The deterministic remainder.
 * @param {Array<number>} params.difficulties The record's ordered result difficulties.
 * @param {'equal'|'exceed'|'partial'} [params.awardMode] The check's award mode.
 * @returns {Array<{id: string, awarded: number, of: number, count: number,
 *   percent: number}>} One bucket per reachable award count, ascending.
 */
export function enumerateProgressiveOdds({ faces, remainder, difficulties, awardMode = 'equal' }) {
  const results = (Array.isArray(difficulties) ? difficulties : []).map((difficulty, index) => ({
    index,
    difficulty,
  }));
  const tally = new Map();
  for (let face = 1; face <= faces; face += 1) {
    const { awarded } = resolveProgressiveAward({
      results,
      // The engines normalize the budget before the loop; a negative roll total awards
      // nothing rather than reading as a credit.
      initialRemaining: Math.max(0, face + remainder),
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
      percent: percentOf(count, faces),
    }));
}

/**
 * The expected value of a resolved formula, for the `avg N` annotation beside the
 * formula field.
 *
 * It is DELIBERATELY looser than the enumerability predicate: `avg` is an annotation on
 * the field a GM is typing in, so it answers for every formula that resolves to a
 * number, including the multi-group and modified ones the histogram abstains from. Each
 * `NdS` group contributes its own mean, `N*(S+1)/2`; a keep/drop/explode modifier is not
 * modelled, which is why this is an ANNOTATION and never a bucket.
 *
 * Returns null whenever the formula does not resolve for this actor, which is the same
 * `resolved === false` signal the readout's own warning uses.
 *
 * @param {string} formula The PREVIEW formula (modifier term already appended).
 * @param {object|null} actor The previewed actor.
 * @param {object} [options] Options.
 * @param {*} [options.Roll] The `Roll` class; defaults to `globalThis.Roll`.
 * @returns {?number} The floored expected value, or null.
 */
export function expectedFormulaValue(formula, actor, { Roll = globalThis.Roll } = {}) {
  const display = resolveCheckFormulaDisplay(formula, actor, null, Roll);
  if (!display || display.resolved === false) return null;
  const masked = display.display.replaceAll(FLAVOUR_SPAN, '');
  const averaged = masked.replaceAll(DIE_SUBSTRING_ALL, (match, rawCount, rawFaces) => {
    const count = rawCount === '' ? 1 : Number(rawCount);
    const sides = Number(rawFaces);
    if (!Number.isInteger(count) || !Number.isInteger(sides) || sides < 1) return match;
    return String((count * (sides + 1)) / 2);
  });
  const value = evaluateNumericExpression(averaged);
  return Number.isFinite(value) ? Math.floor(value) : null;
}
