/**
 * The DETERMINISTIC reduction of a roll expression to one number, and the answer to
 * whether it rolls dice at all (issue 1118).
 *
 * A check modifier may roll (`1d4`), and the combination rules that RANK modifiers —
 * `highest`, and `playerPicks`' non-interactive best-N fallback — need one number per
 * entry to rank by. That number is the expression's AVERAGE: `1d4` is 2.5, so it beats a
 * flat `+2`, and the winner is decided the same way on every attempt without rolling
 * anything. A rank taken by rolling would pick a different winner each time and would
 * spend a hidden roll nobody sees.
 *
 * The same walk answers BOTH questions, which is the point of putting them in one
 * function: `rollsDice` is a fact the parser observes while reducing, not a second
 * regex-shaped opinion about the same text. Two independent deciders is exactly how
 * `isRollExpression` came to exist in two complementary-but-unequal spellings before issue
 * 1117 merged them.
 *
 * WHAT IT SUPPORTS, stated as a limit rather than implied by omission:
 *
 * - `+ - * / %`, parentheses, unary signs, decimals.
 * - The roll-data math functions `floor`/`ceil`/`round`/`trunc`/`abs`/`sign`/`min`/`max`.
 * - Dice: `NdS`, bare `dS`, a parenthesised count (`(2)d6`), and Foundry's configured
 *   denominations `dF` (Fate, average 0 per die) and `dC` (Coin, average 0.5). `N` defaults
 *   to 1. `d%` is deliberately absent: `Roll.parse('1d%')` THROWS on 14.365, because the
 *   grammar's faces production is `[a-z]i / Parenthetical / Constant` and `%` is none of
 *   them, so an average for it would be an average of a formula that cannot roll.
 * - A die's KEEP/DROP modifier (`kh`, `kl`, `dh`, `dl`, `k`, `d`, each with an optional
 *   count) is EXACT, via {@link keptDiceAverage}. It is the one modifier worth computing
 *   properly: `2d20kh1` averages 13.825 and its plain sum is 21, so ranking it plainly
 *   would make an advantage-shaped modifier win `highest` against everything.
 * - Every OTHER die modifier is consumed and the die's PLAIN average is used. That is an
 *   approximation, and the envelope below is MEASURED (40 000 real rolls each on 14.365)
 *   rather than asserted, because the first version of this note claimed "well under one
 *   point" and two whole families of modifier are nowhere near that:
 *
 *   | modifier family        | example       | computed | measured | note                    |
 *   |------------------------|---------------|----------|----------|-------------------------|
 *   | explode / reroll / min | `1d6x`        | 3.5      | 4.22     | within ~1 point         |
 *   |                        | `2d10r1`      | 11       | 11.92    |                         |
 *   |                        | `2d6min2`     | 7        | 7.33     |                         |
 *   |                        | `2d6max4`     | 7        | 6.00     |                         |
 *   | COUNTING (`cs`/`cf`)   | `1d20cs>15`   | 10.5     | 0.25     | **wrong by ~10**        |
 *   |                        | `2d6cs>=5`    | 7        | 0.67     |                         |
 *
 *   `cs` and `cf` are not a distribution shift at all: they change what the total MEANS, from
 *   a sum of faces to a COUNT OF SUCCESSES. No plain average can approximate that, and this
 *   module does not try — it reports the face-sum average and the ranking it feeds is simply
 *   wrong for such an entry. `df` (count failures) is the same family and used to be worse
 *   still: the keep/drop pattern read its `d` as a drop-one and answered 0 against a measured
 *   9.8, which is what the `(?![fF])` guard on {@link KEEP_AT} exists for.
 * - Pools: `{a, b, c}` sums its members; a `khN`/`dlN` pool keeps the N highest member
 *   averages and a `klN`/`dhN` pool the N lowest. Pool members are not identically
 *   distributed, so this one stays an approximation.
 *
 * ANY NONLINEAR FUNCTION applied to a die is reduced by applying it to the die's MEAN, so
 * `min(1d8, 6)` reads 4.5 against a measured 4.12 and `pow(1d4, 2)` reads 6.25 against 7.50.
 * That gap is Jensen's inequality and it is unavoidable without a distribution rather than a
 * mean; it is stated here because the per-entry bounds generate exactly this shape on every
 * bounded rolling entry.
 *
 * THE AVERAGE RANKS; IT NEVER PAYS. Nothing here decides what a modifier contributes to a
 * roll — the authored dice reach the formula verbatim and Foundry rolls them, bounds and all.
 * This number only decides WHICH modifiers `highest` and `playerPicks`' non-interactive
 * fallback select, so an approximation costs a mis-ranked exotic entry and never a wrong
 * payout.
 *
 * Anything it cannot reduce is `NaN`, and every caller treats `NaN` as "contributes
 * nothing" — the same answer an unresolvable expression has always produced. The module is
 * import-free and Foundry-free, so the pure resolver, the manager and the tests all reduce
 * the same way.
 */

