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
 * This file is a HELPER, not a suite: `tests/helpers/**` is outside the `npm test` glob, so
 * it exports data and factories only.
 */

/**
 * Every clamped fragment shape the resolver can emit, with the verdict real Foundry's
 * `Roll.validate` returned for it.
 *
 * The `false` rows are the ones that matter. A GM's expression is free text, so `1d4]` is
 * authorable; before issue 1118 it reduced to 0 and contributed nothing, and appending it as
 * dice would instead throw inside `new Roll(...)` — a ROLLED, and therefore consuming,
 * failure. `resolveCatalogueEntry` validates each assembled fragment for exactly this, so
 * these rows are the evidence that the guard has something to catch.
 * @type {ReadonlyArray<readonly [string, boolean]>}
 */
export const RECORDED_FRAGMENT_VALIDITY = Object.freeze([
  ['(1d4)', true],
  ['(1d8)', true],
  ['(1d4[fire])', true],
  ['({1d6,1d8}kh1)', true],
  ['(1d4 + 2)', true],
  ['(2d20kh1)', true],
  ['min(max((1d8), -1), 6)', true],
  ['max((1d8), 2)', true],
  ['min((1d8), 6)', true],
  ['min(max((1d8), 0), 0)', true],
  ['max((1d8), -1)', true],
  ['min((1d4), 2.5)', true],
  ['(1d4])', false],
  ['(1d4[fire)', false],
  ['(1d4))', false],
  ['()', false],
  ['(1d20 +)', false],
]);

/**
 * Whole check formulas the resolver emits, as
 * `[label, formula, { total: [min, max], dice: string[] }]`.
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
 * @type {ReadonlyArray<readonly [string, string, {total: readonly [number, number], dice: readonly string[]}]>}
 */
export const RECORDED_CHECK_FORMULAS = Object.freeze([
  [
    'flat and rolling modifiers under addAll',
    '1d20 + 3[Modifiers] + (1d4)[Modifiers]',
    { total: [5, 27], dice: ['1d20', '1d4'] },
  ],
  [
    'three rolling modifiers, one of them clamped and one a pool',
    '1d20 + (1d4)[Modifiers] + min(max((1d8), -1), 6)[Modifiers] + ({1d6,1d8}kh1)[Modifiers]',
    { total: [5, 38], dice: ['1d20', '1d4', '1d8', '1d6', '1d8'] },
  ],
  [
    'a floor and a cap, each emitting ONE function',
    '1d20 + max((1d8), 2)[Modifiers] + min((1d8), 6)[Modifiers]',
    { total: [4, 34], dice: ['1d20', '1d8', '1d8'] },
  ],
  [
    "an expression carrying the GM's own flavour",
    '1d20 + (1d4[fire])[Modifiers]',
    { total: [2, 24], dice: ['1d20', '1d4'] },
  ],
  [
    'a roll-data key substituted inside a dice expression',
    '1d20 + (1d4 + 2)[Modifiers]',
    { total: [4, 26], dice: ['1d20', '1d4'] },
  ],
  [
    'a clamped die alone: the cap holds and the die still shows',
    '1d20 + min(max((1d8), -1), 6)[Modifiers]',
    { total: [2, 26], dice: ['1d20', '1d8'] },
  ],
]);

/**
 * The MEASURED means of the expressions the ranking rules order by, over 40 000 real rolls
 * each, paired with what `reduceRollExpression` computes.
 *
 * The `tolerance` column is the point of the table. A plain `NdS` is exact; a keep/drop die
 * is exact too, because the order-statistics walk was added when the plain sum put `2d20kh1`
 * at 21 against a measured 13.86 — an advantage-shaped modifier that would have won `highest`
 * against anything. The wide-tolerance rows are the documented approximations, and recording
 * the measurement is what keeps them honest.
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
  // The documented approximations. `min`/`max` over a random variable is Jensen's
  // inequality; a pool's members are not identically distributed; and a non-keep/drop die
  // modifier changes the distribution in a way only a dice engine reproduces.
  ['min(max(1d8, -1), 6)', 4.12, 0.5, 'approximate: min/max applied to the mean'],
  ['max(1d4, 2)', 2.75, 0.3, 'approximate: min/max applied to the mean'],
  ['{1d6,1d8}kh1', 5.22, 0.8, 'approximate: pool members are not identically distributed'],
  ['1d6x', 4.19, 0.8, 'approximate: an exploding die is unbounded'],
  ['2d10r1', 11.92, 1.0, 'approximate: a reroll modifier is not modelled'],
  ['2d6min2', 7.33, 0.4, 'approximate: a minimum-face modifier is not modelled'],
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
 * A `Roll` double whose `validate` REPLAYS {@link RECORDED_FRAGMENT_VALIDITY}.
 *
 * Outside the recorded set it throws rather than guessing, which is deliberate: a permissive
 * fallback is how a fragment shape nobody measured comes to be graded green by a test. A
 * suite that needs a new shape records it first.
 *
 * @param {string[]} [calls] Collects each formula passed to `validate`, so a test can assert
 *   the resolver consulted the engine at all.
 */
export function recordedModifierRoll(calls = []) {
  const verdicts = new Map(RECORDED_FRAGMENT_VALIDITY);
  return class {
    static validate(formula) {
      calls.push(formula);
      if (!verdicts.has(formula)) {
        throw new Error(
          `recordedModifierRoll: no recorded 14.365 verdict for "${formula}" — measure it ` +
            'against the shipped dice stack and add it to RECORDED_FRAGMENT_VALIDITY'
        );
      }
      return verdicts.get(formula);
    }

    static replaceFormulaData(formula, data, { missing } = {}) {
      return String(formula).replaceAll(/@([\w.]+)/g, (_match, path) => {
        const value = path
          .split('.')
          .reduce((node, key) => (node === null || node === undefined ? undefined : node[key]), data);
        return value === undefined || value === null ? (missing ?? `@${path}`) : String(value);
      });
    }
  };
}
