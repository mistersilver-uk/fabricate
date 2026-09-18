/** `Field`, the manager's labelled `.manager-field` column, RENDERED (issue 1428). */
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
    'src/ui/svelte/util/listboxNavigation.js',
    'src/ui/svelte/util/overlayHost.js',
    'src/ui/svelte/actions/dismissOnOutsideClick.js',
    'src/ui/svelte/actions/portal.js',
    'src/ui/svelte/actions/anchoredPopover.js',
    'src/ui/svelte/util/overlayBounds.js',
  ],
  compiledModules: [
    'src/ui/svelte/components/Field.svelte',
    'src/ui/svelte/components/IconPicker.svelte',
    'src/ui/svelte/components/Chip.svelte',
    'src/ui/svelte/apps/manager/EmptyState.svelte',
    'src/ui/svelte/components/SearchablePopover.svelte',
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
    'src/ui/svelte/components/RadioCardGroup.svelte',
  ],
  componentPath: 'src/ui/svelte/components/RadioCardGroup.svelte',
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

/** The exact class string the `<fieldset>` carries, in source order. */
const RADIO_CLASS_CONFIG_CARDS =
  'fabricate-field manager-field fabricate-option-cards is-wide manager-resolution-mode-card manager-radio-card-group is-config-cards';
const RADIO_CLASS_PLAIN =
  'fabricate-field manager-field fabricate-option-cards is-wide manager-resolution-mode-card manager-radio-card-group';

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

describe('RadioCardGroup emits the namespace root its rules are anchored on (issue 1509)', () => {
  /* THE ONE ASSERTION IN THIS REPOSITORY THAT READS THE RADIO CARD'S RENDERED ROOT. */
  it('writes `fabricate-option-cards` on the fieldset `Field` renders for it', async () => {
    const root = await radioHarness.mount({
      legend: 'Resolution',
      groupName: 'field-mounted-radio',
      options: [...RADIO_OPTIONS],
      selectedValue: 'simple',
      dataGroup: 'field-mounted',
    });
    const group = root.querySelector('[data-radio-card-group="field-mounted"]');
    assert.ok(Boolean(group), 'the radio card group must render at all');
    assert.equal(group.tagName, 'FIELDSET');
    assert.ok(
      group.classList.contains('fabricate-option-cards'),
      'the fieldset must carry this family`s namespace root: every re-rooted rule in ' +
        '`styles/fabricate.css` names it as the leading compound, so a `Field` that stopped ' +
        'forwarding its `class` prop would leave the whole family matching nothing while every ' +
        'source-text reader in this repository stayed green'
    );
    assert.ok(
      group.classList.contains('fabricate-field'),
      'and `Field`s own root beside it: this one element is the root of BOTH families, which is ' +
        'why the option-card family declares no font floor of its own'
    );
  });

  it('writes the root on the FIELDSET and not on an option row inside it', async () => {
    // WHICH ELEMENT carries it, not merely that some element does. Every rule in the sheet roots
    // at this class as an ANCESTOR of the rows, so a root on a row would match nothing the row
    // contains while still reading as present to a `querySelector`.
    const root = await radioHarness.mount({
      legend: 'Resolution',
      groupName: 'field-mounted-radio',
      options: [...RADIO_OPTIONS],
      selectedValue: 'simple',
      dataGroup: 'field-mounted',
    });
    const row = root.querySelector('.manager-resolution-option');
    assert.ok(Boolean(row), 'an option row must render, or this assertion has no subject');
    assert.ok(
      !row.classList.contains('fabricate-option-cards'),
      'an option row carries the family root, which belongs on the fieldset above it'
    );
    assert.ok(
      Boolean(row.closest('.fabricate-option-cards')),
      'and the row must sit UNDER the root, which is the relationship the sheet encodes'
    );
  });
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
    // The association itself, not merely the tag: a <label> names a control it CONTAINS.
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
    // The `class:` directive this replaced emitted the token only when the flag was true.
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
    // `disabled` is the third reason this field is a fieldset.
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
