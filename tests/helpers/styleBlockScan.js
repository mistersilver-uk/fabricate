/**
 * A CSS declaration scanner over BOTH stylesheets the product ships (issue 1391).
 *
 * `npm run lint:css` globs `styles/**` and nothing else, so the ~433 declarations living in
 * Svelte scoped `<style>` blocks are unreachable by stylelint — which is to say the half of
 * the corpus most likely to drift is entirely unlinted. Any gate that wants to police a CSS
 * VALUE therefore has to read both corpora itself, and this is the shared way to do it. Its
 * first customer is `tests/components/control-height-ladder.test.js`; the spacing/px gate is
 * the stated second.
 *
 * ── WHY IT RESOLVES `var()` AT ALL ──────────────────────────────────────────────────────
 * A value gate matches on TEXT, so a banned literal written into a custom property and read
 * back is invisible to it. The codebase already does exactly this: `styles/fabricate.css`
 * defines `--fab-v2-thumb-sm: 40px` and `apps/manager/BooksScrollsView.svelte` reads
 * `height: var(--fab-v2-thumb-sm)`. The consequence is not the missed occurrence — it is
 * that with a text-only scan the CHEAPEST WAY TO PAY A RATCHET DOWN is to move the literal
 * into a token. The pixel does not move, the control is still 36px tall, and the gate goes
 * green. A ratchet whose debt can be discharged by renaming is not a ratchet.
 *
 * ── WHY THE RESOLUTION RUNS TO A FIXED POINT ────────────────────────────────────────────
 * One level is not enough, and this corpus proves it rather than a hypothetical one.
 * `fabricate.css` defines `--fab-icon-picker-chip: 28px`, derives `--fab-icon-picker-row`
 * from it through a `calc()`, and two rules read the ROW while a third reads the CHIP. Under
 * one-level resolution the row's substitution still carries an unresolved `var()`, so raising
 * the chip to a banned value reds the one-hop reader and SILENTLY PASSES the two derived from
 * it. The general escape survives verbatim as `--a: 36px; --b: var(--a); height: var(--b)`.
 * So expansion iterates, with a visited set for cycles and a depth cap the corpus is asserted
 * to sit well below.
 *
 * ── WHY THE RESULT IS A UNION, NOT A SUBSTITUTION ───────────────────────────────────────
 * Substitution is not monotone: it REMOVES text as well as adding it.
 * `components/Stepper.svelte` writes `height: var(--fab-stepper-fill-height, 36px)`, and
 * substituting a definition of that token discards the `36px` fallback — the token is defined
 * four times in this corpus and none of them is `36px`, while the component's own docblock
 * documents 36px as the live default wherever no ancestor sets it. A text scanner cannot
 * resolve that cascade, so BOTH branches are candidates: `var(--x, F)` yields `F` and every
 * resolution of `--x`, and a name defined more than once contributes every distinct
 * definition. The candidate set therefore always contains the raw text as well.
 *
 * ── LINE-ANCHORED `<style>` EXTRACTION ──────────────────────────────────────────────────
 * An opener must be the whole line. `components/ManagerButton.svelte` mentions `<style>`
 * twice in docblock PROSE — explaining that it deliberately has none — with no closing tag
 * anywhere in its 268 lines, so a naive `indexOf('<style')` reads from that prose line to EOF
 * as CSS. Inert today only because that prose happens to contain no CSS-shaped text. Across
 * `src/`, 177 files carry a real block, no file carries two, and 17 prose mentions would be
 * read as openers by a naive extractor.
 *
 * ── OFFSETS ARE PRESERVED ───────────────────────────────────────────────────────────────
 * Masking and comment stripping both replace text with spaces rather than deleting it, so a
 * declaration's index still maps to its real line in the file on disk. A gate that cannot
 * cite a line number sends its reader to search a 20,000-line stylesheet by hand.
 *
 * This file is deliberately NOT named `*.test.js`: `tests/helpers/` is outside the `npm test`
 * glob, so nothing here is collected as a suite. Its guarantees are proved from inside the
 * glob by `tests/style-block-scan.test.js`, the same arrangement (and the same reason) as
 * `sourceScan.js`/`source-scan.test.js`.
 */

import { collectWorkingTreeSources } from './sourceScan.js';

/**
 * The roots holding shipped CSS. `src` for Svelte scoped blocks, `styles` for the global
 * sheet.
 */
