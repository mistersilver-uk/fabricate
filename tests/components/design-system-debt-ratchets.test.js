/**
 * The design-system debt gates: each measures its corpus at the base commit and in the working
 * tree, and fails on an offender that appeared or grew, unless a
 * `ratchet-exempt(design-system): <reason>` marker sits at the site.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { bandCorner } from '../../scripts/lib/radiusLadder.js';
import { compoundClasses, compoundsOf } from '../../scripts/lib/stylesheetLiveClasses.js';
import { censusRules, selectorAppearances } from '../../scripts/lib/stylesheetSelectorCensus.js';
import { byCodePoint } from '../helpers/codePointOrder.js';
import {
  DESIGN_SYSTEM_FAMILY,
  MODULE_CORPUS,
  STYLE_CORPUS,
  TEMPLATE_CORPUS,
  assertFloor,
  assertGateCases,
  checkGate,
  emptyMarkerFailure,
  exemptAt,
  gateOver,
  nativeSelectSites,
  styleCorpusOf,
  templatesOf,
  workingTree,
} from '../helpers/designSystemRatchet.js';
import { installFoundryBridgeEnv } from '../helpers/foundryBridgeEnv.js';
import { siteMarker } from '../helpers/mergeBaseRatchet.js';
import { collectWorkingTreeSources, stripComments } from '../helpers/sourceScan.js';
import {
  declarationsIn,
  resolveValueCandidates,
  splitSelectorList,
} from '../helpers/styleBlockScan.js';
import { attributeText, lineOf, walkElements } from '../helpers/svelteTemplateScan.js';

/* ─────────────────────────────── the shared corpus ─────────────────────────────── */

/** The working tree's style corpus, which every clause that is not a comparison reads. */
function treeStyles() {
  const tree = workingTree(STYLE_CORPUS);
  return styleCorpusOf(tree.readFile, tree.listFiles());
}

/** The working tree's UI templates, parsed once. */
function treeTemplates() {
  const tree = workingTree(TEMPLATE_CORPUS);
  return templatesOf(tree.readFile, tree.listFiles());
}

/** Declarations of one property family, by a predicate on the lowercased property name. */
const declarationsOf = (corpus, matches) =>
  corpus.declarations.filter((declaration) => matches(declaration.property.toLowerCase()));

/** A declaration's value with `!important` and its whitespace normalised away. */
const normaliseValue = (value) =>
  value
    .replace(/\s*!important\s*$/iu, '')
    .trim()
    .replace(/\s+/gu, ' ');

/** A gate over the style corpus, whose `find(corpus)` gives one side's offending sites. */
const styleGate = (find) =>
  gateOver([STYLE_CORPUS], (readFile, files) => find(styleCorpusOf(readFile, files)));

/** A gate over the UI templates, whose `find(templates)` gives one side's offending sites. */
const templateGate = (find) =>
  gateOver([TEMPLATE_CORPUS], (readFile, files) => find(templatesOf(readFile, files)));

/** The module stylesheet, which gates 7 and 8 read ALONE rather than through the corpus. */
const MODULE_SHEET = 'styles/fabricate.css';

/** The class every Fabricate application root emits, and the root a module utility hangs from. */
const MODULE_ROOT = '.fabricate';

/** The sheet and every Svelte scoped block: the components, the manager and the player apps. */
const SWEEP_SCOPE = /^(?:styles\/|src\/ui\/svelte\/)/u;

test('both stylesheet corpora are still being read', () => {
  // A TOTAL HAS SLACK AND CANNOT SEE A PARTIAL LOSS. Break the `<style>` extractor and 195 files
  // stop contributing while the 20,000-line sheet still does, which a combined floor sails past —
  // and every clause below then reports a much cleaner product. So the two halves are floored
  // separately, on FILES rather than rules, because the failure being guarded against is a root or
  // an extension dropping out of the walk rather than a screen being deleted.
  const { rules } = treeStyles();
  const files = [...new Set(rules.map((rule) => rule.file))];
  const stylesheets = files.filter((file) => file.endsWith('.css')).length;
  const scoped = files.filter((file) => file.endsWith('.svelte')).length;

  assert.ok(
    stylesheets >= 1,
    'no `.css` file contributed a rule, so the global sheet — which holds every one of the ' +
      'breakpoints, most of the shadows and 136 of the radii — is not being walked at all'
  );
  assert.ok(
    scoped > 100,
    `only ${scoped} Svelte scoped blocks contributed a rule, against the ~195 this tree holds. ` +
      'That is the half `npm run lint:css` never globs, so it is the half no other tool would ' +
      'notice losing.'
  );
});

/* ───────────────────────────── gate 1: bare :focus ───────────────────────────── */

/** `:focus`, and not the start of `:focus-visible` or `:focus-within`. */
const BARE_FOCUS = /:focus(?!-(?:visible|within))(?![\w-])/u;

/** The element targets a Foundry-core focus reset names, and the three shapes those blocks take. */
const RESET_SHAPES = Object.freeze(
  [
    'button input select textarea [tabindex]',
    'a button input textarea [tabindex]',
    'button input select',
  ].map((shape) => shape.split(' ').sort(byCodePoint).join(' '))
);

/** One compound of a reset block: `<root> <target>:focus`, and nothing else. */
const RESET_COMPOUND = /^(\.[\w-]+) (\[tabindex\]|[a-z]+):focus$/u;

/** The SUPPLYING half of the same pair, which repaints the accent ring on `:focus-visible`. */
const RING_COMPOUND = /^(\.[\w-]+) (\[tabindex\]|[a-z]+):focus-visible$/u;

/**
 * The root class a rule writes one half of the core-focus pair for, or `null` when it is not one.
 *
 * @param {string} selector A rule's whole selector list.
 * @param {RegExp} compoundPattern {@link RESET_COMPOUND} or {@link RING_COMPOUND}.
 * @returns {string|null}
 */
function focusPairRoot(selector, compoundPattern) {
  const roots = new Set();
  const targets = [];
  for (const compound of splitSelectorList(selector)) {
    const match = compoundPattern.exec(compound);
    if (match === null) return null;
    roots.add(match[1]);
    targets.push(match[2]);
  }
  if (roots.size !== 1) return null;
  const shape = targets.sort(byCodePoint).join(' ');
  return RESET_SHAPES.includes(shape) ? [...roots][0] : null;
}

/** The root class a rule SUPPRESSES core focus for, or `null`. @see focusPairRoot */
function focusResetRoot(selector) {
  return focusPairRoot(selector, RESET_COMPOUND);
}

/** The seven primitive families that root their own focus chrome. */
const PRIMITIVE_FOCUS_STRIPS = Object.freeze([
  '.fabricate-button:focus',
  '.fabricate-field :is(input, textarea):focus',
  '.fabricate-icon-button:focus',
  ".fabricate-option-cards .manager-resolution-option input[type='radio']:focus",
  '.fabricate-pagination button:focus',
  '.fabricate-search input:focus',
  '.fabricate-slider input:focus',
  '.fabricate-tabs button:focus',
  '.fabricate-toggle .manager-tool-setting-toggle-input:focus',
  '.fabricate-toggle.fabricate-toggle:focus',
]);

/** The strip half's declaration set, exactly — property to normalised value, nothing else. */
const FOCUS_STRIP_DECLARATIONS = Object.freeze({ outline: 'none', 'box-shadow': 'none' });

/**
 * The primitive family compound a rule strips core focus chrome for, or `null` when it is not one.
 * Narrow on all three axes, so it cannot become somewhere to hide a real bare `:focus`: ONE
 * compound (a list is not this shape), that compound named exactly, and the declaration set
 * exactly `outline: none; box-shadow: none`. A strip that PAINTS anything — a colour, a border,
 * a ring of its own — is a bare `:focus` doing real work at mouse-click focus, which is the whole
 * population this gate exists to hold down.
 *
 * @param {{selector: string, file: string, body: string}} rule A rule from the corpus.
 * @returns {string|null} The compound recognised, or `null`.
 */
function primitiveFocusStrip(rule) {
  const compounds = splitSelectorList(rule.selector);
  if (compounds.length !== 1 || !PRIMITIVE_FOCUS_STRIPS.includes(compounds[0])) return null;
  const declared = declarationsIn(rule.file, rule.body);
  const expected = Object.entries(FOCUS_STRIP_DECLARATIONS);
  if (declared.length !== expected.length) return null;
  const byProperty = new Map(
    declared.map((entry) => [entry.property.toLowerCase(), normaliseValue(entry.value)])
  );
  return expected.every(([property, value]) => byProperty.get(property) === value)
    ? compounds[0]
    : null;
}

/** Every selector matching bare `:focus`, split three ways: the allow-listed area resets. */
function bareFocusSelectors(corpus) {
  const gated = [];
  const exempt = [];
  const strips = [];
  for (const rule of corpus.rules) {
    const reset = focusResetRoot(rule.selector);
    const strip = reset === null ? primitiveFocusStrip(rule) : null;
    for (const compound of splitSelectorList(rule.selector)) {
      if (!BARE_FOCUS.test(compound)) continue;
      if (reset !== null) exempt.push({ ...rule, compound, reset });
      else if (strip === null) gated.push({ ...rule, compound, reset });
      else strips.push({ ...rule, compound, strip });
    }
  }
  return { gated, exempt, strips };
}

test('the five Foundry-core focus resets are recognised, and a look-alike is not', () => {
  // BOTH POLARITIES OF THE ONLY EXEMPTION THIS GATE HAS. The positive half is the live corpus:
  const { exempt } = bareFocusSelectors(treeStyles());

  assert.deepEqual(
    [...new Set(exempt.map((entry) => entry.reset))].sort(byCodePoint),
    ['.fabricate'],
    'the set of roots suppressing core focus has changed. It is ONE root now: issue 1501 ' +
      'collapsed the app/manager pair onto the module root `.fabricate`, and issue 1520 deleted ' +
      'the four per-area copies that outlived it — the interactable browser, the interactable ' +
      'config sheet, the interactables manager and the roll-prompt dialog. Each of those emits ' +
      '`fabricate` itself, so the module reset already reached every element the copy named, at ' +
      'the same (0,2,1) rank and with a wider element list. A root arriving here is a per-area ' +
      'copy of a suppression the module root already writes, and it needs a reason no reader of ' +
      'either block could otherwise see.'
  );
  assert.equal(
    exempt.length,
    5,
    'the one surviving block names 5 selectors. It was 24 across five blocks before issue 1520: ' +
      'the module reset named six, the config, browser and manager copies named five each, and ' +
      'the roll-prompt copy named three — 6 + 5 + 5 + 5 + 3 — of which 18 went with the four ' +
      'deleted blocks, and issue 1777 took the module reset`s `select` leg with the last native ' +
      'select a template rendered.'
  );

  // A rule that merely CONTAINS a reset compound is not a reset. This is the cheapest way to
  // launder a finding: append the offending selector to the block that is already exempt.
  assert.equal(
    focusResetRoot(
      '.fabricate-app button:focus, .fabricate-app input:focus, .fabricate-app select:focus, ' +
        '.fabricate-app textarea:focus, .fabricate-app [tabindex]:focus, ' +
        '.fabricate-app .manager-thing:focus'
    ),
    null,
    'a seventh compound appended to a reset block must break the shape, or the allow-list is a ' +
      'place to hide anything'
  );
  assert.equal(
    focusResetRoot(
      '.fabricate-app button:focus, .fabricate-app input:focus, .fabricate-manager select:focus, ' +
        '.fabricate-app textarea:focus, .fabricate-app [tabindex]:focus'
    ),
    null,
    'a list spanning two roots must not be exempt under either of them'
  );
  assert.equal(
    focusResetRoot('.fabricate-app button:focus, .fabricate-app input:focus'),
    null,
    'a two-target subset is not one of the three published shapes'
  );
  assert.equal(
    focusResetRoot(
      '.fabricate-app button:focus, .fabricate-app input:focus, .fabricate-app select:focus'
    ),
    '.fabricate-app',
    'the three-target shape is real — it is what the roll-prompt dialog ships — so the negative ' +
      'cases above must fail for their own reasons rather than because nothing is ever exempt'
  );
});

test('a primitive family’s focus STRIP half is recognised, and a look-alike is not', () => {
  // THE SECOND EXEMPTION, BOTH POLARITIES.
  const { strips } = bareFocusSelectors(treeStyles());

  assert.deepEqual(
    [...new Set(strips.map((entry) => entry.strip))].sort(byCodePoint),
    [
      '.fabricate-button:focus',
      '.fabricate-field :is(input, textarea):focus',
      '.fabricate-icon-button:focus',
      ".fabricate-option-cards .manager-resolution-option input[type='radio']:focus",
      '.fabricate-pagination button:focus',
      '.fabricate-search input:focus',
      '.fabricate-slider input:focus',
      '.fabricate-tabs button:focus',
      '.fabricate-toggle .manager-tool-setting-toggle-input:focus',
      '.fabricate-toggle.fabricate-toggle:focus',
    ],
    'the set of primitive families declaring their own focus strip has changed. Each of the ' +
      'nine is the strip half of a pair `design-system/spec.md` requires, so one disappearing ' +
      'means that family repaints its ring ON TOP of Foundry core`s treatment in any host ' +
      'carrying neither application root — a deliberate edit here, never a silent one. `Field` ' +
      'and `SearchField` joined at issue 1508 phase 1 and `ChanceSlider` and ' +
      '`StatusToggle` at its phase 3, as each family was rooted at the class it emits; ' +
      '`Field`s member is ONE `:is()` compound because this recogniser accepts ' +
      'exactly one list member, while its RING half is two comma-separated legs because ' +
      '`bareElementRingRoot` reads one element per member. Both forms are asserted, here and in ' +
      'the ring-root clause below, so neither can be "unified" into the other. `RadioCardGroup` ' +
      'joined at issue 1509 phase 3 by SPLITTING the list its strip shared with the Tool ' +
      'Requirements bonus row — the rule and its two declarations are unchanged; what changed is ' +
      'that the option row`s member is now its own rule and therefore its own compound. ' +
      '`StatusToggle` is ' +
      'the one family with TWO members: its checkbox host is a `<label>`, which never matches ' +
      '`:focus`, so that host`s strip is written on the `<input>` the label wraps while its ' +
      'repaint stays a `:has()` ring on the label itself.'
  );
  assert.equal(
    strips.length,
    10,
    'one strip per family and per host that takes focus separately — NINE families and TEN ' +
      'compounds. The two numbers differ by one, and always for the same reason: `StatusToggle` ' +
      'declares two, because its checkbox host is a `<label>` that never matches `:focus` and ' +
      'that host`s strip is therefore written on the `<input>` the label wraps. Every other ' +
      'family declares exactly one. `EditorTabs` is the eighth family (issue 1509) and its strip ' +
      'is `.fabricate-tabs button:focus`, the shape `.fabricate-pagination button:focus` already ' +
      'ships: a root whose own control is a bare `<button>` it renders itself. `RadioCardGroup` ' +
      'is the ninth (issue 1509 phase 3) and its strip is the one that arrived by SPLITTING ' +
      'rather than by writing: the rule already existed and already carried exactly ' +
      '`outline: none; box-shadow: none`, but it shared a selector list with the Tool ' +
      'Requirements bonus row and this recogniser accepts one compound, so the split is what ' +
      'made an existing strip recognisable.'
  );

  // `declarationsIn` stamps the file onto each declaration and `primitiveFocusStrip` never reads
  // it back, so the synthetic rules below name the sheet only to look like what they stand for.
  const strip = (selector, body) =>
    primitiveFocusStrip({ selector, file: 'styles/fabricate.css', body });

  assert.equal(
    strip('.fabricate-button:focus', 'outline: none; box-shadow: none;'),
    '.fabricate-button:focus',
    'the shipped shape is real, so the negative cases below must fail for their own reasons ' +
      'rather than because nothing is ever recognised'
  );
  assert.equal(
    strip('.fabricate-button:focus', 'outline: none; box-shadow: none; background: red;'),
    null,
    'a third declaration is a strip doing real PAINTING at mouse-click focus, which is the ' +
      'population this gate exists to hold down'
  );
  assert.equal(
    strip('.fabricate-button:focus', 'outline: none;'),
    null,
    "half a strip does not remove core's 4px glow, which is a box-shadow rather than an outline"
  );
  assert.equal(
    strip('.fabricate-button:focus', 'outline: 2px solid var(--fab-accent); box-shadow: none;'),
    null,
    'a strip that draws an outline is a bare `:focus` RING, which is exactly the debt'
  );
  assert.equal(
    strip('.manager-nav-button:focus', 'outline: none; box-shadow: none;'),
    null,
    'the exemption is for a PRIMITIVE FAMILY ROOT, not for any class that writes the two ' +
      'declarations — otherwise every bare `:focus` offender could be paid off by deleting its ring'
  );
  assert.equal(
    strip('.fabricate-button:focus, .manager-nav-button:focus', 'outline: none; box-shadow: none;'),
    null,
    'appending a compound to a recognised strip must break the shape, or the allow-list is a ' +
      'place to hide anything — the same reason the reset blocks are matched whole'
  );
});

/** Netted on the rule body, so a renamed selector is a move and a new offender is not. */
const BARE_FOCUS_GATE = styleGate((corpus) =>
  bareFocusSelectors(corpus).gated.map((entry) => ({
    file: entry.file,
    line: entry.line,
    id: `bare :focus ${entry.compound}`,
    value: `bare :focus | ${entry.body.replaceAll(/\s+/gu, ' ').trim()}`,
  }))
);

