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
  iterativeNoAllowedActions: ({ recipe }) => {
    step(recipe).actions = { mode: 'only', actionIds: [] };
  },
  iterativeInvalidNumber: ({ recipe }) => {
    recipe.iterative.counters[0].start = 'warm';
  },
  iterativeBoundsInverted: ({ recipe }) => {
    Object.assign(recipe.iterative.counters[0], { min: 15, max: 5 });
  },
  iterativeStartOutOfBounds: ({ recipe }) => {
    recipe.iterative.counters[0].start = 25;
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

  it("answers the recipe's own criticals and those on an action or counter it uses", () => {
    const blockers = (mode) => {
      const { issues, recipe } = world(mode);
      return iterativeStartBlockers(issues, recipe).map(tag);
    };
    assert.deepEqual(blockers('only'), [
      'iterativeInvalidEntry@counter:heat',
      'iterativeUnknownCounter@recipe:r-blade',
    ]);
    assert.deepEqual(blockers('all'), [
      'iterativeInvalidEntry@counter:heat',
      'iterativeInvalidEntry@action:quench',
      'iterativeUnknownCounter@recipe:r-blade',
    ]);
  });

  it('ignores a critical counter issue on a counter the recipe does not use', () => {
    const library = clone(LIBRARY);
    library.counters.push({ id: 'cold', label: 'Cold', limit: 'sideways' });
    const recipes = [new Recipe(clone(RECIPE))];
    const issues = evaluateIterativeReadiness(system({ library }), recipes);
    assert.deepEqual(issues.map(tag), ['iterativeInvalidEntry@counter:cold']);
    assert.deepEqual(iterativeStartBlockers(issues, recipes[0]), []);
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

/** Each recipe-scoped issue as `code@stepIndex`, with `:stepId` when the step has one. */
const addressOf = (issue) =>
  `${issue.code}@${issue.stepIndex}${issue.stepId === null ? '' : `:${issue.stepId}`}`;

/** `RECIPE` with its one step made two explicit steps; `edit` may adjust them. */
function multiStepRecipe(edit = () => {}) {
  const recipe = clone(RECIPE);
  const stepOf = (id, name) => ({
    id,
    name,
    iterative: clone(step(recipe)),
    ingredientSets: clone(recipe.ingredientSets),
    resultGroups: clone(recipe.resultGroups),
  });
  recipe.steps = [stepOf('s-1', 'Heat'), stepOf('s-2', 'Quench')];
  delete recipe.iterative.step;
  delete recipe.resultGroups;
  delete recipe.ingredientSets;
  edit(recipe);
  return recipe;
}

const addressesOf = (recipe, sys = system()) =>
  evaluateIterativeReadiness(sys, [new Recipe(recipe)])
    .filter((issue) => issue.kind === 'recipe')
    .map(addressOf);

describe('step address (D-1)', () => {
  it('premise: the multi-step twin raises nothing', () => {
    assert.deepEqual(addressesOf(multiStepRecipe()), []);
  });

  it('addresses a step-scoped fault to the explicit step that raises it', () => {
    const recipe = multiStepRecipe((r) => {
      r.steps[1].iterative.success = [];
    });
    assert.deepEqual(addressesOf(recipe), ['iterativeNoSuccessRule@1:s-2']);
  });

  it('gives an id-less step its index and a null id', () => {
    const recipe = multiStepRecipe((r) => {
      delete r.steps[1].id;
      r.steps[1].iterative.success = [];
    });
    const issues = evaluateIterativeReadiness(system(), [recipe]);
    assert.deepEqual(issues.map(addressOf), ['iterativeNoSuccessRule@1']);
  });

  it('raises one issue per step for a fault repeated in two steps', () => {
    const recipe = multiStepRecipe((r) => {
      for (const entry of r.steps) entry.iterative.success = [];
    });
    assert.deepEqual(addressesOf(recipe), [
      'iterativeNoSuccessRule@0:s-1',
      'iterativeNoSuccessRule@1:s-2',
    ]);
  });

  it('puts every step configuration code before any produced-when code', () => {
    const recipe = multiStepRecipe((r) => {
      r.steps[0].resultGroups[1].producedWhen = [{ end: 'success', rules: [HEAT_AT_TEN] }];
      r.steps[1].iterative.success = [];
    });
    assert.deepEqual(addressesOf(recipe), [
      'iterativeNoSuccessRule@1:s-2',
      'iterativeSuccessLineOnFailureGroup@0:s-1',
    ]);
  });

  it('addresses the final-step warning to the final step', () => {
    const recipe = multiStepRecipe((r) => {
      r.steps[1].resultGroups[0].producedWhen = [{ end: 'failure' }];
    });
    assert.deepEqual(addressesOf(recipe), ['iterativeFinalStepProducesNothing@1:s-2']);
  });

  it('keeps a Counter Instance fault recipe-wide beside a step rule naming the same code', () => {
    const recipe = multiStepRecipe((r) => {
      r.iterative.counters.push({ counterId: 'cold' });
      r.steps[0].iterative.success.push({ ...HEAT_AT_TEN, counterId: 'ember' });
    });
    assert.deepEqual(addressesOf(recipe), [
      'iterativeUnknownCounter@null',
      'iterativeUnknownCounter@0:s-1',
    ]);
  });

  it('keeps recipe-wide codes null on a multi-step recipe', () => {
    const off = system({ multiStep: false });
    assert.deepEqual(addressesOf(multiStepRecipe(), off), ['iterativeMultiStepOff@null']);
    const unchecked = { ...system(), craftingCheck: { routed: {} } };
    assert.deepEqual(addressesOf(multiStepRecipe(), unchecked), ['iterativeCheckUnavailable@null']);
    const noCounters = multiStepRecipe((r) => {
      r.iterative.counters = [];
    });
    assert.deepEqual(addressesOf(noCounters), [
      'iterativeNoCounters@null',
      'iterativeUnknownCounter@0:s-1',
      'iterativeUnknownCounter@1:s-2',
    ]);
  });

  it('is null on both keys for every issue of a recipe with no explicit steps', () => {
    const issues = issuesAfter(({ recipe }) => {
      step(recipe).success = [];
      recipe.resultGroups[0].producedWhen = [{ end: 'failure' }];
    }).filter((issue) => issue.kind === 'recipe');
    assert.deepEqual(issues.map(addressOf), [
      'iterativeNoSuccessRule@null',
      'iterativeFinalStepProducesNothing@null',
    ]);
  });

  it('gives a library issue neither key', () => {
    const issues = issuesAfter(({ library }) => {
      library.counters[0].limit = 'sideways';
    }).filter((issue) => issue.kind === 'system');
    assert.deepEqual(
      issues.map((issue) => issue.code),
      ['iterativeInvalidEntry']
    );
    assert.ok(issues.every((issue) => !('stepId' in issue) && !('stepIndex' in issue)));
  });
});

describe('iterativeNoAllowedActions', () => {
  const codesWith = (actions) =>
    codesAfter(({ recipe }) => {
      step(recipe).actions = actions;
    });

  it('is raised for an empty Only list alone, and not under All or for a list that does not parse', () => {
    assert.deepEqual(codesWith({ mode: 'only', actionIds: [] }), ['iterativeNoAllowedActions']);
    assert.deepEqual(codesWith({ mode: 'all', actionIds: [] }), []);
    assert.deepEqual(codesWith({ mode: 'only', actionIds: 'stoke' }), ['iterativeInvalidEntry']);
  });

  it('is critical, blocks enabling and is addressed to the step that raises it', () => {
    const recipe = multiStepRecipe((r) => {
      r.steps[1].iterative.actions = { mode: 'only', actionIds: [] };
    });
    assert.deepEqual(addressesOf(recipe), ['iterativeNoAllowedActions@1:s-2']);
    const [raised] = evaluateIterativeReadiness(system(), [new Recipe(recipe)]);
    assert.deepEqual(
      [raised.severity, raised.blocks, raised.message],
      ['critical', 'enable', "A step allows no actions, so it can't be worked."]
    );
  });
});

describe('iterativeStartOutOfBounds', () => {
  const COUNTERS = [
    { id: 'heat', label: 'Heat', limit: 'perRecipe', min: 2, max: 10 },
    { id: 'temper', label: 'Temper', limit: 'global', min: 0, max: 5 },
    { id: 'slag', label: 'Slag', limit: 'none' },
  ];
  const codesWith = (counterId, instance, counters = COUNTERS) => {
    const library = { ...clone(LIBRARY), counters: clone(counters) };
    const recipe = clone(RECIPE);
    recipe.iterative.counters = [{ counterId, ...instance }];
    recipe.iterative.step.success = [{ ...HEAT_AT_TEN, counterId }];
    recipe.iterative.step.hiddenCounterIds = [];
    return evaluateIterativeReadiness(system({ library }), [new Recipe(recipe)])
      .filter((issue) => issue.kind === 'recipe')
      .map((issue) => issue.code);
  };
  const RAISED = ['iterativeStartOutOfBounds'];

  it('is raised below and above the counter bound of a per-recipe counter', () => {
    assert.deepEqual(codesWith('heat', { start: 1 }), RAISED);
    assert.deepEqual(codesWith('heat', { start: 11 }), RAISED);
    assert.deepEqual(codesWith('heat', { start: 2 }), []);
    assert.deepEqual(codesWith('heat', { start: 10 }), []);
  });

  it('prefers the instance bound over the counter bound under perRecipe', () => {
    assert.deepEqual(codesWith('heat', { start: 6, min: 7 }), RAISED);
    assert.deepEqual(codesWith('heat', { start: 12, max: 20 }), []);
  });

  it('judges only a present bound', () => {
    const bare = [{ id: 'heat', label: 'Heat', limit: 'perRecipe' }];
    assert.deepEqual(codesWith('heat', { start: -50, max: 10 }, bare), []);
    assert.deepEqual(codesWith('heat', { start: 50, max: 10 }, bare), RAISED);
  });

  it('ignores a stray instance bound under global, and judges the counter bound', () => {
    assert.deepEqual(codesWith('temper', { start: 9, max: 20 }), RAISED);
    assert.deepEqual(codesWith('temper', { start: 4, max: 1 }), []);
  });

  it('is never raised under none', () => {
    assert.deepEqual(codesWith('slag', { start: 999, min: 0, max: 1 }), []);
  });

  it('is not raised for a formula, a null start or inverted bounds', () => {
    assert.deepEqual(codesWith('heat', { startFormula: '99' }), []);
    assert.deepEqual(codesWith('heat', { start: null }), ['iterativeInvalidNumber']);
    assert.deepEqual(codesWith('heat', { start: 0, min: 8, max: 4 }), ['iterativeBoundsInverted']);
  });

  it('is critical, blocks enabling and refuses the start like iterativeBoundsInverted', () => {
    const recipe = clone(RECIPE);
    recipe.iterative.counters[0].start = 25;
    const issues = evaluateIterativeReadiness(system(), [new Recipe(recipe)]);
    const raised = issues.find((issue) => issue.code === 'iterativeStartOutOfBounds');
    assert.deepEqual(
      [raised.severity, raised.blocks, raised.nav.view, raised.message],
      ['critical', 'enable', 'recipe-edit', 'A counter starts outside its minimum or maximum.']
    );
    assert.deepEqual(iterativeStartBlockers(issues, recipe), [raised]);
  });
});

describe('counter and action addresses (#3038)', () => {
  const ADDRESS_KEYS = ['counterId', 'counterName', 'actionId', 'actionName'];
  const addressKeysOf = (issue) => ADDRESS_KEYS.filter((key) => Object.hasOwn(issue, key));
  const raised = (edit, code) =>
    issuesAfter(edit).filter((issue) => issue.kind === 'recipe' && issue.code === code);
  const only = (edit, code) => {
    const issues = raised(edit, code);
    assert.equal(issues.length, 1, `${code} once: ${issues.length}`);
    return issues[0];
  };
  const SLAG = { id: 'slag', label: 'Slag', limit: 'perRecipe', min: 0, max: 5 };
  const RUST = { id: 'rust', label: 'Rust', limit: 'perRecipe', min: 0 };
  /** Library counters `slag` and `rust`, the recipe carrying the ids in `carried`, and one effect `amount`. */
  const reads =
    (amount, ...carried) =>
    ({ library, recipe }) => {
      library.counters.push(SLAG, RUST);
      recipe.iterative.counters.push(...carried.map((counterId) => ({ counterId })));
      library.actions[0].effects[0].amount = amount;
    };

  it('addresses an unknown Counter Instance, the first of two, as one issue', () => {
    const edit = ({ recipe }) => {
      recipe.iterative.counters.push({ counterId: 'rust' }, { counterId: 'slag' });
    };
    const issue = only(edit, 'iterativeUnknownCounter');
    assert.deepEqual([issue.counterId, issue.counterName, issue.stepIndex], ['rust', 'rust', null]);
    assert.deepEqual(addressKeysOf(issue), ['counterId', 'counterName']);
  });

  it('keeps the instance when a rule counter of the same code is raised later', () => {
    const issue = only(({ recipe }) => {
      recipe.iterative.counters.push({ counterId: 'rust' });
      step(recipe).success.push({ ...HEAT_AT_TEN, counterId: 'cold' });
    }, 'iterativeUnknownCounter');
    assert.equal(issue.counterId, 'rust');
  });

  it('addresses a rule counter that no instance carries', () => {
    const issue = only(({ recipe }) => {
      step(recipe).success.push({ ...HEAT_AT_TEN, counterId: 'cold' });
    }, 'iterativeUnknownCounter');
    assert.deepEqual([issue.counterId, issue.counterName], ['cold', 'cold']);
  });

  it('addresses the first hidden or locked counter that no instance carries, in list order', () => {
    const hidden = only(({ recipe }) => {
      Object.assign(step(recipe), {
        hiddenCounterIds: ['heat', 'cold', 'ash'],
        lockedCounterIds: ['frost'],
      });
    }, 'iterativeUnknownCounter');
    assert.equal(hidden.counterId, 'cold');
    const locked = only(({ recipe }) => {
      Object.assign(step(recipe), {
        hiddenCounterIds: ['heat'],
        lockedCounterIds: ['ash', 'cold'],
      });
    }, 'iterativeUnknownCounter');
    assert.equal(locked.counterId, 'ash');
  });

  it('addresses the first step action id naming no library action, in list order', () => {
    const issue = only(({ recipe }) => {
      step(recipe).actions.actionIds = ['stoke', 'quench', 'anneal'];
    }, 'iterativeUnknownAction');
    assert.deepEqual(
      [issue.actionId, issue.actionName, addressKeysOf(issue)],
      ['quench', 'quench', ['actionId', 'actionName']]
    );
  });

  it('addresses a previousAction rule to its first absent id, and a counter rule to its counter', () => {
    const action = only(({ recipe }) => {
      step(recipe).failure = [
        { source: 'previousAction', actionIds: ['stoke', 'quench', 'anneal'] },
      ];
    }, 'iterativeUnknownAction');
    assert.deepEqual([action.actionId, Object.hasOwn(action, 'counterId')], ['quench', false]);
    const counter = only(({ recipe }) => {
      step(recipe).failure = [{ ...HEAT_AT_TEN, counterId: 'cold' }];
    }, 'iterativeUnknownCounter');
    assert.deepEqual([counter.counterId, Object.hasOwn(counter, 'actionId')], ['cold', false]);
  });

  it('forwards a produced-when rule address', () => {
    const counter = only(({ recipe }) => {
      recipe.resultGroups[0].producedWhen = [
        { end: 'success', rules: [{ ...HEAT_AT_TEN, counterId: 'cold' }] },
      ];
    }, 'iterativeUnknownCounter');
    assert.equal(counter.counterId, 'cold');
    const action = only(({ recipe }) => {
      recipe.resultGroups[0].producedWhen = [
        { end: 'success', rules: [{ source: 'previousAction', actionIds: ['stoke', 'quench'] }] },
      ];
    }, 'iterativeUnknownAction');
    assert.equal(action.actionId, 'quench');
  });

  it('addresses the instance fault codes to the instance, named by its label', () => {
    const cases = {
      iterativeInvalidNumber: ({ recipe }) => {
        recipe.iterative.counters[0].start = null;
      },
      iterativeBoundsInverted: ({ recipe }) => {
        Object.assign(recipe.iterative.counters[0], { min: 15, max: 5 });
      },
      iterativeStartOutOfBounds: ({ recipe }) => {
        recipe.iterative.counters[0].start = 25;
      },
    };
    for (const [code, edit] of Object.entries(cases)) {
      const issue = only(edit, code);
      assert.deepEqual([issue.counterId, issue.counterName], ['heat', 'Heat'], code);
    }
  });

  it('names a blank-labelled counter or action by its id, and trims a padded label', () => {
    const edit = ({ library, recipe }) => {
      library.counters[0].label = '  \t';
      library.actions[0].label = '';
      recipe.iterative.counters[0].start = null;
      step(recipe).actions.actionIds = ['stoke', 'quench'];
    };
    assert.equal(only(edit, 'iterativeInvalidNumber').counterName, 'heat');
    assert.equal(only(edit, 'iterativeUnknownAction').actionName, 'quench');
    const padded = only(({ library, recipe }) => {
      library.counters[0].label = '  Heat  ';
      recipe.iterative.counters[0].start = null;
    }, 'iterativeInvalidNumber');
    assert.equal(padded.counterName, 'Heat');
  });

  it('addresses the first rolling allowed action in library order, Only lists included', () => {
    const rollers = (listed) => (context) => {
      const { library, recipe } = context;
      library.actions.push({ ...clone(library.actions[0]), id: 'forge', label: 'Forge' });
      step(recipe).actions = listed
        ? { mode: 'only', actionIds: listed }
        : { mode: 'all', actionIds: [] };
      return { craftingCheck: { routed: {} } };
    };
    const all = only(rollers(null), 'iterativeCheckUnavailable');
    assert.deepEqual([all.actionId, all.actionName, all.stepIndex], ['stoke', 'Stoke', null]);
    const reversed = only(rollers(['forge', 'stoke']), 'iterativeCheckUnavailable');
    assert.equal(reversed.actionId, 'stoke');
    assert.equal(only(rollers(['forge']), 'iterativeCheckUnavailable').actionId, 'forge');
  });

  it('addresses the first expression root that no Counter Instance carries', () => {
    const edit = reads('1d4 + @counter.slag + @counter.rust');
    const issue = only(edit, 'iterativeUnknownCounter');
    assert.deepEqual([issue.counterId, issue.counterName], ['slag', 'Slag']);
  });

  it('addresses the first expression root whose bound is left unset', () => {
    const edit = reads('1d4 + @max.slag + @max.rust', 'slag', 'rust');
    const issue = only(edit, 'iterativeExpressionBoundUnset');
    assert.deepEqual([issue.counterId, issue.counterName], ['rust', 'Rust']);
  });

  it('carries no address on the issues that name no counter or action', () => {
    const unaddressed = {
      iterativeNoCounters: ({ recipe }) => {
        recipe.iterative.counters = [];
      },
      iterativeNoAllowedActions: ({ recipe }) => {
        step(recipe).actions = { mode: 'only', actionIds: [] };
      },
      iterativeNoSuccessRule: ({ recipe }) => {
        step(recipe).success = [];
      },
      iterativeInvalidRule: ({ recipe }) => {
        step(recipe).failure = [{ source: 'mystery' }];
      },
    };
    for (const [code, edit] of Object.entries(unaddressed)) {
      const issues = raised(edit, code);
      assert.ok(issues.length > 0, code);
      assert.ok(
        issues.every((issue) => addressKeysOf(issue).length === 0),
        code
      );
    }
  });

  it('carries no address on a library issue', () => {
    const issues = issuesAfter(({ library }) => {
      library.actions[0].costs[0].counterId = 'cold';
      library.actions[0].availability.rules = [{ source: 'previousAction', actionIds: ['quench'] }];
    }).filter((issue) => issue.kind === 'system');
    assert.deepEqual(
      issues.map((issue) => issue.code),
      ['iterativeUnknownCounter', 'iterativeUnknownAction']
    );
    assert.ok(issues.every((issue) => addressKeysOf(issue).length === 0));
  });

  it('leaves the issue count, severity and nav as the codes alone give them', () => {
    const edit = ({ recipe }) => {
      recipe.iterative.counters.push({ counterId: 'rust' }, { counterId: 'slag' });
      step(recipe).success.push({ ...HEAT_AT_TEN, counterId: 'cold' });
      step(recipe).actions.actionIds = ['quench', 'anneal'];
    };
    const issues = issuesAfter(edit).filter((issue) => issue.kind === 'recipe');
    assert.deepEqual(
      issues.map((issue) => [issue.code, issue.severity, issue.blocks, issue.nav.tab]),
      [
        ['iterativeUnknownCounter', 'critical', 'enable', 'overview'],
        ['iterativeUnknownAction', 'critical', 'enable', 'overview'],
      ]
    );
  });

  it('addresses the first unknown expression root in counter, min, max, target order', () => {
    for (const [amount, wanted] of [
      ['@min.b + @counter.a', 'a'],
      ['@max.c + @min.b', 'b'],
      ['@target.d + @max.c', 'c'],
    ]) {
      const issue = only(reads(amount), 'iterativeUnknownCounter');
      assert.equal(issue.counterId, wanted, amount);
    }
  });

  it('addresses the first unset expression root in min, max, target order', () => {
    const unset =
      (amount, ...extra) =>
      (context) => {
        const { library, recipe } = context;
        library.counters.push(
          { id: 'a', limit: 'perRecipe', max: 5 },
          { id: 'b', limit: 'perRecipe', min: 0 },
          { id: 'c', limit: 'perRecipe', min: 0, max: 5 }
        );
        recipe.iterative.counters.push(
          { counterId: 'a', target: 1 },
          { counterId: 'b', target: 1 },
          { counterId: 'c' }
        );
        library.actions[0].effects[0].amount = amount;
        for (const edit of extra) edit(context);
      };
    for (const [amount, wanted] of [
      ['@max.b + @min.a', 'a'],
      ['@target.c + @max.b', 'b'],
      ['@target.c + @min.a', 'a'],
    ]) {
      assert.equal(only(unset(amount), 'iterativeExpressionBoundUnset').counterId, wanted, amount);
    }
  });

  it('addresses the first unset root of the first analysis, a start formula before an amount', () => {
    const both =
      (startFormula, amount) =>
      ({ library, recipe }) => {
        library.counters.push(
          { id: 'a', limit: 'perRecipe', min: 0 },
          { id: 'b', limit: 'perRecipe', min: 0 }
        );
        recipe.iterative.counters.push(
          { counterId: 'a', target: 1, startFormula },
          { counterId: 'b', target: 1 }
        );
        library.actions[0].effects[0].amount = amount;
      };
    const unset = (edit) => only(edit, 'iterativeExpressionBoundUnset').counterId;
    assert.equal(unset(both('1', '@max.a')), 'a', 'a lone amount');
    assert.equal(unset(both('@max.b', '@max.a')), 'b', 'the start formula reads first');
    assert.equal(unset(both('1', '@max.b + @max.a')), 'b', 'the first root of one amount');
    const second = ({ library, recipe }) => {
      both('1', '@max.b')({ library, recipe });
      library.actions[0].effects.push({
        ...library.actions[0].effects[0],
        id: 'cool',
        amount: '@max.a',
      });
    };
    assert.equal(unset(second), 'b', 'the first analysis of two');
  });

  it('carries no address when the first offender has no readable id', () => {
    for (const hiddenCounterIds of [[''], [7]]) {
      const issue = only(({ recipe }) => {
        step(recipe).hiddenCounterIds = hiddenCounterIds;
      }, 'iterativeUnknownCounter');
      assert.deepEqual(addressKeysOf(issue), [], JSON.stringify(hiddenCounterIds));
    }
    const action = only(({ recipe }) => {
      step(recipe).actions.actionIds = [''];
    }, 'iterativeUnknownAction');
    assert.deepEqual(addressKeysOf(action), []);
  });

  it('names a counter by its trimmed label even when the library arrives unnormalized', () => {
    const issue = only(({ library, recipe }) => {
      recipe.iterative.counters[0].start = null;
      return {
        iterative: {
          ...normalizeIterativeLibrary(library),
          counters: [{ ...normalizeIterativeLibrary(library).counters[0], label: '  Heat  ' }],
          actions: normalizeIterativeLibrary(library).actions.map((a) => ({ ...a, label: ' \t' })),
        },
      };
    }, 'iterativeInvalidNumber');
    assert.equal(issue.counterName, 'Heat');
  });
});
