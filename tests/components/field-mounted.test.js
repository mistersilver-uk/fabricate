/**
 * `Field`, the manager's labelled `.manager-field` column, RENDERED (issue 1428).
 *
 * ── WHAT ONLY A RENDER CAN ANSWER ───────────────────────────────────────────────────────
 * The conversion of 81 sites was verified by comparing the parsed template of every changed
 * component against its pre-change self, with each `<Field as="x">` read back as the
 * `<x class="manager-field …">` it stands for. That proves the sites kept their hosts. It does
 * NOT prove the thing the whole `as` prop exists for: that the primitive actually emits the
 * element it was asked for, and that a `<label>` field still WRAPS its control — which is what
 * gives that control its accessible name, on 49 sites where no `id`/`for`/`aria-label` pair
 * would supply one.
 *
 * That claim is exactly the one a markup-level check can be true about and wrong about at the
 * same time, so it is asserted against a real DOM here, through real callers rather than a
 * synthesised fixture.
 *
 * ── THE TWO CALLERS, AND WHY THESE TWO ──────────────────────────────────────────────────
 * `InlineVocabularyAdd` renders BOTH contrasting hosts in one component, and its own source
 * already states the rule: the text field is a `<label>` wrapping its `<input>`, and the icon
 * field is a `<div>` because the control inside it is a BUTTON — not a labelable element — so a
 * wrapping label would name nothing. Flattening one into the other is invisible on screen and
 * changes what a screen reader says, which is the regression this suite exists to catch.
 *
 * `RadioCardGroup` is the corpus's ONE `<fieldset>` field, and it is a fieldset for three
 * reasons a `<div>` cannot reproduce: it renders a `<legend>`, it holds a radio group, and it
 * forwards `disabled`, which on a fieldset disables every descendant control. The last of those
 * is asserted here because it is BEHAVIOUR rather than markup — a `<div disabled>` parses fine,
 * renders fine, and leaves every radio in the group live.
 *
 * It is also the one file in the sweep whose template is not byte-equivalent to its pre-change
 * self: `class:is-config-cards={configCards}` cannot ride on a component, so it was folded into
 * the class expression. The class-string assertions below are the proof that the fold is
 * equivalent, for both values of the flag, against the exact string the `<fieldset>` carried
 * before — including the token ORDER, since `manager-field` used to be written first and is now
 * prepended by the primitive.
 */
import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');

const vocabularyHarness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-field-vocabulary-',
  rawModules: [
    'src/ui/svelte/util/foundryBridge.js',
    'src/ui/svelte/util/essenceIcons.js',
    'src/ui/svelte/util/foundryIconCatalogue.js',
    'src/ui/svelte/util/foundryIconVocabulary.js',
    'src/ui/svelte/util/iconPickerPopover.js',
    'src/ui/svelte/util/overlayHost.js',
    'src/ui/svelte/actions/dismissOnOutsideClick.js',
    'src/ui/svelte/actions/portal.js',
  ],
  compiledModules: [
    'src/ui/svelte/components/Field.svelte',
    'src/ui/svelte/components/IconPicker.svelte',
    'src/ui/svelte/components/ManagerButton.svelte',
    'src/ui/svelte/apps/manager/InlineVocabularyAdd.svelte',
  ],
  componentPath: 'src/ui/svelte/apps/manager/InlineVocabularyAdd.svelte',
});

const radioHarness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-field-radio-',
  rawModules: ['src/ui/svelte/util/foundryBridge.js'],
  compiledModules: [
    'src/ui/svelte/components/Field.svelte',
    'src/ui/svelte/apps/manager/RadioCardGroup.svelte',
  ],
  componentPath: 'src/ui/svelte/apps/manager/RadioCardGroup.svelte',
});

const VOCABULARY_PROPS = Object.freeze({
  inputId: 'field-mounted-vocabulary',
  inputLabel: 'Category',
  addLabel: 'Add',
  showIcon: true,
  iconLabel: 'Icon',
});

const RADIO_OPTIONS = Object.freeze([
  Object.freeze({ value: 'simple', label: 'Simple', description: 'One set.' }),
  Object.freeze({ value: 'routed', label: 'Routed', description: 'Several sets.' }),
]);

/**
 * The exact class string the `<fieldset>` carried before the conversion, in source order.
 *
 * `manager-field` first because that is where the hand-written attribute put it, and
 * `is-config-cards` last because it arrived through a `class:` directive, which Svelte appends
 * after the static attribute. The primitive PREPENDS `manager-field` to whatever the caller
 * passes, so the order survives — and this constant is what says so out loud.
 */
const RADIO_CLASS_CONFIG_CARDS =
  'manager-field is-wide manager-resolution-mode-card manager-radio-card-group is-config-cards';
const RADIO_CLASS_PLAIN =
  'manager-field is-wide manager-resolution-mode-card manager-radio-card-group';

before(async () => {
  await vocabularyHarness.setup();
  await radioHarness.setup();
});
after(() => {
  vocabularyHarness.teardown();
  radioHarness.teardown();
});
afterEach(() => {
  vocabularyHarness.remount();
  radioHarness.remount();
});

