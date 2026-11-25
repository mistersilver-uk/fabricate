/** The iterative library's pure GM model: minted ids, the Counter name rule, and usage. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { isIterativeId } from '../src/systems/iterative/counterRule.js';
import { ITERATIVE_EXPRESSION_PROFILES } from '../src/systems/iterative/expression.js';
import {
  actionCategoryNames,
  describeCategoryInput,
  editDistance,
  nearCategory,
} from '../src/ui/svelte/apps/manager/iterative/actionCategories.js';
import {
  actionLevelFaults,
  costFaults,
  effectFaults,
  expressionFaults,
  faultSentence,
  listEntryFaults,
  ruleFault,
} from '../src/ui/svelte/apps/manager/iterative/iterativeFieldFaults.js';
import {
  actionBlockingCounts,
  actionUses,
  counterNameFault,
  counterUses,
  deriveIterativeId,
  duplicateCounterIds,
  usageCounts,
} from '../src/ui/svelte/apps/manager/iterative/iterativeLibraryModel.js';

describe('deriveIterativeId', () => {
  it('derives a camelCase id from the label with a lower-case first character', () => {
    assert.equal(deriveIterativeId('Heat', 'counter'), 'heat');
    assert.equal(deriveIterativeId('  Iron ore  ', 'counter'), 'ironOre');
    assert.equal(deriveIterativeId('Heat (°C) level', 'counter'), 'heatCLevel');
    assert.equal(deriveIterativeId('HeatLevel', 'counter'), 'heatLevel');
    assert.equal(deriveIterativeId('Max HP', 'counter'), 'maxHp');
  });

  it('falls back to the list kind when the label has no ASCII letter or digit', () => {
    for (const kind of ['counter', 'action', 'cost', 'effect']) {
      assert.equal(deriveIterativeId('', kind), kind);
      assert.equal(deriveIterativeId('  ', kind), kind);
      assert.equal(deriveIterativeId('日本語 ✨', kind), kind);
    }
  });

  it('prefixes the fallback when the label starts with a digit', () => {
    assert.equal(deriveIterativeId('3 heat', 'counter'), 'counter3Heat');
    assert.equal(deriveIterativeId('42', 'effect'), 'effect42');
  });

  it('adds a numeric suffix until the id is unique in its list', () => {
    assert.equal(deriveIterativeId('Heat', 'counter', ['heat']), 'heat2');
    assert.equal(deriveIterativeId('Heat', 'counter', ['heat', 'heat2', 'heat3']), 'heat4');
    assert.equal(deriveIterativeId('', 'cost', ['cost', 'cost2']), 'cost3');
  });

  it('mints the same id for the same label and list, and always a valid id', () => {
    const labels = ['New counter', 'x', 'Über', '9', '___', 'A-b_c d', 'ABC', 'aBC'];
    for (const label of labels) {
      const id = deriveIterativeId(label, 'counter', ['abc']);
      assert.equal(id, deriveIterativeId(label, 'counter', ['abc']));
      assert.ok(isIterativeId(id), `${label} -> ${id}`);
    }
  });

  it('refuses a kind it has no fallback for', () => {
    assert.throws(() => deriveIterativeId('Heat', 'recipe'), /no iterative id fallback/);
  });
});

describe('the Counter name rule', () => {
  const counters = [
    { id: 'iron', label: 'Iron' },
    { id: 'heat', label: 'Heat' },
  ];

  it('refuses an empty name and a name another counter holds, ignoring case and space', () => {
    assert.equal(counterNameFault(counters, 'heat', ''), 'empty');
    assert.equal(counterNameFault(counters, 'heat', ' '.repeat(3)), 'empty');
    assert.equal(counterNameFault(counters, 'heat', ' iron '), 'duplicate');
    assert.equal(counterNameFault(counters, 'heat', 'IRON'), 'duplicate');
  });

  it('allows a counter its own name, including a change of case alone', () => {
    assert.equal(counterNameFault(counters, 'iron', 'Iron'), null);
    assert.equal(counterNameFault(counters, 'iron', 'IRON'), null);
    assert.equal(counterNameFault(counters, 'iron', 'Iron ore'), null);
  });

  it('finds the counters whose persisted names collide', () => {
    const persisted = [
      { id: 'a', label: 'Iron' },
      { id: 'b', label: ' iron ' },
      { id: 'c', label: 'Heat' },
      { id: 'd', label: '' },
      { id: 'e', label: '  ' },
    ];
    assert.deepEqual(
      [...duplicateCounterIds(persisted)].sort((a, b) => a.localeCompare(b)),
      ['a', 'b']
    );
    assert.deepEqual([...duplicateCounterIds(undefined)], []);
  });
});

const counterRule = (counterId) => ({ source: 'counter', counterId, op: '>=', value: 1 });
const previous = (...actionIds) => ({ source: 'previousAction', actionIds });

const LIBRARY = {
  version: 1,
  counters: [
    { id: 'heat', label: 'Heat', limit: 'none' },
    { id: 'ember', label: 'Ember', limit: 'none' },
    { id: 'idle', label: 'Idle', limit: 'none' },
  ],
  actions: [
    {
      id: 'stoke',
      label: 'Stoke',
      availability: { combine: 'all', rules: [counterRule('ember')] },
      costs: [{ id: 'cost', counterId: 'ember', amount: '1', needsEnough: true }],
      check: 'none',
      effects: [
        {
          id: 'warm',
          when: { combine: 'all', rules: [previous('inspect')] },
          target: { kind: 'counter', counterId: 'heat' },
          op: 'add',
          amount: '@max.ember',
        },
      ],
    },
    {
      id: 'inspect',
      label: 'Inspect',
      availability: { combine: 'all', rules: [] },
      costs: [],
      check: 'none',
      effects: [],
    },
    { id: 'broken', label: 'Broken', availability: 'nope', costs: 'nope', effects: null },
  ],
};

const RECIPES = [
  {
    id: 'r-blade',
    name: 'Blade',
    iterative: {
      counters: [{ counterId: 'heat' }],
      step: { actions: { mode: 'only', actionIds: ['stoke'] }, success: [counterRule('heat')] },
    },
  },
  {
    id: 'r-nails',
    name: 'Nails',
    iterative: { counters: [{ counterId: 'ember' }] },
    steps: [{ name: 'Cut' }, { name: 'Point' }],
  },
  {
    id: 'r-shield',
    name: 'Shield',
    steps: [
      {
        name: 'Frame',
        iterative: { actions: { mode: 'all', actionIds: [] }, hiddenCounterIds: ['idle'] },
      },
      {
        name: 'Rim',
        iterative: {
          actions: { mode: 'only', actionIds: ['inspect'] },
          success: [previous('stoke')],
        },
      },
    ],
  },
];

describe('counterUses', () => {
  it('names the actions that cost, target, rule on or read the counter', () => {
    assert.deepEqual(
      counterUses(LIBRARY, [], 'ember').actions.map((a) => a.id),
      ['stoke']
    );
    assert.deepEqual(
      counterUses(LIBRARY, [], 'heat').actions.map((a) => a.id),
      ['stoke']
    );
    assert.deepEqual(counterUses(LIBRARY, [], 'idle').actions, []);
  });

  it('counts every step of a recipe with an instance, and a step that names it in a rule', () => {
    const ember = counterUses(LIBRARY, RECIPES, 'ember');
    assert.deepEqual(
      ember.steps.map((s) => `${s.recipeId}#${s.stepIndex}`),
      ['r-nails#0', 'r-nails#1']
    );
    const heat = counterUses(LIBRARY, RECIPES, 'heat');
    assert.deepEqual(
      heat.steps.map((s) => `${s.recipeId}#${s.stepIndex}`),
      ['r-blade#0']
    );
    assert.deepEqual(usageCounts(heat), { actions: 1, steps: 1 });
  });

  it('counts a step that hides the counter', () => {
    const idle = counterUses(LIBRARY, RECIPES, 'idle');
    assert.deepEqual(idle.steps, [
      { recipeId: 'r-shield', recipeName: 'Shield', stepIndex: 0, stepName: 'Frame' },
    ]);
    assert.deepEqual(usageCounts(idle), { actions: 0, steps: 1 });
  });

  it('reads an absent library and malformed records without throwing', () => {
    assert.deepEqual(counterUses(undefined, undefined, 'heat'), { actions: [], steps: [] });
    assert.deepEqual(counterUses(LIBRARY, [null, {}, { steps: 'x' }], 'broken').steps, []);
  });
});

describe('actionUses', () => {
  it('names the actions whose rules hold a previous-action rule on it', () => {
    assert.deepEqual(
      actionUses(LIBRARY, [], 'inspect').actions.map((a) => a.id),
      ['stoke']
    );
    assert.deepEqual(actionUses(LIBRARY, [], 'stoke').actions, []);
  });

  it('names the steps whose allow-list or rules name it', () => {
    const stoke = actionUses(LIBRARY, RECIPES, 'stoke');
    assert.deepEqual(
      stoke.steps.map((s) => `${s.recipeId}#${s.stepIndex}`),
      ['r-blade#0', 'r-shield#1']
    );
    const inspect = actionUses(LIBRARY, RECIPES, 'inspect');
    assert.deepEqual(
      inspect.steps.map((s) => `${s.recipeId}#${s.stepIndex}`),
      ['r-shield#1']
    );
    assert.deepEqual(usageCounts(actionUses(LIBRARY, RECIPES, 'broken')), { actions: 0, steps: 0 });
  });

  it('does not count an allow-all step as naming an action', () => {
    assert.deepEqual(
      actionUses(LIBRARY, RECIPES, 'stoke').steps.some(
        (s) => s.stepIndex === 0 && s.recipeId === 'r-shield'
      ),
      false
    );
  });
});

describe('actionBlockingCounts', () => {
  const system = {
    resolutionMode: 'iterative',
    craftingCheck: {},
    iterative: {
      version: 1,
      counters: [{ id: 'heat', label: 'Heat', limit: 'none' }],
      actions: [
        {
          id: 'ok',
          label: 'Fine',
          availability: { combine: 'all', rules: [] },
          costs: [{ id: 'c', counterId: 'heat', amount: '1', needsEnough: true }],
          check: 'none',
          effects: [],
        },
        {
          id: 'lost',
          label: 'Lost',
          availability: { combine: 'all', rules: [] },
          costs: [{ id: 'c', counterId: 'gone', amount: '1', needsEnough: true }],
          check: 'none',
          effects: [],
        },
      ],
    },
  };

  it('counts the issues Validation reports on each action, and none for a clean one', () => {
    const counts = actionBlockingCounts(system, []);
    assert.equal(counts.get('lost'), 1);
    assert.ok(!counts.has('ok'));
  });

  it('reports nothing for a system that is not iterative or has no library', () => {
    assert.equal(actionBlockingCounts({ ...system, resolutionMode: 'simple' }, []).size, 0);
    assert.equal(actionBlockingCounts(null, undefined).size, 0);
  });
});

describe('the field marks of the Crafting Action editor', () => {
  const context = {
    counterIds: new Set(['heat']),
    actionIds: new Set(['strike']),
    tierIds: new Set(['hit']),
  };
  const text = (_key, fallback) => fallback;
  const codes = (faults) => faults.map((fault) => fault.code);

  it('judges an amount by its C3 profile, reason and the counters it reads', () => {
    assert.deepEqual(expressionFaults('2', 'cost', context), []);
    assert.deepEqual(expressionFaults('1d6', 'cost', context), [
      { code: 'iterativeInvalidExpression', reason: 'dice' },
    ]);
    assert.deepEqual(expressionFaults('@check.value', 'cost', context), [
      { code: 'iterativeInvalidExpression', reason: 'forbidden-root' },
    ]);
    assert.deepEqual(expressionFaults('@counter.ore', 'effect', context), [
      { code: 'iterativeUnknownCounter', reason: 'expression' },
    ]);
    assert.deepEqual(codes(expressionFaults('1d6x>=1', 'effect', context)), [
      'iterativeExplodeUnbounded',
    ]);
  });

  it('takes the start profile a recipe Counter Instance is judged under', () => {
    assert.ok(Object.hasOwn(ITERATIVE_EXPRESSION_PROFILES, 'start'));
    assert.deepEqual(expressionFaults('1d6', 'start', context), []);
    assert.deepEqual(expressionFaults('@counter.heat', 'start', context), [
      { code: 'iterativeInvalidExpression', reason: 'forbidden-root' },
    ]);
  });

  it('gives every C3 reason its own sentence, and each code one of its own', () => {
    const reasons = [
      'invalid',
      'dice',
      'forbidden-root',
      'unresolved-path',
      'non-finite',
      'explode-limit',
      'roll-unavailable',
    ];
    const sentences = reasons.map((reason) =>
      faultSentence({ code: 'iterativeInvalidExpression', reason }, text)
    );
    assert.equal(new Set(sentences).size, reasons.length);
    const coded = [
      'iterativeExplodeUnbounded',
      'iterativeUnknownCounter',
      'iterativeUnknownAction',
      'iterativeInvalidRule',
      'iterativeInvalidEntry',
      'iterativeUnknownCheckOutcome',
      'iterativeCheckFactWithoutCheck',
    ].map((code) => faultSentence({ code }, text));
    assert.equal(new Set([...coded, ...sentences]).size, coded.length + reasons.length);
  });

  it('marks a rule that does not parse, or names a counter or action the lists lack', () => {
    const ok = { source: 'counter', counterId: 'heat', op: '>=', value: 1 };
    assert.equal(ruleFault(ok, context), null);
    assert.equal(ruleFault({ source: 'counter' }, context).code, 'iterativeInvalidRule');
    assert.equal(ruleFault({ ...ok, counterId: 'ore' }, context).code, 'iterativeUnknownCounter');
    assert.equal(
      ruleFault({ source: 'previousAction', actionIds: ['ghost'] }, context).code,
      'iterativeUnknownAction'
    );
    assert.equal(ruleFault('rule', context).code, 'iterativeInvalidRule');
  });

  it('marks a cost and an effect once per fault, and skips the amount of an entry that does not parse', () => {
    const cost = { id: 'Bad id', counterId: 'ore', amount: '1d6' };
    const [entry] = listEntryFaults('cost', [cost]);
    assert.equal(entry, 'id');
    assert.deepEqual(codes(costFaults(cost, entry, context)), [
      'iterativeInvalidEntry',
      'iterativeUnknownCounter',
    ]);
    const fact = {
      id: 'e',
      when: {
        combine: 'all',
        success: true,
        checkOutcomeIds: ['ghost'],
        rules: [{ source: 'counter' }],
      },
      target: { kind: 'counter', counterId: 'heat' },
      op: 'add',
      amount: '1',
    };
    assert.deepEqual(codes(effectFaults(fact, { check: 'none' }, null, context)), [
      'iterativeInvalidRule',
      'iterativeUnknownCheckOutcome',
      'iterativeCheckFactWithoutCheck',
    ]);
    assert.equal(
      codes(effectFaults(fact, { check: 'roll' }, null, context)).at(-1),
      'iterativeUnknownCheckOutcome'
    );
  });

  it('marks an enum outside its set and a list that is not an array, under the field it belongs to', () => {
    const faults = actionLevelFaults({
      check: 'maybe',
      availability: { combine: 'some', rules: 'x' },
      costs: {},
      effects: [],
    });
    assert.deepEqual(
      faults.map((fault) => [fault.field, fault.reason]),
      [
        ['check', 'check'],
        ['availability', 'combine'],
        ['availability', 'list'],
        ['costs', 'list'],
      ]
    );
    const clean = {
      check: 'roll',
      availability: { combine: 'all', rules: [] },
      costs: [],
      effects: [],
    };
    assert.deepEqual(actionLevelFaults(clean), []);
  });
});

describe('the categories of a Crafting Action', () => {
  const actions = [
    { categories: ['Fire', 'Forging'] },
    { categories: ['forging', 'Smelting'] },
    {},
  ];
  const words = (_key, fallback) => fallback;

  it('unions the actions and the draft, each name once and case-folded', () => {
    assert.deepEqual(actionCategoryNames(actions, ['Tempering', 'fire']), [
      'Fire',
      'Forging',
      'Smelting',
      'Tempering',
    ]);
  });

  it('measures edit distance case-folded', () => {
    assert.equal(editDistance('Forging', 'forgin'), 1);
    assert.equal(editDistance('Fire', 'Fore'), 1);
    assert.equal(editDistance('abc', 'xyz'), 3);
  });

  it('blocks an exact repeat, offers a near name within two edits, and ignores the rest', () => {
    const names = ['Fire', 'Forging'];
    assert.deepEqual(nearCategory(' fire ', names), { name: 'Fire', exact: true });
    assert.deepEqual(nearCategory('Forgin', names), { name: 'Forging', exact: false });
    assert.equal(nearCategory('Tempering', names), null);
    assert.equal(describeCategoryInput('fire', names, words).blocked, true);
    const near = describeCategoryInput('Forgin', names, words);
    assert.deepEqual([near.blocked, near.message], [false, 'Did you mean Forging?']);
    assert.deepEqual(describeCategoryInput('', names, words), {
      tone: '',
      message: '',
      blocked: false,
    });
  });
});
