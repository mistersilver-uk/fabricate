/** THE DIFFICULTY CARD, DRIVEN THROUGH ITS CONTROLS (issue 1096). */
import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';

import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';
import { CHECKS_TREE_RAW_MODULES } from '../helpers/checksHarnessModules.js';
import { normalizeCheckEvaluation } from '../../src/systems/normalize/checkEvaluation.js';
import { checkIssueSentence } from '../../src/ui/svelte/apps/manager/checks/checksCopy.js';
import { evaluateCheckReadiness } from '../../src/ui/svelte/apps/manager/checks/checksReadiness.js';

const repoRoot = resolve(import.meta.dirname, '../..');

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-check-difficulty-',
  // The count callouts read the readiness evaluator (issue 2006), so the card takes the tree's closure.
  rawModules: CHECKS_TREE_RAW_MODULES,
  compiledModules: [
    'src/ui/svelte/components/RadioCardGroup.svelte',
    'src/ui/svelte/components/SegmentedControl.svelte',
    'src/ui/svelte/components/Field.svelte',
    'src/ui/svelte/components/Stepper.svelte',
    'src/ui/svelte/components/InspectorCard.svelte',
    'src/ui/svelte/components/Callout.svelte',
    'src/ui/svelte/apps/manager/RollDataExpressionInput.svelte',
    'src/ui/svelte/apps/manager/checks/CheckCharacterValueField.svelte',
    'src/ui/svelte/apps/manager/checks/CheckDifficultyCard.svelte',
  ],
  componentPath: 'src/ui/svelte/apps/manager/checks/CheckDifficultyCard.svelte',
});

before(() => harness.setup());
after(() => harness.teardown());
afterEach(() => harness.remount());

/** The real control inside a segment is the visually hidden radio. */
function choose(root, attr, value) {
  const radio = root.querySelector(`[${attr}="${value}"] input[type="radio"]`);
  assert.ok(radio, `a radio exists for ${attr}="${value}"`);
  radio.checked = true;
  radio.dispatchEvent(new globalThis.Event('change', { bubbles: true }));
  return radio;
}

describe('the Difficulty card writes what its controls say', () => {
  it('CHOOSING a comparison segment emits the new threshold mode', async () => {
    const emitted = [];
    const root = await harness.mount({
      dc: 12,
      thresholdMode: 'meet',
      onChange: (patch) => emitted.push(patch),
    });
    assert.ok(
      root.querySelector('[data-threshold-mode-option="meet"]').classList.contains('is-active'),
      'the authored mode is the lit one before anything is touched'
    );
    choose(root, 'data-threshold-mode-option', 'exceed');
    assert.deepEqual(emitted.at(-1), { thresholdMode: 'exceed' });
  });

  it('re-choosing the mode already in force writes nothing', async () => {
    const emitted = [];
    const root = await harness.mount({
      dc: 12,
      thresholdMode: 'meet',
      onChange: (patch) => emitted.push(patch),
    });
    choose(root, 'data-threshold-mode-option', 'meet');
    assert.equal(emitted.length, 0, 'a no-op selection must not dirty the draft');
  });

  it('CHOOSING a DC source emits the new mode', async () => {
    const emitted = [];
    const root = await harness.mount({
      showDcSource: true,
      dc: 12,
      dcMode: 'static',
      onChange: (patch) => emitted.push(patch),
    });
    choose(root, 'data-dc-mode-option', 'dynamic');
    assert.deepEqual(emitted.at(-1), { dcMode: 'dynamic' });
  });

  it('re-choosing the DC source already in force writes nothing', async () => {
    const emitted = [];
    const root = await harness.mount({
      showDcSource: true,
      dc: 12,
      dcMode: 'dynamic',
      onChange: (patch) => emitted.push(patch),
    });
    choose(root, 'data-dc-mode-option', 'dynamic');
    assert.equal(emitted.length, 0);
  });

  it('withholds the DC-source chooser entirely when the slot carries no dcMode', async () => {
    const root = await harness.mount({ dc: 12 });
    assert.equal(
      root.querySelector('[data-dc-mode-option]'),
      null,
      'a chooser writing a field nothing reads must not render'
    );
    assert.ok(root.querySelector('[data-check-dc]'), 'the base DC still does');
  });

  it("puts the activity's own noun in the DC-source copy", async () => {
    const root = await harness.mount({ showDcSource: true, dc: 12, recordNoun: 'gathering task' });
    const text = root.querySelector('[data-dc-mode-option="static"]').textContent;
    assert.match(text, /gathering task/);
    assert.doesNotMatch(text, /\{record\}/, 'no placeholder survives to the screen');
  });
});

