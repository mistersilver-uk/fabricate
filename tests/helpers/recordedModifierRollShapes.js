/**
 * The RECORDED behaviour of the shipped Foundry 14.365 dice stack for every formula shape a
 * check modifier emits (issue 1118), and the `Roll` double that replays it.
 *
 * WHY THIS IS RECORDED RATHER THAN REASONED. Making check modifiers accept dice rests on
 * three claims about Foundry that are not visible from the repository, and this stack has
 * been burned twice by trusting the readable one:
 *
 * 1. `CONFIG.Dice.functions` is `{}` (`client/config.mjs`), so `min`/`max` in a formula fall
 *    through to `Math.min`/`Math.max`.
 * 2. A `FunctionTerm` EVALUATES a dice argument rather than stringifying it
 *    (`client/dice/terms/function.mjs`: `_evaluateAsync` awaits each argument `Roll` and
 *    passes its `product`), and `FunctionTerm#dice` is `this.rolls.flatMap(r => r.dice)`, so
 *    the inner die bubbles up through `Roll#dice` — which is what `rolledDiceGroups`, the
 *    chat tooltip and Dice So Nice all read.
 * 3. `Roll.validate` is NOT a sufficient oracle. `FunctionTerm`'s head is `Expression?` —
 *    OPTIONAL — so `max(, 2)` parses, validates TRUE, and totals `Math.max()` = `-Infinity`.
 *    See `retiredPlaceholderOracle.js`, which records that case for the retired placeholder.
 *
 * HOW IT WAS RECORDED. `client/dice/**` and `client/dice/grammar.pegjs` were extracted from
 * `.foundry-e2e/cache/foundryvtt-14.365.zip`, the grammar compiled with the peggy bundled in
 * that same archive, and `CONFIG.Dice` populated exactly as `client/config.mjs` declares it.
 * Nothing was re-implemented: `Roll`, `RollParser` and every `RollTerm` class are the shipped
 * source. Each formula below was then evaluated 4 000 times and its observed total range and
 * `roll.dice` groups recorded.
 *
 * BOTH SUPPORTED BUILDS AGREE. The same harness was run against
 * `.foundry-e2e/cache/foundryvtt-13.351.zip` — the module's declared minimum — and every row of
 * {@link RECORDED_FRAGMENT_VALIDITY} matches verdict for verdict: `CONFIG.Dice.functions` is
 * `{}` there too, `Math[fn]` is resolved case-sensitively, the 999-result cap and the
 * leading-digit `Constant` rule are identical, `max(, 2)` totals `-Infinity` on both, and
 * `pow(2, 1d10 * 103)` is non-finite maximized on both. So the guard this table grades is not a
 * 14-only fact. Two grammar messages differ (13.351's mentions whitespace) and one behaviour
 * does NOT differ despite that: `2 d 10` is refused on both, so whitespace inside a die term is
 * not a die on either build.
 *
 * This file is a HELPER, not a suite: `tests/helpers/**` is outside the `npm test` glob, so
 * it exports data and factories only.
 */

