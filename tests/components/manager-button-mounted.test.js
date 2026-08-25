/**
 * THE manager's labelled push-button, mounted (issues 1096 and 1118).
 *
 * `manager-layout.test.js` already measures what this control LOOKS like: it renders a
 * converted card button beside the Tool Studio's and compares computed geometry in a real
 * browser. What nothing pinned until now is what the component actually EMITS — which
 * element, which attributes on it, and which class string — and that is the half where this
 * primitive's defects have historically lived, because every one of them is invisible to
 * lint, to `format:check` and to a screenshot of a correctly-rendering screen.
 *
 * The pins below are therefore chosen by FAILURE MODE rather than by prop.
 *
 * `is-warning-action` is the sharpest of them. Five of the six roles emit `is-${role}` and
 * `warning` does not: the sheet declares `.manager-button.is-warning-action` and declares
 * `.manager-button.is-warning` NOWHERE. That asymmetry is the entire reason `ROLE_CLASSES`
 * is a named constant instead of a template, and it is exactly the shape a future tidy-up
 * removes in good faith — collapsing five entries plus an exception back into one
 * interpolation reads like cleaning up an inconsistency rather than deleting a fact. It
 * would not break a single mounted assertion elsewhere, it would not fail a lint rule, and
 * the button would keep rendering; it would simply render UNPAINTED, which is precisely how
 * `CompositionList`'s second force-include button shipped with no warning treatment while
 * the amber rule shipped with no call site. So the class is asserted by literal here, and
 * the absence of `is-warning` is asserted alongside it, because the defect was a plausible
 * spelling and not a typo.
 *
 * The ELEMENT identity pins matter for the same reason at a different layer. The component
 * renders `<svelte:element>` rather than a literal `<button>`, so the tag is now computed
 * from props at runtime and a regression there produces markup that still carries every
 * class and every `data-*` hook the rest of the suite looks for. A `<div>` or a
 * `<button>`-turned-`<a>` would keep passing the class-string assertions, the mounted
 * `querySelector` hooks and the computed-style parity gate, while losing focusability,
 * implicit role and Enter activation. Hence `tagName` is read directly on every path,
 * including the default one.
 *
 * The `href`, `type`, `disabled` and `rel` pins each encode a rule about VALID MARKUP that
 * a browser will not complain about: an anchor with `type="button"`, an anchor with
 * `disabled`, and an anchor with no `href` all render and all look right. The last is the
 * one reachable from product data rather than from a mistake — several anchor call sites
 * take their `href` from a caller's link list — which is why the empty case renders a real
 * `<button>` instead of a link-shaped element nobody can focus.
 *
 * `is-full-width` is pinned as a class the primitive owns, because it exists precisely so
 * that "full width" stops being a per-screen class string. If it drifts, the four sites that
 * asked for it silently return to their natural width.
 *
 * The component is an import-free LEAF — no stores, no bridge, no sibling component — so
 * this is a one-entry harness. `compiledModules` names the path as a LITERAL rather than
 * through the `componentPath` binding: `mounted-harness-primitive-allowlist.test.js` reads
 * that list by matching path-shaped quoted strings, and a bare identifier there would make
 * this suite read as compiling nothing at all.
 */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { describe, it, before, after, afterEach } from 'node:test';

import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const componentPath = 'src/ui/svelte/components/ManagerButton.svelte';

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-manager-button-',
  compiledModules: ['src/ui/svelte/components/ManagerButton.svelte'],
  componentPath,
});

before(async () => harness.setup());
after(() => harness.teardown());
afterEach(() => harness.remount());

const button = () => document.body.querySelector('.manager-button');

