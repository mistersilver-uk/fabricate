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
import { evaluateNumericExpression } from '../../../src/systems/craftingModifierResolver.js';

/**
 * `NdS` with an optional keep-highest / keep-lowest modifier.
 *
 * `kh`/`kl` are the only modifiers any production path emits: `applyD20Advantage` in
 * `src/utils/craftingCheckExpression.js` rewrites a plain `1d20` to `2d20kh1` / `2d20kl1` for
 * advantage and disadvantage, and nothing else in `src/` rewrites a formula. A term this pattern
 * does not understand is left in place for `evaluateNumericExpression` to reject, which surfaces
 * as a visibly wrong frame rather than as a silently plausible number.
 */
const DIE_TERM = /(\d*)d(\d+)(?:(kh|kl)(\d*))?/gi;

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
      const arithmetic = substituted.replaceAll(
        DIE_TERM,
        (match, count, faces, keep, keepCount) => {
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
          // `active` is OMITTED on a kept die, exactly as Foundry omits it, so
          // `rolledDiceGroups`' `entry?.active !== false` filter is exercised against its real
          // shape rather than against an always-present boolean that would hide a regression.
          const results = rolls.map((result, index) =>
            keep && !kept.has(index) ? { result, active: false } : { result }
          );
          const total = rolls.reduce(
            (sum, result, index) => (!keep || kept.has(index) ? sum + result : sum),
            0
          );
          const die = { number, faces: sides, results, total };
          this.dice.push(die);
          this.terms.push(die);
          return String(total);
        }
      );
      const value = evaluateNumericExpression(arithmetic);
      this.total = Number.isFinite(value) ? value : 0;
      this.result = arithmetic;
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
