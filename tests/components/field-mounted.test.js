/** `Field`, the manager's labelled `.fabricate-field` column, RENDERED (issue 1428). */
import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { createRawSnippet } from '../../node_modules/svelte/src/index-client.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';
import {
  FOUNDRY_BRIDGE_RAW_MODULES,
  LOCALIZE_OR_RAW_MODULES,
} from '../helpers/foundryBridgeModules.js';

const repoRoot = resolve(import.meta.dirname, '../..');

const vocabularyHarness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-field-vocabulary-',
  rawModules: [
    ...FOUNDRY_BRIDGE_RAW_MODULES,
    'src/ui/svelte/util/essenceIcons.js',
    'src/ui/svelte/util/foundryIconCatalogue.js',
    'src/ui/svelte/util/foundryIconCatalogue.json',
    'src/ui/svelte/util/foundryIconVocabulary.js',
    'src/ui/svelte/util/iconPickerPopover.js',
    'src/ui/svelte/util/listboxNavigation.js',
    'src/ui/svelte/util/pickerOptionModel.js',
    'src/ui/svelte/util/appLocalizer.js',
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
    'src/ui/svelte/components/EmptyState.svelte',
    'src/ui/svelte/components/SearchablePopover.svelte',
    'src/ui/svelte/components/SearchablePopoverPanel.svelte',
    'src/ui/svelte/components/Button.svelte',
    'src/ui/svelte/apps/manager/InlineVocabularyAdd.svelte',
  ],
  componentPath: 'src/ui/svelte/apps/manager/InlineVocabularyAdd.svelte',
});

