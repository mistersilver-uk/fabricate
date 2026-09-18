/** A real `Roll` constructor for the View Lab (issue 855). */
import { evaluateNumericExpression } from '../../../src/systems/checkModifierResolver.js';

/**
 * `NdS` with an optional keep-highest / keep-lowest modifier. That check no longer stands where its
 * own note said it did, and the note is corrected rather than deleted because the correction is the
 * interesting part (issue 1118).
 */
const DIE_TERM = /(\d*)d(\d+)(?:(kh|kl)(\d*))?/gi;

/** A Foundry flavour annotation, e.g. the `[Rune Stylus]` that `appendToolBonusTerms` emits. */
const FLAVOUR_SPAN = /\[[^\]]*\]/g;

/** A die term that survived the substitution pass — i.e. one this parser does not understand. */
const UNPARSED_DIE = /\dd\d/i;

/**
 * Build the lab's `Roll` class over an injected entropy source.
 *
 * @param {object} options Options.
 * @param {() => number} options.random The seeded generator from `installLabRandom`. Injected
 *   rather than reached for as `Math.random` — which `labRandom` has already replaced with this
 *   very function — because a literal `Math.random()` is a SonarCloud S2245 finding that fails the
 *   quality gate, and because an injected seam keeps the draw order auditable from one place.
 * @param {(formula: string, data?: object, options?: object) => string} options.replaceFormulaData
 *   The existing `LAB_ROLL` static, passed through unchanged.
 * @param {(formula: string) => boolean} options.validate The existing `LAB_ROLL` static, unchanged.
 * @returns {Function} A `Roll` class suitable for `globalThis.Roll`.
 */
