/**
 * A real `Roll` constructor for the View Lab.
 *
 * WHY THIS EXISTS, and why the file it replaces argued against it.
 *
 * `LAB_ROLL` in `installFoundryShim.js` was two pure string statics and no constructor, and its
 * header said rolling "must not be" implemented: "a lab that could roll would invite fixtures
 * whose frames depend on an outcome this harness does not actually compute." That objection is
 * answered here rather than ignored — the outcome IS computed, from the same seeded stream every
 * other lab entropy source draws from, so a frame's content is a function of the fixture and the
 * seed and of nothing else. What the old note did not account for is the cost of the omission:
 * `evaluateCheckRoll` (`src/systems/checkRoll.js`) returns `{engine: false}` on
 * `typeof globalThis.Roll !== 'function'` BEFORE it calls `options.prompt`, so with a plain object
 * installed NO crafting, salvage or alchemy roll prompt could open in this harness at all. The one
 * roll prompt the lab could reach was gathering's, and only because `GatheringEngine`'s d100 path
 * calls `promptCheckRoll` directly. Photographing the crafting check dialog — issue 855's whole
 * new surface — was impossible until this file existed.
 *
 * The two existing craft frames (`player-crafting-run-summary`, `player-crafting-roll-result`)
 * previously passed their check by riding that same `engine: false` short-circuit, which does not
 * block the activity. They now roll for real. At seed 20260601 the first d20 on a page is a 20, so
 * smithing's `1d20 + @abilities.int.mod` (int mod 3) totals 23 against a threshold of 12 — a pass
 * with margin. That margin is deliberate but it is a FIXTURE property, not a guarantee this file
 * makes: change the seed or the threshold and those frames can change with it.
 *
 * The arithmetic reducer is production's own `evaluateNumericExpression`, not a second parser
 * written here. A private parser is how the lab would start quietly disagreeing with the resolver
 * about what a formula means.
 */
import { evaluateNumericExpression } from '../../../src/systems/checkModifierResolver.js';

/**
 * `NdS` with an optional keep-highest / keep-lowest modifier.
 *
 * `kh`/`kl` are the only modifiers any production path emits: `applyD20Advantage` in
 * `src/utils/craftingCheckExpression.js` rewrites a plain `1d20` to `2d20kh1` / `2d20kl1` for
 * advantage and disadvantage, and nothing else in `src/` rewrites a formula.
 *
 * A term this pattern does NOT understand is thrown on, by the `UNPARSED_DIE` check below.
 *
 * That check no longer stands where its own note said it did, and the note is corrected rather
 * than deleted because the correction is the interesting part. It cited `evaluateNumericExpression`
 * returning a partial parse with no end-of-input assertion — true when it was written, and false
 * twice over now: issue 1118 moved that walk into `reduceRollExpression`, gave it an end-of-input
 * assertion, and taught it dice, so `3d6dl1` and `1d20 + 1dF` both reduce correctly there. And the
 * two residues it cited were never what `UNPARSED_DIE` matched anyway — `/\dd\d/i` needs a DIGIT
 * on both sides of the `d`, so `dl1` and `dF` never reached it.
 *
 * The guard is kept, retargeted at what it can actually see: a die term whose faces are numeric
 * and which this pattern therefore left in the string. A term the pattern misses entirely still
 * escapes it, and that is stated rather than implied.
 */
const DIE_TERM = /(\d*)d(\d+)(?:(kh|kl)(\d*))?/gi;

