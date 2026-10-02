/**
 * The View Lab's roll TERMS (issue 2007): the classes, `_number`/`_faces`, `modifiers`, flavour and
 * `formula` that real Foundry's `new Roll(formula, data).terms` carry, as recorded from 13.351 and
 * 14.365 (`tests/fixtures/recorded-roll-terms/`), so the production keep transform can act on a
 * lab Roll exactly as on a real one. `tests/helpers/termBearingRoll.js` shares these classes.
 */
import { parseLabTerms } from './labRollParse.js';

/** An unevaluated sub-roll standing where a die's count or faces go, as in `(2)d20` or `1d(1d4)`. */
export class LabSubRoll {
  constructor(formula) {
    this.formula = String(formula);
  }

  toJSON() {
    return { formula: this.formula };
  }
}

/** A count or faces value: a number stays one, an object is revived as its sub-roll. */
function countOrFaces(value) {
  return value && typeof value === 'object' ? new LabSubRoll(value.formula) : value;
}

/** The text a count or faces renders as. */
const countOrFacesText = (value) => (value instanceof LabSubRoll ? value.formula : String(value));

export class RollTerm {
  constructor({ options = {} } = {}) {
    this.options = { ...options };
  }

  get flavor() {
    return this.options.flavor ?? '';
  }

  get isIntermediate() {
    return false;
  }

  /** The term without its flavour; each class renders its own. */
  get expression() {
    return '';
  }

  /** The own fields `toJSON` carries beside the class and options. */
  serializedFields() {
    return {};
  }

  /** The flavour suffix every term's `formula` ends with. */
  get flavorSuffix() {
    return this.flavor ? `[${this.flavor}]` : '';
  }

  get formula() {
    return `${this.expression}${this.flavorSuffix}`;
  }

  toJSON() {
    return { class: this.constructor.name, options: this.options, ...this.serializedFields() };
  }

  static fromData({ class: _name, ...data }) {
    return new this(data);
  }
}

/** A die term. `number`/`faces` read `_number`/`_faces` only when they are numbers, as core's do. */
export class DiceTerm extends RollTerm {
  static DENOMINATION = 'd';

  static MODIFIERS = {};

  constructor({ number = 1, faces, modifiers = [], results = [], total, dice, options } = {}) {
    super({ options });
    this._number = countOrFaces(number);
    this._faces = countOrFaces(faces);
    this.modifiers = [...modifiers];
    this.results = structuredClone(results);
    this.total = total;
    if (dice) this.dice = structuredClone(dice);
  }

  get number() {
    return typeof this._number === 'number' ? this._number : undefined;
  }

  set number(value) {
    this._number = value;
  }

  get faces() {
    return typeof this._faces === 'number' ? this._faces : undefined;
  }

  set faces(value) {
    this._faces = value;
  }

  get denomination() {
    return `d${this.faces}`;
  }

  get expression() {
    const { DENOMINATION } = this.constructor;
    const denomination = DENOMINATION === 'd' ? countOrFacesText(this._faces) : DENOMINATION;
    return `${countOrFacesText(this._number)}d${denomination}${this.modifiers.join('')}`;
  }

  serializedFields() {
    return {
      number: this._number,
      faces: this._faces,
      modifiers: this.modifiers,
      results: this.results,
      total: this.total,
      ...(this.dice && { dice: this.dice }),
    };
  }
}

/** Core's `Die` modifier table keys; the keep transform requires `kh` and `kl` among them. */
const DIE_MODIFIERS = Object.freeze(
  Object.fromEntries(
    'r rr x xo k kh kl d dh dl min max cs cf df sf ms'.split(' ').map((key) => [key, key])
  )
);

export class Die extends DiceTerm {
  static MODIFIERS = DIE_MODIFIERS;
}

/** Recorded on both builds: a `FateDie` is a `DiceTerm` but NOT a `Die`, yet offers `kh`/`kl`. */
export class FateDie extends DiceTerm {
  static DENOMINATION = 'f';

  static MODIFIERS = Object.freeze({ r: 'r', rr: 'rr', k: 'k', kh: 'kh', kl: 'kl', d: 'd' });

  get denomination() {
    return 'f';
  }
}

export class Coin extends DiceTerm {
  static DENOMINATION = 'c';

  static MODIFIERS = Object.freeze({ c: 'c' });

  get denomination() {
    return 'c';
  }
}

export class NumericTerm extends RollTerm {
  constructor({ number, options } = {}) {
    super({ options });
    this.number = number;
  }

  get expression() {
    return String(this.number);
  }

  serializedFields() {
    return { number: this.number };
  }
}

/** Core renders an operator with a space either side, which is why `1d20+3` reads `1d20 + 3`. */
export class OperatorTerm extends RollTerm {
  constructor({ operator, options } = {}) {
    super({ options });
    this.operator = operator;
  }

  get formula() {
    return ` ${this.operator} `;
  }

  serializedFields() {
    return { operator: this.operator };
  }
}

