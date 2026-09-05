/**
 * Six design-system rules the spec states and nothing enforced (issue 1497), and two invariants
 * of the module sheet beside them (issue 1501).
 *
 * `openspec/specs/design-system/spec.md` is normative. Until this file, three of its rules had a
 * gate — the control-height ladder, the spacing scale and the token generation — and the rest were
 * prose that shipped whatever the last change happened to write. Measured against that silence:
 * 24 bare `:focus` selectors, five viewport breakpoints, 40 wrong font weights, 26 off-token
 * shadows, 99 native `<select>` elements in templates and four more in dialog bodies, and 318
 * off-ladder corner values.
 *
 * This file FREEZES all of it. It does not require any of it to be fixed, and it cannot decide on
 * its own that a given value is wrong — a ratchet is not a linter. What it does is make every NEW
 * offence an edit to a pinned number that a reviewer has to accept, and make every PAYMENT an
 * edit too, so debt cannot be quietly discharged without the slot closing behind it. The table is
 * `design-system-known-debt.json`; the reasons each row exists are in the `.js` beside it.
 *
 * ── THE TWO CLAUSES THAT ARE NOT DEBT AT ALL ────────────────────────────────────────────
 * Gates 7 and 8 read `styles/fabricate.css` ALONE and hold down something the six do not.
 * Gate 7 asserts that each module-rooted UTILITY, and each half of the module focus PAIR, is
 * declared exactly once — the property issue 1501 bought by collapsing per-application copies
 * onto `.fabricate`, and the one a later per-area copy would quietly take back — and that each
 * class that issue measured and WITHDREW is still absent, with issue 1523 named in the failure
 * so the child that declares one meets a gate saying removing it is the intended outcome.
 * Gate 8 pins how often the sheet writes one selector into more than one comma-separated LIST.
 *
 * Neither is a defect count: `design-system/spec.md` prohibits nothing either one measures, and
 * `selector-repetition-baseline.js` records why its pin is EXACT rather than a ceiling. They
 * live in this file rather than a sibling because gate 7 recognises the reset through
 * `focusResetRoot`, which is module-private and is gate 1's own allow-list, and because gate 8
 * reads the sheet gate 1 already read.
 *
 * ── WHAT THE SIX GATES SHARE, AND WHY IT IS ONE FILE ────────────────────────────────────
 * Five of the six read the same corpus in the same way: `styles/fabricate.css` plus every Svelte
 * scoped `<style>` block, through `collectStyleCorpus` and `rulesIn`. That corpus is built ONCE
 * here and handed to each clause. Splitting them into six files would walk it six times and, more
 * importantly, would tempt a sixth hand-written CSS walk — which is the failure
 * `tests/helpers/styleBlockScan.js` exists to prevent and whose line-citation defect its docblock
 * records.
 *
 * ── EVERY ALLOW-LIST HAS BOTH POLARITIES PROVED ─────────────────────────────────────────
 * Three of these gates carry an exemption, and an exemption proved only by the tree passing is an
 * exemption that can silently widen to everything. So each is exercised against a SYNTHETIC
 * fixture asserting both directions inside `npm test`: the `:focus` reset shape admits the five
 * real blocks and rejects a seventh that merely mentions a root; the native-select marker comment
 * admits an element and its absence fails; and a `var()` radius resolves rather than being skipped
 * for being indirection. A red-proof in a PR description proves a gate fired once, on one day; a
 * both-polarity fixture proves it can still fire on the day the allow-list is widened.
 *
 * ── NON-VACUITY IS PER GATE, NOT PER FILE ───────────────────────────────────────────────
 * An absence check over an empty corpus passes forever and reports itself satisfied. Two controls
 * stand against that and they answer different questions. The corpus reach clause asserts BOTH
 * halves are being read — one `.css` and more than 100 Svelte blocks — because a total has slack
 * and cannot see the scoped half dropping out. And every ratchet passes its own `scanned`/`floor`
 * over the population IT looked at: font weights for the weight gate, radius declarations for the
 * radius gate, parsed templates for the select gate. A shared floor would be satisfied by a gate
 * whose own filter had stopped matching.
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

/**
 * The CSS corpus, its rules and its custom-property definitions, built once.
 *
 * Lazily, so a walk failure is reported as a failing test rather than as an unattributed
 * module-load throw that escapes the `# fail` count entirely — the arrangement
 * `spacing-scale-ratchet.test.js` uses for the same reason.
 *
 * A rule's DECLARATIONS are read out of `rule.body` rather than out of the whole file, which
 * costs the line number and buys two things. It buys the selector, without which none of these
 * gates can say which control is wrong. And it excludes at-rule bodies and stray selector text:
 * `declarationsIn` matches at a `;`, `{` or `}` boundary, so run over a whole file it reads
 * `button:hover,` — the first line of a two-line selector list — as a declaration of `button`.
 * Two such phantoms exist in this corpus and neither reaches any clause below.
 *
 * The cost is real and is paid deliberately: a finding cites `file:line` of its RULE, not of its
 * declaration. For a hand-written rule of five declarations that is the same screen; for the
 * 300-line manager blocks it is a few lines up. The baseline keys carry the selector and the
 * value, which is what a reader searches on anyway.
 */
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

