/** `Roll.parse` output RECORDED from a real Foundry build (14.365), not modelled (issue 1097). */

/** The recording. Keyed by the exact formula string passed to `Roll.parse`. */
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
  // A BOUNDED ROLLING CHECK MODIFIER, verbatim from `buildModifierRollFragment` (issue 1118) and
  // appended by `appendCheckModifierRollTerms`.
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
