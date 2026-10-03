/**
 * `PickerRow` over the matrix of authoring surfaces and kinds (issue 1516). The matrix is derived
 * from `SURFACES`, the offered-kind table; a reachable cell acts on the row and reads both the
 * forwarded `onChange` arguments and the DOM, and an unreachable one is asserted absent.
 */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, afterEach, before, describe, it } from 'node:test';

import { createRawSnippet } from 'svelte';

import {
  KIND_ORDER,
  fromValue,
  toValue,
} from '../../src/ui/svelte/apps/manager/recipe/pickerRowKinds.js';
import { LOCALIZE_OR_RAW_MODULES } from '../helpers/foundryBridgeModules.js';
import {
  chooseSelectOption,
  selectOptionValues,
  selectTriggerText,
} from '../helpers/select-control.js';
import {
  createMountedComponentHarness,
  SEARCHABLE_POPOVER_RAW_MODULES,
  SELECT_COMPILED_MODULES,
  TYPEAHEAD_RUNE_MODULES,
} from '../helpers/svelte-component-harness.js';

const harness = createMountedComponentHarness({
  repoRoot: resolve(import.meta.dirname, '../..'),
  tmpPrefix: 'fabricate-picker-row-',
  rawModules: [
    ...SEARCHABLE_POPOVER_RAW_MODULES,
    ...LOCALIZE_OR_RAW_MODULES,
    'src/ui/svelte/apps/manager/recipe/pickerRowKinds.js',
    // The roll-expression field's display helpers, and what they import.
    'src/systems/characterModifierPrerequisiteCopy.js',
    'src/systems/characterPrerequisites.js',
    'src/utils/scalars.js',
  ],
  runeModules: TYPEAHEAD_RUNE_MODULES,
  compiledModules: [
    ...SELECT_COMPILED_MODULES,
    'src/ui/svelte/components/SegmentedControl.svelte',
    'src/ui/svelte/components/Stepper.svelte',
    'src/ui/svelte/apps/manager/RollDataExpressionInput.svelte',
    'src/ui/svelte/apps/manager/recipe/PickerRowAmount.svelte',
    'src/ui/svelte/apps/manager/recipe/PickerRow.svelte',
  ],
  componentPath: 'src/ui/svelte/apps/manager/recipe/PickerRow.svelte',
});

/**
 * What each authoring surface passes the row. Recipe ingredients and tool repair offer every kind
 * and the convert control; the three result surfaces offer `component` alone and a rolled amount;
 * a progressive stage draws neither an amount nor a remove, and puts its own controls in `trailing`.
 */
const SURFACES = Object.freeze({
  'recipe ingredient': { kinds: [...KIND_ORDER], convert: true },
  'tool repair': { kinds: [...KIND_ORDER], convert: true },
  'recipe result': { kinds: ['component'], rollable: true },
  'gathering task result': { kinds: ['component'], rollable: true },
  'salvage result': { kinds: ['component'], rollable: true },
  'progressive stage': { kinds: ['component'], amount: false, removable: false, trailing: true },
});

/** Every surface against every kind, split by whether the surface offers the kind. */
const CELLS = Object.entries(SURFACES).flatMap(([surface, config]) =>
  KIND_ORDER.map((kind) => ({ surface, kind, config, reachable: config.kinds.includes(kind) }))
);
const REACHABLE = CELLS.filter((cell) => cell.reachable);
const UNREACHABLE = CELLS.filter((cell) => !cell.reachable);

const CATALOGUE = Object.freeze({
  component: [
    { id: 'c-iron', label: 'Iron ingot', icon: 'fas fa-cube', img: 'icons/iron.webp' },
    { id: 'c-coal', label: 'Coal', icon: 'fas fa-cube' },
  ],
  tags: [
    { id: 'herb', label: 'herb', icon: 'fas fa-tag' },
    { id: 'rare', label: 'rare', icon: 'fas fa-tag' },
  ],
  essence: [
    { id: 'e-fire', label: 'Fire', icon: 'fas fa-fire', offered: true },
    { id: 'e-life', label: 'Life', icon: 'fas fa-flask-vial', offered: false },
  ],
  currency: [{ id: 'gp', label: 'Gold', icon: 'fa-solid fa-coins' }],
});
const EMPTY_CATALOGUE = Object.freeze({ component: [], tags: [], essence: [], currency: [] });

/** The suggestion each kind's cell chooses, and the search that finds it. */
const PICK = Object.freeze({
  component: { id: 'c-coal', label: 'Coal', query: 'coa' },
  essence: { id: 'e-fire', label: 'Fire', query: 'fir' },
  currency: { id: 'gp', label: 'Gold', query: 'gol' },
});
const AMOUNT_HOOK = Object.freeze({
  component: 'data-recipe-option-quantity',
  tags: 'data-recipe-option-quantity',
  essence: 'data-recipe-essence-amount',
  currency: 'data-recipe-currency-amount',
});