/**
 * The element targets a Foundry-core focus reset names, and the three shapes those blocks take.
 *
 * The allow-list is by ROOT PLUS SHAPE, never by line. FIVE blocks in the sheet suppress core's
 * orange focus ring so the Fabricate accent can be drawn by the `:focus-visible` block beneath
 * them, and every one of them is written as one root class crossed with this target list. A
 * line-range allow-list would need re-measuring on every edit to a 20,000-line file — and worse,
 * would silently start exempting whatever moved into the range.
 *
 * The three shapes are the whole permission. `.fabricate` — the module root, which issue 1501
 * collapsed the app and manager pairs onto — includes `a` because the manager renders links;
 * `.fabricate-roll-prompt-dialog` is a DialogV2 body with no textarea and no `[tabindex]` target,
 * so it names three. A block that suppressed the ring for one more element than its shape allows
 * is NOT this pattern and is not exempt.
 */
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
 * EVERY compound has to fit, under ONE root, and the target set has to be exactly one of the
 * published shapes. Each of those three conditions is load-bearing: without the first, appending
 * `.manager-thing:focus` to a reset block's list exempts it; without the second, a list spanning
 * two areas is exempt in both; without the third, the shape stops being a shape.
 *
 * The half is a PARAMETER because the two halves are the same shape by requirement rather than by
 * coincidence: issue 1501's module-rooted pair is only sound while the ring names exactly the
 * elements the reset suppressed, so the clause asserting that the ring is declared once has to
 * recognise it by the same shape rather than by its text.
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

/**
 * The three primitive families that root their own focus chrome, and the one compound each may
 * write for the STRIP half of it (issue 1502).
 *
 * `Pagination` is the odd one: its family root is on a `<section>` and the controls it strips for
 * are the buttons inside it, so its compound carries an element where the other two do not.
 */
const PRIMITIVE_FOCUS_STRIPS = Object.freeze([
  '.fabricate-button:focus',
  '.fabricate-icon-button:focus',
  '.fabricate-pagination button:focus',
]);

/** The strip half's declaration set, exactly — property to normalised value, nothing else. */
const FOCUS_STRIP_DECLARATIONS = Object.freeze({ outline: 'none', 'box-shadow': 'none' });

