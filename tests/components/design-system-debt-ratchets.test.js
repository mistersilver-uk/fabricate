/**
 * The design-system debt gates: each measures its corpus at the base commit and in the working
 * tree, and fails on an offender that appeared or grew, unless a
 * `ratchet-exempt(design-system): <reason>` marker sits at the site.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

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
import { parseMarkers } from '../helpers/mergeBaseRatchet.js';
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
    'a button input select textarea [tabindex]',
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
  '.fabricate-toggle.manager-status-toggle:focus',
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
    6,
    'the one surviving block names 6 selectors. It was 24 across five blocks before issue 1520: ' +
      'the module reset names six, the config, browser and manager copies named five each, and ' +
      'the roll-prompt copy named three — 6 + 5 + 5 + 5 + 3 — of which 18 went with the four ' +
      'deleted blocks.'
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
      '.fabricate-toggle.manager-status-toggle:focus',
    ],
    'the set of primitive families declaring their own focus strip has changed. Each of the ' +
      'nine is the strip half of a pair `design-system/spec.md` requires, so one disappearing ' +
      'means that family repaints its ring ON TOP of Foundry core`s treatment in any host ' +
      'carrying neither application root — a deliberate edit here, never a silent one. `Field` ' +
      'and `ManagerSearchField` joined at issue 1508 phase 1 and `ChanceSlider` and ' +
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

/** Every `@media` in the corpus, with its query normalised and its line. */
function mediaQueries(corpus) {
  const found = [];
  for (const [file, css] of Object.entries(corpus.styles)) {
    MEDIA_AT_RULE.lastIndex = 0;
    for (let match = MEDIA_AT_RULE.exec(css); match !== null; match = MEDIA_AT_RULE.exec(css)) {
      found.push({
        file,
        line: css.slice(0, match.index).split('\n').length,
        query: match[1].trim().replace(/\s+/gu, ' '),
      });
    }
  }
  return found;
}

const VIEWPORT_MEDIA_GATE = styleGate((corpus) =>
  mediaQueries(corpus)
    .filter((entry) => !USER_PREFERENCE.test(entry.query))
    .map((entry) => ({ ...entry, id: `viewport @media ${entry.query}`, value: entry.query }))
);

test('no viewport breakpoint is introduced, and user-preference queries stay exempt', (t) => {
  const all = mediaQueries(treeStyles());
  const gated = all.filter((entry) => !USER_PREFERENCE.test(entry.query));

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
      'exempt.'
  );
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

/* ─────────────────────────────── gate 4: shadows ─────────────────────────────── */

/** The three published elevation tokens. */
const SHADOW_TOKEN = /^var\(\s*--fab-shadow-(sm|md|lg)\s*\)$/iu;

/** An inset ring: a border drawn as a shadow so it costs no layout. */
const INSET_RING = /^(?:inset )?0 0 0 \d+(?:\.\d+)?px var\(\s*--fab-[\w-]+\s*(?:,[^)]*)?\)$/iu;

/** Every `box-shadow` declaration, normalised. */
const shadowsOf = (corpus) =>
  declarationsOf(corpus, (property) => property === 'box-shadow').map((declaration) => ({
    ...declaration,
    value: normaliseValue(declaration.value),
  }));

const OFF_TOKEN_SHADOW_GATE = styleGate((corpus) =>
  shadowsOf(corpus)
    .filter(
      (declaration) =>
        !SHADOW_TOKEN.test(declaration.value) &&
        declaration.value.toLowerCase() !== 'none' &&
        !INSET_RING.test(declaration.value)
    )
    .map((declaration) => declarationSite('off-token box-shadow', declaration))
);

