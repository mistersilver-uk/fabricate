/**
 * `counterRemovalPatch` (issue 3010): removing a Counter Instance prunes its id from every hide and
 * lock list in the same patch, once no other instance names that counter.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { counterRemovalPatch } from '../src/ui/svelte/apps/manager/recipe/iterative/iterativeCounterRows.js';

const HEAT = { counterId: 'heat', start: 0 };
const TEMPER = { counterId: 'temper', start: 0 };
const lists = (hidden, locked) => ({ hiddenCounterIds: hidden, lockedCounterIds: locked });

describe('counterRemovalPatch', () => {
  it('prunes a single step’s lists and writes no steps', () => {
    const recipe = {
      iterative: { counters: [HEAT, TEMPER], step: { ...lists(['heat'], ['heat', 'temper']) } },
    };
    assert.deepEqual(counterRemovalPatch(recipe, 0), {
      iterative: { counters: [TEMPER], step: lists([], ['temper']) },
    });
  });

  it('prunes every explicit step, and leaves a step with no iterative part as it was', () => {
    const plain = { id: 's2' };
    const recipe = {
      iterative: { counters: [HEAT, TEMPER] },
      steps: [{ id: 's1', iterative: lists(['temper'], ['heat']) }, plain],
    };
    const patch = counterRemovalPatch(recipe, 0);
    assert.deepEqual(patch.steps, [{ id: 's1', iterative: lists(['temper'], []) }, plain]);
    assert.equal(patch.steps[1], plain);
  });

  it('keeps the lists while another instance still names the counter', () => {
    const recipe = { iterative: { counters: [HEAT, HEAT], step: lists(['heat'], []) } };
    assert.deepEqual(counterRemovalPatch(recipe, 1), {
      iterative: { counters: [HEAT], step: lists(['heat'], []) },
    });
  });

  it('keeps a list that does not parse, as the normalizer does', () => {
    const recipe = { iterative: { counters: [HEAT], step: lists('heat', ['heat']) } };
    assert.deepEqual(counterRemovalPatch(recipe, 0).iterative.step, lists('heat', []));
  });

  it('starts an absent iterative as no counters', () => {
    assert.deepEqual(counterRemovalPatch({}, 0), { iterative: { counters: [] } });
  });
});
