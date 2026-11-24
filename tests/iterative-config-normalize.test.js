/** The persisted iterative shape and its normalizers (`data-models` CraftingSystem 37, Recipe 19). */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { installFoundryEnv } from './helpers/foundryEnv.js';

installFoundryEnv();

const { CraftingSystemManager } = await import('../src/systems/CraftingSystemManager.js');
const { RecipeManager } = await import('../src/systems/RecipeManager.js');
const { Recipe } = await import('../src/models/Recipe.js');
const { snapshotRunTerms } = await import('../src/systems/runTerms.js');
const { normalizeComponent } = await import('../src/systems/normalize/components.js');
const {
  actionEntryFaults,
  ITERATIVE_LIBRARY_VERSION,
  iterativeEntryFault,
  normalizeIterativeLibrary,
} = await import('../src/systems/normalize/iterativeLibrary.js');
const { counterRuleFault } = await import('../src/systems/iterative/counterRule.js');
const {
  iterativeStepsOf,
  normalizeProducedWhen,
  producedWhenLineFault,
  normalizeRecipeIterative,
  normalizeStepIterative,
} = await import('../src/models/iterativeStepConfig.js');

const manager = new CraftingSystemManager(new RecipeManager({}));
const normalizeSystem = (system) => manager._normalizeSystem({ id: 'sys-it', ...system });
const recipeJson = (data) => new Recipe({ id: 'r-it', name: 'Iterative', ...data }).toJSON();

const RULE_HEAT = { source: 'counter', counterId: 'heat', op: '>=', value: 10 };
const WARM_EFFECT = { target: { kind: 'counter', counterId: 'heat' }, op: 'add', amount: '1' };

/** A library authored with one unknown key at every level. */
const NOISY_LIBRARY = {
  version: 1,
  junk: true,
  counters: [{ id: 'heat', label: ' Heat ', limit: 'perRecipe', min: 0, max: 20, junk: 1 }],
  actions: [
    {
      id: 'stoke',
      label: 'Stoke',
      junk: 1,
      availability: { combine: 'any', rules: [{ ...RULE_HEAT, junk: 1 }], junk: 1 },
      costs: [{ id: 'fuel', counterId: 'heat', amount: 2, needsEnough: false, junk: 1 }],
      check: 'roll',
      effects: [
        {
          id: 'warm',
          when: { combine: 'any', success: true, value: { op: '>', value: 3, junk: 1 }, junk: 1 },
          target: { kind: 'counter', counterId: 'heat', junk: 1 },
          op: 'add',
          amount: ' 1d4 ',
          junk: 1,
        },
      ],
    },
  ],
};

/** A recipe authored with one unknown key at every level, plus unparseable entries kept as authored. */
const NOISY_RECIPE = {
  iterative: {
    junk: 1,
    counters: [{ counterId: 'heat', start: 3, target: 15, junk: 1 }],
    step: {
      junk: 1,
      actions: { mode: 'only', actionIds: ['stoke'], junk: 1 },
      success: [RULE_HEAT, { source: 'mystery', counterId: 'heat', junk: 1 }],
      failure: [],
    },
  },
  ingredientSets: [{ id: 'set-1', ingredientGroups: [] }],
  resultGroups: [
    {
      id: 'g-1',
      name: 'Blade',
      results: [],
      producedWhen: [
        { end: 'success', rules: [RULE_HEAT], junk: 1 },
        { end: 'sideways', rules: [], junk: 1 },
      ],
    },
  ],
};