/**
 * Every clamped fragment shape the resolver can emit, as
 * `[fragment, validates, evaluates]` — the verdict `Roll.validate` returned, AND what really
 * happens when the fragment is rolled maximized.
 *
 * TWO COLUMNS, BECAUSE THEY DISAGREE ON EIGHT ROWS, and that disagreement is the whole reason
 * this table exists. `Roll.validate` is `evaluateSync({strict: false})` and
 * `_evaluateASTSync` SKIPS every non-deterministic node — so on a fragment that ROLLS, which
 * is every fragment the resolver emits, the dice-bearing subtree is never evaluated and no
 * evaluate-time error class is exercised. It is a PARSE oracle.
 *
 * The rows carrying `[true, 'throws']` are the ones doing the work, and each is a
 * DIFFERENT reachable failure a GM can author in free text:
 *
 * - `(MAX(1d4,2))` — `FunctionTerm#function` is `CONFIG.Dice.functions[fn] ?? Math[fn]`, and
 *   `Math.MAX` is `undefined`. Capitalizing a function name is enough.
 * - `(1000d6)` — `You may not evaluate a DiceTerm with more than 999 requested results`.
 *   `(999d6)` is recorded beside it precisely so the boundary is pinned rather than assumed.
 * - `(1d4 + .5)` — the grammar's `Constant` needs a LEADING DIGIT, so `.5` parses as a
 *   `StringTerm` and throws unresolved at evaluate.
 *
 * `max(, 2)` is the third state, `'nonFinite'`: it parses, it evaluates, and it totals
 * `Math.max()` = `-Infinity`, which `Roll#total`'s `Number(this._total) || 0` passes through.
 * That row is why the predicate's finite test is load-bearing rather than decorative.
 *
 * The `[false, 'throws']` rows are grammar refusals. `(1d4[fire)` is the one that earns its
 * place: it REDUCES cleanly (an unterminated flavour contributes no value), so nothing before
 * the engine can refuse it. `(1d4])` does NOT — the reducer rejects it first — so it is
 * recorded as a parse fact and is NOT evidence that the engine guard fires.
 * @type {ReadonlyArray<readonly [string, boolean, 'rolls'|'throws'|'nonFinite']>}
 */
export const RECORDED_FRAGMENT_VALIDITY = Object.freeze([
  ['(1d4)', true, 'rolls'],
  ['(1d8)', true, 'rolls'],
  ['(1d4[fire])', true, 'rolls'],
  ['({1d6,1d8}kh1)', true, 'rolls'],
  ['(1d4 + 2)', true, 'rolls'],
  ['(2d20kh1)', true, 'rolls'],
  ['(2)', true, 'rolls'],
  ['(1d6x)', true, 'rolls'],
  ['(2d10r1)', true, 'rolls'],
  ['min(max((1d8), -1), 6)', true, 'rolls'],
  ['max((1d8), 2)', true, 'rolls'],
  ['min((1d8), 6)', true, 'rolls'],
  ['min(max((1d8), 0), 0)', true, 'rolls'],
  ['max((1d8), -1)', true, 'rolls'],
  ['min((1d4), 2.5)', true, 'rolls'],
  ['min(max((1d4 + 2), 1), 9)', true, 'rolls'],
  ['(pow(1d4,2))', true, 'rolls'],
  ['(sqrt(1d4))', true, 'rolls'],
  ['(clamp(1d8,1,6))', true, 'rolls'],
  ['(999d6)', true, 'rolls'],
  // Grammar refusals.
  ['(1d4])', false, 'throws'],
  ['(1d4[fire)', false, 'throws'],
  ['(1d4))', false, 'throws'],
  ['()', false, 'throws'],
  ['(1d20 +)', false, 'throws'],
  // PARSE-CLEAN, EVALUATE-FATAL. `Roll.validate` cannot see any of these.
  ['(MAX(1d4,2))', true, 'throws'],
  ['(Min(1d4,2))', true, 'throws'],
  ['(FLOOR(1d8))', true, 'throws'],
  ['(Abs(1d4))', true, 'throws'],
  ['(1000d6)', true, 'throws'],
  ['(1d4 + .5)', true, 'throws'],
  ['min(max((MAX(1d4,2)), -1), 6)', true, 'throws'],
  // NON-FINITE, and reachable rather than theoretical. `pow(2, 1d10 * 103)` has a FINITE mean
  // (2^566.5, about 3.4e170) so the reducer values it happily, and a maximized total of 2^1030 =
  // `Infinity`. `Roll#total` is `Number(this._total) || 0`, which passes a non-finite number
  // straight through, so NOTHING THROWS and only the finite test refuses it.
  //
  // Its CLAMPED sibling is finite and IS accepted, which is what makes the test precise rather
  // than blunt: `min(max(…, -1), 6)` really does contain it, and a guard that refused anything
  // mentioning `pow` would fail that half.
  ['(pow(2, 1d10 * 103))', true, 'nonFinite'],
  ['min(max((pow(2, 1d10 * 103)), -1), 6)', true, 'rolls'],
  // The empty-head trap, kept because it is the shape `Roll.validate` is famous for accepting.
  ['max(, 2)', true, 'nonFinite'],
]);

