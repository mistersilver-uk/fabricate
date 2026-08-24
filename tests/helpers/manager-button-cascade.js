/*
 * The cascade instrument for the `manager-button` → `ManagerButton` conversion (issue 1118).
 *
 * ── WHY IT EXISTS ────────────────────────────────────────────────────────────────────────
 * Converting a hand-written manager button adds a SECOND class, `fab-manager-button`, and
 * `styles/fabricate.css` declares `.fabricate-manager .manager-button.fab-manager-button` at
 * specificity (0,3,0). Every rule a converted button already matched is therefore
 * re-arbitrated, and a rule that wins today only because it sits LATER in the sheet loses
 * silently the moment the sweep is licensed to move declarations around.
 *
 * Three rounds of plan review each enumerated that hazard by hand and each round found a band
 * the previous had missed — bespoke classes at (0,2,0), then ancestor-context rules at (0,3,0)
 * that tie and lose on source order, then thirteen more selectors at that same level plus one
 * inside a container everybody had certified as safe. Hand enumeration is the defect. This
 * module derives the set BY CONSTRUCTION instead: it parses every rule in the global sheet and
 * every rule in every compiled scoped component sheet, scores specificity, resolves each rule
 * against the real call sites found in the real markup, and reports what it cannot see rather
 * than guessing.
 *
 * ── WHAT "AT RISK" MEANS HERE ────────────────────────────────────────────────────────────
 * A rule is at risk when it BOTH ties with or loses to the primitive's rule on specificity AND
 * declares at least one property the primitive's rule also declares. A tie counts even when the
 * rule currently wins on source order: the conversion sweep rewrites this sheet, so anything
 * whose appearance depends on source order is a latent repaint, not a safe one. A rule that
 * declares only properties the primitive never touches cannot be repainted and is not at risk.
 *
 * Paint counts as much as geometry. `.manager-button.is-dashed` and
 * `.manager-button.is-warning-action` declare colour and no geometry at all, so a
 * geometry-only report would miss them entirely.
 *
 * ── WHAT IT CANNOT SEE ───────────────────────────────────────────────────────────────────
 * Named, not hidden. `blindSpots()` returns the list at runtime and the inventory prints it.
 * The headline ones: an ancestor supplied by a CALLER component cannot be resolved statically,
 * so those sites are reported as `unresolved` with the candidate providers named; the role
 * classes the conversion will ADD are not modelled, because role assignment is a per-site
 * design decision; and specificity here is COMPUTED, not measured — `manager-layout.test.js`
 * remains the real-browser gate.
 */
import { compile } from 'svelte/compiler';

import { collectWorkingTreeSources } from './sourceScan.js';

const GLOBAL_SHEET = 'styles/fabricate.css';
const PRIMITIVE_CLASS = 'fab-manager-button';
const CONTRACT_CLASS = 'manager-button';
const APP_ROOT_CLASS = 'fabricate-manager';
// `ArmedDangerButton` renders the same CSS contract but is a primitive in its own right and is
// explicitly out of the conversion's scope, so its site is enumerated and then held back.
const NON_CONVERTING_FILES = new Set(['src/ui/svelte/apps/manager/ArmedDangerButton.svelte']);
// `SearchablePopover` takes a class STRING and renders the button itself, so these sites never
// gain `fab-manager-button`. They are population B: enumerated, never converted.
const TRIGGER_ATTRIBUTE = 'triggerClass';

/* ────────────────────────────────────────────────────────────────────────────────────────
   Generic text scanning
   ──────────────────────────────────────────────────────────────────────────────────────── */

/** Replaces every CSS block comment with same-length whitespace so offsets survive. */
function blankComments(text) {
  let out = '';
  let cursor = 0;
  for (;;) {
    const start = text.indexOf('/*', cursor);
    if (start === -1) return out + text.slice(cursor);
    const closed = text.indexOf('*/', start + 2);
    const stop = closed === -1 ? text.length : closed + 2;
    out += text.slice(cursor, start) + text.slice(start, stop).replaceAll(/[^\n]/g, ' ');
    cursor = stop;
  }
}

/** Builds a 1-based line lookup over `text`. */
function lineIndexer(text) {
  const starts = [0];
  for (let i = 0; i < text.length; i += 1) if (text[i] === '\n') starts.push(i + 1);
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

const OPENERS = { '(': ')', '[': ']', '{': '}' };
const CLOSERS = [')', ']', '}'];
const QUOTES = ['"', "'", '`'];

/**
 * Splits `text` on `separator` at nesting depth zero, keeping each piece's offset.
 *
 * @param {string} text source
 * @param {string} separator single character
 * @returns {Array<{ start: number, text: string }>} pieces
 */
function splitTopLevel(text, separator) {
  const pieces = [];
  let depth = 0;
  let quote = '';
  let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    const character = text[i];
    if (quote) {
      if (character === quote) quote = '';
      continue;
    }
    if (QUOTES.includes(character)) quote = character;
    else if (OPENERS[character]) depth += 1;
    else if (CLOSERS.includes(character)) depth -= 1;
    else if (character === separator && depth === 0) {
      pieces.push({ start, text: text.slice(start, i) });
      start = i + 1;
    }
  }
  pieces.push({ start, text: text.slice(start) });
  return pieces;
}

