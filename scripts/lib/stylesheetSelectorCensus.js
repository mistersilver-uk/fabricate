/**
 * Which selectors `styles/fabricate.css` repeats, and which repeated rules could safely merge.
 *
 * WHY THIS EXISTS. "The same selector appears twice, so collapse the two blocks" is the tidying
 * instinct a 24k-line sheet invites, and it is wrong here in a way only a measurement can show.
 * Issue 1501 measured the sheet and found that the repetition is almost entirely a selector
 * appearing in one comma-separated LIST and again in a DIFFERENT list — shared-list authoring,
 * three instances of it carrying a comment saying so — while the population of repeated full
 * selector LISTS, the only population a merge could act on, is zero. `stylelint`'s
 * `no-duplicate-selectors` is enabled on this sheet and green, and its default
 * `disallowInList: false` is exactly why those two facts coexist. So this module answers two
 * different questions and keeps them apart:
 *
 *   1. WHAT REPEATS. {@link selectorAppearances} tallies every selector-list member, keyed by
 *      `(at-context chain, normalised selector)`. That tally is the census's headline figure and
 *      the baseline behind issue 1501's selector-repetition ratchet, which is a description of
 *      deliberate authoring rather than a defect count.
 *   2. WHAT COULD MERGE. {@link mergeVerdict} decides, for a pair of rules, whether collapsing
 *      them can move a pixel. Repetition is the cheap half of that question; the cascade is the
 *      expensive half, and the answer is almost always "no".
 *
 * ── THE MERGE PREDICATE ──────────────────────────────────────────────────────────────────────
 * Two rules R1 (earlier) and R2 (later) merge if and only if:
 *
 *   (a) they share an identical at-rule context chain — the ordered enclosing `@media`/`@supports`/
 *       `@container`/`@layer` preludes. Two rules under different conditions are not the same rule
 *       under any circumstance, so they are never candidates;
 *   (b) they share an identical full selector LIST after normalisation, member ORDER PRESERVED. A
 *       selector shared between two DIFFERENT lists is out of scope, and deliberately so: splitting
 *       a shared list to lift one member out changes that member's cascade position and manufactures
 *       exactly the duplicate list `no-duplicate-selectors` rejects;
 *   (c) no rule strictly between them in source order is a BLOCKER — see below;
 *   (d) and the merge is written at R2's position, the position of the LAST declaration, so no
 *       declaration moves EARLIER in the cascade. R1's declarations that R2 does not restate move
 *       later, which can only change paint if (c) is violated. {@link mergeVerdict} returns that
 *       block already assembled: R1's declarations in order, then R2's, dropping R1's copy of any
 *       property R2 restates.
 *
 * ── "BLOCKER" IS A SOUND OVER-APPROXIMATION, IN TWO SHAPES ───────────────────────────────────
 * "This rule matches an element R1 can match" is not statically decidable, so both walks
 * over-approximate. They differ only in how they admit a candidate, and {@link walkInterval} is
 * the one implementation both use.
 *
 * The PROPERTY test is shared and is the half a name-equality implementation gets wrong. Both
 * sides are expanded to LONGHANDS before they are intersected, because this sheet uses shorthands
 * heavily: `background` against `background-color`, `border` against `border-width`, `outline`
 * against `outline-color`, `gap` against `row-gap`, `margin` against `margin-top` are all real
 * conflicts that `property === property` cannot see, in both directions.
 *
 *   - {@link censusBlockerWalk} — for the census, where R1 and R2 have IDENTICAL selector lists and
 *     the interval is short. A candidate is admitted when its specificity EQUALS R1's, or when its
 *     selector shares a class, type, id or attribute token with any compound of R1's list. Equal
 *     specificity alone is enough because that is the only case in which source order decides the
 *     winner, and it catches the pair a token test misses: `.fabricate-manager .card {background}`
 *     against `.fabricate .is-open {background-color}` on `<div class="card is-open">` share no
 *     token and are both (0,2,0). The token clause costs nothing over a short interval.
 *   - {@link scopedBlockerWalk} — for issue 1501's criterion 5, where a utility is adopted by a
 *     donor rule thousands of lines away and the shared ancestor token is `.fabricate-manager`,
 *     which would swallow the whole manager sheet. A candidate is admitted only when its
 *     specificity lies in the CLOSED BAND between the donor's and the utility's — a flip is
 *     possible only there, since a rule above the band wins in both orders and one below loses in
 *     both — and when its SUBJECT compound can match the adopting element's real class list, read
 *     as the union of every class that element can carry. A subject compound that is a bare type,
 *     attribute or universal selector is admitted regardless, since it constrains no class.
 *
 * The band clause is sound for this sheet because the sheet declares NO `@layer` at all
 * ({@link atRuleBlocksIn} measures that rather than assuming it): within one origin and one
 * importance, a source-order flip is possible only at equal specificity. An at-rule changes
 * neither specificity nor layer rank, so a rule inside one is still walked as a candidate blocker
 * whether or not its condition holds — which is why {@link censusRules} REPORTS `atContext` rather
 * than filtering on it.
 *
 * A rule whose `!important` declaration overlaps the pair's properties blocks unconditionally,
 * bypassing every admission gate above. An `!important` declaration on a property the pair does not
 * touch is left to the ordinary test, because it cannot reach the pair's properties at all.
 *
 * ── WHY THE DECLARATION TEXT IS SLICED THROUGH `stripCssComments` ────────────────────────────
 * {@link ruleBlocks} returns no body — its offsets index the ORIGINAL, comment-bearing text — so
 * this module slices its own declaration text, and slices it out of the COMMENT-STRIPPED copy. An
 * uncommented slice makes a commented-out declaration read as a live blocker, and a false
 * `BLOCKED BY` is a silently deferred adoption rather than a loud failure.
 *
 * ── WHY THERE IS NO NEW CSS PARSER HERE ──────────────────────────────────────────────────────
 * The rule walk is {@link ruleBlocks}, extended for this module to expose its at-context chain;
 * comment stripping and selector-list splitting are `tests/helpers/styleBlockScan.js`. The one
 * scan this module adds of its own, {@link atRuleBlocksIn}, parses no rule and no declaration: it
 * enumerates at-rule preludes, which the rule walk deliberately discards, because issue 1501 has
 * to RECORD the sheet's at-rule block count and its absence of `@layer` rather than assert them.
 */