/**
 * The primitive family compound a rule strips core focus chrome for, or `null` when it is not one.
 *
 * A SECOND exemption beside the area resets above, and it exists for the same reason they do.
 * Foundry core paints `a.button, button:focus` with an outline and a 4px glow. The five reset
 * blocks remove that inside an application root; a family rooted at a class the primitive emits
 * renders in hosts carrying no application root at all, where the repaint half alone would draw
 * the accent ring ON TOP of core's treatment rather than in place of it. `design-system/spec.md`
 * states the consequence as a rule: the chrome a primitive declares is the PAIR. The strip half
 * is therefore required chrome, not debt, and booking it in the baseline would file a
 * requirement as a defect.
 *
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

/**
 * Every selector matching bare `:focus`, split three ways: the allow-listed area resets, the
 * primitive families' strip halves, and everything else — which is what the ratchet holds down.
 */
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
  // five roots, named, so a block being renamed or split shows up here rather than as 24 rows
  // arriving in the baseline at once. The negative half is synthetic, because the tree contains no
  // look-alike today — and a permission with no counterexample is a permission nobody has tested.
  const { exempt } = bareFocusSelectors();

  assert.deepEqual(
    [...new Set(exempt.map((entry) => entry.reset))].sort(byCodePoint),
    [
      '.fabricate',
      '.fabricate-interactable-browser-app',
      '.fabricate-interactable-config-app',
      '.fabricate-interactables-manager',
      '.fabricate-roll-prompt-dialog',
    ],
    'the set of roots suppressing core focus has changed. Issue 1501 has collapsed the ' +
      'app/manager pair onto the module root `.fabricate` and issue 1520 deletes the three ' +
      'interactables copies, so this list is expected to shrink again — but each of those is a ' +
      'deliberate edit here, not a silent one.'
  );
  assert.equal(exempt.length, 24, 'the five blocks name 24 selectors between them');

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
  // THE SECOND EXEMPTION, BOTH POLARITIES, in the shape the clause above uses. The positive half
  // is the live corpus — three families, named, so a strip being renamed, split or deleted shows
  // up here rather than as three rows quietly arriving in the baseline. The negative half is
  // synthetic, because the tree holds no look-alike today, and a permission nobody has tested
  // against a counterexample is a permission that will eventually exempt something real.
  const { strips } = bareFocusSelectors();

  assert.deepEqual(
    [...new Set(strips.map((entry) => entry.strip))].sort(byCodePoint),
    [
      '.fabricate-button:focus',
      '.fabricate-icon-button:focus',
      '.fabricate-pagination button:focus',
    ],
    'the set of primitive families declaring their own focus strip has changed. Each of the ' +
      'three is the strip half of a pair `design-system/spec.md` requires, so one disappearing ' +
      'means that family repaints its ring ON TOP of Foundry core`s treatment in any host ' +
      'carrying neither application root — a deliberate edit here, never a silent one.'
  );
  assert.equal(strips.length, 3, 'one strip per family, and each family declares exactly one');

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
  //
  // It doubles as this clause's proof that the MEDIA WALK still walks, and it is the right shape
  // for that job in the way `ratchetBaseline.js` insists on: the three user-preference queries it
  // counts are precisely the part of the population this gate is NOT asserting the absence of, so
  // a broken `MEDIA_AT_RULE` reds here rather than reporting an empty tree as a clean one.
  assert.ok(
    all.length - gated.length > 0,
    'no `@media` query tests a user preference any more, so the exemption this gate grants is ' +
      'granted to nothing and could be widened to anything without a single row moving — or, the ' +
      'other reading and the worse one, the at-rule scan has stopped matching anything at all'
  );

  // THE FLOOR IS OVER THE CORPUS, NOT OVER THE QUERIES, and the two differ by three orders of
  // magnitude. This tree holds EIGHT `@media` queries, five of which are the rows below, so a
  // floor stated on that population is a floor stated on the debt: it can only be set low enough
  // to be meaningless. At four it accepted a collector that had lost HALF of what it should see,
  // and a corpus truncation — a lost root, a `<style>` extractor that stopped matching — would
  // have reached this clause as VANISHED rows, which reads as debt paid down and gets banked.
  // Floored on the rules the walk actually reads, that same truncation reds as what it is. It is
  // the corpus and the floor gate 1 uses, because it is literally the same walk.
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
  // MATCHED BY SELECTOR TEXT WITHIN A FILE, not only within the rule, and that is deliberate
  // rather than loose. The corpus repeatedly sets the family in a base rule and the weight in an
  // `@media`-nested twin carrying the IDENTICAL selector, which is one control written as two
  // rules; a rule-local test would exempt every one of them. The cost is that two unrelated rules
  // sharing a selector in one file are read as one control — which is what the cascade does too.
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

/**
 * An inset ring: a border drawn as a shadow so it costs no layout.
 *
 * Allowed because it is not elevation at all — a ring has no offset and no blur, so it neither
 * claims a z-height nor competes with the three published shadows. The token reference is
 * required: `0 0 0 2px rgb(0 0 0 / 40%)` is a colour written by hand, which the token foundation
 * requirement prohibits for its own reasons.
 */
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
  // BOTH POLARITIES, SYNTHETIC, because no file in the tree carries the marker: the exemption
  // exists for a decision nobody has yet had to make, and an unexercised exemption is one nobody
  // has proved works in EITHER direction. Two `BulkEditSelect`-shaped fixtures, one with the
  // comment and one without.
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
  //
  // COMMENTS ARE STRIPPED FIRST, and that is not tidiness: nine docblocks under `src/**` name
  // `<select>` in prose to say what a bulk-edit model binds to. A text scan that counted them
  // would report thirteen findings, nine of which cannot be fixed, and would be answered with a
  // file-level exemption for exactly the modules the gate exists to police.
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

