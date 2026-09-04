/**
 * A CSS declaration scanner over BOTH stylesheets the product ships (issue 1391).
 *
 * `npm run lint:css` globs `styles/**` and nothing else, so the ~440 declarations living in
 * Svelte scoped `<style>` blocks are unreachable by stylelint — which is to say the half of
 * the corpus most likely to drift is entirely unlinted. Any gate that wants to police a CSS
 * VALUE therefore has to read both corpora itself, and this is the shared way to do it. Its
 * first customer is `tests/components/control-height-ladder.test.js`; its second, and the reason
 * {@link scanPixelDeclarations} exists under {@link scanPixelValues}, is
 * `tests/components/spacing-scale-ratchet.test.js`.
 *
 * ── WHY IT RESOLVES `var()` AT ALL ──────────────────────────────────────────────────────
 * A value gate matches on TEXT, so a banned literal written into a custom property and read
 * back is invisible to it. The consequence is not the missed occurrence — it is that with a
 * text-only scan the CHEAPEST WAY TO PAY A RATCHET DOWN is to move the literal into a token.
 * The pixel does not move, the control is still 36px tall, and the gate goes green. A ratchet
 * whose debt can be discharged by renaming is not a ratchet.
 *
 * The shipped corpus carried exactly that shape until issue 1399 — `styles/fabricate.css`
 * declared a 40px thumbnail token that one Svelte block read — and the collapse of the legacy
 * token generations inlined it. So the capability is no longer proved by the tree happening to
 * contain such a pair: `style-block-scan.test.js` builds a SYNTHETIC CORPUS OF REAL FILES in a
 * tmpdir, a `.css` declaring the token and a `.svelte` reading it, and drives it through
 * `collectStyleCorpus` so the walker, the `<style>` extractor and the resolver are all still
 * proved end to end. Do not weaken that to an in-memory `{path: text}` literal: `scanPixelValues`
 * accepts one, and it would bypass every stage above the resolver.
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
 * `src/`, 180 files carry a real block, no file carries two, and 18 prose mentions across 16
 * files would be read as openers by a naive extractor.
 *
 * The cost of the anchor is that a block whose opener is NOT alone on its line contributes
 * nothing, silently — one `<style lang="postcss">.a{height:36px}</style>` would arrive with no
 * baseline row and red nothing. Measured, the corpus has 180 openers, 180 closers and 180
 * contributing files with no mismatch, and `style-block-scan.test.js` pins that equality
 * against the real tree so the day it stops holding is a failure rather than a silent gap.
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
 * The cap on the combinations produced from ONE text in ONE round. A value naming k tokens,
 * each defined m times, expands to m**k texts per round. Exceeding it throws rather than
 * truncating, because a truncated candidate set is a scanner that answers "no banned value
 * here" for the wrong reason.
 *
 * MEASURED, over the whole corpus rather than over the heights this gate scans, because the
 * two answers are not close and the reassuring one is the narrow one. Across the six height
 * properties the widest candidate set is FOUR, at `components/Stepper.svelte:355`. Resolve
 * every declaration in the corpus instead and one of them already EXCEEDS this cap and
 * throws: `styles/fabricate.css:16026` builds a four-stop `linear-gradient` out of four colour
 * tokens, each defined once per theme, and 512 is not enough for it. The widest that does
 * resolve is 345, a `box-shadow` at `styles/fabricate.css:16070`.
 *
 * That is not a defect here — this gate scans heights, and a value gate should scan the
 * properties it means to police rather than everything — but it is the fact the stated second
 * customer had to plan around, so it is recorded rather than left to be discovered by a throw.
 *
 * Read what it bounds precisely: it is NOT a bound on the candidate set. `expandFrontier` runs
 * this expansion over every text in the frontier, so a round can grow the frontier by up to this
 * factor and there are up to `maxDepth` rounds. Single-token heights make that distinction inert
 * — one reference, a handful of definitions — but `padding: var(--a) var(--b) var(--c) var(--d)`
 * is four references in one value, which is exactly the shape the spacing gate brings.
 *
 * MEASURED for that gate too, now it exists: over the 3379 spacing declarations, resolving with
 * every definition visible reaches depth 1 and throws nothing, and resolving with the published
 * spacing scale held opaque expands nothing at all. Both sit far under this cap, so the shape
 * the paragraph above anticipated is real but is not, in this corpus, near the bound.
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
 *
 * `[a-zA-Z]` rather than `[a-z]` because CSS property names are ASCII case-insensitive, and the
 * half of this corpus stylelint cannot reach is the half where a `HEIGHT:` could survive review.
 * It costs nothing measured — the corpus holds 22,300 declarations under either spelling — and
 * a gate that reads one casing is a gate with a one-keystroke bypass.
 *
 * WIDENING THIS PATTERN IS ONLY HALF OF THAT, and the half that reaches nothing on its own.
 * Extraction is not selection: `scanPixelValues` matches the extracted name against the
 * caller's property list, so an uppercase `HEIGHT` was extracted here and dropped one line
 * later against an all-lowercase `wanted` set — an end-to-end run scored `HEIGHT: 40px` as
 * zero occurrences while `declarationsIn` alone reported it perfectly. {@link propertyKey}
 * folds both sides, and `style-block-scan.test.js` proves the casing through `scanPixelValues`
 * rather than through this pattern, because the pattern passing proves nothing about the scan.
 *
 * Custom property NAMES stay case-sensitive on BOTH sides, which is the spec's own rule:
 * `--Foo` and `--foo` are two properties. The corpus defines none that collide on case.
 *
 * WHAT IT DOES NOT READ, stated rather than left to be inferred: a single-dash vendor-prefixed
 * property never matches, because the alternation requires a letter first and `--` is spelled
 * out separately. `-webkit-appearance`, `-webkit-line-clamp` and `-webkit-box-orient` are the
 * three the corpus holds and none of them sets a height, so the gap is inert here — but a
 * `-webkit-` spelling of a property a future gate scans would pass unseen.
 */
