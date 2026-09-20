/**
 * Six design-system rules the spec states and nothing enforced (issue 1497).
 * 24 bare `:focus` selectors, five viewport breakpoints, 40 wrong font weights, 26 off-token
 * shadows, 99 native `<select>` elements in templates and four more in dialog bodies, and 318
 * off-ladder corner values.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { compoundClasses, compoundsOf } from '../../scripts/lib/stylesheetLiveClasses.js';
import { censusRules, selectorAppearances } from '../../scripts/lib/stylesheetSelectorCensus.js';
import { assertRatchet, byCodePoint, tallyByKey } from '../helpers/ratchetBaseline.js';
import { collectWorkingTreeSources, stripComments } from '../helpers/sourceScan.js';
import {
  collectCustomProperties,
  collectStyleCorpus,
  declarationsIn,
  resolveValueCandidates,
  rulesIn,
  splitSelectorList,
} from '../helpers/styleBlockScan.js';
import {
  attributeText,
  lineOf,
  parsedTemplates,
  walkElements,
} from '../helpers/svelteTemplateScan.js';

import {
  KNOWN_BARE_FOCUS_SELECTORS,
  KNOWN_BARE_FOCUS_TOTAL,
  KNOWN_HEAVY_MONO_WEIGHTS,
  KNOWN_HEAVY_MONO_WEIGHT_TOTAL,
  KNOWN_NATIVE_SELECTS_IN_JS,
  KNOWN_NATIVE_SELECTS_IN_JS_TOTAL,
  KNOWN_NATIVE_SELECT_ELEMENTS,
  KNOWN_NATIVE_SELECT_TOTAL,
  KNOWN_OFF_LADDER_ART_SIZES,
  KNOWN_OFF_LADDER_ART_SIZE_TOTAL,
  KNOWN_OFF_LADDER_RADII,
  KNOWN_OFF_LADDER_RADIUS_TOTAL,
  KNOWN_OFF_SCALE_FONT_WEIGHTS,
  KNOWN_OFF_SCALE_FONT_WEIGHT_TOTAL,
  KNOWN_OFF_TOKEN_SHADOWS,
  KNOWN_OFF_TOKEN_SHADOW_TOTAL,
  KNOWN_VIEWPORT_MEDIA_QUERIES,
  KNOWN_VIEWPORT_MEDIA_TOTAL,
} from './design-system-known-debt.js';
import {
  SELECTOR_REPETITION_BASELINE,
  SELECTOR_REPETITION_TOTAL,
} from './selector-repetition-baseline.js';

/* ─────────────────────────────── the shared corpus ─────────────────────────────── */

/** The CSS corpus, its rules and its custom-property definitions, built once. */
let cachedCorpus = null;
function corpus() {
  if (cachedCorpus === null) {
    const styles = collectStyleCorpus();
    const rules = Object.entries(styles).flatMap(([file, css]) =>
      rulesIn(css).map((rule) => ({ ...rule, file }))
    );
    cachedCorpus = {
      styles,
      rules,
      definitions: collectCustomProperties(styles),
      declarations: rules.flatMap((rule) =>
        declarationsIn(rule.file, rule.body).map((declaration) => ({
          ...declaration,
          line: rule.line,
          selector: rule.selector,
        }))
      ),
    };
  }
  return cachedCorpus;
}

/** Declarations of one property family, by a predicate on the lowercased property name. */
const declarationsOf = (matches) =>
  corpus().declarations.filter((declaration) => matches(declaration.property.toLowerCase()));

/** A declaration's value with `!important` and its whitespace normalised away. */
const normaliseValue = (value) =>
  value
    .replace(/\s*!important\s*$/iu, '')
    .trim()
    .replace(/\s+/gu, ' ');

/** The row key every gate below builds: fields joined exactly as the JSON table writes them. */
const rowKey = (...fields) => fields.join(' | ');

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
  const { rules } = corpus();
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
function bareFocusSelectors() {
  const gated = [];
  const exempt = [];
  const strips = [];
  for (const rule of corpus().rules) {
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
  const { exempt } = bareFocusSelectors();

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
  const { strips } = bareFocusSelectors();

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
      'declarations — otherwise every row in the baseline could be paid off by deleting its ring'
  );
  assert.equal(
    strip('.fabricate-button:focus, .manager-nav-button:focus', 'outline: none; box-shadow: none;'),
    null,
    'appending a compound to a recognised strip must break the shape, or the allow-list is a ' +
      'place to hide anything — the same reason the reset blocks are matched whole'
  );
});

