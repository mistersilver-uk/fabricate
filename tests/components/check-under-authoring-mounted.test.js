/**
 * Issue 2005 — the Studio authors a summed check in either direction. Every control on the Formula,
 * Difficulty, recipe-tier and outcome cards is driven through its real element, and each switch is
 * proved lossless by a round trip back to the starting record (Q13).
 */
import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';

import { normalizeCheckEvaluation } from '../../src/systems/normalize/checkEvaluation.js';
import {
  CHECK_EDITOR_COMPILED_MODULES,
  CHECK_EDITOR_RAW_MODULES,
} from '../helpers/checksHarnessModules.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');

const routedHarness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-check-under-routed-',
  rawModules: CHECK_EDITOR_RAW_MODULES,
  compiledModules: CHECK_EDITOR_COMPILED_MODULES,
  componentPath: 'src/ui/svelte/apps/manager/checks/CraftingCheckEditor.svelte',
});

const simpleHarness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-check-under-simple-',
  rawModules: CHECK_EDITOR_RAW_MODULES,
  compiledModules: CHECK_EDITOR_COMPILED_MODULES,
  componentPath: 'src/ui/svelte/apps/manager/checks/SimpleCraftingCheckEditor.svelte',
});

const IDRIN = Object.freeze({ name: 'Idrin', rollData: { skills: { craft: { value: 55 } } } });

const evaluation = (overrides = {}, target = {}) =>
  normalizeCheckEvaluation({
    product: 'sum',
    direction: 'under',
    ...overrides,
    target: {
      source: 'attribute',
      expression: '@skills.craft.value',
      adjustmentKind: 'multiply',
      baseAdjustment: null,
      ...target,
    },
  });

/** Every inactive field is populated, so a switch that clears one is visible in the round trip. */
function routedCheck(evaluationRecord = evaluation()) {
  return {
    type: 'relative',
    rollFormula: '1d100',
    dc: 12,
    thresholdMode: 'meet',
    dcMode: 'static',
    macroUuid: null,
    tiers: [
      { id: 't-hard', name: 'Hard work', dc: 18, adjustment: -2, successes: null },
      { id: 't-unset', name: 'Plain work', dc: 9, adjustment: null, successes: null },
    ],
    relativeOutcomes: [
      { id: 'extreme', name: 'Extreme', success: true, breakTools: false, dc: 5, adjustment: 0.2 },
      { id: 'hard', name: 'Hard', success: true, breakTools: false, dc: 3, adjustment: 0.5 },
      { id: 'regular', name: 'Regular', success: true, breakTools: false, dc: 0, adjustment: 1 },
      { id: 'other', name: 'Otherwise', success: false, breakTools: false, dc: -4, adjustment: null },
    ],
    fixedOutcomes: [{ id: 'f1', name: 'Low', start: 1, end: 50, success: false }],
    checkBreakage: { triggers: [] },
    evaluation: evaluationRecord,
    offerSituationalBonus: true,
  };
}

/** A controlled mount: every emission is fed back as the next `value`, as the route model does. */
async function mountControlled(harness, value, props = {}) {
  const state = { value, emitted: [] };
  const root = await harness.mount({
    value,
    section: '',
    ...props,
    onChange: (next) => {
      state.value = next;
      state.emitted.push(next);
    },
  });
  state.root = root;
  state.act = async (fn) => {
    fn(root);
    await harness.setProps({ value: state.value });
  };
  return state;
}

function choose(root, attr, value) {
  const radio = root.querySelector(`[${attr}="${value}"] input[type="radio"]`);
  assert.ok(radio, `a radio exists for ${attr}="${value}"`);
  radio.checked = true;
  radio.dispatchEvent(new globalThis.Event('change', { bubbles: true }));
}

/** Type into a formatted Stepper and commit with Enter, as a GM does. */
function typeFormatted(input, text) {
  assert.ok(input, 'the formatted input exists');
  input.value = text;
  input.dispatchEvent(
    new globalThis.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
  );
}

function bandList(root, strip) {
  const group = root.querySelector(`[${strip}] [aria-describedby]`);
  assert.ok(group, 'the read-only strip is described by its band list');
  const list = root.querySelector(`#${group.getAttribute('aria-describedby')}`);
  return [...list.querySelectorAll('li')].map((item) => item.textContent.trim());
}

