/**
 * `Roll.parse` output RECORDED from a real Foundry build (14.365), not modelled.
 *
 * WHY IT IS CHECKED IN. Issue 1097's odds predicate is a positive whitelist over
 * `Roll.parse`, and the View Lab installs a `Roll` DOUBLE that must agree with the real
 * thing about the shape of every term. Grading either against a double the same author
 * wrote is circular: a double LOOSER than core produces false passes, which is the
 * direction nothing notices under `npm test` — `Roll.validate`'s own lab double already
 * accepts formulas real Foundry rejects (issue 1094).
 *
 * HOW IT WAS PRODUCED. Foundry's own `client/dice/grammar.pegjs` was compiled with the
 * `peggy` copy Foundry ships in its `node_modules`, and `client/dice/roll.mjs`,
 * `client/dice/parser.mjs` and `client/dice/terms/*.mjs` were loaded VERBATIM out of the
 * 14.365 release archive (`.foundry-e2e/cache/foundryvtt-14.365.zip`) against a minimal
 * `foundry.utils` / `CONFIG.Dice` host. `Roll.parse(formula, data)` was then called with
 * {@link RECORDED_ROLL_DATA} and its terms serialised field by field. Nothing below is
 * hand-written. A {@link RECORDED_UNDEFINED} marker preserves the distinction between a
 * key that is ABSENT and one whose value is `undefined`, which is exactly the distinction
 * `1d(1d4)` turns on.
 *
 * FOUR RECORDED FACTS THIS FILE EXISTS TO PIN, each of which a plausible model gets wrong:
 *
 * 1. `1d20 + @prof` and `1d20 + @nope` parse to the IDENTICAL term list. `Roll.parse`
 *    substitutes with `missing: "0"` FIRST, so an unresolved key is invisible to it and
 *    the refusal has to come from `resolveCheckFormulaDisplay`'s `missing: 'NaN'` signal.
 * 2. `1df` is a `FateDie` with `faces: 3` — an INTEGER — and `1dc` a `Coin` with
 *    `faces: 2`. They are told apart from a numeric die by DENOMINATION alone (`Die`
 *    overrides it to `` `d${faces}` ``; `DiceTerm` returns its class constant), so "the
 *    faces are not an integer" would be a false statement about either. Issue 1097's
 *    original nine reason codes assumed otherwise; this recording is why there is a tenth.
 * 3. `1d20 + (2d6)` yields exactly ONE top-level die plus a `ParentheticalTerm` reporting
 *    `isDeterministic: false` — `RollParser.flattenTree` does not recurse into it — while
 *    `1d20 + prof` yields a `StringTerm` reporting `isDeterministic: TRUE` for a string
 *    that then throws at evaluate. Note BOTH carry a string `term` field, so a predicate
 *    that tells them apart by that field alone answers the parenthetical with the wrong
 *    reason.
 * 4. A mid-edit formula THROWS a `peg$SyntaxError` out of `Roll.parse`, which does not
 *    `try`. `max(1d20,5)` does not throw and is not a die group either: it is one
 *    `FunctionTerm`, because the flattener pushes a function term whole.
 *
 * `tests/helpers/**` is outside the `npm test` glob, so this file adds no test count.
 */

/**
 * The recording. Keyed by the exact formula string passed to `Roll.parse`.
 *
 * @type {Readonly<Record<string, {threw: boolean, error?: string, message?: string,
 *   terms?: Array<object>}>>}
 */