const DECLARATION = /(?:^|[;{}])\s*(--[\w-]+|[a-zA-Z][\w-]*)\s*:\s*([^;{}]*)/g;

/**
 * A pixel literal, on a NUMERIC boundary.
 *
 * The boundary is the whole point. `min-height: 240px` read as `40px` is the first defect this
 * scanner shipped with, and it inflated the measured baseline by fourteen occurrences before
 * anyone read the output rather than the count.
 *
 * WHICH PART DOES WHICH JOB was got wrong twice, and only measurement settled it. Each claim
 * below is the answer of a differential run — shipped, lookbehind deleted, `\.\d+` deleted — and
 * not of reading the pattern.
 *
 * `240px` is protected by GREEDINESS, not by the lookbehind: leftmost-longest already consumes
 * all three digits, so deleting the lookbehind leaves that case correct and every naive test of
 * it green.
 *
 * The LOOKBEHIND guards a number glued to the identifier or filename in front of it, and both
 * halves of `[\w.]` do real work: `url(icon40px.svg)` reads as a bare `40` without it, and
 * `url(sprite.40px.png)` reads as four tenths of a pixel. Those two are the only shapes measured
 * to flip when it is deleted, which is why they are the ones the proof asserts.
 *
 * The `\.\d+` BRANCH is a separate guard and rescues a different case — the one an earlier draft
 * of this docblock credited to the lookbehind. `.40px` yields `0.4` with the lookbehind and
 * without it, so the lookbehind is not what saves it; delete this branch instead and `.40px`
 * matches nothing at all. `.4px` is valid CSS, and reading it as absent is the wrong answer in
 * the direction this gate cannot afford.
 *
 * The `i` flag is there because CSS units are ASCII case-insensitive: `height: 40PX` is forty
 * pixels and read `40` as nothing without it. The corpus holds zero uppercase `px` today across
 * all 22,300 declarations, so this buys no occurrence — it closes a one-keystroke bypass sitting
 * precisely in the Svelte half stylelint cannot reach. Unlike the property-name widening above,
 * this one bites on its own: nothing downstream re-filters the unit.
 *
 * IT IS SIGN-BLIND, deliberately unfixed and stated here because the next customer is the
 * spacing gate. `margin: -8px` tallies as `8px`: the lookbehind excludes `[\w.]` and a `-` is
 * neither, so the minus is simply not part of the match. For a height that is unreachable — no
 * control is negative pixels tall — but a negative margin is ordinary spacing, so a spacing gate
 * that means to distinguish `-8px` from `8px` must change this pattern rather than assume it.
 */
const PIXEL_LITERAL = /(?<![\w.])(\d+(?:\.\d+)?|\.\d+)px\b/gi;

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
 * Two calls, and each is proved to be MADE rather than merely to work: delete `maskNonStyleRegions`
 * and `the ManagerButton prose trap stays shut` reds; delete `stripCssComments` and the
 * composition assertion in `a comment is blanked, and its offsets are kept` reds. Both proofs
 * route through this function for that reason — a test that calls either helper directly stays
 * green when the call here is deleted, which is how the second one shipped unproven the first time.
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
 * Files contributing no CSS at all — the 126 `.svelte` components with no scoped block, being
 * the 306 under `src/` less the 180 carrying one — are dropped, so `Object.keys()` is the set
 * of files a gate can actually cite.
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

