// One combined suite for the four Recipe Studio behavioural primitives (issue 643
// §7). They are import-free leaves, so each mounts from a one-entry harness; the
// harnesses are built from a table rather than four near-identical files, because
// `tests/**` duplication counts against the SonarCloud new-code gate.
import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { flushSync } from '../../node_modules/svelte/src/index-client.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');

// Every primitive is a leaf: no rawModules.
const PRIMITIVES = ['Stepper', 'Medallion', 'CollapsibleGroupHeader'];

const harnesses = new Map(
  PRIMITIVES.map((name) => {
    const componentPath = `src/ui/svelte/components/${name}.svelte`;
    return [
      name,
      createMountedComponentHarness({
        repoRoot,
        tmpPrefix: `fabricate-primitive-${name.toLowerCase()}-`,
        compiledModules: [componentPath],
        componentPath,
      }),
    ];
  })
);

function harnessFor(name) {
  return harnesses.get(name);
}

before(async () => {
  for (const harness of harnesses.values()) await harness.setup();
});
after(() => {
  for (const harness of harnesses.values()) harness.teardown();
});
afterEach(() => {
  for (const harness of harnesses.values()) harness.remount();
});

describe('Recipe Studio primitives are import-free leaves', () => {
  it('never imports foundryBridge, a model, or a util', () => {
    for (const name of PRIMITIVES) {
      const source = readFileSync(
        resolve(repoRoot, `src/ui/svelte/components/${name}.svelte`),
        'utf8'
      );
      const imports = source.match(/^\s*import\s.*$/gm) || [];
      assert.deepEqual(
        imports,
        [],
        `${name}.svelte must stay props-only — an import here propagates a required raw-module entry into every mount-harness allowlist`
      );
    }
  });

  it('renders no gradient surfaces', () => {
    for (const name of PRIMITIVES) {
      const source = readFileSync(
        resolve(repoRoot, `src/ui/svelte/components/${name}.svelte`),
        'utf8'
      );
      assert.ok(
        !/\b(?:linear|radial|conic)-gradient\s*\(/.test(source),
        `${name}.svelte must stay flat (flat-ui-style-contract)`
      );
    }
  });
});

describe('Stepper (mounted)', () => {
  it('exposes a typeable number input, not a click-only control', async () => {
    const root = await harnessFor('Stepper').mount({
      value: 3,
      min: 1,
      max: 9,
      ariaLabel: 'Quantity',
    });
    const input = root.querySelector('[data-stepper-input]');

    assert.equal(input.tagName, 'INPUT');
    assert.equal(input.getAttribute('type'), 'number');
    assert.equal(input.getAttribute('aria-label'), 'Quantity');
    assert.equal(input.value, '3');
  });

  it('commits a typed value through onChange', async () => {
    const changes = [];
    const root = await harnessFor('Stepper').mount({
      value: 3,
      min: 1,
      max: 9,
      onChange: (next) => changes.push(next),
    });
    const input = root.querySelector('[data-stepper-input]');

    input.value = '7';
    input.dispatchEvent(new globalThis.Event('input', { bubbles: true }));
    flushSync();

    assert.deepEqual(changes, [7]);
  });

  it('clamps a typed value to the max on blur', async () => {
    const changes = [];
    const root = await harnessFor('Stepper').mount({
      value: 3,
      min: 1,
      max: 9,
      onChange: (next) => changes.push(next),
    });
    const input = root.querySelector('[data-stepper-input]');

    input.value = '40';
    input.dispatchEvent(new globalThis.Event('blur', { bubbles: true }));
    flushSync();

    assert.deepEqual(changes, [9]);
  });

  it('steps with the adjunct buttons and disables them at the bounds', async () => {
    const changes = [];
    const root = await harnessFor('Stepper').mount({
      value: 1,
      min: 1,
      max: 2,
      step: 1,
      onChange: (next) => changes.push(next),
    });

    const decrement = root.querySelector('[data-stepper-decrement]');
    const increment = root.querySelector('[data-stepper-increment]');
    assert.equal(decrement.disabled, true, 'the − adjunct is disabled at the min');

    increment.click();
    flushSync();
    assert.deepEqual(changes, [2]);
  });
});

describe('Medallion (mounted)', () => {
  it('renders the resolved image when one is passed', async () => {
    const root = await harnessFor('Medallion').mount({
      art: 'icons/svg/book.svg',
      icon: 'fas fa-scroll',
    });
    const medallion = root.querySelector('[data-medallion]');

    assert.equal(medallion.dataset.medallion, 'image');
    assert.equal(medallion.querySelector('img').getAttribute('src'), 'icons/svg/book.svg');
    assert.equal(medallion.querySelector('i'), null);
  });

  it('falls back to the glyph when art is falsy', async () => {
    const root = await harnessFor('Medallion').mount({ art: '', icon: 'fas fa-flask' });
    const medallion = root.querySelector('[data-medallion]');

    assert.equal(medallion.dataset.medallion, 'glyph');
    assert.equal(medallion.querySelector('img'), null);
    assert.ok(medallion.querySelector('i.fas.fa-flask'));
  });

  it('sizes the tile from the size prop', async () => {
    const root = await harnessFor('Medallion').mount({ art: '', size: 52 });
    const style = root.querySelector('[data-medallion]').getAttribute('style').replace(/\s+/g, '');
    assert.match(style, /width:52px;height:52px/);
  });

  // `art` renamed `src` in issue 1506.
  it('still answers to the DEPRECATED `src` alias, and lets `art` win over it', async () => {
    const aliased = await harnessFor('Medallion').mount({ src: 'icons/svg/book.svg' });
    assert.equal(
      aliased.querySelector('[data-medallion]').querySelector('img').getAttribute('src'),
      'icons/svg/book.svg',
      'the alias still renders the artwork it names'
    );

    const both = await harnessFor('Medallion').mount({
      art: 'icons/svg/daze.svg',
      src: 'icons/svg/book.svg',
    });
    assert.equal(
      both.querySelector('[data-medallion]').querySelector('img').getAttribute('src'),
      'icons/svg/daze.svg',
      'and the new name wins where a caller passes both'
    );
  });
});

/**
 * THE GLYPH-CHIP VARIANT (issue 1371, parity round 5, UX finding F12).
 * The rest of the geometry is the caller's — `size` and `glyph` are existing props and the variant
 * deliberately restates neither, because a primitive that took the row's dimensions as an
 * argument and then hard-coded them in a variant would hold two answers to one question.
 */
describe('Medallion glyph-chip variant (mounted)', () => {
  const medallionSource = readFileSync(
    resolve(repoRoot, 'src/ui/svelte/components/Medallion.svelte'),
    'utf8'
  );
  const styleBlock = medallionSource.slice(medallionSource.search(/^<style>$/m));

  /**
   * The declarations one rule states.
   *
   * @param {string} head the rule's full selector, e.g. `.fab-medallion.is-glyph-chip`
   * @returns {string[]} `property: value` pairs, in source order
   */
  function declarationsOf(head) {
    const block = styleBlock.replaceAll(/\/\*[\s\S]*?\*\//g, ' ');
    const open = block.indexOf(`${head} {`);
    assert.notEqual(open, -1, `the style block declares \`${head}\``);
    return block
      .slice(block.indexOf('{', open) + 1, block.indexOf('}', open))
      .split(';')
      .map((declaration) => declaration.trim().replace(/\s+/g, ' '))
      .filter(Boolean);
  }

  it('emits NOTHING by default, so every shipped medallion is unchanged', async () => {
    const root = await harnessFor('Medallion').mount({ art: '', icon: 'fas fa-flask' });
    const classes = [...root.querySelector('[data-medallion]').classList].filter(
      (name) => !name.startsWith('svelte-')
    );
    assert.deepEqual(
      classes,
      ['fab-medallion'],
      'an unset variant is the hook class and nothing else — a leaked class here repaints every call site at once'
    );
  });

  // RE-POINTED by issue 1506, which deleted the surface wash at every medallion and with it the
  // `has-tint` class that gated it. The property this case exists for is unchanged — the variant
  // and the tint are two axes and a row chip needs both — but the tint's reach is now the GLYPH
  // alone, so it is read where the tint still lands: the data hook and the custom property the
  // base rule inks the glyph from.
  it('adds is-glyph-chip when asked, and composes with the tint', async () => {
    const root = await harnessFor('Medallion').mount({ variant: 'glyph-chip', tint: 'sage' });
    const tile = root.querySelector('[data-medallion]');
    const classes = [...tile.classList].filter((name) => !name.startsWith('svelte-'));
    assert.deepEqual(
      classes.toSorted((a, b) => a.localeCompare(b)),
      ['fab-medallion', 'is-glyph-chip'],
      'the variant is a class and the tint is no longer one — a tinted tile paints no surface'
    );
    assert.equal(
      tile.dataset.medallionTint,
      'sage',
      'the tint still reaches the tile, on the attribute that survives the wash'
    );
    assert.match(
      tile.getAttribute('style'),
      /--fab-medallion-tint:\s*var\(--fab-tag-sage\)/,
      'and it reaches it as the custom property the base rule inks the GLYPH from'
    );
    assert.ok(
      styleBlock.includes('color: var(--fab-medallion-tint, var(--fab-accent))'),
      'which is the declaration that makes the two compose at all'
    );
  });

  it('DROPS an unrecognised variant rather than emitting a dead class', async () => {
    const root = await harnessFor('Medallion').mount({ variant: 'borderless' });
    const classes = [...root.querySelector('[data-medallion]').classList].filter(
      (name) => !name.startsWith('svelte-')
    );
    assert.deepEqual(classes, ['fab-medallion'], 'a typo renders the shipped tile');
  });

  it('states the borderless edge as `border: 0`, so the STYLE goes too', () => {
    // `border: 0` rather than `border-width: 0`.
    assert.deepEqual(declarationsOf('.fab-medallion.is-glyph-chip'), ['border: 0']);
  });

  // Issue 1506 deleted `cancels the tint WASH while keeping the tinted glyph`.
});

describe('CollapsibleGroupHeader (mounted)', () => {
  it('is a button carrying aria-expanded and aria-controls', async () => {
    const root = await harnessFor('CollapsibleGroupHeader').mount({
      name: 'Alchemy',
      countText: '4 recipes',
      expanded: true,
      controls: 'group-alchemy',
    });
    const header = root.querySelector('[data-group-header="Alchemy"]');

    assert.equal(header.tagName, 'BUTTON');
    assert.equal(header.getAttribute('aria-expanded'), 'true');
    assert.equal(header.getAttribute('aria-controls'), 'group-alchemy');
    assert.ok(header.textContent.includes('Alchemy'));
    assert.ok(header.textContent.includes('4 recipes'));
    assert.ok(
      header.querySelector('i.fa-chevron-down'),
      'an expanded group shows the down chevron'
    );

    // A tight LEFT CLUSTER: chevron, folder, name, count.
    const children = [...header.children].map((child) => child.classList[0]);
    assert.deepEqual(
      children.slice(-2),
      ['fab-group-count', 'fab-group-spacer'],
      'the count sits beside the name, with the empty bar after it'
    );
  });

  it('shows the collapsed chevron and toggles on activation', async () => {
    let toggles = 0;
    const root = await harnessFor('CollapsibleGroupHeader').mount({
      name: 'Smithing',
      countText: '2 recipes',
      expanded: false,
      controls: 'group-smithing',
      onToggle: () => {
        toggles += 1;
      },
    });
    const header = root.querySelector('[data-group-header="Smithing"]');

    assert.equal(header.getAttribute('aria-expanded'), 'false');
    assert.ok(
      header.querySelector('i.fa-chevron-right'),
      'a collapsed group shows the right chevron'
    );

    header.click();
    flushSync();
    assert.equal(toggles, 1);
  });
});