describe("a counting check's Difficulty card (issue 2006)", () => {
  // `text` as the card resolves an unlocalized key: the English fallback.
  const fallback = (key, english) => english;
  const counting = (pool = {}, rest = {}) =>
    normalizeCheckEvaluation({
      product: 'count',
      direction: 'under',
      // A kept character-value target, inert under a count.
      target: { source: 'attribute', expression: '@skills.craft.value' },
      pool: { die: 10, base: '2', threshold: '8', required: 2, ...pool },
      ...rest,
    });

  const calloutTexts = (root) =>
    [...root.querySelectorAll('[data-check-count-callout]')].map((node) => [
      node.getAttribute('data-check-count-callout'),
      node.textContent.trim(),
    ]);

  it('N8: edits Successes needed, with no Comparison and no target source', async () => {
    const emitted = [];
    const evaluation = counting();
    const root = await harness.mount({
      showDcSource: true,
      dc: 12,
      thresholdMode: 'exceed',
      evaluation,
      onChange: (patch) => emitted.push(patch),
    });
    assert.ok(!root.querySelector('[data-threshold-mode-option]'), 'the per-die test is the only thresholdMode editor');
    assert.ok(!root.querySelector('[data-check-target-source-option]'), 'a count reads no target source');
    assert.ok(!root.querySelector('[data-check-attribute-fields]'), 'a kept character value stays inert');
    assert.ok(!root.querySelector('[data-check-dc]'), 'the DC is not the number a count must reach');
    assert.match(root.textContent, /How many successes the roll must reach/);
    assert.match(root.textContent, /How the successes needed are set/);
    assert.match(
      root.querySelector('[data-dc-mode-option="static"]').textContent,
      /The intended route for counting checks/
    );

    const input = root.querySelector('[data-check-count-required]');
    assert.equal(input.value, '2');
    assert.equal(input.getAttribute('aria-label'), 'Successes needed');
    assert.equal(input.getAttribute('data-validation-target'), 'checks-count-required');
    input.closest('.fab-stepper').querySelectorAll('.fab-stepper-adjunct')[1].click();
    assert.deepEqual(emitted.at(-1), {
      evaluation: { ...evaluation, pool: { ...evaluation.pool, required: 3 } },
    });
  });

  it('a summing check keeps its Comparison and DC', async () => {
    const evaluation = counting({}, { product: 'sum', target: { source: 'fixed' } });
    const root = await harness.mount({ dc: 12, evaluation });
    assert.ok(Boolean(root.querySelector('[data-threshold-mode-option="meet"]')));
    assert.ok(Boolean(root.querySelector('[data-check-dc]')));
    assert.ok(!root.querySelector('[data-check-count-required]'));
  });

  it("N10: states Validation's own required-count row, word for word, and no impossibility", async () => {
    const evaluation = counting({
      required: 1,
      explode: { enabled: true, faces: { kind: 'best' }, once: false },
    });
    const tiers = [{ id: 't-master', name: 'Masterwork', dc: 10, successes: 3 }];
    const check = { dc: 12, thresholdMode: 'meet', tiers, evaluation };
    const readiness = evaluateCheckReadiness(check, { mode: 'simple', activity: 'crafting' });
    const expected = readiness.issues
      .filter((issue) => issue.id.startsWith('countRequiredExceeds'))
      .map((issue) => [issue.id, checkIssueSentence(issue.id, issue.data, fallback)]);
    assert.equal(expected.length, 1, 'the fixture raises the ceiling row in Validation');

    const root = await harness.mount({ evaluation, countTiers: tiers });
    assert.deepEqual(calloutTexts(root), expected);
    assert.equal(
      root.querySelector('[data-check-count-callout]').getAttribute('data-callout-tone'),
      'danger'
    );
    assert.doesNotMatch(root.textContent, /never succeed|cannot succeed|impossible/i);
  });

  it('a pool that reads the character states no shortfall and no callout, as frame 06 draws it', async () => {
    const evaluation = counting({ base: '@skills.craft.value', required: 9 });
    const root = await harness.mount({ evaluation, countTiers: [] });
    assert.deepEqual(calloutTexts(root), [], 'the character-dependent tick is Validation only');
  });

  it('grades no required count where the check grades none (countTiers null)', async () => {
    const root = await harness.mount({ evaluation: counting({ required: 5 }), countTiers: null });
    assert.deepEqual(calloutTexts(root), []);
  });

  it('says a literal base of zero fails unless modifiers add dice, only while zero fails', async () => {
    const root = await harness.mount({ evaluation: counting({ base: '0', required: 0 }), countTiers: [] });
    assert.deepEqual(calloutTexts(root), [
      [
        'countZeroPool',
        'This pool is reduced to zero, so the check fails automatically unless modifiers add dice.',
      ],
    ]);
    await harness.setProps({ evaluation: counting({ base: '0', required: 0, zeroPoolFails: false }) });
    assert.deepEqual(calloutTexts(root), []);
  });
});
