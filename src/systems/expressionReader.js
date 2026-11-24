/**
 * The shared recursive-descent reader for dice-free arithmetic, and the two roll-data path readers
 * that feed it. With no injected table it accepts exactly the deterministic grammar: numbers, `@`
 * paths, `+ - * / %`, unary signs, parentheses, and `floor`, `ceil` and `round` of one argument.
 * A caller grows the grammar for its own reader instance only, through `functions` and `tokens`.
 */

/** A roll-data path token, `@a.b` or `@{a.b}`. One shared regex object; nothing runs `.test` or `.exec` on it. */
export const PATH_TOKEN = /@(?:\{[-.\w]+\}|[-.\w]+)/g;

/** A dice term such as `2d6`, `d20`, `4dF` or `1d%`, found where a path token has been neutralised. */
export const DICE_TERM = /(?:^|[^\w.])(?:\d+)?d(?:\d+|f|c|%)/i;

/** The functions every reader knows: one argument each, applied as the matching `Math` function. */
export const DEFAULT_FUNCTIONS = Object.freeze({
  floor: Object.freeze({ minArgs: 1, maxArgs: 1, apply: (value) => Math.floor(value) }),
  ceil: Object.freeze({ minArgs: 1, maxArgs: 1, apply: (value) => Math.ceil(value) }),
  round: Object.freeze({ minArgs: 1, maxArgs: 1, apply: (value) => Math.round(value) }),
});

const DECIMAL_STRING = /^\s*[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?\s*$/i;
const NON_FINITE_TEXT = /^[+-]?(?:Infinity|NaN)$/;

const LEADING_PATH = new RegExp(`^${PATH_TOKEN.source}`);
const LEADING_NUMBER = /^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/;
const LEADING_NAME = /^[A-Za-z_]\w*\b/;

/** Anchors a caller's token pattern at the read position, dropping any stateful `g` or `y` flag. */
function anchored(pattern) {
  return new RegExp(`^(?:${pattern.source})`, pattern.flags.replaceAll(/[gy]/g, ''));
}

/**
 * Builds a reader over `source`. `readPath(token)` resolves one `@` path token to a number or throws
 * its reason. `functions` maps a name to `{ minArgs, maxArgs, apply }`, with arguments separated by
 * `,`; a name outside its arity, or not followed by `(`, throws `'invalid'`. `tokens` is an ordered
 * list of `{ pattern, read(match) }` consulted after `(` and before the path token and the number,
 * so an injected `2d6` is never read as `2`. Every failure is a thrown reason string.
 */
export function createExpressionReader(
  source,
  { readPath, functions = DEFAULT_FUNCTIONS, tokens = [] }
) {
  const injected = tokens.map(({ pattern, read }) => ({ pattern: anchored(pattern), read }));
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
  function parseCall(spec) {
    const args = [parseExpression()];
    while (consume(',')) args.push(parseExpression());
    if (!consume(')') || args.length < spec.minArgs || args.length > spec.maxArgs) throw 'invalid';
    return spec.apply(...args);
  }
  function parsePrimary() {
    if (consume('(')) {
      const value = parseExpression();
      if (!consume(')')) throw 'invalid';
      return value;
    }
    for (const { pattern, read } of injected) {
      const found = match(pattern);
      if (found) return read(found);
    }
    const path = match(LEADING_PATH);
    if (path) return readPath(path[0]);
    const number = match(LEADING_NUMBER);
    if (number) return Number(number[0]);
    const name = match(LEADING_NAME);
    if (name && Object.hasOwn(functions, name[0]) && consume('(')) {
      return parseCall(functions[name[0]]);
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
export function readStrictPath(token, rollData) {
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
 * Reads a path as Foundry's `Roll.replaceFormulaData` does: `getProperty` semantics, then the value
 * as trimmed text. A value that is not a finite number throws its reason.
 */
export function readFoundryPath(token, rollData) {
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

/** Foundry writes these as JSON terms (unless a plain object overrides toString), so they never read as a number. */
function serializesAsData(value) {
  if (typeof value !== 'object') return false;
  if (Array.isArray(value) || value instanceof Set || value instanceof Map) return true;
  return !value.constructor || value.constructor === Object;
}