/** The fragments `Roll.validate` accepts but the engine cannot actually roll. */
export const VALIDATE_ONLY_HOLES = Object.freeze(
  RECORDED_FRAGMENT_VALIDITY.filter(([, validates, evaluates]) => validates && evaluates !== 'rolls')
);

/**
 * Whole check formulas the resolver emits, as
 * `{ label, produce: { policy, ids }, formula, total: [min, max], dice }`.
 *
 * `produce` IS THE MIRROR GUARD. Without it this table was a list of strings a test could
 * assert shape properties of forever while the resolver emitted something else entirely; a row
 * nothing produced would have passed. `tests/check-modifier-dice.test.js` drives the resolver
 * with each row's `produce` and asserts the emitted formula EQUALS `formula`, so a row that
 * stops being reachable fails rather than rots.
 *
 * `total` is the observed range over 4 000 real evaluations and `dice` is `roll.dice` mapped
 * to `NdS` in order. Two properties are load-bearing and are asserted from this data rather
 * than described in prose:
 *
 * - THE CLAMP BITES. `1d20 + min(max((1d8), -1), 6)[Modifiers]` observed `[2, 26]`: the base
 *   `1d20` spans 1-20 and the modifier contributes at most 6, never the 8 an unclamped `1d8`
 *   would. An unclamped emit would have observed 28.
 * - THE DICE ARE VISIBLE. Every rolling modifier's die appears in `roll.dice`, AFTER the base
 *   formula's dice, so the `diceGroup` trigger DSL's existing group indices are unchanged and
 *   Dice So Nice animates the modifier.
 * @type {ReadonlyArray<{label: string, produce: {policy: string, ids: string[]},
 *   formula: string, total: readonly [number, number], dice: readonly string[]}>}
 */
export const RECORDED_CHECK_FORMULAS = Object.freeze([
  {
    label: 'flat and rolling modifiers under addAll',
    produce: { policy: 'addAll', ids: ['flat', 'die'] },
    formula: '1d20 + 3[Modifiers] + (1d4)[Modifiers]',
    total: [5, 27],
    dice: ['1d20', '1d4'],
  },
  {
    label: 'three rolling modifiers, one of them clamped and one a pool',
    produce: { policy: 'addAll', ids: ['die', 'bounded', 'pool'] },
    formula:
      '1d20 + (1d4)[Modifiers] + min(max((1d8), -1), 6)[Modifiers] + ({1d6,1d8}kh1)[Modifiers]',
    total: [5, 38],
    dice: ['1d20', '1d4', '1d8', '1d6', '1d8'],
  },
  {
    label: 'a floor and a cap, each emitting ONE function',
    produce: { policy: 'addAll', ids: ['floored', 'capped'] },
    formula: '1d20 + max((1d8), 2)[Modifiers] + min((1d8), 6)[Modifiers]',
    total: [4, 34],
    dice: ['1d20', '1d8', '1d8'],
  },
  {
    label: "an expression carrying the GM's own flavour",
    produce: { policy: 'addAll', ids: ['flavoured'] },
    formula: '1d20 + (1d4[fire])[Modifiers]',
    total: [2, 24],
    dice: ['1d20', '1d4'],
  },
  {
    label: 'a roll-data key substituted inside a dice expression',
    produce: { policy: 'addAll', ids: ['keyed'] },
    formula: '1d20 + (1d4 + 2)[Modifiers]',
    total: [4, 26],
    dice: ['1d20', '1d4'],
  },
  {
    label: 'a clamped die alone: the cap holds and the die still shows',
    produce: { policy: 'addAll', ids: ['bounded'] },
    formula: '1d20 + min(max((1d8), -1), 6)[Modifiers]',
    total: [2, 26],
    dice: ['1d20', '1d8'],
  },
]);

