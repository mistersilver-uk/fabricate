/**
 * THE FILTER BAR AND THE CARD SHELL, MOUNTED — the root-emission proof on the rendered DOM
 * (issues 1039, 1427 and 1508).
 *
 * ── WHY A MOUNTED SUITE FOR TWO PROPS-ONLY LEAVES ────────────────────────────────────────
 * Every other reader of `fabricate-filter-bar` and `fabricate-card` is SOURCE TEXT.
 * `tests/components/searchable-popover-area-scope.test.js` reads each primitive's
 * `const classes = $derived([…])` array; `tests/components/re-rooted-controls-host-independence.
 * test.js` writes the class string into its own fixture as a literal and measures the sheet
 * against it. Both would go on passing on a tree where the component declared the array and
 * stopped rendering `class={classes}` — and on that tree every re-rooted rule in
 * `styles/fabricate.css` matches nothing, in both applications, which is the whole of what issue
 * 1508 set out to prevent. Mounting the component and comparing the WHOLE class attribute is the
 * one reader that catches it.
 *
 * The four families that shipped before these two already have that reader somewhere: the button
 * families in `manager-button-mounted.test.js`, `ManagerSearchField` in the two `className`
 * equalities of `manager-control-rungs.test.js`, and `Field` in `field-mounted.test.js`'s two
 * `getAttribute('class')` equalities. Neither of these two had a mounted suite of its own, so
 * this is it, and it holds both because the question is identical for both and one table asking
 * it twice is the shape that does not drift — two copies of a class-string assertion are exactly
 * the near-identical block the SonarCloud duplication gate counts.
 *
 * ── WHAT IS ASSERTED, AND WHY EACH CLAUSE EARNS ITS PLACE ────────────────────────────────
 *  - THE HOST ELEMENT. Both primitives render a literal `<section>` rather than a
 *    `<svelte:element>`, and both are `<section>`s because a census of their call sites found a
 *    set of size one. A `<div>` here would keep every class and every `data-*` hook the rest of
 *    the suite looks for while dropping the bar out of the landmark list.
 *  - THE WHOLE CLASS STRING, by equality rather than by `classList.contains`. A `contains` check
 *    cannot see a root that arrived SECOND, and the position is a constraint rather than a style
 *    note: the area-scope gate reads the composed region up to the first `]`, so a root moved off
 *    the head of the array is a root that gate reports as unemitted.
 *  - THE CALLER'S EXTRA, APPENDED. Both take `class` as a named prop precisely so the rest spread
 *    cannot replace the primitive's own token, and both document that order. An `is-*` modifier
 *    or a caller's card class landing BEFORE the root would still paint; a caller class that
 *    REPLACED the family class would silently un-bar the section while every `data-*` selector in
 *    the tests kept resolving.
 *  - THE REST SPREAD, on the attribute both files record as a trap: a bare `data-*` on a
 *    component tag is the boolean `true` and renders `="true"`, where the hand-rolled section
 *    rendered `=""`.
 *  - THE BAR'S ACCESSIBLE NAME, which is a named prop rather than a rest key because a `<section>`
 *    without one is not a `region` landmark at all.
 *
 * Both components are import-free LEAVES — props only, no bridge, no util imports — so each
 * harness compiles exactly one module. `compiledModules` names the path as a LITERAL rather than
 * through a binding, because `mounted-harness-primitive-allowlist.test.js` reads that list by
 * matching path-shaped quoted strings and a bare identifier there would make this suite read as
 * compiling nothing at all.
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
 * The same reader `re-rooted-controls-host-independence.test.js` uses, and for its reason: a
 * probe built from a restated string keeps measuring the old control after the component stops
 * emitting it, and reports green while doing so. What this file adds on top is the comparison
 * against the RENDERED attribute, which is the half source text cannot answer.
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

/**
 * The two primitives, and the facts each clause below is stated over.
 *
 * `root` and `hook` are RESTATED here on purpose, against the values read out of the component by
 * `composedClasses`: the read is what keeps the assertions pointed at what the primitive really
 * emits, and the literal is what makes this file say out loud which class is supposed to lead.
 * The pinning clause asserts the two against each other, so neither can drift alone.
 */
const PRIMITIVES = Object.freeze([
  Object.freeze({
    name: 'ManagerToolbar',
    file: 'src/ui/svelte/components/ManagerToolbar.svelte',
    harness: toolbarHarness,
    root: 'fabricate-filter-bar',
    hook: 'manager-toolbar',
    // A bar is a `region` landmark only while it has an accessible name, so every mount passes
    // one. It is a NAMED prop rather than a rest key for that reason.
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
 * Neither primitive declares a scoped `<style>` today — both are painted by
 * `styles/fabricate.css` and both record why — so the strip is a no-op now and stays because the
 * assertion is about the family's tokens, not about whether a scoping hash happens to exist.
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
      // THE SOURCE HALF, asserted here rather than left to the area-scope gate, because this
      // file's own equalities are only meaningful while the read and the literal agree.
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
      // The trap both docblocks record: a BARE `data-*` on a component tag is the boolean `true`
      // and renders `="true"`, where the hand-rolled `<section>` rendered `=""`. Presence
      // selectors resolve either way, which is why the suites and smoke steps that use them
      // would not have caught it — so the call sites spell the value and this asserts it.
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
    // The asymmetry is deliberate and is recorded in both components: the bar's accessible name
    // is required in practice and gated by its source contract, so it is a named prop; the card
    // has no name of its own to forget, so anything a caller wants rides the spread.
    const target = await cardHarness.mount({ 'aria-label': 'Matching evidence' });
    assert.equal(target.querySelector('section').getAttribute('aria-label'), 'Matching evidence');
  });
});