/** Foundry's configured single-letter denominations (`CONFIG.Dice.terms`). */
const DENOMINATION_AVERAGES = new Map([
  ['f', 0],
  ['c', 0.5],
]);

/**
 * A die at the current offset: an optional integer count, `d`, and faces that are either a
 * run of digits or one of Foundry's configured denominations.
 *
 * The faces alternation is DELIBERATELY NOT `[a-z]`, even though the grammar's is
 * (`grammar.pegjs`: `faces:([a-z]i / Parenthetical / Constant)`). A permissive letter class
 * makes `damage` parse as "one `d`, faces `a`, modifiers `mage`", so a function name or a
 * stray word would be silently read as a die. Restricting faces to the denominations
 * `CONFIG.Dice.terms` actually configures — plus `%` — keeps the false positives out; a
 * denomination Foundry does not configure could not have rolled anyway.
 */
const DIE_AT = /^(\d+)?[dD](\d+|[fFcC])((?:[a-zA-Z]+|[0-9<>=]+)*)/;

/**
 * A keep/drop modifier at the head of a modifier run, e.g. `kh1`, `dl`, `kl2`, `k`.
 *
 * The bare `d` alternative is guarded with `(?![fF])` so `df` — Foundry's count-failures
 * modifier — is not read as a drop-one. Unanchored, `1d20df<5` parsed as "drop 1 of 1 die",
 * reducing to 0 against a measured mean of 9.8.
 */
const KEEP_AT = /^(kh|kl|dh|dl|k|d(?![fF]))(\d+)?/i;

/** The remainder of a modifier run, consumed and ignored once a keep/drop is read. */
const MODIFIER_RUN_AT = /^(?:[a-zA-Z]+|[0-9<>=]+)*/;

/**
 * Reduce a roll expression to its deterministic average, and report whether it rolls.
 *
 * `dieValue` REPLACES a die's contribution with a caller-supplied number, and it is what lets
 * the Checks Studio's odds histogram enumerate rather than approximate (issue 1097). Called
 * once per die IN READING ORDER — which is stable, because this is a deterministic
 * recursive-descent walk — it lets a caller pin each die to a concrete face and read the
 * expression's exact total for that assignment, functions, bounds, pools and all.
 *
 * It is a HOOK ON THIS WALK rather than a second one for the same reason `rollsDice` is: a
 * caller that enumerated by scanning `NdS` out of the string would be a second opinion about
 * where the dice are, and would read a clamp's bound arguments (`min(max((1d8), -1), 6)`) as
 * flat addends the moment a check modifier started rolling. There is one reader, and the
 * enumeration is a different question asked of it.
 *
 * Returning `undefined` from the hook falls through to the average, so a caller may pin some
 * dice and average the rest.
 *
 * @param {string} input The expression, with every `@`-path already substituted.
 * @param {object} [options] Options.
 * @param {?(die: {ordinal: number, count: number, faces: string, modifiers: string}) => (number|undefined)}
 *   [options.dieValue] Per-die substitution.
 * @returns {{ value: number, rollsDice: boolean }} `value` is `NaN` when the expression
 *   cannot be reduced; `rollsDice` is true when at least one die or pool was read, whether
 *   or not the reduction succeeded.
 */
export function reduceRollExpression(input, { dieValue = null } = {}) {
  const source = String(input ?? '').trim();
  if (source === '') return { value: NaN, rollsDice: false };
  const reader = createReader(source, dieValue);
  const value = reader.parseExpression();
  reader.skipWhitespace();
  // Trailing text the walk could not consume means the expression is not this grammar's,
  // so the reduction is refused rather than reported from a prefix of it.
  const complete = reader.atEnd();
  return {
    value: complete && Number.isFinite(value) ? value : NaN,
    rollsDice: reader.rollsDice(),
  };
}

/**
 * The recursive-descent reader. Built per call so the cursor and the `rollsDice` flag are
 * per-reduction state rather than module state.
 * @param {string} source
 */