const TOGGLE = '[data-recipe-option-amount-mode]';
const FORMULA = '[data-recipe-option-formula]';
const KIND_TRIGGER = '.fabricate-select-trigger[data-recipe-option-kind]';

const unnamed = (kind) => ({ kind, id: '', tags: [], tagMatch: 'any', quantity: 1 });
const snippet = (html) => createRawSnippet(() => ({ render: () => html }));
const CONVERT = snippet('<button type="button" data-test-convert>or…</button>');
const TRAILING = snippet('<span data-test-trailing>DC 12</span>');

const settle = () => new Promise((done) => setTimeout(done, 0));

/** Mount the row as `surface` would, controlled: every `onChange` is recorded and applied. */
async function mountRow(config, value, extra = {}) {
  const changes = [];
  const removes = [];
  const target = await harness.mount({
    value,
    kinds: config.kinds,
    catalogue: CATALOGUE,
    rollable: config.rollable === true,
    amount: config.amount === false ? false : {},
    removable: config.removable !== false,
    convert: config.convert ? CONVERT : null,
    trailing: config.trailing ? TRAILING : null,
    onChange: (...args) => {
      changes.push(args);
    },
    onRemove: (...args) => {
      removes.push(args);
    },
    ...extra,
  });
  /** The one value the row forwarded since the last call, applied back as its `value` prop. */
  async function applied(label) {
    assert.equal(
      changes.length,
      1,
      `${label}: expected exactly one onChange, saw ${changes.length}`
    );
    const [args] = changes;
    changes.length = 0;
    assert.equal(args.length, 1, `${label}: onChange takes the next value and nothing else`);
    await harness.setProps({ value: args[0] });
    return args[0];
  }
  return { target, changes, removes, applied };
}

async function type(field, text) {
  field.focus();
  field.value = text;
  field.dispatchEvent(new globalThis.window.Event('input', { bubbles: true }));
  await settle();
}

async function click(node) {
  node.click();
  await settle();
}

const radio = (target, mode) =>
  target.querySelector(`[data-recipe-option-amount-mode="${mode}"] input`);
const tagMatchRadio = (target, mode) =>
  target.querySelector(`[data-recipe-tag-match="${mode}"]`).querySelector('input');

before(() => harness.setup());
after(() => harness.teardown());
afterEach(() => harness.remount());

describe('PickerRow: the matrix is the offered-kind table', () => {
  it('derives a cell for every surface and kind, and both populations are non-empty', () => {
    assert.equal(CELLS.length, Object.keys(SURFACES).length * KIND_ORDER.length);
    assert.equal(REACHABLE.length, 12, 'two surfaces of four kinds and four of one');
    assert.equal(UNREACHABLE.length, 12, 'three kinds on each of the four result surfaces');
    assert.ok(
      UNREACHABLE.every((cell) => cell.kind !== 'component'),
      'component is offered on every surface'
    );
  });
});

describe('PickerRow: unreachable cells are absent', () => {
  for (const { surface, kind, config } of UNREACHABLE) {
    it(`${surface} × ${kind}: a stored row of that kind draws no amount toggle`, async () => {
      // The row lists its own kind always, so a stored row is the only way into this cell.
      const { target } = await mountRow(config, unnamed(kind), { rollable: true });
      assert.ok(!target.querySelector(TOGGLE), 'only a component row has a formula to roll');
      assert.ok(!target.querySelector(FORMULA), 'so it draws no expression field either');
    });
  }

  for (const [surface, config] of Object.entries(SURFACES)) {
    it(`${surface}: the kind select offers the surface’s kinds and no other`, async () => {
      const { target } = await mountRow(config, unnamed('component'));
      assert.deepEqual(selectOptionValues(target, KIND_TRIGGER), config.kinds);
    });

    it(`${surface}: toggle, convert, amount and remove are drawn only where the table says`, async () => {
      for (const kind of config.kinds) {
        const { target } = await mountRow(config, unnamed(kind));
        const rollable = config.rollable === true && kind === 'component';
        assert.equal(Boolean(target.querySelector(TOGGLE)), rollable, `${kind}: toggle`);
        assert.equal(
          Boolean(target.querySelector('[data-test-convert]')),
          config.convert === true,
          `${kind}: convert`
        );
        assert.equal(
          Boolean(target.querySelector('.manager-recipe-option-divider')),
          config.convert === true,
          `${kind}: the divider belongs to the convert control`
        );
        assert.equal(
          Boolean(target.querySelector('[data-stepper-input]')),
          config.amount !== false,
          `${kind}: amount`
        );
        assert.equal(
          Boolean(target.querySelector('[data-recipe-remove="alternative"]')),
          config.removable !== false,
          `${kind}: remove`
        );
        assert.equal(
          Boolean(target.querySelector('[data-test-trailing]')),
          config.trailing === true,
          `${kind}: trailing`
        );
        harness.remount();
      }
    });
  }
});

