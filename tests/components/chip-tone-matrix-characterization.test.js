/**
 * CHARACTERIZATION suite for `Chip` (issue 1036).
 *
 * `Chip` has the largest blast radius of any primitive in the repo — 63 call sites — and
 * nothing pinned its render at the PRIMITIVE level before this file: every existing
 * assertion goes through some host screen, so a regression in the chip itself surfaces as
 * an unrelated screen's failure, or not at all.
 *
 * This suite is landed BEFORE the `swatch` prop is added and must pass UNCHANGED
 * afterwards. It pins the three things a new prop could plausibly break:
 *
 * 1. the TONE MATRIX — every accepted tone emits exactly its `is-<tone>` class, and an
 *    unrecognised tone is DROPPED rather than emitted as an unstyled class. The matrix is
 *    DERIVED from the component's own `TONES` literal (issue 1286), so a tone added to one
 *    and not the other fails here instead of shipping unpinned;
 * 2. the CLASS SET of a bare chip, which is `manager-chip` and nothing else. A new prop
 *    that leaks a class onto every chip would repaint 63 call sites at once;
 * 3. the rest spread and `tag` polymorphism, which is how every call site attaches its
 *    `data-*` hooks, `title`, `aria-label` and `onclick`.
 *
 * It also pins the SCOPE of `--fab-chip-color`, because that scope is the whole reason
 * `swatch` renders a leading dot rather than reusing the `is-tag` fill.
 */

import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const chipSource = readFileSync(
  resolve(repoRoot, 'src/ui/svelte/components/Chip.svelte'),
  'utf8'
);

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-chip-characterization-',
  compiledModules: ['src/ui/svelte/components/Chip.svelte'],
  componentPath: 'src/ui/svelte/components/Chip.svelte',
});

/**
 * `chipSource`, or a slice of it, with its block and line comments removed.
 *
 * Both scans below need this and neither may skip it: the literals and the class builder sit
 * inside a heavily annotated file whose prose quotes tone names, density names and the very
 * `density === '…'` shape one of those scans counts, so an unstripped read invents entries no
 * `Set.has(…)` will ever match and counts branches that are not branches.
 *
 * @param {string} text
 * @returns {string}
 */