function createReader(source, dieValue = null) {
  let index = 0;
  let sawDice = false;
  let dieOrdinal = 0;

  const skipWhitespace = () => {
    while (index < source.length && /\s/.test(source[index])) index += 1;
  };

  /** Consume an optional trailing `[flavor]` label, which contributes no value. */
  const skipFlavor = () => {
    if (source[index] !== '[') return;
    const close = source.indexOf(']', index);
    index = close === -1 ? source.length : close + 1;
  };

  const matchAt = (pattern) => {
    const match = pattern.exec(source.slice(index));
    if (match) index += match[0].length;
    return match;
  };

  function parseExpression() {
    let left = parseTerm();
    for (;;) {
      skipWhitespace();
      const operator = source[index];
      if (operator !== '+' && operator !== '-') return left;
      index += 1;
      const right = parseTerm();
      left = operator === '+' ? left + right : left - right;
    }
  }

  function parseTerm() {
    let left = parseUnary();
    for (;;) {
      skipWhitespace();
      const operator = source[index];
      if (!['*', '/', '%'].includes(operator)) return left;
      index += 1;
      const right = parseUnary();
      if (operator === '*') left *= right;
      else if (operator === '/') left = right === 0 ? NaN : left / right;
      else left = right === 0 ? NaN : left % right;
    }
  }

  function parseUnary() {
    skipWhitespace();
    if (source[index] === '+') {
      index += 1;
      return parseUnary();
    }
    if (source[index] === '-') {
      index += 1;
      return -parseUnary();
    }
    return parsePrimary();
  }

  function parsePrimary() {
    skipWhitespace();
    // A die is tried FIRST, so `1d6` is not read as the number 1 and `d20` is not read as a
    // call to a function named `d`.
    const die = matchAt(DIE_AT);
    if (die) return dieAverage(Number(die[1] ?? 1), die[2], die[3]);
    const character = source[index];
    if (character === '(') return parseParenthetical();
    if (character === '{') return parsePool();
    if (/[a-zA-Z_]/.test(character)) return parseFunction();
    return parseNumber();
  }

  /**
   * A parenthesised expression, which may itself be a die's COUNT (`(2)d6`).
   *
   * The closing bracket is REQUIRED. Every closer below is, and that is a rule about what a
   * reduction may claim rather than strictness for its own sake: `{1d6` would otherwise
   * reduce to 3.5 and read as a working modifier, when what the GM authored cannot roll at
   * all.
   */
  function parseParenthetical() {
    index += 1;
    const value = parseExpression();
    skipWhitespace();
    if (source[index] !== ')') return NaN;
    index += 1;
    const die = matchAt(DIE_AT);
    if (die) return dieAverage(value, die[2], die[3]);
    skipFlavor();
    return value;
  }

  function parseNumber() {
    skipWhitespace();
    const start = index;
    while (index < source.length && /[0-9.]/.test(source[index])) index += 1;
    if (index === start) return NaN;
    const value = Number(source.slice(start, index));
    skipFlavor();
    return Number.isFinite(value) ? value : NaN;
  }

  function dieAverage(count, faces, modifiers) {
    sawDice = true;
    skipFlavor();
    if (dieValue) {
      // BEFORE the shape checks below, deliberately: a substituting caller is answering for
      // this die itself, and it is the one that gets to decide which shapes it can answer
      // for. The ordinal is the die's position in reading order, which is what lets a caller
      // hold one assignment across repeated reductions of the same expression.
      const substituted = dieValue({
        ordinal: dieOrdinal++,
        count,
        faces: String(faces),
        modifiers: modifiers ?? '',
      });
      if (substituted !== undefined) return substituted;
    }
    if (!Number.isFinite(count)) return NaN;
    const denomination = DENOMINATION_AVERAGES.get(String(faces).toLowerCase());
    if (denomination !== undefined) return keepCount(count, modifiers) * denomination;
    const sides = Number(faces);
    if (!Number.isInteger(sides) || sides < 1) return NaN;
    const keep = KEEP_AT.exec(modifiers ?? '');
    if (!keep) return (count * (sides + 1)) / 2;
    return keptDiceAverage(count, sides, keep[1].toLowerCase(), keep[2]);
  }

  /**
   * How many of `count` dice a keep/drop modifier leaves standing.
   *
   * Used only for the denominations whose faces are not a number (`dF`, `dC`), where the
   * kept dice are scaled by the plain per-die average. That is an APPROXIMATION, not the
   * order statistics {@link keptDiceAverage} computes for a numeric die: keeping the highest
   * biases the survivors upward, so `3dFkh1` reads 0 here against a measured 0.67. The exact
   * walk needs a face count, which these denominations do not carry as a number.
   */
  function keepCount(count, modifiers) {
    const keep = KEEP_AT.exec(modifiers ?? '');
    if (!keep) return count;
    return resolveKeptCount(count, keep[1].toLowerCase(), keep[2]);
  }

  /**
   * A dice POOL. Members sum by default; a keep/drop modifier takes that many of the
   * highest (`kh`/`dl`) or lowest (`kl`/`dh`) member averages instead.
   */
  function parsePool() {
    sawDice = true;
    index += 1;
    const members = [parseExpression()];
    skipWhitespace();
    while (source[index] === ',') {
      index += 1;
      members.push(parseExpression());
      skipWhitespace();
    }
    if (source[index] !== '}') return NaN;
    index += 1;
    const keep = matchAt(KEEP_AT);
    matchAt(MODIFIER_RUN_AT);
    skipFlavor();
    if (members.some((member) => !Number.isFinite(member))) return NaN;
    return sumOf(keep ? keptMembers(members, keep[1].toLowerCase(), keep[2]) : members);
  }

  function parseFunction() {
    const start = index;
    while (index < source.length && /[a-zA-Z_]/.test(source[index])) index += 1;
    // NOT lowercased: `FunctionTerm#function` resolves `Math[fn]` case-sensitively, so
    // `MAX(1d4, 2)` is a function Foundry cannot call and this walk must not pretend it can.
    const name = source.slice(start, index);
    skipWhitespace();
    const args = [];
    if (source[index] !== '(') return NaN;
    index += 1;
    skipWhitespace();
    if (source[index] !== ')') {
      args.push(parseExpression());
      skipWhitespace();
      while (source[index] === ',') {
        index += 1;
        args.push(parseExpression());
        skipWhitespace();
      }
    }
    if (source[index] !== ')') return NaN;
    index += 1;
    skipFlavor();
    return applyMathFunction(name, args);
  }

  return {
    parseExpression,
    skipWhitespace,
    atEnd: () => index >= source.length,
    rollsDice: () => sawDice,
  };
}

