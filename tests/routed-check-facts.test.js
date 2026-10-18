/**
 * `routedCheckFacts` (issue 2513): the tiers, evaluation and gaps the recipe editor reads off a
 * routed check, and the roll-under direction `routedMinimum` takes from that evaluation.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { routedMinimum } from '../src/ui/svelte/apps/manager/recipe/recipeRoutingModel.js';
import { routedCheckFacts } from '../src/ui/svelte/apps/manager/recipe/routedCheckFacts.js';

const FIXED = Object.freeze({
  type: 'fixed',
  evaluation: { product: 'sum', direction: 'under' },
  fixedOutcomes: [
    { id: 'master', name: 'Masterwork', success: true, start: 1, end: 3 },
    { id: 'fine', name: '', success: true, start: 4, end: 6 },
    { id: 'ruined', name: 'Ruined', success: false, start: 9, end: 20 },
  ],
});

describe('routedCheckFacts', () => {
  it('reads a fixed check’s tiers with their bounds, its evaluation and its gaps', () => {
    const facts = routedCheckFacts(FIXED);
    assert.deepEqual(facts.tiers, [
      { id: 'master', name: 'Masterwork', success: true, start: 1, end: 3 },
      { id: 'fine', name: 'fine', success: true, start: 4, end: 6 },
      { id: 'ruined', name: 'Ruined', success: false, start: 9, end: 20 },
    ]);
    assert.equal(facts.evaluation.direction, 'under');
    assert.deepEqual(facts.gaps, [{ from: 7, to: 8 }]);
  });

  it('hands routedMinimum the roll-under direction of a fixed sum check', () => {
    const { evaluation } = routedCheckFacts(FIXED);
    assert.deepEqual(
      routedMinimum({ resolutionMode: 'routedByCheck', minSuccessOutcomeId: 'fine', evaluation }),
      { minSuccessOutcomeId: 'fine', direction: 'under' }
    );
  });

  it('gives a relative check null bounds and no gaps', () => {
    const facts = routedCheckFacts({
      type: 'relative',
      relativeOutcomes: [{ id: 'std', name: 'Standard', success: true, dc: 0 }],
      fixedOutcomes: FIXED.fixedOutcomes,
    });
    assert.deepEqual(facts.tiers, [
      { id: 'std', name: 'Standard', success: true, start: null, end: null },
    ]);
    assert.deepEqual(facts.gaps, []);
    assert.equal(facts.evaluation.direction, 'over');
  });

  it('reads an absent check as no tiers, the default evaluation and no gaps', () => {
    const facts = routedCheckFacts(undefined);
    assert.deepEqual(facts.tiers, []);
    assert.deepEqual(facts.gaps, []);
    assert.equal(facts.evaluation.product, 'sum');
    assert.equal(facts.evaluation.direction, 'over');
  });
});
