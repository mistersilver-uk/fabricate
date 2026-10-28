/**
 * Foundry declares `--font-primary` only under the ApplicationV1 `.app` root, so no Fabricate window
 * defines it. A read is admitted only as the literal-ended fallback of a `--font-body` read, the
 * exact form `var(--font-body, var(--font-primary, sans-serif))`; every other spelling is refused.
 */

const VAR_OPEN = /var\(/gi;
const CSS_WIDE_KEYWORD = /^(?:inherit|initial|unset|revert|revert-layer)$/i;
const IDENTIFIER_CHARACTER = /[\w-]/;

/** The index of the last character of the quoted text opening at `at`. */
function endOfQuote(text, at) {
  let end = at + 1;
  while (end < text.length && text[end] !== text[at]) end += text[end] === '\\' ? 2 : 1;
  return end;
}

/** Walks `text` from `from` outside quotes, calling `visit(character, index)` until it returns true. */
function scanOutsideQuotes(text, from, visit) {
  for (let at = from; at < text.length; at += 1) {
    if (text[at] === '"' || text[at] === "'") at = endOfQuote(text, at);
    else if (visit(text[at], at)) return at;
  }
  return -1;
}

/** The index after the parenthesis closing the one before `from`, or the end of `text`. */
function closeOf(text, from) {
  let depth = 1;
  const close = scanOutsideQuotes(text, from, (character) => {
    if (character === '(') depth += 1;
    if (character === ')') depth -= 1;
    return depth === 0;
  });
  return close === -1 ? text.length : close + 1;
}

/** The index of the first comma outside parentheses and quotes, or -1. */
function topLevelComma(text) {
  let depth = 0;
  return scanOutsideQuotes(text, 0, (character) => {
    if (character === '(') depth += 1;
    if (character === ')') depth -= 1;
    return character === ',' && depth === 0;
  });
}

/** Every `var()` in `text`, nested ones included, with its name and fallback. */
function varReads(text) {
  const reads = [];
  for (const match of text.matchAll(VAR_OPEN)) {
    if (match.index > 0 && IDENTIFIER_CHARACTER.test(text[match.index - 1])) continue;
    const end = closeOf(text, match.index + match[0].length);
    const inner = text.slice(match.index + match[0].length, Math.max(end - 1, 0));
    const comma = topLevelComma(inner);
    reads.push({
      text: text.slice(match.index, end),
      name: (comma === -1 ? inner : inner.slice(0, comma)).trim(),
      fallback: comma === -1 ? null : inner.slice(comma + 1).trim(),
    });
  }
  return reads;
}

/** A fallback that is plain text: not empty, no `var()` or `${}`, and no CSS-wide keyword last. */
function isLiteral(fallback) {
  if (!fallback || /var\(|\$\{/i.test(fallback)) return false;
  return !CSS_WIDE_KEYWORD.test(fallback.split(',').at(-1).trim());
}

/**
 * Each `var(--font-primary …)` read in `text`, as written, however spaced or cased. A longer name
 * such as `--font-primary-alt` is another property and is not a read.
 *
 * @param {string} text CSS, or JS and markup that carry a CSS value in a string.
 * @returns {string[]} Every read, guarded or not.
 */
export function fontPrimaryReads(text) {
  return varReads(String(text ?? ''))
    .filter(({ name }) => name === '--font-primary')
    .map(({ text: read }) => read);
}

/** The reads in `text` that are not the literal-ended fallback of a `--font-body` read. */
export function unguardedFontPrimaryReads(text) {
  const reads = varReads(String(text ?? ''));
  const isGuarded = (read) =>
    isLiteral(read.fallback) &&
    reads.some(({ name, fallback }) => name === '--font-body' && fallback === read.text);
  return reads
    .filter(({ name }) => name === '--font-primary')
    .filter((read) => !isGuarded(read))
    .map(({ text: read }) => read);
}