test('no bare :focus selector survives outside a Foundry-core reset', () => {
  const { gated } = bareFocusSelectors();
  const observed = tallyByKey(gated, (entry) => rowKey(entry.file, entry.compound));

  assertRatchet({
    label: 'bare `:focus` selectors',
    baseline: KNOWN_BARE_FOCUS_SELECTORS,
    pinnedTotal: KNOWN_BARE_FOCUS_TOTAL,
    observed,
    scanned: corpus().rules.length,
    floor: 3000,
    guidance:
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
      'replacing it. Do not book one of those in the baseline; widen the recognition instead.',
  });
});

/* ──────────────────────────── gate 2: viewport @media ──────────────────────────── */

/** An `@media` at-rule with a block, and the query text it opens with. */
const MEDIA_AT_RULE = /@media\b([^{]*)\{/gu;

/** The user-preference features a query may test. Everything else is a viewport breakpoint. */
const USER_PREFERENCE = /prefers-reduced-motion|prefers-contrast|forced-colors/u;

/** Every `@media` in the corpus, with its query normalised and its line. */
function mediaQueries() {
  const found = [];
  for (const [file, css] of Object.entries(corpus().styles)) {
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

test('no viewport breakpoint is introduced, and user-preference queries stay exempt', () => {
  const all = mediaQueries();
  const gated = all.filter((entry) => !USER_PREFERENCE.test(entry.query));

  // THE EXEMPTION, PROVED LIVE. A predicate that quietly matched everything would empty this
  // baseline wholesale, which reads like debt paid down rather than like a gate switched off.
  assert.ok(
    all.length - gated.length > 0,
    'no `@media` query tests a user preference any more, so the exemption this gate grants is ' +
      'granted to nothing and could be widened to anything without a single row moving — or, the ' +
      'other reading and the worse one, the at-rule scan has stopped matching anything at all'
  );

  // THE FLOOR IS OVER THE CORPUS, NOT OVER THE QUERIES.
  assertRatchet({
    label: 'viewport `@media` breakpoints',
    baseline: KNOWN_VIEWPORT_MEDIA_QUERIES,
    pinnedTotal: KNOWN_VIEWPORT_MEDIA_TOTAL,
    observed: tallyByKey(gated, (entry) => rowKey(entry.file, entry.query)),
    scanned: corpus().rules.length,
    floor: 3000,
    guidance:
      'The Foundry contract binds every primitive: an application window is RESIZED BY THE USER ' +
      'and is not the viewport, so a `@media (max-width: …)` asks the wrong question and answers ' +
      'it with the monitor. Use a container query against the app root. `prefers-reduced-motion`, ' +
      '`prefers-contrast` and `forced-colors` are user preferences rather than geometry and stay ' +
      'exempt.',
  });
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
const fontWeights = () =>
  declarationsOf((property) => property === 'font-weight').map((declaration) => ({
    ...declaration,
    value: normaliseValue(declaration.value),
  }));

test('no font weight leaves the published ramp', () => {
  const weights = fontWeights();
  const offRamp = weights.filter((declaration) => !WEIGHT_RAMP.includes(declaration.value));

  assertRatchet({
    label: 'off-ramp font weights',
    baseline: KNOWN_OFF_SCALE_FONT_WEIGHTS,
    pinnedTotal: KNOWN_OFF_SCALE_FONT_WEIGHT_TOTAL,
    observed: tallyByKey(offRamp, (declaration) =>
      rowKey(declaration.file, declaration.selector, declaration.value)
    ),
    scanned: weights.length,
    floor: 400,
    guidance:
      'Geometry comes from the published ladders, and weight is one of them: 400, 500, 600 and ' +
      '700 are the shipped faces. 650 and 800 have no face behind them, so the browser ' +
      'synthesises them — the glyphs are smeared rather than drawn. `inherit` is not a weight ' +
      'either; it defers the decision to whatever the caller happened to set.',
  });
});

/** Rules whose font shorthand or family names the mono face. */
function monoSelectors() {
  const named = new Set();
  for (const declaration of declarationsOf((property) => /^font(-family)?$/u.test(property))) {
    if (/var\(\s*--fab-font-mono/u.test(declaration.value)) {
      named.add(rowKey(declaration.file, declaration.selector));
    }
  }
  return named;
}

test('no mono rule asks for a weight the shipped face does not have', () => {
  // MATCHED BY SELECTOR TEXT WITHIN A FILE, not only within the rule.
  const mono = monoSelectors();
  const weights = fontWeights();
  const heavy = weights.filter((declaration) => {
    if (!mono.has(rowKey(declaration.file, declaration.selector))) return false;
    const weight = weightValue(declaration.value);
    return weight !== null && weight > 500;
  });

  assert.ok(
    mono.size > 20,
    `only ${mono.size} rules name \`var(--fab-font-mono)\`, against the ~62 this corpus holds. ` +
      'With none, this gate is an absence check over an empty set.'
  );

  assertRatchet({
    label: 'mono rules above the shipped weight',
    baseline: KNOWN_HEAVY_MONO_WEIGHTS,
    pinnedTotal: KNOWN_HEAVY_MONO_WEIGHT_TOTAL,
    observed: tallyByKey(heavy, (declaration) =>
      rowKey(declaration.file, declaration.selector, declaration.value)
    ),
    scanned: weights.length,
    floor: 400,
    guidance:
      '`styles/fabricate.css` ships JetBrains Mono at 400 and 500 and at nothing else — read the ' +
      'four `@font-face` blocks at the top of it. A mono rule asking for 600 or 700 gets a ' +
      'SYNTHESISED bold: the browser smears the 500 glyphs sideways, and the numerals stop lining ' +
      'up with the numerals beside them, which is the entire reason this face is used. Use 500, ' +
      'or use the body face.',
  });
});

/* ─────────────────────────────── gate 4: shadows ─────────────────────────────── */

/** The three published elevation tokens. */
const SHADOW_TOKEN = /^var\(\s*--fab-shadow-(sm|md|lg)\s*\)$/iu;

/** An inset ring: a border drawn as a shadow so it costs no layout. */
const INSET_RING = /^(?:inset )?0 0 0 \d+(?:\.\d+)?px var\(\s*--fab-[\w-]+\s*(?:,[^)]*)?\)$/iu;

test('no box-shadow is written outside the published elevation set', () => {
  const shadows = declarationsOf((property) => property === 'box-shadow').map((declaration) => ({
    ...declaration,
    value: normaliseValue(declaration.value),
  }));
  const offToken = shadows.filter(
    (declaration) =>
      !SHADOW_TOKEN.test(declaration.value) &&
      declaration.value.toLowerCase() !== 'none' &&
      !INSET_RING.test(declaration.value)
  );

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

  assertRatchet({
    label: 'off-token box-shadows',
    baseline: KNOWN_OFF_TOKEN_SHADOWS,
    pinnedTotal: KNOWN_OFF_TOKEN_SHADOW_TOTAL,
    observed: tallyByKey(offToken, (declaration) =>
      rowKey(declaration.file, declaration.selector, declaration.value)
    ),
    scanned: shadows.length,
    floor: 60,
    guidance:
      'Token foundations are the only source of elevation. `--fab-shadow-sm`, `--fab-shadow-md` ' +
      'and `--fab-shadow-lg` are the three heights this product has, and a hand-written offset ' +
      'and blur is a fourth that no other surface can match. `none` and an inset ring — a border ' +
      'drawn without costing layout — are the two shapes that are not elevation and stay allowed.',
  });
});

/* ────────────────────────── gate 5: native <select> ────────────────────────── */

/** The marker that exempts one element, and the reason it must carry. */
const NATIVE_SELECT_MARKER = /<!--\s*native select:\s*\S/u;

/** How many lines above an element the marker may sit and still apply to it. */
const MARKER_LOOKBACK = 5;

/** Whether a `<!-- native select: reason -->` marker sits within reach above `line`. */
function markedNative(source, line) {
  const lines = source.split('\n');
  return lines
    .slice(Math.max(0, line - 1 - MARKER_LOOKBACK), line - 1)
    .some((text) => NATIVE_SELECT_MARKER.test(text));
}

/** Every `<select>` element in the UI corpus, with whether it is marked. */
function nativeSelects(templates) {
  const found = [];
  for (const { file, source, ast } of templates) {
    walkElements(ast.fragment, (element) => {
      if (element.type !== 'RegularElement' || element.name.toLowerCase() !== 'select') return;
      const line = source.slice(0, element.start).split('\n').length;
      found.push({ file, line, marked: markedNative(source, line) });
    });
  }
  return found;
}

test('an unmarked native <select> is debt, and the marker comment is what exempts one', () => {
  // BOTH POLARITIES, SYNTHETIC, because no file in the tree carries the marker.
  const withMarker = [
    '<!-- native select: the Foundry drop-down is the only control a DialogV2 body can host. -->',
    '<select bind:value={choice}><option>a</option></select>',
  ].join('\n');
  const withoutMarker = [
    '<!-- A plain comment saying nothing about a native select. -->',
    '<select bind:value={choice}><option>a</option></select>',
  ].join('\n');
  const withProseOnly = [
    '<!-- This component renders a native select on purpose. -->',
    '<select bind:value={choice}><option>a</option></select>',
  ].join('\n');

  const marked = (source) => markedNative(source, source.split('\n').length);

  assert.ok(marked(withMarker), 'the marker admits the element beneath it');
  assert.ok(!marked(withoutMarker), 'an unrelated comment must not exempt anything');
  assert.ok(
    !marked(withProseOnly),
    'prose describing a native select is not the marker. The marker is a specific token, so a ' +
      'docblock explaining a decision cannot exempt an element by accident — which matters here ' +
      'because two components in this corpus carry exactly such a docblock and are baselined.'
  );
  assert.ok(
    !markedNative(withMarker, 1 + MARKER_LOOKBACK + 1),
    `the marker must not reach further than ${MARKER_LOOKBACK} lines, or one comment at the top ` +
      'of a file exempts every element in it'
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
  const sources = collectWorkingTreeSources(['src'], ['.svelte']);
  for (const file of CONVERTED) {
    const source = sources[file];
    assert.ok(
      typeof source === 'string',
      `${file} is not in the source walk, so this clause is checking nothing. Either the file ` +
        'moved — retarget this list — or the walk has stopped reading `.svelte`.'
    );
    assert.equal(
      (source.match(new RegExp(NATIVE_SELECT_MARKER, 'gu')) ?? []).length,
      0,
      `${file} carries a \`<!-- native select: … -->\` marker. Issues 1504 and 1511 lowered the ` +
        'native select pin by converting this file to the app’s own option list; a marker here ' +
        'would have lowered the same pin by the same amount while the operating system’s ' +
        'drop-down went on shipping, which is the one way that ratchet can be paid without the ' +
        'defect being fixed.'
    );
  }
});

/** The one phrase both published documents state the ratchet's pin in. */
const PIN_PHRASE = /(\d+) elements across (\d+)\s*(?:<code>)?`?\.svelte`?(?:<\/code>)? files/u;

/** The `### Requirement:` section that owns the select pin, so a fragment cannot match elsewhere. */
function selectRequirement() {
  const spec = readFileSync(new URL('../../openspec/specs/design-system/spec.md', import.meta.url), 'utf8');
  const heading = '### Requirement: Every select renders the app’s own option list';
  const start = spec.indexOf(heading);
  assert.ok(
    start !== -1,
    'the design-system spec no longer carries an "Every select renders the app’s own option ' +
      'list" requirement, so this clause is pinning a sentence in a section that has been ' +
      'renamed or dropped. Retarget it, or delete it deliberately.'
  );
  const end = spec.indexOf('\n### ', start + heading.length);
  return spec.slice(start, end === -1 ? spec.length : end);
}

/**
 * Assert one document's pin phrase names today's two constants, each in its own position.
 *
 * @param {string} where The document, for the failure message.
 * @param {string} sentence The single sentence carrying the pin.
 */
function assertPinPhrase(where, sentence) {
  const match = sentence.match(PIN_PHRASE);
  assert.ok(
    match,
    `${where}'s pin no longer reads "<N> elements across <M> .svelte files", so this clause has ` +
      `stopped reading the phrase it was written to pin rather than found it correct. It reads: ${sentence}`
  );
  const [, elements, files] = match;
  assert.equal(
    Number(elements),
    KNOWN_NATIVE_SELECT_TOTAL,
    `${where} publishes ${elements} native select ELEMENTS against a ratchet pinned at ` +
      `${KNOWN_NATIVE_SELECT_TOTAL}`
  );
  assert.equal(
    Number(files),
    KNOWN_NATIVE_SELECT_ELEMENTS.length,
    `${where} publishes ${files} FILES against a baseline of ${KNOWN_NATIVE_SELECT_ELEMENTS.length}`
  );
}

test('both published pin sentences state the two numerals this ratchet measures', () => {
  // THE SENTENCE, NOT THE SECTION. The requirement's next line carries HISTORICAL figures.
  // pin's earlier values — so a stale pin could match one of those and read as green. The slice
  // is therefore the one sentence that begins "The figure is the RATCHET'S PIN", which is the
  // only sentence in the spec making a claim about today's constants.
  const requirement = selectRequirement();
  const pin = requirement.match(/^The figure is the RATCHET'S PIN[^\n]*$/mu)?.[0];
  assert.ok(
    pin,
    'the requirement no longer carries a sentence beginning "The figure is the RATCHET\'S PIN", ' +
      'so this clause has stopped reading the sentence it was written to pin rather than found ' +
      'it correct'
  );
  assertPinPhrase('the design-system spec', pin);

  const library = readFileSync(
    new URL('../../openspec/specs/design-system/library.html', import.meta.url),
    'utf8'
  );
  const specimenPin = library.match(/Every remaining native select is recorded DEBT[^<]*<b>[^<]*<code>[^<]*<\/code>[^<]*<\/b>/u)?.[0];
  assert.ok(
    specimenPin,
    'the select specimen in `library.html` no longer carries an "Every remaining native select ' +
      'is recorded DEBT against the ratchet" sentence ending in the bolded pin, so this clause ' +
      'is reading nothing'
  );
  assertPinPhrase('the `library.html` select specimen', specimenPin);
});

test('no new native <select> is rendered by a Svelte template', () => {
  const templates = parsedTemplates();
  const unmarked = nativeSelects(templates).filter((element) => !element.marked);

  assertRatchet({
    label: 'native `<select>` elements',
    baseline: KNOWN_NATIVE_SELECT_ELEMENTS,
    pinnedTotal: KNOWN_NATIVE_SELECT_TOTAL,
    observed: tallyByKey(unmarked, (element) => element.file),
    scanned: templates.length,
    floor: 250,
    guidance:
      'Every select renders the app’s own option list — a native `<select>` draws the OPERATING ' +
      'SYSTEM’s drop-down, which carries none of the app’s type, colour or spacing and cannot be ' +
      'themed at all. Use the shared picker. Where a surface genuinely cannot host a Svelte ' +
      'component, write `<!-- native select: your reason -->` on the line above the element and ' +
      'the gate will accept it.',
  });
});

/** The template-string channel: `<select>` written into a JavaScript dialog body. */
function nativeSelectsInJavaScript() {
  const found = [];
  for (const [file, source] of Object.entries(collectWorkingTreeSources(['src'], ['.js']))) {
    for (const [index, text] of stripComments(source).split('\n').entries()) {
      if (/<select[\s>]/iu.test(text)) found.push({ file, line: index + 1 });
    }
  }
  return found;
}

test('no new native <select> is written into a JavaScript template string', () => {
  // THE CHANNEL THE TEMPLATE WALK CANNOT SEE. A DialogV2 body is an HTML string built in a `.js`
  // module, so `svelte/compiler` never reads it and the clause above is blind to all four of them.
  const found = nativeSelectsInJavaScript();
  const sources = collectWorkingTreeSources(['src'], ['.js']);

  assertRatchet({
    label: 'native `<select>` in JavaScript template strings',
    baseline: KNOWN_NATIVE_SELECTS_IN_JS,
    pinnedTotal: KNOWN_NATIVE_SELECTS_IN_JS_TOTAL,
    observed: tallyByKey(found, (entry) => entry.file),
    scanned: Object.keys(sources).length,
    floor: 250,
    guidance:
      'All four of these are DialogV2 bodies, which cannot host a Svelte component and so cannot ' +
      'use the app’s own option list. Issue 1504 states that exemption permanently. Until it ' +
      'does, a NEW one is a new surface built on a dialog, and the question to answer first is ' +
      'whether it should be an application window instead.',
  });
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
  if (!token.includes('var(')) return { ok: false, resolved: null };
  const candidates = resolveValueCandidates(token, definitions)
    .candidates.filter((candidate) => !candidate.includes('var('))
    .sort(byCodePoint);
  if (candidates.length === 0) return { ok: false, resolved: null };
  const offending = candidates.filter((candidate) => !RADIUS_LADDER.includes(candidate));
  return offending.length === 0
    ? { ok: true, resolved: null }
    : { ok: false, resolved: offending[0] };
}

/** Every off-ladder corner value in the corpus, as `{file, property, value}` findings. */
function offLadderRadii() {
  const { definitions } = corpus();
  const findings = [];
  for (const declaration of declarationsOf((property) => RADIUS_PROPERTY.test(property))) {
    for (const token of radiusTokens(normaliseValue(declaration.value))) {
      const { ok, resolved } = radiusCompliance(token, definitions);
      if (ok) continue;
      findings.push({
        file: declaration.file,
        line: declaration.line,
        property: declaration.property.toLowerCase(),
        value: resolved === null ? token : `${token} => ${resolved}`,
      });
    }
  }
  return findings;
}

test('a radius written into a token still resolves, so the ladder cannot be paid by renaming', () => {
  // THE RESOLUTION HALF, PROVED IN BOTH DIRECTIONS AGAINST SYNTHETIC DEFINITIONS. The live corpus
  // exercises it — `--fab-books-control-radius` is 5px and appears in the baseline at its resolved
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
    // The row is pinned as `raw => resolved` for exactly this.
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

test('no corner radius leaves the published ladder', () => {
  const radii = declarationsOf((property) => RADIUS_PROPERTY.test(property));

  assertRatchet({
    label: 'off-ladder corner radii',
    baseline: KNOWN_OFF_LADDER_RADII,
    pinnedTotal: KNOWN_OFF_LADDER_RADIUS_TOTAL,
    observed: tallyByKey(offLadderRadii(), (finding) =>
      rowKey(finding.file, finding.property, finding.value)
    ),
    scanned: radii.length,
    floor: 500,
    guidance:
      'Geometry comes from the published ladders. The radius ladder is 6px, 7px, 9px and 11px, ' +
      'plus `0`, `999px` for a pill and `50%` for a circle — 8px is not on it however natural it ' +
      'looks beside a 16px inset. Pick the nearer rung. Writing the value into a custom property ' +
      'does not help: this scan resolves `var()`, so the row survives with its text changed.',
  });
});

/** The four rungs the icon-chip size ladder publishes. */
const ART_SIZE_LADDER = new Set([22, 26, 30, 38]);

/** The components that ARE the art tile. */
const ART_TILE_COMPONENTS = new Map([
  ['Medallion', 40],
  ['Avatar', 32],
]);

/**
 * Every art-tile render site, as `{ file, size }` with `size` a number or the string `dynamic`.
 *
 * @returns {{ file: string, size: number|'dynamic' }[]}
 */
function artTileSizes() {
  const found = [];
  for (const { file, source, ast } of parsedTemplates()) {
    walkElements(ast.fragment ?? ast, (element) => {
      if (element.type !== 'Component' || !ART_TILE_COMPONENTS.has(element.name)) return;
      const text = attributeText(source, element, 'size');
      // An absent `size` takes the primitive's OWN default.
      if (text === null) {
        found.push({ file, size: ART_TILE_COMPONENTS.get(element.name) });
        return;
      }
      const literal = /^size=\{\s*(\d+(?:\.\d+)?)\s*\}$/u.exec(text);
      found.push({ file, size: literal ? Number(literal[1]) : 'dynamic' });
    });
  }
  return found;
}

test('no new art tile renders at an off-ladder size', () => {
  const sites = artTileSizes();
  const offLadder = sites.filter(
    (site) => site.size === 'dynamic' || !ART_SIZE_LADDER.has(site.size)
  );

  // NON-VACUITY, and it is worth its own line here. Every clause below quantifies over
  // `offLadder`, and the population it is drawn from is the whole reason this table can be
  // trusted: a scan that had stopped recognising the tile's component name would produce an
  // empty `sites`, an empty `offLadder`, and forty VANISHED rows — loud, but reported as debt
  // paid rather than as a broken scan. The `scanned` floor below says the same thing in
  // `assertRatchet`'s own language; this says it about the tile itself.
  assert.ok(
    sites.some((site) => ART_SIZE_LADDER.has(site.size)),
    'no art tile in the tree renders at a published rung, so the ladder this gate filters ' +
      'against is matching nothing and every site would be recorded as debt'
  );

  assertRatchet({
    label: 'off-ladder art-tile sizes',
    baseline: KNOWN_OFF_LADDER_ART_SIZES,
    pinnedTotal: KNOWN_OFF_LADDER_ART_SIZE_TOTAL,
    observed: tallyByKey(offLadder, (site) => `${site.file} | ${site.size}`),
    scanned: sites.length,
    floor: 40,
    guidance:
      'Art and portraits carry their own size ladder — 22, 26, 30 and 38, default 26 — and this ' +
      'table records every render site that is off it. A NEW row is not automatically wrong: ' +
      'restricting `size` would move almost every art tile in the app, so the geometry sweep ' +
      'owns that correction and this pin is what lets it lower a number rather than re-derive a ' +
      'census. What a new row does mean is that a decision was taken about one tile in ' +
      'isolation, so state the rung you rejected and why. A VANISHED row is the sweep working, ' +
      'or a scan that has stopped seeing the tile — check which before banking it.',
  });
});

/* ─────────────── gate 7: one declaration each, over the module sheet alone ─────────────── */

/** The module sheet's own rules, censused once. */
let cachedSheetRules = null;
function sheetRules() {
  if (cachedSheetRules === null) {
    const css = corpus().styles[MODULE_SHEET];
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
 * Derived from the sheet rather than asserted: 9 roots over 9 blocks, every one of them
 * legitimate today, which is exactly why a tenth would not stand out to a reader. It was 9
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
 * `StatusToggle` is NOT here and must not be, for a structural reason rather than an oversight:
 */
const RING_ROOTS = Object.freeze(
  [
    MODULE_ROOT,
    '.fabricate-button',
    '.fabricate-field',
    '.fabricate-icon-button',
    '.fabricate-pagination',
    '.fabricate-roll-prompt-dialog',
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
      'measured at fifteen carriers of the target tuple: four are PINNED by a test or a script ' +
      'that reads their selectors, seven are recorded non-adopters and four are unpinned. The ' +
      'new non-adopter is the read-only dense ListRow in issue 1648, not a field; the two ' +
      'carriers that left are select skins issue 1510 took — the recipe overview cells, deleted ' +
      'when that row became the shared `<Select>`, and the Tool rails\x27 `Preview as` actor ' +
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
  for (const { file, source, ast } of parsedTemplates()) {
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
    15,
    'the census is fifteen carrier blocks. `WITHDRAWN_UTILITIES` publishes that population and ' +
      'its four-pinned / seven-non-adopter / four-unpinned split as prose, so a carrier arriving ' +
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

/** A repeated selector's ratchet key: `<at-context chain> | <normalised selector>`. */
const repetitionKey = (entry) =>
  rowKey(entry.atContext.length > 0 ? entry.atContext.join(' >> ') : '(top level)', entry.selector);

/** The six contextual figures `selector-repetition-baseline.js` publishes about the sheet. */
const PUBLISHED_REPETITION_FIGURES = Object.freeze([
  ['keyed on the selector alone', /ALONE the sheet holds ([\d,]+) repeated selectors/],
  // THE COPY IN THIS FILE, which the first shape of this gate exempted (issue 1503, review r2).
  [
    'every (at-context, selector) key',
    /Unfiltered the sheet holds ([\d,]+) `\(at-context, selector\)`\n {2}\/\/ keys under this very keying/,
  ],
  [
    'keys appearing exactly once',
    /keys under this very keying, of which ([\d,]+) appear exactly once/,
  ],
  ['repeated keys, keyed on (at-context, selector)', /rather than these ([\d,]+),/],
  ['every (at-context, selector) key', /Unfiltered, the sheet holds ([\d,]+) `\(at-context, selector\)` keys/],
  ['keys appearing exactly once', /of which ([\d,]+) appear exactly\n \* once/],
  ['rules in the sheet', /The sheet holds ([\d,]+) rules at that head/],
  ['repeated keys, keyed on (at-context, selector)', /rules at that head, ([\d,]+) repeated keys/],
  ['appearances between the repeated keys', /repeated keys and ([\d,]+) appearances/],
  ['appearances between the repeated keys', /measured commit it is ([\d,]+) across/],
  ['repeated keys, keyed on (at-context, selector)', /it is [\d,]+ across ([\d,]+) rows/],
]);

test("the repetition ledger publishes the figures the sheet actually produces", () => {
  // WHY THIS IS A GATE AND NOT A CAREFUL READER. `selector-repetition-baseline.js` publishes six
  // contextual figures about the sheet, and its own docblock records that an earlier draft's went
  // stale after a rebase and that "no gate could see it because none of them is pinned". None was
  // — so when issue 1503 re-banked the table from 119 keys / 244 appearances to 116 / 238, the
  // prose kept stating the old numbers and every suite stayed green over four wrong figures. The
  // one it calls "the one figure a reviewer can check against the issue without reading the
  // table" was among them.
  const rules = sheetRules();
  const entries = [...selectorAppearances(rules).values()];
  const repeated = entries.filter((entry) => entry.appearances.length > 1);
  const bare = [...selectorAppearances(rules, { keyByAtContext: false }).values()];

  const measured = new Map([
    ['keyed on the selector alone', bare.filter((entry) => entry.appearances.length > 1).length],
    ['repeated keys, keyed on (at-context, selector)', repeated.length],
    ['every (at-context, selector) key', entries.length],
    ['keys appearing exactly once', entries.length - repeated.length],
    ['rules in the sheet', rules.length],
    [
      'appearances between the repeated keys',
      repeated.reduce((sum, entry) => sum + entry.appearances.length, 0),
    ],
  ]);

  // BOTH FILES THAT PUBLISH THESE FIGURES.
  const source = ['./selector-repetition-baseline.js', './design-system-debt-ratchets.test.js']
    .map((path) => readFileSync(new URL(path, import.meta.url), 'utf8'))
    .join('\n');
  const wrong = [];
  for (const [label, pattern] of PUBLISHED_REPETITION_FIGURES) {
    const found = source.match(pattern);
    assert.ok(
      found,
      `the docblock no longer states ${label} in the shape ${pattern}, so this clause has stopped ` +
        'reading the figure it was written to pin rather than found it correct'
    );
    const published = Number(found[1].replaceAll(',', ''));
    if (published !== measured.get(label)) {
      wrong.push(`${label}: the docblock says ${found[1]}, the sheet produces ${measured.get(label)}`);
    }
  }

  assert.deepEqual(
    wrong.sort(byCodePoint),
    [],
    'these figures are published in `selector-repetition-baseline.js` as facts about the sheet ' +
      'and are now false of it. Re-derive them with `node scripts/stylesheet-selector-census.mjs` ' +
      `and say in the pull request which rule moved:\n  ${wrong.join('\n  ')}`
  );
});

test("the module sheet's cross-list selector repetition does not move", () => {
  // FILTERED TO count >= 2 ON BOTH SIDES. Unfiltered the sheet holds 3,041 `(at-context, selector)`
  // keys under this very keying, of which 2,931 appear exactly once; `assertRatchet` compares key
  // by key, so an unfiltered table would report every singleton as new debt the first time anybody
  // added a rule. Filtering both sides keeps a selector FALLING to one appearance visible: it
  // leaves the observed tally, and a baseline row nothing matches is a VANISHED failure.
  const rules = sheetRules();
  const repeated = [...selectorAppearances(rules).values()].filter(
    (entry) => entry.appearances.length > 1
  );

  assertRatchet({
    label: 'repeated `styles/fabricate.css` selectors',
    baseline: SELECTOR_REPETITION_BASELINE,
    pinnedTotal: SELECTOR_REPETITION_TOTAL,
    // ONE ITEM PER APPEARANCE, so the tally counts appearances rather than keys and its sum is the
    // figure `assertRatchet` checks the pinned total against.
    observed: tallyByKey(
      repeated.flatMap((entry) => entry.appearances.map(() => entry)),
      repetitionKey
    ),
    scanned: rules.length,
    floor: 2000,
    guidance:
      'This is an EXACT PIN rather than a ceiling, and it is a description of deliberate ' +
      'authoring rather than a defect count — see `selector-repetition-baseline.js`. Almost every ' +
      'row is one selector written into two DIFFERENT comma-separated lists, which `stylelint`’s ' +
      '`no-duplicate-selectors` allows by design and which splitting a list to "fix" would turn ' +
      'into the duplicate list that rule does reject. A row that GREW or APPEARED means a list ' +
      'was widened or a rule copied; one that SHRANK or VANISHED means a list was split or a rule ' +
      'deleted, which moves declarations through the cascade. Neither is wrong on its face and ' +
      'both are edits a reviewer should see: re-derive the table with ' +
      '`node scripts/stylesheet-selector-census.mjs`, update the row and the pinned total ' +
      'together, and say in the pull request which rule moved and why.',
  });
});
