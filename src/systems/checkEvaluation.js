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

const PATH_TOKEN = /@(?:\{[-.\w]+\}|[-.\w]+)/g;
const DICE_TERM = /(?:^|[^\w.])(?:\d+)?d(?:\d+|f|c|%)/i;
const DECIMAL_STRING = /^\s*[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?\s*$/i;

const NON_FINITE_TEXT = /^[+-]?(?:Infinity|NaN)$/;
const THROWN_REASONS = ['unresolved-path', 'non-finite', 'dice'];

/**
 * Resolves dice-free arithmetic against roll data without substituting missing paths.
 * An unsuccessful result identifies whether the source was unresolved, dice-based, invalid, or non-finite.
 * Paths use the strict own-key reader unless `pathMode` is `'foundry'` ({@link resolveFoundryPath}).
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
    const readPath = pathMode === 'foundry' ? resolveFoundryPath : resolvePath;
    const reader = createExpressionReader(source, (token) => readPath(token, rollData));
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

function createExpressionReader(source, readPath) {
  let index = 0;
  const skip = () => {
    while (/\s/.test(source[index] ?? '')) index += 1;
  };
  const consume = (token) => {
    skip();
    if (source[index] !== token) return false;
    index += 1;
    return true;
  };
  const match = (pattern) => {
    skip();
    const found = pattern.exec(source.slice(index));
    if (found) index += found[0].length;
    return found;
  };
  function parseExpression() {
    let value = parseTerm();
    for (;;) {
      if (consume('+')) value += parseTerm();
      else if (consume('-')) value -= parseTerm();
      else return value;
    }
  }
  function parseTerm() {
    let value = parseUnary();
    for (;;) {
      if (consume('*')) value *= parseUnary();
      else if (consume('/')) value /= parseUnary();
      else if (consume('%')) value %= parseUnary();
      else return value;
    }
  }
  function parseUnary() {
    if (consume('+')) return parseUnary();
    if (consume('-')) return -parseUnary();
    return parsePrimary();
  }
  function parsePrimary() {
    if (consume('(')) {
      const value = parseExpression();
      if (!consume(')')) throw 'invalid';
      return value;
    }
    const path = match(new RegExp(`^${PATH_TOKEN.source}`));
    if (path) return readPath(path[0]);
    const number = match(/^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/);
    if (number) return Number(number[0]);
    const fn = match(/^(?:floor|ceil|round)\b/);
    if (fn && consume('(')) {
      const value = parseExpression();
      if (!consume(')')) throw 'invalid';
      return Math[fn[0]](value);
    }
    throw 'invalid';
  }
  return {
    parseExpression,
    atEnd: () => {
      skip();
      return index === source.length;
    },
  };
}

/** Walks own keys only: an inherited or primitive property (`@name.length`) is unresolved. */
function resolvePath(token, rollData) {
  const path = token.startsWith('@{') ? token.slice(2, -1) : token.slice(1);
  const value = path
    .split('.')
    .reduce(
      (cursor, segment) =>
        cursor !== null && typeof cursor === 'object' && Object.hasOwn(cursor, segment)
          ? cursor[segment]
          : undefined,
      rollData
    );
  if (value === undefined || value === null || (typeof value === 'string' && !value.trim())) {
    throw 'unresolved-path';
  }
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && DECIMAL_STRING.test(value)) return Number(value);
  throw 'non-finite';
}

/**
 * Reads a path as Foundry's `Roll.replaceFormulaData` does (maintainer ruling F6): `getProperty`
 * semantics, then the value as trimmed text. A value that is not a finite number throws its reason.
 */
function resolveFoundryPath(token, rollData) {
  const value = foundryProperty(rollData, token.replaceAll(/^@\{?|\}?$/g, ''));
  if (value === undefined || value === null) throw 'unresolved-path';
  if (typeof value === 'function' || serializesAsData(value)) throw 'invalid';
  const text = String(value).trim();
  if (!text) throw 'unresolved-path';
  if (DECIMAL_STRING.test(text) || NON_FINITE_TEXT.test(text)) {
    const number = Number(text);
    if (Number.isFinite(number)) return number;
    throw 'non-finite';
  }
  throw DICE_TERM.test(text.replaceAll(PATH_TOKEN, '0')) ? 'dice' : 'invalid';
}

/** `foundry.utils.getProperty`: the whole key first, then an `in` walk that stops at a non-object. */
function foundryProperty(object, key) {
  if (isPropertyHolder(object) && key in object) return object[key];
  return key
    .split('.')
    .reduce(
      (cursor, segment) =>
        isPropertyHolder(cursor) && segment in cursor ? cursor[segment] : undefined,
      object
    );
}

function isPropertyHolder(value) {
  return Boolean(value) && (typeof value === 'object' || typeof value === 'function');
}

/** Foundry writes these as JSON terms rather than their text, so they never read as a number. */
function serializesAsData(value) {
  if (typeof value !== 'object') return false;
  if (Array.isArray(value) || value instanceof Set || value instanceof Map) return true;
  return !value.constructor || value.constructor === Object;
}