describe('the routed editor authors an under check losslessly (Q13)', () => {
  before(() => routedHarness.setup());
  after(() => routedHarness.teardown());
  afterEach(() => routedHarness.remount());

  const mount = (value = routedCheck(), props = {}) =>
    mountControlled(routedHarness, value, { previewCharacter: IDRIN, ...props });

  it('switches direction and back without touching anything else', async () => {
    const start = routedCheck();
    const state = await mount(start);
    await state.act((root) => choose(root, 'data-check-direction-option', 'over'));
    assert.deepEqual(state.value, {
      ...start,
      evaluation: { ...start.evaluation, direction: 'over' },
    });
    await state.act((root) => choose(root, 'data-check-direction-option', 'under'));
    assert.deepEqual(state.value, start);
  });

  it('switches the target source and back, keeping the DC, expression and adjustments', async () => {
    const start = routedCheck();
    const state = await mount(start);
    await state.act((root) => choose(root, 'data-check-target-source-option', 'fixed'));
    assert.equal(state.value.evaluation.target.source, 'fixed');
    assert.equal(state.root.querySelector('[data-check-dc]').value, '12', 'the kept DC is shown');
    assert.ok(state.root.querySelector('[data-tier-dc]'), 'tiers edit their DC under a fixed target');
    await state.act((root) => choose(root, 'data-check-target-source-option', 'attribute'));
    assert.deepEqual(state.value, start);
  });

  it('switches the adjustment kind and back, reading kept values through each kind', async () => {
    const start = routedCheck();
    const state = await mount(start);
    await state.act((root) => choose(root, 'data-check-adjustment-kind-option', 'add'));
    const extreme = state.root.querySelector('[data-outcome-row="extreme"] [data-outcome-dc]');
    assert.equal(extreme.value, '5', 'an added check edits the kept benefit offset');
    assert.equal(
      state.root.querySelector('[data-tier-row="t-hard"] [data-tier-adjustment]').value,
      '−2'
    );
    await state.act((root) => choose(root, 'data-check-adjustment-kind-option', 'multiply'));
    assert.deepEqual(state.value, start);
  });

  it('labels the comparison for the direction and writes strictness', async () => {
    const state = await mount();
    const label = (value) =>
      state.root.querySelector(`[data-threshold-mode-option="${value}"]`).textContent.trim();
    assert.deepEqual([label('meet'), label('exceed')], ['At or under', 'Strictly under']);
    await state.act((root) => choose(root, 'data-threshold-mode-option', 'exceed'));
    assert.equal(state.value.thresholdMode, 'exceed');
    assert.equal(
      state.root.querySelector('[data-check-formula-comparison]').textContent.trim(),
      'under',
      'a strict comparison is the plain word, never "strictly"'
    );
  });

  it('edits the character value and shows what it resolves to for the Preview-as actor', async () => {
    const state = await mount();
    assert.equal(
      state.root.querySelector('[data-check-target-resolution]').textContent.trim(),
      'Idrin → 55'
    );
    await state.act((root) => {
      const input = root.querySelector('[data-check-target-expression]');
      input.value = '@skills.lore.value';
      input.dispatchEvent(new globalThis.Event('input', { bubbles: true }));
    });
    assert.equal(state.value.evaluation.target.expression, '@skills.lore.value');
    assert.equal(
      state.root.querySelector('[data-check-target-resolution]').dataset.checkTargetResolution,
      'unresolved'
    );
  });

  it('types a base adjustment through its label', async () => {
    const state = await mount();
    await state.act((root) => typeFormatted(root.querySelector('[data-check-base-adjustment]'), '1/3'));
    assert.ok(Math.abs(state.value.evaluation.target.baseAdjustment - 1 / 3) < 1e-9);
    assert.equal(state.root.querySelector('[data-check-base-adjustment]').value, '×⅓');
  });

  it('sets a missing recipe-tier adjustment', async () => {
    const state = await mount();
    const row = () => state.root.querySelector('[data-tier-row="t-unset"]');
    assert.ok(row().querySelector('[data-tier-adjustment-missing]'), 'the gap is named');
    await state.act(() => typeFormatted(row().querySelector('[data-tier-adjustment]'), '½'));
    assert.equal(state.value.tiers[1].adjustment, 0.5);
    assert.equal(state.value.tiers[1].dc, 9, 'the kept DC is untouched');
    assert.ok(!row().querySelector('[data-tier-adjustment-missing]'));
  });

  it('reads a null multiplier as Otherwise and never adds a second one', async () => {
    const state = await mount();
    const input = (id) => state.root.querySelector(`[data-outcome-row="${id}"] [data-outcome-adjustment]`);
    assert.equal(input('extreme').value, '×⅕');
    assert.equal(input('other').value, 'Otherwise');
    assert.ok(!input('other').hasAttribute('aria-valuenow'));
    await state.act(() =>
      state.root.querySelector('[data-outcome-row="hard"] [data-stepper-decrement]').click()
    );
    assert.ok(Math.abs(state.value.relativeOutcomes[1].adjustment - 1 / 3) < 1e-9);
    await state.act((root) => root.querySelector('[data-add-outcome-tier]').click());
    const added = state.value.relativeOutcomes.at(-1);
    assert.equal(added.adjustment, 1, 'a new row is ×1');
    assert.equal(
      state.value.relativeOutcomes.filter((outcome) => outcome.adjustment == null).length,
      1,
      'exactly one Otherwise'
    );
  });

  it('offers the situational bonus and writes the offer', async () => {
    const state = await mount();
    const toggle = () => state.root.querySelector('[data-check-offer-situational-bonus]');
    assert.equal(toggle().getAttribute('aria-pressed'), 'true');
    await state.act(() => toggle().click());
    assert.equal(state.value.offerSituationalBonus, false);
    assert.equal(toggle().getAttribute('aria-pressed'), 'false');
    assert.match(
      state.root.querySelector('[data-check-prompt-options]').textContent,
      /The prompt shows no bonus field\./
    );
    assert.deepEqual(state.value.evaluation, routedCheck().evaluation, 'the offer is its own field');
  });

  it('draws the ladder as a read-only picture with a described band list', async () => {
    const state = await mount();
    const strip = state.root.querySelector('[data-outcome-band-strip]');
    assert.ok(!strip.querySelector('[role="slider"]'), 'no handle on a read-only strip');
    assert.deepEqual(bandList(state.root, 'data-outcome-band-strip'), [
      'Extreme: 11 or under',
      'Hard: 12–27',
      'Regular: 28–55',
      'Otherwise: 56 or over',
    ]);
    assert.ok(!state.root.querySelector('[data-outcome-band-strip-hint]'), 'no drag hint');
    assert.equal(
      state.root.querySelector('[data-outcome-band-scale]').textContent.trim(),
      'Target 55 (Idrin 55). Success sits at the low end: a total at or under 55 succeeds.'
    );
  });

  it('charts nothing for a character value with no Preview-as actor', async () => {
    const state = await mount(routedCheck(), { previewCharacter: null });
    assert.match(state.root.querySelector('[data-outcome-bands]').textContent, /Choose a character/);
    assert.ok(!state.root.querySelector('[data-outcome-band-scale]'));
    assert.equal(
      state.root.querySelector('[data-check-target-resolution]').dataset.checkTargetResolution,
      'muted'
    );
  });

  it('keeps a roll-over fixed check on its draggable strip and roll-over copy', async () => {
    const start = { ...routedCheck(normalizeCheckEvaluation()) };
    const state = await mount(start, {
      appliedModifiers: [
        { id: 'm1', name: 'Dex', icon: '' },
        { id: 'm2', name: 'Int', icon: '' },
      ],
    });
    const root = state.root;
    assert.ok(root.querySelector('[data-outcome-band-strip] [role="slider"]'), 'handles stay');
    assert.ok(root.querySelector('[data-outcome-band-strip-hint]'));
    assert.ok(!root.querySelector('[data-check-direction-note]'));
    assert.ok(!root.querySelector('[data-check-formula-target]'));
    assert.equal(
      root.querySelector('[data-outcome-row="extreme"] [data-outcome-dc]').getAttribute('aria-label'),
      'DC ±'
    );
    assert.equal(
      root.querySelector('.manager-checks-formula-join').textContent.trim(),
      '+',
      'roll-over modifiers still join the dice'
    );
  });
});

