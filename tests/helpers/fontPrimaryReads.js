/**
 * Foundry declares `--font-primary` only under the ApplicationV1 `.app` root, so a read with no
 * literal-ended fallback is invalid at computed-value time in every Fabricate window.
 */

const READ_START = 'var(--font-primary';
const LITERAL_GUARDED_READ = /^var\(\s*--font-primary\s*,\s*[^\s(),][^()]*\)$/;

/**
 * Each `var(--font-primary …)` read in `text`, as written up to the first closing parenthesis.
 *
 * @param {string} text CSS, or JS that carries a CSS value in a string.
 * @returns {string[]} Every read, guarded or not.
 */
export function fontPrimaryReads(text) {
  const found = [];
  const source = String(text ?? '');
  for (let at = source.indexOf(READ_START); at !== -1; at = source.indexOf(READ_START, at + 1)) {
    const close = source.indexOf(')', at);
    found.push(source.slice(at, close === -1 ? source.length : close + 1));
  }
  return found;
}

/** The reads in `text` whose fallback does not end in a literal. */
export const unguardedFontPrimaryReads = (text) =>
  fontPrimaryReads(text).filter((read) => read.match(LITERAL_GUARDED_READ) === null);