/**
 * `collectCustomProperties` re-parses every declaration in the corpus, so a caller that scans
 * several times over one corpus pays a full pass each time. Keyed on the corpus OBJECT and held
 * weakly: a corpus is built once by `collectStyleCorpus` and never mutated, so identity is a
 * sound key, and a caller that does mutate one in place must build a new object rather than
 * expect this to notice.
 */
const definitionCache = new WeakMap();

function definitionsFor(corpus) {
  const held = definitionCache.get(corpus);
  if (held !== undefined) return held;
  const definitions = collectCustomProperties(corpus);
  definitionCache.set(corpus, definitions);
  return definitions;
}

/**
 * Every index in `text` holding a comma that separates TOP-LEVEL items — one outside `()`,
 * outside `[]` and outside a quoted string.
 *
 * Nesting is the whole reason this exists rather than `String#split(',')`. A comma separates
 * items in a selector list and cuts a `var()` into its name and its fallback, but it is ORDINARY
 * TEXT inside a functional pseudo-class (`:is(select, input)`), inside an attribute value
 * (`[data-x="a,b"]`) and inside any quoted string. The first two shapes are live: measured over
 * both shipped stylesheets, ELEVEN of 5044 rules carry a comma inside `:is(…)` or `:not(…)`, and
 * splitting one of them yields fragments that are not selectors at all — which reads to a caller
 * as a rule breaking a rule it never broke.
 *
 * Depth is CLAMPED at zero on the closing side so that one stray `)` or `]` cannot drive the
 * count negative and hide every later comma; a scanner that silently reports "no separator here"
 * is the failure mode this function exists to remove.
 *
 * Walks by UTF-16 unit rather than by `[...text]` code point, because the indexes it returns are
 * used with `String#slice`, and the two disagree the moment the text holds an astral character.
 *
 * @param {string} text
 * @returns {number[]} Ascending indexes; empty when the text holds no top-level comma.
 */
function topLevelCommas(text) {
  const indexes = [];
  let parentheses = 0;
  let brackets = 0;
  let quote = null;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quote !== null) {
      if (character === '\\') index += 1;
      else if (character === quote) quote = null;
      continue;
    }
    if (character === '"' || character === "'") quote = character;
    else if (character === '(') parentheses += 1;
    else if (character === ')') parentheses = Math.max(0, parentheses - 1);
    else if (character === '[') brackets += 1;
    else if (character === ']') brackets = Math.max(0, brackets - 1);
    else if (character === ',' && parentheses === 0 && brackets === 0) indexes.push(index);
  }
  return indexes;
}

/** The first top-level comma, or -1 — the single cut cutting `var(--a, F)` into name and fallback. */
function topLevelComma(text) {
  const [first] = topLevelCommas(text);
  return first ?? -1;
}

/**
 * A selector LIST split into the individual selectors the cascade applies SEPARATELY.
 *
 * `,` is the list separator only at top level, so `.a:is([type="text"], [type="number"])` is ONE
 * selector and not two. Exported because every gate that asks a question of "the rule's selector"
 * has to ask it of each item — `String#includes` over the joined list is satisfied by any one of
 * them — and each such gate reaching for `split(',')` re-acquires the defect above.
 *
 * An EMPTY item is returned rather than filtered out: `.a, .b,` has a trailing separator and no
 * third selector, and a caller asking "does every item satisfy P" must be given something that
 * fails rather than a shortened list that vacuously passes. This is also why the function does not
 * simply drop blanks — `splitSelectorList('')` is `['']`, not `[]`.
 *
 * @param {string} selector A rule's whole selector list, as `rulesIn`-style callers report it.
 * @returns {string[]} Each item, trimmed, in source order.
 */
export function splitSelectorList(selector) {
  const items = [];
  let start = 0;
  for (const cut of [...topLevelCommas(selector), selector.length]) {
    items.push(selector.slice(start, cut).trim());
    start = cut + 1;
  }
  return items;
}

