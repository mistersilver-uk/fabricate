/** Direction-aware check arithmetic shared by resolution and preview callers. */

export function compareToTarget(value, target, comparison = 'meet', direction = 'over') {
  if (direction === 'under') return comparison === 'exceed' ? value < target : value <= target;
  return comparison === 'exceed' ? value > target : value >= target;
}

export function better(left, right, direction = 'over') {
  return direction === 'under' ? left < right : left > right;
}

export function rankBest(entries, valueOf, direction = 'over') {
  return [...entries].sort((left, right) => {
    const a = valueOf(left);
    const b = valueOf(right);
    return better(a, b, direction) ? -1 : better(b, a, direction) ? 1 : 0;
  });
}

export function effectiveMargin(value, target, direction = 'over') {
  return direction === 'under' ? target - value : value - target;
}

/** Resolve dice-free arithmetic against roll data without substituting missing paths. */
export function resolveDeterministicExpression(expression, rollData = {}) {
  if (typeof expression === 'number') {
    return Number.isFinite(expression)
      ? { ok: true, value: expression }
      : { ok: false, reason: 'non-finite' };
  }
  if (typeof expression !== 'string' || !expression.trim()) {
    return { ok: false, reason: 'invalid' };
  }
  const source = expression.trim();
  if (/(?:^|[^\w.])(?:\d+)?d(?:\d+|f|c)/i.test(source)) {
    return { ok: false, reason: 'dice' };
  }
  try {
    const reader = createExpressionReader(source, rollData);
    const value = reader.parseExpression();
    if (!reader.atEnd()) return { ok: false, reason: 'invalid' };
    return Number.isFinite(value) ? { ok: true, value } : { ok: false, reason: 'non-finite' };
  } catch (error) {
    return {
      ok: false,
      reason: ['unresolved-path', 'non-finite'].includes(error) ? error : 'invalid',
    };
  }
}

function createExpressionReader(source, rollData) {
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
    const path = match(/^@(?:\{[-.\w]+\}|[-.\w]+)/);
    if (path) return resolvePath(path[0], rollData);
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

function resolvePath(token, rollData) {
  const path = token.startsWith('@{') ? token.slice(2, -1) : token.slice(1);
  const value = path.split('.').reduce((cursor, segment) => cursor?.[segment], rollData);
  if ([undefined, null, ''].includes(value)) throw 'unresolved-path';
  const number = Number(value);
  if (!Number.isFinite(number)) throw 'non-finite';
  return number;
}