/**
 * Whether a keep/drop mode retains the HIGHEST results. `k`/`kh` keep the highest and `d`/`dl`
 * drop the lowest, which are the same retention; `kl` and `dh` are the mirror pair.
 */
function keepsHighest(mode) {
  return ['k', 'kh', 'd', 'dl'].includes(mode);
}

/**
 * How many of `count` results a keep/drop modifier leaves, clamped to `[0, count]`.
 *
 * A `k`-family modifier's number is how many to KEEP; a `d`-family modifier's number is how
 * many to DROP, so the two read their count from opposite ends. Both default to 1, matching
 * Foundry's own defaults.
 */
function resolveKeptCount(count, mode, rawCount) {
  const parsed = Number.parseInt(rawCount ?? '1', 10);
  const magnitude = Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
  const kept = mode.startsWith('k') ? magnitude : count - magnitude;
  return Math.min(Math.max(kept, 0), count);
}

/** The member averages a pool's keep/drop modifier retains, highest or lowest first. */
function keptMembers(members, mode, rawCount) {
  const kept = resolveKeptCount(members.length, mode, rawCount);
  const highest = keepsHighest(mode);
  const ordered = [...members].sort((left, right) => (highest ? right - left : left - right));
  return ordered.slice(0, kept);
}

/** Above this the order-statistics walk stops being worth its cost; fall back to the plain average. */
const KEPT_DICE_LIMITS = Object.freeze({ count: 200, sides: 1000 });

/**
 * The EXACT expected sum of the kept dice of `count` identical `sides`-sided dice under a
 * keep/drop modifier.
 *
 * The identity is the one that needs no order-statistic table: for the top `keep` of N iid
 * dice,
 *
 * ```text
 * E[kept sum] = Σ_{t=1..sides} E[ min(keep, #{i : X_i >= t}) ]
 *             = Σ_{t=1..sides} Σ_{m=1..keep} P( Binomial(count, q_t) >= m ),  q_t = (sides-t+1)/sides
 * ```
 *
 * because a die contributes 1 to the kept sum for every threshold `t` it meets, and at most
 * `keep` dice are counted at each threshold. Keeping the LOWEST is the same problem under the
 * face reflection `X → sides + 1 - X`, which maps a fair die onto itself and reverses the
 * order, so `E[bottom k] = k * (sides + 1) - E[top k]`.
 *
 * Verified against the shipped 14.365 engine: `2d20kh1` → 13.825 here against a measured
 * 13.8 over 40 000 rolls, where the plain sum would have said 21.
 *
 * @param {number} count The number of dice ROLLED.
 * @param {number} sides
 * @param {'kh'|'kl'|'dh'|'dl'|'k'|'d'} mode
 * @param {string|undefined} rawCount
 * @returns {number}
 */