import { splitSelectorList, stripCssComments } from '../../tests/helpers/styleBlockScan.js';

import { compoundClasses, compoundsOf, ruleBlocks } from './stylesheetLiveClasses.js';

const SIDES = ['top', 'right', 'bottom', 'left'];
const CORNERS = ['top-left', 'top-right', 'bottom-right', 'bottom-left'];

/**
 * One level of shorthand expansion. Resolved transitively by {@link longhandsOf}, so `border` need
 * only name `border-width`/`border-style`/`border-color` and not all twelve leaves.
 *
 * The logical-property entries (`margin-block`, `padding-inline`, `inset-block`, …) map to their
 * physical equivalents in a horizontal-tb writing mode, which is the only mode this sheet ships.
 * That is the conservative direction anyway: it can only make two rules overlap that a stricter
 * reading would separate, and an over-reported conflict blocks a merge rather than allowing one.
 */
const DIRECT_EXPANSIONS = [
  [
    'background',
    [
      'background-color',
      'background-image',
      'background-position',
      'background-size',
      'background-repeat',
      'background-origin',
      'background-clip',
      'background-attachment',
    ],
  ],
  ['border', ['border-width', 'border-style', 'border-color']],
  ['border-width', SIDES.map((side) => `border-${side}-width`)],
  ['border-style', SIDES.map((side) => `border-${side}-style`)],
  ['border-color', SIDES.map((side) => `border-${side}-color`)],
  ...SIDES.map((side) => [
    `border-${side}`,
    [`border-${side}-width`, `border-${side}-style`, `border-${side}-color`],
  ]),
  ['border-block', ['border-top', 'border-bottom']],
  ['border-inline', ['border-left', 'border-right']],
  ['border-block-start', ['border-top']],
  ['border-block-end', ['border-bottom']],
  ['border-inline-start', ['border-left']],
  ['border-inline-end', ['border-right']],
  ['border-radius', CORNERS.map((corner) => `border-${corner}-radius`)],
  ['outline', ['outline-width', 'outline-style', 'outline-color']],
  ['margin', SIDES.map((side) => `margin-${side}`)],
  ['margin-block', ['margin-top', 'margin-bottom']],
  ['margin-inline', ['margin-left', 'margin-right']],
  ['padding', SIDES.map((side) => `padding-${side}`)],
  ['padding-block', ['padding-top', 'padding-bottom']],
  ['padding-inline', ['padding-left', 'padding-right']],
  ['inset', [...SIDES]],
  ['inset-block', ['top', 'bottom']],
  ['inset-inline', ['left', 'right']],
  ['gap', ['row-gap', 'column-gap']],
  ['grid-gap', ['row-gap', 'column-gap']],
  [
    'font',
    [
      'font-style',
      'font-variant',
      'font-weight',
      'font-stretch',
      'font-size',
      'line-height',
      'font-family',
    ],
  ],
  ['flex', ['flex-grow', 'flex-shrink', 'flex-basis']],
  ['flex-flow', ['flex-direction', 'flex-wrap']],
  ['place-items', ['align-items', 'justify-items']],
  ['place-content', ['align-content', 'justify-content']],
  ['place-self', ['align-self', 'justify-self']],
  ['overflow', ['overflow-x', 'overflow-y']],
  ['overscroll-behavior', ['overscroll-behavior-x', 'overscroll-behavior-y']],
  [
    'text-decoration',
    [
      'text-decoration-line',
      'text-decoration-style',
      'text-decoration-color',
      'text-decoration-thickness',
    ],
  ],
  ['text-emphasis', ['text-emphasis-style', 'text-emphasis-color']],
  ['list-style', ['list-style-type', 'list-style-position', 'list-style-image']],
  [
    'transition',
    [
      'transition-property',
      'transition-duration',
      'transition-timing-function',
      'transition-delay',
    ],
  ],
  [
    'animation',
    [
      'animation-name',
      'animation-duration',
      'animation-timing-function',
      'animation-delay',
      'animation-iteration-count',
      'animation-direction',
      'animation-fill-mode',
      'animation-play-state',
    ],
  ],
  ['grid-row', ['grid-row-start', 'grid-row-end']],
  ['grid-column', ['grid-column-start', 'grid-column-end']],
  ['grid-area', ['grid-row', 'grid-column']],
  ['grid-template', ['grid-template-rows', 'grid-template-columns', 'grid-template-areas']],
  ['grid', ['grid-template', 'grid-auto-rows', 'grid-auto-columns', 'grid-auto-flow']],
  ['columns', ['column-width', 'column-count']],
  ['column-rule', ['column-rule-width', 'column-rule-style', 'column-rule-color']],
  ['scroll-margin', SIDES.map((side) => `scroll-margin-${side}`)],
  ['scroll-padding', SIDES.map((side) => `scroll-padding-${side}`)],
  [
    'mask',
    [
      'mask-image',
      'mask-mode',
      'mask-repeat',
      'mask-position',
      'mask-clip',
      'mask-origin',
      'mask-size',
      'mask-composite',
    ],
  ],
];