export const STYLE_CORPUS_ROOTS = Object.freeze(['src', 'styles']);

/**
 * `.scss` is listed because `lint:css` globs `styles/**\/*.{css,scss}` and
 * `collectWorkingTreeSources` takes an explicit list with NO default — omitting it would
 * silently skip a future file that stylelint does gate, which is the one direction of error
 * nobody notices.
 */
export const STYLE_CORPUS_EXTENSIONS = Object.freeze(['.svelte', '.css', '.scss']);

/**
 * The cap on `var()` chain depth. Slack rather than a guess: the deepest chain this corpus
 * reaches through the height properties is 2, and 3 corpus-wide, and the ladder gate asserts
 * the observed depth stays under this number so the cap turning into a silent truncation is
 * itself a failure.
 */
export const MAX_VAR_CHAIN_DEPTH = 8;

/**
 * The cap on candidate texts produced for ONE declaration. A value naming k tokens, each
 * defined m times, expands to m**k texts per round; this corpus's worst case is a handful.
 * Exceeding it throws rather than truncating, because a truncated candidate set is a scanner
 * that answers "no banned value here" for the wrong reason.
 */
const MAX_VALUE_CANDIDATES = 512;

/** A line that is nothing but a `<style …>` opening tag. */
const STYLE_OPEN_LINE = /^\s*<style\b[^<>]*>\s*$/;

/** A line that is nothing but the matching close. */
const STYLE_CLOSE_LINE = /^\s*<\/style>\s*$/;

/**
 * One `property: value` pair, anchored to a real declaration boundary.
 *
 * The leading `[;{}]` (or the start of the file) is what keeps `line-height` from reading as
 * `height` and what keeps a media feature — `@media (min-height: 400px)` — out of the corpus:
 * a feature test sits inside parentheses, never after a `;`, `{` or `}`, and a breakpoint is
 * not a control height.
 */
const DECLARATION = /(?:^|[;{}])\s*(--[\w-]+|[a-z][\w-]*)\s*:\s*([^;{}]*)/g;

/**
 * A pixel literal, on a NUMERIC boundary.
 *
 * The boundary is the whole point. `min-height: 240px` read as `40px` is the first defect this
 * scanner shipped with, and it inflated the measured baseline by fourteen occurrences before
 * anyone read the output rather than the count.
 *
 * WHICH PART DOES WHICH JOB was itself got wrong, and only a falsification found it. `240px` is
 * protected by GREEDINESS, not by the lookbehind: leftmost-longest already consumes all three
 * digits, so deleting the lookbehind leaves that case correct and every naive test of it green.
 * What the lookbehind actually guards is a number glued to a word or to a decimal point —
 * `url(icon40px.svg)` and `.40px`, both of which read as a bare `40` without it. Those are the
 * cases the proof asserts, because they are the only ones that can fail.
 *
 * The `\.\d+` branch exists so a leading-dot decimal is READ rather than skipped: `.4px` is
 * valid CSS, and with the lookbehind alone it matched nothing at all — a safe answer but a
 * wrong one, and the wrong one in the direction this gate cannot afford.
 */
const PIXEL_LITERAL = /(?<![\w.])(\d+(?:\.\d+)?|\.\d+)px\b/g;

/**
 * Replace `source` with same-length text in which everything OUTSIDE a `<style>` block is
 * spaces, so a Svelte file can be scanned as CSS without moving a single character.
 *
 * @param {string} source A `.svelte` file's text.
 * @returns {string} Same length, same newlines, CSS only.
 */
export function maskNonStyleRegions(source) {
  let inside = false;
  return String(source ?? '')
    .split('\n')
    .map((line) => {
      if (!inside) {
        if (STYLE_OPEN_LINE.test(line)) inside = true;
        return ' '.repeat(line.length);
      }
      if (STYLE_CLOSE_LINE.test(line)) {
        inside = false;
        return ' '.repeat(line.length);
      }
      return line;
    })
    .join('\n');
}

/**
 * Blank `/* … *\/` comment text, preserving every offset.
 *
 * Stripping is not tidiness: `fabricate.css` explains its own retired values in comments —
 * "the 40px rung is retired" is documentation, not a declaration — and a gate that flagged
 * prose would be answered with a file-level exemption for exactly the file it polices.
 *
 * CSS has no line comment, so `//` is left alone: inside a `url()` it is data, and this
 * corpus holds no `.scss` today.
 *
 * @param {string} css
 * @returns {string} Same length, comment text replaced by spaces.
 */
