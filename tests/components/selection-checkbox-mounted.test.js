/* Issue 772 — the manager's ONE selection control. */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const componentPath = 'src/ui/svelte/components/SelectionCheckbox.svelte';
const source = readFileSync(resolve(repoRoot, componentPath), 'utf8');
// Only the scoped `<style>` block.
const styles = source
  .slice(source.lastIndexOf('\n<style>\n') + '\n<style>\n'.length, source.lastIndexOf('\n</style>'))
  .replace(/\/\*[\s\S]*?\*\//g, '');

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-selection-checkbox-',
  rawModules: [],
  compiledModules: [componentPath],
  componentPath,
});

const box = (target) => target.querySelector('.fab-selection-check');
const input = (target) => target.querySelector('input[type="checkbox"]');

describe('SelectionCheckbox', () => {
  before(() => harness.setup());
  after(() => harness.teardown());

  it('renders a real checkbox behind the custom box, and never a button', async () => {
    const target = await harness.mount({ ariaLabel: 'Select Iron Ore' });

    const control = input(target);
    assert.ok(control, 'the real control is still in the DOM');
    assert.equal(control.getAttribute('aria-label'), 'Select Iron Ore');
    assert.ok(box(target), 'the custom box renders beside it');
    assert.equal(
      target.querySelectorAll('button').length,
      0,
      'a selection control that were a button would start matching the row-Edit selectors'
    );
    harness.remount();
  });

  it('distinguishes unchecked, checked and indeterminate', async () => {
    const target = await harness.mount({});
    assert.equal(input(target).checked, false);
    assert.equal(input(target).indeterminate, false);
    assert.equal(box(target).classList.contains('is-checked'), false);
    assert.equal(box(target).classList.contains('is-indeterminate'), false);
    // Unchecked shows the check glyph, painted transparent by the scoped rule.
    assert.ok(box(target).querySelector('i.fa-check'));

    await harness.setProps({ checked: true });
    assert.equal(input(target).checked, true);
    assert.equal(box(target).classList.contains('is-checked'), true);
    assert.ok(box(target).querySelector('i.fa-check'));

    // `indeterminate` has NO HTML attribute. If it is not applied as a DOM property.
    await harness.setProps({ checked: false, indeterminate: true });
    assert.equal(input(target).indeterminate, true);
    assert.equal(box(target).classList.contains('is-indeterminate'), true);
    assert.ok(box(target).querySelector('i.fa-minus'), 'some-selected reads as a minus');

    await harness.setProps({ indeterminate: false });
    assert.equal(input(target).indeterminate, false, 'the property is cleared, not only set');
    harness.remount();
  });

  it('reports the new checked state to onChange, in both directions', async () => {
    const changes = [];
    const target = await harness.mount({ onChange: (checked) => changes.push(checked) });

    input(target).click();
    assert.deepEqual(changes, [true]);

    await harness.setProps({ checked: true });
    input(target).click();
    assert.deepEqual(changes, [true, false], 'the callback carries the state, not a toggle signal');
    harness.remount();
  });

  it('wrapper="label" wraps the control so the visible box is a click target', async () => {
    const target = await harness.mount({ checked: true });
    const label = target.querySelector('label.fab-selection-checkbox');
    assert.ok(label, 'the default wrapper is a label');
    assert.equal(label.querySelector('input[type="checkbox"]').parentElement, label);
    assert.equal(label.querySelector('.fab-selection-check').parentElement, label);
    harness.remount();
  });

  it('wrapper="contents" renders bare siblings, so a label host does not nest labels', async () => {
    const target = await harness.mount({ wrapper: 'contents', checked: true });
    assert.equal(target.querySelector('label'), null, 'no label of its own');
    // Both land directly in the host's own element.
    assert.equal(input(target).parentElement, target);
    assert.equal(box(target).parentElement, target);
    harness.remount();
  });

  it('carries the declared size, and falls back rather than emitting an unstyled class', async () => {
    for (const size of ['sm', 'md', 'lg']) {
      const target = await harness.mount({ size });
      assert.equal(box(target).classList.contains(`is-${size}`), true);
      harness.remount();
    }

    const target = await harness.mount({ size: 'huge' });
    assert.equal(box(target).classList.contains('is-md'), true, 'an unknown size renders a box');
    assert.equal(box(target).classList.contains('is-huge'), false);
    harness.remount();
  });

  it('forwards disabled and the rest spread onto the real control', async () => {
    // `value` is how the Tool Studio identifies a prerequisite.
    const target = await harness.mount({
      disabled: true,
      value: 'expert',
      'data-component-select-all-page': true,
    });
    assert.equal(input(target).disabled, true);
    assert.equal(input(target).getAttribute('value'), 'expert');
    assert.ok(input(target).hasAttribute('data-component-select-all-page'));
    assert.equal(target.querySelector('label').classList.contains('is-disabled'), true);
    harness.remount();
  });
});

/* The contract this primitive exists to keep. */
describe('SelectionCheckbox — the two invariants a mounted test cannot see', () => {
  it('uses theme-ROOT tokens only, never an area-scoped manager property', () => {
    // This primitive is area-agnostic. `--fab-manager-*` is the prefix for an area-scoped
    // custom property, declared inside `.fabricate-manager`, so outside the manager such a
    // declaration is invalid at computed-value time and the value silently falls back to
    // inheritance — nothing fails, it just looks wrong, and the trigger is exactly the
    // reuse the extraction exists to enable. Issue 1399 retargeted this needle from the
    // retired manager alias generation; `token-generation-gate.test.js` now owns THAT ban,
    // and this one owns the area boundary, which the collapse narrowed but did not remove.
    assert.equal(
      /--fab-manager-/.test(styles),
      false,
      'an area-agnostic primitive cannot reach an area-scoped manager property'
    );
    // ── THE CHECKED INK IS PER SIZE.
    assert.match(styles, /\.fab-selection-check\.is-checked \{[^}]*color: var\(--fab-bg-1\);/);
    const onAccentRules = [...styles.matchAll(/([^\n{}]+)\{[^}]*--fab-on-accent[^}]*\}/g)].map(
      (match) => match[1].trim()
    );
    assert.deepEqual(
      onAccentRules,
      ['.fab-selection-check.is-sm.is-checked'],
      'only the small size may re-ink its tick; widening it re-colours two screens this ' +
        'change did not measure'
    );
  });

  it('keeps the Foundry pseudo-element reset with the input it protects', () => {
    // Foundry draws form controls THROUGH pseudo-elements. The reset reads as dead code
    // while the input is hidden at `opacity: 0`, and becomes load-bearing the moment any
    // size renders a visible one — which is precisely why it must not be dropped during a
    // move that makes it look unnecessary.
    assert.match(source, /\.fab-selection-input::before,\s*\n\s*\.fab-selection-input::after \{/);
  });
});
