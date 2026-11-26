/**
 * `<PickerRowAmount>`'s `formula` mode (issue 3010): the Fixed | Formula toggle for every kind, a
 * stepper unbounded and verbatim, and a hint described after the reading, while every caller that
 * passes no `formula` renders the HTML it rendered before (`pickerRowAmountBaseline.json`).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { after, afterEach, before, describe, it } from 'node:test';

import {
  FOUNDRY_BRIDGE_RAW_MODULES,
  LOCALIZE_OR_RAW_MODULES,
} from '../helpers/foundryBridgeModules.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const harness = createMountedComponentHarness({
  repoRoot: resolve(import.meta.dirname, '../..'),
  tmpPrefix: 'fabricate-picker-row-amount-',
  rawModules: [
    ...FOUNDRY_BRIDGE_RAW_MODULES,
    ...LOCALIZE_OR_RAW_MODULES,
    'src/ui/svelte/components/pickerRowKinds.js',
    'src/ui/svelte/util/announceAfterFocus.js',
  ],
  compiledModules: [
    'src/ui/svelte/components/SegmentedControl.svelte',
    'src/ui/svelte/components/Stepper.svelte',
    'src/ui/svelte/components/Button.svelte',
    'src/ui/svelte/components/Chip.svelte',
    'src/ui/svelte/components/RollDataExpressionInput.svelte',
    'src/ui/svelte/components/PickerRowAmount.svelte',
  ],
  componentPath: 'src/ui/svelte/components/PickerRowAmount.svelte',
});

const BASELINE = JSON.parse(
  readFileSync(resolve(import.meta.dirname, '../fixtures/pickerRowAmountBaseline.json'), 'utf8')
);

/** The props each existing caller passes, rendered before the extension and kept as `BASELINE`. */
const CALLERS = {
  plain: { value: { kind: 'component', quantity: 3 }, name: 'Iron' },
  unit: { value: { kind: 'currency', quantity: 50 }, amount: { unit: 'gp' }, name: 'Gold' },
  fixed: { value: { kind: 'component', quantity: 2 }, name: 'Blade', rollable: true },
  rolled: {
    value: { kind: 'component', quantityFormula: '1d4 + @prof' },
    name: 'Draught',
    rollable: true,
  },
  invalid: {
    value: { kind: 'component', quantity: 2 },
    name: 'Blade',
    rollable: true,
    invalid: 'Too many',
  },
  invalidRolled: {
    value: { kind: 'component', quantityFormula: '2d' },
    name: 'Draught',
    rollable: true,
    invalid: 'Bad',
  },
  readonly: { value: { kind: 'currency', quantity: 4 }, readonly: true },
  tagsRollable: { value: { kind: 'tags', quantity: 0 }, name: 'herb', rollable: true },
  bounded: {
    value: { kind: 'component', quantity: 0 },
    amount: { min: 0, max: 5, ariaLabel: 'Count', decrementLabel: 'Less', incrementLabel: 'More' },
    name: 'X',
  },
  labels: {
    value: { kind: 'component', quantityFormula: '3' },
    name: 'X',
    rollable: true,
    amount: {
      fixedLabel: 'Flat',
      rolledLabel: 'Dice',
      modeAriaLabel: 'Mode',
      formulaAriaLabel: 'Expr',
    },
  },
  disabled: {
    value: { kind: 'component', quantity: 2 },
    name: 'Blade',
    rollable: true,
    disabled: true,
  },
};

const ROOT = '.fab-picker-row-amount-formula';
const settle = () => new Promise((done) => setTimeout(done, 0));
const formulaOf = (extra = {}) => ({
  resolve: (text) => (text === '40' ? 40 : null),
  unresolvedLabel: 'Rolls when the step starts',
  placeholder: '40 + 2 * @abilities.con.mod',
  hint: 'A number, dice, or character data.',
  ...extra,
});

/** Mount controlled: each `onChange` patch is recorded and `value` follows it. */
async function mountFormula(value, extra = {}) {
  const patches = [];
  const target = await harness.mount({
    value,
    name: 'Heat',
    formula: formulaOf(),
    onChange: (patch) => {
      patches.push(patch);
    },
    ...extra,
  });
  return { target, patches };
}

