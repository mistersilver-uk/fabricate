/**
 * THE manager's labelled push-button, mounted (issues 1096 and 1118).
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
    // `tagName`, not the class string: `<svelte:element>` computes the tag from props.
    assert.equal(node.tagName, 'BUTTON');
    assert.equal(node.getAttribute('type'), 'button');
    // A manager button inside a `<form>`-adjacent card must never submit by accident.
    assert.equal(node.className, 'fabricate-button manager-button fab-manager-button');
  });

  it('emits is-warning-action for the warning role, and never is-warning', async () => {
    await harness.mount({ role: 'warning' });
    const node = button();
    // The sheet declares `.manager-button.is-warning-action` and no `.manager-button.is-warning`.
    assert.ok(node.classList.contains('is-warning-action'), node.className);
    assert.ok(!node.classList.contains('is-warning'), node.className);
  });

  it('emits is-${role} for the four roles whose class does match their name', async () => {
    for (const role of ['primary', 'ghost', 'danger', 'dashed']) {
      await harness.mount({ role });
      assert.equal(
        button().className,
        `fabricate-button manager-button fab-manager-button is-${role}`,
        `the ${role} role`
      );
      harness.remount();
    }
  });

  it('renders neutral for an unrecognised role rather than an unstyled is-* class', async () => {
    await harness.mount({ role: 'nonsense' });
    // A typo must show up as the default button, never as a class the sheet does not declare.
    assert.equal(button().className, 'fabricate-button manager-button fab-manager-button');
  });

  it('renders neutral for a role that names an inherited member of the mapping', async () => {
    // `ROLE_CLASSES[role]` reads Object.prototype too.
    for (const role of ['toString', 'constructor', 'hasOwnProperty']) {
      await harness.mount({ role });
      assert.equal(
        button().className,
        'fabricate-button manager-button fab-manager-button',
        `role="${role}"`
      );
      harness.remount();
    }
  });

  it('emits is-full-width only when fullWidth is set, and never as a role', async () => {
    await harness.mount({ role: 'dashed', fullWidth: true });
    assert.equal(
      button().className,
      'fabricate-button manager-button fab-manager-button is-dashed is-full-width'
    );
    harness.remount();
    await harness.mount({ role: 'dashed' });
    // `dashed` states the VERB (append to the list above me); the container states the width.
    assert.ok(!button().classList.contains('is-full-width'), button().className);
  });

  // ── THE 38px RUNG (issue 1371) ────────────────────────────────────────────────────────
  it('emits NO size class by default, so every shipped button keeps its 34px control', async () => {
    await harness.mount({ role: 'primary' });
    assert.equal(button().className, 'fabricate-button manager-button fab-manager-button is-primary');
  });

  it('emits is-size-38 when asked, between its own modifiers and the caller class', async () => {
    await harness.mount({ role: 'primary', size: '38', fullWidth: true, class: 'manager-thing' });
    // The documented order, and the same one `ManagerSearchField` states for the same token:
    assert.equal(
      button().className,
      'fabricate-button manager-button fab-manager-button is-primary is-full-width is-size-38 manager-thing'
    );
  });

  it('takes the rung as a number too, since a caller will write size={38}', async () => {
    await harness.mount({ size: 38 });
    assert.equal(button().className, 'fabricate-button manager-button fab-manager-button is-size-38');
  });

  it('DROPS an unrecognised rung rather than emitting a class the sheet does not paint', async () => {
    // A retired rung, a rung the sheet has no rule for, an adjective.
    for (const size of ['36', '40', 34, 'tall', '', 'toString']) {
      await harness.mount({ size });
      assert.equal(
        button().className,
        'fabricate-button manager-button fab-manager-button',
        `size="${String(size)}" is not a rung this button offers`
      );
      harness.remount();
    }
  });

  it('appends the pass-through class after its own, never in place of them', async () => {
    await harness.mount({ role: 'ghost', class: 'is-subtle manager-thing' });
    // A `class` arriving through the rest spread would REPLACE the primitive's classes and
    // silently unstyle the button while every `data-*` selector kept resolving.
    assert.equal(
      button().className,
      'fabricate-button manager-button fab-manager-button is-ghost is-subtle manager-thing'
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
    // An anchor with no href is not focusable.
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
