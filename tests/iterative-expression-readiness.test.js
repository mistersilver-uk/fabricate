/** The expression-validity readiness codes (`resolution-modes` § Iterative Validation). */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { installFoundryEnv } from './helpers/foundryEnv.js';

installFoundryEnv();

const { Recipe } = await import('../src/models/Recipe.js');
const { CraftingSystemManager } = await import('../src/systems/CraftingSystemManager.js');
const { normalizeIterativeLibrary } = await import('../src/systems/normalize/iterativeLibrary.js');
const { evaluateIterativeReadiness, ITERATIVE_READINESS_MESSAGES, iterativeStartBlockers } =
  await import('../src/systems/iterative/iterativeReadiness.js');
const { evaluateSystemValidation } = await import('../src/systems/systemValidation.js');

const heatAtTen = { source: 'counter', counterId: 'heat', op: '>=', value: 10 };

/** A library that raises nothing: a perRecipe, a global and an unbounded counter, and two actions. */
const LIBRARY = {
  counters: [
    { id: 'heat', label: 'Heat', limit: 'perRecipe', min: 0, max: 20 },
    { id: 'ember', label: 'Embers', limit: 'global', min: 0, max: 5 },
    { id: 'chill', label: 'Chill', limit: 'none' },
  ],
  actions: [
    {
      id: 'stoke',
      label: 'Stoke',
      check: 'roll',
      costs: [{ id: 'fuel', counterId: 'ember', amount: '1 + @counter.ember' }],
      effects: [
        {
          id: 'warm',
          when: { checkOutcomeIds: ['hit'] },
          target: { kind: 'counter', counterId: 'heat' },
          op: 'add',
          amount: '1d4 + @counter.ember + @check.value',
        },
      ],
    },
    {
      id: 'inspect',
      label: 'Inspect',
      check: 'none',
      effects: [
        {
          id: 'note',
          target: { kind: 'counter', counterId: 'chill' },
          op: 'add',
          amount: '1',
        },
      ],
    },
  ],
};