function withoutComments(text) {
  return text.replaceAll(/\/\*[\s\S]*?\*\//g, '').replaceAll(/\/\/[^\n]*/g, '');
}

/**
 * The values one closed vocabulary `Set` declares, DERIVED from the component's own literal
 * rather than restated here (issue 1286; generalized over both vocabularies at issue 1506).
 *
 * A hand-copied matrix is a mirror, and a mirror of a thirteen-entry list is exactly the kind
 * that rots quietly: a tone added to `Chip.svelte` and not to this file leaves the new tone
 * unpinned while every assertion here still passes, which reads as "the chip is
 * characterized" when the newest tone is the one nothing covers. `TONES` is a local `const`
 * inside an instance `<script>`, so it cannot be imported — the suite already reads
 * `chipSource` for the `--fab-chip-color` scope assertion below, and this reads the same
 * text.
 *
 * ONE SCAN FOR BOTH VOCABULARIES, not two. `EMPHASES` is declared in the same shape a few lines
 * below `TONES`, and issue 1506 needed to read it for the exact-count contract at the foot of
 * this file. A second copy of this body would be the mirror this function exists to close, said
 * about itself: two scans that disagree about what a declaration IS do not fail — one of them
 * reports clean over a literal the other polices.
 *
 * Comments are stripped first. The literal is heavily annotated and those annotations quote
 * value NAMES in prose, so a naive scan for quoted words inside the block would invent
 * entries that no `TONES.has(...)` will ever match.
 *
 * @param {string} name The `const` the vocabulary is declared as, e.g. `TONES`.
 * @returns {string[]}
 */
function declaredSetLiteral(name) {
  const start = chipSource.indexOf(`const ${name} = new Set([`);
  assert.notEqual(start, -1, `Chip.svelte still declares its \`${name}\` vocabulary as a Set literal`);
  const open = chipSource.indexOf('[', start);
  const close = chipSource.indexOf(']);', open);
  assert.ok(close > open, `the \`${name}\` literal is closed`);
  const body = withoutComments(chipSource.slice(open + 1, close));
  const values = [...body.matchAll(/'([\w-]+)'/g)].map(([, value]) => value);
  assert.ok(values.length > 0, `at least one \`${name}\` value is declared`);
  return values;
}

/**
 * The accepted TONE vocabulary. See `declaredSetLiteral` above for why it is derived.
 *
 * @returns {string[]}
 */
function declaredTones() {
  return declaredSetLiteral('TONES');
}

/**
 * Every `density === '…'` branch the class builder routes through, in source order, comments
 * stripped so a docblock that names a density in prose cannot answer for a branch.
 *
 * @returns {string[]}
 */
function densityBranches() {
  const code = withoutComments(chipSource);
  return [...code.matchAll(/density === '([a-z-]+)'/g)].map(([, value]) => value);
}

/** Tone → the single class it must add. The whole accepted vocabulary, in source order. */
const TONE_MATRIX = declaredTones().map((tone) => [tone, `is-${tone}`]);

/**
 * The REAL `<style>` block, sliced at the tag on its own line rather than at the first
 * occurrence of the string.
 *
 * The distinction is load-bearing, not pedantic: this component's own docblock says "Its CSS
 * lives in this scoped `<style>`" at line 15, so an `indexOf` slice begins inside the PROSE and
 * carries every comment in the file. Every mirror guard below then has a second way to pass —
 * a rule that was deleted still "appears in the style block" as long as some paragraph names
 * it — which is precisely the silent success these guards exist to remove.
 */
const styleBlock = chipSource.slice(chipSource.search(/^<style>$/m));

/**
 * The body of one rule, so an assertion reads on the declarations that rule actually states
 * and cannot be answered by an identically-named declaration in the rule next to it.
 *
 * @param {string} className the state class, e.g. `is-inspector`
 * @returns {string} the text from the rule head to its closing brace
 */
function ruleFor(className) {
  const open = styleBlock.indexOf(`.manager-chip.${className} {`);
  assert.notEqual(open, -1, `${className} still has a rule of its own`);
  return styleBlock.slice(open, styleBlock.indexOf('}', open));
}

/**
 * Where a rule head begins in the block, for the ORDER assertions. -1 when it has none.
 *
 * WHOLE-TOKEN, for the same reason the density mirror guard is: a bare `indexOf` for
 * `.manager-chip.is-tag` finds `.manager-chip.is-tag-run` first, which is a different rule
 * several hundred characters earlier, and an order assertion answered by the wrong rule is
 * worse than no order assertion at all.
 */
function ruleIndex(className) {
  return styleBlock.search(new RegExp(String.raw`\.manager-chip\.${className}(?![\w-])`));
}

function chipNode(target) {
  return target.querySelector('.manager-chip');
}

/**
 * The authored classes, with Svelte's per-component scope hash removed.
 *
 * The hash is a compiler artefact that changes whenever the `<style>` block changes, so
 * asserting it would make every CSS edit a test failure while proving nothing.
 */
function authoredClasses(node) {
  return [...node.classList].filter((name) => !name.startsWith('svelte-'));
}

describe('1036 Chip — tone matrix characterization', () => {
  before(async () => {
    await harness.setup();
  });

  after(() => harness.teardown());

  it('emits exactly one `is-<tone>` class for every accepted tone', async () => {
    for (const [tone, expectedClass] of TONE_MATRIX) {
      const target = await harness.mount({ tone });
      const chip = chipNode(target);
      const classes = [...chip.classList].filter((name) => name.startsWith('is-'));
      assert.deepEqual(classes, [expectedClass], `tone "${tone}" paints exactly ${expectedClass}`);
      assert.ok(chip.classList.contains('manager-chip'), 'the literal hook class is kept');
      harness.remount();
    }
  });

  it('paints every declared tone in the scoped style block', () => {
    // The other half of deriving the matrix. A tone added to `TONES` but never given a rule
    // renders as the DEFAULT chip while the class-emission assertion above still passes —
    // the class is there, the colour is not, and nothing says so. `is-disabled` and
    // `is-negative` ride joined selectors with `is-warning` / `is-danger`, so the check is
    // "the selector appears in a rule head", not "a rule starts with it".
    const unpainted = TONE_MATRIX.filter(
      ([, className]) => !styleBlock.includes(`.manager-chip.${className}`)
    ).map(([tone]) => tone);
    assert.deepEqual(unpainted, [], 'every accepted tone declares a colour family');
  });

  it('DROPS an unrecognised tone rather than emitting an unstyled class', async () => {
    const target = await harness.mount({ tone: 'lavender' });
    const chip = chipNode(target);
    assert.ok(
      !chip.classList.contains('is-lavender'),
      'a typo renders as the default chip, never as a silently dead class'
    );
    assert.deepEqual(
      [...chip.classList].filter((name) => name.startsWith('is-')),
      [],
      'no state class at all'
    );
    harness.remount();
  });

  it('adds is-mono and is-truncated only when asked, and keeps a caller class', async () => {
    const target = await harness.mount({
      tone: 'neutral',
      mono: true,
      truncate: true,
      class: 'manager-editor-tab-badge',
    });
    const chip = chipNode(target);
    for (const expected of ['manager-chip', 'is-neutral', 'is-mono', 'is-truncated']) {
      assert.ok(chip.classList.contains(expected), `carries ${expected}`);
    }
    assert.ok(
      chip.classList.contains('manager-editor-tab-badge'),
      'the caller class survives so host layout rules still reach the chip'
    );
    harness.remount();

    const plain = await harness.mount({});
    assert.deepEqual(authoredClasses(chipNode(plain)), ['manager-chip'], 'the bare chip is bare');
    harness.remount();
  });

  it('renders a leading icon glyph inside the chip, before its content', async () => {
    const target = await harness.mount({ icon: 'fas fa-lock' });
    const glyph = chipNode(target).querySelector('i');
    assert.ok(Boolean(glyph), 'the icon renders as an <i>');
    assert.deepEqual(authoredClasses(glyph), ['fas', 'fa-lock'], 'the caller class list, verbatim');
    assert.equal(glyph.getAttribute('aria-hidden'), 'true', 'the glyph is decorative');
    harness.remount();
  });

  it('renders as the requested element and forwards every other attribute', async () => {
    const target = await harness.mount({
      tag: 'button',
      type: 'button',
      title: 'Locked',
      'aria-label': 'Locked recipe',
      'data-recipe-lock': 'true',
      disabled: true,
    });
    const chip = chipNode(target);
    assert.equal(chip.tagName, 'BUTTON', '`tag` selects the rendered element');
    assert.equal(chip.getAttribute('type'), 'button');
    assert.equal(chip.getAttribute('title'), 'Locked');
    assert.equal(chip.getAttribute('aria-label'), 'Locked recipe');
    assert.equal(chip.getAttribute('data-recipe-lock'), 'true', 'data hooks pass through');
    assert.equal(chip.disabled, true);
    harness.remount();

    const listItem = await harness.mount({ tag: 'li' });
    assert.equal(chipNode(listItem).tagName, 'LI');
    harness.remount();
  });

  it('keeps `--fab-chip-color` DECLARED INSIDE `.manager-chip.is-tag`', () => {
    // The vehicle's scope is why `swatch` cannot reuse the tag FILL: the custom property
    // is declared in the `is-tag` rule and consumed only by that rule, so setting it on a
    // non-tag chip paints nothing at all. Pinning it here means a future edit that moves
    // the declaration to `.manager-chip` has to acknowledge the consequence.
    const tagRule = chipSource.slice(chipSource.indexOf('.manager-chip.is-tag'));
    assert.match(tagRule, /--fab-chip-color:\s*var\(--fab-purple\)/, 'the tag tone declares it');
    const baseRule = chipSource.slice(
      chipSource.indexOf('.manager-chip {'),
      chipSource.indexOf('.manager-chip.is-truncated')
    );
    assert.ok(
      !baseRule.includes('--fab-chip-color'),
      'the BASE rule does not declare it, so a non-tag chip inherits nothing'
    );
  });
});

/**
 * THE DENSITY SCALE MATRIX (issue 1371).
 *
 * The suite above characterizes the chip's COLOUR axis. Its geometry axis had no primitive-level
 * guard at all: `density` had grown to four values, each stating a min-height, a band, a corner
 * and a type scale, and every one of them was pinned only through some host screen. A value added
 * to the class builder without a rule in the style block renders as the DEFAULT chip while every
 * class assertion still passes — the class is there, the geometry is not, and nothing says so.
 * That is the same silent mirror `declaredTones()` above exists to close, on the other axis.
 *
 * `tag-run` is this revision's addition: the reference's world-tag pill (`proto:5401`,
 * `proto:5692`, `proto:5707`) at `padding: 5px 12px; border-radius: 999px; font: 600 11px`, which
 * is a chip that is a CONTROL a GM clicks rather than a badge they read. A parity lane measured
 * that the shipped default — radius 10, 9.92px, weight 700, band 4x6 — cannot be corrected from
 * `styles/fabricate.css` at any specificity, because Foundry imports the module sheet at
 * `layer(modules)` while this block is injected unlayered.
 */
describe('1371 Chip — density scale matrix', () => {
  before(async () => {
    await harness.setup();
  });

  after(() => harness.teardown());

  /**
   * Every `density` value the class builder can emit, and the class each emits, read from the
   * component's own ternaries. Restating the list here would make this file a second copy of
   * the mirror it exists to guard.
   *
   * @returns {Array<[string, string]>}
   */
  function declaredDensities() {
    const pairs = [...chipSource.matchAll(/density === '([a-z-]+)' \? '(is-[a-z-]+)'/g)].map(
      ([, value, className]) => [value, className]
    );
    assert.ok(pairs.length >= 4, `the chip still names its densities in the builder (${pairs})`);
    return pairs;
  }

  it('emits exactly one `is-<density>` class for every declared density', async () => {
    for (const [density, expectedClass] of declaredDensities()) {
      const target = await harness.mount({ density });
      const classes = [...chipNode(target).classList].filter((name) => name.startsWith('is-'));
      assert.deepEqual(classes, [expectedClass], `density "${density}" paints exactly ${expectedClass}`);
      harness.remount();
    }
  });

  it('paints every declared density in the scoped style block', () => {
    // Whole-token match rather than `includes`, so a longer class that merely STARTS with a
    // shorter one cannot answer for it.
    const unpainted = declaredDensities()
      .filter(([, className]) => !new RegExp(String.raw`\.manager-chip\.${className}(?![\w-])`).test(styleBlock))
      .map(([density]) => density);
    assert.deepEqual(unpainted, [], 'every accepted density declares a geometry');
  });

  it('leaves the DEFAULT density bare, and drops an unrecognised one', async () => {
    const shipped = await harness.mount({ density: 'default' });
    assert.deepEqual(
      authoredClasses(chipNode(shipped)),
      ['manager-chip'],
      'the manager-wide scale adds no class at all, so 60-odd call sites are byte-identical'
    );
    harness.remount();

    const typo = await harness.mount({ density: 'enormous' });
    assert.deepEqual(
      [...chipNode(typo).classList].filter((name) => name.startsWith('is-')),
      [],
      'a typo renders the default chip rather than a selector nothing paints'
    );
  });

  it('composes the tag-run scale with the tag tone and the struck variant', async () => {
    // The two call sites the reference draws: a lit world tag (tone) and a muted one a system
    // has switched off (`struck`). Geometry and paint are separate axes on purpose — the run
    // draws lit, unlit and struck chips side by side at ONE size.
    const target = await harness.mount({ density: 'tag-run', tone: 'tag', struck: true });
    const chip = chipNode(target);
    for (const expected of ['manager-chip', 'is-tag', 'is-struck', 'is-tag-run']) {
      assert.ok(chip.classList.contains(expected), `carries ${expected}`);
    }
    // `is-tag-run` must not be read as the `is-tag` TONE by anything matching on strings.
    assert.equal(
      [...chip.classList].filter((name) => name === 'is-tag').length,
      1,
      'the scale class is its own token and does not duplicate the tone'
    );
  });

  it('states the tag-run band in tokens, at the reference values', () => {
    // `proto:5401` draws `padding: 5px 12px; border-radius: 999px; font: 600 11px`. 5px is off
    // the published 4px spacing scale, which `spacing-scale-ratchet.test.js` enforces as a
    // ratchet, so the block snaps to `--fab-space-chip` (6px) — the scale's own dense optical
    // step, and the nearer of the two neighbours once the reference's default line-height is
    // accounted for. 12px is `--fab-space-3` exactly.
    const rule = ruleFor('is-tag-run');
    assert.match(rule, /padding:\s*var\(--fab-space-chip\) var\(--fab-space-3\)/);
    assert.match(rule, /border-radius:\s*999px/);
    assert.match(rule, /font-size:\s*11px/);
    assert.match(rule, /font-weight:\s*600/);
  });

  it('states the INSPECTOR band in tokens, at the reference values (issue 1371)', () => {
    // `proto:5663`/`proto:5665` draw the browser inspector's `Tags in effect` run — both its
    // halves, the world classification's tags and the system's own — at `padding: 3px 9px;
    // border-radius: 999px; font: 600 10px`. Neither inset is on the published 4px scale that
    // `spacing-scale-ratchet.test.js` enforces, so the vertical snaps up to `--fab-space-1`
    // and the horizontal down to `--fab-space-2`; both snaps are one pixel and neither can move
    // the rendered height, which the base rule's 20px floor decides either way.
    const rule = ruleFor('is-inspector');
    assert.match(rule, /padding:\s*var\(--fab-space-1\) var\(--fab-space-2\)/);
    assert.match(rule, /border-radius:\s*999px/);
    assert.match(rule, /font-size:\s*10px/);
    assert.match(rule, /font-weight:\s*600/);
    // GEOMETRY AND TYPE ONLY. The run's two halves are deliberately differently toned, so a
    // density that painted a fill or an ink would flatten the distinction the run exists to
    // draw — the rule `is-list` and `is-tag-run` already state, restated as an assertion here
    // because this is the density whose reference DOES name colours beside the geometry.
    assert.ok(!/(?:^|[^-])color:/.test(rule), 'the inspector density paints no ink and no fill');
  });
});

/**
 * THE EMPHASIS AXIS AND THE QUIET FACT PILL (issue 1371).
 *
 * The two blocks above characterize the chip's COLOUR FAMILY and its GEOMETRY. This one covers
 * the third thing this revision gave it — a second colour axis — and the tone that had no
 * spelling before it.
 *
 * `emphasis` exists because a parity run measured a defect that no tone can close. The
 * reference draws the world Component entry's `World catalogue` badge INSIDE an `info-soft`
 * callout as a flat plate behind an info hairline (`proto:1313`); `tone="info"` puts an
 * `info-soft` fill on an `info-soft` panel, which that run reported as no background drift at
 * all — the badge dissolving into the panel it is meant to stand on. Every one of the eleven
 * tones paints a wash, so the answer is an axis rather than a twelfth tone.
 *
 * The assertions that matter most are the NEGATIVE and the ORDERING ones. The default chip must
 * be byte-identical to what shipped at 60-odd call sites, an unrecognised value must fall back
 * rather than emit a class nothing paints, and the rule must stay LAST in the block — every
 * tone rule is (0,2,0), as this is, so a plate written earlier than `is-tag` would be beaten by
 * that tone alone and the purple tag chip would be the one shape the emphasis never reached.
 * That failure is invisible in a class-emission assertion: the class would be there and the
 * paint would not.
 */
describe('1371 Chip — the outlined emphasis and the secondary tone', () => {
  before(async () => {
    await harness.setup();
  });

  after(() => harness.teardown());

  it('emits no emphasis class by default, and DROPS an unrecognised one', async () => {
    const shipped = await harness.mount({});
    assert.deepEqual(
      authoredClasses(chipNode(shipped)),
      ['manager-chip'],
      'a chip that does not ask for the plate is exactly its hook class — a second axis that leaked one class here would repaint every call site at once'
    );
    harness.remount();

    const typo = await harness.mount({ emphasis: 'ghost' });
    assert.deepEqual(
      [...chipNode(typo).classList].filter((name) => name.startsWith('is-')),
      [],
      'a typo renders the shipped chip, exactly as an unrecognised tone does, rather than a selector nothing paints'
    );
  });

  it('adds is-outlined and composes with the tone rather than replacing it', async () => {
    const target = await harness.mount({ tone: 'info', emphasis: 'outlined' });
    const chip = chipNode(target);
    assert.ok(chip.classList.contains('is-outlined'), 'the emphasis paints its own class');
    assert.ok(
      chip.classList.contains('is-info'),
      'and the tone survives, because the plate takes the FILL and leaves the family its edge and its ink'
    );
  });

  it('composes with a density too, so the plate is not a scale', async () => {
    // The reference's badge is a MICRO pill on a plate (`proto:1313`), which is two axes at
    // once. A chip that could not be both would force the emphasis to restate a geometry, and
    // a second statement of the chip's geometry is what issue 883 retired.
    const target = await harness.mount({ tone: 'info', emphasis: 'outlined', density: 'list' });
    const classes = [...chipNode(target).classList].filter((name) => name.startsWith('is-'));
    assert.deepEqual(
      classes.toSorted((a, b) => a.localeCompare(b)),
      ['is-info', 'is-list', 'is-outlined'],
      'three axes, three classes'
    );
  });

  it('states the plate as ONE declaration, and states only the fill', () => {
    // The design claim, as an assertion. `tone="info" emphasis="outlined"` must resolve to the
    // info border and the info ink on a flat surface, and it does so by NOT restating them:
    // the tone rules above already say them. Eleven tones times one rule — and the twelfth
    // tone, whenever it arrives, is outlined for free. A future edit that spelled the edge and
    // the ink out here would silently make the plate monochrome for every tone.
    const rule = ruleFor('is-outlined');
    assert.match(rule, /background:\s*var\(--fab-bg-1\)/, 'the flat plate is the theme surface token');
    assert.ok(!/border-color:/.test(rule), 'the tone keeps its edge');
    assert.ok(!/(?:^|[^-])color:/.test(rule), 'and the tone keeps its ink');
  });

  it('writes the emphasis AFTER every tone rule, so the plate wins the fill', () => {
    // Equal specificity, so ORDER decides — and the tone that makes this sharp is `is-tag`,
    // the only one whose fill is a `color-mix` rather than a token and the last tone rule in
    // the block. This walks every declared tone rather than naming that one, so a tone added
    // below the emphasis in a later change fails here instead of shipping a shape the plate
    // cannot reach.
    const outlined = ruleIndex('is-outlined');
    assert.ok(outlined > 0, 'the emphasis has a rule');
    const later = TONE_MATRIX.filter(([, className]) => ruleIndex(className) > outlined).map(
      ([tone]) => tone
    );
    assert.deepEqual(later, [], 'no tone rule is written after the emphasis');
  });

  it('states the secondary tone in exactly the three reference tokens', () => {
    // `proto:5721` draws the rules editor's salvage mode pill through the prototype's shared
    // pill helper with the subtle surface, a plain hairline and the SECONDARY ink. `neutral`,
    // its nearest neighbour here, inks the MUTED token and declares no fill at all, so it
    // could not have said this without moving two dozen callers that mean something else.
    const rule = ruleFor('is-secondary');
    assert.match(rule, /border-color:\s*var\(--fab-border\)/);
    assert.match(rule, /color:\s*var\(--fab-text-secondary\)/);
    assert.match(rule, /background:\s*var\(--fab-surface-soft\)/);
    assert.ok(
      !/(?:padding|font-size|font-weight|min-height|border-radius):/.test(rule),
      'and no geometry, because a tone that resized would reintroduce the drift this component removes'
    );
  });
});

/**
 * THE LIT EMPHASIS (issue 1371, parity round 5, UX finding F10).
 *
 * The reference's lit world-tag chip is its purple at sixteen percent behind an edge of the same
 * purple at fifty, with the LABEL in that purple at full strength (`proto:5401`, `proto:5665`).
 * The shipped `tone="tag"` states the edge exactly right and the other two wrong, and the round-4
 * record claimed all three were right — so this axis exists because a measurement contradicted a
 * docblock, and these assertions are that measurement written down:
 *
 *   entry-tag-chip.backgroundColor  subject color(srgb 0.274196 0.315451 0.384784)
 *                                != prototype rgba(201, 160, 220, 0.16)
 *   entry-tag-chip.color            subject rgb(241, 209, 181) != prototype rgb(201, 160, 220)
 *
 * The grey-blue is what `color-mix(… var(--fab-purple) 16%, var(--fab-bg-3))` resolves to: the
 * tone mixes its wash into an OPAQUE surface token rather than into what is behind the chip.
 *
 * WHY IT IS A SECOND EMPHASIS AND NOT A REPAINT OF `is-tag`. That tone has shipped callers on
 * other screens; a shared primitive taking a second site's treatment takes a PROP. And why it is
 * SELECTED on `is-tag` and `has-swatch` rather than on `.manager-chip.is-lit` alone: those are the
 * two classes that declare `--fab-chip-color`, and a chip with no colour of its own cannot be lit
 * in one. A bare selector would have to invent a fallback fill, and every fallback is still a
 * mix — so a toneless lit chip would lose the fill it shipped with. Unmatched is the only no-op.
 */
describe('1371 Chip — the lit emphasis', () => {
  before(async () => {
    await harness.setup();
  });

  after(() => harness.teardown());

  /** Where the lit rule's head begins in the block. -1 when it has none. */
  function litRuleIndex() {
    return styleBlock.search(/\.manager-chip\.is-tag\.is-lit(?![\w-])/);
  }

  /** The lit rule's body, comments already absent because the head is inside the block. */
  function litRule() {
    const open = litRuleIndex();
    assert.notEqual(open, -1, 'the lit emphasis has a rule of its own');
    return styleBlock.slice(open, styleBlock.indexOf('}', open));
  }

  it('emits is-lit only when asked, and composes with the tone and the scale', async () => {
    const shipped = await harness.mount({ tone: 'tag' });
    assert.deepEqual(
      authoredClasses(chipNode(shipped)),
      ['manager-chip', 'is-tag'],
      'a tag chip that does not ask for the lit face is exactly what shipped'
    );
    harness.remount();

    const lit = await harness.mount({ tone: 'tag', emphasis: 'lit', density: 'tag-run' });
    assert.deepEqual(
      [...chipNode(lit).classList].filter((name) => name.startsWith('is-')).toSorted((a, b) => a.localeCompare(b)),
      ['is-lit', 'is-tag', 'is-tag-run'],
      'the run draws its lit chip as tone + emphasis + scale, three axes and three classes'
    );
  });

  it('is accepted as an emphasis, so an unrecognised one still falls back beside it', async () => {
    // The vocabulary is closed, and it now has two members: a value dropped from `EMPHASES` but
    // kept in the style block renders as the shipped chip while every rule assertion below still
    // passes, which is exactly the failure the emission check exists for.
    const target = await harness.mount({ tone: 'tag', emphasis: 'lit ' });
    assert.ok(
      !chipNode(target).classList.contains('is-lit'),
      'a value that is not spelled exactly renders the shipped chip'
    );
  });

  it('states the reference face: the family colour on the INK and a 16% wash of it, over NOTHING', () => {
    const rule = litRule();
    assert.match(
      rule,
      /color:\s*var\(--fab-chip-color\)/,
      'the label takes the family colour at full strength — the line the round-4 record got wrong'
    );
    assert.match(
      rule,
      /background:\s*color-mix\(in srgb, var\(--fab-chip-color\) 16%, transparent\)/,
      'and the wash is that colour at the reference sixteen percent over TRANSPARENT, not mixed into an opaque surface token'
    );
    assert.ok(
      !/border-color:/.test(rule),
      'the edge is untouched, because `is-tag` already states the reference fifty percent'
    );
    assert.ok(
      !/(?:padding|font-size|font-weight|min-height|border-radius):/.test(rule),
      'and no geometry: the scale is `density`, which is what lets one run draw lit, unlit and struck chips at one size'
    );
  });

  it('is selected ONLY on the two classes that declare a chip colour', () => {
    // A bare `.manager-chip.is-lit` rule would reach a chip with no `--fab-chip-color` at all,
    // where `color: var(--fab-chip-color)` is an invalid-at-computed-value-time ink and the mix
    // resolves against nothing. The precondition belongs in the selector.
    assert.equal(
      styleBlock.search(/\.manager-chip\.is-lit(?![\w-])/),
      -1,
      'there is no unqualified lit rule'
    );
    assert.notEqual(
      styleBlock.search(/\.manager-chip\.has-swatch\.is-lit(?![\w-])/),
      -1,
      'and the swatch, which is the other class that declares `--fab-chip-color`, is lit by the same rule'
    );
  });

  it('is written AFTER the tag tone and after the outlined plate, so its fill wins', () => {
    // `is-tag` states a fill and `is-outlined` states a fill. This rule is (0,3,0) and beats both
    // on specificity, but the tone rules are the ones a later edit is likely to move, so the order
    // is pinned as well: a tag rule written below this would take the fill back at equal weight if
    // the selector were ever simplified.
    const lit = litRuleIndex();
    assert.ok(lit > 0, 'the lit emphasis has a rule');
    assert.ok(ruleIndex('is-tag') < lit, 'the tag tone is written first');
    assert.ok(ruleIndex('is-outlined') < lit, 'and so is the plate');
  });
});


/**
 * THE BARE EMPHASIS, NOW THAT A CALLER DRAWS IT (issue 1506).
 *
 * The face landed unused beside the `subtle` tone, and the world Component catalogue's row badge
 * is the caller that turns it on: `tone={linked ? 'subtle' : 'warning'} emphasis="bare"
 * density="list"`. The mounted coverage that used to watch this face lived in
 * `recipe-studio-primitives.test.js`, against the pill that owned it before this change — so it
 * moves here with the face rather than dying with the file, and it asks the same three questions
 * of the surviving primitive.
 *
 * The two that matter most are the negatives. `border: 0` is the WHOLE of this emphasis: it must
 * not touch the tone's fill or ink, because the catalogue draws the same badge in `subtle` when a
 * row is linked and in `warning` when it is not, and a face that stated a colour would flatten
 * the amber the tone is there to say. And the glyph rule must exclude `.fa-circle`: the status
 * dot rule is written earlier at the same (0,3,1), so an unqualified selector would tie it, win
 * on source order and inflate every dot the day someone composed the two.
 */
describe('1506 Chip — the bare emphasis', () => {
  before(async () => {
    await harness.setup();
  });

  after(() => harness.teardown());

  /** The bare rule's body, comments already absent because the head is inside the block. */
  function bareRule() {
    const open = ruleIndex('is-bare');
    assert.notEqual(open, -1, 'the bare emphasis has a rule of its own');
    return styleBlock.slice(open, styleBlock.indexOf('}', open));
  }

  it('emits is-bare only when asked, and composes with a NON-subtle tone', async () => {
    const shipped = await harness.mount({ tone: 'warning' });
    assert.deepEqual(
      authoredClasses(chipNode(shipped)),
      ['manager-chip', 'is-warning'],
      'a chip that does not ask for the bare face is exactly what shipped'
    );
    harness.remount();

    // The catalogue's UNLINKED row is `warning` with this face, so the composition is the shipped
    // case rather than a hypothetical: a bare chip keeps every colour its tone states.
    const bare = await harness.mount({ tone: 'warning', emphasis: 'bare', density: 'list' });
    assert.deepEqual(
      [...chipNode(bare).classList]
        .filter((name) => name.startsWith('is-'))
        .toSorted((a, b) => a.localeCompare(b)),
      ['is-bare', 'is-list', 'is-warning'],
      'the row badge draws as tone + emphasis + scale, three axes and three classes'
    );
  });

  it('states the edge as the `border` SHORTHAND, and touches no colour', () => {
    const rule = bareRule();
    // `border: 0` rather than `border-width: 0`: the shorthand resets `border-color` to
    // `currentColor`, which is the reference's computed edge, where the longhand would leave the
    // base rule's `--fab-border` sitting on a zero-width edge at a different computed colour.
    assert.match(rule, /(?:^|\n)\s*border:\s*0;/, 'the whole of this face is the edge going away');
    assert.ok(
      !/(?:^|;|\n)\s*(?:color|background)\s*:/.test(rule),
      `the bare face states a colour of its own, so the tone stops deciding it: ${rule}`
    );
  });

  it('drops its glyph to the reference 7px WITHOUT touching the status dot', () => {
    const glyphRule = styleBlock.search(/\.manager-chip\.is-bare i:not\(\.fa-circle\)/);
    assert.notEqual(glyphRule, -1, 'the bare face states its own glyph size');
    assert.match(
      styleBlock.slice(glyphRule, styleBlock.indexOf('}', glyphRule)),
      /font-size:\s*7px/,
      'at `density="list"` the glyph inherits 9px and the reference draws 7px'
    );
    // The tie this `:not()` exists to lose: the dot rule is (0,2,1) and written EARLIER, so an
    // unqualified `.manager-chip.is-bare i` would tie it, win on order, and inflate the dot.
    const dot = styleBlock.search(/\.manager-chip i\.fa-circle/);
    assert.ok(dot !== -1 && dot < glyphRule, 'and the dot rule is still written first');
  });
});

/**
 * THE CLOSED VOCABULARIES ARE PINNED BY EXACT COUNT (issue 1506).
 *
 * Two of this component's axes are closed vocabularies with no landed guard on their SIZE. The
 * matrices above quantify over whatever each axis declares, so they characterize a sixth density
 * or a fourth emphasis as readily as they characterize the shipped ones: adding a value makes the
 * suite pin one more thing and report green, which is exactly the opposite of what a vocabulary
 * that is meant to be closed needs from a test.
 *
 * THE PIN IS AN EXACT COUNT AND NEVER A CEILING, and the difference is not pedantry. Written as
 * `<= 5`, the density gate is defeated by the most natural refactor available — `DENSITIES.has(density) ? \`is-${density}\` : ''`, the exact shape `TONES` and `EMPHASES` already use — which
 * drops the branch count to zero and lets a seventh density in for free while every assertion
 * above still passes. An exact count reds on that refactor as loudly as on a new branch, which
 * puts the question in front of a reviewer instead of leaving it to a green run.
 *
 * WHY THE EMPHASIS HALF IS HERE RATHER THAN WHERE IT USED TO BE. The one guard that watched this
 * axis was the cross-primitive pair in `recipe-studio-primitives.test.js`, which reads
 * `StatusPill.svelte` from disk — and that component is retiring into this one. This is the
 * LANDED replacement: it reads only the surviving primitive, and it survives the deletion that
 * takes the other one.
 *
 * Both clauses read the source rather than the mounted DOM on purpose. A value declared without a
 * rule renders as the default chip, so the DOM cannot tell the two apart, and a value declared
 * with a rule but never passed by a caller has no DOM at all.
 */
describe('1506 Chip — the closed vocabularies, pinned by exact count', () => {
  it('routes exactly FIVE densities through a `density === …` branch, and `default` is their absence', () => {
    const branches = densityBranches();

    assert.equal(
      branches.length,
      5,
      'the chip routes a different number of densities than the five it ships. This is an EXACT ' +
        'count rather than a ceiling: a SIXTH branch reds here, and so does a `DENSITIES.has(…)` ' +
        'set refactor that drops the count to zero. A conversion routes to an EXISTING rung; ' +
        'minting one to make a conversion pixel-neutral re-creates, on the primitive, the ' +
        `per-surface geometry this component was extracted to retire. Found: ${branches}`
    );

    // The names as well as the count, so the failure says WHICH rung moved rather than that the
    // number did. `default` is deliberately absent: it is the absence of every branch above.
    assert.deepEqual(
      branches,
      ['row', 'list', 'action', 'tag-run', 'inspector'],
      'the five shipped densities are these five, in this order, and `default` is their absence'
    );
  });

  it('declares exactly THREE emphases, and they are the three the specimen publishes', () => {
    const emphases = declaredSetLiteral('EMPHASES');

    assert.equal(
      emphases.length,
      3,
      'the chip declares a different number of emphases than the three it ships. An EXACT count ' +
        'rather than a ceiling, for the density clause\'s reason: a FOURTH value reds here, and ' +
        'so does an `EMPHASES.has(…)` refactor that drops the count below three. A face a pixel ' +
        `from a shipped one belongs on an existing value, not on a new one. Found: ${emphases}`
    );

    assert.deepEqual(
      emphases,
      ['outlined', 'lit', 'bare'],
      'the three shipped emphases are `outlined` (the flat plate), `lit` (the family colour on ' +
        'the ink) and `bare` (no edge at all), in this order'
    );
  });
});

/**
 * THE ICON-ONLY CHIP, AND THE NAME IT HAS TO CARRY (issue 1506).
 *
 * `CraftingStatusBadge` shipped a `compact` variant — a 20x20 square with its label suppressed
 * and `title` as its only accessible name — and the recipe browser's row rendered it. Retiring
 * that component into this one had to answer two questions it left open.
 *
 * THE SQUARE IS A BOOLEAN, NOT A SEVENTH DENSITY. No density here can produce one: each states a
 * BAND (a vertical inset and a type size) and a square needs a SIDE. So the prop composes with
 * whichever density the caller also asks for and publishes a side for each — which makes it total
 * over the axis it reads, and makes the failure "a density with no side" impossible rather than
 * unlikely.
 *
 * THE NAME IS REQUIRED AND THE ROLE IS CONDITIONAL, which is the half the shipped badge had
 * wrong. Its glyph is `aria-hidden`, so the only name it ever had was a `title` — a tooltip, not
 * a name — and the badge was effectively unannounced. `aria-label` alone does not fix it on a
 * bare `span`, because ARIA prohibits naming a generic role, so the chip states `role="img"`
 * beside it. But only where it is NON-INTERACTIVE: on a `button` or an `a` the label is already
 * the control's name and an `img` role would announce an operable control as a picture. The role
 * is written BEFORE the rest spread, so a caller that passes its own is never overridden.
 */
describe('1506 Chip — the icon-only chip', () => {
  before(async () => {
    await harness.setup();
  });

  after(() => harness.teardown());

  /**
   * The six published sides, as `[selector suffix, side, where the figure comes from]`. Five are
   * read from the density they belong to; `list` states `min-height: 0` and has none to read,
   * which is why the six are published rather than computed.
   */
  const ICON_ONLY_SIDES = [
    ['is-icon-only', 20, "the base rule's own min-height"],
    ['is-icon-only.is-row', 22, "`is-row`'s min-height"],
    [
      'is-icon-only.is-list',
      15,
      'the 15px stadium `proto:4872` publishes, ~2px above the ~13px a labelled list chip renders',
    ],
    ['is-icon-only.is-action', 34, "`is-action`'s min-height, which is the button's own figure"],
    ['is-icon-only.is-tag-run', 25, "the height `is-tag-run`'s note computes: 6 + 6 + 11 + 2"],
    [
      'is-icon-only.is-inspector',
      20,
      "the height `is-inspector`'s note computes: 3 + 12 + 3 plus the hairline",
    ],
  ];

  it('emits is-icon-only only when asked, and composes with a density rather than replacing it', async () => {
    const shipped = await harness.mount({ density: 'list' });
    assert.deepEqual(
      authoredClasses(chipNode(shipped)),
      ['manager-chip', 'is-list'],
      'a chip that does not ask for the square is exactly what shipped'
    );
    harness.remount();

    // The one converted caller: the recipe browser row's status badge, at `list`.
    const square = await harness.mount({
      density: 'list',
      iconOnly: true,
      icon: 'fas fa-lock',
      'aria-label': 'Locked',
    });
    assert.deepEqual(
      authoredClasses(chipNode(square)).toSorted((a, b) => a.localeCompare(b)),
      ['is-icon-only', 'is-list', 'manager-chip'],
      'the square is a class beside the scale, so the two axes compose'
    );
  });

  it('publishes a square SIDE for every density, six of them, with equal insets', () => {
    for (const [selector, side, provenance] of ICON_ONLY_SIDES) {
      const rule = ruleFor(selector);
      for (const property of ['width', 'height', 'min-height']) {
        assert.match(
          rule,
          new RegExp(String.raw`(?:^|\n)\s*${property}:\s*${side}px;`),
          `\`.manager-chip.${selector}\` states ${property}: ${side}px (${provenance}). ` +
            'All three are stated together: `width` because the base rule sets `fit-content`, ' +
            '`height` because nothing else would make it a square, and `min-height` because the ' +
            "base rule's 20px floor would otherwise win at `list` and `is-list`'s own " +
            '`min-height: 0` would let a column flex parent collapse the square at the rest'
        );
      }
    }

    // Equal insets, which at a fixed side is none at all: every density's padding is
    // horizontal-only or horizontal-heavy, so carrying one in would push the glyph off centre.
    assert.match(
      ruleFor('is-icon-only'),
      /(?:^|\n)\s*padding:\s*0;/,
      'the square drops the chip padding and lets the base rule centre the glyph'
    );
  });

  it('states each density side as a COMPOUND selector, so it does not depend on rule order', () => {
    for (const [selector] of ICON_ONLY_SIDES.slice(1)) {
      // (0,3,0) against the density's own (0,2,0) and the base rule's (0,1,0): the side wins on
      // specificity, so moving these rules within the block cannot change a rendered square.
      assert.equal(
        selector.split('.').length,
        2,
        `${selector} names the density it overrides, rather than relying on being written later`
      );
      assert.notEqual(
        ruleIndex(selector.replaceAll('.', String.raw`\.`)),
        -1,
        `${selector} has a rule`
      );
    }
  });

  it('names itself through role="img" only where the chip is NON-interactive', async () => {
    const span = await harness.mount({
      iconOnly: true,
      icon: 'fas fa-lock',
      'aria-label': 'Locked',
    });
    assert.equal(
      chipNode(span).getAttribute('role'),
      'img',
      'a bare span drops an aria-label without one'
    );
    assert.equal(chipNode(span).getAttribute('aria-label'), 'Locked', 'and the label is the name');
    harness.remount();

    for (const tag of ['button', 'a']) {
      const control = await harness.mount({
        tag,
        iconOnly: true,
        icon: 'fas fa-lock',
        'aria-label': 'Locked',
      });
      assert.ok(
        !chipNode(control).hasAttribute('role'),
        `on a ${tag} the label is already the accessible name, and an img role would announce an ` +
          'operable control as a picture'
      );
      harness.remount();
    }

    const plain = await harness.mount({ icon: 'fas fa-lock' });
    assert.ok(!chipNode(plain).hasAttribute('role'), 'a labelled chip states no role at all');
  });

  it('never overrides a role the caller passed', async () => {
    const passed = await harness.mount({
      iconOnly: true,
      icon: 'fas fa-lock',
      'aria-label': 'Locked',
      role: 'status',
    });
    assert.equal(
      chipNode(passed).getAttribute('role'),
      'status',
      'the role is written BEFORE the rest spread, so a caller that means something else wins'
    );
  });
});

/**
 * `density="list"` IS SINGLE-LINE (issue 1506, decision G).
 *
 * `is-row` and `is-action` both state `white-space: nowrap`; the base rule states none, because
 * wrapping is the chip's default for the reason `is-truncated` documents. So `list` was the one
 * density that inherited the wrap — and `proto:4872`, which that density quotes, describes a
 * STADIUM, which is a single-line construction. It became load-bearing when twelve player row
 * pills converged here from three retired look-alikes, every one of which was single-line: two by
 * declaration and the journal's by a `flex: 0 0 auto` that held it at max-content. In a narrow
 * player window a have/need pair would otherwise break across two lines.
 */
describe('1506 Chip — the list density is single-line', () => {
  it('states `white-space: nowrap`, as the two densities beside it already do', () => {
    assert.match(
      ruleFor('is-list'),
      /(?:^|\n)\s*white-space:\s*nowrap;/,
      "the list density inherited the base rule's wrap, and the reference draws a stadium"
    );
  });

  it('leaves the SHRINK to the caller, stating no flex of its own', () => {
    // The retired journal pill held its width with `flex: 0 0 auto`; that is position, and
    // position stays with the caller per this component's own `density` note.
    assert.ok(
      !/(?:^|\n)\s*flex(?:-shrink)?:/.test(ruleFor('is-list')),
      'a density states how text lays out, never how much room the row gives the chip'
    );
  });
});