/**
 * Every RULE in one comment-stripped stylesheet, as `{ selector, body, line }`.
 *
 * MOVED HERE FROM `tests/token-generation-gate.test.js` (issue 1497), which was its only caller
 * and is now one of several: the `:focus`, weight, shadow and radius gates in
 * `tests/components/design-system-debt-ratchets.test.js` each need a rule's SELECTOR beside its
 * declarations, which {@link declarationsIn} deliberately does not carry. It sits next to
 * {@link splitSelectorList} because the two are always used together — a rule reports its whole
 * selector LIST, and the cascade applies each item of that list separately.
 *
 * At-rule preludes (`@media`, `@container`, `@supports`, `@layer`) are NOT selectors, so a rule
 * nested inside one reports the inner prelude — which is what every caller needs, since a
 * container query around a manager rule must not be read as that rule's selector. An at-rule with
 * no block of its own (`@import`, `@charset`) never opens a brace and is skipped by construction.
 *
 * ── THE LINE NUMBER IS THE PART A RE-IMPLEMENTATION GETS WRONG ──────────────────────────
 * `line` is the line the SELECTOR starts on, tracked by a `preludeStarted` flag rather than by
 * `prelude === ''`: the prelude accumulates the whitespace between two rules, so the emptiness
 * test only ever fired at offset zero and every rule was cited at the previous `}`. In a Svelte
 * file, where `maskNonStyleRegions` replaces the entire template with spaces, that put EVERY
 * OFFENCE AT LINE 1 — a gate reporting a hundred findings, all of them at the same wrong place in
 * a 20,000-line stylesheet.
 *
 * That is recorded here because the defect is invisible to any assertion about WHICH rules were
 * found, so a fresh walk written beside this one would reacquire it and pass every count.
 * `token-generation-gate.test.js` keeps the clause that reds on it — `a rule is cited at the line
 * its own selector starts on` — and it is now the proof for every caller.
 *
 * @param {string} css Comment-stripped CSS, offsets intact — from {@link styleTextFor}.
 * @returns {Array<{selector: string, body: string, line: number}>}
 */