describe('Field (mounted, through its real callers)', () => {
  it('renders a <label> that WRAPS its control, so the control is named by the field', async () => {
    const root = await vocabularyHarness.mount({ ...VOCABULARY_PROPS });
    const input = root.querySelector('#field-mounted-vocabulary');
    assert.ok(Boolean(input), 'the vocabulary text input rendered');

    const field = input.closest('.manager-field');
    assert.ok(Boolean(field), 'the input sits inside a `.manager-field`');
    assert.equal(
      field.tagName,
      'LABEL',
      'a `<Field as="label">` must emit a real <label>. A <div> here renders identically and ' +
        'silently strips the accessible name from the control it contains.'
    );
    // The association itself, not merely the tag: a <label> names a control it CONTAINS, and
    // this field carries no visible text of its own beyond the caption span.
    assert.equal(
      field.querySelector('input'),
      input,
      'the <label> must contain the input it names'
    );
    assert.equal(field.getAttribute('for'), 'field-mounted-vocabulary', '`for` is forwarded');
  });

  it('renders a <div> host as a <div>, and never wraps a non-labelable control in a label', async () => {
    const root = await vocabularyHarness.mount({ ...VOCABULARY_PROPS });
    const iconField = root.querySelector('[data-vocabulary-add-icon]');
    assert.ok(Boolean(iconField), 'the icon field rendered');
    assert.equal(
      iconField.tagName,
      'DIV',
      'the icon field holds a BUTTON, which is not a labelable element, so a <label> here ' +
        'would announce a name that reaches nothing'
    );
    assert.ok(
      iconField.classList.contains('manager-field'),
      'the primitive class is emitted whatever the host'
    );
    assert.ok(
      iconField.classList.contains('manager-vocabulary-icon-field'),
      'the caller`s class is APPENDED to the primitive`s, never a replacement for it'
    );
    const trigger = iconField.querySelector('button');
    assert.ok(Boolean(trigger), 'the icon picker trigger rendered');
    assert.ok(!trigger.closest('label'), 'no ancestor <label> claims to name the trigger');
  });

  it('renders the fieldset host, with its legend and its exact pre-conversion classes', async () => {
    const root = await radioHarness.mount({
      legend: 'Resolution',
      groupName: 'field-mounted-radio',
      options: [...RADIO_OPTIONS],
      selectedValue: 'simple',
      dataGroup: 'field-mounted',
    });
    const group = root.querySelector('[data-radio-card-group="field-mounted"]');
    assert.ok(Boolean(group), 'the radio card group rendered');
    assert.equal(group.tagName, 'FIELDSET', 'the one fieldset field in the corpus stays one');
    assert.equal(group.getAttribute('class'), RADIO_CLASS_CONFIG_CARDS);

    const legend = group.firstElementChild;
    assert.ok(Boolean(legend), 'the group has a first child');
    assert.equal(
      legend.tagName,
      'LEGEND',
      'a <legend> is only valid as a fieldset`s first child, and it is what names the group'
    );
  });

  it('folds the config-cards flag into the class string without changing it', async () => {
    // The `class:` directive this replaced emitted the token only when the flag was true, so
    // both states are asserted: an unconditional token would pass a true-only check.
    const root = await radioHarness.mount({
      legend: 'Resolution',
      groupName: 'field-mounted-radio',
      options: [...RADIO_OPTIONS],
      selectedValue: 'simple',
      dataGroup: 'field-mounted',
      configCards: false,
    });
    const group = root.querySelector('[data-radio-card-group="field-mounted"]');
    assert.equal(group.getAttribute('class'), RADIO_CLASS_PLAIN);
  });

  it('forwards `disabled` to the fieldset as a real boolean attribute', async () => {
    // `disabled` is the third reason this field is a fieldset, and it survives the rest spread
    // in BOOLEAN form rather than as the string `"true"` a `data-*` key would get: Svelte's
    // `set_attribute` knows `disabled` on a fieldset is a boolean attribute, so it writes `""`
    // when set and removes it when clear. Both states are asserted, because "always present"
    // and "correctly present" are the same assertion at one value.
    //
    // What is deliberately NOT asserted is that the browser then disables the descendants.
    // happy-dom does not implement fieldset disabled propagation, and `RadioCardGroup` sets
    // `disabled` on each `<input>` itself — so an assertion on `radio.disabled` would pass
    // with a `<div>` host and prove nothing about the fieldset. The host and the attribute
    // form are what a mounted test can honestly answer for.
    const props = {
      legend: 'Resolution',
      groupName: 'field-mounted-radio',
      options: [...RADIO_OPTIONS],
      selectedValue: 'simple',
      dataGroup: 'field-mounted',
    };
    const on = await radioHarness.mount({ ...props, disabled: true });
    const disabledGroup = on.querySelector('[data-radio-card-group="field-mounted"]');
    assert.equal(disabledGroup.tagName, 'FIELDSET');
    assert.equal(
      disabledGroup.getAttribute('disabled'),
      '',
      '`disabled` must arrive as the boolean attribute a fieldset acts on, not as `"true"`'
    );

    radioHarness.remount();
    const off = await radioHarness.mount({ ...props, disabled: false });
    const liveGroup = off.querySelector('[data-radio-card-group="field-mounted"]');
    assert.ok(
      !liveGroup.hasAttribute('disabled'),
      'a cleared `disabled` must be REMOVED. Any value at all — including "false" — disables a ' +
        'fieldset and every control inside it.'
    );
  });
});