describe('PickerRow: every reachable cell acts', () => {
  for (const { surface, kind, config } of REACHABLE) {
    it(`${surface} × ${kind}: unnamed over an empty catalogue is the zero point`, async () => {
      const { target, changes } = await mountRow(config, unnamed(kind), {
        catalogue: EMPTY_CATALOGUE,
      });
      assert.ok(!target.querySelector('[data-recipe-option-chosen]'), 'nothing is named');
      if (kind === 'tags') {
        assert.equal(target.querySelectorAll('[data-recipe-tag]').length, 0, 'no chips');
        assert.ok(Boolean(target.querySelector('[data-recipe-add-tag]')), 'the adder still draws');
      } else {
        const search = target.querySelector('.manager-recipe-option-search');
        assert.ok(search.hasAttribute('data-recipe-option-empty-catalogue'), 'the degraded face');
        const field = target.querySelector('[data-recipe-option-search]');
        await type(field, 'anything');
        assert.ok(!target.ownerDocument.querySelector('[data-recipe-option-suggestion]'));
      }
      assert.equal(changes.length, 0, 'and looking at it forwards nothing');
    });

    it(`${surface} × ${kind}: choosing forwards the subject and names the row`, async () => {
      const start = unnamed(kind);
      const { target, applied } = await mountRow(config, start);
      if (kind === 'tags') {
        await click(target.querySelector('[data-recipe-add-tag]'));
        const option = [...target.ownerDocument.querySelectorAll('[role="option"]')].find(
          (node) => node.textContent.trim() === 'rare'
        );
        await click(option);
        assert.deepEqual(await applied('add tag'), { ...start, tags: ['rare'] });
        assert.ok(Boolean(target.querySelector('[data-recipe-tag="rare"]')), 'the chip is drawn');
        return;
      }
      const { id, label, query } = PICK[kind];
      await type(target.querySelector('[data-recipe-option-search]'), query);
      await click(target.ownerDocument.querySelector(`[data-recipe-option-suggestion="${id}"]`));
      assert.deepEqual(await applied('choose'), { ...start, id });
      const pill = target.querySelector('[data-recipe-option-chosen]');
      assert.equal(pill.querySelector('.manager-recipe-option-chosen-name').textContent, label);
      assert.ok(!target.querySelector('[data-recipe-option-search]'), 'the search is the pill now');
    });

    if (kind === 'tags') {
      it(`${surface} × ${kind}: a chip’s remove forwards the remaining tags and drops the chip`, async () => {
        const start = { ...unnamed(kind), tags: ['herb', 'rare'] };
        const { target, applied } = await mountRow(config, start);
        const chip = target.querySelector('[data-recipe-tag="herb"]');
        await click(chip.querySelector('[data-recipe-remove="tag"]'));
        assert.deepEqual(await applied('remove tag'), { ...start, tags: ['rare'] });
        assert.deepEqual(
          [...target.querySelectorAll('[data-recipe-tag]')].map((chip) =>
            chip.getAttribute('data-recipe-tag')
          ),
          ['rare']
        );
      });

      it(`${surface} × ${kind}: Any of / All of forwards the policy and rewrites the word`, async () => {
        const start = { ...unnamed(kind), tags: ['herb'] };
        const { target, applied } = await mountRow(config, start);
        const policy = () => target.querySelector('[data-recipe-tag-policy]').textContent;
        assert.equal(policy(), 'Any of');
        await click(tagMatchRadio(target, 'all'));
        assert.deepEqual(await applied('all'), { ...start, tagMatch: 'all' });
        assert.equal(policy(), 'All of');
        assert.ok(tagMatchRadio(target, 'all').checked);
        await click(tagMatchRadio(target, 'any'));
        assert.deepEqual(await applied('any'), start);
        assert.equal(policy(), 'Any of');
      });
    } else {
      it(`${surface} × ${kind}: clear forwards an empty subject and returns the search`, async () => {
        const start = { ...unnamed(kind), id: PICK[kind].id };
        const { target, applied } = await mountRow(config, start);
        assert.ok(
          !target.querySelector('[data-recipe-option-search]'),
          'a named row has no search'
        );
        await click(target.querySelector('[data-recipe-option-clear]'));
        assert.deepEqual(await applied('clear'), { ...start, id: '' });
        assert.ok(!target.querySelector('[data-recipe-option-chosen]'), 'the pill is gone');
        assert.equal(target.querySelector('[data-recipe-option-search]').value, '');
      });
    }

    if (config.amount !== false) {
      it(`${surface} × ${kind}: stepping forwards the amount and redraws it`, async () => {
        const start = unnamed(kind);
        const { target, applied } = await mountRow(config, start);
        const input = () => target.querySelector(`[${AMOUNT_HOOK[kind]}]`);
        assert.equal(input().value, '1');
        await click(target.querySelector('[data-stepper-increment]'));
        assert.deepEqual(await applied('step'), { ...start, quantity: 2 });
        assert.equal(input().value, '2');
      });
    }

    it(`${surface} × ${kind}: remove forwards onRemove exactly where it is drawn`, async () => {
      const { target, removes, changes } = await mountRow(config, unnamed(kind));
      const button = target.querySelector('[data-recipe-remove="alternative"]');
      if (config.removable === false) {
        assert.ok(!button, 'no remove on this surface');
        return;
      }
      await click(button);
      assert.deepEqual(removes, [[]], 'onRemove fired once with no arguments');
      assert.equal(changes.length, 0);
    });
  }

  for (const [surface, config] of Object.entries(SURFACES)) {
    if (config.rollable !== true) continue;

    it(`${surface}: Fixed → Rolled writes the formula alone, and Fixed removes the key`, async () => {
      const stored = { id: 'res-1', componentId: 'c-iron', quantity: 3 };
      const start = toValue(stored);
      const { target, changes, applied } = await mountRow(config, start);
      assert.ok(radio(target, 'fixed').checked, 'a row with no formula starts Fixed');
      assert.ok(Boolean(target.querySelector('[data-stepper-input]')));

      // Opening Rolled swaps the control in place and persists nothing.
      radio(target, 'rolled').checked = true;
      radio(target, 'rolled').dispatchEvent(
        new globalThis.window.Event('change', { bubbles: true })
      );
      await settle();
      assert.equal(changes.length, 0, 'an opened-but-empty Rolled field forwards nothing');
      assert.ok(!target.querySelector('[data-stepper-input]'), 'the stepper left the slot');
      assert.equal(target.querySelector(FORMULA).value, '');
      assert.equal(target.querySelector(FORMULA).placeholder, '1d4+1');

      await type(target.querySelector(FORMULA), '1d4+1');
      const rolled = await applied('type');
      assert.deepEqual(rolled, { ...start, quantityFormula: '1d4+1' });
      assert.equal(rolled.quantity, 3, 'quantity is untouched');
      const written = fromValue(stored, rolled);
      assert.deepEqual(written, { ...stored, quantityFormula: '1d4+1' });
      assert.equal(target.querySelector(FORMULA).value, '1d4+1');
      assert.ok(radio(target, 'rolled').checked);

      radio(target, 'fixed').dispatchEvent(
        new globalThis.window.Event('change', { bubbles: true })
      );
      await settle();
      const fixed = await applied('fixed');
      assert.equal(
        fixed.quantityFormula,
        undefined,
        'Fixed never forwards null or an empty string'
      );
      assert.equal(fixed.quantity, 3);
      const unrolled = fromValue(written, fixed);
      assert.equal(Object.hasOwn(unrolled, 'quantityFormula'), false, 'the stored key is gone');
      assert.deepEqual(unrolled, stored);
      assert.ok(!target.querySelector(FORMULA), 'the expression field left the slot');
      assert.equal(target.querySelector('[data-stepper-input]').value, '3');

      // The typed expression stayed in the row, so switching back restores it.
      radio(target, 'rolled').dispatchEvent(
        new globalThis.window.Event('change', { bubbles: true })
      );
      await settle();
      assert.deepEqual(await applied('restore'), { ...fixed, quantityFormula: '1d4+1' });
      assert.equal(target.querySelector(FORMULA).value, '1d4+1');
    });

    it(`${surface}: a stored formula mounts Rolled and shows no resolved amount`, async () => {
      const start = { ...unnamed('component'), id: 'c-iron', quantity: 3, quantityFormula: '2d6' };
      const { target, applied } = await mountRow(config, start);
      assert.ok(radio(target, 'rolled').checked);
      assert.equal(target.querySelector(FORMULA).value, '2d6');
      assert.ok(!target.querySelector('[data-stepper-input]'));

      // Emptying the field keeps the row on Rolled; the adapter turns the blank into no key.
      await type(target.querySelector(FORMULA), '');
      assert.deepEqual(await applied('clear'), { ...start, quantityFormula: '' });
      assert.ok(Boolean(target.querySelector(FORMULA)), 'still the expression field');
    });
  }
});