describe('the library normalizer', () => {
  it('drops every unknown key at every level and emits the defaults', () => {
    assert.deepEqual(normalizeSystem({ iterative: NOISY_LIBRARY }).iterative, {
      version: 1,
      counters: [{ id: 'heat', label: 'Heat', limit: 'perRecipe', min: 0, max: 20 }],
      actions: [
        {
          id: 'stoke',
          label: 'Stoke',
          categories: [],
          usesSession: true,
          availability: { combine: 'any', rules: [RULE_HEAT] },
          costs: [{ id: 'fuel', counterId: 'heat', amount: '2', needsEnough: false }],
          check: 'roll',
          effects: [
            {
              id: 'warm',
              when: { combine: 'any', success: true, value: { op: '>', value: 3 } },
              target: { kind: 'counter', counterId: 'heat' },
              op: 'add',
              amount: '1d4',
            },
          ],
        },
      ],
    });
  });

  it('emits every non-optional key at its default and omits the optional ones', () => {
    const library = normalizeIterativeLibrary({
      counters: [{ id: 'heat' }],
      actions: [
        {
          id: 'stoke',
          costs: [{ id: 'fuel', counterId: 'heat' }],
          effects: [{ id: 'warm', target: { kind: 'counter', counterId: 'heat' }, op: 'set' }],
        },
      ],
    });
    assert.equal(library.version, ITERATIVE_LIBRARY_VERSION, 'an absent version reads as 1');
    assert.deepEqual(library.counters, [{ id: 'heat', label: '', limit: 'none' }]);
    assert.deepEqual(library.actions[0], {
      id: 'stoke',
      label: '',
      categories: [],
      usesSession: true,
      availability: { combine: 'all', rules: [] },
      costs: [{ id: 'fuel', counterId: 'heat', amount: '', needsEnough: true }],
      check: 'none',
      effects: [
        {
          id: 'warm',
          when: { combine: 'all' },
          target: { kind: 'counter', counterId: 'heat' },
          op: 'set',
          amount: '',
        },
      ],
    });
  });

  it('normalizes an absent, null or non-object library to absent, persisting no key', () => {
    for (const iterative of [undefined, null, 'iterative', ['a']]) {
      assert.ok(!('iterative' in normalizeSystem({ iterative })), String(iterative));
    }
  });

  it('drops a malformed or repeated counter or action id, first kept, and mints none', () => {
    const library = normalizeIterativeLibrary({
      counters: [
        { id: 'heat', label: 'first' },
        { id: 'heat', label: 'second' },
        { id: 'Heat' },
        { label: 'none' },
      ],
      actions: [{ id: '1st' }, { id: 'stoke' }, { id: 'stoke', label: 'again' }, 'stoke'],
    });
    assert.deepEqual(
      library.counters.map((counter) => [counter.id, counter.label]),
      [['heat', 'first']]
    );
    assert.deepEqual(
      library.actions.map((action) => [action.id, action.label]),
      [['stoke', '']]
    );
  });

  it('keeps a cost or effect with a malformed or repeated id, with only its known keys', () => {
    const [action] = normalizeIterativeLibrary({
      actions: [
        {
          id: 'stoke',
          costs: [
            { id: 'fuel', counterId: 'heat', amount: '1' },
            { id: 'fuel', counterId: 'heat', amount: '2', junk: 1 },
            { id: 'Bad id', counterId: 'heat' },
          ],
          effects: [
            { counterId: 'heat', op: 'add', junk: 1 },
            { id: 'warm', target: { kind: 'aura' }, op: 'add' },
          ],
        },
      ],
    }).actions;
    assert.deepEqual(action.costs, [
      { id: 'fuel', counterId: 'heat', amount: '1', needsEnough: true },
      { id: 'fuel', counterId: 'heat', amount: '2' },
      { id: 'Bad id', counterId: 'heat' },
    ]);
    assert.deepEqual(action.effects, [
      { op: 'add' },
      { id: 'warm', target: { kind: 'aura' }, op: 'add' },
    ]);
  });

  it('keeps an out-of-enum check, limit or combine as authored, never defaulting it', () => {
    const library = normalizeIterativeLibrary({
      counters: [{ id: 'heat', limit: 'unbounded' }],
      actions: [{ id: 'stoke', check: 'always', availability: { combine: 'most' } }],
    });
    assert.equal(library.counters[0].limit, 'unbounded');
    assert.equal(library.actions[0].check, 'always');
    assert.equal(library.actions[0].availability.combine, 'most');
  });

  it('keeps a mistyped when key as authored, so the effect never widens', () => {
    const effect = { id: 'warm', target: { kind: 'counter', counterId: 'heat' }, op: 'add' };
    const whens = [
      { success: 'true', junk: 1 },
      { checkOutcomeIds: 'hit' },
      { rules: { source: 'sessionCount', op: '<', value: 3 } },
      { checkOutcomeIds: [5, null] },
    ];
    const [action] = normalizeIterativeLibrary({
      actions: [
        { id: 'stoke', effects: whens.map((when, i) => ({ ...effect, id: `e${i}`, when })) },
      ],
    }).actions;
    assert.deepEqual(
      action.effects.map((kept) => kept.when),
      [
        { success: 'true' },
        { checkOutcomeIds: 'hit' },
        { rules: whens[2].rules },
        { checkOutcomeIds: [5, null] },
      ]
    );
  });

  it('keeps a present non-array availability rule list, cost list or effect list as authored', () => {
    const [kept, opaque] = normalizeIterativeLibrary({
      actions: [
        {
          id: 'stoke',
          availability: { rules: { source: 'counter', counterId: 'heat', op: '>', value: 1 } },
          costs: {},
          effects: 'warm',
        },
        { id: 'quench', availability: 'locked' },
      ],
    }).actions;
    assert.deepEqual(kept.availability.rules, {
      source: 'counter',
      counterId: 'heat',
      op: '>',
      value: 1,
    });
    assert.deepEqual([kept.costs, kept.effects], [{}, 'warm']);
    assert.equal(opaque.availability, 'locked');
  });

  it('normalizes a present non-finite or blank bound to null and leaves an absent one absent', () => {
    const [counter, blank] = normalizeIterativeLibrary({
      counters: [
        { id: 'heat', min: 'lots', max: NaN },
        { id: 'cold', min: '  ', max: ' 4 ' },
      ],
    }).counters;
    assert.deepEqual(counter, { id: 'heat', label: '', limit: 'none', min: null, max: null });
    assert.deepEqual(blank, { id: 'cold', label: '', limit: 'none', min: null, max: 4 });
  });

  it('keeps a library whose version is above this build verbatim', () => {
    const future = { version: 2, counters: [{ id: 'heat', aura: 'blue' }], futureKey: { a: 1 } };
    assert.deepEqual(normalizeSystem({ iterative: future }).iterative, future);
  });
});

