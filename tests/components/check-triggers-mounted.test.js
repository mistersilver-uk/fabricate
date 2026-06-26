import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');

// Real en.json so the tests assert LOCALIZED copy resolves — not the component's
// inline text() fallback (which would mask a missing or renamed key). The unified
// trigger editor is keyed under FABRICATE.Admin.Manager.Checks.Breakage (+ a few
// reused Crafting keys for the award/break labels).
const en = JSON.parse(readFileSync(resolve(repoRoot, 'lang/en.json'), 'utf8'));
function lookup(key) {
  return key.split('.').reduce((node, part) => (node == null ? undefined : node[part]), en);
}

// Use the shared mounted-component harness; do not re-inline compile/mount
// boilerplate (it duplicates the other mount tests and trips the duplication gate).
const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-check-triggers-',
  rawModules: [
    'src/ui/svelte/util/foundryBridge.js',
    'src/utils/craftingCheckExpression.js'
  ],
  compiledModules: ['src/ui/svelte/apps/manager/checks/CheckTriggers.svelte'],
  componentPath: 'src/ui/svelte/apps/manager/checks/CheckTriggers.svelte'
});

const breakageKeys = en.FABRICATE.Admin.Manager.Checks.Breakage;
const craftingKeys = en.FABRICATE.Admin.Manager.Checks.Crafting;

before(async () => {
  await harness.setup();
  globalThis.game.i18n.localize = (key) => {
    const value = lookup(key);
    return typeof value === 'string' ? value : key;
  };
});
after(() => harness.teardown());
afterEach(() => harness.remount());

function triggerBlock(triggers) {
  return { triggers };
}

const rollTotalTrigger = {
  id: 't1',
  condition: { type: 'rollTotal', operator: '<=', value: 3 },
  outcome: 'failure',
  breakTools: false
};

describe('CheckTriggers (mounted): unified outcome + break editor', () => {
  it('always renders the trigger list and its outcome toggle; never a label input', async () => {
    const root = await harness.mount({
      value: triggerBlock([rollTotalTrigger]),
      rollFormula: '1d20',
      kind: 'simple',
      showBreakTools: false
    });
    assert.ok(root.querySelector('[data-check-triggers]'), 'the trigger editor renders');
    const selected = root.querySelector('[data-trigger="t1"] [data-trigger-outcome="failure"]');
    assert.ok(selected, 'the failure outcome segment renders for a trigger');
    assert.ok(
      selected.classList.contains('is-selected'),
      'the toggle reflects the trigger outcome'
    );
    assert.equal(
      selected.getAttribute('aria-pressed'),
      'true',
      'the selected segment is pressed'
    );
    // No free-text label input survives the recombine.
    assert.equal(
      root.querySelector('[data-breakage-trigger-label]'),
      null,
      'no trigger label input is rendered'
    );
  });

  it('offers Automatic success / No effect / Automatic failure for a non-progressive check', async () => {
    const root = await harness.mount({
      value: triggerBlock([rollTotalTrigger]),
      rollFormula: '1d20',
      kind: 'simple',
      showBreakTools: false
    });
    const labels = [...root.querySelectorAll('[data-trigger-outcome]')].map((b) =>
      b.textContent.trim()
    );
    assert.deepEqual(
      labels,
      [breakageKeys.OutcomeForceSuccess, breakageKeys.OutcomeForceNone, breakageKeys.OutcomeForceFailure],
      'the outcome segments use the localized force-outcome copy in success | none | failure order'
    );
  });

  it('relabels the outcome segments Award all / Award none for a progressive check', async () => {
    const root = await harness.mount({
      value: triggerBlock([
        { id: 'p1', condition: { type: 'progressiveValue', operator: '>=', value: 10 }, outcome: 'success', breakTools: false }
      ]),
      rollFormula: '2d6',
      kind: 'progressive',
      showBreakTools: false
    });
    const labels = [...root.querySelectorAll('[data-trigger-outcome]')].map((b) =>
      b.textContent.trim()
    );
    assert.deepEqual(
      labels,
      [craftingKeys.AwardAll, breakageKeys.OutcomeForceNone, craftingKeys.AwardNone],
      'progressive reuses the Award all / Award none copy'
    );
  });

  it('gates the break-tools pill on showBreakTools (authority)', async () => {
    const hidden = await harness.mount({
      value: triggerBlock([rollTotalTrigger]),
      rollFormula: '1d20',
      kind: 'simple',
      showBreakTools: false
    });
    assert.equal(
      hidden.querySelector('[data-trigger-break]'),
      null,
      'no break pill when showBreakTools is false (toolSpecific)'
    );
    harness.remount();

    const shown = await harness.mount({
      value: triggerBlock([rollTotalTrigger]),
      rollFormula: '1d20',
      kind: 'simple',
      showBreakTools: true
    });
    assert.ok(
      shown.querySelector('[data-trigger-break]'),
      'the break pill renders when showBreakTools is true (checkDriven)'
    );
  });

  it('toggles a trigger outcome through the segmented control and emits the new block', async () => {
    const emitted = [];
    const root = await harness.mount({
      value: triggerBlock([rollTotalTrigger]),
      rollFormula: '1d20',
      kind: 'simple',
      showBreakTools: false,
      onChange: (next) => emitted.push(next)
    });
    root.querySelector('[data-trigger="t1"] [data-trigger-outcome="success"]').click();
    assert.equal(
      emitted.at(-1).triggers[0].outcome,
      'success',
      'clicking a segment emits the updated outcome'
    );
  });

  it('adds a trigger from the empty state, defaulting breakTools to showBreakTools', async () => {
    const emitted = [];
    const root = await harness.mount({
      value: triggerBlock([]),
      rollFormula: '1d20',
      kind: 'simple',
      showBreakTools: true,
      onChange: (next) => emitted.push(next)
    });
    assert.ok(root.querySelector('[data-triggers-empty]'), 'the empty state renders with no triggers');
    root.querySelector('[data-add-trigger]').click();
    const added = emitted.at(-1).triggers;
    assert.equal(added.length, 1, 'Add seeds exactly one trigger');
    assert.equal(added[0].outcome, 'none', 'a new trigger forces no outcome by default');
    assert.equal(added[0].breakTools, true, 'a new trigger defaults breakTools to showBreakTools');
  });

  it('disables the forcing segments for an outcomeTier condition (routed)', async () => {
    const root = await harness.mount({
      value: triggerBlock([
        { id: 'o1', condition: { type: 'outcomeTier', tierIds: ['tier-a'], outcomeKeys: [] }, outcome: 'none', breakTools: true }
      ]),
      rollFormula: '1d20',
      kind: 'routed',
      outcomeOptions: [{ id: 'tier-a', name: 'Critical' }],
      showBreakTools: true
    });
    const successSeg = root.querySelector('[data-trigger="o1"] [data-trigger-outcome="success"]');
    const failureSeg = root.querySelector('[data-trigger="o1"] [data-trigger-outcome="failure"]');
    const noneSeg = root.querySelector('[data-trigger="o1"] [data-trigger-outcome="none"]');
    assert.ok(successSeg.disabled, 'the success segment is disabled for an outcomeTier condition');
    assert.ok(failureSeg.disabled, 'the failure segment is disabled for an outcomeTier condition');
    assert.ok(noneSeg.classList.contains('is-selected'), 'the outcome is pinned to No effect');
    // The outcomeTier pills still render so the trigger can break tools on a tier.
    assert.ok(root.querySelector('[data-trigger-tier="tier-a"]'), 'the tier pill renders');
  });
});