describe('the simple editor draws an under target read-only', () => {
  before(() => simpleHarness.setup());
  after(() => simpleHarness.teardown());
  afterEach(() => simpleHarness.remount());

  const simple = (evaluationRecord) => ({
    rollFormula: '1d20',
    dc: 12,
    thresholdMode: 'meet',
    dcMode: 'static',
    tiers: [],
    macroUuid: null,
    checkBreakage: { triggers: [] },
    evaluation: evaluationRecord,
  });

  it('pictures an inclusive fixed under target and states it', async () => {
    const underFixed = evaluation({}, { source: 'fixed' });
    const state = await mountControlled(simpleHarness, simple(underFixed));
    assert.ok(!state.root.querySelector('[data-simple-band-strip] [role="slider"]'));
    assert.deepEqual(bandList(state.root, 'data-simple-band-strip'), [
      'Success: 12 or under',
      'Failure: 13 or over',
    ]);
    assert.ok(!state.root.querySelector('[data-simple-band-strip-hint]'));
    assert.equal(
      state.root.querySelector('[data-simple-band-scale]').textContent.trim(),
      'Target 12. Success sits at the low end: a total at or under 12 succeeds.'
    );
    assert.equal(state.root.querySelector('[data-check-formula-target]').textContent.trim(), 'Target 12');
  });

  it('keeps the roll-over fixed strip draggable', async () => {
    const state = await mountControlled(simpleHarness, simple(normalizeCheckEvaluation()));
    assert.ok(state.root.querySelector('[data-simple-band-strip] [role="slider"]'));
    assert.ok(state.root.querySelector('[data-simple-band-strip-hint]'));
  });
});