const SHORTHANDS = new Map(DIRECT_EXPANSIONS);
const LONGHAND_CACHE = new Map();

/**
 * The leaf longhand properties a declared property actually sets.
 *
 * A property with no expansion is its own answer, so `color`, a vendor-prefixed name and a custom
 * property all pass through unchanged. Expansion is transitive: `border` resolves through
 * `border-width` to `border-top-width` and its eleven siblings.
 *
 * @param {string} property A declared property name, already lower-cased and trimmed.
 * @returns {string[]} The leaf longhands, in a stable order.
 */
export function longhandsOf(property) {
  const cached = LONGHAND_CACHE.get(property);
  if (cached) return cached;
  const leaves = [];
  const seen = new Set();
  const pending = [property];
  while (pending.length > 0) {
    const next = pending.shift();
    if (seen.has(next)) continue;
    seen.add(next);
    const expansion = SHORTHANDS.get(next);
    if (expansion) pending.push(...expansion);
    else leaves.push(next);
  }
  LONGHAND_CACHE.set(property, leaves);
  return leaves;
}

/**
 * The longhand properties a set of declarations sets, mapped back to the declaration that set them.
 *
 * The declaration is carried rather than discarded because a blocker report has to name the
 * property as the author WROTE it — `BLOCKED BY background @1234` is checkable against the sheet in
 * a way `BLOCKED BY background-color` is not, when no line declares `background-color`.
 *
 * @param {Array<{property: string}>} declarations
 * @returns {Map<string, {property: string}>} Longhand name to the first declaration setting it.
 */
export function declaredLonghands(declarations) {
  const owners = new Map();
  for (const declaration of declarations) {
    for (const longhand of longhandsOf(declaration.property)) {
      if (!owners.has(longhand)) owners.set(longhand, declaration);
    }
  }
  return owners;
}

const NAME_START = /[\w\-\\]/u;

function nameAt(text, index) {
  let end = index;
  while (end < text.length && NAME_START.test(text[end])) end += 1;
  return text.slice(index, end);
}