export function rulesIn(css) {
  const rules = [];
  const stack = [];
  let prelude = '';
  let preludeStarted = false;
  let line = 1;
  let preludeLine = 1;
  for (let index = 0; index < css.length; index += 1) {
    const character = css[index];
    if (character === '\n') line += 1;
    if (character === '{') {
      const trimmed = prelude.trim().replace(/\s+/gu, ' ');
      stack.push({ selector: trimmed, start: index + 1, line: preludeLine });
      prelude = '';
      preludeStarted = false;
      preludeLine = line;
      continue;
    }
    if (character === '}') {
      const open = stack.pop();
      if (open && !open.selector.startsWith('@')) {
        rules.push({ selector: open.selector, body: css.slice(open.start, index), line: open.line });
      }
      prelude = '';
      preludeStarted = false;
      preludeLine = line;
      continue;
    }
    if (character === ';' && stack.length === 0) {
      prelude = '';
      preludeStarted = false;
      preludeLine = line;
      continue;
    }
    if (!preludeStarted && !/\s/u.test(character)) {
      preludeStarted = true;
      preludeLine = line;
    }
    prelude += character;
  }
  return rules;
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
 * Shortest because that is the most resolved form: for a bare `var(--some-token)` it is the
 * token's own definition rather than the raw reference, which is the text a reader needs in
 * order to adjudicate a row whose source line holds no pixel value at all.
 *
 * @param {readonly string[]} candidates
 * @param {(pixels: number) => boolean} accept
 * @returns {Array<[number, string]>} ascending by value.
 */
function shortestCarriers(candidates, accept) {
  const carriers = new Map();
  for (const candidate of candidates) {
    for (const pixels of pixelValuesIn(candidate)) {
      if (!accept(pixels)) continue;
      const held = carriers.get(pixels);
      if (held === undefined || candidate.length < held.length) carriers.set(pixels, candidate);
    }
  }
  return [...carriers].sort((left, right) => left[0] - right[0]);
}

/**
 * The key a property name is MATCHED on, which is not the name it is REPORTED under.
 *
 * A standard property is folded to lower case, because CSS property names are ASCII
 * case-insensitive and `HEIGHT` and `height` are one property. A custom property is not folded
 * at all: `--Foo` and `--foo` are two properties by the spec's own rule, and folding them
 * together would make a gate scanning one of them silently answer about both.
 *
 * The occurrence record keeps the name AS AUTHORED, which matters to the ratchet downstream: a
 * `HEIGHT` row arrives as an unbaselined key and reds, rather than inflating the count of the
 * `height` row it is not.
 *
 * @param {string} name
 * @returns {string}
 */
function propertyKey(name) {
  return name.startsWith('--') ? name : name.toLowerCase();
}

/**
 * Scan a corpus for declarations of `properties` carrying a pixel value `accept` wants, through
 * `var()`.
 *
 * Property matching folds case on BOTH sides — see {@link propertyKey} — so widening
 * {@link DECLARATION} to extract an uppercase spelling actually reaches this far.
 *
 * ── WHY `accept` IS A PREDICATE AND NOT A LIST ──────────────────────────────────────────
 * The first customer bans three named heights, so a `Set` was the whole of it. The second — the
 * spacing ratchet in `tests/components/spacing-scale-ratchet.test.js` — bans EVERY pixel literal
 * in `padding`/`margin`/`gap` except two exempt bands, and enumerating "every number except
 * |N|=1 and 34..42" as a list means choosing a ceiling, which is a silent bypass the day someone
 * writes a bigger one. {@link scanPixelValues} keeps the list-shaped API for the callers that
 * want it and delegates here.
 *
 * ── WHY A DEFINITION CAN BE HELD OPAQUE ─────────────────────────────────────────────────
 * Resolution exists so a literal moved into a token is still seen (see the header). For a gate
 * whose banned set is narrow that is a pure gain. For a gate that bans ALL literals it is not:
 * `padding: var(--fab-space-3)` resolves to `12px`, and a scan that counts that has flagged the
 * exact thing the spec asks for. Measured on this corpus: 2989 spacing occurrences with every
 * token substitutable against 1005 with the published scale held opaque, so the difference is
 * not a rounding error — it is the whole sanctioned population.
 *
 * `opaqueProperty` names the definitions the caller treats as an ALLOWED indirection. A held
 * name simply has no definition to substitute, so `expandOnce` leaves the `var()` text standing
 * and the walk terminates there. Its fallback, if written, is still a candidate: `var(--x, 12px)`
 * puts a literal on the line whether or not `--x` is opaque, and a text scan would count it.
 *
 * @param {object} options
 * @param {Record<string, string>} options.corpus From {@link collectStyleCorpus}.
 * @param {readonly string[]} options.properties Properties to scan, e.g. `['height']`.
 * @param {(pixels: number) => boolean} options.accept Which pixel values are findings.
 * @param {(name: string) => boolean} [options.opaqueProperty] Custom properties NOT substituted.
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
export function scanPixelDeclarations({
  corpus,
  properties,
  accept,
  opaqueProperty,
  maxDepth = MAX_VAR_CHAIN_DEPTH,
}) {
  const wanted = new Set([...properties].map(propertyKey));
  const visible = definitionsFor(corpus);
  const definitions =
    opaqueProperty === undefined
      ? visible
      : new Map([...visible].filter(([name]) => !opaqueProperty(name)));
  const declarations = [];
  const occurrences = [];
  const capReached = [];
  let observedDepth = 0;

  for (const [file, css] of Object.entries(corpus)) {
    for (const declaration of declarationsIn(file, css)) {
      if (!wanted.has(propertyKey(declaration.property))) continue;
      declarations.push(declaration);
      const resolution = resolveValueCandidates(declaration.value, definitions, { maxDepth });
      observedDepth = Math.max(observedDepth, resolution.depth);
      if (resolution.capReached) capReached.push(`${file}:${declaration.line}`);
      for (const [value, resolved] of shortestCarriers(resolution.candidates, accept)) {
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

/**
 * Scan a corpus for declarations of `properties` carrying any of `values` in pixels, through
 * `var()`.
 *
 * The named-values spelling of {@link scanPixelDeclarations}, kept because a closed prohibition
 * — "32, 36 and 40 are retired" — reads as the list it is rather than as a predicate over it.
 *
 * @param {object} options
 * @param {Record<string, string>} options.corpus From {@link collectStyleCorpus}.
 * @param {readonly string[]} options.properties Properties to scan, e.g. `['height']`.
 * @param {readonly number[]} options.values Pixel values to find, e.g. `[32, 36, 40]`.
 * @param {number} [options.maxDepth]
 * @returns {ReturnType<typeof scanPixelDeclarations>}
 */
export function scanPixelValues({ corpus, properties, values, maxDepth = MAX_VAR_CHAIN_DEPTH }) {
  const banned = new Set(values);
  return scanPixelDeclarations({
    corpus,
    properties,
    accept: (pixels) => banned.has(pixels),
    maxDepth,
  });
}