/** Index of the `}` closing the block whose `{` sits at `open`. */
function matchingBrace(text, open) {
  let depth = 0;
  for (let i = open; i < text.length; i += 1) {
    if (text[i] === '{') depth += 1;
    else if (text[i] === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return text.length - 1;
}

/* ────────────────────────────────────────────────────────────────────────────────────────
   Stylesheet parsing
   ──────────────────────────────────────────────────────────────────────────────────────── */

function parseDeclarations(body) {
  const declarations = [];
  for (const piece of splitTopLevel(body, ';')) {
    const text = piece.text.trim();
    const colon = text.indexOf(':');
    if (colon < 1) continue;
    const property = text.slice(0, colon).trim().toLowerCase();
    if (!property || property.startsWith('--') || property.includes(' ')) continue;
    const raw = text.slice(colon + 1).trim();
    const important = /!\s*important$/i.test(raw);
    declarations.push({ property, value: raw.replace(/!\s*important$/i, '').trim(), important });
  }
  return declarations;
}

/**
 * Every style rule in one sheet, one entry PER SELECTOR in a comma group so each is scored
 * on its own — the whole point of the exercise, since a group can mix specificities.
 *
 * @param {string} text the sheet source
 * @param {string} origin a human-readable sheet identity
 * @returns {Array<object>} flat rule records in source order
 */
const KEYFRAMES_AT_RULE = /^@(-\w+-)?keyframes\b/;

/** The open at-rule blocks around the cursor, and whether any of them is a `@keyframes`. */
function atRuleStack() {
  const conditions = [];
  let keyframes = 0;
  return {
    enter(prelude) {
      conditions.push(prelude);
      if (KEYFRAMES_AT_RULE.test(prelude)) keyframes += 1;
    },
    leave() {
      const closed = conditions.pop() ?? '';
      if (KEYFRAMES_AT_RULE.test(closed)) keyframes -= 1;
    },
    condition: () => conditions.join(' '),
    // A `@keyframes` step (`0%`, `from`) is a position in an animation, not a selector.
    inKeyframes: () => keyframes > 0,
  };
}

/** Each selector in one comma group, with the source line it starts on. */
function selectorsIn(prelude, preludeStart, lineOf) {
  const selectors = [];
  for (const piece of splitTopLevel(prelude, ',')) {
    const selector = piece.text.trim();
    if (!selector) continue;
    const offset = preludeStart + piece.start + piece.text.indexOf(selector.slice(0, 1));
    selectors.push({ selector, line: lineOf(offset) });
  }
  return selectors;
}

function parseStyleSheet(text, origin) {
  const source = blankComments(text);
  const lineOf = lineIndexer(source);
  const rules = [];
  const atRules = atRuleStack();
  let cursor = 0;
  let preludeStart = 0;
  while (cursor < source.length) {
    const character = source[cursor];
    if (character !== '{' && character !== '}') {
      cursor += 1;
      continue;
    }
    const prelude = source.slice(preludeStart, cursor).trim();
    if (character === '}') atRules.leave();
    else if (prelude.startsWith('@')) atRules.enter(prelude.replaceAll(/\s+/g, ' '));
    if (character === '}' || prelude.startsWith('@')) {
      cursor += 1;
      preludeStart = cursor;
      continue;
    }
    const close = matchingBrace(source, cursor);
    if (!atRules.inKeyframes()) {
      const declarations = parseDeclarations(source.slice(cursor + 1, close));
      const condition = atRules.condition();
      for (const found of selectorsIn(source.slice(preludeStart, cursor), preludeStart, lineOf)) {
        rules.push({ origin, ...found, condition, declarations });
      }
    }
    cursor = close + 1;
    preludeStart = cursor;
  }
  return rules;
}

/* ────────────────────────────────────────────────────────────────────────────────────────
   Selector analysis
   ──────────────────────────────────────────────────────────────────────────────────────── */

const COMBINATORS = new Set(['>', '+', '~']);
// A sentinel that cannot occur in a selector, marking compound boundaries in place.
// Written as an ESCAPE rather than the character itself: a raw control byte in a tracked
// source file is the same hazard issue 1118 is already rewriting three raw NULs to avoid.
const BOUNDARY = '\u{1}';
const ZERO_SPECIFICITY_PSEUDOS = new Set(['where']);
const ARGUMENT_SPECIFICITY_PSEUDOS = new Set(['not', 'is', 'matches', 'any', 'has']);
const LEGACY_PSEUDO_ELEMENTS = new Set(['before', 'after', 'first-line', 'first-letter']);
const NAME_PATTERN = /^-?[A-Za-z_][\w-]*/;
const TAG_NAME_PATTERN = /^[A-Za-z_][\w:.$-]*/;

/** Splits a complex selector into compounds, recording the combinator that precedes each. */
function splitCompounds(selector) {
  let marked = '';
  let depth = 0;
  let quote = '';
  for (const character of selector) {
    if (quote) {
      marked += character;
      if (character === quote) quote = '';
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      marked += character;
      continue;
    }
    if (character === '(' || character === '[') depth += 1;
    else if (character === ')' || character === ']') depth -= 1;
    if (depth > 0 || character === ')' || character === ']') {
      marked += character;
      continue;
    }
    if (/\s/.test(character)) marked += BOUNDARY;
    else if (COMBINATORS.has(character)) marked += `${BOUNDARY}${character}${BOUNDARY}`;
    else marked += character;
  }
  const compounds = [];
  let pending = null;
  for (const piece of marked.split(BOUNDARY)) {
    if (!piece) continue;
    if (piece.length === 1 && COMBINATORS.has(piece)) {
      pending = piece;
      continue;
    }
    compounds.push({ combinator: compounds.length === 0 ? null : (pending ?? ' '), text: piece });
    pending = null;
  }
  return compounds;
}

function addSpecificity(target, addition) {
  for (let i = 0; i < 3; i += 1) target[i] += addition[i];
}

function readName(text, index) {
  return NAME_PATTERN.exec(text.slice(index))?.[0] ?? '';
}

function readTagName(text, index) {
  return TAG_NAME_PATTERN.exec(text.slice(index))?.[0] ?? '';
}

function closingIndex(text, open) {
  const close = OPENERS[text[open]];
  let depth = 0;
  for (let i = open; i < text.length; i += 1) {
    if (text[i] === text[open]) depth += 1;
    else if (text[i] === close) {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return text.length - 1;
}

/** The specificity of the most specific selector in a comma-separated argument list. */
function maxArgumentSpecificity(argumentList) {
  let best = [0, 0, 0];
  for (const piece of splitTopLevel(argumentList, ',')) {
    const candidate = specificityOf(piece.text.trim());
    if (compareSpecificity(candidate, best) > 0) best = candidate;
  }
  return best;
}

/**
 * The argument compounds of a functional pseudo-class, when every one of them is DECIDABLE
 * against markup — that is, constrains a tag or a class rather than a runtime state.
 *
 * `:not(:disabled)` is the reason this exists. Treating its argument as a compound to negate
 * would make `.a:not(:disabled)` match nothing, because a bare `:disabled` constrains nothing
 * and therefore "matches" every element. State belongs to the qualifier-subset logic instead.
 */
function decidableArguments(argument) {
  const parsed = [];
  for (const piece of splitTopLevel(argument, ',')) {
    const compounds = splitCompounds(piece.text.trim());
    if (compounds.length !== 1) return null;
    const analyzed = analyzeCompound(compounds[0].text);
    if (!analyzed.tag && analyzed.classes.length === 0) return null;
    parsed.push(analyzed);
  }
  return parsed.length > 0 ? parsed : null;
}

// `:root` and `:host` name the document root and the shadow host. Neither is ever a button, so
// a rule keyed on one is not a candidate however permissive the rest of its compound looks.
const IMPOSSIBLE_PSEUDOS = new Set(['root', 'host']);

function applyPseudo(compound, { name, argument, isElement }) {
  if (isElement || LEGACY_PSEUDO_ELEMENTS.has(name)) {
    compound.specificity[2] += 1;
    compound.pseudoElement = name;
    return;
  }
  if (ZERO_SPECIFICITY_PSEUDOS.has(name)) return;
  if (ARGUMENT_SPECIFICITY_PSEUDOS.has(name)) {
    addSpecificity(compound.specificity, maxArgumentSpecificity(argument));
    const decidable = decidableArguments(argument);
    if (decidable && name === 'not') compound.negations.push(...decidable);
    else if (decidable && name !== 'has') compound.alternatives.push(decidable);
    compound.qualifiers.push(`:${name}(${argument})`);
    return;
  }
  if (IMPOSSIBLE_PSEUDOS.has(name)) compound.impossible = true;
  compound.specificity[1] += 1;
  compound.qualifiers.push(argument ? `:${name}(${argument})` : `:${name}`);
}

/**
 * Reads the pseudo-class or pseudo-element starting at `index` into `compound`.
 *
 * @returns {number} the index just past it
 */
function readPseudoAt(compound, text, index) {
  const isElement = text[index + 1] === ':';
  const start = index + (isElement ? 2 : 1);
  const name = readName(text, start);
  let end = start + name.length;
  let argument = '';
  if (text[end] === '(') {
    const close = closingIndex(text, end);
    argument = text.slice(end + 1, close);
    end = close + 1;
  }
  applyPseudo(compound, { name, argument, isElement });
  return end;
}

/** Parses one compound selector into the parts matching and scoring both need. */
function analyzeCompound(text) {
  const compound = {
    text,
    tag: '',
    classes: [],
    negations: [],
    alternatives: [],
    attributes: [],
    qualifiers: [],
    pseudoElement: '',
    impossible: false,
    specificity: [0, 0, 0],
  };
  let index = 0;
  while (index < text.length) {
    const character = text[index];
    switch (character) {
      case '.':
      case '#': {
        const name = readName(text, index + 1);
        if (character === '.') compound.classes.push(name);
        compound.specificity[character === '.' ? 1 : 0] += 1;
        index += 1 + name.length;

        break;
      }
      case '[': {
        const close = closingIndex(text, index);
        compound.attributes.push(text.slice(index + 1, close));
        compound.specificity[1] += 1;
        index = close + 1;

        break;
      }
      case ':': {
        index = readPseudoAt(compound, text, index);

        break;
      }
      case '*': {
        index += 1;

        break;
      }
      default: {
        const name = readName(text, index);
        if (!name) {
          index += 1;
          continue;
        }
        compound.tag = name.toLowerCase();
        compound.specificity[2] += 1;
        index += name.length;
      }
    }
  }
  return compound;
}

function specificityOf(selector) {
  const total = [0, 0, 0];
  for (const { text } of splitCompounds(selector))
    addSpecificity(total, analyzeCompound(text).specificity);
  return total;
}

function compareSpecificity(left, right) {
  for (let i = 0; i < 3; i += 1) if (left[i] !== right[i]) return left[i] - right[i];
  return 0;
}

function formatSpecificity(specificity) {
  return `(${specificity.join(',')})`;
}

/**
 * Everything the arbitration needs about one selector: its score, its key (rightmost)
 * compound, and the ancestor compounds it demands above that key.
 *
 * @param {string} selector one selector, never a comma group
 * @returns {object} the analysis
 */
function analyzeSelector(selector) {
  const compounds = splitCompounds(selector).map((part) => ({
    combinator: part.combinator,
    ...analyzeCompound(part.text),
  }));
  const key = compounds.at(-1);
  const specificity = [0, 0, 0];
  for (const compound of compounds) addSpecificity(specificity, compound.specificity);
  const ancestors = compounds.slice(0, -1).map((compound, index) => ({
    compound,
    combinatorToNext: compounds[index + 1].combinator,
  }));
  // `.fabricate-manager` is the manager application root, asserted by the inventory's
  // non-vacuity floor rather than assumed silently. Dropping it here is what lets every other
  // ancestor requirement be a real question about the markup.
  const rooted = ancestors.length > 0 && ancestors[0].compound.classes.includes(APP_ROOT_CLASS);
  return {
    selector,
    specificity,
    key,
    rooted,
    rootAttributes: rooted ? ancestors[0].compound.attributes : [],
    ancestors: rooted ? ancestors.slice(1) : ancestors,
    unsupported: ancestors.some(
      ({ combinatorToNext }) => combinatorToNext === '+' || combinatorToNext === '~'
    ),
  };
}

/* ────────────────────────────────────────────────────────────────────────────────────────
   Declared-property overlap
   ──────────────────────────────────────────────────────────────────────────────────────── */

const SIDES = ['top', 'right', 'bottom', 'left'];
const CORNERS = ['top-left', 'top-right', 'bottom-right', 'bottom-left'];

function borderExpansions() {
  const entries = [
    [
      'border',
      SIDES.flatMap((side) => [
        `border-${side}-color`,
        `border-${side}-style`,
        `border-${side}-width`,
      ]),
    ],
    ['border-color', SIDES.map((side) => `border-${side}-color`)],
    ['border-style', SIDES.map((side) => `border-${side}-style`)],
    ['border-width', SIDES.map((side) => `border-${side}-width`)],
    ['border-radius', CORNERS.map((corner) => `border-${corner}-radius`)],
  ];
  for (const side of SIDES) {
    entries.push([
      `border-${side}`,
      [`border-${side}-color`, `border-${side}-style`, `border-${side}-width`],
    ]);
  }
  return entries;
}

const SHORTHAND_EXPANSIONS = new Map([
  ['padding', SIDES.map((side) => `padding-${side}`)],
  ['padding-inline', ['padding-left', 'padding-right']],
  ['padding-block', ['padding-top', 'padding-bottom']],
  ['background', ['background-color', 'background-image']],
  ['text-decoration', ['text-decoration-line', 'text-decoration-color', 'text-decoration-style']],
  ['gap', ['row-gap', 'column-gap']],
  ['font', ['font-size', 'font-weight']],
  ...borderExpansions(),
]);

// Geometry AND paint. A geometry-only report would miss `is-dashed` and `is-warning-action`,
// which declare colour and no geometry at all.
const REPORTED_PROPERTIES = new Set([
  'min-height',
  'height',
  'font-size',
  'font-weight',
  'color',
  'background-color',
  'background-image',
  'text-decoration-line',
  'row-gap',
  'column-gap',
  ...SIDES.map((side) => `padding-${side}`),
  ...SIDES.map((side) => `border-${side}-color`),
  ...SIDES.map((side) => `border-${side}-style`),
  ...CORNERS.map((corner) => `border-${corner}-radius`),
]);

function reportedFacets(declarations) {
  const facets = new Set();
  for (const { property } of declarations) {
    for (const facet of SHORTHAND_EXPANSIONS.get(property) ?? [property]) {
      if (REPORTED_PROPERTIES.has(facet)) facets.add(facet);
    }
  }
  return facets;
}

function reportedDeclarations(declarations) {
  return declarations.filter(({ property }) =>
    (SHORTHAND_EXPANSIONS.get(property) ?? [property]).some((facet) =>
      REPORTED_PROPERTIES.has(facet)
    )
  );
}

/* ────────────────────────────────────────────────────────────────────────────────────────
   Svelte template scanning
   ──────────────────────────────────────────────────────────────────────────────────────── */

const VOID_ELEMENTS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
  'svelte:options',
  'svelte:window',
  'svelte:document',
  'svelte:body',
]);

const BLOCK_OPEN = /^<(script|style)\b/i;

function blankRun(text) {
  return text.replaceAll(/[^\n]/g, ' ');
}

/**
 * Blanks HTML comments and `<script>` / `<style>` BODIES in one pass, so neither can be found
 * inside the other.
 *
 * The single pass is load-bearing, not tidiness. `ExplainerCard.svelte` names `<style>` inside
 * its docblock, and a two-pass mask that blanked style blocks first swallowed the component's
 * entire markup between that word and the real `</style>` — the component then reported ZERO
 * elements and its one call site vanished from the inventory silently.
 *
 * @param {string} source the `.svelte` source
 * @returns {string} the same text, same length and same line breaks, non-markup blanked
 */
function maskNonMarkup(source) {
  let out = '';
  let cursor = 0;
  while (cursor < source.length) {
    if (source.startsWith('<!--', cursor)) {
      const close = source.indexOf('-->', cursor + 4);
      const stop = close === -1 ? source.length : close + 3;
      out += blankRun(source.slice(cursor, stop));
      cursor = stop;
      continue;
    }
    const block = BLOCK_OPEN.exec(source.slice(cursor, cursor + 8));
    if (block) {
      const openEnd = source.indexOf('>', cursor);
      const close = source.toLowerCase().indexOf(`</${block[1].toLowerCase()}`, openEnd);
      const stop = close === -1 ? source.length : close;
      out += source.slice(cursor, openEnd + 1) + blankRun(source.slice(openEnd + 1, stop));
      cursor = stop;
      continue;
    }
    out += source[cursor];
    cursor += 1;
  }
  return out;
}

/** Index of the `>` ending the tag that starts at `open`, respecting quotes and `{…}`. */
function tagEnd(text, open) {
  let depth = 0;
  let quote = '';
  for (let i = open + 1; i < text.length; i += 1) {
    const character = text[i];
    if (quote) {
      if (character === quote) quote = '';
      continue;
    }
    switch (character) {
      case '"':
      case "'":
      case '`': {
        quote = character;
        break;
      }
      case '{': {
        depth += 1;
        break;
      }
      case '}': {
        depth -= 1;
        break;
      }
      default: {
        if (character === '>' && depth === 0) return i;
      }
    }
  }
  return text.length - 1;
}

const ATTRIBUTE_NAME = /([A-Za-z_@$][\w:.$-]*)\s*(=)?/y;

/**
 * One attribute value in its three written forms: quoted, a `{…}` expression, and bare.
 *
 * @param {string} raw the whole tag text
 * @param {number} start the index of the value's first character
 * @returns {{ value: string, next: number }} the value AS WRITTEN, delimiters included
 */
function readAttributeValue(raw, start) {
  if (raw[start] === '"' || raw[start] === "'") {
    const close = raw.indexOf(raw[start], start + 1);
    const end = close === -1 ? raw.length : close + 1;
    return { value: raw.slice(start, end), next: end };
  }
  if (raw[start] === '{') {
    const close = closingIndex(raw, start);
    return { value: raw.slice(start, close + 1), next: close + 1 };
  }
  const gap = raw.slice(start).search(/[\s/>]/);
  const end = gap === -1 ? raw.length : start + gap;
  return { value: raw.slice(start, end), next: end };
}

/** Every attribute on one raw tag string, with the offset of its name. */
function parseAttributes(raw) {
  const attributes = [];
  let index = raw.search(/\s/);
  if (index < 0) return attributes;
  while (index < raw.length) {
    if (/[\s/>]/.test(raw[index])) {
      index += 1;
      continue;
    }
    if (raw[index] === '{') {
      index = closingIndex(raw, index) + 1;
      continue;
    }
    ATTRIBUTE_NAME.lastIndex = index;
    const match = ATTRIBUTE_NAME.exec(raw);
    if (!match) {
      index += 1;
      continue;
    }
    const nameOffset = index;
    index = ATTRIBUTE_NAME.lastIndex;
    const read = match[2] ? readAttributeValue(raw, index) : { value: '', next: index };
    index = read.next;
    attributes.push({ name: match[1], value: read.value, nameOffset });
  }
  return attributes;
}

/**
 * The literal class tokens an attribute value contributes, plus whether it also carries
 * something dynamic this module cannot resolve.
 */
function classTokensOf(value) {
  if (!value) return { tokens: [], dynamic: false };
  const quoted = value.startsWith('"') || value.startsWith("'");
  const body = quoted ? value.slice(1, -1) : value;
  // A backtick template is the one dynamic form that still states real classes literally, and
  // the conversion has exactly one such site.
  const literals = quoted
    ? [body]
    : [...body.matchAll(/`([^`]*)`/g)].flatMap(([, inner]) => inner.split(/\$\{[^}]*\}/));
  const tokens = literals
    .join(' ')
    .replaceAll(/\{[^}]*\}/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  const dynamic = !quoted || /[{}]/.test(body);
  return { tokens, dynamic, expression: !quoted };
}

/**
 * Walks a component's markup and returns every element with its class tokens and its parent,
 * plus a balance flag. An unbalanced file has unreliable ancestry and says so.
 *
 * @param {string} source the `.svelte` source
 * @returns {{ elements: Array<object>, balanced: boolean }} the element tree
 */
function scanElements(source) {
  const markup = maskNonMarkup(source);
  const lineOf = lineIndexer(markup);
  const elements = [];
  const stack = [];
  let balanced = true;
  let cursor = 0;
  while (cursor < markup.length) {
    const open = markup.indexOf('<', cursor);
    if (open === -1) break;
    if (markup.startsWith('<!--', open)) {
      const close = markup.indexOf('-->', open);
      cursor = close === -1 ? markup.length : close + 3;
      continue;
    }
    if (markup.startsWith('</', open)) {
      const name = readTagName(markup, open + 2);
      const at = stack.findLastIndex((element) => element.tag === name);
      if (at === -1) balanced = false;
      else stack.length = at;
      cursor = markup.indexOf('>', open) + 1 || markup.length;
      continue;
    }
    const name = readTagName(markup, open + 1);
    if (!name) {
      cursor = open + 1;
      continue;
    }
    const end = tagEnd(markup, open);
    const raw = markup.slice(open, end + 1);
    const attributes = parseAttributes(raw);
    const classAttribute = attributes.find((attribute) => attribute.name === 'class');
    const element = {
      tag: name,
      start: open,
      line: lineOf(open),
      attributes,
      parent: stack.at(-1) ?? null,
      ...classTokensOf(classAttribute?.value),
      classAttribute,
      directives: attributes.filter(({ name: attributeName }) =>
        attributeName.startsWith('class:')
      ),
    };
    elements.push(element);
    if (!raw.endsWith('/>') && !VOID_ELEMENTS.has(name.toLowerCase())) stack.push(element);
    cursor = end + 1;
  }
  const snippetHosts = [...markup.matchAll(/\{@render\b/g)].map((match) => match.index);
  return { elements, snippetHosts, balanced: balanced && stack.length === 0 };
}

function ancestorChainOf(element) {
  const chain = [];
  for (let current = element.parent; current; current = current.parent) chain.unshift(current);
  return chain;
}

/* ────────────────────────────────────────────────────────────────────────────────────────
   Matching
   ──────────────────────────────────────────────────────────────────────────────────────── */

function attributeMatches(expression, element) {
  const name = /^[\w:.$-]+/.exec(expression)?.[0] ?? '';
  const attribute = element.attributes?.find((candidate) => candidate.name === name);
  if (!attribute) return false;
  const wanted = /=\s*["']?([^"'\]]*)/.exec(expression)?.[1];
  if (wanted === undefined) return true;
  return attribute.value.replaceAll(/^["']|["']$/g, '') === wanted;
}

const SCOPE_HASH = /^svelte-[a-z0-9]+$/;

/**
 * Whether one compound can match an element with the given class token set.
 *
 * Svelte's scoping hash is skipped rather than required. It is a REAL class on the rendered
 * element and it is counted in the specificity above, but the markup this module reads is the
 * author's, which never spells it — requiring it would make every scoped rule match nothing and
 * would hide the `.fab-bulk-edit-apply` band entirely.
 */
function compoundMatches(compound, element, classes = null) {
  const tokens = classes ?? new Set(element.tokens);
  if (compound.impossible) return false;
  if (compound.tag && compound.tag !== element.tag.toLowerCase()) return false;
  if (compound.classes.some((name) => !SCOPE_HASH.test(name) && !tokens.has(name))) return false;
  if (compound.negations.some((negated) => compoundMatches(negated, element, tokens))) return false;
  if (
    compound.alternatives.some((group) =>
      group.every((one) => !compoundMatches(one, element, tokens))
    )
  ) {
    return false;
  }
  return compound.attributes.every((expression) => attributeMatches(expression, element));
}

/**
 * Resolves a selector's ancestor demands against one site's real ancestry.
 *
 * @returns {{ satisfied: boolean, missing: object | null }} the outermost demand it could not place
 */
function ancestorsSatisfied(ancestors, chain) {
  let bound = chain.length;
  for (let index = ancestors.length - 1; index >= 0; index -= 1) {
    const { compound, combinatorToNext } = ancestors[index];
    if (combinatorToNext === '>') {
      bound -= 1;
      if (bound < 0 || !compoundMatches(compound, chain[bound]))
        return { satisfied: false, missing: ancestors[0] };
      continue;
    }
    let found = -1;
    for (let position = bound - 1; position >= 0; position -= 1) {
      if (compoundMatches(compound, chain[position])) {
        found = position;
        break;
      }
    }
    if (found < 0) return { satisfied: false, missing: ancestors[0] };
    bound = found;
  }
  return { satisfied: true, missing: null };
}

/* ────────────────────────────────────────────────────────────────────────────────────────
   Corpus assembly
   ──────────────────────────────────────────────────────────────────────────────────────── */

/**
 * The whole corpus in ONE walk of the working tree: every component and the global sheet.
 *
 * `collectWorkingTreeSources` is the repo's single source of truth for "the repository's source
 * files", and `sourceScan.js` records at length why — listing with `git ls-files` and reading with
 * `readFileSync` asks two questions and treats the answers as one. Reading the corpus once here
 * also means the sheet, the markup and the scoped CSS all come from the same instant, which
 * matters for an instrument whose entire output is a relation between them.
 *
 * @returns {{ files: Array<string>, sources: Record<string, string>, sheet: string }} the corpus
 */
function readCorpus() {
  const sources = collectWorkingTreeSources(['src', 'styles'], ['.svelte', '.css']);
  const sheet = sources[GLOBAL_SHEET];
  if (!sheet) throw new Error(`${GLOBAL_SHEET} is missing — the instrument has nothing to measure`);
  return { files: Object.keys(sources).filter((path) => path.endsWith('.svelte')), sources, sheet };
}

/**
 * The call sites, by population.
 *
 * A — literal `class="manager-button…"`; C — the one backtick-template `class={…}`; both
 * convert. B — `triggerClass="manager-button…"`, which `SearchablePopover` renders itself and
 * which therefore never gains `fab-manager-button`.
 */
function decidePopulation({ triggersContract, element }) {
  if (triggersContract) return 'B';
  return element.expression ? 'C' : 'A';
}

/**
 * Every component's element tree, its rendered-component import map, and its snippet slots.
 *
 * @param {Array<string>} files every tracked component path
 * @param {Record<string, string>} sources the corpus text, keyed by repo-relative path
 * @returns {{ trees: Map<string, object>, unbalanced: Array<string> }} the scanned corpus
 */
function componentTrees(files, sources) {
  const trees = new Map();
  const unbalanced = [];
  for (const file of files) {
    const source = sources[file];
    const tree = scanElements(source);
    trees.set(file, {
      ...tree,
      lineOf: lineIndexer(source),
      imports: renderedImports(source, file, files),
    });
    if (!tree.balanced) unbalanced.push(file);
  }
  return { trees, unbalanced };
}

function collectSites(trees) {
  const sites = [];
  for (const [file, tree] of trees) {
    for (const element of tree.elements) {
      const trigger = element.attributes.find((attribute) => attribute.name === TRIGGER_ATTRIBUTE);
      const triggerTokens = classTokensOf(trigger?.value);
      const ownsContract = element.tokens.includes(CONTRACT_CLASS);
      const triggersContract = triggerTokens.tokens.includes(CONTRACT_CLASS);
      if (!ownsContract && !triggersContract) continue;
      const attribute = ownsContract ? element.classAttribute : trigger;
      const tokens = ownsContract ? element.tokens : triggerTokens.tokens;
      const population = decidePopulation({ triggersContract, element });
      const line = tree.lineOf(element.start + attribute.nameOffset);
      sites.push({
        id: `${file}:${line}`,
        file,
        line,
        tag: ownsContract ? element.tag : 'button',
        tokens,
        classes: new Set([...tokens, ...(population === 'B' ? [] : [PRIMITIVE_CLASS])]),
        dynamic: ownsContract ? element.dynamic : triggerTokens.dynamic,
        directives: element.directives.map(({ name }) => name),
        population,
        converting: population !== 'B' && !NON_CONVERTING_FILES.has(file),
        // A population-B trigger is rendered by `SearchablePopover`, not written here, so it
        // has no element of its own. Standing it as a synthetic child of the `<SearchablePopover>`
        // tag gives it the caller's real ancestry, which is what every container rule asks
        // about; the popover's own wrapper elements are the one link this cannot supply.
        element: ownsContract ? element : { tag: 'button', attributes: [], parent: element },
      });
    }
  }
  return sites;
}

/**
 * `local name → component file` for every `.svelte` a component imports AND renders.
 *
 * @param {string} source component source
 * @param {string} file the importing component's repo-relative path
 * @param {Array<string>} files every tracked component path
 * @returns {Map<string, string>} the local-name map
 */
function renderedImports(source, file, files) {
  const imports = new Map();
  for (const [, local, specifier] of source.matchAll(
    /import\s+(\w+)\s+from\s+'([^']+\.svelte)'/g
  )) {
    if (!new RegExp(String.raw`<${local}[\s/>]`).test(source)) continue;
    const target = new URL(specifier, `file:///${file}`).pathname.replace(/^\/+/, '');
    if (files.includes(target)) imports.set(local, target);
  }
  return imports;
}

function reachableFrom(graph, start) {
  const seen = new Set();
  const queue = [start];
  while (queue.length > 0) {
    for (const next of graph.get(queue.pop()) ?? []) {
      if (seen.has(next)) continue;
      seen.add(next);
      queue.push(next);
    }
  }
  return seen;
}

function isDescendant(element, ancestor) {
  for (let current = element.parent; current; current = current.parent)
    if (current === ancestor) return true;
  return false;
}

/**
 * Answers "could a CALLER, or a callee's snippet slot, supply this ancestor to that file?"
 *
 * The subtree restriction is what makes the answer worth having. Without it every component
 * reachable from `CraftingSystemManagerRoot` counts as sitting under `.manager-breadcrumbs`,
 * and the report drowns in eighty-odd false candidates per container class. With it, only a
 * component actually rendered INSIDE the matching element counts — which is exactly how
 * `ComponentEditorHeader`'s two buttons stay in the `.manager-header-actions` finding while
 * the breadcrumb noise disappears.
 *
 * @param {object} context the component trees, the render graph and its reachability closure
 * @returns {(compound: object, file: string) => Array<string>} a memoized provider lookup
 */
function ancestorProvenance({ files, trees, reach }) {
  const cache = new Map();
  const hostedInside = (host, element) => {
    const tree = trees.get(host);
    const hosted = new Set();
    for (const candidate of tree.elements) {
      if (!isDescendant(candidate, element)) continue;
      const target = tree.imports.get(candidate.tag);
      if (target) hosted.add(target);
    }
    const subtreeEnd = endOf(tree, element);
    const slotted = tree.snippetHosts.some(
      (offset) => offset > element.start && offset < subtreeEnd
    );
    return { hosted, slotted };
  };
  return (compound, file, restrictTo) => {
    const key = `${compound.text}\u{0}${file}\u{0}${restrictTo ?? ''}`;
    if (cache.has(key)) return cache.get(key);
    const providers = [];
    for (const host of restrictTo ? [restrictTo] : files) {
      const tree = trees.get(host);
      for (const element of tree.elements) {
        if (!compoundMatches(compound, element)) continue;
        const { hosted, slotted } = hostedInside(host, element);
        const viaCaller = [...hosted].some(
          (target) => target === file || reach.get(target).has(file)
        );
        // The mirror case: the ancestor lives in a component the site's own file RENDERS, and
        // the site arrives through that component's `{@render children()}` slot.
        const viaSnippet = slotted && (host === file || reach.get(file).has(host));
        if (viaCaller || viaSnippet) {
          providers.push(`${host}:${element.line}`);
          break;
        }
      }
    }
    cache.set(key, providers);
    return providers;
  };
}

/** The offset just past an element's subtree, taken from the next non-descendant element. */
function endOf(tree, element) {
  const next = tree.elements.find(
    (candidate) => candidate.start > element.start && !isDescendant(candidate, element)
  );
  return next ? next.start : Number.MAX_SAFE_INTEGER;
}

function scopedSheets(files, sources) {
  const sheets = [];
  for (const file of files) {
    const source = sources[file];
    if (!/<style[\s>]/.test(source)) continue;
    const { css } = compile(source, { filename: file, css: 'external' });
    if (!css?.code) continue;
    sheets.push({ file, code: css.code });
  }
  return sheets;
}

/** Strips Svelte's scoping hash so a rule's identity survives a recompile. */
function stripScopeHash(selector) {
  return selector
    .replaceAll(/\.svelte-[a-z0-9]+/g, '')
    .replaceAll(/\s+/g, ' ')
    .trim();
}

/* ────────────────────────────────────────────────────────────────────────────────────────
   The instrument
   ──────────────────────────────────────────────────────────────────────────────────────── */

function buildRules(files, sources, sheet) {
  const global = parseStyleSheet(sheet, GLOBAL_SHEET).map((rule) => ({
    ...rule,
    scopedTo: null,
    id: `${GLOBAL_SHEET}#${rule.selector}`,
  }));
  const scoped = scopedSheets(files, sources).flatMap(({ file, code }) =>
    parseStyleSheet(code, `${file} (scoped)`).map((rule) => ({
      ...rule,
      scopedTo: file,
      selector: rule.selector,
      id: `${file}#${stripScopeHash(rule.selector)}`,
    }))
  );
  // Scoped CSS is injected into `document.head` AFTER the global sheet's `<link>`
  // (`svelte.config.js` uses `css: 'injected'`), so every scoped rule outranks a global tie.
  return [...global, ...scoped].map((rule, order) => ({
    ...rule,
    order,
    analysis: analyzeSelector(rule.selector),
  }));
}

/**
 * Where one rule stands against one call site.
 *
 * A scoped rule whose KEY compound carries the hash can only ever reach its own component. A
 * scoped rule whose key does NOT — a `:global(…)` key, which Svelte emits unhashed with the
 * hash left on the ancestor — escapes into descendant components, so it is resolved like any
 * other ancestor demand but anchored to the component that declared it.
 */
function siteMatch(rule, site, graph) {
  const { analysis } = rule;
  if (
    !compoundMatches(analysis.key, site.element ?? { tag: site.tag, attributes: [] }, site.classes)
  )
    return null;
  const keyIsScoped = analysis.key.classes.some((name) => SCOPE_HASH.test(name));
  if (rule.scopedTo && keyIsScoped && rule.scopedTo !== site.file) return null;
  if (analysis.ancestors.length === 0) return { state: 'confirmed', missing: null, providers: [] };
  const sameComponent = !rule.scopedTo || rule.scopedTo === site.file;
  if (site.element && sameComponent) {
    const { satisfied, missing } = ancestorsSatisfied(
      analysis.ancestors,
      ancestorChainOf(site.element)
    );
    if (satisfied) return { state: 'confirmed', missing: null, providers: [] };
    const providers = graph.providersFor(missing.compound, site.file, null);
    return { state: providers.length === 0 ? 'impossible' : 'unresolved', missing, providers };
  }
  const missing = analysis.ancestors[0];
  const providers = graph.providersFor(missing.compound, site.file, rule.scopedTo);
  return { state: providers.length === 0 ? 'impossible' : 'unresolved', missing, providers };
}

function primitiveCompetitors(rules) {
  return rules.filter((rule) => rule.analysis.key.classes.includes(PRIMITIVE_CLASS));
}

function qualifiersCovered(primitive, candidate) {
  return primitive.analysis.key.qualifiers.every((qualifier) =>
    candidate.analysis.key.qualifiers.includes(qualifier)
  );
}

/** How the arbitration reads to a person, and whether it already bites or only could. */
function verdictFor(order, primitive, candidate) {
  if (order > 0) return 'loses outright';
  if (primitive.order > candidate.order) return 'ties and loses on source order';
  return 'ties and wins on source order only';
}

function arbitrate(candidate, primitive) {
  const order = compareSpecificity(primitive.analysis.specificity, candidate.analysis.specificity);
  if (order < 0) return null;
  const overlap = [...reportedFacets(candidate.declarations)].filter((facet) =>
    reportedFacets(primitive.declarations).has(facet)
  );
  if (overlap.length === 0) return null;
  return {
    primitive,
    overlap: overlap.sort(byCodePoint),
    verdict: verdictFor(order, primitive, candidate),
  };
}

/**
 * The resting-state rules whose winner a reader can trust: unconditional, unqualified, and
 * confirmed on this site's real ancestry.
 */
function restingRules(matches) {
  return matches
    .filter(({ state }) => state === 'confirmed')
    .map(({ rule }) => rule)
    .filter(
      (rule) =>
        !rule.condition &&
        rule.analysis.key.qualifiers.length === 0 &&
        !rule.analysis.key.pseudoElement
    );
}

function declarationFor(rule, facet) {
  return rule.declarations.findLast(({ property }) =>
    (SHORTHAND_EXPANSIONS.get(property) ?? [property]).includes(facet)
  );
}

function winnerFor(rules, facet) {
  let winner = null;
  for (const rule of rules) {
    const declaration = declarationFor(rule, facet);
    if (!declaration) continue;
    if (!winner) {
      winner = { rule, declaration };
      continue;
    }
    const previous = winner.declaration.important;
    if (declaration.important !== previous) {
      if (declaration.important) winner = { rule, declaration };
      continue;
    }
    const order = compareSpecificity(rule.analysis.specificity, winner.rule.analysis.specificity);
    if (order > 0 || (order === 0 && rule.order > winner.rule.order))
      winner = { rule, declaration };
  }
  return winner;
}

function describeWinner(winner) {
  if (!winner) return 'not declared (inherited or initial)';
  return `${winner.rule.origin}:${winner.rule.line} ${stripScopeHash(winner.rule.selector)} { ${winner.declaration.property}: ${winner.declaration.value} }`;
}

/**
 * The resting-state winner CHANGE the conversion produces at one site, per declared facet.
 *
 * This is the half a specificity table cannot give you. A rule can tie the primitive and still
 * repaint nothing, because the two declare the same value; and a rule can be nowhere near the
 * primitive's specificity and still be the site's current winner for a property the primitive
 * newly pins — which is precisely how nine unclassed clear-filters buttons move from an
 * inherited font size to a fixed one without any rule "losing" anything.
 */
function repaintsAt(site, matches, primitives, matchOf) {
  const before = restingRules(matches);
  const after = [
    ...before,
    ...primitives.filter((primitive) => matchOf(primitive, site)?.state === 'confirmed'),
  ].filter((rule) => !rule.condition && rule.analysis.key.qualifiers.length === 0);
  const changes = [];
  for (const facet of REPORTED_PROPERTIES) {
    const from = winnerFor(before, facet);
    const to = winnerFor(after, facet);
    if (from?.rule === to?.rule) continue;
    const identical =
      Boolean(from) &&
      Boolean(to) &&
      from.declaration.property === to.declaration.property &&
      from.declaration.value === to.declaration.value;
    changes.push({ facet, from, to, identical });
  }
  return changes;
}

/**
 * Builds the whole inventory.
 *
 * @returns {object} the instrument's findings and its report renderer
 */
export function managerButtonCascade() {
  const { files, sources, sheet } = readCorpus();
  const { trees, unbalanced } = componentTrees(files, sources);
  const rendered = new Map(files.map((file) => [file, new Set(trees.get(file).imports.values())]));
  const reach = new Map(files.map((file) => [file, reachableFrom(rendered, file)]));
  const providersFor = ancestorProvenance({ files, trees, reach });
  const graph = { providersFor };

  const sites = collectSites(trees);
  const rules = buildRules(files, sources, sheet);
  const primitives = primitiveCompetitors(rules);
  const convertingSites = sites.filter((site) => site.converting);
  const matchCache = new Map();
  const matchOf = (rule, site) => {
    const key = `${rule.order}\u{0}${site.id}`;
    if (!matchCache.has(key)) matchCache.set(key, siteMatch(rule, site, graph));
    return matchCache.get(key);
  };

  const candidates = [];
  const bySite = new Map(sites.map((site) => [site.id, []]));
  for (const rule of rules) {
    if (rule.analysis.key.classes.includes(PRIMITIVE_CLASS)) continue;
    if (rule.analysis.key.pseudoElement) continue;
    const matches = [];
    for (const site of sites) {
      const match = matchOf(rule, site);
      if (!match || match.state === 'impossible') continue;
      matches.push({ site, rule, ...match });
      bySite.get(site.id).push({ site, rule, ...match });
    }
    if (matches.length === 0) continue;
    candidates.push({
      rule,
      matches,
      losses: lossesFor(rule, matches, primitives, matchOf),
      // Site-independent: would this rule lose to the primitive IF a converted button ever
      // matched it? That is the question an exclusion has to answer, because an excluded rule
      // is precisely one that would be at risk but has no converting site to be at risk for.
      wouldLose: primitives.some(
        (primitive) => qualifiersCovered(primitive, rule) && arbitrate(rule, primitive)
      ),
    });
  }

  const atRisk = candidates.filter((candidate) => candidate.losses.length > 0);
  const excluded = candidates.filter(
    (candidate) =>
      candidate.losses.length === 0 &&
      candidate.wouldLose &&
      candidate.matches.every((match) => !match.site.converting)
  );
  const repaints = convertingSites.flatMap((site) =>
    repaintsAt(site, bySite.get(site.id), primitives, matchOf).map((change) => ({
      site,
      ...change,
    }))
  );
  const blindSpots = describeBlindSpots({ sites, unbalanced, atRisk });
  const state = {
    sites,
    convertingSites,
    rules,
    primitives,
    candidates,
    atRisk,
    excluded,
    repaints,
    blindSpots,
  };
  return {
    ...state,
    ruleFor: (id) => rules.find((rule) => rule.id === id),
    candidateFor: (id) => candidates.find((candidate) => candidate.rule.id === id),
    renderInventory: (dispositions = new Map()) => renderInventory(state, dispositions),
  };
}

function lossesFor(rule, matches, primitives, matchOf) {
  const losses = new Map();
  for (const match of matches) {
    if (!match.site.converting) continue;
    for (const primitive of primitives) {
      if (!qualifiersCovered(primitive, rule)) continue;
      const applies = matchOf(primitive, match.site);
      if (!applies || applies.state === 'impossible') continue;
      const loss = arbitrate(rule, primitive);
      if (!loss) continue;
      const existing = losses.get(primitive.id);
      if (existing) existing.sites.push(match);
      else losses.set(primitive.id, { ...loss, sites: [match] });
    }
  }
  return [...losses.values()];
}

/* ────────────────────────────────────────────────────────────────────────────────────────
   Reporting
   ──────────────────────────────────────────────────────────────────────────────────────── */

function describeBlindSpots({ sites, unbalanced, atRisk }) {
  const dynamic = sites.filter((site) => site.dynamic || site.directives.length > 0);
  const multiCompound = atRisk.filter(({ rule }) => rule.analysis.ancestors.length > 1).length;
  const unresolved = atRisk.flatMap(({ rule, losses }) =>
    losses
      .flatMap(({ sites: matched }) => matched)
      .filter((match) => match.state === 'unresolved')
      .map((match) => `${rule.id} @ ${match.site.id} (needs ${match.missing.compound.text})`)
  );
  return [
    'Role classes the conversion ADDS are not modelled. Each site is scored on the classes it ' +
      'carries today plus `fab-manager-button`, because the role a role-less site receives is a ' +
      'per-site design decision, not a fact in the tree. A site given `is-primary` or `is-ghost` ' +
      'gains the primitive companion at (0,4,0) and may pull in further rules.',
    'An ancestor supplied by a CALLER component cannot be resolved statically. Those sites are ' +
      `reported as \`unresolved\` with the candidate providers named; there are ${unresolved.length} ` +
      'such pairings in the at-risk set.',
    `Class attributes with a dynamic fragment (${dynamic.length} sites) may carry tokens this ` +
      'module cannot see; their literal tokens are read and the site is marked `dynamic`.',
    'Injection order BETWEEN two scoped component sheets is mount order, not source order. A tie ' +
      'between two scoped rules from different components is not arbitrated here.',
    'Specificity is COMPUTED, not measured. `manager-layout.test.js` remains the real-browser ' +
      'gate; this module tells it where to look.',
    'Custom-property indirection is NOT resolved, so a reported value change can still compute ' +
      'identically. `--fab-mv2-border` is declared as `var(--fab-border)` and ' +
      '`--fab-mv2-text-muted` as `var(--fab-text-muted)`, so a winner change between those two ' +
      'spellings is a zero-pixel change that this report nevertheless prints as a change.',
    '`@media` and `@container` rules are scored like any other and carry their condition in the ' +
      'report, but whether the condition holds at a given viewport is not evaluated.',
    unbalanced.length === 0
      ? "Every scanned component's markup balanced, so its ancestry is reliable."
      : `Unbalanced markup in ${unbalanced.length} component(s), whose ancestry is unreliable: ${unbalanced.join(', ')}.`,
    'Descendant-combinator ancestry is matched innermost-first without backtracking, which can ' +
      `differ from a full backtracking match only for a multi-compound demand; ${multiCompound} ` +
      'of the at-risk rules make one.',
  ];
}

function formatDeclarations(declarations) {
  return reportedDeclarations(declarations)
    .map(
      ({ property, value, important }) => `${property}: ${value}${important ? ' !important' : ''}`
    )
    .join('; ');
}

function siteLabel(match) {
  const flags = [
    match.state === 'unresolved' ? `unresolved: needs ${match.missing.compound.text}` : '',
    match.site.dynamic ? 'dynamic class' : '',
  ]
    .filter(Boolean)
    .join(', ');
  return flags ? `${match.site.id} [${flags}]` : match.site.id;
}

function renderAtRiskEntry({ rule, losses }, disposition) {
  const lines = [
    `${rule.origin}:${rule.line}  ${stripScopeHash(rule.selector)}`,
    `    specificity ${formatSpecificity(rule.analysis.specificity)}${rule.condition ? ` under ${rule.condition}` : ''}`,
    `    declares ${formatDeclarations(rule.declarations)}`,
    `    disposition ${disposition}`,
  ];
  for (const loss of losses) {
    const matched = loss.sites;
    const confirmed = matched.filter((match) => match.state === 'confirmed');
    const unresolved = matched.filter((match) => match.state === 'unresolved');
    lines.push(
      `    vs ${loss.primitive.origin}:${loss.primitive.line} ${stripScopeHash(loss.primitive.selector)} ` +
        `${formatSpecificity(loss.primitive.analysis.specificity)} — ${loss.verdict}; overlaps ${loss.overlap.join(', ')}`,
      `      confirmed sites (${confirmed.length}): ${confirmed.map(siteLabel).join(', ') || 'none'}`
    );
    if (unresolved.length > 0) {
      lines.push(
        `      unresolved sites (${unresolved.length}): ${unresolved.map(siteLabel).join(', ')}`
      );
      for (const match of unresolved) {
        lines.push(
          `        providers for ${match.site.id}: ${match.providers.join(', ') || 'none found'}`
        );
      }
    }
  }
  return lines.join('\n');
}

/**
 * Deterministic report order. Code point, not `localeCompare`: the latter is locale-dependent, so
 * one corpus could print in two orders on two machines and every diff would carry that noise. The
 * same choice, for the same reason, as `byPath` in `sourceScan.js`.
 */
function byCodePoint(left, right) {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function bySource(left, right) {
  return byCodePoint(left.rule.origin, right.rule.origin) || left.rule.line - right.rule.line;
}

/**
 * The measured repaints, grouped so one mechanism reads as one line rather than 129.
 *
 * @param {Array<object>} repaints per-site winner changes
 * @returns {Array<string>} report lines
 */
function renderRepaints(repaints) {
  const groups = new Map();
  for (const change of repaints) {
    const key = `${change.facet}\u{0}${describeWinner(change.from)}\u{0}${describeWinner(change.to)}`;
    if (!groups.has(key)) groups.set(key, { ...change, sites: [] });
    groups.get(key).sites.push(change.site.id);
  }
  return [...groups.values()]
    .sort(
      (left, right) =>
        right.sites.length - left.sites.length || byCodePoint(left.facet, right.facet)
    )
    .flatMap((group) => [
      `${group.facet}: ${group.sites.length} site(s)${group.identical ? ' — SAME VALUE, no visible change' : ''}`,
      `    from ${describeWinner(group.from)}`,
      `      to ${describeWinner(group.to)}`,
      `    sites: ${group.sites.join(', ')}`,
    ]);
}

function renderInventory(
  { sites, convertingSites, rules, primitives, candidates, atRisk, excluded, repaints, blindSpots },
  dispositions
) {
  const populations = ['A', 'B', 'C'].map(
    (population) => `${population}=${sites.filter((site) => site.population === population).length}`
  );
  const safe = candidates.filter(
    (candidate) => candidate.losses.length === 0 && !excluded.includes(candidate)
  );
  const lines = [
    '',
    '════ manager-button cascade inventory (issue 1118) ════',
    'a `(scoped)` origin line number is the line in the COMPILED component sheet, not the .svelte',
    `rules parsed: ${rules.length} (global sheet + every compiled scoped component sheet)`,
    `primitive rules (key compound requires .${PRIMITIVE_CLASS}): ${primitives.length}`,
    `call sites: ${sites.length} (${populations.join(' ')}), converting ${convertingSites.length} ` +
      `across ${new Set(convertingSites.map((site) => site.file)).size} components`,
    `rules matching at least one call site: ${candidates.length}; AT RISK: ${atRisk.length}`,
    `resting-state winner changes across the converting sites: ${repaints.length} ` +
      `(${repaints.filter((change) => change.identical).length} of them declare the same value)`,
    '',
    '──── AT RISK — ties with or loses to the primitive AND shares a declared property ────',
  ];
  for (const entry of [...atRisk].sort(bySource)) {
    lines.push(renderAtRiskEntry(entry, dispositions.get(entry.rule.id) ?? 'UNREVIEWED'));
  }
  lines.push(
    '',
    '──── WOULD BE AT RISK, BUT NO CONVERTING SITE MATCHES — do NOT re-chain these ────'
  );
  for (const entry of [...excluded].sort(bySource)) {
    lines.push(
      `${entry.rule.origin}:${entry.rule.line}  ${stripScopeHash(entry.rule.selector)} ` +
        `${formatSpecificity(entry.rule.analysis.specificity)} — ` +
        `${dispositions.get(entry.rule.id) ?? 'UNREVIEWED'}; ` +
        `${entry.matches.length} non-converting site(s): ` +
        entry.matches.map((match) => match.site.id).join(', ')
    );
  }
  lines.push(
    '',
    '──── MATCHED, NOT AT RISK — beats the primitive, or shares no declared property ────'
  );
  for (const entry of [...safe].sort(bySource)) {
    const converting = entry.matches.filter((match) => match.site.converting).length;
    lines.push(
      `${entry.rule.origin}:${entry.rule.line}  ${stripScopeHash(entry.rule.selector)} ` +
        `${formatSpecificity(entry.rule.analysis.specificity)} — ${converting} converting / ` +
        `${entry.matches.length - converting} non-converting site(s)`
    );
  }
  lines.push(
    '',
    '──── MEASURED REPAINTS — resting-state winner changes, grouped by mechanism ────',
    ...renderRepaints(repaints),
    '',
    '──── WHAT THIS INSTRUMENT CANNOT SEE ────'
  );
  for (const [index, spot] of blindSpots.entries()) lines.push(`${index + 1}. ${spot}`);
  lines.push('');
  return lines.join('\n');
}
