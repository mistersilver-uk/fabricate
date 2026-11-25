/**
 * `withIterativeStepMoved` (issue 3010, `data-models` Recipe 19), read directly: each step-count
 * change writes the one patch that moves the step configuration with it.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { withIterativeStepMoved } from '../src/ui/svelte/apps/manager/recipe/iterative/iterativeStepMove.js';

const COUNTERS = [{ counterId: 'heat', start: 0 }];
const STEP = { actions: { mode: 'all', actionIds: [] }, success: [] };
const ONE = { id: 's1', name: 'Heat', ingredientSets: [{ id: 'i1' }], resultGroups: [] };
const TWO = { id: 's2', name: 'Quench' };

describe('withIterativeStepMoved', () => {
  const ROWS = [
    [
      'entering moves the recipe step onto step 1 and drops it from the recipe',
      { iterative: { counters: COUNTERS, step: STEP } },
      [ONE],
      { steps: [{ ...ONE, iterative: STEP }], iterative: { counters: COUNTERS } },
    ],
    [
      'entering with an iterative object but no step writes the steps as given',
      { iterative: { counters: COUNTERS } },
      [ONE, TWO],
      { steps: [ONE, TWO], iterative: { counters: COUNTERS } },
    ],
    [
      'entering with a null iterative carries the null',
      { iterative: null },
      [ONE],
      { steps: [ONE], iterative: null },
    ],
    ['entering with no iterative key adds none', {}, [ONE], { steps: [ONE] }],
    [
      'collapsing makes step 1 the single step, its config the recipe step',
      { iterative: { counters: COUNTERS }, steps: [{ ...ONE, iterative: STEP }, TWO] },
      [],
      {
        steps: [],
        ingredientSets: ONE.ingredientSets,
        resultGroups: [],
        toolIds: [],
        timeRequirement: null,
        iterative: { counters: COUNTERS, step: STEP },
      },
    ],
    [
      'collapsing a step 1 with no config removes the recipe step',
      { iterative: { counters: COUNTERS, step: STEP }, steps: [ONE] },
      [],
      {
        steps: [],
        ingredientSets: ONE.ingredientSets,
        resultGroups: [],
        toolIds: [],
        timeRequirement: null,
        iterative: { counters: COUNTERS },
      },
    ],
    [
      'reordering keeps the steps as given and carries the recipe iterative',
      { iterative: { counters: COUNTERS }, steps: [ONE, TWO] },
      [TWO, ONE],
      { steps: [TWO, ONE], iterative: { counters: COUNTERS } },
    ],
  ];

  for (const [title, draft, nextSteps, expected] of ROWS) {
    it(title, () => assert.deepEqual(withIterativeStepMoved(draft, nextSteps), expected));
  }

  it('entering with no step leaves step 1 with no iterative key', () => {
    const { steps } = withIterativeStepMoved({ iterative: { counters: COUNTERS } }, [ONE, TWO]);
    assert.equal(Object.hasOwn(steps[0], 'iterative'), false);
    assert.equal(steps.length, 2);
  });
});
