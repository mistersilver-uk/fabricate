/** The iterative structural readiness codes (`resolution-modes` § Iterative Validation). */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { installFoundryEnv } from './helpers/foundryEnv.js';

installFoundryEnv();

const { Recipe } = await import('../src/models/Recipe.js');
const { normalizeIterativeLibrary } = await import('../src/systems/normalize/iterativeLibrary.js');
const {
  evaluateIterativeReadiness,
  ITERATIVE_READINESS_CODES,
  iterativeStepModeIssues,
  needsIterativeSetup,
} = await import('../src/systems/iterative/iterativeReadiness.js');

const HEAT_AT_TEN = { source: 'counter', counterId: 'heat', op: '>=', value: 10 };

/** A library that raises nothing: one bounded counter and one checked action. */
const LIBRARY = {
  counters: [{ id: 'heat', label: 'Heat', limit: 'perRecipe', min: 0, max: 20 }],
  actions: [
    {
      id: 'stoke',
      label: 'Stoke',
      check: 'roll',
      availability: { rules: [{ source: 'sessionCount', op: '<', value: 5 }] },
      costs: [{ id: 'fuel', counterId: 'heat', amount: '1' }],
      effects: [
        {
          id: 'warm',
          when: { checkOutcomeIds: ['hit'], rules: [HEAT_AT_TEN] },
          target: { kind: 'counter', counterId: 'heat' },
          op: 'add',
          amount: '1d4',
        },
      ],
    },
  ],
};

/** A single-step recipe that raises nothing against `LIBRARY`. */
const RECIPE = {
  id: 'r-blade',
  name: 'Blade',
  craftingSystemId: 'sys-it',
  iterative: {
    counters: [{ counterId: 'heat', start: 2, target: 12 }],
    step: {
      actions: { mode: 'only', actionIds: ['stoke'] },
      hiddenCounterIds: ['heat'],
      success: [HEAT_AT_TEN],
      failure: [{ source: 'previousAction', actionIds: ['stoke'] }],
    },
  },
  ingredientSets: [{ id: 'set-1', ingredientGroups: [] }],
  resultGroups: [
    { id: 'g-blade', name: 'Blade', results: [], producedWhen: [{ end: 'success' }] },
    {
      id: 'g-slag',
      name: 'Slag',
      role: 'failure',
      results: [],
      producedWhen: [{ end: 'failure' }],
    },
  ],
};

const clone = (value) => JSON.parse(JSON.stringify(value));

function system({ library = LIBRARY, multiStep = true, routed = true } = {}) {
  return {
    id: 'sys-it',
    name: 'Forge',
    resolutionMode: 'iterative',
    features: { multiStepRecipes: multiStep },
    craftingCheck: {
      routed: routed
        ? {
            type: 'fixed',
            rollFormula: '1d20',
            fixedOutcomes: [{ id: 'hit', name: 'Hit', success: true }],
          }
        : {},
    },
    iterative: normalizeIterativeLibrary(library),
  };
}

/** The codes a world raises, after `edit` mutates a copy of the library and the recipe. */
function codesAfter(edit = () => {}, options = {}) {
  const library = clone(LIBRARY);
  const recipe = clone(RECIPE);
  const overrides = edit({ library, recipe }) ?? {};
  const sys = { ...system({ library, ...options }), ...overrides };
  return evaluateIterativeReadiness(sys, [new Recipe(recipe)]).map((issue) => issue.code);
}

const step = (recipe) => recipe.iterative.step;
const cost = (library) => library.actions[0].costs[0];

/** Each code with one minimal edit that raises it. */
const FIRES = {
  iterativeNoCounters: ({ recipe }) => {
    recipe.iterative.counters = [];
  },
  iterativeNoSuccessRule: ({ recipe }) => {
    step(recipe).success = [];
  },
  iterativeUnknownCounter: ({ recipe }) => {
    step(recipe).lockedCounterIds = ['cold'];
  },
  iterativeUnknownAction: ({ recipe }) => {
    step(recipe).actions.actionIds = ['quench'];
  },
  iterativeInvalidNumber: ({ recipe }) => {
    recipe.iterative.counters[0].start = 'warm';
  },
  iterativeBoundsInverted: ({ recipe }) => {
    Object.assign(recipe.iterative.counters[0], { min: 15, max: 5 });
  },
  iterativeInvalidRule: ({ recipe }) => {
    step(recipe).failure = [{ source: 'mystery' }];
  },
  iterativeInvalidEntry: ({ recipe }) => {
    recipe.resultGroups[0].producedWhen = [{ end: 'sideways' }];
  },
  iterativeCheckUnavailable: () => ({ craftingCheck: { routed: {} } }),
  iterativeMultiStepOff: ({ recipe }) => {
    recipe.steps = [
      {
        id: 's-1',
        name: 'Heat',
        iterative: step(recipe),
        ingredientSets: recipe.ingredientSets,
        resultGroups: recipe.resultGroups,
      },
    ];
    return { features: { multiStepRecipes: false } };
  },
  iterativeSuccessLineOnFailureGroup: ({ recipe }) => {
    recipe.resultGroups[1].producedWhen = [{ end: 'success', rules: [HEAT_AT_TEN] }];
  },
  iterativeFinalStepProducesNothing: ({ recipe }) => {
    recipe.resultGroups[0].producedWhen = [{ end: 'failure' }];
  },
  iterativeUnknownCheckOutcome: ({ library }) => {
    library.actions[0].effects[0].when.checkOutcomeIds = ['crit'];
  },
  iterativeVersionUnsupported: () => ({ iterative: { version: 2, counters: 'opaque' } }),
};

