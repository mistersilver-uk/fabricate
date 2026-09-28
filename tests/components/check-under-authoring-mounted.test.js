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
import { chooseSelectOption } from '../helpers/select-control.js';
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

const progressiveHarness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-check-under-progressive-',
  rawModules: CHECK_EDITOR_RAW_MODULES,
  compiledModules: CHECK_EDITOR_COMPILED_MODULES,
  componentPath: 'src/ui/svelte/apps/manager/checks/ProgressiveCraftingCheckEditor.svelte',
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

/** A record whose base adjustment is set, so a switch that resets it is visible. */
const BASE_HALF = evaluation({}, { baseAdjustment: 0.5 });

/** Fields a switch could reset, each held off its default so a reset is visible. */
const KEPT_FIELDS = Object.freeze({
  thresholdMode: 'exceed',
  dcMode: 'dynamic',
  macroUuid: 'Macro.keep',
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
    fixedOutcomes: [
      { id: 'f1', name: 'Low', start: 1, end: 50, success: true },
      { id: 'f2', name: 'High', start: 51, end: 100, success: false },
    ],
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
    const start = { ...routedCheck(BASE_HALF), ...KEPT_FIELDS };
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
    const start = { ...routedCheck(BASE_HALF), ...KEPT_FIELDS };
    const state = await mount(start);
    await state.act((root) => choose(root, 'data-check-target-source-option', 'fixed'));
    assert.equal(state.value.evaluation.target.source, 'fixed');
    assert.equal(state.root.querySelector('[data-check-dc]').value, '12', 'the kept DC is shown');
    assert.ok(state.root.querySelector('[data-tier-dc]'), 'tiers edit their DC under a fixed target');
    await state.act((root) => choose(root, 'data-check-target-source-option', 'attribute'));
    assert.deepEqual(state.value, start);
  });

  it('switches the adjustment kind and back, reading kept values through each kind', async () => {
    const start = { ...routedCheck(BASE_HALF), ...KEPT_FIELDS };
    const state = await mount(start);
    await state.act((root) => choose(root, 'data-check-adjustment-kind-option', 'add'));
    const extreme = state.root.querySelector('[data-outcome-row="extreme"] [data-outcome-dc]');
    assert.equal(extreme.value, '+5', 'an added check edits the kept benefit offset, signed');
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
    assert.equal(bandList(state.root, 'data-outcome-band-strip')[0], 'Extreme: 10 or under');
    assert.match(
      state.root.querySelector('[data-outcome-band-scale]').textContent,
      /a total under 55 succeeds\.$/
    );
  });

  it('draws the strip against the previewed recipe tier and names its adjustment', async () => {
    const underAdd = evaluation({}, { adjustmentKind: 'add' });
    const state = await mount(routedCheck(underAdd));
    chooseSelectOption(state.root, '[data-preview-against-select]', 't-hard');
    await routedHarness.setProps({ value: state.value });
    assert.equal(
      state.root.querySelector('[data-outcome-band-scale]').textContent.trim(),
      'Target 53 (Idrin 55, Hard work −2). Success sits at the low end: a total at or under 53 succeeds.'
    );
  });

  it('switches the check type to fixed and back without touching the evaluation', async () => {
    const start = routedCheck(BASE_HALF);
    const state = await mount(start);
    await state.act((root) => choose(root, 'data-check-type-option', 'fixed'));
    assert.ok(state.root.querySelector('[data-outcome-row="f1"] [data-outcome-start]'));
    await state.act((root) => choose(root, 'data-check-type-option', 'relative'));
    assert.deepEqual(state.value, start);
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
    const line = state.root.querySelector('[data-check-target-resolution]');
    assert.equal(line.dataset.checkTargetResolution, 'unresolved');
    assert.equal(
      line.textContent.trim(),
      'Idrin has no value at @skills.lore.value. The check cannot resolve for them.'
    );
    assert.ok(!line.hasAttribute('aria-live'), 'the line is not announced per keystroke');
    const described = state.root
      .querySelector('[data-check-target-expression]')
      .getAttribute('aria-describedby')
      .split(' ');
    assert.ok(described.includes(line.id), 'the field is described by its resolution line');
  });

  it('states each refusal the character value meets in its own words', async () => {
    const cases = [
      ['@skills.craft.value + @skills.nope.mod', 'Idrin has no value at @skills.nope.mod.'],
      ['1d4 + 10', 'This check cannot roll: its target formula rolls dice'],
    ];
    for (const [expression, opening] of cases) {
      routedHarness.remount();
      const state = await mount(routedCheck(evaluation({}, { expression })));
      const line = state.root.querySelector('[data-check-target-resolution]');
      assert.ok(line.textContent.trim().startsWith(opening), line.textContent);
    }
  });

  it('shows a blank character value as the Character value chip with no status line', async () => {
    const state = await mount(routedCheck(evaluation({}, { expression: '' })), {
      appliedModifiers: [{ id: 'm1', name: 'Rune lore', icon: '' }],
    });
    const inset = [
      ...state.root.querySelector('.manager-checks-formula-expression').children,
    ].map((node) => node.textContent.trim());
    assert.deepEqual(inset, ['1d100', 'at or under', 'Character value', '+', 'Rune lore']);
    assert.ok(!state.root.querySelector('[data-check-target-resolution]'));
    assert.match(
      state.root.querySelector('[data-outcome-bands]').textContent,
      /This check cannot roll: no target formula is set\./
    );
  });

  it('steps an unset base adjustment from its first value, with no number as its placeholder', async () => {
    const state = await mount();
    const field = () => state.root.querySelector('[data-check-base-adjustment]');
    const button = (edge) =>
      state.root.querySelector(`.manager-checks-difficulty-field.is-dc [data-stepper-${edge}]`);
    assert.equal(field().getAttribute('placeholder'), '—');
    await state.act(() => button('increment').click());
    assert.equal(state.value.evaluation.target.baseAdjustment, 0.2);
    assert.equal(field().value, '×⅕');

    routedHarness.remount();
    const added = await mount(routedCheck(evaluation({}, { adjustmentKind: 'add' })));
    const addButton = (edge) =>
      added.root.querySelector(`.manager-checks-difficulty-field.is-dc [data-stepper-${edge}]`);
    await added.act(() => addButton('decrement').click());
    await added.act(() => addButton('decrement').click());
    assert.equal(added.value.evaluation.target.baseAdjustment, -1);
    assert.equal(added.root.querySelector('[data-check-base-adjustment]').value, '−1');
  });

  it('names both option groups on the Difficulty card', async () => {
    const legends = (root) =>
      [...root.querySelectorAll('[data-check-difficulty-card] legend')].map((legend) =>
        legend.textContent.trim()
      );
    const state = await mount();
    assert.deepEqual(legends(state.root), ['What the roll is measured against', 'How the adjustment is set']);
    assert.ok(
      [...state.root.querySelectorAll('[data-check-difficulty-card] fieldset')].every((group) =>
        group.classList.contains('is-legend-visible')
      ),
      'both names are on screen'
    );
    await state.act((root) => choose(root, 'data-check-target-source-option', 'fixed'));
    assert.deepEqual(legends(state.root), ['What the roll is measured against', 'How the number is set']);
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
    const missing = row().querySelector('[data-tier-adjustment-missing]');
    assert.ok(missing, 'the gap is named');
    const units = [...row().querySelectorAll('.manager-checks-tier-unit')];
    assert.ok(units.indexOf(missing) < units.length - 1, 'the gap is named before the unit');
    assert.equal(
      row().querySelector('[data-tier-adjustment]').getAttribute('aria-describedby'),
      missing.id
    );
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

  it('takes a typed Otherwise as the null endpoint', async () => {
    const state = await mount();
    await state.act((root) =>
      typeFormatted(root.querySelector('[data-outcome-row="hard"] [data-outcome-adjustment]'), 'Otherwise')
    );
    assert.equal(state.value.relativeOutcomes[1].adjustment, null);
  });

  it('labels the multiplier column and explains a ladder with nothing to draw', async () => {
    const allOtherwise = routedCheck();
    allOtherwise.relativeOutcomes = allOtherwise.relativeOutcomes.map((outcome) => ({
      ...outcome,
      adjustment: null,
    }));
    const state = await mount(allOtherwise);
    assert.equal(
      state.root.querySelector('[data-outcome-head] .is-threshold').textContent.trim(),
      'Adjustment'
    );
    assert.match(
      state.root.querySelector('[data-outcome-bands]').textContent,
      /Give every tier but one a multiplier to draw the bands; the tier without one is Otherwise\./
    );
    assert.doesNotMatch(state.root.querySelector('[data-outcome-bands]').textContent, /gap or overlap/);
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
    const scale = state.root.querySelector('[data-outcome-band-scale]');
    assert.equal(
      scale.textContent.trim(),
      'Target 55 (Idrin 55). Success sits at the low end: a total at or under 55 succeeds.'
    );
    assert.ok(scale.classList.contains('manager-checks-card-description'), 'the card leads with it');
    assert.doesNotMatch(state.root.querySelector('[data-outcome-bands]').textContent, /Transition points/);
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

  it('keyboard-steps a multiplier and the read-only strip redraws from it', async () => {
    const state = await mount();
    await state.act((root) => {
      const input = root.querySelector('[data-outcome-row="hard"] [data-outcome-adjustment]');
      input.dispatchEvent(
        new globalThis.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true })
      );
    });
    assert.ok(Math.abs(state.value.relativeOutcomes[1].adjustment - 1 / 3) < 1e-9);
    assert.deepEqual(bandList(state.root, 'data-outcome-band-strip').slice(0, 2), [
      'Extreme: 11 or under',
      'Hard: 12–18',
    ]);
  });

  it('chooses a macro-adjusted target and keeps the linked macro', async () => {
    const state = await mount({ ...routedCheck(), macroUuid: 'Macro.adjust' });
    const option = state.root.querySelector('[data-dc-mode-option="dynamic"]');
    assert.match(option.textContent, /returns the one to roll under/);
    await state.act((root) => choose(root, 'data-dc-mode-option', 'dynamic'));
    assert.equal(state.value.dcMode, 'dynamic');
    assert.equal(state.value.macroUuid, 'Macro.adjust');
    assert.match(
      state.root.querySelector('[data-dynamic-dc]').textContent,
      /target already computed from the character value, and must return the target to roll under/
    );
  });

  it('adds a recipe tier that asks for its adjustment and keeps an off-list multiplier exact', async () => {
    const state = await mount({ ...routedCheck(), tiers: [] });
    assert.ok(state.root.querySelector('[data-tiers-empty]'));
    await state.act((root) => root.querySelector('[data-add-tier]').click());
    const row = () => state.root.querySelector('[data-tier-row]');
    assert.ok(row().querySelector('[data-tier-adjustment-missing]'));
    await state.act(() => typeFormatted(row().querySelector('[data-tier-adjustment]'), '0.7'));
    assert.equal(state.value.tiers[0].adjustment, 0.7);
    assert.equal(row().querySelector('[data-tier-adjustment]').value, '\u00d70.7');
  });

  it('pictures a roll-over character value at the high end with benefit offsets', async () => {
    const overAdd = evaluation({ direction: 'over' }, { adjustmentKind: 'add', baseAdjustment: -5 });
    const state = await mount(routedCheck(overAdd));
    assert.equal(
      state.root
        .querySelector('[data-outcome-row="extreme"] [data-outcome-dc]')
        .getAttribute('aria-label'),
      'Benefit ±'
    );
    assert.equal(
      state.root.querySelector('[data-outcome-head] .is-threshold').textContent.trim(),
      'Benefit ±',
      'the column is named on screen'
    );
    assert.match(
      state.root.querySelector('[data-outcome-band-scale]').textContent,
      /^Target 50 \(Idrin 55, base −5\)\. Success sits at the high end: a total of 50 or more succeeds\.$/
    );
    assert.ok(!state.root.querySelector('[data-outcome-band-strip] [role="slider"]'));
  });

  it('keeps range controls on a fixed-type under check and draws its ranges read-only', async () => {
    const state = await mount({ ...routedCheck(evaluation({}, { source: 'fixed' })), type: 'fixed' });
    assert.ok(state.root.querySelector('[data-outcome-row="f1"] [data-outcome-start]'));
    assert.ok(!state.root.querySelector('[data-outcome-band-strip] [role="slider"]'));
    assert.deepEqual(bandList(state.root, 'data-outcome-band-strip'), [
      'Low: 50 or under',
      'High: 51 or over',
    ]);
  });

  it('authors a gathering-style routed check with no recipe tiers', async () => {
    const underAdd = evaluation({}, { adjustmentKind: 'add', baseAdjustment: -2 });
    const state = await mount(routedCheck(underAdd), { showTiers: false });
    assert.ok(!state.root.querySelector('[data-routed-tiers]'));
    assert.equal(state.root.querySelector('[data-check-base-adjustment]').value, '\u22122');
    await state.act((root) => choose(root, 'data-check-direction-option', 'over'));
    assert.equal(state.value.evaluation.target.baseAdjustment, -2);
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
    assert.ok(!root.querySelector('[data-outcome-row="extreme"] .manager-checks-tier-unit'));
  });

  it('draws a count record read-only, as the runtime grades it (issue 2004), and keeps it on write', async () => {
    const count = { ...evaluation(), product: 'count' };
    const state = await mount(routedCheck(count));
    assert.ok(state.root.querySelector('[data-outcome-band-strip]'), 'the strip still draws');
    assert.ok(!state.root.querySelector('[data-outcome-band-strip] [role="slider"]'), 'no handles');
    assert.ok(!state.root.querySelector('[data-outcome-row="extreme"] [data-outcome-dc]'), 'no DC field');
    await state.act((root) => choose(root, 'data-check-direction-option', 'over'));
    assert.equal(state.value.evaluation.product, 'count', 'writes keep the authored product');
  });

  it('gives an absolute-range roll-under check no target and draws its ranges as authored', async () => {
    const state = await mount(
      { ...routedCheck(), type: 'fixed' },
      {
        resolutionMode: 'routedByCheck',
        previewCharacter: null,
        appliedModifiers: [{ id: 'm1', name: 'Rune lore', icon: '' }],
      }
    );
    assert.ok(!state.root.querySelector('[data-check-formula-target]'), 'no target chip');
    assert.ok(!state.root.querySelector('[data-check-formula-comparison]'));
    assert.deepEqual(bandList(state.root, 'data-outcome-band-strip'), [
      'Low: 50 or under',
      'High: 51 or over',
    ]);
    assert.doesNotMatch(state.root.querySelector('[data-outcome-bands]').textContent, /Choose a character/);

    routedHarness.remount();
    const read = await mount({ ...routedCheck(), type: 'fixed' }, { resolutionMode: 'routedByCheck' });
    assert.ok(!read.root.querySelector('[data-outcome-band-scale]'), 'no target sentence for a chosen actor');
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

  it('authors a salvage-style character value with no DC source and no recipe tiers', async () => {
    const underAdd = evaluation({}, { adjustmentKind: 'add', expression: '14', baseAdjustment: null });
    const state = await mountControlled(simpleHarness, simple(underAdd), {
      showDcSource: false,
      previewCharacter: null,
    });
    assert.ok(!state.root.querySelector('[data-dc-mode-option]'), 'no DC source chooser');
    assert.ok(!state.root.querySelector('[data-static-dc]'), 'no recipe tiers');
    await state.act((root) =>
      typeFormatted(root.querySelector('[data-check-base-adjustment]'), '\u22122')
    );
    assert.equal(state.value.evaluation.target.baseAdjustment, -2);
    assert.deepEqual(bandList(state.root, 'data-simple-band-strip'), [
      'Success: 12 or under',
      'Failure: 13 or over',
    ]);
    assert.equal(
      state.root.querySelector('[data-simple-band-scale]').textContent.trim(),
      'Target 12. Success sits at the low end: a total at or under 12 succeeds.'
    );
  });

  it('keeps the roll-over fixed strip draggable', async () => {
    const state = await mountControlled(simpleHarness, simple(normalizeCheckEvaluation()));
    assert.ok(state.root.querySelector('[data-simple-band-strip] [role="slider"]'));
    assert.ok(state.root.querySelector('[data-simple-band-strip-hint]'));
  });

  /** Every inactive field populated and every resettable field off its default. */
  const kept = (evaluationRecord) => ({
    ...simple(evaluationRecord),
    ...KEPT_FIELDS,
    tiers: [{ id: 't', name: 'Hard', dc: 9, adjustment: -2 }],
    offerSituationalBonus: true,
  });

  it('switches direction, source and kind and back without touching anything else', async () => {
    const start = kept(BASE_HALF);
    const state = await mountControlled(simpleHarness, start, { previewCharacter: IDRIN });
    for (const [attr, away, back] of [
      ['data-check-direction-option', 'over', 'under'],
      ['data-check-target-source-option', 'fixed', 'attribute'],
      ['data-check-adjustment-kind-option', 'add', 'multiply'],
    ]) {
      await state.act((root) => choose(root, attr, away));
      await state.act((root) => choose(root, attr, back));
      assert.deepEqual(state.value, start, `${attr} round trip`);
    }
  });

  it('edits recipe-tier adjustments and reads the character for the Preview-as actor', async () => {
    const underAdd = evaluation({}, { adjustmentKind: 'add' });
    const state = await mountControlled(simpleHarness, kept(underAdd), { previewCharacter: IDRIN });
    assert.equal(state.root.querySelector('[data-tier-row="t"] [data-tier-adjustment]').value, '−2');
    assert.equal(
      state.root.querySelector('[data-check-target-resolution]').textContent.trim(),
      'Idrin → 55'
    );
  });

  it('draws the previewed record: its DC under a fixed target, its adjustment under a character value', async () => {
    const underFixed = evaluation({}, { source: 'fixed' });
    const fixed = await mountControlled(simpleHarness, { ...kept(underFixed), thresholdMode: 'meet' }, {
      previewRecordId: 't',
    });
    assert.match(fixed.root.querySelector('[data-simple-band-scale]').textContent, /^Target 9\./);
    simpleHarness.remount();
    const underAdd = evaluation({}, { adjustmentKind: 'add' });
    const read = await mountControlled(simpleHarness, { ...kept(underAdd), thresholdMode: 'meet' }, {
      previewRecordId: 't',
      previewCharacter: IDRIN,
    });
    assert.match(
      read.root.querySelector('[data-simple-band-scale]').textContent,
      /^Target 53 \(Idrin 55, Hard −2\)\./
    );
  });

  it('carries strictness to the strip, its sentence and the inset', async () => {
    const underFixed = evaluation({}, { source: 'fixed' });
    const state = await mountControlled(simpleHarness, simple(underFixed));
    await state.act((root) => choose(root, 'data-threshold-mode-option', 'exceed'));
    assert.deepEqual(bandList(state.root, 'data-simple-band-strip'), [
      'Success: 11 or under',
      'Failure: 12 or over',
    ]);
    assert.equal(
      state.root.querySelector('[data-simple-band-scale]').textContent.trim(),
      'Target 12. Success sits at the low end: a total under 12 succeeds.'
    );
    assert.equal(
      state.root.querySelector('[data-check-formula-comparison]').textContent.trim(),
      'under'
    );
  });

  it('writes the situational-bonus offer', async () => {
    const state = await mountControlled(simpleHarness, kept(BASE_HALF));
    const toggle = () => state.root.querySelector('[data-check-offer-situational-bonus]');
    await state.act(() => toggle().click());
    assert.equal(state.value.offerSituationalBonus, false);
    assert.equal(toggle().getAttribute('aria-pressed'), 'false');
  });

  it('keeps every read-only band on its track when the target leaves the DC window', async () => {
    const underAdd = evaluation({}, { adjustmentKind: 'add' });
    const state = await mountControlled(simpleHarness, simple(underAdd), { previewCharacter: IDRIN });
    const bands = [...state.root.querySelectorAll('[data-simple-band-strip] [data-band-strip-band]')];
    assert.equal(bands.length, 2);
    for (const band of bands) {
      const style = band.getAttribute('style');
      const left = Number(/left:\s*(-?[\d.]+)%/.exec(style)[1]);
      const width = Number(/width:\s*(-?[\d.]+)%/.exec(style)[1]);
      assert.ok(left >= 0 && left + width <= 100.0001, `${band.dataset.bandStripBand}: ${style}`);
    }
  });
});

describe('a progressive check offers the axis and prompt group but no Difficulty editor', () => {
  before(() => progressiveHarness.setup());
  after(() => progressiveHarness.teardown());
  afterEach(() => progressiveHarness.remount());

  it('switches direction and back, keeping the inactive target data', async () => {
    const start = {
      awardMode: 'equal',
      rollFormula: '1d20',
      checkBreakage: { triggers: [] },
      evaluation: evaluation({ direction: 'over' }, { baseAdjustment: -2 }),
    };
    const state = await mountControlled(progressiveHarness, start);
    assert.ok(state.root.querySelector('[data-check-direction]'));
    assert.ok(state.root.querySelector('[data-check-prompt-options]'));
    assert.ok(!state.root.querySelector('[data-check-difficulty-card]'), 'no inert Difficulty editor');
    await state.act((root) => choose(root, 'data-check-direction-option', 'under'));
    await state.act((root) => choose(root, 'data-check-direction-option', 'over'));
    assert.deepEqual(state.value, start);
  });

  it('warns that the runtime refuses a roll-under progressive check, and drops the under note', async () => {
    const start = {
      awardMode: 'equal',
      rollFormula: '1d20',
      checkBreakage: { triggers: [] },
      evaluation: evaluation({ direction: 'over' }),
    };
    const state = await mountControlled(progressiveHarness, start);
    assert.ok(!state.root.querySelector('[data-check-progressive-refusal]'));
    await state.act((root) => choose(root, 'data-check-direction-option', 'under'));
    const notice = state.root.querySelector('[data-check-progressive-refusal]');
    assert.equal(notice?.dataset.noticeTone, 'warning');
    assert.equal(
      notice.textContent.trim(),
      'This check cannot roll: a progressive check cannot roll under a target.'
    );
    assert.ok(!state.root.querySelector('[data-check-direction-note]'));
  });

  it('writes the situational-bonus offer', async () => {
    const state = await mountControlled(progressiveHarness, {
      awardMode: 'equal',
      rollFormula: '1d20',
      checkBreakage: { triggers: [] },
      offerSituationalBonus: true,
    });
    const toggle = () => state.root.querySelector('[data-check-offer-situational-bonus]');
    await state.act(() => toggle().click());
    assert.equal(state.value.offerSituationalBonus, false);
    assert.equal(toggle().getAttribute('aria-pressed'), 'false');
  });
});
