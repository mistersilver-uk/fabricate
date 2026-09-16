/**
 * The DETERMINISTIC reduction of a roll expression to one number, and whether it rolls dice at all
 * (issue 1118). The average RANKS `highest` and `playerPicks`' non-interactive fallback and never
 * pays, so an approximation costs a mis-ranked entry, never a wrong payout. Keep/drop is exact via
 * {@link keptDiceAverage}; every other die modifier falls back to the plain average, which is wrong
 * by ~10 for the counting family (`cs`/`cf`). Anything unreducible is `NaN`, which every caller
 * reads as "contributes nothing". Import-free and Foundry-free.
 */

/** Foundry's configured single-letter denominations (`CONFIG.Dice.terms`). */
const DENOMINATION_AVERAGES = new Map([
  ['f', 0],
  ['c', 0.5],
]);

/**
 * A die at the current offset: an optional integer count, `d`, and faces that are either a run of
 * digits or one of Foundry's configured denominations.
 */
const DIE_AT = /^(\d+)?[dD](\d+|[fFcC])((?:[a-zA-Z]+|[0-9<>=]+)*)/;

/** A keep/drop modifier at the head of a modifier run, e.g. */
const KEEP_AT = /^(kh|kl|dh|dl|k|d(?![fF]))(\d+)?/i;

/** The remainder of a modifier run, consumed and ignored once a keep/drop is read. */
const MODIFIER_RUN_AT = /^(?:[a-zA-Z]+|[0-9<>=]+)*/;

/** Reduce a roll expression to its deterministic average, and report whether it rolls. */
export function reduceRollExpression(input, { dieValue = null } = {}) {
  const source = String(input ?? '').trim();
  if (source === '') return { value: NaN, rollsDice: false };
  const reader = createReader(source, dieValue);
  const value = reader.parseExpression();
  reader.skipWhitespace();
  // Trailing text the walk could not consume means the expression is not this grammar's, so the
  // reduction is refused rather than reported from a prefix of it.
  const complete = reader.atEnd();
  return {
    value: complete && Number.isFinite(value) ? value : NaN,
    rollsDice: reader.rollsDice(),
  };
}

/** The recursive-descent reader. */
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
    // A die is tried FIRST, so `1d6` is not read as the number 1 and `d20` is not read as a call to
    // a function named `d`.
    const die = matchAt(DIE_AT);
    if (die) return dieAverage(Number(die[1] ?? 1), die[2], die[3]);
    const character = source[index];
    if (character === '(') return parseParenthetical();
    if (character === '{') return parsePool();
    if (/[a-zA-Z_]/.test(character)) return parseFunction();
    return parseNumber();
  }

  /** A parenthesised expression, which may itself be a die's COUNT (`(2)d6`). */
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
      // BEFORE the shape checks below, deliberately: a substituting caller is answering for this
      // die itself, and it is the one that gets to decide which shapes it can answer for.
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

  /** How many of `count` dice a keep/drop modifier leaves standing. */
  function keepCount(count, modifiers) {
    const keep = KEEP_AT.exec(modifiers ?? '');
    if (!keep) return count;
    return resolveKeptCount(count, keep[1].toLowerCase(), keep[2]);
  }

  /** A dice POOL. */
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
    // NOT lowercased: `FunctionTerm#function` resolves `Math[fn]` case-sensitively, so `MAX(1d4,
    // 2)` is a function Foundry cannot call and this walk must not pretend it can.
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

/** Whether a keep/drop mode retains the HIGHEST results. */
function keepsHighest(mode) {
  return ['k', 'kh', 'd', 'dl'].includes(mode);
}

/** How many of `count` results a keep/drop modifier leaves, clamped to `[0, count]`. */
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

/**
 * Above this the order-statistics walk stops being worth its cost; fall back to the plain average.
 */
const KEPT_DICE_LIMITS = Object.freeze({ count: 200, sides: 1000 });

/**
 * The EXACT expected sum of the kept dice of `count` identical `sides`-sided dice under a keep/drop
 * modifier.
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

/** `E[min(cap, B)]` for `B ~ Binomial(trials, probability)`, as `Σ_{m=1..cap} P(B >= m)`. */
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
 * Foundry's own Math extensions (`common/primitives/math.mjs`), which a formula may call and a bare
 * `Math` in Node does not carry.
 */
const FOUNDRY_MATH_EXTENSIONS = Object.freeze({
  clamp: (value, min, max) => Math.min(Math.max(value, min), max),
  mix: (a, b, weight) => a * weight + b * (1 - weight),
  toDegrees: (radians) => (radians * 180) / Math.PI,
  toRadians: (degrees) => (degrees * Math.PI) / 180,
});

/** Apply a function term, MIRRORING Foundry's own resolution rather than curating a list. */
function applyMathFunction(name, args) {
  if (name === 'random') return NaN;
  const fn = FOUNDRY_MATH_EXTENSIONS[name] ?? Math[name];
  if (typeof fn !== 'function') return NaN;
  // `Math.min()` / `Math.max()` with no arguments answer ±Infinity, which is not a contribution any
  // formula could produce; the finite test at the top of the walk refuses it.
  const value = fn(...args);
  return typeof value === 'number' ? value : NaN;
}