export const RECORDED_ROLL_PARSE_14_365 = Object.freeze({
  '1d20 + 5': {
    threw: false,
    terms: [
      {
        class: 'Die',
        faces: 20,
        number: 1,
        denomination: 'd20',
        modifiers: [],
        roll: '@@undefined',
        isIntermediate: false,
        isDeterministic: false,
      },
      { class: 'OperatorTerm', isIntermediate: false, isDeterministic: true },
      { class: 'NumericTerm', number: 5, isIntermediate: false, isDeterministic: true },
    ],
  },
  '1d12 + 2': {
    threw: false,
    terms: [
      {
        class: 'Die',
        faces: 12,
        number: 1,
        denomination: 'd12',
        modifiers: [],
        roll: '@@undefined',
        isIntermediate: false,
        isDeterministic: false,
      },
      { class: 'OperatorTerm', isIntermediate: false, isDeterministic: true },
      { class: 'NumericTerm', number: 2, isIntermediate: false, isDeterministic: true },
    ],
  },
  '1d20 + @prof': {
    threw: false,
    terms: [
      {
        class: 'Die',
        faces: 20,
        number: 1,
        denomination: 'd20',
        modifiers: [],
        roll: '@@undefined',
        isIntermediate: false,
        isDeterministic: false,
      },
      { class: 'OperatorTerm', isIntermediate: false, isDeterministic: true },
      { class: 'NumericTerm', number: 3, isIntermediate: false, isDeterministic: true },
    ],
  },
  '1d20 + 3[Tools] + 2[Modifiers]': {
    threw: false,
    terms: [
      {
        class: 'Die',
        faces: 20,
        number: 1,
        denomination: 'd20',
        modifiers: [],
        roll: '@@undefined',
        isIntermediate: false,
        isDeterministic: false,
      },
      { class: 'OperatorTerm', isIntermediate: false, isDeterministic: true },
      { class: 'NumericTerm', number: 3, isIntermediate: false, isDeterministic: true },
      { class: 'OperatorTerm', isIntermediate: false, isDeterministic: true },
      { class: 'NumericTerm', number: 2, isIntermediate: false, isDeterministic: true },
    ],
  },
  '2d6': {
    threw: false,
    terms: [
      {
        class: 'Die',
        faces: 6,
        number: 2,
        denomination: 'd6',
        modifiers: [],
        roll: '@@undefined',
        isIntermediate: false,
        isDeterministic: false,
      },
    ],
  },
  '2d20': {
    threw: false,
    terms: [
      {
        class: 'Die',
        faces: 20,
        number: 2,
        denomination: 'd20',
        modifiers: [],
        roll: '@@undefined',
        isIntermediate: false,
        isDeterministic: false,
      },
    ],
  },
  '2d20kh1': {
    threw: false,
    terms: [
      {
        class: 'Die',
        faces: 20,
        number: 2,
        denomination: 'd20',
        modifiers: ['kh1'],
        roll: '@@undefined',
        isIntermediate: false,
        isDeterministic: false,
      },
    ],
  },
  '1d6x': {
    threw: false,
    terms: [
      {
        class: 'Die',
        faces: 6,
        number: 1,
        denomination: 'd6',
        modifiers: ['x'],
        roll: '@@undefined',
        isIntermediate: false,
        isDeterministic: false,
      },
    ],
  },
  '1d20r1': {
    threw: false,
    terms: [
      {
        class: 'Die',
        faces: 20,
        number: 1,
        denomination: 'd20',
        modifiers: ['r1'],
        roll: '@@undefined',
        isIntermediate: false,
        isDeterministic: false,
      },
    ],
  },
  '1d20min2': {
    threw: false,
    terms: [
      {
        class: 'Die',
        faces: 20,
        number: 1,
        denomination: 'd20',
        modifiers: ['min2'],
        roll: '@@undefined',
        isIntermediate: false,
        isDeterministic: false,
      },
    ],
  },
  '1d(1d4)': {
    threw: false,
    terms: [
      {
        class: 'Die',
        faces: '@@undefined',
        number: 1,
        denomination: 'dundefined',
        modifiers: [],
        roll: '@@undefined',
        isIntermediate: false,
        isDeterministic: false,
      },
    ],
  },
  '1df': {
    threw: false,
    terms: [
      {
        class: 'FateDie',
        faces: 3,
        number: 1,
        denomination: 'f',
        modifiers: [],
        roll: '@@undefined',
        isIntermediate: false,
        isDeterministic: false,
      },
    ],
  },
  '1dc': {
    threw: false,
    terms: [
      {
        class: 'Coin',
        faces: 2,
        number: 1,
        denomination: 'c',
        modifiers: [],
        roll: '@@undefined',
        isIntermediate: false,
        isDeterministic: false,
      },
    ],
  },
  '1d20 + 1d6': {
    threw: false,
    terms: [
      {
        class: 'Die',
        faces: 20,
        number: 1,
        denomination: 'd20',
        modifiers: [],
        roll: '@@undefined',
        isIntermediate: false,
        isDeterministic: false,
      },
      { class: 'OperatorTerm', isIntermediate: false, isDeterministic: true },
      {
        class: 'Die',
        faces: 6,
        number: 1,
        denomination: 'd6',
        modifiers: [],
        roll: '@@undefined',
        isIntermediate: false,
        isDeterministic: false,
      },
    ],
  },
  '5 + 3': {
    threw: false,
    terms: [
      { class: 'NumericTerm', number: 5, isIntermediate: false, isDeterministic: true },
      { class: 'OperatorTerm', isIntermediate: false, isDeterministic: true },
      { class: 'NumericTerm', number: 3, isIntermediate: false, isDeterministic: true },
    ],
  },
  '1d20 + (2d6)': {
    threw: false,
    terms: [
      {
        class: 'Die',
        faces: 20,
        number: 1,
        denomination: 'd20',
        modifiers: [],
        roll: '@@undefined',
        isIntermediate: false,
        isDeterministic: false,
      },
      { class: 'OperatorTerm', isIntermediate: false, isDeterministic: true },
      {
        class: 'ParentheticalTerm',
        term: '2d6',
        roll: '@@undefined',
        isIntermediate: true,
        isDeterministic: false,
      },
    ],
  },
  '1d20 + prof': {
    threw: false,
    terms: [
      {
        class: 'Die',
        faces: 20,
        number: 1,
        denomination: 'd20',
        modifiers: [],
        roll: '@@undefined',
        isIntermediate: false,
        isDeterministic: false,
      },
      { class: 'OperatorTerm', isIntermediate: false, isDeterministic: true },
      { class: 'StringTerm', term: 'prof', isIntermediate: false, isDeterministic: true },
    ],
  },
  '1d20 + (2)': {
    threw: false,
    terms: [
      {
        class: 'Die',
        faces: 20,
        number: 1,
        denomination: 'd20',
        modifiers: [],
        roll: '@@undefined',
        isIntermediate: false,
        isDeterministic: false,
      },
      { class: 'OperatorTerm', isIntermediate: false, isDeterministic: true },
      {
        class: 'ParentheticalTerm',
        term: '2',
        roll: '@@undefined',
        isIntermediate: true,
        isDeterministic: true,
      },
    ],
  },
  'max(1d20,5)': {
    threw: false,
    terms: [{ class: 'FunctionTerm', isIntermediate: true, isDeterministic: false }],
  },
  // A BOUNDED ROLLING CHECK MODIFIER, verbatim from `buildModifierRollFragment` (issue 1118)
  // and appended by `appendCheckModifierRollTerms`. This is the shape every system with a
  // clamped rolling modifier authors, and the recording is what pins the fact the enumerator
  // turns on: `flattenTree` pushes the whole `min(...)` as ONE `FunctionTerm`, so the dice
  // inside it are invisible to any top-level term scan.
  // The SAME preview formula with a rolling modifier appended instead of a flat one. Both
  // arms of `checkPreview.test.js`'s catalogue case are recorded, so neither is graded
  // against a modelled parse.
  '1d20 + 3[Tools]': {
    threw: false,
    terms: [
      {
        class: 'Die',
        faces: 20,
        number: 1,
        denomination: 'd20',
        modifiers: [],
        roll: '@@undefined',
        isIntermediate: false,
        isDeterministic: false,
      },
      { class: 'OperatorTerm', isIntermediate: false, isDeterministic: true },
      { class: 'NumericTerm', number: 3, isIntermediate: false, isDeterministic: true },
    ],
  },
  '1d20 + 3[Tools] + min(max((1d8), -1), 6)[Modifiers]': {
    threw: false,
    terms: [
      {
        class: 'Die',
        faces: 20,
        number: 1,
        denomination: 'd20',
        modifiers: [],
        roll: '@@undefined',
        isIntermediate: false,
        isDeterministic: false,
      },
      { class: 'OperatorTerm', isIntermediate: false, isDeterministic: true },
      { class: 'NumericTerm', number: 3, isIntermediate: false, isDeterministic: true },
      { class: 'OperatorTerm', isIntermediate: false, isDeterministic: true },
      { class: 'FunctionTerm', isIntermediate: true, isDeterministic: false },
    ],
  },
  '1d20 + min(max((1d8), -1), 6)[Modifiers]': {
    threw: false,
    terms: [
      {
        class: 'Die',
        faces: 20,
        number: 1,
        denomination: 'd20',
        modifiers: [],
        roll: '@@undefined',
        isIntermediate: false,
        isDeterministic: false,
      },
      { class: 'OperatorTerm', isIntermediate: false, isDeterministic: true },
      { class: 'FunctionTerm', isIntermediate: true, isDeterministic: false },
    ],
  },
  '1d20 +': { threw: true, error: 'peg$SyntaxError' },
  '1d20 + (': { threw: true, error: 'peg$SyntaxError' },
  'max(1d20,': { threw: true, error: 'peg$SyntaxError' },
  '1d20 + @nope': {
    threw: false,
    terms: [
      {
        class: 'Die',
        faces: 20,
        number: 1,
        denomination: 'd20',
        modifiers: [],
        roll: '@@undefined',
        isIntermediate: false,
        isDeterministic: false,
      },
      { class: 'OperatorTerm', isIntermediate: false, isDeterministic: true },
      { class: 'NumericTerm', number: 0, isIntermediate: false, isDeterministic: true },
    ],
  },
  'floor(1d20 / 2)': {
    threw: false,
    terms: [{ class: 'FunctionTerm', isIntermediate: true, isDeterministic: false }],
  },
  // A `PoolTerm` carries `modifiers` but NO `faces`/`number`, which is why a structural
  // dice-term predicate has to test all three rather than the modifier array alone.
  '{1d20,1d12}kh': {
    threw: false,
    terms: [
      { class: 'PoolTerm', modifiers: ['kh'], isIntermediate: false, isDeterministic: false },
    ],
  },
  '1d20 + 2 * 3': {
    threw: false,
    terms: [
      {
        class: 'Die',
        faces: 20,
        number: 1,
        denomination: 'd20',
        modifiers: [],
        roll: '@@undefined',
        isIntermediate: false,
        isDeterministic: false,
      },
      { class: 'OperatorTerm', isIntermediate: false, isDeterministic: true },
      { class: 'NumericTerm', number: 2, isIntermediate: false, isDeterministic: true },
      { class: 'OperatorTerm', isIntermediate: false, isDeterministic: true },
      { class: 'NumericTerm', number: 3, isIntermediate: false, isDeterministic: true },
    ],
  },
});

