/**
 * Issue 2006 — the Studio authors a success-counting pool through its real controls. Every Formula
 * card control is driven through its element; each product switch is proved lossless by a round
 * trip, and each pool control writes one field and nothing else (N1).
 */
import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';

import { normalizeCheckEvaluation } from '../../src/systems/normalize/checkEvaluation.js';
import {
  CHECK_EDITOR_COMPILED_MODULES,
  CHECK_EDITOR_RAW_MODULES,
} from '../helpers/checksHarnessModules.js';
import { chooseSelectOption } from '../helpers/select-control.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const EDITORS = 'src/ui/svelte/apps/manager/checks/';

const harnessFor = (component) =>
  createMountedComponentHarness({
    repoRoot,
    tmpPrefix: `fabricate-check-count-${component.toLowerCase()}-`,
    rawModules: CHECK_EDITOR_RAW_MODULES,
    compiledModules: CHECK_EDITOR_COMPILED_MODULES,
    componentPath: `${EDITORS}${component}.svelte`,
  });

const simpleHarness = harnessFor('SimpleCraftingCheckEditor');
const progressiveHarness = harnessFor('ProgressiveCraftingCheckEditor');

const IDRIN = Object.freeze({
  name: 'Idrin',
  rollData: { abilities: { int: { value: 6 } }, skills: { repair: { value: 4 } } },
});

/** Every pool field held off its default, so a control that rewrites another is visible. */
const AUTHORED_POOL = Object.freeze({
  die: 10,
  base: '@abilities.int.value + @skills.repair.value',
  threshold: '8',
  required: 3,
  modifierDestination: 'pool',
  zeroPoolFails: true,
  explode: { enabled: true, faces: { kind: 'best', value: 7 }, once: true },
  cancel: { enabled: false, faces: { kind: 'from', value: 2 } },
  additionalDice: { enabled: false, source: 'path', path: '', readMacroUuid: '', spendMacroUuid: '', max: 2 },
});

const evaluation = (overrides = {}) =>
  normalizeCheckEvaluation({ product: 'count', direction: 'over', pool: AUTHORED_POOL, ...overrides });

/** A summing check with tier DCs, a formula, a target and triggers: all of it survives a switch. */
function simpleCheck(evaluationRecord = evaluation({ product: 'sum' })) {
  return {
    rollFormula: '2d20cs<=@skills.survival.value',
    dc: 12,
    thresholdMode: 'exceed',
    dcMode: 'static',
    tiers: [
      { id: 't-easy', name: 'Easy', dc: 8, successes: null },
      { id: 't-hard', name: 'Hard', dc: 16, successes: 2 },
    ],
    macroUuid: null,
    checkBreakage: {
      triggers: [
        {
          id: 'crit',
          condition: { type: 'diceGroup', groupId: 1, aggregate: 'anyDie', operator: '==', value: 20 },
          outcome: 'success',
          breakTools: false,
          tierStep: { mode: 'none', steps: 1, tierId: null },
        },
      ],
    },
    evaluation: {
      ...evaluationRecord,
      target: { source: 'attribute', expression: '@a.b', adjustmentKind: 'multiply', baseAdjustment: 0.5 },
    },
    offerSituationalBonus: false,
  };
}

/** A controlled mount: every emission is fed back as the next `value`, as the route model does. */
async function mountControlled(harness, value, props = {}) {
  const state = { value, emitted: [] };
  const root = await harness.mount({
    value,
    section: 'roll',
    ...props,
    onChange: (next) => {
      state.value = next;
      state.emitted.push(next);
    },
  });
  state.root = root;
  state.act = async (fn) => {
    await fn(root);
    await harness.setProps({ value: state.value });
  };
  return state;
}

function choose(root, attr, value) {
  const radio = root.querySelector(`[${attr}="${value}"] input[type="radio"]`);
  assert.ok(Boolean(radio), `a radio exists for ${attr}="${value}"`);
  radio.checked = true;
  radio.dispatchEvent(new globalThis.Event('change', { bubbles: true }));
}

function typeInto(input, text) {
  assert.ok(Boolean(input), 'the input exists');
  input.value = text;
  input.dispatchEvent(new globalThis.Event('input', { bubbles: true }));
}