function closingAt(text, open, close) {
  let depth = 0;
  for (let index = open; index < text.length; index += 1) {
    if (text[index] === text[open]) depth += 1;
    else if (text[index] === close) {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return text.length;
}

/** Pseudo-classes contributing nothing to specificity. */
const TRANSPARENT_PSEUDOS = new Set(['where']);

/** Pseudo-classes scoring as the most specific selector in their argument list. */
const ARGUMENT_SCORED_PSEUDOS = new Set(['is', 'not', 'has', 'matches', '-moz-any', '-webkit-any']);

/** Pseudo-elements CSS2 spelled with a single colon. */
const LEGACY_PSEUDO_ELEMENTS = new Set(['before', 'after', 'first-line', 'first-letter']);

function addSpecificity(target, addition) {
  for (let rank = 0; rank < 3; rank += 1) target[rank] += addition[rank];
}

function highestOf(selectorList) {
  let best = [0, 0, 0];
  for (const member of splitSelectorList(selectorList)) {
    const candidate = specificityOf(member);
    if (compareSpecificity(candidate, best) > 0) best = candidate;
  }
  return best;
}

function scorePseudo(total, selector, index) {
  const isElement = selector[index + 1] === ':';
  const start = index + (isElement ? 2 : 1);
  const name = nameAt(selector, start).toLowerCase();
  let end = start + name.length;
  let argument = '';
  if (selector[end] === '(') {
    const close = closingAt(selector, end, ')');
    argument = selector.slice(end + 1, close);
    end = close + 1;
  }
  if (isElement || LEGACY_PSEUDO_ELEMENTS.has(name)) total[2] += 1;
  else if (ARGUMENT_SCORED_PSEUDOS.has(name)) addSpecificity(total, highestOf(argument));
  else if (!TRANSPARENT_PSEUDOS.has(name)) total[1] += 1;
  return end;
}

/**
 * The specificity of one selector, as `[ids, classes, types]`.
 *
 * Scored rather than measured: nothing here renders. `:where()` contributes nothing, `:is()`,
 * `:not()` and `:has()` contribute their most specific argument, a single-colon legacy pseudo-
 * element scores as a type, and everything else follows the CSS Selectors 4 rules.
 *
 * @param {string} selector One selector, never a comma-separated list.
 * @returns {number[]} A three-member tuple.
 */
export function specificityOf(selector) {
  const total = [0, 0, 0];
  let index = 0;
  while (index < selector.length) {
    const character = selector[index];
    switch (character) {
      case '#':
      case '.': {
        total[character === '#' ? 0 : 1] += 1;
        index += 1 + nameAt(selector, index + 1).length;

        break;
      }
      case '[': {
        total[1] += 1;
        index = closingAt(selector, index, ']') + 1;

        break;
      }
      case ':': {
        index = scorePseudo(total, selector, index);

        break;
      }
      default: {
        if (/[a-zA-Z]/u.test(character)) {
          total[2] += 1;
          index += nameAt(selector, index).length;
        } else index += 1;
      }
    }
  }
  return total;
}

/**
 * Orders two specificity tuples the way the cascade does.
 *
 * @param {number[]} left
 * @param {number[]} right
 * @returns {number} Negative when `left` loses, zero on a tie, positive when `left` wins.
 */
export function compareSpecificity(left, right) {
  for (let rank = 0; rank < 3; rank += 1) {
    if (left[rank] !== right[rank]) return left[rank] - right[rank];
  }
  return 0;
}

/**
 * A specificity tuple in the `(0,2,1)` form the issue's prose and every comment in the sheet use.
 *
 * @param {number[]} specificity
 * @returns {string}
 */
export function formatSpecificity(specificity) {
  return `(${specificity.join(',')})`;
}

function typeAndAttributeTokens(compound, sink) {
  let index = 0;
  while (index < compound.length) {
    const character = compound[index];
    switch (character) {
      case '[': {
        const close = closingAt(compound, index, ']');
        const name = nameAt(compound, index + 1);
        if (name) sink.add(`attribute:${name.toLowerCase()}`);
        index = close + 1;

        break;
      }
      case '#': {
        const name = nameAt(compound, index + 1);
        if (name) sink.add(`id:${name}`);
        index += 1 + name.length;

        break;
      }
      case ':': {
        index = index + 1 + nameAt(compound, index + 1).length;
        if (compound[index] === '(') index = closingAt(compound, index, ')') + 1;

        break;
      }
      default: {
        if (/[a-zA-Z]/u.test(character)) {
          const name = nameAt(compound, index);
          sink.add(`type:${name.toLowerCase()}`);
          index += name.length;
        } else index += 1;
      }
    }
  }
}

/**
 * Every class, type, id and attribute token any compound of a selector list requires.
 *
 * Tokens are namespaced (`class:card`, `type:button`) so a class and an element of the same name
 * cannot collide. Classes come from {@link compoundClasses}, which excludes the arguments of a
 * functional pseudo-class: a `:not()` argument is a class the element must NOT carry, so it is not
 * a requirement and counting it would admit blockers that cannot possibly collide.
 *
 * @param {string} selectorList A rule's whole selector list.
 * @returns {Set<string>}
 */
export function selectorListTokens(selectorList) {
  const tokens = new Set();
  for (const member of splitSelectorList(selectorList)) {
    for (const compound of compoundsOf(member)) {
      for (const name of compoundClasses(compound)) tokens.add(`class:${name}`);
      typeAndAttributeTokens(compound, tokens);
    }
  }
  return tokens;
}

/** The rightmost compound of a selector — the element the rule actually styles. */
function subjectOf(selector) {
  return compoundsOf(selector).at(-1) ?? selector;
}

const COMBINATOR_SPACING = /\s*([>+~])\s*/gu;

/**
 * A selector in the one spelling two authored copies of it always share.
 *
 * Whitespace runs collapse and combinators lose their optional padding, so `a>b` and `a > b` are
 * one selector. Member order inside a list is NEVER touched: `a, b` and `b, a` select the same
 * elements but occupy different positions in their own list, and (b) compares lists as written.
 *
 * @param {string} selector
 * @returns {string}
 */
export function normaliseSelector(selector) {
  return selector.trim().replaceAll(/\s+/gu, ' ').replaceAll(COMBINATOR_SPACING, ' $1 ');
}

/**
 * A binary-search offset-to-line lookup over one text.
 *
 * The scan is a code-UNIT index loop for the same reason `ruleBlocks` gives: every offset asked
 * about here comes from that walk and indexes code units, and `for…of` iterates code POINTS, so one
 * astral character would shift every line boundary after it. The autofixed `text.entries()` form is
 * not merely wrong about that, it does not exist on a string at all — it throws on the first call.
 */
function lineIndexOf(text) {
  const starts = [0];
  // eslint-disable-next-line unicorn/no-for-loop -- see above: the code-unit index is the answer
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === '\n') starts.push(index + 1);
  }
  return (offset) => {
    let low = 0;
    let high = starts.length - 1;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      if (starts[middle] <= offset) low = middle;
      else high = middle - 1;
    }
    return low + 1;
  };
}

