/**
 * Issue 2006 — a counting check's Difficulty card, recipe-tier successes, `Extra successes` outcome
 * rows and read-only count strips, composed in the real editors. Each control is acted on through
 * its element, and each composed reading is compared with the model or readiness it must share.
 */
import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';

import { normalizeCheckEvaluation } from '../../src/systems/normalize/checkEvaluation.js';
import { checkIssueSentence } from '../../src/ui/svelte/apps/manager/checks/checksCopy.js';
import { evaluateCheckReadiness } from '../../src/ui/svelte/apps/manager/checks/checksReadiness.js';
import {
  CHECK_EDITOR_COMPILED_MODULES,
  CHECK_EDITOR_RAW_MODULES,
} from '../helpers/checksHarnessModules.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');

const harnessFor = (component) =>
  createMountedComponentHarness({
    repoRoot,
    tmpPrefix: `fabricate-count-tiers-${component.toLowerCase()}-`,
    rawModules: CHECK_EDITOR_RAW_MODULES,
    compiledModules: CHECK_EDITOR_COMPILED_MODULES,
    componentPath: `src/ui/svelte/apps/manager/checks/${component}.svelte`,
  });

const routedHarness = harnessFor('CraftingCheckEditor');
const simpleHarness = harnessFor('SimpleCraftingCheckEditor');
const progressiveHarness = harnessFor('ProgressiveCraftingCheckEditor');

const english = (_key, text) => text;

/** Authored best first: the strip ranks by `required + dc`, never by list order. */
const FORGE = Object.freeze([
  { id: 'masterwork', name: 'Masterwork', success: true, breakTools: false, dc: 3 },
  { id: 'fine', name: 'Fine', success: true, breakTools: false, dc: 1 },
  { id: 'success', name: 'Success', success: true, breakTools: false, dc: 0 },
  { id: 'ruined', name: 'Ruined', success: false, breakTools: false, dc: -2 },
]);

const counting = (pool = {}) =>
  normalizeCheckEvaluation({
    product: 'count',
    // A kept multiply target, inert under a count: no row may edit a multiplier.
    target: { source: 'attribute', expression: '@a.b', adjustmentKind: 'multiply' },
    pool: {
      die: 10,
      base: '2',
      threshold: '8',
      required: 2,
      cancel: { enabled: true, faces: { kind: 'worst' } },
      ...pool,
    },
  });

const check = (pool = {}, rest = {}) => ({
  type: 'relative',
  rollFormula: '1d20',
  dc: 12,
  thresholdMode: 'meet',
  dcMode: 'static',
  tiers: [{ id: 't-plain', name: 'Plain work', dc: 12 }],
  relativeOutcomes: FORGE.map((outcome) => ({ ...outcome })),
  fixedOutcomes: [],
  evaluation: counting(pool),
  ...rest,
});

/** A controlled mount: every emission is fed back as the next `value`, as the route model does. */
async function mountControlled(harness, value, props = {}) {
  const state = { value, emitted: [] };
  state.root = await harness.mount({
    value,
    ...props,
    onChange: (next) => {
      state.value = next;
      state.emitted.push(next);
    },
  });
  state.act = async (fn) => {
    await fn(state.root);
    await harness.setProps({ value: state.value });
  };
  return state;
}

function increment(root, selector) {
  const input = root.querySelector(selector);
  assert.ok(Boolean(input), `${selector} exists`);
  input.closest('.fab-stepper').querySelectorAll('.fab-stepper-adjunct')[1].click();
}

const texts = (root, selector) =>
  [...root.querySelectorAll(selector)].map((node) => node.textContent.trim());

const calloutsOf = (root) =>
  [...root.querySelectorAll('[data-check-count-callout]')].map((node) => [
    node.getAttribute('data-check-count-callout'),
    node.textContent.trim(),
  ]);

/** Validation's ceiling rows for `value`, as the Difficulty card must state them. */
function validationCeiling(value, mode) {
  return evaluateCheckReadiness(value, { mode, activity: 'crafting' })
    .issues.filter((issue) => issue.id.startsWith('countRequiredExceeds'))
    .map((issue) => [issue.id, checkIssueSentence(issue.id, issue.data, english)]);
}