/**
 * The MEASURED means of the expressions the ranking rules order by, over 40 000 real rolls
 * each, paired with what `reduceRollExpression` computes.
 *
 * The `tolerance` column is the point of the table, and the `kind` column grades it. An
 * `exact` row is asserted with EQUALITY, not with its tolerance: a plain `NdS` is exact, and
 * so is a keep/drop die, because the order-statistics walk was added when the plain sum put
 * `2d20kh1` at 21 against a measured 13.86 — an advantage-shaped modifier that would have won
 * `highest` against anything.
 *
 * The rest are approximations, and the wide rows are the ones the module's own header claimed
 * were "well under one point" and are not: `1d20cs>15` computes 10.5 against a measured 0.25,
 * because `cs`/`cf`/`df` change what the total MEANS. Recording the measurement is what keeps
 * that claim a fact rather than a hope.
 * EVERY ROW ROLLS. A dice-free expression has no mean to measure, so `min(3, 7, 5)` and its
 * kind live in the reducer suite's own exact table rather than here — which is also what lets
 * `rollsDice` be asserted against this table wholesale.
 * @type {ReadonlyArray<readonly [string, number, number, string]>}
 */
export const RECORDED_EXPRESSION_MEANS = Object.freeze([
  ['1d4', 2.5, 0.05, 'exact'],
  ['d20', 10.48, 0.1, 'exact'],
  ['2d6', 7.0, 0.1, 'exact'],
  ['1d8 + 2', 6.49, 0.1, 'exact'],
  ['2d6 + 1d4 - 1', 8.49, 0.15, 'exact'],
  ['1d20 * 2', 21.04, 0.3, 'exact'],
  ['floor(1d8 / 2)', 2.0, 0.1, 'exact'],
  ['(2)d6', 7.01, 0.1, 'exact'],
  ['1dF', -0.01, 0.05, 'exact'],
  ['1dc', 0.5, 0.05, 'exact'],
  ['2d20kh1', 13.86, 0.15, 'exact: order statistics'],
  ['4d6dl1', 12.28, 0.15, 'exact: order statistics'],
  ['3d6kh2', 8.46, 0.15, 'exact: order statistics'],
  ['5d10dl2', 21.48, 0.2, 'exact: order statistics'],
  ['2d20kl1', 7.16, 0.15, 'exact: order statistics'],
  ['4d6dh1', 8.76, 0.15, 'exact: order statistics'],
  ['{1d6,1d8}', 7.99, 0.15, 'exact'],
  // The documented approximations, each with its MEASURED gap rather than an asserted one.
  ['min(max(1d8, -1), 6)', 4.12, 0.45, 'approximate: a nonlinear function of the mean'],
  ['max(1d4, 2)', 2.75, 0.35, 'approximate: a nonlinear function of the mean'],
  ['clamp(1d8, 1, 6)', 4.14, 0.45, 'approximate: a nonlinear function of the mean'],
  ['pow(1d4, 2)', 7.5, 1.35, 'approximate: a nonlinear function of the mean'],
  ['sqrt(1d4)', 1.54, 0.1, 'approximate: a nonlinear function of the mean'],
  ['{1d6,1d8}kh1', 5.23, 0.8, 'approximate: pool members are not identically distributed'],
  ['{1d6,1d8,1d10}kh2', 11.09, 1.15, 'approximate: pool members are not identically distributed'],
  ['{1d6,1d8}kl1', 2.76, 0.8, 'approximate: pool members are not identically distributed'],
  ['3dFkh1', 0.66, 0.75, 'approximate: a non-numeric denomination has no order statistics'],
  ['1d6x', 4.22, 0.8, 'approximate: an exploding die is unbounded'],
  ['2d10r1', 11.92, 1.0, 'approximate: a reroll modifier is not modelled'],
  ['2d6min2', 7.33, 0.4, 'approximate: a minimum-face modifier is not modelled'],
  ['2d6max4', 6.0, 1.05, 'approximate: a maximum-face modifier is not modelled'],
  // COUNTING modifiers, which are not an approximation at all: `cs`/`cf`/`df` change the
  // total from a sum of faces to a count of successes, so a face-sum average is simply the
  // wrong quantity. Recorded so the claim is a measurement rather than a hope.
  ['1d20cs>15', 0.25, 10.35, 'WRONG QUANTITY: counts successes, not faces'],
  ['1d20cf<5', 0.2, 10.35, 'WRONG QUANTITY: counts successes, not faces'],
  ['2d6cs>=5', 0.67, 6.4, 'WRONG QUANTITY: counts successes, not faces'],
  ['1d20df<5', 9.83, 0.75, 'WRONG QUANTITY: counts failures; the `df` keep/drop guard'],
]);
/**
 * Expressions real Foundry's parser REFUSES outright, so no average for them could describe a
 * roll that happens. `1d%` is here because it is the obvious guess for a percentile die and
 * `Roll.parse('1d%')` throws: the grammar's faces production is
 * `[a-z]i / Parenthetical / Constant` and `%` is none of them.
 * @type {ReadonlyArray<string>}
 */