const PROPERTY_NAME = /^(?:--[\w-]+|-?[a-zA-Z][\w-]*)$/u;

function flushDeclaration(text, from, to, lineAt, sink) {
  const segment = text.slice(from, to);
  const colon = segment.indexOf(':');
  if (colon === -1) return;
  const property = segment.slice(0, colon).trim().toLowerCase();
  if (!PROPERTY_NAME.test(property)) return;
  const value = segment.slice(colon + 1).trim();
  sink.push({
    property,
    value,
    important: /!\s*important\b/iu.test(value),
    line: lineAt(from + segment.length - segment.trimStart().length),
  });
}

/**
 * The top-level declarations of one rule body.
 *
 * Nested blocks are skipped rather than descended into: a nested rule's declarations belong to the
 * nested rule, and its prelude is not a declaration at all.
 *
 * @param {string} text The comment-stripped stylesheet.
 * @param {number} from Offset just past the rule's opening brace.
 * @param {number} to Offset of the rule's closing brace.
 * @param {(offset: number) => number} lineAt
 * @returns {Array<{property: string, value: string, important: boolean, line: number}>}
 */
function declarationsBetween(text, from, to, lineAt) {
  const declarations = [];
  let segmentStart = from;
  let parens = 0;
  let braces = 0;
  for (let index = from; index < to; index += 1) {
    const character = text[index];
    if (character === '(') parens += 1;
    else if (character === ')') parens -= 1;
    else if (parens === 0 && character === '{') {
      braces += 1;
      segmentStart = index + 1;
    } else if (parens === 0 && character === '}') {
      braces -= 1;
      segmentStart = index + 1;
    } else if (parens === 0 && braces === 0 && character === ';') {
      flushDeclaration(text, segmentStart, index, lineAt, declarations);
      segmentStart = index + 1;
    }
  }
  if (braces === 0) flushDeclaration(text, segmentStart, to, lineAt, declarations);
  return declarations;
}

/**
 * Every rule of a stylesheet with the parts the merge predicate arbitrates on.
 *
 * `selectors` is the normalised list, order preserved; `listKey` is (a)+(b) as one string, so two
 * rules are candidates exactly when their `listKey`s are equal.
 *
 * @param {string} css Raw stylesheet text.
 * @returns {Array<{index: number, selector: string, selectors: string[], listKey: string,
 *   atContext: string[], atKey: string, line: number, endLine: number, specificity: number[],
 *   tokens: Set<string>, declarations: Array<{property: string, value: string, important: boolean,
 *   line: number}>, sole: boolean}>}
 */
export function censusRules(css) {
  const scan = stripCssComments(css);
  const lineAt = lineIndexOf(scan);
  return ruleBlocks(css).map((rule, index) => {
    const selectors = splitSelectorList(rule.selector).map((member) => normaliseSelector(member));
    const atKey = rule.atContext.join(' >> ');
    const open = scan.indexOf('{', rule.start);
    return {
      index,
      selector: rule.selector,
      selectors,
      listKey: `${atKey} ${selectors.join(', ')}`,
      atContext: rule.atContext,
      atKey,
      line: rule.line,
      endLine: rule.endLine,
      specificity: highestOf(rule.selector),
      tokens: selectorListTokens(rule.selector),
      declarations: declarationsBetween(scan, open + 1, rule.end - 1, lineAt),
      sole: selectors.length === 1,
    };
  });
}

/**
 * Every selector-list member of the sheet, tallied by where it appears.
 *
 * `keyByAtContext` is the difference between the two figures issue 1501 publishes. Keyed WITH the
 * at-context, a selector inside a container query is a different key from the same selector at the
 * top level, which is what the merge predicate needs, because those two rules are never candidates.
 * Keyed WITHOUT it the count is higher and answers the plainer reader question "how many times does
 * this text appear in the file". Both are published so a reader can tell which produced a pin.
 *
 * @param {ReturnType<typeof censusRules>} rules
 * @param {object} [options]
 * @param {boolean} [options.keyByAtContext] Defaults to true.
 * @returns {Map<string, {selector: string, atContext: string[],
 *   appearances: Array<{line: number, endLine: number, sole: boolean, members: number,
 *   selector: string, atContext: string[], ruleIndex: number}>}>}
 */
