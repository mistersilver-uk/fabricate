/**
 * The recipe editor's routing and result-set edits (issues 2511, 2512): the scope a write lands on,
 * the collapsed results projection, and the set, tier, group and alchemy-slot writes.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  addIngredientSet,
  addResultGroup,
  alchemySlots,
  resultsProjection,
  routeSet,
  routeTier,
  scopeTarget,
  withResultSlot,
} from '../src/ui/svelte/apps/manager/recipe/recipeRoutingEdits.js';

const sequence = (...ids) => {
  const queue = [...ids];
  return () => queue.shift();
};

describe('scopeTarget', () => {
  it('sends a scope-less write to the final step of a collapsed chain', () => {
    assert.equal(scopeTarget(null, { id: 'last' }), 'last');
    assert.equal(scopeTarget(undefined, { id: 'last' }), 'last');
  });

  it('keeps a named step, and the recipe scope with no final step', () => {
    assert.equal(scopeTarget('step-1', { id: 'last' }), 'step-1');
    assert.equal(scopeTarget(null, null), null);
  });
});

describe('resultsProjection', () => {
  const recipe = {
    id: 'r1',
    name: 'Blade',
    resultGroups: [],
    resultSelection: { provider: 'check' },
  };

  it('is the recipe itself with no final step', () => {
    assert.equal(resultsProjection(recipe, null), recipe);
  });

  it('projects the final step’s groups, sets and routing over the recipe', () => {
    const finalStep = {
      id: 'last',
      resultGroups: [{ id: 'g1' }],
      ingredientSets: [{ id: 's1' }],
      outcomeRouting: { Fine: 'g1' },
    };
    assert.deepEqual(resultsProjection(recipe, finalStep), {
      id: 'r1',
      name: 'Blade',
      resultGroups: [{ id: 'g1' }],
      ingredientSets: [{ id: 's1' }],
      resultSelection: { provider: 'check' },
      outcomeRouting: { Fine: 'g1' },
    });
  });

  it('reads a step with no arrays as empty, and no routing anywhere as null', () => {
    assert.deepEqual(resultsProjection({ id: 'r1' }, { id: 'last' }), {
      id: 'r1',
      resultGroups: [],
      ingredientSets: [],
      resultSelection: null,
      outcomeRouting: null,
    });
  });
});

describe('routeSet', () => {
  const sets = [
    { id: 's1', resultGroupId: 'g1' },
    { id: 's2', name: 'Kept' },
  ];

  it('routes one set to a group, leaving the others untouched', () => {
    const next = routeSet(sets, 's2', 'g2');
    assert.deepEqual(next, [sets[0], { id: 's2', name: 'Kept', resultGroupId: 'g2' }]);
    assert.equal(next[0], sets[0]);
  });

  it('clears a route with null', () => {
    assert.deepEqual(routeSet(sets, 's1', null)[0], { id: 's1', resultGroupId: null });
  });

  it('changes nothing for an unknown set', () => {
    assert.deepEqual(routeSet(sets, 'nope', 'g2'), sets);
  });
});

describe('adding a result set or an ingredient set', () => {
  it('appends an empty result set under a minted id', () => {
    assert.deepEqual(
      addResultGroup([{ id: 'g1' }], () => 'g2'),
      [{ id: 'g1' }, { id: 'g2', name: '', checkOutcomeIds: [], results: [] }]
    );
  });

  it('appends an empty ingredient set under a minted id', () => {
    assert.deepEqual(
      addIngredientSet([], () => 's1'),
      [{ id: 's1', name: '', ingredientGroups: [] }]
    );
  });
});

describe('alchemySlots', () => {
  it('reads the first non-failure group and the reserved failure one, unedited', () => {
    const success = { id: 'gs', results: [] };
    const failure = { id: 'gf', role: 'failure', results: [] };
    const slots = alchemySlots([failure, success]);
    assert.equal(slots.success, success);
    assert.equal(slots.failure, failure);
  });

  it('synthesizes each absent slot empty', () => {
    assert.deepEqual(alchemySlots([]), {
      success: { results: [] },
      failure: { role: 'failure', results: [] },
    });
  });
});

describe('withResultSlot', () => {
  const success = { id: 'gs', name: 'On success', results: [{ id: 'r1' }] };
  const failure = { id: 'gf', role: 'failure', name: 'Ruin', results: [] };

  it('writes the success slot over the first non-failure group, keeping both ids', () => {
    const next = withResultSlot([failure, success], 'success', { id: 'x', results: [] });
    assert.deepEqual(next, [
      { id: 'gs', name: 'On success', results: [] },
      { id: 'gf', role: 'failure', name: 'Ruin', results: [] },
    ]);
  });

  it('writes the failure slot, holding its role whatever the edit says', () => {
    const next = withResultSlot([success, failure], 'failure', {
      role: 'other',
      results: [{ id: 'r2' }],
    });
    assert.deepEqual(next[1], { id: 'gf', role: 'failure', name: 'Ruin', results: [{ id: 'r2' }] });
    assert.equal(next[0].id, 'gs');
  });

  it('synthesizes both slots with no groups, minting the success id first', () => {
    const next = withResultSlot([], 'failure', { results: [{ id: 'r3' }] }, sequence('m1', 'm2'));
    assert.deepEqual(next, [
      { id: 'm1', results: [] },
      { id: 'm2', role: 'failure', results: [{ id: 'r3' }] },
    ]);
  });

  it("takes the edit's id for an id-less slot, and the only group when every group is a failure", () => {
    const next = withResultSlot(
      [{ ...failure, id: '' }],
      'success',
      { id: 'e1', results: [] },
      () => 'm'
    );
    assert.deepEqual(next, [
      { id: 'e1', role: 'failure', name: 'Ruin', results: [] },
      { id: 'm', role: 'failure', name: 'Ruin', results: [] },
    ]);
  });
});

describe('routeTier', () => {
  const claimants = (groups, tierId) =>
    groups.flatMap((group, index) => (group.checkOutcomeIds?.includes(tierId) ? [index] : []));

  it('moves a tier from the group listing it to the chosen one, appended last', () => {
    const groups = [
      { id: 'g1', checkOutcomeIds: ['t-fine', 't-great'] },
      { id: 'g2', checkOutcomeIds: ['t-botch'] },
    ];
    const next = routeTier(groups, 't-fine', 1);
    assert.deepEqual(next, [
      { id: 'g1', checkOutcomeIds: ['t-great'] },
      { id: 'g2', checkOutcomeIds: ['t-botch', 't-fine'] },
    ]);
    assert.deepEqual(groups[0].checkOutcomeIds, ['t-fine', 't-great'], 'the input is not mutated');
  });

  it('leaves exactly one claimant when the tier is listed twice on disk', () => {
    const groups = [
      { id: 'g1', checkOutcomeIds: ['t-fine'] },
      { id: 'g2', checkOutcomeIds: ['t-fine', 't-fine'] },
      { id: 'g3' },
    ];
    const next = routeTier(groups, 't-fine', 2);
    assert.deepEqual(claimants(next, 't-fine'), [2]);
    assert.deepEqual(next[2].checkOutcomeIds, ['t-fine']);
    assert.deepEqual(routeTier(groups, 't-fine', 1)[1].checkOutcomeIds, ['t-fine']);
  });

  it('returns the same groups when the chosen group is already the only one listing it', () => {
    const groups = [{ id: 'g1', checkOutcomeIds: ['t-fine'] }, { id: 'g2' }];
    assert.equal(routeTier(groups, 't-fine', 0), groups);
  });

  it('keeps every group the edit does not touch by reference', () => {
    const groups = [{ id: 'g1' }, { id: 'g2', checkOutcomeIds: ['t-fine'] }, { id: 'g3' }];
    const next = routeTier(groups, 't-fine', 2);
    assert.equal(next[0], groups[0]);
    assert.deepEqual(next[1], { id: 'g2', checkOutcomeIds: [] });
    assert.deepEqual(next[2], { id: 'g3', checkOutcomeIds: ['t-fine'] });
  });
});