describe('PickerRow: the amount toggle is one named radio group', () => {
  const config = SURFACES['recipe result'];

  it('names every control for the subject, or the kind while unnamed', async () => {
    const names = (target) => ({
      kind: target.querySelector('[data-recipe-option-kind]').getAttribute('aria-label'),
      toggle: target.querySelector('[role="radiogroup"]').getAttribute('aria-label'),
      words: [...target.querySelectorAll(`${TOGGLE} .manager-segment-label`)].map(
        (node) => node.textContent
      ),
      formula: target.querySelector(FORMULA).getAttribute('aria-label'),
      remove: target.querySelector('[data-recipe-remove]').getAttribute('aria-label'),
    });
    const stored = { ...unnamed('component'), id: 'c-iron', quantityFormula: '1d4' };
    const { target } = await mountRow(config, stored);
    assert.deepEqual(names(target), {
      kind: 'Kind of Iron ingot',
      toggle: 'Amount for Iron ingot',
      words: ['Fixed', 'Rolled'],
      formula: 'Rolled amount for Iron ingot',
      remove: 'Remove Iron ingot',
    });
    const clear = target.querySelector('[data-recipe-option-clear]');
    assert.equal(clear.getAttribute('aria-label'), 'Clear Iron ingot');
    assert.equal(clear.getAttribute('title'), 'Clear and search again');
    // The hint names no roll-data path, and says what an absent one is worth.
    const hint = target.querySelector(FORMULA).getAttribute('title');
    assert.match(hint, /missing character value counts as 0/);
    assert.doesNotMatch(`${hint} ${target.querySelector(FORMULA).placeholder}`, /@|abilities/);
    harness.remount();

    const open = await mountRow(config, { ...unnamed('component'), quantityFormula: '1d4' });
    assert.deepEqual(names(open.target), {
      kind: 'Kind of Component',
      toggle: 'Amount for Component',
      words: ['Fixed', 'Rolled'],
      formula: 'Rolled amount for Component',
      remove: 'Remove Component',
    });
    harness.remount();

    // Caller copy overrides each name.
    const overridden = await mountRow(config, stored, {
      amount: {
        fixedLabel: 'Set',
        rolledLabel: 'Dice',
        modeAriaLabel: 'How many',
        formulaAriaLabel: 'Dice for Iron',
      },
    });
    assert.deepEqual(names(overridden.target), {
      kind: 'Kind of Iron ingot',
      toggle: 'How many',
      words: ['Set', 'Dice'],
      formula: 'Dice for Iron',
      remove: 'Remove Iron ingot',
    });
    harness.remount();

    // On Fixed the stepper is named for the subject too.
    const fixed = await mountRow(config, { ...unnamed('component'), id: 'c-iron' });
    assert.equal(
      fixed.target.querySelector('[data-stepper-input]').getAttribute('aria-label'),
      'Quantity for Iron ingot'
    );
  });

  it('draws the toggle on the 30px inline rung', async () => {
    const { target } = await mountRow(config, unnamed('component'));
    const track = target.querySelector('[role="radiogroup"]');
    assert.ok(track.classList.contains('is-inline'), 'the rung no taller than the row’s controls');
    assert.ok(!track.classList.contains('is-compact'));
  });

  it('gives each row its own group, whose keyboard entry point is the checked radio', async () => {
    const first = await mountRow(config, unnamed('component'));
    const radios = [...first.target.querySelectorAll(`${TOGGLE} input`)];
    const names = new Set(radios.map((node) => node.name));
    assert.equal(radios.length, 2);
    assert.equal(names.size, 1, 'one name, so the browser treats the pair as one tab stop');
    assert.equal(radios.filter((node) => node.checked).length, 1);
    const checked = radios.find((node) => node.checked);
    assert.equal(checked.value, 'fixed');
    assert.ok(radios.every((node) => !node.disabled && node.tabIndex !== -1));

    // A checked radio is where Tab lands in its group; happy-dom has no sequential navigation, so
    // only that it takes focus is read here.
    checked.focus();
    assert.equal(first.target.ownerDocument.activeElement, checked);
    assert.ok(
      Boolean(checked.closest('.manager-segment')),
      'inside the segment whose `:has(:focus-visible)` rule draws the ring'
    );
    const [groupName] = names;
    harness.remount();

    const second = await mountRow(config, unnamed('component'));
    const other = second.target.querySelector(`${TOGGLE} input`).name;
    assert.notEqual(other, groupName, 'a second row mints a second group');
  });

  it('moves no focus when the mode changes, and the swapped control follows the toggle', async () => {
    const { target, changes } = await mountRow(config, unnamed('component'));
    const rolled = radio(target, 'rolled');
    rolled.focus();
    rolled.checked = true;
    rolled.dispatchEvent(new globalThis.window.Event('change', { bubbles: true }));
    await settle();
    assert.equal(changes.length, 0);
    assert.equal(target.ownerDocument.activeElement, rolled, 'focus stayed on the radio');
    const slot = (node) => {
      if (node.matches('[role="radiogroup"]')) return 'toggle';
      return node.matches(FORMULA) ? 'formula' : 'remove';
    };
    assert.deepEqual(
      [...target.querySelector('.manager-recipe-option-controls').children].map(slot),
      ['toggle', 'formula', 'remove'],
      'tab order is visual order: the swapped control is the next stop after the toggle'
    );
  });
});

