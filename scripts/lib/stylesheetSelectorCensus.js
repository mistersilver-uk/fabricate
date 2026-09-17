/** Which selectors `styles/fabricate.css` repeats, and which repeated rules could safely merge. */

import { splitSelectorList, stripCssComments } from '../../tests/helpers/styleBlockScan.js';

import { compoundClasses, compoundsOf, ruleBlocks } from './stylesheetLiveClasses.js';

const SIDES = ['top', 'right', 'bottom', 'left'];
const CORNERS = ['top-left', 'top-right', 'bottom-right', 'bottom-left'];

/**
 * One level of shorthand expansion. Resolved transitively by {@link longhandsOf}, so `border` need
 * only name `border-width`/`border-style`/`border-color` and not all twelve leaves.
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

/** The leaf longhand properties a declared property actually sets. */
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

/** The specificity of one selector, as `[ids, classes, types]`. */
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

/** Orders two specificity tuples the way the cascade does. */
export function compareSpecificity(left, right) {
  for (let rank = 0; rank < 3; rank += 1) {
    if (left[rank] !== right[rank]) return left[rank] - right[rank];
  }
  return 0;
}

/**
 * A specificity tuple in the `(0,2,1)` form the issue's prose and every comment in the sheet use.
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

/** Every class, type, id and attribute token any compound of a selector list requires. */
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

/** A selector in the one spelling two authored copies of it always share. */
export function normaliseSelector(selector) {
  return selector.trim().replaceAll(/\s+/gu, ' ').replaceAll(COMBINATOR_SPACING, ' $1 ');
}

/** A binary-search offset-to-line lookup over one text. */
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

/** The top-level declarations of one rule body. */
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

/** Every rule of a stylesheet with the parts the merge predicate arbitrates on. */
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
      listKey: `${atKey}\u{0}${selectors.join(', ')}`,
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

/** Every selector-list member of the sheet, tallied by where it appears. */
export function selectorAppearances(rules, { keyByAtContext = true } = {}) {
  const appearances = new Map();
  for (const rule of rules) {
    for (const selector of rule.selectors) {
      const key = keyByAtContext ? `${rule.atKey}\u{0}${selector}` : selector;
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

/** The rule pairs satisfying (a) and (b) — the only pairs a merge could ever act on. */
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

/** Walks the rules strictly between two positions and reports the first blocker, if any. */
function walkInterval({ rules, from, to, wanted, admits }) {
  const blockers = [];
  // An interval has no direction.
  const low = Math.min(from, to);
  const high = Math.max(from, to);
  for (let index = low + 1; index < high; index += 1) {
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

/** Criterion (c) for the census: the two endpoints have identical selector lists. */
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

function subjectMatches(selector, element) {
  const classes = compoundClasses(subjectOf(selector));
  if (classes.length === 0) return true;
  return classes.every((name) => element.classes.includes(name));
}

/** Whether any one member of a rule both sits in the band and can style the adopting element. */
function scopedAdmits(rule, band, element) {
  return rule.selectors.some(
    (selector) => withinBand(specificityOf(selector), band) && subjectMatches(selector, element)
  );
}

/** Criterion 5's blocker walk: a utility adopted by a donor rule far away in the sheet. */
export function scopedBlockerWalk({ rules, from, to, declarations, band, element }) {
  const wanted = declaredLonghands(declarations);
  return walkInterval({
    rules,
    from,
    to,
    wanted,
    admits: (rule) => scopedAdmits(rule, band, element),
  });
}

function mergedDeclarations(first, second) {
  const restated = new Set(second.declarations.flatMap(({ property }) => longhandsOf(property)));
  const kept = first.declarations.filter(({ property }) =>
    longhandsOf(property).some((longhand) => !restated.has(longhand))
  );
  return [...kept, ...second.declarations];
}

/** Whether two rules merge, and if not, what stops them. */
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

/** Every at-rule block of a stylesheet, with the depth it sits at. */
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

/** The census as the report issue 1501 publishes. */
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
