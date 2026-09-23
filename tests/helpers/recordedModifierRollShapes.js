/**
 * The RECORDED behaviour of the shipped Foundry 14.365 dice stack for every formula shape a check
 * modifier emits (issue 1118), and the `Roll` double that replays it.
 */

/**
 * Every clamped fragment shape the resolver can emit, as `[fragment, validates, evaluates]` — the
 * verdict `Roll.validate` returned, AND what really happens when the fragment is rolled maximized.
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
  // NON-FINITE, and reachable rather than theoretical.
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
 * Whole check formulas the resolver emits, as `{ label, produce: { policy, ids }, formula, total:
 * [min, max], dice }`.
 *
 * @type {ReadonlyArray<{label: string, produce: {policy: string, ids: string[]}, formula: string,
 * total: readonly [number, number], dice: readonly string[]}>}
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
 * The MEASURED means of the expressions the ranking rules order by, over 40 000 real rolls each,
 * paired with what `reduceRollExpression` computes.
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
  // COUNTING modifiers, which are not an approximation at all: `cs`/`cf`/`df` change the total from
  // a sum of faces to a count of successes, so a face-sum average is simply the wrong quantity.
  ['1d20cs>15', 0.25, 10.35, 'WRONG QUANTITY: counts successes, not faces'],
  ['1d20cf<5', 0.2, 10.35, 'WRONG QUANTITY: counts successes, not faces'],
  ['2d6cs>=5', 0.67, 6.4, 'WRONG QUANTITY: counts successes, not faces'],
  ['1d20df<5', 9.83, 0.75, 'WRONG QUANTITY: counts failures; the `df` keep/drop guard'],
]);
/**
 * Expressions real Foundry's parser REFUSES outright, so no average for them could describe a roll
 * that happens.
 */
export const RECORDED_UNPARSEABLE_EXPRESSIONS = Object.freeze(['1d%', '', '()', '1d20 +']);

/**
 * A `Roll` double that REPLAYS {@link RECORDED_FRAGMENT_VALIDITY} on BOTH surfaces: the static
 * `validate` answers the recorded PARSE verdict, and an instance's `evaluateSync` / `total` answer
 * the recorded EVALUATE one.
 *
 * @param {string[]} [calls] Collects each formula the resolver asked about, so a test can assert
 * the engine was consulted at all — and on which entries.
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

    // `maximize` IS REQUIRED, and that is the double's job rather than pedantry.
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