function keptDiceAverage(count, sides, mode, rawCount) {
  const plain = (count * (sides + 1)) / 2;
  if (count > KEPT_DICE_LIMITS.count || sides > KEPT_DICE_LIMITS.sides) return plain;
  const keep = resolveKeptCount(count, mode, rawCount);
  if (keep <= 0) return 0;
  if (keep >= count) return plain;
  let topSum = 0;
  for (let threshold = 1; threshold <= sides; threshold += 1) {
    topSum += expectedCappedCount(count, (sides - threshold + 1) / sides, keep);
  }
  return keepsHighest(mode) ? topSum : keep * (sides + 1) - topSum;
}

/**
 * `E[min(cap, B)]` for `B ~ Binomial(trials, probability)`, as `Σ_{m=1..cap} P(B >= m)`.
 *
 * The tail probabilities are accumulated from the pmf rather than from a `Math.pow` per term,
 * so the walk is linear in `trials` and free of the catastrophic cancellation a
 * complement-of-a-sum would carry at the extremes.
 */
function expectedCappedCount(trials, probability, cap) {
  if (probability >= 1) return Math.min(cap, trials);
  if (probability <= 0) return 0;
  const ratio = probability / (1 - probability);
  let mass = (1 - probability) ** trials;
  // `below` accumulates P(B <= m-1); each term of the sum is 1 - that.
  let below = mass;
  let expectation = 0;
  for (let m = 1; m <= cap; m += 1) {
    expectation += 1 - below;
    mass *= ((trials - m + 1) / m) * ratio;
    below += mass;
  }
  return expectation;
}

function sumOf(values) {
  return values.reduce((total, value) => total + value, 0);
}

/**
 * Foundry's own Math extensions (`common/primitives/math.mjs`), which a formula may call and
 * a bare `Math` in Node does not carry. `clamp` is the one that matters for a modifier: a GM
 * who writes `clamp(1d8, 1, 6)` is expressing exactly the bound this module is built around.
 */
const FOUNDRY_MATH_EXTENSIONS = Object.freeze({
  clamp: (value, min, max) => Math.min(Math.max(value, min), max),
  mix: (a, b, weight) => a * weight + b * (1 - weight),
  toDegrees: (radians) => (radians * 180) / Math.PI,
  toRadians: (degrees) => (degrees * Math.PI) / 180,
});

/**
 * Apply a function term, MIRRORING Foundry's own resolution rather than curating a list.
 *
 * `FunctionTerm#function` is `CONFIG.Dice.functions[fn] ?? Math[fn]`, and `CONFIG.Dice.functions`
 * is `{}`, so what a formula may call is exactly "a function on `Math`", CASE-SENSITIVELY. This
 * used to be a lowercasing switch over eight names, and it was wrong in both directions:
 *
 * - It ACCEPTED `MAX(1d4, 2)`, because it lowercased first. Foundry does not: `Math.MAX` is
 *   `undefined` and `FunctionTerm#_evaluateAsync` THROWS `The function "MAX" is not registered
 *   in CONFIG.Dice.functions`. A GM who capitalised a function therefore had a modifier this
 *   module said was worth 2.5 and a formula that could not roll at all.
 * - It REFUSED `pow`, `sqrt`, `clamp` and every other real `Math` member, so an entry Foundry
 *   would happily roll silently contributed nothing.
 *
 * `Math.random` is excluded by name: it is the one `Math` member that is not a function of its
 * arguments, and this module's whole contract is a number derived from the TEXT.
 *
 * A nonlinear function applied to a die's MEAN is an approximation (Jensen's inequality) — see
 * the module header. It is the same approximation `min`/`max` carry and is called out there.
 *
 * @param {string} name The function name, exactly as authored.
 * @param {number[]} args
 * @returns {number} `NaN` for a name Foundry could not resolve either.
 */
function applyMathFunction(name, args) {
  if (name === 'random') return NaN;
  const fn = FOUNDRY_MATH_EXTENSIONS[name] ?? Math[name];
  if (typeof fn !== 'function') return NaN;
  // `Math.min()` / `Math.max()` with no arguments answer ±Infinity, which is not a
  // contribution any formula could produce; the finite test at the top of the walk refuses it.
  const value = fn(...args);
  return typeof value === 'number' ? value : NaN;
}
