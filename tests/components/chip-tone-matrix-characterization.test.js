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
  resolve(repoRoot, 'src/ui/svelte/apps/manager/Chip.svelte'),
  'utf8'
);

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-chip-characterization-',
  compiledModules: ['src/ui/svelte/apps/manager/Chip.svelte'],
  componentPath: 'src/ui/svelte/apps/manager/Chip.svelte',
});

/**
 * The accepted tone vocabulary, DERIVED from the component's own `TONES` literal rather
 * than restated here (issue 1286).
 *
 * A hand-copied matrix is a mirror, and a mirror of a nine-entry list is exactly the kind
 * that rots quietly: a tone added to `Chip.svelte` and not to this file leaves the new tone
 * unpinned while every assertion here still passes, which reads as "the chip is
 * characterized" when the newest tone is the one nothing covers. `TONES` is a local `const`
 * inside an instance `<script>`, so it cannot be imported — the suite already reads
 * `chipSource` for the `--fab-chip-color` scope assertion below, and this reads the same
 * text.
 *
 * Comments are stripped first. The literal is heavily annotated and those annotations quote
 * tone NAMES in prose, so a naive scan for quoted words inside the block would invent
 * entries that no `TONES.has(...)` will ever match.
 */
function declaredTones() {
  const start = chipSource.indexOf('const TONES = new Set([');
  assert.notEqual(start, -1, 'Chip.svelte still declares its tone vocabulary as `TONES`');
  const open = chipSource.indexOf('[', start);
  const close = chipSource.indexOf(']);', open);
  assert.ok(close > open, 'the `TONES` literal is closed');
  const body = chipSource
    .slice(open + 1, close)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');
  const tones = [...body.matchAll(/'([\w-]+)'/g)].map(([, tone]) => tone);
  assert.ok(tones.length > 0, 'at least one tone is declared');
  return tones;
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