/** The roll data the recording was made with. */
export const RECORDED_ROLL_DATA = Object.freeze({ prof: 3, abilities: { str: { mod: 2 } } });

/** The marker standing in for a key whose recorded VALUE is `undefined`. */
export const RECORDED_UNDEFINED = '@@undefined';

/**
 * Materialise one recorded term list into real objects, restoring `undefined` values.
 *
 * @param {Array<object>} terms Recorded terms.
 * @returns {Array<object>} Terms with every marker restored to a real `undefined`.
 */
export function materialiseRecordedTerms(terms) {
  return terms.map((term) =>
    Object.fromEntries(
      Object.entries(term).map(([key, value]) => [
        key,
        value === RECORDED_UNDEFINED ? undefined : value,
      ])
    )
  );
}

/**
 * A `Roll` stand-in that REPLAYS the recording instead of parsing.
 *
 * This is what lets the predicate be graded against real Foundry output in a headless
 * suite: `describeFormulaEnumerability` sees exactly the terms 14.365 produced, including
 * the thrown `SyntaxError` for a half-typed formula. The two string statics are the
 * lab's own, unchanged, because they are pure string work no dice engine is involved in.
 *
 * @param {object} [overrides] Extra statics — e.g. a `parse` that is absent or throws.
 * @returns {object} A `Roll`-shaped object.
 */
export function recordedRollDouble(overrides = {}) {
  return {
    replaceFormulaData(formula, data = {}, { missing = 'NaN' } = {}) {
      return String(formula).replaceAll(/@([\w.]+)/g, (_match, path) => {
        const value = String(path)
          .split('.')
          .reduce((current, part) => (current == null ? undefined : current[part]), data);
        return value === undefined || value === null ? missing : String(value);
      });
    },
    validate(formula) {
      return !/NaN|@/.test(String(formula));
    },
    parse(formula) {
      const entry = RECORDED_ROLL_PARSE_14_365[String(formula)];
      if (!entry) throw new Error(`no recorded Roll.parse output for "${formula}"`);
      if (entry.threw) throw new SyntaxError(entry.error);
      return materialiseRecordedTerms(entry.terms);
    },
    ...overrides,
  };
}