export function createLabRoll({ random, replaceFormulaData, validate }) {
  return class LabRoll {
    /**
     * @param {string} formula The roll expression.
     * @param {object} [data] Roll data for `@path` substitution.
     * @param {object} [options] Roll metadata preserved across the evaluated handoff.
     */
    constructor(formula, data = {}, options = {}) {
      this.data = data;
      this.options = options;
      // Core substitutes data while constructing terms; serialized rolls carry the resolved
      // formula, not the actor's data. Resolve here so restoration needs no live actor lookup.
      this.formula = replaceFormulaData(String(formula ?? ''), data, { missing: '0' });
      this.dice = [];
      this.terms = [];
      this.total = undefined;
      this.result = '';
      this._evaluated = false;
    }

    /**
     * Evaluate the formula, populating `total` and `dice`.
     *
     * @param {object} [_options] Ignored; accepted for signature parity with Foundry.
     * @returns {Promise<LabRoll>} This roll.
     */
    async evaluate(_options = {}) {
      if (this._evaluated) return this;
      // `missing: '0'` is Foundry's behaviour for a Roll constructed WITH data — an unresolved key
      // contributes nothing rather than poisoning the expression.
      const substituted = replaceFormulaData(this.formula, this.data, { missing: '0' });
      // Strip flavour spans before the die pass.
      const masked = substituted.replaceAll(FLAVOUR_SPAN, '');
      const rolledOut = masked.replaceAll(DIE_TERM, (match, count, faces, keep, keepCount) => {
        const number = count === '' ? 1 : Number(count);
        const sides = Number(faces);
        if (!Number.isInteger(number) || number < 1) return match;
        if (!Number.isInteger(sides) || sides < 1) return match;
        const rolls = Array.from({ length: number }, () => Math.floor(random() * sides) + 1);
        const keepN = keep ? (keepCount === '' ? 1 : Number(keepCount)) : number;
        const ranked = rolls
          .map((result, index) => ({ result, index }))
          .toSorted((left, right) =>
            keep === 'kl' ? left.result - right.result : right.result - left.result
          );
        const kept = new Set(
          ranked.slice(0, Math.max(0, Math.min(keepN, number))).map((entry) => entry.index)
        );
        // `active: true` on a kept die, matching every Foundry-shaped dice fixture in this repo
        // (`tests/check-roll.test.js`, `check-roll-dice.test.js`, `check-roll-tier-step.test.js`).
        const results = rolls.map((result, index) => ({
          result,
          active: !keep || kept.has(index),
        }));
        const total = rolls.reduce(
          (sum, result, index) => (!keep || kept.has(index) ? sum + result : sum),
          0
        );
        const die = { number, faces: sides, results, total };
        this.dice.push(die);
        this.terms.push(die);
        return String(total);
      });
      // Fail loudly on a die term this parser does not understand.
      if (UNPARSED_DIE.test(rolledOut)) {
        throw new Error(
          `View Lab Roll cannot evaluate "${this.formula}": the die term in "${rolledOut}" uses a ` +
            'modifier this harness does not implement (only NdS with optional kh/kl). Extend ' +
            'DIE_TERM in tests/view-lab/foundry/labRoll.js rather than letting it score partially.'
        );
      }
      const value = evaluateNumericExpression(rolledOut);
      this.total = Number.isFinite(value) ? value : 0;
      this.result = rolledOut;
      this._evaluated = true;
      return this;
    }

    /**
     * Snapshot the lab's evaluated roll for the authoritative check handoff.
     *
     * @returns {object} Detached, JSON-serializable roll data.
     */
    toJSON() {
      return structuredClone({
        class: this.constructor.name,
        options: this.options,
        dice: this.dice,
        formula: this.formula,
        terms: this.terms,
        total: this.total,
        evaluated: this._evaluated,
      });
    }

    /**
     * Restore a lab snapshot without evaluating, looking up actor data, or drawing entropy.
     * Core also defaults a missing `evaluated` flag to true for historical roll data.
     *
     * @param {object} data The object returned by toJSON, optionally JSON-transported.
     * @returns {LabRoll} The reconstructed roll.
     */
    static fromData(data) {
      if (data.class && data.class !== this.name) {
        throw new Error(`View Lab Roll cannot reconstruct ${data.class}`);
      }
      const snapshot = structuredClone(data);
      const roll = new this(snapshot.formula, snapshot.data, snapshot.options);
      roll.terms = snapshot.terms;
      if (snapshot.evaluated ?? true) {
        roll.total = snapshot.total;
        roll.dice = snapshot.dice ?? [];
        roll._evaluated = true;
        // Rebuild only the lab's diagnostic expression, using saved group totals. Never
        // reduce the expression or evaluate the dice again: the stored total is authoritative.
        let dieIndex = 0;
        roll.result = roll.formula
          .replaceAll(FLAVOUR_SPAN, '')
          .replaceAll(DIE_TERM, () => String(roll.dice[dieIndex++].total));
      }
      return roll;
    }

    /**
     * Post the roll to chat.
     *
     * @param {object} [messageData] Chat message data.
     * @param {object} [options] Options.
     * @param {string} [options.rollMode] Roll mode passthrough.
     * @param {string} [options.messageMode] V14 message mode passthrough.
     * @param {boolean} [options.create] When false, return the data instead of creating.
     * @returns {Promise<object|null>} The created message, or the data when `create` is false.
     */
    async toMessage(messageData = {}, { rollMode, messageMode, create = true } = {}) {
      const data = { ...messageData, rolls: [this], rollMode, messageMode };
      if (create === false) return data;
      return (await globalThis.ChatMessage?.create?.(data)) ?? null;
    }

    /**
     * @param {string} formula The formula.
     * @param {object} [data] Roll data.
     * @param {object} [options] Options.
     * @returns {string} The substituted formula.
     */
    static replaceFormulaData(formula, data, options) {
      return replaceFormulaData(formula, data, options);
    }

    /**
     * @param {string} formula The formula.
     * @returns {boolean} True when nothing unresolved survives.
     */
    static validate(formula) {
      return validate(formula);
    }

    /**
     * Parse a formula into roll TERMS, the way `Roll.parse` does. WHY THIS EXISTS. `CheckOddsPanel`
     * calls `Roll.parse` on every render to decide whether the check's outcome space can be
     * enumerated.
     *
     * @param {string} formula The roll expression.
     * @param {object} [data] Roll data for `@path` substitution.
     * @returns {Array<object>} Roll terms.
     */
    static parse(formula = '', data = {}) {
      if (typeof formula !== 'string') throw new TypeError(`Not parsable: ${formula}`);
      if (!formula) return [];
      return parseLabTerms(replaceFormulaData(formula, data, { missing: '0' }));
    }
  };
}

/**
 * A die term, in the shape RECORDED from Foundry 14.365 rather than invented.
 *
 * @param {object} params Params.
 * @param {number|undefined} params.number Dice count, or undefined for a sub-roll.
 * @param {string} params.denominationSource The raw denomination text (`20`, `f`, `c`).
 * @param {string} params.modifiers The raw modifier text.
 * @returns {object} The term.
 */