export const RECORDED_UNPARSEABLE_EXPRESSIONS = Object.freeze(['1d%', '', '()', '1d20 +']);

/**
 * A `Roll` double that REPLAYS {@link RECORDED_FRAGMENT_VALIDITY} on BOTH surfaces: the
 * static `validate` answers the recorded PARSE verdict, and an instance's `evaluateSync` /
 * `total` answer the recorded EVALUATE one.
 *
 * Both halves are needed, and a double carrying only `validate` is what let the first version
 * of the engine guard ship with a hole: a test could then assert nothing about the difference
 * between "parses" and "rolls", which is the entire subject.
 *
 * Outside the recorded set it THROWS rather than guessing, which is deliberate: a permissive
 * fallback is how a fragment shape nobody measured comes to be graded green. A suite that
 * needs a new shape records it against the shipped stack first.
 *
 * @param {string[]} [calls] Collects each formula the resolver asked about, so a test can
 *   assert the engine was consulted at all — and on which entries.
 */
export function recordedModifierRoll(calls = []) {
  const verdicts = new Map(
    RECORDED_FRAGMENT_VALIDITY.map(([fragment, validates, evaluates]) => [
      fragment,
      { validates, evaluates },
    ])
  );
  const recordedFor = (formula) => {
    const verdict = verdicts.get(formula);
    if (!verdict) {
      throw new Error(
        `recordedModifierRoll: no recorded 14.365 verdict for "${formula}" — measure it ` +
          'against the shipped dice stack and add it to RECORDED_FRAGMENT_VALIDITY'
      );
    }
    return verdict;
  };

  return class {
    #verdict;

    constructor(formula) {
      calls.push(formula);
      this.#verdict = recordedFor(formula);
    }

    static validate(formula) {
      return recordedFor(formula).validates;
    }

    // `maximize` IS REQUIRED, and that is the double's job rather than pedantry. Every
    // recorded `evaluates` verdict was measured under `{ maximize: true }`, which renders
    // every term deterministic so `_evaluateASTSync` skips nothing. Without it the walk skips
    // the dice-bearing subtree and the recorded verdict is simply not a fact about that call —
    // which is precisely how `Roll.validate` (`evaluateSync({strict: false})`) came to be
    // mistaken for an evaluate oracle.
    evaluateSync(options) {
      if (options?.maximize !== true) {
        throw new Error(
          'recordedModifierRoll: the recorded verdicts hold only under { maximize: true } — ' +
            'an unmaximized evaluateSync skips every non-deterministic node and proves nothing'
        );
      }
      if (this.#verdict.evaluates === 'throws') {
        throw new Error('recordedModifierRoll: this fragment throws at evaluate on 14.365');
      }
      return this;
    }

    // `Roll#total` is `Number(this._total) || 0`, so a `-Infinity` total reaches the caller as
    // a number. The `nonFinite` row reproduces that rather than throwing.
    get total() {
      return this.#verdict.evaluates === 'nonFinite' ? Number.NEGATIVE_INFINITY : 1;
    }

    static replaceFormulaData(formula, data, { missing } = {}) {
      return String(formula).replaceAll(/@([\w.]+)/g, (_match, path) => {
        const value = path
          .split('.')
          .reduce(
            (node, key) => (node === null || node === undefined ? undefined : node[key]),
            data
          );
        return value === undefined || value === null ? (missing ?? `@${path}`) : String(value);
      });
    }
  };
}
