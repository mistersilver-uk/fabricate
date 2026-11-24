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
  iterativeStartBlockers,
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

/** The issues a world raises, after `edit` mutates a copy of the library and the recipe. */
function issuesAfter(edit = () => {}, options = {}) {
  const library = clone(LIBRARY);
  const recipe = clone(RECIPE);
  const overrides = edit({ library, recipe }) ?? {};
  const sys = { ...system({ library, ...options }), ...overrides };
  return evaluateIterativeReadiness(sys, [new Recipe(recipe)]);
}

function codesAfter(edit = () => {}, options = {}) {
  return issuesAfter(edit, options).map((issue) => issue.code);
}

/** The scope of an issue on the recipe, or on the library counter or action `entityId`. */
const ON_RECIPE = { kind: 'recipe', entityKind: 'recipe', entityId: 'r-blade' };
const onLibrary = (entityKind, entityId) => ({ kind: 'system', entityKind, entityId });
const ON_HEAT = onLibrary('counter', 'heat');
const ON_STOKE = onLibrary('action', 'stoke');

/** Asserts `edit` raises `code` on exactly the record `scope` names. */
function assertRaisedOn(edit, code, scope) {
  const issues = issuesAfter(edit);
  const scoped = (issue) =>
    issue.code === code && Object.entries(scope).every(([key, value]) => issue[key] === value);
  const raised = issues.map((issue) => `${issue.code}@${issue.entityKind}:${issue.entityId}`);
  assert.ok(issues.some(scoped), raised.join(', ') || 'no issue');
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
  const effect = (library) => library.actions[0].effects[0];
  const cases = {
    'a Counter Instance naming no library counter': [
      'iterativeUnknownCounter',
      ON_RECIPE,
      ({ recipe }) => {
        recipe.iterative.counters.push({ counterId: 'cold' });
      },
    ],
    'a rule naming no Counter Instance': [
      'iterativeUnknownCounter',
      ON_RECIPE,
      ({ recipe }) => {
        step(recipe).success.push({ ...HEAT_AT_TEN, counterId: 'cold' });
      },
    ],
    'a library cost naming no counter': [
      'iterativeUnknownCounter',
      ON_STOKE,
      ({ library }) => {
        cost(library).counterId = 'cold';
      },
    ],
    'a previousAction naming no action': [
      'iterativeUnknownAction',
      ON_RECIPE,
      ({ recipe }) => {
        step(recipe).failure.push({ source: 'previousAction', actionIds: ['quench'] });
      },
    ],
    'a Counter Instance startFormula that is not an expression': [
      'iterativeInvalidNumber',
      ON_RECIPE,
      ({ recipe }) => {
        recipe.iterative.counters[0].startFormula = {};
      },
    ],
    'a library counter with a non-finite bound': [
      'iterativeInvalidNumber',
      ON_HEAT,
      ({ library }) => {
        library.counters[0].max = 'lots';
      },
    ],
    'a library counter whose bounds are inverted': [
      'iterativeBoundsInverted',
      ON_HEAT,
      ({ library }) => Object.assign(library.counters[0], { min: 30, max: 20 }),
    ],
    'an unparseable availability rule': [
      'iterativeInvalidRule',
      ON_STOKE,
      ({ library }) => {
        library.actions[0].availability.rules.push({ source: 'counter', op: '>' });
      },
    ],
    'an unparseable cost': [
      'iterativeInvalidEntry',
      ON_STOKE,
      ({ library }) => {
        cost(library).counterId = 'Bad id';
      },
    ],
    'a non-boolean effect success': [
      'iterativeInvalidEntry',
      ON_STOKE,
      ({ library }) => {
        effect(library).when.success = 'true';
      },
    ],
    'a non-array effect checkOutcomeIds': [
      'iterativeInvalidEntry',
      ON_STOKE,
      ({ library }) => {
        effect(library).when.checkOutcomeIds = 'hit';
      },
    ],
    'an effect checkOutcomeIds entry that is not an id': [
      'iterativeInvalidEntry',
      ON_STOKE,
      ({ library }) => {
        effect(library).when.checkOutcomeIds = ['hit', 5];
      },
    ],
    'a previousAction id that is not an id': [
      'iterativeInvalidRule',
      ON_RECIPE,
      ({ recipe }) => {
        step(recipe).failure = [{ source: 'previousAction', actionIds: ['stoke', 5] }];
      },
    ],
    'a non-array effect rule list': [
      'iterativeInvalidEntry',
      ON_STOKE,
      ({ library }) => {
        effect(library).when.rules = HEAT_AT_TEN;
      },
    ],
    'a non-array availability rule list': [
      'iterativeInvalidEntry',
      ON_STOKE,
      ({ library }) => {
        library.actions[0].availability.rules = HEAT_AT_TEN;
      },
    ],
    'a non-array cost list': [
      'iterativeInvalidEntry',
      ON_STOKE,
      ({ library }) => {
        library.actions[0].costs = {};
      },
    ],
    'a non-array effect list': [
      'iterativeInvalidEntry',
      ON_STOKE,
      ({ library }) => {
        library.actions[0].effects = 'warm';
      },
    ],
    'an out-of-enum check': [
      'iterativeInvalidEntry',
      ON_STOKE,
      ({ library }) => {
        library.actions[0].check = 'always';
      },
    ],
    'an out-of-enum limit': [
      'iterativeInvalidEntry',
      ON_HEAT,
      ({ library }) => {
        library.counters[0].limit = 'unbounded';
      },
    ],
    'an out-of-enum combine': [
      'iterativeInvalidEntry',
      ON_STOKE,
      ({ library }) => {
        library.actions[0].availability.combine = 'most';
      },
    ],
    'a non-array hiddenCounterIds': [
      'iterativeInvalidEntry',
      ON_RECIPE,
      ({ recipe }) => {
        step(recipe).hiddenCounterIds = 'heat';
      },
    ],
    'a lockedCounterIds entry that is not an id': [
      'iterativeInvalidEntry',
      ON_RECIPE,
      ({ recipe }) => {
        step(recipe).lockedCounterIds = ['heat', 5];
      },
    ],
    'a non-array actions.actionIds under only': [
      'iterativeInvalidEntry',
      ON_RECIPE,
      ({ recipe }) => {
        Object.assign(step(recipe).actions, { mode: 'only', actionIds: 'stoke' });
      },
    ],
    'an actions.actionIds entry that is not an id': [
      'iterativeInvalidEntry',
      ON_RECIPE,
      ({ recipe }) => {
        step(recipe).actions.actionIds = ['stoke', 'Bad id'];
      },
    ],
    'an actions value that is not an object': [
      'iterativeInvalidEntry',
      ON_RECIPE,
      ({ recipe }) => {
        step(recipe).actions = 'all';
      },
    ],
    'an out-of-enum actions.mode': [
      'iterativeInvalidEntry',
      ON_RECIPE,
      ({ recipe }) => {
        step(recipe).actions.mode = 'some';
      },
    ],
  };

  for (const [name, [code, scope, edit]] of Object.entries(cases)) {
    it(`${code}: ${name}`, () => {
      assertRaisedOn(edit, code, scope);
    });
  }

  it('raises no library bounds issue under limit none, whose bounds are unread', () => {
    const unread = ({ library }) =>
      Object.assign(library.counters[0], { limit: 'none', min: 30, max: 20 });
    assert.ok(
      !codesAfter(unread).includes('iterativeBoundsInverted'),
      codesAfter(unread).join(', ')
    );
  });

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

describe('iterativeStartBlockers', () => {
  const tag = (issue) => `${issue.code}@${issue.entityKind}:${issue.entityId}`;

  /** Every issue of a world whose library and recipes each raise one issue of every scope. */
  function world(mode) {
    const library = clone(LIBRARY);
    library.counters[0].limit = 'sideways';
    library.actions.push({ id: 'quench', label: 'Quench', check: 'always' });
    const recipe = clone(RECIPE);
    step(recipe).actions.mode = mode;
    step(recipe).lockedCounterIds = ['cold'];
    recipe.resultGroups[1].producedWhen = [{ end: 'success' }];
    const other = { ...clone(RECIPE), id: 'r-other' };
    other.iterative.counters = [];
    const recipes = [new Recipe(recipe), new Recipe(other)];
    return { issues: evaluateIterativeReadiness(system({ library }), recipes), recipe: recipes[0] };
  }

  it('the premise: the world raises counter, action, warning and other-recipe issues', () => {
    const { issues } = world('all');
    assert.deepEqual(issues.map(tag), [
      'iterativeInvalidEntry@counter:heat',
      'iterativeInvalidEntry@action:quench',
      'iterativeUnknownCounter@recipe:r-blade',
      'iterativeSuccessLineOnFailureGroup@recipe:r-blade',
      'iterativeNoCounters@recipe:r-other',
      'iterativeUnknownCounter@recipe:r-other',
    ]);
  });

  it("answers the recipe's own criticals and those on an action one of its steps allows", () => {
    const blockers = (mode) => {
      const { issues, recipe } = world(mode);
      return iterativeStartBlockers(issues, recipe).map(tag);
    };
    assert.deepEqual(blockers('only'), ['iterativeUnknownCounter@recipe:r-blade']);
    assert.deepEqual(blockers('all'), [
      'iterativeInvalidEntry@action:quench',
      'iterativeUnknownCounter@recipe:r-blade',
    ]);
  });

  it('answers iterativeVersionUnsupported for every recipe', () => {
    const sys = { ...system(), iterative: { version: 2 } };
    const issues = evaluateIterativeReadiness(sys, [new Recipe(clone(RECIPE))]);
    assert.deepEqual(iterativeStartBlockers(issues, clone(RECIPE)).map(tag), [
      'iterativeVersionUnsupported@system:null',
    ]);
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
