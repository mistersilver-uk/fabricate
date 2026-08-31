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
    const styleBlock = chipSource.slice(chipSource.indexOf('<style>'));
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
