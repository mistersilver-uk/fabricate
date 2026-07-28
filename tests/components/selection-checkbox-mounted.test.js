/*
 * Issue 772 — the manager's ONE selection control.
 *
 * PR #836 was rejected for rendering a default Foundry checkbox on the component row when
 * the Tool Studio's requirements tab already shipped the treatment one screen away. The fix
 * was to extract that box into this primitive and CONVERT the duplicate, so what this suite
 * has to hold is not "a checkbox works" — it is the four properties that make the extraction
 * a removal rather than a third variant:
 *
 *  1. There is a REAL `<input type="checkbox">` under the custom box. Replace it with a
 *     `<div role="checkbox">` and the keyboard, the label association, the form value and
 *     every `input[value=…]` selector the Tool Studio suite already uses go with it. It must
 *     not be a `<button>` either: the Foundry smoke walk reaches the component row's Edit
 *     action through `.manager-component-row button` selectors.
 *  2. The three states are DISTINGUISHABLE in the DOM. `indeterminate` is a DOM property
 *     with no HTML attribute, so a markup-only implementation renders the "some selected"
 *     page box identically to the empty one, silently.
 *  3. BOTH wrapper modes render the structure their host needs. `label` is for a host whose
 *     action group is a `<span>`; `contents` is for a host whose own root is already a
 *     `<label>`, where a nested label would be invalid HTML and an ambiguous click target.
 *  4. The size ladder is declared, and `sm` is the shipped Tool Studio box unchanged.
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const componentPath = 'src/ui/svelte/components/SelectionCheckbox.svelte';
const source = readFileSync(resolve(repoRoot, componentPath), 'utf8');
// Only the scoped `<style>` block, comments stripped. Both invariants below are stated in
// the component's own doc comments, so matching the raw file would assert that the rules are
// DESCRIBED rather than that they are kept — and would fail the moment a comment named the
// very token it forbids, which is exactly what these comments do.
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
    // Unchecked shows the check glyph, painted transparent by the scoped rule — the box is
    // never empty markup, so the glyph cannot shift the layout when it appears.
    assert.ok(box(target).querySelector('i.fa-check'));

    await harness.setProps({ checked: true });
    assert.equal(input(target).checked, true);
    assert.equal(box(target).classList.contains('is-checked'), true);
    assert.ok(box(target).querySelector('i.fa-check'));

    // `indeterminate` has NO HTML attribute. If it is not applied as a DOM property, the
    // tri-state page box renders exactly like the empty one and nothing fails.
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
    // Both land directly in the host's own element, which is what puts the box in a host
    // grid's first column instead of inside an extra wrapper that would occupy the track.
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
    // `value` is how `ChecklistCardRow` identifies a prerequisite, and the Tool Studio suite
    // drives the tab through `input[value=…]`; the `data-*` hooks are how the component
    // browser's toolbar controls are reached. Both ride the rest spread onto the INPUT,
    // because the input is what a test clicks and what a form reads.
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

/*
 * The contract this primitive exists to keep, asserted against its source rather than a
 * mounted DOM, because neither happy-dom nor a mounted assertion can see either property.
 */
describe('SelectionCheckbox — the two invariants a mounted test cannot see', () => {
  it('uses theme-ROOT tokens only, never the manager-scoped aliases', () => {
    // This primitive is area-agnostic. `--fab-mv2-*` is declared on `.fabricate-manager`,
    // so outside the manager such a declaration is invalid at computed-value time and the
    // colour silently falls back to inheritance — nothing fails, it just looks wrong, and
    // the trigger is exactly the reuse the extraction exists to enable.
    assert.equal(
      /--fab-mv2-/.test(styles),
      false,
      'an area-agnostic primitive cannot reach a manager-scoped alias'
    );
    // `--fab-on-accent` differs from `--fab-bg-1` in every theme, so substituting it for
    // the checked glyph would re-colour the shipped Tool Studio box.
    assert.equal(
      /--fab-on-accent/.test(styles),
      false,
      'the checked glyph is --fab-bg-1, matching the box this replaced'
    );
    assert.match(styles, /color: var\(--fab-bg-1\);/);
  });

  it('keeps the Foundry pseudo-element reset with the input it protects', () => {
    // Foundry draws form controls THROUGH pseudo-elements. The reset reads as dead code
    // while the input is hidden at `opacity: 0`, and becomes load-bearing the moment any
    // size renders a visible one — which is precisely why it must not be dropped during a
    // move that makes it look unnecessary.
    assert.match(source, /\.fab-selection-input::before,\s*\n\s*\.fab-selection-input::after \{/);
  });
});
