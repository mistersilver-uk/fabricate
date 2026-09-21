/**
 * A result group on a non-terminal step of a multi-step recipe may be empty (issue 1907): the step
 * costs time, materials and a check while awarding nothing. The terminal step, an implicit
 * single-step recipe and an explicit one-step recipe keep the original contents rule.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

let idSeq = 0;
globalThis.foundry = {
  utils: {
    randomID: () => `rid-${++idSeq}`,
    getProperty: (obj, path) =>
      String(path || '')
        .split('.')
        .reduce((value, key) => value?.[key], obj),
  },
};
globalThis.game = { user: { isGM: true }, fabricate: {} };
globalThis.ui = { notifications: { info: () => {}, warn: () => {}, error: () => {} } };

const { Recipe } = await import('../src/models/Recipe.js');
const { RecipeManager } = await import('../src/systems/RecipeManager.js');

const ingredientSets = (index) => [
  {
    id: `set-${index}`,
    ingredientGroups: [
      {
        id: `group-${index}`,
        options: [{ id: `ingredient-${index}`, itemUuid: `Item.ingredient-${index}`, quantity: 1 }],
      },
    ],
    essences: {},
  },
];

/** One step: `results` false gives a present-but-empty result group, `null` gives no group at all. */
const step = (index, { results = true, group = {} } = {}) => ({
  id: `step-${index}`,
  name: `Step ${index}`,
  ingredientSets: ingredientSets(index),
  resultGroups:
    results === null
      ? []
      : [
          {
            id: `rg-${index}`,
            name: `Group ${index}`,
            ...group,
            results: results
              ? [{ id: `result-${index}`, itemUuid: `Item.result-${index}`, quantity: 1 }]
              : [],
          },
        ],
});

const recipe = (steps) =>
  new Recipe({ id: `recipe-${++idSeq}`, name: 'Layered Blade', craftingSystemId: 'sys-1', steps });

const codesAt = (validation, code) =>
  validation.issues.filter((issue) => issue.code === code).map((issue) => issue.params.location);

describe('empty result groups on a non-terminal step (issue 1907)', () => {
  it('accepts a two-step recipe whose first step awards nothing', () => {
    const validation = recipe([step(1, { results: false }), step(2)]).validate();
    assert.ok(validation.valid, `expected valid, got: ${validation.errors.join(' | ')}`);
  });

  it('still reports an empty group on the terminal step', () => {
    const validation = recipe([step(1), step(2, { results: false })]).validate();
    assert.deepEqual(codesAt(validation, 'resultGroupEmpty'), ['Step "Step 2"']);
  });

  it('still reports an empty group on an implicit single-step recipe', () => {
    const implicit = new Recipe({
      id: 'recipe-implicit',
      name: 'Implicit',
      craftingSystemId: 'sys-1',
      ingredientSets: ingredientSets(1),
      resultGroups: [{ id: 'rg-implicit', name: 'Group', results: [] }],
    });
    assert.deepEqual(codesAt(implicit.validate(), 'resultGroupEmpty'), ['Recipe']);
  });

  it('accepts empty groups on every step but the terminal one', () => {
    const validation = recipe([
      step(1, { results: false }),
      step(2, { results: false }),
      step(3),
    ]).validate();
    assert.ok(validation.valid, `expected valid, got: ${validation.errors.join(' | ')}`);
  });

  it('never reports resultGroupEmpty from validateStructure in any of those shapes', () => {
    const shapes = [
      recipe([step(1, { results: false }), step(2)]),
      recipe([step(1), step(2, { results: false })]),
      recipe([step(1, { results: false })]),
    ];
    for (const shape of shapes) {
      assert.deepEqual(codesAt(shape.validateStructure(), 'resultGroupEmpty'), []);
    }
  });

  it('leaves the reserved failure-role exemption unchanged on the terminal step', () => {
    const validation = recipe([
      step(1, { results: false }),
      { ...step(2), resultGroups: [...step(2).resultGroups, { id: 'rg-fail', role: 'failure', results: [] }] },
    ]).validate();
    assert.deepEqual(codesAt(validation, 'resultGroupEmpty'), []);
  });

  it('still reports a step with no result group at all', () => {
    const validation = recipe([step(1, { results: null }), step(2)]).validate();
    const missing = validation.issues
      .filter((issue) => issue.code === 'stepMissingResultGroup')
      .map((issue) => issue.params.step);
    assert.deepEqual(missing, ['Step 1']);
  });

  it('keys the relaxation on step position, not on checkOutcomeIds', () => {
    const routed = { group: { checkOutcomeIds: ['outcome-success'] } };
    const intermediate = recipe([step(1, { results: false, ...routed }), step(2)]).validate();
    assert.deepEqual(codesAt(intermediate, 'resultGroupEmpty'), []);
    const terminal = recipe([step(1), step(2, { results: false, ...routed })]).validate();
    assert.deepEqual(codesAt(terminal, 'resultGroupEmpty'), ['Step "Step 2"']);
  });

  it('still validates a non-terminal step for everything EXCEPT emptiness', () => {
    // Only the CONTENTS rule is relaxed on an earlier step. If the validator stopped visiting
    // non-terminal steps altogether this duplicate would go unreported.
    const clash = {
      ...step(1, { results: false }),
      resultGroups: [
        { id: 'rg-clash', name: 'One', results: [] },
        { id: 'rg-clash', name: 'Two', results: [] },
      ],
    };
    const validation = recipe([clash, step(2)]).validate();
    assert.deepEqual(codesAt(validation, 'resultGroupDuplicate'), ['Step "Step 1"']);
    assert.deepEqual(codesAt(validation, 'resultGroupEmpty'), [], 'emptiness is still waived');
  });

  it('lets RecipeManager ACTIVATE a recipe whose first step awards nothing', () => {
    const manager = new RecipeManager();
    const accepted = manager.canActivateRecipe(recipe([step(1, { results: false }), step(2)]));
    assert.ok(accepted.valid, `expected activation, got: ${accepted.errors.join(' | ')}`);

    const refused = manager.canActivateRecipe(recipe([step(1), step(2, { results: false })]));
    assert.equal(refused.valid, false, 'an empty TERMINAL group still refuses activation');
    assert.ok(
      refused.issues.some((issue) => issue.code === 'resultGroupEmpty'),
      'and says why'
    );
  });

  it('still reports an empty group on an explicit one-step recipe', () => {
    const validation = recipe([step(1, { results: false })]).validate();
    assert.deepEqual(codesAt(validation, 'resultGroupEmpty'), ['Step "Step 1"']);
  });
});