/** A composite term whose nested dice, if any, the lab stores on it as `dice`. */
class CompositeTerm extends RollTerm {
  constructor({ total, dice, options } = {}) {
    super({ options });
    this.total = total;
    if (dice) this.dice = structuredClone(dice);
  }

  serializedFields() {
    return { total: this.total, ...(this.dice && { dice: this.dice }) };
  }
}

/** `term` is the inner formula as core re-renders it: `(1d20+2)` reads `(1d20 + 2)`. */
export class ParentheticalTerm extends CompositeTerm {
  constructor({ term, ...rest } = {}) {
    super(rest);
    this.term = term;
  }

  get isIntermediate() {
    return true;
  }

  get expression() {
    return `(${this.term})`;
  }

  serializedFields() {
    return { term: this.term, ...super.serializedFields() };
  }
}

/** `terms` are the argument formulas, each re-rendered: `floor(1d20/2)` reads `floor(1d20 / 2)`. */
export class FunctionTerm extends CompositeTerm {
  constructor({ fn, terms = [], ...rest } = {}) {
    super(rest);
    this.fn = fn;
    this.terms = [...terms];
  }

  get isIntermediate() {
    return true;
  }

  get expression() {
    return `${this.fn}(${this.terms.join(',')})`;
  }

  serializedFields() {
    return { fn: this.fn, terms: this.terms, ...super.serializedFields() };
  }
}

export class PoolTerm extends CompositeTerm {
  constructor({ terms = [], modifiers = [], ...rest } = {}) {
    super(rest);
    this.terms = [...terms];
    this.modifiers = [...modifiers];
  }

  get expression() {
    return `{${this.terms.join(',')}}${this.modifiers.join('')}`;
  }

  serializedFields() {
    return { terms: this.terms, modifiers: this.modifiers, ...super.serializedFields() };
  }
}

export class StringTerm extends CompositeTerm {
  constructor({ term, ...rest } = {}) {
    super(rest);
    this.term = term;
  }

  get expression() {
    return String(this.term);
  }

  serializedFields() {
    return { term: this.term, ...super.serializedFields() };
  }
}

/** The lab's term classes, keyed by the class name core serializes. */
export const LAB_TERM_CLASSES = Object.freeze({
  RollTerm,
  DiceTerm,
  Die,
  FateDie,
  Coin,
  NumericTerm,
  OperatorTerm,
  ParentheticalTerm,
  FunctionTerm,
  PoolTerm,
  StringTerm,
});

/** Core's `Roll.getFormula`: every term's formula, concatenated. */
export function formulaOfTerms(terms) {
  return terms.map((term) => term.formula).join('');
}

/** A nested formula as core re-renders it, e.g. `1d20+2` as `1d20 + 2`. */
function renderNested(source) {
  const trimmed = String(source).trim();
  return trimmed ? formulaOfTerms(labTermsFromParsed(parseLabTerms(trimmed))) : '';
}

/** How each parsed class becomes a term instance, given the parsed term and its options. */
const FROM_PARSED = {
  NumericTerm: (plain, options) => new NumericTerm({ number: plain.number, options }),
  OperatorTerm: (plain, options) => new OperatorTerm({ operator: plain.operator, options }),
  ParentheticalTerm: (plain, options) =>
    new ParentheticalTerm({ term: renderNested(plain.term), options }),
  FunctionTerm: (plain, options) =>
    new FunctionTerm({ fn: plain.fn, terms: plain.args.map(renderNested), options }),
  PoolTerm: (plain, options) =>
    new PoolTerm({ terms: plain.args.map(renderNested), modifiers: plain.modifiers, options }),
  StringTerm: (plain, options) => new StringTerm({ term: plain.term, options }),
};

/** One parsed plain term as a term instance. */
function labTermFromParsed(plain) {
  const options = plain.flavor ? { flavor: plain.flavor } : {};
  const DiceClass = { Die, FateDie, Coin }[plain.class];
  if (!DiceClass) return (FROM_PARSED[plain.class] ?? FROM_PARSED.StringTerm)(plain, options);
  return new DiceClass({
    number: plain.numberSource === undefined ? plain.number : subRoll(plain.numberSource),
    faces: plain.facesSource === undefined ? plain.faces : subRoll(plain.facesSource),
    modifiers: plain.modifiers,
    options,
  });
}

function subRoll(source) {
  return new LabSubRoll(`(${renderNested(source)})`);
}

/** Parsed plain terms as term instances. */
export function labTermsFromParsed(parsed) {
  return parsed.map((plain) => labTermFromParsed(plain));
}

/**
 * Revive one serialized term through `classes` (core's `RollTerm.fromData` lookup), or null when
 * its class is not one the caller knows.
 */
export function labTermFromData(data, classes = LAB_TERM_CLASSES) {
  const cls = typeof data?.class === 'string' ? classes[data.class] : null;
  return cls ? cls.fromData(data) : null;
}