describe('the counter rule normalizer', () => {
  it('keeps every unparseable rule with only its known keys', () => {
    const step = normalizeStepIterative({
      success: [
        { source: 'mystery', counterId: 'heat', junk: 1 },
        { source: 'counter', counterId: 'heat', op: '!=', value: 1 },
        { source: 'counter', op: '>=', value: 1 },
        { source: 'sessionCount', op: '<', value: 'many' },
        { source: 'previousAction', actionIds: [] },
        { source: 'previousAction', actionIds: ['Stoke'] },
        { source: 'previousAction', actionIds: ['stoke', 5] },
        null,
      ],
    });
    assert.deepEqual(step.success, [
      { source: 'mystery', counterId: 'heat' },
      { source: 'counter', counterId: 'heat', op: '!=', value: 1 },
      { source: 'counter', op: '>=', value: 1 },
      { source: 'sessionCount', op: '<', value: 'many' },
      { source: 'previousAction', actionIds: [] },
      { source: 'previousAction', actionIds: ['Stoke'] },
      { source: 'previousAction', actionIds: ['stoke', 5] },
      {},
    ]);
  });

  it('rebuilds each parseable source with only its own keys', () => {
    const step = normalizeStepIterative({
      failure: [
        { source: 'sessionCount', counterId: 'heat', op: '>', value: '3', actionIds: ['x'] },
        { source: 'previousAction', actionIds: ['stoke', 'stoke'], op: '=' },
      ],
    });
    assert.deepEqual(step.failure, [
      { source: 'sessionCount', op: '>', value: 3 },
      { source: 'previousAction', actionIds: ['stoke'] },
    ]);
  });
});