/** The −/+ adjuncts of the Stepper whose input carries `attr`. */
function adjuncts(root, attr) {
  const input = root.querySelector(`[${attr}]`);
  assert.ok(Boolean(input), `a stepper input carries ${attr}`);
  const [decrement, increment] = input.closest('.fab-stepper').querySelectorAll('.fab-stepper-adjunct');
  return { input, decrement, increment };
}

const pool = (state) => state.value.evaluation.pool;
const texts = (root, selector) =>
  [...root.querySelectorAll(selector)].map((node) => node.textContent.trim());

describe('the product axis switches losslessly (N1)', () => {
  before(() => simpleHarness.setup());
  after(() => simpleHarness.teardown());
  afterEach(() => simpleHarness.remount());

  it('sum → count → sum and count → sum → count deep-equal the record, pool included', async () => {
    const start = simpleCheck();
    const state = await mountControlled(simpleHarness, start, { previewCharacter: IDRIN });
    const axis = state.root.querySelector('[data-check-product]');
    assert.ok(Boolean(axis), 'the product axis renders');
    assert.deepEqual(texts(state.root, '[data-check-product-option]'), ['Add the dice', 'Count successes']);
    await state.act((root) => choose(root, 'data-check-product-option', 'count'));
    assert.deepEqual(state.value, {
      ...start,
      evaluation: { ...start.evaluation, product: 'count' },
    });
    await state.act((root) => choose(root, 'data-check-product-option', 'sum'));
    assert.deepEqual(state.value, start, 'switching back restores every field');

    const counting = simpleCheck(evaluation());
    simpleHarness.remount();
    const again = await mountControlled(simpleHarness, counting, { previewCharacter: IDRIN });
    await again.act((root) => choose(root, 'data-check-product-option', 'sum'));
    await again.act((root) => choose(root, 'data-check-product-option', 'count'));
    assert.deepEqual(again.value, counting);
    assert.deepEqual(pool(again), normalizeCheckEvaluation({ pool: AUTHORED_POOL }).pool);
  });

  it('a never-counted record opens on the normalizer defaults', async () => {
    const state = await mountControlled(simpleHarness, { rollFormula: '1d20', dc: 10 });
    await state.act((root) => choose(root, 'data-check-product-option', 'count'));
    assert.deepEqual(pool(state), normalizeCheckEvaluation({}).pool);
    assert.equal(state.root.querySelector('[data-check-count-base]').value, '2');
    assert.equal(state.root.querySelector('[data-check-count-threshold]').value, '8');
  });

  it('counting replaces the free-text formula, its reading and its tokens (N7)', async () => {
    const state = await mountControlled(simpleHarness, simpleCheck(evaluation()));
    for (const selector of [
      '[data-check-roll-formula]',
      '[data-check-formula-average]',
      '[data-check-formula-average-withheld]',
      '[data-check-formula-tokens]',
    ]) {
      assert.ok(!state.root.querySelector(selector), `${selector} does not render in count`);
    }
    assert.ok(state.root.querySelector('[data-check-count-fields]'), 'the structured pool renders');
    assert.equal(
      state.root.querySelector('[data-roll-formula-card] .manager-checks-card-description').textContent.trim(),
      'Built from the controls below, so every part of the roll can be checked.'
    );
    await state.act((root) => choose(root, 'data-check-product-option', 'sum'));
    assert.ok(state.root.querySelector('[data-check-roll-formula]'), 'the sum input returns');
    assert.ok(
      state.root.querySelector('[data-check-formula-average-withheld="die-modifiers"]'),
      'avg — returns for the retained counting formula'
    );
  });

  it('thresholdMode has one editor: the per-die test, and no Difficulty Comparison in count', async () => {
    const state = await mountControlled(simpleHarness, simpleCheck(evaluation()));
    assert.ok(!state.root.querySelector('[data-threshold-mode]'), 'no Comparison while counting');
    assert.deepEqual(texts(state.root, '[data-check-count-test-option]'), ['At or above', 'Above']);
    await state.act((root) => choose(root, 'data-check-count-test-option', 'meet'));
    assert.equal(state.value.thresholdMode, 'meet');
    assert.match(
      state.root.querySelector('[data-check-direction-note]').textContent,
      /Each die that rolls at or above its threshold is a success\./
    );
    await state.act((root) => choose(root, 'data-check-direction-option', 'under'));
    assert.deepEqual(texts(state.root, '[data-check-count-test-option]'), ['At or under', 'Under']);
    await state.act((root) => choose(root, 'data-check-count-test-option', 'exceed'));
    assert.match(state.root.querySelector('[data-check-direction-note]').textContent, /rolls under its/);
    await state.act((root) => choose(root, 'data-check-product-option', 'sum'));
    assert.ok(state.root.querySelector('[data-threshold-mode]'), 'the Comparison returns in sum');
  });
});

