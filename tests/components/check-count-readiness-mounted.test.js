/**
 * The Checks Studio's count readiness on the route (issue 2006, N21, N25): each count notice's
 * Review lands on the control that clears it, and a summing counting formula's notice converts.
 * It needs the whole ChecksView, which owns the routing, focus and the staged draft writers.
 */
import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { flushSync, tick } from 'svelte';

import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';
import {
  CHECK_EDITOR_COMPILED_MODULES,
  CHECK_EDITOR_RAW_MODULES,
  CHECKS_TREE_COMPILED_MODULES,
} from '../helpers/checksHarnessModules.js';
import { convertCountingFormula } from '../../src/ui/svelte/apps/manager/checks/countFormulaConversion.js';
import { ANNOUNCE_AFTER_FOCUS_MS } from '../../src/ui/svelte/util/announceAfterFocus.js';

const repoRoot = resolve(import.meta.dirname, '../..');

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-check-count-readiness-',
  rawModules: CHECK_EDITOR_RAW_MODULES,
  compiledModules: [
    ...CHECKS_TREE_COMPILED_MODULES,
    ...CHECK_EDITOR_COMPILED_MODULES,
    'src/ui/svelte/apps/manager/checks/CheckModeCallout.svelte',
    'src/ui/svelte/apps/manager/checks/ChecksView.svelte',
  ],
  componentPath: 'src/ui/svelte/apps/manager/checks/ChecksView.svelte',
});

before(async () => {
  await harness.setup();
  globalThis.game.actors = { contents: [], get: () => undefined };
});
after(() => harness.teardown());
afterEach(() => harness.remount());

async function settle() {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    flushSync();
    await tick();
  }
  flushSync();
}

const count = (pool, direction = 'over') => ({
  product: 'count',
  direction,
  pool: { die: 10, base: '2', threshold: '8', required: 1, ...pool },
});

const simpleCheck = (check) => ({
  rollFormula: '',
  dc: 12,
  thresholdMode: 'meet',
  dcMode: 'static',
  checkBreakage: { triggers: [] },
  tiers: [],
  ...check,
});

const simple = (check, props = {}) =>
  harness.mount({
    activity: 'crafting',
    resolutionMode: 'simple',
    craftingCheckSimple: simpleCheck(check),
    activation: { crafting: { enabled: true, optional: false } },
    features: { salvage: false },
    ...props,
  });

const notice = (root, id) => root.querySelector(`[data-checks-section-notice="${id}"]`);

/** Click a notice's one action and let the focus move settle. */
async function act(root, id) {
  const found = notice(root, id);
  assert.ok(Boolean(found), `${id} is explained in its section`);
  found.querySelector('[data-notice-action]').click();
  await settle();
  return root.ownerDocument.activeElement;
}

describe('Review lands on the count control that clears the notice (N25)', () => {
  const missing = { enabled: true, faces: { kind: 'from', value: null } };

  for (const [id, pool, extra, address] of [
    ['countPoolInvalid', { base: '2d4' }, {}, 'checks-count-base'],
    ['countThresholdInvalid', { threshold: '1d4 + 6' }, {}, 'checks-count-threshold'],
    ['countExplodeUnbounded', { explode: { enabled: true, faces: { kind: 'from', value: 1 } } }, {}, 'checks-count-explode'],
    ['countFaceBeyondDie', { explode: { enabled: true, faces: { kind: 'from', value: 12 }, once: true } }, {}, 'checks-count-explode-face'],
    ['countFaceMissing', { cancel: missing }, {}, 'checks-count-cancel-face'],
    ['countRequiredExceedsMaxPool', { required: 3 }, {}, 'checks-count-required'],
    [
      'countTierWithoutSuccesses',
      { required: 1 },
      { tiers: [{ id: 'unset', name: 'Unset Work', dc: 12, successes: null }] },
      'checks-count-tier-successes',
    ],
  ]) {
    it(`${id} focuses ${address}`, async () => {
      const root = await simple({ evaluation: count(pool), ...extra });
      const focused = await act(root, id);
      const control = root.querySelector(`[data-validation-target="${address}"]`);
      assert.ok(Boolean(control), `${address} is rendered`);
      assert.ok(focused === control, `Review focuses ${address}, not the section panel`);
    });
  }

  it('a dead dice trigger is explained on Triggers, and Review lands on the trigger list', async () => {
    const trigger = {
      id: 'second',
      condition: { type: 'diceGroup', groupId: 1, aggregate: 'anyDie', operator: '==', value: 6 },
      outcome: 'failure',
    };
    const root = await simple({ evaluation: count({}), checkBreakage: { triggers: [trigger] } });
    root.querySelector('[data-checks-section-button="triggers"]').click();
    await settle();
    assert.equal(
      notice(root, 'countTriggerGroupUnreachable').dataset.noticeTone,
      'warning',
      'an amber notice'
    );
    const focused = await act(root, 'countTriggerGroupUnreachable');
    assert.ok(focused === root.querySelector('[data-validation-target="checks-triggers"]'));
  });
});

