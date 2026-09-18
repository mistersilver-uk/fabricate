/** `Avatar`, an actor's portrait (issue 1506). */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, before, after, afterEach } from 'node:test';

import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const PRIMITIVE = 'src/ui/svelte/components/Avatar.svelte';

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-avatar-',
  rawModules: [],
  compiledModules: [PRIMITIVE],
  componentPath: PRIMITIVE,
});

before(() => harness.setup());
after(() => harness.teardown());
afterEach(() => harness.remount());

const tileOf = (root) => root.querySelector('[data-avatar]');
/** The tile's `style` attribute with every space removed. */
const styleOf = (root) => tileOf(root).getAttribute('style').replaceAll(/\s+/g, '');
const classesOf = (root) =>
  [...tileOf(root).classList].filter((name) => !name.startsWith('svelte-'));

describe('Avatar (mounted) — the two artwork states', () => {
  it('renders the actor image, filling the box, with the caller`s alt verbatim', async () => {
    const root = await harness.mount({
      art: 'icons/svg/mystery-man.svg',
      name: 'Brenna Karrun',
      alt: '',
      size: 34,
    });

    assert.equal(tileOf(root).dataset.avatar, 'image');
    const image = tileOf(root).querySelector('img');
    assert.ok(Boolean(image), 'the art state renders an image');
    assert.equal(image.getAttribute('src'), 'icons/svg/mystery-man.svg');
    // Asserted as the ATTRIBUTE and not as `.alt`.
    assert.equal(image.getAttribute('alt'), '');
    assert.ok(
      !tileOf(root).querySelector('.fab-avatar-initials'),
      'the initials mark is the FALLBACK, so a tile with artwork must not carry both'
    );
  });

  it('falls back to two initials when the caller passes no art, and never to a glyph', async () => {
    // THE STATE NO FRAME REACHES. The trigger is the CALLER's.
    const root = await harness.mount({ art: '', name: 'Brenna Karrun', size: 34 });

    assert.equal(tileOf(root).dataset.avatar, 'initials');
    const mark = tileOf(root).querySelector('.fab-avatar-initials');
    assert.ok(Boolean(mark), 'the fallback state renders the initials mark');
    assert.equal(mark.textContent.trim(), 'BK');
    assert.equal(
      mark.getAttribute('aria-hidden'),
      'true',
      'the mark is decorative: every shipped site renders the actor name as adjacent text, so ' +
        'announcing the initials reads the same word twice'
    );
    assert.ok(
      !tileOf(root).querySelector('i'),
      'an actor with no artwork gets initials, not a glyph'
    );
  });

  it('derives the initials from the name it is given, one word or many', async () => {
    for (const [name, expected] of [
      ['Brenna Karrun', 'BK'],
      ['  Vosk   Ironhand  ', 'VI'],
      ['Idrin', 'ID'],
      ['idrin of the mire', 'IO'],
      ['', ''],
      [' '.repeat(3), ''],
    ]) {
      const root = await harness.mount({ art: '', name });
      assert.equal(
        root.querySelector('.fab-avatar-initials').textContent.trim(),
        expected,
        `"${name}" should mark as "${expected}"`
      );
      harness.remount();
    }
  });

  it('sizes the box and the initials from `size`, in one style attribute', async () => {
    // `size` is deliberately UNRESTRICTED.
    for (const [size, box, mark] of [
      [32, '32px', '10px'],
      [34, '34px', '11px'],
      [50, '50px', '16px'],
    ]) {
      const root = await harness.mount({ art: '', name: 'Brenna Karrun', size });
      const style = styleOf(root);
      assert.ok(style.includes(`width:${box}`), `${size} sets width ${box}`);
      assert.ok(style.includes(`height:${box}`), `${size} sets height ${box}`);
      assert.ok(style.includes(`--fab-avatar-initials:${mark}`), `${size} marks at ${mark}`);
      harness.remount();
    }
  });
});

describe('Avatar (mounted) — the shape is the caller`s', () => {
  it('is round by default, because a person is the reading silence gives', async () => {
    const root = await harness.mount({ art: '', name: 'Idrin' });
    assert.deepEqual(classesOf(root), ['fab-avatar']);
  });

  it('takes the rounded square for a party, a vehicle or a place', async () => {
    const root = await harness.mount({ art: '', name: 'The Wildwood Company', shape: 'square' });
    assert.deepEqual(classesOf(root), ['fab-avatar', 'is-square']);
  });

  it('DROPS an unrecognised shape rather than emitting a class nothing paints', async () => {
    const root = await harness.mount({ art: '', name: 'Idrin', shape: 'hexagon' });
    assert.deepEqual(
      classesOf(root),
      ['fab-avatar'],
      'the shape set is closed, so an unrecognised value renders the published default'
    );
  });
});

