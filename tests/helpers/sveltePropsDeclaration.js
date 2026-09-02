/**
 * The ONE reader of a Svelte 5 `$props()` destructure, shared by every source-contract suite
 * that asks what a component declares (issues 1380, 1372 and 1487).
 *
 * Three suites need it: `scoped-shell-prop-contract.test.js` pins the three shared scoped-list
 * shells against a literal set, `essence-world-scope-screens.test.js` checks the four essence
 * screens against the key set their call site actually supplies, and
 * `design-system-lab-coverage.test.js` asks whether every prop a catalogued primitive declares is
 * either driven by a knob or waived. All three questions are "what names does this file
 * destructure out of `$props()`", and two copies of the depth-tracking splitter is the duplication
 * SonarCloud counts — on a `.svelte`-adjacent surface it already indexes.
 *
 * A `...rest` key is reported as the literal `...rest`, so a destructure that opened itself up to
 * arbitrary keys fails a set equality rather than passing under the name it collected them into.
 *
 * WHY THE SPLITTER IS A SCANNER AND NOT A STRIP-THEN-WALK
 * ------------------------------------------------------
 * It used to be two passes: delete every `//` line comment from the body, then walk the residue
 * counting bracket depth. Both halves were wrong, and both were LATENT — the eight screens the
 * first two consumers pin happen to carry neither hazard, so the corpus never showed it.
 *
 *   - Only LINE comments came out. A JSDoc block was left in the body, so its text was
 *     concatenated onto the following prop and reported as part of that prop's name. Five of the
 *     318 shipped components parsed to a malformed list because of it.
 *   - The walk could not decrement on a backtick. The opener test was `'([{` + backtick and the
 *     closer was an `else if`, so a backtick always matched the FIRST branch: every template
 *     literal opened a depth that nothing could close, and every comma after it was swallowed.
 *     `ThresholdBandStrip.svelte` declares 15 props and one template-literal default, and the old
 *     reader answered with THREE names, one of them a JSDoc comment.
 *
 * A single scanner closes both, and closes the pair the two-pass form could never have got right
 * together: a `//` inside a string default is not a comment, and a comma inside a comment is not a
 * separator. Neither pass could know which it was looking at, because each ran without the other's
 * result.
 *
 * STATED LIMIT: a REGULAR EXPRESSION literal is read as ordinary characters, so a default written
 * `= /a,b/` would split into two entries. No shipped component declares one as a prop default, and
 * the failure is loud rather than silent — the second fragment is not a valid identifier, which
 * `design-system-lab-coverage.test.js` reports by name. Telling a regex literal from division
 * needs the preceding token's grammar, which is a parser rather than a scanner.
 *
 * @param {string} source a component's full source text.
 * @returns {string[]} the declared prop names, sorted.
 * @throws {Error} when the file has no `let { … } = $props()` destructure at all, which is a
 *   broken parse rather than a component with no props — the caller would otherwise compare an
 *   empty set to an empty set and pass.
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

/** Characters that open a nesting a top-level comma cannot appear inside. */
const OPENERS = '([{';

/** Their closers. */
const CLOSERS = ')]}';

/** The three quote characters, each of which begins a run the scan must not read as code. */
const QUOTES = '\'"`';

/**
 * Split a destructure body on its TOP-LEVEL commas, with comments removed and quoted runs kept
 * whole.
 *
 * Comments contribute nothing to the entry they sit in, which is what makes a documented prop read
 * as its own name: the JSDoc block above it is dropped rather than glued to it. Quoted runs are
 * kept verbatim, because the name is always the text before the first `=` and a default's contents
 * cannot change it — keeping them means a caller reading an entry sees what the component declares.
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

/**
 * @param {string} source the destructure body
 * @param {number} start index of the first slash
 * @returns {number} index of the comment's last character
 */
function endOfLineComment(source, start) {
  const newline = source.indexOf('\n', start);
  return newline === -1 ? source.length : newline - 1;
}

/**
 * @param {string} source the destructure body
 * @param {number} start index of the opening slash
 * @returns {number} index of the closing slash, or the end when the block is unterminated
 */
function endOfBlockComment(source, start) {
  const close = source.indexOf('*/', start + 2);
  return close === -1 ? source.length : close + 1;
}

/**
 * Read one quoted run — single-quoted, double-quoted, or a template literal with its holes —
 * starting at its opening quote.
 *
 * Template holes are read by {@link readTemplateHole} rather than by falling back into the outer
 * scan, because a hole is CODE inside a string: it can carry its own quotes, its own braces and
 * its own nested template, and the outer scan's depth counter is the wrong instrument for it.
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
