/** CHARACTERIZATION suite for `Chip` (issue 1036). */

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
 * @param {string} text
 * @returns {string}
 */
function withoutComments(text) {
  return text.replaceAll(/\/\*[\s\S]*?\*\//g, '').replaceAll(/\/\/[^\n]*/g, '');
}

/**
 * The values one closed vocabulary `Set` declares.
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
 * Every `density === '…'` branch the class builder routes through, in source order.
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

/** Where a rule head begins in the block, for the ORDER assertions. -1 when it has none. */
function ruleIndex(className) {
  return styleBlock.search(new RegExp(String.raw`\.manager-chip\.${className}(?![\w-])`));
}

function chipNode(target) {
  return target.querySelector('.manager-chip');
}

/** The authored classes, with Svelte's per-component scope hash removed. */
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
    // The vehicle's scope is why `swatch` cannot reuse the tag FILL.
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

/** THE DENSITY SCALE MATRIX (issue 1371). */
describe('1371 Chip — density scale matrix', () => {
  before(async () => {
    await harness.setup();
  });

  after(() => harness.teardown());

  /**
   * Every `density` value the class builder can emit, and the class each emits.
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
    // Whole-token match rather than `includes`.
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
    // The two call sites the reference draws.
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
    // `proto:5663`/`proto:5665` draw the browser inspector's `Tags in effect` run.
    const rule = ruleFor('is-inspector');
    assert.match(rule, /padding:\s*var\(--fab-space-1\) var\(--fab-space-2\)/);
    assert.match(rule, /border-radius:\s*999px/);
    assert.match(rule, /font-size:\s*10px/);
    assert.match(rule, /font-weight:\s*600/);
    // GEOMETRY AND TYPE ONLY. The run's two halves are deliberately differently toned.
    assert.ok(!/(?:^|[^-])color:/.test(rule), 'the inspector density paints no ink and no fill');
  });
});

/** THE EMPHASIS AXIS AND THE QUIET FACT PILL (issue 1371). */
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
    // The reference's badge is a MICRO pill on a plate (`proto:1313`).
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
    const rule = ruleFor('is-outlined');
    assert.match(rule, /background:\s*var\(--fab-bg-1\)/, 'the flat plate is the theme surface token');
    assert.ok(!/border-color:/.test(rule), 'the tone keeps its edge');
    assert.ok(!/(?:^|[^-])color:/.test(rule), 'and the tone keeps its ink');
  });

  it('writes the emphasis AFTER every tone rule, so the plate wins the fill', () => {
    // Equal specificity, so ORDER decides.
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
    // The vocabulary is closed, and it now has two members.
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


/** THE BARE EMPHASIS, NOW THAT A CALLER DRAWS IT (issue 1506). */
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

    // The catalogue's UNLINKED row is `warning` with this face.
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
    // `border: 0` rather than `border-width: 0`.
    assert.match(rule, /(?:^|\n)\s*border:\s*0;/, 'the whole of this face is the edge going away');
    assert.ok(
      !/(?:^|;|\n)\s*(?:color|background)\s*:/.test(rule),
      `the bare face states a colour of its own, so the tone stops deciding it: ${rule}`
    );
  });

  /**
   * The stylesheet the mount INJECTED, comments stripped.
   *
   * @returns {string}
   */
  function injectedCss() {
    return withoutComments(
      [...document.querySelectorAll('style')].map((node) => node.textContent).join('\n')
    );
  }

  /**
   * The computed `font-size`, in px, of the glyph a chip rendered from its `icon` prop.
   *
   * @param {Element} target the mounted container
   * @returns {number}
   */
  function glyphFontSize(target) {
    const glyph = chipNode(target).querySelector('i');
    assert.ok(Boolean(glyph), 'the chip rendered a glyph from its `icon` prop');
    return Number.parseFloat(getComputedStyle(glyph).fontSize);
  }

  it('emits the status dot rule, at the size that makes a dot a MARK', async () => {
    // The one rule in this component with no `is-*` class of its own.
    await harness.mount({ icon: 'fa-solid fa-circle' });
    const [rule] = [...injectedCss().matchAll(/[^{}]*\bi\.fa-circle[^{}]*\{[^}]*\}/g)].map(
      ([match]) => match
    );
    assert.ok(
      Boolean(rule),
      'the compiled sheet no longer states a rule for the status dot at all'
    );
    assert.match(
      rule,
      /font-size:\s*0\.36rem/,
      `the dot must draw at 0.36rem, and the compiled rule says: ${rule}`
    );
    assert.match(
      rule,
      /\.manager-chip\.svelte-\w+ i\.fa-circle/,
      `the rule must stay scoped to a chip's own glyph, but emitted: ${rule}`
    );
  });

  it('draws the dot STRICTLY smaller than the same chip drawn with any other glyph', async () => {
    // The compiled rule above proves the declaration.
    const dot = await harness.mount({ icon: 'fa-solid fa-circle' });
    const dotSize = glyphFontSize(dot);
    harness.remount();
    const glyph = await harness.mount({ icon: 'fa-solid fa-lock' });
    const glyphSize = glyphFontSize(glyph);
    assert.ok(
      dotSize > 0 && glyphSize > 0,
      `both glyphs must resolve to a real size, but read ${dotSize}px and ${glyphSize}px`
    );
    assert.ok(
      dotSize < glyphSize,
      `the dot must be a mark rather than a glyph, but read ${dotSize}px beside ${glyphSize}px`
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
    // The tie this `:not()` exists to lose: the dot rule is (0,2,1) and written EARLIER.
    const dot = styleBlock.search(/\.manager-chip i\.fa-circle/);
    assert.ok(dot !== -1 && dot < glyphRule, 'and the dot rule is still written first');
  });
});

/** THE CLOSED VOCABULARIES ARE PINNED BY EXACT COUNT (issue 1506). */
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

    // The names as well as the count.
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
      'the independent 15px icon square, distinct from the labelled 18.4px bordered list chip',
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

    // Equal insets, which at a fixed side is none at all.
    assert.match(
      ruleFor('is-icon-only'),
      /(?:^|\n)\s*padding:\s*0;/,
      'the square drops the chip padding and lets the base rule centre the glyph'
    );
  });

  it('states each density side as a COMPOUND selector, so it does not depend on rule order', () => {
    for (const [selector] of ICON_ONLY_SIDES.slice(1)) {
      // (0,3,0) against the density's own (0,2,0) and the base rule's (0,1,0).
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

/** `density="list"` IS SINGLE-LINE (issue 1506, decision G). */
describe('1506 Chip — the list density is single-line', () => {
  it('states `white-space: nowrap`, as the two densities beside it already do', () => {
    assert.match(
      ruleFor('is-list'),
      /(?:^|\n)\s*white-space:\s*nowrap;/,
      "the list density inherited the base rule's wrap, and the reference draws a stadium"
    );
  });

  it('leaves the SHRINK to the caller, stating no flex of its own', () => {
    // The retired journal pill held its width with `flex: 0 0 auto`; that is position.
    assert.ok(
      !/(?:^|\n)\s*flex(?:-shrink)?:/.test(ruleFor('is-list')),
      'a density states how text lays out, never how much room the row gives the chip'
    );
  });
});