describe('PickerRow: the remaining branches', () => {
  const ingredient = SURFACES['recipe ingredient'];

  it('lists the caller’s kinds in table order, plus the row’s own kind', async () => {
    const { target } = await mountRow({ kinds: ['tags', 'component'] }, unnamed('essence'));
    assert.deepEqual(selectOptionValues(target, KIND_TRIGGER), ['component', 'tags', 'essence']);
  });

  it('retyping forwards the new kind with the subject and tags cleared', async () => {
    const starts = [
      { ...unnamed('component'), id: 'c-iron' },
      { kind: 'tags', id: '', tags: ['herb'], tagMatch: 'all', quantity: 2 },
    ];
    for (const start of starts) {
      const { target, applied } = await mountRow(ingredient, start);
      chooseSelectOption(target, KIND_TRIGGER, 'essence');
      await settle();
      assert.deepEqual(await applied(`retype ${start.kind}`), {
        ...start,
        kind: 'essence',
        id: '',
        tags: [],
        tagMatch: 'any',
      });
      const field = target.querySelector('.manager-recipe-option-name-field');
      assert.ok(field.hasAttribute('data-recipe-option-essence'));
      assert.ok(
        !field.querySelector('[data-recipe-option-chosen]'),
        'the old subject is not named'
      );
      harness.remount();
    }
  });

  it('gives each tag row its own tag-match radio group', async () => {
    const names = [];
    for (let row = 0; row < 2; row += 1) {
      const { target } = await mountRow(ingredient, unnamed('tags'));
      const radios = ['any', 'all'].map((mode) => tagMatchRadio(target, mode));
      assert.equal(radios.length, 2);
      assert.equal(new Set(radios.map((node) => node.name)).size, 1, 'one group per row');
      names.push(radios[0].name);
      harness.remount();
    }
    assert.notEqual(names[0], names[1], 'two rows sharing a name would be one radio group');
  });

  it('the tag picker offers the vocabulary less the tags already chosen', async () => {
    const { target } = await mountRow(ingredient, { ...unnamed('tags'), tags: ['herb'] });
    await click(target.querySelector('[data-recipe-add-tag]'));
    assert.deepEqual(
      [...target.ownerDocument.querySelectorAll('[role="option"]')].map((node) =>
        node.textContent.trim()
      ),
      ['rare']
    );
  });

  it('suggests only offered entries and still names a withheld one', async () => {
    const { target } = await mountRow(ingredient, unnamed('essence'));
    await type(target.querySelector('[data-recipe-option-search]'), 'i');
    const offered = [...target.ownerDocument.querySelectorAll('[data-recipe-option-suggestion]')];
    assert.deepEqual(
      offered.map((node) => node.getAttribute('data-recipe-option-suggestion')),
      ['e-fire'],
      'Life matches the query and is withheld'
    );
    harness.remount();

    const stored = await mountRow(ingredient, { ...unnamed('essence'), id: 'e-life' });
    assert.equal(
      stored.target.querySelector('.manager-recipe-option-chosen-name').textContent,
      'Life',
      'an authored requirement on a withheld essence still reads back by name'
    );
  });

  it('Enter commits the top suggestion, never the typed string', async () => {
    const start = unnamed('component');
    const { target, applied } = await mountRow(ingredient, start);
    const field = target.querySelector('[data-recipe-option-search]');
    await type(field, 'o');
    field.dispatchEvent(
      new globalThis.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })
    );
    await settle();
    assert.deepEqual(await applied('enter'), { ...start, id: 'c-iron' });
  });

  it('readonlyKinds draws the currency read-only face: a static unit, a tag and a static amount', async () => {
    const stored = { ...unnamed('currency'), id: 'gp', quantity: 25 };
    const { target } = await mountRow(ingredient, stored, { readonlyKinds: ['currency'] });
    assert.equal(target.querySelector('[data-recipe-currency-readonly]').textContent, 'Gold');
    assert.ok(Boolean(target.querySelector('[data-recipe-currency-disabled]')));
    assert.equal(target.querySelector('[data-recipe-currency-readonly-amount]').textContent, '25');
    assert.ok(!target.querySelector('[data-stepper-input]'), 'no stepper');
    assert.ok(!target.querySelector('[data-recipe-option-search]'), 'and no search field');
    harness.remount();

    // The same stored row is editable while the kind is not read-only.
    const live = await mountRow(ingredient, stored);
    assert.ok(!live.target.querySelector('[data-recipe-currency-readonly]'));
    assert.equal(live.target.querySelector('[data-recipe-currency-amount]').value, '25');
    harness.remount();

    // Only currency has a read-only face.
    const component = await mountRow(ingredient, unnamed('component'), {
      readonlyKinds: ['component'],
    });
    assert.ok(Boolean(component.target.querySelector('[data-recipe-option-search]')));
  });

  it('disabled reaches every control the row draws', async () => {
    const rows = [
      [SURFACES['recipe ingredient'], { ...unnamed('component'), id: 'c-iron' }],
      [SURFACES['recipe ingredient'], unnamed('component')],
      [SURFACES['recipe ingredient'], { ...unnamed('tags'), tags: ['herb'] }],
      [SURFACES['recipe result'], { ...unnamed('component'), id: 'c-iron' }],
      [SURFACES['recipe result'], { ...unnamed('component'), quantityFormula: '1d4' }],
    ];
    for (const [config, value] of rows) {
      const { target } = await mountRow(config, value, { disabled: true });
      const own = [...target.querySelectorAll('button, input')].filter(
        (node) => !node.matches('[data-test-convert]')
      );
      assert.ok(own.length >= 4, `the scan found ${own.length} controls`);
      for (const control of own) {
        assert.ok(
          control.disabled,
          `${value.kind}: ${control.outerHTML.slice(0, 90)} is still live on a disabled row`
        );
      }
      harness.remount();
    }
    const live = await mountRow(SURFACES['recipe result'], unnamed('component'));
    assert.ok(
      [...live.target.querySelectorAll('button:not([data-stepper-decrement]), input')].every(
        (node) => !node.disabled
      ),
      'and none is disabled by default'
    );
  });

  it('invalid.amount marks the amount control and describes it with the message', async () => {
    const message = 'This formula can never roll a positive amount.';
    for (const value of [{ ...unnamed('component'), quantityFormula: '0' }, unnamed('component')]) {
      const { target } = await mountRow(SURFACES['recipe result'], value, {
        invalid: { amount: message },
      });
      const control = target.querySelector(`${FORMULA}, [data-stepper-input]`);
      assert.equal(control.getAttribute('aria-invalid'), 'true');
      const described = target.querySelector(`[id="${control.getAttribute('aria-describedby')}"]`);
      assert.equal(described.textContent.trim(), message);
      harness.remount();
    }
    const clean = await mountRow(SURFACES['recipe result'], unnamed('component'));
    assert.ok(!clean.target.querySelector('[aria-invalid]'));
    assert.ok(!clean.target.querySelector('[data-recipe-option-invalid]'));
  });

  it('amount carries the caller’s bounds, hook, name and unit', async () => {
    const start = { ...unnamed('component'), quantity: 4 };
    const { target, changes } = await mountRow(SURFACES['recipe result'], start, {
      amount: {
        min: 2,
        max: 4,
        unit: 'gp',
        ariaLabel: 'Quantity for Iron ingot',
        inputProps: { 'data-salvage-result-quantity': '' },
      },
    });
    const input = target.querySelector('[data-salvage-result-quantity]');
    assert.equal(input.getAttribute('aria-label'), 'Quantity for Iron ingot');
    assert.ok(input.hasAttribute('data-recipe-option-quantity'), 'the row’s own hook is kept');
    assert.equal(input.min, '2');
    assert.ok(target.querySelector('[data-stepper-increment]').disabled, 'at the caller’s max');
    assert.equal(target.querySelector('[data-recipe-option-unit]').textContent, 'gp');
    assert.equal(changes.length, 0);
  });

  it('clearable=false drops the named pill’s clear, and removeHook re-marks the remove', async () => {
    const stored = { ...unnamed('component'), id: 'c-iron' };
    const { target } = await mountRow(SURFACES['recipe result'], stored, {
      clearable: false,
      removeHook: 'result-item',
    });
    assert.ok(Boolean(target.querySelector('[data-recipe-option-chosen]')), 'still named');
    assert.ok(!target.querySelector('[data-recipe-option-clear]'), 'with no clear');
    const remove = target.querySelector('[data-recipe-remove]');
    assert.equal(remove.getAttribute('data-recipe-remove'), 'result-item');
    assert.equal(remove.getAttribute('data-keyboard-focus'), 'true', 'declared focused to Foundry');
  });

  it('an unrecognised kind is drawn as a misconfiguration, never as a component', async () => {
    const { target, removes, changes } = await mountRow(SURFACES['recipe result'], {
      ...unnamed('knowledge'),
      id: 'c-iron',
    });
    assert.equal(
      target
        .querySelector('[data-recipe-option-misconfigured]')
        .getAttribute('data-recipe-option-misconfigured'),
      'knowledge'
    );
    assert.ok(!target.querySelector('[data-recipe-option-chosen]'), 'it names no component');
    assert.ok(!target.querySelector('[data-recipe-option-search]'));
    assert.ok(!target.querySelector('[data-stepper-input]'), 'and counts nothing');

    // The plate wears no kind's tint.
    assert.equal(
      target.querySelector('[data-recipe-option]').className,
      'manager-recipe-ingredient-option-row is-unknown'
    );
    assert.equal(
      target.querySelector('.manager-recipe-option-lead').className,
      'manager-recipe-option-lead is-unknown'
    );

    // The field says so in words, and the kind select is described by why.
    const tag = target.querySelector(
      ':scope [data-recipe-option-misconfigured] .manager-recipe-req-tag'
    );
    assert.equal(tag.textContent.trim(), 'Unknown kind');
    const hint =
      'Fabricate does not recognise the kind "knowledge". Remove this row or correct the data.';
    assert.equal(tag.getAttribute('title'), hint);
    const describedBy = target.querySelector(KIND_TRIGGER).getAttribute('aria-describedby');
    assert.equal(target.querySelector(`[id="${describedBy}"]`).textContent, hint);

    // The kind select states the raw kind, takes focus and refuses to open.
    const trigger = target.querySelector(KIND_TRIGGER);
    assert.equal(selectTriggerText(target, KIND_TRIGGER), 'knowledge');
    assert.equal(trigger.getAttribute('aria-disabled'), 'true');
    assert.ok(!trigger.disabled, 'read-only, so it still takes focus');
    trigger.focus();
    assert.equal(target.ownerDocument.activeElement, trigger);
    await click(trigger);
    assert.equal(trigger.getAttribute('aria-expanded'), 'false');
    assert.ok(!target.ownerDocument.querySelector('[role="option"]'), 'no kind is offered');
    assert.equal(changes.length, 0, 'so nothing can retype it');

    await click(target.querySelector('[data-recipe-remove="alternative"]'));
    assert.equal(removes.length, 1, 'it can still be removed');
  });

  it('class and rest land on the root beside the row’s own classes', async () => {
    const { target } = await mountRow(ingredient, unnamed('tags'), {
      class: 'is-stage',
      'data-recipe-result-item': '',
    });
    const root = target.querySelector('[data-recipe-option]');
    assert.equal(root.className, 'manager-recipe-ingredient-option-row is-tag is-stage');
    assert.ok(root.hasAttribute('data-recipe-result-item'));
    harness.remount();

    const plain = await mountRow(ingredient, unnamed('tags'));
    assert.equal(
      plain.target.querySelector('[data-recipe-option]').className,
      'manager-recipe-ingredient-option-row is-tag'
    );
    assert.equal(
      plain.target.querySelector('[data-recipe-option]').getAttribute('data-recipe-option'),
      ''
    );
  });

  it('removable=false draws no remove, with a trailing snippet or without one', async () => {
    for (const trailing of [true, false]) {
      const { target } = await mountRow(
        { ...ingredient, trailing, removable: false },
        unnamed('tags')
      );
      assert.ok(
        !target.querySelector('[data-recipe-remove="alternative"]'),
        `trailing ${trailing}`
      );
      assert.equal(Boolean(target.querySelector('[data-test-trailing]')), trailing);
      harness.remount();
    }
  });

  it('trailing renders after convert and before remove', async () => {
    const { target } = await mountRow({ ...ingredient, trailing: true }, unnamed('component'));
    const order = [...target.querySelector('.manager-recipe-option-controls').children].map(
      (node) => {
        if (node.matches('[data-test-convert]')) return 'convert';
        if (node.matches('[data-test-trailing]')) return 'trailing';
        if (node.matches('[data-recipe-remove]')) return 'remove';
        return node.classList[0];
      }
    );
    assert.deepEqual(order, [
      'fab-stepper',
      'manager-recipe-option-divider',
      'convert',
      'trailing',
      'remove',
    ]);
  });
});
