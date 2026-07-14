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

// Every primitive is a leaf: no rawModules, no sibling components. If one of these
// ever grows an import, this list is where the omission shows up — as a hang
// (`# cancelled`), never a failure.
const PRIMITIVES = ['Stepper', 'StatusPill', 'Medallion', 'CollapsibleGroupHeader'];

const harnesses = new Map(
  PRIMITIVES.map((name) => {
    const componentPath = `src/ui/svelte/components/${name}.svelte`;
    return [
      name,
      createMountedComponentHarness({
        repoRoot,
        tmpPrefix: `fabricate-primitive-${name.toLowerCase()}-`,
        compiledModules: [componentPath],
        componentPath
      })
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
      const source = readFileSync(resolve(repoRoot, `src/ui/svelte/components/${name}.svelte`), 'utf8');
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
      const source = readFileSync(resolve(repoRoot, `src/ui/svelte/components/${name}.svelte`), 'utf8');
      assert.ok(
        !/\b(?:linear|radial|conic)-gradient\s*\(/.test(source),
        `${name}.svelte must stay flat (flat-ui-style-contract)`
      );
    }
  });
});

describe('Stepper (mounted)', () => {
  it('exposes a typeable number input, not a click-only control', async () => {
    const root = await harnessFor('Stepper').mount({ value: 3, min: 1, max: 9, ariaLabel: 'Quantity' });
    const input = root.querySelector('[data-stepper-input]');

    assert.equal(input.tagName, 'INPUT');
    assert.equal(input.getAttribute('type'), 'number');
    assert.equal(input.getAttribute('aria-label'), 'Quantity');
    assert.equal(input.value, '3');
  });

  it('commits a typed value through onChange', async () => {
    const changes = [];
    const root = await harnessFor('Stepper').mount({ value: 3, min: 1, max: 9, onChange: (next) => changes.push(next) });
    const input = root.querySelector('[data-stepper-input]');

    input.value = '7';
    input.dispatchEvent(new globalThis.Event('input', { bubbles: true }));
    flushSync();

    assert.deepEqual(changes, [7]);
  });

  it('clamps a typed value to the max on blur', async () => {
    const changes = [];
    const root = await harnessFor('Stepper').mount({ value: 3, min: 1, max: 9, onChange: (next) => changes.push(next) });
    const input = root.querySelector('[data-stepper-input]');

    input.value = '40';
    input.dispatchEvent(new globalThis.Event('blur', { bubbles: true }));
    flushSync();

    assert.deepEqual(changes, [9]);
  });

  it('steps with the adjunct buttons and disables them at the bounds', async () => {
    const changes = [];
    const root = await harnessFor('Stepper').mount({ value: 1, min: 1, max: 2, step: 1, onChange: (next) => changes.push(next) });

    const decrement = root.querySelector('[data-stepper-decrement]');
    const increment = root.querySelector('[data-stepper-increment]');
    assert.equal(decrement.disabled, true, 'the − adjunct is disabled at the min');

    increment.click();
    flushSync();
    assert.deepEqual(changes, [2]);
  });
});

describe('StatusPill (mounted)', () => {
  const TONES = [
    { tone: 'subtle', icon: '', label: 'Disabled' },
    { tone: 'accent', icon: 'fas fa-lock', label: 'Locked' },
    { tone: 'danger', icon: 'fas fa-circle-exclamation', label: "Can't enable" },
    { tone: 'warning', icon: 'fas fa-pen-ruler', label: 'Incomplete' }
  ];

  for (const { tone, icon, label } of TONES) {
    it(`renders the ${tone} tone with its label and icon`, async () => {
      const root = await harnessFor('StatusPill').mount({ tone, icon, label });
      const pill = root.querySelector(`[data-status-pill="${tone}"]`);

      assert.ok(pill, `a ${tone} pill should render`);
      assert.equal(pill.textContent.trim(), label);
      const glyph = pill.querySelector('i');
      assert.equal(!!glyph, !!icon, `a ${tone} pill renders its glyph only when one is supplied`);
      // Svelte appends its scoping class, so assert containment rather than equality.
      if (icon) for (const token of icon.split(' ')) assert.ok(glyph.classList.contains(token));
    });
  }
});

describe('Medallion (mounted)', () => {
  it('renders the resolved image when one is passed', async () => {
    const root = await harnessFor('Medallion').mount({ src: 'icons/svg/book.svg', icon: 'fas fa-scroll' });
    const medallion = root.querySelector('[data-medallion]');

    assert.equal(medallion.dataset.medallion, 'image');
    assert.equal(medallion.querySelector('img').getAttribute('src'), 'icons/svg/book.svg');
    assert.equal(medallion.querySelector('i'), null);
  });

  it('falls back to the glyph when src is falsy', async () => {
    const root = await harnessFor('Medallion').mount({ src: '', icon: 'fas fa-flask' });
    const medallion = root.querySelector('[data-medallion]');

    assert.equal(medallion.dataset.medallion, 'glyph');
    assert.equal(medallion.querySelector('img'), null);
    assert.ok(medallion.querySelector('i.fas.fa-flask'));
  });

  it('sizes the tile from the size prop', async () => {
    const root = await harnessFor('Medallion').mount({ src: '', size: 52 });
    const style = root.querySelector('[data-medallion]').getAttribute('style').replace(/\s+/g, '');
    assert.match(style, /width:52px;height:52px/);
  });
});

describe('CollapsibleGroupHeader (mounted)', () => {
  it('is a button carrying aria-expanded and aria-controls', async () => {
    const root = await harnessFor('CollapsibleGroupHeader').mount({
      name: 'Alchemy',
      countText: '4 recipes',
      expanded: true,
      controls: 'group-alchemy'
    });
    const header = root.querySelector('[data-group-header="Alchemy"]');

    assert.equal(header.tagName, 'BUTTON');
    assert.equal(header.getAttribute('aria-expanded'), 'true');
    assert.equal(header.getAttribute('aria-controls'), 'group-alchemy');
    assert.ok(header.textContent.includes('Alchemy'));
    assert.ok(header.textContent.includes('4 recipes'));
    assert.ok(header.querySelector('i.fa-chevron-down'), 'an expanded group shows the down chevron');
  });

  it('shows the collapsed chevron and toggles on activation', async () => {
    let toggles = 0;
    const root = await harnessFor('CollapsibleGroupHeader').mount({
      name: 'Smithing',
      countText: '2 recipes',
      expanded: false,
      controls: 'group-smithing',
      onToggle: () => { toggles += 1; }
    });
    const header = root.querySelector('[data-group-header="Smithing"]');

    assert.equal(header.getAttribute('aria-expanded'), 'false');
    assert.ok(header.querySelector('i.fa-chevron-right'), 'a collapsed group shows the right chevron');

    header.click();
    flushSync();
    assert.equal(toggles, 1);
  });
});
