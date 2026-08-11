/**
 * THE ANCHOR GATE (issue 1096).
 *
 * A `routedByCheck` check of `fixed` type matches a roll against absolute value ranges, so it
 * has no DC — nothing to meet or exceed, and nothing for a recipe's difficulty tier to move.
 * Three surfaces are withheld together and for that one reason: the `Difficulty` card, the
 * recipe difficulty tier list, and the Outcomes section's `PREVIEW AGAINST` selector.
 *
 * This pins the condition on ALL FOUR CORNERS of (mode, type) rather than asserting the two
 * states that happen to ship. Both halves of the condition are load-bearing, and a test that
 * only checked the hidden case would pass just as well on `hide everything fixed` (too wide,
 * taking the difficulty away from a salvage check that has one) or on `hide everything routed`
 * (too narrow, hiding the DC a relative routed check is defined by).
 */
import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';

import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';
import {
  CHECKS_TREE_COMPILED_MODULES,
  CHECKS_TREE_RAW_MODULES,
} from '../helpers/checksHarnessModules.js';

const repoRoot = resolve(import.meta.dirname, '../..');

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-check-anchor-gate-',
  rawModules: [...CHECKS_TREE_RAW_MODULES, 'src/utils/rollExpressionAverage.js'],
  compiledModules: [
    ...CHECKS_TREE_COMPILED_MODULES,
    'src/ui/svelte/apps/manager/SegmentedControl.svelte',
    'src/ui/svelte/components/ManagerButton.svelte',
    'src/ui/svelte/apps/manager/checks/CheckDifficultyCard.svelte',
    'src/ui/svelte/apps/manager/checks/CheckFormulaFields.svelte',
    'src/ui/svelte/apps/manager/checks/CheckRecipeTiers.svelte',
    'src/ui/svelte/apps/manager/checks/CheckTriggers.svelte',
    'src/ui/svelte/apps/manager/checks/CraftingCheckEditor.svelte',
  ],
  componentPath: 'src/ui/svelte/apps/manager/checks/CraftingCheckEditor.svelte',
});

before(() => harness.setup());
after(() => harness.teardown());
afterEach(() => harness.remount());

/** A check carrying BOTH tier lists and one recipe difficulty tier, so nothing is hidden by
 *  emptiness rather than by the gate under test. */
function check(type) {
  return {
    type,
    rollFormula: '1d20',
    dc: 12,
    thresholdMode: 'meet',
    tiers: [{ id: 'tier-a', name: 'Apprentice work', dc: 10 }],
    relativeOutcomes: [
      { id: 'o1', name: 'Ruined', dc: -5, success: false },
      { id: 'o2', name: 'Fine', dc: 0, success: true },
    ],
    fixedOutcomes: [
      { id: 'f1', name: 'Ruined', start: 1, end: 10, success: false },
      { id: 'f2', name: 'Fine', start: 11, end: 20, success: true },
    ],
  };
}

async function render({ type, resolutionMode }) {
  return harness.mount({
    value: check(type),
    resolutionMode,
    showTiers: true,
    section: '',
  });
}

function anchoredSurfaces(target) {
  return {
    difficulty: target.querySelector('[data-check-difficulty-card]') !== null,
    tiers: target.querySelector('[data-routed-tiers]') !== null,
    previewAgainst: target.querySelector('[data-preview-against]') !== null,
  };
}

const ALL_SHOWN = { difficulty: true, tiers: true, previewAgainst: true };
const ALL_WITHHELD = { difficulty: false, tiers: false, previewAgainst: false };

describe('the anchor gate is exactly routedByCheck AND fixed (issue 1096)', () => {
  it('withholds all three anchored surfaces on routedByCheck + fixed', async () => {
    const target = await render({ type: 'fixed', resolutionMode: 'routedByCheck' });
    assert.deepEqual(
      anchoredSurfaces(target),
      ALL_WITHHELD,
      'a fixed routed check matches absolute values, so it has nothing to anchor against'
    );
  });

  it('shows all three on routedByCheck + relative, which is defined by its DC', async () => {
    const target = await render({ type: 'relative', resolutionMode: 'routedByCheck' });
    assert.deepEqual(
      anchoredSurfaces(target),
      ALL_SHOWN,
      'every relative tier threshold is an offset from the DC, so the gate must not fire'
    );
  });

  it('does not WIDEN to any fixed check: a fixed salvage check keeps its anchor', async () => {
    // Salvage and gathering reuse this editor with no system resolution mode at all.
    for (const resolutionMode of [null, undefined, 'routedByIngredients', 'simple']) {
      harness.remount();
      const target = await render({ type: 'fixed', resolutionMode });
      assert.deepEqual(
        anchoredSurfaces(target),
        ALL_SHOWN,
        `fixed under resolutionMode=${String(resolutionMode)} still has a DC, so nothing is withheld`
      );
    }
  });

  it('does not NARROW to the check type alone: relative under any mode shows all three', async () => {
    for (const resolutionMode of [null, 'routedByCheck', 'simple']) {
      harness.remount();
      const target = await render({ type: 'relative', resolutionMode });
      assert.deepEqual(anchoredSurfaces(target), ALL_SHOWN);
    }
  });

  it('withholds PREVIEW AGAINST when there is no tier to preview, which is a different reason', async () => {
    const target = await harness.mount({
      value: { ...check('relative'), tiers: [] },
      resolutionMode: 'routedByCheck',
      showTiers: true,
      section: '',
    });
    assert.equal(
      target.querySelector('[data-preview-against]'),
      null,
      'a selector with one option is not a choice'
    );
    assert.ok(
      target.querySelector('[data-check-difficulty-card]'),
      'the emptiness of the tier list must not be confused with the anchor gate'
    );
  });
});