describe('every pool control writes its own field (N1)', () => {
  before(() => simpleHarness.setup());
  after(() => simpleHarness.teardown());
  afterEach(() => simpleHarness.remount());

  const mount = (overrides = {}) =>
    mountControlled(simpleHarness, simpleCheck(evaluation(overrides)), { previewCharacter: IDRIN });

  /** Assert the act changed exactly `patch` in the pool and nothing else in the record. */
  async function writesOnly(state, act, patch) {
    const before = structuredClone(state.value);
    await state.act(act);
    assert.deepEqual(state.value, {
      ...before,
      evaluation: { ...before.evaluation, pool: { ...before.evaluation.pool, ...patch } },
    });
  }

  it('the die select writes only the die and offers an imported size', async () => {
    const state = await mount({ pool: { ...AUTHORED_POOL, die: 7 } });
    await writesOnly(state, (root) => chooseSelectOption(root, '[data-check-count-die]', '6'), { die: 6 });
    const imported = await mount({ pool: { ...AUTHORED_POOL, die: 7 } });
    assert.match(imported.root.querySelector('[data-check-count-die]').textContent, /d7/);
  });

  it('the base pool reads its mode from the stored string; switching writes nothing', async () => {
    const state = await mount();
    const option = (value) => state.root.querySelector(`[data-check-count-base-mode-option="${value}"]`);
    assert.ok(option('value').classList.contains('is-active'), 'an expression reads Character value');
    assert.equal(state.root.querySelector('[data-check-count-base-expression]').value, AUTHORED_POOL.base);
    assert.match(
      state.root.querySelector('[data-check-count-base-resolution]').textContent,
      /Idrin → 10/
    );
    const writes = state.emitted.length;
    await state.act((root) => choose(root, 'data-check-count-base-mode-option', 'number'));
    assert.equal(state.emitted.length, writes, 'switching the mode writes nothing');
    const { input, increment } = adjuncts(state.root, 'data-check-count-base');
    assert.equal(input.value, '', 'Number on an expression shows the stepper blank');
    await writesOnly(state, () => increment.click(), { base: '1' });
    await writesOnly(state, (root) => typeInto(root.querySelector('[data-check-count-base]'), '5'), {
      base: '5',
    });
    assert.equal(typeof pool(state).base, 'string', 'the stepper writes a string');
    await state.act((root) => choose(root, 'data-check-count-base-mode-option', 'value'));
    assert.equal(
      state.root.querySelector('[data-check-count-base-expression]').value,
      AUTHORED_POOL.base,
      'the other mode keeps its last entry for the session'
    );
    assert.equal(pool(state).base, '5', 'and only the active entry was written');
    await writesOnly(
      state,
      (root) => typeInto(root.querySelector('[data-check-count-base-expression]'), '@skills.repair.value'),
      { base: '@skills.repair.value' }
    );
  });

  it('Character value on a number shows the number as the expression', async () => {
    const state = await mount({ pool: { ...AUTHORED_POOL, base: '3' } });
    assert.ok(
      state.root.querySelector('[data-check-count-base-mode-option="number"]').classList.contains('is-active')
    );
    await state.act((root) => choose(root, 'data-check-count-base-mode-option', 'value'));
    assert.equal(state.root.querySelector('[data-check-count-base-expression]').value, '3');
  });

  it('a stored value outside the stepper bounds shows as stored and steps toward the range', async () => {
    const state = await mount({ pool: { ...AUTHORED_POOL, threshold: '11' } });
    const { input, decrement, increment } = adjuncts(state.root, 'data-check-count-threshold');
    assert.equal(input.value, '11', 'cs>=11 on a d10 is not clamped on load');
    assert.equal(increment.disabled, true, 'stepping further out is refused');
    await state.act(() => decrement.click());
    assert.equal(pool(state).threshold, '10', 'stepping moves it into the range');
  });

  it('Success on edits the threshold in either mode, and the per-die test the comparison', async () => {
    const state = await mount();
    await writesOnly(state, (root) => typeInto(root.querySelector('[data-check-count-threshold]'), '6'), {
      threshold: '6',
    });
    await state.act((root) => choose(root, 'data-check-count-threshold-mode-option', 'value'));
    await writesOnly(
      state,
      (root) => typeInto(root.querySelector('[data-check-count-threshold-expression]'), '@skills.repair.value'),
      { threshold: '@skills.repair.value' }
    );
    const before = structuredClone(state.value);
    await state.act((root) => choose(root, 'data-check-count-test-option', 'meet'));
    assert.deepEqual(state.value, { ...before, thresholdMode: 'meet' });
  });

  it('explode: Off keeps the face and once; From a face seeds the best face when none is kept', async () => {
    const state = await mount();
    assert.deepEqual(texts(state.root, '[data-check-count-explode-option]'), [
      'Off',
      'Best face (10)',
      'From a face',
    ]);
    assert.ok(state.root.querySelector('[data-check-count-explode-repeat]'), 'repeat shows while on');
    await writesOnly(state, (root) => choose(root, 'data-check-count-explode-option', 'off'), {
      explode: { enabled: false, faces: { kind: 'best', value: 7 }, once: true },
    });
    assert.ok(!state.root.querySelector('[data-check-count-explode-repeat]'), 'repeat hides while off');
    assert.ok(!state.root.querySelector('[data-check-count-explode-face]'), 'no face stepper while off');
    await writesOnly(state, (root) => choose(root, 'data-check-count-explode-option', 'from'), {
      explode: { enabled: true, faces: { kind: 'from', value: 7 }, once: true },
    });
    assert.match(state.root.querySelector('[data-check-count-row-explode]').textContent, /or above/);
    const { increment } = adjuncts(state.root, 'data-check-count-explode-face');
    await writesOnly(state, () => increment.click(), {
      explode: { enabled: true, faces: { kind: 'from', value: 8 }, once: true },
    });
    await writesOnly(state, (root) => choose(root, 'data-check-count-explode-repeat-option', 'keeps'), {
      explode: { enabled: true, faces: { kind: 'from', value: 8 }, once: false },
    });
    await writesOnly(state, (root) => choose(root, 'data-check-count-explode-option', 'extreme'), {
      explode: { enabled: true, faces: { kind: 'best', value: 8 }, once: false },
    });

    const fresh = await mount({ pool: { ...AUTHORED_POOL, explode: { enabled: false } } });
    await fresh.act((root) => choose(root, 'data-check-count-explode-option', 'from'));
    assert.deepEqual(pool(fresh).explode.faces, { kind: 'from', value: 10 }, 'seeded, never null');
  });

  it('cancel: the worst face follows the direction, and From a face seeds it', async () => {
    const state = await mount({ direction: 'under', pool: { ...AUTHORED_POOL, cancel: { enabled: false } } });
    assert.deepEqual(texts(state.root, '[data-check-count-cancel-option]'), [
      'Off',
      'Worst face (10)',
      'From a face',
    ]);
    await writesOnly(state, (root) => choose(root, 'data-check-count-cancel-option', 'from'), {
      cancel: { enabled: true, faces: { kind: 'from', value: 10 } },
    });
    assert.match(state.root.querySelector('[data-check-count-row-cancel]').textContent, /or above/);
    const { decrement } = adjuncts(state.root, 'data-check-count-cancel-face');
    await writesOnly(state, () => decrement.click(), {
      cancel: { enabled: true, faces: { kind: 'from', value: 9 } },
    });
    await writesOnly(state, (root) => choose(root, 'data-check-count-cancel-option', 'extreme'), {
      cancel: { enabled: true, faces: { kind: 'worst', value: 9 } },
    });
    await writesOnly(state, (root) => choose(root, 'data-check-count-cancel-option', 'off'), {
      cancel: { enabled: false, faces: { kind: 'worst', value: 9 } },
    });
  });

  it('the destination and the zero-pool switch write their own fields', async () => {
    const state = await mount();
    await writesOnly(state, (root) => choose(root, 'data-check-count-destination-option', 'threshold'), {
      modifierDestination: 'threshold',
    });
    const toggle = state.root.querySelector('[data-check-count-zero-pool]');
    assert.equal(toggle.getAttribute('aria-pressed'), 'true');
    assert.equal(toggle.getAttribute('aria-label'), 'A pool reduced to zero fails automatically');
    await writesOnly(state, () => toggle.click(), { zeroPoolFails: false });
  });

  it('names every stepper after its row and stamps the Validation targets', async () => {
    const state = await mount({
      pool: {
        ...AUTHORED_POOL,
        base: '2',
        explode: { enabled: true, faces: { kind: 'from', value: 9 }, once: false },
        cancel: { enabled: true, faces: { kind: 'from', value: 1 } },
      },
    });
    const label = (attr) => state.root.querySelector(`[${attr}]`).getAttribute('aria-label');
    assert.deepEqual(
      [
        'data-check-count-base',
        'data-check-count-threshold',
        'data-check-count-explode-face',
        'data-check-count-cancel-face',
      ].map(label),
      ['Base pool', 'Success on', 'Explode from face', 'Cancel from face']
    );
    const target = (id) => state.root.querySelector(`[data-validation-target="${id}"]`);
    for (const id of [
      'checks-product',
      'checks-count-base',
      'checks-count-threshold',
      'checks-count-explode',
      'checks-count-explode-face',
      'checks-count-cancel',
      'checks-count-cancel-face',
    ]) {
      assert.ok(Boolean(target(id)), `${id} lands on a control`);
    }
    assert.equal(target('checks-product').closest('[data-check-product-option]').dataset.checkProductOption, 'count');
  });

  it('the roll-prompt offer help follows the destination', async () => {
    const state = await mountControlled(simpleHarness, {
      ...simpleCheck(evaluation()),
      offerSituationalBonus: true,
    });
    const hint = () =>
      state.root.querySelector('[data-check-prompt-options] .manager-checks-prompt-options-row .manager-checks-prompt-options-hint')
        .textContent.trim();
    assert.match(hint(), /It adds that many dice\.$/);
    await state.act((root) => choose(root, 'data-check-count-destination-option', 'threshold'));
    assert.match(hint(), /It moves the threshold by that much\.$/);
    await state.act((root) => choose(root, 'data-check-product-option', 'sum'));
    assert.match(hint(), /It adds to the total\.$/);
  });
});

