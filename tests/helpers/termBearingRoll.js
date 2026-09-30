/**
 * The shared term-bearing `Roll` double (issue 2007). Construction REPLAYS the terms recorded from
 * real Foundry (`RECORDED_ROLL_TERMS`) when the formula and its `@` data match a recording, and
 * otherwise parses with the View Lab's parser, which `tests/roll-terms-recording.test.js` pins to
 * every recording. `formula` is live from the terms and `_formula` is cached, so a test reads the
 * evaluated roll's `_formula`; `resetFormula`, `toJSON`, `fromData` and `clone` behave as core's.
 */
import { ROLL_TERMS_DATA } from '../../scripts/lib/rollTermsCorpus.js';
import { createLabRoll } from '../view-lab/foundry/labRoll.js';
import { parseLabTerms } from '../view-lab/foundry/labRollParse.js';
import { Die, LAB_TERM_CLASSES, LabSubRoll } from '../view-lab/foundry/labRollTerms.js';

import { RECORDED_ROLL_TERMS, recordedRollDouble } from './recordedRollParse.js';

export { Die } from '../view-lab/foundry/labRollTerms.js';

/** dnd5e 5.3.3's plain die on 14.365, recorded as a `Die` subclass, so `instanceof Die` holds. */
export class BasicDie extends Die {}

/** Every term class the double builds, keyed by the class name core serializes. */
export const TERM_CLASSES = Object.freeze({ ...LAB_TERM_CLASSES, BasicDie });

const { replaceFormulaData } = recordedRollDouble();

/** Core's `Roll.validate`: substitute every reference with `0`, and valid when that parses. */
function validate(formula) {
  try {
    parseLabTerms(replaceFormulaData(String(formula), {}, { missing: '0' }));
    return true;
  } catch {
    return false;
  }
}

const readPath = (data, path) => path.split('.').reduce((value, key) => value?.[key], data);

/** Whether every `@path` in `formula` resolves in `data` as it did in the recording's data. */
function sameReferencedData(formula, data, recordedData) {
  return [...formula.matchAll(/@([\w.]+)/g)].every(
    ([, path]) => String(readPath(data, path)) === String(readPath(recordedData, path))
  );
}

function recordingFor({ entries }, formula, data) {
  return (
    Object.values(entries).find(
      (entry) =>
        entry.formula === formula && sameReferencedData(formula, data, ROLL_TERMS_DATA[entry.data])
    ) ?? null
  );
}

/** A recorded `_number`/`_faces`: a number, an unevaluated sub-roll, or undefined. */
function recordedCount(typed) {
  if (!typed) return undefined;
  if (typed.type === 'Roll') return new LabSubRoll(typed.value);
  return typed.value ?? undefined;
}

/** One recorded term as a live term instance of the recorded class. */
export function termFromRecording(recorded) {
  const Cls = TERM_CLASSES[recorded.class];
  if (!Cls) throw new Error(`the term double has no class for recorded ${recorded.class}`);
  return new Cls({
    number: recorded.class === 'NumericTerm' ? recorded.value : recordedCount(recorded.number),
    faces: recordedCount(recorded.faces),
    modifiers: recorded.modifiers ?? [],
    operator: recorded.operator,
    term: recorded.term,
    fn: recorded.fn,
    terms: recorded.args ?? [],
    options: recorded.flavor ? { flavor: recorded.flavor } : {},
  });
}

/**
 * Build the double's `Roll` class.
 *
 * @param {object} [options] Options.
 * @param {'13.351'|'14.365'} [options.foundryVersion] The build whose recording replays.
 * @param {boolean} [options.strict] Throw for a constructed formula with no recording instead of
 *   parsing it.
 * @param {() => number} [options.random] The face driver; the default always rolls the middle face.
 * @param {number|((roll: object) => number)} [options.total] Overrides the evaluated total.
 * @param {(roll: object) => void} [options.onConstruct] Observes every constructed roll.
 * @returns {Function} A `Roll` class for `globalThis.Roll`, whose `Die` is {@link Die}.
 */
export function createTermBearingRoll({
  foundryVersion = '14.365',
  strict = false,
  random = () => 0.5,
  total,
  onConstruct,
} = {}) {
  const recording = RECORDED_ROLL_TERMS[foundryVersion];
  if (!recording) throw new Error(`no recorded Roll terms for Foundry ${foundryVersion}`);
  // `fromData` and `clone` re-parse a formula core itself produced, so `strict` never refuses them.
  let reconstructing = 0;
  const reconstruct = (build) => {
    reconstructing += 1;
    try {
      return build();
    } finally {
      reconstructing -= 1;
    }
  };
  const LabRoll = createLabRoll({ random, replaceFormulaData, validate });
  return class TermBearingRoll extends LabRoll {
    static TERM_CLASSES = TERM_CLASSES;

    static constructTerms(formula, data) {
      const recorded = recordingFor(recording, formula, data);
      if (recorded?.threw) throw new SyntaxError(`${recorded.error}: ${formula}`);
      if (recorded) return recorded.terms.map((term) => termFromRecording(term));
      if (strict && reconstructing === 0)
        throw new Error(`no recorded Foundry ${foundryVersion} terms for "${formula}"`);
      return super.constructTerms(formula, data);
    }

    static fromData(data) {
      return reconstruct(() => super.fromData(data));
    }

    constructor(formula, data, options) {
      super(formula, data, options);
      onConstruct?.(this);
    }

    clone() {
      return reconstruct(() => super.clone());
    }

    async evaluate(options) {
      await super.evaluate(options);
      if (total !== undefined) this.total = typeof total === 'function' ? total(this) : total;
      return this;
    }
  };
}

/**
 * Install a term-bearing `Roll`, optionally subclassed by `extend`, as `globalThis.Roll`, and its
 * term classes as core's `foundry.dice.terms`, whose `Die` the keep transform checks against.
 *
 * @param {object} [options] {@link createTermBearingRoll}'s options, plus `extend(Base)`.
 * @returns {{Roll: Function, restore: () => void}} The installed class and its undo.
 */
export function installTermBearingRoll({ extend = (Base) => Base, ...options } = {}) {
  const previous = globalThis.Roll;
  const previousFoundry = globalThis.foundry;
  const Roll = extend(createTermBearingRoll(options));
  // ratchet-exempt(lint): the code under test reads the dice engine from `globalThis.Roll`.
  globalThis.Roll = Roll;
  // ratchet-exempt(lint): the keep transform reads core's `Die` from `foundry.dice.terms`.
  globalThis.foundry = {
    ...previousFoundry,
    dice: { ...previousFoundry?.dice, terms: TERM_CLASSES },
  };
  return {
    Roll,
    restore() {
      if (previous === undefined) delete globalThis.Roll;
      // ratchet-exempt(lint): puts back the dice engine the install above replaced.
      else globalThis.Roll = previous;
      if (previousFoundry === undefined) delete globalThis.foundry;
      // ratchet-exempt(lint): puts back the namespace the install above replaced.
      else globalThis.foundry = previousFoundry;
    },
  };
}