describe('the routed editor authors a counting check (issue 2006)', () => {
  before(() => routedHarness.setup());
  after(() => routedHarness.teardown());
  afterEach(() => routedHarness.remount());

  it('the tier Successes the GM steps reach the Difficulty card as Validation states them', async () => {
    const state = await mountControlled(routedHarness, check(), { section: 'roll' });
    assert.ok(!state.root.querySelector('[data-threshold-mode]'), 'N8: no Comparison while counting');
    assert.deepEqual(calloutsOf(state.root), [], 'the default 2 fits the base pool of 2');
    for (let step = 0; step < 3; step += 1) {
      await state.act((root) => increment(root, '[data-tier-successes]'));
    }
    assert.equal(state.value.tiers[0].successes, 3);
    assert.equal(state.value.tiers[0].dc, 12, 'the kept DC is untouched');
    const expected = validationCeiling(state.value, 'routed');
    assert.equal(expected.length, 1);
    assert.match(expected[0][1], /Plain work/);
    assert.deepEqual(calloutsOf(state.root), expected);

    await state.act((root) => increment(root, '[data-check-count-required]'));
    assert.equal(state.value.evaluation.pool.required, 3);
    assert.deepEqual(calloutsOf(state.root), validationCeiling(state.value, 'routed'));
  });

  it('outcome rows edit Extra successes, never a multiplier the kept target names', async () => {
    const state = await mountControlled(routedHarness, check(), { section: 'outcomes' });
    assert.ok(texts(state.root, '[data-outcome-head] span').includes('Extra successes'));
    assert.ok(!state.root.querySelector('[data-outcome-adjustment]'));
    const fine = state.root.querySelector('[data-outcome-row="fine"] [data-outcome-dc]');
    assert.equal(fine.getAttribute('aria-label'), 'Extra successes');
    assert.equal(fine.value, '+1');
    await state.act((root) => increment(root, '[data-outcome-row="fine"] [data-outcome-dc]'));
    assert.deepEqual(
      state.value.relativeOutcomes,
      FORGE.map((outcome) => (outcome.id === 'fine' ? { ...outcome, dc: 2 } : outcome))
    );
    await state.act((root) => root.querySelector('[data-add-outcome-tier]').click());
    const added = state.value.relativeOutcomes.at(-1);
    assert.equal(added.dc, 0, 'a new row starts at no extra successes');
    assert.ok(!Object.hasOwn(added, 'adjustment'), 'and carries no multiplier');
  });

  it('N11: draws the strip read-only in net successes, Botch first only while cancelling', async () => {
    const state = await mountControlled(routedHarness, check(), { section: 'outcomes' });
    assert.ok(!state.root.querySelector('[role="slider"]'), 'no handle on a count strip');
    assert.deepEqual(texts(state.root, '[data-band-strip-band-list] li'), [
      'Botch: below 0',
      'Ruined: 0–1',
      'Success: 2',
      'Fine: 3–4',
      'Masterwork: 5 or more',
    ]);
    assert.equal(
      state.root.querySelector('[data-outcome-band-scale]').textContent.trim(),
      'Measured in successes. The count must reach 2. A net below zero is a botch.'
    );
    await routedHarness.setProps({ value: check({ cancel: { enabled: false } }) });
    assert.deepEqual(texts(state.root, '[data-band-strip-band-list] li')[0], 'Ruined: 0–1');
    assert.equal(
      state.root.querySelector('[data-outcome-band-scale]').textContent.trim(),
      'Measured in successes. The count must reach 2.'
    );
  });

  it("anchors the strip on the previewed tier's successes, never its DC", async () => {
    const value = check({}, { tiers: [{ id: 't-plain', name: 'Plain work', dc: 12, successes: 4 }] });
    const records = [
      { id: '', name: 'Default', dc: 12, label: 'Default' },
      { id: 't-plain', name: 'Plain work', dc: 12, label: 'Plain work' },
    ];
    const root = await routedHarness.mount({
      value,
      section: 'outcomes',
      previewRecords: records,
      previewRecordId: 't-plain',
    });
    assert.match(root.querySelector('[data-outcome-band-scale]').textContent, /must reach 4\./);
    assert.deepEqual(texts(root, '[data-band-strip-band-list] li')[1], 'Ruined: 0–3');
  });

  it("states a pool the Preview-as actor's modifiers settle to zero", async () => {
    const root = await routedHarness.mount({
      value: check({ base: '1' }),
      section: 'outcomes',
      countPreview: { placement: { poolDelta: -1, thresholdDelta: 0, preRolls: [] }, odds: null },
    });
    assert.match(
      root.querySelector('[data-outcome-band-scale]').textContent,
      /must reach 2; this pool is reduced to zero, so the check fails automatically\./
    );
  });
});

describe('the simple editor authors a counting check (issue 2006)', () => {
  before(() => simpleHarness.setup());
  after(() => simpleHarness.teardown());
  afterEach(() => simpleHarness.remount());

  it('grades the recipe tiers only where the slot has them', async () => {
    const value = check({}, { tiers: [{ id: 't-hard', name: 'Hard work', dc: 12, successes: 5 }] });
    const crafting = await simpleHarness.mount({ value, section: 'roll' });
    assert.deepEqual(calloutsOf(crafting), validationCeiling(value, 'simple'));
    assert.match(calloutsOf(crafting)[0][1], /Hard work/);
    simpleHarness.remount();
    const salvage = await simpleHarness.mount({ value, section: 'roll', showDcSource: false });
    assert.deepEqual(calloutsOf(salvage), [], 'a slot without recipe tiers grades none');
  });

  it('draws Failure and Success at the successes needed, read-only, Botch first', async () => {
    const root = await simpleHarness.mount({ value: check(), section: 'outcomes' });
    assert.ok(!root.querySelector('[role="slider"]'));
    assert.deepEqual(texts(root, '[data-band-strip-band-list] li'), [
      'Botch: below 0',
      'Failure: 0–1',
      'Success: 2 or more',
    ]);
    assert.equal(
      root.querySelector('[data-simple-band-scale]').textContent.trim(),
      'Measured in successes. The count must reach 2. A net below zero is a botch.'
    );
  });
});

describe('the progressive editor (issue 2006)', () => {
  before(() => progressiveHarness.setup());
  after(() => progressiveHarness.teardown());
  afterEach(() => progressiveHarness.remount());

  it('has no Difficulty card while counting', async () => {
    const root = await progressiveHarness.mount({
      value: { rollFormula: '1d20', evaluation: counting() },
      section: 'roll',
    });
    assert.ok(root.querySelector('[data-check-count-fields]'), 'the pool is authored here');
    assert.ok(!root.querySelector('[data-check-difficulty-card]'));
  });
});