/**
 * A shorthand value split into the corner values it sets.
 *
 * Space AND slash, because `border-radius: 6px / 11px` sets a horizontal and a vertical radius
 * and both have to be on the ladder. Depth-aware, so `var(--a, 1px 2px)` is one token rather than
 * three.
 */
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
 * RESOLUTION IS WHAT KEEPS THE RATCHET FROM BEING PAYABLE BY RENAMING. With a text-only scan the
 * cheapest way to clear a row is `--panel-radius: 8px; border-radius: var(--panel-radius)` — the
 * corner does not move and the gate goes green. So an indirect value is followed, and it is
 * compliant only when EVERY definition it can reach is on the ladder: a token defined twice, once
 * per theme, is two answers and the cascade picks between them by specificity, which a text
 * scanner does not know.
 *
 * A candidate still containing `var(` is dropped rather than judged. It is the unexpanded text —
 * `resolveValueCandidates` unions the raw with the resolved — and a token this corpus does not
 * define at all (one is set from Svelte markup) contributes only its fallback, which is the one
 * value a stylesheet reader can actually see.
 *
 * @returns {{ok: boolean, resolved: string|null}} `resolved` names the offending value when the
 *   token is indirect, so the row can be pinned as `raw => resolved` rather than as a name.
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
    // The row is pinned as `raw => resolved` for exactly this: the cited line carries no pixel
    // value anywhere on it, and a reader given only the token name cannot adjudicate the finding.
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

/* ─────────────── gate 7: one declaration each, over the module sheet alone ─────────────── */

/**
 * The module sheet's own rules, censused once.
 *
 * READ OVER `styles/fabricate.css` ALONE, and that is the whole reason this clause is not written
 * over `corpus()`. `SegmentedControl.svelte` restates the visually-hidden set byte-identically in
 * its own scoped block, deliberately and correctly — a scoped block is the component's, not the
 * module's — so a check by declaration SHAPE over the combined corpus would report two copies of a
 * utility that is declared once. The question this gate asks is about the module sheet: is there
 * one rule in it that declares this class.
 *
 * `censusRules` rather than `rulesIn`, because it is the walk that already reports a rule's
 * declarations and its normalised selector list, and issue 1501's ratchet below reads the same
 * value. Two walks over one file would be two answers to `how many rules does this sheet have`.
 */
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

/**
 * The utilities issue 1501 shipped, each declared ONCE and rooted at the module root.
 *
 * `.fabricate` is the class every Fabricate application root emits, so one rule there reaches the
 * player app, the manager, the three interactables windows and the roll-prompt dialog. The
 * assertion is by CLASS NAME rather than by declaration shape for the reason `sheetRules` gives,
 * and it pins the whole selector rather than only the count: a second copy under
 * `.fabricate-manager` is the defect this collapse removed, and it would satisfy a bare count of
 * one if the module-rooted rule were the one deleted.
 */
const MODULE_UTILITIES = Object.freeze([
  { name: 'visually-hidden', selector: '.fabricate .visually-hidden' },
  { name: 'fab-truncate', selector: '.fabricate .fab-truncate' },
  { name: 'fab-stack', selector: '.fabricate .fab-stack' },
  { name: 'fab-cluster', selector: '.fabricate .fab-cluster' },
]);

/**
 * The two halves of the module-rooted focus pair, recognised by SHAPE rather than by text.
 *
 * The reset half runs through {@link focusResetRoot}, which gate 1 already uses as its allow-list,
 * so this clause cannot be satisfied by a look-alike that merely mentions the root — and cannot
 * drift from the exemption, because a rule recognised here is by construction a rule exempted
 * there.
 */
const MODULE_FOCUS_PAIR = Object.freeze([
  {
    half: 'the Foundry-core focus reset',
    compound: RESET_COMPOUND,
    declarations: { outline: 'none', 'box-shadow': 'none' },
    areaRoots: [
      '.fabricate-interactable-browser-app',
      '.fabricate-interactable-config-app',
      '.fabricate-interactables-manager',
      '.fabricate-roll-prompt-dialog',
    ],
  },
  {
    half: 'its paired :focus-visible ring',
    compound: RING_COMPOUND,
    declarations: { outline: '2px solid var(--fab-accent)', 'outline-offset': '2px' },
    // THREE, NOT FOUR, AND THE MISSING ONE IS NOT AN OVERSIGHT. The roll-prompt dialog writes its
    // ring as `button, input` in one block and `select` alone in another — neither list is one of
    // `RESET_SHAPES`, so this recogniser does not see either as a copy of the pair. Its RESET half
    // is a published shape and is listed above. Issue 1520 owns all four blocks.
    areaRoots: [
      '.fabricate-interactable-browser-app',
      '.fabricate-interactable-config-app',
      '.fabricate-interactables-manager',
    ],
  },
]);