/**
 * A Foundry flavour annotation, e.g. the `[Rune Stylus]` that `appendToolBonusTerms` emits.
 *
 * Foundry treats a bracketed span as inert label text. `DIE_TERM` does not, so a GM who names a
 * tool "Anvil d20 of Power" would otherwise have an extra d20 rolled out of its own label and the
 * label itself rewritten to the rolled face. Spans are lifted out before the die pass and put back
 * after, which keeps them verbatim in `result` without letting them reach the dice.
 */
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
     */
    constructor(formula, data = {}) {
      this.data = data;
      this.formula = String(formula ?? '');
      this.dice = [];
      this.terms = [];
      this.total = undefined;
      this.result = '';
      this._evaluated = false;
    }

    /**
     * Evaluate the formula, populating `total` and `dice`.
     *
     * `allowInteractive` is accepted and ignored: the lab never surfaces Foundry's manual
     * roll-fulfilment `RollResolver`, so `false` is already the behaviour and honouring `true`
     * would mean building a resolver no case can reach.
     *
     * Resolves to `this` because `checkRoll.js` assigns the awaited value back to its `roll`
     * local and then reads `.total` and `.dice` off it.
     *
     * @param {object} [_options] Ignored; accepted for signature parity with Foundry.
     * @returns {Promise<LabRoll>} This roll.
     */
    async evaluate(_options = {}) {
      if (this._evaluated) return this;
      // `missing: '0'` is Foundry's behaviour for a Roll constructed WITH data — an unresolved key
      // contributes nothing rather than poisoning the expression. The DISPLAY path in
      // `resolveCheckFormulaDisplay` deliberately passes `missing: 'NaN'` instead so it can DETECT
      // the same case and refuse to claim the formula resolved. That asymmetry is production's and
      // is preserved here rather than smoothed over.
      const substituted = replaceFormulaData(this.formula, this.data, { missing: '0' });
      // Strip flavour spans before the die pass. A span carries no value of its own —
      // Foundry attaches it to the preceding term — and `DIE_TERM` would otherwise roll
      // dice out of a GM's own label: measured, `1d20 + 2 [Anvil d20 of Power]` produced
      // TWO die groups and rewrote the label to a rolled face. Spans are dropped rather
      // than restored because nothing in `src/` reads `roll.result`; it is a diagnostic
      // here, not a rendered string.
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
        // `rolledDiceGroups` filters on `active !== false`, so it accepts an absent key too — but
        // emitting a shape production does not produce would make a later fidelity fix read as a
        // regression. The absent-key tolerance is production's contract and is covered there.
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
      // Fail loudly on a die term this parser does not understand. `evaluateNumericExpression`
      // would not: it returns its partial parse with no end-of-input assertion, so `3d6dl1` reads
      // as 9 and `1d20 + 1dF` as 21 — a plausible number for a formula the lab did not actually
      // evaluate. A thrown error surfaces through the driver's console-error gate as a named case
      // failure instead.
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
     * Post the roll to chat.
     *
     * Real rather than a no-op because `checkRoll.js` wraps this call in a try/catch that
     * `console.error`s on failure, and the capture driver fails a case on ANY console error — so a
     * missing `toMessage` would red every interactive frame instead of degrading quietly.
     *
     * @param {object} [messageData] Chat message data.
     * @param {object} [options] Options.
     * @param {string} [options.rollMode] Roll mode passthrough.
     * @param {boolean} [options.create] When false, return the data instead of creating.
     * @returns {Promise<object|null>} The created message, or the data when `create` is false.
     */
    async toMessage(messageData = {}, { rollMode, create = true } = {}) {
      const data = { ...messageData, rolls: [this], rollMode };
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
     * Parse a formula into roll TERMS, the way `Roll.parse` does.
     *
     * WHY THIS EXISTS. `CheckOddsPanel` calls `Roll.parse` on every render to decide
     * whether the check's outcome space can be enumerated. Without this static the lab's
     * `Roll` exposes only `replaceFormulaData` and `validate`, so every lab render of that
     * panel would either throw — and one bad case fails the whole capture job, publishing
     * NOTHING while `check-screenshots` stays green on stale frames — or degrade to "not
     * enumerable", making the required enumerable-histogram frame unproduceable.
     *
     * Order of operations matches `client/dice/roll.mjs` `Roll.parse`: substitute roll
     * data with `missing: "0"` FIRST, then parse. That order is load-bearing rather than
     * incidental — it is exactly why an unresolved `@` key is INVISIBLE to the parse and
     * has to be detected from `resolveCheckFormulaDisplay`'s `missing: 'NaN'` signal
     * instead, and a double that substituted afterwards would let a test "prove" a
     * detection production cannot make.
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
 * Every field below was read off `client/dice/terms/{dice,die,fate,coin}.mjs` in the
 * 14.365 release archive, and the two that look redundant are the ones that matter:
 *
 * - `DiceTerm#denomination` returns `this.constructor.DENOMINATION`, which `Die`
 *   OVERRIDES to `` `d${this.faces}` `` — so `denomination === 'd' + faces` is a real
 *   discriminator, and it is the ONLY one that separates a numeric die from a `FateDie`
 *   or a `Coin`.
 * - `FateDie`'s constructor assigns `termData.faces = 3` and `Coin`'s assigns `2`, so
 *   both report a perfectly INTEGRAL `faces`. A double that left their faces undefined
 *   would be looser than the real thing and would let `1df` pass a predicate the live
 *   client refuses — the exact false-pass class `Roll.validate`'s own lab double was
 *   caught producing.
 * - `DiceTerm#number` and `#faces` return `undefined` when the underlying value is an
 *   unevaluated sub-`Roll`, which is why `1d(1d4)` reports `faces: undefined` here.
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

/**
 * `NdS` with an optional trailing modifier run.
 *
 * The non-numeric denominations are `f` and `c` ONLY, because those are the two Foundry
 * core registers in `CONFIG.Dice.terms` beside `d`. Admitting `[a-z]` here would tokenize
 * an ordinary word — `dexterity` — as a fudge die with modifiers, which is the "silently
 * plausible number" this harness exists not to produce.
 */
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
 * It REFUSES rather than guesses. The real `Roll.parse` throws a peggy `SyntaxError` on
 * every intermediate keystroke of a formula a GM is still typing, and the enumerator's
 * whole `parse-threw` branch exists for that; a double that quietly accepted `1d20 +`
 * would leave that branch unexercised in the lab and let a capture run photograph a
 * histogram for a formula the live client cannot parse.
 *
 * @param {string} source The `@`-substituted formula.
 * @returns {Array<object>} Roll terms in infix order.
 * @throws {SyntaxError} On a malformed or half-typed formula.
 */
function parseLabTerms(source) {
  const terms = [];
  let cursor = 0;
  // `true` while the parser is waiting for a VALUE and `false` while it is waiting for an
  // operator. Ending on `true` is what makes a trailing `+` a syntax error rather than a
  // silently truncated parse.
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
    // `Die#denomination` is `` `d${this.faces}` `` — so the recorded 14.365 output really
    // is the literal string `"dundefined"`. It is reproduced rather than tidied: a double
    // that emitted a clean `"d"` would be a different shape from the real thing.
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
    const parts = inner.split(',').flatMap((part) => parseLabTerms(part));
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

  const fn = LAB_FUNCTION.exec(rest);
  if (fn) {
    const { inner, end } = readBalanced(source, cursor + fn[0].length - 1);
    // `FunctionTerm#isDeterministic` is `this.terms.every(t => Roll.create(t).isDeterministic)`,
    // so it recurses; a comma-separated argument list is parsed argument by argument.
    const parts = inner.split(',').flatMap((part) => parseLabTerms(part));
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
    // `ParentheticalTerm` carries BOTH a string `term` and an own `roll` slot, and
    // `isIntermediate = true`. Those are what tell it apart from a `StringTerm`, which
    // also carries a string `term` — see `checkOdds.js`'s `isStringTermLike`.
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
    // `StringTerm#isDeterministic` returns TRUE for a string the classifier cannot
    // resolve — and evaluating it then throws. The double reproduces the lie rather than
    // correcting it, because the predicate under test is the one that refuses it.
    terms.push({ class: 'StringTerm', term: word[0], isDeterministic: true });
    return word[0].length;
  }

  throw new SyntaxError(`Unexpected "${rest[0]}" in "${source}"`);
}