describe('ManagerButton emits the element and classes its call sites are styled against', () => {
  it('renders a real <button type="button"> with no role modifier by default', async () => {
    await harness.mount({});
    const node = button();
    // `tagName`, not the class string: `<svelte:element>` computes the tag from props, so a
    // regression that emitted a <div> here would keep every class and hook intact.
    assert.equal(node.tagName, 'BUTTON');
    assert.equal(node.getAttribute('type'), 'button');
    // A manager button inside a `<form>`-adjacent card must never submit by accident.
    assert.equal(node.className, 'manager-button fab-manager-button');
  });

  it('emits is-warning-action for the warning role, and never is-warning', async () => {
    await harness.mount({ role: 'warning' });
    const node = button();
    // The sheet declares `.manager-button.is-warning-action` and no `.manager-button.is-warning`.
    // A role emitting the second spelling renders an unpainted button that looks fine in the
    // DOM and wrong on the screen, which is the shipped defect this role exists to repair.
    assert.ok(node.classList.contains('is-warning-action'), node.className);
    assert.ok(!node.classList.contains('is-warning'), node.className);
  });

  it('emits is-${role} for the four roles whose class does match their name', async () => {
    for (const role of ['primary', 'ghost', 'danger', 'dashed']) {
      await harness.mount({ role });
      assert.equal(
        button().className,
        `manager-button fab-manager-button is-${role}`,
        `the ${role} role`
      );
      harness.remount();
    }
  });

  it('renders neutral for an unrecognised role rather than an unstyled is-* class', async () => {
    await harness.mount({ role: 'nonsense' });
    // A typo must show up as the default button, never as a class the sheet does not declare.
    assert.equal(button().className, 'manager-button fab-manager-button');
  });

  it('renders neutral for a role that names an inherited member of the mapping', async () => {
    // `ROLE_CLASSES[role]` reads Object.prototype too, so a plain index made the
    // unrecognised-role contract above hold for every string EXCEPT the handful that are
    // names on that prototype — and those emit a function's source text as a class list.
    // Not reachable from product data; it is pinned because the guard that closes it
    // (`Object.hasOwn`) is a line a future tidy-up would read as redundant (issue 1118).
    for (const role of ['toString', 'constructor', 'hasOwnProperty']) {
      await harness.mount({ role });
      assert.equal(button().className, 'manager-button fab-manager-button', `role="${role}"`);
      harness.remount();
    }
  });

  it('emits is-full-width only when fullWidth is set, and never as a role', async () => {
    await harness.mount({ role: 'dashed', fullWidth: true });
    assert.equal(button().className, 'manager-button fab-manager-button is-dashed is-full-width');
    harness.remount();
    await harness.mount({ role: 'dashed' });
    // `dashed` states the VERB (append to the list above me); the container states the width.
    assert.ok(!button().classList.contains('is-full-width'), button().className);
  });

  it('appends the pass-through class after its own, never in place of them', async () => {
    await harness.mount({ role: 'ghost', class: 'is-subtle manager-thing' });
    // A `class` arriving through the rest spread would REPLACE the primitive's classes and
    // silently unstyle the button while every `data-*` selector kept resolving.
    assert.equal(
      button().className,
      'manager-button fab-manager-button is-ghost is-subtle manager-thing'
    );
  });

  it('renders a real anchor for tag="a", carrying href and never type or disabled', async () => {
    await harness.mount({ tag: 'a', href: 'https://example.com/docs' });
    const node = button();
    assert.equal(node.tagName, 'A');
    assert.equal(node.getAttribute('href'), 'https://example.com/docs');
    // Both are invalid on an anchor, and a browser renders them without complaint.
    assert.ok(!node.hasAttribute('type'), 'an anchor must not carry a type attribute');
    assert.ok(!node.hasAttribute('disabled'), 'an anchor must not carry a disabled attribute');
  });

  it('defaults rel to noreferrer under target="_blank" and yields to an explicit rel', async () => {
    await harness.mount({ tag: 'a', href: '/x', target: '_blank' });
    assert.equal(button().getAttribute('rel'), 'noreferrer');
    harness.remount();
    await harness.mount({ tag: 'a', href: '/x', target: '_blank', rel: 'noopener noreferrer' });
    // The default is a floor, not a policy: a caller wanting `noopener noreferrer` keeps it.
    assert.equal(button().getAttribute('rel'), 'noopener noreferrer');
    harness.remount();
    await harness.mount({ tag: 'a', href: '/x' });
    assert.ok(!button().hasAttribute('rel'), 'no rel without target="_blank"');
    assert.ok(!button().hasAttribute('target'), 'no target attribute when the prop is unset');
  });

  it('falls back to a button for an empty href and for an unrecognised tag', async () => {
    await harness.mount({ tag: 'a', href: ' ' });
    // An anchor with no href is not focusable, has no implicit link role and does not
    // activate on Enter. Anchor call sites take their href from caller data, so this case is
    // reachable from the product rather than only from a mistake.
    assert.equal(button().tagName, 'BUTTON');
    assert.equal(button().getAttribute('type'), 'button');
    harness.remount();
    await harness.mount({ tag: 'div', href: '/x' });
    assert.equal(button().tagName, 'BUTTON');
  });

  it('forwards disabled on a button, and ignores it with a warning on an anchor', async () => {
    await harness.mount({ disabled: true });
    assert.ok(button().disabled, 'a button must carry its disabled state');
    harness.remount();

    const warnings = [];
    const original = console.warn;
    console.warn = (...args) => {
      warnings.push(args.join(' '));
    };
    try {
      await harness.mount({ tag: 'a', href: '/x', disabled: true });
      assert.equal(button().tagName, 'A');
      assert.ok(!button().hasAttribute('disabled'), 'an anchor must not carry disabled');
      // Silently dropping it would leave a call site believing it had disabled the control.
      assert.ok(
        warnings.some((warning) => warning.includes('ManagerButton')),
        `expected a named warning, got ${JSON.stringify(warnings)}`
      );
    } finally {
      console.warn = original;
    }
  });

  it('forwards rest attributes and an explicit button type', async () => {
    await harness.mount({ type: 'submit', 'data-recipe-action': 'delete', title: 'Delete' });
    const node = button();
    assert.equal(node.getAttribute('type'), 'submit');
    // Every `data-*` hook a converted call site relies on travels through the rest spread.
    assert.equal(node.getAttribute('data-recipe-action'), 'delete');
    assert.equal(node.getAttribute('title'), 'Delete');
  });
});
