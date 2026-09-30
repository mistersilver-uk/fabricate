/**
 * The formulas whose `new Roll(formula, data).terms` are recorded from real Foundry (issue #2007),
 * and the in-page recorder `scripts/foundry-roll-terms-record.mjs` evaluates. `tests/helpers/
 * recordedRollParse.js` reads the recordings and its drift guard fails on a corpus gap.
 */

/** Roll data sets, keyed by the name each corpus entry cites. */
export const ROLL_TERMS_DATA = Object.freeze({
  default: Object.freeze({
    prof: 3,
    mod: 3,
    craftingmod: 3,
    skill: 2,
    faces: 20,
    skills: Object.freeze({ x: Object.freeze({ rank: 2 }) }),
  }),
  diceProf: Object.freeze({ prof: '1d4' }),
});

/** The keep-transform plan's corpus (the issue's "Test doubles and seams"). */
const PLAN_FORMULAS = [
  '1d20',
  'd20',
  '1D20 + 3',
  '1d20[skill] + 3',
  '1d12 + @prof',
  '2d6 + @prof',
  '1d100',
  '1d20 + 1d6',
  '1d6 + 1d20',
  '1d6x + 1d20',
  '(1d20+2)*2',
  '{1d20,1d20}kh',
  '2d20kh1 + 1d6',
  '(@skills.x.rank)d20',
  '1d@faces',
  '1df + 2',
  'max(1d20,10)',
  'floor(1d20/2)',
  '10 - 1d20',
  '2 * 1d20',
  '1d20 * -1',
  '0d20 + 5',
  // The library fragment `appendCheckModifierRollTerms` appends to an authored `@skill + 3`.
  '@skill + 3 + (1d20)[Modifiers]',
];

/** Every `prefix` the plan's first-group proof yields for its corpus; `''` needs no Roll. */
const PREFIX_FORMULAS = ['2', '@prof'];

/**
 * The advantage formulas the check tests construct, before and after the keep transform, so the
 * shared double's formula rendering is pinned to Foundry's.
 */
const DOUBLE_FORMULAS = [
  '1d20 + 3',
  '2d20kh1 + 3',
  '2d20kl1 + 3',
  '1d20 + (2)',
  '2d20kh1 + (2)',
  '2d20kl1',
  '2d20kh1',
  '2d6',
  '1d20 + 3[Modifiers]',
  '2d20kh1 + 3[Modifiers]',
  '1d20 + 2[Modifiers]',
  '2d20kh1 + 2[Modifiers]',
  '2d20kl1 + 2[Modifiers]',
  '1d20 + 2[Modifiers] + (3)',
  '2d20kh1 + 2[Modifiers] + (3)',
  '1d20 + (1d20)[Modifiers]',
  '2d20kh1 + (1d20)[Modifiers]',
  '1d20 + 3[Modifiers] + (2)',
  '2d20kh1 + 3[Modifiers] + (2)',
  '1d20 + (+3)',
  '2d20kh1 + (+3)',
  '1d20 + (3)',
  '2d20kh1 + (3)',
  '1d20+3',
  '1d20 + 3 + 1d4 [Tool]',
  '2d6x>=6',
  '5d10xo>=8',
  '{1d20,1d12}kh + 2',
];

/** The earlier `Roll.parse` corpus (issue 1097), so the lab parser's rendering is pinned too. */
const PARSE_FORMULAS = [
  '1d20 + 5',
  '1d20 + @prof',
  '1d20 + 3[Tools] + 2[Modifiers]',
  '2d20',
  '1d20r1',
  '1d20min2',
  '1d(1d4)',
  '1dc',
  '5 + 3',
  '1d20 + (2d6)',
  '1d20 + 3[Tools] + min(max((1d8), -1), 6)[Modifiers]',
  '1d20 +',
  '1d20 + (',
  '1d20 + @nope',
  '1d20 + 2 * 3',
];

/** One recorded entry per `formula` and `data` pair. */
export const ROLL_TERMS_CORPUS = Object.freeze(
  [
    ...PLAN_FORMULAS.map((formula) => ({ formula, data: 'default', family: 'plan' })),
    { formula: '@prof + 1d20', data: 'diceProf', family: 'plan' },
    ...PREFIX_FORMULAS.map((formula) => ({ formula, data: 'default', family: 'prefix' })),
    { formula: '@prof', data: 'diceProf', family: 'prefix' },
    ...DOUBLE_FORMULAS.map((formula) => ({ formula, data: 'default', family: 'double' })),
    ...PARSE_FORMULAS.map((formula) => ({ formula, data: 'default', family: 'parse' })),
  ].map((entry) => Object.freeze(entry))
);

/**
 * Keep-transform probes: the recorder mutates the term at `index` exactly as the plan's transform
 * does, then reads every formula surface before and after `resetFormula()`.
 */
export const ROLL_TERMS_PROBES = Object.freeze(
  [
    { formula: '1d12 + @prof', data: 'default', index: 0, extraDice: 1, keep: 'kh' },
    { formula: '1d20[skill] + 3', data: 'default', index: 0, extraDice: 1, keep: 'kl' },
    { formula: '2 * 1d20', data: 'default', index: 2, extraDice: 1, keep: 'kh' },
    { formula: '2d6 + @prof', data: 'default', index: 0, extraDice: 2, keep: 'kh' },
    { formula: '@prof + 1d20', data: 'diceProf', index: 2, extraDice: 1, keep: 'kh' },
  ].map((entry) => Object.freeze(entry))
);

/** The key a recording is filed under: the formula, qualified by any non-default data set. */
export function rollTermsKey({ formula, data }) {
  return data === 'default' ? formula : `${formula} ⟨${data}⟩`;
}

/**
 * Describe one term in the recorded shape. Runs INSIDE the Foundry page, so it closes over
 * nothing: `Roll` and `DiceTerm` are passed in.
 */
export function describeRecordedTerm(term, { Roll, DiceTerm }) {
  const typed = (value) => {
    if (value instanceof Roll) return { type: 'Roll', value: value.formula };
    return { type: typeof value, value: typeof value === 'object' ? null : (value ?? null) };
  };
  const ancestry = [];
  for (let cls = term.constructor; cls?.name; cls = Object.getPrototypeOf(cls)) {
    ancestry.push(cls.name);
  }
  const dice = term instanceof DiceTerm;
  const modifierTable = dice ? (term.constructor.MODIFIERS ?? {}) : {};
  return {
    class: term.constructor.name,
    ancestry,
    number: dice ? typed(term._number) : null,
    faces: dice ? typed(term._faces) : null,
    modifiers: Array.isArray(term.modifiers) ? [...term.modifiers] : null,
    keepModifiers: dice ? 'kh' in modifierTable && 'kl' in modifierTable : null,
    flavor: term.options?.flavor ?? null,
    operator: typeof term.operator === 'string' ? term.operator : null,
    value: term.constructor.name === 'NumericTerm' ? term.number : null,
    term: typeof term.term === 'string' ? term.term : null,
    fn: typeof term.fn === 'string' ? term.fn : null,
    args: Array.isArray(term.terms)
      ? term.terms.map((arg) => (typeof arg === 'string' ? arg : arg.formula))
      : null,
    formula: term.formula,
    isIntermediate: term.isIntermediate === true,
  };
}