function labDieTerm({ number, denominationSource, modifiers }) {
  const numericFaces = /^\d+$/.test(denominationSource) ? Number(denominationSource) : null;
  const fixedFaces = { f: 3, c: 2 }[denominationSource.toLowerCase()];
  const faces = numericFaces ?? fixedFaces;
  const denomination = numericFaces === null ? denominationSource.toLowerCase() : `d${faces}`;
  const classes = { f: 'FateDie', c: 'Coin' };
  return {
    class: numericFaces === null ? (classes[denominationSource.toLowerCase()] ?? 'Die') : 'Die',
    number,
    faces,
    denomination,
    modifiers: modifiers ? (modifiers.match(/[a-z]+[<>=]?-?\d*/gi) ?? []) : [],
    isDeterministic: false,
  };
}

/** A die whose faces are a parenthetical sub-roll: `number`/`faces` read `undefined`. */
const SUB_ROLL_DIE = /^(\d*)d\(/i;

/** `NdS` with an optional trailing modifier run. */
const LAB_DIE = /^(\d*)d(\d+|[fc])((?:[a-z]+[<>=]?-?\d*)*)/i;

/** A math function opening, e.g. `max(`. */
const LAB_FUNCTION = /^([a-z][a-z0-9]*)\(/i;

/** A bare word the grammar leaves as an unmatched `StringTerm`, e.g. `prof`. */
const LAB_WORD = /^[a-z_][\w.]*/i;

/** A decimal number. */
const LAB_NUMBER = /^\d+(?:\.\d+)?/;

/** A flavour annotation, which Foundry attaches to the preceding term as inert text. */
const LAB_FLAVOUR = /^\[[^\]]*]/;

/**
 * Read the balanced parenthetical starting at `source[start]` (which must be `(`).
 *
 * @param {string} source The formula.
 * @param {number} start Index of the opening parenthesis.
 * @returns {{inner: string, end: number}} The contents and the index after the `)`.
 * @throws {SyntaxError} When the parenthesis is never closed — which is what a GM's
 *   half-typed `1d20 + (` is, and what the real grammar raises for it.
 */
function readBalanced(source, start) {
  let depth = 0;
  for (let index = start; index < source.length; index += 1) {
    if (source[index] === '(') depth += 1;
    else if (source[index] === ')') {
      depth -= 1;
      if (depth === 0) return { inner: source.slice(start + 1, index), end: index + 1 };
    }
  }
  throw new SyntaxError(`Unbalanced parenthesis in "${source}"`);
}

/**
 * Parse a substituted formula into lab roll terms.
 *
 * @param {string} source The `@`-substituted formula.
 * @returns {Array<object>} Roll terms in infix order.
 * @throws {SyntaxError} On a malformed or half-typed formula.
 */
/**
 * Split an argument list on its TOP-LEVEL commas only.
 *
 * @param {string} inner The text between the brackets.
 * @returns {string[]} One entry per top-level argument.
 */
function splitArguments(inner) {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < inner.length; index += 1) {
    const character = inner[index];
    if (character === '(' || character === '{') depth += 1;
    else if (character === ')' || character === '}') depth -= 1;
    else if (character === ',' && depth === 0) {
      parts.push(inner.slice(start, index));
      start = index + 1;
    }
  }
  parts.push(inner.slice(start));
  return parts;
}

function parseLabTerms(source) {
  const terms = [];
  let cursor = 0;
  // `true` while the parser is waiting for a VALUE and `false` while it is waiting for an operator.
  let expectOperand = true;

  while (cursor < source.length) {
    const rest = source.slice(cursor);
    if (/^\s/.test(rest)) {
      cursor += 1;
      continue;
    }
    const flavour = LAB_FLAVOUR.exec(rest);
    if (flavour) {
      cursor += flavour[0].length;
      continue;
    }
    if (!expectOperand) {
      if (!/^[+\-*/%]/.test(rest)) throw new SyntaxError(`Expected an operator in "${source}"`);
      terms.push({ class: 'OperatorTerm', operator: rest[0], isDeterministic: true });
      cursor += 1;
      expectOperand = true;
      continue;
    }
    cursor += readOperand(source, cursor, rest, terms);
    expectOperand = false;
  }

  if (expectOperand) throw new SyntaxError(`Incomplete expression "${source}"`);
  return terms;
}

