/** A real `Roll` constructor for the View Lab (issue 855). */
import { evaluateNumericExpression } from '../../../src/systems/checkModifierResolver.js';

import { parseLabTerms } from './labRollParse.js';
import {
  DiceTerm,
  formulaOfTerms,
  LAB_TERM_CLASSES,
  labTermFromData,
  labTermsFromParsed,
} from './labRollTerms.js';

/**
 * `NdS` with an optional keep-highest / keep-lowest modifier, or the native explosion a count Roll
 * writes: `x`/`xo`, bare or with a comparison and face (issue 2004).
 */
const DIE_TERM = /(\d*)d(\d+)(?:(kh|kl)(\d*)|(xo?)(?:(<=|>=|<|>|=)(\d+))?)?/gi;

/** Core's `Die#explode` recursion limit, and the message a count Roll recognizes. */
const MAX_EXPLOSIONS = 1000;

function compareFace(face, comparison, target) {
  if (comparison === '<=') return face <= target;
  if (comparison === '>=') return face >= target;
  if (comparison === '<') return face < target;
  if (comparison === '>') return face > target;
  return face === target;
}

/**
 * Core's explosion loop: each result matching the comparison is marked `exploded` and appends one
 * die; `xo` tests the original dice only.
 */
function explodeResults(results, { sides, once, comparison = '=', target = sides, roll }) {
  const initial = results.length;
  for (let checked = 0; checked < results.length; checked += 1) {
    if (!once && checked >= MAX_EXPLOSIONS) {
      throw new Error('Maximum recursion depth for exploding dice roll exceeded');
    }
    const entry = results[checked];
    if (compareFace(entry.result, comparison, target)) {
      entry.exploded = true;
      results.push({ result: roll(), active: true });
    }
    if (once && checked + 1 === initial) break;
  }
}

/** A Foundry flavour annotation, e.g. the `[Rune Stylus]` that `appendToolBonusTerms` emits. */
const FLAVOUR_SPAN = /\[[^\]]*\]/g;

/** A die term that survived the substitution pass — i.e. one this parser does not understand. */
const UNPARSED_DIE = /\dd\d/i;

/** A die term's count and sides, or null for a shape the lab leaves unrolled. */
function dieShape(count, faces) {
  const number = count === '' ? 1 : Number(count);
  const sides = Number(faces);
  if (!Number.isInteger(number) || number < 1) return null;
  if (!Number.isInteger(sides) || sides < 1) return null;
  return { number, sides };
}

/**
 * Roll one die term: keep-highest/lowest marks the dropped faces inactive, and an explosion marks
 * each exploding face and appends its die. `active: true` on a kept die matches every
 * Foundry-shaped dice fixture in this repo (`tests/check-roll.test.js`).
 */
function rollDieTerm({ number, sides }, [keep, keepCount, explode, comparison, target], random) {
  const roll = () => Math.floor(random() * sides) + 1;
  if (explode) {
    const results = Array.from({ length: number }, () => ({ result: roll(), active: true }));
    const face = target === undefined ? sides : Number(target);
    explodeResults(results, { sides, once: explode === 'xo', comparison, target: face, roll });
    return { results, total: results.reduce((sum, entry) => sum + entry.result, 0) };
  }
  const rolls = Array.from({ length: number }, roll);
  const keepN = keep ? (keepCount === '' ? 1 : Number(keepCount)) : number;
  const ranked = rolls
    .map((result, index) => ({ result, index }))
    .toSorted((left, right) =>
      keep === 'kl' ? left.result - right.result : right.result - left.result
    );
  const kept = new Set(
    ranked.slice(0, Math.max(0, Math.min(keepN, number))).map((entry) => entry.index)
  );
  const results = rolls.map((result, index) => ({ result, active: !keep || kept.has(index) }));
  const total = rolls.reduce(
    (sum, result, index) => (!keep || kept.has(index) ? sum + result : sum),
    0
  );
  return { results, total };
}

/** Whether a top-level term is itself one lab die: an `NdS` the evaluation pass rolls whole. */
function isSelfDie(term) {
  if (!(term instanceof DiceTerm)) return false;
  if (!Number.isInteger(term._number) || !Number.isInteger(term._faces)) return false;
  const matches = [...term.expression.matchAll(DIE_TERM)];
  return (
    matches.length === 1 &&
    matches[0][0] === term.expression &&
    dieShape(matches[0][1], matches[0][2]) !== null
  );
}

/** The unevaluated die shapes the evaluation pass will find inside a term's formula. */
function nestedDiceShapes(term) {
  return [...term.formula.replaceAll(FLAVOUR_SPAN, '').matchAll(DIE_TERM)]
    .map(([, count, faces]) => dieShape(count, faces))
    .filter(Boolean)
    .map(({ number, sides }) => ({ number, faces: sides, results: [], total: undefined }));
}

/** Give each term that is not itself a die the nested die shapes it holds, as core's `dice`. */
function attachNestedDice(terms) {
  for (const term of terms) {
    if (isSelfDie(term)) continue;
    const shapes = nestedDiceShapes(term);
    if (shapes.length > 0) term.dice = shapes;
  }
  return terms;
}

