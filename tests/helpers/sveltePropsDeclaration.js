/**
 * The ONE reader of a Svelte 5 `$props()` destructure, shared by every source-contract suite that
 * asks what a component declares (issues 1380, 1372 and 1487).
 *
 * One scanner splits the body on top-level commas, dropping line and block comments and keeping
 * quoted runs and template holes whole (issue 1487). A regular-expression literal default is read
 * as plain characters and would split on a comma inside it; no shipped prop default holds one.
 *
 * @param {string} source a component's full source text.
 * @returns {string[]} the declared prop names, sorted.
 * @throws {Error} when the file has no `let { … } = $props()` destructure at all, which is a broken
 * parse rather than a component with no props — the caller would otherwise compare an empty set to
 * an empty set and pass.
 */
export function declaredPropNames(source) {
  const start = source.indexOf('let {');
  const end = source.indexOf('} = $props();', start);
  if (start === -1 || end <= start) {
    throw new Error('no `let { … } = $props()` destructure found');
  }
  return splitTopLevel(source.slice(start + 'let {'.length, end))
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => (entry.startsWith('...') ? entry : entry.split(/[=:]/)[0].trim()))
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right));
}

/** A prop name as JavaScript spells one, plus the `...rest` form the reader reports verbatim. */
export const PROP_NAME = /^(\.\.\.)?[A-Za-z_$][\w$]*$/;

/** Characters that open a nesting a top-level comma cannot appear inside. */
const OPENERS = '([{';

/** Their closers. */
const CLOSERS = ')]}';

/** The three quote characters, each of which begins a run the scan must not read as code. */
const QUOTES = '\'"`';

/**
 * Split a destructure body on its top-level commas, comments removed and quoted runs kept whole.
 *
 * @param {string} body the text between `let {` and `} = $props();`
 * @returns {string[]} one raw entry per top-level comma-separated position
 */
function splitTopLevel(body) {
  const entries = [];
  let current = '';
  let depth = 0;
  for (let index = 0; index < body.length; index += 1) {
    const character = body[index];
    if (character === '/' && body[index + 1] === '/') {
      index = endOfLineComment(body, index);
    } else if (character === '/' && body[index + 1] === '*') {
      index = endOfBlockComment(body, index);
    } else if (QUOTES.includes(character)) {
      const quoted = readQuoted(body, index);
      current += quoted.text;
      index = quoted.end;
    } else if (OPENERS.includes(character)) {
      depth += 1;
      current += character;
    } else if (CLOSERS.includes(character)) {
      depth = Math.max(0, depth - 1);
      current += character;
    } else if (character === ',' && depth === 0) {
      entries.push(current);
      current = '';
    } else {
      current += character;
    }
  }
  entries.push(current);
  return entries;
}

/** @returns {number} index of the line comment's last character */
function endOfLineComment(source, start) {
  const newline = source.indexOf('\n', start);
  return newline === -1 ? source.length : newline - 1;
}

/** @returns {number} index of the block comment's closing slash, or the end when unterminated */
function endOfBlockComment(source, start) {
  const close = source.indexOf('*/', start + 2);
  return close === -1 ? source.length : close + 1;
}

/**
 * Read one quoted run — single, double, or a template literal whose holes are read as code by
 * {@link readTemplateHole} — starting at its opening quote.
 *
 * @param {string} source the destructure body
 * @param {number} start index of the opening quote
 * @returns {{text: string, end: number}} the run verbatim, and the index of its closing quote
 */
function readQuoted(source, start) {
  const quote = source[start];
  let text = quote;
  let index = start + 1;
  while (index < source.length) {
    const character = source[index];
    if (character === '\\') {
      text += source.slice(index, index + 2);
      index += 2;
    } else if (character === quote) {
      return { text: text + character, end: index };
    } else if (quote === '`' && character === '$' && source[index + 1] === '{') {
      const hole = readTemplateHole(source, index + 1);
      text += `$${hole.text}`;
      index = hole.end + 1;
    } else {
      text += character;
      index += 1;
    }
  }
  return { text, end: source.length - 1 };
}

/**
 * Read a balanced template-literal hole, starting at its opening brace.
 *
 * @param {string} source the destructure body
 * @param {number} start index of the opening brace
 * @returns {{text: string, end: number}} the hole with its braces, and the index of its closer
 */
function readTemplateHole(source, start) {
  let text = '{';
  let depth = 1;
  let index = start + 1;
  while (index < source.length && depth > 0) {
    const character = source[index];
    if (QUOTES.includes(character)) {
      const quoted = readQuoted(source, index);
      text += quoted.text;
      index = quoted.end + 1;
      continue;
    }
    if (character === '{') depth += 1;
    else if (character === '}') depth -= 1;
    if (depth > 0) text += character;
    index += 1;
  }
  return { text: `${text}}`, end: index - 1 };
}