describe('the composed roll (N3)', () => {
  before(() => simpleHarness.setup());
  after(() => simpleHarness.teardown());
  afterEach(() => simpleHarness.remount());

  const KNACK = [{ id: 'knack', name: 'Knack', icon: 'fas fa-star' }];
  const insetTerms = (root) =>
    [...root.querySelector('[data-check-count-composed]').children].map((node) => node.textContent.trim());

  it('shows the pool that rolls under What actually gets rolled, never the retained formula (issue 2084)', async () => {
    const state = await mountControlled(
      simpleHarness,
      simpleCheck(evaluation({ pool: { ...AUTHORED_POOL, base: '6' } }))
    );
    const boxes = state.root.querySelectorAll('[data-check-formula-resolved]');
    assert.equal(boxes.length, 1, 'one resolved box, the count inset');
    assert.ok(boxes[0].classList.contains('is-count'));
    assert.deepEqual(insetTerms(state.root).slice(0, 3), ['6d10', 'each', '> 8']);
    assert.ok(
      !boxes[0].textContent.includes('2d20cs<=@skills.survival.value'),
      'the summing formula the record retains is not what a counting check rolls'
    );
  });

  it('attaches the chips inside the pool brackets, or after the threshold, with the face clauses', async () => {
    const state = await mountControlled(simpleHarness, simpleCheck(evaluation()), {
      appliedModifiers: KNACK,
    });
    assert.deepEqual(insetTerms(state.root), [
      '(',
      '@abilities.int.value + @skills.repair.value',
      '+',
      'Knack',
      ')d10',
      'each',
      '> 8',
      '· explodes on 10 once',
    ]);
    await state.act((root) => choose(root, 'data-check-count-destination-option', 'threshold'));
    assert.deepEqual(insetTerms(state.root).slice(0, 5), [
      '(@abilities.int.value + @skills.repair.value)d10',
      'each',
      '> 8',
      '−',
      'Knack',
    ]);
    await state.act((root) => choose(root, 'data-check-direction-option', 'under'));
    assert.deepEqual(insetTerms(state.root).slice(2, 5), ['< 8', '+', 'Knack']);
    assert.ok(!state.root.querySelector('[data-check-formula-rule]:not([data-check-count-actor-line])'));
  });

  it('names from faces with their side, and a cancel face as a success removed', async () => {
    const state = await mountControlled(
      simpleHarness,
      simpleCheck(
        evaluation({
          pool: {
            ...AUTHORED_POOL,
            base: '6',
            explode: { enabled: true, faces: { kind: 'from', value: 9 }, once: false },
            cancel: { enabled: true, faces: { kind: 'worst' } },
          },
        })
      )
    );
    assert.deepEqual(texts(state.root, '[data-check-count-clause]'), [
      '· explodes on 9 or above',
      '· 1 cancels a success',
    ]);
    assert.equal(
      state.root.querySelector('[data-check-count-actor-line]').textContent.trim(),
      'Choose a character in Preview as to see the composed pool and threshold.'
    );
  });
});

