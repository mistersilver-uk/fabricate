/**
 * Issue 2007 — the Formula card's "In the roll prompt" group authors the check's advantage rule.
 * Every control is driven through its real element in the simple, routed and progressive editors,
 * and each write is asserted on that editor's own sub-object with the other five keys kept.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { after, afterEach, before, describe, it } from 'node:test';

import { normalizeCheckEvaluation } from '../../src/systems/normalize/checkEvaluation.js';
import {
  CHECK_EDITOR_COMPILED_MODULES,
  CHECK_EDITOR_RAW_MODULES,
} from '../helpers/checksHarnessModules.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const en = JSON.parse(readFileSync(resolve(repoRoot, 'lang/en.json'), 'utf8'));
const lookup = (key) => key.split('.').reduce((node, part) => node?.[part], en);

const editorHarness = (name, file) =>
  createMountedComponentHarness({
    repoRoot,
    tmpPrefix: `fabricate-check-advantage-${name}-`,
    rawModules: CHECK_EDITOR_RAW_MODULES,
    compiledModules: CHECK_EDITOR_COMPILED_MODULES,
    componentPath: `src/ui/svelte/apps/manager/checks/${file}.svelte`,
  });

/** A stored rule off every default, so a control that reads or writes the wrong record shows. */
const STORED = Object.freeze({
  mode: 'bonus',
  extraDice: 2,
  bonusExpression: '2d4',
  offerDisadvantage: true,
  countEnabled: false,
  countDice: 4,
});

const over = (product = 'sum') => normalizeCheckEvaluation({ product, direction: 'over' });
const base = (overrides) => ({
  rollFormula: '1d20 + @prof',
  checkBreakage: { triggers: [] },
  offerSituationalBonus: true,
  evaluation: over(),
  advantage: STORED,
  ...overrides,
});

const EDITORS = [
  {
    name: 'simple',
    harness: editorHarness('simple', 'SimpleCraftingCheckEditor'),
    value: (overrides = {}) =>
      base({
        dc: 12,
        thresholdMode: 'meet',
        dcMode: 'static',
        tiers: [],
        macroUuid: null,
        ...overrides,
      }),
  },
  {
    name: 'routed',
    harness: editorHarness('routed', 'CraftingCheckEditor'),
    value: (overrides = {}) =>
      base({
        type: 'relative',
        dc: 12,
        thresholdMode: 'meet',
        dcMode: 'static',
        macroUuid: null,
        tiers: [],
        relativeOutcomes: [
          { id: 'hit', name: 'Hit', success: true, breakTools: false, dc: 0, adjustment: 1 },
          { id: 'miss', name: 'Miss', success: false, breakTools: false, dc: -4, adjustment: null },
        ],
        fixedOutcomes: [],
        ...overrides,
      }),
  },
  {
    name: 'progressive',
    harness: editorHarness('progressive', 'ProgressiveCraftingCheckEditor'),
    value: (overrides = {}) => base({ awardMode: 'equal', ...overrides }),
  },
];

/** A controlled mount: every emission is fed back as the next `value`, as the route model does. */
async function mountControlled(harness, value) {
  const state = { value };
  const root = await harness.mount({
    value,
    section: '',
    onChange: (next) => {
      state.value = next;
    },
  });
  state.root = root;
  state.act = async (fn) => {
    fn(root);
    await harness.setProps({ value: state.value });
  };
  state.query = (selector) => root.querySelector(selector);
  state.text = (selector) => root.querySelector(selector)?.textContent.trim() ?? '';
  return state;
}

function chooseMode(root, mode) {
  const radio = root.querySelector(`[data-check-advantage-mode-option="${mode}"] input`);
  assert.ok(radio, `a radio exists for mode ${mode}`);
  radio.checked = true;
  radio.dispatchEvent(new globalThis.Event('change', { bubbles: true }));
}

function type(input, text) {
  assert.ok(input, 'the input exists');
  input.value = text;
  input.dispatchEvent(new globalThis.Event('input', { bubbles: true }));
}

function typeFormatted(input, text) {
  assert.ok(input, 'the formatted input exists');
  input.value = text;
  input.dispatchEvent(
    new globalThis.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
  );
}

const stepperButton = (state, hook, which) =>
  state.query(hook).closest('.fab-stepper').querySelector(`[data-stepper-${which}]`);

