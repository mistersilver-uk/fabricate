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
  let depth = 0;
  let inClass = false;
  let start = 0;
  for (let i = 0; i < pattern.length; i += 1) {
    const ch = pattern[i];
    if (ch === '\\') {
      i += 1;
    } else if (inClass) {
      if (ch === ']') inClass = false;
    } else {
      switch (ch) {
        case '[': {
          inClass = true;
          if (pattern[i + 1] === '^') i += 1;
          if (pattern[i + 1] === ']') i += 1;
          break;
        }
        case '(': {
          depth += 1;
          break;
        }
        case ')': {
          depth = Math.max(0, depth - 1);
          break;
        }
        case '|': {
          if (depth === 0) {
            alternatives.push(pattern.slice(start, i));
            start = i + 1;
          }
          break;
        }
        default:
      }
    }
  }
  alternatives.push(pattern.slice(start));
  return alternatives;
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