describe('the roll section converts a summing counting formula (N21)', () => {
  const summed = {
    rollFormula: '2d20cs<=@skills.survival.value',
    dc: 12,
    evaluation: { product: 'sum', direction: 'over', target: { source: 'fixed' } },
    tiers: [{ id: 'plain', name: 'Plain', dc: 10, successes: null }],
  };

  it('stages the conversion through the draft writer, then lands on Count successes', async () => {
    const staged = [];
    const opened = [];
    const root = await simple(summed, {
      onUpdateCraftingCheckSimple: (next) => staged.push(next),
      onOpenActivity: (activity, section) => opened.push([activity, section]),
    });
    const found = notice(root, 'freeTextCountingFormula');
    const button = found.querySelector('[data-notice-action]');
    assert.equal(button.textContent.trim(), 'Convert to count successes');
    const description = root.querySelector(`#${button.getAttribute('aria-describedby')}`);
    assert.equal(
      description.textContent.trim(),
      'Copies the DCs into successes needed. The formula and DCs are kept.'
    );
    const focused = await act(root, 'freeTextCountingFormula');
    assert.equal(staged.length, 1, 'one staged draft write, nothing persisted');
    const draft = staged[0];
    assert.deepEqual(draft, convertCountingFormula(simpleCheck(summed)), 'the pure conversion, staged');
    assert.equal(draft.evaluation.product, 'count');
    assert.equal(draft.rollFormula, summed.rollFormula, 'the formula is kept');
    assert.equal(draft.dc, 12, 'the DC is kept');
    assert.deepEqual(
      draft.tiers.map((tier) => [tier.dc, tier.successes]),
      [[10, 10]]
    );
    assert.deepEqual(opened, [['crafting', 'roll']], 'Convert routes to the roll section');
    const product = root.querySelector('[data-validation-target="checks-product"]');
    assert.ok(focused === product, 'focus lands on Count successes, never the page body');
    await new Promise((done) => setTimeout(done, ANNOUNCE_AFTER_FOCUS_MS + 20));
    await settle();
    assert.match(
      root.querySelector('[data-checks-issue-announcement]').textContent,
      /^Converted to count successes\. The original formula and DCs are kept\. /,
      'a polite status line announces the change'
    );
  });

  it('offers Review alone where the formula does not convert, and keeps avg —', async () => {
    const staged = [];
    const root = await simple(
      { ...summed, rollFormula: '6d10cs>=8df<=8' },
      { onUpdateCraftingCheckSimple: (next) => staged.push(next) }
    );
    const button = notice(root, 'freeTextCountingFormula').querySelector('[data-notice-action]');
    assert.equal(button.textContent.trim(), 'Review');
    assert.ok(!button.hasAttribute('aria-describedby'));
    const focused = await act(root, 'freeTextCountingFormula');
    assert.deepEqual(staged, [], 'Review writes nothing');
    assert.ok(focused === root.querySelector('[data-validation-target="checks-roll-formula"]'));
    assert.ok(Boolean(root.querySelector('[data-check-formula-average-withheld="die-modifiers"]')), 'avg — stays beside the warning');
  });
});