export function selectorAppearances(rules, { keyByAtContext = true } = {}) {
  const appearances = new Map();
  for (const rule of rules) {
    for (const selector of rule.selectors) {
      const key = keyByAtContext ? `${rule.atKey} ${selector}` : selector;
      if (!appearances.has(key)) {
        appearances.set(key, {
          selector,
          atContext: keyByAtContext ? rule.atContext : [],
          appearances: [],
        });
      }
      appearances.get(key).appearances.push({
        line: rule.line,
        endLine: rule.endLine,
        sole: rule.sole,
        members: rule.selectors.length,
        selector: rule.selector,
        atContext: rule.atContext,
        ruleIndex: rule.index,
      });
    }
  }
  return appearances;
}

/**
 * The rule pairs satisfying (a) and (b) — the only pairs a merge could ever act on.
 *
 * Consecutive occurrences only: three rules sharing a list yield the pairs (1,2) and (2,3), because
 * merging (1,3) across a copy of themselves is not a thing the predicate describes.
 *
 * @param {ReturnType<typeof censusRules>} rules
 * @returns {Array<{earlier: number, later: number}>} Indices into `rules`.
 */
export function identicalListPairs(rules) {
  const previous = new Map();
  const pairs = [];
  for (const rule of rules) {
    const seen = previous.get(rule.listKey);
    if (seen !== undefined) pairs.push({ earlier: seen, later: rule.index });
    previous.set(rule.listKey, rule.index);
  }
  return pairs;
}

/**
 * Walks the rules strictly between two positions and reports the first blocker, if any.
 *
 * The property test lives here and is shared; `admits` is the one thing the two walks disagree
 * about. A rule whose `!important` declaration reaches one of `wanted` bypasses `admits` entirely.
 *
 * @param {object} interval
 * @param {ReturnType<typeof censusRules>} interval.rules
 * @param {number} interval.from Index of the earlier endpoint, exclusive.
 * @param {number} interval.to Index of the later endpoint, exclusive.
 * @param {Map<string, {property: string}>} interval.wanted Longhands the endpoints set.
 * @param {(rule: object) => boolean} interval.admits Whether a conflicting rule can reach them.
 * @returns {{blocked: boolean, blockers: Array<{ruleIndex: number, line: number, selector: string,
 *   property: string, longhand: string, important: boolean,
 *   specificity: number[]}>}}
 */
function walkInterval({ rules, from, to, wanted, admits }) {
  const blockers = [];
  for (let index = from + 1; index < to; index += 1) {
    const rule = rules[index];
    for (const declaration of rule.declarations) {
      const longhand = longhandsOf(declaration.property).find((name) => wanted.has(name));
      if (!longhand) continue;
      if (!declaration.important && !admits(rule)) continue;
      blockers.push({
        ruleIndex: index,
        line: declaration.line,
        selector: rule.selector,
        property: declaration.property,
        longhand,
        important: declaration.important,
        specificity: rule.specificity,
      });
      break;
    }
  }
  return { blocked: blockers.length > 0, blockers };
}

/**
 * Criterion (c) for the census: the two endpoints have IDENTICAL selector lists.
 *
 * @param {ReturnType<typeof censusRules>} rules
 * @param {number} earlier Index of R1.
 * @param {number} later Index of R2.
 * @returns {ReturnType<typeof walkInterval>}
 */
export function censusBlockerWalk(rules, earlier, later) {
  const first = rules[earlier];
  const second = rules[later];
  const wanted = declaredLonghands([...first.declarations, ...second.declarations]);
  return walkInterval({
    rules,
    from: earlier,
    to: later,
    wanted,
    admits: (rule) =>
      compareSpecificity(rule.specificity, first.specificity) === 0 ||
      [...rule.tokens].some((token) => first.tokens.has(token)),
  });
}

function withinBand(specificity, band) {
  const [low, high] = compareSpecificity(band[0], band[1]) <= 0 ? band : [band[1], band[0]];
  return compareSpecificity(specificity, low) >= 0 && compareSpecificity(specificity, high) <= 0;
}

function subjectCanMatch(rule, element) {
  return rule.selectors.some((selector) => {
    const subject = subjectOf(selector);
    const classes = compoundClasses(subject);
    if (classes.length === 0) return true;
    return classes.every((name) => element.classes.includes(name));
  });
}

