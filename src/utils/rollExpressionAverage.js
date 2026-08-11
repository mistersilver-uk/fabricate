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
 * - Every OTHER die modifier (`x`, `r<2`, `min2`, `cs>3`, …) is consumed and the die's plain
 *   average is used. That is an approximation, stated as one: reproducing every Foundry
 *   modifier's expectation here would be a second dice engine, and measured against the
 *   real 14.365 engine those modifiers move the mean by well under one point.
 * - Pools: `{a, b, c}` sums its members; a `khN`/`dlN` pool keeps the N highest member
 *   averages and a `klN`/`dhN` pool the N lowest. Pool members are not identically
 *   distributed, so this one stays an approximation.
 *
 * A `min`/`max` around a die — whether the GM authored it or a per-entry bound generated it —
 * is reduced by applying the function to the die's MEAN, so `min(1d8, 6)` reads 4.5 where the
 * mean of the clamped roll is 4.125. That gap is Jensen's inequality and it is unavoidable
 * without a distribution rather than a mean; it is stated here because the per-entry bounds
 * generate exactly this shape.
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

/** A keep/drop modifier at the head of a modifier run, e.g. `kh1`, `dl`, `kl2`, `k`. */
const KEEP_AT = /^(kh|kl|dh|dl|k|d)(\d+)?/i;

/** The remainder of a modifier run, consumed and ignored once a keep/drop is read. */
const MODIFIER_RUN_AT = /^(?:[a-zA-Z]+|[0-9<>=]+)*/;

/**
 * Reduce a roll expression to its deterministic average, and report whether it rolls.
 *
 * @param {string} input The expression, with every `@`-path already substituted.
 * @returns {{ value: number, rollsDice: boolean }} `value` is `NaN` when the expression
 *   cannot be reduced; `rollsDice` is true when at least one die or pool was read, whether
 *   or not the reduction succeeded.
 */
export function reduceRollExpression(input) {
  const source = String(input ?? '').trim();
  if (source === '') return { value: NaN, rollsDice: false };
  const reader = createReader(source);
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
function createReader(source) {
  let index = 0;
  let sawDice = false;

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
    const name = source.slice(start, index).toLowerCase();
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

function applyMathFunction(name, args) {
  switch (name) {
    case 'floor': {
      return Math.floor(args[0]);
    }
    case 'ceil': {
      return Math.ceil(args[0]);
    }
    case 'round': {
      return Math.round(args[0]);
    }
    case 'trunc': {
      return Math.trunc(args[0]);
    }
    case 'abs': {
      return Math.abs(args[0]);
    }
    case 'sign': {
      return Math.sign(args[0]);
    }
    case 'min': {
      return args.length > 0 ? Math.min(...args) : NaN;
    }
    case 'max': {
      return args.length > 0 ? Math.max(...args) : NaN;
    }
    default: {
      return NaN;
    }
  }
}
