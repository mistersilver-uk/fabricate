import {
  createExpressionReader,
  DICE_TERM,
  PATH_TOKEN,
  readFoundryPath,
  readStrictPath,
} from './expressionReader.js';

export { PATH_TOKEN } from './expressionReader.js';

/**
 * Tests a value against a target using the selected inclusive or strict boundary.
 * Under-direction checks reverse the value ordering without changing the boundary meaning.
 */
export function compareToTarget(value, target, comparison = 'meet', direction = 'over') {
  if (direction === 'under') return comparison === 'exceed' ? value < target : value <= target;
  return comparison === 'exceed' ? value > target : value >= target;
}

/** Returns whether the left value ranks ahead of the right value in the given direction. */
export function better(left, right, direction = 'over') {
  return direction === 'under' ? left < right : left > right;
}

/**
 * Returns a new best-first ranking without changing the supplied entries.
 * Equal values retain their authored order, and non-finite values rank last.
 */
export function rankBest(entries, valueOf, direction = 'over') {
  return [...entries].sort((left, right) => {
    const a = valueOf(left);
    const b = valueOf(right);
    const finiteA = Number.isFinite(a);
    if (finiteA !== Number.isFinite(b)) return finiteA ? -1 : 1;
    return better(a, b, direction) ? -1 : better(b, a, direction) ? 1 : 0;
  });
}

/** Returns a positive margin when the value is favorable in the given direction. */
export function effectiveMargin(value, target, direction = 'over') {
  return direction === 'under' ? target - value : value - target;
}

const THROWN_REASONS = ['unresolved-path', 'non-finite', 'dice'];

/**
 * Resolves dice-free arithmetic against roll data without substituting missing paths.
 * An unsuccessful result identifies whether the source was unresolved, dice-based, invalid, or non-finite.
 * Paths use the strict own-key reader unless `pathMode` is `'foundry'` ({@link readFoundryPath}).
 */
export function resolveDeterministicExpression(expression, rollData = {}, { pathMode } = {}) {
  if (typeof expression === 'number') {
    return Number.isFinite(expression)
      ? { ok: true, value: expression }
      : { ok: false, reason: 'non-finite' };
  }
  if (typeof expression !== 'string' || !expression.trim()) {
    return { ok: false, reason: 'invalid' };
  }
  const source = expression.trim();
  if (DICE_TERM.test(source.replaceAll(PATH_TOKEN, '0'))) {
    return { ok: false, reason: 'dice' };
  }
  try {
    const readPath = pathMode === 'foundry' ? readFoundryPath : readStrictPath;
    const reader = createExpressionReader(source, {
      readPath: (token) => readPath(token, rollData),
    });
    const value = reader.parseExpression();
    if (!reader.atEnd()) return { ok: false, reason: 'invalid' };
    return Number.isFinite(value) ? { ok: true, value } : { ok: false, reason: 'non-finite' };
  } catch (error) {
    return {
      ok: false,
      reason: THROWN_REASONS.includes(error) ? error : 'invalid',
    };
  }
}

/** The first `@` path in `expression` that `rollData` lacks, for a refusal to name; else null. */
export function firstUnresolvedPath(expression, rollData = {}, { pathMode } = {}) {
  const readPath = pathMode === 'foundry' ? readFoundryPath : readStrictPath;
  for (const [token] of String(expression ?? '').matchAll(PATH_TOKEN)) {
    try {
      readPath(token, rollData);
    } catch (error) {
      if (error === 'unresolved-path') return token;
    }
  }
  return null;
}
