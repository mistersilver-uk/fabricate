/**
 * Foundry declares `--font-primary` only under the ApplicationV1 `.app` root, so no Fabricate window
 * defines it. A read is admitted only as the literal-ended fallback of a `--font-body` read, the
 * exact form `var(--font-body, var(--font-primary, sans-serif))`; every other spelling is refused.
 */

import { closingParenthesis, topLevelComma } from './styleBlockScan.js';

const VAR_OPEN = /var\(/gi;
const CSS_WIDE_KEYWORD = /^(?:inherit|initial|unset|revert|revert-layer)$/i;
const IDENTIFIER_CHARACTER = /[\w-]/;

/** Every `var()` in `text`, nested ones included, with its name, position and fallback. */
function varReads(text) {
  const reads = [];
  for (const match of text.matchAll(VAR_OPEN)) {
    if (match.index > 0 && IDENTIFIER_CHARACTER.test(text[match.index - 1])) continue;
    const innerStart = match.index + match[0].length;
    const close = closingParenthesis(text, innerStart - 1);
    const end = close === -1 ? text.length : close;
    const inner = text.slice(innerStart, close === -1 ? end : end - 1);
    const comma = topLevelComma(inner);
    const raw = comma === -1 ? '' : inner.slice(comma + 1);
    reads.push({
      text: text.slice(match.index, end),
      start: match.index,
      name: (comma === -1 ? inner : inner.slice(0, comma)).trim(),
      fallback: comma === -1 ? null : raw.trim(),
      fallbackStart: innerStart + comma + 1 + (raw.length - raw.trimStart().length),
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
    reads.some(
      (outer) =>
        outer.name === '--font-body' &&
        outer.fallbackStart === read.start &&
        outer.fallback === read.text
    );
  return reads
    .filter(({ name }) => name === '--font-primary')
    .filter((read) => !isGuarded(read))
    .map(({ text: read }) => read);
}