for (const editor of EDITORS) {
  describe(`the ${editor.name} editor authors the advantage rule on its own sub-object`, () => {
    before(async () => {
      await editor.harness.setup();
      globalThis.game.i18n.localize = (key) => {
        const value = lookup(key);
        return typeof value === 'string' ? value : key;
      };
    });
    after(() => editor.harness.teardown());
    afterEach(() => editor.harness.remount());

    it('reads the stored rule and writes each summing control, one key at a time', async () => {
      const state = await mountControlled(editor.harness, editor.value());
      const written = () => state.value.advantage;
      const radio = (mode) => state.query(`[data-check-advantage-mode-option="${mode}"] input`);
      assert.ok(radio('bonus').checked, 'the stored bonus mode is the checked segment');

      await state.act((root) =>
        type(root.querySelector('[data-check-advantage-bonus]'), '1d8 + 1')
      );
      assert.deepEqual(written(), { ...STORED, bonusExpression: '1d8 + 1' });

      await state.act((root) => root.querySelector('[data-check-advantage-disadvantage]').click());
      assert.deepEqual(written(), {
        ...STORED,
        bonusExpression: '1d8 + 1',
        offerDisadvantage: false,
      });

      await state.act((root) => chooseMode(root, 'keep'));
      const kept = {
        ...STORED,
        bonusExpression: '1d8 + 1',
        offerDisadvantage: false,
        mode: 'keep',
      };
      assert.deepEqual(written(), kept);
      assert.equal(
        state.query('[data-check-advantage-extra]').value,
        '3d20',
        'the stored two extra dice'
      );

      await state.act(() =>
        stepperButton(state, '[data-check-advantage-extra]', 'increment').click()
      );
      assert.deepEqual(written(), { ...kept, extraDice: 3 });

      await state.act((root) => chooseMode(root, 'off'));
      assert.deepEqual(written(), { ...kept, extraDice: 3, mode: 'off' });
    });

    it('writes each counting control, one key at a time', async () => {
      const state = await mountControlled(
        editor.harness,
        editor.value({ evaluation: over('count') })
      );
      const written = () => state.value.advantage;
      assert.ok(!state.query('[data-check-advantage-mode]'), 'counting has no summing mode');
      assert.equal(
        state.query('[data-check-advantage-count]').getAttribute('aria-pressed'),
        'false'
      );
      assert.ok(!state.query('[data-check-advantage-count-dice]'), 'no dice stepper while off');

      await state.act((root) => root.querySelector('[data-check-advantage-count]').click());
      assert.deepEqual(written(), { ...STORED, countEnabled: true });
      assert.equal(state.query('[data-check-advantage-count-dice]').value, '4');

      await state.act(() =>
        stepperButton(state, '[data-check-advantage-count-dice]', 'decrement').click()
      );
      assert.deepEqual(written(), { ...STORED, countEnabled: true, countDice: 3 });
      assert.equal(
        state.text('[data-check-advantage-count-hint]'),
        'Advantage adds 3 dice to the pool; disadvantage removes 3.'
      );
    });
  });
}