/** A primitive's OWN ring: `<root>:focus-visible`, the family class itself with no descendant. */
const SELF_RING_COMPOUND = /^(\.[\w-]+):focus-visible$/u;

/**
 * Every root that may write a `:focus-visible` ring over BARE ELEMENTS, at ANY element shape.
 *
 * WHY A SECOND, SHAPE-FREE POPULATION. The clause pinning the pair recognises a half only when its
 * element set is one of `RESET_SHAPES`, and that allow-list is opt-in in the wrong direction: a
 * ring naming two elements — `.fabricate-manager a:focus-visible, .fabricate-manager
 * button:focus-visible` — is not a published shape, so `focusPairRoot` returns `null` and the
 * clause cannot see it. Gate 1 reads bare `:focus` and never looks at `:focus-visible` at all. So
 * the RESET half is protected at every shape and, without this clause, the RING half only at
 * three.
 *
 * THE POPULATION IS KEYED ON ELEMENTS, NOT ON DECLARATIONS. What makes a block a copy of the
 * module ring is that it reaches the same elements at the same rank; the declarations are the part
 * a copy can vary — `.fabricate-app select:focus-visible` writes the ring as an inset
 * `box-shadow` — while still deciding the same state by source order. Two selector shapes are a
 * ring: `<root> <element>:focus-visible` ({@link RING_COMPOUND}) and {@link SELF_RING_COMPOUND},
 * and every member of the list has to share one root.
 *
 * A ring on a WIDGET CLASS is NOT in this population and must not be. `.fabricate-manager
 * .manager-nav-button:focus-visible` is per-widget chrome the design system allows, and the sheet
 * holds 30 of those against these 10 blocks — pinning them would pin the manager's whole widget
 * inventory to this list.
 *
 * Derived from the sheet rather than asserted: 9 roots over 10 blocks, every one of them
 * legitimate today, which is exactly why an eleventh would not stand out to a reader.
 */
const RING_ROOTS = Object.freeze(
  [
    MODULE_ROOT,
    '.fabricate-app',
    '.fabricate-button',
    '.fabricate-icon-button',
    '.fabricate-interactable-browser-app',
    '.fabricate-interactable-config-app',
    '.fabricate-interactables-manager',
    '.fabricate-pagination',
    '.fabricate-roll-prompt-dialog',
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

/**
 * The classes issue 1501 considered, measured, and did NOT declare.
 *
 * EVERY MESSAGE NAMES ISSUE 1523, and that is the point of the clause rather than a courtesy. The
 * child that declares one of these meets a gate saying, in the failure text, that removing it is
 * the intended outcome — so a later author cannot land a zero- or one-adopter class without
 * reopening the decision that withdrew it. A utility with one adopter is a RENAME rather than a
 * shared treatment, and a declared class nothing carries is a dead rule
 * `tests/styles-dead-classes.test.js` would fail on anyway.
 */
const WITHDRAWN_UTILITIES = Object.freeze([
  {
    name: 'fab-list-reset',
    why:
      'the sheet holds 20 list-reset rules and not one of them declares only that set — every ' +
      'one carries two to five further declarations, so none of them could adopt the utility ' +
      'without keeping its own rule anyway',
  },
  {
    name: 'fab-field-skin',
    why:
      'measured at five candidate blocks, four of which are PINNED by a test or a script that ' +
      'reads their selectors, leaving one adopter — below the two-adopter floor, which makes it ' +
      'a rename rather than a shared treatment',
  },
  {
    name: 'fab-card-skin',
    why:
      'exactly one block in the sheet carries the proposed border, radius and fill five-tuple, ' +
      'and one carrier is a rename rather than a shared treatment',
  },
]);

test('each module utility is declared exactly once, at the module root', () => {
  // BY CLASS NAME OVER THE MODULE SHEET ALONE. The subject compound has to BE the class, so the
  // `[data-gap]` rungs — `.fabricate .fab-stack[data-gap='1']` and its four siblings — are
  // variants of the utility rather than second declarations of it, while a re-introduced
  // `.fabricate-manager .visually-hidden` is caught: its subject compound is `.visually-hidden`
  // too, and the count goes to two.
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

/**
 * Every `data-gap` the product writes, over BOTH channels a rung can be emitted through.
 *
 * The Svelte templates are the obvious one. `rollPrompt.js` builds its dialog body as an HTML
 * string in a `.js` module, which `svelte/compiler` never reads — the same blind spot the native
 * `<select>` clause above records — and it writes two rungs, so a template-only scan would report
 * a smaller emitted set than the tree holds and clear a rung nothing declares.
 */
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

/**
 * The two utilities whose BASE rule sets a rung default, and the rung that default must equal.
 *
 * Named here rather than left implicit, because an implicit default is the drift this clause
 * exists to stop: `data-gap="2"` renders correctly only while `--fab-stack-gap` happens to be
 * `var(--fab-space-2)`, and re-rung the base and every site writing `2` moves while its markup
 * still says `2`.
 */
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
      'held when this clause was written. The floor carries slack DELIBERATELY, so that removing ' +
      'one call site reds nothing and only a collapse gets here: a walk that stopped seeing call ' +
      'sites reports a clean mirror, which is the one direction an absence check cannot ' +
      'distinguish from success.'
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
      `${half} must be written once at the module root. These area roots are issue 1520's and ` +
        'issue 1501 left them in place; any other root is a per-area copy of a pair the module ' +
        'already writes, reaching the same elements at the same rank, so which one paints is ' +
        'decided by source order rather than by anything a reader of either block can see.'
    );
  }
});

