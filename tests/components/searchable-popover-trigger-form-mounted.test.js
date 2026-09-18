/** THE PICKER'S TRIGGER FORMS, AND THE ONE ISSUE 1371 ADDS (`triggerButton`). */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { after, before, describe, it } from 'node:test';

import { flushSync } from '../../node_modules/svelte/src/index-client.js';
import {
  SEARCHABLE_POPOVER_COMPILED_MODULES,
  SEARCHABLE_POPOVER_RAW_MODULES,
  createMountedComponentHarness,
} from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');

const OPTIONS = [
  { id: 'ingot', label: 'Iron Ingot' },
  { id: 'coal', label: 'Coal' },
];

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-picker-trigger-form-',
  rawModules: SEARCHABLE_POPOVER_RAW_MODULES,
  compiledModules: SEARCHABLE_POPOVER_COMPILED_MODULES,
  componentPath: 'src/ui/svelte/components/SearchablePopover.svelte',
});

const mountPicker = (props) =>
  harness.mount({
    options: OPTIONS,
    triggerLabel: 'Register item',
    triggerAriaLabel: 'Register item',
    dialogAriaLabel: 'Register item',
    searchPlaceholder: 'Search world items…',
    emptyHint: 'Nothing to register',
    onChoose: () => {},
    ...props,
  });

/** The trigger's authored classes, with Svelte's per-component scope hash removed. */
function triggerClasses() {
  const trigger = harness.target.querySelector('button');
  assert.ok(Boolean(trigger), 'the picker renders a trigger');
  return [...trigger.classList].filter((name) => !name.startsWith('svelte-'));
}