describe('the advantage block states the rule it authors', () => {
  const [simple] = EDITORS;
  before(async () => {
    await simple.harness.setup();
    globalThis.game.i18n.localize = (key) => {
      const value = lookup(key);
      return typeof value === 'string' ? value : key;
    };
  });
  after(() => simple.harness.teardown());
  afterEach(() => simple.harness.remount());

  const DEFAULT_RULE = { ...STORED, mode: 'keep', extraDice: 1, bonusExpression: '1d6' };
  const mount = (overrides = {}) =>
    mountControlled(simple.harness, simple.value({ advantage: DEFAULT_RULE, ...overrides }));

  it('keeps the highest of the first group over, with a formatted dice stepper', async () => {
    const state = await mount();
    assert.equal(
      state.text('[data-check-advantage-note]'),
      'Advantage rolls 2d20 and keeps the highest. Applies to the first dice group, 1d20.'
    );
    const input = state.query('[data-check-advantage-extra]');
    assert.equal(input.value, '2d20');
    assert.equal(input.getAttribute('aria-valuetext'), '2d20');
    assert.equal(input.getAttribute('aria-label'), 'Dice rolled for d20');
    assert.equal(
      stepperButton(state, '[data-check-advantage-extra]', 'increment').getAttribute('aria-label'),
      'Increase dice rolled with advantage'
    );
    assert.equal(
      state.text('[data-check-advantage-disadvantage-hint]'),
      'Disadvantage rolls the same dice and keeps the lowest.'
    );

    await state.act(() => typeFormatted(state.query('[data-check-advantage-extra]'), '4d20'));
    assert.equal(state.value.advantage.extraDice, 3, 'a typed 4d20 is three extra dice');
    await state.act(() => typeFormatted(state.query('[data-check-advantage-extra]'), '9'));
    assert.equal(state.value.advantage.extraDice, 4, 'a typed total past the range clamps to 4');
    assert.equal(
      state.text('[data-check-advantage-note]'),
      'Advantage rolls 5d20 and keeps the highest. Applies to the first dice group, 1d20.'
    );
  });

  it('names the kept count of a multi-die group, lowest under', async () => {
    const state = await mount({
      rollFormula: '2d6 + @prof',
      evaluation: normalizeCheckEvaluation({ product: 'sum', direction: 'under' }),
      advantage: { ...DEFAULT_RULE, extraDice: 2 },
    });
    assert.equal(state.query('[data-check-advantage-extra]').value, '4d6');
    assert.equal(
      state.text('[data-check-advantage-note]'),
      'Advantage rolls 4d6 and keeps the 2 lowest. Applies to the first dice group, 2d6.'
    );
    assert.equal(
      state.text('[data-check-advantage-disadvantage-hint]'),
      'Disadvantage rolls the same dice and keeps the 2 highest.'
    );
  });

  it('refuses a first group that is not a plain die, hiding the stepper and the disadvantage row', async () => {
    const state = await mount({
      rollFormula: '(1d20+2)*2',
      advantage: { ...DEFAULT_RULE, extraDice: 3 },
    });
    assert.ok(!state.query('[data-check-advantage-extra]'), 'no stepper for a nested die');
    assert.ok(
      !state.query('[data-check-advantage-disadvantage]'),
      'no disadvantage row: the prompt offers only a single Roll'
    );
    assert.equal(
      state.text('[data-check-advantage-note]'),
      "The formula's first dice group is not a plain die, so the prompt has a single Roll button. Choose Bonus die, or start the formula with a plain die."
    );
    assert.equal(state.value.advantage.extraDice, 3, 'the hidden extra dice are kept');
    assert.equal(
      state.value.advantage.offerDisadvantage,
      true,
      'the hidden disadvantage offer is kept'
    );
  });

  it('describes a bonus die, parenthesising more than one term, and flags a bad expression', async () => {
    const state = await mount({
      advantage: { ...DEFAULT_RULE, mode: 'bonus', bonusExpression: '1d8 + 1' },
    });
    const input = () => state.query('[data-check-advantage-bonus]');
    const help = () => state.query('[data-check-advantage-bonus-help]');
    assert.equal(input().getAttribute('aria-invalid'), 'false');
    assert.equal(input().getAttribute('aria-describedby'), help().id);
    assert.equal(input().getAttribute('data-validation-target'), 'checks-advantage-bonus');
    assert.equal(help().textContent.trim(), 'Any dice expression: 1d6, 2d4, 1d8 + 1.');
    assert.equal(
      state.text('[data-check-advantage-note]'),
      'Advantage adds to the total by (1d8 + 1). Use this when the formula has several dice groups or the system grants a fixed bonus.'
    );
    assert.equal(
      state.text('[data-check-advantage-disadvantage-hint]'),
      'Disadvantage subtracts from the total by (1d8 + 1).'
    );

    await state.act(() => type(input(), '1d6x'));
    assert.equal(input().getAttribute('aria-invalid'), 'true');
    assert.ok(help().classList.contains('is-danger'));
    assert.equal(
      help().textContent.trim(),
      'Not a dice expression. Use dice and numbers joined by + or −, such as 1d8 + 1.'
    );
    await state.act(() => type(input(), ''));
    assert.equal(
      help().textContent.trim(),
      'Enter a dice expression, such as 1d6, 2d4 or 1d8 + 1.'
    );
  });

  it('raises the target under a bonus die', async () => {
    const state = await mount({
      evaluation: normalizeCheckEvaluation({ product: 'sum', direction: 'under' }),
      advantage: { ...DEFAULT_RULE, mode: 'bonus' },
    });
    assert.equal(
      state.text('[data-check-advantage-note]'),
      'Advantage raises the target by 1d6. Use this when the formula has several dice groups or the system grants a fixed bonus.'
    );
    assert.equal(
      state.text('[data-check-advantage-disadvantage-hint]'),
      'Disadvantage lowers the target by 1d6.'
    );
  });

  it('offers a single Roll when off, and advantage only without disadvantage', async () => {
    const off = await mount({ advantage: { ...DEFAULT_RULE, mode: 'off' } });
    assert.equal(off.text('[data-check-advantage-note]'), 'The prompt has a single Roll button.');
    assert.ok(!off.query('[data-check-advantage-disadvantage]'), 'no disadvantage row when off');
    assert.equal(
      off
        .query('[data-check-advantage-mode-option="off"] input')
        .getAttribute('data-validation-target'),
      'checks-advantage-mode'
    );
    simple.harness.remount();
    const only = await mount({ advantage: { ...DEFAULT_RULE, offerDisadvantage: false } });
    assert.equal(
      only.query('[data-check-advantage-disadvantage]').getAttribute('aria-pressed'),
      'false'
    );
    assert.equal(
      only.text('[data-check-advantage-disadvantage-hint]'),
      'The prompt offers advantage only.'
    );
  });
});
