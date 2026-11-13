/**
 * Pattern-liveness helpers: split an extended regex on its top-level `|` and find
 * which alternatives match no line of the supplied texts.
 */

/**
 * Split `pattern` on `|` that sits outside `()` and `[]` and is not escaped.
 * A `]` directly after `[` or `[^` is a literal member of the class, as in ERE.
 * @param {string} pattern
 * @returns {string[]}
 */
export function splitTopLevelAlternatives(pattern) {
  const alternatives = [];
  const state = { depth: 0, inClass: false };
  let start = 0;
  for (let i = 0; i < pattern.length; i += 1) {
    const ch = pattern[i];
    if (ch === '\\') {
      i += 1;
    } else if (state.inClass) {
      state.inClass = ch !== ']';
    } else if (ch === '[') {
      state.inClass = true;
      i = skipLeadingClassMembers(pattern, i);
    } else if (ch === '|' && state.depth === 0) {
      alternatives.push(pattern.slice(start, i));
      start = i + 1;
    } else {
      state.depth = nextDepth(state.depth, ch);
    }
  }
  alternatives.push(pattern.slice(start));
  return alternatives;
}

/** Past a `[`, step over a leading `^` and a leading literal `]`; returns the new index. */
function skipLeadingClassMembers(pattern, i) {
  let next = i;
  if (pattern[next + 1] === '^') next += 1;
  if (pattern[next + 1] === ']') next += 1;
  return next;
}

/** Group depth after reading `ch` outside a bracket expression. */
function nextDepth(depth, ch) {
  if (ch === '(') return depth + 1;
  if (ch === ')') return Math.max(0, depth - 1);
  return depth;
}

/**
 * The top-level alternatives of `pattern` that match no line in `texts`.
 * @param {string} pattern
 * @param {string[]} texts file contents
 * @returns {string[]}
 */
export function findDeadAlternatives(pattern, texts) {
  const lines = texts.flatMap((text) => text.split(/\r?\n/));
  return splitTopLevelAlternatives(pattern).filter((alternative) => {
    const re = new RegExp(alternative);
    return lines.every((line) => !re.test(line));
  });
}