test('no box-shadow is written outside the published elevation set', (t) => {
  const shadows = shadowsOf(treeStyles());

  // The two allowances are live, so widening either shows up as rows vanishing rather than as
  // nothing at all. A `none` that is no longer written and a ring that no longer matches both
  // read, from the ratchet alone, as debt paid down.
  assert.ok(
    shadows.some((declaration) => SHADOW_TOKEN.test(declaration.value)),
    'no `box-shadow` reads a published elevation token any more, so the allowance this gate ' +
      'grants is granted to nothing'
  );
  assert.ok(
    shadows.some((declaration) => INSET_RING.test(declaration.value)),
    'no `box-shadow` is written as an inset ring any more, so that carve-out is untested by the ' +
      'corpus and could be widened without a row moving'
  );

  assertFloor('off-token box-shadows', shadows.length, 60);
  checkGate(
    t,
    OFF_TOKEN_SHADOW_GATE,
    'Token foundations are the only source of elevation. `--fab-shadow-sm`, `--fab-shadow-md` ' +
      'and `--fab-shadow-lg` are the three heights this product has, and a hand-written offset ' +
      'and blur is a fourth that no other surface can match. `none` and an inset ring — a border ' +
      'drawn without costing layout — are the two shapes that are not elevation and stay allowed.'
  );
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

test('a converted select did not pay its ratchet with a marker', () => {
  // THE THIRD POLARITY (issue 1504), and the one the two clauses above cannot express.
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
  ];
  const { readFile } = workingTree(TEMPLATE_CORPUS);
  for (const file of CONVERTED) {
    const source = readFile(file);
    assert.ok(
      typeof source === 'string',
      `${file} is not in the source walk, so this clause is checking nothing. Either the file ` +
        'moved — retarget this list — or the walk has stopped reading `.svelte`.'
    );
    assert.deepEqual(
      parseMarkers(file, source).filter((marker) => marker.family === DESIGN_SYSTEM_FAMILY),
      [],
      `${file} carries a \`ratchet-exempt(design-system)\` marker. Issues 1504 and 1511 paid ` +
        'this file’s native selects down by converting it to the app’s own option list; a ' +
        'marker here would pay the same debt while the operating system’s drop-down went on ' +
        'shipping, which is the one way that ratchet can be paid without the defect being fixed.'
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
  // THE RESOLUTION HALF, PROVED IN BOTH DIRECTIONS AGAINST SYNTHETIC DEFINITIONS. The live corpus
  // exercises it — `--fab-books-control-radius` is 5px and is counted at its resolved
  // value — but relying on that makes the capability depend on the tree happening to contain a
  // non-compliant token, and paying that row down would silently take the proof with it.
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

/** The four rungs the icon-chip size ladder publishes. */
const ART_SIZE_LADDER = new Set([22, 26, 30, 38]);

/** The components that ARE the art tile. */
const ART_TILE_COMPONENTS = new Map([
  ['Medallion', 40],
  ['Avatar', 32],
]);

/**
 * Every art-tile render site, as `{ file, line, size }` with `size` a number or `dynamic`.
 *
 * @returns {{ file: string, line: number, size: number|'dynamic' }[]}
 */
function artTileSizes(templates) {
  const found = [];
  for (const { file, source, ast } of templates) {
    walkElements(ast.fragment ?? ast, (element) => {
      if (element.type !== 'Component' || !ART_TILE_COMPONENTS.has(element.name)) return;
      const text = attributeText(source, element, 'size');
      const line = lineOf(source, element.start);
      // An absent `size` takes the primitive's OWN default.
      if (text === null) {
        found.push({ file, line, size: ART_TILE_COMPONENTS.get(element.name) });
        return;
      }
      const literal = /^size=\{\s*(\d+(?:\.\d+)?)\s*\}$/u.exec(text);
      found.push({ file, line, size: literal ? Number(literal[1]) : 'dynamic' });
    });
  }
  return found;
}

const isOffArtLadder = (site) => site.size === 'dynamic' || !ART_SIZE_LADDER.has(site.size);

const ART_SIZE_GATE = templateGate((templates) =>
  artTileSizes(templates)
    .filter(isOffArtLadder)
    .map((site) => ({ ...site, id: `off-ladder art size ${site.size}` }))
);

test('no new art tile renders at an off-ladder size', (t) => {
  const sites = artTileSizes(treeTemplates());

  // NON-VACUITY, and it is worth its own line here. A scan that had stopped recognising the tile's
  // component name would produce an empty `sites` and report every base offender as paid down
  // rather than the scan as broken. The floor says that in the gate's own language; this says it
  // about the tile itself.
  assert.ok(
    sites.some((site) => ART_SIZE_LADDER.has(site.size)),
    'no art tile in the tree renders at a published rung, so the ladder this gate filters ' +
      'against is matching nothing and every site would be recorded as debt'
  );
  assertFloor('off-ladder art-tile sizes', sites.length, 40);
  checkGate(
    t,
    ART_SIZE_GATE,
    'Art and portraits carry their own size ladder — 22, 26, 30 and 38, default 26 — and this ' +
      'gate fails a render site off it that the base commit does not have. A new one is not ' +
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

/**
 * Every root that may write a `:focus-visible` ring over BARE ELEMENTS, at ANY element shape.
 * Derived from the sheet rather than asserted: 8 roots over 8 blocks, every one of them
 * legitimate today, which is exactly why a ninth would not stand out to a reader. It was 9
 * over 10 until issue 1508 rooted `Field` and `ManagerSearchField` at the classes they emit and
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
 * prompt left DialogV2 for `ManagerModal`, so its dialog-rooted `select` ring has no carrier.
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
    const matched = RING_COMPOUND.exec(member) ?? SELF_RING_COMPOUND.exec(member);
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
      'measured at thirteen carriers of the target tuple: three are PINNED by a test or a script ' +
      'that reads their selectors, six are recorded non-adopters and four are unpinned. Issue ' +
      "2005's Studio parity pass added the outcome tier row, pinned by the Checks mounted suite, " +
      "and took the config option card's glyph tile off the tuple, its border now transparent " +
      "as the library's icon chip draws it. The " +
      'new non-adopter is the read-only dense ListRow in issue 1648, not a field; the four ' +
      'carriers that left are select skins issue 1510 took — the recipe overview cells, the ' +
      "recipe, component and essence browse toolbars' shared select skin and the vocabulary " +
      "panel's sort skin, each deleted when its selects became the shared `<Select>`, and the " +
      "Tool rails' `Preview as` actor " +
      'picker, whose rule survives as a width counterpart while the `toolbar` rung paints the ' +
      "tuple; the pinned carrier that arrived is issue 1512's ordered row, " +
      '`.fabricate-sortable-list-row`, which takes the tuple from the `<SortableList>` specimen. Issue ' +
      '1501 measured ONE unpinned carrier and withdrew the class under the two-adopter floor; ' +
      "issue 1371's catalogue, entry and salvage screens then landed four more beneath it, so " +
      'the floor is met and what defers the class now is the work rather than the population — ' +
      "each adoption owes criterion 5's scoped blocker walk over the interval between the " +
      'module root and its own donor, published with both specificities',
  },
  {
    name: 'fab-card-skin',
    why:
      'three blocks carry the proposed border, radius and fill five-tuple, up from the one ' +
      "issue 1501 measured — issue 1371's component entry card and component rules card are " +
      'the two new carriers — so this class too is deferred for its per-adoption blocker walk ' +
      'rather than for want of carriers; of the nine 11px border-and-fill blocks the fills are ' +
      '`--fab-bg-2` at three (the proposed one), `--fab-info-soft` at two — `:2709-2711` and ' +
      '`:18420-18422` carry an identical `1px solid var(--fab-info-border)` five-tuple, a second ' +
      'candidate skin for issue 1523 rather than this one — `--fab-bg-1` at two behind two ' +
      'DIFFERENT hairlines, and `--fab-surface-soft` and `--fab-bg-3` at one each',
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

test('a withdrawn utility or skin class is not declared, and issue 1523 owns each one', () => {
  // NON-VACUITY IS THE CLAUSE ABOVE. An absence check over an empty sheet passes forever.
  for (const { name, why } of WITHDRAWN_UTILITIES) {
    assert.deepEqual(
      rulesNamingClass(name).map((rule) => `${MODULE_SHEET}:${rule.line}`),
      [],
      `\`.${name}\` must not be declared: ${why}. Issue 1523 is the change expected to REMOVE ` +
        'this class, not the change that adds it — declaring one here reopens the measurement ' +
        'that withdrew it, so re-run that measurement and publish it rather than adding the rule.'
    );
  }
});

/** The border, radius and fill tuple the withdrawn `.fab-field-skin` would have carried. */
const SKIN_CENSUS_TUPLE = Object.freeze({
  border: '1px solid var(--fab-border)',
  'border-radius': '9px',
  background: 'var(--fab-bg-1)',
});

/** The comment every carrier of that tuple publishes, and the string this clause looks for. */
const SKIN_CENSUS_MARKER = 'skin census (issue 1523)';

/** The module sheet as it is WRITTEN, comments intact. */
let cachedSheetText = null;
function sheetText() {
  if (cachedSheetText === null) {
    const text = collectWorkingTreeSources(['styles'], ['.css'])[MODULE_SHEET];
    if (text === undefined) {
      throw new Error(
        `${MODULE_SHEET} is not in the working-tree style scan, so every carrier below would ` +
          'report an absent marker as a present one and the clause would pass on an empty read.'
      );
    }
    cachedSheetText = text;
  }
  return cachedSheetText;
}

/** The comment block written IMMEDIATELY above `line`, or `''` when the rule opens without one. */
function commentAbove(line) {
  const lines = sheetText().split('\n');
  const end = line - 2;
  if (end < 0 || !lines[end].trimEnd().endsWith('*/')) return '';
  let start = end;
  while (start >= 0 && !lines[start].includes('/*')) start -= 1;
  return start < 0 ? '' : lines.slice(start, end + 1).join('\n');
}

test('every carrier of the withdrawn skin tuple carries its census marker', () => {
  // THE WITHDRAWAL ABOVE STATES A POPULATION AND A SPLIT.
  const carriers = sheetRules().filter((rule) => {
    const declarations = declarationMap(rule);
    return Object.entries(SKIN_CENSUS_TUPLE).every(
      ([property, value]) => declarations[property] === value
    );
  });

  assert.equal(
    carriers.length,
    13,
    'the census is thirteen carrier blocks. `WITHDRAWN_UTILITIES` publishes that population and ' +
      'its three-pinned / six-non-adopter / four-unpinned split as prose, so a carrier arriving ' +
      'or ' +
      'leaving means re-deriving that `why` text with it rather than moving this number alone.'
  );
  assert.deepEqual(
    carriers
      .filter((rule) => !commentAbove(rule.line).includes(SKIN_CENSUS_MARKER))
      .map((rule) => `${MODULE_SHEET}:${rule.line}`),
    [],
    `a carrier of the withdrawn skin tuple must carry a \`${SKIN_CENSUS_MARKER}\` comment ` +
      'immediately above its rule, saying whether it is pinned, an unpinned carrier or not an ' +
      'adopter and naming what pins it. That comment is the record issue 1523 reads to decide the ' +
      'class, and a carrier missing from it is a shared treatment the decision cannot see.'
  );
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