const RECIPE = {
  id: 'r-blade',
  name: 'Blade',
  craftingSystemId: 'sys-it',
  iterative: {
    counters: [
      { counterId: 'heat', start: 2, startFormula: '1d4 + @min.heat', min: 1, max: 18, target: 12 },
      { counterId: 'ember', start: 3 },
      { counterId: 'chill', start: 0 },
    ],
    step: {
      actions: { mode: 'only', actionIds: ['stoke'] },
      hiddenCounterIds: [],
      success: [heatAtTen],
      failure: [],
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

function system(library) {
  return {
    id: 'sys-it',
    name: 'Forge',
    resolutionMode: 'iterative',
    features: { multiStepRecipes: false },
    craftingCheck: {
      routed: {
        type: 'fixed',
        rollFormula: '1d20',
        fixedOutcomes: [{ id: 'hit', name: 'Hit', success: true }],
      },
    },
    iterative: normalizeIterativeLibrary(library),
  };
}

/** The issues after `edit` mutates a copy of the library and the recipe. */
function issuesAfter(edit = () => {}) {
  const library = clone(LIBRARY);
  const recipe = clone(RECIPE);
  edit({ library, recipe });
  return evaluateIterativeReadiness(system(library), [new Recipe(recipe)]);
}

const has = (issues, code, kind = undefined) =>
  issues.some((i) => i.code === code && (!kind || i.kind === kind));
const stoke = (library) => library.actions[0];
const inspect = (library) => library.actions[1];

describe('the premise', () => {
  it('the corrected world raises nothing', () => {
    assert.deepEqual(issuesAfter(), []);
  });
});

/** Each case: the code, its kind, one minimal edit that raises it, and its corrected twin. */
const CASES = [
  [
    'iterativeInvalidExpression',
    'system',
    'a die in a cost',
    ({ library }) => {
      stoke(library).costs[0].amount = '1d4';
    },
    ({ library }) => {
      stoke(library).costs[0].amount = '4';
    },
  ],
  [
    'iterativeInvalidExpression',
    'system',
    '@check in a cost',
    ({ library }) => {
      stoke(library).costs[0].amount = '@check.value';
    },
    ({ library }) => {
      stoke(library).costs[0].amount = '@counter.heat';
    },
  ],
  [
    'iterativeInvalidExpression',
    'system',
    'an unfinished effect amount',
    ({ library }) => {
      stoke(library).effects[0].amount = '1 +';
    },
    ({ library }) => {
      stoke(library).effects[0].amount = '1 + 2';
    },
  ],
  [
    'iterativeInvalidExpression',
    'system',
    'an unknown function',
    ({ library }) => {
      stoke(library).effects[0].amount = 'nope(1)';
    },
    ({ library }) => {
      stoke(library).effects[0].amount = 'max(1, 2)';
    },
  ],
  [
    'iterativeInvalidExpression',
    'system',
    'a forbidden root',
    ({ library }) => {
      stoke(library).effects[0].amount = '@recipe.x';
    },
    ({ library }) => {
      stoke(library).effects[0].amount = '@abilities.x';
    },
  ],
  [
    'iterativeInvalidExpression',
    'system',
    'a dice count past 1000',
    ({ library }) => {
      stoke(library).effects[0].amount = '1001d6';
    },
    ({ library }) => {
      stoke(library).effects[0].amount = '1000d6';
    },
  ],
  [
    'iterativeInvalidExpression',
    'system',
    'a braced reserved root',
    ({ library }) => {
      stoke(library).effects[0].amount = '@{counter.heat}';
    },
    ({ library }) => {
      stoke(library).effects[0].amount = '@counter.heat';
    },
  ],
  [
    'iterativeInvalidExpression',
    'system',
    'a reserved root with extra segments',
    ({ library }) => {
      stoke(library).effects[0].amount = '@counter.heat.x';
    },
    ({ library }) => {
      stoke(library).effects[0].amount = '@counter.heat - 1';
    },
  ],
  [
    'iterativeInvalidExpression',
    'system',
    'an empty amount',
    ({ library }) => {
      stoke(library).effects[0].amount = '';
    },
    ({ library }) => {
      stoke(library).effects[0].amount = '0';
    },
  ],
  [
    'iterativeInvalidExpression',
    'recipe',
    'a start formula reading a counter',
    ({ recipe }) => {
      recipe.iterative.counters[0].startFormula = '@counter.heat';
    },
    ({ recipe }) => {
      recipe.iterative.counters[0].startFormula = '@max.heat';
    },
  ],
  [
    'iterativeInvalidExpression',
    'recipe',
    'an unfinished start formula',
    ({ recipe }) => {
      recipe.iterative.counters[0].startFormula = '1d4 +';
    },
    ({ recipe }) => {
      recipe.iterative.counters[0].startFormula = '1d4';
    },
  ],
  [
    'iterativeInvalidExpression',
    'recipe',
    'a start formula reading @check',
    ({ recipe }) => {
      recipe.iterative.counters[0].startFormula = '@check.value';
    },
    ({ recipe }) => {
      recipe.iterative.counters[0].startFormula = '2';
    },
  ],
  [
    'iterativeExplodeUnbounded',
    'system',
    'an effect exploding on every face',
    ({ library }) => {
      stoke(library).effects[0].amount = '1d6x>=1';
    },
    ({ library }) => {
      stoke(library).effects[0].amount = '1d6x>=2';
    },
  ],
  [
    'iterativeExplodeUnbounded',
    'system',
    'a one-faced exploding die',
    ({ library }) => {
      stoke(library).effects[0].amount = '1d1x';
    },
    ({ library }) => {
      stoke(library).effects[0].amount = '1d2x';
    },
  ],
  [
    'iterativeExplodeUnbounded',
    'recipe',
    'a start formula that cannot stop',
    ({ recipe }) => {
      recipe.iterative.counters[0].startFormula = '1d6x<=6';
    },
    ({ recipe }) => {
      recipe.iterative.counters[0].startFormula = '1d6x<=5';
    },
  ],
  [
    'iterativeUnknownCounter',
    'system',
    'an effect reading a counter the library lacks',
    ({ library }) => {
      stoke(library).effects[0].amount = '@counter.cold';
    },
    ({ library }) => {
      stoke(library).effects[0].amount = '@counter.heat';
    },
  ],
  [
    'iterativeUnknownCounter',
    'system',
    'a cost reading a bound of a counter the library lacks',
    ({ library }) => {
      stoke(library).costs[0].amount = '@max.cold';
    },
    ({ library }) => {
      stoke(library).costs[0].amount = '@max.heat';
    },
  ],
  [
    'iterativeUnknownCounter',
    'recipe',
    'an allowed action reading a counter with no instance',
    ({ recipe }) => {
      recipe.iterative.counters.splice(1, 1);
    },
    () => {},
  ],
  [
    'iterativeUnknownCounter',
    'recipe',
    'a start formula reading a target with no instance',
    ({ recipe }) => {
      recipe.iterative.counters[0].startFormula = '@target.cold';
    },
    ({ recipe }) => {
      recipe.iterative.counters[0].startFormula = '@target.heat';
    },
  ],
  [
    'iterativeExpressionBoundUnset',
    'recipe',
    'an effect reading an unset target',
    ({ library }) => {
      stoke(library).effects[0].amount = '@target.ember';
    },
    ({ library }) => {
      stoke(library).effects[0].amount = '@target.heat';
    },
  ],
  [
    'iterativeExpressionBoundUnset',
    'recipe',
    'a cost reading an unbounded maximum',
    ({ library }) => {
      stoke(library).costs[0].amount = '@max.chill';
    },
    ({ library }) => {
      stoke(library).costs[0].amount = '@max.heat';
    },
  ],
  [
    'iterativeExpressionBoundUnset',
    'recipe',
    'a start formula reading an unbounded minimum',
    ({ recipe }) => {
      recipe.iterative.counters[0].startFormula = '@min.chill';
    },
    ({ recipe }) => {
      recipe.iterative.counters[0].startFormula = '@min.ember';
    },
  ],
  [
    'iterativeExpressionBoundUnset',
    'recipe',
    'a perRecipe side the instance leaves unset',
    ({ library, recipe }) => {
      delete library.counters[0].max;
      delete recipe.iterative.counters[0].max;
      recipe.iterative.counters[0].startFormula = '@max.heat';
    },
    ({ recipe }) => {
      delete recipe.iterative.counters[0].max;
      recipe.iterative.counters[0].startFormula = '@max.heat';
    },
  ],
  [
    'iterativeCheckFactWithoutCheck',
    'system',
    'an effect reading @check.value',
    ({ library }) => {
      inspect(library).effects[0].amount = '@check.value';
    },
    ({ library }) => {
      inspect(library).effects[0].amount = '1';
    },
  ],
  [
    'iterativeCheckFactWithoutCheck',
    'system',
    'an effect keyed to an outcome',
    ({ library }) => {
      inspect(library).effects[0].when = { checkOutcomeIds: ['hit'] };
    },
    ({ library }) => {
      inspect(library).effects[0].when = { rules: [heatAtTen] };
    },
  ],
  [
    'iterativeCheckFactWithoutCheck',
    'system',
    'an effect keyed to success',
    ({ library }) => {
      inspect(library).effects[0].when = { success: true };
    },
    ({ library }) => {
      inspect(library).check = 'roll';
      inspect(library).effects[0].when = { success: true };
    },
  ],
  [
    'iterativeCheckFactWithoutCheck',
    'system',
    'an effect keyed to the check value',
    ({ library }) => {
      inspect(library).effects[0].when = { value: { op: '>', value: 3 } };
    },
    ({ library }) => {
      inspect(library).effects[0].when = { rules: [] };
    },
  ],
];

describe('each expression code fires on its minimal input and not on its corrected twin', () => {
  for (const [code, kind, name, fires, twin] of CASES) {
    it(`${code} (${kind}): ${name}`, () => {
      const raised = issuesAfter(fires);
      assert.ok(
        has(raised, code, kind),
        raised.map((i) => `${i.kind}:${i.code}`).join(', ') || 'no issue'
      );
      assert.equal(has(issuesAfter(twin), code, kind), false, 'the corrected twin raises it');
    });
  }

  it("a recipe whose step does not allow the action ignores that action's expressions", () => {
    const edit = ({ library, recipe }) => {
      stoke(library).effects[0].amount = '@target.ember + @counter.cold';
      recipe.iterative.counters.splice(1, 1);
      recipe.iterative.step.actions.actionIds = ['inspect'];
    };
    const issues = issuesAfter(edit);
    assert.equal(has(issues, 'iterativeExpressionBoundUnset'), false);
    assert.equal(has(issues, 'iterativeUnknownCounter', 'recipe'), false);
    assert.equal(has(issues, 'iterativeUnknownCounter', 'system'), true);
  });

  it('does not fire the check-fact warning for an action that rolls a check', () => {
    assert.equal(has(issuesAfter(), 'iterativeCheckFactWithoutCheck'), false);
  });
});

describe('severity and blocking', () => {
  const issueFor = (edit, code) => issuesAfter(edit).find((issue) => issue.code === code);

  it('makes a library expression issue critical with no block', () => {
    const issue = issueFor(({ library }) => {
      stoke(library).costs[0].amount = '1d4';
    }, 'iterativeInvalidExpression');
    assert.equal(issue.kind, 'system');
    assert.equal(issue.severity, 'critical');
    assert.equal(issue.blocks, undefined);
    assert.equal(issue.entityId, 'stoke');
  });

  it('makes a recipe expression issue critical and enable-blocking', () => {
    const edit = ({ recipe }) => {
      recipe.iterative.counters[0].startFormula = '1d4 +';
    };
    const issue = issueFor(edit, 'iterativeInvalidExpression');
    assert.equal(issue.kind, 'recipe');
    assert.equal(issue.severity, 'critical');
    assert.equal(issue.blocks, 'enable');
  });

  it('makes the check-fact issue a library warning with no block', () => {
    const issue = issueFor(({ library }) => {
      inspect(library).effects[0].amount = '@check.value';
    }, 'iterativeCheckFactWithoutCheck');
    assert.equal(issue.kind, 'system');
    assert.equal(issue.severity, 'warning');
    assert.equal(issue.blocks, undefined);
  });

  it('raises each code once per entity however many entries fail', () => {
    const edit = ({ library }) => {
      stoke(library).costs[0].amount = '1d4';
      stoke(library).effects[0].amount = '1 +';
    };
    const codes = issuesAfter(edit).filter((issue) => issue.code === 'iterativeInvalidExpression');
    assert.equal(codes.length, 1);
  });
});

describe('through evaluateSystemValidation', () => {
  const manager = new CraftingSystemManager({ getRecipes: () => [] });
  const library = clone(LIBRARY);
  stoke(library).costs[0].amount = '1d4';
  inspect(library).effects[0].amount = '@check.value';
  stoke(library).effects[0].amount = '1d6x>=1';
  const recipe = clone(RECIPE);
  recipe.iterative.counters[0].startFormula = '@counter.heat';
  const normalized = manager._normalizeSystem({
    id: 'sys-it',
    name: 'Forge',
    resolutionMode: 'iterative',
    components: [{ id: 'blade', name: 'Blade', difficulty: 2 }],
    iterative: library,
  });
  const NEW_CODES = new Set([
    'iterativeInvalidExpression',
    'iterativeExplodeUnbounded',
    'iterativeExpressionBoundUnset',
    'iterativeCheckFactWithoutCheck',
  ]);
  const issues = evaluateSystemValidation(normalized, {
    recipes: [new Recipe(recipe)],
    components: [],
  }).issues.filter((issue) => NEW_CODES.has(issue.code));

  it('the premise: every new code reaches the report', () => {
    assert.ok(has(issues, 'iterativeInvalidExpression', 'system'));
    assert.ok(has(issues, 'iterativeInvalidExpression', 'recipe'));
    assert.ok(has(issues, 'iterativeExplodeUnbounded', 'system'));
    assert.ok(has(issues, 'iterativeCheckFactWithoutCheck', 'system'));
  });

  it('gives each issue the full shape and English that is not its code', () => {
    for (const issue of issues) {
      assert.deepEqual(
        Object.keys(issue).sort((a, b) => a.localeCompare(b)),
        [
          'blocks',
          'code',
          'entityId',
          'entityKind',
          'entityName',
          'kind',
          'message',
          'nav',
          'severity',
        ]
      );
      assert.ok(['recipe', 'counter', 'action'].includes(issue.entityKind), issue.code);
      assert.ok(issue.message.length > 0 && issue.message !== issue.code, issue.code);
      assert.ok(/^[A-Z][^.]*\.$/u.test(issue.message), issue.message);
      assert.equal(issue.message, ITERATIVE_READINESS_MESSAGES[issue.code]);
      assert.equal(typeof issue.nav.view, 'string');
    }
  });
});

describe('iterativeStartBlockers over the expression codes', () => {
  const tag = (issue) => `${issue.code}@${issue.entityKind}:${issue.entityId}`;
  const blockers = (mode) => {
    const library = clone(LIBRARY);
    stoke(library).costs[0].amount = '1d4';
    inspect(library).effects[0].amount = '@check.value';
    const recipe = clone(RECIPE);
    recipe.iterative.counters[0].startFormula = '1 +';
    recipe.iterative.step.actions.mode = mode;
    const issues = evaluateIterativeReadiness(system(library), [new Recipe(recipe)]);
    return iterativeStartBlockers(issues, recipe).map(tag);
  };

  it('blocks on a critical expression code of the recipe and of an allowed action', () => {
    assert.deepEqual(blockers('only'), [
      'iterativeInvalidExpression@action:stoke',
      'iterativeInvalidExpression@recipe:r-blade',
    ]);
  });

  it('never blocks on the check-fact warning, even when its action is allowed', () => {
    assert.deepEqual(blockers('all'), [
      'iterativeInvalidExpression@action:stoke',
      'iterativeInvalidExpression@recipe:r-blade',
    ]);
  });
});