describe('the fault helpers name why an entry is kept as authored', () => {
  it('counterRuleFault is null for every well-formed source and names the first fault', () => {
    for (const rule of [
      RULE_HEAT,
      { source: 'sessionCount', op: '=', value: 0 },
      { source: 'previousAction', actionIds: ['stoke'] },
    ]) {
      assert.equal(counterRuleFault(rule), null, rule.source);
    }
    assert.deepEqual(
      [
        null,
        { source: 'mystery' },
        { source: 'previousAction', actionIds: [] },
        { source: 'counter', counterId: 'Heat', op: '>=', value: 1 },
        { source: 'counter', counterId: 'heat', op: '!=', value: 1 },
        { source: 'sessionCount', op: '<', value: 'many' },
      ].map(counterRuleFault),
      ['rule', 'source', 'actionIds', 'counterId', 'op', 'value']
    );
  });

  it('iterativeEntryFault and producedWhenLineFault name the fault of an entry or a line', () => {
    const effect = { id: 'warm', target: { kind: 'counter', counterId: 'heat' }, op: 'add' };
    assert.equal(iterativeEntryFault('cost', { id: 'fuel', counterId: 'heat', amount: 1 }), null);
    assert.equal(iterativeEntryFault('cost', { id: 'fuel', amount: '1' }), 'counterId');
    assert.equal(
      iterativeEntryFault('cost', { id: 'fuel', counterId: 'heat', amount: {} }),
      'amount'
    );
    assert.equal(iterativeEntryFault('effect', effect), null);
    assert.equal(iterativeEntryFault('effect', { ...effect, id: 'Warm' }), 'id');
    assert.equal(iterativeEntryFault('effect', { ...effect, target: { kind: 'aura' } }), 'target');
    assert.equal(iterativeEntryFault('effect', { ...effect, op: 'multiply' }), 'op');
    assert.equal(iterativeEntryFault('effect', { ...effect, when: { combine: 'most' } }), 'when');
    for (const when of [
      { success: 'true' },
      { checkOutcomeIds: 'hit' },
      { checkOutcomeIds: ['hit', 5] },
      { checkOutcomeIds: ['  '] },
      { rules: {} },
    ]) {
      assert.equal(
        iterativeEntryFault('effect', { ...effect, when }),
        'when',
        JSON.stringify(when)
      );
    }
    assert.equal(iterativeEntryFault('effect', { ...effect, when: { checkOutcomeIds: [] } }), null);
    assert.equal(producedWhenLineFault({ end: 'success' }), null);
    assert.equal(producedWhenLineFault({ end: 'sideways' }), 'end');
    assert.equal(producedWhenLineFault({ end: 'failure', rules: {} }), 'rules');
    assert.equal(producedWhenLineFault('success'), 'line');
  });

  it('actionEntryFaults reports a repeated id as a fault the single-entry helper cannot see', () => {
    const cost = { id: 'fuel', counterId: 'heat', amount: '1' };
    const faults = actionEntryFaults({ costs: [cost, cost], effects: [{ id: 'warm' }] });
    assert.deepEqual(
      faults.map(({ kind, fault }) => [kind, fault]),
      [
        ['cost', 'id'],
        ['effect', 'target'],
      ]
    );
  });
});

describe('iterativeStepsOf', () => {
  const step = { success: [RULE_HEAT] };
  const groups = [
    { id: 'g-ok', name: 'Blade', results: [], producedWhen: [{ end: 'success' }] },
    { id: 'g-fail', name: 'Slag', role: 'failure', results: [] },
  ];

  it('gives the implicit single step the recipe-level groups and Recipe.iterative.step', () => {
    const recipe = new Recipe({ iterative: { counters: [], step }, resultGroups: groups });
    const expected = [
      {
        stepIndex: 0,
        iterative: normalizeStepIterative(step),
        resultGroups: [
          { id: 'g-ok', producedWhen: [{ end: 'success', rules: [] }] },
          { id: 'g-fail', role: 'failure' },
        ],
      },
    ];
    assert.deepEqual(iterativeStepsOf(recipe), expected);
    assert.deepEqual(iterativeStepsOf(recipe.toJSON()), expected);
  });

  it('gives each explicit step its own index, configuration and groups', () => {
    const recipe = new Recipe({
      steps: [{ id: 's-1', iterative: step, resultGroups: groups }, { id: 's-2' }],
    });
    const views = iterativeStepsOf(recipe);
    assert.deepEqual(
      views.map(({ stepIndex, iterative, resultGroups }) => [
        stepIndex,
        Boolean(iterative),
        resultGroups.map((group) => group.id),
      ]),
      [
        [0, true, ['g-ok', 'g-fail']],
        [1, false, []],
      ]
    );
    assert.deepEqual(iterativeStepsOf(recipe.toJSON()), views);
  });
});