/**
 * Criterion 5's blocker walk: a utility adopted by a donor rule far away in the sheet.
 *
 * The census's ancestor-token clause is deliberately NOT used here. Over an interval that can be
 * ten thousand lines the shared ancestor token is `.fabricate-manager`, and it would report the
 * whole manager sheet as a blocker. The subject-and-class-list form asks the narrower question the
 * adoption actually turns on: can this rule style THIS element?
 *
 * @param {object} walk
 * @param {ReturnType<typeof censusRules>} walk.rules
 * @param {number} walk.from Index of the earlier endpoint, exclusive.
 * @param {number} walk.to Index of the later endpoint, exclusive.
 * @param {Array<{property: string}>} walk.declarations The declarations being moved.
 * @param {number[][]} walk.band The donor's and the utility's specificities, in either order.
 * @param {{classes: string[]}} walk.element The adopting element's class list, read as the UNION of
 *   its static `class` attribute, every `class:` directive and every conditional class expression.
 * @returns {ReturnType<typeof walkInterval>}
 */
export function scopedBlockerWalk({ rules, from, to, declarations, band, element }) {
  const wanted = declaredLonghands(declarations);
  return walkInterval({
    rules,
    from,
    to,
    wanted,
    admits: (rule) => withinBand(rule.specificity, band) && subjectCanMatch(rule, element),
  });
}

function mergedDeclarations(first, second) {
  const restated = new Set(second.declarations.flatMap(({ property }) => longhandsOf(property)));
  const kept = first.declarations.filter(({ property }) =>
    longhandsOf(property).some((longhand) => !restated.has(longhand))
  );
  return [...kept, ...second.declarations];
}

/**
 * Whether two rules merge, and if not, what stops them.
 *
 * @param {ReturnType<typeof censusRules>} rules
 * @param {number} earlier Index of R1.
 * @param {number} later Index of R2.
 * @returns {{verdict: 'MERGED'|'BLOCKED', reason: string, at: number,
 *   blockers: Array<object>, declarations: Array<{property: string, value: string}>}}
 */
export function mergeVerdict(rules, earlier, later) {
  const first = rules[earlier];
  const second = rules[later];
  if (first.atKey !== second.atKey) {
    return { verdict: 'BLOCKED', reason: 'at-context differs (a)', at: second.line, blockers: [] };
  }
  if (first.selectors.join(', ') !== second.selectors.join(', ')) {
    return {
      verdict: 'BLOCKED',
      reason: 'selector lists differ (b)',
      at: second.line,
      blockers: [],
    };
  }
  const { blocked, blockers } = censusBlockerWalk(rules, earlier, later);
  if (blocked) {
    const [head] = blockers;
    return {
      verdict: 'BLOCKED',
      reason: `BLOCKED BY ${head.property} @${head.line}`,
      at: second.line,
      blockers,
    };
  }
  return {
    verdict: 'MERGED',
    reason: `merged at R2's position, line ${second.line}`,
    at: second.line,
    blockers: [],
    declarations: mergedDeclarations(first, second),
  };
}

const CONDITIONAL_AT_RULES = new Set(['@media', '@supports', '@container', '@layer', '@scope']);

/**
 * Every at-rule block of a stylesheet, with the depth it sits at.
 *
 * The rule walk reports rules and discards their containers, so nothing else in the repository can
 * say how many at-rule blocks the sheet has or whether it declares a `@layer` — and issue 1501's
 * band clause is sound only BECAUSE it declares none, which is a fact to measure rather than
 * assume. This scan parses no rule and no declaration; it reads preludes and braces only.
 *
 * `@layer` is reported in both of its forms: the block form counts as a block, and the statement
 * form (`@layer a, b;`) is reported with `block: false`, since either would establish a layer.
 *
 * @param {string} css Raw stylesheet text.
 * @returns {Array<{name: string, prelude: string, line: number, endLine: number, depth: number,
 *   block: boolean, conditional: boolean}>}
 */
export function atRuleBlocksIn(css) {
  const scan = stripCssComments(css);
  const lineAt = lineIndexOf(scan);
  const found = [];
  const open = [];
  let at = -1;
  for (let index = 0; index < scan.length; index += 1) {
    const character = scan[index];
    if (character === '@' && at === -1 && startsPrelude(scan, index)) at = index;
    else if (character === '{') {
      open.push(at === -1 ? null : { at, depth: open.length });
      at = -1;
    } else if (character === '}') {
      const closed = open.pop();
      if (closed) found.push(atRuleRecord(scan, closed, index, lineAt, true));
    } else if (character === ';' && at !== -1) {
      found.push(atRuleRecord(scan, { at, depth: open.length }, index, lineAt, false));
      at = -1;
    }
  }
  return found.sort((left, right) => left.line - right.line);
}

/** The characters an at-rule prelude may follow — a block boundary or a statement boundary. */
const PRELUDE_OPENERS = new Set(['{', '}', ';']);

/** Whether an `@` opens a prelude rather than sitting inside a value, a string or a selector. */
function startsPrelude(scan, index) {
  for (let scanBack = index - 1; scanBack >= 0; scanBack -= 1) {
    const character = scan[scanBack];
    if (/\s/u.test(character)) continue;
    return PRELUDE_OPENERS.has(character);
  }
  return true;
}