describe('Avatar (mounted) — the tint is class-gated, and the ring is the edge', () => {
  it('emits NO tint vehicle at all when no tint is passed', async () => {
    // THE CLAUSE THE WHOLE CLASS-GATING ARGUMENT RESTS ON. Written the way the specimen draws it
    // — one `color-mix()` on the base rule — an untinted avatar would lose its ground entirely,
    // because a `color-mix()` over an unset custom property is invalid at computed-value time and
    // `background-color` falls back to `transparent`. Both shipped call sites are untinted, so
    // this is the state the product actually renders.
    const root = await harness.mount({ art: '', name: 'Idrin', size: 34 });

    assert.deepEqual(classesOf(root), ['fab-avatar']);
    assert.ok(
      !tileOf(root).hasAttribute('data-avatar-tint'),
      'an untinted avatar carries no tint hook, so a selector cannot match one'
    );
    assert.doesNotMatch(
      styleOf(root),
      /--fab-avatar-tint/,
      'the tint custom property is absent rather than empty — an empty one still participates'
    );
  });

  it('passes a palette key through as a token reference, in either spelling', async () => {
    for (const spelling of ['sage', '--fab-tag-sage']) {
      const root = await harness.mount({ art: '', name: 'Idrin', tint: spelling });
      assert.deepEqual(classesOf(root), ['fab-avatar', 'has-tint']);
      assert.equal(tileOf(root).dataset.avatarTint, 'sage');
      assert.ok(
        styleOf(root).includes('--fab-avatar-tint:var(--fab-tag-sage)'),
        'the key resolves to a token reference rather than a colour the caller composed'
      );
      harness.remount();
    }
  });

  it('DROPS a tint that is not a palette key, rather than interpolating it', async () => {
    // The value lands inside a `style` attribute.
    for (const tint of ['red; background: url(x)', 'rgb(1 2 3)', '  ']) {
      const root = await harness.mount({ art: '', name: 'Idrin', tint });
      assert.deepEqual(classesOf(root), ['fab-avatar'], `${JSON.stringify(tint)} is dropped`);
      assert.doesNotMatch(styleOf(root), /--fab-avatar-tint/);
      harness.remount();
    }
  });

  it('states the tint as a SEPARATE rule, and the ring as the edge`s colour', () => {
    // The DOM half above proves the vehicle is absent when unset.
    const styles = /<style>([\s\S]*)<\/style>/.exec(
      readFileSync(resolve(repoRoot, PRIMITIVE), 'utf8')
    );
    assert.ok(styles, 'the component still declares a scoped style block');
    const withoutComments = styles[1].replaceAll(/\/\*[\s\S]*?\*\//g, ' ');

    /**
     * One rule's declarations, by its full selector.
     *
     * @param {string} head e.g. `.fab-avatar.has-tint`
     * @returns {string[]} `property: value` pairs, in source order
     */
    const ruleOf = (head) => {
      const at = withoutComments.indexOf(`${head} {`);
      assert.notEqual(at, -1, `the style block declares \`${head}\``);
      return withoutComments
        .slice(withoutComments.indexOf('{', at) + 1, withoutComments.indexOf('}', at))
        .split(';')
        .map((declaration) => declaration.trim().replaceAll(/\s+/g, ' '))
        .filter(Boolean);
    };

    assert.deepEqual(ruleOf('.fab-avatar.has-tint'), [
      'border-color: var(--fab-avatar-tint)',
      'background: color-mix(in oklab, var(--fab-avatar-tint) 30%, var(--fab-bg-3))',
    ]);

    const base = ruleOf('.fab-avatar');
    assert.ok(
      base.includes('background: var(--fab-bg-3)'),
      'the untinted ground is the flat icon-chip level, stated on the base rule'
    );
    assert.ok(
      base.includes('border: 1px solid var(--fab-border)'),
      'the edge lives on the BASE rule, so it is the edge in BOTH states and the tinted rule ' +
        'recolours it rather than drawing a second hairline outside it'
    );
    assert.ok(
      base.every((declaration) => !declaration.includes('--fab-avatar-tint')),
      'the base rule must not read the tint property: unset, a `color-mix()` over it is invalid ' +
        'at computed-value time and every untinted avatar loses its ground'
    );
    assert.doesNotMatch(
      withoutComments,
      /box-shadow/,
      'the ring is a border colour, never a shadow that grows the tinted tile`s footprint'
    );
  });
});