test('every root ringing bare elements on `:focus-visible` is a named one', () => {
  // THE SHAPE ALLOW-LIST IS THE HOLE THIS FILLS, and it is a hole in the ROOT list rather than in
  // the shapes: `.fabricate-manager` is absent below precisely because issue 1501 collapsed the
  // manager's element ring onto the module root, so a two-element copy under it reds here at any
  // shape the clause above would not recognise. Roots rather than blocks, because a root may
  // legitimately write two of these — the roll-prompt dialog rings `button, input` with an outline
  // and `select` with an inset shadow.
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
  // NON-VACUITY IS THE CLAUSE ABOVE. An absence check over an empty sheet passes forever, and this
  // one reads the same `sheetRules()` the two positive clauses do — so a walk that had stopped
  // matching would red there before it could report these as clean here.
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

/* ─────────────── gate 8: cross-list selector repetition in the module sheet ─────────────── */

/** A repeated selector's ratchet key: `<at-context chain> | <normalised selector>`. */
const repetitionKey = (entry) =>
  rowKey(entry.atContext.length > 0 ? entry.atContext.join(' >> ') : '(top level)', entry.selector);

/**
 * The six contextual figures `selector-repetition-baseline.js` publishes about the sheet.
 *
 * Each is `[the label the docblock writes it under, how to measure it]`. They are read out of the
 * docblock's SOURCE TEXT because that is where they are stated: a figure quoted in prose and
 * derived nowhere is exactly the mirror that rots, and this is the file that can measure it.
 */
const PUBLISHED_REPETITION_FIGURES = Object.freeze([
  ['keyed on the selector alone', /ALONE the sheet holds ([\d,]+) repeated selectors/],
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

  const source = readFileSync(
    new URL('./selector-repetition-baseline.js', import.meta.url),
    'utf8'
  );
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
  // FILTERED TO count >= 2 ON BOTH SIDES. Unfiltered the sheet holds 2,861 `(at-context, selector)`
  // keys under this very keying, of which 2,745 appear exactly once; `assertRatchet` compares key
  // by key, so an unfiltered table would report every singleton as new debt the first time anybody
  // added a rule. Filtering both sides keeps a selector FALLING to one appearance visible: it
  // leaves the observed tally, and a baseline row nothing matches is a VANISHED failure.
  //
  // THE FLOOR IS THE SHEET'S OWN RULE COUNT, not `corpus().rules` — the sibling gates' 3,000 is
  // stated over the sheet plus ~195 Svelte scoped blocks, and would be satisfied here by a walk
  // that had lost the sheet entirely and kept the components.
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