describe('1371 SearchablePopover — the ManagerButton trigger form', () => {
  before(harness.setup);
  after(harness.teardown);

  it('renders a BARE button by default, carrying only the caller`s own class', async () => {
    await mountPicker({ triggerClass: 'manager-travel-picker-trigger' });
    assert.deepEqual(
      triggerClasses(),
      ['manager-travel-picker-trigger'],
      'every shipped consumer passes no `triggerButton`, so none of them may gain a primitive ' +
        'class: one extra token here repaints nineteen surfaces at once'
    );
    harness.remount();
  });

  it('renders the real ManagerButton when asked, appending the caller`s class', async () => {
    await mountPicker({
      triggerButton: { size: '38' },
      triggerClass: 'manager-world-component-register-action',
    });
    assert.deepEqual(
      triggerClasses(),
      [
        'fabricate-button',
        'manager-button',
        'fab-manager-button',
        'is-size-38',
        'manager-world-component-register-action',
      ],
      '`triggerClass` reaches `ManagerButton`s `class` prop, which APPENDS — a caller class ' +
        'that REPLACED the primitive`s own would unstyle the button while every data-* ' +
        'selector kept resolving'
    );
    harness.remount();
  });

  it('takes the role and the full-width flag from the same object', async () => {
    await mountPicker({ triggerButton: { role: 'danger', fullWidth: true } });
    assert.deepEqual(triggerClasses(), [
      'fabricate-button',
      'manager-button',
      'fab-manager-button',
      'is-danger',
      'is-full-width',
    ]);
    harness.remount();
  });

  it('drops an unrecognised role and rung rather than emitting a dead class', async () => {
    // The primitive's own closed-set contract, read through this form.
    await mountPicker({ triggerButton: { role: 'lavender', size: '37' } });
    assert.deepEqual(triggerClasses(), ['fabricate-button', 'manager-button', 'fab-manager-button']);
    harness.remount();
  });

  it('hands the popover`s OWN contract through, rather than replacing it', async () => {
    await mountPicker({
      triggerButton: { size: '38' },
      triggerData: { 'data-scoped-list-register-item': '' },
      triggerTitle: 'Register an Item',
    });
    const trigger = harness.target.querySelector('button');
    assert.equal(trigger.getAttribute('type'), 'button', 'never a form submit');
    assert.equal(trigger.getAttribute('aria-haspopup'), 'dialog');
    assert.equal(trigger.getAttribute('aria-label'), 'Register item');
    assert.equal(trigger.getAttribute('title'), 'Register an Item');
    assert.ok(
      trigger.hasAttribute('data-scoped-list-register-item'),
      '`triggerData` still lands on the control itself, not on a wrapper around it'
    );
    harness.remount();
  });

  it('opens and closes the panel from the primitive, and reports it in ARIA', async () => {
    // The clause that stops every clause above from passing on a button that no longer opens
    // anything: `onclick` and `aria-expanded` arrive through the spread as PROPS on a component
    // rather than as attributes on an element, which is the one thing this composition changes.
    await mountPicker({ triggerButton: { size: '38' } });
    const trigger = harness.target.querySelector('button');
    assert.equal(trigger.getAttribute('aria-expanded'), 'false');

    trigger.click();
    flushSync();
    assert.equal(trigger.getAttribute('aria-expanded'), 'true');
    assert.ok(
      Boolean(harness.target.querySelector('.fabricate-picker-popover')),
      'the panel is rendered, so the trigger is really driving this component`s state'
    );

    trigger.click();
    flushSync();
    assert.equal(trigger.getAttribute('aria-expanded'), 'false');
    assert.ok(
      !harness.target.querySelector('.fabricate-picker-popover'),
      'and the second press closes it'
    );
    harness.remount();
  });

  it('refuses to open while `disabled`, exactly as the bare button does', async () => {
    await mountPicker({ triggerButton: { size: '38' }, disabled: true });
    const trigger = harness.target.querySelector('button');
    assert.ok(trigger.disabled, '`disabled` is a NAMED prop on the primitive, so the spread ' +
      'has to reach it as one rather than landing in the rest attributes');
    trigger.click();
    flushSync();
    assert.ok(!harness.target.querySelector('.fabricate-picker-popover'));
    harness.remount();
  });

  it('leaves `triggerChip` in charge where a call site asks for both', async () => {
    // The forms are branches of one `{#if}`.
    await mountPicker({ triggerChip: true, triggerButton: { size: '38' }, triggerClass: 'is-dashed' });
    assert.deepEqual(triggerClasses(), ['manager-chip', 'is-dashed']);
    harness.remount();
  });

  it('BINDS the primitive`s node, which is what lets the panel anchor on the button', () => {
    // Stated at the SOURCE, and the reason is worth keeping because two obvious mounted
    // assertions both prove nothing here.
    const popover = readFileSync(
      resolve(repoRoot, 'src/ui/svelte/components/SearchablePopover.svelte'),
      'utf8'
    );
    const button = readFileSync(
      resolve(repoRoot, 'src/ui/svelte/components/ManagerButton.svelte'),
      'utf8'
    );
    assert.match(
      popover,
      /<ManagerButton\s+bind:element=\{triggerElement\}/,
      'the ManagerButton trigger must bind its node, or the panel anchors on the picker root'
    );
    assert.match(
      popover,
      /trigger: triggerElement \?\? pickerRoot,/,
      'and `anchoredPopover` must be handed THAT state: `triggerButton` is the FORM prop now, ' +
        'so anchoring on it would hand the action an options object or null'
    );
    assert.match(
      button,
      /element = \$bindable\(null\)/,
      '`ManagerButton` must PUBLISH that binding: `bind:this` on a component yields the instance'
    );
    assert.match(
      button,
      /bind:this=\{element\}/,
      'and must write it from the rendered element, or the prop is a name with nothing behind it'
    );
  });

  it('returns focus to the trigger on close, through the primitive`s node', async () => {
    // Weaker than the clause above by design.
    await mountPicker({ triggerButton: { size: '38' } });
    const trigger = harness.target.querySelector('button');
    trigger.click();
    flushSync();
    harness.target
      .querySelector(':scope .fabricate-picker-popover [role="listbox"] button')
      ?.click();
    flushSync();
    await new Promise((done) => setTimeout(done, 0));
    assert.equal(
      harness.target.ownerDocument.activeElement,
      trigger,
      'focus must come back to the control the GM pressed'
    );
    harness.remount();
  });
});