export function stripCssComments(css) {
  const text = String(css ?? '');
  let out = '';
  let index = 0;
  while (index < text.length) {
    const open = text.indexOf('/*', index);
    if (open === -1) return out + text.slice(index);
    out += text.slice(index, open);
    const close = text.indexOf('*/', open + 2);
    const end = close === -1 ? text.length : close + 2;
    for (let scan = open; scan < end; scan += 1) out += text[scan] === '\n' ? '\n' : ' ';
    index = end;
  }
  return out;
}

/**
 * The CSS a single file contributes, offsets intact.
 *
 * @param {string} file Repo-relative path, used only to pick the extraction rule.
 * @param {string} source The file's text.
 * @returns {string} Comment-stripped CSS, positionally identical to `source`.
 */
export function styleTextFor(file, source) {
  const css = file.endsWith('.svelte') ? maskNonStyleRegions(source) : source;
  return stripCssComments(css);
}

/**
 * Every shipped stylesheet as `{ repo-relative path: CSS text }`, in code-point path order.
 *
 * Files contributing no CSS at all — the 126 `.svelte` components with no scoped block — are
 * dropped, so `Object.keys()` is the set of files a gate can actually cite.
 *
 * @param {object} [options]
 * @param {readonly string[]} [options.roots]
 * @param {readonly string[]} [options.extensions]
 * @returns {Record<string, string>}
 */
export function collectStyleCorpus({
  roots = STYLE_CORPUS_ROOTS,
  extensions = STYLE_CORPUS_EXTENSIONS,
} = {}) {
  const corpus = {};
  for (const [file, source] of Object.entries(collectWorkingTreeSources([...roots], [...extensions]))) {
    const css = styleTextFor(file, source);
    if (css.trim().length > 0) corpus[file] = css;
  }
  return corpus;
}

/** Zero-based newline offsets, so an index can become a line number without re-slicing. */
function newlineOffsets(text) {
  const offsets = [];
  for (let index = text.indexOf('\n'); index !== -1; index = text.indexOf('\n', index + 1)) {
    offsets.push(index);
  }
  return offsets;
}

/** The 1-based line holding `index`, by binary search over `offsets`. */
function lineAt(offsets, index) {
  let low = 0;
  let high = offsets.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (offsets[middle] < index) low = middle + 1;
    else high = middle;
  }
  return low + 1;
}

/**
 * Every `property: value` declaration in one file's CSS.
 *
 * @param {string} file Repo-relative path, echoed onto each record.
 * @param {string} css Comment-stripped, offset-preserving CSS.
 * @returns {Array<{file: string, line: number, property: string, value: string}>}
 */
export function declarationsIn(file, css) {
  const offsets = newlineOffsets(css);
  const found = [];
  DECLARATION.lastIndex = 0;
  for (let match = DECLARATION.exec(css); match !== null; match = DECLARATION.exec(css)) {
    found.push({
      file,
      line: lineAt(offsets, match.index + match[0].indexOf(match[1])),
      property: match[1],
      value: match[2].trim(),
    });
  }
  return found;
}

/**
 * Every custom property DEFINITION in the corpus, as `name -> distinct value texts`.
 *
 * A name defined more than once keeps every definition, because CSS decides between them by
 * cascade and specificity — facts a text scanner does not have. `--fab-stepper-fill-height`
 * is defined four times here, at two different heights.
 *
 * @param {Record<string, string>} corpus
 * @returns {Map<string, string[]>}
 */
function addDefinition(definitions, name, value) {
  const existing = definitions.get(name);
  if (!existing) {
    definitions.set(name, [value]);
    return;
  }
  if (!existing.includes(value)) existing.push(value);
}

export function collectCustomProperties(corpus) {
  const definitions = new Map();
  for (const [file, css] of Object.entries(corpus)) {
    for (const declaration of declarationsIn(file, css)) {
      if (!declaration.property.startsWith('--')) continue;
      addDefinition(definitions, declaration.property, declaration.value);
    }
  }
  return definitions;
}

/** The index of the first comma at parenthesis depth zero, or -1. */
function topLevelComma(text) {
  let depth = 0;
  for (const [index, character] of [...text].entries()) {
    if (character === '(') depth += 1;
    else if (character === ')') depth -= 1;
    else if (character === ',' && depth === 0) return index;
  }
  return -1;
}