async function type(field, text) {
  field.value = text;
  field.dispatchEvent(new globalThis.window.Event('input', { bubbles: true }));
  await settle();
}

const radio = (target, mode) =>
  target.querySelector(`[data-recipe-option-amount-mode="${mode}"] input`);
const stepperInput = (target) => target.querySelector('input[type="number"]');
const expression = (target) => target.querySelector('[data-recipe-option-formula]');
const describedBy = (field) =>
  (field.getAttribute('aria-describedby') ?? '')
    .split(' ')
    .filter(Boolean)
    .map((id) => field.ownerDocument.querySelector(`[id="${id}"]`)?.textContent.trim());

describe('PickerRowAmount formula mode', () => {
  before(() => harness.setup());
  after(() => harness.teardown());
  afterEach(() => harness.remount());

  it('renders every caller that passes no formula as it rendered before', async () => {
    for (const [caller, props] of Object.entries(CALLERS)) {
      const target = await harness.mount(props);
      const html = target.innerHTML.replaceAll(/(picker-row-amount-(?:error-)?)\d+/g, '$1#');
      assert.equal(html, BASELINE[caller], `${caller}: the HTML is unchanged`);
      harness.remount();
    }
    assert.equal(
      Object.keys(BASELINE).length,
      Object.keys(CALLERS).length,
      'every caller is pinned'
    );
  });

  it('draws Fixed | Formula for a kind rollable never offered, one wrapper deep', async () => {
    const { target } = await mountFormula({ kind: 'tags', quantity: 1 });
    const labels = [...target.querySelectorAll('[data-recipe-option-amount-mode]')].map((node) =>
      node.textContent.trim()
    );
    assert.deepEqual(labels, ['Fixed', 'Formula']);
    assert.equal(target.querySelectorAll(ROOT).length, 1, 'the one flex-wrapping root');
    assert.ok(!target.querySelector('[data-recipe-option-formula]'), 'Fixed draws the stepper');
  });

  it('names the second segment from the caller when it passes a word', async () => {
    const { target } = await mountFormula(
      { kind: 'tags', quantity: 1 },
      { amount: { rolledLabel: 'Expression' } }
    );
    assert.equal(
      target.querySelector('[data-recipe-option-amount-mode="rolled"]').textContent.trim(),
      'Expression'
    );
  });

  it('shows 0 verbatim under formula and writes any number unbounded', async () => {
    const { target, patches } = await mountFormula({ kind: 'counter', quantity: 0 });
    assert.equal(stepperInput(target).value, '0', 'a stored 0 is shown as 0, not 1');
    assert.ok(!stepperInput(target).hasAttribute('min'), 'no lower bound');
    assert.ok(!stepperInput(target).hasAttribute('max'), 'no upper bound');
    await type(stepperInput(target), '-12345');
    await type(stepperInput(target), '999999');
    assert.deepEqual(patches, [{ quantity: -12_345 }, { quantity: 999_999 }]);
  });

  it('draws a null amount unset as "—", and writes null when the field is cleared', async () => {
    const { target } = await mountFormula({ kind: 'counter', quantity: null });
    assert.equal(stepperInput(target).value, '', 'not 0');
    assert.equal(stepperInput(target).getAttribute('placeholder'), '—');
    harness.remount();
    const held = await mountFormula({ kind: 'counter', quantity: 4 });
    await type(stepperInput(held.target), '');
    assert.deepEqual(held.patches, [{ quantity: null }]);
  });

  it('keeps a caller bound under formula', async () => {
    const { target } = await mountFormula(
      { kind: 'counter', quantity: 3 },
      { amount: { min: 2, max: 8 } }
    );
    assert.equal(stepperInput(target).getAttribute('min'), '2');
    assert.equal(stepperInput(target).getAttribute('max'), '8');
  });

  it('writes the expression, removes it on Fixed and restores the kept text', async () => {
    const { target, patches } = await mountFormula({ kind: 'counter', quantity: 4 });
    radio(target, 'rolled').click();
    await settle();
    assert.deepEqual(patches, [], 'opening Formula with nothing typed writes nothing');
    assert.equal(expression(target).getAttribute('placeholder'), '40 + 2 * @abilities.con.mod');
    await type(expression(target), '40 + 2');
    assert.deepEqual(patches, [{ quantityFormula: '40 + 2' }]);
    await harness.setProps({ value: { kind: 'counter', quantity: 4, quantityFormula: '40 + 2' } });
    radio(target, 'fixed').click();
    await settle();
    assert.deepEqual(patches.at(-1), { quantityFormula: undefined });
    await harness.setProps({ value: { kind: 'counter', quantity: 4 } });
    radio(target, 'rolled').click();
    await settle();
    assert.deepEqual(patches.at(-1), { quantityFormula: '40 + 2' }, 'the kept text returns');
    assert.ok(
      patches.every((patch) => !('quantity' in patch)),
      'Formula never writes quantity'
    );
  });

  it('draws the hint only under Formula, and describes the input after the reading', async () => {
    const { target } = await mountFormula({ kind: 'counter', quantity: 4 });
    assert.ok(!target.querySelector('.fab-picker-row-amount-hint'), 'no hint under Fixed');
    await harness.setProps({ value: { kind: 'counter', quantity: 4, quantityFormula: '40' } });
    const hint = target.querySelector('.fab-picker-row-amount-hint');
    assert.equal(hint.textContent.trim(), 'A number, dice, or character data.');
    assert.equal(hint.parentElement.matches(ROOT), true, 'inside the slot, not in a cell');
    assert.deepEqual(describedBy(expression(target)), ['= 40', hint.textContent.trim()]);
  });

  it('reads an expression that does not reduce as the caller says', async () => {
    const { target } = await mountFormula({ kind: 'counter', quantityFormula: '1d6' });
    assert.deepEqual(describedBy(expression(target)).slice(0, 1), ['Rolls when the step starts']);
  });

  it('draws no hint, no tokens and one description id when none is passed', async () => {
    const { target } = await mountFormula(
      { kind: 'counter', quantityFormula: '40' },
      { formula: { resolve: formulaOf().resolve, unresolvedLabel: 'x' } }
    );
    assert.ok(!target.querySelector('.fab-picker-row-amount-hint'));
    assert.ok(!target.querySelector('[role="group"]'), 'no tokens');
    assert.equal(expression(target).getAttribute('placeholder'), '1d4+1');
    assert.equal(describedBy(expression(target)).length, 1, 'the reading alone');
  });

  it('draws no hint for a whitespace-only one', async () => {
    const { target } = await mountFormula(
      { kind: 'counter', quantityFormula: '40' },
      { formula: formulaOf({ hint: ' '.repeat(3) }) }
    );
    assert.ok(!target.querySelector('.fab-picker-row-amount-hint'));
    assert.equal(describedBy(expression(target)).length, 1, 'the reading alone');
  });

  it('hangs the invalid message under the controls and describes the field with it', async () => {
    for (const quantityFormula of [undefined, '40']) {
      const { target } = await mountFormula(
        { kind: 'counter', quantity: 4, quantityFormula },
        { invalid: 'Max 3 is below the start value of 4.' }
      );
      const message = target.querySelector('[data-recipe-option-invalid]');
      assert.ok(message.parentElement.matches(ROOT), 'a child of the wrapping root');
      assert.equal(message.parentElement.lastElementChild, message, 'after every control');
      const field = quantityFormula ? expression(target) : stepperInput(target);
      assert.equal(field.getAttribute('aria-invalid'), 'true');
      assert.ok(describedBy(field).includes('Max 3 is below the start value of 4.'));
      harness.remount();
    }
  });

  it('describes the field by the reading, then the hint, then the invalid message', async () => {
    const { target } = await mountFormula(
      { kind: 'counter', quantityFormula: '40' },
      { invalid: 'Bad start.' }
    );
    assert.deepEqual(describedBy(expression(target)), [
      '= 40',
      'A number, dice, or character data.',
      'Bad start.',
    ]);
  });

  it('draws a read-only formula amount as its text, and a stored 0 as 0', async () => {
    const { target } = await mountFormula({ kind: 'counter', quantity: 0 }, { readonly: true });
    assert.equal(target.textContent.trim(), '0');
    assert.ok(!target.querySelector(ROOT));
  });

  it('gives formula precedence over rollable', async () => {
    const { target } = await mountFormula({ kind: 'component', quantity: 2 }, { rollable: true });
    assert.equal(target.querySelectorAll(ROOT).length, 1);
  });
});