/**
 * Push the one operand starting at `cursor` and report how many characters it spanned.
 *
 * @param {string} source The whole formula.
 * @param {number} cursor The operand's start index.
 * @param {string} rest `source` from `cursor`.
 * @param {Array<object>} terms The output list, appended to in place.
 * @returns {number} The operand's length in characters.
 * @throws {SyntaxError} When nothing the grammar accepts starts here.
 */
function readOperand(source, cursor, rest, terms) {
  const subRoll = SUB_ROLL_DIE.exec(rest);
  if (subRoll) {
    const { end } = readBalanced(source, cursor + subRoll[0].length - 1);
    // `DiceTerm#faces` returns undefined while the faces are an unevaluated sub-Roll, and
    // `Die#denomination` is `` `d${this.faces}` `` — so the recorded 14.365 output really is the
    // literal string `"dundefined"`.
    terms.push({
      class: 'Die',
      number: subRoll[1] === '' ? 1 : Number(subRoll[1]),
      faces: undefined,
      denomination: 'dundefined',
      modifiers: [],
      isDeterministic: false,
    });
    return end - cursor;
  }

  if (rest.startsWith('{')) {
    const closing = source.indexOf('}', cursor);
    if (closing === -1) throw new SyntaxError(`Unbalanced pool brace in "${source}"`);
    const inner = source.slice(cursor + 1, closing);
    const trailing = /^[a-z]+[<>=]?-?\d*/i.exec(source.slice(closing + 1));
    const parts = splitArguments(inner).flatMap((part) => parseLabTerms(part));
    // `PoolTerm#isDeterministic` is `terms.every(...)`, and — unlike a parenthetical or a
    // function term — the recorded shape reports `isIntermediate: false`.
    terms.push({
      class: 'PoolTerm',
      modifiers: trailing ? [trailing[0]] : [],
      isIntermediate: false,
      isDeterministic: parts.every((part) => part.isDeterministic === true),
    });
    return closing + 1 - cursor + (trailing ? trailing[0].length : 0);
  }

  const die = LAB_DIE.exec(rest);
  if (die) {
    terms.push(
      labDieTerm({
        number: die[1] === '' ? 1 : Number(die[1]),
        denominationSource: die[2],
        modifiers: die[3],
      })
    );
    return die[0].length;
  }

  const number = LAB_NUMBER.exec(rest);
  if (number) {
    terms.push({ class: 'NumericTerm', number: Number(number[0]), isDeterministic: true });
    return number[0].length;
  }

  // A UNARY SIGN, which the grammar allows in front of any operand and which a bounded rolling
  // check modifier always produces: `min(max((1d8), -1), 6)` opens its second argument with one.
  if ((rest.startsWith('-') || rest.startsWith('+')) && rest.length > 1) {
    const consumed = readOperand(source, cursor + 1, rest.slice(1), terms);
    const operand = terms.at(-1);
    if (rest.startsWith('-') && operand?.class === 'NumericTerm') operand.number = -operand.number;
    return consumed + 1;
  }

  const fn = LAB_FUNCTION.exec(rest);
  if (fn) {
    const { inner, end } = readBalanced(source, cursor + fn[0].length - 1);
    // `FunctionTerm#isDeterministic` is `this.terms.every(t => Roll.create(t).isDeterministic)`,
    // so it recurses; a comma-separated argument list is parsed argument by argument.
    const parts = splitArguments(inner).flatMap((part) => parseLabTerms(part));
    terms.push({
      class: 'FunctionTerm',
      fn: fn[1],
      terms: parts,
      isIntermediate: true,
      isDeterministic: parts.every((part) => part.isDeterministic === true),
    });
    return end - cursor;
  }

  if (rest.startsWith('(')) {
    const { inner, end } = readBalanced(source, cursor);
    const parts = parseLabTerms(inner);
    // `ParentheticalTerm` carries BOTH a string `term` and an own `roll` slot, and `isIntermediate
    // = true`.
    terms.push({
      class: 'ParentheticalTerm',
      term: inner,
      roll: undefined,
      isIntermediate: true,
      isDeterministic: parts.every((part) => part.isDeterministic === true),
    });
    return end - cursor;
  }

  const word = LAB_WORD.exec(rest);
  if (word) {
    // `StringTerm#isDeterministic` returns TRUE for a string the classifier cannot resolve — and
    // evaluating it then throws.
    terms.push({ class: 'StringTerm', term: word[0], isDeterministic: true });
    return word[0].length;
  }

  throw new SyntaxError(`Unexpected "${rest[0]}" in "${source}"`);
}