/**
 * The index just past the `)` that closes the `(` at or after `from`, or -1 when nothing does.
 *
 * @param {string} text
 * @param {number} from
 * @returns {number}
 */
function closingParenthesis(text, from) {
  let depth = 0;
  for (let scan = from; scan < text.length; scan += 1) {
    if (text[scan] === '(') depth += 1;
    else if (text[scan] === ')') {
      depth -= 1;
      if (depth === 0) return scan + 1;
    }
  }
  return -1;
}

/**
 * Every `var()` call in `text` that is not nested inside another one, with its name and its
 * fallback.
 *
 * Outermost-only is deliberate: a fallback is substituted as TEXT, so a `var()` inside it is
 * expanded on the following round rather than reached past on this one.
 *
 * @param {string} text
 * @returns {Array<{start: number, end: number, name: string, fallback: string|null}>}
 */
export function varReferencesIn(text) {
  const references = [];
  let index = 0;
  while (index < text.length) {
    const start = text.indexOf('var(', index);
    if (start === -1) break;
    if (start > 0 && /[\w-]/.test(text[start - 1])) {
      index = start + 4;
      continue;
    }
    const end = closingParenthesis(text, start + 3);
    if (end === -1) break;
    const inner = text.slice(start + 4, end - 1);
    const comma = topLevelComma(inner);
    references.push({
      start,
      end,
      name: (comma === -1 ? inner : inner.slice(0, comma)).trim(),
      fallback: comma === -1 ? null : inner.slice(comma + 1).trim(),
    });
    index = end;
  }
  return references;
}

/** Every text one reference may stand for, or `null` when nothing in the corpus defines it. */
function substitutionsFor(reference, definitions) {
  const options = new Set(definitions.get(reference.name));
  if (reference.fallback !== null) options.add(reference.fallback);
  return options.size === 0 ? null : [...options];
}

/** Substitute every top-level reference in `text` once, in all combinations. */
function expandOnce(text, definitions) {
  const references = varReferencesIn(text);
  if (references.length === 0) return [];
  let combinations = [[]];
  for (const reference of references) {
    const options = substitutionsFor(reference, definitions) ?? [text.slice(reference.start, reference.end)];
    combinations = combinations.flatMap((prefix) => options.map((option) => [...prefix, option]));
    if (combinations.length > MAX_VALUE_CANDIDATES) {
      throw new Error(
        `resolving "${text}" produced more than ${MAX_VALUE_CANDIDATES} candidate texts. That is ` +
          'a corpus this scanner was not sized for, not a pass: truncating the candidate set ' +
          'would make the scan answer "no banned value here" for the wrong reason. Raise ' +
          'MAX_VALUE_CANDIDATES deliberately, or narrow what the caller scans.'
      );
    }
  }
  return combinations.map((combination) => {
    let out = '';
    let cursor = 0;
    for (const [position, reference] of references.entries()) {
      out += text.slice(cursor, reference.start) + combination[position];
      cursor = reference.end;
    }
    return out + text.slice(cursor);
  });
}

/**
 * Expand every text in `frontier` once, returning only the results `candidates` had not already
 * seen — and adding them to it. The visited set is mutated here rather than by the caller so that
 * "produced" and "not seen before" cannot drift apart.
 *
 * @param {string[]} frontier
 * @param {Map<string, string[]>} definitions
 * @param {Set<string>} candidates Mutated in place.
 * @returns {string[]}
 */
function expandFrontier(frontier, definitions, candidates) {
  const fresh = [];
  for (const text of frontier) {
    for (const produced of expandOnce(text, definitions)) {
      if (candidates.has(produced)) continue;
      candidates.add(produced);
      fresh.push(produced);
    }
  }
  return fresh;
}

/**
 * Every text `value` may stand for, INCLUDING `value` itself, resolving `var()` to a fixed
 * point.
 *
 * Expansion is level-order — every top-level reference is substituted on the same round — so
 * `depth` counts hops along the longest `var()` CHAIN rather than the number of substitutions,
 * which is the number the cap is stated in and the number a reader can check by hand.
 *
 * Termination has two guards. A round that produces no text the set has not already seen ends
 * the walk, which is what closes a cycle (`--a: var(--b); --b: var(--a)` reproduces a visited
 * text) and what ends an unresolvable reference (it substitutes for itself). `maxDepth` is the
 * backstop, and it reports `capReached` rather than pretending the answer is complete.
 *
 * @param {string} value A declaration's raw value text.
 * @param {Map<string, string[]>} definitions From {@link collectCustomProperties}.
 * @param {object} [options]
 * @param {number} [options.maxDepth]
 * @returns {{candidates: string[], depth: number, capReached: boolean}}
 */