const radioHarness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-field-radio-',
  rawModules: [...FOUNDRY_BRIDGE_RAW_MODULES, ...LOCALIZE_OR_RAW_MODULES],
  compiledModules: [
    'src/ui/svelte/components/Field.svelte',
    'src/ui/svelte/components/RadioCardGroup.svelte',
    'src/ui/svelte/components/Medallion.svelte',
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
const RADIO_CLASS =
  'fabricate-field fabricate-option-cards is-wide manager-resolution-mode-card manager-radio-card-group';

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
      value: 'simple',
      'data-radio-card-group': 'field-mounted',
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
      value: 'simple',
      'data-radio-card-group': 'field-mounted',
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

    const field = input.closest('.fabricate-field');
    assert.ok(Boolean(field), 'the input sits inside a `.fabricate-field`');
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
      iconField.classList.contains('fabricate-field'),
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
      value: 'simple',
      'data-radio-card-group': 'field-mounted',
    });
    const group = root.querySelector('[data-radio-card-group="field-mounted"]');
    assert.ok(Boolean(group), 'the radio card group rendered');
    assert.equal(group.tagName, 'FIELDSET', 'the one fieldset field in the corpus stays one');
    assert.equal(group.getAttribute('class'), RADIO_CLASS);

    const legend = group.firstElementChild;
    assert.ok(Boolean(legend), 'the group has a first child');
    assert.equal(
      legend.tagName,
      'LEGEND',
      'a <legend> is only valid as a fieldset`s first child, and it is what names the group'
    );
  });

  it('forwards `disabled` to the fieldset as a real boolean attribute', async () => {
    // `disabled` is the third reason this field is a fieldset.
    const props = {
      legend: 'Resolution',
      groupName: 'field-mounted-radio',
      options: [...RADIO_OPTIONS],
      value: 'simple',
      'data-radio-card-group': 'field-mounted',
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

describe('RadioCardGroup names each radio by its title and describes it by what renders (issue 2467)', () => {
  const body = createRawSnippet((option) => ({
    render: () => `<span class="probe-body">${option().value}</span>`,
  }));
  const OPTIONS = Object.freeze([
    { value: 'open', label: 'Open', description: 'Anyone may choose it.' },
    { value: 'later', label: 'Later', description: 'Not yet.' },
    { value: 'bare', label: 'Bare' },
  ]);
  const mountGroup = (props = {}) =>
    radioHarness.mount({
      legend: 'Mode',
      groupName: 'field-mounted-naming',
      options: OPTIONS.map((option) => ({ ...option })),
      value: 'open',
      'data-radio-card-group': 'naming',
      ...props,
    });
  const cardOf = (root, value) => root.querySelector(`[data-radio-card-option="${value}"]`);
  const radioOf = (root, value) => cardOf(root, value).querySelector('input[type="radio"]');
  const byId = (id) => document.querySelector(`[id="${id}"]`);
  const describedIds = (radio) => {
    const ids = (radio.getAttribute('aria-describedby') ?? '').split(' ').filter(Boolean);
    for (const id of ids)
      assert.ok(byId(id), `aria-describedby lists ${id}, which resolves to nothing`);
    return ids;
  };

  it('labels every radio by its own title element', async () => {
    const root = await mountGroup();
    for (const { value } of OPTIONS) {
      const radio = radioOf(root, value);
      const title = byId(radio.getAttribute('aria-labelledby'));
      assert.ok(
        Boolean(title) && title === cardOf(root, value).querySelector('[data-tool-choice-title]'),
        `the ${value} radio's aria-labelledby must resolve to its card's title`
      );
    }
  });

  it('describes a radio by its description, reason and body, and by no id that is absent', async () => {
    const root = await mountGroup({
      optionBody: body,
      disabledOptions: [{ value: 'later', reason: 'Coming soon' }],
    });
    const card = cardOf(root, 'later');
    const parts = [
      '[data-tool-choice-description]',
      '[data-radio-card-reason]',
      '.manager-resolution-option-body',
    ].map((selector) => card.querySelector(selector));
    const ids = describedIds(radioOf(root, 'later'));
    assert.equal(ids.length, 3, 'the description, the reason and the body');
    for (const [index, id] of ids.entries()) {
      assert.ok(
        Boolean(parts[index]) && byId(id) === parts[index],
        `aria-describedby id ${id} must resolve to the card's own part ${index}`
      );
    }
    assert.equal(parts[1].textContent, 'Coming soon');
    assert.equal(
      describedIds(radioOf(root, 'bare')).length,
      1,
      'a bare option is described by its body alone'
    );
  });

  it('omits aria-describedby when no description, reason or body renders', async () => {
    const root = await mountGroup();
    assert.ok(!radioOf(root, 'bare').hasAttribute('aria-describedby'));
    assert.equal(describedIds(radioOf(root, 'open')).length, 1, 'a described option keeps its id');
  });

  it('disables a named option for real and ignores an entry that names none', async () => {
    const root = await mountGroup({
      disabledOptions: [
        { value: 'later', reason: 'Coming soon' },
        { value: 'missing', reason: 'Names nothing' },
      ],
    });
    assert.deepEqual(
      OPTIONS.map(({ value }) => [
        radioOf(root, value).disabled,
        cardOf(root, value).classList.contains('is-disabled'),
      ]),
      [
        [false, false],
        [true, true],
        [false, false],
      ]
    );
    assert.equal(
      root.querySelectorAll('[data-radio-card-reason]').length,
      1,
      'the stray entry draws no reason'
    );
    assert.ok(!root.textContent.includes('Names nothing'));
  });

  it('disables an option whose reason is empty but draws no reason and describes by none', async () => {
    const root = await mountGroup({ disabledOptions: [{ value: 'later', reason: '' }] });
    const radio = radioOf(root, 'later');
    assert.ok(radio.disabled, 'an empty reason still disables its option');
    assert.ok(!root.querySelector('[data-radio-card-reason]'), 'and draws no reason element');
    assert.equal(describedIds(radio).length, 1, 'its description is the only id described');
  });

  it('keeps the first non-empty reason for a value and lets a later empty one disable only', async () => {
    const root = await mountGroup({
      disabledOptions: [
        { value: 'later', reason: 'Early reason' },
        { value: 'later', reason: '' },
        { value: 'open', reason: '' },
        { value: 'open', reason: 'Late reason' },
      ],
    });
    assert.deepEqual(
      [...root.querySelectorAll('[data-radio-card-reason]')].map((node) => node.textContent),
      ['Late reason', 'Early reason'],
      'a later empty reason does not erase an earlier one, and a later one fills an empty one'
    );
    assert.ok(radioOf(root, 'later').disabled && radioOf(root, 'open').disabled);
    assert.equal(describedIds(radioOf(root, 'later')).length, 2, 'the description and the reason');
  });

  it('never calls onChange for a change dispatched on a disabled radio', async () => {
    const calls = [];
    const onChange = (next) => {
      calls.push(next);
    };
    const root = await mountGroup({
      onChange,
      disabledOptions: [{ value: 'later', reason: 'Soon' }],
    });
    radioOf(root, 'later').dispatchEvent(new Event('change', { bubbles: true }));
    radioOf(root, 'bare').dispatchEvent(new Event('change', { bubbles: true }));
    assert.deepEqual(calls, ['bare'], 'only the enabled radio reports its value');

    radioHarness.remount();
    const off = await mountGroup({ onChange, disabled: true });
    radioOf(off, 'bare').dispatchEvent(new Event('change', { bubbles: true }));
    assert.deepEqual(calls, ['bare'], 'a disabled group reports nothing');
  });

  it('checks the previous radio again when a synchronous onChange throws', async () => {
    const failure = new Error('the caller failed');
    const root = await mountGroup({
      onChange: () => {
        throw failure;
      },
    });
    const radio = radioOf(root, 'later');
    radio.checked = true;
    const thrown = [];
    const onError = (event) => {
      thrown.push(event.error);
      event.preventDefault();
    };
    const view = root.ownerDocument.defaultView;
    view.addEventListener('error', onError);
    try {
      radio.dispatchEvent(new Event('change', { bubbles: true }));
    } catch (error) {
      thrown.push(error);
    } finally {
      view.removeEventListener('error', onError);
    }
    assert.deepEqual(thrown, [failure], 'the throw is not swallowed');
    assert.deepEqual(
      OPTIONS.map(({ value }) => radioOf(root, value).checked),
      [true, false, false],
      'the radio `value` names is checked again, and the pressed one is not'
    );
  });
});
