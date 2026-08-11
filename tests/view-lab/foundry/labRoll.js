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
  };
}