describe('the recipe and step normalizers', () => {
  it('emits the step and Counter Instance defaults', () => {
    assert.deepEqual(normalizeRecipeIterative({ counters: [{ counterId: 'heat' }], step: {} }), {
      counters: [{ counterId: 'heat', start: 0, visible: true }],
      step: {
        actions: { mode: 'all', actionIds: [] },
        hiddenCounterIds: [],
        lockedCounterIds: [],
        success: [],
        failure: [],
      },
    });
  });

  it('drops a malformed or repeated Counter Instance, first kept', () => {
    const iterative = normalizeRecipeIterative({
      counters: [
        { counterId: 'heat', start: 1 },
        { counterId: 'heat', start: 2 },
        { counterId: 'bad id' },
        {},
      ],
    });
    assert.deepEqual(iterative.counters, [{ counterId: 'heat', start: 1, visible: true }]);
  });

  it('nulls a present startFormula that is not an expression, and keeps a persisted null', () => {
    const counters = normalizeRecipeIterative({
      counters: [{}, true, NaN, null].map((startFormula, i) => ({
        counterId: `c${i}`,
        startFormula,
      })),
    }).counters;
    assert.deepEqual(
      counters.map((instance) => instance.startFormula),
      [null, null, null, null]
    );
  });

  it('keeps start under a formula, drops an empty formula, and nulls a non-finite number', () => {
    const [formula, empty, broken] = normalizeRecipeIterative({
      counters: [
        { counterId: 'heat', start: 4, startFormula: ' 1d6 ' },
        { counterId: 'cold', startFormula: '  ' },
        {
          counterId: 'rust',
          start: '  ',
          min: null,
          max: NaN,
          target: 'high',
          visible: false,
        },
      ],
    }).counters;
    assert.deepEqual(formula, { counterId: 'heat', start: 4, startFormula: '1d6', visible: true });
    assert.deepEqual(empty, { counterId: 'cold', start: 0, visible: true });
    assert.deepEqual(broken, {
      counterId: 'rust',
      start: null,
      min: null,
      max: null,
      target: null,
      visible: false,
    });
  });

  it('keeps an out-of-enum actions.mode as authored', () => {
    assert.equal(normalizeStepIterative({ actions: { mode: 'some' } }).actions.mode, 'some');
  });

  it('normalizes an absent, null or empty producedWhen to absent, and keeps an unparseable line', () => {
    assert.equal(normalizeProducedWhen(undefined), null);
    assert.equal(normalizeProducedWhen(null), null);
    assert.equal(normalizeProducedWhen([]), null);
    assert.deepEqual(
      normalizeProducedWhen([{ end: 'success' }, { end: 'never', rules: 'x', junk: 1 }]),
      [
        { end: 'success', rules: [] },
        { end: 'never', rules: 'x' },
      ]
    );
  });

  it('leaves an absent or null iterative, Step.iterative or producedWhen absent on the recipe', () => {
    for (const absent of [undefined, null]) {
      const json = recipeJson({
        iterative: absent,
        steps: [
          { id: 's-1', iterative: absent, resultGroups: [{ id: 'g', producedWhen: absent }] },
        ],
        resultGroups: [{ id: 'g-1', producedWhen: [] }],
      });
      assert.ok(!('iterative' in json));
      assert.ok(!('iterative' in json.steps[0]));
      assert.ok(!('producedWhen' in json.steps[0].resultGroups[0]));
      assert.ok(!('producedWhen' in json.resultGroups[0]));
    }
  });

  it('drops Recipe.iterative.step on a multi-step recipe, and carries it on the implicit step', () => {
    const step = { actions: { mode: 'only', actionIds: ['stoke'] }, success: [RULE_HEAT] };
    const multi = new Recipe({
      iterative: { counters: [{ counterId: 'heat' }], step },
      steps: [{ id: 's-1', iterative: step }, { id: 's-2' }],
    });
    assert.ok(!('step' in multi.iterative));
    assert.deepEqual(
      iterativeStepsOf(multi).map(({ iterative }) => iterative),
      [normalizeStepIterative(step), null]
    );

    const single = new Recipe({ iterative: { counters: [{ counterId: 'heat' }], step } });
    assert.deepEqual(single.getExecutionSteps()[0].iterative, single.iterative.step);
    for (const recipe of [single, multi]) {
      assert.deepEqual(iterativeStepsOf(recipe.toJSON()), iterativeStepsOf(recipe));
    }
  });

  it('emits deep clones, so the terms snapshot carries recipe and step configuration', () => {
    const step = { success: [RULE_HEAT] };
    const recipe = new Recipe({
      iterative: { counters: [{ counterId: 'heat' }] },
      steps: [
        {
          id: 's-1',
          iterative: step,
          resultGroups: [{ id: 'g', producedWhen: [{ end: 'success' }] }],
        },
      ],
    });
    const json = recipe.toJSON();
    assert.notEqual(json.iterative, recipe.iterative);
    assert.notEqual(json.steps[0].iterative, recipe.steps[0].iterative);
    const snapshot = snapshotRunTerms(recipe, { craftingCheck: null }).recipe;
    assert.deepEqual(snapshot.iterative, {
      counters: [{ counterId: 'heat', start: 0, visible: true }],
    });
    assert.deepEqual(snapshot.steps[0].iterative.success, [RULE_HEAT]);
    assert.deepEqual(snapshot.steps[0].resultGroups[0].producedWhen, [
      { end: 'success', rules: [] },
    ]);
  });

  it('drops producedWhen from a salvage group', () => {
    const component = normalizeComponent(
      {
        id: 'ore',
        salvage: {
          enabled: true,
          resultGroups: [
            { id: 'sg', name: 'Shards', results: [], producedWhen: [{ end: 'success' }] },
          ],
        },
      },
      { salvageResolutionMode: 'routed' }
    );
    assert.equal(component.salvage.resultGroups.length, 1, 'the premise: the group survived');
    assert.ok(!('producedWhen' in component.salvage.resultGroups[0]));
  });
});