test('no bare :focus selector survives outside a Foundry-core reset', (t) => {
  assertFloor('bare `:focus` selectors', treeStyles().rules.length, 3000);
  checkGate(
    t,
    BARE_FOCUS_GATE,
    'The design system states the focus ring as `:focus-visible` — see the "Every interactive ' +
      'primitive declares its full state set" requirement. Bare `:focus` draws the ring for a ' +
      'MOUSE click as well as for the keyboard, which is the state the rule exists to keep apart. ' +
      "Write `:focus-visible`. There are two exceptions, both suppressing Foundry core's own " +
      'ring and both recognised by SHAPE rather than by line: the five allow-listed root reset ' +
      "blocks, and a primitive family's focus STRIP half — a single-compound rule on the class " +
      'the primitive emits, declaring exactly `outline: none; box-shadow: none`. That second one ' +
      'is REQUIRED CHROME rather than debt: `design-system/spec.md` says the chrome a primitive ' +
      'declares is the PAIR, because a family rooted at its own class renders in hosts carrying ' +
      "no application root, where the repaint alone lands on top of core's treatment instead of " +
      'replacing it. Do not exempt one of those with a marker; widen the recognition instead.'
  );
});

/* ──────────────────────────── gate 2: viewport @media ──────────────────────────── */

