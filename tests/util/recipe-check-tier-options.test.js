/** Issue 2005 (T6): the recipe Check tier labels follow the active check's evaluation. */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildCheckTierOptions,
  checkTierUnit,
} from '../../src/ui/svelte/apps/manager/recipe/recipeOverviewSelectOptions.js';

const english = (_key, fallback) => fallback;
const labels = (options) => options.map((option) => option.label);
const TIERS = [
  { id: 'easy', name: 'Easy', dc: 8, adjustment: 2 },
  { id: 'hard', name: 'Hard', dc: 20, adjustment: -2 },
  { id: 'half', name: '', dc: 18, adjustment: 0.5 },
  { id: 'unset', name: 'Unset', dc: 12, adjustment: null },
];
const evaluation = (direction, source = 'fixed', adjustmentKind = 'add') => ({
  product: 'sum',
  direction,
  target: { source, expression: '@skills.smith.value', adjustmentKind },
});

describe('the recipe Check tier options', () => {
  it('keep the roll-high fixed labels verbatim', () => {
    for (const roll of [null, evaluation('over')]) {
      assert.deepEqual(labels(buildCheckTierOptions(TIERS, english, roll)), [
        'Default DC',
        'Easy (DC 8)',
        'Hard (DC 20)',
        'Unnamed tier (DC 18)',
        'Unset (DC 12)',
      ]);
    }
  });

  it('name a roll-under fixed tier as a Target, never a DC', () => {
    assert.deepEqual(labels(buildCheckTierOptions(TIERS, english, evaluation('under'))), [
      'Default target',
      'Easy (Target 8)',
      'Hard (Target 20)',
      'Unnamed tier (Target 18)',
      'Unset (Target 12)',
    ]);
  });

  it('name a character-value tier by its adjustment in either direction, with the true minus', () => {
    for (const direction of ['over', 'under']) {
      const add = labels(buildCheckTierOptions(TIERS, english, evaluation(direction, 'attribute')));
      assert.deepEqual(add, [
        'Default · base adjustment',
        'Easy (+2)',
        'Hard (−2)',
        'Unnamed tier (+0.5)',
        'Unset (—)',
      ]);
      const multiply = buildCheckTierOptions(
        TIERS,
        english,
        evaluation(direction, 'attribute', 'multiply')
      );
      assert.equal(multiply[3].label, 'Unnamed tier (×½)');
      assert.ok(labels(multiply).every((label) => !/DC|Target/.test(label)), direction);
    }
  });

  it('leave a count on its DC wording for issue 2006', () => {
    assert.equal(checkTierUnit({ product: 'count', direction: 'under' }), 'dc');
  });
});