describe('normalization is idempotent across the corpus', () => {
  const systems = [
    { iterative: NOISY_LIBRARY },
    { iterative: { version: 2, counters: 'opaque' } },
    {
      iterative: {
        actions: [
          {
            id: 'stoke',
            costs: [{ id: 'x', counterId: 'Bad' }, { id: 'x' }],
            effects: [
              {
                id: 'warm',
                when: { combine: 'odd', value: 7, rules: [{ source: 'x' }] },
                op: 'add',
              },
            ],
          },
        ],
      },
    },
    {
      iterative: {
        actions: [
          {
            id: 'stoke',
            availability: { rules: { source: 'counter', junk: 1 } },
            costs: { fuel: 1 },
            effects: [
              { ...WARM_EFFECT, id: 'a', when: { success: 'yes', value: { op: '>', junk: 1 } } },
              { ...WARM_EFFECT, id: 'b', when: { checkOutcomeIds: 'hit', junk: 1 } },
              { ...WARM_EFFECT, id: 'c', when: { rules: { source: 'x' } } },
              { ...WARM_EFFECT, id: 'd', when: { rules: [{ source: 'x', junk: 1 }], success: 1 } },
              { ...WARM_EFFECT, id: 'e', when: { checkOutcomeIds: ['hit', 7, ''] } },
            ],
          },
          { id: 'quench', availability: ['locked'], effects: 'warm' },
        ],
      },
    },
  ];
  const recipes = [
    NOISY_RECIPE,
    {
      iterative: {
        counters: [
          { counterId: 'heat', start: NaN, startFormula: 2 },
          { counterId: 'cold', start: ' ', startFormula: {} },
          { counterId: 'rust', startFormula: null },
        ],
        step: { actions: { mode: 'some' } },
      },
      steps: [
        {
          id: 's-1',
          iterative: {
            success: [null],
            failure: [{ source: 'previousAction', actionIds: ['stoke', 5, ' '] }],
          },
          resultGroups: [{ id: 'g', producedWhen: [null] }],
        },
      ],
    },
  ];

  it('normalize(normalize(x)) deep-equals normalize(x) for systems', () => {
    for (const system of systems) {
      const once = normalizeSystem(system);
      assert.deepEqual(normalizeSystem(JSON.parse(JSON.stringify(once))), once);
    }
  });

  it('normalize(normalize(x)) deep-equals normalize(x) for recipes', () => {
    for (const recipe of recipes) {
      const once = recipeJson(recipe);
      assert.deepEqual(recipeJson(JSON.parse(JSON.stringify(once))), once);
    }
  });

  it('keeps the noisy recipe unparseable entries with only their known keys', () => {
    const json = recipeJson(NOISY_RECIPE);
    assert.deepEqual(json.iterative.step.success[1], { source: 'mystery', counterId: 'heat' });
    assert.deepEqual(json.resultGroups[0].producedWhen, [
      { end: 'success', rules: [RULE_HEAT] },
      { end: 'sideways', rules: [] },
    ]);
    assert.deepEqual(json.iterative.counters, [
      { counterId: 'heat', start: 3, target: 15, visible: true },
    ]);
  });
});
