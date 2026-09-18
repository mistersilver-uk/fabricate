/**
 * THE FILTER BAR AND THE CARD SHELL, MOUNTED.
 * `tests/components/searchable-popover-area-scope.test.js` reads each primitive's
 * `const classes = $derived([…])` array; `tests/components/re-rooted-controls-host-independence.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, before, after, afterEach } from 'node:test';

import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');

const toolbarHarness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-manager-toolbar-',
  compiledModules: ['src/ui/svelte/components/ManagerToolbar.svelte'],
  componentPath: 'src/ui/svelte/components/ManagerToolbar.svelte',
});

const cardHarness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-inspector-card-',
  compiledModules: ['src/ui/svelte/components/InspectorCard.svelte'],
  componentPath: 'src/ui/svelte/components/InspectorCard.svelte',
});

/**
 * The unconditional class literals of a primitive's `const classes = $derived([…])` array, READ
 * out of the component rather than restated here.
 *
 * @param {string} file Repository-relative component path.
 * @param {string} label The component, for the failure message.
 * @returns {string[]} Every unconditional string literal in the array, in order.
 */
function composedClasses(file, label) {
  const source = readFileSync(resolve(repoRoot, file), 'utf8');
  const literal = source.match(/const classes = \$derived\(\s*\[([\s\S]*?)\]/);
  assert.ok(literal, `${label} must declare its emitted classes as one array literal`);
  const tokens = [...literal[1].matchAll(/'([a-z][\w-]*)'/g)].map(([, token]) => token);
  assert.ok(tokens.length > 0, `${label}'s class array holds no unconditional literal`);
  return tokens;
}

/** The two primitives, and the facts each clause below is stated over. */
const PRIMITIVES = Object.freeze([
  Object.freeze({
    name: 'ManagerToolbar',
    file: 'src/ui/svelte/components/ManagerToolbar.svelte',
    harness: toolbarHarness,
    root: 'fabricate-filter-bar',
    hook: 'manager-toolbar',
    // A bar is a `region` landmark only while it has an accessible name.
    baseProps: Object.freeze({ ariaLabel: 'Filter components' }),
    callerClass: 'manager-scoped-list-toolbar',
    dataHook: 'data-recipe-toolbar',
  }),
  Object.freeze({
    name: 'InspectorCard',
    file: 'src/ui/svelte/components/InspectorCard.svelte',
    harness: cardHarness,
    root: 'fabricate-card',
    hook: 'manager-inspector-card',
    baseProps: Object.freeze({}),
    callerClass: 'manager-checks-card',
    dataHook: 'data-checks-odds',
  }),
]);

before(async () => {
  for (const primitive of PRIMITIVES) await primitive.harness.setup();
});
after(() => {
  for (const primitive of PRIMITIVES) primitive.harness.teardown();
});
afterEach(() => {
  for (const primitive of PRIMITIVES) primitive.harness.remount();
});

/**
 * The rendered class attribute, with any Svelte scoping token removed.
 *
 * @param {Element} node The mounted root element.
 * @returns {string} The class attribute.
 */
const emittedClasses = (node) => {
  const value = node.getAttribute('class');
  // NAMED, rather than a `TypeError` on `null.replace`. This is the exact failure this file
  // exists to produce — a component that declares the array and stops rendering
  // `class={classes}` — so it says what happened instead of dying inside a helper.
  assert.ok(
    typeof value === 'string',
    'the primitive rendered its root element with NO `class` attribute at all, so it has stopped ' +
      'emitting `class={classes}`. Every re-rooted rule in `styles/fabricate.css` now matches ' +
      'nothing, in both applications, while the class ARRAY it still declares reads correctly to ' +
      'every source-text gate in this repository.'
  );
  return value.replace(/ ?svelte-[a-z0-9]+/g, '');
};

describe('the filter bar and the card shell emit their family root on the rendered element', () => {
  for (const primitive of PRIMITIVES) {
    const { name, file, harness, root, hook, baseProps, callerClass, dataHook } = primitive;

    it(`${name} declares ${root} as the FIRST literal of its class array`, () => {
      // THE SOURCE HALF, asserted here rather than left to the area-scope gate.
      const tokens = composedClasses(file, name);
      assert.equal(
        tokens[0],
        root,
        `${name} must declare \`${root}\` as the FIRST literal of its class array: ` +
          '`searchable-popover-area-scope.test.js` reads the composed region up to the first ' +
          '`]`, so a root moved off the head of the array is reported as unemitted while every ' +
          're-rooted rule in the sheet keeps matching'
      );
      assert.deepEqual(
        tokens,
        [root, hook],
        `${name} emits exactly its family root and its hook class unconditionally`
      );
    });

    it(`${name} renders a <section> carrying exactly "${root} ${hook}" by default`, async () => {
      const target = await harness.mount({ ...baseProps });
      const node = target.querySelector('section');
      assert.ok(Boolean(node), `${name} rendered a <section>`);
      // The TAG, not the class string: the census behind both primitives found a set of size one,
      // and a `<div>` here keeps every class and hook while dropping a landmark.
      assert.equal(node.tagName, 'SECTION');
      // THE WHOLE ATTRIBUTE, by equality. `classList.contains(root)` cannot see a root that
      // arrived second, and the position is what the area-scope gate depends on.
      assert.equal(emittedClasses(node), `${root} ${hook}`);
    });

    it(`${name} APPENDS the caller's class behind its own, never in front of it`, async () => {
      const target = await harness.mount({ ...baseProps, class: callerClass });
      const node = target.querySelector('section');
      assert.equal(emittedClasses(node), `${root} ${hook} ${callerClass}`);
    });

    it(`${name} drops an empty class prop rather than emitting a trailing space`, async () => {
      // `.filter(Boolean)` is what makes the default render byte-identical to the hand-rolled
      // sites these primitives replaced, and a trailing space would make every whole-attribute
      // equality in this repository disagree with the markup it was derived from.
      const target = await harness.mount({ ...baseProps, class: '' });
      assert.equal(emittedClasses(target.querySelector('section')), `${root} ${hook}`);
    });

    it(`${name} forwards a data hook through the rest spread as the empty string`, async () => {
      // The trap both docblocks record.
      const target = await harness.mount({ ...baseProps, [dataHook]: '' });
      const node = target.querySelector('section');
      assert.equal(node.getAttribute(dataHook), '');
      // AND THE SPREAD DID NOT EAT THE CLASS. The rest spread lands after `class={classes}` in
      // the markup, which is exactly why `class` is a named prop; this is the clause that says
      // the arrangement still holds.
      assert.equal(emittedClasses(node), `${root} ${hook}`);
    });
  }

  it('ManagerToolbar names its landmark from the ariaLabel prop', async () => {
    const target = await toolbarHarness.mount({ ariaLabel: 'Filter components' });
    assert.equal(target.querySelector('section').getAttribute('aria-label'), 'Filter components');
  });

  it('InspectorCard takes aria-label through the rest spread, having none of its own', async () => {
    // The asymmetry is deliberate and is recorded in both components.
    const target = await cardHarness.mount({ 'aria-label': 'Matching evidence' });
    assert.equal(target.querySelector('section').getAttribute('aria-label'), 'Matching evidence');
  });
});