describe('each readiness code fires on its minimal input and not on its corrected twin', () => {
  it('the corrected twin raises nothing', () => {
    assert.deepEqual(codesAfter(), []);
  });

  for (const [code, edit] of Object.entries(FIRES)) {
    it(code, () => {
      assert.ok(codesAfter(edit).includes(code), codesAfter(edit).join(', ') || 'no issue');
    });
  }
});

describe('the other inputs each code reads', () => {
  const cases = {
    'a Counter Instance naming no library counter': [
      'iterativeUnknownCounter',
      ({ recipe }) => {
        recipe.iterative.counters.push({ counterId: 'cold' });
      },
    ],
    'a rule naming no Counter Instance': [
      'iterativeUnknownCounter',
      ({ recipe }) => {
        step(recipe).success.push({ ...HEAT_AT_TEN, counterId: 'cold' });
      },
    ],
    'a library cost naming no counter': [
      'iterativeUnknownCounter',
      ({ library }) => {
        cost(library).counterId = 'cold';
      },
    ],
    'a previousAction naming no action': [
      'iterativeUnknownAction',
      ({ recipe }) => {
        step(recipe).failure.push({ source: 'previousAction', actionIds: ['quench'] });
      },
    ],
    'a library counter with a non-finite bound': [
      'iterativeInvalidNumber',
      ({ library }) => {
        library.counters[0].max = 'lots';
      },
    ],
    'a library counter whose bounds are inverted': [
      'iterativeBoundsInverted',
      ({ library }) => Object.assign(library.counters[0], { min: 30, max: 20 }),
    ],
    'an unparseable availability rule': [
      'iterativeInvalidRule',
      ({ library }) => {
        library.actions[0].availability.rules.push({ source: 'counter', op: '>' });
      },
    ],
    'an unparseable cost': [
      'iterativeInvalidEntry',
      ({ library }) => {
        cost(library).counterId = 'Bad id';
      },
    ],
    'an out-of-enum check': [
      'iterativeInvalidEntry',
      ({ library }) => {
        library.actions[0].check = 'always';
      },
    ],
    'an out-of-enum limit': [
      'iterativeInvalidEntry',
      ({ library }) => {
        library.counters[0].limit = 'unbounded';
      },
    ],
    'an out-of-enum combine': [
      'iterativeInvalidEntry',
      ({ library }) => {
        library.actions[0].availability.combine = 'most';
      },
    ],
    'an out-of-enum actions.mode': [
      'iterativeInvalidEntry',
      ({ recipe }) => {
        step(recipe).actions.mode = 'some';
      },
    ],
  };

  for (const [name, [code, edit]] of Object.entries(cases)) {
    it(`${code}: ${name}`, () => {
      assert.ok(codesAfter(edit).includes(code), codesAfter(edit).join(', ') || 'no issue');
    });
  }

  it('reads the effective perRecipe bounds, and not the unread ones under none', () => {
    const inverted = ({ recipe }) => Object.assign(recipe.iterative.counters[0], { max: -1 });
    assert.ok(
      codesAfter(inverted).includes('iterativeBoundsInverted'),
      'counter min 0 against max -1'
    );
    const unread = ({ library, recipe }) => {
      library.counters[0].limit = 'none';
      inverted({ recipe });
    };
    assert.ok(!codesAfter(unread).includes('iterativeBoundsInverted'));
  });

  it('raises nothing for a system in another mode', () => {
    const sys = { ...system(), resolutionMode: 'simple' };
    const recipe = clone(RECIPE);
    recipe.iterative.counters = [];
    assert.deepEqual(evaluateIterativeReadiness(sys, [new Recipe(recipe)]), []);
  });
});

describe('needsIterativeSetup and the step-mode issue', () => {
  it('reads exactly the two setup codes', () => {
    const issues = (code) => [{ code }];
    assert.equal(needsIterativeSetup(issues('iterativeNoCounters')), true);
    assert.equal(needsIterativeSetup(issues('iterativeNoSuccessRule')), true);
    const others = ITERATIVE_READINESS_CODES.filter(
      (code) => !/NoCounters|NoSuccessRule/u.test(code)
    );
    assert.equal(others.length, ITERATIVE_READINESS_CODES.length - 2);
    assert.ok(others.every((code) => !needsIterativeSetup(issues(code))));
  });

  it('asks one ingredient set per step, waived when completeness is', () => {
    const steps = [
      { name: 'Heat', ingredientSets: [{}] },
      { name: '', ingredientSets: [] },
      { name: 'Quench', ingredientSets: [{}, {}] },
    ];
    const issues = iterativeStepModeIssues(steps, { requireComplete: true });
    assert.deepEqual(
      issues.map((issue) => [issue.code, issue.params.step, issue.params.mode]),
      [
        ['stepIngredientSetCountExact', '2', 'iterative'],
        ['stepIngredientSetCountExact', 'Quench', 'iterative'],
      ]
    );
    assert.match(issues[1].message, /exactly 1 ingredient set in iterative mode/u);
    assert.deepEqual(iterativeStepModeIssues(steps, { requireComplete: false }), []);
  });
});