export function resolveValueCandidates(value, definitions, { maxDepth = MAX_VAR_CHAIN_DEPTH } = {}) {
  const candidates = new Set([value]);
  let frontier = [value];
  let depth = 0;
  while (frontier.length > 0) {
    if (depth >= maxDepth) return { candidates: [...candidates], depth, capReached: true };
    const fresh = expandFrontier(frontier, definitions, candidates);
    if (fresh.length === 0) break;
    depth += 1;
    frontier = fresh;
  }
  return { candidates: [...candidates], depth, capReached: false };
}

/**
 * Every pixel literal in `text`, as numbers.
 *
 * @param {string} text
 * @returns {number[]}
 */
export function pixelValuesIn(text) {
  const values = [];
  PIXEL_LITERAL.lastIndex = 0;
  for (
    let match = PIXEL_LITERAL.exec(text);
    match !== null;
    match = PIXEL_LITERAL.exec(text)
  ) {
    values.push(Number(match[1]));
  }
  return values;
}

/**
 * For each wanted pixel value that any candidate carries, the SHORTEST candidate carrying it.
 *
 * Shortest because that is the most resolved form: for `var(--fab-v2-thumb-sm)` it is `40px`
 * rather than the raw reference, which is the text a reader needs in order to adjudicate a row
 * whose source line holds no pixel value at all.
 *
 * @param {readonly string[]} candidates
 * @param {Set<number>} banned
 * @returns {Array<[number, string]>} ascending by value.
 */
function shortestCarriers(candidates, banned) {
  const carriers = new Map();
  for (const candidate of candidates) {
    for (const pixels of pixelValuesIn(candidate)) {
      if (!banned.has(pixels)) continue;
      const held = carriers.get(pixels);
      if (held === undefined || candidate.length < held.length) carriers.set(pixels, candidate);
    }
  }
  return [...carriers].sort((left, right) => left[0] - right[0]);
}

/**
 * Scan a corpus for declarations of `properties` carrying any of `values` in pixels, through
 * `var()`.
 *
 * @param {object} options
 * @param {Record<string, string>} options.corpus From {@link collectStyleCorpus}.
 * @param {readonly string[]} options.properties Properties to scan, e.g. `['height']`.
 * @param {readonly number[]} options.values Pixel values to find, e.g. `[32, 36, 40]`.
 * @param {number} [options.maxDepth]
 * @returns {{
 *   occurrences: Array<{file: string, line: number, property: string, value: number,
 *     raw: string, resolved: string}>,
 *   declarations: Array<{file: string, line: number, property: string, value: string}>,
 *   maxDepth: number,
 *   capReached: string[],
 * }} `occurrences` holds one entry per (declaration, matched value) pair; `resolved` is the
 *   shortest candidate text actually carrying the value, which for an indirect hit is a text
 *   the source line does not contain.
 */
export function scanPixelValues({ corpus, properties, values, maxDepth = MAX_VAR_CHAIN_DEPTH }) {
  const wanted = new Set(properties);
  const banned = new Set(values);
  const definitions = collectCustomProperties(corpus);
  const declarations = [];
  const occurrences = [];
  const capReached = [];
  let observedDepth = 0;

  for (const [file, css] of Object.entries(corpus)) {
    for (const declaration of declarationsIn(file, css)) {
      if (!wanted.has(declaration.property)) continue;
      declarations.push(declaration);
      const resolution = resolveValueCandidates(declaration.value, definitions, { maxDepth });
      observedDepth = Math.max(observedDepth, resolution.depth);
      if (resolution.capReached) capReached.push(`${file}:${declaration.line}`);
      for (const [value, resolved] of shortestCarriers(resolution.candidates, banned)) {
        occurrences.push({
          file,
          line: declaration.line,
          property: declaration.property,
          value,
          raw: declaration.value,
          resolved,
        });
      }
    }
  }

  return { occurrences, declarations, maxDepth: observedDepth, capReached };
}