/** An `@media` at-rule with a block, and the query text it opens with. */
const MEDIA_AT_RULE = /@media\b([^{]*)\{/gu;

/** The user-preference features a query may test. Everything else is a viewport breakpoint. */
const USER_PREFERENCE = /prefers-reduced-motion|prefers-contrast|forced-colors/u;

/** An `@container` at-rule with a block, and its prelude. */
const CONTAINER_AT_RULE = /@container\b([^{]*)\{/gu;

/** A prelude that opens with a container name: an identifier that is not a keyword, then a space. */
const NAMED_CONTAINER = /^(?!(?:not|and|or|none)\s)(-?[a-z_][\w-]*)\s/iu;

/** Every at-rule `pattern` opens in the corpus, with its prelude normalised and its line. */
function atRules(corpus, pattern) {
  const found = [];
  for (const [file, css] of Object.entries(corpus.styles)) {
    pattern.lastIndex = 0;
    for (let match = pattern.exec(css); match !== null; match = pattern.exec(css)) {
      found.push({
        file,
        line: css.slice(0, match.index).split('\n').length,
        query: match[1].trim().replace(/\s+/gu, ' '),
      });
    }
  }
  return found;
}

/** Every `@media` in the corpus. */
const mediaQueries = (corpus) => atRules(corpus, MEDIA_AT_RULE);

/** Every `@media` that asks about the viewport rather than about the reader. */
const viewportQueries = (corpus) =>
  mediaQueries(corpus).filter((entry) => !USER_PREFERENCE.test(entry.query));

/** Every `@container` whose prelude names no container, so it answers to the nearest one. */
const unnamedContainers = (corpus) =>
  atRules(corpus, CONTAINER_AT_RULE).filter((entry) => !NAMED_CONTAINER.test(entry.query));

const VIEWPORT_MEDIA_GATE = styleGate((corpus) => [
  ...viewportQueries(corpus).map((entry) => ({
    ...entry,
    id: `viewport @media ${entry.query}`,
    value: `@media ${entry.query}`,
  })),
  ...unnamedContainers(corpus).map((entry) => ({
    ...entry,
    id: `unnamed @container ${entry.query}`,
    value: `@container ${entry.query}`,
  })),
]);

/**
 * The published app-level ladders: a query against one of these containers breaks on a rung. The
 * manager root also carries `fabricate-option-host`, so that name's one rung is app-level too.
 */
const APP_CONTAINER_LADDERS = Object.freeze({
  'fabricate-manager': [1320, 1120, 960, 900, 831, 680],
  'fabricate-recipes': [714, 634, 554],
  'fabricate-option-host': [620],
});

/** An inline-size feature, in either spelling. */
const INLINE_FEATURE = /^(?:width|inline-size)$/u;

/** `min-` or `max-` before an inline-size feature, then its value. */
const BOUND_FEATURE = /^(min|max)-(?:width|inline-size)\s*:\s*(.+)$/u;

/** A range comparison, kept when splitting a condition so the operator survives. */
const COMPARISON = /\s*(<=|>=|<|>|=)\s*/u;

/** The same comparison with its operands swapped: `n >= width` is `width <= n`. */
const SWAPPED = Object.freeze({ '<': '>', '>': '<', '<=': '>=', '>=': '<=', '=': '=' });

/**
 * The boundaries `width <op> value` draws, as rungs: rung n parts n from n + 1, so `<= n` and
 * `> n` are n, `< n` and `>= n` are n - 1, and `= n` is both. A value not in px is unparsed.
 */
function rungsOf(op, value, condition) {
  const px = /^(\d+(?:\.\d+)?)px$/u.exec(value.trim());
  if (!px) return [`unparsed (${condition})`];
  const n = Number(px[1]);
  if (op === '=') return [n - 1, n];
  return [op === '<=' || op === '>' ? n : n - 1];
}

/** The rungs one parenthesised condition draws, or its text when it is not an inline-size bound. */
function conditionRungs(condition) {
  const bound = BOUND_FEATURE.exec(condition);
  if (bound) return rungsOf(bound[1] === 'max' ? '<=' : '>=', bound[2], condition);
  const [left, op, middle, op2, right] = condition.split(COMPARISON);
  if (op && INLINE_FEATURE.test(left) && op2 === undefined) return rungsOf(op, middle, condition);
  if (op && INLINE_FEATURE.test(middle) && op2 === undefined) {
    return rungsOf(SWAPPED[op], left, condition);
  }
  if (op2 && INLINE_FEATURE.test(middle)) {
    return [...rungsOf(SWAPPED[op], left, condition), ...rungsOf(op2, right, condition)];
  }
  return [`unparsed (${condition})`];
}

/** Every rung a prelude's innermost conditions draw, in feature and in range syntax. */
const rungsNamed = (query) =>
  [...query.matchAll(/\(([^()]*)\)/gu)].flatMap(([, condition]) =>
    conditionRungs(condition.trim().toLowerCase())
  );

/** Every bound in a query against an app container that is not on that container's ladder. */
const offLadderContainers = (corpus) =>
  atRules(corpus, CONTAINER_AT_RULE).flatMap((entry) => {
    const ladder = APP_CONTAINER_LADDERS[NAMED_CONTAINER.exec(entry.query)?.[1]];
    if (!ladder) return [];
    return rungsNamed(entry.query)
      .filter((rung) => !ladder.includes(rung))
      .map((rung) => ({ ...entry, rung }));
  });

/** Every name a `container-name` or `container` declaration establishes, over the corpus. */
function declaredContainerNames(corpus) {
  const names = corpus.declarations.flatMap(({ property, value }) => {
    const bare = normaliseValue(value);
    if (property.toLowerCase() === 'container-name') return bare.split(' ');
    if (property.toLowerCase() === 'container') return bare.split('/', 1)[0].trim().split(' ');
    return [];
  });
  return new Set(names.filter((name) => name !== '' && name.toLowerCase() !== 'none'));
}

/** Every `@container` naming a container no declaration establishes, so it never fires. */
function undeclaredContainers(corpus) {
  const declared = declaredContainerNames(corpus);
  return atRules(corpus, CONTAINER_AT_RULE).filter((entry) => {
    const name = NAMED_CONTAINER.exec(entry.query)?.[1];
    return name !== undefined && !declared.has(name);
  });
}

/** Every rule declaring a `container-type` without a `container-name` beside it. */
const unnamedContainerTypes = (corpus) =>
  corpus.rules.flatMap((rule) => {
    const declared = declarationsIn(rule.file, rule.body);
    const has = (property) => declared.some((entry) => entry.property.toLowerCase() === property);
    const typed = declared.some(
      (entry) =>
        entry.property.toLowerCase() === 'container-type' &&
        normaliseValue(entry.value) !== 'normal'
    );
    return typed && !has('container-name')
      ? [{ file: rule.file, line: rule.line, query: rule.selector }]
      : [];
  });

test('no viewport breakpoint or unnamed container is introduced, and preferences stay exempt', (t) => {
  const all = mediaQueries(treeStyles());
  const gated = viewportQueries(treeStyles());

  // THE EXEMPTION, PROVED LIVE. A predicate that quietly matched everything would empty this
  // population wholesale, which reads like debt paid down rather than like a gate switched off.
  assert.ok(
    all.length - gated.length > 0,
    'no `@media` query tests a user preference any more, so the exemption this gate grants is ' +
      'granted to nothing and could be widened to anything without a single row moving — or, the ' +
      'other reading and the worse one, the at-rule scan has stopped matching anything at all'
  );

  // THE FLOOR IS OVER THE CORPUS, NOT OVER THE QUERIES.
  assertFloor('viewport `@media` breakpoints', treeStyles().rules.length, 3000);
  checkGate(
    t,
    VIEWPORT_MEDIA_GATE,
    'The Foundry contract binds every primitive: an application window is RESIZED BY THE USER ' +
      'and is not the viewport, so a `@media (max-width: …)` asks the wrong question and answers ' +
      'it with the monitor. Use a container query against the app root. `prefers-reduced-motion`, ' +
      '`prefers-contrast` and `forced-colors` are user preferences rather than geometry and stay ' +
      'exempt. A container query names its container: an unnamed one answers to whichever ' +
      'container is nearest, which moves the moment a host declares one.'
  );
});

// Absolute, not against the base: the swept scope asks no viewport query, names every container
// and breaks an app container on its published ladder.
test('the sheet and every scoped block ask no viewport, name every container and keep the ladder', () => {
  const corpus = treeStyles();
  const inScope = (entry) => SWEEP_SCOPE.test(entry.file);
  const site = (entry) => `${entry.file}:${entry.line} ${entry.query}`;
  const containers = atRules(corpus, CONTAINER_AT_RULE).filter(inScope);
  assert.ok(containers.length >= 30, `only ${containers.length} in-scope container queries`);
  assert.deepEqual(viewportQueries(corpus).filter(inScope).map(site), [], 'a viewport `@media`');
  assert.deepEqual(unnamedContainers(corpus).filter(inScope).map(site), [], 'an unnamed container');
  assert.deepEqual(
    unnamedContainerTypes(corpus).filter(inScope).map(site),
    [],
    'a `container-type` with no `container-name` beside it: name the container it declares'
  );
  assert.deepEqual(
    undeclaredContainers(corpus).map(site),
    [],
    'an `@container` names a container no `container-name` or `container` declares, so it never fires'
  );
  assert.deepEqual(
    offLadderContainers(corpus).map((entry) => `${site(entry)} → ${entry.rung}`),
    [],
    'an app container breaks at a rung of its published ladder, as a px width or inline-size bound: ' +
      'the manager at 1320, 1120, 960, 900, 831 and 680, the recipes at 714, 634 and 554, and the ' +
      'option host the manager root also carries at 620'
  );
});

test('the option host is the manager root, the modifier catalogue card and the tool editor panel', () => {
  const hosts = treeStyles()
    .declarations.filter(
      (entry) =>
        /^container(?:-name)?$/u.test(entry.property.toLowerCase()) &&
        /(?:^|\s)fabricate-option-host(?:\s|$)/u.test(normaliseValue(entry.value).split('/', 1)[0])
    )
    .map((entry) => `${entry.file} ${entry.selector}`);
  assert.deepEqual(
    hosts.sort(byCodePoint),
    [
      `${MODULE_SHEET} .fabricate-manager`,
      `${MODULE_SHEET} .fabricate-manager .manager-tool-editor-panel`,
      'src/ui/svelte/apps/manager/checks/CraftingModifierCatalogueCard.svelte ' +
        ':global(.fabricate-card[data-crafting-modifier-catalogue]), ' +
        ':global(.fabricate-card[data-crafting-modifier-policy-card])',
    ].sort(byCodePoint),
    'the 620 option-card reflow answers these hosts; a player app root must not carry the name'
  );
  assert.deepEqual(
    hosts.filter(
      (host) =>
        /^src\/ui\/svelte\/apps\/(?!manager\/)/u.test(host) || /\.fabricate-app\b/u.test(host)
    ),
    [],
    'a player app root carries `fabricate-option-host`, so the manager reflow reaches the player'
  );
});

test('an unnamed container query fails, and a named one or a ladder rung passes', (t) => {
  const corpusOf = (css) => ({ styles: { [MODULE_SHEET]: css } });
  const named = '@container fabricate-manager (max-width: 680px) { .a { gap: 0; } }';
  const unnamed = '@container (max-width: 680px) { .a { gap: 0; } }';
  assert.deepEqual(unnamedContainers(corpusOf(named)), []);
  assert.equal(unnamedContainers(corpusOf('@container not (width > 1px) { .a {} }')).length, 1);
  assert.equal(unnamedContainers(corpusOf(unnamed)).length, 1);
  assert.deepEqual(offLadderContainers(corpusOf(named)), []);
  const base = { [MODULE_SHEET]: '.fabricate .a { gap: 0; }\n' };
  const media = '@media (max-width: 680px) { .a { gap: 0; } }';
  assertGateCases(t, VIEWPORT_MEDIA_GATE, base, [
    {
      head: { [MODULE_SHEET]: `${base[MODULE_SHEET]}${unnamed}\n` },
      failures: [`${MODULE_SHEET}: unnamed @container (max-width: 680px) is new (1)`],
    },
    { head: { [MODULE_SHEET]: `${base[MODULE_SHEET]}${named}\n` }, failures: [] },
  ]);
  // A viewport `@media` turned into an unnamed `@container` in the same file does not net.
  assertGateCases(t, VIEWPORT_MEDIA_GATE, { [MODULE_SHEET]: `${base[MODULE_SHEET]}${media}\n` }, [
    {
      head: { [MODULE_SHEET]: `${base[MODULE_SHEET]}${unnamed}\n` },
      failures: [`${MODULE_SHEET}: unnamed @container (max-width: 680px) is new (1)`],
    },
  ]);
});

test('the ladder reads every width bound to px, and an unreadable or non-px bound fails', () => {
  const rungs = (prelude) =>
    offLadderContainers({ styles: { [MODULE_SHEET]: `@container ${prelude} { .a {} }` } }).map(
      (entry) => entry.rung
    );
  assert.deepEqual(rungs('fabricate-manager (min-width: 832px) and (max-width: 1000px)'), [1000]);
  assert.deepEqual(rungs('fabricate-manager (width <= 720px)'), [720]);
  assert.deepEqual(rungs('fabricate-manager (720px >= width)'), [720]);
  assert.deepEqual(rungs('fabricate-manager (inline-size < 1000px)'), [999]);
  assert.deepEqual(rungs('fabricate-manager (max-inline-size: 700px)'), [700]);
  assert.deepEqual(rungs('fabricate-manager (width = 700px)'), [699, 700]);
  assert.deepEqual(rungs('fabricate-manager (500px < width <= 700px)'), [500, 700]);
  assert.deepEqual(rungs('fabricate-manager (max-width: 42rem)'), ['unparsed (max-width: 42rem)']);
  assert.deepEqual(rungs('fabricate-manager (width < 60%)'), ['unparsed (width < 60%)']);
  assert.deepEqual(rungs('fabricate-manager (orientation: portrait)'), [
    'unparsed (orientation: portrait)',
  ]);
  // On the ladder in every spelling, and a component's own container is not read.
  assert.deepEqual(rungs('fabricate-manager (width <= 680px)'), []);
  assert.deepEqual(rungs('fabricate-manager (width > 680px)'), []);
  assert.deepEqual(rungs('fabricate-manager (681px <= inline-size)'), []);
  assert.deepEqual(rungs('fabricate-manager (min-width: 961px) and (width < 1121px)'), []);
  assert.deepEqual(rungs('fabricate-option-host (max-width: 620px)'), []);
  assert.deepEqual(rungs('fabricate-scoped-list (max-width: 42rem)'), []);
});

test('an @container naming no declared container fails, and an unnamed container-type fails', () => {
  const corpusOf = (css) => {
    const file = 'src/ui/svelte/apps/manager/Probe.svelte';
    return styleCorpusOf(
      (path) => (path === file ? `<style>\n${css}\n</style>\n` : undefined),
      [file]
    );
  };
  const query = (name) => `@container ${name} (max-width: 680px) { .a { gap: 0; } }`;
  const declared = '.host { container-type: inline-size; container-name: fabricate-manager; }';
  assert.equal(
    undeclaredContainers(corpusOf(`${declared}\n${query('fabricate-manager')}`)).length,
    0
  );
  assert.equal(
    undeclaredContainers(corpusOf(`${declared}\n${query('fabricate-managr')}`)).length,
    1
  );
  assert.equal(
    undeclaredContainers(
      corpusOf(`.host { container: fabricate-host / inline-size; }\n${query('fabricate-host')}`)
    ).length,
    0
  );
  assert.equal(unnamedContainerTypes(corpusOf(declared)).length, 0);
  assert.equal(unnamedContainerTypes(corpusOf('.host { container-type: inline-size; }')).length, 1);
  assert.equal(unnamedContainerTypes(corpusOf('.host { container-type: normal; }')).length, 0);
  assert.equal(unnamedContainerTypes(corpusOf('.host { container: a / inline-size; }')).length, 0);
});

/* ─────────────────────────────── gate 3: weights ─────────────────────────────── */

/** The published weight ramp. */
const WEIGHT_RAMP = Object.freeze(['400', '500', '600', '700']);

/** The keyword weights CSS defines, so `bold` cannot walk around a numeric ramp. */
const WEIGHT_KEYWORDS = new Map([
  ['normal', 400],
  ['bold', 700],
  ['bolder', 700],
  ['lighter', 300],
]);

/** A weight as a number, or `null` for `inherit`, `initial` and anything else relative. */
function weightValue(value) {
  const keyword = WEIGHT_KEYWORDS.get(value.toLowerCase());
  if (keyword !== undefined) return keyword;
  return /^\d+$/u.test(value) ? Number(value) : null;
}

/** Every `font-weight` declaration, normalised. */
const fontWeights = (corpus) =>
  declarationsOf(corpus, (property) => property === 'font-weight').map((declaration) => ({
    ...declaration,
    value: normaliseValue(declaration.value),
  }));

/** One declaration site, keyed on its selector and value and netted on its value. */
const declarationSite = (label, declaration) => ({
  file: declaration.file,
  line: declaration.at,
  id: `${label} ${declaration.selector} | ${declaration.value}`,
  value: `${label} ${declaration.value}`,
});

const OFF_RAMP_WEIGHT_GATE = styleGate((corpus) =>
  fontWeights(corpus)
    .filter((declaration) => !WEIGHT_RAMP.includes(declaration.value))
    .map((declaration) => declarationSite('off-ramp font-weight', declaration))
);

test('no font weight leaves the published ramp', (t) => {
  assertFloor('off-ramp font weights', fontWeights(treeStyles()).length, 400);
  checkGate(
    t,
    OFF_RAMP_WEIGHT_GATE,
    'Geometry comes from the published ladders, and weight is one of them: 400, 500, 600 and ' +
      '700 are the shipped faces. 650 and 800 have no face behind them, so the browser ' +
      'synthesises them — the glyphs are smeared rather than drawn. `inherit` is not a weight ' +
      'either; it defers the decision to whatever the caller happened to set.'
  );
});

/** A selector within its file, which is how a mono family and its weight are joined. */
const selectorKey = (declaration) => `${declaration.file} | ${declaration.selector}`;

/** Rules whose font shorthand or family names the mono face. */
function monoSelectors(corpus) {
  const named = new Set();
  const fonts = declarationsOf(corpus, (property) => /^font(-family)?$/u.test(property));
  for (const declaration of fonts) {
    if (/var\(\s*--fab-font-mono/u.test(declaration.value)) named.add(selectorKey(declaration));
  }
  return named;
}

/** The weights above 500 on a rule naming the mono face. MATCHED BY SELECTOR TEXT WITHIN A FILE. */
function heavyMonoWeights(corpus) {
  const mono = monoSelectors(corpus);
  return fontWeights(corpus).filter((declaration) => {
    if (!mono.has(selectorKey(declaration))) return false;
    const weight = weightValue(declaration.value);
    return weight !== null && weight > 500;
  });
}

const HEAVY_MONO_GATE = styleGate((corpus) =>
  heavyMonoWeights(corpus).map((declaration) => declarationSite('heavy mono weight', declaration))
);

test('no mono rule asks for a weight the shipped face does not have', (t) => {
  const mono = monoSelectors(treeStyles());

  assert.ok(
    mono.size > 20,
    `only ${mono.size} rules name \`var(--fab-font-mono)\`, against the ~62 this corpus holds. ` +
      'With none, this gate is an absence check over an empty set.'
  );

  assertFloor('mono rules above the shipped weight', fontWeights(treeStyles()).length, 400);
  checkGate(
    t,
    HEAVY_MONO_GATE,
    '`styles/fabricate.css` ships JetBrains Mono at 400 and 500 and at nothing else — read the ' +
      'four `@font-face` blocks at the top of it. A mono rule asking for 600 or 700 gets a ' +
      'SYNTHESISED bold: the browser smears the 500 glyphs sideways, and the numerals stop lining ' +
      'up with the numerals beside them, which is the entire reason this face is used. Use 500, ' +
      'or use the body face.'
  );
});

/** A swept-scope declaration with no marker at its site, which an absolute check reads. */
const unmarkedInScope = (corpus) => (d) =>
  SWEEP_SCOPE.test(d.file) && !exemptAt(d.file, corpus.sources[d.file], d.at);

/** A declaration as an absolute check names it. */
const scopeSite = (d) => `${d.file}: ${d.selector} | ${d.value}`;

// Absolute, not against the base: the swept scope holds no off-ramp weight and no heavy mono.
test('no weight in the sheet and every scoped block leaves the ramp or the mono face', () => {
  const corpus = treeStyles();
  const unmarked = unmarkedInScope(corpus);
  const weights = fontWeights(corpus).filter(unmarked);
  assert.ok(weights.length >= 500, `only ${weights.length} in-scope weights were read`);
  assert.deepEqual(
    weights.filter((d) => !WEIGHT_RAMP.includes(d.value)).map(scopeSite),
    [],
    'a weight is a numeral on the 400/500/600/700 ramp: 650 → 600, 800 → 700, and `inherit` ' +
      'states the numeral it resolves to'
  );
  assert.deepEqual(
    heavyMonoWeights(corpus).filter(unmarked).map(scopeSite),
    [],
    'the mono face ships 400 and 500 only: a mono rule above 500 → 500'
  );
});

/* ─────────────────────────────── gate 4: shadows ─────────────────────────────── */

/** The two published elevation tokens. */
const SHADOW_TOKEN = /^var\(\s*--fab-shadow-(md|lg)\s*\)$/iu;

/** A `--fab-*` colour, with an optional fallback. */
const FAB_COLOUR = String.raw`var\(\s*--fab-[\w-]+\s*(?:,[^)]*)?\)`;

/** An edge's width, captured so it can be bounded. */
const EDGE_WIDTH = String.raw`(\d+(?:\.\d+)?)px`;

/** An inset ring: a border drawn as a shadow so it costs no layout. */
const INSET_RING = new RegExp(`^(?:inset )?0 0 0 ${EDGE_WIDTH} ${FAB_COLOUR}$`, 'iu');

/** A leading bar: an inset edge on the inline start, with no block offset and no blur. */
const LEADING_BAR = new RegExp(`^inset ${EDGE_WIDTH} 0 0 ${FAB_COLOUR}$`, 'iu');

/** The widest a ring or a bar may draw: past it the shadow is a fill rather than an edge. */
const EDGE_MAX_PX = 4;

/** Whether `value` takes `shape` with an edge no wider than {@link EDGE_MAX_PX}. */
const edgeOf = (shape, value) => {
  const match = shape.exec(value);
  return match !== null && Number(match[1]) <= EDGE_MAX_PX;
};

const isRing = (value) => edgeOf(INSET_RING, value);
const isLeadingBar = (value) => edgeOf(LEADING_BAR, value);

/**
 * The checked radio's dot, the one ring wider than {@link EDGE_MAX_PX}: its 16px accent ring fills
 * the 16px control inside a 3px ground. It is named whole rather than lifting the bound.
 */
const RADIO_DOT = 'inset 0 0 0 3px var(--fab-bg-1), inset 0 0 0 16px var(--fab-accent)';

/** A shadow's layers, split at the commas outside any parentheses. */
function shadowLayers(value) {
  const layers = [''];
  let depth = 0;
  for (const character of value) {
    if (character === '(') depth += 1;
    if (character === ')') depth -= 1;
    if (character === ',' && depth === 0) layers.push('');
    else layers[layers.length - 1] += character;
  }
  return layers.map((layer) => layer.trim());
}

/** Two or more rings in one declaration, such as the nav count's pip inside its halo. */
function isRingList(value) {
  const layers = shadowLayers(value);
  return layers.length > 1 && layers.every(isRing);
}

/** The shapes gate 4 allows: `none`, a token, a ring, a ring list, the radio dot and a bar. */
const allowedShadow = (value) =>
  value.toLowerCase() === 'none' ||
  SHADOW_TOKEN.test(value) ||
  isRing(value) ||
  isRingList(value) ||
  value === RADIO_DOT ||
  isLeadingBar(value);

/** Every `box-shadow` declaration, normalised. */
const shadowsOf = (corpus) =>
  declarationsOf(corpus, (property) => property === 'box-shadow').map((declaration) => ({
    ...declaration,
    value: normaliseValue(declaration.value),
  }));

const OFF_TOKEN_SHADOW_GATE = styleGate((corpus) =>
  shadowsOf(corpus)
    .filter((declaration) => !allowedShadow(declaration.value))
    .map((declaration) => declarationSite('off-token box-shadow', declaration))
);

test('no box-shadow is written outside the published elevation set', (t) => {
  const shadows = shadowsOf(treeStyles());

  // Each allowance is live, so widening one shows up as rows vanishing rather than as nothing at
  // all: a shape that no longer matches reads, from the ratchet alone, as debt paid down.
  const live = [
    ['a published elevation token', (value) => SHADOW_TOKEN.test(value)],
    ['an inset ring', isRing],
    ['a ring list', isRingList],
    ['the radio dot', (value) => value === RADIO_DOT],
    ['a leading bar', isLeadingBar],
  ];
  for (const [shape, matches] of live) {
    assert.ok(
      shadows.some((declaration) => matches(declaration.value)),
      `no \`box-shadow\` is written as ${shape} any more, so that allowance is untested by the ` +
        'corpus and could be widened without a row moving'
    );
  }

  assertFloor('off-token box-shadows', shadows.length, 80);
  checkGate(
    t,
    OFF_TOKEN_SHADOW_GATE,
    'Token foundations are the only source of elevation. `--fab-shadow-md` and ' +
      '`--fab-shadow-lg` are the two heights this product has, and only a surface that floats ' +
      'over content takes one; a hand-written offset and blur is a third height that no ' +
      'other surface can match. `none`, an inset ring, a comma list of rings and a leading bar ' +
      '(`inset 3px 0 0 var(--fab-*)`), each at most 4px wide, are edges rather than elevation and ' +
      'stay allowed, and so does the checked radio dot, whose 16px ring fills its control.'
  );
});

// Absolute, not against the base: the swept scope draws no shadow outside the allowance.
test('no shadow in the sheet and every scoped block leaves the allowance', () => {
  const corpus = treeStyles();
  const shadows = shadowsOf(corpus).filter(unmarkedInScope(corpus));
  assert.ok(shadows.length >= 80, `only ${shadows.length} in-scope shadows were read`);
  assert.deepEqual(
    shadows.filter((d) => !allowedShadow(d.value)).map(scopeSite),
    [],
    'elevation is a `--fab-shadow-*` token on a surface that floats; a sitting surface draws ' +
      'none, and a hairline is its 1px `--fab-border` or a ring'
  );
});

/** A selector on one line, as the pinned lists below spell it. */
const oneLine = (selector) => selector.replaceAll(/\s+/gu, ' ').trim();

/**
 * Every in-scope read of an elevation token, by file and selector, with the reason that surface
 * floats over content. No pattern can tell a floating surface from a sitting one, so a new read
 * fails until it is listed here, and the review of that listing decides the classification.
 */
const FLOATING_SURFACES = Object.freeze([
  ['src/ui/svelte/components/Modal.svelte', '.manager-modal', 'a dialog over the window'],
  [
    MODULE_SHEET,
    '.fabricate-typeahead-list.fabricate-typeahead-list',
    'opens over the fields below',
  ],
  [MODULE_SHEET, '.fabricate-manager .manager-recipe-duration-popover', 'a popover'],
  [MODULE_SHEET, '.fabricate-manager .manager-recipe-option-suggestions', 'opens over the form'],
  [MODULE_SHEET, '.fabricate-manager .manager-availability-menu', 'a menu'],
  [MODULE_SHEET, '.fabricate-color-picker-popover.manager-color-picker-popover', 'a popover'],
  [MODULE_SHEET, '.fabricate-action-menu-panel.manager-action-menu-panel', 'a row menu'],
  [MODULE_SHEET, '.fabricate-interaction-prompt', 'a toast over the canvas'],
  [MODULE_SHEET, '.fabricate-picker-popover.manager-travel-popover', 'a popover'],
]);

// Absolute and pinned: no marker excuses elevation on a surface the list does not name.
test('elevation is read only on the surfaces pinned as floating', () => {
  const corpus = treeStyles();
  const reads = corpus.declarations.filter(
    (d) =>
      SWEEP_SCOPE.test(d.file) &&
      /--fab-shadow-/iu.test(d.value) &&
      !/^--fab-shadow-/iu.test(d.property)
  );
  assert.deepEqual(
    reads.map((d) => `${d.file}: ${oneLine(d.selector)}`).sort(byCodePoint),
    FLOATING_SURFACES.map(([file, selector]) => `${file}: ${selector}`).sort(byCodePoint),
    'a `--fab-shadow-*` token is elevation, and only a surface that floats over content takes ' +
      'one. A new read is listed in FLOATING_SURFACES with the reason that surface floats; a ' +
      'surface that sits — a card, a row, a dock pinned to its edge — draws none'
  );
});

/** A theme block's selector: `:root`, or `:root` or `.fabricate` naming one theme. */
const THEME_BLOCK =
  /^(?::root(?:\[data-fabricate-theme="[\w-]+"\])?|\.fabricate\[data-fabricate-theme="[\w-]+"\])$/u;

const inThemeBlock = (d) =>
  d.file === MODULE_SHEET && splitSelectorList(d.selector).every((item) => THEME_BLOCK.test(item));

// Absolute: a filter, a text shadow or a re-declared token draws depth the gate above never reads.
test('no rule in the sheet and every scoped block draws depth through another channel', () => {
  const corpus = treeStyles();
  const declarations = corpus.declarations
    .filter(unmarkedInScope(corpus))
    .map((d) => ({ ...d, value: normaliseValue(d.value) }));
  const textShadows = declarations.filter((d) => d.property.toLowerCase() === 'text-shadow');
  assert.ok(textShadows.length >= 3, `only ${textShadows.length} in-scope text shadows were read`);
  assert.deepEqual(
    declarations.filter((d) => /drop-shadow\(/iu.test(d.value)).map(scopeSite),
    [],
    '`drop-shadow()` is elevation the box-shadow allowance cannot see: a floating surface takes ' +
      'a `--fab-shadow-*` token as its `box-shadow`, and a sitting one draws none'
  );
  assert.deepEqual(
    textShadows.filter((d) => d.value.toLowerCase() !== 'none').map(scopeSite),
    [],
    'a `text-shadow` other than `none` gives text a depth the design system does not have'
  );

  const definitions = corpus.declarations.filter(
    (d) => SWEEP_SCOPE.test(d.file) && /^--fab-shadow-[\w-]+$/iu.test(d.property)
  );
  assertFloor('theme-block elevation tokens', definitions.filter(inThemeBlock).length, 14);
  assert.deepEqual(
    definitions.filter((d) => !inThemeBlock(d)).map(scopeSite),
    [],
    'the elevation tokens are declared in the seven theme blocks only: a rule that declares or ' +
      're-declares one gives the surfaces beneath it a height no theme publishes'
  );
});

/**
 * The rules whose inset top hairline was dropped, each of which keeps its 1px `--fab-border`. The
 * inputs among them also keep `box-shadow: none`, so no Foundry-core input shadow surfaces there.
 */
const HAIRLINE_EDGES = Object.freeze([
  [MODULE_SHEET, '.fabricate-manager .manager-condition-modifier-value input', 'input'],
  [
    MODULE_SHEET,
    '.fabricate-manager .manager-gathering-event-edit-view :is(input:not([type="checkbox"])' +
      ':not([type="radio"]):not([type="range"]), textarea)',
    'input',
  ],
  [
    MODULE_SHEET,
    '.fabricate-manager .manager-gathering-task-edit-view :is( input:not([type="checkbox"])' +
      ':not([type="radio"]):not([type="range"]):not([data-recipe-option-formula])' +
      ':not([data-recipe-option-search]), textarea )',
    'input',
  ],
  [
    MODULE_SHEET,
    '.fabricate-manager .manager-drop-editor-card input:not([type="checkbox"])' +
      ':not([type="radio"]):not([type="range"])',
    'input',
  ],
  [
    MODULE_SHEET,
    '.fabricate-manager .manager-environment-drop-adjustment-input ' +
      '.manager-condition-modifier-value input',
    'input',
  ],
  [
    MODULE_SHEET,
    '.fabricate-manager .manager-task-core-card, .fabricate-manager .manager-task-availability-card, ' +
      '.fabricate-manager .manager-task-component-browser-card, ' +
      '.fabricate-manager .manager-task-overview-card, .fabricate-manager .manager-task-drops-card, ' +
      '.fabricate-manager .manager-selected-drop-editor',
    'card',
  ],
  [MODULE_SHEET, '.fabricate-manager .manager-task-required-tools-card', 'card'],
  [
    MODULE_SHEET,
    '.fabricate-manager .manager-drop-editor-card [data-gathering-drop-inspector-rate] ' +
      '.manager-drop-rate-control',
    'card',
  ],
  [
    'src/ui/svelte/apps/manager/gathering-task/GatheringTaskCard.svelte',
    '.manager-task-stamina-card, .manager-task-nodes-card, .manager-task-dc-card, ' +
      '.manager-task-resolution-card, .manager-task-results-card',
    'card',
  ],
]);

test('every rule whose inset hairline was dropped keeps its 1px border', () => {
  const corpus = treeStyles();
  const lost = HAIRLINE_EDGES.flatMap(([file, selector, kind]) => {
    const declared = corpus.declarations
      .filter((d) => d.file === file && oneLine(d.selector) === selector)
      .map((d) => `${d.property.toLowerCase()}: ${normaliseValue(d.value)}`);
    if (declared.length === 0) return [`${file}: ${selector} is no longer a rule`];
    return [
      ...(declared.includes('border: 1px solid var(--fab-border)')
        ? []
        : [`${file}: ${selector} lost its 1px --fab-border`]),
      ...(kind !== 'input' || declared.includes('box-shadow: none')
        ? []
        : [`${file}: ${selector} no longer states box-shadow: none`]),
    ];
  });
  assert.deepEqual(
    lost,
    [],
    'the inset top hairline was dropped because each of these rules already draws its edge as a ' +
      '1px `--fab-border`; without it the surface has no edge at all. An input keeps ' +
      '`box-shadow: none` so no core input shadow surfaces where the hairline used to win'
  );
});

/* ───────────────────────────── surfaces: state fills ───────────────────────────── */

/** A `:not(…)`, one nesting level deep, whose state is negated rather than taken. */
const NEGATION = /:not\((?:[^()]|\([^()]*\))*\)/gu;

/** An attribute selector's optional value, unless it names the state's absence. */
const ON_VALUE = String.raw`(?:=['"]?(?!(?:false|closed|off|unchecked|inactive)['"]?\])[\w-]+['"]?)?\]`;

/** Chosen, pressed, checked, current, open, on, or staged to add or remove. */
const SELECTED_STATE = new RegExp(
  [
    String.raw`\.(?:is-(?:bulk-)?)?selected(?![\w-])`,
    String.raw`\.(?:is-)?active(?![\w-])`,
    String.raw`\.is-(?:on|checked|current|open|chosen|staged|removing)(?![\w-])`,
    String.raw`\[aria-(?:selected|pressed|checked|expanded)=['"]?true['"]?\]`,
    String.raw`\[aria-current${ON_VALUE}`,
    String.raw`\[data-(?:selected|active|state)${ON_VALUE}`,
    String.raw`:checked(?![\w-])`,
  ].join('|'),
  'u'
);

/** The pointer and keyboard focus, which raise a surface as hover does. */
const HOVER_STATE = /:hover(?![\w-])|:focus-(?:visible|within)(?![\w-])/u;

/** The state one selector item paints, `selected` winning over `hover`, or null at rest. */
function stateOf(item) {
  const taken = item.replaceAll(NEGATION, '');
  if (SELECTED_STATE.test(taken)) return 'selected';
  return HOVER_STATE.test(taken) ? 'hover' : null;
}

/** The fill each state takes, beside `none` and `transparent`. */
const STATE_FILL = Object.freeze({
  selected: 'var(--fab-surface-active)',
  hover: 'var(--fab-surface-raised)',
});

/** A state's own fill; an image layer on a state is only ever `none`. */
const isStateFill = (state, value, property = 'background') =>
  property === 'background-image'
    ? value === 'none'
    : [STATE_FILL[state], 'none', 'transparent'].includes(value);

/** Every in-scope, unmarked fill a hover or selected selector item paints. */
function stateFills(corpus) {
  return declarationsOf(corpus, (property) => /^background(?:-color|-image)?$/u.test(property))
    .filter(unmarkedInScope(corpus))
    .map((d) => ({
      ...d,
      value: normaliseValue(d.value),
      states: splitSelectorList(d.selector).map(stateOf).filter(Boolean),
    }))
    .filter((d) => d.states.length > 0);
}

const stateSite = (d) => `${d.file}: ${oneLine(d.selector)} | ${d.value}`;

const COMPONENTS = 'src/ui/svelte/components';
const MANAGER = 'src/ui/svelte/apps/manager';

/**
 * Every in-scope state fill that is not the published rung, by file, selector and fill, with the
 * reason it is the surface's own face: a library specimen's tinted face, a family verb's hover, a
 * mark inside the surface, or a status reading. Review of this list is the classification.
 */
const STATE_TINTS = Object.freeze([
  [
    `${MANAGER}/BulkEditPanelShell.svelte`,
    ':global( .fabricate-manager .fabricate-button.fab-manager-button.fab-bulk-edit-apply:not(:disabled):hover )',
    'var(--fab-accent-strong)',
    'an accent verb deepens in its own family',
  ],
  [
    `${MANAGER}/scoped/WorldToolCataloguePage.svelte`,
    '.manager-world-tool-break-segments label.is-selected',
    'var(--fab-accent)',
    'the library segment specimen’s chosen face',
  ],
  [
    `${COMPONENTS}/Chip.svelte`,
    '.manager-chip.is-active, .manager-chip.is-positive',
    'var(--fab-success-soft)',
    'the `active` status tone, a rest face named like a state',
  ],
  [
    `${COMPONENTS}/Chip.svelte`,
    '.manager-chip-remove:hover:not(:disabled), .manager-chip-remove:focus-visible',
    'var(--fab-danger-soft)',
    'a destructive verb hovers in the danger family it acts in',
  ],
  [
    `${COMPONENTS}/Chip.svelte`,
    '.manager-chip.is-solid:is(.is-active, .is-positive)',
    'var(--fab-success)',
    'the `active` status tone’s solid emphasis, a rest face',
  ],
  [
    `${COMPONENTS}/ChoiceOptionList.svelte`,
    '.fab-choice-option.is-selected',
    'var(--fab-accent-soft)',
    'a single-select answer whose specimen is owed (spec.md:2255, #2257); held until drawn',
  ],
  [
    `${COMPONENTS}/CollapsibleGroupHeader.svelte`,
    '.fab-group-header.is-static:hover',
    'var(--fab-surface-soft)',
    'a static header restates its rest, so it does not raise',
  ],
  [
    `${COMPONENTS}/NavSidebar.svelte`,
    '.fabricate-app-nav-item.active .fabricate-app-nav-well',
    'var(--fab-accent-soft)',
    'the current item’s icon well, a mark inside the surface',
  ],
  [
    `${COMPONENTS}/SegmentedControl.svelte`,
    '.manager-segmented.is-tag .manager-segment.is-active',
    'var(--fab-purple-soft)',
    'the `tag` tone: a track about tags chooses in the tag family',
  ],
  [
    `${COMPONENTS}/SegmentedControl.svelte`,
    '.manager-segmented.is-accent .manager-segment.is-active',
    'var(--fab-accent)',
    'the `accent` tone, the library segment specimen’s chosen face',
  ],
  [
    `${COMPONENTS}/SegmentedControl.svelte`,
    '.manager-segmented.is-accent-soft .manager-segment.is-active',
    'var(--fab-accent-soft)',
    'the `accent-soft` tone, the chosen chip’s face, `.k-chip.sel` (library.html:191)',
  ],
  ...['success', 'info', 'warning', 'danger'].map((family) => [
    `${COMPONENTS}/SegmentedControl.svelte`,
    `.manager-segment.is-active.is-${family}`,
    `var(--fab-${family}-soft)`,
    'a per-option variant: the chosen segment names what choosing it means',
  ]),
  [
    `${COMPONENTS}/ThresholdBandStrip.svelte`,
    '.fab-band-strip-handle.is-dragging .fab-band-strip-grip, .fab-band-strip-handle:hover .fab-band-strip-grip',
    'var(--fab-accent-soft)',
    'a drag grip, a mark that lights while it is grabbed',
  ],
  [
    MODULE_SHEET,
    '.fabricate-manager .manager-checks-card .manager-resolution-mode-card.is-config-cards .manager-resolution-option.is-active .manager-resolution-option-icon',
    'var(--fab-accent-soft)',
    'the chosen card’s icon well, a mark inside the surface',
  ],
  [
    MODULE_SHEET,
    '.fabricate-manager .manager-selected-tag-pill button:hover, .fabricate-manager .manager-selected-tag-pill button:focus-visible',
    'var(--fab-success-soft)',
    'the remove inside a success pill hovers in the pill’s family',
  ],
  [
    MODULE_SHEET,
    '.fabricate-data-table .fabricate-data-table-row.is-selected > .fabricate-data-table-cell:first-child::before',
    'var(--fab-accent)',
    'the selected row’s leading bar, a mark',
  ],
  [
    MODULE_SHEET,
    '.fabricate-icon-button.fabricate-icon-button.is-ghost.is-danger:not(:disabled):hover, .fabricate-icon-button.fabricate-icon-button.is-ghost.is-danger:focus-visible',
    'var(--fab-danger-soft)',
    'a destructive verb hovers in the danger family it acts in',
  ],
  [
    MODULE_SHEET,
    '.fabricate-button.fabricate-button.fab-manager-button.manager-recipe-browser-inspector-edit:not(:disabled):hover, .fabricate-button.fabricate-button.fab-manager-button.manager-recipe-browser-inspector-edit:focus-visible, .fabricate-button.fabricate-button.fab-manager-button.manager-component-browser-inspector-edit:not(:disabled):hover, .fabricate-button.fabricate-button.fab-manager-button.manager-component-browser-inspector-edit:focus-visible',
    'var(--fab-accent-strong)',
    'an accent verb deepens in its own family',
  ],
  [
    MODULE_SHEET,
    '.fabricate-toggle.fabricate-toggle:not(:disabled, .is-disabled, .is-locked):hover .manager-status-toggle-track',
    'color-mix(in srgb, var(--fab-toggle-track) 88%, var(--fab-text))',
    'a switch track lifts toward its ink: a control’s track, not a surface',
  ],
  [
    MODULE_SHEET,
    '.fabricate-option-cards .manager-resolution-option.is-active',
    'var(--fab-accent-soft)',
    'a radio card’s answer: accent-soft under the 3px bar',
  ],
  [
    MODULE_SHEET,
    '.fabricate-manager .manager-recipe-tool-remove:hover',
    'var(--fab-danger-soft)',
    'a destructive verb hovers in the danger family it acts in',
  ],
  [
    MODULE_SHEET,
    '.fabricate-manager .manager-recipe-tag-trigger:hover',
    'var(--fab-purple-soft)',
    'the tag adder rests in the tag family it hovers in',
  ],
  [
    MODULE_SHEET,
    '.fabricate-manager .manager-recipe-option-remove:hover',
    'var(--fab-danger-soft)',
    'a destructive verb hovers in the danger family it acts in',
  ],
  [
    MODULE_SHEET,
    '.fabricate-button.fabricate-button.is-danger.is-armed:not(:disabled):hover',
    'var(--fab-danger)',
    'the armed confirmation holds its solid danger',
  ],
  [
    MODULE_SHEET,
    '.fabricate-button.fabricate-button.is-primary:not(:disabled):hover',
    'var(--fab-success-strong)',
    'the primary verb deepens in its own family',
  ],
  [
    MODULE_SHEET,
    '.fabricate-icon-button.fabricate-icon-button.is-primary:not(:disabled):hover',
    'var(--fab-success-soft)',
    'the primary icon verb fills in the family it inks in',
  ],
  [
    MODULE_SHEET,
    '.fabricate-button.fabricate-button.is-danger:not(:disabled):hover, .fabricate-icon-button.fabricate-icon-button.is-danger:not(:disabled):hover',
    'var(--fab-danger-soft)',
    'the danger verb fills in the family it inks in',
  ],
  [
    MODULE_SHEET,
    '.fabricate-button.fabricate-button.is-warning-action:not(:disabled):hover',
    'var(--fab-warning-soft)',
    'the warning verb keeps its own fill',
  ],
  [
    MODULE_SHEET,
    '.fabricate-pill-select .manager-availability-remove:hover, .fabricate-pill-select .manager-availability-remove:focus-visible, .fabricate-manager .manager-danger-tag-remove:hover, .fabricate-manager .manager-danger-tag-remove:focus-visible',
    'var(--fab-danger-soft)',
    'a destructive verb hovers in the danger family it acts in',
  ],
  [
    MODULE_SHEET,
    '.fabricate-manager .manager-task-required-tools-card-item:hover .manager-task-required-tools-add-icon, .fabricate-manager .manager-task-required-tools-card-item:focus-visible .manager-task-required-tools-add-icon',
    'var(--fab-bg-3)',
    'the add glyph’s chip, a mark inside the item',
  ],
  [
    MODULE_SHEET,
    '.fabricate-manager .manager-tools-authority-segments label.is-selected',
    'var(--fab-accent)',
    'the library segment specimen’s chosen face',
  ],
  [
    MODULE_SHEET,
    '.fabricate-manager[data-manager-view="tools"] .manager-tool-inspector-foot [data-tool-inspector-add]:not(:disabled):hover',
    'var(--fab-success-soft)',
    'a success verb keeps the family it rests in',
  ],
  [
    MODULE_SHEET,
    '.fabricate-button.fabricate-button.fab-manager-button.manager-recipe-browser-inspector-delete:focus-visible, .fabricate-button.fabricate-button.fab-manager-button.manager-component-browser-inspector-delete:focus-visible',
    'var(--fab-danger-soft)',
    'a destructive verb’s focus face, the danger fill its hover takes',
  ],
  ...[
    [`${MANAGER}/BulkStagingInset.svelte`, 'row.is-staged', 'accent-soft', 'add'],
    [`${MANAGER}/BulkStagingInset.svelte`, 'row.is-removing', 'danger-soft', 'remove'],
  ].map(([file, row, fill, verb]) => [
    file,
    `:global(.fab-bulk-inset .fab-bulk-inset-${row})`,
    `var(--fab-${fill})`,
    `the staged ${verb} face, pressed: the reference’s staged pair (proto:5601-5604)`,
  ]),
  ...[
    [`${MANAGER}/BulkStagingInset.svelte`, ':global(.fab-bulk-inset .fab-bulk-inset-box.is-on)'],
    [`${COMPONENTS}/SelectionCheckbox.svelte`, '.fab-selection-check.is-checked'],
  ].map(([file, selector]) => [
    file,
    selector,
    'var(--fab-accent)',
    'the ticked box, `.k-cb.on i` (library.html:181)',
  ]),
  [
    `${COMPONENTS}/LogList.svelte`,
    '.fab-log-list-entry.is-open:not(.is-selected):hover',
    'var(--fab-surface-raised)',
    '`is-open` marks an entry that opens, not an open one, so this is its hover raise',
  ],
  [
    MODULE_SHEET,
    '.fabricate-manager .manager-checks-card .manager-modifier-eligibility.is-on',
    'var(--fab-accent-soft)',
    'the eligibility pill’s pressed face, `.k-chip.sel` (library.html:191)',
  ],
  [
    MODULE_SHEET,
    '.fabricate-manager .manager-checks-card .manager-modifier-eligibility.is-on .manager-modifier-eligibility-dot',
    'var(--fab-accent)',
    'the lit state dot, `.k-dot` (library.html:197): a mark inside the pill',
  ],
  [
    MODULE_SHEET,
    '.fabricate-manager .manager-feature-tile-icon.is-on',
    'var(--fab-bg-3)',
    'the feature’s icon well, filled when on: a mark inside the tile',
  ],
  [
    'src/ui/svelte/apps/crafting/RollPrompt.svelte',
    '.modifier-choice.is-chosen',
    'var(--fab-accent-soft)',
    'the chosen modifier chip’s face, `.k-chip.sel` (library.html:191)',
  ],
  [
    'src/ui/svelte/apps/crafting/RollPrompt.svelte',
    ".modifier-choice input[type='radio']:checked",
    'var(--fab-accent)',
    'the checked radio’s dot, a mark inside the chip',
  ],
  [
    'src/ui/svelte/apps/inventory/bulk/InventoryBulkPanel.svelte',
    '.bulk-remove:hover',
    'var(--fab-danger-soft)',
    'a destructive verb hovers in the danger family it acts in',
  ],
  [
    'src/ui/svelte/apps/inventory/detail/InventoryBookDetail.svelte',
    '.inventory-detail-learn-btn:hover:not(:disabled), .inventory-detail-craft-btn:hover:not(:disabled)',
    'var(--fab-accent)',
    'an accent verb resting on its soft fill deepens in its own family',
  ],
  [
    'src/ui/svelte/apps/journal/StepTimeline.svelte',
    '.journal-step-node.is-current .journal-step-node-marker',
    'var(--fab-accent-soft)',
    'the current step’s marker, a mark inside the timeline',
  ],
  // A flag that is on is a status reading, not a selection: `.k-status.on` (library.html:200).
  ...[
    [
      `${MANAGER}/CraftingEffectPanel.svelte`,
      '.manager-crafting-effect-badge.is-on',
      'success-soft',
    ],
    [`${MANAGER}/PartyExpandedBody.svelte`, '.manager-party-enable-pill.is-on', 'success-soft'],
    [
      MODULE_SHEET,
      '.fabricate-manager .manager-checks-rail .manager-checks-active-card.is-on',
      'success-soft',
    ],
    [
      MODULE_SHEET,
      '.fabricate-toggle-card.manager-recipe-status-card.is-enabled.is-on',
      'success-soft',
    ],
    [
      MODULE_SHEET,
      '.fabricate-toggle-card.manager-recipe-status-card.is-locked.is-on',
      'accent-soft',
    ],
    [MODULE_SHEET, '.fabricate-toggle-card.manager-recipe-status-card.is-info.is-on', 'info-soft'],
    [
      MODULE_SHEET,
      '.fabricate-manager .manager-checks-flag-list .manager-recipe-status-card.is-on',
      'accent-soft',
    ],
    [
      MODULE_SHEET,
      '.fabricate-manager .manager-checks-breakage-trigger .manager-recipe-status-card.is-on',
      'accent-soft',
    ],
    [
      MODULE_SHEET,
      '.fabricate-manager .manager-tool-system-enabled > .manager-recipe-status-card.is-enabled.is-on',
      'surface-soft',
    ],
    [
      `${MANAGER}/ComplicationEffectRow.svelte`,
      '.fab-complication-effect.is-on.is-on-accent',
      'accent-soft',
    ],
    [
      `${MANAGER}/ComplicationEffectRow.svelte`,
      '.fab-complication-effect.is-form-condition.is-on',
      'bg-1',
    ],
  ].map(([file, selector, fill]) => [
    file,
    selector,
    `var(--fab-${fill})`,
    'a flag that is on: a status reading in its own tone, not a selection',
  ]),
]);

test('a selector item reads the state it takes, never the state it negates', () => {
  const cases = [
    ['.row:hover', 'hover'],
    ['.row.is-selected:hover', 'selected'],
    ['.row:not(.is-selected):not(.is-bulk-selected):hover', 'hover'],
    ['.seg:not(.is-active)', null],
    [".row:has(> .open[aria-pressed='true'])", 'selected'],
    [".row:has(> .open:enabled:hover:not([aria-pressed='true']))", 'hover'],
    ['.nav-item.active .well', 'selected'],
    ['.toggle:not(:disabled, .is-locked):hover .track', 'hover'],
    ['.fabricate-manager .manager-checks-active-card', null],
    ['.row.is-active-filter', null],
    [".option[aria-checked='true']", 'selected'],
    ['.nav a[aria-current="page"]', 'selected'],
    ['.trigger[aria-expanded="true"]', 'selected'],
    ["[data-state='open'] > .panel", 'selected'],
    ['.tab[data-selected]', 'selected'],
    ['.card.is-on', 'selected'],
    ['.slot.is-open', 'selected'],
    ['.row.is-staged', 'selected'],
    ['.row.is-removing', 'selected'],
    ['.option.selected', 'selected'],
    ['.option:focus-visible', 'hover'],
    ['.field:focus-within', 'hover'],
    ['.nav a[aria-current="false"]', null],
    ['.trigger[aria-expanded="false"]', null],
    ["[data-state='closed'] > .panel", null],
    ["[data-active-option='true']", null],
    ['.badge.is-online', null],
    ['.list.selected-count', null],
    ['.zone.is-drop-active', null],
  ];
  assert.deepEqual(
    cases.map(([item]) => [item, stateOf(item)]),
    cases
  );
});

/** Every state fill off its rung, as `file: selector | fill`. */
const offRungFills = (corpus) =>
  stateFills(corpus)
    .filter((d) => d.states.some((state) => !isStateFill(state, d.value, d.property.toLowerCase())))
    .map(stateSite)
    .sort(byCodePoint);

/** Every surface rung a state selector redefines rather than takes. */
const redefinedRungs = (corpus) =>
  declarationsOf(corpus, (property) => property.startsWith('--fab-surface-'))
    .filter(unmarkedInScope(corpus))
    .filter((d) => splitSelectorList(d.selector).some(stateOf))
    .map(scopeSite);

const pinnedSites = (pins) =>
  pins.map(([file, selector, value]) => `${file}: ${selector} | ${value}`).sort(byCodePoint);

// Absolute and pinned: rest, then `raised` under the pointer, then `active` once chosen.
test('no state fill in the sheet and every scoped block leaves its rung unlisted', () => {
  const corpus = treeStyles();
  const read = stateFills(corpus).length;
  assert.ok(read >= 140, `only ${read} in-scope state fills were read`);
  assert.deepEqual(
    offRungFills(corpus),
    pinnedSites(STATE_TINTS),
    'a hovered surface raises to `--fab-surface-raised`, and a selected or pressed one takes ' +
      '`--fab-surface-active` behind its accent edge. Another fill is listed in STATE_TINTS with ' +
      'the reason it is that surface’s own face; a site tint, a literal or a neutral off-rung ' +
      'token is not one'
  );
  assert.deepEqual(
    redefinedRungs(corpus),
    [],
    'a state takes a surface rung; it does not redefine one under its own selector'
  );
});

/** A tint family a token belongs to, its `-soft`, `-border`, `-text` and `--fab-on-*` included. */
const FAMILY = /--fab-(?:on-)?(accent|success|info|warning|danger|purple)(?!\w)/gu;
const FAMILY_PROPERTIES = /^(?:background(?:-color|-image)?|border(?:-color)?|color)$/u;
const EDGE = /^border(?:-color)?$/u;

/** A drop target's lit face: not a selection, so off the rungs, but still one family. */
const DROP_STATE = /\.is-drop-active(?![\w-])/u;
const takesState = (item) =>
  stateOf(item) !== null || DROP_STATE.test(item.replaceAll(NEGATION, ''));

const familiesOf = (declarations) =>
  new Set(declarations.flatMap((d) => [...d.value.matchAll(FAMILY)].map((match) => match[1])));

/** Every in-scope state rule's fill, edge and ink declarations, keyed by rule. */
function stateRules(corpus) {
  const rules = new Map();
  const unmarked = unmarkedInScope(corpus);
  for (const d of declarationsOf(corpus, (property) => FAMILY_PROPERTIES.test(property))) {
    if (!unmarked(d) || !splitSelectorList(d.selector).some(takesState)) continue;
    const key = `${d.file}:${d.line} ${d.selector}`;
    rules.set(key, [...(rules.get(key) ?? []), d]);
  }
  return [...rules.values()];
}

/** Every state rule whose fill, edge and ink name more than one tint family. */
const mixedFamilies = (corpus) =>
  stateRules(corpus).flatMap((declarations) => {
    const families = familiesOf(declarations);
    const { file, selector } = declarations[0];
    return families.size > 1
      ? [`${file}: ${oneLine(selector)} | ${[...families].join(' + ')}`]
      : [];
  });

// A state draws one family whole: a success fill under an accent edge is two answers at once.
test('no state rule in the sheet and every scoped block mixes two tint families', () => {
  const corpus = treeStyles();
  const read = stateRules(corpus).length;
  assert.ok(read >= 200, `only ${read} in-scope state rules were read`);
  assert.deepEqual(
    mixedFamilies(corpus),
    [],
    'a state takes its fill, edge and ink from one family'
  );
});

/** A hover that keeps a rung fill under a tinted edge, with the reason the edge is its own. */
const HOVER_EDGE_TINTS = Object.freeze(
  [
    '.fabricate-button.fabricate-button.is-dashed:not(:disabled):hover',
    '.fabricate-button.fabricate-button.fab-manager-button.is-dashed:not(:disabled):hover',
  ].map((selector) => [
    MODULE_SHEET,
    selector,
    'var(--fab-accent-border)',
    'the dashed adder’s hover edge, `.k-btn.dashed:hover` (library.html:134)',
  ])
);

/** Every tinted edge a hover draws over a fill that stays on the hover rung. */
const tintedHoverEdges = (corpus) =>
  stateRules(corpus)
    .flatMap((declarations) => {
      const { file, selector } = declarations[0];
      const states = splitSelectorList(selector).map(stateOf);
      const fills = declarations.filter((d) => d.property.toLowerCase().startsWith('background'));
      const neutral =
        fills.length > 0 &&
        fills.every((d) => isStateFill('hover', normaliseValue(d.value), d.property.toLowerCase()));
      if (!states.includes('hover') || states.includes('selected') || !neutral) return [];
      return declarations
        .filter((d) => EDGE.test(d.property.toLowerCase()) && familiesOf([d]).size > 0)
        .map((d) => `${file}: ${oneLine(selector)} | ${normaliseValue(d.value)}`);
    })
    .sort(byCodePoint);

// Decision 5's rule: a neutral hover fill under a tinted edge reads as a site tint.
test('no hover in the sheet and every scoped block tints its edge over a rung fill unlisted', () => {
  assert.deepEqual(
    tintedHoverEdges(treeStyles()),
    pinnedSites(HOVER_EDGE_TINTS),
    'a hover over a rung fill takes the neutral `--fab-border-strong` edge; a tinted one is listed ' +
      'in HOVER_EDGE_TINTS with the specimen that draws it'
  );
});

test('each surface check reads every channel a state can tint through', () => {
  const css = [
    ".a[aria-checked='true'] { background: var(--fab-accent-soft); }",
    '.b:focus-visible { background: var(--fab-success-soft); }',
    '.c:hover { background-image: linear-gradient(var(--fab-bg-1), var(--fab-bg-2)); }',
    '.d:hover { background-image: none; background: var(--fab-surface-raised); }',
    '.e.is-on { --fab-surface-active: var(--fab-accent-soft); }',
    '.f.is-drop-active { border-color: var(--fab-accent); background: var(--fab-success-soft); }',
    '.g.is-checked { border-color: var(--fab-accent-border); color: var(--fab-success-text); }',
    '.h:hover { border-color: var(--fab-warning-border); background: var(--fab-surface-raised); }',
    '.i:hover { border-color: var(--fab-accent); }',
  ].join('\n');
  const corpus = styleCorpusOf(() => css, [MODULE_SHEET]);
  const at = (rule) => `${MODULE_SHEET}: ${rule}`;
  assert.deepEqual(offRungFills(corpus), [
    at(".a[aria-checked='true'] | var(--fab-accent-soft)"),
    at('.b:focus-visible | var(--fab-success-soft)'),
    at('.c:hover | linear-gradient(var(--fab-bg-1), var(--fab-bg-2))'),
  ]);
  assert.deepEqual(redefinedRungs(corpus), [at('.e.is-on | var(--fab-accent-soft)')]);
  assert.deepEqual(mixedFamilies(corpus), [
    at('.f.is-drop-active | accent + success'),
    at('.g.is-checked | accent + success'),
  ]);
  assert.deepEqual(tintedHoverEdges(corpus), [at('.h:hover | var(--fab-warning-border)')]);
});

/* ────────────────────────── gate 5: native <select> ────────────────────────── */

const SELECT_GUIDANCE =
  'Every select renders the app’s own option list — a native `<select>` draws the OPERATING ' +
  'SYSTEM’s drop-down, which carries none of the app’s type, colour or spacing and cannot be ' +
  'themed at all. Use the shared picker. Where a surface genuinely cannot host a Svelte ' +
  'component, write `<!-- ratchet-exempt(design-system): your reason -->` on the line above the ' +
  'element and the gate will accept it.';

test('a reasoned marker above a native <select> exempts it, and prose or distance does not', () => {
  // BOTH POLARITIES, SYNTHETIC, because no file in the tree carries the marker.
  const select = '<select bind:value={choice}><option>a</option></select>';
  const exempt = (lines) => exemptAt('src/ui/svelte/Probe.svelte', lines.join('\n'), lines.length);
  const reason = '<!-- ratchet-exempt(design-system): a DialogV2 body hosts no component -->';

  assert.ok(exempt([reason, select]), 'the marker admits the element beneath it');
  assert.ok(
    !exempt(['<!-- A plain comment saying nothing about a native select. -->', select]),
    'an unrelated comment must not exempt anything'
  );
  assert.ok(
    !exempt(['<!-- This component renders a native select on purpose. -->', select]),
    'prose describing a native select is not the marker, so a docblock explaining a decision ' +
      'cannot exempt an element by accident'
  );
  assert.ok(
    !exempt([reason, '<div>', '</div>', select]),
    'the marker reaches only the element right below it and the comments between, or one ' +
      'comment at the top of a file exempts every element in it'
  );
  assert.ok(
    !exempt(['<!-- ratchet-exempt(design-system): -->', select]),
    'a marker with no reason exempts nothing'
  );
});

test('a converted select file renders no native <select>, marked or not', () => {
  // THE THIRD POLARITY (issue 1504), and the one the two clauses above cannot express: a marker
  // pays the ratchet while the operating system's drop-down goes on shipping. The scan reads the
  // template, not the markers, so a marked `<select>` in one of these files still fails here.
  const CONVERTED = [
    'src/ui/svelte/components/Select.svelte',
    'src/ui/svelte/components/Pagination.svelte',
    'src/ui/svelte/apps/manager/BulkEditSelect.svelte',
    'src/ui/svelte/apps/manager/scoped/EntityListInspectorFrame.svelte',
    'src/ui/svelte/apps/crafting/RecipeBrowser.svelte',
    'src/ui/svelte/apps/inventory/InventoryFilters.svelte',
    'src/ui/svelte/apps/inventory/detail/InventoryBookDetail.svelte',
    'src/ui/svelte/apps/inventory/detail/InventorySystemSelector.svelte',
    'src/ui/svelte/apps/journal/JournalListShell.svelte',
    // The relocated manager selects (issue 1777).
    'src/ui/svelte/apps/manager/SystemBrowserInspector.svelte',
    'src/ui/svelte/apps/manager/environment/GatheringModifierEditor.svelte',
    'src/ui/svelte/apps/manager/environment/GatheringRulesInspector.svelte',
  ];
  const probe = '<!-- ratchet-exempt(design-system): a probe -->\n<select></select>';
  assert.equal(
    nativeSelectSites(templatesOf(() => probe, ['src/ui/svelte/Probe.svelte'])).length,
    1,
    'the scan must count a marked native `<select>`, or every file below passes on nothing'
  );
  const { readFile } = workingTree(TEMPLATE_CORPUS);
  for (const file of CONVERTED) {
    const source = readFile(file);
    assert.ok(
      typeof source === 'string',
      `${file} is not in the source walk, so this clause is checking nothing. Either the file ` +
        'moved — retarget this list — or the walk has stopped reading `.svelte`.'
    );
    assert.deepEqual(
      nativeSelectSites(templatesOf(readFile, [file])).map((site) => site.line),
      [],
      `${file} renders a native \`<select>\` again. It was converted to the app’s own option ` +
        'list; render `<Select>`, and a `ratchet-exempt(design-system)` marker does not excuse ' +
        'it here.'
    );
  }
});

const NATIVE_SELECT_GATE = templateGate((templates) =>
  nativeSelectSites(templates).map((site) => ({ ...site, id: 'native <select>' }))
);

test('no new native <select> is rendered by a Svelte template', (t) => {
  assertFloor('native `<select>` elements', treeTemplates().length, 250);
  checkGate(t, NATIVE_SELECT_GATE, SELECT_GUIDANCE);
});

/** The template-string channel: `<select>` written into a JavaScript dialog body. */
function nativeSelectsInJavaScript(readFile, files) {
  const found = [];
  for (const file of files) {
    if (!MODULE_CORPUS.include(file)) continue;
    for (const [index, text] of stripComments(readFile(file)).split('\n').entries()) {
      if (/<select[\s>]/iu.test(text)) {
        found.push({ file, line: index + 1, id: 'native <select> in a template string' });
      }
    }
  }
  return found;
}

const JS_SELECT_GATE = gateOver([MODULE_CORPUS], nativeSelectsInJavaScript);

test('no new native <select> is written into a JavaScript template string', (t) => {
  // THE CHANNEL THE TEMPLATE WALK CANNOT SEE. A DialogV2 body is an HTML string built in a `.js`
  // module, so `svelte/compiler` never reads it and the clause above is blind to every one of them.
  assertFloor(
    'native `<select>` in JavaScript template strings',
    workingTree(MODULE_CORPUS).listFiles().length,
    250
  );
  checkGate(
    t,
    JS_SELECT_GATE,
    'These are DialogV2 bodies, which cannot host a Svelte component and so cannot use the ' +
      'app’s own option list. A NEW one is a new surface built on a dialog, and the question to ' +
      'answer first is whether it should be an application window instead; where it must stay ' +
      'a dialog, a `// ratchet-exempt(design-system): <reason>` above the line says why.'
  );
});

/** The three DialogV2 bodies that keep a native select, with the body each renders (issue 1779). */
const DIALOG_SELECT_BODIES = Object.freeze({
  'src/canvas/environmentDialog.js': [
    '<div class="fabricate-canvas-env-dialog">',
    '    <p>FABRICATE.Canvas.Interactable.EnvironmentDialogHint</p>',
    '    <label>FABRICATE.Canvas.Interactable.EnvironmentDialogLabel',
    '      <select name="environmentId"><option value="cave" selected>Cave</option></select>',
    '    </label>',
    '    <p class="fabricate-canvas-env-dialog-modifier-hint">FABRICATE.Canvas.Interactable.DropModifierHint</p>',
    '  </div>',
  ].join('\n'),
  'src/ui/compendiumDirectoryContext.js': [
    '',
    '    <div class="fabricate-compendium-import">',
    '      <p>FABRICATE.Admin.Items.CompendiumImportDialogPrompt</p>',
    '      <select name="systemId" style="width: 100%;"><option value="s1" selected>One</option></select>',
    '    </div>',
  ].join('\n'),
  'src/ui/foundryCompat.js': [
    '',
    ' '.repeat(4),
    '    <div class="form-group">',
    '      <label for="fabricate-recipe-select">Pick</label>',
    '      <select id="fabricate-recipe-select" name="recipe" aria-label="Pick"><option value="r1" selected>R1</option></select>',
    '    </div>',
  ].join('\n'),
});

/** The `content` each dialog hands a stubbed `DialogV2`, keyed by its file. */
async function capturedDialogBodies() {
  const bodies = [];
  class StubDialogV2 {
    constructor(options) {
      bodies.push(options.content);
      options.close?.();
    }
    render() {}
    static async prompt({ content }) {
      bodies.push(content);
    }
    static async wait({ content }) {
      bodies.push(content);
    }
  }
  const env = installFoundryBridgeEnv({ dialog: StubDialogV2 });
  try {
    const { promptDropEnvironment } = await import('../../src/canvas/environmentDialog.js');
    const { promptSelectCraftingSystem } =
      await import('../../src/ui/compendiumDirectoryContext.js');
    const { selectDialog } = await import('../../src/ui/foundryCompat.js');
    const localize = (key) => key;
    await promptDropEnvironment({ environments: [{ id: 'cave', name: 'Cave' }], localize });
    await promptSelectCraftingSystem([{ id: 's1', name: 'One' }], { localize });
    await selectDialog({
      title: 'T',
      options: [{ value: 'r1', label: 'R1' }],
      selectLabel: 'Pick',
    });
  } finally {
    env.restore();
  }
  return Object.fromEntries(Object.keys(DIALOG_SELECT_BODIES).map((file, i) => [file, bodies[i]]));
}

test('each JavaScript dialog select is its own statement under a reasoned marker', async () => {
  const files = Object.keys(DIALOG_SELECT_BODIES);
  const { readFile } = workingTree(MODULE_CORPUS);
  const sites = nativeSelectsInJavaScript(readFile, files);
  assert.deepEqual(
    sites.map((site) => site.file),
    files,
    'each dialog file reports exactly one select line, so the marker check below is not vacuous'
  );
  for (const { file, line } of sites) {
    assert.ok(
      siteMarker(file, readFile(file), DESIGN_SYSTEM_FAMILY, line),
      `${file}:${line} has no reasoned \`// ratchet-exempt(design-system)\` on or directly above it`
    );
  }
  const bodies = await capturedDialogBodies();
  for (const [file, body] of Object.entries(DIALOG_SELECT_BODIES)) {
    assert.equal(bodies[file], body, `${file} renders the same dialog body, byte for byte`);
    assert.doesNotMatch(bodies[file], /ratchet-exempt/u, `${file} leaks its marker into the body`);
  }
});

/* ─────────────────────────────── gate 6: radii ─────────────────────────────── */

/** `border-radius` and its eight corner longhands, physical and logical. */
const RADIUS_PROPERTY =
  /^border-(?:(?:top|bottom)-(?:left|right)-|(?:start|end)-(?:start|end)-)?radius$/u;

/** The published radius ladder, plus the two keywords that defer rather than choose. */
const RADIUS_LADDER = Object.freeze(['0', '6px', '7px', '9px', '11px', '999px', '50%', 'inherit']);

/** A shorthand value split into the corner values it sets. */
function radiusTokens(value) {
  const tokens = [];
  let depth = 0;
  let current = '';
  for (const character of value) {
    if (character === '(') depth += 1;
    if (character === ')') depth -= 1;
    if (depth === 0 && (character === ' ' || character === '/')) {
      if (current) tokens.push(current);
      current = '';
      continue;
    }
    current += character;
  }
  if (current) tokens.push(current);
  return tokens;
}

/**
 * Whether one corner value is on the ladder, resolving `var()` through the corpus.
 *
 * @returns {{ok: boolean, resolved: string|null}} `resolved` names the offending value when the
 */
function radiusCompliance(token, definitions) {
  if (RADIUS_LADDER.includes(token)) return { ok: true, resolved: null };
  if (!/var\(/u.test(token)) return { ok: false, resolved: null };
  const candidates = resolveValueCandidates(token, definitions)
    .candidates.filter((candidate) => !candidate.includes('var('))
    .sort(byCodePoint);
  if (candidates.length === 0) return { ok: false, resolved: null };
  const offending = candidates.filter((candidate) => !RADIUS_LADDER.includes(candidate));
  return offending.length === 0
    ? { ok: true, resolved: null }
    : { ok: false, resolved: offending[0] };
}

/** Every `border-radius` and corner longhand in the corpus. */
const radiusDeclarations = (corpus) =>
  declarationsOf(corpus, (property) => RADIUS_PROPERTY.test(property));

/**
 * Every off-ladder corner value in the corpus, resolving `var()` against the corpus's own
 * definitions, keyed `property: value` and netted on the value.
 */
function offLadderRadii(corpus) {
  const findings = [];
  for (const declaration of radiusDeclarations(corpus)) {
    for (const token of radiusTokens(normaliseValue(declaration.value))) {
      const { ok, resolved } = radiusCompliance(token, corpus.definitions);
      if (ok) continue;
      const value = resolved === null ? token : `${token} => ${resolved}`;
      const property = declaration.property.toLowerCase();
      findings.push({
        file: declaration.file,
        line: declaration.at,
        id: `off-ladder ${property}: ${value}`,
        value: `off-ladder radius ${value}`,
      });
    }
  }
  return findings;
}

const RADIUS_GATE = styleGate(offLadderRadii);

test('a radius written into a token still resolves, so the ladder cannot be paid by renaming', () => {
  // The proof runs on synthetic definitions so it never depends on the tree.
  const definitions = new Map([
    ['--fixture-off', ['5px']],
    ['--fixture-on', ['6px']],
    ['--fixture-themed', ['6px', '10px']],
  ]);

  assert.deepEqual(radiusCompliance('var(--fixture-off)', definitions), {
    ok: false,
    resolved: '5px',
    // The offender is keyed `raw => resolved` for exactly this.
  });
  assert.deepEqual(radiusCompliance('var(--fixture-on)', definitions), {
    ok: true,
    resolved: null,
  });
  assert.deepEqual(
    radiusCompliance('var(--fixture-themed)', definitions),
    { ok: false, resolved: '10px' },
    'a token defined twice is TWO answers and the cascade picks between them, so it is compliant ' +
      'only when both are on the ladder'
  );
  assert.deepEqual(
    radiusCompliance('var(--fixture-undefined, 6px)', definitions),
    { ok: true, resolved: null },
    'a token this corpus never defines contributes its FALLBACK, which is the only value a ' +
      'stylesheet reader can see — one live component sets its radius from markup this way'
  );
  assert.deepEqual(radiusCompliance('6px', definitions), { ok: true, resolved: null });
  assert.deepEqual(radiusCompliance('8px', definitions), { ok: false, resolved: null });
  assert.deepEqual(
    radiusTokens('6px / var(--fixture-on, 1px 2px)'),
    ['6px', 'var(--fixture-on, 1px 2px)'],
    'the shorthand splits on the slash as well as the space, and never inside a `var()`'
  );
});

test('no corner radius leaves the published ladder', (t) => {
  assertFloor('off-ladder corner radii', radiusDeclarations(treeStyles()).length, 500);
  checkGate(
    t,
    RADIUS_GATE,
    'Geometry comes from the published ladders. The radius ladder is 6px, 7px, 9px and 11px, ' +
      'plus `0`, `999px` for a pill and `50%` for a circle — 8px is not on it however natural it ' +
      'looks beside a 16px inset. Pick the nearer rung. Writing the value into a custom property ' +
      "does not help: this scan resolves `var()` against the same side's definitions, so the " +
      'offender survives with its text changed.'
  );
});

/* ─────────── gate 6, by kind: a sized box takes its own size band's corner ─────────── */

/** The band a box of `px` takes on the radius ladder, or `null` for a size the spec gives none. */
function cornerBand(px) {
  const corner = bandCorner(px);
  return corner === null ? null : `${corner}px`;
}

/** A corner that names a shape rather than a band: square, a pill or track, a circle. */
const SHAPE_CORNERS = Object.freeze(['0', '999px', '50%', 'inherit']);

/** Sized rules whose corner follows another kind: `[file: selector, its corners, why]`. */
const CORNER_KIND_EXCEPTIONS = Object.freeze([
  [
    'src/ui/svelte/components/Chip.svelte: .manager-chip',
    ['11px'],
    'a text chip keeps its stadium',
  ],
  [
    'src/ui/svelte/components/LogList.svelte: .fab-log-list-entry',
    ['9px'],
    'LogList geometry is issue 2257',
  ],
  [
    'src/ui/svelte/components/NavSidebar.svelte: .fabricate-app-nav-well',
    ['9px'],
    'NavSidebar geometry is issue 2257',
  ],
  [
    'src/ui/svelte/components/SegmentedControl.svelte: .manager-segmented.is-compact .manager-segment',
    ['6px'],
    "a segment takes its track's inner rung",
  ],
  [
    'src/ui/svelte/components/SegmentedControl.svelte: .manager-segmented.is-field .manager-segment',
    ['6px'],
    "a segment takes its track's inner rung",
  ],
  [
    'styles/fabricate.css: .fabricate-manager .manager-tag-suggestion, .fabricate-typeahead-option.fabricate-typeahead-option',
    ['6px'],
    "an option takes its 6px panel's inner rung",
  ],
  [
    'styles/fabricate.css: .fabricate-manager .manager-recipe-option-suggestion',
    ['6px'],
    "an option takes its suggestion panel's inner rung",
  ],
  [
    'styles/fabricate.css: .fabricate-manager .manager-availability-option',
    ['6px'],
    "an option takes its 6px panel's inner rung",
  ],
  [
    'styles/fabricate.css: .fabricate-dice-tiles__tile',
    ['9px'],
    "the library's DiceTiles specimen: 44 high at radius 9",
  ],
  [
    'styles/fabricate.css: .fabricate-manager .manager-tools-authority-segments label',
    ['6px'],
    "a segment takes its track's inner rung",
  ],
]);

/** The box sizes a rule can declare; a logical name is read as its physical twin. */
const SIZE_PROPERTIES = Object.freeze([
  'height',
  'block-size',
  'min-height',
  'min-block-size',
  'width',
  'inline-size',
]);

/** A length in px: a px literal, or rem at Foundry's default 16px root; anything else is `null`. */
function lengthPx(text) {
  const match = /^(\d+(?:\.\d+)?)(px|rem)$/u.exec(text);
  return match ? Number(match[1]) * (match[2] === 'rem' ? 16 : 1) : null;
}

/** The literal texts a value stands for through `var()`, with any unresolved text dropped. */
const literalValues = (value, definitions) =>
  value.includes('var(')
    ? resolveValueCandidates(value, definitions).candidates.filter((text) => !text.includes('var('))
    : [value];

/** Each size with a band that one rule declares, as `{ declaration, px, band }`. */
const bandedSizes = (rule, definitions) =>
  rule
    .filter((d) => SIZE_PROPERTIES.includes(d.property.toLowerCase()))
    .flatMap((declaration) =>
      literalValues(normaliseValue(declaration.value), definitions).map((text) => {
        const px = lengthPx(text);
        return { declaration, px, band: px === null ? null : cornerBand(px) };
      })
    )
    .filter(({ band }) => band !== null);

/** Every corner value a rule's radius shorthands and longhands resolve to. */
const cornersOf = (radii, definitions) => [
  ...new Set(
    radii.flatMap((d) =>
      radiusTokens(normaliseValue(d.value)).flatMap((token) =>
        literalValues(token, definitions).flatMap(radiusTokens)
      )
    )
  ),
];

/**
 * Every in-scope rule pairing a banded size with a corner off its band, and how many paired rules
 * were judged. Read: each `height`, `min-height` and `width` (logical twins too) in px, in rem at
 * Foundry's 16px root or through `var()`; every radius shorthand and longhand. A marker exempts
 * only the radius or size declaration it sits on. Unseen, so the rendered corner audit holds them:
 * a size and a corner split across two rules, an inherited corner, a size set by markup or a
 * prop, and a `calc()` size.
 */
function offBandCorners({ declarations, definitions, sources }) {
  const rules = new Map();
  for (const declaration of declarations) {
    if (!SWEEP_SCOPE.test(declaration.file)) continue;
    const key = `${declaration.file}: ${declaration.selector}\u{0}${declaration.line}`;
    rules.set(key, [...(rules.get(key) ?? []), declaration]);
  }
  const found = [];
  let evaluated = 0;
  for (const [key, rule] of rules) {
    const radii = rule.filter((d) => RADIUS_PROPERTY.test(d.property.toLowerCase()));
    const sizes = radii.length > 0 ? bandedSizes(rule, definitions) : [];
    if (sizes.length === 0) continue;
    evaluated += 1;
    const corners = cornersOf(radii, definitions);
    const misses = sizes.filter(({ band }) =>
      corners.some((corner) => corner !== band && !SHAPE_CORNERS.includes(corner))
    );
    if (misses.length === 0) continue;
    found.push({
      key: key.split('\u{0}', 1)[0],
      line: radii.at(-1).at,
      corners: corners.filter((corner) => !SHAPE_CORNERS.includes(corner)),
      label: misses
        .map(({ declaration, px, band }) => `${declaration.property} ${px}px, band ${band}`)
        .join('; '),
      exempt: [...radii, ...misses.map(({ declaration }) => declaration)].some((d) =>
        exemptAt(d.file, sources[d.file], d.at)
      ),
    });
  }
  return { found, evaluated };
}

/** Residue rules sized off the band table, whose corner the pair check therefore cannot see. */
const PINNED_CORNERS = Object.freeze([
  ['.fabricate-field.fabricate-field textarea', '9px', 'a Field textarea is a well'],
  ['.fabricate-manager .manager-gathering-event-edit-view textarea', '9px', 'a well'],
  ['.fabricate-manager .manager-gathering-task-edit-view textarea', '9px', 'a well'],
  [
    '.fabricate-manager .manager-gathering-events-table .manager-gathering-event-identity .manager-gathering-event-thumb',
    '11px',
    "the 64px event thumb, at the environments table's 64px corner",
  ],
]);

/** How many times each key occurs in `keys`. */
const tally = (keys) =>
  keys.reduce((counts, key) => counts.set(key, (counts.get(key) ?? 0) + 1), new Map());

// Absolute, not against the base: a 38px box at 6px is on the ladder, so gate 6 passes it.
test('every sized box in the sheet and every scoped block takes its size band’s corner', () => {
  const corpus = treeStyles();
  const { found, evaluated } = offBandCorners(corpus);
  // Non-vacuity first, so a scan that stopped reading reports as broken rather than as rot.
  assert.ok(evaluated >= 200, `only ${evaluated} sized rules with a corner were judged`);
  const live = found.filter(({ exempt }) => !exempt);
  const excused = ({ key, corners }) =>
    CORNER_KIND_EXCEPTIONS.some(
      ([name, allowed]) => name === key && corners.every((corner) => allowed.includes(corner))
    );
  const unexplained = live
    .filter((finding) => !excused(finding))
    .map(({ key, line, corners, label }) => `${key} (line ${line}): ${corners} for ${label}`);
  assert.deepEqual(
    unexplained,
    [],
    'a box that declares its size declares the corner of that size band — 6 for a chip at or ' +
      'under 24px, 7 for 26 to 32, 9 for 34 to 38, 11 at 44 — or a shape (0, 999px, 50%). Put the ' +
      'band in the rule that sizes the box, or name the kind and its corner here:\n  ' +
      unexplained.join('\n  ')
  );

  // Each exception matches as many off-band rules as it is listed for, so the list can neither
  // rot into cover nor shelter a second rule under a name it already excuses.
  const listed = tally(CORNER_KIND_EXCEPTIONS.map(([key]) => key));
  const matched = tally(live.map(({ key }) => key));
  assert.deepEqual(
    [...listed].filter(([key, count]) => matched.get(key) !== count).map(([key]) => key),
    [],
    'these exceptions match a different number of off-band rules than they list: re-derive them'
  );

  for (const [selector, corner, why] of PINNED_CORNERS) {
    const rule = corpus.rules.find((r) => r.file === MODULE_SHEET && r.selector === selector);
    assert.ok(rule, `${selector} is still a rule of the sheet`);
    const declared = declarationsIn(MODULE_SHEET, rule.body).findLast(
      (d) => d.property === 'border-radius'
    );
    assert.equal(declared?.value, corner, `${selector} declares ${corner}: ${why}`);
  }
});

/** The two size ladders `design-system/spec.md` publishes: a record's art and an actor's portrait. */
const SIZE_LADDERS = Object.freeze({
  art: new Set([22, 26, 30, 38]),
  portrait: new Set([26, 32]),
});

/** The components that ARE the art tile, each with its own default size and the ladder it is held to. */
const ART_TILE_COMPONENTS = new Map([
  ['Medallion', { kind: 'art', defaultSize: 40 }],
  ['Avatar', { kind: 'portrait', defaultSize: 32 }],
]);

/**
 * The art-tile component each local name in `source` imports, keyed by that LOCAL name, so an
 * aliased import (`import Portrait from '../components/Avatar.svelte'`) is still held to its ladder.
 */
function artTileImports(source) {
  const locals = new Map();
  for (const match of source.matchAll(
    /import\s+(\w+)\s+from\s+['"][^'"]*\/(Medallion|Avatar)\.svelte['"]/gu
  )) {
    locals.set(match[1], match[2]);
  }
  return locals;
}

/**
 * Every art-tile render site, as `{ file, line, kind, size }` with `size` a number or `dynamic`.
 *
 * @returns {{ file: string, line: number, kind: 'art'|'portrait', size: number|'dynamic' }[]}
 */
function artTileSizes(templates) {
  const found = [];
  for (const { file, source, ast } of templates) {
    const imports = artTileImports(source);
    walkElements(ast.fragment ?? ast, (element) => {
      if (element.type !== 'Component' || !imports.has(element.name)) return;
      const { kind, defaultSize } = ART_TILE_COMPONENTS.get(imports.get(element.name));
      const text = attributeText(source, element, 'size');
      const line = lineOf(source, element.start);
      // An absent `size` takes the primitive's OWN default.
      if (text === null) {
        found.push({ file, line, kind, size: defaultSize });
        return;
      }
      const literal = /^size=\{\s*(\d+(?:\.\d+)?)\s*\}$/u.exec(text);
      found.push({ file, line, kind, size: literal ? Number(literal[1]) : 'dynamic' });
    });
  }
  return found;
}

const isOnLadder = (site) => SIZE_LADDERS[site.kind].has(site.size);

const ART_SIZE_GATE = templateGate((templates) =>
  artTileSizes(templates)
    .filter((site) => !isOnLadder(site))
    .map(({ file, line, kind, size }) => ({
      file,
      line,
      size,
      id: `off-ladder ${kind} size ${size}`,
    }))
);

test('each art tile is held to its own kind of ladder', () => {
  const fixture = templatesOf(
    () =>
      "<script>import Avatar from '../components/Avatar.svelte';" +
      "import Medallion from './Medallion.svelte';" +
      "import Portrait from '../components/Avatar.svelte';</script>" +
      '<Avatar size={32} /><Avatar size={38} /><Avatar size={size} />' +
      '<Medallion size={38} /><Medallion size={32} /><Medallion />' +
      '<Portrait size={50} />',
    ['src/ui/svelte/Fixture.svelte']
  );
  assert.deepEqual(
    artTileSizes(fixture)
      .filter((site) => !isOnLadder(site))
      .map((site) => `${site.kind} ${site.size}`),
    ['portrait 38', 'portrait dynamic', 'art 32', 'art 40', 'portrait 50'],
    'a portrait at its 32px rung is on its ladder and a 38px portrait is not, while a record tile ' +
      'is held to the art ladder and its 40px default is off it, and an aliased import is held to the ladder of the file it imports'
  );
});

test('no new art tile renders at an off-ladder size', (t) => {
  const sites = artTileSizes(treeTemplates());

  // Non-vacuity: a scan that had stopped recognising a tile's component name would report every
  // base offender of that kind as paid down rather than the scan as broken.
  for (const kind of Object.keys(SIZE_LADDERS)) {
    assert.ok(
      sites.some((site) => site.kind === kind && isOnLadder(site)),
      `no ${kind} tile in the tree renders at a published rung, so the ladder this gate filters ` +
        'that kind against is matching nothing and every site would be recorded as debt'
    );
  }
  // Per kind, near the tree's 66 Medallion and 4 Avatar sites.
  for (const [kind, floor] of [
    ['art', 62],
    ['portrait', 3],
  ]) {
    const scanned = sites.filter((site) => site.kind === kind).length;
    assertFloor(`off-ladder ${kind}-tile sizes`, scanned, floor);
  }
  checkGate(
    t,
    ART_SIZE_GATE,
    'Art and portraits carry their own size ladders — art at 22, 26, 30 and 38, default 26; a ' +
      'portrait at 32 alone and 26 stacked — and this ' +
      'gate fails a render site off its ladder that the base commit does not have. A new one is not ' +
      'automatically wrong: restricting `size` would move almost every art tile in the app, so ' +
      'the geometry sweep owns that correction. What a new site does mean is that a decision was ' +
      'taken about one tile in isolation, so state the rung you rejected and why in a ' +
      '`<!-- ratchet-exempt(design-system): <reason> -->` above the tile.'
  );
});

/* ─────────────── gate 7: one declaration each, over the module sheet alone ─────────────── */

/** The module sheet's own rules, censused once. */
let cachedSheetRules = null;
function sheetRules() {
  if (cachedSheetRules === null) {
    const css = treeStyles().styles[MODULE_SHEET];
    if (css === undefined) {
      throw new Error(
        `${MODULE_SHEET} contributed no CSS to the corpus. Every clause below would then report ` +
          'an empty sheet as a compliant one, which is the one failure an absence check cannot ' +
          'distinguish from success.'
      );
    }
    cachedSheetRules = censusRules(css);
  }
  return cachedSheetRules;
}

/** The rules whose SUBJECT compound is exactly `.<name>` — the rules that DECLARE that class. */
function declarationsOfClass(name) {
  const declared = [];
  for (const rule of sheetRules()) {
    for (const member of rule.selectors) {
      const subject = compoundsOf(member).at(-1) ?? member;
      if (subject === `.${name}`) declared.push({ line: rule.line, selector: member, rule });
    }
  }
  return declared;
}

/** Every rule naming a class anywhere in its selector — a declaration, a variant or a descendant. */
function rulesNamingClass(name) {
  return sheetRules().filter((rule) =>
    rule.selectors.some((member) =>
      compoundsOf(member).some((compound) => compoundClasses(compound).includes(name))
    )
  );
}

/** A rule's declarations as `property -> normalised value`. */
const declarationMap = (rule) =>
  Object.fromEntries(
    rule.declarations.map((declaration) => [
      declaration.property,
      normaliseValue(declaration.value),
    ])
  );

/** The utilities issue 1501 shipped, each declared ONCE and rooted at the module root. */
const MODULE_UTILITIES = Object.freeze([
  { name: 'visually-hidden', selector: '.fabricate .visually-hidden' },
  { name: 'fab-truncate', selector: '.fabricate .fab-truncate' },
  { name: 'fab-stack', selector: '.fabricate .fab-stack' },
  { name: 'fab-cluster', selector: '.fabricate .fab-cluster' },
]);

/** The two halves of the module-rooted focus pair, recognised by SHAPE rather than by text. */
const MODULE_FOCUS_PAIR = Object.freeze([
  {
    half: 'the Foundry-core focus reset',
    compound: RESET_COMPOUND,
    declarations: { outline: 'none', 'box-shadow': 'none' },
    // EMPTY SINCE ISSUE 1520, which is the state this pin was written to reach. Four area roots
    // carried a byte-for-byte copy of this half; every one of them emits `fabricate`, so the
    // module reset already reached the same elements at the same rank and source order alone
    // decided which painted. An entry returning here is a regression, not a decision deferred.
    areaRoots: [],
  },
  {
    half: 'its paired :focus-visible ring',
    compound: RING_COMPOUND,
    declarations: { outline: '2px solid var(--fab-accent)', 'outline-offset': '2px' },
    // EMPTY SINCE ISSUE 1520. Three area roots wrote a copy of this half and all three are gone.
    areaRoots: [],
  },
]);

/** A primitive's OWN ring: `<root>:focus-visible`, the family class itself with no descendant. */
const SELF_RING_COMPOUND = /^(\.[\w-]+):focus-visible$/u;

/** A ring narrowed to one input type, `<root> input[type='range']:focus-visible`: still a bare element. */
const TYPED_RING_COMPOUND = /^(\.[\w-]+) input\[type=['"][a-z]+['"]\]:focus-visible$/u;

/** A ring narrowed to one state of its root at no added rank, `<root>:where(.is-compact) input:focus-visible`. */
const QUALIFIED_RING_COMPOUND = /^(\.[\w-]+):where\([^()]*\) [a-z]+:focus-visible$/u;

/**
 * Every root that may write a `:focus-visible` ring over BARE ELEMENTS, at ANY element shape.
 * Derived from the sheet rather than asserted: 8 roots over 8 blocks, every one of them
 * legitimate today, which is exactly why a ninth would not stand out to a reader. It was 9
 * over 10 until issue 1508 rooted `Field` and `SearchField` at the classes they emit and
 * each gained the ring half of its own pair, and 11 over 12 until its third phase did the same
 * for `ChanceSlider`. Issue 1509 rooted `EditorTabs` and its tab strip gained
 * `.fabricate-tabs button:focus-visible` — a `<root> <element>:focus-visible` block over a bare
 * `button`, which is exactly {@link RING_COMPOUND}'s shape and therefore exactly this population
 * — taking it to 13 over 14. Issue 1520 then deleted the interactable browser's, the interactable
 * config sheet's and the interactables manager's per-area rings, three roots over three blocks,
 * each a copy of the module ring reaching the same elements at the same rank; and the roll-prompt
 * dialog's `button, input` ring, a FOURTH block whose root stays. Three roots and four blocks, so
 * 13 over 14 became 10 over 10. Issue 1511 then took `.fabricate-app` out entirely, one root over
 * one block: its `select:focus-visible` ring was a VARIANT rather than a copy — an inset
 * `box-shadow` against the module's outset `outline`, written because an outset ring on a select
 * flush to an overflow-clipped container is clipped — and it was deleted rather than narrowed
 * because the player app's last native select converted and no carrier is left under that root.
 * Issue 2021 took `.fabricate-roll-prompt-dialog` out the same way, one root over one block: the
 * prompt left DialogV2 for `Modal`, so its dialog-rooted `select` ring has no carrier.
 * `StatusToggle` is NOT here and must not be, for a structural reason rather than an oversight:
 */
const RING_ROOTS = Object.freeze(
  [
    MODULE_ROOT,
    '.fabricate-button',
    '.fabricate-field',
    '.fabricate-icon-button',
    '.fabricate-pagination',
    '.fabricate-search',
    '.fabricate-slider',
    '.fabricate-tabs',
  ].sort(byCodePoint)
);

/**
 * The one root a `:focus-visible` block rings bare elements under, or `null` when it is not one.
 *
 * @param {string} selector A rule's whole selector list.
 * @returns {string|null}
 */
function bareElementRingRoot(selector) {
  const roots = new Set();
  for (const member of splitSelectorList(selector)) {
    const matched =
      RING_COMPOUND.exec(member) ??
      SELF_RING_COMPOUND.exec(member) ??
      TYPED_RING_COMPOUND.exec(member) ??
      QUALIFIED_RING_COMPOUND.exec(member);
    if (matched === null) return null;
    roots.add(matched[1]);
  }
  return roots.size === 1 ? [...roots][0] : null;
}

/** The classes issue 1501 considered, measured, and did NOT declare. */
const WITHDRAWN_UTILITIES = Object.freeze([
  {
    name: 'fab-list-reset',
    why:
      'the sheet holds 21 list-reset rules and not one of them declares only that set — every ' +
      'one carries two to five further declarations, so none of them could adopt the utility ' +
      'without keeping its own rule anyway',
  },
  {
    name: 'fab-field-skin',
    why:
      'withdrawn and not shipped (issue 1523, decision D4): its border, radius and fill tuple ' +
      'is carried by blocks that are pinned by a test or script reading their selectors, are ' +
      'keyed on an ancestor chain or a rule-level guard a stamped class cannot express, or ' +
      'would repaint nothing by adopting it, so each block keeps its own declarations',
  },
  {
    name: 'fab-card-skin',
    why:
      'withdrawn and not shipped (issue 1523, decision D4): the proposed `--fab-bg-2` tuple ' +
      'and the info callout tuple each clear the two-adopter floor, but an adoption repaints ' +
      'nothing and owes its own blocker walk, so each block keeps its own declarations',
  },
]);

test('each module utility is declared exactly once, at the module root', () => {
  // BY CLASS NAME OVER THE MODULE SHEET ALONE. The subject compound has to BE the class.
  for (const { name, selector } of MODULE_UTILITIES) {
    const declared = declarationsOfClass(name);
    assert.deepEqual(
      declared.map((entry) => entry.selector),
      [selector],
      `\`.${name}\` must be declared exactly once, at \`${selector}\`. A second declaration is ` +
        'the per-application copy issue 1501 collapsed, and it reaches the same elements at the ' +
        'same rank, so which one paints is decided by source order rather than by anything a ' +
        'reader of either rule can see.'
    );
  }
});

/** A `[data-gap]` rung as the sheet declares it or as an element writes it: `<utility>=<rung>`. */
const gapRungKey = (utility, rung) => `${utility}=${rung}`;

/** Every rung the module sheet declares, read off the selectors that pin one. */
function declaredGapRungs() {
  const declared = new Set();
  for (const rule of sheetRules()) {
    for (const member of rule.selectors) {
      for (const [, utility, rung] of member.matchAll(/\.(fab-[\w-]+)\[data-gap='([^']+)'\]/gu)) {
        declared.add(gapRungKey(utility, rung));
      }
    }
  }
  return declared;
}

/** A tag's `fab-*` classes and its `data-gap` literal, from the two attribute texts. */
const gapRungsOf = (classText, gapText) =>
  [...(classText ?? '').matchAll(/\b(fab-[\w-]+)\b/gu)].map(([, utility]) =>
    gapRungKey(utility, gapText)
  );

/** An element written into a JavaScript template string, with its whole tag captured. */
const JAVASCRIPT_GAP_ELEMENT = /<[a-z][^<>]*\bdata-gap="[^"]+"[^<>]*>/giu;

/** Every `data-gap` the product writes, over BOTH channels a rung can be emitted through. */
function emittedGapRungs() {
  const found = [];
  for (const { file, source, ast } of treeTemplates()) {
    walkElements(ast.fragment, (element) => {
      const gap = attributeText(source, element, 'data-gap');
      const written = gap?.match(/^data-gap="([^"]*)"$/u);
      if (!written) return;
      const classText = attributeText(source, element, 'class');
      for (const key of gapRungsOf(classText, written[1])) {
        found.push({ file, line: lineOf(source, element.start), key });
      }
    });
  }
  for (const [file, source] of Object.entries(collectWorkingTreeSources(['src'], ['.js']))) {
    for (const [index, text] of stripComments(source).split('\n').entries()) {
      for (const [tag] of text.matchAll(JAVASCRIPT_GAP_ELEMENT)) {
        const written = tag.match(/\bdata-gap="([^"]+)"/u);
        for (const key of gapRungsOf(tag.match(/\bclass="([^"]*)"/u)?.[1], written[1])) {
          found.push({ file, line: index + 1, key });
        }
      }
    }
  }
  return found;
}

/** The two utilities whose BASE rule sets a rung default, and the rung that default must equal. */
const DEFAULT_GAP_RUNGS = Object.freeze([
  { utility: 'fab-stack', property: '--fab-stack-gap', rung: '2' },
  { utility: 'fab-cluster', property: '--fab-cluster-gap', rung: '2' },
]);

test('every emitted `data-gap` rung is declared, and each default is written as its own rule', () => {
  // THE OTHER DIRECTION OF A HAND-MAINTAINED MIRROR. `styles-dead-classes` fires on a
  // declared-and-unemitted CLASS; nothing fires on an EMITTED-and-undeclared rung, which renders
  // at whatever the base rule happens to set and so looks correct in every frame. The utility
  // comment reasons about the first direction only.
  const declared = declaredGapRungs();
  const emitted = emittedGapRungs();

  assert.ok(
    emitted.length >= 12,
    `only ${emitted.length} \`data-gap\` emitters reached this scan, against the 16 the tree ` +
      "held when this clause was written, 15 after issue 1371 rebuilt the component inspector's " +
      'hero. The floor carries slack DELIBERATELY, so that removing one call site reds nothing ' +
      'and only a collapse gets here: a walk that stopped seeing call sites reports a clean ' +
      'mirror, which is the one direction an absence check cannot distinguish from success.'
  );
  assert.deepEqual(
    [...new Set(emitted.filter((site) => !declared.has(site.key)).map((site) => site.key))].sort(
      byCodePoint
    ),
    [],
    `every rung written in markup must have a rule. Declared: ${[...declared].sort(byCodePoint).join(', ')}. ` +
      'A rung nothing declares renders at the base rule’s default, so the attribute promises a ' +
      'pin that is not there and the site moves silently when that default changes.'
  );

  for (const { utility, property, rung } of DEFAULT_GAP_RUNGS) {
    const base = declarationsOfClass(utility).map(({ rule }) => declarationMap(rule)[property]);
    const pinned = sheetRules()
      .filter((rule) =>
        rule.selectors.includes(`.${MODULE_ROOT.slice(1)} .${utility}[data-gap='${rung}']`)
      )
      .map((rule) => declarationMap(rule)[property]);
    assert.deepEqual(
      base,
      pinned,
      `\`.${utility}\`'s default rung must also be written as \`[data-gap='${rung}']\`. It is the ` +
        'most-used rung at the call sites, and leaving it implicit is what lets the base rule be ' +
        're-rung without meeting this gate.'
    );
  }
});

test('each half of the module focus pair is declared exactly once, at the module root', () => {
  for (const { half, compound, declarations } of MODULE_FOCUS_PAIR) {
    const blocks = sheetRules().filter(
      (rule) => focusPairRoot(rule.selector, compound) === MODULE_ROOT
    );
    assert.equal(
      blocks.length,
      1,
      `${half} must be written once for the whole module. It is recognised by SHAPE — one root ` +
        'class crossed with a published element list — so a second block naming a different set ' +
        'of elements is not this pattern at all and would be reported by gate 1 instead.'
    );
    assert.deepEqual(
      declarationMap(blocks[0]),
      declarations,
      `${half} must declare exactly this set. The two halves are a PAIR: the reset suppresses ` +
        "Foundry core's orange ring for mouse focus and the ring repaints the Fabricate accent " +
        'for keyboard focus, so a half that declares more or less than its side of that contract ' +
        'leaves one of the two states unstyled or double-styled.'
    );
  }
});

test('no area root writes a copy of either half of the module focus pair', () => {
  // GATE 1 PINS THE RESET ROOTS AND NOTHING PINNED THE RING ROOTS. A byte-identical
  // `.fabricate-manager …:focus-visible` block is exactly the duplication issue 1501 removed; it
  // is a singleton under gate 8's `count >= 2` filter, gate 1 reads bare `:focus` and never sees
  // it, and the clause above counts only `.fabricate`-rooted blocks — so without this clause it
  // lands green. The two halves have DIFFERENT expected lists, derived from the tree rather than
  // assumed equal; see the note on the ring half.
  for (const { half, compound, areaRoots } of MODULE_FOCUS_PAIR) {
    const roots = sheetRules()
      .map((rule) => focusPairRoot(rule.selector, compound))
      .filter((root) => root !== null && root !== MODULE_ROOT);
    assert.deepEqual(
      [...new Set(roots)].sort(byCodePoint),
      areaRoots,
      `${half} must be written once at the module root, and since issue 1520 no area root ` +
        'writes a copy of either half — the list above is empty and is meant to stay empty. ' +
        'Issue 1501 collapsed the pair onto `.fabricate` and left four per-area copies standing; ' +
        'issue 1520 discharged them. Any root arriving here is a fresh copy of a pair the module ' +
        'already writes, reaching the same elements at the same rank, so which one paints is ' +
        'decided by source order rather than by anything a reader of either block can see. A ' +
        'genuine VARIANT — a different treatment, not a different spelling of the same one — is ' +
        'not this shape and is adjudicated at `RING_ROOTS` instead.'
    );
  }
});

test('every root ringing bare elements on `:focus-visible` is a named one', () => {
  // THE SHAPE ALLOW-LIST IS THE HOLE THIS FILLS.
  const roots = sheetRules()
    .map((rule) => bareElementRingRoot(rule.selector))
    .filter((root) => root !== null);
  assert.deepEqual(
    [...new Set(roots)].sort(byCodePoint),
    RING_ROOTS,
    'a `:focus-visible` ring over BARE ELEMENTS may only be written at one of these roots. Any ' +
      'other root reaches the elements the module ring already reaches, at the same rank, so ' +
      'which one paints is decided by source order rather than by anything a reader of either ' +
      'block can see — and a per-widget ring, which is allowed, names a CLASS rather than an ' +
      'element and is not in this population.'
  );
});

test('a withdrawn utility or skin class is not declared', () => {
  // NON-VACUITY IS THE CLAUSE ABOVE. An absence check over an empty sheet passes forever.
  for (const { name, why } of WITHDRAWN_UTILITIES) {
    assert.deepEqual(
      rulesNamingClass(name).map((rule) => `${MODULE_SHEET}:${rule.line}`),
      [],
      `\`.${name}\` must not be declared: ${why}. Declaring one reopens the measurement ` +
        'that withdrew it, so re-run that measurement and publish it rather than adding the rule.'
    );
  }
});

/* ─────────────── gate 8: cross-list selector repetition in the module sheet ─────────────── */

/** A repeated selector's key: `<at-context chain> | <normalised selector>`. */
const atContextOf = (entry) =>
  entry.atContext.length > 0 ? entry.atContext.join(' >> ') : '(top level)';

/** A rule's declarations, whitespace normalised, in source order. */
const bodyOf = (rule) =>
  rule.declarations
    .map(({ property, value }) => `${property}: ${value.replaceAll(/\s+/gu, ' ')}`)
    .join('; ');

/**
 * One site per appearance of every `(at-context, selector)` key the module sheet writes more than
 * once. Netted on the at-context and the bodies of the rules it appears in, so a repeated selector
 * renamed in place is a move and a new one repeated beside a removal is not.
 */
function repeatedSelectors(corpus) {
  const css = corpus.styles[MODULE_SHEET];
  if (css === undefined) return [];
  const rules = censusRules(css);
  const sites = [];
  for (const entry of selectorAppearances(rules).values()) {
    if (entry.appearances.length < 2) continue;
    const context = atContextOf(entry);
    const bodies = entry.appearances.map(({ ruleIndex }) => bodyOf(rules[ruleIndex]));
    const value = `${context} | ${bodies.sort(byCodePoint).join(' || ')}`;
    for (const { line } of entry.appearances) {
      sites.push({
        file: MODULE_SHEET,
        line,
        id: `repeated selector ${context} | ${entry.selector}`,
        value,
      });
    }
  }
  return sites;
}

const REPETITION_GATE = styleGate(repeatedSelectors);

test("the module sheet's cross-list selector repetition does not grow", (t) => {
  // Filtered to keys appearing at least twice on both sides: almost every key appears once, and a
  // key falling to one appearance leaves the measurement, which the comparison reports as shrunk.
  assertFloor('repeated `styles/fabricate.css` selectors', sheetRules().length, 2000);
  checkGate(
    t,
    REPETITION_GATE,
    'This describes deliberate authoring rather than a defect count. Almost every repeated key ' +
      'is one selector written into two DIFFERENT comma-separated lists, which `stylelint`’s ' +
      '`no-duplicate-selectors` allows by design and which splitting a list to "fix" would turn ' +
      'into the duplicate list that rule does reject. A key that grew or appeared means a list ' +
      'was widened or a rule copied: re-read it with `node scripts/stylesheet-selector-census.mjs`, ' +
      'and either fold the rule into the one it repeats or say why in a ' +
      '`/* ratchet-exempt(design-system): <reason> */` above each rule it appears in that the ' +
      'base did not already count, which for a newly repeated selector is every one of them.'
  );
});

/* ─────────────── the gates, proved against throwaway repositories ─────────────── */

const SHEET_BASE = [
  ':root { --probe-radius: 6px; }',
  '.fabricate .a { border-radius: 9px; font-weight: 650; }',
  '.fabricate .x, .fabricate .y { color: red; }',
  '.fabricate .x, .fabricate .z { color: blue; }',
  '.fabricate .r { border-radius: var(--probe-radius); }',
];

const PROBE = 'src/ui/svelte/Probe.svelte';

/** A template holding one `<select>` and one 8px corner, plus `markup` and `rules`. */
const probeWith = ({ markup = [], rules = [] } = {}) =>
  [
    '<div class="probe"></div>',
    '<select><option>a</option></select>',
    ...markup,
    '<style>',
    '  .probe { border-radius: 8px; }',
    ...rules,
    '</style>',
    '',
  ].join('\n');

/** The module sheet with `lines` appended. */
const sheetWith = (...lines) => [...SHEET_BASE, ...lines, ''].join('\n');

const WIRING_BASE = Object.freeze({
  [MODULE_SHEET]: sheetWith(),
  [PROBE]: probeWith(),
  'src/main.js': 'export const dialog = `<div></div>`;\n',
  'README.md': 'unrelated\n',
});

const REASON = 'ratchet-exempt(design-system): the probe needs it';

test('a design-system gate fails a new offender and a grown one, and nothing else', (t) => {
  const radius = (file, value) => `${file}: off-ladder border-radius: ${value}`;
  assertGateCases(t, RADIUS_GATE, WIRING_BASE, [
    {
      head: { [MODULE_SHEET]: sheetWith('.fabricate .b { border-radius: 8px; }') },
      failures: [`${radius(MODULE_SHEET, '8px')} is new (1)`],
    },
    {
      head: { [PROBE]: probeWith({ rules: ['  .probe-b { border-radius: 8px; }'] }) },
      failures: [`${radius(PROBE, '8px')} rose from 1 to 2`],
    },
    { head: { 'README.md': 'changed\n' }, skipped: 'corpus-unchanged' },
    { head: { [MODULE_SHEET]: sheetWith('.fabricate .b { border-radius: 9px; }') }, failures: [] },
  ]);
  assertGateCases(t, NATIVE_SELECT_GATE, WIRING_BASE, [
    {
      head: { [PROBE]: probeWith({ markup: ['<select></select>'] }) },
      failures: [`${PROBE}: native <select> rose from 1 to 2`],
    },
    {
      head: { 'src/ui/svelte/Other.svelte': '<select></select>\n' },
      failures: ['src/ui/svelte/Other.svelte: native <select> is new (1)'],
    },
  ]);
  assertGateCases(t, JS_SELECT_GATE, WIRING_BASE, [
    {
      head: { 'src/main.js': 'export const dialog = `<select></select>`;\n' },
      failures: ['src/main.js: native <select> in a template string is new (1)'],
    },
  ]);
});

// Each probe is its own subtest, so a failure names the shape that moved.
test('the shadow allowance passes a ring list and a leading bar, and not a near-miss', async (t) => {
  const shadow = (value) => ({
    [MODULE_SHEET]: sheetWith(`.fabricate .s { box-shadow: ${value}; }`),
  });
  const offToken = (value) =>
    `${MODULE_SHEET}: off-token box-shadow .fabricate .s | ${value} is new (1)`;
  const allowed = [
    ['a leading bar', 'inset 3px 0 0 var(--fab-accent)'],
    ['a 4px bar, the widest edge', 'inset 4px 0 0 var(--fab-accent)'],
    ['a 4px ring, the widest edge', 'inset 0 0 0 4px var(--fab-accent)'],
    ['the radio dot', RADIO_DOT],
    [
      "the nav pip's outset ring list",
      '0 0 0 2px var(--fab-surface-soft), 0 0 0 2px var(--fab-bg-1)',
    ],
  ];
  const nearMisses = [
    ['a blurred bar', 'inset 3px 0 2px var(--fab-accent)'],
    ['a y-offset bar', 'inset 3px 1px 0 var(--fab-accent)'],
    ['the y-offset hairline', 'inset 0 1px 0 var(--fab-overlay-dark-18)'],
    ['an outset bar', '3px 0 0 var(--fab-accent)'],
    ['a bar on a non-`--fab` variable', 'inset 3px 0 0 var(--probe-accent)'],
    [
      'a ring list with a blurred member',
      'inset 0 0 0 3px var(--fab-bg-1), 0 2px 4px var(--fab-accent)',
    ],
    [
      'a ring list with a bar member',
      'inset 0 0 0 3px var(--fab-bg-1), inset 3px 0 0 var(--fab-accent)',
    ],
    ['a literal-colour bar', 'inset 3px 0 0 #fff'],
    ['a literal-colour ring', 'inset 0 0 0 1px #fff'],
    ['a negative-offset bar', 'inset -3px 0 0 var(--fab-accent)'],
    ['a blurred ring', '0 0 2px 1px var(--fab-accent)'],
    ['a 40px ring', 'inset 0 0 0 40px var(--fab-accent)'],
    ['a 5px bar, past the widest edge', 'inset 5px 0 0 var(--fab-accent)'],
    ["the radio dot's 16px ring alone", 'inset 0 0 0 16px var(--fab-accent)'],
    [
      'a ring list with a 40px member',
      'inset 0 0 0 3px var(--fab-bg-1), inset 0 0 0 40px var(--fab-accent)',
    ],
  ];
  for (const [name, value] of allowed) {
    await t.test(`passes ${name}`, (probe) =>
      assertGateCases(probe, OFF_TOKEN_SHADOW_GATE, WIRING_BASE, [
        { head: shadow(value), failures: [] },
      ])
    );
  }
  for (const [name, value] of nearMisses) {
    await t.test(`fails ${name}`, (probe) =>
      assertGateCases(probe, OFF_TOKEN_SHADOW_GATE, WIRING_BASE, [
        { head: shadow(value), failures: [offToken(value)] },
      ])
    );
  }
});

test('a var() resolves against its own side, so moving a value into a token pays nothing', (t) => {
  const retoken = sheetWith().replace('--probe-radius: 6px', '--probe-radius: 8px');
  assertGateCases(t, RADIUS_GATE, WIRING_BASE, [
    {
      head: { [MODULE_SHEET]: retoken },
      failures: [
        `${MODULE_SHEET}: off-ladder border-radius: var(--probe-radius) => 8px is new (1)`,
      ],
    },
  ]);
});

test('a gate reads the whole corpus, so a var() resolves against an unchanged sheet', (t) => {
  const base = {
    ...WIRING_BASE,
    [MODULE_SHEET]: sheetWith().replace('--probe-radius: 6px', '--probe-radius: 8px'),
  };
  const fresh = 'src/ui/svelte/Fresh.svelte';
  assertGateCases(t, RADIUS_GATE, base, [
    {
      head: {
        [fresh]: '<div></div>\n<style>\n  div { border-radius: var(--probe-radius); }\n</style>\n',
      },
      failures: [`${fresh}: off-ladder border-radius: var(--probe-radius) => 8px is new (1)`],
    },
  ]);
});

test('a rename nets against the offender it replaces, and a copy does not', (t) => {
  const renamed = sheetWith().replace('.fabricate .a {', '.fabricate .c {');
  const repeated = (context, selector) =>
    `${MODULE_SHEET}: repeated selector ${context} | ${selector}`;
  assertGateCases(t, OFF_RAMP_WEIGHT_GATE, WIRING_BASE, [
    { head: { [MODULE_SHEET]: renamed }, failures: [] },
    {
      head: { [MODULE_SHEET]: sheetWith('.fabricate .c { font-weight: 650; }') },
      failures: [`${MODULE_SHEET}: off-ramp font-weight .fabricate .c | 650 is new (1)`],
    },
  ]);
  assertGateCases(t, REPETITION_GATE, WIRING_BASE, [
    {
      head: { [MODULE_SHEET]: sheetWith().replaceAll('.fabricate .x', '.fabricate .q') },
      failures: [],
    },
    {
      head: { [MODULE_SHEET]: sheetWith('.fabricate .x, .fabricate .w { color: green; }') },
      failures: [`${repeated('(top level)', '.fabricate .x')} rose from 2 to 3`],
    },
    {
      head: { [MODULE_SHEET]: sheetWith('.fabricate .y { color: green; }') },
      failures: [`${repeated('(top level)', '.fabricate .y')} is new (2)`],
    },
    {
      head: {
        [MODULE_SHEET]: sheetWith('.fabricate .y { color: green; }').replace(
          '.fabricate .x, .fabricate .z {',
          '.fabricate .z {'
        ),
      },
      failures: [`${repeated('(top level)', '.fabricate .y')} is new (2)`],
    },
  ]);
  const focused = (selector, body) => sheetWith(`${selector}:focus { ${body} }`);
  assertGateCases(
    t,
    BARE_FOCUS_GATE,
    { ...WIRING_BASE, [MODULE_SHEET]: focused('.fabricate .f', 'color: red;') },
    [
      { head: { [MODULE_SHEET]: focused('.fabricate .g', 'color: red;') }, failures: [] },
      {
        head: { [MODULE_SHEET]: focused('.fabricate .g', 'color: blue;') },
        failures: [`${MODULE_SHEET}: bare :focus .fabricate .g:focus is new (1)`],
      },
    ]
  );
});

test('a reasoned marker at the site exempts it, and an empty one fails', (t) => {
  const offender = '.fabricate .b { border-radius: 8px; }';
  const line = SHEET_BASE.length + 1;
  assertGateCases(t, RADIUS_GATE, WIRING_BASE, [
    { head: { [MODULE_SHEET]: sheetWith(`/* ${REASON} */`, offender) }, failures: [] },
    {
      head: { [MODULE_SHEET]: sheetWith('/* ratchet-exempt(design-system): */', offender) },
      failures: [
        `${MODULE_SHEET}: off-ladder border-radius: 8px is new (1); its ratchet-exempt marker ` +
          'gives no reason',
        emptyMarkerFailure(MODULE_SHEET, line),
      ],
    },
    {
      head: {
        [MODULE_SHEET]: sheetWith(`/* ${REASON} */`, '.fabricate .n { color: red; }', offender),
      },
      failures: [`${MODULE_SHEET}: off-ladder border-radius: 8px is new (1)`],
    },
  ]);
  assertGateCases(t, NATIVE_SELECT_GATE, WIRING_BASE, [
    {
      head: { [PROBE]: probeWith({ markup: [`<!-- ${REASON} -->`, '<select></select>'] }) },
      failures: [],
    },
  ]);
  // A marker on a select already at base buys no room for a new one.
  const markOld = (probe) =>
    probe.replace(
      '<select><option>a</option></select>',
      `<!-- ${REASON} -->\n<select><option>a</option></select>`
    );
  assertGateCases(t, NATIVE_SELECT_GATE, WIRING_BASE, [
    {
      head: { [PROBE]: markOld(probeWith({ markup: ['<select></select>'] })) },
      failures: [`${PROBE}: native <select> rose from 1 to 2`],
    },
    {
      head: { [PROBE]: markOld(probeWith()) },
      failures: [],
    },
  ]);
  // A marker exempts its own site and never the file's later growth.
  const marked = { markup: [`<!-- ${REASON} -->`, '<select></select>'] };
  assertGateCases(t, NATIVE_SELECT_GATE, { ...WIRING_BASE, [PROBE]: probeWith(marked) }, [
    {
      head: { [PROBE]: probeWith({ markup: [...marked.markup, '<select></select>'] }) },
      failures: [`${PROBE}: native <select> rose from 1 to 2`],
    },
  ]);
});