function atRuleRecord(scan, opened, end, lineAt, block) {
  const prelude = scan
    .slice(opened.at, block ? scan.indexOf('{', opened.at) : end)
    .trim()
    .replaceAll(/\s+/gu, ' ');
  const name = prelude.split(/[\s(]/u, 1)[0].toLowerCase();
  return {
    name,
    prelude,
    line: lineAt(opened.at),
    endLine: lineAt(end),
    depth: opened.depth,
    block,
    conditional: CONDITIONAL_AT_RULES.has(name),
  };
}

/**
 * The whole census of one stylesheet: what repeats, what could merge, and the cascade facts the
 * merge predicate's soundness rests on.
 *
 * @param {string} css Raw stylesheet text.
 * @returns {object} The census, ready for {@link formatCensusReport} or a gate baseline.
 */
export function duplicateSelectorCensus(css) {
  const rules = censusRules(css);
  const keyed = selectorAppearances(rules);
  const bare = selectorAppearances(rules, { keyByAtContext: false });
  const repeated = [...keyed.values()].filter((entry) => entry.appearances.length > 1);
  const pairs = identicalListPairs(rules).map((pair) => ({
    ...pair,
    verdict: mergeVerdict(rules, pair.earlier, pair.later),
  }));
  const atRules = atRuleBlocksIn(css);
  return {
    rules,
    repeated: repeated.sort((left, right) => left.appearances[0].line - right.appearances[0].line),
    repeatedKeyedCount: repeated.length,
    repeatedBareCount: [...bare.values()].filter((entry) => entry.appearances.length > 1).length,
    repetitionTotal: repeated.reduce((sum, entry) => sum + entry.appearances.length, 0),
    identicalListPairs: pairs,
    mergeable: pairs.filter(({ verdict }) => verdict.verdict === 'MERGED'),
    atRules,
    layerDeclarations: atRules.filter(({ name }) => name === '@layer'),
    rulesInAtContext: rules.filter((rule) => rule.atContext.length > 0).length,
  };
}

function appearanceLine(appearance) {
  const shape = appearance.sole
    ? 'sole selector'
    : `list member ${appearance.members > 1 ? `of ${appearance.members}` : ''}`.trim();
  return `      @${appearance.line}-${appearance.endLine}  ${shape}`;
}

function atRuleSummary(atRules) {
  const tally = new Map();
  for (const rule of atRules) tally.set(rule.name, (tally.get(rule.name) ?? 0) + 1);
  return [...tally].map(([name, count]) => `${name} x${count}`).join(', ');
}

function repeatedSection(census) {
  const lines = [];
  for (const entry of census.repeated) {
    const context = entry.atContext.length > 0 ? entry.atContext.join(' >> ') : '(top level)';
    lines.push(
      `  ${entry.selector}`,
      `      at-context: ${context}   appearances: ${entry.appearances.length}`,
      ...entry.appearances.map((appearance) => appearanceLine(appearance))
    );
  }
  return lines;
}

/**
 * The census as the report issue 1501 publishes.
 *
 * @param {object} census The value {@link duplicateSelectorCensus} returned.
 * @param {string} [label] What was censused, for the header.
 * @returns {string}
 */
export function formatCensusReport(census, label = 'stylesheet') {
  const conditional = census.atRules.filter((rule) => rule.conditional && rule.block);
  const triples = census.repeated.filter((entry) => entry.appearances.length === 3).length;
  const more = census.repeated.filter((entry) => entry.appearances.length > 3).length;
  return [
    `DUPLICATE-SELECTOR CENSUS — ${label}`,
    '',
    `rules                                  ${census.rules.length}`,
    `rules inside an at-context             ${census.rulesInAtContext}`,
    `at-rule blocks (conditional groups)    ${conditional.length}`,
    `at-rule blocks (all kinds)             ${atRuleSummary(census.atRules)}`,
    `@layer declarations                    ${census.layerDeclarations.length}`,
    '',
    `selectors repeated, keyed (at-context, selector)   ${census.repeatedKeyedCount}` +
      ` keys / ${census.repetitionTotal} appearances`,
    `selectors repeated, keyed on selector alone        ${census.repeatedBareCount} keys`,
    `  of the keyed population: ${triples} appear three times, ${more} four or more`,
    '',
    `rule pairs with an identical (at-context, selector LIST)   ${census.identicalListPairs.length}`,
    `  of which MERGED                                          ${census.mergeable.length}`,
    '',
    'PER-SELECTOR APPEARANCES',
    ...repeatedSection(census),
    '',
    'CANDIDATE PAIRS',
    ...(census.identicalListPairs.length === 0
      ? ['  (none — no selector list is repeated in the same at-context)']
      : census.identicalListPairs.map(
          ({ earlier, later, verdict }) =>
            `  ${census.rules[earlier].line} + ${census.rules[later].line}` +
            `  ${census.rules[earlier].selector}  ->  ${verdict.verdict}: ${verdict.reason}`
        )),
    '',
  ].join('\n');
}