/** Plain JSON for one entry of `roll.dice`. */
const dieJson = (die) => (typeof die?.toJSON === 'function' ? die.toJSON() : die);

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
    /** The term classes `fromData` revives serialized terms through. */
    static TERM_CLASSES = LAB_TERM_CLASSES;

    /**
     * @param {string} formula The roll expression.
     * @param {object} [data] Roll data for `@path` substitution.
     * @param {object} [options] Roll metadata preserved across the evaluated handoff.
     */
    constructor(formula, data = {}, options = {}) {
      this.data = data;
      this._total = undefined;
      this.options = options;
      // Core parses its terms at construction, substituting data first, so a Roll's dice exist,
      // unevaluated, before it rolls and a serialized roll carries the resolved formula.
      this.terms = attachNestedDice(this.constructor.constructTerms(String(formula ?? ''), data));
      this._formula = this.resetFormula();
      this.result = '';
      this._evaluated = false;
    }

    /**
     * The terms `new Roll(formula, data)` starts with. A static seam, so the shared test double
     * can replay terms recorded from real Foundry instead.
     *
     * @param {string} formula The roll expression.
     * @param {object} data Roll data.
     * @returns {Array<object>} Term instances.
     */
    static constructTerms(formula, data) {
      const substituted = replaceFormulaData(formula, data, { missing: '0' });
      return substituted.trim() ? labTermsFromParsed(parseLabTerms(substituted)) : [];
    }

    /** Core's live formula, re-rendered from the terms. */
    get formula() {
      return formulaOfTerms(this.terms);
    }

    /** Core's `resetFormula`: re-cache `_formula` after a term is mutated in place. */
    resetFormula() {
      this._formula = this.formula;
      return this._formula;
    }

    /** Core's `dice`: each top-level die, and the dice nested inside every other term. */
    get dice() {
      return this.terms.flatMap((term) => (isSelfDie(term) ? [term] : (term.dice ?? [])));
    }

    /** Core's `total` reads `_total`, which a count Roll sets to its net after evaluating. */
    get total() {
      return this._total;
    }

    set total(value) {
      this._total = value;
    }

    /**
     * Evaluate the terms, populating `total` and `dice`.
     *
     * @param {object} [_options] Ignored; accepted for signature parity with Foundry.
     * @returns {Promise<LabRoll>} This roll.
     */
    async evaluate(_options = {}) {
      if (this._evaluated) return this;
      // The live formula, so a term mutated in place rolls as mutated, as core's would.
      const masked = this.formula.replaceAll(FLAVOUR_SPAN, '');
      const dice = this.dice;
      let next = 0;
      const rolledOut = masked.replaceAll(DIE_TERM, (match, count, faces, ...modifiers) => {
        const shape = dieShape(count, faces);
        if (!shape) return match;
        const die = dice[next++];
        Object.assign(die, rollDieTerm(shape, modifiers, random));
        return String(die.total);
      });
      // Fail loudly on a die term this parser does not understand.
      if (UNPARSED_DIE.test(rolledOut)) {
        throw new Error(
          `View Lab Roll cannot evaluate "${this.formula}": the die term in "${rolledOut}" uses a ` +
            'modifier this harness does not implement (only NdS with kh/kl or an explosion). Extend ' +
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
     * Core's `evaluateSync`: `maximize` or `minimize` reads every kept die at a face extreme, which
     * is how the rollability floor proves a formula; dice under neither option throw, as core's
     * do. The total is left as computed, so a non-finite one reaches the caller.
     *
     * @param {{ maximize?: boolean, minimize?: boolean }} [options] Options.
     * @returns {LabRoll} This roll.
     */
    evaluateSync({ maximize = false, minimize = false } = {}) {
      const masked = this.formula.replaceAll(FLAVOUR_SPAN, '');
      const extreme = masked.replaceAll(DIE_TERM, (match, count, faces, keep, keepCount) => {
        const shape = dieShape(count, faces);
        if (!shape) return match;
        if (!maximize && !minimize) {
          throw new Error(`View Lab Roll cannot evaluate "${this.formula}" synchronously`);
        }
        const kept = keep
          ? Math.min(keepCount === '' ? 1 : Number(keepCount), shape.number)
          : shape.number;
        return String(kept * (maximize ? shape.sides : 1));
      });
      this.total = evaluateNumericExpression(extreme);
      this.result = extreme;
      this._evaluated = true;
      return this;
    }

    /** Core's `clone`: a fresh, unevaluated Roll of the cached `_formula`. */
    clone() {
      return new this.constructor(this._formula, this.data, this.options);
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
        dice: this.dice.map(dieJson),
        formula: this._formula,
        terms: this.terms.map((term) => term.toJSON()),
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
        // Core resolves a snapshot's class through `CONFIG.Dice.rolls`, as the count Roll needs.
        const registered = globalThis.CONFIG?.Dice?.rolls?.find((cls) => cls.name === data.class);
        if (registered && registered !== this) return registered.fromData(data);
        throw new Error(`View Lab Roll cannot reconstruct ${data.class}`);
      }
      const snapshot = structuredClone(data);
      // Core constructs from the cached formula, then overwrites the terms with the snapshot's.
      const roll = new this(snapshot.formula, snapshot.data, snapshot.options);
      const revived = (snapshot.terms ?? []).map((term) =>
        labTermFromData(term, this.TERM_CLASSES)
      );
      if (revived.length > 0 && revived.every(Boolean)) roll.terms = revived;
      if (snapshot.evaluated ?? true) {
        roll.total = snapshot.total;
        roll._evaluated = true;
        // Rebuild only the lab's diagnostic expression, using saved group totals. Never
        // reduce the expression or evaluate the dice again: the stored total is authoritative.
        const dice = roll.dice;
        let dieIndex = 0;
        roll.result = roll.formula
          .replaceAll(FLAVOUR_SPAN, '')
          .replaceAll(DIE_TERM, () => String(dice[dieIndex++]?.total));
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