describe('a progressive counting check (N1)', () => {
  before(() => progressiveHarness.setup());
  after(() => progressiveHarness.teardown());
  afterEach(() => progressiveHarness.remount());

  it('offers the product axis and, while counting, the same per-die test (issue 2067)', async () => {
    const start = {
      awardMode: 'equal',
      thresholdMode: 'meet',
      rollFormula: '1d20',
      checkBreakage: { triggers: [] },
      evaluation: evaluation({ product: 'sum', direction: 'under' }),
      offerSituationalBonus: true,
    };
    const state = await mountControlled(progressiveHarness, start, { previewCharacter: IDRIN });
    assert.ok(state.root.querySelector('[data-check-progressive-refusal]'), 'sum/under is refused');
    assert.ok(!state.root.querySelector('[data-check-count-test]'), 'a summed check has no test');
    await state.act((root) => choose(root, 'data-check-product-option', 'count'));
    assert.ok(!state.root.querySelector('[data-check-progressive-refusal]'), 'count/under is valid');
    assert.ok(state.root.querySelector('[data-check-count-fields]'));
    assert.deepEqual(texts(state.root, '[data-check-count-test-option]'), ['At or under', 'Under']);
    await state.act((root) => choose(root, 'data-check-count-test-option', 'exceed'));
    assert.equal(state.value.thresholdMode, 'exceed');
    assert.match(state.root.querySelector('[data-check-direction-note]').textContent, /rolls under its/);
    assert.ok(!state.root.querySelector('[data-check-difficulty-card]'), 'no Difficulty card');
    await state.act((root) => choose(root, 'data-check-product-option', 'sum'));
    assert.ok(!state.root.querySelector('[data-check-count-test]'));
    assert.deepEqual(state.value, { ...start, thresholdMode: 'exceed' });
  });
});

describe('the input modes follow the stored record', () => {
  before(() => simpleHarness.setup());
  after(() => simpleHarness.teardown());
  afterEach(() => simpleHarness.remount());

  it('a stored value the field did not write, as a Discard restores, drops the session view', async () => {
    const start = simpleCheck(evaluation());
    const state = await mountControlled(simpleHarness, start);
    await state.act((root) => choose(root, 'data-check-count-base-mode-option', 'number'));
    await state.act((root) => typeInto(root.querySelector('[data-check-count-base]'), '4'));
    await simpleHarness.setProps({ value: start });
    assert.ok(
      state.root.querySelector('[data-check-count-base-mode-option="value"]').classList.contains('is-active'),
      'the restored expression reads Character value again'
    );
    assert.equal(state.root.querySelector('[data-check-count-base-expression]').value, AUTHORED_POOL.base);
  });
});
